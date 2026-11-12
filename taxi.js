import * as THREE from 'three';
import { loadMixamoAvatar } from './avatar-loader.js';

// ==========================================
// BAD THERAPIST — LE TAXI D'OLIVER (taxi.js)
// ==========================================
// Un taxi garé près du camion, sous l'immeuble. Oliver (Mixamo) est au volant :
//   - voiture à l'arrêt  -> animation « sit »   (Sitting.fbx)
//   - voiture qui roule  -> animation « drive » (Driving.fbx)
//
// Trajet :
//   ENTER près du taxi -> une carte s'ouvre, tu choisis où aller (icônes, pas de noms).
//   Oliver roule jusqu'à l'endroit choisi par les routes, s'arrête, et le taxi RESTE LÀ.
//   Tu descends (EXIT) ; tant que tu ne remontes pas dedans (ENTER), il ne bouge pas.
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
const RIDE_WAIT_MS = 25000;  // le conducteur (avatar libre) a 25 s pour répondre à une demande de course ; sans réponse il accepte

const HOME_PARK = { x: -LANE, z: -11 };    // près du camion (camion en x 3.8, z -9.5) ; le taxi regarde vers la route (+z)

export function createTaxi(parent, o) {

  // freeDriver = true : Oliver n'est plus chargé ici, c'est un avatar libre (engine/avatar-brain.js) qui s'assoit au volant quand il le veut
  const FREE_DRIVER = !!o.freeDriver;

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
    tail: new THREE.MeshBasicMaterial({ color: 0xff3a1e }),
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

  // Phares : une seule vraie lumière partagée avec le camion (o.headlight), prise en montant dans le taxi
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.3, -24);
  g.add(spotTarget);
  function mountHeadlight() {
    const h = o.headlight;
    if (!h) return;
    h.position.set(0, 0.9, -2.2);
    g.add(h);
    h.target = spotTarget;
    h.intensity = 4.0;
  }
  function dimHeadlight() {
    if (o.headlight && o.headlight.parent === g) o.headlight.intensity = 0;
  }

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

  if (!FREE_DRIVER) {
    if (window.BTLoad) window.BTLoad.hold('oliver');     // l'écran de chargement attend Oliver
    loadOliver();
  }

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

  // ----- Réseau routier : toutes les routes de immeuble.js reliées entre elles (jonctions) -----
  const allRoads = (o.roads || [road]).filter(function (r) { return r.kind !== 'rail'; });
  const stops = o.stops || [];
  const nodes = [], adj = [];
  const base = {};
  allRoads.forEach(function (r) {
    base[r.name] = nodes.length;
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
    return bd < 40 * 40 ? b : -1;
  }

  function dijkstra(src, dst) {
    const n = nodes.length, dist = new Float64Array(n).fill(1e18), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[src] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, bd = 1e18;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0 || u === dst) break;
      done[u] = 1;
      adj[u].forEach(function (e) { if (dist[u] + e.c < dist[e.to]) { dist[e.to] = dist[u] + e.c; prev[e.to] = u; } });
    }
    if (prev[dst] < 0 && src !== dst) return null;
    const out = [];
    for (let v = dst; v >= 0; v = prev[v]) out.push(v);
    return out.reverse();
  }

  // Itinéraire depuis la position actuelle du taxi (où qu'il soit garé) jusqu'à une destination
  function routeTo(stop) {
    const src = nearestNode(x, z);
    const dst = base[stop.road] + stop.idx;
    if (src < 0) return null;
    const ids = dijkstra(src, dst);
    if (!ids) return null;
    // positions de l'axe, espacées d'au moins 3,5 m
    const c = [];
    ids.forEach(function (id, k) {
      const n = nodes[id];
      if (!c.length || k === ids.length - 1 || Math.hypot(n.x - c[c.length - 1][0], n.z - c[c.length - 1][1]) >= 3.5) c.push([n.x, n.z]);
    });
    if (c.length < 2) return null;
    // voie de droite (sens de la marche)
    const lane = c.map(function (q, i) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [q[0] - LANE * dz, q[1] + LANE * dx, dx, dz];
    });
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const pts = [[x, z]];
    let cur = [x, z], cf = [fx, fz];
    // demi-tour si la route part dans l'autre sens
    if (lane[0][2] * fx + lane[0][3] * fz < -0.2 || (lane.length > 2 && lane[1][2] * fx + lane[1][3] * fz < -0.2)) {
      const R = 2.4, rx = Math.cos(heading), rz = -Math.sin(heading);
      for (let i = 1; i <= 8; i++) {
        const t = Math.PI * i / 8;
        pts.push([x + fx * R * Math.sin(t) - rx * R * (1 - Math.cos(t)), z + fz * R * Math.sin(t) - rz * R * (1 - Math.cos(t))]);
      }
      cur = pts[pts.length - 1]; cf = [-fx, -fz];
    }
    // on saute les points de route qui sont derrière le taxi
    let k0 = 0;
    while (k0 < lane.length - 2 && (lane[k0][0] - cur[0]) * cf[0] + (lane[k0][1] - cur[1]) * cf[1] < 3) k0++;
    for (let k = k0; k < lane.length; k++) pts.push([lane[k][0], lane[k][1]]);
    return pts;
  }

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

  // ==========================================
  // ÉTAT
  // ==========================================

  let mode = 'parked';                   // 'parked' | 'choosing' (carte ouverte) | 'driving' | 'arrived' (le joueur est dedans, voiture arrêtée)
  let riding = false;
  let P = null, s = 0;
  let x = HOME_PARK.x, z = HOME_PARK.z, heading = Math.PI;
  let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steer = 0;
  let owned = false, actionShown = false, arrivedT = 0, cool = 0;
  let auto = false;                       // true : le taxi roule tout seul (conduit par son avatar), sans le joueur
  let driverIn = !FREE_DRIVER;            // un conducteur est au volant (sinon pas de bouton ENTER)
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

  // ----- Carte de destinations (icônes, aucun nom) -----
  let ui = null;

  function icon(c, type, cx, cy, r, col) {
    c.save(); c.translate(cx, cy); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1.5, r * 0.12); c.lineJoin = 'round'; c.lineCap = 'round';
    const u = r / 10;
    c.beginPath();
    if (type === 'home') { c.rect(-5 * u, -8 * u, 10 * u, 16 * u); c.stroke(); for (let k = 0; k < 3; k++) c.fillRect(-2.5 * u, (-5 + k * 5) * u, 5 * u, 2.4 * u); }
    else if (type === 'work') { c.moveTo(-8 * u, -1 * u); c.lineTo(0, -8 * u); c.lineTo(8 * u, -1 * u); c.moveTo(-6 * u, -1 * u); c.lineTo(-6 * u, 7 * u); c.lineTo(6 * u, 7 * u); c.lineTo(6 * u, -1 * u); c.stroke(); }
    else if (type === 'town') { c.rect(-9 * u, -2 * u, 6 * u, 9 * u); c.rect(-3 * u, -8 * u, 6 * u, 15 * u); c.rect(3 * u, 0, 6 * u, 7 * u); c.stroke(); }
    else if (type === 'gas') { c.rect(-6 * u, -8 * u, 9 * u, 15 * u); c.moveTo(3 * u, -3 * u); c.lineTo(7 * u, -3 * u); c.lineTo(7 * u, 4 * u); c.stroke(); c.fillRect(-4 * u, -6 * u, 5 * u, 4 * u); }
    else if (type === 'train') { c.rect(-5 * u, -8 * u, 10 * u, 12 * u); c.moveTo(-7 * u, 8 * u); c.lineTo(7 * u, 8 * u); c.stroke(); c.fillRect(-3 * u, -5 * u, 6 * u, 4 * u); }
    else if (type === 'city') { c.rect(-8 * u, -3 * u, 7 * u, 10 * u); c.rect(-1 * u, -8 * u, 9 * u, 15 * u); c.stroke(); }
    else if (type === 'port') { c.arc(0, -5 * u, 2.6 * u, 0, 6.3); c.moveTo(0, -2.4 * u); c.lineTo(0, 8 * u); c.moveTo(-5 * u, 1 * u); c.lineTo(5 * u, 1 * u); c.moveTo(-7 * u, 3 * u); c.quadraticCurveTo(-5 * u, 9 * u, 0, 8 * u); c.quadraticCurveTo(5 * u, 9 * u, 7 * u, 3 * u); c.stroke(); }
    else { c.arc(0, 0, 6 * u, 0, 6.3); c.stroke(); }
    c.restore();
  }

  function buildUI() {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9500;background:rgba(5,7,10,0.94);display:none;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#e8d6a8;touch-action:manipulation;';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:min(96vw,760px);display:flex;justify-content:space-between;align-items:center;padding:6px 4px;letter-spacing:3px;font-size:13px;';
    bar.textContent = 'DESTINATION';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'background:#1a1d22;border:1px solid #5a5340;color:#e8d6a8;border-radius:8px;width:44px;height:40px;font-size:20px;';
    bar.appendChild(close);
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:min(96vw,760px);height:min(62vh,700px);background:#0b0e12;border:1px solid #3a3526;border-radius:10px;';
    const row = document.createElement('div');
    row.style.cssText = 'width:min(96vw,760px);display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:12px 4px;';
    root.appendChild(bar); root.appendChild(cv); root.appendChild(row);
    document.body.appendChild(root);
    ui = { root: root, cv: cv, row: row, hit: [], close: close, md: null };
    close.addEventListener('click', closeMenu);
    cv.addEventListener('click', function (e) {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height;
      let best = null, bd = 1e9;
      ui.hit.forEach(function (h) { const d = Math.hypot(px - h.x, py - h.y); if (d < h.r && d < bd) { bd = d; best = h; } });
      if (best && !best.here) requestRide(best.stop);
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mode === 'choosing') closeMenu(); });
  }

  function hereStop() {
    let best = null, bd = 30;
    stops.forEach(function (st) { const d = Math.hypot(st.x - x, st.z - z); if (d < bd) { bd = d; best = st; } });
    return best;
  }

  function drawMenu() {
    const md = o.getMapData ? o.getMapData() : null;
    const cv = ui.cv, W = cv.clientWidth || 700, H = cv.clientHeight || 500, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d');
    c.fillStyle = '#0b0e12'; c.fillRect(0, 0, cv.width, cv.height);
    const b = md ? md.bounds : { x0: -290, x1: 1060, z0: -320, z1: 2200 };
    const mg = 30 * dpr;
    const k = Math.min((cv.width - 2 * mg) / (b.x1 - b.x0), (cv.height - 2 * mg) / (b.z1 - b.z0));
    const ox = (cv.width - (b.x1 - b.x0) * k) / 2, oz = (cv.height - (b.z1 - b.z0) * k) / 2;
    const X = function (v) { return ox + (v - b.x0) * k; }, Z = function (v) { return oz + (v - b.z0) * k; };
    if (md && md.sea) { c.fillStyle = '#0d2230'; c.fillRect(X(b.x0), Z(md.sea.z0), (b.x1 - b.x0) * k, (b.z1 - md.sea.z0) * k); }
    if (md) {
      (md.lakes || []).forEach(function (l) { c.fillStyle = '#14303d'; c.beginPath(); c.arc(X(l.x), Z(l.z), l.r * k, 0, 6.3); c.fill(); });
      (md.roads || []).forEach(function (r) {
        const rail = r.w < 0;
        c.strokeStyle = rail ? '#6a6a72' : '#8f8a78'; c.lineWidth = Math.max(1.5 * dpr, (rail ? 3 : Math.abs(r.w)) * k * 1.4);
        c.setLineDash(rail ? [6 * dpr, 5 * dpr] : []);
        c.beginPath();
        r.pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0] != null ? p[0] : p.x), Z(p[1] != null ? p[1] : p.z)); else c.moveTo(X(p[0] != null ? p[0] : p.x), Z(p[1] != null ? p[1] : p.z)); });
        c.stroke();
      });
      c.setLineDash([]);
    }
    const here = hereStop();
    ui.hit = [];
    ui.row.innerHTML = '';
    stops.forEach(function (st) {
      const isHere = here && here.id === st.id;
      const R = 22 * dpr;
      const col = isHere ? '#6c6c6c' : '#f0d9a0';
      c.fillStyle = '#12161b'; c.strokeStyle = col; c.lineWidth = 2 * dpr;
      c.beginPath(); c.arc(X(st.x), Z(st.z), R, 0, 6.3); c.fill(); c.stroke();
      icon(c, st.type, X(st.x), Z(st.z), R * 0.7, col);
      ui.hit.push({ x: X(st.x), y: Z(st.z), r: R * 1.25, stop: st, here: isHere });
      const btn = document.createElement('button');
      btn.style.cssText = 'width:64px;height:56px;background:#14181d;border:1px solid ' + (isHere ? '#3a3a3a' : '#7a6e4c') + ';border-radius:10px;opacity:' + (isHere ? 0.4 : 1) + ';';
      const ic = document.createElement('canvas'); ic.width = 80; ic.height = 70; ic.style.cssText = 'width:40px;height:35px;';
      icon(ic.getContext('2d'), st.type, 40, 35, 26, col);
      btn.appendChild(ic);
      if (!isHere) btn.addEventListener('click', function () { requestRide(st); });
      ui.row.appendChild(btn);
    });
    // le taxi
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(X(x), Z(z), 6 * dpr, 0, 6.3); c.fill();
    c.strokeStyle = '#ffd23a'; c.lineWidth = 2 * dpr; c.beginPath(); c.arc(X(x), Z(z), 11 * dpr, 0, 6.3); c.stroke();
  }

  function openMenu() {
    if (!ui) buildUI();
    mode = 'choosing';
    hideAction();
    if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) { /* rien */ } }
    ui.root.style.display = 'flex';
    drawMenu();
  }
  function closeMenu() {
    if (ui) ui.root.style.display = 'none';
    if (mode === 'choosing') mode = 'parked';
    cool = 0.8;
  }
  function pick(stop, isAuto) {
    const pts = routeTo(stop);
    if (ui) ui.root.style.display = 'none';
    if (!pts) { mode = 'parked'; cool = 0.8; return false; }
    P = makePath(pts);
    s = 0;
    auto = !!isAuto;
    riding = !auto;
    mode = 'driving';
    owned = false;
    heading = P.H[0];
    speed = 0;
    if (!auto && o.view) o.view.set(heading, 0);
    mountHeadlight();
    hideAction();
    if (!auto && o.action) o.action.hide();
    return true;
  }

  // Le joueur a choisi une destination. Si le conducteur est un avatar libre (o.onRideRequest), c'est LUI qui décide d'accepter ou de refuser.
  function requestRide(stop) {
    if (!o.onRideRequest) { pick(stop, false); return; }
    if (ui) ui.root.style.display = 'none';
    mode = 'asking';
    hideAction();
    let done = false;
    const finish = function (ok) {
      if (done) return;
      done = true;
      if (mode !== 'asking') return;
      if (ok) pick(stop, false); else { mode = 'parked'; cool = 1.5; }
    };
    setTimeout(function () { finish(true); }, RIDE_WAIT_MS);
    try { o.onRideRequest(stop, finish); } catch (e) { finish(true); }
  }

  function enter() {
    if (mode !== 'parked') return;
    if (!stops.length || !driverIn) return;
    openMenu();
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

    // Caméra : banquette arrière (le joueur peut regarder autour de lui) — seulement s'il est à bord
    if (!auto) {
      const eye = SEAT.clone().applyEuler(g.rotation).add(g.position);
      camera.position.set(origin.x + eye.x, origin.y + eye.y, origin.z + eye.z);
      if (o.view) {
        const v = o.view.get();
        o.view.set(v.yaw + (heading - prevHeading), v.pitch);
      }
      if (o.snow) o.snow.setBaseY(origin.y + bodyY);
    }

    if (arrived) {
      dimHeadlight();
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
      if (auto) {                                    // le conducteur est arrivé seul : le taxi reste garé là
        auto = false;
        mode = 'parked';
        cool = 1;
        if (o.onArrive) o.onArrive({ x: x, z: z });
      } else {
        mode = 'arrived';
        arrivedT = 0;
      }
    }
  }

  function step(dt, active) {

    if (mode === 'driving') {
      drive(dt);
      animate(dt);
      return;
    }

    animate(dt);

    if (mode === 'choosing' || mode === 'asking') return;

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
    const wins = active && driverIn && !truckBusy && dT < BOARD_RANGE && dT <= dTr;
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
    // Aller directement à une destination (id de layout.js : 'home', 'work', 'town', 'gas', 'station', 'port')
    goTo: function (id) {
      const st = stops.filter(function (q) { return q.id === id; })[0];
      if (st && (mode === 'parked' || mode === 'choosing')) pick(st);
    },
    getMode: function () { return mode; },
    getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },

    // ----- pour un conducteur libre (avatar-brain.js : def.vehicle = taxi) -----
    slot: driverSlot,                                              // groupe où s'assoit l'avatar
    isMoving: function () { return mode === 'driving'; },
    isRiding: function () { return riding; },
    setDriverPresent: function (v) { driverIn = !!v; },
    // rouler seul jusqu'à l'arrêt le plus proche de (px, pz) ; renvoie false si impossible
    driveTo: function (px, pz) {
      if (mode !== 'parked' || !stops.length) return false;
      let best = null, bd = 1e18;
      stops.forEach(function (st) { const d = Math.hypot(st.x - px, st.z - pz); if (d < bd) { bd = d; best = st; } });
      if (!best) return false;
      const here = hereStop();
      if (here && here.id === best.id) return false;
      return pick(best, true);
    },
    // un endroit libre à côté de la portière, pour que le conducteur descende
    doorSpot: function () {
      const rx = Math.cos(heading), rz = -Math.sin(heading);
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      const cands = [[2.6, 0.9], [-2.6, 0.9], [2.6, -2.2], [-2.6, -2.2], [0, -4.6]];
      for (let i = 0; i < cands.length; i++) {
        const px = x + rx * cands[i][0] + fx * cands[i][1];
        const pz = z + rz * cands[i][0] + fz * cands[i][1];
        if (!insideRect(px, pz)) return [px, pz];
      }
      return [x + rx * 2.6, z + rz * 2.6];
    }
  };
}
