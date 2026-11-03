import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — ASCENSEUR (elevator.js)
// ==========================================
// Une seule cabine qui se déplace vraiment en hauteur, avec :
//  - des portes palières (une paire par étage) + des portes de cabine qui coulissent ensemble
//  - un panneau de boutons dans la cabine et un bouton d'appel sur chaque palier
//  - les collisions de la cabine et des murs du palier
//
// Utilisation (voir bedroom.js) :
//   const elevator = buildElevator(scene, { z, camera, canvas, physics, levels, startLevel });
//   elevator.addLanding({ level, width, wallH, wallMaterial });   // un par étage desservi
//   elevator.update(dt);                                          // à chaque frame

export function buildElevator(parent, opts) {

  const camera = opts.camera;
  const canvas = opts.canvas;
  const physics = opts.physics;

  const WALL_Z = opts.z;                       // plan du mur d'ascenseur (z monde)
  const FLOOR_H = opts.floorH || 3.15;         // hauteur d'un étage
  const BASE_FLOOR = opts.baseFloor || 6;      // numéro d'étage situé à y = 0
  const LEVELS = opts.levels;                  // { 6: { y: 0 }, 0: { y: -18.9 } }
  const ENABLED = opts.enabledFloors || [0, 6];  // étages accessibles pour le moment
  const ALL_FLOORS = [8, 7, 6, 5, 4, 3, 2, 1, 0];

  // Dimensions
  const CW = 2.0;    // largeur intérieure de la cabine (x)
  const CD = 2.2;    // profondeur intérieure (z)
  const CH = 2.4;    // hauteur intérieure
  const DW = 1.1;    // largeur de la porte
  const DH = 2.1;    // hauteur de la porte
  const SLIDE = 0.5; // course des vantaux

  const CAB_Z1 = WALL_Z - 0.2;     // face intérieure avant de la cabine
  const ZC = CAB_Z1 - CD / 2;      // centre de la cabine

  // ==========================================
  // ÉTAT
  // ==========================================

  const state = {
    level: opts.startLevel !== undefined ? opts.startLevel : BASE_FLOOR,
    moving: false,
    target: null,
    pending: null,
    doorState: 0,       // 0 fermées, 1 ouvertes
    doorTarget: 0,
    doorTimer: 0,
    travel: null,
    dir: 0
  };
  let pressedFloor = -1;
  let shownKey = '';

  function floorLabel(n) { return n === 0 ? 'RDC' : String(n); }
  function smooth(u) { return u * u * (3 - 2 * u); }

  // ==========================================
  // TEXTURES / MATÉRIAUX
  // ==========================================

  function steelTex(rx, ry, base) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x++) {
      g.fillStyle = Math.random() < 0.5
        ? 'rgba(255,255,255,' + (Math.random() * 0.07) + ')'
        : 'rgba(0,0,0,' + (Math.random() * 0.07) + ')';
      g.fillRect(x, 0, 1, 256);
    }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, 0, 2, 256);
    g.fillRect(128, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }

  function graniteTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#5d6064';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const v = 70 + Math.random() * 70;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',0.55)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(20,20,22,0.55)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }

  function mirrorTex() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#8ea0ab');
    grad.addColorStop(0.45, '#b9c8d1');
    grad.addColorStop(0.55, '#8c9ea9');
    grad.addColorStop(1, '#7a8c97');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  const mSteel = new THREE.MeshLambertMaterial({ map: steelTex(2, 1, '#8f959a'), color: 0x9a9fa4 });
  const mSteelPlain = new THREE.MeshLambertMaterial({ color: 0x8d9398 });
  const mSteelDark = new THREE.MeshLambertMaterial({ color: 0x4a4f54 });
  const mDoor = new THREE.MeshLambertMaterial({ map: steelTex(1, 1, '#999ea3'), color: 0xa4a8ac });
  const mFloor = new THREE.MeshLambertMaterial({ map: graniteTex(), color: 0x8a8a8a });
  const mCeil = new THREE.MeshLambertMaterial({ color: 0x6b7075 });
  const mRail = new THREE.MeshLambertMaterial({ color: 0x9a9ea2 });
  const mLightPanel = new THREE.MeshBasicMaterial({ color: 0xfff1dc });

  function box(g, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  // ==========================================
  // CABINE
  // ==========================================

  const cab = new THREE.Group();
  cab.position.set(0, LEVELS[state.level].y, ZC);
  parent.add(cab);

  // Sol / plafond
  box(cab, CW, 0.04, CD, mFloor, 0, 0.02, 0);
  box(cab, CW, 0.05, CD, mCeil, 0, CH + 0.025, 0);

  // Plafonnier encastré
  const ceilLight = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0), mLightPanel);
  ceilLight.rotation.x = Math.PI / 2;
  ceilLight.position.set(0, CH - 0.005, 0);
  cab.add(ceilLight);

  // Murs : gauche, droit, fond (acier brossé avec joints verticaux)
  box(cab, 0.04, CH, CD, mSteel, -CW / 2 - 0.02, CH / 2, 0);
  box(cab, 0.04, CH, CD, mSteel, CW / 2 + 0.02, CH / 2, 0);
  box(cab, CW, CH, 0.04, mSteel, 0, CH / 2, -CD / 2 - 0.02);

  // Plinthe inox
  box(cab, 0.02, 0.1, CD, mSteelDark, -CW / 2 + 0.01, 0.07, 0);
  box(cab, 0.02, 0.1, CD, mSteelDark, CW / 2 - 0.01, 0.07, 0);
  box(cab, CW, 0.1, 0.02, mSteelDark, 0, 0.07, -CD / 2 + 0.01);

  // Miroir au fond
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(CW - 0.5, 1.2),
    new THREE.MeshBasicMaterial({ map: mirrorTex() })
  );
  mirror.position.set(0, 1.5, -CD / 2 + 0.005);
  cab.add(mirror);
  box(cab, CW - 0.44, 0.03, 0.02, mSteelDark, 0, 2.115, -CD / 2 + 0.01);
  box(cab, CW - 0.44, 0.03, 0.02, mSteelDark, 0, 0.885, -CD / 2 + 0.01);
  box(cab, 0.03, 1.23, 0.02, mSteelDark, -(CW - 0.44) / 2, 1.5, -CD / 2 + 0.01);
  box(cab, 0.03, 1.23, 0.02, mSteelDark, (CW - 0.44) / 2, 1.5, -CD / 2 + 0.01);

  // Mains courantes
  function rail(len, x, y, z, alongX) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 8), mRail);
    if (alongX) r.rotation.z = Math.PI / 2; else r.rotation.x = Math.PI / 2;
    r.position.set(x, y, z);
    cab.add(r);
    const k = 0.14;
    [-1, 1].forEach(function(s) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), mRail);
      if (alongX) { b.rotation.z = Math.PI / 2; b.position.set(x + s * (len / 2 - 0.2), y, z + 0.03); }
      else { b.rotation.x = Math.PI / 2; b.position.set(x + (x < 0 ? 0.03 : -0.03), y, z + s * (len / 2 - 0.2)); }
      cab.add(b);
    });
  }
  rail(CW - 0.6, 0, 0.9, -CD / 2 + 0.09, true);
  rail(CD - 0.7, -CW / 2 + 0.09, 0.9, -0.1, false);

  // Face avant : pieds-droits + linteau (ouverture = DW x DH)
  const frontW = (CW - DW) / 2;
  box(cab, frontW, CH, 0.1, mSteel, -(DW / 2 + frontW / 2), CH / 2, CD / 2 + 0.05);
  box(cab, frontW, CH, 0.1, mSteel, (DW / 2 + frontW / 2), CH / 2, CD / 2 + 0.05);
  box(cab, DW, CH - DH, 0.1, mSteel, 0, DH + (CH - DH) / 2, CD / 2 + 0.05);
  // Seuil
  box(cab, DW, 0.03, 0.12, mSteelDark, 0, 0.015, CD / 2 + 0.03);

  // Portes de cabine (deux vantaux)
  const cabLeafL = box(cab, DW / 2, DH, 0.04, mDoor, -DW / 4, DH / 2, CD / 2 - 0.03);
  const cabLeafR = box(cab, DW / 2, DH, 0.04, mDoor, DW / 4, DH / 2, CD / 2 - 0.03);

  // Éclairage de la cabine
  const cabLight = new THREE.PointLight(0xfff2e0, 0.35, 6);
  cabLight.position.set(0, CH - 0.3, 0);
  cab.add(cabLight);

  // ------------------------------------------
  // Afficheur au-dessus de la porte (intérieur)
  // ------------------------------------------
  function makeDisplay() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    return { canvas: c, ctx: c.getContext('2d'), tex: tex };
  }

  function drawDisplay(d, label, dir) {
    const g = d.ctx;
    g.fillStyle = '#050505';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ff5a1f';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = 'bold 38px monospace';
    g.fillText(label, dir ? 52 : 64, 34);
    if (dir) {
      g.beginPath();
      if (dir > 0) { g.moveTo(98, 20); g.lineTo(112, 44); g.lineTo(84, 44); }
      else { g.moveTo(98, 46); g.lineTo(112, 22); g.lineTo(84, 22); }
      g.closePath();
      g.fill();
    }
    d.tex.needsUpdate = true;
  }

  const cabDisplay = makeDisplay();
  const cabDisplayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: cabDisplay.tex })
  );
  cabDisplayMesh.rotation.y = Math.PI;
  cabDisplayMesh.position.set(0, 2.25, CD / 2 - 0.005);
  cab.add(cabDisplayMesh);

  // ------------------------------------------
  // Panneau de boutons (mur droit, près de la porte)
  // ------------------------------------------
  const PW = 128, PH = 480;
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = PW; panelCanvas.height = PH;
  const pctx = panelCanvas.getContext('2d');
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  const BTN_Y0 = 112, BTN_STEP = 34, DOOR_BTN_Y = 442;

  function drawPanel(label, dir) {
    const g = pctx;
    const grad = g.createLinearGradient(0, 0, PW, 0);
    grad.addColorStop(0, '#b4b9be');
    grad.addColorStop(0.5, '#d4d8dc');
    grad.addColorStop(1, '#a6abb0');
    g.fillStyle = grad;
    g.fillRect(0, 0, PW, PH);
    g.strokeStyle = '#5b6065';
    g.lineWidth = 4;
    g.strokeRect(2, 2, PW - 4, PH - 4);

    // Afficheur
    g.fillStyle = '#050505';
    g.fillRect(14, 14, 100, 62);
    g.fillStyle = '#ff5a1f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 34px monospace';
    g.fillText(label, dir ? 46 : 64, 46);
    if (dir) {
      g.beginPath();
      if (dir > 0) { g.moveTo(92, 32); g.lineTo(104, 54); g.lineTo(80, 54); }
      else { g.moveTo(92, 58); g.lineTo(104, 36); g.lineTo(80, 36); }
      g.closePath();
      g.fill();
    }

    // Boutons d'étage
    ALL_FLOORS.forEach(function(f, i) {
      const cy = BTN_Y0 + i * BTN_STEP;
      const enabled = ENABLED.indexOf(f) !== -1;
      const lit = (pressedFloor === f) || (state.pending === f) || (state.level === f && !state.moving);
      g.beginPath();
      g.arc(64, cy, 14, 0, Math.PI * 2);
      g.fillStyle = lit ? '#4a3414' : '#26292d';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = lit ? '#ffb347' : '#8a8f94';
      g.stroke();
      g.fillStyle = lit ? '#ffd9a0' : (enabled ? '#f0f0f0' : '#6f7479');
      g.font = 'bold ' + (f === 0 ? 11 : 15) + 'px monospace';
      g.fillText(f === 0 ? 'RDC' : String(f), 64, cy + 1);
    });

    // Ouvrir / fermer les portes
    [[36, '<|>'], [92, '>|<']].forEach(function(b) {
      g.beginPath();
      g.arc(b[0], DOOR_BTN_Y, 15, 0, Math.PI * 2);
      g.fillStyle = '#26292d';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#8a8f94';
      g.stroke();
      g.fillStyle = '#f0f0f0';
      g.font = 'bold 12px monospace';
      g.fillText(b[1], b[0], DOOR_BTN_Y + 1);
    });

    panelTex.needsUpdate = true;
  }

  const panelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.75),
    new THREE.MeshBasicMaterial({ map: panelTex })
  );
  panelMesh.rotation.y = -Math.PI / 2;
  panelMesh.position.set(CW / 2 - 0.025, 1.2, CD / 2 - 0.5);
  cab.add(panelMesh);
  box(cab, 0.02, 0.81, 0.26, mSteelDark, CW / 2 - 0.01, 1.2, CD / 2 - 0.5);

  // ==========================================
  // PALIERS (un par étage desservi)
  // ==========================================

  const landings = {};
  const plates = [];

  function drawPlate(L, lit) {
    const p = landings[L].plate;
    const g = p.ctx;
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#b4b9be');
    grad.addColorStop(1, '#d0d4d8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
    g.strokeStyle = '#5b6065';
    g.lineWidth = 3;
    g.strokeRect(1, 1, 62, 126);
    g.beginPath();
    g.arc(32, 64, 20, 0, Math.PI * 2);
    g.fillStyle = lit ? '#4a3414' : '#26292d';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = lit ? '#ffb347' : '#8a8f94';
    g.stroke();
    g.fillStyle = lit ? '#ffd9a0' : '#f0f0f0';
    g.beginPath();
    if (L === 0) { g.moveTo(32, 52); g.lineTo(44, 74); g.lineTo(20, 74); }
    else { g.moveTo(32, 76); g.lineTo(44, 54); g.lineTo(20, 54); }
    g.closePath();
    g.fill();
    p.tex.needsUpdate = true;
  }

  function addLanding(cfg) {

    const L = cfg.level;
    const W = cfg.width || 5;
    const H = cfg.wallH || 3.6;
    const wallMat = cfg.wallMaterial || new THREE.MeshLambertMaterial({ color: 0x888888 });
    const y = LEVELS[L].y;

    const g = new THREE.Group();
    g.position.set(0, y, WALL_Z);
    parent.add(g);

    // Mur avec ouverture pour la porte (face visible côté couloir)
    function wallPlane(w, h, x, yy) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, yy, 0);
      g.add(m);
    }
    const sideW = W / 2 - DW / 2;
    wallPlane(sideW, H, -(DW / 2 + sideW / 2), H / 2);
    wallPlane(sideW, H, (DW / 2 + sideW / 2), H / 2);
    wallPlane(DW, H - DH, 0, DH + (H - DH) / 2);

    // Chambranle en acier
    box(g, 0.12, DH + 0.15, 0.1, mSteelDark, -(DW / 2 + 0.06), (DH + 0.15) / 2, 0.04);
    box(g, 0.12, DH + 0.15, 0.1, mSteelDark, (DW / 2 + 0.06), (DH + 0.15) / 2, 0.04);
    box(g, DW + 0.24, 0.15, 0.1, mSteelDark, 0, DH + 0.075, 0.04);
    box(g, DW, 0.03, 0.12, mSteelDark, 0, 0.015, -0.02);

    // Portes palières
    const leafL = box(g, DW / 2, DH, 0.04, mDoor, -DW / 4, DH / 2, -0.03);
    const leafR = box(g, DW / 2, DH, 0.04, mDoor, DW / 4, DH / 2, -0.03);

    // Indicateur d'étage au-dessus de la porte
    const disp = makeDisplay();
    const dispMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshBasicMaterial({ map: disp.tex })
    );
    dispMesh.position.set(0, DH + 0.3, 0.012);
    g.add(dispMesh);

    // Bouton d'appel
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 64; plateCanvas.height = 128;
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    const plateMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.2),
      new THREE.MeshBasicMaterial({ map: plateTex })
    );
    plateMesh.position.set(DW / 2 + 0.4, 1.1, 0.02);
    g.add(plateMesh);
    box(g, 0.12, 0.22, 0.02, mSteelDark, DW / 2 + 0.4, 1.1, 0.002);
    plateMesh.userData.level = L;
    plates.push(plateMesh);

    landings[L] = {
      group: g, leafL: leafL, leafR: leafR,
      display: disp,
      plate: { ctx: plateCanvas.getContext('2d'), tex: plateTex }
    };
    drawPlate(L, false);

    // Collisions du palier
    if (physics) {
      physics.add({ x0: -W / 2 - 0.6, x1: -DW / 2, z0: WALL_Z - 0.2, z1: WALL_Z + 0.15, level: L });
      physics.add({ x0: DW / 2, x1: W / 2 + 0.6, z0: WALL_Z - 0.2, z1: WALL_Z + 0.15, level: L });
      physics.add({
        x0: -DW / 2, x1: DW / 2, z0: WALL_Z - 0.2, z1: WALL_Z + 0.2, level: L,
        active: function() { return !(state.level === L && !state.moving && state.doorState > 0.85); }
      });
    }

    refreshDisplays(true);
    return landings[L];
  }

  // ==========================================
  // COLLISIONS DE LA CABINE (à tous les étages)
  // ==========================================

  const zBack = ZC - CD / 2;
  if (physics) {
    physics.add({ x0: -CW / 2 - 0.5, x1: -CW / 2, z0: zBack - 0.5, z1: CAB_Z1 + 0.1 });
    physics.add({ x0: CW / 2, x1: CW / 2 + 0.5, z0: zBack - 0.5, z1: CAB_Z1 + 0.1 });
    physics.add({ x0: -CW / 2 - 0.5, x1: CW / 2 + 0.5, z0: zBack - 0.5, z1: zBack });
    physics.add({ x0: -CW / 2 - 0.5, x1: -DW / 2, z0: CAB_Z1, z1: CAB_Z1 + 0.3 });
    physics.add({ x0: DW / 2, x1: CW / 2 + 0.5, z0: CAB_Z1, z1: CAB_Z1 + 0.3 });
    physics.add({
      x0: -DW / 2, x1: DW / 2, z0: CAB_Z1 - 0.2, z1: CAB_Z1 + 0.35,
      active: function() { return !(state.doorState > 0.85); }
    });
  }

  function isInsideCab(x, z) {
    return Math.abs(x) < CW / 2 && z < CAB_Z1 && z > CAB_Z1 - CD;
  }

  // ==========================================
  // AFFICHAGE
  // ==========================================

  function currentFloorNumber() {
    if (!state.moving) return state.level;
    return Math.round(BASE_FLOOR + cab.position.y / FLOOR_H);
  }

  function refreshDisplays(force) {
    const n = currentFloorNumber();
    const key = n + ':' + state.dir + ':' + pressedFloor + ':' + state.pending + ':' + state.level + ':' + state.moving;
    if (!force && key === shownKey) return;
    shownKey = key;
    const label = floorLabel(n);
    const dir = state.moving ? state.dir : 0;
    drawDisplay(cabDisplay, label, dir);
    drawPanel(label, dir);
    Object.keys(landings).forEach(function(k) {
      drawDisplay(landings[k].display, label, dir);
      drawPlate(Number(k), state.pending === Number(k));
    });
  }

  // ==========================================
  // LOGIQUE
  // ==========================================

  let audio = null;
  function ding() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      const t = audio.currentTime;
      [880, 660].forEach(function(f, i) {
        const o = audio.createOscillator();
        const gn = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        gn.gain.setValueAtTime(0.0001, t + i * 0.25);
        gn.gain.exponentialRampToValueAtTime(0.12, t + i * 0.25 + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.9);
        o.connect(gn);
        gn.connect(audio.destination);
        o.start(t + i * 0.25);
        o.stop(t + i * 0.25 + 1);
      });
    } catch (e) {}
  }

  function openDoors() {
    if (state.moving) return;
    state.doorTarget = 1;
    state.doorTimer = 6;
  }

  function closeDoors() {
    state.doorTarget = 0;
  }

  function requestFloor(L) {
    if (state.moving) return;
    if (!LEVELS[L]) return;
    if (L === state.level) {
      state.pending = null;
      openDoors();
    } else {
      state.pending = L;
      closeDoors();
    }
  }

  function startRide(L) {
    const y0 = cab.position.y;
    const y1 = LEVELS[L].y;
    state.moving = true;
    state.target = L;
    state.dir = y1 > y0 ? 1 : -1;
    state.travel = { t: 0, T: Math.max(4, Math.abs(y1 - y0) / 3.3), y0: y0, y1: y1 };
  }

  // ==========================================
  // INTERACTIONS (souris / toucher)
  // ==========================================

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([panelMesh].concat(plates), false);
    if (!hits.length || hits[0].distance > 3.2) return null;
    return hits[0];
  }

  function panelAction(uv) {
    const cx = uv.x * PW;
    const cy = (1 - uv.y) * PH;
    if (Math.abs(cy - DOOR_BTN_Y) < 18) {
      if (Math.abs(cx - 36) < 20) { state.pending = null; openDoors(); return true; }
      if (Math.abs(cx - 92) < 20) { if (!state.moving) closeDoors(); return true; }
    }
    for (let i = 0; i < ALL_FLOORS.length; i++) {
      if (Math.abs(cy - (BTN_Y0 + i * BTN_STEP)) < 16 && Math.abs(cx - 64) < 22) {
        const f = ALL_FLOORS[i];
        pressedFloor = f;
        setTimeout(function() { pressedFloor = -1; }, 250);
        if (ENABLED.indexOf(f) !== -1) requestFloor(f);
        return true;
      }
    }
    return false;
  }

  canvas.addEventListener('mousemove', function(event) {
    if (pick(event)) canvas.style.cursor = 'pointer';
  });

  canvas.addEventListener('click', function(event) {
    const hit = pick(event);
    if (!hit) return;
    if (hit.object === panelMesh) {
      panelAction(hit.uv);
    } else if (hit.object.userData.level !== undefined) {
      requestFloor(hit.object.userData.level);
    }
  });

  // ==========================================
  // UPDATE
  // ==========================================

  function applyDoors() {
    const e = smooth(Math.min(1, Math.max(0, state.doorState)));
    const off = SLIDE * e;
    cabLeafL.position.x = -DW / 4 - off;
    cabLeafR.position.x = DW / 4 + off;
    Object.keys(landings).forEach(function(k) {
      const L = landings[k];
      const a = (Number(k) === state.level) ? e : 0;
      L.leafL.position.x = -DW / 4 - SLIDE * a;
      L.leafR.position.x = DW / 4 + SLIDE * a;
    });
  }

  function update(dt) {

    // Portes
    const speed = dt / 1.1;
    if (state.doorState < state.doorTarget) state.doorState = Math.min(state.doorTarget, state.doorState + speed);
    else if (state.doorState > state.doorTarget) state.doorState = Math.max(state.doorTarget, state.doorState - speed);

    // Fermeture automatique (pas tant que quelqu'un est dans l'embrasure)
    if (state.doorTarget === 1 && !state.moving) {
      const px = camera.position.x, pz = camera.position.z;
      const inCabDoorway = isInsideCab(px, pz) && pz > CAB_Z1 - 0.9 && Math.abs(px) < 0.8;
      const inLandingDoorway = physics && physics.level === state.level &&
        Math.abs(px) < 0.8 && pz >= CAB_Z1 && pz < WALL_Z + 1.0;
      const inDoorway = inCabDoorway || inLandingDoorway;
      if (inDoorway) state.doorTimer = Math.max(state.doorTimer, 1.5);
      state.doorTimer -= dt;
      if (state.doorTimer <= 0) closeDoors();
    }

    // Départ quand les portes sont fermées
    if (state.pending !== null && !state.moving && state.doorState <= 0.001) {
      const L = state.pending;
      state.pending = null;
      startRide(L);
    }

    // Déplacement
    if (state.moving) {
      const tr = state.travel;
      tr.t += dt;
      const u = Math.min(1, tr.t / tr.T);
      cab.position.y = tr.y0 + (tr.y1 - tr.y0) * smooth(u);
      if (u >= 1) {
        cab.position.y = tr.y1;
        state.moving = false;
        state.level = state.target;
        state.target = null;
        state.dir = 0;
        ding();
        openDoors();
      }
    }

    applyDoors();
    refreshDisplays(false);
  }

  refreshDisplays(true);

  return {
    update: update,
    addLanding: addLanding,
    isInsideCab: isInsideCab,
    getCabY: function() { return cab.position.y; },
    state: state,
    cab: cab
  };
}
