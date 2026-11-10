import * as THREE from 'three';

export function createTaxi(parent, o) {
  const origin = o.origin || { x: 0, y: 0, z: 0 };
  const camera = o.camera;
  const startPos = o.startPoint;
  const endPos = o.endPoint;

  const g = new THREE.Group();
  parent.add(g);

  // Modèle de la voiture
  const mBody = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4, metalness: 0.3 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.5, roughness: 0.1 });
  const mDark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const mHeadlight = new THREE.MeshBasicMaterial({ color: 0xffffdd });

  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  box(2.2, 0.6, 4.8, mBody, 0, 0.6, 0);
  box(2.0, 0.8, 2.4, mBody, 0, 1.3, 0.2);
  box(2.02, 0.6, 2.2, mGlass, 0, 1.3, 0.2);
  box(2.1, 0.1, 2.5, mBody, 0, 1.75, 0.2);
  box(2.0, 0.3, 1.0, mBody, 0, 0.95, -2.0);
  box(2.0, 0.4, 0.8, mBody, 0, 0.9, 2.0);
  box(0.7, 0.2, 0.3, new THREE.MeshBasicMaterial({ color: 0xffaa00 }), 0, 1.9, 0);
  box(0.4, 0.15, 0.1, mHeadlight, -0.7, 0.7, -2.45);
  box(0.4, 0.15, 0.1, mHeadlight, 0.7, 0.7, -2.45);

  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
  [[-1.0, -1.4], [1.0, -1.4], [-1.0, 1.4], [1.0, 1.4]].forEach(p => {
    const w = new THREE.Mesh(wheelGeo, mDark);
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], 0.4, p[1]);
    g.add(w);
  });

  // Position initiale
  g.position.set(startPos.x, startPos.y || 0, startPos.z);
  g.lookAt(endPos.x, g.position.y, endPos.z);

  let driving = false;
  let actionShown = false;
  let journeyProgress = 0;
  let isGoingToEvelyn = false;

  function showEnter() {
    if (o.action && !actionShown) {
      o.action.show('ENTER TAXI', enter);
      actionShown = true;
    }
  }

  function hideAction() {
    if (o.action && actionShown) {
      o.action.hide();
      actionShown = false;
    }
  }

  function enter() {
    if (driving) return;
    driving = true;
    hideAction();
    g.visible = false;

    const px = camera.position.x - origin.x;
    const pz = camera.position.z - origin.z;
    const dStart = Math.hypot(px - startPos.x, pz - startPos.z);
    const dEnd = Math.hypot(px - endPos.x, pz - endPos.z);

    isGoingToEvelyn = (dStart < dEnd);
    journeyProgress = 0;
  }

  function exit() {
    driving = false;
    g.visible = true;
    
    const ex = isGoingToEvelyn ? endPos.x : startPos.x;
    const ez = isGoingToEvelyn ? endPos.z : startPos.z;
    
    camera.position.x = origin.x + ex + 3.0;
    camera.position.z = origin.z + ez;
    camera.position.y = origin.y + 1.7;
    
    g.position.set(ex, startPos.y || 0, ez);
    g.lookAt(isGoingToEvelyn ? startPos.x : endPos.x, g.position.y, isGoingToEvelyn ? startPos.z : endPos.z);
    
    if (o.onExit) o.onExit();
  }

  function update(dt) {
    if (driving) {
      journeyProgress += dt * 0.3; // environ 3 secondes
      
      if (journeyProgress >= 1) {
        journeyProgress = 1;
        exit();
        return;
      }

      const start = isGoingToEvelyn ? startPos : endPos;
      const target = isGoingToEvelyn ? endPos : startPos;
      const arc = Math.sin(journeyProgress * Math.PI) * 10;
      
      camera.position.x = origin.x + start.x + (target.x - start.x) * journeyProgress;
      camera.position.z = origin.z + start.z + (target.z - start.z) * journeyProgress;
      camera.position.y = origin.y + start.y + (target.y - start.y) * journeyProgress + 2 + arc;

      if (o.view) {
        const dx = target.x - start.x;
        const dz = target.z - start.z;
        const yaw = Math.atan2(-dx, -dz);
        o.view.set(isGoingToEvelyn ? yaw : yaw + Math.PI, 0);
      }

    } else {
      const px = camera.position.x - origin.x;
      const pz = camera.position.z - origin.z;
      const d = Math.hypot(px - g.position.x, pz - g.position.z);

      if (d < 6.0) showEnter();
      else hideAction();

      // Collision (bloquer le joueur qui essaie de traverser)
      const dx = px - g.position.x;
      const dz = pz - g.position.z;
      if (Math.abs(dx) < 1.8 && Math.abs(dz) < 2.8) {
        if (Math.abs(dx) > Math.abs(dz)) {
          camera.position.x = origin.x + g.position.x + (dx > 0 ? 1.8 : -1.8);
        } else {
          camera.position.z = origin.z + g.position.z + (dz > 0 ? 2.8 : -2.8);
        }
      }
    }
  }

  return { group: g, update: update, isDriving: () => driving };
}