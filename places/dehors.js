import * as THREE from 'three';
import { buildWork } from './evelyn-house.js'
import { buildForest } from './forest.js';
import { createTruck, createTaxi, createBus, createPoliceCar } from '../objects/vehicle.js';     // tous les véhicules dans un seul fichier
import { attachBusLine } from '../npcs/violet.js';      // le métier de Violet (la ligne de bus) est dans sa fiche
import { attachPolice } from '../npcs/leon.js';         // le métier de Leon (la patrouille) est dans sa fiche
import { createRideMenu } from '../npcs/oliver.js';     // le métier d'Oliver (le menu de destination du taxi) est dans sa fiche
import { SEA, getShared, WORK_SPOT, HOUSE_POS, TER, FAR_Y, createRoadNet } from './monde.js';
import { createKit, createHub, createTraffic } from './outils.js';
import { buildTown } from './town.js';
import { buildGasStation } from './gasstation.js';
import { buildRailway } from './bridge.js';
import { buildCityB } from './cityb.js';
import { buildPort } from './port.js';
import { buildImmeuble } from './immeuble.js';
import { society } from '../engine/society.js';
import { createEvelynBody } from '../engine/evelyn-core.js';
import { createNpcBodies } from '../npcs/driver.js';
import { loadMixamoAvatar } from '../avatar-loader.js';

// ==========================================
// ILLUSION — TOUT LE DEHORS (places/dehors.js)
// ==========================================
// Ce fichier remplace : outside.js + index.js
//
//   PARTIE 1 : buildPlaces  -> assemble les lieux (ville, station-service, gare, ville B, port) (ex index.js)
//   PARTIE 2 : buildWorld   -> assemble toute la rue : sol, route, immeuble, forêt, lac, maison de travail,
//                              véhicules et les lieux ci-dessus (ex outside.js)
//
// Hiver figé, nuit de neige, solitude.
// Utilisé par apartment.js (la rue + la vue par la fenêtre), par work.js et par portail.js.

// ==========================================
// PARTIE 1 — ASSEMBLAGE DES LIEUX (ex index.js)
// ==========================================
// buildWorld appelle buildPlaces(scene, {...}) une fois (monde réel seulement, pas la copie de la fenêtre).
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
    signals: { ahead: traffic.ahead },       // feux rouges : le bus et la voiture de police s'y arrêtent (places.signals.ahead)
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

// ==========================================
// PARTIE 2 — LA RUE COMPLÈTE (ex outside.js)
// ==========================================
// Assemble tout l'extérieur : sol enneigé, route, immeuble (immeuble.js), forêt, lac gelé, maison de travail,
// camion, taxi et nouveaux lieux.

export function buildWorld(scene, ctx = {}) {

const { camera, renderer } = ctx;

// Lieu extérieur : on active la neige (désactivée par défaut dans world_base.html)
if (ctx.snow) ctx.snow.setEnabled(true);

const kit = createKit({ renderer: renderer });
const { BOOST, EM, rnd, disp, makeCanvas, makeTex, unitBox, item, makeInstanced, box, glowSprite, mats, lumpGeo } = kit;
const SH = getShared();


// ==========================================
// 4. SOL ENNEIGÉ
// ==========================================

function snowCanvas(size = 512) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = 'rgb(206,214,219)';
  g.fillRect(0, 0, size, size);

  const wrap = fn => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };

  // Grandes ondulations de neige (tuilables)
  for (let i = 0; i < 80; i++) {
    const x = rnd() * size, y = rnd() * size, r = 30 + rnd() * 80;
    const light = rnd() < 0.5;
    const col = light ? '255,255,255' : '138,155,170';
    const alpha = 0.10 + rnd() * 0.12;
    wrap((dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(${col},${alpha})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }

  // Grain fin
  for (let i = 0; i < 6000; i++) {
    const v = rnd() < 0.5 ? 255 : 110;
    g.fillStyle = `rgba(${v},${v},${v},${0.10 + rnd() * 0.22})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return c;
}

const snowCv = snowCanvas();
const snowMap = makeTex(snowCv, 1, 1, true);     // le terrain a des UV en mètres / 8.06
const snowBump = makeTex(snowCv, 1, 1, false);

// Sol lointain (noyé dans le brouillard), sous le terrain
const farGround = new THREE.Mesh(
  new THREE.PlaneGeometry(10000, 10000),
  new THREE.MeshStandardMaterial({ color: 0x8a949a, roughness: 0.95 })
);
farGround.rotation.x = -Math.PI / 2;
farGround.position.set(0, FAR_Y - 0.1, 0);
scene.add(farGround);

// Terrain : plat autour de l'immeuble, puis collines et montagnes.
// Il suit la route jusqu'à la maison de travail (voir buildShared dans monde.js).
const ground = new THREE.Mesh(
  SH.terrainGeo,
  new THREE.MeshStandardMaterial({
    color: 0xb4bdc4,
    map: snowMap,
    bumpMap: snowBump,
    bumpScale: 1.2,
    roughness: 0.93,
    vertexColors: true,
    emissive: new THREE.Color(0x0c1114).multiplyScalar(EM)
  })
);
scene.add(ground);

// ==========================================
// 5. ROUTE DÉNEIGÉE (allée vers l'immeuble)
// ==========================================

function roadCanvas() {
  const S = 256;
  const c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = 'rgb(40,47,60)';
  g.fillRect(0, 0, S, S);

  // Ornières des roues, plus sombres et humides
  for (const cx of [0.28, 0.72]) {
    const gr = g.createLinearGradient((cx - 0.09) * S, 0, (cx + 0.09) * S, 0);
    gr.addColorStop(0, 'rgba(25,26,29,0)');
    gr.addColorStop(0.5, 'rgba(25,26,29,0.55)');
    gr.addColorStop(1, 'rgba(25,26,29,0)');
    g.fillStyle = gr;
    g.fillRect((cx - 0.09) * S, 0, 0.18 * S, S);
  }

  // Neige tassée au centre et en plaques
  for (let i = 0; i < 70; i++) {
    const x = (0.38 + rnd() * 0.24) * S, y = rnd() * S, r = 6 + rnd() * 16;
    for (const dy of [-S, 0, S]) {
      g.fillStyle = `rgba(190,198,204,${0.08 + rnd() * 0.14})`;
      g.beginPath(); g.arc(x, y + dy, r, 0, Math.PI * 2); g.fill();
    }
  }

  // Bords couverts de neige (bord irrégulier, tuilable)
  for (let y = 0; y < S; y += 2) {
    const t = y / S * Math.PI * 2;
    const wl = 22 + 10 * Math.sin(t * 3) + 6 * Math.sin(t * 7 + 1);
    const wr = 22 + 10 * Math.sin(t * 4 + 2) + 6 * Math.sin(t * 9);
    g.fillStyle = 'rgb(150,166,190)';
    g.fillRect(0, y, wl, 2);
    g.fillRect(S - wr, y, wr, 2);
  }

  // Grain d'asphalte
  for (let i = 0; i < 5000; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.07})`;
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }

  // Ligne centrale discontinue, à moitié recouverte de neige
  g.fillStyle = 'rgba(205,195,120,0.30)';
  for (let y = 0; y < S; y += 64) g.fillRect(S / 2 - 2, y + 8, 4, 34);
  return c;
}

const roadCv = roadCanvas();
const roadEmissive = new THREE.Color(0x14181b).multiplyScalar(EM * 0.6);

// L'immeuble (immeuble.js)
const imm = buildImmeuble(scene, kit);
const main = imm.main;


// ==========================================
// 13. ROUTE JUSQU'AU TRAVAIL, DÉCOR, SAPINS ET MAISON
// ==========================================

// Matériaux de la route prolongée (même texture que l'allée devant l'immeuble)
const roadMat2 = new THREE.MeshStandardMaterial({
  map: makeTex(roadCv, 1, 1, true), color: 0xa8b4c8, roughness: 0.85, emissive: roadEmissive,
  polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -40
});
SH.roads.forEach(r => {
  if (r.kind === 'rail') return;                 // la voie ferrée est dessinée par places/bridge.js
  r.geo.computeBoundingSphere();           // sphère exacte : la route n'est plus dessinée quand elle est hors champ
  const m = new THREE.Mesh(r.geo, roadMat2);
  m.renderOrder = 1;                       // dessinée après le terrain
  scene.add(m);
});

// Carrefours : une plaque d'asphalte unie par-dessus les deux routes
const patchMat = new THREE.MeshStandardMaterial({
  color: 0x2c3342, roughness: 0.9, emissive: roadEmissive,
  polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -60
});
if (SH.patches.length) {
  const patchI = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28), patchMat, SH.patches.length);
  const pm = new THREE.Matrix4(), pp = new THREE.Vector3(), ps = new THREE.Vector3();
  const pq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  SH.patches.forEach((p, i) => {
    pp.set(p.x, p.y + 0.012, p.z);
    ps.set(p.r, p.r, 1);
    pm.compose(pp, pq, ps);
    patchI.setMatrixAt(i, pm);
  });
  patchI.instanceMatrix.needsUpdate = true;
  patchI.frustumCulled = false;            // three r128 : le culling d'une instance ne tient pas compte des positions
  scene.add(patchI);
}

// Neige repoussée le long des routes
makeInstanced(lumpGeo, mats.snow, SH.lumps.map(l => item(l.x, l.y, l.z, l.w, l.h, l.d)), scene);

// Balises de bord de route (poteau + réflecteur rouge)
const poleItems = [], reflItems = [];
SH.poles.forEach(p => {
  poleItems.push(item(p.x, p.y + 0.75, p.z, 0.08, 1.5, 0.08));
  reflItems.push(item(p.x, p.y + 1.38, p.z, 0.11, 0.2, 0.11));
});
makeInstanced(unitBox, mats.metal, poleItems, scene);
makeInstanced(unitBox, new THREE.MeshBasicMaterial({ color: disp(0.8, 0.12, 0.08) }), reflItems, scene);

// Lampadaires de route (halo seulement : visibles de loin, sans lumière réelle)
// Même rendu qu'avant, mais en instances : 5 appels de dessin au total, quel que soit le nombre de lampadaires.
if (SH.lamps.length) {
  const N = SH.lamps.length;
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 5.6, 7), mats.metal, N);
  const armI  = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6), mats.metal, N);
  const headI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.14, 0.24), mats.metal, N);
  const bulbI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.06, 0.18), new THREE.MeshBasicMaterial({ color: 0xe7c99e }), N);
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), mm = new THREE.Matrix4(), vv = new THREE.Vector3();
  const glowPos = new Float32Array(N * 3);

  SH.lamps.forEach((l, i) => {
    // Le bras se penche toujours au-dessus de la route, quelle que soit sa direction
    const toX = l.side * l.tz, toZ = -l.side * l.tx;
    base.makeRotationY(Math.atan2(-toZ, toX)).setPosition(l.x, l.y, l.z);
    const put = (mesh, x, y, rotZ) => {
      local.makeRotationZ(rotZ || 0).setPosition(x, y, 0);
      mesh.setMatrixAt(i, mm.multiplyMatrices(base, local));
    };
    put(poleI, 0, 2.8);
    put(armI, 0.5, 5.5, Math.PI / 2);
    put(headI, 1.0, 5.4);
    put(bulbI, 1.0, 5.3);
    vv.set(1.0, 5.2, 0).applyMatrix4(base);
    glowPos[i * 3] = vv.x; glowPos[i * 3 + 1] = vv.y; glowPos[i * 3 + 2] = vv.z;
  });
  [poleI, armI, headI, bulbI].forEach(mesh => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;            // three r128 : le culling d'une instance ne tient pas compte des positions
    scene.add(mesh);
  });

  // Halos : un seul quad orienté vers la caméra, instancié (taille monde 4.6, comme l'ancien sprite)
  const quad = new THREE.PlaneGeometry(1, 1);
  const glowGeo = new THREE.InstancedBufferGeometry();
  glowGeo.index = quad.index;
  glowGeo.setAttribute('position', quad.attributes.position);
  glowGeo.setAttribute('uv', quad.attributes.uv);
  glowGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(glowPos, 3));
  glowGeo.instanceCount = N;
  const glowMesh = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 4.6 }, uColor: { value: new THREE.Color(0xffa860) }, uAlpha: { value: 0.5 } },
    vertexShader: `
      attribute vec3 iPos;
      uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = clamp(1.0 - d, 0.0, 1.0);
        a *= a;
        gl_FragColor = vec4(uColor, a * uAlpha);
        gl_FragColor = linearToOutputTexel(gl_FragColor);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 3;
  scene.add(glowMesh);
}

// Forêt : grands arbres feuillus, buissons et rochers qui bougent avec le vent (forest.js)
const forest = buildForest(scene, SH.forestData, { boost: BOOST, cheapLight: false, chunk: 40, cullTree: 75, cullBush: 45, cullRock: 60 });

// Phares : UNE seule vraie lumière, que le camion ou le taxi prend quand on monte dedans
const headlight = (ctx.driveCamera || ctx.camera) ? new THREE.SpotLight(0xffe6c0, 0, 60, 0.6, 0.5, 1.1) : null;
if (headlight) {
  headlight.userData.keep = true;
  scene.add(headlight);
}

// Lac gelé
const ice = new THREE.Mesh(
  new THREE.CircleGeometry(SH.lake.r * 0.97, 56),
  new THREE.MeshStandardMaterial({
    color: 0x9fb6c4, roughness: 0.28, metalness: 0.15,
    emissive: new THREE.Color(0x10171c).multiplyScalar(EM)
  })
);
ice.rotation.x = -Math.PI / 2;
ice.position.set(SH.lake.x, SH.lake.y, SH.lake.z);
scene.add(ice);

const getFocus = ctx.getFocus || (camera
  ? function () { return { x: camera.position.x, z: camera.position.z }; }
  : function () { return { x: 0, z: -24 }; });

// Maison de travail (work.js), au bout de la route
const workY = SH.terrainH(HOUSE_POS.x, HOUSE_POS.z) + 0.02;
const playerCam = ctx.driveCamera || ctx.camera;
if (playerCam) {
  console.log('[BT] rue construite', { camera: !!playerCam, action: !!ctx.action, view: !!ctx.view, input: !!ctx.input });
  if (!ctx.action) console.warn('[BT] ctx.action est absent : world_base.html est probablement une ANCIENNE version (pas de bouton ENTER/EXIT).');
}
const work = buildWork(scene, {
  x: HOUSE_POS.x, z: HOUSE_POS.z, y: workY, light: ctx.workLight !== false,
  // Intérieur (seulement dans le vrai monde, pas dans la copie de la fenêtre)
  interior: !!playerCam,
  camera: playerCam,
  origin: { x: scene.position.x, y: scene.position.y, z: scene.position.z },
  action: ctx.action, view: ctx.view, snow: ctx.snow,
  onTeleport: function () { walkY = null; if (ctx.onTeleport) ctx.onTeleport(); },
  isBusy: function () { return !!(truck && truck.isDriving()) || !!(taxi && taxi.isRiding()); }
});

// Hauteur du joueur sur les collines (seulement si le monde nous donne la caméra)
let walkY = null;

// Nouveaux lieux : ville de montagne, station-service, pont + gare, ville B, port (dossier places/)
// Construits seulement dans le vrai monde (pas dans la copie vue de la fenêtre).
let truck = null;
let taxi = null;
let bus = null;
let busLine = null;
let policeCar = null;
let policeSvc = null;
let bodies = null;

// Le bus est solide pour le camion et le taxi : 6 petits rectangles qui suivent sa carrosserie (mis à jour à chaque image)
const busRects = [];
for (let i = 0; i < 6; i++) busRects.push({ x0: 1e6, x1: 1e6 + 1, z0: 1e6, z1: 1e6 + 1 });
function syncBusRects() {
  if (!bus || !busLine) return;
  const p = bus.getPose(), fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
  busRects.forEach(function (r, i) {
    const o = (i - 2.5) * 1.93, cx = p.x + fx * o, cz = p.z + fz * o;
    r.x0 = cx - 1.4; r.x1 = cx + 1.4; r.z0 = cz - 1.4; r.z1 = cz + 1.4;
  });
}
let places = null;
if (playerCam) {
  const org0 = { x: scene.position.x, y: scene.position.y, z: scene.position.z };
  const Cj = SH.main.samples.find(p => p.s >= 338);
  places = buildPlaces(scene, {
    X: SH.X,
    camera: playerCam, origin: org0, action: ctx.action,
    crossing: { x: Cj.x, y: Cj.y, z: Cj.z, tx: Cj.tx, tz: Cj.tz, hwA: Cj.hw, hwB: SH.cross.samples[0].hw },
    // train : on réapparaît sur le quai de l'autre gare
    teleport: function (x, z, heading) {
      playerCam.position.x = org0.x + x;
      playerCam.position.z = org0.z + z;
      playerCam.position.y = org0.y + 1.7 + SH.walkHeight(x, z);
      walkY = null;
      if (ctx.view) ctx.view.set(heading, 0);
      if (ctx.onTeleport) ctx.onTeleport();
    }
  });
}
// Collisions : arbres + bâtiments des nouveaux lieux + mer
const collideBase = places
  ? function (x, z, r) { const t = forest.collide(x, z, r); return places.collide(t[0], t[1], r); }
  : forest.collide;
const collideAll = function (x, z, r) {                              // arbres + bâtiments + mer + BUS
  const t = collideBase(x, z, r);
  return (bus && !bus.isInside()) ? bus.collide(t[0], t[1], r, true) : t;
};

// Le camion (un seul véhicule). Créé seulement si le monde nous donne la caméra de conduite.
if (ctx.driveCamera) {
  const org = { x: scene.position.x, y: scene.position.y, z: scene.position.z };
  const truckRects = [{ x0: -12.2, x1: 12.2, z0: -34.4, z1: -24.2 }].concat(work.colliders, places ? places.rects : [], busRects);
  truck = createTruck(scene, {
    x: 3.8, z: -9.5, heading: Math.PI,
    origin: org,
    camera: ctx.driveCamera, input: ctx.input, view: ctx.view, action: ctx.action,
    headlight: headlight,
    groundH: SH.walkHeight,
    collide: collideAll,
    rects: truckRects,
    bounds: { x0: TER.x0 + 30, x1: TER.x1 - 30, z0: TER.z0 + 30, z1: TER.z1 - 30 },
    snow: ctx.snow,
    onExit: function () { walkY = null; if (ctx.onTruckExit) ctx.onTruckExit(); }
  });

  // Le taxi d'Oliver : garé près du camion, fait la navette immeuble <-> maison d'Evelyn (taxi.js)
  taxi = createTaxi(scene, {
    origin: org,
    camera: ctx.driveCamera, view: ctx.view, action: ctx.action,
    renderer: renderer,
    freeDriver: true,                // Oliver est un avatar libre (engine/avatar-body.js), plus collé au taxi
    rideMenu: createRideMenu({ stops: SH.X.stops, getMapData: function () { return mapData(); } }),     // la carte des destinations (npcs/oliver.js)
    onRideRequest: function (stop, finish) { society.onPlayerRide(stop, finish); },   // prévient la société ; le taxi part tout de suite, sans attendre
    headlight: headlight,
    groundH: SH.walkHeight,
    road: SH.main,
    roads: SH.roads,                 // réseau complet : le taxi va où on veut (taxi.js)
    stops: SH.X.stops,               // destinations (aucun nom, seulement des icônes)
    getMapData: function () { return mapData(); },
    rects: truckRects,
    truck: truck,
    snow: ctx.snow,
    onExit: function () { walkY = null; if (ctx.onTruckExit) ctx.onTruckExit(); }
  });

  // Le bus de Violet : ligne 1, un panneau à chaque arrêt, portes automatiques (objects/bus.js + engine/bus-line.js)
  const busNet = createRoadNet(SH.roads, { lane: 2.3 });
  bus = createBus(scene, {
    origin: org,
    camera: ctx.driveCamera, view: ctx.view, snow: ctx.snow,
    canvas: renderer && renderer.domElement,
    groundH: SH.walkHeight,
    net: busNet,
    signals: places && places.signals ? places.signals : null,     // feux rouges (si places/ les expose : voir notes)
    obstacles: function () {                                        // le bus s'arrête devant le camion et le taxi
      const out = [];
      [truck, taxi].forEach(function (v) {
        if (v && v.getPose) { const q = v.getPose(); if (q && q.x != null) out.push({ x: q.x, z: q.z, r: 1.7 }); }
      });
      return out;
    },
    truck: truck, taxi: taxi,
    onExit: function () { walkY = null; }                              // sorti à pied : la hauteur du sol est recalculée
  });
  const siteBus = SH.X.sites;
  busLine = attachBusLine({
    society: society, bus: bus, net: busNet, scene: scene, groundH: SH.walkHeight,
    stops: SH.X.stops,
    sites: { home: { x: 0, z: -29 }, work: WORK_SPOT, town: siteBus.town, gas: siteBus.gas, station: siteBus.station, port: siteBus.port },   // si SH.X.stops n'a pas la bonne forme
    lake: SH.lake
  });
  if (!busLine) bus.group.visible = false;                          // ligne impossible : on ne laisse pas un bus planté à l'origine

  // La voiture de police de Leon (« Police ») : patrouille toute seule, s'arrête aux feux et devant les obstacles
  policeCar = createPoliceCar(scene, {
    origin: org,
    camera: ctx.driveCamera,
    groundH: SH.walkHeight,
    net: busNet,
    signals: places && places.signals ? places.signals : null,
    obstacles: function () {
      const out = [];
      [truck, taxi].forEach(function (v) {
        if (v && v.getPose) { const q = v.getPose(); if (q && q.x != null) out.push({ x: q.x, z: q.z, r: 1.7 }); }
      });
      if (bus && busLine) {                                           // le bus est long : trois points le long de sa carrosserie
        const p = bus.getPose(), fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
        [-4, 0, 4].forEach(function (o2) { out.push({ x: p.x + fx * o2, z: p.z + fz * o2, r: 1.8 }); });
      }
      return out;
    }
  });
  policeSvc = attachPolice({
    society: society, car: policeCar, net: busNet,
    stops: SH.X.stops,
    sites: { home: { x: 0, z: -29 }, work: WORK_SPOT, town: siteBus.town, gas: siteBus.gas, station: siteBus.station, port: siteBus.port, cityB: siteBus.cityB }
  });
  if (!policeSvc) policeCar.group.visible = false;

  // Les corps d'Oliver (taxi), de Violet (bus), de Leon (police) et de Pluie, pilotés par la société des avatars
  society.attachTaxi(taxi);
  const bo = { camera: ctx.driveCamera, groundH: SH.walkHeight, taxi: taxi, bus: bus, police: policeCar };
  const evelynBody = createEvelynBody(scene, Object.assign({}, bo, { society: society, THREE: THREE, loadMixamoAvatar: loadMixamoAvatar }));
  const npcBodies = createNpcBodies(scene, bo);
  bodies = {
    update: function (dt) { evelynBody.update(dt); npcBodies.update(dt); },
    list: function () { return evelynBody.list().concat(npcBodies.list()); }
  };
  window.BadTherapistBodies = bodies;      // réglage / test : BadTherapistBodies.list()
}



// Données de la carte (world_base.html) : routes, lacs, lieux (sans noms), camion
function mapData() {
  const S = SH.X.sites;
  return {
    bounds: { x0: TER.x0, x1: TER.x1, z0: TER.z0, z1: TER.z1 },
    roads: SH.mapRoads,
    lakes: [{ x: SH.lake.x, z: SH.lake.z, r: SH.lake.r }],
    pois: [
      { type: 'work', x: WORK_SPOT.x, z: WORK_SPOT.z },
      { type: 'home', x: 0, z: -29, label: 'HOME' },
      { type: 'town', x: S.town.x, z: S.town.z },
      { type: 'gas', x: S.gas.x - 20, z: S.gas.z - 12 },
      { type: 'train', x: S.station.x, z: S.station.z },
      { type: 'city', x: S.cityB.x, z: S.cityB.z },
      { type: 'port', x: S.port.x, z: S.port.z }
    ],
    sea: { z0: SEA.z0 },
    truck: truck ? truck.getPose() : null,
    bus: bus ? bus.getPose() : null
  };
}

// ==========================================
// 12. UPDATE
// ==========================================

return {

  // Pour bedroom.js : le corps de l'immeuble, ce qu'il faut masquer vu de l'intérieur,
  // la hauteur du sol et les collisions de la maison
  main: main,
  entranceMeshes: imm.entranceMeshes,
  // dans le bus : le plancher du bus ; sinon le terrain + la hauteur du porche / du plancher de la maison d'Evelyn
  walkHeight: function (x, z) { return (bus && bus.isInside()) ? bus.floorY() : SH.walkHeight(x, z) + work.floorRise(x, z); },
  terrainHeight: SH.terrainH,
  colliders: places ? work.colliders.concat(places.rects) : work.colliders,
  workSpot: WORK_SPOT,
  work: work,
  controlsHeight: !!camera,
  collideTrees: collideAll,
  setEntrance: imm.setEntrance,
  truck: truck,
  taxi: taxi,
  bus: bus,
  isDriving: function () { return !!(truck && truck.isDriving()) || !!(taxi && taxi.isRiding()); },     // dans le bus on MARCHE : ce n'est pas « conduire »
  getMapData: function () { return mapData(); },

  update(dt, time) {

    // Maison de travail (fumée, fenêtre qui vacille)
    work.update(dt, time);

    // Nouveaux lieux : portes, feux de circulation, train, lumière des intérieurs
    if (places) places.update(dt, !(truck && truck.isDriving()) && !(taxi && taxi.isRiding()));

    // Forêt (vent) : seuls les blocs proches du joueur sont dessinés
    forest.update(time, getFocus());
    
    // Piloté par bedroom.js (pas de ctx.camera) : le taxi se met à jour ici (le camion est appelé par bedroom.js)
    if (!camera && taxi) taxi.update(dt, true);
    if (!camera && bus) { bus.update(dt, true); syncBusRects(); }

    // Autonome (immeuble.js / work.js) : on suit le relief, on contourne les arbres, on conduit
    if (camera) {
      const riding = !!(taxi && taxi.isRiding());
      if (truck) truck.update(dt, !riding);
      if (taxi) taxi.update(dt, true);
      if (bus) { bus.update(dt, true); syncBusRects(); }
      
      if (!(truck && truck.isDriving()) && !riding && !(bus && bus.isInside())) {
        const tc = collideAll(camera.position.x, camera.position.z, 0.3);
        camera.position.x = tc[0];
        camera.position.z = tc[1];
        const target = 1.7 + SH.walkHeight(camera.position.x, camera.position.z) + work.floorRise(camera.position.x, camera.position.z);
        walkY = walkY === null ? target : walkY + (target - walkY) * Math.min(1, dt * 9);
        camera.position.y = walkY;
        if (ctx.snow) ctx.snow.setBaseY(walkY - 1.7);
      }
    }
   

    // Avatars libres (Oliver, Violet, Pluie, Evelyn)
    if (bodies) bodies.update(dt);

    // Immeuble : fenêtres vivantes et balise rouge (immeuble.js)
    imm.update(dt, time);
  }

};

}
