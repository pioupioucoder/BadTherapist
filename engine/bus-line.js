import { createBusStops } from '../objects/bus.js';

// ==========================================
// BAD THERAPIST — LA LIGNE DE BUS (engine/bus-line.js)
// ==========================================
// Le MÉTIER de Violet : conduire le bus (objects/bus.js) sur une ligne qui passe presque partout.
// Violet n'a plus de cerveau ni de mémoire : c'est un PNJ qui conduit le bus (fiche npcs/violet.js),
// mêmes téléphone, SMS, messages vocaux. Ici : seulement sa ligne, ses arrêts, ses attentes et ses actions de chauffeur.
//
//   attachBusLine({ society, bus, net, scene, groundH, stops, lake })   // appelé une fois par outside.js
//
// Ce que fait la ligne (tout seul, tant que Violet est en service) :
//   • elle part de TOWN et fait la boucle : town > route de montagne > carrefour > immeuble > ... > port > ... > town ;
//   • à chaque arrêt (panneau de bus) : portes ouvertes, elle attend ~2 min (4 min au terminus de Town) ;
//   • si quelqu'un est près du bus et n'est pas monté, elle attend encore 45 s, deux fois au plus, puis elle repart ;
//   • aux terminus (bouts de route) elle fait demi-tour en trois manœuvres ; elle s'arrête aux feux rouges (dans bus.js).
// Ses choix (cerveau) : depart_now, wait_longer, end_shift (garer le bus devant l'immeuble), start_bus_line (reprendre).
// Les autres avatars : board_bus / get_off_bus. Toi : le bouton ENTER / EXIT du bus (objects/bus.js).

const LINE_NO = '1';
const CFG = { dwellSec: 10, terminusSec: 20, extendSec: 25, maxExtend: 3, graceSec: 4, nearMeters: 28, timeScale: 1,
    vmax: 22, acc: 3.2, brk: 4.0, alat: 4.2 };     // vitesse max (m/s, 22 ≈ 80 km/h), accélération, freinage, virage : réglables en direct

// arrêt : id -> { nom affiché sur l'afficheur, lieu du registre, [roadName, s] pour les arrêts « non officiels » }
const PLACE_OF = { home: 'street_front', work: 'therapist_house', town: 'town', gas: 'gas', station: 'station', port: 'port' };
const LABEL = { home: 'HOME', work: 'WORK', town: 'TOWN', gas: 'GAS', station: 'TRAIN', port: 'PORT', crossing: 'CROSSING', mountain: 'MOUNTAIN', forest: 'FOREST', lake: 'LAKE' };
const EXTRA = {
    crossing: { name: 'the crossroads bus stop', desc: 'a bus stop sign at the crossroads where the mountain road leaves the main road' },
    mountain: { name: 'the mountain road bus stop', desc: 'a bus stop sign on the mountain road, between the crossroads and the town' },
    forest: { name: 'the dark forest bus stop', desc: 'a bus stop sign on the forest road' },
    lake: { name: 'the frozen lake bus stop', desc: 'a bus stop sign near the frozen lake' }
};
const SEQUENCE = ['town', 'mountain', 'crossing', 'lake', 'home', 'crossing', 'gas', 'work', 'forest', 'station', 'port', 'forest', 'crossing', 'mountain', 'town'];

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

export function attachBusLine(o) {
    const society = o.society, bus = o.bus, net = o.net;
    const R = society.registry;
    const sc = function () { return CFG.timeScale || 1; };

    // ─── 1. Les arrêts ───
    const stops = {};
    (o.stops || []).forEach(function (st) {
        if (!PLACE_OF[st.id] || !st.road || st.idx == null) return;    // forme inattendue : on retombe sur o.sites plus bas
        let tx = st.tx, tz = st.tz;                                   // sens de la route à l'arrêt (sinon on le relit dans la route)
        if (tx == null || tz == null) {
            const rd = net.byName[st.road], sp = rd && rd.samples[st.idx];
            if (sp) { tx = sp.tx; tz = sp.tz; }
        }
        stops[st.id] = { id: st.id, road: st.road, idx: st.idx, x: st.x, z: st.z, tx: tx, tz: tz };
    });
    // arrêts de base absents de o.stops : on les pose sur la route la plus proche de leur site (o.sites = { id: {x, z} })
    Object.keys(PLACE_OF).forEach(function (id) {
        if (stops[id] || !o.sites || !o.sites[id] || o.sites[id].x == null) return;
        let bi = -1, bd = 1e18;
        net.nodes.forEach(function (n, i) { const d = (n.x - o.sites[id].x) * (n.x - o.sites[id].x) + (n.z - o.sites[id].z) * (n.z - o.sites[id].z); if (d < bd) { bd = d; bi = i; } });
        if (bi < 0 || bd > 90 * 90) { console.warn('[bus] aucune route à moins de 90 m du site', id); return; }
        const nd = net.nodes[bi], st2 = net.stopAt(nd.road, net.byName[nd.road].samples[nd.i].s, id);
        if (st2) stops[id] = st2;
    });
    function extra(id, road, s) { const st = net.stopAt(road, s, id); if (st) stops[id] = st; }
    if (net.byName.main) extra('crossing', 'main', 338);
    if (net.byName.mount) extra('mountain', 'mount', net.byName.mount.len * 0.55);
    if (net.byName.forest) extra('forest', 'forest', net.byName.forest.len * 0.5);
    if (o.lake) {
        const q = net.nearestRoadPoint(o.lake.x, o.lake.z);
        if (q && q.dist < o.lake.r + 90) extra('lake', q.road, q.s);
    }
    const missing = ['town', 'home'].filter(function (k) { return !stops[k]; });
    if (missing.length) { console.warn('[bus] arrêts de base introuvables :', missing, '— la ligne ne démarre pas'); return null; }
    const seq = SEQUENCE.filter(function (id) { return !!stops[id]; });

    // lieux du registre pour les arrêts non officiels (tout le monde les connaît)
    Object.keys(EXTRA).forEach(function (id) {
        if (!stops[id]) return;
        stops[id].place = 'bus_' + id;
        R.addPlace({ id: 'bus_' + id, name: EXTRA[id].name, kind: 'poi', x: stops[id].x, z: stops[id].z, r: 14, desc: EXTRA[id].desc });
    });
    Object.keys(PLACE_OF).forEach(function (id) { if (stops[id]) stops[id].place = PLACE_OF[id]; });

    // ─── 2. Violet : un avatar comme les autres ───
    if (!R.place('violet_room')) {
        R.addPlace({ id: 'violet_room', name: "Violet's room", kind: 'room', indoor: true, parent: 'building', floor: 5, x: 0, z: -29, public: false, discoverable: false, desc: 'her home, 5th floor of the apartment building' });
    }
    let violet = R.actor('violet');
    if (!violet) violet = society.addActor({ id: 'violet', name: 'Violet', number: '555-0104', canDriveBus: true, loc: 'town', home: 'violet_room', job: 'bus' });
    violet.canDriveBus = true;
    violet.home = 'violet_room';
    violet.loc = stops.town.place; violet.job = 'bus'; violet.ride = null; violet.travel = null; violet.busyUntil = 0;   // le bus repart de Town à chaque chargement

    // ─── 3. Planification : positions des panneaux (et vérification que toute la ligne est atteignable) ───
    const plan = { signs: [], legs: [], ok: false };
    let startPose = null;

    function stopDir(st) { return Math.atan2(-(st.tx || 0), -(st.tz != null ? st.tz : 1)); }
    function planAll() {
        const last = stops[seq[seq.length - 1]], prev = stops[seq[seq.length - 2]];
        const r0 = net.route({ x: prev.x, z: prev.z, heading: stopDir(prev) }, last);
        if (!r0) { console.warn('[bus] pas de route vers Town : ligne annulée'); return false; }
        startPose = { x: r0.end.x, z: r0.end.z, heading: r0.end.heading };
        let pose = startPose;
        const ends = [{ id: seq[0], pose: startPose }];
        for (let i = 1; i < seq.length; i++) {
            const r = net.route(pose, stops[seq[i]]);
            if (!r) { console.warn('[bus] pas de route vers', seq[i], '(ignoré)'); continue; }
            plan.legs.push({ id: seq[i] });
            pose = r.end;
            ends.push({ id: seq[i], pose: pose });
        }
        // un panneau par position d'arrivée distincte (à moins de 6 m = le même)
        ends.forEach(function (e) {
            const f = [-Math.sin(e.pose.heading), -Math.cos(e.pose.heading)], r = [Math.cos(e.pose.heading), -Math.sin(e.pose.heading)];
            const sx = e.pose.x + f[0] * 4.3 + r[0] * 3.2, sz = e.pose.z + f[1] * 4.3 + r[1] * 3.2;
            if (plan.signs.some(function (q) { return Math.hypot(q.x - sx, q.z - sz) < 6; })) return;
            plan.signs.push({ x: sx, z: sz, heading: e.pose.heading, n: plan.signs.length + 1, id: e.id });
        });
        return true;
    }
    if (!planAll()) return null;
    plan.ok = true;
    createBusStops(o.scene, plan.signs, o.groundH);
    console.log('[bus] ligne ' + LINE_NO + ' : ' + seq.length + ' arrêts, ' + plan.signs.length + ' panneaux');

    // le bus attend à Town (arrivée de la boucle), tourné comme à la fin de la ligne
    bus.teleport(startPose.x, startPose.z, startPose.heading);
    bus.setLights(true);
    bus.setDisplay(LINE_NO, LABEL.town);

    // ─── 4. État de la ligne ───
    const st = { phase: 'parked', stop: 'town', next: seq[1], left: 0, ext: 0, boarded: 0, depart: false, endShift: false, serving: false, place: stops.town.place, riders: [] };

    function onDuty() { return violet.job === 'bus'; }
    function ridersAboard() { return R.actors().filter(function (a) { return a.ride === 'bus'; }); }
    function somebodyNear() {
        const at = R.actors().some(function (a) { return a.id !== violet.id && !a.ride && a.loc === st.place && !a.isPlayer; });
        const pl = R.actor('player');
        const playerHere = !!pl && !bus.isRiding() && (pl.loc === st.place || bus.isPlayerNear(CFG.nearMeters));
        return at || playerHere;
    }

    // ─── 5. Conduite d'un arrêt à l'autre (itinéraire calculé sur la position RÉELLE du bus) ───
    async function goTo(id) {
        const stop = stops[id];
        st.phase = 'driving'; st.next = id;
        bus.setDisplay(LINE_NO, LABEL[id] || id);
        let r = net.route(bus.getPose(), stop);
        if (!r) { st.phase = 'parked'; return false; }
        if (r.uturn) {
            await bus.closeDoors();
            st.phase = 'turning';
            await bus.turnAround();
            if (st.jumpTo) return 'jump';
            r = net.route(bus.getPose(), stop);
            if (!r) { st.phase = 'parked'; return false; }
            st.phase = 'driving';
        }
        if (bus.setAcc) bus.setAcc(CFG.acc);
        const P = net.makePath(r.pts, { vmax: CFG.vmax, acc: CFG.acc, brk: CFG.brk, alat: CFG.alat });
        const guard = setTimeout(function () { bus.abort(); }, (P.len / 3 + 150) * 1000);        // filet de sécurité : jamais bloqué pour toujours
        const res = await bus.follow(P);
        clearTimeout(guard);
        if (res === 'aborted' && st.jumpTo) return 'jump';                                   // commande console at() : on change d'arrêt
        if (res === 'aborted') { const e = r.end; bus.teleport(e.x, e.z, e.heading); }
        st.stop = id; st.place = stop.place; st.phase = 'parked';
        return true;
    }

    // ─── 6. À l'arrêt : portes ouvertes, on attend, on repart (ou pas, si quelqu'un arrive) ───
    async function dwell(id) {
        st.phase = 'dwelling'; st.stop = id; st.place = stops[id].place;
        st.depart = false; st.ext = 0;
        bus.setDisplay(LINE_NO, LABEL[id] || id);
        syncNow();
        await bus.openDoors();
        // Arrêt court : portes ouvertes dwellSec secondes (10 par défaut), puis elles se ferment et le bus repart.
        // Si quelqu'un est près du bus (le joueur à moins de nearMeters, un avatar à l'arrêt) ou si le joueur attend à une porte pour descendre,
        // elle attend extendSec de plus (au plus maxExtend fois). Quand quelqu'un monte ou descend, elle laisse graceSec secondes.
        st.left = (id === 'town' ? CFG.terminusSec : CFG.dwellSec);
        const count = function () { return ridersAboard().length + (bus.isRiding() ? 1 : 0); };
        let lastCount = count();
        while (onDuty()) {
            await sleep(1000 / sc());
            st.left -= 1;
            const c = count();
            if (c !== lastCount) { lastCount = c; st.left = Math.max(st.left, CFG.graceSec); }
            if (st.depart) break;
            if (st.left <= 0) {
                if (st.ext < CFG.maxExtend && (somebodyNear() || bus.playerAtDoor())) { st.ext++; st.left = CFG.extendSec; continue; }
                break;                                                                       // personne aux alentours : elle part
            }
        }
        if (onDuty()) await bus.closeDoors();                  // descendue (getOff) : les portes restent ouvertes
    }

    // pose le bus à un arrêt, tourné dans le bon sens (pour les commandes de test)
    function placeAt(id) {
        const stp = stops[id];
        const r = net.route(bus.getPose(), stp);
        const e = r ? r.end : { x: stp.x, z: stp.z, heading: stopDir(stp) };
        bus.teleport(e.x, e.z, e.heading);
        st.stop = id; st.place = stp.place; st.phase = 'parked';
        if (violet.job === 'bus') { violet.loc = stp.place; R.save(); }
    }

    // ─── 7. La boucle de service ───
    async function serve() {
        if (st.serving) return;
        st.serving = true;
        try {
            // où est le bus dans la ligne ? (reprise après une pause : on rejoint l'arrêt le plus proche)
            let i = 0;
            let here = null, bd = 1e18;
            const p = bus.getPose();
            seq.forEach(function (id, k) { const d = Math.hypot(stops[id].x - p.x, stops[id].z - p.z); if (d < bd) { bd = d; here = k; } });
            i = here == null ? 0 : here;
            if (bd > 25) { if (!(await goTo(seq[i]))) return; }
            await dwell(seq[i]);
            while (onDuty()) {
                if (st.endShift) {
                    if (await goTo('home')) await dwell('home');
                    break;
                }
                if (st.jumpTo) {                                     // commande console at('gas') : le bus saute à cet arrêt
                    const id = st.jumpTo; st.jumpTo = null;
                    const k = seq.indexOf(id);
                    if (k >= 0) { placeAt(id); i = k; await dwell(seq[i]); continue; }
                }
                i = (i + 1) % seq.length;
                if (i === 0) i = 1;                                  // seq[0] et seq[last] sont tous deux Town : on ne s'arrête pas deux fois
                const ok = await goTo(seq[i]);
                if (st.jumpTo) continue;
                if (!ok) { await sleep(5000); continue; }
                await dwell(seq[i]);
            }
        } finally {
            st.serving = false;
            if (st.endShift) { endShiftNow(); }
            else st.phase = 'parked';
        }
    }
    function endShiftNow() {
        st.endShift = false;
        violet.job = null; R.save();
        st.phase = 'parked';
        R.note('Violet parked the bus in front of the apartment building and finished her shift.');
    }

    // ─── 8. Synchronisation avec la société (qui est où, qui est occupé) ───
    function syncNow() {
        const riders = ridersAboard();
        if (!onDuty()) return;
        const moving = bus.isMoving();
        const t = Date.now();
        if (moving) {
            violet.busyUntil = t + 3000; violet.busBusy = true;
            riders.forEach(function (a) { a.busyUntil = t + 3000; });
        } else {
            if (violet.busBusy) { violet.busyUntil = 0; violet.busBusy = false; }
            riders.forEach(function (a) { if (a.busyUntil) a.busyUntil = 0; a.loc = st.place; });
            if (violet.loc !== st.place) { violet.loc = st.place; R.discoverNear(violet); R.save(); }
        }
    }
    setInterval(syncNow, 500);

    // ─── 10. Capacités ───
    society.registerCapability({
        id: 'start_bus_line', needsBody: true, desc: 'sit at the wheel of the bus (it must be where you are) and start your bus line again', args: '',
        when: function (a) { return !!a.canDriveBus && a.job !== 'bus'; },
        run: function (a) {
            if (a.loc !== st.place) return 'The bus is not here: it is parked at ' + ((R.place(st.place) || {}).name || st.place) + '.';
            a.job = 'bus'; R.save();
            R.note(a.name + ' is back at the wheel of the bus.');
            serve();
            return 'You sit at the wheel and start your line.';
        }
    });
    society.registerCapability({
        id: 'end_shift', needsBody: true, desc: 'end your day: you finish this stop, drive the bus back to the front of the apartment building, park it and get out', args: '',
        when: function (a) { return a.job === 'bus'; },
        run: function () { st.endShift = true; st.depart = true; return 'You will drive the bus back to the apartment building and park it.'; }
    });
    society.registerCapability({
        id: 'depart_now', needsBody: true, desc: 'leave the bus stop right now, without waiting any longer', args: '',
        when: function (a) { return a.job === 'bus' && st.phase === 'dwelling'; },
        run: function () { st.depart = true; return 'You close the doors and leave.'; }
    });
    society.registerCapability({
        id: 'wait_longer', needsBody: true, desc: 'wait one more minute at this bus stop', args: '',
        when: function (a) { return a.job === 'bus' && st.phase === 'dwelling'; },
        run: function () { st.left += 60; return 'You wait one more minute.'; }
    });
    society.registerCapability({
        id: 'board_bus', needsBody: true, desc: 'get on the bus (it must be stopped where you are, with its doors open)', args: '',
        when: function (a) { return !a.isPlayer && a.job !== 'bus' && !a.ride; },
        run: function (a) {
            if (a.loc !== st.place || st.phase !== 'dwelling' || !bus.doorsOpen()) return 'There is no bus with open doors here.';
            a.ride = 'bus'; a.loc = st.place; R.save();
            R.note(a.name + ' got on the bus.');
            return 'You get on the bus. It will take you from stop to stop.';
        }
    });
    society.registerCapability({
        id: 'get_off_bus', needsBody: true, desc: 'get off the bus (it must be stopped, with its doors open)', args: '',
        when: function (a) { return a.ride === 'bus'; },
        run: function (a) {
            if (st.phase !== 'dwelling' || !bus.doorsOpen()) return 'The bus is not stopped with its doors open.';
            a.ride = null; a.loc = st.place; R.save();
            return 'You get off the bus at ' + ((R.place(st.place) || {}).name || 'this stop') + '.';
        }
    });

    // ─── 11. Démarrage ───
    serve();

    const api = {
        cfg: CFG, plan: plan, state: st, sequence: seq, stops: stops,
        status: function () { return { onDuty: onDuty(), phase: st.phase, stop: st.stop, next: st.next, left: Math.round(st.left), riders: ridersAboard().map(function (a) { return a.id; }), player: bus.isRiding() }; },
        skip: function () { st.depart = true; },                  // F12 : BadTherapistBusLine.skip() = partir tout de suite

        // ─── Commandes de test (console F12) ───
        // at('gas')  : le bus (avec Violet) saute à cet arrêt, portes ouvertes. Sans argument : gas.
        at: function (id) {
            id = id || 'gas';
            if (!stops[id]) return 'arrêt inconnu. Arrêts : ' + Object.keys(stops).join(', ');
            if (seq.indexOf(id) < 0) return 'cet arrêt n\'est pas sur la ligne';
            if (st.serving) { st.jumpTo = id; st.depart = true; if (bus.isMoving()) bus.abort(); return 'le bus saute à ' + id + ' (1 à 3 secondes)'; }
            placeAt(id);
            return 'bus posé à ' + id + ' (Violet n\'est pas en service : resume() pour reprendre la ligne)';
        },
        hold: function (sec) { st.left += (sec || 600); return 'le bus attend encore ' + Math.round(st.left) + ' s'; },     // l'empêche de repartir
        come: function () { bus.bringPlayer(); return 'tu es à côté du bus : si les portes sont ouvertes, marche vers la porte pour entrer'; },
        // getOff() : Violet descend du bus (arrêté à un arrêt) et marche jusqu\'à son point de repos ; les portes restent ouvertes
        getOff: function () {
            if (violet.job !== 'bus') return 'Violet est déjà descendue';
            if (st.phase !== 'dwelling') return 'attends que le bus soit arrêté à un arrêt (ou fais at(\'gas\') avant)';
            if (bus.isRiding()) return 'descends du bus d\'abord (bouton EXIT)';
            st.endShift = false; st.depart = true;
            violet.job = null; violet.loc = st.place; R.save();
            bus.openDoors();
            return 'Violet descend et marche (regarde à côté de la porte avant). resume() pour qu\'elle reprenne le volant';
        },
        resume: function () {
            if (onDuty()) return 'Violet est déjà en service';
            if (st.serving) return 'attends une seconde et recommence';
            violet.loc = st.place; violet.job = 'bus'; R.save();
            serve();
            return 'Violet reprend la ligne';
        }
    };
    window.BadTherapistBusLine = api;
    return api;
}
