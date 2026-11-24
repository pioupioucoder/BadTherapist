import * as THREE from 'three';
import { createTank } from './fuel.js';
import { createFuelGauge } from './fuel-gauge.js';

// ==========================================
// BAD THERAPIST — LE BUS (objects/bus.js)
// ==========================================
// Un bus urbain moderne, conduit par l'avatar Violet (engine/bus-line.js lui donne sa ligne et son cerveau).
//   • plancher bas, grandes vitres teintées, intérieur éclairé (sièges, barres jaunes, écran du conducteur) ;
//   • PORTES AUTOMATIQUES (avant et milieu) : carillon, elles s'ouvrent en coulissant, le bus « s'agenouille » un peu ;
//   • afficheurs à points orange (numéro de ligne + prochain arrêt) devant, sur le côté et derrière ;
//   • clignotants, feux stop, feu de recul + bip de recul, phares, éclairage de plancher qui rayonne dans la neige ;
//   • conduite automatique sur le réseau de routes (roadnet.js) : ralentit dans les virages, S'ARRÊTE AUX FEUX ROUGES
//     (options.signals) et devant un obstacle (options.obstacles : taxi, camion, toi à pied) ;
//   • demi-tour en trois manœuvres (marche arrière comprise) aux terminus ;
//   • tu peux monter (bouton ENTER, portes ouvertes) et descendre (EXIT) à chaque arrêt ;
//   • on ENTRE ET ON SORT À PIED par les portes ouvertes (aucun bouton) ; dans le bus on marche librement dans l'allée,
//     on CLIQUE SUR UN SIÈGE pour s'y asseoir (même si on est déjà assis ailleurs : on se lève et on y va),
//     on CLIQUE SUR LE SOL pour se lever à cet endroit, ou on bouge (ZQSD / WASD / flèches) pour se relever ; aucun message à l'écran ;
//     de vrais caissons de passage de roue à l'intérieur (comme dans un vrai bus), l'essieu avant est derrière la porte avant ;
//   • le bus est SOLIDE : le joueur, les avatars et le camion le contournent (bus.collide), sauf par les portes ouvertes ;
//   • détails de vrai bus : sifflement pneumatique des portes et du frein, essuie-glaces, afficheur « prochain arrêt » dans l'allée,
//     lumière qui coule sur la neige devant les portes quand elles s'ouvrent.
//
// Repère : comme taxi.js / vehicle.js. Avant du bus = -z local ; cap h -> avant (-sin h, -cos h), droite (cos h, -sin h).
// Le conducteur est à GAUCHE, les portes à DROITE (on roule à droite).
// Repère « bus » du joueur : x vers la droite, z vers l'arrière (l'avant du bus est -z).
//
// Réglage en direct (F12) : BadTherapistBus.driver(x, y, z, yawEnDegres)

const L = 11.6, W = 2.55, FLOOR = 0.36;
const DRIVER = { x: -0.88, y: FLOOR, z: -4.25, yaw: Math.PI };       // pieds du conducteur (repère du bus)
const WHEEL = { x: -0.88, y: 1.12, z: -4.62 };
const DOOR_Z = [-4.3, 0.0];                                           // centres des deux portes (côté droit)
let ACC = 3.2;                                                        // accélération (réglable : bus.setAcc / BadTherapistBusLine.cfg.acc)
const BRK_E = 6.5;                                                    // freinage d'urgence (feu rouge, obstacle)
const DOOR_TIME = 1.7;                                                // secondes pour ouvrir / fermer

function ss(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export function createBus(parent, o) {

  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const camera = o.camera;
  const groundH = o.groundH || function () { return 0; };
  const net = o.net;                                  // roadnet.js (pour sampleAt)

  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  parent.add(g);

  // ==========================================
  // MATÉRIAUX
  // ==========================================
  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0xe6eaec, roughness: 0.42, metalness: 0.25, emissive: 0x15181a }),
    accent: new THREE.MeshStandardMaterial({ color: 0x0f9fa6, roughness: 0.4, metalness: 0.3, emissive: 0x04282a }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.75, metalness: 0.35 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xd9dee1, roughness: 0.5, metalness: 0.3, emissive: 0x121517 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.4, metalness: 0.75 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.9 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1b6f78, roughness: 0.95 }),
    seatB: new THREE.MeshStandardMaterial({ color: 0x2a2f35, roughness: 0.9 }),
    pole: new THREE.MeshStandardMaterial({ color: 0xf0c000, roughness: 0.45, metalness: 0.4, emissive: 0x2a2000 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x25343e, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
    glassLight: new THREE.MeshStandardMaterial({ color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1d6 }),
    inner: new THREE.MeshBasicMaterial({ color: 0xffeccc }),
    tail: new THREE.MeshBasicMaterial({ color: 0x6a1008 }),
    rev: new THREE.MeshBasicMaterial({ color: 0x3a3a3a }),
    indL: new THREE.MeshBasicMaterial({ color: 0x2a1800 }),
    indR: new THREE.MeshBasicMaterial({ color: 0x2a1800 }),
    doorLight: new THREE.MeshBasicMaterial({ color: 0x16301a }),
    screen: new THREE.MeshBasicMaterial({ color: 0x3fd1ff }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
  };

  function box(w, h, d, mat, x, y, z, par) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (par || g).add(m);
    return m;
  }
  function cyl(r, h, mat, x, y, z, rx, rz, par) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (rz) m.rotation.z = rz;
    (par || g).add(m);
    return m;
  }
  function plane(w, h, mat, x, y, z, ry, par) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    (par || g).add(m);
    return m;
  }
  // Barre à coins arrondis (profil en X/Y, extrudée sur len le long de z)
  function roundedBar(w, h, rt, rb, len, mat, x, y, z) {
    const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2;
    s.moveTo(x0 + rb, 0); s.lineTo(x1 - rb, 0); s.quadraticCurveTo(x1, 0, x1, rb);
    s.lineTo(x1, h - rt); s.quadraticCurveTo(x1, h, x1 - rt, h);
    s.lineTo(x0 + rt, h); s.quadraticCurveTo(x0, h, x0, h - rt);
    s.lineTo(x0, rb); s.quadraticCurveTo(x0, 0, x0 + rb, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -len / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  // ==========================================
  // CARROSSERIE
  // ==========================================
  const WIN0 = 1.04, WIN1 = 2.44, WH = WIN1 - WIN0, WY = (WIN0 + WIN1) / 2;     // bande vitrée
  const XW = W / 2 - 0.04;

  // Plancher + châssis
  box(W - 0.12, 0.1, L - 0.4, M.dark, 0, 0.3, 0);
  box(W - 0.3, 0.04, L - 1.3, M.floor, 0, FLOOR, 0.1);

  // Extrémités arrondies (calandre avant / arrière) : tout en bas jusqu'au bas des vitres
  roundedBar(W, 0.78, 0.07, 0.12, 0.7, M.body, 0, 0.27, -L / 2 + 0.35);
  roundedBar(W, 0.78, 0.07, 0.12, 0.7, M.body, 0, 0.27, L / 2 - 0.35);
  roundedBar(W + 0.02, 0.2, 0.04, 0.04, 0.72, M.accent, 0, 0.58, -L / 2 + 0.35);
  roundedBar(W + 0.02, 0.2, 0.04, 0.04, 0.72, M.accent, 0, 0.58, L / 2 - 0.35);

  // Flancs (murs fins, pour que l'intérieur soit creux et visible) — côté droit : trous pour les deux portes
  function wall(x, z0, z1) {
    const len = z1 - z0;
    box(0.08, 0.76, len, M.body, x, 0.65, (z0 + z1) / 2);
    box(0.09, 0.18, len, M.accent, x + Math.sign(x) * 0.005, 0.64, (z0 + z1) / 2);
  }
  wall(-XW, -L / 2 + 0.7, L / 2 - 0.7);
  const DW = 1.2;                                                   // largeur d'une porte
  const rZ = [[-L / 2 + 0.7, DOOR_Z[0] - DW / 2], [DOOR_Z[0] + DW / 2, DOOR_Z[1] - DW / 2], [DOOR_Z[1] + DW / 2, L / 2 - 0.7]];
  rZ.forEach(function (r) { wall(XW, r[0], r[1]); });
  // marches
  DOOR_Z.forEach(function (zc) { box(DW, 0.05, 0.5, M.metal, XW - 0.1, FLOOR - 0.01, zc); });

  // Toit arrondi + capot de toit (clim) + neige
  roundedBar(W, 0.7, 0.42, 0.02, L, M.roof, 0, WIN1, 0);
  box(1.5, 0.2, 3.4, M.dark, 0, WIN1 + 0.8, 1.7);
  box(1.0, 0.14, 1.4, M.dark, 0, WIN1 + 0.77, -2.2);
  box(1.7, 0.05, L - 0.8, M.snow, 0, WIN1 + 0.7, 0);

  // Montants + vitres : côté gauche continu ; côté droit découpé par les portes
  function glazing(x, spans) {
    spans.forEach(function (sp) {
      const z0 = sp[0], z1 = sp[1], len = z1 - z0;
      plane(len, WH, M.glass, x, WY, (z0 + z1) / 2, Math.PI / 2);
      const n = Math.max(1, Math.round(len / 1.25));
      for (let i = 0; i <= n; i++) box(0.09, WH, 0.1, M.dark, x, WY, z0 + len * i / n);
    });
  }
  glazing(-W / 2 + 0.03, [[-L / 2 + 0.75, L / 2 - 0.75]]);
  glazing(W / 2 - 0.03, [[-L / 2 + 0.75, DOOR_Z[0] - DW / 2], [DOOR_Z[0] + DW / 2, DOOR_Z[1] - DW / 2], [DOOR_Z[1] + DW / 2, L / 2 - 0.75]]);
  // linteaux au-dessus des portes + témoin vert/rouge
  const doorLights = [];
  DOOR_Z.forEach(function (zc) {
    box(DW + 0.1, 0.16, 0.14, M.dark, XW, WIN1 - 0.04, zc);
    doorLights.push(box(0.5, 0.05, 0.02, M.doorLight, XW + 0.08, WIN1 - 0.04, zc));
  });

  // Pare-brise (légèrement incliné) + vitres de coin
  const ws = plane(W - 0.3, WH + 0.04, M.glass, 0, WY, -L / 2 + 0.01);
  ws.rotation.x = -0.1;
  const wipers = [];
  [-0.65, 0.2].forEach(function (px) {
    const wg = new THREE.Group();
    wg.position.set(px, WIN0 + 0.05, -L / 2 + 0.045);
    wg.rotation.x = -0.1;                                           // même inclinaison que le pare-brise
    box(0.92, 0.025, 0.02, M.dark, 0.46, 0, 0, wg);
    g.add(wg);
    wipers.push(wg);
  });
  let wipeT = 0, wipeA = 0;
  box(0.1, WH + 0.04, 0.1, M.dark, -W / 2 + 0.15, WY, -L / 2 + 0.03);
  box(0.1, WH + 0.04, 0.1, M.dark, W / 2 - 0.15, WY, -L / 2 + 0.03);
  const rwn = plane(W - 0.4, WH - 0.35, M.glass, 0, WY + 0.1, L / 2 - 0.01);
  rwn.rotation.y = Math.PI;

  // Phares, feux de jour, clignotants, feux arrière
  [-0.9, 0.9].forEach(function (x) {
    box(0.55, 0.13, 0.06, M.lamp, x, 0.84, -L / 2 - 0.005);
    box(0.4, 0.04, 0.05, M.lamp, x * 0.9, 0.7, -L / 2 - 0.005);
  });
  box(0.3, 0.1, 0.05, M.indL, -1.12, 0.72, -L / 2 - 0.005);
  box(0.3, 0.1, 0.05, M.indR, 1.12, 0.72, -L / 2 - 0.005);
  box(0.12, 0.1, 0.3, M.indR, W / 2 + 0.005, 0.72, -L / 2 + 0.3);
  box(0.12, 0.1, 0.3, M.indL, -W / 2 - 0.005, 0.72, -L / 2 + 0.3);
  box(0.12, 0.1, 0.3, M.indR, W / 2 + 0.005, 0.72, L / 2 - 0.3);
  box(0.12, 0.1, 0.3, M.indL, -W / 2 - 0.005, 0.72, L / 2 - 0.3);
  [-1.0, 1.0].forEach(function (x) {
    box(0.4, 0.4, 0.05, M.tail, x, 0.95, L / 2 + 0.005);
    box(0.2, 0.1, 0.05, M.indL, x * 0.75, 0.62, L / 2 + 0.005);
  });
  box(0.22, 0.1, 0.05, M.rev, 0, 0.62, L / 2 + 0.005);
  box(1.3, 0.35, 0.06, M.dark, 0, 0.5, -L / 2 - 0.005);            // calandre basse
  box(W - 0.1, 0.12, 0.25, M.dark, 0, 0.3, -L / 2 + 0.05);         // pare-chocs
  box(W - 0.1, 0.12, 0.25, M.dark, 0, 0.3, L / 2 - 0.05);

  // Rétroviseurs
  [-1, 1].forEach(function (sx) {
    box(0.06, 0.4, 0.08, M.dark, sx * (W / 2 + 0.12), 2.05, -L / 2 + 0.55);
    box(0.06, 0.34, 0.2, M.dark, sx * (W / 2 + 0.2), 1.85, -L / 2 + 0.55);
  });

  // ---------- Afficheurs à points ----------
  function signTex(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return { c: c, tex: tex };
  }
  const dots = (function () {                                          // grille de points : on « efface » le quadrillage
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const k = c.getContext('2d');
    k.fillStyle = '#000'; k.fillRect(0, 3, 4, 1); k.fillRect(3, 0, 1, 4);
    return c;
  })();
  const signs = [
    Object.assign(signTex(512, 72), { w: 1.9, h: 0.27, wide: true }),
    Object.assign(signTex(256, 72), { w: 0.95, h: 0.27, wide: false }),
    Object.assign(signTex(128, 72), { w: 0.5, h: 0.28, wide: false, numOnly: true }),
    Object.assign(signTex(512, 72), { w: 1.1, h: 0.16, wide: true })              // dans l'allée : prochain arrêt, face aux passagers
  ];
  function drawSign(sg, route, text) {
    const k = sg.c.getContext('2d'), W2 = sg.c.width, H2 = sg.c.height;
    k.globalCompositeOperation = 'source-over';
    k.fillStyle = '#060402'; k.fillRect(0, 0, W2, H2);
    k.fillStyle = '#ffae1a'; k.textBaseline = 'middle';
    k.font = 'bold ' + Math.round(H2 * 0.78) + 'px "Courier New", monospace';
    k.textAlign = 'left';
    k.fillText(String(route), 10, H2 / 2 + 2);
    if (!sg.numOnly) {
      k.font = 'bold ' + Math.round(H2 * 0.55) + 'px "Courier New", monospace';
      const maxW = W2 - (sg.wide ? 110 : 70);
      let t = String(text || '').toUpperCase();
      while (t.length > 3 && k.measureText(t).width > maxW) t = t.slice(0, -1);
      k.fillText(t, sg.wide ? 90 : 60, H2 / 2 + 2);
    }
    k.globalCompositeOperation = 'destination-out';
    k.fillStyle = k.createPattern(dots, 'repeat');
    k.fillRect(0, 0, W2, H2);
    k.globalCompositeOperation = 'source-over';
    sg.tex.needsUpdate = true;
  }
  signs.forEach(function (sg) { drawSign(sg, '—', ''); });
  const signMat = signs.map(function (sg) { return new THREE.MeshBasicMaterial({ map: sg.tex }); });
  plane(signs[0].w, signs[0].h, signMat[0], 0, WIN1 + 0.34, -L / 2 - 0.012, Math.PI);   // devant (sur la face du toit)
  box(signs[0].w + 0.08, signs[0].h + 0.06, 0.02, M.dark, 0, WIN1 + 0.34, -L / 2 - 0.004);
  plane(signs[1].w, signs[1].h, signMat[1], W / 2 + 0.012, WIN1 - 0.16, -3.0, Math.PI / 2);   // côté droit
  plane(signs[2].w, signs[2].h, signMat[2], 0.6, WIN1 + 0.3, L / 2 + 0.012, 0);           // derrière
  plane(signs[3].w, signs[3].h, signMat[3], 0, WIN1 - 0.34, -3.1, 0);                      // intérieur (regarde vers l'arrière du bus)
  box(signs[3].w + 0.06, signs[3].h + 0.04, 0.02, M.dark, 0, WIN1 - 0.34, -3.112);

  // ---------- Roues ----------
  const wheels = [];
  const AXLE_F = -3.0, AXLE_R = 2.85;                                // l'essieu avant est derrière la porte avant (avant : la roue était dans la cabine et le marchepied)
  [[-1.18, AXLE_F, true], [1.18, AXLE_F, true], [-1.18, AXLE_R, false], [1.18, AXLE_R, false]].forEach(function (w) {
    const wg = new THREE.Group();
    wg.rotation.order = 'YXZ';
    wg.position.set(w[0], 0.5, w[1]);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), M.rubber);
    tire.rotation.z = Math.PI / 2;
    wg.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8), M.metal);
    hub.rotation.z = Math.PI / 2;
    wg.add(hub);
    g.add(wg);
    wheels.push({ g: wg, front: w[2] });
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), M.dark);     // passage de roue
    arch.rotation.z = Math.PI / 2;
    arch.position.set(w[0] + Math.sign(w[0]) * 0.1, 0.5, w[1]);
    g.add(arch);
  });

  // ---------- Intérieur ----------
  // plafonniers (deux bandes lumineuses) + barres
  box(0.12, 0.03, L - 1.8, M.inner, -0.55, WIN1 - 0.02, 0);
  box(0.12, 0.03, L - 1.8, M.inner, 0.55, WIN1 - 0.02, 0);
  cyl(0.022, L - 2.2, M.pole, -0.28, WIN1 - 0.22, 0, Math.PI / 2, 0);
  cyl(0.022, L - 2.2, M.pole, 0.28, WIN1 - 0.22, 0, Math.PI / 2, 0);
  // barres verticales près des portes et dans l'allée
  [[1.05, DOOR_Z[0] + 0.75], [1.05, DOOR_Z[1] - 0.75], [1.05, DOOR_Z[1] + 0.75], [-0.2, -1.6], [0.2, 2.2], [-0.2, 3.6]].forEach(function (p) {
    cyl(0.022, WIN1 - FLOOR - 0.15, M.pole, p[0], (FLOOR + WIN1) / 2 - 0.02, p[1]);
  });
  // caissons de passage de roue : à l'intérieur, la roue (1 m de diamètre) dépasse du plancher bas, comme dans un vrai bus
  const HOUSINGS = [];
  [AXLE_F, AXLE_R].forEach(function (az) {
    [-1, 1].forEach(function (sd) {
      const xa = sd * 0.78, xb = sd * (XW - 0.04);
      const hx = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: az - 0.5, z1: az + 0.5 };
      HOUSINGS.push(hx);
      box(hx.x1 - hx.x0, 1.04 - FLOOR, hx.z1 - hx.z0, M.dark, (hx.x0 + hx.x1) / 2, (FLOOR + 1.04) / 2, az);
      box(hx.x1 - hx.x0 + 0.02, 0.03, hx.z1 - hx.z0 + 0.02, M.accent, (hx.x0 + hx.x1) / 2, 1.045, az);      // liseré turquoise sur le dessus
    });
  });
  // sièges : deux par rang à gauche, deux à droite, sauf devant les portes ; pas de siège à la place d'un caisson de roue
  const SEATS = [];
  [-3.0, -2.2, -1.4, 1.2, 2.0, 2.8, 3.6, 4.4].forEach(function (zz) {
    [-0.95, -0.52].forEach(function (sx) { SEATS.push({ x: sx, z: zz }); });
    if (zz > 0.9 || zz < -1.2) [0.52, 0.95].forEach(function (sx) { SEATS.push({ x: sx, z: zz }); });
  });
  for (let i = SEATS.length - 1; i >= 0; i--) {
    const st = SEATS[i];
    if (HOUSINGS.some(function (h) { return st.x + 0.22 > h.x0 && st.x - 0.22 < h.x1 && st.z + 0.28 > h.z0 && st.z - 0.24 < h.z1; })) SEATS.splice(i, 1);
  }
  SEATS.sort(function (a, b) { return a.z - b.z || a.x - b.x; });
  SEATS.forEach(function (st) {
    box(0.42, 0.28, 0.46, M.seatB, st.x, FLOOR + 0.2, st.z);
    box(0.42, 0.08, 0.46, M.seat, st.x, FLOOR + 0.38, st.z);
    box(0.42, 0.56, 0.08, M.seat, st.x, FLOOR + 0.7, st.z + 0.2);
  });
  // cabine du conducteur : tableau de bord, écran, volant, siège, vitre de protection
  box(1.0, 0.3, 0.5, M.dark, -0.7, 0.95, -5.1);
  box(0.4, 0.2, 0.03, M.screen, -0.7, 1.15, -4.86);
  box(0.42, 0.28, 0.46, M.seatB, DRIVER.x, FLOOR + 0.2, DRIVER.z + 0.1);
  box(0.46, 0.1, 0.5, M.seat, DRIVER.x, FLOOR + 0.4, DRIVER.z + 0.1);
  box(0.46, 0.6, 0.09, M.seat, DRIVER.x, FLOOR + 0.75, DRIVER.z + 0.36);
  plane(0.02, 1.2, M.glassLight, -0.2, 1.1, -4.4, 0).rotation.y = Math.PI / 2;
  const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.027, 6, 16), M.dark);
  wheelSteer.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
  wheelSteer.rotation.x = -0.75;
  g.add(wheelSteer);

  // Réservoir + jauge d'essence sur le tableau de bord du conducteur
  const tank = createTank({ type: 'bus' });
  const fuelPort = { x: 1.3, y: 0.7, z: 2.0 };
  const gauge = createFuelGauge(g, tank, { x: -1.02, y: 1.105, z: -5.0, tilt: -0.9, w: 0.2 });

  // ---------- Portes coulissantes (deux vantaux par porte) ----------
  const doorLeaves = [];
  DOOR_Z.forEach(function (zc) {
    [-1, 1].forEach(function (side) {
      const lf = new THREE.Group();
      box(0.58, 1.86, 0.04, M.glassLight, 0, 0, 0, lf);
      box(0.6, 0.06, 0.05, M.dark, 0, 0.95, 0, lf);
      box(0.6, 0.06, 0.05, M.dark, 0, -0.95, 0, lf);
      box(0.04, 1.9, 0.05, M.dark, side * 0.3, 0, 0, lf);
      lf.position.set(XW + 0.02, FLOOR + 0.98, zc + side * 0.29);
      g.add(lf);
      doorLeaves.push({ g: lf, zc: zc, side: side });
    });
  });

  // ---------- Lumières réelles : phares + éclairage intérieur (créées une fois pour toutes) ----------
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.2, -30);
  g.add(spotTarget);
  const spot = new THREE.SpotLight(0xfff0d2, 0, 90, 0.62, 0.5, 1.0);
  spot.position.set(0, 0.9, -L / 2 - 0.1);
  spot.target = spotTarget;
  g.add(spot);
  const doorGlow = new THREE.PointLight(0xfff0cc, 0, 9, 2);        // la lumière des portes coule sur la neige du trottoir
  doorGlow.position.set(XW + 0.9, 0.9, (DOOR_Z[0] + DOOR_Z[1]) / 2);
  g.add(doorGlow);
  const cabin = new THREE.PointLight(0xffe2b0, 0.0, 13, 2);
  cabin.position.set(0, 2.0, 0.4);
  g.add(cabin);

  // ---------- Conducteur ----------
  const driverSlot = new THREE.Group();
  driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
  driverSlot.rotation.y = DRIVER.yaw;
  g.add(driverSlot);

  // ==========================================
  // ÉTAT
  // ==========================================
  let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
  let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steer = 0;
  let mode = 'parked';                 // parked | driving | turning
  let P = null, s = 0, legResolve = null, errX = 0, errZ = 0, errH = 0;
  let doorT = 0, doorTarget = 0, doorWait = [];
  let riding = false;                  // le joueur est DANS le bus (debout ou assis)
  let lightsOn = false, driverIn = true, indicator = null, blinkT = 0, braking = false, reversing = false, beepT = 0;
  let turn = null;
  let ac = null;

  // ==========================================
  // LE JOUEUR DANS LE BUS
  // ==========================================
  // Entrer : portes ouvertes + bus arrêté, on franchit la porte à pied. Sortir : pareil dans l'autre sens.
  // Dedans : on marche (le jeu fait avancer la caméra, on garde son déplacement et on le convertit dans le repère du bus,
  // donc le bus nous emporte quand il roule), on clique sur un siège pour s'asseoir, on bouge pour se relever.
  // Tout ce qui est solide à pied dans le bus : sièges + caissons de roue
  const OBST = SEATS.map(function (st) { return { x0: st.x - 0.22, x1: st.x + 0.22, z0: st.z - 0.26, z1: st.z + 0.28 }; }).concat(HOUSINGS);
  const PR = 0.12;                                                   // rayon du joueur dans l'allée
  const EYE_STAND = FLOOR + 1.7, EYE_SIT = 1.62, GLIDE = 3.4;         // GLIDE : m/s quand on va d'une place à l'autre
  let pm = 'standing', seatI = -1, goalSeat = -1, faceFwd = false;    // pm : standing | seated | gliding
  let path = [];
  const pl = { x: 0, z: 0 };                                         // position du joueur dans le repère du bus
  let ey = EYE_STAND, lastCX = 0, lastCZ = 0, uiOn = false;
  const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();

  function laneAt(lz) {                                              // quelle porte (0 avant, 1 milieu) est en face de ce z ? -1 : aucune
    for (let i = 0; i < DOOR_Z.length; i++) if (Math.abs(lz - DOOR_Z[i]) < DW / 2 - 0.12) return i;
    return -1;
  }
  function canvasEl() { return o.canvas || (o.renderer && o.renderer.domElement) || document.querySelector('canvas'); }
  function busyElsewhere() {
    const tr = o.truck, taxiRide = o.taxi && o.taxi.isRiding && o.taxi.isRiding();
    return !!((tr && tr.isDriving && tr.isDriving()) || taxiRide);
  }

  // --- rayon de la souris (ou du regard si la souris est verrouillée) dans le repère du bus ---
  function rayDirLocal(ev) {
    if (ev && !document.pointerLockElement) {
      const cv = canvasEl(); if (!cv) return null;
      const r = cv.getBoundingClientRect();
      camera.updateMatrixWorld();
      tmpV.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
      tmpP.setFromMatrixPosition(camera.matrixWorld);
      tmpV.sub(tmpP).normalize();
    } else {
      camera.getWorldDirection(tmpV);
    }
    const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    return { x: tmpV.x * rx + tmpV.z * rz, y: tmpV.y, z: -(tmpV.x * fx + tmpV.z * fz) };
  }
  // Chaque siège = un coussin + un dossier : on peut viser un siège côté fenêtre par-dessus celui de l'allée
  function seatBoxes(st) {
    return [
      [st.x - 0.22, FLOOR + 0.04, st.z - 0.24, st.x + 0.22, FLOOR + 0.46, st.z + 0.20],     // coussin
      [st.x - 0.22, FLOOR + 0.46, st.z + 0.15, st.x + 0.22, FLOOR + 1.16, st.z + 0.28]      // dossier
    ];
  }
  function pickSeat(d) {
    if (!d) return -1;
    let best = -1, bt = 4;
    const org = [pl.x, ey, pl.z], dir = [d.x, d.y, d.z];
    SEATS.forEach(function (st, i) {
      seatBoxes(st).forEach(function (bx) {
        let t0 = 0, t1 = bt;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(dir[k]) < 1e-6) { if (org[k] < bx[k] || org[k] > bx[k + 3]) return; continue; }
          let a = (bx[k] - org[k]) / dir[k], b = (bx[k + 3] - org[k]) / dir[k];
          if (a > b) { const t = a; a = b; b = t; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          if (t0 > t1) return;
        }
        if (t0 < bt) { bt = t0; best = i; }
      });
    });
    return best;
  }
  function pickFloor(d) {                                            // le point du plancher visé (ou null)
    if (!d || d.y > -0.05) return null;
    const t = (FLOOR + 0.02 - ey) / d.y;
    if (t <= 0 || t > 8) return null;
    const p = { x: pl.x + d.x * t, z: pl.z + d.z * t };
    if (Math.abs(p.x) > XW - 0.2 || p.z < -4.9 || p.z > 4.85) return null;
    return p;
  }

  // --- contraintes : parois, cabine, sièges, caissons de roue ---
  function clampBody(p, lane) {
    p.x = Math.max(-(XW - 0.22), Math.min(lane >= 0 ? XW + 1.2 : XW - 0.22, p.x));
    p.z = Math.max(-4.95, Math.min(4.9, p.z));
    if (p.x < -0.1 && p.z < -4.1) p.z = -4.1;                        // cabine du conducteur (à gauche)
  }
  function pushOut(p) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < OBST.length; i++) {
        const b = OBST[i], x0 = b.x0 - PR, x1 = b.x1 + PR, z0 = b.z0 - PR, z1 = b.z1 + PR;
        if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
        const dl = p.x - x0, dr = x1 - p.x, df = p.z - z0, db = z1 - p.z, m = Math.min(dl, dr, df, db);
        if (m === dl) p.x = x0; else if (m === dr) p.x = x1; else if (m === df) p.z = z0; else p.z = z1;
      }
    }
  }
  function constrainInside() {
    const open = mode === 'parked' && doorT > 0.9;
    clampBody(pl, open ? laneAt(pl.z) : -1);
    pushOut(pl);
  }

  // --- aller d'une place à l'autre : on passe toujours par l'allée (jamais à travers les sièges) ---
  function planTo(tx, tz) {
    const w = [];
    function add(x, z) { const l = w.length ? w[w.length - 1] : pl; if (Math.hypot(x - l.x, z - l.z) > 0.03) w.push({ x: x, z: z }); }
    add(0, pl.z);
    add(0, tz);
    add(tx, tz);
    return w;
  }
  function sit(i) {
    if (!riding || i < 0 || i >= SEATS.length || (pm === 'seated' && seatI === i)) return;
    const st = SEATS[i];
    goalSeat = i; seatI = -1; pm = 'gliding'; faceFwd = true;
    path = planTo(st.x, st.z + 0.12);
  }
  function standAt(p) {
    goalSeat = -1; seatI = -1; pm = 'gliding'; faceFwd = false;
    path = planTo(p.x, p.z);
  }
  function writeCamera() {
    const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    const wx = x + rx * pl.x + fx * (-pl.z), wz = z + rz * pl.x + fz * (-pl.z);
    camera.position.set(origin.x + wx, origin.y + g.position.y + ey, origin.z + wz);
    lastCX = wx; lastCZ = wz;
    if (o.snow) o.snow.setBaseY(origin.y + bodyY);
  }
  function standUp() {                                               // touche de déplacement : on se lève là où on est
    if (!riding || pm === 'standing') return;
    const wasSeated = pm === 'seated';
    const st = SEATS[seatI];
    path = []; goalSeat = -1; faceFwd = false; pm = 'standing';
    if (wasSeated && st) { pl.x = (st.x < 0 ? -1 : 1) * 0.1; pl.z = st.z + 0.05; }
    seatI = -1;
    writeCamera();
  }
  const MOVE_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyZ: 1, KeyQ: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };
  function onKey(ev) {
    if (!riding || pm === 'standing') return;
    if (MOVE_KEYS[ev.code] || /^[zqswadZQSWAD]$/.test(ev.key || '')) standUp();
  }
  // Clic : sur un siège = on s'y assoit (même si on est déjà assis ailleurs : on se lève et on y va) ;
  //        sur le sol quand on est assis = on se lève à cet endroit.
  function onClick(ev) {
    if (!riding) return;
    const t = ev.target;
    if (t && t.closest && t.closest('.bt-say, .bt-reply')) return;
    const d = rayDirLocal(ev);
    const i = pickSeat(d);
    if (i >= 0) { sit(i); return; }
    if (pm !== 'standing') {
      const p = pickFloor(d);
      if (p) { clampBody(p, -1); pushOut(p); standAt(p); }
    }
  }
  function setInput(on) {
    if (on === uiOn) return;
    uiOn = on;
    if (on) { window.addEventListener('keydown', onKey, true); window.addEventListener('click', onClick); }
    else { window.removeEventListener('keydown', onKey, true); window.removeEventListener('click', onClick); }
  }

  // --- entrer / sortir ---
  function enter(lx, lz, cx, cz) {
    riding = true; pm = 'standing'; seatI = -1; goalSeat = -1; path = []; faceFwd = false;
    pl.x = lx; pl.z = lz;
    ey = Math.max(EYE_SIT, camera.position.y - origin.y - g.position.y);
    lastCX = cx; lastCZ = cz;
    setInput(true);
    if (o.onBoard) o.onBoard();
  }
  function leave() {
    riding = false; pm = 'standing'; seatI = -1; goalSeat = -1; path = []; faceFwd = false;
    setInput(false);
    if (o.onExit) o.onExit();
    if (o.onAlight) o.onAlight();
  }
  // Appelé à chaque image, après le déplacement du bus
  function playerStep(dt, h0) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
    const cx = camera.position.x - origin.x, cz = camera.position.z - origin.z;
    if (!riding) {
      if (mode === 'parked' && doorT > 0.9 && !busyElsewhere()) {
        const dx = cx - x, dz = cz - z;
        const lx = dx * rx + dz * rz, lz = -(dx * fx + dz * fz);
        if (lx < XW - 0.05 && lx > -0.3 && laneAt(lz) >= 0) enter(lx, lz, cx, cz);      // il a franchi la porte ouverte
      }
      return;
    }
    // le bus tourne : le regard tourne avec lui
    if (o.view && Math.abs(wrap(heading - h0)) > 1e-6) { const v = o.view.get(); o.view.set(v.yaw + wrap(heading - h0), v.pitch); }
    const k = Math.min(1, dt * 7);
    if (pm === 'standing') {
      const dx = cx - lastCX, dz = cz - lastCZ;                         // ce que le joueur a marché tout seul depuis la dernière image
      pl.x += dx * rx + dz * rz; pl.z += -(dx * fx + dz * fz);
      constrainInside();
      if (mode === 'parked' && doorT > 0.9 && laneAt(pl.z) >= 0 && pl.x > XW + 0.02) { leave(); return; }   // il est ressorti par la porte
      ey += (EYE_STAND - ey) * k;
    } else if (pm === 'gliding') {
      const t = path[0];
      if (!t) { pm = goalSeat >= 0 ? 'seated' : 'standing'; seatI = goalSeat; }
      else {
        const ddx = t.x - pl.x, ddz = t.z - pl.z, d = Math.hypot(ddx, ddz), stp = GLIDE * dt;
        if (d <= stp) { pl.x = t.x; pl.z = t.z; path.shift(); } else { pl.x += ddx / d * stp; pl.z += ddz / d * stp; }
        if (!path.length) { pm = goalSeat >= 0 ? 'seated' : 'standing'; seatI = goalSeat; }
      }
      ey += ((goalSeat >= 0 ? EYE_SIT : EYE_STAND) - ey) * k;
    } else {                                                            // assis : collé au siège, le regard est libre
      const st = SEATS[seatI];
      if (st) { pl.x = st.x; pl.z = st.z + 0.12; }
      ey += (EYE_SIT - ey) * k;
    }
    // en s'asseyant on se tourne vers l'avant du bus (tous les sièges regardent vers l'avant)
    if (faceFwd && o.view) {
      const v = o.view.get(), dy = wrap(heading - v.yaw), kk = Math.min(1, dt * 5);
      o.view.set(v.yaw + dy * kk, v.pitch + (0 - v.pitch) * kk);
      if (Math.abs(dy) < 0.03 && pm === 'seated') faceFwd = false;
    }
    writeCamera();
  }

  function place(dt, snap) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const hF = groundH(x + fx * 4.4, z + fz * 4.4);
    const hR = groundH(x - fx * 4.4, z - fz * 4.4);
    const hRt = groundH(x + rx * 1.2, z + rz * 1.2);
    const hL = groundH(x - rx * 1.2, z - rz * 1.2);
    let hW = -1e9;                                                   // hauteur du sol sous chaque roue : le bus se pose sur la plus haute
    [[AXLE_F, -1], [AXLE_F, 1], [AXLE_R, -1], [AXLE_R, 1]].forEach(function (w) {
      hW = Math.max(hW, groundH(x - fx * w[0] + rx * w[1] * 1.18, z - fz * w[0] + rz * w[1] * 1.18));
    });
    const ty = Math.max((hF + hR + hRt + hL) / 4, hW - 0.02) + 0.09;     // +9 cm : le sol visible (neige) est un peu plus haut que le sol logique
    const tp = Math.atan2(hF - hR, 8.8);
    const tr = Math.atan2(hRt - hL, 2.4);
    const k = snap ? 1 : Math.min(1, dt * 7);
    bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 12);
    pitch += (tp - pitch) * k;
    roll += (tr - roll) * k;
    const kneel = ss(0, 1, doorT);                                   // le bus s'agenouille côté trottoir
    g.position.set(x, bodyY - 0.07 * kneel, z);
    g.rotation.set(pitch, heading, roll + 0.014 * kneel);
  }
  place(0, true);

  // ==========================================
  // SONS (carillon des portes, bip de recul) : seulement près de toi
  // ==========================================
  function audible() { return Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) < 45; }
  function tone(f, t0, dur, vol, type) {
    try {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); }
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime + t0, osc = ac.createOscillator(), gn = ac.createGain();
      osc.type = type || 'sine'; osc.frequency.value = f;
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gn); gn.connect(ac.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    } catch (e) { /* pas de son : tant pis */ }
  }
  // souffle d'air comprimé (bruit filtré) : portes, frein à l'arrêt
  function hiss(t0, dur, vol) {
    if (!audible()) return;
    try {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); }
      if (ac.state === 'suspended') ac.resume();
      const n = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), gn = ac.createGain(), t = ac.currentTime + t0;
      src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 2600;
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.04); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp); hp.connect(gn); gn.connect(ac.destination);
      src.start(t);
    } catch (e) { /* pas de son : tant pis */ }
  }
  function chime(open) {
    if (!audible()) return;
    if (open) { hiss(0, 0.7, 0.07); tone(880, 0.3, 0.35, 0.05); tone(660, 0.52, 0.45, 0.05); }
    else { tone(660, 0, 0.18, 0.05); tone(660, 0.25, 0.18, 0.05); tone(660, 0.5, 0.18, 0.05); hiss(0.8, 0.6, 0.06); }
  }

  // ==========================================
  // PORTES
  // ==========================================
  function setDoors(open) {
    const t = open ? 1 : 0;
    if (doorTarget === t) return doorT === t ? Promise.resolve() : new Promise(function (r) { doorWait.push(r); });
    if (open && speed > 0.3) return Promise.resolve();
    doorTarget = t;
    chime(open);
    return new Promise(function (r) { doorWait.push(r); });
  }
  function updateDoors(dt) {
    if (doorT !== doorTarget) {
      doorT += Math.sign(doorTarget - doorT) * dt / DOOR_TIME;
      if ((doorTarget === 1 && doorT >= 1) || (doorTarget === 0 && doorT <= 0)) {
        doorT = doorTarget;
        const w = doorWait; doorWait = [];
        w.forEach(function (r) { r(); });
      }
    }
    const out = ss(0, 0.22, doorT) * 0.09, slide = ss(0.2, 1, doorT) * 0.57;
    doorLeaves.forEach(function (d) {
      d.g.position.x = XW + 0.02 + out;
      d.g.position.z = d.zc + d.side * (0.29 + slide);
    });
    const gl = doorT > 0.04 ? 0x34e060 : 0x16301a;
    doorLights.forEach(function (l) { l.material.color.setHex(doorT > 0.04 && doorT < 1 && doorTarget === 0 ? 0xff3a1e : gl); });
  }

  // ==========================================
  // CLIGNOTANTS, FEUX
  // ==========================================
  function lights(dt) {
    blinkT += dt;
    const on = (blinkT % 0.8) < 0.4;
    const hz = indicator === 'hazard';
    M.indL.color.setHex((indicator === 'left' || hz) && on ? 0xffa000 : 0x2a1800);
    M.indR.color.setHex((indicator === 'right' || hz) && on ? 0xffa000 : 0x2a1800);
    M.tail.color.setHex(braking || (mode === 'parked' && doorT > 0.05) ? 0xff2a1a : 0x6a1008);
    M.rev.color.setHex(reversing ? 0xffffff : 0x3a3a3a);
    spot.intensity = lightsOn ? 4.0 : 0;
    cabin.intensity = lightsOn ? 1.3 : 0.5;
    doorGlow.intensity = 1.6 * ss(0, 1, doorT);
    if (reversing && audible()) { beepT -= dt; if (beepT <= 0) { beepT = 0.7; tone(1000, 0, 0.25, 0.035, 'square'); } }
  }

  // ==========================================
  // CONDUITE AUTOMATIQUE
  // ==========================================
  function dynCap(vT) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    // feux rouges
    if (o.signals && o.signals.ahead) {
      let r = null;
      try { r = o.signals.ahead(x, z, fx, fz, 80); } catch (e) { r = null; }
      if (r && r.red && r.dist > 0) {
        const d = r.dist - L / 2 - 2.5;
        vT = Math.min(vT, Math.sqrt(2 * BRK_E * Math.max(0, d)) * 0.8);
      }
    }
    // autres véhicules et personnes devant
    let obs = [];
    try { obs = o.obstacles ? o.obstacles() : []; } catch (e) { obs = []; }
    if (!riding) obs = obs.concat([{ x: camera.position.x - origin.x, z: camera.position.z - origin.z, r: 0.6 }]);
    for (let i = 0; i < obs.length; i++) {
      const ob = obs[i];
      if (!ob) continue;
      const dx = ob.x - x, dz = ob.z - z;
      const along = dx * fx + dz * fz, lat = dx * rx + dz * rz;
      if (along > 0 && along < 40 && Math.abs(lat) < 2.2 + (ob.r || 1.3)) {
        const d = along - L / 2 - 3.5;
        vT = Math.min(vT, Math.sqrt(2 * BRK_E * Math.max(0, d)) * 0.85);
      }
    }
    return vT;
  }

  function followStep(dt) {
    const q0 = net.sampleAt(P, s);
    const vT = dynCap(q0.v);
    const prev = speed;
    if (speed < vT) speed = Math.min(vT, speed + ACC * dt);
    else speed = Math.max(vT, speed - BRK_E * dt);
    braking = speed < prev - 0.02;
    s += speed * dt;
    tank.consume(Math.abs(speed) * dt);    // (le bus continue même à sec pour l'instant : la panne viendra avec gasstation.js)
    let arrived = false;
    if (s >= P.len - 0.12) { s = P.len; arrived = true; }
    const q = net.sampleAt(P, s);
    const k = Math.exp(-Math.max(speed, 0.5) * dt / 9);               // on rattrape doucement l'écart de départ
    errX *= k; errZ *= k; errH *= k;
    const prevHeading = heading;
    x = q.x + errX; z = q.z + errZ; heading = q.h + errH;
    steer += (Math.max(-0.5, Math.min(0.5, q.turn * 4.2)) - steer) * Math.min(1, dt * 8);
    const rem = P.len - s;
    indicator = rem < 45 && speed > 0.3 ? 'right' : (Math.abs(q.turn) > 0.012 ? (q.turn > 0 ? 'left' : 'right') : null);
    place(dt, false);
    wheelRot += speed * dt / 0.5;
    wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steer : 0; });
    if (arrived) {
      speed = 0; braking = true; indicator = null; mode = 'parked'; reversing = false;
      hiss(0.05, 0.9, 0.05);                                        // purge du frein à air
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
      const r = legResolve; legResolve = null; P = null;
      if (r) r('arrived');
    }
  }

  // Demi-tour en trois manœuvres (avant gauche, marche arrière, avant gauche) : tient dans la largeur d'une route
  function turnStep(dt) {
    const LW = 6.4, MAXS = 0.52, V = 2.3;
    const T = turn;
    let vel, st;
    if (T.phase === 0) { vel = V; st = MAXS; if (T.dh >= 1.1) { T.phase = 1; T.pause = 0.8; } }
    else if (T.phase === 1) { vel = -V; st = -MAXS; if (T.dh >= 1.9) { T.phase = 2; T.pause = 0.8; } }
    else { vel = V; st = MAXS; if (T.dh >= Math.PI - 0.04) { T.phase = 3; } }
    if (T.phase === 3) {
      speed = 0; braking = true; reversing = false; indicator = null; mode = 'parked';
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
      const r = legResolve; legResolve = null; turn = null;
      if (r) r('turned');
      return;
    }
    if (T.pause > 0) {                                                // petit temps d'arrêt avant de changer de sens
      T.pause -= dt; speed = 0; braking = true;
      steer += (st - steer) * Math.min(1, dt * 3);
      place(dt, false);
      wheels.forEach(function (w) { w.g.rotation.y = w.front ? steer : 0; });
      return;
    }
    const prevHeading = heading;
    speed = vel; braking = false; reversing = vel < 0;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    x += fx * vel * dt; z += fz * vel * dt;
    const dh = vel / LW * Math.tan(st) * dt;
    heading += dh; T.dh += dh;
    steer += (st - steer) * Math.min(1, dt * 3);
    indicator = reversing ? 'hazard' : 'left';
    place(dt, false);
    wheelRot += vel * dt / 0.5;
    wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steer : 0; });
  }

  // ==========================================
  // UPDATE (se met à jour tout seul, comme le taxi)
  // ==========================================
  function animate(dt) {
    const want = mode !== 'parked' && lightsOn;                     // en route, de nuit / par temps de neige
    if (want) wipeT += dt * 2.6;
    wipeA += ((want ? 0.5 - 0.5 * Math.cos(wipeT) : 0) - wipeA) * Math.min(1, dt * 7);
    wipers.forEach(function (w) { w.rotation.z = wipeA * 1.25; });
    if (!driverIn) return;
    // (l'avatar Violet est animé par engine/avatar-body.js : sit à l'arrêt, drive en roulant)
  }
  function step(dt, active) {
    gauge.update(dt, false);
    const h0 = heading;
    if (mode === 'driving' && P) followStep(dt);
    else if (mode === 'turning' && turn) turnStep(dt);
    else { speed = 0; place(dt, false); }
    updateDoors(dt);
    lights(dt);
    animate(dt);
    playerStep(dt, h0);
  }

  let lastTick = 0;
  function tick(active) {
    const now = performance.now();
    if (lastTick && now - lastTick < 3) return;
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
    lastTick = now;
    step(dt, active);
  }
  (function loop() { tick(true); requestAnimationFrame(loop); })();

  window.BadTherapistBus = {
    group: g, slot: driverSlot,
    bringPlayer: function () { if (window.BadTherapistBusLine) window.BadTherapistBusLine.come(); },
    seat: function (n) { if (!riding) return 'monte dans le bus d\'abord'; sit((n | 0) - 1); return 'siège ' + n; },
    stand: function () { standUp(); return 'debout'; },
    setAcc: function (a) { if (a > 0) ACC = a; return ACC; },
    driver: function (px, py, pz, yawDeg) {
      driverSlot.position.set(px, py, pz);
      if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
      console.log('[bus] DRIVER = { x:', px, ', y:', py, ', z:', pz, ', yaw:', driverSlot.rotation.y, '}');
    }
  };

  // ==========================================
  // API
  // ==========================================
  return {
    group: g,
    tank: tank,
    fuelPort: fuelPort,
    refuel: function (l) { return tank.add(l); },
    slot: driverSlot,
    update: function (dt, active) { tick(active !== false); },
    teleport: function (px, pz, h) { x = px; z = pz; heading = h; speed = 0; mode = 'parked'; place(0, true); },
    // Rouler le long d'un chemin (roadnet.makePath) jusqu'au bout. Résolu à l'arrivée.
    follow: function (path) {
      return new Promise(function (resolve) {
        P = path; s = 0; mode = 'driving'; speed = 0; legResolve = resolve;
        const q = net.sampleAt(P, 0);
        errX = x - q.x; errZ = z - q.z; errH = wrap(heading - q.h);
        if (Math.hypot(errX, errZ) > 25) { errX = 0; errZ = 0; x = q.x; z = q.z; }
        if (doorT > 0 || doorTarget > 0) setDoors(false);
      });
    },
    setAcc: function (a) { if (a > 0) ACC = a; },
    // Le bus est solide : repousse un cercle (joueur, avatar, véhicule) hors du rectangle du bus. Renvoie [x, z] (repère de la scène).
    collide: function (px, pz, rad, forPlayer) {
      if (!g.visible) return [px, pz];
      rad = rad || 0.3;
      const fx = -Math.sin(heading), fz = -Math.cos(heading), rx = Math.cos(heading), rz = -Math.sin(heading);
      const dx = px - x, dz = pz - z;
      const a = dx * fx + dz * fz, b = dx * rx + dz * rz;
      const hl = L / 2 + rad, hw = W / 2 + 0.12 + rad;               // +0.12 : rétroviseurs
      if (Math.abs(a) >= hl || Math.abs(b) >= hw) return [px, pz];
      if (forPlayer && mode === 'parked' && doorT > 0.9 && b > 0 && laneAt(-a) >= 0) return [px, pz];   // porte ouverte : on peut entrer
      let na = a, nb = b;
      if (hl - Math.abs(a) < hw - Math.abs(b)) na = (a < 0 ? -1 : 1) * hl; else nb = (b < 0 ? -1 : 1) * hw;
      return [x + fx * na + rx * nb, z + fz * na + rz * nb];
    },
    seat: function (n) { if (!riding) return 'monte dans le bus d\'abord'; sit((n | 0) - 1); return 'siège ' + n; },   // seat(12) : s'asseoir au siège 12
    stand: function () { standUp(); return 'debout'; },
    seatCount: SEATS.length,
    floorY: function () { return g.position.y + FLOOR; },              // hauteur du plancher (le jeu s'en sert pour la hauteur des yeux dans le bus)
    isInside: function () { return riding; },
    playerAtDoor: function () {                                        // le joueur attend près d'une porte pour descendre
      return riding && pl.x > 0.2 && DOOR_Z.some(function (zc) { return Math.abs(pl.z - zc) < 1.4; });
    },
    // Arrête tout de suite la manœuvre en cours (la promesse de follow / turnAround est résolue avec 'aborted')
    abort: function () {
      if (mode === 'parked') return;
      speed = 0; braking = true; indicator = null; reversing = false; mode = 'parked'; P = null; turn = null;
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
      const r = legResolve; legResolve = null;
      if (r) r('aborted');
    },
    // Met le joueur à pied à côté du bus, entre les deux portes, tourné vers lui (pour tester l'entrée par la porte)
    bringPlayer: function () {
      if (riding) return;
      const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
      const px = x + rx * 3.4 + fx * 2.2, pz = z + rz * 3.4 + fz * 2.2;
      camera.position.x = origin.x + px;
      camera.position.z = origin.z + pz;
      camera.position.y = origin.y + 1.7 + groundH(px, pz);
      if (o.view) o.view.set(heading + Math.PI / 2, 0);
    },
    turnAround: function () {
      return new Promise(function (resolve) { turn = { phase: 0, dh: 0, pause: 0 }; mode = 'turning'; legResolve = resolve; });
    },
    openDoors: function () { return setDoors(true); },
    closeDoors: function () { return setDoors(false); },
    doorsOpen: function () { return doorT > 0.9; },
    setDisplay: function (route, text) { signs.forEach(function (sg) { drawSign(sg, route, text); }); },
    setLights: function (on) { lightsOn = !!on; },
    setIndicator: function (v) { indicator = v; },
    isMoving: function () { return mode !== 'parked'; },
    isRiding: function () { return riding; },
    isDoorsMoving: function () { return doorT !== doorTarget; },
    getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },
    getMode: function () { return mode; },
    setDriverPresent: function (v) { driverIn = !!v; },
    // un endroit libre à côté de la porte avant, pour que le conducteur descende
    doorSpot: function () {
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      return [x + rx * 3.4 + fx * 4.3, z + rz * 3.4 + fz * 4.3];
    },
    // le joueur est descendu par code (ex. fin de ligne) : devant la porte du milieu
    forceAlight: function () {
      if (!riding) return;
      const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
      camera.position.x = origin.x + x + rx * 3.5 + fx * (-DOOR_Z[1]);
      camera.position.z = origin.z + z + rz * 3.5 + fz * (-DOOR_Z[1]);
      leave();
    },
    isPlayerNear: function (r) { return Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) < (r || 30); },
    LENGTH: L, WIDTH: W
  };
}

// ==========================================
// PANNEAUX D'ARRÊT DE BUS
// ==========================================
// stops : [{ x, z, heading, n }] — heading = cap du bus à l'arrivée (le panneau lui fait face, près de la porte avant).
// Un poteau, une plaque bleue avec un petit bus, le numéro de l'arrêt et un voyant ambre pour qu'on le voie dans la nuit.

export function createBusStops(parent, stops, groundH) {
  const M = {
    pole: new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.6, metalness: 0.6 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xdfe5e8, roughness: 0.9, emissive: 0x20282c }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
    base: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 })
  };
  function plateTex(n) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 160;
    const k = c.getContext('2d');
    k.fillStyle = '#0a5fb8'; k.fillRect(0, 0, 128, 160);
    k.strokeStyle = '#fff'; k.lineWidth = 5; k.strokeRect(5, 5, 118, 150);
    // petit bus
    k.fillStyle = '#fff';
    k.fillRect(24, 34, 80, 44);
    k.fillStyle = '#0a5fb8';
    for (let i = 0; i < 4; i++) k.fillRect(29 + i * 19, 40, 14, 14);
    k.fillRect(24, 62, 80, 4);
    k.fillStyle = '#fff';
    k.beginPath(); k.arc(44, 82, 7, 0, 6.3); k.arc(86, 82, 7, 0, 6.3); k.fill();
    k.font = 'bold 40px Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.fillText(String(n), 64, 126);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  const out = [];
  stops.forEach(function (st) {
    const grp = new THREE.Group();
    grp.position.set(st.x, groundH(st.x, st.z), st.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 3.1, 8), M.pole);
    pole.position.y = 1.55; grp.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.12, 10), M.base);
    base.position.y = 0.06; grp.add(base);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicMaterial({ map: plateTex(st.n), side: THREE.DoubleSide }));
    plate.position.y = 2.55;
    plate.rotation.y = Math.atan2(Math.sin(st.heading), Math.cos(st.heading));     // la plaque regarde le bus qui arrive (normale = -avant)
    grp.add(plate);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.12), M.snow);
    cap.position.y = 2.97; cap.rotation.y = plate.rotation.y; grp.add(cap);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.lamp);
    lamp.position.y = 3.2; grp.add(lamp);
    parent.add(grp);
    out.push(grp);
  });
  return { groups: out };
}
