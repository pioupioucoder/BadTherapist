// npcs/driver.js – TOUT le 3D des PNJ dans la rue (Oliver, Violet, Leon, Lou, Pluie...) dans UN fichier : (1) leur corps léger en three.js (section « Le corps »,
// ex- npcs/body.js, supprimé ; + customize de leur fiche npcs/<id>.js), bulle de parole, clic pour leur parler, marche entre deux lieux, regard vers le joueur, au volant du taxi / bus /
// voiture de police, poste de la station-service (Lou), bus solide, synchro du taxi.
// Aucun lien avec Evelyn : son corps est dans engine/evelyn-core.js. Reste à part : npcs/behavior.js (réponses, bavardage, routine : pas de 3D, society.js le charge
// sur des pages qui n'ont pas « three ») et les fiches npcs/<id>.js (une par PNJ : apparence, dialogues, métier).
//
// Utilisation (places/outside.js) :  createNpcBodies(scene, { camera, groundH, taxi, bus, police, canvas, renderer })  ->  { update(dt), list() }
// Réglage : si un modèle flotte / s'enfonce, changer height dans sa fiche npcs/<id>.js.

import * as THREE from 'three';
import { NPCS } from './index.js';
import { society } from '../engine/society.js';
import { Dialogue as Bubbles } from '../engine/evelyn-core.js';      // bulles : texte lumineux au-dessus de la tête, avec le nom (engine/evelyn-core.js, section Dialogue)

// Les PNJ n'ont de définition que dans leur fiche npcs/<id>.js (apparence, taille, véhicule, poste, dialogues)
const DEFS = {};
Object.keys(NPCS).forEach(function (id) {
    const sh = NPCS[id];
    DEFS[id] = { height: sh.height || 1.75, look: sh.look || {}, driver: !!sh.vehicle, vehicle: sh.vehicle || null, post: sh.post || null, anims: {} };
});

// ═══════════════════════════════════════════════════════════════════════════
// LE CORPS – un PNJ tout en three.js  (ex- npcs/body.js)
// ═══════════════════════════════════════════════════════════════════════════
//
//    Il a la même « prise » qu'un avatar Mixamo de avatar-loader.js : { root, model, mixer, actions, play(nom), update(dt) },
//    donc engine/avatar-body.js le pilote sans rien changer d'autre (marche, assis, au volant, parle...).
//
//    Animations (calculées par le code, rien à télécharger) : idle, walk, run, sit, drive, talk, greet, work.
//    « sleep », « enter », « exit » n'existent pas : avatar-body retombe sur idle (ou ne joue rien).
//
//    Apparence : opts.look = { skin, shirt, pants, hair, hairStyle: 'short' | 'long' | 'bun' | 'bald', hat: 'cap' | null, hatColor,
//                beard: '#rrggbb' (absent = pas de barbe), glasses: true, widen: 1 (plus grand = plus large) } (couleurs CSS '#rrggbb').
//    Forme à la main : le retour expose parts { hips, torso, head, armL, armR, legL, legR } et mats { skin, shirt, pants, hair, shoe }
//    (la fiche du PNJ, npcs/<id>.js, peut s'en servir dans customize(body, THREE)).
//    Hauteur : opts.height (mètres). Il regarde vers +z comme un avatar Mixamo.
//    Réglage si assis trop haut / trop bas dans un véhicule : SIT_HIPS (hauteur du bassin assis, par rapport au plancher).

const BASE_H = 1.8;          // hauteur du modèle construit ci-dessous (il est ensuite mis à l'échelle de opts.height)
const STAND_HIPS = 0.95;     // hauteur du bassin debout
const SIT_HIPS = 0.5;        // hauteur du bassin assis (le plancher du véhicule = 0)
const HALF_PI = Math.PI / 2;

export function createNpc(opts) {
    opts = opts || {};
    const look = opts.look || {};
    const H = opts.height || 1.75;

    const mat = function (c, fallback) { return new THREE.MeshLambertMaterial({ color: c || fallback }); };
    const skin = mat(look.skin, '#d8b08c');
    const shirt = mat(look.shirt, '#6b7a8f');
    const pants = mat(look.pants, '#2a2a30');
    const hair = mat(look.hair, '#3a2a1a');
    const shoe = mat('#16161a');
    const eye = new THREE.MeshBasicMaterial({ color: 0x151515 });

    function mesh(geo, m, x, y, z, parent) {
        const o = new THREE.Mesh(geo, m);
        o.position.set(x || 0, y || 0, z || 0);
        o.castShadow = true;
        parent.add(o);
        return o;
    }
    function cyl(rt, rb, h, m, x, y, z, parent) { return mesh(new THREE.CylinderGeometry(rt, rb, h, 10), m, x, y, z, parent); }
    function ball(r, m, x, y, z, parent) { return mesh(new THREE.SphereGeometry(r, 12, 8), m, x, y, z, parent); }

    const root = new THREE.Group();
    const model = new THREE.Group();
    root.add(model);
    model.scale.set(H / BASE_H * (look.widen || 1), H / BASE_H, H / BASE_H * (look.widen || 1));

    // bassin + torse
    const hips = new THREE.Group();
    hips.name = 'hips';
    hips.position.y = STAND_HIPS;
    model.add(hips);
    mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), pants, 0, 0.0, 0, hips);
    const torso = new THREE.Group();
    torso.name = 'torso';
    hips.add(torso);
    mesh(new THREE.BoxGeometry(0.36, 0.5, 0.21), shirt, 0, 0.3, 0, torso);
    cyl(0.04, 0.045, 0.09, skin, 0, 0.58, 0, torso);

    // tête (yeux sur +z : on voit de quel côté il regarde)
    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.64, 0);
    torso.add(head);
    ball(0.105, skin, 0, 0.1, 0, head);
    ball(0.012, eye, -0.04, 0.12, 0.096, head);
    ball(0.012, eye, 0.04, 0.12, 0.096, head);
    const hs = look.hairStyle || 'short';
    if (hs !== 'bald') mesh(new THREE.SphereGeometry(0.113, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, 0, 0.105, -0.008, head);
    if (hs === 'long') mesh(new THREE.BoxGeometry(0.23, 0.26, 0.07), hair, 0, 0.0, -0.085, head);          // cheveux longs dans le dos
    if (hs === 'bun') ball(0.05, hair, 0, 0.2, -0.08, head);                                                  // chignon
    if (look.beard) mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), mat(look.beard, '#2a1a0a'), 0, 0.04, 0.085, head);
    if (look.glasses) {
        const gm = new THREE.MeshBasicMaterial({ color: 0x111111 });
        [-0.04, 0.04].forEach(function (x) { mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 12), gm, x, 0.12, 0.101, head); });
    }
    if (look.hat === 'cap') {
        const hm = mat(look.hatColor, '#1f2f55');
        cyl(0.118, 0.122, 0.06, hm, 0, 0.19, 0, head);
        mesh(new THREE.BoxGeometry(0.2, 0.012, 0.1), hm, 0, 0.165, 0.11, head);
    }

    // bras : épaule (rotation x = avant/arrière, z = écarter), coude
    function arm(side) {
        const sh = new THREE.Group();
        sh.position.set(side * 0.22, 0.5, 0);
        torso.add(sh);
        ball(0.055, shirt, 0, 0, 0, sh);
        cyl(0.05, 0.045, 0.3, shirt, 0, -0.15, 0, sh);
        const el = new THREE.Group();
        el.position.y = -0.3;
        sh.add(el);
        cyl(0.042, 0.036, 0.27, skin, 0, -0.135, 0, el);
        ball(0.045, skin, 0, -0.29, 0, el);
        return { sh: sh, el: el };
    }
    // jambes : hanche (rotation x), genou
    function leg(side) {
        const hp = new THREE.Group();
        hp.position.set(side * 0.09, -0.02, 0);
        hips.add(hp);
        cyl(0.075, 0.065, 0.45, pants, 0, -0.225, 0, hp);
        const kn = new THREE.Group();
        kn.position.y = -0.45;
        hp.add(kn);
        cyl(0.062, 0.05, 0.43, pants, 0, -0.215, 0, kn);
        mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), shoe, 0, -0.46, 0.05, kn);
        return { hp: hp, kn: kn };
    }
    const armL = arm(1), armR = arm(-1), legL = leg(1), legR = leg(-1);

    // ---------- poses (angles en radians) ----------
    // x négatif = vers l'avant (+z) pour les jambes et les bras ; genou / coude : x positif = jambe repliée vers l'arrière, négatif = avant-bras relevé
    const BASE = {
        hy: STAND_HIPS, lean: 0, hipL: 0, hipR: 0, knL: 0, knR: 0,
        shLx: 0.04, shRx: 0.04, shLz: 0.08, shRz: -0.08, elL: -0.12, elR: -0.12, hdX: 0, hdY: 0
    };
    const POSES = {
        idle: function (t) {
            const s = Math.sin(t * 1.5);
            return { lean: s * 0.012, shLx: 0.04 + s * 0.02, shRx: 0.04 - s * 0.02, hdY: Math.sin(t * 0.5) * 0.12 };
        },
        walk: function (t) {
            const p = t * 7.5, s = Math.sin(p), c = Math.cos(p);
            return {
                hy: STAND_HIPS - 0.01 + Math.abs(c) * 0.02,
                hipL: -s * 0.6, hipR: s * 0.6,
                knL: Math.max(0, c) * 0.9, knR: Math.max(0, -c) * 0.9,
                shLx: s * 0.5, shRx: -s * 0.5, elL: -0.3, elR: -0.3
            };
        },
        run: function (t) {
            const p = t * 11, s = Math.sin(p), c = Math.cos(p);
            return {
                hy: STAND_HIPS - 0.05 + Math.abs(c) * 0.04, lean: 0.16,
                hipL: -s * 0.95, hipR: s * 0.95,
                knL: Math.max(0, c) * 1.5, knR: Math.max(0, -c) * 1.5,
                shLx: s * 0.9, shRx: -s * 0.9, elL: -1.3, elR: -1.3
            };
        },
        sit: function (t) {
            return {
                hy: SIT_HIPS, hipL: -HALF_PI, hipR: -HALF_PI, knL: HALF_PI, knR: HALF_PI,
                shLx: -0.45, shRx: -0.45, elL: -0.9, elR: -0.9, hdY: Math.sin(t * 0.5) * 0.1
            };
        },
        drive: function (t) {
            return {
                hy: SIT_HIPS, hipL: -HALF_PI, hipR: -HALF_PI, knL: HALF_PI, knR: HALF_PI, lean: 0.03,
                shLx: -1.05, shRx: -1.05, shLz: 0.12, shRz: -0.12, elL: -0.35, elR: -0.35,
                hdY: Math.sin(t * 0.7) * 0.05
            };
        },
        talk: function (t) {
            return {
                shRx: -0.7 + Math.sin(t * 4.2) * 0.28, elR: -1.1,
                hdX: Math.sin(t * 3) * 0.05, hdY: Math.sin(t * 1.3) * 0.15
            };
        },
        greet: function (t) {
            return { shRz: -2.5 + Math.sin(t * 9) * 0.3, shRx: 0, elR: -0.3, hdY: 0.1 };
        },
        work: function (t) {
            const s = Math.sin(t * 2);
            return { hy: STAND_HIPS - 0.03, lean: 0.12, shLx: -0.9 + s * 0.2, shRx: -0.9 - s * 0.2, elL: -0.6, elR: -0.6 };
        }
    };

    const cur = {};
    Object.keys(BASE).forEach(function (k) { cur[k] = BASE[k]; });
    let name = 'idle', t = Math.random() * 10;

    function apply() {
        hips.position.y = cur.hy;
        torso.rotation.x = cur.lean;
        head.rotation.x = cur.hdX;
        head.rotation.y = cur.hdY;
        legL.hp.rotation.x = cur.hipL; legR.hp.rotation.x = cur.hipR;
        legL.kn.rotation.x = cur.knL; legR.kn.rotation.x = cur.knR;
        armL.sh.rotation.set(cur.shLx, 0, cur.shLz); armR.sh.rotation.set(cur.shRx, 0, cur.shRz);
        armL.el.rotation.x = cur.elL; armR.el.rotation.x = cur.elR;
    }
    apply();

    const actions = {};
    Object.keys(POSES).forEach(function (k) { actions[k] = { name: k }; });

    return {
        root: root,
        model: model,
        parts: { hips: hips, torso: torso, head: head, armL: armL, armR: armR, legL: legL, legR: legR },
        mats: { skin: skin, shirt: shirt, pants: pants, hair: hair, shoe: shoe },
        mixer: { update: function () { } },          // pas de mixer : les animations sont calculées dans update()
        actions: actions,
        simple: true,
        play: function (n) {
            if (!POSES[n]) return false;
            name = n;
            return true;
        },
        update: function (dt) {
            dt = dt || 0;
            t += dt;
            const tgt = Object.assign({}, BASE, POSES[name](t));
            const k = Math.min(1, dt * 12);
            Object.keys(BASE).forEach(function (key) { cur[key] += (tgt[key] - cur[key]) * k; });
            apply();
        }
    };
}


// ═══════════════════════════════════════════════════════════════════════════
// LES CORPS DANS LA RUE – bulle, clic, marche, véhicules, poste
// ═══════════════════════════════════════════════════════════════════════════
const WALK_CHASE = 1.8;       // m/s : quand il a un nouveau point de repos à rejoindre
const SEE_PLAYER = 10;        // il se tourne vers toi à moins de 10 m
const FAR_NO_ANIM = 160;      // au-delà, on ne calcule plus l'animation
const BUBBLE_RANGE = 25;      // la bulle de parole n'apparaît qu'à moins de 25 m
const CLICK_RANGE = 12;       // on peut cliquer sur un avatar pour lui parler à moins de 12 m

export function createNpcBodies(scene, o) {
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
        Bubbles.place(b.id, hx, hy, on, dist);
    }

    // Clic sur un avatar (ou, si la souris est verrouillée, avatar au centre de l'écran) : la boîte de réponse s'ouvre
    function onClick(ev) {
        const t = ev.target;
        if (t && t.closest && t.closest('.bt-dlg')) return;
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
        b.a = createNpc({ height: def.height, look: def.look });
        const sheet = NPCS[id];
        if (sheet && typeof sheet.customize === 'function') { try { sheet.customize(b.a, THREE); } catch (e) { console.warn('[npc ' + id + '] customize :', e); } }
        b.grp.add(b.a.root);
        play(b, 'idle');
    }

    function play(b, name) {
        if (!b.a || b.cur === name) return;
        const key = b.a.actions && b.a.actions[name] ? name : (name === 'drive' || name === 'talk' || name === 'greet' || name === 'work' || name === 'sleep' ? 'idle' : null);
        if (!key || !b.a.actions[key]) {
            b.missing = b.missing || {};
            return;
        }
        b.cur = name;
        try { b.a.play(key); } catch (e) { /* animation absente : on garde la précédente */ }
    }

    // ----- poste (station-service) : c'est le lieu qui pilote le corps -----
    function gasVehicles() {              // véhicules que la station peut servir : taxi, bus, voiture de police
        const out = [];
        Object.keys(vehicles).forEach(function (k) {
            const V = vehicles[k]; if (!V || !V.getPose) return;
            let p = null; try { p = V.getPose(); } catch (e) { p = null; }
            if (!p || !isFinite(p.x)) return;
            const h = p.heading != null ? p.heading : (p.yaw != null ? p.yaw : (p.ry != null ? p.ry : (p.rot != null ? p.rot : p.h)));
            out.push({
                id: k, x: p.x, z: p.z, heading: h,
                speed: p.speed != null ? Math.abs(p.speed) : ((V.isMoving && V.isMoving()) ? 5 : 0),
                isPlayer: !!(V.playerDriving || (V.isPlayerDriving && V.isPlayerDriving())),
                tank: V.tank, refuel: V.refuel ? V.refuel.bind(V) : undefined, fuelPort: V.fuelPort, tankCap: V.tankCap
            });
        });
        return out;
    }
    function wirePost(PS) {
        if (PS._bodyWired) return; PS._bodyWired = true;
        if (PS.attachDefaults) PS.attachDefaults({ player: function () { return camera.position; }, vehicles: gasVehicles });
    }
    function postStep(b, PS, dt, cam) {
        const a = b.a, p = PS.pose();
        b.grp.visible = !!p.visible;
        if (!p.visible) { bubbleAt(b, false); return; }
        b.x = p.x; b.z = p.z; b.heading = p.heading;
        b.grp.position.set(p.x, p.y, p.z);
        b.grp.rotation.y = p.heading;
        if (Math.hypot(cam.x - p.x, cam.z - p.z) < FAR_NO_ANIM) { play(b, p.anim); a.update(dt); }
        bubbleAt(b, true);
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
            if (!a) return;
            const PS = b.def.post ? window[b.def.post] : null;
            if (PS) wirePost(PS);
            if (!actor) { if (PS && PS.controls && PS.controls(null)) postStep(b, PS, dt, cam); return; }     // pas d'acteur dans society : le poste le pilote quand même

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

            // 2b. à son poste : le lieu dit où il est et ce qu'il fait
            if (PS && !tr && PS.controls && PS.controls(actor)) { postStep(b, PS, dt, cam); return; }

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
                vis = !place.indoor;
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
                play(b, moving ? 'walk' : (actor.greetUntil > now ? 'greet' : (actor.speakingUntil > now ? 'talk' : 'idle')));
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
    return api;
}
