import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — LIT UNIVERSEL (objects/sleepable.js)
// ==========================================
// Rend N'IMPORTE QUEL lit dormable : celui d'Evelyn, celui du thérapeute, un lit d'hôtel, une prison...
//
//   import { makeSleepable } from '../objects/sleepable.js';
//
//   const bed = makeSleepable({
//       camera, canvas,
//       target: bedGroup,            // le Group / Mesh du lit (tout ce qui est cliquable)
//       // --- tout ce qui suit est OPTIONNEL ---
//       lyingPos: new THREE.Vector3(x, y, z),   // position de la tête (sinon calculée : centre du lit, un peu au-dessus)
//       headDir:  new THREE.Vector3(0, 0, -1),  // direction pieds -> tête, à plat (sinon : le grand côté du lit, vers le mur le plus proche du fond)
//       maxDist: 4.5,                // distance maxi pour cliquer
//       hours: 8,                    // durée de sommeil simulée (récupération de fatigue / vie)
//       quality: 1,                  // 1 = lit normal, 0.6 = banc de prison, 1.3 = lit luxueux
//       onSleep: (wake) => { ... },  // si tu veux un rêve : appelle wake() au réveil. Sinon : réveil automatique après `autoWake` s
//       autoWake: 6,                 // secondes passées les yeux fermés (sans rêve)
//       canSleep: () => true,        // ex. () => !police.isArrested()
//       label: 'lit d\'Evelyn'
//   });
//
//   bed.update(dt)    // à appeler dans le update() du lieu
//   bed.isSleeping()  // pour world.isSleeping()
//   bed.dispose()
//
// Au coucher : BadTherapist.life.sleep(true). Au réveil : BadTherapist.life.sleep(false) puis BadTherapist.life.rest(hours, quality).
// Le joueur se relève là où il se trouvait quand il a cliqué (pas besoin de calculer un côté du lit).

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let lidsEl = null, lidTop = null, lidBot = null;
function setLids(a) {
    if (!lidsEl) {
        lidsEl = document.createElement('div');
        lidsEl.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;display:none;overflow:hidden';
        const bar = 'position:absolute;left:0;right:0;height:0;background:#000;box-shadow:0 0 60px 36px #000';
        lidTop = document.createElement('div'); lidTop.style.cssText = bar + ';top:0';
        lidBot = document.createElement('div'); lidBot.style.cssText = bar + ';bottom:0';
        lidsEl.appendChild(lidTop); lidsEl.appendChild(lidBot);
        document.body.appendChild(lidsEl);
    }
    lidsEl.style.display = a <= 0.001 ? 'none' : 'block';
    lidTop.style.height = (a * 50.5) + '%';
    lidBot.style.height = (a * 50.5) + '%';
}

// Un seul lit à la fois peut être utilisé : on garde la trace du lit actif
let activeBed = null;

export function makeSleepable(o) {
    const camera = o.camera, canvas = o.canvas;
    const maxDist = o.maxDist || 4.5;
    const hours = o.hours || 8;
    const quality = o.quality == null ? 1 : o.quality;
    const autoWake = o.autoWake == null ? 6 : o.autoWake;

    const S = { phase: 'idle', t: 0, clock: 0 };
    const startPos = new THREE.Vector3(), startQ = new THREE.Quaternion();
    const lyingPos = new THREE.Vector3(), lyingQ = new THREE.Quaternion();
    const standPos = new THREE.Vector3(), standQ = new THREE.Quaternion();
    const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

    function lookQ(eye, target, up) {
        _m.lookAt(eye, target, up);
        return new THREE.Quaternion().setFromRotationMatrix(_m);
    }
    function next(p) { S.phase = p; S.t = 0; }

    function computeLying() {
        o.target.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(o.target);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        if (o.lyingPos) lyingPos.copy(o.lyingPos);
        else lyingPos.set(center.x, box.max.y + 0.3, center.z);   // juste au-dessus du matelas

        let head;
        if (o.headDir) head = o.headDir.clone().setY(0).normalize();
        else {
            // grand côté du lit, orienté vers là où le joueur ne se trouve PAS (la tête est rarement du côté de l'entrée)
            head = size.x > size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
            const toPlayer = _v.copy(startPos).sub(center);
            if (head.dot(toPlayer) > 0) head.negate();
        }
        lyingQ.copy(lookQ(lyingPos, _v.copy(lyingPos).add(new THREE.Vector3(0, 1, 0)), head));
    }

    function canStart() {
        if (S.phase !== 'idle' || activeBed) return false;
        if (window._doorAnimating) return false;
        if (o.canSleep && !o.canSleep()) return false;
        if (window.BadTherapistDream && window.BadTherapistDream.active) return false;
        return true;
    }

    function startSleep() {
        if (!canStart()) return;
        activeBed = api;
        startPos.copy(camera.position);
        startQ.copy(camera.quaternion);
        computeLying();
        next('lying');
        if (window.BadTherapist && window.BadTherapist.life) window.BadTherapist.life.sleep(true);
    }

    // Rechargement de page pendant un rêve (comme bedroom.js)
    function resumeSleep() {
        if (S.phase !== 'idle') return;
        activeBed = api;
        startPos.copy(camera.position);
        computeLying();
        camera.position.copy(lyingPos);
        camera.quaternion.copy(lyingQ);
        setLids(1);
        next('asleep');
    }

    function wakeUp() {
        if (S.phase !== 'asleep' && S.phase !== 'closing') return;
        standPos.copy(startPos); standPos.y = 1.7;
        standQ.copy(startQ);
        next('waking');
    }

    function finishWake() {
        setLids(0);
        S.phase = 'idle';
        activeBed = null;
        const BT = window.BadTherapist;
        if (BT && BT.life) {
            BT.life.sleep(false);
            if (BT.life.rest) BT.life.rest(hours, quality);
        }
    }

    function update(dt) {
        if (S.phase === 'idle') return;
        S.t += dt; S.clock += dt;
        let k;
        if (S.phase === 'lying') {
            k = Math.min(S.t / 2.0, 1);
            const e = ease(k);
            camera.position.lerpVectors(startPos, lyingPos, e);
            camera.position.y += Math.sin(Math.PI * e) * 0.12;
            camera.quaternion.copy(startQ).slerp(lyingQ, e);
            if (k >= 1) next('rest');
        } else if (S.phase === 'rest') {
            camera.position.copy(lyingPos);
            camera.position.y += Math.sin(S.clock * 1.6) * 0.008;
            camera.quaternion.copy(lyingQ);
            if (S.t >= 1.4) next('closing');
        } else if (S.phase === 'closing') {
            k = Math.min(S.t / 1.8, 1);
            camera.position.copy(lyingPos);
            camera.quaternion.copy(lyingQ);
            setLids(ease(k));
            if (k >= 1) {
                next('asleep');
                if (o.onSleep) o.onSleep(wakeUp);
            }
        } else if (S.phase === 'asleep') {
            camera.position.copy(lyingPos);
            camera.quaternion.copy(lyingQ);
            if (!o.onSleep && S.t >= autoWake) wakeUp();
        } else if (S.phase === 'waking') {
            k = Math.min(S.t / 2.2, 1);
            camera.position.copy(lyingPos);
            camera.quaternion.copy(lyingQ);
            setLids(1 - ease(k));
            if (k >= 1) next('rising');
        } else if (S.phase === 'rising') {
            k = Math.min(S.t / 1.6, 1);
            const e = ease(k);
            camera.position.lerpVectors(lyingPos, standPos, e);
            camera.position.y += Math.sin(Math.PI * e) * 0.15;
            camera.quaternion.copy(lyingQ).slerp(standQ, e);
            if (k >= 1) finishWake();
        }
    }

    // Clic sur le lit
    const meshes = [];
    o.target.traverse(c => { if (c.isMesh) meshes.push(c); });
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function onClick(ev) {
        if (S.phase !== 'idle') return;
        const rect = canvas.getBoundingClientRect();
        ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(meshes, false);
        if (!hit.length || hit[0].distance > maxDist) return;
        startSleep();
    }
    canvas.addEventListener('click', onClick);

    const api = {
        update, startSleep, wakeUp, resumeSleep,
        isSleeping: () => S.phase !== 'idle',
        dispose() { canvas.removeEventListener('click', onClick); if (activeBed === api) activeBed = null; }
    };
    return api;
}
