import * as THREE from 'three';

// objects/fuel-gauge.js – JAUGE D'ESSENCE sur le tableau de bord (cadran E ... F, aiguille, voyant de pompe).
//
//   import { createFuelGauge } from './fuel-gauge.js';
//   const gauge = createFuelGauge(g, tank, { x: -0.5, y: 1.535, z: -1.5, tilt: -1.0, w: 0.26, hud: true });
//   gauge.update(dt, driving);      // à appeler à chaque image (driving = le joueur conduit : active l'alerte à l'écran)
//
//  - x, y, z : position dans le repère du véhicule (sur le dessus du tableau de bord)
//  - tilt    : inclinaison autour de l'axe X (négatif = le cadran regarde vers le haut et vers le conducteur, assis derrière)
//  - w       : largeur du cadran en mètres (la hauteur suit)
//  - hud     : true = affiche aussi une alerte « LOW FUEL / OUT OF FUEL » à l'écran quand le joueur conduit (camion)
//
// L'aiguille est lente comme une vraie jauge (elle rattrape le niveau en ~1 s). Voyant ambre sous 15 %, rouge clignotant à sec.

const W = 256, H = 192, CX = 128, CY = 124, R = 84;
const LOW = 0.15;

function drawDial(c) {
    // fond + lunette
    c.fillStyle = '#07080a'; c.fillRect(0, 0, W, H);
    const bez = c.createLinearGradient(0, 0, 0, H);
    bez.addColorStop(0, '#5b6168'); bez.addColorStop(1, '#2a2d31');
    c.fillStyle = bez; roundRect(c, 4, 4, W - 8, H - 8, 18); c.fill();
    c.fillStyle = '#0d0f12'; roundRect(c, 11, 11, W - 22, H - 22, 14); c.fill();

    // zone rouge (réserve)
    c.lineCap = 'butt';
    c.strokeStyle = '#c4261d'; c.lineWidth = 9;
    c.beginPath(); c.arc(CX, CY, R - 2, Math.PI, Math.PI * (1 + LOW)); c.stroke();
    // arc principal
    c.strokeStyle = '#d8d2c6'; c.lineWidth = 3;
    c.beginPath(); c.arc(CX, CY, R + 6, Math.PI, Math.PI * 2); c.stroke();

    // graduations
    for (let i = 0; i <= 20; i++) {
        const f = i / 20, a = Math.PI * (1 + f), big = i % 5 === 0;
        const r0 = R + 6, r1 = R - (big ? 14 : 7);
        c.strokeStyle = f < LOW ? '#ff6a5c' : '#e8e2d4';
        c.lineWidth = big ? 4 : 2;
        c.beginPath();
        c.moveTo(CX + Math.cos(a) * r0, CY + Math.sin(a) * r0);
        c.lineTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
        c.stroke();
    }

    // lettres
    c.fillStyle = '#f1ebdd'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 26px Arial, sans-serif';
    c.fillStyle = '#ff6a5c'; c.fillText('E', CX - R + 4, CY + 26);
    c.fillStyle = '#f1ebdd'; c.fillText('F', CX + R - 4, CY + 26);
    c.font = 'bold 20px Arial, sans-serif';
    c.fillText('1/2', CX, CY - R + 34);
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

// petite pompe à essence (voyant)
function drawPump(c, cx, cy, color, glow) {
    c.save();
    if (glow) { c.shadowColor = color; c.shadowBlur = 16; }
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 3;
    c.fillRect(cx - 11, cy - 14, 15, 26);                              // corps
    c.fillStyle = '#0d0f12'; c.fillRect(cx - 8, cy - 11, 9, 8);        // fenêtre
    c.beginPath(); c.moveTo(cx + 4, cy - 6); c.lineTo(cx + 11, cy - 6); c.lineTo(cx + 11, cy + 6); c.stroke();   // tuyau
    c.fillRect(cx - 14, cy + 12, 21, 3);                               // socle
    c.restore();
}

export function createFuelGauge(parent, tank, o) {
    o = o || {};

    const base = document.createElement('canvas'); base.width = W; base.height = H;
    drawDial(base.getContext('2d'));

    const live = document.createElement('canvas'); live.width = W; live.height = H;
    const ctx = live.getContext('2d');
    const tex = new THREE.CanvasTexture(live);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;

    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false });
    const w = o.w || 0.26;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * H / W), mat);
    mesh.position.set(o.x || 0, o.y || 1, o.z || 0);
    mesh.rotation.x = o.tilt != null ? o.tilt : -1.0;
    parent.add(mesh);

    let cur = tank.fraction, lastDrawn = -1, lastLamp = -1, t = 0;

    function draw(f, lamp) {
        ctx.drawImage(base, 0, 0);
        // voyant
        const col = lamp === 2 ? '#ff3b30' : lamp === 1 ? '#ffb02e' : '#2b3036';
        drawPump(ctx, CX, CY + 40, col, lamp > 0);
        // aiguille
        const a = Math.PI * (1 + Math.max(0, Math.min(1, f)));
        const tx = CX + Math.cos(a) * (R - 6), ty = CY + Math.sin(a) * (R - 6);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(CX - Math.cos(a) * 12, CY - Math.sin(a) * 12); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = '#c9c4b8'; ctx.beginPath(); ctx.arc(CX, CY, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.arc(CX, CY, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        tex.needsUpdate = true;
        lastDrawn = f; lastLamp = lamp;
    }

    // ---- alerte à l'écran (camion) ----
    let hud = null;
    if (o.hud) {
        hud = document.createElement('div');
        hud.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:31;display:none;padding:6px 14px;' +
            'background:rgba(23,23,32,0.9);border:1px solid #8a5a2f;border-radius:10px;font:bold 13px monospace;letter-spacing:1px;pointer-events:none';
        document.body.appendChild(hud);
    }

    function update(dt, active) {
        t += dt;
        const target = tank.fraction;
        cur += (target - cur) * Math.min(1, dt * 1.5);          // l'aiguille est lente, comme une vraie jauge
        if (Math.abs(cur - target) < 0.001) cur = target;

        const state = tank.empty ? 2 : (tank.fraction < LOW ? 1 : 0);
        const lamp = state === 2 ? (Math.floor(t * 2.5) % 2 === 0 ? 2 : 0) : state;

        if (Math.abs(cur - lastDrawn) > 0.003 || lamp !== lastLamp) draw(cur, lamp);

        if (hud) {
            const show = !!active && state > 0 && (state === 2 || Math.floor(t * 1.5) % 2 === 0);
            hud.style.display = show ? 'block' : 'none';
            if (show) {
                hud.textContent = state === 2 ? 'OUT OF FUEL' : 'LOW FUEL';
                hud.style.color = state === 2 ? '#ff6b6b' : '#ffb02e';
            }
        }
    }

    draw(cur, 0);
    return { mesh: mesh, update: update, dispose: function () { parent.remove(mesh); if (hud) hud.remove(); } };
}
