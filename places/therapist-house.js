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
const AVATAR_ANIMS = { sit: 'Sitting.fbx', sit_talk: 'Sitting Talking.fbx' };   // noms réels de tes fichiers
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
  const E_OFF = 0.05, E_ON = 0.5;
  const REG = { waiting: [], corridor: [], session: [], bedroom: [] };
  const rcache = {};

  function rm(room, color, o) {
    o = o || {};
    const key = room + '|' + color + '|' + (o.r === undefined ? '' : o.r) + '|' + (o.mapId || '');
    if (rcache[key]) return rcache[key];
    const m = new THREE.MeshStandardMaterial({ color: color, roughness: o.r === undefined ? 0.9 : o.r, metalness: o.m || 0 });
    if (o.map) { m.map = o.map; m.emissiveMap = o.map; m.userData.tile = o.tile || [1, 1]; }
    REG[room].push({ mat: m, base: new THREE.Color(color) });
    rcache[key] = m;
    return m;
  }

  // Tableaux / affiches : une texture sur un matériau de pièce
  function paintMat(room, tex) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, map: tex, emissiveMap: tex });
    REG[room].push({ mat: m, base: new THREE.Color(0xffffff) });
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

  function addSphere(r, mats, x, y, z, sx, sy, sz) {
    const geo = new THREE.SphereGeometry(r, 10, 8);
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
    return function (w, hh, d, mat, lx, ly, lz) {
      addBox(w, hh, d, mat, x + lx * c + lz * s, ly, z - lx * s + lz * c, yaw);
    };
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
  for (let i = 0; i < 26; i++) {
    const t = i / 26 * Math.PI * 2;
    const rx = (W / 2 + 0.7), rz = (D / 2 + 0.7);
    const px = Math.cos(t) * rx + (rnd() - 0.5) * 0.6;
    const pz = Math.sin(t) * rz + (rnd() - 0.5) * 0.6;
    if (pz > FZ - 0.2 && Math.abs(px) < 2.4) continue;   // pas devant le porche
    const hh = 0.25 + rnd() * 0.3;
    const lump = new THREE.Mesh(lumpGeo, mSnow);
    lump.scale.set(0.9 + rnd() * 0.8, hh, 0.7 + rnd() * 0.5);
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

  // Tableau d'Evelyn (peint à la volée ; si images/evelyn-tableau.jpg existe, c'est cette image qui s'affiche)
  function paintingTex() {
    const c = cv(320, 220), x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 130);
    sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(0.7, '#6a5a7a'); sky.addColorStop(1, '#e0a070');
    x.fillStyle = sky; x.fillRect(0, 0, 320, 220);
    x.fillStyle = '#f2e8c8'; x.beginPath(); x.arc(250, 48, 16, 0, 7); x.fill();
    x.fillStyle = 'rgba(40,50,80,0.9)';
    x.beginPath(); x.moveTo(0, 130); x.lineTo(70, 90); x.lineTo(130, 125); x.lineTo(200, 80); x.lineTo(320, 130); x.lineTo(320, 140); x.lineTo(0, 140); x.fill();
    x.fillStyle = '#dfe6ee'; x.fillRect(0, 135, 320, 85);
    x.fillStyle = 'rgba(120,140,170,0.35)'; for (let i = 0; i < 40; i++) x.fillRect(rnd() * 320, 140 + rnd() * 80, 20 + rnd() * 40, 2);
    for (let i = 0; i < 14; i++) {                                   // sapins
      const px = 10 + i * 24 + rnd() * 10, py = 150 + rnd() * 50, s = 18 + rnd() * 22;
      x.fillStyle = '#0e1a22';
      x.beginPath(); x.moveTo(px, py - s * 2.2); x.lineTo(px - s * 0.7, py); x.lineTo(px + s * 0.7, py); x.fill();
    }
    x.fillStyle = '#2a1c14'; x.fillRect(120, 150, 60, 38);          // chalet
    x.beginPath(); x.moveTo(114, 150); x.lineTo(150, 126); x.lineTo(186, 150); x.fill();
    x.fillStyle = '#ffc060'; x.fillRect(132, 160, 14, 14); x.fillRect(156, 160, 14, 14);
    return srgb(new THREE.CanvasTexture(c));
  }

  function noticeTex() {
    const c = cv(200, 260), x = c.getContext('2d');
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 200, 260);
    x.strokeStyle = '#8a6a3a'; x.lineWidth = 6; x.strokeRect(6, 6, 188, 248);
    x.fillStyle = '#3a2a1c'; x.textAlign = 'center';
    x.font = 'bold 26px serif'; x.fillText('PLEASE', 100, 70); x.fillText('WAIT', 100, 102);
    x.font = '16px serif'; x.fillStyle = '#5a4630';
    x.fillText('Evelyn will call', 100, 150); x.fillText('you in shortly.', 100, 172);
    x.fillText('Please keep your', 100, 205); x.fillText('phone silent.', 100, 227);
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
    fb(0.62, 0.09, 0.6, mat, 0, F + 0.45, 0);
    fb(0.62, 0.7, 0.09, mat, 0, F + 0.82, -0.28);
    fb(0.08, 0.06, 0.55, mat, -0.36, F + 0.68, 0);
    fb(0.08, 0.06, 0.55, mat, 0.36, F + 0.68, 0);
    fb(0.07, 0.24, 0.07, mat, -0.36, F + 0.56, 0.1);
    fb(0.07, 0.24, 0.07, mat, 0.36, F + 0.56, 0.1);
    [[-0.27, -0.25], [0.27, -0.25], [-0.27, 0.25], [0.27, 0.25]].forEach(function (p) { fb(0.06, 0.42, 0.06, leg, p[0], F + 0.21, p[1]); });
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
    const sofa = rm('waiting', 0x4b5a5e, { r: 0.9 }), leatherW = rm('waiting', 0x5a3a2c, { r: 0.7 });
    rug('waiting', -3.8, 3.0, 2.8, 1.9, 0x6a3a3a);
    (function () {                                                    // canapé contre le mur gauche, face à +x
      const fb = furn(-5.2, 3.0, Math.PI / 2);
      fb(0.9, 0.4, 2.1, sofa, 0, F + 0.2, 0);
      fb(0.9, 0.12, 2.1, rm('waiting', 0x5d6d72, { r: 0.9 }), 0, F + 0.45, 0.05);
      fb(0.2, 0.55, 2.1, sofa, 0, F + 0.72, -0.4);
      fb(0.82, 0.28, 0.18, sofa, 0, F + 0.55, -1.0);
      fb(0.82, 0.28, 0.18, sofa, 0, F + 0.55, 1.0);
      solid(-5.7, -4.75, 1.95, 4.05);
    })();
    armchair('waiting', 5.1, 3.0, -Math.PI / 2, leatherW);
    solid(4.7, 5.5, 2.6, 3.4);
    (function () {                                                    // table basse + magazines
      const fb = furn(-3.8, 3.0, 0), wd = rm('waiting', 0x6a4a30, { r: 0.7 });
      fb(1.1, 0.05, 0.6, wd, 0, F + 0.43, 0);
      [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(function (p) { fb(0.05, 0.4, 0.05, wd, p[0], F + 0.2, p[1]); });
      fb(0.3, 0.02, 0.22, rm('waiting', 0xb44a3a, { r: 0.9 }), -0.2, F + 0.465, 0.05);
      fb(0.28, 0.02, 0.2, rm('waiting', 0x3a5a8a, { r: 0.9 }), -0.18, F + 0.485, 0.04);
      solid(-4.4, -3.2, 2.65, 3.35);
    })();
    (function () {                                                    // plante
      addCyl(0.2, 0.15, 0.4, 12, rm('waiting', 0x7a4a34, { r: 0.9 }), -5.2, F + 0.2, 4.3);
      addSphere(0.42, rm('waiting', 0x2f5a34, { r: 1 }), -5.2, F + 0.85, 4.3, 1, 1.2, 1);
      addSphere(0.28, rm('waiting', 0x3a6a3c, { r: 1 }), -5.0, F + 1.2, 4.35, 1, 1, 1);
      solid(-5.5, -4.9, 4.0, 4.6);
    })();
    (function () {                                                    // portemanteau près de la porte
      addCyl(0.03, 0.03, 1.8, 8, rm('waiting', 0x3a2a1c, { r: 0.8 }), 2.4, F + 0.9, 4.4);
      addCyl(0.18, 0.2, 0.05, 12, rm('waiting', 0x3a2a1c, { r: 0.8 }), 2.4, F + 0.03, 4.4);
      addBox(0.45, 0.9, 0.12, rm('waiting', 0x3f4a56, { r: 1 }), 2.4, F + 1.2, 4.4);
      solid(2.15, 2.65, 4.15, 4.65);
    })();
    (function () {                                                    // affiche + horloge, côté cloison
      const pm = paintMat('waiting', noticeTex());
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), pm);
      poster.position.set(-2.2, F + 1.7, Z_P1 + PT / 2 + 0.012);
      h.add(poster);
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
      addBox(1.0, 0.05, 0.35, bn, 4.9, F + 0.8, -0.25);                // console + vase
      addBox(0.05, 0.78, 0.3, bn, 4.45, F + 0.4, -0.25); addBox(0.05, 0.78, 0.3, bn, 5.35, F + 0.4, -0.25);
      addCyl(0.07, 0.05, 0.28, 10, rm('corridor', 0x7a9aa8, { r: 0.4 }), 4.9, F + 0.97, -0.25);
      solid(4.4, 5.4, -0.425, -0.07);
    })();
    // cadres : images/corridor1.jpg ... (comme corridor.js ; image de secours si absente)
    [[-3.2, Z_P1 - PT / 2 - 0.012, 1, Math.PI], [3.2, Z_P1 - PT / 2 - 0.012, 2, Math.PI],
     [0.2, Z_P2 + PT / 2 + 0.012, 3, 0], [-4.6, Z_P2 + PT / 2 + 0.012, 4, 0]].forEach(function (f) {
      const fm = (function () {
        const c = cv(64, 80), x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 64, 80); gr.addColorStop(0, '#8a7a5a'); gr.addColorStop(1, '#5a4a2a');
        x.fillStyle = gr; x.fillRect(0, 0, 64, 80);
        return paintMat('corridor', srgb(new THREE.CanvasTexture(c)));
      })();
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), fm);
      pic.position.set(f[0], F + 1.7, f[1]);
      pic.rotation.y = f[3];
      h.add(pic);
      const gold = rm('corridor', 0xb89040, { r: 0.5 }), dz = f[3] === 0 ? 0.012 : -0.012;
      addBox(0.7, 0.04, 0.03, gold, f[0], F + 2.12, f[1] + dz); addBox(0.7, 0.04, 0.03, gold, f[0], F + 1.28, f[1] + dz);
      addBox(0.04, 0.88, 0.03, gold, f[0] - 0.33, F + 1.7, f[1] + dz); addBox(0.04, 0.88, 0.03, gold, f[0] + 0.33, F + 1.7, f[1] + dz);
      loadInto(fm, ['images/corridor' + f[2] + '.jpg', 'images/corridor' + f[2] + '.png', 'images/corridor' + f[2] + '.webp']);
    });

    // ═════════ SALLE DE SÉANCE ═════════
    const leather = rm('session', 0x3a2a22, { r: 0.7 }), woodDark = rm('session', 0x1c1410, { r: 0.9 });
    const mTable = rm('session', 0x6a4a30, { r: 0.8 }), mShelf = rm('session', 0x3d2c20, { r: 0.9 }), stone = rm('session', 0x7a746c, { r: 1 });
    rug('session', -1.2, -2.6, 3.2, 2.6, 0x5b2a2a);
    armchair('session', CHAIR.x, CHAIR.z, 0, leather);
    solid(CHAIR.x - 0.4, CHAIR.x + 0.4, CHAIR.z - 0.4, CHAIR.z + 0.4);

    (function () {                                                    // chaise du joueur (face à -z)
      const fb = furn(SEAT.x, SEAT.z, Math.PI), mSeat = rm('session', 0x4a3322, { r: 0.8 });
      fb(0.5, 0.06, 0.48, mSeat, 0, F + 0.45, 0);
      fb(0.5, 0.5, 0.05, mSeat, 0, F + 0.74, -0.215);
      [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(function (p) { fb(0.05, 0.43, 0.05, woodDark, p[0], F + 0.215, p[1]); });
      solid(SEAT.x - 0.32, SEAT.x + 0.32, SEAT.z - 0.32, SEAT.z + 0.32);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), new THREE.MeshBasicMaterial());
      hit.visible = false;
      hit.position.set(SEAT.x, F + 0.55, SEAT.z);
      hit.userData.use = 'seat';
      h.add(hit);
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
          const spine = new THREE.MeshStandardMaterial({ map: spineTexture(col, '#8a8a8a'), roughness: 0.8 });
          const cover = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.85 });
          const top = new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 1 });
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
          s.mats[0].map = spineTexture(color, accent);
          s.mats[0].needsUpdate = true;
          s.mats[1].color.set(color);
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
      const bw = rm('bedroom', 0xd4b090, { r: 0.8 }), mat = rm('bedroom', 0xf0e8de, { r: 1 }), pil = rm('bedroom', 0xf6f0e8, { r: 1 });
      const plaid = rm('bedroom', 0xf0e6e0, { r: 1, map: blanketTex, tile: [0.8, 0.8], mapId: 'b' });
      const bx0 = BED.x, hz0 = IZ0 + 0.05;                            // tête du lit contre le mur du fond
      addBox(1.55, 0.7, 0.08, bw, bx0, F + 0.8, hz0 + 0.04);          // tête de lit
      addBox(1.5, 0.22, 2.0, mat, bx0, F + 0.4, hz0 + 1.05);          // matelas
      addBox(1.55, 0.16, 2.05, bw, bx0, F + 0.22, hz0 + 1.05);        // sommier
      addBox(0.7, 0.14, 0.38, pil, bx0 - 0.35, F + 0.58, hz0 + 0.3);
      addBox(0.7, 0.14, 0.38, pil, bx0 + 0.35, F + 0.58, hz0 + 0.3);
      addBox(1.54, 0.06, 1.35, plaid, bx0, F + 0.53, hz0 + 1.45);     // plaid
      solid(bx0 - 0.8, bx0 + 0.8, IZ0, IZ0 + 2.1);
      // table de chevet
      addBox(0.5, 0.55, 0.45, rm('bedroom', 0x7a5a3c, { r: 0.8 }), NIGHT.x, F + 0.28, NIGHT.z);
      solid(NIGHT.x - 0.27, NIGHT.x + 0.27, NIGHT.z - 0.25, NIGHT.z + 0.25);
      addBox(0.05, 0.22, 0.05, woodDark, NIGHT.x + 0.12, F + 0.66, NIGHT.z - 0.05);
      lampShade('bedroom', NIGHT.x + 0.12, F + 0.86, NIGHT.z - 0.05, 0.08, 0.14, 0.18, 1.2);
      // armoire contre la cloison
      addBox(0.55, 2.1, 1.3, rm('bedroom', 0x6a5238, { r: 0.8 }), X_P3 + PT / 2 + 0.28, F + 1.05, -1.75);
      addBox(0.02, 1.9, 0.02, rm('bedroom', 0x2a1a10), X_P3 + PT / 2 + 0.57, F + 1.05, -1.75);
      solid(X_P3 + PT / 2, X_P3 + PT / 2 + 0.56, -2.4, -1.1);
      rug('bedroom', 2.6, -2.7, 2.2, 1.6, 0x4a5a70);
      // tableau au-dessus du lit
      const pm = paintMat('bedroom', paintingTex());
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.76), pm);
      pic.position.set(bx0, F + 1.9, IZ0 + 0.03);
      h.add(pic);
      const gold = rm('bedroom', 0x9a7a3a, { r: 0.5 });
      addBox(1.2, 0.07, 0.04, gold, bx0, F + 2.31, IZ0 + 0.02); addBox(1.2, 0.07, 0.04, gold, bx0, F + 1.49, IZ0 + 0.02);
      addBox(0.07, 0.82, 0.04, gold, bx0 - 0.575, F + 1.9, IZ0 + 0.02); addBox(0.07, 0.82, 0.04, gold, bx0 + 0.575, F + 1.9, IZ0 + 0.02);
      loadInto(pm, ['images/evelyn-tableau.jpg', 'images/evelyn-tableau.png']);

      // carnet intime sur la table de chevet
      const note = new THREE.Group();
      note.position.set(NIGHT.x - 0.08, F + 0.575, NIGHT.z + 0.02);
      note.rotation.y = 0.35;
      note.userData.use = 'diary';
      h.add(note);
      const nm = new THREE.MeshStandardMaterial({ color: 0x1f4a52, roughness: 0.6 });
      note.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.28), nm));
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.037, 0.28), new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.4, metalness: 0.5 }));
      strip.position.x = 0.07;
      note.add(strip);
      const nhit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.45), new THREE.MeshBasicMaterial());
      nhit.visible = false;
      note.add(nhit);
      addItem('diary', {
        rooms: ['bedroom'], x: NIGHT.x, z: NIGHT.z, range: 2.4,
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

  function applyRoom(room) {
    const s = E_OFF + (E_ON - E_OFF) * K[room] + (room === 'session' ? fireBonus : 0);
    const reg = REG[room];
    for (let i = 0; i < reg.length; i++) reg[i].mat.emissive.copy(reg[i].base).multiply(WARM).multiplyScalar(s);
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
    followLight.intensity = lightRoom ? 0.85 * lightFade : 0;
  }

  // ==========================================
  // INTÉRIEUR VIVANT : Evelyn, livres, carnet, téléphone, clics, déplacements
  // ==========================================

  let seated = false, zone = 'outside', raised = false, baseEye = null, curRoom = null;
  let hubActive = false, lastGreet = -1e9, hoverBook = -1, insideNow = false;
  const playerL = { x: 1e9, z: 1e9 };
  const hub = createHub(opts.action);

  function evelynHome() {
    try {
      const s = window.BadTherapistSociety, a = s && s.registry && s.registry.actor('evelyn');
      return !a || a.loc === 'therapist_house';
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
      const d = AVATAR_DIR, anims = {};
      Object.keys(AVATAR_ANIMS).forEach(function (k) { anims[k] = d + AVATAR_ANIMS[k]; });
      const ev = await loadMixamoAvatar({
        model: d + AVATAR_MODEL,
        textures: {
          map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png',
          roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png'
        },
        animations: anims,
        height: AVATAR_HEIGHT
      });
      evAvatar = ev;
      mixer = ev.mixer;
      avatar = new THREE.Group();
      avatar.add(ev.root);
      avatar.position.set(CHAIR.x + AVATAR_OFFSET.x, F + AVATAR_OFFSET.y, CHAIR.z + AVATAR_OFFSET.z);
      avatar.rotation.y = AVATAR_YAW;
      avatar.userData.use = 'therapist';
      h.add(avatar);
      window.BadTherapistAvatar = { ev: ev, group: avatar, actions: ev.actions, play: ev.play };   // pour régler à la main dans la console (F12)
      ev.play(ev.actions.sit ? 'sit' : (ev.actions.idle ? 'idle' : 'default'));
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

    // Livres : on les charge en même temps (loadBooks est défini avec l'étagère)
    reader = createBookReader();
    talk = createTherapistTalk({
      onSpeak: function (on) { if (evAvatar && evAvatar.actions.sit_talk) evAvatar.play(on ? 'sit_talk' : 'sit'); },
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

    // ── objets utilisables : assis, debout ──
    addItem('seat', {
      rooms: ['session'], x: SEAT.x, z: SEAT.z, range: 1.9,
      enabled: function () { return seated || evelynHome(); },
      label: function () { return seated ? 'STAND UP' : 'SIT'; },
      fn: function () { if (seated) standUp(); else sitDown(); }
    });

    function sitDown() {
      if (seated || !evelynHome()) return;
      seated = true;
      talk.hideBubble(true);
      if (opts.view) opts.view.set(Math.PI, -0.06);
      setTimeout(function () {
        if (seated && !talk.isOpen() && !reader.isOpen()) talk.open();           // la séance commence : Evelyn ouvre la discussion
      }, 900);
    }

    function standUp(silent) {
      if (!seated) return;
      seated = false;
      const p = toParent(SEAT.x + 0.8, SEAT.z);
      camera.position.x = origin.x + p.x;
      camera.position.z = origin.z + p.z;
      camera.position.y = (baseEye === null ? origin.y + gy + 1.7 : baseEye) + F;
      talk.endSession();                                                          // ferme la boîte, Evelyn fait son bilan (mémoire)
      if (!silent) talk.farewell();
    }

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
      if (zone === 'session' && prevZone !== 'session' && !seated && evelynHome() && performance.now() - lastGreet > 45000) {
        lastGreet = performance.now();
        talk.greetStanding();
      }
      if (zone !== 'session' && !seated && talk.isOpen()) talk.endSession();   // on s'éloigne en pleine conversation

      // hauteur des yeux (porche, marches, plancher) et verrouillage assis
      if (seated) {
        const sp = toParent(SEAT.x, SEAT.z - 0.02);
        camera.position.x = origin.x + sp.x;
        camera.position.z = origin.z + sp.z;
        camera.position.y = (baseEye === null ? origin.y + gy + 1.7 : baseEye) + F - 0.5;
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
          s.mats[0].emissive.copy(s.base).multiply(WARM).multiplyScalar(sc);
          s.mats[1].emissive.copy(s.mats[0].emissive);
          s.mats[2].emissive.copy(pagesColor).multiply(WARM).multiplyScalar(sc);
          if (s.glow > 0.003) { s.mats[0].emissive.r += s.glow; s.mats[0].emissive.g += s.glow * 0.78; s.mats[0].emissive.b += s.glow * 0.4; s.mats[1].emissive.copy(s.mats[0].emissive); }
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
          const ids = Object.keys(ITEMS);
          for (let i = 0; i < ids.length; i++) {
            const it = ITEMS[ids[i]];
            if (seated && it.id !== 'seat') continue;
            if (it.rooms.indexOf(zone) === -1) continue;
            if (it.enabled && !it.enabled()) continue;
            const dd = Math.hypot(l.x - it.x, l.z - it.z);
            if (dd <= it.range) hub.request(it.id, it.label(), it.fn, dd);
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
    interior: NEAR ? { isInside: function () { return insideNow; }, update: function () { } } : null,
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
