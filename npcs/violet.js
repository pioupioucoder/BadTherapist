// npcs/violet.js – fiche de Violet (conductrice du bus).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH. Le bus est piloté par engine/bus-line.js (pas par ici).

export default {
    id: 'violet',
    name: 'Violet',
    job: 'bus',

    height: 1.66,
    look: { skin: '#e0b896', shirt: '#3d5a80', pants: '#222428', hair: '#4a2f5a', hairStyle: 'bun' },
    vehicle: 'bus',

    lines: {
        greet: ['Hello.', 'Watch your step.'],
        idle: ['...'],
        work: ['Next stop soon.', 'Hold on tight.'],
        reply: ['Mm-hm.'],
        fallback: ['...'],
        answers: [
            { when: /bus|stop|ticket/i, say: ['This bus follows the line. No detours.'] }
        ]
    },

    routine: []
};
