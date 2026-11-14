import * as THREE from 'three';
import { scatterPoints, pickSpecies } from './forest.js';
import { makeExtraRoads } from './roads.js';
import { SEA, PLACES } from './layout.js';

// ==========================================
// BAD THERAPIST — LA CARTE (places/map.js)
// ==========================================
// Terrain, collines, routes, montagnes, lac : calculés UNE seule fois et partagés par toutes les copies
// de la rue (la vraie + la vue par la fenêtre). Ce fichier est du code déplacé tel quel depuis
// l'ancien immeuble.js (aucune valeur changée). Utilisé par outside.js.
//   getShared() -> le terrain et les routes (SH)
//   WORK_SPOT / HOUSE_POS / TER -> positions et limites du monde

// ==========================================
// TERRAIN, ROUTES ET MONTAGNES (calculés une seule fois, partagés entre toutes les copies)
// ==========================================
// Le repère est celui de l'immeuble : l'immeuble est à z = -29, la route principale part
// de (0, 40) et serpente jusqu'à la maison de travail (work.js) à WORK_SPOT.
// Dans le monde de la chambre (bedroom.js) la rue est décalée de (400, -18.9, 8.8) :
// X:645.87 Y:-17.20 Z:507.18 (monde) = WORK_SPOT (x:245.87, z:498.38) ici.

export const WORK_SPOT = { x: 245.87, z: 498.38 };
export const HOUSE_POS = { x: WORK_SPOT.x, z: WORK_SPOT.z + 10 };   // la maison est juste après la fin de la route
// x0 = -330 : dans le monde de la chambre la rue est décalée de +400 en x, le terrain ne doit pas
// atteindre la chambre, le couloir et le hall (qui sont à x ≈ 0).
// Terrain agrandi vers le sud et l'est pour les nouveaux lieux (montagne, gare, ville B, port)
// x1 = 1060 : l'intérieur de la maison (x > 1100) reste en dehors du terrain.
export const TER = { x0: -290, x1: 1060, z0: -320, z1: 2200, step: 6 };
const LAKE = { x: 300, z: 200, r: 55, y: -1.6, bed: -4.5 };   // lac gelé (loin de toutes les routes)
const FLAT_C = { x: 0, z: -10 };                            // zone plate autour de l'immeuble
export const FAR_Y = -4;                                           // sol lointain (sous le terrain)

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
  return h * flatMask(x, z) * coastFade(z);
}

// Près de la mer (port) les collines s'aplatissent
function coastFade(z) { return 1 - smooth01(1650, 1950, z); }

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
export function getShared() {
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

  // Nouvelles routes (montagne, forêt, gare, port, villes) : voir places/layout.js et places/roads.js
  const X = makeExtraRoads({ sampleRoad, roadProfile, limitSlope, smooth01, fbm2, hillsAt }, { main, cross, lane, drive });
  X.roads.forEach(r => roads.push(r));

  // ---------- 2. Recherche de la route la plus proche ----------

  const CELL = 16;
  const fine = new Map();
  const cellKey = (ix, iz) => (ix + 1000) * 4096 + (iz + 1000);
  const coarse = [];

  roads.forEach(r => r.samples.forEach((p, i) => {
    if (p.span) return;                           // tablier du pont : le terrain passe dessous
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
      const mount = Math.pow(ridge, 1.5) * 230 * smooth01(55, 230, dR) * fm * coastFade(z);

      let nat = -0.06 + (hillsAt(x, z) + mount) * pf;
      // Lac gelé : une plaine douce autour, puis une cuvette
      const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      nat = nat * smooth01(LAKE.r, LAKE.r * 3.2, ld);
      nat = nat + (LAKE.bed - nat) * (1 - smooth01(LAKE.r * 0.55, LAKE.r * 1.05, ld));
      nat = X.shape(nat, x, z);                  // massif, plateaux des lieux, mer
      let h = nat;

      // La route aplanit le terrain autour d'elle (talus progressifs)
      if (nr) {
        const rh = nr.p.y - 0.03 - nr.p.gap;
        const w = 1 - smooth01(nr.p.hw + 1.5, nr.p.hw + 1.5 + (nr.p.wall || 42), nr.d);
        h = nat * (1 - w) + rh * w;
      }
      h = X.sculpt(h, x, z);                     // falaises de la route de montagne

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

  // Tablier du pont : on marche dessus (le terrain est creusé dessous)
  const decks = [];
  roads.forEach(r => r.samples.forEach(p => { if (p.span) decks.push(p); }));
  function deckHeight(x, z) {
    for (let i = 0; i < decks.length; i++) {
      const p = decks[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < 12) {
        const lat = Math.abs(dx * -p.tz + dz * p.tx);
        if (lat < p.hw + 0.6) return p.y + 0.1;
      }
    }
    return null;
  }

  // Hauteur sous les pieds du joueur : chaussée sur la route, terrain ailleurs
  function walkHeight(x, z) {
    let t = terrainH(x, z);
    // L'intérieur de la maison (x > 1100) est un sol plat à y = 0
    if (x > 1100) return 0;
    // Sur le lac, on marche sur la glace
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 0.9) t = Math.max(t, LAKE.y + 0.02);
    const dk = deckHeight(x, z);
    if (dk !== null) return dk;
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
    if (r.kind === 'rail') return;
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

  // Pente du terrain (les arbres ne poussent pas sur les falaises)
  const slopeAt = (x, z) => Math.abs(terrainH(x + 3, z) - terrainH(x, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z));
  // Les lieux (villes, gare, port...) restent libres d'arbres
  const inPlace = (x, z) => X.placeK(x, z) < 1.12;
  const fr = X.byName.forest;
  const forestRoadD = (x, z) => {
    let b = 1e9;
    for (let i = 0; i < fr.samples.length; i += 2) {
      const p = fr.samples[i];
      const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d2 < b) b = d2;
    }
    return Math.sqrt(b);
  };

  const trees = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 2300, tries: 70000, spacing: 7.5,
    scaleMin: 0.85, scaleMax: 1.3,
    height: (x, z) => terrainH(x, z) - 0.15,
    pick: pickSpecies,
    density: (x, z) => {
      if (nearHouse(x, z) < 30 || lakeD(x, z) < LAKE.r * 1.15) return 0;
      if (z > SEA.z0 - 40 || inPlace(x, z)) return 0;
      const y = terrainH(x, z);
      if (y > 125 || y < -3) return 0;
      if (distRoad(x, z) < 9) return 0;
      if (slopeAt(x, z) > 6) return 0;
      return forestDensity(x, z);
    }
  });

  // Forêt sombre et très dense de chaque côté de la route du pont (voir layout.js : route 'forest')
  const darkTrees = scatterPoints(R, {
    x0: 290, x1: 860, z0: 420, z1: 720, count: 1100, tries: 60000, spacing: 4.6,
    scaleMin: 0.95, scaleMax: 1.45,
    height: (x, z) => terrainH(x, z) - 0.15,
    pick: pickSpecies,
    density: (x, z) => {
      const d = forestRoadD(x, z);
      if (d < 7.5 || d > 95) return 0;
      if (distRoad(x, z) < 7.5) return 0;
      if (slopeAt(x, z) > 6) return 0;
      return 0.95 * (1 - smooth01(55, 95, d));
    }
  });
  darkTrees.forEach(t => trees.push(t));

  // Grands arbres près de l'immeuble (à la place des anciens arbres nus)
  [[-9.5, 2, 'oak', 1.15], [10.5, -1, 'oak', 1.2], [-17, -23, 'pop', 1.1],
   [17, -34, 'oak', 1.15], [-31, -12, 'birch', 1.2], [33, -20, 'oak', 1.1]].forEach(m => {
    trees.push({ x: m[0], y: terrainH(m[0], m[1]) - 0.15, z: m[1], s: m[3], r: R() * Math.PI * 2, v: m[2] });
  });

  const bushes = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 1300, tries: 20000, spacing: 3.2, scaleMin: 0.8, scaleMax: 1.5,
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
      if (z > SEA.z0 - 40 || inPlace(x, z) || slopeAt(x, z) > 6) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 28) return 0;
      const y = terrainH(x, z);
      if (y > 110 || y < -3) return 0;
      if (distRoad(x, z) < 5) return 0;
      return 0.12 + 0.88 * smooth01(0.38, 0.6, fbm2(x / 120 + 5.1, z / 120 + 2.3, 3));
    }
  });

  const rocks = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: TER.z1 - 40,
    count: 420, tries: 20000, spacing: 12, scaleMin: 0.8, scaleMax: 3.4,
    height: (x, z) => terrainH(x, z) - 0.25,
    pick: (x, z, rr) => (rr() < 0.5 ? 'rock1' : 'rock2'),
    density: (x, z) => {
      if (nearHouse(x, z) < 26 || lakeD(x, z) < LAKE.r * 1.1) return 0;
      if (z > SEA.z0 - 40 || inPlace(x, z)) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 40) return 0;
      if (distRoad(x, z) < 8) return 0;
      const sl = Math.abs(terrainH(x + 3, z) - terrainH(x, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z));
      return 0.05 + 0.9 * smooth01(0.3, 1.4, sl);
    }
  });
  rocks.forEach(r => { r.sy = r.s * (0.5 + R() * 0.5); });

  // Tracés simplifiés pour la carte
  const mapRoads = roads.map(r => ({
    w: r.kind === 'rail' ? -3 : r.hw * 2,                // largeur négative = voie ferrée (dessinée en pointillés)
    pts: r.samples.filter((p, i) => i % 4 === 0 || i === r.samples.length - 1)
      .map(p => [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10])
  }));

  return {
    roads: roads, main: main, cross: cross, lane: lane, patches: patches.concat(X.patches), X: X, deckHeight: deckHeight,
    terrainGeo: terrainGeo, terrainH: terrainH, walkHeight: walkHeight,
    lumps: lumps, poles: poles, lamps: lamps,
    forestData: { trees: trees, bushes: bushes, rocks: rocks }, mapRoads: mapRoads, lake: LAKE
  };
}

