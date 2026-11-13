// speech-bubbles.js – la bulle de parole de TOUS les avatars (Oliver, Pluie, Evelyn dehors...), comme celle d'Evelyn chez elle :
//   • AU-DESSUS DE LA TÊTE de l'avatar, elle le suit quand il marche ;
//   • le texte s'écrit lettre par lettre (lentement), avec le « blip » (voix un peu différente selon l'avatar) ;
//   • elle RESTE LONGTEMPS puis s'efface doucement ; elle ne s'efface pas tant que tu lui réponds ou que la souris est dessus ;
//   • tu peux RÉPONDRE de 3 façons : cliquer sur l'avatar, cliquer sur sa bulle, ou appuyer sur ENTRÉE.
//     Une grande boîte de saisie s'ouvre en bas (comme la séance d'Evelyn) : ENTRÉE = envoyer, ÉCHAP ou X = fermer ;
//   • quand tu envoies, sa bulle affiche « ... » pendant qu'il réfléchit, puis sa réponse s'écrit.
//
// Réglages : BUBBLE_TYPE_MS (vitesse du texte), HOLD_MIN_MS / HOLD_PER_CHAR_MS (durée d'affichage), REPLY_KEY.
// Le texte est inséré avec textContent : rien de ce que dit une IA ne peut casser la page.

import { THERAPIST_CONFIG } from './therapist-config.js';

const hasDom = typeof document !== 'undefined';
const REPLY_KEY = 'Enter';
const REPLY_WINDOW_MS = 90000;      // temps pendant lequel ENTRÉE ouvre la réponse après sa dernière phrase
const BUBBLE_TYPE_MS = (THERAPIST_CONFIG && THERAPIST_CONFIG.bubbleTypeSpeedMs) || 65;   // ms par lettre (plus grand = plus lent)
const HOLD_MIN_MS = 9000;           // elle reste au moins 9 s après la fin du texte
const HOLD_PER_CHAR_MS = 150;       // + 150 ms par lettre
const FADE_MS = 1500;
const THINK_MAX_MS = 40000;         // « ... » s'arrête seul si l'avatar ne répond pas
const boxes = {};
let replyFn = null, hangUpFn = null, reply = null, audioCtx = null, styled = false;

const CSS = `
.bt-say{position:fixed;left:0;top:0;z-index:205;display:none;pointer-events:auto;cursor:pointer;width:max-content;max-width:min(360px,80vw);
  background:#050505;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;color:#f2f2f2;padding:12px 14px;
  font-family:'Press Start 2P',monospace;font-size:clamp(9px,2.2vw,13px);line-height:1.8;white-space:pre-wrap;word-wrap:break-word;
  transform:translate(-50%,-100%);opacity:1;transition:opacity ${FADE_MS}ms ease}
.bt-say.out{opacity:0;pointer-events:none}
.bt-say::after{content:"";position:absolute;left:50%;bottom:-13px;margin-left:-8px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #f2f2f2}
.bt-say .n{color:#e8c872;margin-bottom:4px}
.bt-say .k{display:none;margin-top:8px;font-size:.62em;color:#9a9a9a}
.bt-say.done .k{display:block}
.bt-caret{display:inline-block;width:.7em;height:1em;background:#f2f2f2;vertical-align:-0.12em;margin-left:2px;animation:btc .7s steps(1) infinite}
@keyframes btc{50%{opacity:0}}
.bt-reply{position:fixed;left:0;right:0;bottom:0;z-index:226;display:none;justify-content:center;pointer-events:none;
  padding:0 12px max(12px,env(safe-area-inset-bottom));font-family:'Press Start 2P',monospace}
.bt-reply.on{display:flex}
.bt-reply .b{pointer-events:auto;width:min(760px,100%);background:#050505;border:4px solid #f2f2f2;box-shadow:0 0 0 4px #000;padding:12px 14px}
.bt-reply .t{display:none;font-size:clamp(10px,2.4vw,14px);line-height:1.9;min-height:3.8em;max-height:28vh;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;margin-bottom:10px;color:#f2f2f2}
.bt-reply.call .t{display:block}
.bt-reply .h:empty{display:none}
.bt-reply .h{font-size:9px;line-height:1.7;color:#e8c872;margin-bottom:8px;min-height:15px}
.bt-reply .r{display:flex;gap:8px}
.bt-reply input{flex:1;min-width:0;background:#000;border:2px solid #777;color:#f2f2f2;font-family:inherit;font-size:clamp(10px,2.4vw,13px);padding:11px;outline:0}
.bt-reply input:focus{border-color:#f2f2f2}
.bt-reply button{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:10px;padding:0 12px;cursor:pointer}
.bt-reply button:hover{background:#f2f2f2;color:#000}
`;

function ensureStyle() {
    if (!hasDom || styled) return;
    styled = true;
    if (!document.getElementById('bt-pixel-font')) {
        const l = document.createElement('link');
        l.id = 'bt-pixel-font'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(l);
    }
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
}

// ─── Le « blip » (chaque avatar a sa hauteur de voix) ───
function pitchOf(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 90; return 150 + h; }
function blip(b) {
    const A = window.BadTherapistAudio;
    if (A && A.isMuted && A.isMuted()) return;
    const vol = (A && A.getVolume ? A.getVolume() : 0.7) * 0.22;
    if (vol <= 0) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = b.pitch + Math.random() * 70;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 0.08);
    } catch (e) { /* pas de son possible : tant pis */ }
}

// ─── Machine à écrire (lettre par lettre, curseur clignotant, pauses aux virgules et aux points) ───
function typeInto(b, host, text, done) {
    const h = { timer: null, i: 0, dead: false };
    host.textContent = '';
    if (!text) { h.dead = true; if (done) done(); return h; }
    const node = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'bt-caret';
    host.appendChild(node); host.appendChild(caret);
    const sp = BUBBLE_TYPE_MS;
    const step = function () {
        if (h.dead) return;
        const c = text.charAt(h.i++);
        node.nodeValue += c;
        if (b.vis && c.trim() !== '' && h.i % 2 === 1) blip(b);
        if (h.i >= text.length) { h.dead = true; caret.remove(); if (done) done(); return; }
        h.timer = setTimeout(step, /[.!?]/.test(c) ? sp * 7 : /[,;:]/.test(c) ? sp * 3 : sp);
    };
    h.cancel = function () { h.dead = true; clearTimeout(h.timer); caret.remove(); };
    h.finish = function () { if (h.dead) return; h.cancel(); host.textContent = text; if (done) done(); };
    step();
    return h;
}

function box(id) {
    let b = boxes[id];
    if (b) return b;
    ensureStyle();
    b = boxes[id] = { id: id, el: document.createElement('div'), typing: null, hideT: 0, fadeT: 0, dotsT: 0, thinkEnd: 0, shown: false, vis: false, hover: false, lastAt: 0, lastSeen: 0, pitch: pitchOf(id) };
    b.el.className = 'bt-say';
    b.nameEl = document.createElement('div'); b.nameEl.className = 'n';
    b.txtEl = document.createElement('div');
    b.hintEl = document.createElement('div'); b.hintEl.className = 'k'; b.hintEl.textContent = '[ click or press ENTER to answer ]';
    b.el.appendChild(b.txtEl);                                         // juste le texte : ni nom, ni consigne
    b.el.addEventListener('mouseenter', function () { b.hover = true; });
    b.el.addEventListener('mouseleave', function () { b.hover = false; });
    b.el.addEventListener('click', function (e) { e.stopPropagation(); Bubbles.talkTo(id); });   // clic sur la bulle = répondre
    document.body.appendChild(b.el);
    return b;
}

function stopDots(b) { clearInterval(b.dotsT); b.dotsT = 0; b.thinkEnd = 0; }

function fadeOut(b) {
    clearTimeout(b.hideT);
    // elle reste tant que tu lui écris ou que la souris est dessus
    if ((reply && reply.open && reply.target === b.id) || b.hover) { b.hideT = setTimeout(function () { fadeOut(b); }, 2500); return; }
    b.el.classList.add('out');
    clearTimeout(b.fadeT);
    b.fadeT = setTimeout(function () { b.shown = false; b.el.style.display = 'none'; }, FADE_MS + 100);
}

// ─── Zone de réponse (grande, en bas, comme la séance d'Evelyn) ───
function buildReply() {
    if (reply || !hasDom) return reply;
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'bt-reply';
    root.innerHTML = '<div class="b"><div class="t"></div><div class="h"></div><div class="r"><input type="text" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Say something..."><button type="button" class="s">SEND</button><button type="button" class="x" aria-label="Close">X</button></div></div>';
    document.body.appendChild(root);
    reply = { root: root, txt: root.querySelector('.t'), call: false, typing: null, dotsT: 0, name: '', hint: root.querySelector('.h'), input: root.querySelector('input'), send: root.querySelector('.s'), close: root.querySelector('.x'), target: null, open: false, note: '', noteUntil: 0 };
    root.addEventListener('keydown', function (e) {
        e.stopPropagation();                                           // les touches tapées ici ne font pas marcher le joueur
        if (e.key === 'Enter') { e.preventDefault(); sendReply(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeReply(); }
    });
    root.addEventListener('keyup', function (e) { e.stopPropagation(); });
    root.addEventListener('click', function (e) { e.stopPropagation(); });
    reply.send.addEventListener('click', sendReply);
    reply.close.addEventListener('click', closeReply);
    document.addEventListener('keydown', function (e) {
        if (e.key !== REPLY_KEY) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        if (reply.open) { e.preventDefault(); e.stopPropagation(); reply.input.focus(); return; }
        const best = pickBest();
        if (!best) return;
        e.preventDefault(); e.stopPropagation();
        Bubbles.talkTo(best.id);
    }, true);
    return reply;
}

function pickBest() {
    const now = Date.now();
    let best = null;
    Object.keys(boxes).forEach(function (id) {
        const b = boxes[id];
        if (b.vis && now - b.lastAt < REPLY_WINDOW_MS && (!best || b.lastAt > best.lastAt)) best = b;
    });
    return best;
}

function stopPhoneFx() {
    if (!reply) return;
    clearInterval(reply.dotsT); reply.dotsT = 0;
    if (reply.typing) { reply.typing.cancel(); reply.typing = null; }
}
function closeReply() {
    if (!reply) return;
    if (reply.call) { const f = hangUpFn; reply.call = false; if (f) { try { f(); } catch (e) { /* rien */ } } }   // fermer la boîte pendant un appel = raccrocher
    stopPhoneFx();
    reply.open = false;
    reply.root.classList.remove('on', 'call');
    reply.input.blur();
}

function sendReply() {
    if (!reply || !reply.open || !reply.target || !replyFn) return;
    const text = reply.input.value.trim();
    if (!text) return;
    const id = reply.target, b = box(id);
    reply.input.value = '';
    reply.input.focus();                                               // on reste prêt à continuer la conversation
    b.lastAt = Date.now();
    if (reply.call) Bubbles.phoneThink(); else Bubbles.think(id);       // « ... » pendant qu'il réfléchit
    Promise.resolve(replyFn(id, text)).then(function (res) {
        if (typeof res === 'string' && /not here|nobody|cannot|do not|unknown|too far/i.test(res)) {
            reply.note = res; reply.noteUntil = Date.now() + 4000;
            if (reply.call) stopPhoneFx(); else if (!b.typing) { stopDots(b); fadeOut(b); }
        }
    }).catch(function () { stopDots(b); });
}

function updateReply() {
    if (!hasDom || !replyFn) return;
    const r = buildReply(), now = Date.now();
    if (!r.open) return;
    if (r.call) { r.hint.textContent = Date.now() < r.noteUntil ? r.note : ''; return; }
    const b = boxes[r.target];
    if (!b || (!b.vis && now - b.lastSeen > 6000)) { closeReply(); return; }      // il est parti / trop loin : on ferme
    r.hint.textContent = now < r.noteUntil ? r.note : '';                // seul un vrai problème s'écrit ici (« il n'est pas là »...)
}
if (hasDom) setInterval(updateReply, 250);

export const Bubbles = {
    // Affiche une bulle (remplace la précédente de cet avatar). Le paramètre ms ne peut que rallonger la durée.
    say: function (id, name, text, ms) {
        if (!hasDom || !document.body) return;
        text = String(text || '').trim().slice(0, 240);
        if (!text) return;
        const b = box(id);
        clearTimeout(b.hideT); clearTimeout(b.fadeT); stopDots(b);
        if (b.typing) b.typing.cancel();
        if (name) b.nameEl.textContent = name;
        b.el.classList.remove('out', 'done');
        b.shown = true;
        b.lastAt = Date.now();
        if (b.vis) b.el.style.display = 'block';
        b.typing = typeInto(b, b.txtEl, text, function () {
            b.typing = null;
            b.el.classList.add('done');
            const hold = Math.max(ms || 0, HOLD_MIN_MS, text.length * HOLD_PER_CHAR_MS);
            b.hideT = setTimeout(function () { fadeOut(b); }, hold);      // le temps de lire, puis elle s'efface doucement
        });
    },
    // « ... » animés dans sa bulle : il réfléchit à ce que tu viens de dire
    think: function (id) {
        if (!hasDom) return;
        const b = box(id);
        clearTimeout(b.hideT); clearTimeout(b.fadeT); stopDots(b);
        if (b.typing) { b.typing.cancel(); b.typing = null; }
        b.el.classList.remove('out', 'done');
        b.shown = true;
        if (b.vis) b.el.style.display = 'block';
        let n = 0;
        b.txtEl.textContent = '.';
        b.thinkEnd = Date.now() + THINK_MAX_MS;
        b.dotsT = setInterval(function () {
            if (Date.now() > b.thinkEnd) { stopDots(b); fadeOut(b); return; }
            n = (n + 1) % 3; b.txtEl.textContent = '.'.repeat(n + 1);
        }, 380);
    },
    // Appelé par le corps de l'avatar à chaque image : position écran de sa tête
    place: function (id, x, y, visible) {
        const b = boxes[id];
        if (!b) return;
        b.vis = !!visible;
        if (visible) b.lastSeen = Date.now();
        if (!b.shown || !visible) { if (b.el.style.display !== 'none') b.el.style.display = 'none'; return; }
        b.el.style.display = 'block';
        const w = window.innerWidth, hw = Math.min(190, b.el.offsetWidth / 2 + 6);
        b.el.style.left = Math.round(Math.max(hw, Math.min(w - hw, x))) + 'px';
        b.el.style.top = Math.round(Math.max(b.el.offsetHeight + 10, y - 14)) + 'px';   // jamais coupée en haut de l'écran
    },
    // Ouvre la boîte de réponse pour cet avatar (clic sur lui, sur sa bulle, ou ENTRÉE)
    talkTo: function (id, name) {
        if (!hasDom || !replyFn || !id) return;
        const b = box(id);
        if (name && !b.nameEl.textContent) b.nameEl.textContent = name;
        const r = buildReply();
        r.target = id; r.open = true;
        r.root.classList.add('on');
        try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* rien */ }
        setTimeout(function () { r.input.focus(); }, 30);
        updateReply();
    },
    // ─── Appel téléphonique : même dialogue que face à face (bip, lettre par lettre, tu réponds), dans la boîte du bas ───
    phoneOpen: function (id, name) {
        if (!hasDom) return;
        const r = buildReply();
        stopPhoneFx();
        r.call = true; r.target = id; r.name = name || id; r.open = true;
        r.root.classList.add('on', 'call');
        r.txt.textContent = '';
        try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* rien */ }
        setTimeout(function () { r.input.focus(); }, 30);
        Bubbles.phoneThink();                                           // en attendant qu'il parle
    },
    phone: function (id, name, text) {                                  // il parle dans le téléphone
        if (!hasDom) return;
        text = String(text || '').trim().slice(0, 240);
        if (!text) return;
        if (!reply || !reply.call || reply.target !== id) Bubbles.phoneOpen(id, name);
        const r = reply;
        stopPhoneFx();
        r.typing = typeInto({ vis: true, pitch: pitchOf(id) }, r.txt, text, function () { r.typing = null; });
    },
    phoneThink: function () {
        if (!reply || !reply.call) return;
        const r = reply;
        stopPhoneFx();
        let n = 0;
        r.txt.textContent = '.';
        const end = Date.now() + THINK_MAX_MS;
        r.dotsT = setInterval(function () {
            if (Date.now() > end) { stopPhoneFx(); return; }
            n = (n + 1) % 3; r.txt.textContent = '.'.repeat(n + 1);
        }, 380);
    },
    phoneClose: function (id) {
        if (!reply || !reply.call || (id && reply.target !== id)) return;
        reply.call = false;                                             // l'appel est déjà fini : on ne raccroche pas une 2e fois
        closeReply();
    },
    setHangUp: function (fn) { hangUpFn = typeof fn === 'function' ? fn : null; },
    closeReply: closeReply,
    stopThink: function (id) { const b = boxes[id]; if (b) stopDots(b); },
    // Ce qui est fait quand tu réponds : fn(avatarId, texte) -> (promesse d')un texte
    setReply: function (fn) { replyFn = typeof fn === 'function' ? fn : null; },
    active: function (id) { const b = boxes[id]; return !!(b && b.shown); },
    hide: function (id) { const b = boxes[id]; if (b) { if (b.typing) b.typing.cancel(); b.typing = null; stopDots(b); clearTimeout(b.hideT); clearTimeout(b.fadeT); b.shown = false; b.el.style.display = 'none'; } }
};

if (typeof window !== 'undefined') window.BadTherapistBubbles = Bubbles;
