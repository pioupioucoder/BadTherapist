// world-registry.js – le REGISTRE COMMUN du monde (lieux, objets, capacités, personnages).
//
// Tout le monde (toi, Evelyn, Oliver, Pluie, et ceux qui viendront) lit CE registre.
//   registry.addPlace({ id, name, x, z, ... })        -> un lieu connu de tous (ou caché : public:false)
//   registry.addObject({ id, name, place, actions })   -> un objet utilisable par tous
//   registry.registerCapability({ id, desc, args, run })-> une NOUVELLE CAPACITÉ : tous les avatars l'ont tout de suite
// Rien d'autre à modifier : le cerveau des avatars construit son prompt à partir de ce registre.

const SAVE_KEY = 'bt_society_v1';

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tant pis */ } }

export function createRegistry() {
    const places = {}, objects = {}, caps = {}, actors = {};
    const listeners = {};
    const journal = [];
    let saveTimer = null;
    const saved = lsGet(SAVE_KEY) || { actors: {} };
    const R = {};

    R.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
    R.emit = function (evt, data) {
        (listeners[evt] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.warn('[society]', evt, e); } });
    };

    // ─── Journal du monde (ce que les avatars « ont vu passer ») ───
    R.note = function (text) {
        journal.push({ at: Date.now(), text: String(text) });
        if (journal.length > 40) journal.shift();
        R.emit('note', text);
    };
    R.recentNotes = function (n) { return journal.slice(-(n || 6)).map(function (j) { return j.text; }); };

    // ─── Lieux ───
    R.addPlace = function (p) {
        if (!p || !p.id) throw new Error('addPlace : id manquant');
        const old = places[p.id] || {};
        places[p.id] = Object.assign({ name: p.id, kind: 'poi', parent: null, floor: null, x: 0, z: 0, r: 20, indoor: false, public: true, discoverable: true, desc: '' }, old, p);
        R.emit('place', places[p.id]);
        return places[p.id];
    };
    R.place = function (id) { return places[id] || null; };
    R.places = function () { return Object.keys(places).map(function (k) { return places[k]; }); };
    R.findPlace = function (q) {
        if (!q) return null;
        q = String(q).toLowerCase().trim();
        if (places[q]) return places[q];
        const all = R.places();
        for (let i = 0; i < all.length; i++) if (String(all[i].name).toLowerCase() === q) return all[i];
        for (let j = 0; j < all.length; j++) if (String(all[j].name).toLowerCase().indexOf(q) !== -1) return all[j];
        return null;
    };
    R.topOf = function (id) { let p = places[id], n = 0; while (p && p.parent && places[p.parent] && n++ < 5) p = places[p.parent]; return p ? p.id : id; };
    R.dist = function (a, b) {
        const pa = places[a], pb = places[b];
        if (!pa || !pb) return 0;
        return Math.hypot(pa.x - pb.x, pa.z - pb.z);
    };

    // ─── Objets ───
    //  actions : { open: { set:'open', say:'...' }, ... }  ou  { open: function (actor, R) { return '...'; } }
    R.addObject = function (o) {
        if (!o || !o.id) throw new Error('addObject : id manquant');
        objects[o.id] = Object.assign({ name: o.id, place: null, desc: '', state: '', actions: {} }, objects[o.id] || {}, o);
        R.emit('object', objects[o.id]);
        return objects[o.id];
    };
    R.object = function (id) { return objects[id] || null; };
    R.objectsAt = function (placeId) { return Object.keys(objects).map(function (k) { return objects[k]; }).filter(function (o) { return o.place === placeId; }); };

    // ─── Capacités (ce que TOUT personnage peut faire) ───
    //  { id, desc, args:'{place}', when(actor)->bool, run(actor, args, R)->string|Promise<string> }
    R.registerCapability = function (c) {
        if (!c || !c.id || typeof c.run !== 'function') throw new Error('registerCapability : id et run requis');
        caps[c.id] = Object.assign({ desc: '', args: '', when: null }, c);
        R.emit('capability', caps[c.id]);
        return caps[c.id];
    };
    R.capabilities = function (actor) {
        return Object.keys(caps).map(function (k) { return caps[k]; }).filter(function (c) {
            if (c.needsBody && actor && actor.noBody) return false;      // ex. Evelyn : son corps est géré par la maison, elle n'a que le téléphone
            try { return !c.when || !actor || c.when(actor); } catch (e) { return false; }
        });
    };
    R.run = async function (actor, id, args) {
        const c = caps[id];
        if (!c) return 'Unknown action "' + id + '".';
        if ((c.needsBody && actor.noBody) || (c.when && !c.when(actor))) return 'You cannot do "' + id + '" right now.';
        try { return String(await c.run(actor, args || {}, R) || 'Done.'); } catch (e) { return 'It failed (' + (e && e.message || e) + ').'; }
    };

    // ─── Personnages ───
    R.addActor = function (a) {
        if (!a || !a.id) throw new Error('addActor : id manquant');
        const s = (saved.actors && saved.actors[a.id]) || {};
        const actor = Object.assign({
            name: a.id, number: '', isPlayer: false, external: false, thinks: false, noBody: false, canDrive: false,
            loc: 'building', home: 'building', known: [], contacts: [], job: null, memory: [],
            busyUntil: 0, dest: null, lastThink: 0
        }, a);
        ['loc', 'home', 'job'].forEach(function (k) { if (s[k] !== undefined && s[k] !== null) actor[k] = s[k]; });
        if (Array.isArray(s.known)) actor.known = s.known.slice();
        if (Array.isArray(s.contacts)) actor.contacts = s.contacts.slice();
        if (Array.isArray(s.memory)) actor.memory = s.memory.slice(-12);
        actors[a.id] = actor;
        R.emit('actor', actor);
        return actor;
    };
    R.actor = function (id) { return actors[id] || null; };
    R.actors = function () { return Object.keys(actors).map(function (k) { return actors[k]; }); };
    R.findActor = function (q) {
        if (!q) return null;
        const s = String(q).toLowerCase().trim(), digits = s.replace(/\D/g, '');
        const all = R.actors();
        for (let i = 0; i < all.length; i++) {
            const a = all[i];
            if (a.id === s || String(a.name).toLowerCase() === s) return a;
            if (digits.length >= 3 && a.number && a.number.replace(/\D/g, '').slice(-digits.length) === digits) return a;
        }
        return null;
    };
    R.actorsAt = function (placeId, exceptId) { return R.actors().filter(function (a) { return a.loc === placeId && a.id !== exceptId; }); };
    // Annuaire. Sans argument : tout le monde (le téléphone du joueur). Avec un personnage : SEULEMENT les gens dont il a le numéro
    // (ceux qu'il a rencontrés ou qui lui ont écrit) : personne ne connaît personne au départ.
    R.directory = function (actor) {
        return R.actors().filter(function (a) { return !actor || (a.id !== actor.id && R.knowsPerson(actor, a.id)); })
            .map(function (a) { return { id: a.id, name: a.name, number: a.number }; });
    };
    R.knowsPerson = function (actor, otherId) { return !!actor && (actor.isPlayer || actor.contacts.indexOf(otherId) !== -1); };
    R.addContact = function (actor, otherId) {
        if (!actor || actor.isPlayer || actor.id === otherId || actor.contacts.indexOf(otherId) !== -1) return false;
        actor.contacts.push(otherId); R.save(); return true;
    };
    // Deux personnages se rencontrent (même endroit) : chacun a désormais le numéro de l'autre
    R.meet = function (a, b) {
        if (!a || !b || a.id === b.id) return false;
        const n1 = R.addContact(a, b.id), n2 = R.addContact(b, a.id);
        if (n1 || n2) { R.note(a.name + ' and ' + b.name + ' met.'); R.emit('meet', { a: a, b: b }); }
        return n1 || n2;
    };
    R.setHome = function (actorId, placeId) { const a = actors[actorId]; if (a) { a.home = placeId; R.save(); } };

    // ─── Découverte des lieux cachés ───
    R.knows = function (actor, placeId) {
        const p = places[placeId];
        if (!p) return false;
        return actor.isPlayer || p.public || actor.known.indexOf(placeId) !== -1;
    };
    R.learn = function (actor, placeId, via) {
        const p = places[placeId];
        if (!p || R.knows(actor, placeId)) return false;
        actor.known.push(placeId);
        R.note(actor.name + ' discovered ' + p.name + (via ? ' (' + via + ')' : '') + '.');
        R.emit('learn', { actor: actor, place: p, via: via });
        R.save();
        return true;
    };
    // Un lieu caché à moins de 25 m (de là où l'on est) est découvert
    R.discoverNear = function (actor) {
        const here = places[actor.loc];
        if (!here) return;
        R.places().forEach(function (p) {
            if (!p.public && p.discoverable !== false && Math.hypot(p.x - here.x, p.z - here.z) <= 25) R.learn(actor, p.id, 'passing by');
        });
    };

    // ─── Sauvegarde ───
    R.save = function () {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            const out = { actors: {} };
            R.actors().forEach(function (a) { out.actors[a.id] = { loc: a.loc, home: a.home, job: a.job, known: a.known, contacts: a.contacts, memory: a.memory.slice(-12) }; });
            lsSet(SAVE_KEY, out);
        }, 400);
    };

    return R;
}

export const registry = (typeof window !== 'undefined' && window.BadTherapistWorld) || createRegistry();
if (typeof window !== 'undefined') window.BadTherapistWorld = registry;
