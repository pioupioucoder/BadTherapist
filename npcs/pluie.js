// npcs/pluie.js – fiche de Pluie.
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH. Plus de cerveau IA.

export default {
    id: 'pluie',
    name: 'Pluie',
    job: 'none',

    height: 1.68,
    look: { skin: '#e3bd9d', shirt: '#7ea6d6', pants: '#44485a', hair: '#2e2a6b', hairStyle: 'long' },

    lines: {
        greet: ['Oh, hi.', 'Hey.'],
        idle: ['...', 'So quiet today.'],
        work: [],
        reply: ['Yeah?', 'Okay.'],
        fallback: ['...'],
        answers: [
            { when: /snow|cold|weather/i, say: ['I like the snow, actually.'] }
        ]
    },

    // Elle sort un peu et rentre. Lieux = ids de society.js (street_front, gas, building...). À adapter.
    routine: [
        { at: '09:00', do: 'go_to', args: { place: 'street_front' } },
        { at: '09:30', do: 'go_to', args: { place: 'gas' } },
        { at: '12:00', do: 'go_to', args: { place: 'street_front' } },
        { at: '13:00', do: 'go_to', args: { place: 'building' } }
    ]
};
