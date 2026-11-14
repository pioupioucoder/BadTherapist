import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — RÉSEAU ROUTIER POUR VÉHICULES AUTOMATIQUES (objects/roadnet.js)
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
