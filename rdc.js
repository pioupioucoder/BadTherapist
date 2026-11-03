import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — REZ-DE-CHAUSSÉE (rdc.js)
// ==========================================
// Hall d'entrée provisoire : on y arrive en prenant l'ascenseur vers le bas.
// Il est situé sous le couloir (même plan x/z, 18.9 m plus bas) : l'ascenseur
// est donc une vraie cabine qui descend dans une vraie gaine.
//
// Utilisation (voir bedroom.js) :
//   const rdc = buildGroundFloor(scene, { y: -18.9, z: -26, physics, level: 0 });

export function buildGroundFloor(parent, opts) {

  const Y = opts.y;
  const Z0 = opts.z;                 // mur de l'ascenseur
  const LEVEL = opts.level === undefined ? 0 : opts.level;
  const physics = opts.physics;
  const W = 6;
  const LEN = 11;
  const H = opts.wallH || 3.2;
  const Z1 = Z0 + LEN;               // mur de l'entrée

  const root = new THREE.Group();
  root.position.y = Y;
  parent.add(root);

  // ==========================================
  // TEXTURES / MATÉRIAUX
  // ==========================================

  function canvasTex(w, h, fn, rx, ry) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rx) t.repeat.set(rx, ry);
    return t;
  }

  // Carrelage damier gris
  const floorTex = canvasTex(128, 128, function(g, w, h) {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        g.fillStyle = (r + c) % 2 === 0 ? '#8d8b86' : '#5f5d59';
        g.fillRect(c * 64, r * 64, 64, 64);
      }
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, W / 1.2, LEN / 1.2);

  const wallTex = canvasTex(128, 128, function(g, w, h) {
    g.fillStyle = '#8a857c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      const v = 110 + Math.random() * 40;
      g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 12) + ',0.25)';
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, 4, 1);

  const mWall = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xc2bdb2 });
  const mFloor = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xd0d0d0 });
  const mCeil = new THREE.MeshLambertMaterial({ color: 0x77736c });
  const mMetal = new THREE.MeshLambertMaterial({ color: 0x7d8288 });
  const mMetalDark = new THREE.MeshLambertMaterial({ color: 0x3e4247 });
  const mTrim = new THREE.MeshLambertMaterial({ color: 0x3a3631 });

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

  const zMid = (Z0 + Z1) / 2;
  plane(W, LEN, mFloor, 0, -0.01, zMid, -Math.PI / 2);
  plane(W, LEN, mCeil, 0, H, zMid, Math.PI / 2);

  plane(LEN, H, mWall, -W / 2, H / 2, zMid, 0, Math.PI / 2);
  plane(LEN, H, mWall, W / 2, H / 2, zMid, 0, -Math.PI / 2);

  // Plinthes
  box(0.05, 0.12, LEN, mTrim, -W / 2 + 0.025, 0.06, zMid);
  box(0.05, 0.12, LEN, mTrim, W / 2 - 0.025, 0.06, zMid);

  // ==========================================
  // PORTE D'ENTRÉE (décor, fermée) — mur de l'entrée
  // ==========================================

  const doorW = 2.0, doorH = 2.4;
  const sideW = W / 2 - doorW / 2;
  plane(sideW, H, mWall, -(doorW / 2 + sideW / 2), H / 2, Z1, 0, Math.PI);
  plane(sideW, H, mWall, (doorW / 2 + sideW / 2), H / 2, Z1, 0, Math.PI);
  plane(doorW, H - doorH, mWall, 0, doorH + (H - doorH) / 2, Z1, 0, Math.PI);

  // Cadre + vitrage (lumière du jour)
  box(0.1, doorH, 0.12, mMetalDark, -doorW / 2 - 0.05, doorH / 2, Z1 - 0.04);
  box(0.1, doorH, 0.12, mMetalDark, doorW / 2 + 0.05, doorH / 2, Z1 - 0.04);
  box(doorW + 0.2, 0.1, 0.12, mMetalDark, 0, doorH + 0.05, Z1 - 0.04);
  box(0.05, doorH, 0.1, mMetalDark, 0, doorH / 2, Z1 - 0.04);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({ color: 0x9aa8b0 })
  );
  glass.rotation.y = Math.PI;
  glass.position.set(0, doorH / 2, Z1 + 0.01);
  root.add(glass);

  // Poignées
  [-0.12, 0.12].forEach(function(x) {
    box(0.03, 0.5, 0.03, mMetal, x, 1.05, Z1 - 0.12);
  });

  // Panneau "SORTIE"
  const sortieTex = canvasTex(128, 48, function(g, w, h) {
    g.fillStyle = '#0b3d1c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7dff9d';
    g.font = 'bold 28px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SORTIE', w / 2, h / 2);
  });
  const sortie = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.19),
    new THREE.MeshBasicMaterial({ map: sortieTex })
  );
  sortie.rotation.y = Math.PI;
  sortie.position.set(0, doorH + 0.3, Z1 - 0.01);
  root.add(sortie);

  // ==========================================
  // BOÎTES AUX LETTRES (mur droit)
  // ==========================================

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const b = box(0.08, 0.24, 0.32, mMetal, W / 2 - 0.05, 1.0 + r * 0.28, Z0 + 3.0 + c * 0.36);
      b.rotation.y = 0;
      box(0.02, 0.05, 0.12, mMetalDark, W / 2 - 0.1, 1.04 + r * 0.28, Z0 + 3.0 + c * 0.36);
    }
  }

  // Plaque "RDC" près de l'ascenseur
  const rdcTex = canvasTex(128, 64, function(g, w, h) {
    g.fillStyle = '#2a2d31';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e8e8';
    g.font = 'bold 40px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('RDC', w / 2, h / 2);
  });
  const rdcSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshBasicMaterial({ map: rdcTex })
  );
  rdcSign.rotation.y = Math.PI / 2;
  rdcSign.position.set(-W / 2 + 0.01, 1.9, Z0 + 1.4);
  root.add(rdcSign);

  // ==========================================
  // LUMIÈRES
  // ==========================================

  [Z0 + 3.5, Z0 + 8].forEach(function(z) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xfff0d8 })
    );
    panel.rotation.x = Math.PI / 2;
    panel.position.set(0, H - 0.01, z);
    root.add(panel);

    const pl = new THREE.PointLight(0xffe8c8, 0.5, 9);
    pl.position.set(0, H - 0.4, z);
    root.add(pl);
  });

  // ==========================================
  // COLLISIONS (niveau 0)
  // ==========================================

  if (physics) {
    physics.add({ x0: -W / 2 - 0.6, x1: -W / 2, z0: Z0 - 0.6, z1: Z1 + 0.6, level: LEVEL });
    physics.add({ x0: W / 2, x1: W / 2 + 0.6, z0: Z0 - 0.6, z1: Z1 + 0.6, level: LEVEL });
    physics.add({ x0: -W / 2 - 0.6, x1: W / 2 + 0.6, z0: Z1, z1: Z1 + 0.6, level: LEVEL });
  }

  return {
    width: W,
    wallH: H,
    wallMaterial: mWall,
    update: function(dt, time) {}
  };
}
