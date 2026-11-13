// phone-app.js (ancien phone-item.js) – le TÉLÉPHONE PORTABLE de Chippy (un item). Même téléphone pour tout le monde.
//
//   PHONE      : ton numéro, l'heure, la liste des contacts. Un contact -> APPELER ou ÉCRIRE.
//                Appel : ça sonne ; s'il ne décroche pas, tu peux laisser un message vocal ou écrire.
//   MSGS       : les SMS (et ce qui s'est dit en direct) avec chaque contact.
//   VOICEMAIL  : les messages vocaux que les autres t'ont laissés.
//   CALLS      : le journal d'appels.
// Quand quelqu'un t'appelle, le téléphone s'ouvre : DÉCROCHER ou REFUSER.
//
//     const item = createPhoneItem({ getGameTime });
//     item.toggle();                  // à brancher sur ton item « téléphone »
//     phone.onDial(() => item.callNow());   // le téléphone de la table de chevet ouvre la liste de contacts
//
// Tout texte venant d'un avatar est inséré avec textContent (jamais innerHTML) : rien de ce qu'il écrit ne peut casser la page.

import { THERAPIST_CONFIG } from './therapist-config.js';
import { Mem } from './therapist-memory.js';

const CSS = `
.bpi{position:fixed;right:12px;bottom:12px;z-index:230;display:none;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow-y:auto;
  font-family:'Press Start 2P',monospace;color:#f2f2f2;background:#050505;border:4px solid #f2f2f2;box-shadow:0 0 0 4px #000;padding:12px}
.bpi.on{display:block}
.bpi *{box-sizing:border-box}
.bpi-top{display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:1px;color:#9a9a9a;margin-bottom:10px}
.bpi-x{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:9px;padding:4px 7px;cursor:pointer}
.bpi-tabs{display:flex;gap:6px;margin-bottom:10px}
.bpi-tab{flex:1;background:transparent;border:2px solid #555;color:#9a9a9a;font-family:inherit;font-size:7px;padding:7px 1px;cursor:pointer}
.bpi-tab.on{border-color:#f2f2f2;color:#f2f2f2}
.bpi-num{font-size:14px;margin:4px 0 10px;letter-spacing:1px}
.bpi-line{font-size:8px;line-height:1.9;color:#cfcfcf}
.bpi-line b{color:#f2f2f2;font-weight:normal}
.bpi-btn{display:block;width:100%;background:transparent;border:2px solid #f2f2f2;color:#f2f2f2;font-family:inherit;font-size:10px;padding:10px;margin-top:10px;cursor:pointer}
.bpi-btn:hover:not(:disabled){background:#f2f2f2;color:#000}
.bpi-btn:disabled{opacity:.45;cursor:default}
.bpi-in{width:100%;background:#000;border:2px solid #777;color:#f2f2f2;font-family:inherit;font-size:9px;padding:9px;margin-top:10px;outline:0}
.bpi-in:focus{border-color:#f2f2f2}
.bpi-note{font-size:8px;line-height:1.8;color:#e8c872;margin-top:8px;min-height:1.8em}
.bpi-item{border:2px solid #444;padding:8px;margin-bottom:8px;font-size:8px;line-height:1.8;word-wrap:break-word}
.bpi-item.new{border-color:#f2f2f2}
.bpi-item .d{color:#9a9a9a;margin-bottom:4px}
.bpi-play{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:8px;padding:5px 8px;margin-top:6px;cursor:pointer}
.bpi-empty{font-size:8px;color:#9a9a9a;line-height:1.8}
`;

export function createPhoneItem(opts) {
    opts = opts || {};
    const cfg = Object.assign({}, THERAPIST_CONFIG, opts.config || {});
    const getPhone = function () { return opts.phone || window.BadTherapistPhone || null; };
    let root = null, body = null, tabs = {}, clockEl = null;
    let tab = 'home', isOn = false, clockTimer = null, styled = false;
    let sel = null;                 // contact ouvert (écran du contact)
    let chatWith = null, chatInput = null;
    let callId = null, vmInput = null, vmNote = '';

    const el = function (tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };
    function button(label, fn, cls) {
        const b = el('button', cls || 'bpi-btn', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        return b;
    }
    function ensureStyle() {
        if (styled) return;
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
    function fmt(at) { return new Date(at).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    function ago(at) { return Mem.humanize(Date.now() - at); }
    function gameTime() { try { return opts.getGameTime ? String(opts.getGameTime() || '') : ''; } catch (e) { return ''; } }
    function tickClock() { if (clockEl) clockEl.textContent = new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }); }
    function society() { return window.BadTherapistSociety || null; }
    function me() { const S = society(); return S ? S.registry.actor('player') : null; }

    // ─── Appel entrant : visible sur tous les onglets ───
    function renderIncoming() {
        const S = society();
        if (!S || callId) return;
        S.calls.incoming('player').forEach(function (c) {
            const who = S.registry.actor(c.from);
            const box = el('div', 'bpi-item new');
            box.appendChild(el('div', 'd', (who ? who.name.toUpperCase() : '?') + ' IS CALLING YOU'));
            box.appendChild(button('ANSWER', function () { S.calls.answer('player'); callId = c.id; tab = 'home'; sel = c.from; render(); }));
            box.appendChild(button('DECLINE', function () { S.calls.hangUp('player'); render(); }, 'bpi-play'));
            body.appendChild(box);
        });
    }

    // ─── Onglet PHONE : contacts, puis le contact, puis l'appel ───
    function renderHome() {
        const S = society();
        if (!S) { body.appendChild(el('div', 'bpi-empty', 'The phone is not loaded.')); return; }
        if (callId) { renderCall(S); return; }
        const R = S.registry, M = S.messaging;
        if (sel) {
            const who = R.actor(sel);
            body.appendChild(button('< BACK', function () { sel = null; render(); }, 'bpi-play'));
            body.appendChild(el('div', 'bpi-num', who ? who.name : '?'));
            body.appendChild(el('div', 'bpi-line', who ? who.number : ''));
            body.appendChild(button('CALL', function () { startCall(sel); }));
            body.appendChild(button('SEND A MESSAGE', function () { chatWith = sel; tab = 'msgs'; render(); }));
            return;
        }
        body.appendChild(el('div', 'bpi-line', 'MY NUMBER'));
        body.appendChild(el('div', 'bpi-num', me() ? me().number : '???'));
        const real = el('div', 'bpi-line');
        real.appendChild(document.createTextNode('REAL TIME: '));
        clockEl = el('b', null, '');
        real.appendChild(clockEl);
        body.appendChild(real);
        tickClock();
        const g = gameTime();
        if (g) { const l = el('div', 'bpi-line'); l.appendChild(document.createTextNode('GAME TIME: ')); l.appendChild(el('b', null, g)); body.appendChild(l); }
        body.appendChild(el('div', 'bpi-line', ' '));
        body.appendChild(el('div', 'bpi-line', 'CONTACTS'));
        const dir = R.directory().filter(function (d) { return d.id !== 'player'; });
        if (!dir.length) body.appendChild(el('div', 'bpi-empty', 'Nobody yet.'));
        dir.forEach(function (d) {
            const n = M.unread('player').filter(function (m) { return m.from === d.id; }).length;
            body.appendChild(button(d.name.toUpperCase() + '  ' + d.number + (n ? '  (' + n + ' NEW)' : ''), function () { sel = d.id; render(); }));
        });
    }

    function startCall(id) {
        const S = society();
        const r = S.calls.start('player', id);
        if (!r.ok) { vmNote = r.error; callId = null; render(); return; }
        callId = r.call.id; vmNote = ''; render();
    }

    function renderCall(S) {
        const R = S.registry, M = S.messaging;
        const c = S.calls.get(callId);
        if (!c) { callId = null; render(); return; }
        const other = R.actor(c.from === 'player' ? c.to : c.from);
        const name = other ? other.name : '?';
        body.appendChild(el('div', 'bpi-num', name));
        if (c.status === 'ringing') {
            body.appendChild(el('div', 'bpi-line', 'CALLING... it rings.'));
            body.appendChild(button('HANG UP', function () { S.calls.hangUp('player'); callId = null; sel = null; render(); }));
            return;
        }
        if (c.status === 'active') {
            body.appendChild(el('div', 'bpi-line', 'ON THE PHONE'));
            M.markRead('player', other.id);
            M.thread('player', other.id, 40).filter(function (m) { return m.kind === 'call' && m.at >= (c.answeredAt || c.at); }).forEach(function (m) {
                const mine = m.from === 'player';
                const box = el('div', 'bpi-item' + (mine ? '' : ' new'));
                box.appendChild(el('div', 'd', mine ? 'YOU' : name.toUpperCase()));
                box.appendChild(el('div', null, m.text));
                body.appendChild(box);
            });
            chatInput = el('input', 'bpi-in');
            chatInput.type = 'text'; chatInput.maxLength = 300; chatInput.autocomplete = 'off'; chatInput.spellcheck = false;
            chatInput.placeholder = 'Say something...';
            chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendCall(other.id); } });
            body.appendChild(chatInput);
            body.appendChild(button('SAY', function () { sendCall(other.id); }));
            body.appendChild(button('HANG UP', function () { S.calls.hangUp('player'); callId = null; sel = null; render(); }, 'bpi-play'));
            return;
        }
        if (c.status === 'ended') { body.appendChild(el('div', 'bpi-line', 'THE CALL IS OVER.')); body.appendChild(button('OK', function () { callId = null; sel = null; render(); })); return; }
        // manqué : pas de réponse -> message vocal ou écrire
        body.appendChild(el('div', 'bpi-line', name.toUpperCase() + ' DID NOT PICK UP.'));
        vmInput = el('input', 'bpi-in');
        vmInput.type = 'text'; vmInput.maxLength = 300; vmInput.autocomplete = 'off'; vmInput.spellcheck = false;
        vmInput.placeholder = 'Leave a voice message...';
        vmInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendVoicemail(other.id); } });
        body.appendChild(vmInput);
        body.appendChild(button('LEAVE VOICE MESSAGE', function () { sendVoicemail(other.id); }));
        body.appendChild(button('CALL AGAIN', function () { startCall(other.id); }, 'bpi-play'));
        body.appendChild(button('CLOSE', function () { callId = null; sel = null; render(); }, 'bpi-play'));
        body.appendChild(el('div', 'bpi-note', vmNote));
    }
    function sendCall(otherId) {
        const v = chatInput ? chatInput.value.trim() : '';
        if (!v) return;
        chatInput.value = '';
        society().messaging.send('player', otherId, v, { kind: 'call' });
        render();
        if (chatInput) chatInput.focus();
    }
    function sendVoicemail(otherId) {
        const v = vmInput ? vmInput.value.trim() : '';
        if (!v) return;
        const r = society().messaging.send('player', otherId, v, { kind: 'voicemail' });
        vmNote = r.ok ? 'Voice message left.' : r.error;
        render();
    }

    // ─── MESSAGES vocaux reçus (de tout le monde) + anciens messages d'Evelyn ───
    function renderVoicemail() {
        const S = society();
        const items = [];
        if (S) S.messaging.all().filter(function (m) { return m.to === 'player' && m.kind === 'voicemail'; }).forEach(function (m) {
            const f = S.registry.actor(m.from);
            items.push({ at: m.at, who: f ? f.name : m.from, text: m.text, heard: m.read, play: function () { S.messaging.markRead('player', m.from); } });
        });
        Mem.get().voicemails.forEach(function (v) {
            items.push({ at: v.at, who: 'Evelyn', text: v.text, heard: v.heard, play: function () { Mem.markHeard(v.id); } });
        });
        items.sort(function (a, b) { return b.at - a.at; });
        if (!items.length) { body.appendChild(el('div', 'bpi-empty', 'No voice messages.')); return; }
        items.forEach(function (v) {
            const box = el('div', 'bpi-item' + (v.heard ? '' : ' new'));
            box.appendChild(el('div', 'd', (v.heard ? '' : '* NEW  ') + v.who.toUpperCase() + '  ' + fmt(v.at) + '  (' + ago(v.at) + ' ago)'));
            box.appendChild(el('div', null, v.text));
            box.appendChild(button('PLAY', function () { v.play(); const ph = getPhone(); if (ph && ph.say) ph.say(v.text); render(); }, 'bpi-play'));
            body.appendChild(box);
        });
    }

    function renderCalls() {
        const S = society();
        const list = S ? S.calls.list().filter(function (c) { return c.from === 'player' || c.to === 'player'; }).reverse() : [];
        if (!list.length) { body.appendChild(el('div', 'bpi-empty', 'No calls yet.')); return; }
        list.forEach(function (c) {
            const out = c.from === 'player';
            const o = S.registry.actor(out ? c.to : c.from);
            const box = el('div', 'bpi-item');
            box.appendChild(el('div', 'd', fmt(c.at) + '  (' + ago(c.at) + ' ago)'));
            const res = c.status === 'missed' ? (out ? 'NO ANSWER' : 'MISSED') : c.status === 'active' || c.status === 'ended' ? 'ANSWERED' : 'RINGING';
            box.appendChild(el('div', null, (out ? 'YOU CALLED ' : 'CALLED YOU: ') + (o ? o.name.toUpperCase() : '?') + ' - ' + res));
            body.appendChild(box);
        });
    }

    // ─── Messages (SMS et paroles) avec chaque contact ───
    function renderMsgs() {
        const S = society();
        if (!S) { body.appendChild(el('div', 'bpi-empty', 'Messaging is not loaded.')); return; }
        const R = S.registry, M = S.messaging;
        if (!chatWith) {
            R.directory().filter(function (d) { return d.id !== 'player'; }).forEach(function (d) {
                const n = M.unread('player').filter(function (m) { return m.from === d.id && m.kind !== 'voicemail'; }).length;
                body.appendChild(button(d.name.toUpperCase() + '  ' + d.number + (n ? '  (' + n + ' NEW)' : ''), function () { chatWith = d.id; render(); }));
            });
            return;
        }
        const who = R.actor(chatWith);
        body.appendChild(button('< BACK', function () { chatWith = null; render(); }, 'bpi-play'));
        body.appendChild(el('div', 'bpi-num', who ? who.name : '?'));
        M.markRead('player', chatWith);
        M.thread('player', chatWith, 14).forEach(function (m) {
            const mine = m.from === 'player';
            const tag = m.kind === 'voicemail' ? ' (voice message)' : m.kind === 'call' ? ' (phone)' : m.kind === 'say' ? ' (in person)' : '';
            const box = el('div', 'bpi-item' + (mine ? '' : ' new'));
            box.appendChild(el('div', 'd', (mine ? 'YOU' : who.name.toUpperCase()) + tag + '  ' + fmt(m.at)));
            box.appendChild(el('div', null, m.text));
            body.appendChild(box);
        });
        chatInput = el('input', 'bpi-in');
        chatInput.type = 'text'; chatInput.maxLength = 300; chatInput.autocomplete = 'off'; chatInput.spellcheck = false;
        chatInput.placeholder = 'Write to ' + (who ? who.name : '') + '...';
        chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
        body.appendChild(chatInput);
        body.appendChild(button('SEND', sendChat));
        body.appendChild(button('CALL', function () { sel = chatWith; tab = 'home'; startCall(chatWith); }, 'bpi-play'));
    }
    function sendChat() {
        const S = society(), v = chatInput ? chatInput.value.trim() : '';
        if (!S || !v || !chatWith) return;
        chatInput.value = '';
        S.messaging.send('player', chatWith, v);
        render();
        if (chatInput) chatInput.focus();
    }

    function render() {
        if (!root) return;
        const keepChat = chatInput ? chatInput.value : '';
        chatInput = null; vmInput = null;
        body.textContent = '';
        clockEl = null;
        const S = society();
        const unheard = S ? S.messaging.all().filter(function (m) { return m.to === 'player' && m.kind === 'voicemail' && !m.read; }).length + Mem.get().voicemails.filter(function (v) { return !v.heard; }).length : 0;
        const newMsgs = S ? S.messaging.unread('player').filter(function (m) { return m.kind !== 'voicemail' && m.kind !== 'call'; }).length : 0;
        tabs.home.textContent = 'PHONE';
        tabs.vm.textContent = 'VOICEMAIL' + (unheard ? ' (' + unheard + ')' : '');
        tabs.calls.textContent = 'CALLS';
        tabs.msgs.textContent = 'MSGS' + (newMsgs ? ' (' + newMsgs + ')' : '');
        Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('on', k === tab); });
        renderIncoming();
        if (tab === 'msgs') renderMsgs();
        else if (tab === 'vm') renderVoicemail();
        else if (tab === 'calls') renderCalls();
        else renderHome();
        if (chatInput && keepChat) chatInput.value = keepChat;
    }

    // ─── Ouverture / fermeture ───
    // callNow() sans argument : ouvre la liste de contacts (ancien « appeler Evelyn » : plus de contact privilégié) ; avec un id : appelle ce contact.
    function callNow(id) {
        tab = 'home';
        show(); render();
        if (typeof id === 'string' && society()) startCall(id);
        return null;
    }

    function build() {
        if (root) return;
        ensureStyle();
        root = el('div', 'bpi');
        const top = el('div', 'bpi-top');
        top.appendChild(el('span', null, 'MY PHONE'));
        top.appendChild(button('X', hide, 'bpi-x'));
        root.appendChild(top);
        const bar = el('div', 'bpi-tabs');
        [['home', 'PHONE'], ['msgs', 'MSGS'], ['vm', 'VOICEMAIL'], ['calls', 'CALLS']].forEach(function (t) {
            const b = el('button', 'bpi-tab', t[1]);
            b.type = 'button';
            b.addEventListener('click', function () { tab = t[0]; render(); });
            tabs[t[0]] = b;
            bar.appendChild(b);
        });
        root.appendChild(bar);
        body = el('div');
        root.appendChild(body);
        document.body.appendChild(root);
        root.addEventListener('keydown', function (e) {           // les touches tapées ici ne font pas marcher Chippy
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); hide(); }
        });
        window.addEventListener('badtherapist:message', function () { if (isOn) render(); });
        window.addEventListener('badtherapist:call', function (ev) {
            const d = ev.detail || {};
            if (d.to === 'player' && d.state === 'ringing') { tab = 'home'; show(); }      // on t'appelle : le téléphone s'ouvre
            if ((d.from === 'player' || d.to === 'player') && d.state === 'active') { callId = d.id; }
            if (isOn) render();
        });
    }
    function show() {
        build();
        if (isOn) return;
        isOn = true;
        root.classList.add('on');
        clearInterval(clockTimer);
        clockTimer = setInterval(tickClock, 15000);
    }
    function hide() { isOn = false; clearInterval(clockTimer); if (root) root.classList.remove('on'); }
    function open() { show(); render(); }
    function toggle() { if (isOn) hide(); else open(); }
    return { open: open, close: hide, toggle: toggle, callNow: callNow, isOpen: function () { return isOn; } };
}
