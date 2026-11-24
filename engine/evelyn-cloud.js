// evelyn-cloud.js – Evelyn continue de vivre quand le jeu est fermé (Worker Cloudflare + KV).
//
// Ce module ne fait QUE parler au Worker :
//   • toutes les 3 min (onglet visible)  : « ping »  -> « je suis là, ne pense pas à ma place »
//   • de temps en temps / quand tu quittes l'onglet : « sync » -> instantané d'Evelyn (prompt, mémoire, lieu, contacts)
//   • à l'ouverture / quand tu reviens sur l'onglet : « pull » -> ce qu'elle a fait pendant ton absence, rejoué ici
//     (messages, message vocal, déplacement, pensées et souvenirs).
//
// Branchement : society.js l'importe dynamiquement (voir la fin de create()), il n'y a rien d'autre à toucher.
// Console : BadTherapistCloud.sync() / .pull() / .peek() / .thinkNow() / .forget()   (peek et thinkNow demandent DEBUG=1 dans le Worker)

import { THERAPIST_CONFIG } from './therapist-config.js';

const ME = 'evelyn';
const ID_KEY = 'bt_cloud_id';
const PING_MS = 3 * 60000;          // signe de vie (1 petite écriture KV)
const SYNC_MIN_MS = 10 * 60000;     // un instantané complet au plus toutes les 10 min...
const SYNC_MAX_MS = 30 * 60000;     // ...et au moins toutes les 30 min

function cloudId() {
    let id = '';
    try { id = localStorage.getItem(ID_KEY) || ''; } catch (e) { id = ''; }
    if (!/^[a-z0-9-]{16,64}$/.test(id)) {
        id = (window.crypto && crypto.randomUUID ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).toLowerCase();
        try { localStorage.setItem(ID_KEY, id); } catch (e) { /* tant pis : un nouvel id à chaque visite */ }
    }
    return id;
}

function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
}

export function startEvelynCloud(ctx) {
    const R = ctx.R, M = ctx.M, brains = ctx.brains, api = ctx.api, Mind = ctx.Mind;
    const cfg = THERAPIST_CONFIG || {};
    if (!cfg.proxyUrl) return null;                 // pas de Worker : le jeu marche comme avant
    const id = cloudId();
    let lastHash = '', lastSyncAt = 0, busy = false;
    const me = function () { return R.actor(ME); };

    async function post(body, keepalive) {
        try {
            const r = await fetch(cfg.proxyUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ id: id }, body)), keepalive: !!keepalive
            });
            if (!r.ok) return null;
            return await r.json();
        } catch (e) { return null; }
    }

    // ─── Instantané : tout ce dont le Worker a besoin pour la faire penser sans le jeu ───
    async function snapshot() {
        const a = me();
        if (!a) return null;
        const place = R.place(a.loc);
        const system = await brains.buildSystem(a);                          // son prompt complet (capacités, monde, contexte, forme du JSON)
        const memory = Mind.promptBlock(ME, { withIds: [] });                // sa mémoire (lecture seule : rien n'est marqué lu)
        const places = R.places().filter(function (p) { return p.id !== 'road' && R.knows(a, p.id); })
            .map(function (p) { return { id: p.id, name: p.name, dist: Math.round(R.dist(a.loc, p.id)) }; });
        return { action: 'sync', name: a.name, system: system, memory: memory, loc: a.loc, locName: place ? place.name : a.loc, places: places, directory: R.directory(a) };
    }

    async function sync(force, keepalive) {
        if (busy) return false;
        busy = true;
        try {
            const snap = await snapshot();
            if (!snap) return false;
            const h = hash(snap.system + snap.memory + snap.loc);
            const now = Date.now(), age = now - lastSyncAt;
            if (!force && !((h !== lastHash && age >= SYNC_MIN_MS) || age >= SYNC_MAX_MS)) return false;
            const r = await post(snap, keepalive);
            if (r && r.ok) { lastHash = h; lastSyncAt = now; return true; }
            return false;
        } finally { busy = false; }
    }

    function describe(e) {
        if (e.t === 'text') return 'you texted ' + e.to + ': "' + String(e.text).slice(0, 120) + '"';
        if (e.t === 'voicemail') return 'you left a voicemail for ' + e.to + ': "' + String(e.text).slice(0, 120) + '"';
        if (e.t === 'move') return 'you went to ' + e.place;
        return '';
    }

    // ─── Ce qu'elle a fait pendant que le jeu était fermé ───
    async function pull() {
        const r = await post({ action: 'pull' });
        const a = me();
        if (!r || !a || !Array.isArray(r.events) || !r.events.length) return 0;
        r.events.forEach(function (e) {
            try {
                if (e.t === 'mind') Mind.apply(ME, e.mind);
                else if (e.t === 'move') {
                    if (R.place(e.place)) { a.loc = e.place; a.dest = null; a.travel = null; a.busyUntil = 0; R.discoverNear(a); }
                } else if (e.t === 'text') M.send(ME, e.to, e.text);
                else if (e.t === 'voicemail') {
                    api.act(ME, 'leave_voicemail', { to: e.to, text: e.text }).then(function (res) {
                        if (/^(Unknown|You cannot)/i.test(String(res))) M.send(ME, e.to, e.text);      // pas de répondeur dans cette version : un SMS
                    });
                }
                const d = describe(e);
                if (d) a.memory.push('(while the game was closed) ' + d);
            } catch (err) { console.warn('[cloud] événement ignoré :', err); }
        });
        R.save();
        brains.wake(ME);
        console.info('[cloud] Evelyn a vécu ' + r.events.length + ' chose(s) pendant ton absence.');
        return r.events.length;
    }

    async function tick(force) {
        if (document.hidden) return;                                  // onglet caché : le cerveau du jeu dort, c'est le Worker qui prend le relais
        const did = await sync(!!force, false);
        if (!did) await post({ action: 'ping' });
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (Date.now() - lastSyncAt > 60000) sync(true, true); }       // je pars : le Worker doit avoir sa mémoire à jour
        else pull().then(function () { tick(true); });                                       // je reviens : je récupère ce qu'elle a fait
    });
    window.addEventListener('pagehide', function () { if (Date.now() - lastSyncAt > 60000) sync(true, true); });
    setInterval(function () { tick(false); }, PING_MS);

    // Reset détecté : le jeu avait déjà synchronisé (marqueur) mais sa mémoire locale a disparu -> on efface aussi le cloud
    let wasReset = false;
    try {
        const had = localStorage.getItem('bt_cloud_mark') === '1';
        const mem = localStorage.getItem('bt_evelyn_memory');
        if (had && !mem) wasReset = true;
    } catch (e) { /* tant pis */ }

    // Au démarrage : d'abord ce qu'elle a fait (sauf si reset : on efface le cloud), ensuite on écrase l'instantané
    setTimeout(function () {
        const first = wasReset ? post({ action: 'forget' }) : pull();
        Promise.resolve(first).then(function () { return tick(true); }).then(function () {
            try { localStorage.setItem('bt_cloud_mark', '1'); } catch (e) { /* tant pis */ }
        });
    }, 3000);

    const dbg = {
        id: id, pull: pull,
        sync: function () { return sync(true, false); },
        peek: function () { return post({ action: 'peek' }); },
        thinkNow: function () { return post({ action: 'think_now' }); },
        forget: function () { try { localStorage.removeItem('bt_cloud_mark'); } catch (e) {} return post({ action: 'forget' }); }
    };
    window.BadTherapistCloud = dbg;
    return dbg;
}
