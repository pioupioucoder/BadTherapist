import * as THREE from 'three';
import { lightPool } from '../lightpool.js';

// ==========================================
// BAD THERAPIST — L'IMMEUBLE (places/immeuble.js)
// ==========================================
// Uniquement l'immeuble et sa cour : façade, fenêtres vivantes, porte d'entrée, toit, lampadaires, banc, clôture.
// Tout ce qui sert à plusieurs lieux est ailleurs :
//   - outils, matériaux, générateur aléatoire -> common.js (createKit)
//   - terrain, routes, montagnes              -> map.js
//   - la rue complète (immeuble + route + forêt + véhicules + lieux) -> outside.js
//
// Utilisation : const imm = buildImmeuble(scene, kit);   // kit = createKit({ renderer })
// Autonome   : world_base.html?world=immeuble.js  (affiche la rue complète)

export { buildWorld } from './outside.js';


// ==========================================
// 0. RÉGLAGES (tout ce qui se règle est ici)
// ==========================================

const CFG = {
  litRatio: 0.40,       // part de fenêtres allumées
  windowFigure: true    // silhouette immobile dans une fenêtre (mets false pour l'enlever)
};

export function buildImmeuble(scene, kit) {

const { mats, rnd, disp, glowSprite, glowTex, makeCanvas, makeTex, makeInstanced, unitBox, item, box, lumpGeo } = kit;
const _c = new THREE.Color();


// ==========================================
// 6. IMMEUBLE PRINCIPAL
// ==========================================

const main = new THREE.Group();
scene.add(main);

const floors = 9;
const floorH = 3.15;
const width = 23;
const depth = 9;
const totalH = floors * floorH;
const cols = 7;
const winW = 2.05;
const winH = 1.72;
const FRONT_Z = -24.5;

// Façade en panneaux préfabriqués : joints, salissures, coulures
function facadeCanvas() {
  const W = 1024, H = 1280;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const px = W / width, py = H / totalH;
  const seam = i => width / 2 + (i - 3) * 3.05 - 1.525;

  g.fillStyle = 'rgb(150,143,128)';
  g.fillRect(0, 0, W, H);

  const xs = [0];
  for (let i = 0; i <= cols; i++) xs.push(seam(i));
  xs.push(width);

  // Panneaux de teintes légèrement différentes
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < xs.length - 1; k++) {
      const v = (rnd() - 0.5) * 16;
      g.fillStyle = `rgb(${150 + v | 0},${143 + v | 0},${128 + v * 0.9 | 0})`;
      g.fillRect(xs[k] * px, H - (f + 1) * floorH * py, (xs[k + 1] - xs[k]) * px + 1, floorH * py + 1);
    }
  }

  // Joints
  g.strokeStyle = 'rgba(35,32,28,0.55)';
  g.lineWidth = 3;
  for (let k = 1; k < xs.length - 1; k++) {
    g.beginPath(); g.moveTo(xs[k] * px, 0); g.lineTo(xs[k] * px, H); g.stroke();
  }
  for (let f = 1; f < floors; f++) {
    const y = H - f * floorH * py;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Coulures sous les fenêtres
  for (let f = 0; f < floors; f++) {
    for (let c2 = 0; c2 < cols; c2++) {
      const x = width / 2 + (c2 - 3) * 3.05;
      const y0 = H - (f * floorH + 1.75 - winH / 2 - 0.2) * py;
      const len = (0.9 + rnd() * 1.2) * py;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, 'rgba(20,18,16,0.30)');
      gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr;
      g.fillRect((x - winW * 0.45) * px, y0, winW * 0.9 * px, len);
    }
  }

  // Grandes traînées d'humidité
  for (let i = 0; i < 36; i++) {
    const x = rnd() * W, w = 8 + rnd() * 40;
    g.fillStyle = rnd() < 0.6 ? `rgba(20,20,22,${0.03 + rnd() * 0.05})` : `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
    g.fillRect(x, rnd() * H * 0.4, w, H * (0.3 + rnd() * 0.7));
  }

  // Bas de façade sali par la neige projetée
  const gb = g.createLinearGradient(0, H - 3.2 * py, 0, H);
  gb.addColorStop(0, 'rgba(18,18,20,0)');
  gb.addColorStop(1, 'rgba(18,18,20,0.45)');
  g.fillStyle = gb;
  g.fillRect(0, H - 3.2 * py, W, 3.2 * py);

  // Grain
  for (let i = 0; i < 12000; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.07})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd(), 1 + rnd());
  }
  return c;
}

const facadeMat = new THREE.MeshStandardMaterial({ map: makeTex(facadeCanvas(), 1, 1, true), roughness: 0.95 });

const body = new THREE.Mesh(
  new THREE.BoxGeometry(width, totalH, depth),
  [mats.side, mats.side, mats.concreteDark, mats.concreteDark, facadeMat, mats.side]
);
body.position.set(0, totalH / 2, -29);
main.add(body);

// Chaînages d'angle en léger relief
box(main, 0.18, totalH, depth + 0.1, mats.side, -width / 2, totalH / 2, -28.95);
box(main, 0.18, totalH, depth + 0.1, mats.side, width / 2, totalH / 2, -28.95);

// Plinthe
box(main, width + 0.3, 0.6, 0.3, mats.concreteDark, 0, 0.3, FRONT_Z + 0.1);

// Séparations d'étages
for (let f = 0; f <= floors; f++) {
  box(main, width + 0.25, 0.12, 0.22, mats.concreteDark, 0, f * floorH, -24.38);
}

// ---- Fenêtres, balcons (tout en instances : très léger) ----

const frames = [], mullions = [], sills = [], snowBits = [], metalBits = [], slabs = [], curtains = [];
const litItems = [], darkItems = [];
const litBase = [];

const litPalette = [
  [0.95, 0.70, 0.36], [0.90, 0.60, 0.30], [0.92, 0.86, 0.68],
  [0.70, 0.80, 0.90], [0.55, 0.38, 0.20]
];
function pickLit() {
  const r = rnd();
  const k = r < 0.34 ? 0 : r < 0.58 ? 1 : r < 0.74 ? 2 : r < 0.86 ? 3 : 4;
  const v = 0.85 + rnd() * 0.15;
  const p = litPalette[k];
  return disp(p[0] * v, p[1] * v, p[2] * v);
}

const FIG_F = 5, FIG_C = 4;
let figureAt = null;

for (let f = 0; f < floors; f++) {
  for (let c = 0; c < cols; c++) {

    if (f === 0 && c === 3) continue; // la porte d'entrée est ici

    const x = (c - (cols - 1) / 2) * 3.05;
    const y = f * floorH + 1.75;

    const forced = CFG.windowFigure && f === FIG_F && c === FIG_C;
    const lit = forced || rnd() < CFG.litRatio;

    frames.push(item(x, y, -24.34, winW + 0.18, winH + 0.16, 0.13));
    mullions.push(item(x, y, -24.16, 0.055, winH, 0.04));
    mullions.push(item(x, y, -24.16, winW, 0.055, 0.04));

    const sillY = y - winH / 2 - 0.12;
    sills.push(item(x, sillY, -24.15, winW + 0.28, 0.10, 0.32));
    snowBits.push(item(x, sillY + 0.07, -24.15, winW + 0.2, 0.06, 0.26));

    if (lit) {
      const col = forced ? disp(0.95, 0.70, 0.36) : pickLit();
      litItems.push(item(x, y, -24.23, winW, winH, 0.08, col));
      litBase.push(col.clone());
      if (forced) figureAt = { x, y };
      // rideaux sur certaines fenêtres allumées
      if (!forced && rnd() < 0.35) {
        const side = rnd() < 0.5 ? -1 : 1;
        curtains.push(item(x + side * winW * 0.27, y, -24.185, winW * 0.46, winH, 0.02));
      }
    } else {
      const v = 0.05 + rnd() * 0.035;
      darkItems.push(item(x, y, -24.23, winW, winH, 0.08, disp(v, v * 1.15, v * 1.3)));
    }

    // Balcons
    if (c % 2 === 0 && f > 0 && rnd() < 0.38) {
      const by = y - winH / 2 - 0.35;
      slabs.push(item(x, by, -23.72, 2.55, 0.12, 1));
      snowBits.push(item(x, by + 0.09, -23.72, 2.45, 0.06, 0.9));
      metalBits.push(item(x, y - winH / 2 + 0.02, -23.25, 2.55, 0.05, 0.055));
      metalBits.push(item(x, y - winH / 2 + 0.36, -23.25, 2.55, 0.045, 0.06));
      for (let k = -2; k <= 2; k++) metalBits.push(item(x + k * 0.5, y - winH / 2 + 0.02, -23.25, 0.045, 0.72, 0.055));
      if (rnd() < 0.55) {
        // bric-à-brac de balcon (vélo, cartons...)
        metalBits.push(item(x + (rnd() - 0.5) * 1.2, by + 0.45, -23.55, 0.5 + rnd() * 0.4, 0.55 + rnd() * 0.3, 0.4));
      }
    }
  }
}

makeInstanced(unitBox, mats.trim, frames, main);
makeInstanced(unitBox, mats.trim, mullions, main);
makeInstanced(unitBox, mats.concreteDark, sills.concat(slabs), main);
makeInstanced(unitBox, mats.snow, snowBits, main);
makeInstanced(unitBox, mats.metal, metalBits, main);
makeInstanced(unitBox, mats.curtain, curtains, main);

const unlitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.2 });
makeInstanced(unitBox, unlitMat, darkItems, main);

const litMesh = makeInstanced(unitBox, new THREE.MeshBasicMaterial({ color: 0xffffff }), litItems, main);

// Halos des fenêtres allumées
const haloItems = litItems.map((it, i) => {
  const hc = litBase[i].clone().multiplyScalar(0.16);
  return item(it.x, it.y, -24.05, 3.4, 3.0, 1, hc);
});
const haloMesh = makeInstanced(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }),
  haloItems, main
);

function setLit(i, col, k) {
  litMesh.setColorAt(i, col);
  _c.copy(col).multiplyScalar(0.16 * k);
  haloMesh.setColorAt(i, _c);
  litMesh.instanceColor.needsUpdate = true;
  haloMesh.instanceColor.needsUpdate = true;
}

// Silhouette immobile dans une fenêtre
if (figureAt) {
  const black = new THREE.MeshBasicMaterial({ color: 0x030303 });
  const fig = new THREE.Group();
  fig.position.set(figureAt.x + 0.3, 0, -24.1);
  main.add(fig);
  const baseY = figureAt.y - winH / 2;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.05, 10), black);
  torso.position.y = baseY + 0.52;
  fig.add(torso);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.2), black);
  shoulders.position.y = baseY + 1.0;
  fig.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), black);
  head.position.y = baseY + 1.25;
  fig.add(head);
}

// ---- Entrée principale ----

const entranceTrim = box(main, 3.2, 2.55, 0.22, mats.trim, 0, 1.28, -24.22);
const entranceGlow = box(main, 2.7, 2.25, 0.10, mats.doorGlow, 0, 1.18, -24.06);
const entranceHandle = new THREE.Object3D();
main.add(entranceHandle);

// Porte automatique transparente : deux vantaux vitrés qui coulissent (pilotés par setEntrance)
const entGlass = new THREE.MeshStandardMaterial({
  color: 0xa8bcc8, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.2, depthWrite: false
});
const entLeaves = [];
[-1, 1].forEach(function (sd) {
  const lf = new THREE.Group();
  lf.position.set(sd * 0.675, 1.18, -23.93);
  main.add(lf);
  box(lf, 1.3, 2.2, 0.03, entGlass, 0, 0, 0);
  box(lf, 1.3, 0.07, 0.06, mats.metal, 0, 1.065, 0);
  box(lf, 1.3, 0.1, 0.06, mats.metal, 0, -1.05, 0);
  box(lf, 0.06, 2.2, 0.06, mats.metal, -0.62, 0, 0);
  box(lf, 0.06, 2.2, 0.06, mats.metal, 0.62, 0, 0);
  entLeaves.push({ g: lf, base: sd * 0.675, dir: sd });
});
function setEntrance(a) {
  const e = a * a * (3 - 2 * a);
  entLeaves.forEach(function (l) { l.g.position.x = l.base + l.dir * 1.25 * e; });
}
box(main, 3.8, 0.18, 1.5, mats.concreteDark, 0, 2.55, -23.5);
box(main, 3.7, 0.07, 1.4, mats.snow, 0, 2.68, -23.5);
box(main, 3.6, 0.18, 1.5, mats.concreteDark, 0, 0.09, -23.35);
box(main, 3.4, 0.05, 1.3, mats.snow, 0, 0.2, -23.35);

const entranceLamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.2), new THREE.MeshBasicMaterial({ color: 0xe7c99e }));
entranceLamp.position.set(0, 2.44, -23.3);
main.add(entranceLamp);
glowSprite(main, 0, 2.3, -23.2, 0xffb870, 3.2, 0.5);

const entranceLight = new THREE.PointLight(0xffa860, 3.0, 18, 1.8);
entranceLight.position.set(0, 2.2, -22.4);
scene.add(entranceLight);

// Le sol devant l'immeuble est éclairé par ses fenêtres et sa porte (halos au sol, sans vraie lumière)
lightPool(scene, 0, 0, -20.6, 10, 0xffa860, 0.30);
[-9, -4.5, 4.5, 9].forEach(function (px, i) { lightPool(scene, px, 0, -21.2, 6.5, i % 2 ? 0xffb878 : 0x9fb4d8, 0.17); });

// ---- Toit ----

const roofY = totalH;
box(main, width + 0.3, 0.55, 0.3, mats.concrete, 0, roofY + 0.275, -24.35);
box(main, width + 0.3, 0.55, 0.3, mats.concreteDark, 0, roofY + 0.275, -33.65);
box(main, 0.3, 0.55, depth + 0.6, mats.concreteDark, -width / 2 - 0.1, roofY + 0.275, -29);
box(main, 0.3, 0.55, depth + 0.6, mats.concreteDark, width / 2 + 0.1, roofY + 0.275, -29);
box(main, width - 0.2, 0.2, depth - 0.5, mats.snow, 0, roofY + 0.1, -29);

box(main, 4.4, 2.5, 3.6, mats.concreteDark, -4.5, roofY + 1.25, -29.5);
box(main, 4.5, 0.14, 3.7, mats.snow, -4.5, roofY + 2.57, -29.5);

const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 14), mats.metal);
tank.position.set(5.2, roofY + 1.1, -30.2);
main.add(tank);
const tankSnow = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 0.1, 14), mats.snow);
tankSnow.position.set(5.2, roofY + 2.05, -30.2);
main.add(tankSnow);

box(main, 0.7, 0.9, 0.7, mats.metal, 1.5, roofY + 0.65, -27.5);
box(main, 0.7, 0.9, 0.7, mats.metal, 8.4, roofY + 0.65, -27.8);

for (const mx of [-5.5, -3.6]) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 5.5, 5), mats.metal);
  mast.position.set(mx, roofY + 2.5 + 2.75, -29.5);
  main.add(mast);
}

const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), beaconMat);
beacon.position.set(-5.5, roofY + 8.1, -29.5);
main.add(beacon);
const beaconGlow = glowSprite(main, -5.5, roofY + 8.1, -29.5, 0xff2a1a, 3.2, 0.9);

// ==========================================
// 7. NEIGE ACCUMULÉE (berges, plinthe, buttes)
// ==========================================

const lumpItems = [];

// Neige contre la façade
for (let x = -11.2; x <= 11.2; x += 1.5) {
  if (Math.abs(x) < 2.6) continue;
  const h = 0.22 + rnd() * 0.3;
  lumpItems.push(item(x + (rnd() - 0.5) * 0.4, -0.06 + h * 0.4, -24.0, 1.0 + rnd(), h, 0.45 + rnd() * 0.4));
}

// Buttes irrégulières dans la cour
for (let i = 0; i < 70; i++) {
  const x = (rnd() - 0.5) * 90, z = -22 + rnd() * 52;
  if (Math.abs(x) < 7.5) continue;
  const h = 0.12 + rnd() * 0.25;
  lumpItems.push(item(x, -0.06 + h * 0.3, z, 1.5 + rnd() * 3, h, 1.5 + rnd() * 3));
}
makeInstanced(lumpGeo, mats.snow, lumpItems, scene);

// ==========================================
// 9. LAMPADAIRES
// ==========================================

const REAL_LAMP_LIGHTS = false;     // false = halos au sol seulement (aucune vraie lumière : plus léger)
function streetLamp(x, z) {

  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 5.8, 8), mats.metal);
  pole.position.y = 2.9;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.15, 7), mats.metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(x < 0 ? 0.48 : -0.48, 5.65, 0);
  g.add(arm);

  const lampX = x < 0 ? 1 : -1;

  box(g, 0.48, 0.16, 0.25, mats.metal, lampX, 5.55, 0);
  box(g, 0.40, 0.05, 0.22, mats.snow, lampX, 5.66, 0);

  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.19), new THREE.MeshBasicMaterial({ color: 0xe7c99e }));
  bulb.position.set(lampX, 5.44, 0);
  g.add(bulb);

  glowSprite(g, lampX, 5.35, 0, 0xffa860, 4.2, 0.55);

  // Lumière vers le bas (cône) : le sol dessous est éclairé, pas le lampadaire lui-même
  if (REAL_LAMP_LIGHTS) {
    const light = new THREE.SpotLight(0xffa860, 2.2, 28, 1.2, 0.7, 1.4);
    light.position.set(lampX, 5.25, 0);
    light.target.position.set(lampX, 0, 0);
    light.userData.keep = true;
    g.add(light);
    g.add(light.target);
  }
  lightPool(g, lampX, 0, 0, 9, 0xff9a50, 0.34);
}

streetLamp(-7, -4);
streetLamp(8, -17);
streetLamp(-13, -39);

// ==========================================
// 10. BANC, CLÔTURE, VOITURES ENSEVELIES
// ==========================================

const benchMat = new THREE.MeshStandardMaterial({ color: 0x39332d, roughness: 0.9 });

function bench(x, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  box(g, 2.1, 0.12, 0.55, benchMat, 0, 0.62, 0);
  box(g, 2.1, 0.72, 0.12, benchMat, 0, 1.0, -0.23);
  box(g, 2.0, 0.05, 0.45, mats.snow, 0, 0.70, 0);
  box(g, 2.0, 0.05, 0.10, mats.snow, 0, 1.38, -0.23);
  for (const dx of [-0.8, 0.8]) box(g, 0.12, 0.62, 0.12, mats.metal, dx, 0.31, 0);
}
bench(7.7, -7.5, -Math.PI / 2);

// Clôture basse de cour, de part et d'autre de l'allée
const posts = [], rails = [], fenceSnow = [];
function fenceRun(x0, x1, z) {
  const len = x1 - x0, cx = (x0 + x1) / 2;
  const n = Math.max(1, Math.floor(len / 1.8));
  for (let i = 0; i <= n; i++) posts.push(item(x0 + i * len / n, 0.55, z, 0.07, 1.1, 0.07));
  rails.push(item(cx, 0.38, z, len, 0.05, 0.04));
  rails.push(item(cx, 0.88, z, len, 0.05, 0.04));
  fenceSnow.push(item(cx, 0.93, z, len, 0.05, 0.09));
}
fenceRun(-36, -9.2, -20.5);
fenceRun(9.2, 36, -20.5);
makeInstanced(unitBox, mats.metal, posts.concat(rails), scene);
makeInstanced(unitBox, mats.snow, fenceSnow, scene);

// ==========================================
// 11. FENÊTRES VIVANTES (téléviseur, lumières qui s'éteignent)
// ==========================================

const dyn = [];
if (litItems.length > 8) {
  const pool = [];
  litItems.forEach((it, i) => {
    if (!(CFG.windowFigure && Math.abs(it.x - figureAt.x) < 0.01 && Math.abs(it.y - figureAt.y) < 0.01)) pool.push(i);
  });
  const take = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  dyn.push({ type: 'tv', i: take(), next: 0 });
  dyn.push({ type: 'tv', i: take(), next: 0 });
  dyn.push({ type: 'switch', i: take(), next: 20 + rnd() * 40, on: true });
  dyn.push({ type: 'switch', i: take(), next: 40 + rnd() * 60, on: true });
}
const tvColor = disp(0.55, 0.70, 0.95);
const offColor = disp(0.03, 0.03, 0.035);


return {
  main: main,                                                    // le corps de l'immeuble (masqué vu de l'intérieur)
  entranceMeshes: [entranceTrim, entranceGlow, entranceHandle],  // l'entrée (masquée vu de l'intérieur)
  setEntrance: setEntrance,                                      // ouvre / ferme la porte vitrée (0..1)

  update(dt, time) {

    // Fenêtres vivantes
    for (const d of dyn) {
      if (time < d.next) continue;
      if (d.type === 'tv') {
        const k = 0.35 + Math.random() * 0.65;
        _c.copy(tvColor).multiplyScalar(k);
        setLit(d.i, _c.clone(), k);
        d.next = time + 0.08 + Math.random() * 0.3;
      } else {
        d.on = !d.on;
        if (d.on) setLit(d.i, litBase[d.i], 1);
        else setLit(d.i, offColor, 0);
        d.next = time + 25 + Math.random() * 70;
      }
    }

    // Balise rouge sur le toit
    const blink = Math.sin(time * 2.2) > 0.7 ? 1 : 0.1;
    beaconMat.color.setRGB(1 * blink, 0.16 * blink, 0.1 * blink);
    beaconGlow.material.opacity = 0.9 * blink;
  }

};

}
