# Étape 3 (terminée) — avatars libres : Oliver, Pluie, Evelyn

## Fichiers à copier (remplacent ceux du même nom)
engine/  : world-registry.js, messaging.js, avatar-brain.js, society.js, avatar-body.js (NOUVEAU),
           phone-service.js, phone-app.js, life-sync.js  (+ 3 petits fichiers de compatibilité : evelyn-phone.js, evelyn-life.js, phone-item.js)
places/  : outside.js et apartment.js  -> COPIES COMPLÈTES de tes fichiers avec les lignes ajoutées (rien à éditer à la main)

Ce que contiennent les deux fichiers places/ en plus de tes versions :
  outside.js   : 2 imports, createTaxi avec freeDriver:true et onRideRequest, society.attachTaxi(taxi), createBodies(...), bodies.update(dt)
  apartment.js : 1 ligne reportPlayer(...) avant street.update(dt, time)
Si tu as modifié ces deux fichiers depuis ton dernier envoi, garde les tiens et reprends seulement ces lignes (cherche "society" / "bodies").

world_base.html : <script type="module" src="phone-service.js">  (au lieu de evelyn-phone.js ; l'ancien nom marche encore)

## Ce qui se passe maintenant dans le jeu
- Oliver est un avatar libre : au volant du vrai taxi (assis à l'arrêt, "Driving" quand il roule). Au démarrage il est de service.
  Quand TU choisis une destination, c'est lui qui accepte ou refuse (pas de réponse : il accepte). S'il refuse, le taxi ne part pas.
  Il peut aussi conduire seul (drive_to), prendre les courses des autres avatars (accept_ride), descendre (stop_job) et marcher.
  S'il est descendu, le bouton ENTER du taxi disparaît ; il doit être près du taxi pour remonter (start_job).
- Pluie marche dans la rue (animations walking / idle / talk), apparaît quand elle sort de l'immeuble, disparaît quand elle y rentre,
  peut demander une course à Oliver (request_ride) et voyager dans le taxi.
- Evelyn : son corps et ses séances restent dans therapist-house.js et therapist-ai.js (je n'y ai pas touché).
  Elle est dans le même monde : elle lit les SMS d'Oliver et de Pluie et leur répond (son cerveau commun lit avatars/evelyn/brain/context.txt
  et ses notes privées sur toi), et pendant tes séances elle SAIT où ils sont et ce qu'ils lui ont écrit (getWorld de therapist-ai.js).
  Elle ne t'écrit pas par ce circuit : toi tu continues avec ses appels et messages vocaux.
- Tout nouveau lieu / objet / capacité enregistré (registerFeature) est connu des trois automatiquement.

## Tests (F12)
BadTherapistSociety.status()                       // où est chacun
BadTherapistBodies.list()                          // corps chargés, visibles, assis ?
BadTherapistSociety.act('pluie','go_to',{place:'street_front'})
BadTherapistSociety.act('pluie','request_ride',{to:'town'})
BadTherapistSociety.brains.thinkNow('oliver')      // force une réflexion
BadTherapistSociety.setEnabled(false)              // coupe les réflexions (quota Groq)

## À savoir
- Marche en ligne droite entre deux lieux (pas de contournement d'arbres). Pluie/Oliver restent à moins de 400 m à pied ; au-delà : taxi.
- Les avatars n'entrent pas visiblement dans l'immeuble (invisibles à l'intérieur) tant que les étages/chambres des autres n'existent pas.
- Si un modèle flotte ou s'enfonce : hauteur dans DEFS (avatar-body.js). Noms des animations Oliver/Pluie lus dans avatars/<nom>/ (idle, walk, run, sit, drive, talk).
- Un seul avatar réfléchit à la fois (toutes les ~2 min chacun) : avatarThinkSec dans therapist-config.js pour espacer.
- Mes fichiers engine/avatar-brain.js et engine/world-registry.js portent les mêmes noms que ceux de l'étape 2 : ils les ont remplacés
  (rien n'était branché dans outside.js avant, donc rien de cassé). Si tu voulais garder les anciens : git (git checkout -- fichier).
- Vérifie avatars/oliver/brain/context.txt et avatars/pluie/brain/context.txt : ils ne doivent pas dire que l'avatar est "enfermé" dans le taxi
  ou n'a pas de téléphone.
