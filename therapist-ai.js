// therapist-ai.js – Evelyn parle.
//   • une boîte de dialogue pixel (texte lettre par lettre + « blip »), SEULEMENT quand le joueur est assis ;
//   • une bulle au-dessus de sa tête quand le joueur est debout : c'est l'IA qui la dit, pas une phrase toute faite ;
//   • l'accueil de la séance est aussi écrit par l'IA : présentation + prénom (1re fois), remerciements pour l'appel et l'attente ;
//   • un minuteur INVISIBLE : Evelyn connaît la durée prévue, conclut seule, réclame son tarif, fixe quand rappeler le patient ;
//   • le téléphone : openCall() (utilisé par evelyn-phone.js) pour les appels qu'elle passe elle-même ;
//   • SA MÉMOIRE (therapist-memory.js) : elle décide de ce qu'elle retient, oublie, veut, de ses habitudes, de son agenda ;
//   • si l'IA ne répond pas : on réessaie, puis on le dit au joueur. On n'invente JAMAIS une réplique à sa place.
//
// Contexte (qui elle est)  : json/therapist/context.txt  (les lignes qui commencent par # sont ignorées)
// Dernier recours / textes : json/therapist/lines.json

import { THERAPIST_CONFIG } from './therapist-config.js';
import { Mem } from './therapist-memory.js';

const CSS = `
.btt{position:fixed;left:0;right:0;bottom:0;z-index:210;display:none;justify-content:center;padding:0 12px max(12px,env(safe-area-inset-bottom));
  font-family:'Press Start 2P',monospace;pointer-events:none}
.btt.on{display:flex}
.btt-box{pointer-events:auto;width:min(760px,100%);background:#050505;border:4px solid #f2f2f2;padding:14px 16px 12px;color:#f2f2f2;box-shadow:0 0 0 4px #000}
.btt-name{font-size:10px;color:#9a9a9a;margin-bottom:10px;letter-spacing:1px}
.btt-text{font-size:clamp(10px,2.4vw,14px);line-height:1.9;min-height:5.7em;max-height:28vh;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;cursor:pointer}
.caret{display:inline-block;width:.7em;height:1em;background:#f2f2f2;vertical-align:-0.12em;margin-left:2px;animation:bttc .7s steps(1) infinite}
@keyframes bttc{50%{opacity:0}}
.btt-hint{font-size:8px;line-height:1.6;color:#9a9a9a;margin-top:8px;min-height:1em}
.btt-row{display:flex;gap:8px;margin-top:8px}
.btt-in{flex:1;min-width:0;background:#000;border:2px solid #777;color:#f2f2f2;font-family:inherit;font-size:clamp(9px,2.2vw,12px);padding:10px;outline:0}
.btt-in:focus{border-color:#f2f2f2}
.btt-in:disabled{opacity:.45}
.btt-btn{background:transparent;border:2px solid #888;color:#f2f2f2;font-family:inherit;font-size:10px;padding:0 12px;cursor:pointer}
.btt-btn:hover:not(:disabled){background:#f2f2f2;color:#000}
.btt-btn:disabled{opacity:.4;cursor:default}
.btt-bubble{position:fixed;left:0;top:0;z-index:205;display:none;pointer-events:none;width:max-content;max-width:min(300px,72vw);
  background:#050505;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;color:#f2f2f2;padding:10px 12px;
  font-family:'Press Start 2P',monospace;font-size:clamp(8px,1.9vw,11px);line-height:1.8;white-space:pre-wrap;word-wrap:break-word;
  transform:translate(-50%,-100%)}
.btt-bubble::after{content:"";position:absolute;left:50%;bottom:-13px;margin-left:-8px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #f2f2f2}
`;

// Dernier recours seulement (bulle, premier accueil) si l'IA est totalement hors service, et textes d'interface
const DEFAULT_LINES = {
    greeting: 'Hello.',
    greetingReturning: ['Hello again.'],
    standing: ['Hm?'],
    standingReturning: ['Hm?'],
    nudge: ['...'],
    farewell: ['Goodbye.'],
    retry: '[ the line went dead. Press SEND to try again ]',
    callFail: '[ the line is dead. It will ring again ]'
};

// ─── Forme technique des réponses (aucune consigne de comportement ici) ───
const MEMORY_FORM = `{"remember":[],"forget":[],"private":[],"will":null,"habits":null,"self":null,"feeling":null,"player_name":null,"thought":null,"recall":null}`;

const FORM_RULES = [
    `---`,
    `FORME DE TA RÉPONSE (technique) :`,
    `Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans \`\`\`, de cette forme (tout est optionnel sauf "say") :`,
    `{"say":"ce que tu dis à voix haute","memory":${MEMORY_FORM},"end":false,"session_minutes":null,"next_call_hours":null,"next_call_note":null,"agreed_price":null,"voicemail":null}`,
    `- "say" : ce que tu dis à voix haute, sans markdown ni didascalies entre astérisques, @@LANG@@.`,
    `- "memory" : ce que tu fais de TA mémoire. Omets-le ou laisse-le vide pour ne rien changer.`,
    `    remember : ce que tu choisis de garder (phrases courtes, sans « [f1] » ni date).`,
    `    forget : ids de tes notes ("f3", "p2") ou bout de texte à effacer.`,
    `    private : tes pensées à toi, secrètes.`,
    `    will : la liste COMPLÈTE de ce que tu veux (elle remplace l'ancienne), ou null pour ne pas y toucher.`,
    `    habits : la liste COMPLÈTE de tes habitudes, en vraies phrases (elle remplace l'ancienne), ou null.`,
    `    self : comment tu te vois toi-même en ce moment, ou null.`,
    `    feeling : ce que tu ressens, ou null.`,
    `    player_name : son prénom, si tu l'apprends et veux le garder, sinon null.`,
    `    thought : ce que tu penses sans le dire (ton monologue intérieur, gardé dans ton journal), ou null.`,
    `    recall : quelques mots-clés pour relire de vieux souvenirs (ils te reviendront en tête à ta prochaine réponse), ou null.`,
    `- "end" : true pour mettre fin à la conversation en cours.`,
    `- "agreed_price" : un tarif sur lequel vous vous mettez d'accord (ex. "60 dollars"), sinon null.`,
    `- "voicemail" : un message vocal que tu laisses sur le téléphone de la personne, qu'elle écoutera quand elle voudra, sinon null. Tes derniers messages sont dans tes notes : inutile de répéter ce que tu as déjà laissé.`
].join('\n');

// Ce qu'elle peut faire dans son monde : court (chaque mot coûte du quota), aucune obligation
const POSSIBILITIES = [
    `---`,
    `CE QUE TU PEUX FAIRE DANS TON MONDE (rien n'est obligatoire : tu peux ne rien utiliser) :`,
    `- parler, ou te taire (laisse "say" vide) ;`,
    `- appeler la personne chez elle ("next_call_hours"), décrocher ou non quand elle t'appelle ("answer") ;`,
    `- lui laisser un message vocal sur son téléphone ("voicemail") ;`,
    `- mettre fin à une conversation ("end") ;`,
    `- garder, oublier ou cacher des souvenirs, changer ta façon d'être ("memory").`
].join('\n');

const SESSION_RULES = [
    `TES OUTILS DE THÉRAPEUTE (des savoir-faire propres à ton métier : jamais des obligations, tu es libre de ne pas les utiliser) :`,
    `- ton minuteur invisible : tu sais depuis combien de temps vous parlez, et tu peux fixer une durée prévue ("session_minutes", entre 5 et 180) ;`,
    `- mener une séance et y mettre fin quand tu le décides, ou ne jamais la finir ("end") ;`,
    `- décider quand revoir la personne ("next_call_hours" : un nombre d'heures, comme tu le sens ; "next_call_note" pour dire pourquoi) ;`,
    `- convenir d'un tarif, si tu le veux ("agreed_price").`
].join('\n');

const CALL_RULES = [
    `---`,
    `CONTEXTE : TÉLÉPHONE. Tu appelles la personne sur le téléphone de son appartement. Ce n'est pas une rencontre en face à face.`,
    `Tu peux raccrocher quand tu veux ("end": true) et fixer un rappel ("next_call_hours", "next_call_note").`
].join('\n');

const DIAL_RULES = [
    `---`,
    `CONTEXTE : ON T'APPELLE. Ton téléphone sonne : la personne a composé ton numéro. Ce n'est pas une rencontre en face à face.`,
    `Tu peux décrocher ou laisser sonner, comme tu veux. Si tu laisses sonner, tu peux le garder en mémoire.`,
    `Ajoute le champ "answer" (true = tu décroches, false = tu ne décroches pas ; dans ce cas "say" peut rester vide). Si tu décroches, "say" = ta première phrase.`,
    `Tu peux raccrocher quand tu veux ("end": true) et fixer un rappel ("next_call_hours", "next_call_note").`
].join('\n');

const IMPULSE_RULES = [
    `---`,
    `CONTEXTE : TU ES SEULE CHEZ TOI. La personne n'est pas là ; personne ne te demande rien.`,
    `Tu peux l'appeler maintenant, de ta propre initiative, à n'importe quelle heure, ou ne pas le faire.`,
    `Réponds UNIQUEMENT par un objet JSON : {"call":false,"note":null,"voicemail":null,"memory":${MEMORY_FORM}}.`,
    `"call" : true si tu l'appelles maintenant ; "note" = pourquoi (une phrase). "voicemail" : un message vocal à lui laisser sur son téléphone, au lieu d'appeler. Tu peux aussi ne rien faire, ou seulement noter une pensée secrète.`
].join('\n');

const FIRST_CONTACT_RULES = [
    `---`,
    `C'est la toute première fois que vous vous parlez : vous ne vous connaissez pas.`,
    `Si c'est toi qui appelles, c'est un appel inattendu chez elle. Si c'est elle qui a composé ton numéro, elle ne sait de toi que ce numéro.`
].join('\n');

const RESUME_CONTACT_RULES = [
    `---`,
    `Vous avez déjà commencé à vous parler au téléphone, mais la ligne s'est coupée ou la personne a raccroché.`
].join('\n');

const BUBBLE_RULES = [
    `---`,
    `Une personne est chez toi, debout. Tu peux lui dire quelque chose ou ne rien dire, comme tu veux.`,
    `Réponds UNIQUEMENT par un objet JSON : {"say":"…"}. "say" : une phrase courte (100 caractères maximum), sans markdown ni astérisques, @@LANG@@. Laisse "say" vide si tu ne veux rien dire.`
].join('\n');

const REFLECT_RULES = [
    `---`,
    `LA CONVERSATION EST FINIE : la personne est partie. Le message suivant est le déroulé de cette conversation.`,
    `Tu peux relire et mettre TA mémoire à jour, seule chez toi.`,
    `Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans \`\`\` :`,
    `{"summary":"…","lastSession":"…","self":"…","next_call_hours":null,"next_call_note":null,"memory":{"remember":[],"forget":[],"private":[],"will":null,"habits":null,"feeling":null,"player_name":null,"thought":null,"recall":null}}`,
    `- summary : le résumé CUMULATIF de votre histoire (reprends l'ancien et intègre cette conversation), 900 caractères maximum.`,
    `- lastSession : 1 à 2 phrases sur cette conversation et sur la suite que tu voudrais.`,
    `- self : comment tu te vois toi-même maintenant (1 à 2 phrases). Tu peux avoir changé.`,
    `- next_call_hours : seulement si tu n'as pas encore fixé quand rappeler (en heures), sinon null.`,
    `- memory : même format que d'habitude. Tu peux fusionner les doublons et supprimer ce qui est périmé.`
].join('\n');

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

export function createTherapistTalk(opts) {
    opts = opts || {};
    const cfg = Object.assign({}, THERAPIST_CONFIG, opts.config || {});
    Mem.setTimeScale(cfg.callTimeScale || 1);

    let root = null, bub = null, styled = false;
    const el = {};
    let isOpenFlag = false;
    let busy = false;                 // elle écrit ou réfléchit
    let typing = null;                // machine à écrire de la boîte
    let history = [];                 // [{ role: 'user' | 'model', text }]  (séance ou appel en cours)
    let mode = 'session';             // 'session' (assis, en face d'elle) | 'call' (téléphone)
    let callCompleted = false;
    let callKind = 'in';              // 'in' = elle appelle le patient ; 'out' = le patient l'appelle
    let reflecting = false;
    let context = null, lines = null, secretKey = null, loadPromise = null;
    let audioCtx = null;

    // minuteur invisible de la séance
    let sessionStart = 0, plannedMin = cfg.sessionMinutes || 30;
    let closing = false, closingTurns = 0, locked = false, lastEnding = 'early';

    // bulle (joueur debout)
    let bubType = null, bubTimer = null, repeatTimer = null, bubWanted = false, watching = false, bubBusy = false;
    let repeats = 0, lastNudge = 0;
    const said = [];                  // ce qu'elle a déjà dit debout (pour ne pas se répéter)
    const bpos = { x: 0, y: 0, on: false };

    // ─── Chargement du contexte, des phrases, de la clé locale ───────
    function load() {
        if (loadPromise) return loadPromise;
        loadPromise = Promise.all([
            fetch(cfg.contextFile).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
            fetch(cfg.linesFile).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            // therapist-secret.js : optionnel, jamais poussé sur GitHub (voir therapist-config.js)
            import('./therapist-secret.js').then(function (m) { return m.GROQ_API_KEY || ''; }).catch(function () { return ''; })
        ]).then(function (r) {
            // les lignes qui commencent par # sont tes notes à toi : l'IA ne les voit pas
            context = (r[0] || '').split(/\r?\n/).filter(function (l) { return l.trim().charAt(0) !== '#'; }).join('\n');
            lines = r[1] || {};
            secretKey = r[2] || '';
        });
        return loadPromise;
    }

    function canAsk() { return !!(cfg.proxyUrl || secretKey || cfg.apiKey); }

    function lineList(key) {
        const v = lines && lines[key] != null ? lines[key] : DEFAULT_LINES[key];
        return Array.isArray(v) ? v : (v ? [v] : []);
    }
    function pickLine(key) {
        const l = lineList(key);
        return l.length ? l[Math.floor(Math.random() * l.length)] : '...';
    }

    // ─── Son « blip » ────────────────────────────────────────────────
    function blip() {
        const A = window.BadTherapistAudio;
        if (A && A.isMuted && A.isMuted()) return;
        const vol = (A && A.getVolume ? A.getVolume() : 0.7) * 0.22;
        if (vol <= 0) return;
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 190 + Math.random() * 70;
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
            osc.connect(g);
            g.connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.08);
        } catch (e) { /* pas de son possible : tant pis */ }
    }

    // ─── Machine à écrire (boîte ET bulle) ───────────────────────────
    function typeInto(host, text, done) {
        const h = { timer: null, i: 0, dead: false };
        host.textContent = '';
        if (!text) { h.dead = true; if (done) done(); return h; }
        const caret = document.createElement('span');
        caret.className = 'caret';
        const node = document.createTextNode('');
        host.appendChild(node);
        host.appendChild(caret);
        const step = function () {
            if (h.dead) return;
            const c = text.charAt(h.i++);
            node.nodeValue += c;
            if (c.trim() !== '' && h.i % 2 === 1) blip();
            host.scrollTop = host.scrollHeight;
            if (h.i >= text.length) {
                h.dead = true;
                caret.remove();
                if (done) done();
                return;
            }
            const sp = cfg.typeSpeedMs;
            h.timer = setTimeout(step, /[.!?]/.test(c) ? sp * 7 : /[,;:]/.test(c) ? sp * 3 : sp);
        };
        h.cancel = function () { h.dead = true; clearTimeout(h.timer); };
        h.finish = function () {
            if (h.dead) return;
            h.cancel();
            host.textContent = text;
            if (done) done();
        };
        step();
        return h;
    }

    function stopTyping() {
        if (typing) { if (typing.cancel) typing.cancel(); typing = null; }
    }

    // opts.onSpeak(true|false) : le jeu peut changer l'animation de l'avatar pendant qu'elle parle
    function speaking(on) { if (opts.onSpeak) { try { opts.onSpeak(on); } catch (e) { /* rien */ } } }

    function say(text, done) {
        stopTyping();
        speaking(true);
        typing = typeInto(el.text, text, function () { typing = null; speaking(false); if (done) done(); });
    }

    // Un clic sur le texte : tout afficher d'un coup
    function skipTyping() {
        if (typing && !typing.dead) typing.finish();
    }

    function finishTurn() {
        busy = false;
        el.in.disabled = locked;
        el.send.disabled = locked;
        if (isOpenFlag && !locked) el.in.focus();
    }

    function thinking() {
        stopTyping();
        let n = 0;
        el.text.textContent = '.';
        const tm = setInterval(function () { n = (n + 1) % 4; el.text.textContent = '.'.repeat(n + 1); }, 320);
        return function () { clearInterval(tm); };
    }

    function lastModelText() {
        const last = history.filter(function (m) { return m.role === 'model'; }).pop();
        return last ? last.text : '';
    }

    // ─── Le cerveau : consignes ──────────────────────────────────────
    function worldText() {
        let w = [];
        try { w = opts.getWorld ? opts.getWorld() : []; } catch (e) { w = []; }
        if (typeof w === 'string') w = [w];
        w = (w || []).filter(Boolean);
        return w.length ? 'CE QUE TU SAIS DU MOMENT PRÉSENT :\n' + w.map(function (l) { return '- ' + l; }).join('\n') : '';
    }

    function elapsedMin() {
        return sessionStart ? Math.floor((Date.now() - sessionStart) / 60000) : 0;
    }

    // Le minuteur invisible : seule Evelyn le voit
    function timeBlock() {
        if (mode !== 'session' || !sessionStart) return '';
        const mins = elapsedMin();
        let t = 'TON MINUTEUR (toi seule le vois) : cette conversation dure depuis ' + mins + ' min ; durée que tu avais prévue : ' + plannedMin + ' min.';
        if (closing) t += ' Tu y as déjà mis fin.';
        return t;
    }

    // L'heure et la date : Evelyn sait quel jour et quelle heure il est
    function timeAware() {
        const d = new Date();
        let t = 'DATE ET HEURE : ' +
            d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '.';
        let g = '';
        try { g = opts.getGameTime ? String(opts.getGameTime() || '') : ''; } catch (e) { g = ''; }
        if (g) t += ' Heure dans ton monde : ' + g + '.';
        return t;
    }

    function priceLine() {
        const m = Mem.get();
        return m.price ? 'TARIF fixé avec cette personne : ' + m.price + '.' : '';
    }

    // Vraie première rencontre ? Dès qu'il reste une trace du passé (séance, appel, prénom, notes, résumé), NON.
    function firstMeeting() {
        const m = Mem.get();
        if (m.sessions > 0 || m.calls > 0 || m.playerName || m.price || m.summary || m.lastSession || (m.facts && m.facts.length)) return false;
        return !!Mem.isFirstMeeting();
    }

    // L'état de votre relation : des FAITS, rappelés à chaque réponse, sans consigne
    function relationBlock() {
        const m = Mem.get();
        if (firstMeeting()) return 'VOTRE RELATION : tu ne connais pas encore cette personne (c\'est votre toute première rencontre).';
        const L = ['VOTRE RELATION : vous vous connaissez déjà. Conversations déjà eues : ' + (m.sessions || 0) + '.'];
        L.push(m.playerName ? 'Son prénom est ' + m.playerName + '.' : 'Tu ne connais pas encore son prénom.');
        return L.join(' ');
    }

    // Premier contact seulement : un nouveau joueur. Un joueur déjà connu (comme ton profil admin) n'est jamais concerné.
    function contactRules() {
        const m = Mem.get();
        if (m.sessions > 0 || m.calls > 0 || m.price) return '';
        return m.callAttempts === 0 ? FIRST_CONTACT_RULES : RESUME_CONTACT_RULES;
    }

    // Langue : français sur le profil admin (ta préférence), sinon la langue de la personne en face (anglais au départ)
    function langRule() {
        let admin = false;
        try { admin = !!(window.BadTherapistSave && window.BadTherapistSave.activeProfile() === 'admin'); } catch (e) { admin = false; }
        return admin ? 'en français' : 'dans la langue de la personne en face de toi (anglais tant qu\'elle n\'a rien dit)';
    }
    function withLang(t) { return t.replace(/@@LANG@@/g, langRule()); }

    // Les derniers mots échangés : ils font remonter les souvenirs qui leur ressemblent
    function recentHint() {
        return history.slice(-4).map(function (m) { return m.text; }).join(' ');
    }

    function systemPrompt(kind, extra) {
        const parts = [context || '', worldText()];
        if (kind === 'session') parts.push(timeBlock());
        parts.push(priceLine(), timeAware(), Mem.promptBlock(recentHint()), relationBlock());
        if (kind === 'session') parts.push(FORM_RULES + '\n' + POSSIBILITIES + '\n' + SESSION_RULES);
        else if (kind === 'call') parts.push(FORM_RULES, POSSIBILITIES, CALL_RULES, contactRules());
        else if (kind === 'dial') parts.push(FORM_RULES, POSSIBILITIES, DIAL_RULES, contactRules());
        else if (kind === 'impulse') parts.push(IMPULSE_RULES);
        else if (kind === 'bubble') parts.push(BUBBLE_RULES);
        else if (kind === 'reflect') parts.push(REFLECT_RULES);
        if (extra) parts.push(extra);
        return withLang(parts.filter(Boolean).join('\n\n'));
    }

    // ─── Le cerveau : appels ─────────────────────────────────────────
    async function callLLM(system, turns) {
        // 1. Via ton propre serveur (la clé reste secrète)
        if (cfg.proxyUrl) {
            const r = await fetch(cfg.proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system: system, messages: turns, model: cfg.model, temperature: cfg.temperature, maxOutputTokens: cfg.maxOutputTokens, reasoningEffort: cfg.reasoningEffort })
            });
            if (!r.ok) throw new Error('proxy ' + r.status + ' ' + (await r.text()).slice(0, 300));   // le Worker dit pourquoi
            const d = await r.json();
            if (!d || !d.text) throw new Error('proxy sans texte');
            return String(d.text);
        }

        // 2. Directement Groq (API compatible OpenAI), seulement sur ton ordinateur
        const key = secretKey || cfg.apiKey;
        if (!key) throw new Error('aucune clé Groq');

        const messages = [{ role: 'system', content: system }].concat(turns.map(function (m) {
            // ses anciennes répliques sont renvoyées au même format JSON que celui qu'on lui demande
            return m.role === 'user'
                ? { role: 'user', content: m.text }
                : { role: 'assistant', content: JSON.stringify({ say: m.text }) };
        }));

        const body = { model: cfg.model, messages: messages, temperature: cfg.temperature, max_tokens: cfg.maxOutputTokens };
        // gpt-oss « réfléchit » avant de répondre et ces tokens comptent dans max_tokens : on garde ça court
        if (/gpt-oss/i.test(cfg.model || '')) body.reasoning_effort = cfg.reasoningEffort || 'low';

        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error('Groq ' + r.status + ' ' + (await r.text()).slice(0, 200));
        const d = await r.json();
        const text = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content
            ? String(d.choices[0].message.content).trim() : '';
        if (!text) throw new Error('réponse vide');
        return text;
    }

    // Réessaie quelques fois (le Worker essaie déjà plusieurs clés / cerveaux de son côté)
    async function ask(system, turns, tries) {
        let err;
        const n = tries || 3;
        for (let i = 0; i < n; i++) {
            try { return await callLLM(system, turns); }
            catch (e) { err = e; if (i < n - 1) await sleep(900 * (i + 1)); }
        }
        throw err;
    }

    function parseJSON(raw) {
        const t = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        try { return JSON.parse(t); } catch (e) { /* on tente autrement */ }
        const m = t.match(/\{[\s\S]*\}/);
        if (m) { try { return JSON.parse(m[0]); } catch (e) { /* idem */ } }
        return null;
    }

    function cleanSay(s) {
        return String(s || '').replace(/\*[^*]*\*/g, '').replace(/\s+/g, ' ').trim();
    }

    const num = function (v) { const n = Number(v); return isFinite(n) && v !== null && v !== '' ? n : null; };

    // { say, memory, end, sessionMinutes, nextCallHours, nextCallNote } — tolère une réponse qui n'est pas du JSON propre
    function parseReply(raw) {
        const obj = parseJSON(raw);
        if (obj && typeof obj.say === 'string') {
            return {
                say: cleanSay(obj.say),
                memory: obj.memory && typeof obj.memory === 'object' ? obj.memory : null,
                end: obj.end === true,
                sessionMinutes: num(obj.session_minutes),
                nextCallHours: num(obj.next_call_hours),
                nextCallNote: typeof obj.next_call_note === 'string' ? obj.next_call_note : '',
                agreedPrice: typeof obj.agreed_price === 'string' ? obj.agreed_price : '',
                voicemail: typeof obj.voicemail === 'string' ? obj.voicemail : ''
            };
        }
        const base = { memory: null, end: false, sessionMinutes: null, nextCallHours: null, nextCallNote: '', agreedPrice: '', voicemail: '' };
        const m = /"say"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(raw || ''));     // JSON coupé en route
        if (m) { try { return Object.assign({ say: cleanSay(JSON.parse('"' + m[1] + '"')) }, base); } catch (e) { /* suite */ } }
        const plain = cleanSay(String(raw || '').replace(/^\s*\{[\s\S]*$/, ''));  // texte normal : on le garde, mais pas du JSON brut
        if (!plain) throw new Error('réponse illisible');
        return Object.assign({ say: plain }, base);
    }

    // Applique ce qu'Evelyn a décidé en plus de parler
    function applyControls(r) {
        Mem.applyOps(r.memory);
        Mem.markLeftRead();
        if (r.agreedPrice) Mem.setPrice(r.agreedPrice);
        if (r.voicemail && r.voicemail.trim()) Mem.addVoicemail({ id: 'v' + Date.now(), at: Date.now(), text: r.voicemail.trim() });
        if (mode === 'session' && r.sessionMinutes !== null) plannedMin = Math.max(5, Math.min(180, Math.round(r.sessionMinutes)));
        if (r.nextCallHours !== null && r.nextCallHours > 0) Mem.scheduleCall(r.nextCallHours, r.nextCallNote);
    }

    async function askBrain() {
        const turns = history.slice(-cfg.maxHistoryTurns * 2);
        return parseReply(await ask(systemPrompt(mode === 'call' ? 'call' : 'session'), turns));
    }

    // Accueil écrit par l'IA : première rencontre (prénom, présentation) ou retrouvailles
    async function greetBrain(first) {
        const known = Mem.get().playerName;
        const situation = mode === 'call'
            ? 'La personne vient de décrocher le téléphone. ' +
              (Mem.get().nextCall && Mem.get().nextCall.note ? 'Raison de ton appel : ' + Mem.get().nextCall.note + '.' : '')
            : 'La personne vient de s\'asseoir en face de toi. ' +
              (first
                  ? 'Vous ne vous connaissez pas : c\'est votre toute première rencontre.'
                  : 'Vous vous connaissez déjà (voir tes notes). Conversations déjà eues : ' + Mem.get().sessions + '. ' +
                    (known ? 'Son prénom est ' + known + '. ' : 'Tu ne connais pas encore son prénom. ') +
                    (Mem.get().lastSession ? 'La dernière fois : ' + Mem.get().lastSession : ''));
        const sys = systemPrompt(mode === 'call' ? 'call' : 'session', situation);
        const r = parseReply(await ask(sys, [{ role: 'user', text: mode === 'call' ? '[Il décroche.]' : '[La personne s\'assoit.]' }]));
        applyControls(r);
        return r.say;
    }

    // Fin de séance : elle relit tout et réécrit sa mémoire
    async function reflect(transcript) {
        if (reflecting || !transcript || !transcript.length) return;
        if (!canAsk()) { Mem.clearPending(); return; }
        reflecting = true;
        try {
            await load();
            const tr = transcript.map(function (m) { return (m.role === 'user' ? 'LA PERSONNE : ' : 'TOI : ') + m.text; }).join('\n');
            const raw = await ask(systemPrompt('reflect'), [{ role: 'user', text: tr }]);
            const obj = parseJSON(raw);
            if (obj) {
                Mem.applyReflection(obj);
                const h = num(obj.next_call_hours);
                if (h !== null && h > 0 && !Mem.get().nextCall) Mem.scheduleCall(h, typeof obj.next_call_note === 'string' ? obj.next_call_note : '');
            }
            Mem.clearPending();
        } catch (e) {
            console.warn('[therapist] bilan de séance impossible, réessai à la prochaine visite :', e && e.message ? e.message : e);
        } finally {
            reflecting = false;
        }
    }

    // ─── Envoyer un message ──────────────────────────────────────────
    const NAME_STOP = ('yes no ok okay hi hello hey why what who you me nothing sure maybe idk thanks thank please oui non salut bonjour pourquoi quoi rien merci ' +
        'hm hmm none nope yeah yep fine well because never mind not just tired sorry bien mal peut etre être').split(' ');
    const NAME_WORD = "[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]{1,19}";

    // Le joueur donne son prénom : on le note nous-mêmes (« my name is Sam », « je m'appelle Sam », « I'm Sam »,
    // ou un simple « Sam » en réponse à sa question). Evelyn peut toujours le corriger ensuite.
    function learnName(msg) {
        if (Mem.get().playerName) return;
        let name = '';
        let m = new RegExp("\\b(?:my name is|my name's|call me|you can call me|people call me|name's|je m'appelle|je m’appelle|mon pr[ée]nom (?:est|c'est)|appelle[- ]moi|moi c'est)\\s+(" + NAME_WORD + ")", 'i').exec(msg);
        if (m) name = m[1];
        if (!name) {
            m = new RegExp("\\b(?:I am|I'm|Im|Je suis)\\s+([A-ZÀ-Ý][a-zà-ÿ'’-]{1,19})\\b").exec(msg);
            if (m) name = m[1];
        }
        if (!name) {
            const last = lastModelText();
            const asked = /\?/.test(last) && /(\bname\b|pr[ée]nom|call you|appeler|appelles)/i.test(last);
            const t = msg.trim().replace(/[.!]+$/, '');
            if (asked && t.split(/\s+/).length <= 2 && new RegExp('^' + NAME_WORD + '(?:\\s+' + NAME_WORD + ')?$').test(t)) name = t;
        }
        if (!name) return;
        if (name.split(/\s+/).some(function (w) { return NAME_STOP.indexOf(w.toLowerCase()) !== -1; })) return;
        name = name.charAt(0).toUpperCase() + name.slice(1);
        Mem.applyOps({ player_name: name });
    }

    async function send() {
        if (busy || locked) return;
        const msg = el.in.value.trim().slice(0, cfg.maxPlayerChars);
        if (!msg) return;
        el.in.value = '';
        el.hint.textContent = '';
        busy = true;
        el.in.disabled = true;
        el.send.disabled = true;
        history.push({ role: 'user', text: msg });
        if (mode === 'session') Mem.noteTurn('user', msg);
        learnName(msg);

        const stopDots = thinking();
        let r = null;
        try {
            await load();
            r = await askBrain();
        } catch (e) {
            console.warn('[therapist] IA indisponible :', e && e.message ? e.message : e);
        }
        stopDots();

        if (!r) {
            // L'IA n'a pas répondu : on n'invente rien à sa place. Le message du joueur est rendu, rien n'est mémorisé.
            history.pop();
            if (mode === 'session') Mem.popTurn('user');
            el.in.value = msg;
            el.text.textContent = lastModelText();
            el.hint.textContent = pickLine('retry');
            finishTurn();
            return;
        }

        applyControls(r);
        if (mode === 'session') {
            if (r.end && !closing) { closing = true; closingTurns = 0; }
            else if (closing) closingTurns++;
        }
        history.push({ role: 'model', text: r.say });
        if (mode === 'session' && r.say.trim()) Mem.noteTurn('model', r.say);
        if (!isOpenFlag) { busy = false; return; }

        const afterSay = function () {
            if (mode === 'call' && r.end) { setTimeout(hangUp, 1800); busy = false; return; }
            if (mode === 'session' && closing && closingTurns >= 2) {
                locked = true;
                el.in.placeholder = 'The session is over.';
                el.hint.textContent = '[ the session is over ]';
            }
            finishTurn();
        };
        if (r.say.trim()) say(r.say, afterSay);
        else { stopTyping(); el.text.textContent = ''; afterSay(); }     // elle ne répond pas : rien ne s'affiche
    }

    // ─── La bulle au-dessus de sa tête (joueur debout) ───────────────
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

    function ensureBubble() {
        ensureStyle();
        if (bub) return;
        bub = document.createElement('div');
        bub.className = 'btt-bubble';
        document.body.appendChild(bub);
    }

    function placeBubble() {
        if (!bub) return;
        if (!bubWanted || !bpos.on) { bub.style.display = 'none'; return; }
        bub.style.display = 'block';
        bub.style.left = Math.round(bpos.x) + 'px';
        bub.style.top = Math.round(bpos.y - 14) + 'px';
    }

    function showBubble(text) {
        ensureBubble();
        clearTimeout(bubTimer);
        clearTimeout(repeatTimer);
        if (bubType) bubType.cancel();
        bubWanted = true;
        placeBubble();
        bubType = typeInto(bub, text, function () {
            bubTimer = setTimeout(softHide, Math.max(3500, text.length * 70));
        });
    }

    // la bulle disparaît ; si le joueur est toujours debout, elle reparlera (au plus 2 fois, pour ne pas épuiser l'IA)
    function softHide() {
        clearTimeout(bubTimer);
        clearTimeout(repeatTimer);
        if (bubType) { bubType.cancel(); bubType = null; }
        bubWanted = false;
        placeBubble();
        if (watching && repeats < 2) {
            repeatTimer = setTimeout(function () {
                if (watching && !isOpenFlag) { repeats++; speakBubble('wait'); }
            }, 25000);
        }
    }

    function hideBubble(stopWatching) {
        if (stopWatching) watching = false;
        softHide();
    }

    // Ce qu'elle sait de la situation quand elle parle debout-devant-toi
    function bubbleSituation(kind) {
        const first = firstMeeting();
        const lastSaid = said.length ? ' Ce que tu as déjà dit pendant qu\'elle restait debout : ' + said.slice(-4).join(' / ') : '';
        if (kind === 'enter') {
            return 'Une personne vient d\'entrer chez toi et reste debout. ' +
                (first ? 'Tu ne la connais pas.' : 'Tu la connais déjà.') + lastSaid;
        }
        if (kind === 'click') return 'La personne te touche alors qu\'elle est toujours debout.' + lastSaid;
        if (kind === 'wait') return 'La personne est toujours debout depuis un moment.' + lastSaid;
        if (kind === 'farewell') {
            return lastEnding === 'normal'
                ? 'La conversation est terminée et la personne se lève pour partir.'
                : 'La personne se lève pour partir au milieu de la conversation.';
        }
        return '';
    }

    // C'est l'IA qui parle ; une phrase toute faite n'est qu'un dernier recours si elle est vraiment hors service
    async function speakBubble(kind) {
        if (bubBusy || isOpenFlag) return;
        bubBusy = true;
        let text = '';
        let answered = false;      // l'IA a répondu (même par un silence) : pas de phrase de secours
        try {
            await load();
            if (canAsk()) {
                const sys = systemPrompt('bubble', bubbleSituation(kind));
                const r = parseReply(await ask(sys, [{ role: 'user', text: '[' + kind + ']' }], 2));
                text = r.say.slice(0, 140);
                answered = true;
            }
        } catch (e) {
            console.warn('[therapist] bulle : IA indisponible, phrase de secours :', e && e.message ? e.message : e);
        }
        bubBusy = false;
        if (!text && !answered) {
            const returning = Mem.get().sessions > 0;
            text = pickLine(kind === 'farewell' ? 'farewell' : (kind === 'enter' ? (returning ? 'standingReturning' : 'standing') : 'nudge'));
        }
        if (!text) return;                                  // elle a choisi de ne rien dire
        if (isOpenFlag) return;
        if (kind !== 'farewell' && !watching) return;       // il s'est assis entre-temps
        said.push(text);
        if (said.length > 8) said.shift();
        showBubble(text);
    }

    // Le joueur vient d'entrer, debout : elle l'invite à s'asseoir
    async function greetStanding() {
        await load();
        if (isOpenFlag) return;
        watching = true;
        repeats = 0;
        said.length = 0;
        setTimeout(function () { if (!isOpenFlag && watching) speakBubble('enter'); }, 1000);
    }

    // Le joueur clique sur elle alors qu'il est debout
    async function nudge() {
        if (Date.now() - lastNudge < 3500) return;
        lastNudge = Date.now();
        await load();
        if (isOpenFlag) return;
        watching = true;
        speakBubble('click');
    }

    // Le joueur se lève : elle réagit (puis se tait)
    async function farewell() {
        await load();
        if (isOpenFlag) return;
        watching = false;
        speakBubble('farewell');
    }

    // work.js appelle ça à chaque image avec la position écran de sa tête
    function updateBubble(x, y, onScreen) {
        bpos.x = x; bpos.y = y; bpos.on = !!onScreen;
        if (bub) placeBubble();
    }

    // ─── Interface ───────────────────────────────────────────────────
    function build() {
        if (root) return;
        ensureStyle();

        root = document.createElement('div');
        root.className = 'btt';
        root.innerHTML =
            '<div class="btt-box">' +
              '<div class="btt-name"></div>' +
              '<div class="btt-text"></div>' +
              '<div class="btt-hint"></div>' +
              '<div class="btt-row">' +
                '<input class="btt-in" type="text" autocomplete="off" spellcheck="false" placeholder="Say something...">' +
                '<button class="btt-btn btt-send" type="button">SEND</button>' +
                '<button class="btt-btn btt-close" type="button" aria-label="Close">X</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(root);

        el.name = root.querySelector('.btt-name');
        el.text = root.querySelector('.btt-text');
        el.hint = root.querySelector('.btt-hint');
        el.in = root.querySelector('.btt-in');
        el.send = root.querySelector('.btt-send');
        el.close = root.querySelector('.btt-close');
        el.name.textContent = cfg.name;
        el.in.maxLength = cfg.maxPlayerChars;

        // Les touches tapées ici ne doivent pas faire marcher le joueur
        root.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Enter' && e.target === el.in) { e.preventDefault(); send(); }
        });
        el.send.addEventListener('click', send);
        el.close.addEventListener('click', close);
        el.text.addEventListener('click', skipTyping);
    }

    function trapKeys(e) {
        if (root.contains(e.target)) return;
        e.stopPropagation();
        if (e.key === 'Escape') close();
    }

    function showBox() {
        build();
        isOpenFlag = true;
        hideBubble(true);
        root.classList.add('on');
        document.addEventListener('keydown', trapKeys, true);
        el.name.textContent = mode === 'call' ? cfg.name + ' (PHONE)' : cfg.name;
        el.hint.textContent = '';
        el.in.placeholder = 'Say something...';
        el.in.disabled = true;
        el.send.disabled = true;
        busy = true;
    }

    // À appeler seulement quand le joueur est ASSIS (work.js s'en occupe)
    async function open() {
        if (isOpenFlag) return;
        mode = 'session';
        showBox();
        await load();
        if (!isOpenFlag) return;

        if (history.length) {
            // On rouvre la séance en cours : on remontre sa dernière phrase
            el.text.textContent = lastModelText();
            if (locked) el.hint.textContent = '[ the session is over ]';
            finishTurn();
            return;
        }

        // Nouvelle séance
        closing = false; closingTurns = 0; locked = false;
        const first = firstMeeting();
        console.info('[therapist] mémoire lue : ' + Mem.get().sessions + ' séance(s), prénom « ' + (Mem.get().playerName || '?') + ' », première rencontre : ' + first);
        const pend = Mem.get().pending.length ? Mem.get().pending.slice() : null;   // séance précédente jamais résumée
        const ai = canAsk();
        let greet = '';
        const stopDots = ai ? thinking() : null;
        try {
            if (pend) await reflect(pend);
            if (ai) { sessionStart = Date.now(); plannedMin = cfg.sessionMinutes || 30; greet = await greetBrain(first); }
        } catch (e) {
            console.warn('[therapist] accueil par l\'IA impossible :', e && e.message ? e.message : e);
            greet = '';
        }
        if (stopDots) stopDots();
        if (!isOpenFlag) return;

        // Dernier recours seulement : l'IA est vraiment hors service
        if (!greet) greet = first ? pickLine('greeting') : pickLine('greetingReturning');
        sessionStart = Date.now();
        plannedMin = cfg.sessionMinutes || 30;
        Mem.startSession();
        history.push({ role: 'model', text: greet });
        Mem.noteTurn('model', greet);
        say(greet, finishTurn);
    }

    // Appel téléphonique : c'est elle qui appelle (utilisé par evelyn-phone.js)
    async function openCall() {
        if (isOpenFlag) return;
        mode = 'call';
        callKind = 'in';
        callCompleted = false;
        history = [];
        showBox();
        await load();
        if (!isOpenFlag) return;

        const stopDots = thinking();
        let greet = '';
        try { greet = canAsk() ? await greetBrain(false) : ''; }
        catch (e) { console.warn('[therapist] appel : IA indisponible :', e && e.message ? e.message : e); }
        stopDots();
        if (!isOpenFlag) return;

        if (!greet) {
            // Pas de réplique inventée : la ligne est coupée, le téléphone sonnera de nouveau
            el.text.textContent = pickLine('callFail');
            setTimeout(close, 2200);
            return;
        }
        history.push({ role: 'model', text: greet });
        Mem.noteCallAttempt();
        say(greet, finishTurn);
    }

    // Le patient compose le numéro d'Evelyn (phone.onDial) : elle décroche, ou pas.
    // Renvoie { answered: true|false } : si false, le jeu fait sonner dans le vide.
    async function openDial() {
        if (isOpenFlag) return { answered: false, busy: true };
        await load();
        if (!canAsk()) return { answered: false };
        let raw = '', obj = null;
        try {
            raw = await ask(systemPrompt('dial'), [{ role: 'user', text: '[La personne compose ton numéro. Ton téléphone sonne.]' }], 2);
            obj = parseJSON(raw);
        } catch (e) {
            console.warn('[therapist] appel entrant : IA indisponible :', e && e.message ? e.message : e);
            return { answered: false };
        }
        if (obj) {
            Mem.applyOps(obj.memory);
            const h = num(obj.next_call_hours);
            if (h !== null && h > 0) Mem.scheduleCall(h, typeof obj.next_call_note === 'string' ? obj.next_call_note : '');
            if (obj.answer === false) { Mem.noteDialed(false); return { answered: false }; }
        }
        let r;
        try { r = parseReply(raw); } catch (e) { Mem.noteDialed(false); return { answered: false }; }
        Mem.noteDialed(true);
        Mem.noteCallAttempt();
        if (r.agreedPrice) Mem.setPrice(r.agreedPrice);
        mode = 'call';
        callKind = 'out';
        callCompleted = false;
        history = [];
        showBox();
        history.push({ role: 'model', text: r.say });
        say(r.say, function () {
            if (r.end) { setTimeout(hangUp, 1800); busy = false; return; }
            finishTurn();
        });
        return { answered: true };
    }

    // Ce que le Worker doit connaître d'Evelyn pour la faire penser quand le jeu est fermé
    async function getSyncPayload() {
        await load();
        return { context: context || '', memory: Mem.promptBlock(), playerName: Mem.get().playerName || '' };
    }

    // Le patient n'a pas décroché : à appeler depuis le code du téléphone quand une sonnerie reste sans réponse
    function callMissed() { Mem.noteMissedCall(); }

    // Evelyn, seule, se demande si elle veut appeler. À appeler de temps en temps quand le joueur n'est pas en séance
    // (par exemple toutes les 10 à 15 minutes de jeu). Si elle veut : son appel est programmé dans ~30 s et
    // Mem.callDue() devient vrai, donc le téléphone sonne par le même chemin que d'habitude.
    let lastConsider = 0;
    async function considerCall(extra) {
        if (isOpenFlag || reflecting || mode !== 'session') return null;
        const m = Mem.get();
        if (m.nextCall && m.nextCall.dueAt <= Date.now()) return null;           // un appel est déjà dû
        if (Date.now() - lastConsider < 0.9 * (cfg.thinkEveryMin || 15) * 60000 * (cfg.callTimeScale || 1)) return null;
        lastConsider = Date.now();
        await load();
        if (!canAsk()) return null;
        try {
            const raw = await ask(systemPrompt('impulse', extra), [{ role: 'user', text: '[Tu es seule. Rien ne se passe.]' }], 1);
            const obj = parseJSON(raw);
            if (!obj) return null;
            Mem.applyOps(obj.memory);
            if (typeof obj.voicemail === 'string' && obj.voicemail.trim()) Mem.addVoicemail({ id: 'v' + Date.now(), at: Date.now(), text: obj.voicemail.trim() });
            if (obj.call === true) {
                const note = typeof obj.note === 'string' ? obj.note : '';
                Mem.scheduleCall(0.01, note);
                return { call: true, note: note };
            }
        } catch (e) {
            console.warn('[therapist] envie d\'appeler : IA indisponible :', e && e.message ? e.message : e);
        }
        return { call: false };
    }

    function hangUp() {
        callCompleted = true;
        close();
    }

    // Ferme seulement la boîte (la séance continue : le joueur est toujours assis)
    function close() {
        speaking(false);
        if (!isOpenFlag) return;
        isOpenFlag = false;
        stopTyping();
        busy = false;
        root.classList.remove('on');
        document.removeEventListener('keydown', trapKeys, true);
        if (mode === 'call') {
            const done = callCompleted;
            mode = 'session';
            callCompleted = false;
            history = [];
            if (opts.onCallEnd) opts.onCallEnd(done, callKind);
        }
        if (opts.onClose) opts.onClose();
    }

    // Le joueur se lève : fin de la séance, elle fait son bilan en arrière-plan
    function endSession() {
        if (mode === 'call') return;
        const snap = history.slice();
        lastEnding = closing ? 'normal' : 'early';
        history = [];
        closing = false; closingTurns = 0; locked = false; sessionStart = 0;
        close();
        if (snap.some(function (m) { return m.role === 'user'; })) reflect(snap);
        else Mem.clearPending();
    }

    return {
        open: open,
        openCall: openCall,
        openDial: openDial,
        getSyncPayload: getSyncPayload,
        callMissed: callMissed,
        considerCall: considerCall,
        close: close,
        endSession: endSession,
        isOpen: function () { return isOpenFlag; },
        reset: function () { history = []; },
        // bulle (joueur debout)
        greetStanding: greetStanding,
        nudge: nudge,
        farewell: farewell,
        hideBubble: hideBubble,
        updateBubble: updateBubble
    };
}
