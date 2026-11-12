// avatar-brain.js – UN cerveau commun pour tous les avatars (Oliver, Pluie, et ceux qui viendront).
//
// Le prompt est construit AUTOMATIQUEMENT à partir du registre :
//   • les capacités (registry.registerCapability)   • les lieux connus / cachés   • les objets du lieu
//   • l'annuaire et les messages reçus              • les demandes de course, etc.
// Donc quand tu ajoutes une nouvelle fonctionnalité au jeu et que tu l'enregistres comme capacité,
// les avatars la connaissent à leur prochaine réflexion, sans toucher à ce fichier.
//
// Un seul avatar réfléchit à la fois (file d'attente) pour ne pas saturer le Worker / le quota Groq.

import { THERAPIST_CONFIG } from './therapist-config.js';

const textCache = {};
async function fetchText(path) {
    if (path in textCache) return textCache[path];
    let t = '';
    try { const r = await fetch(path); if (r.ok) t = await r.text(); } catch (e) { /* fichier absent : pas grave */ }
    textCache[path] = t;
    return t;
}

// Appel par défaut : même requête que le cerveau d'Evelyn (system, messages, model) -> { text }.
// Remplaçable : society.setLLM(async ({ system, user, id }) => '...texte...')
async function defaultLLM(o) {
    const cfg = THERAPIST_CONFIG || {};
    if (!cfg.proxyUrl) throw new Error('pas de proxyUrl');
    const body = { system: o.system, messages: [{ role: 'user', content: o.user }], max_tokens: 400, temperature: 0.9, avatar: o.id };
    if (cfg.model) body.model = cfg.model;
    const r = await fetch(cfg.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('worker ' + r.status);
    const j = await r.json();
    return String(j.text || '');
}

export function parsePlan(raw) {
    raw = String(raw || '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
        const j = JSON.parse(raw.slice(a, b + 1));
        const acts = Array.isArray(j.actions) ? j.actions : (j.do ? [j] : []);
        return { thought: String(j.thought || '').slice(0, 200), actions: acts.filter(function (x) { return x && x.do; }).slice(0, 3) };
    } catch (e) { return null; }
}

export function createBrainSystem(R, M, opts) {
    opts = opts || {};
    const cfg = Object.assign({ avatarThinkSec: 120, avatarMinGapSec: 12, avatarsEnabled: true }, THERAPIST_CONFIG || {});
    let llm = opts.llm || defaultLLM;
    let enabled = cfg.avatarsEnabled !== false;
    let running = false;                 // un seul appel à la fois
    let lastCall = 0, failures = 0, backoffUntil = 0;
    const brains = [];
    const providers = {};      // texte en plus pour un avatar (ex. les notes privées d'Evelyn sur le joueur)
    const gameTime = function () { try { return window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : ''; } catch (e) { return ''; } };

    function describePlace(id) { const p = R.place(id); return p ? p.name + (p.desc ? ' (' + p.desc + ')' : '') : id; }

    async function buildSystem(actor) {
        const shared = await fetchText('avatars/_shared/world.txt');
        const own = await fetchText('avatars/' + actor.id + '/brain/context.txt');
        let extra = '';
        try { extra = providers[actor.id] ? String(providers[actor.id]() || '') : ''; } catch (e) { extra = ''; }
        const caps = R.capabilities(actor).map(function (c) { return '- ' + c.id + (c.args ? ' ' + c.args : '') + ' : ' + c.desc; }).join('\n');
        const dir = R.directory().filter(function (d) { return d.id !== actor.id; }).map(function (d) {
            const a = R.actor(d.id);
            return '- ' + d.name + ' : ' + d.number + (a && a.external ? ' (answers only when she feels like it)' : '');
        }).join('\n');
        return [
            shared.trim(),
            own.trim(),
            extra.trim(),
            'You are ' + actor.name + '. Your phone number is ' + actor.number + '. You have the same abilities as the player: you move, open doors, write, drive.',
            'WHAT YOU CAN DO (the only actions that exist):\n' + caps,
            'PEOPLE YOU CAN WRITE TO:\n' + dir,
            'Answer with ONE JSON object and nothing else: {"thought":"short private thought","actions":[{"do":"action_id", ...args}]}. ' +
            'At most 3 actions. Use {"do":"wait"} when you want to do nothing. Messages and speech are written in the language of the person you address (English by default). Never invent places, people or actions that are not listed.'
        ].filter(Boolean).join('\n\n');
    }

    function buildPerception(actor) {
        const here = R.place(actor.loc);
        const L = [];
        L.push('Real time: ' + new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (gameTime() ? ' | Game time: ' + gameTime() : ''));
        L.push('You are at: ' + describePlace(actor.loc) + (here && here.floor !== null ? ', floor ' + here.floor : '') + '.');
        if (actor.job) L.push('You are on duty as: ' + actor.job + '.');
        const others = R.actorsAt(actor.loc, actor.id).map(function (a) { return a.name; });
        L.push('Here with you: ' + (others.length ? others.join(', ') : 'nobody') + '.');
        const objs = R.objectsAt(actor.loc);
        if (objs.length) L.push('Objects here: ' + objs.map(function (o) { return o.id + ' (' + (o.state ? o.state + '; ' : '') + 'actions: ' + Object.keys(o.actions || {}).join('/') + ')'; }).join(', ') + '.');
        const known = R.places().filter(function (p) { return R.knows(actor, p.id) && p.id !== actor.loc; }).map(function (p) {
            return p.id + ' = ' + p.name + ' (' + Math.round(R.dist(actor.loc, p.id)) + ' m)';
        });
        L.push('Places you know: ' + (known.join('; ') || 'none') + '.');
        // Evelyn répond déjà au joueur par son propre circuit (appels, messages vocaux) : on ne lui montre pas ses SMS ici
        const un = M.unread(actor.id).filter(function (m) { const f = R.actor(m.from); return !(actor.external && f && f.isPlayer); });
        if (un.length) {
            L.push('New messages:\n' + un.map(function (m) { const f = R.actor(m.from); return '- from ' + (f ? f.name : m.from) + (m.kind === 'say' ? ' (said to you in person)' : '') + ': ' + m.text; }).join('\n'));
            un.forEach(function (m) { M.markRead(actor.id, m.from); });
        }
        const rides = R.pendingRides ? R.pendingRides(actor) : [];
        if (rides.length) L.push('Ride requests waiting for you:\n' + rides.map(function (r) { return '- ride ' + r.id + ': ' + r.fromName + ' wants to go from ' + describePlace(r.pickup) + ' to ' + describePlace(r.to); }).join('\n'));
        const notes = R.recentNotes(5);
        if (notes.length) L.push('Recently in the world: ' + notes.join(' | '));
        if (actor.memory.length) L.push('What you did recently:\n' + actor.memory.slice(-6).join('\n'));
        L.push('What do you do now?');
        return L.join('\n');
    }

    async function think(actor) {
        const system = await buildSystem(actor);
        const user = buildPerception(actor);
        const raw = await llm({ system: system, user: user, id: actor.id });
        const plan = parsePlan(raw);
        if (!plan) throw new Error('réponse illisible');
        if (plan.thought) actor.memory.push('(thought) ' + plan.thought);
        for (let i = 0; i < plan.actions.length; i++) {
            const a = plan.actions[i];
            const res = await R.run(actor, String(a.do), a);
            actor.memory.push('- ' + a.do + (a.place || a.to || a.object ? ' ' + (a.place || a.to || a.object) : '') + ' -> ' + res);
        }
        if (actor.memory.length > 12) actor.memory = actor.memory.slice(-12);
        R.save();
        return plan;
    }

    function due(b, now) {
        const a = b.actor;
        if (a.busyUntil > now) return false;
        if (b.wake && now - b.lastRun > 15000) return true;
        return now - b.lastRun > (cfg.avatarThinkSec * 1000) * (0.75 + b.jitter * 0.5);
    }

    async function pump() {
        if (!enabled || running || document.hidden) return;
        const now = Date.now();
        if (now < backoffUntil || now - lastCall < cfg.avatarMinGapSec * 1000) return;
        const ready = brains.filter(function (b) { return due(b, now); }).sort(function (a, b) { return (b.wake ? 1 : 0) - (a.wake ? 1 : 0) || a.lastRun - b.lastRun; })[0];
        if (!ready) return;
        running = true; lastCall = now; ready.lastRun = now; ready.wake = false;
        try { await think(ready.actor); failures = 0; }
        catch (e) {
            failures++;
            backoffUntil = Date.now() + Math.min(600000, 20000 * Math.pow(2, failures - 1));
            console.warn('[avatar ' + ready.actor.id + ']', e && e.message || e);
        }
        running = false;
    }

    const api = {
        add: function (actor) {
            if (actor.isPlayer || (actor.external && !actor.thinks)) return;
            brains.push({ actor: actor, lastRun: Date.now() - Math.random() * 60000, jitter: Math.random(), wake: false });
        },
        wake: function (actorId) { brains.forEach(function (b) { if (b.actor.id === actorId) b.wake = true; }); },
        start: function () { setInterval(pump, 3000); },
        setLLM: function (fn) { llm = fn; },
        setContext: function (id, fn) { providers[id] = fn; },
        setEnabled: function (v) { enabled = !!v; },
        isEnabled: function () { return enabled; },
        thinkNow: function (actorId) { const a = R.actor(actorId); return a ? think(a) : Promise.reject(new Error('inconnu')); },
        buildSystem: buildSystem, buildPerception: buildPerception
    };
    return api;
}
