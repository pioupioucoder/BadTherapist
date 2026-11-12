// messaging.js – les SMS entre tous les personnages (toi, Evelyn, Oliver, Pluie...), par nom ou par numéro.
// Tout est gardé dans la sauvegarde (localStorage). Le téléphone du joueur (phone-app.js) lit ce fichier.

const KEY = 'bt_society_msgs_v1';

export function createMessaging(R) {
    let msgs = [];
    let nextId = 1;
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.msgs)) { msgs = s.msgs; nextId = s.nextId || msgs.length + 1; } } catch (e) { /* rien */ }
    let timer = null;
    function save() {
        clearTimeout(timer);
        timer = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify({ msgs: msgs.slice(-300), nextId: nextId })); } catch (e) { /* rien */ } }, 400);
    }

    const M = {};

    // opts.kind : 'text' (SMS, défaut) ou 'say' (parole, seulement dans le même lieu)
    M.send = function (fromId, to, text, opts) {
        opts = opts || {};
        const from = R.actor(fromId);
        const dest = R.findActor(to);
        text = String(text || '').trim().slice(0, 400);
        if (!from) return { ok: false, error: 'Unknown sender.' };
        if (!dest) return { ok: false, error: 'Nobody has that name or number.' };
        if (dest.id === from.id) return { ok: false, error: 'You cannot write to yourself.' };
        if (!text) return { ok: false, error: 'Empty message.' };
        const m = { id: nextId++, at: Date.now(), from: from.id, to: dest.id, text: text, kind: opts.kind || 'text', read: false };
        msgs.push(m);
        save();
        R.emit('message', m);
        try { window.dispatchEvent(new CustomEvent('badtherapist:message', { detail: m })); } catch (e) { /* rien */ }
        return { ok: true, message: m, to: dest };
    };

    M.unread = function (actorId) { return msgs.filter(function (m) { return m.to === actorId && !m.read; }); };
    M.markRead = function (actorId, fromId) {
        let any = false;
        msgs.forEach(function (m) { if (m.to === actorId && !m.read && (!fromId || m.from === fromId)) { m.read = true; any = true; } });
        if (any) save();
    };
    M.thread = function (a, b, n) {
        return msgs.filter(function (m) { return (m.from === a && m.to === b) || (m.from === b && m.to === a); }).slice(-(n || 20));
    };
    M.all = function () { return msgs.slice(); };
    return M;
}
