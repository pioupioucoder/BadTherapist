import * as THREE from 'three';
import { buildWork } from './work.js';
import { buildForest } from './forest.js';
import { createTruck } from '../objects/vehicle.js';
import { createTaxi } from '../taxi.js';
import { SEA } from './layout.js';
import { buildPlaces } from './index.js';
import { createKit } from './common.js';
import { getShared, WORK_SPOT, HOUSE_POS, TER, FAR_Y } from './map.js';
import { buildImmeuble } from './immeuble.js';

// ==========================================
// BAD THERAPIST — LA RUE COMPLÈTE (places/outside.js)
// ==========================================
// Assemble tout l'extérieur : sol enneigé, route, immeuble (immeuble.js), forêt, lac gelé, maison de travail,
// camion, taxi et nouveaux lieux. Hiver figé, nuit de neige, solitude.
// Utilisé par apartment.js (la rue + la vue par la fenêtre) et par work.js.

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
// Il suit la route jusqu'à la maison de travail (voir buildShared).
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
  const m = new THREE.Mesh(r.geo, roadMat2);
  m.frustumCulled = false;
  m.renderOrder = 1;                       // dessinée après le terrain
  scene.add(m);
});

// Carrefours : une plaque d'asphalte unie par-dessus les deux routes
const patchMat = new THREE.MeshStandardMaterial({
  color: 0x2c3342, roughness: 0.9, emissive: roadEmissive,
  polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -60
});
SH.patches.forEach(p => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28), patchMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(p.x, p.y + 0.012, p.z);
  scene.add(m);
});

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
SH.lamps.forEach(l => {
  const g = new THREE.Group();
  g.position.set(l.x, l.y, l.z);
  scene.add(g);
  // Le bras se penche toujours au-dessus de la route, quelle que soit sa direction
  const toX = l.side * l.tz, toZ = -l.side * l.tx;
  g.rotation.y = Math.atan2(-toZ, toX);
  const dir = 1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 5.6, 7), mats.metal);
  pole.position.y = 2.8;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 6), mats.metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(dir * 0.5, 5.5, 0);
  g.add(arm);
  box(g, 0.44, 0.14, 0.24, mats.metal, dir * 1.0, 5.4, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.18), new THREE.MeshBasicMaterial({ color: 0xe7c99e }));
  bulb.position.set(dir * 1.0, 5.3, 0);
  g.add(bulb);
  glowSprite(g, dir * 1.0, 5.2, 0, 0xffa860, 4.6, 0.5);
});

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
const collideAll = places
  ? function (x, z, r) { const t = forest.collide(x, z, r); return places.collide(t[0], t[1], r); }
  : forest.collide;

// Le camion (un seul véhicule). Créé seulement si le monde nous donne la caméra de conduite.
if (ctx.driveCamera) {
  const org = { x: scene.position.x, y: scene.position.y, z: scene.position.z };
  const truckRects = [{ x0: -12.2, x1: 12.2, z0: -34.4, z1: -24.2 }].concat(work.colliders, places ? places.rects : []);
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
    truck: truck ? truck.getPose() : null
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
  walkHeight: SH.walkHeight,
  terrainHeight: SH.terrainH,
  colliders: places ? work.colliders.concat(places.rects) : work.colliders,
  workSpot: WORK_SPOT,
  work: work,
  controlsHeight: !!camera,
  collideTrees: collideAll,
  setEntrance: imm.setEntrance,
  truck: truck,
  taxi: taxi,
  isDriving: function () { return !!(truck && truck.isDriving()) || !!(taxi && taxi.isRiding()); },
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

    // Autonome (immeuble.js / work.js) : on suit le relief, on contourne les arbres, on conduit
    if (camera) {
      const riding = !!(taxi && taxi.isRiding());
      if (truck) truck.update(dt, !riding);
      if (taxi) taxi.update(dt, true);
      
      if (!(truck && truck.isDriving()) && !riding) {
        const tc = collideAll(camera.position.x, camera.position.z, 0.3);
        camera.position.x = tc[0];
        camera.position.z = tc[1];
        const target = 1.7 + SH.walkHeight(camera.position.x, camera.position.z);
        walkY = walkY === null ? target : walkY + (target - walkY) * Math.min(1, dt * 9);
        camera.position.y = walkY;
        if (ctx.snow) ctx.snow.setBaseY(walkY - 1.7);
      }
    }
   

    // Immeuble : fenêtres vivantes et balise rouge (immeuble.js)
    imm.update(dt, time);
  }

};

}
