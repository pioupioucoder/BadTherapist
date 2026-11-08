// evelyn-life.js – relie le jeu à la VIE d'Evelyn (le Worker qui la fait penser quand le jeu est fermé).
//
//  • se synchronise toutes les ~2 min : envoie ses notes au Worker, récupère ses messages vocaux,
//    ses pensées de fond et l'appel qu'elle a programmé ;
//  • retient que le patient est dans le jeu (heure réelle) : Evelyn sait depuis combien de temps il est parti ;
//  • le patient peut lui laisser un message.
//
// Utilisation (là où `talk` = createTherapistTalk(...) et `phone` = buildPhone(...) existent) :
//     const life = createEvelynLife({ talk, phone, getGameTime: () => 'Day 2, 23:10' });
//     life.start();
// getGameTime est facultatif : une phrase qui dit l'heure dans le jeu.

import { THERAPIST_CONFIG } from './therapist-config.js';
import { Mem } from './therapist-memory.js';

export function createEvelynLife(opts) {
    opts = opts || {};
    const cfg = Object.assign({}, THERAPIST_CONFIG, opts.config || {});
    const talk = opts.talk, phone = opts.phone;
    const ID_KEY = 'bt_life_id';
    let timer = null, syncing = false, online = false, started = false;
    const listeners = [];

    function randomId() {
        const a = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }

    // Un identifiant par navigateur ET par profil (joueur / admin), pour ne jamais mélanger deux Evelyn
    function playerId() {
        let profile = 'player';
        try { profile = window.BadTherapistSave && window.BadTherapistSave.activeProfile ? window.BadTherapistSave.activeProfile() : 'player'; } catch (e) { /* rien */ }
        const key = ID_KEY + '_' + profile;
        let id = null;
        try { id = localStorage.getItem(key); } catch (e) { id = null; }
        if (!id || !/^[a-z0-9-]{16,64}$/.test(id)) {
            id = randomId();
            try { localStorage.setItem(key, id); } catch (e) { /* rien */ }
        }
        return id;
    }

    async function post(body) {
        if (!cfg.proxyUrl) throw new Error('pas de proxyUrl');
        const r = await fetch(cfg.proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ id: playerId() }, body))
        });
        if (!r.ok) throw new Error('worker ' + r.status);
        return r.json();
    }

    function gameTime() {
        try { return opts.getGameTime ? String(opts.getGameTime() || '') : ''; } catch (e) { return ''; }
    }

    function changed() { listeners.forEach(function (fn) { try { fn(); } catch (e) { /* rien */ } }); }

    // Applique ce qu'Evelyn a fait pendant que le jeu était fermé
    function absorb(res) {
        let any = false;
        const ackIds = [];
        (res.inbox || []).forEach(function (m) {
            if (!m || !m.id) return;
            ackIds.push(m.id);
            if (m.memory && typeof m.memory === 'object') { Mem.applyOps(m.memory); any = true; }
            if (m.kind === 'voicemail' && m.text && Mem.addVoicemail({ id: m.id, at: m.at, text: m.text })) any = true;
        });
        let callTaken = false;
        const pc = res.pendingCall;
        if (pc && Number(pc.dueAt) > 0) {
            Mem.setCallAt(pc.dueAt, pc.note);             // callDue() devient vrai à l'heure choisie : le téléphone sonnera comme d'habitude
            callTaken = true;
            any = true;
        }
        if (ackIds.length || callTaken) post({ action: 'ack', ids: ackIds, callTaken: callTaken }).catch(function () { /* au prochain tour */ });
        if (any) changed();
    }

    async function sync() {
        if (!cfg.lifeEnabled || syncing || !cfg.proxyUrl) return false;
        syncing = true;
        try {
            Mem.touch();
            const p = talk && talk.getSyncPayload ? await talk.getSyncPayload() : {};
            const res = await post({
                action: 'sync',
                context: p.context, memory: p.memory, playerName: p.playerName,
                tz: new Date().getTimezoneOffset(), gameTime: gameTime()
            });
            online = !!(res && res.ok);
            if (online) absorb(res);
        } catch (e) {
            online = false;
        }
        syncing = false;
        changed();
        return online;
    }

    // Le patient laisse un message : gardé dans la sauvegarde, envoyé au Worker (elle y réagira bientôt)
    async function leaveMessage(text) {
        const e = Mem.leaveMessage(text);
        if (!e) return false;
        changed();
        if (!cfg.lifeEnabled || !cfg.proxyUrl) return true;
        try { await post({ action: 'leave', text: e.text }); } catch (err) { /* il reste dans sa sauvegarde ; elle le lira à la prochaine séance */ }
        sync();
        return true;
    }

    function start() {
        if (started) return;
        started = true;
        Mem.touch();
        sync();
        timer = setInterval(function () { if (!document.hidden) sync(); }, Math.max(30, cfg.lifeSyncSec || 120) * 1000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    }

    function stop() {
        started = false;
        clearInterval(timer);
    }

    return {
        start: start, stop: stop, sync: sync,
        leaveMessage: leaveMessage,
        isOnline: function () { return online; },
        gameTime: gameTime,
        onChange: function (fn) { listeners.push(fn); }
    };
}
