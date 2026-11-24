// avatar-brain.js – UN cerveau commun pour tous les avatars (Oliver, Pluie, et ceux qui viendront).
//
// Le prompt est construit AUTOMATIQUEMENT à partir du registre :
//   • les capacités (registry.registerCapability)   • les lieux connus / cachés   • les objets du lieu
//   • l'annuaire et les messages reçus              • les demandes de course, etc.
// Donc quand tu ajoutes une nouvelle fonctionnalité au jeu et que tu l'enregistres comme capacité,
// les avatars la connaissent à leur prochaine réflexion, sans toucher à ce fichier.
//
// Un seul avatar réfléchit à la fois (file d'attente) pour ne pas saturer le Worker / le quota Groq.
//
// v2 : AUCUN cas particulier pour personne (ni « joueur », ni Evelyn). Tout le monde reçoit la même mémoire (avatar-mind.js),
// les mêmes façons de penser, les mêmes téléphones (appel, répondeur, SMS). Un avatar qui n'a rien de neuf à percevoir ne
// rappelle pas l'IA (aucun quota dépensé pour répéter la même chose).

import { THERAPIST_CONFIG } from './therapist-config.js';
import { Mind } from './avatar-mind.js';
import { isNpc } from '../npcs/index.js';       // les PNJ n'ont aucun cerveau (voir npcs/ et engine/npc-driver.js)

const textCache = {};
async function fetchText(path) {
    if (path in textCache) return textCache[path];
    let t = '';
    try { const r = await fetch(path); if (r.ok) t = await r.text(); } catch (e) { /* fichier absent : pas grave */ }
    textCache[path] = t;
    return t;
}

// Appel par défaut : EXACTEMENT le même format que le cerveau d'Evelyn (therapist-ai.js : callLLM),
// car c'est ce que le Worker comprend : messages = [{ role, text }], maxOutputTokens, reasoningEffort -> { text }.
// (Avant : { content } et max_tokens -> le Worker lisait un message VIDE : l'avatar ne savait ni où il était ni quoi faire.)
// Remplaçable : society.setLLM(async ({ system, user, id }) => '...texte...')
async function defaultLLM(o) {
    if (isNpc(o.id)) return '{"thought":"","actions":[{"do":"wait"}]}';     // filet de sécurité : un PNJ n'appelle JAMAIS l'IA (seule Evelyn réfléchit)
    const cfg = THERAPIST_CONFIG || {};
    if (!cfg.proxyUrl) throw new Error('pas de proxyUrl dans therapist-config.js');
    const body = {
        system: o.system,
        messages: [{ role: 'user', text: o.user }],
        temperature: 0.9,
        // ... la suite inchangée
        maxOutputTokens: cfg.avatarMaxTokens || 1000,                 // gpt-oss compte sa réflexion dedans : ne pas descendre
        reasoningEffort: cfg.reasoningEffort || 'low',
        avatar: o.id
    };
    if (o.cheap && cfg.avatarModel) body.model = cfg.avatarModel;     // bavardage entre avatars : modèle à part (quota séparé), si configuré
    else if (cfg.model) body.model = cfg.model;
    const r = await fetch(cfg.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('worker ' + r.status + ' ' + (await r.text()).slice(0, 200));   // le Worker dit pourquoi
    const j = await r.json();
    if (!j || !j.text) throw new Error('worker sans texte : ' + JSON.stringify(j).slice(0, 200));
    return String(j.text);
}

export function parsePlan(raw) {
    raw = String(raw || '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
        const j = JSON.parse(raw.slice(a, b + 1));
        const acts = Array.isArray(j.actions) ? j.actions : (j.do ? [j] : []);
        return { thought: String(j.thought || '').slice(0, 200), actions: acts.filter(function (x) { return x && x.do; }).slice(0, 3), mind: (j.mind && typeof j.mind === 'object') ? j.mind : null };
    } catch (e) { return null; }
}

export function createBrainSystem(R, M, opts) {
    opts = opts || {};
    const cfg = Object.assign({ avatarThinkSec: 300, avatarMinGapSec: 12, avatarWakeGapSec: 45, avatarsEnabled: true, avatarTalkMax10min: 6, avatarTalkMax10minPlayer: 20, avatarEventMax10min: 4, avatarIdleMax10min: 2, avatarStageMeters: 150 }, THERAPIST_CONFIG || {});
    let llm = opts.llm || defaultLLM;
    let enabled = cfg.avatarsEnabled !== false;
    let running = false;                 // un seul appel à la fois
    let lastCall = 0, failures = 0, backoffUntil = 0, lastError = '', lastPlan = {};
    const brains = [];
    const fails = {};          // ce qui n'a pas marché, par avatar : { clé : { n, res, loc } } (elle ne doit pas recommencer en boucle)
    let blocksFn = null;
    let calls = null;          // society.js branche ici l'état des appels (incoming / active / missed)
    const providers = {};      // texte en plus pour un avatar (ex. les notes privées d'Evelyn sur le joueur)
    const gameTime = function () { try { return window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : ''; } catch (e) { return ''; } };

    function describePlace(id) { const p = R.place(id); return p ? p.name + (p.desc ? ' (' + p.desc + ')' : '') : id; }

    async function buildSystem(actor) {
        const shared = await fetchText('avatars/_shared/world.txt');
        const own = await fetchText('avatars/' + actor.id + '/brain/context.txt');
        let extra = '';
        try { extra = providers[actor.id] ? String(providers[actor.id]() || '') : ''; } catch (e) { extra = ''; }
        const caps = R.capabilities(actor).map(function (c) { return '- ' + c.id + (c.args ? ' ' + c.args : '') + ' : ' + c.desc; }).join('\n');
        const dir = R.directory(actor).map(function (d) {
            const a = R.actor(d.id);
            return '- ' + d.name + ' : ' + d.number;
        }).join('\n') || '(nobody: you have nobody\'s number yet. You get to know people by meeting them, in person.)';
        return [
            shared.trim(),
            own.trim(),
            extra.trim(),
            'You are ' + (actor.selfName || actor.name) + '. Your phone number is ' + actor.number + '. You are a person like any other: you move, open doors, write, call, drive.',
            'WHAT YOU CAN DO (the only actions that exist):\n' + caps,
            'PEOPLE YOU CAN WRITE TO OR CALL:\n' + dir,
            'PHONE: a call rings for a few seconds; the other person may answer or not (people only hear their phone when they are near it). If nobody answers, text them or try again much later: never call or text again and again. If the person is standing right next to you, use say, not text. You can block a number (block) and unblock it (unblock); someone you block is told, and if someone blocked you, your texts and calls to them fail.',
            'Answer with ONE JSON object and nothing else: {"thought":"short private thought","actions":[{"do":"action_id", ...args}]}. ' +
            'At most 3 actions. Use {"do":"wait"} when you want to do nothing. Messages and speech are written in the language of the person you address (English by default). Never invent places, people or actions that are not listed.',
            Mind.formBlock(actor.id)
        ].filter(Boolean).join('\n\n');
    }

    function buildPerception(actor) {
        const here = R.place(actor.loc);
        const L = [];
        L.push('Real time: ' + new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (gameTime() ? ' | Game time: ' + gameTime() : ''));
        L.push('You are at: ' + describePlace(actor.loc) + (here && here.floor !== null ? ', floor ' + here.floor : '') + '.');
        if (actor.job) L.push('You are on duty as: ' + actor.job + '.');
        const others = (R.nearby ? R.nearby(actor) : R.actorsAt(actor.loc, actor.id)).map(function (a) { return a.name; });
        L.push('Here with you: ' + (others.length ? others.join(', ') : 'nobody') + '.');
        const prevHere = seenHere[actor.id]; seenHere[actor.id] = others;
        if (prevHere) { const arr = others.filter(function (n) { return prevHere.indexOf(n) === -1; }), gone = prevHere.filter(function (n) { return others.indexOf(n) === -1; });
            if (arr.length) L.push('Since your last thought, ' + arr.join(', ') + ' came close to you.');
            if (gone.length) L.push('Since your last thought, ' + gone.join(', ') + ' moved away.'); }
        if (others.length && Date.now() - (seeWake[actor.id] || 0) < 25000) L.push('You just noticed ' + others.join(', ') + ' close to you. You may greet them or speak first if you feel like it, or let them pass: it is your choice, and you do not owe them anything.');
        const objs = R.objectsAt(actor.loc);
        if (objs.length) L.push('Objects here: ' + objs.map(function (o) { return o.id + ' (' + (o.state ? o.state + '; ' : '') + 'actions: ' + Object.keys(o.actions || {}).join('/') + ')'; }).join(', ') + '.');
        const known = R.places().filter(function (p) { return R.knows(actor, p.id) && p.id !== actor.loc; }).map(function (p) {
            return p.id + ' = ' + p.name + ' (' + Math.round(R.dist(actor.loc, p.id)) + ' m)';
        });
        L.push('Places you know: ' + (known.join('; ') || 'none') + '.');
        const ex = exploredOf(actor.id); ex.places[actor.loc] = 1;
        const unseenPl = R.places().filter(function (p) { return R.knows(actor, p.id) && !ex.places[p.id]; }).map(function (p) { return p.name; });
        if (unseenPl.length) L.push('Places you know but have never been to: ' + unseenPl.slice(0, 8).join(', ') + '. You are curious about the world: when nothing more pressing calls you, go and see it.');
        const freshObjs = objs.filter(function (o) { return !ex.objs[actor.loc + ':' + o.id]; }).map(function (o) { return o.id; });
        if (freshObjs.length) L.push('Things here you have not examined yet: ' + freshObjs.join(', ') + '. Write what you learn in your notes.');
        const un = M.unread(actor.id);
        let withId = null;
        if (un.length) {
            const lines = [], vms = []; let lastSaid = null;
            un.forEach(function (m) {
                const f = R.actor(m.from), nm = f ? f.name : m.from;
                Mind.noteHeard(actor.id, m.from, nm, m.kind, m.text);       // la mémoire garde ce qu'on lui a dit, avec l'heure
                actor.memory.push('(heard) ' + nm + (m.kind === 'say' ? ' said' : m.kind === 'voicemail' ? ' left a voicemail' : m.kind === 'call' ? ' said on the phone' : ' texted') + ': ' + String(m.text).slice(0, 160));
                (m.kind === 'voicemail' ? vms : lines).push('- from ' + nm + (m.kind === 'say' ? ' (said to you in person)' : m.kind === 'call' ? ' (on the phone, during your call)' : '') + ': ' + m.text);
                withId = m.from; if (m.kind === 'say' || m.kind === 'call') lastSaid = { nm: nm, text: String(m.text).slice(0, 200) };
                M.markRead(actor.id, m.from);
            });
            if (lines.length) L.push('New messages:\n' + lines.join('\n'));
            if (un.some(function (m) { return m.kind === 'say'; })) L.push('Someone is speaking to you face to face right now. Answer what they actually said (a greeting gets a greeting; if they ask who you are, tell them your name; if they ask a question, answer it). Never repeat or reword something you already told them: if you have nothing new, say so briefly or stay quiet and do something else. You are free to end the conversation and walk away.' + (lastSaid ? ' ' + lastSaid.nm + ' just said: \u00ab ' + lastSaid.text + ' \u00bb. Your FIRST sentence must answer those exact words: pick up something that was said, answer the question, or react to what was announced (a threat, an action, a name). Never answer with a prepared line that ignores it.' : ''));
            if (vms.length) L.push('New voicemails:\n' + vms.join('\n'));
        }
        if (calls) {
            const inc = calls.incoming(actor.id);
            if (inc.length) { L.push((actor.pager ? 'Your PAGER beeps (someone is calling the Police line): ' : 'Your phone is RINGING: ') + inc.map(function (c) { const f = R.actor(c.from); return (f ? f.name : c.from) + ' is calling you (use answer_call to pick up, or hang_up / do nothing to let it ring out)'; }).join('; ') + '.'); withId = inc[0].from; }
            const act = calls.active(actor.id);
            if (act) { const o = R.actor(act.from === actor.id ? act.to : act.from); L.push('You are ON THE PHONE with ' + (o ? o.name : '?') + '. What you say goes to them with say.'); withId = o ? o.id : withId; }
            calls.missedFor(actor.id).forEach(function (c) { const o = R.actor(c.to); L.push('Your call to ' + (o ? o.name : '?') + ' was not answered. You can text them, or try again much later.'); });
        }
        if (blocksFn) {
            const bk = blocksFn(actor.id);
            if (bk.blocking.length) L.push('You have blocked: ' + bk.blocking.join(', ') + '.');
            if (bk.blockedBy.length) L.push('These people have blocked you (your texts and calls to them fail): ' + bk.blockedBy.join(', ') + '.');
        }
        const rides = R.pendingRides ? R.pendingRides(actor) : [];
        if (rides.length) L.push('Ride requests waiting for you:\n' + rides.map(function (r) { return '- ride ' + r.id + ': ' + r.fromName + ' wants to go from ' + describePlace(r.pickup) + ' to ' + describePlace(r.to); }).join('\n'));
        const notes = R.recentNotes(5);
        if (notes.length) L.push('Recently in the world: ' + notes.join(' | '));
        const ids = [withId];
        const ppl = Mind.get(actor.id).people;
        Object.keys(ppl).filter(function (k) { return Date.now() - ppl[k].at < 20 * 60000; }).sort(function (a, b) { return ppl[b].at - ppl[a].at; }).forEach(function (k) { if (ids.indexOf(k) === -1) ids.push(k); });
        const mem = Mind.promptBlock(actor.id, { hint: L.join(' '), withIds: ids.filter(Boolean).slice(0, 3) });
        if (mem) L.push(mem);
        if (actor.memory.length) L.push('What you did recently:\n' + actor.memory.slice(-12).join('\n'));
        const talkTurns = (thinkLog[actor.id] || []).filter(function (x) { return x.k === 'talk' && Date.now() - x.t < 6 * 60000; }).length;
        if (talkTurns >= 3) L.push('You have been going back and forth in this conversation for a while (' + talkTurns + ' turns) and it is not getting you what you wanted. Say one last thing only if it is new, then do something different in the world: go somewhere, use an object, call someone else, or let it go for now. Write in your mind what you decided and why.');
        const ff = fails[actor.id] ? Object.keys(fails[actor.id]).map(function (k) { return fails[actor.id][k]; }).filter(function (x) { return x.loc === actor.loc; }) : [];
        if (ff.length) L.push('WHAT DID NOT WORK from where you are (the world refused it' + ', so trying again will not change anything until something changes):\n' + ff.slice(-5).map(function (x) { return '- ' + x.what + ' -> ' + x.res + (x.n > 1 ? ' (tried ' + x.n + ' times)' : ''); }).join('\n') + '\nUnderstand WHY, then choose something that is possible: wait outside, text, call, go somewhere you can reach. Note what you learned and how you feel in your mind.');
        L.push('What do you do now?');
        return L.join('\n');
    }

    // Ce qui change quand « il se passe quelque chose » : si c'est identique au dernier tour, il peut ne pas réfléchir
    function urgent(actor) {
        const c = calls;
        return M.unread(actor.id).length > 0 || (R.pendingRides && R.pendingRides(actor).length > 0) || (c && (c.incoming(actor.id).length > 0 || !!c.active(actor.id) || c.missedFor(actor.id).length > 0));
    }
    function signature(actor) {
        const others = (R.nearby ? R.nearby(actor) : R.actorsAt(actor.loc, actor.id)).map(function (a) { return a.id; }).sort().join(',');
        return [actor.loc, actor.job || '', others, Math.floor(Date.now() / 1800000)].join('|');
    }
    // Le joueur vient-il de leur parler / appeler ? (alors réponse rapide, modèle principal, budget plus large)
    const playerAt = {}, thinkLog = {}, seenHere = {}, seeWake = {}, explored = {};
    function exploredOf(id) { return explored[id] || (explored[id] = { places: {}, objs: {} }); }
    function fromPlayer(id) { const a = R.actor(id); return id === 'player' || !!(a && a.isPlayer); }
    function playerInvolved(actor) {
        const now = Date.now();
        if (M.unread(actor.id).some(function (m) { return fromPlayer(m.from); })) playerAt[actor.id] = now;
        if (calls) {
            const inc = calls.incoming(actor.id), act = calls.active(actor.id);
            if (inc.some(function (c) { return fromPlayer(c.from); }) || (act && (fromPlayer(act.from) || fromPlayer(act.to)))) playerAt[actor.id] = now;
        }
        return now - (playerAt[actor.id] || 0) < 180000;
    }
    // kind : 'talk' = quelqu'un lui parle en direct (réponse rapide) ; 'event' = SMS / rencontre / course ; 'idle' = il réfléchit seul (espacé)
    function kindOf(b) { return b.why === 'see' ? 'see' : (b.fast ? 'talk' : (b.wake ? 'event' : 'idle')); }
    function budgetOk(actor, now, kind) {
        const h = thinkLog[actor.id] || (thinkLog[actor.id] = []);
        while (h.length && now - h[0].t > 600000) h.shift();
        const n = h.filter(function (x) { return x.k === kind; }).length, pl = playerInvolved(actor);
        const max = kind === 'see' ? (cfg.avatarSeeMax10min || 4) : kind === 'talk' ? (pl ? cfg.avatarTalkMax10minPlayer : cfg.avatarTalkMax10min) : kind === 'event' ? (pl ? 8 : cfg.avatarEventMax10min) : cfg.avatarIdleMax10min;
        if (!pl && !onStage(actor)) return n < 1;       // loin de toi : au plus 1 appel par type et par 10 min
        return n < max;
    }
    // « En scène » = assez près de toi pour que tu le voies / l'entendes. Les autres vivent au ralenti : rien de ce qu'ils disent ne t'atteint, inutile de payer.
    function onStage(actor) {
        const p = R.actor('player');
        if (!p || p.loc === actor.loc) return true;
        try { return !(R.dist(p.loc, actor.loc) > cfg.avatarStageMeters); } catch (e) { return true; }
    }
    // mesure : chaque appel IA (durée, taille) -> BadTherapistSociety.brains.usage()
    const usageLog = [];
    function rec(id, kind, ms, chars, err) { usageLog.push({ at: Date.now(), id: id, kind: kind, ms: ms, chars: chars, err: err || '' }); while (usageLog.length > 600) usageLog.shift(); }
    let active = 0;                 // appels IA en cours : 1 pour le fond, +1 réservé aux conversations avec toi
    const inFlight = {};
    const lastThought = {};
    function sameThought(a, b) {
        const w = function (t) { return String(t || '').toLowerCase().split(/[^a-z0-9àâçéèêëîïôûùüÿ]+/).filter(function (x) { return x.length > 3; }); };
        const A = w(a), B = w(b); if (A.length < 3 || B.length < 3) return false;
        const SB = {}; B.forEach(function (x) { SB[x] = 1; });
        let c = 0; A.forEach(function (x) { if (SB[x]) c++; });
        return c / (A.length + B.length - c) >= 0.5;
    }
    const fastGap = function (b) { return playerInvolved(b.actor) ? 800 : 3000; };
    const OUT = { say: 1, text: 1, leave_voicemail: 1 };
    const FAILED = /^(Unknown|You cannot|You do not|There is nobody|Nobody|Empty|Too far|The door is locked)|is not here|failed|locked/i;

    async function think(actor, kind) {
        const system = await buildSystem(actor);
        const user = buildPerception(actor);
        const t0 = Date.now();
        let raw;
        try { raw = await llm({ system: system, user: user, id: actor.id, cheap: !playerInvolved(actor) }); }
        catch (e) { rec(actor.id, kind || 'manual', Date.now() - t0, system.length + user.length, String(e && e.message || e).slice(0, 120)); throw e; }
        rec(actor.id, kind || 'manual', Date.now() - t0, system.length + user.length);
        const plan = parsePlan(raw);
        if (!plan) throw new Error('réponse illisible : ' + String(raw).slice(0, 160));
        lastPlan[actor.id] = { at: Date.now(), thought: plan.thought, actions: plan.actions };
        const mi = plan.mind || {};
        console.log('[avatar ' + actor.id + '] pense : ' + (plan.thought || '(rien)') + (mi.feeling ? '  [ressent : ' + String(mi.feeling).slice(0, 60) + ']' : '') + (mi.goal ? '  [but : ' + String(mi.goal).slice(0, 60) + ']' : ''), plan.actions);
        const mm = Object.assign({}, plan.mind || {});
        if (!mm.thought && plan.thought) mm.thought = plan.thought;       // son « short private thought » = son monologue intérieur, comme celui d'Evelyn
        Mind.apply(actor.id, mm);
        let acted = false;
        for (let i = 0; i < plan.actions.length; i++) {
            const a = plan.actions[i];
            const id = String(a.do);
            let res;
            const dest = a.to ? R.findActor(a.to) : null;
            if (OUT[id] && a.text && Mind.isRepeat(actor.id, a.text, dest ? dest.id : '')) {
                res = 'You already said almost exactly that a moment ago: you stay silent.';          // pas d'envoi : on ne se répète pas
            } else {
                res = await R.run(actor, id, a);
                if (id !== 'wait') acted = true;
                if (FAILED.test(String(res))) {
                    const fk = id + ':' + (a.place || a.to || a.object || ''), f = (fails[actor.id] = fails[actor.id] || {});
                    f[fk] = { n: ((f[fk] && f[fk].n) || 0) + 1, res: String(res).slice(0, 140), loc: actor.loc, what: id + (a.place || a.to || a.object ? ' ' + (a.place || a.to || a.object) : '') };
                }
                if (OUT[id] && a.text && !FAILED.test(res)) Mind.noteSent(actor.id, dest ? dest.id : '', a.text, id === 'say' ? 'say' : id === 'leave_voicemail' ? 'voicemail' : 'text', dest ? dest.name : '');
            }
            if (a.object && !FAILED.test(String(res))) exploredOf(actor.id).objs[actor.loc + ':' + a.object] = 1;
            console.log('[avatar ' + actor.id + '] ' + id + (a.to || a.place || a.object ? ' ' + (a.to || a.place || a.object) : '') + (a.action ? ' ' + a.action : '') + (a.text ? ' « ' + String(a.text).slice(0, 80) + ' »' : '') + '  ->  ' + String(res).slice(0, 120));
            actor.memory.push('- ' + id + (a.place || a.to || a.object ? ' ' + (a.place || a.to || a.object) : '') + (a.text ? ': "' + String(a.text).slice(0, 160) + '"' : '') + ' -> ' + res);
        }
        plan.acted = acted;
        plan.stale = !acted && sameThought(plan.thought, lastThought[actor.id]);
        lastThought[actor.id] = plan.thought;
        if (actor.memory.length > 24) actor.memory = actor.memory.slice(-24);
        R.save();
        return plan;
    }

    function due(b, now) {
        const a = b.actor;
        if (a.busyUntil > now && !(a.phoneWhileBusy && b.wake)) { if (b.wake && !b.busyLogged) { b.busyLogged = true; console.log('[avatar ' + a.id + '] réveil en attente : elle est occupée (déplacement / action en cours) pendant encore ' + Math.round((a.busyUntil - now) / 1000) + ' s'); } return false; }
        b.busyLogged = false;      // Leon : un appel ou un SMS le joint même au volant
        if (b.wake && now - b.lastRun > (b.fast ? fastGap(b) : cfg.avatarWakeGapSec * 1000)) return true;      // un SMS ou une rencontre le réveille, mais pas en boucle ; une conversation en direct va vite
        return now - b.lastRun > (cfg.avatarThinkSec * 1000) * (0.75 + b.jitter * 0.5) * (onStage(a) ? 1 : 3);     // loin de toi : 3 fois plus rare
    }

    async function pump() {
        if (!enabled || active >= 2 || document.hidden) return;
        const now = Date.now();
        if (now < backoffUntil) return;
        const cands = brains.filter(function (b) { return due(b, now); }).sort(function (a, b) { return (b.wake ? 1 : 0) - (a.wake ? 1 : 0) || a.lastRun - b.lastRun; });
        let ready = null, sig = '';
        for (let i = 0; i < cands.length; i++) {
            const b = cands[i], gap = b.fast ? fastGap(b) : cfg.avatarMinGapSec * 1000;
            if (inFlight[b.actor.id]) continue;
            if (active >= (playerInvolved(b.actor) ? 2 : 1)) continue;     // le 2e appel simultané est réservé à ceux à qui tu parles : tu n'attends plus derrière un bavardage
            if (now - lastCall < gap) continue;
            if (!budgetOk(b.actor, now, kindOf(b))) { if (b.wake) console.log('[avatar ' + b.actor.id + '] réveil IGNORÉ : trop de réflexions « ' + kindOf(b) + ' » en 10 min (limite atteinte). Elle se repose.'); b.lastRun = now; b.wake = false; b.fast = false; b.why = ''; continue; }     // trop de réflexions en 10 min : il se repose
            const sg = signature(b.actor);
            if (Mind.shouldThink(b.actor.id, sg, { urgent: b.wake || urgent(b.actor) })) { ready = b; sig = sg; break; }
            b.lastRun = now; b.wake = false; b.fast = false;                 // rien de neuf : il ne réfléchit pas (et ne coûte rien)
        }
        if (!ready) return;
        const readyKind = kindOf(ready);
        (thinkLog[ready.actor.id] || (thinkLog[ready.actor.id] = [])).push({ t: now, k: readyKind });
        active++; inFlight[ready.actor.id] = true; lastCall = now; ready.lastRun = now; ready.wake = false; ready.fast = false; ready.why = '';
        try {
            const plan = await think(ready.actor, readyKind);
            failures = 0;
            Mind.afterThink(ready.actor.id, sig, plan.acted, plan.stale ? 20 : (plan.mind && plan.mind.next_think_min));
        } catch (e) {
            failures++;
            lastError = ready.actor.id + ' : ' + (e && e.message || e);
            backoffUntil = Date.now() + Math.min(600000, Math.max(/Toutes les cl/i.test(lastError) ? 180000 : 0, 20000 * Math.pow(2, failures - 1)));
            console.warn('[avatar ' + ready.actor.id + ']', e && e.message || e);
        }
        active--; delete inFlight[ready.actor.id];
        try { if (typeof window !== 'undefined' && window.BadTherapistBubbles && window.BadTherapistBubbles.endThink) window.BadTherapistBubbles.endThink(ready.actor.id); } catch (e) { /* rien */ }   // s'il n'a rien dit, les « ... » s'arrêtent
    }

    const api = {
        add: function (actor) {
            if (actor.isPlayer || isNpc(actor.id) || (actor.external && !actor.thinks)) return;     // PNJ : pas de cerveau, pas de mémoire
            brains.push({ actor: actor, lastRun: Date.now() - Math.random() * 60000, jitter: Math.random(), wake: false });
        },
        wake: function (actorId, fast, why) { brains.forEach(function (b) { if (b.actor.id === actorId) { b.wake = true; if (fast) b.fast = true; b.why = why || ''; if (why === 'see') seeWake[actorId] = Date.now(); } }); },
        setCalls: function (c) { calls = c; },
        setBlocks: function (fn) { blocksFn = fn; },
        start: function () { setInterval(pump, 1000); },
        setLLM: function (fn) { llm = fn; },
        setContext: function (id, fn) { providers[id] = fn; },
        setEnabled: function (v) { enabled = !!v; },
        isEnabled: function () { return enabled; },
        thinkNow: function (actorId) { const a = R.actor(actorId); return a ? think(a) : Promise.reject(new Error('inconnu')); },
        // F12 : BadTherapistSociety.brains.usage(60)  ->  combien d'appels IA par avatar (60 dernières minutes), leur taille et leur durée moyenne
        usage: function (minutes) {
            const since = Date.now() - (minutes || 60) * 60000, by = {};
            usageLog.filter(function (x) { return x.at >= since; }).forEach(function (x) {
                const o = by[x.id] || (by[x.id] = { appels: 0, talk: 0, event: 0, idle: 0, manual: 0, erreurs: 0, chars: 0, ms: 0, derniereErreur: '' });
                o.appels++; o[x.kind] = (o[x.kind] || 0) + 1; o.chars += x.chars; o.ms += x.ms;
                if (x.err) { o.erreurs++; o.derniereErreur = x.err; }
            });
            const out = {}; let tot = 0;
            Object.keys(by).forEach(function (k) {
                const o = by[k]; tot += o.chars;
                out[k] = { appels: o.appels, talk: o.talk, event: o.event, idle: o.idle, manual: o.manual, erreurs: o.erreurs, tokensEntreeEstimes: Math.round(o.chars / 3.5), secondesParAppel: +(o.ms / o.appels / 1000).toFixed(1), derniereErreur: o.derniereErreur };
            });
            out.TOTAL_tokensEntreeEstimes = Math.round(tot / 3.5);
            return out;
        },
        // F12 : await BadTherapistSociety.brains.promptSize('oliver')  ->  taille du prompt fixe + de la mémoire (sans consommer de message)
        promptSize: async function (id) {
            const a = R.actor(id); if (!a) return 'inconnu';
            const sys = await buildSystem(a), mem = Mind.promptBlock(id, { withIds: [] });
            return { systemChars: sys.length, memoireChars: mem.length, tokensEstimesParAppel_hors_perception: Math.round((sys.length + mem.length) / 3.5) };
        },
        // F12 : BadTherapistSociety.brains.debug()  ->  pourquoi un avatar ne réfléchit pas
        debug: function () {
            const now = Date.now();
            return {
                enabled: enabled, running: active > 0, pageHidden: document.hidden, failures: failures, lastError: lastError,
                waitMs: Math.max(0, backoffUntil - now), lastPlan: lastPlan,
                avatars: brains.map(function (b) { return { id: b.actor.id, nextInSec: Math.round(Math.max(0, (cfg.avatarThinkSec * 1000 * (0.75 + b.jitter * 0.5)) - (now - b.lastRun)) / 1000), busy: b.actor.busyUntil > now }; })
            };
        },
        buildSystem: buildSystem, buildPerception: buildPerception
    };
    return api;
}
