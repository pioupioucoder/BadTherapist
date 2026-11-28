import * as THREE from 'three';
import { PLACES } from './monde.js'
import { mats, box, glow, lampPost, signMaterial } from './outils.js';
import lou from '../npcs/lou.js';
import { makeSleepable } from '../objects/sleepable.js';

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
    fuelPerLiter: 1,            // 1 pièce le litre (l'argent du jeu est entier : une livraison rapporte 3 à 10)
    creditLimit: 30,            // Lou laisse le joueur descendre jusqu'à -30 (dette) ; au-delà : « no more credit »
    jerryLiters: 10,            // un bidon plein = 10 L (la même valeur est dans engine/items.js : CAN_LITERS)
    jerryPrice: 12,             // bidon + 10 L ; le remplir quand on a un bidon vide coûte jerryLiters × fuelPerLiter = 10
    bedQuality: 0.9,            // qualité du sommeil dans le lit de Lou (1 = lit normal)
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

// ---------- rayons & catalogue (prix en pièces, entiers : le joueur gagne 3 à 10 pièces par livraison) ----------
const RAYONS = {
    food:    { label: 'FOOD',      colors: [0xb8452f, 0xd9b44a, 0x5a8a46, 0xc9b79a, 0x8a5a3a], hMin: 0.12, hMax: 0.22, items: [['canned soup', 3], ['canned beans', 3], ['pasta', 3], ['bread', 2], ['rice 1 kg', 4]] },
    snacks:  { label: 'SNACKS',    colors: [0xd9382f, 0xf0c43a, 0x2f7fd9, 0x8a3ad9, 0xe86a1f], hMin: 0.18, hMax: 0.3,  items: [['chips', 2], ['chocolate bar', 2], ['biscuits', 2], ['peanuts', 3]] },
    drinks:  { label: 'DRINKS',    colors: [0x2f8fd9, 0x3ab87a, 0xd9382f, 0xe8e8e8, 0xd9a02f], hMin: 0.2,  hMax: 0.32, items: [['water 0.5 L', 1], ['soda', 2], ['orange juice', 3], ['energy drink', 3]] },
    car:     { label: 'CAR',       colors: [0x2a2a2a, 0xd9b42f, 0x2f5fd9, 0x9a9a9a, 0xd9382f], hMin: 0.2,  hMax: 0.34, items: [['engine oil 1 L', 8], ['washer fluid', 5], ['antifreeze', 7], ['ice scraper', 4], ['wiper blades', 10], ['snow chains', 30]] },
    home:    { label: 'SUPPLIES',  colors: [0xe8e0c8, 0x3a7a3a, 0xd9382f, 0x6a6a8a, 0xc8c8c8], hMin: 0.14, hMax: 0.28, items: [['batteries (4)', 5], ['flashlight', 9], ['matches', 2], ['lighter', 2], ['candles (6)', 3], ['first aid kit', 12], ['wool blanket', 14]] },
    counter: { label: 'COUNTER',   colors: [0xe8e0c8], hMin: 0.1, hMax: 0.2, items: [['coffee', 3], ['tea', 2], ['hot soup cup', 4]] },
    cans:    { label: 'FUEL CANS', colors: [0xc0281c], hMin: 0.4,  hMax: 0.46, items: [] }
};
const RAYON_ORDER = ['food', 'snacks', 'drinks', 'car', 'home', 'counter', 'cans'];
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function fmt(n) { return String(Math.ceil(n - 1e-9)); }          // l'argent du jeu est entier : on arrondit toujours vers le haut

// Catalogue lisible par society.js : window.BadTherapistGas.catalog
export const GAS_CATALOG = [];
RAYON_ORDER.forEach(function (k) { RAYONS[k].items.forEach(function (it) { GAS_CATALOG.push({ id: slug(it[0]), name: it[0], price: it[1], rayon: k }); }); });
// le bidon plein est un OBJET d'inventaire (engine/items.js : « jerrycan »)
GAS_CATALOG.push({ id: 'jerrycan', name: 'jerrycan ' + GAS_CONFIG.jerryLiters + ' L, filled', price: GAS_CONFIG.jerryPrice, rayon: 'cans', liters: GAS_CONFIG.jerryLiters, item: 'jerrycan' });

// Les phrases de Lou sont dans npcs/lou.js (lou.service) ; ces valeurs ne servent que si une liste manque.
const SV = (lou && lou.service) || {};
const FALLBACK = { pump: ['How many liters?'], greet: ['Welcome.'], bell: ['Coming!'], engine: ['I hear an engine…'], never: ['Never mind, then.'], menu: ['What do you need?'], browse: ['Look around.'],
    confirm: ['That’s {total}. You sure?'], thanks: ['That’ll be {total}. Thanks.'], declined: ['Suit yourself.'], noCredit: ['No more credit.'], invFull: ['Your hands are full.'], fillOffer: ['Fill it for {total}?'],
    filled: ['Filled. {total}.'], noEmpty: ['You have no empty can.'], pumpBroke: ['No cash, no fuel.'], full: ['It’s already full.'], canTip: ['Careful with it.'],
    greetBroke: ['Pockets empty?'], greetDebt: ['You still owe me.'], greetCan: ['Nice, a can.'], greetEmpty: ['I can fill that.'], greetLow: ['Thirsty engine.'] };
function lines(kind) { return (SV[kind] && SV[kind].length ? SV[kind] : FALLBACK[kind]) || ['...']; }
const LINES = { get car() { return lines('pump'); }, get welcome() { return lines('greet'); }, get bell() { return lines('bell'); }, get engine() { return lines('engine'); }, get never() { return lines('never'); } };
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

const CSS2 = '.bt-gas-say{font-style:italic;line-height:1.35;margin-bottom:2px}.bt-gas-ch{display:flex;flex-direction:column;align-items:stretch;gap:2px;margin-top:6px}.bt-gas-ch button{text-align:left}' +
    '.bt-gas-panel button:disabled{opacity:.35;cursor:default}.bt-gas-yn{display:flex;gap:8px;margin-top:10px}.bt-gas-yn button{flex:1;text-align:center;padding:10px}';

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

    // ---------- LUMIÈRE : les murs arrêtent les phares ----------
    // three.js n'a pas d'ombres ici : un phare éclaire donc l'intérieur À TRAVERS les murs. On apprend aux matériaux du magasin à ignorer
    // toute lumière (phare, lampadaire, gyrophare, soleil) dont la source est HORS du magasin quand le point éclairé est DANS le magasin.
    // Les lampes du plafond (dans le magasin) éclairent normalement ; la façade, vue de dehors, reste éclairée par les lampes de dehors.
    // Si l'intérieur te paraît trop sombre : BadTherapistGas.shopMask(false) rend l'ancien comportement (et dis-moi, j'ajoute une lampe).
    const MASK = { viewToShop: { value: new THREE.Matrix4() }, min: { value: new THREE.Vector3(-5.9, -0.15, -6.85) }, max: { value: new THREE.Vector3(5.9, WH + 0.05, 6.85) }, on: { value: 1 } };
    const LIGHT_CHUNK = (function () {
        const cut = function (call, pos) {
            return call + (pos ? ' if ( btIn ) { vec3 btL = ( uViewToShop * vec4( ' + pos + ', 1.0 ) ).xyz; if ( any( lessThan( btL, uShopMin ) ) || any( greaterThan( btL, uShopMax ) ) ) directLight.color = vec3( 0.0 ); }' : ' if ( btIn ) directLight.color = vec3( 0.0 );');
        };
        let c = THREE.ShaderChunk.lights_fragment_begin;
        c = c.replace('getPointDirectLightIrradiance( pointLight, geometry, directLight );', cut('getPointDirectLightIrradiance( pointLight, geometry, directLight );', 'pointLight.position'));
        c = c.replace('getSpotDirectLightIrradiance( spotLight, geometry, directLight );', cut('getSpotDirectLightIrradiance( spotLight, geometry, directLight );', 'spotLight.position'));
        c = c.replace('getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );', cut('getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );', null));
        return 'vec3 btFp = ( uViewToShop * vec4( - vViewPosition, 1.0 ) ).xyz;\n' +
            'bool btIn = uMaskOn > 0.5 && all( greaterThan( btFp, uShopMin ) ) && all( lessThan( btFp, uShopMax ) );\n' + c;
    })();
    function shopMask(mat) {
        mat.onBeforeCompile = function (sh) {
            sh.uniforms.uViewToShop = MASK.viewToShop; sh.uniforms.uShopMin = MASK.min; sh.uniforms.uShopMax = MASK.max; sh.uniforms.uMaskOn = MASK.on;
            sh.fragmentShader = 'uniform mat4 uViewToShop;\nuniform vec3 uShopMin;\nuniform vec3 uShopMax;\nuniform float uMaskOn;\n' + sh.fragmentShader.replace('#include <lights_fragment_begin>', LIGHT_CHUNK);
        };
        mat.customProgramCacheKey = function () { return 'bt-shopmask'; };
        return mat;
    }
    [mWall, mTrim, mWood, mWood2, mTop, mMetal, mRoof, mRug, mMat, mBlanket, mCrate, mFloor].forEach(shopMask);
    // la matrice « vue -> magasin » est recalculée JUSTE avant chaque image avec la vraie caméra de rendu
    const _sw = new THREE.Matrix4(), _st = new THREE.Matrix4(), _si = new THREE.Matrix4();
    function updateMask(cam) {
        if (!cam) return;
        scene.updateMatrixWorld && scene.updateMatrixWorld();
        _sw.copy(scene.matrixWorld || _sw.identity()).multiply(_st.makeTranslation(SX, FY, SZ));
        _si.copy(_sw).invert();
        MASK.viewToShop.value.copy(_si).multiply(cam.matrixWorld);
    }
    (function hookRoot() {
        const root = typeof window !== 'undefined' ? window.BTScene : null;
        if (!root || root.__btShopHook) return;
        root.__btShopHook = true;
        const prev = root.onBeforeRender;
        root.onBeforeRender = function (r, sc, cam, rt) { if (prev) prev.call(this, r, sc, cam, rt); try { updateMask(cam); } catch (e) { /* ignore */ } };
    })();

    // mk : boîte en repère LOCAL, y0 = bas de la boîte au-dessus du sol du magasin
    function mk(w, h, d, mat, x, y0, z, par) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(lx(x), FY + y0 + h / 2, lz(z)); (par || scene).add(m); return m;
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
    // écran de la caisse : il COMPTE l'achat en direct (rayon, quantités, total) ; une face vers le client (nord), une vers Lou (sud)
    const reg = { ctx: null, tex: null, dirty: true, t: 0 };
    mk(0.3, 0.18, 0.04, mTrim, 3.0, 1.24, 2.9);
    if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
        reg.ctx = cv.getContext('2d'); reg.tex = new THREE.CanvasTexture(cv);
        const sm = new THREE.MeshBasicMaterial({ map: reg.tex });
        const pS = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), sm); pS.position.set(lx(3.0), FY + 1.35, lz(2.9) + 0.03); pS.rotation.x = -0.3; scene.add(pS);
        const pN = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), sm); pN.position.set(lx(3.0), FY + 1.35, lz(2.9) - 0.03); pN.rotation.set(0.3, Math.PI, 0); scene.add(pN);
    }
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
    // le lit de Lou est un GROUPE : le joueur peut cliquer dessus pour dormir (objects/sleepable.js)
    const bedG = new THREE.Group(); scene.add(bedG);
    mk(2.1, 0.3, 1.0, mWood, 4.75, 0, -6.3, bedG); mk(2.0, 0.2, 0.92, mMat, 4.75, 0.3, -6.3, bedG); mk(0.4, 0.1, 0.6, mMat, 5.45, 0.5, -6.3, bedG); mk(1.2, 0.06, 0.96, mBlanket, 4.2, 0.5, -6.3, bedG); solid(3.7, 5.8, -6.8, -5.8);
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
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shopMask(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 })), prodList.length);
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
    // Le joueur paie avec la monnaie du jeu (BadTherapist.money.charge) : elle peut devenir NÉGATIVE (dette) jusqu'à creditLimit.
    // Les autres (avatars) paient par host.charge (outside.js / society.js).
    function charge(buyer, total, why, limit) {
        if (buyer === 'player') {
            const m = typeof window !== 'undefined' && window.BadTherapist ? window.BadTherapist.money : null;
            if (m) return m.charge ? m.charge(total, why, limit == null ? cfg.creditLimit : limit) : m.spend(total, why);
        }
        try { return host.charge ? host.charge(buyer, total, why) : true; } catch (e) { return true; }
    }

    // ----- modes (« comme il veut ») -----
    function pickMode() {
        const f = Math.max(0, L.fatigue);
        const w = { register: 3, pumps: 2, tidy: 1.2, rest: 1.4, sleep: bedBusy() ? 0 : Math.max(0, (f - 0.5) * 8) };
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
        c.step = 'greet'; c.line = pick(LINES.car); say(c.line);
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
        c.step = 'toPump'; c.done = 0; c.price = cfg.fuelPerLiter; if (v.isPlayer) c.liters = Math.min(c.liters, Math.max(0, Math.floor((pMoney() + cfg.creditLimit) / c.price)));
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
        c.total = Math.ceil(c.total - 1e-9);
        const ok = charge(c.buyer, c.total, 'fuel', 1e9);          // l'essence est déjà dans le réservoir : la dette peut dépasser la limite
        if (ok === false) { say('You can’t pay? Then you owe me ' + fmt(c.total) + '. I’ll remember that.', 5000); emit({ kind: 'fuel', buyer: c.buyer, liters: +c.done.toFixed(2), total: c.total, paid: false }); }
        else { ledger.till += c.total; say(c.done.toFixed(1) + ' liters. That’s ' + fmt(c.total) + '. Drive safe.', 4500); if (c.buyer === 'player') kaching(); emit({ kind: 'fuel', buyer: c.buyer, liters: +c.done.toFixed(2), total: c.total, paid: true }); }
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
            if (c.chosen) { if (c.liters > 0) startFuel(c); else { if (!c.noSay) say(pick(LINES.never)); finishCust(); } return; }
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
    function registryVehicles() {                 // si outside.js ne branche pas host.vehicles : on lit le registre de objects/vehicle.js
        const V = typeof window !== 'undefined' ? window.BadTherapistVehicles : null; if (!V) return [];
        return V.list().filter(function (v) { return v.tank && v.getPose; }).map(function (v) {
            const q = v.getPose(), fp = v.fuelPort || {};
            return { id: v.id, x: q.x, z: q.z, heading: q.heading + Math.PI, speed: Math.abs(q.speed || 0), tank: v.tank, refuel: v.refuel, fuelPort: { x: fp.x, y: fp.y, z: fp.z != null ? -fp.z : undefined },
                isPlayer: !!((v.isDriving && v.isDriving()) || (v.isRiding && v.isRiding())) };
        });
    }
    function vehicleTick(dt) {
        let list = []; try { list = host.vehicles ? host.vehicles() || [] : registryVehicles(); } catch (e) { list = []; }
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
        if (shopBusy() && PL) { L.faceTo = Math.atan2(PL.x - L.x, PL.z - L.z); if (L.talkUntil <= clock) L.anim = 'work'; }   // il tape sur sa caisse
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
        else if (em === 'sleep' && bedBusy()) { setMode('rest'); }
        else if (em === 'sleep') { if (Math.hypot(L.x - NODE.bedside.x, L.z - NODE.bedside.z) > 0.5) goTo('bedside', function () { act('sit', 1.0, lieDown); }); else act('sit', 1.0, lieDown); }
    }

    // ==========================================
    // INTERFACE : légende, commande à la pompe, boutique à la caisse
    // ==========================================
    // ==========================================
    // INTERFACE : Lou pose des questions, on répond avec des BOUTONS (pas de texte libre)
    //   caisse  : accueil (selon notre argent / nos objets / notre essence) -> rayons -> « vous êtes sûr ? » oui / non -> paiement
    //   pompe   : « combien de litres ? » (10 / 20 / 40 / plein), limité à ce qu'on peut payer (crédit compris)
    // L'écran de la caisse compte l'achat en direct ; le lit de Lou est dormable (objects/sleepable.js).
    // ==========================================
    let ui = null, pendingOrder = null, cart = {}, panelLine = '', confirmFor = '', bed = null, bedTried = false;
    const BTx = function () { return (typeof window !== 'undefined' && window.BadTherapist) || {}; };
    function pMoney() { const m = BTx().money; return m ? m.get() : 0; }
    function itemN(id) { const it = BTx().items; return it ? it.count(id) : 0; }
    function canHold(id, n) { const it = BTx().items; return !!(it && it.canAdd(id, n)); }
    function refillPrice() { return Math.ceil(cfg.jerryLiters * cfg.fuelPerLiter - 1e-9); }
    function sline(kind, vars) { let t = pick(lines(kind)); if (vars) Object.keys(vars).forEach(function (k) { t = t.split('{' + k + '}').join(vars[k]); }); return t; }
    function bedBusy() { return !!(bed && bed.isSleeping()); }
    function shopBusy() { return !!(ui && (ui.mode === 'shop' || ui.mode === 'confirm' || ui.mode === 'greet')); }

    // petits sons de caisse
    function tone(f1, f2, dur, vol, type, delay) {
        let A = null; try { A = audio(); } catch (e) { /* pas de son */ }
        if (!A) return;
        const t0 = A.currentTime + (delay || 0), o = A.createOscillator(), g = A.createGain();
        o.type = type || 'square'; o.frequency.setValueAtTime(f1, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function beep() { tone(1180, 0, 0.06, 0.04, 'square'); }
    function kaching() { tone(1320, 0, 0.09, 0.05, 'triangle'); tone(1760, 0, 0.35, 0.05, 'triangle', 0.09); tone(220, 90, 0.12, 0.06, 'sawtooth', 0); }

    function ensureUI() {
        if (ui) return ui;
        if (typeof document === 'undefined' || !document.body || !document.head) return null;
        const st = document.createElement('style'); st.textContent = CSS + CSS2; document.head.appendChild(st);
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
    function closePanel() { if (!ui) return; ui.panel.style.display = 'none'; ui.mode = ''; pendingOrder = null; cart = {}; reg.dirty = true; }
    function head(line, sub) { return '<div class="bt-gas-h"><div class="bt-gas-say">Lou: “' + line + '”</div>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>'; }

    // ---------- pompe : combien de litres ? ----------
    function openOrder(c) {
        const u = ensureUI(); if (!u) { c.liters = cfg.defaultTank; c.chosen = true; return; }
        exitLock(); pendingOrder = c; u.mode = 'order';
        const price = cfg.fuelPerLiter, money = pMoney(), can = Math.floor((money + cfg.creditLimit) / price + 1e-9);
        if (can < 1) {                                         // plus de quoi payer, même à crédit
            c.liters = 0; c.chosen = true; c.noSay = true; say(sline('pumpBroke'), 4200); closePanel(); return;
        }
        const free = Math.max(1, Math.floor(c.free || cfg.defaultTank));
        const full = Math.min(free, can);
        const btn = function (l, label) { return '<button data-l="' + l + '"' + (l !== 'full' && l > can ? ' disabled' : '') + '>' + label + '</button>'; };
        u.panel.innerHTML = head(c.line || sline('pump'), 'Fuel ' + fmt(price) + ' / L' + (money < 0 ? ' — your tab: ' + (-money) : '') + (can < free ? ' — you can pay for ' + can + ' L' : '')) +
            '<div>' + btn(10, '10 L') + btn(20, '20 L') + btn(40, '40 L') + '<button data-l="full">Fill up (' + full + ' L · ' + fmt(full * price) + ')</button></div>' +
            '<div class="bt-gas-t"><input type="number" min="1" max="' + can + '" placeholder="liters"><button data-a="ok">OK</button><button data-a="no">No thanks</button></div>';
        u.panel.style.display = 'block';
    }

    // ---------- caisse ----------
    function greetKind() {
        const money = pMoney(), V = typeof window !== 'undefined' ? window.BadTherapistVehicles : null, tr = V && V.get ? V.get('truck') : null;
        if (money < 0) return 'greetDebt';
        if (itemN('jerrycan_empty') > 0) return 'greetEmpty';
        if (itemN('jerrycan') > 0 && Math.random() < 0.7) return 'greetCan';
        if (tr && tr.tank && tr.tank.level < tr.tank.cap * 0.2) return 'greetLow';
        if (money <= 2) return 'greetBroke';
        return 'greet';
    }
    function openShop() {
        const u = ensureUI(); if (!u || L.state === 'asleep' || bedBusy()) return;
        exitLock(); cart = {}; u.mode = 'greet'; panelLine = sline(greetKind()); renderGreet(); u.panel.style.display = 'block'; reg.dirty = true; beep();
        say(panelLine, 3000);
    }
    function renderGreet() {
        const money = pMoney(), hasEmpty = itemN('jerrycan_empty') > 0;
        let h = head(panelLine, money < 0 ? 'Your tab: ' + (-money) : '');
        h += '<div class="bt-gas-ch"><button data-a="browse">Look at the shelves</button>';
        h += '<button data-a="buycan">Buy a jerrycan (' + cfg.jerryLiters + ' L) — ' + fmt(cfg.jerryPrice) + '</button>';
        if (hasEmpty) h += '<button data-a="fillcan">Fill my empty jerrycan — ' + fmt(refillPrice()) + '</button>';
        h += '<button data-a="close">Never mind</button></div>';
        ui.panel.innerHTML = h;
    }
    function cartTotal() { let t = 0; GAS_CATALOG.forEach(function (i) { t += (cart[i.id] || 0) * i.price; }); return t; }
    function cartLines() { return GAS_CATALOG.filter(function (i) { return cart[i.id] > 0; }).map(function (i) { return { id: i.id, name: i.name, qty: cart[i.id], price: i.price, item: i.item, liters: i.liters }; }); }
    function renderShop() {
        let h = head(panelLine, 'Credit: you can owe me up to ' + cfg.creditLimit + '. Your money: ' + pMoney());
        RAYON_ORDER.forEach(function (rk) {
            const items = GAS_CATALOG.filter(function (i) { return i.rayon === rk; }); if (!items.length) return;
            h += '<div class="bt-gas-r">' + RAYONS[rk].label + '</div>';
            items.forEach(function (i) { h += '<div class="bt-gas-row"><span>' + i.name + '</span><b>' + fmt(i.price) + '</b><button data-a="-" data-id="' + i.id + '">−</button><i>' + (cart[i.id] || 0) + '</i><button data-a="+" data-id="' + i.id + '">+</button></div>'; });
        });
        h += '<div class="bt-gas-t"><span>Total ' + fmt(cartTotal()) + '</span><button data-a="pay">Pay</button><button data-a="back">Back</button><button data-a="close">Close</button></div>';
        const keep = ui.panel.scrollTop; ui.panel.innerHTML = h; ui.panel.scrollTop = keep;
    }
    // « vous êtes sûr ? » : oui / non
    function goConfirm(what) {
        confirmFor = what;
        const total = what === 'fill' ? refillPrice() : cartTotal();
        if (what === 'shop' && total <= 0) return;
        ui.mode = 'confirm'; reg.dirty = true;
        const after = pMoney() - total;
        ui.panel.innerHTML = head(sline(what === 'fill' ? 'fillOffer' : 'confirm', { total: fmt(total) }), 'Total ' + fmt(total) + (after < 0 ? ' — you’ll owe ' + (-after) + ' after this' : '')) +
            '<div class="bt-gas-yn"><button data-a="yes">Yes</button><button data-a="no">No</button></div>';
        ui.panel.scrollTop = 0;
        say(ui.panel.querySelector('.bt-gas-say').textContent.replace(/^Lou: “|”$/g, ''), 3000);
    }
    function denied(kind, back) {
        panelLine = sline(kind); say(panelLine, 3500);
        if (back === 'shop') { ui.mode = 'shop'; renderShop(); } else { ui.mode = 'greet'; renderGreet(); }
        reg.dirty = true;
    }
    function payShop() {
        const ls = cartLines(), total = cartTotal(); if (!ls.length) { denied('browse', 'shop'); return; }
        const cans = ls.filter(function (l) { return l.item === 'jerrycan'; }).reduce(function (a, l) { return a + l.qty; }, 0);
        if (cans && !canHold('jerrycan', cans)) { denied('invFull', 'shop'); return; }
        if (charge('player', total, 'shop') === false) { denied('noCredit', 'shop'); return; }
        ledger.till += total;
        if (cans) BTx().items.add('jerrycan', cans);
        const tip = cans ? sline('canTip') : null;
        closePanel(); kaching(); say(sline('thanks', { total: fmt(total) }), 3200);
        if (tip) setTimeout(function () { say(tip, 3800); }, 3300);
        emit({ kind: 'shop', buyer: 'player', lines: ls, total: total, paid: true });
        if (L.state === 'idle') act('work', 2.6, null);
        reg.paid = clock; reg.dirty = true;
    }
    function fillCan() {
        const total = refillPrice();
        if (itemN('jerrycan_empty') < 1) { denied('noEmpty', 'greet'); return; }
        if (charge('player', total, 'shop') === false) { denied('noCredit', 'greet'); return; }
        const it = BTx().items; it.remove('jerrycan_empty', 1); it.add('jerrycan', 1);
        ledger.till += total; ledger.fuelStock -= cfg.jerryLiters;
        closePanel(); kaching(); say(sline('filled', { total: fmt(total) }), 3400);
        emit({ kind: 'shop', buyer: 'player', lines: [{ id: 'jerrycan_refill', name: 'jerrycan refill ' + cfg.jerryLiters + ' L', qty: 1, price: total }], total: total, paid: true });
        if (L.state === 'idle') act('work', 2.2, null);
        reg.paid = clock; reg.dirty = true;
    }
    function onPanelClick(e) {
        const b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !ui || b.disabled) return;
        const a = b.getAttribute('data-a'), id = b.getAttribute('data-id'), l = b.getAttribute('data-l');
        if (ui.mode === 'order') {
            const c = pendingOrder; if (!c) return;
            const can = Math.floor((pMoney() + cfg.creditLimit) / cfg.fuelPerLiter + 1e-9);
            if (l) { c.liters = l === 'full' ? Math.min(fullAmount(vehMap[c.id]), can) : Math.min(+l, can); c.chosen = true; closePanel(); }
            else if (a === 'ok') { const inp = ui.panel.querySelector('input'); const n = Math.floor(+(inp && inp.value)); if (n > 0) { c.liters = Math.min(n, 200, can); c.chosen = true; closePanel(); } }
            else if (a === 'no') { c.liters = 0; c.chosen = true; closePanel(); }
        } else if (ui.mode === 'greet') {
            if (a === 'browse') { ui.mode = 'shop'; panelLine = sline('browse'); renderShop(); beep(); }
            else if (a === 'buycan') { cart = { jerrycan: 1 }; beep(); goConfirm('shop'); }
            else if (a === 'fillcan') { beep(); goConfirm('fill'); }
            else if (a === 'close') { say(sline('never'), 2500); closePanel(); }
        } else if (ui.mode === 'shop') {
            if (a === '+') { cart[id] = (cart[id] || 0) + 1; beep(); reg.dirty = true; }
            else if (a === '-') { cart[id] = Math.max(0, (cart[id] || 0) - 1); beep(); reg.dirty = true; }
            else if (a === 'back') { cart = {}; ui.mode = 'greet'; panelLine = sline('menu'); renderGreet(); reg.dirty = true; return; }
            else if (a === 'close') { closePanel(); return; }
            else if (a === 'pay') { goConfirm('shop'); return; }
            renderShop();
        } else if (ui.mode === 'confirm') {
            if (a === 'yes') { if (confirmFor === 'fill') fillCan(); else payShop(); }
            else if (a === 'no') { say(sline('declined'), 2500); if (confirmFor === 'fill') { ui.mode = 'greet'; panelLine = sline('menu'); renderGreet(); } else { ui.mode = 'shop'; renderShop(); } reg.dirty = true; }
        }
    }
    function uiTick() {
        const u = ensureUI(); if (!u) return;
        const near = PL && inShopXZ(PL.x, PL.z) && Math.hypot(PL.x - lx(3.0), PL.z - lz(2.0)) < 2.8 && L.state !== 'asleep' && L.mode !== 'away' && !bedBusy();
        const atReg = Math.hypot(L.x - NODE.reg.x, L.z - NODE.reg.z) < 1.6;
        u.btn.style.display = near && u.mode === '' && atReg ? 'block' : 'none';
        if ((u.mode === 'shop' || u.mode === 'greet' || u.mode === 'confirm') && !near) closePanel();
    }

    // ---------- écran de la caisse (compte l'achat en direct) ----------
    function regState() {
        if (L.state === 'asleep') return { kind: 'closed' };
        const c = L.cust;
        if (c && c.step === 'fuel') return { kind: 'pump', litres: c.done || 0, total: Math.ceil((c.done || 0) * (c.price || cfg.fuelPerLiter) - 1e-9) };
        if (ui && ui.mode === 'confirm' && confirmFor === 'fill') return { kind: 'rows', rows: [{ l: 'FILL JERRYCAN', r: fmt(refillPrice()) }], total: refillPrice(), pay: true };
        if (ui && (ui.mode === 'shop' || ui.mode === 'confirm')) {
            const ls = cartLines();
            return { kind: 'rows', rows: ls.map(function (q) { return { l: q.qty + 'x ' + q.name.slice(0, 15), r: fmt(q.qty * q.price) }; }), total: cartTotal(), pay: ui.mode === 'confirm' };
        }
        if (reg.paid && clock - reg.paid < 3) return { kind: 'thanks' };
        return { kind: 'idle' };
    }
    function drawReg() {
        const g = reg.ctx; if (!g) return;
        const W = 256, H = 160, st = regState();
        g.fillStyle = '#06140d'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#2f7a50'; g.lineWidth = 2; g.strokeRect(2, 2, W - 4, H - 4);
        g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = '#8cf0b0'; g.font = 'bold 14px monospace'; g.fillText('LOU’S SHOP', 10, 8);
        g.fillStyle = '#2f7a50'; g.fillRect(8, 27, W - 16, 1);
        g.font = '13px monospace';
        if (st.kind === 'closed') { g.textAlign = 'center'; g.font = 'bold 20px monospace'; g.fillStyle = '#e8b05a'; g.fillText('CLOSED', W / 2, 64); g.font = '12px monospace'; g.fillText('RING THE BELL', W / 2, 96); }
        else if (st.kind === 'pump') {
            g.fillStyle = '#8cf0b0'; g.fillText('FUEL', 10, 38); g.textAlign = 'right'; g.fillText(fmt(cfg.fuelPerLiter) + ' / L', W - 10, 38);
            g.textAlign = 'center'; g.font = 'bold 26px monospace'; g.fillText(st.litres.toFixed(1) + ' L', W / 2, 66);
            g.font = 'bold 20px monospace'; g.fillStyle = '#e8d27a'; g.fillText(String(st.total), W / 2, 106);
        } else if (st.kind === 'rows') {
            g.fillStyle = '#8cf0b0';
            const rows = st.rows.slice(0, 5);
            rows.forEach(function (q, i) { g.textAlign = 'left'; g.fillText(q.l, 10, 34 + i * 17); g.textAlign = 'right'; g.fillText(q.r, W - 10, 34 + i * 17); });
            if (st.rows.length > 5) { g.textAlign = 'left'; g.fillStyle = '#5fae7e'; g.fillText('+' + (st.rows.length - 5) + ' more…', 10, 34 + 5 * 17); }
            if (!st.rows.length) { g.textAlign = 'center'; g.fillStyle = '#5fae7e'; g.fillText('nothing yet', W / 2, 64); }
            g.fillStyle = '#2f7a50'; g.fillRect(8, 122, W - 16, 1);
            g.textAlign = 'left'; g.fillStyle = '#e8d27a'; g.font = 'bold 18px monospace'; g.fillText(st.pay ? 'PAY' : 'TOTAL', 10, 132); g.textAlign = 'right'; g.fillText(String(st.total), W - 10, 132);
        } else if (st.kind === 'thanks') {
            g.textAlign = 'center'; g.fillStyle = '#8cf0b0'; g.font = 'bold 22px monospace'; g.fillText('THANK YOU', W / 2, 62); g.font = '12px monospace'; g.fillText('drive safe', W / 2, 96);
        } else {
            g.textAlign = 'center'; g.fillStyle = '#8cf0b0'; g.font = 'bold 18px monospace'; g.fillText('WELCOME', W / 2, 64);
            g.font = '12px monospace'; g.fillStyle = '#5fae7e'; g.fillText('fuel ' + fmt(cfg.fuelPerLiter) + ' / L', W / 2, 96);
            if (Math.floor(clock * 1.4) % 2) { g.fillStyle = '#8cf0b0'; g.fillRect(W / 2 + 54, 66, 9, 14); }
        }
        reg.tex.needsUpdate = true;
    }
    function regTick(dt) {
        if (!reg.ctx) return;
        reg.t += dt;
        if (!PL || Math.hypot(PL.x - lx(3.0), PL.z - lz(2.0)) > 30) return;          // inutile de redessiner de loin
        const st = regState(), key = st.kind === 'pump' ? 'p' + Math.round(st.litres * 5) : st.kind === 'idle' ? 'i' + (Math.floor(clock * 1.4) % 2) : st.kind === 'thanks' ? 't' : '';
        if (reg.dirty || key !== reg.key) { reg.key = key; reg.dirty = false; drawReg(); }
    }

    // ---------- le lit de Lou : le joueur peut y dormir ----------
    function bedTick(dt, ctx) {
        if (!bed && !bedTried) {
            const cam = (ctx && ctx.camera) || env.camera, cv = (typeof document !== 'undefined' && document.getElementById('gc')) || env.canvas;
            if (cam && cv) {
                bedTried = true;
                try {
                    bed = makeSleepable({
                        camera: cam, canvas: cv, target: bedG, headDir: new THREE.Vector3(1, 0, 0), maxDist: 4.2, hours: 8, quality: cfg.bedQuality, keepHeight: true, autoWake: 6,
                        canSleep: function () { return L.state !== 'asleep' && !L.onBed; }, label: 'Lou’s bed'
                    });
                } catch (e) { console.warn('[gasstation] lit', e); }
            }
        }
        if (!bed) return;
        bed.update(dt);
        const locks = typeof window !== 'undefined' ? window.BTLocks : null;
        if (locks) { if (bed.isSleeping()) { locks.add('gasbed'); if (ui && ui.mode) closePanel(); } else locks.delete('gasbed'); }
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
        doorTick(dt); vehicleTick(dt); louTick(dt); uiTick(); regTick(dt); bedTick(dt, ctx);
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
        isPlayerSleeping: function () { return !!(bed && bed.isSleeping()); },     // le joueur dort dans le lit de Lou
        sleepInBed: function () { if (bed) bed.startSleep(); return !!bed; },        // test console : BadTherapistGas.sleepInBed()
        shopMask: function (on) { MASK.on.value = on ? 1 : 0; return on ? 'interior ignores outside lights' : 'old lighting'; },
        bed: bedPos,
        test: {                                                                    // tests dans la console (F12)
            car: function (pump, isPlayer, heading) { const p = pumpsW[pump || 0]; const v = { id: 'test' + Math.floor(Math.random() * 1e6), x: p.x + 2.4, z: p.z, heading: heading == null ? 0 : heading, speed: 0, isPlayer: !!isPlayer, tank: { cap: 50, level: 8 } }; fake.push(v); return v.id; },
            leave: function () { fake.length = 0; }
        }
    };
    if (typeof window !== 'undefined') window.BadTherapistGas = api;
    return api;
}
