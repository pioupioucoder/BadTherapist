import * as THREE from 'three';
import { scatterPoints, pickSpecies } from './forest.js';

// ==========================================
// ILLUSION — LE MONDE (places/monde.js)
// ==========================================
// Ce fichier remplace : layout.js + map.js + roads.js + objects/roadnet.js
//
//   PARTIE 1 : DONNÉES      -> où sont les lieux, les routes, la mer, les arrêts de taxi (ex layout.js)
//   PARTIE 2 : TERRAIN      -> collines, routes principales, forêt, lac (ex map.js)
//   PARTIE 3 : ROUTES AJOUTÉES -> montagne, gare, port, villes, voie ferrée (ex roads.js)
//   PARTIE 4 : ITINÉRAIRES  -> le chemin que suivent le bus, la police et le taxi (ex roadnet.js)
//
// Pour ajouter un lieu ou une route : on ne touche qu'à ce fichier (PARTIE 1).

// ==========================================
// PARTIE 1 — DONNÉES (ex layout.js)
// ==========================================
// Le repère est celui de l'immeuble (l'immeuble est à z = -29, la route principale part vers +z).
//
//   town    : ville de montagne (journaux, basilique, magasin...)   -> par la route de montagne
//   gas     : station-service, sur une route à part
//   station : petite gare au bord du pont (train vers la ville B), au bout de la route de la forêt
//   cityB   : ville avec bibliothèque, police et prison (accessible seulement en train)
//   port    : port, tout au sud, au bout d'une autre route

export const SEA = { z0: 2015, y: -1.3, floor: -9 };       // la mer commence à z = SEA.z0

export const PLACES = {
  gas: { x: 345, z: 335, r: 60 },
  town: { x: 0, z: 1565, r: 150 },
  station: { x: 925, z: 905, r: 75 },
  cityB: { x: 790, z: 1800, r: 150 },
  port: { x: 450, z: 1975, r: 100 },
  school: { x: -63.82, z: -5250.58, r: 70 },      // lycée Jean Dumont (portail), voir SCHOOL_Y et places/highschool.js
  schoolground: { x: -63.82, z: -5250.58 - 78, r: 200 }   // plateau plat sous tout le lycée (centre de la pelouse) : pas un vrai lieu
};

// Lycée : le portail est à (336.18, -19.52, -5241.78) dans le monde de la chambre ; la rue y est décalée de (400, -18.9, 8.8).
// Repère de la rue : x = -63.82, z = -5250.58, sol à y = -19.52 - 1.7 + 18.9 = -2.32
// (20 fois plus loin que l'immeuble : le lycée est un MONDE À PART, avec son sol, sa flore et son ciel)
export const SCHOOL_Y = -2.32;
// La pelouse du lycée (highschool.js : 200 × 330 m, centrée 78 m derrière le portail)
export const SCHOOL_C = { x: -63.82, z: -5250.58 - 78 };
export const SCHOOL_HALF = { x: 100, z: 165 };
// Zone occupée par le lycée + 150 m autour : aucun arbre, buisson ni rocher du monde de l'immeuble dedans
export const SCHOOL_BOX = { x0: SCHOOL_C.x - SCHOOL_HALF.x - 150, x1: SCHOOL_C.x + SCHOOL_HALF.x + 150, z0: SCHOOL_C.z - SCHOOL_HALF.z - 150, z1: SCHOOL_C.z + SCHOOL_HALF.z + 150 };
// distance à la pelouse (0 dedans) : sert à baisser le terrain dessous et à le verdir autour
function schoolDist(x, z) {
  const dx = Math.max(0, Math.abs(x - SCHOOL_C.x) - SCHOOL_HALF.x), dz = Math.max(0, Math.abs(z - SCHOOL_C.z) - SCHOOL_HALF.z);
  return Math.hypot(dx, dz);
}

// Massif de montagne (autour de la route de montagne)
export const MASSIF = { x: -10, z: 980, rx: 280, rz: 520, height: 118 };

// Routes ajoutées. Le premier point de chaque route est pris sur la route "from" (jonction automatique).
//   kind : 'road' (route normale), 'mountain' (route de falaise), 'street' (rue de ville), 'rail' (voie ferrée)
export const ROAD_DEFS = [
  // Station-service : prolonge le petit chemin de l'est
  {
    name: 'gas', kind: 'road', hw: 4.5, from: { road: 'lane', end: true },
    ctrl: [[140, 276], [208, 302], [280, 322], [345, 335]], site: 'gas'
  },

  // Route de montagne : longue montée en lacets doux, falaise à droite (à l'ouest) sans aucun rebord
  {
    name: 'mount', kind: 'mountain', hw: 4.2, from: { road: 'cross', end: true },
    ctrl: [
      [-62, 585], [-30, 665], [-95, 735], [-135, 810], [-60, 880], [10, 935], [-55, 1010],
      [-120, 1085], [-55, 1160], [20, 1215], [-40, 1290], [-110, 1345], [-60, 1410],
      [-8, 1455], [0, 1500], [0, 1560], [0, 1620], [0, 1685]
    ],
    site: 'town', peak: 78, cliffFrom: 140, cliffTo: 1300
  },
  // Rue transversale de la ville de montagne
  { name: 'townx', kind: 'street', hw: 6, flat: 'town', ctrl: [[-110, 1595], [-50, 1595], [0, 1595], [60, 1595], [110, 1595]] },

  // Route de la forêt sombre, jusqu'au pont et à la gare
  {
    name: 'forest', kind: 'road', hw: 4.5, from: { road: 'main', s: 560 },
    ctrl: [
      [300, 478], [372, 508], [462, 500], [560, 505], [648, 545], [738, 606], [815, 648],
      [872, 662], [915, 690], [930, 770], [932, 850], [928, 905]
    ],
    site: 'station', bridge: { half: 24, hump: 2.6 }
  },

  // Voie ferrée : sous le pont, puis jusqu'à la ville B
  {
    name: 'rail', kind: 'rail', hw: 2.4, wall: 11,
    ctrl: [[868, 150], [866, 300], [870, 450], [872, 560], [871, 662], [876, 780], [882, 900], [884, 1050], [876, 1250], [862, 1500], [852, 1700], [850, 1830]],
    trench: { near: [871, 662], depth: 6.6 }
  },

  // Route du port (part de la route de la forêt)
  {
    name: 'port', kind: 'road', hw: 4.5, from: { road: 'forest', near: [560, 505] },
    ctrl: [
      [548, 600], [510, 720], [468, 850], [474, 990], [452, 1130], [425, 1270], [455, 1410],
      [492, 1550], [468, 1690], [440, 1820], [450, 1900], [450, 1975]
    ],
    site: 'port'
  },
  { name: 'portx', kind: 'street', hw: 6, flat: 'port', ctrl: [[370, 1975], [410, 1975], [450, 1975], [490, 1975], [530, 1975]] },

  // Route du lycée : part de l'allée devant l'immeuble, contourne l'immeuble par l'ouest et monte tout droit jusqu'au portail
  {
    name: 'school', kind: 'road', hw: 4.5, from: { road: 'drive', s: 30 },
    ctrl: (function () {      // ~5,2 km vers le nord, en courbes douces, puis ligne droite jusqu'au portail
      const c = [[-38, -2], [-56, -55], [-62, -125], [-61, -200], [-64, -255]];
      const GZ = -5250.58;
      for (let z = -400; z > GZ + 120; z -= 150) {
        const amp = 34 * Math.min(1, (-z - 300) / 700) * Math.min(1, (z - GZ) / 900);
        c.push([-62 + amp * Math.sin(z / 610) + amp * 0.5 * Math.sin(z / 233 + 1.3), z]);
      }
      c.push([-63.82, GZ + 90], [-63.82, GZ + 40], [-63.82, GZ + 4.58]);
      return c;
    })(),
    site: 'school'
  },

  // Ville B : deux rues
  { name: 'bmain', kind: 'street', hw: 6, flat: 'cityB', ctrl: [[790, 1690], [790, 1750], [790, 1810], [790, 1870], [790, 1920]] },
  { name: 'bx', kind: 'street', hw: 6, flat: 'cityB', ctrl: [[660, 1800], [725, 1800], [790, 1800], [835, 1800]] }
];

// Destinations du taxi (aucun nom : seulement une icône). road = route où il s'arrête, s = abscisse (ou 'end' / 'start').
export const TAXI_STOPS = [
  { id: 'home', type: 'home', road: 'drive', s: 38 },
  { id: 'work', type: 'work', road: 'main', s: 'end' },
  { id: 'town', type: 'town', road: 'townx', s: 'mid' },
  { id: 'gas', type: 'gas', road: 'gas', s: 'end' },
  { id: 'station', type: 'train', road: 'forest', s: 'end' },
  { id: 'port', type: 'port', road: 'portx', s: 'mid' },
  { id: 'school', type: 'school', road: 'school', s: 'end' }     // le lycée Jean Dumont (devant le portail)
];

// ==========================================
// PARTIE 2 — TERRAIN, ROUTES ET MONTAGNES (ex map.js)
// ==========================================
// Terrain, collines, routes, montagnes, lac : calculés UNE seule fois et partagés par toutes les copies
// de la rue (la vraie + la vue par la fenêtre).
//   getShared() -> le terrain et les routes (SH)
//   WORK_SPOT / HOUSE_POS / TER -> positions et limites du monde
//
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
export const TER = { x0: -290, x1: 1060, z0: -5700, z1: 2200, step: 6 };   // z0 = -5700 : le lycée est à 5,2 km au nord
const Z0_OLD = -280;      // limite nord de l'ancienne forêt (arbres, buissons, rochers du monde de l'immeuble)
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

  // Nouvelles routes (montagne, forêt, gare, port, villes) : voir PARTIE 1 (données) et PARTIE 3 (calcul)
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
      // Sous la pelouse du lycée (à y = SCHOOL_Y - 0.05) : le terrain neigeux descend de 20 cm, sinon il la recouvre
      { const sd = schoolDist(x, z); if (sd < 26) { const k = 1 - smooth01(0, 26, sd); h = h + (Math.min(h, SCHOOL_Y - 0.2) - h) * k; } }

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
    if (schoolDist(x, z) === 0 && t < SCHOOL_Y - 0.05) t = SCHOOL_Y - 0.05;     // on marche sur la pelouse du lycée
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
    // Autour du lycée : le sol est de l'herbe (son monde à lui), la neige revient peu à peu en s'éloignant
    const gk = 1 - smooth01(0, 130, schoolDist(gx, gz));
    if (gk > 0) {
      const gv = 0.8 + 0.4 * fbm2(gx / 25 + 1.7, gz / 25 + 6.4, 2);
      colArr[k * 3] += (0.353 * gv - colArr[k * 3]) * gk;
      colArr[k * 3 + 1] += (0.549 * gv - colArr[k * 3 + 1]) * gk;
      colArr[k * 3 + 2] += (0.208 * gv - colArr[k * 3 + 2]) * gk;
    }
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
  const inSchool = (x, z) => x > SCHOOL_BOX.x0 && x < SCHOOL_BOX.x1 && z > SCHOOL_BOX.z0 && z < SCHOOL_BOX.z1;
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
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: Z0_OLD, z1: TER.z1 - 40,
    count: 2300, tries: 70000, spacing: 7.5,
    scaleMin: 0.85, scaleMax: 1.3,
    height: (x, z) => terrainH(x, z) - 0.15,
    pick: pickSpecies,
    density: (x, z) => {
      if (nearHouse(x, z) < 30 || lakeD(x, z) < LAKE.r * 1.15) return 0;
      if (z > SEA.z0 - 40 || inPlace(x, z) || inSchool(x, z)) return 0;
      const y = terrainH(x, z);
      if (y > 125 || y < -3) return 0;
      if (distRoad(x, z) < 9) return 0;
      if (slopeAt(x, z) > 6) return 0;
      return forestDensity(x, z);
    }
  });

  // Forêt sombre et très dense de chaque côté de la route du pont (voir ROAD_DEFS : route 'forest')
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
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: Z0_OLD, z1: TER.z1 - 40,
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
      if (z > SEA.z0 - 40 || inPlace(x, z) || inSchool(x, z) || slopeAt(x, z) > 6) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 28) return 0;
      const y = terrainH(x, z);
      if (y > 110 || y < -3) return 0;
      if (distRoad(x, z) < 5) return 0;
      return 0.12 + 0.88 * smooth01(0.38, 0.6, fbm2(x / 120 + 5.1, z / 120 + 2.3, 3));
    }
  });

  const rocks = scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: Z0_OLD, z1: TER.z1 - 40,
    count: 420, tries: 20000, spacing: 12, scaleMin: 0.8, scaleMax: 3.4,
    height: (x, z) => terrainH(x, z) - 0.25,
    pick: (x, z, rr) => (rr() < 0.5 ? 'rock1' : 'rock2'),
    density: (x, z) => {
      if (nearHouse(x, z) < 26 || lakeD(x, z) < LAKE.r * 1.1) return 0;
      if (z > SEA.z0 - 40 || inPlace(x, z) || inSchool(x, z)) return 0;
      if (Math.hypot(x - FLAT_C.x, z - FLAT_C.z) < 40) return 0;
      if (distRoad(x, z) < 8) return 0;
      const sl = Math.abs(terrainH(x + 3, z) - terrainH(x, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z));
      return 0.05 + 0.9 * smooth01(0.3, 1.4, sl);
    }
  });
  rocks.forEach(r => { r.sy = r.s * (0.5 + R() * 0.5); });

  // ---- Flore le long de la route du lycée (5 km vers le nord), plus clairsemée. Le lycée (SCHOOL_BOX) garde sa propre flore, sans celle de l'immeuble.
  scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: Z0_OLD,
    count: 1300, tries: 40000, spacing: 8,
    scaleMin: 0.85, scaleMax: 1.3,
    height: (x, z) => terrainH(x, z) - 0.15,
    pick: pickSpecies,
    density: (x, z) => {
      if (inSchool(x, z)) return 0;
      const y = terrainH(x, z);
      if (y > 125 || y < -3) return 0;
      if (distRoad(x, z) < 9 || slopeAt(x, z) > 6) return 0;
      return 0.8 * forestDensity(x, z);
    }
  }).forEach(t => trees.push(t));
  scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: Z0_OLD,
    count: 450, tries: 12000, spacing: 3.2, scaleMin: 0.8, scaleMax: 1.5,
    height: (x, z) => terrainH(x, z) - 0.12,
    pick: () => 'bush',
    density: (x, z) => {
      if (inSchool(x, z) || slopeAt(x, z) > 6) return 0;
      const y = terrainH(x, z);
      if (y > 110 || y < -3 || distRoad(x, z) < 5) return 0;
      return 0.12 + 0.88 * smooth01(0.38, 0.6, fbm2(x / 120 + 5.1, z / 120 + 2.3, 3));
    }
  }).forEach(b => bushes.push(b));
  scatterPoints(R, {
    x0: TER.x0 + 40, x1: TER.x1 - 40, z0: TER.z0 + 40, z1: Z0_OLD,
    count: 140, tries: 8000, spacing: 12, scaleMin: 0.8, scaleMax: 3.4,
    height: (x, z) => terrainH(x, z) - 0.25,
    pick: (x, z, rr) => (rr() < 0.5 ? 'rock1' : 'rock2'),
    density: (x, z) => {
      if (inSchool(x, z) || distRoad(x, z) < 8) return 0;
      const sl = Math.abs(terrainH(x + 3, z) - terrainH(x, z)) + Math.abs(terrainH(x, z + 3) - terrainH(x, z));
      return 0.05 + 0.9 * smooth01(0.3, 1.4, sl);
    }
  }).forEach(r => { r.sy = r.s * (0.5 + R() * 0.5); rocks.push(r); });

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

// ==========================================
// PARTIE 3 — ROUTES AJOUTÉES (ex roads.js)
// ==========================================
// Construit, à partir des données de la PARTIE 1 :
//   - les routes (montagne, forêt, gare, port, rues des villes, voie ferrée) avec leur hauteur,
//   - le massif de montagne et les falaises SANS rebord le long de la route de montagne,
//   - les plateaux plats sous chaque lieu et la mer au sud,
//   - la tranchée de la voie ferrée sous le pont.
// buildShared (PARTIE 2) l'appelle une seule fois et branche ces fonctions dans le calcul du terrain.

export function makeExtraRoads(H, base) {

  const { sampleRoad, roadProfile, limitSlope, smooth01, fbm2, hillsAt } = H;
  const byName = {};
  Object.keys(base).forEach(function (k) { byName[k] = base[k]; });

  const roads = [];
  const sites = {};           // nom -> { x, z, r, y }
  const patches = [];
  const mountSamples = [];    // échantillons de la route de montagne (falaises)
  const flatPlaces = {};

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function findSample(road, spec) {
    const S = road.samples;
    if (spec.end) return S[S.length - 1];
    if (spec.s != null) {
      for (let i = 0; i < S.length; i++) if (S[i].s >= spec.s) return S[i];
      return S[S.length - 1];
    }
    if (spec.near) return nearestOf(S, spec.near[0], spec.near[1]);
    return S[0];
  }
  function nearestOf(S, x, z) {
    let b = S[0], bd = 1e18;
    for (let i = 0; i < S.length; i++) {
      const d = (S[i].x - x) * (S[i].x - x) + (S[i].z - z) * (S[i].z - z);
      if (d < bd) { bd = d; b = S[i]; }
    }
    return b;
  }

  // Lissage large (voie ferrée : pas de petites bosses)
  function smoothProfile(S, W) {
    const n = S.length;
    const raw = S.map(function (p) { return hillsAt(p.x, p.z); });
    return S.map(function (p, i) {
      let a = 0, c = 0;
      for (let k = -W; k <= W; k++) { const j = i + k; if (j < 0 || j >= n) continue; a += raw[j]; c++; }
      return a / c;
    });
  }

  // 'smooth-linear' : presque une rampe droite, un peu adoucie aux extrémités
  function ease(t) {
    t = clamp(t, 0, 1);
    return 0.62 * t + 0.38 * (t * t * (3 - 2 * t));
  }

  // ---------- 1. Voie ferrée en premier (la gare, la ville B et le pont en dépendent) ----------
  const defs = ROAD_DEFS.slice().sort(function (a, b) { return (a.kind === 'rail' ? 0 : 1) - (b.kind === 'rail' ? 0 : 1); });

  const yoffs = { gas: 0.018, mount: 0.014, townx: 0.016, forest: 0.02, rail: 0.0, port: 0.022, school: 0.07, portx: 0.016, bmain: 0.016, bx: 0.02 };

  defs.forEach(function (d) {
    let ctrl = d.ctrl.slice();
    let startS = null;
    if (d.from) {
      const parent = byName[d.from.road];
      startS = findSample(parent, d.from);
      ctrl = [[startS.x, startS.z]].concat(ctrl);
    }
    const r = sampleRoad(ctrl, d.hw, d.name, yoffs[d.name] || 0.01);
    r.kind = d.kind;
    r.def = d;
    const S = r.samples, n = S.length;

    // ----- hauteur -----
    let y;
    if (d.kind === 'rail') {
      y = smoothProfile(S, 36);
      limitSlope(S, y, 0.03);
      if (d.trench) {
        const sn = nearestOf(S, d.trench.near[0], d.trench.near[1]).s;
        for (let i = 0; i < n; i++) y[i] -= d.trench.depth * (1 - smooth01(55, 170, Math.abs(S[i].s - sn)));
      }
      S.forEach(function (p, i) { p.y = y[i]; p.gap = 0.2; p.wall = d.wall || 11; });
    } else if (d.kind === 'street') {
      // la rue est posée à plat à la hauteur du plateau (calculée plus bas, une fois tous les lieux connus)
      S.forEach(function (p) { p.y = 0; p.gap = 0.11; });
    } else {
      const prof = roadProfile(r);
      y = prof.slice();
      const siteDef = d.site ? PLACES[d.site] : null;
      // arrivée : hauteur du lieu (gare / ville B : hauteur de la voie ; port : quai ; sinon collines)
      let y1 = null;
      if (d.site === 'station') y1 = nearestOf(byName.rail.samples, siteDef.x - 40, siteDef.z).y;
      else if (d.site === 'port') y1 = 0.7;
      else if (d.site === 'school') y1 = SCHOOL_Y;
      else if (siteDef) y1 = prof[n - 1];
      if (startS) {
        const dS = startS.y - y[0];
        for (let i = 0; i < n; i++) y[i] += dS * Math.exp(-S[i].s / 60);
      }
      if (y1 != null) {
        const dE = y1 - y[n - 1];
        for (let i = 0; i < n; i++) y[i] += dE * Math.exp(-(r.len - S[i].s) / 110);
      }
      if (d.kind === 'mountain') {
        // grande montée puis descente : la ligne droite finale (dans la ville) reste plate
        const top = 0.52 * (r.len - 300), down = r.len - 300;
        const riseLen = top, fallLen = down - top;
        for (let i = 0; i < n; i++) {
          const s = S[i].s;
          const t = s <= top ? ease(s / riseLen) : 1 - ease((s - top) / fallLen);
          y[i] += d.peak * clamp(t, 0, 1);
        }
        limitSlope(S, y, 0.115);
      } else {
        // pont : la route monte un peu au-dessus de la voie ferrée
        if (d.bridge) {
          const rail = byName.rail || roads.filter(function (q) { return q.name === 'rail'; })[0];
          let bi = 0, bd = 1e18;
          for (let i = 0; i < n; i++) {
            const q = nearestOf(rail.samples, S[i].x, S[i].z);
            const dd = (q.x - S[i].x) * (q.x - S[i].x) + (q.z - S[i].z) * (q.z - S[i].z);
            if (dd < bd) { bd = dd; bi = i; }
          }
          const sc = S[bi].s;
          r.bridgeS = sc;
          for (let i = 0; i < n; i++) y[i] += d.bridge.hump * (1 - smooth01(d.bridge.half, d.bridge.half + 95, Math.abs(S[i].s - sc)));
        }
        limitSlope(S, y, 0.075);
      }
      S.forEach(function (p, i) { p.y = y[i]; p.gap = d.kind === 'mountain' ? 0.15 : 0.3; });
      if (d.bridge && r.bridgeS != null) {
        S.forEach(function (p) { if (Math.abs(p.s - r.bridgeS) <= d.bridge.half) { p.span = true; p.gap = 0.3; } });
      }
    }

    if (d.kind === 'rail') byName.rail = r;
    roads.push(r);
    byName[d.name] = r;
  });

  // ---------- 2. Lieux (plateaux) ----------
  Object.keys(PLACES).forEach(function (k) {
    const p = PLACES[k];
    let y;
    if (k === 'station') y = nearestOf(byName.rail.samples, p.x - 40, p.z).y;
    else if (k === 'cityB') y = nearestOf(byName.rail.samples, p.x + 60, p.z - 40).y;
    else if (k === 'port') y = 0.7;
    else if (k === 'school' || k === 'schoolground') y = SCHOOL_Y;
    else if (k === 'town') y = byName.mount.samples[byName.mount.samples.length - 1].y;
    else y = byName[k].samples[byName[k].samples.length - 1].y;     // gas : bout de la route
    sites[k] = { x: p.x, z: p.z, r: p.r, y: y };
  });

  // la voie ferrée rejoint la hauteur de la ville B (plateau) sur ses derniers mètres
  (function () {
    const c = sites.cityB;
    byName.rail.samples.forEach(function (p) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      const k = 1 - smooth01(c.r * 0.4, c.r + 60, d);
      if (p.z > 1500 && k > 0) p.y += (c.y - p.y) * k;
    });
  })();

  // rues de ville : à plat
  roads.forEach(function (r) {
    if (r.kind !== 'street') return;
    const s = sites[r.def.flat];
    r.samples.forEach(function (p) { p.y = s.y; });
  });

  // la fin de la route qui dessert un lieu rejoint exactement la hauteur du plateau
  ['forest', 'port', 'gas', 'mount', 'school'].forEach(function (name) {
    const r = byName[name];
    const s = sites[r.def.site];
    const S = r.samples;
    const tail = r.def.kind === 'mountain' ? 285 : 60;
    for (let i = 0; i < S.length; i++) {
      const k = 1 - smooth01(0, tail, r.len - S[i].s);
      if (k > 0) S[i].y += (s.y - S[i].y) * k;
    }
  });

  // ---------- 3. Falaises : échantillons de la route de montagne ----------
  (function () {
    const r = byName.mount, S = r.samples;
    const cliffEnd = r.len - 290;
    const from = r.def.cliffFrom || 140;
    for (let i = 0; i < S.length; i += 2) {
      const p = S[i];
      const c = smooth01(from, from + 170, p.s) * (1 - smooth01(cliffEnd - 150, cliffEnd, p.s));
      mountSamples.push({ x: p.x, z: p.z, y: p.y, tx: p.tx, tz: p.tz, hw: p.hw, c: c, gap: p.gap });
    }
  })();

  const MCELL = 24, MR = 175;
  const mgrid = new Map();
  const mkey = function (ix, iz) { return (ix + 2000) * 8192 + (iz + 2000); };
  mountSamples.forEach(function (p) {
    const k = mkey(Math.floor(p.x / MCELL), Math.floor(p.z / MCELL));
    let a = mgrid.get(k);
    if (!a) { a = []; mgrid.set(k, a); }
    a.push(p);
  });
  // cellules grossières (32 m) qui touchent le couloir de la route de montagne : test rapide
  const near = new Set();
  (function () {
    const C = 32;
    mountSamples.forEach(function (p) {
      const a = Math.floor((p.x - MR) / C), b = Math.floor((p.x + MR) / C);
      const c = Math.floor((p.z - MR) / C), d = Math.floor((p.z + MR) / C);
      for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) near.add((i + 2000) * 8192 + (j + 2000));
    });
  })();
  const NC = Math.ceil(MR / MCELL);

  // Hauteur du terrain autour de la route de montagne : paroi à gauche, précipice à droite, rien entre les deux.
  function sculpt(h, x, z) {
    if (!near.has((Math.floor(x / 32) + 2000) * 8192 + (Math.floor(z / 32) + 2000))) return h;
    const cx = Math.floor(x / MCELL), cz = Math.floor(z / MCELL);
    let sw = 0, sf = 0, dmin = 1e9, cn = 0;
    for (let a = -NC; a <= NC; a++) {
      for (let b = -NC; b <= NC; b++) {
        const arr = mgrid.get(mkey(cx + a, cz + b));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const dx = x - p.x, dz = z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > MR * MR) continue;
          const t = dx * (-p.tz) + dz * p.tx;               // > 0 : côté droit de la route = précipice
          const at = Math.abs(t), edge = p.hw + 1.2;
          let off = 0;
          if (at > edge) {
            if (t < 0) off = Math.min(75, (at - edge) * 1.75);
            else off = -Math.min(Math.min(92, (at - edge) * 2.3), Math.max(0, p.y + 3.5));
          }
          const f = p.y - 0.03 - p.gap + off * p.c;
          const w = 1 / Math.pow(d2 + 16, 1.4);
          sw += w; sf += w * f;
          if (d2 < dmin) { dmin = d2; cn = p.c; }
        }
      }
    }
    if (!sw) return h;
    const k = (1 - smooth01(105, MR, Math.sqrt(dmin))) * cn;
    return h + (sf / sw - h) * k;
  }

  // ---------- 4. Massif, plateaux, mer ----------
  function massif(x, z) {
    const a = (x - MASSIF.x) / MASSIF.rx, b = (z - MASSIF.z) / MASSIF.rz;
    const m = 1 - a * a - b * b;
    if (m <= 0) return 0;
    return MASSIF.height * smooth01(0, 0.5, m) * (0.55 + 0.9 * fbm2(x / 90 + 17.3, z / 90 + 5.9, 3));
  }

  const siteList = Object.keys(sites).map(function (k) { return sites[k]; });

  // nat : hauteur naturelle (avant les routes). Ajoute massif, plateaux et mer.
  function shape(nat, x, z) {
    nat += massif(x, z);
    for (let i = 0; i < siteList.length; i++) {
      const s = siteList[i];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r + 80) nat = s.y + (nat - s.y) * smooth01(s.r * 0.85, s.r + 80, d);
    }
    if (z > SEA.z0 - 10) nat += (SEA.floor - nat) * smooth01(SEA.z0 - 10, SEA.z0 + 12, z);
    return nat;
  }

  // distance au lieu le plus proche, rapportée à son rayon (0 = centre ; < 1 = dans le lieu)
  function placeK(x, z) {
    let k = 1e9;
    for (let i = 0; i < siteList.length; i++) {
      const s = siteList[i];
      k = Math.min(k, Math.hypot(x - s.x, z - s.z) / s.r);
    }
    return k;
  }

  // ---------- 5. Carrefours ----------
  [['forest', 0], ['port', 0]].forEach(function (a) {
    const r = byName[a[0]];
    const p = r.samples[0];
    patches.push({ x: p.x, z: p.z, y: p.y, r: 8.4 });
  });
  patches.push({ x: 0, z: 1595, y: sites.town.y, r: 9.4 });
  patches.push({ x: 450, z: 1975, y: sites.port.y, r: 9.4 });
  patches.push({ x: 790, z: 1800, y: sites.cityB.y, r: 9.4 });

  // ---------- 6. Arrêts de taxi ----------
  const stops = TAXI_STOPS.map(function (t) {
    const r = byName[t.road];
    const S = r.samples;
    let s;
    if (t.s === 'start') s = 0;
    else if (t.s === 'end') s = r.len - (t.road === 'main' ? 8 : 6);
    else if (t.s === 'mid') s = r.len * 0.5 - 25;
    else s = t.s;
    let idx = 0;
    for (let i = 0; i < S.length; i++) if (S[i].s >= s) { idx = i; break; }
    return { id: t.id, type: t.type, road: t.road, idx: idx, x: S[idx].x, z: S[idx].z };
  });

  return {
    roads: roads, byName: byName, sites: sites, patches: patches, stops: stops,
    shape: shape, sculpt: sculpt, massif: massif, placeK: placeK
  };
}

// ==========================================
// PARTIE 4 — ITINÉRAIRES POUR VÉHICULES AUTOMATIQUES (ex objects/roadnet.js)
// ==========================================
// Même principe que taxi.js (routes reliées par leurs jonctions, voie de droite, vitesse limitée dans les virages),
// mais indépendant de toute voiture : le bus s'en sert pour PLANIFIER toute sa ligne avant de rouler.
//
//   const net = createRoadNet(SH.roads, { lane: 2.3 });
//   const stop = net.stopAt('forest', 480);                       // un arrêt à 480 m le long d'une route
//   const r = net.route({ x, z, heading }, stop);                 // { pts, uturn, start, end }
//   const P = net.makePath(r.pts, { vmax, acc, brk, alat });      // profil de vitesse
//   net.sampleAt(P, s)                                            // { x, z, h, v, turn }
//
// Repère : avant = (-sin h, -cos h), droite = (cos h, -sin h) (comme vehicle.js / taxi.js).

export function createRoadNet(roads, o) {
  o = o || {};
  const LANE = o.lane || 2.3;
  const allRoads = roads.filter(function (r) { return r.kind !== 'rail'; });
  const nodes = [], adj = [], base = {}, byName = {};

  allRoads.forEach(function (r) {
    base[r.name] = nodes.length;
    byName[r.name] = r;
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
    return bd < 60 * 60 ? b : -1;
  }

  // Dijkstra avec tas binaire (beaucoup plus rapide que la version à balayage du taxi)
  function dijkstra(src, dst) {
    const n = nodes.length, dist = new Float64Array(n).fill(1e18), prev = new Int32Array(n).fill(-1);
    const hp = [];                                    // [dist, node]
    function push(d, v) {
      hp.push([d, v]);
      let i = hp.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; const t = hp[p]; hp[p] = hp[i]; hp[i] = t; i = p; }
    }
    function pop() {
      const top = hp[0], last = hp.pop();
      if (hp.length) {
        hp[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < hp.length && hp[l][0] < hp[m][0]) m = l;
          if (r < hp.length && hp[r][0] < hp[m][0]) m = r;
          if (m === i) break;
          const t = hp[m]; hp[m] = hp[i]; hp[i] = t; i = m;
        }
      }
      return top;
    }
    dist[src] = 0; push(0, src);
    while (hp.length) {
      const t = pop(), d = t[0], u = t[1];
      if (d > dist[u]) continue;
      if (u === dst) break;
      const e = adj[u];
      for (let k = 0; k < e.length; k++) {
        const nd = d + e[k].c;
        if (nd < dist[e[k].to]) { dist[e[k].to] = nd; prev[e[k].to] = u; push(nd, e[k].to); }
      }
    }
    if (prev[dst] < 0 && src !== dst) return null;
    const out = [];
    for (let v = dst; v >= 0; v = prev[v]) out.push(v);
    return out.reverse();
  }

  // Un arrêt à l'abscisse s (m) d'une route : { id, road, idx, x, z, tx, tz }
  function stopAt(roadName, s, id) {
    const r = byName[roadName];
    if (!r) return null;
    const S = r.samples;
    let idx = S.length - 1;
    if (s === 'end') s = r.len - 8;
    if (s === 'start') s = 0;
    for (let i = 0; i < S.length; i++) if (S[i].s >= s) { idx = i; break; }
    return { id: id || (roadName + '@' + Math.round(s)), road: roadName, idx: idx, x: S[idx].x, z: S[idx].z, tx: S[idx].tx, tz: S[idx].tz };
  }
  // L'échantillon de route le plus proche d'un point (ex. le lac) : { road, s, dist }
  function nearestRoadPoint(px, pz) {
    let best = null, bd = 1e18;
    allRoads.forEach(function (r) {
      if (r.kind === 'street' && r.name !== 'townx' && r.name !== 'portx') return;
      r.samples.forEach(function (p) {
        const d = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
        if (d < bd) { bd = d; best = { road: r.name, s: p.s, x: p.x, z: p.z }; }
      });
    });
    if (best) best.dist = Math.sqrt(bd);
    return best;
  }

  // Itinéraire depuis une pose { x, z, heading } jusqu'à un arrêt. Renvoie null si impossible.
  //   pts   : points de la voie de droite (le premier = pose de départ, APRÈS un éventuel demi-tour)
  //   uturn : true si le véhicule doit d'abord faire demi-tour (à faire par le véhicule lui-même)
  //   start : pose de départ une fois le demi-tour fait ; end : pose d'arrivée { x, z, heading }
  function route(pose, stop) {
    const src = nearestNode(pose.x, pose.z);
    const dst = base[stop.road] + stop.idx;
    if (src < 0) return null;
    const ids = dijkstra(src, dst);
    if (!ids) return null;
    const c = [];
    ids.forEach(function (id, k) {
      const n = nodes[id];
      if (!c.length || k === ids.length - 1 || Math.hypot(n.x - c[c.length - 1][0], n.z - c[c.length - 1][1]) >= 3.5) c.push([n.x, n.z]);
    });
    if (c.length < 2) return null;
    const lane = c.map(function (q, i) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [q[0] - LANE * dz, q[1] + LANE * dx, dx, dz];
    });
    let h = pose.heading, px = pose.x, pz = pose.z;
    let fx = -Math.sin(h), fz = -Math.cos(h);
    let uturn = false;
    if (lane[0][2] * fx + lane[0][3] * fz < -0.2 || (lane.length > 2 && lane[1][2] * fx + lane[1][3] * fz < -0.2)) {
      uturn = true;
      const rx = Math.cos(h), rz = -Math.sin(h);
      px -= rx * 2 * LANE; pz -= rz * 2 * LANE;       // il se retrouvera sur l'autre voie, tourné de 180°
      h += Math.PI; fx = -fx; fz = -fz;
    }
    let k0 = 0;
    while (k0 < lane.length - 2 && (lane[k0][0] - px) * fx + (lane[k0][1] - pz) * fz < 3) k0++;
    const pts = [[px, pz]];
    for (let k = k0; k < lane.length; k++) pts.push([lane[k][0], lane[k][1]]);
    const L = lane[lane.length - 1];
    return { pts: pts, uturn: uturn, start: { x: px, z: pz, heading: h }, end: { x: L[0], z: L[1], heading: Math.atan2(-L[2], -L[3]) } };
  }

  // Courbe lissée + profil de vitesse (virages, accélération et freinage confortables)
  function makePath(pts, par) {
    par = par || {};
    const VMAX = par.vmax || 16, ACC = par.acc || 1.7, BRK = par.brk || 3.0, ALAT = par.alat || 2.4;
    const curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], 0, p[1]); }), false, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const total = curve.getLength();
    const raw = curve.getSpacedPoints(Math.max(8, Math.round(total / 2)));
    const m = raw.length;
    const X = new Array(m), Z = new Array(m), S = new Array(m), H = new Array(m), V = new Array(m);
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
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 4), b = Math.min(m - 1, i + 4);
      const kappa = Math.abs(H[b] - H[a]) / Math.max(1e-3, S[b] - S[a]);
      V[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(kappa, 1e-3)));
    }
    V[0] = Math.min(V[0], par.vstart != null ? par.vstart : 1.5);
    V[m - 1] = Math.min(V[m - 1], 0.4);
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

  return { LANE: LANE, nodes: nodes, byName: byName, stopAt: stopAt, nearestRoadPoint: nearestRoadPoint, route: route, makePath: makePath, sampleAt: sampleAt };
}
