// avatar-body.js – les CORPS 3D d'Oliver, de Pluie et d'Evelyn dans la rue (avatars Mixamo déjà dans avatars/).
//
// Ils lisent l'état de society.js (où est l'avatar, est-il en train de marcher, est-il au volant) et le montrent :
//   • Oliver au volant du vrai taxi (taxi.js, option freeDriver) : assis à l'arrêt, « driving » quand ça roule ;
//     s'il descend (stop_job) il apparaît à côté de la portière et peut marcher ;
//   • Violet au volant du bus (objects/bus.js, piloté par engine/bus-line.js) : même principe, métier 'bus' ;
//   • Leon (« Police ») au volant de la voiture de police (objects/police-car.js, engine/police-service.js) : métier 'police' ;
//     il monte et descend avec les animations « Entering Car » / « Exiting Car » s'il les a ;
//   • marche en ligne droite entre deux lieux (animation walk), repos (idle) près du lieu, regarde le joueur s'il est proche ;
//   • invisibles quand ils sont dans l'immeuble ou passagers du taxi.
// Evelyn est ici comme les autres : chez elle on ne la voit pas dehors (son corps assis est dans therapist-house.js) ;
// dès qu'elle sort, son corps de rue apparaît à la porte et marche.
//
// Brancher : dans outside.js, après createTaxi (voir notes/INTEGRATION-3.md ; outside.js corrigé fourni).
// Réglage : BadTherapistBodies.list() ; si un modèle flotte / s'enfonce, changer height / yOffset dans DEFS.

import * as THREE from 'three';
import { loadMixamoAvatar } from '../avatar-loader.js';
import { society } from './society.js';
import { Bubbles } from './speech-bubbles.js';

const DEFS = {
    oliver: {
        dir: 'avatars/oliver/', model: 'oliver.fbx', height: 1.78, driver: true, vehicle: 'taxi',
        anims: { walk: 'Walking.fbx', run: 'Running.fbx', sit: 'Sitting.fbx', drive: 'Driving.fbx' }
    },
    violet: {
        dir: 'avatars/violet/', model: 'violet.fbx', height: 1.66, driver: true, vehicle: 'bus',
        anims: { walk: 'Walking.fbx', sit: 'Sitting.fbx', drive: 'Driving.fbx' }   // son dossier n'a ni Running ni Talking : « talk » retombe sur idle
    },
    leon: {
        dir: 'avatars/leon/', model: 'leon.fbx', height: 1.8, driver: true, vehicle: 'police',
        // son dossier : Driving, Entering Car, Exiting Car, Salute, SitTalking, StandingTalking, Walking (pas de Running : « run » absent = on marche)
        anims: { walk: 'Walking.fbx', sit: 'SitTalking.fbx', drive: 'Driving.fbx', talk: 'StandingTalking.fbx', greet: 'Salute.fbx', enter: 'Entering Car.fbx', exit: 'Exiting Car.fbx' }
    },
    pluie: {
        dir: 'avatars/pluie/', model: 'pluie.fbx', height: 1.68,
        anims: { walk: 'Walking.fbx', run: 'Running.fbx', sit: 'Sitting.fbx', talk: 'Talking.fbx' }
    },
    evelyn: {
        dir: 'avatars/evelyn/', model: 'evelyn.fbx', height: 1.7, insideAt: 'therapist_house',   // insideAt : « chez elle » = dans la maison (invisible dehors)
        anims: { walk: 'Walking.fbx', run: 'Running.fbx', sit: 'Sitting.fbx', talk: 'Talking.fbx' }   // noms EXACTS (majuscules comprises : GitHub Pages les distingue)
    }
};
const WALK_CHASE = 1.8;       // m/s : quand il a un nouveau point de repos à rejoindre
const SEE_PLAYER = 10;        // il se tourne vers toi à moins de 10 m
const FAR_NO_ANIM = 160;      // au-delà, on ne calcule plus l'animation
const BUBBLE_RANGE = 25;      // la bulle de parole n'apparaît qu'à moins de 25 m
const CLICK_RANGE = 12;       // on peut cliquer sur un avatar pour lui parler à moins de 12 m

export function createBodies(scene, o) {
    const camera = o.camera, groundH = o.groundH || function () { return 0; }, taxi = o.taxi || null;
    const vehicles = { taxi: taxi, bus: o.bus || null, police: o.police || null };      // véhicule conduit par chaque métier (def.vehicle = nom du métier)
    const R = society.registry;
    const bodies = {};
    let tSync = 0, tEnsure = 0;
    const headV = new THREE.Vector3();

    // Bulle de parole : position écran de la tête (elle suit l'avatar). visible = false -> bulle cachée
    const feetV = new THREE.Vector3();
    function canvasEl() { return o.canvas || (o.renderer && o.renderer.domElement) || document.querySelector('canvas'); }
    function bubbleAt(b, visible) {
        b.scr = null;
        if (!visible || !b.a) { Bubbles.place(b.id, 0, 0, false); return; }
        b.a.root.getWorldPosition(feetV);
        headV.copy(feetV);
        headV.y += b.def.height + 0.28;
        const dist = headV.distanceTo(camera.position);
        if (dist > BUBBLE_RANGE) { Bubbles.place(b.id, 0, 0, false); return; }
        headV.project(camera);
        feetV.project(camera);
        const cv = canvasEl();
        const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const on = headV.z < 1 && Math.abs(headV.x) < 1.1 && headV.y > -1.1 && headV.y < 1.2;
        const hx = r.left + (headV.x * 0.5 + 0.5) * r.width, hy = r.top + (-headV.y * 0.5 + 0.5) * r.height;
        const fy = r.top + (-feetV.y * 0.5 + 0.5) * r.height;
        if (on) b.scr = { x: hx, y: hy, fy: fy, dist: dist };
        Bubbles.place(b.id, hx, hy, on);
    }

    // Clic sur un avatar (ou, si la souris est verrouillée, avatar au centre de l'écran) : la boîte de réponse s'ouvre
    function onClick(ev) {
        const t = ev.target;
        if (t && t.closest && t.closest('.bt-say, .bt-reply')) return;
        const cv = canvasEl();
        if (!cv || (!document.pointerLockElement && t !== cv)) return;
        const r = cv.getBoundingClientRect();
        let cx = ev.clientX, cy = ev.clientY;
        if (document.pointerLockElement) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
        let best = null, bd = 1e9;
        Object.keys(bodies).forEach(function (id) {
            const b = bodies[id], s = b.scr;
            if (!s || s.dist > CLICK_RANGE) return;
            const h = Math.max(40, s.fy - s.y);
            if (Math.abs(cx - s.x) < h * 0.5 && cy > s.y - 30 && cy < s.fy + 12 && s.dist < bd) { best = b; bd = s.dist; }
        });
        if (best) { const ac = R.actor(best.id); Bubbles.talkTo(best.id, ac ? ac.name : ''); }
    }
    window.addEventListener('click', onClick);

    function load(id, def) {
        const b = { id: id, def: def, a: null, grp: new THREE.Group(), cur: '', seated: null, x: null, z: null, heading: 0 };
        b.grp.visible = false;
        scene.add(b.grp);
        bodies[id] = b;
        const d = def.dir, an = {};
        Object.keys(def.anims).forEach(function (k) { an[k] = d + def.anims[k]; });
        loadMixamoAvatar({
            model: d + def.model,
            textures: { map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png', roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png' },
            animations: an,
            modelAnimation: 'idle',      // l'idle = l'animation contenue dans le .fbx du personnage lui-même
            height: def.height
        }).then(function (a) {
            b.a = a;
            b.grp.add(a.root);
            play(b, 'idle');
        }).catch(function (e) {
            console.warn('[body] ' + id + " n'a pas pu être chargé :", e && e.message ? e.message : e);
            // Oliver absent : le taxi reste utilisable comme avant (conducteur « virtuel »)
            const V = def.vehicle ? vehicles[def.vehicle] : null;
            if (def.driver && V && V.setDriverPresent) V.setDriverPresent(true);
        });
    }

    function play(b, name) {
        if (!b.a || b.cur === name) return;
        const key = b.a.actions && b.a.actions[name] ? name : (name === 'drive' || name === 'talk' ? 'idle' : null);
        if (!key || !b.a.actions[key]) return;
        b.cur = name;
        try { b.a.play(key); } catch (e) { /* animation absente : on garde la précédente */ }
    }

    function seat(b, yes) {
        const V = b.def.vehicle ? vehicles[b.def.vehicle] : null;
        if (!b.a || !V) return;
        if (yes) {
            V.slot.add(b.a.root);
            b.a.root.position.set(0, 0, 0);
            b.a.root.rotation.set(0, 0, 0);
            b.grp.visible = false;
            b.cur = '';
        } else {
            b.grp.add(b.a.root);
            b.a.root.position.set(0, 0, 0);
            b.a.root.rotation.set(0, 0, 0);
            const ds = V.doorSpot ? V.doorSpot() : [0, 0];
            b.x = ds[0]; b.z = ds[1];
            b.cur = '';
            b.entering = 0;
            if (b.def.anims.exit) { b.hold = Date.now() + 2300; b.holdAnim = 'exit'; }       // il descend : animation de sortie, puis il marche
        }
        if (b.def.driver && V.setDriverPresent) V.setDriverPresent(!!yes);
        b.seated = !!yes;
    }

    function step(dt) {
        const now = Date.now();
        if (taxi) { tSync += dt; if (tSync > 0.4) { tSync = 0; society.syncTaxi(); } }
        const cam = scene.worldToLocal(camera.position.clone());
        tEnsure += dt; if (tEnsure > 1) { tEnsure = 0; ensure(); }     // un avatar créé après nous (ex. Violet, par bus-line.js) est chargé à son apparition

        Object.keys(bodies).forEach(function (id) {
            const b = bodies[id], a = b.a, actor = R.actor(id);
            if (!a || !actor) return;

            // 1. au volant ? (taxi pour Oliver, bus pour Violet)
            const V = b.def.vehicle ? vehicles[b.def.vehicle] : null;
            const wantSeat = !!(b.def.driver && V && V.slot && actor.job === b.def.vehicle);
            if (wantSeat && !b.seated && b.def.anims.enter && b.x !== null) {       // il monte : animation d'entrée à côté de la portière, puis il s'assoit
                if (!b.entering) { b.entering = now + 2100; b.cur = ''; }
                if (now < b.entering) {
                    const ds0 = V.doorSpot ? V.doorSpot() : [b.x, b.z], vp = V.getPose ? V.getPose() : null;
                    b.x = ds0[0]; b.z = ds0[1];
                    if (vp) b.heading = Math.atan2(vp.x - b.x, vp.z - b.z);
                    b.grp.visible = true;
                    b.grp.position.set(b.x, groundH(b.x, b.z), b.z);
                    b.grp.rotation.y = b.heading;
                    play(b, 'enter'); a.update(dt); bubbleAt(b, true);
                    return;
                }
                b.entering = 0;
            }
            if (b.seated !== wantSeat) seat(b, wantSeat);
            if (wantSeat) {
                play(b, V.isMoving && V.isMoving() ? 'drive' : 'sit');
                a.update(dt);
                bubbleAt(b, true);
                return;
            }

            // 1b. il vient de descendre : animation de sortie à côté de la portière
            if (b.hold && b.hold > now && !wantSeat) {
                b.grp.visible = true;
                b.grp.position.set(b.x, groundH(b.x, b.z), b.z);
                b.grp.rotation.y = b.heading;
                play(b, b.holdAnim || 'exit'); a.update(dt); bubbleAt(b, true);
                return;
            }

            // 2. passager d'un véhicule : invisible
            const tr = actor.travel;
            if (actor.ride || (tr && tr.mode === 'vehicle')) { b.grp.visible = false; bubbleAt(b, false); return; }

            // 3. position
            const place = R.place(actor.loc);
            let moving = false, vis = true;
            if (tr) {
                const k = Math.max(0, Math.min(1, (now - tr.t0) / (tr.t1 - tr.t0)));
                const nx = tr.fx + (tr.tx - tr.fx) * k, nz = tr.fz + (tr.tz - tr.fz) * k;
                const dx = tr.tx - tr.fx, dz = tr.tz - tr.fz;
                if (Math.hypot(dx, dz) > 0.1) b.heading = Math.atan2(dx, dz);
                b.x = nx; b.z = nz;
                moving = k < 1;
                vis = tr.vis !== false;
            } else if (place) {
                const t = society.spot(actor, actor.loc);
                vis = !place.indoor && !(b.def.insideAt && b.def.insideAt === actor.loc);   // chez elle : dans la maison, pas dehors
                if (b.x === null || Math.hypot(t.x - b.x, t.z - b.z) > 40) { b.x = t.x; b.z = t.z; }
                else {
                    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
                    if (d > 0.15) {
                        const s = Math.min(d, WALK_CHASE * dt);
                        b.x += dx / d * s; b.z += dz / d * s;
                        b.heading = Math.atan2(dx, dz);
                        moving = true;
                    }
                }
            }
            b.grp.visible = vis;
            if (!vis) { bubbleAt(b, false); return; }

            // 4. le regard : vers le joueur s'il est tout proche et que l'avatar est à l'arrêt
            const dpx = cam.x - b.x, dpz = cam.z - b.z, dp = Math.hypot(dpx, dpz);
            if (!moving && dp < SEE_PLAYER) {
                const want = Math.atan2(dpx, dpz);
                let diff = want - b.heading;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                b.heading += diff * Math.min(1, dt * 4);
            }
            const BV = vehicles.bus;                                       // le bus est solide : on ne le traverse pas
            if (BV && BV.collide && b.x !== null) { const c = BV.collide(b.x, b.z, 0.35); b.x = c[0]; b.z = c[1]; }
            b.grp.position.set(b.x, groundH(b.x, b.z), b.z);
            b.grp.rotation.y = b.heading;

            // 5. animation
            if (dp < FAR_NO_ANIM) {
                play(b, moving ? 'walk' : (actor.speakingUntil > now ? 'talk' : 'idle'));
                a.update(dt);
            }
            bubbleAt(b, true);
        });
    }

    // TOUS les corps sont chargés tout de suite, pendant l'écran de chargement (avatar-loader.js le retient jusqu'à ce que
    // chacun soit prêt). Avant, un avatar dont l'acteur n'existait pas encore (Violet, Leon...) se chargeait en pleine partie,
    // après la fin de l'écran de chargement : c'est ce qui figeait le jeu quelques secondes. Un corps sans acteur reste invisible (voir step).
    function ensure() { Object.keys(DEFS).forEach(function (id) { if (!bodies[id]) load(id, DEFS[id]); }); }
    ensure();

    const api = {
        update: step,
        list: function () { return Object.keys(bodies).map(function (k) { const b = bodies[k]; return { id: k, loaded: !!b.a, visible: b.grp.visible, seated: b.seated, x: b.x, z: b.z }; }); }
    };
    window.BadTherapistBodies = api;
    return api;
}
