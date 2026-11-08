// therapist-config.js – réglages de l'IA d'Evelyn (cerveau = Groq).
//
// OÙ METTRE QUOI :
//   - Qui est Evelyn, comment elle parle, ce qu'elle sait du monde : json/therapist/context.txt
//   - Ses phrases d'accueil, de bulle et de secours                  : json/therapist/lines.json
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

export const THERAPIST_CONFIG = {
  apiKey: '',                                // laisse vide ; utilise therapist-secret.js ou proxyUrl
  proxyUrl: 'https://evelyn-brain.kristenanjavidy.workers.dev',   // Worker Cloudflare : il garde la clé Groq (aucun secret ici)
  model: 'openai/gpt-oss-120b',              // alternative plus rapide : 'llama-3.1-8b-instant'
  reasoningEffort: 'low',                    // gpt-oss seulement : 'low' | 'medium' | 'high'
  contextFile: 'json/therapist/context.txt',
  linesFile: 'json/therapist/lines.json',
  temperature: 0.8,
  maxOutputTokens: 1000,                     // 'max_tokens' pour Groq ; gpt-oss y compte aussi sa réflexion, ne descends pas trop
  maxHistoryTurns: 12,                       // nombre d'échanges gardés pendant la séance
  maxPlayerChars: 300,                       // longueur max d'un message du joueur
  typeSpeedMs: 34,                           // vitesse d'affichage des lettres
  name: 'EVELYN'                             // nom affiché au-dessus du texte
};
