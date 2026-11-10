// evelyn-phone.js – le téléphone d'Evelyn.
//
// Quand Evelyn a décidé de rappeler le patient (elle fixe elle-même le délai à la fin d'une séance, voir
// next_call_hours dans therapist-ai.js), ce fichier fait sonner un téléphone tant que le joueur est dans l'immeuble.
// Il décroche, Evelyn parle (IA), rappelle son tarif, et quand il accepte elle lui dit de venir chez elle.
//
// Pour l'instant le téléphone est un petit bouton à l'écran (pas encore un objet 3D dans la chambre).
// À charger sur la page du jeu : world_base.html  ->  <script type="module" src="evelyn-phone.js"></script>
//
// Pour TESTER sans attendre : ouvre la console (F12) et tape   BadTherapistEvelyn.callNow()

import { createTherapistTalk } from './therapist-ai.js';
import { Mem } from './therapist-memory.js';
import { createEvelynLife } from './evelyn-life.js';
import { createPhoneItem } from './phone-item.js';

// Les mondes où le joueur est « dans l'immeuble » (là où le téléphone peut sonner). Corrige les noms si besoin.
const BUILDING_WORLDS = ['bedroom.js', 'corridor.js', 'elevator.js', 'rdc.js', 'immeuble.js'];
const CHECK_MS = 4000;          // le jeu regarde toutes les 4 s si le téléphone doit sonner
const RING_MS = 30000;          // il sonne 30 s, puis reste « appel manqué » jusqu'à ce qu'on le rappelle
const RETRY_AFTER_MS = 60000;   // si le joueur raccroche trop tôt, ça resonne 1 min plus tard
const FIRST_CALL_MS = 20000;    // (utilisé seulement si AUTO_FIRST_CALL est vrai)
const AUTO_FIRST_CALL = false;  // false : plus d'appel automatique au début, Evelyn décide seule si et quand elle appelle
const IMPULSE_MS = 600000;      // toutes les 10 min (jeu ouvert), Evelyn se demande si elle a envie d'appeler

const CSS = `
.evp{position:fixed;right:14px;top:14px;z-index:220;display:none;background:#050505;color:#f2f2f2;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;
  padding:10px 12px;font-family:'Press Start 2P',monospace;font-size:9px;line-height:1.7;cursor:pointer}
.evp.on{display:block}
.evp.ring{animation:evpr .5s steps(2) infinite}
@keyframes evpr{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,1px) rotate(-2deg)}75%{transform:translate(2px,-1px) rotate(2deg)}}
.evp small{display:block;font-size:7px;color:#9a9a9a;margin-top:4px}
.evpi{position:fixed;left:14px;top:14px;z-index:215;background:#050505;color:#f2f2f2;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;padding:8px 10px;
  font-family:'Press Start 2P',monospace;font-size:12px;line-height:1;cursor:pointer}
.evpi i{position:absolute;right:-6px;top:-6px;background:#f2f2f2;color:#000;font:normal 8px 'Press Start 2P',monospace;padding:3px 4px;display:none}
.evpi.new i{display:block}
`;

let ui = null, talk = null;
let inCall = false, ringStart = 0, nextTry = 0, ringTimer = null, audioCtx = null;
let life = null, item = null, missedLogged = false;

function currentWorld() {
    try {
        const o = JSON.parse(localStorage.getItem('bt_player_state') || 'null');
        return o && o.last ? String(o.last) : '';
    } catch (e) { return ''; }
}
function inBuilding() {
    const w = currentWorld();
    return !w || BUILDING_WORLDS.indexOf(w) !== -1;
}

function buildUi() {
    if (ui) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    ui = document.createElement('div');
    ui.className = 'evp';
    document.body.appendChild(ui);
    ui.addEventListener('click', answer);
}

function showUi(ringing) {
    buildUi();
    ui.className = 'evp on' + (ringing ? ' ring' : '');
    ui.innerHTML = ringing
        ? '&#9742; EVELYN IS CALLING<small>click to answer</small>'
        : '&#9742; MISSED CALL: EVELYN<small>click to call back</small>';
}

function hideUi() {
    if (ui) ui.className = 'evp';
}

// Sonnerie : deux bips, répétés (respecte le volume et le mode muet du jeu)
function ringOnce() {
    const A = window.BadTherapistAudio;
    if (A && A.isMuted && A.isMuted()) return;
    const vol = (A && A.getVolume ? A.getVolume() : 0.7) * 0.18;
    if (vol <= 0) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        [0, 0.22].forEach(function (d) {
            const t = audioCtx.currentTime + d;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 880;
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            osc.connect(g); g.connect(audioCtx.destination);
            osc.start(t); osc.stop(t + 0.18);
        });
    } catch (e) { /* pas de son possible : tant pis */ }
}

function startRinging() {
    if (ringTimer) return;
    ringOnce();
    ringTimer = setInterval(function () {
        if (Date.now() - ringStart > RING_MS) { stopRinging(); showUi(false); return; }
        ringOnce();
    }, 2000);
}
function stopRinging() {
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
}

function getTalk() {
    if (talk) return talk;
    talk = createTherapistTalk({
        getWorld: function () {
            return [];
        },
        onCallEnd: function (completed, kind) {
            if (kind === 'out') {                         // c'est le patient qui l'avait appelée : rien à voir avec ses rappels
                inCall = false;
                if (Mem.callDue()) Mem.clearDueCall();   // il est joint : son appel dû est réglé
                ringStart = 0;
                return;
            }
            inCall = false;
            ringStart = 0;
            if (completed) Mem.noteCallDone();            // l'appel a eu lieu (elle a pu fixer un nouveau rappel)
            else nextTry = Date.now() + RETRY_AFTER_MS;   // raccroché trop tôt : ça resonnera plus tard
        }
    });
    return talk;
}

function answer() {
    if (inCall || !Mem.callDue()) return;
    inCall = true;
    stopRinging();
    hideUi();
    getTalk().openCall();
}

function tick() {
    if (inCall || document.hidden) return;
    // TOUT NOUVEAU joueur seulement (Mem.needsFirstCall() est faux pour toute sauvegarde déjà vécue) : elle l'appelle la première fois
    if (AUTO_FIRST_CALL && inBuilding() && Mem.needsFirstCall()) Mem.setCallAt(Date.now() + FIRST_CALL_MS, 'première prise de contact');
    if (!Mem.callDue() || !inBuilding()) { stopRinging(); hideUi(); ringStart = 0; return; }
    if (Date.now() < nextTry) return;
    if (!ringStart) { ringStart = Date.now(); missedLogged = false; }
    if (Date.now() - ringStart <= RING_MS) { showUi(true); startRinging(); }
    else {
        stopRinging();
        showUi(false);
        if (!missedLogged) {                                  // elle a sonné 30 s sans réponse : elle le saura
            missedLogged = true;
            Mem.noteMissedCall(false);                        // false = on garde « MISSED CALL » à l'écran, on ne reprogramme rien
            if (life) life.sync();
        }
    }
}

// ─── Téléphone portable (item), vie d'Evelyn, appel du patient, envies d'appeler ───
function gameTime() {
    try { return window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : ''; } catch (e) { return ''; }
}

function buildPhoneButton() {
    const b = document.createElement('div');
    b.className = 'evpi';
    b.innerHTML = '&#9742;<i>NEW</i>';
    b.title = 'Phone';
    b.addEventListener('click', function () { if (item) item.toggle(); });
    document.body.appendChild(b);
    const refresh = function () {
        const unheard = Mem.get().voicemails.some(function (v) { return !v.heard; });
        b.classList.toggle('new', unheard);
    };
    refresh();
    if (life && life.onChange) life.onChange(refresh);
    setInterval(refresh, 5000);
}

// Le portable prévient ce fichier quand le joueur lance / termine un appel vers Evelyn
function onDialStart() { inCall = true; stopRinging(); hideUi(); }
function onDialResult(r) { if (!r || !r.answered) inCall = false; }     // si elle a décroché, onCallEnd(..., 'out') libère

function startLife() {
    if (life) return;
    const t = getTalk();
    life = createEvelynLife({ talk: t, getGameTime: gameTime });
    item = createPhoneItem({ talk: t, life: life, getGameTime: gameTime, onCallStart: onDialStart, onCallResult: onDialResult });
    life.start();
    buildPhoneButton();
    // cliquer le téléphone de la chambre (au repos) OUVRE le portable : journal d'appels, messages, bouton CALL. Ça n'appelle pas.
    window.addEventListener('badtherapist:phone-dial', function () { if (item && !inCall) item.open(); });
    setInterval(function () {
        if (inCall || document.hidden || !inBuilding() || Mem.callDue()) return;
        t.considerCall().catch(function () { /* rien */ });              // si elle en a envie, Mem.callDue() devient vrai et le téléphone sonne
    }, IMPULSE_MS);
    window.BadTherapistPhoneItem = item;
}

setInterval(tick, CHECK_MS);

// Pour tester dans la console : BadTherapistEvelyn.callNow()
window.BadTherapistEvelyn = {
    callNow: function () { Mem.scheduleCall(0.0001, 'test call'); const m = Mem.get(); m.nextCall.dueAt = Date.now() - 1; Mem.importData(m); nextTry = 0; ringStart = 0; tick(); },
    dial: function () { return item ? item.callNow() : null; },
    sync: function () { return life ? life.sync() : null; },
    status: function () { return { due: Mem.callDue(), nextCall: Mem.get().nextCall, world: currentWorld() }; }
};

startLife();
