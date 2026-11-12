// avatar-body.js – les CORPS 3D d'Oliver et de Pluie dans la rue (avatars Mixamo déjà dans avatars/).
//
// Ils lisent l'état de society.js (où est l'avatar, est-il en train de marcher, est-il au volant) et le montrent :
//   • Oliver au volant du vrai taxi (taxi.js, option freeDriver) : assis à l'arrêt, « driving » quand ça roule ;
//     s'il descend (stop_job) il apparaît à côté de la portière et peut marcher ;
//   • marche en ligne droite entre deux lieux (animation walk), repos (idle) près du lieu, regarde le joueur s'il est proche ;
//   • invisibles quand ils sont dans l'immeuble ou passagers du taxi.
// Evelyn n'est PAS ici : son corps reste dans therapist-house.js.
//
// Brancher : dans outside.js, après createTaxi (voir notes/INTEGRATION-3.md ; outside.js corrigé fourni).
// Réglage : BadTherapistBodies.list() ; si un modèle flotte / s'enfonce, changer height / yOffset dans DEFS.

import * as THREE from 'three';
import { loadMixamoAvatar } from '../avatar-loader.js';
import { society } from './society.js';

const DEFS = {
    oliver: {
        dir: 'avatars/oliver/', model: 'oliver.fbx', height: 1.78, driver: true,
        anims: { idle: 'Happy Idle.fbx', walk: 'Walking.fbx', run: 'Running.fbx', sit: 'Sitting.fbx', drive: 'Driving.fbx' }
    },
    pluie: {
        dir: 'avatars/pluie/', model: 'pluie.fbx', height: 1.68,
        anims: { idle: 'happy_idle.fbx', walk: 'walking.fbx', run: 'run.fbx', sit: 'sit.fbx', talk: 'talk.fbx' }
    }
};
const WALK_CHASE = 1.8;       // m/s : quand il a un nouveau point de repos à rejoindre
const SEE_PLAYER = 10;        // il se tourne vers toi à moins de 10 m
const FAR_NO_ANIM = 160;      // au-delà, on ne calcule plus l'animation

export function createBodies(scene, o) {
    const camera = o.camera, groundH = o.groundH || function () { return 0; }, taxi = o.taxi || null;
    const R = society.registry;
    const bodies = {};
    let tSync = 0;

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
            height: def.height
        }).then(function (a) {
            b.a = a;
            b.grp.add(a.root);
            play(b, 'idle');
            console.log('[body] ' + id + ' chargé. Animations :', Object.keys(a.actions));
        }).catch(function (e) {
            console.warn('[body] ' + id + " n'a pas pu être chargé :", e && e.message ? e.message : e);
            // Oliver absent : le taxi reste utilisable comme avant (conducteur « virtuel »)
            if (def.driver && taxi && taxi.setDriverPresent) taxi.setDriverPresent(true);
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
        if (!b.a || !taxi) return;
        if (yes) {
            taxi.slot.add(b.a.root);
            b.a.root.position.set(0, 0, 0);
            b.a.root.rotation.set(0, 0, 0);
            b.grp.visible = false;
            b.cur = '';
        } else {
            b.grp.add(b.a.root);
            b.a.root.position.set(0, 0, 0);
            b.a.root.rotation.set(0, 0, 0);
            const ds = taxi.doorSpot ? taxi.doorSpot() : [0, 0];
            b.x = ds[0]; b.z = ds[1];
            b.cur = '';
        }
        if (b.def.driver && taxi.setDriverPresent) taxi.setDriverPresent(!!yes);
        b.seated = !!yes;
    }

    function step(dt) {
        const now = Date.now();
        if (taxi) { tSync += dt; if (tSync > 0.4) { tSync = 0; society.syncTaxi(); } }
        const cam = scene.worldToLocal(camera.position.clone());

        Object.keys(bodies).forEach(function (id) {
            const b = bodies[id], a = b.a, actor = R.actor(id);
            if (!a || !actor) return;

            // 1. au volant ?
            const wantSeat = !!(b.def.driver && taxi && taxi.slot && actor.job === 'taxi');
            if (b.seated !== wantSeat) seat(b, wantSeat);
            if (wantSeat) {
                play(b, taxi.isMoving && taxi.isMoving() ? 'drive' : 'sit');
                a.update(dt);
                return;
            }

            // 2. passager d'un véhicule : invisible
            const tr = actor.travel;
            if (actor.ride || (tr && tr.mode === 'vehicle')) { b.grp.visible = false; return; }

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
            if (!vis) return;

            // 4. le regard : vers le joueur s'il est tout proche et que l'avatar est à l'arrêt
            const dpx = cam.x - b.x, dpz = cam.z - b.z, dp = Math.hypot(dpx, dpz);
            if (!moving && dp < SEE_PLAYER) {
                const want = Math.atan2(dpx, dpz);
                let diff = want - b.heading;
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                b.heading += diff * Math.min(1, dt * 4);
            }
            b.grp.position.set(b.x, groundH(b.x, b.z), b.z);
            b.grp.rotation.y = b.heading;

            // 5. animation
            if (dp < FAR_NO_ANIM) {
                play(b, moving ? 'walk' : (actor.speakingUntil > now ? 'talk' : 'idle'));
                a.update(dt);
            }
        });
    }

    Object.keys(DEFS).forEach(function (id) { if (R.actor(id)) load(id, DEFS[id]); });

    const api = {
        update: step,
        list: function () { return Object.keys(bodies).map(function (k) { const b = bodies[k]; return { id: k, loaded: !!b.a, visible: b.grp.visible, seated: b.seated, x: b.x, z: b.z }; }); }
    };
    window.BadTherapistBodies = api;
    return api;
}
