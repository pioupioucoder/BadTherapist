import * as THREE from 'three';

export function buildWorld(scene, ctx = {}) {

const { camera, renderer } = ctx;

// Lieu extérieur : on active la neige (désactivée par défaut dans world_base.html)
if (ctx.snow) ctx.snow.setEnabled(true);

// ==========================================
// BAD THERAPIST — IMMEUBLE ET ENVIRONNEMENT
// Hiver figé, nuit de neige, solitude.
// ==========================================

// ==========================================
// 0. RÉGLAGES (tout ce qui se règle est ici)
// ==========================================

const CFG = {
  litRatio: 0.40,       // part de fenêtres allumées
  windowFigure: true    // silhouette immobile dans une fenêtre (mets false pour l'enlever)
};

// Aléatoire reproductible : l'immeuble est identique à chaque chargement
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261103);

// Couleur définie "comme à l'écran" (convertie en linéaire pour three r128)
const disp = (r, g, b) => new THREE.Color(Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2));

// ==========================================
// 1. OUTILS (canvas, textures, instances)
// ==========================================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeTex(canvas, repX = 1, repY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
  return t;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

function item(x, y, z, w, h, d, color) {
  return { x, y, z, w, h, d, color };
}

function makeInstanced(geo, mat, items, parent) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _m.compose(_p.set(it.x, it.y, it.z), _q.identity(), _s.set(it.w, it.h, it.d));
    mesh.setMatrixAt(i, _m);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function box(parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function mergeGeos(list) {
  let pc = 0, ic = 0;
  list.forEach(g => { pc += g.attributes.position.count; ic += g.index.count; });
  const pos = new Float32Array(pc * 3);
  const nor = new Float32Array(pc * 3);
  const idx = new Uint32Array(ic);
  let po = 0, io = 0;
  list.forEach(g => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, po * 3);
    nor.set(g.attributes.normal.array, po * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po;
    po += n; io += g.index.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Halo lumineux doux (réutilisé partout)
function glowCanvas() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
const glowTex = new THREE.CanvasTexture(glowCanvas());

function glowSprite(parent, x, y, z, color, scale, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  sp.position.set(x, y, z);
  sp.scale.set(scale, scale, 1);
  parent.add(sp);
  return sp;
}

// ==========================================
// 2. ATMOSPHÈRE
//    Ciel, brouillard et lumières globales sont
//    dans world_base.html (communs à tous les lieux).
// ==========================================

// (la neige qui tombe est aussi dans world_base.html)

// ==========================================
// 3. MATÉRIAUX
// ==========================================

const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x77716b, roughness: 0.96 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x494640, roughness: 0.95 }),
  side: new THREE.MeshStandardMaterial({ color: 0x45423f, roughness: 0.95 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x292725, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x191e20, roughness: 0.3, metalness: 0.15 }),
  doorGlow: new THREE.MeshBasicMaterial({ color: disp(0.60, 0.42, 0.22) }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x343431, metalness: 0.5, roughness: 0.7 }),
  snow: new THREE.MeshStandardMaterial({ color: 0xc2cad0, roughness: 0.92 }),
  curtain: new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 1 }),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x0b0e10, roughness: 0.2, metalness: 0.3 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1 })
};

// ==========================================
// 4. SOL ENNEIGÉ
// ==========================================

function snowCanvas(size = 512) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = 'rgb(206,214,219)';
  g.fillRect(0, 0, size, size);

  const wrap = fn => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };

  // Grandes ondulations de neige (tuilables)
  for (let i = 0; i < 80; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 80;
    const light = rnd() < 0.5;
    const col = light ? '255,255,255' : '138,155,170';
    const alpha = 0.10 + rnd() * 0.12;
    wrap((dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(${col},${alpha})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }

  // Grain fin
  for (let i = 0; i < 6000; i++) {
    const v = rnd() < 0.5 ? 255 : 110;
    g.fillStyle = `rgba(${v},${v},${v},${0.10 + rnd() * 0.22})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return c;
}

const snowCv = snowCanvas();
const snowMap = makeTex(snowCv, 62, 62, true);
const snowBump = makeTex(snowCv, 62, 62, false);

// Sol lointain (noyé dans le brouillard)
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshStandardMaterial({ color: 0x8a949a, roughness: 0.95 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.12;
scene.add(farGround);

// Sol proche texturé
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({
    color: 0xb4bdc4,
    map: snowMap,
    bumpMap: snowBump,
    bumpScale: 1.2,
    roughness: 0.93
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.06;
scene.add(ground);

// ==========================================
// 5. ROUTE DÉNEIGÉE (allée vers l'immeuble)
// ==========================================

function roadCanvas() {
  const S = 256;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(50,51,53)';
  g.fillRect(0, 0, S, S);

  // Ornières des roues, plus sombres et humides
  for (const cx of [0.28, 0.72]) {
    const gr = g.createLinearGradient((cx - 0.09) * S, 0, (cx + 0.09) * S, 0);
    gr.addColorStop(0, 'rgba(25,26,29,0)');
    gr.addColorStop(0.5, 'rgba(25,26,29,0.55)');
    gr.addColorStop(1, 'rgba(25,26,29,0)');
    g.fillStyle = gr;
    g.fillRect((cx - 0.09) * S, 0, 0.18 * S, S);
  }

  // Neige tassée au centre et en plaques
  for (let i = 0; i < 70; i++) {
    const x = (0.38 + rnd() * 0.24) * S, y = rnd() * S, r = 6 + rnd() * 16;
    for (const dy of [-S, 0, S]) {
      g.fillStyle = `rgba(190,198,204,${0.08 + rnd() * 0.14})`;
      g.beginPath(); g.arc(x, y + dy, r, 0, Math.PI * 2); g.fill();
    }
  }

  // Bords couverts de neige (bord irrégulier, tuilable)
  for (let y = 0; y < S; y += 2) {
    const t = y / S * Math.PI * 2;
    const wl = 22 + 10 * Math.sin(t * 3) + 6 * Math.sin(t * 7 + 1);
    const wr = 22 + 10 * Math.sin(t * 4 + 2) + 6 * Math.sin(t * 9);
    g.fillStyle = 'rgb(206,213,218)';
    g.fillRect(0, y, wl, 2);
    g.fillRect(S - wr, y, wr, 2);
  }

  // Grain d'asphalte
  for (let i = 0; i < 5000; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.07})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  return c;
}

const ROAD_Z0 = 40, ROAD_Z1 = -23.8;
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(12, ROAD_Z0 - ROAD_Z1),
  new THREE.MeshStandardMaterial({ map: makeTex(roadCanvas(), 1, (ROAD_Z0 - ROAD_Z1) / 12), color: 0xb0b0b0, roughness: 0.85 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, -0.03, (ROAD_Z0 + ROAD_Z1) / 2);
scene.add(road);

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

box(main, 3.2, 2.55, 0.22, mats.trim, 0, 1.28, -24.22);
box(main, 2.7, 2.25, 0.10, mats.doorGlow, 0, 1.18, -24.06);
box(main, 0.08, 2.25, 0.08, mats.metal, 0, 1.18, -23.98);
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

const lumpGeo = new THREE.SphereGeometry(1, 10, 6);
const lumpItems = [];

// Neige repoussée le long de la route
for (let z = ROAD_Z0; z > ROAD_Z1; z -= 1.0 + rnd() * 0.6) {
  for (const side of [-1, 1]) {
    const h = 0.28 + rnd() * 0.28;
    lumpItems.push(item(side * (6.25 + (rnd() - 0.5) * 0.5), -0.06 + h * 0.4, z, 0.55 + rnd() * 0.35, h, 0.9 + rnd() * 0.7));
  }
}

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
// 8. ARBRES NUS (une seule géométrie par arbre)
// ==========================================

function makeTree(x, z, height = 10) {

  const geos = [];
  const up = new THREE.Vector3(0, 1, 0);
  const qq = new THREE.Quaternion();
  const mm = new THREE.Matrix4();
  const mid = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  function seg(a, b, r0, r1, sides) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
    const dir = b.clone().sub(a).normalize();
    qq.setFromUnitVectors(up, dir);
    mid.copy(a).add(b).multiplyScalar(0.5);
    mm.compose(mid, qq, one);
    g.applyMatrix4(mm);
    geos.push(g);
  }

  function grow(start, dir, len, radius, depthLeft) {
    const end = start.clone().addScaledVector(dir, len);
    seg(start, end, radius, radius * 0.62, 4);
    if (depthLeft <= 0 || len < 0.4) return;
    const kids = depthLeft >= 3 ? 2 : (rnd() < 0.4 ? 3 : 2);
    for (let i = 0; i < kids; i++) {
      const rv = new THREE.Vector3(rnd() - 0.5, rnd() * 0.6 - 0.1, rnd() - 0.5).normalize();
      const nd = dir.clone().multiplyScalar(0.62).addScaledVector(rv, 0.75).add(new THREE.Vector3(0, 0.22, 0)).normalize();
      const base = i === 0 ? end.clone() : start.clone().lerp(end, 0.55 + rnd() * 0.4);
      grow(base, nd, len * (0.62 + rnd() * 0.14), radius * 0.62, depthLeft - 1);
    }
  }

  const trunkH = height * 0.48;
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.4, trunkH, (rnd() - 0.5) * 0.4);
  seg(new THREE.Vector3(0, 0, 0), lean, 0.27, 0.12, 7);

  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5 + rnd() * 0.5;
    const start = lean.clone().multiplyScalar(0.55 + k * 0.08);
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.55 + rnd() * 0.35, Math.sin(a) * 0.7).normalize();
    grow(start, dir, height * (0.28 + rnd() * 0.12), 0.10, 5);
  }
  grow(lean.clone().multiplyScalar(0.92), new THREE.Vector3(0.08, 1, 0.02).normalize(), height * 0.34, 0.09, 5);

  const mesh = new THREE.Mesh(mergeGeos(geos), mats.trunk);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
}

makeTree(-9, 2, 12);
makeTree(10, -1, 13);
makeTree(-16, -23, 15);
makeTree(16, -34, 14);
makeTree(-31, -12, 12);
makeTree(33, -20, 13);

// ==========================================
// 9. LAMPADAIRES
// ==========================================

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

  const light = new THREE.PointLight(0xffa860, 5.5, 30, 1.7);
  light.position.set(lampX, 5.25, 0);
  g.add(light);
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

function car(x, z, yaw, bodyColor) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.35 });
  box(g, 1.78, 0.62, 4.3, bodyMat, 0, 0.62, 0);
  box(g, 1.6, 0.52, 2.3, bodyMat, 0, 1.17, -0.15);
  box(g, 1.63, 0.34, 2.2, mats.carGlass, 0, 1.2, -0.15);

  for (const sx of [-0.88, 0.88]) {
    for (const sz of [-1.4, 1.4]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), mats.tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.3, sz);
      g.add(w);
    }
  }

  box(g, 1.55, 0.14, 2.15, mats.snow, 0, 1.5, -0.15);
  box(g, 1.72, 0.10, 1.2, mats.snow, 0, 0.98, 1.45);
  box(g, 1.72, 0.10, 1.0, mats.snow, 0, 0.98, -1.6);
}
car(-4.3, -10.5, 0.03, 0x1b2026);
car(4.4, -19.0, -0.05, 0x2a1d1a);

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

// ==========================================
// 12. UPDATE
// ==========================================

return {

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
