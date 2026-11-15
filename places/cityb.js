import * as THREE from 'three';
import { PLACES } from './layout.js';
import { mats, box, glow, lampPost, fakeBuilding, enterable, signMaterial } from './common.js';

// ==========================================
// BAD THERAPIST — VILLE B : BIBLIOTHÈQUE, POLICE, PRISON (places/cityb.js)
// ==========================================
// Accessible seulement en train (voir bridge.js). Factice sauf la bibliothèque, le commissariat et la PRISON
// (porte qui s'ouvre, intérieur). La prison est derrière le commissariat, entourée d'un mur avec un portail : c'est chez Leon.
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

  // Prison : bloc AVEC INTÉRIEUR (accueil, couloir de cellules, chambre de Leon) + mur d'enceinte avec portail + mirador
  //   accueil (côté porte) -> couloir -> 6 cellules (3 de chaque côté) ; au fond, la chambre de Leon : lit, bureau avec le téléphone
  //   d'où il envoie ses rapports, étagères, coin cuisine. Les cellules sont fermées (grilles) : on les voit, on n'y entre pas.
  const prisonC = A(-47, 45);
  const prisonLed = new THREE.MeshBasicMaterial({ color: 0x300a06 });

  function prisonFill(inner, a) {
    const c = prisonC, y0 = 0.06, H = a.h;
    const navy = new THREE.MeshStandardMaterial({ color: 0x1f2f4a, roughness: 1 });
    const grey = new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 1 });
    const sheet = new THREE.MeshStandardMaterial({ color: 0x8d8f86, roughness: 1 });
    const pillow = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 1 });
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xcfd3d4, roughness: 0.5 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xcbc3ad, roughness: 1, emissive: 0x15130e });
    const rug = new THREE.MeshStandardMaterial({ color: 0x5a2c2c, roughness: 1 });
    const screen = new THREE.MeshBasicMaterial({ color: 0x3a7ec9 });
    const bar = new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.6, roughness: 0.5 });

    function put(w, h, d, mat, x, yb, z) { return box(inner, w, h, d, mat, x, y0 + yb + h / 2, z); }
    function col(x0, x1, z0, z1) { env.rects.push({ x0: c.x + x0, x1: c.x + x1, z0: c.z + z0, z1: c.z + z1 }); }
    function wallZ(x, z0, z1) { put(0.24, H - 0.1, z1 - z0, M.inner, x, 0, (z0 + z1) / 2); col(x - 0.12, x + 0.12, z0, z1); }     // mur dans l'axe z
    function wallX(z, x0, x1) { put(x1 - x0, H - 0.1, 0.24, M.inner, (x0 + x1) / 2, 0, z); col(x0, x1, z - 0.12, z + 0.12); }     // mur dans l'axe x
    function lamp(x, z) { put(0.6, 0.08, 0.3, M.warm, x, H - 0.25, z); glow(inner, x, H - 0.6, z, 0xffd8a0, 4.2, 0.34); }
    function plate(text, bg, fg, w, h, x, y, z, ry, pw, ph) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(text, bg, fg, pw || 256, ph || 64));
      m.position.set(x, y0 + y, z); m.rotation.y = ry || 0; inner.add(m);
    }

    // --- cloisons ---
    wallZ(3.5, -14, -1.4); wallZ(3.5, 1.4, 14);                              // accueil | couloir des cellules
    put(0.24, H - 0.1 - 2.8, 2.8, M.inner, 3.5, 2.8, 0);                     // linteau de l'ouverture
    wallZ(-5.5, -14, -1.2); wallZ(-5.5, 1.2, 14);                            // couloir | chambre de Leon
    put(0.24, H - 0.1 - 2.5, 2.4, M.inner, -5.5, 2.5, 0);
    wallX(-7.5, -5.5, 3.5); wallX(7.5, -5.5, 3.5);                           // fond des cellules (derrière : deux réserves fermées)
    plate('POLICE', '#0e2145', '#e8ecef', 3.4, 0.64, 3.63, 3.55, 0, Math.PI / 2, 512, 96);

    // --- cellules : grilles, couchettes, toilettes, numéros ---
    const xs = [-5.5, -2.5, 0.5, 3.5];
    [-1, 1].forEach(function (side) {
      const zF = side * 2, zB = side * 7.5;
      if (side) { wallZ(-2.5, Math.min(zF, zB), Math.max(zF, zB)); wallZ(0.5, Math.min(zF, zB), Math.max(zF, zB)); }
      col(xs[0], xs[3], zF - 0.1, zF + 0.1);
      for (let i = 0; i < 3; i++) {
        const x0 = xs[i], x1 = xs[i + 1], xc = (x0 + x1) / 2, n = (side < 0 ? 1 : 4) + i;
        put(x1 - x0, H - 0.1 - 3.1, 0.2, M.inner, xc, 3.1, zF);                               // au-dessus des barreaux
        put(x1 - x0, 0.06, 0.08, bar, xc, 3.04, zF); put(x1 - x0, 0.06, 0.08, bar, xc, 0.05, zF); put(x1 - x0, 0.05, 0.08, bar, xc, 1.5, zF);
        for (let k = 0; k * 0.2 < x1 - x0 - 0.1; k++) put(0.04, 3.04, 0.04, bar, x0 + 0.1 + k * 0.2, 0, zF);
        put(0.1, 3.04, 0.1, bar, xc - 0.5, 0, zF); put(0.1, 3.04, 0.1, bar, xc + 0.5, 0, zF);   // cadre de la porte de cellule
        put(0.08, 0.2, 0.06, M.metalLight, xc + 0.38, 1.0, zF - side * 0.06);
        plate('CELL ' + n, '#14181c', '#e8d6a8', 1.4, 0.35, xc, 3.55, zF - side * 0.11, side > 0 ? Math.PI : 0);
        // couchette (lit du bas + lit du haut), toilettes, petite lampe
        put(0.1, 1.7, 0.1, bar, x0 + 0.2, 0, zB - side * 0.2); put(0.1, 1.7, 0.1, bar, x0 + 1.15, 0, zB - side * 0.2);
        put(0.1, 1.7, 0.1, bar, x0 + 0.2, 0, zB - side * 2.1); put(0.1, 1.7, 0.1, bar, x0 + 1.15, 0, zB - side * 2.1);
        put(0.95, 0.1, 2.0, grey, x0 + 0.68, 0.42, zB - side * 1.15); put(0.95, 0.1, 2.0, grey, x0 + 0.68, 1.3, zB - side * 1.15);
        put(0.85, 0.08, 1.2, sheet, x0 + 0.68, 0.52, zB - side * 1.5);
        put(0.4, 0.45, 0.45, porcelain, x1 - 0.5, 0, zB - side * 0.35);
        put(0.5, 0.06, 0.25, M.warmDim, xc, H - 0.25, (zF + zB) / 2);
      }
    });
    lamp(-2.5, 0); lamp(0.5, 0); lamp(-4.5, 0);

    // --- accueil ---
    put(1.0, 1.1, 5.8, M.woodLight, 7.6, 0, 4.7); put(1.3, 0.08, 6.0, M.wood, 7.6, 1.1, 4.7); col(7.1, 8.1, 1.8, 7.6);
    put(1.2, 0.8, 2.6, M.woodLight, 9.6, 0, 4.7); put(0.5, 0.35, 0.06, M.dark, 9.45, 0.95, 4.7); put(0.4, 0.26, 0.02, screen, 9.4, 0.99, 4.7); col(9.0, 10.2, 3.4, 6.0);
    put(0.5, 0.45, 4.5, M.wood, 10.2, 0, -6.5); put(0.1, 0.5, 4.5, M.wood, 10.6, 0.45, -6.5); col(9.9, 10.8, -8.8, -4.2);       // banc
    put(3.4, 1.5, 0.06, M.wood, 7, 0.9, -13.85);
    plate('WANTED', '#c9b88a', '#2b1d12', 1.3, 0.65, 5.9, 2.1, -13.8, 0, 256, 128);
    for (let k = 0; k < 4; k++) put(0.32, 0.42, 0.02, paper, 6.4 + k * 0.5, 1.3 + (k % 2) * 0.35, -13.8);
    lamp(8, 0); lamp(8, -8); lamp(8, 8);

    // --- chambre de Leon (tout au fond, à l'ouest) ---
    put(1.05, 0.35, 2.1, M.wood, -9.9, 0, -11.4); put(0.95, 0.18, 2.0, navy, -9.9, 0.35, -11.4); put(0.7, 0.12, 0.4, pillow, -9.9, 0.53, -12.2);
    col(-10.5, -9.3, -12.5, -10.3);                                                                                                  // LE LIT
    put(0.45, 0.5, 0.45, M.wood, -10.6, 0, -13.5); put(0.12, 0.3, 0.12, M.warm, -10.6, 0.5, -13.5); glow(inner, -10.6, y0 + 0.95, -13.5, 0xffc880, 2.4, 0.5); col(-10.85, -10.35, -13.75, -13.25);
    put(1.0, 2.2, 0.6, M.wood, -7.0, 0, -13.6); col(-7.5, -6.5, -13.95, -13.25);                                                      // armoire
    put(2.0, 0.02, 3.0, rug, -8.2, 0, -8.5);
    put(0.05, 1.7, 0.05, M.metalLight, -6.2, 0, -2.2); put(0.3, 0.1, 0.3, navy, -6.2, 1.7, -2.2);                                     // porte-manteau et casquette
    // bureau + TÉLÉPHONE des rapports
    put(0.8, 0.78, 2.0, M.woodLight, -10.4, 0, 0); put(0.9, 0.05, 2.1, M.wood, -10.4, 0.78, 0); col(-10.85, -9.95, -1.1, 1.1);
    put(0.45, 0.45, 0.45, M.wood, -9.4, 0, 0); put(0.5, 0.06, 0.5, grey, -9.4, 0.45, 0);                                               // chaise
    put(0.26, 0.09, 0.2, M.dark, -10.3, 0.83, 0.4); put(0.24, 0.05, 0.07, M.dark, -10.3, 0.92, 0.4); put(0.12, 0.01, 0.1, M.warm, -10.3, 0.925, 0.46);
    const led = box(inner, 0.035, 0.035, 0.035, prisonLed, -10.2, y0 + 0.97, 0.3); led.userData.dyn = true;                           // voyant du téléphone
    put(0.1, 0.3, 0.1, M.metalLight, -10.7, 0.83, -0.7); glow(inner, -10.7, y0 + 1.2, -0.7, 0xffd8a0, 2.6, 0.45);
    put(0.3, 0.02, 0.22, paper, -10.3, 0.83, -0.2); put(0.3, 0.1, 0.25, M.metal, -10.3, 0.83, -0.5);
    // dossiers, étagères, coin cuisine
    put(0.4, 2.2, 9, M.wood, -10.7, 0, 7.5); col(-10.9, -10.5, 3, 12);
    for (let k = 0; k < 14; k++) put(0.25, 0.3 + (k % 3) * 0.08, 0.5, k % 2 ? navy : grey, -10.55, 0.4 + (k % 4) * 0.5, 3.4 + k * 0.62);
    put(1.6, 0.9, 0.6, M.metalLight, -8.5, 0, 13.5); put(0.4, 0.05, 0.4, M.dark, -8.9, 0.9, 13.5); put(0.14, 0.2, 0.14, grey, -8.1, 0.9, 13.5); col(-9.3, -7.7, 13.2, 13.8);
    put(0.9, 0.75, 0.9, M.woodLight, -8.0, 0, 8.0); put(0.4, 0.45, 0.4, M.wood, -8.0, 0, 9.0); put(0.4, 0.45, 0.4, M.wood, -8.0, 0, 7.0); col(-8.5, -7.5, 7.5, 8.5);
    lamp(-8.2, 0); lamp(-8.2, -9); lamp(-8.2, 8);
  }

  const prison = enterable(scene, env, {
    id: 'b-prison', x: prisonC.x, y: Y, z: prisonC.z, w: 22, d: 28, h: 7.4, face: 'e', pal: 3, doorW: 2.2, doorH: 3.0, sign: 'PRISON',
    fill: prisonFill
  });

  (function () {
    const c = prisonC;
    const x0 = P.x - 70, x1 = P.x - 28, z0 = P.z + 22, z1 = P.z + 68, T = 0.7, H = 4.6;
    const g0 = P.z + 50, g1 = P.z + 58;                                  // portail (8 m) côté rue, entre le commissariat et l'immeuble du sud
    const wallM = M.concreteDark;
    box(scene, x1 - x0, H, T, wallM, (x0 + x1) / 2, Y + H / 2, z0);
    box(scene, x1 - x0, H, T, wallM, (x0 + x1) / 2, Y + H / 2, z1);
    box(scene, T, H, z1 - z0, wallM, x0, Y + H / 2, (z0 + z1) / 2);
    box(scene, T, H, g0 - z0, wallM, x1, Y + H / 2, (z0 + g0) / 2);      // mur est : deux morceaux autour du portail
    box(scene, T, H, z1 - g1, wallM, x1, Y + H / 2, (g1 + z1) / 2);
    env.rects.push({ x0: x0 - T, x1: x1 + T, z0: z0 - T / 2, z1: z0 + T / 2 }, { x0: x0 - T, x1: x1 + T, z0: z1 - T / 2, z1: z1 + T / 2 },
      { x0: x0 - T / 2, x1: x0 + T / 2, z0: z0, z1: z1 }, { x0: x1 - T / 2, x1: x1 + T / 2, z0: z0, z1: g0 }, { x0: x1 - T / 2, x1: x1 + T / 2, z0: g1, z1: z1 });
    [g0, g1].forEach(function (gz) {                                     // piliers du portail + lampes
      box(scene, 1.0, H + 1.0, 1.0, wallM, x1, Y + (H + 1.0) / 2, gz);
      box(scene, 1.3, 0.2, 1.3, M.snow, x1, Y + H + 1.1, gz);
      glow(scene, x1 - 0.5, Y + H + 0.6, gz, 0xffd8a0, 3.4, 0.4);
      env.rects.push({ x0: x1 - 0.5, x1: x1 + 0.5, z0: gz - 0.5, z1: gz + 0.5 });
    });
    box(scene, 0.3, 0.9, g1 - g0, M.dark, x1, Y + H + 0.6, (g0 + g1) / 2);   // linteau métallique au-dessus
    // fil de fer (bande sombre) + projecteur
    box(scene, x1 - x0, 0.5, 0.2, M.dark, (x0 + x1) / 2, Y + H + 0.3, z1);
    const tw = [x0 + 1.5, z1 - 1.5];
    box(scene, 3, 9, 3, M.concreteDark, tw[0], Y + 4.5, tw[1]);
    box(scene, 3.6, 0.4, 3.6, M.snow, tw[0], Y + 9.2, tw[1]);
    glow(scene, tw[0], Y + 8.4, tw[1] - 1.7, 0xcfe0ff, 7, 0.5);
    env.rects.push({ x0: tw[0] - 1.5, x1: tw[0] + 1.5, z0: tw[1] - 1.5, z1: tw[1] + 1.5 });
    // barreaux (fenêtres de cellules, factices) sur la façade est, de part et d'autre de la porte
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      for (let r = 0; r < 2; r++) box(scene, 0.06, 1.0, 0.6, new THREE.MeshBasicMaterial({ color: 0x3a3426 }), c.x + 11.05, Y + 3 + r * 2.4, c.z - 12 + i * 3);
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
    update: function (dt, time, px, pz, active) {
      lib.update(dt, px, pz, active); pol.update(dt, px, pz, active); prison.update(dt, px, pz, active);
      prisonLed.color.setHex(Math.sin(time * 4) > 0.2 ? 0xff3020 : 0x300a06);        // le voyant du téléphone de Leon clignote
    }
  };
}
