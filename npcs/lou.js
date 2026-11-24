// npcs/lou.js – fiche de Lou (station-service).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH.
//
// Son poste (caisse, pompes, lit, pistolet, service des litres) est piloté par places/gasstation.js (window.BadTherapistGas) : on n'y touche pas.
// Les phrases du service (« how many litres ? ») restent dans gasstation.js pour l'instant ; ici, seulement le bavardage.

export default {
    id: 'lou',
    name: 'Lou',
    job: 'attendant',

    height: 1.75,
    look: { skin: '#d8b08c', shirt: '#b83232', pants: '#333338', hair: '#2b1b10', hairStyle: 'short', hat: 'cap', hatColor: '#b83232' },
    post: 'BadTherapistGas',

    lines: {
        greet: ['Welcome.', 'Help yourself.'],
        idle: ['...', 'Slow night.'],
        work: ['Prices are what they are.', 'Only shop open for miles.'],
        reply: ['Mm.', 'Sure.'],
        fallback: ['...'],
        answers: [
            { when: /fuel|gas|petrol|litre|liter/i, say: ['Pumps are outside. Tell me how much.'] },
            { when: /price|expensive|cost/i, say: ['Nobody else is open. Take it or leave it.'] }
        ]
    },

    routine: []
};
