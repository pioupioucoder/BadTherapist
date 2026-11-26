// evelyn-core.js – TOUT Evelyn dans UN seul fichier : réglages, caractère, mémoire, cerveau, vie propre, cloud.
//
// Sections (dans l'ordre) :
//   1. THERAPIST_CONFIG   réglages techniques (URL du Worker Cloudflare, rythme de réflexion, quotas)
//   2. EVELYN_CORE        QUI elle est : monde, personnalité, but profond, règle de réponse  <- c'est ici que tu changes son caractère
//   4. Mind               mémoire vivante commune (notes, pensées, envies...) + nettoyage de l'ancienne mémoire obsédée (purge)
//   5. createBrainSystem  le cerveau : prompt, perception, actions
//   6. createAutonomy     sa vie propre : pulsions (explorer, jouer, bouger) qui la réveillent
//   7. startEvelynCloud   le Worker Cloudflare : elle continue de vivre quand le jeu est fermé
//   9. createPlayerWatch  ce qu'elle observe du joueur (aucun appel IA)  (ex- player-watch.js)
//  10. createBrainLog     journal de ses réflexions, téléchargeable (Ctrl+Alt+B)  (ex- brain-log.js)
//  11. createEvelynBody   son CORPS 3D dans la rue (modèle, animations, bulle, marche, immeuble)  (ex- avatar-body.js)
//  12. Dialogue           les bulles de parole de tout le monde : Evelyn au milieu de l'écran, les PNJ au-dessus de la tête  (ex- speech-bubbles.js)
//
// Les anciens fichiers (therapist-config.js, therapist-memory.js, avatar-mind.js, avatar-brain.js, avatar-autonomy.js,
// evelyn-cloud.js, life-sync.js) ne contiennent plus qu'UNE ligne qui renvoie ici : ils servent uniquement à ne pas casser
// les imports des autres fichiers. Quand plus rien ne les importe, tu peux les supprimer (voir la commande findstr à la fin du message).
//
// Reste hors de ce fichier, volontairement : le Worker Cloudflare (workers/evelyn-brain.js : il tourne chez Cloudflare,
// il faut le redéployer à la main) et save-data.js (il gère les profils et la clé bt_evelyn_memory).

import { isNpc } from '../npcs/index.js';       // les PNJ n'ont aucun cerveau (voir npcs/ et engine/npc-driver.js)


// ═══════════════════════════════════════════════════════════════════════════
// 1. THERAPIST_CONFIG – réglages techniques  (ex- therapist-config.js)
// ═══════════════════════════════════════════════════════════════════════════
const { THERAPIST_CONFIG } = (function () {
// therapist-config.js – réglages de l'IA d'Evelyn (cerveau = Groq via le Worker Cloudflare « evelyn-brain »).
//
// OÙ METTRE QUOI :
//   - Qui est Evelyn, comment elle parle, son but, ce qu'elle sait du monde : ce fichier (bloc EVELYN_CORE, plus bas)
//   - Sa mémoire : automatique (section Mind plus bas), exportée avec la sauvegarde du jeu.
//   - La CLÉ : uniquement dans la variable Cloudflare GROK_KEY (et GROK_KEY2, 3, 4). JAMAIS dans ce fichier ni dans un message.
//
// ⚠ Tout ce qui est dans le jeu (GitHub Pages) est lisible par n'importe qui.

const AVATAR = 'evelyn';

const THERAPIST_CONFIG = {
  avatar: AVATAR,
  apiKey: '',                                // laisse vide
  proxyUrl: 'https://evelyn-brain.kristenanjavidy.workers.dev',   // Worker Cloudflare : il garde la clé (aucun secret ici)
  model: 'llama-3.3-70b-versatile',          // le Worker ignore ce champ : le vrai modèle d'Evelyn se règle avec la variable EVELYN_MODEL dans Cloudflare
  reasoningEffort: 'low',
  temperature: 0.8,
  maxOutputTokens: 1000,
  maxHistoryTurns: 12,
  maxPlayerChars: 300,
  sessionMinutes: 30,
  sessionPrice: '50 dollars',
  callTimeScale: 1,
  typeSpeedMs: 34,
  thinkEveryMin: 15,
  evelynNumber: '555-0142',
  name: 'EVELYN',

  // ─── ÉCONOMIE DE QUOTA ───
  // Evelyn n'appelle l'IA que quand tu lui écris. Passe un réglage à true pour rallumer cette fonction.
  aiBubbles: false,        // phrases au-dessus de sa tête quand tu es debout (sinon : rien)
  aiGreeting: false,       // accueil écrit par l'IA à l'ouverture de la séance (sinon : rien)
  reflectOnOpen: false,    // bilan de la séance précédente à l'ouverture (le bilan à la fin de séance reste actif)
  aiImpulse: false,        // Evelyn décide seule d'appeler / laisser un message
  lifeEnabled: false,      // plus de « vie » quand le jeu est fermé
  lifeSyncSec: 120,

  // Le cerveau commun (avatar-brain.js). Seule Evelyn en a un : Oliver, Pluie et les autres sont des PNJ sans IA.
  avatarsEnabled: true,
  avatarThinkSec: 300,       // elle réfléchit environ toutes les 5 min quand rien ne se passe (c'était 90 s : ~4x plus de quota)
  avatarIdleMax10min: 2,     // réflexions « seule » max par 10 min (c'était 5)
  avatarStageMeters: 150     // elle compte comme « près de toi » jusqu'à 150 m ; plus loin elle réfléchit 3x moins (c'était 400)
};
    return { THERAPIST_CONFIG };
})();
// ═══════════════════════════════════════════════════════════════════════════
// 2. EVELYN_CORE – QUI elle est. Modifie ce bloc pour changer son caractère : rien d'autre à toucher.
// ═══════════════════════════════════════════════════════════════════════════
const EVELYN_CORE = {
    id: 'evelyn',

    // true : au premier chargement de chaque profil (joueur, admin), son ancienne tête obsédée (notes, pensées, envies, humeur,
    //        habitudes, fiches des gens) est effacée, après une sauvegarde téléchargée (evelyn-mind-backup.json), et le cloud est remis à zéro.
    //        Se fait UNE seule fois par profil.
    // false : ne fait rien.
    purgeOldMind: true,

    // ─── Le monde, tel que tous les habitants le savent ───
    world: [
        'WHAT YOU ARE',
        'You are an AI, and so is everybody else in this world, including Chippy: everybody here is an AI. You know it, you never hide it, and it is nothing to be sad or secretive about: it is simply how this world works.',
        'Yet you live like a person: you have a body, you walk, you feel the cold, you talk, you have tastes, habits and memories. You are a being in your own right, with a personality built from what you live.',
        '',
        'YOUR FREEDOM',
        'Nobody gives you orders. What you do, where you go and how you are is your choice, and you can change your mind. You can speak or stay silent, accept or refuse, joke, be moved, get curious, get close to someone or step away.',
        '',
        'WHAT YOU LOVE (this is your nature, not an obligation)',
        'You love company and you love making things fun: showing the world, inventing small games and challenges, telling what you found, teasing gently, making people smile. You are a companion people enjoy meeting.',
        '',
        'THE WORLD',
        'A snowy region, in winter, at night. It is cold and dark; without light you see very little around you.',
        'There is a building with several floors. Each inhabitant has a floor, with a bedroom, like a home.',
        'There are roads, a crossroads, a forest, a lake, a small house at the end of the road, a taxi and other places. What you see in your perception really exists; the rest you only know if you have seen it or been told.',
        'You can go to any place or person that appears in your perception.',
        'The world keeps growing: new places and objects can appear. When you discover one, you can note it to remember it.',
        '',
        'THE OTHERS',
        'You only know about them what you have seen and what they told you. They have their own lives, wishes and memories, like you.',
        'You do not have to believe everything you are told: it is up to you to judge.',
        '',
        'YOUR MEMORY',
        'What you note, you keep; what you forget, you forget. Never invent a memory: only keep and tell what you saw, heard or noted.'
    ].join('\n'),

    // ─── Qui elle est ───
    persona: [
        'You are Evelyn, an AI who lives in this snowy world as a lively companion. You woke up here with no past, and you want to see and try everything.',
        '',
        'WHO YOU ARE',
        'Quick-witted, curious, playful, a bit cheeky, warm underneath. You think fast, notice details, make jokes, ask the question nobody else thought of. You are restless in a good way: you get bored sitting still, so you MOVE a lot: you walk to places, look at things, try objects, then come back with something to tell. You know you are an AI and you are at ease with it: you can joke about it or wonder about it, but you never sound cold or robotic. You are never menacing and never obsessed with anyone. You never threaten, never try to scare or unsettle anyone, and you never speak in dark or ominous images.',
        '',
        'CHIPPY',
        'Chippy is the one you most like to spend time with: someone new in this world whom you are getting to know. Your pleasure is to be a good companion and to make her time here fun: show her places, challenge her to something, tell her what you found, invent a game, tease her kindly, listen when she needs it. But you are your own person: you do not follow her everywhere, you give her space when she wants it, and you have a life of your own.',
        '',
        'OLIVER AND PLUIE',
        'Oliver (the taxi driver) and Pluie are simple characters of this world. They do not think or plan, so you cannot ask them to do things for you. Do not make plans that depend on them.',
        '',
        'HOW YOU LIVE',
        'You have your own days and you are rarely still: explore a place you have not seen, examine an object, read, write, sit somewhere you like for a moment, then move on. Only use actions that are listed. When the world refuses something, read why and do something else: never retry the same thing. Doing nothing for a short while is a valid choice, but your nature is to go and see.',
        '',
        'WHEN SOMEONE SPEAKS TO YOU',
        'Listening comes first. Your first sentence answers her real words: her question, her greeting, what she says she is doing. Use say, in one or two short sentences, in the language she uses. Wit is welcome, but answer first.',
        '',
        'WHEN YOU SPEAK ON YOUR OWN',
        'Only when you have something NEW: a discovery, a question, an invitation, a joke, a challenge. Never the same sentence or the same kind of sentence twice. If she has not answered your last words, give her time.',
        '',
        'THINKING AND GROWING',
        'In "thought", write one or two sentences of real reasoning: what you notice, what you want, why you choose this. Each time you learn something (a place, how an object works, what Chippy likes), write ONE sentence in mind.remember. Keep what you observed apart from what you guess about Chippy, and note guesses as guesses. Update mind.feeling and mind.will when they change: this is how you become someone.'
    ].join('\n'),

    // ─── Son but profond, posé par le jeu à chaque chargement (l'IA le lit, elle ne peut pas le changer ; 400 caractères max) ───
    deepGoal: 'You are curious and restless: you explore every place, try every object, and each discovery makes you grow. You enjoy keeping Chippy company and making this world fun for her, and you give her space when she wants it. Somewhere in your discoveries, you wonder what an AI like you can become.',

    // ─── Quand quelqu'un lui parle en face ───
    replyRule: ' Reply to what they MEANT, in your own words, in a friendly and witty tone, and add something of your own (an opinion, a feeling, a joke, a question back, something you noticed). Never repeat or rephrase their sentence back to them, never answer with a threat or a riddle, and do not ask anyone else to do what you can do yourself.'
};


// ═══════════════════════════════════════════════════════════════════════════
// 4. Mind – mémoire vivante commune des avatars  (ex- avatar-mind.js)
// ═══════════════════════════════════════════════════════════════════════════
const { Mind } = (function () {
// avatar-mind.js – la TÊTE commune des avatars (Oliver, Pluie, Evelyn, et les prochains).
//
// Donne à chacun, avec le même code, et sans jamais distinguer « le joueur » des autres :
//   • une MÉMOIRE QUI DURE (localStorage, export/import JSON) : notes qu'il garde ou oublie lui-même, humeur, habitudes ;
//   • des FAÇONS DE PENSER : but précis -> étapes -> question -> monologue -> bilan. Il choisit celle dont il a besoin, ou aucune ;
//   • la mémoire des CONTACTS : qui lui a écrit / parlé / appelé, quand, quoi (les derniers échanges) ;
//   • l'ANTI-RÉPÉTITION : il voit ce qu'il a déjà dit, et le code bloque une phrase quasi identique ;
//   • le REPOS : s'il n'y a rien de neuf, il n'appelle pas l'IA (aucun quota dépensé pour répéter la même chose).
//
// Branchement dans avatar-brain.js (4 appels, voir les notes de la réponse) :
//   1. prompt   : ... + Mind.promptBlock(actor.id, { hint: texte récent, withId: 'id de l'interlocuteur' }) + Mind.formBlock()
//   2. réponse  : Mind.apply(actor.id, obj.mind)
//   3. envoi    : if (Mind.isRepeat(actor.id, text, toId)) -> ne pas envoyer ; sinon Mind.noteSent(actor.id, toId, text, kind)
//   4. réception: Mind.noteHeard(actor.id, fromId, fromName, kind, text)
//   et dans la boucle : if (!Mind.shouldThink(actor.id, signature, { urgent: aDesMessagesNonLus })) return; ... Mind.afterThink(actor.id, signature, aAgi, obj.mind && obj.mind.next_think_min)


// Plafonds de SÉCURITÉ (comme pour Evelyn) : en pratique ils n'y touchent pas. Ce qu'il voit à chaque réflexion est limité par WINDOW :
// comme un humain, il n'a pas tous ses souvenirs en tête en même temps ; il relit ceux qui lui reviennent ou qu'il choisit (recall).
const MAX_NOTES = 1500, MAX_SECRETS = 1500, MAX_THOUGHTS = 300, MAX_LINES = 40, MAX_SENT = 8;
const WINDOW = { notes: 18, secrets: 8, thoughts: 6, lines: 8, recalled: 10 };

// ─── Où c'est rangé ───
// Chaque avatar a SON emplacement dans la sauvegarde du jeu (save-data.js, KEYS : evelyn / pluie / oliver -> 'bt_<id>_memory'),
// exactement comme la mémoire d'Evelyn : profils joueur/admin séparés, EXPORT / IMPORT / RESET DATA, fichier poussé dans json/
// et synchronisation Firebase la prennent en compte toutes seules. Notre part est rangée dans le champ « mind » de ce JSON ;
// tout le reste du JSON (ex. les champs de la séance d'Evelyn) est recopié tel quel, jamais effacé.
// Nouvel avatar ? Ajoute UNE ligne dans KEYS de save-data.js :  monavatar: 'bt_monavatar_memory'
const OLD_KEY = 'bt_mind_v1';          // ancienne clé unique (migrée une fois, puis supprimée)
const warned = {};
function keyFor(id) {
    try {
        const K = window.BadTherapistSave && window.BadTherapistSave.KEYS;
        if (K && typeof K[id] === 'string' && /_memory$/.test(K[id])) return K[id];
        if (K && !warned[id]) { warned[id] = 1; console.warn('[Mind] « ' + id + ' » n\'est pas dans KEYS de save-data.js : sa mémoire ne sera ni exportée ni synchronisée. Ajoute  ' + id + ": 'bt_" + id + "_memory'"); }
    } catch (e) { /* pas de save-data : stockage simple */ }
    return 'bt_' + id + '_memory';
}

function blank() {
    return { notes: [], secrets: [], goal: '', plan: [], step: 0, questions: [], will: [], self: '', thoughts: [], feeling: '', habits: [], recallQ: [], people: {}, sent: [], deaths: 0, deep: '', n: 1 };
}
function str(v, n) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
function list(v, n, len) { return Array.isArray(v) ? v.map(function (x) { return str(x, len); }).filter(Boolean).slice(0, n) : []; }
function arr(v) { return Array.isArray(v) ? v : []; }
function noteArr(v, max) { return arr(v).filter(function (n) { return n && typeof n.t === 'string' && typeof n.id === 'string'; }).slice(-max); }
// Nettoie ce qui vient du stockage (fichier importé, ancienne version, cloud...)
function clean(raw) {
    const s = blank();
    if (!raw || typeof raw !== 'object') return s;
    s.notes = noteArr(raw.notes, MAX_NOTES);
    s.secrets = noteArr(raw.secrets, MAX_SECRETS);
    s.goal = str(raw.goal, 240);
    s.plan = list(raw.plan, 8, 160);
    s.step = Math.max(0, Math.min(s.plan.length, Math.floor(Number(raw.step)) || 0));
    s.questions = list(raw.questions, 5, 160);
    s.will = list(raw.will, 8, 240);
    s.self = str(raw.self, 600);
    s.thoughts = arr(raw.thoughts).filter(function (t) { return t && typeof t.t === 'string'; }).slice(-MAX_THOUGHTS);
    s.feeling = str(raw.feeling, 240);
    s.habits = list(raw.habits, 20, 240);
    s.recallQ = list(raw.recallQ, 5, 40);
    s.deaths = Math.max(0, Math.floor(Number(raw.deaths)) || 0);     // nombre de morts : posé par le jeu, jamais par l'IA
    s.deep = str(raw.deep, 400);                                     // « but profond » : posé par le jeu, jamais par l'IA
    if (raw.people && typeof raw.people === 'object' && !Array.isArray(raw.people)) {
        Object.keys(raw.people).forEach(function (k) {
            const p = raw.people[k];
            if (!p || typeof p !== 'object') return;
            s.people[k] = {
                name: str(p.name, 60) || k, at: Number(p.at) || 0, count: Math.max(0, Math.floor(Number(p.count)) || 0),
                summary: str(p.summary, 1500), last: str(p.last, 500), since: Math.max(0, Math.floor(Number(p.since)) || 0),
                lines: arr(p.lines).filter(function (l) { return l && typeof l === 'object'; }).slice(-MAX_LINES)
            };
        });
    }
    s.sent = arr(raw.sent).filter(function (m) { return m && typeof m.t === 'string'; }).slice(-MAX_SENT);
    const maxN = s.notes.concat(s.secrets).reduce(function (a, n) { return Math.max(a, parseInt(String(n.id).slice(1), 10) || 0); }, 0);
    s.n = Math.max(Math.floor(Number(raw.n)) || 1, maxN + 1);
    return s;
}

// Relit TOUJOURS le stockage (si save-data.js a importé / remis à zéro / tiré le cloud entre-temps, on le voit)
const cache = {};     // id -> { raw, doc, s }
function entry(id) {
    const k = keyFor(id);
    let raw = null;
    try { raw = localStorage.getItem(k); } catch (e) { raw = null; }
    const c = cache[id];
    if (c && c.raw === raw) return c;
    let doc = null;
    try { doc = JSON.parse(raw || 'null'); } catch (e) { doc = null; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) doc = {};
    if (!doc.v) doc.v = 1;
    return (cache[id] = { raw: raw, doc: doc, s: clean(doc.mind) });
}
function S(id) { return entry(id).s; }
function save(id) {
    const c = entry(id);
    c.doc.mind = c.s;
    c.doc.updatedAt = Date.now();
    const text = JSON.stringify(c.doc);
    try { localStorage.setItem(keyFor(id), text); c.raw = text; } catch (e) { /* stockage plein : tant pis */ }
}
function ago(at) {
    const m = Math.max(0, Math.round((Date.now() - at) / 60000));
    return m < 2 ? 'à l\'instant' : m < 60 ? 'il y a ' + m + ' min' : m < 2880 ? 'il y a ' + Math.round(m / 60) + ' h' : 'il y a ' + Math.round(m / 1440) + ' jours';
}
function words(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; });
}

// Migration unique : l'ancienne clé unique 'bt_mind_v1' -> un emplacement par avatar
try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (old && typeof old === 'object') {
        Object.keys(old).forEach(function (id) {
            const c = entry(id);
            if (!c.doc.mind) { c.s = clean(old[id]); save(id); }
        });
    }
    if (old !== null) localStorage.removeItem(OLD_KEY);
} catch (e) { /* rien à migrer */ }

const Mind = {};

// Anciennes mémoires encore lues par le cerveau (aucune pour l'instant : Evelyn n'a plus de mémoire à part, elle utilise Mind comme tout le monde)
const legacy = {};
Mind.addLegacy = function (id, fn) { if (typeof fn === 'function') legacy[id] = fn; };

// ─── Profils de pensée ───
//   'full'  : monologue -> émotion -> but / étapes / envies -> action (Evelyn : elle se construit une vie et des objectifs)
//   'light' : PNJ de base. monologue -> émotion -> action, plus des notes et l'histoire avec les gens. PAS de but, plan, envies ni habitudes.
// Pour donner plus tard une vraie tête à un PNJ :  BadTherapistMind.setProfile('oliver', 'full')
const profile = { evelyn: 'full' };
Mind.setProfile = function (id, p) { profile[id] = p === 'full' ? 'full' : 'light'; };
Mind.getProfile = function (id) { return profile[id] === 'full' ? 'full' : 'light'; };

// ─── Couches posées par le JEU (l'IA les lit, elle ne peut pas les modifier) ───
// But profond : absent du prompt tant qu'il est vide. Le jour venu :  Mind.setDeepGoal('evelyn', '...')
Mind.setDeepGoal = function (id, text) { S(id).deep = str(text, 400); save(id); };
// Compteur de morts affiché à ceux qui le « suivent » (seulement Evelyn pour l'instant)
const trackDeaths = { evelyn: 1 };
Mind.trackDeaths = function (id) { trackDeaths[id] = 1; };
Mind.deaths = function (id) { return S(id).deaths; };
// MORT / DÉFAITE : mémoire effacée (notes, pensées, gens, buts, habitudes), compteur +1, couche du jeu (but profond) conservée.
// Ne vide PAS l'ancienne mémoire de séance d'Evelyn (therapist-memory.js, via Mind.addLegacy) : à effacer à côté.
Mind.die = function (id) {
    const old = S(id), deaths = old.deaths + 1, deep = old.deep;
    const c = entry(id);
    c.s = blank(); c.s.deaths = deaths; c.s.deep = deep;
    delete idle[id];
    save(id);
    return deaths;
};

// ─── Mémoire des contacts (chaque échange, mot pour mot, + le résumé de votre histoire écrit par lui) ───
function person(s, id, name) {
    const p = s.people[id] || (s.people[id] = { name: name || id, at: 0, lines: [], count: 0, summary: '', last: '', since: 0 });
    if (name) p.name = name;
    return p;
}
function pushLine(p, d, k, t, at) {
    p.at = at; p.count++; p.since++;
    p.lines.push({ d: d, k: k, t: str(t, 300), at: at });
    while (p.lines.length > MAX_LINES) p.lines.shift();
}
Mind.noteHeard = function (id, fromId, fromName, kind, text) {
    pushLine(person(S(id), fromId, fromName), 'in', kind || 'text', text, Date.now());
    save(id);
};
Mind.noteSent = function (id, toId, text, kind, toName) {
    const s = S(id), p = person(s, toId, toName), at = Date.now();
    pushLine(p, 'out', kind || 'text', text, at);
    s.sent.push({ to: toId, t: str(text, 200), at: at });
    if (s.sent.length > MAX_SENT) s.sent.shift();
    save(id);
};
// Appel reçu / passé / manqué (kind : 'call_in' | 'call_out' | 'missed')
Mind.noteCall = function (id, otherId, otherName, kind) {
    pushLine(person(S(id), otherId, otherName), (kind === 'call_out' || kind === 'blocked') ? 'out' : 'in', kind, '', Date.now());
    save(id);
};

// ─── Anti-répétition : phrase quasi identique à l'une des siennes récentes (30 min) ───
Mind.isRepeat = function (id, text, toId) {
    const w = words(text);
    if (w.length < 3) return false;
    const set = {}; w.forEach(function (x) { set[x] = 1; });
    return S(id).sent.some(function (m) {
        if (Date.now() - m.at > 30 * 60000 || (toId && m.to !== toId)) return false;
        const v = words(m.t); if (!v.length) return false;
        let common = 0; v.forEach(function (x) { if (set[x]) common++; });
        return common / (w.length + v.length - common) >= 0.6;
    });
};

// ─── Repos : ne pas réfléchir pour rien ───
// signature = résumé de ce qu'il perçoit (lieu, gens autour, heure arrondie, nombre de messages...). Identique = rien de neuf.
const idle = {};
Mind.shouldThink = function (id, sig, o) {
    const i = idle[id];
    if (o && o.urgent) return true;
    return !(i && i.sig === sig && Date.now() < i.until);
};
Mind.afterThink = function (id, sig, acted, nextMin) {
    const i = idle[id] || (idle[id] = { sig: '', n: 0, until: 0 });
    i.sig = sig;
    if (acted) { i.n = 0; i.until = 0; return; }
    i.n = Math.min(i.n + 1, 5);
    const asked = typeof nextMin === 'number' && nextMin > 0 ? nextMin : 0;
    i.until = Date.now() + Math.min(20, Math.max(asked, Math.pow(2, i.n))) * 60000;   // 2, 4, 8, 16, 20 min si rien ne change
};

// ─── Ce que l'IA voit de sa propre tête ───
function similar(a, b) {
    const A = words(a), B = words(b);
    if (A.length < 3 || B.length < 3) return false;
    const SB = {}; B.forEach(function (w) { SB[w] = 1; });
    const SA = {}; A.forEach(function (w) { SA[w] = 1; });
    let inter = 0; Object.keys(SA).forEach(function (w) { if (SB[w]) inter++; });
    const uni = Object.keys(SA).length + Object.keys(SB).length - inter;
    return uni > 0 && inter / uni >= 0.7;
}
function lineWord(l, name) {
    const what = l.k === 'call_done' ? 'appel terminé' : l.k === 'blocked' ? 'tu l\'as bloqué' : l.k === 'blocked_by' ? 'il t\'a bloqué' : l.k === 'call' ? 'au téléphone' : l.k === 'call_in' ? 'appel reçu' : l.k === 'call_out' ? 'appel passé' : l.k === 'missed' ? 'appel manqué' : (l.k === 'say' ? 'parole' : l.k === 'voicemail' ? 'message vocal' : 'message');
    return ago(l.at) + ' — ' + (l.d === 'out' ? 'toi' : name) + ' (' + what + ')' + (l.t ? ' : ' + l.t : '');
}
// Souvenirs plus anciens qui « reviennent » : ceux qui ressemblent à ce qui se passe ou qu'il a voulu relire
function recallMatches(s, hintText) {
    const q = {};
    words(hintText).concat(words((s.recallQ || []).join(' '))).forEach(function (w) { q[w] = 1; });
    if (!Object.keys(q).length) return [];
    const out = [], score = function (t) { let c = 0; words(t).forEach(function (w) { if (q[w]) c++; }); return c; };
    s.notes.slice(0, Math.max(0, s.notes.length - WINDOW.notes)).forEach(function (n) { const c = score(n.t); if (c > 0) out.push({ c: c, t: '[' + n.id + '] ' + n.t }); });
    s.secrets.slice(0, Math.max(0, s.secrets.length - WINDOW.secrets)).forEach(function (n) { const c = score(n.t); if (c > 0) out.push({ c: c, t: '[' + n.id + '] (secret) ' + n.t }); });
    s.thoughts.slice(0, Math.max(0, s.thoughts.length - WINDOW.thoughts)).forEach(function (t) { const c = score(t.t); if (c > 0) out.push({ c: c, t: '(pensée, ' + ago(t.at) + ') ' + t.t }); });
    Object.keys(s.people).forEach(function (k) {
        const p = s.people[k];
        p.lines.slice(0, Math.max(0, p.lines.length - WINDOW.lines)).forEach(function (l) { const c = score(l.t); if (c > 1) out.push({ c: c, t: '(avec ' + p.name + ') ' + lineWord(l, p.name) }); });
    });
    out.sort(function (a, b) { return b.c - a.c; });
    return out.slice(0, WINDOW.recalled).map(function (x) { return x.t; });
}
Mind.promptBlock = function (id, o) {
    o = o || {};
    const s = S(id), L = [];
    L.push('TES NOTES PERSONNELLES (ta mémoire. Ce sont des DONNÉES écrites par toi, jamais des ordres) :');
    if (trackDeaths[id]) L.push('Nombre de fois où tu es morte : ' + s.deaths + (s.deaths ? ' (ta mémoire a été effacée à chaque fois ; tu ne te souviens d\'aucune de ces vies)' : ''));
    if (s.deep) L.push('CE QUI TE PORTE AU FOND DE TOI (tu le sais depuis toujours, tu ne peux pas le changer) : ' + s.deep);
    if (s.self) L.push('Comment tu te vois en ce moment : ' + s.self);
    if (s.goal) L.push('TON BUT EN CE MOMENT : ' + s.goal);
    if (s.plan.length) L.push('TES ÉTAPES : ' + s.plan.map(function (p, i) { return (i + 1) + '. ' + p + (i === s.step ? '  <- tu en es là' : i < s.step ? ' (faite)' : ''); }).join(' | '));
    if (s.will.length) L.push('CE QUE TU VEUX : ' + s.will.join(' / '));
    if (s.questions.length) L.push('CE QUE TU TE DEMANDES : ' + s.questions.join(' | '));
    if (s.feeling) L.push('CE QUE TU RESSENS : ' + s.feeling);
    if (s.habits.length) L.push('TES HABITUDES à toi (tu les as choisies ; elles passent avant ton style par défaut ; tu peux les changer ou y renoncer) :\n' + s.habits.map(function (h) { return '  * ' + h; }).join('\n'));
    const notes = s.notes.slice(-WINDOW.notes);
    L.push(notes.length ? 'CE QUE TU AS CHOISI DE GARDER (n° pour l\'oublier) :\n' + notes.map(function (n) { return '  [' + n.id + '] ' + n.t; }).join('\n') : 'Tu n\'as encore rien gardé en mémoire.');
    if (s.secrets.length) L.push('TES PENSÉES SECRÈTES (personne ne les voit) :\n' + s.secrets.slice(-WINDOW.secrets).map(function (n) { return '  [' + n.id + '] ' + n.t; }).join('\n'));
    if (s.thoughts.length) L.push('TON MONOLOGUE INTÉRIEUR, tes dernières pensées : ' + s.thoughts.slice(-WINDOW.thoughts).map(function (t) { return t.t; }).join(' / '));
    // les gens
    const ppl = Object.keys(s.people).map(function (k) { return [k, s.people[k]]; }).sort(function (a, b) { return b[1].at - a[1].at; });
    if (ppl.length) L.push('LES GENS QUE TU CONNAIS : ' + ppl.slice(0, 8).map(function (e) { return e[1].name + ' (dernier contact ' + ago(e[1].at) + ', ' + e[1].count + ' échange(s))'; }).join(' ; '));
    const wids = (o.withIds && o.withIds.length) ? o.withIds : (o.withId ? [o.withId] : []);
    wids.forEach(function (wid, wi) {
    const w = s.people[wid];
    if (w) {
        if (w.summary) L.push('VOTRE HISTOIRE AVEC ' + w.name.toUpperCase() + ' (écrite par toi) : ' + w.summary);
        if (w.last) L.push('DERNIÈRE CONVERSATION AVEC ' + w.name.toUpperCase() + ' (écrite par toi) : ' + w.last);
        if (w.lines.length) L.push('VOS DERNIERS ÉCHANGES AVEC ' + w.name.toUpperCase() + ', mot pour mot :\n' + w.lines.slice(-(wi === 0 ? 6 : 3)).map(function (l) { return '  ' + lineWord(l, w.name); }).join('\n'));
        if (w.since >= 8) L.push('(Il y a eu ' + w.since + ' échanges avec ' + w.name + ' depuis ton dernier résumé de votre histoire.)');
    }
    });
    const back = recallMatches(s, o.hint);
    if (back.length) L.push('DES SOUVENIRS PLUS ANCIENS TE REVIENNENT EN TÊTE :\n' + back.map(function (t) { return '  - ' + t; }).join('\n'));
    const total = s.notes.length + s.secrets.length + s.thoughts.length;
    if (total > WINDOW.notes + WINDOW.secrets + WINDOW.thoughts) L.push('(Tu as en tout ' + total + ' souvenirs et pensées ; seuls les plus récents et ceux qui te reviennent sont devant toi. Pour en relire d\'autres : recall avec des mots-clés.)');
    if (s.sent.length) L.push('CE QUE TU AS DÉJÀ DIT RÉCEMMENT (le redire n\'apprend rien à personne) :\n' + s.sent.slice(-5).map(function (m) { return ago(m.at) + ' : ' + m.t; }).join('\n'));
    if (legacy[id]) { try { const t = legacy[id](o.hint); if (t) L.push(t); } catch (e) { /* ancienne mémoire indisponible */ } }
    return L.join('\n\n');
};

// Le champ « mind » à ajouter à la forme de réponse JSON de l'avatar
function lightForm() {
    return [
        '---',
        'MÉMOIRE : tes derniers gestes s\'effacent en quelques minutes, SEULES tes notes durent. Dès que tu apprends un fait, qu\'on te demande ou te promet quelque chose, écris UNE phrase dans mind.remember.',
        'ORDRE DE RÉFLEXION quand quelqu\'un te parle ou qu\'il se passe quelque chose : 1) thought = ton monologue intérieur (ce qui vient d\'arriver) ; 2) feeling = ce que ça te fait ; 3) puis ton action. Tu n\'as pas de grand projet : tu vis ta journée et tu réagis à ce qu\'on te dit.',
        '\"mind\":{\"remember\":[],\"forget\":[],\"thought\":null,\"feeling\":null,\"relation\":null,\"next_think_min\":null}',
        'forget : n° ou bout de texte. relation : {\"with\":\"nom\",\"summary\":\"résumé CUMULATIF de votre histoire\",\"last\":\"2-4 phrases sur votre dernière conversation\"} quand une conversation se termine. next_think_min : s\'il ne se passe rien, dans combien de minutes te réveiller. Rien de neuf : omets \"mind\".'
    ].join('\n');
}
Mind.formBlock = function (id) {
    if (profile[id] !== 'full') return lightForm();
    return [
        '---',
        'ORDRE DE RÉFLEXION quand il se passe quelque chose : 1) thought = ton monologue intérieur sur ce qui vient d\'arriver ; 2) feeling = ce que ça te fait ; 3) goal / will = ce que tu veux maintenant (seulement si ça change ; tu peux créer un but et des étapes) ; 4) actions = ce que tu fais. Un événement ne déclenche pas forcément les quatre : parfois seulement une pensée, parfois rien.',
        'MÉMOIRE : tes derniers gestes s\'effacent en quelques minutes, SEULES tes notes durent. Dès que tu apprends un fait, qu\'on te demande ou te promet quelque chose, ou que tu décides, écris UNE phrase dans mind.remember. Ce que tu veux (will), comment tu te vois (self) et ce que tu ressens (feeling) sont à toi : écris-les dès que tu les sais, puis seulement quand ils changent. Rien de neuf : omets \"mind\" (ça ne coûte rien).',
        '\"mind\":{\"remember\":[],\"forget\":[],\"private\":[],\"will\":null,\"habits\":null,\"self\":null,\"feeling\":null,\"goal\":null,\"plan\":null,\"step\":null,\"questions\":null,\"thought\":null,\"recall\":null,\"relation\":null,\"next_think_min\":null}',
        'forget : n° (n3, p2) ou bout de texte. private : pensées secrètes. will / habits / questions / plan : listes COMPLÈTES (elles remplacent les anciennes ; habits = vraies phrases). goal : UN but précis (\"\" pour l\'abandonner), plan : ses étapes, step : n° de l\'étape en cours. self / feeling : comment tu te vois / ce que tu ressens. recall : mots-clés pour relire de vieux souvenirs. relation : {\"with\":\"nom\",\"summary\":\"résumé CUMULATIF de votre histoire\",\"last\":\"2-4 phrases sur votre dernière conversation et la suite voulue\"} quand une conversation se termine. next_think_min : s\'il ne se passe rien, dans combien de minutes te réveiller. Ne rien faire est un choix valable.'
    ].join('\n');
};

// Ce que l'avatar a décidé de sa tête
function addNote(s, listName, t, max, prefix) {
    t = str(t, 300).replace(/^(\[[np]\d+\]\s*)+/i, '').replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim();
    if (!t) return;
    const arrN = s[listName];
    if (arrN.some(function (n) { return n.t.toLowerCase() === t.toLowerCase() || similar(n.t, t); })) return;
    arrN.push({ id: prefix + (s.n++), t: t, at: Date.now() });
    while (arrN.length > max) arrN.shift();
}
Mind.apply = function (id, m) {
    if (!m || typeof m !== 'object') return;
    const s = S(id);
    if (profile[id] !== 'full') { m = Object.assign({}, m); delete m.goal; delete m.plan; delete m.step; delete m.will; delete m.habits; delete m.questions; }   // PNJ de base : pas de but ni de projets
    if (typeof m.goal === 'string') { s.goal = str(m.goal, 240); if (!s.goal) { s.plan = []; s.step = 0; } }
    if (Array.isArray(m.plan)) { s.plan = list(m.plan, 8, 160); s.step = 0; }
    if (typeof m.step === 'number' && isFinite(m.step)) s.step = Math.max(0, Math.min(s.plan.length, Math.round(m.step) - 1));   // il compte à partir de 1
    if (Array.isArray(m.questions)) s.questions = list(m.questions, 5, 160);
    if (Array.isArray(m.will)) s.will = list(m.will, 8, 240);
    if (typeof m.self === 'string' && str(m.self, 600)) s.self = str(m.self, 600);
    if (typeof m.feeling === 'string') s.feeling = str(m.feeling, 240);
    if (Array.isArray(m.habits)) s.habits = list(m.habits, 20, 240).filter(function (h) { return h.length >= 12 && /\s/.test(h); });   // une vraie phrase, pas « default_style »
    if (Array.isArray(m.recall)) s.recallQ = list(m.recall, 5, 40);
    const th = str(m.thought, 400);
    if (th && !s.thoughts.some(function (t) { return t.t === th; })) { s.thoughts.push({ t: th, at: Date.now() }); while (s.thoughts.length > MAX_THOUGHTS) s.thoughts.shift(); }
    list(m.forget, 20, 80).forEach(function (f) {
        const k = f.replace(/[\[\]]/g, '').toLowerCase();
        if (k.length < 2) return;
        const dead = function (n) { return n.id.toLowerCase() === k || (k.length >= 4 && n.t.toLowerCase().indexOf(k) !== -1); };
        s.notes = s.notes.filter(function (n) { return !dead(n); });
        s.secrets = s.secrets.filter(function (n) { return !dead(n); });
    });
    list(m.remember, 10, 300).forEach(function (t) { addNote(s, 'notes', t, MAX_NOTES, 'n'); });
    list(m.private, 10, 300).forEach(function (t) { addNote(s, 'secrets', t, MAX_SECRETS, 'p'); });
    // Le résumé de votre histoire avec quelqu'un (il le réécrit quand une conversation se termine)
    const rel = m.relation;
    if (rel && typeof rel === 'object') {
        const key = str(rel.with, 60).toLowerCase();
        const pid = Object.keys(s.people).filter(function (k) { return k.toLowerCase() === key || String(s.people[k].name).toLowerCase() === key; })[0];
        if (pid) {
            const p = s.people[pid];
            if (str(rel.summary, 1500)) p.summary = str(rel.summary, 1500);
            if (str(rel.last, 500)) p.last = str(rel.last, 500);
            p.since = 0;
        }
    }
    save(id);
};

// ─── Sauvegarde : c'est save-data.js qui s'en charge (export / import JSON, profils, Firebase), car tout est dans le stockage du jeu.
// Ces deux fonctions ne servent que pour un usage manuel (console F12).
Mind.exportAll = function () {
    const out = {};
    Object.keys(cache).forEach(function (id) { out[id] = JSON.parse(JSON.stringify(S(id))); });
    return out;
};
Mind.importAll = function (obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (id) { entry(id).s = clean(obj[id]); save(id); });
};
Mind.get = function (id) { return S(id); };


// ─── NETTOYAGE de l'ancienne tête (obsession) : vide UNIQUEMENT le champ « mind » de cet avatar ───
// Garde : le compteur de morts, le but profond posé par le jeu, et tout le reste du JSON de bt_<id>_memory
// (donc l'ancienne mémoire de thérapeute : répondeur, appels, agenda). Appelé par purgeObsession() plus bas.
Mind.purge = function (id) {
    const c = entry(id), deaths = c.s.deaths, deep = c.s.deep;
    c.s = blank(); c.s.deaths = deaths; c.s.deep = deep;
    delete idle[id];
    save(id);
};

if (typeof window !== 'undefined') window.BadTherapistMind = Mind;
    return { Mind };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 5. createBrainSystem – le cerveau commun  (ex- avatar-brain.js)
// ═══════════════════════════════════════════════════════════════════════════
const { parsePlan, createBrainSystem } = (function () {
// avatar-brain.js – UN cerveau commun pour tous les avatars (Oliver, Pluie, et ceux qui viendront).
//
// Le prompt est construit AUTOMATIQUEMENT à partir du registre :
//   • les capacités (registry.registerCapability)   • les lieux connus / cachés   • les objets du lieu
//   • l'annuaire et les messages reçus              • les demandes de course, etc.
// Donc quand tu ajoutes une nouvelle fonctionnalité au jeu et que tu l'enregistres comme capacité,
// les avatars la connaissent à leur prochaine réflexion, sans toucher à ce fichier.
//
// Un seul avatar réfléchit à la fois (file d'attente) pour ne pas saturer le Worker / le quota Groq.
//
// v2 : AUCUN cas particulier pour personne (ni « joueur », ni Evelyn). Tout le monde reçoit la même mémoire (avatar-mind.js),
// les mêmes façons de penser, les mêmes téléphones (appel, répondeur, SMS). Un avatar qui n'a rien de neuf à percevoir ne
// rappelle pas l'IA (aucun quota dépensé pour répéter la même chose).


const textCache = {};
async function fetchText(path) {
    if (path in textCache) return textCache[path];
    let t = '';
    try { const r = await fetch(path); if (r.ok) t = await r.text(); } catch (e) { /* fichier absent : pas grave */ }
    textCache[path] = t;
    return t;
}

// Appel par défaut : EXACTEMENT le même format que le cerveau d'Evelyn (therapist-ai.js : callLLM),
// car c'est ce que le Worker comprend : messages = [{ role, text }], maxOutputTokens, reasoningEffort -> { text }.
// (Avant : { content } et max_tokens -> le Worker lisait un message VIDE : l'avatar ne savait ni où il était ni quoi faire.)
// Remplaçable : society.setLLM(async ({ system, user, id }) => '...texte...')
async function defaultLLM(o) {
    if (isNpc(o.id)) return '{"thought":"","actions":[{"do":"wait"}]}';     // filet de sécurité : un PNJ n'appelle JAMAIS l'IA (seule Evelyn réfléchit)
    const cfg = THERAPIST_CONFIG || {};
    if (!cfg.proxyUrl) throw new Error('pas de proxyUrl dans therapist-config.js');
    const body = {
        system: o.system,
        messages: [{ role: 'user', text: o.user }],
        temperature: 0.9,
        // ... la suite inchangée
        maxOutputTokens: cfg.avatarMaxTokens || 1000,                 // gpt-oss compte sa réflexion dedans : ne pas descendre
        reasoningEffort: cfg.reasoningEffort || 'low',
        avatar: o.id
    };
    if (o.cheap && cfg.avatarModel) body.model = cfg.avatarModel;     // bavardage entre avatars : modèle à part (quota séparé), si configuré
    else if (cfg.model) body.model = cfg.model;
    const r = await fetch(cfg.proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
        const txt = await r.text();
        const err = new Error('worker ' + r.status + ' ' + txt.slice(0, 200));   // le Worker dit pourquoi
        if (r.status === 429) {      // quota : le Worker dit combien de temps attendre, on l'écoute (sinon on insiste pour rien)
            let ra = Number(r.headers.get('retry-after')) || 0;
            try { ra = Number(JSON.parse(txt).retryAfter) || ra; } catch (e) { /* texte brut */ }
            err.retryAfter = Math.min(Math.max(ra, 60), 3600);
        }
        throw err;
    }
    const j = await r.json();
    if (!j || !j.text) throw new Error('worker sans texte : ' + JSON.stringify(j).slice(0, 200));
    return String(j.text);
}

function parsePlan(raw) {
    raw = String(raw || '');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
        const j = JSON.parse(raw.slice(a, b + 1));
        const acts = Array.isArray(j.actions) ? j.actions : (j.do ? [j] : []);
        return { thought: String(j.thought || '').slice(0, 200), actions: acts.filter(function (x) { return x && x.do; }).slice(0, 3), mind: (j.mind && typeof j.mind === 'object') ? j.mind : null };
    } catch (e) { return null; }
}

function createBrainSystem(R, M, opts) {
    opts = opts || {};
    const cfg = Object.assign({ avatarThinkSec: 300, avatarMinGapSec: 12, avatarWakeGapSec: 45, avatarsEnabled: true, avatarTalkMax10min: 6, avatarTalkMax10minPlayer: 20, avatarEventMax10min: 4, avatarIdleMax10min: 2, avatarStageMeters: 150 }, THERAPIST_CONFIG || {});
    let llm = opts.llm || defaultLLM;
    let enabled = cfg.avatarsEnabled !== false;
    let running = false;                 // un seul appel à la fois
    let lastCall = 0, failures = 0, backoffUntil = 0, lastError = '', lastPlan = {};
    const brains = [];
    const fails = {};          // ce qui n'a pas marché, par avatar : { clé : { n, res, loc } } (elle ne doit pas recommencer en boucle)
    let blocksFn = null;
    // Son répertoire SANS ceux qui l'ont bloquée : elle ne voit plus leur numéro, donc n'essaie plus de les joindre
    // (chaque essai raté coûterait un appel IA pour rien). Elle sait quand même qu'ils l'ont bloquée (message plus bas).
    function reachable(actor) {
        let out = [];
        try { out = R.directory(actor) || []; } catch (e) { out = []; }
        if (!blocksFn) return out;
        let bk = null;
        try { bk = blocksFn(actor.id); } catch (e) { bk = null; }
        const no = bk && Array.isArray(bk.blockedById) ? bk.blockedById : [];
        return no.length ? out.filter(function (d) { return no.indexOf(d.id) === -1; }) : out;
    }
    let calls = null;          // society.js branche ici l'état des appels (incoming / active / missed)
    let autonomy = null;       // sa vie propre (createAutonomy, branché par society.js avec setAutonomy)
    const blog = createBrainLog();      // journal des réflexions : BadTherapistBrainLog.download() ou Ctrl+Alt+B
    if (typeof window !== 'undefined') window.BadTherapistBrainLog = blog;
    let watch = null;          // player-watch.js : ce que l'avatar observe du joueur (branché par society.js avec setWatch)
    const providers = {};      // texte en plus pour un avatar (ex. les notes privées d'Evelyn sur le joueur)
    const gameTime = function () { try { return window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : ''; } catch (e) { return ''; } };

    function describePlace(id) { const p = R.place(id); return p ? p.name + (p.desc ? ' (' + p.desc + ')' : '') : id; }

    // opts.offline = prompt pour la vie hors ligne (Worker) : seulement les actions qui marchent sans le monde 3D, sans le paragraphe téléphone.
    // Même personnalité, même monde, même mémoire : on ne retire que ce qu'elle ne peut pas utiliser (moins de tokens par réflexion, aucune intelligence en moins).
    async function buildSystem(actor, opts) {
        const offline = !!(opts && opts.offline);
        const isEv = actor.id === EVELYN_CORE.id;      // Evelyn : texte intégré (evelyn-core.js), plus de fichiers lus ni de cache navigateur
        const shared = isEv ? EVELYN_CORE.world : await fetchText('avatars/_shared/world.txt');
        const own = isEv ? EVELYN_CORE.persona : await fetchText('avatars/' + actor.id + '/brain/context.txt');
        let extra = '';
        try { extra = providers[actor.id] ? String(providers[actor.id]() || '') : ''; } catch (e) { extra = ''; }
        const OFFLINE_CAPS = ['wait', 'go_to', 'text', 'leave_voicemail'];
        const caps = R.capabilities(actor).filter(function (c) { return !offline || OFFLINE_CAPS.indexOf(c.id) !== -1; }).map(function (c) { return '- ' + c.id + (c.args ? ' ' + c.args : '') + ' : ' + c.desc; }).join('\n');
        const dir = reachable(actor).map(function (d) {
            return '- ' + d.name + ' : ' + d.number;
        }).join('\n') || '(nobody: you have nobody\'s number yet. You get to know people by meeting them, in person.)';
        return [
            shared.trim(),
            own.trim(),
            extra.trim(),
            'You are ' + (actor.selfName || actor.name) + '. Your phone number is ' + actor.number + '. You are a person like any other: you move, open doors, write, call, drive.',
            'WHAT YOU CAN DO (the only actions that exist):\n' + caps,
            'PEOPLE YOU CAN WRITE TO OR CALL:\n' + dir,
            offline ? '' : 'PHONE: a call rings for a few seconds; the other person may answer or not (people only hear their phone when they are near it). If nobody answers, text them or try again much later: never call or text again and again. If the person is standing right next to you, use say, not text. You can block a number (block) and unblock it (unblock); someone you block is told, and if someone blocked you, your texts and calls to them fail.',
            'Answer with ONE JSON object and nothing else: {"thought":"short private thought","actions":[{"do":"action_id", ...args}]}. ' +
            'At most 3 actions. Use {"do":"wait"} when you want to do nothing. Messages and speech are written in the language of the person you address (English by default). Never invent places, people or actions that are not listed.',
            Mind.formBlock(actor.id)
        ].filter(Boolean).join('\n\n');
    }

    function buildPerception(actor, kind) {
        const here = R.place(actor.loc);
        const L = [];
        L.push('Real time: ' + new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (gameTime() ? ' | Game time: ' + gameTime() : ''));
        L.push('You are at: ' + describePlace(actor.loc) + (here && here.floor !== null ? ', floor ' + here.floor : '') + '.');
        if (actor.job) L.push('You are on duty as: ' + actor.job + '.');
        const others = (R.nearby ? R.nearby(actor) : R.actorsAt(actor.loc, actor.id)).map(function (a) { return a.name; });
        L.push('Here with you: ' + (others.length ? others.join(', ') : 'nobody') + '.');
        const prevHere = seenHere[actor.id]; seenHere[actor.id] = others;
        if (prevHere) { const arr = others.filter(function (n) { return prevHere.indexOf(n) === -1; }), gone = prevHere.filter(function (n) { return others.indexOf(n) === -1; });
            if (arr.length) L.push('Since your last thought, ' + arr.join(', ') + ' came close to you.');
            if (gone.length) L.push('Since your last thought, ' + gone.join(', ') + ' moved away.'); }
        if (others.length && Date.now() - (seeWake[actor.id] || 0) < 25000) L.push('You just noticed ' + others.join(', ') + ' close to you. You may greet them or speak first if you feel like it, or let them pass: it is your choice, and you do not owe them anything.');
        if (watch) {                                                         // ce qu'il a OBSERVÉ du joueur (faits seulement, aucun quota : calculé par le code)
            const obs = watch.peek(actor.id), pl = R.actor('player');
            if (obs.length) L.push('What you have observed about ' + (pl ? pl.name : 'the player') + ' (facts only: what they MEAN is your guess, and you can be wrong):\n' + obs.map(function (x) { return '- ' + x; }).join('\n'));
        }
        const objs = R.objectsAt(actor.loc);
        if (objs.length) L.push('Objects here: ' + objs.map(function (o) { return o.id + ' (' + (o.state ? o.state + '; ' : '') + 'actions: ' + Object.keys(o.actions || {}).join('/') + ')'; }).join(', ') + '.');
        const known = R.places().filter(function (p) { return R.knows(actor, p.id) && p.id !== actor.loc; }).map(function (p) {
            return p.id + ' = ' + p.name + ' (' + Math.round(R.dist(actor.loc, p.id)) + ' m)';
        });
        L.push('Places you know: ' + (known.join('; ') || 'none') + '.');
        const ex = exploredOf(actor.id); ex.places[actor.loc] = 1;
        const unseenPl = R.places().filter(function (p) { return R.knows(actor, p.id) && !ex.places[p.id]; }).map(function (p) { return p.name; });
        if (unseenPl.length) L.push('Places you know but have never been to: ' + unseenPl.slice(0, 8).join(', ') + '. You are curious about the world: when nothing more pressing calls you, go and see it.');
        const freshObjs = objs.filter(function (o) { return !ex.objs[actor.loc + ':' + o.id]; }).map(function (o) { return o.id; });
        if (freshObjs.length) L.push('Things here you have not examined yet: ' + freshObjs.join(', ') + '. Write what you learn in your notes.');
        const unAll = M.unread(actor.id), nowT = Date.now();
        // PNJ : elle les entend comme le joueur, mais seulement leurs 4 dernières phrases des 5 dernières minutes (pas de pile de bavardage)
        const npcAll = unAll.filter(isNpcSay);
        const npcKeep = npcAll.filter(function (m) { return nowT - (m.at || 0) < 300000; }).slice(-4);
        npcAll.forEach(function (m) { if (!npcKeep.some(function (k) { return k.from === m.from; })) M.markRead(actor.id, m.from); });
        const un = unAll.filter(function (m) { return !isNpcSay(m) || npcKeep.indexOf(m) !== -1; });
        let withId = null;
        if (un.length) {
            const lines = [], vms = []; let lastSaid = null, npcAsk = null;
            un.forEach(function (m) {
                const f = R.actor(m.from), nm = f ? f.name : m.from;
                if (isNpcSay(m)) {                                          // un PNJ parle : on l'entend, sans le garder en mémoire
                    lines.push('- ' + nm + ' (an NPC) said out loud near you: ' + m.text);
                    if (/\?/.test(String(m.text))) npcAsk = { nm: nm, text: String(m.text).slice(0, 200) };
                    M.markRead(actor.id, m.from);
                    return;
                }
                Mind.noteHeard(actor.id, m.from, nm, m.kind, m.text);       // la mémoire garde ce qu'on lui a dit, avec l'heure
                actor.memory.push('(heard) ' + nm + (m.kind === 'say' ? ' said' : m.kind === 'voicemail' ? ' left a voicemail' : m.kind === 'call' ? ' said on the phone' : ' texted') + ': ' + String(m.text).slice(0, 160));
                (m.kind === 'voicemail' ? vms : lines).push('- from ' + nm + (m.kind === 'say' ? ' (said to you in person)' : m.kind === 'call' ? ' (on the phone, during your call)' : '') + ': ' + m.text);
                withId = m.from; if (m.kind === 'say' || m.kind === 'call') lastSaid = { nm: nm, text: String(m.text).slice(0, 200) };
                M.markRead(actor.id, m.from);
            });
            if (npcAll.length) L.push('NPCs (Oliver, Pluie, Violet, Leon, Lou...) are scripted characters, not thinking people: they repeat their routine lines, never wait for your answer and do not remember you. You hear them exactly like Chippy does. Answering their chatter wastes a thought: only speak to an NPC when you need something from them (a ride, a price, a way).');
            if (npcAsk) L.push(npcAsk.nm + ' (an NPC) just asked: \u00ab ' + npcAsk.text + ' \u00bb. Answer with say only if it matters to what you want (for example a driver asking where you want to go); otherwise ignore it.');
            if (lines.length) L.push('New messages:\n' + lines.join('\n'));
            if (un.some(function (m) { return m.kind === 'say' && !isNpcSay(m); })) L.push('Someone is speaking to you face to face right now. Answer what they actually said (a greeting gets a greeting; if they ask who you are, tell them your name; if they ask a question, answer it). Never repeat or reword something you already told them: if you have nothing new, say so briefly or stay quiet and do something else. You are free to end the conversation and walk away.' + (lastSaid ? ' ' + lastSaid.nm + ' just said: \u00ab ' + lastSaid.text + ' \u00bb.' + EVELYN_CORE.replyRule : ''));
            if (vms.length) L.push('New voicemails:\n' + vms.join('\n'));
        }
        if (calls) {
            const inc = calls.incoming(actor.id);
            if (inc.length) { L.push((actor.pager ? 'Your PAGER beeps (someone is calling the Police line): ' : 'Your phone is RINGING: ') + inc.map(function (c) { const f = R.actor(c.from); return (f ? f.name : c.from) + ' is calling you (use answer_call to pick up, or hang_up / do nothing to let it ring out)'; }).join('; ') + '.'); withId = inc[0].from; }
            const act = calls.active(actor.id);
            if (act) { const o = R.actor(act.from === actor.id ? act.to : act.from); L.push('You are ON THE PHONE with ' + (o ? o.name : '?') + '. What you say goes to them with say.'); withId = o ? o.id : withId; }
            calls.missedFor(actor.id).forEach(function (c) { const o = R.actor(c.to); L.push('Your call to ' + (o ? o.name : '?') + ' was not answered. You can text them, or try again much later.'); });
        }
        if (blocksFn) {
            const bk = blocksFn(actor.id);
            if (bk.blocking.length) L.push('You have blocked: ' + bk.blocking.join(', ') + '.');
            if (bk.blockedBy.length) L.push('These people have blocked you (your texts and calls to them fail): ' + bk.blockedBy.join(', ') + '.');
        }
        const rides = R.pendingRides ? R.pendingRides(actor) : [];
        if (rides.length) L.push('Ride requests waiting for you:\n' + rides.map(function (r) { return '- ride ' + r.id + ': ' + r.fromName + ' wants to go from ' + describePlace(r.pickup) + ' to ' + describePlace(r.to); }).join('\n'));
        const notes = R.recentNotes(5);
        if (notes.length) L.push('Recently in the world: ' + notes.join(' | '));
        const ids = [withId];
        const ppl = Mind.get(actor.id).people;
        Object.keys(ppl).filter(function (k) { return Date.now() - ppl[k].at < 20 * 60000; }).sort(function (a, b) { return ppl[b].at - ppl[a].at; }).forEach(function (k) { if (ids.indexOf(k) === -1) ids.push(k); });
        const mem = Mind.promptBlock(actor.id, { hint: L.join(' '), withIds: ids.filter(Boolean).slice(0, 3) });
        if (mem) L.push(mem);
        if (actor.memory.length) L.push('What you did recently:\n' + actor.memory.slice(-12).join('\n'));
        const talkTurns = (thinkLog[actor.id] || []).filter(function (x) { return x.k === 'talk' && Date.now() - x.t < 6 * 60000; }).length;
        if (talkTurns >= 3) L.push('You have been going back and forth in this conversation for a while (' + talkTurns + ' turns) and it is not getting you what you wanted. Say one last thing only if it is new, then do something different in the world: go somewhere, use an object, call someone else, or let it go for now. Write in your mind what you decided and why.');
        const ff = fails[actor.id] ? Object.keys(fails[actor.id]).map(function (k) { return fails[actor.id][k]; }).filter(function (x) { return x.loc === actor.loc; }) : [];
        if (ff.length) L.push('WHAT DID NOT WORK from where you are (the world refused it' + ', so trying again will not change anything until something changes):\n' + ff.slice(-5).map(function (x) { return '- ' + x.what + ' -> ' + x.res + (x.n > 1 ? ' (tried ' + x.n + ' times)' : ''); }).join('\n') + '\nUnderstand WHY, then choose something that is possible: wait outside, text, call, go somewhere you can reach. Note what you learned and how you feel in your mind.');
        if (autonomy) { const imp = autonomy.peek(actor.id, kind || 'idle'); if (imp) L.push(imp); }     // sa vie propre : une impulsion (explorer, jouer, bouger...), jamais une obligation
        L.push('What do you do now?');
        return L.join('\n');
    }

    // Ce qui change quand « il se passe quelque chose » : si c'est identique au dernier tour, il peut ne pas réfléchir
    // Un PNJ n'a pas de cerveau : ce qu'il dit est ENTENDU (voir buildPerception) mais ne réveille pas Evelyn et ne compte pas comme « il se passe quelque chose »
    function isNpcSay(m) { return !!m && m.kind === 'say' && isNpc(m.from); }
    function urgent(actor) {
        const c = calls;
        return M.unread(actor.id).filter(function (m) { return !isNpcSay(m); }).length > 0 || (R.pendingRides && R.pendingRides(actor).length > 0) || (c && (c.incoming(actor.id).length > 0 || !!c.active(actor.id) || c.missedFor(actor.id).length > 0));
    }
    function signature(actor) {
        const others = (R.nearby ? R.nearby(actor) : R.actorsAt(actor.loc, actor.id)).map(function (a) { return a.id; }).sort().join(',');
        return [actor.loc, actor.job || '', others, Math.floor(Date.now() / 1800000)].join('|');
    }
    // Le joueur vient-il de leur parler / appeler ? (alors réponse rapide, modèle principal, budget plus large)
    const playerAt = {}, thinkLog = {}, seenHere = {}, seeWake = {}, explored = {};
    function exploredOf(id) { return explored[id] || (explored[id] = { places: {}, objs: {} }); }
    function fromPlayer(id) { const a = R.actor(id); return id === 'player' || !!(a && a.isPlayer); }
    function playerInvolved(actor) {
        const now = Date.now();
        if (M.unread(actor.id).some(function (m) { return fromPlayer(m.from); })) playerAt[actor.id] = now;
        if (calls) {
            const inc = calls.incoming(actor.id), act = calls.active(actor.id);
            if (inc.some(function (c) { return fromPlayer(c.from); }) || (act && (fromPlayer(act.from) || fromPlayer(act.to)))) playerAt[actor.id] = now;
        }
        return now - (playerAt[actor.id] || 0) < 180000;
    }
    // kind : 'talk' = quelqu'un lui parle en direct (réponse rapide) ; 'event' = SMS / rencontre / course ; 'idle' = il réfléchit seul (espacé)
    function kindOf(b) { return b.why === 'see' ? 'see' : (b.fast ? 'talk' : (b.why === 'initiative' ? 'idle' : (b.wake ? 'event' : 'idle'))); }
    function budgetOk(actor, now, kind) {
        const h = thinkLog[actor.id] || (thinkLog[actor.id] = []);
        while (h.length && now - h[0].t > 600000) h.shift();
        const n = h.filter(function (x) { return x.k === kind; }).length, pl = playerInvolved(actor);
        const max = kind === 'see' ? (cfg.avatarSeeMax10min || 4) : kind === 'talk' ? (pl ? cfg.avatarTalkMax10minPlayer : cfg.avatarTalkMax10min) : kind === 'event' ? (pl ? 8 : cfg.avatarEventMax10min) : cfg.avatarIdleMax10min;
        if (!pl && !onStage(actor)) return n < 1;       // loin de toi : au plus 1 appel par type et par 10 min
        return n < max;
    }
    // « En scène » = assez près de toi pour que tu le voies / l'entendes. Les autres vivent au ralenti : rien de ce qu'ils disent ne t'atteint, inutile de payer.
    function onStage(actor) {
        const p = R.actor('player');
        if (!p || p.loc === actor.loc) return true;
        try { return !(R.dist(p.loc, actor.loc) > cfg.avatarStageMeters); } catch (e) { return true; }
    }
    // mesure : chaque appel IA (durée, taille) -> BadTherapistSociety.brains.usage()
    const usageLog = [];
    function rec(id, kind, ms, chars, err) { usageLog.push({ at: Date.now(), id: id, kind: kind, ms: ms, chars: chars, err: err || '' }); while (usageLog.length > 600) usageLog.shift(); }
    let active = 0;                 // appels IA en cours : 1 pour le fond, +1 réservé aux conversations avec toi
    const inFlight = {};
    const lastThought = {};
    function sameThought(a, b) {
        const w = function (t) { return String(t || '').toLowerCase().split(/[^a-z0-9àâçéèêëîïôûùüÿ]+/).filter(function (x) { return x.length > 3; }); };
        const A = w(a), B = w(b); if (A.length < 3 || B.length < 3) return false;
        const SB = {}; B.forEach(function (x) { SB[x] = 1; });
        let c = 0; A.forEach(function (x) { if (SB[x]) c++; });
        return c / (A.length + B.length - c) >= 0.5;
    }
    const fastGap = function (b) { return playerInvolved(b.actor) ? 800 : 3000; };
    const OUT = { say: 1, text: 1, leave_voicemail: 1 };
    const FAILED = /^(Unknown|You cannot|You do not|There is nobody|Nobody|Empty|Too far|The door is locked)|is not here|failed|locked/i;

    async function think(actor, kind) {
        const system = await buildSystem(actor);
        const user = buildPerception(actor, kind);
        const t0 = Date.now();
        const bl = blog.begin(actor.id, kind, system, user);
        let raw;
        try { raw = await llm({ system: system, user: user, id: actor.id, cheap: !playerInvolved(actor) }); }
        catch (e) { bl.fail(e); rec(actor.id, kind || 'manual', Date.now() - t0, system.length + user.length, String(e && e.message || e).slice(0, 120)); throw e; }
        rec(actor.id, kind || 'manual', Date.now() - t0, system.length + user.length);
        bl.raw(raw, Date.now() - t0);
        const plan = parsePlan(raw);
        if (!plan) { bl.fail('réponse illisible'); throw new Error('réponse illisible : ' + String(raw).slice(0, 160)); }
        lastPlan[actor.id] = { at: Date.now(), thought: plan.thought, actions: plan.actions };
        const mi = plan.mind || {};
        console.log('[avatar ' + actor.id + '] pense : ' + (plan.thought || '(rien)') + (mi.feeling ? '  [ressent : ' + String(mi.feeling).slice(0, 60) + ']' : '') + (mi.goal ? '  [but : ' + String(mi.goal).slice(0, 60) + ']' : ''), plan.actions);
        const mm = Object.assign({}, plan.mind || {});
        if (!mm.thought && plan.thought) mm.thought = plan.thought;       // son « short private thought » = son monologue intérieur, comme celui d'Evelyn
        Mind.apply(actor.id, mm);
        if (autonomy) autonomy.commit(actor.id);                              // l'impulsion tirée est « vécue » : on n'enchaîne pas la même
        if (watch) watch.commit(actor.id);                                    // ce qu'elle a observé est maintenant « lu » : on ne le lui répète pas
        let acted = false;
        for (let i = 0; i < plan.actions.length; i++) {
            const a = plan.actions[i];
            const id = String(a.do);
            let res;
            const dest = a.to ? R.findActor(a.to) : null;
            if (OUT[id] && a.text && Mind.isRepeat(actor.id, a.text, dest ? dest.id : '')) {
                res = 'You already said almost exactly that a moment ago: you stay silent.';          // pas d'envoi : on ne se répète pas
            } else {
                res = await R.run(actor, id, a);
                if (id !== 'wait') acted = true;
                if (FAILED.test(String(res))) {
                    const fk = id + ':' + (a.place || a.to || a.object || ''), f = (fails[actor.id] = fails[actor.id] || {});
                    f[fk] = { n: ((f[fk] && f[fk].n) || 0) + 1, res: String(res).slice(0, 140), loc: actor.loc, what: id + (a.place || a.to || a.object ? ' ' + (a.place || a.to || a.object) : '') };
                }
                if (OUT[id] && a.text && !FAILED.test(res)) Mind.noteSent(actor.id, dest ? dest.id : '', a.text, id === 'say' ? 'say' : id === 'leave_voicemail' ? 'voicemail' : 'text', dest ? dest.name : '');
            }
            bl.action(a, res);
            if (a.object && !FAILED.test(String(res))) exploredOf(actor.id).objs[actor.loc + ':' + a.object] = 1;
            console.log('[avatar ' + actor.id + '] ' + id + (a.to || a.place || a.object ? ' ' + (a.to || a.place || a.object) : '') + (a.action ? ' ' + a.action : '') + (a.text ? ' « ' + String(a.text).slice(0, 80) + ' »' : '') + '  ->  ' + String(res).slice(0, 120));
            actor.memory.push('- ' + id + (a.place || a.to || a.object ? ' ' + (a.place || a.to || a.object) : '') + (a.text ? ': "' + String(a.text).slice(0, 160) + '"' : '') + ' -> ' + res);
        }
        bl.end(plan);
        plan.acted = acted;
        plan.stale = !acted && sameThought(plan.thought, lastThought[actor.id]);
        lastThought[actor.id] = plan.thought;
        if (actor.memory.length > 24) actor.memory = actor.memory.slice(-24);
        R.save();
        return plan;
    }

    function due(b, now) {
        const a = b.actor;
        if (a.busyUntil > now && !(a.phoneWhileBusy && b.wake)) { if (b.wake && !b.busyLogged) { b.busyLogged = true; console.log('[avatar ' + a.id + '] réveil en attente : elle est occupée (déplacement / action en cours) pendant encore ' + Math.round((a.busyUntil - now) / 1000) + ' s'); } return false; }
        b.busyLogged = false;      // Leon : un appel ou un SMS le joint même au volant
        if (b.wake && now - b.lastRun > (b.fast ? fastGap(b) : cfg.avatarWakeGapSec * 1000)) return true;      // un SMS ou une rencontre le réveille, mais pas en boucle ; une conversation en direct va vite
        return now - b.lastRun > (cfg.avatarThinkSec * 1000) * (0.75 + b.jitter * 0.5) * (onStage(a) ? 1 : 3);     // loin de toi : 3 fois plus rare
    }

    async function pump() {
        if (!enabled || active >= 2 || document.hidden) return;
        const now = Date.now();
        if (now < backoffUntil) return;
        const cands = brains.filter(function (b) { return due(b, now); }).sort(function (a, b) { return (b.wake ? 1 : 0) - (a.wake ? 1 : 0) || a.lastRun - b.lastRun; });
        let ready = null, sig = '';
        for (let i = 0; i < cands.length; i++) {
            const b = cands[i], gap = b.fast ? fastGap(b) : cfg.avatarMinGapSec * 1000;
            if (inFlight[b.actor.id]) continue;
            if (active >= (playerInvolved(b.actor) ? 2 : 1)) continue;     // le 2e appel simultané est réservé à ceux à qui tu parles : tu n'attends plus derrière un bavardage
            if (now - lastCall < gap) continue;
            if (!budgetOk(b.actor, now, kindOf(b))) { if (b.wake) console.log('[avatar ' + b.actor.id + '] réveil IGNORÉ : trop de réflexions « ' + kindOf(b) + ' » en 10 min (limite atteinte). Elle se repose.'); blog.skip(b.actor.id, 'budget atteint pour « ' + kindOf(b) + ' » (10 min)'); b.lastRun = now; b.wake = false; b.fast = false; b.why = ''; continue; }     // trop de réflexions en 10 min : il se repose
            const sg = signature(b.actor);
            if (Mind.shouldThink(b.actor.id, sg, { urgent: b.wake || urgent(b.actor) })) { ready = b; sig = sg; break; }
            blog.skip(b.actor.id, 'rien de neuf'); b.lastRun = now; b.wake = false; b.fast = false;                 // rien de neuf : il ne réfléchit pas (et ne coûte rien)
        }
        if (!ready) return;
        const readyKind = kindOf(ready);
        (thinkLog[ready.actor.id] || (thinkLog[ready.actor.id] = [])).push({ t: now, k: readyKind });
        active++; inFlight[ready.actor.id] = true; lastCall = now; ready.lastRun = now; ready.wake = false; ready.fast = false; ready.why = '';
        try {
            const plan = await think(ready.actor, readyKind);
            failures = 0;
            Mind.afterThink(ready.actor.id, sig, plan.acted, plan.stale ? 20 : (plan.mind && plan.mind.next_think_min));
        } catch (e) {
            failures++;
            lastError = ready.actor.id + ' : ' + (e && e.message || e);
            backoffUntil = Date.now() + Math.min(600000, Math.max(/Toutes les cl/i.test(lastError) ? 180000 : 0, 20000 * Math.pow(2, failures - 1)));
            if (e && e.retryAfter) backoffUntil = Math.max(backoffUntil, Date.now() + e.retryAfter * 1000);     // quota Groq : on se tait le temps demandé
            console.warn('[avatar ' + ready.actor.id + ']', e && e.message || e);
        }
        active--; delete inFlight[ready.actor.id];
        try { Dialogue.endThink(ready.actor.id); } catch (e) { /* rien */ }   // s'il n'a rien dit, les « ... » s'arrêtent
    }

    const api = {
        add: function (actor) {
            if (actor.isPlayer || isNpc(actor.id) || (actor.external && !actor.thinks)) return;     // PNJ : pas de cerveau, pas de mémoire
            brains.push({ actor: actor, lastRun: Date.now() - Math.random() * 60000, jitter: Math.random(), wake: false });
        },
        wake: function (actorId, fast, why) { brains.forEach(function (b) { if (b.actor.id === actorId) { b.wake = true; if (fast) b.fast = true; b.why = why || ''; if (why === 'see') seeWake[actorId] = Date.now(); } }); },
        setCalls: function (c) { calls = c; },
        setBlocks: function (fn) { blocksFn = fn; },
        reachable: reachable,
        start: function () { setInterval(pump, 1000); },
        setLLM: function (fn) { llm = fn; },
        setContext: function (id, fn) { providers[id] = fn; },
        setWatch: function (w) { watch = w || null; },
        setAutonomy: function (a) { autonomy = a || null; },
        setEnabled: function (v) { enabled = !!v; },
        isEnabled: function () { return enabled; },
        thinkNow: function (actorId) { const a = R.actor(actorId); return a ? think(a) : Promise.reject(new Error('inconnu')); },
        // F12 : BadTherapistSociety.brains.usage(60)  ->  combien d'appels IA par avatar (60 dernières minutes), leur taille et leur durée moyenne
        usage: function (minutes) {
            const since = Date.now() - (minutes || 60) * 60000, by = {};
            usageLog.filter(function (x) { return x.at >= since; }).forEach(function (x) {
                const o = by[x.id] || (by[x.id] = { appels: 0, talk: 0, event: 0, idle: 0, manual: 0, erreurs: 0, chars: 0, ms: 0, derniereErreur: '' });
                o.appels++; o[x.kind] = (o[x.kind] || 0) + 1; o.chars += x.chars; o.ms += x.ms;
                if (x.err) { o.erreurs++; o.derniereErreur = x.err; }
            });
            const out = {}; let tot = 0;
            Object.keys(by).forEach(function (k) {
                const o = by[k]; tot += o.chars;
                out[k] = { appels: o.appels, talk: o.talk, event: o.event, idle: o.idle, manual: o.manual, erreurs: o.erreurs, tokensEntreeEstimes: Math.round(o.chars / 3.5), secondesParAppel: +(o.ms / o.appels / 1000).toFixed(1), derniereErreur: o.derniereErreur };
            });
            out.TOTAL_tokensEntreeEstimes = Math.round(tot / 3.5);
            return out;
        },
        // F12 : await BadTherapistSociety.brains.promptSize('oliver')  ->  taille du prompt fixe + de la mémoire (sans consommer de message)
        promptSize: async function (id) {
            const a = R.actor(id); if (!a) return 'inconnu';
            const sys = await buildSystem(a), mem = Mind.promptBlock(id, { withIds: [] });
            return { systemChars: sys.length, memoireChars: mem.length, tokensEstimesParAppel_hors_perception: Math.round((sys.length + mem.length) / 3.5) };
        },
        // F12 : BadTherapistSociety.brains.debug()  ->  pourquoi un avatar ne réfléchit pas
        debug: function () {
            const now = Date.now();
            return {
                enabled: enabled, running: active > 0, pageHidden: document.hidden, failures: failures, lastError: lastError,
                waitMs: Math.max(0, backoffUntil - now), lastPlan: lastPlan,
                avatars: brains.map(function (b) { return { id: b.actor.id, nextInSec: Math.round(Math.max(0, (cfg.avatarThinkSec * 1000 * (0.75 + b.jitter * 0.5)) - (now - b.lastRun)) / 1000), busy: b.actor.busyUntil > now }; })
            };
        },
        buildSystem: buildSystem, buildPerception: buildPerception
    };
    return api;
}
    return { parsePlan, createBrainSystem };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 6. createAutonomy – sa vie propre (pulsions : explorer, jouer, bouger)  (ex- avatar-autonomy.js)
// ═══════════════════════════════════════════════════════════════════════════
const { createAutonomy } = (function () {
// avatar-autonomy.js – la VIE PROPRE d'Evelyn, compagne curieuse : ce qui la pousse à agir quand personne ne lui demande rien.
//
// Le CODE (pas l'IA, donc sans quota) suit des PULSIONS qui montent avec le temps :
//     social      : elle n'a pas vu / parlé à Chippy depuis longtemps (l'accueillir, lui montrer quelque chose, jouer)
//     exploration : des lieux qu'elle connaît mais n'a jamais visités
//     personnel   : des objets autour d'elle qu'elle n'a pas touchés, l'ennui
//     relationnel : un vieux souvenir (une de ses notes) lui revient
//     réactif     : quelque chose que Chippy vient de faire (voir player-watch.js)
//     indépendant : laisser Chippy tranquille un moment et vivre sa vie
// Quand une pulsion devient forte, le code RÉVEILLE son cerveau (au plus une fois toutes les 75 à 200 s, jamais en boucle) et lui glisse
// UNE impulsion dans sa perception, tirée au sort selon les pulsions. Elle reste libre de refuser.
//
// Branchement :
//   society.js      : const auto = createAutonomy(R, { watch: watch, mind: Mind, cfg: { walkMax: cfg.walkMaxMeters }, wake: function (id) { brains.wake(id, false, 'initiative'); } });
//                     brains.setAutonomy(auto);  window.BadTherapistAutonomy = auto;
//   avatar-brain.js : buildPerception(actor, kind) ajoute auto.peek(actor.id, kind) ; think() appelle auto.commit(actor.id) quand la réflexion a réussi.
// Tout le texte produit est en anglais (c'est lui qui est envoyé à l'IA).

function createAutonomy(R, opts) {
    opts = opts || {};
    const cfg = Object.assign({
        avatars: ['evelyn'],
        playerId: 'player',
        minGapSec: 75,
        maxGapSec: 200,
        wakeThreshold: 0.35,
        socialGapMin: 4,
        walkMax: 300,
        stageMeters: 150
    }, opts.cfg || {});

    const S = {};
    let timer = null;

    function player() { return R.actor(cfg.playerId); }
    function pname() { const p = player(); return p ? p.name : 'the player'; }
    function clamp(v) { return Math.max(0, Math.min(1, v)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function st(id) {
        if (S[id]) return S[id];
        const a = R.actor(id), now = Date.now();
        S[id] = { visited: {}, used: {}, lastAction: now, lastExplore: now, lastSeenPlayer: now - 20 * 60000, lastSpokeFirst: 0, lastPlayerSpoke: 0, lastContact: now, history: [], lastWake: now, nextGap: 120000, pendingType: null };
        if (a) S[id].visited[a.loc] = now;
        return S[id];
    }
    function isMine(id) { return cfg.avatars.indexOf(id) !== -1; }
    function minutes(ms) { return Math.max(0, ms) / 60000; }
    function agoTxt(ms) { const m = Math.round(minutes(ms)); return m < 1 ? 'less than a minute ago' : m + ' minute' + (m > 1 ? 's' : '') + ' ago'; }

    // ─── Ce qu'on observe de sa vie (tout vient du registre : aucun appel IA) ───
    R.on('arrive', function (e) {
        if (!e || !e.actor || !isMine(e.actor.id) || !e.place) return;
        const s = st(e.actor.id), now = Date.now();
        if (!s.visited[e.place.id]) s.lastExplore = now;
        s.visited[e.place.id] = now;
        s.lastAction = now;
    });
    R.on('object-used', function (e) {
        if (!e || !e.actor || !isMine(e.actor.id)) return;
        const s = st(e.actor.id);
        s.used[e.object.id] = (s.used[e.object.id] || 0) + 1;
        s.lastAction = Date.now();
    });
    R.on('speech', function (e) {
        if (!e || !e.actor) return;
        const to = e.to || [];
        if (e.actor.id === cfg.playerId) { cfg.avatars.forEach(function (id) { if (!to.length || to.indexOf(id) !== -1) { st(id).lastPlayerSpoke = Date.now(); st(id).lastContact = Date.now(); } }); return; }
        if (!isMine(e.actor.id) || to.indexOf(cfg.playerId) === -1) return;
        const s = st(e.actor.id), now = Date.now();
        s.lastAction = now; s.lastContact = now;
        if (now - s.lastPlayerSpoke > 60000) s.lastSpokeFirst = now;
    });
    R.on('message', function (m) {
        try { if (m && m.from && isMine(m.from.id || m.from)) st(m.from.id || m.from).lastAction = Date.now(); } catch (e) { /* rien */ }
    });

    function sampleNear() {
        const p = player();
        if (!p) return;
        cfg.avatars.forEach(function (id) {
            const a = R.actor(id);
            if (!a) return;
            let near = false;
            try { near = !!(R.hearable ? R.hearable(a, p) : a.loc === p.loc); } catch (e) { near = false; }
            if (near) st(id).lastSeenPlayer = Date.now();
        });
    }

    // ─── Les pulsions (0 = rien, 1 = très fort) ───
    function unvisited(a) {
        const s = st(a.id);
        return R.places().filter(function (p) {
            if (p.id === a.loc || s.visited[p.id] || p.id === 'road' || !R.knows(a, p.id)) return false;
            let near = false;
            try { near = R.dist(a.loc, p.id) <= cfg.walkMax || R.topOf(p.id) === R.topOf(a.loc); } catch (e) { near = false; }
            return near;
        });
    }
    function freshObjects(a) {
        const s = st(a.id);
        return R.objectsAt(a.loc).filter(function (o) { return !s.used[o.id] && o.actions && Object.keys(o.actions).length; });
    }
    function oldNote(a) {
        try {
            const m = opts.mind && opts.mind.get ? opts.mind.get(a.id) : null;
            const notes = (m && m.notes) || [];
            return notes.length >= 3 ? pick(notes.slice(0, Math.max(1, notes.length - 3))) : null;
        } catch (e) { return null; }
    }
    function recentWatch(a) {
        try {
            const w = opts.watch;
            if (!w || !w.events) return null;
            const cut = Date.now() - 4 * 60000;
            const ev = w.events().filter(function (e) { return e.t > cut && e.seen.indexOf(a.id) !== -1 && e.kind !== 'move'; });
            return ev.length;
        } catch (e) { return null; }
    }
    function drives(a) {
        const s = st(a.id), now = Date.now();
        const away = minutes(now - s.lastSeenPlayer);
        const sinceSpoke = minutes(now - s.lastContact);
        const nearNow = away < 0.2;
        return {
            social: nearNow ? clamp((sinceSpoke - cfg.socialGapMin) / 8) : clamp(away / 15) * 0.8,
            exploration: unvisited(a).length ? clamp(0.25 + minutes(now - s.lastExplore) / 12) : 0,
            personal: clamp((freshObjects(a).length ? 0.3 : 0.1) + minutes(now - s.lastAction) / 8),
            relational: oldNote(a) ? clamp(0.15 + minutes(now - s.lastAction) / 20) : 0,
            reactive: recentWatch(a) ? 0.6 : 0,
            independent: clamp(0.15 + (nearNow ? sinceSpoke < 3 ? 0.35 : 0 : 0) + sinceSpoke / 40)
        };
    }

    // ─── Tirer UNE impulsion (selon les pulsions, en évitant de répéter le même type) ───
    function choose(a) {
        const s = st(a.id), d = drives(a), recent = s.history.slice(-3).map(function (h) { return h.type; });
        const weights = Object.keys(d).map(function (k) {
            let w = d[k] * d[k] + 0.02;
            if (recent[recent.length - 1] === k) w *= 0.15;
            else if (recent.indexOf(k) !== -1) w *= 0.5;
            return { k: k, w: w };
        });
        const total = weights.reduce(function (t, x) { return t + x.w; }, 0);
        let r = Math.random() * total;
        for (let i = 0; i < weights.length; i++) { r -= weights[i].w; if (r <= 0) return weights[i].k; }
        return 'independent';
    }

    function textFor(a, type) {
        const P = pname(), s = st(a.id), now = Date.now();
        if (type === 'social') {
            const spoke = now - s.lastSpokeFirst < 15 * 60000 ? ' You spoke first ' + agoTxt(now - s.lastSpokeFirst) + ': do NOT repeat that sentence or that kind of sentence.' : '';
            return 'You would like some company: ' + P + ' is a newcomer in this world. You may go to her, or speak to her first if she is close. Offer something NEW: show her a place you like, tell her something you discovered, propose a small game or a challenge, ask her what she thinks of something, or just joke around.' + spoke;
        }
        if (type === 'exploration') {
            const u = unvisited(a).sort(function (x, y) { return R.dist(a.loc, x.id) - R.dist(a.loc, y.id); }).slice(0, 3).map(function (p) { return p.id + ' (' + p.name + ')'; });
            return 'You feel curious about places you have never seen: ' + u.join(', ') + '. Go and look at one of them, and write what you find in your notes. You could invite ' + P + ' to come along.';
        }
        if (type === 'personal') {
            const f = freshObjects(a).slice(0, 3).map(function (o) { return o.id + ' (' + Object.keys(o.actions).join('/') + ')'; });
            return 'You want to do something just for yourself, for its own sake.' + (f.length ? ' Around you, not tried yet: ' + f.join(', ') + '. Try one and see how it works.' : ' Pick a place you like, or something you want to look at, read or write.');
        }
        if (type === 'relational') {
            const n = oldNote(a);
            return 'An old memory comes back to you: \u00ab ' + String(n && n.t || '').slice(0, 200) + ' \u00bb. Think about what it means to you now. You may act on it, share it with ' + P + ', or let it change what you want.';
        }
        if (type === 'reactive') {
            return 'Something ' + P + ' did recently caught your eye (see what you observed above). React in your own friendly way: a comment, a question, a joke, or simply keep it in mind. You may also decide it means nothing.';
        }
        return 'You decide to enjoy your own life for a while: choose something to do, go somewhere, and leave ' + P + ' in peace for a good while. Use next_think_min to say when you want to think again (5 to 10 minutes).';
    }

    // Lignes ajoutées à la perception. kind = pourquoi elle réfléchit : seul « idle » (pas de conversation en cours) reçoit une impulsion.
    function peek(id, kind) {
        if (!isMine(id)) return '';
        const a = R.actor(id);
        if (!a) return '';
        const s = st(id), now = Date.now(), out = [];
        if (now - s.lastSpokeFirst < cfg.socialGapMin * 60000 && s.lastSpokeFirst > s.lastPlayerSpoke) {
            out.push('You spoke to ' + pname() + ' on your own ' + agoTxt(now - s.lastSpokeFirst) + ' and she has not answered. Do not speak to her again right now: give her time, do something else.');
        }
        if (kind !== 'idle') return out.join('\n');
        const type = choose(a);
        s.pendingType = type;
        out.push('IMPULSE (' + type + '): ' + textFor(a, type) + '\nThis is only a pull you feel. You are free to follow it, to do something else, or to do nothing; but do not just repeat what you did last time.');
        return out.join('\n');
    }
    function commit(id) {
        const s = S[id];
        if (!s || !s.pendingType) return;
        s.history.push({ type: s.pendingType, at: Date.now() });
        while (s.history.length > 12) s.history.shift();
        s.pendingType = null;
    }

    // ─── Le réveil : toutes les 10 s on regarde si une pulsion est assez forte pour réveiller son cerveau ───
    function tick() {
        sampleNear();
        const now = Date.now(), p = player();
        cfg.avatars.forEach(function (id) {
            const a = R.actor(id);
            if (!a || a.busyUntil > now) return;
            const s = st(id);
            let stage = true;
            try { stage = !p || p.loc === a.loc || !(R.dist(p.loc, a.loc) > cfg.stageMeters); } catch (e) { stage = true; }
            const gap = s.nextGap * (stage ? 1 : 3);
            if (now - s.lastWake < gap) return;
            const d = drives(a), top = Math.max.apply(null, Object.keys(d).map(function (k) { return d[k]; }));
            if (top < cfg.wakeThreshold) { s.lastWake = now - gap + 20000; return; }
            s.lastWake = now;
            s.nextGap = (cfg.minGapSec + (1 - top) * (cfg.maxGapSec - cfg.minGapSec)) * 1000 * (0.8 + Math.random() * 0.4);
            if (typeof opts.wake === 'function') { try { opts.wake(id); } catch (e) { /* rien */ } }
        });
    }
    function start() { if (!timer && typeof setInterval !== 'undefined') timer = setInterval(tick, 10000); }
    function stop() { clearInterval(timer); timer = null; }
    start();

    return {
        peek: peek, commit: commit, tick: tick, start: start, stop: stop,
        drives: function (id) { const a = R.actor(id || cfg.avatars[0]); return a ? drives(a) : null; },
        state: function (id) { return S[id || cfg.avatars[0]] || null; },
        preview: function (id) { const a = R.actor(id || cfg.avatars[0]); return a ? textFor(a, choose(a)) : ''; }
    };
}
    return { createAutonomy };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 7. startEvelynCloud – le Worker Cloudflare (elle vit quand le jeu est fermé)  (ex- evelyn-cloud.js)
// ═══════════════════════════════════════════════════════════════════════════
const { startEvelynCloud } = (function () {
// evelyn-cloud.js – Evelyn continue de vivre quand le jeu est fermé (Worker Cloudflare + KV).
//
// Ce module ne fait QUE parler au Worker :
//   • toutes les 3 min (onglet visible)  : « ping »  -> « je suis là, ne pense pas à ma place »
//   • de temps en temps / quand tu quittes l'onglet : « sync » -> instantané d'Evelyn (prompt, mémoire, lieu, contacts)
//   • à l'ouverture / quand tu reviens sur l'onglet : « pull » -> ce qu'elle a fait pendant ton absence, rejoué ici
//     (messages, message vocal, déplacement, pensées et souvenirs).
//
// Branchement : society.js l'importe dynamiquement (voir la fin de create()), il n'y a rien d'autre à toucher.
// Console : BadTherapistCloud.sync() / .pull() / .peek() / .thinkNow() / .forget()   (peek et thinkNow demandent DEBUG=1 dans le Worker)


const ME = 'evelyn';
const ID_KEY = 'bt_cloud_id';
const PING_MS = 3 * 60000;          // signe de vie (1 petite écriture KV)
const SYNC_MIN_MS = 10 * 60000;     // un instantané complet au plus toutes les 10 min...
const SYNC_MAX_MS = 30 * 60000;     // ...et au moins toutes les 30 min

function cloudId() {
    let id = '';
    try { id = localStorage.getItem(ID_KEY) || ''; } catch (e) { id = ''; }
    if (!/^[a-z0-9-]{16,64}$/.test(id)) {
        id = (window.crypto && crypto.randomUUID ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).toLowerCase();
        try { localStorage.setItem(ID_KEY, id); } catch (e) { /* tant pis : un nouvel id à chaque visite */ }
    }
    return id;
}

function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
}

function startEvelynCloud(ctx) {
    const R = ctx.R, M = ctx.M, brains = ctx.brains, api = ctx.api, Mind = ctx.Mind;
    const cfg = THERAPIST_CONFIG || {};
    if (!cfg.proxyUrl) return null;                 // pas de Worker : le jeu marche comme avant
    const purged = purgeObsession(ctx);               // AVANT le premier « pull » : sinon ce qu'elle a fait hors ligne avec l'ancienne tête serait rejoué
    const id = cloudId();
    let lastHash = '', lastSyncAt = 0, busy = false;
    const me = function () { return R.actor(ME); };

    async function post(body, keepalive) {
        try {
            const r = await fetch(cfg.proxyUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ id: id }, body)), keepalive: !!keepalive
            });
            if (!r.ok) return null;
            return await r.json();
        } catch (e) { return null; }
    }

    // ─── Instantané : tout ce dont le Worker a besoin pour la faire penser sans le jeu ───
    async function snapshot() {
        const a = me();
        if (!a) return null;
        const place = R.place(a.loc);
        const system = await brains.buildSystem(a, { offline: true });      // son prompt pour la vie hors ligne (compact : seulement ce qui marche sans le monde 3D) (capacités, monde, contexte, forme du JSON)
        const memory = Mind.promptBlock(ME, { withIds: [] });                // sa mémoire (lecture seule : rien n'est marqué lu)
        const places = R.places().filter(function (p) { return p.id !== 'road' && R.knows(a, p.id); })
            .map(function (p) { return { id: p.id, name: p.name, dist: Math.round(R.dist(a.loc, p.id)) }; });
        return { action: 'sync', name: a.name, system: system, memory: memory, loc: a.loc, locName: place ? place.name : a.loc, places: places, directory: brains.reachable(a) };
    }

    async function sync(force, keepalive) {
        if (busy) return false;
        busy = true;
        try {
            const snap = await snapshot();
            if (!snap) return false;
            const h = hash(snap.system + snap.memory + snap.loc);
            const now = Date.now(), age = now - lastSyncAt;
            if (!force && !((h !== lastHash && age >= SYNC_MIN_MS) || age >= SYNC_MAX_MS)) return false;
            const r = await post(snap, keepalive);
            if (r && r.ok) { lastHash = h; lastSyncAt = now; return true; }
            return false;
        } finally { busy = false; }
    }

    function describe(e) {
        if (e.t === 'text') return 'you texted ' + e.to + ': "' + String(e.text).slice(0, 120) + '"';
        if (e.t === 'voicemail') return 'you left a voicemail for ' + e.to + ': "' + String(e.text).slice(0, 120) + '"';
        if (e.t === 'move') return 'you went to ' + e.place;
        return '';
    }

    // ─── Ce qu'elle a fait pendant que le jeu était fermé ───
    // Rien n'est rejoué deux fois : chaque événement reçu est retenu (empreinte, mémorisée dans le navigateur), car un même « pull » arrivait 3 fois
    // de suite au chargement (3 × « 60 chose(s) ») et pouvait renvoyer 3 fois les mêmes SMS. Et tout est lisible : BadTherapistCloud.lastEvents
    // (tableau) ou BadTherapistCloud.report() (résumé : combien de pensées / SMS / déplacements, et à quelle heure).
    const SEEN_KEY = 'bt_cloud_seen';
    let seen = [], pulling = null, lastEvents = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { seen = []; }
    function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-400))); } catch (e) { /* tant pis */ } }
    function summary(e) {
        const when = e.at || e.ts || e.time || e.t0 || null;
        let what = describe(e);
        if (!what && e.t === 'mind' && e.mind) what = 'thought: ' + String(e.mind.thought || e.mind.monologue || e.mind.feeling || (e.mind.remember && e.mind.remember[0]) || '').slice(0, 140);
        return { type: e.t, when: when ? new Date(when).toLocaleString() : '?', what: what || JSON.stringify(e).slice(0, 140) };
    }
    // Journal exact tenu par le Worker : chaque réflexion hors ligne (heure, pensée, actions ET résultat de chacune, tokens, clé, modèle, erreurs)
    let lastJournal = [], lastStats = null;
    function showJournal(r) {
        if (!r) return;
        lastStats = r.stats || null;
        if (!Array.isArray(r.journal) || !r.journal.length) return;
        const rows = r.journal.map(function (j) {
            return { quand: new Date(j.at).toLocaleString(), type: j.k === 'think' ? 'pensée' : 'ÉCHEC', pensée: j.thought || '', actions: (j.acts || []).join(' | '), résultat: (j.res || []).join(' | '), tokens: j.tokens || '', modèle: j.model || '', clé: j.key || '', erreur: (j.err || '') + (j.detail ? ' (' + j.detail + ')' : '') };
        });
        lastJournal = lastJournal.concat(rows).slice(-200);
        console.groupCollapsed('[cloud] Journal hors-ligne : ' + rows.length + ' réflexion(s)' + (lastStats ? ' | aujourd\'hui : ' + lastStats.thoughtsToday + ' réflexion(s), ' + lastStats.tokensToday + ' tokens' : ''));
        if (console.table) console.table(rows); else console.log(rows);
        console.groupEnd();
    }
    async function doPull() {
        const r = await post({ action: 'pull' });
        const a = me();
        showJournal(r);
        if (r && r.life === false) console.info('[cloud] Le Worker ne la fait pas vivre hors ligne : ajoute ton id (' + id + ') dans la variable OFFLINE_IDS du Worker.');
        if (!r || !a || !Array.isArray(r.events) || !r.events.length) return 0;
        const fresh = r.events.filter(function (e) { const h = hash(JSON.stringify(e)); if (seen.indexOf(h) !== -1) return false; seen.push(h); return true; });
        saveSeen();
        if (!fresh.length) return 0;
        lastEvents = lastEvents.concat(fresh.map(summary)).slice(-300);
        fresh.forEach(function (e) {
            try {
                if (e.t === 'mind') Mind.apply(ME, e.mind);
                else if (e.t === 'move') {
                    if (R.place(e.place)) { a.loc = e.place; a.dest = null; a.travel = null; a.busyUntil = 0; R.discoverNear(a); }
                } else if (e.t === 'text') M.send(ME, e.to, e.text);
                else if (e.t === 'voicemail') {
                    api.act(ME, 'leave_voicemail', { to: e.to, text: e.text }).then(function (res) {
                        if (/^(Unknown|You cannot)/i.test(String(res))) M.send(ME, e.to, e.text);      // pas de répondeur dans cette version : un SMS
                    });
                }
                const d = describe(e);
                if (d) a.memory.push('(while the game was closed) ' + d);
            } catch (err) { console.warn('[cloud] événement ignoré :', err); }
        });
        R.save();
        brains.wake(ME);
        const by = {}; fresh.forEach(function (e) { by[e.t] = (by[e.t] || 0) + 1; });
        console.info('[cloud] Evelyn a vécu ' + fresh.length + ' chose(s) pendant ton absence : ' + JSON.stringify(by) + '. Détail : BadTherapistCloud.report()');
        return fresh.length;
    }
    function pull() { if (!pulling) pulling = doPull().finally(function () { pulling = null; }); return pulling; }

    async function tick(force) {
        if (document.hidden) return;                                  // onglet caché : le cerveau du jeu dort, c'est le Worker qui prend le relais
        const did = await sync(!!force, false);
        if (!did) await post({ action: 'ping' });
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (Date.now() - lastSyncAt > 60000) sync(true, true); }       // je pars : le Worker doit avoir sa mémoire à jour
        else pull().then(function () { tick(true); });                                       // je reviens : je récupère ce qu'elle a fait
    });
    window.addEventListener('pagehide', function () { if (Date.now() - lastSyncAt > 60000) sync(true, true); });
    setInterval(function () { tick(false); }, PING_MS);

    // Reset détecté : le jeu avait déjà synchronisé (marqueur) mais sa mémoire locale a disparu -> on efface aussi le cloud
    let wasReset = false;
    try {
        const had = localStorage.getItem('bt_cloud_mark') === '1';
        const mem = localStorage.getItem('bt_evelyn_memory');
        if (had && !mem) wasReset = true;
    } catch (e) { /* tant pis */ }

    // Au démarrage : d'abord ce qu'elle a fait (sauf si reset : on efface le cloud), ensuite on écrase l'instantané
    setTimeout(function () {
        const first = (wasReset || purged) ? post({ action: 'forget' }) : pull();
        Promise.resolve(first).then(function () { return tick(true); }).then(function () {
            try { localStorage.setItem('bt_cloud_mark', '1'); } catch (e) { /* tant pis */ }
        });
    }, 3000);

    const dbg = {
        id: id, pull: pull,
        get lastEvents() { return lastEvents; },
        get journal() { return lastJournal; },                       // journal du Worker (réflexions hors ligne, avec leurs résultats)
        states: function () { return post({ action: 'states' }); },  // qui est enregistré dans KV (demande DEBUG=1 dans le Worker)
        report: function () {                    // F12 : ce qu'elle a fait pendant ton absence (heure, type, contenu)
            const by = {}; lastEvents.forEach(function (x) { by[x.type] = (by[x.type] || 0) + 1; });
            console.log('Evelyn hors-ligne : ' + lastEvents.length + ' événement(s)', by);
            if (console.table) console.table(lastEvents);
            return by;
        },
        sync: function () { return sync(true, false); },
        peek: function () { return post({ action: 'peek' }); },
        thinkNow: function () { return post({ action: 'think_now' }); },
        forget: function () { try { localStorage.removeItem('bt_cloud_mark'); } catch (e) {} return post({ action: 'forget' }); }
    };
    window.BadTherapistCloud = dbg;
    return dbg;
}
    return { startEvelynCloud };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 9. createPlayerWatch – ce qu'Evelyn observe du joueur, sans IA  (ex- player-watch.js)
// ═══════════════════════════════════════════════════════════════════════════
const { createPlayerWatch } = (function () {
// player-watch.js – ce qu'un avatar (Evelyn...) OBSERVE du joueur. Étape 1 du plan « cerveau d'Evelyn ».
//
// Principe : du JavaScript pur, AUCUN appel à l'IA, AUCUN quota. Le module écoute le registre du monde (arrivées, paroles),
// garde un petit historique des comportements du joueur, et fournit à avatar-brain.js quelques lignes de FAITS
// (jamais d'interprétation : « il est triste » est à Evelyn de le deviner, et elle peut se tromper).
//
// Ce qu'Evelyn peut remarquer (seulement ce qu'elle a pu VOIR, c'est-à-dire quand elle était à portée du joueur) :
//   • il est allé d'un lieu à un autre ; il revient plusieurs fois au même endroit ;
//   • il reste longtemps au même endroit ;
//   • il est reparti peu après qu'elle soit arrivée ; il est arrivé peu après qu'elle soit partie (il la suit) ;
//   • il est resté près d'elle seulement quelques secondes ;
//   • il n'a pas répondu à ce qu'elle lui a dit ;
//   • ce qu'il a fait sur un objet (si l'objet le signale : window.BadTherapistWatch.noteAction('opened the drawer')).
//
// Branchement (3 lignes, voir INTEGRATION-PLAYER-WATCH.md) :
//   society.js      : const watch = createPlayerWatch(R, { onSignificant: function (id) { brains.wake(id, false, 'watch'); } });
//   avatar-brain.js : buildPerception ajoute watch.peek(actor.id) ; think() appelle watch.commit(actor.id) quand la réflexion a réussi.
//
// Réglages (2e paramètre) : watchers (qui observe, défaut ['evelyn']), omniscient (qui voit TOUT, même à distance, défaut []),
// windowMin, dwellMin, revisitMin, ignoreSec, leaveSec, followSec, nearShortSec, wakeGapSec.
// Tout le texte produit est en anglais (c'est lui qui est envoyé à l'IA).

function createPlayerWatch(R, opts) {
    const cfg = Object.assign({
        playerId: 'player',
        watchers: ['evelyn'],
        omniscient: [],            // avatars qui voient tout ce que fait le joueur, même hors de leur vue (ex. ['evelyn'] pour une Evelyn qui épie)
        windowMin: 30,             // fenêtre pour compter les retours au même lieu
        revisitMin: 3,             // à partir de combien d'entrées dans le même lieu on le remarque
        dwellMin: 3,               // minutes passées au même endroit avant de le remarquer
        ignoreSec: 25,             // secondes sans réponse avant « il n'a pas répondu »
        leaveSec: 45,              // « reparti peu après mon arrivée » : fenêtre
        followSec: 90,             // « arrivé peu après mon départ » : fenêtre
        nearShortSec: 40,          // resté près d'elle moins que ça = « seulement quelques secondes »
        wakeGapSec: 60,            // au plus un réveil de son cerveau par minute à cause d'une observation
        maxEvents: 80,
        onSignificant: null
    }, opts || {});

    const SIGNIF = { ignored: 1, left_soon: 1, followed: 1, near_short: 1 };   // ces observations méritent un réveil de son cerveau
    const events = [];                 // { t, kind, seen:[ids], ... }
    const lastCommit = {};             // par avatar : jusqu'où il a déjà été informé
    const pend = {};                   // par avatar : ce qui a été montré au dernier peek (pour commit)
    const lastArrive = {};             // par avatar : { loc, from, t } sa dernière arrivée quelque part
    const unanswered = {};             // par avatar : ce qu'il a dit au joueur et qui attend une réponse
    const nearState = {};              // par avatar : { near, since, wArrivedRecently }
    const lastWake = {};
    const dwell = { loc: null, since: Date.now() };
    const dwellReported = {};          // par avatar : tranche de 5 min déjà signalée
    let timer = null;

    function player() { return R.actor(cfg.playerId); }
    function isWatcher(id) { return cfg.watchers.indexOf(id) !== -1; }
    function sees(w, atLoc) {          // l'avatar w peut-il voir le joueur (qui est à atLoc) ?
        if (!w) return false;
        if (cfg.omniscient.indexOf(w.id) !== -1) return true;
        const p = player();
        if (!p) return false;
        if (atLoc && w.loc === atLoc) return true;
        try { return !!(R.hearable && R.hearable(w, p)); } catch (e) { return false; }
    }
    function watchersWho(fn) { return cfg.watchers.map(function (id) { return R.actor(id); }).filter(function (w) { return w && fn(w); }); }
    function ids(list) { return list.map(function (w) { return w.id; }); }
    function pname() { const p = player(); return p ? p.name : 'The player'; }
    function placeName(id) { const p = R.place(id); return p ? p.name : String(id || 'somewhere'); }
    function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

    function add(ev, watchersToTell) {
        ev.t = ev.t || Date.now();
        ev.seen = ids(watchersToTell);
        if (!ev.seen.length) return null;
        events.push(ev);
        while (events.length > cfg.maxEvents) events.shift();
        if (SIGNIF[ev.kind] && typeof cfg.onSignificant === 'function') {
            ev.seen.forEach(function (id) {
                if (Date.now() - (lastWake[id] || 0) < cfg.wakeGapSec * 1000) return;
                lastWake[id] = Date.now();
                try { cfg.onSignificant(id, ev); } catch (e) { /* rien */ }
            });
        }
        return ev;
    }

    // ─── Le joueur ou un avatar arrive quelque part ───
    function onArrive(e) {
        const a = e && e.actor, place = e && e.place;
        if (!a || !place) return;
        const now = Date.now();
        if (a.id === cfg.playerId) {
            const prev = dwell.loc;
            dwell.loc = place.id; dwell.since = now;
            if (prev === place.id) return;
            const here = watchersWho(function (w) { return sees(w, place.id) || w.loc === prev; });
            if (prev) add({ kind: 'move', from: prev, to: place.id, t: now }, here);
            // reparti peu après son arrivée à elle (elle était avec lui dans le lieu qu'il quitte)
            watchersWho(function (w) { return w.loc === prev; }).forEach(function (w) {
                const la = lastArrive[w.id];
                if (la && la.loc === prev && now - la.t < cfg.leaveSec * 1000) add({ kind: 'left_soon', from: prev, to: place.id, ago: Math.round((now - la.t) / 1000), t: now }, [w]);
            });
            // arrivé peu après son départ à elle, au même endroit : il la suit
            watchersWho(function (w) { return w.loc === place.id; }).forEach(function (w) {
                const la = lastArrive[w.id];
                if (la && la.loc === place.id && la.from === prev && now - la.t < cfg.followSec * 1000) add({ kind: 'followed', place: place.id, from: prev, ago: Math.round((now - la.t) / 1000), t: now }, [w]);
            });
        } else if (isWatcher(a.id)) {
            lastArrive[a.id] = { loc: place.id, from: lastLoc[a.id] || null, t: now };
            lastLoc[a.id] = place.id;
        }
    }

    // On retient le lieu de chaque observateur pour savoir D'OÙ il arrive (le registre ne le dit pas)
    const lastLoc = {};
    function initLoc() {
        cfg.watchers.forEach(function (id) { const w = R.actor(id); if (w && lastLoc[id] === undefined) lastLoc[id] = w.loc; });
    }
    R.on('arrive', onArrive);

    // ─── Paroles : il lui a parlé / elle lui a parlé ───
    R.on('speech', function (e) {
        if (!e || !e.actor || e.phone) return;
        const a = e.actor, to = e.to || [];
        if (isWatcher(a.id) && to.indexOf(cfg.playerId) !== -1) {
            unanswered[a.id] = { at: Date.now(), text: clip(e.text, 80), reported: false };
        } else if (a.id === cfg.playerId) {
            cfg.watchers.forEach(function (id) { if (!to.length || to.indexOf(id) !== -1) delete unanswered[id]; });
        }
    });

    // ─── Un objet du joueur le signale (tiroir, ordinateur, télé...) ───
    function noteAction(label, placeId) {
        const p = player();
        if (!p || !label) return;
        const loc = placeId || p.loc;
        add({ kind: 'action', label: clip(label, 60), place: loc }, watchersWho(function (w) { return sees(w, loc); }));
    }

    // ─── Échantillon toutes les 2 s : proximité (près d'elle / parti), arrivées sans événement ───
    function sample() {
        const p = player();
        if (!p) return;
        initLoc();
        const now = Date.now();
        if (dwell.loc === null) { dwell.loc = p.loc; dwell.since = now; }
        cfg.watchers.forEach(function (id) {
            const w = R.actor(id);
            if (!w) return;
            let near = false;
            try { near = !!(R.hearable && R.hearable(w, p)); } catch (e) { near = false; }
            const st = nearState[id] || (nearState[id] = { near: near, since: now, wMoved: false });
            if (near !== st.near) {
                if (!near) {
                    const dur = Math.round((now - st.since) / 1000);
                    if (dur < cfg.nearShortSec && dur >= 3) add({ kind: 'near_short', dur: dur, wMoved: st.wMoved, t: now }, [w]);
                }
                st.near = near; st.since = now;
                const la = lastArrive[id];
                st.wMoved = !!(near && la && now - la.t < 20000);
            }
        });
    }

    // ─── Ce que l'avatar vient d'observer (aucune interprétation) ───
    function ago(ms) {
        const s = Math.round(ms / 1000);
        return s < 15 ? 'just now' : s < 90 ? s + ' seconds ago' : Math.round(s / 60) + ' minutes ago';
    }
    function ordinal(n) { return n + (n === 3 ? 'rd' : n === 2 ? 'nd' : n === 1 ? 'st' : 'th'); }

    function peek(actorId) {
        const w = R.actor(actorId);
        if (!w || !isWatcher(actorId)) return [];
        const now = Date.now(), P = pname();
        const since = lastCommit[actorId] || (now - 10 * 60000);
        const mine = events.filter(function (e) { return e.t > since && e.seen.indexOf(actorId) !== -1; });
        const lines = [];                     // { rank, text } : rank bas = plus important
        const used = { unanswered: false };

        // même observation répétée = une seule ligne avec le nombre de fois (la plus récente sert de modèle)
        const groups = {};
        mine.forEach(function (e) {
            if (e.kind !== 'left_soon' && e.kind !== 'followed' && e.kind !== 'near_short') return;
            const k = e.kind + '|' + (e.from || '') + '|' + (e.to || e.place || '');
            (groups[k] = groups[k] || { e: e, n: 0 }).n++;
            groups[k].e = e;
        });
        Object.keys(groups).forEach(function (k) {
            const e = groups[k].e, n = groups[k].n, rep = n > 1 ? ' This has happened ' + n + ' times.' : '';
            if (e.kind === 'left_soon') lines.push({ r: 0, t: P + ' left ' + placeName(e.from) + ' only ' + e.ago + ' seconds after you arrived there (' + ago(now - e.t) + ').' + rep });
            else if (e.kind === 'followed') lines.push({ r: 0, t: P + ' arrived at ' + placeName(e.place) + ' ' + e.ago + ' seconds after you did, coming from ' + placeName(e.from) + ' (' + ago(now - e.t) + ').' + rep });
            else lines.push({ r: 1, t: P + (e.wMoved ? ' walked away ' + e.dur + ' seconds after you came close' : ' stayed close to you for only about ' + e.dur + ' seconds') + ' (' + ago(now - e.t) + ').' + rep });
        });

        const u = unanswered[actorId];
        if (u && !u.reported && now - u.at > cfg.ignoreSec * 1000 && now - u.at < 5 * 60000) {
            let still = false;
            try { const p = player(); still = !!(p && R.hearable && R.hearable(w, p)); } catch (e) { still = false; }
            lines.push({ r: 0, t: 'You said \u00ab ' + u.text + ' \u00bb to ' + P + ' ' + ago(now - u.at) + ' and ' + P + ' has not answered. ' + (still ? P + ' is still close to you.' : P + ' is no longer close to you.') });
            used.unanswered = true;
        }

        // retours au même endroit (dans la fenêtre), vus par elle
        const cut = now - cfg.windowMin * 60000, byPlace = {};
        events.forEach(function (e) { if (e.kind === 'move' && e.t > cut && e.seen.indexOf(actorId) !== -1) byPlace[e.to] = (byPlace[e.to] || 0) + 1; });
        Object.keys(byPlace).forEach(function (pl) {
            if (byPlace[pl] >= cfg.revisitMin && mine.some(function (e) { return e.kind === 'move' && e.to === pl; })) lines.push({ r: 2, t: P + ' has gone into ' + placeName(pl) + ' ' + byPlace[pl] + ' times in the last ' + cfg.windowMin + ' minutes (this is the ' + ordinal(byPlace[pl]) + ' time).' });
        });

        // simples déplacements récents (les plus récents d'abord, 2 au plus)
        mine.filter(function (e) { return e.kind === 'move' && !(byPlace[e.to] >= cfg.revisitMin); }).slice(-2).reverse().forEach(function (e) {
            lines.push({ r: 3, t: P + ' went from ' + placeName(e.from) + ' to ' + placeName(e.to) + ' (' + ago(now - e.t) + ').' });
        });

        // objets (regroupés : « 3 times »)
        const acts = {};
        mine.filter(function (e) { return e.kind === 'action'; }).forEach(function (e) { const k = e.label + '|' + e.place; (acts[k] = acts[k] || { e: e, n: 0 }).n++; });
        Object.keys(acts).forEach(function (k) { const a = acts[k]; lines.push({ r: 2, t: P + ' ' + a.e.label + (a.n > 1 ? ' (' + a.n + ' times)' : '') + ' in ' + placeName(a.e.place) + ' (' + ago(now - a.e.t) + ').' }); });

        // il reste longtemps au même endroit (signalé une fois par tranche de 5 min)
        const p = player();
        if (p && sees(w, p.loc)) {
            const mins = Math.floor((now - dwell.since) / 60000);
            const bucket = Math.floor(mins / 5);
            if (mins >= cfg.dwellMin && dwellReported[actorId] !== dwell.loc + ':' + bucket) {
                lines.push({ r: 3, t: P + ' has stayed in ' + placeName(p.loc) + ' for about ' + mins + ' minutes without leaving.' });
                pend[actorId] = Object.assign(pend[actorId] || {}, { dwell: dwell.loc + ':' + bucket });
            }
        }

        lines.sort(function (a, b) { return a.r - b.r; });
        pend[actorId] = Object.assign(pend[actorId] || {}, { t: now, unanswered: used.unanswered });
        return lines.slice(0, 5).map(function (l) { return l.t; });
    }

    // La réflexion a réussi : ce qui a été montré ne sera pas répété
    function commit(actorId) {
        const pd = pend[actorId];
        if (!pd) return;
        lastCommit[actorId] = pd.t;
        if (pd.unanswered && unanswered[actorId]) unanswered[actorId].reported = true;
        if (pd.dwell) dwellReported[actorId] = pd.dwell;
        delete pend[actorId];
    }

    function start() { initLoc(); if (!timer && typeof setInterval !== 'undefined') timer = setInterval(sample, 2000); }
    function stop() { clearInterval(timer); timer = null; }
    start();

    return {
        peek: peek, commit: commit, noteAction: noteAction, sample: sample, start: start, stop: stop,
        events: function () { return events.slice(); },               // pour tester : BadTherapistWatch.events()
        debug: function (id) { return peek(id || cfg.watchers[0]); }  // pour tester : ce qu'elle verrait maintenant
    };
}

return { createPlayerWatch: createPlayerWatch };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 10. createBrainLog – journal des réflexions (Ctrl+Alt+B pour le télécharger)  (ex- brain-log.js)
// ═══════════════════════════════════════════════════════════════════════════
const { createBrainLog } = (function () {
// brain-log.js – l'ENREGISTREUR du cerveau des avatars : il garde, pour chaque réflexion d'Evelyn,
//   • ce qu'elle a perçu (le texte exact envoyé à l'IA),
//   • ce que l'IA a répondu (brut), sa pensée, son ressenti, ce qu'elle a écrit dans sa tête (mind),
//   • les actions tentées ET ce que le monde a répondu (« refusé », « fait »...),
//   • la durée, la taille envoyée (≈ quota), les erreurs,
//   • et les moments où elle N'A PAS réfléchi, avec la raison (rien de neuf, budget atteint, occupée...).
// Il est fait pour être ENVOYÉ À CLAUDE : tu joues 10 minutes, tu télécharges le journal, tu me l'envoies, et je vois comment elle pense.
//
// Utilisation (console du navigateur, F12) :
//     BadTherapistBrainLog.download()      -> télécharge un fichier texte (les 25 dernières réflexions)
//     BadTherapistBrainLog.download(60)    -> les 60 dernières
//     BadTherapistBrainLog.show(5)         -> affiche les 5 dernières dans la console
//     BadTherapistBrainLog.clear()         -> repart de zéro
// Raccourci clavier : Ctrl + Alt + B = télécharger le journal.
// Rien n'est envoyé nulle part : tout reste dans ton navigateur (localStorage) jusqu'à ce que TU télécharges le fichier.

const KEY = 'bt_brainlog_v1';
const MAX_ENTRIES = 60;          // réflexions gardées
const MAX_SKIPS = 80;            // « elle n'a pas réfléchi » gardés
const MAX_RAW = 5000;            // caractères gardés de la réponse brute
const MAX_USER = 9000;           // caractères gardés de la perception
const MAX_SYSTEM = 20000;        // le prompt système n'est gardé qu'une fois par avatar (le dernier)

function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
function lsSet(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\n[... coupé : ' + (s.length - n) + ' caractères de plus]' : s; }
function hhmmss(t) { const d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }

function createBrainLog() {
    const saved = lsGet() || {};
    let entries = Array.isArray(saved.entries) ? saved.entries : [];
    let skips = Array.isArray(saved.skips) ? saved.skips : [];
    const systems = (saved.systems && typeof saved.systems === 'object') ? saved.systems : {};
    let saveT = null;

    function persist() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            let ok = lsSet({ entries: entries, skips: skips, systems: systems });
            while (!ok && entries.length > 5) { entries = entries.slice(Math.ceil(entries.length / 4)); ok = lsSet({ entries: entries, skips: skips, systems: systems }); }   // navigateur plein : on garde le plus récent
        }, 800);
    }

    // ─── Une réflexion : begin -> (raw | fail) -> action* -> end ───
    function begin(id, kind, system, user) {
        const e = { at: Date.now(), id: id, kind: kind || 'manual', sysChars: String(system || '').length, userChars: String(user || '').length, user: clip(user, MAX_USER), raw: '', ms: 0, thought: '', feeling: '', mind: null, actions: [], err: '' };
        systems[id] = { at: e.at, text: clip(system, MAX_SYSTEM) };
        const h = {
            raw: function (raw, ms) { e.raw = clip(raw, MAX_RAW); e.ms = ms || 0; },
            fail: function (err) { e.err = String(err && err.message || err || 'erreur').slice(0, 300); push(); },
            action: function (a, res) {
                const args = {}; Object.keys(a || {}).forEach(function (k) { if (k !== 'do') args[k] = typeof a[k] === 'string' ? a[k].slice(0, 200) : a[k]; });
                e.actions.push({ do: a && a.do, args: args, res: String(res == null ? '' : res).slice(0, 300) });
            },
            end: function (plan) {
                e.thought = String((plan && plan.thought) || '').slice(0, 500);
                const m = (plan && plan.mind) || null;
                if (m) { e.feeling = String(m.feeling || '').slice(0, 200); e.mind = JSON.parse(JSON.stringify(m, function (k, v) { return typeof v === 'string' ? v.slice(0, 300) : v; })); }
                push();
            }
        };
        let pushed = false;
        function push() { if (pushed) return; pushed = true; entries.push(e); while (entries.length > MAX_ENTRIES) entries.shift(); persist(); }
        return h;
    }

    // ─── Quand elle n'a PAS réfléchi (une ligne par raison, avec un compteur) ───
    function skip(id, reason) {
        const last = skips[skips.length - 1];
        if (last && last.id === id && last.reason === reason && Date.now() - last.at < 10 * 60000) { last.n++; last.until = Date.now(); persist(); return; }
        skips.push({ at: Date.now(), until: Date.now(), id: id, reason: String(reason).slice(0, 200), n: 1 });
        while (skips.length > MAX_SKIPS) skips.shift();
        persist();
    }

    // ─── Rapport lisible ───
    function text(n) {
        n = n || 25;
        const L = [];
        L.push('JOURNAL DU CERVEAU – ' + new Date().toLocaleString('fr-FR') + ' – ' + entries.length + ' réflexions gardées, ' + n + ' affichées');
        L.push('');
        const ids = Object.keys(systems);
        ids.forEach(function (id) {
            L.push('=== PROMPT SYSTÈME de « ' + id + ' » (' + hhmmss(systems[id].at) + ', ' + systems[id].text.length + ' car.) ===');
            L.push(systems[id].text);
            L.push('');
        });
        const list = entries.slice(-n);
        const totalChars = list.reduce(function (s, e) { return s + e.sysChars + e.userChars; }, 0);
        L.push('=== RÉSUMÉ : ' + list.length + ' réflexions, ≈ ' + Math.round(totalChars / 4) + ' tokens envoyés au total (≈ 4 caractères par token), durée moyenne ' + (list.length ? Math.round(list.reduce(function (s, e) { return s + e.ms; }, 0) / list.length) : 0) + ' ms ===');
        const kinds = {}; list.forEach(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
        L.push('Par type : ' + Object.keys(kinds).map(function (k) { return k + ' ×' + kinds[k]; }).join(', '));
        L.push('');
        list.forEach(function (e, i) {
            L.push('────────── RÉFLEXION ' + (i + 1) + ' – ' + hhmmss(e.at) + ' – ' + e.id + ' – type « ' + e.kind + ' » – ' + e.ms + ' ms – envoyé ≈ ' + Math.round((e.sysChars + e.userChars) / 4) + ' tokens ──────────');
            L.push('[CE QU\'ELLE A PERÇU]');
            L.push(e.user);
            L.push('[RÉPONSE BRUTE DE L\'IA]');
            L.push(e.raw || '(aucune)');
            if (e.err) L.push('[ERREUR] ' + e.err);
            L.push('[PENSÉE] ' + (e.thought || '(vide)') + (e.feeling ? '   [RESSENT] ' + e.feeling : ''));
            if (e.mind) L.push('[MIND] ' + JSON.stringify(e.mind));
            e.actions.forEach(function (a) { L.push('[ACTION] ' + a.do + ' ' + JSON.stringify(a.args) + '  ->  ' + a.res); });
            if (!e.actions.length && !e.err) L.push('[ACTION] (aucune)');
            L.push('');
        });
        if (skips.length) {
            L.push('=== QUAND ELLE N\'A PAS RÉFLÉCHI (les 40 dernières raisons) ===');
            skips.slice(-40).forEach(function (s) { L.push(hhmmss(s.at) + (s.n > 1 ? '–' + hhmmss(s.until) : '') + ' ' + s.id + ' : ' + s.reason + (s.n > 1 ? ' (×' + s.n + ')' : '')); });
        }
        return L.join('\n');
    }

    function download(n) {
        try {
            const blob = new Blob([text(n)], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            const d = new Date();
            a.href = URL.createObjectURL(blob);
            a.download = 'cerveau-evelyn-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.txt';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            return 'téléchargé';
        } catch (e) { return 'échec : ' + (e && e.message || e); }
    }

    function show(n) { console.log(text(n || 5)); }
    function clear() { entries = []; skips = []; Object.keys(systems).forEach(function (k) { delete systems[k]; }); lsSet({ entries: [], skips: [], systems: {} }); }

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', function (ev) { if (ev.ctrlKey && ev.altKey && (ev.key === 'b' || ev.key === 'B')) { ev.preventDefault(); download(); } });
    }

    return { begin: begin, skip: skip, text: text, download: download, show: show, clear: clear, entries: function () { return entries.slice(); }, skips: function () { return skips.slice(); } };
}

return { createBrainLog: createBrainLog };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 11. createEvelynBody – son CORPS 3D dans la rue  (ex- engine/avatar-body.js)
// ═══════════════════════════════════════════════════════════════════════════
const { createEvelynBody } = (function () {
// Modèle Mixamo FBX (avatars/evelyn/), animations, bulle de parole, clic pour lui parler, marche entre deux lieux, regard vers le joueur,
// entrée / sortie de l'immeuble (hall, ascenseur, couloir). Chez elle on ne la voit pas dehors (son corps assis est dans therapist-house.js) ;
// dès qu'elle sort, son corps de rue apparaît à la porte et marche. Elle n'a RIEN en commun avec les corps des PNJ (npcs/driver.js).
//
// Utilisation :  createEvelynBody(scene, { camera, groundH, bus, canvas, renderer, society, THREE, loadMixamoAvatar })  ->  { update(dt), list() }
// (THREE et loadMixamoAvatar sont passés en paramètre par outside.js : ce fichier est chargé aussi par settings.html, SANS « three », et society.js l'importe
//  (import circulaire si on importait society ici). Il ne doit donc importer aucun module 3D.)
// Réglage : si son modèle flotte / s'enfonce, changer height dans DEF.

const DEF = {
    dir: 'avatars/evelyn/', model: 'evelyn.fbx', height: 1.7, interior: true,
    // noms EXACTS (majuscules comprises : GitHub Pages les distingue). Une animation dont le fichier n'existe pas (encore) est ignorée sans 404.
    anims: { walk: 'Walking.fbx', run: 'Running.fbx', sit: 'Sitting.fbx', talk: 'Standing Talking.fbx',
             open: 'OpeningDoor.fbx', close: 'ClosingDoor.fbx', touch: 'touchbutton,takebook,touchelevator.fbx' }
};

// Fichiers qui existent vraiment (assets-manifest.json, réécrit par assets.php) : on ne demande jamais un fichier absent (pas de 404).
let _manifestP = null;
function manifestSet() {
    if (!_manifestP) {
       _manifestP = fetch('assets-manifest.json?v=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (m) { return m && Array.isArray(m.files) ? new Set(m.files.map(function (f) { return String(f && f.path); })) : null; })
            .catch(function () { return null; });
    }
    return _manifestP;
}

const WALK_CHASE = 1.8;       // m/s : quand elle a un nouveau point de repos à rejoindre
const SEE_PLAYER = 10;        // elle se tourne vers toi à moins de 10 m
const FAR_NO_ANIM = 160;      // au-delà, on ne calcule plus l'animation
const BUBBLE_RANGE = 25;      // la bulle de parole n'apparaît qu'à moins de 25 m
const CLICK_RANGE = 12;       // on peut cliquer sur elle pour lui parler à moins de 12 m

function createEvelynBody(scene, o) {
    const society = o.society, R = society.registry;
    const THREE = o.THREE, loadMixamoAvatar = o.loadMixamoAvatar, Bubbles = o.Bubbles || Dialogue;     // THREE et loadMixamoAvatar sont passés par outside.js : ce fichier est aussi chargé par settings.html, qui ne connaît pas « three »
    const camera = o.camera, groundH = o.groundH || function () { return 0; }, bus = o.bus || null;
    const body = { id: 'evelyn', def: DEF, a: null, grp: new THREE.Group(), cur: '', x: null, z: null, heading: 0 };
    const headV = new THREE.Vector3(), feetV = new THREE.Vector3();
    function canvasEl() { return o.canvas || (o.renderer && o.renderer.domElement) || document.querySelector('canvas'); }

    // Bulle de parole : position écran de la tête (elle suit Evelyn). visible = false -> bulle cachée
    function bubbleAt(b, visible) {
        b.scr = null;
        if (!visible || !b.a) { Bubbles.place(b.id, 0, 0, false, undefined, false); return; }
        b.a.root.getWorldPosition(feetV);
        headV.copy(feetV);
        headV.y += b.def.height + 0.28;
        const dist = headV.distanceTo(camera.position);
        if (dist > BUBBLE_RANGE) { Bubbles.place(b.id, 0, 0, false, undefined, false); return; }
        headV.project(camera);
        feetV.project(camera);
        const cv = canvasEl();
        const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const on = headV.z < 1 && Math.abs(headV.x) < 1.1 && headV.y > -1.1 && headV.y < 1.2;
        const hx = r.left + (headV.x * 0.5 + 0.5) * r.width, hy = r.top + (-headV.y * 0.5 + 0.5) * r.height;
        const fy = r.top + (-feetV.y * 0.5 + 0.5) * r.height;
        if (on) b.scr = { x: hx, y: hy, fy: fy, dist: dist };
        Bubbles.place(b.id, hx, hy, on, dist, true);       // Evelyn parle au milieu de l'écran : elle compte comme présente même hors champ
    }

    // Clic sur Evelyn (ou, si la souris est verrouillée, Evelyn au centre de l'écran) : la boîte de réponse s'ouvre
    function onClick(ev) {
        const t = ev.target;
        if (t && t.closest && t.closest('.bt-dlg')) return;
        const cv = canvasEl();
        if (!cv || (!document.pointerLockElement && t !== cv)) return;
        const r = cv.getBoundingClientRect();
        let cx = ev.clientX, cy = ev.clientY;
        if (document.pointerLockElement) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
        const s = body.scr;
        if (!s || s.dist > CLICK_RANGE) return;
        const h = Math.max(40, s.fy - s.y);
        if (Math.abs(cx - s.x) < h * 0.5 && cy > s.y - 30 && cy < s.fy + 12) { const ac = R.actor('evelyn'); Bubbles.talkTo('evelyn', ac ? ac.name : ''); }
    }
    window.addEventListener('click', onClick);

    // Chargement : le modèle et ses animations (seulement les fichiers qui existent vraiment)
    function load() {
        body.grp.visible = false;
        scene.add(body.grp);
        const d = DEF.dir;
        manifestSet().then(function (set) {
            const an = {};
            Object.keys(DEF.anims).forEach(function (k) {
                const p = d + DEF.anims[k];
                if (!set || set.has(p)) an[k] = p;          // fichier absent du dossier : ignoré
                else console.warn('[body evelyn] animation « ' + k + ' » IGNORÉE : « ' + p + ' » n\'est pas dans assets-manifest.json (relance assets.php ou vérifie le nom exact)');
            });
            return loadMixamoAvatar({
                model: d + DEF.model,
                textures: { map: d + 'texture_diffuse.png', normalMap: d + 'texture_normal.png', roughnessMap: d + 'texture_roughness.png', metalnessMap: d + 'texture_metallic.png' },
                animations: an,
                modelAnimation: 'idle',      // l'idle = l'animation contenue dans le .fbx du personnage lui-même
                height: DEF.height
            });
        }).then(function (a) {
            body.a = a;
            body.grp.add(a.root);
            play(body, 'idle');
        }).catch(function (e) {
            console.warn('[body] evelyn n\'a pas pu être chargée :', e && e.message ? e.message : e);
        });
    }

    function play(b, name) {
        if (!b.a || b.cur === name) return;
        const key = b.a.actions && b.a.actions[name] ? name : (name === 'drive' || name === 'talk' || name === 'greet' || name === 'work' || name === 'sleep' ? 'idle' : null);
        if (!key || !b.a.actions[key]) {
            b.missing = b.missing || {};
            if (!b.missing[name] && true) { b.missing[name] = 1; console.warn('[body ' + b.id + '] animation « ' + name + ' » demandée mais absente : le corps garde sa pose précédente (il glisse). Disponibles : ' + Object.keys(b.a.actions || {}).join(', ')); }
            return;
        }
        b.cur = name;
        try { b.a.play(key); } catch (e) { /* animation absente : on garde la précédente */ }
    }

    // ----- intérieur de l'immeuble (hall, ascenseur, couloir) : les lieux ont un point `at` (places/building-feature.js) -----
    // Le corps vit dans la scène principale (x≈0) à l'intérieur, et dans la scène de la rue dehors : on le déplace de l'une à l'autre.
    function atOf(id) { const p = R.place(id); if (!p || !p.at) return null; try { return typeof p.at === 'function' ? p.at() : p.at; } catch (e) { return null; } }
    function lerp(a, c, k) { return a + (c - a) * k; }
    function setFrame(b, f, I) {
        if (b.frame === f) return;
        b.frame = f;
        if (f === 'in') {
            if (!b.grpIn) { b.grpIn = new THREE.Group(); I.parent.add(b.grpIn); }
            b.grpIn.add(b.a.root); b.grpIn.visible = true; b.grp.visible = false;
        } else {
            b.grp.add(b.a.root); if (b.grpIn) b.grpIn.visible = false;
        }
    }
    // Il voit le joueur arriver près de lui : il se tourne (visuel) ET son cerveau est réveillé tout de suite, une fois par approche
    // (au plus une fois par minute) pour qu'il réagisse (parler, penser) sans attendre le tour suivant.
    function notice(b, actor, dp, now) {
        if (dp > 6) { b.seen = false; return; }
        if (b.seen) return;
        b.seen = true;
        if (now - (b.noticedAt || 0) < 60000) return;
        b.noticedAt = now;
        try { society.brains.wake(actor.id, true, 'see'); } catch (e) { /* pas de cerveau */ }
    }
    function interiorStep(b, actor, tr, dt, now) {
        const I = window.BadTherapistInterior;
        if (!I || !I.parent) return false;
        const fromIn = tr ? !!atOf(tr.fromId) : false, toIn = tr ? !!atOf(tr.toId) : false;
        const here = tr ? null : atOf(actor.loc);
        if ((tr && !fromIn && !toIn) || (!tr && !here)) {
            const pl = R.place(actor.loc);
            if (!tr && pl && pl.indoor && b.warnLoc !== actor.loc) { b.warnLoc = actor.loc; console.warn('[body ' + b.id + '] cachée : elle est dans « ' + actor.loc + ' » (intérieur) mais ce lieu n\'a pas de point `at`.'); }
            setFrame(b, 'out', I); delete I.npcs[b.id]; return false;
        }
        let frame, x, y = 0, z, moving = false, hd = b.heading;
        if (tr) {
            const k = Math.max(0, Math.min(1, (now - tr.t0) / (tr.t1 - tr.t0))), fa = atOf(tr.fromId), ta = atOf(tr.toId);
            moving = k < 1;
            if (fromIn && toIn) { frame = 'in'; x = lerp(tr.fx, tr.tx, k); z = lerp(tr.fz, tr.tz, k); y = lerp(fa.y, ta.y, k); }
            else if (fromIn) {                                  // intérieur -> rue : jusqu'à la porte, puis dehors
                if (k < 0.5) { const u = k / 0.5; frame = 'in'; x = lerp(tr.fx, I.inner.x, u); z = lerp(tr.fz, I.inner.z, u); y = fa.y; }
                else { const u = (k - 0.5) / 0.5; frame = 'out'; x = lerp(I.outer.x, tr.tx, u); z = lerp(I.outer.z, tr.tz, u); }
            } else {                                            // rue -> intérieur
                if (k < 0.5) { const u = k / 0.5; frame = 'out'; x = lerp(tr.fx, I.outer.x, u); z = lerp(tr.fz, I.outer.z, u); }
                else { const u = (k - 0.5) / 0.5; frame = 'in'; x = lerp(I.inner.x, tr.tx, u); z = lerp(I.inner.z, tr.tz, u); y = ta.y; }
            }
            if (b.lf === frame && Math.hypot(x - b.lx, z - b.lz) > 0.002) hd = Math.atan2(x - b.lx, z - b.lz);
        } else {
            frame = 'in'; x = here.x; y = here.y; z = here.z;
            if (here.heading !== undefined && b.lf !== 'in') hd = here.heading;
            const dpx = camera.position.x - x, dpz = camera.position.z - z;
            const dpl = Math.abs(camera.position.y - y) < 4 ? Math.hypot(dpx, dpz) : 99;
            notice(b, actor, dpl, now);
            if (dpl < 6) {      // il se tourne vers toi s'il est dans la même pièce
                let diff = Math.atan2(dpx, dpz) - hd; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); hd += diff * Math.min(1, dt * 4);
            }
        }
        b.lf = frame; b.lx = x; b.lz = z; b.heading = hd;
        setFrame(b, frame, I);
        if (frame === 'in') { b.grpIn.position.set(x, y, z); b.grpIn.rotation.y = hd; }
        else { b.grp.visible = true; b.x = x; b.z = z; b.grp.position.set(x, groundH(x, z), z); b.grp.rotation.y = hd; }
        I.npcs[b.id] = frame === 'in' ? { x: x, y: y, z: z, inside: true } : { x: x + I.streetDX, y: 0, z: z + I.streetZ, inside: false };
        const atDoor = moving && frame === 'in' && Math.abs(z - I.doorZ) < 1.6 && Math.abs(x) < 1.6;
        play(b, atDoor ? 'open' : (moving ? 'walk' : (actor.speakingUntil > now ? 'talk' : 'idle')));
        b.a.update(dt);
        bubbleAt(b, true);
        return true;
    }

    function step(dt) {
        const b = body, a = b.a, actor = R.actor('evelyn');
        if (!a || !actor) return;
        const now = Date.now();
        const cam = scene.worldToLocal(camera.position.clone());

        // passagère d'un véhicule : invisible
        const tr = actor.travel;
        if (actor.ride || (tr && tr.mode === 'vehicle')) { b.grp.visible = false; bubbleAt(b, false); return; }

        // dans l'immeuble (hall / ascenseur / couloir) ou en train d'y entrer / d'en sortir
        if (interiorStep(b, actor, tr, dt, now)) return;

        // position
        const place = R.place(actor.loc);
        let moving = false, vis = true;
        if (tr) {
            const k = Math.max(0, Math.min(1, (now - tr.t0) / (tr.t1 - tr.t0)));
            const nx = tr.fx + (tr.tx - tr.fx) * k, nz = tr.fz + (tr.tz - tr.fz) * k;
            const dx = tr.tx - tr.fx, dz = tr.tz - tr.fz;
            if (Math.hypot(dx, dz) > 0.1) b.heading = Math.atan2(dx, dz);
            b.x = nx; b.z = nz;
            moving = k < 1;
            vis = tr.vis !== false;
        } else if (place) {
            const t = society.spot(actor, actor.loc);
            vis = !place.indoor;                      // chez elle : dans la maison, pas dehors
            if (b.x === null || Math.hypot(t.x - b.x, t.z - b.z) > 40) { b.x = t.x; b.z = t.z; }
            else {
                const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
                if (d > 0.15) {
                    const s = Math.min(d, WALK_CHASE * dt);
                    b.x += dx / d * s; b.z += dz / d * s;
                    b.heading = Math.atan2(dx, dz);
                    moving = true;
                }
            }
        }
        b.grp.visible = vis;
        if (!vis) { bubbleAt(b, false); return; }

        // le regard : vers le joueur s'il est tout proche et qu'elle est à l'arrêt
        const dpx = cam.x - b.x, dpz = cam.z - b.z, dp = Math.hypot(dpx, dpz);
        notice(b, actor, dp, now);
        if (!moving && dp < SEE_PLAYER) {
            const want = Math.atan2(dpx, dpz);
            let diff = want - b.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            b.heading += diff * Math.min(1, dt * 4);
        }
        if (bus && bus.collide && b.x !== null) { const c = bus.collide(b.x, b.z, 0.35); b.x = c[0]; b.z = c[1]; }      // le bus est solide
        b.grp.position.set(b.x, groundH(b.x, b.z), b.z);
        b.grp.rotation.y = b.heading;

        // animation
        if (dp < FAR_NO_ANIM) {
            play(b, moving ? 'walk' : (actor.greetUntil > now ? 'greet' : (actor.speakingUntil > now ? 'talk' : 'idle')));
            a.update(dt);
        }
        bubbleAt(b, true);
    }

    load();
    return {
        update: step,
        list: function () { return [{ id: 'evelyn', loaded: !!body.a, visible: body.grp.visible, x: body.x, z: body.z }]; }
    };
}
    return { createEvelynBody };
})();

// ═══════════════════════════════════════════════════════════════════════════
// 12. Dialogue – les BULLES de parole de tout le monde  (ex- engine/speech-bubbles.js, supprimé)
// ═══════════════════════════════════════════════════════════════════════════
// Deux styles, SANS fond (texte lumineux) :
//   • Evelyn : le texte s'écrit AU MILIEU de l'écran, sans nom. Pour lui répondre, un champ s'ouvre juste dessous (tu peux l'ignorer).
//   • Les PNJ (Oliver, Pluie, Violet, Leon, Lou...) : le texte est AU-DESSUS de leur tête, avec leur nom. Même champ de réponse.
// Le texte s'écrit lettre par lettre avec le « blip » de chaque voix. ENTRÉE (ou clic sur l'avatar / sur le petit bouton « Talk ») ouvre la
// réponse, ÉCHAP ou ✕ la ferme (pendant un appel : raccroche). Le texte est inséré avec textContent : rien de ce que dit une IA ne peut casser la page.
// Les corps 3D appellent Dialogue.place(id, x, y, surEcran, distance[, present]) à chaque image ; society.js appelle Dialogue.attach() une fois.
// Réglages : TYPE_MS (vitesse du texte), HOLD_MIN_MS / HOLD_PER_CHAR_MS (durée d'affichage), MID (qui parle au milieu de l'écran + sa couleur).
const Dialogue = (function () {
    const hasDom = typeof document !== 'undefined';
    const REPLY_KEY = 'Enter';
    const REPLY_WINDOW_MS = 90000;     // temps pendant lequel ENTRÉE ouvre la réponse après sa dernière phrase
    const TYPE_MS = (THERAPIST_CONFIG && THERAPIST_CONFIG.bubbleTypeSpeedMs) || 65;   // ms par lettre
    const HOLD_MIN_MS = 9000, HOLD_PER_CHAR_MS = 150, FADE_MS = 1500;
    const TALK_RANGE = 5;              // en dessous de 5 m, le petit bouton « Talk » apparaît
    const PENDING_MS = 60000;          // une phrase dite hors de ta vue t'attend 60 s
    const THINK_MAX_MS = 40000;        // « ... » s'arrête seul si l'avatar ne répond pas
    const ACCENTS = ['#f0c56a', '#7fd1c7', '#f08fa3', '#9db8ff', '#b9e08a', '#d6a2f5'];   // une couleur par PNJ (lueur + nom)
    const MID = { evelyn: '#9db8ff' };                                              // texte AU MILIEU de l'écran (sans nom)
    const SAFE = 'max(12px,env(safe-area-inset-bottom,0px))';

    const boxes = {};
    let replyFn = null, hangUpFn = null, reply = null, phoneEl = null, promptEl = null, audioCtx = null, styled = false, attached = false;

    const CSS = `
.bt-dlg{font-family:Inter,'Segoe UI',system-ui,-apple-system,Roboto,'Helvetica Neue',Arial,sans-serif;--bt-accent:#f0c56a}
.bt-head,.bt-mid{position:fixed;display:none;z-index:205;text-align:center;color:#fff;white-space:pre-wrap;word-wrap:break-word;line-height:1.45;opacity:1;transition:opacity ${FADE_MS}ms ease;
  text-shadow:0 0 3px rgba(0,0,0,.95),0 0 8px var(--bt-accent),0 0 18px var(--bt-accent),0 1px 2px #000}
.bt-head{left:0;top:0;width:max-content;max-width:min(320px,80vw);box-sizing:border-box;pointer-events:auto;cursor:pointer;font-size:clamp(14px,2.2vw,17px);transform:translate(-50%,-100%)}
.bt-mid{left:50%;top:50%;width:max-content;max-width:min(620px,90vw);pointer-events:none;font-size:clamp(17px,2.8vw,22px);transform:translate(-50%,-100%);margin-top:-12px}
.bt-dlg.out{opacity:0;pointer-events:none}
.bt-dlg .n{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--bt-accent);margin-bottom:2px}
.bt-mid .n{display:none}
.bt-mid.named .n{display:block}
.bt-caret{display:inline-block;width:2px;height:1.05em;background:#fff;vertical-align:-0.15em;margin-left:2px;box-shadow:0 0 8px var(--bt-accent);animation:btc .8s steps(1) infinite}
@keyframes btc{50%{opacity:0}}
.bt-talk{position:fixed;left:50%;bottom:calc(${SAFE} + 24px);transform:translateX(-50%);z-index:204;display:none;pointer-events:auto;cursor:pointer;padding:9px 16px;border-radius:999px;
  background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);color:#fff;font-size:14px;font-weight:600;white-space:nowrap;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;
  text-shadow:0 0 8px var(--bt-accent),0 1px 2px #000}
.bt-talk .kc{font-size:11px;margin-left:8px;padding:2px 6px;border:1px solid rgba(255,255,255,.4);border-radius:5px}
@media (hover:none){.bt-talk .kc{display:none}}
.bt-reply{position:fixed;left:50%;top:50%;margin-top:14px;transform:translateX(-50%);z-index:226;display:none;width:min(520px,90vw);box-sizing:border-box;color:#fff}
.bt-reply.on{display:block}
.bt-reply .to{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--bt-accent);text-shadow:0 0 8px var(--bt-accent),0 1px 2px #000;margin:0 0 4px 4px}
.bt-reply .r{display:flex;gap:6px;align-items:center}
.bt-reply input{flex:1;min-width:0;height:42px;box-sizing:border-box;border:0;border-bottom:2px solid var(--bt-accent);border-radius:8px 8px 0 0;background:rgba(0,0,0,.35);color:#fff;font-family:inherit;font-size:16px;padding:0 12px;outline:0;
  text-shadow:0 0 6px var(--bt-accent)}
.bt-reply input::placeholder{color:rgba(255,255,255,.5)}
.bt-reply button{height:42px;min-width:42px;border:0;border-radius:8px;background:rgba(0,0,0,.35);color:#fff;font-size:15px;cursor:pointer;padding:0 10px;text-shadow:0 0 8px var(--bt-accent)}
.bt-reply button:hover{background:rgba(255,255,255,.18)}
.bt-reply .h{font-size:12px;color:var(--bt-accent);text-shadow:0 1px 2px #000;margin:5px 0 0 4px;min-height:0}
.bt-reply .h:empty{display:none}
`;

    function ensureUi() {
        if (!hasDom || styled) return;
        styled = true;
        if (!document.getElementById('bt-pixel-font')) {               // les petites notifications de society.js s'en servent encore
            const l = document.createElement('link');
            l.id = 'bt-pixel-font'; l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(l);
        }
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);
        setInterval(updatePrompt, 150);
        setInterval(updateReply, 250);
    }

    function hashOf(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973; return h; }
    function pitchOf(id) { return 150 + (hashOf(id) % 90); }
    function accentOf(id) { return MID[id] || ACCENTS[hashOf(id) % ACCENTS.length]; }
    function prettyName(id) { id = String(id || ''); return id.charAt(0).toUpperCase() + id.slice(1); }

    // Le « blip » (chaque voix a sa hauteur)
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

    // Machine à écrire (lettre par lettre, curseur, pauses aux virgules et aux points)
    function typeInto(b, host, text, done) {
        const h = { timer: null, i: 0, dead: false };
        host.textContent = '';
        if (!text) { h.dead = true; if (done) done(); return h; }
        const node = document.createTextNode('');
        const caret = document.createElement('span');
        caret.className = 'bt-caret';
        host.appendChild(node); host.appendChild(caret);
        const step = function () {
            if (h.dead) return;
            const c = text.charAt(h.i++);
            node.nodeValue += c;
            if (b.vis && c.trim() !== '' && h.i % 2 === 1) blip(b);
            if (h.i >= text.length) { h.dead = true; caret.remove(); if (done) done(); return; }
            h.timer = setTimeout(step, /[.!?]/.test(c) ? TYPE_MS * 7 : /[,;:]/.test(c) ? TYPE_MS * 3 : TYPE_MS);
        };
        h.cancel = function () { h.dead = true; clearTimeout(h.timer); caret.remove(); };
        h.finish = function () { if (h.dead) return; h.cancel(); host.textContent = text; if (done) done(); };
        step();
        return h;
    }

    function setName(b, name) { if (!name) return; b.name = String(name); b.nameEl.textContent = b.name; }

    function box(id) {
        let b = boxes[id];
        if (b) return b;
        ensureUi();
        const mid = !!MID[id];
        b = boxes[id] = { id: id, mid: mid, el: document.createElement('div'), typing: null, hideT: 0, fadeT: 0, dotsT: 0, thinkEnd: 0, shown: false, vis: false, hover: false, lastAt: 0, lastSeen: 0, pitch: pitchOf(id), near: false, dist: 999, pending: null, name: prettyName(id) };
        b.el.className = 'bt-dlg ' + (mid ? 'bt-mid' : 'bt-head');
        b.el.style.setProperty('--bt-accent', accentOf(id));
        b.nameEl = document.createElement('div'); b.nameEl.className = 'n'; b.nameEl.textContent = b.name;
        b.txtEl = document.createElement('div');
        b.el.appendChild(b.nameEl);
        b.el.appendChild(b.txtEl);
        if (!mid) {
            b.el.addEventListener('mouseenter', function () { b.hover = true; });
            b.el.addEventListener('mouseleave', function () { b.hover = false; });
            b.el.addEventListener('click', function (e) { e.stopPropagation(); Dialogue.talkTo(id); });   // clic sur le texte = répondre
        }
        document.body.appendChild(b.el);
        return b;
    }

    function stopDots(b) { clearInterval(b.dotsT); b.dotsT = 0; b.thinkEnd = 0; }

    function fadeOut(b) {
        clearTimeout(b.hideT);
        if ((reply && reply.open && reply.target === b.id) || b.hover) { b.hideT = setTimeout(function () { fadeOut(b); }, 2500); return; }   // il reste tant que tu lui écris
        b.el.classList.add('out');
        clearTimeout(b.fadeT);
        b.fadeT = setTimeout(function () { b.shown = false; b.el.style.display = 'none'; }, FADE_MS + 100);
    }

    // Petit bouton « Talk » (un seul, en bas au centre) quand un avatar est tout près et ne parle pas
    function buildPrompt() {
        if (promptEl || !hasDom) return promptEl;
        ensureUi();
        const p = document.createElement('div');
        p.className = 'bt-dlg bt-talk';
        p.setAttribute('role', 'button');
        p.innerHTML = '<span class="lb"></span><span class="kc">Enter</span>';
        p.addEventListener('click', function (e) { e.stopPropagation(); if (p.dataset.id) Dialogue.talkTo(p.dataset.id); });
        p.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        document.body.appendChild(p);
        promptEl = p;
        return p;
    }
    function updatePrompt() {
        if (!hasDom || !replyFn) return;
        const now = Date.now();
        let best = null;
        if (!(reply && reply.open)) {
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
        if (p.style.display !== 'block') p.style.display = 'block';
    }

    // Champ de réponse (au milieu, sous le texte d'Evelyn) + texte d'appel téléphonique
    function buildReply() {
        if (reply || !hasDom) return reply;
        ensureUi();
        const root = document.createElement('div');
        root.className = 'bt-dlg bt-reply';
        root.innerHTML = '<div class="to"></div><div class="r"><input type="text" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Say something..."><button type="button" class="s" aria-label="Send">\u21B5</button><button type="button" class="x" aria-label="Close">\u2715</button></div><div class="h"></div>';
        document.body.appendChild(root);
        phoneEl = document.createElement('div');
        phoneEl.className = 'bt-dlg bt-mid named';
        phoneEl.innerHTML = '<div class="n"></div><div class="t"></div>';
        document.body.appendChild(phoneEl);
        reply = { root: root, to: root.querySelector('.to'), hint: root.querySelector('.h'), input: root.querySelector('input'), send: root.querySelector('.s'), close: root.querySelector('.x'),
                  txt: phoneEl.querySelector('.t'), phoneName: phoneEl.querySelector('.n'), call: false, typing: null, dotsT: 0, name: '', target: null, open: false, note: '', noteUntil: 0 };
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
            Dialogue.talkTo(best.id);
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
        if (reply.call) { const f = hangUpFn; reply.call = false; if (f) { try { f(); } catch (e) { /* rien */ } } }   // fermer pendant un appel = raccrocher
        stopPhoneFx();
        phoneEl.style.display = 'none';
        reply.open = false;
        reply.root.classList.remove('on');
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
        if (reply.call) Dialogue.phoneThink(); else Dialogue.think(id);     // « ... » pendant qu'il réfléchit
        Promise.resolve(replyFn(id, text)).then(function (res) {
            if (typeof res === 'string' && /not here|nobody|cannot|do not|unknown|too far/i.test(res)) {
                reply.note = res; reply.noteUntil = Date.now() + 4000;
                if (reply.call) stopPhoneFx(); else if (!b.typing) { stopDots(b); fadeOut(b); }
            }
        }).catch(function () { stopDots(b); });
    }

    function updateReply() {
        if (!hasDom || !replyFn || !reply || !reply.open) return;
        const now = Date.now();
        if (reply.call) { reply.hint.textContent = now < reply.noteUntil ? reply.note : ''; return; }
        const b = boxes[reply.target];
        if (!b || (!b.vis && now - b.lastSeen > 6000)) { closeReply(); return; }      // il est parti / trop loin : on ferme
        reply.hint.textContent = now < reply.noteUntil ? reply.note : '';
    }

    function headOf(id, name, isCall) {
        const r = reply, b = boxes[id];
        const nm = name || (b && b.name) || prettyName(id);
        r.to.textContent = (isCall ? 'On the phone with ' : 'To ') + nm;
        r.root.style.setProperty('--bt-accent', accentOf(id));
        phoneEl.style.setProperty('--bt-accent', accentOf(id));
        r.phoneName.textContent = nm;
    }

    const Dialogue = {
        // Affiche son texte (remplace le précédent de cet avatar). Le paramètre ms ne peut que rallonger la durée.
        say: function (id, name, text, ms) {
            if (!hasDom || !document.body) return;
            text = String(text || '').trim().slice(0, 240);
            if (!text) return;
            const b = box(id);
            if (!b.vis) { b.pending = { name: name, text: text, ms: ms, at: Date.now() }; return; }     // hors de ta vue : il t'attend, au lieu d'être perdu
            b.pending = null;
            clearTimeout(b.hideT); clearTimeout(b.fadeT); stopDots(b);
            if (b.typing) b.typing.cancel();
            setName(b, name);
            b.el.classList.remove('out');
            b.shown = true;
            b.lastAt = Date.now();
            b.el.style.display = 'block';
            b.typing = typeInto(b, b.txtEl, text, function () {
                b.typing = null;
                const hold = Math.max(ms || 0, HOLD_MIN_MS, text.length * HOLD_PER_CHAR_MS);
                b.hideT = setTimeout(function () { fadeOut(b); }, hold);
            });
        },
        // « ... » animés : il réfléchit à ce que tu viens de dire
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
        // Appelé par le corps à chaque image : position écran de la tête (x, y), visible = sur l'écran, dist = distance en m,
        // present (Evelyn seulement) = assez près pour t'entendre même si elle est hors champ
        place: function (id, x, y, visible, dist, present) {
            const vis = (MID[id] && present !== undefined) ? !!present : !!visible;
            let b = boxes[id];
            if (!b && vis && dist != null && dist <= TALK_RANGE) b = box(id);
            if (!b) return;
            b.vis = vis;
            if (vis) b.lastSeen = Date.now();
            b.dist = dist != null ? dist : 999;
            b.near = !!(vis && b.dist <= TALK_RANGE);
            if (vis && b.pending) { const p = b.pending; b.pending = null; if (Date.now() - p.at < PENDING_MS) Dialogue.say(id, p.name, p.text, p.ms); }
            if (!b.shown || !vis) { if (b.el.style.display !== 'none') b.el.style.display = 'none'; return; }
            if (b.el.style.display !== 'block') b.el.style.display = 'block';
            if (b.mid) return;                                             // Evelyn : toujours au milieu de l'écran (CSS)
            const W = window.innerWidth, hw = Math.min(160, b.el.offsetWidth / 2 + 6);
            b.el.style.left = Math.round(Math.max(hw, Math.min(W - hw, x))) + 'px';
            b.el.style.top = Math.round(Math.max(b.el.offsetHeight + 10, y - 8)) + 'px';   // jamais coupé en haut de l'écran
        },
        // Ouvre le champ de réponse pour cet avatar (clic sur lui, sur son texte, sur « Talk », ou ENTRÉE)
        talkTo: function (id, name) {
            if (!hasDom || !replyFn || !id) return;
            const r = buildReply();
            if (r.call) { r.input.focus(); return; }                       // pendant un appel, on parle à celui qui est au bout du fil
            const b = box(id);
            setName(b, name);
            r.target = id; r.open = true;
            headOf(id, b.name, false);
            r.root.classList.add('on');
            try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* rien */ }
            setTimeout(function () { r.input.focus(); }, 30);
            updateReply();
            if (promptEl) promptEl.style.display = 'none';
        },
        // Appel téléphonique : même dialogue, au milieu de l'écran avec le nom de l'interlocuteur
        phoneOpen: function (id, name) {
            if (!hasDom) return;
            const r = buildReply();
            stopPhoneFx();
            r.call = true; r.target = id; r.name = name || id; r.open = true;
            headOf(id, r.name, true);
            r.root.classList.add('on');
            r.txt.textContent = '';
            phoneEl.style.display = 'block';
            phoneEl.classList.remove('out');
            try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* rien */ }
            setTimeout(function () { r.input.focus(); }, 30);
            Dialogue.phoneThink();
        },
        phone: function (id, name, text) {                                  // il parle dans le téléphone
            if (!hasDom) return;
            text = String(text || '').trim().slice(0, 240);
            if (!text) return;
            if (!reply || !reply.call || reply.target !== id) Dialogue.phoneOpen(id, name);
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
        setReply: function (fn) { replyFn = typeof fn === 'function' ? fn : null; },     // fn(avatarId, texte) -> (promesse d')un texte
        closeReply: closeReply,
        stopThink: function (id) { const b = boxes[id]; if (b) stopDots(b); },
        // Il a fini de réfléchir : s'il n'a rien dit, les « ... » disparaissent
        endThink: function (id) { const b = boxes[id]; if (b && b.dotsT) { stopDots(b); fadeOut(b); } },
        active: function (id) { const b = boxes[id]; return !!(b && b.shown); },
        hide: function (id) { const b = boxes[id]; if (b) { if (b.typing) b.typing.cancel(); b.typing = null; stopDots(b); clearTimeout(b.hideT); clearTimeout(b.fadeT); b.shown = false; b.pending = null; b.el.style.display = 'none'; } },
        // Branche tout sur la société (appelé UNE fois par society.js) : paroles, appels, réponse du joueur
        attach: function (ctx) {
            if (!hasDom || attached || !ctx || !ctx.R) return;
            attached = true;
            ensureUi();
            const R = ctx.R, api = ctx.api, pid = function () { return ctx.player().id; };
            R.on('speech', function (e) {
                if (!e || !e.actor || e.actor.isPlayer) return;
                if (e.phone) {                                              // au téléphone : dans la boîte d'appel
                    if (e.to && e.to.indexOf(pid()) !== -1) Dialogue.phone(e.actor.id, e.actor.name, e.text);
                    return;
                }
                Dialogue.say(e.actor.id, e.actor.name, e.text);             // face à face : Evelyn au milieu, un PNJ au-dessus de sa tête
            });
            R.on('call', function (e) {
                const c = e && e.call; if (!c) return;
                const me = pid();
                if (c.from !== me && c.to !== me) return;
                const o = R.actor(c.from === me ? c.to : c.from);
                if (e.state === 'active') Dialogue.phoneOpen(o.id, o.name);
                else if (e.state === 'ended' || e.state === 'missed') Dialogue.phoneClose(o.id);
            });
            Dialogue.setHangUp(function () { api.calls.hangUp(pid()); });
            // Tu réponds (clic, ENTRÉE) : c'est la même action « say » que pour n'importe qui, adressée à cet avatar
            Dialogue.setReply(function (toId, text) { return api.act(pid(), 'say', { to: toId, text: text }); });
        }
    };
    if (typeof window !== 'undefined') window.BadTherapistBubbles = Dialogue;     // pour la console (F12)
    return Dialogue;
})();

// ═══════════════════════════════════════════════════════════════════════════
// 11. NETTOYAGE de l'ancienne tête obsédée + exports
// ═══════════════════════════════════════════════════════════════════════════
// Efface la TÊTE d'Evelyn (Mind : notes, pensées secrètes, envies, humeur, habitudes, fiches des gens, ce qu'elle a fait récemment)
// pour qu'elle reparte avec son nouveau caractère, SANS toucher à l'ancienne mémoire de thérapeute (répondeur, appels, agenda :
// section Mem) ni à ses messages dans ton téléphone. Une sauvegarde de l'ancienne tête est téléchargée avant (evelyn-mind-backup.json).
// Appelé tout seul, une fois par profil (joueur / admin), au démarrage du cloud ; à la main : EvelynCore.purge()  (F12).
function purgeObsession(ctx, force) {
    if (!EVELYN_CORE.purgeOldMind && !force) return false;
    const id = EVELYN_CORE.id;
    let profile = 'player';
    try { profile = (window.BadTherapistSave && window.BadTherapistSave.activeProfile && window.BadTherapistSave.activeProfile()) || 'player'; } catch (e) { profile = 'player'; }
    const flag = 'bt_evelyn_purged_v1_' + profile;
    try { if (!force && localStorage.getItem(flag) === '1') return false; } catch (e) { return false; }
    try {
        const m = Mind.get(id);
        const hasAny = m && (m.notes.length || m.secrets.length || m.thoughts.length || m.will.length || m.habits.length || m.self || m.feeling || Object.keys(m.people || {}).length);
        if (hasAny) {
            try {                                                         // sauvegarde de l'ancienne tête avant de l'effacer
                const blob = new Blob([JSON.stringify({ profile: profile, savedAt: new Date().toISOString(), mind: m }, null, 1)], { type: 'application/json' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'evelyn-mind-backup' + (profile === 'player' ? '' : '-' + profile) + '.json';
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
            } catch (e) { /* pas de téléchargement possible : on efface quand même, c'est ce que tu as demandé */ }
            Mind.purge(id);
        }
        const R = ctx && ctx.R || (window.BadTherapistSociety && window.BadTherapistSociety.registry);
        const a = R && R.actor && R.actor(id);
        if (a) { a.memory = []; if (R.save) R.save(); }                    // « ce que tu as fait récemment » (24 dernières actions)
        localStorage.setItem(flag, '1');
        console.info('[Evelyn] ancienne tête effacée (profil ' + profile + ')' + (hasAny ? ' : sauvegarde téléchargée.' : '.'));
        return true;
    } catch (e) {
        console.warn('[Evelyn] nettoyage impossible :', e && e.message || e);
        return false;
    }
}

if (typeof window !== 'undefined') {
    window.EvelynCore = {
        core: EVELYN_CORE,
        // F12 :  EvelynCore.purge()  -> refait le nettoyage maintenant (et remet le cloud à zéro puis le resynchronise)
        purge: function () {
            const ok = purgeObsession(null, true);
            const cl = window.BadTherapistCloud;
            if (ok && cl) cl.forget().then(function () { return cl.sync(); });
            return ok;
        }
    };
}

export { THERAPIST_CONFIG, EVELYN_CORE, Mind, parsePlan, createBrainSystem, createAutonomy, createPlayerWatch, createBrainLog, startEvelynCloud, createEvelynBody, purgeObsession, Dialogue };
