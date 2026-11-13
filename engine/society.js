// society.js – la SOCIÉTÉ du jeu : toi (Chippy), Evelyn, Oliver, Pluie ont les mêmes capacités, le même téléphone, la même mémoire.
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
import { Mind } from './avatar-mind.js';
import { Mem } from './therapist-memory.js';

const PLAYER_NAME = 'Chippy';      // le prénom de ton personnage : change-le ici, nulle part ailleurs
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

    // ─── BLOCAGE (pareil pour tout le monde) : le bloqué le SAIT, celui qui bloque aussi ───
    const BLK_KEY = 'bt_blocks_v1';
    let blk = {};
    try { blk = JSON.parse(localStorage.getItem(BLK_KEY) || '{}') || {}; } catch (e) { blk = {}; }
    function saveBlk() { try { localStorage.setItem(BLK_KEY, JSON.stringify(blk)); } catch (e) { /* tant pis */ } }
    function isBlocking(by, who) { return !!(blk[by] && blk[by][who]); }
    function blockError(from, to) {
        if (isBlocking(to.id, from.id)) return to.name + ' has blocked you: your calls and texts do not reach them.';
        if (isBlocking(from.id, to.id)) return 'You blocked ' + to.name + '. Unblock them first if you want to reach them.';
        return '';
    }
    // le téléphone du joueur est chez lui : il n'entend les appels que s'il y est (changeable : phoneRooms dans therapist-config.js)
    function nearPhone() { const p = R.actor('player'); return !!p && (cfg.phoneRooms || ['bedroom']).indexOf(p.loc) !== -1; }
    const rawSend = M.send;
    M.send = function (fromId, toKey, text, o) {
        const f = R.actor(fromId), t = R.findActor(toKey);
        if (f && t && !(o && o.kind === 'say')) { const e = blockError(f, t); if (e) return { ok: false, error: e }; }   // parler en face à face n'est jamais bloqué
        return rawSend.apply(M, arguments);
    };
    // combien de messages d'affilée sans réponse (pour qu'un avatar n'enchaîne pas les SMS)
    function unanswered(fromId, toId) {
        const L = M.all().filter(function (m) { return m.kind !== 'say' && m.kind !== 'call' && ((m.from === fromId && m.to === toId) || (m.from === toId && m.to === fromId)); });
        let n = 0;
        for (let i = L.length - 1; i >= 0; i--) { if (L[i].from === fromId) n++; else break; }
        return n;
    }
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
        id: 'say', desc: 'speak: out loud to someone in the same place (leave "to" empty to speak to everyone here), or into the phone when you are on a call', args: '{"to":"name","text":"..."}',
        run: function (actor, a) {
            const text = String(a.text || '').trim();
            if (!text) return 'You have nothing to say.';
            // au téléphone : la parole va à l'interlocuteur, où qu'il soit
            const call = callOf(actor.id);
            if (call && call.status === 'active') {
                const other = R.actor(call.from === actor.id ? call.to : call.from);
                if (other && (!a.to || R.findActor(a.to) === other) && other.loc !== actor.loc) {
                    M.send(actor.id, other.id, text, { kind: 'call' });
                    return 'You said it on the phone.';
                }
            }
            if (!a.to && !R.actorsAt(actor.loc, actor.id).length) return 'There is nobody here to hear you.';
            let targets = R.actorsAt(actor.loc, actor.id);
            if (a.to) {
                const t = R.findActor(a.to);
                if (!t || t.loc !== actor.loc) return (a.to) + ' is not here. Call or text instead.';
                targets = [t];
            }
            if (!targets.length) return 'There is nobody here to hear you.';
            actor.speakingUntil = Date.now() + 4000;
            R.emit('speech', { actor: actor, text: text, to: targets.map(function (t) { return t.id; }) });
            targets.forEach(function (t) { M.send(actor.id, t.id, text, { kind: 'say' }); });
            return 'You said it.';
        }
    });

    R.registerCapability({
        id: 'text', desc: 'send a text message from your phone to anyone, by name or number', args: '{"to":"name or number","text":"..."}',
        run: function (actor, a) {
            const t = R.findActor(a.to);
            if (!t) return 'Unknown person.';
            if (!R.knowsPerson(actor, t.id)) return 'You do not have this person\'s number. You only get to know people by meeting them (being in the same place).';
            if (!actor.isPlayer && t.loc === actor.loc && !t.travel) return t.name + ' is right here with you: speak with say instead of texting.';
            if (!actor.isPlayer && unanswered(actor.id, t.id) >= 2) return 'You already wrote to ' + t.name + ' twice and got no answer. Wait for a reply before writing again.';
            const r = M.send(actor.id, a.to, a.text);
            return r.ok ? 'Message sent to ' + r.to.name + '.' : r.error;
        }
    });

    // ─── TÉLÉPHONE (pareil pour tout le monde) : appeler -> décrocher ou non -> sinon répondeur / SMS ───
    const calls = [];                      // { id, from, to, status: ringing | active | missed | ended, at }
    let callId = 1;
    const RING_MS = (cfg.ringSeconds || 25) * 1000;
    function callOf(actorId) { return calls.filter(function (c) { return (c.status === 'ringing' || c.status === 'active') && (c.from === actorId || c.to === actorId); })[0] || null; }
    api.calls = {
        incoming: function (id) { return calls.filter(function (c) { return c.status === 'ringing' && c.to === id; }); },
        active: function (id) { return calls.filter(function (c) { return c.status === 'active' && (c.from === id || c.to === id); })[0] || null; },
        missedFor: function (id) { const l = calls.filter(function (c) { return c.status === 'missed' && c.from === id && !c.told; }); l.forEach(function (c) { c.told = true; }); return l; },
        get: function (cid) { return calls.filter(function (c) { return c.id === cid; })[0] || null; },
        list: function () { return calls.slice(-60); },
        start: function (fromId, toKey) {
            const from = R.actor(fromId), to = R.findActor(toKey);
            if (!from || !to || to.id === from.id) return { ok: false, error: 'Nobody to call.' };
            if (!R.knowsPerson(from, to.id)) return { ok: false, error: 'You do not have this person\'s number. You only get to know people by meeting them.' };
            const be = blockError(from, to); if (be) return { ok: false, error: be };
            if (!from.isPlayer && calls.some(function (x) { return x.from === from.id && x.to === to.id && x.status === 'missed' && Date.now() - x.at < 10 * 60000; })) return { ok: false, error: 'You already tried to call them a moment ago. Text them, or try again much later.' };
            if (callOf(from.id)) return { ok: false, error: 'You are already on a call.' };
            if (callOf(to.id)) { const bc = { id: callId++, from: from.id, to: to.id, status: 'ringing', at: Date.now() }; calls.push(bc); return { ok: true, call: finishCall(bc, 'missed'), busy: true }; }   // occupé : comme un appel manqué
            const c = { id: callId++, from: from.id, to: to.id, status: 'ringing', at: Date.now() };
            calls.push(c);
            Mind.noteCall(from.id, to.id, to.name, 'call_out');
            Mind.noteCall(to.id, from.id, from.name, 'call_in');
            R.note(from.name + ' is calling ' + to.name + '.');
            const rings = !to.isPlayer || nearPhone();                 // le joueur n'entend son téléphone que chez lui : sinon appel manqué
            c.silent = !rings;
            if (rings) {
                R.emit('call', { call: c, state: 'ringing' });
                try { window.dispatchEvent(new CustomEvent('badtherapist:call', { detail: { id: c.id, from: c.from, to: c.to, state: 'ringing' } })); } catch (e) { /* rien */ }
            }
            if (!to.isPlayer) brains.wake(to.id, true);
            setTimeout(function () { if (c.status === 'ringing') finishCall(c, 'missed'); }, RING_MS);        // sans réponse : appel manqué
            return { ok: true, call: c };
        },
        answer: function (actorId) {
            const c = api.calls.incoming(actorId)[0];
            if (!c) return false;
            if (R.actor(actorId) && R.actor(actorId).isPlayer && !nearPhone()) return false;
            c.status = 'active'; c.answeredAt = Date.now();
            R.emit('call', { call: c, state: 'active' });
            try { window.dispatchEvent(new CustomEvent('badtherapist:call', { detail: { id: c.id, from: c.from, to: c.to, state: 'active' } })); } catch (e) { /* rien */ }
            const f = R.actor(c.from); if (f && !f.isPlayer) brains.wake(f.id, true);
            return true;
        },
        hangUp: function (actorId) {
            const c = callOf(actorId);
            if (!c) return false;
            finishCall(c, c.status === 'ringing' && c.to === actorId ? 'missed' : 'ended');
            return true;
        }
    };
    function finishCall(c, status) {
        c.status = status;
        if (status === 'missed') {
            const to = R.actor(c.to);
            Mind.noteCall(c.to, c.from, (R.actor(c.from) || {}).name, 'missed');
            if (!(R.actor(c.from) && R.actor(c.from).isPlayer)) brains.wake(c.from);
        } else {
            if (c.answeredAt) {                         // la mémoire des deux : l'appel a eu lieu
                Mind.noteCall(c.from, c.to, (R.actor(c.to) || {}).name, 'call_done');
                Mind.noteCall(c.to, c.from, (R.actor(c.from) || {}).name, 'call_done');
            }
            const o = R.actor(c.from);
            if (o && !o.isPlayer) brains.wake(o.id);
        }
        R.emit('call', { call: c, state: status });
        try { window.dispatchEvent(new CustomEvent('badtherapist:call', { detail: { id: c.id, from: c.from, to: c.to, state: status } })); } catch (e) { /* rien */ }
        return c;
    }
    brains.setCalls(api.calls);

    R.registerCapability({
        id: 'call', desc: 'phone someone you have the number of (they may not answer)', args: '{"to":"name or number"}',
        run: function (actor, a) {
            const r = api.calls.start(actor.id, a.to);
            if (!r.ok) return r.error;
            return r.busy ? 'The line is busy.' : 'It rings...';
        }
    });
    R.registerCapability({
        id: 'answer_call', desc: 'pick up your ringing phone', args: '',
        run: function (actor) { return api.calls.answer(actor.id) ? 'You pick up. You can speak with say.' : 'Your phone is not ringing.'; }
    });
    R.registerCapability({
        id: 'hang_up', desc: 'end the call, or refuse a ringing call', args: '',
        run: function (actor) { return api.calls.hangUp(actor.id) ? 'You hang up.' : 'You are not on a call.'; }
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
        addRide({ from: 'player', fromName: player().name, driver: driver.id, pickup: player().loc, to: dest, finish: finish }, 20);
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
    R.addPlace({ id: 'bedroom', name: "Chippy's bedroom", kind: 'room', indoor: true, parent: 'building', floor: 6, x: 0, z: -29, public: false, discoverable: false, desc: 'private' });
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
    //     mais elle sort, marche, lit et écrit des SMS comme Oliver et Pluie (thinks:true).
    const evelynNumber = (THERAPIST_CONFIG && THERAPIST_CONFIG.evelynNumber) || '555-0101';
    R.addActor({ id: 'player', name: PLAYER_NAME, number: '555-0100', isPlayer: true, loc: 'bedroom', home: 'bedroom' });   // isPlayer = seulement « quel corps répond au clavier » : aucune décision d'avatar n'en dépend
    R.addActor({ id: 'evelyn', name: 'Evelyn', number: evelynNumber, thinks: true, loc: 'therapist_house' });   // comme Oliver et Pluie : corps de rue (avatar-body.js), téléphone, cerveau, mémoire
    R.addActor({ id: 'oliver', name: 'Oliver', number: '555-0102', canDrive: true, loc: 'street_front', job: 'taxi' });
    R.addActor({ id: 'pluie', name: 'Pluie', number: '555-0103', loc: 'building' });
    R.actors().forEach(function (a) { brains.add(a); });

    // Une vieille sauvegarde pouvait la mettre « dans l'immeuble » ou nulle part : elle repart de chez elle
    const evelynActor = R.actor('evelyn');
    if (evelynActor && (!R.place(evelynActor.loc) || evelynActor.loc === 'building')) evelynActor.loc = 'therapist_house';

    // ─── Rencontres : deux personnages au même endroit se connaissent (ils échangent leur numéro) ───
    //     'building' (tout l'immeuble) et 'road' (n'importe où sur les routes) ne comptent pas comme « au même endroit ».
    setInterval(function () {
        const here = {};
        R.actors().forEach(function (a) {
            if (a.loc === 'building' || a.loc === 'road' || a.busyUntil > Date.now()) return;
            (here[a.loc] = here[a.loc] || []).push(a);
        });
        Object.keys(here).forEach(function (loc) {
            const g = here[loc];
            for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
                if (R.meet(g[i], g[j])) { brains.wake(g[i].id); brains.wake(g[j].id); }
            }
        });
    }, 2000);

    // ─── Messages ───
    R.on('message', function (m) {
        const from = R.actor(m.from), to = R.actor(m.to);
        if (!from || !to) return;
        R.places().forEach(function (p) {
            if (p.public || p.discoverable === false || !R.knows(from, p.id)) return;
            const t = m.text.toLowerCase();
            if (t.indexOf(p.id.toLowerCase()) !== -1 || t.indexOf(String(p.name).toLowerCase()) !== -1) R.learn(to, p.id, 'told by ' + from.name);
        });
        R.addContact(to, from.id);
        if (m.kind === 'call') R.emit('speech', { actor: from, text: m.text, to: [to.id], phone: true });
        else brains.wake(to.id, m.kind === 'say' || m.kind === 'call');       // même règle pour tout le monde ; une conversation en direct réveille vite
    });

    // Ce qu'Evelyn « sait du moment présent » pendant ses séances et ses appels (therapist-ai.js : getWorld)
    api.evelynLines = function () {
        const L = [];
        const me = R.actor('evelyn');
        R.actors().forEach(function (a) {
            if (a.id === 'evelyn' || a.isPlayer || !R.knowsPerson(me, a.id)) return;
            const p = R.place(a.loc);
            L.push(a.name + ' (téléphone ' + a.number + ') se trouve : ' + (p ? p.name : a.loc) + '.');
        });
        M.all().filter(function (m) { const f = R.actor(m.from); return m.to === 'evelyn' && f && !f.isPlayer && R.knowsPerson(me, f.id) && Date.now() - m.at < 3 * 3600 * 1000; })
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

    // L'ancienne mémoire d'Evelyn (therapist-memory.js) reste lisible par son cerveau tant que tout n'est pas migré
    Mind.addLegacy('evelyn', function (hint) { return Mem.promptBlock(hint); });
    // Les bulles de parole : une par avatar qui parle (elles suivent les corps 3D)
    import('./speech-bubbles.js').then(function (m) {
        R.on('speech', function (e) {
            if (!e || !e.actor || e.actor.isPlayer) return;
            if (e.phone) {                                                   // au téléphone : même dialogue (bip, lettre par lettre, on répond), mais dans la boîte d'appel
                if (e.to && e.to.indexOf(player().id) !== -1) m.Bubbles.phone(e.actor.id, e.actor.name, e.text);
                return;
            }
            m.Bubbles.say(e.actor.id, e.actor.name, e.text);                 // face à face : la bulle au-dessus de la tête
        });
        R.on('call', function (e) {
            const c = e && e.call; if (!c) return;
            const pid = player().id;
            if (c.from !== pid && c.to !== pid) return;
            const o = R.actor(c.from === pid ? c.to : c.from);
            if (e.state === 'active') m.Bubbles.phoneOpen(o.id, o.name);
            else if (e.state === 'ended' || e.state === 'missed') m.Bubbles.phoneClose(o.id);
        });
        m.Bubbles.setHangUp(function () { api.calls.hangUp(player().id); });
        // Tu réponds (bulle, clic, ENTRÉE) : c'est la même action « say » que pour n'importe qui, adressée à cet avatar
        m.Bubbles.setReply(function (toId, text) { return api.act(player().id, 'say', { to: toId, text: text }); });
    }).catch(function () { /* pas de bulles */ });

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
    api.blocks = {
        block: function (byId, whoKey) {
            const by = R.actor(byId), who = R.findActor(whoKey);
            if (!by || !who || by.id === who.id) return { ok: false, error: 'Nobody to block.' };
            (blk[by.id] = blk[by.id] || {})[who.id] = Date.now(); saveBlk();
            const c = callOf(by.id);
            if (c && (c.from === who.id || c.to === who.id)) finishCall(c, 'ended');
            Mind.noteCall(by.id, who.id, who.name, 'blocked');
            Mind.noteCall(who.id, by.id, by.name, 'blocked_by');
            return { ok: true };
        },
        unblock: function (byId, whoKey) {
            const by = R.actor(byId), who = R.findActor(whoKey);
            if (!by || !who || !isBlocking(by.id, who.id)) return { ok: false, error: 'That person is not blocked.' };
            delete blk[by.id][who.id]; saveBlk();
            return { ok: true };
        },
        isBlocking: function (byId, whoId) { return isBlocking(byId, whoId); },          // byId a-t-il bloqué whoId ?
        blockedBy: function (id) { return Object.keys(blk).filter(function (k) { return isBlocking(k, id); }); },
        list: function (byId) { return Object.keys(blk[byId] || {}); }
    };
    brains.setBlocks(function (id) {
        const nm = function (k) { const a = R.actor(k); return a ? a.name : k; };
        return { blocking: api.blocks.list(id).map(nm), blockedBy: api.blocks.blockedBy(id).map(nm) };
    });
    R.registerCapability({
        id: 'block', desc: 'block someone on your phone: they can no longer text or call you, and they are told they are blocked', args: '{"to":"name"}',
        run: function (actor, a) { const r = api.blocks.block(actor.id, a.to); return r.ok ? 'You blocked them.' : r.error; }
    });
    R.registerCapability({
        id: 'unblock', desc: 'unblock someone you blocked', args: '{"to":"name"}',
        run: function (actor, a) { const r = api.blocks.unblock(actor.id, a.to); return r.ok ? 'You unblocked them.' : r.error; }
    });
    brains.start();
    return api;
}

export const society = (typeof window !== 'undefined' && window.BadTherapistSociety) || create();
if (typeof window !== 'undefined') window.BadTherapistSociety = society;
