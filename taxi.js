import * as THREE from 'three';
import { loadMixamoAvatar } from './avatar-loader.js';

// ==========================================
// BAD THERAPIST — LE TAXI D'OLIVER (taxi.js)
// ==========================================
// Un taxi garé près du camion, sous l'immeuble. Oliver (Mixamo) est au volant :
//   - voiture à l'arrêt  -> animation « sit »   (Sitting.fbx)
//   - voiture qui roule  -> animation « drive » (Driving.fbx)
//
// Trajet automatique :
//   ENTER près du taxi -> Oliver roule très vite jusqu'à la maison d'Evelyn, s'arrête, reste là.
//   Tu descends (EXIT), tu vas chez Evelyn, tu ressors, tu remontes dans le taxi (ENTER)
//   -> il te ramène à l'immeuble. Et ainsi de suite.
//
// Repère : comme le camion (vehicle.js). Avant du taxi = -z local ; cap h -> direction (-sin h, -cos h).
//
// Fichiers attendus (à côté de world_base.html) :
//   avatars/oliver/oliver.fbx, Sitting.fbx, Driving.fbx, texture_diffuse.png, texture_normal.png,
//   texture_roughness.png, texture_metallic.png

// ==========================================
// RÉGLAGES
// ==========================================

const AVATAR_DIR = 'avatars/oliver/';
const AVATAR_HEIGHT = 1.78;                 // taille debout d'Oliver (m)

// Place d'Oliver dans le taxi (repère du taxi). y = hauteur de ses pieds (le plancher est à 0.40).
// yaw = PI : Mixamo regarde vers +z, le taxi roule vers -z.
// Si Oliver flotte / s'enfonce dans le siège : change DRIVER.y. Réglage en direct dans la console (F12) :
//   BadTherapistTaxi.driver(x, y, z, yawEnDegres)
const DRIVER = { x: -0.5, y: 0.40, z: -0.25, yaw: Math.PI };
// Volant (repère du taxi). Réglage en direct : BadTherapistTaxi.wheel(x, y, z)
const WHEEL = { x: -0.5, y: 1.12, z: -0.55 };

const VMAX = 48;          // m/s (~170 km/h) en ligne droite
const ACC = 20;           // accélération (m/s²)
const BRK = 30;           // freinage (m/s²)
const ALAT = 14;          // accélération latérale max : il ralentit dans les virages serrés
const LANE = 2.2;         // décalage de la voie par rapport à l'axe de la route
const STOP_BEFORE_END = 8;   // il s'arrête 8 m avant le bout de la route (devant la maison)
const BOARD_RANGE = 6;       // distance pour voir le bouton ENTER
const AUTO_EXIT = false;     // true : le joueur descend tout seul à l'arrivée (sinon bouton EXIT)

const HOME_PARK = { x: -LANE, z: -11 };    // près du camion (camion en x 3.8, z -9.5) ; le taxi regarde vers la route (+z)

export function createTaxi(parent, o) {

  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const camera = o.camera;
  const groundH = o.groundH;
  const rects = o.rects || [];
  const road = o.road;                       // { samples:[{x,z,s,tx,tz}], len }

  // ==========================================
  // MODÈLE (taxi jaune, vitres transparentes : on voit Oliver)
  // ==========================================

  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  parent.add(g);

  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0xe2b420, roughness: 0.5, metalness: 0.3, emissive: 0x2c2204 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false
    }),
    light: new THREE.MeshBasicMaterial({ color: 0xffe9c0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0x8a1408 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
  };

  function box(w, h, d, mat, x, y, z, par) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (par || g).add(m);
    return m;
  }

  const FLOOR = 0.40, SEAT_TOP = 0.80, BELT = 0.95, ROOF = 1.88;
  const CAB_Z0 = -1.05, CAB_Z1 = 1.55, CAB_C = 0.25, CAB_L = 2.6;

  // Caisse : dessous, plancher, portières, capot, coffre, pare-chocs
  box(1.8, 0.2, 4.5, M.dark, 0, 0.3, 0);
  box(1.86, 0.08, CAB_L, M.dark, 0, FLOOR - 0.04, CAB_C);
  box(0.07, BELT - 0.3, CAB_L, M.body, -0.915, (BELT + 0.3) / 2, CAB_C);
  box(0.07, BELT - 0.3, CAB_L, M.body, 0.915, (BELT + 0.3) / 2, CAB_C);
  box(1.9, BELT - 0.3, 1.25, M.body, 0, (BELT + 0.3) / 2, -1.675);     // capot
  box(1.9, BELT - 0.3, 0.75, M.body, 0, (BELT + 0.3) / 2, 1.925);      // coffre
  box(1.7, 0.05, 1.1, M.snow, 0, BELT + 0.025, -1.675);
  box(1.95, 0.2, 0.2, M.metal, 0, 0.42, -2.33);
  box(1.95, 0.2, 0.2, M.metal, 0, 0.42, 2.33);
  box(0.3, 0.16, 0.06, M.light, -0.65, 0.78, -2.3);
  box(0.3, 0.16, 0.06, M.light, 0.65, 0.78, -2.3);
  box(0.3, 0.14, 0.05, M.tail, -0.7, 0.8, 2.3);
  box(0.3, 0.14, 0.05, M.tail, 0.7, 0.8, 2.3);

  // Cabine : montants, toit, vitres
  const pillarH = ROOF - BELT;
  [[-0.9, CAB_Z0], [0.9, CAB_Z0], [-0.915, CAB_C], [0.915, CAB_C], [-0.9, CAB_Z1], [0.9, CAB_Z1]].forEach(function (p) {
    box(0.07, pillarH, 0.07, M.body, p[0], (BELT + ROOF) / 2, p[1]);
  });
  box(1.98, 0.08, CAB_L + 0.12, M.body, 0, ROOF + 0.04, CAB_C);
  box(1.86, 0.05, CAB_L, M.snow, 0, ROOF + 0.1, CAB_C);

  const gh = pillarH - 0.04;
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
  ws.position.set(0, (BELT + ROOF) / 2, CAB_Z0);
  g.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
  rw.position.set(0, (BELT + ROOF) / 2, CAB_Z1);
  g.add(rw);
  [-0.9, 0.9].forEach(function (x) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(CAB_L, gh), M.glass);
    sw.rotation.y = Math.PI / 2;
    sw.position.set(x, (BELT + ROOF) / 2, CAB_C);
    g.add(sw);
  });

  // Enseigne « TAXI » sur le toit (lisible de l'avant et de l'arrière)
  (function () {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 80;
    const k = c.getContext('2d');
    k.fillStyle = '#f4ecc8'; k.fillRect(0, 0, 256, 80);
    k.fillStyle = '#111'; k.font = 'bold 58px Arial, sans-serif';
    k.textAlign = 'center'; k.textBaseline = 'middle';
    k.fillText('TAXI', 128, 44);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const sy = ROOF + 0.2;
    box(0.72, 0.2, 0.24, M.dark, 0, sy, CAB_C);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.18), mat);
    front.position.set(0, sy, CAB_C - 0.121);
    front.rotation.y = Math.PI;
    g.add(front);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.18), mat);
    back.position.set(0, sy, CAB_C + 0.121);
    g.add(back);
  })();

  // Intérieur : tableau de bord, volant, sièges
  box(1.8, 0.22, 0.4, M.dark, 0, 1.02, CAB_Z0 + 0.25);
  const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
  wheelSteer.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
  wheelSteer.rotation.x = -0.95;
  g.add(wheelSteer);
  function seat(x, z) {
    box(0.4, SEAT_TOP - 0.14 - FLOOR, 0.4, M.dark, x, (FLOOR + SEAT_TOP - 0.14) / 2, z);
    box(0.55, 0.14, 0.55, M.seat, x, SEAT_TOP - 0.07, z);
    box(0.55, 0.62, 0.1, M.seat, x, SEAT_TOP + 0.31, z + 0.28);
  }
  seat(-0.5, 0.0);                   // conducteur
  seat(0.5, 0.0);                    // passager avant
  box(1.5, 0.14, 0.55, M.seat, 0, SEAT_TOP - 0.07, 1.0);          // banquette arrière
  box(1.5, 0.62, 0.1, M.seat, 0, SEAT_TOP + 0.31, 1.28);

  // Roues
  const wheels = [];
  [[-0.97, -1.5, true], [0.97, -1.5, true], [-0.97, 1.5, false], [0.97, 1.5, false]].forEach(function (w) {
    const wg = new THREE.Group();
    wg.rotation.order = 'YXZ';
    wg.position.set(w[0], 0.36, w[1]);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), M.rubber);
    tire.rotation.z = Math.PI / 2;
    wg.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 8), M.metal);
    hub.rotation.z = Math.PI / 2;
    wg.add(hub);
    g.add(wg);
    wheels.push({ g: wg, front: w[2] });
  });

  // (pas de vraie lumière pour les phares : chaque lumière dynamique alourdit tous les pixels de la scène)

  // ==========================================
  // OLIVER (chargé en arrière-plan)
  // ==========================================

  const driverSlot = new THREE.Group();
  driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
  driverSlot.rotation.y = DRIVER.yaw;
  g.add(driverSlot);

  let ev = null;

  function loadOliver() {
    const d = AVATAR_DIR;
    loadMixamoAvatar({
      model: d + 'oliver.fbx',
      textures: {
        map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png',
        roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png'
      },
      animations: { sit: d + 'Sitting.fbx', drive: d + 'Driving.fbx' },
      height: AVATAR_HEIGHT
    }).then(function (a) {
      ev = a;
      driverSlot.add(a.root);
      a.play(a.actions.sit ? 'sit' : 'default');
      a.update(0.001);
      warmUp(a.root);
      console.log('[taxi] Oliver chargé. Animations :', Object.keys(a.actions));
    }).catch(function (e) {
      console.warn('[taxi] Oliver n\'a pas pu être chargé :', e && e.message ? e.message : e);
    }).then(function () {
      if (window.BTLoad) window.BTLoad.release('oliver');
    });
  }

  // Envoie textures et shaders au GPU tout de suite (sinon petite saccade à la première apparition d'Oliver)
  function warmUp(root) {
    const r = o.renderer;
    if (!r) return;
    try {
      root.traverse(function (m) {
        const mat = m.material;
        if (!mat) return;
        [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].forEach(function (tx) {
          if (tx && r.initTexture) r.initTexture(tx);
        });
      });
      let rt = parent;
      while (rt.parent) rt = rt.parent;           // la vraie scène (c'est elle qui contient toutes les lumières)
      r.compile(rt, camera);
    } catch (e) { /* sans importance */ }
  }

  if (window.BTLoad) window.BTLoad.hold('oliver');     // l'écran de chargement attend Oliver
  loadOliver();

  window.BadTherapistTaxi = {
    group: g,
    slot: driverSlot,
    driver: function (x, y, z, yawDeg) {
      driverSlot.position.set(x, y, z);
      if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
      console.log('[taxi] DRIVER = { x:', x, ', y:', y, ', z:', z, ', yaw:', driverSlot.rotation.y, '}');
    },
    wheel: function (x, y, z) {
      wheelSteer.position.set(x, y, z);
      console.log('[taxi] WHEEL = { x:', x, ', y:', y, ', z:', z, '}');
    },
    ev: function () { return ev; }
  };

  // ==========================================
  // TRAJETS (suivent la route de immeuble.js)
  // ==========================================

  function arc(cx, cz, R, a0, a1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      out.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]);
    }
    return out;
  }

  const RS = road.samples.filter(function (p) { return p.s <= road.len - STOP_BEFORE_END; });
  const endS = RS[RS.length - 1];
  const WORK_PARK = { x: endS.x - LANE * endS.tz, z: endS.z + LANE * endS.tx };

  function makePath(pts) {
    const curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], 0, p[1]); }), false, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const total = curve.getLength();
    const raw = curve.getSpacedPoints(Math.max(8, Math.round(total / 2)));
    const m = raw.length;
    const X = new Array(m), Z = new Array(m), S = new Array(m), H = new Array(m), K = new Array(m), V = new Array(m);
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
    // Courbure -> vitesse maximale (virages) puis rampes d'accélération / de freinage
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 3), b = Math.min(m - 1, i + 3);
      const kappa = Math.abs(H[b] - H[a]) / Math.max(1e-3, S[b] - S[a]);
      K[i] = kappa;
      V[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(kappa, 1e-3)));
    }
    V[0] = Math.min(V[0], 1.5);
    V[m - 1] = Math.min(V[m - 1], 0.5);
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

  // Immeuble -> maison d'Evelyn : tout droit vers la route (voie de droite)
  function pathToWork() {
    const pts = [[HOME_PARK.x, HOME_PARK.z], [HOME_PARK.x, 0], [HOME_PARK.x, 22]];
    RS.forEach(function (p) { pts.push([p.x - LANE * p.tz, p.z + LANE * p.tx]); });
    return makePath(pts);
  }

  // Maison d'Evelyn -> immeuble : demi-tour sur la route, voie de droite en sens inverse, puis il se gare près du camion
  function pathToHome() {
    const pts = arc(WORK_PARK.x + 4, WORK_PARK.z, 4, Math.PI, 0, 6);
    const back = RS.filter(function (p) { return p.s <= road.len - STOP_BEFORE_END - 16; });
    for (let i = back.length - 1; i >= 0; i--) {
      const p = back[i];
      pts.push([p.x + LANE * p.tz, p.z - LANE * p.tx]);
    }
    // sur la place : il passe à l'ouest, fait demi-tour (rayon 5,5) et se gare nez vers la route
    // (le grand chêne en x -9.5, z 2 est contourné par l'ouest)
    pts.push([1.8, 30], [-3, 22], [-7, 16], [-11.5, 9], [-13.2, 2], [-13.2, -6]);
    arc(HOME_PARK.x - 5.5, HOME_PARK.z - 1.5, 5.5, Math.PI, 2 * Math.PI, 8).forEach(function (q) { pts.push(q); });
    pts.push([HOME_PARK.x, HOME_PARK.z]);        // dernier mètre en ligne droite : il s'arrête bien droit
    return makePath(pts);
  }

  // ==========================================
  // ÉTAT
  // ==========================================

  let at = 'home';                       // où le taxi est garé : 'home' | 'work'
  let mode = 'parked';                   // 'parked' | 'driving' | 'arrived' (le joueur est dedans, voiture arrêtée)
  let riding = false;
  let P = null, s = 0;
  let x = HOME_PARK.x, z = HOME_PARK.z, heading = Math.PI;
  let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steer = 0;
  let owned = false, actionShown = false, arrivedT = 0, cool = 0;
  const SEAT = new THREE.Vector3(0.5, SEAT_TOP + 0.72, 0.95);        // le joueur : banquette arrière, côté droit

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function place(dt, snap) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const hF = groundH(x + fx * 2.2, z + fz * 2.2);
    const hR = groundH(x - fx * 2.2, z - fz * 2.2);
    const hRt = groundH(x + rx * 1.0, z + rz * 1.0);
    const hL = groundH(x - rx * 1.0, z - rz * 1.0);
    const ty = (hF + hR + hRt + hL) / 4;
    const tp = Math.atan2(hF - hR, 4.4);
    const tr = Math.atan2(hRt - hL, 2.0);
    const k = snap ? 1 : Math.min(1, dt * 9);
    bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 14);
    pitch += (tp - pitch) * k;
    roll += (tr - roll) * k;
    g.position.set(x, bodyY, z);
    g.rotation.set(pitch, heading, roll);
  }
  place(0, true);

  // ==========================================
  // ACTION (bouton ENTER / EXIT partagé avec le camion)
  // ==========================================

  function showAction(label, fn) {
    if (o.action) { o.action.show(label, fn); actionShown = true; }
  }
  function hideAction() {
    if (o.action && actionShown) { o.action.hide(); actionShown = false; }
  }

  // ==========================================
  // ENTRER / SORTIR
  // ==========================================

  function enter() {
    if (mode !== 'parked') return;
    P = at === 'home' ? pathToWork() : pathToHome();
    s = 0;
    riding = true;
    mode = 'driving';
    owned = false;
    heading = P.H[0];
    speed = 0;
    if (o.view) o.view.set(heading, 0);
    hideAction();
    if (o.action) o.action.hide();
  }

  function insideRect(px, pz) {
    for (let i = 0; i < rects.length; i++) {
      const c = rects[i];
      if (px > c.x0 - 0.5 && px < c.x1 + 0.5 && pz > c.z0 - 0.5 && pz < c.z1 + 0.5) return true;
    }
    return false;
  }

  function exit() {
    if (mode !== 'arrived') return;
    mode = 'parked';
    riding = false;
    speed = 0;
    at = at === 'home' ? 'work' : 'home';
    cool = 2.5;                          // pas de ré-embarquement accidentel juste après être descendu
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const cands = [[2.6, 0.9], [-2.6, 0.9], [2.6, -2.2], [-2.6, -2.2], [0, -4.6]];
    let best = null;
    for (let i = 0; i < cands.length && !best; i++) {
      const px = x + rx * cands[i][0] + fx * cands[i][1];
      const pz = z + rz * cands[i][0] + fz * cands[i][1];
      if (!insideRect(px, pz)) best = [px, pz];
    }
    if (!best) best = [x + rx * 2.6, z + rz * 2.6];
    camera.position.x = origin.x + best[0];
    camera.position.z = origin.z + best[1];
    if (o.onExit) o.onExit(best[0], best[1]);
    hideAction();
    if (o.action) o.action.hide();
  }

  // ==========================================
  // UPDATE
  // ==========================================
  // active = le joueur est dans la rue (sinon pas de bouton ENTER)

  function animate(dt) {
    if (!ev) return;
    const far = Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z) > 140;
    if (ev.root.visible === far) ev.root.visible = !far;          // un personnage animé caché ne coûte rien
    if (far) return;
    ev.play(mode === 'driving' && speed > 0.5 ? 'drive' : 'sit');
    ev.update(dt);
  }

  function drive(dt) {
    const q0 = sampleAt(P, s);
    s += q0.v * dt;
    let arrived = false;
    if (s >= P.len - 0.12) { s = P.len; arrived = true; }
    const q = sampleAt(P, s);
    const prevHeading = heading;
    x = q.x; z = q.z; heading = q.h;
    speed = arrived ? 0 : q.v;
    place(dt, false);

    steer += (clamp(q.turn * 2.7, -0.5, 0.5) - steer) * Math.min(1, dt * 10);
    wheelRot += speed * dt / 0.36;
    wheels.forEach(function (w) {
      w.g.rotation.x = wheelRot;
      w.g.rotation.y = w.front ? steer : 0;
    });

    // Caméra : banquette arrière (le joueur peut regarder autour de lui)
    const eye = SEAT.clone().applyEuler(g.rotation).add(g.position);
    camera.position.set(origin.x + eye.x, origin.y + eye.y, origin.z + eye.z);
    if (o.view) {
      const v = o.view.get();
      o.view.set(v.yaw + (heading - prevHeading), v.pitch);
    }
    if (o.snow) o.snow.setBaseY(origin.y + bodyY);

    if (arrived) {
      mode = 'arrived';
      arrivedT = 0;
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
    }
  }

  function step(dt, active) {

    if (mode === 'driving') {
      drive(dt);
      animate(dt);
      return;
    }

    animate(dt);

    if (mode === 'arrived') {
      arrivedT += dt;
      if (AUTO_EXIT && arrivedT > 0.6) { exit(); return; }
      if (!o.action && arrivedT > 1.2) { exit(); return; }
      showAction('EXIT', exit);
      return;
    }

    if (cool > 0) { cool -= dt; hideAction(); return; }

    // Garé : bouton ENTER si le joueur est à côté (le camion garde la priorité s'il est plus près)
    const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
    const dT = Math.hypot(px - x, pz - z);
    const tr = o.truck;
    const truckBusy = !!(tr && tr.isDriving());
    let dTr = 1e9;
    if (tr) { const tp = tr.getPose(); dTr = Math.hypot(px - tp.x, pz - tp.z); }
    const wins = active && !truckBusy && dT < BOARD_RANGE && dT <= dTr;
    if (wins) {
      showAction('ENTER', enter);
      owned = true;
    } else if (owned) {
      owned = false;
      if (active && !truckBusy && tr && dTr < 4.6) { if (o.action) o.action.show('ENTER', tr.enter); }
      else hideAction();
    }
  }

  // Le taxi se met à jour tout seul à chaque image (même si le monde hôte, ex. bedroom.js, ne l'appelle pas).
  // Si l'hôte l'appelle aussi, le deuxième appel de la même image est ignoré.
  let lastTick = 0;
  function tick(active) {
    const now = performance.now();
    if (lastTick && now - lastTick < 3) return;
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
    lastTick = now;
    step(dt, active);
  }
  (function loop() { tick(true); requestAnimationFrame(loop); })();

  return {
    group: g,
    isRiding: function () { return riding; },
    enter: enter,
    exit: exit,
    update: function (dt, active) { tick(active !== false); },
    getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; }
  };
}
