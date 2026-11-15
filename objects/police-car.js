import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — LA VOITURE DE POLICE (objects/police-car.js)
// ==========================================
// La voiture de patrouille de Leon (« Police »). Même principe que le bus : un véhicule + un pilote automatique sur le réseau
// de routes (roadnet.js). C'est engine/police-service.js qui lui dit où aller ; c'est le cerveau de Leon qui décide quand.
//   • berline noire et blanche, barre lumineuse rouge/bleue qui clignote (gyrophares), sirène (WebAudio), inscription POLICE ;
//   • la portière conducteur s'ouvre (pour que Leon monte et descende) ;
//   • il ralentit dans les virages, s'arrête aux feux rouges (options.signals) et devant un obstacle (options.obstacles : camion,
//     taxi, bus, toi à pied), fait demi-tour sur place quand la route part dans l'autre sens ;
//   • il conduit plus vite que le taxi, mais pas n'importe comment.
//
// Repère : comme taxi.js / bus.js. Avant = -z local ; cap h -> avant (-sin h, -cos h), droite (cos h, -sin h). Conducteur à GAUCHE.
// Réglage en direct (F12) : BadTherapistPolice.driver(x, y, z, yawEnDegres)

const L = 5.0, W = 2.0, FLOOR = 0.40;
const DRIVER = { x: -0.5, y: FLOOR, z: -0.2, yaw: Math.PI };
const WHEEL = { x: -0.5, y: 1.1, z: -0.5 };
const PAR = { vmax: 24, acc: 4.5, brk: 5.5, alat: 5.5, brkE: 9.5 };       // réglables : car.setProfile({ vmax, acc, brk, alat })

function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function ss(a, b, t) { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); }

export function createPoliceCar(parent, o) {

  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const camera = o.camera;
  const groundH = o.groundH || function () { return 0; };
  const net = o.net;

  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  parent.add(g);

  const M = {
    black: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.45, metalness: 0.5, emissive: 0x050607 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.45, metalness: 0.3, emissive: 0x15181a }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    light: new THREE.MeshBasicMaterial({ color: 0xffeccc }),
    tail: new THREE.MeshBasicMaterial({ color: 0x6a1008 }),
    redBar: new THREE.MeshBasicMaterial({ color: 0x300606 }),
    blueBar: new THREE.MeshBasicMaterial({ color: 0x050a30 }),
    redF: new THREE.MeshBasicMaterial({ color: 0x300606 }),
    blueF: new THREE.MeshBasicMaterial({ color: 0x050a30 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
  };

  function box(w, h, d, mat, x, y, z, par) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (par || g).add(m);
    return m;
  }

  const BELT = 0.98, ROOF = 1.52;

  // Plancher, caisse basse, capot, coffre, pare-chocs
  box(1.8, 0.2, 4.4, M.dark, 0, 0.3, 0);
  box(1.86, 0.08, 2.6, M.dark, 0, FLOOR - 0.04, 0.2);
  box(1.9, 0.56, 1.35, M.black, 0, 0.7, -1.82);                         // capot (bas)
  box(1.88, 0.06, 1.3, M.black, 0, BELT + 0.0, -1.82);
  box(1.9, 0.56, 0.95, M.black, 0, 0.7, 1.98);                          // coffre
  box(1.88, 0.06, 0.9, M.black, 0, BELT, 1.98);
  box(1.7, 0.05, 1.1, M.snow, 0, BELT + 0.04, -1.8);
  box(1.98, 0.18, 0.2, M.metal, 0, 0.42, -2.48);                        // pare-chocs (avec barre « push bar »)
  box(1.98, 0.18, 0.2, M.metal, 0, 0.42, 2.48);
  box(1.2, 0.34, 0.1, M.dark, 0, 0.74, -2.5);
  box(0.34, 0.14, 0.06, M.light, -0.7, 0.8, -2.5);                      // phares
  box(0.34, 0.14, 0.06, M.light, 0.7, 0.8, -2.5);
  box(0.34, 0.12, 0.05, M.tail, -0.7, 0.82, 2.5);                       // feux arrière
  box(0.34, 0.12, 0.05, M.tail, 0.7, 0.82, 2.5);

  // Flancs : blanc (portières) / noir ; côté gauche percé pour la portière conducteur (animée plus bas)
  function side(x, z0, z1, mat) { box(0.07, BELT - 0.3, z1 - z0, mat, x, (BELT + 0.3) / 2, (z0 + z1) / 2); }
  side(0.93, -1.15, 1.35, M.white);                                     // droite : portières blanches
  side(-0.93, -1.15, -0.45, M.white);
  side(-0.93, 0.55, 1.35, M.white);                                     // gauche : trou entre -0.45 et 0.55
  [[0.93, -1], [-0.93, -1]].forEach(function (p) { void p; });

  // Cabine : montants, toit, vitres
  const pillarH = ROOF - BELT;
  [[-0.9, -1.15], [0.9, -1.15], [-0.93, 0.05], [0.93, 0.05], [-0.9, 1.35], [0.9, 1.35]].forEach(function (p) {
    box(0.07, pillarH, 0.07, M.black, p[0], (BELT + ROOF) / 2, p[1]);
  });
  box(1.98, 0.08, 2.64, M.black, 0, ROOF + 0.04, 0.1);
  box(1.84, 0.05, 2.5, M.snow, 0, ROOF + 0.1, 0.1);
  const gh = pillarH - 0.04;
  const wsh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
  wsh.position.set(0, (BELT + ROOF) / 2, -1.15); wsh.rotation.x = -0.22; g.add(wsh);
  const rwn = new THREE.Mesh(new THREE.PlaneGeometry(1.8, gh), M.glass);
  rwn.position.set(0, (BELT + ROOF) / 2, 1.35); rwn.rotation.x = 0.2; g.add(rwn);
  [-0.93, 0.93].forEach(function (x) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(2.5, gh), M.glass);
    sw.rotation.y = Math.PI / 2; sw.position.set(x, (BELT + ROOF) / 2, 0.1); g.add(sw);
  });

  // Inscription POLICE sur les portières et le coffre
  function textTex(txt, w, h, fg, bg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const k = c.getContext('2d');
    if (bg) { k.fillStyle = bg; k.fillRect(0, 0, w, h); }
    k.fillStyle = fg; k.font = 'bold ' + Math.round(h * 0.7) + 'px Arial, sans-serif';
    k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(txt, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  const polMat = new THREE.MeshBasicMaterial({ map: textTex('POLICE', 256, 64, '#0a2a66', '#e8ecef') });
  function label(x, z, ry) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), polMat);
    p.position.set(x, 0.66, z); p.rotation.y = ry; g.add(p);
  }
  label(0.97, 0.45, Math.PI / 2);
  label(-0.97, 0.85, -Math.PI / 2);
  label(0, 2.47, 0);
  box(0.9, 0.04, 1.2, M.white, 0, BELT + 0.07, -1.82);                  // bande blanche sur le capot

  // Barre lumineuse (gyrophares) : moitié rouge, moitié bleue
  const bar = new THREE.Group();
  bar.position.set(0, ROOF + 0.17, 0.0);
  g.add(bar);
  box(1.3, 0.07, 0.34, M.dark, 0, 0, 0, bar);
  const barR = box(0.6, 0.12, 0.3, M.redBar, 0.33, 0.08, 0, bar);
  const barB = box(0.6, 0.12, 0.3, M.blueBar, -0.33, 0.08, 0, bar);
  void barR; void barB;
  // petits flashs avant (calandre) et arrière (lunette)
  box(0.2, 0.06, 0.04, M.redF, -0.3, 0.9, -2.52);
  box(0.2, 0.06, 0.04, M.blueF, 0.3, 0.9, -2.52);
  box(0.25, 0.05, 0.04, M.redF, -0.5, 1.3, 1.37);
  box(0.25, 0.05, 0.04, M.blueF, 0.5, 1.3, 1.37);

  // Intérieur : tableau de bord, volant, sièges, ordinateur de bord
  box(1.8, 0.22, 0.4, M.dark, 0, 1.0, -1.0);
  box(0.4, 0.26, 0.04, new THREE.MeshBasicMaterial({ color: 0x2e6dff }), 0.2, 1.2, -0.7);
  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
  steer.position.set(WHEEL.x, WHEEL.y, WHEEL.z); steer.rotation.x = -0.95; g.add(steer);
  function seat(x, z) {
    box(0.4, 0.3, 0.4, M.dark, x, FLOOR + 0.18, z);
    box(0.55, 0.14, 0.55, M.seat, x, FLOOR + 0.4, z);
    box(0.55, 0.62, 0.1, M.seat, x, FLOOR + 0.78, z + 0.3);
  }
  seat(-0.5, 0.0); seat(0.5, 0.0);
  box(1.5, 0.14, 0.55, M.seat, 0, FLOOR + 0.4, 0.95);
  box(1.5, 0.62, 0.1, M.seat, 0, FLOOR + 0.78, 1.23);
  box(1.7, 0.7, 0.04, M.dark, 0, 1.05, 0.62);                           // grille de séparation

  // Roues
  const wheels = [];
  [[-0.95, -1.55, true], [0.95, -1.55, true], [-0.95, 1.5, false], [0.95, 1.5, false]].forEach(function (w) {
    const wg = new THREE.Group();
    wg.rotation.order = 'YXZ';
    wg.position.set(w[0], 0.36, w[1]);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), M.rubber);
    tire.rotation.z = Math.PI / 2; wg.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), M.metal);
    hub.rotation.z = Math.PI / 2; wg.add(hub);
    g.add(wg);
    wheels.push({ g: wg, front: w[2] });
  });

  // Portière conducteur (pivot à la charnière avant)
  const door = new THREE.Group();
  door.position.set(-0.93, 0, -0.45);
  g.add(door);
  box(0.07, BELT - 0.3, 1.0, M.white, 0, (BELT + 0.3) / 2, 0.5, door);
  box(0.06, 0.52, 0.9, M.glass, 0, (BELT + ROOF) / 2 - 0.12, 0.5, door).material = M.glass;
  box(0.07, 0.05, 1.0, M.black, 0, BELT + 0.02, 0.5, door);
  let doorT = 0, doorTarget = 0, doorWait = [];

  // Lumières réelles : phares + éclairage bleu/rouge sur la neige (créés une fois pour toutes)
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.3, -26);
  g.add(spotTarget);
  const spot = new THREE.SpotLight(0xffeccc, 0, 70, 0.55, 0.5, 1.0);
  spot.position.set(0, 0.9, -2.2); spot.target = spotTarget; g.add(spot);
  const flash = new THREE.PointLight(0xff2020, 0, 22, 2);
  flash.position.set(0, ROOF + 0.4, 0); g.add(flash);

  const driverSlot = new THREE.Group();
  driverSlot.position.set(DRIVER.x, DRIVER.y, DRIVER.z);
  driverSlot.rotation.y = DRIVER.yaw;
  g.add(driverSlot);

  // ==========================================
  // ÉTAT
  // ==========================================
  let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
  let speed = 0, pitch = 0, roll = 0, bodyY = groundH(x, z), wheelRot = 0, steerCur = 0;
  let mode = 'parked', P = null, s = 0, legResolve = null, errX = 0, errZ = 0, errH = 0;
  let lightsOn = true, beacons = false, siren = false, braking = false, driverIn = true, flashT = 0;
  let ac = null, sirenNodes = null;

  function place(dt, snap) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const hF = groundH(x + fx * 2.2, z + fz * 2.2), hR = groundH(x - fx * 2.2, z - fz * 2.2);
    const hRt = groundH(x + rx, z + rz), hL = groundH(x - rx, z - rz);
    const k = snap ? 1 : Math.min(1, dt * 9);
    bodyY += ((hF + hR + hRt + hL) / 4 - bodyY) * Math.min(1, snap ? 1 : dt * 14);
    pitch += (Math.atan2(hF - hR, 4.4) - pitch) * k;
    roll += (Math.atan2(hRt - hL, 2.0) - roll) * k;
    g.position.set(x, bodyY, z);
    g.rotation.set(pitch, heading, roll);
  }
  place(0, true);

  // ==========================================
  // SIRÈNE (seulement près de toi)
  // ==========================================
  function audioCtx() {
    if (ac) return ac;
    try { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); } catch (e) { ac = null; }
    return ac;
  }
  function sirenStart() {
    const a = audioCtx();
    if (!a || sirenNodes) return;
    try {
      if (a.state === 'suspended') a.resume();
      const osc = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), out = a.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = 900;
      lfo.type = 'triangle'; lfo.frequency.value = 0.55; lg.gain.value = 330;
      lfo.connect(lg); lg.connect(osc.frequency);
      out.gain.value = 0;
      osc.connect(out); out.connect(a.destination);
      osc.start(); lfo.start();
      sirenNodes = { osc: osc, lfo: lfo, out: out };
    } catch (e) { sirenNodes = null; }
  }
  function sirenStop() {
    if (!sirenNodes) return;
    try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch (e) { /* déjà arrêté */ }
    sirenNodes = null;
  }
  function sirenVolume() {
    if (!sirenNodes) return;
    const d = Math.hypot(camera.position.x - origin.x - x, camera.position.z - origin.z - z);
    sirenNodes.out.gain.value = Math.max(0, 1 - d / 160) * 0.07;
  }

  // ==========================================
  // PORTIÈRE
  // ==========================================
  function setDoor(open) {
    const t = open ? 1 : 0;
    if (doorTarget === t) return doorT === t ? Promise.resolve() : new Promise(function (r) { doorWait.push(r); });
    if (open && speed > 0.3) return Promise.resolve();
    doorTarget = t;
    return new Promise(function (r) { doorWait.push(r); });
  }
  function updateDoor(dt) {
    if (doorT !== doorTarget) {
      doorT += Math.sign(doorTarget - doorT) * dt / 0.9;
      if ((doorTarget === 1 && doorT >= 1) || (doorTarget === 0 && doorT <= 0)) {
        doorT = doorTarget;
        const w = doorWait; doorWait = []; w.forEach(function (r) { r(); });
      }
    }
    door.rotation.y = -ss(0, 1, doorT) * 1.15;
  }

  // ==========================================
  // CONDUITE AUTOMATIQUE
  // ==========================================
  function dynCap(vT) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    if (o.signals && o.signals.ahead) {
      let r = null;
      try { r = o.signals.ahead(x, z, fx, fz, 70); } catch (e) { r = null; }
      if (r && r.red && r.dist > 0) vT = Math.min(vT, Math.sqrt(2 * PAR.brkE * Math.max(0, r.dist - L / 2 - 2.5)) * 0.8);
    }
    let obs = [];
    try { obs = o.obstacles ? o.obstacles() : []; } catch (e) { obs = []; }
    obs = obs.concat([{ x: camera.position.x - origin.x, z: camera.position.z - origin.z, r: 0.6 }]);       // toi à pied
    for (let i = 0; i < obs.length; i++) {
      const ob = obs[i];
      if (!ob) continue;
      const dx = ob.x - x, dz = ob.z - z, along = dx * fx + dz * fz, lat = dx * rx + dz * rz;
      if (along > 0 && along < 40 && Math.abs(lat) < 1.9 + (ob.r || 1.3)) vT = Math.min(vT, Math.sqrt(2 * PAR.brkE * Math.max(0, along - L / 2 - 3)) * 0.85);
    }
    return vT;
  }

  function followStep(dt) {
    const q0 = net.sampleAt(P, s);
    const vT = dynCap(q0.v);
    const prev = speed;
    if (speed < vT) speed = Math.min(vT, speed + PAR.acc * dt); else speed = Math.max(vT, speed - PAR.brkE * dt);
    braking = speed < prev - 0.03;
    s += speed * dt;
    let arrived = false;
    if (s >= P.len - 0.12) { s = P.len; arrived = true; }
    const q = net.sampleAt(P, s);
    const k = Math.exp(-Math.max(speed, 0.5) * dt / 7);
    errX *= k; errZ *= k; errH *= k;
    x = q.x + errX; z = q.z + errZ; heading = q.h + errH;
    steerCur += (Math.max(-0.5, Math.min(0.5, q.turn * 3.2)) - steerCur) * Math.min(1, dt * 9);
    place(dt, false);
    wheelRot += speed * dt / 0.36;
    wheels.forEach(function (w) { w.g.rotation.x = wheelRot; w.g.rotation.y = w.front ? steerCur : 0; });
    if (arrived) {
      speed = 0; braking = true; mode = 'parked';
      wheels.forEach(function (w) { w.g.rotation.y = 0; });
      const r = legResolve; legResolve = null; P = null;
      if (r) r('arrived');
    }
  }

  // ==========================================
  // UPDATE
  // ==========================================
  function lights(dt) {
    flashT += dt;
    const on = beacons || siren;
    const ph = Math.floor(flashT / 0.14) % 6;                           // alternance rouge / bleu en rafales
    const red = on && (ph === 0 || ph === 2), blue = on && (ph === 3 || ph === 5);
    M.redBar.color.setHex(red ? 0xff2020 : 0x300606);
    M.blueBar.color.setHex(blue ? 0x2a46ff : 0x050a30);
    M.redF.color.setHex(red ? 0xff2020 : 0x300606);
    M.blueF.color.setHex(blue ? 0x2a46ff : 0x050a30);
    M.tail.color.setHex(braking || mode === 'parked' ? 0xff2a1a : 0x6a1008);
    flash.color.setHex(red ? 0xff2020 : 0x3050ff);
    flash.intensity = on && (red || blue) ? 3.2 : 0;
    spot.intensity = lightsOn && mode !== 'parked' ? 3.6 : (lightsOn ? 1.2 : 0);
    if (siren) { sirenStart(); sirenVolume(); } else sirenStop();
  }
  function step(dt) {
    if (mode === 'driving' && P) followStep(dt);
    else { speed = 0; place(dt, false); }
    updateDoor(dt);
    lights(dt);
  }
  let lastTick = 0;
  function tick() {
    const now = performance.now();
    if (lastTick && now - lastTick < 3) return;
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0.016;
    lastTick = now;
    step(dt);
  }
  (function loop() { tick(); requestAnimationFrame(loop); })();

  window.BadTherapistPolice = {
    group: g, slot: driverSlot,
    driver: function (px, py, pz, yawDeg) {
      driverSlot.position.set(px, py, pz);
      if (yawDeg != null) driverSlot.rotation.y = yawDeg * Math.PI / 180;
      console.log('[police] DRIVER = { x:', px, ', y:', py, ', z:', pz, ', yaw:', driverSlot.rotation.y, '}');
    }
  };

  // ==========================================
  // API
  // ==========================================
  return {
    group: g,
    slot: driverSlot,
    update: function () { tick(); },
    teleport: function (px, pz, h) { x = px; z = pz; heading = h; speed = 0; mode = 'parked'; place(0, true); },
    follow: function (path) {
      return new Promise(function (resolve) {
        P = path; s = 0; mode = 'driving'; speed = 0; legResolve = resolve;
        const q = net.sampleAt(P, 0);
        errX = x - q.x; errZ = z - q.z; errH = wrap(heading - q.h);
        if (Math.hypot(errX, errZ) > 25) { errX = 0; errZ = 0; x = q.x; z = q.z; }
        if (doorT > 0 || doorTarget > 0) setDoor(false);
      });
    },
    abort: function () { const r = legResolve; legResolve = null; P = null; mode = 'parked'; speed = 0; if (r) r('aborted'); },
    openDoor: function () { return setDoor(true); },
    closeDoor: function () { return setDoor(false); },
    setSiren: function (on) { siren = !!on; if (on) beacons = true; },
    setBeacons: function (on) { beacons = !!on; if (!on) siren = false; },
    setLights: function (on) { lightsOn = !!on; },
    setProfile: function (p) { Object.assign(PAR, p || {}); },
    getProfile: function () { return Object.assign({}, PAR); },
    isMoving: function () { return mode !== 'parked'; },
    getMode: function () { return mode; },
    getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; },
    setDriverPresent: function (v) { driverIn = !!v; },
    // à côté de la portière conducteur (côté gauche), pour que Leon descende
    doorSpot: function () {
      const rx = Math.cos(heading), rz = -Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);
      return [x - rx * 2.3 + fx * 0.1, z - rz * 2.3 + fz * 0.1];
    },
    LENGTH: L, WIDTH: W
  };
}
