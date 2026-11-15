// ==========================================
// BAD THERAPIST — LA POLICE DE LEON (engine/police-service.js)
// ==========================================
// Leon est un avatar libre comme les autres (cerveau commun, mémoire commune, téléphone commun). Ici : seulement son MÉTIER.
//
//   attachPolice({ society, car, net, stops, sites })      // appelé une fois par outside.js (voir outside.js fourni)
//
//   • son nom pour tous les autres est « Police » (actor.name) ; lui s'appelle Leon (actor.selfName) ;
//   • son numéro est dans le téléphone de TOUT LE MONDE (et lui a celui de tout le monde) ;
//   • il a un bipeur : un appel à la Police le réveille tout de suite, même au volant (actor.pager, actor.phoneWhileBusy) ;
//   • il a les dossiers de la police : noms, numéros, métiers, domiciles et dernier lieu connu de tous les habitants ;
//   • il patrouille en voiture tout seul (pilote automatique : va là où il y a du monde, change de coin) et, de temps en temps,
//     descend pour patrouiller à pied autour du lieu ; son cerveau peut à tout moment décider autrement (patrol_to, foot_patrol...).
//
// À venir (pas dans ce fichier) : amendes et prison, rapport quotidien de 18 h, missions de la semaine, la prison de la ville B.

const PLACE_OF = { home: 'street_front', work: 'therapist_house', town: 'town', gas: 'gas', station: 'station', port: 'port' };
const JOBS = { oliver: 'chauffeur de taxi', violet: 'chauffeuse de bus', pluie: 'journaliste (un enfant)', evelyn: 'thérapeute', player: 'livreur' };
const CFG = { dwellMin: 18, dwellMax: 45, footChance: 0.2, footSecs: [50, 100], footRadius: 22, vmax: 24, timeScale: 1 };

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
const rnd = function (a, b) { return a + Math.random() * (b - a); };

export function attachPolice(o) {
    const society = o.society, car = o.car, net = o.net;
    const R = society.registry;
    const sc = function () { return CFG.timeScale || 1; };

    // ─── 1. Les points de patrouille (arrêts sur le réseau routier) ───
    const stops = {};
    (o.stops || []).forEach(function (st) {
        if (!PLACE_OF[st.id] || !st.road || st.idx == null) return;
        let tx = st.tx, tz = st.tz;
        if (tx == null || tz == null) { const rd = net.byName[st.road], sp = rd && rd.samples[st.idx]; if (sp) { tx = sp.tx; tz = sp.tz; } }
        stops[st.id] = { id: st.id, road: st.road, idx: st.idx, x: st.x, z: st.z, tx: tx, tz: tz, place: PLACE_OF[st.id] };
    });
    Object.keys(PLACE_OF).forEach(function (id) {             // arrêts de base absents : on les pose sur la route la plus proche du site
        if (stops[id] || !o.sites || !o.sites[id] || o.sites[id].x == null) return;
        const q = net.nearestRoadPoint(o.sites[id].x, o.sites[id].z);
        if (!q || q.dist > 90) return;
        const st2 = net.stopAt(q.road, q.s, id);
        if (st2) { st2.place = PLACE_OF[id]; stops[id] = st2; }
    });
    ['crossing', 'mountain', 'forest', 'lake'].forEach(function (id) {   // arrêts de bus : ce sont aussi de bons points de patrouille
        const p = R.place('bus_' + id);
        if (!p) return;
        const q = net.nearestRoadPoint(p.x, p.z);
        if (!q) return;
        const st2 = net.stopAt(q.road, q.s, id);
        if (st2) { st2.place = 'bus_' + id; stops[id] = st2; }
    });
    if (!stops.station) { console.warn('[police] pas de gare : Leon ne patrouille pas'); return null; }
    const ids = Object.keys(stops);

    // ─── 2. Leon : un avatar comme les autres ───
    const cityB = o.sites && o.sites.cityB;
    if (!R.place('prison')) {
        R.addPlace({
            id: 'prison', name: 'the prison', kind: 'building', indoor: true, x: cityB ? cityB.x - 47 : 0, z: cityB ? cityB.z + 45 : 0,
            public: false, discoverable: false, desc: 'police station and prison of city B, where Leon lives'
        });
    }
    let leon = R.actor('leon');
    if (!leon) leon = society.addActor({ id: 'leon', name: 'Police', selfName: 'Leon', number: '555-0911', loc: stops.station.place, home: 'prison', job: 'police' });
    leon.name = 'Police'; leon.selfName = 'Leon'; leon.number = '555-0911';
    leon.pager = true; leon.phoneWhileBusy = true; leon.canPolice = true; leon.thinks = true;
    leon.home = 'prison'; leon.loc = stops.station.place; leon.job = 'police'; leon.ride = null; leon.travel = null; leon.busyUntil = 0;
    R.learn(leon, 'prison', 'his home');

    // tout le monde a le numéro de la Police ; la Police a celui de tout le monde (dossiers)
    function exchange(a) {
        if (!a || a.id === leon.id) return;
        R.addContact(a, leon.id);
        R.addContact(leon, a.id);
    }
    R.actors().forEach(exchange);
    R.on('actor', exchange);

    // ─── 3. La voiture : pose de départ (garée à la gare) ───
    const st0 = stops.station;
    const h0 = Math.atan2(-(st0.tx || 0), -(st0.tz != null ? st0.tz : 1));
    car.teleport(st0.x + Math.cos(h0) * net.LANE, st0.z - Math.sin(h0) * net.LANE, h0);
    car.setLights(true);
    car.setProfile({ vmax: CFG.vmax });

    // ─── 4. État ───
    const S = { phase: 'parked', place: st0.place, stop: 'station', target: null, auto: true, siren: false, order: null, serving: false, recent: [], foot: false };
    const onDuty = function () { return leon.job === 'police'; };
    const placeName = function (id) { const p = R.place(id); return p ? p.name : id; };

    // ─── 5. Conduite d'un point à l'autre (itinéraire calculé sur la position RÉELLE de la voiture) ───
    function arc(p0, h) {            // demi-tour : demi-ellipse vers l'autre voie, l'avant de la voiture passe devant
        const r = [Math.cos(h), -Math.sin(h)], f = [-Math.sin(h), -Math.cos(h)], LN = net.LANE;
        const c = [p0.x - r[0] * LN, p0.z - r[1] * LN], pts = [];
        for (let i = 0; i <= 9; i++) {
            const t = Math.PI * i / 9;
            pts.push([c[0] + r[0] * LN * Math.cos(t) + f[0] * 4.2 * Math.sin(t), c[1] + r[1] * LN * Math.cos(t) + f[1] * 4.2 * Math.sin(t)]);
        }
        return pts;
    }
    async function goTo(stop, withSiren) {
        S.phase = 'driving'; S.target = stop.id;
        car.setSiren(!!withSiren); S.siren = !!withSiren;
        const pose = car.getPose();
        let r = net.route(pose, stop);
        if (!r) { S.phase = 'parked'; car.setSiren(false); return false; }
        let pts = r.pts;
        if (r.uturn) pts = arc(pose, pose.heading).concat(r.pts.slice(1));
        const P = net.makePath(pts, { vmax: CFG.vmax, acc: car.getProfile().acc, brk: car.getProfile().brk, alat: car.getProfile().alat });
        const guard = setTimeout(function () { car.abort(); }, (P.len / 4 + 120) * 1000);          // filet de sécurité : jamais bloqué pour toujours
        const res = await car.follow(P);
        clearTimeout(guard);
        if (res === 'aborted') car.teleport(r.end.x, r.end.z, r.end.heading);
        car.setSiren(false); S.siren = false;
        S.stop = stop.id; S.place = stop.place; S.phase = 'parked'; S.target = null;
        S.recent.push(stop.id); if (S.recent.length > 4) S.recent.shift();
        return true;
    }

    // ─── 6. Patrouille à pied autour d'un lieu, puis retour à la voiture ───
    function walk(from, to, secs) {
        const now = Date.now();
        leon.travel = { fx: from.x, fz: from.z, tx: to.x, tz: to.z, t0: now, t1: now + secs * 1000, mode: 'walk', vis: true };
        leon.busyUntil = now + secs * 1000 + 1500;
        return sleep(secs * 1000 / sc()).then(function () { leon.travel = null; });
    }
    async function footPatrol() {
        if (S.foot || !onDuty() || car.isMoving()) return false;
        S.foot = true; S.phase = 'foot';
        await car.openDoor();
        leon.job = null; R.save();                                // il sort : son corps apparaît à côté de la portière
        await sleep(2300 / sc());                                 // (animation « Exiting Car »)
        const ds = car.getPose(), door = car.doorSpot();
        const pl = R.place(S.place) || { x: ds.x, z: ds.z };
        let cur = { x: door[0], z: door[1] };
        const n = 3, rad = Math.min(CFG.footRadius, (pl.r || 30) * 0.6);
        const secs = rnd(CFG.footSecs[0], CFG.footSecs[1]) / n;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, d = rnd(rad * 0.4, rad);
            const to = { x: ds.x + Math.cos(a) * d, z: ds.z + Math.sin(a) * d };
            await walk(cur, to, Math.max(6, Math.hypot(to.x - cur.x, to.z - cur.z) / 1.5));
            cur = to;
            await sleep(rnd(2, 6) * 1000 / sc());
        }
        await walk(cur, { x: door[0], z: door[1] }, Math.max(5, Math.hypot(door[0] - cur.x, door[1] - cur.z) / 1.5));
        await car.openDoor();
        leon.job = 'police'; R.save();                            // il remonte (animation « Entering Car »)
        await sleep(2400 / sc());
        await car.closeDoor();
        S.foot = false; S.phase = 'parked';
        return true;
    }

    // ─── 7. Boucle de patrouille automatique (sans cerveau : zéro quota) ───
    function pickTarget() {
        const others = R.actors().filter(function (a) { return a.id !== leon.id && !a.ride; });
        let best = [], tot = 0;
        ids.forEach(function (id) {
            if (id === S.stop || S.recent.indexOf(id) !== -1) return;
            const here = others.filter(function (a) { return a.loc === stops[id].place; }).length;
            const w = 1 + here * 3;
            tot += w; best.push([id, w]);
        });
        if (!best.length) return stops[ids[0]];
        let r = Math.random() * tot;
        for (let i = 0; i < best.length; i++) { r -= best[i][1]; if (r <= 0) return stops[best[i][0]]; }
        return stops[best[0][0]];
    }
    async function patrol() {
        if (S.serving) return;
        S.serving = true;
        try {
            while (true) {
                await sleep(1500 / sc());
                if (!onDuty() || S.foot) continue;
                let target = null, siren = false;
                if (S.order) { target = S.order.stop; siren = S.order.siren; S.order = null; }
                else if (S.auto) target = pickTarget();
                if (!target) continue;
                if (target.id === S.stop && !car.isMoving()) { await sleep(3000 / sc()); continue; }
                if (!(await goTo(target, siren))) { await sleep(8000 / sc()); continue; }
                if (!onDuty()) continue;
                await sleep(rnd(CFG.dwellMin, CFG.dwellMax) * 1000 / sc());
                if (S.auto && onDuty() && !S.order && Math.random() < CFG.footChance) await footPatrol();
            }
        } finally { S.serving = false; }
    }

    // ─── 8. Synchronisation avec la société ───
    function syncNow() {
        if (!onDuty()) return;
        if (car.isMoving()) { leon.busyUntil = Date.now() + 3000; leon.carBusy = true; }
        else {
            if (leon.carBusy) { leon.busyUntil = 0; leon.carBusy = false; }
            if (leon.loc !== S.place) { leon.loc = S.place; R.discoverNear(leon); R.save(); }
        }
    }
    setInterval(syncNow, 500);

    // Au volant, ni go_to ni course de taxi : il faut d'abord descendre (comme pour Oliver)
    const run0 = R.run;
    R.run = function (actor, id, args) {
        if (actor && actor.id === leon.id && onDuty() && ['go_to', 'request_ride', 'board_bus', 'start_job', 'start_bus_line'].indexOf(id) !== -1) {
            return Promise.resolve('You are at the wheel of the police car. Use patrol_to, or leave_car first.');
        }
        return run0.apply(R, arguments);
    };

    // ─── 9. Ce que Leon sait (ajouté à son prompt) ───
    society.brains.setContext('leon', function () {
        const L = [];
        L.push('TA VOITURE DE POLICE : ' + (onDuty()
            ? (S.phase === 'driving' ? 'tu roules vers ' + placeName(stops[S.target] ? stops[S.target].place : S.target) + (S.siren ? ' (sirène)' : '')
                : S.phase === 'foot' ? 'tu patrouilles à pied près de ta voiture' : 'tu es au volant, à l\'arrêt, à ' + placeName(S.place))
            : 'tu es à pied ; ta voiture est garée à ' + placeName(S.place)) + '. Patrouille automatique : ' + (S.auto ? 'activée' : 'désactivée') + '.');
        L.push('TON BIPEUR : si quelqu\'un appelle la Police, tu le vois tout de suite, même au volant (tu peux répondre, c\'est interdit mais tu es la Police).');
        const rows = R.actors().filter(function (a) { return a.id !== leon.id; }).map(function (a) {
            const job = JOBS[a.id] || (a.job ? String(a.job) : 'sans métier connu');
            return '- ' + a.name + ' (tél ' + a.number + ') : ' + job + ' ; domicile : ' + placeName(a.home) + ' ; vu en dernier : ' + placeName(a.loc);
        });
        L.push('DOSSIERS DE LA POLICE (tous les habitants) :\n' + rows.join('\n'));
        return L.join('\n');
    });

    // ─── 10. Capacités ───
    const cop = function (a) { return !!a.canPolice; };
    society.registerCapability({
        id: 'enter_car', needsBody: true, desc: 'get into the police car (it must be where you are)', args: '',
        when: function (a) { return cop(a) && a.job !== 'police'; },
        run: function (a) {
            if (S.foot) return 'You are on a foot patrol: finish it first.';
            if (a.loc !== S.place) return 'Your car is not here: it is parked at ' + placeName(S.place) + '.';
            a.job = 'police'; R.save();
            return 'You get into the police car.';
        }
    });
    society.registerCapability({
        id: 'leave_car', needsBody: true, desc: 'park the police car where it is and get out (you can then walk, enter a building, etc.)', args: '',
        when: function (a) { return cop(a) && a.job === 'police'; },
        run: async function (a) {
            if (car.isMoving()) return 'You are still driving: wait until you have stopped.';
            S.order = null;
            await car.openDoor();
            a.job = null; R.save();
            await sleep(2300 / sc());
            await car.closeDoor();
            return 'You park the car and get out.';
        }
    });
    society.registerCapability({
        id: 'patrol_to', needsBody: true, desc: 'drive the police car to a place you know (on the road network), optionally with the siren on', args: '{"place":"place_id","siren":false}',
        when: function (a) { return cop(a) && a.job === 'police'; },
        run: function (a, args) {
            const p = R.findPlace(args.place || args.to);
            if (!p) return 'Unknown place.';
            if (!R.knows(a, p.id)) return 'You do not know where that is.';
            let st = ids.map(function (id) { return stops[id]; }).filter(function (s) { return s.place === p.id; })[0];
            if (!st) {
                const q = net.nearestRoadPoint(p.x, p.z);
                if (!q || q.dist > 120) return 'No road leads to ' + p.name + ' (you would have to go there another way).';
                st = net.stopAt(q.road, q.s, 'x_' + p.id); st.place = p.id;
            }
            if (st.place === S.place && !car.isMoving()) return 'You are already at ' + p.name + '.';
            S.order = { stop: st, siren: !!args.siren };
            return 'You head for ' + p.name + (args.siren ? ' with the siren on.' : '.');
        }
    });
    society.registerCapability({
        id: 'foot_patrol', needsBody: true, desc: 'get out of the car and walk a patrol around where you are for a minute or two, then come back to the car', args: '',
        when: function (a) { return cop(a) && a.job === 'police'; },
        run: function () {
            if (car.isMoving()) return 'You are still driving: wait until you have stopped.';
            footPatrol();
            return 'You get out and start walking your patrol.';
        }
    });
    society.registerCapability({
        id: 'siren', desc: 'turn the siren and flashing lights on or off', args: '{"on":true}',
        when: function (a) { return cop(a) && a.job === 'police'; },
        run: function (a, args) { const on = args.on !== false; car.setSiren(on); car.setBeacons(on); S.siren = on; return on ? 'Siren and lights on.' : 'Siren and lights off.'; }
    });
    society.registerCapability({
        id: 'auto_patrol', desc: 'switch your automatic patrol on or off (when off, the car stays where it is until you decide)', args: '{"on":true}',
        when: cop,
        run: function (a, args) { S.auto = args.on !== false; return S.auto ? 'Automatic patrol on.' : 'Automatic patrol off: the car waits for your orders.'; }
    });

    // ─── 11. Démarrage ───
    patrol();

    const api = {
        cfg: CFG, state: S, stops: stops,
        status: function () { return { onDuty: onDuty(), phase: S.phase, at: S.place, target: S.target, auto: S.auto, siren: S.siren }; },
        go: function (id) { if (stops[id]) S.order = { stop: stops[id], siren: false }; return !!stops[id]; },     // F12 : BadTherapistPoliceService.go('town')
        foot: footPatrol
    };
    window.BadTherapistPoliceService = api;
    return api;
}
