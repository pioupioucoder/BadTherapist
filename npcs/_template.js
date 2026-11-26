// npcs/_template.js – modèle de fiche PNJ. Copie ce fichier, renomme-le, remplis-le, puis ajoute-le dans npcs/index.js.
//
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH (lines below included). Never write French in "lines".
//
// Tout ce qui touche à ce personnage est ICI : apparence, dialogues, routine. Rien d'autre à modifier dans le moteur.

export default {
    id: 'monpnj',            // identique à l'id de l'acteur dans society.js (R.addActor({ id: 'monpnj', ... }))
    name: 'My NPC',
    job: 'none',

    // ───────── CORPS (npcs/driver.js, section « Le corps ») ─────────
    height: 1.75,
    look: {
        skin: '#d8b08c', shirt: '#6b7a8f', pants: '#2a2a30', hair: '#3a2a1a',
        hairStyle: 'short',  // 'short' | 'long' | 'bun' | 'bald'
        // hat: 'cap', hatColor: '#1f2f55',
        // beard: '#2a1a0a',          // couleur de barbe (absent = pas de barbe)
        // glasses: true,
        // widen: 1.1                 // 1 = normal, plus grand = plus large
    },
    // Optionnel : change la forme à la main. body.parts = { hips, torso, head, armL, armR, legL, legR }, body.mats = { skin, shirt, pants, hair, shoe }
    // customize(body, THREE) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), body.mats.shirt); m.position.set(0, 0.3, 0.12); body.parts.torso.add(m); },

    // ───────── VÉHICULE / POSTE (au choix, ou rien) ─────────
    // vehicle: 'taxi' | 'bus' | 'police',     // il conduit ce véhicule quand son métier (actor.job) est le même
    // post: 'BadTherapistGas',                // un lieu pilote son corps (window[post].pose())

    // ───────── DIALOGUES (anglais) ─────────
    lines: {
        greet: ['Hello.'],                    // quand tu arrives près de lui
        idle: ['...'],                        // de temps en temps, tout seul
        work: [],                             // phrases liées à son travail (mélangées aux idle)
        reply: ['Hm.'],                       // quand tu lui réponds (clic sur lui)
        fallback: ['...'],
        answers: [                            // réponses selon un mot de ta phrase (regex SANS le drapeau g)
            // { when: /weather|snow/i, say: ['Cold, isn\'t it?'] }
        ]
    },

    // ───────── ROUTINE (actions déjà existantes dans society.js : go_to, start_job, stop_job, use_object, say, wait) ─────────
    // Trie par heure. Heure du jeu si window.BadTherapistGameTime existe, sinon heure réelle.
    routine: [
        // { at: '09:00', do: 'go_to', args: { place: 'street_front' } },
    ]
};
