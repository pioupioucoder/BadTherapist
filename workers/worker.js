// worker.js – cerveau d'Evelyn (Cloudflare Worker) + SA VIE quand le jeu est fermé.
//
// Deux rôles :
//   1. PROXY Groq (comme avant) : le jeu envoie { system, messages } et reçoit { text }.
//   2. VIE : { action: 'sync' | 'ack' | 'leave' | 'forget', id, ... }. Le jeu envoie à Evelyn une copie de ses notes ;
//      un Cron (toutes les 15 min) la fait « penser » toute seule : elle peut laisser un message vocal, programmer
//      un appel, noter des pensées, et choisir QUAND elle repensera au patient. Le jeu récupère tout à la reconnexion.
//
// À CONFIGURER dans Cloudflare (une seule fois) :
//   - Workers & Pages > KV > Create namespace (ex. « evelyn »), puis dans ton Worker > Settings > Bindings :
//       KV namespace, variable name = EVELYN_KV
//   - Worker > Settings > Triggers > Cron Triggers : ajoute  */15 * * * *
//   - tes variables GROQ_KEY_1 ... GROQ_KEY_11 restent comme avant.
// Sans KV ni Cron, le Worker marche comme avant (proxy seulement).

const ALLOWED = ['https://pioupioucoder.github.io', 'http://localhost', 'http://127.0.0.1'];
const MODELS = ['openai/gpt-oss-120b', 'llama-3.1-8b-instant'];

const THINK_DEFAULT_MIN = 180;      // si elle ne dit rien : elle repense au patient dans 3 h
const THINK_MIN = 15, THINK_MAX = 2880;
const MAX_THINKS_PER_TICK = 3;      // limite de sous-requêtes (offre gratuite Cloudflare : 50 par exécution)
const INACTIVE_DAYS = 21;           // elle ne pense plus à un joueur absent depuis 3 semaines (économie de quota)
const MAX_UNHEARD = 5;              // plafond TECHNIQUE de messages non écoutés (anti-spam de quota, pas une règle de caractère)
const ID_RE = /^[a-z0-9-]{16,64}$/;
const TTL = 60 * 24 * 3600;         // un joueur inactif est effacé de KV après 60 jours

const reply = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let keyIndex = 0;

// ─── Groq (rotation des clés) ──────────────────────────────────────
function groqKeys(env) {
  // Toutes les variables GROQ_KEY_<numéro> (pas de limite à 11), dans l'ordre des numéros.
  return Object.keys(env)
    .map((n) => { const m = /^GROQ_KEY_(\d+)$/.exec(n); return m ? { n: Number(m[1]), v: String(env[n] || '').trim() } : null; })
    .filter((x) => x && x.v !== '')
    .sort((a, b) => a.n - b.n)
    .map((x) => x.v);
}

// Clés en pause (mémoire de l'instance du Worker) : clé -> timestamp de reprise.
const cooldown = new Map();
const kid = (k) => k.slice(-8);
const KEY_DEAD = /organization|restricted|blocked|disabled|deactivated|suspended|billing|credit|invalid api key/i;

function retryAfterMs(r, text) {
  const h = Number(r.headers.get('retry-after'));
  if (h > 0) return Math.min(h, 3600) * 1000;
  const m = /try again in\s*(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(text || '');
  if (m && (m[1] || m[2] || m[3])) {
    return Math.min(3600, (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)) * 1000 + 500;
  }
  return 60000;
}

function errMsg(text) {
  try { const j = JSON.parse(text); if (j && j.error && j.error.message) return String(j.error.message); } catch (e) { /* texte brut */ }
  return String(text || '');
}

function fail(message, status, detail, retryAfter) {
  const e = new Error(message);
  e.status = status; e.detail = detail || ''; e.retryAfter = retryAfter || 0;
  return e;
}

async function groq(env, payload, opts) {
  opts = opts || {};
  const keys = groqKeys(env);
  if (!keys.length) throw new Error('Aucune clé Groq configurée dans les variables.');
  const now = Date.now();
  const alive = [];
  keys.forEach((k, i) => { if ((cooldown.get(kid(k)) || 0) <= now) alive.push(i); });
  if (!alive.length) {
    // Toutes les clés sont en pause : on répond tout de suite, sans rien appeler.
    const soon = Math.min(...keys.map((k) => cooldown.get(kid(k)) || 0));
    throw fail('Toutes les clés sont en pause (quota)', 429, keys.length + ' clés en pause', Math.max(1, Math.ceil((soon - now) / 1000)));
  }
  const start = (keyIndex++) % alive.length;
  const tries = Math.min(alive.length, opts.maxTries || 3);
  const errors = [];
  for (let i = 0; i < tries; i++) {
    const idx = alive[(start + i) % alive.length];
    const key = keys[idx];
    const label = 'Clé ' + (idx + 1);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);
    let r, text = '';
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      text = await r.text();
    } catch (e) {
      clearTimeout(timer);
      // Un timeout n'est PAS une raison de changer de clé : l'autre sera aussi lente, et chaque essai consomme du quota.
      throw fail(e && e.name === 'AbortError' ? 'Timeout (trop lente)' : 'Erreur réseau', 504, errors.concat(label + ' : ' + (e && e.name)).join(' | '));
    }
    clearTimeout(timer);

    if (r.ok) {
      let d = null;
      try { d = JSON.parse(text); } catch (e) { /* rien */ }
      const c = d && d.choices && d.choices[0];
      const out = c && c.message ? c.message.content : '';
      if (out && String(out).trim()) return String(out).trim();
      // Réponse vide (souvent : la « réflexion » a mangé tous les max_tokens). Changer de clé ne sert à rien.
      throw fail('Réponse vide', 502, label + ' : vide (finish_reason ' + (c && c.finish_reason) + ')');
    }

    const msg = errMsg(text).slice(0, 240);
    errors.push(label + ' : groq ' + r.status + ' ' + msg);
    if (r.status === 429) {
      cooldown.set(kid(key), Date.now() + retryAfterMs(r, text));       // on saute cette clé tant qu'elle est épuisée
    } else if (r.status === 401 || r.status === 403 || (r.status === 400 && KEY_DEAD.test(msg))) {
      cooldown.set(kid(key), Date.now() + 30 * 60000);                  // clé morte / compte restreint
    } else if (r.status >= 500) {
      cooldown.set(kid(key), Date.now() + 5000);                        // panne Groq : on essaie la suivante
    } else {
      // 400, 413, 422… : c'est NOTRE requête qui est refusée. La renvoyer à d'autres clés ne sert à rien, on s'arrête.
      throw fail('Requête refusée par Groq', r.status === 413 ? 413 : 400, errors.join(' | '));
    }
  }
  throw fail('Toutes les clés ont échoué', 502, errors.join(' | '));
}

// ─── Petits outils ─────────────────────────────────────────────────
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); }

function parseJSON(raw) {
  const t = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* suite */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* rien */ } }
  return null;
}

function humanize(ms) {
  const min = Math.round(Math.abs(ms) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 90) return min + ' min';
  const h = Math.round(min / 60);
  if (h < 48) return h + ' h';
  return Math.round(h / 24) + ' jours';
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function localClock(now, tzOffsetMin) {
  const d = new Date(now - (Number(tzOffsetMin) || 0) * 60000);        // getTimezoneOffset() : positif à l'ouest
  const p = (n) => String(n).padStart(2, '0');
  return DAYS[d.getUTCDay()] + ' ' + p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ', ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

// ─── État d'un joueur (KV : p:<id>) ────────────────────────────────
function newState(id) {
  const now = Date.now();
  return { id, createdAt: now, updatedAt: 0, lastSeenAt: now, tz: 0, gameTime: '', h: '', context: '', memory: '', playerName: '',
           nextThinkAt: now + 45 * 60000, inbox: [], pendingCall: null, leftMsgs: [], thinks: 0 };
}

async function loadState(kv, id) {
  const st = await kv.get('p:' + id, 'json');
  return st && typeof st === 'object' ? st : null;
}
async function saveState(kv, st) {
  st.updatedAt = Date.now();
  await kv.put('p:' + st.id, JSON.stringify(st), { expirationTtl: TTL });
}

// ─── Actions envoyées par le jeu ───────────────────────────────────
async function handleLife(body, env, cors) {
  const kv = env.EVELYN_KV;
  if (!kv) return reply({ error: 'KV non configuré (binding EVELYN_KV)' }, 501, cors);
  const id = String(body.id || '');
  if (!ID_RE.test(id)) return reply({ error: 'bad id' }, 400, cors);
  const now = Date.now();
  let st = await loadState(kv, id);
  let dirty = false;

  if (body.action === 'forget') {
    await kv.delete('p:' + id);
    return reply({ ok: true }, 200, cors);
  }

  if (!st) { st = newState(id); dirty = true; }

  if (body.action === 'sync') {
    const ctx = clip(body.context, 15000), mem = clip(body.memory, 8000), name = clip(body.playerName, 40);
    const h = hash(ctx + '|' + mem + '|' + name);
    if (ctx && h !== st.h) { st.context = ctx; st.memory = mem; st.playerName = name; st.h = h; dirty = true; }
    st.lastSeenAt = now;
    st.tz = Number(body.tz) || 0;
    st.gameTime = clip(body.gameTime, 80);
    if (now - (st.updatedAt || 0) > 5 * 60000) dirty = true;           // économise les écritures KV
  } else if (body.action === 'ack') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length) { st.inbox = st.inbox.filter((m) => !ids.includes(m.id)); dirty = true; }
    if (body.callTaken) { st.pendingCall = null; dirty = true; }
  } else if (body.action === 'leave') {
    const text = clip(body.text, 300).trim();
    if (text) {
      st.leftMsgs.push({ at: now, text });
      st.leftMsgs = st.leftMsgs.slice(-10);
      st.nextThinkAt = Math.min(st.nextThinkAt || Infinity, now + 2 * 60000);   // elle réagira bientôt à ton message
      dirty = true;
    }
  } else {
    return reply({ error: 'unknown action' }, 400, cors);
  }

  if (dirty) await saveState(kv, st);
  return reply({ ok: true, now, inbox: st.inbox, pendingCall: st.pendingCall }, 200, cors);
}

// ─── Evelyn pense toute seule (Cron) ───────────────────────────────
const THINK_RULES =
  '---\nCONTEXTE : TU ES SEULE DANS TON CABINET. Le temps passe. Personne ne te demande rien. Tu fais ce que tu veux de ce moment : ' +
  'ne rien faire, penser à lui, lui laisser un MESSAGE VOCAL sur son répondeur, programmer un APPEL, noter des choses dans ta mémoire. ' +
  'Tu es libre ; tu n\'as aucune obligation de lui écrire ni de l\'appeler.\n' +
  'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans ``` :\n' +
  '{"action":"none","say":null,"call_in_hours":null,"note":null,"next_think_minutes":null,' +
  '"memory":{"remember":[],"forget":[],"private":[],"will":null,"habits":null,"self":null,"feeling":null,"player_name":null}}\n' +
  '- action : "none" (rien), "voicemail" (tu laisses un message vocal : mets-le dans "say", 1 à 4 phrases courtes, tel que tu le dirais au téléphone) ' +
  'ou "call" (tu programmes un appel : "call_in_hours" = dans combien d\'heures, 0.05 = presque tout de suite ; "note" = pourquoi). ' +
  'Un message vocal ET un appel ne se cumulent pas dans la même réflexion.\n' +
  '- next_think_minutes : dans combien de minutes tu repenseras à lui (15 à 2880). Tu choisis ton propre rythme.\n' +
  '- memory : tes décisions sur TA mémoire, comme d\'habitude.\n' +
  'Tu peux t\'appuyer sur l\'heure réelle et sur le temps écoulé depuis qu\'il est parti. Langue du patient (anglais s\'il n\'a encore rien dit).';

async function think(env, st, now) {
  const unheard = st.inbox.filter((m) => m.kind === 'voicemail').length;
  const t = [
    'HEURE RÉELLE chez le patient : ' + localClock(now, st.tz) + '.',
    st.gameTime ? 'Heure dans le jeu au dernier signe de vie : ' + st.gameTime + '.' : '',
    'Dernier signe du patient dans le jeu : il y a ' + humanize(now - (st.lastSeenAt || now)) + '.',
    unheard ? 'Tu as déjà laissé ' + unheard + ' message(s) vocal(aux) qu\'il n\'a pas encore récupéré(s).' : '',
    st.pendingCall ? 'Tu as déjà programmé un appel.' : '',
    st.leftMsgs.length ? 'Messages qu\'il t\'a laissés sur ton répondeur (tu les lis maintenant) :\n' +
      st.leftMsgs.map((m) => '  - « ' + m.text + ' » (il y a ' + humanize(now - m.at) + ')').join('\n') : ''
  ].filter(Boolean).join('\n');

  const system = [st.context, st.memory, t, THINK_RULES].filter(Boolean).join('\n\n');
  const payload = {
    model: MODELS[0],
    messages: [{ role: 'system', content: system }, { role: 'user', content: '[Silence dans le cabinet. Le temps passe.]' }],
    temperature: 0.9,
    max_tokens: 1000,
    reasoning_effort: 'low'
  };
  const raw = await groq(env, payload, { timeoutMs: 25000, maxTries: 3 });
  const o = parseJSON(raw);
  st.thinks = (st.thinks || 0) + 1;
  st.leftMsgs = [];                                         // elle les a lus
  if (!o || typeof o !== 'object') { st.nextThinkAt = now + 60 * 60000; return; }

  const mem = o.memory && typeof o.memory === 'object' ? o.memory : null;
  if (mem) st.inbox.push({ id: uid(), at: now, kind: 'thought', text: '', memory: mem });

  if (o.action === 'voicemail' && typeof o.say === 'string' && o.say.trim() && unheard < MAX_UNHEARD) {
    st.inbox.push({ id: uid(), at: now, kind: 'voicemail', text: clip(o.say.replace(/\s+/g, ' ').trim(), 500) });
  } else if (o.action === 'call') {
    const h = clamp(Number(o.call_in_hours) || 0.05, 0.02, 720);
    st.pendingCall = { dueAt: now + h * 3600000, note: clip(o.note, 160) };
  }
  const nm = clamp(Number(o.next_think_minutes) || THINK_DEFAULT_MIN, THINK_MIN, THINK_MAX);
  st.nextThinkAt = now + nm * 60000;
  st.inbox = st.inbox.slice(-20);
}

async function tick(env) {
  const kv = env.EVELYN_KV;
  if (!kv) return;
  const now = Date.now();
  let cursor, thinks = 0;
  do {
    const l = await kv.list({ prefix: 'p:', cursor, limit: 100 });
    for (const k of l.keys) {
      if (thinks >= MAX_THINKS_PER_TICK) return;
      const st = await kv.get(k.name, 'json');
      if (!st || !st.context) continue;
      if (now - (st.lastSeenAt || 0) > INACTIVE_DAYS * 86400000) continue;
      if (now < (st.nextThinkAt || 0)) continue;
      thinks++;
      try { await think(env, st, now); }
      catch (e) { st.nextThinkAt = now + 30 * 60000; }      // l'IA ne répond pas : elle réessaiera plus tard
      await saveState(kv, st);
    }
    cursor = l.list_complete ? undefined : l.cursor;
  } while (cursor);
}

// ─── Entrées du Worker ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOWED.some((o) => origin === o || origin.startsWith(o + ':'));
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ error: 'POST only' }, 405, cors);
    if (!ok) return reply({ error: 'forbidden' }, 403, cors);

    let body;
    try { body = await request.json(); } catch (e) { return reply({ error: 'bad json' }, 400, cors); }

    if (body && body.action) return handleLife(body, env, cors);

    // proxy Groq (comme avant)
    const model = MODELS.includes(body.model) ? body.model : MODELS[0];
    const turns = (Array.isArray(body.messages) ? body.messages : []).slice(-40).filter((m) => m && String(m.text || '').trim());
    const messages = [{ role: 'system', content: String(body.system || '').slice(0, 20000) }].concat(
      turns.map((m) => m.role === 'user'
        ? { role: 'user', content: String(m.text || '').slice(0, 2000) }
        : { role: 'assistant', content: JSON.stringify({ say: String(m.text || '').slice(0, 2000) }) })
    );
    const payload = {
      model, messages,
      temperature: Math.min(1.2, Math.max(0, Number(body.temperature) || 0.8)),
      max_tokens: Math.min(1200, Number(body.maxOutputTokens) || 1000)
    };
    if (/gpt-oss/i.test(model)) payload.reasoning_effort = ['low', 'medium', 'high'].includes(body.reasoningEffort) ? body.reasoningEffort : 'low';

    try {
      return reply({ text: await groq(env, payload) }, 200, cors);
    } catch (e) {
      const noKey = /Aucune clé/.test(e.message);
      if (noKey) return reply({ error: e.message }, 500, cors);
      const status = e.status === 429 ? 429 : (e.status === 400 || e.status === 413) ? e.status : e.status === 504 ? 504 : 502;
      const h = e.retryAfter ? { ...cors, 'Retry-After': String(e.retryAfter) } : cors;
      return reply({ error: e.message, detail: e.detail || '', retryAfter: e.retryAfter || 0 }, status, h);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  }
};

export { tick, think, handleLife };   // utile pour les tests
