// engine/phones.js – TOUT ce qui touche au téléphone, en UN seul fichier (ancien phones.js + phone-app.js + phone-service.js + messaging.js).
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH (error messages, labels...). Comments: FR. ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// Ce fichier contient trois choses :
//   1. LES MESSAGES (createMessaging)   : les SMS entre tous les personnages.
//   2. LE SYSTÈME (createPhones)        : les téléphones, leurs numéros, leurs contacts, leur journal d'appels, qui entend quoi, qui peut appeler qui.
//   3. L'ÉCRAN   (createPhoneScreen)    : ce que le joueur voit en touchant un téléphone (contacts, messages, journal d'appels, blocage).
// L'objet 3D (le téléphone qu'on voit, sa sonnerie, sa tonalité d'appel, sa lueur) reste à part : objects/phone.js.
// Il n'y a plus aucune logique de thérapeute ici : Evelyn utilise les téléphones comme tout le monde.
//
// RÈGLE : un numéro appartient à un téléphone qui est POSÉ QUELQUE PART (une pièce, une voiture...).
//         Pas de téléphone = pas de numéro = on ne peut pas appeler cette personne.
//         On n'entend un téléphone sonner que si on est à l'endroit où il est posé. Aucun pop-up : on touche le téléphone.
//
// UN TÉLÉPHONE = une ligne dans PHONE_LINES ci-dessous :
//     id      nom unique du téléphone
//     number  son numéro
//     place   le lieu du registre où il est posé (R.place(id)) ; les pièces d'un lieu comptent aussi
//     owner   l'acteur à qui il est (id d'acteur) ; null = téléphone de lieu sans propriétaire (pas encore géré par les appels)
//     seed    contacts de départ : 'all' (tous les autres téléphones) ou une liste de numéros
//
// Ajouter un téléphone (taxi, voiture de police, chez quelqu'un) = UNE ligne ici + buildPhone(...) pour l'objet 3D.
// Les contacts sont PAR TÉLÉPHONE : on peut en ajouter, en supprimer, les renommer (sauvegardé dans localStorage).
//
// Utilisation (society.js) :   const P = createPhones(R);   api.phones = P;
//     P.route(from, 'Evelyn' | '555-0101')  -> { ok, fromPhone, toPhone, toActor } ou { ok:false, error }
//     P.hears(actor, phone)                 -> cet acteur est-il assez près de ce téléphone pour l'entendre sonner ?
//     P.screen.open()                       -> ouvre l'écran du téléphone posé près du joueur (fait tout seul au clic sur un téléphone)
// Pour déboguer dans la console : BadTherapistPhoneNet.strict = false  (ancien comportement : tout le monde joignable).
// Ce fichier n'importe pas society.js (ce serait une boucle) : l'écran retrouve le jeu par window.BadTherapistSociety.

const MSG_KEY = 'bt_society_msgs_v1';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  LES MESSAGES (SMS) entre tous les personnages (toi, Evelyn, Oliver, Pluie...), par nom ou par numéro. (ancien messaging.js)
//  Tout est gardé dans la sauvegarde (localStorage, clé bt_society_msgs_v1, voir KEYS de save-data.js).
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function createMessaging(R) {
    let msgs = [];
    let nextId = 1;
    try { const s = JSON.parse(localStorage.getItem(MSG_KEY) || 'null'); if (s && Array.isArray(s.msgs)) { msgs = s.msgs; nextId = s.nextId || msgs.length + 1; } } catch (e) { /* rien */ }
    let timer = null;
    function save() {
        clearTimeout(timer);
        timer = setTimeout(function () { try { localStorage.setItem(MSG_KEY, JSON.stringify({ msgs: msgs.slice(-300), nextId: nextId })); } catch (e) { /* rien */ } }, 400);
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
        const fp = opts.fromPhone || null, tp = opts.toPhone || null;
        // écrire à soi-même n'est refusé que si c'est le MÊME téléphone : depuis le téléphone d'Evelyn, on peut écrire au sien (et inversement)
        if (dest.id === from.id && !(fp && tp && fp !== tp)) return { ok: false, error: 'You cannot write to yourself.' };
        if (!text) return { ok: false, error: 'Empty message.' };
        const m = { id: nextId++, at: Date.now(), from: from.id, to: dest.id, text: text, kind: opts.kind || 'text', read: false, fromPhone: fp, toPhone: tp };
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

    // Supprimer sa conversation avec quelqu'un : ça ne l'efface QUE pour celui qui supprime (l'autre garde la sienne).
    M.threadFor = function (me, other, n) {
        return msgs.filter(function (m) { return ((m.from === me && m.to === other) || (m.from === other && m.to === me)) && !(m.hide && m.hide[me]); }).slice(-(n || 20));
    };
    M.deleteFor = function (me, other) {
        let any = false;
        msgs.forEach(function (m) {
            if (((m.from === me && m.to === other) || (m.from === other && m.to === me)) && !(m.hide && m.hide[me])) { (m.hide = m.hide || {})[me] = 1; any = true; }
        });
        if (any) save();
        return any;
    };
    // ─── Par TÉLÉPHONE (les SMS sont rangés par téléphone : on peut s'écrire d'un téléphone à un autre) ───
    // ph = le téléphone où l'on lit ; other = le contact { phoneId, actorId } (ses SMS avec ce téléphone-là)
    function inPhoneThread(m, ph, other) {
        if (m.fromPhone || m.toPhone) return (m.fromPhone === ph.id && m.toPhone === other.phoneId) || (m.toPhone === ph.id && m.fromPhone === other.phoneId);
        // anciens messages (sans téléphone) : ils restent sur le téléphone de leur propriétaire
        return !!ph.owner && !!other.actorId && ((m.from === ph.owner && m.to === other.actorId) || (m.from === other.actorId && m.to === ph.owner));
    }
    M.threadForPhone = function (ph, other, n) {
        if (!ph || !other) return [];
        return msgs.filter(function (m) { return (!m.kind || m.kind === 'text') && inPhoneThread(m, ph, other) && !(m.hide && m.hide[ph.id]); }).slice(-(n || 20));
    };
    M.deleteForPhone = function (ph, other) {
        let any = false;
        msgs.forEach(function (m) { if ((!m.kind || m.kind === 'text') && inPhoneThread(m, ph, other) && !(m.hide && m.hide[ph.id])) { (m.hide = m.hide || {})[ph.id] = 1; any = true; } });
        if (any) save();
        return any;
    };
    // SMS reçus par ce téléphone et pas encore ouverts (pastille « 1 »)
    M.unreadPhone = function (phoneId, fromPhoneId) {
        return msgs.filter(function (m) { return (!m.kind || m.kind === 'text') && m.toPhone === phoneId && !m.seen && (!fromPhoneId || m.fromPhone === fromPhoneId) && !(m.hide && m.hide[phoneId]); }).length;
    };
    M.markSeenPhone = function (phoneId, fromPhoneId) {
        let any = false;
        msgs.forEach(function (m) { if (m.toPhone === phoneId && !m.seen && (!fromPhoneId || m.fromPhone === fromPhoneId)) { m.seen = true; any = true; } });
        if (any) save();
    };
    return M;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  LE SYSTÈME DE TÉLÉPHONES : numéros, contacts, journal d'appels, qui entend quoi
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SAVE_KEY = 'bt_phones_v1';

export const PHONE_LINES = [
    { id: 'bedroom',      number: '555-0100', place: 'bedroom',         owner: 'player', seed: 'all' },
    { id: 'evelyn-house', number: '555-0101', place: 'therapist_house', owner: 'evelyn', seed: ['555-0100'] }
    // plus tard, une ligne chacun (le numéro doit être le même que celui de l'acteur dans society.js) :
    // { id: 'taxi',       number: '555-0102', place: 'taxi',       owner: 'oliver', seed: [] },
    // { id: 'police-car', number: '555-0104', place: 'police_car', owner: 'leon',   seed: [] },
];

export function createPhones(R) {
    const phones = {};
    const P = { strict: true };
    let saved = { contacts: {} };
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && s.contacts) saved = s; } catch (e) { /* rien */ }
    if (!saved.log || typeof saved.log !== 'object') saved.log = {};          // journal d'appels : { idDuTéléphone: [ { at, dir, number, res } ] }

    let timer = null;
    function save() {
        clearTimeout(timer);
        timer = setTimeout(function () {
            Object.keys(phones).forEach(function (id) { saved.contacts[id] = phones[id].contacts; });
            try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch (e) { /* tant pis */ }
        }, 400);
    }
    const digits = function (n) { return String(n || '').replace(/\D/g, ''); };
    const same = function (a, b) { const x = digits(a), y = digits(b); return !!x && x === y; };

    // loc est-il placeId, ou une pièce dedans (parent, grand-parent...) ?
    function within(loc, placeId) {
        let id = loc, n = 0;
        while (id && n++ < 8) {
            if (id === placeId) return true;
            const p = R.place(id);
            id = p && p.parent;
        }
        return false;
    }

    // ─── Les téléphones ───
    function register(def) {
        if (!def || !def.id || !def.number) throw new Error('phones: id et number requis');
        const p = Object.assign({ place: null, owner: null, seed: [] }, def);
        const old = saved.contacts[p.id];
        p.fresh = !Array.isArray(old);
        p.contacts = Array.isArray(old) ? old : [];
        phones[p.id] = p;
        return p;
    }
    function seed(p) {
        if (!p.fresh) return;
        p.fresh = false;
        const list = p.seed === 'all'
            ? Object.keys(phones).filter(function (id) { return id !== p.id; }).map(function (id) { return phones[id].number; })
            : (p.seed || []);
        list.forEach(function (n) { addNumber(p, n, ''); });
        save();
    }
    P.add = function (def) { const p = register(def); seed(p); return p; };
    P.addAll = function (lines) { const made = lines.map(register); made.forEach(seed); };
    P.get = function (id) { return phones[id] || null; };
    P.all = function () { return Object.keys(phones).map(function (k) { return phones[k]; }); };
    P.byNumber = function (num) {
        const d = digits(num);
        if (!d) return null;
        const all = P.all();
        for (let i = 0; i < all.length; i++) if (digits(all[i].number) === d) return all[i];
        if (d.length >= 3) for (let j = 0; j < all.length; j++) if (digits(all[j].number).slice(-d.length) === d) return all[j];
        return null;
    };
    P.ofOwner = function (actorId) { return P.all().filter(function (p) { return p.owner === actorId; })[0] || null; };

    // ─── Qui est près de quel téléphone ───
    P.hears = function (actor, phone) {
        if (!phone) return !P.strict;                                  // pas de téléphone connu : seulement l'ancien comportement
        if (!actor || actor.travel || actor.ride) return false;         // en route ou en voiture : il n'est pas à côté du téléphone
        return within(actor.loc, phone.place);
    };
    // le téléphone (posé là où est l'acteur) qu'il peut utiliser maintenant ; le sien d'abord
    P.nearest = function (actor) {
        const near = P.all().filter(function (p) { return P.hears(actor, p); });
        return near.filter(function (p) { return p.owner === actor.id; })[0] || near[0] || null;
    };

    // ─── Contacts (par téléphone) ───
    function addNumber(p, number, label) {
        if (digits(number).length < 3) return { ok: false, error: 'That number is too short.' };
        if (p.contacts.some(function (c) { return same(c.number, number); })) return { ok: false, error: 'This number is already in the contacts.' };
        p.contacts.push({ number: String(number).trim().slice(0, 20), label: String(label || '').trim().slice(0, 24) });
        return { ok: true };
    }
    P.contacts = function (phoneId) {
        const p = phones[phoneId];
        if (!p) return [];
        return p.contacts.map(function (c) {
            const target = P.byNumber(c.number);
            return { number: c.number, label: c.label, phoneId: target ? target.id : null, actorId: target ? target.owner : null };
        });
    };
    P.hasContact = function (phoneId, number) { const p = phones[phoneId]; return !!p && p.contacts.some(function (c) { return same(c.number, number); }); };
    P.addContact = function (phoneId, number, label) {
        const p = phones[phoneId];
        if (!p) return { ok: false, error: 'No such phone.' };
        const r = addNumber(p, number, label);
        if (r.ok) save();
        return r;
    };
    P.removeContact = function (phoneId, number) {
        const p = phones[phoneId];
        if (!p) return false;
        const n = p.contacts.length;
        p.contacts = p.contacts.filter(function (c) { return !same(c.number, number); });
        if (p.contacts.length !== n) { save(); return true; }
        return false;
    };
    P.rename = function (phoneId, number, label) {
        const p = phones[phoneId];
        const c = p && p.contacts.filter(function (x) { return same(x.number, number); })[0];
        if (!c) return false;
        c.label = String(label || '').trim().slice(0, 24);
        save();
        return true;
    };

    // ─── Journal d'appels (chaque téléphone a le sien, comme un vrai téléphone) ───
    // entry : { dir: 'out' | 'in', number: numéro de l'autre, res: 'answered' | 'missed' }
    P.logCall = function (phoneId, entry) {
        if (!phones[phoneId] || !entry) return;
        const l = saved.log[phoneId] = saved.log[phoneId] || [];
        l.push({ at: entry.at || Date.now(), dir: entry.dir === 'in' ? 'in' : 'out', number: String(entry.number || '').slice(0, 20), res: entry.res === 'answered' ? 'answered' : 'missed' });
        while (l.length > 60) l.shift();
        save();
    };
    // appels manqués reçus depuis la dernière fois qu'on a regardé l'onglet CALLS (pastille « 1 »)
    if (!saved.seen || typeof saved.seen !== 'object') saved.seen = {};
    P.missedCount = function (phoneId) {
        const t = saved.seen[phoneId] || 0;
        return (saved.log[phoneId] || []).filter(function (c) { return c.dir === 'in' && c.res === 'missed' && c.at > t; }).length;
    };
    P.markCallsSeen = function (phoneId) { if (!phones[phoneId] || !P.missedCount(phoneId)) return; saved.seen[phoneId] = Date.now(); save(); };
    P.callLog = function (phoneId) { return (saved.log[phoneId] || []).slice().reverse(); };
    P.clearLog = function (phoneId) {
        if (!saved.log[phoneId] || !saved.log[phoneId].length) return false;
        saved.log[phoneId] = [];
        save();
        return true;
    };

    // ─── Appeler : quel téléphone sonne, et est-ce permis ? ───
    // toKey : un nom, un id d'acteur ou un numéro.
    P.route = function (from, toKey) {
        const fromPhone = from ? P.nearest(from) : null;
        let toPhone = P.byNumber(toKey);
        let toActor = toPhone && toPhone.owner ? R.actor(toPhone.owner) : null;
        if (!toPhone) {
            toActor = R.findActor(toKey);
            toPhone = toActor ? P.ofOwner(toActor.id) : null;
        }
        if (!P.strict) return { ok: true, fromPhone: fromPhone, toPhone: toPhone, toActor: toActor || R.findActor(toKey) };
        if (!fromPhone) return { ok: false, error: from && from.isPlayer ? 'There is no phone here.' : 'You are not near a phone.' };
        if (!toPhone) return { ok: false, error: toActor ? toActor.name + ' has no phone.' : 'This number does not exist.' };
        if (!toActor) return { ok: false, error: 'Nobody answers at this number.' };   // téléphone de lieu sans propriétaire : pas encore géré
        if (!P.hasContact(fromPhone.id, toPhone.number)) return { ok: false, error: 'This number is not in your contacts.' };
        return { ok: true, fromPhone: fromPhone, toPhone: toPhone, toActor: toActor };
    };

    // ─── Deux personnages se rencontrent : chacun a le numéro de l'autre sur SON téléphone ───
    function learn(a, b) {
        const mine = P.ofOwner(a.id), theirs = P.ofOwner(b.id);
        if (!mine || !theirs) return;
        const r = addNumber(mine, theirs.number, '');
        if (r.ok) save();
    }
    R.on('meet', function (e) { if (e && e.a && e.b) { learn(e.a, e.b); learn(e.b, e.a); } });

    P.addAll(PHONE_LINES);

    // ─── L'écran du téléphone (plus bas dans ce fichier) : on le touche -> il s'ouvre ───
    if (typeof window !== 'undefined') {
        const screen = createPhoneScreen({ getGameTime: gameTime });
        P.screen = screen;
        window.BadTherapistPhoneItem = screen;                                // ancien nom, au cas où un autre fichier l'utilise
        window.addEventListener('badtherapist:phone-dial', function () { screen.open(); });   // clic sur un téléphone au repos (objects/phone.js)
        window.BadTherapistPhoneNet = P;                                      // F12 : BadTherapistPhoneNet.all()
    }
    return P;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  L'ÉCRAN DU TÉLÉPHONE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Simple : deux onglets.
//   CONTACTS : les contacts de CE téléphone (celui posé là où est le joueur). Un contact -> CALL, MESSAGE, RENAME, DELETE. + ADD CONTACT.
//   CALLS    : le journal d'appels (l'historique).
// Pas de messagerie vocale, pas de compteur « nouveau », pas de « lu / pas lu » : le téléphone ne sait pas qui est là ni qui a vu quoi.
// Comme un vrai téléphone : on peut supprimer le journal d'appels (CLEAR), supprimer ses messages avec un contact, bloquer / débloquer un contact.
// L'écran a une taille fixe (les listes défilent dedans) et se ferme tout seul quand on s'éloigne du téléphone.
// Appeler = ça sonne ; si personne ne décroche, l'appel est manqué, c'est tout. Les messages d'un contact sont dans son écran (MESSAGE).
// Quand on t'appelle, le téléphone posé SONNE (objects/phone.js). Si l'écran est ouvert à ce moment, ANSWER / DECLINE y apparaissent aussi.
// Tout texte venant d'un avatar est inséré avec textContent (jamais innerHTML) : rien de ce qu'il écrit ne peut casser la page.

function gameTime() { try { return window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : ''; } catch (e) { return ''; } }

const SCREEN_CSS = `
.bpi{position:fixed;right:12px;bottom:12px;z-index:230;display:none;flex-direction:column;width:min(340px,calc(100vw - 24px));height:min(460px,calc(100vh - 24px));
  font-family:'Press Start 2P',monospace;color:#f2f2f2;background:#050505;border:4px solid #f2f2f2;box-shadow:0 0 0 4px #000;padding:12px}
.bpi-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
.bpi.on{display:flex}
.bpi *{box-sizing:border-box}
.bpi-top{flex:none;display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:1px;color:#9a9a9a;margin-bottom:10px}
.bpi-x{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:9px;padding:4px 7px;cursor:pointer}
.bpi-tabs{flex:none;display:flex;gap:6px;margin-bottom:10px}
.bpi-tab{flex:1;background:transparent;border:2px solid #555;color:#9a9a9a;font-family:inherit;font-size:7px;padding:7px 1px;cursor:pointer}
.bpi-tab.on{border-color:#f2f2f2;color:#f2f2f2}
.bpi-num{font-size:14px;margin:4px 0 10px;letter-spacing:1px}
.bpi-line{font-size:8px;line-height:1.9;color:#cfcfcf}
.bpi-line b{color:#f2f2f2;font-weight:normal}
.bpi-btn{display:block;width:100%;background:transparent;border:2px solid #f2f2f2;color:#f2f2f2;font-family:inherit;font-size:10px;padding:10px;margin-top:10px;cursor:pointer}
.bpi-btn:hover:not(:disabled){background:#f2f2f2;color:#000}
.bpi-btn:disabled{opacity:.45;cursor:default}
.bpi-in{width:100%;background:#000;border:2px solid #777;color:#f2f2f2;font-family:inherit;font-size:9px;padding:9px;margin-top:10px;outline:0}
.bpi-in:focus{border-color:#f2f2f2}
.bpi-note{font-size:8px;line-height:1.8;color:#e8c872;margin-top:8px;min-height:1.8em}
.bpi-item{border:2px solid #444;padding:8px;margin-bottom:8px;font-size:8px;line-height:1.8;word-wrap:break-word}
.bpi-item.new{border-color:#f2f2f2}
.bpi-item .d{color:#9a9a9a;margin-bottom:4px}
.bpi-play{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:8px;padding:5px 8px;margin-top:6px;cursor:pointer}
.bpi-empty{font-size:8px;color:#9a9a9a;line-height:1.8}
`;

function createPhoneScreen(opts) {
    opts = opts || {};
    let root = null, body = null, tabs = {}, clockEl = null;
    let tab = 'contacts', isOn = false, clockTimer = null, styled = false;
    let sel = null, chat = false, chatInput = null;          // contact ouvert ; on lit / écrit ses messages
    let callId = null, note = '';
    let editing = null, adding = false, draft = { name: '', number: '' };

    const el = function (tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };
    function button(label, fn, cls) {
        const b = el('button', cls || 'bpi-btn', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        return b;
    }
    function ensureStyle() {
        if (styled) return;
        styled = true;
        if (!document.getElementById('bt-pixel-font')) {
            const l = document.createElement('link');
            l.id = 'bt-pixel-font'; l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(l);
        }
        const st = document.createElement('style');
        st.textContent = SCREEN_CSS;
        document.head.appendChild(st);
    }
    function fmt(at) { return new Date(at).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    function tickClock() { if (clockEl) clockEl.textContent = new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }); }
    function society() { return window.BadTherapistSociety || null; }
    function me() { const S = society(); return S ? S.registry.actor('player') : null; }
    function myPhone() { const S = society(), m = me(); return S && S.phones && m ? S.phones.nearest(m) : null; }
    function textInput(max, ph) {
        const i = el('input', 'bpi-in');
        i.type = 'text'; i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; i.placeholder = ph;
        return i;
    }

    // Sur le téléphone, on voit le MÉTIER des PNJ, pas leur nom. Seule Evelyn garde son nom.
    // Un nouveau PNJ : ajoute une ligne ici (ou mets jobLabel sur son acteur).
    const JOB_LABELS = { oliver: 'Taxi driver', pluie: 'Journalist', violet: 'Bus driver', leon: 'Police', lou: 'Gas station', veri: 'Store', nahara: 'Restaurant' };
    function shown(a) {
        if (!a) return '?';
        const S0 = society(), ph0 = myPhone();
        const c0 = S0 && S0.phones && ph0 ? S0.phones.contacts(ph0.id).filter(function (x) { return x.actorId === a.id; })[0] : null;
        if (c0 && c0.label) return c0.label;                                  // le nom que TU as donné à ce contact
        if (a.id === 'evelyn' || a.id === 'player') return a.name;
        return a.jobLabel || JOB_LABELS[a.id] || a.name;
    }
    function contactOf(ph, key) {
        const S = society();
        if (!S || !ph || !key) return null;
        return S.phones.contacts(ph.id).filter(function (c) { return c.number === key || c.actorId === key; })[0] || null;
    }
    function nameOf(c) {
        const S = society(), a = c && c.actorId ? S.registry.actor(c.actorId) : null;
        return (c && c.label) || (a ? shown(a) : (c ? c.number : '?'));
    }
    function back() { sel = null; chat = false; editing = null; note = ''; render(); }

    // ─── Appel entrant : visible sur tous les onglets (si l'écran est ouvert) ───
    function renderIncoming() {
        const S = society();
        if (!S || callId) return;
        S.calls.incoming('player').filter(function (c) { return c.from !== 'player'; }).forEach(function (c) {
            const who = S.registry.actor(c.from);
            const box = el('div', 'bpi-item new');
            box.appendChild(el('div', 'd', (who ? shown(who).toUpperCase() : '?') + ' IS CALLING YOU'));
            box.appendChild(button('ANSWER', function () { S.calls.answer('player'); callId = c.id; tab = 'contacts'; sel = c.from; render(); }));
            box.appendChild(button('DECLINE', function () { S.calls.hangUp('player'); render(); }, 'bpi-play'));
            body.appendChild(box);
        });
    }

    // ─── Onglet CONTACTS ───
    function renderContacts() {
        const S = society();
        if (!S || !S.phones) { body.appendChild(el('div', 'bpi-empty', 'The phone is not loaded.')); return; }
        if (callId) { renderCall(S); return; }
        const ph = myPhone();
        if (!ph) { body.appendChild(el('div', 'bpi-empty', 'There is no phone here.')); return; }
        if (sel) { renderContact(S, ph); return; }
        if (adding) { renderAdd(S, ph); return; }
        body.appendChild(el('div', 'bpi-line', 'THIS PHONE'));
        body.appendChild(el('div', 'bpi-num', ph.number));
        const real = el('div', 'bpi-line');
        real.appendChild(document.createTextNode('TIME: '));
        clockEl = el('b', null, '');
        real.appendChild(clockEl);
        body.appendChild(real);
        tickClock();
        const g = gameTime();
        if (g) { const l = el('div', 'bpi-line'); l.appendChild(document.createTextNode('GAME TIME: ')); l.appendChild(el('b', null, g)); body.appendChild(l); }
        body.appendChild(el('div', 'bpi-line', ' '));
        body.appendChild(el('div', 'bpi-line', 'CONTACTS'));
        const list = S.phones.contacts(ph.id);
        if (!list.length) body.appendChild(el('div', 'bpi-empty', 'No contacts yet.'));
        list.forEach(function (c) {
            const nu = c.phoneId ? S.messaging.unreadPhone(ph.id, c.phoneId) : 0;
            body.appendChild(button((nu ? '(' + nu + ') ' : '') + nameOf(c).toUpperCase() + '  ' + c.number, function () { sel = c.number; chat = false; editing = null; note = ''; render(); }));
        });
        body.appendChild(button('+ ADD CONTACT', function () { adding = true; note = ''; render(); }, 'bpi-play'));
    }

    function renderContact(S, ph) {
        const c = contactOf(ph, sel);
        if (!c) { back(); return; }
        body.appendChild(button('< BACK', back, 'bpi-play'));
        body.appendChild(el('div', 'bpi-num', nameOf(c)));
        body.appendChild(el('div', 'bpi-line', c.number));
        if (editing === 'rename') {
            const inp = textInput(24, 'Name...');
            inp.value = c.label || '';
            const save = function () { S.phones.rename(ph.id, c.number, inp.value); editing = null; render(); };
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
            body.appendChild(inp);
            body.appendChild(button('SAVE NAME', save));
            body.appendChild(button('CANCEL', function () { editing = null; render(); }, 'bpi-play'));
            setTimeout(function () { inp.focus(); }, 0);
            return;
        }
        if (editing === 'delete') {
            body.appendChild(el('div', 'bpi-line', 'Delete this contact?'));
            body.appendChild(button('YES, DELETE', function () { S.phones.removeContact(ph.id, c.number); back(); }));
            body.appendChild(button('CANCEL', function () { editing = null; render(); }, 'bpi-play'));
            return;
        }
        if (chat) { renderChat(S, c); return; }
        const blocked = !!(S.blocks && c.actorId && S.blocks.isBlocking('player', c.actorId));
        if (blocked) body.appendChild(el('div', 'bpi-note', 'BLOCKED'));
        body.appendChild(button('CALL', function () { startCall(c.number); }));
        body.appendChild(button('MESSAGE', function () { chat = true; note = ''; render(); }));
        body.appendChild(button('RENAME', function () { editing = 'rename'; render(); }, 'bpi-play'));
        if (S.blocks && c.actorId) {
            body.appendChild(button(blocked ? 'UNBLOCK' : 'BLOCK', function () {
                const r = blocked ? S.blocks.unblock('player', c.actorId) : S.blocks.block('player', c.actorId);
                note = r.ok ? '' : r.error;
                render();
            }, 'bpi-play'));
        }
        body.appendChild(button('DELETE CONTACT', function () { editing = 'delete'; render(); }, 'bpi-play'));
        if (!blocked) body.appendChild(el('div', 'bpi-note', note));
    }

    // Les derniers messages écrits avec ce contact. Aucun « lu / pas lu ».
    function renderChat(S, c) {
        const ph = myPhone();
        const target = c.number;          // par numéro : le message va à CE téléphone-là, même si c'est un téléphone à soi
        if (ph && c.phoneId) S.messaging.markSeenPhone(ph.id, c.phoneId);
        body.appendChild(button('< CONTACT', function () { chat = false; note = ''; render(); }, 'bpi-play'));
        const msgs = ph ? S.messaging.threadForPhone(ph, c, 30) : [];
        if (!msgs.length) body.appendChild(el('div', 'bpi-empty', 'No messages.'));
        msgs.forEach(function (m) {
            const mine = m.fromPhone ? m.fromPhone === ph.id : m.from === 'player';
            const box = el('div', 'bpi-item' + (mine ? '' : ' new'));
            box.appendChild(el('div', 'd', (mine ? 'YOU' : nameOf(c).toUpperCase()) + '  ' + fmt(m.at)));
            box.appendChild(el('div', null, m.text));
            body.appendChild(box);
        });
        chatInput = textInput(300, 'Write...');
        const send = function () {
            const v = chatInput.value.trim();
            if (!v) return;
            const r = S.messaging.send('player', target, v, { fromPhone: ph ? ph.id : null });
            note = r && r.ok === false ? (r.error || '') : '';
            render();
            if (chatInput) chatInput.focus();
        };
        chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
        body.appendChild(chatInput);
        body.appendChild(button('SEND', send));
        if (msgs.length && ph) {
            if (editing === 'wipe') {
                body.appendChild(el('div', 'bpi-line', 'Delete these messages? (only on your side)'));
                body.appendChild(button('YES, DELETE', function () { S.messaging.deleteForPhone(ph, c); editing = null; render(); }));
                body.appendChild(button('CANCEL', function () { editing = null; render(); }, 'bpi-play'));
            } else {
                body.appendChild(button('DELETE MESSAGES', function () { editing = 'wipe'; render(); }, 'bpi-play'));
            }
        }
        body.appendChild(el('div', 'bpi-note', note));
    }

    function renderAdd(S, ph) {
        body.appendChild(button('< BACK', function () { adding = false; draft = { name: '', number: '' }; note = ''; render(); }, 'bpi-play'));
        body.appendChild(el('div', 'bpi-num', 'NEW CONTACT'));
        const nm = textInput(24, 'Name...'), nb = textInput(20, 'Number (555-...)');
        nm.value = draft.name; nb.value = draft.number;
        nm.addEventListener('input', function () { draft.name = nm.value; });
        nb.addEventListener('input', function () { draft.number = nb.value; });
        const save = function () {
            const r = S.phones.addContact(ph.id, nb.value, nm.value);
            if (r.ok) { adding = false; draft = { name: '', number: '' }; note = ''; } else note = r.error;
            render();
        };
        nb.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        body.appendChild(nm);
        body.appendChild(nb);
        body.appendChild(button('SAVE', save));
        body.appendChild(el('div', 'bpi-note', note));
    }

    // ─── Appeler ───
    function startCall(key) {
        const S = society();
        const r = S.calls.start('player', key);
        if (!r.ok) { note = r.error; callId = null; render(); return; }
        callId = r.call.id; note = ''; render();
    }
    function endCall() { callId = null; sel = null; chat = false; render(); }

    function renderCall(S) {
        const R = S.registry, M = S.messaging;
        const c = S.calls.get(callId);
        if (!c) { callId = null; render(); return; }
        const other = R.actor(c.from === 'player' ? c.to : c.from);
        const name = other ? shown(other) : '?';
        body.appendChild(el('div', 'bpi-num', name));
        if (c.status === 'ringing') {
            body.appendChild(el('div', 'bpi-line', 'CALLING... it rings.'));
            body.appendChild(button('HANG UP', function () { S.calls.hangUp('player'); endCall(); }));
            return;
        }
        if (c.status === 'active') {
            body.appendChild(el('div', 'bpi-line', 'ON THE PHONE'));
            M.thread('player', other.id, 40).filter(function (m) { return m.kind === 'call' && m.at >= (c.answeredAt || c.at); }).forEach(function (m) {
                const mine = m.from === 'player';
                const box = el('div', 'bpi-item' + (mine ? '' : ' new'));
                box.appendChild(el('div', 'd', mine ? 'YOU' : name.toUpperCase()));
                box.appendChild(el('div', null, m.text));
                body.appendChild(box);
            });
            chatInput = textInput(300, 'Say something...');
            const say = function () {
                const v = chatInput.value.trim();
                if (!v) return;
                chatInput.value = '';
                M.send('player', other.id, v, { kind: 'call' });
                render();
                if (chatInput) chatInput.focus();
            };
            chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); say(); } });
            body.appendChild(chatInput);
            body.appendChild(button('SAY', say));
            body.appendChild(button('HANG UP', function () { S.calls.hangUp('player'); endCall(); }, 'bpi-play'));
            return;
        }
        if (c.status === 'ended') { body.appendChild(el('div', 'bpi-line', 'THE CALL IS OVER.')); body.appendChild(button('OK', endCall)); return; }
        // manqué : personne n'a décroché
        body.appendChild(el('div', 'bpi-line', 'NO ANSWER.'));
        body.appendChild(button('CALL AGAIN', function () { startCall(other.id); }));
        body.appendChild(button('SEND A MESSAGE', function () { callId = null; sel = other.id; chat = true; render(); }, 'bpi-play'));
        body.appendChild(button('CLOSE', endCall, 'bpi-play'));
        body.appendChild(el('div', 'bpi-note', note));
    }

    // ─── Onglet CALLS : le journal d'appels de CE téléphone ───
    function renderCalls() {
        const S = society();
        const ph = myPhone();
        if (!S || !S.phones || !ph) { body.appendChild(el('div', 'bpi-empty', 'There is no phone here.')); return; }
        const list = S.phones.callLog(ph.id).slice(0, 40);
        const nNew = S.phones.missedCount(ph.id);          // les appels manqués les plus récents sont en surbrillance, puis ils sont « vus »
        let shownNew = 0;
        S.phones.markCallsSeen(ph.id);
        if (!list.length) { body.appendChild(el('div', 'bpi-empty', 'No calls yet.')); return; }
        list.forEach(function (c) {
            const out = c.dir === 'out';
            const k = contactOf(ph, c.number);
            const target = S.phones.byNumber(c.number);
            const a = target && target.owner ? S.registry.actor(target.owner) : null;
            const nm = k ? nameOf(k) : (a ? shown(a) : c.number);
            const res = c.res === 'answered' ? 'ANSWERED' : (out ? 'NO ANSWER' : 'MISSED');
            const isNew = !out && c.res !== 'answered' && shownNew < nNew;
            if (isNew) shownNew++;
            const box = el('div', 'bpi-item' + (isNew ? ' new' : ''));
            box.appendChild(el('div', 'd', fmt(c.at)));
            box.appendChild(el('div', null, (out ? 'YOU CALLED ' : 'CALLED YOU: ') + String(nm).toUpperCase() + ' - ' + res));
            body.appendChild(box);
        });
        if (editing === 'clear') {
            body.appendChild(el('div', 'bpi-line', 'Delete the call history?'));
            body.appendChild(button('YES, DELETE', function () { S.phones.clearLog(ph.id); editing = null; render(); }));
            body.appendChild(button('CANCEL', function () { editing = null; render(); }, 'bpi-play'));
        } else {
            body.appendChild(button('CLEAR HISTORY', function () { editing = 'clear'; render(); }, 'bpi-play'));
        }
    }

    function render() {
        if (!root) return;
        const keep = chatInput ? chatInput.value : '';
        chatInput = null;
        body.textContent = '';
        clockEl = null;
        Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('on', k === tab); });
        const S0 = society(), ph0 = myPhone();
        const nMiss = S0 && S0.phones && ph0 && tab !== 'calls' ? S0.phones.missedCount(ph0.id) : 0;
        const nMsg = S0 && S0.messaging && ph0 ? S0.messaging.unreadPhone(ph0.id) : 0;
        tabs.calls.textContent = 'CALLS' + (nMiss ? ' (' + nMiss + ')' : '');
        tabs.contacts.textContent = 'CONTACTS' + (nMsg && !chat ? ' (' + nMsg + ')' : '');
        renderIncoming();
        if (tab === 'calls') renderCalls(); else renderContacts();
        if (chatInput && keep) chatInput.value = keep;
    }

    // ─── Ouverture / fermeture ───
    // callNow() : ouvre la liste de contacts ; avec un numéro ou un id : appelle ce contact.
    function callNow(key) {
        tab = 'contacts';
        show(); render();
        if (typeof key === 'string' && society()) startCall(key);
        return null;
    }

    function build() {
        if (root) return;
        ensureStyle();
        root = el('div', 'bpi');
        const top = el('div', 'bpi-top');
        top.appendChild(el('span', null, 'PHONE'));
        top.appendChild(button('X', hide, 'bpi-x'));
        root.appendChild(top);
        const bar = el('div', 'bpi-tabs');
        [['contacts', 'CONTACTS'], ['calls', 'CALLS']].forEach(function (t) {
            const b = el('button', 'bpi-tab', t[1]);
            b.type = 'button';
            b.addEventListener('click', function () { tab = t[0]; editing = null; render(); });
            tabs[t[0]] = b;
            bar.appendChild(b);
        });
        root.appendChild(bar);
        body = el('div', 'bpi-body');
        root.appendChild(body);
        document.body.appendChild(root);
        root.addEventListener('keydown', function (e) {           // les touches tapées ici ne font pas marcher Chippy
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); hide(); }
        });
        window.addEventListener('badtherapist:message', function () { if (isOn) render(); });
        window.addEventListener('badtherapist:call', function (ev) {
            const d = ev.detail || {};
            if ((d.from === 'player' || d.to === 'player') && d.state === 'active') callId = d.id;      // un appel vient d'être décroché
            if (isOn) render();
        });
    }
    function show() {
        build();
        if (isOn) return;
        isOn = true;
        root.classList.add('on');
        clearInterval(clockTimer);
        clockTimer = setInterval(function () {
            tickClock();
            if (!myPhone() && !callId) hide();          // on s'est éloigné du téléphone : l'écran se range
        }, 1500);
    }
    function hide() { isOn = false; clearInterval(clockTimer); if (root) root.classList.remove('on'); }
    function open() { show(); render(); }
    function toggle() { if (isOn) hide(); else open(); }
    return { open: open, close: hide, toggle: toggle, callNow: callNow, isOpen: function () { return isOn; } };
}
