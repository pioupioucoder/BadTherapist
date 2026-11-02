// illusion.js – image darkwall.png sur les murs (fond transparent)
import * as THREE from 'three';
import { buildWorld as buildOutside } from './immeuble.js';
import { buildCorridor } from './corridor.js';

// bedroom.js – la chambre (copie d'illusion.js) adaptée à world_base.html
// La fenêtre affiche en temps réel l'extérieur de immeuble.js,
// comme si la chambre était dans un étage élevé de l'immeuble.

export function buildWorld(scene, opts) {
    const camera = opts.camera;
    const renderer = opts.renderer;
    const canvas = renderer.domElement;

    // ─── LUMIÈRES (ambiance morne, sans lampe) ───────────────────────
    const ambient = new THREE.AmbientLight(0x6f747a, 0.10);
    scene.add(ambient);

    // Faible lueur froide qui vient de la fenêtre
    const windowGlow = new THREE.PointLight(0x9aa6b0, 0.55, 14, 2);
    windowGlow.position.set(0, 2.4, 6.6);
    scene.add(windowGlow);

    // Départ du joueur : dans la chambre
    camera.position.set(0, 1.7, 6);

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

    // ─── DIMENSIONS ──────────────────────────────────────────────
    const WALL_H = 3.6;
    const ROOM_W = 16;
    const ROOM_D = 16;
    const HALF_D = ROOM_D / 2;

    // ─── FENÊTRE : VUE TEMPS RÉEL SUR L'EXTÉRIEUR (immeuble.js) ──
    // Réglages : étage d'où l'on regarde (0 = rez-de-chaussée) et colonne de façade
    const WINDOW_FLOOR = 6;
    const WINDOW_COL_X = 0;
    const FACADE_Z = -24.2;   // z des vitres sur la façade (immeuble.js)
    const FACADE_FLOOR_H = 3.15;

    const windowView = (function() {
        // Scène extérieure séparée, rendue chaque frame dans une texture
        const outScene = new THREE.Scene();
        outScene.fog = new THREE.FogExp2(0xb4b8b9, 0.00045);
        outScene.add(new THREE.AmbientLight(0xc2c5c5, 0.55));
        outScene.add(new THREE.HemisphereLight(0xd2d8dc, 0x777575, 0.68));
        const outSun = new THREE.DirectionalLight(0xd5d4cf, 0.38);
        outSun.position.set(-80, 35, -100);
        outScene.add(outSun);

        const outside = buildOutside(outScene);

        // On regarde depuis l'intérieur de la façade : on retire l'immeuble lui-même
        // (inutile et coûteux) ainsi que tout ce qui est derrière lui.
        let biggest = null, biggestN = 0;
        outScene.children.forEach(function(ch) {
            if (ch.isGroup && ch.children.length > biggestN) {
                biggest = ch;
                biggestN = ch.children.length;
            }
        });
        const toRemove = [];
        if (biggest) toRemove.push(biggest);
        outScene.children.forEach(function(ch) {
            if (ch.isGroup && ch !== biggest) {
                const bb = new THREE.Box3().setFromObject(ch);
                if (bb.max.z < FACADE_Z - 0.3) toRemove.push(ch);
            }
        });
        toRemove.forEach(function(o) { outScene.remove(o); });

        // Cible de rendu (fond transparent : le ciel de world_base reste visible)
        const drawSize = new THREE.Vector2();
        renderer.getDrawingBufferSize(drawSize);
        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            generateMipmaps: false
        };
        let rt;
        try {
            rt = THREE.WebGLMultisampleRenderTarget
                ? new THREE.WebGLMultisampleRenderTarget(drawSize.x, drawSize.y, rtOpts)
                : new THREE.WebGLRenderTarget(drawSize.x, drawSize.y, rtOpts);
        } catch (e) {
            rt = new THREE.WebGLRenderTarget(drawSize.x, drawSize.y, rtOpts);
        }
        rt.texture.encoding = THREE.sRGBEncoding;

        const uniforms = {
            tMap: { value: rt.texture },
            uRes: { value: new THREE.Vector2(drawSize.x, drawSize.y) }
        };
        const paneMat = new THREE.ShaderMaterial({
            uniforms: uniforms,
            transparent: true,
            depthWrite: false,
            side: THREE.FrontSide,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform sampler2D tMap; uniform vec2 uRes; void main(){ gl_FragColor = texture2D(tMap, gl_FragCoord.xy / uRes); }'
        });

        const outCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
        const offset = new THREE.Vector3();
        const frustum = new THREE.Frustum();
        const projMat = new THREE.Matrix4();
        const sphere = new THREE.Sphere();
        const prevColor = new THREE.Color();
        let pane = null;

        function makePane(w, h, x, y, z) {
            pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paneMat);
            pane.rotation.y = Math.PI;          // visible depuis l'intérieur de la chambre
            pane.position.set(x, y, z);
            pane.renderOrder = 1;
            scene.add(pane);
            // correspondance chambre -> extérieur : le centre de la vitre = une fenêtre de la façade
            offset.set(
                WINDOW_COL_X - x,
                (WINDOW_FLOOR * FACADE_FLOOR_H + 1.75) - y,
                FACADE_Z - z
            );
            sphere.set(pane.position.clone(), Math.max(w, h));
            return pane;
        }

        function update(dt, time) {
            if (outside && outside.update) outside.update(dt, time);
            if (!pane) return;
            if (camera.position.z >= pane.position.z) return;   // on est dehors : rien à montrer

            camera.updateMatrixWorld();
            projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projMat);
            if (!frustum.intersectsSphere(sphere)) return;      // fenêtre hors du champ de vision

            renderer.getDrawingBufferSize(drawSize);
            if (drawSize.x !== uniforms.uRes.value.x || drawSize.y !== uniforms.uRes.value.y) {
                rt.setSize(drawSize.x, drawSize.y);
                uniforms.uRes.value.copy(drawSize);
            }

            // Même caméra que le joueur, décalée en hauteur / vers la façade
            outCam.fov = camera.fov;
            outCam.aspect = camera.aspect;
            outCam.near = camera.near;
            outCam.far = camera.far;
            outCam.updateProjectionMatrix();
            outCam.position.copy(camera.position).add(offset);
            outCam.quaternion.copy(camera.quaternion);
            outCam.updateMatrixWorld(true);

            const prevRT = renderer.getRenderTarget();
            renderer.getClearColor(prevColor);
            const prevAlpha = renderer.getClearAlpha();

            renderer.setRenderTarget(rt);
            renderer.setClearColor(0x000000, 0);
            renderer.clear();
            renderer.render(outScene, outCam);

            renderer.setRenderTarget(prevRT);
            renderer.setClearColor(prevColor, prevAlpha);
        }

        return { makePane: makePane, update: update };
    })();

    // ─── SOL ──────────────────────────────────────────────────────
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_W, HALF_D),
        mFloor
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, HALF_D / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // ─── COULOIR (corridor.js) : derrière le mur d'entrée, visible en temps réel ──
    const corridor = buildCorridor(scene, { wallH: WALL_H, nearZ: 0 });

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
        const mBoth = [mWall, mWall, mWall, mWall, mWall, corridor.wallMaterial];
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
    function createBed() {
        const group = new THREE.Group();
        const E = 1.1, W = 0;

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
                ctx.fillStyle = colors[i % colors.length];
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
        const blanketColors = ['#e8a0b0', '#d08090', '#f0c0c8', '#c06070'];
        const blanketTex = createPatternTexture(blanketColors, 10, '#f5e0e0');

        const frameMat = new THREE.MeshLambertMaterial({ color: 0xd4b090 });
        const legMat = new THREE.MeshLambertMaterial({ color: 0xb09070 });
        const halfW = 0.6 + W/2;
        const legs = [
            [-halfW, -0.8], [halfW, -0.8],
            [-halfW, 0.8 + E], [halfW, 0.8 + E]
        ];
        legs.forEach(([x, z]) => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 6), legMat);
            leg.position.set(x, 0.2, z);
            leg.castShadow = true;
            group.add(leg);
        });

        const longSide = new THREE.Mesh(new THREE.BoxGeometry(1.2 + W, 0.08, 0.08), frameMat);
        longSide.position.set(0, 0.4, -0.8); group.add(longSide);
        const longSide2 = new THREE.Mesh(new THREE.BoxGeometry(1.2 + W, 0.08, 0.08), frameMat);
        longSide2.position.set(0, 0.4, 0.8 + E); group.add(longSide2);
        const shortSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6 + E), frameMat);
        shortSide.position.set(-halfW, 0.4, E/2); group.add(shortSide);
        const shortSide2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6 + E), frameMat);
        shortSide2.position.set(halfW, 0.4, E/2); group.add(shortSide2);

        const headMat = new THREE.MeshLambertMaterial({ color: 0xe0c0b0 });
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.2 + W, 0.6, 0.08), headMat);
        head.position.set(0, 0.9, -0.85); group.add(head);
        const paddingMat = new THREE.MeshLambertMaterial({ color: 0xf0d8c8 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1 + W, 0.5, 0.06), paddingMat);
        pad.position.set(0, 0.9, -0.89); group.add(pad);

        const btnMat = new THREE.MeshLambertMaterial({ color: 0xc09080 });
        const btnSpacingX = (0.4 + W/2) / 2;
        for (let i = -btnSpacingX; i <= btnSpacingX + 0.01; i += btnSpacingX) {
            for (let j = -0.15; j <= 0.15; j += 0.15) {
                const btn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), btnMat);
                btn.position.set(i, 0.9 + j, -0.88);
                group.add(btn);
            }
        }

        const mattressMat = new THREE.MeshLambertMaterial({ color: 0xf8f0e8 });
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.2 + W, 0.2, 1.6 + E), mattressMat);
        mattress.position.set(0, 0.5, E/2);
        mattress.castShadow = true; mattress.receiveShadow = true;
        group.add(mattress);

        const pillowMat = new THREE.MeshLambertMaterial({ color: 0xf0e8e0 });
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6 + W*0.5, 0.12, 0.4), pillowMat);
        pillow.position.set(0, 0.7, -0.2);
        pillow.castShadow = true; pillow.receiveShadow = true;
        group.add(pillow);
        const pillowTop = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), pillowMat);
        pillowTop.scale.set(0.9 + W*0.4, 0.3, 0.7);
        pillowTop.position.set(0, 0.76, -0.2);
        pillowTop.castShadow = true;
        group.add(pillowTop);

        const blanketMat = new THREE.MeshLambertMaterial({ map: blanketTex, color: 0xf0e0e0 });
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.1 + W, 0.04, 1.1 + E), blanketMat);
        blanket.position.set(0, 0.62, 0.25 + E/2);
        blanket.castShadow = true; blanket.receiveShadow = true;
        group.add(blanket);
        const foldMat = new THREE.MeshLambertMaterial({ map: blanketTex, color: 0xe8c8c8 });
        const fold = new THREE.Mesh(new THREE.BoxGeometry(1.1 + W, 0.04, 0.15), foldMat);
        fold.position.set(0, 0.63, 0.7 + E);
        group.add(fold);
        const edgeMat = new THREE.MeshLambertMaterial({ color: 0xd08090 });
        const edge = new THREE.Mesh(new THREE.BoxGeometry(1.1 + W, 0.02, 0.04), edgeMat);
        edge.position.set(0, 0.64, 0.7 + E);
        group.add(edge);

        group.position.set(-7, 0, 0.8);
        group.rotation.y = Math.PI / 2;
        scene.add(group);
        window._bedPosition = group.position.clone();
    }
    createBed();



    // ─── TÉLÉVISION ──────────────────────────────────────────────
    function getVideoPath() {
        return DEFAULT_VIDEOS[0];
    }

    function createIconTexture(symbol) {
        const canvas2 = document.createElement('canvas');
        canvas2.width = 64;
        canvas2.height = 64;
        const ctx = canvas2.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, 32, 34);
        return new THREE.CanvasTexture(canvas2);
    }

    // Vidéos de la télé, dans l'ordre (dossier /videos à côté de world_base.html)
    const DEFAULT_VIDEOS = [
        "videos/video1.mp4",
        "videos/video2.mp4"
    ];
    let videoIndex = 0;

    // Renvoie la vidéo suivante de la liste (video1, video2, video1, ...)
    function getNextVideoPath() {
        const path = DEFAULT_VIDEOS[videoIndex % DEFAULT_VIDEOS.length];
        videoIndex++;
        return Promise.resolve(path);
    }

    function createVintageTV() {
        const group = new THREE.Group();
        const shelfMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.0), shelfMat);
        shelf.position.set(0, 0.30, 0);
        shelf.castShadow = true;
        shelf.receiveShadow = true;
        group.add(shelf);

        const legMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const legPositions = [
            [-0.75, 0.15, -0.40],
            [0.75, 0.15, -0.40],
            [-0.75, 0.15, 0.40],
            [0.75, 0.15, 0.40]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.30, 6), legMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            leg.castShadow = true;
            group.add(leg);
        });

        const driveGroup = new THREE.Group();
        const driveMat = new THREE.MeshLambertMaterial({ color: 0xd4c8b0 });
        const driveBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.35), driveMat);
        driveBody.position.set(0, 0.40, 0);
        driveBody.castShadow = true;
        driveBody.receiveShadow = true;
        driveGroup.add(driveBody);
        const slotMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.02, 0.02), slotMat);
        slot.position.set(0, 0.40, 0.18);
        driveGroup.add(slot);
        const ejectMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
        const ejectBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), ejectMat);
        ejectBtn.rotation.x = Math.PI / 2;
        ejectBtn.position.set(0.12, 0.40, 0.16);
        driveGroup.add(ejectBtn);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const led = new THREE.Mesh(new THREE.CircleGeometry(0.015, 8), ledMat);
        led.position.set(-0.10, 0.40, 0.18);
        driveGroup.add(led);
        const stripeMat = new THREE.MeshLambertMaterial({ color: 0x887868 });
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.01), stripeMat);
        stripe.position.set(0, 0.40, 0.175);
        driveGroup.add(stripe);
        driveGroup.position.set(0, 0.0, 0);
        group.add(driveGroup);

        const standMat = new THREE.MeshLambertMaterial({ color: 0x1a1008 });
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.10, 0.6), standMat);
        stand.position.set(0, 0.44, 0);
        stand.castShadow = true;
        stand.receiveShadow = true;
        group.add(stand);

        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.7), bodyMat);
        body.position.set(0, 0.90, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const screenWidth = 1.05,
            screenHeight = 0.68;
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), blackMat);
        screen.position.set(0, 0.90, 0.39);
        group.add(screen);

        const video = document.createElement('video');
        video.loop = false;
        video.muted = false;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        video.preload = "auto";

        let history = [];
        let historyIndex = -1;

        function loadVideoAndAddToHistory(videoPath) {
            const fullPath = videoPath;

            if (historyIndex < history.length - 1) {
                history = history.slice(0, historyIndex + 1);
            }
            history.push(fullPath);
            historyIndex = history.length - 1;

            video.src = fullPath;
            video.load();
            if (window._isOn) {
                video.play().catch(() => {});
            }
            saveTVState();
        }

        function loadRandomVideo() {
            getNextVideoPath()
                .then(videoPath => {
                    loadVideoAndAddToHistory(videoPath);
                })
                .catch(err => {
                    console.error('❌ Erreur fatale, fallback ultime', err);
                    loadVideoAndAddToHistory(DEFAULT_VIDEOS[0]);
                });
        }

        function nextVideo() {
            getNextVideoPath()
                .then(videoPath => {
                    const fullPath = videoPath;
                    if (historyIndex < history.length - 1) {
                        history = history.slice(0, historyIndex + 1);
                    }
                    history.push(fullPath);
                    historyIndex = history.length - 1;
                    video.src = fullPath;
                    video.load();
                    if (window._isOn) {
                        video.play().catch(() => {});
                    }
                    saveTVState();
                });
        }

        function prevVideo() {
            if (historyIndex <= 0) {
                loadRandomVideo();
                return;
            }
            historyIndex--;
            const fullPath = history[historyIndex];
            video.src = fullPath;
            video.load();
            if (window._isOn) {
                video.play().catch(() => {});
            }
            saveTVState();
        }

        loadRandomVideo();

        video.addEventListener('ended', function() {
            loadRandomVideo();
        });

        let storedState = null;
        try {
            const raw = sessionStorage.getItem('tvState');
            if (raw) storedState = JSON.parse(raw);
        } catch (e) {}
        let isOn = true;
        let previousVolume = storedState ? storedState.volume : 0.6;
        let videoMaterial = null;
        let videoStarted = false;

        function saveTVState() {
            try {
                sessionStorage.setItem('tvState', JSON.stringify({
                    isOn: isOn,
                    volume: video.volume || 0.6
                }));
            } catch (e) {}
        }

        function startVideo() {
            if (!videoStarted) {
                video.play().then(() => {
                    videoStarted = true;
                    if (!isOn) { video.pause();
                        video.volume = 0; }
                    saveTVState();
                }).catch(() => {
                    document.addEventListener('click', startVideo, { once: true });
                });
            }
        }
        document.addEventListener('click', startVideo, { once: true });

        video.addEventListener('canplaythrough', function() {
            if (!videoStarted) startVideo();
            const videoTexture = new THREE.VideoTexture(video);
            videoTexture.minFilter = THREE.LinearFilter;
            videoTexture.magFilter = THREE.LinearFilter;
            window._videoTexture = videoTexture;
            videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
            if (isOn) {
                screen.material = videoMaterial;
            } else {
                screen.material = blackMat;
                video.pause();
                video.volume = 0;
            }
            screen.material.needsUpdate = true;
            saveTVState();
        });

        video.addEventListener('error', function(e) {
            console.error('❌ Erreur vidéo :', video.src, e);
        });

        const frameMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.04), frameMat);
        frame.position.set(0, 0.90, 0.35);
        group.add(frame);

        const knobMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.4 });
        const knobConfigs = [
            { x: -0.4, symbol: '⏻', action: 'power' },
            { x: 0, symbol: '+', action: 'next' },
            { x: 0.4, symbol: '−', action: 'prev' }
        ];
        const knobMeshes = [];
        knobConfigs.forEach((cfg) => {
            const mat = knobMat.clone();
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.10, 8), mat);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(cfg.x, 0.47, 0.42);
            knob.castShadow = true;
            group.add(knob);
            knobMeshes.push(knob);
            knob.userData.action = cfg.action;
            const iconTex = createIconTexture(cfg.symbol);
            const iconMat = new THREE.MeshBasicMaterial({
                map: iconTex,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false
            });
            const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.10), iconMat);
            icon.position.set(cfg.x, 0.47, 0.48);
            group.add(icon);
        });
        const antMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const start1 = new THREE.Vector3(-0.30, 1.35, 0.1);
        const end1 = new THREE.Vector3(-0.40, 2.05, 0.15);
        const mid1 = new THREE.Vector3().addVectors(start1, end1).multiplyScalar(0.5);
        const dir1 = new THREE.Vector3().subVectors(end1, start1);
        const len1 = dir1.length();
        dir1.normalize();
        const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len1, 4), antMat);
        ant1.position.copy(mid1);
        ant1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir1);
        group.add(ant1);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const ball1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), ballMat);
        ball1.position.copy(end1);
        group.add(ball1);
        const start2 = new THREE.Vector3(0.30, 1.35, 0.1);
        const end2 = new THREE.Vector3(0.40, 2.05, 0.15);
        const mid2 = new THREE.Vector3().addVectors(start2, end2).multiplyScalar(0.5);
        const dir2 = new THREE.Vector3().subVectors(end2, start2);
        const len2 = dir2.length();
        dir2.normalize();
        const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len2, 4), antMat);
        ant2.position.copy(mid2);
        ant2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
        group.add(ant2);
        const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), ballMat);
        ball2.position.copy(end2);
        group.add(ball2);

        group.position.set(-7, 0.0, 7.2);
        group.rotation.y = +Math.PI / 1.2;
        scene.add(group);

        window._knobMeshes = knobMeshes;
        window._screen = screen;
        window._video = video;
        window._blackMat = blackMat;
        window._videoMaterial = videoMaterial;
        window._isOn = isOn;
        window._tvPosition = group.position.clone();

        function highlightKnob(knob) {
            if (knob) {
                knob.material.color.setHex(0xcccccc);
                knob.material.emissive = new THREE.Color(0xffffaa);
                knob.material.emissiveIntensity = 0.2;
            }
        }

        function unhighlightKnob(knob) {
            if (knob) {
                knob.material.color.setHex(0x888888);
                knob.material.emissive = new THREE.Color(0x000000);
                knob.material.emissiveIntensity = 0;
            }
        }

        function animateKnobPress(knob, callback) {
            const originalY = knob.position.y;
            const targetY = originalY - 0.02;
            const duration = 150;
            const startTime = performance.now();

            function press(time) {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentY = originalY + (targetY - originalY) * eased;
                knob.position.y = currentY;
                if (progress < 1) {
                    requestAnimationFrame(press);
                } else {
                    const upStart = performance.now();
                    function up(time2) {
                        const elapsed2 = time2 - upStart;
                        const progress2 = Math.min(elapsed2 / duration, 1);
                        const eased2 = 1 - Math.pow(1 - progress2, 3);
                        const currentY2 = targetY + (originalY - targetY) * eased2;
                        knob.position.y = currentY2;
                        if (progress2 < 1) {
                            requestAnimationFrame(up);
                        } else {
                            knob.position.y = originalY;
                            if (callback) callback();
                        }
                    }
                    requestAnimationFrame(up);
                }
            }
            requestAnimationFrame(press);
        }

        window._highlightKnob = highlightKnob;
        window._unhighlightKnob = unhighlightKnob;
        window._animateKnobPress = animateKnobPress;
        window._nextVideo = nextVideo;
        window._prevVideo = prevVideo;

        console.log('📺 Télévision ajoutée.');
    }

    createVintageTV();




    // ─── INTERACTIONS ──────────────────────────────────────────────
    function setupTVInteractions() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hoveredKnob = null;

        canvas.addEventListener('mousemove', function(event) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const knobMeshes = window._knobMeshes || [];
            const intersects = raycaster.intersectObjects(knobMeshes, false);
            let newHover = null;
            if (intersects.length > 0) {
                newHover = intersects[0].object;
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }

            if (newHover !== hoveredKnob) {
                if (hoveredKnob) {
                    window._unhighlightKnob(hoveredKnob);
                }
                hoveredKnob = newHover;
                if (hoveredKnob) {
                    window._highlightKnob(hoveredKnob);
                }
            }
        });

        canvas.addEventListener('click', function(event) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const knobMeshes = window._knobMeshes || [];
            const intersects = raycaster.intersectObjects(knobMeshes, false);
            if (intersects.length > 0) {
                const obj = intersects[0].object;
                const action = obj.userData.action;
                if (action) {
                    window._animateKnobPress(obj, function() {
                        handleKnobAction(action);
                    });
                }
            }
        });

        function handleKnobAction(action) {
            const video = window._video;
            const screen = window._screen;
            const blackMat = window._blackMat;
            const videoMaterial = window._videoMaterial;
            let isOn = window._isOn;

            switch (action) {
                case 'power':
                    if (isOn) {
                        window._previousVolume = video.volume || 0.6;
                        video.pause();
                        video.volume = 0;
                        screen.material = blackMat;
                        window._isOn = false;
                    } else {
                        video.play().catch(() => {});
                        video.volume = window._previousVolume > 0 ? window._previousVolume : 0.6;
                        if (videoMaterial) {
                            screen.material = videoMaterial;
                        } else {
                            const fallbackTex = new THREE.VideoTexture(video);
                            fallbackTex.minFilter = THREE.LinearFilter;
                            fallbackTex.magFilter = THREE.LinearFilter;
                            screen.material = new THREE.MeshBasicMaterial({ map: fallbackTex, side: THREE.DoubleSide });
                        }
                        window._isOn = true;
                    }
                    break;
                case 'next':
                    window._nextVideo();
                    break;
                case 'prev':
                    window._prevVideo();
                    break;
            }
            try {
                sessionStorage.setItem('tvState', JSON.stringify({
                    isOn: window._isOn,
                    volume: video.volume || 0.6
                }));
            } catch (e) {}
        }
    }
    setupTVInteractions();



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

    // ─── MONOLOGUES CONTEXTUELS ──────────────────────────────────────
    let monologueData = null;
    let lastMonologueTime = 0;
    const monologueCooldown = 5000;
    let currentMonologueZone = null;

    function loadMonologueData() {
        const url = 'monologues.json';
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(data => {
                monologueData = data;
                console.log('📜 Monologues chargés :', Object.keys(monologueData).length, 'zones');
            })
            .catch(err => {
                console.warn('⚠️ Échec du chargement des monologues, utilisation de données par défaut.', err);
                monologueData = {
                    "bed": [
                        "Ce lit semble confortable...",
                        "Un endroit pour se reposer.",
                        "Les rêves m'attendent ici."
                    ],
                    "bookshelf": [
                        "Des livres anciens...",
                        "La connaissance est dans ces pages.",
                        "Je me sens attiré par cette étagère."
                    ],
                    "tv": [
                        "Un vieux téléviseur...",
                        "Les images dansent sur l'écran.",
                        "Que de souvenirs."
                    ],
                    "greenboard": [
                        "Un tableau vert avec une enquête...",
                        "Des indices sont écrits ici.",
                        "Je devrais regarder de plus près."
                    ],
                    "carton": [
                        "Un carton avec une note.",
                        "Que cache ce carton ?",
                        "Il y a quelque chose d'écrit."
                    ]
                };
                console.log('📜 Utilisation des monologues par défaut.');
            });
    }
    loadMonologueData();

    const zones = [
        { id: 'bed', position: window._bedPosition || new THREE.Vector3(-7, 0, 0.8), radius: 2.5 },
        { id: 'tv', position: window._tvPosition || new THREE.Vector3(-7, 0, 7.2), radius: 2.5 },
    ];

    function showContextualMonologue(zoneId) {
        if (!monologueData) return;
        const texts = monologueData[zoneId];
        if (!texts || texts.length === 0) return;
        const now = performance.now();
        if (now - lastMonologueTime < monologueCooldown) return;
        lastMonologueTime = now;

        const index = Math.floor(Math.random() * texts.length);
        const text = texts[index];

        const container = document.createElement('div');
        container.id = 'contextMonologue';
        container.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            max-width: 80%;
            background: rgba(0, 0, 0, 0.75);
            color: #f0e8d0;
            padding: 14px 28px;
            border-radius: 12px;
            font-family: 'Georgia', serif;
            font-size: 18px;
            line-height: 1.6;
            text-align: center;
            backdrop-filter: blur(6px);
            border: 1px solid #6a5a3a;
            box-shadow: 0 4px 30px rgba(0,0,0,0.5);
            z-index: 999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.6s ease;
        `;
        container.textContent = text;
        document.body.appendChild(container);

        requestAnimationFrame(() => {
            container.style.opacity = '1';
        });

        setTimeout(() => {
            container.style.opacity = '0';
            setTimeout(() => {
                if (container.parentNode) container.remove();
            }, 600);
        }, 4000);
    }

    function updateMonologue(cameraPos) {
        if (!monologueData) return;
        let zoneFound = null;
        for (let zone of zones) {
            const dx = cameraPos.x - zone.position.x;
            const dz = cameraPos.z - zone.position.z;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist < zone.radius) {
                zoneFound = zone.id;
                break;
            }
        }
        if (zoneFound && zoneFound !== currentMonologueZone) {
            currentMonologueZone = zoneFound;
            showContextualMonologue(zoneFound);
        } else if (!zoneFound) {
            currentMonologueZone = null;
        }
    }

    // ─── RETOUR ──────────────────────────────────────────────────
    return {
        update(dt, time) {
            updateMonologue(camera.position);
            windowView.update(dt, time);
            corridor.update(dt, time);
        }
    };
}