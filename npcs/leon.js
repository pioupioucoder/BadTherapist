// npcs/leon.js – fiche de Leon (police). La voiture est pilotée par engine/police-service.js (pas par ici).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH.

export default {
    id: 'leon',
    name: 'Leon',
    job: 'police',

    height: 1.8,
    look: { skin: '#d2a883', shirt: '#1f2f55', pants: '#151a2b', hair: '#3a2a1a', hairStyle: 'short', hat: 'cap', hatColor: '#1f2f55', beard: '#3a2a1a' },
    vehicle: 'police',

    lines: {
        greet: ['Officer Leon.', 'Everything all right?'],
        idle: ['Quiet night.', '...'],
        work: ['Keep your distance from the road.', 'Stay out of trouble.'],
        reply: ['Noted.', 'Move along.'],
        fallback: ['...'],
        answers: [
            { when: /help|emergency|police/i, say: ['If it is an emergency, call the police line.'] }
        ]
    },

    routine: []
};
