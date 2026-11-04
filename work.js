import * as THREE from 'three';
import { buildWorld as buildOutside, WORK_SPOT } from './immeuble.js';

// ==========================================
// BAD THERAPIST — LA MAISON DU THÉRAPEUTE (work.js)
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
//   2) autonome : world_base.html?world=work.js -> on démarre devant la maison.

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

  // Porte
  box(1.5, 2.55, 0.14, mTrim, 0, F + 1.27, FZ + 0.02);
  box(1.1, 2.25, 0.1, mDoor, 0, F + 1.13, FZ + 0.08);
  [0.62, -0.1, -0.78].forEach(function(py) {
    box(0.78, 0.5, 0.03, mWood, 0, F + 1.13 + py, FZ + 0.14);
  });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mBrass);
  knob.position.set(0.38, F + 1.05, FZ + 0.18);
  g.add(knob);

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

  return {
    group: g,
    colliders: colliders,
    update: function(dt, time) {

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
// MODE AUTONOME : world_base.html?world=work.js
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
