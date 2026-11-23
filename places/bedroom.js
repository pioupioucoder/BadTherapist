import * as THREE from 'three';
import { buildNightstand } from '../objects/nightstand.js';
import { buildPhone } from '../objects/phone.js';
import { buildTV } from '../objects/tv.js';

// ==========================================
// BAD THERAPIST — LA CHAMBRE (places/bedroom.js)
// ==========================================
// Uniquement la chambre : murs, lit, télévision, porte, table de chevet, téléphone.
// Ce qui relie la chambre au reste de l'immeuble (couloir, ascenseur, hall, rue, collisions du joueur,
// sauvegarde) est dans apartment.js. La vue par la fenêtre est dans windowview.js.

export const WALL_H = 3.6;
export const ROOM_W = 16;
export const ROOM_D = 16;
export const HALF_D = ROOM_D / 2;

// Départ du joueur : dans la chambre
export const BEDROOM_SPAWN = { x: 0, y: 1.7, z: 6 };

// Collisions de la chambre (niveau 6) : à ajouter à l'objet physics de apartment.js
export function addBedroomColliders(physics) {
    // Chambre (niveau 6) : murs extérieurs, mur d'entrée avec la porte au milieu
    const doorOpenBlock = function() { return !(window._doorOpen && !window._doorAnimating); };
    physics.add({ x0: -ROOM_W / 2 - 0.6, x1: -ROOM_W / 2, z0: -1, z1: HALF_D + 0.6, level: 6 });
    physics.add({ x0: ROOM_W / 2, x1: ROOM_W / 2 + 0.6, z0: -1, z1: HALF_D + 0.6, level: 6 });
    physics.add({ x0: -ROOM_W / 2 - 0.6, x1: ROOM_W / 2 + 0.6, z0: HALF_D, z1: HALF_D + 0.6, level: 6 });
    physics.add({ x0: -ROOM_W / 2 - 0.6, x1: -2.5, z0: -1, z1: 0, level: 6 });
    physics.add({ x0: 2.5, x1: ROOM_W / 2 + 0.6, z0: -1, z1: 0, level: 6 });
    physics.add({ x0: -2.5, x1: -0.6, z0: -0.15, z1: 0.15, level: 6 });
    physics.add({ x0: 0.6, x1: 2.5, z0: -0.15, z1: 0.15, level: 6 });
    physics.add({ x0: -0.6, x1: 0.6, z0: -0.15, z1: 0.15, level: 6, active: doorOpenBlock });
}

// o = { camera, canvas, physics, windowView, floorNumber, corridorWallMaterial }
export function buildBedroom(scene, o) {
    const camera = o.camera;
    const canvas = o.canvas;
    const physics = o.physics;
    const windowView = o.windowView;
    const FLOOR_NUMBER = o.floorNumber;

    // ─── LUMIÈRES (ambiance morne, sans lampe) ───────────────────────
    const ambient = new THREE.AmbientLight(0x6f747a, 0.10);
    scene.add(ambient);

    // Faible lueur froide qui vient de la fenêtre
    const windowGlow = new THREE.PointLight(0x9aa6b0, 0.55, 14, 2);
    windowGlow.position.set(0, 2.4, 6.6);
    scene.add(windowGlow);

    // ─── TEXTURES ────────────────────────────────────────────────────
    function makeTex(fn, size) {
        size = size || 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        fn(ctx, size);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }

    const stoneTex = makeTex(function(ctx, s) {
        ctx.fillStyle = '#b8a888';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * s,
                y = Math.random() * s;
            const r = 180 + Math.random() * 40,
                g = 160 + Math.random() * 30,
                b = 130 + Math.random() * 30;
            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.fillRect(x, y, 6 + Math.random() * 14, 6 + Math.random() * 12);
        }
        ctx.strokeStyle = 'rgba(80,70,55,0.12)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < s; i += 20) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(s, i);
            ctx.stroke();
        }
    }, 128);
    stoneTex.repeat.set(3, 3);

    const floorTex = makeTex(function(ctx, s) {
        ctx.fillStyle = '#4a3828';
        ctx.fillRect(0, 0, s, s);
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                const v = 70 + Math.random() * 30;
                ctx.fillStyle = 'rgb(' + (v + 20) + ',' + (v - 10) + ',' + (v - 30) + ')';
                ctx.fillRect(col * 12 + 1, row * 12 + 1, 10, 10);
            }
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= s; i += 12) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(s, i);
            ctx.stroke();
        }
    }, 120);
    floorTex.repeat.set(8, 8);

    const woodTex = makeTex(function(ctx, s) {
        ctx.fillStyle = '#5a3a20';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < s; i += 3) {
            ctx.fillStyle = 'hsl(28,' + (25 + Math.random() * 15) + '%,' + (20 + Math.random() * 12) + '%)';
            ctx.fillRect(0, i, s, 2);
        }
    }, 64);
    woodTex.repeat.set(4, 4);

    // ─── FONCTION POUR LES CHEMINS D'IMAGES ──────────────────────
    function getImagePath(filename) {
        return 'images/' + filename;
    }

    // ─── TEXTURE D'HORREUR (image darkwall.png sur fond noir) ────
    function createHorrorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Fond noir (transparent pour l'émission)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3); // répète pour couvrir tout le mur

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            // Effacer en noir
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 10 occurrences aléatoires
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const scale = 0.3 + Math.random() * 0.8;
                const angle = Math.random() * Math.PI * 2;
                const w = img.width * scale;
                const h = img.height * scale;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);
                if (Math.random() > 0.5) ctx.scale(-1, 1);
                ctx.drawImage(img, -w/2, -h/2, w, h);
                ctx.restore();
            }

            tex.needsUpdate = true;
        };
        img.src = getImagePath('darkwall.png');

        return tex;
    }


    // ─── MATÉRIAUX ──────────────────────────────────────────────────
    const mWall = new THREE.MeshStandardMaterial({
        map: stoneTex,
        color: 0xa39e96,
        roughness: 0.6,
        metalness: 0.1
    });
    const mFloor = new THREE.MeshLambertMaterial({ map: floorTex, color: 0x6a5848 });
    const mWood = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x7a5a38 });
    const mGlass = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const mCeil = new THREE.MeshLambertMaterial({ color: 0x8f8b86 });
    const mDoor = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x6a4a30 });
    const mHandle = new THREE.MeshLambertMaterial({ color: 0xccaa88 });
    const mDoorFrame = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const mDoorHighlight = new THREE.MeshLambertMaterial({ map: woodTex, color: 0x8a6a50, emissive: 0x442200, emissiveIntensity: 0.3 });

    // ─── HELPERS ──────────────────────────────────────────────────
    function box(w, h, d, mat, x, y, z, rx, ry, rz) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        if (ry) m.rotation.y = ry;
        if (rz) m.rotation.z = rz;
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        return m;
    }

    function plane(w, h, mat, x, y, z, rx, ry, rz) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        if (ry) m.rotation.y = ry;
        if (rz) m.rotation.z = rz;
        scene.add(m);
        return m;
    }

    function cylinder(rt, rb, h, seg, mat, x, y, z, rx, ry, rz) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        if (ry) m.rotation.y = ry;
        if (rz) m.rotation.z = rz;
        m.castShadow = true;
        scene.add(m);
        return m;
    }

    // ─── SOL ──────────────────────────────────────────────────────
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W, HALF_D),
        mFloor
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, HALF_D / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // ─── MUR DU FOND : FENÊTRE SUR L'IMMEUBLE ─────────────────────
    (function() {
        const fw = 2.8, fh = 2.0;
        const fz = HALF_D + 0.01;
        const yc = WALL_H / 2;
        const yTop = yc + fh / 2, yBot = yc - fh / 2;

        box(ROOM_W / 2 - fw / 2, WALL_H, 0.05, mWall, -(ROOM_W / 2 + fw / 2) / 2, WALL_H / 2, fz);
        box(ROOM_W / 2 - fw / 2, WALL_H, 0.05, mWall, (ROOM_W / 2 + fw / 2) / 2, WALL_H / 2, fz);
        box(fw, WALL_H - yTop, 0.05, mWall, 0, (yTop + WALL_H) / 2, fz);
        box(fw, yBot, 0.05, mWall, 0, yBot / 2, fz);

        const mGlass2 = new THREE.MeshLambertMaterial({ color: 0x88bbdd, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
        windowView.makePane(fw + 0.02, fh + 0.02, 0, yc, fz + 0.002);
        plane(fw, fh, mGlass2, 0, yc, fz + 0.01);
        const frameMat = new THREE.MeshLambertMaterial({ color: 0x4a3828 });
        [
            [fw + 0.2, 0.06, 0, fh / 2],
            [fw + 0.2, 0.06, 0, -fh / 2],
            [0.06, fh + 0.2, -fw / 2, 0],
            [0.06, fh + 0.2, fw / 2, 0]
        ].forEach(function(opt) {
            box(opt[0], opt[1], 0.05, frameMat, opt[2], yc + opt[3], fz + 0.02);
        });
        box(fw, 0.04, 0.05, frameMat, 0, yc, fz + 0.02);
        box(0.04, fh, 0.05, frameMat, 0, yc, fz + 0.02);

    })();

    // ─── MUR D'ENTRÉE (en face du joueur) : PORTE AU MILIEU → COULOIR ──
    (function() {
        const doorW = 1.2, doorH = 2.2;
        const doorX = 0;
        const wz = 0;
        const doorZ = wz + 0.01;

        // Face +z = côté chambre, face -z = côté couloir
        const mBoth = [mWall, mWall, mWall, mWall, mWall, o.corridorWallMaterial];
        function wallPiece(w, h, x, y) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mBoth);
            m.position.set(x, y, wz);
            scene.add(m);
        }
        const sideW = ROOM_W / 2 - doorW / 2;
        wallPiece(sideW, WALL_H, -(ROOM_W / 2 + doorW / 2) / 2, WALL_H / 2);
        wallPiece(sideW, WALL_H, (ROOM_W / 2 + doorW / 2) / 2, WALL_H / 2);
        wallPiece(doorW, WALL_H - doorH, doorX, (doorH + WALL_H) / 2);

        const frameMatDoor = mDoorFrame;
        box(0.08, doorH, 0.08, frameMatDoor, doorX - doorW / 2 - 0.04, doorH / 2 + 0.025, doorZ);
        box(0.08, doorH, 0.08, frameMatDoor, doorX + doorW / 2 + 0.04, doorH / 2 + 0.025, doorZ);
        box(doorW + 0.16, 0.08, 0.08, frameMatDoor, doorX, doorH + 0.025 + 0.04, doorZ);

        // Porte interactive
        const pivot = new THREE.Group();
        pivot.position.set(doorX - doorW / 2, doorH / 2 + 0.025, doorZ);
        scene.add(pivot);

        const doorGroup = new THREE.Group();
        doorGroup.position.set(doorW / 2, 0, 0);
        const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.04), mDoor);
        doorMesh.castShadow = true; doorMesh.receiveShadow = true;
        doorGroup.add(doorMesh);

        // Poignées des deux côtés
        [1, -1].forEach(function(side) {
            const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mHandle);
            handle.position.set(0.35, -0.2, 0.06 * side);
            doorGroup.add(handle);
            const handleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), mHandle);
            handleBase.rotation.x = Math.PI / 2;
            handleBase.position.set(0.35, -0.2, 0.04 * side);
            doorGroup.add(handleBase);
        });

        const clickArea = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 1.2, doorH * 1.2),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide }));
        clickArea.position.set(0, 0, 0.02);
        clickArea.userData.isClickArea = true;
        doorGroup.add(clickArea);
        pivot.add(doorGroup);

        window._doorPivot = pivot;
        window._doorGroup = doorGroup;
        window._doorMesh = doorMesh;
        window._doorMat = mDoor;
        window._doorHighlightMat = mDoorHighlight;
        window._doorOpen = false;
        window._doorAnimating = false;
        window._doorData = {
            localX: doorX,
            localZ: doorZ,
            halfWidth: doorW / 2,
            isOpen: false
        };
    })();

    // Murs latéraux
    plane(HALF_D, WALL_H, mWall, -ROOM_W / 2, WALL_H / 2, HALF_D / 2, 0, Math.PI / 2);
    plane(HALF_D, WALL_H, mWall, ROOM_W / 2, WALL_H / 2, HALF_D / 2, 0, -Math.PI / 2);

    // ─── PLAFOND ─────────────────────────────────────────────────
    plane(ROOM_W, HALF_D, mCeil, 0, WALL_H, HALF_D / 2, Math.PI / 2);

    // ─── PLINTHES ────────────────────────────────────────────────
    const mBaseboard = new THREE.MeshStandardMaterial({ color: 0x6a1a1a, roughness: 0.7 });
    const baseH = 0.12;
    const baseDepth = 0.03;
    box(ROOM_W / 2 - 0.6, baseH, baseDepth, mBaseboard, -(ROOM_W / 2 + 0.6) / 2, baseH / 2, 0.02);
    box(ROOM_W / 2 - 0.6, baseH, baseDepth, mBaseboard, (ROOM_W / 2 + 0.6) / 2, baseH / 2, 0.02);
    box(ROOM_W, baseH, baseDepth, mBaseboard, 0, baseH / 2, HALF_D - 0.02);
    box(baseDepth, baseH, HALF_D, mBaseboard, -ROOM_W / 2 + 0.02, baseH / 2, HALF_D / 2);
    box(baseDepth, baseH, HALF_D, mBaseboard, ROOM_W / 2 - 0.02, baseH / 2, HALF_D / 2);

    // ─── LIT ──────────────────────────────────────────────────────
    // Cadre arrondi en bois, tête de lit capitonnée en arche, matelas biseauté, deux oreillers
    // bombés et une couette qui retombe sur les côtés. Cliquer dessus (de près) : le joueur
    // s'allonge, regarde le plafond, ses yeux se ferment, puis o.onSleep() est appelé (le rêve).
    // Au retour du rêve : bed.wakeUp() (les yeux s'ouvrent, le joueur se lève à côté du lit).
    function createBed() {
        const group = new THREE.Group();

        // Dalle à coins ronds et bords biseautés (cadre, matelas)
        function roundedSlab(w, d, h, r, bv, mat) {
            const sw = w - 2 * bv, sd = d - 2 * bv, x = -sw / 2, y = -sd / 2;
            const rr = Math.min(r, sw / 2 - 0.001, sd / 2 - 0.001);
            const s = new THREE.Shape();
            s.moveTo(x + rr, y);
            s.lineTo(x + sw - rr, y);       s.quadraticCurveTo(x + sw, y, x + sw, y + rr);
            s.lineTo(x + sw, y + sd - rr);  s.quadraticCurveTo(x + sw, y + sd, x + sw - rr, y + sd);
            s.lineTo(x + rr, y + sd);       s.quadraticCurveTo(x, y + sd, x, y + sd - rr);
            s.lineTo(x, y + rr);            s.quadraticCurveTo(x, y, x + rr, y);
            const g = new THREE.ExtrudeGeometry(s, {
                depth: Math.max(0.002, h - 2 * bv), bevelEnabled: true,
                bevelThickness: bv, bevelSize: bv, bevelSegments: 4, curveSegments: 8
            });
            g.rotateX(-Math.PI / 2);
            g.translate(0, bv, 0);
            const m = new THREE.Mesh(g, mat);
            m.castShadow = true; m.receiveShadow = true;
            return m;
        }

        // Panneau en arche (tête de lit)
        function archPanel(hw, y0, y1, depth, bv, mat, z) {
            const s = new THREE.Shape();
            const a = hw - bv, b0 = y0 + bv, b1 = y1 - bv;
            s.moveTo(-a, b0); s.lineTo(a, b0); s.lineTo(a, b1 - 0.38);
            s.quadraticCurveTo(a, b1, 0, b1);
            s.quadraticCurveTo(-a, b1, -a, b1 - 0.38);
            s.lineTo(-a, b0);
            const g = new THREE.ExtrudeGeometry(s, {
                depth: depth - 2 * bv, bevelEnabled: true,
                bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 16
            });
            g.translate(0, 0, bv);
            const m = new THREE.Mesh(g, mat);
            m.position.z = z;
            m.castShadow = true; m.receiveShadow = true;
            return m;
        }

        function createPatternTexture(colors, stripeWidth, bgColor) {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 256;
            const ctx = c.getContext('2d');
            ctx.fillStyle = bgColor || '#f0e0d0';
            ctx.fillRect(0, 0, 256, 256);
            ctx.save();
            ctx.translate(128, 128);
            ctx.rotate(0.4);
            for (let i = -300; i < 300; i += 20) {
                ctx.fillStyle = colors[Math.abs(i / 20) % colors.length];
                ctx.fillRect(i, -300, stripeWidth || 8, 600);
            }
            ctx.restore();
            for (let i = 0; i < 80; i++) {
                ctx.fillStyle = colors[(i + 3) % colors.length];
                ctx.beginPath();
                ctx.arc(20 + Math.random() * 216, 20 + Math.random() * 216, 6 + Math.random() * 8, 0, Math.PI * 2);
                ctx.fill();
            }
            const t = new THREE.CanvasTexture(c);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(2, 2);
            return t;
        }
        const blanketTex = createPatternTexture(['#e8a0b0', '#d08090', '#f0c0c8', '#c06070'], 10, '#f5e0e0');

        const woodMat = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xb98a5e });
        const fabricMat = new THREE.MeshLambertMaterial({ color: 0xb48a94 });
        const buttonMat = new THREE.MeshLambertMaterial({ color: 0x8e6672 });
        const mattressMat = new THREE.MeshLambertMaterial({ color: 0xf6efe6 });
        const pillowMat = new THREE.MeshLambertMaterial({ color: 0xf3ece4 });
        const blanketMat = new THREE.MeshLambertMaterial({ map: blanketTex, color: 0xf0e0e0, side: THREE.DoubleSide });

        // Pieds tournés
        const legGeo = new THREE.LatheGeometry([
            new THREE.Vector2(0.03, 0), new THREE.Vector2(0.05, 0.03), new THREE.Vector2(0.034, 0.12),
            new THREE.Vector2(0.06, 0.2), new THREE.Vector2(0.05, 0.28), new THREE.Vector2(0.0, 0.3)
        ], 12);
        [[-0.58, -0.78], [0.58, -0.78], [-0.58, 1.78], [0.58, 1.78]].forEach(function(p) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(p[0], 0, p[1]);
            leg.castShadow = true;
            group.add(leg);
        });

        // Cadre
        const frame = roundedSlab(1.34, 2.7, 0.24, 0.06, 0.04, woodMat);
        frame.position.set(0, 0.28, 0.5);
        group.add(frame);

        // Tête de lit : arche en bois + coussin capitonné + boutons
        group.add(archPanel(0.74, 0.12, 1.5, 0.1, 0.03, woodMat, -0.95));
        group.add(archPanel(0.62, 0.4, 1.36, 0.07, 0.025, fabricMat, -0.86));
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const bx = -0.45 + col * 0.3 + (row % 2 ? 0.15 : 0);
                if (Math.abs(bx) > 0.5) continue;
                const btn = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), buttonMat);
                btn.position.set(bx, 0.82 + row * 0.19, -0.785);
                group.add(btn);
            }
        }

        // Matelas
        const mattress = roundedSlab(1.24, 2.5, 0.26, 0.1, 0.07, mattressMat);
        mattress.position.set(0, 0.52, 0.55);
        group.add(mattress);

        // Oreillers bombés
        [-0.3, 0.3].forEach(function(px, i) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), pillowMat);
            p.scale.set(0.27, 0.1, 0.2);
            p.position.set(px, 0.88, -0.38);
            p.rotation.y = i ? -0.07 : 0.07;
            p.rotation.z = i ? -0.03 : 0.03;
            p.castShadow = true; p.receiveShadow = true;
            group.add(p);
        });

        // Couette : plan ondulé qui retombe sur les côtés et au pied du lit
        const duvetGeo = new THREE.PlaneGeometry(1.56, 2.0, 40, 56);
        duvetGeo.rotateX(-Math.PI / 2);
        duvetGeo.translate(0, 0, 0.97);
        const pa = duvetGeo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
            const u = pa.getX(i), v = pa.getZ(i);
            const dS = Math.max(0, Math.abs(u) - 0.62), dF = Math.max(0, v - 1.78);
            const dd = Math.sqrt(dS * dS + dF * dF);
            const t = Math.min(dd / 0.16, 1), k = 1 - t;
            let y = 0.8 - 0.4 * t * t * (3 - 2 * t);
            y += k * (0.011 * Math.sin(u * 11 + Math.sin(v * 3) * 2) + 0.016 * Math.sin(v * 6 + u * 2));
            const rv = (v - 0.12) / 0.09;
            y += k * 0.055 * Math.exp(-rv * rv);          // pli rabattu vers les oreillers
            pa.setY(i, y);
        }
        duvetGeo.computeVertexNormals();
        const duvet = new THREE.Mesh(duvetGeo, blanketMat);
        duvet.castShadow = true; duvet.receiveShadow = true;
        group.add(duvet);

        group.position.set(-7, 0, 0.8);
        group.rotation.y = Math.PI / 2;
        scene.add(group);
        group.updateMatrixWorld(true);
        window._bedPosition = group.position.clone();

        // ─── SE COUCHER : clic sur le lit → plafond → yeux fermés → o.onSleep() ───
        const S = { phase: 'idle', t: 0, clock: 0 };
        const startPos = new THREE.Vector3(), startQ = new THREE.Quaternion();
        const lyingPos = new THREE.Vector3(), lyingQ = new THREE.Quaternion();
        const standPos = new THREE.Vector3(), standQ = new THREE.Quaternion();
        const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
        const ease = function(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
        function lookQ(eye, target, up) {
            _m.lookAt(eye, target, up);
            return new THREE.Quaternion().setFromRotationMatrix(_m);
        }

        // Paupières : deux bandes noires qui se rejoignent au milieu de l'écran
        let lidsEl = null, lidTop = null, lidBot = null;
        function setLids(a) {
            if (!lidsEl) {
                lidsEl = document.createElement('div');
                lidsEl.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;display:none;overflow:hidden';
                const bar = 'position:absolute;left:0;right:0;height:0;background:#000;box-shadow:0 0 60px 36px #000';
                lidTop = document.createElement('div'); lidTop.style.cssText = bar + ';top:0';
                lidBot = document.createElement('div'); lidBot.style.cssText = bar + ';bottom:0';
                lidsEl.appendChild(lidTop); lidsEl.appendChild(lidBot);
                document.body.appendChild(lidsEl);
            }
            lidsEl.style.display = a <= 0.001 ? 'none' : 'block';
            lidTop.style.height = (a * 50.5) + '%';
            lidBot.style.height = (a * 50.5) + '%';
        }

        function next(phase) { S.phase = phase; S.t = 0; }

        // Tête sur l'oreiller, regard vers le plafond, le haut de l'écran vers la tête de lit
        function computeLying() {
            lyingPos.copy(group.localToWorld(new THREE.Vector3(0, 1.04, -0.12)));
            const head = group.localToWorld(new THREE.Vector3(0, 0, -1)).sub(group.localToWorld(new THREE.Vector3(0, 0, 0)));
            lyingQ.copy(lookQ(lyingPos, _v.copy(lyingPos).add(new THREE.Vector3(0, 1, 0)), head));
        }

        function startSleep() {
            if (S.phase !== 'idle') return;
            startPos.copy(camera.position);
            startQ.copy(camera.quaternion);
            computeLying();
            next('lying');
        }

        // Rechargement de la page pendant un rêve : on est déjà endormi, yeux fermés (pas d'animation)
        function resumeSleep() {
            if (S.phase !== 'idle') return;
            computeLying();
            camera.position.copy(lyingPos);
            camera.quaternion.copy(lyingQ);
            setLids(1);
            next('asleep');
        }

        function wakeUp() {
            if (S.phase !== 'asleep' && S.phase !== 'closing') return;
            // On se lève du côté du lit qui donne sur la pièce, face au milieu de la chambre
            standPos.copy(group.localToWorld(new THREE.Vector3(-1.05, 1.7, 0.4)));
            standQ.copy(lookQ(standPos, new THREE.Vector3(0, 1.5, 4.5), new THREE.Vector3(0, 1, 0)));
            next('waking');
        }

        function update(dt) {
            if (S.phase === 'idle') return;
            S.t += dt; S.clock += dt;
            let k;
            if (S.phase === 'lying') {
                k = Math.min(S.t / 2.0, 1);
                const e = ease(k);
                camera.position.lerpVectors(startPos, lyingPos, e);
                camera.position.y += Math.sin(Math.PI * e) * 0.12;
                camera.quaternion.copy(startQ).slerp(lyingQ, e);
                if (k >= 1) next('rest');
            } else if (S.phase === 'rest') {
                camera.position.copy(lyingPos);
                camera.position.y += Math.sin(S.clock * 1.6) * 0.008;
                camera.quaternion.copy(lyingQ);
                if (S.t >= 1.4) next('closing');
            } else if (S.phase === 'closing') {
                k = Math.min(S.t / 1.8, 1);
                camera.position.copy(lyingPos);
                camera.quaternion.copy(lyingQ);
                setLids(ease(k));
                if (k >= 1) {
                    next('asleep');
                    if (o.onSleep) o.onSleep(); else setTimeout(wakeUp, 1500);
                }
            } else if (S.phase === 'asleep') {
                camera.position.copy(lyingPos);
                camera.quaternion.copy(lyingQ);
            } else if (S.phase === 'waking') {
                k = Math.min(S.t / 2.2, 1);
                camera.position.copy(lyingPos);
                camera.quaternion.copy(lyingQ);
                setLids(1 - ease(k));
                if (k >= 1) next('rising');
            } else if (S.phase === 'rising') {
                k = Math.min(S.t / 1.6, 1);
                const e = ease(k);
                camera.position.lerpVectors(lyingPos, standPos, e);
                camera.position.y += Math.sin(Math.PI * e) * 0.15;
                camera.quaternion.copy(lyingQ).slerp(standQ, e);
                if (k >= 1) { setLids(0); S.phase = 'idle'; }
            }
        }

        // Clic sur le lit (à moins de 4,5 m)
        const bedMeshes = [];
        group.traverse(function(c) { if (c.isMesh) bedMeshes.push(c); });
        const bedRay = new THREE.Raycaster(), bedNdc = new THREE.Vector2();
        canvas.addEventListener('click', function(ev) {
            if (S.phase !== 'idle' || window._doorAnimating) return;
            const rect = canvas.getBoundingClientRect();
            bedNdc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
            bedRay.setFromCamera(bedNdc, camera);
            const hit = bedRay.intersectObjects(bedMeshes, false);
            if (!hit.length || hit[0].distance > 4.5) return;
            startSleep();
        });

        return {
            group: group,
            update: update,
            startSleep: startSleep,
            wakeUp: wakeUp,
            resumeSleep: resumeSleep,
            isSleeping: function() { return S.phase !== 'idle'; }
        };
    }
    const bed = createBed();



    // ─── INTERRUPTEUR + CHAMBRE « MAUDITE » ─────────────────────────
    // Un interrupteur sur le mur d'entrée, du côté de la poignée de la porte (x > 0).
    // Un clic : la chambre devient sombre et des inscriptions rouges écarlates, avec des coulures,
    // apparaissent partout (murs, plafond, sol). Ça ne clignote pas. Un autre clic : retour à la normale.
    // Les inscriptions ne sont dessinées qu'au premier clic (puis gardées).
    const scare = (function() {
        let dark = false, k = 0, built = false;
        const group = new THREE.Group();
        group.visible = false;
        scene.add(group);
        const surfMats = [];
        const baseAmbient = ambient.intensity, baseGlow = windowGlow.intensity;

        // Lueur rouge déjà dans la scène (intensité 0) : le nombre de lumières ne change jamais, donc pas de saccade
        const redGlow = new THREE.PointLight(0x8a0000, 0, 18, 2);
        redGlow.position.set(0, 2.6, 4);
        scene.add(redGlow);

        // ── L'interrupteur (visible même dans le noir : matériau sans éclairage)
        const plateMat = new THREE.MeshBasicMaterial({ color: 0xd8d0c0 });
        const rockerMat = new THREE.MeshBasicMaterial({ color: 0xf2ece0 });
        const plateOn = new THREE.Color(0xd8d0c0), plateOff = new THREE.Color(0x7a2424);
        const rockerOn = new THREE.Color(0xf2ece0), rockerOff = new THREE.Color(0xb04040);
        const SW_X = 1.05, SW_Y = 1.25;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.012), plateMat);
        plate.position.set(SW_X, SW_Y, 0.036);
        scene.add(plate);
        const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.02), rockerMat);
        rocker.position.set(SW_X, SW_Y, 0.046);
        rocker.rotation.x = -0.3;                      // lumière allumée : bascule vers le haut
        scene.add(rocker);

        // ── Dessin des inscriptions
        function rng(seed) {
            let a = seed >>> 0;
            return function() {
                a = (a + 0x6D2B79F5) >>> 0;
                let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        const TEXTS = ['Zephyr', 'I love you', 'I love you Zephyr', 'I love Zephyr'];
        const COLS = ['#a80016', '#c8101f', '#e01a2b', '#7d0010', '#d4152a'];
        const FONT = '"Segoe Script","Bradley Hand","Brush Script MT","Comic Sans MS",cursive';

        function drip(ctx, x, y, size, col, r) {
            const len = size * (0.4 + r() * 2.6);
            const lw = Math.max(2, size * (0.03 + r() * 0.04));
            const dx = (r() - 0.5) * lw * 0.6;
            ctx.save();
            ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + len); ctx.stroke();
            ctx.beginPath(); ctx.arc(x + dx, y + len, lw * 0.85, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        function splat(ctx, x, y, rad, col, r) {
            ctx.save();
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
            const n = 6 + ((r() * 8) | 0);
            for (let i = 0; i < n; i++) {
                const a = r() * Math.PI * 2, d = rad * (1.2 + r() * 3.2);
                ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * (0.12 + r() * 0.35), 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // Écriture tremblante, lettre par lettre (taille, inclinaison et ligne de base irrégulières)
        function scrawl(ctx, text, x, y, size, ang, col, r, gravity) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            ctx.font = 'bold ' + size + 'px ' + FONT;
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = size * 0.06;
            let cx = 0;
            const drips = [];
            for (const ch of text) {
                const w = ctx.measureText(ch).width;
                const jy = (r() - 0.5) * size * 0.14;
                ctx.save();
                ctx.translate(cx + w / 2, jy);
                ctx.rotate((r() - 0.5) * 0.35);
                ctx.scale(1, 0.9 + r() * 0.3);
                ctx.lineWidth = size * 0.045;
                ctx.fillText(ch, -w / 2, 0);
                ctx.strokeText(ch, -w / 2, 0);
                ctx.restore();
                if (ch !== ' ' && r() < 0.5) drips.push([cx + w * (0.2 + r() * 0.6), jy + size * 0.06]);
                cx += w * (0.85 + r() * 0.2);
            }
            // trait rageur sous ou à travers le texte
            if (r() < 0.4) {
                ctx.shadowBlur = 0; ctx.lineWidth = size * 0.05; ctx.lineCap = 'round';
                ctx.beginPath();
                const yy = r() < 0.5 ? size * 0.18 : -size * 0.25;
                ctx.moveTo(-size * 0.1, yy);
                for (let i = 1; i <= 7; i++) ctx.lineTo(cx * i / 7, yy + (r() - 0.5) * size * 0.2);
                ctx.stroke();
            }
            ctx.restore();
            if (gravity) {   // coulures : toujours vers le bas du mur, quelle que soit l'inclinaison du texte
                const ca = Math.cos(ang), sa = Math.sin(ang);
                drips.forEach(function(d) { drip(ctx, x + ca * d[0] - sa * d[1], y + sa * d[0] + ca * d[1], size, col, r); });
            }
        }

        function zigzag(ctx, x, y, len, size, ang, col, r) {
            ctx.save();
            ctx.translate(x, y); ctx.rotate(ang);
            ctx.strokeStyle = col; ctx.lineWidth = size * 0.05; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(0, 0);
            const n = 8 + ((r() * 8) | 0);
            for (let i = 1; i <= n; i++) ctx.lineTo(len * i / n, (i % 2 ? -1 : 1) * size * (0.1 + r() * 0.25));
            ctx.stroke();
            ctx.restore();
        }

        // Une surface = un canvas. wm × hm en mètres ; holes = rectangles à laisser vides [u0, v0, u1, v1] (mètres, depuis le coin haut-gauche)
        function makeSurface(wm, hm, cw, ch, seed, o) {
            const c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            const ctx = c.getContext('2d');
            const ppm = cw / wm;                       // pixels par mètre (horizontal)
            ctx.scale(1, ch / (hm * ppm));             // on dessine en pixels « carrés »
            const r = rng(seed);
            const W = cw, H = hm * ppm;
            for (let i = 0; i < o.count; i++) {
                const t = TEXTS[(r() * TEXTS.length) | 0];
                const size = (o.minM + r() * (o.maxM - o.minM)) * ppm;
                const col = COLS[(r() * COLS.length) | 0];
                const ang = o.free ? r() * Math.PI * 2 : (r() - 0.5) * 0.7;
                scrawl(ctx, t, r() * W, r() * H, size, ang, col, r, !o.free);
            }
            for (let i = 0; i < o.scribbles; i++) {
                zigzag(ctx, r() * W, r() * H, (0.5 + r() * 1.6) * ppm, 0.25 * ppm, o.free ? r() * 6.283 : (r() - 0.5) * 1.2, COLS[(r() * COLS.length) | 0], r);
            }
            for (let i = 0; i < o.splats; i++) splat(ctx, r() * W, r() * H, (0.012 + r() * 0.05) * ppm, COLS[(r() * COLS.length) | 0], r);
            (o.holes || []).forEach(function(h) {
                ctx.clearRect(h[0] * ppm, h[1] * ppm, (h[2] - h[0]) * ppm, (h[3] - h[1]) * ppm);
            });
            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 8;
            return tex;
        }

        function addSurface(w, h, cw, ch, seed, o, px, py, pz, rx, ry) {
            const mat = new THREE.MeshBasicMaterial({
                map: makeSurface(w, h, cw, ch, seed, o), transparent: true, opacity: 0, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
            });
            surfMats.push(mat);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            m.position.set(px, py, pz);
            m.rotation.x = rx || 0;
            m.rotation.y = ry || 0;
            m.renderOrder = 5;
            group.add(m);
        }

        function build() {
            built = true;
            const wallO = { count: 22, minM: 0.35, maxM: 1.5, scribbles: 9, splats: 26, free: false };
            // Mur d'entrée (z = 0) : on laisse libres la porte et l'interrupteur
            addSurface(ROOM_W, WALL_H, 2048, 512, 11, Object.assign({ holes: [[ROOM_W / 2 - 0.9, WALL_H - 2.5, ROOM_W / 2 + 0.9, WALL_H], [ROOM_W / 2 + SW_X - 0.18, WALL_H - SW_Y - 0.2, ROOM_W / 2 + SW_X + 0.18, WALL_H - SW_Y + 0.2]] }, wallO),
                0, WALL_H / 2, 0.045, 0, 0);
            // Mur du fond (z = HALF_D) : on laisse libre la fenêtre
            addSurface(ROOM_W, WALL_H, 2048, 512, 23, Object.assign({ holes: [[ROOM_W / 2 - 1.55, 0.7, ROOM_W / 2 + 1.55, 2.9]] }, wallO),
                0, WALL_H / 2, HALF_D - 0.045, 0, Math.PI);
            // Murs de gauche et de droite
            const sideO = Object.assign({}, wallO, { count: 14 });
            addSurface(HALF_D, WALL_H, 1024, 512, 37, sideO, -ROOM_W / 2 + 0.045, WALL_H / 2, HALF_D / 2, 0, Math.PI / 2);
            addSurface(HALF_D, WALL_H, 1024, 512, 41, sideO, ROOM_W / 2 - 0.045, WALL_H / 2, HALF_D / 2, 0, -Math.PI / 2);
            // Plafond et sol : écrit dans tous les sens
            const flatO = { count: 24, minM: 0.4, maxM: 1.6, scribbles: 12, splats: 40, free: true };
            addSurface(ROOM_W, HALF_D, 2048, 1024, 53, flatO, 0, WALL_H - 0.02, HALF_D / 2, Math.PI / 2, 0);
            addSurface(ROOM_W, HALF_D, 2048, 1024, 67, flatO, 0, 0.006, HALF_D / 2, -Math.PI / 2, 0);
        }

        function toggle() {
            dark = !dark;
            if (dark && !built) build();
            rocker.rotation.x = dark ? 0.3 : -0.3;       // bascule vers le bas : éteint
        }

        function update(dt) {
            const target = dark ? 1 : 0;
            if (k === target) return;
            k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt / 0.8);
            const e = k * k * (3 - 2 * k);
            ambient.intensity = baseAmbient * (1 - 0.85 * e);
            windowGlow.intensity = baseGlow * (1 - 0.9 * e);
            redGlow.intensity = 0.9 * e;
            for (let i = 0; i < surfMats.length; i++) surfMats[i].opacity = e;
            group.visible = k > 0.001;
            plateMat.color.copy(plateOn).lerp(plateOff, e);
            rockerMat.color.copy(rockerOn).lerp(rockerOff, e);
        }

        // Clic sur l'interrupteur (à moins de 4 m)
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        canvas.addEventListener('click', function(ev) {
            const rect = canvas.getBoundingClientRect();
            ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObjects([plate, rocker], false);
            if (hit.length && hit[0].distance <= 4) toggle();
        });

        return { update: update, toggle: toggle };
    })();

    // ─── TÉLÉVISION (objects/tv.js) ──────────────────────────────
    buildTV(scene, { camera: camera, canvas: canvas });



    // ─── PORTE EXTÉRIEURE – INTERACTION (sans redirection) ──────────────
    function setupDoorInteraction() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let doorHover = false;

        canvas.addEventListener('mousemove', function(event) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const pivot = window._doorPivot;
            if (!pivot) return;
            const doorGroup = window._doorGroup;
            const meshes = [];
            doorGroup.children.forEach(child => {
                if (child.isMesh && (child === window._doorMesh || child.userData.isClickArea)) {
                    meshes.push(child);
                }
            });
            const intersects = raycaster.intersectObjects(meshes);
            if (intersects.length > 0) {
                canvas.style.cursor = 'pointer';
                if (!doorHover) {
                    window._doorMesh.material = mDoorHighlight;
                    doorHover = true;
                }
            } else {
                canvas.style.cursor = 'default';
                if (doorHover) {
                    window._doorMesh.material = mDoor;
                    doorHover = false;
                }
            }
        });

       canvas.addEventListener('click', function(event) {
    if (!doorHover) return;
    const pivot = window._doorPivot;
    if (!pivot || window._doorAnimating) return;

    // État actuel
    const isOpen = window._doorOpen;
    // Angle cible : 0 si fermé, +PI/2 si ouvert (la porte s'ouvre vers le couloir)
    const targetAngle = isOpen ? 0 : Math.PI / 2;
    // Inverser l'état
    window._doorOpen = !isOpen;
    window._doorData.isOpen = window._doorOpen;
    window._doorAnimating = true;

    const startAngle = pivot.rotation.y;
    const duration = 600;
    const startTime = performance.now();

    function animateDoor(time) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const angle = startAngle + (targetAngle - startAngle) * eased;
        pivot.rotation.y = angle;
        if (progress < 1) {
            requestAnimationFrame(animateDoor);
        } else {
            pivot.rotation.y = targetAngle;
            window._doorAnimating = false;
        }
    }
    requestAnimationFrame(animateDoor);
});
    }
    setupDoorInteraction();

    // ─── TABLE DE CHEVET : tiroir + livre-journal (nightstand.js / journal.js) ───
    const nightstand = buildNightstand(scene, {
        camera: camera,
        canvas: canvas,
        physics: physics,
        level: FLOOR_NUMBER
    });

    // ─── TÉLÉPHONE D'EVELYN, posé sur la table de chevet (phone.js) ───
    const phone = buildPhone(scene, {
        camera: camera,
        canvas: canvas,
        anchor: nightstand.group
    });

    return {
        update(dt, time) {
            bed.update(dt, time);
            scare.update(dt);
            nightstand.update(dt, time);
            phone.update(dt, time);
        },
        // Pour apartment.js : bloquer la marche pendant qu'on dort, réveil au retour du rêve
        isSleeping: function() { return bed.isSleeping(); },
        wakeUp: function() { bed.wakeUp(); },
        resumeSleep: function() { bed.resumeSleep(); }
    };
}
