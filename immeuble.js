import * as THREE from 'three';
import { buildWork } from './work.js';
import { scatterPoints, pickSpecies, buildForest } from './forest.js';
import { createTruck } from './objects/vehicle.js';
import { createTaxi } from './taxi.js';
import { lightPool } from './lightpool.js';

// ==========================================
// TERRAIN, ROUTES ET MONTAGNES (calculés une seule fois, partagés entre toutes les copies)
// ==========================================
// Le repère est celui de l'immeuble : l'immeuble est à z = -29, la route principale part
// de (0, 40) et serpente jusqu'à la maison de travail (work.js) à WORK_SPOT.
// Dans le monde de la chambre (bedroom.js) la rue est décalée de (400, -18.9, 8.8) :
// X:645.87 Y:-17.20 Z:507.18 (monde) = WORK_SPOT (x:245.87, z:498.38) ici.

export const WORK_SPOT = { x: 245.87, z: 498.38 };
const HOUSE_POS = { x: WORK_SPOT.x, z: WORK_SPOT.z + 10 };   // la maison est juste après la fin de la route
// x0 = -330 : dans le monde de la chambre la rue est décalée de +400 en x, le terrain ne doit pas
// atteindre la chambre, le couloir et le hall (qui sont à x ≈ 0).
const TER = { x0: -290, x1: 900, z0: -320, z1: 1000, step: 7 };
const LAKE = { x: 300, z: 200, r: 55, y: -1.6, bed: -4.5 };   // lac gelé (loin de toutes les routes)
const FLAT_C = { x: 0, z: -10 };                            // zone plate autour de l'immeuble
const FAR_Y = -4;                                           // sol lointain (sous le terrain)

function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm2(x, z, oct) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += vnoise(x * f, z * f) * a;
    f *= 2.03; a *= 0.5;
  }
  return v;
}

function smooth01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function prng(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function flatMask(x, z) { return smooth01(80, 210, Math.hypot(x - FLAT_C.x, z - FLAT_C.z)); }
function padFree(x, z) { return smooth01(26, 95, Math.hypot(x - HOUSE_POS.x, z - HOUSE_POS.z)); }

// Collines (jamais plus profondes que le sol lointain)
function hillsAt(x, z) {
  // "rug" : grandes régions plus ou moins accidentées (plaines calmes <-> vallées et crêtes)
  const rug = 0.45 + 0.95 * smooth01(0.38, 0.66, fbm2(x / 380 + 7.7, z / 380 + 3.1, 2));
  let h = (fbm2(x / 150 + 11.3, z / 150 + 4.7, 4) - 0.47) * 58 * rug;
  if (h < 0) h *= 0.2;
  return h * flatMask(x, z);
}

// ---- Routes ----

function sampleRoad(ctrl, hw, name, yoff) {
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal'
  );
  const len = curve.getLength();
  const n = Math.max(4, Math.round(len / 3));
  const pts = curve.getSpacedPoints(n);
  const samples = pts.map((p, i) => ({
    x: p.x, z: p.z, y: 0, gap: 0.5, s: len * i / n, hw: hw, tx: 0, tz: 1
  }));
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    samples[i].tx = dx / l; samples[i].tz = dz / l;
  }
  return { name: name, hw: hw, len: len, yoff: yoff || 0, samples: samples };
}

// Profil en long : hauteur lissée des collines (la route "suit" le terrain)
function roadProfile(road) {
  const S = road.samples, n = S.length, W = 16;
  const raw = S.map(p => hillsAt(p.x, p.z));
  return S.map((p, i) => {
    let a = 0, c = 0;
    for (let k = -W; k <= W; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      a += raw[j]; c++;
    }
    return a / c;
  });
}

// Pente maximale d'une route (7 % : praticable en voiture, même sous la neige)
function limitSlope(S, y, maxSlope) {
  for (let i = 1; i < S.length; i++) {
    const d = (S[i].s - S[i - 1].s) * maxSlope;
    y[i] = Math.max(y[i - 1] - d, Math.min(y[i - 1] + d, y[i]));
  }
  for (let i = S.length - 2; i >= 0; i--) {
    const d = (S[i + 1].s - S[i].s) * maxSlope;
    y[i] = Math.max(y[i + 1] - d, Math.min(y[i + 1] + d, y[i]));
  }
}

function mergeColored(parts) {
  let pc = 0, ic = 0;
  parts.forEach(p => { pc += p.geo.attributes.position.count; ic += p.geo.index.count; });
  const pos = new Float32Array(pc * 3), nor = new Float32Array(pc * 3), col = new Float32Array(pc * 3);
  const idx = new Uint32Array(ic);
  let po = 0, io = 0;
  parts.forEach(p => {
    const g = p.geo, n = g.attributes.position.count;
    pos.set(g.attributes.position.array, po * 3);
    nor.set(g.attributes.normal.array, po * 3);
    for (let i = 0; i < n; i++) {
      col[(po + i) * 3] = p.col[0]; col[(po + i) * 3 + 1] = p.col[1]; col[(po + i) * 3 + 2] = p.col[2];
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po;
    po += n; io += g.index.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

let SHARED = null;
function getShared() {
  if (!SHARED) SHARED = buildShared();
  return SHARED;
}

function buildShared() {

  const R = prng(987654);

  // ---------- 1. Tracés ----------

  const mainCtrl = [
    [0, 40], [0, 80], [-10, 130], [-38, 190], [-52, 250], [-30, 305], [15, 345],
    [75, 372], [140, 380], [195, 400], [232, 428],
    [WORK_SPOT.x, 455], [WORK_SPOT.x, WORK_SPOT.z]
  ];
  const main = sampleRoad(mainCtrl, 6, 'main', 0);

  // Hauteur de la route principale : revient à 0 au départ (immeuble) et à l'arrivée (maison)
  (function () {
    const prof = roadProfile(main);
    const y = prof.map((v, i) => v * smooth01(0, 150, main.len - main.samples[i].s));
    limitSlope(main.samples, y, 0.07);
    main.samples.forEach((p, i) => {
      p.y = y[i];
      p.gap = 0.11 + 0.39 * Math.min(smooth01(0, 120, p.s), smooth01(0, 80, main.len - p.s));
    });
  })();

  // Croisement : route perpendiculaire qui coupe la route principale
  const ci = main.samples.findIndex(p => p.s >= 338);
  const C = main.samples[ci];
  const nrm = { x: -C.tz, z: C.tx };
  const ks = [-170, -85, 0, 85, 170], wob = [-14, 10, 0, -12, 14];
  const cross = sampleRoad(ks.map((k, i) => [
    C.x + nrm.x * k + C.tx * wob[i],
    C.z + nrm.z * k + C.tz * wob[i]
  ]), 6, 'cross', 0.012);

  // Embranchement (T) : petit chemin qui part vers l'est
  const li = main.samples.findIndex(p => p.s >= 150);
  const L = main.samples[li];
  let ld = { x: -L.tz, z: L.tx };
  if (ld.x < 0) ld = { x: -ld.x, z: -ld.z };
  const lp = { x: -ld.z, z: ld.x };
  const ds = [4, 44, 88, 130], lat = [0, 7, -5, 4];
  const lane = sampleRoad(ds.map((d, i) => [
    L.x + ld.x * d + lp.x * lat[i],
    L.z + ld.z * d + lp.z * lat[i]
  ]), 3.5, 'lane', 0.016);

  // Hauteurs des routes secondaires : accrochées à la hauteur de la route principale au carrefour
  function secondaryProfile(road, anchorIdx, anchorY, decay) {
    const prof = roadProfile(road);
    const S = road.samples;
    const delta = anchorY - prof[anchorIdx];
    const y = prof.map((v, i) => v + delta * Math.exp(-Math.abs(S[i].s - S[anchorIdx].s) / decay));
    limitSlope(S, y, 0.07);
    S.forEach((p, i) => { p.y = y[i]; p.gap = 0.5; });
  }
  secondaryProfile(cross, Math.round(cross.samples.length / 2), C.y, 70);
  secondaryProfile(lane, 0, L.y, 60);

  // Allée devant l'immeuble (avant : un simple plan collé au sol, qui "clignotait" en blanc de loin)
  const drive = sampleRoad([[0, -24], [0, 40]], 6, 'drive', 0);
  drive.samples.forEach(p => { p.y = 0; p.gap = 0.11; });

  const roads = [main, cross, lane, drive];

  // ---------- 2. Recherche de la route la plus proche ----------

  const CELL = 16;
  const fine = new Map();
  const cellKey = (ix, iz) => (ix + 1000) * 4096 + (iz + 1000);
  const coarse = [];

  roads.forEach(r => r.samples.forEach((p, i) => {
    const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    let arr = fine.get(k);
    if (!arr) { arr = []; fine.set(k, arr); }
    arr.push(p);
    if (i % 6 === 0) coarse.push(p);
  }));

  function nearestRoad(x, z, maxD) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const rc = Math.ceil(maxD / CELL);
    let best = null, bd = maxD * maxD;
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dz = -rc; dz <= rc; dz++) {
        const arr = fine.get(cellKey(cx + dx, cz + dz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d2 < bd) { bd = d2; best = p; }
        }
      }
    }
    return best ? { p: best, d: Math.sqrt(bd) } : null;
  }

  function coarseDist(x, z) {
    let b = 1e9;
    for (let i = 0; i < coarse.length; i++) {
      const d2 = (coarse[i].x - x) * (coarse[i].x - x) + (coarse[i].z - z) * (coarse[i].z - z);
      if (d2 < b) b = d2;
    }
    return Math.sqrt(b);
  }

  function distRoad(x, z) {
    const r = nearestRoad(x, z, 48);
    return r ? r.d : coarseDist(x, z);
  }

  // ---------- 3. Terrain ----------

  const nx = Math.floor((TER.x1 - TER.x0) / TER.step) + 1;
  const nz = Math.floor((TER.z1 - TER.z0) / TER.step) + 1;
  const H = new Float32Array(nx * nz);

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = TER.x0 + i * TER.step, z = TER.z0 + j * TER.step;
      const nr = nearestRoad(x, z, 46);
      const dR = nr ? nr.d : coarseDist(x, z);
      const pf = padFree(x, z), fm = flatMask(x, z);

      // Montagnes : crêtes lointaines, jamais près de la route
      const m = fbm2(x / 330 + 31.7, z / 330 + 9.2, 5);
      const ridge = Math.max(0, m - 0.40) / 0.57;
      const mount = Math.pow(ridge, 1.5) * 230 * smooth01(55, 230, dR) * fm;

      let nat = -0.06 + (hillsAt(x, z) + mount) * pf;
      // Lac gelé : une plaine douce autour, puis une cuvette
      const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      nat = nat * smooth01(LAKE.r, LAKE.r * 3.2, ld);
      nat = nat + (LAKE.bed - nat) * (1 - smooth01(LAKE.r * 0.55, LAKE.r * 1.05, ld));
      let h = nat;

      // La route aplanit le terrain autour d'elle (talus progressifs)
      if (nr) {
        const rh = nr.p.y - 0.03 - nr.p.gap;
        const w = 1 - smooth01(nr.p.hw + 1.5, 44, nr.d);
        h = nat * (1 - w) + rh * w;
      }

      // Bords de la carte : on redescend vers le sol lointain (invisible dans le brouillard)
      const db = Math.min(x - TER.x0, TER.x1 - x, z - TER.z0, TER.z1 - z);
      h = FAR_Y + (h - FAR_Y) * smooth01(0, 110, db);

      H[j * nx + i] = h;
    }
  }

  function terrainH(x, z) {
    let gx = (x - TER.x0) / TER.step, gz = (z - TER.z0) / TER.step;
    gx = Math.min(nx - 1.001, Math.max(0, gx));
    gz = Math.min(nz - 1.001, Math.max(0, gz));
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  // Hauteur sous les pieds du joueur : chaussée sur la route, terrain ailleurs
  function walkHeight(x, z) {
    let t = terrainH(x, z);
    // L'intérieur de la maison (x > 1100) est un sol plat à y = 0
    if (x > 1100) return 0;
    // Sur le lac, on marche sur la glace
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 0.9) t = Math.max(t, LAKE.y + 0.02);
    const nr = nearestRoad(x, z, 12);
    if (!nr) return t;
    const surf = nr.p.y - 0.03 + nr.p.yoffR;
    const k = 1 - smooth01(nr.p.hw - 0.3, nr.p.hw + 1.6, nr.d);
    return t + (surf - t) * k;
  }
  roads.forEach(r => r.samples.forEach(p => { p.yoffR = r.yoff; }));

  // Géométrie du terrain
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = TER.x0 + i * TER.step;
      pos[k * 3 + 1] = H[k];
      pos[k * 3 + 2] = TER.z0 + j * TER.step;
      uv[k * 2] = pos[k * 3] / 8.06;
      uv[k * 2 + 1] = pos[k * 3 + 2] / 8.06;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  terrainGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  terrainGeo.computeVertexNormals();

  // Couleur : neige claire à plat, roche sombre sur les pentes raides
  const nor = terrainGeo.attributes.normal.array;
  const colArr = new Float32Array(nx * nz * 3);
  for (let k = 0; k < nx * nz; k++) {
    const steep = 1 - smooth01(0.55, 0.92, nor[k * 3 + 1]);
    const gi = k % nx, gj = Math.floor(k / nx);
    const gx = TER.x0 + gi * TER.step, gz = TER.z0 + gj * TER.step;
    const patch = 0.88 + 0.24 * fbm2(gx / 38 + 3.3, gz / 38 + 8.1, 2);
    const shade = (1 - 0.58 * steep) * patch;
    colArr[k * 3] = shade; colArr[k * 3 + 1] = shade * 1.01; colArr[k * 3 + 2] = shade * 1.03;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

  // ---------- 4. Routes (rubans qui suivent le terrain) ----------

  function roadGeometry(r) {
    const S = r.samples, n = S.length;
    const p = new Float32Array(n * 2 * 3), t = new Float32Array(n * 2 * 2), nm = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const s = S[i];
      const ox = -s.tz * s.hw, oz = s.tx * s.hw;
      const y = s.y - 0.03 + r.yoff;
      p.set([s.x + ox, y, s.z + oz, s.x - ox, y, s.z - oz], i * 6);
      t.set([0, s.s / 12, 1, s.s / 12], i * 4);
      nm.set([0, 1, 0, 0, 1, 0], i * 6);
    }
    const ix = new Uint32Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      ix.set([a, c, b, b, c, d], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(t, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    return g;
  }
  roads.forEach(r => { r.geo = roadGeometry(r); });

  // Plaques d'asphalte pour les carrefours
  const patches = [
    { x: C.x, z: C.z, y: C.y - 0.03 + 0.03, r: 8.8 },
    { x: L.x, z: L.z, y: L.y - 0.03 + 0.03, r: 7.4 }
  ];

  // ---------- 5. Décor le long des routes ----------

  const junctions = [C, L];
  const nearJunction = (x, z) => junctions.some(j => Math.hypot(x - j.x, z - j.z) < 10.5);

  const lumps = [], poles = [];
  roads.forEach(r => {
    let s = 4;
    while (s < r.len - 2) {
      const p = r.samples[Math.min(r.samples.length - 1, Math.round(s / 3))];
      for (const side of [-1, 1]) {
        const off = p.hw + 0.3 + (R() - 0.5) * 0.5;
        const x = p.x + -p.tz * side * off, z = p.z + p.tx * side * off;
        if (nearJunction(x, z)) continue;
        const h = 0.28 + R() * 0.3;
        lumps.push({ x: x, y: p.y - 0.12 + h * 0.3, z: z, w: 0.55 + R() * 0.4, h: h, d: 0.9 + R() * 0.7 });
      }
      s += 4.5 * (0.8 + R() * 0.5);
    }
    // Balises de bord de route
    for (s = 20; s < r.len - 6; s += 35) {
      const p = r.samples[Math.min(r.samples.length - 1, Math.round(s / 3))];
      for (const side of [-1, 1]) {
        const off = p.hw + 1.2;
        const x = p.x + -p.tz * side * off, z = p.z + p.tx * side * off;
        if (nearJunction(x, z)) continue;
        poles.push({ x: x, y: p.y - 0.13, z: z });
      }
    }
  });

  // Lampadaires sans lumière réelle (juste un halo) : carrefours + arrivée
  const lamps = [];
  function lampBeside(p, side, off) {
    lamps.push({ x: p.x + -p.tz * side * off, y: p.y - 0.1, z: p.z + p.tx * side * off, side: side, tx: p.tx, tz: p.tz });
  }
  lampBeside(C, 1, 10); lampBeside(C, -1, 10);
  lampBeside(L, 1, 10);
  const endP = main.samples[main.samples.length - 1];
  const nearEnd = main.samples[Math.max(0, main.samples.length - 12)];
  lampBeside(endP, 1, 8); lampBeside(nearEnd, -1, 8);
  lampBeside(main.samples[Math.round(main.samples.length * 0.62)], 1, 8);
  lampBeside(main.samples[Math.round(main.samples.length * 0.3)], -1, 8);

  // ---------- 6. Forêt, buissons, rochers (placés une seule fois) ----------

  const nearHouse = (x, z) => Math.hypot(x - HOUSE_POS.x, z - HOUSE_POS.z);
  const lakeD = (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z);

  // Forêts denses par taches, grandes plaines presque vides, quelques arbres isolés
  function forestDensity(x, z) {
    const f = smooth01(0.40, 0.62, fbm2(x / 120 + 5.1, z / 120 + 2.3, 3));
    const plain = 1 - 0.88 * smooth01(0.60, 0.74, fbm2(x / 300 + 60.3, z / 300 + 14.7, 2));
    const court = smooth01(34, 95, Math.hypot(x - FLAT_C.x, z - FLAT_C.z));
    return Math.max(0.035, f * plain) * court;
  }

  const trees = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 1500, tries: 36000, spacing: 7.5,
    scaleMin: 0.85, scaleMax: 1.3,
    height: (x, z) => terrainH(x, z) - 0.15,
    pick: pickSpecies,
    density: (x, z) => {
      if (nearHouse(x, z) < 30 || lakeD(x, z) < LAKE.r * 1.15) return 0;
      const y = terrainH(x, z);
      if (y > 125 || y < -3) return 0;
      if (distRoad(x, z) < 9) return 0;
      return forestDensity(x, z);
    }
  });

  // Grands arbres près de l'immeuble (à la place des anciens arbres nus)
  [[-9.5, 2, 'oak', 1.15], [10.5, -1, 'oak', 1.2], [-17, -23, 'pop', 1.1],
   [17, -34, 'oak', 1.15], [-31, -12, 'birch', 1.2], [33, -20, 'oak', 1.1]].forEach(m => {
    trees.push({ x: m[0], y: terrainH(m[0], m[1]) - 0.15, z: m[1], s: m[3], r: R() * Math.PI * 2, v: m[2] });
  });

  const bushes = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 900, tries: 12000, spacing: 3.2, scaleMin: 0.8, scaleMax: 1.5,
    height: (x, z) => {
      let h = terrainH(x, z);
      for (let k = 0; k < 6; k++) {                       // le sol sous toute la largeur du buisson (pente)
        const a = k * Math.PI / 3;
        h = Math.min(h, terrainH(x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5));
      }
      return h - 0.12;
    },
    pick: () => 'bush',
    density: (x, z) => {
      if (nearHouse(x, z) < 24 || lakeD(x, z) < LAKE.r * 1.1) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 28) return 0;
      const y = terrainH(x, z);
      if (y > 110 || y < -3) return 0;
      if (distRoad(x, z) < 5) return 0;
      return 0.12 + 0.88 * smooth01(0.38, 0.6, fbm2(x / 120 + 5.1, z / 120 + 2.3, 3));
    }
  });

  const rocks = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 260, tries: 12000, spacing: 12, scaleMin: 0.8, scaleMax: 3.4,
    height: (x, z) => terrainH(x, z) - 0.25,
    pick: (x, z, rr) => (rr() < 0.5 ? 'rock1' : 'rock2'),
    density: (x, z) => {
      if (nearHouse(x, z) < 26 || lakeD(x, z) < LAKE.r * 1.1) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 40) return 0;
      if (distRoad(x, z) < 8) return 0;
      const sl = Math.abs(terrainH(x + 3, z) - terrainH(x, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z));
      return 0.05 + 0.9 * smooth01(0.3, 1.4, sl);
    }
  });
  rocks.forEach(r => { r.sy = r.s * (0.5 + R() * 0.5); });

  // Tracés simplifiés pour la carte
  const mapRoads = roads.map(r => ({
    w: r.hw * 2,
    pts: r.samples.filter((p, i) => i % 4 === 0 || i === r.samples.length - 1)
      .map(p => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10])
  }));

  return {
    roads: roads, main: main, cross: cross, lane: lane, patches: patches,
    terrainGeo: terrainGeo, terrainH: terrainH, walkHeight: walkHeight,
    lumps: lumps, poles: poles, lamps: lamps,
    forestData: { trees: trees, bushes: bushes, rocks: rocks }, mapRoads: mapRoads, lake: LAKE
  };
}


export function buildWorld(scene, ctx = {}) {

const { camera, renderer } = ctx;

// Lieu extérieur : on active la neige (désactivée par défaut dans world_base.html)
if (ctx.snow) ctx.snow.setEnabled(true);

// Copie de la rue vue depuis bedroom.js : peu de lumières globales, on éclaire un peu le sol
const BOOST = 0;          // (nightBoost de la chambre ignoré : la vue par la fenêtre doit être identique à la rue)
const EM = 0.25;          // lueur propre des matériaux de la rue : presque nulle, c'est la lumière qui éclaire
const SH = getShared();

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
  snow: new THREE.MeshStandardMaterial({ color: 0xc2cad0, roughness: 0.92, emissive: new THREE.Color(0x161c20).multiplyScalar(BOOST) }),
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
const snowMap = makeTex(snowCv, 1, 1, true);     // le terrain a des UV en mètres / 8.06
const snowBump = makeTex(snowCv, 1, 1, false);

// Sol lointain (noyé dans le brouillard), sous le terrain
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshStandardMaterial({ color: 0x8a949a, roughness: 0.95 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.set(0, FAR_Y - 0.1, 0);
scene.add(farGround);

// Terrain : plat autour de l'immeuble, puis collines et montagnes.
// Il suit la route jusqu'à la maison de travail (voir buildShared).
const ground = new THREE.Mesh(
  SH.terrainGeo,
  new THREE.MeshStandardMaterial({
    color: 0xb4bdc4,
    map: snowMap,
    bumpMap: snowBump,
    bumpScale: 1.2,
    roughness: 0.93,
    vertexColors: true,
    emissive: new THREE.Color(0x0c1114).multiplyScalar(EM)
  })
);
scene.add(ground);

// ==========================================
// 5. ROUTE DÉNEIGÉE (allée vers l'immeuble)
// ==========================================

function roadCanvas() {
  const S = 256;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(40,47,60)';
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
    g.fillStyle = 'rgb(150,166,190)';
    g.fillRect(0, y, wl, 2);
    g.fillRect(S - wr, y, wr, 2);
  }

  // Grain d'asphalte
  for (let i = 0; i < 5000; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.07})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }

  // Ligne centrale discontinue, à moitié recouverte de neige
  g.fillStyle = 'rgba(205,195,120,0.30)';
  for (let y = 0; y < S; y += 64) g.fillRect(S / 2 - 2, y + 8, 4, 34);
  return c;
}

const roadCv = roadCanvas();
const roadEmissive = new THREE.Color(0x14181b).multiplyScalar(EM * 0.6);

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

const lumpGeo = new THREE.SphereGeometry(1, 10, 6);
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

// ==========================================
// 13. ROUTE JUSQU'AU TRAVAIL, DÉCOR, SAPINS ET MAISON
// ==========================================

// Matériaux de la route prolongée (même texture que l'allée devant l'immeuble)
const roadMat2 = new THREE.MeshStandardMaterial({
  map: makeTex(roadCv, 1, 1, true), color: 0xa8b4c8, roughness: 0.85, emissive: roadEmissive,
  polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -40
});
SH.roads.forEach(r => {
  const m = new THREE.Mesh(r.geo, roadMat2);
  m.frustumCulled = false;
  m.renderOrder = 1;                       // dessinée après le terrain
  scene.add(m);
});

// Carrefours : une plaque d'asphalte unie par-dessus les deux routes
const patchMat = new THREE.MeshStandardMaterial({
  color: 0x2c3342, roughness: 0.9, emissive: roadEmissive,
  polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -60
});
SH.patches.forEach(p => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28), patchMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(p.x, p.y + 0.012, p.z);
  scene.add(m);
});

// Neige repoussée le long des routes
makeInstanced(lumpGeo, mats.snow, SH.lumps.map(l => item(l.x, l.y, l.z, l.w, l.h, l.d)), scene);

// Balises de bord de route (poteau + réflecteur rouge)
const poleItems = [], reflItems = [];
SH.poles.forEach(p => {
  poleItems.push(item(p.x, p.y + 0.75, p.z, 0.08, 1.5, 0.08));
  reflItems.push(item(p.x, p.y + 1.38, p.z, 0.11, 0.2, 0.11));
});
makeInstanced(unitBox, mats.metal, poleItems, scene);
makeInstanced(unitBox, new THREE.MeshBasicMaterial({ color: disp(0.8, 0.12, 0.08) }), reflItems, scene);

// Lampadaires de route (halo seulement : visibles de loin, sans lumière réelle)
SH.lamps.forEach(l => {
  const g = new THREE.Group();
  g.position.set(l.x, l.y, l.z);
  scene.add(g);
  // Le bras se penche toujours au-dessus de la route, quelle que soit sa direction
  const toX = l.side * l.tz, toZ = -l.side * l.tx;
  g.rotation.y = Math.atan2(-toZ, toX);
  const dir = 1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 5.6, 7), mats.metal);
  pole.position.y = 2.8;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6), mats.metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(dir * 0.5, 5.5, 0);
  g.add(arm);
  box(g, 0.44, 0.14, 0.24, mats.metal, dir * 1.0, 5.4, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.18), new THREE.MeshBasicMaterial({ color: 0xe7c99e }));
  bulb.position.set(dir * 1.0, 5.3, 0);
  g.add(bulb);
  glowSprite(g, dir * 1.0, 5.2, 0, 0xffa860, 4.6, 0.5);
});

// Forêt : grands arbres feuillus, buissons et rochers qui bougent avec le vent (forest.js)
const forest = buildForest(scene, SH.forestData, { boost: BOOST, cheapLight: false, chunk: 40, cullTree: 75, cullBush: 45, cullRock: 60 });

// Phares : UNE seule vraie lumière, que le camion ou le taxi prend quand on monte dedans
const headlight = (ctx.driveCamera || ctx.camera) ? new THREE.SpotLight(0xffe6c0, 0, 60, 0.6, 0.5, 1.1) : null;
if (headlight) {
  headlight.userData.keep = true;
  scene.add(headlight);
}

// ==========================================
// LAMPE TORCHE (objet) : touche F ou bouton 🔦 pour la sortir / la ranger
// ==========================================
// Dehors il fait noir : seules les vraies sources de lumière éclairent (lampadaires, porche, phares, torche).
const torch = (ctx.driveCamera || ctx.camera) ? new THREE.SpotLight(0xfff0d8, 0, 40, 0.5, 0.45, 1.3) : new THREE.Object3D();
if (torch.isSpotLight) {
  torch.userData.keep = true;
  scene.add(torch);
  scene.add(torch.target);
}

const torchModel = new THREE.Group();
(function () {
  const dark = new THREE.MeshBasicMaterial({ color: 0x1a1c1f });
  const metal = new THREE.MeshBasicMaterial({ color: 0x3a3f45 });
  const lens = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.2, 10), dark);
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.034, 0.07, 12), metal);
  head.rotation.x = Math.PI / 2;
  head.position.z = -0.135;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.044, 12), lens);
  glass.position.z = -0.172;
  glass.rotation.y = Math.PI;
  torchModel.add(body, head, glass);
})();
torchModel.visible = false;
torchModel.traverse(function (o) { o.frustumCulled = false; });
scene.add(torchModel);

let torchWanted = false, torchLevel = 0, torchBtn = null;
const _tq = new THREE.Vector3(), _tf = new THREE.Vector3();
const TORCH_POWER = 3.0;

function torchAllowed() {
  if (!playerCam) return false;
  const lx = playerCam.position.x - scene.position.x, lz = playerCam.position.z - scene.position.z;
  const outdoors = lx > TER.x0 && lx < TER.x1 && lz > TER.z0 && lz < TER.z1;
  return outdoors && !(truck && truck.isDriving()) && !(taxi && taxi.isRiding());
}

function toggleTorch() {
  if (!torchAllowed()) return;
  torchWanted = !torchWanted;
}

let torchUi = false;
function ensureTorchUi() {
  if (torchUi || !playerCam || typeof document === 'undefined') return;
  torchUi = true;
  const css = document.createElement('style');
  css.textContent = '.bt-torch{position:fixed;right:14px;bottom:42%;width:54px;height:54px;border-radius:50%;' +
    'border:2px solid rgba(255,220,160,.5);background:rgba(20,18,16,.6);color:#ffe2b0;font-size:24px;line-height:1;' +
    'z-index:50;touch-action:manipulation;display:none;padding:0}.bt-torch.on{background:rgba(255,200,120,.38)}';
  document.head.appendChild(css);
  torchBtn = document.createElement('button');
  torchBtn.className = 'bt-torch';
  torchBtn.textContent = '🔦';
  torchBtn.setAttribute('aria-label', 'Lampe torche');
  const press = function (e) { e.preventDefault(); e.stopPropagation(); toggleTorch(); };
  torchBtn.addEventListener('touchstart', press, { passive: false });
  torchBtn.addEventListener('click', press);
  document.body.appendChild(torchBtn);
  addEventListener('keydown', function (e) {
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || e.repeat) return;
    if (e.key === 'f' || e.key === 'F') toggleTorch();
  });
}

function updateTorch(dt, time) {
  if (!playerCam) return;
  ensureTorchUi();
  const ok = torchAllowed();
  if (!ok) torchWanted = false;                     // dedans, en voiture : la torche est rangée
  if (torchBtn) {
    torchBtn.style.display = ok ? 'block' : 'none';
    torchBtn.classList.toggle('on', torchWanted);
  }
  torchLevel += ((torchWanted ? 1 : 0) - torchLevel) * Math.min(1, dt * 14);
  torchModel.visible = torchWanted;
  torch.intensity = TORCH_POWER * torchLevel * (0.97 + 0.03 * Math.sin(time * 17) * Math.sin(time * 5.3));
  if (!torchWanted && torchLevel < 0.01) return;

  const q = playerCam.quaternion;
  const cx = playerCam.position.x - scene.position.x, cy = playerCam.position.y - scene.position.y, cz = playerCam.position.z - scene.position.z;
  _tq.set(0.2, -0.2, -0.38).applyQuaternion(q);                 // dans la main droite, un peu en bas
  _tf.set(0, 0.02, -1).applyQuaternion(q);
  torch.position.set(cx + _tq.x, cy + _tq.y, cz + _tq.z);
  torch.target.position.set(cx + _tq.x + _tf.x * 10, cy + _tq.y + _tf.y * 10, cz + _tq.z + _tf.z * 10);
  torchModel.position.copy(torch.position);
  torchModel.quaternion.copy(q);
}

// Lac gelé
const ice = new THREE.Mesh(
  new THREE.CircleGeometry(SH.lake.r * 0.97, 56),
  new THREE.MeshStandardMaterial({
    color: 0x9fb6c4, roughness: 0.28, metalness: 0.15,
    emissive: new THREE.Color(0x10171c).multiplyScalar(EM)
  })
);
ice.rotation.x = -Math.PI / 2;
ice.position.set(SH.lake.x, SH.lake.y, SH.lake.z);
scene.add(ice);

const getFocus = ctx.getFocus || (camera
  ? function () { return { x: camera.position.x, z: camera.position.z }; }
  : function () { return { x: 0, z: -24 }; });

// Maison de travail (work.js), au bout de la route
const workY = SH.terrainH(HOUSE_POS.x, HOUSE_POS.z) + 0.02;
const playerCam = ctx.driveCamera || ctx.camera;
if (playerCam) {
  console.log('[BT] rue construite', { camera: !!playerCam, action: !!ctx.action, view: !!ctx.view, input: !!ctx.input });
  if (!ctx.action) console.warn('[BT] ctx.action est absent : world_base.html est probablement une ANCIENNE version (pas de bouton ENTER/EXIT).');
}
const work = buildWork(scene, {
  x: HOUSE_POS.x, z: HOUSE_POS.z, y: workY, light: ctx.workLight !== false,
  // Intérieur (seulement dans le vrai monde, pas dans la copie de la fenêtre)
  interior: !!playerCam,
  camera: playerCam,
  origin: { x: scene.position.x, y: scene.position.y, z: scene.position.z },
  action: ctx.action, view: ctx.view, snow: ctx.snow,
  onTeleport: function () { walkY = null; if (ctx.onTeleport) ctx.onTeleport(); },
  isBusy: function () { return !!(truck && truck.isDriving()) || !!(taxi && taxi.isRiding()); }
});

// Hauteur du joueur sur les collines (seulement si le monde nous donne la caméra)
let walkY = null;

// Le camion (un seul véhicule). Créé seulement si le monde nous donne la caméra de conduite.
let truck = null;
let taxi = null;
if (ctx.driveCamera) {
  const org = { x: scene.position.x, y: scene.position.y, z: scene.position.z };
  const truckRects = [{ x0: -12.2, x1: 12.2, z0: -34.4, z1: -24.2 }].concat(work.colliders);
  truck = createTruck(scene, {
    x: 3.8, z: -9.5, heading: Math.PI,
    origin: org,
    camera: ctx.driveCamera, input: ctx.input, view: ctx.view, action: ctx.action,
    headlight: headlight,
    groundH: SH.walkHeight,
    collide: forest.collide,
    rects: truckRects,
    bounds: { x0: TER.x0 + 30, x1: TER.x1 - 30, z0: TER.z0 + 30, z1: TER.z1 - 30 },
    snow: ctx.snow,
    onExit: function () { walkY = null; if (ctx.onTruckExit) ctx.onTruckExit(); }
  });

  // Le taxi d'Oliver : garé près du camion, fait la navette immeuble <-> maison d'Evelyn (taxi.js)
  taxi = createTaxi(scene, {
    origin: org,
    camera: ctx.driveCamera, view: ctx.view, action: ctx.action,
    renderer: renderer,
    headlight: headlight,
    groundH: SH.walkHeight,
    road: SH.main,
    rects: truckRects,
    truck: truck,
    snow: ctx.snow,
    onExit: function () { walkY = null; if (ctx.onTruckExit) ctx.onTruckExit(); }
  });
}



// ==========================================
// 12. UPDATE
// ==========================================

return {

  // Pour bedroom.js : le corps de l'immeuble, ce qu'il faut masquer vu de l'intérieur,
  // la hauteur du sol et les collisions de la maison
  main: main,
  entranceMeshes: [entranceTrim, entranceGlow, entranceHandle],
  walkHeight: SH.walkHeight,
  terrainHeight: SH.terrainH,
  colliders: work.colliders,
  workSpot: WORK_SPOT,
  work: work,
  controlsHeight: !!camera,
  collideTrees: forest.collide,
  setEntrance: setEntrance,
  truck: truck,
  taxi: taxi,
  isDriving: function () { return !!(truck && truck.isDriving()) || !!(taxi && taxi.isRiding()); },
  getMapData: function () {
    return {
      bounds: { x0: TER.x0, x1: TER.x1, z0: TER.z0, z1: TER.z1 },
      roads: SH.mapRoads,
      lakes: [{ x: SH.lake.x, z: SH.lake.z, r: SH.lake.r }],
      pois: [
        { type: 'work', x: WORK_SPOT.x, z: WORK_SPOT.z, label: 'WORK' },
        { type: 'home', x: 0, z: -29, label: 'HOME' }
      ],
      truck: truck ? truck.getPose() : null
    };
  },

  update(dt, time) {

    updateTorch(dt, time);

    // Maison de travail (fumée, fenêtre qui vacille)
    work.update(dt, time);

    // Forêt (vent) : seuls les blocs proches du joueur sont dessinés
    forest.update(time, getFocus());
    
    // Piloté par bedroom.js (pas de ctx.camera) : le taxi se met à jour ici (le camion est appelé par bedroom.js)
    if (!camera && taxi) taxi.update(dt, true);

    // Autonome (immeuble.js / work.js) : on suit le relief, on contourne les arbres, on conduit
    if (camera) {
      const riding = !!(taxi && taxi.isRiding());
      if (truck) truck.update(dt, !riding);
      if (taxi) taxi.update(dt, true);
      
      if (!(truck && truck.isDriving()) && !riding) {
        const tc = forest.collide(camera.position.x, camera.position.z, 0.3);
        camera.position.x = tc[0];
        camera.position.z = tc[1];
        const target = 1.7 + SH.walkHeight(camera.position.x, camera.position.z);
        walkY = walkY === null ? target : walkY + (target - walkY) * Math.min(1, dt * 9);
        camera.position.y = walkY;
        if (ctx.snow) ctx.snow.setBaseY(walkY - 1.7);
      }
    }
   

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
