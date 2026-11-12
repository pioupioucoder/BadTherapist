import * as THREE from 'three';
import { PLACES } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, enterable } from './common.js';

// ==========================================
// BAD THERAPIST — VILLE B : BIBLIOTHÈQUE, POLICE, PRISON (places/cityb.js)
// ==========================================
// Accessible seulement en train (voir bridge.js). Factice sauf la bibliothèque et le commissariat
// (porte qui s'ouvre, petit intérieur). La prison est un bloc fermé derrière le commissariat.
// Coordonnées relatives au centre (PLACES.cityB) : x vers l'est, z vers le sud.

export function buildCityB(scene, env) {
  const P = PLACES.cityB, Y = env.sites.cityB.y, M = mats();
  const A = function (rx, rz) { return { x: P.x + rx, z: P.z + rz }; };

  // Bibliothèque
  const lib = enterable(scene, env, Object.assign(A(-16, -45), {
    id: 'b-library', y: Y, w: 14, d: 18, h: 8, face: 'e', pal: 1, doorW: 2.2, doorH: 3, sign: 'LIBRARY',
    fill: function (inner, a) {
      for (let r = 0; r < 4; r++) {
        const z = -6 + r * 3.8;
        box(inner, 0.5, 2.6, 6, M.wood, -1 + 0, 1.3, z * 0 + (r - 1.5) * 3.8);
      }
      for (let r = 0; r < 3; r++) box(inner, 0.5, 2.4, 14 - 4, M.wood, -a.w / 2 + 0.5, 1.2, 0);
      box(inner, 1.4, 1.0, 3, M.woodLight, 3, 0.5, 5);                       // bureau
      for (let k = 0; k < 2; k++) glow(inner, 3, 1.5, 5 - k * 0.5, 0xffc880, 1.2, 0.5);
      box(inner, 0.5, 0.5, 0.5, M.warm, 0, a.h - 0.5, 0);
    }
  }));

  // Commissariat
  const pol = enterable(scene, env, Object.assign(A(-15, 40), {
    id: 'b-police', y: Y, w: 12, d: 16, h: 6.6, face: 'e', pal: 2, doorW: 1.8, doorH: 2.6, sign: 'POLICE',
    fill: function (inner, a) {
      box(inner, 0.9, 1.1, 6, M.metal, 1.5, 0.55, 0);                        // comptoir
      box(inner, 1.6, 0.8, 1.2, M.woodLight, -2.5, 0.4, 4);                  // bureau
      box(inner, 1.6, 0.8, 1.2, M.woodLight, -2.5, 0.4, -4);
      box(inner, 0.5, 0.5, 0.5, new THREE.MeshBasicMaterial({ color: 0x6aa0ff }), 0, a.h - 0.5, 0);
    }
  }));

  // Prison : bloc + mur d'enceinte + mirador
  (function () {
    const c = A(-47, 45);
    fakeBuilding(scene, env, { x: c.x, y: Y, z: c.z, w: 22, d: 28, h: 9, face: 'e', pal: 3, roof: 'flat' });
    const x0 = P.x - 70, x1 = P.x - 28, z0 = P.z + 22, z1 = P.z + 68, T = 0.7, H = 4.6;
    const wallM = M.concreteDark;
    box(scene, x1 - x0, H, T, wallM, (x0 + x1) / 2, Y + H / 2, z0);
    box(scene, x1 - x0, H, T, wallM, (x0 + x1) / 2, Y + H / 2, z1);
    box(scene, T, H, z1 - z0, wallM, x0, Y + H / 2, (z0 + z1) / 2);
    box(scene, T, H, z1 - z0, wallM, x1, Y + H / 2, (z0 + z1) / 2);
    env.rects.push({ x0: x0 - T, x1: x1 + T, z0: z0 - T / 2, z1: z0 + T / 2 }, { x0: x0 - T, x1: x1 + T, z0: z1 - T / 2, z1: z1 + T / 2 },
      { x0: x0 - T / 2, x1: x0 + T / 2, z0: z0, z1: z1 }, { x0: x1 - T / 2, x1: x1 + T / 2, z0: z0, z1: z1 });
    // fil de fer (bande sombre) + projecteur
    box(scene, x1 - x0, 0.5, 0.2, M.dark, (x0 + x1) / 2, Y + H + 0.3, z1);
    const tw = [x0 + 1.5, z1 - 1.5];
    box(scene, 3, 9, 3, M.concreteDark, tw[0], Y + 4.5, tw[1]);
    box(scene, 3.6, 0.4, 3.6, M.snow, tw[0], Y + 9.2, tw[1]);
    glow(scene, tw[0], Y + 8.4, tw[1] - 1.7, 0xcfe0ff, 7, 0.5);
    env.rects.push({ x0: tw[0] - 1.5, x1: tw[0] + 1.5, z0: tw[1] - 1.5, z1: tw[1] + 1.5 });
    // barreaux (fenêtres de cellules, factices)
    for (let i = 0; i < 9; i++) {
      for (let r = 0; r < 2; r++) box(scene, 0.06, 1.0, 0.6, new THREE.MeshBasicMaterial({ color: 0x3a3426 }), c.x + 11.05, Y + 3 + r * 3.2, c.z - 12 + i * 3);
    }
  })();

  const F = function (rx, rz, w, d, h, face, pal, sign, roof) {
    const p = A(rx, rz);
    fakeBuilding(scene, env, { x: p.x, y: Y, z: p.z, w: w, d: d, h: h, face: face, pal: pal, sign: sign, roof: roof });
  };
  // côté ouest
  F(-13, -22, 10, 14, 7.4, 'e', 0);
  F(-13, -4, 10, 14, 9.4, 'e', 2, 'BANK');
  F(-14, 20, 12, 12, 6.8, 'e', 4, null, 'gable');
  F(-14, 70, 12, 16, 7.4, 'e', 0);
  F(-40, -45, 16, 18, 8.6, 'e', 3);
  // côté est
  F(13, -70, 10, 14, 6.8, 'w', 1, null, 'gable');
  F(13, -50, 10, 14, 9.6, 'w', 2);
  F(13, -30, 10, 16, 7.4, 'w', 0, 'CAFE');
  F(13, -8, 10, 14, 6.6, 'w', 4, null, 'gable');
  F(13, 20, 10, 14, 8.4, 'w', 1);
  F(13, 42, 12, 16, 9.6, 'w', 2);
  F(13, 66, 12, 14, 7.0, 'w', 3, null, 'gable');
  // rue transversale
  F(-30, -14, 12, 12, 6.4, 's', 2);
  F(32, 14, 12, 12, 8.2, 'n', 0);

  env.traffic.intersection(scene, P.x, Y, P.z, 0, 1, 6, 6);
  [[-8, -85], [8, -60], [-8, -40], [8, -12], [-8, 15], [8, 40], [-8, 65], [8, 90], [-40, 8], [40, -8]].forEach(function (l) {
    const p = A(l[0], l[1]);
    lampPost(scene, p.x, Y, p.z, l[0] < 0 ? 0 : Math.PI);
  });

  return {
    update: function (dt, time, px, pz, active) { lib.update(dt, px, pz, active); pol.update(dt, px, pz, active); }
  };
}
