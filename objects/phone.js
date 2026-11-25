// objects/phone.js – le téléphone 3D (un modèle de téléphone rouge, utilisable partout).
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH. Comments: FR.                            ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// L'OBJET seulement : sonnerie, secousses, lueur, combiné qui se lève. Les numéros, les contacts et l'écran sont dans engine/phones.js.
//
// ─ UN FICHIER POUR TOUS LES TÉLÉPHONES ─────────────────────────────────────────────────
//     buildPhone(scene, { owner: 'player' | 'evelyn' | ..., phoneId, parent: groupe, position: {x, y, z}, yaw, camera, canvas, theme, ... })
// Chaque téléphone 3D correspond à une ligne de PHONE_LINES (engine/phones.js) : celle dont le propriétaire est `owner`, ou opts.phoneId.
// Seules les couleurs (PHONE_THEMES) et le placement changent d'un téléphone à l'autre.
// Pour ajouter un téléphone (taxi, voiture de police, maison de quelqu'un) : une ligne dans PHONE_LINES + un buildPhone(...).
//
// ─ CE QU'IL FAIT ───────────────────────────────────────────────────────────────────────
// Il écoute l'événement window « badtherapist:call » (envoyé par society.js) :
//   • un appel arrive sur CE téléphone  -> il sonne, toujours (le téléphone ne sait pas si quelqu'un est là ; seul un joueur à côté l'entend)
//   • on appelle DEPUIS ce téléphone    -> le combiné se lève, on entend la tonalité d'appel (« tuuut... tuuut... », différente de la sonnerie
//                                          de réception) jusqu'à ce que ça décroche ou que ça finisse ; il retombe quand l'appel finit
//   • clic sur un téléphone qui sonne pour le joueur -> il décroche ; clic pendant un appel -> il raccroche
//   • clic sur un téléphone au repos    -> événement badtherapist:phone-dial (engine/phones.js ouvre l'écran : contacts, messages)
// Il ne fait AUCUN pop-up : on touche le téléphone pour voir les messages.
// Le son ne s'entend que si le joueur est à l'endroit où le téléphone est posé (même règle que pour les personnages : phones.hears).
//
// ─ POUR LES AUTRES FICHIERS ────────────────────────────────────────────────────────────
//   window.BadTherapistPhones.player / .evelyn / ...   (et window.BadTherapistPhone = celui du joueur)
//   ring()  stopRing()  answer()  hangUp()  getState() ('idle' | 'ringing' | 'inCall')  say(texte)  onAnswer(fn)  onHangUp(fn)  onDial(fn)
//   événements sur window : badtherapist:phone-answer / -hangup / -dial (detail.owner = à qui est le téléphone)
//   celui d'Evelyn envoie aussi : badtherapist:phone-evelyn-answer / -hangup / -dial
// Options : owner, phoneId, theme, parent, position, yaw, reachable(camera, worldPos), audible(distance)
// Pour tester : F12 > console > BadTherapistPhone.ring()

import * as THREE from 'three';

// Couleurs par propriétaire. Pour un nouveau téléphone : ajoute une ligne ici.
export const PHONE_THEMES = {
    player: { body: 0x8a1c28, cream: 0xd9d0b0, emissive: 0xff5a3c, halo: ['255,120,90', '255,70,50', '255,50,30'],
              bulbOff: 0x3a0a0a, ringOn: 0xff3b30, ringOff: 0x6a1410, inCall: 0x2ecc71 },
    evelyn: { body: 0x1d5c6b, cream: 0xe9dfc4, emissive: 0x4cc9f0, halo: ['130,215,255', '60,165,235', '40,120,220'],
              bulbOff: 0x0a2530, ringOn: 0x4cc9f0, ringOff: 0x14505f, inCall: 0x2ecc71 }
};

export function buildPhone(scene, opts) {
    opts = opts || {};
    const camera = opts.camera;
    const canvas = opts.canvas;
    const anchor = opts.anchor;                 // la table de chevet (nightstand.group)
    const owner = opts.owner || 'player';
    const theme = Object.assign({}, PHONE_THEMES.player, PHONE_THEMES[owner] || {}, opts.theme || {});
    const TOP_Y = 0.60;                         // dessus de la table de chevet
    const RING_PERIOD = 3.0;                    // une sonnerie (2 coups) toutes les 3 secondes
    const CALL_MAX = 90;                        // sécurité : raccroche tout seul après 90 s si personne ne le fait
    let soundOn = opts.sound !== false;

    // ─── PLACEMENT ───────────────────────────────────────────────
    const root = new THREE.Group();
    if (anchor) {
        root.position.copy(anchor.position);
        root.rotation.y = anchor.rotation.y;
        root.position.y = TOP_Y;
    } else if (opts.position) {
        root.position.set(opts.position.x || 0, opts.position.y || 0, opts.position.z || 0);   // y = dessus du meuble
        root.rotation.y = opts.yaw || 0;
    } else {
        root.position.set(-7.72, TOP_Y, 1.75);
        root.rotation.y = Math.PI / 2;
    }
    (opts.parent || scene).add(root);

    const body = new THREE.Group();
    body.position.set(0, 0, -0.03);
    root.add(body);

    // ─── MATÉRIAUX ───────────────────────────────────────────────
    function glowTex() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
        g.addColorStop(0, 'rgba(' + theme.halo[0] + ',1)');
        g.addColorStop(0.35, 'rgba(' + theme.halo[1] + ',0.45)');
        g.addColorStop(1, 'rgba(' + theme.halo[2] + ',0)');
        x.fillStyle = g;
        x.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding;
        return t;
    }

    const mRed = new THREE.MeshLambertMaterial({ color: theme.body, emissive: theme.emissive });      // « Red » = la couleur du corps (rouge pour le joueur)
    const mCream = new THREE.MeshLambertMaterial({ color: theme.cream, emissive: theme.emissive });
    const mDark = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
    const mBulb = new THREE.MeshBasicMaterial({ color: theme.bulbOff });
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
    let ringSource = null;              // 'api' | 'call'
    let clock = 0;
    let ringStart = 0;
    let lastCycle = -1;
    let callStart = 0;
    let shakeAmt = 0, lift = 0, glow = 0, nudge = 0;
    let hover = false;
    let ringback = false, rbNext = 0;     // tonalité d'appel : on appelle depuis ce téléphone et ça sonne de l'autre côté
    const handlers = { answer: [], hangup: [], dial: [] };

    function fire(name, detail) {
        handlers[name].forEach(function(fn) { try { fn(detail); } catch (e) { console.error('[phone]', e); } });
        const det = Object.assign({ owner: owner }, detail || {});
        // Le téléphone du joueur : badtherapist:phone-<nom>. Celui d'Evelyn envoie les DEUX :
        //   badtherapist:phone-evelyn-<nom>  (pour ce qui ne concerne qu'elle)  et  badtherapist:phone-<nom>  avec detail.owner = 'evelyn'
        // -> ce que ton phone-service.js fait déjà quand tu décroches / raccroches / composes marche donc aussi avec son téléphone.
        try { window.dispatchEvent(new CustomEvent('badtherapist:phone-' + name, { detail: det })); } catch (e) {}
        if (owner !== 'player') { try { window.dispatchEvent(new CustomEvent('badtherapist:phone-' + owner + '-' + name, { detail: det })); } catch (e) {} }
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

    // tonalité d'appel : un « tuuut » long et grave (425 Hz, 1 s toutes les 3 s) ; on le reconnaît tout de suite de la sonnerie de réception
    function ringbackTone(t0) {
        const env = AC.createGain();
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(1, t0 + 0.03);
        env.gain.setValueAtTime(1, t0 + 0.97);
        env.gain.linearRampToValueAtTime(0, t0 + 1.0);
        const o = AC.createOscillator();
        o.type = 'sine';
        o.frequency.value = 425;
        o.connect(env);
        env.connect(master);
        o.start(t0);
        o.stop(t0 + 1.05);
    }
    function startRingback() { if (state === 'inCall') { ringback = true; rbNext = 0; } }
    function stopRingback() { if (ringback) { ringback = false; stopSound(); } }

    const tmp = new THREE.Vector3();

    // volume selon la distance, et d'où vient le son (gauche / droite)
    function updateSoundPosition() {
        if (!AC || !master || !(state === 'ringing' || ringback) || !camera) return;
        const d = camera.position.distanceTo(worldPos);
        let gain = 0;
        if (typeof opts.audible === 'function') gain = opts.audible(d) || 0;                        // ex. maison d'Evelyn : audible seulement à côté
        else if (playerHears() !== false) gain = 0.04 + 0.5 * Math.pow(Math.max(0, 1 - d / 25), 2);   // seulement si le joueur est là où le téléphone est posé
        master.gain.setTargetAtTime(gain * (ringback ? 0.35 : 0.5), AC.currentTime, 0.05);
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
        ringSource = source === 'call' ? 'call' : 'api';
        ringStart = clock;
        lastCycle = -1;
        return true;
    }

    function stopRing() {
        if (state !== 'ringing') return false;
        state = 'idle';
        ringSource = null;
        stopSound();
        return true;
    }

    function answer() {
        if (state !== 'ringing') return false;
        const source = ringSource;
        stopSound();
        state = 'inCall';
        ringSource = null;
        callStart = clock;
        fire('answer', { source: source });
        return true;
    }

    function hangUp() {
        if (state !== 'inCall') return false;
        state = 'idle';
        ringback = false;
        stopSound();
        stopSpeaking();
        const c = myCall();
        if (c) { try { window.BadTherapistSociety.calls.hangUp('player'); } catch (e) { console.error('[phone]', e); } }   // raccrocher ici = raccrocher l'appel du joueur
        fire('hangup');
        return true;
    }
    // l'appel est fini ailleurs (l'autre a raccroché, appel manqué) : on repose le combiné sans rien déclencher
    function forceIdle() {
        ringback = false;
        stopSound();
        stopSpeaking();
        state = 'idle';
        ringSource = null;
    }

    // ─── LIEN AVEC LES APPELS DE society.js ──────────────────────
    function myPhoneId() {
        if (opts.phoneId) return opts.phoneId;
        const net = window.BadTherapistPhoneNet;
        const p = net && net.ofOwner ? net.ofOwner(owner) : null;
        return p ? p.id : null;
    }
    // l'appel en cours (sonne ou actif) du JOUEUR qui passe par ce téléphone
    function myCall() {
        const S = window.BadTherapistSociety, id = myPhoneId();
        if (!S || !S.calls || !id) return null;
        const list = S.calls.list().filter(function(c) {
            return (c.status === 'ringing' || c.status === 'active') && (c.from === 'player' || c.to === 'player') && (c.fromPhone === id || c.toPhone === id);
        });
        return list.length ? list[list.length - 1] : null;
    }
    function incomingForPlayer() {
        const S = window.BadTherapistSociety, id = myPhoneId();
        if (!S || !S.calls || !id) return null;
        return S.calls.incoming('player').filter(function(c) { return c.toPhone === id && c.from !== c.to; })[0] || null;
    }
    // le joueur est-il là où ce téléphone est posé ? (engine/phones.js : hears) ; null = le système n'est pas là, on ne sait pas
    function playerHears() {
        const net = window.BadTherapistPhoneNet, S = window.BadTherapistSociety, id = myPhoneId();
        const me = S && S.registry ? S.registry.actor('player') : null;
        const ph = net && id ? net.get(id) : null;
        if (!net || !me || !ph) return null;
        return net.hears(me, ph);
    }
    window.addEventListener('badtherapist:call', function(ev) {
        const d = ev.detail || {}, id = myPhoneId();
        if (!id) return;
        const over = d.state === 'missed' || d.state === 'ended';
        if (d.toPhone === id) {                                          // un appel arrive ici
            if (d.state === 'ringing') ring('call');                     // il sonne toujours : le téléphone ne sait pas si quelqu'un est là
            else if (d.state === 'active' && state === 'ringing') { stopSound(); state = 'inCall'; ringSource = null; callStart = clock; }
            else if (over) { if (state === 'ringing') stopRing(); else if (state === 'inCall') forceIdle(); }
        }
        if (d.fromPhone === id) {                                        // on appelle depuis ce téléphone : le combiné est levé
            if ((d.state === 'ringing' || d.state === 'active') && state === 'idle') { state = 'inCall'; callStart = clock; }
            else if (over && state === 'inCall') forceIdle();
            if (d.state === 'ringing') startRingback(); else stopRingback();      // ça sonne là-bas : tonalité ; décroché, manqué ou fini : silence
        }
    });

    function dial() {
        if (state !== 'idle') return false;
        nudge = 1;                                           // le combiné vibre : on appelle
        if (!handlers.dial.length) console.info('[phone:' + owner + '] numéro composé : rien n\'est encore branché sur onDial');
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

    // ─── ANIMATION ───────────────────────────────────────────────
    function update(dt) {
        dt = Math.min(dt || 0, 0.1);
        clock += dt;
        root.getWorldPosition(worldPos);          // le lieu peut avoir été déplacé après la construction (décalage du monde)
        worldPos.y += 0.08;

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
        } else if (state === 'inCall' && ringback) {
            if (clock >= rbNext && ensureAudio()) { rbNext = clock + 3.0; ringbackTone(AC.currentTime + 0.02); }
            updateSoundPosition();
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
        if (state === 'ringing') mBulb.color.setHex(on ? theme.ringOn : theme.ringOff);
        else if (state === 'inCall') mBulb.color.setHex(theme.inCall);
        else mBulb.color.setHex(theme.bulbOff);
    }

    // ─── CLIC / SURVOL ───────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function reachable() {
        if (!camera) return false;
        if (typeof opts.reachable === 'function') return !!opts.reachable(camera, worldPos);
        const q = camera.position;
        if (Math.abs(q.y - worldPos.y) > 2.2) return false;
        if (Math.hypot(q.x - worldPos.x, q.z - worldPos.z) >= 3.4) return false;
        return playerHears() !== false;                      // il faut aussi être dans le lieu où le téléphone est posé
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
            if (state === 'ringing') {
                if (ringSource === 'call') {                         // appel de society.js : on ne décroche que s'il est pour le joueur
                    if (!incomingForPlayer()) return;
                    if (answer()) { try { window.BadTherapistSociety.calls.answer('player'); } catch (e) { console.error('[phone]', e); } }
                } else answer();
            }
            else if (state === 'inCall') hangUp();
            else dial();
        });
    }

    const api = {
        update: update,
        group: root,
        ring: function() { return ring('api'); },
        stopRing: stopRing,
        answer: function() { return answer(); },
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
    api.owner = owner;
    if (owner === 'player') window.BadTherapistPhone = api;                  // inchangé : le téléphone du joueur
    window.BadTherapistPhones = window.BadTherapistPhones || {};
    window.BadTherapistPhones[owner] = api;                                  // tous les téléphones, par propriétaire
    return api;
}
