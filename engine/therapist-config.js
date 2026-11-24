// therapist-config.js – réglages de l'IA d'Evelyn (cerveau = Groq via le Worker Cloudflare « evelyn-brain »).
//
// OÙ METTRE QUOI :
//   - Qui est Evelyn, comment elle parle                              : avatars/evelyn/brain/context.txt
//   - Ses phrases d'accueil, de bulle et de secours                  : avatars/evelyn/brain/lines.json
//   - Ce que TOUS les avatars savent du monde (facultatif)           : avatars/_shared/world.txt
//   - Sa mémoire : automatique (therapist-memory.js), exportée avec la sauvegarde du jeu.
//   - La CLÉ : uniquement dans la variable Cloudflare GEMINI_KEY. JAMAIS dans ce fichier ni dans un message.
//
// ⚠ Tout ce qui est dans le jeu (GitHub Pages) est lisible par n'importe qui.

// Le dossier de l'avatar dans avatars/ : tout ce qui fait sa personnalité est dans avatars/<AVATAR>/brain/
const AVATAR = 'evelyn';

export const THERAPIST_CONFIG = {
  avatar: AVATAR,
  apiKey: '',                                // laisse vide
  proxyUrl: 'https://evelyn-brain.kristenanjavidy.workers.dev',   // Worker Cloudflare : il garde la clé (aucun secret ici)
  model: 'llama-3.3-70b-versatile',          // le Worker ignore ce champ : le vrai modèle d'Evelyn se règle avec la variable EVELYN_MODEL dans Cloudflare
  reasoningEffort: 'low',
  contextFile: 'avatars/' + AVATAR + '/brain/context.txt',
  linesFile: 'avatars/' + AVATAR + '/brain/lines.json',
  worldFile: 'avatars/_shared/world.txt',
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
  aiBubbles: false,        // phrases au-dessus de sa tête quand tu es debout (sinon : lines.json)
  aiGreeting: false,       // accueil écrit par l'IA à l'ouverture de la séance (sinon : lines.json)
  reflectOnOpen: false,    // bilan de la séance précédente à l'ouverture (le bilan à la fin de séance reste actif)
  aiImpulse: false,        // Evelyn décide seule d'appeler / laisser un message
  lifeEnabled: false,      // plus de « vie » quand le jeu est fermé
  lifeSyncSec: 120,

  // Le cerveau commun (avatar-brain.js). Seule Evelyn en a un : Oliver, Pluie et les autres sont des PNJ sans IA.
  avatarsEnabled: true,
  avatarThinkSec: 90,        // elle réfléchit environ toutes les 90 s (avant : 300)
  avatarIdleMax10min: 5,     // réflexions « seule » max par 10 min (avant : 2)
  avatarStageMeters: 400     // elle compte comme « près de toi » jusqu'à 400 m (avant : 150)
};
