import * as THREE from 'three';
import { PLACES } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, enterable, signMaterial, addGable } from './common.js';

// ==========================================
// BAD THERAPIST — VILLE DE MONTAGNE (places/town.js)
// ==========================================
// Une rue principale (nord-sud) et une rue transversale. Tout est factice sauf trois bâtiments
// dont la porte s'ouvre (bouton OPEN / CLOSE) et qu'on peut visiter :
//   - le marchand de journaux, le magasin, la basilique.
// Coordonnées ci-dessous : relatives au centre de la ville (PLACES.town). x vers l'est, z vers le sud.

export function buildTown(scene, env) {

  const P = PLACES.town, S = env.sites.town;
  const Y = S.y;
  const M = mats();
  const A = function (rx, rz) { return { x: P.x + rx, z: P.z + rz }; };
  const g = new THREE.Group();
  scene.add(g);

  // ---------- bâtiments avec intérieur ----------

  // Marchand de journaux (côté ouest, porte vers la rue)
  const news = enterable(scene, env, Object.assign(A(-13, -52), {
    id: 'town-news', y: Y, w: 9, d: 12, h: 4.6, face: 'e', pal: 4, doorDz: 0, sign: 'NEWS',
    fill: function (inner, a) {
      box(inner, 0.7, 1.0, 5.2, M.wood, 1.9, 0.5, -2.4);                    // comptoir
      box(inner, 0.9, 0.06, 5.4, M.woodLight, 1.9, 1.03, -2.4);
      box(inner, 0.5, 2.4, 9.2, M.wood, -a.w / 2 + 0.6, 1.2, 0);              // étagère du fond
      for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) {
        const col = [0xb9b2a3, 0xa7a08f, 0xcfc6b0, 0x8f8a7c][(r + c) % 4];
        box(inner, 0.04, 0.5, 0.7, new THREE.MeshStandardMaterial({ color: col, roughness: 1, emissive: 0x151210 }), -a.w / 2 + 0.9, 0.5 + r * 0.55, -4.3 + c * 0.8);
      }
      for (let i = 0; i < 6; i++) {
        box(inner, 0.9, 0.05 + (i % 3) * 0.03, 0.6, new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 1, emissive: 0x181410 }), 1.9, 1.08 + (i % 3) * 0.03, -4.2 + i * 0.85);
      }
      box(inner, 0.5, 0.5, 0.5, M.warm, 0, a.h - 0.4, 0);                      // lampe
    }
  }));

  // Magasin
  const shop = enterable(scene, env, Object.assign(A(-15, 47), {
    id: 'town-shop', y: Y, w: 12, d: 14, h: 4.8, face: 'e', pal: 1, doorDz: 0, sign: 'STORE',
    fill: function (inner, a) {
      for (let k = -1; k <= 1; k += 2) {
        box(inner, 0.7, 2.0, 7, M.wood, -1 + k * 0, 1.0, k * 3.8);              // rayons
        box(inner, 0.5, 0.05, 6.6, M.woodLight, -1, 1.2, k * 3.8);
      }
      box(inner, 0.8, 1.0, 3, M.wood, 3.4, 0.5, -3.5);                         // caisse
      for (let i = 0; i < 14; i++) {
        const mt = new THREE.MeshStandardMaterial({ color: [0x7a2a22, 0x2a4a6a, 0x6a6a2a, 0x3a6a3a][i % 4], roughness: 1, emissive: 0x100c0a });
        box(inner, 0.3, 0.3, 0.3, mt, -1, 1.4 + (i % 2) * 0.3, (i < 7 ? 3.8 : -3.8) + ((i % 7) - 3) * 0.9);
      }
      box(inner, 0.5, 0.5, 0.5, M.warm, 0, a.h - 0.4, 0);
    }
  }));

  // Basilique : grande nef (axe est-ouest), porte vers la rue, clocher
  const bas = enterable(scene, env, Object.assign(A(-29, 75), {
    id: 'town-basilica', y: Y, w: 42, d: 20, h: 11, face: 'e', pal: 3, doorW: 3.2, doorH: 4.6, doorDz: 0,
    roof: 'gable', ridge: 'x', roofH: 7,
    fill: function (inner, a) {
      // allée centrale, bancs, autel
      for (let i = 0; i < 8; i++) for (const s of [-1, 1]) box(inner, 0.5, 0.9, 5.2, M.wood, 14 - i * 3.2, 0.45, s * 4.2);
      box(inner, 2.6, 1.1, 5.0, M.concrete, -a.w / 2 + 3, 0.55, 0);            // autel
      box(inner, 0.3, 2.2, 0.3, M.metalLight, -a.w / 2 + 3, 2.2, 0);            // croix
      box(inner, 0.3, 0.3, 1.2, M.metalLight, -a.w / 2 + 3, 2.9, 0);
      for (const z of [-7, 7]) for (let i = 0; i < 5; i++) box(inner, 1.0, a.h - 0.6, 1.0, M.concreteDark, 12 - i * 7, (a.h - 0.6) / 2, z);
      for (let i = 0; i < 6; i++) glow(inner, -a.w / 2 + 3 + (i % 2 ? 0.8 : -0.8), 1.4 + (i % 3) * 0.1, (i - 2.5) * 0.8, 0xffa040, 1.4, 0.6);
      box(inner, 0.6, 0.6, 0.6, M.warmDim, 6, a.h - 0.5, 0);
    }
  }));
  // clocher de la basilique (extérieur, plein)
  (function () {
    const x = P.x - 29 + 21 - 3.2, z = P.z + 75 - 10 - 3.2 + 0.0;     // coin est-nord de la nef
    const t = new THREE.Group();
    t.position.set(x, Y, z);
    scene.add(t);
    box(t, 6.4, 22, 6.4, M.concreteDark, 0, 11, 0);
    for (let i = 0; i < 3; i++) box(t, 1.1, 2.2, 0.2, M.dark, 0, 17, 3.25 * (i % 2 ? -1 : 1) * (i === 2 ? 0 : 1));
    addGable(t, 6.8, 5.5, 6.8, M.snow, 0, 22, 0, false);
    glow(t, 0, 17, 0, 0xffa860, 3, 0.25);
    env.rects.push({ x0: x - 3.2, x1: x + 3.2, z0: z - 3.2, z1: z + 3.2 });
  })();

  const enter = [news, shop, bas];

  // ---------- bâtiments factices ----------
  const F = function (rx, rz, w, d, h, face, pal, sign, roof) {
    const p = A(rx, rz);
    fakeBuilding(scene, env, { x: p.x, y: Y, z: p.z, w: w, d: d, h: h, face: face, pal: pal, sign: sign, roof: roof });
  };
  // côté ouest (portes vers l'est)
  F(-13, -37, 10, 14, 7.4, 'e', 0);
  F(-13, -18, 10, 16, 9.6, 'e', 2, null);
  F(-13, 1, 10, 14, 7.0, 'e', 1, null, 'gable');
  F(-14, 18, 12, 10, 7.4, 'e', 0, 'HOTEL');
  F(-34, -38, 14, 16, 8.4, 'e', 3);
  F(-34, -12, 14, 14, 6.4, 'e', 1, null, 'gable');
  // côté est (portes vers l'ouest)
  F(13, -58, 10, 12, 6.8, 'w', 1, null, 'gable');
  F(13, -40, 10, 14, 9.6, 'w', 0);
  F(13, -20, 10, 16, 7.4, 'w', 2);
  F(13, 0, 10, 14, 6.6, 'w', 4, null, 'gable');
  F(13, 18, 10, 12, 8.4, 'w', 1, 'CAFE');
  F(13, 47, 12, 16, 7.6, 'w', 0);
  F(14, 70, 12, 14, 9.6, 'w', 2);
  F(14, 92, 12, 14, 6.8, 'w', 3, null, 'gable');
  F(-14, 96, 12, 12, 7.0, 'e', 4, null, 'gable');
  // rue transversale
  F(-40, 48, 12, 14, 6.4, 'n', 0);
  F(38, 42, 14, 12, 8.6, 'n', 2);
  F(36, 12, 12, 12, 7.0, 's', 1, null, 'gable');
  F(-60, 14, 12, 12, 6.8, 's', 3, null, 'gable');

  // ---------- feux de circulation + lampadaires ----------
  const road = S.townx || { tx: 1, tz: 0 };
  env.traffic.intersection(scene, P.x, Y, P.z + 30, 0, 1, 6, 6);
  [[-8, -70], [8, -30], [-8, 8], [8, 50], [-8, 76], [8, 100], [-8, -105], [-50, 25], [50, 36], [-50, 36]].forEach(function (l, i) {
    const p = A(l[0], l[1]);
    lampPost(scene, p.x, Y, p.z, l[0] < 0 ? 0 : Math.PI);
    void i;
  });
  void road; void g;

  // ---------- panneau d'entrée de la ville (côté nord) ----------
  (function () {
    const p = A(7.5, -110);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), signMaterial('SLOW', '#6a1e14', '#f0dcc0', 256, 120));
    sg.position.set(p.x, Y + 2.4, p.z);
    sg.rotation.y = Math.PI;
    scene.add(sg);
    box(scene, 0.1, 2.4, 0.1, M.metal, p.x, Y + 1.2, p.z + 0.06);
  })();

  return {
    update: function (dt, time, px, pz, active) {
      enter.forEach(function (b) { b.update(dt, px, pz, active); });
    }
  };
}
