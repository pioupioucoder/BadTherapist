import * as THREE from 'three';
import { SEA } from './layout.js';
import { createHub, createTraffic } from './common.js';
import { buildTown } from './town.js';
import { buildGasStation } from './gasstation.js';
import { buildRailway } from './bridge.js';
import { buildCityB } from './cityb.js';
import { buildPort } from './port.js';

// ==========================================
// BAD THERAPIST — ASSEMBLAGE DES LIEUX (places/index.js)
// ==========================================
// immeuble.js appelle buildPlaces(scene, {...}) une fois (monde réel seulement, pas la copie de la fenêtre).
//   o.X          : résultat de makeExtraRoads (routes, sites, arrêts de taxi)
//   o.camera     : caméra du joueur ; o.origin : position monde de l'origine de la rue
//   o.action     : bouton d'action (show(label, fn) / hide())
//   o.teleport   : (x, z, cap) -> déplace le joueur (train)
//   o.crossing   : carrefour principal (feux de circulation) { x, y, z, tx, tz, hwA, hwB }
// Retourne { rects, update(dt, active), collide(x, z, r) }.

// Fusionne tous les maillages fixes (même matériau) d'un lieu en un seul. Sont exclus : les objets animés
// (userData.dyn : portes, feux), les matériaux transparents, les tableaux de matériaux et les instances.
function mergeStatic(scene, roots) {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const buckets = new Map(), done = [];
  const visit = function (n, dyn) {
    dyn = dyn || !!n.userData.dyn;
    if (n.isMesh && !n.isInstancedMesh && !dyn && n.visible && !Array.isArray(n.material) && !n.material.transparent) {
      const rel = new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld);
      const g = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
      g.applyMatrix4(rel);
      if (!buckets.has(n.material)) buckets.set(n.material, []);
      buckets.get(n.material).push(g);
      done.push(n);
    }
    n.children.forEach(function (c) { visit(c, dyn); });
  };
  roots.forEach(function (r) { visit(r, false); });
  buckets.forEach(function (list, mat) {
    let count = 0;
    list.forEach(function (g) { count += g.attributes.position.count; });
    const P = new Float32Array(count * 3), N = new Float32Array(count * 3), U = new Float32Array(count * 2);
    let o = 0;
    list.forEach(function (g) {
      const c = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) N.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2);
      o += c;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.computeBoundingSphere();
    scene.add(new THREE.Mesh(geo, mat));
  });
  done.forEach(function (m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); });
}

export function buildPlaces(scene, o) {

  const hub = createHub(o.action);
  const traffic = createTraffic();
  const rects = [];

  // Une seule vraie lumière pour tous les intérieurs : elle suit le joueur
  const light = new THREE.PointLight(0xffd8a8, 0, 17, 2);
  light.userData.keep = true;
  scene.add(light);
  let want = null;

  const env = {
    X: o.X, sites: o.X.sites, rects: rects, hub: hub, traffic: traffic,
    wantLight: function (x, y, z, k) { if (!want || k > want.k) want = { x: x, y: y, z: z, k: k }; },
    teleport: o.teleport
  };

  if (o.crossing) {
    const c = o.crossing;
    traffic.intersection(scene, c.x, c.y, c.z, c.tx, c.tz, c.hwA, c.hwB);
  }

  // Chaque lieu est construit puis ses objets fixes sont fusionnés (peu d'appels de dessin : important sur téléphone)
  const mods = [buildTown, buildGasStation, buildRailway, buildCityB, buildPort].map(function (fn) {
    const before = scene.children.length;
    const r = fn(scene, env);
    mergeStatic(scene, scene.children.slice(before));
    return r;
  });

  // Collision cercle contre les rectangles des lieux (+ la mer : on ne marche pas dans l'eau)
  function collide(px, pz, R) {
    if (pz > SEA.z0 - 5) pz = SEA.z0 - 5;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < rects.length; i++) {
        const c = rects[i];
        if (px < c.x0 - R || px > c.x1 + R || pz < c.z0 - R || pz > c.z1 + R) continue;
        const cx = Math.max(c.x0, Math.min(c.x1, px)), cz = Math.max(c.z0, Math.min(c.z1, pz));
        const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px += dx / d * (R - d); pz += dz / d * (R - d);
        } else {
          const l = px - c.x0, r = c.x1 - px, t = pz - c.z0, b = c.z1 - pz, m = Math.min(l, r, t, b);
          if (m === l) px = c.x0 - R; else if (m === r) px = c.x1 + R; else if (m === t) pz = c.z0 - R; else pz = c.z1 + R;
        }
      }
    }
    return [px, pz];
  }

  let time = 0;
  return {
    rects: rects,
    collide: collide,
    update: function (dt, active) {
      time += dt;
      const px = o.camera.position.x - o.origin.x, pz = o.camera.position.z - o.origin.z;
      want = null;
      traffic.update(time);
      mods.forEach(function (m) { m.update(dt, time, px, pz, active); });
      hub.flush();
      if (want) {
        light.position.set(want.x, want.y, want.z);
        light.intensity += (1.15 * want.k - light.intensity) * Math.min(1, dt * 6);
      } else {
        light.intensity += (0 - light.intensity) * Math.min(1, dt * 6);
      }
    }
  };
}
