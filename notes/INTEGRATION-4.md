# INTEGRATION-4 — Station-service + Lou

## Fichiers livrés
- `places/gasstation.js` : remplace l'ancien. Magasin complet, pompes avec écrans, porte + cloche, Lou à son poste.
- `engine/avatar-body.js` : ton fichier + Lou (`DEFS.lou`) + « poste » (la station pilote le corps de Lou).

## Ce que contient le magasin
- Rayons (food, snacks, car, supplies) + frigo boissons (mur ouest, fond lumineux), produits colorés (un seul draw call).
- Comptoir, caisse (écran vert), machine à café, tabouret derrière le comptoir.
- Bidons d'essence rouges : étagère près de la porte + pile dehors. Prix au rayon (bidon + essence majorée).
- Arrière-boutique : lit, table de chevet avec lampe, caisses, tapis. Lou y dort.
- Porte vitrée qui s'ouvre vers l'intérieur + cloche en laiton au-dessus. Cloche = son synthétisé (aucun fichier audio) + balancement.
- Enseigne : OPEN / RING BELL (il dort) / CLOSED (mode away). Vitrines : on voit l'intérieur éclairé depuis dehors.
- Prix très élevés (seul magasin ouvert, même la nuit) : `GAS_CONFIG.fuelPerLiter` et le catalogue en haut du fichier.

## Comment Lou vit (sans API)
Modes choisis au hasard avec une fatigue : `register`, `pumps`, `tidy` (range les rayons), `rest` (assis sur le tabouret), `sleep` (lit), `away` (absent, enseigne CLOSED).
- Il dort quand la fatigue monte, mais pas tout le temps ; il ne retourne pas chez lui : il dort dans le magasin.
- Cloche (quelqu'un ouvre la porte) → il se réveille, court à la caisse, dit bonjour.
- Voiture arrêtée à moins de 5,5 m d'une pompe → il vient, demande « How many liters? », sert (écran de la pompe qui compte), encaisse.
  S'il dort, le moteur finit par le réveiller (8 s).
- Joueur au volant : panneau 10 / 20 / 40 L / plein / nombre libre. Joueur au comptoir : bouton « Buy » → liste du catalogue.
- L'API ne sert QUE quand on lui parle (clic sur Lou = avatar-brain.js, comme pour les autres).

## À brancher (3 petits morceaux)
1. **avatar-body.js** : remplacer par celui fourni. Lou est chargé dès que `R.actor('lou')` existe (voir « fichiers dont j'ai besoin »).
2. **outside.js** : la station doit recevoir le joueur et les véhicules. Après `buildGasStation(...)` :
```js
const gas = buildGasStation(scene, env);
gas.attach({
  vehicles: function () { /* [{ id, x, z, speed, isPlayer, tank:{cap,level}, refuel(l) }] */ return []; },
  charge:   function (buyer, total, why) { return true; },   // brancher l'argent ici (false = refus)
  say:      function (id, text, ms) { /* brancher les bulles de speech-bubbles.js ; sinon légende simple */ }
});
// dans la boucle : gas.update(dt, { camera })
```
3. **Tests console (F12)** : `BadTherapistGas.test.car(0)` (voiture PNJ), `.test.car(1, true)` (voiture du joueur : panneau des litres), `BadTherapistGas.setMode('sleep')`, `.ring()`, `.status()`.
   Si le corps couché ne tombe pas bien sur le lit : `GAS_CONFIG.sleepHeading` et `sleepYOffset`.

## Fichiers dont j'ai besoin pour finir le branchement
- `engine/society.js` + `engine/world-registry.js` : enregistrer Lou (acteur, métier, lieu « gas », objets : caisse, pompes, lit ; capacités : aller à la caisse / dormir / etc.) pour que son cerveau les connaisse. Aujourd'hui `controls()` suppose `actor.id === 'lou'` et `job === 'gas'` ou un lieu qui commence par « gas » : à confirmer.
- `places/outside.js` : où appeler `update()` et d'où viennent la caméra et le taxi.
- `taxi.js` + `objects/vehicle.js` (+ `objects/roadnet.js` si d'autres voitures roulent) : position, vitesse, réservoir pour la détection de voiture et `refuel()`.
- `engine/speech-bubbles.js` : pour que ses phrases scriptées (litres, prix) passent par les vraies bulles.
- `avatars/lou/brain/context.txt` (ton contexte actuel) et `avatars/lou/lou.fbx` si tu veux que je règle la hauteur/pose du sommeil.
- Pour la monnaie du joueur : le fichier qui gère l'argent/l'inventaire (quand il existera). En attendant, chaque vente déclenche `window` event `bt-gas-sale` (détail : lignes, total).

## Contexte court pour Lou (à fusionner dans avatars/lou/brain/context.txt)
```
nom: Lou
metier: pompiste, tient seul la station-service (jour et nuit)
tu es le seul magasin ouvert dans le coin, même la nuit : tes prix sont élevés.
tu dors dans l'arriere-boutique quand tu ne rentres pas chez toi ; la cloche de la porte te reveille.
tu vends l'essence (au litre), des bidons d'essence et les produits des rayons ; tu encaisses a la caisse.
tu fais ce que tu veux de tes journees et de tes nuits.
```
