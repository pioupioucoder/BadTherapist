import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — COULOIR (corridor.js)
// ==========================================
// Reprend de corridor.html : le sol en carreaux, les murs, les portes,
// les cadres photo et l'ascenseur.
//
// Images des 6 cadres (dossier images/, à côté de world_base.html) :
//   images/corridor1.png  ... images/corridor6.png
//   (si le .png est introuvable : essaie .jpg puis .webp, sinon image de secours)
//
// Utilisation depuis bedroom.js :
//   const corridor = buildCorridor(scene, { wallH: 3.6, nearZ: 0 });
//   -> le mur "proche" du couloir (celui de la porte) est placé en z = nearZ,
//      le couloir part ensuite vers -z jusqu'à l'ascenseur.

export function buildCorridor(parent, opts) {

  opts = opts || {};

  const WALL_H = opts.wallH || 3.8;
  const HALL_W = 5;
  const HALL_LEN = 26;
  const Z_FAR = -HALL_LEN / 2;
  const Z_NEAR = HALL_LEN / 2;
  const FLOOR_Y = -0.01;

  // Tout le couloir vit dans ce groupe (coordonnées locales de corridor.html)
  const root = new THREE.Group();
  root.position.set(opts.x || 0, 0, (opts.nearZ || 0) - Z_NEAR);
  parent.add(root);

  // ==========================================
  // TEXTURES
  // ==========================================

  function makeTex(fn, size) {
    size = size || 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    fn(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Carreaux du sol
  const floorTex = makeTex(function(ctx, s) {
    ctx.fillStyle = '#2a0606';
    ctx.fillRect(0, 0, s, s);
    const cell = s / 4;
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 4; col++) {
        const dark = (r + col) % 2 === 0;
        ctx.fillStyle = dark ? '#7a0f10' : '#160303';
        ctx.save();
        ctx.translate(col * cell + cell / 2, r * cell + cell / 2);
        ctx.rotate(Math.PI / 4);
        const d = cell * 0.62;
        ctx.fillRect(-d / 2, -d / 2, d, d);
        ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(180,120,40,0.25)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= s; i += cell) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  }, 128);
  floorTex.repeat.set(3, 14);

  // Pierre des murs
  const stoneTex = makeTex(function(ctx, s) {
    ctx.fillStyle = '#7a5a48';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const v = 90 + Math.random() * 35;
      ctx.fillStyle = 'rgb(' + (v + 20) + ',' + v + ',' + (v - 25) + ')';
      ctx.fillRect(x, y, 6 + Math.random() * 12, 6 + Math.random() * 10);
    }
    ctx.strokeStyle = 'rgba(100,80,60,0.2)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < s; i += 22) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  }, 128);
  stoneTex.repeat.set(4, 2);

  // Bois des portes
  const woodTex = makeTex(function(ctx, s) {
    ctx.fillStyle = '#3a1810';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 3) {
      ctx.fillStyle = 'hsl(12,' + (30 + Math.random() * 15) + '%,' + (14 + Math.random() * 10) + '%)';
      ctx.fillRect(0, i, s, 2);
    }
  }, 64);

  // ==========================================
  // MATÉRIAUX
  // ==========================================

  const mWall = new THREE.MeshLambertMaterial({ map: stoneTex, color: 0x9a6858 });
  const mFloor = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xa06060 });
  const mCeil = new THREE.MeshLambertMaterial({ color: 0x2a1818 });
  const mPanel = new THREE.MeshLambertMaterial({ color: 0x5a1810 });
  const mGold = new THREE.MeshLambertMaterial({ color: 0xd4a840, emissive: 0x3a2600, emissiveIntensity: 0.3 });
  const mFrameGold = new THREE.MeshLambertMaterial({ color: 0xb89040, emissive: 0x2a1a00, emissiveIntensity: 0.15 });
  const mMetal = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  const mMetalDark = new THREE.MeshLambertMaterial({ color: 0x4a5058 });

  // ==========================================
  // HELPERS
  // ==========================================

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    root.add(m);
    return m;
  }

  function plane(w, h, mat, x, y, z, rx, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    root.add(m);
    return m;
  }

  // ==========================================
  // SOL / PLAFOND / MURS
  // ==========================================

  plane(HALL_W, HALL_LEN, mFloor, 0, FLOOR_Y, 0, -Math.PI / 2);
  plane(HALL_W, HALL_LEN, mCeil, 0, WALL_H, 0, Math.PI / 2);

  // Plinthes : elles s'arrêtent de chaque côté des portes (rien ne traverse le seuil)
  const DOOR_GAP = 0.85;   // demi-largeur libre autour du centre de chaque porte
  const doorZsLeft = [-7.5, 2.5];   // portes sur le mur gauche
  const doorZsRight = [-2.5, 7.5];  // portes sur le mur droit

  function plinthSide(x, doorZs) {
    let start = -HALL_LEN / 2;
    function seg(a, b) {
      if (b - a > 0.05) box(0.12, 0.35, b - a, mPanel, x, 0.17, (a + b) / 2);
    }
    doorZs.slice().sort(function(a, b) { return a - b; }).forEach(function(dz) {
      seg(start, dz - DOOR_GAP);
      start = dz + DOOR_GAP;
    });
    seg(start, HALL_LEN / 2);
  }
  plinthSide(-HALL_W / 2 + 0.06, doorZsLeft);
  plinthSide(HALL_W / 2 - 0.06, doorZsRight);

  // Murs latéraux
  plane(HALL_LEN, WALL_H, mWall, -HALL_W / 2, WALL_H / 2, 0, 0, Math.PI / 2);
  plane(HALL_LEN, WALL_H, mWall, HALL_W / 2, WALL_H / 2, 0, 0, -Math.PI / 2);

  // Mur proche (côté porte) : seulement si demandé (mode autonome).
  // Dans la chambre, c'est le mur de la chambre qui sert de mur proche.
  if (opts.closeNearWall) {
    plane(HALL_W, WALL_H, mWall, 0, WALL_H / 2, Z_NEAR, 0, Math.PI);
  }

  // ==========================================
  // 4 PORTES DÉCORATIVES (sans l'arche dorée)
  // ==========================================

  function makeDoor(z, facingRight, doorColor) {

    const doorW = 1.25, doorH = 2.35, thick = 0.1;

    const g = new THREE.Group();
    const wallX = facingRight ? HALL_W / 2 - 0.02 : -HALL_W / 2 + 0.02;
    g.position.set(wallX, doorH / 2 + 0.02, z);
    g.rotation.y = facingRight ? -Math.PI / 2 : Math.PI / 2;

    // Cadre
    const mFrameVar = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });

    const fL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.3, 0.14), mFrameVar);
    fL.position.set(-doorW / 2 - 0.08, 0, 0);
    g.add(fL);

    const fR = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.3, 0.14), mFrameVar);
    fR.position.set(doorW / 2 + 0.08, 0, 0);
    g.add(fR);

    const fT = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.36, 0.16, 0.14), mFrameVar);
    fT.position.set(0, doorH / 2 + 0.15, 0);
    g.add(fT);

    // Battant
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, thick),
      new THREE.MeshLambertMaterial({ color: doorColor })
    );
    g.add(leaf);

    // Panneaux
    const mPanelVar = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    [0.55, -0.1, -0.75].forEach(function(py) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.62, 0.5, 0.04), mPanelVar);
      pane.position.set(0, py, thick / 2 + 0.01);
      g.add(pane);
    });

    // Poignée
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mGold);
    handle.position.set(doorW / 2 - 0.18, -0.15, thick / 2 + 0.06);
    g.add(handle);

    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), mGold);
    hb.rotation.x = Math.PI / 2;
    hb.position.set(doorW / 2 - 0.18, -0.15, thick / 2 + 0.02);
    g.add(hb);

    root.add(g);
  }

  // z = -7.5, -2.5, 2.5, 7.5 — alternance gauche / droite
  const doorPositions = [
    { z: -7.5, facingRight: false, color: 0x8a4a2a },
    { z: -2.5, facingRight: true,  color: 0x6a3a5a },
    { z: 2.5,  facingRight: false, color: 0x5a5a3a },
    { z: 7.5,  facingRight: true,  color: 0x7a4a4a }
  ];
  doorPositions.forEach(function(d) {
    makeDoor(d.z, d.facingRight, d.color);
  });

  // ==========================================
  // 6 CADRES PHOTO (entre les portes)
  // images/corridor1.png ... images/corridor6.png
  // ==========================================

  const FRAME_IMAGES = [];

  function generateFallbackTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#8a7a5a');
    grad.addColorStop(1, '#5a4a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#d4a840';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, 216, 216);
    return new THREE.CanvasTexture(c);
  }

  function photoMaterial(tex) {
    return new THREE.MeshLambertMaterial({
      map: tex,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  function makePictureFrame(z, facingRight, imageIndex) {

    const frameW = 0.8;
    const frameH = 1.0;
    const borderW = 0.02;
    const depth = 0.12;

    const group = new THREE.Group();
    const wallX = facingRight ? HALL_W / 2 - 0.02 : -HALL_W / 2 + 0.02;
    const offsetX = facingRight ? -0.1 : 0.1;
    group.position.set(wallX + offsetX, 1.7, z);
    group.rotation.y = facingRight ? -Math.PI / 2 : Math.PI / 2;

    // Image
    const imageMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(frameW - borderW * 2.4, frameH - borderW * 2.4),
      photoMaterial(generateFallbackTexture())
    );
    imageMesh.position.set(0, 0, depth * 0.2);
    group.add(imageMesh);

    // Chargement : .png, puis .jpg, puis .webp
    const base = 'images/corridor' + imageIndex;
    const exts = ['.png', '.jpg', '.webp'];
    FRAME_IMAGES.push(base + '.png');

    function tryLoad(i) {
      if (i >= exts.length) {
        console.warn('Image introuvable pour le cadre ' + imageIndex + ' (' + base + '.png)');
        return;
      }
      new THREE.TextureLoader().load(
        base + exts[i],
        function(tex) {
          tex.encoding = THREE.sRGBEncoding;
          imageMesh.material = photoMaterial(tex);
        },
        undefined,
        function() { tryLoad(i + 1); }
      );
    }
    tryLoad(0);

    // Bordure du cadre
    const top = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.04, borderW, depth * 0.8), mFrameGold);
    top.position.set(0, frameH / 2 - borderW / 2, 0);
    group.add(top);

    const bot = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.04, borderW, depth * 0.8), mFrameGold);
    bot.position.set(0, -frameH / 2 + borderW / 2, 0);
    group.add(bot);

    const left = new THREE.Mesh(new THREE.BoxGeometry(borderW, frameH - borderW * 2, depth * 0.8), mFrameGold);
    left.position.set(-frameW / 2 + borderW / 2, 0, 0);
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(borderW, frameH - borderW * 2, depth * 0.8), mFrameGold);
    right.position.set(frameW / 2 - borderW / 2, 0, 0);
    group.add(right);

    root.add(group);
  }

  // 2 cadres dans chaque intervalle entre les portes
  const framePositions = [
    { z: -7.5 + 5 / 3,  facingRight: false, idx: 1 },
    { z: -7.5 + 10 / 3, facingRight: true,  idx: 2 },
    { z: -2.5 + 5 / 3,  facingRight: false, idx: 3 },
    { z: -2.5 + 10 / 3, facingRight: true,  idx: 4 },
    { z: 2.5 + 5 / 3,   facingRight: false, idx: 5 },
    { z: 2.5 + 10 / 3,  facingRight: true,  idx: 6 }
  ];
  framePositions.forEach(function(f) {
    makePictureFrame(f.z, f.facingRight, f.idx);
  });

  // ==========================================
  // FOND DU COULOIR
  // ==========================================
  // L'ascenseur (elevator.js) construit lui-même le mur du fond avec sa porte.
  // Mur plein seulement en mode autonome.
  if (opts.farWall !== false) {
    plane(HALL_W, WALL_H, mWall, 0, WALL_H / 2, Z_FAR, 0, 0);
  }

  // ==========================================
  // COLLISIONS (si le monde fournit physics)
  // ==========================================
  if (opts.physics) {
    const lvl = (opts.level === undefined) ? 6 : opts.level;
    const zN = opts.nearZ || 0;
    const zF = zN - HALL_LEN;
    opts.physics.add({ x0: -HALL_W / 2 - 0.6, x1: -HALL_W / 2, z0: zF - 0.6, z1: zN, level: lvl });
    opts.physics.add({ x0: HALL_W / 2, x1: HALL_W / 2 + 0.6, z0: zF - 0.6, z1: zN, level: lvl });
  }

  // ==========================================
  // LAMPES DE PLAFOND
  // ==========================================

  for (let z = -9; z <= 9; z += 9) {
    const pl = new THREE.PointLight(0xffd8b0, 0.5, 10);
    pl.position.set(0, WALL_H - 0.4, z);
    root.add(pl);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe0b0 })
    );
    bulb.position.set(0, WALL_H - 0.35, z);
    root.add(bulb);
  }

  return {
    root: root,
    wallMaterial: mWall,
    imageNames: FRAME_IMAGES,
    update: function(dt, time) {}
  };
}

// ==========================================
// MODE AUTONOME : world_base.html?world=corridor.js
// ==========================================

export function buildWorld(scene, opts) {

  const corridor = buildCorridor(scene, { nearZ: 13, closeNearWall: true });

  if (opts && opts.camera) {
    opts.camera.position.set(0, 1.7, 11);
  }

  return corridor;
}
