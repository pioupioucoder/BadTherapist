import * as THREE from 'three';
import { PLACES } from './monde.js'
import { mats, box, glow, lampPost, signMaterial } from './outils.js';

// ==========================================
// BAD THERAPIST — STATION-SERVICE (places/gasstation.js)  v2
// ==========================================
// Auvent + 4 pompes (écrans qui comptent les litres) + VRAI magasin : rayons, frigo, caisse, bidons d'essence,
// arrière-boutique avec un lit, porte qui s'ouvre, cloche au-dessus de la porte (réveille Lou).
// Lou (PNJ simple, fiche npcs/lou.js) y travaille jour et nuit comme il veut : caisse, pompes, rangement, repos sur le tabouret, sieste dans le lit.
//
// SANS API : service à la pompe (il voit la voiture arriver, vient, demande les litres, sert, encaisse) et vente à la caisse.
// Aucun cerveau ni API : il répond avec les phrases de sa fiche.
//
// Coordonnées : relatives au centre (PLACES.gas). La route arrive de l'ouest (z ≈ 0) ; l'auvent est au nord de la route.
// Le magasin est à l'est de l'auvent (même emplacement qu'avant), porte au sud.
// Branchement : voir notes/INTEGRATION-4.md (window.BadTherapistGas : update, pose, controls, attach, setMode, ring, test).

export const GAS_CONFIG = {
    fuelPerLiter: 3.6,          // cher : c'est la seule station, ouverte même la nuit
    tankStock: 4000,            // litres en cuve
    flowLitersPerSec: 3,        // vitesse de la pompe
    defaultTank: 45,            // « plein » si le véhicule ne dit pas la taille de son réservoir
    walkSpeed: 1.5, runSpeed: 3.2,
    carRadius: 5.5,             // une voiture arrêtée à moins de 5,5 m d'une pompe = client
    carStopSpeed: 0.7,          // m/s : « arrêtée »
    carStopSec: 1.2,            // doit rester arrêtée 1,2 s
    carCooldownSec: 90,         // il ne la re-sert pas tout de suite
    engineWakeSec: 8,           // s'il dort : le moteur d'une voiture arrêtée à la pompe finit par le réveiller
    orderTimeoutSec: 45,        // attend la réponse du joueur (litres) 45 s
    fatigueFullMin: 25,         // minutes d'éveil avant d'être vraiment fatigué
    sleepMinSec: 150, sleepMaxSec: 360,
    sleepHeading: Math.PI / 2,  // sens du corps couché sur le lit (à régler selon Sleeping.fbx)
    sleepYOffset: 0             // + monte / − enfonce le corps dans le matelas
};

// ---------- rayons & catalogue (prix gonflés : seul magasin ouvert) ----------
const RAYONS = {
    food:    { label: 'FOOD',      colors: [0xb8452f, 0xd9b44a, 0x5a8a46, 0xc9b79a, 0x8a5a3a], hMin: 0.12, hMax: 0.22, items: [['canned soup', 8.5], ['canned beans', 7.5], ['pasta', 7.9], ['bread', 6.5], ['rice 1 kg', 9.5]] },
    snacks:  { label: 'SNACKS',    colors: [0xd9382f, 0xf0c43a, 0x2f7fd9, 0x8a3ad9, 0xe86a1f], hMin: 0.18, hMax: 0.3,  items: [['chips', 6.5], ['chocolate bar', 4.8], ['biscuits', 5.9], ['peanuts', 7.2]] },
    drinks:  { label: 'DRINKS',    colors: [0x2f8fd9, 0x3ab87a, 0xd9382f, 0xe8e8e8, 0xd9a02f], hMin: 0.2,  hMax: 0.32, items: [['water 0.5 L', 3.5], ['soda', 5], ['orange juice', 6.5], ['energy drink', 7]] },
    car:     { label: 'CAR',       colors: [0x2a2a2a, 0xd9b42f, 0x2f5fd9, 0x9a9a9a, 0xd9382f], hMin: 0.2,  hMax: 0.34, items: [['engine oil 1 L', 24], ['washer fluid', 13], ['antifreeze', 19], ['ice scraper', 9], ['wiper blades', 29], ['snow chains', 95]] },
    home:    { label: 'SUPPLIES',  colors: [0xe8e0c8, 0x3a7a3a, 0xd9382f, 0x6a6a8a, 0xc8c8c8], hMin: 0.14, hMax: 0.28, items: [['batteries (4)', 12], ['flashlight', 26], ['matches', 4], ['lighter', 5.5], ['candles (6)', 8], ['first aid kit', 32], ['wool blanket', 38]] },
    counter: { label: 'COUNTER',   colors: [0xe8e0c8], hMin: 0.1, hMax: 0.2, items: [['coffee', 6.5], ['tea', 5.5], ['hot soup cup', 9]] },
    cans:    { label: 'FUEL CANS', colors: [0xc0281c], hMin: 0.4, hMax: 0.46, items: [] }
};
const RAYON_ORDER = ['food', 'snacks', 'drinks', 'car', 'home', 'counter', 'cans'];
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

// Catalogue lisible par society.js : window.BadTherapistGas.catalog
export const GAS_CATALOG = [];
RAYON_ORDER.forEach(function (k) { RAYONS[k].items.forEach(function (it) { GAS_CATALOG.push({ id: slug(it[0]), name: it[0], price: it[1], rayon: k }); }); });
[[5, 12], [10, 18], [20, 30]].forEach(function (c) {      // bidon d'essence rempli = bidon + essence au prix pompe majoré, facturé au rayon
    GAS_CATALOG.push({ id: 'jerrycan_' + c[0] + 'l', name: 'jerrycan ' + c[0] + ' L, filled', price: Math.round((c[1] + c[0] * GAS_CONFIG.fuelPerLiter * 1.2) * 2) / 2, rayon: 'cans', liters: c[0] });
});

const LINES = {
    car: ['Evening. How many liters?', 'Hey. How much do you need?', 'Fill it up, or just a few liters?'],
    welcome: ['Welcome.', 'Hey there. Cold out, huh?', 'Take your time. I’m at the register.'],
    bell: ['Mmh… coming.', 'Yeah, yeah… one second.', 'Coming!'],
    engine: ['A car? Hold on…', 'I hear an engine… coming.'],
    never: ['Never mind, then.', 'Alright.']
};
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rngMaker(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function normAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

const CSS = '.bt-gas-btn{position:fixed;left:50%;transform:translateX(-50%);bottom:26vh;z-index:60;padding:10px 18px;border:1px solid #9fe0c8;background:rgba(10,20,24,.88);color:#cfeee2;font:600 15px system-ui,sans-serif;border-radius:10px;display:none}' +
    '.bt-gas-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:12vh;z-index:61;width:min(92vw,420px);max-height:64vh;overflow:auto;background:rgba(10,18,22,.94);border:1px solid #3a5a52;border-radius:12px;color:#d8efe6;font:14px system-ui,sans-serif;padding:12px}' +
    '.bt-gas-panel button{background:#1c3a34;color:#d8efe6;border:1px solid #3f6d62;border-radius:8px;padding:7px 11px;margin:3px;font:inherit;cursor:pointer}' +
    '.bt-gas-h{font-weight:700;margin-bottom:8px}.bt-gas-h span{display:block;font-weight:400;opacity:.65;font-size:12px}' +
    '.bt-gas-r{margin:10px 0 3px;font-size:12px;letter-spacing:.08em;opacity:.7}.bt-gas-row{display:flex;align-items:center;gap:6px;padding:2px 0}.bt-gas-row span{flex:1}.bt-gas-row b{width:56px;text-align:right;font-weight:600}.bt-gas-row i{width:22px;text-align:center;font-style:normal}' +
    '.bt-gas-t{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:10px;flex-wrap:wrap}.bt-gas-t span{flex:1;font-weight:700}.bt-gas-t input{width:90px;padding:7px;border-radius:8px;border:1px solid #3f6d62;background:#0d1a1e;color:#d8efe6}' +
    '.bt-gas-cap{position:fixed;left:50%;transform:translateX(-50%);bottom:34vh;z-index:60;max-width:min(88vw,460px);padding:8px 14px;background:rgba(10,18,22,.88);border:1px solid #3a5a52;border-radius:10px;color:#e8f6ef;font:14px system-ui,sans-serif;display:none}';

export function buildGasStation(scene, env) {
    const P = PLACES.gas, Y = env.sites.gas.y, M = mats();
    const X = P.x, Z = P.z, cfg = GAS_CONFIG;
    const host = { say: null, charge: null, vehicles: env.vehicles || null, visitors: null, onSale: null, player: null };
    let clock = 0, PL = null;
    const ledger = { till: 0, fuelStock: cfg.tankStock, sales: [] };

    // ---------- dalle, auvent, mât (inchangés) ----------
    box(scene, 30, 0.12, 22, M.concrete, X + 2, Y + 0.06, Z - 15);
    [[-9, -22], [-9, -8], [13, -22], [13, -8]].forEach(function (c) { box(scene, 0.6, 5.2, 0.6, M.concreteDark, X + c[0], Y + 2.6, Z + c[1]); });
    box(scene, 25, 0.5, 17, M.metal, X + 2, Y + 5.45, Z - 15);
    box(scene, 25.4, 0.12, 17.4, M.snow, X + 2, Y + 5.76, Z - 15);
    box(scene, 25.2, 0.35, 0.2, new THREE.MeshBasicMaterial({ color: 0xcfe0e8 }), X + 2, Y + 5.2, Z - 6.4);
    glow(scene, X + 2, Y + 4.4, Z - 15, 0xcfe8ff, 22, 0.28);
    [[-9, -22], [13, -22], [-9, -8], [13, -8]].forEach(function (c) { env.rects.push({ x0: X + c[0] - 0.4, x1: X + c[0] + 0.4, z0: Z + c[1] - 0.4, z1: Z + c[1] + 0.4 }); });

    // ---------- pompes : écran vivant, tuyau et pistolet ----------
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.6, metalness: 0.3, emissive: 0x180806 });
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 });
    const nozMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.4 });
    const nozGrip = new THREE.MeshStandardMaterial({ color: 0xc0281c, roughness: 0.6 });
    const pumpsW = [], pumpScr = [];
    function makeNozzle() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.05), nozMat); g.add(body);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.04), nozGrip); grip.position.set(0, -0.08, 0.04); g.add(grip);
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), nozMat); spout.position.set(0, -0.2, 0); g.add(spout);   // le bec pointe vers le bas au repos
        scene.add(g); return g;
    }
    [[-4, -18], [-4, -12], [8, -18], [8, -12]].forEach(function (p, i) {
        const px = X + p[0], pz = Z + p[1], side = p[0] < 2 ? 1 : -1;        // le tuyau sort du côté de l'allée centrale
        box(scene, 0.9, 1.7, 0.55, pumpMat, px, Y + 0.95, pz);
        box(scene, 1.6, 0.25, 1.2, M.concreteDark, px, Y + 0.19, pz);
        box(scene, 0.07, 0.34, 0.16, M.metal, px + side * 0.5, Y + 1.02, pz + 0.12);   // support du pistolet
        env.rects.push({ x0: px - 0.8, x1: px + 0.8, z0: pz - 0.6, z1: pz + 0.6 });
        const pw = { x: px, z: pz, side: side, hoseStart: { x: px + side * 0.46, y: Y + 1.3, z: pz }, rest: { x: px + side * 0.56, y: Y + 1.05, z: pz + 0.12 }, hose: null, noz: makeNozzle() };
        pw.hose = new THREE.Mesh(new THREE.BufferGeometry(), hoseMat); scene.add(pw.hose);
        pumpsW.push(pw);
        let scr = { ctx: null, tex: null };
        if (typeof document !== 'undefined') {
            const cv = document.createElement('canvas'); cv.width = 160; cv.height = 96;
            const tex = new THREE.CanvasTexture(cv);
            scr = { ctx: cv.getContext('2d'), tex: tex };
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: tex }));
            m.position.set(px, Y + 1.45, pz + 0.282); scene.add(m);
        }
        pumpScr[i] = scr;
    });
    function drawPump(i, a, b, c) {        // a = litres, b = prix, c = ligne du bas
        const s = pumpScr[i]; if (!s || !s.ctx) return;
        const g = s.ctx; g.fillStyle = '#0b1a10'; g.fillRect(0, 0, 160, 96);
        g.fillStyle = '#6fa874'; g.font = '11px monospace'; g.fillText('LITERS', 6, 14); g.fillText('PRICE', 6, 50);
        g.fillStyle = '#9fd0a0'; g.font = 'bold 26px monospace'; g.fillText(a, 6, 40); g.fillText(b, 6, 76);
        g.font = '12px monospace'; g.fillText(c, 6, 92);
        s.tex.needsUpdate = true;
    }
    function pumpIdle(i) { drawPump(i, '--.--', '--.--', fmt(cfg.fuelPerLiter) + ' / L'); }
    // tuyau : courbe qui pend entre la pompe et le pistolet (reconstruite seulement quand le pistolet bouge)
    function setHose(i, end) {
        const pw = pumpsW[i], s = pw.hoseStart;
        const a = new THREE.Vector3(s.x, s.y, s.z), b = new THREE.Vector3(end.x, end.y, end.z), d = a.distanceTo(b), sag = Math.min(1.0, 0.3 + d * 0.12);
        const m1 = a.clone().lerp(b, 0.33), m2 = a.clone().lerp(b, 0.66);
        m1.y = Math.max(Y + 0.06, m1.y - sag * 0.6); m2.y = Math.max(Y + 0.06, m2.y - sag);
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, m1, m2, b]), 16, 0.022, 6, false);
        pw.hose.geometry.dispose(); pw.hose.geometry = geo;
    }
    function setNozzle(i, pos, yaw, tilt) { const n = pumpsW[i].noz; n.position.set(pos.x, pos.y, pos.z); n.rotation.set(0, yaw || 0, tilt || 0); }
    function nozzleHome(i) { const r = pumpsW[i].rest; setNozzle(i, r, 0, 0); setHose(i, { x: r.x, y: r.y + 0.08, z: r.z }); }
    pumpsW.forEach(function (p, i) { pumpIdle(i); nozzleHome(i); });

    // mât + enseigne + prix
    box(scene, 0.35, 9, 0.35, M.metal, X - 18, Y + 4.5, Z - 3);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), signMaterial('FUEL', '#10242c', '#9fe0c8', 256, 160));
    sg.position.set(X - 18, Y + 9.2, Z - 2.8); sg.rotation.y = Math.PI; scene.add(sg);
    const sg2 = sg.clone(); sg2.position.z = Z - 3.2; sg2.rotation.y = 0; scene.add(sg2);
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), signMaterial(fmt(cfg.fuelPerLiter) + ' / L', '#10242c', '#f0d890', 256, 96));
    pr.position.set(X - 18, Y + 7.4, Z - 3.2); scene.add(pr);
    const pr2 = pr.clone(); pr2.position.z = Z - 2.8; pr2.rotation.y = Math.PI; scene.add(pr2);
    glow(scene, X - 18, Y + 9.2, Z - 3, 0x9fe0c8, 9, 0.35);
    env.rects.push({ x0: X - 18.3, x1: X - 17.7, z0: Z - 3.3, z1: Z - 2.7 });
    [[-14, -26], [18, -4], [22, -20]].forEach(function (l) { lampPost(scene, X + l[0], Y, Z + l[1], l[0] < 0 ? 0 : Math.PI); });

    // ==========================================
    // LE MAGASIN  (repère local : centre (SX,SZ) ; x vers l'est, z vers le SUD = côté porte)
    // intérieur : x ∈ [-5.8, 5.8], z ∈ [-6.8, 6.8]
    // ==========================================
    const SX = X + 20, SZ = Z - 32, FY = Y + 0.06, WH = 3.6, T = 0.2;
    const lx = function (x) { return SX + x; }, lz = function (z) { return SZ + z; };
    const inShopXZ = function (x, z) { return Math.abs(x - SX) < 5.6 && Math.abs(z - SZ) < 6.6; };

    function std(color, rough, metal) { return new THREE.MeshStandardMaterial({ color: color, roughness: rough == null ? 0.85 : rough, metalness: metal || 0 }); }
    const mWall = std(0x7d7262, 0.95), mTrim = std(0x2e2926, 0.8), mWood = std(0x6b4a2f), mWood2 = std(0x4a3a2c), mTop = std(0xcfc6b4, 0.6), mMetal = std(0x8a9096, 0.4, 0.5);
    const mRoof = std(0xb9b2a4, 0.9), mRug = std(0x6a3a3a, 1), mMat = std(0xe8e2d4, 1), mBlanket = std(0x3a5a7a, 1), mCrate = std(0x8a6a3a, 0.9);
    const mGlass = new THREE.MeshStandardMaterial({ color: 0x9fc8d8, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.1, depthWrite: false });
    const mLight = new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), mScreen = new THREE.MeshBasicMaterial({ color: 0x7fe0a0 }), mLamp = new THREE.MeshBasicMaterial({ color: 0xffc47a });
    const mFridgeBack = new THREE.MeshBasicMaterial({ color: 0xbfe4f0 });
    let mFloor;
    (function () {
        let tex = null;
        if (typeof document !== 'undefined') {
            const c = document.createElement('canvas'); c.width = c.height = 64;
            const g = c.getContext('2d'); g.fillStyle = '#b9b4a6'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#a19c8f'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
            tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5.8, 6.8);
        }
        mFloor = tex ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }) : std(0xb0ab9d, 0.7);
    })();

    // mk : boîte en repère LOCAL, y0 = bas de la boîte au-dessus du sol du magasin
    function mk(w, h, d, mat, x, y0, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(lx(x), FY + y0 + h / 2, lz(z)); scene.add(m); return m;
    }
    function solid(x0, x1, z0, z1) { env.rects.push({ x0: lx(x0), x1: lx(x1), z0: lz(z0), z1: lz(z1) }); }

    // sol, murs, toit
    mk(11.6, 0.12, 13.6, mFloor, 0, -0.12, 0);
    mk(11.6, WH, T, mWall, 0, 0, -6.9); solid(-5.8, 5.8, -7, -6.8);
    mk(T, WH, 14, mWall, -5.9, 0, 0); solid(-6, -5.8, -7, 7);
    mk(T, WH, 14, mWall, 5.9, 0, 0); solid(5.8, 6, -7, 7);
    [[-5.8, -4.9], [-3.1, -2.6], [0.4, 1.4], [4.4, 5.8]].forEach(function (s) { mk(s[1] - s[0], WH, T, mWall, (s[0] + s[1]) / 2, 0, 6.9); solid(s[0], s[1], 6.8, 7); });
    [[-2.6, 0.4], [1.4, 4.4]].forEach(function (s) {          // vitrines : on voit l'intérieur éclairé depuis dehors
        const w = s[1] - s[0], cx = (s[0] + s[1]) / 2;
        mk(w, 0.9, T, mWall, cx, 0, 6.9); mk(w, 0.8, T, mWall, cx, WH - 0.8, 6.9);
        mk(w, 1.9, 0.04, mGlass, cx, 0.9, 6.9); mk(0.06, 1.9, 0.08, mTrim, cx, 0.9, 6.9);
        solid(s[0], s[1], 6.8, 7);
    });
    mk(1.8, WH - 2.4, T, mWall, -4.0, 2.4, 6.9);              // linteau au-dessus de la porte
    mk(12.6, 0.3, 14.6, mRoof, 0, WH, 0);
    mk(12.8, 0.14, 14.8, M.snow, 0, WH + 0.3, 0);

    // plafonniers
    [[-3.6, -1.0, 0.3, 4.6], [-0.4, -1.0, 0.3, 4.6], [3.5, 0.3, 4.0, 0.3], [-2.5, 4.5, 3.6, 0.3]].forEach(function (s) { mk(s[2], 0.05, s[3], mLight, s[0], WH - 0.07, s[1]); });
    glow(scene, lx(-2.2), FY + 2.9, lz(-1.0), 0xffeccc, 14, 0.5);
    glow(scene, lx(3.2), FY + 2.9, lz(3.0), 0xffeccc, 12, 0.4);

    // ---------- produits (un seul InstancedMesh pour tous) ----------
    const prodList = [];
    function prodAdd(x, y0, z, w, h, d, color) { prodList.push([lx(x), FY + y0 + h / 2, lz(z), w, h, d, color]); }
    function lbox(axis, cx, cz, s, t, along, h, across, y0, mat) {
        return axis === 'z' ? mk(across, h, along, mat, cx + t, y0, cz + s) : mk(along, h, across, mat, cx + s, y0, cz + t);
    }
    // unité de rayonnage : faces = [{f:±1, r:'food'}], axis 'z' (longueur le long de z) ou 'x'
    const rng = rngMaker(1337);
    function shelfUnit(s) {
        const nF = s.faces.length, D = 0.34, levels = s.levels || [0.12, 0.55, 0.95, 1.35], tc = nF === 2 ? 0 : s.faces[0].f * 0.19;
        const across = nF === 2 ? 0.7 : 0.38;
        lbox(s.axis, s.cx, s.cz, 0, 0, s.len, 1.7, 0.05, 0, mWood2);                       // fond
        lbox(s.axis, s.cx, s.cz, 0, tc, s.len, 0.1, across, 0, mTrim);                     // plinthe
        lbox(s.axis, s.cx, s.cz, 0, tc, s.len, 0.05, across, 1.7, mTrim);                  // dessus
        lbox(s.axis, s.cx, s.cz, -s.len / 2, tc, 0.05, 1.7, across, 0, mTrim);
        lbox(s.axis, s.cx, s.cz, s.len / 2, tc, 0.05, 1.7, across, 0, mTrim);
        levels.forEach(function (y) { lbox(s.axis, s.cx, s.cz, 0, tc, s.len, 0.04, D * nF, y, mWood); });
        s.faces.forEach(function (fc) {
            const R = RAYONS[fc.r];
            levels.forEach(function (y) {
                let a = -s.len / 2 + 0.1;
                while (a < s.len / 2 - 0.2) {
                    const w = 0.1 + rng() * 0.14, h = R.hMin + rng() * (R.hMax - R.hMin), d = 0.18 + rng() * 0.1;
                    const col = R.colors[Math.floor(rng() * R.colors.length)];
                    const t = fc.f * 0.2;
                    if (s.axis === 'z') prodAdd(s.cx + t, y + 0.04, s.cz + a + w / 2, d, h, w, col); else prodAdd(s.cx + a + w / 2, y + 0.04, s.cz + t, w, h, d, col);
                    a += w + 0.02 + rng() * 0.03;
                }
            });
        });
        if (s.sign) {                                              // pancartes de rayon aux deux bouts
            const label = s.faces.map(function (fc) { return RAYONS[fc.r].label; }).join(' · ');
            [1, -1].forEach(function (e) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.36), signMaterial(label, '#1d2a24', '#d8efe6', 256, 84));
                m.position.set(lx(s.cx), FY + 1.95, lz(s.cz + e * (s.len / 2 + 0.06)));
                if (e < 0) m.rotation.y = Math.PI;
                scene.add(m);
            });
        }
        // collision (le joueur ne traverse pas les rayons)
        if (s.axis === 'z') solid(s.cx - across / 2 + tc, s.cx + across / 2 + tc, s.cz - s.len / 2, s.cz + s.len / 2); else solid(s.cx - s.len / 2, s.cx + s.len / 2, s.cz - across / 2 + tc, s.cz + across / 2 + tc);
    }
    // les rayons
    shelfUnit({ axis: 'z', cx: -2.4, cz: -1.0, len: 4.4, faces: [{ f: -1, r: 'food' }, { f: 1, r: 'snacks' }], sign: true });
    shelfUnit({ axis: 'z', cx: -0.4, cz: -1.0, len: 4.4, faces: [{ f: -1, r: 'car' }, { f: 1, r: 'home' }], sign: true });
    shelfUnit({ axis: 'x', cx: -1.8, cz: -6.8, len: 6.4, faces: [{ f: 1, r: 'snacks' }] });
    shelfUnit({ axis: 'z', cx: 5.8, cz: -0.8, len: 4.8, faces: [{ f: -1, r: 'car' }] });
    // frigo des boissons (mur ouest) : fond lumineux + vitre
    shelfUnit({ axis: 'z', cx: -5.8, cz: -3.4, len: 5.0, faces: [{ f: 1, r: 'drinks' }], levels: [0.3, 0.8, 1.3] });
    mk(0.03, 1.5, 4.9, mFridgeBack, -5.77, 0.2, -3.4);
    mk(0.03, 1.5, 4.9, mGlass, -5.36, 0.2, -3.4);
    glow(scene, lx(-5.0), FY + 1.2, lz(-3.4), 0xbfe4f0, 8, 0.3);

    // bidons d'essence : étagère intérieure (près de la porte) + pile dehors
    mk(1.8, 0.1, 0.6, mTrim, -1.9, 0, 6.5); solid(-2.8, -1.0, 6.2, 6.8);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) { prodAdd(-2.6 + i * 0.38, 0.1 + r * 0.47, 6.55, 0.34, 0.46, 0.2, 0xc0281c); prodAdd(-2.6 + i * 0.38 + 0.08, 0.1 + r * 0.47 + 0.46, 6.55, 0.1, 0.05, 0.08, 0xf0c43a); }
    mk(1.3, 0.1, 0.8, mTrim, -1.6, -0.06, 7.7); solid(-2.25, -0.95, 7.3, 8.1);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) prodAdd(-2.0 + i * 0.4, 0.04 + r * 0.47, 7.5 + k * 0.4, 0.34, 0.46, 0.2, 0xc0281c);

    // comptoir + caisse (côté client au nord, côté Lou au sud ; passage côté ouest)
    mk(4.3, 1.0, 0.7, mWood2, 3.65, 0, 3.0); mk(4.5, 0.06, 0.82, mTop, 3.65, 1.0, 3.0); solid(1.5, 5.8, 2.65, 3.35);
    mk(0.5, 0.16, 0.42, mMetal, 3.0, 1.06, 3.05);
    const regScreen = mk(0.34, 0.22, 0.04, mScreen, 3.0, 1.22, 2.9); regScreen.rotation.x = -0.35;
    mk(0.34, 0.4, 0.34, mTrim, 5.2, 1.06, 3.05); mk(0.05, 0.05, 0.05, new THREE.MeshBasicMaterial({ color: 0xff3a2a }), 5.2, 1.4, 2.87);   // machine à café
    glow(scene, lx(3.0), FY + 1.4, lz(2.7), 0x7fe0a0, 3, 0.25);
    // tabouret de Lou derrière le comptoir
    mk(0.38, 0.05, 0.38, mWood, 4.6, 0.5, 4.4); mk(0.06, 0.5, 0.06, mMetal, 4.6, 0, 4.4);
    // présentoir de snacks au milieu de l'est
    mk(1.6, 0.9, 0.8, mWood2, 3.6, 0, -0.8); solid(2.8, 4.4, -1.2, -0.4);
    for (let i = 0; i < 6; i++) prodAdd(2.95 + i * 0.25, 0.9, -0.8, 0.2, 0.22, 0.3, RAYONS.snacks.colors[i % 5]);

    // arrière-boutique : cloison, lit, table de chevet, caisses
    mk(0.15, WH, 3.2, mWall, 1.8, 0, -5.2); solid(1.725, 1.875, -6.8, -3.6);
    mk(2.6, WH, 0.15, mWall, 4.5, 0, -3.6); solid(3.2, 5.8, -3.675, -3.525);
    mk(1.8, 0.02, 1.2, mRug, 3.0, 0, -5.0);
    mk(2.1, 0.3, 1.0, mWood, 4.75, 0, -6.3); mk(2.0, 0.2, 0.92, mMat, 4.75, 0.3, -6.3); mk(0.4, 0.1, 0.6, mMat, 5.45, 0.5, -6.3); mk(1.2, 0.06, 0.96, mBlanket, 4.2, 0.5, -6.3); solid(3.7, 5.8, -6.8, -5.8);
    mk(0.45, 0.5, 0.45, mWood, 3.4, 0, -6.55); mk(0.2, 0.24, 0.2, mLamp, 3.4, 0.5, -6.55); solid(3.17, 3.63, -6.8, -6.3);
    glow(scene, lx(3.4), FY + 1.0, lz(-6.4), 0xffb36a, 7, 0.4);
    mk(0.6, 0.45, 0.6, mCrate, 2.4, 0, -6.4); mk(0.6, 0.45, 0.6, mCrate, 2.4, 0.45, -6.4); mk(0.6, 0.45, 0.6, mCrate, 2.4, 0, -5.7); solid(2.1, 2.7, -6.8, -5.4);

    // façade : enseignes (SHOP, OPEN / RING BELL / CLOSED), lampe au-dessus de la porte
    function facadeSign(text, bg, fg, w, h, x, y) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(text, bg, fg, 256, Math.round(256 * h / w)));
        m.position.set(lx(x), FY + y, lz(7.03)); scene.add(m); return m;
    }
    facadeSign('SHOP', '#10242c', '#9fe0c8', 1.7, 0.5, -4.0, 2.95);
    const signOpen = facadeSign('OPEN', '#2a0a0a', '#ff6a5a', 0.8, 0.3, -2.85, 1.7);
    const signRing = facadeSign('RING BELL', '#2a1a0a', '#ffc46a', 0.8, 0.3, -2.85, 1.7);
    const signClosed = facadeSign('CLOSED', '#1a1a1a', '#9a9a9a', 0.8, 0.3, -2.85, 1.7);
    signRing.visible = false; signClosed.visible = false;
    glow(scene, lx(-4.0), FY + 2.6, lz(8.0), 0xffd9a0, 10, 0.5);

    // porte (pivot à gauche, s'ouvre vers l'intérieur) + cloche
    const doorG = new THREE.Group();
    doorG.position.set(lx(-4.9), FY, lz(6.9)); scene.add(doorG);
    [[1.7, 0.08, 0.85, 2.22], [1.7, 0.08, 0.85, 0], [0.08, 2.3, 0.04, 1.15], [0.08, 2.3, 1.66, 1.15]].forEach(function (p) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], 0.05), mTrim); m.position.set(p[2], p[3] || p[1] / 2, 0); if (p[3] === 1.15) m.position.y = 1.15; doorG.add(m);
    });
    const dg = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.1, 0.03), mGlass); dg.position.set(0.85, 1.15, 0); doorG.add(dg);
    const dh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), mMetal); dh.position.set(1.55, 1.1, 0.04); doorG.add(dh);
    // cloche de porte : lamelle de clochettes FIXÉE en haut de la porte (devant, côté intérieur) ; elle tinte dès que la porte bouge
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.35, metalness: 0.8 });
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.015), std(0x4a2f1a, 0.9)); strap.position.set(0.95, 2.18, -0.045); doorG.add(strap);
    const bells = [];
    [0.55, 0.95, 1.35].forEach(function (bx, i) {
        const g = new THREE.Group(); g.position.set(bx, 2.16, -0.05); doorG.add(g);
        const cord = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09 + i * 0.015, 0.008), mTrim); cord.position.y = -0.05; g.add(cord);
        const bb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.85), brass); bb.position.y = -0.12 - i * 0.015; g.add(bb);
        bells.push(g);
    });
    const door = { open: 0, hold: 0, foreign: false, ringed: false };
    let bellAmp = 0, bellT = 0, AC = null;
    function audio() { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; }
    function jingle(vol, soft) {                 // « ting-a-ling » : trois clochettes de hauteurs différentes qui s'éteignent
        if (vol < 0.03) return;
        try {
            const A = audio(), hits = soft ? 4 : 9, base = A.currentTime;
            for (let n = 0; n < hits; n++) {
                const f = [2489, 3136, 3729][n % 3] * (1 + (Math.random() - 0.5) * 0.02), t0 = base + n * (0.045 + Math.random() * 0.03), amp = (soft ? 0.09 : 0.16) * vol * Math.pow(0.82, n);
                [[1, 1], [2.76, 0.35]].forEach(function (pp) {
                    const o = A.createOscillator(), g = A.createGain();
                    o.type = 'sine'; o.frequency.value = f * pp[0];
                    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp * pp[1], t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
                    o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.55);
                });
            }
        } catch (e) { /* audio impossible : pas grave */ }
    }
    function click(vol) {                         // « clac » du pistolet
        try {
            const A = audio(), o = A.createOscillator(), g = A.createGain(), t0 = A.currentTime;
            o.type = 'square'; o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.05);
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12 * vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
            if (PL && Math.hypot(PL.x - L.x, PL.z - L.z) > 30) return;
            o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.08);
        } catch (e) { /* ignore */ }
    }
    function ring(soft) {
        bellAmp = soft ? 0.4 : 0.9; bellT = 0;
        const d = PL ? Math.hypot(PL.x - lx(-4), PL.z - lz(6)) : 0;
        jingle(Math.max(0, 1 - d / 45), !!soft);
        if (!soft && L.state === 'asleep') wake('bell');
    }

    // produits : un seul draw call
    (function () {
        if (!prodList.length) return;
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 }), prodList.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), c = new THREE.Color();
        prodList.forEach(function (it, i) { pv.set(it[0], it[1], it[2]); sv.set(it[3], it[4], it[5]); m4.compose(pv, q, sv); im.setMatrixAt(i, m4); im.setColorAt(i, c.setHex(it[6])); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false; scene.add(im);
    })();

    // ==========================================
    // LOU : points de passage (graphe) — jamais à travers les murs
    // ==========================================
    const NODE = {}, ADJ = {};
    function node(n, x, z, face) { NODE[n] = { x: lx(x), z: lz(z), face: face == null ? null : face }; ADJ[n] = ADJ[n] || []; }
    function nodeW(n, x, z, face) { NODE[n] = { x: x, z: z, face: face == null ? null : face }; ADJ[n] = ADJ[n] || []; }
    function edge(a, b) { ADJ[a].push(b); ADJ[b].push(a); }
    node('reg', 3.0, 4.0, Math.PI); node('stool', 4.6, 4.4, Math.PI); node('hall', 1.0, 5.2);
    node('doorin', -4.0, 5.4); node('doorout', -4.0, 8.3); node('jerry', -1.9, 5.6, 0);
    node('shelfS', -1.4, 1.9, Math.PI); node('shelfAisle', -1.4, -1.0, -Math.PI / 2); node('fridge', -4.7, -3.0, -Math.PI / 2);
    node('aisle', 0.9, -2.8); node('bdoor', 2.5, -3.2); node('bedroom', 2.6, -4.8); node('bedside', 4.75, -5.3, Math.PI);
    nodeW('yard', X + 16.5, Z - 10); nodeW('lane', X + 2, Z - 10, 0); nodeW('cust', X + 2, Z - 10, 0);
    edge('reg', 'hall'); edge('reg', 'stool'); edge('hall', 'doorin'); edge('hall', 'jerry'); edge('hall', 'shelfS'); edge('hall', 'aisle');
    edge('doorin', 'doorout'); edge('doorin', 'fridge'); edge('doorout', 'yard'); edge('yard', 'lane'); edge('lane', 'cust');
    edge('shelfS', 'shelfAisle'); edge('aisle', 'bdoor'); edge('bdoor', 'bedroom'); edge('bedroom', 'bedside');
    function nearestNode(x, z) { let b = 'reg', bd = 1e9; Object.keys(NODE).forEach(function (k) { if (k === 'cust' || k === 'tmp') return; const d = Math.hypot(NODE[k].x - x, NODE[k].z - z); if (d < bd) { bd = d; b = k; } }); return b; }
    function route(from, to) {
        if (from === to) return [to];
        const prev = {}, q = [from]; prev[from] = null;
        while (q.length) { const c = q.shift(); if (c === to) break; ADJ[c].forEach(function (n) { if (!(n in prev)) { prev[n] = c; q.push(n); } }); }
        if (!(to in prev)) return [to];
        const out = []; for (let n = to; n; n = prev[n]) out.unshift(n); return out;
    }

    const bedPos = { x: lx(4.75), z: lz(-6.3), y: FY + 0.5 };
    const L = {
        x: NODE.reg.x, z: NODE.reg.z, y: FY, heading: Math.PI, anim: 'idle', state: 'idle', mode: 'register', modeUntil: 90,
        path: [], onArrive: null, faceTo: Math.PI, hurry: false, until: 0, after: null, talkUntil: 0, onBed: false,
        cust: null, carry: null, carryT: 0, greeted: false, sitting: false, dwellUntil: 0, tidyI: 0, fatigue: 0.2, visible: true
    };
    const queue = [], seen = {};
    let vehMap = {}; const fake = [];

    function goTo(name, cb) {
        L.path = route(nearestNode(L.x, L.z), name); L.onArrive = cb || null; L.state = 'moving'; L.sitting = false; L.faceTo = null;
        if (L.path.length > 1 && Math.hypot(NODE[L.path[0]].x - L.x, NODE[L.path[0]].z - L.z) < 0.6) L.path.shift();
    }
    function act(anim, secs, after) { L.state = 'busy'; L.anim = anim; L.until = clock + secs; L.after = after || null; }
    function turnTo(a, dt, rate) { L.heading += normAng(a - L.heading) * Math.min(1, dt * rate); }
    function say(text, ms) {
        ms = ms || 3500; L.talkUntil = clock + ms / 1000;
        if (host.say) { try { host.say('lou', text, ms); return; } catch (e) { /* retombe sur la légende */ } }
        if (PL && Math.hypot(PL.x - L.x, PL.z - L.z) < 28) showCap(text);
    }
    function emit(detail) {
        ledger.sales.push(detail); if (ledger.sales.length > 80) ledger.sales.shift();
        try { if (host.onSale) host.onSale(detail); } catch (e) { /* ignore */ }
        try { if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('bt-gas-sale', { detail: detail })); } catch (e) { /* ignore */ }
    }
    function charge(buyer, total, why) { try { return host.charge ? host.charge(buyer, total, why) : true; } catch (e) { return true; } }

    // ----- modes (« comme il veut ») -----
    function pickMode() {
        const f = Math.max(0, L.fatigue);
        const w = { register: 3, pumps: 2, tidy: 1.2, rest: 1.4, sleep: Math.max(0, (f - 0.5) * 8) };
        if (L.mode === 'away') return;
        delete w[L.mode];
        let tot = 0; Object.keys(w).forEach(function (k) { tot += w[k]; });
        let r = Math.random() * tot, m = 'register';
        Object.keys(w).forEach(function (k) { if (r >= 0 && r < w[k]) m = k; r -= w[k]; });
        setMode(m);
    }
    function setMode(m) {
        if (['register', 'pumps', 'tidy', 'rest', 'sleep', 'away'].indexOf(m) === -1) return 'Unknown mode. Use register, pumps, tidy, rest, sleep or away.';
        if (L.state === 'asleep' && m !== 'sleep') wake('rested');
        L.mode = m; L.visible = m !== 'away';
        const secs = m === 'sleep' ? cfg.sleepMinSec + Math.random() * (cfg.sleepMaxSec - cfg.sleepMinSec) : m === 'away' ? 1e9 : 50 + Math.random() * 90;
        L.modeUntil = clock + secs; L.dwellUntil = 0;
        if (L.state === 'idle') { L.path = []; }
        return 'ok';
    }
    function lieDown() {
        L.state = 'asleep'; L.onBed = true; L.x = bedPos.x; L.z = bedPos.z; L.y = bedPos.y + cfg.sleepYOffset; L.heading = cfg.sleepHeading; L.anim = 'sleep'; L.faceTo = null;
    }
    function wake(reason) {
        if (L.state !== 'asleep') return;
        if (reason === 'bell') say(pick(LINES.bell)); else if (reason === 'engine') say(pick(LINES.engine));
        act('sit', 1.6, function () {
            L.onBed = false; L.x = NODE.bedside.x; L.z = NODE.bedside.z; L.y = FY;
            L.mode = 'register'; L.modeUntil = clock + 60 + Math.random() * 60; L.hurry = reason !== 'rested'; L.state = 'idle'; L.path = [];
        });
    }

    // ----- clients de la pompe : il va à la voiture, demande les litres, prend le pistolet, le met dans le réservoir, sert, encaisse -----
    const tanks = {}, REACH = 6.0;            // REACH : longueur utile du tuyau (m)
    function tankOf(v) {                      // réservoir du véhicule (objects/fuel.js) ; sinon un réservoir interne pour que ça marche déjà
        if (v.tank && v.tank.cap != null) return v.tank;
        return tanks[v.id] || (tanks[v.id] = { cap: v.tankCap || 50, level: (v.tankCap || 50) * (0.1 + Math.random() * 0.3) });
    }
    function freeOf(v) { const t = tankOf(v); return Math.max(0, t.cap - t.level); }
    function addFuel(v, dl) {
        if (v.refuel) { try { v.refuel(dl); return; } catch (e) { /* retombe sur le réservoir */ } }
        const t = tankOf(v); t.level = Math.min(t.cap, t.level + dl);
    }
    // où est la trappe d'essence ? cap du véhicule + décalage (fuelPort : x = côté, y = hauteur, z = avant(+)/arrière(−)) ; il choisit le côté de la pompe
    function portOf(v, pi) {
        const p = pumpsW[pi], fp = v.fuelPort || {};
        const off = fp.x != null ? Math.abs(fp.x) : 0.95, yo = fp.y != null ? fp.y : 0.75, zo = fp.z != null ? fp.z : -1.5;
        if (v.heading == null || !isFinite(v.heading)) {          // pas de cap connu : on vise le côté de la pompe
            const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz) || 1;
            return { x: v.x + dx / d * off, y: Y + yo, z: v.z + dz / d * off };
        }
        const fX = Math.sin(v.heading), fZ = Math.cos(v.heading), leftX = Math.cos(v.heading), leftZ = -Math.sin(v.heading);
        let best = null, bd = 1e9;
        [1, -1].forEach(function (sd) {
            if (fp.side === 'left' && sd < 0) return; if (fp.side === 'right' && sd > 0) return;
            const x = v.x + fX * zo + leftX * sd * off, z = v.z + fZ * zo + leftZ * sd * off, d = Math.hypot(x - p.x, z - p.z);
            if (d < bd) { bd = d; best = { x: x, y: Y + yo, z: z }; }
        });
        return best;
    }
    function standOf(port, pi) { const p = pumpsW[pi]; const dx = p.x - port.x, dz = p.z - port.z, d = Math.hypot(dx, dz) || 1; return { x: port.x + dx / d * 0.9, z: port.z + dz / d * 0.9 }; }
    function pumpStand(pi) { const p = pumpsW[pi]; return { x: p.x + p.side * 0.95, z: p.z + 0.35 }; }
    function goDirect(x, z, face, cb) { NODE.tmp = { x: x, z: z, face: face == null ? null : face }; L.path = ['tmp']; L.onArrive = cb || null; L.state = 'moving'; L.sitting = false; L.faceTo = null; }
    function carryTick(dt) {                  // le pistolet suit sa main, le tuyau suit le pistolet
        if (L.carry == null) return;
        const hx = L.x + Math.sin(L.heading) * 0.28, hz = L.z + Math.cos(L.heading) * 0.28;
        setNozzle(L.carry, { x: hx, y: L.y + 1.0, z: hz }, L.heading, 0.5);
        L.carryT -= dt; if (L.carryT <= 0) { L.carryT = 0.04; setHose(L.carry, { x: hx, y: L.y + 0.95, z: hz }); }
    }
    function startCustomer() {
        const c = queue.shift(), v = vehMap[c.id]; if (!v) return;
        c.port = portOf(v, c.pump); c.stand = standOf(c.port, c.pump); L.cust = c; c.step = 'go'; L.hurry = c.t > 6;
        NODE.cust.x = c.stand.x; NODE.cust.z = c.stand.z; NODE.cust.face = null;
        goTo('cust', function () { custArrive(c); });
    }
    function custArrive(c) {
        const v = vehMap[c.id]; if (!v) return finishCust();
        c.port = portOf(v, c.pump); L.faceTo = Math.atan2(c.port.x - L.x, c.port.z - L.z);
        const p = pumpsW[c.pump];
        if (Math.hypot(p.hoseStart.x - c.port.x, p.hoseStart.z - c.port.z) > REACH) { say('Pull up closer to the pump.', 4000); c.step = 'close'; c.t0 = clock; L.state = 'cust'; L.anim = 'idle'; return; }
        c.step = 'greet'; say(pick(LINES.car));
        act('greet', 1.6, function () { askLiters(c); });
    }
    function askLiters(c) {
        const v = vehMap[c.id]; if (!v) return finishCust();
        const free = Math.floor(freeOf(v));
        if (free < 1) { say('It’s already full.'); return finishCust(); }
        if (v.isPlayer) { c.step = 'order'; c.t0 = clock; c.free = free; L.state = 'cust'; L.anim = 'idle'; openOrder(c); }
        else { c.liters = v.wantLiters ? v.wantLiters(free) : Math.max(1, Math.round(free * (0.6 + Math.random() * 0.4))); startFuel(c); }   // l'avatar choisit ses litres (v.wantLiters)
    }
    function fullAmount(v) { return v ? Math.max(1, Math.floor(freeOf(v))) : cfg.defaultTank; }
    function startFuel(c) {
        const v = vehMap[c.id]; if (!v) return finishCust();
        c.liters = Math.min(Math.floor(c.liters || 0), Math.floor(freeOf(v)), Math.floor(ledger.fuelStock));
        if (c.liters <= 0) { say(pick(LINES.never)); return finishCust(); }
        c.step = 'toPump'; c.done = 0; c.price = cfg.fuelPerLiter;
        const ps = pumpStand(c.pump), pw = pumpsW[c.pump];
        goDirect(ps.x, ps.z, Math.atan2(pw.x - ps.x, pw.z - ps.z), function () {
            c.step = 'take'; drawPump(c.pump, '0.00', '0.00', fmt(c.price) + ' / L'); click(0.6);
            act('work', 1.0, function () { L.carry = c.pump; c.step = 'toCar'; goDirect(c.stand.x, c.stand.z, null, function () { arriveCar(c); }); });
        });
    }
    function arriveCar(c) {
        const v = vehMap[c.id]; if (!v) return finishCust();
        c.port = portOf(v, c.pump); L.faceTo = Math.atan2(c.port.x - L.x, c.port.z - L.z);
        act('work', 0.9, function () {            // il enfonce le pistolet dans le réservoir
            const q = c.port, dx = v.x - q.x, dz = v.z - q.z;
            L.carry = null; setNozzle(c.pump, q, Math.atan2(-dz, dx), Math.PI / 2); setHose(c.pump, { x: q.x, y: q.y + 0.02, z: q.z }); click(0.7);
            c.step = 'fuel'; c.prog = 0; c.drawT = 0; L.state = 'cust'; L.anim = 'work';
        });
    }
    function endFuel(c) {
        const total = c.done * c.price, v = vehMap[c.id];
        drawPump(c.pump, c.done.toFixed(2), fmt(total), fmt(c.price) + ' / L'); click(0.7);
        ledger.fuelStock -= c.done; c.total = total; c.buyer = v && v.isPlayer ? 'player' : c.id; c.step = 'back';
        act('work', 0.9, function () {            // il retire le pistolet et le rapporte à la pompe
            L.carry = c.pump;
            const ps = pumpStand(c.pump), pw = pumpsW[c.pump];
            goDirect(ps.x, ps.z, Math.atan2(pw.x - ps.x, pw.z - ps.z), function () { act('work', 0.8, function () { L.carry = null; nozzleHome(c.pump); bill(c); }); });
        });
    }
    function bill(c) {
        if (c.done < 0.05) return finishCust();
        const ok = charge(c.buyer, c.total, 'fuel');
        if (ok === false) { say('You can’t pay? Then you owe me ' + fmt(c.total) + '. I’ll remember that.', 5000); emit({ kind: 'fuel', buyer: c.buyer, liters: +c.done.toFixed(2), total: c.total, paid: false }); }
        else { ledger.till += c.total; say(c.done.toFixed(1) + ' liters. That’s ' + fmt(c.total) + '. Drive safe.', 4500); emit({ kind: 'fuel', buyer: c.buyer, liters: +c.done.toFixed(2), total: c.total, paid: true }); }
        act('greet', 2.2, function () { finishCust(); });
    }
    function finishCust() {
        const c = L.cust;
        if (c) { nozzleHome(c.pump); pumpIdle(c.pump); (seen[c.id] || (seen[c.id] = { t: 0, cd: 0, last: clock })).cd = cfg.carCooldownSec; }
        closePanel(); L.cust = null; L.carry = null; L.state = 'idle'; L.anim = 'idle'; L.faceTo = null;
    }
    function custTick(dt) {
        const c = L.cust; if (!c) { L.state = 'idle'; return; }
        const v = vehMap[c.id];
        if (c.step === 'close') {                 // trop loin du tuyau : il attend que la voiture avance
            if (!v || clock - c.t0 > 30) { say(pick(LINES.never)); finishCust(); return; }
            c.port = portOf(v, c.pump); const pw = pumpsW[c.pump];
            if (Math.hypot(pw.hoseStart.x - c.port.x, pw.hoseStart.z - c.port.z) <= REACH && (v.speed || 0) < cfg.carStopSpeed) {
                c.stand = standOf(c.port, c.pump); goDirect(c.stand.x, c.stand.z, null, function () { custArrive(c); });
            }
        } else if (c.step === 'order') {
            L.anim = 'idle'; if (L.faceTo != null) turnTo(L.faceTo, dt, 5);
            if (c.chosen) { if (c.liters > 0) startFuel(c); else { say(pick(LINES.never)); finishCust(); } return; }
            if (!v || Math.hypot(v.x - pumpsW[c.pump].x, v.z - pumpsW[c.pump].z) > cfg.carRadius + 4) { say(pick(LINES.never)); finishCust(); return; }
            if (clock - c.t0 > cfg.orderTimeoutSec) { say('Alright, then.'); finishCust(); }
        } else if (c.step === 'fuel') {
            if (!v) { c.liters = c.done; endFuel(c); return; }                  // la voiture est partie pendant le plein
            const remain = c.liters - c.done; c.prog += dt;
            let flow = cfg.flowLitersPerSec * Math.min(1, 0.3 + c.prog / 1.5); if (remain < 2) flow *= Math.max(0.25, remain / 2);   // débit qui monte, puis ralentit à la fin
            const dl = Math.min(remain, flow * dt); c.done += dl; addFuel(v, dl);
            if (L.faceTo != null) turnTo(L.faceTo, dt, 5);
            c.drawT -= dt; if (c.drawT <= 0) { c.drawT = 0.08; drawPump(c.pump, c.done.toFixed(2), fmt(c.done * c.price), fmt(c.price) + ' / L'); }
            if (c.liters - c.done <= 0.005) { c.done = c.liters; endFuel(c); }
        }
    }
    function vehicleTick(dt) {
        let list = []; try { list = host.vehicles ? host.vehicles() || [] : []; } catch (e) { list = []; }
        list = list.concat(fake); vehMap = {};
        list.forEach(function (v) {
            vehMap[v.id] = v;
            let best = 0, bd = 1e9; pumpsW.forEach(function (p, i) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd) { bd = d; best = i; } });
            const st = seen[v.id] || (seen[v.id] = { t: 0, cd: 0, last: clock }); st.last = clock;
            if (st.cd > 0) { st.cd -= dt; if (bd > 15) st.cd = 0; }
            const busyWith = (L.cust && L.cust.id === v.id) || queue.some(function (q) { return q.id === v.id; });
            if (bd < cfg.carRadius && (v.speed || 0) < cfg.carStopSpeed && st.cd <= 0 && !busyWith && L.mode !== 'away' && freeOf(v) >= 1) {
                st.t += dt; if (st.t >= cfg.carStopSec) { queue.push({ id: v.id, pump: best, t: 0 }); st.t = 0; }
            } else st.t = 0;
        });
        for (let i = queue.length - 1; i >= 0; i--) {
            const q = queue[i], v = vehMap[q.id]; q.t += dt;
            if (!v || Math.hypot(v.x - pumpsW[q.pump].x, v.z - pumpsW[q.pump].z) > cfg.carRadius + 3) queue.splice(i, 1);
        }
        Object.keys(seen).forEach(function (k) { if (clock - seen[k].last > 30 && !vehMap[k]) delete seen[k]; });
    }

    // ----- Lou : une image -----
    function louTick(dt) {
        const awake = L.state !== 'asleep';
        L.fatigue += (awake ? dt / (cfg.fatigueFullMin * 60) : -dt / 360);
        L.fatigue = Math.max(0, Math.min(1.5, L.fatigue));
        // déplacement
        if (L.path.length) {
            const n = NODE[L.path[0]], dx = n.x - L.x, dz = n.z - L.z, d = Math.hypot(dx, dz), sp = L.hurry ? cfg.runSpeed : cfg.walkSpeed;
            L.anim = L.hurry ? 'run' : 'walk';
            if (d <= sp * dt + 0.05) {
                L.x = n.x; L.z = n.z; L.path.shift();
                if (!L.path.length) { L.faceTo = n.face; L.hurry = false; const cb = L.onArrive; L.onArrive = null; L.state = 'idle'; L.anim = 'idle'; if (cb) cb(); }
            } else { L.x += dx / d * sp * dt; L.z += dz / d * sp * dt; turnTo(Math.atan2(dx, dz), dt, 10); }
        }
        L.y = L.onBed ? L.y : (inShopXZ(L.x, L.z) ? FY : Y);
        carryTick(dt);
        if (L.path.length) return;
        if (L.state === 'busy') { if (L.faceTo != null) turnTo(L.faceTo, dt, 5); if (clock >= L.until) { const f = L.after; L.after = null; L.state = 'idle'; L.anim = 'idle'; if (f) f(); } return; }
        if (L.state === 'cust') { custTick(dt); return; }
        if (L.state === 'asleep') {
            L.anim = 'sleep';
            if (queue.length && queue[0].t > cfg.engineWakeSec) wake('engine');
            else if (clock > L.modeUntil) wake('rested');
            return;
        }
        if (L.state === 'moving') { L.state = 'idle'; }
        // --- idle ---
        L.anim = L.talkUntil > clock ? 'talk' : 'idle';
        if (L.faceTo != null) turnTo(L.faceTo, dt, 5);
        if (L.mode === 'away') { L.visible = false; return; }
        const wantsAction = queue.length > 0;
        if (L.sitting && (wantsAction || (PL && inShopXZ(PL.x, PL.z)))) { L.sitting = false; act('idle', 0.8, null); return; }
        if (wantsAction) { startCustomer(); return; }
        const inside = PL && inShopXZ(PL.x, PL.z);
        if (!inside && PL && Math.hypot(PL.x - SX, PL.z - SZ) > 14) L.greeted = false;
        if (inside && !L.greeted && L.mode !== 'sleep') {
            L.greeted = true;
            const hello = function () { if (PL) L.faceTo = Math.atan2(PL.x - L.x, PL.z - L.z); say(pick(LINES.welcome)); act('greet', 1.8, null); };
            if (Math.hypot(L.x - NODE.reg.x, L.z - NODE.reg.z) < 1.0) hello(); else goTo('reg', hello);
            return;
        }
        const em = inside && L.mode !== 'sleep' ? 'register' : L.mode;
        if (clock > L.modeUntil && !inside) { pickMode(); return; }
        const dReg = Math.hypot(L.x - NODE.reg.x, L.z - NODE.reg.z);
        if (em === 'register') { if (dReg > 0.8) goTo('reg'); }
        else if (em === 'rest') {
            if (Math.hypot(L.x - NODE.stool.x, L.z - NODE.stool.z) > 0.4) goTo('stool', function () { L.sitting = true; });
            else { L.sitting = true; L.anim = 'sit'; }
        }
        else if (em === 'pumps') { if (Math.hypot(L.x - NODE.lane.x, L.z - NODE.lane.z) > 1.0) goTo('lane'); else L.faceTo = 0; }
        else if (em === 'tidy') {
            if (L.dwellUntil === 0) L.dwellUntil = clock + 6 + Math.random() * 6;
            if (clock > L.dwellUntil) { L.dwellUntil = 0; L.tidyI = (L.tidyI + 1) % 4; const t = ['jerry', 'shelfS', 'shelfAisle', 'fridge'][L.tidyI]; goTo(t); }
            else if (Math.hypot(L.x - NODE[['jerry', 'shelfS', 'shelfAisle', 'fridge'][L.tidyI]].x, L.z - NODE[['jerry', 'shelfS', 'shelfAisle', 'fridge'][L.tidyI]].z) > 1.0) goTo(['jerry', 'shelfS', 'shelfAisle', 'fridge'][L.tidyI]);
        }
        else if (em === 'sleep') { if (Math.hypot(L.x - NODE.bedside.x, L.z - NODE.bedside.z) > 0.5) goTo('bedside', function () { act('sit', 1.0, lieDown); }); else act('sit', 1.0, lieDown); }
    }

    // ==========================================
    // INTERFACE : légende, commande à la pompe, boutique à la caisse
    // ==========================================
    let ui = null, pendingOrder = null, cart = {};
    function ensureUI() {
        if (ui) return ui;
        if (typeof document === 'undefined' || !document.body || !document.head) return null;
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        const btn = document.createElement('button'); btn.className = 'bt-gas-btn'; btn.textContent = 'Buy — Lou’s register';
        const panel = document.createElement('div'); panel.className = 'bt-gas-panel'; panel.style.display = 'none';
        const cap = document.createElement('div'); cap.className = 'bt-gas-cap';
        document.body.appendChild(btn); document.body.appendChild(panel); document.body.appendChild(cap);
        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function (ev) { panel.addEventListener(ev, function (e) { e.stopPropagation(); }); btn.addEventListener(ev, function (e) { e.stopPropagation(); }); });
        btn.addEventListener('click', openShop); panel.addEventListener('click', onPanelClick);
        ui = { btn: btn, panel: panel, cap: cap, mode: '', capT: 0 };
        return ui;
    }
    function showCap(text) { const u = ensureUI(); if (!u) return; u.cap.textContent = 'Lou: ' + text; u.cap.style.display = 'block'; clearTimeout(u.capT); u.capT = setTimeout(function () { u.cap.style.display = 'none'; }, 4200); }
    function exitLock() { try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ } }
    function closePanel() { if (!ui) return; ui.panel.style.display = 'none'; ui.mode = ''; pendingOrder = null; }
    function openOrder(c) {
        const u = ensureUI(); if (!u) { c.liters = cfg.defaultTank; c.chosen = true; return; }
        exitLock(); pendingOrder = c; u.mode = 'order';
        u.panel.innerHTML = '<div class="bt-gas-h">Lou: “How many liters?”<span>Fuel ' + fmt(cfg.fuelPerLiter) + ' / L</span></div>' +
            '<div><button data-l="10">10 L</button><button data-l="20">20 L</button><button data-l="40">40 L</button><button data-l="full">Fill up</button></div>' +
            '<div class="bt-gas-t"><input type="number" min="1" max="200" placeholder="liters"><button data-a="ok">OK</button><button data-a="no">No thanks</button></div>';
        u.panel.style.display = 'block';
    }
    function openShop() {
        const u = ensureUI(); if (!u || L.state === 'asleep') return;
        exitLock(); cart = {}; u.mode = 'shop'; renderShop(); u.panel.style.display = 'block';
    }
    function cartTotal() { let t = 0; GAS_CATALOG.forEach(function (i) { t += (cart[i.id] || 0) * i.price; }); return t; }
    function renderShop() {
        let h = '<div class="bt-gas-h">Lou’s shop<span>Prices are high — nobody else is open around here</span></div>';
        RAYON_ORDER.forEach(function (rk) {
            const items = GAS_CATALOG.filter(function (i) { return i.rayon === rk; }); if (!items.length) return;
            h += '<div class="bt-gas-r">' + RAYONS[rk].label + '</div>';
            items.forEach(function (i) { h += '<div class="bt-gas-row"><span>' + i.name + '</span><b>' + fmt(i.price) + '</b><button data-a="-" data-id="' + i.id + '">−</button><i>' + (cart[i.id] || 0) + '</i><button data-a="+" data-id="' + i.id + '">+</button></div>'; });
        });
        h += '<div class="bt-gas-t"><span>Total ' + fmt(cartTotal()) + '</span><button data-a="pay">Pay</button><button data-a="close">Close</button></div>';
        const keep = ui.panel.scrollTop; ui.panel.innerHTML = h; ui.panel.scrollTop = keep;
    }
    function onPanelClick(e) {
        const b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !ui) return;
        const a = b.getAttribute('data-a'), id = b.getAttribute('data-id'), l = b.getAttribute('data-l');
        if (ui.mode === 'order') {
            const c = pendingOrder; if (!c) return;
            if (l) { c.liters = l === 'full' ? fullAmount(vehMap[c.id]) : +l; c.chosen = true; closePanel(); }
            else if (a === 'ok') { const inp = ui.panel.querySelector('input'); const n = Math.floor(+(inp && inp.value)); if (n > 0) { c.liters = Math.min(n, 200); c.chosen = true; closePanel(); } }
            else if (a === 'no') { c.liters = 0; c.chosen = true; closePanel(); }
        } else if (ui.mode === 'shop') {
            if (a === '+') cart[id] = (cart[id] || 0) + 1;
            else if (a === '-') cart[id] = Math.max(0, (cart[id] || 0) - 1);
            else if (a === 'close') { closePanel(); return; }
            else if (a === 'pay') { payShop(); return; }
            renderShop();
        }
    }
    function payShop() {
        const lines = GAS_CATALOG.filter(function (i) { return cart[i.id] > 0; }).map(function (i) { return { id: i.id, name: i.name, qty: cart[i.id], price: i.price }; });
        const total = cartTotal(); closePanel(); if (!lines.length) return;
        const ok = charge('player', total, 'shop');
        if (ok === false) { say('You don’t have enough. Put something back.'); return; }
        ledger.till += total; say('That’ll be ' + fmt(total) + '. Thanks.');
        emit({ kind: 'shop', buyer: 'player', lines: lines, total: total, paid: true });
        if (L.state === 'idle') act('work', 2.6, null);
    }
    function uiTick() {
        const u = ensureUI(); if (!u) return;
        const near = PL && inShopXZ(PL.x, PL.z) && Math.hypot(PL.x - lx(3.0), PL.z - lz(2.0)) < 2.8 && L.state !== 'asleep' && L.mode !== 'away';
        const atReg = Math.hypot(L.x - NODE.reg.x, L.z - NODE.reg.z) < 1.6;
        u.btn.style.display = near && u.mode === '' && atReg ? 'block' : 'none';
        if (u.mode === 'shop' && !near) closePanel();
    }

    // ==========================================
    // update (à appeler à chaque image : update(dt, ctx) ; ctx.camera ou env.camera donne la position du joueur)
    // ==========================================
    function playerPos(ctx) {
        let c = null;
        try { c = host.player ? host.player() : null; } catch (e) { c = null; }
        c = c || (ctx && (ctx.camera || ctx.player)) || env.camera || env.player || (typeof window !== 'undefined' ? window.BadTherapistCamera : null);
        if (!c) return null;
        let p = c.position || c; if (!p || !isFinite(p.x)) return null;
        if (scene.worldToLocal && p.isVector3) p = scene.worldToLocal(p.clone());
        return { x: p.x, y: p.y, z: p.z };
    }
    function doorTick(dt) {
        const vis = [{ x: L.x, z: L.z, lou: true }];
        if (PL) vis.push({ x: PL.x, z: PL.z, lou: false });
        if (host.visitors) { try { host.visitors().forEach(function (v) { vis.push({ x: v.x, z: v.z, lou: false }); }); } catch (e) { /* ignore */ } }
        const out = { x: lx(-4.0), z: lz(7.7) }, inn = { x: lx(-4.0), z: lz(6.1) };
        let near = false;
        vis.forEach(function (v) {
            const d = Math.min(Math.hypot(v.x - out.x, v.z - out.z), Math.hypot(v.x - inn.x, v.z - inn.z));
            if (d < 1.7) { near = true; if (!v.lou) door.foreign = true; }
        });
        if (near) door.hold = 1.4; else door.hold -= dt;
        const target = door.hold > 0 ? 1 : 0, prev = door.open;
        door.open += Math.sign(target - door.open) * Math.min(Math.abs(target - door.open), dt * 2.2);
        if (prev < 0.08 && door.open >= 0.08 && door.foreign) { door.ringed = true; ring(false); }
        else if (prev >= 0.08 && door.open < 0.08 && door.ringed) { door.ringed = false; ring(true); }
        if (door.open <= 0.001) door.foreign = false;
        doorG.rotation.y = door.open * 1.45;
        bellAmp = Math.max(bellAmp, Math.min(0.8, Math.abs(door.open - prev) / Math.max(dt, 0.001) * 0.5));
        bellT += dt;
        bells.forEach(function (b, i) { b.rotation.z = Math.sin(bellT * (17 + i * 2.5) + i) * bellAmp; b.rotation.x = Math.cos(bellT * (13 + i * 3)) * bellAmp * 0.5; });
        bellAmp = bellAmp > 0.004 ? bellAmp * Math.exp(-dt * 2.2) : 0;
    }
    let lastT = 0;
    function update(_dt, ctx) {                  // chronomètre lui-même : peu importe ce que l'appelant passe en 1er argument
        const nowS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const dt = lastT ? nowS - lastT : 0.016; lastT = nowS;
        if (dt < 0.0005) return;                // double appel dans la même image
        tick(Math.min(dt, 0.1), ctx);
    }
    function tick(dt, ctx) {
        clock += dt;
        PL = playerPos(ctx);
        doorTick(dt); vehicleTick(dt); louTick(dt); uiTick();
        const asleep = L.state === 'asleep', away = L.mode === 'away';
        signOpen.visible = !asleep && !away; signRing.visible = asleep && !away; signClosed.visible = away;
    }

    // ==========================================
    // API pour le reste du jeu (avatar-body.js, society.js, outside.js)
    // ==========================================
    const api = {
        update: update, tick: tick, config: cfg, catalog: GAS_CATALOG, ledger: ledger,
        attach: function (h) { Object.assign(host, h || {}); return api; },
        attachDefaults: function (h) { Object.keys(h || {}).forEach(function (k) { if (!host[k]) host[k] = h[k]; }); return api; },   // ne remplace pas ce que outside.js a déjà branché      // { say(id,text,ms), charge(buyer,total,why)->bool, vehicles()->[{id,x,z,speed,isPlayer,tank,refuel}], visitors(), onSale(detail), player() }
        controls: function (actor) { return !actor || (!actor.travel && !actor.ride); },      // Lou est toujours à son poste (setMode('away') pour l'envoyer ailleurs)
        pose: function () { return { x: L.x, y: L.y, z: L.z, heading: normAng(L.heading), anim: L.state === 'moving' && !L.path.length ? 'idle' : L.anim, visible: L.visible }; },
        status: function () { return 'Lou (' + L.mode + ', ' + L.state + (L.cust ? ', serving a car' : '') + ', tired ' + Math.round(Math.min(1, L.fatigue) * 100) + '%).'; },
        setMode: setMode, wake: function () { wake('bell'); }, ring: ring,
        isAsleep: function () { return L.state === 'asleep'; },
        bed: bedPos,
        test: {                                                                    // tests dans la console (F12)
            car: function (pump, isPlayer, heading) { const p = pumpsW[pump || 0]; const v = { id: 'test' + Math.floor(Math.random() * 1e6), x: p.x + 2.4, z: p.z, heading: heading == null ? 0 : heading, speed: 0, isPlayer: !!isPlayer, tank: { cap: 50, level: 8 } }; fake.push(v); return v.id; },
            leave: function () { fake.length = 0; }
        }
    };
    if (typeof window !== 'undefined') window.BadTherapistGas = api;
    return api;
}
