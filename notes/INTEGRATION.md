# Branchement dans immeuble.js (étape 1 : Pluie marche, perçoit, parle)

1) En haut de immeuble.js, ajoute :
   import { createAvatarWorld } from './engine/avatar-brain.js';

2) Dans buildWorld, juste après la création de `taxi` (dans le `if (ctx.driveCamera) { ... }`), ou à la fin avant `return` si tu préfères :

   let avatars = null;
   if (playerCam) {
     avatars = createAvatarWorld(scene, {
       camera: playerCam, origin: { x: scene.position.x, y: scene.position.y, z: scene.position.z },
       renderer: renderer, groundH: SH.walkHeight, collide: forest.collide,
       rects: [{ x0: -12.2, x1: 12.2, z0: -34.4, z1: -24.2 }].concat(work.colliders),
       places: { HOME: { x: 0, z: -22 }, WORK: { x: WORK_SPOT.x, z: WORK_SPOT.z - 6 }, LAKE: { x: SH.lake.x, z: SH.lake.z - SH.lake.r - 3 }, CROSSROADS: { x: SH.main.samples.find(p => p.s >= 338).x, z: SH.main.samples.find(p => p.s >= 338).z } },
       getPlayerName: () => 'Stranger'
     });
     avatars.add({ id: 'pluie', name: 'Pluie', dir: 'avatars/pluie/', x: 6, z: -12, height: 1.4,
       anims: { idle: 'happy_idle.fbx', walk: 'walking.fbx', run: 'run.fbx', talk: 'talk.fbx', sad: 'sad.fbx', angry: 'angry.fbx', wave: 'Hand Raising.fbx', drink: 'drinking.fbx' } });
   }

3) Dans update(dt, time), ajoute :  if (avatars) avatars.update(dt);

Oliver et Evelyn : ne PAS les ajouter ici tant que taxi.js / work.js les gardent (sinon doublon). Étape 2 : on les détache.
