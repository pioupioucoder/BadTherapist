import * as THREE from 'three';
import { buildWorld as buildOutside } from './outside.js';
import { buildCorridor } from './corridor.js';
import { buildElevator } from './elevator.js';
import { buildGroundFloor } from './rdc.js';
import { createWindowView } from './windowview.js';
import { buildBedroom, addBedroomColliders, WALL_H, HALF_D, BEDROOM_SPAWN } from './bedroom.js';

// ==========================================
// BAD THERAPIST — L'IMMEUBLE HABITÉ (places/apartment.js)
// ==========================================
// C'est le monde par défaut (world_base.html charge ce fichier quand on ne précise pas ?world=).
// Il assemble les lieux et gère ce qui les relie :
//   chambre (bedroom.js) -> couloir (corridor.js) -> ascenseur (elevator.js) -> hall (rdc.js) -> rue (outside.js)
// + les collisions du joueur, les étages, le son de la télé selon l'endroit, la sauvegarde, la carte.
// La vue par la fenêtre de la chambre est dans windowview.js.

export function buildWorld(scene, opts) {
    const camera = opts.camera;
    const renderer = opts.renderer;
    const canvas = renderer.domElement;
    const snow = opts.snow;

    // La neige tombe dehors (rue, fenêtre, porte vitrée) mais jamais dans les pièces
    // (zones d'exclusion déclarées plus bas). Elle était simplement jamais activée ici.
    if (snow) snow.setEnabled(true);

    // Départ du joueur : dans la chambre
    camera.position.set(BEDROOM_SPAWN.x, BEDROOM_SPAWN.y, BEDROOM_SPAWN.z);

    // ─── FENÊTRE : VUE TEMPS RÉEL SUR L'EXTÉRIEUR (windowview.js) ──
    const windowView = createWindowView({ scene: scene, renderer: renderer, camera: camera, snow: snow });

    // ─── PHYSIQUE : collisions simples (rectangles x/z, par étage) ──
    // level 6 = étage de la chambre / du couloir, level 0 = rez-de-chaussée,
    // sans level = valable partout (cabine d'ascenseur)
    const FLOOR_H = 3.15;
    const FLOOR_NUMBER = 6;                       // numéro de l'étage de la chambre
    const LEVEL_Y = { 6: 0, 0: -FLOOR_NUMBER * FLOOR_H };
    const physics = {
        colliders: [],
        level: FLOOR_NUMBER,
        add: function(c) { this.colliders.push(c); return c; }
    };

    // Collisions de la chambre (bedroom.js)
    addBedroomColliders(physics);

    // ─── COULOIR + ASCENSEUR + REZ-DE-CHAUSSÉE ──────────────────────
    const corridor = buildCorridor(scene, { wallH: WALL_H, nearZ: 0, farWall: false, physics: physics, level: 6 });
    const ELEV_Z = -26;   // mur du fond du couloir (nearZ - longueur du couloir)

    const elevator = buildElevator(scene, {
        z: ELEV_Z,
        camera: camera,
        canvas: canvas,
        physics: physics,
        floorH: FLOOR_H,
        baseFloor: FLOOR_NUMBER,
        levels: { 6: { y: LEVEL_Y[6] }, 0: { y: LEVEL_Y[0] } },
        startLevel: 6,
        enabledFloors: [0, 6]       // pour le moment : RDC et l'étage actuel
    });
    elevator.addLanding({ level: 6, width: 5, wallH: WALL_H, wallMaterial: corridor.wallMaterial });

    // ─── LA RUE (copie réelle de immeuble.js, placée à l'écart) ──────
    // L'entrée de l'immeuble est alignée sur la porte du hall : même z, décalage en x seulement.
    const STREET_DX = 400;
    const streetRoot = new THREE.Group();
    streetRoot.position.set(STREET_DX, LEVEL_Y[0], 8.8);
    scene.add(streetRoot);
    const street = buildOutside(streetRoot, {
        nightBoost: 1,
        // Camion : caméra de conduite, commandes, bouton ENTER/EXIT, neige
        driveCamera: camera,
        input: opts.input,
        view: opts.view,
        action: opts.action,
        snow: snow,
        onTeleport: function() { lastX = null; lastZ = null; snapY = true; },
        // La forêt n'est dessinée qu'autour du joueur
        getFocus: function() {
            if (camera.position.x > 100) return { x: camera.position.x - STREET_DX, z: camera.position.z - 8.8 };
            return { x: 0, z: -24 };
        }
    });
    const streetLights = [];
    streetRoot.traverse(function(o) { if (o.isPointLight && !o.userData.keep) streetLights.push(o); });
    streetLights.forEach(function(l) { l.parent.remove(l); });   // on économise les lumières (sauf celle de la maison de travail)
    const STREET_Z = 8.8;
    // On ne traverse pas la façade (sauf par l'entrée)
    physics.add({ x0: STREET_DX - 12, x1: STREET_DX - 1.4, z0: -24.8, z1: -15.7, level: 0 });
    physics.add({ x0: STREET_DX + 1.4, x1: STREET_DX + 12, z0: -24.8, z1: -15.7, level: 0 });
    // La maison de travail (work.js), sa voiture et sa pile de bois sont solides
    street.colliders.forEach(function(c) {
        physics.add({ x0: STREET_DX + c.x0, x1: STREET_DX + c.x1, z0: STREET_Z + c.z0, z1: STREET_Z + c.z1, level: 0 });
    });

    // Capteur de la porte d'entrée : quelqu'un dans le hall OU devant l'immeuble, près de la porte
    function nearEntrance() {
        if (playerLevel !== 0) return false;
        const px = camera.position.x, pz = camera.position.z;
        const lx = px > 100 ? px - STREET_DX : px;
        return Math.abs(lx) < 3.2 && Math.abs(pz - rdc.doorZ) < 4.5;
    }

    const rdc = buildGroundFloor(scene, {
        isNear: nearEntrance,
        y: LEVEL_Y[0], z: ELEV_Z, physics: physics, level: 0,
        scene: scene, renderer: renderer, camera: camera, canvas: canvas,
        streetOffsetX: STREET_DX,
        // Vue à travers la porte vitrée : on masque l'entrée / le corps de l'immeuble
        // (la caméra est "dans" l'immeuble, ils bouchaient la porte) et on dessine la neige
        portalHide: [street.main],
        snow: snow, snowBaseY: LEVEL_Y[0]
    });
    elevator.addLanding({ level: 0, width: rdc.width, wallH: rdc.wallH, wallMaterial: rdc.wallMaterial });
    // Côté rue : la porte de l'immeuble est fermée tant que la porte automatique n'est pas ouverte
    physics.add({ x0: STREET_DX - 1.4, x1: STREET_DX + 1.4, z0: -16.4, z1: -15.5, level: 0,
        active: function() { return !rdc.door.isOpen(); } });

    // Zones sans neige : la chambre, le couloir, la gaine d'ascenseur et le hall
    if (snow) {
        snow.excludeBox(-8.6, -0.6, -0.4, 8.6, WALL_H + 0.3, HALF_D + 0.04);                 // chambre
        snow.excludeBox(-2.8, -0.6, ELEV_Z - 0.1, 2.8, WALL_H + 0.3, 0.4);                   // couloir
        snow.excludeBox(-1.7, LEVEL_Y[0] - 0.3, ELEV_Z - 3.2, 1.7, 4.4, ELEV_Z + 0.2);       // gaine + cabine
        snow.excludeBox(-3.2, LEVEL_Y[0] - 0.3, ELEV_Z - 0.2, 3.2, LEVEL_Y[0] + 3.6, rdc.doorZ - 0.05);   // hall
    }

    let playerLevel = FLOOR_NUMBER;

    // Son de la télé selon l'endroit : plein volume dans la chambre, étouffé et plus faible
    // dans le couloir, très léger dans l'ascenseur (s'il est à l'étage de la chambre), rien ailleurs.
    function tvAudioTarget() {
        const px = camera.position.x, pz = camera.position.z;
        if (px < 100) {
            if (elevator.isInsideCab(px, pz)) {
                const atBedroomFloor = Math.abs(elevator.getCabY() - LEVEL_Y[FLOOR_NUMBER]) < 1.5;
                return { gain: atBedroomFloor ? 0.12 : 0, cut: 700 };
            }
            if (playerLevel === FLOOR_NUMBER) {
                if (pz >= 0) {                                   // chambre
                    const tv = window._tvPosition || { x: -7, z: 7.2 };
                    const d = Math.hypot(px - tv.x, pz - tv.z);
                    return { gain: 1 - 0.3 * Math.min(1, d / 14), cut: 20000 };
                }
                if (pz > -26 && Math.abs(px) < 3.2) {            // couloir
                    const t = Math.min(1, -pz / 26);
                    return { gain: 0.5 - 0.25 * t, cut: 1800 - 700 * t };
                }
            }
        }
        return { gain: 0, cut: 600 };
    }
    let wasDriving = false;
    let lastX = null, lastZ = null;
    let smoothY = null;      // hauteur lissée du joueur (collines)
    let snapY = true;
    const PLAYER_R = 0.3;

    function pushOut(px, pz) {
        for (let it = 0; it < 3; it++) {
            for (let i = 0; i < physics.colliders.length; i++) {
                const c = physics.colliders[i];
                if (c.level !== undefined && c.level !== physics.level) continue;
                if (c.active && !c.active()) continue;
                const cx = Math.max(c.x0, Math.min(c.x1, px));
                const cz = Math.max(c.z0, Math.min(c.z1, pz));
                const dx = px - cx, dz = pz - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 >= PLAYER_R * PLAYER_R) continue;
                if (d2 > 1e-8) {
                    const d = Math.sqrt(d2);
                    const push = PLAYER_R - d;
                    px += dx / d * push;
                    pz += dz / d * push;
                } else {
                    // centre à l'intérieur du rectangle : on sort par le côté le plus proche
                    const l = px - c.x0, r = c.x1 - px, t = pz - c.z0, b = c.z1 - pz;
                    const m = Math.min(l, r, t, b);
                    if (m === l) px = c.x0 - PLAYER_R;
                    else if (m === r) px = c.x1 + PLAYER_R;
                    else if (m === t) pz = c.z0 - PLAYER_R;
                    else pz = c.z1 + PLAYER_R;
                }
            }
        }
        return [px, pz];
    }

    // Collisions + hauteur du joueur (appelé à chaque frame)
    function updatePlayerPhysics(dt) {
        const x1 = camera.position.x, z1 = camera.position.z;
        if (lastX === null) { lastX = x1; lastZ = z1; }

        const inside = elevator.isInsideCab(x1, z1);
        const moving = elevator.state.moving;
        if (inside && !moving) playerLevel = elevator.state.level;
        physics.level = (inside && moving) ? null : playerLevel;

        // Déplacement en petits pas pour ne jamais traverser un mur
        const dx = x1 - lastX, dz = z1 - lastZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const steps = dist > 3 ? 1 : Math.max(1, Math.ceil(dist / 0.1));
        let px = lastX, pz = lastZ;
        for (let i = 0; i < steps; i++) {
            px += dx / steps;
            pz += dz / steps;
            const r = pushOut(px, pz);
            px = r[0]; pz = r[1];
        }
        // Dans la rue : on contourne les troncs et les rochers
        if (playerLevel === 0 && px > 100) {
            const tc = street.collideTrees(px - STREET_DX, pz - STREET_Z, PLAYER_R);
            px = tc[0] + STREET_DX;
            pz = tc[1] + STREET_Z;
        }
        // Porte du hall <-> rue (téléportation à travers la porte)
        if (playerLevel === 0) {
            if (px < 100 && Math.abs(px) < 1.0 && pz > rdc.doorZ + 0.1 && rdc.door.isOpen()) {
                px += STREET_DX;                                   // on sort devant l'immeuble
                snapY = true;
            } else if (px > 100 && Math.abs(px - STREET_DX) < 1.3 && pz < rdc.doorZ - 0.15 && rdc.door.isOpen()) {
                px -= STREET_DX;                                   // on rentre dans le hall
                rdc.door.setOpen(true);
                snapY = true;
            }
        }

        camera.position.x = px;
        camera.position.z = pz;
        lastX = px; lastZ = pz;

        // Hauteur : dans la cabine on suit la cabine, sinon on suit l'étage
        const insideNow = elevator.isInsideCab(px, pz);
        const inStreet = playerLevel === 0 && px > 100;
        let baseY;
        if (insideNow) {
            baseY = elevator.getCabY();
            snapY = true;
        } else if (inStreet) {
            // Dans la rue : on suit le relief (route, collines) avec un lissage
            baseY = LEVEL_Y[0] + street.walkHeight(px - STREET_DX, pz - STREET_Z);
        } else {
            baseY = LEVEL_Y[playerLevel];
        }
        const targetY = baseY + 1.7;
        if (smoothY === null || snapY || !inStreet) {
            smoothY = targetY;
            snapY = false;
        } else {
            smoothY += (targetY - smoothY) * Math.min(1, dt * 10);
        }
        camera.position.y = smoothY;

        // La neige tombe depuis le sol sous le joueur
        if (snow) snow.setBaseY(inStreet ? smoothY - 1.7 : LEVEL_Y[playerLevel]);
    }

    // ─── LA CHAMBRE (bedroom.js) ─────────────────────────────────────
    const bedroom = buildBedroom(scene, {
        camera: camera,
        canvas: canvas,
        physics: physics,
        windowView: windowView,
        floorNumber: FLOOR_NUMBER,
        corridorWallMaterial: corridor.wallMaterial
    });

    // ─── RETOUR ──────────────────────────────────────────────────
    return {
        // On gère nous-mêmes la hauteur (étages, ascenseur, collines de la rue)
        controlsHeight: true,

        // En conduisant, world_base ne déplace plus le joueur à pied
        isDriving() {
            return street.isDriving ? !!street.isDriving() : !!(street.truck && street.truck.isDriving());
        },

        // Données de la carte (routes, lac, lieux, camion, position du joueur)
        getMapData() {
            const d = street.getMapData();
            const px = camera.position.x, pz = camera.position.z;
            d.player = (px > 100)
                ? { x: px - STREET_DX, z: pz - STREET_Z }
                : { x: 0, z: -24, inside: true };
            return d;
        },

        // Sauvegarde de position : étage + "dans la rue ou non".
        // false = ne pas sauvegarder maintenant (dans la cabine d'ascenseur)
        getSaveState() {
            if (elevator.isInsideCab(camera.position.x, camera.position.z)) return false;
            if (street.isDriving ? street.isDriving() : (street.truck && street.truck.isDriving())) return false;
            if (street.work && street.work.interior && street.work.interior.isInside()) return false;
            return { level: playerLevel, street: camera.position.x > 100 };
        },

        applySaveState(extra, pose) {
            const x = camera.position.x;
            if (extra && extra.level !== undefined && extra.level !== null) {
                playerLevel = extra.level;
            } else if (pose && x > 100) {
                playerLevel = 0;                    // ancienne sauvegarde faite dans la rue
            } else {
                playerLevel = FLOOR_NUMBER;
            }
            if (x > 100) playerLevel = 0;
            physics.level = playerLevel;
            lastX = null; lastZ = null;
            snapY = true;
            if (playerLevel === 0 && x < 100) rdc.door.setOpen(false);
        },

        update(dt, time) {
            bedroom.update(dt, time);
            elevator.update(dt);
            if (window._tvAudioUpdate) {
                const ta = tvAudioTarget();
                window._tvAudioUpdate(dt, ta.gain, ta.cut);
            }
            const truck = street.truck;
            const inVehicle = street.isDriving ? street.isDriving() : !!(truck && truck.isDriving());
            if (inVehicle) {
                // Au volant (camion) ou en passager (taxi) : le véhicule déplace la caméra, pas de marche à pied
                if (truck && truck.isDriving()) truck.update(dt, true);
                wasDriving = true;
            } else {
                if (wasDriving) {                       // on vient de descendre du camion
                    wasDriving = false;
                    lastX = null; lastZ = null;
                    snapY = true;
                }
                updatePlayerPhysics(dt);
                if (truck) truck.update(dt, playerLevel === 0 && camera.position.x > 100);
            }
            street.update(dt, time);
            street.setEntrance(rdc.door.amount());
            corridor.update(dt, time);
            rdc.update(dt, time, playerLevel === 0 && camera.position.x < 100);
            // La vue de la fenêtre n'est utile qu'à l'étage de la chambre
            if (playerLevel === FLOOR_NUMBER && !(elevator.isInsideCab(camera.position.x, camera.position.z) && elevator.state.moving)) {
                windowView.update(dt, time);
            }
        }
    };
}
