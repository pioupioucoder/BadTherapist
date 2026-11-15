import * as THREE from 'three';
import { PLACES, SEA } from './layout.js';
import { mats, box, glow, enterable, signMaterial, canvasTex, makeCanvas, FACE_YAW } from './common.js';
import { loadMixamoAvatar } from '../avatar-loader.js';

// ==========================================
// BAD THERAPIST — LE MAGASIN (places/store.js)
// ==========================================
// Séparé de town.js. Contient :
//   - le bâtiment (porte OPEN / CLOSE comme avant, id 'town-shop')
//   - des rayons : boissons, épicerie longue conservation, conserves, snacks, hygiène, livres, vidéos
//   - Véri, assise derrière la caisse (avatars/veri/) : Sitting / priceonebyingthings / validateprice
//   - le panier : bouton PRENDRE devant un produit, puis PASSER EN CAISSE près du comptoir
//   - la caisse : à chaque article, Véri joue « priceonebyingthings » + bip + ligne sur l'écran ;
//     une seule fois à la fin « validateprice », puis le TOTAL s'affiche et on lui DONNE L'ARGENT
//   - un distributeur devant la porte (décor pour l'instant)
//
// BRANCHEMENTS PRÉVUS (rien n'est cassé s'ils n'existent pas encore) :
//   window.BadTherapistMoney.pay(montant, 'store') -> true / false   (système d'argent, plus tard)
//   window.BadTherapistInventory.add(objet)                          (inventaire, plus tard)
//   évènement 'bt-store-purchase' (detail: { items, total }) sur window : chaque article acheté,
//   avec item.video = 'videos/xxx.mp4' pour les vidéos (à brancher sur le téléphone plus tard)
//   CONF.isOpen() : renvoie false la nuit (Véri disparaît, plus d'achat)
//
// Réglage de Véri en direct (console du navigateur) :
//   BadTherapistStore.tune({ x: 3.7, z: -4.4, y: 0, yaw: 0 })

const CONF = {
  rx: -15, rz: 47,                 // position relative au centre de la ville (comme avant dans town.js)
  w: 12, d: 14, h: 4.8, face: 'e', pal: 1,
  currency: '$',
  isOpen: function () { return true; },   // plus tard : brancher l'horloge du jeu (fermé la nuit)
  veri: { x: 3.7, y: 0, z: -4.4, yaw: 0, height: 1.66 }
};

// ---------- catalogue (prix en centimes) ----------
// [id, nom, prix, couleur de l'étiquette, forme, { img: 'images/...png', video: 'videos/...mp4' }]
// Pour mettre une vraie image sur un produit : ajoute { img: 'images/products/xxx.png' } en dernier.
const SHAPES = {
  bottle: { cyl: 1, w: 0.085, h: 0.26, d: 0.085 },
  can:    { cyl: 1, w: 0.07, h: 0.12, d: 0.07 },
  jar:    { cyl: 1, w: 0.09, h: 0.11, d: 0.09 },
  box:    { w: 0.14, h: 0.22, d: 0.08 },
  bag:    { w: 0.2, h: 0.25, d: 0.07 },
  pack:   { w: 0.2, h: 0.12, d: 0.12 },
  book:   { w: 0.035, h: 0.24, d: 0.16 },
  vcase:  { w: 0.15, h: 0.2, d: 0.025 }
};

const DRINKS = [
  ['eau', 'Eau minérale', 90, '#6fb1d6', 'bottle'], ['soda', 'Soda cola', 150, '#a31f1a', 'can'],
  ['jus', 'Jus d\'orange', 200, '#e38b13', 'box'], ['lait', 'Lait UHT', 130, '#e9ecf2', 'box'],
  ['cafe', 'Café glacé', 210, '#6a4126', 'can'], ['the', 'Thé glacé', 180, '#c4a024', 'bottle'],
  ['limo', 'Limonade', 140, '#9bd13b', 'bottle'], ['nrj', 'Boisson énergisante', 250, '#1f9a57', 'can']
];
const DRY = [
  ['pates', 'Pâtes', 160, '#d9b24a', 'pack'], ['riz', 'Riz', 210, '#cfd6c4', 'bag'],
  ['farine', 'Farine', 150, '#e8e1cf', 'bag'], ['sucre', 'Sucre', 140, '#f1f1f1', 'bag'],
  ['cereales', 'Céréales', 320, '#d86a2a', 'box'], ['cafem', 'Café moulu', 420, '#4a2f1d', 'pack'],
  ['the2', 'Thé noir', 250, '#2f6b3a', 'box'], ['semoule', 'Semoule', 170, '#e0c25a', 'bag']
];
const CANNED = [
  ['haricots', 'Haricots', 120, '#a8452f', 'can'], ['thon', 'Thon', 200, '#2a6fa8', 'can'],
  ['mais', 'Maïs', 110, '#e5c335', 'can'], ['tomates', 'Tomates pelées', 130, '#c0392b', 'can'],
  ['soupe', 'Soupe', 180, '#8a5a2b', 'can'], ['sardines', 'Sardines', 150, '#3b7ea1', 'can'],
  ['pois', 'Pois chiches', 125, '#c9a46a', 'can'], ['confiture', 'Confiture', 260, '#8e2a5a', 'jar']
];
const SNACKS = [
  ['biscuits', 'Biscuits', 170, '#b8742d', 'box'], ['chips', 'Chips', 190, '#e0a21b', 'bag'],
  ['choco', 'Chocolat', 160, '#5a3320', 'pack'], ['barre', 'Barre énergétique', 100, '#7a8f2a', 'pack'],
  ['noix', 'Noix', 300, '#a9753f', 'bag'], ['bonbons', 'Bonbons', 130, '#d83a7a', 'bag'],
  ['popcorn', 'Pop-corn', 150, '#e8d04a', 'bag'], ['painm', 'Pain de mie', 180, '#d9b777', 'bag']
];
const HYG = [
  ['savon', 'Savon', 120, '#6ac1c9', 'pack'], ['dentifrice', 'Dentifrice', 220, '#2a8ad1', 'box'],
  ['papier', 'Papier toilette', 300, '#f0f0f0', 'bag'], ['piles', 'Piles', 350, '#c59a1a', 'pack'],
  ['ampoule', 'Ampoule', 280, '#e8e3c0', 'box'], ['bougies', 'Bougies', 260, '#c8b087', 'box'],
  ['mouchoirs', 'Mouchoirs', 110, '#8fb8d8', 'pack'], ['allum', 'Allumettes', 60, '#8a2a1a', 'box']
];
const PANTRY = [
  ['huile', 'Huile', 280, '#d8b42a', 'bottle'], ['miel', 'Miel', 450, '#d99a1a', 'jar'],
  ['pate', 'Pâte à tartiner', 380, '#5a3320', 'jar'], ['sauce', 'Sauce tomate', 200, '#b83a2a', 'jar'],
  ['puree', 'Purée', 150, '#e0cf9a', 'box'], ['lentilles', 'Lentilles', 190, '#8a6a3a', 'bag'],
  ['muesli', 'Muesli', 340, '#c88a3a', 'box'], ['compote', 'Compote', 160, '#d8802a', 'jar'],
  ['fruitsec', 'Fruits secs', 330, '#8a4a2a', 'bag'], ['vinaigre', 'Vinaigre', 170, '#9a2a3a', 'bottle']
];
const BOOKS = [
  ['roman', 'Roman', 800, '#4a3a6a', 'book'], ['polar', 'Polar', 850, '#2a2a30', 'book'],
  ['cuisine', 'Livre de cuisine', 1200, '#b8542a', 'book'], ['poemes', 'Poèmes', 700, '#2f5a4a', 'book'],
  ['montagne', 'Guide de la montagne', 1000, '#3a5a8a', 'book'], ['psy', 'Manuel de psychologie', 1500, '#6a2a3a', 'book']
];
const VIDEOS = [
  ['film1', 'Vidéo 1', 500, '#3a2a6a', 'vcase', { video: 'videos/video1.mp4' }]
  // ajoute ici d'autres vidéos : ['film2', 'Vidéo 2', 500, '#...', 'vcase', { video: 'videos/video2.mp4' }]
];

const PRODUCTS = {};
[DRINKS, DRY, CANNED, SNACKS, HYG, PANTRY, BOOKS, VIDEOS].forEach(function (list) {
  list.forEach(function (r) {
    const ex = r[5] || {};
    PRODUCTS[r[0]] = { id: r[0], name: r[1], price: r[2], color: r[3], shape: r[4], img: ex.img || null, video: ex.video || null, mat: null };
  });
});
const ids = function (list) { return list.map(function (r) { return r[0]; }); };

// ---------- petits outils ----------
function fmt(c) { return (c / 100).toFixed(2) + ' ' + CONF.currency; }

const _geo = {};
function shapeGeo(key) {
  if (_geo[key]) return _geo[key];
  const s = SHAPES[key];
  _geo[key] = s.cyl ? new THREE.CylinderGeometry(s.w / 2, s.w / 2, s.h, 8) : new THREE.BoxGeometry(s.w, s.h, s.d);
  return _geo[key];
}

function labelTex(name, color) {
  const c = makeCanvas(128, 128), k = c.getContext('2d');
  k.fillStyle = color; k.fillRect(0, 0, 128, 128);
  k.fillStyle = 'rgba(255,255,255,0.9)'; k.fillRect(0, 34, 128, 60);
  k.fillStyle = '#1a1a1a'; k.font = 'bold 17px Arial, sans-serif';
  k.textAlign = 'center'; k.textBaseline = 'middle';
  const words = name.split(' '), lines = []; let cur = '';
  words.forEach(function (w) {
    const t = cur ? cur + ' ' + w : w;
    if (k.measureText(t).width > 116 && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  lines.push(cur);
  lines.slice(0, 3).forEach(function (l, i, arr) { k.fillText(l, 64, 64 + (i - (arr.length - 1) / 2) * 20); });
  return canvasTex(c);
}

function productMat(p) {
  if (p.mat) return p.mat;
  const t = labelTex(p.name, p.color);
  p.mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0x606060, roughness: 0.85 });
  if (p.img) {
    new THREE.TextureLoader().load(p.img, function (tx) {
      if (THREE.sRGBEncoding) tx.encoding = THREE.sRGBEncoding;
      p.mat.map = tx; p.mat.emissiveMap = tx; p.mat.needsUpdate = true;
    });
  }
  return p.mat;
}

function plane(parent, w, h, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  parent.add(m);
  return m;
}

// message à l'écran
let _toast = null, _toastT = 0;
function toast(msg) {
  if (typeof document === 'undefined') return;
  if (!_toast) {
    _toast = document.createElement('div');
    _toast.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);background:rgba(10,10,12,.85);color:#f2e6cc;padding:10px 18px;border-radius:10px;font:15px Arial,sans-serif;z-index:9000;pointer-events:none;opacity:0;transition:opacity .25s';
    document.body.appendChild(_toast);
  }
  _toast.textContent = msg; _toast.style.opacity = '1';
  clearTimeout(_toastT);
  _toastT = setTimeout(function () { _toast.style.opacity = '0'; }, 2800);
}

// petit panneau « panier » en bas à gauche
let _hud = null, _hudTxt = '';
function hud(txt) {
  if (typeof document === 'undefined') return;
  if (txt === _hudTxt) return;
  _hudTxt = txt;
  if (!_hud) {
    _hud = document.createElement('div');
    _hud.style.cssText = 'position:fixed;left:14px;bottom:14px;background:rgba(10,10,12,.78);color:#f2e6cc;padding:8px 14px;border-radius:10px;font:14px Arial,sans-serif;z-index:8000;pointer-events:none;display:none';
    document.body.appendChild(_hud);
  }
  _hud.textContent = txt;
  _hud.style.display = txt ? 'block' : 'none';
}

// bip de la caisse
let _ac = null;
function bip(freq, dur) {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.type = 'square'; o.frequency.value = freq || 1500; g.gain.value = 0.04;
    o.connect(g); g.connect(_ac.destination);
    o.start(); o.stop(_ac.currentTime + (dur || 0.08));
  } catch (e) { /* pas de son : tant pis */ }
}

// ---------- distributeur (devant la porte) ----------
function vendTex() {
  const c = makeCanvas(256, 416), k = c.getContext('2d');
  k.fillStyle = '#10243f'; k.fillRect(0, 0, 256, 416);
  k.fillStyle = '#e8d6a8'; k.font = 'bold 26px Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle';
  k.fillText('BOISSONS', 128, 28);
  const cols = ['#a31f1a', '#e38b13', '#6fb1d6', '#1f9a57', '#c4a024', '#6a4126', '#9bd13b', '#e9ecf2', '#2a6fa8'];
  for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) {
    const x = 14 + q * 58, y = 56 + r * 72;
    k.fillStyle = '#05101c'; k.fillRect(x - 3, y - 3, 52, 62);
    k.fillStyle = cols[(r * 3 + q) % cols.length]; k.fillRect(x, y, 46, 40);
    k.fillStyle = '#ddd'; k.font = '12px Arial'; k.fillText('A' + (r * 3 + q + 1) + '  1.50', x + 23, y + 50);
  }
  k.fillStyle = '#1b1b1d'; k.fillRect(188, 56, 56, 160);
  k.fillStyle = '#35ff7a'; k.fillRect(194, 62, 44, 18);
  k.fillStyle = '#888';
  for (let i = 0; i < 9; i++) k.fillRect(194 + (i % 3) * 15, 92 + Math.floor(i / 3) * 18, 12, 13);
  k.fillStyle = '#05101c'; k.fillRect(30, 350, 130, 50);
  return canvasTex(c);
}

// ==========================================
// CONSTRUCTION
// ==========================================
export function buildStore(scene, env) {

  const P = PLACES.town, S = env.sites.town;
  const Y = S.y;
  const M = mats();
  const ox = P.x + CONF.rx, oz = P.z + CONF.rz;
  const yaw = FACE_YAW[CONF.face];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const V = CONF.veri;
  const PAD = { x: 2.7, z: -3.15 };

  // rectangle local -> collision monde
  function wrect(x0, x1, z0, z1) {
    let ax = 1e9, bx = -1e9, az = 1e9, bz = -1e9;
    [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].forEach(function (p) {
      const wx = ox + p[0] * cy + p[1] * sy, wz = oz - p[0] * sy + p[1] * cy;
      ax = Math.min(ax, wx); bx = Math.max(bx, wx); az = Math.min(az, wz); bz = Math.max(bz, wz);
    });
    env.rects.push({ x0: ax, x1: bx, z0: az, z1: bz });
  }

  // ---------- état ----------
  const anchors = [];                 // où l'on peut prendre chaque produit (repère du bâtiment)
  const instances = {};               // id -> matrices (un seul dessin par produit)
  const basket = [];
  let A = null, curAct = null;        // Véri
  let seq = null;                     // séquence de caisse
  let totalShown = false, running = 0, screenLines = [], thanksT = 0, flash = 0;
  let innerRef = null, padMesh = null, scanMat = null;
  let open = true;
  let lastP = { x: 0, z: 0 }, wasInside = false, snowList = null;
  let dbgOn = false, dbgEl = null, dbgT = 0, dbgPrev = null;
  function dbgShow(t) {
    if (typeof document === 'undefined') return;
    if (!dbgEl) {
      dbgEl = document.createElement('div');
      dbgEl.style.cssText = 'position:fixed;left:8px;top:8px;background:rgba(0,0,0,.75);color:#7dff9a;padding:6px 10px;border-radius:6px;font:12px monospace;z-index:99999;pointer-events:none;white-space:pre';
      document.body.appendChild(dbgEl);
    }
    dbgEl.textContent = t; dbgEl.style.display = t ? 'block' : 'none';
  }

  // écran de la caisse
  const scr = makeCanvas(256, 160), sk = scr.getContext('2d');
  const scrTex = canvasTex(scr);
  function drawScreen() {
    sk.fillStyle = '#07140c'; sk.fillRect(0, 0, 256, 160);
    sk.fillStyle = '#7dff9a'; sk.textBaseline = 'middle';
    sk.font = 'bold 13px monospace'; sk.textAlign = 'left';
    if (!screenLines.length && !totalShown) {
      sk.font = 'bold 22px monospace'; sk.textAlign = 'center';
      sk.fillText(thanksT > 0 ? 'MERCI !' : 'BIENVENUE', 128, 60);
      sk.font = '13px monospace'; sk.fillText('CAISSE VERI', 128, 100);
    } else {
      screenLines.slice(-5).forEach(function (it, i) {
        sk.textAlign = 'left'; sk.fillText(it.name.slice(0, 17), 10, 14 + i * 18);
        sk.textAlign = 'right'; sk.fillText(fmt(it.price), 246, 14 + i * 18);
      });
      sk.fillStyle = '#c8ffd4'; sk.fillRect(8, 108, 240, 2);
      sk.fillStyle = '#7dff9a';
      sk.textAlign = 'left'; sk.font = (totalShown ? 'bold 24px' : 'bold 15px') + ' monospace';
      sk.fillText(totalShown ? 'TOTAL' : 'EN COURS', 10, 134);
      sk.textAlign = 'right'; sk.fillText(fmt(running), 246, 134);
    }
    scrTex.needsUpdate = true;
  }
  drawScreen();

  // ---------- Véri ----------
  function go(name, once) {
    if (!A) return 0;
    const next = A.actions[name] || (name === 'sit' ? A.actions.default : null);
    if (!next) return 0;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = !!once;
    next.setEffectiveWeight(1); next.setEffectiveTimeScale(1);
    next.play();
    if (curAct && curAct !== next) curAct.crossFadeTo(next, 0.25, false);
    curAct = next;
    return next.getClip().duration;
  }
  function applyVeri() {
    if (!A) return;
    A.root.position.set(V.x, V.y, V.z);
    A.root.rotation.y = V.yaw;
  }
  function loadVeri(parent) {
    const d = 'avatars/veri/';
    loadMixamoAvatar({
      model: d + 'veri.fbx',
      textures: { map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png', roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png' },
      animations: { sit: d + 'Sitting.fbx', scan: d + 'priceonebyingthings.fbx', validate: d + 'validateprice.fbx' },
      height: V.height
    }).then(function (a) {
      A = a;
      parent.add(a.root);
      applyVeri();
      go('sit');
    }).catch(function (e) {
      console.warn('[store] Véri introuvable :', e && e.message ? e.message : e);
    });
  }

  // ---------- caisse : séquence ----------
  function showPad(it) {
    if (padMesh && padMesh.parent) padMesh.parent.remove(padMesh);
    const sh = SHAPES[it.shape];
    padMesh = new THREE.Mesh(shapeGeo(it.shape), productMat(it));
    padMesh.position.set(PAD.x, 1.08 + sh.h / 2, PAD.z);
    padMesh.userData.dyn = true;
    innerRef.add(padMesh);
  }
  function hidePad() { if (padMesh && padMesh.parent) padMesh.parent.remove(padMesh); padMesh = null; }

  function startCheckout() {
    if (seq || !basket.length) return;
    seq = { phase: 'scan', i: 0, t: 0, dur: 1, started: false, beeped: false, vstarted: false };
    screenLines = []; running = 0; totalShown = false; thanksT = 0;
    drawScreen();
  }

  function seqUpdate(dt) {
    if (!seq) return;
    seq.t += dt;
    if (seq.phase === 'scan') {
      const it = basket[seq.i];
      if (!seq.started) { seq.started = true; seq.t = 0; seq.beeped = false; seq.dur = go('scan', true) || 1.1; showPad(it); }
      if (!seq.beeped && seq.t >= seq.dur * 0.45) {
        seq.beeped = true; flash = 0.25; bip(1500, 0.09);
        screenLines.push(it); running += it.price; drawScreen();
      }
      if (seq.t >= seq.dur) {
        hidePad(); seq.i++; seq.started = false;
        if (seq.i >= basket.length) seq.phase = 'validate';
      }
    } else if (seq.phase === 'validate') {
      if (!seq.vstarted) { seq.vstarted = true; seq.t = 0; seq.dur = go('validate', true) || 1.3; }
      if (seq.t >= seq.dur) {
        go('sit');
        totalShown = true; drawScreen(); bip(900, 0.2);
        seq.phase = 'pay';
      }
    }
  }

  function pay() {
    if (!seq || seq.phase !== 'pay') return;
    const total = running;
    const m = window.BadTherapistMoney;
    if (m && typeof m.pay === 'function') {
      if (!m.pay(total / 100, 'store')) { toast('Véri : Il vous manque de l\'argent.'); return; }
    }
    const items = basket.map(function (p) { return { id: p.id, name: p.name, price: p.price / 100, video: p.video || null }; });
    const inv = window.BadTherapistInventory;
    if (inv && typeof inv.add === 'function') items.forEach(function (it) { inv.add(it); });
    try { window.dispatchEvent(new CustomEvent('bt-store-purchase', { detail: { items: items, total: total / 100 } })); } catch (e) { /* ignore */ }
    basket.length = 0;
    seq = null; screenLines = []; running = 0; totalShown = false; thanksT = 3;
    drawScreen();
    toast('Véri : Merci, bonne journée !');
  }

  function take(p) {
    basket.push(p);
    bip(700, 0.05);
    toast(p.name + ' ajouté au panier');
  }

  // ---------- bâtiment ----------
  let shellGroupPending = null;            // le distributeur est créé dans fill puis rattaché au groupe du bâtiment
  const shell = enterable(scene, env, {
    x: ox, y: Y, z: oz, id: 'town-shop', w: CONF.w, d: CONF.d, h: CONF.h, face: CONF.face, pal: CONF.pal, doorDz: 0, doorW: 2.4, doorH: 2.6, sign: 'STORE', clickDoor: true,
    fill: function (inner, a) {
      innerRef = inner;

      // sol carrelé
      const ft = makeCanvas(64, 64), fk = ft.getContext('2d');
      fk.fillStyle = '#bdb8ac'; fk.fillRect(0, 0, 64, 64);
      fk.fillStyle = '#8f8b80'; fk.fillRect(0, 0, 32, 32); fk.fillRect(32, 32, 32, 32);
      const ftex = canvasTex(ft, 5.8, 6.8);
      const fl = plane(inner, 11.6, 13.6, new THREE.MeshStandardMaterial({ map: ftex, emissiveMap: ftex, emissive: 0x555555, roughness: 0.9 }), 0, 0.075, 0, 0);
      fl.rotation.x = -Math.PI / 2;

      // néons au plafond
      [-3, 0.5, 4].forEach(function (x) { [-3.2, 3].forEach(function (z) { box(inner, 1.8, 0.06, 0.25, M.warm, x, a.h - 0.14, z); }); });
      glow(inner, 0, a.h - 0.5, 0, 0xffe0b0, 7, 0.22);

      // ----- rayons -----
      const UNITS = [
        { name: 'BOISSONS',   x: -5.6, z: 0.15, yaw: Math.PI / 2,  len: 11.6, D: 0.5, H: 2.3, L: 5, ids: ids(DRINKS) },
        { name: 'ÉPICERIE',   x: 0,    z: 6.6,  yaw: Math.PI,      len: 10.2, D: 0.5, H: 2.3, L: 5, ids: ids(PANTRY) },
        { name: 'LIVRES',     x: -2.25, z: -6.6, yaw: 0,           len: 5.3,  D: 0.5, H: 2.3, L: 5, ids: ids(BOOKS) },
        { name: 'PÂTES & RIZ', x: 0.4,  z: 3.4,  yaw: Math.PI / 2,  len: 3.6,  D: 0.4, H: 1.9, L: 4, ids: ids(DRY) },
        { name: 'CONSERVES',  x: 0.0,  z: 3.4,  yaw: -Math.PI / 2, len: 3.6,  D: 0.4, H: 1.9, L: 4, ids: ids(CANNED) },
        { name: 'SNACKS',     x: -2.6, z: 3.4,  yaw: Math.PI / 2,  len: 3.6,  D: 0.4, H: 1.9, L: 4, ids: ids(SNACKS) },
        { name: 'HYGIÈNE',    x: -3.0, z: 3.4,  yaw: -Math.PI / 2, len: 3.6,  D: 0.4, H: 1.9, L: 4, ids: ids(HYG) },
        { name: 'VIDÉOS',     x: -2.4, z: -4.9, yaw: 0,            len: 1.4,  D: 0.4, H: 1.9, L: 4, ids: ids(VIDEOS) },
        { name: null, decor: true, x: 3.5, z: -6.6, yaw: 0, len: 4.4, D: 0.5, H: 2.3, L: 5, ids: ['soda', 'eau', 'jus', 'lait', 'cafe'] }   // réserve derrière Véri
      ];
      const MAXROW = 9, one = new THREE.Vector3(1, 1, 1);
      UNITS.forEach(function (u) {
        const c = Math.cos(u.yaw), s = Math.sin(u.yaw);
        const g = new THREE.Group();
        g.position.set(u.x, 0, u.z); g.rotation.y = u.yaw;
        inner.add(g);
        box(g, u.len, u.H, 0.04, M.concreteDark, 0, u.H / 2, -u.D / 2 + 0.02);
        box(g, 0.05, u.H, u.D, M.metal, -u.len / 2, u.H / 2, 0);
        box(g, 0.05, u.H, u.D, M.metal, u.len / 2, u.H / 2, 0);
        box(g, u.len, 0.05, u.D, M.metal, 0, u.H, 0);
        const step = (u.H - 0.5) / u.L, tops = [];
        for (let i = 0; i < u.L; i++) {
          const y = 0.15 + i * step;
          tops.push(y + 0.02);
          box(g, u.len, 0.04, u.D, M.woodLight, 0, y, 0);
        }
        if (u.name) plane(g, 1.7, 0.42, signMaterial(u.name, '#1d2a33', '#f0e2b8'), 0, u.H + 0.38, u.D / 2 + 0.01, 0);

        const k = u.ids.length, colW = (u.len - 0.1) / k;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), u.yaw);
        u.ids.forEach(function (id, j) {
          const p = PRODUCTS[id], sh = SHAPES[p.shape];
          productMat(p);
          const cx = -u.len / 2 + 0.05 + (j + 0.5) * colW;
          const pitch = sh.w + 0.025;
          const n = Math.max(1, Math.min(MAXROW, Math.floor((colW - 0.03) / pitch)));
          const x0 = cx - (n - 1) * pitch / 2;
          const lz = u.D / 2 - sh.d / 2 - 0.04;
          (instances[id] = instances[id] || []);
          for (let r = 0; r < tops.length; r++) for (let t = 0; t < n; t++) {
            const lx = x0 + t * pitch;
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(u.x + lx * c + lz * s, tops[r] + sh.h / 2, u.z - lx * s + lz * c), q, one);
            instances[id].push(m);
          }
          if (!u.decor) anchors.push({ id: id, x: u.x + cx * c + (u.D / 2 + 0.55) * s, z: u.z - cx * s + (u.D / 2 + 0.55) * c });
        });
      });
      Object.keys(instances).forEach(function (id) {
        const arr = instances[id], p = PRODUCTS[id];
        const im = new THREE.InstancedMesh(shapeGeo(p.shape), productMat(p), arr.length);
        arr.forEach(function (m, i) { im.setMatrixAt(i, m); });
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        inner.add(im);
      });

      // ----- comptoir + zone de Véri -----
      box(inner, 4.85, 1.0, 0.8, M.wood, 3.425, 0.5, -3.2);
      box(inner, 4.95, 0.06, 0.9, M.woodLight, 3.425, 1.03, -3.2);
      box(inner, 0.2, 1.05, 3.25, M.wood, 1.1, 0.525, -5.225);            // cloison de la caisse
      // tabouret
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), M.metalLight);
      stool.position.set(V.x, 0.46, V.z - 0.12); inner.add(stool);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.44, 8), M.metal);
      post.position.set(V.x, 0.22, V.z - 0.12); inner.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12), M.metal);
      foot.position.set(V.x, 0.015, V.z - 0.12); inner.add(foot);
      // caisse enregistreuse (écran incliné vers le client)
      box(inner, 0.52, 0.14, 0.42, M.metal, 4.75, 1.13, -3.25);
      const reg = new THREE.Group();
      reg.position.set(4.75, 1.45, -3.22); reg.rotation.x = -0.2; inner.add(reg);
      box(reg, 0.64, 0.4, 0.05, M.dark, 0, 0, 0);
      const sp = plane(reg, 0.58, 0.36, new THREE.MeshBasicMaterial({ map: scrTex }), 0, 0, 0.027, 0);
      sp.userData.dyn = true;
      // scanner (bip)
      box(inner, 0.5, 0.03, 0.36, M.dark, PAD.x, 1.065, PAD.z);
      scanMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.03), scanMat);
      strip.position.set(PAD.x, 1.085, PAD.z); strip.userData.dyn = true; inner.add(strip);
      // lampe de comptoir
      box(inner, 0.12, 0.3, 0.12, M.metal, 5.4, 1.2, -3.2);

      // ----- affiches -----
      plane(inner, 1.3, 0.9, signMaterial('PROMO', '#7a1f16', '#f6e7c4', 256, 180), -5.82, 3.7, -3.4, Math.PI / 2);
      plane(inner, 1.3, 0.9, signMaterial('OUVERT', '#16406a', '#f6e7c4', 256, 180), -5.82, 3.7, 3.2, Math.PI / 2);

      // ----- distributeur devant la porte -----
      const vg = new THREE.Group();
      vg.position.set(6.6, 0, 3.4);
      shellGroupPending = vg;
      const bodyM = new THREE.MeshStandardMaterial({ color: 0x1d3f72, roughness: 0.6, metalness: 0.3 });
      box(vg, 0.8, 1.95, 1.15, bodyM, 0, 0.975, 0);
      plane(vg, 0.95, 1.55, new THREE.MeshBasicMaterial({ map: vendTex() }), 0.405, 1.12, 0, Math.PI / 2);
      box(vg, 0.04, 0.26, 0.5, M.dark, 0.41, 0.3, -0.15);
      box(vg, 0.04, 0.16, 0.1, M.metalLight, 0.41, 0.9, 0.38);
      glow(vg, 0.9, 1.2, 0, 0x9ad0ff, 3.0, 0.3);

      // ----- collisions -----
      wrect(1.0, 5.85, -3.6, -2.8);        // comptoir
      wrect(1.0, 1.2, -6.85, -3.6);        // cloison
      wrect(-5.85, -5.35, -5.65, 5.95);    // mur de boissons
      wrect(-5.1, 5.1, 6.35, 6.85);        // mur d'épicerie
      wrect(-4.9, 0.4, -6.85, -6.35);      // livres
      wrect(-0.2, 0.6, 1.6, 5.2);          // gondole 1
      wrect(-3.2, -2.4, 1.6, 5.2);         // gondole 2
      wrect(-3.1, -1.7, -5.1, -4.7);       // présentoir vidéos
      wrect(6.2, 7.0, 2.8, 4.0);           // distributeur
    }
  });

  shell.group.add(shellGroupPending);

  // La limite « mer » (index.js : le joueur ne dépasse pas SEA.z0 - 5) coupe le magasin en deux si la façade est plus au sud.
  // On libère la limite autour du magasin (+ 5 m de marge) pour pouvoir entrer par la porte.
  const m5 = Math.max(CONF.w, CONF.d) / 2 + 5;
  if (env.noSea) env.noSea.push({ x0: ox - m5, x1: ox + m5, z0: oz - m5, z1: oz + m5 });
  loadVeri(shell.group);            // chargée pendant l'écran de chargement (avatar-loader.js retient l'écran jusqu'à ce qu'elle soit prête)

  window.BadTherapistStore = {
    tune: function (o) { Object.assign(V, o || {}); applyVeri(); console.log('[store] Véri :', JSON.stringify(V)); },
    basket: function () { return basket.slice(); },
    veri: function () { return A; },
    // Diagnostic : PORTE OUVERTE, tape BadTherapistStore.doorCheck() dans la console.
    // Il liste les rectangles de collision qui bouchent le passage de la porte (rien ne doit apparaître).
    doorCheck: function () {
      const zone = [[4.8, -0.7], [4.8, 0.7], [7.4, -0.7], [7.4, 0.7]].map(function (p) {
        return { x: ox + p[0] * cy + p[1] * sy, z: oz - p[0] * sy + p[1] * cy };
      });
      const x0 = Math.min.apply(null, zone.map(function (p) { return p.x; })), x1 = Math.max.apply(null, zone.map(function (p) { return p.x; }));
      const z0 = Math.min.apply(null, zone.map(function (p) { return p.z; })), z1 = Math.max.apply(null, zone.map(function (p) { return p.z; }));
      const out = [];
      env.rects.forEach(function (r, i) {
        if (r.x1 > x0 && r.x0 < x1 && r.z1 > z0 && r.z0 < z1) out.push({ index: i, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
      });
      console.log('[store] zone de la porte x ' + x0.toFixed(2) + '..' + x1.toFixed(2) + ' z ' + z0.toFixed(2) + '..' + z1.toFixed(2) + ' : ' + out.length + ' bloc(s)');
      if (out.length) console.table(out);
      return out;
    },
    // Diagnostic : tape BadTherapistStore.blockers() là où tu es bloqué. Liste les collisions à moins de 1,5 m du joueur.
    blockers: function () {
      const dx = lastP.x - ox, dz = lastP.z - oz;
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
      const out = [];
      env.rects.forEach(function (r, i) {
        const cx = Math.max(r.x0, Math.min(r.x1, lastP.x)), cz = Math.max(r.z0, Math.min(r.z1, lastP.z));
        const d = Math.hypot(lastP.x - cx, lastP.z - cz);
        if (d < 1.5) out.push({ index: i, distance: +d.toFixed(2), x0: +r.x0.toFixed(2), x1: +r.x1.toFixed(2), z0: +r.z0.toFixed(2), z1: +r.z1.toFixed(2) });
      });
      console.log('[store] joueur : monde x ' + lastP.x.toFixed(2) + ' z ' + lastP.z.toFixed(2) + ' | repère du magasin x ' + lx.toFixed(2) + ' z ' + lz.toFixed(2) + ' (la porte est à x = 6)');
      console.table(out);
      return out;
    },
    snow: function () { snowList = null; return findSnow(); },
    // Affichage de debug en haut à gauche : BadTherapistStore.debug(true) / debug(false)
    debug: function (on) { dbgOn = on !== false; if (!dbgOn) dbgShow(''); },
    // Téléporte le joueur dans le magasin (repère du magasin : x = 6 est la porte, x = 0 le milieu, z = 0 l'axe de la porte)
    go: function (lx, lz) {
      if (!env.camera) return 'pas de caméra';
      lx = lx == null ? 2 : lx; lz = lz == null ? 0 : lz;
      env.camera.position.x += (ox + lx * cy + lz * sy) - lastP.x;
      env.camera.position.z += (oz - lx * sy + lz * cy) - lastP.z;
      return 'ok';
    }
  };

  // ---------- neige : coupée à l'intérieur ----------
  // On cherche les nuages de particules (THREE.Points) de la scène ; on les cache tant que le joueur est dans le magasin.
  function findSnow() {
    if (snowList && snowList.length) return snowList;
    let root = scene;
    while (root.parent) root = root.parent;
    snowList = [];
    root.traverse(function (n) {
      if (n.isPoints && n.geometry && n.geometry.attributes.position && n.geometry.attributes.position.count > 100) snowList.push(n);
    });
    return snowList;
  }

  // zone sans neige : l'intérieur du magasin (le système de neige de world_base.html sait exclure jusqu'à 6 boîtes)
  let snowDone = false;
  function snowExclude() {
    const sn = window.BadTherapistSnow;
    if (snowDone || !sn || typeof sn.excludeBox !== 'function') return;
    snowDone = true;
    shell.group.updateWorldMatrix(true, false);
    const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9), v = new THREE.Vector3();
    [-1, 1].forEach(function (sx) { [0, 1].forEach(function (sh) { [-1, 1].forEach(function (sz) {
      v.set(sx * CONF.w / 2, sh ? CONF.h + 0.3 : -0.1, sz * CONF.d / 2);
      shell.group.localToWorld(v);
      mn.min(v); mx.max(v);
    }); }); });
    sn.excludeBox(mn.x, mn.y, mn.z, mx.x, mx.y, mx.z);
  }

  // ---------- mise à jour ----------
  const cnt = { x: 3.0, z: -1.9 };         // point « client » devant le comptoir
  return {
    update: function (dt, time, px, pz, active) {
      shell.update(dt, px, pz, active);
      snowExclude();
      if (dbgOn) {
        const ddx = px - ox, ddz = pz - oz;
        const llx = ddx * cy - ddz * sy, llz = ddx * sy + ddz * cy;
        let near = [];
        env.rects.forEach(function (r, i) {
          const cx = Math.max(r.x0, Math.min(r.x1, px)), cz = Math.max(r.z0, Math.min(r.z1, pz));
          const d = Math.hypot(px - cx, pz - cz);
          if (d < 0.8) near.push('#' + i + ' d=' + d.toFixed(2));
        });
        dbgShow('magasin x ' + llx.toFixed(2) + '  z ' + llz.toFixed(2) + '   (porte : x 6, z -1.2..1.2)\n' +
          'porte ' + (shell.isOpen() ? 'OUVERTE' : 'fermée') + '   dans le magasin : ' + (Math.abs(llx) < CONF.w / 2 && Math.abs(llz) < CONF.d / 2) + '\n' +
          'collisions < 0.8 m : ' + (near.length ? near.join(', ') : 'aucune') +
          (dbgPrev ? '\nbouge de ' + Math.hypot(px - dbgPrev.x, pz - dbgPrev.z).toFixed(3) + ' m / image' : ''));
        dbgPrev = { x: px, z: pz };
      }

      const dx = px - ox, dz = pz - oz;
      const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
      const inside = Math.abs(lx) < CONF.w / 2 && Math.abs(lz) < CONF.d / 2;
      const near = Math.hypot(lx, lz) < 60;
      lastP.x = px; lastP.z = pz;

      open = CONF.isOpen();
      if (A) { A.root.visible = open; if (near && open) A.update(dt); }

      if (open) seqUpdate(dt);
      if (flash > 0) { flash -= dt; scanMat.color.setHex(flash > 0 ? 0x30ff60 : 0xff2a1a); }
      if (thanksT > 0) { thanksT -= dt; if (thanksT <= 0) { thanksT = 0; drawScreen(); } }

      hud(inside && basket.length ? 'Panier : ' + basket.length + ' article' + (basket.length > 1 ? 's' : '') + ' — ' + fmt(basket.reduce(function (s, p) { return s + p.price; }, 0)) : '');

      if (!(active && inside && open)) return;
      const dC = Math.hypot(lx - cnt.x, lz - cnt.z);
      if (seq) {
        if (seq.phase === 'pay' && dC < 3.2) env.hub.request('store-pay', 'DONNER L\'ARGENT (' + fmt(running) + ')', pay, dC);
        return;
      }
      if (basket.length && dC < 2.6) env.hub.request('store-checkout', 'PASSER EN CAISSE (' + basket.length + ')', startCheckout, dC);
      let best = null, bd = 0.95;
      anchors.forEach(function (a) {
        const d = Math.hypot(lx - a.x, lz - a.z);
        if (d < bd) { bd = d; best = a; }
      });
      if (best) {
        const p = PRODUCTS[best.id];
        env.hub.request('store-p-' + p.id, 'PRENDRE · ' + p.name + ' · ' + fmt(p.price), function () { take(p); }, bd);
      }
    }
  };
}

// réglage console
if (typeof window !== 'undefined') {
  window.BadTherapistStoreConf = CONF;
}
