import * as THREE from 'three';
import { PLACES } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, signMaterial, fadeBlack, mulberry32 } from './common.js';

// ==========================================
// BAD THERAPIST — VOIE FERRÉE, PONT, GARES ET TRAIN (places/bridge.js)
// ==========================================
//  - rails + traverses + ballast sur toute la voie (route 'rail' de layout.js),
//  - le pont de la route de la forêt au-dessus de la tranchée de la voie,
//  - la petite gare près du pont et la gare de la ville B, chacune avec un train à quai :
//    bouton BOARD près du train -> fondu au noir -> on arrive à l'autre gare (le train est factice).

export function buildRailway(scene, env) {

  const M = mats();
  const rail = env.X.byName.rail, forest = env.X.byName.forest;
  const RS = rail.samples;
  const V = THREE.Vector3;

  // ---------- rails ----------
  (function () {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6d6f72, roughness: 0.5, metalness: 0.7 });
    const tie = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 1 });

    // ballast : ruban
    const pos = [], idx = [];
    RS.forEach(function (p, i) {
      const nx = -p.tz, nz = p.tx;
      pos.push(p.x + nx * 2.3, p.y + 0.02, p.z + nz * 2.3, p.x - nx * 2.3, p.y + 0.02, p.z - nz * 2.3);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    bg.setIndex(idx); bg.computeVertexNormals();
    scene.add(new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x3a3a3b, roughness: 1, side: THREE.DoubleSide })));

    // rails : un morceau par pair d'échantillons
    const n = RS.length - 1;
    const railGeo = new THREE.BoxGeometry(0.12, 0.16, 1);
    const rails = new THREE.InstancedMesh(railGeo, steel, n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V(), ps = new V(), up = new V(0, 0, 1);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = RS[i], b = RS[i + 1];
      const dir = new V(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = dir.length();
      dir.normalize();
      q.setFromUnitVectors(up, dir);
      for (const s of [-1, 1]) {
        ps.set((a.x + b.x) / 2 + (-dir.z) * 0.72 * s * 0.999, (a.y + b.y) / 2 + 0.12, (a.z + b.z) / 2 + dir.x * 0.72 * s);
        sc.set(1, 1, len * 1.03);
        m4.compose(ps, q, sc);
        rails.setMatrixAt(k++, m4);
      }
    }
    scene.add(rails);

    // traverses tous les 0,9 m
    const ties = [];
    for (let s = 1; s < rail.len - 1; s += 0.9) {
      let i = 0;
      while (i < RS.length - 2 && RS[i + 1].s < s) i++;
      const a = RS[i], b = RS[i + 1], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
      ties.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, Math.atan2(b.x - a.x, b.z - a.z)]);
    }
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.12, 0.28), tie, ties.length);
    const e = new THREE.Euler();
    ties.forEach(function (t, i) {
      e.set(0, t[3], 0);
      q.setFromEuler(e);
      ps.set(t[0], t[1] + 0.07, t[2]);
      sc.set(1, 1, 1);
      m4.compose(ps, q, sc);
      tm.setMatrixAt(i, m4);
    });
    scene.add(tm);
    void dark;
  })();

  // ---------- pont ----------
  (function () {
    const S = forest.samples.filter(function (p) { return p.span; });
    if (S.length < 2) return;
    const concrete = M.concrete;
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.92 });
    const hw = S[0].hw + 0.9;
    const q = new THREE.Quaternion(), up = new V(0, 0, 1);
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      const dir = new V(b.x - a.x, b.y - a.y, b.z - a.z), len = dir.length();
      dir.normalize();
      q.setFromUnitVectors(up, dir);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
      const yaw = Math.atan2(dir.x, dir.z);
      const seg = new THREE.Group();
      seg.position.set(mx, my, mz);
      seg.quaternion.copy(q);
      scene.add(seg);
      box(seg, hw * 2, 0.9, len + 0.05, asphalt, 0, 0.1 - 0.45 + 0, 0);                    // tablier (dessus à y + 0,1)
      for (const s of [-1, 1]) {
        box(seg, 0.4, 1.0, len + 0.05, concrete, s * hw, 0.6, 0);                        // garde-corps
        box(seg, 0.5, 0.14, len + 0.05, M.snow, s * hw, 1.17, 0);
      }
      // collisions : petits carrés le long de chaque garde-corps
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (const s of [-1, 1]) {
        for (let u = 0; u < len; u += 1.4) {
          const f = u / len;
          const cx = a.x + (b.x - a.x) * f + rx * s * hw, cz = a.z + (b.z - a.z) * f + rz * s * hw;
          env.rects.push({ x0: cx - 0.75, x1: cx + 0.75, z0: cz - 0.75, z1: cz + 0.75 });
        }
      }
    }
    // culées de béton aux deux bouts (descendent jusqu'au fond de la tranchée)
    [S[0], S[S.length - 1]].forEach(function (p) {
      const railY = rail.samples.reduce(function (b, q2) { return Math.hypot(q2.x - p.x, q2.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? q2 : b; }).y;
      const h = p.y - railY + 0.5;
      const m = box(scene, hw * 2 + 1.2, h, 2.6, M.concreteDark, p.x, railY - 0.5 + h / 2, p.z);
      m.rotation.y = Math.atan2(p.tx, p.tz);
    });
    // lampadaires sur le pont
    const mid = S[Math.floor(S.length / 2)];
    lampPost(scene, mid.x - mid.tz * (hw - 0.3), mid.y + 0.1, mid.z + mid.tx * (hw - 0.3), Math.atan2(mid.tx, mid.tz) - Math.PI / 2 + Math.PI);
  })();

  // ---------- trains et gares ----------
  function nearestRail(x, z) {
    return RS.reduce(function (b, p) { return Math.hypot(p.x - x, p.z - z) < Math.hypot(b.x - x, b.z - z) ? p : b; });
  }

  function yawRect(x, z, yaw, hw, hl) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let ax = 1e9, bx = -1e9, az = 1e9, bz = -1e9;
    [[-hw, -hl], [-hw, hl], [hw, -hl], [hw, hl]].forEach(function (p) {
      const wx = x + p[0] * c + p[1] * s, wz = z - p[0] * s + p[1] * c;
      ax = Math.min(ax, wx); bx = Math.max(bx, wx); az = Math.min(az, wz); bz = Math.max(bz, wz);
    });
    return { x0: ax, x1: bx, z0: az, z1: bz };
  }

  function buildTrain(p) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const yaw = Math.atan2(p.tx, p.tz);
    g.rotation.y = yaw;
    scene.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0x31363b, roughness: 0.6, metalness: 0.4, emissive: 0x0a0b0c });
    const red = new THREE.MeshStandardMaterial({ color: 0x6a1e16, roughness: 0.6, metalness: 0.3, emissive: 0x140605 });
    const win = new THREE.MeshBasicMaterial({ color: 0x9c7440 });
    const lens = new THREE.MeshBasicMaterial({ color: 0xffe9c0 });
    // locomotive (à l'avant, z négatif)
    box(g, 3.1, 3.2, 10, red, 0, 2.3, -17.5);
    box(g, 2.9, 0.12, 9.8, M.snow, 0, 3.97, -17.5);
    box(g, 2.6, 1.0, 0.1, win, 0, 3.0, -22.55);
    box(g, 0.5, 0.4, 0.2, lens, -0.8, 1.6, -22.6); box(g, 0.5, 0.4, 0.2, lens, 0.8, 1.6, -22.6);
    glow(g, 0, 1.8, -24, 0xffe0b0, 7, 0.5);
    // deux voitures
    [-4.5, 12].forEach(function (z, i) {
      box(g, 3.1, 3.5, 15.5, body, 0, 2.4, z);
      box(g, 2.9, 0.12, 15.3, M.snow, 0, 4.2, z);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 6; k++) box(g, 0.06, 0.8, 1.6, win, s * 1.57, 2.9, z - 6 + k * 2.4);
        box(g, 0.08, 2.2, 1.3, M.dark, s * 1.57, 1.6, z + (i ? 6.4 : -6.4));            // porte
      }
    });
    box(g, 2.6, 0.9, 40, M.dark, 0, 0.6, -2);                                            // bogies (volume)
    env.rects.push(yawRect(p.x, p.z, yaw, 1.6, 12));
    env.rects.push(yawRect(p.x + Math.sin(yaw) * -17.5 + 0, p.z + Math.cos(yaw) * -17.5, yaw, 1.6, 5.2));
    env.rects.push(yawRect(p.x + Math.sin(yaw) * 12, p.z + Math.cos(yaw) * 12, yaw, 1.6, 8));
    return g;
  }

  // porte de quai : point sur le quai en face de la porte de la voiture 1 (z local = -4.5)
  function platformSpot(p, side) {
    return { x: p.x + side * 5.4, z: p.z - 4.5 * 1 };
  }

  const stations = {};
  function buildStation(key, rx, rz, side, label, otherKey) {
    const p = nearestRail(rx, rz);
    buildTrain(p);
    const px = p.x + side * 6.4;
    box(scene, 6, 0.18, 58, M.concrete, px, p.y + 0.09, p.z - 2);                       // quai
    box(scene, 0.4, 0.04, 58, new THREE.MeshBasicMaterial({ color: 0xb9a64a }), p.x + side * 3.5, p.y + 0.19, p.z - 2);
    // auvent
    [-22, -6, 10, 24].forEach(function (dz) { box(scene, 0.35, 4.2, 0.35, M.concreteDark, px + side * 1.8, p.y + 2.1, p.z + dz); });
    box(scene, 5, 0.3, 50, M.metal, px, p.y + 4.35, p.z + 1);
    box(scene, 5.2, 0.14, 50.2, M.snow, px, p.y + 4.58, p.z + 1);
    glow(scene, px, p.y + 3.9, p.z - 12, 0xffe0b0, 6, 0.3);
    glow(scene, px, p.y + 3.9, p.z + 14, 0xffe0b0, 6, 0.3);
    // bâtiment de gare
    fakeBuilding(scene, env, { x: px + side * 12, y: p.y, z: p.z + 4, w: 9, d: 16, h: 5.2, face: side > 0 ? 'w' : 'e', pal: 2, sign: label, roof: 'gable' });
    stations[key] = { spot: { x: px - side * 0.8, z: p.z - 4.5 }, face: side > 0 ? Math.PI / 2 : -Math.PI / 2, other: otherKey };
    lampPost(scene, px + side * 2.6, p.y, p.z - 26, side > 0 ? Math.PI : 0);
    lampPost(scene, px + side * 2.6, p.y, p.z + 28, side > 0 ? Math.PI : 0);
  }
  buildStation('A', PLACES.station.x - 45, PLACES.station.z, +1, 'STATION', 'B');
  buildStation('B', PLACES.cityB.x + 60, PLACES.cityB.z - 62, -1, 'STATION', 'A');

  let busy = false;
  function board(from) {
    if (busy) return;
    busy = true;
    const to = stations[stations[from].other];
    fadeBlack(900, 1700, 1100, function () { env.teleport(to.spot.x, to.spot.z, to.face); }).then(function () { busy = false; });
  }

  return {
    update: function (dt, time, px, pz, active) {
      if (!active || busy) return;
      ['A', 'B'].forEach(function (k) {
        const s = stations[k].spot;
        const d = Math.hypot(px - s.x, pz - s.z);
        if (d < 4.2) env.hub.request('train-' + k, 'BOARD', function () { board(k); }, d);
      });
    },
    stations: stations
  };
}
