// npcs/lou.js – fiche de Lou (station-service).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH.
//
// Son poste (caisse, pompes, lit, pistolet, service des litres) est piloté par places/gasstation.js (window.BadTherapistGas) : on n'y touche pas.
//
// On ne peut PAS lui répondre librement : il pose une question et le joueur choisit avec des boutons (oui / non, combien de litres...).
// Toutes ses phrases de service sont ici (service) ; gasstation.js choisit la bonne selon la situation :
//
//   greet       : il accueille quelqu'un qui entre         greetBroke : le joueur n'a plus un sou      greetDebt  : le joueur a une dette
//   greetCan    : le joueur a un bidon plein sur lui       greetEmpty : il a un bidon VIDE (Lou propose de le remplir)
//   greetLow    : le véhicule du joueur est presque à sec  greetNight : (réservé)
//   menu        : l'écran de la caisse s'ouvre             browse     : il laisse regarder les rayons
//   confirm     : « vous êtes sûr ? » (oui / non)          thanks     : achat fait            declined : le joueur dit non
//   noCredit    : dette trop grosse, il refuse             invFull    : le joueur n'a plus de place dans son inventaire
//   fillOffer   : il propose de remplir le bidon vide      filled     : bidon rempli          noEmpty    : on lui demande de remplir mais on n'a pas de bidon vide
//   pump        : « combien de litres ? » (à la pompe)     pumpBroke  : pas assez d'argent pour de l'essence    full : le réservoir est déjà plein
//   canTip      : conseil quand on achète un bidon         bell       : réveillé par la cloche      engine : réveillé par un moteur
//   never       : le client part sans rien prendre
// Chaque entrée est une liste : il en tire une au hasard. {n} = un nombre, {total} = le total, {liters} = des litres.

export default {
    id: 'lou',
    name: 'Lou',
    job: 'attendant',

    height: 1.75,
    look: { skin: '#d8b08c', shirt: '#b83232', pants: '#333338', hair: '#2b1b10', hairStyle: 'short', hat: 'cap', hatColor: '#b83232' },
    post: 'BadTherapistGas',

    // bavardage général (utilisé par le moteur des PNJ quand on lui parle ailleurs que à la caisse)
    lines: {
        greet: ['Welcome.', 'Help yourself.'],
        idle: ['...', 'Slow night.', 'Hm.', 'Heater’s been acting up again.'],
        work: ['Prices are what they are.', 'Only shop open for miles.', 'Don’t touch the glass, I just cleaned it.'],
        reply: ['Mm.', 'Sure.', 'If you say so.'],
        fallback: ['...'],
        answers: [
            { when: /fuel|gas|petrol|litre|liter/i, say: ['Pumps are outside. Tell me how much.'] },
            { when: /price|expensive|cost/i, say: ['Nobody else is open. Take it or leave it.'] },
            { when: /can|jerrycan/i, say: ['Cans are by the door. Ten litres each.'] },
            { when: /sleep|bed/i, say: ['The bed in the back is mine. But I don’t mind if you rest.'] }
        ]
    },

    // phrases du service (à la caisse et aux pompes) — séparées de `lines` pour que le moteur des PNJ ne les mélange pas au bavardage
    service: {
            greet: ['Welcome.', 'Hey there. Cold out, huh?', 'Take your time. I’m at the register.', 'Evening.', 'Looking for something?', 'Door’s heavy, I know. Come in.'],
            greetBroke: ['Pockets empty? Look all you want.', 'No cash, huh. I can’t give much credit.', 'Looks like you’re short. Careful what you pick.'],
            greetDebt: ['You still owe me, you know.', 'Your tab is open. Don’t make it bigger.', 'I keep count. I always keep count.', 'Pay me back when you can. Not too late.'],
            greetCan: ['Already got a can on you. Smart.', 'That can will save you a trip.', 'Planning a long drive? Good thinking.'],
            greetEmpty: ['That can’s empty. I can fill it for less than a new one.', 'Empty can? Hand it over, I’ll fill it.', 'Bring that empty can here. Cheaper than buying another.'],
            greetLow: ['Your engine sounds thirsty.', 'You’re running on fumes, aren’t you.', 'That tank doesn’t look far from empty.'],
            menu: ['What do you need?', 'Go ahead.', 'I’m listening.', 'What’ll it be?'],
            browse: ['Look around. Everything has a price.', 'Take what you need. I’ll count it.', 'Shelves are full. Prices are not low.'],
            confirm: ['That’s {total}. You sure?', '{total} for all this. Sure about it?', 'Total is {total}. Do we have a deal?'],
            thanks: ['That’ll be {total}. Thanks.', 'Alright, {total}. Don’t get lost out there.', 'Done. {total}. Come back when you’re hungry.', 'Pleasure. {total}.'],
            declined: ['Suit yourself.', 'Fine. Put it back where you found it.', 'Take your time, then.', 'No problem.'],
            noCredit: ['No more credit. Put something back.', 'You owe me too much already.', 'I can’t carry you any further. Not today.'],
            invFull: ['Your hands are full. Drop something first.', 'You can’t carry more. Make some room.', 'Where would you even put that? Your pockets are full.'],
            fillOffer: ['I can fill it. {total}.', 'Ten litres. {total}. Deal?', 'Fill it up for {total}?'],
            filled: ['There. Full again. {total}.', 'Filled. {total}. Careful with it.', 'Heavy again, isn’t it. {total}.'],
            noEmpty: ['You don’t have an empty can. Buy a new one.', 'Nothing to fill. Bring me a can first.'],
            pump: ['Evening. How many liters?', 'Hey. How much do you need?', 'Fill it up, or just a few liters?', 'Tell me how much. I’ll do the rest.'],
            pumpBroke: ['No cash, no fuel. Sorry.', 'I can’t put that on your tab. Not right now.'],
            full: ['It’s already full.', 'You’re full. Go home.', 'There’s no room left in that tank.'],
            canTip: ['Keep it in the truck. Don’t light a match near it.', 'Ten litres. Pour it in when you’re stuck.', 'Careful, it sloshes. Pour it slowly.'],
            bell: ['Mmh… coming.', 'Yeah, yeah… one second.', 'Coming!'],
            engine: ['A car? Hold on…', 'I hear an engine… coming.'],
            never: ['Never mind, then.', 'Alright.', 'Nothing? Alright.']
    },

    routine: []
};
