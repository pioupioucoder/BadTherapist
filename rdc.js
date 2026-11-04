import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — REZ-DE-CHAUSSÉE (rdc.js)
// ==========================================
// Hall d'entrée provisoire : on y arrive en prenant l'ascenseur vers le bas.
// Il est situé sous le couloir (même plan x/z, 18.9 m plus bas) : l'ascenseur
// est donc une vraie cabine qui descend dans une vraie gaine.
//
// Utilisation (voir bedroom.js) :
//   const rdc = buildGroundFloor(scene, { y: -18.9, z: -26, physics, level: 0,
//                                         scene, renderer, camera, canvas, streetOffsetX: 400 });
//
// CORRECTIF PORTE : à travers la porte, on voit maintenant la rue en temps réel.
//  - l'entrée de l'immeuble (cadre, vitre orange, poignée) et le corps du bâtiment sont masqués
//    pendant ce rendu (la caméra est "dans" l'immeuble : ils bouchaient la vue) -> opts.portalHide
//  - la neige est dessinée autour de la caméra de la rue -> opts.snow / opts.snowBaseY
// La porte d'entrée est vitrée et s'ouvre au clic. Derrière la vitre, on voit en temps réel
// la rue (la copie de immeuble.js placée en x + streetOffsetX), et en franchissant la porte
// bedroom.js téléporte le joueur devant l'entrée de l'immeuble.

export function buildGroundFloor(parent, opts) {

  const Y = opts.y;
  const Z0 = opts.z;                 // mur de l'ascenseur
  const LEVEL = opts.level === undefined ? 0 : opts.level;
  const physics = opts.physics;
  const STREET_DX = opts.streetOffsetX || 400;
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
  // PORTE D'ENTRÉE : double porte vitrée coulissante + vue sur la rue
  // ==========================================

  const doorW = 2.0, doorH = 2.4;
  const sideW = W / 2 - doorW / 2;
  plane(sideW, H, mWall, -(doorW / 2 + sideW / 2), H / 2, Z1, 0, Math.PI);
  plane(sideW, H, mWall, (doorW / 2 + sideW / 2), H / 2, Z1, 0, Math.PI);
  plane(doorW, H - doorH, mWall, 0, doorH + (H - doorH) / 2, Z1, 0, Math.PI);

  // Cadre
  box(0.1, doorH, 0.12, mMetalDark, -doorW / 2 - 0.05, doorH / 2, Z1 - 0.04);
  box(0.1, doorH, 0.12, mMetalDark, doorW / 2 + 0.05, doorH / 2, Z1 - 0.04);
  box(doorW + 0.2, 0.1, 0.12, mMetalDark, 0, doorH + 0.05, Z1 - 0.04);
  box(doorW, 0.03, 0.12, mMetalDark, 0, 0.015, Z1 - 0.04);

  // Deux vantaux vitrés
  const leafW = doorW / 2;
  const mGlassLeaf = new THREE.MeshBasicMaterial({
    color: 0xa8bcc8, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide
  });

  function makeLeaf(x, handleSide) {
    const g = new THREE.Group();
    g.position.set(x, doorH / 2, Z1 - 0.06);
    function lb(w, h, d, mat, px, py, pz) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      g.add(m);
    }
    lb(leafW, 0.07, 0.05, mMetalDark, 0, doorH / 2 - 0.035, 0);
    lb(leafW, 0.12, 0.05, mMetalDark, 0, -doorH / 2 + 0.06, 0);
    lb(0.05, doorH, 0.05, mMetalDark, -leafW / 2 + 0.025, 0, 0);
    lb(0.05, doorH, 0.05, mMetalDark, leafW / 2 - 0.025, 0, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 0.1, doorH - 0.2), mGlassLeaf);
    g.add(glass);
    lb(0.03, 0.6, 0.03, mMetal, handleSide * (leafW / 2 - 0.12), 0, -0.05);
    root.add(g);
    return g;
  }
  const leafL = makeLeaf(-leafW / 2, 1);
  const leafR = makeLeaf(leafW / 2, -1);

  // Porte : état et animation (0 = fermée, 1 = ouverte)
  let doorState = 0;
  let doorTarget = 0;
  const DOOR_SLIDE = leafW - 0.05;

  // ------------------------------------------
  // Vue en temps réel sur la rue (portail)
  // ------------------------------------------
  const doorPane = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({ color: 0x9aa8b0 })
  );
  doorPane.rotation.y = Math.PI;
  doorPane.position.set(0, doorH / 2, Z1 + 0.02);
  root.add(doorPane);

  let portal = null;
  if (opts.renderer && opts.camera) {

    const renderer = opts.renderer;
    const camera = opts.camera;
    const mainScene = opts.scene || parent;

    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      generateMipmaps: false
    };
    let rt;
    try {
      rt = THREE.WebGLMultisampleRenderTarget
        ? new THREE.WebGLMultisampleRenderTarget(size.x, size.y, rtOpts)
        : new THREE.WebGLRenderTarget(size.x, size.y, rtOpts);
    } catch (e) {
      rt = new THREE.WebGLRenderTarget(size.x, size.y, rtOpts);
    }
    rt.texture.encoding = THREE.sRGBEncoding;

    const uniforms = {
      tMap: { value: rt.texture },
      uRes: { value: new THREE.Vector2(size.x, size.y) }
    };
    doorPane.material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      side: THREE.FrontSide,
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tMap; uniform vec2 uRes; void main(){ gl_FragColor = vec4(texture2D(tMap, gl_FragCoord.xy / uRes).rgb, 1.0); }'
    });

    const outCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
    const frustum = new THREE.Frustum();
    const projMat = new THREE.Matrix4();
    const sphere = new THREE.Sphere();
    const wp = new THREE.Vector3();

    portal = {
      render: function() {
        camera.updateMatrixWorld();
        doorPane.updateWorldMatrix(true, false);
        doorPane.getWorldPosition(wp);
        sphere.set(wp, 2.2);
        projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projMat);
        if (!frustum.intersectsSphere(sphere)) return;

        renderer.getDrawingBufferSize(size);
        if (size.x !== uniforms.uRes.value.x || size.y !== uniforms.uRes.value.y) {
          rt.setSize(size.x, size.y);
          uniforms.uRes.value.copy(size);
        }

        // Même caméra que le joueur, décalée vers la copie de la rue
        outCam.fov = camera.fov;
        outCam.aspect = camera.aspect;
        outCam.near = camera.near;
        outCam.far = camera.far;
        outCam.updateProjectionMatrix();
        outCam.position.copy(camera.position);
        outCam.position.x += STREET_DX;
        outCam.quaternion.copy(camera.quaternion);
        outCam.updateMatrixWorld(true);

        const prevRT = renderer.getRenderTarget();
        const hide = (typeof opts.portalHide === 'function' ? opts.portalHide() : opts.portalHide) || [];
        const hidden = [];
        hide.forEach(function(o) {
          if (o && o.visible) { o.visible = false; hidden.push(o); }
        });

        doorPane.visible = false;
        renderer.setRenderTarget(rt);

        const draw = function() { renderer.render(mainScene, outCam); };
        if (opts.snow && opts.snow.withView) {
          opts.snow.withView(null, outCam.position, opts.snowBaseY || 0, draw);
        } else {
          draw();
        }

        renderer.setRenderTarget(prevRT);
        doorPane.visible = true;
        hidden.forEach(function(o) { o.visible = true; });
      }
    };
  }

  // ------------------------------------------
  // Clic sur la porte : ouvrir / fermer
  // ------------------------------------------
  if (opts.canvas && opts.camera) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    function pickDoor(event) {
      const rect = opts.canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, opts.camera);
      const hits = raycaster.intersectObjects([leafL, leafR, doorPane], true);
      return hits.length > 0 && hits[0].distance < 3.5;
    }
    opts.canvas.addEventListener('mousemove', function(event) {
      if (pickDoor(event)) opts.canvas.style.cursor = 'pointer';
    });
    opts.canvas.addEventListener('click', function(event) {
      if (pickDoor(event)) doorTarget = doorTarget > 0.5 ? 0 : 1;
    });
  }

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
    g.fillText('G', w / 2, h / 2);
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
    physics.add({ x0: -W / 2 - 0.6, x1: -doorW / 2, z0: Z1 - 0.1, z1: Z1 + 0.6, level: LEVEL });
    physics.add({ x0: doorW / 2, x1: W / 2 + 0.6, z0: Z1 - 0.1, z1: Z1 + 0.6, level: LEVEL });
    physics.add({
      x0: -doorW / 2, x1: doorW / 2, z0: Z1 - 0.15, z1: Z1 + 0.15, level: LEVEL,
      active: function() { return !(doorState > 0.85); }
    });  }

  return {
    width: W,
    wallH: H,
    wallMaterial: mWall,
    doorZ: Z1,
    door: {
      isOpen: function() { return doorState > 0.85; },
      setOpen: function(v) { doorTarget = v ? 1 : 0; doorState = v ? 1 : doorState; }
    },
    // active = le joueur est dans le hall (sert à économiser le rendu de la rue)
    update: function(dt, time, active) {
      if (doorState < doorTarget) doorState = Math.min(doorTarget, doorState + dt / 1.2);
      else if (doorState > doorTarget) doorState = Math.max(doorTarget, doorState - dt / 1.2);
      const e = doorState * doorState * (3 - 2 * doorState);
      leafL.position.x = -leafW / 2 - DOOR_SLIDE * e;
      leafR.position.x = leafW / 2 + DOOR_SLIDE * e;
      if (portal && active) portal.render();
    }
  };
}
