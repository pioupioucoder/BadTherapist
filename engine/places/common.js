import * as THREE from 'three';
import { lightPool } from '../lightpool.js';

// ==========================================
// BAD THERAPIST — OUTILS COMMUNS AUX LIEUX (places/common.js)
// ==========================================
// Matériaux, façades à fenêtres, bâtiment "factice", bâtiment avec porte interactive et intérieur,
// feux de circulation, lampadaires (halo sans vraie lumière), bouton d'action partagé, fondu au noir.
// Tout est en three r128 (même version que world_base.html).

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTex(c, repX, repY) {
  const t = new THREE.CanvasTexture(c);
  if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  else if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  if (repX) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY || repX);
  }
  t.anisotropy = 4;
  return t;
}

// ==========================================
// MATÉRIAUX PARTAGÉS
// ==========================================

let _M = null;
export function mats() {
  if (_M) return _M;
  _M = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x77716b, roughness: 0.96 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x494640, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x343431, metalness: 0.5, roughness: 0.7 }),
    metalLight: new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.6, roughness: 0.5 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc2cad0, roughness: 0.92, emissive: 0x10151a }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4b3826, roughness: 0.95 }),
    woodLight: new THREE.MeshStandardMaterial({ color: 0x7a5d3f, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 }),
    inner: new THREE.MeshStandardMaterial({ color: 0x6b5f52, roughness: 1, emissive: 0x1c150e }),
    floor: new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 1, emissive: 0x120e0a }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x2c3342, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x191e20, roughness: 0.3, metalness: 0.15 }),
    warm: new THREE.MeshBasicMaterial({ color: 0xe7c99e }),
    warmDim: new THREE.MeshBasicMaterial({ color: 0x8a6a42 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xe7c99e })
  };
  return _M;
}

// ==========================================
// FAÇADES : fenêtres (quelques-unes allumées)
// ==========================================
// Une tuile couvre 12 m x 9,6 m (4 colonnes x 3 étages). Les murs répètent la tuile.

export const TILE_W = 12, TILE_H = 9.6;
const PALETTES = [
  { wall: '#5a3a30', dark: '#3f2923' },      // brique
  { wall: '#6c6a64', dark: '#4d4b46' },      // crépi gris
  { wall: '#4b5055', dark: '#34383c' },      // béton
  { wall: '#3d3a33', dark: '#2a2823' },      // pierre sombre
  { wall: '#6a5a44', dark: '#4a3e2e' }       // sable
];
const _facades = [];

export function facade(pal) {
  pal = pal % PALETTES.length;
  if (_facades[pal]) return _facades[pal];
  const P = PALETTES[pal], rnd = mulberry32(777 + pal * 131);
  const W = 512, Hh = 512;
  const c = makeCanvas(W, Hh), k = c.getContext('2d');
  const e = makeCanvas(W, Hh), ke = e.getContext('2d');
  k.fillStyle = P.wall; k.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 700; i++) {                       // grain
    k.fillStyle = 'rgba(' + (rnd() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.02 + rnd() * 0.05) + ')';
    k.fillRect(rnd() * W, rnd() * Hh, 2 + rnd() * 14, 1 + rnd() * 4);
  }
  ke.fillStyle = '#000'; ke.fillRect(0, 0, W, Hh);
  const cols = 4, rows = 3, cw = W / cols, rh = Hh / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x = q * cw + cw * 0.2, y = r * rh + rh * 0.18, w = cw * 0.6, h = rh * 0.56;
      const lit = rnd() < 0.2;
      k.fillStyle = P.dark; k.fillRect(x - 6, y - 6, w + 12, h + 12);
      k.fillStyle = lit ? '#d9a766' : '#0a0e13';
      k.fillRect(x, y, w, h);
      k.fillStyle = 'rgba(0,0,0,0.55)'; k.fillRect(x + w / 2 - 2, y, 4, h);     // montant
      k.fillRect(x, y + h * 0.5 - 2, w, 4);
      k.fillStyle = P.dark; k.fillRect(x - 8, y + h + 6, w + 16, 7);              // appui
      if (lit) {
        ke.fillStyle = '#b97c35'; ke.fillRect(x, y, w, h);
        ke.fillStyle = '#000'; ke.fillRect(x + w / 2 - 2, y, 4, h); ke.fillRect(x, y + h * 0.5 - 2, w, 4);
      }
    }
  }
  const mat = new THREE.MeshStandardMaterial({
    map: canvasTex(c), emissiveMap: canvasTex(e), emissive: 0xffffff, roughness: 0.93
  });
  _facades[pal] = { mat: mat, pal: P };
  return _facades[pal];
}

// Boîte dont les UV suivent les dimensions réelles (la façade ne s'étire pas)
export function facadeGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const ext = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // px, nx, py, ny, pz, nz
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * ext[f][0] / TILE_W, uv.getY(i) * ext[f][1] / TILE_H);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Toit à deux pentes : crête le long de z (tourner le groupe pour la mettre le long de x)
export function gableGeo(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const P = [
    [-hw, 0, -hd], [hw, 0, -hd], [0, h, -hd],
    [-hw, 0, hd], [hw, 0, hd], [0, h, hd]
  ];
  const tris = [
    [0, 2, 1], [3, 4, 5],                               // pignons
    [0, 3, 5], [0, 5, 2],                               // pente gauche
    [1, 2, 5], [1, 5, 4],                               // pente droite
    [0, 1, 4], [0, 4, 3]                                // dessous
  ];
  const pos = [];
  tris.forEach(function (t) { t.forEach(function (i) { pos.push(P[i][0], P[i][1], P[i][2]); }); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

export function addGable(parent, w, h, d, mat, x, y, z, ridgeAlongX) {
  const m = new THREE.Mesh(gableGeo(ridgeAlongX ? d : w, h, ridgeAlongX ? w : d), mat);
  m.position.set(x, y, z);
  if (ridgeAlongX) m.rotation.y = Math.PI / 2;
  parent.add(m);
  return m;
}

// ==========================================
// HALOS
// ==========================================

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function glow(parent, x, y, z, color, scale, opacity, sharedMat) {
  const mat = sharedMat || new THREE.SpriteMaterial({
    map: glowTexture(), color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const sp = new THREE.Sprite(mat);
  sp.position.set(x, y, z);
  sp.scale.set(scale, scale, 1);
  parent.add(sp);
  return sp;
}

export function glowMaterial(color, opacity) {
  return new THREE.SpriteMaterial({
    map: glowTexture(), color: color, transparent: true, opacity: opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
}

// ==========================================
// ENSEIGNE (texte sur un panneau lumineux)
// ==========================================

export function signMaterial(text, bg, fg, w, h) {
  const c = makeCanvas(w || 256, h || 64), k = c.getContext('2d');
  k.fillStyle = bg || '#14181c'; k.fillRect(0, 0, c.width, c.height);
  k.strokeStyle = fg || '#e8d6a8'; k.lineWidth = 3;
  k.strokeRect(5, 5, c.width - 10, c.height - 10);
  k.fillStyle = fg || '#e8d6a8';
  k.font = 'bold ' + Math.round(c.height * 0.56) + 'px Arial, sans-serif';
  k.textAlign = 'center'; k.textBaseline = 'middle';
  k.fillText(text, c.width / 2, c.height / 2 + 2);
  return new THREE.MeshBasicMaterial({ map: canvasTex(c) });
}

// ==========================================
// LAMPADAIRE (halo + flaque de lumière, pas de vraie lumière)
// ==========================================

export function lampPost(parent, x, y, z, yaw) {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw || 0;
  parent.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 5.8, 8), M.metal);
  pole.position.y = 2.9;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.15, 7), M.metal);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.48, 5.65, 0);
  g.add(arm);
  box(g, 0.48, 0.16, 0.25, M.metal, 1.0, 5.55, 0);
  box(g, 0.40, 0.05, 0.22, M.snow, 1.0, 5.66, 0);
  box(g, 0.34, 0.07, 0.19, M.bulb, 1.0, 5.44, 0);
  glow(g, 1.0, 5.35, 0, 0xffa860, 4.2, 0.55);
  lightPool(g, 1.0, 0, 0, 9, 0xff9a50, 0.34);
  return g;
}

// ==========================================
// BOUTON D'ACTION PARTAGÉ (un seul bouton à l'écran : le plus proche gagne)
// ==========================================

export function createHub(action) {
  let cands = [];
  let shownId = null, shownLabel = null;
  return {
    request: function (id, label, fn, dist) { cands.push({ id: id, label: label, fn: fn, dist: dist }); },
    flush: function () {
      let best = null;
      for (let i = 0; i < cands.length; i++) if (!best || cands[i].dist < best.dist) best = cands[i];
      cands = [];
      if (!action) return;
      if (best) {
        if (shownId !== best.id || shownLabel !== best.label) {
          action.show(best.label, best.fn);
          shownId = best.id; shownLabel = best.label;
        }
      } else if (shownId !== null) {
        action.hide();
        shownId = null; shownLabel = null;
      }
    }
  };
}

// ==========================================
// FONDU AU NOIR (train)
// ==========================================

let _fade = null;
export function fadeBlack(inMs, holdMs, outMs, mid) {
  if (typeof document === 'undefined') { if (mid) mid(); return Promise.resolve(); }
  if (!_fade) {
    _fade = document.createElement('div');
    _fade.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#000;opacity:0;pointer-events:none;z-index:99999;';
    document.body.appendChild(_fade);
  }
  return new Promise(function (resolve) {
    _fade.style.transition = 'opacity ' + inMs + 'ms ease-in';
    _fade.style.pointerEvents = 'auto';
    requestAnimationFrame(function () {
      _fade.style.opacity = '1';
      setTimeout(function () {
        if (mid) mid();
        setTimeout(function () {
          _fade.style.transition = 'opacity ' + outMs + 'ms ease-out';
          _fade.style.opacity = '0';
          setTimeout(function () { _fade.style.pointerEvents = 'none'; resolve(); }, outMs);
        }, holdMs);
      }, inMs);
    });
  });
}

// ==========================================
// FEUX DE CIRCULATION (factices : ils changent de couleur en boucle)
// ==========================================
// Deux groupes : A (route 1) et B (route 2). Cycle de 32 s.

export function createTraffic() {
  const col = { r: 0xff2a1a, y: 0xffb020, g: 0x2bff6a };
  const dim = { r: 0x2a0806, y: 0x2a1c04, g: 0x06260f };
  const lamp = [{}, {}], halo = [{}, {}];
  [0, 1].forEach(function (gi) {
    ['r', 'y', 'g'].forEach(function (c) {
      lamp[gi][c] = { on: new THREE.MeshBasicMaterial({ color: col[c] }), off: new THREE.MeshBasicMaterial({ color: dim[c] }) };
      halo[gi][c] = glowMaterial(col[c], 0);
    });
  });
  const heads = [[], []];
  let last = '';
  const M = mats();

  function head(parent, x, y, z, fx, fz, gi) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(fx, fz);
    parent.add(g);
    box(g, 0.5, 1.35, 0.42, M.dark, 0, 0, 0);
    box(g, 0.62, 0.06, 0.52, M.metal, 0, 0.7, 0);             // visière
    const ls = {};
    [['r', 0.42], ['y', 0], ['g', -0.42]].forEach(function (a) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.06), lamp[gi][a[0]].off);
      m.position.set(0, a[1], 0.22);
      m.userData.dyn = true;
      g.add(m);
      ls[a[0]] = m;
      glow(g, 0, a[1], 0.34, 0, 1.5, 0, halo[gi][a[0]]);
    });
    heads[gi].push(ls);
  }

  function apply(state) {
    [0, 1].forEach(function (gi) {
      ['r', 'y', 'g'].forEach(function (c) {
        const on = state[gi] === c;
        halo[gi][c].opacity = on ? 0.85 : 0;
        heads[gi].forEach(function (h) { h[c].material = on ? lamp[gi][c].on : lamp[gi][c].off; });
      });
    });
  }

  return {
    // Carrefour en (cx, cy, cz) ; (ax, az) = direction unitaire de la route A ; hwA / hwB = demi-largeurs
    intersection: function (parent, cx, cy, cz, ax, az, hwA, hwB) {
      const bx = -az, bz = ax;
      [-1, 1].forEach(function (sa) {
        [-1, 1].forEach(function (sb) {
          const px = cx + sa * (hwB + 1.7) * ax + sb * (hwA + 1.7) * bx;
          const pz = cz + sa * (hwB + 1.7) * az + sb * (hwA + 1.7) * bz;
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.8, 8), M.metal);
          pole.position.set(px, cy + 1.9, pz);
          parent.add(pole);
          head(parent, px, cy + 3.5, pz, sa * ax, sa * az, 0);
          head(parent, px, cy + 3.5, pz, sb * bx, sb * bz, 1);
        });
      });
    },
    update: function (time) {
      const t = time % 32;
      let st;
      if (t < 12) st = ['g', 'r'];
      else if (t < 14) st = ['y', 'r'];
      else if (t < 16) st = ['r', 'r'];
      else if (t < 28) st = ['r', 'g'];
      else if (t < 30) st = ['r', 'y'];
      else st = ['r', 'r'];
      const key = st.join('');
      if (key === last) return;
      last = key;
      apply(st);
    }
  };
}

// ==========================================
// BÂTIMENT FACTICE (pas d'intérieur)
// ==========================================
// o : { x, z, w (x), d (z), h, pal, face:'e'|'w'|'n'|'s' (côté de la porte factice), roof:'flat'|'gable', sign }

export const FACE_YAW = { e: 0, w: Math.PI, s: -Math.PI / 2, n: Math.PI / 2 };

function toWorldRect(o, yaw, x0, x1, z0, z1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let ax = 1e9, bx = -1e9, az = 1e9, bz = -1e9;
  [[x0, z0], [x0, z1], [x1, z0], [x1, z1]].forEach(function (p) {
    const wx = o.x + p[0] * c + p[1] * s, wz = o.z - p[0] * s + p[1] * c;
    ax = Math.min(ax, wx); bx = Math.max(bx, wx); az = Math.min(az, wz); bz = Math.max(bz, wz);
  });
  return { x0: ax, x1: bx, z0: az, z1: bz };
}

export function fakeBuilding(parent, env, o) {
  const M = mats(), F = facade(o.pal || 0);
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = FACE_YAW[o.face || 'e'];
  parent.add(g);
  const w = o.w, d = o.d, h = o.h;
  const body = new THREE.Mesh(facadeGeo(w, h, d), F.mat);
  body.position.y = h / 2;
  g.add(body);
  // toit
  if (o.roof === 'gable') {
    const rh = Math.min(w, d) * 0.32;
    addGable(g, w + 0.5, rh, d + 0.5, M.snow, 0, h, 0, w > d ? false : true);
  } else {
    box(g, w + 0.3, 0.22, d + 0.3, M.concreteDark, 0, h + 0.11, 0);
    box(g, w + 0.1, 0.16, d + 0.1, M.snow, 0, h + 0.3, 0);
  }
  // porte factice + lumière chaude
  const dz = o.doorDz || 0;
  box(g, 0.1, 2.3, 1.3, M.wood, w / 2 + 0.04, 1.15, dz);
  box(g, 0.14, 0.1, 1.5, M.concreteDark, w / 2 + 0.05, 2.38, dz);
  glow(g, w / 2 + 0.5, 1.7, dz, 0xffa860, 2.6, 0.32);
  if (o.sign) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), signMaterial(o.sign));
    sg.rotation.y = Math.PI / 2;
    sg.position.set(w / 2 + 0.06, 3.05, dz);
    g.add(sg);
  }
  const r = toWorldRect(o, FACE_YAW[o.face || 'e'], -w / 2, w / 2, -d / 2, d / 2);
  env.rects.push(r);
  return { group: g, rect: r };
}

// ==========================================
// BÂTIMENT AVEC PORTE INTERACTIVE ET INTÉRIEUR
// ==========================================
// o : { id, x, y, z, w, d, h, face, pal, doorW, doorH, doorDz, roof, ridge, sign, fill(innerGroup, api) }
// Le repère local : porte sur la face +x, sol à y = 0. face tourne le tout (e / w / n / s).

export function enterable(parent, env, o) {
  const M = mats(), F = facade(o.pal || 0);
  const yaw = FACE_YAW[o.face || 'e'];
  const w = o.w, d = o.d, h = o.h, t = 0.3;
  const dw = o.doorW || 1.7, dh = o.doorH || 2.5, dz = o.doorDz || 0;

  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = yaw;
  parent.add(g);

  // mur : l'extérieur reçoit la façade, l'intérieur un enduit chaud
  function wall(sx, sy, sz, x, y, z, outer) {
    const arr = [M.inner, M.inner, M.dark, M.dark, M.inner, M.inner];
    arr[outer] = F.mat;
    const m = new THREE.Mesh(facadeGeo(sx, sy, sz), arr);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  wall(t, h, d + t, -w / 2, h / 2, 0, 1);                           // fond
  wall(w - t, h, t, 0, h / 2, -d / 2, 5);                           // côté -z
  wall(w - t, h, t, 0, h / 2, d / 2, 4);                            // côté +z
  const zL1 = -d / 2 - t / 2, zL2 = dz - dw / 2;                    // façade : morceau gauche
  const zR1 = dz + dw / 2, zR2 = d / 2 + t / 2;                     // morceau droit
  wall(t, h, zL2 - zL1, w / 2, h / 2, (zL1 + zL2) / 2, 0);
  wall(t, h, zR2 - zR1, w / 2, h / 2, (zR1 + zR2) / 2, 0);
  wall(t, h - dh, dw, w / 2, dh + (h - dh) / 2, dz, 0);             // linteau
  box(g, w, 0.2, d, M.floor, 0, -0.04, 0);                           // sol
  box(g, w + t, 0.25, d + t, M.concreteDark, 0, h + 0.12, 0);       // plafond / toit plat
  if (o.roof === 'gable') {
    const rh = o.roofH || Math.min(w, d) * 0.3;
    addGable(g, w + 1.0, rh, d + 1.0, M.snow, 0, h + 0.25, 0, o.ridge ? o.ridge === 'x' : w > d);
  } else {
    box(g, w + 0.4, 0.18, d + 0.4, M.snow, 0, h + 0.34, 0);
  }
  // cadre de porte
  box(g, 0.1, dh, 0.1, M.concreteDark, w / 2 + 0.15, dh / 2, dz - dw / 2 - 0.05);
  box(g, 0.1, dh, 0.1, M.concreteDark, w / 2 + 0.15, dh / 2, dz + dw / 2 + 0.05);
  box(g, 0.1, 0.12, dw + 0.3, M.concreteDark, w / 2 + 0.15, dh + 0.06, dz);

  if (o.sign) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.6, dw * 2.2), 0.7), signMaterial(o.sign));
    sg.rotation.y = Math.PI / 2;
    sg.position.set(w / 2 + 0.2, dh + 0.62, dz);
    g.add(sg);
  }
  glow(g, w / 2 + 0.7, 1.8, dz, 0xffa860, 3.0, 0.34);

  // porte (pivot sur la charnière, s'ouvre vers l'intérieur)
  const hinge = new THREE.Group();
  hinge.position.set(w / 2, 0, dz - dw / 2);
  hinge.userData.dyn = true;          // animé : jamais fusionné
  g.add(hinge);
  const panel = box(hinge, 0.07, dh - 0.04, dw - 0.04, M.woodLight, 0, (dh - 0.04) / 2, (dw - 0.04) / 2);
  box(hinge, 0.12, 0.06, 0.06, M.metalLight, 0.07, 1.05, dw - 0.2);
  void panel;

  // intérieur
  const inner = new THREE.Group();
  g.add(inner);
  const api = { w: w, d: d, h: h, M: M };
  if (o.fill) o.fill(inner, api);

  // collisions (mondiales, alignées sur les axes)
  const rects = [];
  function R(x0, x1, z0, z1) { const r = toWorldRect(o, yaw, x0, x1, z0, z1); rects.push(r); env.rects.push(r); return r; }
  R(-w / 2 - t / 2, -w / 2 + t / 2, -d / 2 - t / 2, d / 2 + t / 2);
  R(-w / 2, w / 2, -d / 2 - t / 2, -d / 2 + t / 2);
  R(-w / 2, w / 2, d / 2 - t / 2, d / 2 + t / 2);
  R(w / 2 - t / 2, w / 2 + t / 2, zL1, zL2);
  R(w / 2 - t / 2, w / 2 + t / 2, zR1, zR2);
  const doorRect = R(w / 2 - 0.1, w / 2 + 0.1, dz - dw / 2, dz + dw / 2);
  const doorHome = { x0: doorRect.x0, x1: doorRect.x1, z0: doorRect.z0, z1: doorRect.z1 };

  let openT = 0, open = false;
  function toggle() { open = !open; }
  const cy = Math.cos(yaw), sy = Math.sin(yaw);

  return {
    group: g, rects: rects,
    isOpen: function () { return open; },
    update: function (dt, px, pz, active) {
      const dx = px - o.x, dzz = pz - o.z;
      const lx = dx * cy - dzz * sy, lz = dx * sy + dzz * cy;        // joueur dans le repère du bâtiment
      const k = Math.min(1, dt * 5);
      openT += ((open ? 1 : 0) - openT) * k;
      hinge.rotation.y = -1.85 * openT;
      // la collision de la porte disparaît dès qu'elle est ouverte
      const solid = openT < 0.35;
      doorRect.x0 = solid ? doorHome.x0 : 1e7; doorRect.x1 = solid ? doorHome.x1 : 1e7 + 1;
      doorRect.z0 = solid ? doorHome.z0 : 1e7; doorRect.z1 = solid ? doorHome.z1 : 1e7 + 1;
      const dDoor = Math.hypot(lx - w / 2, lz - dz);
      if (active && dDoor < 3.4 && Math.abs(lx - w / 2) < 3.2) {
        env.hub.request(o.id, open ? 'CLOSE' : 'OPEN', toggle, dDoor);
      }
      const inside = Math.abs(lx) < w / 2 && Math.abs(lz) < d / 2;
      if (active && (inside || (open && dDoor < 14))) {
        const wx = o.x + 0 * cy + 0, wz = o.z;
        env.wantLight(wx, o.y + Math.min(h - 0.6, 3.2), wz, inside ? 1 : 0.6);
      }
    }
  };
}

// ==========================================
// OUTILS DU DÉCOR EXTÉRIEUR (rue, immeuble, fenêtre...)
// ==========================================
// Avant, ces outils étaient dans immeuble.js. Chaque appel de createKit() crée ses propres outils, avec le
// MÊME générateur aléatoire reproductible : chaque copie de la rue est donc identique aux autres.
//   const kit = createKit({ renderer });
//   kit = { BOOST, EM, rnd, disp, makeCanvas, makeTex, unitBox, item, makeInstanced, box,
//           mergeGeos, glowCanvas, glowTex, glowSprite, mats, lumpGeo }
export function createKit(opts) {
const renderer = opts && opts.renderer;

// Copie de la rue vue depuis bedroom.js : peu de lumières globales, on éclaire un peu le sol
const BOOST = 0;          // (nightBoost de la chambre ignoré : la vue par la fenêtre doit être identique à la rue)
const EM = 0.25;          // lueur propre des matériaux de la rue : presque nulle, c'est la lumière qui éclaire

// Aléatoire reproductible : l'immeuble est identique à chaque chargement
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261103);

// Couleur définie "comme à l'écran" (convertie en linéaire pour three r128)
const disp = (r, g, b) => new THREE.Color(Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2));

// ==========================================
// 1. OUTILS (canvas, textures, instances)
// ==========================================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeTex(canvas, repX = 1, repY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
  return t;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

function item(x, y, z, w, h, d, color) {
  return { x, y, z, w, h, d, color };
}

function makeInstanced(geo, mat, items, parent) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _m.compose(_p.set(it.x, it.y, it.z), _q.identity(), _s.set(it.w, it.h, it.d));
    mesh.setMatrixAt(i, _m);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function box(parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function mergeGeos(list) {
  let pc = 0, ic = 0;
  list.forEach(g => { pc += g.attributes.position.count; ic += g.index.count; });
  const pos = new Float32Array(pc * 3);
  const nor = new Float32Array(pc * 3);
  const idx = new Uint32Array(ic);
  let po = 0, io = 0;
  list.forEach(g => {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, po * 3);
    nor.set(g.attributes.normal.array, po * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + po;
    po += n; io += g.index.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Halo lumineux doux (réutilisé partout)
function glowCanvas() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
const glowTex = new THREE.CanvasTexture(glowCanvas());

function glowSprite(parent, x, y, z, color, scale, opacity) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  sp.position.set(x, y, z);
  sp.scale.set(scale, scale, 1);
  parent.add(sp);
  return sp;
}

// ==========================================
// 3. MATÉRIAUX
// ==========================================

const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x77716b, roughness: 0.96 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x494640, roughness: 0.95 }),
  side: new THREE.MeshStandardMaterial({ color: 0x45423f, roughness: 0.95 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x292725, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x191e20, roughness: 0.3, metalness: 0.15 }),
  doorGlow: new THREE.MeshBasicMaterial({ color: disp(0.60, 0.42, 0.22) }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x343431, metalness: 0.5, roughness: 0.7 }),
  snow: new THREE.MeshStandardMaterial({ color: 0xc2cad0, roughness: 0.92, emissive: new THREE.Color(0x161c20).multiplyScalar(BOOST) }),
  curtain: new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 1 }),
  carGlass: new THREE.MeshStandardMaterial({ color: 0x0b0e10, roughness: 0.2, metalness: 0.3 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 1 })
};

const lumpGeo = new THREE.SphereGeometry(1, 10, 6);

return { BOOST, EM, rnd, disp, makeCanvas, makeTex, unitBox, item, makeInstanced, box, mergeGeos, glowCanvas, glowTex, glowSprite, mats, lumpGeo };
}
