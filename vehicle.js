import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — LE CAMION (vehicle.js)
// ==========================================
// Un seul véhicule : un petit camion de livraison avec une benne ouverte (pour les colis).
//  - on peut monter dedans / en descendre (bouton ENTER / EXIT ou touche E),
//  - il roule très vite, suit le relief et monte les collines et les montagnes,
//  - collisions : arbres, rochers, immeuble, maison.
//
// Conduite : joystick gauche (avant/arrière + direction), clavier ZQSD / WASD / flèches, ESPACE = frein à main.
// Le joystick droit (ou la souris) sert à regarder autour de soi.
//
// Repère : le camion vit dans le repère local de "parent" (la rue). "origin" = position
// monde de l'origine de ce repère (la rue est décalée dans le monde de la chambre).
// Avant du camion = -z local ; cap h -> direction (-sin h, -cos h).

export function createTruck(parent, o) {

  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const camera = o.camera;
  const input = o.input || { lx: 0, ly: 0, brake: false };
  const groundH = o.groundH;
  const rects = o.rects || [];
  const bounds = o.bounds || { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };

  const MAX = 36;        // m/s (~130 km/h)
  const MAXR = 9;        // marche arrière
  const ACC = 15;
  const BRAKE = 28;

  // ==========================================
  // MODÈLE
  // ==========================================

  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  parent.add(g);

  const M = {
    body: new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.55, metalness: 0.35, emissive: 0x180806 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.95 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x302a25, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9db4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false
    }),
    light: new THREE.MeshBasicMaterial({ color: 0xffe9c0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0x7a1208 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xc9d0d4, roughness: 0.92, emissive: 0x161c20 })
  };

  function box(w, h, d, mat, x, y, z, par) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (par || g).add(m);
    return m;
  }

  // Châssis, capot, calandre, pare-chocs
  box(2.0, 0.3, 5.7, M.dark, 0, 0.62, 0);
  box(1.95, 0.55, 1.25, M.body, 0, 1.05, -2.28);
  box(2.0, 0.7, 0.1, M.dark, 0, 0.85, -2.93);
  box(2.1, 0.22, 0.22, M.metal, 0, 0.55, -2.95);
  box(2.1, 0.22, 0.22, M.metal, 0, 0.55, 2.95);
  box(0.3, 0.16, 0.06, M.light, -0.7, 0.98, -2.97);
  box(0.3, 0.16, 0.06, M.light, 0.7, 0.98, -2.97);
  box(0.3, 0.15, 0.05, M.tail, -0.8, 1.0, 2.93);
  box(0.3, 0.15, 0.05, M.tail, 0.8, 1.0, 2.93);

  // Cabine (ouverte vue de l'intérieur : sol, portières, toit, montants, vitres)
  box(1.95, 0.06, 1.9, M.dark, 0, 0.8, -0.75);                      // plancher
  box(0.07, 0.72, 1.85, M.body, -0.99, 1.17, -0.75);                // portière gauche
  box(0.07, 0.72, 1.85, M.body, 0.99, 1.17, -0.75);                 // portière droite
  box(1.95, 0.75, 0.1, M.body, 0, 1.17, -1.7);                      // tablier
  box(1.95, 1.45, 0.08, M.body, 0, 1.55, 0.2);                      // paroi arrière
  box(2.02, 0.08, 1.98, M.body, 0, 2.58, -0.74);                    // toit
  box(1.9, 0.07, 1.85, M.snow, 0, 2.65, -0.74);
  box(1.85, 0.07, 1.2, M.snow, 0, 1.36, -2.28);
  [[-0.95, -1.66], [0.95, -1.66], [-0.97, 0.12], [0.97, 0.12]].forEach(function (p) {
    box(0.07, 1.0, 0.07, M.body, p[0], 2.08, p[1]);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 0.95), M.glass);
  ws.position.set(0, 2.08, -1.67);
  g.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), M.glass);
  rw.position.set(0, 2.1, 0.15);
  g.add(rw);
  [-0.985, 0.985].forEach(function (x) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), M.glass);
    sw.rotation.y = Math.PI / 2;
    sw.position.set(x, 2.08, -0.74);
    g.add(sw);
  });
  box(0.1, 0.18, 0.12, M.dark, -1.1, 1.95, -1.55);                  // rétroviseurs
  box(0.1, 0.18, 0.12, M.dark, 1.1, 1.95, -1.55);

  // Intérieur : tableau de bord, sièges, volant
  box(1.8, 0.24, 0.45, M.dark, 0, 1.4, -1.48);
  box(0.55, 0.12, 0.55, M.seat, -0.5, 1.02, -0.1);
  box(0.55, 0.65, 0.1, M.seat, -0.5, 1.38, 0.12);
  box(0.55, 0.12, 0.55, M.seat, 0.5, 1.02, -0.1);
  box(0.55, 0.65, 0.1, M.seat, 0.5, 1.38, 0.12);
  const wheelSteer = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), M.dark);
  wheelSteer.position.set(-0.5, 1.58, -1.18);
  wheelSteer.rotation.x = -0.95;
  g.add(wheelSteer);
  box(0.05, 0.05, 0.4, M.dark, -0.5, 1.48, -1.3).rotation.x = -0.95;

  // Benne ouverte (pour les colis)
  box(2.05, 0.1, 2.75, M.wood, 0, 0.95, 1.58);
  box(0.07, 0.5, 2.75, M.body, -1.0, 1.25, 1.58);
  box(0.07, 0.5, 2.75, M.body, 1.0, 1.25, 1.58);
  box(2.05, 0.5, 0.07, M.body, 0, 1.25, 2.93);
  box(2.05, 0.8, 0.07, M.body, 0, 1.35, 0.26);

  // Point d'ancrage pour poser des colis plus tard : truck.cargo.add(mesh)
  const cargo = new THREE.Group();
  cargo.position.set(0, 1.0, 1.58);
  g.add(cargo);

  // Roues
  const wheels = [];
  [[-1.02, -2.0, true], [1.02, -2.0, true], [-1.02, 1.95, false], [1.02, 1.95, false]].forEach(function (w) {
    const wg = new THREE.Group();
    wg.rotation.order = 'YXZ';
    wg.position.set(w[0], 0.48, w[1]);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 14), M.rubber);
    tire.rotation.z = Math.PI / 2;
    wg.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8), M.metal);
    hub.rotation.z = Math.PI / 2;
    wg.add(hub);
    g.add(wg);
    wheels.push({ g: wg, front: w[2] });
  });

  // Phares
  const spot = new THREE.SpotLight(0xffe6c0, 0, 70, 0.6, 0.55, 1.0);
  spot.position.set(0, 1.2, -2.8);
  g.add(spot);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.4, -24);
  g.add(spotTarget);
  spot.target = spotTarget;

  // ==========================================
  // ÉTAT
  // ==========================================

  let x = o.x || 0, z = o.z || 0, heading = o.heading || 0;
  let speed = 0, steerCur = 0;
  let pitch = 0, roll = 0, bodyY = groundH(x, z);
  let wheelRot = 0;
  let driving = false;
  let actionShown = false;
  const SEAT = new THREE.Vector3(-0.5, 1.95, -0.45);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // --- collisions ---
  function resolveAt(px, pz) {
    const R = 0.55;
    const t = o.collide ? o.collide(px, pz, R) : [px, pz];
    px = t[0]; pz = t[1];
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < rects.length; i++) {
        const c = rects[i];
        const cx = clamp(px, c.x0, c.x1), cz = clamp(pz, c.z0, c.z1);
        const dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px += dx / d * (R - d);
          pz += dz / d * (R - d);
        } else {
          const l = px - c.x0, r = c.x1 - px, tt = pz - c.z0, b = c.z1 - pz;
          const m = Math.min(l, r, tt, b);
          if (m === l) px = c.x0 - R;
          else if (m === r) px = c.x1 + R;
          else if (m === tt) pz = c.z0 - R;
          else pz = c.z1 + R;
        }
      }
    }
    return [px, pz];
  }

  function collideBody(cx, cz, h) {
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const pts = [[-0.9, -2.7], [0.9, -2.7], [-0.9, 2.7], [0.9, 2.7], [0, 0]];
    let pushed = 0;
    for (let iter = 0; iter < 2; iter++) {
      let sx = 0, sz = 0, n = 0;
      for (let i = 0; i < pts.length; i++) {
        const px = cx + rx * pts[i][0] - fx * pts[i][1];
        const pz = cz + rz * pts[i][0] - fz * pts[i][1];
        const r = resolveAt(px, pz);
        const dx = r[0] - px, dz = r[1] - pz;
        if (dx * dx + dz * dz > 1e-8) { sx += dx; sz += dz; n++; }
      }
      if (!n) break;
      cx += sx / n; cz += sz / n;
      pushed += Math.hypot(sx / n, sz / n);
    }
    return { x: cx, z: cz, pushed: pushed };
  }

  // ==========================================
  // PLACEMENT DU MODÈLE SUR LE RELIEF
  // ==========================================

  function place(dt, snap) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const hF = groundH(x + fx * 2.4, z + fz * 2.4);
    const hR = groundH(x - fx * 2.4, z - fz * 2.4);
    const hRt = groundH(x + rx * 1.0, z + rz * 1.0);
    const hL = groundH(x - rx * 1.0, z - rz * 1.0);
    const ty = (hF + hR + hRt + hL) / 4;
    const tp = Math.atan2(hF - hR, 4.8);
    const tr = Math.atan2(hRt - hL, 2.0);
    const k = snap ? 1 : Math.min(1, dt * 9);
    bodyY += (ty - bodyY) * Math.min(1, snap ? 1 : dt * 14);
    pitch += (tp - pitch) * k;
    roll += (tr - roll) * k;
    g.position.set(x, bodyY, z);
    g.rotation.set(pitch, heading, roll);
  }

  place(0, true);

  // ==========================================
  // ENTRER / SORTIR
  // ==========================================

  function enter() {
    if (driving) return;
    driving = true;
    speed = 0;
    steerCur = 0;
    if (o.view) o.view.set(heading, 0);
    spot.intensity = 4.0;
    showExit();
  }

  function exit() {
    if (!driving) return;
    driving = false;
    speed = 0;
    spot.intensity = 0;
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const cands = [[-2.5, 0.4], [2.5, 0.4], [-2.5, 3.2], [0, 5.2]];
    let best = null;
    for (let i = 0; i < cands.length && !best; i++) {
      const px = x + rx * cands[i][0] + fx * cands[i][1];
      const pz = z + rz * cands[i][0] + fz * cands[i][1];
      const r = resolveAt(px, pz);
      if (Math.abs(r[0] - px) < 0.05 && Math.abs(r[1] - pz) < 0.05) best = [px, pz];
    }
    if (!best) best = [x + rx * -2.5, z + rz * -2.5];
    camera.position.x = origin.x + best[0];
    camera.position.z = origin.z + best[1];
    if (o.onExit) o.onExit(best[0], best[1]);
    hideAction();
  }

  function showExit() {
    if (o.action) { o.action.show('EXIT', exit); actionShown = true; }
  }
  function showEnter() {
    if (o.action && !actionShown) { o.action.show('ENTER', enter); actionShown = true; }
  }
  function hideAction() {
    if (o.action && actionShown) { o.action.hide(); actionShown = false; }
  }

  // ==========================================
  // CONDUITE
  // ==========================================

  function drive(dt) {

    const thr = clamp(-input.ly, -1, 1);
    const st = clamp(input.lx, -1, 1);

    if (thr > 0.05) {
      if (speed < -0.5) speed += BRAKE * dt;
      else speed += thr * ACC * Math.max(0.12, 1 - Math.max(0, speed) / MAX) * dt;
    } else if (thr < -0.05) {
      if (speed > 0.5) speed -= BRAKE * (-thr) * dt;
      else speed -= (-thr) * 7 * Math.max(0.2, 1 - (-speed) / MAXR) * dt;
    } else {
      const drag = 2.0 + 0.01 * speed * speed;
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag * dt);
    }
    if (input.brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 30 * dt);

    // La pente ralentit un peu, mais le moteur est assez fort pour grimper presque partout
    speed -= 9.8 * Math.sin(pitch) * 0.3 * dt;
    speed = clamp(speed, -MAXR, MAX);

    steerCur += (st - steerCur) * Math.min(1, dt * 7);
    const turn = steerCur * 1.3 * Math.min(1, Math.abs(speed) / 5) / (1 + Math.abs(speed) / 24);
    const prevHeading = heading;
    heading -= turn * dt * (speed >= 0 ? 1 : -1);

    // Déplacement + pente trop raide = mur
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    let nx = x + fx * speed * dt, nz = z + fz * speed * dt;
    const dist = Math.hypot(nx - x, nz - z);
    if (dist > 1e-4) {
      const dh = groundH(nx + fx * 2.2, nz + fz * 2.2) - groundH(x + fx * 2.2, z + fz * 2.2);
      if (Math.abs(dh) / dist > 1.5 && dh > 0) {
        speed *= -0.15;
        nx = x; nz = z;
      }
    }

    const res = collideBody(nx, nz, heading);
    nx = res.x; nz = res.z;
    if (res.pushed > 0.04) speed *= 0.55;

    x = clamp(nx, bounds.x0, bounds.x1);
    z = clamp(nz, bounds.z0, bounds.z1);

    place(dt, false);

    wheelRot += speed * dt / 0.48;
    wheels.forEach(function (w) {
      w.g.rotation.x = wheelRot;
      w.g.rotation.y = w.front ? -steerCur * 0.5 : 0;
    });

    // Caméra : siège conducteur
    const eye = SEAT.clone().applyEuler(g.rotation).add(g.position);
    camera.position.set(origin.x + eye.x, origin.y + eye.y, origin.z + eye.z);
    if (o.view) {
      const v = o.view.get();
      o.view.set(v.yaw + (heading - prevHeading), v.pitch);
    }
    if (o.snow) o.snow.setBaseY(origin.y + bodyY);
  }

  // ==========================================
  // UPDATE
  // ==========================================
  // active = le joueur est dans la rue (sinon on n'affiche pas le bouton ENTER)

  function update(dt, active) {
    if (driving) {
      drive(dt);
      return;
    }
    if (!active) { hideAction(); return; }
    const px = camera.position.x - origin.x, pz = camera.position.z - origin.z;
    const d = Math.hypot(px - x, pz - z);
    if (d < 4.6) showEnter();
    else hideAction();
  }

  return {
    group: g,
    cargo: cargo,
    isDriving: function () { return driving; },
    enter: enter,
    exit: exit,
    update: update,
    getPose: function () { return { x: x, z: z, heading: heading, speed: speed }; }
  };
}
