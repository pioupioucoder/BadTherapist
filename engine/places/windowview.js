import * as THREE from 'three';
import { buildWorld as buildOutside } from './outside.js';

// ==========================================
// BAD THERAPIST — VUE TEMPS RÉEL PAR UNE FENÊTRE (places/windowview.js)
// ==========================================
// Affiche l'extérieur (la rue complète, outside.js) à travers une vitre, comme si la pièce était dans
// un étage élevé de l'immeuble. Servait uniquement à la chambre, mais n'importe quel lieu avec une fenêtre peut s'en servir.
//   const windowView = createWindowView({ scene, renderer, camera, snow });
//   windowView.makePane(largeur, hauteur, x, y, z);   // place la vitre
//   windowView.update(dt, time);                      // à appeler à chaque frame

    // Réglages : étage d'où l'on regarde (0 = rez-de-chaussée) et colonne de façade
    const WINDOW_FLOOR = 6;
    const WINDOW_COL_X = 0;
    const FACADE_Z = -24.2;   // z des vitres sur la façade (immeuble.js)
    const FACADE_FLOOR_H = 3.15;

export function createWindowView(o) {
    const scene = o.scene;
    const renderer = o.renderer;
    const camera = o.camera;
    const snow = o.snow;

    return (function() {
        // Scène extérieure séparée, rendue chaque frame dans une texture
        const outScene = new THREE.Scene();
        // Même nuit que la rue réelle (valeurs de world_base.html) : sinon la fenêtre montre un dehors plus clair que la réalité
        const NIGHT = window.BT_NIGHT || { dim: 1, light: 1, fog: 0.0075 };
        outScene.fog = new THREE.FogExp2(0x000000, NIGHT.fog);
        outScene.fog.color.setRGB(0.145 * NIGHT.dim, 0.157 * NIGHT.dim, 0.160 * NIGHT.dim);
        outScene.add(new THREE.AmbientLight(0x8d9aa6, 0.055 * NIGHT.light));
        outScene.add(new THREE.HemisphereLight(0x7f909d, 0x23201e, 0.085 * NIGHT.light));
        const outSun = new THREE.DirectionalLight(0x8fa0ad, 0.035 * NIGHT.light);
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
        if (outside && outside.main) biggest = outside.main;   // le corps de l'immeuble, de façon sûre
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
            // La neige tombe aussi dans la vue de la fenêtre (dessinée autour de la caméra extérieure)
            if (snow) {
                snow.withView(outScene, outCam.position, 0, function() { renderer.render(outScene, outCam); });
            } else {
                renderer.render(outScene, outCam);
            }

            renderer.setRenderTarget(prevRT);
            renderer.setClearColor(prevColor, prevAlpha);
        }

        return { makePane: makePane, update: update };
    })();
}
