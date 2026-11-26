import * as THREE from 'three';
import { loadMixamoAvatar } from '../avatar-loader.js';

// ═══════════════════════════════════════════════════════════════════════════
// BAD THERAPIST — TOUS LES VÉHICULES (objects/vehicle.js)
// ═══════════════════════════════════════════════════════════════════════════
// Un seul fichier pour : le RÉSERVOIR (createTank), la JAUGE (createFuelGauge) et les quatre véhicules
// (createTruck, createTaxi, createBus, createPoliceCar). Il remplace : fuel.js, fuel-gauge.js, taxi.js, bus.js, police-car.js
// et l'ancien vehicle.js (qui ne contenait que le camion : il s'appelle maintenant « truck »).
//
// LA LISTE DES VÉHICULES (VEHICLES, juste en dessous) : chaque véhicule a un id et un propriétaire (owner = l'id du PNJ ou du joueur).
// Le métier (la ligne de bus, la patrouille, le service de taxi) n'est PAS ici : il est dans la fiche du PNJ (npcs/violet.js, leon.js, oliver.js).
// Un véhicule ne sait que rouler, consommer de l'essence et se faire remplir ; n'importe qui peut donc le conduire.
// Pour ajouter une voiture : une ligne dans VEHICLES + sa carrosserie.
//
// Chaque objet renvoyé par createTruck / createTaxi / createBus / createPoliceCar reçoit .id, .type et .owner depuis cette liste.
//
// NOTE : tout le code de chaque véhicule est repris tel quel (même comportement qu'avant) dans un bloc à part,
// pour que leurs constantes (L, W, DRIVER, WHEEL...) ne se mélangent pas.

export const VEHICLES = [
  { id: 'truck',  type: 'truck',  owner: 'player' },     // le camion du joueur
  { id: 'taxi',   type: 'taxi',   owner: 'oliver' },
  { id: 'bus',    type: 'bus',    owner: 'violet' },
  { id: 'police', type: 'police', owner: 'leon' }
];
export function vehicleInfo(id) { return VEHICLES.filter(function (v) { return v.id === id; })[0] || null; }
function tag(v, id) { const i = vehicleInfo(id); if (v && i) { v.id = i.id; v.type = i.type; v.owner = i.owner; } return v; }

// ═══════════════════════════════════════════════════════════════════════════
// 1. CARBURANT : réservoir + jauge (communs à tous les véhicules)
//    La station (places/gasstation.js) lit v.tank.cap / v.tank.level et remplit avec v.refuel(litres).
// ═══════════════════════════════════════════════════════════════════════════
export const FUEL_TYPES = {
    car:    { cap: 50 },
    truck:  { cap: 70 },
    taxi:   { cap: 55 },
    police: { cap: 60 },
    bus:    { cap: 150 }
};
// Autonomie du jeu (mètres pour un plein) : le monde est petit, 12 km = un plein dure assez longtemps pour jouer, assez court pour devoir passer à la station.
export const RANGE_METERS = 12000;

export function createTank(o) {
    o = o || {};
    const base = FUEL_TYPES[o.type] || FUEL_TYPES.car;
    const cap = o.cap || base.cap, range = o.rangeMeters || RANGE_METERS;
    const t = {
        cap: cap,
        level: o.level != null ? o.level : cap * (0.5 + Math.random() * 0.4),
        perMeter: cap / range,
        get empty() { return t.level <= 0.001; },
        get fraction() { return t.level / t.cap; },
        get low() { return t.level < t.cap * 0.15; },
        consume: function (meters) { t.level = Math.max(0, t.level - Math.abs(meters) * t.perMeter); return t.level; },
        add: function (liters) { t.level = Math.min(t.cap, t.level + liters); return t.level; }
    };
    return t;
}
const createFuelGauge = (function () {
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

  function createFuelGauge(parent, tank, o) {
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
  return createFuelGauge;
})();
export { createFuelGauge };

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE CAMION (ancien vehicle.js) — id « truck », propriétaire : le joueur
// ═══════════════════════════════════════════════════════════════════════════
const _truck = (function () {
  // ==========================================
  // BAD THERAPIST — LE CAMION (vehicle.js)
  // ==========================================
  // Un seul véhicule : un petit camion de livraison avec une benne ouverte (pour les colis).
  //  - on peut monter dedans / en descendre (bouton ENTER / EXIT ou touche E),
  //  - il roule très vite, suit le relief et monte les collines et les montagnes,
  //  - collisions : arbres, rochers, immeuble, maison.
  //
  // Conduite : joystick gauche (avant/arrière + direction), clavier ZQSD / WASD / flèches, ESPACE = frein à main.
  // Le joystick droit (ou la souris) sert à regarder autour de soi.
  //
  // Repère : le camion vit dans le repère local de "parent" (la rue). "origin" = position
  // monde de l'origine de ce repère (la rue est décalée dans le monde de la chambre).
  // Avant du camion = -z local ; cap h -> direction (-sin h, -cos h).

  function createTruck(parent, o) {

    const origin = o.origin || { x: 0, y: 0, z: 0 };
    const camera = o.camera;
    const input = o.input || { lx: 0, ly: 0, brake: false };
    const groundH = o.groundH;
    const rects = o.rects || [];
    const bounds = o.bounds || { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };

    const MAX = 36;        // m/s (~130 km/h)
    const MAXR = 9;        // marche arrière
    const ACC = 15;
    const BRAKE = 28;

    // ==========================================
    // MODÈLE
    // ==========================================

    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    parent.add(g);

    const M = {
      body: new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.55, metalness: 0.35, emissive: 0x180806 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.95 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x302a25, roughness: 1 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false
      }),
      light: new THREE.MeshBasicMaterial({ color: 0xffe9c0 }),
      tail: new THREE.MeshBasicMaterial({ color: 0x7a1208 }),
      snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
    };

    function box(w, h, d, mat, x, y, z, par) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      (par || g).add(m);
      return m;
    }

    // Châssis, capot, calandre, pare-chocs
    box(2.0, 0.3, 5.7, M.dark, 0, 0.62, 0);
    box(1.95, 0.55, 1.25, M.body, 0, 1.05, -2.28);
    box(2.0, 0.7, 0.1, M.dark, 0, 0.85, -2.93);
    box(2.1, 0.22, 0.22, M.metal, 0, 0.55, -2.95);
    box(2.1, 0.22, 0.22, M.metal, 0, 0.55, 2.95);
    box(0.3, 0.16, 0.06, M.light, -0.7, 0.98, -2.97);
    box(0.3, 0.16, 0.06, M.light, 0.7, 0.98, -2.97);
    box(0.3, 0.15, 0.05, M.tail, -0.8, 1.0, 2.93);
    box(0.3, 0.15, 0.05, M.tail, 0.8, 1.0, 2.93);

    // Cabine (ouverte vue de l'intérieur : sol, portières, toit, montants, vitres)
    box(1.95, 0.06, 1.9, M.dark, 0, 0.8, -0.75);                      // plancher
    box(0.07, 0.72, 1.85, M.body, -0.99, 1.17, -0.75);                // portière gauche
    box(0.07, 0.72, 1.85, M.body, 0.99, 1.17, -0.75);                 // portière droite
    box(1.95, 0.75, 0.1, M.body, 0, 1.17, -1.7);                      // tablier
    box(1.95, 1.45, 0.08, M.body, 0, 1.55, 0.2);                      // paroi arrière
    box(2.02, 0.08, 1.98, M.body, 0, 2.58, -0.74);                    // toit
    box(1.9, 0.07, 1.85, M.snow, 0, 2.65, -0.74);
    box(1.85, 0.07, 1.2, M.snow, 0, 1.36, -2.28);
    [[-0.95, -1.66], [0.95, -1.66], [-0.97, 0.12], [0.97, 0.12]].forEach(function (p) {
      box(0.07, 1.0, 0.07, M.body, p[0], 2.08, p[1]);
    });
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 0.95), M.glass);
    ws.position.set(0, 2.08, -1.67);
    g.add(ws);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), M.glass);
    rw.position.set(0, 2.1, 0.15);
    g.add(rw);
    [-0.985, 0.985].forEach(function (x) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), M.glass);
      sw.rotation.y = Math.PI / 2;
      sw.position.set(x, 2.08, -0.74);
      g.add(sw);
    });
    box(0.1, 0.18, 0.12, M.dark, -1.1, 1.95, -1.55);                  // rétroviseurs
    box(0.1, 0.18, 0.12, M.dark, 1.1, 1.95, -1.55);

    // Intérieur : tableau de bord, sièges, volant
    box(1.8, 0.24, 0.45, M.dark, 0, 1.4, -1.48);
    box(0.55, 0.12, 0.55, M.seat, -0.5, 1.02, -0.1);
    box(0.55, 0.65, 0.1, M.seat, -0.5, 1.38, 0.12);
    box(0.55, 0.12, 0.55, M.seat, 0.5, 1.02, -0.1);
    box(0.55, 0.65, 0.1, M.seat, 0.5, 1.38, 0.12);
    const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
    wheelSteer.position.set(-0.5, 1.58, -1.18);
    wheelSteer.rotation.x = -0.95;
    g.add(wheelSteer);
    box(0.05, 0.05, 0.4, M.dark, -0.5, 1.48, -1.3).rotation.x = -0.95;

    // Benne ouverte (pour les colis)
    box(2.05, 0.1, 2.75, M.wood, 0, 0.95, 1.58);
    box(0.07, 0.5, 2.75, M.body, -1.0, 1.25, 1.58);
    box(0.07, 0.5, 2.75, M.body, 1.0, 1.25, 1.58);
    box(2.05, 0.5, 0.07, M.body, 0, 1.25, 2.93);
    box(2.05, 0.8, 0.07, M.body, 0, 1.35, 0.26);

    // Point d'ancrage pour poser des colis plus tard : truck.cargo.add(mesh)
    const cargo = new THREE.Group();
    cargo.position.set(0, 1.0, 1.58);
    g.add(cargo);

    // ==========================================
    // RÉSERVOIR + JAUGE D'ESSENCE (tableau de bord)
    // ==========================================
    // Le niveau est sauvegardé (localStorage 'bt_fuel_truck') : on retrouve le camion avec la même essence.
    const FUEL_KEY = 'bt_fuel_truck';
    let savedFuel;
    try { const v = parseFloat(localStorage.getItem(FUEL_KEY)); if (Number.isFinite(v)) savedFuel = v; } catch (e) { /* rien */ }
    const tank = createTank({ type: 'truck', level: savedFuel });
    const fuelPort = { x: 1.05, y: 0.8, z: 0.8 };        // trappe : côté droit, derrière la cabine (la station choisit le côté de la pompe)
    const gauge = createFuelGauge(g, tank, { x: -0.5, y: 1.535, z: -1.5, tilt: -1.0, w: 0.26, hud: true });
    let fuelSaveT = 0, lastSavedFuel = -1;
    function saveFuel(dt) {
      fuelSaveT += dt;
      if (fuelSaveT < 2) return;
      fuelSaveT = 0;
      if (Math.abs(tank.level - lastSavedFuel) < 0.01) return;
      lastSavedFuel = tank.level;
      try { localStorage.setItem(FUEL_KEY, String(tank.level)); } catch (e) { /* rien */ }
    }

    // Roues
    const wheels = [];
    [[-1.02, -2.0, true], [1.02, -2.0, true], [-1.02, 1.95, false], [1.02, 1.95, false]].forEach(function (w) {
      const wg = new THREE.Group();
      wg.rotation.order = 'YXZ';
      wg.position.set(w[0], 0.48, w[1]);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 14), M.rubber);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8), M.metal);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      g.add(wg);
      wheels.push({ g: wg, front: w[2] });
    });

    // Phares
    // Phares : si immeuble.js fournit une lumière partagée (o.headlight), le camion la prend en montant dedans
    const spot = o.headlight || new THREE.SpotLight(0xffe6c0, 0, 70, 0.6, 0.55, 1.0);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.4, -24);
    g.add(spotTarget);
    function mountHeadlight() {
      spot.position.set(0, 1.0, -2.8);
      g.add(spot);
      spot.target = spotTarget;
    }
    mountHeadlight();

    // ==========================================
    // ÉTAT
    // ==========================================

    let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
    let speed = 0, steerCur = 0;
    let pitch = 0, roll = 0, bodyY = groundH(x, z);
    let wheelRot = 0;
    let driving = false;
    let actionShown = false;
    const SEAT = new THREE.Vector3(-0.5, 1.95, -0.45);

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    // --- collisions ---
    function resolveAt(px, pz) {
      const R = 0.55;
      const t = o.collide ? o.collide(px, pz, R) : [px, pz];
      px = t[0]; pz = t[1];
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < rects.length; i++) {
          const c = rects[i];
          const cx = clamp(px, c.x0, c.x1), cz = clamp(pz, c.z0, c.z1);
          const dx = px - cx, dz = pz - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            px += dx / d * (R - d);
            pz += dz / d * (R - d);
          } else {
            const l = px - c.x0, r = c.x1 - px, tt = pz - c.z0, b = c.z1 - pz;
            const m = Math.min(l, r, tt, b);
            if (m === l) px = c.x0 - R;
            else if (m === r) px = c.x1 + R;
            else if (m === tt) pz = c.z0 - R;
            else pz = c.z1 + R;
          }
        }
      }
      return [px, pz];
    }

    function collideBody(cx, cz, h) {
      const fx = -Math.sin(h), fz = -Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      const pts = [[-0.9, -2.7], [0.9, -2.7], [-0.9, 2.7], [0.9, 2.7], [0, 0]];
      let pushed = 0;
      for (let iter = 0; iter < 2; iter++) {
        let sx = 0, sz = 0, n = 0;
        for (let i = 0; i < pts.length; i++) {
          const px = cx + rx * pts[i][0] - fx * pts[i][1];
          const pz = cz + rz * pts[i][0] - fz * pts[i][1];
          const r = resolveAt(px, pz);
          const dx = r[0] - px, dz = r[1] - pz;
          if (dx * dx + dz * dz > 1e-8) { sx += dx; sz += dz; n++; }
        }
        if (!n) break;
        cx += sx / n; cz += sz / n;
        pushed += Math.hypot(sx / n, sz / n);
      }
      return { x: cx, z: cz, pushed: pushed };
    }

    // ==========================================
    // PLACEMENT DU MODÈLE SUR LE RELIEF
    // ==========================================

    function place(dt, snap) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const hF = groundH(x + fx * 2.4, z + fz * 2.4);
      const hR = groundH(x - fx * 2.4, z - fz * 2.4);
      const hRt = groundH(x + rx * 1.0, z + rz * 1.0);
      const hL = groundH(x - rx * 1.0, z - rz * 1.0);
      const ty = (hF + hR + hRt + hL) / 4;
      const tp = Math.atan2(hF - hR, 4.8);
      const tr = Math.atan2(hRt - hL, 2.0);
      const k = snap ? 1 : Math.min(1, dt * 9);
      bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 14);
      pitch += (tp - pitch) * k;
      roll += (tr - roll) * k;
      g.position.set(x, bodyY, z);
      g.rotation.set(pitch, heading, roll);
    }

    place(0, true);

    // ==========================================
    // ENTRER / SORTIR
    // ==========================================

    function enter() {
      if (driving) return;
      driving = true;
      speed = 0;
      steerCur = 0;
      if (o.view) o.view.set(heading, 0);
      mountHeadlight();
      spot.intensity = 4.0;
      showExit();
    }

    function exit() {
      if (!driving) return;
      driving = false;
      speed = 0;
      if (spot.parent === g) spot.intensity = 0;
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const cands = [[-2.5, 0.4], [2.5, 0.4], [-2.5, 3.2], [0, 5.2]];
      let best = null;
      for (let i = 0; i < cands.length && !best; i++) {
        const px = x + rx * cands[i][0] + fx * cands[i][1];
        const pz = z + rz * cands[i][0] + fz * cands[i][1];
        const r = resolveAt(px, pz);
        if (Math.abs(r[0] - px) < 0.05 && Math.abs(r[1] - pz) < 0.05) best = [px, pz];
      }
      if (!best) best = [x + rx * -2.5, z + rz * -2.5];
      camera.position.x = origin.x + best[0];
      camera.position.z = origin.z + best[1];
      if (o.onExit) o.onExit(best[0], best[1]);
      hideAction();
    }

    function showExit() {
      if (o.action) { o.action.show('EXIT', exit); actionShown = true; }
    }
    function showEnter() {
      if (o.action && !actionShown) { o.action.show('ENTER', enter); actionShown = true; }
    }
    function hideAction() {
      if (o.action && actionShown) { o.action.hide(); actionShown = false; }
    }

    // ==========================================
    // CONDUITE
    // ==========================================

    function drive(dt) {

      const thr = tank.empty ? 0 : clamp(-input.ly, -1, 1);       // panne sèche : plus de moteur, le camion roule sur son élan puis s'arrête
      const st = clamp(input.lx, -1, 1);

      if (thr > 0.05) {
        if (speed < -0.5) speed += BRAKE * dt;
        else speed += thr * ACC * Math.max(0.12, 1 - Math.max(0, speed) / MAX) * dt;
      } else if (thr < -0.05) {
        if (speed > 0.5) speed -= BRAKE * (-thr) * dt;
        else speed -= (-thr) * 7 * Math.max(0.2, 1 - (-speed) / MAXR) * dt;
      } else {
        const drag = 2.0 + 0.01 * speed * speed;
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag * dt);
      }
      if (input.brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 30 * dt);

      // La pente ralentit un peu, mais le moteur est assez fort pour grimper presque partout
      speed -= 9.8 * Math.sin(pitch) * 0.3 * dt;
      speed = clamp(speed, -MAXR, MAX);
      tank.consume(Math.abs(speed) * dt);                          // 1 plein = RANGE_METERS (fuel.js)

      steerCur += (st - steerCur) * Math.min(1, dt * 7);
      const turn = steerCur * 1.3 * Math.min(1, Math.abs(speed) / 5) / (1 + Math.abs(speed) / 24);
      const prevHeading = heading;
      heading -= turn * dt * (speed >= 0 ? 1 : -1);

      // Déplacement + pente trop raide = mur
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      let nx = x + fx * speed * dt, nz = z + fz * speed * dt;
      const dist = Math.hypot(nx - x, nz - z);
      if (dist > 1e-4) {
        const dh = groundH(nx + fx * 2.2, nz + fz * 2.2) - groundH(x + fx * 2.2, z + fz * 2.2);
        if (Math.abs(dh) / dist > 1.5 && dh > 0) {
          speed *= -0.15;
          nx = x; nz = z;
        }
      }

      const res = collideBody(nx, nz, heading);
      nx = res.x; nz = res.z;
      if (res.pushed > 0.04) speed *= 0.55;

      x = clamp(nx, bounds.x0, bounds.x1);
      z = clamp(nz, bounds.z0, bounds.z1);

      place(dt, false);

      wheelRot += speed * dt / 0.48;
      wheels.forEach(function (w) {
        w.g.rotation.x = wheelRot;
        w.g.rotation.y = w.front ? -steerCur * 0.5 : 0;
      });

      // Caméra : siège conducteur
      const eye = SEAT.clone().applyEuler(g.rotation).add(g.position);
      camera.position.set(origin.x + eye.x, origin.y + eye.y, origin.z + eye.z);
      if (o.view) {
        const v = o.view.get();
        o.view.set(v.yaw + (heading - prevHeading), v.pitch);
      }
      if (o.snow) o.snow.setBaseY(origin.y + bodyY);
    }

    // ==========================================
    // UPDATE
    // ==========================================
    // active = le joueur est dans la rue (sinon on n'affiche pas le bouton ENTER)

    function update(dt, active) {
      gauge.update(dt, driving);
      saveFuel(dt);
      if (driving) {
        drive(dt);
        return;
      }
      if (!active) { hideAction(); return; }
      const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
      const d = Math.hypot(px - x, pz - z);
      if (d < 4.6) showEnter();
      else hideAction();
    }

    return {
      group: g,
      cargo: cargo,
      tank: tank,                                                   // lu par la station-service (places/gasstation.js)
      fuelPort: fuelPort,
      refuel: function (l) { return tank.add(l); },
      isDriving: function () { return driving; },
      enter: enter,
      exit: exit,
      update: update,
      getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; }
    };
  }
  return { createTruck };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE TAXI (ancien taxi.js) — id « taxi », propriétaire : Oliver
// ═══════════════════════════════════════════════════════════════════════════
const _taxi = (function () {
  // ==========================================
  // BAD THERAPIST — LE TAXI D'OLIVER (taxi.js)
  // ==========================================
  // Un taxi garé près du camion, sous l'immeuble. Oliver (Mixamo) est au volant :
  //   - voiture à l'arrêt  -> animation « sit »   (Sitting.fbx)
  //   - voiture qui roule  -> animation « drive » (Driving.fbx)
  //
  // Trajet :
  //   ENTER près du taxi -> une carte s'ouvre, tu choisis où aller (icônes, pas de noms).
  //   Oliver roule jusqu'à l'endroit choisi par les routes, s'arrête, et le taxi RESTE LÀ.
  //   Tu descends (EXIT) ; tant que tu ne remontes pas dedans (ENTER), il ne bouge pas.
  //
  // Repère : comme le camion (vehicle.js). Avant du taxi = -z local ; cap h -> direction (-sin h, -cos h).
  //
  // Fichiers attendus (à côté de world_base.html) :
  //   avatars/oliver/oliver.fbx, Sitting.fbx, Driving.fbx, texture_diffuse.png, texture_normal.png,
  //   texture_roughness.png, texture_metallic.png

  // ==========================================
  // RÉGLAGES
  // ==========================================

  const AVATAR_DIR = 'avatars/oliver/';
  const AVATAR_HEIGHT = 1.78;                 // taille debout d'Oliver (m)

  // Place d'Oliver dans le taxi (repère du taxi). y = hauteur de ses pieds (le plancher est à 0.40).
  // yaw = PI : Mixamo regarde vers +z, le taxi roule vers -z.
  // Si Oliver flotte / s'enfonce dans le siège : change DRIVER.y. Réglage en direct dans la console (F12) :
  //   BadTherapistTaxi.driver(x, y, z, yawEnDegres)
  const DRIVER = { x: -0.5, y: 0.40, z: -0.25, yaw: Math.PI };
  // Volant (repère du taxi). Réglage en direct : BadTherapistTaxi.wheel(x, y, z)
  const WHEEL = { x: -0.5, y: 1.12, z: -0.55 };

  const VMAX = 48;          // m/s (~170 km/h) en ligne droite
  const ACC = 20;           // accélération (m/s²)
  const BRK = 30;           // freinage (m/s²)
  const ALAT = 14;          // accélération latérale max : il ralentit dans les virages serrés
  const LANE = 2.2;         // décalage de la voie par rapport à l'axe de la route
  const STOP_BEFORE_END = 8;   // il s'arrête 8 m avant le bout de la route (devant la maison)
  const BOARD_RANGE = 6;       // distance pour voir le bouton ENTER
  const AUTO_EXIT = false;     // true : le joueur descend tout seul à l'arrivée (sinon bouton EXIT)

  const HOME_PARK = { x: -LANE, z: -11 };    // près du camion (camion en x 3.8, z -9.5) ; le taxi regarde vers la route (+z)

  function createTaxi(parent, o) {

    // freeDriver = true : Oliver n'est plus chargé ici, c'est un avatar libre (engine/avatar-brain.js) qui s'assoit au volant quand il le veut
    const FREE_DRIVER = !!o.freeDriver;

    const origin = o.origin || { x: 0, y: 0, z: 0 };
    const camera = o.camera;
    const groundH = o.groundH;
    const rects = o.rects || [];
    const road = o.road;                       // { samples:[{x,z,s,tx,tz}], len }

    // ==========================================
    // MODÈLE (taxi jaune, vitres transparentes : on voit Oliver)
    // ==========================================

    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    parent.add(g);

    const M = {
      body: new THREE.MeshStandardMaterial({ color: 0xe2b420, roughness: 0.5, metalness: 0.3, emissive: 0x2c2204 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false
      }),
      light: new THREE.MeshBasicMaterial({ color: 0xffe9c0 }),
      tail: new THREE.MeshBasicMaterial({ color: 0xff3a1e }),
      snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
    };

    function box(w, h, d, mat, x, y, z, par) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      (par || g).add(m);
      return m;
    }

    const FLOOR = 0.40, SEAT_TOP = 0.80, BELT = 0.95, ROOF = 1.88;
    const CAB_Z0 = -1.05, CAB_Z1 = 1.55, CAB_C = 0.25, CAB_L = 2.6;

    // Caisse : dessous, plancher, portières, capot, coffre, pare-chocs
    box(1.8, 0.2, 4.5, M.dark, 0, 0.3, 0);
    box(1.86, 0.08, CAB_L, M.dark, 0, FLOOR - 0.04, CAB_C);
    box(0.07, BELT - 0.3, CAB_L, M.body, -0.915, (BELT + 0.3) / 2, CAB_C);
    box(0.07, BELT - 0.3, CAB_L, M.body, 0.915, (BELT + 0.3) / 2, CAB_C);
    box(1.9, BELT - 0.3, 1.25, M.body, 0, (BELT + 0.3) / 2, -1.675);     // capot
    box(1.9, BELT - 0.3, 0.75, M.body, 0, (BELT + 0.3) / 2, 1.925);      // coffre
    box(1.7, 0.05, 1.1, M.snow, 0, BELT + 0.025, -1.675);
    box(1.95, 0.2, 0.2, M.metal, 0, 0.42, -2.33);
    box(1.95, 0.2, 0.2, M.metal, 0, 0.42, 2.33);
    box(0.3, 0.16, 0.06, M.light, -0.65, 0.78, -2.3);
    box(0.3, 0.16, 0.06, M.light, 0.65, 0.78, -2.3);
    box(0.3, 0.14, 0.05, M.tail, -0.7, 0.8, 2.3);
    box(0.3, 0.14, 0.05, M.tail, 0.7, 0.8, 2.3);

    // Cabine : montants, toit, vitres
    const pillarH = ROOF - BELT;
    [[-0.9, CAB_Z0], [0.9, CAB_Z0], [-0.915, CAB_C], [0.915, CAB_C], [-0.9, CAB_Z1], [0.9, CAB_Z1]].forEach(function (p) {
      box(0.07, pillarH, 0.07, M.body, p[0], (BELT + ROOF) / 2, p[1]);
    });
    box(1.98, 0.08, CAB_L + 0.12, M.body, 0, ROOF + 0.04, CAB_C);
    box(1.86, 0.05, CAB_L, M.snow, 0, ROOF + 0.1, CAB_C);

    const gh = pillarH - 0.04;
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
    ws.position.set(0, (BELT + ROOF) / 2, CAB_Z0);
    g.add(ws);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
    rw.position.set(0, (BELT + ROOF) / 2, CAB_Z1);
    g.add(rw);
    [-0.9, 0.9].forEach(function (x) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(CAB_L, gh), M.glass);
      sw.rotation.y = Math.PI / 2;
      sw.position.set(x, (BELT + ROOF) / 2, CAB_C);
      g.add(sw);
    });

    // Enseigne « TAXI » sur le toit (lisible de l'avant et de l'arrière)
    (function () {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 80;
      const k = c.getContext('2d');
      k.fillStyle = '#f4ecc8'; k.fillRect(0, 0, 256, 80);
      k.fillStyle = '#111'; k.font = 'bold 58px Arial, sans-serif';
      k.textAlign = 'center'; k.textBaseline = 'middle';
      k.fillText('TAXI', 128, 44);
      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const sy = ROOF + 0.2;
      box(0.72, 0.2, 0.24, M.dark, 0, sy, CAB_C);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.18), mat);
      front.position.set(0, sy, CAB_C - 0.121);
      front.rotation.y = Math.PI;
      g.add(front);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.18), mat);
      back.position.set(0, sy, CAB_C + 0.121);
      g.add(back);
    })();

    // Intérieur : tableau de bord, volant, sièges
    box(1.8, 0.22, 0.4, M.dark, 0, 1.02, CAB_Z0 + 0.25);
    const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
    wheelSteer.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    wheelSteer.rotation.x = -0.95;
    g.add(wheelSteer);

    // Réservoir + jauge d'essence sur le tableau de bord (côté conducteur)
    const tank = createTank({ type: 'taxi' });
    const fuelPort = { x: 0.95, y: 0.7, z: 1.3 };
    const gauge = createFuelGauge(g, tank, { x: WHEEL.x, y: 1.135, z: CAB_Z0 + 0.27, tilt: -0.9, w: 0.2 });
    function seat(x, z) {
      box(0.4, SEAT_TOP - 0.14 - FLOOR, 0.4, M.dark, x, (FLOOR + SEAT_TOP - 0.14) / 2, z);
      box(0.55, 0.14, 0.55, M.seat, x, SEAT_TOP - 0.07, z);
      box(0.55, 0.62, 0.1, M.seat, x, SEAT_TOP + 0.31, z + 0.28);
    }
    seat(-0.5, 0.0);                   // conducteur
    seat(0.5, 0.0);                    // passager avant
    box(1.5, 0.14, 0.55, M.seat, 0, SEAT_TOP - 0.07, 1.0);          // banquette arrière
    box(1.5, 0.62, 0.1, M.seat, 0, SEAT_TOP + 0.31, 1.28);

    // Roues
    const wheels = [];
    [[-0.97, -1.5, true], [0.97, -1.5, true], [-0.97, 1.5, false], [0.97, 1.5, false]].forEach(function (w) {
      const wg = new THREE.Group();
      wg.rotation.order = 'YXZ';
      wg.position.set(w[0], 0.36, w[1]);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), M.rubber);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), M.metal);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      g.add(wg);
      wheels.push({ g: wg, front: w[2] });
    });

    // Phares : une seule vraie lumière partagée avec le camion (o.headlight), prise en montant dans le taxi
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.3, -24);
    g.add(spotTarget);
    function mountHeadlight() {
      const h = o.headlight;
      if (!h) return;
      h.position.set(0, 0.9, -2.2);
      g.add(h);
      h.target = spotTarget;
      h.intensity = 4.0;
    }
    function dimHeadlight() {
      if (o.headlight && o.headlight.parent === g) o.headlight.intensity = 0;
    }

    // ==========================================
    // OLIVER (chargé en arrière-plan)
    // ==========================================

    const driverSlot = new THREE.Group();
    driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
    driverSlot.rotation.y = DRIVER.yaw;
    g.add(driverSlot);

    let ev = null;

    function loadOliver() {
      const d = AVATAR_DIR;
      loadMixamoAvatar({
        model: d + 'oliver.fbx',
        textures: {
          map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png',
          roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png'
        },
        animations: { sit: d + 'Sitting.fbx', drive: d + 'Driving.fbx' },
        height: AVATAR_HEIGHT
      }).then(function (a) {
        ev = a;
        driverSlot.add(a.root);
        a.play(a.actions.sit ? 'sit' : 'default');
        a.update(0.001);
        warmUp(a.root);
        console.log('[taxi] Oliver chargé. Animations :', Object.keys(a.actions));
      }).catch(function (e) {
        console.warn('[taxi] Oliver n\'a pas pu être chargé :', e && e.message ? e.message : e);
      }).then(function () {
        if (window.BTLoad) window.BTLoad.release('oliver');
      });
    }

    // Envoie textures et shaders au GPU tout de suite (sinon petite saccade à la première apparition d'Oliver)
    function warmUp(root) {
      const r = o.renderer;
      if (!r) return;
      try {
        root.traverse(function (m) {
          const mat = m.material;
          if (!mat) return;
          [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].forEach(function (tx) {
            if (tx && r.initTexture) r.initTexture(tx);
          });
        });
        let rt = parent;
        while (rt.parent) rt = rt.parent;           // la vraie scène (c'est elle qui contient toutes les lumières)
        r.compile(rt, camera);
      } catch (e) { /* sans importance */ }
    }

    if (!FREE_DRIVER) {
      if (window.BTLoad) window.BTLoad.hold('oliver');     // l'écran de chargement attend Oliver
      loadOliver();
    }

    window.BadTherapistTaxi = {
      group: g,
      slot: driverSlot,
      driver: function (x, y, z, yawDeg) {
        driverSlot.position.set(x, y, z);
        if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
        console.log('[taxi] DRIVER = { x:', x, ', y:', y, ', z:', z, ', yaw:', driverSlot.rotation.y, '}');
      },
      wheel: function (x, y, z) {
        wheelSteer.position.set(x, y, z);
        console.log('[taxi] WHEEL = { x:', x, ', y:', y, ', z:', z, '}');
      },
      ev: function () { return ev; }
    };

    // ==========================================
    // TRAJETS (suivent la route de immeuble.js)
    // ==========================================

    function arc(cx, cz, R, a0, a1, n) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        out.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
      }
      return out;
    }

    // ----- Réseau routier : toutes les routes de immeuble.js reliées entre elles (jonctions) -----
    const allRoads = (o.roads || [road]).filter(function (r) { return r.kind !== 'rail'; });
    const stops = o.stops || [];
    const nodes = [], adj = [];
    const base = {};
    allRoads.forEach(function (r) {
      base[r.name] = nodes.length;
      r.samples.forEach(function (p, i) { nodes.push({ x: p.x, z: p.z, road: r.name, i: i }); adj.push([]); });
    });
    allRoads.forEach(function (r) {
      for (let i = 0; i < r.samples.length - 1; i++) {
        const a = base[r.name] + i, b = a + 1;
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
        adj[a].push({ to: b, c: d }); adj[b].push({ to: a, c: d });
      }
    });
    (function () {                                  // jonctions : points de routes différentes à moins de 6,5 m
      const cell = 8, grid = new Map();
      nodes.forEach(function (n, id) {
        const k = Math.floor(n.x / cell) + ',' + Math.floor(n.z / cell);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(id);
      });
      nodes.forEach(function (n, id) {
        const cx = Math.floor(n.x / cell), cz = Math.floor(n.z / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const arr = grid.get((cx + a) + ',' + (cz + b));
          if (!arr) continue;
          arr.forEach(function (j) {
            if (j <= id || nodes[j].road === n.road) return;
            const d = Math.hypot(nodes[j].x - n.x, nodes[j].z - n.z);
            if (d < 6.5) { adj[id].push({ to: j, c: d + 25 }); adj[j].push({ to: id, c: d + 25 }); }
          });
        }
      });
    })();

    function nearestNode(px, pz) {
      let b = -1, bd = 1e18;
      for (let i = 0; i < nodes.length; i++) {
        const d = (nodes[i].x - px) * (nodes[i].x - px) + (nodes[i].z - pz) * (nodes[i].z - pz);
        if (d < bd) { bd = d; b = i; }
      }
      return bd < 40 * 40 ? b : -1;
    }

    function dijkstra(src, dst) {
      const n = nodes.length, dist = new Float64Array(n).fill(1e18), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      dist[src] = 0;
      for (let it = 0; it < n; it++) {
        let u = -1, bd = 1e18;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
        if (u < 0 || u === dst) break;
        done[u] = 1;
        adj[u].forEach(function (e) { if (dist[u] + e.c < dist[e.to]) { dist[e.to] = dist[u] + e.c; prev[e.to] = u; } });
      }
      if (prev[dst] < 0 && src !== dst) return null;
      const out = [];
      for (let v = dst; v >= 0; v = prev[v]) out.push(v);
      return out.reverse();
    }

    // Itinéraire depuis la position actuelle du taxi (où qu'il soit garé) jusqu'à une destination
    function routeTo(stop) {
      const src = nearestNode(x, z);
      const dst = base[stop.road] + stop.idx;
      if (src < 0) return null;
      const ids = dijkstra(src, dst);
      if (!ids) return null;
      // positions de l'axe, espacées d'au moins 3,5 m
      const c = [];
      ids.forEach(function (id, k) {
        const n = nodes[id];
        if (!c.length || k === ids.length - 1 || Math.hypot(n.x - c[c.length - 1][0], n.z - c[c.length - 1][1]) >= 3.5) c.push([n.x, n.z]);
      });
      if (c.length < 2) return null;
      // voie de droite (sens de la marche)
      const lane = c.map(function (q, i) {
        const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        return [q[0] - LANE * dz, q[1] + LANE * dx, dx, dz];
      });
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const pts = [[x, z]];
      let cur = [x, z], cf = [fx, fz];
      // demi-tour si la route part dans l'autre sens
      if (lane[0][2] * fx + lane[0][3] * fz < -0.2 || (lane.length > 2 && lane[1][2] * fx + lane[1][3] * fz < -0.2)) {
        const R = 2.4, rx = Math.cos(heading), rz = -Math.sin(heading);
        for (let i = 1; i <= 8; i++) {
          const t = Math.PI * i / 8;
          pts.push([x + fx * R * Math.sin(t) - rx * R * (1 - Math.cos(t)), z + fz * R * Math.sin(t) - rz * R * (1 - Math.cos(t))]);
        }
        cur = pts[pts.length - 1]; cf = [-fx, -fz];
      }
      // on saute les points de route qui sont derrière le taxi
      let k0 = 0;
      while (k0 < lane.length - 2 && (lane[k0][0] - cur[0]) * cf[0] + (lane[k0][1] - cur[1]) * cf[1] < 3) k0++;
      for (let k = k0; k < lane.length; k++) pts.push([lane[k][0], lane[k][1]]);
      return pts;
    }

    function makePath(pts) {
      const curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], 0, p[1]); }), false, 'centripetal');
      curve.arcLengthDivisions = 4000;
      const total = curve.getLength();
      const raw = curve.getSpacedPoints(Math.max(8, Math.round(total / 2)));
      const m = raw.length;
      const X = new Array(m), Z = new Array(m), S = new Array(m), H = new Array(m), K = new Array(m), V = new Array(m);
      for (let i = 0; i < m; i++) {
        X[i] = raw[i].x; Z[i] = raw[i].z;
        S[i] = i ? S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]) : 0;
      }
      for (let i = 0; i < m; i++) {
        const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
        const h = Math.atan2(-(X[b] - X[a]), -(Z[b] - Z[a]));
        if (i === 0) H[0] = h;
        else {
          let d = h - H[i - 1];
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          H[i] = H[i - 1] + d;
        }
      }
      // Courbure -> vitesse maximale (virages) puis rampes d'accélération / de freinage
      for (let i = 0; i < m; i++) {
        const a = Math.max(0, i - 3), b = Math.min(m - 1, i + 3);
        const kappa = Math.abs(H[b] - H[a]) / Math.max(1e-3, S[b] - S[a]);
        K[i] = kappa;
        V[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(kappa, 1e-3)));
      }
      V[0] = Math.min(V[0], 1.5);
      V[m - 1] = Math.min(V[m - 1], 0.5);
      for (let i = 1; i < m; i++) V[i] = Math.min(V[i], Math.sqrt(V[i - 1] * V[i - 1] + 2 * ACC * (S[i] - S[i - 1])));
      for (let i = m - 2; i >= 0; i--) V[i] = Math.min(V[i], Math.sqrt(V[i + 1] * V[i + 1] + 2 * BRK * (S[i + 1] - S[i])));
      return { X: X, Z: Z, S: S, H: H, V: V, m: m, len: S[m - 1] };
    }

    function sampleAt(P, s) {
      let lo = 0, hi = P.m - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (P.S[mid] <= s) lo = mid; else hi = mid;
      }
      const d = Math.max(1e-6, P.S[hi] - P.S[lo]);
      const t = Math.min(1, Math.max(0, (s - P.S[lo]) / d));
      return {
        x: P.X[lo] + (P.X[hi] - P.X[lo]) * t,
        z: P.Z[lo] + (P.Z[hi] - P.Z[lo]) * t,
        h: P.H[lo] + (P.H[hi] - P.H[lo]) * t,
        v: P.V[lo] + (P.V[hi] - P.V[lo]) * t,
        turn: (P.H[hi] - P.H[lo]) / d
      };
    }

    // ==========================================
    // ÉTAT
    // ==========================================

    let mode = 'parked';                   // 'parked' | 'choosing' (carte ouverte) | 'driving' | 'arrived' (le joueur est dedans, voiture arrêtée)
    let riding = false;
    let P = null, s = 0;
    let x = HOME_PARK.x, z = HOME_PARK.z, heading = Math.PI;
    let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steer = 0;
    let owned = false, actionShown = false, arrivedT = 0, cool = 0;
    let auto = false;                       // true : le taxi roule tout seul (conduit par son avatar), sans le joueur
    let driverIn = !FREE_DRIVER;            // un conducteur est au volant (sinon pas de bouton ENTER)
    const SEAT = new THREE.Vector3(0.5, SEAT_TOP + 0.72, 0.95);        // le joueur : banquette arrière, côté droit

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function place(dt, snap) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const hF = groundH(x + fx * 2.2, z + fz * 2.2);
      const hR = groundH(x - fx * 2.2, z - fz * 2.2);
      const hRt = groundH(x + rx * 1.0, z + rz * 1.0);
      const hL = groundH(x - rx * 1.0, z - rz * 1.0);
      const ty = (hF + hR + hRt + hL) / 4;
      const tp = Math.atan2(hF - hR, 4.4);
      const tr = Math.atan2(hRt - hL, 2.0);
      const k = snap ? 1 : Math.min(1, dt * 9);
      bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 14);
      pitch += (tp - pitch) * k;
      roll += (tr - roll) * k;
      g.position.set(x, bodyY, z);
      g.rotation.set(pitch, heading, roll);
    }
    place(0, true);

    // ==========================================
    // ACTION (bouton ENTER / EXIT partagé avec le camion)
    // ==========================================

    function showAction(label, fn) {
      if (o.action) { o.action.show(label, fn); actionShown = true; }
    }
    function hideAction() {
      if (o.action && actionShown) { o.action.hide(); actionShown = false; }
    }

    // ==========================================
    // ENTRER / SORTIR
    // ==========================================

    // (Le menu de destination — la carte avec les icônes — est le travail d'Oliver : npcs/oliver.js, createRideMenu. Il est branché par outside.js : o.rideMenu.)

    function hereStop() {
      let best = null, bd = 30;
      stops.forEach(function (st) { const d = Math.hypot(st.x - x, st.z - z); if (d < bd) { bd = d; best = st; } });
      return best;
    }

    function openMenu() {
      if (!o.rideMenu) return;                       // pas de menu branché : pas de course
      mode = 'choosing';
      hideAction();
      if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) { /* rien */ } }
      o.rideMenu.open({ x: x, z: z, onChoose: requestRide, onClose: closeMenu });
    }
    function closeMenu() {
      if (o.rideMenu) o.rideMenu.hide();
      if (mode === 'choosing') mode = 'parked';
      cool = 0.8;
    }
    function pick(stop, isAuto) {
      const pts = routeTo(stop);
      if (o.rideMenu) o.rideMenu.hide();
      if (!pts) { mode = 'parked'; cool = 0.8; return false; }
      P = makePath(pts);
      s = 0;
      auto = !!isAuto;
      riding = !auto;
      mode = 'driving';
      owned = false;
      heading = P.H[0];
      speed = 0;
      if (!auto && o.view) o.view.set(heading, 0);
      mountHeadlight();
      hideAction();
      if (!auto && o.action) o.action.hide();
      return true;
    }

    // Le joueur a choisi une destination : le taxi démarre TOUT DE SUITE (Oliver est un PNJ scripté, il ne se fait pas attendre).
    // o.onRideRequest(stop, finish) prévient seulement la société ; sa réponse (même tardive) ne change plus rien.
    function requestRide(stop) {
      if (o.rideMenu) o.rideMenu.hide();
      hideAction();
      pick(stop, false);
      if (o.onRideRequest) { try { o.onRideRequest(stop, function () { /* la course est déjà partie */ }); } catch (e) { /* rien */ } }
    }

    function enter() {
      if (mode !== 'parked') return;
      if (!stops.length || !driverIn) return;
      openMenu();
    }

    function insideRect(px, pz) {
      for (let i = 0; i < rects.length; i++) {
        const c = rects[i];
        if (px > c.x0 - 0.5 && px < c.x1 + 0.5 && pz > c.z0 - 0.5 && pz < c.z1 + 0.5) return true;
      }
      return false;
    }

    function exit() {
      if (mode !== 'arrived') return;
      mode = 'parked';
      riding = false;
      speed = 0;
      cool = 2.5;                          // pas de ré-embarquement accidentel juste après être descendu
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const cands = [[2.6, 0.9], [-2.6, 0.9], [2.6, -2.2], [-2.6, -2.2], [0, -4.6]];
      let best = null;
      for (let i = 0; i < cands.length && !best; i++) {
        const px = x + rx * cands[i][0] + fx * cands[i][1];
        const pz = z + rz * cands[i][0] + fz * cands[i][1];
        if (!insideRect(px, pz)) best = [px, pz];
      }
      if (!best) best = [x + rx * 2.6, z + rz * 2.6];
      camera.position.x = origin.x + best[0];
      camera.position.z = origin.z + best[1];
      if (o.onExit) o.onExit(best[0], best[1]);
      hideAction();
      if (o.action) o.action.hide();
    }

    // ==========================================
    // UPDATE
    // ==========================================
    // active = le joueur est dans la rue (sinon pas de bouton ENTER)

    function animate(dt) {
      if (!ev) return;
      const far = Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) > 140;
      if (ev.root.visible === far) ev.root.visible = !far;          // un personnage animé caché ne coûte rien
      if (far) return;
      ev.play(mode === 'driving' && speed > 0.5 ? 'drive' : 'sit');
      ev.update(dt);
    }

    function drive(dt) {
      const q0 = sampleAt(P, s);
      s += q0.v * dt;
      tank.consume(Math.abs(q0.v) * dt);     // (pour l'instant le taxi continue même à sec : la panne + le détour par la station viendront avec gasstation.js)
      let arrived = false;
      if (s >= P.len - 0.12) { s = P.len; arrived = true; }
      const q = sampleAt(P, s);
      const prevHeading = heading;
      x = q.x; z = q.z; heading = q.h;
      speed = arrived ? 0 : q.v;
      place(dt, false);

      steer += (clamp(q.turn * 2.7, -0.5, 0.5) - steer) * Math.min(1, dt * 10);
      wheelRot += speed * dt / 0.36;
      wheels.forEach(function (w) {
        w.g.rotation.x = wheelRot;
        w.g.rotation.y = w.front ? steer : 0;
      });

      // Caméra : banquette arrière (le joueur peut regarder autour de lui) — seulement s'il est à bord
      if (!auto) {
        const eye = SEAT.clone().applyEuler(g.rotation).add(g.position);
        camera.position.set(origin.x + eye.x, origin.y + eye.y, origin.z + eye.z);
        if (o.view) {
          const v = o.view.get();
          o.view.set(v.yaw + (heading - prevHeading), v.pitch);
        }
        if (o.snow) o.snow.setBaseY(origin.y + bodyY);
      }

      if (arrived) {
        dimHeadlight();
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        if (auto) {                                    // le conducteur est arrivé seul : le taxi reste garé là
          auto = false;
          mode = 'parked';
          cool = 1;
          if (o.onArrive) o.onArrive({ x: x, z: z });
        } else {
          mode = 'arrived';
          arrivedT = 0;
        }
      }
    }

    function step(dt, active) {
      gauge.update(dt, false);

      if (mode === 'driving') {
        drive(dt);
        animate(dt);
        return;
      }

      animate(dt);

      if (mode === 'choosing' || mode === 'asking') return;

      if (mode === 'arrived') {
        arrivedT += dt;
        if (AUTO_EXIT && arrivedT > 0.6) { exit(); return; }
        if (!o.action && arrivedT > 1.2) { exit(); return; }
        showAction('EXIT', exit);
        return;
      }

      if (cool > 0) { cool -= dt; hideAction(); return; }

      // Garé : bouton ENTER si le joueur est à côté (le camion garde la priorité s'il est plus près)
      const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
      const dT = Math.hypot(px - x, pz - z);
      const tr = o.truck;
      const truckBusy = !!(tr && tr.isDriving());
      let dTr = 1e9;
      if (tr) { const tp = tr.getPose(); dTr = Math.hypot(px - tp.x, pz - tp.z); }
      const wins = active && driverIn && !truckBusy && dT < BOARD_RANGE && dT <= dTr;
      if (wins) {
        showAction('ENTER', enter);
        owned = true;
      } else if (owned) {
        owned = false;
        if (active && !truckBusy && tr && dTr < 4.6) { if (o.action) o.action.show('ENTER', tr.enter); }
        else hideAction();
      }
    }

    // Le taxi se met à jour tout seul à chaque image (même si le monde hôte, ex. bedroom.js, ne l'appelle pas).
    // Si l'hôte l'appelle aussi, le deuxième appel de la même image est ignoré.
    let lastTick = 0;
    function tick(active) {
      const now = performance.now();
      if (lastTick && now - lastTick < 3) return;
      const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
      lastTick = now;
      step(dt, active);
    }
    (function loop() { tick(true); requestAnimationFrame(loop); })();

    return {
      group: g,
      tank: tank,
      fuelPort: fuelPort,
      refuel: function (l) { return tank.add(l); },
      isRiding: function () { return riding; },
      enter: enter,
      exit: exit,
      update: function (dt, active) { tick(active !== false); },
      // Aller directement à une destination (id de layout.js : 'home', 'work', 'town', 'gas', 'station', 'port')
      goTo: function (id) {
        const st = stops.filter(function (q) { return q.id === id; })[0];
        if (st && (mode === 'parked' || mode === 'choosing')) pick(st);
      },
      getMode: function () { return mode; },
      getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },

      // ----- pour un conducteur libre (avatar-brain.js : def.vehicle = taxi) -----
      slot: driverSlot,                                              // groupe où s'assoit l'avatar
      isMoving: function () { return mode === 'driving'; },
      isRiding: function () { return riding; },
      setDriverPresent: function (v) { driverIn = !!v; },
      // rouler seul jusqu'à l'arrêt le plus proche de (px, pz) ; renvoie false si impossible
      driveTo: function (px, pz) {
        if (mode !== 'parked' || !stops.length) return false;
        let best = null, bd = 1e18;
        stops.forEach(function (st) { const d = Math.hypot(st.x - px, st.z - pz); if (d < bd) { bd = d; best = st; } });
        if (!best) return false;
        const here = hereStop();
        if (here && here.id === best.id) return false;
        return pick(best, true);
      },
      // un endroit libre à côté de la portière, pour que le conducteur descende
      doorSpot: function () {
        const rx = Math.cos(heading), rz = -Math.sin(heading);
        const fx = -Math.sin(heading), fz = -Math.cos(heading);
        const cands = [[2.6, 0.9], [-2.6, 0.9], [2.6, -2.2], [-2.6, -2.2], [0, -4.6]];
        for (let i = 0; i < cands.length; i++) {
          const px = x + rx * cands[i][0] + fx * cands[i][1];
          const pz = z + rz * cands[i][0] + fz * cands[i][1];
          if (!insideRect(px, pz)) return [px, pz];
        }
        return [x + rx * 2.6, z + rz * 2.6];
      }
    };
  }
  return { createTaxi };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE BUS (ancien bus.js) — id « bus », propriétaire : Violet
// ═══════════════════════════════════════════════════════════════════════════
const _bus = (function () {
  // ==========================================
  // BAD THERAPIST — LE BUS (objects/bus.js)
  // ==========================================
  // Un bus urbain moderne, conduit par l'avatar Violet (engine/bus-line.js lui donne sa ligne et son cerveau).
  //   • plancher bas, grandes vitres teintées, intérieur éclairé (sièges, barres jaunes, écran du conducteur) ;
  //   • PORTES AUTOMATIQUES (avant et milieu) : carillon, elles s'ouvrent en coulissant, le bus « s'agenouille » un peu ;
  //   • afficheurs à points orange (numéro de ligne + prochain arrêt) devant, sur le côté et derrière ;
  //   • clignotants, feux stop, feu de recul + bip de recul, phares, éclairage de plancher qui rayonne dans la neige ;
  //   • conduite automatique sur le réseau de routes (roadnet.js) : ralentit dans les virages, S'ARRÊTE AUX FEUX ROUGES
  //     (options.signals) et devant un obstacle (options.obstacles : taxi, camion, toi à pied) ;
  //   • demi-tour en trois manœuvres (marche arrière comprise) aux terminus ;
  //   • tu peux monter (bouton ENTER, portes ouvertes) et descendre (EXIT) à chaque arrêt ;
  //   • on ENTRE ET ON SORT À PIED par les portes ouvertes (aucun bouton) ; dans le bus on marche librement dans l'allée,
  //     on CLIQUE SUR UN SIÈGE pour s'y asseoir (même si on est déjà assis ailleurs : on se lève et on y va),
  //     on CLIQUE SUR LE SOL pour se lever à cet endroit, ou on bouge (ZQSD / WASD / flèches) pour se relever ; aucun message à l'écran ;
  //     de vrais caissons de passage de roue à l'intérieur (comme dans un vrai bus), l'essieu avant est derrière la porte avant ;
  //   • le bus est SOLIDE : le joueur, les avatars et le camion le contournent (bus.collide), sauf par les portes ouvertes ;
  //   • détails de vrai bus : sifflement pneumatique des portes et du frein, essuie-glaces, afficheur « prochain arrêt » dans l'allée,
  //     lumière qui coule sur la neige devant les portes quand elles s'ouvrent.
  //
  // Repère : comme taxi.js / vehicle.js. Avant du bus = -z local ; cap h -> avant (-sin h, -cos h), droite (cos h, -sin h).
  // Le conducteur est à GAUCHE, les portes à DROITE (on roule à droite).
  // Repère « bus » du joueur : x vers la droite, z vers l'arrière (l'avant du bus est -z).
  //
  // Réglage en direct (F12) : BadTherapistBus.driver(x, y, z, yawEnDegres)

  const L = 11.6, W = 2.55, FLOOR = 0.36;
  const DRIVER = { x: -0.88, y: FLOOR, z: -4.25, yaw: Math.PI };       // pieds du conducteur (repère du bus)
  const WHEEL = { x: -0.88, y: 1.12, z: -4.62 };
  const DOOR_Z = [-4.3, 0.0];                                           // centres des deux portes (côté droit)
  let ACC = 3.2;                                                        // accélération (réglable : bus.setAcc / BadTherapistBusLine.cfg.acc)
  const BRK_E = 6.5;                                                    // freinage d'urgence (feu rouge, obstacle)
  const DOOR_TIME = 1.7;                                                // secondes pour ouvrir / fermer

  function ss(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function createBus(parent, o) {

    const origin = o.origin || { x: 0, y: 0, z: 0 };
    const camera = o.camera;
    const groundH = o.groundH || function () { return 0; };
    const net = o.net;                                  // roadnet.js (pour sampleAt)

    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    parent.add(g);

    // ==========================================
    // MATÉRIAUX
    // ==========================================
    const M = {
      body: new THREE.MeshStandardMaterial({ color: 0xe6eaec, roughness: 0.42, metalness: 0.25, emissive: 0x15181a }),
      accent: new THREE.MeshStandardMaterial({ color: 0x0f9fa6, roughness: 0.4, metalness: 0.3, emissive: 0x04282a }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.75, metalness: 0.35 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xd9dee1, roughness: 0.5, metalness: 0.3, emissive: 0x121517 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.4, metalness: 0.75 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 1 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.9 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x1b6f78, roughness: 0.95 }),
      seatB: new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.9 }),
      pole: new THREE.MeshStandardMaterial({ color: 0xf0c000, roughness: 0.45, metalness: 0.4, emissive: 0x2a2000 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x25343e, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
      glassLight: new THREE.MeshStandardMaterial({ color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1d6 }),
      inner: new THREE.MeshBasicMaterial({ color: 0xffeccc }),
      tail: new THREE.MeshBasicMaterial({ color: 0x6a1008 }),
      rev: new THREE.MeshBasicMaterial({ color: 0x3a3a3a }),
      indL: new THREE.MeshBasicMaterial({ color: 0x2a1800 }),
      indR: new THREE.MeshBasicMaterial({ color: 0x2a1800 }),
      doorLight: new THREE.MeshBasicMaterial({ color: 0x16301a }),
      screen: new THREE.MeshBasicMaterial({ color: 0x3fd1ff }),
      snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
    };

    function box(w, h, d, mat, x, y, z, par) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      (par || g).add(m);
      return m;
    }
    function cyl(r, h, mat, x, y, z, rx, rz, par) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (rz) m.rotation.z = rz;
      (par || g).add(m);
      return m;
    }
    function plane(w, h, mat, x, y, z, ry, par) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      (par || g).add(m);
      return m;
    }
    // Barre à coins arrondis (profil en X/Y, extrudée sur len le long de z)
    function roundedBar(w, h, rt, rb, len, mat, x, y, z) {
      const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2;
      s.moveTo(x0 + rb, 0); s.lineTo(x1 - rb, 0); s.quadraticCurveTo(x1, 0, x1, rb);
      s.lineTo(x1, h - rt); s.quadraticCurveTo(x1, h, x1 - rt, h);
      s.lineTo(x0 + rt, h); s.quadraticCurveTo(x0, h, x0, h - rt);
      s.lineTo(x0, rb); s.quadraticCurveTo(x0, 0, x0 + rb, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 });
      geo.translate(0, 0, -len / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }

    // ==========================================
    // CARROSSERIE
    // ==========================================
    const WIN0 = 1.04, WIN1 = 2.44, WH = WIN1 - WIN0, WY = (WIN0 + WIN1) / 2;     // bande vitrée
    const XW = W / 2 - 0.04;

    // Plancher + châssis
    box(W - 0.12, 0.1, L - 0.4, M.dark, 0, 0.3, 0);
    box(W - 0.3, 0.04, L - 1.3, M.floor, 0, FLOOR, 0.1);

    // Extrémités arrondies (calandre avant / arrière) : tout en bas jusqu'au bas des vitres
    roundedBar(W, 0.78, 0.07, 0.12, 0.7, M.body, 0, 0.27, -L / 2 + 0.35);
    roundedBar(W, 0.78, 0.07, 0.12, 0.7, M.body, 0, 0.27, L / 2 - 0.35);
    roundedBar(W + 0.02, 0.2, 0.04, 0.04, 0.72, M.accent, 0, 0.58, -L / 2 + 0.35);
    roundedBar(W + 0.02, 0.2, 0.04, 0.04, 0.72, M.accent, 0, 0.58, L / 2 - 0.35);

    // Flancs (murs fins, pour que l'intérieur soit creux et visible) — côté droit : trous pour les deux portes
    function wall(x, z0, z1) {
      const len = z1 - z0;
      box(0.08, 0.76, len, M.body, x, 0.65, (z0 + z1) / 2);
      box(0.09, 0.18, len, M.accent, x + Math.sign(x) * 0.005, 0.64, (z0 + z1) / 2);
    }
    wall(-XW, -L / 2 + 0.7, L / 2 - 0.7);
    const DW = 1.2;                                                   // largeur d'une porte
    const rZ = [[-L / 2 + 0.7, DOOR_Z[0] - DW / 2], [DOOR_Z[0] + DW / 2, DOOR_Z[1] - DW / 2], [DOOR_Z[1] + DW / 2, L / 2 - 0.7]];
    rZ.forEach(function (r) { wall(XW, r[0], r[1]); });
    // marches
    DOOR_Z.forEach(function (zc) { box(DW, 0.05, 0.5, M.metal, XW - 0.1, FLOOR - 0.01, zc); });

    // Toit arrondi + capot de toit (clim) + neige
    roundedBar(W, 0.7, 0.42, 0.02, L, M.roof, 0, WIN1, 0);
    box(1.5, 0.2, 3.4, M.dark, 0, WIN1 + 0.8, 1.7);
    box(1.0, 0.14, 1.4, M.dark, 0, WIN1 + 0.77, -2.2);
    box(1.7, 0.05, L - 0.8, M.snow, 0, WIN1 + 0.7, 0);

    // Montants + vitres : côté gauche continu ; côté droit découpé par les portes
    function glazing(x, spans) {
      spans.forEach(function (sp) {
        const z0 = sp[0], z1 = sp[1], len = z1 - z0;
        plane(len, WH, M.glass, x, WY, (z0 + z1) / 2, Math.PI / 2);
        const n = Math.max(1, Math.round(len / 1.25));
        for (let i = 0; i <= n; i++) box(0.09, WH, 0.1, M.dark, x, WY, z0 + len * i / n);
      });
    }
    glazing(-W / 2 + 0.03, [[-L / 2 + 0.75, L / 2 - 0.75]]);
    glazing(W / 2 - 0.03, [[-L / 2 + 0.75, DOOR_Z[0] - DW / 2], [DOOR_Z[0] + DW / 2, DOOR_Z[1] - DW / 2], [DOOR_Z[1] + DW / 2, L / 2 - 0.75]]);
    // linteaux au-dessus des portes + témoin vert/rouge
    const doorLights = [];
    DOOR_Z.forEach(function (zc) {
      box(DW + 0.1, 0.16, 0.14, M.dark, XW, WIN1 - 0.04, zc);
      doorLights.push(box(0.5, 0.05, 0.02, M.doorLight, XW + 0.08, WIN1 - 0.04, zc));
    });

    // Pare-brise (légèrement incliné) + vitres de coin
    const ws = plane(W - 0.3, WH + 0.04, M.glass, 0, WY, -L / 2 + 0.01);
    ws.rotation.x = -0.1;
    const wipers = [];
    [-0.65, 0.2].forEach(function (px) {
      const wg = new THREE.Group();
      wg.position.set(px, WIN0 + 0.05, -L / 2 + 0.045);
      wg.rotation.x = -0.1;                                           // même inclinaison que le pare-brise
      box(0.92, 0.025, 0.02, M.dark, 0.46, 0, 0, wg);
      g.add(wg);
      wipers.push(wg);
    });
    let wipeT = 0, wipeA = 0;
    box(0.1, WH + 0.04, 0.1, M.dark, -W / 2 + 0.15, WY, -L / 2 + 0.03);
    box(0.1, WH + 0.04, 0.1, M.dark, W / 2 - 0.15, WY, -L / 2 + 0.03);
    const rwn = plane(W - 0.4, WH - 0.35, M.glass, 0, WY + 0.1, L / 2 - 0.01);
    rwn.rotation.y = Math.PI;

    // Phares, feux de jour, clignotants, feux arrière
    [-0.9, 0.9].forEach(function (x) {
      box(0.55, 0.13, 0.06, M.lamp, x, 0.84, -L / 2 - 0.005);
      box(0.4, 0.04, 0.05, M.lamp, x * 0.9, 0.7, -L / 2 - 0.005);
    });
    box(0.3, 0.1, 0.05, M.indL, -1.12, 0.72, -L / 2 - 0.005);
    box(0.3, 0.1, 0.05, M.indR, 1.12, 0.72, -L / 2 - 0.005);
    box(0.12, 0.1, 0.3, M.indR, W / 2 + 0.005, 0.72, -L / 2 + 0.3);
    box(0.12, 0.1, 0.3, M.indL, -W / 2 - 0.005, 0.72, -L / 2 + 0.3);
    box(0.12, 0.1, 0.3, M.indR, W / 2 + 0.005, 0.72, L / 2 - 0.3);
    box(0.12, 0.1, 0.3, M.indL, -W / 2 - 0.005, 0.72, L / 2 - 0.3);
    [-1.0, 1.0].forEach(function (x) {
      box(0.4, 0.4, 0.05, M.tail, x, 0.95, L / 2 + 0.005);
      box(0.2, 0.1, 0.05, M.indL, x * 0.75, 0.62, L / 2 + 0.005);
    });
    box(0.22, 0.1, 0.05, M.rev, 0, 0.62, L / 2 + 0.005);
    box(1.3, 0.35, 0.06, M.dark, 0, 0.5, -L / 2 - 0.005);            // calandre basse
    box(W - 0.1, 0.12, 0.25, M.dark, 0, 0.3, -L / 2 + 0.05);         // pare-chocs
    box(W - 0.1, 0.12, 0.25, M.dark, 0, 0.3, L / 2 - 0.05);

    // Rétroviseurs
    [-1, 1].forEach(function (sx) {
      box(0.06, 0.4, 0.08, M.dark, sx * (W / 2 + 0.12), 2.05, -L / 2 + 0.55);
      box(0.06, 0.34, 0.2, M.dark, sx * (W / 2 + 0.2), 1.85, -L / 2 + 0.55);
    });

    // ---------- Afficheurs à points ----------
    function signTex(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      return { c: c, tex: tex };
    }
    const dots = (function () {                                          // grille de points : on « efface » le quadrillage
      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      const k = c.getContext('2d');
      k.fillStyle = '#000'; k.fillRect(0, 3, 4, 1); k.fillRect(3, 0, 1, 4);
      return c;
    })();
    const signs = [
      Object.assign(signTex(512, 72), { w: 1.9, h: 0.27, wide: true }),
      Object.assign(signTex(256, 72), { w: 0.95, h: 0.27, wide: false }),
      Object.assign(signTex(128, 72), { w: 0.5, h: 0.28, wide: false, numOnly: true }),
      Object.assign(signTex(512, 72), { w: 1.1, h: 0.16, wide: true })              // dans l'allée : prochain arrêt, face aux passagers
    ];
    function drawSign(sg, route, text) {
      const k = sg.c.getContext('2d'), W2 = sg.c.width, H2 = sg.c.height;
      k.globalCompositeOperation = 'source-over';
      k.fillStyle = '#060402'; k.fillRect(0, 0, W2, H2);
      k.fillStyle = '#ffae1a'; k.textBaseline = 'middle';
      k.font = 'bold ' + Math.round(H2 * 0.78) + 'px "Courier New", monospace';
      k.textAlign = 'left';
      k.fillText(String(route), 10, H2 / 2 + 2);
      if (!sg.numOnly) {
        k.font = 'bold ' + Math.round(H2 * 0.55) + 'px "Courier New", monospace';
        const maxW = W2 - (sg.wide ? 110 : 70);
        let t = String(text || '').toUpperCase();
        while (t.length > 3 && k.measureText(t).width > maxW) t = t.slice(0, -1);
        k.fillText(t, sg.wide ? 90 : 60, H2 / 2 + 2);
      }
      k.globalCompositeOperation = 'destination-out';
      k.fillStyle = k.createPattern(dots, 'repeat');
      k.fillRect(0, 0, W2, H2);
      k.globalCompositeOperation = 'source-over';
      sg.tex.needsUpdate = true;
    }
    signs.forEach(function (sg) { drawSign(sg, '—', ''); });
    const signMat = signs.map(function (sg) { return new THREE.MeshBasicMaterial({ map: sg.tex }); });
    plane(signs[0].w, signs[0].h, signMat[0], 0, WIN1 + 0.34, -L / 2 - 0.012, Math.PI);   // devant (sur la face du toit)
    box(signs[0].w + 0.08, signs[0].h + 0.06, 0.02, M.dark, 0, WIN1 + 0.34, -L / 2 - 0.004);
    plane(signs[1].w, signs[1].h, signMat[1], W / 2 + 0.012, WIN1 - 0.16, -3.0, Math.PI / 2);   // côté droit
    plane(signs[2].w, signs[2].h, signMat[2], 0.6, WIN1 + 0.3, L / 2 + 0.012, 0);           // derrière
    plane(signs[3].w, signs[3].h, signMat[3], 0, WIN1 - 0.34, -3.1, 0);                      // intérieur (regarde vers l'arrière du bus)
    box(signs[3].w + 0.06, signs[3].h + 0.04, 0.02, M.dark, 0, WIN1 - 0.34, -3.112);

    // ---------- Roues ----------
    const wheels = [];
    const AXLE_F = -3.0, AXLE_R = 2.85;                                // l'essieu avant est derrière la porte avant (avant : la roue était dans la cabine et le marchepied)
    [[-1.18, AXLE_F, true], [1.18, AXLE_F, true], [-1.18, AXLE_R, false], [1.18, AXLE_R, false]].forEach(function (w) {
      const wg = new THREE.Group();
      wg.rotation.order = 'YXZ';
      wg.position.set(w[0], 0.5, w[1]);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), M.rubber);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8), M.metal);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      g.add(wg);
      wheels.push({ g: wg, front: w[2] });
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), M.dark);     // passage de roue
      arch.rotation.z = Math.PI / 2;
      arch.position.set(w[0] + Math.sign(w[0]) * 0.1, 0.5, w[1]);
      g.add(arch);
    });

    // ---------- Intérieur ----------
    // plafonniers (deux bandes lumineuses) + barres
    box(0.12, 0.03, L - 1.8, M.inner, -0.55, WIN1 - 0.02, 0);
    box(0.12, 0.03, L - 1.8, M.inner, 0.55, WIN1 - 0.02, 0);
    cyl(0.022, L - 2.2, M.pole, -0.28, WIN1 - 0.22, 0, Math.PI / 2, 0);
    cyl(0.022, L - 2.2, M.pole, 0.28, WIN1 - 0.22, 0, Math.PI / 2, 0);
    // barres verticales près des portes et dans l'allée
    [[1.05, DOOR_Z[0] + 0.75], [1.05, DOOR_Z[1] - 0.75], [1.05, DOOR_Z[1] + 0.75], [-0.2, -1.6], [0.2, 2.2], [-0.2, 3.6]].forEach(function (p) {
      cyl(0.022, WIN1 - FLOOR - 0.15, M.pole, p[0], (FLOOR + WIN1) / 2 - 0.02, p[1]);
    });
    // caissons de passage de roue : à l'intérieur, la roue (1 m de diamètre) dépasse du plancher bas, comme dans un vrai bus
    const HOUSINGS = [];
    [AXLE_F, AXLE_R].forEach(function (az) {
      [-1, 1].forEach(function (sd) {
        const xa = sd * 0.78, xb = sd * (XW - 0.04);
        const hx = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: az - 0.5, z1: az + 0.5 };
        HOUSINGS.push(hx);
        box(hx.x1 - hx.x0, 1.04 - FLOOR, hx.z1 - hx.z0, M.dark, (hx.x0 + hx.x1) / 2, (FLOOR + 1.04) / 2, az);
        box(hx.x1 - hx.x0 + 0.02, 0.03, hx.z1 - hx.z0 + 0.02, M.accent, (hx.x0 + hx.x1) / 2, 1.045, az);      // liseré turquoise sur le dessus
      });
    });
    // sièges : deux par rang à gauche, deux à droite, sauf devant les portes ; pas de siège à la place d'un caisson de roue
    const SEATS = [];
    [-3.0, -2.2, -1.4, 1.2, 2.0, 2.8, 3.6, 4.4].forEach(function (zz) {
      [-0.95, -0.52].forEach(function (sx) { SEATS.push({ x: sx, z: zz }); });
      if (zz > 0.9 || zz < -1.2) [0.52, 0.95].forEach(function (sx) { SEATS.push({ x: sx, z: zz }); });
    });
    for (let i = SEATS.length - 1; i >= 0; i--) {
      const st = SEATS[i];
      if (HOUSINGS.some(function (h) { return st.x + 0.22 > h.x0 && st.x - 0.22 < h.x1 && st.z + 0.28 > h.z0 && st.z - 0.24 < h.z1; })) SEATS.splice(i, 1);
    }
    SEATS.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
    SEATS.forEach(function (st) {
      box(0.42, 0.28, 0.46, M.seatB, st.x, FLOOR + 0.2, st.z);
      box(0.42, 0.08, 0.46, M.seat, st.x, FLOOR + 0.38, st.z);
      box(0.42, 0.56, 0.08, M.seat, st.x, FLOOR + 0.7, st.z + 0.2);
    });
    // cabine du conducteur : tableau de bord, écran, volant, siège, vitre de protection
    box(1.0, 0.3, 0.5, M.dark, -0.7, 0.95, -5.1);
    box(0.4, 0.2, 0.03, M.screen, -0.7, 1.15, -4.86);
    box(0.42, 0.28, 0.46, M.seatB, DRIVER.x, FLOOR + 0.2, DRIVER.z + 0.1);
    box(0.46, 0.1, 0.5, M.seat, DRIVER.x, FLOOR + 0.4, DRIVER.z + 0.1);
    box(0.46, 0.6, 0.09, M.seat, DRIVER.x, FLOOR + 0.75, DRIVER.z + 0.36);
    plane(0.02, 1.2, M.glassLight, -0.2, 1.1, -4.4, 0).rotation.y = Math.PI / 2;
    const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.027, 6, 16), M.dark);
    wheelSteer.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    wheelSteer.rotation.x = -0.75;
    g.add(wheelSteer);

    // Réservoir + jauge d'essence sur le tableau de bord du conducteur
    const tank = createTank({ type: 'bus' });
    const fuelPort = { x: 1.3, y: 0.7, z: 2.0 };
    const gauge = createFuelGauge(g, tank, { x: -1.02, y: 1.105, z: -5.0, tilt: -0.9, w: 0.2 });

    // ---------- Portes coulissantes (deux vantaux par porte) ----------
    const doorLeaves = [];
    DOOR_Z.forEach(function (zc) {
      [-1, 1].forEach(function (side) {
        const lf = new THREE.Group();
        box(0.58, 1.86, 0.04, M.glassLight, 0, 0, 0, lf);
        box(0.6, 0.06, 0.05, M.dark, 0, 0.95, 0, lf);
        box(0.6, 0.06, 0.05, M.dark, 0, -0.95, 0, lf);
        box(0.04, 1.9, 0.05, M.dark, side * 0.3, 0, 0, lf);
        lf.position.set(XW + 0.02, FLOOR + 0.98, zc + side * 0.29);
        g.add(lf);
        doorLeaves.push({ g: lf, zc: zc, side: side });
      });
    });

    // ---------- Lumières réelles : phares + éclairage intérieur (créées une fois pour toutes) ----------
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.2, -30);
    g.add(spotTarget);
    const spot = new THREE.SpotLight(0xfff0d2, 0, 90, 0.62, 0.5, 1.0);
    spot.position.set(0, 0.9, -L / 2 - 0.1);
    spot.target = spotTarget;
    g.add(spot);
    const doorGlow = new THREE.PointLight(0xfff0cc, 0, 9, 2);        // la lumière des portes coule sur la neige du trottoir
    doorGlow.position.set(XW + 0.9, 0.9, (DOOR_Z[0] + DOOR_Z[1]) / 2);
    g.add(doorGlow);
    const cabin = new THREE.PointLight(0xffe2b0, 0.0, 13, 2);
    cabin.position.set(0, 2.0, 0.4);
    g.add(cabin);

    // ---------- Conducteur ----------
    const driverSlot = new THREE.Group();
    driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
    driverSlot.rotation.y = DRIVER.yaw;
    g.add(driverSlot);

    // ==========================================
    // ÉTAT
    // ==========================================
    let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
    let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steer = 0;
    let mode = 'parked';                 // parked | driving | turning
    let P = null, s = 0, legResolve = null, errX = 0, errZ = 0, errH = 0;
    let doorT = 0, doorTarget = 0, doorWait = [];
    let riding = false;                  // le joueur est DANS le bus (debout ou assis)
    let lightsOn = false, driverIn = true, indicator = null, blinkT = 0, braking = false, reversing = false, beepT = 0;
    let turn = null;
    let ac = null;

    // ==========================================
    // LE JOUEUR DANS LE BUS
    // ==========================================
    // Entrer : portes ouvertes + bus arrêté, on franchit la porte à pied. Sortir : pareil dans l'autre sens.
    // Dedans : on marche (le jeu fait avancer la caméra, on garde son déplacement et on le convertit dans le repère du bus,
    // donc le bus nous emporte quand il roule), on clique sur un siège pour s'asseoir, on bouge pour se relever.
    // Tout ce qui est solide à pied dans le bus : sièges + caissons de roue
    const OBST = SEATS.map(function (st) { return { x0: st.x - 0.22, x1: st.x + 0.22, z0: st.z - 0.26, z1: st.z + 0.28 }; }).concat(HOUSINGS);
    const PR = 0.12;                                                   // rayon du joueur dans l'allée
    const EYE_STAND = FLOOR + 1.7, EYE_SIT = 1.62, GLIDE = 3.4;         // GLIDE : m/s quand on va d'une place à l'autre
    let pm = 'standing', seatI = -1, goalSeat = -1, faceFwd = false;    // pm : standing | seated | gliding
    let path = [];
    const pl = { x: 0, z: 0 };                                         // position du joueur dans le repère du bus
    let ey = EYE_STAND, lastCX = 0, lastCZ = 0, uiOn = false;
    const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();

    function laneAt(lz) {                                              // quelle porte (0 avant, 1 milieu) est en face de ce z ? -1 : aucune
      for (let i = 0; i < DOOR_Z.length; i++) if (Math.abs(lz - DOOR_Z[i]) < DW / 2 - 0.12) return i;
      return -1;
    }
    function canvasEl() { return o.canvas || (o.renderer && o.renderer.domElement) || document.querySelector('canvas'); }
    function busyElsewhere() {
      const tr = o.truck, taxiRide = o.taxi && o.taxi.isRiding && o.taxi.isRiding();
      return !!((tr && tr.isDriving && tr.isDriving()) || taxiRide);
    }

    // --- rayon de la souris (ou du regard si la souris est verrouillée) dans le repère du bus ---
    function rayDirLocal(ev) {
      if (ev && !document.pointerLockElement) {
        const cv = canvasEl(); if (!cv) return null;
        const r = cv.getBoundingClientRect();
        camera.updateMatrixWorld();
        tmpV.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
        tmpP.setFromMatrixPosition(camera.matrixWorld);
        tmpV.sub(tmpP).normalize();
      } else {
        camera.getWorldDirection(tmpV);
      }
      const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      return { x: tmpV.x * rx + tmpV.z * rz, y: tmpV.y, z: -(tmpV.x * fx + tmpV.z * fz) };
    }
    // Chaque siège = un coussin + un dossier : on peut viser un siège côté fenêtre par-dessus celui de l'allée
    function seatBoxes(st) {
      return [
        [st.x - 0.22, FLOOR + 0.04, st.z - 0.24, st.x + 0.22, FLOOR + 0.46, st.z + 0.20],     // coussin
        [st.x - 0.22, FLOOR + 0.46, st.z + 0.15, st.x + 0.22, FLOOR + 1.16, st.z + 0.28]      // dossier
      ];
    }
    function pickSeat(d) {
      if (!d) return -1;
      let best = -1, bt = 4;
      const org = [pl.x, ey, pl.z], dir = [d.x, d.y, d.z];
      SEATS.forEach(function (st, i) {
        seatBoxes(st).forEach(function (bx) {
          let t0 = 0, t1 = bt;
          for (let k = 0; k < 3; k++) {
            if (Math.abs(dir[k]) < 1e-6) { if (org[k] < bx[k] || org[k] > bx[k + 3]) return; continue; }
            let a = (bx[k] - org[k]) / dir[k], b = (bx[k + 3] - org[k]) / dir[k];
            if (a > b) { const t = a; a = b; b = t; }
            t0 = Math.max(t0, a); t1 = Math.min(t1, b);
            if (t0 > t1) return;
          }
          if (t0 < bt) { bt = t0; best = i; }
        });
      });
      return best;
    }
    function pickFloor(d) {                                            // le point du plancher visé (ou null)
      if (!d || d.y > -0.05) return null;
      const t = (FLOOR + 0.02 - ey) / d.y;
      if (t <= 0 || t > 8) return null;
      const p = { x: pl.x + d.x * t, z: pl.z + d.z * t };
      if (Math.abs(p.x) > XW - 0.2 || p.z < -4.9 || p.z > 4.85) return null;
      return p;
    }

    // --- contraintes : parois, cabine, sièges, caissons de roue ---
    function clampBody(p, lane) {
      p.x = Math.max(-(XW - 0.22), Math.min(lane >= 0 ? XW + 1.2 : XW - 0.22, p.x));
      p.z = Math.max(-4.95, Math.min(4.9, p.z));
      if (p.x < -0.1 && p.z < -4.1) p.z = -4.1;                        // cabine du conducteur (à gauche)
    }
    function pushOut(p) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < OBST.length; i++) {
          const b = OBST[i], x0 = b.x0 - PR, x1 = b.x1 + PR, z0 = b.z0 - PR, z1 = b.z1 + PR;
          if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
          const dl = p.x - x0, dr = x1 - p.x, df = p.z - z0, db = z1 - p.z, m = Math.min(dl, dr, df, db);
          if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === df) p.z = z0; else p.z = z1;
        }
      }
    }
    function constrainInside() {
      const open = mode === 'parked' && doorT > 0.9;
      clampBody(pl, open ? laneAt(pl.z) : -1);
      pushOut(pl);
    }

    // --- aller d'une place à l'autre : on passe toujours par l'allée (jamais à travers les sièges) ---
    function planTo(tx, tz) {
      const w = [];
      function add(x, z) { const l = w.length ? w[w.length - 1] : pl; if (Math.hypot(x - l.x, z - l.z) > 0.03) w.push({ x: x, z: z }); }
      add(0, pl.z);
      add(0, tz);
      add(tx, tz);
      return w;
    }
    function sit(i) {
      if (!riding || i < 0 || i >= SEATS.length || (pm === 'seated' && seatI === i)) return;
      const st = SEATS[i];
      goalSeat = i; seatI = -1; pm = 'gliding'; faceFwd = true;
      path = planTo(st.x, st.z + 0.12);
    }
    function standAt(p) {
      goalSeat = -1; seatI = -1; pm = 'gliding'; faceFwd = false;
      path = planTo(p.x, p.z);
    }
    function writeCamera() {
      const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      const wx = x + rx * pl.x + fx * (-pl.z), wz = z + rz * pl.x + fz * (-pl.z);
      camera.position.set(origin.x + wx, origin.y + g.position.y + ey, origin.z + wz);
      lastCX = wx; lastCZ = wz;
      if (o.snow) o.snow.setBaseY(origin.y + bodyY);
    }
    function standUp() {                                               // touche de déplacement : on se lève là où on est
      if (!riding || pm === 'standing') return;
      const wasSeated = pm === 'seated';
      const st = SEATS[seatI];
      path = []; goalSeat = -1; faceFwd = false; pm = 'standing';
      if (wasSeated && st) { pl.x = (st.x < 0 ? -1 : 1) * 0.1; pl.z = st.z + 0.05; }
      seatI = -1;
      writeCamera();
    }
    const MOVE_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyZ: 1, KeyQ: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };
    function onKey(ev) {
      if (!riding || pm === 'standing') return;
      if (MOVE_KEYS[ev.code] || /^[zqswadZQSWAD]$/.test(ev.key || '')) standUp();
    }
    // Clic : sur un siège = on s'y assoit (même si on est déjà assis ailleurs : on se lève et on y va) ;
    //        sur le sol quand on est assis = on se lève à cet endroit.
    function onClick(ev) {
      if (!riding) return;
      const t = ev.target;
      if (t && t.closest && t.closest('.bt-say, .bt-reply')) return;
      const d = rayDirLocal(ev);
      const i = pickSeat(d);
      if (i >= 0) { sit(i); return; }
      if (pm !== 'standing') {
        const p = pickFloor(d);
        if (p) { clampBody(p, -1); pushOut(p); standAt(p); }
      }
    }
    function setInput(on) {
      if (on === uiOn) return;
      uiOn = on;
      if (on) { window.addEventListener('keydown', onKey, true); window.addEventListener('click', onClick); }
      else { window.removeEventListener('keydown', onKey, true); window.removeEventListener('click', onClick); }
    }

    // --- entrer / sortir ---
    function enter(lx, lz, cx, cz) {
      riding = true; pm = 'standing'; seatI = -1; goalSeat = -1; path = []; faceFwd = false;
      pl.x = lx; pl.z = lz;
      ey = Math.max(EYE_SIT, camera.position.y - origin.y - g.position.y);
      lastCX = cx; lastCZ = cz;
      setInput(true);
      if (o.onBoard) o.onBoard();
    }
    function leave() {
      riding = false; pm = 'standing'; seatI = -1; goalSeat = -1; path = []; faceFwd = false;
      setInput(false);
      if (o.onExit) o.onExit();
      if (o.onAlight) o.onAlight();
    }
    // Appelé à chaque image, après le déplacement du bus
    function playerStep(dt, h0) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      const cx = camera.position.x - origin.x, cz = camera.position.z - origin.z;
      if (!riding) {
        if (mode === 'parked' && doorT > 0.9 && !busyElsewhere()) {
          const dx = cx - x, dz = cz - z;
          const lx = dx * rx + dz * rz, lz = -(dx * fx + dz * fz);
          if (lx < XW - 0.05 && lx > -0.3 && laneAt(lz) >= 0) enter(lx, lz, cx, cz);      // il a franchi la porte ouverte
        }
        return;
      }
      // le bus tourne : le regard tourne avec lui
      if (o.view && Math.abs(wrap(heading - h0)) > 1e-6) { const v = o.view.get(); o.view.set(v.yaw + wrap(heading - h0), v.pitch); }
      const k = Math.min(1, dt * 7);
      if (pm === 'standing') {
        const dx = cx - lastCX, dz = cz - lastCZ;                         // ce que le joueur a marché tout seul depuis la dernière image
        pl.x += dx * rx + dz * rz; pl.z += -(dx * fx + dz * fz);
        constrainInside();
        if (mode === 'parked' && doorT > 0.9 && laneAt(pl.z) >= 0 && pl.x > XW + 0.02) { leave(); return; }   // il est ressorti par la porte
        ey += (EYE_STAND - ey) * k;
      } else if (pm === 'gliding') {
        const t = path[0];
        if (!t) { pm = goalSeat >= 0 ? 'seated' : 'standing'; seatI = goalSeat; }
        else {
          const ddx = t.x - pl.x, ddz = t.z - pl.z, d = Math.hypot(ddx, ddz), stp = GLIDE * dt;
          if (d <= stp) { pl.x = t.x; pl.z = t.z; path.shift(); } else { pl.x += ddx / d * stp; pl.z += ddz / d * stp; }
          if (!path.length) { pm = goalSeat >= 0 ? 'seated' : 'standing'; seatI = goalSeat; }
        }
        ey += ((goalSeat >= 0 ? EYE_SIT : EYE_STAND) - ey) * k;
      } else {                                                            // assis : collé au siège, le regard est libre
        const st = SEATS[seatI];
        if (st) { pl.x = st.x; pl.z = st.z + 0.12; }
        ey += (EYE_SIT - ey) * k;
      }
      // en s'asseyant on se tourne vers l'avant du bus (tous les sièges regardent vers l'avant)
      if (faceFwd && o.view) {
        const v = o.view.get(), dy = wrap(heading - v.yaw), kk = Math.min(1, dt * 5);
        o.view.set(v.yaw + dy * kk, v.pitch + (0 - v.pitch) * kk);
        if (Math.abs(dy) < 0.03 && pm === 'seated') faceFwd = false;
      }
      writeCamera();
    }

    function place(dt, snap) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const hF = groundH(x + fx * 4.4, z + fz * 4.4);
      const hR = groundH(x - fx * 4.4, z - fz * 4.4);
      const hRt = groundH(x + rx * 1.2, z + rz * 1.2);
      const hL = groundH(x - rx * 1.2, z - rz * 1.2);
      let hW = -1e9;                                                   // hauteur du sol sous chaque roue : le bus se pose sur la plus haute
      [[AXLE_F, -1], [AXLE_F, 1], [AXLE_R, -1], [AXLE_R, 1]].forEach(function (w) {
        hW = Math.max(hW, groundH(x - fx * w[0] + rx * w[1] * 1.18, z - fz * w[0] + rz * w[1] * 1.18));
      });
      const ty = Math.max((hF + hR + hRt + hL) / 4, hW - 0.02) + 0.09;     // +9 cm : le sol visible (neige) est un peu plus haut que le sol logique
      const tp = Math.atan2(hF - hR, 8.8);
      const tr = Math.atan2(hRt - hL, 2.4);
      const k = snap ? 1 : Math.min(1, dt * 7);
      bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 12);
      pitch += (tp - pitch) * k;
      roll += (tr - roll) * k;
      const kneel = ss(0, 1, doorT);                                   // le bus s'agenouille côté trottoir
      g.position.set(x, bodyY - 0.07 * kneel, z);
      g.rotation.set(pitch, heading, roll + 0.014 * kneel);
    }
    place(0, true);

    // ==========================================
    // SONS (carillon des portes, bip de recul) : seulement près de toi
    // ==========================================
    function audible() { return Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) < 45; }
    function tone(f, t0, dur, vol, type) {
      try {
        if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); }
        if (ac.state === 'suspended') ac.resume();
        const t = ac.currentTime + t0, osc = ac.createOscillator(), gn = ac.createGain();
        osc.type = type || 'sine'; osc.frequency.value = f;
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gn); gn.connect(ac.destination);
        osc.start(t); osc.stop(t + dur + 0.05);
      } catch (e) { /* pas de son : tant pis */ }
    }
    // souffle d'air comprimé (bruit filtré) : portes, frein à l'arrêt
    function hiss(t0, dur, vol) {
      if (!audible()) return;
      try {
        if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); }
        if (ac.state === 'suspended') ac.resume();
        const n = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), gn = ac.createGain(), t = ac.currentTime + t0;
        src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 2600;
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.04); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(hp); hp.connect(gn); gn.connect(ac.destination);
        src.start(t);
      } catch (e) { /* pas de son : tant pis */ }
    }
    function chime(open) {
      if (!audible()) return;
      if (open) { hiss(0, 0.7, 0.07); tone(880, 0.3, 0.35, 0.05); tone(660, 0.52, 0.45, 0.05); }
      else { tone(660, 0, 0.18, 0.05); tone(660, 0.25, 0.18, 0.05); tone(660, 0.5, 0.18, 0.05); hiss(0.8, 0.6, 0.06); }
    }

    // ==========================================
    // PORTES
    // ==========================================
    function setDoors(open) {
      const t = open ? 1 : 0;
      if (doorTarget === t) return doorT === t ? Promise.resolve() : new Promise(function (r) { doorWait.push(r); });
      if (open && speed > 0.3) return Promise.resolve();
      doorTarget = t;
      chime(open);
      return new Promise(function (r) { doorWait.push(r); });
    }
    function updateDoors(dt) {
      if (doorT !== doorTarget) {
        doorT += Math.sign(doorTarget - doorT) * dt / DOOR_TIME;
        if ((doorTarget === 1 && doorT >= 1) || (doorTarget === 0 && doorT <= 0)) {
          doorT = doorTarget;
          const w = doorWait; doorWait = [];
          w.forEach(function (r) { r(); });
        }
      }
      const out = ss(0, 0.22, doorT) * 0.09, slide = ss(0.2, 1, doorT) * 0.57;
      doorLeaves.forEach(function (d) {
        d.g.position.x = XW + 0.02 + out;
        d.g.position.z = d.zc + d.side * (0.29 + slide);
      });
      const gl = doorT > 0.04 ? 0x34e060 : 0x16301a;
      doorLights.forEach(function (l) { l.material.color.setHex(doorT > 0.04 && doorT < 1 && doorTarget === 0 ? 0xff3a1e : gl); });
    }

    // ==========================================
    // CLIGNOTANTS, FEUX
    // ==========================================
    function lights(dt) {
      blinkT += dt;
      const on = (blinkT % 0.8) < 0.4;
      const hz = indicator === 'hazard';
      M.indL.color.setHex((indicator === 'left' || hz) && on ? 0xffa000 : 0x2a1800);
      M.indR.color.setHex((indicator === 'right' || hz) && on ? 0xffa000 : 0x2a1800);
      M.tail.color.setHex(braking || (mode === 'parked' && doorT > 0.05) ? 0xff2a1a : 0x6a1008);
      M.rev.color.setHex(reversing ? 0xffffff : 0x3a3a3a);
      spot.intensity = lightsOn ? 4.0 : 0;
      cabin.intensity = lightsOn ? 1.3 : 0.5;
      doorGlow.intensity = 1.6 * ss(0, 1, doorT);
      if (reversing && audible()) { beepT -= dt; if (beepT <= 0) { beepT = 0.7; tone(1000, 0, 0.25, 0.035, 'square'); } }
    }

    // ==========================================
    // CONDUITE AUTOMATIQUE
    // ==========================================
    function dynCap(vT) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      // feux rouges
      if (o.signals && o.signals.ahead) {
        let r = null;
        try { r = o.signals.ahead(x, z, fx, fz, 80); } catch (e) { r = null; }
        if (r && r.red && r.dist > 0) {
          const d = r.dist - L / 2 - 2.5;
          vT = Math.min(vT, Math.sqrt(2 * BRK_E * Math.max(0, d)) * 0.8);
        }
      }
      // autres véhicules et personnes devant
      let obs = [];
      try { obs = o.obstacles ? o.obstacles() : []; } catch (e) { obs = []; }
      if (!riding) obs = obs.concat([{ x: camera.position.x - origin.x, z: camera.position.z - origin.z, r: 0.6 }]);
      for (let i = 0; i < obs.length; i++) {
        const ob = obs[i];
        if (!ob) continue;
        const dx = ob.x - x, dz = ob.z - z;
        const along = dx * fx + dz * fz, lat = dx * rx + dz * rz;
        if (along > 0 && along < 40 && Math.abs(lat) < 2.2 + (ob.r || 1.3)) {
          const d = along - L / 2 - 3.5;
          vT = Math.min(vT, Math.sqrt(2 * BRK_E * Math.max(0, d)) * 0.85);
        }
      }
      return vT;
    }

    function followStep(dt) {
      const q0 = net.sampleAt(P, s);
      const vT = dynCap(q0.v);
      const prev = speed;
      if (speed < vT) speed = Math.min(vT, speed + ACC * dt);
      else speed = Math.max(vT, speed - BRK_E * dt);
      braking = speed < prev - 0.02;
      s += speed * dt;
      tank.consume(Math.abs(speed) * dt);    // (le bus continue même à sec pour l'instant : la panne viendra avec gasstation.js)
      let arrived = false;
      if (s >= P.len - 0.12) { s = P.len; arrived = true; }
      const q = net.sampleAt(P, s);
      const k = Math.exp(-Math.max(speed, 0.5) * dt / 9);               // on rattrape doucement l'écart de départ
      errX *= k; errZ *= k; errH *= k;
      const prevHeading = heading;
      x = q.x + errX; z = q.z + errZ; heading = q.h + errH;
      steer += (Math.max(-0.5, Math.min(0.5, q.turn * 4.2)) - steer) * Math.min(1, dt * 8);
      const rem = P.len - s;
      indicator = rem < 45 && speed > 0.3 ? 'right' : (Math.abs(q.turn) > 0.012 ? (q.turn > 0 ? 'left' : 'right') : null);
      place(dt, false);
      wheelRot += speed * dt / 0.5;
      wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steer : 0; });
      if (arrived) {
        speed = 0; braking = true; indicator = null; mode = 'parked'; reversing = false;
        hiss(0.05, 0.9, 0.05);                                        // purge du frein à air
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        const r = legResolve; legResolve = null; P = null;
        if (r) r('arrived');
      }
    }

    // Demi-tour en trois manœuvres (avant gauche, marche arrière, avant gauche) : tient dans la largeur d'une route
    function turnStep(dt) {
      const LW = 6.4, MAXS = 0.52, V = 2.3;
      const T = turn;
      let vel, st;
      if (T.phase === 0) { vel = V; st = MAXS; if (T.dh >= 1.1) { T.phase = 1; T.pause = 0.8; } }
      else if (T.phase === 1) { vel = -V; st = -MAXS; if (T.dh >= 1.9) { T.phase = 2; T.pause = 0.8; } }
      else { vel = V; st = MAXS; if (T.dh >= Math.PI - 0.04) { T.phase = 3; } }
      if (T.phase === 3) {
        speed = 0; braking = true; reversing = false; indicator = null; mode = 'parked';
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        const r = legResolve; legResolve = null; turn = null;
        if (r) r('turned');
        return;
      }
      if (T.pause > 0) {                                                // petit temps d'arrêt avant de changer de sens
        T.pause -= dt; speed = 0; braking = true;
        steer += (st - steer) * Math.min(1, dt * 3);
        place(dt, false);
        wheels.forEach(function (w) { w.g.rotation.y = w.front ? steer : 0; });
        return;
      }
      const prevHeading = heading;
      speed = vel; braking = false; reversing = vel < 0;
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      x += fx * vel * dt; z += fz * vel * dt;
      const dh = vel / LW * Math.tan(st) * dt;
      heading += dh; T.dh += dh;
      steer += (st - steer) * Math.min(1, dt * 3);
      indicator = reversing ? 'hazard' : 'left';
      place(dt, false);
      wheelRot += vel * dt / 0.5;
      wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steer : 0; });
    }

    // ==========================================
    // UPDATE (se met à jour tout seul, comme le taxi)
    // ==========================================
    function animate(dt) {
      const want = mode !== 'parked' && lightsOn;                     // en route, de nuit / par temps de neige
      if (want) wipeT += dt * 2.6;
      wipeA += ((want ? 0.5 - 0.5 * Math.cos(wipeT) : 0) - wipeA) * Math.min(1, dt * 7);
      wipers.forEach(function (w) { w.rotation.z = wipeA * 1.25; });
      if (!driverIn) return;
      // (l'avatar Violet est animé par engine/avatar-body.js : sit à l'arrêt, drive en roulant)
    }
    function step(dt, active) {
      gauge.update(dt, false);
      const h0 = heading;
      if (mode === 'driving' && P) followStep(dt);
      else if (mode === 'turning' && turn) turnStep(dt);
      else { speed = 0; place(dt, false); }
      updateDoors(dt);
      lights(dt);
      animate(dt);
      playerStep(dt, h0);
    }

    let lastTick = 0;
    function tick(active) {
      const now = performance.now();
      if (lastTick && now - lastTick < 3) return;
      const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
      lastTick = now;
      step(dt, active);
    }
    (function loop() { tick(true); requestAnimationFrame(loop); })();

    window.BadTherapistBus = {
      group: g, slot: driverSlot,
      bringPlayer: function () { if (window.BadTherapistBusLine) window.BadTherapistBusLine.come(); },
      seat: function (n) { if (!riding) return 'monte dans le bus d\'abord'; sit((n | 0) - 1); return 'siège ' + n; },
      stand: function () { standUp(); return 'debout'; },
      setAcc: function (a) { if (a > 0) ACC = a; return ACC; },
      driver: function (px, py, pz, yawDeg) {
        driverSlot.position.set(px, py, pz);
        if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
        console.log('[bus] DRIVER = { x:', px, ', y:', py, ', z:', pz, ', yaw:', driverSlot.rotation.y, '}');
      }
    };

    // ==========================================
    // API
    // ==========================================
    return {
      group: g,
      tank: tank,
      fuelPort: fuelPort,
      refuel: function (l) { return tank.add(l); },
      slot: driverSlot,
      update: function (dt, active) { tick(active !== false); },
      teleport: function (px, pz, h) { x = px; z = pz; heading = h; speed = 0; mode = 'parked'; place(0, true); },
      // Rouler le long d'un chemin (roadnet.makePath) jusqu'au bout. Résolu à l'arrivée.
      follow: function (path) {
        return new Promise(function (resolve) {
          P = path; s = 0; mode = 'driving'; speed = 0; legResolve = resolve;
          const q = net.sampleAt(P, 0);
          errX = x - q.x; errZ = z - q.z; errH = wrap(heading - q.h);
          if (Math.hypot(errX, errZ) > 25) { errX = 0; errZ = 0; x = q.x; z = q.z; }
          if (doorT > 0 || doorTarget > 0) setDoors(false);
        });
      },
      setAcc: function (a) { if (a > 0) ACC = a; },
      // Le bus est solide : repousse un cercle (joueur, avatar, véhicule) hors du rectangle du bus. Renvoie [x, z] (repère de la scène).
      collide: function (px, pz, rad, forPlayer) {
        if (!g.visible) return [px, pz];
        rad = rad || 0.3;
        const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
        const dx = px - x, dz = pz - z;
        const a = dx * fx + dz * fz, b = dx * rx + dz * rz;
        const hl = L / 2 + rad, hw = W / 2 + 0.12 + rad;               // +0.12 : rétroviseurs
        if (Math.abs(a) >= hl || Math.abs(b) >= hw) return [px, pz];
        if (forPlayer && mode === 'parked' && doorT > 0.9 && b > 0 && laneAt(-a) >= 0) return [px, pz];   // porte ouverte : on peut entrer
        let na = a, nb = b;
        if (hl - Math.abs(a) < hw - Math.abs(b)) na = (a < 0 ? -1 : 1) * hl; else nb = (b < 0 ? -1 : 1) * hw;
        return [x + fx * na + rx * nb, z + fz * na + rz * nb];
      },
      seat: function (n) { if (!riding) return 'monte dans le bus d\'abord'; sit((n | 0) - 1); return 'siège ' + n; },   // seat(12) : s'asseoir au siège 12
      stand: function () { standUp(); return 'debout'; },
      seatCount: SEATS.length,
      floorY: function () { return g.position.y + FLOOR; },              // hauteur du plancher (le jeu s'en sert pour la hauteur des yeux dans le bus)
      isInside: function () { return riding; },
      playerAtDoor: function () {                                        // le joueur attend près d'une porte pour descendre
        return riding && pl.x > 0.2 && DOOR_Z.some(function (zc) { return Math.abs(pl.z - zc) < 1.4; });
      },
      // Arrête tout de suite la manœuvre en cours (la promesse de follow / turnAround est résolue avec 'aborted')
      abort: function () {
        if (mode === 'parked') return;
        speed = 0; braking = true; indicator = null; reversing = false; mode = 'parked'; P = null; turn = null;
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        const r = legResolve; legResolve = null;
        if (r) r('aborted');
      },
      // Met le joueur à pied à côté du bus, entre les deux portes, tourné vers lui (pour tester l'entrée par la porte)
      bringPlayer: function () {
        if (riding) return;
        const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
        const px = x + rx * 3.4 + fx * 2.2, pz = z + rz * 3.4 + fz * 2.2;
        camera.position.x = origin.x + px;
        camera.position.z = origin.z + pz;
        camera.position.y = origin.y + 1.7 + groundH(px, pz);
        if (o.view) o.view.set(heading + Math.PI / 2, 0);
      },
      turnAround: function () {
        return new Promise(function (resolve) { turn = { phase: 0, dh: 0, pause: 0 }; mode = 'turning'; legResolve = resolve; });
      },
      openDoors: function () { return setDoors(true); },
      closeDoors: function () { return setDoors(false); },
      doorsOpen: function () { return doorT > 0.9; },
      setDisplay: function (route, text) { signs.forEach(function (sg) { drawSign(sg, route, text); }); },
      setLights: function (on) { lightsOn = !!on; },
      setIndicator: function (v) { indicator = v; },
      isMoving: function () { return mode !== 'parked'; },
      isRiding: function () { return riding; },
      isDoorsMoving: function () { return doorT !== doorTarget; },
      getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },
      getMode: function () { return mode; },
      setDriverPresent: function (v) { driverIn = !!v; },
      // un endroit libre à côté de la porte avant, pour que le conducteur descende
      doorSpot: function () {
        const rx = Math.cos(heading), rz = -Math.sin(heading);
        const fx = -Math.sin(heading), fz = -Math.cos(heading);
        return [x + rx * 3.4 + fx * 4.3, z + rz * 3.4 + fz * 4.3];
      },
      // le joueur est descendu par code (ex. fin de ligne) : devant la porte du milieu
      forceAlight: function () {
        if (!riding) return;
        const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
        camera.position.x = origin.x + x + rx * 3.5 + fx * (-DOOR_Z[1]);
        camera.position.z = origin.z + z + rz * 3.5 + fz * (-DOOR_Z[1]);
        leave();
      },
      isPlayerNear: function (r) { return Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) < (r || 30); },
      LENGTH: L, WIDTH: W
    };
  }

  // ==========================================
  // PANNEAUX D'ARRÊT DE BUS
  // ==========================================
  // stops : [{ x, z, heading, n }] — heading = cap du bus à l'arrivée (le panneau lui fait face, près de la porte avant).
  // Un poteau, une plaque bleue avec un petit bus, le numéro de l'arrêt et un voyant ambre pour qu'on le voie dans la nuit.

  function createBusStops(parent, stops, groundH) {
    const M = {
      pole: new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.6, metalness: 0.6 }),
      snow: new THREE.MeshStandardMaterial({ color: 0xdfe5e8, roughness: 0.9, emissive: 0x20282c }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
      base: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 })
    };
    function plateTex(n) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 160;
      const k = c.getContext('2d');
      k.fillStyle = '#0a5fb8'; k.fillRect(0, 0, 128, 160);
      k.strokeStyle = '#fff'; k.lineWidth = 5; k.strokeRect(5, 5, 118, 150);
      // petit bus
      k.fillStyle = '#fff';
      k.fillRect(24, 34, 80, 44);
      k.fillStyle = '#0a5fb8';
      for (let i = 0; i < 4; i++) k.fillRect(29 + i * 19, 40, 14, 14);
      k.fillRect(24, 62, 80, 4);
      k.fillStyle = '#fff';
      k.beginPath(); k.arc(44, 82, 7, 0, 6.3); k.arc(86, 82, 7, 0, 6.3); k.fill();
      k.font = 'bold 40px Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle';
      k.fillText(String(n), 64, 126);
      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      return tex;
    }
    const out = [];
    stops.forEach(function (st) {
      const grp = new THREE.Group();
      grp.position.set(st.x, groundH(st.x, st.z), st.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 3.1, 8), M.pole);
      pole.position.y = 1.55; grp.add(pole);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.12, 10), M.base);
      base.position.y = 0.06; grp.add(base);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicMaterial({ map: plateTex(st.n), side: THREE.DoubleSide }));
      plate.position.y = 2.55;
      plate.rotation.y = Math.atan2(Math.sin(st.heading), Math.cos(st.heading));     // la plaque regarde le bus qui arrive (normale = -avant)
      grp.add(plate);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.12), M.snow);
      cap.position.y = 2.97; cap.rotation.y = plate.rotation.y; grp.add(cap);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.lamp);
      lamp.position.y = 3.2; grp.add(lamp);
      parent.add(grp);
      out.push(grp);
    });
    return { groups: out };
  }
  return { createBus, createBusStops };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA VOITURE DE POLICE (ancien police-car.js) — id « police », propriétaire : Leon
// ═══════════════════════════════════════════════════════════════════════════
const _police = (function () {
  // ==========================================
  // BAD THERAPIST — LA VOITURE DE POLICE (objects/police-car.js)
  // ==========================================
  // La voiture de patrouille de Leon (« Police »). Même principe que le bus : un véhicule + un pilote automatique sur le réseau
  // de routes (roadnet.js). C'est engine/police-service.js qui lui dit où aller ; c'est le cerveau de Leon qui décide quand.
  //   • berline noire et blanche, barre lumineuse rouge/bleue qui clignote (gyrophares), sirène (WebAudio), inscription POLICE ;
  //   • la portière conducteur s'ouvre (pour que Leon monte et descende) ;
  //   • il ralentit dans les virages, s'arrête aux feux rouges (options.signals) et devant un obstacle (options.obstacles : camion,
  //     taxi, bus, toi à pied), fait demi-tour sur place quand la route part dans l'autre sens ;
  //   • il conduit plus vite que le taxi, mais pas n'importe comment.
  //
  // Repère : comme taxi.js / bus.js. Avant = -z local ; cap h -> avant (-sin h, -cos h), droite (cos h, -sin h). Conducteur à GAUCHE.
  // Réglage en direct (F12) : BadTherapistPolice.driver(x, y, z, yawEnDegres)

  const L = 5.0, W = 2.0, FLOOR = 0.40;
  const DRIVER = { x: -0.5, y: FLOOR, z: -0.2, yaw: Math.PI };
  const WHEEL = { x: -0.5, y: 1.1, z: -0.5 };
  const PAR = { vmax: 24, acc: 4.5, brk: 5.5, alat: 5.5, brkE: 9.5 };       // réglables : car.setProfile({ vmax, acc, brk, alat })

  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function ss(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }

  function createPoliceCar(parent, o) {

    const origin = o.origin || { x: 0, y: 0, z: 0 };
    const camera = o.camera;
    const groundH = o.groundH || function () { return 0; };
    const net = o.net;

    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    parent.add(g);

    const M = {
      black: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.45, metalness: 0.5, emissive: 0x050607 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.45, metalness: 0.3, emissive: 0x15181a }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 1 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      light: new THREE.MeshBasicMaterial({ color: 0xffeccc }),
      tail: new THREE.MeshBasicMaterial({ color: 0x6a1008 }),
      redBar: new THREE.MeshBasicMaterial({ color: 0x300606 }),
      blueBar: new THREE.MeshBasicMaterial({ color: 0x050a30 }),
      redF: new THREE.MeshBasicMaterial({ color: 0x300606 }),
      blueF: new THREE.MeshBasicMaterial({ color: 0x050a30 }),
      snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
    };

    function box(w, h, d, mat, x, y, z, par) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      (par || g).add(m);
      return m;
    }

    // Toit relevé de 1,52 à 1,98 m : Leon (1,80 m + casquette) assis au volant dépassait du toit. Si besoin, monte encore ROOF.
    const BELT = 0.98, ROOF = 1.98;

    // Plancher, caisse basse, capot, coffre, pare-chocs
    box(1.8, 0.2, 4.4, M.dark, 0, 0.3, 0);
    box(1.86, 0.08, 2.6, M.dark, 0, FLOOR - 0.04, 0.2);
    box(1.9, 0.56, 1.35, M.black, 0, 0.7, -1.82);                         // capot (bas)
    box(1.88, 0.06, 1.3, M.black, 0, BELT + 0.0, -1.82);
    box(1.9, 0.56, 0.95, M.black, 0, 0.7, 1.98);                          // coffre
    box(1.88, 0.06, 0.9, M.black, 0, BELT, 1.98);
    box(1.7, 0.05, 1.1, M.snow, 0, BELT + 0.04, -1.8);
    box(1.98, 0.18, 0.2, M.metal, 0, 0.42, -2.48);                        // pare-chocs (avec barre « push bar »)
    box(1.98, 0.18, 0.2, M.metal, 0, 0.42, 2.48);
    box(1.2, 0.34, 0.1, M.dark, 0, 0.74, -2.5);
    box(0.34, 0.14, 0.06, M.light, -0.7, 0.8, -2.5);                      // phares
    box(0.34, 0.14, 0.06, M.light, 0.7, 0.8, -2.5);
    box(0.34, 0.12, 0.05, M.tail, -0.7, 0.82, 2.5);                       // feux arrière
    box(0.34, 0.12, 0.05, M.tail, 0.7, 0.82, 2.5);

    // Flancs : blanc (portières) / noir ; côté gauche percé pour la portière conducteur (animée plus bas)
    function side(x, z0, z1, mat) { box(0.07, BELT - 0.3, z1 - z0, mat, x, (BELT + 0.3) / 2, (z0 + z1) / 2); }
    side(0.93, -1.15, 1.35, M.white);                                     // droite : portières blanches
    side(-0.93, -1.15, -0.45, M.white);
    side(-0.93, 0.55, 1.35, M.white);                                     // gauche : trou entre -0.45 et 0.55
    [[0.93, -1], [-0.93, -1]].forEach(function (p) { void p; });

    // Cabine : montants, toit, vitres
    const pillarH = ROOF - BELT;
    [[-0.9, -1.15], [0.9, -1.15], [-0.93, 0.05], [0.93, 0.05], [-0.9, 1.35], [0.9, 1.35]].forEach(function (p) {
      box(0.07, pillarH, 0.07, M.black, p[0], (BELT + ROOF) / 2, p[1]);
    });
    box(1.98, 0.08, 2.64, M.black, 0, ROOF + 0.04, 0.1);
    box(1.84, 0.05, 2.5, M.snow, 0, ROOF + 0.1, 0.1);
    const gh = pillarH - 0.04;
    const wsh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
    wsh.position.set(0, (BELT + ROOF) / 2, -1.15); wsh.rotation.x = -0.22; g.add(wsh);
    const rwn = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
    rwn.position.set(0, (BELT + ROOF) / 2, 1.35); rwn.rotation.x = 0.2; g.add(rwn);
    [-0.93, 0.93].forEach(function (x) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.5, gh), M.glass);
      sw.rotation.y = Math.PI / 2; sw.position.set(x, (BELT + ROOF) / 2, 0.1); g.add(sw);
    });

    // Inscription POLICE sur les portières et le coffre
    function textTex(txt, w, h, fg, bg) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const k = c.getContext('2d');
      if (bg) { k.fillStyle = bg; k.fillRect(0, 0, w, h); }
      k.fillStyle = fg; k.font = 'bold ' + Math.round(h * 0.7) + 'px Arial, sans-serif';
      k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(txt, w / 2, h / 2 + 2);
      const t = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      return t;
    }
    const polMat = new THREE.MeshBasicMaterial({ map: textTex('POLICE', 256, 64, '#0a2a66', '#e8ecef') });
    function label(x, z, ry) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), polMat);
      p.position.set(x, 0.66, z); p.rotation.y = ry; g.add(p);
    }
    label(0.97, 0.45, Math.PI / 2);
    label(-0.97, 0.85, -Math.PI / 2);
    label(0, 2.47, 0);
    box(0.9, 0.04, 1.2, M.white, 0, BELT + 0.07, -1.82);                  // bande blanche sur le capot

    // Barre lumineuse (gyrophares) : moitié rouge, moitié bleue
    const bar = new THREE.Group();
    bar.position.set(0, ROOF + 0.17, 0.0);
    g.add(bar);
    box(1.3, 0.07, 0.34, M.dark, 0, 0, 0, bar);
    const barR = box(0.6, 0.12, 0.3, M.redBar, 0.33, 0.08, 0, bar);
    const barB = box(0.6, 0.12, 0.3, M.blueBar, -0.33, 0.08, 0, bar);
    void barR; void barB;
    // petits flashs avant (calandre) et arrière (lunette)
    box(0.2, 0.06, 0.04, M.redF, -0.3, 0.9, -2.52);
    box(0.2, 0.06, 0.04, M.blueF, 0.3, 0.9, -2.52);
    box(0.25, 0.05, 0.04, M.redF, -0.5, 1.3, 1.37);
    box(0.25, 0.05, 0.04, M.blueF, 0.5, 1.3, 1.37);

    // Intérieur : tableau de bord, volant, sièges, ordinateur de bord
    box(1.8, 0.22, 0.4, M.dark, 0, 1.0, -1.0);
    box(0.4, 0.26, 0.04, new THREE.MeshBasicMaterial({ color: 0x2e6dff }), 0.2, 1.2, -0.7);
    const steer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
    steer.position.set(WHEEL.x, WHEEL.y, WHEEL.z); steer.rotation.x = -0.95; g.add(steer);
    function seat(x, z) {
      box(0.4, 0.3, 0.4, M.dark, x, FLOOR + 0.18, z);
      box(0.55, 0.14, 0.55, M.seat, x, FLOOR + 0.4, z);
      box(0.55, 0.62, 0.1, M.seat, x, FLOOR + 0.78, z + 0.3);
    }
    seat(-0.5, 0.0); seat(0.5, 0.0);
    box(1.5, 0.14, 0.55, M.seat, 0, FLOOR + 0.4, 0.95);
    box(1.5, 0.62, 0.1, M.seat, 0, FLOOR + 0.78, 1.23);
    box(1.7, 0.7, 0.04, M.dark, 0, 1.05, 0.62);                           // grille de séparation

    // Réservoir + jauge d'essence (tableau de bord, côté conducteur ; visible aussi depuis la banquette arrière)
    const tank = createTank({ type: 'police' });
    const fuelPort = { x: 0.95, y: 0.7, z: 1.6 };
    const gauge = createFuelGauge(g, tank, { x: WHEEL.x, y: 1.115, z: -0.93, tilt: -0.9, w: 0.2 });

    // Roues
    const wheels = [];
    [[-0.95, -1.55, true], [0.95, -1.55, true], [-0.95, 1.5, false], [0.95, 1.5, false]].forEach(function (w) {
      const wg = new THREE.Group();
      wg.rotation.order = 'YXZ';
      wg.position.set(w[0], 0.36, w[1]);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), M.rubber);
      tire.rotation.z = Math.PI / 2; wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), M.metal);
      hub.rotation.z = Math.PI / 2; wg.add(hub);
      g.add(wg);
      wheels.push({ g: wg, front: w[2] });
    });

    // Portière conducteur (pivot à la charnière avant)
    const door = new THREE.Group();
    door.position.set(-0.93, 0, -0.45);
    g.add(door);
    box(0.07, BELT - 0.3, 1.0, M.white, 0, (BELT + 0.3) / 2, 0.5, door);
    box(0.06, pillarH - 0.12, 0.9, M.glass, 0, (BELT + ROOF) / 2, 0.5, door).material = M.glass;      // vitre de portière : suit la hauteur du toit
    box(0.07, 0.05, 1.0, M.black, 0, BELT + 0.02, 0.5, door);
    let doorT = 0, doorTarget = 0, doorWait = [];

    // Lumières réelles : phares + éclairage bleu/rouge sur la neige (créés une fois pour toutes)
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0.3, -26);
    g.add(spotTarget);
    const spot = new THREE.SpotLight(0xffeccc, 0, 70, 0.55, 0.5, 1.0);
    spot.position.set(0, 0.9, -2.2); spot.target = spotTarget; g.add(spot);
    const flash = new THREE.PointLight(0xff2020, 0, 22, 2);
    flash.position.set(0, ROOF + 0.4, 0); g.add(flash);

    const driverSlot = new THREE.Group();
    driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
    driverSlot.rotation.y = DRIVER.yaw;
    g.add(driverSlot);

    // ==========================================
    // ÉTAT
    // ==========================================
    let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
    let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steerCur = 0;
    let mode = 'parked', P = null, s = 0, legResolve = null, errX = 0, errZ = 0, errH = 0;
    let lightsOn = true, beacons = false, siren = false, braking = false, driverIn = true, flashT = 0;
    let ac = null, sirenNodes = null;

    // ==========================================
    // LE PRISONNIER (banquette arrière, côté passager)
    // ==========================================
    // takePlayer() : la caméra glisse jusqu'à la banquette arrière, puis suit la voiture (cap + relief).
    // releasePlayer() : le joueur est posé debout à côté de la portière arrière droite ; renvoie [x, z] (repère de la rue).
    // Pendant ce temps le monde doit bloquer la marche : isDriving() de outside.js doit aussi renvoyer police.isCarrying().
    const SEAT_BACK = new THREE.Vector3(0.45, FLOOR + 0.4 + 0.72, 0.95);
    let carry = null, carryPrevH = 0;
    function updateCarry(dt) {
      if (!carry) return;
      const eye = SEAT_BACK.clone().applyEuler(g.rotation).add(g.position);
      const tx = origin.x + eye.x, ty = origin.y + eye.y, tz = origin.z + eye.z;
      if (carry.phase === 'boarding') {
        carry.t += dt;
        const k = Math.min(1, carry.t / 1.5), e = k * k * (3 - 2 * k);
        camera.position.set(
          carry.from.x + (tx - carry.from.x) * e,
          carry.from.y + (ty - carry.from.y) * e + Math.sin(Math.PI * e) * 0.1,
          carry.from.z + (tz - carry.from.z) * e);
        if (k >= 1) {
          carry.phase = 'riding';
          if (o.view) o.view.set(heading, 0);
          carryPrevH = heading;
          const r = carry.resolve; carry.resolve = null; if (r) r(true);
        }
      } else {
        camera.position.set(tx, ty, tz);
        if (o.view) { const v = o.view.get(); o.view.set(v.yaw + (heading - carryPrevH), v.pitch); }
        carryPrevH = heading;
      }
      if (o.snow) o.snow.setBaseY(origin.y + bodyY);
    }

    function place(dt, snap) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const hF = groundH(x + fx * 2.2, z + fz * 2.2), hR = groundH(x - fx * 2.2, z - fz * 2.2);
      const hRt = groundH(x + rx, z + rz), hL = groundH(x - rx, z - rz);
      const k = snap ? 1 : Math.min(1, dt * 9);
      bodyY += ((hF + hR + hRt + hL) / 4 - bodyY) * Math.min(1, snap ? 1 : dt * 14);
      pitch += (Math.atan2(hF - hR, 4.4) - pitch) * k;
      roll += (Math.atan2(hRt - hL, 2.0) - roll) * k;
      g.position.set(x, bodyY, z);
      g.rotation.set(pitch, heading, roll);
    }
    place(0, true);

    // ==========================================
    // SIRÈNE (seulement près de toi)
    // ==========================================
    function audioCtx() {
      if (ac) return ac;
      try { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); } catch (e) { ac = null; }
      return ac;
    }
    function sirenStart() {
      const a = audioCtx();
      if (!a || sirenNodes) return;
      try {
        if (a.state === 'suspended') a.resume();
        const osc = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), out = a.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = 900;
        lfo.type = 'triangle'; lfo.frequency.value = 0.55; lg.gain.value = 330;
        lfo.connect(lg); lg.connect(osc.frequency);
        out.gain.value = 0;
        osc.connect(out); out.connect(a.destination);
        osc.start(); lfo.start();
        sirenNodes = { osc: osc, lfo: lfo, out: out };
      } catch (e) { sirenNodes = null; }
    }
    function sirenStop() {
      if (!sirenNodes) return;
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch (e) { /* déjà arrêté */ }
      sirenNodes = null;
    }
    function sirenVolume() {
      if (!sirenNodes) return;
      const d = Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z);
      sirenNodes.out.gain.value = Math.max(0, 1 - d / 160) * 0.07;
    }

    // ==========================================
    // PORTIÈRE
    // ==========================================
    function setDoor(open) {
      const t = open ? 1 : 0;
      if (doorTarget === t) return doorT === t ? Promise.resolve() : new Promise(function (r) { doorWait.push(r); });
      if (open && speed > 0.3) return Promise.resolve();
      doorTarget = t;
      return new Promise(function (r) { doorWait.push(r); });
    }
    function updateDoor(dt) {
      if (doorT !== doorTarget) {
        doorT += Math.sign(doorTarget - doorT) * dt / 0.9;
        if ((doorTarget === 1 && doorT >= 1) || (doorTarget === 0 && doorT <= 0)) {
          doorT = doorTarget;
          const w = doorWait; doorWait = []; w.forEach(function (r) { r(); });
        }
      }
      door.rotation.y = -ss(0, 1, doorT) * 1.15;
    }

    // ==========================================
    // CONDUITE AUTOMATIQUE
    // ==========================================
    function dynCap(vT) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      if (o.signals && o.signals.ahead) {
        let r = null;
        try { r = o.signals.ahead(x, z, fx, fz, 70); } catch (e) { r = null; }
        if (r && r.red && r.dist > 0) vT = Math.min(vT, Math.sqrt(2 * PAR.brkE * Math.max(0, r.dist - L / 2 - 2.5)) * 0.8);
      }
      let obs = [];
      try { obs = o.obstacles ? o.obstacles() : []; } catch (e) { obs = []; }
      obs = obs.concat([{ x: camera.position.x - origin.x, z: camera.position.z - origin.z, r: 0.6 }]);       // toi à pied
      for (let i = 0; i < obs.length; i++) {
        const ob = obs[i];
        if (!ob) continue;
        const dx = ob.x - x, dz = ob.z - z, along = dx * fx + dz * fz, lat = dx * rx + dz * rz;
        if (along > 0 && along < 40 && Math.abs(lat) < 1.9 + (ob.r || 1.3)) vT = Math.min(vT, Math.sqrt(2 * PAR.brkE * Math.max(0, along - L / 2 - 3)) * 0.85);
      }
      return vT;
    }

    function followStep(dt) {
      const q0 = net.sampleAt(P, s);
      const vT = tank.empty ? 0 : dynCap(q0.v);                            // panne sèche : il freine et s'arrête là où il est
      const prev = speed;
      if (speed < vT) speed = Math.min(vT, speed + PAR.acc * dt); else speed = Math.max(vT, speed - PAR.brkE * dt);
      braking = speed < prev - 0.03;
      s += speed * dt;
      tank.consume(Math.abs(speed) * dt);
      if (tank.empty && speed < 0.05) {                                    // arrêt définitif : la leg se termine avec 'empty'
        speed = 0; braking = true; mode = 'parked';
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        place(dt, false);
        const rr = legResolve; legResolve = null; P = null;
        if (rr) rr('empty');
        return;
      }
      let arrived = false;
      if (s >= P.len - 0.12) { s = P.len; arrived = true; }
      const q = net.sampleAt(P, s);
      const k = Math.exp(-Math.max(speed, 0.5) * dt / 7);
      errX *= k; errZ *= k; errH *= k;
      x = q.x + errX; z = q.z + errZ; heading = q.h + errH;
      steerCur += (Math.max(-0.5, Math.min(0.5, q.turn * 3.2)) - steerCur) * Math.min(1, dt * 9);
      place(dt, false);
      wheelRot += speed * dt / 0.36;
      wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steerCur : 0; });
      if (arrived) {
        speed = 0; braking = true; mode = 'parked';
        wheels.forEach(function (w) { w.g.rotation.y = 0; });
        const r = legResolve; legResolve = null; P = null;
        if (r) r('arrived');
      }
    }

    // ==========================================
    // UPDATE
    // ==========================================
    function lights(dt) {
      flashT += dt;
      const on = beacons || siren;
      const ph = Math.floor(flashT / 0.14) % 6;                           // alternance rouge / bleu en rafales
      const red = on && (ph === 0 || ph === 2), blue = on && (ph === 3 || ph === 5);
      M.redBar.color.setHex(red ? 0xff2020 : 0x300606);
      M.blueBar.color.setHex(blue ? 0x2a46ff : 0x050a30);
      M.redF.color.setHex(red ? 0xff2020 : 0x300606);
      M.blueF.color.setHex(blue ? 0x2a46ff : 0x050a30);
      M.tail.color.setHex(braking || mode === 'parked' ? 0xff2a1a : 0x6a1008);
      flash.color.setHex(red ? 0xff2020 : 0x3050ff);
      flash.intensity = on && (red || blue) ? 3.2 : 0;
      spot.intensity = lightsOn && mode !== 'parked' ? 3.6 : (lightsOn ? 1.2 : 0);
      if (siren) { sirenStart(); sirenVolume(); } else sirenStop();
    }
    function step(dt) {
      if (mode === 'driving' && P) followStep(dt);
      else { speed = 0; place(dt, false); }
      gauge.update(dt, false);
      updateCarry(dt);
      updateDoor(dt);
      lights(dt);
    }
    let lastTick = 0;
    function tick() {
      const now = performance.now();
      if (lastTick && now - lastTick < 3) return;
      const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
      lastTick = now;
      step(dt);
    }
    (function loop() { tick(); requestAnimationFrame(loop); })();

    window.BadTherapistPolice = {
      group: g, slot: driverSlot,
      driver: function (px, py, pz, yawDeg) {
        driverSlot.position.set(px, py, pz);
        if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
        console.log('[police] DRIVER = { x:', px, ', y:', py, ', z:', pz, ', yaw:', driverSlot.rotation.y, '}');
      }
    };

    // ==========================================
    // API
    // ==========================================
    return {
      group: g,
      slot: driverSlot,
      update: function () { tick(); },
      teleport: function (px, pz, h) { x = px; z = pz; heading = h; speed = 0; mode = 'parked'; place(0, true); },
      follow: function (path) {
        if (tank.empty) return Promise.resolve('empty');
        return new Promise(function (resolve) {
          P = path; s = 0; mode = 'driving'; speed = 0; legResolve = resolve;
          const q = net.sampleAt(P, 0);
          errX = x - q.x; errZ = z - q.z; errH = wrap(heading - q.h);
          if (Math.hypot(errX, errZ) > 25) { errX = 0; errZ = 0; x = q.x; z = q.z; }
          if (doorT > 0 || doorTarget > 0) setDoor(false);
        });
      },
      abort: function () { const r = legResolve; legResolve = null; P = null; mode = 'parked'; speed = 0; if (r) r('aborted'); },
      openDoor: function () { return setDoor(true); },
      closeDoor: function () { return setDoor(false); },
      setSiren: function (on) { siren = !!on; if (on) beacons = true; },
      setBeacons: function (on) { beacons = !!on; if (!on) siren = false; },
      setLights: function (on) { lightsOn = !!on; },
      setProfile: function (p) { Object.assign(PAR, p || {}); },
      getProfile: function () { return Object.assign({}, PAR); },
      isMoving: function () { return mode !== 'parked'; },
      getMode: function () { return mode; },
      getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },
      setDriverPresent: function (v) { driverIn = !!v; },
      // à côté de la portière conducteur (côté gauche), pour que Leon descende
      doorSpot: function () {
        const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
        return [x - rx * 2.3 + fx * 0.1, z - rz * 2.3 + fz * 0.1];
      },
      // ----- essence (même réservoir que le camion / taxi / bus : objects/fuel.js) -----
      tank: tank,
      fuelPort: fuelPort,
      refuel: function (l) { return tank.add(l); },
      getTank: function () { return tank; },
      isEmpty: function () { return tank.empty; },
      isLow: function () { return tank.low; },
      // ----- prisonnier -----
      takePlayer: function () {
        if (carry) return Promise.resolve(true);
        return new Promise(function (resolve) { carry = { phase: 'boarding', t: 0, from: camera.position.clone(), resolve: resolve }; });
      },
      releasePlayer: function () {
        if (!carry) return null;
        carry = null;
        const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
        const px = x + rx * 2.6 + fx * 0.9, pz = z + rz * 2.6 + fz * 0.9;       // côté passager, à côté de la portière arrière
        camera.position.x = origin.x + px; camera.position.z = origin.z + pz;
        return [px, pz];
      },
      isCarrying: function () { return !!carry; },
      playerPos: function () { return { x: camera.position.x - origin.x, z: camera.position.z - origin.z }; },
      LENGTH: L, WIDTH: W
    };
  }
  return { createPoliceCar };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 6. ENTRÉES PUBLIQUES (chaque véhicule créé reçoit son id / type / owner de la liste VEHICLES)
// ═══════════════════════════════════════════════════════════════════════════
export function createTruck(parent, o) { return tag(_truck.createTruck(parent, o), 'truck'); }
export function createTaxi(parent, o) { return tag(_taxi.createTaxi(parent, o), 'taxi'); }
export function createBus(parent, o) { return tag(_bus.createBus(parent, o), 'bus'); }
export function createPoliceCar(parent, o) { return tag(_police.createPoliceCar(parent, o), 'police'); }
export const createBusStops = _bus.createBusStops;
