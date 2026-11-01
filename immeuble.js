import * as THREE from 'three';

export function buildBuildingWorld(scene) {

  // ─── MATÉRIAUX ─────────────────────────────

  const mats = {
    asphalt: new THREE.MeshStandardMaterial({color:0x343330, roughness:0.98}),
    snow: new THREE.MeshStandardMaterial({color:0xb8b5ae, roughness:1}),
    concrete: new THREE.MeshStandardMaterial({color:0x77736d, roughness:0.94}),
    concreteDark: new THREE.MeshStandardMaterial({color:0x514e49, roughness:0.95}),
    side: new THREE.MeshStandardMaterial({color:0x45433f, roughness:0.95}),
    trim: new THREE.MeshStandardMaterial({color:0x302f2c, roughness:0.9}),
    glassDark: new THREE.MeshStandardMaterial({color:0x171b1b, roughness:0.35, metalness:0.15}),
    trunk: new THREE.MeshStandardMaterial({color:0x292521, roughness:1}),
    branch: new THREE.MeshStandardMaterial({color:0x39332d, roughness:1}),
    metal: new THREE.MeshStandardMaterial({color:0x393936, metalness:0.55, roughness:0.65})
  };

  const warmWindowMats = [
    new THREE.MeshStandardMaterial({
      color:0xc6a77b,
      emissive:0x9a6635,
      emissiveIntensity:0.65
    }),
    new THREE.MeshStandardMaterial({
      color:0xd5c5a1,
      emissive:0xb08b54,
      emissiveIntensity:0.48
    }),
    new THREE.MeshStandardMaterial({color:0x262a2b}),
    new THREE.MeshStandardMaterial({color:0x343638})
  ];

  // ─── FONCTION BOX ──────────────────────────

  function box(parent,w,h,d,mat,x,y,z,cast=true) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      mat
    );

    m.position.set(x,y,z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);

    return m;
  }

  // ─── CIEL NOCTURNE ─────────────────────────

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2;
  skyCanvas.height = 256;

  const skyCtx = skyCanvas.getContext('2d');

  const skyGrad = skyCtx.createLinearGradient(0,0,0,256);

  skyGrad.addColorStop(0,'#211f1d');
  skyGrad.addColorStop(0.38,'#393632');
  skyGrad.addColorStop(0.72,'#5d5851');
  skyGrad.addColorStop(1,'#827b71');

  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0,0,2,256);

  for(let i=0;i<34;i++) {

    const x = Math.random()*2;
    const y = Math.random()*190;
    const r = 18+Math.random()*65;

    const cloud = skyCtx.createRadialGradient(x,y,1,x,y,r);

    cloud.addColorStop(0,'rgba(170,160,147,0.10)');
    cloud.addColorStop(1,'rgba(80,75,69,0)');

    skyCtx.fillStyle = cloud;
    skyCtx.fillRect(0,0,2,256);
  }

  const skyTexture = new THREE.CanvasTexture(skyCanvas);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180,20,14),
    new THREE.MeshBasicMaterial({
      map:skyTexture,
      side:THREE.BackSide,
      depthWrite:false
    })
  );

  sky.position.y = 8;
  scene.add(sky);

  // ─── SOL ENNEIGÉ ───────────────────────────

  box(scene,180,0.35,190,mats.snow,0,-0.22,-55,false);

  box(scene,13,0.08,180,mats.asphalt,0,-0.015,-55,false);

  for(let i=0;i<70;i++) {

    const side = i%2===0?-1:1;

    const x = side*(7.5+Math.random()*5);
    const z = 12-Math.random()*145;

    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1,7,5),
      mats.snow
    );

    const s = 0.35+Math.random()*1.1;

    mound.scale.set(
      s*1.8,
      0.12+Math.random()*0.18,
      s
    );

    mound.position.set(x,0.02,z);
    mound.receiveShadow = true;

    scene.add(mound);
  }

  // ─── IMMEUBLE PRINCIPAL ────────────────────

  const main = new THREE.Group();
  scene.add(main);

  const floors = 9;
  const floorH = 3.15;
  const width = 23;
  const depth = 9;
  const totalH = floors*floorH;

  box(
    main,
    width,
    totalH,
    depth,
    mats.concrete,
    0,
    totalH/2,
    -29
  );

  // Murs latéraux

  box(main,0.18,totalH,depth+0.08,mats.side,-width/2,totalH/2,-29);
  box(main,0.18,totalH,depth+0.08,mats.side,width/2,totalH/2,-29);

  // Séparation des étages

  for(let f=0;f<=floors;f++) {

    box(
      main,
      width+0.25,
      0.12,
      0.22,
      mats.concreteDark,
      0,
      f*floorH,
      -24.38
    );
  }

  // Fenêtres

  const cols = 7;
  const winW = 2.05;
  const winH = 1.72;

  for(let f=0;f<floors;f++) {

    for(let c=0;c<cols;c++) {

      const x = (c-(cols-1)/2)*3.05;
      const y = f*floorH+1.75;

      const lit = Math.random()<0.43;

      const wm = lit
        ? warmWindowMats[Math.floor(Math.random()*2)]
        : warmWindowMats[2+Math.floor(Math.random()*2)];

      // Cadre

      box(
        main,
        winW+0.18,
        winH+0.16,
        0.13,
        mats.trim,
        x,y,-24.34,
        false
      );

      // Vitre

      box(
        main,
        winW,
        winH,
        0.08,
        wm,
        x,y,-24.23,
        false
      );

      // Séparation verticale

      box(
        main,
        0.055,
        winH,
        0.04,
        mats.trim,
        x,y,-24.16,
        false
      );

      // Séparation horizontale

      box(
        main,
        winW,
        0.055,
        0.04,
        mats.trim,
        x,y,-24.16,
        false
      );

      // Appui de fenêtre

      box(
        main,
        winW+0.28,
        0.10,
        0.32,
        mats.concreteDark,
        x,
        y-winH/2-0.12,
        -24.15
      );

      // Balcons

      if(c%2===0 && f>0 && Math.random()<0.38) {

        box(
          main,
          2.55,
          0.12,
          1.0,
          mats.concreteDark,
          x,
          y-winH/2-0.35,
          -23.72
        );

        box(
          main,
          2.55,
          0.72,
          0.055,
          mats.metal,
          x,
          y-winH/2+0.02,
          -23.25,
          false
        );

        for(let k=-2;k<=2;k++) {

          box(
            main,
            0.045,
            0.72,
            0.055,
            mats.metal,
            x+k*0.5,
            y-winH/2+0.02,
            -23.25,
            false
          );
        }
      }
    }
  }

  // ─── ENTRÉE DE L'IMMEUBLE ────────────────

  box(main,3.2,2.55,0.22,mats.trim,0,1.28,-24.22);

  box(main,2.7,2.25,0.10,mats.glassDark,0,1.18,-24.06,false);

  box(main,0.08,2.25,0.08,mats.metal,0,1.18,-23.98,false);

  box(main,3.8,0.18,1.5,mats.concreteDark,0,2.55,-23.5);

  // Traces sur la façade

  for(let i=0;i<18;i++) {

    const x = -10.5+Math.random()*21;
    const y = 4+Math.random()*20;

    const streak = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.025,
        1+Math.random()*2.8,
        0.025
      ),
      new THREE.MeshBasicMaterial({
        color:0x55524d,
        transparent:true,
        opacity:0.22
      })
    );

    streak.position.set(x,y,-24.39);
    main.add(streak);
  }

  // ─── IMMEUBLES EN ARRIÈRE-PLAN ────────────

  function distantBlock(x,z,w,h,seed) {

    const g = new THREE.Group();
    scene.add(g);

    box(g,w,h,7,mats.side,x,h/2,z);

    const rows = Math.floor(h/3.1);
    const columns = Math.max(3,Math.floor(w/3.1));

    for(let r=0;r<rows;r++) {

      for(let c=0;c<columns;c++) {

        if(((r*13+c*7+seed)%10)<4) {

          const xx = x+(c-(columns-1)/2)*(w/columns);
          const yy = r*3.1+1.7;

          const material = (r+c+seed)%5===0
            ? warmWindowMats[0]
            : warmWindowMats[2];

          box(
            g,
            1.25,
            1.45,
            0.06,
            material,
            xx,
            yy,
            z+3.54,
            false
          );
        }
      }
    }
  }

  distantBlock(-27,-47,18,28,2);
  distantBlock(29,-52,20,34,4);
  distantBlock(-39,-82,23,39,7);
  distantBlock(41,-91,25,42,3);

  // ─── ARBRES SANS FEUILLES ──────────────────

  function makeTree(x,z,height=10) {

    const g = new THREE.Group();
    g.position.set(x,0,z);
    scene.add(g);

    const trunkH = height*0.48;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12,0.27,trunkH,7),
      mats.trunk
    );

    trunk.position.y = trunkH/2;
    trunk.castShadow = true;
    g.add(trunk);

    function branch(start,dir,len,radius) {

      const end = start.clone().add(
        dir.clone().multiplyScalar(len)
      );

      const mid = start.clone().add(end).multiplyScalar(0.5);

      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius*0.48,radius,len,5),
        mats.branch
      );

      mesh.position.copy(mid);

      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0,1,0),
        dir.clone().normalize()
      );

      mesh.castShadow = true;
      g.add(mesh);

      if(len>1.35) {

        for(let s=-1;s<=1;s+=2) {

          const d = new THREE.Vector3(
            dir.x*0.45+s*(0.35+Math.random()*0.35),
            0.65+Math.random()*0.35,
            dir.z*0.45
          );

          branch(
            end,
            d,
            len*(0.48+Math.random()*0.13),
            radius*0.58
          );
        }
      }
    }

    for(let k=0;k<5;k++) {

      const a = k*Math.PI*2/5+Math.random()*0.4;

      const start = new THREE.Vector3(
        (Math.random()-0.5)*0.15,
        trunkH*(0.55+k*0.075),
        0
      );

      const dir = new THREE.Vector3(
        Math.cos(a)*0.65,
        0.55+Math.random()*0.35,
        Math.sin(a)*0.55
      );

      branch(
        start,
        dir,
        height*(0.28+Math.random()*0.12),
        0.10
      );
    }

    // Branche supérieure

    branch(
      new THREE.Vector3(0,trunkH*0.88,0),
      new THREE.Vector3(0.08,1,0.02),
      height*0.34,
      0.09
    );

    // Neige au pied

    const snow = new THREE.Mesh(
      new THREE.SphereGeometry(1,7,5),
      mats.snow
    );

    snow.scale.set(1.3,0.13,1.1);
    snow.position.y = 0.02;

    g.add(snow);
  }

  makeTree(-9,2,12);
  makeTree(10,-1,13);
  makeTree(-16,-23,15);
  makeTree(16,-34,14);
  makeTree(-31,-12,12);
  makeTree(33,-20,13);

  // ─── LAMPADAIRES ──────────────────────────

  function streetLamp(x,z) {

    const g = new THREE.Group();
    g.position.set(x,0,z);
    scene.add(g);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075,0.12,5.8,8),
      mats.metal
    );

    pole.position.y = 2.9;
    pole.castShadow = true;
    g.add(pole);

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045,0.055,1.15,7),
      mats.metal
    );

    arm.rotation.z = Math.PI/2;
    arm.position.set(x<0?0.48:-0.48,5.65,0);
    g.add(arm);

    const lampX = x<0?1.0:-1.0;

    box(g,0.48,0.16,0.25,mats.metal,lampX,5.55,0,false);

    const bulb = new THREE.Mesh(
      new THREE.BoxGeometry(0.34,0.07,0.19),
      new THREE.MeshBasicMaterial({color:0xe7d2a9})
    );

    bulb.position.set(lampX,5.44,0);
    g.add(bulb);

    const light = new THREE.PointLight(
      0xd9c6a4,
      0.85,
      17,
      2
    );

    light.position.set(lampX,5.25,0);
    g.add(light);
  }

  streetLamp(-7,-4);
  streetLamp(8,-17);
  streetLamp(-13,-39);

  // ─── BANC ─────────────────────────────────

  const benchMat = new THREE.MeshStandardMaterial({
    color:0x39332d,
    roughness:0.9
  });

  function bench(x,z) {

    box(scene,2.1,0.12,0.55,benchMat,x,0.62,z);

    box(scene,2.1,0.72,0.12,benchMat,x,1.0,z-0.23);

    for(const dx of [-0.8,0.8]) {

      box(
        scene,
        0.12,
        0.62,
        0.12,
        mats.metal,
        x+dx,
        0.31,
        z
      );
    }

    box(scene,2.25,0.10,0.7,mats.snow,x,0.72,z,false);
  }

  bench(5,-7);

  // ─── NEIGE QUI TOMBE ───────────────────────

  const flakesCount = 650;

  const positions = new Float32Array(flakesCount*3);
  const velocities = [];

  for(let i=0;i<flakesCount;i++) {

    positions[i*3] = (Math.random()-0.5)*95;
    positions[i*3+1] = Math.random()*24+1;
    positions[i*3+2] = Math.random()*110-75;

    velocities.push(0.15+Math.random()*0.35);
  }

  const snowGeo = new THREE.BufferGeometry();

  snowGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(positions,3)
  );

  const snowMat = new THREE.PointsMaterial({
    color:0xe1ded7,
    size:0.075,
    transparent:true,
    opacity:0.72,
    depthWrite:false
  });

  const flakes = new THREE.Points(snowGeo,snowMat);
  scene.add(flakes);

  // ─── ANIMATION ─────────────────────────────

  return {

    update(dt,time,cameraPosition) {

      const p = snowGeo.attributes.position.array;

      for(let i=0;i<flakesCount;i++) {

        p[i*3] += Math.sin(time*0.45+i)*0.12*dt;

        p[i*3+1] -= velocities[i]*dt;

        p[i*3+2] += 0.12*dt;

        if(p[i*3+1]<0.1) {

          p[i*3+1] = 20+Math.random()*6;

          p[i*3] = cameraPosition.x+(Math.random()-0.5)*90;

          p[i*3+2] = cameraPosition.z-65+Math.random()*100;
        }
      }

      snowGeo.attributes.position.needsUpdate = true;
    }
  };
}