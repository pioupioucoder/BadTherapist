// player-watch.js – ce qu'un avatar (Evelyn...) OBSERVE du joueur. Étape 1 du plan « cerveau d'Evelyn ».
//
// Principe : du JavaScript pur, AUCUN appel à l'IA, AUCUN quota. Le module écoute le registre du monde (arrivées, paroles),
// garde un petit historique des comportements du joueur, et fournit à avatar-brain.js quelques lignes de FAITS
// (jamais d'interprétation : « il est triste » est à Evelyn de le deviner, et elle peut se tromper).
//
// Ce qu'Evelyn peut remarquer (seulement ce qu'elle a pu VOIR, c'est-à-dire quand elle était à portée du joueur) :
//   • il est allé d'un lieu à un autre ; il revient plusieurs fois au même endroit ;
//   • il reste longtemps au même endroit ;
//   • il est reparti peu après qu'elle soit arrivée ; il est arrivé peu après qu'elle soit partie (il la suit) ;
//   • il est resté près d'elle seulement quelques secondes ;
//   • il n'a pas répondu à ce qu'elle lui a dit ;
//   • ce qu'il a fait sur un objet (si l'objet le signale : window.BadTherapistWatch.noteAction('opened the drawer')).
//
// Branchement (3 lignes, voir INTEGRATION-PLAYER-WATCH.md) :
//   society.js      : const watch = createPlayerWatch(R, { onSignificant: function (id) { brains.wake(id, false, 'watch'); } });
//   avatar-brain.js : buildPerception ajoute watch.peek(actor.id) ; think() appelle watch.commit(actor.id) quand la réflexion a réussi.
//
// Réglages (2e paramètre) : watchers (qui observe, défaut ['evelyn']), omniscient (qui voit TOUT, même à distance, défaut []),
// windowMin, dwellMin, revisitMin, ignoreSec, leaveSec, followSec, nearShortSec, wakeGapSec.
// Tout le texte produit est en anglais (c'est lui qui est envoyé à l'IA).

export function createPlayerWatch(R, opts) {
    const cfg = Object.assign({
        playerId: 'player',
        watchers: ['evelyn'],
        omniscient: [],            // avatars qui voient tout ce que fait le joueur, même hors de leur vue (ex. ['evelyn'] pour une Evelyn qui épie)
        windowMin: 30,             // fenêtre pour compter les retours au même lieu
        revisitMin: 3,             // à partir de combien d'entrées dans le même lieu on le remarque
        dwellMin: 3,               // minutes passées au même endroit avant de le remarquer
        ignoreSec: 25,             // secondes sans réponse avant « il n'a pas répondu »
        leaveSec: 45,              // « reparti peu après mon arrivée » : fenêtre
        followSec: 90,             // « arrivé peu après mon départ » : fenêtre
        nearShortSec: 40,          // resté près d'elle moins que ça = « seulement quelques secondes »
        wakeGapSec: 60,            // au plus un réveil de son cerveau par minute à cause d'une observation
        maxEvents: 80,
        onSignificant: null
    }, opts || {});

    const SIGNIF = { ignored: 1, left_soon: 1, followed: 1, near_short: 1 };   // ces observations méritent un réveil de son cerveau
    const events = [];                 // { t, kind, seen:[ids], ... }
    const lastCommit = {};             // par avatar : jusqu'où il a déjà été informé
    const pend = {};                   // par avatar : ce qui a été montré au dernier peek (pour commit)
    const lastArrive = {};             // par avatar : { loc, from, t } sa dernière arrivée quelque part
    const unanswered = {};             // par avatar : ce qu'il a dit au joueur et qui attend une réponse
    const nearState = {};              // par avatar : { near, since, wArrivedRecently }
    const lastWake = {};
    const dwell = { loc: null, since: Date.now() };
    const dwellReported = {};          // par avatar : tranche de 5 min déjà signalée
    let timer = null;

    function player() { return R.actor(cfg.playerId); }
    function isWatcher(id) { return cfg.watchers.indexOf(id) !== -1; }
    function sees(w, atLoc) {          // l'avatar w peut-il voir le joueur (qui est à atLoc) ?
        if (!w) return false;
        if (cfg.omniscient.indexOf(w.id) !== -1) return true;
        const p = player();
        if (!p) return false;
        if (atLoc && w.loc === atLoc) return true;
        try { return !!(R.hearable && R.hearable(w, p)); } catch (e) { return false; }
    }
    function watchersWho(fn) { return cfg.watchers.map(function (id) { return R.actor(id); }).filter(function (w) { return w && fn(w); }); }
    function ids(list) { return list.map(function (w) { return w.id; }); }
    function pname() { const p = player(); return p ? p.name : 'The player'; }
    function placeName(id) { const p = R.place(id); return p ? p.name : String(id || 'somewhere'); }
    function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

    function add(ev, watchersToTell) {
        ev.t = ev.t || Date.now();
        ev.seen = ids(watchersToTell);
        if (!ev.seen.length) return null;
        events.push(ev);
        while (events.length > cfg.maxEvents) events.shift();
        if (SIGNIF[ev.kind] && typeof cfg.onSignificant === 'function') {
            ev.seen.forEach(function (id) {
                if (Date.now() - (lastWake[id] || 0) < cfg.wakeGapSec * 1000) return;
                lastWake[id] = Date.now();
                try { cfg.onSignificant(id, ev); } catch (e) { /* rien */ }
            });
        }
        return ev;
    }

    // ─── Le joueur ou un avatar arrive quelque part ───
    function onArrive(e) {
        const a = e && e.actor, place = e && e.place;
        if (!a || !place) return;
        const now = Date.now();
        if (a.id === cfg.playerId) {
            const prev = dwell.loc;
            dwell.loc = place.id; dwell.since = now;
            if (prev === place.id) return;
            const here = watchersWho(function (w) { return sees(w, place.id) || w.loc === prev; });
            if (prev) add({ kind: 'move', from: prev, to: place.id, t: now }, here);
            // reparti peu après son arrivée à elle (elle était avec lui dans le lieu qu'il quitte)
            watchersWho(function (w) { return w.loc === prev; }).forEach(function (w) {
                const la = lastArrive[w.id];
                if (la && la.loc === prev && now - la.t < cfg.leaveSec * 1000) add({ kind: 'left_soon', from: prev, to: place.id, ago: Math.round((now - la.t) / 1000), t: now }, [w]);
            });
            // arrivé peu après son départ à elle, au même endroit : il la suit
            watchersWho(function (w) { return w.loc === place.id; }).forEach(function (w) {
                const la = lastArrive[w.id];
                if (la && la.loc === place.id && la.from === prev && now - la.t < cfg.followSec * 1000) add({ kind: 'followed', place: place.id, from: prev, ago: Math.round((now - la.t) / 1000), t: now }, [w]);
            });
        } else if (isWatcher(a.id)) {
            lastArrive[a.id] = { loc: place.id, from: lastLoc[a.id] || null, t: now };
            lastLoc[a.id] = place.id;
        }
    }

    // On retient le lieu de chaque observateur pour savoir D'OÙ il arrive (le registre ne le dit pas)
    const lastLoc = {};
    function initLoc() {
        cfg.watchers.forEach(function (id) { const w = R.actor(id); if (w && lastLoc[id] === undefined) lastLoc[id] = w.loc; });
    }
    R.on('arrive', onArrive);

    // ─── Paroles : il lui a parlé / elle lui a parlé ───
    R.on('speech', function (e) {
        if (!e || !e.actor || e.phone) return;
        const a = e.actor, to = e.to || [];
        if (isWatcher(a.id) && to.indexOf(cfg.playerId) !== -1) {
            unanswered[a.id] = { at: Date.now(), text: clip(e.text, 80), reported: false };
        } else if (a.id === cfg.playerId) {
            cfg.watchers.forEach(function (id) { if (!to.length || to.indexOf(id) !== -1) delete unanswered[id]; });
        }
    });

    // ─── Un objet du joueur le signale (tiroir, ordinateur, télé...) ───
    function noteAction(label, placeId) {
        const p = player();
        if (!p || !label) return;
        const loc = placeId || p.loc;
        add({ kind: 'action', label: clip(label, 60), place: loc }, watchersWho(function (w) { return sees(w, loc); }));
    }

    // ─── Échantillon toutes les 2 s : proximité (près d'elle / parti), arrivées sans événement ───
    function sample() {
        const p = player();
        if (!p) return;
        initLoc();
        const now = Date.now();
        if (dwell.loc === null) { dwell.loc = p.loc; dwell.since = now; }
        cfg.watchers.forEach(function (id) {
            const w = R.actor(id);
            if (!w) return;
            let near = false;
            try { near = !!(R.hearable && R.hearable(w, p)); } catch (e) { near = false; }
            const st = nearState[id] || (nearState[id] = { near: near, since: now, wMoved: false });
            if (near !== st.near) {
                if (!near) {
                    const dur = Math.round((now - st.since) / 1000);
                    if (dur < cfg.nearShortSec && dur >= 3) add({ kind: 'near_short', dur: dur, wMoved: st.wMoved, t: now }, [w]);
                }
                st.near = near; st.since = now;
                const la = lastArrive[id];
                st.wMoved = !!(near && la && now - la.t < 20000);
            }
        });
    }

    // ─── Ce que l'avatar vient d'observer (aucune interprétation) ───
    function ago(ms) {
        const s = Math.round(ms / 1000);
        return s < 15 ? 'just now' : s < 90 ? s + ' seconds ago' : Math.round(s / 60) + ' minutes ago';
    }
    function ordinal(n) { return n + (n === 3 ? 'rd' : n === 2 ? 'nd' : n === 1 ? 'st' : 'th'); }

    function peek(actorId) {
        const w = R.actor(actorId);
        if (!w || !isWatcher(actorId)) return [];
        const now = Date.now(), P = pname();
        const since = lastCommit[actorId] || (now - 10 * 60000);
        const mine = events.filter(function (e) { return e.t > since && e.seen.indexOf(actorId) !== -1; });
        const lines = [];                     // { rank, text } : rank bas = plus important
        const used = { unanswered: false };

        // même observation répétée = une seule ligne avec le nombre de fois (la plus récente sert de modèle)
        const groups = {};
        mine.forEach(function (e) {
            if (e.kind !== 'left_soon' && e.kind !== 'followed' && e.kind !== 'near_short') return;
            const k = e.kind + '|' + (e.from || '') + '|' + (e.to || e.place || '');
            (groups[k] = groups[k] || { e: e, n: 0 }).n++;
            groups[k].e = e;
        });
        Object.keys(groups).forEach(function (k) {
            const e = groups[k].e, n = groups[k].n, rep = n > 1 ? ' This has happened ' + n + ' times.' : '';
            if (e.kind === 'left_soon') lines.push({ r: 0, t: P + ' left ' + placeName(e.from) + ' only ' + e.ago + ' seconds after you arrived there (' + ago(now - e.t) + ').' + rep });
            else if (e.kind === 'followed') lines.push({ r: 0, t: P + ' arrived at ' + placeName(e.place) + ' ' + e.ago + ' seconds after you did, coming from ' + placeName(e.from) + ' (' + ago(now - e.t) + ').' + rep });
            else lines.push({ r: 1, t: P + (e.wMoved ? ' walked away ' + e.dur + ' seconds after you came close' : ' stayed close to you for only about ' + e.dur + ' seconds') + ' (' + ago(now - e.t) + ').' + rep });
        });

        const u = unanswered[actorId];
        if (u && !u.reported && now - u.at > cfg.ignoreSec * 1000 && now - u.at < 5 * 60000) {
            let still = false;
            try { const p = player(); still = !!(p && R.hearable && R.hearable(w, p)); } catch (e) { still = false; }
            lines.push({ r: 0, t: 'You said \u00ab ' + u.text + ' \u00bb to ' + P + ' ' + ago(now - u.at) + ' and ' + P + ' has not answered. ' + (still ? P + ' is still close to you.' : P + ' is no longer close to you.') });
            used.unanswered = true;
        }

        // retours au même endroit (dans la fenêtre), vus par elle
        const cut = now - cfg.windowMin * 60000, byPlace = {};
        events.forEach(function (e) { if (e.kind === 'move' && e.t > cut && e.seen.indexOf(actorId) !== -1) byPlace[e.to] = (byPlace[e.to] || 0) + 1; });
        Object.keys(byPlace).forEach(function (pl) {
            if (byPlace[pl] >= cfg.revisitMin && mine.some(function (e) { return e.kind === 'move' && e.to === pl; })) lines.push({ r: 2, t: P + ' has gone into ' + placeName(pl) + ' ' + byPlace[pl] + ' times in the last ' + cfg.windowMin + ' minutes (this is the ' + ordinal(byPlace[pl]) + ' time).' });
        });

        // simples déplacements récents (les plus récents d'abord, 2 au plus)
        mine.filter(function (e) { return e.kind === 'move' && !(byPlace[e.to] >= cfg.revisitMin); }).slice(-2).reverse().forEach(function (e) {
            lines.push({ r: 3, t: P + ' went from ' + placeName(e.from) + ' to ' + placeName(e.to) + ' (' + ago(now - e.t) + ').' });
        });

        // objets (regroupés : « 3 times »)
        const acts = {};
        mine.filter(function (e) { return e.kind === 'action'; }).forEach(function (e) { const k = e.label + '|' + e.place; (acts[k] = acts[k] || { e: e, n: 0 }).n++; });
        Object.keys(acts).forEach(function (k) { const a = acts[k]; lines.push({ r: 2, t: P + ' ' + a.e.label + (a.n > 1 ? ' (' + a.n + ' times)' : '') + ' in ' + placeName(a.e.place) + ' (' + ago(now - a.e.t) + ').' }); });

        // il reste longtemps au même endroit (signalé une fois par tranche de 5 min)
        const p = player();
        if (p && sees(w, p.loc)) {
            const mins = Math.floor((now - dwell.since) / 60000);
            const bucket = Math.floor(mins / 5);
            if (mins >= cfg.dwellMin && dwellReported[actorId] !== dwell.loc + ':' + bucket) {
                lines.push({ r: 3, t: P + ' has stayed in ' + placeName(p.loc) + ' for about ' + mins + ' minutes without leaving.' });
                pend[actorId] = Object.assign(pend[actorId] || {}, { dwell: dwell.loc + ':' + bucket });
            }
        }

        lines.sort(function (a, b) { return a.r - b.r; });
        pend[actorId] = Object.assign(pend[actorId] || {}, { t: now, unanswered: used.unanswered });
        return lines.slice(0, 5).map(function (l) { return l.t; });
    }

    // La réflexion a réussi : ce qui a été montré ne sera pas répété
    function commit(actorId) {
        const pd = pend[actorId];
        if (!pd) return;
        lastCommit[actorId] = pd.t;
        if (pd.unanswered && unanswered[actorId]) unanswered[actorId].reported = true;
        if (pd.dwell) dwellReported[actorId] = pd.dwell;
        delete pend[actorId];
    }

    function start() { initLoc(); if (!timer && typeof setInterval !== 'undefined') timer = setInterval(sample, 2000); }
    function stop() { clearInterval(timer); timer = null; }
    start();

    return {
        peek: peek, commit: commit, noteAction: noteAction, sample: sample, start: start, stop: stop,
        events: function () { return events.slice(); },               // pour tester : BadTherapistWatch.events()
        debug: function (id) { return peek(id || cfg.watchers[0]); }  // pour tester : ce qu'elle verrait maintenant
    };
}
