import * as THREE from 'three';
import { PLACES, ROAD_DEFS, MASSIF, SEA, TAXI_STOPS } from './layout.js';

// ==========================================
// BAD THERAPIST — ROUTES AJOUTÉES (places/roads.js)
// ==========================================
// Construit, à partir de layout.js :
//   - les routes (montagne, forêt, gare, port, rues des villes, voie ferrée) avec leur hauteur,
//   - le massif de montagne et les falaises SANS rebord le long de la route de montagne,
//   - les plateaux plats sous chaque lieu et la mer au sud,
//   - la tranchée de la voie ferrée sous le pont.
// immeuble.js l'appelle une seule fois (buildShared) et branche ces fonctions dans le calcul du terrain.

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

  const yoffs = { gas: 0.018, mount: 0.014, townx: 0.016, forest: 0.02, rail: 0.0, port: 0.022, portx: 0.016, bmain: 0.016, bx: 0.02 };

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
  ['forest', 'port', 'gas', 'mount'].forEach(function (name) {
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
