import * as THREE from 'three';
import { lightPool } from '../lightpool.js';
import { loadMixamoAvatar } from '../avatar-loader.js';
import { buildWorld as buildOutside } from './outside.js';
import { WORK_SPOT } from './map.js';
import { createBookReader } from '../objects/bookreader.js';
import { createTherapistTalk } from '../engine/therapist-ai.js';
import { createHub } from './common.js';
import { buildPhone } from '../objects/phone.js';
import { createJournal } from '../objects/journal.js';

// ==========================================
// BAD THERAPIST — LA MAISON DU THÉRAPEUTE (places/therapist-house.js)
// ==========================================
// Une vraie maison, au bout de la route, SANS téléportation ni écran de chargement :
//   • la porte d'entrée s'ouvre (bouton OPEN, ou clic) : on voit l'intérieur en direct, on entre et on sort à pied ;
//   • salle d'attente -> couloir -> chambre d'Evelyn (lit, tableau, carnet intime) et salle de séance
//     (livres, bureau, fauteuils, cheminée, téléphone d'Evelyn) ;
//   • les fenêtres sont de vraies ouvertures : on voit la rue, la neige, les collines ;
//   • interrupteurs dans chaque pièce (salle d'attente, couloir, chambre, séance) + cheminée allumable.
//     L'état est sauvegardé (clé « bt_house_lights », déclarée dans save-data.js).
//
// Deux usages (inchangés) :
//   1) dans immeuble.js / outside.js : buildWork(scene, { x, z, y, interior, camera, ... })
//      - avec interior + camera : la maison complète (celle de la rue) ;
//      - sans : la maison « de loin » (vue par la fenêtre de la chambre), murs et fenêtres lumineuses, pas d'intérieur.
//   2) autonome : world_base.html?world=therapist-house.js
//
// Pour qu'Evelyn (ou toi, depuis la console F12) agisse sur la maison :
//   BadTherapistHouse.setLight('bedroom', false, 'evelyn')   éteint / allume : 'waiting' | 'corridor' | 'session' | 'bedroom' | 'fire'
//   BadTherapistHouse.journal.write('...') / .erase('...')   son carnet intime (sauvegardé comme le tien)
//   BadTherapistHouse.phone                                  son téléphone (même code que le tien : objects/phone.js)
//   BadTherapistHouse.spots                                  positions utiles (lit, carnet, interrupteurs, fauteuil...) dans le repère de la rue

// Ancien intérieur téléporté : plus utilisé (gardé seulement pour qu'un import ailleurs ne casse pas)
export const INTERIOR_X = 1200;

// ── Evelyn (Mixamo) : dossier avatars/evelyn/ à côté de world_base.html ──
const AVATAR_DIR = 'avatars/evelyn/';
const AVATAR_MODEL = 'evelyn.fbx';
// Liste des fichiers qui EXISTENT vraiment (assets-manifest.json, réécrit par assets.php) : on ne demande jamais un fichier absent,
// donc plus de 404 dans la console (livres pas encore écrits, images optionnelles, animations pas encore ajoutées...).
// Si le manifest est illisible, la liste vaut null et chaque fonction garde son ancien comportement.
let _manifestP = null;
function manifestFiles() {
  if (!_manifestP) {
    _manifestP = fetch('assets-manifest.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { return m && Array.isArray(m.files) ? new Set(m.files.map(function (f) { return String(f && f.path); })) : null; })
      .catch(function () { return null; });
  }
  return _manifestP;
}

// Animations d'Evelyn (noms réels de avatars/evelyn/). Les 2 premières suffisent pour la séance ; les autres servent à sa vie dans la maison.
// Une animation dont le fichier n'existe pas (encore) est simplement ignorée, sans 404. Il manque Walking.fbx (Mixamo, « In Place »).
const AVATAR_ANIMS = {
  sit: 'Sitting.fbx', sit_talk: 'Sitting Talking.fbx',
  walk: 'Walking.fbx', sleep: 'Sleeping Idle.fbx',
  stand: 'Standing Idle.fbx',
  openDoor: 'OpeningDoor.fbx', closeDoor: 'ClosingDoor.fbx'
};
const AVATAR_ANIMS_MIN = { sit: 'Sitting.fbx', sit_talk: 'Sitting Talking.fbx' };   // secours si une des autres ne se charge pas
// Où elle dort (écart par rapport au centre du lit) : à régler selon l'animation « Sleeping Idle »
const SLEEP_POSE = { x: 0, y: 0, z: 0, yaw: 0 };
// Boutons d'action à l'écran (OPEN, SWITCH ON...) : false = on clique / touche directement les objets (curseur main)
const BUTTONS = false;
const AVATAR_HEIGHT = 1.7;
const AVATAR_OFFSET = { x: 0, y: 0, z: 0 };     // à ajuster si elle n'est pas bien assise
const AVATAR_YAW = 0;                           // 0 = elle regarde vers la porte de la pièce (vers le joueur)

// Livres de l'étagère : json/livredetherapeute/book01.json ... book20.json
const BOOK_DIR = 'json/livredetherapeute/';
const BOOK_COUNT = 20;

// ── Dimensions (repère « h » de la maison : x = largeur, z = profondeur, +z = façade) ──
const W = 12, D = 10, WALL_H = 3.1, RISE = 2.6, F = 0.5;
const TW = 0.3, PT = 0.15;                       // épaisseur des murs extérieurs / des cloisons
const ZOFF = -(D - 7) / 2;                       // la façade reste exactement là où elle était (la route et l'allée ne bougent pas)
const CEIL = F + WALL_H;
const Z_P1 = 1.3, Z_P2 = -0.5, X_P3 = 0.4;       // cloisons : attente | couloir | chambres ; séance | chambre
const IX0 = -W / 2 + TW, IX1 = W / 2 - TW, IZ0 = -D / 2 + TW, IZ1 = D / 2 - TW;
const ROOMS = {
  waiting:  { x0: IX0,          x1: IX1,          z0: Z_P1 + PT / 2, z1: IZ1 },
  corridor: { x0: IX0,          x1: IX1,          z0: Z_P2 + PT / 2, z1: Z_P1 - PT / 2 },
  session:  { x0: IX0,          x1: X_P3 - PT / 2, z0: IZ0,           z1: Z_P2 - PT / 2 },
  bedroom:  { x0: X_P3 + PT / 2, x1: IX1,         z0: IZ0,           z1: Z_P2 - PT / 2 }
};
const ROOM_IDS = ['waiting', 'corridor', 'session', 'bedroom'];

// Meubles importants
const CHAIR = { x: -1.2, z: -3.55 };             // fauteuil d'Evelyn (dos au mur du fond)
const SEAT = { x: -1.2, z: -1.65 };              // chaise du joueur (face à Evelyn)
const TABLE = { x: -1.2, z: -2.55, w: 1.6, d: 0.9 };
const SH = { z0: -4.4, z1: -1.2, d: 0.34 };      // étagère, contre le mur gauche de la séance
const FIRE = { x: -3.4, w: 1.1 };                // cheminée, mur du fond de la séance
const NIGHT = { x: 3.2, z: -4.45 };              // table de chevet (carnet intime)
const BED = { x: 4.3, z: -3.65 };                // lit, tête contre le mur du fond

// ==========================================
// LUMIÈRES (état partagé par toutes les copies de la maison, sauvegardé)
// ==========================================
const LIGHT_KEY = 'bt_house_lights';
const LIGHT_DEFAULT = { waiting: true, corridor: true, session: true, bedroom: false, fire: true };
let lightState = null;
const lightListeners = [];

function getLights() {
  if (lightState) return lightState;
  lightState = Object.assign({}, LIGHT_DEFAULT);
  try {
    const raw = localStorage.getItem(LIGHT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') Object.keys(LIGHT_DEFAULT).forEach(function (k) { if (typeof o[k] === 'boolean') lightState[k] = o[k]; });
  } catch (e) { }
  return lightState;
}

function setLight(id, on, who) {
  const s = getLights();
  if (!(id in LIGHT_DEFAULT)) return false;
  on = !!on;
  if (s[id] === on) return true;
  s[id] = on;
  try { localStorage.setItem(LIGHT_KEY, JSON.stringify(s)); } catch (e) { }
  lightListeners.forEach(function (fn) { try { fn(id, on); } catch (e) { } });
  try { window.dispatchEvent(new CustomEvent('badtherapist:house-lights', { detail: { id: id, on: on, by: who || 'player', lights: Object.assign({}, s) } })); } catch (e) { }
  return true;
}

// Le carnet intime d'Evelyn : même code que le livre du tiroir (objects/journal.js), autre clé de sauvegarde
let evJournal = null;
function getEvelynJournal() {
  if (!evJournal) {
    evJournal = createJournal({
      key: 'bt_evelyn_journal', readOnly: true, label: 'Carnet intime d\'Evelyn',
      cover: ['#2c5a63', '#17363e', '#0b1d23']
    });
  }
  return evJournal;
}

// ==========================================
// LA MAISON
// ==========================================

export function buildWork(parent, opts) {

  opts = opts || {};

  const hx = opts.x || 0;
  const hz = opts.z || 0;
  const gy = opts.y || 0;

  const NEAR = !!(opts.interior && opts.camera);          // maison complète (rue) ou maison « de loin »
  const camera = opts.camera;
  const origin = opts.origin || { x: 0, y: 0, z: 0 };
  const canvasEl = opts.canvas || (opts.renderer && opts.renderer.domElement) || document.getElementById('gc');

  // g : tourné de 180° (la façade regarde vers -z, vers la route qui arrive). h : la maison elle-même.
  const g = new THREE.Group();
  g.position.set(hx, gy, hz);
  g.rotation.y = Math.PI;
  parent.add(g);
  const h = new THREE.Group();
  h.position.z = ZOFF;
  g.add(h);

  // repère h (x, z) -> repère de la rue (parent)
  function toParent(x, z) { return { x: hx - x, z: hz - (z + ZOFF) }; }
  function fromParent(px, pz) { return { x: hx - px, z: hz - pz - ZOFF }; }
  function worldRect(r) { return { x0: hx - r.x1, x1: hx - r.x0, z0: hz - (r.z1 + ZOFF), z1: hz - (r.z0 + ZOFF) }; }

  const rnd = (function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(20261104);

  // Couleur "comme à l'écran" (three r128 : MeshBasic en linéaire)
  const disp = function (r, gr, b) {
    return new THREE.Color(Math.pow(r, 2.2), Math.pow(gr, 2.2), Math.pow(b, 2.2));
  };

  // ==========================================
  // TEXTURES
  // ==========================================

  function cv(w, hh) {
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    return c;
  }
  function srgb(t) { if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t; }

  // Bardage en planches horizontales
  const sidingCv = cv(128, 128);
  (function () {
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
  srgb(sidingTex);

  // Parquet (1 m x 1 m : lames de 25 cm)
  const plankCv = cv(128, 128);
  (function () {
    const c = plankCv.getContext('2d');
    for (let i = 0; i < 4; i++) {
      const v = 190 + (rnd() * 50 | 0);
      c.fillStyle = 'rgb(' + v + ',' + (v - 35) + ',' + (v - 80) + ')';
      c.fillRect(0, i * 32, 128, 32);
      for (let k = 0; k < 40; k++) {
        c.fillStyle = 'rgba(40,20,5,' + (0.03 + rnd() * 0.07) + ')';
        c.fillRect(rnd() * 128, i * 32 + rnd() * 30, 6 + rnd() * 30, 1);
      }
      c.fillStyle = 'rgba(20,10,0,0.55)';
      c.fillRect(0, i * 32, 128, 1.5);
      c.fillRect(((i * 53) % 128), i * 32, 1.5, 32);
    }
  })();
  const plankTex = new THREE.CanvasTexture(plankCv);
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
  srgb(plankTex);

  // Plaid du lit
  const blanketCv = cv(128, 128);
  (function () {
    const c = blanketCv.getContext('2d');
    c.fillStyle = '#7b8fa6'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(240,235,220,0.55)';
    for (let i = 0; i < 128; i += 32) { c.fillRect(i, 0, 10, 128); c.fillRect(0, i, 128, 10); }
    c.fillStyle = 'rgba(30,40,60,0.35)';
    for (let i = 16; i < 128; i += 32) { c.fillRect(i, 0, 4, 128); c.fillRect(0, i, 128, 4); }
  })();
  const blanketTex = new THREE.CanvasTexture(blanketCv);
  blanketTex.wrapS = blanketTex.wrapT = THREE.RepeatWrapping;
  srgb(blanketTex);

  // Halo doux
  const glowCv = cv(128, 128);
  (function () {
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
  const puffCv = cv(64, 64);
  (function () {
    const c = puffCv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(190,195,200,0.9)');
    gr.addColorStop(0.5, 'rgba(160,166,172,0.35)');
    gr.addColorStop(1, 'rgba(150,156,162,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  })();
  const puffTex = new THREE.CanvasTexture(puffCv);

  // Panneau de la maison
  const signCv = cv(256, 128);
  (function () {
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
  const signTex = srgb(new THREE.CanvasTexture(signCv));

  // ==========================================
  // MATÉRIAUX EXTÉRIEURS
  // ==========================================

  const mSiding = new THREE.MeshStandardMaterial({ map: sidingTex, color: 0xcdbfb0, roughness: 0.92 });
  mSiding.userData.tile = [3, 1.41];                      // 1 motif = 3 m de large, 1,41 m de haut (comme avant)
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
  const mCap = new THREE.MeshStandardMaterial({ color: 0x2f2822, roughness: 1 });      // tranches des murs, dessous
  const mEdge = new THREE.MeshStandardMaterial({ color: 0x3b2417, roughness: 0.85 });  // tranche des portes
  const mGlassNear = new THREE.MeshBasicMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });

  // ==========================================
  // MATÉRIAUX DES PIÈCES (éclairés « de l'intérieur » : un interrupteur = une pièce)
  // ==========================================
  // Chaque pièce a ses propres matériaux dont la lueur propre (emissive) suit l'interrupteur.
  // Pas de vraie lumière par pièce : aucune fuite à travers les murs, et rien à recompiler quand on allume.

  const WARM = new THREE.Color(1.0, 0.86, 0.62);
  const E_OFF = 0.03, E_ON = 0.46;
  // Les murs ne renvoient que 28 % des lumières de la rue (porche, lampadaires) : il n'y a pas d'ombres dans ce jeu,
  // donc sans ça le porche éclairerait toute la maison à travers les murs, même interrupteur éteint.
  const ALB = 0.28;
  const REG = { waiting: [], corridor: [], session: [], bedroom: [] };
  const rcache = {};

  function rm(room, color, o) {
    o = o || {};
    const key = room + '|' + color + '|' + (o.r === undefined ? '' : o.r) + '|' + (o.mapId || '');
    if (rcache[key]) return rcache[key];
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(ALB), roughness: o.r === undefined ? 0.9 : o.r, metalness: o.m || 0 });
    if (o.map) { m.map = o.map; m.emissiveMap = o.map; m.userData.tile = o.tile || [1, 1]; }
    REG[room].push({ mat: m, base: new THREE.Color(color), k: 1 });
    rcache[key] = m;
    return m;
  }

  // Tableaux / affiches : une texture sur un matériau de pièce
  function paintMat(room, tex) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(0.5), roughness: 0.8, map: tex, emissiveMap: tex });
    REG[room].push({ mat: m, base: new THREE.Color(0xffffff), k: 1.7 });
    return m;
  }

  // ==========================================
  // FUSION DES BOÎTES (une maison entière = quelques dizaines d'objets, pas des centaines)
  // ==========================================

  const buckets = new Map();
  const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3();

  function bucketOf(mat) {
    let b = buckets.get(mat);
    if (!b) { b = { pos: [], nor: [], uv: [], idx: [], n: 0 }; buckets.set(mat, b); }
    return b;
  }

  function addGeo(geo, mats, x, y, z, rotY) {
    _m.makeRotationY(rotY || 0);
    _m.setPosition(x, y, z);
    _nm.getNormalMatrix(_m);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const index = geo.index;
    const groups = geo.groups && geo.groups.length ? geo.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
    groups.forEach(function (gr) {
      const mat = Array.isArray(mats) ? mats[gr.materialIndex] : mats;
      if (!mat) return;
      const b = bucketOf(mat);
      const tile = mat.userData && mat.userData.tile;
      const remap = new Map();
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const vi = index ? index.getX(i) : i;
        let ni = remap.get(vi);
        if (ni === undefined) {
          ni = b.n++;
          remap.set(vi, ni);
          _v.fromBufferAttribute(pos, vi).applyMatrix4(_m);
          const px = _v.x, py = _v.y, pz = _v.z;
          _v.fromBufferAttribute(nor, vi).applyMatrix3(_nm).normalize();
          b.pos.push(px, py, pz);
          b.nor.push(_v.x, _v.y, _v.z);
          if (tile) {                                   // motif aligné sur le monde : pas de raccord visible entre deux boîtes
            const ax = Math.abs(_v.x), ay = Math.abs(_v.y), az = Math.abs(_v.z);
            let u, vv;
            if (ay >= ax && ay >= az) { u = px; vv = pz; }
            else if (ax >= az) { u = pz; vv = py; }
            else { u = px; vv = py; }
            b.uv.push(u / tile[0], vv / tile[1]);
          } else if (uv) b.uv.push(uv.getX(vi), uv.getY(vi));
          else b.uv.push(0, 0);
        }
        b.idx.push(ni);
      }
    });
  }

  // x, y, z = centre de la boîte. mats : un matériau, ou [+x, -x, +y, -y, +z, -z]
  function addBox(w, hh, d, mats, x, y, z, rotY) {
    if (w <= 0 || hh <= 0 || d <= 0) return;
    const geo = new THREE.BoxGeometry(w, hh, d);
    addGeo(geo, mats, x, y, z, rotY);
    geo.dispose();
  }

  function addCyl(rt, rb, hh, seg, mats, x, y, z) {
    const geo = new THREE.CylinderGeometry(rt, rb, hh, seg || 12);
    addGeo(geo, mats, x, y, z, 0);
    geo.dispose();
  }

  function addSphere(r, mats, x, y, z, sx, sy, sz, segs) {
    const geo = new THREE.SphereGeometry(r, segs || 10, Math.max(6, Math.round((segs || 10) * 0.8)));
    if (sx !== undefined) geo.scale(sx, sy, sz);
    addGeo(geo, mats, x, y, z, 0);
    geo.dispose();
  }

  function flushStatic() {
    buckets.forEach(function (b, mat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      h.add(new THREE.Mesh(geo, mat));
    });
    buckets.clear();
  }

  // Objet d'ameublement tourné de `yaw` autour de (x, z) : fb(largeur, hauteur, profondeur, matériau, dx, y, dz)
  function furn(x, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const fb = function (w, hh, d, mat, lx, ly, lz) {
      addBox(w, hh, d, mat, x + lx * c + lz * s, ly, z - lx * s + lz * c, yaw);
    };
    fb.r = function (w, hh, d, r, mat, lx, ly, lz) {            // boîte aux arêtes arrondies (coussins, matelas...)
      addRBox(w, hh, d, r, mat, x + lx * c + lz * s, ly, z - lx * s + lz * c, yaw);
    };
    return fb;
  }

  // Boîte aux arêtes arrondies (le long de z) : un cœur en croix + 4 cylindres d'angle
  function addRBox(w, hh, d, r, mat, x, y, z, yaw) {
    r = Math.min(r, w / 2 - 0.002, hh / 2 - 0.002);
    yaw = yaw || 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    addBox(w - 2 * r, hh, d, mat, x, y, z, yaw);
    addBox(w, hh - 2 * r, d, mat, x, y, z, yaw);
    const geo = new THREE.CylinderGeometry(r, r, d, 10);
    geo.rotateX(Math.PI / 2);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) {
      const lx = k[0] * (w / 2 - r), ly = k[1] * (hh / 2 - r);
      addGeo(geo, mat, x + lx * c, y + ly, z - lx * s, yaw);
    });
    geo.dispose();
  }

  // ==========================================
  // COLLISIONS (repère h) : murs, meubles, portes
  // ==========================================

  const SOLIDS = [];                 // { x0, x1, z0, z1, active? }
  const WALL_RECTS = [];             // murs seulement (renvoyés au monde)
  function solid(x0, x1, z0, z1, active) {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return null;
    const r = { x0: x0, x1: x1, z0: z0, z1: z1, active: active };
    SOLIDS.push(r);
    return r;
  }
  function wallRect(x0, x1, z0, z1) {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
    WALL_RECTS.push({ x0: x0, x1: x1, z0: z0, z1: z1 });
    solid(x0, x1, z0, z1);
  }

  // Mur qui court le long de x (à z = zc), de xa à xb. ops : ouvertures { a, b, y0, y1, kind: 'door'|'window'|'fire' }
  function wallX(zc, t, xa, xb, ops, mPlus, mMinus) {
    const mats = [mCap, mCap, mCap, mCap, mPlus, mMinus];
    ops = ops.slice().sort(function (p, q) { return p.a - q.a; });
    let cur = xa;
    function seg(a, b, y0, y1) { addBox(b - a, y1 - y0, t, mats, (a + b) / 2, (y0 + y1) / 2, zc); }
    ops.forEach(function (o) {
      seg(cur, o.a, F, CEIL);
      seg(o.a, o.b, F, o.y0);
      seg(o.a, o.b, o.y1, CEIL);
      cur = o.b;
    });
    seg(cur, xb, F, CEIL);
    let c2 = xa;
    ops.filter(function (o) { return o.kind === 'door'; }).forEach(function (o) { wallRect(c2, o.a, zc - t / 2, zc + t / 2); c2 = o.b; });
    wallRect(c2, xb, zc - t / 2, zc + t / 2);
  }

  // Mur qui court le long de z (à x = xc), de za à zb. mPlus = face +x, mMinus = face -x
  function wallZ(xc, t, za, zb, ops, mPlus, mMinus) {
    const mats = [mPlus, mMinus, mCap, mCap, mCap, mCap];
    ops = ops.slice().sort(function (p, q) { return p.a - q.a; });
    let cur = za;
    function seg(a, b, y0, y1) { addBox(t, y1 - y0, b - a, mats, xc, (y0 + y1) / 2, (a + b) / 2); }
    ops.forEach(function (o) {
      seg(cur, o.a, F, CEIL);
      seg(o.a, o.b, F, o.y0);
      seg(o.a, o.b, o.y1, CEIL);
      cur = o.b;
    });
    seg(cur, zb, F, CEIL);
    let c2 = za;
    ops.filter(function (o) { return o.kind === 'door'; }).forEach(function (o) { wallRect(xc - t / 2, xc + t / 2, c2, o.a); c2 = o.b; });
    wallRect(xc - t / 2, xc + t / 2, c2, zb);
  }

  // ==========================================
  // OUTILS
  // ==========================================

  // Boîte individuelle (non fusionnée) : pièces qui bougent, toits inclinés, pile de bois...
  function mbox(w, hh, d, mat, x, y, z, rx, parentObj) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    (parentObj || h).add(m);
    return m;
  }

  function glowSprite(x, y, z, color, scale, opacity) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    sp.position.set(x, y, z);
    sp.scale.set(scale, scale, 1);
    sp.raycast = function () { };                 // un halo ne bloque jamais un clic
    h.add(sp);
    return sp;
  }

  const lights = getLights();
  const K = {};                                   // lueur actuelle de chaque pièce (0..1), suit l'interrupteur en douceur
  ROOM_IDS.forEach(function (r) { K[r] = lights[r] ? 1 : 0; });
  let fireK = lights.fire ? 1 : 0;

  const WALLC = { waiting: 0xb8a88c, corridor: 0xa99b8e, session: 0x8d6d52, bedroom: 0x93a0ad };
  function inner(room) { return rm(room, WALLC[room], { r: 1 }); }
  function woodMat(room) { return rm(room, 0x6b4a32, { r: 0.7 }); }
  function trimIn(room) { return rm(room, 0xd8cdb8, { r: 0.8 }); }

  // ==========================================
  // FONDATION
  // ==========================================

  addBox(W + 0.3, F, D + 0.3, mStone, 0, F / 2, 0);

  // ==========================================
  // MURS (avec de vraies ouvertures) ET CLOISONS
  // ==========================================

  const WY0 = F + 1.0, WY1 = F + 2.3, WH = WY1 - WY0;
  const WIN = [
    { face: 'front', c: -3.4, w: 1.3, room: 'waiting' },
    { face: 'front', c: 3.4, w: 1.3, room: 'waiting' },
    { face: 'left', c: 3.0, w: 1.2, room: 'waiting' },
    { face: 'left', c: 0.4, w: 1.0, room: 'corridor' },
    { face: 'right', c: 3.0, w: 1.2, room: 'waiting' },
    { face: 'right', c: 0.4, w: 1.0, room: 'corridor' },
    { face: 'right', c: -2.4, w: 1.2, room: 'bedroom' },
    { face: 'back', c: -0.95, w: 1.2, room: 'session' },
    { face: 'back', c: 2.0, w: 1.2, room: 'bedroom' }
  ];
  function winOps(face, lo, hi) {
    return WIN.filter(function (w) { return w.face === face && w.c > lo && w.c < hi; }).map(function (w) {
      return { a: w.c - w.w / 2, b: w.c + w.w / 2, y0: WY0, y1: WY1, kind: 'window' };
    });
  }
  function doorOp(cx, w, hh) { return { a: cx - w / 2, b: cx + w / 2, y0: F, y1: F + hh, kind: 'door' }; }

  const DOOR_H = 2.15, FRONT_H = 2.25;
  const ZF = D / 2 - TW / 2, ZB = -D / 2 + TW / 2, XL = -W / 2 + TW / 2, XR = W / 2 - TW / 2;   // plans médians des murs extérieurs

  // façade (+z) : porte d'entrée au milieu, deux fenêtres
  wallX(ZF, TW, -W / 2, W / 2, winOps('front', -W, W).concat([doorOp(0, 1.1, FRONT_H)]), mSiding, inner('waiting'));
  // fond (-z) : séance à gauche (cheminée + fenêtre), chambre à droite (fenêtre)
  wallX(ZB, TW, -W / 2, X_P3,
    winOps('back', -W, X_P3).concat([{ a: FIRE.x - FIRE.w / 2, b: FIRE.x + FIRE.w / 2, y0: F, y1: F + 0.95, kind: 'fire' }]),
    inner('session'), mSiding);
  wallX(ZB, TW, X_P3, W / 2, winOps('back', X_P3, W), inner('bedroom'), mSiding);
  // côté gauche (-x) : séance | couloir | attente
  wallZ(XL, TW, IZ0, Z_P2, winOps('left', IZ0, Z_P2), inner('session'), mSiding);
  wallZ(XL, TW, Z_P2, Z_P1, winOps('left', Z_P2, Z_P1), inner('corridor'), mSiding);
  wallZ(XL, TW, Z_P1, IZ1, winOps('left', Z_P1, IZ1), inner('waiting'), mSiding);
  // côté droit (+x) : chambre | couloir | attente  (face intérieure = -x)
  wallZ(XR, TW, IZ0, Z_P2, winOps('right', IZ0, Z_P2), mSiding, inner('bedroom'));
  wallZ(XR, TW, Z_P2, Z_P1, winOps('right', Z_P2, Z_P1), mSiding, inner('corridor'));
  wallZ(XR, TW, Z_P1, IZ1, winOps('right', Z_P1, IZ1), mSiding, inner('waiting'));
  // cloisons
  wallX(Z_P1, PT, IX0, IX1, [doorOp(0, 1.0, DOOR_H)], inner('waiting'), inner('corridor'));
  wallX(Z_P2, PT, IX0, X_P3, [doorOp(-2.8, 1.0, DOOR_H)], inner('corridor'), inner('session'));
  wallX(Z_P2, PT, X_P3, IX1, [doorOp(3.2, 1.0, DOOR_H)], inner('corridor'), inner('bedroom'));
  wallZ(X_P3, PT, IZ0, Z_P2 - PT / 2, [], inner('bedroom'), inner('session'));

  // Chaînages d'angle, frises haute et basse (autour de la maison : le dessus est creux)
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
    addBox(0.16, WALL_H, 0.16, mTrim, c[0] * (W / 2), F + WALL_H / 2, c[1] * (D / 2));
  });
  [[0, D / 2 + 0.05, W + 0.2, 0.1], [0, -D / 2 - 0.05, W + 0.2, 0.1]].forEach(function (f) {
    addBox(f[2], 0.14, f[3], mTrim, f[0], F + WALL_H - 0.05, f[1]);
    addBox(f[2] - 0.08, 0.12, f[3], mTrim, f[0], F + 0.06, f[1]);
  });
  [W / 2 + 0.05, -W / 2 - 0.05].forEach(function (x) {
    addBox(0.1, 0.14, D, mTrim, x, F + WALL_H - 0.05, 0);
    addBox(0.1, 0.12, D, mTrim, x, F + 0.06, 0);
  });

  // Cadre des portes (dans l'épaisseur du mur)
  function doorFrame(zc, t, cx, w, hh, mat) {
    addBox(0.08, hh + 0.04, t + 0.04, mat, cx - w / 2 - 0.04, F + hh / 2, zc);
    addBox(0.08, hh + 0.04, t + 0.04, mat, cx + w / 2 + 0.04, F + hh / 2, zc);
    addBox(w + 0.16, 0.08, t + 0.04, mat, cx, F + hh + 0.04, zc);
  }
  doorFrame(ZF, TW, 0, 1.1, FRONT_H, mTrim);
  doorFrame(Z_P1, PT, 0, 1.0, DOOR_H, trimIn('waiting'));
  doorFrame(Z_P2, PT, -2.8, 1.0, DOOR_H, trimIn('corridor'));
  doorFrame(Z_P2, PT, 3.2, 1.0, DOOR_H, trimIn('corridor'));

  // ==========================================
  // FENÊTRES : de vraies ouvertures (vitre transparente) ; de loin, un carreau lumineux
  // ==========================================

  const warm = disp(0.95, 0.70, 0.36);
  const warmDim = disp(0.70, 0.46, 0.22);
  const darkPane = disp(0.04, 0.045, 0.05);
  const winObjs = [];

  function faceInfo(face) {
    if (face === 'front') return { n: [0, 1], c: ZF, horiz: true, rot: 0 };
    if (face === 'back') return { n: [0, -1], c: ZB, horiz: true, rot: Math.PI };
    if (face === 'left') return { n: [-1, 0], c: XL, horiz: false, rot: -Math.PI / 2 };
    return { n: [1, 0], c: XR, horiz: false, rot: Math.PI / 2 };
  }
  // boîte posée sur une face : along = position le long du mur, off = décalage vers l'extérieur (négatif = vers l'intérieur)
  function faceBox(face, along, y, lenA, hh, dep, off, mat) {
    const f = faceInfo(face);
    const x = f.horiz ? along : f.c + f.n[0] * off;
    const z = f.horiz ? f.c + f.n[1] * off : along;
    addBox(f.horiz ? lenA : dep, hh, f.horiz ? dep : lenA, mat, x, y, z);
  }

  WIN.forEach(function (wd) {
    const f = faceInfo(wd.face), c = wd.c, w = wd.w, ym = (WY0 + WY1) / 2;
    const oE = TW / 2 + 0.02, oI = -(TW / 2 + 0.02);
    // cadre extérieur, appui, neige
    faceBox(wd.face, c, WY1 + 0.05, w + 0.22, 0.1, 0.12, oE, mTrim);
    faceBox(wd.face, c, WY0 - 0.05, w + 0.22, 0.1, 0.12, oE, mTrim);
    faceBox(wd.face, c - w / 2 - 0.05, ym, 0.1, WH + 0.2, 0.12, oE, mTrim);
    faceBox(wd.face, c + w / 2 + 0.05, ym, 0.1, WH + 0.2, 0.12, oE, mTrim);
    faceBox(wd.face, c, WY0 - 0.14, w + 0.4, 0.09, 0.3, TW / 2 + 0.1, mTrim);
    faceBox(wd.face, c, WY0 - 0.08, w + 0.3, 0.07, 0.26, TW / 2 + 0.1, mSnow);
    // croisillons
    faceBox(wd.face, c, ym, 0.04, WH, 0.05, 0, mTrim);
    faceBox(wd.face, c, ym, w, 0.04, 0.05, 0, mTrim);
    // intérieur : encadrement blanc, tablette
    const ti = trimIn(wd.room);
    faceBox(wd.face, c, WY1 + 0.04, w + 0.18, 0.08, 0.05, oI, ti);
    faceBox(wd.face, c, WY0 - 0.02, w + 0.3, 0.05, 0.2, -(TW / 2 - 0.05), ti);
    faceBox(wd.face, c - w / 2 - 0.04, ym, 0.08, WH, 0.05, oI, ti);
    faceBox(wd.face, c + w / 2 + 0.04, ym, 0.08, WH, 0.05, oI, ti);
    if (NEAR) faceBox(wd.face, c - w * 0.28, ym + 0.05, w * 0.4, WH + 0.1, 0.03, -(TW / 2 + 0.05), rm(wd.room, 0x6a4a3c, { r: 1 }));

    // vitre
    let pane = null;
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, WH), NEAR ? mGlassNear : (pane = new THREE.MeshBasicMaterial({ color: darkPane.clone() })));
    gl.rotation.y = f.rot;
    gl.position.set(f.horiz ? c : f.c, ym, f.horiz ? f.c : c);
    gl.userData.passThrough = true;
    h.add(gl);
    // halo vu de dehors (de très loin : fog false)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: (wd.room === 'corridor' ? warmDim : warm).clone().multiplyScalar(0.55), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    halo.position.set(gl.position.x + f.n[0] * 0.8, ym, gl.position.z + f.n[1] * 0.8);
    halo.scale.set(w * 3.4, WH * 3.4, 1);
    halo.raycast = function () { };
    h.add(halo);
    winObjs.push({ room: wd.room, pane: pane, halo: halo, lit: wd.room === 'corridor' ? warmDim : warm });
  });

  // Petites lucarnes rondes dans les pignons (décor, allumées côté route)
  [1, -1].forEach(function (side) {
    const round = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: side > 0 ? warm : darkPane }));
    round.position.set(side * (W / 2 + 0.02), F + WALL_H + 0.75, 0);
    round.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    h.add(round);
  });

  function updateWindows() {
    winObjs.forEach(function (w) {
      const k = K[w.room];
      if (w.pane) w.pane.color.copy(darkPane).lerp(w.lit, k);
      w.halo.material.opacity = 0.5 * k;
    });
  }
  updateWindows();

  // ==========================================
  // PIGNONS, TOIT (deux pans, débord, neige épaisse), CHEMINÉE
  // ==========================================

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(D / 2, 0);
  gableShape.lineTo(0, RISE);
  gableShape.lineTo(-D / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: W - 0.02, bevelEnabled: false });
  const gableTex = sidingTex.clone();
  gableTex.repeat.set(1 / 3, 1 / 1.41);
  gableTex.needsUpdate = true;
  const gable = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ map: gableTex, color: 0xcdbfb0, roughness: 0.92 }));
  gable.rotation.y = Math.PI / 2;
  gable.position.set(-(W - 0.02) / 2, F + WALL_H, 0);
  h.add(gable);

  const OV = 0.55;
  const halfRun = D / 2 + OV;
  const rise2 = RISE * halfRun / (D / 2);
  const slope = Math.atan2(RISE, D / 2);
  const slabLen = Math.hypot(halfRun, rise2);
  const roofCy = F + WALL_H + RISE - rise2 / 2;

  [1, -1].forEach(function (side) {
    mbox(W + 1.0, 0.16, slabLen, mRoof, 0, roofCy, side * halfRun / 2, side * slope);
    mbox(W + 0.9, 0.2, slabLen * 0.97, mSnow, 0, roofCy + 0.13, side * halfRun / 2, side * slope);
  });
  addBox(W + 1.0, 0.18, 0.5, mSnow, 0, F + WALL_H + RISE + 0.12, 0);

  // Cheminée : le conduit monte le long du mur du fond, juste derrière la cheminée de la salle de séance
  const CH_X = FIRE.x, CH_Z = -D / 2 - 0.45;
  const chTop = F + WALL_H + RISE + 1.1;
  addBox(1.15, chTop, 0.95, mStone, CH_X, chTop / 2, CH_Z);
  addBox(1.3, 0.12, 1.1, mTrim, CH_X, chTop + 0.02, CH_Z);
  addBox(1.2, 0.1, 1.0, mSnow, CH_X, chTop + 0.12, CH_Z);

  // Gouttières
  [1, -1].forEach(function (side) {
    addBox(W + 0.9, 0.08, 0.1, mMetal, 0, F + WALL_H - 0.32, side * (D / 2 + OV - 0.05));
  });

  // ==========================================
  // PORCHE
  // ==========================================

  const FZ = D / 2;

  // Plancher du porche + marches
  addBox(3.8, 0.2, 2.2, mWood, 0, F - 0.1, FZ + 1.1);
  addBox(3.7, 0.06, 2.1, mSnow, 0, F + 0.02, FZ + 1.1);
  addBox(1.8, 0.17, 0.5, mWood, 0, 0.085, FZ + 2.6);
  addBox(1.8, 0.34, 0.5, mWood, 0, 0.17, FZ + 2.2);
  addBox(1.7, 0.05, 0.42, mSnow, 0, 0.36, FZ + 2.2);

  // Poteaux et toit du porche
  [-1.7, 1.7].forEach(function (px) {
    addBox(0.15, 2.6, 0.15, mTrim, px, F + 1.3, FZ + 2.05);
  });
  mbox(4.2, 0.12, 2.7, mRoof, 0, F + 2.68, FZ + 1.2, 0.1);
  mbox(4.1, 0.2, 2.6, mSnow, 0, F + 2.82, FZ + 1.2, 0.1);

  // Lampe du porche (une seule vraie lumière : toute la façade en profite)
  addBox(0.18, 0.28, 0.16, mMetal, 1.0, F + 2.25, FZ + 0.1);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: disp(0.95, 0.78, 0.5) }));
  bulb.position.set(1.0, F + 2.22, FZ + 0.19);
  h.add(bulb);
  glowSprite(1.0, F + 2.2, FZ + 0.6, 0xffb870, 3.4, 0.55);

  // Le sol devant la maison est éclairé par le porche et par ses fenêtres (halos au sol : visibles de loin, sans coût)
  lightPool(h, 0.6, 0, FZ + 3.2, 8.5, 0xffa860, 0.34);
  lightPool(h, -3.4, 0, FZ + 3.0, 5.5, 0xffc888, 0.16);
  lightPool(h, 4.6, 0, FZ + 3.0, 5.5, 0xffc888, 0.16);

  if (opts.light !== false) {
    const light = new THREE.PointLight(0xffa860, 2.6, 26, 1.7);
    light.position.set(0.6, F + 2.1, FZ + 1.6);
    light.userData.keep = true;   // bedroom.js enlève les lumières de la rue, mais pas celle-ci
    h.add(light);
  }

  // ==========================================
  // ALLÉE, PARKING, PANNEAU, BOÎTE AUX LETTRES, CLÔTURE, BOIS, NEIGE
  // ==========================================

  addBox(1.7, 0.04, 4.2, mPath, 0, 0.0, FZ + 4.6);                  // allée déneigée jusqu'au porche
  addBox(9.5, 0.04, 5.4, mGravel, 0, -0.01, FZ + 5.5);               // aire de retournement au bout de la route

  // Panneau sur poteau
  addBox(0.13, 2.3, 0.13, mWood, 3.3, 1.15, FZ + 4.6);
  addBox(1.7, 0.9, 0.07, mTrim, 3.3, 2.0, FZ + 4.6);
  const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.78), new THREE.MeshBasicMaterial({ map: signTex }));
  signPlane.position.set(3.3, 2.0, FZ + 4.64);
  h.add(signPlane);
  addBox(1.75, 0.1, 0.16, mSnow, 3.3, 2.5, FZ + 4.6);

  // Boîte aux lettres
  addBox(0.1, 1.1, 0.1, mWood, -3.2, 0.55, FZ + 5.2);
  addBox(0.5, 0.3, 0.26, mMetal, -3.2, 1.2, FZ + 5.2);
  addBox(0.46, 0.06, 0.22, mSnow, -3.2, 1.38, FZ + 5.2);
  addBox(0.03, 0.2, 0.03, new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.7 }), -2.93, 1.3, FZ + 5.2);

  // Clôture basse de chaque côté de l'allée
  const fenceZ = FZ + 3.1;
  [[-9, -1.2], [1.2, 9]].forEach(function (run) {
    const len = run[1] - run[0], cx = (run[0] + run[1]) / 2;
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      addBox(0.09, 1.0, 0.09, mWood, run[0] + i * len / n, 0.5, fenceZ);
    }
    addBox(len, 0.06, 0.05, mWood, cx, 0.38, fenceZ);
    addBox(len, 0.06, 0.05, mWood, cx, 0.84, fenceZ);
    addBox(len, 0.06, 0.1, mSnow, cx, 0.9, fenceZ);
  });

  // Pile de bois contre le mur droit (bûches couchées, axe en x)
  const logGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 7);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const log = new THREE.Mesh(logGeo, mWood);
      log.rotation.z = Math.PI / 2;
      log.position.set(W / 2 + 0.55, 0.12 + r * 0.19, -3.4 + c * 0.2 + (r % 2) * 0.1);
      h.add(log);
    }
  }
  addBox(0.7, 0.07, 1.6, mSnow, W / 2 + 0.3, 0.9, -2.8);

  // Neige accumulée contre les murs
  const lumpGeo = new THREE.SphereGeometry(1, 8, 5);
  // (les congères restent à l'extérieur : le centre est à 1,5 m du mur et la plus grosse fait 0,9 m de rayon)
  for (let i = 0; i < 26; i++) {
    const t = i / 26 * Math.PI * 2;
    const rx = (W / 2 + 1.5), rz = (D / 2 + 1.5);
    const px = Math.cos(t) * rx + (rnd() - 0.5) * 0.5;
    const pz = Math.sin(t) * rz + (rnd() - 0.5) * 0.5;
    if (pz > FZ - 0.2 && Math.abs(px) < 3.2) continue;   // pas devant le porche
    const hh = 0.22 + rnd() * 0.25;
    const lump = new THREE.Mesh(lumpGeo, mSnow);
    lump.scale.set(0.5 + rnd() * 0.4, hh, 0.5 + rnd() * 0.4);
    lump.position.set(px, hh * 0.3 - 0.04, pz);
    h.add(lump);
  }

  // Fumée de cheminée (seulement quand le feu est allumé)
  const smoke = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTex, color: 0xb8bec4, transparent: true, opacity: 0, depthWrite: false
    }));
    sp.raycast = function () { };
    h.add(sp);
    smoke.push(sp);
  }
  const chimneyY = chTop + 0.3;

  // Barrière du porche : on monte par les marches seulement
  solid(0.95, 1.95, FZ + 0.1, FZ + 2.45);
  solid(-1.95, -0.95, FZ + 0.1, FZ + 2.45);
  const pile = { x0: W / 2 + 0.1, x1: W / 2 + 0.9, z0: -3.5, z1: -1.8 };
  solid(pile.x0, pile.x1, pile.z0, pile.z1);
  WALL_RECTS.push(pile);
  WALL_RECTS.push({ x0: 0.95, x1: 1.95, z0: FZ + 0.1, z1: FZ + 2.45 });
  WALL_RECTS.push({ x0: -1.95, x1: -0.95, z0: FZ + 0.1, z1: FZ + 2.45 });

  // ==========================================
  // OBJETS UTILISABLES (bouton d'action partagé + clic)
  // ==========================================
  // item = { rooms: [zones où l'on peut s'en servir], x, z (repère h), range, label(), fn() }

  const ITEMS = {};
  function addItem(id, o) { o.id = id; ITEMS[id] = o; return o; }

  // Sièges : on s'assoit en cliquant dessus (zone de clic invisible autour du meuble)
  const SITS = {};
  let sitHook = null;
  function addSit(id, o) {
    o.id = id;
    SITS[id] = o;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(o.hit.w, o.hit.h, o.hit.d), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.set(o.hit.x, F + o.hit.h / 2, o.hit.z);
    hit.userData.use = 'sit:' + id;
    h.add(hit);
    addItem('sit:' + id, {
      rooms: o.rooms, x: o.x, z: o.z, range: 1.9,
      enabled: function () { return !o.enabled || o.enabled(); },
      label: function () { return 'SIT'; },
      fn: function () { if (sitHook) sitHook(id); }
    });
  }

  // Portes de placard, tiroirs : t va de 0 (fermé) à 1 (ouvert), apply(e) pose les pièces
  const openables = [];
  function addOpenable(id, o) {
    const op = { id: id, t: 0, goal: 0, apply: o.apply };
    openables.push(op);
    addItem(id, {
      rooms: o.rooms, x: o.x, z: o.z, range: o.range || 2.2,
      label: function () { return op.goal ? 'CLOSE' : 'OPEN'; },
      fn: function () { op.goal = op.goal ? 0 : 1; }
    });
    return op;
  }

  // ==========================================
  // PORTES : battant pivotant, on voit à travers en direct, collision seulement quand elle est fermée
  // ==========================================

  const doors = {};
  function makeDoor(id, o) {
    const hingeX = o.hinge === 'min' ? o.cx - o.w / 2 + 0.02 : o.cx + o.w / 2 - 0.02;
    const freeSign = o.hinge === 'min' ? 1 : -1;
    const lw = o.w - 0.04, lh = o.hh - 0.03;
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, F + o.hh / 2, o.zc);
    pivot.userData.use = id;
    h.add(pivot);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.06), [mEdge, mEdge, mEdge, mEdge, o.mPlus, o.mMinus]);
    leaf.position.set(freeSign * lw / 2, 0, 0);
    pivot.add(leaf);
    [1, -1].forEach(function (side) {
      [0.45, -0.45].forEach(function (py) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.68, 0.8, 0.02), side > 0 ? o.pPlus : o.pMinus);
        p.position.set(freeSign * lw / 2, py, side * 0.035);
        pivot.add(p);
      });
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mBrass);
      knob.position.set(freeSign * (lw - 0.12), -0.08, side * 0.085);
      pivot.add(knob);
    });
    // zone de clic un peu plus large que la porte (plus facile à viser, surtout au doigt)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(o.w, lh, 0.4), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.set(o.cx - hingeX, 0, 0);
    pivot.add(hit);

    const d = { id: id, pivot: pivot, openT: 0, goal: 0, s: -o.dir * freeSign, cx: o.cx, zc: o.zc };
    d.rect = solid(o.cx - o.w / 2, o.cx + o.w / 2, o.zc - 0.06, o.zc + 0.06, function () { return d.openT < 0.35; });
    doors[id] = d;
    addItem(id, {
      rooms: o.rooms, x: o.cx, z: o.zc, range: o.range || 2.4,
      label: function () { return d.goal ? 'CLOSE' : 'OPEN'; },
      fn: function () { d.goal = d.goal ? 0 : 1; }
    });
    return d;
  }

  makeDoor('door:front', { zc: ZF, cx: 0, w: 1.1, hh: FRONT_H, hinge: 'min', dir: -1, range: 3.4, rooms: ['outside', 'waiting'],
    mPlus: mDoor, mMinus: woodMat('waiting'), pPlus: mWood, pMinus: rm('waiting', 0x5a3d28, { r: 0.7 }) });

  if (NEAR) {
    makeDoor('door:p1', { zc: Z_P1, cx: 0, w: 1.0, hh: DOOR_H, hinge: 'min', dir: 1, rooms: ['waiting', 'corridor'],
      mPlus: woodMat('waiting'), mMinus: woodMat('corridor'), pPlus: rm('waiting', 0x5a3d28, { r: 0.7 }), pMinus: rm('corridor', 0x5a3d28, { r: 0.7 }) });
    makeDoor('door:session', { zc: Z_P2, cx: -2.8, w: 1.0, hh: DOOR_H, hinge: 'min', dir: -1, rooms: ['corridor', 'session'],
      mPlus: woodMat('corridor'), mMinus: woodMat('session'), pPlus: rm('corridor', 0x5a3d28, { r: 0.7 }), pMinus: rm('session', 0x5a3d28, { r: 0.7 }) });
    makeDoor('door:bedroom', { zc: Z_P2, cx: 3.2, w: 1.0, hh: DOOR_H, hinge: 'max', dir: -1, rooms: ['corridor', 'bedroom'],
      mPlus: woodMat('corridor'), mMinus: woodMat('bedroom'), pPlus: rm('corridor', 0x5a3d28, { r: 0.7 }), pMinus: rm('bedroom', 0x5a3d28, { r: 0.7 }) });
  }

  // ==========================================
  // INTÉRIEUR (maison complète seulement)
  // ==========================================

  const lampBulbs = [];            // { mat, room }
  const lampGlows = [];            // { sp, room, base }
  const slots = [];                // les 20 livres lisibles : { mesh, data, glow, base, pages }
  const switches = {};
  const flames = [];
  let fireLight = null, followLight = null;
  let evPhone = null, evAvatar = null, mixer = null, avatar = null;
  let loadBooksFn = null;

  function loadInto(mat, urls) {
    let i = 0;
    (function next() {
      if (i >= urls.length) return;
      new THREE.TextureLoader().load(urls[i++], function (tex) {
        srgb(tex); mat.map = tex; mat.emissiveMap = tex; mat.needsUpdate = true;
      }, undefined, next);
    })();
  }

  // Tableaux d'Evelyn : peints à la volée. Si images/evelynpic1.jpg ... evelynpic5.jpg existent, ce sont elles qui s'affichent.
  //   evelynpic1 = le tableau de la chambre (paysage), evelynpic2..5 = les cadres du couloir (portrait)
  const PIC_BASE = 'images/evelynpic';
  function artTex(kind) {
    const land = kind === 1;
    const c = cv(land ? 320 : 220, land ? 220 : 290), x = c.getContext('2d'), W2 = c.width, H2 = c.height;
    if (kind === 1) {                                                // crépuscule sur la neige
      const sky = x.createLinearGradient(0, 0, 0, 130);
      sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(0.7, '#6a5a7a'); sky.addColorStop(1, '#e0a070');
      x.fillStyle = sky; x.fillRect(0, 0, 320, 220);
      x.fillStyle = '#f2e8c8'; x.beginPath(); x.arc(250, 48, 16, 0, 7); x.fill();
      x.fillStyle = 'rgba(40,50,80,0.9)';
      x.beginPath(); x.moveTo(0, 130); x.lineTo(70, 90); x.lineTo(130, 125); x.lineTo(200, 80); x.lineTo(320, 130); x.lineTo(320, 140); x.lineTo(0, 140); x.fill();
      x.fillStyle = '#dfe6ee'; x.fillRect(0, 135, 320, 85);
      for (let i = 0; i < 14; i++) {
        const px = 10 + i * 24 + rnd() * 10, py = 150 + rnd() * 50, s2 = 18 + rnd() * 22;
        x.fillStyle = '#0e1a22';
        x.beginPath(); x.moveTo(px, py - s2 * 2.2); x.lineTo(px - s2 * 0.7, py); x.lineTo(px + s2 * 0.7, py); x.fill();
      }
      x.fillStyle = '#2a1c14'; x.fillRect(120, 150, 60, 38);
      x.beginPath(); x.moveTo(114, 150); x.lineTo(150, 126); x.lineTo(186, 150); x.fill();
      x.fillStyle = '#ffc060'; x.fillRect(132, 160, 14, 14); x.fillRect(156, 160, 14, 14);
    } else if (kind === 2) {                                         // aplats abstraits
      x.fillStyle = '#e9dcc0'; x.fillRect(0, 0, W2, H2);
      const cols = ['#b5523b', '#2f4b6e', '#d6a84a', '#4e7a64'];
      for (let i = 0; i < 4; i++) { x.fillStyle = cols[i]; x.fillRect(20 + i * 12, 30 + i * 52, 120 + (i % 2) * 40, 44); }
      x.fillStyle = '#1c1a18'; x.beginPath(); x.arc(150, 80, 34, 0, 7); x.fill();
      x.strokeStyle = '#1c1a18'; x.lineWidth = 4; x.beginPath(); x.moveTo(30, 250); x.lineTo(190, 190); x.stroke();
    } else if (kind === 3) {                                         // phare dans la brume
      const sky = x.createLinearGradient(0, 0, 0, H2); sky.addColorStop(0, '#9fb0b8'); sky.addColorStop(1, '#4a5c68');
      x.fillStyle = sky; x.fillRect(0, 0, W2, H2);
      x.fillStyle = '#2c3a44'; x.fillRect(0, 210, W2, 80);
      x.fillStyle = '#e9e4da'; x.beginPath(); x.moveTo(95, 210); x.lineTo(125, 210); x.lineTo(118, 80); x.lineTo(102, 80); x.fill();
      x.fillStyle = '#b5523b'; x.fillRect(100, 120, 20, 14); x.fillRect(98, 165, 24, 14);
      x.fillStyle = '#2a2a2a'; x.fillRect(98, 66, 24, 14);
      x.fillStyle = 'rgba(255,230,150,0.55)'; x.beginPath(); x.moveTo(110, 73); x.lineTo(220, 40); x.lineTo(220, 110); x.fill();
    } else if (kind === 4) {                                         // lune sur l'eau
      const sky = x.createLinearGradient(0, 0, 0, H2); sky.addColorStop(0, '#0f1a30'); sky.addColorStop(0.6, '#2a3a5a'); sky.addColorStop(1, '#101a28');
      x.fillStyle = sky; x.fillRect(0, 0, W2, H2);
      x.fillStyle = '#f0ead0'; x.beginPath(); x.arc(110, 90, 30, 0, 7); x.fill();
      for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(240,234,208,' + (0.5 - i * 0.04) + ')'; x.fillRect(110 - 26 + i * 2, 170 + i * 9, 52 - i * 4, 3); }
      x.fillStyle = '#05080e'; x.beginPath(); x.moveTo(0, 168); x.lineTo(60, 150); x.lineTo(120, 168); x.lineTo(220, 156); x.lineTo(220, 290); x.lineTo(0, 290); x.fill();
      x.fillStyle = 'rgba(160,190,230,0.25)'; for (let i = 0; i < 16; i++) x.fillRect(rnd() * 200, 180 + rnd() * 100, 20 + rnd() * 40, 2);
    } else {                                                         // vase et fleurs
      x.fillStyle = '#d9c9a8'; x.fillRect(0, 0, W2, H2);
      x.fillStyle = '#8a6a48'; x.fillRect(0, 215, W2, 75);
      x.fillStyle = '#3f6a7a'; x.beginPath(); x.moveTo(85, 250); x.lineTo(135, 250); x.lineTo(145, 190); x.lineTo(75, 190); x.fill();
      x.strokeStyle = '#3a5a34'; x.lineWidth = 3;
      for (let i = 0; i < 7; i++) { const ex = 70 + i * 13, ey = 60 + (i % 3) * 22; x.beginPath(); x.moveTo(110, 192); x.lineTo(ex, ey); x.stroke();
        x.fillStyle = ['#c9503c', '#e8c24a', '#d889a8'][i % 3]; x.beginPath(); x.arc(ex, ey, 15, 0, 7); x.fill(); }
    }
    return srgb(new THREE.CanvasTexture(c));
  }
  // Les tableaux sont DÉJÀ peints (artTex). Un fichier images/evelynpicN.jpg|png|webp ne remplace la peinture que s'il existe vraiment.
  function loadPic(mat, n) {
    manifestFiles().then(function (set) {
      if (!set) return;                                            // manifest illisible : on garde la peinture, rien n'est demandé
      const urls = ['.jpg', '.png', '.webp'].map(function (e) { return PIC_BASE + n + e; }).filter(function (u) { return set.has(u); });
      if (urls.length) loadInto(mat, urls);
    });
  }

  function noticeTex() {
    const c = cv(400, 200), x = c.getContext('2d');
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 400, 200);
    x.strokeStyle = '#9a7a44'; x.lineWidth = 8; x.strokeRect(8, 8, 384, 184);
    x.strokeStyle = '#9a7a44'; x.lineWidth = 2; x.strokeRect(20, 20, 360, 160);
    x.fillStyle = '#3a2a1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 27px serif';
    x.fillText('EVELYN, THE THERAPIST,', 200, 62);
    x.fillText('WILL WELCOME YOU SOON.', 200, 98);
    x.font = 'italic 24px serif'; x.fillStyle = '#6a5236';
    x.fillText('Please wait.', 200, 146);
    return srgb(new THREE.CanvasTexture(c));
  }

  function lampMat() { return new THREE.MeshBasicMaterial({ color: 0x3a3228 }); }
  function ceilingLamp(room, x, z) {
    addCyl(0.2, 0.2, 0.05, 14, rm(room, 0xe8e0d0, { r: 0.8 }), x, CEIL - 0.045, z);
    const m = lampMat();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m);
    b.position.set(x, CEIL - 0.15, z);
    h.add(b);
    lampBulbs.push({ mat: m, room: room });
    const sp = glowSprite(x, CEIL - 0.25, z, 0xffd9a0, 1.8, 0);
    lampGlows.push({ sp: sp, room: room, base: 0.38 });
  }
  function lampShade(room, x, y, z, rTop, rBot, hh, glow) {
    const m = lampMat();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, hh, 12, 1, true), m);
    m.side = THREE.DoubleSide;
    s.position.set(x, y, z);
    h.add(s);
    lampBulbs.push({ mat: m, room: room });
    if (glow) lampGlows.push({ sp: glowSprite(x, y, z, 0xffd9a0, glow, 0), room: room, base: 0.3 });
  }

  function rug(room, x, z, w, d, color) { addBox(w, 0.02, d, rm(room, color, { r: 1 }), x, F + 0.03, z); }

  function armchair(room, x, z, yaw, mat) {
    const fb = furn(x, z, yaw), leg = rm(room, 0x1c1410, { r: 0.9 });
    [[-0.3, -0.26], [0.3, -0.26], [-0.3, 0.26], [0.3, 0.26]].forEach(function (p) { fb(0.06, 0.2, 0.06, leg, p[0], F + 0.1, p[1]); });
    fb(0.72, 0.2, 0.66, mat, 0, F + 0.3, 0);                          // caisse
    fb.r(0.5, 0.16, 0.56, 0.07, mat, 0, F + 0.48, 0.04);               // coussin d'assise
    fb.r(0.62, 0.62, 0.2, 0.09, mat, 0, F + 0.8, -0.27);               // dossier
    fb.r(0.16, 0.34, 0.66, 0.07, mat, -0.36, F + 0.55, 0);             // accoudoirs
    fb.r(0.16, 0.34, 0.66, 0.07, mat, 0.36, F + 0.55, 0);
  }

  // Plinthes, sans traverser les portes. gaps = [[a, b], ...] le long du mur
  function baseboard(room, axis, line, dirIn, a, b, gaps) {
    const m = rm(room, 0x4a362a, { r: 0.8 });
    let cur = a;
    (gaps || []).slice().sort(function (p, q) { return p[0] - q[0]; }).concat([[b, b]]).forEach(function (gp) {
      if (gp[0] - cur > 0.05) {
        const mid = (cur + gp[0]) / 2, len = gp[0] - cur;
        if (axis === 'x') addBox(len, 0.12, 0.03, m, mid, F + 0.07, line + dirIn * 0.015);
        else addBox(0.03, 0.12, len, m, line + dirIn * 0.015, F + 0.07, mid);
      }
      cur = gp[1];
    });
  }

  // Interrupteur : plaque + bascule (clic ou bouton). normal = -1 ou +1 selon le côté de la pièce
  function addSwitch(room, x, wallZ, normalZ) {
    const grp = new THREE.Group();
    grp.position.set(x, F + 1.3, wallZ + normalZ * 0.012);
    grp.rotation.y = normalZ > 0 ? 0 : Math.PI;
    grp.userData.use = 'light:' + room;
    h.add(grp);
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.02), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.6 })));
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.02), new THREE.MeshStandardMaterial({ color: 0xb8ad94, roughness: 0.6 }));
    rocker.position.z = 0.012;
    grp.add(rocker);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.2), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.z = 0.06;
    grp.add(hit);
    switches[room] = rocker;
    rocker.rotation.x = getLights()[room] ? 0.4 : -0.4;
    addItem('light:' + room, {
      rooms: [room], x: x, z: wallZ, range: 1.9,
      label: function () { return getLights()[room] ? 'SWITCH OFF' : 'SWITCH ON'; },
      fn: function () { setLight(room, !getLights()[room], 'player'); }
    });
  }

  if (NEAR) {

    // ── sols, plafonds, plinthes ──
    const floorMats = {
      waiting: rm('waiting', 0x9a7a58, { r: 0.8, map: plankTex, tile: [1, 1], mapId: 'p' }),
      corridor: rm('corridor', 0x6a5444, { r: 0.8, map: plankTex, tile: [1, 1], mapId: 'p' }),
      session: rm('session', 0x8a6644, { r: 0.8, map: plankTex, tile: [1, 1], mapId: 'p' }),
      bedroom: rm('bedroom', 0xa88a68, { r: 0.8, map: plankTex, tile: [1, 1], mapId: 'p' })
    };
    ROOM_IDS.forEach(function (id) {
      const r = ROOMS[id], cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
      addBox(w, 0.02, d, [mCap, mCap, floorMats[id], mCap, mCap, mCap], cx, F + 0.01, cz);
      addBox(w, 0.08, d, [mCap, mCap, mCap, rm(id, 0xe0d6c2, { r: 1 }), mCap, mCap], cx, CEIL + 0.02, cz);   // dessous à 2 cm sous le haut des murs
    });
    baseboard('waiting', 'x', IZ1, -1, IX0, IX1, [[-0.55, 0.55]]);
    baseboard('waiting', 'x', Z_P1 + PT / 2, 1, IX0, IX1, [[-0.5, 0.5]]);
    baseboard('waiting', 'z', IX0, 1, Z_P1 + PT / 2, IZ1);
    baseboard('waiting', 'z', IX1, -1, Z_P1 + PT / 2, IZ1);
    baseboard('corridor', 'x', Z_P1 - PT / 2, -1, IX0, IX1, [[-0.5, 0.5]]);
    baseboard('corridor', 'x', Z_P2 + PT / 2, 1, IX0, IX1, [[-3.3, -2.3], [2.7, 3.7]]);
    baseboard('corridor', 'z', IX0, 1, Z_P2 + PT / 2, Z_P1 - PT / 2);
    baseboard('corridor', 'z', IX1, -1, Z_P2 + PT / 2, Z_P1 - PT / 2);
    baseboard('session', 'x', IZ0, 1, IX0, X_P3 - PT / 2, [[FIRE.x - 0.55, FIRE.x + 0.55]]);
    baseboard('session', 'x', Z_P2 - PT / 2, -1, IX0, X_P3 - PT / 2, [[-3.3, -2.3]]);
    baseboard('session', 'z', X_P3 - PT / 2, -1, IZ0, Z_P2 - PT / 2);
    baseboard('bedroom', 'x', IZ0, 1, X_P3 + PT / 2, IX1);
    baseboard('bedroom', 'x', Z_P2 - PT / 2, -1, X_P3 + PT / 2, IX1, [[2.7, 3.7]]);
    baseboard('bedroom', 'z', X_P3 + PT / 2, 1, IZ0, Z_P2 - PT / 2);
    baseboard('bedroom', 'z', IX1, -1, IZ0, Z_P2 - PT / 2);

    // ── plafonniers + interrupteurs ──
    ceilingLamp('waiting', -3.0, 3.0); ceilingLamp('waiting', 3.0, 3.0);
    ceilingLamp('corridor', -3.5, 0.4); ceilingLamp('corridor', 0, 0.4); ceilingLamp('corridor', 3.5, 0.4);
    ceilingLamp('session', -2.6, -2.7);
    ceilingLamp('bedroom', 3.1, -2.7);
    addSwitch('waiting', 1.3, IZ1, -1);
    addSwitch('corridor', 0.95, Z_P1 - PT / 2, -1);
    addSwitch('session', -1.9, Z_P2 - PT / 2, -1);
    addSwitch('bedroom', 4.2, Z_P2 - PT / 2, -1);

    // ═════════ SALLE D'ATTENTE ═════════
    const sofaM = rm('waiting', 0x4b5a5e, { r: 0.95 }), sofaC = rm('waiting', 0x5f7176, { r: 0.95 }), leatherW = rm('waiting', 0x6a3f2c, { r: 0.7 });
    const woodW = rm('waiting', 0x6a4a30, { r: 0.7 }), woodDarkW = rm('waiting', 0x1c1410, { r: 0.9 });
    rug('waiting', -3.8, 3.0, 2.8, 1.9, 0x6a3a3a);
    (function () {                                                    // canapé contre le mur gauche, face à +x
      const fb = furn(-5.15, 3.0, Math.PI / 2);
      fb(2.2, 0.12, 0.84, woodDarkW, 0, F + 0.06, 0);
      fb(2.2, 0.26, 0.84, sofaM, 0, F + 0.25, 0);
      fb.r(1.0, 0.2, 0.7, 0.07, sofaC, -0.5, F + 0.46, 0.06);
      fb.r(1.0, 0.2, 0.7, 0.07, sofaC, 0.5, F + 0.46, 0.06);
      fb.r(1.0, 0.5, 0.2, 0.09, sofaM, -0.5, F + 0.78, -0.32);
      fb.r(1.0, 0.5, 0.2, 0.09, sofaM, 0.5, F + 0.78, -0.32);
      fb.r(0.2, 0.36, 0.84, 0.08, sofaM, -1.1, F + 0.5, 0);
      fb.r(0.2, 0.36, 0.84, 0.08, sofaM, 1.1, F + 0.5, 0);
      solid(-5.6, -4.7, 1.9, 4.1);
    })();
    addSit('sofaA', { x: -5.0, z: 2.5, dir: [1, 0], eye: 1.05, rooms: ['waiting'], stand: { x: 0.95, z: 0 }, hit: { w: 1.0, h: 1.0, d: 1.05, x: -5.15, z: 2.5 } });
    addSit('sofaB', { x: -5.0, z: 3.5, dir: [1, 0], eye: 1.05, rooms: ['waiting'], stand: { x: 0.95, z: 0 }, hit: { w: 1.0, h: 1.0, d: 1.05, x: -5.15, z: 3.5 } });
    armchair('waiting', 5.1, 3.0, -Math.PI / 2, leatherW);
    solid(4.7, 5.5, 2.6, 3.4);
    addSit('wArm', { x: 5.1, z: 3.0, dir: [-1, 0], eye: 1.05, rooms: ['waiting'], stand: { x: -0.95, z: 0 }, hit: { w: 0.9, h: 1.1, d: 0.9, x: 5.1, z: 3.0 } });
    (function () {                                                    // table basse + magazines
      const fb = furn(-3.8, 3.0, 0);
      fb.r(1.1, 0.06, 0.6, 0.02, woodW, 0, F + 0.43, 0);
      [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(function (p) { fb(0.05, 0.4, 0.05, woodW, p[0], F + 0.2, p[1]); });
      fb(0.3, 0.02, 0.22, rm('waiting', 0xb44a3a, { r: 0.9 }), -0.2, F + 0.465, 0.05);
      fb(0.28, 0.02, 0.2, rm('waiting', 0x3a5a8a, { r: 0.9 }), -0.18, F + 0.485, 0.04);
      solid(-4.4, -3.2, 2.65, 3.35);
    })();
    (function () {                                                    // plante
      addCyl(0.2, 0.15, 0.4, 12, rm('waiting', 0x7a4a34, { r: 0.9 }), -5.2, F + 0.2, 4.3);
      addSphere(0.42, rm('waiting', 0x2f5a34, { r: 1 }), -5.2, F + 0.85, 4.3, 1, 1.2, 1, 14);
      addSphere(0.28, rm('waiting', 0x3a6a3c, { r: 1 }), -5.0, F + 1.2, 4.35, 1, 1, 1, 14);
      solid(-5.5, -4.9, 4.0, 4.6);
    })();
    (function () {                                                    // petite console + lampe, à droite de la porte d'entrée
      addBox(0.9, 0.05, 0.36, woodW, 2.6, F + 0.8, 4.5);
      addBox(0.05, 0.78, 0.32, woodW, 2.2, F + 0.4, 4.5); addBox(0.05, 0.78, 0.32, woodW, 3.0, F + 0.4, 4.5);
      lampShade('waiting', 2.6, F + 1.1, 4.5, 0.1, 0.17, 0.22, 1.4);
      addBox(0.05, 0.2, 0.05, woodDarkW, 2.6, F + 0.92, 4.5);
      solid(2.1, 3.1, 4.3, 4.7);
    })();
    (function () {                                                    // pancarte d'accueil + horloge, côté cloison
      const pm = paintMat('waiting', noticeTex());
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), pm);
      poster.position.set(-2.3, F + 1.8, Z_P1 + PT / 2 + 0.012);
      h.add(poster);
      const gold = rm('waiting', 0x9a7a44, { r: 0.5 });
      addBox(1.18, 0.04, 0.03, gold, -2.3, F + 2.1, Z_P1 + PT / 2 + 0.014); addBox(1.18, 0.04, 0.03, gold, -2.3, F + 1.5, Z_P1 + PT / 2 + 0.014);
      addBox(0.04, 0.64, 0.03, gold, -2.3 - 0.57, F + 1.8, Z_P1 + PT / 2 + 0.014); addBox(0.04, 0.64, 0.03, gold, -2.3 + 0.57, F + 1.8, Z_P1 + PT / 2 + 0.014);
      const clockGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20);
      clockGeo.rotateX(Math.PI / 2);
      addGeo(clockGeo, rm('waiting', 0xe8e0cc, { r: 0.6 }), 0, F + 2.6, Z_P1 + PT / 2 + 0.03, 0);
      addBox(0.02, 0.15, 0.02, rm('waiting', 0x1a1410), 0, F + 2.65, Z_P1 + PT / 2 + 0.06);
      addBox(0.1, 0.02, 0.02, rm('waiting', 0x1a1410), 0.04, F + 2.6, Z_P1 + PT / 2 + 0.06);
    })();

    // ═════════ COULOIR ═════════
    rug('corridor', 0, 0.4, 8.5, 0.8, 0x5a2a2a);
    (function () {
      const bn = rm('corridor', 0x5a4030, { r: 0.8 });
      addBox(1.3, 0.06, 0.4, bn, -4.8, F + 0.45, 1.02);
      addBox(0.05, 0.43, 0.36, bn, -5.38, F + 0.22, 1.02); addBox(0.05, 0.43, 0.36, bn, -4.22, F + 0.22, 1.02);
      solid(-5.45, -4.15, 0.82, 1.225);
      addSit('bench', { x: -4.8, z: 1.0, dir: [0, -1], eye: 1.0, rooms: ['corridor'], stand: { x: 0, z: -0.8 }, hit: { w: 1.4, h: 0.9, d: 0.6, x: -4.8, z: 1.02 } });
      addBox(1.0, 0.05, 0.35, bn, 4.9, F + 0.8, -0.25);                // console + vase
      addBox(0.05, 0.78, 0.3, bn, 4.45, F + 0.4, -0.25); addBox(0.05, 0.78, 0.3, bn, 5.35, F + 0.4, -0.25);
      addCyl(0.07, 0.05, 0.28, 10, rm('corridor', 0x7a9aa8, { r: 0.4 }), 4.9, F + 0.97, -0.25);
      solid(4.4, 5.4, -0.425, -0.07);
    })();
    // cadres du couloir : images/evelynpic2.jpg ... evelynpic5.jpg (sinon tableaux peints à la volée)
    [[-3.2, Z_P1 - PT / 2 - 0.012, 2, Math.PI], [3.2, Z_P1 - PT / 2 - 0.012, 3, Math.PI],
     [0.2, Z_P2 + PT / 2 + 0.012, 4, 0], [-4.6, Z_P2 + PT / 2 + 0.012, 5, 0]].forEach(function (f) {
      const fm = paintMat('corridor', artTex(f[2]));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), fm);
      pic.position.set(f[0], F + 1.7, f[1]);
      pic.rotation.y = f[3];
      h.add(pic);
      const gold = rm('corridor', 0xb89040, { r: 0.5 }), dz = f[3] === 0 ? 0.012 : -0.012;
      addBox(0.7, 0.04, 0.03, gold, f[0], F + 2.12, f[1] + dz); addBox(0.7, 0.04, 0.03, gold, f[0], F + 1.28, f[1] + dz);
      addBox(0.04, 0.88, 0.03, gold, f[0] - 0.33, F + 1.7, f[1] + dz); addBox(0.04, 0.88, 0.03, gold, f[0] + 0.33, F + 1.7, f[1] + dz);
      loadPic(fm, f[2]);
    });

    // ═════════ SALLE DE SÉANCE ═════════
    const leather = rm('session', 0x3a2a22, { r: 0.7 }), woodDark = rm('session', 0x1c1410, { r: 0.9 });
    const mTable = rm('session', 0x6a4a30, { r: 0.8 }), mShelf = rm('session', 0x3d2c20, { r: 0.9 }), stone = rm('session', 0x7a746c, { r: 1 });
    rug('session', -1.2, -2.6, 3.2, 2.6, 0x5b2a2a);
    armchair('session', CHAIR.x, CHAIR.z, 0, leather);
    solid(CHAIR.x - 0.4, CHAIR.x + 0.4, CHAIR.z - 0.4, CHAIR.z + 0.4);

    (function () {                                                    // chaise du joueur (face à -z)
      const fb = furn(SEAT.x, SEAT.z, Math.PI), mSeat = rm('session', 0x4a3322, { r: 0.8 }), cush = rm('session', 0x6a2f2f, { r: 0.9 });
      fb(0.5, 0.05, 0.48, mSeat, 0, F + 0.44, 0);
      fb.r(0.44, 0.07, 0.42, 0.03, cush, 0, F + 0.5, 0.01);
      [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(function (p) { fb(0.05, 0.42, 0.05, woodDark, p[0], F + 0.21, p[1]); });
      [[-0.21, -0.2], [0.21, -0.2]].forEach(function (p) { fb(0.04, 0.5, 0.04, woodDark, p[0], F + 0.7, p[1] - 0.02); });   // montants du dossier
      fb(0.46, 0.06, 0.04, mSeat, 0, F + 0.93, -0.22);
      [-0.12, 0, 0.12].forEach(function (dx) { fb(0.05, 0.34, 0.025, mSeat, dx, F + 0.72, -0.22); });
      solid(SEAT.x - 0.32, SEAT.x + 0.32, SEAT.z - 0.32, SEAT.z + 0.32);
      addSit('seat', {
        x: SEAT.x, z: SEAT.z, dir: [0, -1], eye: 1.15, rooms: ['session'], stand: { x: 0.8, z: 0 }, talk: true,
        enabled: function () { return evelynHome(); },
        hit: { w: 0.7, h: 1.1, d: 0.7, x: SEAT.x, z: SEAT.z }
      });
    })();

    // bureau (la table devant Evelyn)
    addBox(TABLE.w, 0.05, TABLE.d, mTable, TABLE.x, F + 0.75, TABLE.z);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      addBox(0.06, 0.73, 0.06, woodDark, TABLE.x + s[0] * (TABLE.w / 2 - 0.07), F + 0.365, TABLE.z + s[1] * (TABLE.d / 2 - 0.07));
    });
    addBox(TABLE.w - 0.14, 0.08, 0.03, mTable, TABLE.x, F + 0.68, TABLE.z - TABLE.d / 2 + 0.07);
    solid(TABLE.x - TABLE.w / 2, TABLE.x + TABLE.w / 2, TABLE.z - TABLE.d / 2, TABLE.z + TABLE.d / 2);
    addBox(0.26, 0.015, 0.34, rm('session', 0xd9cdb0, { r: 1 }), TABLE.x - 0.35, F + 0.785, TABLE.z + 0.05, 0.2);   // carnet
    addBox(0.14, 0.01, 0.012, rm('session', 0x111111, { r: 0.6 }), TABLE.x - 0.2, F + 0.797, TABLE.z + 0.05, 0.5);   // stylo
    addCyl(0.04, 0.035, 0.09, 10, rm('session', 0xcfc7b8, { r: 0.6 }), TABLE.x + 0.3, F + 0.82, TABLE.z - 0.1);       // tasse
    addBox(0.12, 0.02, 0.12, woodDark, TABLE.x - 0.7, F + 0.785, TABLE.z + 0.15);                                       // lampe de bureau
    addBox(0.02, 0.28, 0.02, woodDark, TABLE.x - 0.7, F + 0.93, TABLE.z + 0.15);
    lampShade('session', TABLE.x - 0.7, F + 1.12, TABLE.z + 0.15, 0.06, 0.12, 0.14, 1.0);

    // table d'appoint + lampe, contre la cloison
    addBox(0.5, 0.55, 0.5, mShelf, -0.05, F + 0.28, -4.35);
    addBox(0.06, 0.3, 0.06, woodDark, -0.05, F + 0.7, -4.35);
    lampShade('session', -0.05, F + 0.98, -4.35, 0.14, 0.22, 0.26, 1.6);
    solid(-0.3, 0.2, -4.6, -4.1);

    // fauteuil de lecture près du feu
    armchair('session', -4.6, -3.1, 2.5, rm('session', 0x4a2e2a, { r: 0.8 }));
    solid(-5.0, -4.2, -3.5, -2.7);
    addSit('readArm', { x: -4.6, z: -3.1, dir: [Math.sin(2.5), Math.cos(2.5)], eye: 1.05, rooms: ['session'], stand: { x: 0.2, z: 0.95 }, hit: { w: 0.9, h: 1.1, d: 0.9, x: -4.6, z: -3.1 } });

    // ── étagère (mur gauche) ──
    const SH_X0 = IX0, SH_Z0 = SH.z0, SH_Z1 = SH.z1, SH_D = SH.d, ROW_H = 0.55, ROW_Y0 = F + 0.08;
    addBox(0.03, 2.34, SH_Z1 - SH_Z0, mShelf, SH_X0 + 0.02, F + 1.17, (SH_Z0 + SH_Z1) / 2);
    addBox(SH_D, 2.34, 0.04, mShelf, SH_X0 + SH_D / 2, F + 1.17, SH_Z0 + 0.02);
    addBox(SH_D, 2.34, 0.04, mShelf, SH_X0 + SH_D / 2, F + 1.17, SH_Z1 - 0.02);
    for (let r = 0; r <= 4; r++) addBox(SH_D, 0.04, SH_Z1 - SH_Z0, mShelf, SH_X0 + SH_D / 2, ROW_Y0 + r * ROW_H, (SH_Z0 + SH_Z1) / 2);
    solid(SH_X0 - 0.2, SH_X0 + SH_D, SH_Z0, SH_Z1);

    function spineTexture(color, accent) {
      const c = cv(32, 128), x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, 32, 128);
      x.fillStyle = accent;
      x.fillRect(0, 10, 32, 3); x.fillRect(0, 17, 32, 1); x.fillRect(0, 110, 32, 1); x.fillRect(0, 115, 32, 3);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 0, 4, 128); x.fillRect(28, 0, 4, 128);
      return srgb(new THREE.CanvasTexture(c));
    }
    const DECOR_COLS = [0x5e2323, 0x27415c, 0x39503a, 0x7a5d27, 0x4d3359, 0x5a3d30, 0x2f2f36, 0x6b4a33];
    const rs = (function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(77031);
    for (let r = 0; r < 4; r++) {
      const y0 = ROW_Y0 + r * ROW_H + 0.02;
      const zStart = SH_Z0 + 0.08, zEnd = SH_Z1 - 0.08, span = zEnd - zStart;
      const targets = [0.08, 0.28, 0.48, 0.68, 0.88].map(function (f) { return zStart + span * f; });
      let z = zStart, t = 0;
      while (z < zEnd - 0.04) {
        let isSlot = false, thick, bh;
        if (t < targets.length && z >= targets[t]) { isSlot = true; thick = 0.085; bh = 0.42; }
        else { thick = 0.045 + rs() * 0.055; bh = 0.28 + rs() * 0.14; }
        if (z + thick > zEnd) break;
        const bx = SH_X0 + 0.04 + 0.11 + (isSlot ? 0.02 : 0);
        if (isSlot) {
          const col = '#3a3a3e';
          const spineMap = spineTexture(col, '#8a8a8a');
          const spine = new THREE.MeshStandardMaterial({ map: spineMap, emissiveMap: spineMap, color: new THREE.Color(ALB, ALB, ALB), roughness: 0.8 });
          const cover = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3a3a3e).multiplyScalar(ALB), roughness: 0.85 });
          const top = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd9cdb0).multiplyScalar(ALB), roughness: 1 });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, bh, thick), [spine, cover, top, top, cover, cover]);
          mesh.position.set(bx, y0 + bh / 2, z + thick / 2);
          mesh.userData.use = 'book';
          mesh.userData.idx = r * 5 + t;
          h.add(mesh);
          slots[r * 5 + t] = { mesh: mesh, mats: [spine, cover, top], data: null, glow: 0, base: new THREE.Color(0x3a3a3e) };
          t++;
        } else {
          addBox(0.22, bh, thick, rm('session', DECOR_COLS[Math.floor(rs() * DECOR_COLS.length)], { r: 0.85 }), bx, y0 + bh / 2, z + thick / 2);
        }
        z += thick + 0.004;
      }
    }

    let booksPromise = null;
    function loadBooks() {
      if (booksPromise) return booksPromise;
      booksPromise = manifestFiles().then(function (set) {
        const jobs = [];
        for (let i = 0; i < BOOK_COUNT; i++) {
          const name = BOOK_DIR + 'book' + (i < 9 ? '0' : '') + (i + 1) + '.json';
          if (set && !set.has(name)) { jobs.push(Promise.resolve(null)); continue; }          // livre pas encore écrit : on ne le demande pas
          jobs.push(fetch(name).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
        }
        return Promise.all(jobs);
      }).then(function (list) {
        list.forEach(function (d, i) {
          const s = slots[i];
          if (!s || !d || !Array.isArray(d.pages)) return;
          const c = d.cover || {};
          const color = c.color || '#7c2431', accent = c.accent || '#d6ae5c';
          s.mats[0].map = spineTexture(color, accent);
          s.mats[0].emissiveMap = s.mats[0].map;
          s.mats[0].needsUpdate = true;
          s.mats[1].color.set(color).multiplyScalar(ALB);
          s.base.set(color);
          s.data = d;
        });
      });
      return booksPromise;
    }
    loadBooksFn = loadBooks;

    // ── cheminée (mur du fond, sous le conduit) ──
    (function () {
      const fz = IZ0;
      [-1, 1].forEach(function (s) { addBox(0.25, 1.15, 0.4, stone, FIRE.x + s * (FIRE.w / 2 + 0.125), F + 0.575, fz + 0.2); });
      addBox(FIRE.w + 0.5, 0.2, 0.4, stone, FIRE.x, F + 1.05, fz + 0.2);
      addBox(FIRE.w + 0.8, 0.07, 0.5, mTable, FIRE.x, F + 1.2, fz + 0.25);
      addBox(FIRE.w + 0.9, 0.06, 0.6, stone, FIRE.x, F + 0.03, fz + 0.3);
      addBox(FIRE.w, 0.95, 0.02, new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 1 }), FIRE.x, F + 0.475, -4.96);   // fond noirci
      solid(FIRE.x - 0.95, FIRE.x + 0.95, fz, fz + 0.55);
      const mLog = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 1 });
      [[-0.18, 0.1, 0.1], [0.15, 0.1, -0.1], [0, 0.2, 0.04]].forEach(function (l, i) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 7), mLog);
        lg.rotation.z = Math.PI / 2; lg.rotation.y = l[2];
        lg.position.set(FIRE.x + l[0], F + l[1] - (i === 2 ? 0 : 0.03), -4.78);
        h.add(lg);
      });
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i === 0 ? 0xffd070 : 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.position.set(FIRE.x + (i - 1.5) * 0.14, F + 0.3, -4.8);
        sp.raycast = function () { };
        h.add(sp);
        flames.push({ sp: sp, ph: i * 1.7, x: FIRE.x + (i - 1.5) * 0.14 });
      }
      addItem('fire', {
        rooms: ['session'], x: FIRE.x, z: -4.1, range: 2.6,
        label: function () { return getLights().fire ? 'PUT OUT FIRE' : 'LIGHT FIRE'; },
        fn: function () { setLight('fire', !getLights().fire, 'player'); }
      });
    })();

    // ═════════ CHAMBRE D'EVELYN ═════════
    (function () {
      const bx0 = BED.x, hz0 = IZ0 + 0.04;                            // tête du lit contre le mur du fond
      const frameM = rm('bedroom', 0x7a5636, { r: 0.7 }), sheet = rm('bedroom', 0xeee6dc, { r: 1 });
      const duvet = rm('bedroom', 0xf0e6e0, { r: 1, map: blanketTex, tile: [0.8, 0.8], mapId: 'b' });
      const fold = rm('bedroom', 0xd8cdc6, { r: 1 }), pillowM = rm('bedroom', 0xf8f2ea, { r: 1 }), cushionM = rm('bedroom', 0x6f8aa6, { r: 1 });

      // lit : pieds, cadre, tête de lit haute aux angles arrondis, pied de lit bas, matelas rebondi, couette, oreillers
      [[-0.78, 0.04], [0.78, 0.04], [-0.78, 2.14], [0.78, 2.14]].forEach(function (p) { addBox(0.09, 0.2, 0.09, frameM, bx0 + p[0], F + 0.1, hz0 + p[1]); });
      addBox(1.64, 0.16, 2.14, frameM, bx0, F + 0.28, hz0 + 1.09);
      addRBox(1.74, 1.0, 0.08, 0.12, frameM, bx0, F + 0.82, hz0 + 0.04);
      addRBox(1.68, 0.42, 0.07, 0.09, frameM, bx0, F + 0.5, hz0 + 2.14);
      addRBox(1.54, 0.28, 2.04, 0.12, sheet, bx0, F + 0.5, hz0 + 1.08);             // matelas
      addRBox(1.64, 0.15, 1.4, 0.07, duvet, bx0, F + 0.7, hz0 + 1.45);                // couette
      addRBox(1.66, 0.1, 0.3, 0.05, fold, bx0, F + 0.77, hz0 + 0.82);                 // rabat
      addSphere(0.3, pillowM, bx0 - 0.4, F + 0.72, hz0 + 0.4, 1.2, 0.4, 0.82, 16);
      addSphere(0.3, pillowM, bx0 + 0.4, F + 0.72, hz0 + 0.4, 1.2, 0.4, 0.82, 16);
      addSphere(0.2, cushionM, bx0, F + 0.76, hz0 + 0.62, 1.15, 0.45, 0.8, 14);
      solid(bx0 - 0.85, bx0 + 0.85, IZ0, IZ0 + 2.2);

      // table de chevet : caisson ouvert devant + tiroir qui coulisse
      const nx = NIGHT.x, nz = NIGHT.z, nm = rm('bedroom', 0x7a5a3c, { r: 0.75 });
      addBox(0.03, 0.56, 0.46, nm, nx - 0.235, F + 0.28, nz);
      addBox(0.03, 0.56, 0.46, nm, nx + 0.235, F + 0.28, nz);
      addBox(0.5, 0.56, 0.03, nm, nx, F + 0.28, nz - 0.215);
      addBox(0.53, 0.04, 0.48, nm, nx, F + 0.58, nz);
      addBox(0.44, 0.03, 0.42, nm, nx, F + 0.09, nz);
      addBox(0.44, 0.02, 0.42, nm, nx, F + 0.33, nz);
      addRBox(0.2, 0.2, 0.16, 0.03, rm('bedroom', 0x6a4a5a, { r: 0.9 }), nx - 0.1, F + 0.22, nz - 0.05);   // un livre rangé dans le casier du bas
      solid(nx - 0.27, nx + 0.27, nz - 0.25, nz + 0.25);
      addBox(0.05, 0.2, 0.05, woodDark, nx + 0.15, F + 0.7, nz - 0.1);
      lampShade('bedroom', nx + 0.15, F + 0.9, nz - 0.1, 0.08, 0.14, 0.18, 1.2);
      const drawer = new THREE.Group();
      drawer.position.set(nx, F + 0.45, nz + 0.2);
      h.add(drawer);
      mbox(0.44, 0.15, 0.03, nm, 0, 0, 0.025, 0, drawer);                              // façade
      mbox(0.04, 0.03, 0.04, mBrass, 0, 0.0, 0.06, 0, drawer);                          // bouton
      mbox(0.4, 0.015, 0.34, nm, 0, -0.06, -0.15, 0, drawer);                           // fond
      mbox(0.015, 0.1, 0.34, nm, -0.2, -0.01, -0.15, 0, drawer);
      mbox(0.015, 0.1, 0.34, nm, 0.2, -0.01, -0.15, 0, drawer);
      mbox(0.4, 0.1, 0.015, nm, 0, -0.01, -0.32, 0, drawer);
      mbox(0.12, 0.012, 0.09, rm('bedroom', 0xe8e0cc, { r: 1 }), -0.08, -0.05, -0.12, 0.1, drawer);   // une photo
      mbox(0.1, 0.02, 0.02, rm('bedroom', 0x3a2a20, { r: 0.8 }), 0.08, -0.05, -0.2, 0, drawer);       // un stylo
      drawer.children.forEach(function (c) { c.userData.use = 'drawer'; });
      const drawerOp = addOpenable('drawer', {
        rooms: ['bedroom'], x: nx, z: nz + 0.2, range: 2.2,
        apply: function (e) { drawer.position.z = nz + 0.2 + 0.28 * e; }
      });

      // armoire contre la cloison : caisson creux, deux portes battantes, penderie
      const wm = rm('bedroom', 0x6a5238, { r: 0.8 }), WX0 = X_P3 + PT / 2, WX1 = WX0 + 0.56, WZ0 = -2.4, WZ1 = -1.1;
      addBox(0.03, 2.1, WZ1 - WZ0, wm, WX0 + 0.015, F + 1.05, (WZ0 + WZ1) / 2);
      addBox(WX1 - WX0, 2.1, 0.03, wm, (WX0 + WX1) / 2, F + 1.05, WZ0 + 0.015);
      addBox(WX1 - WX0, 2.1, 0.03, wm, (WX0 + WX1) / 2, F + 1.05, WZ1 - 0.015);
      addBox(WX1 - WX0, 0.04, WZ1 - WZ0, wm, (WX0 + WX1) / 2, F + 2.08, (WZ0 + WZ1) / 2);
      addBox(WX1 - WX0, 0.08, WZ1 - WZ0, wm, (WX0 + WX1) / 2, F + 0.04, (WZ0 + WZ1) / 2);
      addBox(WX1 - WX0 - 0.04, 0.03, WZ1 - WZ0 - 0.06, wm, (WX0 + WX1) / 2, F + 1.72, (WZ0 + WZ1) / 2);   // tablette
      addBox(0.02, 0.02, WZ1 - WZ0 - 0.1, mMetal, (WX0 + WX1) / 2, F + 1.64, (WZ0 + WZ1) / 2);           // barre
      const clothCols = [0x3f4a56, 0x8a3a3a, 0xd8cdb8, 0x4a5a46, 0x2a2a30, 0x7a6a8a, 0xb89a6a];
      for (let i = 0; i < 7; i++) {
        addBox(0.34, 0.78 + (i % 3) * 0.06, 0.05, rm('bedroom', clothCols[i], { r: 1 }), (WX0 + WX1) / 2, F + 1.2 - (i % 3) * 0.03, WZ0 + 0.14 + i * 0.16);
      }
      solid(WX0, WX1, WZ0, WZ1);
      const wDoors = [];
      [{ hz: WZ0, dir: 1, th: 1 }, { hz: WZ1, dir: -1, th: -1 }].forEach(function (d) {
        const pv = new THREE.Group();
        pv.position.set(WX1 + 0.005, F + 1.05, d.hz);
        h.add(pv);
        const leaf = mbox(0.025, 2.06, 0.64, wm, 0, 0, d.dir * 0.32, 0, pv);
        const grip = mbox(0.03, 0.2, 0.03, mBrass, 0.02, 0, d.dir * 0.58, 0, pv);
        pv.children.forEach(function (c) { c.userData.use = 'wardrobe'; });
        wDoors.push({ pv: pv, th: d.th });
      });
      addOpenable('wardrobe', {
        rooms: ['bedroom'], x: WX1 + 0.4, z: -1.75, range: 2.4,
        apply: function (e) { wDoors.forEach(function (w) { w.pv.rotation.y = w.th * 1.95 * e; }); }
      });

      rug('bedroom', 2.6, -2.7, 2.2, 1.6, 0x4a5a70);

      // tableau au-dessus du lit : images/evelynpic1.jpg, sinon peinture à la volée
      const pm = paintMat('bedroom', artTex(1));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.76), pm);
      pic.position.set(bx0, F + 1.95, IZ0 + 0.03);
      h.add(pic);
      const gold = rm('bedroom', 0x9a7a3a, { r: 0.5 });
      addBox(1.2, 0.07, 0.04, gold, bx0, F + 2.36, IZ0 + 0.02); addBox(1.2, 0.07, 0.04, gold, bx0, F + 1.54, IZ0 + 0.02);
      addBox(0.07, 0.82, 0.04, gold, bx0 - 0.575, F + 1.95, IZ0 + 0.02); addBox(0.07, 0.82, 0.04, gold, bx0 + 0.575, F + 1.95, IZ0 + 0.02);
      loadPic(pm, 1);

      // carnet intime sur la table de chevet
      const note = new THREE.Group();
      note.position.set(nx - 0.08, F + 0.6, nz + 0.02);
      note.rotation.y = 0.35;
      note.userData.use = 'diary';
      h.add(note);
      const nmat = new THREE.MeshStandardMaterial({ color: 0x1f4a52, roughness: 0.6 });
      note.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.28), nmat));
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.037, 0.28), new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.5 }));
      strip.position.x = 0.07;
      note.add(strip);
      const nhit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.45), new THREE.MeshBasicMaterial());
      nhit.visible = false;
      note.add(nhit);
      addItem('diary', {
        rooms: ['bedroom'], x: nx, z: nz, range: 2.4,
        label: function () { return 'READ NOTEBOOK'; },
        fn: function () { getEvelynJournal().open(); }
      });
    })();
  }

  // Tout ce qui est fixe est fusionné en quelques gros objets
  flushStatic();

  // ==========================================
  // VIE DE LA MAISON : lumières, feu, fumée
  // ==========================================

  const dirty = { waiting: true, corridor: true, session: true, bedroom: true };
  let fireBonus = 0, firstLights = true;
  const pagesColor = new THREE.Color(0xd9cdb0);
  let interiorUpdate = null, bubbleOn = false;
  let floorRiseFn = function () { return 0; };

  function applyRoom(room) {
    const s = E_OFF + (E_ON - E_OFF) * K[room] + (room === 'session' ? fireBonus : 0);
    const reg = REG[room];
    for (let i = 0; i < reg.length; i++) reg[i].mat.emissive.copy(reg[i].base).multiply(WARM).multiplyScalar(s * reg[i].k);
  }

  const bulbOff = new THREE.Color(0x3a3228), bulbOn = disp(1.0, 0.9, 0.68), _c = new THREE.Color();

  function stepLights(dt, time) {
    const L = getLights();
    let changed = firstLights;
    firstLights = false;
    ROOM_IDS.forEach(function (r) {
      const target = L[r] ? 1 : 0;
      if (K[r] !== target) {
        K[r] += (target - K[r]) * Math.min(1, dt * 6);
        if (Math.abs(K[r] - target) < 0.003) K[r] = target;
        dirty[r] = true; changed = true;
      }
    });
    const ft = L.fire ? 1 : 0;
    if (fireK !== ft) {
      fireK += (ft - fireK) * Math.min(1, dt * 3);
      if (Math.abs(fireK - ft) < 0.003) fireK = ft;
    }
    if (!NEAR) { if (changed) updateWindows(); return; }

    fireBonus = fireK * (0.085 + 0.025 * Math.sin(time * 7.3) + 0.015 * Math.sin(time * 13.1));
    ROOM_IDS.forEach(function (r) {
      if (dirty[r] || (r === 'session' && fireK > 0.003)) { applyRoom(r); dirty[r] = false; }
    });
    if (changed) {
      updateWindows();
      for (let i = 0; i < lampBulbs.length; i++) lampBulbs[i].mat.color.copy(bulbOff).lerp(bulbOn, K[lampBulbs[i].room]);
      for (let i = 0; i < lampGlows.length; i++) lampGlows[i].sp.material.opacity = lampGlows[i].base * K[lampGlows[i].room];
      ROOM_IDS.forEach(function (r) { if (switches[r]) switches[r].rotation.x = L[r] ? 0.4 : -0.4; });
    }
  }

  // Feu : flammes qui dansent, lueur sur la salle de séance
  function stepFire(time, zone) {
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const fl = 0.6 + 0.25 * Math.sin(time * 9 + f.ph) + 0.15 * Math.sin(time * 17 + f.ph * 2.3);
      f.sp.material.opacity = fireK * fl * (i === 0 ? 0.9 : 0.7);
      const s = (0.28 + 0.16 * fl) * (i === 0 ? 1.3 : 1);
      f.sp.scale.set(s, s * 1.5, 1);
      f.sp.position.y = F + 0.28 + 0.06 * fl;
      f.sp.position.x = f.x + 0.02 * Math.sin(time * 6 + f.ph);
    }
    if (fireLight) {
      const fl = 0.8 + 0.25 * Math.sin(time * 9) + 0.15 * Math.sin(time * 17.3);
      fireLight.intensity = zone === 'session' ? fireK * fl * 0.9 : 0;
    }
  }

  // Une seule vraie lumière suit le joueur de pièce en pièce (relief et ombres douces) ; la lueur des murs vient des matériaux
  const ROOM_LIGHT_POS = {
    waiting: { x: 0, z: 3.0 }, corridor: { x: 0, z: 0.4 }, session: { x: -2.6, z: -2.7 }, bedroom: { x: 3.1, z: -2.7 }
  };
  let lightRoom = null, lightFade = 0;
  function stepFollow(dt, zone) {
    if (!followLight) return;
    const L = getLights();
    const want = (zone !== 'outside' && L[zone]) ? zone : null;
    if (want !== lightRoom) {
      lightFade -= dt / 0.18;
      if (lightFade <= 0) {
        lightFade = 0; lightRoom = want;
        if (want) followLight.position.set(ROOM_LIGHT_POS[want].x, CEIL - 0.45, ROOM_LIGHT_POS[want].z);
      }
    } else if (lightRoom) {
      lightFade = Math.min(1, lightFade + dt / 0.25);
    }
    followLight.intensity = lightRoom ? 1.6 * lightFade : 0;
  }

  // ==========================================
  // INTÉRIEUR VIVANT : Evelyn, livres, carnet, téléphone, clics, déplacements
  // ==========================================

  let seated = false, seatSpot = null, zone = 'outside', raised = false, baseEye = null, curRoom = null;
  let hubActive = false, lastGreet = -1e9, hoverBook = -1, insideNow = false;
  const playerL = { x: 1e9, z: 1e9 };
  const hub = createHub(opts.action);

  function evelynHome() {
    try {
      const s = window.BadTherapistSociety, a = s && s.registry && s.registry.actor('evelyn');
      return !a || (a.loc === 'therapist_house' && !a.travel);     // dès qu'elle part (a.travel), son corps de la maison disparaît : sinon elle restait aussi assise dans son fauteuil pendant sa marche
    } catch (e) { return true; }
  }

  let reader = null, talk = null, avatarPromise = null;
  const BUBBLE_Y = 1.65;
  const bubbleV = new THREE.Vector3();
  const openedBooks = [];

  if (NEAR) {

    // ── lumières réelles : une qui suit le joueur, une pour le feu (jamais éteintes en « visible = false » : rien à recompiler) ──
    followLight = new THREE.PointLight(0xffd6a0, 0, 9, 1.6);
    followLight.userData.keep = true;
    followLight.position.set(0, CEIL - 0.45, 3.0);
    h.add(followLight);
    fireLight = new THREE.PointLight(0xff8a3c, 0, 5.5, 1.8);
    fireLight.userData.keep = true;
    fireLight.position.set(FIRE.x, F + 0.6, -4.2);
    h.add(fireLight);

    // ── pas de neige qui tombe dans la maison ──
    if (opts.snow && opts.snow.excludeBox) {
      const a = toParent(-W / 2 - 0.4, -D / 2 - 0.6), b = toParent(W / 2 + 0.4, D / 2 + 0.6);
      opts.snow.excludeBox(origin.x + Math.min(a.x, b.x), origin.y + gy - 1, origin.z + Math.min(a.z, b.z),
        origin.x + Math.max(a.x, b.x), origin.y + gy + CEIL + RISE + 2, origin.z + Math.max(a.z, b.z));
    }

    // ── téléphone d'Evelyn : le MÊME code que le tien (objects/phone.js), autre couleur ──
    evPhone = buildPhone(h, {
      owner: 'evelyn', camera: camera, canvas: canvasEl,
      position: { x: TABLE.x + 0.5, y: F + 0.775, z: TABLE.z - 0.08 }, yaw: 0,
      reachable: function () { return zone === 'session' && Math.hypot(playerL.x - TABLE.x, playerL.z - TABLE.z) < 3.2; },
      audible: function (d) { return d < 22 ? 0.05 + 0.5 * Math.pow(1 - d / 22, 2) : 0; }
    });

    // ── avatar d'Evelyn, assise dans son fauteuil ──
    async function loadAvatar() {
      const d = AVATAR_DIR;
      async function load(list) {
        const set = await manifestFiles();
        const anims = {};
        Object.keys(list).forEach(function (k) {
          const p = d + list[k];
          if (!set || set.has(p)) anims[k] = p;                    // fichier absent du dossier : ignoré (pas de 404)
        });
        return loadMixamoAvatar({
          model: d + AVATAR_MODEL,
          textures: {
            map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png',
            roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png'
          },
          animations: anims,
          height: AVATAR_HEIGHT
        });
      }
      let ev;
      try { ev = await load(AVATAR_ANIMS); }
      catch (e) {
        console.warn('[avatar] une animation de la vie d\'Evelyn ne charge pas, je garde seulement assise / assise qui parle', e);
        ev = await load(AVATAR_ANIMS_MIN);
      }
      evAvatar = ev;
      mixer = ev.mixer;
      avatar = new THREE.Group();
      avatar.add(ev.root);
      avatar.position.set(EV.x + AVATAR_OFFSET.x, EV.y + AVATAR_OFFSET.y, EV.z + AVATAR_OFFSET.z);
      avatar.rotation.y = EV.yaw;
      avatar.userData.use = 'therapist';
      h.add(avatar);
      window.BadTherapistAvatar = { ev: ev, group: avatar, actions: ev.actions, play: ev.play };   // pour régler à la main dans la console (F12)
      EV.anim = '';
      evAnim(EV.mode === 'sleep' ? 'sleep' : EV.mode === 'sit' ? 'sit' : 'stand');
    }
    function ensureAvatar() {
      if (!avatarPromise) avatarPromise = loadAvatar().catch(function (e) { avatarPromise = null; throw e; });
      return avatarPromise;
    }
    const therapistHit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.8), new THREE.MeshBasicMaterial());
    therapistHit.visible = false;
    therapistHit.position.set(CHAIR.x, F + 0.95, CHAIR.z);
    therapistHit.userData.use = 'therapist';
    h.add(therapistHit);
    // (la zone de clic suit Evelyn quand elle se déplace : voir evActorUpdate)

    // Livres : on les charge en même temps (loadBooks est défini avec l'étagère)
    reader = createBookReader();
    talk = createTherapistTalk({
      onSpeak: function (on) { if (evAvatar && EV.mode === 'sit' && evAvatar.actions.sit_talk) { evAvatar.play(on ? 'sit_talk' : 'sit'); EV.anim = on ? 'sit_talk' : 'sit'; } },
      getWorld: function () {
        return [
          seated ? 'La personne est assise en face de toi.' : 'La personne est debout près de toi.',
          openedBooks.length ? 'Livres que la personne a ouverts pendant cette visite : ' + openedBooks.join(' ; ') + '.' : ''
        ];
      }
    });
    const evJ = getEvelynJournal();

    function ensureAll() {
      return Promise.all([
        ensureAvatar().catch(function (e) { console.error('[avatar] impossible de charger', e); }),
        loadBooksAll()
      ]);
    }

    // Tout est préparé à l'avance (derrière l'écran de chargement du jeu s'il y en a un) : aucune attente quand on ouvre la porte
    if (window.BTLoad && window.BTLoad.active()) {
      window.BTLoad.hold('house');
      setTimeout(function () {
        ensureAll().catch(function () { }).then(function () { window.BTLoad.release('house'); });
      }, 30);
    } else {
      setTimeout(function () { ensureAll().catch(function () { }); }, 800);
    }


    // ═════════════════════════════════════════════════════════════════
    // EVELYN VIT DANS SA MAISON : marche, ouvre les portes, allume / éteint, écrit son carnet, dort, s'assoit
    // ═════════════════════════════════════════════════════════════════
    // Elle utilise ses animations Mixamo (avatars/evelyn/). Rien ne se déclenche tout seul : c'est life-sync.js (ou la console F12) qui décide.
    //     BadTherapistHouse.evelyn.sleep()  .wake()  .sit()  .write('texte')  .light('bedroom', false)  .goTo('bed')  .stop()  .demo()
    // ou, sans importer ce fichier :  window.dispatchEvent(new CustomEvent('badtherapist:evelyn-do', { detail: { action: 'write', text: '...' } }))

    const EVN = {
      armchair: { x: CHAIR.x, z: CHAIR.z }, s1: { x: -2.3, z: -3.3 }, s2: { x: -2.4, z: -1.6 }, sdoor: { x: -2.8, z: -1.05 },
      c1: { x: -2.8, z: 0.4 }, c2: { x: 0, z: 0.4 }, c3: { x: 3.2, z: 0.4 },
      b1: { x: 3.2, z: -1.15 }, b2: { x: 3.2, z: -2.3 }, bedside: { x: 3.3, z: -3.2 }, write: { x: 3.0, z: -3.8 }, bed: { x: BED.x, z: BED.z },
      p1c: { x: 0, z: 0.85 }, p1w: { x: 0, z: 1.95 }, w2: { x: 0, z: 3.2 },
      swSession: { x: -1.9, z: -1.05 }, swBedroom: { x: 4.2, z: -1.05 }, swCorridor: { x: 0.95, z: 0.85 }, swWaiting: { x: 1.3, z: 4.15 }
    };
    const EDGES = [
      ['armchair', 's1'], ['s1', 's2'], ['s2', 'sdoor'], ['s2', 'swSession'], ['sdoor', 'c1', 'door:session'],
      ['c1', 'c2'], ['c2', 'c3'], ['c3', 'b1', 'door:bedroom'], ['b1', 'b2'], ['b2', 'bedside'], ['bedside', 'bed'], ['b2', 'write'], ['b1', 'swBedroom'],
      ['c2', 'p1c'], ['p1c', 'swCorridor'], ['p1c', 'p1w', 'door:p1'], ['p1w', 'w2'], ['w2', 'swWaiting']
    ];
    const EV = { node: 'armchair', mode: 'sit', x: CHAIR.x, z: CHAIR.z, y: F, yaw: AVATAR_YAW, anim: '', steps: [] };
    const WALK_SPEED = 1.15;

    function evRoute(from, to) {
      const adj = {};
      EDGES.forEach(function (e) { (adj[e[0]] = adj[e[0]] || []).push([e[1], e[2]]); (adj[e[1]] = adj[e[1]] || []).push([e[0], e[2]]); });
      const prev = {}; prev[from] = null;
      const q = [from];
      while (q.length) {
        const a = q.shift();
        if (a === to) break;
        (adj[a] || []).forEach(function (n) { if (!(n[0] in prev)) { prev[n[0]] = [a, n[1]]; q.push(n[0]); } });
      }
      if (!(to in prev)) return null;
      const out = [];
      let c = to;
      while (prev[c]) { out.unshift([prev[c][0], c, prev[c][1]]); c = prev[c][0]; }
      return out;
    }

    // animation par son nom (si elle n'existe pas : on garde la précédente)
    function evAnim(name) {
      if (!evAvatar || EV.anim === name) return;
      if (!(evAvatar.actions && evAvatar.actions[name])) return;
      evAvatar.play(name);
      EV.anim = name;
    }
    function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

    // Une étape = fonction appelée à chaque image tant qu'elle renvoie false
    function stepWait(sec, anim, mid, midAt) {
      let t = 0, fired = false;
      return function (dt) {
        if (t === 0 && anim) evAnim(anim);
        t += dt;
        if (mid && !fired && t >= (midAt || 0)) { fired = true; mid(); }
        return t >= sec;
      };
    }
    function stepFace(yaw) {
      return function (dt) {
        const d = angDiff(EV.yaw, yaw);
        if (Math.abs(d) < 0.04) { EV.yaw = yaw; return true; }
        EV.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 5);
        return false;
      };
    }
    function stepSet(fn) { return function () { fn(); return true; }; }
    function stepWalk(a, b) {
      const A = EVN[a], B = EVN[b];
      return function (dt) {
        evAnim('walk');
        EV.mode = 'stand';
        const dx = B.x - EV.x, dz = B.z - EV.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { EV.x = B.x; EV.z = B.z; EV.node = b; return true; }
        const k = Math.min(1, WALK_SPEED * dt / d);
        EV.x += dx * k; EV.z += dz * k;
        const want = Math.atan2(dx, dz), da = angDiff(EV.yaw, want);
        EV.yaw += Math.sign(da) * Math.min(Math.abs(da), dt * 7);
        return false;
      };
    }
    // « va à tel endroit » : se déploie au moment d'être joué (là où elle se trouve vraiment à ce moment-là)
    function stepGoto(target) {
      return function () {
        const route = evRoute(EV.node, target);
        if (!route) { console.warn('[Evelyn] pas de chemin de', EV.node, 'à', target); return true; }
        const out = [];
        if (EV.mode === 'sit' || EV.mode === 'sleep') {
          const wasSleep = EV.mode === 'sleep';
          out.push(stepSet(function () { if (wasSleep) { EV.x = EVN.bedside.x; EV.z = EVN.bedside.z; EV.y = F; EV.node = 'bedside'; } }));
          out.push(stepWait(wasSleep ? 1.1 : 0.7, 'stand'));
          out.push(stepSet(function () { EV.mode = 'stand'; }));
        }
        route.forEach(function (e) {
          const door = e[2] && doors[e[2]];
          if (door) {
            out.push(stepFace(Math.atan2(EVN[e[1]].x - EVN[e[0]].x, EVN[e[1]].z - EVN[e[0]].z)));
            out.push((function () {
              let started = false, t = 0;
              return function (dt) {
                if (door.goal || door.openT > 0.5) return true;
                if (!started) { started = true; evAnim('openDoor'); }
                t += dt;
                if (t > 0.6) door.goal = 1;
                return t > 1.5 && door.openT > 0.6;
              };
            })());
          }
          out.push(stepWalk(e[0], e[1]));
        });
        EV.steps.splice.apply(EV.steps, [0, 1].concat(out));        // cette étape est remplacée par le trajet détaillé
        return false;
      };
    }
    function evPush() { for (let i = 0; i < arguments.length; i++) EV.steps.push(arguments[i]); return true; }
    function stepPlace(node, yaw, mode, anim, y) {
      return stepSet(function () {
        EV.x = EVN[node].x; EV.z = EVN[node].z; EV.y = y === undefined ? F : y; EV.yaw = yaw; EV.mode = mode; EV.node = node; evAnim(anim);
      });
    }

    const evelynApi = {
      goTo: function (place) { if (!EVN[place]) return false; return evPush(stepGoto(place)); },
      sit: function () {
        return evPush(stepGoto('armchair'), stepFace(AVATAR_YAW), stepPlace('armchair', AVATAR_YAW, 'sit', 'sit'));
      },
      sleep: function () {
        return evPush(stepGoto('bed'), stepSet(function () {
          EV.x = BED.x + SLEEP_POSE.x; EV.z = BED.z + SLEEP_POSE.z; EV.y = F + 0.55 + SLEEP_POSE.y; EV.yaw = SLEEP_POSE.yaw; EV.mode = 'sleep'; EV.node = 'bed'; evAnim('sleep');
        }));
      },
      wake: function () {
        return evPush(stepSet(function () { }), stepGoto('bedside'), stepFace(Math.PI));
      },
      // ⚠ TEMPORAIRE : Mixamo n'a pas d'animation « écrire ». Pour l'instant elle écrit DEBOUT (animation « stand »).
      // Quand tu auras une vraie animation d'écriture : ajoute-la dans AVATAR_ANIMS (write: '...') et remplace 'stand' ci-dessous.
      write: function (text) {
        return evPush(stepGoto('write'), stepFace(Math.PI), stepWait(1.4, 'stand'),
          stepSet(function () { if (text) getEvelynJournal().write(text); }),     // sauvegardé tout de suite, comme ton carnet
          stepWait(4.5, 'stand'));
      },
      erase: function (text) {
        return evPush(stepGoto('write'), stepFace(Math.PI), stepWait(1.2, 'stand'),
          stepSet(function () { getEvelynJournal().erase(text); }), stepWait(3, 'stand'));
      },
      // allumer = animation « ouvrir la porte », éteindre = « fermer la porte » (ce sont les animations dont elle dispose pour l'instant)
      light: function (room, on) {
        const sw = { waiting: 'swWaiting', corridor: 'swCorridor', session: 'swSession', bedroom: 'swBedroom' }[room];
        if (!sw) return false;
        return evPush(stepGoto(sw), stepFace(0), stepWait(1.5, on ? 'openDoor' : 'closeDoor', function () { setLight(room, !!on, 'evelyn'); }, 0.6));
      },
      stop: function () { EV.steps.length = 0; return true; },
      where: function () { return { mode: EV.mode, node: EV.node, busy: EV.steps.length > 0, anim: EV.anim }; },
      nodes: Object.keys(EVN),
      demo: function () {                                           // petit tour pour voir toutes les animations
        evelynApi.light('bedroom', true);
        evelynApi.write('Demo : je note ça avant de dormir.');
        evelynApi.light('bedroom', false);
        evelynApi.sleep();
        return true;
      }
    };
    window.addEventListener('badtherapist:evelyn-do', function (ev) {
      const d = (ev && ev.detail) || {};
      if (d.action === 'sleep') evelynApi.sleep();
      else if (d.action === 'wake') evelynApi.wake();
      else if (d.action === 'sit') evelynApi.sit();
      else if (d.action === 'write') evelynApi.write(d.text);
      else if (d.action === 'erase') evelynApi.erase(d.text);
      else if (d.action === 'light') evelynApi.light(d.room, d.on);
      else if (d.action === 'goto') evelynApi.goTo(d.place);
      else if (d.action === 'stop') evelynApi.stop();
    });

    function evActorUpdate(dt) {
      if (EV.steps.length) {
        // plusieurs étapes instantanées d'affilée sont jouées dans la même image
        for (let guard = 0; guard < 8 && EV.steps.length; guard++) {
          if (EV.steps[0](dt)) EV.steps.shift(); else break;
        }
      }
      if (avatar) {
        avatar.position.set(EV.x + AVATAR_OFFSET.x, EV.y + AVATAR_OFFSET.y, EV.z + AVATAR_OFFSET.z);
        avatar.rotation.y = EV.yaw;
        therapistHit.position.set(EV.x, EV.y + 0.95, EV.z);
      }
    }

    // ── objets utilisables : assis, debout ──
    // On s'assoit en cliquant sur n'importe quel siège (canapé, fauteuils, banc, chaise de la séance)
    function sitDown(id) {
      const sp = SITS[id];
      if (!sp || seated || (sp.enabled && !sp.enabled())) return;
      seated = true;
      seatSpot = sp;
      talk.hideBubble(true);
      if (opts.view) opts.view.set(Math.atan2(sp.dir[0], sp.dir[1]), -0.08);
      if (sp.talk && EV.mode === 'sit') {
        setTimeout(function () {
          if (seated && seatSpot === sp && !talk.isOpen() && !reader.isOpen()) talk.open();   // la séance commence : Evelyn ouvre la discussion
        }, 900);
      }
    }

    function standUp(silent) {
      if (!seated) return;
      const sp = seatSpot;
      seated = false;
      seatSpot = null;
      const p = toParent(sp.x + sp.stand.x, sp.z + sp.stand.z);
      camera.position.x = origin.x + p.x;
      camera.position.z = origin.z + p.z;
      camera.position.y = (baseEye === null ? origin.y + gy + 1.7 : baseEye) + F;
      if (sp.talk) {
        talk.endSession();                                                        // ferme la boîte, Evelyn fait son bilan (mémoire)
        if (!silent) talk.farewell();
      }
    }
    sitHook = function (id) { if (seated) standUp(); else sitDown(id); };

    // ── clic / survol (souris et doigt) ──
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function modalOpen() { return reader.isOpen() || talk.isOpen() || evJ.isOpen(); }
    function busyWorld() { return !!(opts.isBusy && opts.isBusy()); }

    function ray(ev) {
      const r = canvasEl.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return true;
    }

    function pick(ev) {
      if (modalOpen() || busyWorld() || !ray(ev)) return null;
      if (Math.hypot(playerL.x, playerL.z) > 30) return null;
      raycaster.far = 7;
      const hits = raycaster.intersectObject(g, true);
      for (let i = 0; i < hits.length; i++) {
        let o = hits[i].object;
        if (o.userData.passThrough) continue;
        while (o && !o.userData.use) o = o.parent;
        if (!o) return null;                       // quelque chose de plein est devant : rien à cliquer
        return { use: o.userData.use, idx: o.userData.idx };
      }
      return null;
    }

    function itemReach(it) {
      if (it.rooms.indexOf(zone) === -1) return false;
      if (it.enabled && !it.enabled()) return false;
      return Math.hypot(playerL.x - it.x, playerL.z - it.z) <= it.range + 0.6;
    }

    canvasEl.addEventListener('mousemove', function (ev) {
      const p = pick(ev);
      hoverBook = p && p.use === 'book' ? p.idx : -1;
      if (p) canvasEl.style.cursor = 'pointer';
    });
    canvasEl.addEventListener('mouseleave', function () { hoverBook = -1; });

    let downX = 0, downY = 0;                       // on ignore le clic qui termine un glissé (regard autour de soi)
    canvasEl.addEventListener('pointerdown', function (ev) { downX = ev.clientX; downY = ev.clientY; });
    canvasEl.addEventListener('click', function (ev) {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
      const p = pick(ev);
      if (!p) return;
      if (p.use === 'book') {
        if (zone !== 'session') return;
        const s = slots[p.idx];
        if (!s || !s.data) return;
        hoverBook = -1;
        const bt = s.data.title || s.data.titre;
        if (bt && openedBooks.indexOf(String(bt)) === -1) openedBooks.push(String(bt).slice(0, 60));
        reader.open(s.data);
      } else if (p.use === 'therapist') {
        if (zone !== 'session') return;
        hoverBook = -1; talk.hideBubble(true); talk.open();            // on peut lui parler assis ou debout
      } else {
        const it = ITEMS[p.use];
        if (it && itemReach(it)) it.fn();
      }
    });

    // ── déplacements : murs, meubles et portes fermées ──
    const PR = 0.3;
    function pushOut(x, z) {
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < SOLIDS.length; i++) {
          const c = SOLIDS[i];
          if (c.active && !c.active()) continue;
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

    // hauteur du sol sous les pieds : porche et marches, puis plancher de la maison
    floorRiseFn = function (px, pz) {
      if (seated && seatSpot) return F + (seatSpot.eye - 1.7);     // assis : les yeux descendent
      const l = fromParent(px, pz);
      return riseAt(l.x, l.z);
    };
    function riseAt(x, z) {
      if (Math.abs(x) < W / 2 - 0.05 && z > -D / 2 && z < D / 2) return F;
      if (Math.abs(x) <= 1.0 && z >= D / 2) {
        const e = D / 2 + 2.45;
        if (z <= e) return F;
        const t = (D / 2 + 2.95 - z) / 0.5;
        if (t <= 0) return 0;
        return F * t * t * (3 - 2 * t);
      }
      return 0;
    }

    function roomAt(x, z) {
      for (let i = 0; i < ROOM_IDS.length; i++) {
        const r = ROOMS[ROOM_IDS[i]];
        if (x >= r.x0 - 0.02 && x <= r.x1 + 0.02 && z >= r.z0 - 0.02 && z <= r.z1 + 0.02) return ROOM_IDS[i];
      }
      return null;
    }

    // Livres (chargés avec l'étagère)
    function loadBooksAll() { return loadBooksFn ? loadBooksFn() : Promise.resolve(); }

    // ── mémoire de position : si tu quittes le jeu dans la maison, tu reviens là où tu étais (pas devant la porte) ──
    const POS_KEY = 'bt_house_pos';
    let posTimer = 0, lastSaved = '', restoreDone = false;
    const t0 = performance.now();

    function getView() {
      try {
        if (opts.view && typeof opts.view.get === 'function') {
          const v = opts.view.get();
          if (v && typeof v.yaw === 'number') return { yaw: v.yaw, pitch: v.pitch || 0 };
          if (Array.isArray(v)) return { yaw: v[0], pitch: v[1] || 0 };
        }
      } catch (e) { }
      return { yaw: camera.rotation.y, pitch: camera.rotation.x };
    }
    function putPlayer(lx, lz, yaw, pitch) {
      const p = toParent(lx, lz);
      camera.position.x = origin.x + p.x;
      camera.position.z = origin.z + p.z;
      camera.position.y = (baseEye === null ? origin.y + gy + 1.7 : baseEye) + F;
      if (opts.view && yaw !== undefined) opts.view.set(yaw, pitch || 0);
      if (opts.onTeleport) opts.onTeleport();                // le monde recalcule la hauteur du joueur (outside.js : walkY)
    }
    function resetToEntrance() {
      if (seated) standUp(true);
      putPlayer(0, IZ1 - 0.9, Math.PI, 0);                  // dans la salle d'attente, face à l'intérieur
      doors['door:front'].goal = 1;
    }
    function keepPosition(dt, l, dH) {
      // 1) au démarrage : le monde remet peut-être le joueur devant la porte ; on le replace dans la maison
      if (!restoreDone) {
        if (performance.now() - t0 > 9000) restoreDone = true;
        else {
          let rec = null;
          try { rec = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { }
          if (!rec || !rec.inside) restoreDone = true;
          else if (!insideNow && dH < 12 && l.z > D / 2 - 0.5) {
            putPlayer(rec.x, rec.z, rec.yaw, rec.pitch);
            doors['door:front'].goal = 1;
            restoreDone = true;
          }
        }
      }
      // 2) en jeu : on retient où l'on est (une fois par seconde)
      posTimer += dt;
      if (posTimer < 1) return;
      posTimer = 0;
      if (!restoreDone) return;
      let rec;
      if (dH < 40 && insideNow) { const v = getView(); rec = { inside: true, x: +l.x.toFixed(2), z: +l.z.toFixed(2), yaw: +v.yaw.toFixed(3), pitch: +v.pitch.toFixed(3) }; }
      else rec = { inside: false };
      const j = JSON.stringify(rec);
      if (j !== lastSaved) { lastSaved = j; try { localStorage.setItem(POS_KEY, j); } catch (e) { } }
    }

    // ── mise à jour de l'intérieur, à chaque image ──
    interiorUpdate = function (dt, time) {

      // portes
      Object.keys(doors).forEach(function (id) {
        const d = doors[id];
        if (d.openT < d.goal) d.openT = Math.min(d.goal, d.openT + dt / 0.65);
        else if (d.openT > d.goal) d.openT = Math.max(d.goal, d.openT - dt / 0.65);
        const e = d.openT * d.openT * (3 - 2 * d.openT);
        d.pivot.rotation.y = d.s * 1.65 * e;
      });

      const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
      const l = fromParent(px, pz);
      playerL.x = l.x; playerL.z = l.z;
      const dH = Math.hypot(l.x, l.z);

      // zone du joueur
      const inside = Math.abs(l.x) < W / 2 && l.z > -D / 2 && l.z < D / 2;
      insideNow = inside;
      const prevZone = zone;
      if (inside) {
        const r = roomAt(l.x, l.z);
        if (r) curRoom = r;
        else if (!curRoom) curRoom = 'waiting';              // dans l'épaisseur de la porte d'entrée
        zone = curRoom;
      } else { zone = 'outside'; curRoom = null; }

      // entrer dans la salle de séance : Evelyn dit bonjour (une fois par minute au plus)
      if (zone === 'session' && prevZone !== 'session' && !seated && evelynHome() && EV.mode === 'sit' && performance.now() - lastGreet > 45000) {
        lastGreet = performance.now();
        talk.greetStanding();
      }
      if (zone !== 'session' && !seated && talk.isOpen()) talk.endSession();   // on s'éloigne en pleine conversation

      // hauteur des yeux (porche, marches, plancher) et verrouillage assis
      if (seated) {
        const sp = toParent(seatSpot.x, seatSpot.z - (seatSpot.talk ? 0.02 : 0));
        camera.position.x = origin.x + sp.x;
        camera.position.z = origin.z + sp.z;
        camera.position.y = (baseEye === null ? origin.y + gy + 1.7 : baseEye) + F + (seatSpot.eye - 1.7);
      } else if (dH < 60) {
        const rise = riseAt(l.x, l.z);
        if (rise > 0.001) {
          if (baseEye === null) baseEye = origin.y + gy + 1.7;
          camera.position.y = baseEye + rise;
          raised = true;
        } else if (raised) {
          camera.position.y = baseEye;
          raised = false;
        } else if (dH < 40) baseEye = camera.position.y;
      } else raised = false;

      // murs, meubles, portes fermées
      if (!seated && Math.abs(l.x) < W / 2 + 3 && l.z > -D / 2 - 3 && l.z < D / 2 + 4) {
        const t = pushOut(l.x, l.z);
        if (t[0] !== l.x || t[1] !== l.z) {
          const np = toParent(t[0], t[1]);
          camera.position.x = origin.x + np.x;
          camera.position.z = origin.z + np.z;
          playerL.x = t[0]; playerL.z = t[1];
        }
      }

      stepFollow(dt, zone);
      stepFire(time, zone);
      evActorUpdate(dt);

      // portes de placard, tiroir
      for (let i = 0; i < openables.length; i++) {
        const op = openables[i];
        if (op.t === op.goal) continue;
        op.t += Math.sign(op.goal - op.t) * Math.min(Math.abs(op.goal - op.t), dt / 0.5);
        op.apply(op.t * op.t * (3 - 2 * op.t));
      }

      keepPosition(dt, l, dH);

      // Evelyn, livres, téléphone
      if (dH < 40) {
        if (avatar) avatar.visible = evelynHome();           // absente : son fauteuil est vide
        if (mixer && dH < 25) mixer.update(dt);
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (!s) continue;
          const target = (hoverBook === i && s.data) ? 0.55 : 0;
          s.glow += (target - s.glow) * Math.min(1, dt * 10);
          const sc = E_OFF + (E_ON - E_OFF) * K.session + fireBonus;
          s.mats[0].emissive.setRGB(1, 1, 1).multiply(WARM).multiplyScalar(sc);          // le dos porte sa texture (emissiveMap)
          s.mats[1].emissive.copy(s.base).multiply(WARM).multiplyScalar(sc);
          s.mats[2].emissive.copy(pagesColor).multiply(WARM).multiplyScalar(sc);
          if (s.glow > 0.003) {
            [s.mats[0], s.mats[1]].forEach(function (m) { m.emissive.r += s.glow; m.emissive.g += s.glow * 0.78; m.emissive.b += s.glow * 0.4; });
          }
        }
        evPhone.update(dt, time);
      }

      // bulle d'Evelyn : au-dessus de sa tête, debout dans la salle de séance et sans lecture en cours
      if (zone === 'session' && !seated && !talk.isOpen() && !reader.isOpen() && !evJ.isOpen()) {
        const cp = toParent(CHAIR.x, CHAIR.z);
        bubbleV.set(origin.x + cp.x, origin.y + gy + F + BUBBLE_Y, origin.z + cp.z).project(camera);
        const cr = canvasEl.getBoundingClientRect();
        talk.updateBubble(
          cr.left + (bubbleV.x * 0.5 + 0.5) * cr.width,
          cr.top + (-bubbleV.y * 0.5 + 0.5) * cr.height,
          bubbleV.z < 1 && Math.abs(bubbleV.x) < 1.1 && bubbleV.y > -1.1 && bubbleV.y < 1.2
        );
        bubbleOn = true;
      } else if (bubbleOn) {
        talk.updateBubble(0, 0, false);
        bubbleOn = false;
      }

      // bouton d'action : le plus proche gagne (portes, interrupteurs, cheminée, carnet, chaise)
      if (dH < 14) {
        if (!modalOpen() && !busyWorld()) {
          if (seated) {
            hub.request('stand', 'STAND UP', function () { standUp(); }, 0);
          } else if (BUTTONS) {
            const ids = Object.keys(ITEMS);
            for (let i = 0; i < ids.length; i++) {
              const it = ITEMS[ids[i]];
              if (it.rooms.indexOf(zone) === -1) continue;
              if (it.enabled && !it.enabled()) continue;
              const dd = Math.hypot(l.x - it.x, l.z - it.z);
              if (dd <= it.range) hub.request(it.id, it.label(), it.fn, dd);
            }
          }
        }
        hub.flush();
        hubActive = true;
      } else if (hubActive) {
        hub.flush();
        hubActive = false;
      }
    };

    // ── accès pour Evelyn (sa vie future), la console (F12) et les autres fichiers ──
    function pos(x, z) { const p = toParent(x, z); return { x: p.x, y: gy + F, z: p.z }; }
    window.BadTherapistHouse = {
      getLights: function () { return Object.assign({}, getLights()); },
      setLight: setLight,
      toggleLight: function (id, who) { return setLight(id, !getLights()[id], who); },
      journal: evJ,
      phone: evPhone,
      evelyn: evelynApi,
      resetPosition: function () { resetToEntrance(); },
      use: function (id) { const it = ITEMS[id]; if (it && itemReach(it)) { it.fn(); return true; } return false; },   // ex. BadTherapistHouse.use('door:front') (tu dois être à côté)
      items: function () { return Object.keys(ITEMS); },
      isInside: function () { return insideNow; },
      doors: function () { const o = {}; Object.keys(doors).forEach(function (k) { o[k] = doors[k].goal === 1; }); return o; },
      setDoor: function (id, open) { const d = doors['door:' + id] || doors[id]; if (d) d.goal = open ? 1 : 0; return !!d; },
      spots: {
        floorY: gy + F,
        entrance: pos(0, IZ1 - 0.3), waitingRoom: pos(0, 3.0), corridor: pos(0, 0.4),
        sessionRoom: pos(-2.6, -2.7), bedroomRoom: pos(3.1, -2.7),
        armchair: pos(CHAIR.x, CHAIR.z), desk: pos(TABLE.x, TABLE.z), phone: pos(TABLE.x + 0.5, TABLE.z + 0.4), fireplace: pos(FIRE.x, -4.1),
        bed: pos(BED.x, BED.z + 1.2), notebook: pos(NIGHT.x, NIGHT.z + 0.6),
        switches: { waiting: pos(1.3, IZ1 - 0.5), corridor: pos(0.95, Z_P1 - 0.5), session: pos(-1.9, Z_P2 - 0.6), bedroom: pos(4.2, Z_P2 - 0.6) },
        doors: { front: pos(0, ZF), p1: pos(0, Z_P1), session: pos(-2.8, Z_P2), bedroom: pos(3.2, Z_P2) }
      }
    };
  }

  // ==========================================
  // RETOUR
  // ==========================================

  return {
    group: g,
    colliders: WALL_RECTS.map(worldRect),
    // À AJOUTER à la hauteur du terrain sous le joueur (marches du porche, plancher, assis). x, z dans le repère de la rue.
    // outside.js l'utilise dans walkHeight : ainsi le monde lui-même monte les marches, sans que la hauteur « saute ».
    floorRise: function (x, z) { return floorRiseFn(x, z); },
    interior: NEAR ? { isInside: function () { return insideNow; }, update: function () { }, reset: function () { if (window.BadTherapistHouse) window.BadTherapistHouse.resetPosition(); } } : null,
    update: function (dt, time) {

      stepLights(dt, time);

      // Fumée : monte, grossit, se dissipe, poussée par le vent (seulement si le feu est allumé)
      for (let i = 0; i < smoke.length; i++) {
        const t = ((time * 0.16) + i / smoke.length) % 1;
        const sp = smoke[i];
        sp.position.set(CH_X + t * 2.6 + Math.sin(time * 0.7 + i) * 0.12, chimneyY + t * 5.5, CH_Z + t * 0.4);
        const s = 0.5 + t * 2.6;
        sp.scale.set(s, s, 1);
        sp.material.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.34 * fireK;
      }

      if (interiorUpdate) interiorUpdate(dt, time);
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
