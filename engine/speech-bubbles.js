// speech-bubbles.js – la bulle de parole de TOUS les avatars (Oliver, Pluie, Evelyn dehors...).
//
// v2 : nouveau look « moderne » (verre sombre, coins arrondis, police lisible) et plus de bulle forcément en haut.
//   • PLACEMENT (BadTherapistBubbles.setPlacement('auto' | 'head' | 'bottom'), mémorisé dans le navigateur) :
//       'auto'   (défaut) : de loin la bulle suit la tête de l'avatar ; quand il est près de toi (ou que sa tête est tout en haut
//                de l'écran) elle se pose en BAS de l'écran, comme un sous-titre : facile à lire, jamais coupée ;
//       'head'   : toujours au-dessus de la tête ;
//       'bottom' : toujours en sous-titre, en bas.
//   • PARLER : plus de petite icône qui flotte et rebondit au-dessus de la tête (difficile à viser). Quand un avatar est près de toi,
//     un GRAND bouton « Talk to Evelyn  [Enter] » apparaît en bas au centre. Clic / toucher / ENTRÉE = ouvrir la réponse.
//     (Cliquer sur l'avatar ou sur sa bulle marche toujours.)
//   • RÉPONSE : une carte en bas avec le nom de l'avatar, un champ arrondi, un bouton Send et une croix.
//     ENTRÉE = envoyer, ÉCHAP ou X = fermer.
//   • Le texte s'écrit toujours lettre par lettre avec le « blip » ; la bulle reste le temps de lire puis s'efface ;
//     elle ne s'efface pas tant que tu lui réponds ou que la souris est dessus ; « ... » pendant qu'il réfléchit.
//
// L'API publique est INCHANGÉE (say, think, place, talkTo, phone*, setReply, setHangUp, endThink, hide...) : aucun autre fichier à modifier.
// Réglages : BUBBLE_TYPE_MS (vitesse du texte), HOLD_MIN_MS / HOLD_PER_CHAR_MS (durée d'affichage), DOCK_IN / DOCK_OUT (distance en m
// à partir de laquelle la bulle se pose en bas), REPLY_KEY.
// Le texte est inséré avec textContent : rien de ce que dit une IA ne peut casser la page. Tout le texte visible en jeu est en anglais.

import { THERAPIST_CONFIG } from './evelyn-core.js';

const hasDom = typeof document !== 'undefined';
const REPLY_KEY = 'Enter';
const REPLY_WINDOW_MS = 90000;      // temps pendant lequel ENTRÉE ouvre la réponse après sa dernière phrase
const BUBBLE_TYPE_MS = (THERAPIST_CONFIG && THERAPIST_CONFIG.bubbleTypeSpeedMs) || 65;   // ms par lettre (plus grand = plus lent)
const HOLD_MIN_MS = 9000;           // elle reste au moins 9 s après la fin du texte
const HOLD_PER_CHAR_MS = 150;       // + 150 ms par lettre
const FADE_MS = 1500;
const TALK_RANGE = 5;               // en dessous de 5 m, le bouton « Talk » apparaît (ENTRÉE ou clic)
const DOCK_IN = 4.5;                // en auto : en dessous de 4,5 m la bulle passe en bas de l'écran...
const DOCK_OUT = 5.5;               // ... et ne remonte qu'au-delà de 5,5 m (évite le va-et-vient)
const PENDING_MS = 60000;           // une phrase dite hors de ta vue t'attend 60 s (elle s'affiche quand tu la regardes)
const THINK_MAX_MS = 40000;         // « ... » s'arrête seul si l'avatar ne répond pas
const PLACE_KEY = 'bt_bubble_place';
const ACCENTS = ['#f0c56a', '#7fd1c7', '#f08fa3', '#9db8ff', '#b9e08a', '#d6a2f5'];   // une couleur par avatar (nom, pastille)

const boxes = {};
let replyFn = null, hangUpFn = null, reply = null, audioCtx = null, styled = false, promptEl = null, lastLayout = 0;
let placement = (THERAPIST_CONFIG && THERAPIST_CONFIG.bubblePlacement) || 'auto';
try { const v = localStorage.getItem(PLACE_KEY); if (v === 'auto' || v === 'head' || v === 'bottom') placement = v; } catch (e) { /* tant pis */ }
if (placement !== 'auto' && placement !== 'head' && placement !== 'bottom') placement = 'auto';

const SAFE = 'max(12px,env(safe-area-inset-bottom,0px))';

const CSS = `
:root{--bt-font:Inter,'Segoe UI',system-ui,-apple-system,Roboto,'Helvetica Neue',Arial,sans-serif;--bt-glass:rgba(16,16,22,.86);--bt-line:rgba(255,255,255,.15)}

/* ── Bulle de parole ── */
.bt-say{position:fixed;left:0;top:0;bottom:auto;z-index:205;display:none;pointer-events:auto;cursor:pointer;width:max-content;max-width:min(340px,82vw);box-sizing:border-box;
  background:var(--bt-glass);-webkit-backdrop-filter:blur(12px) saturate(1.2);backdrop-filter:blur(12px) saturate(1.2);
  border:1px solid var(--bt-line);border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.45);color:#f4f4f7;padding:10px 14px 12px;
  font-family:var(--bt-font);font-size:clamp(14px,2.2vw,16px);line-height:1.5;white-space:pre-wrap;word-wrap:break-word;
  transform:translate(-50%,-100%);opacity:1;transition:opacity ${FADE_MS}ms ease}
.bt-say.out{opacity:0;pointer-events:none}
.bt-say::after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-8px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid var(--bt-glass)}
.bt-say .n{display:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bt-accent,#f0c56a);margin-bottom:3px}
.bt-say.docked{left:50%!important;top:auto!important;transform:translateX(-50%);max-width:min(640px,92vw);padding:11px 18px 13px;border-radius:14px;
  border-left:3px solid var(--bt-accent,#f0c56a);font-size:clamp(15px,2.4vw,18px)}
.bt-say.docked::after{display:none}
.bt-say.docked .n{display:block}
.bt-caret{display:inline-block;width:2px;height:1.05em;background:#f4f4f7;vertical-align:-0.15em;margin-left:2px;animation:btc .8s steps(1) infinite}
@keyframes btc{50%{opacity:0}}

/* ── Bouton « Talk » (en bas, grand, facile à viser) ── */
.bt-talk{position:fixed;left:50%;bottom:calc(${SAFE} + 24px);transform:translateX(-50%);z-index:204;display:none;align-items:center;gap:10px;pointer-events:auto;cursor:pointer;
  min-height:48px;padding:0 16px 0 10px;border-radius:999px;box-sizing:border-box;background:var(--bt-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 28px rgba(0,0,0,.45);color:#f4f4f7;font-family:var(--bt-font);font-size:15px;font-weight:600;white-space:nowrap;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:background .15s,border-color .15s;animation:btp .25s ease-out}
.bt-talk:hover{background:rgba(44,44,58,.94);border-color:var(--bt-accent,#f0c56a)}
.bt-talk:active{transform:translateX(-50%) scale(.97)}
.bt-talk .ic{width:30px;height:30px;border-radius:50%;background:var(--bt-accent,#f0c56a);color:#15151b;display:grid;place-items:center;font-size:15px;flex:none}
.bt-talk .kc{font-size:11px;font-weight:700;padding:3px 7px;border-radius:6px;border:1px solid rgba(255,255,255,.3);color:#cfcfd8}
@media (hover:none){.bt-talk .kc{display:none}}
@keyframes btp{from{opacity:0;transform:translateX(-50%) translateY(10px)}}

/* ── Carte de réponse ── */
.bt-reply{position:fixed;left:0;right:0;bottom:0;z-index:226;display:none;justify-content:center;pointer-events:none;padding:0 12px ${SAFE};font-family:var(--bt-font)}
.bt-reply.on{display:flex}
.bt-reply .b{pointer-events:auto;width:min(640px,100%);box-sizing:border-box;background:rgba(16,16,22,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  border:1px solid var(--bt-line);border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.55);padding:12px 12px 12px 16px;color:#f4f4f7}
.bt-reply .hd{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.bt-reply .av{width:30px;height:30px;border-radius:50%;background:var(--bt-accent,#f0c56a);color:#15151b;display:grid;place-items:center;font-size:14px;font-weight:800;flex:none}
.bt-reply .nm{font-size:15px;font-weight:700}
.bt-reply .st{flex:1;font-size:12px;color:#a9a9b8}
.bt-reply .x{width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.09);color:#ddd;font-size:15px;cursor:pointer;flex:none;padding:0}
.bt-reply .x:hover{background:rgba(255,255,255,.2)}
.bt-reply .t{display:none;font-size:clamp(15px,2.4vw,17px);line-height:1.6;min-height:3.2em;max-height:28vh;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;margin:0 0 10px;color:#f4f4f7}
.bt-reply.call .t{display:block}
.bt-reply .h:empty{display:none}
.bt-reply .h{font-size:12px;line-height:1.5;color:var(--bt-accent,#f0c56a);margin:0 0 8px;min-height:15px}
.bt-reply .r{display:flex;gap:8px;padding-right:4px}
.bt-reply input{flex:1;min-width:0;height:46px;box-sizing:border-box;border-radius:23px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#fff;
  font-family:inherit;font-size:16px;padding:0 18px;outline:0}
.bt-reply input::placeholder{color:#8d8d9c}
.bt-reply input:focus{border-color:var(--bt-accent,#f0c56a)}
.bt-reply .s{height:46px;min-width:70px;padding:0 20px;border-radius:23px;border:0;background:var(--bt-accent,#f0c56a);color:#15151b;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer}
.bt-reply .s:hover{filter:brightness(1.1)}
`;

function ensureStyle() {
    if (!hasDom || styled) return;
    styled = true;
    if (!document.getElementById('bt-pixel-font')) {               // plus utilisée ici, mais les petites notifications de society.js s'en servent encore
        const l = document.createElement('link');
        l.id = 'bt-pixel-font'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(l);
    }
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
}

// ─── Petits outils ───
function hashOf(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973; return h; }
function pitchOf(id) { return 150 + (hashOf(id) % 90); }
function accentOf(id) { return ACCENTS[hashOf(id) % ACCENTS.length]; }
function prettyName(id) { id = String(id || ''); return id.charAt(0).toUpperCase() + id.slice(1); }

// ─── Le « blip » (chaque avatar a sa hauteur de voix) ───
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

function setName(b, name) {
    if (!name) return;
    b.name = String(name);
    b.nameEl.textContent = b.name;
}

function box(id) {
    let b = boxes[id];
    if (b) return b;
    ensureStyle();
    b = boxes[id] = { id: id, el: document.createElement('div'), typing: null, hideT: 0, fadeT: 0, dotsT: 0, thinkEnd: 0, shown: false, vis: false, hover: false, lastAt: 0, lastSeen: 0, pitch: pitchOf(id), near: false, dist: 999, pending: null, docked: false, name: prettyName(id) };
    b.el.className = 'bt-say';
    b.el.style.setProperty('--bt-accent', accentOf(id));
    b.nameEl = document.createElement('div'); b.nameEl.className = 'n'; b.nameEl.textContent = b.name;   // visible seulement en sous-titre (bas de l'écran)
    b.txtEl = document.createElement('div');
    b.el.appendChild(b.nameEl);
    b.el.appendChild(b.txtEl);
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

// ─── Bulles posées en bas (sous-titres) : empilées au-dessus de la carte de réponse si elle est ouverte ───
function dockedBoxes() {
    return Object.keys(boxes).map(function (k) { return boxes[k]; }).filter(function (b) { return b.shown && b.docked && b.vis; });
}
function layoutDocked(force) {
    const now = Date.now();
    if (!force && now - lastLayout < 100) return;
    lastLayout = now;
    let off = 20;
    if (reply && reply.open) { const card = reply.root.querySelector('.b'); off = (card ? card.offsetHeight : 100) + 24; }
    dockedBoxes().sort(function (a, b) { return b.lastAt - a.lastAt; }).forEach(function (b) {
        b.el.style.bottom = 'calc(' + SAFE + ' + ' + off + 'px)';
        off += b.el.offsetHeight + 8;
    });
}

// ─── Bouton « Talk to X » (un seul, en bas au centre) ───
function buildPrompt() {
    if (promptEl || !hasDom) return promptEl;
    ensureStyle();
    const p = document.createElement('div');
    p.className = 'bt-talk';
    p.setAttribute('role', 'button');
    p.innerHTML = '<span class="ic">\uD83D\uDCAC</span><span class="lb"></span><span class="kc">Enter</span>';
    p.addEventListener('click', function (e) { e.stopPropagation(); if (p.dataset.id) Bubbles.talkTo(p.dataset.id); });
    p.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    document.body.appendChild(p);
    promptEl = p;
    return p;
}

function updatePrompt() {
    if (!hasDom || !replyFn) return;
    const now = Date.now();
    let best = null;
    if (!(reply && reply.open) && !dockedBoxes().length) {
        Object.keys(boxes).forEach(function (id) {
            const b = boxes[id];
            if (b.near && b.vis && !b.shown && now - b.lastSeen < 800 && (!best || b.dist < best.dist)) best = b;
        });
    }
    if (!best) { if (promptEl && promptEl.style.display !== 'none') promptEl.style.display = 'none'; return; }
    const p = buildPrompt();
    if (p.dataset.id !== best.id) {
        p.dataset.id = best.id;
        p.style.setProperty('--bt-accent', accentOf(best.id));
        p.querySelector('.lb').textContent = 'Talk to ' + best.name;
    }
    if (p.style.display !== 'flex') p.style.display = 'flex';
}
if (hasDom) setInterval(updatePrompt, 150);

// ─── Carte de réponse (en bas) ───
function buildReply() {
    if (reply || !hasDom) return reply;
    ensureStyle();
    const root = document.createElement('div');
    root.className = 'bt-reply';
    root.innerHTML = '<div class="b"><div class="hd"><div class="av"></div><div class="nm"></div><div class="st"></div><button type="button" class="x" aria-label="Close">\u2715</button></div>' +
        '<div class="t"></div><div class="h"></div>' +
        '<div class="r"><input type="text" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Say something..."><button type="button" class="s">Send</button></div></div>';
    document.body.appendChild(root);
    reply = { root: root, txt: root.querySelector('.t'), call: false, typing: null, dotsT: 0, name: '', hint: root.querySelector('.h'), input: root.querySelector('input'), send: root.querySelector('.s'), close: root.querySelector('.x'),
        av: root.querySelector('.av'), nm: root.querySelector('.nm'), st: root.querySelector('.st'), target: null, open: false, note: '', noteUntil: 0 };
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

// Nom, pastille et couleur de la carte de réponse
function syncReplyHead(id, name, isCall) {
    const r = reply, b = boxes[id];
    const nm = name || (b && b.name) || prettyName(id);
    r.nm.textContent = nm;
    r.av.textContent = nm.charAt(0).toUpperCase();
    r.st.textContent = isCall ? 'On the phone' : '';
    r.root.style.setProperty('--bt-accent', accentOf(id));
}

function pickBest() {
    const now = Date.now();
    let best = null;
    Object.keys(boxes).forEach(function (id) {
        const b = boxes[id];
        if (b.vis && now - b.lastAt < REPLY_WINDOW_MS && (!best || b.lastAt > best.lastAt)) best = b;
    });
    if (!best) Object.keys(boxes).forEach(function (id) {          // sinon : l'avatar le plus proche (bouton « Talk » affiché)
        const b = boxes[id];
        if (b.near && b.vis && now - b.lastSeen < 1000 && (!best || b.dist < best.dist)) best = b;
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
    if (reply.call) { const f = hangUpFn; reply.call = false; if (f) { try { f(); } catch (e) { /* rien */ } } }   // fermer la carte pendant un appel = raccrocher
    stopPhoneFx();
    reply.open = false;
    reply.root.classList.remove('on', 'call');
    reply.input.blur();
    layoutDocked(true);
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
    layoutDocked(true);                                                // la carte peut changer de hauteur (appel, message d'erreur)
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
        if (!b.vis) { b.pending = { name: name, text: text, ms: ms, at: Date.now() }; return; }     // hors de ta vue : elle t'attend, au lieu d'être perdue
        b.pending = null;
        clearTimeout(b.hideT); clearTimeout(b.fadeT); stopDots(b);
        if (b.typing) b.typing.cancel();
        setName(b, name);
        b.el.classList.remove('out');
        b.shown = true;
        b.lastAt = Date.now();
        if (b.vis) b.el.style.display = 'block';
        b.typing = typeInto(b, b.txtEl, text, function () {
            b.typing = null;
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
        b.el.classList.remove('out');
        b.shown = true;
        b.lastAt = Date.now();
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
    place: function (id, x, y, visible, dist) {
        let b = boxes[id];
        if (!b && visible && dist != null && dist <= TALK_RANGE) b = box(id);
        if (!b) return;
        b.vis = !!visible;
        if (visible) b.lastSeen = Date.now();
        b.dist = dist != null ? dist : 999;
        b.near = !!(visible && b.dist <= TALK_RANGE);
        if (visible && b.pending) { const p = b.pending; b.pending = null; if (Date.now() - p.at < PENDING_MS) Bubbles.say(id, p.name, p.text, p.ms); }
        if (!b.shown || !visible) { if (b.el.style.display !== 'none') b.el.style.display = 'none'; return; }

        // Où poser la bulle : sur la tête (de loin) ou en sous-titre en bas (de près, ou tête trop haute dans l'écran)
        const W = window.innerWidth, H = window.innerHeight;
        let dock;
        if (placement === 'bottom') dock = true;
        else if (placement === 'head') dock = false;
        else dock = b.docked ? (b.dist < DOCK_OUT || y < H * 0.30) : (b.dist < DOCK_IN || y < H * 0.22);
        b.docked = dock;
        b.el.classList.toggle('docked', dock);
        b.el.style.display = 'block';
        if (dock) { layoutDocked(false); return; }
        b.el.style.bottom = '';
        const hw = Math.min(190, b.el.offsetWidth / 2 + 6);
        b.el.style.left = Math.round(Math.max(hw, Math.min(W - hw, x))) + 'px';
        b.el.style.top = Math.round(Math.max(b.el.offsetHeight + 10, y - 14)) + 'px';   // jamais coupée en haut de l'écran
    },
    // Ouvre la carte de réponse pour cet avatar (clic sur lui, sur sa bulle, sur le bouton « Talk », ou ENTRÉE)
    talkTo: function (id, name) {
        if (!hasDom || !replyFn || !id) return;
        const b = box(id);
        setName(b, name);
        const r = buildReply();
        r.target = id; r.open = true;
        syncReplyHead(id, b.name, false);
        r.root.classList.add('on');
        try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* rien */ }
        setTimeout(function () { r.input.focus(); }, 30);
        updateReply();
        if (promptEl) promptEl.style.display = 'none';
    },
    // ─── Appel téléphonique : même dialogue que face à face (bip, lettre par lettre, tu réponds), dans la carte du bas ───
    phoneOpen: function (id, name) {
        if (!hasDom) return;
        const r = buildReply();
        stopPhoneFx();
        r.call = true; r.target = id; r.name = name || id; r.open = true;
        syncReplyHead(id, r.name, true);
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
    // Il a fini de réfléchir : s'il n'a rien dit, les « ... » disparaissent (sinon ils tournent jusqu'au délai de 40 s)
    endThink: function (id) { const b = boxes[id]; if (b && b.dotsT) { stopDots(b); fadeOut(b); } },
    // Ce qui est fait quand tu réponds : fn(avatarId, texte) -> (promesse d')un texte
    setReply: function (fn) { replyFn = typeof fn === 'function' ? fn : null; },
    // 'auto' | 'head' | 'bottom' : où s'affichent les bulles (mémorisé). Ex. dans la console : BadTherapistBubbles.setPlacement('bottom')
    setPlacement: function (mode) {
        if (mode !== 'auto' && mode !== 'head' && mode !== 'bottom') return placement;
        placement = mode;
        try { localStorage.setItem(PLACE_KEY, mode); } catch (e) { /* tant pis */ }
        return placement;
    },
    getPlacement: function () { return placement; },
    active: function (id) { const b = boxes[id]; return !!(b && b.shown); },
    hide: function (id) { const b = boxes[id]; if (b) { if (b.typing) b.typing.cancel(); b.typing = null; stopDots(b); clearTimeout(b.hideT); clearTimeout(b.fadeT); b.shown = false; b.pending = null; b.el.style.display = 'none'; } }
};

if (typeof window !== 'undefined') window.BadTherapistBubbles = Bubbles;
