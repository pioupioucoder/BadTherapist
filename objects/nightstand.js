// nightstand.js – table de chevet près du lit, avec un tiroir et un livre dedans.
// Clic sur le tiroir = il s'ouvre / se ferme. Quand il est ouvert, le livre brille doucement ;
// on le survole = il brille plus fort ; clic = il s'ouvre en grand et on écrit dedans (journal.js).

import * as THREE from 'three';
import { createJournal } from './journal.js';

export function buildNightstand(scene, opts) {
    opts = opts || {};
    const camera = opts.camera;
    const canvas = opts.canvas;
    const physics = opts.physics;
    const level = opts.level;

    // Emplacement (monde) : contre le mur de gauche, côté libre du lit (le lit occupe z 0.2 → 1.4)
    const CX = opts.x !== undefined ? opts.x : -7.72;
    const CZ = opts.z !== undefined ? opts.z : 1.75;

    // Dimensions (repère local : la façade du tiroir regarde +z, le meuble est ensuite tourné vers +x)
    const W = 0.50, D = 0.46;
    const SLIDE = 0.36;          // course du tiroir

    const ns = new THREE.Group();
    ns.position.set(CX, 0, CZ);
    ns.rotation.y = Math.PI / 2;
    scene.add(ns);

    // ─── TEXTURES ────────────────────────────────────────────────
    function tex(w, h, draw) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding;
        return t;
    }

    const woodTex = tex(128, 128, function(x, w, h) {
        x.fillStyle = '#7a5434';
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < h; i += 2) {
            x.fillStyle = 'hsla(26,' + (30 + Math.random() * 15) + '%,' + (20 + Math.random() * 14) + '%,0.55)';
            x.fillRect(0, i, w, 1 + Math.random() * 2);
        }
    });
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;

    const coverTex = tex(256, 384, function(x, w, h) {
        const g = x.createRadialGradient(90, 80, 10, 128, 192, 260);
        g.addColorStop(0, '#7c2431');
        g.addColorStop(0.6, '#521320');
        g.addColorStop(1, '#2e0a12');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < 1400; i++) {
            x.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.07) + ')';
            x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }
        x.strokeStyle = 'rgba(214,174,92,0.85)';
        x.lineWidth = 3;
        x.strokeRect(20, 24, 216, 336);
        x.lineWidth = 1.2;
        x.strokeRect(28, 32, 200, 320);
        x.lineWidth = 2.5;
        x.beginPath();
        x.moveTo(128, 152); x.lineTo(164, 192); x.lineTo(128, 232); x.lineTo(92, 192);
        x.closePath();
        x.stroke();
    });

    const edgeTex = tex(8, 64, function(x, w, h) {
        x.fillStyle = '#e8dcbc';
        x.fillRect(0, 0, w, h);
        x.fillStyle = 'rgba(120,95,60,0.35)';
        for (let i = 0; i < h; i += 3) x.fillRect(0, i, w, 1);
    });

    const haloTex = tex(128, 128, function(x, w, h) {
        const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
        g.addColorStop(0, 'rgba(255,214,140,1)');
        g.addColorStop(0.35, 'rgba(255,190,100,0.45)');
        g.addColorStop(1, 'rgba(255,170,80,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
    });

    // ─── MATÉRIAUX ───────────────────────────────────────────────
    function wood(color) { return new THREE.MeshLambertMaterial({ map: woodTex, color: color }); }
    const mBody = wood(0x9a7650);
    const mDark = wood(0x5a4028);
    const mTop = wood(0x8a6444);
    const mFrontDoor = wood(0xa88258);
    const mInset = wood(0x7d5a3a);
    const mFront = wood(0xa88258);                // façade du tiroir (matériau à part : elle s'éclaire au survol)
    mFront.emissive = new THREE.Color(0xffd9a0);
    mFront.emissiveIntensity = 0;
    const mBrass = new THREE.MeshLambertMaterial({ color: 0xd2a95e, emissive: 0x2a1c08 });

    const mLeather = new THREE.MeshLambertMaterial({ color: 0x4a111c });
    const mCoverTop = new THREE.MeshLambertMaterial({ map: coverTex });
    const mPages = new THREE.MeshLambertMaterial({ map: edgeTex });
    const mRibbon = new THREE.MeshLambertMaterial({ color: 0xa31d2b });
    const bookMats = [mLeather, mCoverTop, mPages, mRibbon];
    bookMats.forEach(function(m) {
        m.emissive = new THREE.Color(0xffc470);
        m.emissiveIntensity = 0;
    });

    function bx(w, h, d, mat, x, y, z, parent) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        (parent || ns).add(m);
        return m;
    }

    // ─── MEUBLE ──────────────────────────────────────────────────
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(s) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.08, 6), mDark);
        foot.position.set(s[0] * (W / 2 - 0.05), 0.04, s[1] * (D / 2 - 0.05));
        ns.add(foot);
    });
    bx(W - 0.02, 0.02, D - 0.02, mDark, 0, 0.09, 0);                     // fond
    bx(0.02, 0.50, D, mBody, -(W / 2 - 0.01), 0.33, 0);                  // côtés
    bx(0.02, 0.50, D, mBody, (W / 2 - 0.01), 0.33, 0);
    bx(W - 0.04, 0.48, 0.012, mDark, 0, 0.34, -D / 2 + 0.006);           // dos
    bx(W - 0.04, 0.02, D - 0.02, mBody, 0, 0.35, -0.01);                 // tablette sur laquelle glisse le tiroir
    bx(W - 0.04, 0.03, 0.02, mBody, 0, 0.355, D / 2 - 0.01);             // traverse entre la porte et le tiroir
    bx(W - 0.04, 0.24, 0.02, mFrontDoor, 0, 0.22, D / 2 - 0.01);         // porte du bas (décor)
    bx(W - 0.12, 0.16, 0.006, mInset, 0, 0.22, D / 2 + 0.003);
    const doorKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mBrass);
    doorKnob.position.set(W / 2 - 0.07, 0.30, D / 2 + 0.018);
    ns.add(doorKnob);
    bx(W + 0.03, 0.03, D + 0.02, mTop, 0, 0.585, 0);                     // plateau

    // ─── TIROIR ──────────────────────────────────────────────────
    const drawer = new THREE.Group();
    ns.add(drawer);

    const front = bx(W - 0.045, 0.19, 0.02, mFront, 0, 0.47, D / 2 - 0.01, drawer);
    front.userData.kind = 'drawer';
    const frontInset = bx(W - 0.11, 0.11, 0.006, mFront, 0, 0.47, D / 2 + 0.003, drawer);
    frontInset.userData.kind = 'drawer';
    const knobBase = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), mBrass);
    knobBase.rotation.x = Math.PI / 2;
    knobBase.position.set(0, 0.47, D / 2 + 0.018);
    knobBase.userData.kind = 'drawer';
    drawer.add(knobBase);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), mBrass);
    knob.position.set(0, 0.47, D / 2 + 0.036);
    knob.userData.kind = 'drawer';
    drawer.add(knob);

    // Caisse du tiroir : fond + trois parois (intérieur libre : 0.39 de large, 0.39 de profondeur)
    bx(W - 0.08, 0.01, 0.40, mDark, 0, 0.365, 0.01, drawer);
    bx(0.012, 0.10, 0.40, mDark, -(W / 2 - 0.046), 0.42, 0.01, drawer);
    bx(0.012, 0.10, 0.40, mDark, (W / 2 - 0.046), 0.42, 0.01, drawer);
    bx(W - 0.08, 0.10, 0.012, mDark, 0, 0.42, -0.184, drawer);

    // ─── LIVRE (posé à plat dans le tiroir) ──────────────────────
    const book = new THREE.Group();
    book.position.set(0.0, 0.39, -0.035);
    book.rotation.y = 0.07;
    book.userData.kind = 'book';
    drawer.add(book);

    bx(0.17, 0.006, 0.25, mLeather, 0, -0.017, 0, book);                                    // plat du dessous
    bx(0.172, 0.006, 0.252, [mLeather, mLeather, mCoverTop, mLeather, mLeather, mLeather], 0, 0.017, 0, book);   // couverture
    bx(0.010, 0.040, 0.252, mLeather, -0.080, 0, 0, book);                                  // dos
    bx(0.155, 0.028, 0.238, mPages, 0.0025, 0, 0, book);                                    // tranche des pages
    bx(0.008, 0.002, 0.04, mRibbon, 0.03, -0.012, 0.139, book);                             // marque-page qui dépasse

    // Zone de clic un peu plus grande que le livre (plus facile à viser, surtout au doigt)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.10, 0.29), new THREE.MeshBasicMaterial());
    hit.position.y = 0.03;
    hit.visible = false;
    hit.userData.kind = 'book';
    book.add(hit);

    // Halo doux au-dessus du livre + petite lueur chaude dans le tiroir
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(0.55, 0.55, 1);
    halo.position.set(0, 0.06, 0);
    halo.raycast = function() {};          // le halo ne doit jamais intercepter les clics
    book.add(halo);

    const glowLight = new THREE.PointLight(0xffd9a8, 0, 1.8, 2);
    glowLight.position.set(0.02, 0.62, 0.0);
    drawer.add(glowLight);

    // ─── COLLISIONS ──────────────────────────────────────────────
    if (physics && physics.add) {
        physics.add({ x0: CX - D / 2 - 0.02, x1: CX + D / 2 + 0.02, z0: CZ - W / 2 - 0.02, z1: CZ + W / 2 + 0.02, level: level });
        // tiroir ouvert : il sort dans la pièce
        physics.add({ x0: CX + D / 2, x1: CX + D / 2 + SLIDE + 0.02, z0: CZ - W / 2, z1: CZ + W / 2, level: level,
            active: function() { return openT > 0.15; } });
    }

    // ─── LIVRE-JOURNAL (interface d'écriture) ────────────────────
    const journal = createJournal({});

    window.BadTherapist = window.BadTherapist || {};
    window.BadTherapist.getJournal = function() { return journal.exportData(); };
    window.BadTherapist.setJournal = function(d) { journal.importData(d); };

    // ─── ÉTAT + ANIMATION ────────────────────────────────────────
    let openT = 0;              // 0 = fermé, 1 = ouvert (avancement de l'animation)
    let openTarget = 0;
    let hover = null;           // 'drawer' | 'book' | null
    let glow = 0, frontGlow = 0;
    let clock = 0;

    function setGlow(g) {
        bookMats.forEach(function(m) { m.emissiveIntensity = g * 0.9; });
        halo.material.opacity = Math.min(1, g * 0.9);
    }

    function update(dt) {
        dt = Math.min(dt || 0, 0.1);
        clock += dt;

        const diff = openTarget - openT;
        if (diff !== 0) openT += Math.sign(diff) * Math.min(Math.abs(diff), dt / 0.6);
        drawer.position.z = openT * openT * (3 - 2 * openT) * SLIDE;

        const ready = openT > 0.85;
        let gTarget = 0;
        if (ready && !journal.isOpen()) gTarget = (hover === 'book') ? 0.75 : 0.16 + 0.1 * Math.sin(clock * 2.2);
        glow += (gTarget - glow) * Math.min(1, dt * 8);
        setGlow(Math.max(0, glow));

        const fTarget = (hover === 'drawer') ? 0.3 : 0;
        frontGlow += (fTarget - frontGlow) * Math.min(1, dt * 10);
        mFront.emissiveIntensity = frontGlow;

        const lTarget = (openT > 0.3 && !journal.isOpen()) ? 0.5 : 0;
        glowLight.intensity += (lTarget - glowLight.intensity) * Math.min(1, dt * 4);
    }

    // ─── INTERACTIONS (souris et doigt) ──────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    // Seulement depuis la chambre, à portée de main
    function reachable() {
        const q = camera.position;
        if (q.x > 100 || Math.abs(q.y - 1.7) > 1.2 || q.z < 0.3) return false;
        return Math.hypot(q.x - CX, q.z - CZ) < 3.4;
    }

    function pick(ev) {
        if (journal.isOpen() || !reachable()) return null;
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        raycaster.far = 4;
        // On vise tout le meuble : ce qui est devant (paroi, plateau) cache bien ce qui est derrière
        const hits = raycaster.intersectObject(ns, true);
        if (!hits.length) return null;
        let o = hits[0].object;
        while (o && !o.userData.kind) o = o.parent;
        if (!o) return null;
        if (o.userData.kind === 'book' && openT <= 0.85) return null;   // livre pas encore sorti
        return o.userData.kind;
    }

    canvas.addEventListener('mousemove', function(ev) {
        hover = pick(ev);
        if (hover) canvas.style.cursor = 'pointer';
    });
    canvas.addEventListener('mouseleave', function() { hover = null; });

    // On ignore le clic qui termine un glissé (regard autour de soi)
    let downX = 0, downY = 0;
    canvas.addEventListener('pointerdown', function(ev) { downX = ev.clientX; downY = ev.clientY; });

    canvas.addEventListener('click', function(ev) {
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
        const kind = pick(ev);
        if (kind === 'drawer') {
            openTarget = openTarget ? 0 : 1;
        } else if (kind === 'book') {
            hover = null;
            journal.open();
        }
    });

    return {
        update: update,
        group: ns,
        journal: journal,
        isDrawerOpen: function() { return openTarget === 1; },
        // utile pour tester : quel objet est visé à cet endroit de l'écran
        pick: pick
    };
}
