// ═══════════════════════════════════════════════════════════════════════
// npcs/brendard.js — M. Brendard, surveillant général du lycée
// ═══════════════════════════════════════════════════════════════════════
// PNJ à phrases fixes (pas d'IA, pas d'API, comme Oliver / Violet) :
//   • corps 3D animé (jambes, bras, tête), ronde dans le lycée, poste à l'entrée ;
//   • ouvre / ferme le grand portail (8h le matin, sur demande) ;
//   • arbre de dialogue (ouvrir / fermer les portails, chambre interdite, endroit secret) ;
//   • bulle de dialogue au-dessus de la tête.
//
// Il vit dans le repère LOCAL du lycée (places/highschool.js le crée et lui donne ses « hooks »).
// Pour l'enregistrer dans npcs/index.js, envoie-moi index.js + un PNJ existant (leon.js) :
// je l'écris dans le même format que les autres.

import * as THREE from 'three';

export const BRENDARD = {
  nom: "M. Brendard",
  age: 52,
  description: "Surveillant général depuis 18 ans. Strict mais juste.",

  repliquesAuto: [
    "Pas de bruit dans les couloirs !",
    "Le portail ferme à 17h30, pas une minute de plus.",
    "J'ai vu des jeunes sur la pelouse... encore.",
    "M. Dupont est en retard ce matin.",
    "La bibliothèque ouvre à 8h.",
    "Quelqu'un a oublié son cartable dans la cour.",
    "Il va faire beau aujourd'hui.",
    "Ces élèves de 5ème B sont vraiment bruyants.",
    "Il faudrait que je vérifie le portail...",
    "Tiens, je n'ai pas vu Léa depuis ce matin.",
    "Le self est ouvert de 12h à 13h30.",
    "Pas de téléphone dans les couloirs, combien de fois faut-il le répéter !",
    "*sifflement discret*",
    "...",
    "Encore cette odeur de cigarette... je vais trouver qui c'est.",
    "Je dois faire ma ronde dans la cour arrière.",
    "N'oubliez pas, la cantine ferme à 13h30 !",
    "La salle des professeurs est réservée au personnel.",
    "Pas de ballon dans les couloirs !",
  ],

  repliqueApproche: "[E] Parler à M. Brendard",

  dialogues: {
    accueil: {
      texte: ".",
      options: [
        { label: "Ouvrir grand portail", suite: "portail_ouvrir" },
        { label: "Fermer grand portail", suite: "portail_fermer" },
        { label: "Ouvrir portail extérieur", suite: "portail_ext_ouvrir" },
        { label: "Fermer portail extérieur", suite: "portail_ext_fermer" },
        { label: "Ouvrir la chambre interdite", suite: "chambre_interdite" },
        { label: "Conduis-moi à l'endroit secret", suite: "conduire_secret" },
        { label: "Fermer", suite: null },
      ]
    },
    portail_ouvrir: {
      texte: ".",
      action: "OUVRIR_PORTAIL",
      options: [ { label: "✓", suite: null } ]
    },
    portail_fermer: {
      texte: ".",
      action: "FERMER_PORTAIL",
      options: [ { label: "✓", suite: null } ]
    },
    portail_ext_ouvrir: {
      texte: ".",
      action: "OUVRIR_PORTAIL_EXT",
      options: [ { label: "✓", suite: null } ]
    },
    portail_ext_fermer: {
      texte: ".",
      action: "FERMER_PORTAIL_EXT",
      options: [ { label: "✓", suite: null } ]
    },
    chambre_interdite: {
      texte: ".",
      action: "OUVRIR_CHAMBRE_INTERDITE",
      options: [ { label: "✓", suite: null } ]
    },
    conduire_secret: {
      texte: ".",
      action: "CONDUIRE_SECRET",
      options: [ { label: "✓", suite: null } ]
    },
  },

  memoire: {
    portailOuvert: false,
    portailExtOuvert: false,
    nomJoueur: null,
    incidentsConnus: [
      "Quelqu'un a cassé une vitre en salle 104 lundi dernier.",
      "Un élève de 3ème a été renvoyé pour 2 jours.",
    ],
  },

  lieux: {
    "cour":             "La cour centrale pavée. Interdit de courir.",
    "bibliothèque":     "1er étage, bâtiment principal. Silencieux obligatoire.",
    "portail":          "Grand portail d'entrée. S'ouvre à 8h, ferme à 17h30.",
    "portail extérieur":"Portail cadenas de la cour arrière. Accès exceptionnel.",
    "pelouse":          "Interdite aux élèves pendant les heures de cours.",
    "toilettes":        "Rez-de-chaussée, couloir droit. Fermées pendant les cours.",
    "self":             "Ouvert de 12h à 13h30. File d'attente obligatoire.",
    "salle101":         "5ème A – M. Leclerc (maths).",
    "salle102":         "5ème B – Mme Rousseau (français).",
    "cour arrière":     "Grande cour clôturée. Portail cadenas au fond.",
    "salle des profs":  "Salle des professeurs dans la cour arrière. Accès interdit aux élèves.",
    "cantine":          "La cantine est ouverte de 12h à 13h30. Tables rondes, menu du jour affiché.",
  },
};

export function createBrendard(parent, hooks) {
  // hooks (fournis par le lycée) :
  //   camera          vraie caméra du jeu (pour placer la bulle à l'écran)
  //   localCamera     { position } : position du joueur dans le repère du lycée (mise à jour à chaque image)
  //   origin          Vector3 : position du lycée dans le monde
  //   hour()          heure de jeu (8 → 17)
  //   gate            { isOpen(), set(bool) } : grand portail
  //   door(id)        porte du lycée (ex. 'fenceGate', 'mystery')
  //   teleportPlayer(x, z)   place le joueur (repère du lycée)
  //   ensureArea(x, z)       (facultatif) prépare le décor autour d'un point
  const camera = hooks.localCamera;
  const _dom = [];
  const gateIsOpen = () => hooks.gate.isOpen();
  const setGate = (v) => hooks.gate.set(v);

  // ───────────────────────────── CORPS ─────────────────────────────
  const S = 1.85; // facteur d'échelle : environ 1.85× les valeurs de base

  const mSkin   = new THREE.MeshLambertMaterial({color:0xd4956a});
  const mSkin2  = new THREE.MeshLambertMaterial({color:0xc88050});
  const mHair   = new THREE.MeshLambertMaterial({color:0x3a2010});
  const mShirt  = new THREE.MeshLambertMaterial({color:0x1a2a5a}); // uniforme bleu marine
  const mPants  = new THREE.MeshLambertMaterial({color:0x111120}); // pantalon noir
  const mBoots  = new THREE.MeshLambertMaterial({color:0x1a1008});
  const mHatM   = new THREE.MeshLambertMaterial({color:0x1a2a5a}); // casquette bleue
  const mHatBrimM = new THREE.MeshLambertMaterial({color:0x0a1a3a}); // visière noire
  const mBelt   = new THREE.MeshLambertMaterial({color:0x2a1a08});
  const mOutil  = new THREE.MeshLambertMaterial({color:0x7a5c30});
  const mMetalTool = new THREE.MeshLambertMaterial({color:0x666666});
  const mKeyCol = new THREE.MeshLambertMaterial({color:0xc8a020});

  // Racine principale du surveillant (position globale dans la scène)
  const gardener = new THREE.Group();
  gardener.position.set(10.5, 0, 15.5);
  parent.add(gardener);

  // Fonction utilitaire : ajoute un mesh à un groupe
  function mb(group, w,h,d,mat,x,y,z){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z); m.castShadow=true; group.add(m); return m;
  }
  function mc(group, rt,rb,h,seg,mat,x,y,z,rx=0,rz=0){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);
    m.position.set(x,y,z); m.rotation.x=rx; m.rotation.z=rz; m.castShadow=true; group.add(m); return m;
  }
  function ms(group,r,mat,x,y,z){
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),mat);
    m.position.set(x,y,z); m.castShadow=true; group.add(m); return m;
  }

  // ── TORSE (ancrage principal, bas du torse à y=0.7*S) ──
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.72*S, 0);
  gardener.add(torsoGroup);

  // Corps principal
  mb(torsoGroup, 0.52*S,0.62*S,0.30*S, mShirt, 0,0,0);
  // Ceinture
  mb(torsoGroup, 0.54*S,0.07*S,0.32*S, mBelt, 0,-0.28*S,0);
  // Bretelles
  mb(torsoGroup, 0.06*S,0.55*S,0.06*S, mBelt, -0.14*S, 0.05*S, 0.14*S);
  mb(torsoGroup, 0.06*S,0.55*S,0.06*S, mBelt,  0.14*S, 0.05*S, 0.14*S);

  // ── COU ──
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.33*S, 0);
  torsoGroup.add(neckGroup);
  mc(neckGroup, 0.09*S,0.10*S,0.18*S,8, mSkin, 0,0,0);

  // ── TÊTE (pivote sur le cou) ──
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.12*S, 0);
  neckGroup.add(headGroup);

  // Crâne arrondi
  ms(headGroup, 0.19*S, mSkin, 0, 0.03*S, 0);
  // Visage légèrement allongé
  mb(headGroup, 0.32*S,0.36*S,0.30*S, mSkin, 0, 0.01*S, 0);
  // Mâchoire (légèrement plus large)
  mb(headGroup, 0.30*S,0.12*S,0.28*S, mSkin2, 0,-0.14*S,0.01*S);
  // Bouche
  mb(headGroup, 0.10*S,0.025*S,0.04*S, new THREE.MeshLambertMaterial({color:0x7a3010}), 0,-0.16*S,0.15*S);
  // Lèvres
  mb(headGroup, 0.12*S,0.03*S,0.04*S, new THREE.MeshLambertMaterial({color:0xc06040}), 0,-0.12*S,0.155*S);
  // Nez
  ms(headGroup, 0.035*S, mSkin2, 0, -0.04*S, 0.155*S);
  // Yeux (blancs + pupilles)
  [-1,1].forEach(side=>{
    mb(headGroup, 0.075*S,0.06*S,0.04*S, new THREE.MeshLambertMaterial({color:0xffffff}), side*0.085*S, 0.04*S, 0.155*S);
    mb(headGroup, 0.040*S,0.040*S,0.04*S, new THREE.MeshLambertMaterial({color:0x1a1010}), side*0.085*S, 0.04*S, 0.160*S);
  });
  // Sourcils
  [-1,1].forEach(side=>{
    mb(headGroup, 0.08*S,0.018*S,0.04*S, new THREE.MeshLambertMaterial({color:0x3a2010}), side*0.085*S, 0.095*S, 0.158*S);
  });
  // Oreilles
  [-1,1].forEach(side=>{
    ms(headGroup, 0.05*S, mSkin2, side*0.175*S, 0.01*S, 0);
  });
  // Cheveux
  mb(headGroup, 0.34*S,0.10*S,0.32*S, mHair, 0, 0.19*S, -0.02*S);
  mb(headGroup, 0.34*S,0.24*S,0.08*S, mHair, 0, 0.08*S, -0.16*S); // arrière tête
  // Pas de moustache (surveillant)
  // Chapeau de paille
  // Casquette surveillant
  mb(headGroup, 0.34*S,0.14*S,0.34*S, mHatM, 0, 0.30*S, 0);          // calotte plate
  mb(headGroup, 0.36*S,0.04*S,0.18*S, mHatBrimM, 0, 0.24*S, 0.12*S); // visière avant
  mb(headGroup, 0.10*S,0.03*S,0.04*S, new THREE.MeshLambertMaterial({color:0xd4a010}), 0, 0.32*S, 0.18*S); // insigne doré

  // ── BRAS GAUCHE (pivot à l'épaule) ──
  const armLGroup = new THREE.Group();
  armLGroup.position.set(-0.30*S, 0.26*S, 0);
  torsoGroup.add(armLGroup);
  mb(armLGroup, 0.15*S,0.42*S,0.17*S, mShirt,  0,-0.20*S,0); // haut bras
  mb(armLGroup, 0.13*S,0.36*S,0.14*S, mSkin,   0,-0.57*S,0); // avant-bras
  ms(armLGroup, 0.075*S, mSkin, 0,-0.40*S,0); // coude
  // Main gauche
  const handLGroup = new THREE.Group();
  handLGroup.position.set(0,-0.76*S,0);
  armLGroup.add(handLGroup);
  mb(handLGroup, 0.13*S,0.15*S,0.10*S, mSkin, 0,0,0);
  // Doigts
  for(let f=0;f<4;f++) mb(handLGroup, 0.025*S,0.075*S,0.025*S, mSkin, (-0.045+f*0.03)*S,-0.09*S,0.02*S);

  // ── BRAS DROIT (pivot à l'épaule) ──
  const armRGroup = new THREE.Group();
  armRGroup.position.set( 0.30*S, 0.26*S, 0);
  torsoGroup.add(armRGroup);
  mb(armRGroup, 0.15*S,0.42*S,0.17*S, mShirt,  0,-0.20*S,0);
  mb(armRGroup, 0.13*S,0.36*S,0.14*S, mSkin,   0,-0.57*S,0);
  ms(armRGroup, 0.075*S, mSkin, 0,-0.40*S,0);
  const handRGroup = new THREE.Group();
  handRGroup.position.set(0,-0.76*S,0);
  armRGroup.add(handRGroup);
  mb(handRGroup, 0.13*S,0.15*S,0.10*S, mSkin, 0,0,0);
  for(let f=0;f<4;f++) mb(handRGroup, 0.025*S,0.075*S,0.025*S, mSkin, (-0.045+f*0.03)*S,-0.09*S,0.02*S);

  // ── BASSIN ──
  const hipGroup = new THREE.Group();
  hipGroup.position.set(0,-0.32*S,0);
  torsoGroup.add(hipGroup);
  mb(hipGroup, 0.50*S,0.20*S,0.28*S, mPants, 0,0,0);

  // ── JAMBE GAUCHE (pivot à la hanche) ──
  const legLGroup = new THREE.Group();
  legLGroup.position.set(-0.14*S,-0.08*S,0);
  hipGroup.add(legLGroup);
  mb(legLGroup, 0.20*S,0.52*S,0.22*S, mPants, 0,-0.24*S,0);
  mb(legLGroup, 0.18*S,0.46*S,0.20*S, mPants, 0,-0.68*S,0);
  ms(legLGroup, 0.11*S, mPants, 0,-0.50*S,0); // genou
  // Botte gauche
  mb(legLGroup, 0.22*S,0.16*S,0.32*S, mBoots, 0,-0.98*S, 0.04*S);
  mb(legLGroup, 0.20*S,0.06*S,0.10*S, mBoots, 0,-1.04*S, 0.16*S); // pointe

  // ── JAMBE DROITE ──
  const legRGroup = new THREE.Group();
  legRGroup.position.set( 0.14*S,-0.08*S,0);
  hipGroup.add(legRGroup);
  mb(legRGroup, 0.20*S,0.52*S,0.22*S, mPants, 0,-0.24*S,0);
  mb(legRGroup, 0.18*S,0.46*S,0.20*S, mPants, 0,-0.68*S,0);
  ms(legRGroup, 0.11*S, mPants, 0,-0.50*S,0);
  mb(legRGroup, 0.22*S,0.16*S,0.32*S, mBoots, 0,-0.98*S, 0.04*S);
  mb(legRGroup, 0.20*S,0.06*S,0.10*S, mBoots, 0,-1.04*S, 0.16*S);

  // ── OUTIL : walkie-talkie (dans la main droite) ──
  const toolGroup = new THREE.Group();
  toolGroup.position.set(0.28*S, -0.55*S, 0.08*S);
  torsoGroup.add(toolGroup);
  const mWalkie = new THREE.MeshLambertMaterial({color:0x111111});
  const mWalkieBtn = new THREE.MeshLambertMaterial({color:0xcc2020});
  mb(toolGroup, 0.09*S,0.22*S,0.05*S, mWalkie, 0,0,0);           // corps
  mc(toolGroup, 0.01*S,0.01*S,0.12*S,6, mMetalTool, 0,0.16*S,0); // antenne
  mb(toolGroup, 0.04*S,0.04*S,0.06*S, mWalkieBtn, 0,0.04*S,0.03*S); // bouton rouge

  // ── CLÉ (accrochée à la ceinture) ──
  const keyGroup = new THREE.Group();
  keyGroup.position.set(-0.28*S, -0.28*S, 0.16*S);
  torsoGroup.add(keyGroup);
  mc(keyGroup, 0.04*S,0.04*S,0.16*S,8, mKeyCol, 0,0,0,0,Math.PI/2); // tige clé
  ms(keyGroup, 0.055*S, mKeyCol, -0.10*S,0,0); // anneau
  mc(keyGroup, 0.055*S,0.055*S,0.015*S,8, new THREE.MeshLambertMaterial({color:0xa08010,wireframe:true}), -0.10*S,0,0,Math.PI/2,0);
  mb(keyGroup, 0.015*S,0.04*S,0.015*S, mKeyCol, 0.06*S,-0.025*S,0);
  mb(keyGroup, 0.015*S,0.03*S,0.015*S, mKeyCol, 0.04*S,-0.040*S,0);

  // ── SIFFLET (à la ceinture du surveillant) ──
  // Sifflet doré accroché à la ceinture
  const mSifflet = new THREE.MeshLambertMaterial({color:0xd4a010});
  const siffletGroup = new THREE.Group();
  siffletGroup.position.set(0.18*S, -0.30*S, 0.16*S);
  torsoGroup.add(siffletGroup);
  mc(siffletGroup, 0.025*S,0.025*S,0.12*S,8, mSifflet, 0,0,0, 0,Math.PI/2);



  // ───────────────────────────── ÉTAT / RONDE ─────────────────────────────
  // ─── LOGIQUE SURVEILLANT ─────────────────────────────────────────
  let gardenerWalkT = 0;
  let gardenerState = 'patrolling'; // patrouille dès le début
  let gardenerActivityTimer = 0;
  let gardenerActivity = 'inspecting';
  let gardenerNightMode = false;
  let gardenerGateAction = false;
  let gardenerCloseAction = false;
  let gardenerOpTimer = 0;

  const GARDENER_POST    = new THREE.Vector3(10.5, 0, 15.5);
  const GARDENER_GATE    = new THREE.Vector3(1.5,  0, 17.5);
  const GARDENER_INSPECT = new THREE.Vector3(0.0,  0,  5.0);
  const GARDENER_INSPECT2= new THREE.Vector3(10.5, 0,  2.0);

  // Chambre surveillant
  const GARDENER_CHAMBRE = new THREE.Vector3(32.5, 0, 5.0);
  const GARDENER_CHAMBRE_DOOR = new THREE.Vector3(27.5, 0, 15.8);

  // Ronde : cour principale, couloirs, bibliothèque, cour arrière — sans discours
  const PATROL_WAYPOINTS = [
    { pos: new THREE.Vector3(10.5, 0, 15.5), stopTime: 0.5 },
    { pos: new THREE.Vector3(0,    0,  8.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(-12,  0,  5.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(-12,  0, -8.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(0,    0,-10.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(12,   0, -8.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(12,   0,  5.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(22,   0, -10.0), stopTime: 0.5 }, // couloir droit
    { pos: new THREE.Vector3(-22,  0, -10.0), stopTime: 0.5 }, // couloir gauche
    { pos: new THREE.Vector3(0,    0, -40.0), stopTime: 1.0 }, // cour arrière
    { pos: new THREE.Vector3(0,    0, -10.0), stopTime: 0.5 },
    { pos: new THREE.Vector3(10.5, 0, 15.5), stopTime: 0.5 },
  ];
  let patrolIndex = 0;
  let patrolStopTimer = 0;
  let patrolActive = true; // actif dès le début
  let calledByPlayer = false;
  let playerCallTarget = null;
  let gateOpenedMorning = false;
  let gateClosedEvening = false;
  let autoCloseMainTimer = 0;
  let autoCloseExtTimer  = 0;

  // ───────────────────────────── BULLE + DIALOGUE ─────────────────────────────
  // ── BULLE 3D → 2D : projetée au-dessus de la tête ─────────────
  const speechBubble = document.createElement('div');
  speechBubble.id = 'speechBubble';
  speechBubble.style.cssText = `
    display:none; position:fixed; pointer-events:none; z-index:50;
    transform:translate(-50%, -100%);
    max-width:220px; min-width:80px;
    background:rgba(255,252,240,0.97);
    border:2px solid #c8a020;
    border-radius:14px 14px 14px 4px;
    padding:7px 12px 7px 12px;
    font-family:Georgia,serif; font-size:12.5px; color:#2a1a08;
    line-height:1.5; text-align:center;
    box-shadow:0 4px 18px rgba(0,0,0,0.35);
    transition: opacity 0.3s;
  `;
  // Petite queue de bulle
  speechBubble.innerHTML = '<span id="speechText"></span><div style="position:absolute;bottom:-10px;left:14px;width:0;height:0;border-left:8px solid transparent;border-right:4px solid transparent;border-top:10px solid #c8a020;"></div><div style="position:absolute;bottom:-8px;left:15px;width:0;height:0;border-left:7px solid transparent;border-right:3px solid transparent;border-top:9px solid rgba(255,252,240,0.97);"></div>';
  document.body.appendChild(speechBubble); _dom.push(speechBubble);

  // Bulle "approche" plus petite — au centre de l'écran quand on est près
  const approachBubble = document.createElement('div');   // (inutilisé : le bouton d'action du jeu affiche déjà « Parler à… »)
  approachBubble.style.cssText=`
    display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.55); border:1px solid #aaa; border-radius:20px;
    padding:6px 14px; color:#fff; font-family:Georgia,serif; font-size:13px;
    pointer-events:none; z-index:25;
  `;
  approachBubble.textContent = BRENDARD.repliqueApproche;
  document.body.appendChild(approachBubble); _dom.push(approachBubble);

  // ── ÉTAT DU DIALOGUE ──────────────────────────────────────────
  let inDialogue = false;
  let nearGardener = false;

  // ── BULLE D'ACTION : s'affiche uniquement quand le surveillant fait/dit quelque chose ──
  let activeSpeechText = '';
  let activeSpeechTimer = 0; // secondes restantes

  function showSurveillantSpeech(text, duration=4.0){
    activeSpeechText = text;
    activeSpeechTimer = duration;
    document.getElementById('speechText').textContent = text;
  }

  // Vecteurs réutilisables — évite les allocations dans la boucle
  const _headPos3D  = new THREE.Vector3();
  const _projVec    = new THREE.Vector3();
  const _cameraDir  = new THREE.Vector3();
  const _camPos2D   = new THREE.Vector3();

  // Met à jour la position 3D→2D de la bulle chaque frame
  function updateSpeechBubblePosition(){
    if(activeSpeechTimer <= 0 && !inDialogue){ speechBubble.style.display='none'; return; }
    _headPos3D.set(gardener.position.x, 3.6, gardener.position.z).add(hooks.origin);   // local -> monde
    _projVec.copy(_headPos3D).project(hooks.camera);
    if(_projVec.z > 1){ speechBubble.style.display='none'; return; }
    const W = window.innerWidth;
    const H = window.innerHeight - 70;
    const sx = (_projVec.x  * 0.5 + 0.5) * W;
    const sy = (-_projVec.y * 0.5 + 0.5) * H;
    if(sx < -60 || sx > W+60 || sy < -80 || sy > H+80){ speechBubble.style.display='none'; return; }
    speechBubble.style.display = 'block';
    speechBubble.style.left = sx + 'px';
    speechBubble.style.top  = sy + 'px';
    const gx=gardener.position.x-camera.position.x, gz=gardener.position.z-camera.position.z;
    const gdist=Math.sqrt(gx*gx+gz*gz);
    const sc = Math.max(0.55, Math.min(1.0, 5.0/Math.max(gdist,1)));
    speechBubble.style.transform = `translate(-50%, -100%) scale(${sc})`;
    speechBubble.style.transformOrigin = 'bottom left';
  }



  // ── PANNEAU DIALOGUE (arbre de conversation) ──────────────────
  const dialogStyle = document.createElement('style');
  dialogStyle.textContent = `
    #dialogPanel {
      display:none; position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      width:min(400px,92vw); background:#1a1510; border:1.5px solid #c8a830;
      border-radius:16px; z-index:30; font-family:Georgia,serif;
      box-shadow:0 8px 40px rgba(0,0,0,0.6); overflow:hidden;
    }
    #dialogHeader {
      background:linear-gradient(135deg,#2a1e08,#3a2a10);
      padding:10px 16px; display:flex; align-items:center; gap:10px;
      border-bottom:1px solid #4a3a18;
    }
    #dialogHeader .dname { color:#f0d080; font-size:13px; font-weight:bold; }
    #dialogHeader .drole { color:#9a7030; font-size:10px; font-style:italic; }
    #dialogHeader .dclose {
      margin-left:auto; background:none; border:none; color:#9a7030;
      font-size:16px; cursor:pointer; padding:2px 6px; border-radius:4px;
    }
    #dialogHeader .dclose:hover { color:#f0d080; }
    #dialogNPCText {
      padding:14px 16px 10px; color:#f0e8c8; font-size:13px; line-height:1.7;
      min-height:54px; border-bottom:1px solid #2a2010;
    }
    #dialogOptions {
      padding:10px 14px 12px; display:flex; flex-direction:column; gap:6px;
    }
    .dopt {
      background:#2a1e08; border:1px solid #4a3818; border-radius:20px;
      padding:8px 16px; color:#d4b060; font-family:Georgia,serif; font-size:12px;
      cursor:pointer; text-align:left; transition:0.15s;
    }
    .dopt:hover { background:#3a2a0a; border-color:#c8a020; color:#f0d080; }
  `;
  document.head.appendChild(dialogStyle);

  const dialogPanel = document.createElement('div');
  dialogPanel.id = 'dialogPanel';
  dialogPanel.innerHTML = `
    <div id="dialogHeader">
      <span style="font-size:22px">👮</span>
      <div>
        <div class="dname">M. Brendard</div>
        <div class="drole">Surveillant — Lycée Jean Dumont</div>
      </div>
      <button class="dclose">✕</button>
    </div>
    <div id="dialogNPCText"></div>
    <div id="dialogOptions"></div>
  `;
  document.body.appendChild(dialogPanel); _dom.push(dialogPanel, dialogStyle);
  dialogPanel.querySelector('.dclose').addEventListener('click', ()=>closeChat());

  // ── LOGIQUE DIALOGUE ──────────────────────────────────────────
  let currentNode = 'accueil';

  function openChat(){
    inDialogue = true;
    dialogPanel.style.display = 'block';
    approachBubble.style.display = 'none';
    activeSpeechTimer = 0;
    currentNode = 'accueil';
    renderDialogNode(currentNode);
  }

  function closeChat(){
    inDialogue = false;
    dialogPanel.style.display = 'none';
    activeSpeechTimer = 0;
    speechBubble.style.display = 'none';
  }

  function renderDialogNode(nodeId){
    const node = BRENDARD.dialogues[nodeId];
    if(!node) { closeChat(); return; }

    // Afficher le texte du NPC dans la bulle 3D pendant le dialogue
    document.getElementById('speechText').textContent = node.texte;
    activeSpeechTimer = 9999; // reste jusqu'à closeChat
    updateSpeechBubblePosition();

    document.getElementById('dialogNPCText').textContent = node.texte;

    // Exécuter l'action si présente
    if(node.action === 'OUVRIR_PORTAIL'){
      setTimeout(()=>{
        if(!gateIsOpen()){ setGate(true);
          gardenerGateAction=true; gardenerState='walking'; }
        autoCloseMainTimer = 15;
      }, 300);
    }
    if(node.action === 'FERMER_PORTAIL'){
      setTimeout(()=>{
        if(gateIsOpen()){ setGate(false);
          gardenerCloseAction=true; gardenerState='walking'; }
        autoCloseMainTimer = 0;
      }, 300);
    }
    if(node.action === 'OUVRIR_PORTAIL_EXT'){
      setTimeout(()=>{
        const fgDoor = hooks.door('fenceGate');
        if(fgDoor){ fgDoor.open=true; fgDoor.targetAngle=1; }
        autoCloseExtTimer = 15;
      }, 300);
    }
    if(node.action === 'FERMER_PORTAIL_EXT'){
      setTimeout(()=>{
        const fgDoor = hooks.door('fenceGate');
        if(fgDoor){ fgDoor.open=false; fgDoor.targetAngle=0; }
        autoCloseExtTimer = 0;
      }, 300);
    }
    if(node.action === 'OUVRIR_CHAMBRE_INTERDITE'){
      setTimeout(()=>{
        const mysterDoor = hooks.door('mystery');
        if(mysterDoor && !mysterDoor.open){ mysterDoor.open=true; mysterDoor.targetAngle=1; }
      }, 300);
    }
    if(node.action === 'CONDUIRE_SECRET'){
      setTimeout(()=>{
        closeChat();
        if(hooks.ensureArea) hooks.ensureArea(120, -375);   // prépare le décor là-bas
        calledByPlayer = false;
        gardenerState = 'driving_secret';
        gardenerOpTimer = 0;
      }, 500);
    }

    const opts = document.getElementById('dialogOptions');
    opts.innerHTML = '';
    node.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'dopt';
      btn.textContent = opt.label;
      btn.onclick = () => {
        if(opt.suite === null){ closeChat(); }
        else { currentNode = opt.suite; renderDialogNode(opt.suite); }
      };
      opts.appendChild(btn);
    });
  }



  const _onEsc = (e) => { if (e.key === 'Escape' && inDialogue) closeChat(); };
  document.addEventListener('keydown', _onEsc);

  // ───────────────────────────── MINUTERIES ─────────────────────────────
  function tickBrendard(dt) {
    const gameHour = hooks.hour();
  // ── Auto-fermeture portail principal après ordre joueur ──
    if(autoCloseMainTimer > 0){
      autoCloseMainTimer -= dt;
      if(autoCloseMainTimer <= 0 && gateIsOpen()){
        setGate(false);
        gardenerCloseAction=true;
        const prev = gardenerState;
        gardenerState='walking';
      }
    }
    // ── Auto-fermeture portail extérieur après ordre joueur ──
    if(autoCloseExtTimer > 0){
      autoCloseExtTimer -= dt;
      if(autoCloseExtTimer <= 0){
        const fgDoor = hooks.door('fenceGate');
        if(fgDoor && fgDoor.open){ fgDoor.open=false; fgDoor.targetAngle=0; }
      }
    }

    // ── Portail automatique matin (8h) ──
    if(!gateOpenedMorning && gameHour >= 8.0 && gameHour < 8.1){
      gateOpenedMorning = true;
      if(!gateIsOpen()){ setGate(true); gardenerGateAction=true; gardenerState='walking'; }
      autoCloseMainTimer = 15; // ferme 15s après
    }
    // ── Portail automatique soir (16h) ──
    if(gateOpenedMorning && !gateClosedEvening && gameHour >= 16.0 && gameHour < 16.1){
      gateClosedEvening = true;
      if(!gateIsOpen()){ setGate(true); gardenerGateAction=true; gardenerState='walking'; }
      autoCloseMainTimer = 15;
    }

    // ── Ronde ──
    const isNight = false;   // chez Illusion il fait toujours jour au lycée
    if(!isNight && !patrolActive && !gardenerNightMode && gardenerState==='idle' && !gardenerGateAction && !gardenerCloseAction && !calledByPlayer){
      patrolActive = true; patrolIndex = 0; patrolStopTimer = 0;
      gardenerState = 'patrolling';
    }
    // ── Nuit : aller dans la chambre ──
    if(isNight && !gardenerNightMode && gardenerState==='idle' && !gardenerGateAction && !calledByPlayer){
      patrolActive = false;
      gardenerNightMode = true;
      gardenerState = 'going_to_bed';
    }
    // ── Matin : sortir de la chambre ──
    if(!isNight && gardenerNightMode && gardenerState==='idle'){
      gardenerNightMode = false;
      gardenerState = 'patrolling';
      patrolActive = true; patrolIndex = 0; patrolStopTimer = 0;
    }

  
    // Décompte bulle de parole
    if (!inDialogue && activeSpeechTimer > 0) {
      activeSpeechTimer -= dt;
      if (activeSpeechTimer <= 0) { activeSpeechTimer = 0; speechBubble.style.display = 'none'; }
    }
    updateSpeechBubblePosition();
  }

  // ───────────────────────────── MACHINE À ÉTATS ─────────────────────────────
  function think(dt, ts) {
    // ─── SURVEILLANT : machine à états ──────────────────────────
    {
      function moveToward(target, speed){
        const dx=target.x-gardener.position.x, dz=target.z-gardener.position.z;
        const dist=Math.sqrt(dx*dx+dz*dz);
        if(dist>0.15){
          gardener.position.x+=(dx/dist)*speed*dt;
          gardener.position.z+=(dz/dist)*speed*dt;
          gardener.rotation.y=Math.atan2(dx,dz);
          gardenerWalkT+=dt*10;
          const sw=Math.sin(gardenerWalkT)*0.45;
          legLGroup.rotation.x=sw; legRGroup.rotation.x=-sw;
          armLGroup.rotation.x=-sw*0.6; armRGroup.rotation.x=sw*0.6;
          torsoGroup.rotation.z=Math.sin(gardenerWalkT*0.5)*0.04;
          return false; // pas encore arrivé
        }
        legLGroup.rotation.x=0; legRGroup.rotation.x=0;
        armLGroup.rotation.x=0; armRGroup.rotation.x=0;
        torsoGroup.rotation.z=0;
        return true; // arrivé
      }

      if(gardenerState==='walking'){
        const target = (gardenerGateAction || gardenerCloseAction) ? GARDENER_GATE :
                       (gardenerActivity==='inspecting2' ? GARDENER_INSPECT2 : GARDENER_INSPECT);
        if(moveToward(target, 4.5)){
          if(gardenerGateAction){ gardenerState='opening_gate'; gardenerOpTimer=2.0; }
          else if(gardenerCloseAction){ gardenerState='closing_gate'; gardenerOpTimer=2.0; }
          else { gardenerState='inspecting'; gardenerActivityTimer=0; }
        }
      }
      else if(gardenerState==='opening_gate'){
        gardener.rotation.y = Math.atan2(GARDENER_GATE.x-gardener.position.x, GARDENER_GATE.z-gardener.position.z);
        armRGroup.rotation.x = -0.9 + Math.sin(ts*0.006)*0.18;
        armRGroup.rotation.z = -0.35; armLGroup.rotation.x = -0.4;
        gardenerOpTimer -= dt;
        if(gardenerOpTimer <= 1.2 && !gateIsOpen()){ setGate(true); }
        if(gardenerOpTimer <= 0){
          armRGroup.rotation.x=0; armRGroup.rotation.z=0; armLGroup.rotation.x=0;
          gardenerGateAction=false; gardenerState='patrolling'; patrolActive=true; patrolIndex=0; patrolStopTimer=0;
        }
      }
      else if(gardenerState==='closing_gate'){
        gardener.rotation.y = Math.atan2(GARDENER_GATE.x-gardener.position.x, GARDENER_GATE.z-gardener.position.z);
        armLGroup.rotation.x = -0.8+Math.sin(ts*0.006)*0.15; armLGroup.rotation.z=0.3;
        armRGroup.rotation.x = -0.7+Math.sin(ts*0.006+1)*0.12; armRGroup.rotation.z=-0.3;
        gardenerOpTimer -= dt;
        if(gardenerOpTimer <= 1.0 && gateIsOpen()){ setGate(false); }
        if(gardenerOpTimer <= 0){
          armLGroup.rotation.x=0; armLGroup.rotation.z=0; armRGroup.rotation.x=0; armRGroup.rotation.z=0;
          gardenerCloseAction=false; gardenerState='patrolling'; patrolActive=true; patrolIndex=0; patrolStopTimer=0;
        }
      }
      else if(gardenerState==='returning'){
        if(moveToward(GARDENER_POST, 4.5)){
          gardener.position.set(GARDENER_POST.x,0,GARDENER_POST.z);
          gardener.rotation.y=Math.PI;
          gardenerState='patrolling'; patrolActive=true; patrolIndex=0; patrolStopTimer=0;
        }
      }
      else if(gardenerState==='inspecting'){
        // M. Bernard surveille : il regarde autour de lui, debout
        gardenerActivityTimer+=dt;
        headGroup.rotation.y = Math.sin(gardenerActivityTimer*0.8)*0.7;
        armLGroup.rotation.z = Math.sin(gardenerActivityTimer*0.5)*0.10;
        torsoGroup.rotation.y = Math.sin(gardenerActivityTimer*0.3)*0.06;
        if(gardenerActivityTimer>10){
          headGroup.rotation.y=0; torsoGroup.rotation.y=0;
          gardenerState='returning'; gardenerActivity='inspecting2';
        }
      }
      else if(gardenerState==='inspecting2'){
        // Second poste d'inspection : côté droit, M. Bernard surveille le portail
        gardenerActivityTimer+=dt;
        headGroup.rotation.y = Math.sin(gardenerActivityTimer*1.1)*0.6;
        torsoGroup.rotation.y = Math.sin(gardenerActivityTimer*0.4)*0.05;
        // Regarde vers le portail (Z+)
        gardener.rotation.y = -0.2 + Math.sin(gardenerActivityTimer*0.5)*0.3;
        if(gardenerActivityTimer>8){
          headGroup.rotation.y=0; torsoGroup.rotation.y=0;
          gardenerState='returning'; gardenerActivity='inspecting';
        }
      }
      else if(gardenerState==='patrolling'){
        if(patrolStopTimer > 0){
          // Arrêté au waypoint : animation inspection (tête qui tourne)
          patrolStopTimer -= dt;
          headGroup.rotation.y=Math.sin(ts*0.003)*0.5;
          armLGroup.rotation.z=Math.sin(ts*0.004)*0.12;
          if(patrolStopTimer <= 0){
            headGroup.rotation.y=0;
            patrolIndex=(patrolIndex+1) % PATROL_WAYPOINTS.length;
          }
        } else {
          const wp = PATROL_WAYPOINTS[patrolIndex];
          if(moveToward(wp.pos, 4.5)){
            patrolStopTimer = wp.stopTime;
          }
        }
        // Interrompre la ronde si besoin
        if(!patrolActive || gardenerGateAction || gardenerCloseAction || calledByPlayer){
          gardenerState='returning';
        }
      }
      else if(gardenerState==='called'){
        // Aller vers le joueur
        if(playerCallTarget){
          playerCallTarget.set(camera.position.x, 0, camera.position.z); // suivre en temps réel
        }
        const tgt = playerCallTarget || GARDENER_POST;
        const dx=tgt.x-gardener.position.x, dz=tgt.z-gardener.position.z;
        const dist=Math.sqrt(dx*dx+dz*dz);
        if(dist > 3.5){
          moveToward(tgt, 6.0);
        } else {
          calledByPlayer=false; playerCallTarget=null;
          gardenerState='patrolling'; patrolActive=true; patrolIndex=0; patrolStopTimer=0;
        }
      }
      else if(gardenerState==='driving_secret'){
        gardenerOpTimer += dt;
        if(gardenerOpTimer < 1.5){
          moveToward(GARDENER_GATE, 5.0);
        } else if(gardenerOpTimer >= 1.5 && gardenerOpTimer < 2.0){
          const t = (gardenerOpTimer - 1.5) / 0.5;
          const tx = 0 + t * 120;
          const tz = 19 + t * ((-375) - 19);
          hooks.teleportPlayer(tx, tz);
          gardener.position.set(tx, 0, tz - 3);
        } else if(gardenerOpTimer >= 2.0 && gardenerOpTimer < 2.1){
          hooks.teleportPlayer(120, -375);
          gardener.position.set(120, 0, -378);
          gardenerState='patrolling'; patrolActive=true; patrolIndex=0; patrolStopTimer=0;
        }
      }
      else if(gardenerState==='going_to_bed'){
        // Aller vers la chambre du surveillant (couloir bâtiment droit)
        if(moveToward(GARDENER_CHAMBRE_DOOR, 4.0)){
          if(moveToward(GARDENER_CHAMBRE, 3.5)){
            gardener.rotation.y = Math.PI; // face au mur du fond
            gardenerState = 'idle';
            gardenerActivityTimer = 9999; // rester là toute la nuit
          }
        }
      }
      else { // idle
        const idleT=ts*0.001;
        headGroup.rotation.y=Math.sin(idleT*0.7)*0.3;
        torsoGroup.rotation.y=Math.sin(idleT*0.4)*0.05;
        armLGroup.rotation.z=Math.sin(idleT*0.6)*0.08;
        armRGroup.rotation.z=-Math.sin(idleT*0.6)*0.08;
        gardenerActivityTimer-=dt;
        if(gardenerActivityTimer<=0 && !patrolActive && !gardenerGateAction && !gardenerCloseAction && !calledByPlayer && !gardenerNightMode){
          headGroup.rotation.y=0;
          gardenerActivity=Math.random()<0.5?'inspecting':'inspecting2';
          gardenerState='walking';
          // Pas de téléportation — M. Bernard marche depuis là où il est
        }
      }
    }

    // ─── SURVEILLANT : proximité & bulle dialogue ──────────────────
    {
      const gx=gardener.position.x-camera.position.x, gz=gardener.position.z-camera.position.z;
      const gdist=Math.sqrt(gx*gx+gz*gz);
      nearGardener = gdist < 4.5;
      approachBubble.style.display = 'none';
      // Le surveillant se tourne vers le joueur quand on est tout proche (et pas en activité)
      if(gdist < 3.0 && (gardenerState==='idle'||gardenerState==='inspecting'||gardenerState==='inspecting2')){
        gardener.rotation.y = Math.atan2(camera.position.x-gardener.position.x, camera.position.z-gardener.position.z);
      }
    }


  }

  return {
    group: gardener,
    get inDialogue() { return inDialogue; },
    isNear() { return nearGardener && !inDialogue; },
    openChat, closeChat,
    newDay() { gateOpenedMorning = false; gateClosedEvening = false; },
    update(dt, ts) { tickBrendard(dt); think(dt, ts); },
    hideUI() { speechBubble.style.display = 'none'; },
    dispose() {
      document.removeEventListener('keydown', _onEsc);
      _dom.forEach(el => el.remove());
      parent.remove(gardener);
    }
  };
}
