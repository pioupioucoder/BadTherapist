# INTEGRATION-4 — Station-service + Lou (v3)

## Fichiers livrés (à copier)
- `places/gasstation.js` : station complète (voir ci-dessous).
- `engine/avatar-body.js` : **TA version** (Leon, police) + Lou. Remplace celui d'avant que je t'avais donné.
- `objects/fuel.js` : réservoir d'essence commun à tous les véhicules (NOUVEAU).

## Pourquoi tu ne voyais pas Lou
1. Ton avatar-body n'avait pas Lou (tu avais gardé ta version avec Leon). C'est corrigé : même fichier, Lou ajouté.
2. Lou n'est pas enregistré dans `society.js` : maintenant il est **visible quand même** (le poste de la station le pilote sans acteur). Il ne pourra pas encore parler (API) tant qu'il n'est pas enregistré.
3. Rien d'autre à brancher pour le voir : `gasstation.js` se chronomètre tout seul, et avatar-body lui donne la position du joueur et la liste des véhicules (taxi, bus, police).

## Ce qui a changé dans la station
- **Cloche** : lamelle de clochettes fixée EN HAUT DE LA PORTE (côté intérieur). Elles se balancent quand la porte bouge et tintent (« ting-a-ling ») à l'ouverture, plus doucement à la fermeture. Ça réveille Lou s'il dort.
- **Pompes** : tuyau noir qui pend + pistolet rouge/gris sur son support. Écran 3 lignes (LITERS / PRICE / prix au litre) qui se remplit comme en vrai : le débit monte, puis ralentit à la fin.
- **Service** : Lou va à la voiture → demande les litres → va chercher le pistolet à la pompe → l'amène à la trappe d'essence → pistolet dans le réservoir (clac) → plein → le rapporte → encaisse.
  Il place le pistolet à la TRAPPE du véhicule (côté de la pompe), selon sa position et son cap. Si le tuyau n'arrive pas (plus de 6 m) : « Pull up closer to the pump. »
- **Litres** : le joueur choisit (10 / 20 / 40 / plein / nombre libre) ; un avatar conducteur choisit lui-même (`v.wantLiters(libre)`, sinon 60–100 % du vide). Le plein s'arrête au réservoir plein. Bidons : au magasin (bouton « Buy » à la caisse).
- Besoin d'essence : `objects/fuel.js` (capacités : voiture 50 L, taxi 55, police 60, bus 150 ; autonomie réglable `RANGE_METERS`).

## Brancher le réservoir dans les véhicules (j'ai besoin de leurs fichiers)
Dans chaque véhicule (taxi, bus, police-car, vehicle) :
```js
import { createTank } from './fuel.js';          // chemin à adapter
this.tank = createTank({ type: 'taxi' });
this.refuel = (l) => this.tank.add(l);
this.fuelPort = { x: 0.95, y: 0.75, z: -1.5 };   // trappe (à régler par modèle)
// à chaque image, quand il avance de d mètres : this.tank.consume(d); si this.tank.empty -> panne sèche
```
Tant que ce n'est pas fait, la station donne un réservoir factice (10–40 %) à chaque véhicule, donc le plein fonctionne déjà.

## taxi.js : le ranger dans `objects/`
Le fichier est à la racine du projet (`taxi.js`). Pour le déplacer proprement il faut corriger ses `import` (`./` → `../`) et ceux qui l'importent.
Commandes (depuis la racine) :
```
git mv taxi.js objects\taxi.js
findstr /s /n /i "taxi.js" *.js *.html
```
Envoie-moi `taxi.js`, `places/outside.js` et chaque fichier que `findstr` liste : je te les rends corrigés.

## Tests dans la console (F12)
`BadTherapistGas.test.car(0)` voiture PNJ à la pompe 0 · `.test.car(1, true)` voiture du joueur (panneau des litres) · `.test.car(1, false, 1.57)` cap de la voiture (radians) · `.setMode('sleep')` · `.ring()` · `.status()`
Corps couché pas bien posé sur le lit : `BadTherapistGas.config.sleepHeading` / `.sleepYOffset`.

## Fichiers dont j'ai encore besoin
- `taxi.js`, `objects/vehicle.js`, `objects/bus.js`, `objects/police-car.js` : réservoir, trappe, `getPose()` (cap, vitesse), qui conduit (le joueur ou un avatar).
- `places/outside.js` (et `places/index.js` si c'est lui qui construit la station) : appel de `update`, véhicules du joueur.
- `engine/society.js` + `engine/world-registry.js` : enregistrer Lou (acteur, objets : caisse / pompes / lit, capacités) pour qu'il parle avec l'API et que les autres avatars le connaissent.
- `engine/speech-bubbles.js` : pour que ses phrases (litres, prix) passent par les vraies bulles.
- `avatars/lou/brain/context.txt` actuel, `places/store.js` (je ne sais pas ce que c'est : un autre magasin ?).
- Le fichier d'argent/inventaire du joueur (quand il existera) : chaque vente envoie l'événement `bt-gas-sale` (litres, lignes du panier, total).
