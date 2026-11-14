import * as THREE from 'three';
import { PLACES, SEA } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, mulberry32 } from './common.js';

// ==========================================
// BAD THERAPIST — PORT (places/port.js)
// ==========================================
// Mer noire au sud (z > SEA.z0), quai, conteneurs, entrepôts, deux grues, un cargo amarré, feux de circulation.
// Factice : rien d'interactif pour le moment.

export function buildPort(scene, env) {
  const P = PLACES.port, Y = env.sites.port.y, M = mats();
  const rnd = mulberry32(4242);

  // mer
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 700),
    new THREE.MeshStandardMaterial({ color: 0x08141b, roughness: 0.18, metalness: 0.55, emissive: 0x03080b })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(390, SEA.y, SEA.z0 - 7 + 350);
  scene.add(water);

  // quai
  const qz0 = P.z + 18, qz1 = SEA.z0 - 3;
  box(scene, 230, 3, qz1 - qz0, M.concrete, P.x, Y - 1.45, (qz0 + qz1) / 2);
  box(scene, 230, 0.4, 0.5, new THREE.MeshBasicMaterial({ color: 0x8a7a3a }), P.x, Y + 0.12, qz1 - 1.2);
  for (let x = P.x - 110; x <= P.x + 110; x += 14) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.7, 8), M.metal);
    b.position.set(x, Y + 0.4, qz1 - 0.6);
    scene.add(b);
  }

  // conteneurs (instances colorées)
  const cols = [0x6a2a22, 0x23405c, 0x2f5a3a, 0x7a6a28, 0x4a4a52, 0x5a3a5c];
  const spots = [];
  for (let blk = 0; blk < 3; blk++) {
    const bx = P.x - 100 + blk * 70;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const stack = 1 + Math.floor(rnd() * 3);
      const x = bx + col * 13.5, z = P.z - 62 + row * 3.5 + (blk % 2) * 6;
      for (let h = 0; h < stack; h++) spots.push([x, Y + 1.3 + h * 2.6, z, rnd()]);
      env.rects.push({ x0: x - 6.2, x1: x + 6.2, z0: z - 1.4, z1: z + 1.4 });
    }
  }
  const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 2.5, 2.5), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.3 }), spots.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(function (s, i) {
    m4.makeTranslation(s[0], s[1], s[2]);
    cm.setMatrixAt(i, m4);
    c.setHex(cols[Math.floor(s[3] * cols.length) % cols.length]);
    cm.setColorAt(i, c);
  });
  cm.instanceColor.needsUpdate = true;
  scene.add(cm);

  // entrepôts
  fakeBuilding(scene, env, { x: P.x - 85, y: Y, z: P.z + 2, w: 28, d: 18, h: 8, face: 's', pal: 2, roof: 'flat', doorDz: 0 });
  fakeBuilding(scene, env, { x: P.x + 85, y: Y, z: P.z + 4, w: 28, d: 18, h: 9, face: 'n', pal: 3, roof: 'flat' });
  fakeBuilding(scene, env, { x: P.x + 40, y: Y, z: P.z - 20, w: 12, d: 10, h: 5, face: 's', pal: 0, roof: 'gable', sign: 'PORT' });

  // grues
  [P.x - 40, P.x + 60].forEach(function (cx) {
    const cz = qz1 - 5;
    [[-6, 0], [6, 0], [-6, 9], [6, 9]].forEach(function (l) {
      box(scene, 0.9, 18, 0.9, new THREE.MeshStandardMaterial({ color: 0x8a5a1c, roughness: 0.7, metalness: 0.4, emissive: 0x140c04 }), cx + l[0], Y + 9, cz + l[1]);
    });
    box(scene, 13.5, 1.1, 10.5, M.metal, cx, Y + 18.4, cz + 4.5);
    box(scene, 1.4, 1.3, 46, new THREE.MeshStandardMaterial({ color: 0x8a5a1c, roughness: 0.7, metalness: 0.4, emissive: 0x140c04 }), cx, Y + 19.4, cz + 13);
    box(scene, 14, 0.3, 48, M.snow, cx, Y + 20.2, cz + 13);
    glow(scene, cx, Y + 20.8, cz + 30, 0xff5030, 3, 0.7);
    env.rects.push({ x0: cx - 7, x1: cx + 7, z0: cz - 1, z1: cz + 10 });
  });

  // cargo amarré le long du quai
  (function () {
    const g = new THREE.Group();
    g.position.set(P.x + 10, SEA.y, SEA.z0 + 4);
    scene.add(g);
    const hull = new THREE.MeshStandardMaterial({ color: 0x1e2a33, roughness: 0.7, metalness: 0.4 });
    box(g, 78, 7, 15, hull, 0, 0.5, 0);
    box(g, 12, 7, 15, hull, 44, 0.5, 0).scale.set(1, 1, 0.7);
    box(g, 78.4, 0.5, 15.4, new THREE.MeshStandardMaterial({ color: 0x6a1e16, roughness: 0.8 }), 0, 4.2, 0);
    box(g, 14, 9, 11, M.metalLight, -28, 8.5, 0);
    box(g, 4, 5, 4, new THREE.MeshStandardMaterial({ color: 0x6a1e16, roughness: 0.8 }), -32, 15, 0);
    box(g, 14.4, 0.3, 11.4, M.snow, -28, 13.1, 0);
    box(g, 50, 0.3, 14, M.snow, 8, 4.2, 0);
    for (let i = 0; i < 6; i++) box(g, 0.1, 1.0, 1.2, new THREE.MeshBasicMaterial({ color: 0x9c7440 }), -21.05, 9 + (i % 2) * 2.4, -4 + (i >> 1) * 4);
    glow(g, -28, 13.5, 0, 0xffe0b0, 5, 0.35);
  })();

  // éclairage
  [[-60, 20], [-20, 20], [20, 20], [60, 20], [-90, -20], [90, -20], [-60, -20], [20, -20], [60, -20]].forEach(function (l, i) {
    lampPost(scene, P.x + l[0], Y, P.z + l[1] - 10 + (i < 4 ? 20 : 0), i % 2 ? Math.PI : 0);
  });
  env.traffic.intersection(scene, P.x, Y, P.z, 0, 1, 6, 6);

  return { update: function () {} };
}
