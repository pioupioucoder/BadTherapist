import * as THREE from 'three';
import { lightPool } from '../lightpool.js';
import { loadMixamoAvatar } from '../avatar-loader.js';
import { buildWorld as buildOutside } from './outside.js';
import { WORK_SPOT } from './map.js';
import { createBookReader } from '../objects/bookreader.js';
import { createTherapistTalk } from '../engine/therapist-ai.js';

// ==========================================
// BAD THERAPIST — LA MAISON DU THÉRAPEUTE (therapist-house.js, ancien work.js)
// ==========================================
// Extérieur seulement (l'intérieur sera un autre fichier .js).
//
// Position : X:645.87 Y:-17.20 Z:507.18 dans le monde de la chambre, c'est-à-dire
// WORK_SPOT (fin de la route, devant la maison) dans immeuble.js.
// La route part de l'immeuble, traverse collines et croisements, et finit ici.
//
// Deux usages :
//   1) dans immeuble.js : buildWork(scene, { x, z, y }) place la maison au bout de la route
//      (donc elle apparaît dans la rue de bedroom.js et dans la vue de la fenêtre) ;
//   2) autonome : world_base.html?world=therapist-house.js -> on démarre devant la maison.


// ==========================================
// INTÉRIEUR : cabinet du thérapeute (chargé au clic sur la porte)
// ==========================================
// L'avatar d'Evelyn (Mixamo) : avatars/evelyn/ à côté de world_base.html : evelyn.fbx, idle.fbx, sit.fbx, sit_talk.fbx + les 4 textures.
const AVATAR_DIR = 'avatars/evelyn/';

// Réglages de l'avatar (à ajuster si elle n'est pas bien assise sur la chaise)
const AVATAR_HEIGHT = 1.7;                       // taille debout, en mètres
const AVATAR_OFFSET = { x: 0, y: 0, z: 0 };      // décalage par rapport au centre de sa chaise
const AVATAR_YAW = 0;                            // 0 = elle regarde vers la porte (vers le joueur)

// Livres de l'étagère : json/livredetherapeute/book01.json ... book20.json
// (voir bookreader.js pour le format : titre, couverture au choix, pages)
const BOOK_DIR = 'json/livredetherapeute/';
const BOOK_COUNT = 20;

// La pièce est construite très loin de la rue (x = 1200 dans le repère de la rue)
// et on s'y téléporte : aucun risque de voir l'intérieur depuis l'extérieur.
export const INTERIOR_X = 1200;

function createInterior(parent, o) {

  const camera = o.camera;
  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const canvas = o.canvas || (o.renderer && o.renderer.domElement) || document.getElementById('gc');
  const extDoor = o.door;                         // porte de la façade : { setOpen, amount, meshes }
  const RX = INTERIOR_X, RW = 7, RD = 6, RH = 3.1;
  const CHAIR = { x: RX, z: -2.15 };              // fauteuil de la thérapeute (dos au mur du fond)
  const SEAT = { x: RX, z: 0.15 };                // chaise du joueur (face à la thérapeute)

  const room = new THREE.Group();
  parent.add(room);

  function mat(c, r, e) {
    return new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.95 : r, emissive: e === undefined ? 0x0e0a07 : e });
  }
  function box(w, h, d, m, x, y, z, par) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    (par || room).add(b);
    return b;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Murs / sol / plafond
  const shell = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, RD), new THREE.MeshStandardMaterial({ color: 0x7d6a58, roughness: 1, emissive: 0x16100b, side: THREE.BackSide }));
  shell.position.set(RX, RH / 2, 0);
  room.add(shell);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW - 0.02, RD - 0.02), mat(0x5a4230, 0.85, 0x120c08));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(RX, 0.01, 0);
  room.add(floor);
  box(RW, 0.12, 0.05, mat(0x2e231b), RX, 0.06, -RD / 2 + 0.03);
  box(RW, 0.12, 0.05, mat(0x2e231b), RX, 0.06, RD / 2 - 0.03);
  box(0.05, 0.12, RD, mat(0x2e231b), RX - RW / 2 + 0.03, 0.06, 0);
  box(0.05, 0.12, RD, mat(0x2e231b), RX + RW / 2 - 0.03, 0.06, 0);

  // Tapis
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.8), mat(0x5b2a2a, 1, 0x140808));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RX, 0.025, -0.6);
  room.add(rug);

  // Fenêtre (nuit, neige)
  const winMat = new THREE.MeshBasicMaterial({ color: 0x1d2a38 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), winMat);
  win.position.set(RX + 1.9, 1.7, -RD / 2 + 0.03);
  room.add(win);
  const fm = mat(0x2a1f18);
  box(1.56, 0.08, 0.08, fm, RX + 1.9, 2.29, -RD / 2 + 0.05);
  box(1.56, 0.08, 0.08, fm, RX + 1.9, 1.11, -RD / 2 + 0.05);
  box(0.08, 1.2, 0.08, fm, RX + 1.12, 1.7, -RD / 2 + 0.05);
  box(0.08, 1.2, 0.08, fm, RX + 2.68, 1.7, -RD / 2 + 0.05);
  box(0.05, 1.1, 0.05, fm, RX + 1.9, 1.7, -RD / 2 + 0.05);

  // ------------------------------------------
  // Sièges : un fauteuil pour la thérapeute, une chaise pour le joueur
  // ------------------------------------------
  const leather = mat(0x3a2a22, 0.7);
  const woodDark = mat(0x1c1410);

  function makeArmchair(x, z, yaw) {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = yaw;
    room.add(c);
    box(0.62, 0.09, 0.6, leather, 0, 0.45, 0, c);                 // assise
    box(0.62, 0.7, 0.09, leather, 0, 0.82, -0.28, c);             // dossier
    box(0.08, 0.06, 0.55, leather, -0.36, 0.68, 0, c);            // accoudoirs
    box(0.08, 0.06, 0.55, leather, 0.36, 0.68, 0, c);
    [[-0.36, 0.1], [0.36, 0.1]].forEach(function (p) { box(0.07, 0.24, 0.07, leather, p[0], 0.56, p[1], c); });
    [[-0.27, -0.25], [0.27, -0.25], [-0.27, 0.25], [0.27, 0.25]].forEach(function (p) {
      box(0.06, 0.42, 0.06, woodDark, p[0], 0.21, p[1], c);
    });
    return c;
  }
  makeArmchair(CHAIR.x, CHAIR.z, 0);

  // Chaise du joueur (face à -z, donc vers la thérapeute) : clic = s'asseoir
  const seatChair = new THREE.Group();
  seatChair.position.set(SEAT.x, 0, SEAT.z);
  seatChair.rotation.y = Math.PI;
  seatChair.userData.kind = 'seat';
  room.add(seatChair);
  const mSeat = mat(0x4a3322, 0.8);
  box(0.5, 0.06, 0.48, mSeat, 0, 0.45, 0, seatChair);
  box(0.5, 0.5, 0.05, mSeat, 0, 0.74, -0.215, seatChair);
  [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(function (p) {
    box(0.05, 0.43, 0.05, woodDark, p[0], 0.215, p[1], seatChair);
  });
  const seatHit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshBasicMaterial());
  seatHit.visible = false;
  seatHit.position.set(0, 0.55, 0);
  seatChair.add(seatHit);

  // ------------------------------------------
  // Table, bien devant la thérapeute
  // ------------------------------------------
  const TABLE = { x: RX, z: -1.15, w: 1.6, d: 0.9 };
  const mTable = mat(0x6a4a30, 0.8);
  box(TABLE.w, 0.05, TABLE.d, mTable, TABLE.x, 0.75, TABLE.z);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
    box(0.06, 0.73, 0.06, woodDark, TABLE.x + s[0] * (TABLE.w / 2 - 0.07), 0.365, TABLE.z + s[1] * (TABLE.d / 2 - 0.07));
  });
  box(TABLE.w - 0.14, 0.08, 0.03, mTable, TABLE.x, 0.68, TABLE.z - TABLE.d / 2 + 0.07);   // traverse
  // Sur la table : un carnet, un stylo, une tasse, une petite lampe
  box(0.26, 0.015, 0.34, mat(0xd9cdb0, 1, 0x1a1610), TABLE.x - 0.35, 0.785, TABLE.z + 0.05).rotation.y = 0.2;
  box(0.14, 0.01, 0.012, mat(0x111111), TABLE.x - 0.2, 0.797, TABLE.z + 0.05).rotation.y = 0.5;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10), mat(0xcfc7b8, 0.6, 0x14120e));
  cup.position.set(TABLE.x + 0.45, 0.82, TABLE.z - 0.1);
  room.add(cup);
  box(0.12, 0.02, 0.12, woodDark, TABLE.x + 0.62, 0.785, TABLE.z + 0.15);
  box(0.02, 0.28, 0.02, woodDark, TABLE.x + 0.62, 0.93, TABLE.z + 0.15);
  const deskShade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.14, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide }));
  deskShade.position.set(TABLE.x + 0.62, 1.12, TABLE.z + 0.15);
  room.add(deskShade);

  // ------------------------------------------
  // Étagère de livres (mur gauche) : cadre + planches + livres cliquables
  // ------------------------------------------
  const SH_X0 = RX - RW / 2;              // mur
  const SH_Z0 = -1.7, SH_Z1 = 0.9;        // étendue de l'étagère le long du mur
  const SH_D = 0.34;                      // profondeur
  const ROW_H = 0.55, ROW_Y0 = 0.08;
  const mShelf = mat(0x3d2c20);
  box(0.03, 2.34, SH_Z1 - SH_Z0, mShelf, SH_X0 + 0.02, 1.17, (SH_Z0 + SH_Z1) / 2);                  // fond
  box(SH_D, 2.34, 0.04, mShelf, SH_X0 + SH_D / 2, 1.17, SH_Z0 + 0.02);                                // côtés
  box(SH_D, 2.34, 0.04, mShelf, SH_X0 + SH_D / 2, 1.17, SH_Z1 - 0.02);
  for (let r = 0; r <= 4; r++) {
    box(SH_D, 0.04, SH_Z1 - SH_Z0, mShelf, SH_X0 + SH_D / 2, ROW_Y0 + r * ROW_H, (SH_Z0 + SH_Z1) / 2);   // planches
  }

  const rndSeed = (function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(77031);

  function spineTexture(color, accent) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, 32, 128);
    x.fillStyle = accent;
    x.fillRect(0, 10, 32, 3);
    x.fillRect(0, 17, 32, 1);
    x.fillRect(0, 110, 32, 1);
    x.fillRect(0, 115, 32, 3);
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, 0, 4, 128);
    x.fillRect(28, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  const pagesMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 1, emissive: 0x000000 });

  // Un livre debout : dos (+x) tourné vers la pièce. Matériaux : [+x dos, -x, +y, -y, +z, -z]
  function makeBook(thick, h, color, accent) {
    const cover = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, emissive: 0x000000 });
    const spine = new THREE.MeshStandardMaterial({ map: spineTexture(color, accent), roughness: 0.8, emissive: 0x000000 });
    const top = pagesMat.clone();
    const mats = [spine, cover, top, top, cover, cover];
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, thick), mats);
    m.userData.mats = mats;
    return m;
  }

  const DECOR_COLS = ['#5e2323', '#27415c', '#39503a', '#7a5d27', '#4d3359', '#5a3d30', '#2f2f36', '#6b4a33'];
  const slots = [];        // les 20 livres lisibles : { mesh, data, glow }
  for (let r = 0; r < 4; r++) {
    const y0 = ROW_Y0 + r * ROW_H + 0.02;
    const zStart = SH_Z0 + 0.08, zEnd = SH_Z1 - 0.08;
    const span = zEnd - zStart;
    const targets = [0.08, 0.28, 0.48, 0.68, 0.88].map(function (f) { return zStart + span * f; });
    let z = zStart, t = 0;
    while (z < zEnd - 0.04) {
      let isSlot = false, thick, h;
      if (t < targets.length && z >= targets[t]) {
        isSlot = true; thick = 0.085; h = 0.42;
      } else {
        thick = 0.045 + rndSeed() * 0.055; h = 0.28 + rndSeed() * 0.14;
      }
      if (z + thick > zEnd) break;
      const col = isSlot ? '#3a3a3e' : DECOR_COLS[Math.floor(rndSeed() * DECOR_COLS.length)];
      const b = makeBook(thick, h, col, isSlot ? '#8a8a8a' : '#a08a52');
      b.position.set(SH_X0 + 0.04 + 0.11 + (isSlot ? 0.02 : 0), y0 + h / 2, z + thick / 2);
      room.add(b);
      if (isSlot) {
        b.userData.kind = 'book';
        b.userData.idx = r * 5 + t;
        slots[r * 5 + t] = { mesh: b, data: null, glow: 0, baseY: b.position.y };
        t++;
      }
      z += thick + 0.004;
    }
  }

  // Chargement des livres (json/livredetherapeute/bookNN.json) : couverture = couleur du dos
  let booksPromise = null;
  function loadBooks() {
    if (booksPromise) return booksPromise;
    const jobs = [];
    for (let i = 0; i < BOOK_COUNT; i++) {
      const name = BOOK_DIR + 'book' + (i < 9 ? '0' : '') + (i + 1) + '.json';
      jobs.push(fetch(name).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
    }
    booksPromise = Promise.all(jobs).then(function (list) {
      list.forEach(function (d, i) {
        const s = slots[i];
        if (!s || !d || !Array.isArray(d.pages)) return;
        const c = d.cover || {};
        const color = c.color || '#7c2431', accent = c.accent || '#d6ae5c';
        const mats = s.mesh.userData.mats;
        mats[0].map = spineTexture(color, accent);
        mats[0].needsUpdate = true;
        mats[1].color.set(color);
        mats[4].color.set(color);
        s.data = d;
      });
    });
    return booksPromise;
  }

  // ------------------------------------------
  // Table d'appoint + lampe
  // ------------------------------------------
  box(0.5, 0.55, 0.5, mat(0x3d2c20), RX + 2.7, 0.28, -2.3);
  box(0.06, 0.3, 0.06, woodDark, RX + 2.7, 0.7, -2.3);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.26, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide }));
  shade.position.set(RX + 2.7, 0.98, -2.3);
  room.add(shade);

  // ------------------------------------------
  // Porte intérieure (mur de la porte, +z) : battant pivotant, cliquable
  // ------------------------------------------
  const IDOOR = { x: RX - 2.2, w: 1.2, h: 2.3 };
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(IDOOR.w, IDOOR.h), new THREE.MeshBasicMaterial({ color: 0x1d2a38, side: THREE.DoubleSide }));
  doorway.position.set(IDOOR.x, IDOOR.h / 2, RD / 2 - 0.012);
  room.add(doorway);
  const innerPivot = new THREE.Group();
  innerPivot.position.set(IDOOR.x - IDOOR.w / 2, IDOOR.h / 2, RD / 2 - 0.05);
  innerPivot.userData.kind = 'exit';
  room.add(innerPivot);
  box(IDOOR.w, IDOOR.h, 0.08, mat(0x3b2417), IDOOR.w / 2, 0, 0, innerPivot);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xb08a3a, 0.4));
  knob.position.set(IDOOR.w - 0.12, -0.1, -0.07);
  innerPivot.add(knob);
  const innerHit = new THREE.Mesh(new THREE.BoxGeometry(IDOOR.w, IDOOR.h, 0.3), new THREE.MeshBasicMaterial());
  innerHit.visible = false;
  innerHit.position.set(IDOOR.w / 2, 0, -0.1);
  innerPivot.add(innerHit);
  let innerT = 0, innerGoal = 0;

  // Zone de clic sur la thérapeute (même avant que le modèle 3D soit chargé)
  const therapistHit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.8), new THREE.MeshBasicMaterial());
  therapistHit.visible = false;
  therapistHit.position.set(CHAIR.x, 0.95, CHAIR.z);
  therapistHit.userData.kind = 'therapist';
  room.add(therapistHit);

  // Lumières (userData.keep : bedroom.js ne les supprime pas)
  const l1 = new THREE.PointLight(0xffd6a0, 1.25, 14);
  l1.position.set(RX, 2.6, 0.2);
  l1.userData.keep = true;
  room.add(l1);
  const l2 = new THREE.PointLight(0xffc880, 0.6, 7);
  l2.position.set(RX + 2.7, 1.1, -2.3);
  l2.userData.keep = true;
  room.add(l2);
  const l3 = new THREE.PointLight(0xffe0b0, 0.45, 4);
  l3.position.set(RX + 0.62, 1.2, TABLE.z + 0.15);
  l3.userData.keep = true;
  room.add(l3);

  // Pas de neige qui tombe dans la pièce
  if (o.snow && o.snow.excludeBox) {
    o.snow.excludeBox(origin.x + RX - RW / 2 - 0.3, origin.y - 1, origin.z - RD / 2 - 0.3,
      origin.x + RX + RW / 2 + 0.3, origin.y + RH + 1, origin.z + RD / 2 + 0.3);
  }

  // ------------------------------------------
  // Écran de chargement (texte + barre seulement) et fondu noir
  // ------------------------------------------
  function ensureFont() {
    if (document.getElementById('bt-pixel-font')) return;
    const l = document.createElement('link');
    l.id = 'bt-pixel-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(l);
  }

  let overlay = null, barEl = null, dotsTimer = null, curtain = null;

  function ensureOverlay() {
    if (overlay) return;
    ensureFont();
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#050505;display:none;flex-direction:column;' +
      'align-items:center;justify-content:center;opacity:0;transition:opacity .45s ease;color:#e8e8e8;text-align:center;' +
      'padding:24px;font-family:"Press Start 2P",monospace;';
    overlay.innerHTML =
      '<div class="t" style="font-size:clamp(11px,2.6vw,20px);line-height:2.1;">Loading for the therapy session<span class="d"></span></div>' +
      '<div style="width:min(360px,70vw);height:12px;border:2px solid #666;margin-top:30px;padding:2px;">' +
      '<div class="b" style="height:100%;width:0%;background:#ddd;transition:width .25s ease;"></div></div>';
    document.body.appendChild(overlay);
    barEl = overlay.querySelector('.b');

    curtain = document.createElement('div');
    curtain.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#000;opacity:0;pointer-events:none;transition:opacity .28s ease;';
    document.body.appendChild(curtain);
  }

  function showOverlay() {
    ensureOverlay();
    barEl.style.width = '0%';
    overlay.style.display = 'flex';
    const d = overlay.querySelector('.d');
    let n = 0;
    dotsTimer = setInterval(function () { n = (n + 1) % 4; d.textContent = '...'.slice(0, n); }, 350);
    requestAnimationFrame(function () { overlay.style.opacity = '1'; });
    return sleep(480);
  }

  function hideOverlay() {
    overlay.style.opacity = '0';
    return sleep(480).then(function () {
      overlay.style.display = 'none';
      clearInterval(dotsTimer);
    });
  }

  let lastProgress = 0;
  function setProgress(p) {
    lastProgress = p;
    if (barEl) barEl.style.width = Math.max(0, Math.min(100, p * 100)) + '%';
  }

  function fadeBlack(on) {
    ensureOverlay();
    curtain.style.opacity = on ? '1' : '0';
    return sleep(300);
  }

  // ------------------------------------------
  // Avatar (GLB + animation assise)
  // ------------------------------------------
  let avatar = null, mixer = null, evAvatar = null;

  // Une seule promesse partagée : le préchargement et le clic sur la porte utilisent le même chargement
  let avatarPromise = null;
  function ensureAvatar() {
    if (!avatarPromise) {
      avatarPromise = loadAvatar().catch(function (e) { avatarPromise = null; throw e; });
    }
    return avatarPromise;
  }

  async function loadAvatar() {
    if (avatar) return;
    const d = AVATAR_DIR;
    const ev = await loadMixamoAvatar({
      model: d + 'evelyn.fbx',
      textures: {
        map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png',
        roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png'
      },
      animations: { idle: d + 'idle.fbx', sit: d + 'sit.fbx', sit_talk: d + 'sit_talk.fbx' },
      height: AVATAR_HEIGHT,                                   // taille debout : l'échelle se règle toute seule
      onProgress: function (f) { setProgress(f * 0.95); }
    });
    evAvatar = ev;
    mixer = ev.mixer;                                          // la boucle du jeu fait déjà mixer.update(dt)
    console.log('[avatar] animations :', Object.keys(ev.actions));

    avatar = new THREE.Group();
    avatar.add(ev.root);
    avatar.position.set(CHAIR.x + AVATAR_OFFSET.x, AVATAR_OFFSET.y, CHAIR.z + AVATAR_OFFSET.z);
    avatar.rotation.y = AVATAR_YAW;
    avatar.userData.kind = 'therapist';
    room.add(avatar);
    window.BadTherapistAvatar = { ev: ev, group: avatar, actions: ev.actions, play: ev.play };   // pour régler à la main dans la console (F12)

    ev.play(ev.actions.sit ? 'sit' : (ev.actions.idle ? 'idle' : 'default'));
    setProgress(1);
  }

  // Avatar + livres : tout ce qu'il faut avant d'entrer
  let booksReady = false;
  function ensureAll() {
    return Promise.all([
      ensureAvatar().catch(function (e) { console.error('[avatar] impossible de charger', e); }),
      loadBooks().then(function () { booksReady = true; })
    ]);
  }

  // ------------------------------------------
  // Lecteur de livres + dialogue avec la thérapeute
  // ------------------------------------------
  const reader = createBookReader();
  const openedBooks = [];                                    // livres de l'étagère que le joueur a ouverts
  const BUBBLE_Y = 1.65;                                     // hauteur de la bulle au-dessus de sa tête (monte-la si elle chevauche son visage)
  const bubbleV = new THREE.Vector3();
  const talk = createTherapistTalk({
    // Pendant qu'elle parle : animation « sit_talk » ; sinon « sit »
    onSpeak: function (on) { if (evAvatar && evAvatar.actions.sit_talk) evAvatar.play(on ? 'sit_talk' : 'sit'); },
    // Ce qu'Evelyn sait de l'instant présent (ajouté à son prompt)
    getWorld: function () {
      return [
        seated ? 'La personne est assise en face de toi.' : 'La personne est debout près de toi.',
        openedBooks.length ? 'Livres que la personne a ouverts pendant cette visite : ' + openedBooks.join(' ; ') + '.' : ''
      ];
    }
  });

  // ------------------------------------------
  // Entrer / sortir (clic sur la porte)
  // ------------------------------------------
  let inside = false, busy = false, shown = false, seated = false;

  // Evelyn est-elle chez elle ? (elle peut sortir : society.js / avatar-body.js). Sans société chargée : toujours là.
  function evelynHome() {
    try {
      const s = window.BadTherapistSociety, a = s && s.registry && s.registry.actor('evelyn');
      return !a || a.loc === 'therapist_house';
    } catch (e) { return true; }
  }

  function teleport(lx, lz, yaw) {
    camera.position.x = origin.x + lx;
    camera.position.z = origin.z + lz;
    camera.position.y = origin.y + 1.7;
    if (o.view) o.view.set(yaw, 0);
    if (o.onTeleport) o.onTeleport();
  }

  function showAct(label, fn) { if (o.action) { o.action.show(label, fn); shown = true; } }
  function hideAct() { if (o.action && shown) { o.action.hide(); shown = false; } }

  function waitFor(cond, maxMs) {
    return new Promise(function (resolve) {
      const t0 = performance.now();
      (function poll() {
        if (cond() || performance.now() - t0 > maxMs) resolve();
        else setTimeout(poll, 40);
      })();
    });
  }

  async function enterHouse() {
    if (busy || inside) return;
    busy = true;
    hideAct();
    extDoor.setOpen(true);                                   // la porte s'ouvre...
    await waitFor(function () { return extDoor.amount() > 0.97; }, 1600);
    const ready = !!avatar && booksReady;
    if (!ready) {                                            // ...et c'est là que le chargement s'affiche
      const t0 = performance.now();
      await showOverlay();
      setProgress(lastProgress);
      await ensureAll();
      const rest = 1400 - (performance.now() - t0);
      if (rest > 0) await sleep(rest);
      setProgress(1);
    } else {
      await fadeBlack(true);
    }
    teleport(RX, RD / 2 - 0.9, 0);
    inside = true;
    innerGoal = 0;
    extDoor.setOpen(false);
    busy = false;
    if (!ready) await hideOverlay(); else await fadeBlack(false);
    if (evelynHome()) talk.greetStanding();                  // bulle : « asseyez-vous » (seulement si elle est là)
  }

  async function leaveHouse() {
    if (!inside || busy) return;
    busy = true;
    talk.hideBubble(true);
    if (seated) standUp(true);
    else if (talk.isOpen()) talk.endSession();               // conversation commencée debout : elle se termine aussi
    innerGoal = 1;                                           // la porte intérieure s'ouvre
    await waitFor(function () { return innerT > 0.97; }, 1600);
    await fadeBlack(true);
    inside = false;
    teleport(o.exitX, o.exitZ, 0);
    extDoor.setOpen(true);
    innerGoal = 0;
    await fadeBlack(false);
    setTimeout(function () { if (!inside) extDoor.setOpen(false); }, 1500);
    busy = false;
  }

  // ------------------------------------------
  // S'asseoir / se lever
  // ------------------------------------------
  function sitDown() {
    if (seated) return;
    if (!evelynHome()) return;                               // pas de séance si elle est sortie
    seated = true;
    camera.position.x = origin.x + SEAT.x;
    camera.position.z = origin.z + SEAT.z - 0.02;
    camera.position.y = origin.y + 1.2;
    if (o.view) o.view.set(0, -0.06);
    showAct('STAND UP', function () { standUp(); });
    talk.hideBubble(true);
    // La séance commence : Evelyn ouvre la discussion
    setTimeout(function () {
      if (seated && inside && !talk.isOpen() && !reader.isOpen()) talk.open();
    }, 900);
  }

  function standUp(silent) {
    if (!seated) return;
    seated = false;
    hideAct();
    camera.position.x = origin.x + SEAT.x + 0.85;
    camera.position.z = origin.z + SEAT.z;
    camera.position.y = origin.y + 1.7;
    talk.endSession();                                       // ferme la boîte et Evelyn fait son bilan (mémoire)
    if (!silent) talk.farewell();
  }

  // ------------------------------------------
  // Clic / survol (souris et doigt)
  // ------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverBook = -1;
  const DOOR = { x: o.doorX, z: o.doorZ };

  function ray(ev) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return true;
  }

  function pick(ev) {
    if (busy || reader.isOpen() || talk.isOpen() || !ray(ev)) return null;
    raycaster.far = 7;

    if (!inside) {
      // Dehors : seulement la porte de la maison, de près
      if (o.isBusy && o.isBusy()) return null;
      const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
      if (Math.hypot(px - DOOR.x, pz - DOOR.z) > 6) return null;
      const hits = raycaster.intersectObjects(extDoor.meshes, false);
      return hits.length ? { kind: 'enter' } : null;
    }

    const hits = raycaster.intersectObject(room, true);
    for (let i = 0; i < hits.length; i++) {
      let obj = hits[i].object;
      if (obj === shell) continue;
      while (obj && !obj.userData.kind) obj = obj.parent;
      if (!obj) return null;                    // quelque chose de plein est devant : rien à cliquer
      const kind = obj.userData.kind;
      if (kind === 'book') {
        const s = slots[obj.userData.idx];
        return s && s.data ? { kind: 'book', idx: obj.userData.idx } : null;
      }
      return { kind: kind };
    }
    return null;
  }

  canvas.addEventListener('mousemove', function (ev) {
    const p = pick(ev);
    hoverBook = p && p.kind === 'book' ? p.idx : -1;
    if (p) canvas.style.cursor = 'pointer';
  });
  canvas.addEventListener('mouseleave', function () { hoverBook = -1; });

  // On ignore le clic qui termine un glissé (regard autour de soi)
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', function (ev) { downX = ev.clientX; downY = ev.clientY; });

  canvas.addEventListener('click', function (ev) {
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
    const p = pick(ev);
    if (!p) return;
    if (p.kind === 'enter') enterHouse();
    else if (p.kind === 'exit') leaveHouse();
    else if (p.kind === 'seat') { if (seated) standUp(); else sitDown(); }
    else if (p.kind === 'therapist') { hoverBook = -1; talk.hideBubble(true); talk.open(); }      // on peut lui parler assis ou debout
    else if (p.kind === 'book') {
      hoverBook = -1;
      const bd = slots[p.idx].data;
      const bt = bd && (bd.title || bd.titre);
      if (bt && openedBooks.indexOf(String(bt)) === -1) openedBooks.push(String(bt).slice(0, 60));
      reader.open(bd);
    }
  });

  // ------------------------------------------
  // Mouvement dans la pièce : murs et meubles
  // ------------------------------------------
  const OBST = [
    { x0: TABLE.x - TABLE.w / 2, x1: TABLE.x + TABLE.w / 2, z0: TABLE.z - TABLE.d / 2, z1: TABLE.z + TABLE.d / 2 },
    { x0: CHAIR.x - 0.4, x1: CHAIR.x + 0.4, z0: CHAIR.z - 0.4, z1: CHAIR.z + 0.4 },
    { x0: SEAT.x - 0.32, x1: SEAT.x + 0.32, z0: SEAT.z - 0.32, z1: SEAT.z + 0.32 },
    { x0: RX + 2.45, x1: RX + 2.95, z0: -2.6, z1: -2.0 },
    { x0: SH_X0 - 0.2, x1: SH_X0 + SH_D, z0: SH_Z0, z1: SH_Z1 }
  ];
  const PR = 0.3;

  function pushOut(x, z) {
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < OBST.length; i++) {
        const c = OBST[i];
        const cx = Math.max(c.x0, Math.min(c.x1, x)), cz = Math.max(c.z0, Math.min(c.z1, z));
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= PR * PR) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x += dx / d * (PR - d);
          z += dz / d * (PR - d);
        } else {
          const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z;
          const m = Math.min(l, rr, t, b);
          if (m === l) x = c.x0 - PR; else if (m === rr) x = c.x1 + PR; else if (m === t) z = c.z0 - PR; else z = c.z1 + PR;
        }
      }
    }
    return [x, z];
  }

  let streetTime = 0;
  console.log('[BT] intérieur créé. Porte (repère rue) :', DOOR);

  // Écran de chargement (loader.js) : on prépare tout de suite la maison (Evelyn + livres) derrière l'écran,
  // au lieu de le faire en plein jeu (c'est ce qui figeait l'image une ou deux secondes).
  if (window.BTLoad && window.BTLoad.active()) {
    window.BTLoad.hold('house');
    setTimeout(function () {
      ensureAll().catch(function () { }).then(function () {
        console.log('[BT] maison prête : entrée instantanée');
        window.BTLoad.release('house');
      });
    }, 30);
  }

  return {
    isInside: function () { return inside || busy; },
    update: function (dt, time) {

      // Porte intérieure qui s'ouvre / se ferme
      if (innerT < innerGoal) innerT = Math.min(innerGoal, innerT + dt / 0.7);
      else if (innerT > innerGoal) innerT = Math.max(innerGoal, innerT - dt / 0.7);
      const ie = innerT * innerT * (3 - 2 * innerT);
      innerPivot.rotation.y = 1.45 * ie;

      if (inside) {
        if (avatar) avatar.visible = evelynHome();                 // absente : sa chaise est vide
        if (mixer) mixer.update(dt);

        // Livres : brillent quand on les survole
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (!s || !s.data) continue;
          const target = (hoverBook === i) ? 0.55 : 0;
          s.glow += (target - s.glow) * Math.min(1, dt * 10);
          const ms = s.mesh.userData.mats;
          ms[0].emissive.setRGB(s.glow, s.glow * 0.78, s.glow * 0.4);
          ms[1].emissive.copy(ms[0].emissive);
          ms[4].emissive.copy(ms[0].emissive);
        }

        // Bulle d'Evelyn : au-dessus de sa tête, seulement quand on est debout et qu'on ne lit pas
        if (!seated && !talk.isOpen() && !reader.isOpen()) {
          bubbleV.set(origin.x + CHAIR.x, origin.y + BUBBLE_Y, origin.z + CHAIR.z).project(camera);
          const cr = canvas.getBoundingClientRect();
          talk.updateBubble(
            cr.left + (bubbleV.x * 0.5 + 0.5) * cr.width,
            cr.top + (-bubbleV.y * 0.5 + 0.5) * cr.height,
            bubbleV.z < 1 && Math.abs(bubbleV.x) < 1.1 && bubbleV.y > -1.1 && bubbleV.y < 1.2
          );
        } else {
          talk.updateBubble(0, 0, false);
        }

        if (seated) {
          // Assis : on ne bouge plus, on regarde autour de soi
          camera.position.x = origin.x + SEAT.x;
          camera.position.z = origin.z + SEAT.z - 0.02;
          camera.position.y = origin.y + 1.2;
          return;
        }

        // On reste dans la pièce et on contourne les meubles
        let x = camera.position.x - origin.x, z = camera.position.z - origin.z;
        x = Math.max(RX - RW / 2 + 0.45, Math.min(RX + RW / 2 - 0.45, x));
        z = Math.max(-RD / 2 + 0.45, Math.min(RD / 2 - 0.45, z));
        const t = pushOut(x, z);
        camera.position.x = origin.x + t[0];
        camera.position.z = origin.z + t[1];
        return;
      }
      if (busy) return;

      const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
      const dd = Math.hypot(px - DOOR.x, pz - DOOR.z);

      // Préchargement : dès qu'on est dehors depuis quelques secondes, ou à moins de 250 m de la maison
      if (!avatarPromise && px > -300 && px < 1000) {
        streetTime += dt;
        if (streetTime > 6 || dd < 250) {
          console.log('[BT] préchargement de la maison en arrière-plan...');
          ensureAll().then(function () { console.log('[BT] maison prête : entrée instantanée'); });
        }
      }
    }
  };
}

export function buildWork(parent, opts) {

  opts = opts || {};

  const hx = opts.x || 0;
  const hz = opts.z || 0;
  const gy = opts.y || 0;

  // Dimensions (local : +z = façade avec la porte)
  const W = 9;          // largeur (x)
  const D = 7;          // profondeur (z)
  const WALL_H = 3.1;   // hauteur des murs
  const RISE = 1.9;     // hauteur du toit au-dessus des murs
  const F = 0.5;        // fondation (le plancher est à cette hauteur)

  // Le groupe est tourné de 180° : la façade regarde vers -z (vers la route qui arrive)
  const g = new THREE.Group();
  g.position.set(hx, gy, hz);
  g.rotation.y = Math.PI;
  parent.add(g);

  const rnd = (function(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(20261104);

  // Couleur "comme à l'écran" (three r128 : MeshBasic en linéaire)
  const disp = function(r, gr, b) {
    return new THREE.Color(Math.pow(r, 2.2), Math.pow(gr, 2.2), Math.pow(b, 2.2));
  };

  // ==========================================
  // TEXTURES
  // ==========================================

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Bardage en planches horizontales
  const sidingCv = canvas(128, 128);
  (function() {
    const c = sidingCv.getContext('2d');
    c.fillStyle = '#5d4b3d';
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      const v = (rnd() - 0.5) * 18;
      c.fillStyle = 'rgb(' + (93 + v | 0) + ',' + (75 + v | 0) + ',' + (61 + v | 0) + ')';
      c.fillRect(0, y, 128, 15);
      c.fillStyle = 'rgba(15,10,6,0.55)';
      c.fillRect(0, y + 15, 128, 1);
    }
    for (let i = 0; i < 700; i++) {
      c.fillStyle = 'rgba(0,0,0,' + (0.04 + rnd() * 0.06) + ')';
      c.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 6, 1);
    }
  })();
  const sidingTex = new THREE.CanvasTexture(sidingCv);
  sidingTex.wrapS = sidingTex.wrapT = THREE.RepeatWrapping;
  sidingTex.repeat.set(3, 2.2);
  sidingTex.encoding = THREE.sRGBEncoding;

  // Halo doux
  const glowCv = canvas(128, 128);
  (function() {
    const c = glowCv.getContext('2d');
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.10)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  })();
  const glowTex = new THREE.CanvasTexture(glowCv);

  // Bouffée de fumée
  const puffCv = canvas(64, 64);
  (function() {
    const c = puffCv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(190,195,200,0.9)');
    gr.addColorStop(0.5, 'rgba(160,166,172,0.35)');
    gr.addColorStop(1, 'rgba(150,156,162,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  })();
  const puffTex = new THREE.CanvasTexture(puffCv);

  // Panneau de la maison
  const signCv = canvas(256, 128);
  (function() {
    const c = signCv.getContext('2d');
    c.fillStyle = '#2b241f';
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#a58b5a';
    c.lineWidth = 5;
    c.strokeRect(8, 8, 240, 112);
    c.fillStyle = '#e4d6b8';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 40px monospace';
    c.fillText('THERAPY', 128, 50);
    c.font = '20px monospace';
    c.fillStyle = '#b9a98a';
    c.fillText('by appointment only', 128, 92);
  })();
  const signTex = new THREE.CanvasTexture(signCv);
  signTex.encoding = THREE.sRGBEncoding;

  // ==========================================
  // MATÉRIAUX
  // ==========================================

  const mSiding = new THREE.MeshStandardMaterial({ map: sidingTex, color: 0xcdbfb0, roughness: 0.92 });
  const mTrim = new THREE.MeshStandardMaterial({ color: 0x2a231e, roughness: 0.9 });
  const mWood = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.95 });
  const mRoof = new THREE.MeshStandardMaterial({ color: 0x302c2c, roughness: 0.9 });
  const mStone = new THREE.MeshStandardMaterial({ color: 0x5d5954, roughness: 1 });
  const mSnow = new THREE.MeshStandardMaterial({ color: 0xcbd3d9, roughness: 0.92, emissive: 0x0d1114 });
  const mDoor = new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: 0.8 });
  const mBrass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.6 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x343431, metalness: 0.5, roughness: 0.7 });
  const mPath = new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 1 });
  const mGravel = new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 1 });
  const mCurtain = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 });
  const mCarGlass = new THREE.MeshStandardMaterial({ color: 0x0b0e10, roughness: 0.2, metalness: 0.3 });
  const mTire = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1 });

  // ==========================================
  // OUTILS
  // ==========================================

  function box(w, h, d, mat, x, y, z, parentObj) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parentObj || g).add(m);
    return m;
  }

  function glowSprite(x, y, z, color, scale, opacity) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    sp.position.set(x, y, z);
    sp.scale.set(scale, scale, 1);
    g.add(sp);
    return sp;
  }

  // ==========================================
  // FONDATION ET MURS
  // ==========================================

  box(W + 0.3, F, D + 0.3, mStone, 0, F / 2, 0);

  box(W, WALL_H, D, mSiding, 0, F + WALL_H / 2, 0);

  // Chaînages d'angle
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(c) {
    box(0.16, WALL_H, 0.16, mTrim, c[0] * (W / 2), F + WALL_H / 2, c[1] * (D / 2));
  });

  // Frises haute et basse
  box(W + 0.2, 0.14, D + 0.2, mTrim, 0, F + WALL_H - 0.05, 0);
  box(W + 0.12, 0.12, D + 0.12, mTrim, 0, F + 0.06, 0);

  // Pignons (le toit est à deux pans, faîtage le long de x)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(D / 2, 0);
  gableShape.lineTo(0, RISE);
  gableShape.lineTo(-D / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: W - 0.02, bevelEnabled: false });
  const gable = new THREE.Mesh(gableGeo, mSiding);
  gable.rotation.y = Math.PI / 2;
  gable.position.set(-(W - 0.02) / 2, F + WALL_H, 0);
  g.add(gable);

  // ==========================================
  // TOIT (deux pans, débord, neige épaisse)
  // ==========================================

  const OV = 0.55;
  const halfRun = D / 2 + OV;
  const rise2 = RISE * halfRun / (D / 2);
  const slope = Math.atan2(RISE, D / 2);
  const slabLen = Math.hypot(halfRun, rise2);
  const roofCy = F + WALL_H + RISE - rise2 / 2;

  [1, -1].forEach(function(side) {
    const slab = box(W + 1.0, 0.16, slabLen, mRoof, 0, roofCy, side * halfRun / 2);
    slab.rotation.x = side * slope;
    const snow = box(W + 0.9, 0.2, slabLen * 0.97, mSnow, 0, roofCy + 0.13, side * halfRun / 2);
    snow.rotation.x = side * slope;
  });
  box(W + 1.0, 0.18, 0.5, mSnow, 0, F + WALL_H + RISE + 0.12, 0);

  // Cheminée
  const CH_X = -2.8, CH_Z = -1.0;
  const chTop = F + WALL_H + RISE + 1.1;
  box(0.85, 3.6, 0.85, mStone, CH_X, chTop - 1.8, CH_Z);
  box(1.0, 0.12, 1.0, mTrim, CH_X, chTop + 0.02, CH_Z);
  box(0.9, 0.1, 0.9, mSnow, CH_X, chTop + 0.12, CH_Z);

  // Gouttières
  [1, -1].forEach(function(side) {
    box(W + 0.9, 0.08, 0.1, mMetal, 0, F + WALL_H - 0.32, side * (D / 2 + OV - 0.05));
  });

  // ==========================================
  // FENÊTRES (chaudes, visibles de très loin)
  // ==========================================

  const warm = disp(0.95, 0.70, 0.36);
  const warmDim = disp(0.70, 0.46, 0.22);
  const tvBlue = disp(0.55, 0.70, 0.95);
  const glowMats = [];

  // face : 'front' (+z), 'back' (-z), 'right' (+x), 'left' (-x)
  function windowAt(face, pos, y, w, h, color, halo, tv) {

    const wp = new THREE.Group();
    const nx = face === 'right' ? 1 : face === 'left' ? -1 : 0;
    const nz = face === 'front' ? 1 : face === 'back' ? -1 : 0;
    wp.position.set(
      face === 'front' || face === 'back' ? pos : nx * (W / 2),
      y,
      face === 'right' || face === 'left' ? pos : nz * (D / 2)
    );
    wp.rotation.y = face === 'front' ? 0 : face === 'back' ? Math.PI : face === 'right' ? Math.PI / 2 : -Math.PI / 2;
    g.add(wp);

    const mat = new THREE.MeshBasicMaterial({ color: color.clone() });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    pane.position.z = 0.015;
    wp.add(pane);
    glowMats.push({ mat: mat, base: color.clone(), tv: !!tv });

    // Cadre, croisillons, appui, neige
    box(w + 0.22, 0.1, 0.12, mTrim, 0, h / 2 + 0.05, 0.05, wp);
    box(w + 0.22, 0.1, 0.12, mTrim, 0, -h / 2 - 0.05, 0.05, wp);
    box(0.1, h + 0.2, 0.12, mTrim, -w / 2 - 0.05, 0, 0.05, wp);
    box(0.1, h + 0.2, 0.12, mTrim, w / 2 + 0.05, 0, 0.05, wp);
    box(0.04, h, 0.05, mTrim, 0, 0, 0.04, wp);
    box(w, 0.04, 0.05, mTrim, 0, 0, 0.04, wp);
    box(w + 0.4, 0.09, 0.3, mTrim, 0, -h / 2 - 0.14, 0.14, wp);
    box(w + 0.3, 0.07, 0.26, mSnow, 0, -h / 2 - 0.08, 0.14, wp);

    // Rideau
    if (!tv) box(w * 0.4, h * 0.95, 0.02, mCurtain, -w * 0.28, 0, 0.03, wp);

    // Halo (fog:false : on voit la fenêtre briller de loin, même dans le brouillard)
    if (halo) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      sp.position.set(0, 0, 0.8);
      sp.scale.set(w * 3.4, h * 3.4, 1);
      wp.add(sp);
    }
    return wp;
  }

  const WY = F + 1.65;
  windowAt('front', -2.9, WY, 1.3, 1.25, warm, true, false);
  windowAt('front', 2.9, WY, 1.3, 1.25, warmDim, true, true);   // celle-ci vacille comme une télé
  windowAt('right', 0.2, WY, 1.1, 1.2, warm, true, false);
  windowAt('left', -0.8, WY, 1.1, 1.2, disp(0.04, 0.045, 0.05), false, false);
  windowAt('back', 1.5, WY, 1.2, 1.2, disp(0.04, 0.045, 0.05), false, false);

  // Petite lucarne ronde dans le pignon (allumée)
  [1, -1].forEach(function(side) {
    const round = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: side > 0 ? warm : disp(0.04, 0.045, 0.05) }));
    round.position.set(side * (W / 2 + 0.02), F + WALL_H + 0.75, 0);
    round.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(round);
  });

  // ==========================================
  // PORCHE ET PORTE
  // ==========================================

  const FZ = D / 2;

  // Porte : chambranle fixe + battant pivotant (cliquable : elle s'ouvre, puis on entre)
  box(1.5, 2.55, 0.14, mTrim, 0, F + 1.27, FZ + 0.02);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.25), new THREE.MeshBasicMaterial({ color: 0x120c08 }));
  doorway.position.set(0, F + 1.13, FZ + 0.016);
  g.add(doorway);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.55, F + 1.13, FZ + 0.08);      // charnière à gauche
  g.add(doorPivot);
  const doorLeaf = box(1.1, 2.25, 0.1, mDoor, 0.55, 0, 0, doorPivot);
  [0.62, -0.1, -0.78].forEach(function(py) {
    box(0.78, 0.5, 0.03, mWood, 0.55, py, 0.06, doorPivot);
  });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mBrass);
  knob.position.set(0.93, -0.08, 0.1);
  doorPivot.add(knob);
  // Zone de clic un peu plus grande que la porte (plus facile à viser, surtout au doigt)
  const doorHit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.5, 0.5), new THREE.MeshBasicMaterial());
  doorHit.visible = false;
  doorHit.position.set(0, F + 1.2, FZ + 0.2);
  g.add(doorHit);

  let doorT = 0, doorGoal = 0;
  const frontDoor = {
    meshes: [doorLeaf, doorHit],
    setOpen: function(v) { doorGoal = v ? 1 : 0; },
    amount: function() { return doorT; }
  };

  // Plancher du porche + marches
  box(3.8, 0.2, 2.2, mWood, 0, F - 0.1, FZ + 1.1);
  box(3.7, 0.06, 2.1, mSnow, 0, F + 0.02, FZ + 1.1);
  box(1.8, 0.17, 0.5, mWood, 0, 0.085, FZ + 2.6);
  box(1.8, 0.34, 0.5, mWood, 0, 0.17, FZ + 2.2);
  box(1.7, 0.05, 0.42, mSnow, 0, 0.36, FZ + 2.2);

  // Poteaux et toit du porche
  [-1.7, 1.7].forEach(function(px) {
    box(0.15, 2.6, 0.15, mTrim, px, F + 1.3, FZ + 2.05);
  });
  const porchRoof = box(4.2, 0.12, 2.7, mRoof, 0, F + 2.68, FZ + 1.2);
  porchRoof.rotation.x = 0.1;
  const porchSnow = box(4.1, 0.2, 2.6, mSnow, 0, F + 2.82, FZ + 1.2);
  porchSnow.rotation.x = 0.1;

  // Lampe du porche (une seule vraie lumière : toute la façade en profite)
  box(0.18, 0.28, 0.16, mMetal, 1.0, F + 2.25, FZ + 0.1);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: disp(0.95, 0.78, 0.5) }));
  bulb.position.set(1.0, F + 2.22, FZ + 0.19);
  g.add(bulb);
  glowSprite(1.0, F + 2.2, FZ + 0.6, 0xffb870, 3.4, 0.55);

  // Le sol devant la maison est éclairé par le porche et par ses fenêtres (halos au sol : visibles de loin, sans coût)
  lightPool(g, 0.6, 0, FZ + 3.2, 8.5, 0xffa860, 0.34);
  lightPool(g, -3.4, 0, FZ + 3.0, 5.5, 0xffc888, 0.16);
  lightPool(g, 4.6, 0, FZ + 3.0, 5.5, 0xffc888, 0.16);

  if (opts.light !== false) {
    const light = new THREE.PointLight(0xffa860, 2.6, 26, 1.7);
    light.position.set(0.6, F + 2.1, FZ + 1.6);
    light.userData.keep = true;   // bedroom.js enlève les lumières de la rue, mais pas celle-ci
    g.add(light);
  }

  // ==========================================
  // ALLÉE, PARKING, PANNEAU, BOÎTE AUX LETTRES
  // ==========================================

  // Allée déneigée jusqu'au porche
  box(1.7, 0.04, 4.2, mPath, 0, 0.0, FZ + 4.6);

  // Aire de retournement au bout de la route (ici : z local = 10, point d'arrivée)
  box(9.5, 0.04, 5.4, mGravel, 0, -0.01, FZ + 5.5);

  // Panneau sur poteau
  box(0.13, 2.3, 0.13, mWood, 3.3, 1.15, FZ + 4.6);
  box(1.7, 0.9, 0.07, mTrim, 3.3, 2.0, FZ + 4.6);
  const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.78), new THREE.MeshBasicMaterial({ map: signTex }));
  signPlane.position.set(3.3, 2.0, FZ + 4.64);
  g.add(signPlane);
  box(1.75, 0.1, 0.16, mSnow, 3.3, 2.5, FZ + 4.6);

  // Boîte aux lettres
  box(0.1, 1.1, 0.1, mWood, -3.2, 0.55, FZ + 5.2);
  box(0.5, 0.3, 0.26, mMetal, -3.2, 1.2, FZ + 5.2);
  box(0.46, 0.06, 0.22, mSnow, -3.2, 1.38, FZ + 5.2);
  box(0.03, 0.2, 0.03, new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.7 }), -2.93, 1.3, FZ + 5.2);

  // Clôture basse de chaque côté de l'allée
  const fenceZ = FZ + 3.1;
  [[-9, -1.2], [1.2, 9]].forEach(function(run) {
    const len = run[1] - run[0], cx = (run[0] + run[1]) / 2;
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      box(0.09, 1.0, 0.09, mWood, run[0] + i * len / n, 0.5, fenceZ);
    }
    box(len, 0.06, 0.05, mWood, cx, 0.38, fenceZ);
    box(len, 0.06, 0.05, mWood, cx, 0.84, fenceZ);
    box(len, 0.06, 0.1, mSnow, cx, 0.9, fenceZ);
  });

  // Pile de bois contre le mur droit (bûches couchées, axe en x)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 7), mWood);
      log.rotation.z = Math.PI / 2;
      log.position.set(W / 2 + 0.55, 0.12 + r * 0.19, -3.4 + c * 0.2 + (r % 2) * 0.1);
      g.add(log);
    }
  }
  box(0.7, 0.07, 1.6, mSnow, W / 2 + 0.3, 0.9, -2.8);

  // Neige accumulée contre les murs
  const lumpGeo = new THREE.SphereGeometry(1, 8, 5);
  for (let i = 0; i < 26; i++) {
    const t = i / 26 * Math.PI * 2;
    const rx = (W / 2 + 0.7), rz = (D / 2 + 0.7);
    const px = Math.cos(t) * rx + (rnd() - 0.5) * 0.6;
    const pz = Math.sin(t) * rz + (rnd() - 0.5) * 0.6;
    if (pz > FZ - 0.2 && Math.abs(px) < 2.4) continue;   // pas devant le porche
    const h = 0.25 + rnd() * 0.3;
    const lump = new THREE.Mesh(lumpGeo, mSnow);
    lump.scale.set(0.9 + rnd() * 0.8, h, 0.7 + rnd() * 0.5);
    lump.position.set(px, h * 0.3 - 0.04, pz);
    g.add(lump);
  }

  // ==========================================
  // FUMÉE DE CHEMINÉE
  // ==========================================

  const smoke = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTex, color: 0xb8bec4, transparent: true, opacity: 0, depthWrite: false
    }));
    g.add(sp);
    smoke.push(sp);
  }

  // ==========================================
  // COLLISIONS (rectangles x/z, dans le repère du parent)
  // ==========================================
  // La maison est tournée de 180° : local (x, z) -> monde (hx - x, hz - z).

  function worldRect(lx0, lx1, lz0, lz1) {
    return { x0: hx - lx1, x1: hx - lx0, z0: hz - lz1, z1: hz - lz0 };
  }

  const colliders = [
    worldRect(-W / 2 - 0.25, W / 2 + 0.25, -D / 2 - 0.25, D / 2 + 0.25),                 // la maison
    worldRect(W / 2 + 0.1, W / 2 + 0.9, -3.5, -1.8)                                      // pile de bois
  ];

  // ==========================================
  // UPDATE
  // ==========================================

  const chimneyY = chTop + 0.3;

  // Intérieur : la porte devient interactive (bouton ENTER devant la porte)
  let interior = null;
  if (opts.interior && opts.camera) {
    interior = createInterior(parent, {
      camera: opts.camera, origin: opts.origin, action: opts.action, view: opts.view,
      canvas: opts.canvas, renderer: opts.renderer, door: frontDoor,
      snow: opts.snow, onTeleport: opts.onTeleport, isBusy: opts.isBusy,
      doorX: hx, doorZ: hz - (D / 2 + 1.6),        // devant la porte (la façade regarde vers -z)
      exitX: hx, exitZ: hz - (D / 2 + 3.9)         // on ressort au pied des marches
    });
  }

  return {
    group: g,
    colliders: colliders,
    interior: interior,
    update: function(dt, time) {

      if (interior) interior.update(dt, time);

      // Porte d'entrée : s'ouvre vers l'extérieur
      if (doorT < doorGoal) doorT = Math.min(doorGoal, doorT + dt / 0.7);
      else if (doorT > doorGoal) doorT = Math.max(doorGoal, doorT - dt / 0.7);
      doorPivot.rotation.y = -1.45 * doorT * doorT * (3 - 2 * doorT);

      // Fumée : monte, grossit, se dissipe, poussée par le vent
      for (let i = 0; i < smoke.length; i++) {
        const t = ((time * 0.16) + i / smoke.length) % 1;
        const sp = smoke[i];
        sp.position.set(CH_X + t * 2.6 + Math.sin(time * 0.7 + i) * 0.12, chimneyY + t * 5.5, CH_Z + t * 0.4);
        const s = 0.5 + t * 2.6;
        sp.scale.set(s, s, 1);
        sp.material.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.34;
      }

      // Fenêtre "télé" qui vacille
      for (const gm of glowMats) {
        if (!gm.tv) continue;
        if (time < (gm.next || 0)) continue;
        const k = 0.35 + Math.random() * 0.65;
        gm.mat.color.copy(tvBlue).multiplyScalar(k);
        gm.next = time + 0.08 + Math.random() * 0.3;
      }
    }
  };
}

// ==========================================
// MODE AUTONOME : world_base.html?world=therapist-house.js
// ==========================================
// On construit tout le monde extérieur d'immeuble.js (route, collines, maison)
// et on démarre devant la maison, face à la porte.

export function buildWorld(scene, ctx) {

  ctx = ctx || {};

  const outside = buildOutside(scene, ctx);

  if (ctx.camera) {
    ctx.camera.position.set(WORK_SPOT.x, 1.7, WORK_SPOT.z);
    if (ctx.setView) ctx.setView(Math.PI, 0);   // regarde vers +z : la maison
  }

  return outside;
}
