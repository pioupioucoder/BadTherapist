// Worker Cloudflare « evelyn-brain » – le cerveau d'Evelyn, avec plusieurs secours.
//
// Il essaie dans l'ordre, jusqu'à ce qu'un cerveau réponde :
//   1. Groq : chaque clé que tu as ajoutée (GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3...), dans le désordre
//      pour répartir la charge, et pour chaque clé 3 modèles (la limite de Groq est PAR modèle).
//   2. Un fournisseur « compatible OpenAI » de ton choix (optionnel) : secrets EXTRA_URL, EXTRA_KEY, EXTRA_MODEL
//      (Cerebras, OpenRouter, Mistral... tous marchent avec ce format).
//   3. Cloudflare Workers AI (Llama 3.3 70B) : il faut le binding « AI » (Settings > Bindings > Workers AI).
// Un cerveau absent (pas de clé, pas de binding) est simplement sauté.

const ALLOWED = ['https://pioupioucoder.github.io', 'http://localhost', 'http://127.0.0.1'];
const GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_GROQ_ATTEMPTS = 6;      // au plus 6 essais Groq avant de passer au secours
const TIMEOUT_MS = 15000;

const reply = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Appel « chat completions » compatible OpenAI (Groq, Cerebras, OpenRouter...)
async function chat(url, key, model, messages, temperature, maxTokens, effort) {
  const payload = { model, messages, temperature, max_tokens: maxTokens };
  if (/gpt-oss/i.test(model)) payload.reasoning_effort = effort;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(payload),
      signal: ctl.signal
    });
    if (!r.ok) {
      const err = new Error(model + ' ' + r.status + ' ' + (await r.text()).slice(0, 160));
      err.status = r.status;
      throw err;
    }
    const d = await r.json();
    const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (!t || !String(t).trim()) throw new Error(model + ' réponse vide');
    return String(t).trim();
  } finally {
    clearTimeout(timer);
  }
}

async function cloudflareAI(env, messages, temperature, maxTokens) {
  const out = await env.AI.run(CF_MODEL, { messages, temperature, max_tokens: maxTokens });
  const t = out && (out.response || (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content));
  if (!t || !String(t).trim()) throw new Error('cloudflare réponse vide');
  return String(t).trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOWED.some(o => origin === o || origin.startsWith(o + ':'));
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

    const wanted = GROQ_MODELS.includes(body.model) ? body.model : GROQ_MODELS[0];
    const turns = (Array.isArray(body.messages) ? body.messages : []).slice(-40);
    const messages = [{ role: 'system', content: String(body.system || '').slice(0, 30000) }].concat(
      turns.map(m => m.role === 'user'
        ? { role: 'user', content: String(m.text || '').slice(0, 2000) }
        : { role: 'assistant', content: JSON.stringify({ say: String(m.text || '').slice(0, 2000) }) })
    );
    const temperature = Math.min(1.2, Math.max(0, Number(body.temperature) || 0.8));
    const maxTokens = Math.min(1500, Number(body.maxOutputTokens) || 1000);
    const effort = ['low', 'medium', 'high'].includes(body.reasoningEffort) ? body.reasoningEffort : 'low';

    const errors = [];
    const done = (text, via) => reply({ text, via }, 200, cors);

    // 1. Groq : toutes les clés trouvées, dans le désordre
    const keys = shuffle(Object.keys(env)
      .filter(k => /^GROQ_API_KEY(_\d+)?$/.test(k))
      .map(k => env[k])
      .filter(v => typeof v === 'string' && v.length > 10));
    const models = [wanted].concat(GROQ_MODELS.filter(m => m !== wanted));
    let attempts = 0;
    for (const key of keys) {
      for (const model of models) {
        if (attempts >= MAX_GROQ_ATTEMPTS) break;
        attempts++;
        try { return done(await chat('https://api.groq.com/openai/v1/chat/completions', key, model, messages, temperature, maxTokens, effort), 'groq'); }
        catch (e) {
          errors.push(String(e.message || e));
          if (e.status === 401 || e.status === 403) break;     // clé refusée : inutile d'essayer ses autres modèles
        }
      }
    }

    // 2. Fournisseur compatible OpenAI de ton choix (optionnel)
    if (env.EXTRA_URL && env.EXTRA_KEY && env.EXTRA_MODEL) {
      try { return done(await chat(env.EXTRA_URL, env.EXTRA_KEY, env.EXTRA_MODEL, messages, temperature, maxTokens, effort), 'extra'); }
      catch (e) { errors.push(String(e.message || e)); }
    }

    // 3. Cloudflare Workers AI
    if (env.AI) {
      try { return done(await cloudflareAI(env, messages, temperature, maxTokens), 'cloudflare'); }
      catch (e) { errors.push(String(e.message || e)); }
    } else {
      errors.push('cloudflare : binding AI absent');
    }

    return reply({ error: 'aucun cerveau disponible', detail: errors }, 502, cors);
  }
};
