// npc-body.js – un PNJ tout en three.js (cylindres, sphères, boîtes) : quelques Ko au lieu de 15 à 40 Mo de FBX + textures.
//
// Il a la même « prise » qu'un avatar Mixamo de avatar-loader.js : { root, model, mixer, actions, play(nom), update(dt) },
// donc engine/avatar-body.js le pilote sans rien changer d'autre (marche, assis, au volant, parle...).
//
// Animations (calculées par le code, rien à télécharger) : idle, walk, run, sit, drive, talk, greet, work.
// « sleep », « enter », « exit » n'existent pas : avatar-body retombe sur idle (ou ne joue rien).
//
// Apparence : opts.look = { skin, shirt, pants, hair, hairStyle: 'short' | 'long' | 'bun' | 'bald', hat: 'cap' | null, hatColor,
//             beard: '#rrggbb' (absent = pas de barbe), glasses: true, widen: 1 (plus grand = plus large) } (couleurs CSS '#rrggbb').
// Forme à la main : le retour expose parts { hips, torso, head, armL, armR, legL, legR } et mats { skin, shirt, pants, hair, shoe }
// (la fiche du PNJ, npcs/<id>.js, peut s'en servir dans customize(body, THREE)).
// Hauteur : opts.height (mètres). Il regarde vers +z comme un avatar Mixamo.
// Réglage si assis trop haut / trop bas dans un véhicule : SIT_HIPS (hauteur du bassin assis, par rapport au plancher).

import * as THREE from 'three';

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
