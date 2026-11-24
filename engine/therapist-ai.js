// therapist-ai.js – VERSION VIDE (l'ancien cerveau de thérapeute d'Evelyn est retiré).
//
// Pourquoi ce fichier existe encore : d'autres fichiers (therapist-house.js, evelyn-phone.js...) font
// « import { createTherapistTalk } from './therapist-ai.js' ». Si le fichier disparaît, ces imports échouent et la maison ne se charge plus.
// Ici, createTherapistTalk() renvoie les mêmes méthodes qu'avant, mais elles ne font plus rien.
//
// Evelyn parle maintenant comme Oliver et Pluie : cerveau commun (avatar-brain.js), bulles (speech-bubbles.js), mémoire (avatar-mind.js).
//
// QUAND TU PEUX LE SUPPRIMER POUR DE BON : cherche d'abord qui l'utilise. Dans le dossier du jeu, en invite de commandes :
//     findstr /s /i /m "therapist-ai" *.js *.html
// Si seul ce fichier est listé, tu peux le supprimer (et therapist-memory.js aussi si plus personne ne l'importe).

export function createTherapistTalk(opts) {
    opts = opts || {};
    const none = function () {};
    return {
        open: none,
        openCall: none,
        openDial: function () { return Promise.resolve({ answered: false }); },   // le téléphone sonne dans le vide : le téléphone commun gère les vrais appels
        getSyncPayload: function () { return Promise.resolve({ context: '', memory: '', playerName: '' }); },
        callMissed: none,
        considerCall: function () { return Promise.resolve(null); },
        close: none,
        endSession: none,
        isOpen: function () { return false; },
        reset: none,
        greetStanding: none,
        nudge: none,
        farewell: none,
        hideBubble: none,
        updateBubble: none
    };
}
