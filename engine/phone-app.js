// phone-app.js (ancien phone-item.js) – le TÉLÉPHONE PORTABLE du joueur (un item).
// Onglet MSGS : SMS avec tout le monde (Oliver, Pluie...) par le registre commun (messaging.js).
//
// Il montre : le numéro d'Evelyn, l'heure réelle ET l'heure du jeu, depuis quand elle t'a vu, si le répondeur marche,
// un bouton pour l'APPELER, un champ pour lui LAISSER UN MESSAGE, ses messages vocaux (à écouter) et le journal d'appels.
//
//     const item = createPhoneItem({ talk, life, phone, getGameTime });
//     item.toggle();                      // à brancher sur ton item « téléphone » (inventaire, touche...)
//     phone.onDial(() => item.callNow()); // cliquer le téléphone de la table de chevet l'appelle aussi
//
// Tous les textes d'Evelyn sont insérés avec textContent (jamais innerHTML) : rien de ce qu'elle écrit ne peut casser la page.

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
    const talk = opts.talk, life = opts.life;
    const getPhone = function () { return opts.phone || window.BadTherapistPhone || null; };
    let root = null, body = null, tabs = {}, clockEl = null, msgInput = null;
    let tab = 'home', note = '', calling = false, isOn = false, clockTimer = null;
    let chatWith = null, chatInput = null;
    let styled = false;

    const el = function (tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };

    function ensureStyle() {
        if (styled) return;
        styled = true;
        if (!document.getElementById('bt-pixel-font')) {
            const l = document.createElement('link');
            l.id = 'bt-pixel-font';
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(l);
        }
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    function fmt(at) {
        const d = new Date(at);
        return d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function ago(at) { return Mem.humanize(Date.now() - at); }

    function gameTime() {
        try { return opts.getGameTime ? String(opts.getGameTime() || '') : ''; } catch (e) { return ''; }
    }

    function tickClock() {
        if (clockEl) clockEl.textContent = new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    }

    // ─── Onglets ─────────────────────────────────────────────────────
    function renderHome() {
        const m = Mem.get();
        body.appendChild(el('div', 'bpi-line', 'EVELYN'));
        body.appendChild(el('div', 'bpi-num', cfg.evelynNumber || '???'));

        const real = el('div', 'bpi-line');
        real.appendChild(document.createTextNode('REAL TIME: '));
        clockEl = el('b', null, '');
        real.appendChild(clockEl);
        body.appendChild(real);
        tickClock();

        const g = gameTime();
        if (g) { const l = el('div', 'bpi-line'); l.appendChild(document.createTextNode('GAME TIME: ')); l.appendChild(el('b', null, g)); body.appendChild(l); }

        const seen = el('div', 'bpi-line');
        seen.appendChild(document.createTextNode('YOU LAST CALLED: '));
        const lastOut = m.callLog.filter(function (c) { return c.dir === 'out'; }).pop();
        seen.appendChild(el('b', null, lastOut ? ago(lastOut.at) + ' ago' : 'never'));
        body.appendChild(seen);

        const vm = el('div', 'bpi-line');
        vm.appendChild(document.createTextNode('VOICEMAIL: '));
        vm.appendChild(el('b', null, cfg.lifeEnabled && life && life.isOnline() ? 'ON, she can leave messages' : 'OFF (no signal)'));
        body.appendChild(vm);

        const call = el('button', 'bpi-btn', calling ? 'CALLING...' : 'CALL EVELYN');
        call.type = 'button';
        call.disabled = calling;
        call.addEventListener('click', callNow);
        body.appendChild(call);

        msgInput = el('input', 'bpi-in');
        msgInput.type = 'text';
        msgInput.maxLength = 300;
        msgInput.placeholder = 'Leave her a message...';
        msgInput.autocomplete = 'off';
        msgInput.spellcheck = false;
        msgInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
        body.appendChild(msgInput);

        const send = el('button', 'bpi-btn', 'LEAVE MESSAGE');
        send.type = 'button';
        send.addEventListener('click', sendMessage);
        body.appendChild(send);

        body.appendChild(el('div', 'bpi-note', note));
    }

    function renderVoicemail() {
        const list = Mem.get().voicemails.slice().reverse();
        if (!list.length) { body.appendChild(el('div', 'bpi-empty', 'No messages.')); return; }
        list.forEach(function (v) {
            const box = el('div', 'bpi-item' + (v.heard ? '' : ' new'));
            box.appendChild(el('div', 'd', (v.heard ? '' : '* NEW  ') + fmt(v.at) + '  (' + ago(v.at) + ' ago)'));
            box.appendChild(el('div', null, v.text));
            const play = el('button', 'bpi-play', 'PLAY');
            play.type = 'button';
            play.addEventListener('click', function () {
                Mem.markHeard(v.id);
                const ph = getPhone();
                if (ph && ph.say) ph.say(v.text);
                render();
            });
            box.appendChild(play);
            body.appendChild(box);
        });
    }

    function renderCalls() {
        const list = Mem.get().callLog.slice().reverse();
        if (!list.length) { body.appendChild(el('div', 'bpi-empty', 'No calls yet.')); return; }
        list.forEach(function (c) {
            const who = c.dir === 'in' ? 'EVELYN CALLED' : 'YOU CALLED';
            const box = el('div', 'bpi-item');
            box.appendChild(el('div', 'd', fmt(c.at) + '  (' + ago(c.at) + ' ago)'));
            box.appendChild(el('div', null, who + ' - ' + (c.res || '')));
            body.appendChild(box);
        });
        const lm = Mem.get().leftMsgs.slice().reverse();
        if (lm.length) {
            body.appendChild(el('div', 'bpi-line', 'YOUR MESSAGES TO HER'));
            lm.forEach(function (x) {
                const box = el('div', 'bpi-item');
                box.appendChild(el('div', 'd', fmt(x.at) + (x.read ? '  (she read it)' : '  (not read yet)')));
                box.appendChild(el('div', null, x.text));
                body.appendChild(box);
            });
        }
    }

    // ─── Messages avec tout le monde (registre commun) ───
    function society() { return window.BadTherapistSociety || null; }
    function renderMsgs() {
        const S = society();
        if (!S) { body.appendChild(el('div', 'bpi-empty', 'Messaging is not loaded.')); return; }
        const R = S.registry, M = S.messaging;
        body.appendChild(el('div', 'bpi-line', 'MY NUMBER: ' + (R.actor('player').number)));
        if (!chatWith) {
            R.directory().filter(function (d) { return d.id !== 'player'; }).forEach(function (d) {
                const n = M.unread('player').filter(function (m) { return m.from === d.id; }).length;
                const b = el('button', 'bpi-btn', d.name.toUpperCase() + '  ' + d.number + (n ? '  (' + n + ' NEW)' : ''));
                b.type = 'button';
                b.addEventListener('click', function () { chatWith = d.id; render(); });
                body.appendChild(b);
            });
            return;
        }
        const who = R.actor(chatWith);
        const back = el('button', 'bpi-play', '< BACK');
        back.type = 'button';
        back.addEventListener('click', function () { chatWith = null; render(); });
        body.appendChild(back);
        body.appendChild(el('div', 'bpi-num', who ? who.name : '?'));
        M.markRead('player', chatWith);
        M.thread('player', chatWith, 14).forEach(function (m) {
            const mine = m.from === 'player';
            const box = el('div', 'bpi-item' + (mine ? '' : ' new'));
            box.appendChild(el('div', 'd', (mine ? 'YOU' : who.name.toUpperCase()) + '  ' + fmt(m.at)));
            box.appendChild(el('div', null, m.text));
            body.appendChild(box);
        });
        chatInput = el('input', 'bpi-in');
        chatInput.type = 'text'; chatInput.maxLength = 300; chatInput.autocomplete = 'off'; chatInput.spellcheck = false;
        chatInput.placeholder = 'Write to ' + (who ? who.name : '') + '...';
        chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
        body.appendChild(chatInput);
        const send = el('button', 'bpi-btn', 'SEND');
        send.type = 'button';
        send.addEventListener('click', sendChat);
        body.appendChild(send);
        if (who && who.external) body.appendChild(el('div', 'bpi-note', 'Evelyn answers when she feels like it. For a call or a voicemail, use the PHONE tab.'));
    }
    function sendChat() {
        const S = society(), v = chatInput ? chatInput.value.trim() : '';
        if (!S || !v || !chatWith) return;
        chatInput.value = '';
        const dest = S.registry.actor(chatWith);
        if (dest && dest.id === 'evelyn' && life) life.leaveMessage(v);        // Evelyn la lit aussi par son circuit habituel
        S.messaging.send('player', chatWith, v);
        render();
        if (chatInput) chatInput.focus();
    }

    function render() {
        if (!root) return;
        const keep = msgInput ? msgInput.value : '';
        const keepChat = chatInput ? chatInput.value : '';
        chatInput = null;
        body.textContent = '';
        clockEl = null;
        msgInput = null;
        const unheard = Mem.get().voicemails.filter(function (v) { return !v.heard; }).length;
        tabs.home.textContent = 'PHONE';
        tabs.vm.textContent = 'VOICEMAIL' + (unheard ? ' (' + unheard + ')' : '');
        tabs.calls.textContent = 'CALLS';
        const S0 = society(), newMsgs = S0 ? S0.messaging.unread('player').length : 0;
        tabs.msgs.textContent = 'MSGS' + (newMsgs ? ' (' + newMsgs + ')' : '');
        Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('on', k === tab); });
        if (tab === 'msgs') { renderMsgs(); if (chatInput && keepChat) chatInput.value = keepChat; }
        else if (tab === 'vm') renderVoicemail();
        else if (tab === 'calls') renderCalls();
        else { renderHome(); if (keep && msgInput) msgInput.value = keep; }
    }

    // ─── Actions ─────────────────────────────────────────────────────
    async function callNow() {
        if (calling || !talk || (talk.isOpen && talk.isOpen())) return null;
        calling = true;
        if (opts.onCallStart) opts.onCallStart();
        note = '';
        tab = 'home';
        show();
        render();
        let r = { answered: false };
        try { r = await talk.openDial(); } catch (e) { r = { answered: false }; }
        calling = false;
        if (opts.onCallResult) opts.onCallResult(r);
        if (r && r.answered) { hide(); return r; }
        note = r && r.busy ? '' : 'It rings... nobody picks up. Leave a message?';
        show();
        render();
        if (msgInput) msgInput.focus();
        return r;
    }

    async function sendMessage() {
        const v = msgInput ? msgInput.value.trim() : '';
        if (!v) return;
        msgInput.value = '';
        const ok = life ? await life.leaveMessage(v) : (Mem.leaveMessage(v), true);
        note = ok ? 'Message left. She will hear it.' : 'Could not leave the message.';
        render();
    }

    // ─── Ouverture / fermeture ───────────────────────────────────────
    function build() {
        if (root) return;
        ensureStyle();
        root = el('div', 'bpi');
        const top = el('div', 'bpi-top');
        top.appendChild(el('span', null, 'MY PHONE'));
        const x = el('button', 'bpi-x', 'X');
        x.type = 'button';
        x.addEventListener('click', hide);
        top.appendChild(x);
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

        // les touches tapées ici ne doivent pas faire marcher le joueur
        root.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); hide(); }
        });
        if (life && life.onChange) life.onChange(function () { if (isOn) render(); });
        window.addEventListener('badtherapist:message', function () { if (isOn) render(); });
    }

    function show() {
        build();
        if (isOn) return;
        isOn = true;
        root.classList.add('on');
        clearInterval(clockTimer);
        clockTimer = setInterval(tickClock, 15000);
    }

    function hide() {
        isOn = false;
        clearInterval(clockTimer);
        if (root) root.classList.remove('on');
    }

    function open() { show(); render(); }
    function toggle() { if (isOn) hide(); else open(); }

    return { open: open, close: hide, toggle: toggle, callNow: callNow, isOpen: function () { return isOn; } };
}
