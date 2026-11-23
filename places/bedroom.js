import * as THREE from 'three';
import { buildNightstand } from '../objects/nightstand.js';
import { buildPhone } from '../objects/phone.js';
import { buildTV } from '../objects/tv.js';
import { buildComputer } from '../objects/computer.js';

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
    // Un interrupteur ancien (bakélite brune + laiton) sur le mur d'entrée, du côté de la poignée de la porte.
    // Un clic : la chambre devient sombre et des inscriptions rouges, des coulures, des mains, des yeux, des pas
    // apparaissent partout (murs, plafond, sol). Rien ne clignote. Un autre clic : retour à la normale.
    // Tout est dessiné au premier clic seulement (puis gardé).
    const scare = (function() {
        let dark = false, k = 0, built = false, hover = 0, hoverTarget = 0, eCur = 0, darkClock = 0;
        const group = new THREE.Group();
        group.visible = false;
        scene.add(group);
        const surfMats = [];
        const baseAmbient = ambient.intensity, baseGlow = windowGlow.intensity;

        // Lueur rouge déjà dans la scène (intensité 0) : le nombre de lumières ne change jamais, donc pas de saccade
        const redGlow = new THREE.PointLight(0x8a0000, 0, 18, 2);
        redGlow.position.set(0, 2.6, 4);
        scene.add(redGlow);

        // ── L'interrupteur : bakélite brune, anneau et levier en laiton (éclairé comme le reste de la chambre)
        const SW_X = 1.05, SW_Y = 1.25;
        const baseMat = new THREE.MeshPhongMaterial({ color: 0x3a281c, shininess: 18, specular: 0x221810 });
        const brassMat = new THREE.MeshPhongMaterial({ color: 0xa88a45, shininess: 55, specular: 0x7a6030 });
        const slotMat = new THREE.MeshLambertMaterial({ color: 0x1d130b });
        const sw = new THREE.Group();
        sw.position.set(SW_X, SW_Y, 0.026);
        scene.add(sw);
        function disc(r0, r1, h, z, mat) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 28), mat);
            m.rotation.x = Math.PI / 2;
            m.position.z = z;
            sw.add(m);
            return m;
        }
        disc(0.07, 0.075, 0.018, 0.009, baseMat);
        disc(0.052, 0.056, 0.012, 0.024, brassMat);
        disc(0.031, 0.031, 0.006, 0.03, slotMat);
        [-1, 1].forEach(function(s) {
            const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.006, 10), brassMat);
            sc.rotation.x = Math.PI / 2;
            sc.position.set(0, s * 0.064, 0.021);
            sw.add(sc);
        });
        const lever = new THREE.Group();
        lever.position.z = 0.03;
        lever.rotation.x = Math.PI / 3;                  // allumé : le levier pointe vers le haut
        sw.add(lever);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.075, 10), brassMat);
        stem.position.y = 0.0375;
        lever.add(stem);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), brassMat);
        knob.position.y = 0.078;
        lever.add(knob);
        // Zone de clic invisible, bien plus large que l'interrupteur
        const hitBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), new THREE.MeshBasicMaterial({ visible: false }));
        hitBox.position.set(0, 0, 0.05);
        sw.add(hitBox);

        // Dans le noir l'interrupteur garde une faible lueur rouge ; au survol de la souris il s'éclaire doucement
        function tint() {
            const e = eCur, h = hover;
            baseMat.emissive.setRGB(0.2 * e + 0.2 * h, 0.045 * e + 0.12 * h, 0.04 * e + 0.05 * h);
            brassMat.emissive.setRGB(0.3 * e + 0.3 * h, 0.07 * e + 0.2 * h, 0.05 * e + 0.08 * h);
        }

        // ── Générateur pseudo-aléatoire (mêmes inscriptions à chaque partie)
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
        const COLS = ['#b3001b', '#cf0f22', '#e8202f', '#8f0012', '#5a0009', '#ff3040', '#d4152a'];
        const FONT = '"Segoe Script","Bradley Hand","Brush Script MT","Comic Sans MS",cursive';
        const pick = function(r, arr) { return arr[(r() * arr.length) | 0]; };

        // ── Briques de dessin
        let CUR = null;   // { list, ctx } : coulures de la surface en cours, dessinées sur un calque à part (animé par un shader)
        function addDrip(x, y, dx, len, lw, col) {
            CUR.list.push({ x: x, y: y, dx: dx, len: len, lw: lw });
            const c = CUR.ctx;                    // même dessin que les anciennes coulures : trait de la couleur de la lettre + goutte ronde au bout
            c.save();
            c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'butt';
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + len); c.stroke();
            c.beginPath(); c.arc(x + dx, y + len, lw * 0.85, 0, Math.PI * 2); c.fill();
            c.restore();
        }
        function drip(ctx, x, y, size, col, r) {
            const len = size * (0.4 + r() * 2.6);
            const lw = Math.max(2, size * (0.03 + r() * 0.04));
            const dx = (r() - 0.5) * lw * 0.6;
            if (CUR) { addDrip(x, y, dx, len, lw, col); return; }
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

        // Une lettre tremblante (légèrement tournée, étirée, décalée)
        function glyph(ctx, ch, w, size, r, mode) {
            ctx.save();
            ctx.translate(0, (r() - 0.5) * size * 0.14);
            ctx.rotate((r() - 0.5) * 0.35);
            ctx.scale(1, 0.9 + r() * 0.3);
            if (mode === 'thin') {
                ctx.lineWidth = Math.max(1, size * 0.022); ctx.strokeText(ch, -w / 2, 0);
            } else {
                ctx.lineWidth = size * 0.045;
                ctx.fillText(ch, -w / 2, 0);
                ctx.strokeText(ch, -w / 2, 0);
                if (mode === 'double') { ctx.translate(size * 0.025, size * 0.02); ctx.fillText(ch, -w / 2, 0); }
            }
            ctx.restore();
        }

        // Écrit un texte centré en (cx, cy). o.mode : 'fill' | 'thin' | 'double'
        function scrawl(S, text, cx, cy, size, ang, col, o) {
            const ctx = S.ctx, r = S.r;
            ctx.save();
            ctx.font = 'bold ' + size + 'px ' + FONT;
            ctx.textBaseline = 'alphabetic';
            const total = ctx.measureText(text).width * 0.92;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const ox = cx - (ca * total / 2 + sa * 0.3 * size), oy = cy - (sa * total / 2 - ca * 0.3 * size);
            ctx.translate(ox, oy);
            ctx.rotate(ang);
            ctx.globalAlpha = o.alpha || 1;
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = o.mode === 'thin' ? 0 : size * 0.05;
            let x = 0;
            const drips = [];
            for (const ch of text) {
                const w = ctx.measureText(ch).width;
                ctx.save();
                ctx.translate(x + w / 2, 0);
                glyph(ctx, ch, w, size, r, o.mode);
                ctx.restore();
                if (ch !== ' ' && o.drips && r() < 0.38) drips.push([x + w * (0.2 + r() * 0.6), size * 0.08]);
                x += w * (0.85 + r() * 0.2);
            }
            if (o.strike && r() < o.strike) {             // trait rageur à travers le texte
                ctx.shadowBlur = 0; ctx.lineWidth = size * 0.05; ctx.lineCap = 'round';
                ctx.beginPath();
                const yy = -size * 0.25 + r() * size * 0.4;
                ctx.moveTo(-size * 0.1, yy);
                for (let i = 1; i <= 7; i++) ctx.lineTo(x * i / 7, yy + (r() - 0.5) * size * 0.2);
                ctx.stroke();
            }
            ctx.restore();
            drips.forEach(function(d) {   // les coulures tombent toujours vers le bas du mur
                drip(ctx, ox + ca * d[0] - sa * d[1], oy + sa * d[0] + ca * d[1], size * 0.8, col, r);
            });
            return total;
        }

        // Place un texte sans trop chevaucher les autres (un léger chevauchement reste possible)
        function putText(S, text, sizeM, o) {
            o = o || {};
            const r = S.r, size = sizeM * S.ppm;
            S.ctx.save(); S.ctx.font = 'bold ' + size + 'px ' + FONT;
            const w = S.ctx.measureText(text).width * 0.92;
            S.ctx.restore();
            const rad = Math.hypot(w, size * 1.15) / 2 * 0.8;
            const ang = o.ang !== undefined ? o.ang : (S.free ? r() * Math.PI * 2 : (r() - 0.5) * 0.5);
            let cx = o.x, cy = o.y;
            if (cx === undefined) {
                let ok = false;
                for (let t = 0; t < 70 && !ok; t++) {
                    cx = r() * S.W; cy = r() * S.H;
                    ok = S.fits(cx, cy, rad);
                }
                if (!ok) return false;
            }
            scrawl(S, text, cx, cy, size, ang, o.col || pick(r, COLS), {
                mode: o.mode || 'fill', alpha: o.alpha, drips: o.drips !== undefined ? o.drips : S.gravity, strike: o.strike !== undefined ? o.strike : 0.25
            });
            S.placed.push({ x: cx, y: cy, r: rad });
            return true;
        }

        const PHRASES = ['I love you', 'I love you', 'Zephyr', 'Zephyr', 'I love Zephyr', 'I love you Zephyr'];
        // Remplit les espaces libres : surtout du petit/moyen texte lisible, quelques gros
        function fillTexts(S, n, minM, maxM) {
            const r = S.r;
            for (let i = 0; i < n; i++) {
                const sz = minM + (maxM - minM) * Math.pow(r(), 2.2);
                const q = r();
                putText(S, pick(r, PHRASES), sz, { mode: q < 0.65 ? 'fill' : q < 0.85 ? 'thin' : 'double', alpha: 0.72 + r() * 0.28 });
            }
        }

        function heart(S, x, y, s, col) {
            const ctx = S.ctx, r = S.r;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((r() - 0.5) * 0.25);
            ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = s * 0.04;
            for (let p = 0; p < 4; p++) {                 // repassé plusieurs fois, comme au feutre
                ctx.lineWidth = s * (0.035 + r() * 0.03);
                ctx.beginPath();
                for (let i = 0; i <= 48; i++) {
                    const t = i / 48 * Math.PI * 2;
                    const hx = 16 * Math.pow(Math.sin(t), 3);
                    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                    const px = hx / 17 * s * 0.5 + (r() - 0.5) * s * 0.03, py = hy / 17 * s * 0.5 + (r() - 0.5) * s * 0.03;
                    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
                ctx.stroke();
            }
            ctx.lineWidth = s * 0.04;                     // une estafilade en travers
            ctx.beginPath();
            ctx.moveTo(-s * 0.55, -s * 0.3);
            for (let i = 1; i <= 6; i++) ctx.lineTo(-s * 0.55 + s * 1.1 * i / 6, -s * 0.3 + s * 0.7 * i / 6 + (r() - 0.5) * s * 0.1);
            ctx.stroke();
            ctx.restore();
            S.placed.push({ x: x, y: y, r: s * 0.55 });
            if (S.gravity) for (let i = 0; i < 3; i++) drip(ctx, x + (r() - 0.5) * s * 0.3, y + s * 0.4, s * 0.5, col, r);
        }

        // Main : paume étroite, quatre doigts effilés avec leurs plis, pouce, traînée du bras
        // et du sang qui coule des bouts de doigts. mirror = main inversée.
        function hand(S, x, y, s, ang, col, mirror) {
            const ctx = S.ctx, r = S.r;
            const ca = Math.cos(ang), sa = Math.sin(ang), mx = mirror ? -1 : 1;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            if (mirror) ctx.scale(-1, 1);
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = s * 0.025;

            // traînée du poignet / de l'avant-bras vers le bas
            const g = ctx.createLinearGradient(0, s * 0.45, 0, s * 1.8);
            g.addColorStop(0, col); g.addColorStop(1, 'rgba(120,0,16,0)');
            ctx.save();
            ctx.globalAlpha = 0.6; ctx.fillStyle = g; ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.moveTo(-0.15 * s, 0.45 * s); ctx.lineTo(0.15 * s, 0.45 * s);
            ctx.lineTo(0.2 * s, 1.8 * s); ctx.lineTo(-0.2 * s, 1.8 * s); ctx.fill();
            ctx.restore();

            // paume
            ctx.beginPath();
            ctx.moveTo(-0.14 * s, 0.62 * s);
            ctx.bezierCurveTo(-0.27 * s, 0.4 * s, -0.27 * s, 0.1 * s, -0.24 * s, -0.08 * s);
            ctx.lineTo(0.24 * s, -0.08 * s);
            ctx.bezierCurveTo(0.29 * s, 0.1 * s, 0.24 * s, 0.4 * s, 0.14 * s, 0.62 * s);
            ctx.closePath(); ctx.fill();

            // doigt effilé : base (x0,y0), longueur, largeur base → bout, inclinaison
            function finger(x0, y0, len, w0, w1, bend) {
                const tx = x0 + bend * len, ty = y0 - len;
                ctx.beginPath();
                ctx.moveTo(x0 - w0 / 2, y0);
                ctx.quadraticCurveTo((x0 + tx) / 2 - w0 / 2 * 0.9, (y0 + ty) / 2, tx - w1 / 2, ty);
                ctx.arc(tx, ty, w1 / 2, Math.PI, 0, false);
                ctx.quadraticCurveTo((x0 + tx) / 2 + w0 / 2 * 0.9, (y0 + ty) / 2, x0 + w0 / 2, y0);
                ctx.closePath(); ctx.fill();
                return [tx, ty];
            }
            // index, majeur, annulaire, auriculaire
            const spec = [[0.175, 0.52, 0.1, 0.07, 0.05], [0.065, 0.6, 0.1, 0.07, 0.02], [-0.05, 0.55, 0.095, 0.068, -0.03], [-0.165, 0.42, 0.085, 0.06, -0.08]];
            const tips = [];
            spec.forEach(function(f) {
                const len = f[1] * s * (0.96 + r() * 0.08), bend = f[4] + (r() - 0.5) * 0.06;
                const t = finger(f[0] * s, -0.06 * s, len, f[2] * s, f[3] * s, bend);
                tips.push(t);
            });
            // pouce, plus court et plus large, écarté
            const th = finger(0.2 * s, 0.34 * s, 0.4 * s, 0.12 * s, 0.09 * s, 0.62);
            tips.push(th);

            // plis des doigts et lignes de la paume : traits sombres (sang qui a séché dans les creux)
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(55,0,8,0.55)'; ctx.lineWidth = s * 0.011;
            spec.forEach(function(f, i) {
                [0.33, 0.66].forEach(function(q) {
                    const cx = f[0] * s + f[4] * f[1] * s * q, cy = -0.06 * s - f[1] * s * q, w = f[2] * s * 0.36;
                    ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.quadraticCurveTo(cx, cy + s * 0.012, cx + w, cy); ctx.stroke();
                });
            });
            ctx.beginPath(); ctx.moveTo(-0.2 * s, 0.1 * s); ctx.quadraticCurveTo(0, 0.2 * s, 0.22 * s, 0.05 * s); ctx.stroke();   // ligne de cœur
            ctx.beginPath(); ctx.moveTo(0.08 * s, 0.04 * s); ctx.quadraticCurveTo(0.0 * s, 0.28 * s, 0.1 * s, 0.5 * s); ctx.stroke(); // ligne de vie
            ctx.restore();

            // du sang coule des bouts de doigts (en repère mur : toujours vers le bas)
            if (S.gravity) {
                tips.forEach(function(t, i) {
                    if (r() < 0.75) {
                        const lx = t[0] * mx;
                        drip(ctx, x + ca * lx - sa * t[1], y + sa * lx + ca * t[1], s * (0.45 + r() * 0.5), col, r);
                    }
                });
                drip(ctx, x + ca * 0.05 * s * mx - sa * 0.6 * s, y + sa * 0.05 * s * mx + ca * 0.6 * s, s * 0.9, col, r);   // poignet
            }
            S.placed.push({ x: x, y: y - 0.05 * s, r: 0.8 * s });
        }

        function eye(S, x, y, s, col) {
            const ctx = S.ctx, r = S.r;
            ctx.save();
            ctx.translate(x, y);
            ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = s * 0.04;
            for (let p = 0; p < 3; p++) {
                const j = (r() - 0.5) * s * 0.08;
                ctx.lineWidth = s * (0.035 + r() * 0.03);
                ctx.beginPath(); ctx.moveTo(-s, j);
                ctx.quadraticCurveTo(0, -s * 0.8 + j, s, j);
                ctx.quadraticCurveTo(0, s * 0.8 + j, -s, j);
                ctx.stroke();
            }
            ctx.lineWidth = s * 0.05;
            ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, s * 0.17, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = s * 0.035;
            for (let i = 0; i < 9; i++) {                 // cils
                const a = -Math.PI * (0.15 + 0.7 * i / 8);
                ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.55);
                ctx.lineTo(Math.cos(a) * s * 1.1, Math.sin(a) * s * 0.85); ctx.stroke();
            }
            ctx.restore();
            S.placed.push({ x: x, y: y, r: s * 1.1 });
            if (S.gravity) { drip(ctx, x - s * 0.1, y + s * 0.5, s * 0.9, col, r); drip(ctx, x + s * 0.3, y + s * 0.45, s * 0.6, col, r); }
        }

        function tally(S, x, y, s, groups, col) {         // traits de comptage : combien de jours ?
            const ctx = S.ctx, r = S.r;
            ctx.save();
            ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = s * 0.07;
            ctx.shadowColor = col; ctx.shadowBlur = s * 0.04;
            for (let g = 0; g < groups; g++) {
                const gx = x + (g % 4) * s * 1.35, gy = y + Math.floor(g / 4) * s * 1.5;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath(); ctx.moveTo(gx + i * s * 0.28, gy + (r() - 0.5) * s * 0.06);
                    ctx.lineTo(gx + i * s * 0.28 + (r() - 0.5) * s * 0.06, gy + s); ctx.stroke();
                }
                ctx.beginPath(); ctx.moveTo(gx - s * 0.12, gy + s * 0.85); ctx.lineTo(gx + s * 0.95, gy + s * 0.12); ctx.stroke();
            }
            ctx.restore();
            S.placed.push({ x: x + s * 2, y: y + s * 0.8, r: s * (1.5 + Math.min(groups, 4) * 0.2) });
        }

        // Le même texte recopié ligne après ligne, de plus en plus déglingué (« punition »)
        function lines(S, text, cx, y0, rows, sizeM, col) {
            const r = S.r, size = sizeM * S.ppm;
            for (let i = 0; i < rows; i++) {
                const m = i / (rows - 1 || 1);
                const w = scrawl(S, text, cx + (r() - 0.5) * m * size * 1.2, y0 + i * size * 1.25, size * (1 + m * 0.35), (r() - 0.5) * m * 0.22, col,
                    { mode: 'fill', alpha: 0.95 - m * 0.2, drips: i === rows - 1 || r() < 0.2, strike: 0.1 + m * 0.4 });
                S.placed.push({ x: cx, y: y0 + i * size * 1.25, r: w / 2 * 0.8 });
            }
        }

        // Texte en cercle / en spirale. r1 === r0 : cercle ; sinon spirale qui s'ouvre vers l'extérieur
        function ringText(S, text, cx, cy, r0, r1, sizeM, col, turns) {
            const ctx = S.ctx, r = S.r, size = sizeM * S.ppm;
            ctx.save();
            ctx.font = 'bold ' + size + 'px ' + FONT;
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round';
            ctx.shadowColor = col; ctx.shadowBlur = size * 0.04;
            let th = r() * 6.28, rad = r0 * S.ppm, i = 0;
            const R0 = r0 * S.ppm, R1 = r1 * S.ppm, end = th + Math.PI * 2 * (turns || 1);
            while (th < end && i < 2500) {
                const ch = text[i % text.length]; i++;
                const w = ctx.measureText(ch).width;
                if (ch !== ' ') {
                    ctx.save();
                    ctx.translate(cx + Math.cos(th) * rad, cy + Math.sin(th) * rad);
                    ctx.rotate(th + Math.PI / 2);
                    glyph(ctx, ch, w, size, r, 'fill');
                    ctx.restore();
                }
                const dth = (w * 0.9) / Math.max(rad, 1);
                th += dth;
                rad = R0 + (R1 - R0) * ((th - (end - Math.PI * 2 * (turns || 1))) / (Math.PI * 2 * (turns || 1)));
            }
            ctx.restore();
            S.placed.push({ x: cx, y: cy, r: Math.max(R0, R1) });
        }

        // Pas nus de (x0,y0) à (x1,y1) (pixels), pied gauche / pied droit
        function footprints(S, x0, y0, x1, y1, step, col, wob) {
            const ctx = S.ctx, r = S.r, ppm = S.ppm;
            const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / step);
            const hd = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(hd), ny = Math.cos(hd);
            for (let i = 0; i <= n; i++) {
                const t = i * step, side = i % 2 ? 1 : -1;
                const off = side * 0.11 * ppm + Math.sin(i * 0.7) * wob * ppm;
                const px = x0 + Math.cos(hd) * t + nx * off, py = y0 + Math.sin(hd) * t + ny * off;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(hd + Math.PI / 2 + (r() - 0.5) * 0.25);
                ctx.globalAlpha = 0.9 - (i / (n + 1)) * 0.45;   // l'empreinte s'estompe en s'éloignant
                ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = ppm * 0.01;
                ctx.beginPath(); ctx.ellipse(0, 0, 0.05 * ppm, 0.115 * ppm, 0, 0, Math.PI * 2); ctx.fill();     // plante
                ctx.beginPath(); ctx.arc(0, 0.1 * ppm, 0.04 * ppm, 0, Math.PI * 2); ctx.fill();                  // talon
                for (let f = 0; f < 5; f++) {
                    ctx.beginPath();
                    ctx.arc((f - 2) * 0.022 * ppm * side, -0.125 * ppm + Math.abs(f - 1) * 0.006 * ppm, (0.021 - f * 0.0016) * ppm, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                S.placed.push({ x: px, y: py, r: 0.12 * ppm });
            }
        }

        // Longues coulures qui partent du haut du mur (comme si ça avait coulé du plafond)
        function streaks(S, n) {
            const ctx = S.ctx, r = S.r;
            for (let i = 0; i < n; i++) {
                const x = r() * S.W, len = (0.3 + r() * 2.2) * S.ppm, lw = (0.012 + r() * 0.03) * S.ppm;
                const col = pick(r, COLS);
                addDrip(x, 0, (r() - 0.5) * lw, len, lw, col);
            }
        }

        // ── Carte des coulures : chaque coulure est un trait vertical dont les canaux codent
        //    R = avancement le long de la coulure (0 en haut → 1 au bout), G = retard de départ, B = vitesse.
        //    Le shader la fait couler : elle s'allonge peu à peu, puis une goutte glisse sans fin le long du trait.
        function renderDrips(S, holes) {
            const c = document.createElement('canvas');
            c.width = S.cw; c.height = S.ch;
            const ctx = c.getContext('2d');
            ctx.scale(1, S.ch / S.H);
            S.drips.forEach(function(d) {
                const vel = 0.04 + Math.random() * 0.1;                      // mètres par seconde
                const rate = Math.min(0.3, Math.max(0.015, vel / Math.max(d.len / S.ppm, 0.05)));
                const dB = Math.round(Math.random() * 255), rB = Math.round(rate / 0.3 * 255);
                const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.len);
                g.addColorStop(0, 'rgb(0,' + dB + ',' + rB + ')');
                g.addColorStop(1, 'rgb(255,' + dB + ',' + rB + ')');
                ctx.strokeStyle = g; ctx.lineWidth = d.lw; ctx.lineCap = 'butt';
                ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.dx, d.y + d.len); ctx.stroke();
                ctx.fillStyle = 'rgb(255,' + dB + ',' + rB + ')';             // la goutte au bout
                ctx.beginPath(); ctx.arc(d.x + d.dx, d.y + d.len, d.lw * 0.85, 0, Math.PI * 2); ctx.fill();
            });
            holes.forEach(function(h) { ctx.clearRect(h[0], h[1], h[2] - h[0], h[3] - h[1]); });
            return flatTex(c);
        }
        function flatTex(c) {      // pas de mipmaps : les canaux codés ne doivent pas se mélanger
            const tex = new THREE.CanvasTexture(c);
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            return tex;
        }
        const DRIP_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
        // dripColor = les coulures telles qu'elles étaient dessinées (couleur de la lettre, bout rond) ;
        // dripInfo = avancement / retard / vitesse. On garde les couleurs d'origine telles quelles (pas de conversion).
        const DRIP_FS = [
            'uniform sampler2D dripColor; uniform sampler2D dripInfo; uniform float uTime; uniform float uOpacity; varying vec2 vUv;',
            'void main(){',
            '  vec4 c = texture2D(dripColor, vUv);',
            '  vec4 d = texture2D(dripInfo, vUv);',
            '  if (c.a < 0.02 || d.a < 0.02) discard;',
            '  float p = d.r;',
            '  float t0 = uTime - d.g * 8.0;',
            '  float rate = max(d.b * 0.3, 0.012);',
            '  float g = clamp(t0 * rate, 0.0, 1.0);',
            '  if (t0 <= 0.0 || p > g) discard;',
            '  float done = step(0.999, g);',
            '  float cyc = fract(t0 * rate * 0.5 + fract(d.g * 37.1));',
            '  float bead = done * smoothstep(0.06, 0.0, abs(p - cyc));',
            '  float tip = (1.0 - done) * smoothstep(0.05, 0.0, g - p);',
            '  vec3 col = mix(c.rgb, min(c.rgb * 1.3 + vec3(0.05, 0.02, 0.03), vec3(1.0)), 0.8 * (bead + tip));',
            '  gl_FragColor = vec4(col, c.a * uOpacity);',
            '}'
        ].join('\n');
        const dripMats = [];

        // ── Une surface = un canvas. wm × hm en mètres ; spec.holes = [u0, v0, u1, v1] laissés vides ; spec.compose(S)
        function makeSurface(wm, hm, cw, ch, seed, spec) {
            const c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            const ctx = c.getContext('2d');
            const ppm = cw / wm;
            ctx.scale(1, ch / (hm * ppm));             // on dessine en pixels « carrés »
            const holes = (spec.holes || []).map(function(h) { return [h[0] * ppm, h[1] * ppm, h[2] * ppm, h[3] * ppm]; });
            const S = {
                ctx: ctx, r: rng(seed), W: cw, H: hm * ppm, ppm: ppm, free: !!spec.free, gravity: !spec.free,
                cw: cw, ch: ch, placed: [], tol: 0.62,
                fits: function(x, y, rad) {
                    for (let i = 0; i < holes.length; i++) {
                        const h = holes[i], pad = rad * 0.5;
                        if (x > h[0] - pad && x < h[2] + pad && y > h[1] - pad && y < h[3] + pad) return false;
                    }
                    for (let i = 0; i < S.placed.length; i++) {
                        const p = S.placed[i], dx = p.x - x, dy = p.y - y, m = (p.r + rad) * S.tol;
                        if (dx * dx + dy * dy < m * m) return false;
                    }
                    return true;
                }
            };
            const dcv = document.createElement('canvas');       // calque des coulures (mêmes dimensions)
            dcv.width = cw; dcv.height = ch;
            const dctx = dcv.getContext('2d');
            dctx.scale(1, ch / (hm * ppm));
            CUR = { list: [], ctx: dctx };
            S.drips = CUR.list;
            spec.compose(S);
            CUR = null;
            holes.forEach(function(h) { ctx.clearRect(h[0], h[1], h[2] - h[0], h[3] - h[1]); });
            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = 8;
            let dripColor = null, dripInfo = null;
            if (S.drips.length) {
                holes.forEach(function(h) { dctx.clearRect(h[0], h[1], h[2] - h[0], h[3] - h[1]); });
                dripColor = flatTex(dcv);
                dripInfo = renderDrips(S, holes);
            }
            return { tex: tex, dripColor: dripColor, dripInfo: dripInfo };
        }

        function addSurface(w, h, cw, ch, seed, spec, px, py, pz, rx, ry) {
            const res = makeSurface(w, h, cw, ch, seed, spec);
            const mat = new THREE.MeshBasicMaterial({
                map: res.tex, transparent: true, opacity: 0, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
            });
            surfMats.push(mat);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            m.position.set(px, py, pz);
            m.rotation.x = rx || 0;
            m.rotation.y = ry || 0;
            m.renderOrder = 5;
            group.add(m);
            if (res.dripInfo) {                      // calque des coulures animées, posé sur la même surface
                const dm = new THREE.ShaderMaterial({
                    uniforms: { dripColor: { value: res.dripColor }, dripInfo: { value: res.dripInfo }, uTime: { value: 0 }, uOpacity: { value: 0 } },
                    vertexShader: DRIP_VS, fragmentShader: DRIP_FS, transparent: true, depthWrite: false,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
                });
                dripMats.push(dm);
                const dmesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dm);
                dmesh.renderOrder = 6;
                m.add(dmesh);
            }
        }

        function scribbles(S, n) {
            const r = S.r;
            for (let i = 0; i < n; i++) zigzag(S.ctx, r() * S.W, r() * S.H, (0.4 + r() * 1.2) * S.ppm, 0.2 * S.ppm, S.free ? r() * 6.283 : (r() - 0.5) * 1.2, pick(r, COLS), r);
        }
        function splats(S, n, maxM) {
            const r = S.r;
            for (let i = 0; i < n; i++) splat(S.ctx, r() * S.W, r() * S.H, (0.01 + r() * maxM) * S.ppm, pick(r, COLS), r);
        }

        const jobs = [];
        function queueJobs() {
            const W = ROOM_W, H = WALL_H;

            // Mur d'entrée (z = 0). u = x + 8, v = 3,6 − hauteur. On laisse libres la porte et l'interrupteur.
            jobs.push(function() { addSurface(W, H, 2048, 512, 11, {
                holes: [[W / 2 - 0.9, H - 2.5, W / 2 + 0.9, H], [W / 2 + SW_X - 0.2, H - SW_Y - 0.22, W / 2 + SW_X + 0.2, H - SW_Y + 0.22]],
                compose: function(S) {
                    const p = S.ppm;
                    putText(S, 'I love you Zephyr', 0.6, { x: 8 * p, y: 0.62 * p, ang: -0.015, col: '#d3101f', drips: true });   // au-dessus de la porte
                    hand(S, 6.7 * p, 2.3 * p, 0.55 * p, -0.2, '#b3001b');          // des mains accrochées au chambranle
                    hand(S, 9.6 * p, 1.9 * p, 0.5 * p, 0.25, '#cf0f22', true);
                    heart(S, 2.6 * p, 1.9 * p, 1.1 * p, '#d4152a');
                    putText(S, 'Zephyr', 0.2, { x: 2.6 * p, y: 1.95 * p, ang: -0.1, col: '#ff3040', drips: false });
                    eye(S, 4.9 * p, 1.15 * p, 0.45 * p, '#b3001b');
                    eye(S, 12.3 * p, 0.95 * p, 0.55 * p, '#cf0f22');
                    tally(S, 13.6 * p, 2.2 * p, 0.38 * p, 7, '#8f0012');
                    lines(S, 'I love you Zephyr', 11.2 * p, 1.4 * p, 5, 0.2, '#e8202f');
                    fillTexts(S, 60, 0.14, 0.5);
                    streaks(S, 16); scribbles(S, 8); splats(S, 34, 0.05);
                }
            }, 0, H / 2, 0.045, 0, 0); });

            // Mur du fond (z = HALF_D). u = 8 − x. On laisse libre la fenêtre.
            jobs.push(function() { addSurface(W, H, 2048, 512, 23, {
                holes: [[W / 2 - 1.55, 0.7, W / 2 + 1.55, 2.9]],
                compose: function(S) {
                    const p = S.ppm;
                    putText(S, 'I love you Zephyr', 0.5, { x: 8 * p, y: 0.36 * p, ang: 0.01, col: '#d3101f', drips: true });   // au-dessus de la fenêtre
                    eye(S, 5.5 * p, 1.7 * p, 0.55 * p, '#cf0f22');                  // des yeux qui guettent de chaque côté
                    eye(S, 10.5 * p, 1.7 * p, 0.55 * p, '#cf0f22');
                    heart(S, 3.0 * p, 1.9 * p, 0.95 * p, '#b3001b');
                    hand(S, 12.9 * p, 2.2 * p, 0.55 * p, 0.2, '#8f0012');
                    tally(S, 0.9 * p, 2.3 * p, 0.38 * p, 6, '#cf0f22');
                    fillTexts(S, 58, 0.14, 0.5);
                    streaks(S, 16); scribbles(S, 8); splats(S, 34, 0.05);
                }
            }, 0, H / 2, HALF_D - 0.045, 0, Math.PI); });

            // Mur de gauche, côté lit (u = 8 − z) : un grand cœur lacéré juste au-dessus du lit
            jobs.push(function() { addSurface(HALF_D, H, 1024, 512, 37, {
                compose: function(S) {
                    const p = S.ppm;
                    heart(S, 7.0 * p, 1.0 * p, 1.5 * p, '#d4152a');
                    putText(S, 'Zephyr', 0.34, { x: 7.0 * p, y: 1.05 * p, ang: -0.08, col: '#ff3040', drips: false, strike: 0 });
                    lines(S, 'I love you Zephyr', 3.3 * p, 0.55 * p, 7, 0.22, '#e8202f');
                    hand(S, 0.9 * p, 2.0 * p, 0.5 * p, 0.1, '#b3001b');
                    fillTexts(S, 30, 0.14, 0.45);
                    streaks(S, 8); scribbles(S, 5); splats(S, 20, 0.05);
                }
            }, -ROOM_W / 2 + 0.045, H / 2, HALF_D / 2, 0, Math.PI / 2); });

            // Mur de droite (u = z) : « Zephyr » en grand, griffé
            jobs.push(function() { addSurface(HALF_D, H, 1024, 512, 41, {
                compose: function(S) {
                    const p = S.ppm;
                    putText(S, 'Zephyr', 0.85, { x: 4.2 * p, y: 1.2 * p, ang: -0.06, col: '#cf0f22', drips: true });
                    eye(S, 1.3 * p, 2.3 * p, 0.45 * p, '#b3001b');
                    tally(S, 5.6 * p, 2.3 * p, 0.36 * p, 5, '#8f0012');
                    hand(S, 7.2 * p, 1.3 * p, 0.5 * p, -0.15, '#cf0f22', true);
                    fillTexts(S, 32, 0.14, 0.45);
                    streaks(S, 8); scribbles(S, 5); splats(S, 20, 0.05);
                }
            }, ROOM_W / 2 - 0.045, H / 2, HALF_D / 2, 0, -Math.PI / 2); });

            // Plafond (u = x + 8, v = 8 − z) : une spirale d'écriture juste au-dessus de l'oreiller, un anneau au milieu
            jobs.push(function() { addSurface(W, HALF_D, 2048, 1024, 53, {
                free: true,
                compose: function(S) {
                    const p = S.ppm;
                    ringText(S, 'I love you Zephyr  ', 1.2 * p, 7.1 * p, 0.12, 1.0, 0.11, '#e8202f', 5);   // spirale (au-dessus du lit)
                    ringText(S, 'I love you Zephyr  ', 8.0 * p, 4.0 * p, 2.4, 2.4, 0.26, '#cf0f22', 1);                        // anneau au centre
                    heart(S, 8.0 * p, 4.0 * p, 1.5 * p, '#d4152a');
                    putText(S, 'Zephyr', 0.4, { x: 8.0 * p, y: 4.05 * p, ang: 0.15, col: '#ff3040', strike: 0 });
                    fillTexts(S, 38, 0.16, 0.5);
                    scribbles(S, 10); splats(S, 50, 0.05);
                }
            }, 0, WALL_H - 0.02, HALF_D / 2, Math.PI / 2, 0); });

            // Sol (u = x + 8, v = z) : des pas qui vont de la porte au lit, puis du lit à la fenêtre
            jobs.push(function() { addSurface(W, HALF_D, 2048, 1024, 67, {
                free: true,
                compose: function(S) {
                    const p = S.ppm;
                    footprints(S, 8.0 * p, 0.7 * p, 3.0 * p, 1.0 * p, 0.55 * p, '#8f0012', 0.05);       // porte → pied du lit
                    splat(S.ctx, 3.0 * p, 1.05 * p, 0.2 * p, '#8f0012', S.r);
                    footprints(S, 2.7 * p, 1.5 * p, 8.2 * p, 7.2 * p, 0.55 * p, '#7d0010', 0.1);        // lit → fenêtre
                    ringText(S, 'I love you Zephyr  ', 11.0 * p, 4.0 * p, 1.7, 1.7, 0.22, '#b3001b', 1);
                    heart(S, 11.0 * p, 4.0 * p, 1.2 * p, '#cf0f22');
                    fillTexts(S, 34, 0.16, 0.5);
                    scribbles(S, 8); splats(S, 60, 0.06);
                }
            }, 0, 0.006, HALF_D / 2, -Math.PI / 2, 0); });
        }

        // Les 6 surfaces sont dessinées en douceur, une toutes les 0,6 s à partir de 3 s après le chargement
        // (pas de saccade) ; si on clique avant, le reste est dessiné d'un coup.
        queueJobs();
        function buildStep() { const j = jobs.shift(); if (j) j(); }
        function ensureBuilt() { while (jobs.length) jobs.shift()(); }
        for (let i = 0; i < jobs.length; i++) setTimeout(buildStep, 3000 + i * 600);

        function toggle() {
            dark = !dark;
            if (dark) { ensureBuilt(); darkClock = 0; }      // les coulures repartent du début à chaque extinction
            lever.rotation.x = dark ? (2 * Math.PI) / 3 : Math.PI / 3;      // éteint : le levier pointe vers le bas
        }

        function applyLook() {
            ambient.intensity = baseAmbient * (1 - 0.85 * eCur);
            windowGlow.intensity = baseGlow * (1 - 0.9 * eCur);
            redGlow.intensity = 0.9 * eCur;
            for (let i = 0; i < surfMats.length; i++) surfMats[i].opacity = eCur;
            group.visible = k > 0.001;
        }

        // Pour la sauvegarde : lire l'état, et le rétablir d'un coup au chargement (sans animation).
        // Les coulures sont alors déjà arrivées au bout (la lumière est éteinte « depuis un moment »).
        function isDark() { return dark; }
        function setDark(v) {
            v = !!v;
            if (v === dark) return;
            dark = v;
            lever.rotation.x = dark ? (2 * Math.PI) / 3 : Math.PI / 3;
            if (dark) { ensureBuilt(); darkClock = 90; }
            k = dark ? 1 : 0;
            eCur = k;
            applyLook();
        }

        function update(dt) {
            const target = dark ? 1 : 0;
            if (k !== target) {
                k += Math.sign(target - k) * Math.min(Math.abs(target - k), dt / 0.8);
                eCur = k * k * (3 - 2 * k);
                applyLook();
            }
            if (dark) darkClock += dt;
            for (let i = 0; i < dripMats.length; i++) {
                dripMats[i].uniforms.uTime.value = darkClock;
                dripMats[i].uniforms.uOpacity.value = eCur;
            }
            hover += (hoverTarget - hover) * Math.min(1, dt * 10);
            tint();
        }

        // Clic / survol sur l'interrupteur (zone de clic large, jusqu'à 5 m)
        const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
        function overSwitch(ev) {
            const rect = canvas.getBoundingClientRect();
            ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObject(hitBox, false);
            return hit.length > 0 && hit[0].distance <= 5;
        }
        canvas.addEventListener('click', function(ev) { if (overSwitch(ev)) toggle(); });
        canvas.addEventListener('mousemove', function(ev) { hoverTarget = overSwitch(ev) ? 1 : 0; });

        return { update: update, toggle: toggle, isDark: isDark, setDark: setDark };
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

    // ─── ORDINATEUR VINTAGE + CHAISE (objects/computer.js) ───
    const computer = buildComputer(scene, {
        camera: camera,
        canvas: canvas,
        physics: physics,
        level: FLOOR_NUMBER,
        seatX: 6.56,
        seatZ: 6.39,
        wallX: ROOM_W / 2,
        // Clé d'API YouTube Data v3 (limitée à cette API + ton site dans Google Cloud) : colle-la entre les guillemets.
        youtubeApiKey: 'AIzaSyBCNkd7216eruVPBk12ddz9Lq902h8G6_Q',
        // Permet à l'ordinateur de noter quand tu dors / éteins la lumière (affiché dans « Recent activity »)
        isSleeping: function() { return bed.isSleeping(); },
        isDark: function() { return scare.isDark(); },
        canUse: function() { return !bed.isSleeping(); }
    });

    return {
        update(dt, time) {
            bed.update(dt, time);
            scare.update(dt);
            nightstand.update(dt, time);
            phone.update(dt, time);
            computer.update(dt, time);
        },
        // Pour apartment.js : bloquer la marche pendant qu'on dort, réveil au retour du rêve
        isSleeping: function() { return bed.isSleeping(); },
        // Vrai quand le joueur est assis a l ordinateur (objects/computer.js)
        isBusy: function() { return computer.isUsing(); },
        wakeUp: function() { bed.wakeUp(); },
        resumeSleep: function() { bed.resumeSleep(); },
        // Interrupteur : état sauvegardé par apartment.js (getSaveState / applySaveState)
        isDark: function() { return scare.isDark(); },
        setDark: function(v) { scare.setDark(v); }
    };
}
