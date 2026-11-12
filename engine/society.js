// society.js – la SOCIÉTÉ du jeu : toi (joueur), Evelyn, Oliver, Pluie ont les mêmes capacités.
//
// Ce fichier s'auto-branche : il suffit qu'il soit importé (phone-service.js et outside.js l'importent).
//   • registre commun (world-registry.js), SMS (messaging.js), cerveau commun (avatar-brain.js)
//   • capacités de base : aller quelque part, ouvrir/fermer, parler, écrire, conduire le taxi...
//   • les corps 3D (avatar-body.js) lisent l'état d'ici : Oliver et Pluie marchent vraiment dans la rue,
//     Oliver est au volant du vrai taxi (taxi.js), Evelyn garde son corps dans therapist-house.js.
//
// AJOUTER UNE NOUVELLE FONCTIONNALITÉ (une seule fois, n'importe où dans le jeu) :
//   BadTherapistSociety.registerFeature({
//     places:       [{ id:'cinema', name:'the cinema', x:120, z:300, public:false }],
//     objects:      [{ id:'jukebox', name:'jukebox', place:'cinema', actions:{ play:{ set:'playing' } } }],
//     capabilities: [{ id:'swim', desc:'swim in the lake', args:'', needsBody:true, run:(actor)=>'You swim.' }]
//   });
// Tous les avatars la connaissent aussitôt : pas de fichier à renvoyer, pas d'avatar à modifier.

import { registry as R } from './world-registry.js';
import { createMessaging } from './messaging.js';
import { createBrainSystem } from './avatar-brain.js';
import { THERAPIST_CONFIG } from './therapist-config.js';

const hasDom = typeof document !== 'undefined';
const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
function waitFor(fn, maxMs) {
    return new Promise(function (resolve) {
        const t0 = Date.now();
        (function poll() { if (fn() || Date.now() - t0 > maxMs) resolve(); else setTimeout(poll, 400); })();
    });
}

// Arrêts du taxi (layout.js) -> lieux du registre
const STOP_TO_PLACE = { home: 'street_front', work: 'therapist_house', town: 'town', gas: 'gas', station: 'station', train: 'station', port: 'port' };
const DOOR = { x: 0, z: -14.5 };                          // devant l'entrée de l'immeuble (repère de la rue)
const OFFS = { oliver: [3, 2.5], pluie: [-3, 2.5], evelyn: [0, 3.5] };   // chacun se tient un peu à l'écart des autres

function create() {
    const cfg = Object.assign({ rideAutoAcceptSec: 60, walkMaxMeters: 400 }, THERAPIST_CONFIG || {});
    const M = createMessaging(R);
    const brains = createBrainSystem(R, M);
    const rides = [];
    let rideId = 1;
    let taxiAt = 'street_front';
    const api = {};

    // ─── petit message à l'écran ───
    let toastBox = null;
    function toast(text) {
        if (!hasDom || !document.body) return;
        if (!toastBox) {
            toastBox = document.createElement('div');
            toastBox.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:225;display:flex;flex-direction:column;gap:6px;max-width:min(360px,80vw);pointer-events:none';
            document.body.appendChild(toastBox);
        }
        const t = document.createElement('div');
        t.textContent = text;
        t.style.cssText = "background:#050505;color:#f2f2f2;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;padding:8px 10px;font:8px/1.8 'Press Start 2P',monospace;word-wrap:break-word";
        toastBox.appendChild(t);
        while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 9000);
    }
    const player = function () { return R.actor('player'); };

    // ─── Positions (repère de la rue) : les corps 3D s'en servent ───
    function placePos(p) { return p.indoor ? { x: DOOR.x, z: DOOR.z } : { x: p.x, z: p.z }; }
    function spot(actor, placeId) {
        const p = R.place(placeId);
        if (!p) return { x: 0, z: 0 };
        const b = placePos(p);
        if (p.indoor) return b;
        const o = OFFS[actor.id] || [2, 2];
        return { x: b.x + o[0], z: b.z + o[1] };
    }
    function nearestOutdoor(x, z) {
        let best = null, bd = 1e9;
        R.places().forEach(function (pl) {
            if (pl.indoor || pl.id === 'road') return;
            const d = Math.hypot(pl.x - x, pl.z - z) - (pl.r || 20);
            if (d < bd) { bd = d; best = pl; }
        });
        return best && bd < 40 ? best.id : null;
    }

    // ─── Déplacements à pied (les corps 3D suivent actor.travel) ───
    function sameBuilding(a, b) { const t = R.place(R.topOf(a)); return R.topOf(a) === R.topOf(b) && !!t && t.kind === 'building' && !!t.indoor; }
    function travelSeconds(from, to, mode) {
        if (sameBuilding(from, to)) return 10;
        return clamp(R.dist(from, to) / (mode === 'vehicle' ? 14 : 3.2), 5, 75);
    }
    function travel(actor, placeId, mode) {
        const from = actor.loc;
        const secs = travelSeconds(from, placeId, mode);
        const a = spot(actor, from), b = spot(actor, placeId);
        const now = Date.now();
        const pf = R.place(from), pt = R.place(placeId);
        actor.dest = placeId;
        actor.busyUntil = now + secs * 1000;
        actor.travel = { fx: a.x, fz: a.z, tx: b.x, tz: b.z, t0: now, t1: now + secs * 1000, mode: mode, vis: !(pf && pt && pf.indoor && pt.indoor) };
        const p = player();
        if (p && p.loc === from && !actor.isPlayer) toast(actor.name + ' leaves.');
        return new Promise(function (resolve) {
            setTimeout(function () {
                actor.loc = placeId; actor.dest = null; actor.busyUntil = 0; actor.travel = null;
                R.discoverNear(actor);
                R.save();
                R.emit('arrive', { actor: actor, place: R.place(placeId) });
                if (p && p.loc === placeId && !actor.isPlayer) toast(actor.name + ' arrives.');
                resolve();
            }, secs * 1000);
        });
    }

    // ─── Le taxi 3D (taxi.js) : on le lit pour savoir où il est et s'il roule ───
    async function driveTaxi(driver, placeId) {
        const t = api.taxi, p = R.place(placeId);
        if (!t || !p || !t.driveTo) { await travel(driver, placeId, 'vehicle'); return placeId; }
        if (taxiAt === placeId) return placeId;
        if (!t.driveTo(p.x, p.z)) { await travel(driver, placeId, 'vehicle'); return placeId; }
        await sleep(400);
        await waitFor(function () { return t.getMode() !== 'driving'; }, 240000);
        api.syncTaxi();
        return taxiAt;
    }
    api.syncTaxi = function () {
        const t = api.taxi;
        if (!t || !t.getMode) return;
        const moving = t.getMode() === 'driving';
        if (!moving) {
            const pose = t.getPose();
            let id = nearestOutdoor(pose.x, pose.z);
            if (!id) { R.addPlace({ id: 'road', name: 'somewhere on the roads', kind: 'street', x: pose.x, z: pose.z, public: false, discoverable: false }); id = 'road'; }
            taxiAt = id;
        }
        R.actors().forEach(function (d) {
            if (d.job !== 'taxi') return;
            if (moving) { d.busyUntil = Date.now() + 3000; d.taxiBusy = true; }
            else {
                if (d.taxiBusy) { d.busyUntil = 0; d.taxiBusy = false; }
                if (d.loc !== taxiAt && !d.travel) { d.loc = taxiAt; R.discoverNear(d); R.save(); }
            }
        });
    };
    api.attachTaxi = function (taxi) { api.taxi = taxi; return taxi; };
    api.taxiAt = function () { return taxiAt; };

    // ─── CAPACITÉS DE BASE (les mêmes pour tout le monde ; needsBody = il faut un corps) ───
    R.registerCapability({ id: 'wait', desc: 'do nothing for now', args: '', run: function () { return 'You wait.'; } });

    R.registerCapability({
        id: 'go_to', needsBody: true, desc: 'walk to a place you know (inside the building, or less than ' + cfg.walkMaxMeters + ' m away)', args: '{"place":"place_id"}',
        run: function (actor, a) {
            if (actor.busyUntil > Date.now()) return 'You are still on your way.';
            if (actor.ride) return 'You are in a vehicle, you cannot walk now.';
            if (actor.job === 'taxi') return 'You are in the taxi. Use drive_to, or stop_job to get out first.';
            const p = R.findPlace(a.place || a.to);
            if (!p) return 'Unknown place.';
            if (!R.knows(actor, p.id)) return 'You do not know where that is.';
            if (p.id === actor.loc) return 'You are already there.';
            if (!sameBuilding(actor.loc, p.id) && R.dist(actor.loc, p.id) > cfg.walkMaxMeters) {
                return 'Too far to walk (' + Math.round(R.dist(actor.loc, p.id)) + ' m). Use request_ride to ask the taxi driver.';
            }
            travel(actor, p.id, 'walk');
            return 'You start walking to ' + p.name + '.';
        }
    });

    R.registerCapability({
        id: 'use_object', needsBody: true, desc: 'use an object that is in the same place as you (open a door, press a button...)', args: '{"object":"object_id","action":"action_name"}',
        run: function (actor, a) {
            const o = R.object(a.object);
            if (!o || o.place !== actor.loc) return 'That object is not here.';
            const act = o.actions && o.actions[a.action];
            if (!act) return 'You cannot "' + a.action + '" the ' + o.name + '. Possible: ' + Object.keys(o.actions || {}).join(', ') + '.';
            if (typeof act === 'function') return act(actor, R) || 'Done.';
            if (act.set !== undefined) o.state = act.set;
            R.note(actor.name + ' ' + a.action + ' the ' + o.name + '.');
            R.emit('object-used', { actor: actor, object: o, action: a.action });
            return act.say || ('You ' + a.action + ' the ' + o.name + '.');
        }
    });

    R.registerCapability({
        id: 'say', needsBody: true, desc: 'speak out loud to someone who is in the same place (leave "to" empty to speak to everyone here)', args: '{"to":"name","text":"..."}',
        run: function (actor, a) {
            let targets = R.actorsAt(actor.loc, actor.id);
            if (a.to) {
                const t = R.findActor(a.to);
                if (!t || t.loc !== actor.loc) return a.to + ' is not here. Send a text instead.';
                targets = [t];
            }
            if (!targets.length) return 'There is nobody here to hear you.';
            actor.speakingUntil = Date.now() + 4000;
            targets.forEach(function (t) { M.send(actor.id, t.id, a.text, { kind: 'say' }); });
            return 'You said it.';
        }
    });

    R.registerCapability({
        id: 'text', desc: 'send a text message from your phone to anyone, by name or number', args: '{"to":"name or number","text":"..."}',
        run: function (actor, a) {
            const t = R.findActor(a.to);
            if (actor.id === 'evelyn' && t && t.isPlayer) return 'You talk to the player by calling or leaving voicemails, not by text.';
            const r = M.send(actor.id, a.to, a.text);
            return r.ok ? 'Message sent to ' + r.to.name + '.' : r.error;
        }
    });

    // ─── Taxi ───
    R.registerCapability({
        id: 'start_job', needsBody: true, desc: 'sit at the wheel of the taxi (it must be where you are) and start your shift: people can then request rides', args: '',
        when: function (actor) { return actor.canDrive && actor.job !== 'taxi'; },
        run: function (actor) {
            if (api.taxi && actor.loc !== taxiAt) return 'The taxi is at ' + ((R.place(taxiAt) || {}).name || 'another place') + '. Go there first.';
            actor.job = 'taxi'; R.save(); R.note(actor.name + ' is now on duty with the taxi.');
            return 'You are at the wheel. People can ask you for rides.';
        }
    });
    R.registerCapability({
        id: 'stop_job', needsBody: true, desc: 'end your shift: you get out of the taxi, which stays parked', args: '',
        when: function (actor) { return actor.job === 'taxi'; },
        run: function (actor) {
            if (api.taxi && api.taxi.getMode && api.taxi.getMode() === 'driving') return 'You cannot get out while driving.';
            actor.job = null; R.save(); R.note(actor.name + ' got out of the taxi.');
            return 'You are off duty and out of the taxi.';
        }
    });
    R.registerCapability({
        id: 'drive_to', needsBody: true, desc: 'drive the taxi alone to a known place (the taxi goes to the nearest taxi stop)', args: '{"place":"place_id"}',
        when: function (actor) { return actor.job === 'taxi'; },
        run: function (actor, a) {
            const p = R.findPlace(a.place || a.to);
            if (!p || !R.knows(actor, p.id)) return 'You do not know that place.';
            if (p.id === taxiAt) return 'You are already there.';
            if (api.taxi && api.taxi.getMode() !== 'parked') return 'The taxi is busy right now.';
            driveTaxi(actor, p.id);
            return 'You start driving to ' + p.name + '.';
        }
    });
    R.registerCapability({
        id: 'request_ride', needsBody: true, desc: 'ask the taxi driver on duty to drive you to a known place', args: '{"to":"place_id"}',
        when: function (actor) { return !actor.isPlayer && actor.job !== 'taxi'; },
        run: function (actor, a) {
            if (actor.busyUntil > Date.now()) return 'You are busy moving.';
            const dest = R.findPlace(a.to || a.place);
            if (!dest || !R.knows(actor, dest.id)) return 'You do not know that destination.';
            if (dest.id === actor.loc) return 'You are already there.';
            const driver = R.actors().filter(function (x) { return x.job === 'taxi' && x.id !== actor.id; })[0];
            if (!driver) return 'No taxi driver is on duty. Text one of them to ask.';
            addRide({ from: actor.id, fromName: actor.name, driver: driver.id, pickup: actor.loc, to: dest.id }, cfg.rideAutoAcceptSec);
            return 'Ride requested. ' + driver.name + ' will answer.';
        }
    });
    function addRide(r, autoSec) {
        const ride = Object.assign({ id: rideId++, status: 'pending', at: Date.now() }, r);
        rides.push(ride);
        R.note(ride.fromName + ' asked ' + R.actor(ride.driver).name + ' for a ride.');
        brains.wake(ride.driver);
        setTimeout(function () { if (ride.status === 'pending') runRide(ride); }, autoSec * 1000);   // sans réponse : il accepte
        return ride;
    }
    R.pendingRides = function (driver) { return rides.filter(function (r) { return r.status === 'pending' && r.driver === driver.id; }); };

    // Le joueur choisit une destination dans le vrai taxi : c'est le conducteur-avatar qui accepte ou refuse (taxi.js : o.onRideRequest)
    api.onPlayerRide = function (stop, finish) {
        const driver = R.actors().filter(function (x) { return x.job === 'taxi'; })[0];
        const dest = STOP_TO_PLACE[stop && stop.id];
        if (!driver || !dest) { finish(true); return; }
        addRide({ from: 'player', fromName: 'Player', driver: driver.id, pickup: player().loc, to: dest, finish: finish }, 20);
    };

    async function runRide(ride) {
        const driver = R.actor(ride.driver), pax = R.actor(ride.from);
        if (!driver || !pax || ride.status !== 'pending') return;
        ride.status = 'accepted';
        if (ride.finish) { ride.finish(true); ride.status = 'done'; return; }          // le joueur : taxi.js conduit
        if (driver.loc !== ride.pickup) await driveTaxi(driver, ride.pickup);
        if (pax.loc !== driver.loc) { ride.status = 'cancelled'; R.note(pax.name + ' was not there when the taxi arrived.'); return; }
        pax.ride = ride.id;
        const at = await driveTaxi(driver, ride.to);
        pax.ride = null;
        pax.loc = at; driver.loc = at;
        R.discoverNear(pax); R.save();
        ride.status = 'done';
        R.note(driver.name + ' dropped ' + pax.name + ' at ' + (R.place(at) || {}).name + '.');
    }
    R.registerCapability({
        id: 'accept_ride', needsBody: true, desc: 'accept a waiting ride request (you go and pick the person up, then drive them)', args: '{"id":ride_number}',
        when: function (actor) { return actor.job === 'taxi'; },
        run: function (actor, a) {
            const r = rides.filter(function (x) { return x.id === Number(a.id) && x.driver === actor.id && x.status === 'pending'; })[0];
            if (!r) return 'No such waiting ride.';
            runRide(r);
            return 'You accept ride ' + r.id + ' and start driving.';
        }
    });
    R.registerCapability({
        id: 'decline_ride', needsBody: true, desc: 'decline a waiting ride request', args: '{"id":ride_number}',
        when: function (actor) { return actor.job === 'taxi'; },
        run: function (actor, a) {
            const r = rides.filter(function (x) { return x.id === Number(a.id) && x.driver === actor.id && x.status === 'pending'; })[0];
            if (!r) return 'No such waiting ride.';
            r.status = 'declined';
            if (r.finish) r.finish(false);
            M.send(actor.id, r.from, 'Sorry, I cannot drive you right now.');
            return 'Ride declined.';
        }
    });

    // ─── Lieux et objets (repère de la rue / immeuble.js) ───
    R.addPlace({ id: 'building', name: 'the apartment building', kind: 'building', indoor: true, x: 0, z: -29, desc: 'where everyone lives' });
    R.addPlace({ id: 'bedroom', name: "the player's bedroom", kind: 'room', indoor: true, parent: 'building', floor: 6, x: 0, z: -29, public: false, discoverable: false, desc: 'private' });
    R.addPlace({ id: 'corridor', name: 'the 6th floor corridor', kind: 'room', indoor: true, parent: 'building', floor: 6, x: 0, z: -29 });
    R.addPlace({ id: 'elevator', name: 'the elevator', kind: 'room', indoor: true, parent: 'building', x: 0, z: -29 });
    R.addPlace({ id: 'lobby', name: 'the lobby', kind: 'room', indoor: true, parent: 'building', floor: 0, x: 0, z: -29, desc: 'ground floor, mailboxes, glass front door' });
    R.addPlace({ id: 'street_front', name: 'the street in front of the building', kind: 'street', x: 0, z: -10, r: 60, desc: 'snow, the road starts here, the taxi is usually parked here' });
    R.addPlace({ id: 'road', name: 'somewhere on the roads', kind: 'street', x: 0, z: 200, public: false, discoverable: false });
    R.addPlace({ id: 'therapist_house', name: 'the small house at the end of the road', kind: 'building', x: 245.87, z: 498.38, desc: 'a quiet house with a lit window' });
    R.addPlace({ id: 'town', name: 'the mountain town', x: 0, z: 1565, r: 150 });
    R.addPlace({ id: 'gas', name: 'the gas station', x: 345, z: 335, r: 60 });
    R.addPlace({ id: 'station', name: 'the train station', x: 925, z: 905, r: 75, desc: 'trains to city B' });
    R.addPlace({ id: 'port', name: 'the port', x: 450, z: 1975, r: 100 });
    R.addPlace({ id: 'cityB', name: 'city B', x: 790, z: 1800, r: 150, public: false, discoverable: false, desc: 'library, police, prison; only reachable by train' });

    R.addObject({ id: 'bedroom_door', name: 'bedroom door', place: 'bedroom', state: 'closed', actions: { open: { set: 'open' }, close: { set: 'closed' } } });
    R.addObject({ id: 'elevator_buttons', name: 'elevator buttons', place: 'elevator', desc: 'floors 0 and 6 work for now', actions: { press: { say: 'The elevator moves.' } } });
    R.addObject({ id: 'front_door', name: 'glass front door', place: 'lobby', state: 'automatic', desc: 'opens by itself when someone is near', actions: {} });

    import('../places/layout.js').then(function (m) {
        const P = m.PLACES || {};
        ['town', 'gas', 'station', 'port', 'cityB'].forEach(function (k) { if (P[k]) R.addPlace({ id: k, x: P[k].x, z: P[k].z, r: P[k].r }); });
    }).catch(function () { /* valeurs par défaut */ });
    import('../places/map.js').then(function (m) {
        if (m.WORK_SPOT) R.addPlace({ id: 'therapist_house', x: m.WORK_SPOT.x, z: m.WORK_SPOT.z });
    }).catch(function () { /* valeurs par défaut */ });

    // ─── Les personnages (chacun a un téléphone). Evelyn : corps = therapist-house.js, cerveau de séance = therapist-ai.js,
    //     mais elle lit et écrit aussi des SMS avec Oliver et Pluie (thinks:true, noBody:true).
    const evelynNumber = (THERAPIST_CONFIG && THERAPIST_CONFIG.evelynNumber) || '555-0101';
    R.addActor({ id: 'player', name: 'Player', number: '555-0100', isPlayer: true, loc: 'bedroom', home: 'bedroom' });
    R.addActor({ id: 'evelyn', name: 'Evelyn', number: evelynNumber, external: true, thinks: true, noBody: true, loc: 'therapist_house' });
    R.addActor({ id: 'oliver', name: 'Oliver', number: '555-0102', canDrive: true, loc: 'street_front', job: 'taxi' });
    R.addActor({ id: 'pluie', name: 'Pluie', number: '555-0103', loc: 'building' });
    R.actors().forEach(function (a) { brains.add(a); });

    // ─── Messages ───
    R.on('message', function (m) {
        const from = R.actor(m.from), to = R.actor(m.to);
        if (!from || !to) return;
        R.places().forEach(function (p) {
            if (p.public || p.discoverable === false || !R.knows(from, p.id)) return;
            const t = m.text.toLowerCase();
            if (t.indexOf(p.id.toLowerCase()) !== -1 || t.indexOf(String(p.name).toLowerCase()) !== -1) R.learn(to, p.id, 'told by ' + from.name);
        });
        if (to.isPlayer) toast(from.name + ': ' + m.text);
        else if (!(to.external && from.isPlayer)) brains.wake(to.id);       // Evelyn répond au joueur par son propre circuit
    });

    // Ce qu'Evelyn « sait du moment présent » pendant ses séances et ses appels (therapist-ai.js : getWorld)
    api.evelynLines = function () {
        const L = [];
        R.actors().forEach(function (a) {
            if (a.id === 'evelyn' || a.isPlayer) return;
            const p = R.place(a.loc);
            L.push(a.name + ' (téléphone ' + a.number + ') se trouve : ' + (p ? p.name : a.loc) + '.');
        });
        M.all().filter(function (m) { const f = R.actor(m.from); return m.to === 'evelyn' && f && !f.isPlayer && Date.now() - m.at < 3 * 3600 * 1000; })
            .slice(-3).forEach(function (m) { L.push(R.actor(m.from).name + " t'a envoyé un SMS : « " + m.text + ' »'); });
        return L;
    };

    // ─── Le joueur dans le monde (appelé par apartment.js) ───
    let lastReport = 0;
    api.reportPlayer = function (pose) {
        const now = Date.now();
        if (now - lastReport < 1000 || !pose) return;
        lastReport = now;
        const p = player();
        let id = p.loc;
        if (pose.street) {
            id = nearestOutdoor(pose.street.x, pose.street.z);
            if (!id) { R.addPlace({ id: 'road', x: pose.street.x, z: pose.street.z }); id = 'road'; }
        } else if (pose.inCab) id = 'elevator';
        else if (pose.level === 0) id = 'lobby';
        else id = (pose.roomZ === undefined || pose.roomZ >= 0) ? 'bedroom' : 'corridor';
        if (id !== p.loc) { p.loc = id; R.discoverNear(p); R.emit('arrive', { actor: p, place: R.place(id) }); R.save(); }
        p.pos = pose.street ? { x: pose.street.x, z: pose.street.z } : null;
    };

    Object.assign(api, {
        registry: R, messaging: M, brains: brains, toast: toast,
        spot: spot, placePos: placePos,
        registerFeature: function (f) {
            (f.places || []).forEach(R.addPlace);
            (f.objects || []).forEach(R.addObject);
            (f.capabilities || []).forEach(R.registerCapability);
            return true;
        },
        registerCapability: R.registerCapability, addPlace: R.addPlace, addObject: R.addObject,
        addActor: function (a) { const x = R.addActor(a); brains.add(x); return x; },
        act: function (actorId, cap, args) { const a = R.actor(actorId); return a ? R.run(a, cap, args) : Promise.resolve('Unknown actor.'); },
        setLLM: brains.setLLM, setEnabled: brains.setEnabled,
        status: function () {
            return R.actors().map(function (a) { return { id: a.id, number: a.number, at: a.loc, job: a.job, moving: a.busyUntil > Date.now(), known: a.known.length }; });
        }
    });
    brains.start();
    return api;
}

export const society = (typeof window !== 'undefined' && window.BadTherapistSociety) || create();
if (typeof window !== 'undefined') window.BadTherapistSociety = society;
