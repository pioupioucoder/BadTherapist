// npcs/oliver.js – fiche d'Oliver (chauffeur de taxi).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH. Plus de cerveau IA : seulement ce qui est écrit ici.
//
// Les courses du taxi continuent de marcher toutes seules (society.js : une demande de course est acceptée après quelques secondes).

export default {
    id: 'oliver',
    name: 'Oliver',
    job: 'taxi',

    height: 1.78,
    look: { skin: '#d8b08c', shirt: '#8b6f47', pants: '#2a2a2e', hair: '#9a9a9a', hairStyle: 'short' },
    vehicle: 'taxi',

    lines: {
        greet: ['Need a ride?', 'Evening.', 'Cold one, huh.'],
        idle: ['Engine is still warm.', '...'],
        work: ['Say where, I drive.', 'Roads are slippery tonight.'],
        reply: ['Mm.', 'If you say so.'],
        fallback: ['...'],
        answers: [
            { when: /taxi|ride|drive|take me/i, say: ['Get in. Pick a stop on the map.'] },
            { when: /snow|cold|weather/i, say: ['It never stops.'] }
        ]
    },

    routine: [
        // exemple (à activer plus tard) :
        // { at: '22:00', do: 'stop_job' },
        // { at: '22:05', do: 'go_to', args: { place: 'building' } },
        // { at: '06:00', do: 'go_to', args: { place: 'street_front' } },
        // { at: '06:10', do: 'start_job' }
    ]
};
