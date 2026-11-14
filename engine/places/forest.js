import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — FORÊT (forest.js)
// ==========================================
// Grands arbres feuillus (tronc, branches, feuillage en cartes), buissons et rochers.
//  - tout bouge avec le vent (balancement du tronc + frémissement des feuilles),
//  - rendu par blocs ("chunks") de 80 m : seuls les blocs proches du joueur sont dessinés,
//  - collisions simples (cercles) pour les troncs et les rochers.
//
// Utilisation (immeuble.js) :
//   const data = scatterForest(R, {...});             // une seule fois (partagé)
//   const forest = buildForest(parent, data, { boost });   // une fois par copie du monde
//   forest.update(time, { x, z });                    // chaque frame
//   forest.collide(x, z, r) -> [x, z]

export const WIND = { uTime: { value: 0 } };

const V3 = THREE.Vector3;

function prng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ==========================================
// TEXTURES (créées une seule fois)
// ==========================================

let TEX = null;
function getTex() {
  if (TEX) return TEX;
  const rnd = prng(777);

  // Atlas de feuillage (fond transparent) : gauche = feuilles ovales pointues, droite = petites feuilles rondes.
  // Chaque case est un petit rameau garni de vraies feuilles, avec des trous : pas de boule pleine.
  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 256;
  const g = lc.getContext('2d');

  function leafShape(x, y, ang, len, wid, col, vein) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.45, -wid, len, 0);
    g.quadraticCurveTo(len * 0.45, wid, 0, 0);
    g.fill();
    if (vein) {
      g.strokeStyle = vein; g.lineWidth = 1;
      g.beginPath(); g.moveTo(1, 0); g.lineTo(len * 0.9, 0); g.stroke();
    }
    g.restore();
  }
  function leafColor() {
    const v = rnd();
    if (v > 0.88) return 'rgb(' + (92 + rnd() * 30 | 0) + ',' + (128 + rnd() * 30 | 0) + ',' + (40 + rnd() * 16 | 0) + ')';   // quelques feuilles plus claires
    return 'rgb(' + (30 + v * 28 | 0) + ',' + (74 + v * 52 | 0) + ',' + (28 + v * 24 | 0) + ')';
  }
  function twigCluster(ox, round) {
    const cx = ox + 128, cy = 128;
    const twigs = 7 + (rnd() * 3 | 0);
    for (let t = 0; t < twigs; t++) {
      const a = (t / twigs) * Math.PI * 2 + rnd() * 0.5;
      const L = 60 + rnd() * 30;
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L;
      g.strokeStyle = 'rgb(56,42,30)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
      const n = 6 + (rnd() * 4 | 0);
      for (let i = 0; i < n; i++) {
        const f = 0.12 + 0.88 * (i / (n - 1));
        const px = cx + (ex - cx) * f, py = cy + (ey - cy) * f;
        [-1, 1].forEach(function (side) {
          const len = (round ? 15 : 22) + rnd() * (round ? 8 : 12);
          leafShape(px, py, a + side * (0.65 + rnd() * 0.55), len, len * (round ? 0.55 : 0.33), leafColor(), 'rgba(14,34,12,0.55)');
        });
      }
      leafShape(ex, ey, a, round ? 18 : 24, round ? 10 : 8, leafColor(), 'rgba(14,34,12,0.55)');
    }
  }
  twigCluster(0, false);
  twigCluster(256, true);

  const leaf = new THREE.CanvasTexture(lc);
  leaf.encoding = THREE.sRGBEncoding;
  leaf.anisotropy = 2;

  // Écorce : stries verticales
  const bc = document.createElement('canvas');
  bc.width = 64; bc.height = 128;
  const b = bc.getContext('2d');
  b.fillStyle = '#5b4a3c';
  b.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 64, w = 1 + rnd() * 3, v = 40 + rnd() * 70;
    b.fillStyle = 'rgba(' + v + ',' + (v * 0.8 | 0) + ',' + (v * 0.65 | 0) + ',' + (0.25 + rnd() * 0.4) + ')';
    b.fillRect(x, rnd() * 128, w, 18 + rnd() * 60);
  }
  for (let i = 0; i < 40; i++) {
    b.fillStyle = 'rgba(10,6,4,' + (0.2 + rnd() * 0.3) + ')';
    b.fillRect(rnd() * 64, rnd() * 128, 1 + rnd() * 2, 10 + rnd() * 35);
  }
  const bark = new THREE.CanvasTexture(bc);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  bark.encoding = THREE.sRGBEncoding;

  TEX = { leaf: leaf, bark: bark };
  return TEX;
}

// ==========================================
// MATÉRIAUX + VENT
// ==========================================

function patchWind(mat, strength) {
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = WIND.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\n' +
        'uniform float uTime;\n' +
        'attribute float aSway;\n' +
        'attribute float aFlutter;\n')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '{\n' +
        '  vec2 wl = normalize(vec2(1.0, 0.28));\n' +
        '  float ph = 0.0;\n' +
        '  #ifdef USE_INSTANCING\n' +
        '    vec3 c0 = instanceMatrix[0].xyz;\n' +
        '    vec3 c2 = instanceMatrix[2].xyz;\n' +
        '    float s2 = max(dot(c0, c0), 0.0001);\n' +
        '    wl = vec2(dot(vec3(0.962, 0.0, 0.27), c0), dot(vec3(0.962, 0.0, 0.27), c2)) / s2;\n' +
        '    ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.13;\n' +
        '  #endif\n' +
        '  float gust = 0.55 + 0.45 * sin(uTime * 0.35 + ph * 0.3) + 0.25 * sin(uTime * 0.9 + ph);\n' +
        '  float sw = 0.9 + 0.5 * sin(uTime * 1.25 + ph + position.y * 0.15);\n' +
        '  float amt = aSway * gust * sw * ' + strength.toFixed(3) + ';\n' +
        '  transformed.x += wl.x * amt;\n' +
        '  transformed.z += wl.y * amt;\n' +
        '  float fl = sin(uTime * 5.2 + position.x * 1.7 + position.z * 2.1 + ph * 2.0) * aFlutter * 0.11 * gust;\n' +
        '  transformed += vec3(fl, fl * 0.5, fl * 0.7);\n' +
        '}\n');
  };
}

function makeMats(boost, cheap) {
  const T = getTex();
  const b = boost || 0;
  // « cheap » : éclairage Lambert (calculé aux sommets) au lieu de PBR par pixel. Les arbres ont roughness 1 (aucun reflet),
  // le rendu est quasi identique mais coûte beaucoup moins : la scène contient une dizaine de lumières.
  const Mat = cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;

  const bark = new Mat({
    map: T.bark, vertexColors: true,
    emissive: new THREE.Color(0x030202).multiplyScalar(1 + b * 0.8),
    side: THREE.DoubleSide
  });
  patchWind(bark, 1.6);

  const leaf = new Mat({
    map: T.leaf, vertexColors: true, alphaTest: 0.5,
    emissive: new THREE.Color(0x030504).multiplyScalar(1 + b * 0.8),
    side: THREE.DoubleSide
  });
  patchWind(leaf, 1.6);

  const bush = new Mat({
    map: T.leaf, vertexColors: true, alphaTest: 0.5,
    emissive: new THREE.Color(0x030504).multiplyScalar(1 + b * 0.8),
    side: THREE.DoubleSide
  });
  patchWind(bush, 0.35);

  const rock = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, flatShading: true,
    emissive: new THREE.Color(0x020303).multiplyScalar(1 + b * 1.2)
  });

  return { bark: bark, leaf: leaf, bush: bush, rock: rock };
}

// ==========================================
// CONSTRUCTION DES GÉOMÉTRIES
// ==========================================

function newB() { return { p: [], n: [], u: [], c: [], s: [], f: [] }; }

function vtx(b, p, n, u, v, col, sw, fl) {
  b.p.push(p.x, p.y, p.z);
  b.n.push(n.x, n.y, n.z);
  b.u.push(u, v);
  b.c.push(col[0], col[1], col[2]);
  b.s.push(sw);
  b.f.push(fl);
}

function toGeo(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(b.s, 1));
  g.setAttribute('aFlutter', new THREE.Float32BufferAttribute(b.f, 1));
  g.computeBoundingSphere();
  return g;
}

// Branche : tronc de cône entre a et e
function addSeg(b, a, e, r0, r1, sides, col, H) {
  const dir = new V3().subVectors(e, a);
  const len = dir.length();
  if (len < 0.001) return;
  dir.normalize();
  const ref = Math.abs(dir.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const t1 = new V3().crossVectors(ref, dir).normalize();
  const t2 = new V3().crossVectors(dir, t1);
  const sw = function (y) { return Math.pow(Math.max(0, y) / H, 1.5) * 0.7; };
  const vLen = len * 0.35;

  for (let i = 0; i < sides; i++) {
    const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
    const n0 = new V3().addScaledVector(t1, Math.cos(a0)).addScaledVector(t2, Math.sin(a0));
    const n1 = new V3().addScaledVector(t1, Math.cos(a1)).addScaledVector(t2, Math.sin(a1));
    const p0 = new V3().copy(a).addScaledVector(n0, r0);
    const p1 = new V3().copy(a).addScaledVector(n1, r0);
    const q0 = new V3().copy(e).addScaledVector(n0, r1);
    const q1 = new V3().copy(e).addScaledVector(n1, r1);
    const u0 = i / sides, u1 = (i + 1) / sides;
    vtx(b, p0, n0, u0, 0, col, sw(p0.y), 0);
    vtx(b, q0, n0, u0, vLen, col, sw(q0.y), 0);
    vtx(b, p1, n1, u1, 0, col, sw(p1.y), 0);
    vtx(b, p1, n1, u1, 0, col, sw(p1.y), 0);
    vtx(b, q0, n0, u0, vLen, col, sw(q0.y), 0);
    vtx(b, q1, n1, u1, vLen, col, sw(q1.y), 0);
  }
}

// Une carte de feuilles, orientée au hasard en 3D (cell : 0 = feuilles ovales, 1 = petites feuilles rondes)
function addCard(b, rnd, c, size, tint, H, center, cell) {
  const ax = new V3(rnd() - 0.5, (rnd() - 0.5) * 0.6, rnd() - 0.5).normalize();
  const ay = new V3(rnd() - 0.5, rnd() * 0.7 + 0.3, rnd() - 0.5);
  ay.addScaledVector(ax, -ay.dot(ax)).normalize();
  const k = 0.8 + rnd() * 0.4;
  const col = [tint[0] * k, tint[1] * k, tint[2] * k];
  const h = size * 0.5;
  const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  const pts = corners.map(function (cn) {
    return new V3().copy(c).addScaledVector(ax, cn[0] * h).addScaledVector(ay, cn[1] * h);
  });
  const u0 = cell * 0.5;
  function put(i) {
    const p = pts[i];
    const n = new V3().subVectors(p, center).normalize();
    n.y = n.y * 0.7 + 0.45;
    n.normalize();
    const sw = Math.pow(Math.max(0, p.y) / H, 1.5) * 0.9 + 0.05;
    vtx(b, p, n, u0 + corners[i][2] * 0.5, corners[i][3], col, sw, 0.8);
  }
  [0, 1, 2, 0, 2, 3].forEach(put);
}

// Touffe de feuillage (buissons) : 3 cartes
function addClump(b, rnd, c, size, tint, H, center) {
  for (let k = 0; k < 3; k++) addCard(b, rnd, c, size, tint, H, center, 0);
}

// Touffe de feuillage : cartes de feuilles groupées
function makeBushGeo() {
  const rnd = prng(99);
  const leaf = newB();
  const center = new V3(0, 0.5, 0);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.9;
    const c = new V3(Math.cos(a) * r, 0.3 + rnd() * 0.6, Math.sin(a) * r);
    addClump(leaf, rnd, c, 1.5 + rnd() * 0.9, [0.9 + rnd() * 0.3, 1.0, 0.85], 3, center);
  }
  return { leaf: toGeo(leaf), H: 3 };
}

// Espèces (toutes feuillues, hautes, sans conifères) : H = hauteur totale, trunkH = hauteur du tronc nu
// cell : 0 = feuilles ovales, 1 = petites feuilles rondes
const SPECIES = {
  oak: {      // chêne : grand, tronc fort, houppier large et aéré
    seed: 11, H: 30, trunkH: 12.5, trunkR: 1.0, crownR: 7.8, branches: 8, branchFrom: 0.62,
    elev: 0.7, lift: 0.25, depth: 3, leafSize: 3.9, leafProb: 0.95, clumps: 3, cell: 0,
    bark: [0.55, 0.5, 0.46], leaf: [0.95, 1.05, 0.9], leader: true
  },
  beech: {    // hêtre : très haut, tronc lisse et gris, houppier ovale
    seed: 29, H: 35, trunkH: 15, trunkR: 0.8, crownR: 5.8, branches: 10, branchFrom: 0.55,
    elev: 0.9, lift: 0.32, depth: 3, leafSize: 3.5, leafProb: 0.85, clumps: 3, cell: 0,
    bark: [0.95, 0.92, 0.9], leaf: [0.85, 1.1, 0.85], leader: true
  },
  birch: {    // bouleau : fin, tronc blanc, petites feuilles
    seed: 37, H: 25, trunkH: 11.5, trunkR: 0.3, crownR: 3.6, branches: 9, branchFrom: 0.5,
    elev: 1.05, lift: 0.45, depth: 3, leafSize: 2.4, leafProb: 0.95, clumps: 3, cell: 1,
    bark: [2.1, 2.05, 1.95], leaf: [1.3, 1.45, 0.95], leader: true
  },
  pop: {      // peuplier : très haut et étroit
    seed: 23, H: 40, trunkH: 17, trunkR: 0.55, crownR: 3.0, branches: 13, branchFrom: 0.35,
    elev: 1.3, lift: 0.6, depth: 2, leafSize: 2.6, leafProb: 1, clumps: 3, cell: 1,
    bark: [0.7, 0.66, 0.6], leaf: [1.0, 1.15, 0.85], leader: true
  },
  maple: {    // érable : rond, feuillage un peu doré
    seed: 41, H: 27, trunkH: 10.5, trunkR: 0.75, crownR: 5.8, branches: 9, branchFrom: 0.55,
    elev: 0.9, lift: 0.3, depth: 3, leafSize: 3.4, leafProb: 0.85, clumps: 3, cell: 0,
    bark: [0.6, 0.55, 0.5], leaf: [1.35, 1.2, 0.6], leader: true
  },
  elm: {      // orme : tronc qui s'ouvre en vase
    seed: 53, H: 33, trunkH: 12, trunkR: 0.85, crownR: 6.6, branches: 8, branchFrom: 0.6,
    elev: 1.05, lift: 0.4, depth: 3, leafSize: 3.4, leafProb: 0.85, clumps: 3, cell: 0,
    bark: [0.58, 0.52, 0.48], leaf: [0.9, 1.1, 0.8], leader: false
  }
};
// Anciens noms (les autres fichiers peuvent encore les utiliser)
SPECIES.dead = SPECIES.maple;

function makeTreeGeos(S) {
  const rnd = prng(S.seed);
  const H = S.H;
  const bark = newB(), leaf = newB();
  const anchors = [];
  const sides = 5;
  const barkCol = S.bark;

  // Tronc légèrement courbe, base évasée
  const segs = 5;
  const lean = new V3((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9);
  const tp = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    tp.push(new V3(lean.x * t * t, -0.4 + (S.trunkH + 0.4) * t, lean.z * t * t));
  }
  for (let i = 0; i < segs; i++) {
    const r0 = S.trunkR * (1 - 0.55 * (i / segs)) * (i === 0 ? 1.35 : 1);
    const r1 = S.trunkR * (1 - 0.55 * ((i + 1) / segs));
    addSeg(bark, tp[i], tp[i + 1], r0, r1, 7, barkCol, H);
  }
  const top = tp[segs].clone();

  function grow(start, dir, len, rad, depth) {
    const end = start.clone().addScaledVector(dir, len);
    const mid = start.clone().addScaledVector(dir, len * 0.5);
    mid.x += (rnd() - 0.5) * len * 0.18;
    mid.y += (rnd() - 0.4) * len * 0.1;
    mid.z += (rnd() - 0.5) * len * 0.18;
    addSeg(bark, start, mid, rad, rad * 0.82, sides, barkCol, H);
    addSeg(bark, mid, end, rad * 0.82, rad * 0.6, sides, barkCol, H);
    if (depth <= 0 || len < 1.3) { anchors.push(end); return; }
    if (rnd() < 0.7) anchors.push(mid.clone().lerp(end, 0.5));
    const kids = depth >= 2 ? 2 : 3;
    for (let k = 0; k < kids; k++) {
      const rv = new V3(rnd() - 0.5, rnd() * 0.5 - 0.05, rnd() - 0.5).normalize();
      const nd = dir.clone().multiplyScalar(0.7).addScaledVector(rv, 0.7).add(new V3(0, S.lift, 0)).normalize();
      const base = k === 0 ? end : start.clone().lerp(end, 0.5 + rnd() * 0.4);
      grow(base, nd, len * (0.58 + rnd() * 0.14), rad * 0.6, depth - 1);
    }
  }

  for (let i = 0; i < S.branches; i++) {
    const a = i * 2.399963 + rnd() * 0.5;
    const f = S.branches > 1 ? i / (S.branches - 1) : 0;
    const y = S.trunkH * (S.branchFrom + (1 - S.branchFrom) * f);
    const tt = y / S.trunkH;
    const start = new V3(lean.x * tt * tt, y, lean.z * tt * tt);
    const el = S.elev + (rnd() - 0.5) * 0.3;
    const dir = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
    grow(start, dir, S.crownR * (0.7 + rnd() * 0.45), S.trunkR * 0.42, S.depth);
  }
  if (S.leader) {
    grow(top, new V3(0.05, 1, 0.03).normalize(), (H - S.trunkH) * 0.5, S.trunkR * 0.38, 3);
  }

  const center = new V3(0, S.trunkH + (H - S.trunkH) * 0.5, 0);
  anchors.forEach(function (p) {
    if (rnd() > S.leafProb) return;
    for (let k = 0; k < S.clumps; k++) {
      const c = p.clone().add(new V3((rnd() - 0.5) * 1.8, (rnd() - 0.35) * 1.4, (rnd() - 0.5) * 1.8));
      addCard(leaf, rnd, c, S.leafSize * (0.75 + rnd() * 0.55), S.leaf, H, center, S.cell || 0);
    }
  });

  const out = { bark: toGeo(bark), leaf: toGeo(leaf), H: H };
  out.trunkR = S.trunkR;
  return out;
}


function noise3(x, y, z) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function makeRockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const rnd = prng(seed);
  const off = rnd() * 50;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const k = 0.78 + 0.42 * noise3(x * 3 + off, y * 3, z * 3);
    pos.setXYZ(i, x / l * k, y / l * k * 0.8, z / l * k);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const snow = nor.getY(i) > 0.4;
    const v = 0.8 + 0.4 * noise3(pos.getX(i) * 5, pos.getY(i) * 5, pos.getZ(i) * 5 + off);
    if (snow) { cols[i * 3] = 0.8; cols[i * 3 + 1] = 0.85; cols[i * 3 + 2] = 0.9; }
    else { cols[i * 3] = 0.3 * v; cols[i * 3 + 1] = 0.29 * v; cols[i * 3 + 2] = 0.28 * v; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeBoundingSphere();
  return g;
}

let VARIANTS = null;
function getVariants() {
  if (VARIANTS) return VARIANTS;
  VARIANTS = {};
  Object.keys(SPECIES).forEach(function (k) { VARIANTS[k] = makeTreeGeos(SPECIES[k]); });
  VARIANTS.bush = makeBushGeo();
  VARIANTS.rock1 = { rock: makeRockGeo(5) };
  VARIANTS.rock2 = { rock: makeRockGeo(17) };
  return VARIANTS;
}

// ==========================================
// PLACEMENT (une seule fois, partagé entre les copies du monde)
// ==========================================
// o : { x0, x1, z0, z1, count, tries, spacing, density(x,z) -> 0..1,
//       height(x,z) -> y, pick(x,z,R) -> nom d'espèce, scaleMin, scaleMax }

export function scatterPoints(R, o) {
  const cell = o.spacing;
  const grid = new Map();
  const key = function (ix, iz) { return ix * 73856093 ^ iz * 19349663; };
  const out = [];
  let tries = 0;
  const maxTries = o.tries || o.count * 14;

  while (out.length < o.count && tries < maxTries) {
    tries++;
    const x = o.x0 + R() * (o.x1 - o.x0);
    const z = o.z0 + R() * (o.z1 - o.z0);
    const d = o.density(x, z);
    if (d <= 0 || R() > d) continue;

    const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
    let ok = true;
    for (let a = -1; a <= 1 && ok; a++) {
      for (let c = -1; c <= 1 && ok; c++) {
        const arr = grid.get(key(ix + a, iz + c));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const dx = arr[i].x - x, dz = arr[i].z - z;
          if (dx * dx + dz * dz < cell * cell) { ok = false; break; }
        }
      }
    }
    if (!ok) continue;

    const y = o.height(x, z);
    const it = {
      x: x, y: y, z: z,
      s: (o.scaleMin || 0.85) + R() * ((o.scaleMax || 1.25) - (o.scaleMin || 0.85)),
      r: R() * Math.PI * 2,
      v: o.pick ? o.pick(x, z, R) : 'oak'
    };
    const k = key(ix, iz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(it);
    out.push(it);
  }
  return out;
}

export function pickSpecies(x, z, R) {
  const t = R();
  if (t < 0.24) return 'oak';
  if (t < 0.46) return 'beech';
  if (t < 0.62) return 'birch';
  if (t < 0.74) return 'pop';
  if (t < 0.88) return 'maple';
  return 'elm';
}

// ==========================================
// CONSTRUCTION DES MESHES (par copie du monde)
// ==========================================
// data : { trees:[{x,y,z,s,r,v}], bushes:[...], rocks:[{x,y,z,s,r,v:'rock1'|'rock2', sy}] }

const CH_DEFAULT = 40;      // taille d'un bloc (m) : plus petit = on dessine moins d'arbres inutiles

export function buildForest(parent, data, opts) {

  opts = opts || {};
  const CH = opts.chunk || CH_DEFAULT;
  const V = getVariants();
  const M = makeMats(opts.boost || 0, opts.cheapLight !== false);

  const group = new THREE.Group();
  parent.add(group);

  // --- répartition par blocs ---
  const chunks = new Map();
  function chunkOf(kind, name, it) {
    const cx = Math.floor(it.x / CH), cz = Math.floor(it.z / CH);
    const key = kind + ':' + name + ':' + cx + ':' + cz;
    let c = chunks.get(key);
    if (!c) { c = { kind: kind, name: name, items: [] }; chunks.set(key, c); }
    c.items.push(it);
  }
  (data.trees || []).forEach(function (t) { chunkOf('tree', t.v, t); });
  (data.bushes || []).forEach(function (t) { chunkOf('bush', 'bush', t); });
  (data.rocks || []).forEach(function (t) { chunkOf('rock', t.v, t); });

  const meshes = [];
  const m4 = new THREE.Matrix4();
  const qq = new THREE.Quaternion();
  const up = new V3(0, 1, 0);
  const pp = new V3();
  const ss = new V3();

  // Géométrie "coque" : mêmes buffers, mais sphère englobante propre au bloc
  function shell(base, sph) {
    const g = new THREE.BufferGeometry();
    g.attributes = base.attributes;
    g.index = base.index;
    g.boundingSphere = sph;
    return g;
  }

  chunks.forEach(function (c) {
    const variant = V[c.name];
    if (!variant) return;
    const n = c.items.length;

    let ax = 0, ay = 0, az = 0;
    c.items.forEach(function (it) { ax += it.x; ay += it.y; az += it.z; });
    ax /= n; ay /= n; az /= n;

    let maxD = 0, maxS = 1;
    c.items.forEach(function (it) {
      maxD = Math.max(maxD, Math.hypot(it.x - ax, it.z - az));
      maxS = Math.max(maxS, it.s || 1);
    });

    const parts = c.kind === 'rock' ? [['rock', M.rock]] :
      c.kind === 'bush' ? [['leaf', M.bush]] :
        [['bark', M.bark], ['leaf', M.leaf]];

    parts.forEach(function (pt) {
      const base = variant[pt[0]];
      if (!base) return;
      const bs = base.boundingSphere;
      const rad = maxD + (bs.radius + Math.hypot(bs.center.x, bs.center.y, bs.center.z)) * maxS * 1.15 + 2;
      const sph = new THREE.Sphere(new V3(ax, ay, az), rad);

      const im = new THREE.InstancedMesh(shell(base, sph), pt[1], n);
      c.items.forEach(function (it, i) {
        qq.setFromAxisAngle(up, it.r || 0);
        if (c.kind === 'rock') ss.set(it.s, it.sy || it.s * 0.7, it.s);
        else ss.set(it.s, it.s, it.s);
        m4.compose(pp.set(it.x, it.y, it.z), qq, ss);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = true;
      group.add(im);
      meshes.push({
        mesh: im, x: ax, z: az,
        cull: c.kind === 'tree' ? (opts.cullTree || 75) : (c.kind === 'bush' ? (opts.cullBush || 45) : (opts.cullRock || 60))
      });
    });
  });

  // --- collisions (cercles, grille de 8 m) ---
  const CELL = 8;
  const hash = new Map();
  function addCol(x, z, r) {
    const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
    let a = hash.get(k);
    if (!a) { a = []; hash.set(k, a); }
    a.push([x, z, r]);
  }
  (data.trees || []).forEach(function (t) {
    addCol(t.x, t.z, Math.max(0.35, (V[t.v].trunkR || 0.5) * t.s * 1.05));
  });
  (data.rocks || []).forEach(function (t) { addCol(t.x, t.z, t.s * 0.85); });

  function collide(x, z, r) {
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const arr = hash.get((cx + a) * 65536 + (cz + b));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            const dx = x - c[0], dz = z - c[1];
            const rr = r + c[2];
            const d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2);
            if (d > 1e-5) {
              x = c[0] + dx / d * rr;
              z = c[1] + dz / d * rr;
            } else {
              x += rr;
            }
          }
        }
      }
    }
    return [x, z];
  }

  let lastFx = 1e9, lastFz = 1e9;

  return {
    group: group,
    collide: collide,
    update: function (time, focus) {
      WIND.uTime.value = time;
      const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
      if (Math.abs(fx - lastFx) < 2 && Math.abs(fz - lastFz) < 2) return;
      lastFx = fx; lastFz = fz;
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        m.mesh.visible = Math.hypot(m.x - fx, m.z - fz) < m.cull + CH;
      }
    }
  };
}
