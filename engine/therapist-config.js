// therapist-config.js – réglages de l'IA d'Evelyn (cerveau = Groq).
//
// OÙ METTRE QUOI :
//   - Qui est Evelyn, comment elle parle                              : avatars/evelyn/brain/context.txt
//   - Ses phrases d'accueil, de bulle et de secours                  : avatars/evelyn/brain/lines.json
//   - Ce que TOUS les avatars savent du monde (facultatif)           : avatars/_shared/world.txt
//   - Sa mémoire : automatique (therapist-memory.js), exportée avec la sauvegarde du jeu.
//   - La CLÉ Groq : voir ci-dessous.
//
// ⚠ CLÉ API : tout ce qui est dans le jeu (GitHub Pages) est lisible par n'importe qui.
//   Ne mets JAMAIS ta clé dans ce fichier si tu le pousses en ligne. Deux façons propres :
//     1. proxyUrl : un petit serveur à toi (ex. Cloudflare Worker) garde la clé et appelle Groq.
//        Le jeu envoie { system, messages } à cette adresse et attend { text } en retour.
//     2. Fichier therapist-secret.js (NON poussé : ajoute-le à .gitignore) :
//            export const GROQ_API_KEY = 'ta-cle';
//        -> marche seulement sur TON ordinateur / XAMPP.
//   Sans clé ni proxy, Evelyn répond avec ses phrases de secours (lines.json).

// Le dossier de l'avatar dans avatars/ : tout ce qui fait sa personnalité est dans avatars/<AVATAR>/brain/
const AVATAR = 'evelyn';

export const THERAPIST_CONFIG = {
  avatar: AVATAR,
  apiKey: '',                                // laisse vide ; utilise therapist-secret.js ou proxyUrl
  proxyUrl: 'https://evelyn-brain.kristenanjavidy.workers.dev',   // Worker Cloudflare : il garde la clé Groq (aucun secret ici)
  model: 'openai/gpt-oss-120b',              // alternative plus rapide : 'llama-3.1-8b-instant'
  reasoningEffort: 'low',                    // gpt-oss seulement : 'low' | 'medium' | 'high'
  contextFile: 'avatars/' + AVATAR + '/brain/context.txt',
  linesFile: 'avatars/' + AVATAR + '/brain/lines.json',
  worldFile: 'avatars/_shared/world.txt',      // facultatif : le monde commun à tous les avatars (ignoré s'il n'existe pas)
  temperature: 0.8,
  maxOutputTokens: 1000,                     // 'max_tokens' pour Groq ; gpt-oss y compte aussi sa réflexion, ne descends pas trop
  maxHistoryTurns: 12,                       // nombre d'échanges gardés pendant la séance
  maxPlayerChars: 300,                       // longueur max d'un message du joueur
  sessionMinutes: 30,                        // durée prévue d'une séance (Evelyn la surveille en secret et conclut toute seule ; elle peut la changer)
  sessionPrice: '50 dollars',                // le tarif qu'elle a fait accepter au téléphone avant la séance, et qu'elle réclame à la fin
  callTimeScale: 1,                          // 1 = ses délais de rappel sont en heures réelles. Pour tester : 0.02 (« demain » ≈ 30 min... mets 0.001 pour quelques secondes)
  typeSpeedMs: 34,                           // vitesse d'affichage des lettres
  thinkEveryMin: 15,                         // toutes les ~15 min (jeu ouvert), elle décide librement : penser, appeler, laisser un message, ou rien
  lifeEnabled: true,                         // le Worker la fait « vivre » quand le jeu est fermé (messages vocaux, appels décidés seule)
  lifeSyncSec: 120,                          // le jeu se synchronise avec le Worker toutes les 2 min
  evelynNumber: '555-0142',                  // son numéro, affiché sur le téléphone portable
  name: 'EVELYN'                             // nom affiché au-dessus du texte
};
