import * as THREE from 'three';

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  READ THIS FIRST — LANGUAGE RULE — NEVER FORGET                      ║
// ║                                                                      ║
// ║  EVERY TEXT THE PLAYER CAN SEE MUST BE IN ENGLISH.                   ║
// ║  Screen text, buttons, labels, error messages, terminal output,      ║
// ║  posters, HUD... NO FRENCH inside the game, ever.                    ║
// ║  (The user talks to the AI in French, but her GAME is in English.)   ║
// ║                                                                      ║
// ║  Also keep on-screen text SHORT. No hints, no tutorials, no help     ║
// ║  panels she did not ask for. The only HUD element is "Stand up".     ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// objects/computer.js — desk + PC + chair for the bedroom.
//
// Click the chair (it has a glowing ring + arrow) or the desk to sit down.
// The monitor shows a normal desktop: icons (YouTube, Terminal), taskbar, clock, recent activity.
//  - Terminal only appears when you open the Terminal app.
//  - YouTube app: sign-in screen, then home / videos / shorts / playlist / channels + a built-in player.
//
// Usage in bedroom.js (unchanged):
//   const computer = buildComputer(scene, { camera, canvas, physics, level, seatX, seatZ, wallX, canUse });
//   computer.update(dt, time);   computer.isUsing();
//
// YouTube: the app shows the latest videos + shorts of 2 channels and a playlist (YouTube Data API v3).
//   Pass  youtubeProxy  in the options: URL of the Cloudflare Worker (worker.js) that holds the API key.
//   Channels / playlist: YT_CHANNELS / YT_PLAYLIST below (or options youtubeChannels / youtubePlaylist).
//   The feed refreshes by itself while the game is open: new video -> badge on the YouTube icon + small bubble.
// Activity: the desktop remembers what the player did (door, lights, bed, TV, books, PC) and shows it,
//   even when nobody sits at the computer. Everything is stored under STATE_KEY (see save-data.js, KEYS.computer).
//   Optional options: isSleeping(), isDark()  -> let the PC notice sleeping / lights.

// ─── SETTINGS ────────────────────────────────────────────────
const SEAT_X = 6.56;
const SEAT_Z = 6.39;
const WALL_X = 8;
const DESK_W = 1.6, DESK_D = 0.76;
const SCR_W = 0.60, SCR_H = 0.3375;            // 16:9 flat monitor
const W = 1280, H = 720;                        // screen canvas
const ACCOUNT_KEY = 'ordi_youtube_v2';          // old key, only read once to migrate the account
const STATE_KEY = 'bt_computer_state';          // account, channels, last video, activity (registered in save-data.js)
const YT_CHANNELS_DEFAULT = ['@call-me-zephyr', '@soukokudarling'];
const YT_PLAYLIST_DEFAULT = 'PLL8LEFp1JNvg';    // must be a PUBLIC playlist (full id, starts with PL)
const YT_REFRESH_MS = 3 * 60 * 1000;            // feed refresh while the game is open
const YT_PER_CHANNEL = 50;                      // latest uploads fetched per channel at each refresh (older ones: Load more)
const SHOW_FIRST = 2, SHOW_STEP = 4;             // a list shows 2 items; "Show more" adds 4, "Show less" goes back to 2
const SHORT_MAX_SEC = 180;                      // <= 3 min counts as a short (approximate)
const TERM_GREEN = '#33ff66';
const WIN_USER = 'Evelyn';
const UI = '"Segoe UI", Roboto, Arial, sans-serif';
const MONO = 'Consolas, "Lucida Console", "Courier New", monospace';

function srgb(t) {
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
}
function canvasTex(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    srgb(t);
    return t;
}

export function buildComputer(scene, o) {
    o = o || {};
    const camera = o.camera;
    const canvas = o.canvas;
    const seatX = o.seatX != null ? o.seatX : SEAT_X;
    const seatZ = o.seatZ != null ? o.seatZ : SEAT_Z;
    const wallX = o.wallX != null ? o.wallX : WALL_X;
    const eyeH = o.eyeHeight || 1.7;
    const YT_PROXY = (o.youtubeProxy || '').replace(/\/+$/, '');   // URL of the Cloudflare Worker (it holds the API key)
    const YT_CHANNELS = o.youtubeChannels || YT_CHANNELS_DEFAULT;
    const YT_PLAYLIST = o.youtubePlaylist != null ? o.youtubePlaylist : YT_PLAYLIST_DEFAULT;
    const deskCx = wallX - DESK_D / 2 - 0.01;
    const seatOff = deskCx - seatX;

    // ═════════ 3D MATERIALS ═════════
    const mat = function(c) { return new THREE.MeshLambertMaterial({ color: c }); };
    const basic = function(c) { return new THREE.MeshBasicMaterial({ color: c }); };
    const woodTex = canvasTex(256, 256, function(g, w, h) {
        g.fillStyle = '#6b4630'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < h; i += 2) {
            g.fillStyle = 'hsl(24,' + (30 + Math.random() * 12) + '%,' + (26 + Math.random() * 10) + '%)';
            g.fillRect(0, i, w, 1 + Math.random() * 2);
        }
    });
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.repeat.set(2, 1);
    const mWalnut = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xc09a78 });
    const mNavy = mat(0x14214a), mNavyL = mat(0x24397a), mBrass = mat(0xc9a24a);
    const mBlack = mat(0x111318), mMetal = mat(0x2b2f3b), mCeramic = mat(0xdfe8f5);
    const mGlowBlue = basic(0x66ccff), mGlowWarm = basic(0xffd9a0);

    function mesh(parent, geo, m, x, y, z) {
        const r = new THREE.Mesh(geo, m);
        r.position.set(x, y, z);
        r.castShadow = true; r.receiveShadow = true;
        parent.add(r);
        return r;
    }
    function bx(parent, w, h, d, m, x, y, z) { return mesh(parent, new THREE.BoxGeometry(w, h, d), m, x, y, z); }
    function cyl(parent, rt, rb, h, m, x, y, z, seg) { return mesh(parent, new THREE.CylinderGeometry(rt, rb, h, seg || 16), m, x, y, z); }

    // Local frame: +z = toward the room (player), -z = the wall, +x = world +z
    const group = new THREE.Group();
    group.position.set(deskCx, 0, seatZ);
    group.rotation.y = -Math.PI / 2;
    scene.add(group);

    // ═════════ DESK ═════════
    bx(group, DESK_W, 0.04, DESK_D, mWalnut, 0, 0.72, 0);
    bx(group, 0.04, 0.70, DESK_D - 0.06, mNavy, 0.76, 0.35, 0);                  // right panel
    bx(group, 0.50, 0.68, DESK_D - 0.06, mNavy, -0.52, 0.34, 0);                 // left drawers
    for (let i = 0; i < 3; i++) {
        const y = 0.12 + i * 0.23;
        bx(group, 0.46, 0.20, 0.015, mNavyL, -0.52, y, 0.357);
        bx(group, 0.12, 0.014, 0.02, mBrass, -0.52, y + 0.05, 0.372);
    }
    bx(group, DESK_W - 0.1, 0.34, 0.02, mNavy, 0, 0.52, -0.33);                  // back panel

    // PC tower under the desk
    bx(group, 0.21, 0.44, 0.46, mBlack, 0.40, 0.22, -0.06);
    bx(group, 0.010, 0.28, 0.004, mGlowBlue, 0.47, 0.25, 0.172);
    cyl(group, 0.014, 0.014, 0.006, mMetal, 0.40, 0.38, 0.172, 12).rotation.x = Math.PI / 2;

    // Desk mat, keyboard, mouse
    bx(group, 0.84, 0.004, 0.32, mat(0x0c1638), 0.04, 0.742, 0.21);
    const kbTex = canvasTex(512, 170, function(g, w, h) {
        g.fillStyle = '#0d1019'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2f78c4'; g.lineWidth = 1.5; g.fillStyle = '#1b2133';
        for (let r = 0; r < 4; r++) for (let k = 0; k < 14; k++) {
            g.fillRect(8 + k * 35.5, 8 + r * 31, 31, 27); g.strokeRect(8 + k * 35.5, 8 + r * 31, 31, 27);
        }
        g.fillRect(110, 132, 250, 27); g.strokeRect(110, 132, 250, 27);
    });
    const kb = mesh(group, new THREE.BoxGeometry(0.44, 0.018, 0.14),
        [mBlack, mBlack, new THREE.MeshBasicMaterial({ map: kbTex, color: 0xb8c8ff }), mBlack, mBlack, mBlack], -0.02, 0.753, 0.22);
    kb.rotation.x = 0.03;
    bx(group, 0.06, 0.024, 0.10, mBlack, 0.36, 0.756, 0.21);
    bx(group, 0.004, 0.002, 0.03, mGlowBlue, 0.36, 0.769, 0.19);

    // Monitor (flat, 16:9)
    const mon = new THREE.Group();
    mon.position.set(0, 1.03, -0.12);
    group.add(mon);
    cyl(group, 0.12, 0.12, 0.012, mMetal, 0, 0.746, -0.12, 24).scale.set(1, 1, 0.65);
    bx(group, 0.045, 0.14, 0.02, mMetal, 0, 0.82, -0.15);
    bx(mon, SCR_W + 0.03, SCR_H + 0.03, 0.02, mBlack, 0, 0, 0);
    bx(mon, 0.30, 0.20, 0.03, mMetal, 0, 0, -0.02);
    bx(mon, 0.012, 0.004, 0.002, mGlowBlue, 0.22, -SCR_H / 2 - 0.0075, 0.0105);

    // Screen
    const scr = document.createElement('canvas');
    scr.width = W; scr.height = H;
    const ctx = scr.getContext('2d');
    const tex = new THREE.CanvasTexture(scr);
    srgb(tex);
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screenMesh.position.set(0, 0, 0.0105);
    mon.add(screenMesh);

    // Desk lamp (warm light)
    cyl(group, 0.07, 0.08, 0.02, mMetal, -0.70, 0.75, -0.26, 20);
    const p1 = new THREE.Group(); p1.position.set(-0.70, 0.76, -0.26); p1.rotation.z = -0.25; group.add(p1);
    cyl(p1, 0.008, 0.008, 0.30, mMetal, 0, 0.15, 0, 8);
    const p2 = new THREE.Group(); p2.position.set(0, 0.30, 0); p2.rotation.z = -1.05; p1.add(p2);
    cyl(p2, 0.008, 0.008, 0.28, mMetal, 0, 0.14, 0, 8);
    const head = new THREE.Group(); head.position.set(0, 0.28, 0); head.rotation.z = 1.30; p2.add(head);
    const shade = mesh(head, new THREE.CylinderGeometry(0.02, 0.075, 0.10, 20, 1, true), new THREE.MeshLambertMaterial({ color: 0x24397a, side: THREE.DoubleSide }), 0, 0, 0);
    shade.castShadow = false;
    mesh(head, new THREE.SphereGeometry(0.022, 10, 8), mGlowWarm, 0, -0.035, 0);
    const lampLight = new THREE.PointLight(0xffc98a, 0.9, 3.5, 2);
    lampLight.position.set(0, -0.09, 0);
    head.add(lampLight);

    // Books, mug, plant
    const bk = function(w, h, d, c, x, y, z, ry) { const b = bx(group, w, h, d, mat(c), x, y, z); b.rotation.y = ry; };
    bk(0.20, 0.032, 0.14, 0x7a2b3a, -0.66, 0.756, 0.06, 0.05);
    bk(0.18, 0.026, 0.13, 0x2f5d8a, -0.655, 0.785, 0.06, 0.2);
    bk(0.17, 0.022, 0.12, 0xd9c9a0, -0.66, 0.809, 0.062, -0.1);
    cyl(group, 0.04, 0.035, 0.09, mCeramic, 0.64, 0.785, 0.12, 16);
    cyl(group, 0.034, 0.034, 0.002, mat(0x3a2616), 0.64, 0.829, 0.12, 16);
    const handle = mesh(group, new THREE.TorusGeometry(0.03, 0.007, 8, 12), mCeramic, 0.685, 0.785, 0.12);
    handle.rotation.y = Math.PI / 2;
    cyl(group, 0.06, 0.045, 0.09, mat(0xa4603c), 0.70, 0.785, -0.24, 14);
    for (let i = 0; i < 8; i++) {
        const pv = new THREE.Group();
        pv.position.set(0.70, 0.83, -0.24);
        pv.rotation.y = (i / 8) * Math.PI * 2;
        pv.rotation.z = 0;
        group.add(pv);
        const lean = new THREE.Group(); lean.rotation.z = -(0.35 + (i % 3) * 0.22); pv.add(lean);
        const lg = new THREE.SphereGeometry(0.05, 8, 6); lg.scale(0.45, 1.7, 0.22);
        mesh(lean, lg, mat(i % 2 ? 0x2f7a46 : 0x3c9456), 0, 0.075, 0);
    }

    // Wall decoration: posters, sticky notes, fairy lights
    function poster(w, h, x, y, rz, painter) {
        const t = canvasTex(256, Math.round(256 * h / w), painter);
        const fr = bx(group, w + 0.04, h + 0.04, 0.015, mNavy, x, y, -0.382);
        fr.rotation.z = rz;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: 0xa8a8a8 }));
        p.position.set(x, y, -0.3735); p.rotation.z = rz;
        group.add(p);
    }
    poster(0.46, 0.62, 0, 1.76, 0, function(g, w, h) {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a1440'); gr.addColorStop(1, '#2d5fb8');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#e6efff'; g.beginPath(); g.arc(w * 0.5, h * 0.36, w * 0.2, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 40; i++) { g.globalAlpha = 0.4 + Math.random() * 0.6; g.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5); }
        g.globalAlpha = 1; g.fillStyle = '#08102e'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.78); g.lineTo(w * 0.3, h * 0.62);
        g.lineTo(w * 0.55, h * 0.8); g.lineTo(w * 0.8, h * 0.66); g.lineTo(w, h * 0.82); g.lineTo(w, h); g.fill();
    });
    poster(0.30, 0.40, -0.56, 1.64, 0.04, function(g, w, h) {
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a1f6e'); gr.addColorStop(1, '#d36aa0');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffe7c2'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.22, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(20,10,60,.55)'; g.lineWidth = 3;
        for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, h * (0.7 + i * 0.06)); g.quadraticCurveTo(w * 0.5, h * (0.62 + i * 0.06), w, h * (0.7 + i * 0.06)); g.stroke(); }
    });
    poster(0.30, 0.40, 0.56, 1.80, -0.03, function(g, w, h) {
        g.fillStyle = '#071029'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#3aa8ff'; g.lineWidth = 2;
        for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
        g.fillStyle = '#9fdcff'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.12, 0, Math.PI * 2); g.fill();
    });
    [[-0.52, 1.22, 0xf6e27a, 0.08], [-0.44, 1.14, 0xf0a3c4, -0.06], [-0.50, 1.07, 0x8fd0f0, 0.04]].forEach(function(n) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshLambertMaterial({ color: n[2] }));
        p.position.set(n[0], n[1], -0.378); p.rotation.z = n[3]; group.add(p);
    });
    (function() {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const x = -0.85 + (i / 40) * 1.7; pts.push(new THREE.Vector3(x, 2.30 - 0.16 * (1 - Math.pow(x / 0.85, 2)), -0.378)); }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1f2e })));
        for (let i = 0; i <= 16; i++) {
            const x = -0.85 + (i / 16) * 1.7;
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), i % 2 ? mGlowBlue : mGlowWarm);
            b.position.set(x, 2.285 - 0.16 * (1 - Math.pow(x / 0.85, 2)), -0.375);
            group.add(b);
        }
    })();

    // Round rug under the chair
    const rugTex = canvasTex(256, 256, function(g, w) {
        g.fillStyle = '#14214a'; g.fillRect(0, 0, w, w);
        g.strokeStyle = '#3d63b8'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#243d86'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 84, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#1b2d66'; g.beginPath(); g.arc(128, 128, 40, 0, Math.PI * 2); g.fill();
    });
    mesh(group, new THREE.CylinderGeometry(0.78, 0.78, 0.01, 40), [mNavy, new THREE.MeshLambertMaterial({ map: rugTex }), mNavy], 0, 0.005, seatOff - 0.05);

    // Chair (office chair, night-blue)
    const chair = new THREE.Group();
    chair.position.set(0, 0, seatOff);
    chair.rotation.y = 0.22;
    group.add(chair);
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = bx(chair, 0.30, 0.025, 0.04, mBlack, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15);
        leg.rotation.y = -a;
        mesh(chair, new THREE.SphereGeometry(0.028, 8, 6), mMetal, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
    }
    cyl(chair, 0.032, 0.032, 0.34, mMetal, 0, 0.24, 0, 10);
    cyl(chair, 0.24, 0.24, 0.04, mBlack, 0, 0.44, 0, 20);
    cyl(chair, 0.255, 0.25, 0.09, mNavyL, 0, 0.505, 0, 24);
    const pipe = mesh(chair, new THREE.TorusGeometry(0.255, 0.011, 6, 28), mat(0x5b8ee0), 0, 0.55, 0);
    pipe.rotation.x = Math.PI / 2;
    const backGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.40, 24, 1, true, -0.38 * Math.PI, 0.76 * Math.PI);
    const back = mesh(chair, backGeo, new THREE.MeshLambertMaterial({ color: 0x24397a, side: THREE.DoubleSide }), 0, 0.82, 0);
    back.rotation.x = 0.10;
    bx(chair, 0.05, 0.34, 0.03, mBlack, 0, 0.70, 0.255);
    const headGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.13, 16, 1, true, -0.30 * Math.PI, 0.60 * Math.PI);
    mesh(chair, headGeo, new THREE.MeshLambertMaterial({ color: 0x3d63b8, side: THREE.DoubleSide }), 0, 1.16, 0.10);
    bx(chair, 0.03, 0.12, 0.03, mBlack, 0, 1.03, 0.27);
    [-1, 1].forEach(function(s) {
        bx(chair, 0.025, 0.20, 0.025, mBlack, s * 0.27, 0.62, 0.04);
        bx(chair, 0.06, 0.025, 0.26, mBlack, s * 0.27, 0.73, 0.02);
    });

    // Glowing "click me" marker above/around the chair
    const marker = new THREE.Group();
    marker.position.set(0, 0, seatOff);
    group.add(marker);
    const ringM = new THREE.MeshBasicMaterial({ color: 0x6cc3ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.41, 40), ringM);
    ring1.rotation.x = -Math.PI / 2; ring1.position.y = 0.02; marker.add(ring1);
    const pulseM = ringM.clone();
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.40, 40), pulseM);
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.021; marker.add(ring2);
    const arrowGeo = new THREE.OctahedronGeometry(0.07); arrowGeo.scale(1, 1.6, 1);
    const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    arrow.position.y = 1.45; marker.add(arrow);
    const clickZone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    clickZone.position.set(0, 0.65, seatOff);
    group.add(clickZone);

    // Screen glow
    const glow = new THREE.PointLight(0x7fb2ff, 0.45, 3.2, 2);
    glow.position.set(0, 1.05, 0.45);
    group.add(glow);
    group.updateMatrixWorld(true);

    if (o.physics) {
        o.physics.add({ x0: wallX - DESK_D - 0.02, x1: wallX, z0: seatZ - 0.82, z1: seatZ + 0.82, level: o.level });
    }

    // ═════════ SAVED STATE (account, channels, last video, activity) ═════════
    // One JSON blob under STATE_KEY. save-data.js (KEYS.computer) redirects it to the right profile
    // and saves / syncs it with the rest of the game.
    function loadState() {
        try { const raw = localStorage.getItem(STATE_KEY); if (raw) { const s = JSON.parse(raw); if (s && typeof s === 'object' && s.v) return s; } } catch (e) {}
        return { v: 1, account: null, channels: [], known: [], seen: [], lastVideo: null, activity: [] };
    }
    const st = loadState();
    ['channels', 'known', 'seen', 'activity'].forEach(function(k) { if (!Array.isArray(st[k])) st[k] = []; });
    function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {} }
    // Older saves kept the account under its own key: move it into the state
    if (!st.account) {
        try { const raw = localStorage.getItem(ACCOUNT_KEY); if (raw) { const a = JSON.parse(raw); if (a && a.name) { st.account = a; saveState(); } } } catch (e) {}
    }
    try { localStorage.removeItem(ACCOUNT_KEY); } catch (e) {}
    let seenSet = new Set(st.seen);

    const yt = {
        account: st.account && st.account.name ? st.account : null,
        page: 'home', menu: false, error: '', busy: false,
        videos: [], playlist: [], chNext: {}, plNext: undefined, moreBusy: false, shown: {}, loading: false, err: '', plErr: '', lastFetch: 0,
        scroll: 0, maxScroll: 0, filter: null, watch: null, fresh: {}, toast: null
    };
    function saveAccount() { st.account = yt.account; saveState(); }
    function trySignIn() {
        const email = T.email.trim();
        if (!email || !T.pass) { yt.error = 'Enter your email and password.'; return; }
        yt.account = { name: email.split('@')[0].slice(0, 24) || 'User', email: email, subs: [] };
        saveAccount();
        T.email = ''; T.pass = ''; yt.error = ''; yt.page = 'home';
        updateTarget();
    }
    function signOut() {
        stopVideo();
        yt.account = null; yt.menu = false; yt.page = 'home'; yt.error = '';
        saveAccount();
        T.email = ''; T.pass = '';
        updateTarget();
    }

    // ═════════ ACTIVITY MEMORY (shown on the desktop, even when nobody sits) ═════════
    function logAct(text, windowMs) {
        const now = Date.now(), last = st.activity[0];
        if (last && last.x === text && now - last.t < (windowMs || 30000)) return;
        st.activity.unshift({ t: now, x: String(text).slice(0, 80) });
        if (st.activity.length > 40) st.activity.length = 40;
        saveState(); dirty = true;
    }
    function ago(t) {
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 60) return 'Just now';
        const m = s / 60; if (m < 60) return Math.floor(m) + ' min ago';
        const h = m / 60; if (h < 24) return Math.floor(h) + ' h ago';
        const d = Math.floor(h / 24); return d === 1 ? 'Yesterday' : d + ' days ago';
    }
    // The room is watched from here: door, lights, bed, TV, books. No other file has to call us.
    let pw = null, pollT = 0;
    function bookLen(key) {
        try { const b = JSON.parse(localStorage.getItem(key) || 'null'); if (b && Array.isArray(b.pages)) return b.pages.join('').trim().length; } catch (e) {}
        return 0;
    }
    function pollWorld() {
        const cur = { door: !!window._doorOpen, sleep: !!(o.isSleeping && o.isSleeping()), dark: !!(o.isDark && o.isDark()), tv: false, disc: '', book: bookLen('bt_journal'), diary: bookLen('bt_evelyn_journal') };
        try {
            const tv = JSON.parse(localStorage.getItem('bt_tv_state') || 'null');
            if (tv && typeof tv === 'object') { cur.tv = !!tv.isOn; cur.disc = tv.disk != null ? JSON.stringify(tv.disk) : ''; }
        } catch (e) {}
        if (!pw) { pw = cur; return; }      // first look: just remember, log nothing
        if (cur.door !== pw.door) logAct(cur.door ? 'Opened the bedroom door' : 'Closed the bedroom door');
        if (cur.sleep !== pw.sleep) logAct(cur.sleep ? 'Went to sleep' : 'Woke up');
        if (cur.dark !== pw.dark) logAct(cur.dark ? 'Turned the lights off' : 'Turned the lights on');
        if (cur.tv !== pw.tv) logAct(cur.tv ? 'Turned the TV on' : 'Turned the TV off');
        else if (cur.tv && cur.disc !== pw.disc) logAct('Changed the TV disc');
        if (cur.book !== pw.book) logAct('Wrote in the drawer book', 600000);
        if (cur.diary !== pw.diary) logAct('Wrote in the journal', 600000);
        pw = cur;
    }

    // ═════════ YOUTUBE DATA (2 channels + 1 playlist, refreshed while the game is open) ═════════
    function api(path) {
        return fetch(YT_PROXY + '/' + path)
            .then(function(r) { return r.json().then(function(j) { if (!r.ok || j.error) throw new Error('api'); return j; }); });
    }
    function isoSec(d) {
        const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || '');
        return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
    }
    function fmtDur(s) {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + (x < 10 ? '0' : '') + x : m + ':' + (x < 10 ? '0' : '') + x;
    }
    function pickThumb(t) { t = t || {}; const b = t.medium || t.high || t.default || t.standard; return b ? b.url : ''; }
    function resolveChannel(handle) {
        const cached = st.channels.filter(function(c) { return c.handle === handle; })[0];
        if (cached) return Promise.resolve(cached);
        return api('channels?part=snippet,contentDetails&forHandle=' + encodeURIComponent(handle)).then(function(j) {
            const it = j.items && j.items[0];
            if (!it) throw new Error('nochannel');
            const ch = { handle: handle, id: it.id, title: it.snippet.title, uploads: it.contentDetails.relatedPlaylists.uploads };
            st.channels = st.channels.filter(function(c) { return c.handle !== handle; }).concat([ch]);
            saveState();
            return ch;
        });
    }
    function toVideo(it, ch) {
        const s = it.snippet || {}, cd = it.contentDetails || {};
        const id = cd.videoId || (s.resourceId && s.resourceId.videoId);
        if (!id || s.title === 'Private video' || s.title === 'Deleted video') return null;
        return { id: id, title: s.title || '', channel: ch ? ch.title : (s.videoOwnerChannelTitle || ''), chId: ch ? ch.id : (s.videoOwnerChannelId || ''),
                 at: Date.parse(cd.videoPublishedAt || s.publishedAt) || 0, thumb: pickThumb(s.thumbnails), dur: 0, short: false };
    }
    function addDurations(list) {
        const ids = []; list.forEach(function(v) { if (ids.indexOf(v.id) < 0) ids.push(v.id); });
        if (!ids.length) return Promise.resolve();
        const chunks = []; for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
        return Promise.all(chunks.map(function(ch) {
            return api('videos?part=contentDetails&maxResults=50&id=' + ch.join(',')).then(function(j) {
                const map = {}; (j.items || []).forEach(function(i) { map[i.id] = isoSec(i.contentDetails && i.contentDetails.duration); });
                list.forEach(function(v) { if (map[v.id] != null) { v.dur = map[v.id]; v.short = v.dur > 0 && v.dur <= SHORT_MAX_SEC; } });
            }).catch(function() {});
        }));      // no durations: everything shows as a normal video
    }
    function refreshFeed() {
        if (!YT_PROXY || yt.loading) return;
        yt.loading = true; yt.lastFetch = Date.now();
        const chans = Promise.all(YT_CHANNELS.map(function(h) {
            return resolveChannel(h).then(function(ch) {
                return api('channels?part=statistics&id=' + ch.id)
                    .then(function(j) { const it = j.items && j.items[0]; if (it && it.statistics) ch.count = +it.statistics.videoCount; }, function() {})
                    .then(function() { return api('playlistItems?part=snippet,contentDetails&maxResults=' + YT_PER_CHANNEL + '&playlistId=' + ch.uploads); })
                    .then(function(j) { return { ch: ch, items: j.items || [], next: j.nextPageToken || '' }; });
            }).catch(function() { return null; });
        }));
        const pl = YT_PLAYLIST ? api('playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + encodeURIComponent(YT_PLAYLIST))
            .then(function(j) { yt.plErr = ''; if (yt.plNext === undefined) yt.plNext = j.nextPageToken || ''; return (j.items || []).map(function(it) { return toVideo(it, null); }).filter(Boolean); })
            .catch(function() { yt.plErr = 'fetch'; return null; }) : Promise.resolve([]);
        Promise.all([chans, pl]).then(function(res) {
            const raw = []; let complete = true;
            res[0].forEach(function(r) { if (!r) { complete = false; return; } if (yt.chNext[r.ch.id] === undefined) yt.chNext[r.ch.id] = r.next; r.items.forEach(function(it) { const v = toVideo(it, r.ch); if (v) raw.push(v); }); });
            if (!raw.length && !complete) throw new Error('fetch');
            return addDurations(raw.concat(res[1] || [])).then(function() {
                const merge = function(old, fresh) {      // keep what "Load more" already brought in
                    const by = {}; old.forEach(function(v) { by[v.id] = v; }); fresh.forEach(function(v) { by[v.id] = v; });
                    return Object.keys(by).map(function(k) { return by[k]; });
                };
                yt.videos = merge(yt.videos, raw).sort(function(a, b) { return b.at - a.at; });
                if (res[1]) yt.playlist = merge(yt.playlist, res[1]).sort(function(a, b) { return b.at - a.at; });
                yt.err = '';
                onFeed(complete);
            });
        }).catch(function() { if (!yt.videos.length) yt.err = 'fetch'; })
          .then(function() { yt.loading = false; dirty = true; });
    }
    function moreAvailable(page) {
        if (page === 'playlist') return !!yt.plNext;
        return st.channels.some(function(c) { return yt.chNext[c.id] && (!yt.filter || yt.filter === c.id); });
    }
    function loadMore(page) {
        if (yt.moreBusy || !moreAvailable(page)) return;
        yt.moreBusy = true; dirty = true;
        const done = function() { yt.moreBusy = false; dirty = true; };
        if (page === 'playlist') {
            api('playlistItems?part=snippet,contentDetails&maxResults=50&pageToken=' + encodeURIComponent(yt.plNext) + '&playlistId=' + encodeURIComponent(YT_PLAYLIST)).then(function(j) {
                const add = (j.items || []).map(function(it) { return toVideo(it, null); }).filter(Boolean);
                yt.plNext = j.nextPageToken || '';
                return addDurations(add).then(function() {
                    yt.playlist = yt.playlist.concat(add.filter(function(v) { return !yt.playlist.some(function(x) { return x.id === v.id; }); })).sort(function(a, b) { return b.at - a.at; });
                });
            }).catch(function() {}).then(done);
            return;
        }
        const chs = st.channels.filter(function(c) { return yt.chNext[c.id] && (!yt.filter || yt.filter === c.id); });
        Promise.all(chs.map(function(ch) {
            return api('playlistItems?part=snippet,contentDetails&maxResults=50&pageToken=' + encodeURIComponent(yt.chNext[ch.id]) + '&playlistId=' + ch.uploads).then(function(j) {
                yt.chNext[ch.id] = j.nextPageToken || '';
                return (j.items || []).map(function(it) { return toVideo(it, ch); }).filter(Boolean);
            }).catch(function() { return []; });
        })).then(function(lists) {
            const add = [].concat.apply([], lists).filter(function(v) { return !yt.videos.some(function(x) { return x.id === v.id; }); });
            return addDurations(add).then(function() {
                const ids = add.map(function(v) { return v.id; });       // old videos are never "new"
                st.known = ids.concat(st.known).slice(-2000);
                st.seen = ids.concat(st.seen).slice(-2000); seenSet = new Set(st.seen);
                saveState();
                yt.videos = yt.videos.concat(add).sort(function(a, b) { return b.at - a.at; });
            });
        }).catch(function() {}).then(done);
    }
    function unseenCount() { let n = 0; yt.videos.forEach(function(v) { if (!seenSet.has(v.id)) n++; }); return n; }
    function isYtVisible() { return S.phase === 'using' && topApp() === 'youtube' && !!yt.account; }
    function markSeen() {
        const fresh = yt.videos.filter(function(v) { return !seenSet.has(v.id); });
        if (!fresh.length) return;
        fresh.forEach(function(v) { yt.fresh[v.id] = true; seenSet.add(v.id); });
        st.seen = Array.from(seenSet).slice(-2000); seenSet = new Set(st.seen);
        saveState(); dirty = true;
    }
    function onFeed(complete) {
        const known = new Set(st.known);
        if (!known.size) {                  // very first look: what exists now is not "new"
            if (!complete) return;
            st.known = yt.videos.map(function(v) { return v.id; });
            st.seen = st.known.slice(); seenSet = new Set(st.seen);
            saveState(); return;
        }
        const fresh = yt.videos.filter(function(v) { return !known.has(v.id); });
        if (fresh.length) {
            fresh.forEach(function(v) { st.known.push(v.id); logAct((v.short ? 'New short from ' : 'New video from ') + v.channel, 1000); });
            st.known = st.known.slice(-2000);
            saveState();
            if (!isYtVisible()) {
                const f = fresh[0];
                yt.toast = { at: Date.now(), head: fresh.length > 1 ? fresh.length + ' new videos' : (f.short ? 'New short' : 'New video'), sub: f.channel, title: f.title, v: f };
            }
        }
        if (isYtVisible()) markSeen();
    }
    function playVideo(v) {
        if (!yt.account || !v) return;
        yt.watch = v; yt.menu = false;
        st.lastVideo = { id: v.id, title: v.title, channel: v.channel, at: Date.now() };
        saveState();
        logAct('Watched: ' + v.title.slice(0, 44) + (v.title.length > 44 ? '…' : ''));
        dirty = true;
    }
    function stopVideo() {
        yt.watch = null;
        try { frame.dataset.vid = ''; frame.style.display = 'none'; frame.src = 'about:blank'; } catch (e) {}
        dirty = true;
    }

    // ═════════ OS STATE ═════════
    const apps = { youtube: { open: false, min: false }, terminal: { open: false, min: false } };
    const APP_NAMES = { youtube: 'YouTube', terminal: 'Terminal' };
    let order = [];
    let startOpen = false, startWas = false, menuWas = false;
    let selIcon = null; const lastIcon = { id: null, t: 0 };
    let mx = -1, my = -1, dirty = true, blink = 0, blinkOn = true, lastMin = -1;
    let hits = [];
    let target = null;
    const T = { term: '', email: '', pass: '' };
    const termLines = []; const termHist = []; let histIdx = -1;
    const noop = function() {};

    // Hidden input: real keyboard (and phone keyboard) text goes through it
    const kbIn = document.createElement('input');
    kbIn.type = 'text';
    kbIn.setAttribute('autocomplete', 'off'); kbIn.setAttribute('autocapitalize', 'off');
    kbIn.setAttribute('autocorrect', 'off'); kbIn.setAttribute('spellcheck', 'false');
    kbIn.setAttribute('aria-hidden', 'true');
    kbIn.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none;z-index:-1';
    document.body.appendChild(kbIn);
    kbIn.addEventListener('input', function() {
        if (!target) return;
        T[target] = kbIn.value.slice(0, 120);
        if (target === 'term') histIdx = -1;
        blinkOn = true; blink = 0; dirty = true;
    });
    function setTarget(t) {
        target = t;
        if (t) { kbIn.value = T[t]; try { kbIn.focus({ preventScroll: true }); } catch (e) { kbIn.focus(); } }
        else kbIn.blur();
        dirty = true;
    }
    function topApp() {
        for (let i = order.length - 1; i >= 0; i--) if (apps[order[i]].open && !apps[order[i]].min) return order[i];
        return null;
    }
    function updateTarget() {
        if (S.phase !== 'using') { if (target) setTarget(null); return; }
        const top = topApp();
        let want = null;
        if (top === 'terminal') want = 'term';
        else if (top === 'youtube' && !yt.account) want = (target === 'pass' ? 'pass' : 'email');
        if (want !== target) setTarget(want);
    }
    function openApp(id) {
        apps[id].open = true; apps[id].min = false;
        order = order.filter(function(x) { return x !== id; }); order.push(id);
        startOpen = false; dirty = true; updateTarget();
        logAct(id === 'youtube' ? 'Opened YouTube' : 'Opened the terminal', 300000);
        if (id === 'youtube' && YT_PROXY && Date.now() - yt.lastFetch > 45000) refreshFeed();
    }
    function closeApp(id) {
        apps[id].open = false; apps[id].min = false;
        order = order.filter(function(x) { return x !== id; });
        if (id === 'youtube') { yt.menu = false; stopVideo(); }
        dirty = true; updateTarget();
    }
    function minApp(id) { apps[id].min = true; dirty = true; updateTarget(); }
    function clickIcon(id, info) {
        selIcon = id;
        const now = performance.now();
        if (info.single || (lastIcon.id === id && now - lastIcon.t < 450)) { openApp(id); lastIcon.id = null; }
        else { lastIcon.id = id; lastIcon.t = now; }
    }

    // ═════════ DRAWING HELPERS ═════════
    function rr(x, y, w, h, r) {
        ctx.beginPath(); ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function txt(s, x, y, font, color, align, base) {
        ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'middle';
        ctx.fillText(s, x, y);
    }
    function fit(s, maxW, font) {
        ctx.font = font;
        if (ctx.measureText(s).width <= maxW) return s;
        while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
        return s + '…';
    }
    function hit(x, y, w, h, fn, keep) {
        hits.push({ x: x, y: y, w: w, h: h, fn: fn, keep: keep });
        return mx >= x && mx < x + w && my >= y && my < y + h;
    }
    function hueOf(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
    function ytLogo(x, y, w, h) {
        ctx.fillStyle = '#ff0033'; rr(x, y, w, h, h * 0.28); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.moveTo(x + w * 0.40, y + h * 0.30); ctx.lineTo(x + w * 0.40, y + h * 0.70); ctx.lineTo(x + w * 0.68, y + h * 0.50); ctx.closePath(); ctx.fill();
    }
    function appIcon(id, x, y, s) {
        if (id === 'youtube') { ytLogo(x, y + s * 0.15, s, s * 0.7); return; }
        ctx.fillStyle = '#000'; rr(x, y + s * 0.1, s, s * 0.8, s * 0.12); ctx.fill();
        ctx.strokeStyle = '#1f9a44'; ctx.lineWidth = 2; ctx.stroke();
        txt('>_', x + s / 2, y + s * 0.5, 'bold ' + Math.round(s * 0.36) + 'px ' + MONO, TERM_GREEN, 'center');
    }

    // Wallpaper (night blue), drawn once
    const wallC = document.createElement('canvas'); wallC.width = W; wallC.height = H;
    (function() {
        const g = wallC.getContext('2d');
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, '#050b22'); gr.addColorStop(0.55, '#0e2152'); gr.addColorStop(1, '#1d4fa0');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        const rg = g.createRadialGradient(W * 0.72, H * 0.4, 10, W * 0.72, H * 0.4, 380);
        rg.addColorStop(0, 'rgba(120,170,255,.35)'); rg.addColorStop(1, 'rgba(120,170,255,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
        let seed = 7; const rnd = function() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 110; i++) { g.fillStyle = 'rgba(210,225,255,' + (0.25 + rnd() * 0.6) + ')'; g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.8, 0.5 + rnd() * 1.4, 0, Math.PI * 2); g.fill(); }
        const mc = document.createElement('canvas'); mc.width = mc.height = 120;
        const m = mc.getContext('2d');
        m.fillStyle = '#e8f0ff'; m.beginPath(); m.arc(60, 60, 44, 0, Math.PI * 2); m.fill();
        m.globalCompositeOperation = 'destination-out'; m.beginPath(); m.arc(78, 48, 38, 0, Math.PI * 2); m.fill();
        g.drawImage(mc, W * 0.8, H * 0.1);
    })();

    function badge(cx, cy, n, r) {
        if (!n) return;
        ctx.fillStyle = '#ff2d2d'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        txt(n > 9 ? '9+' : String(n), cx, cy + 1, 'bold ' + Math.round(r * 1.05) + 'px ' + UI, '#fff', 'center');
    }
    function wrapLines(s, maxW, font, maxLines) {
        ctx.font = font;
        const all = []; let cur = '';
        String(s).split(/\s+/).forEach(function(w) {
            const t = cur ? cur + ' ' + w : w;
            if (!cur || ctx.measureText(t).width <= maxW) cur = t; else { all.push(cur); cur = w; }
        });
        if (cur) all.push(cur);
        const out = all.slice(0, maxLines);
        if (all.length > maxLines) out[maxLines - 1] = out[maxLines - 1] + ' ' + all.slice(maxLines).join(' ');
        return out.map(function(l) { return fit(l, maxW, font); });
    }
    function pill(s, x, y, bg, right) {
        const f = 'bold 11px ' + UI; ctx.font = f;
        const w = Math.ceil(ctx.measureText(s).width) + 12, px = right ? x - w : x;
        ctx.fillStyle = bg; rr(px, y, w, 20, 4); ctx.fill();
        txt(s, px + 6, y + 10, f, '#fff');
    }
    const thumbs = {};
    function thumbImg(url) {
        let t = thumbs[url];
        if (!t) {
            t = thumbs[url] = { img: new Image(), ok: false };
            t.img.crossOrigin = 'anonymous';
            t.img.onload = function() { t.ok = true; dirty = true; };
            t.img.src = url;
        }
        return t;
    }
    function drawThumb(v, x, y, w, h) {
        const t = v.thumb ? thumbImg(v.thumb) : null;
        ctx.save(); rr(x, y, w, h, 10); ctx.clip();
        if (t && t.ok) {
            const iw = t.img.naturalWidth, ih = t.img.naturalHeight, r = w / h;
            let sw = iw, sh = iw / r; if (sh > ih) { sh = ih; sw = ih * r; }
            ctx.drawImage(t.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
        } else {
            ctx.fillStyle = 'hsl(' + hueOf(v.channel || v.id) + ',40%,22%)'; ctx.fillRect(x, y, w, h);
            ytLogo(x + w / 2 - 22, y + h / 2 - 15, 44, 30);
        }
        ctx.restore();
    }

    // ═════════ SCREEN: DESKTOP EXTRAS ═════════
    function drawActivity() {
        const x = W - 340, y = 214, w = 316, rows = 6, h = 52 + rows * 36;
        ctx.fillStyle = 'rgba(8,14,36,.72)'; rr(x, y, w, h, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(90,140,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
        txt('Recent activity', x + 16, y + 26, 'bold 15px ' + UI, '#e6eeff');
        ctx.fillStyle = 'rgba(90,140,255,.3)'; ctx.fillRect(x + 16, y + 42, w - 32, 1);
        if (!st.activity.length) { txt('Nothing yet', x + 16, y + 76, '14px ' + UI, '#9fb4e6'); return; }
        st.activity.slice(0, rows).forEach(function(a, i) {
            const ry = y + 60 + i * 36;
            txt(fit(a.x, w - 32, '14px ' + UI), x + 16, ry, '14px ' + UI, '#fff');
            txt(ago(a.t), x + 16, ry + 15, '12px ' + UI, '#9fb4e6');
        });
    }
    function drawToast() {
        const t = yt.toast; if (!t) return;
        const w = 380, h = 76, x = W - w - 16, y = H - 48 - h - 12;
        const hv = hit(x, y, w, h, function() { yt.toast = null; openApp('youtube'); playVideo(t.v); });
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18;
        ctx.fillStyle = hv ? '#2c2c2c' : '#212121'; rr(x, y, w, h, 12); ctx.fill(); ctx.restore();
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; rr(x, y, w, h, 12); ctx.stroke();
        ytLogo(x + 14, y + 22, 44, 31);
        txt(t.head, x + 70, y + 20, 'bold 15px ' + UI, '#fff');
        txt(fit(t.sub, w - 90, '13px ' + UI), x + 70, y + 40, '13px ' + UI, '#9a9a9a');
        txt(fit(t.title, w - 90, '13px ' + UI), x + 70, y + 58, '13px ' + UI, '#e6e6e6');
    }

    // ═════════ APP: YOUTUBE (feed) ═════════
    const YT_TOP = 56, YT_SIDE = 180;
    function playerRect() { return { x: WX + YT_SIDE + 20, y: WY + 36 + YT_TOP + 52, w: 720, h: 405 }; }
    function listFor(page) {
        let l = page === 'playlist' ? yt.playlist : yt.videos;
        if (page === 'videos') l = l.filter(function(v) { return !v.short; });
        else if (page === 'shorts') l = l.filter(function(v) { return v.short; });
        if (yt.filter && page !== 'playlist') l = l.filter(function(v) { return v.chId === yt.filter; });
        return l;
    }
    function emptyMsg(page) {
        if (!YT_PROXY) return 'YouTube is not available right now.';
        if (page === 'playlist') return yt.plErr ? 'Playlist unavailable.' : (yt.loading ? 'Loading…' : 'This playlist is empty.');
        if (yt.err) return 'Could not load videos.';
        return yt.loading || !yt.lastFetch ? 'Loading…' : 'Nothing here yet.';
    }
    function drawGrid(list, ax, ay, aw, ah, msg, more, less) {
        if (!list.length) { txt(msg, ax + aw / 2, ay + ah / 2, '22px ' + UI, '#8a8a8a', 'center'); yt.maxScroll = 0; return; }
        const cols = 2, gap = 16, cw = Math.floor((aw - gap * (cols + 1)) / cols), th = Math.round(cw * 9 / 16), chh = th + 62;
        const rowsN = Math.ceil(list.length / cols), total = rowsN * (chh + gap) + gap + (more || less ? 64 : 0);
        yt.maxScroll = Math.max(0, total - ah);
        yt.scroll = Math.max(0, Math.min(yt.scroll, yt.maxScroll));
        ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
        list.forEach(function(v, i) {
            const cx = ax + gap + (i % cols) * (cw + gap), cy = ay + gap + Math.floor(i / cols) * (chh + gap) - yt.scroll;
            if (cy + chh < ay || cy > ay + ah) return;
            const hy = Math.max(cy, ay), hh = Math.min(cy + chh, ay + ah) - hy;
            const hv = hit(cx, hy, cw, hh, function() { playVideo(v); });
            drawThumb(v, cx, cy, cw, th);
            if (hv) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(cx, cy, cw, th, 10); ctx.stroke(); }
            if (v.short) pill('SHORT', cx + 8, cy + 8, '#e5192d');
            else if (v.dur) pill(fmtDur(v.dur), cx + cw - 8, cy + th - 28, 'rgba(0,0,0,.8)', true);
            if (yt.fresh[v.id]) pill('NEW', cx + cw - 8, cy + 8, '#2f7fe0', true);
            wrapLines(v.title, cw - 4, 'bold 14px ' + UI, 2).forEach(function(l, k) { txt(l, cx + 2, cy + th + 16 + k * 18, 'bold 14px ' + UI, '#fff'); });
            txt(fit(v.channel + (v.at ? '  ·  ' + ago(v.at) : ''), cw - 4, '13px ' + UI), cx + 2, cy + th + 52, '13px ' + UI, '#9a9a9a');
        });
        if (more || less) {
            const btns = [];
            if (less) btns.push(['Show less', less]);
            if (more) btns.push(['Show more', more]);
            const bw = 170, tw = btns.length * bw + (btns.length - 1) * 16, by = ay + gap + rowsN * (chh + gap) - yt.scroll;
            btns.forEach(function(b, i) {
                const bx = ax + (aw - tw) / 2 + i * (bw + 16);
                if (by + 40 <= ay || by >= ay + ah) return;
                const hy = Math.max(by, ay), hh = Math.min(by + 40, ay + ah) - hy;
                const hb = hit(bx, hy, bw, hh, b[1]);
                ctx.fillStyle = hb ? '#3a3a3a' : '#272727'; rr(bx, by, bw, 40, 20); ctx.fill();
                txt(yt.moreBusy && b[0] === 'Show more' ? 'Loading…' : b[0], bx + bw / 2, by + 20, '15px ' + UI, '#fff', 'center');
            });
        }
        ctx.restore();
        if (yt.maxScroll > 0) {
            [[-1, 96], [1, 48]].forEach(function(b) {
                const bx = ax + aw - 36, by = ay + ah - b[1] - 8;
                const h2 = hit(bx - 16, by - 16, 32, 32, function() { yt.scroll += b[0] * 200; });
                ctx.fillStyle = h2 ? 'rgba(80,80,80,.95)' : 'rgba(40,40,40,.9)'; ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.beginPath();
                if (b[0] < 0) { ctx.moveTo(bx - 7, by + 4); ctx.lineTo(bx + 7, by + 4); ctx.lineTo(bx, by - 5); }
                else { ctx.moveTo(bx - 7, by - 4); ctx.lineTo(bx + 7, by - 4); ctx.lineTo(bx, by + 5); }
                ctx.closePath(); ctx.fill();
            });
        }
    }
    function drawChannels(ax, ay, aw, ah) {
        if (!st.channels.length) { txt(emptyMsg('channels'), ax + aw / 2, ay + ah / 2, '22px ' + UI, '#8a8a8a', 'center'); return; }
        st.channels.forEach(function(ch, i) {
            const x = ax + 20, y = ay + 20 + i * 96, w = aw - 40;
            const hv = hit(x, y, w, 84, function() { yt.filter = ch.id; yt.page = 'home'; yt.scroll = 0; });
            ctx.fillStyle = hv ? '#272727' : '#1a1a1a'; rr(x, y, w, 84, 12); ctx.fill();
            ctx.fillStyle = 'hsl(' + hueOf(ch.title) + ',55%,42%)'; ctx.beginPath(); ctx.arc(x + 46, y + 42, 28, 0, Math.PI * 2); ctx.fill();
            txt(ch.title.charAt(0).toUpperCase(), x + 46, y + 43, 'bold 24px ' + UI, '#fff', 'center');
            txt(ch.title, x + 92, y + 30, 'bold 20px ' + UI, '#fff');
            txt(ch.handle + (ch.count != null ? '  ·  ' + ch.count + ' videos and shorts' : ''), x + 92, y + 58, '14px ' + UI, '#9a9a9a');
        });
    }
    function drawWatch(mx0, my0) {
        const pr = playerRect(), v = yt.watch;
        const hb = hit(mx0 + 20, my0 + 10, 90, 34, function() { stopVideo(); });
        ctx.fillStyle = hb ? '#3a3a3a' : '#272727'; rr(mx0 + 20, my0 + 10, 90, 34, 17); ctx.fill();
        txt('‹  Back', mx0 + 65, my0 + 28, '15px ' + UI, '#fff', 'center');
        ctx.fillStyle = '#000'; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
        txt('Loading…', pr.x + pr.w / 2, pr.y + pr.h / 2, '18px ' + UI, '#6a6a6a', 'center');
        txt(fit(v.title, pr.w, 'bold 19px ' + UI), pr.x, pr.y + pr.h + 22, 'bold 19px ' + UI, '#fff');
        txt(fit(v.channel + (v.at ? '  ·  ' + ago(v.at) : ''), pr.w, '14px ' + UI), pr.x, pr.y + pr.h + 50, '14px ' + UI, '#9a9a9a');
    }
    function sideIcon(i, x, y) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        if (i === 0) { ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + 10, y); ctx.lineTo(x + 20, y + 10); ctx.lineTo(x + 20, y + 20); ctx.lineTo(x, y + 20); ctx.closePath(); ctx.fill(); }
        else if (i === 1) { rr(x, y + 1, 20, 14, 3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 7, y + 5); ctx.lineTo(x + 7, y + 11); ctx.lineTo(x + 13, y + 8); ctx.closePath(); ctx.fill(); }
        else if (i === 2) { rr(x + 4, y - 2, 12, 22, 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 8, y + 5); ctx.lineTo(x + 8, y + 12); ctx.lineTo(x + 13, y + 8.5); ctx.closePath(); ctx.fill(); }
        else if (i === 3) { for (let k = 0; k < 3; k++) ctx.fillRect(x, y + 2 + k * 7, k === 2 ? 12 : 20, 2); ctx.beginPath(); ctx.moveTo(x + 15, y + 15); ctx.lineTo(x + 15, y + 21); ctx.lineTo(x + 21, y + 18); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x + 10, y + 6, 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 10, y + 22, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    }
    function drawYtHome(c) {
        const a = yt.account, top = YT_TOP, side = YT_SIDE;
        ctx.fillStyle = '#0f0f0f'; ctx.fillRect(c.x, c.y, c.w, top);
        ctx.fillStyle = '#272727'; ctx.fillRect(c.x, c.y + top - 1, c.w, 1);
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 3; i++) ctx.fillRect(c.x + 20, c.y + 20 + i * 7, 20, 2);
        ytLogo(c.x + 58, c.y + 14, 40, 28);
        txt('YouTube', c.x + 106, c.y + 28, 'bold 21px ' + UI, '#fff');
        const sx = c.x + (c.w - 500) / 2;
        ctx.fillStyle = '#121212'; rr(sx, c.y + 9, 500, 38, 19); ctx.fill();
        ctx.strokeStyle = '#303030'; ctx.lineWidth = 1; ctx.stroke();
        txt('Search', sx + 20, c.y + 28, '16px ' + UI, '#8a8a8a');
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx + 470, c.y + 27, 7, 0, Math.PI * 2); ctx.moveTo(sx + 475, c.y + 32); ctx.lineTo(sx + 481, c.y + 38); ctx.stroke();
        const ax = c.x + c.w - 40, ay = c.y + 28;
        const hv = hit(ax - 18, ay - 18, 36, 36, function() { yt.menu = !menuWas; }, 'menu');
        ctx.fillStyle = 'hsl(' + hueOf(a.name) + ',55%,45%)'; ctx.beginPath(); ctx.arc(ax, ay, 16, 0, Math.PI * 2); ctx.fill();
        if (hv) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        txt(a.name.charAt(0).toUpperCase(), ax, ay + 1, 'bold 16px ' + UI, '#fff', 'center');

        [['home', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['playlist', 'Playlist'], ['channels', 'Channels']].forEach(function(it, i) {
            const y = c.y + top + 8 + i * 48, on = yt.page === it[0] && !yt.watch;
            const h = hit(c.x + 8, y, side - 16, 42, function() { stopVideo(); yt.page = it[0]; yt.scroll = 0; if (it[0] !== 'home') yt.filter = null; });
            if (on || h) { ctx.fillStyle = on ? '#272727' : '#1a1a1a'; rr(c.x + 8, y, side - 16, 42, 8); ctx.fill(); }
            sideIcon(i, c.x + 24, y + 11);
            txt(it[1], c.x + 58, y + 21, '15px ' + UI, '#fff');
        });

        const mx0 = c.x + side, my0 = c.y + top, mw = c.w - side, mh = c.h - top;
        if (yt.watch) drawWatch(mx0, my0);
        else if (yt.page === 'channels') drawChannels(mx0, my0, mw, mh);
        else {
            let gy = my0, gh = mh;
            if (yt.filter && yt.page !== 'playlist') {
                const ch = st.channels.filter(function(x) { return x.id === yt.filter; })[0];
                const label = ch ? ch.title : 'Channel';
                ctx.font = '14px ' + UI;
                const cwid = Math.ceil(ctx.measureText(label).width) + 56;
                const hc = hit(mx0 + 16, my0 + 10, cwid, 32, function() { yt.filter = null; yt.scroll = 0; });
                ctx.fillStyle = hc ? '#3a3a3a' : '#272727'; rr(mx0 + 16, my0 + 10, cwid, 32, 16); ctx.fill();
                txt(label, mx0 + 32, my0 + 26, '14px ' + UI, '#fff');
                txt('✕', mx0 + cwid - 6, my0 + 26, '14px ' + UI, '#cfcfcf', 'right');
                gy += 48; gh -= 48;
            }
            const full = listFor(yt.page), key = yt.page + '|' + (yt.filter || ''), n = yt.shown[key] || SHOW_FIRST, pg = yt.page;
            drawGrid(full.slice(0, n), mx0, gy, mw, gh, emptyMsg(yt.page),
                (n < full.length || moreAvailable(pg)) ? function() { yt.shown[key] = n + SHOW_STEP; if (yt.shown[key] > full.length && moreAvailable(pg)) loadMore(pg); } : null,
                n > SHOW_FIRST ? function() { yt.shown[key] = SHOW_FIRST; yt.scroll = 0; } : null);
        }

        if (yt.menu) {
            const x = c.x + c.w - 262, y = c.y + 62, w = 246, h = 124;
            ctx.fillStyle = '#212121'; rr(x, y, w, h, 12); ctx.fill();
            ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.stroke();
            hit(x, y, w, h, noop, 'menu');
            txt(fit(a.name, w - 32, 'bold 16px ' + UI), x + 16, y + 28, 'bold 16px ' + UI, '#fff');
            if (a.email) txt(fit(a.email, w - 32, '13px ' + UI), x + 16, y + 50, '13px ' + UI, '#9a9a9a');
            ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x, y + 68, w, 1);
            const so = hit(x + 6, y + 74, w - 12, 42, signOut, 'menu');
            if (so) { ctx.fillStyle = '#323232'; rr(x + 6, y + 74, w - 12, 42, 8); ctx.fill(); }
            txt('Sign out', x + 20, y + 95, '15px ' + UI, '#fff');
        }
    }
    // The video itself is a real YouTube player laid over the window, kept aligned with the screen
    function syncFrame() {
        const want = !!(yt.watch && S.phase === 'using' && topApp() === 'youtube' && yt.account && !startOpen && !yt.menu);
        if (!want) { if (frame.style.display !== 'none') frame.style.display = 'none'; return; }
        if (frame.dataset.vid !== yt.watch.id) {
            frame.dataset.vid = yt.watch.id;
            frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(yt.watch.id) + '?autoplay=1&rel=0&playsinline=1';
        }
        const r = scr.getBoundingClientRect(), k = r.width / W, p = playerRect();
        frame.style.left = Math.round(r.left + p.x * k) + 'px';
        frame.style.top = Math.round(r.top + p.y * k) + 'px';
        frame.style.width = Math.round(p.w * k) + 'px';
        frame.style.height = Math.round(p.h * k) + 'px';
        frame.style.display = 'block';
    }

    // ═════════ SCREEN: DESKTOP ═════════
    function drawIcons() {
        ['youtube', 'terminal'].forEach(function(id, i) {
            const x = 20, y = 24 + i * 112;
            const hv = hit(x, y, 96, 100, function(info) { clickIcon(id, info); });
            if (selIcon === id || hv) { ctx.fillStyle = selIcon === id ? 'rgba(120,170,255,.30)' : 'rgba(255,255,255,.12)'; rr(x, y, 96, 100, 6); ctx.fill(); }
            appIcon(id, x + 20, y + 8, 56);
            if (id === 'youtube') badge(x + 74, y + 14, unseenCount(), 12);
            ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4;
            txt(APP_NAMES[id], x + 48, y + 82, '15px ' + UI, '#fff', 'center');
            ctx.restore();
        });
    }
    function drawTaskbar() {
        const y = H - 48;
        ctx.fillStyle = 'rgba(8,14,36,.95)'; ctx.fillRect(0, y, W, 48);
        ctx.fillStyle = '#22336e'; ctx.fillRect(0, y, W, 1);
        const hs = hit(0, y, 56, 48, function() { startOpen = !startWas; }, 'start');
        if (hs || startOpen) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, y, 56, 48); }
        ctx.fillStyle = '#5aa9ff';
        for (let i = 0; i < 4; i++) ctx.fillRect(17 + (i % 2) * 12, y + 13 + Math.floor(i / 2) * 12, 10, 10);
        let bx0 = 64;
        ['youtube', 'terminal'].forEach(function(id) {
            if (!apps[id].open) return;
            const active = topApp() === id;
            const hv = hit(bx0, y + 4, 150, 40, function() {
                if (topApp() === id) minApp(id); else openApp(id);
            });
            if (active || hv) { ctx.fillStyle = active ? 'rgba(90,140,255,.22)' : 'rgba(255,255,255,.10)'; rr(bx0, y + 4, 150, 40, 4); ctx.fill(); }
            if (active) { ctx.fillStyle = '#5aa9ff'; ctx.fillRect(bx0 + 10, y + 42, 130, 2); }
            appIcon(id, bx0 + 10, y + 12, 24);
            if (id === 'youtube') badge(bx0 + 36, y + 10, unseenCount(), 8);
            txt(APP_NAMES[id], bx0 + 44, y + 24, '14px ' + UI, '#e6eeff');
            bx0 += 156;
        });
        const d = new Date();
        txt(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), W - 16, y + 17, '14px ' + UI, '#e6eeff', 'right');
        txt(d.toLocaleDateString('en-US'), W - 16, y + 34, '12px ' + UI, '#9fb4e6', 'right');
    }
    function drawStartMenu() {
        const x = 8, y = H - 48 - 150, w = 250, h = 146;
        ctx.fillStyle = 'rgba(14,22,52,.98)'; rr(x, y, w, h, 10); ctx.fill();
        ctx.strokeStyle = '#2b3d78'; ctx.lineWidth = 1; ctx.stroke();
        hit(x, y, w, h, noop, 'start');
        ['youtube', 'terminal'].forEach(function(id, i) {
            const iy = y + 10 + i * 64;
            const hv = hit(x + 8, iy, w - 16, 56, function() { openApp(id); }, 'start');
            if (hv) { ctx.fillStyle = 'rgba(255,255,255,.10)'; rr(x + 8, iy, w - 16, 56, 6); ctx.fill(); }
            appIcon(id, x + 22, iy + 10, 36);
            txt(APP_NAMES[id], x + 72, iy + 28, '17px ' + UI, '#e6eeff');
        });
    }

    // Window frame; returns the content rectangle
    const WX = 140, WY = 24, WW = 1110, WH = 636;
    function drawWindow(id) {
        const active = topApp() === id;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24;
        ctx.fillStyle = '#0f0f0f'; ctx.fillRect(WX, WY, WW, WH); ctx.restore();
        hit(WX, WY, WW, WH, noop);
        ctx.fillStyle = active ? '#1b2550' : '#131a3a'; ctx.fillRect(WX, WY, WW, 36);
        appIcon(id, WX + 12, WY + 6, 24);
        txt(APP_NAMES[id], WX + 46, WY + 18, '14px ' + UI, '#e6eeff');
        const hm = hit(WX + WW - 92, WY, 46, 36, function() { minApp(id); });
        if (hm) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(WX + WW - 92, WY, 46, 36); }
        ctx.fillStyle = '#e6eeff'; ctx.fillRect(WX + WW - 76, WY + 18, 14, 1.5);
        const hc = hit(WX + WW - 46, WY, 46, 36, function() { closeApp(id); });
        if (hc) { ctx.fillStyle = '#e81123'; ctx.fillRect(WX + WW - 46, WY, 46, 36); }
        ctx.strokeStyle = '#e6eeff'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(WX + WW - 30, WY + 12); ctx.lineTo(WX + WW - 16, WY + 24); ctx.moveTo(WX + WW - 16, WY + 12); ctx.lineTo(WX + WW - 30, WY + 24); ctx.stroke();
        return { x: WX, y: WY + 36, w: WW, h: WH - 36 };
    }

    // ═════════ APP: TERMINAL ═════════
    function monoW() { ctx.font = '20px ' + MONO; return ctx.measureText('M').width; }
    function termCols() { return Math.max(20, Math.floor((WW - 32) / monoW())); }
    function termPrint(text) {
        const cols = termCols();
        String(text).split('\n').forEach(function(ln) {
            if (ln === '') { termLines.push(''); return; }
            for (let i = 0; i < ln.length; i += cols) termLines.push(ln.slice(i, i + cols));
        });
        if (termLines.length > 300) termLines.splice(0, termLines.length - 300);
        dirty = true;
    }
    const prompt = function() { return 'C:\\Users\\' + WIN_USER + '>'; };
    function termRun(raw) {
        termPrint(prompt() + raw);
        const line = raw.trim();
        if (!line) return;
        if (termHist[termHist.length - 1] !== raw) termHist.push(raw);
        histIdx = -1;
        logAct('Used the terminal', 300000);
        const parts = line.split(/\s+/), cmd = parts[0].toLowerCase(), arg = parts.slice(1).join(' ');
        switch (cmd) {
            case 'help': termPrint('HELP  CLS  VER  DATE  TIME  ECHO  WHOAMI  EXIT\n'); break;
            case 'cls': case 'clear': termLines.length = 0; break;
            case 'ver': termPrint('\nMicrosoft Windows [Version 10.0.18363.1556]\n'); break;
            case 'date': termPrint('The current date is: ' + new Date().toLocaleDateString('en-US') + '\n'); break;
            case 'time': termPrint('The current time is: ' + new Date().toLocaleTimeString('en-US') + '\n'); break;
            case 'echo': termPrint(arg + '\n'); break;
            case 'whoami': termPrint('pc-' + WIN_USER.toLowerCase() + '\\' + WIN_USER.toLowerCase() + '\n'); break;
            case 'exit': closeApp('terminal'); break;
            default: termPrint('\'' + parts[0] + '\' is not recognized as an internal or external command,\noperable program or batch file.\n');
        }
    }
    termPrint('Microsoft Windows [Version 10.0.18363.1556]');
    termPrint('(c) 2019 Microsoft Corporation. All rights reserved.');
    termPrint('');

    function drawTerminal(c) {
        ctx.fillStyle = '#000'; ctx.fillRect(c.x, c.y, c.w, c.h);
        hit(c.x, c.y, c.w, c.h, function() { setTarget('term'); });
        const cw = monoW(), cols = termCols(), lh = 24, rows = Math.floor((c.h - 20) / lh);
        const full = prompt() + T.term, inp = [];
        for (let i = 0; i < Math.max(full.length, 1); i += cols) inp.push(full.slice(i, i + cols));
        const all = termLines.concat(inp);
        const start = Math.max(0, all.length - rows);
        ctx.font = '20px ' + MONO; ctx.fillStyle = TERM_GREEN; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        for (let i = start; i < all.length; i++) ctx.fillText(all[i], c.x + 16, c.y + 10 + (i - start) * lh);
        if (blinkOn && target === 'term') {
            const last = inp[inp.length - 1];
            ctx.fillRect(c.x + 16 + last.length * cw, c.y + 12 + (all.length - 1 - start) * lh, cw, 18);
        }
    }

    // ═════════ APP: YOUTUBE ═════════
    function drawField(id, ph, x, y, w, h, secret) {
        const active = target === id;
        const hv = hit(x, y, w, h, function() { setTarget(id); });
        ctx.fillStyle = '#121212'; rr(x, y, w, h, 8); ctx.fill();
        ctx.strokeStyle = active ? '#3ea6ff' : (hv ? '#6a6a6a' : '#3f3f3f'); ctx.lineWidth = active ? 2 : 1; ctx.stroke();
        const v = T[id];
        const f = '17px ' + UI;
        if (!v && !active) { txt(ph, x + 16, y + h / 2, f, '#8a8a8a'); return; }
        let s = secret ? '\u2022'.repeat(v.length) : v;
        ctx.font = f;
        while (ctx.measureText(s).width > w - 36 && s.length > 1) s = s.slice(1);
        txt(s, x + 16, y + h / 2, f, '#fff');
        if (active && blinkOn) ctx.fillRect(x + 17 + ctx.measureText(s).width, y + h / 2 - 11, 2, 22);
    }
    function drawSignIn(c) {
        const cw = 440, ch = 410;
        const x = c.x + (c.w - cw) / 2, y = c.y + (c.h - ch) / 2;
        ctx.fillStyle = '#1f1f1f'; rr(x, y, cw, ch, 16); ctx.fill();
        ytLogo(x + 40, y + 34, 52, 36);
        txt('YouTube', x + 104, y + 52, 'bold 28px ' + UI, '#fff');
        txt('Sign in', x + 40, y + 112, '24px ' + UI, '#fff');
        drawField('email', 'Email', x + 40, y + 140, 360, 50, false);
        drawField('pass', 'Password', x + 40, y + 206, 360, 50, true);
        if (yt.error) txt(yt.error, x + 40, y + 280, '14px ' + UI, '#ff7a7a');
        const bh = hit(x + 40, y + 304, 360, 48, function() { if (!yt.busy) trySignIn(); });
        ctx.fillStyle = bh ? '#65b8ff' : '#3ea6ff'; rr(x + 40, y + 304, 360, 48, 24); ctx.fill();
        txt(yt.busy ? 'Signing in…' : 'Sign in', x + 220, y + 328, 'bold 16px ' + UI, '#0f0f0f', 'center');
    }
    function drawYouTube(c) {
        ctx.fillStyle = '#0f0f0f'; ctx.fillRect(c.x, c.y, c.w, c.h);
        if (!yt.account) drawSignIn(c); else drawYtHome(c);
    }

    function drawScreen() {
        hits = [];
        ctx.drawImage(wallC, 0, 0);
        drawIcons();
        drawActivity();
        order.forEach(function(id) {
            if (!apps[id].open || apps[id].min) return;
            const c = drawWindow(id);
            ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
            if (id === 'terminal') drawTerminal(c); else drawYouTube(c);
            ctx.restore();
        });
        drawTaskbar();
        if (startOpen) drawStartMenu();
        drawToast();
        syncFrame();
        tex.needsUpdate = true;
        if (S.phase === 'using') {
            let over = false;
            for (let i = hits.length - 1; i >= 0; i--) {
                const h = hits[i];
                if (mx >= h.x && mx < h.x + h.w && my >= h.y && my < h.y + h.h) { over = h.fn !== noop; break; }
            }
            scr.style.cursor = over ? 'pointer' : 'default';
        }
    }

    // ═════════ SIT / STAND ═════════
    const S = { phase: 'idle', t: 0 };
    const startPos = new THREE.Vector3(), startQ = new THREE.Quaternion();
    const focusPos = new THREE.Vector3(), focusQ = new THREE.Quaternion();
    const standPos = new THREE.Vector3(), standQ = new THREE.Quaternion();
    const _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
    let focusAspect = 0;
    const ease = function(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    const lookQ = function(eye, tg) { _m.lookAt(eye, tg, new THREE.Vector3(0, 1, 0)); return new THREE.Quaternion().setFromRotationMatrix(_m); };

    // Camera straight in front of the monitor: the screen fills the whole view
    function computeFocus() {
        group.updateMatrixWorld(true);
        screenMesh.getWorldPosition(_c);
        _n.set(0, 0, 1).transformDirection(group.matrixWorld);
        const asp = camera.aspect || 1.78;
        focusAspect = asp;
        const th = Math.tan(((camera.fov || 70) * Math.PI / 180) / 2);
        const dH = (SCR_H / 2) / (th * 0.97);
        const dW = (SCR_W / 2) / (th * asp * 0.97);
        const d = Math.max(dH, dW, 0.2);
        focusPos.copy(_c).addScaledVector(_n, d);
        _t.copy(_c);
        focusQ.copy(lookQ(focusPos, _t));
    }
    function computeStand() {
        group.localToWorld(standPos.set(0, 0, seatOff + 0.8));
        standPos.y = eyeH;
        screenMesh.getWorldPosition(_c);
        standQ.copy(lookQ(standPos, _c.set(_c.x, 1.0, _c.z)));
    }

    // Only HUD element: Stand up
    const hud = document.createElement('button');
    hud.textContent = 'Stand up';
    hud.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:41;display:none;' +
        'font:600 14px ' + UI + ';color:#cfe3ff;background:rgba(10,18,44,.85);border:1px solid #2f4f9a;border-radius:8px;' +
        'padding:8px 18px;cursor:pointer;user-select:none';
    hud.addEventListener('click', function() { leave(); });
    document.body.appendChild(hud);

    // Full-screen overlay: the PC screen fills the player's screen (the camera is never touched)
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:#000;z-index:15;display:none';
    scr.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block';
    overlay.appendChild(scr);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;border:0;display:none;background:#000';
    frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('title', 'YouTube player');
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    // The game's own buttons stay on screen and usable while seated: the PC screen takes the free area between them
    function layout() {
        const bar = document.getElementById('hud');
        const top = document.getElementById('topHud') ? 62 : 0;
        const bot = bar && bar.offsetHeight ? bar.offsetHeight : 0;
        const availH = Math.max(100, window.innerHeight - top - bot);
        const k = Math.min(window.innerWidth / W, availH / H);
        scr.style.width = Math.floor(W * k) + 'px';
        scr.style.height = Math.floor(H * k) + 'px';
        scr.style.top = Math.round(top + availH / 2) + 'px';
        hud.style.bottom = (bot ? Math.max(8, Math.round((bot - 36) / 2)) : 22) + 'px';
    }
    window.addEventListener('resize', function() { layout(); dirty = true; });

    function sit() {
        if (S.phase !== 'idle') return;
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        layout();
        overlay.style.display = 'block';
        hud.style.display = 'block';
        S.phase = 'using';
        st.seated = true; saveState();
        updateTarget();
        logAct('Sat at the computer', 600000);
        dirty = true;
    }
    function leave() {
        if (S.phase !== 'using') return;
        overlay.style.display = 'none';
        hud.style.display = 'none';
        startOpen = false; yt.menu = false; stopVideo();
        S.phase = 'idle';
        st.seated = false; saveState();
        updateTarget();
        mx = my = -1; dirty = true;
    }

    // While seated, the game gets no keys/clicks (ZQSD must not walk the player)
    function inHud(e) { return e.target === hud || !!(e.target && e.target.closest && e.target.closest('#homeButton, #topHud, .hud-panel, #actionBtn')); }
    function pointerToScreen(ev) {
        const r = scr.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) { mx = my = -1; return false; }
        mx = x * W; my = y * H;
        return true;
    }
    function onScreenClick(ev) {
        if (!pointerToScreen(ev)) return;
        startWas = startOpen; menuWas = yt.menu;
        let h = null;
        for (let i = hits.length - 1; i >= 0; i--) {
            const r = hits[i];
            if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) { h = r; break; }
        }
        if (!h || h.keep !== 'start') startOpen = false;
        if (!h || h.keep !== 'menu') yt.menu = false;
        if (!h) selIcon = null;
        if (h) h.fn({ single: ev.pointerType === 'touch' });
        dirty = true;
        updateTarget();
    }
    function onPointerEvt(e) {
        if (S.phase === 'idle' || inHud(e)) return;
        if (S.phase === 'using') {
            if (e.type === 'mousemove') { pointerToScreen(e); dirty = true; }
            else if (e.type === 'click') onScreenClick(e);
            else if (e.type === 'mousedown' && target) e.preventDefault();      // keep the keyboard focus
        }
        e.stopImmediatePropagation();
    }
    ['mousedown', 'click', 'dblclick', 'mousemove', 'pointerdown', 'touchstart'].forEach(function(t) { window.addEventListener(t, onPointerEvt, true); });

    window.addEventListener('wheel', function(e) {
        if (S.phase !== 'using' || inHud(e)) return;
        e.stopImmediatePropagation(); e.preventDefault();
        if (topApp() === 'youtube' && yt.account && !yt.watch) { yt.scroll += e.deltaY; dirty = true; }
    }, { capture: true, passive: false });

    window.addEventListener('keydown', function(e) {
        if (S.phase === 'idle' || inHud(e)) return;
        e.stopImmediatePropagation();
        if (S.phase !== 'using') return;
        if (e.key === 'Escape') { leave(); e.preventDefault(); return; }
        if (!target) {
            if (topApp() === 'youtube' && yt.account && !yt.watch) {
                const d = { ArrowDown: 80, ArrowUp: -80, PageDown: 360, PageUp: -360 }[e.key];
                if (d) { yt.scroll += d; dirty = true; e.preventDefault(); }
            }
            return;
        }
        if (e.key === 'Enter') {
            if (target === 'term') { const l = T.term; T.term = ''; kbIn.value = ''; termRun(l); }
            else if (target === 'email') setTarget('pass');
            else if (target === 'pass' && !yt.busy) trySignIn();
            dirty = true; e.preventDefault(); return;
        }
        if (e.key === 'Tab') { if (target !== 'term') setTarget(target === 'email' ? 'pass' : 'email'); e.preventDefault(); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (target === 'term' && termHist.length) {
                if (e.key === 'ArrowUp') histIdx = histIdx < 0 ? termHist.length - 1 : Math.max(0, histIdx - 1);
                else histIdx = histIdx < 0 ? -1 : histIdx + 1;
                if (histIdx >= termHist.length) histIdx = -1;
                T.term = histIdx < 0 ? '' : termHist[histIdx]; kbIn.value = T.term; dirty = true;
            }
            e.preventDefault(); return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') { e.preventDefault(); return; }
        if (document.activeElement !== kbIn) { try { kbIn.focus({ preventScroll: true }); } catch (err) { kbIn.focus(); } }
    }, true);

    // Click on the chair / desk / PC (within 4 m)
    const hitMeshes = [];
    group.traverse(function(c) { if (c.isMesh) hitMeshes.push(c); });
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    canvas.addEventListener('click', function(ev) {
        if (S.phase !== 'idle' || window._doorAnimating) return;
        if (o.canUse && !o.canUse()) return;
        const rect = canvas.getBoundingClientRect();
        ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit0 = ray.intersectObjects(hitMeshes, false);
        if (!hit0.length || hit0[0].distance > 4) return;
        sit();
    });

    function update(dt, time) {
        const tm = time != null ? time : performance.now() / 1000;
        dt = dt || 0;
        glow.intensity = 0.45 * (1 + 0.03 * Math.sin(tm * 9));

        // Runs whether or not anyone sits at the PC (the monitor in the room shows it too)
        if (YT_PROXY && !document.hidden && Date.now() - yt.lastFetch > YT_REFRESH_MS) refreshFeed();
        pollT += dt; if (pollT > 2) { pollT = 0; pollWorld(); }
        if (yt.toast && Date.now() - yt.toast.at > 7000) { yt.toast = null; dirty = true; }
        if (yt.videos.length && isYtVisible()) markSeen();

        const showMarker = S.phase === 'idle' && !(o.canUse && !o.canUse());
        marker.visible = showMarker;
        if (showMarker) {
            ringM.opacity = 0.50 + 0.25 * Math.sin(tm * 3);
            const f = (tm * 0.8) % 1;
            ring2.scale.set(1 + f * 0.7, 1 + f * 0.7, 1);
            pulseM.opacity = 0.5 * (1 - f);
            arrow.position.y = 1.45 + 0.05 * Math.sin(tm * 3);
            arrow.rotation.y = tm * 1.5;
        }

        blink += dt;
        if (blink > 0.5) { blink = 0; blinkOn = !blinkOn; if (S.phase === 'using' && target) dirty = true; }
        const mnt = Math.floor(Date.now() / 60000);
        if (mnt !== lastMin) { lastMin = mnt; dirty = true; }
        if (dirty) { dirty = false; drawScreen(); }
    }

    drawScreen();
    if (st.seated) setTimeout(function() { if (S.phase === 'idle' && !(o.canUse && !o.canUse())) sit(); }, 400);

    return {
        group: group,
        update: update,
        sit: sit,
        leave: leave,
        logActivity: function(text) { logAct(String(text)); },
        isUsing: function() { return S.phase !== 'idle'; }
    };
}
