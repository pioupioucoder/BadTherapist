// phone.js – le téléphone rouge posé sur la table de chevet.
//
// Il sonne (sonnerie + secousses + lueur rouge visible de loin dans le noir), on le décroche d'un clic,
// on raccroche d'un clic. S'il ne sonne pas, un clic « compose » le numéro d'Evelyn.
//
// ─ BRANCHEMENT ──────────────────────────────────────────────────────────────────────────
// 1. TEMPORAIRE : tant que evelyn-phone.js n'est pas branché directement, le téléphone surveille le bouton
//    d'appel à l'écran (« EVELYN IS CALLING ») : quand il apparaît, le téléphone sonne ; décrocher le
//    téléphone clique ce bouton à ta place, donc le reste de l'appel continue comme avant.
// 2. Pour le brancher proprement, window.BadTherapistPhone offre :
//      ring()  stopRing()  answer()  hangUp()  getState()  ('idle' | 'ringing' | 'inCall')
//      say(texte)  -> Evelyn parle dans le combiné (voix du navigateur), renvoie une promesse
//      onAnswer(fn)  onHangUp(fn)  onDial(fn)
//    et ces événements sur window : badtherapist:phone-answer / -hangup / -dial
// Pour tester : F12 > console > BadTherapistPhone.ring()

import * as THREE from 'three';

export function buildPhone(scene, opts) {
    opts = opts || {};
    const camera = opts.camera;
    const canvas = opts.canvas;
    const anchor = opts.anchor;                 // la table de chevet (nightstand.group)
    const TOP_Y = 0.60;                         // dessus de la table de chevet
    const RING_PERIOD = 3.0;                    // une sonnerie (2 coups) toutes les 3 secondes
    const CALL_MAX = 90;                        // sécurité : raccroche tout seul après 90 s si personne ne le fait
    const FOLLOW_SCREEN = opts.followScreenCall !== false;
    let soundOn = opts.sound !== false;

    // ─── PLACEMENT ───────────────────────────────────────────────
    const root = new THREE.Group();
    if (anchor) {
        root.position.copy(anchor.position);
        root.rotation.y = anchor.rotation.y;
    } else {
        root.position.set(-7.72, 0, 1.75);
        root.rotation.y = Math.PI / 2;
    }
    root.position.y = TOP_Y;
    scene.add(root);

    const body = new THREE.Group();
    body.position.set(0, 0, -0.03);
    root.add(body);

    // ─── MATÉRIAUX ───────────────────────────────────────────────
    function glowTex() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
        g.addColorStop(0, 'rgba(255,120,90,1)');
        g.addColorStop(0.35, 'rgba(255,70,50,0.45)');
        g.addColorStop(1, 'rgba(255,50,30,0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding;
        return t;
    }

    const mRed = new THREE.MeshLambertMaterial({ color: 0x8a1c28, emissive: 0xff5a3c });
    const mCream = new THREE.MeshLambertMaterial({ color: 0xd9d0b0, emissive: 0xff5a3c });
    const mDark = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
    const mBulb = new THREE.MeshBasicMaterial({ color: 0x3a0a0a });
    mRed.emissiveIntensity = 0.12;
    mCream.emissiveIntensity = 0.05;

    function bx(w, h, d, mat, x, y, z, parent) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        (parent || body).add(m);
        return m;
    }

    // ─── SOCLE, CADRAN ───────────────────────────────────────────
    bx(0.20, 0.034, 0.17, mRed, 0, 0.017, 0);
    bx(0.17, 0.026, 0.14, mRed, 0, 0.047, -0.005);

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.006, 20), mCream);
    plate.position.set(0, 0.063, 0.02);
    body.add(plate);

    // 10 trous du cadran (un espace en bas à droite, comme un vrai cadran)
    for (let i = 0; i < 10; i++) {
        const a = (35 + i * 27) * Math.PI / 180;
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.002, 8), mDark);
        hole.position.set(Math.cos(a) * 0.031, 0.0665, 0.02 + Math.sin(a) * 0.031);
        body.add(hole);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), mDark);
    cap.position.set(0, 0.067, 0.02);
    body.add(cap);

    // fourches sur lesquelles repose le combiné
    bx(0.012, 0.024, 0.04, mRed, -0.072, 0.072, -0.045);
    bx(0.012, 0.024, 0.04, mRed, 0.072, 0.072, -0.045);

    // petit voyant à l'avant du socle
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), mBulb);
    bulb.position.set(0.075, 0.04, 0.078);
    body.add(bulb);

    // ─── COMBINÉ ─────────────────────────────────────────────────
    const handset = new THREE.Group();
    handset.position.set(0, 0.096, -0.045);
    body.add(handset);
    bx(0.15, 0.018, 0.026, mRed, 0, 0, 0, handset);
    bx(0.045, 0.036, 0.052, mRed, -0.075, -0.009, 0, handset);
    bx(0.045, 0.036, 0.052, mRed, 0.075, -0.009, 0, handset);

    // ─── LUEUR + ZONE DE CLIC ────────────────────────────────────
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(0.6, 0.6, 1);
    halo.position.set(0, 0.1, 0.02);
    halo.raycast = function() {};           // la lueur ne doit jamais intercepter les clics
    body.add(halo);

    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.22), new THREE.MeshBasicMaterial());
    hit.position.set(0, 0.07, 0.0);
    hit.visible = false;
    body.add(hit);

    root.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    root.getWorldPosition(worldPos);
    worldPos.y += 0.08;

    // ─── ÉTAT ────────────────────────────────────────────────────
    let state = 'idle';                 // 'idle' | 'ringing' | 'inCall'
    let ringSource = null;              // 'api' | 'screen'
    let screenEl = null;                // le bouton d'appel à l'écran, s'il y en a un
    let clock = 0;
    let ringStart = 0;
    let lastCycle = -1;
    let callStart = 0;
    let shakeAmt = 0, lift = 0, glow = 0, nudge = 0;
    let hover = false;
    const handlers = { answer: [], hangup: [], dial: [] };

    function fire(name, detail) {
        handlers[name].forEach(function(fn) { try { fn(detail); } catch (e) { console.error('[phone]', e); } });
        try { window.dispatchEvent(new CustomEvent('badtherapist:phone-' + name, { detail: detail || {} })); } catch (e) {}
    }

    // ─── SONNERIE (générée, pas de fichier audio) ────────────────
    let AC = null, master = null, pan = null;

    function ensureAudio() {
        if (!soundOn) return false;
        if (!AC) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return false;
            try {
                AC = new Ctor();
                master = AC.createGain();
                master.gain.value = 0;
                if (AC.createStereoPanner) {
                    pan = AC.createStereoPanner();
                    master.connect(pan);
                    pan.connect(AC.destination);
                } else {
                    master.connect(AC.destination);
                }
            } catch (e) { AC = null; return false; }
        }
        if (AC.state === 'suspended') AC.resume().catch(function() {});
        return true;
    }

    // un « brrr » de 0.4 s : deux notes (440 + 480 Hz) hachées à 20 Hz
    function burst(t0, dur) {
        const env = AC.createGain();
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(1, t0 + 0.01);
        env.gain.setValueAtTime(1, t0 + dur - 0.02);
        env.gain.linearRampToValueAtTime(0, t0 + dur);
        const amp = AC.createGain();
        amp.gain.value = 0.5;
        const lfo = AC.createOscillator();
        const lfoGain = AC.createGain();
        lfo.frequency.value = 20;
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(amp.gain);
        [440, 480].forEach(function(f) {
            const o = AC.createOscillator();
            o.type = 'sine';
            o.frequency.value = f;
            o.connect(amp);
            o.start(t0);
            o.stop(t0 + dur + 0.02);
        });
        amp.connect(env);
        env.connect(master);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.02);
    }

    function startCycleSound() {
        if (!ensureAudio()) return;
        const t = AC.currentTime + 0.02;
        burst(t, 0.4);
        burst(t + 0.6, 0.4);
    }

    function stopSound() {
        if (AC && master) master.gain.setTargetAtTime(0, AC.currentTime, 0.02);
    }

    const tmp = new THREE.Vector3();

    // volume selon la distance, et d'où vient le son (gauche / droite)
    function updateSoundPosition() {
        if (!AC || !master || state !== 'ringing' || !camera) return;
        const d = camera.position.distanceTo(worldPos);
        let gain = 0;
        if (camera.position.x <= 100) gain = 0.04 + 0.5 * Math.pow(Math.max(0, 1 - d / 25), 2);   // faible mais audible dans tout l'immeuble, pas dans la rue
        master.gain.setTargetAtTime(gain * 0.5, AC.currentTime, 0.05);
        if (pan) {
            tmp.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
            const h = Math.hypot(tmp.x, tmp.z) || 1;
            pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, tmp.x / h)), AC.currentTime, 0.05);
        }
    }

    // ─── ACTIONS ─────────────────────────────────────────────────
    function ring(source) {
        if (state !== 'idle') return false;
        state = 'ringing';
        ringSource = source === 'screen' ? 'screen' : 'api';
        ringStart = clock;
        lastCycle = -1;
        return true;
    }

    function stopRing() {
        if (state !== 'ringing') return false;
        state = 'idle';
        ringSource = null;
        screenEl = null;
        stopSound();
        return true;
    }

    function answer(viaPhone) {
        if (state !== 'ringing') return false;
        const el = ringSource === 'screen' ? screenEl : null;
        const source = ringSource;
        stopSound();
        state = 'inCall';
        ringSource = null;
        callStart = clock;
        if (viaPhone && el && el.isConnected) {
            try { el.click(); } catch (e) { console.error('[phone]', e); }   // décrocher = appuyer sur le bouton d'appel à l'écran
        }
        screenEl = null;
        fire('answer', { source: source });
        return true;
    }

    function hangUp() {
        if (state !== 'inCall') return false;
        state = 'idle';
        stopSpeaking();
        fire('hangup');
        return true;
    }

    function dial() {
        if (state !== 'idle') return false;
        nudge = 1;                                           // le combiné vibre : on appelle
        if (!handlers.dial.length) console.info('[phone] numéro composé : rien n\'est encore branché sur onDial / badtherapist:phone-dial');
        fire('dial');
        return true;
    }

    // ─── VOIX D'EVELYN DANS LE COMBINÉ ───────────────────────────
    // Voix du navigateur (gratuite, un peu robotique). Une vraie voix passerait par une API de synthèse vocale.
    function pickVoice(lang) {
        const voices = window.speechSynthesis.getVoices() || [];
        const same = voices.filter(function(v) { return (v.lang || '').toLowerCase().indexOf(lang.slice(0, 2).toLowerCase()) === 0; });
        const female = same.filter(function(v) { return /female|woman|samantha|zira|aria|jenny|libby|google us english|google uk english female/i.test(v.name); });
        return female[0] || same[0] || null;
    }

    function say(text, o) {
        o = o || {};
        if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve(false);
        return new Promise(function(resolve) {
            const u = new SpeechSynthesisUtterance(String(text));
            u.lang = o.lang || 'en-US';
            u.rate = o.rate || 0.92;
            u.pitch = o.pitch || 0.95;
            const v = pickVoice(u.lang);
            if (v) u.voice = v;
            u.onend = function() { resolve(true); };
            u.onerror = function() { resolve(false); };
            window.speechSynthesis.speak(u);
        });
    }

    function stopSpeaking() {
        try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
    }

    // ─── SURVEILLE LE BOUTON D'APPEL À L'ÉCRAN (temporaire) ──────
    const CALL_RE = /evelyn\s+is\s+calling/i;

    function isShown(el) {
        if (!el.getClientRects || !el.getClientRects().length) return false;
        for (let e = el; e; e = e.parentElement) {
            const s = window.getComputedStyle(e);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
        }
        return true;
    }

    function findScreenCall() {
        if (!document.body) return null;
        const walker = document.createTreeWalker(document.body, 4);     // 4 = nœuds de texte
        let n;
        while ((n = walker.nextNode())) {
            if (CALL_RE.test(n.nodeValue) && n.parentElement && isShown(n.parentElement)) return n.parentElement;
        }
        return null;
    }

    if (FOLLOW_SCREEN) {
        setInterval(function() {
            const el = findScreenCall();
            if (el && state === 'idle') {
                screenEl = el;
                ring('screen');
            } else if (!el && state === 'ringing' && ringSource === 'screen') {
                stopRing();                                    // décroché ou raté à l'écran : le téléphone se tait
            } else if (el && state === 'ringing' && ringSource === 'screen') {
                screenEl = el;
            }
        }, 500);
    }

    // ─── ANIMATION ───────────────────────────────────────────────
    function update(dt) {
        dt = Math.min(dt || 0, 0.1);
        clock += dt;

        let on = false;                                          // vrai pendant les deux « brrr »
        if (state === 'ringing') {
            const t = clock - ringStart;
            const cycle = Math.floor(t / RING_PERIOD);
            const ph = t - cycle * RING_PERIOD;
            on = ph < 0.4 || (ph >= 0.6 && ph < 1.0);
            if (cycle !== lastCycle) {
                lastCycle = cycle;
                startCycleSound();
            }
            updateSoundPosition();
        } else if (state === 'inCall' && clock - callStart > CALL_MAX) {
            hangUp();
        }

        nudge = Math.max(0, nudge - dt * 2.5);
        const shake = on ? 1 : nudge;
        shakeAmt += (shake - shakeAmt) * Math.min(1, dt * 30);
        body.rotation.z = Math.sin(clock * 70) * 0.012 * shakeAmt;
        body.position.x = Math.sin(clock * 90) * 0.0015 * shakeAmt;

        // le combiné se soulève quand on décroche
        lift += ((state === 'inCall' ? 1 : 0) - lift) * Math.min(1, dt * 6);
        handset.position.y = 0.096 + lift * 0.11;
        handset.position.z = -0.045 + lift * 0.1;
        handset.rotation.x = -lift * 0.9;
        handset.rotation.z = Math.sin(clock * 80) * 0.03 * shakeAmt;

        // lueur : forte pendant les « brrr », faible entre les deux ; douce au survol
        let g = 0;
        if (state === 'ringing') g = on ? 1 : 0.25;
        else if (state === 'inCall') g = 0.15;
        else if (hover) g = 0.2;
        glow += (g - glow) * Math.min(1, dt * 12);
        mRed.emissiveIntensity = 0.12 + glow * 0.5;
        mCream.emissiveIntensity = 0.05 + glow * 0.3;
        halo.material.opacity = state === 'ringing' ? glow * 0.9 : 0;
        if (state === 'ringing') mBulb.color.setHex(on ? 0xff3b30 : 0x6a1410);
        else if (state === 'inCall') mBulb.color.setHex(0x2ecc71);
        else mBulb.color.setHex(0x3a0a0a);
    }

    // ─── CLIC / SURVOL ───────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function reachable() {
        if (!camera) return false;
        const q = camera.position;
        if (q.x > 100 || Math.abs(q.y - 1.7) > 1.2 || q.z < 0.3) return false;
        return Math.hypot(q.x - worldPos.x, q.z - worldPos.z) < 3.4;
    }

    function overPhone(ev) {
        if (!canvas || !reachable()) return false;
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        raycaster.far = 4;
        return raycaster.intersectObject(root, true).length > 0;
    }

    if (canvas) {
        canvas.addEventListener('mousemove', function(ev) {
            hover = overPhone(ev);
            if (hover) canvas.style.cursor = 'pointer';
        });
        canvas.addEventListener('mouseleave', function() { hover = false; });

        let downX = 0, downY = 0;
        canvas.addEventListener('pointerdown', function(ev) { downX = ev.clientX; downY = ev.clientY; });
        canvas.addEventListener('click', function(ev) {
            if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;     // un glissé pour regarder autour n'est pas un clic
            if (!overPhone(ev)) return;
            if (state === 'ringing') answer(true);
            else if (state === 'inCall') hangUp();
            else dial();
        });
    }

    const api = {
        update: update,
        group: root,
        ring: function() { return ring('api'); },
        stopRing: stopRing,
        answer: function() { return answer(false); },
        hangUp: hangUp,
        getState: function() { return state; },
        isRinging: function() { return state === 'ringing'; },
        say: say,
        stopSpeaking: stopSpeaking,
        setSound: function(on) { soundOn = !!on; if (!soundOn) stopSound(); },
        onAnswer: function(fn) { handlers.answer.push(fn); },
        onHangUp: function(fn) { handlers.hangup.push(fn); },
        onDial: function(fn) { handlers.dial.push(fn); },
        // utile pour tester : le point de l'écran est-il sur le téléphone ?
        isOver: overPhone
    };
    window.BadTherapistPhone = api;
    return api;
}
