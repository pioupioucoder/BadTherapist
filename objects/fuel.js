// objects/fuel.js – le RÉSERVOIR d'essence, commun à tous les véhicules (taxi, bus, voiture de police, voitures du joueur…).
//
// Chaque véhicule a un réservoir : une capacité (litres), un niveau, et il consomme en roulant.
// La station-service (places/gasstation.js) lit v.tank.cap / v.tank.level et remplit avec v.refuel(litres).
//
// Dans taxi.js / bus.js / police-car.js / vehicle.js (voir notes/INTEGRATION-4.md) :
//     import { createTank } from './fuel.js';                  // (adapter le chemin)
//     this.tank = createTank({ type: 'taxi' });
//     this.refuel = (l) => this.tank.add(l);                    // appelé par Lou pendant le plein
//     this.fuelPort = { x: 0.95, y: 0.75, z: -1.5 };            // trappe : x = écart latéral, y = hauteur, z = avant(+) / arrière(−) ; la station choisit le côté de la pompe
//   à chaque image, quand le véhicule avance de `d` mètres :   this.tank.consume(d);
//   et s'il est vide :                                         if (this.tank.empty) { /* panne sèche : il ne roule plus */ }

export const FUEL_TYPES = {
    car:    { cap: 50 },
    truck:  { cap: 70 },
    taxi:   { cap: 55 },
    police: { cap: 60 },
    bus:    { cap: 150 }
};
// Autonomie du jeu (mètres pour un plein) : le monde est petit, 12 km = un plein dure assez longtemps pour jouer, assez court pour devoir passer à la station.
export const RANGE_METERS = 12000;

export function createTank(o) {
    o = o || {};
    const base = FUEL_TYPES[o.type] || FUEL_TYPES.car;
    const cap = o.cap || base.cap, range = o.rangeMeters || RANGE_METERS;
    const t = {
        cap: cap,
        level: o.level != null ? o.level : cap * (0.5 + Math.random() * 0.4),
        perMeter: cap / range,
        get empty() { return t.level <= 0.001; },
        get fraction() { return t.level / t.cap; },
        get low() { return t.level < t.cap * 0.15; },
        consume: function (meters) { t.level = Math.max(0, t.level - Math.abs(meters) * t.perMeter); return t.level; },
        add: function (liters) { t.level = Math.min(t.cap, t.level + liters); return t.level; }
    };
    return t;
}
