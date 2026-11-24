// npcs/index.js – la liste des PNJ (tous les personnages SAUF Evelyn).
//
// Un PNJ = UNE fiche dans ce dossier (npcs/lou.js, npcs/oliver.js ...). Pour en ajouter un :
//   1. copie npcs/_template.js vers npcs/monpnj.js et remplis-la
//   2. ajoute-le ici (import + une ligne dans LIST)
// Evelyn n'est PAS ici : elle garde son cerveau, sa mémoire et son corps FBX (avatars/evelyn/).
//
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH (dialogue lines included). Code comments can stay in French.

import oliver from './oliver.js';
import pluie from './pluie.js';
import violet from './violet.js';
import leon from './leon.js';
import lou from './lou.js';

const LIST = [oliver, pluie, violet, leon, lou];

export const NPCS = {};
LIST.forEach(function (s) { NPCS[s.id] = s; });

// Utilisé par avatar-brain.js : un PNJ n'a JAMAIS de cerveau IA (aucun appel au Worker, aucune mémoire).
export function isNpc(id) { return Object.prototype.hasOwnProperty.call(NPCS, id); }
