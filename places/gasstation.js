import * as THREE from 'three';
import { PLACES } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, signMaterial } from './common.js';

// ==========================================
// BAD THERAPIST — STATION-SERVICE (places/gasstation.js)
// ==========================================
// Factice pour l'instant : auvent, 4 pompes, petit bâtiment (porte non interactive), enseigne lumineuse.
// Coordonnées relatives au centre (PLACES.gas). La route arrive de l'ouest (z ≈ 0) ; l'auvent est au nord de la route.

export function buildGasStation(scene, env) {
  const P = PLACES.gas, Y = env.sites.gas.y, M = mats();
  const X = P.x, Z = P.z;

  // dalle de béton sous l'auvent
  box(scene, 30, 0.12, 22, M.concrete, X + 2, Y + 0.06, Z - 15);
  // auvent : 4 colonnes, toit, bandeau lumineux
  [[-9, -22], [-9, -8], [13, -22], [13, -8]].forEach(function (c) {
    box(scene, 0.6, 5.2, 0.6, M.concreteDark, X + c[0], Y + 2.6, Z + c[1]);
  });
  box(scene, 25, 0.5, 17, M.metal, X + 2, Y + 5.45, Z - 15);
  box(scene, 25.4, 0.12, 17.4, M.snow, X + 2, Y + 5.76, Z - 15);
  box(scene, 25.2, 0.35, 0.2, new THREE.MeshBasicMaterial({ color: 0xcfe0e8 }), X + 2, Y + 5.2, Z - 6.4);
  glow(scene, X + 2, Y + 4.4, Z - 15, 0xcfe8ff, 22, 0.28);
  // pompes
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.6, metalness: 0.3, emissive: 0x180806 });
  [[-4, -18], [-4, -12], [8, -18], [8, -12]].forEach(function (p) {
    box(scene, 0.9, 1.7, 0.55, pumpMat, X + p[0], Y + 0.95, Z + p[1]);
    box(scene, 0.5, 0.3, 0.05, new THREE.MeshBasicMaterial({ color: 0x9fd0a0 }), X + p[0], Y + 1.45, Z + p[1] + 0.3);
    box(scene, 1.6, 0.25, 1.2, M.concreteDark, X + p[0], Y + 0.19, Z + p[1]);
    env.rects.push({ x0: X + p[0] - 0.8, x1: X + p[0] + 0.8, z0: Z + p[1] - 0.6, z1: Z + p[1] + 0.6 });
  });
  [[-9, -22], [13, -22], [-9, -8], [13, -8]].forEach(function (c) {
    env.rects.push({ x0: X + c[0] - 0.4, x1: X + c[0] + 0.4, z0: Z + c[1] - 0.4, z1: Z + c[1] + 0.4 });
  });

  // petit bâtiment (porte vers le sud-est, factice)
  fakeBuilding(scene, env, { x: X + 20, y: Y, z: Z - 32, w: 10, d: 14, h: 4.2, face: 's', pal: 2, sign: 'SHOP', roof: 'flat' });

  // enseigne haute (mât + panneau)
  box(scene, 0.35, 9, 0.35, M.metal, X - 18, Y + 4.5, Z - 3);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), signMaterial('FUEL', '#10242c', '#9fe0c8', 256, 160));
  sg.position.set(X - 18, Y + 9.2, Z - 2.8);
  sg.rotation.y = Math.PI;
  scene.add(sg);
  const sg2 = sg.clone(); sg2.position.z = Z - 3.2; sg2.rotation.y = 0; scene.add(sg2);
  glow(scene, X - 18, Y + 9.2, Z - 3, 0x9fe0c8, 9, 0.35);
  env.rects.push({ x0: X - 18.3, x1: X - 17.7, z0: Z - 3.3, z1: Z - 2.7 });

  [[-14, -26], [18, -4], [22, -20]].forEach(function (l) { lampPost(scene, X + l[0], Y, Z + l[1], l[0] < 0 ? 0 : Math.PI); });

  return { update: function () {} };
}
