// ==========================================
// BAD THERAPIST — PLAN DES NOUVEAUX LIEUX (places/layout.js)
// ==========================================
// Uniquement des données : positions des lieux et tracés des routes.
// Le repère est celui de immeuble.js (l'immeuble est à z = -29, la route principale part vers +z).
// Pour déplacer un lieu, change ses x / z ici (et les points de sa route plus bas).
//
//   town    : ville de montagne (journaux, basilique, magasin...)   -> par la route de montagne
//   gas     : station-service, sur une route à part
//   station : petite gare au bord du pont (train vers la ville B), au bout de la route de la forêt
//   cityB   : ville avec bibliothèque, police et prison (accessible seulement en train)
//   port    : port, tout au sud, au bout d'une autre route

export const SEA = { z0: 2015, y: -1.3, floor: -9 };       // la mer commence à z = SEA.z0

export const PLACES = {
  gas: { x: 345, z: 335, r: 60 },
  town: { x: 0, z: 1565, r: 150 },
  station: { x: 925, z: 905, r: 75 },
  cityB: { x: 790, z: 1800, r: 150 },
  port: { x: 450, z: 1975, r: 100 }
};

// Massif de montagne (autour de la route de montagne)
export const MASSIF = { x: -10, z: 980, rx: 280, rz: 520, height: 118 };

// Routes ajoutées. Le premier point de chaque route est pris sur la route "from" (jonction automatique).
//   kind : 'road' (route normale), 'mountain' (route de falaise), 'street' (rue de ville), 'rail' (voie ferrée)
export const ROAD_DEFS = [
  // Station-service : prolonge le petit chemin de l'est
  {
    name: 'gas', kind: 'road', hw: 4.5, from: { road: 'lane', end: true },
    ctrl: [[140, 276], [208, 302], [280, 322], [345, 335]], site: 'gas'
  },

  // Route de montagne : longue montée en lacets doux, falaise à droite (à l'ouest) sans aucun rebord
  {
    name: 'mount', kind: 'mountain', hw: 4.2, from: { road: 'cross', end: true },
    ctrl: [
      [-62, 585], [-30, 665], [-95, 735], [-135, 810], [-60, 880], [10, 935], [-55, 1010],
      [-120, 1085], [-55, 1160], [20, 1215], [-40, 1290], [-110, 1345], [-60, 1410],
      [-8, 1455], [0, 1500], [0, 1560], [0, 1620], [0, 1685]
    ],
    site: 'town', peak: 78, cliffFrom: 140, cliffTo: 1300
  },
  // Rue transversale de la ville de montagne
  { name: 'townx', kind: 'street', hw: 6, flat: 'town', ctrl: [[-110, 1595], [-50, 1595], [0, 1595], [60, 1595], [110, 1595]] },

  // Route de la forêt sombre, jusqu'au pont et à la gare
  {
    name: 'forest', kind: 'road', hw: 4.5, from: { road: 'main', s: 560 },
    ctrl: [
      [300, 478], [372, 508], [462, 500], [560, 505], [648, 545], [738, 606], [815, 648],
      [872, 662], [915, 690], [930, 770], [932, 850], [928, 905]
    ],
    site: 'station', bridge: { half: 24, hump: 2.6 }
  },

  // Voie ferrée : sous le pont, puis jusqu'à la ville B
  {
    name: 'rail', kind: 'rail', hw: 2.4, wall: 11,
    ctrl: [[868, 150], [866, 300], [870, 450], [872, 560], [871, 662], [876, 780], [882, 900], [884, 1050], [876, 1250], [862, 1500], [852, 1700], [850, 1830]],
    trench: { near: [871, 662], depth: 6.6 }
  },

  // Route du port (part de la route de la forêt)
  {
    name: 'port', kind: 'road', hw: 4.5, from: { road: 'forest', near: [560, 505] },
    ctrl: [
      [548, 600], [510, 720], [468, 850], [474, 990], [452, 1130], [425, 1270], [455, 1410],
      [492, 1550], [468, 1690], [440, 1820], [450, 1900], [450, 1975]
    ],
    site: 'port'
  },
  { name: 'portx', kind: 'street', hw: 6, flat: 'port', ctrl: [[370, 1975], [410, 1975], [450, 1975], [490, 1975], [530, 1975]] },

  // Ville B : deux rues
  { name: 'bmain', kind: 'street', hw: 6, flat: 'cityB', ctrl: [[790, 1690], [790, 1750], [790, 1810], [790, 1870], [790, 1920]] },
  { name: 'bx', kind: 'street', hw: 6, flat: 'cityB', ctrl: [[660, 1800], [725, 1800], [790, 1800], [835, 1800]] }
];

// Destinations du taxi (aucun nom : seulement une icône). road = route où il s'arrête, s = abscisse (ou 'end' / 'start').
export const TAXI_STOPS = [
  { id: 'home', type: 'home', road: 'drive', s: 38 },
  { id: 'work', type: 'work', road: 'main', s: 'end' },
  { id: 'town', type: 'town', road: 'townx', s: 'mid' },
  { id: 'gas', type: 'gas', road: 'gas', s: 'end' },
  { id: 'station', type: 'train', road: 'forest', s: 'end' },
  { id: 'port', type: 'port', road: 'portx', s: 'mid' }
];
