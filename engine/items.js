import * as THREE from 'three';

// ==========================================================================================
// BAD THERAPIST — INVENTAIRE + OBJETS AU SOL (engine/items.js)
// ==========================================================================================
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH.
//
// Commun à tous les lieux (il est branché une seule fois par world_base.html).
//
//   BadTherapist.items.define('torch', { name, desc, icon: '<svg…>', model: () => THREE.Object3D, glow: 0xffcc66, stack: 5, use: (api) => true|false })
//   BadTherapist.items.add('jerrycan', 2)     // -> nombre réellement ajouté (0 si l'inventaire est plein)
//   BadTherapist.items.canAdd('jerrycan', 2)
//   BadTherapist.items.remove('jerrycan', 1)  // -> true / false
//   BadTherapist.items.count('jerrycan') / has('jerrycan') / list()
//   BadTherapist.items.use('jerrycan')        // appelle def.use
//   BadTherapist.items.drop('jerrycan', 1)    // jette l'objet devant soi : il flotte, brille, tourne (comme dans Minecraft) ; on le ramasse en s'approchant
//   BadTherapist.toast('text')                // petit message au centre bas (utilisé aussi par les véhicules)
//
// SAUVEGARDE : inventaire et objets au sol sont rangés dans bt_player_state.misc (BadTherapist.store), donc dans ton export / import JSON.
//
// OBJETS DE BASE (définis ici) : « jerrycan » (10 L d'essence, plein) et « jerrycan_empty » (vide, Lou le remplit à la caisse).
// Utiliser un bidon plein : il verse dans le véhicule le plus proche (camion, taxi, bus, voiture de police, même celui des PNJ).

export const CAN_LITERS = 10;          // contenu d'un bidon plein
const SLOTS = 12;                      // cases de l'inventaire (même nombre que dans world_base.html)
const POUR_MIN_FREE = 6;               // le bidon ne se vide que s'il reste au moins 6 L de place dans le réservoir
const PICKUP_R = 1.35, PICKUP_DELAY = 1.1, HOVER = 0.38, DROP_FWD = 1.5;

const VEHICLE_NAMES = { truck: 'truck', taxi: 'taxi', bus: 'bus', police: 'police car' };

// ----- icônes (SVG) -----
function svgCan(full) {
    const body = full ? '#c0281c' : '#5c6168', edge = full ? '#6e130d' : '#2b2e33', cap = full ? '#f0c43a' : '#9aa1a8';
    const fuel = full ? '<rect x="17" y="30" width="22" height="3" rx="1.5" fill="#ffb35a" opacity=".85"/>' : '<path d="M20 32 L36 44 M36 32 L20 44" stroke="#9aa1a8" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>';
    return '<svg viewBox="0 0 56 56"><path d="M12 18 h24 l6 6 v26 a3 3 0 0 1 -3 3 h-27 a3 3 0 0 1 -3 -3 z" fill="' + body + '" stroke="' + edge + '" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<path d="M16 18 v-5 a3 3 0 0 1 3 -3 h10 a3 3 0 0 1 3 3 v5" fill="none" stroke="' + edge + '" stroke-width="2.6" stroke-linecap="round"/>' +
        '<rect x="35" y="9" width="7" height="9" rx="1.5" fill="' + cap + '" stroke="' + edge + '" stroke-width="1.6"/>' + fuel +
        '<path d="M16 26 v20" stroke="#fff" stroke-opacity=".18" stroke-width="3" stroke-linecap="round"/></svg>';
}
const SVG_UNKNOWN = '<svg viewBox="0 0 56 56"><rect x="12" y="12" width="32" height="32" rx="5" fill="#3a3338" stroke="#625047" stroke-width="2"/><text x="28" y="35" text-anchor="middle" font-family="monospace" font-size="20" fill="#d9c5b5">?</text></svg>';

// ----- modèles 3D -----
function canModel(full) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: full ? 0xc0281c : 0x5c6168, roughness: 0.55, metalness: 0.25, emissive: full ? 0x3a0805 : 0x0e1012, emissiveIntensity: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.7 });
    const cap = new THREE.MeshStandardMaterial({ color: full ? 0xf0c43a : 0x9aa1a8, roughness: 0.4, metalness: 0.5, emissive: full ? 0x3a2c05 : 0x000000 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), body); g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), dark); h.position.set(-0.03, 0.22, 0); g.add(h);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 8), cap); sp.position.set(0.09, 0.22, 0); g.add(sp);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.03, 0.15), dark); rib.position.y = 0.04; g.add(rib);
    return g;
}
function boxModel(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: color || 0x8a6a3a, roughness: 0.8, emissive: 0x201408 })));
    return g;
}
let _haloTex = null;
function haloTexture() {
    if (_haloTex) return _haloTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const k = c.getContext('2d'), gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    k.fillStyle = gr; k.fillRect(0, 0, 64, 64);
    _haloTex = new THREE.CanvasTexture(c);
    return _haloTex;
}

const CSS = '.inventory-slot{position:relative;cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent}' +
    '.inventory-slot.sel{border-color:#e8c97a;background:rgba(232,201,122,0.08)}' +
    '.inventory-slot .bt-ic{display:block;width:100%;height:100%}.inventory-slot .bt-ic svg{width:100%;height:100%;display:block;padding:12%;box-sizing:border-box}' +
    '.inventory-slot .bt-n{position:absolute;right:4px;bottom:1px;font:bold 11px monospace;color:#f2c75c;text-shadow:0 1px 2px #000}' +
    '#itemInfo{margin-top:12px;min-height:20px;font:12px/1.5 monospace;color:#ddd0c3}' +
    '#itemInfo .ii-n{color:#f2c75c;font-weight:bold}#itemInfo .ii-d{opacity:.8;margin:2px 0 8px}' +
    '#itemInfo button{padding:7px 12px;margin:0 6px 0 0;background:#302733;color:#fff;border:1px solid #625047;border-radius:5px;cursor:pointer;font:11px monospace}#itemInfo button:active{background:#4a3d4d}' +
    '#itemInfo .ii-e{opacity:.5}' +
    '#btToast{position:fixed;left:50%;bottom:24vh;transform:translateX(-50%);z-index:60;max-width:min(86vw,420px);padding:8px 14px;background:rgba(23,23,32,0.92);border:1px solid #625047;border-radius:10px;color:#f1e6d8;font:600 13px system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s}' +
    '#btToast.show{opacity:1}';

export function setupItems(env) {
    const scene = env.scene, camera = env.camera, store = env.store, worldFile = env.worldFile || '';
    const defs = {};
    let counts = {}, order = [], selected = null, saveT = 0, saveDirty = false;
    const drops = [];                              // { id, n, g, halo, born, phase, anim, warn }
    let clock = 0, AC = null, info = null, slotEls = [];

    // ---------- définitions ----------
    function define(id, def) { defs[id] = Object.assign({ name: id, desc: '', stack: 99 }, defs[id] || {}, def || {}); render(); return defs[id]; }
    define('jerrycan', { name: 'Jerrycan', desc: CAN_LITERS + ' L of fuel. Use it next to a vehicle.', icon: svgCan(true), model: function () { return canModel(true); }, glow: 0xffb35a, stack: 6, use: useCan });
    define('jerrycan_empty', { name: 'Empty jerrycan', desc: 'Lou can fill it up for you.', icon: svgCan(false), model: function () { return canModel(false); }, glow: 0x9aa4ad, stack: 6 });
    function defOf(id) { return defs[id] || { name: id.replace(/_/g, ' '), desc: '', icon: SVG_UNKNOWN, stack: 99, unknown: true }; }

    // ---------- inventaire ----------
    function count(id) { return counts[id] || 0; }
    function has(id) { return count(id) > 0; }
    function canAdd(id, n) {
        n = n || 1;
        const st = defOf(id).stack || 99, have = count(id);
        if (have === 0 && order.length >= SLOTS) return false;
        return have + n <= st;
    }
    function add(id, n) {
        n = Math.max(1, Math.floor(n || 1));
        const st = defOf(id).stack || 99, have = count(id);
        if (have === 0 && order.length >= SLOTS) return 0;
        const ok = Math.min(n, st - have);
        if (ok <= 0) return 0;
        if (have === 0) order.push(id);
        counts[id] = have + ok;
        changed(id, ok);
        return ok;
    }
    function remove(id, n) {
        n = Math.max(1, Math.floor(n || 1));
        if (count(id) < n) return false;
        counts[id] -= n;
        if (counts[id] <= 0) { delete counts[id]; order = order.filter(function (k) { return k !== id; }); if (selected === id) selected = null; }
        changed(id, -n);
        return true;
    }
    function list() { return order.map(function (id) { return { id: id, count: counts[id], name: defOf(id).name }; }); }
    function changed(id, delta) {
        saveDirty = true; saveT = 0.4;
        render();
        try { window.dispatchEvent(new CustomEvent('bt-items', { detail: { id: id, delta: delta, total: count(id) } })); } catch (e) { /* ignore */ }
    }

    // ---------- sauvegarde ----------
    function load() {
        const s = store ? store.get('inventory', null) : null;
        counts = {}; order = [];
        if (s && Array.isArray(s.order)) s.order.forEach(function (id) { const c = Math.floor(s.counts && s.counts[id]); if (c > 0 && order.length < SLOTS) { order.push(id); counts[id] = c; } });
    }
    function persist() {
        if (!store) return;
        store.set('inventory', { order: order.slice(), counts: Object.assign({}, counts) });
        store.set('drops', savedDrops());
        saveDirty = false;
    }
    function savedDrops() {                         // les objets au sol des AUTRES lieux restent tels quels
        const keep = (store.get('drops', []) || []).filter(function (d) { return d.w !== worldFile; });
        drops.forEach(function (d) { keep.push({ id: d.id, n: d.n, x: +d.g.position.x.toFixed(2), y: +d.base.toFixed(2), z: +d.g.position.z.toFixed(2), w: worldFile }); });
        return keep;
    }

    // ---------- message ----------
    let toastEl = null, toastTimer = 0;
    function toast(text, ms) {
        if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'btToast'; document.body.appendChild(toastEl); }
        toastEl.textContent = text; toastEl.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2200);
    }

    // ---------- sons ----------
    function audio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } }
    function glug() {                                // verser : petites bulles graves
        const A = audio(); if (!A) return;
        for (let i = 0; i < 7; i++) {
            const t0 = A.currentTime + i * 0.17 + Math.random() * 0.05, o = A.createOscillator(), g = A.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(150 + Math.random() * 60, t0); o.frequency.exponentialRampToValueAtTime(320 + Math.random() * 120, t0 + 0.12);
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
            o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.16);
        }
    }
    function pop(up) {
        const A = audio(); if (!A) return;
        const t0 = A.currentTime, o = A.createOscillator(), g = A.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(up ? 520 : 300, t0); o.frequency.exponentialRampToValueAtTime(up ? 880 : 180, t0 + 0.09);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        o.connect(g); g.connect(A.destination); o.start(t0); o.stop(t0 + 0.14);
    }

    // ---------- utiliser ----------
    function busy() { try { return env.isBusy ? env.isBusy() : false; } catch (e) { return false; } }
    function use(id) {
        const d = defOf(id);
        if (!has(id)) return false;
        if (!d.use) { toast('Nothing to do with that.'); return false; }
        let ok = false;
        try { ok = d.use(api) !== false; } catch (e) { console.warn('[items] use', e); }
        return ok;
    }
    function useCan() {                               // verse un bidon plein dans le véhicule le plus proche
        const V = window.BadTherapistVehicles;
        const v = V && V.nearest ? V.nearest(camera.position, 5.5, function (x) { return x.tank; }) : null;
        if (!v) { toast('No vehicle close enough.'); return false; }
        const t = v.tank, free = t.cap - t.level, name = VEHICLE_NAMES[v.id] || 'vehicle';
        if (free < POUR_MIN_FREE) { toast('The ' + name + '’s tank is almost full.'); return false; }
        const liters = Math.min(CAN_LITERS, free);
        remove('jerrycan', 1);
        if (v.refuel) v.refuel(liters); else t.level = Math.min(t.cap, t.level + liters);
        if (!add('jerrycan_empty', 1)) spawnDrop('jerrycan_empty', 1, true);
        glug(); toast('Poured ' + Math.round(liters) + ' L into the ' + name + '.');
        try { window.dispatchEvent(new CustomEvent('bt-refuel', { detail: { vehicle: v.id, liters: liters, by: 'jerrycan' } })); } catch (e) { /* ignore */ }
        return true;
    }

    // ---------- objets au sol ----------
    function makeDrop(id, n, x, y, z) {
        const d = defOf(id);
        const g = new THREE.Group();
        let model = null;
        try { model = d.model ? d.model() : boxModel(); } catch (e) { model = boxModel(); }
        g.add(model);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: d.glow || 0xffd98a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        halo.scale.set(0.95, 0.95, 1); halo.position.y = 0.02; g.add(halo);
        g.position.set(x, y, z);
        scene.add(g);
        return { id: id, n: n, g: g, model: model, halo: halo, base: y, born: clock, phase: Math.random() * 6.28, anim: null, warn: 0 };
    }
    function spawnDrop(id, n, atFeet) {
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0;
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
        const feet = camera.position.y - 1.7 + HOVER;
        const from = new THREE.Vector3(camera.position.x + dir.x * 0.4, camera.position.y - 0.45, camera.position.z + dir.z * 0.4);
        const to = new THREE.Vector3(camera.position.x + dir.x * (atFeet ? 0.5 : DROP_FWD), feet, camera.position.z + dir.z * (atFeet ? 0.5 : DROP_FWD));
        const dr = makeDrop(id, n, from.x, from.y, from.z);
        dr.anim = { t: 0, T: 0.45, from: from, to: to };
        dr.base = to.y;
        drops.push(dr);
        saveDirty = true; saveT = 0.4;
        return dr;
    }
    function drop(id, n) {
        n = Math.max(1, Math.floor(n || 1));
        if (!has(id)) return false;
        if (busy()) { toast('Not now.'); return false; }
        n = Math.min(n, count(id));
        remove(id, n);
        spawnDrop(id, n, false);
        pop(false);
        return true;
    }
    function dropTick(dt) {
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            if (d.anim) {                                // lancer : petit arc de la main vers le sol
                d.anim.t += dt;
                const k = Math.min(1, d.anim.t / d.anim.T), e = 1 - (1 - k) * (1 - k);
                d.g.position.lerpVectors(d.anim.from, d.anim.to, e);
                d.g.position.y += Math.sin(Math.PI * k) * 0.35;
                if (k >= 1) { d.anim = null; d.g.position.y = d.base; }
            } else {
                d.g.position.y = d.base + Math.sin(clock * 2.1 + d.phase) * 0.07;     // il flotte
            }
            d.model.rotation.y += dt * 1.3;
            d.halo.material.opacity = 0.42 + Math.sin(clock * 3.2 + d.phase) * 0.14;   // il brille
            if (d.anim || clock - d.born < PICKUP_DELAY || busy()) continue;
            const dx = camera.position.x - d.g.position.x, dz = camera.position.z - d.g.position.z;
            if (dx * dx + dz * dz > PICKUP_R * PICKUP_R || Math.abs(camera.position.y - 1.7 - d.base) > 2.4) continue;
            const got = add(d.id, d.n);
            if (got > 0) {
                toast('+ ' + (got > 1 ? got + ' × ' : '') + defOf(d.id).name, 1500); pop(true);
                if (got >= d.n) { scene.remove(d.g); drops.splice(i, 1); saveDirty = true; saveT = 0.4; }
                else d.n -= got;
            } else if (clock - d.warn > 3) { d.warn = clock; toast('Inventory full.'); }
        }
    }
    function restoreDrops() {
        const saved = store ? store.get('drops', []) : [];
        (saved || []).forEach(function (s) {
            if (s.w !== worldFile || !Number.isFinite(s.x) || !Number.isFinite(s.z) || !(s.n > 0)) return;
            const dr = makeDrop(s.id, s.n, s.x, s.y, s.z); dr.born = -99; drops.push(dr);
        });
    }

    // ---------- interface ----------
    const grid = document.getElementById('inventoryGrid');
    const panel = document.getElementById('itemPanel');
    (function buildUI() {
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        if (!grid) return;
        slotEls = Array.prototype.slice.call(grid.querySelectorAll('.inventory-slot'));
        while (slotEls.length < SLOTS) { const s = document.createElement('div'); s.className = 'inventory-slot'; grid.appendChild(s); slotEls.push(s); }
        slotEls.forEach(function (el, i) { el.addEventListener('click', function () { const id = order[i]; selected = id && selected !== id ? id : null; render(); }); });
        info = document.createElement('div'); info.id = 'itemInfo';
        grid.parentNode.insertBefore(info, grid.nextSibling);
        info.addEventListener('click', function (e) {
            const b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !selected) return;
            const a = b.getAttribute('data-a'), id = selected;
            if (a === 'use') { use(id); }
            else if (a === 'drop') { drop(id, 1); }
            else if (a === 'dropall') { drop(id, count(id)); }
            render();
        });
    })();
    function render() {
        if (!slotEls.length) return;
        slotEls.forEach(function (el, i) {
            const id = order[i];
            if (!id) { el.innerHTML = ''; el.classList.remove('sel'); el.title = ''; return; }
            const d = defOf(id), n = counts[id];
            el.innerHTML = '<span class="bt-ic">' + (d.icon || SVG_UNKNOWN) + '</span>' + (n > 1 ? '<span class="bt-n">' + n + '</span>' : '');
            el.title = d.name; el.classList.toggle('sel', selected === id);
        });
        if (!info) return;
        if (!selected || !has(selected)) { selected = null; info.innerHTML = order.length ? '<span class="ii-e">Tap an item.</span>' : '<span class="ii-e">Nothing here yet.</span>'; return; }
        const d = defOf(selected), n = counts[selected];
        info.innerHTML = '<div class="ii-n">' + d.name + (n > 1 ? ' × ' + n : '') + '</div><div class="ii-d">' + (d.desc || '') + '</div>' +
            (d.use ? '<button data-a="use">Use</button>' : '') + '<button data-a="drop">Drop</button>' + (n > 1 ? '<button data-a="dropall">Drop all</button>' : '');
    }

    // ---------- boucle ----------
    function update(dt) {
        clock += dt;
        dropTick(dt);
        if (saveDirty) { saveT -= dt; if (saveT <= 0) persist(); }
    }

    window.addEventListener('pagehide', function () { if (saveDirty) persist(); });
    window.addEventListener('bt-state-loaded', function () { load(); render(); });   // après un import JSON

    load();
    restoreDrops();
    render();

    const api = { define: define, add: add, canAdd: canAdd, remove: remove, count: count, has: has, list: list, use: use, drop: drop, update: update, toast: toast, defs: defs, CAN_LITERS: CAN_LITERS };
    return api;
}
