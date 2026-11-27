// ═══════════════════════════════════════════════════════════════════════
// places/highschool.js — le LYCÉE JEAN DUMONT dans le monde Illusion
// ═══════════════════════════════════════════════════════════════════════
// Le lycée est construit dans UN groupe placé très loin du reste du monde. Chez lui il fait JOUR
// (ciel bleu, soleil, brouillard clair) : quand tu t'approches, la nuit d'Illusion se fond en jour,
// et elle revient quand tu t'éloignes. Il utilise les boutons / la carte / les coordonnées de
// world_base.html (aucun bouton à lui) : si tu changes world_base, le lycée suit.
//
// DEUX FAÇONS DE L'UTILISER
//   1) Dans le monde extérieur (dehors.js) :
//        import { attachHighSchool } from './highschool.js';
//        const school = attachHighSchool(scene, ctx, { isBusy: () => <vrai si le joueur conduit / dort> });
//        … et dans l'update du monde, APRÈS ta gestion de la hauteur du sol :  school.update(dt, time);
//        … et dans la carte : pois.push(...school.getMapPois());
//   2) Seul, pour tester :  index.html?world=places/highschool.js  (tu apparais devant le portail)
//
// RÉGLAGES : tout en haut (HIGHSCHOOL, DAY_*).

import * as THREE from 'three';
import { createBrendard } from '../npcs/brendard.js';

// ── OÙ EST LE LYCÉE ──────────────────────────────────────────────────────
// `gate` = tes coordonnées (X:336.18 Y:-19.52 Z:-281.78) : c'est le milieu du PORTAIL du lycée.
// Le lycée s'étend derrière le portail vers Z négatif (cour, bâtiment, cour arrière : ~170 m de long).
// Y = hauteur de ta caméra (le sol est 1.7 plus bas).
export const HIGHSCHOOL = {
  gate: { x: 336.18, y: -19.52, z: -281.78 },
  eyeHeight: 1.7
};

// ── JOUR ─────────────────────────────────────────────────────────────────
const DAY_NEAR = 110;       // à moins de 110 m du centre du lycée : plein jour (le portail est à ~80 m du centre)
const DAY_FAR = 230;        // à plus de 230 m : nuit d'Illusion (fondu entre les deux)
const DAY_LIGHT = 0.6;      // force de la lumière du jour (le jeu sort en sRGB : on baisse un peu). Monte si trop sombre.
const DAY_FOG_DENSITY = 0.0016;
const ACTIVE_DIST = 300;    // au-delà : le lycée n'est ni dessiné ni simulé
const CENTER = { x: 0, z: -60 };   // centre du lycée (repère local)

export function attachHighSchool(parentScene, ctx, opts = {}) {

const OPTS = opts;
const STANDALONE = !!opts.standalone;
const REALCAM = ctx.camera;
const renderer = ctx.renderer;
const _action = ctx.action;
const canvas = renderer.domElement;

// Origine du lycée : le portail est à local (0, 0, 18)
const ORIGIN = new THREE.Vector3(
  HIGHSCHOOL.gate.x,
  HIGHSCHOOL.gate.y - HIGHSCHOOL.eyeHeight,
  HIGHSCHOOL.gate.z - 18
);

const root = new THREE.Group();
root.name = 'highschool';
// La rue (dehors.js) est un groupe décalé dans le monde : on convertit la position monde -> repère du parent
parentScene.updateMatrixWorld(true);
const PARENT_OFF = new THREE.Vector3();
parentScene.getWorldPosition(PARENT_OFF);   // (0,0,0) en mode autonome
function rootScene(){ let s = parentScene; while(s.parent) s = s.parent; return s; }   // la vraie scène (c'est elle qui a le brouillard)
root.position.copy(ORIGIN).sub(PARENT_OFF);
root.visible = STANDALONE;
parentScene.add(root);
const scene = root;   // tout le code du lycée fait scene.add(...) : il tombe dans le groupe

// « caméra » du lycée = le joueur dans le repère du lycée (mise à jour au début de chaque image)
const camera = { position: new THREE.Vector3() };
function _flushPlayer(){
  REALCAM.position.set(camera.position.x + ORIGIN.x, camera.position.y + ORIGIN.y, camera.position.z + ORIGIN.z);
}

const _W = {};          // (ancien window.* de l'ascenseur)
const _unsub = [];
const _dom = [];
let _active = STANDALONE;
function _listen(target, name, fn, o){ target.addEventListener(name, fn, o); _unsub.push(() => target.removeEventListener(name, fn, o)); }

let _toast = null;
function _toastEl(){
  if(_toast) return _toast;
  _toast = document.createElement('div');
  _toast.style.cssText = 'position:fixed;bottom:150px;left:50%;transform:translateX(-50%);background:rgba(23,23,32,0.92);' +
    'color:#f0e0c8;border:1px solid #c9a46a;border-radius:20px;padding:6px 18px;font:12px Georgia,serif;opacity:0;' +
    'transition:opacity 0.3s;pointer-events:none;z-index:60;';
  document.body.appendChild(_toast); _dom.push(_toast);
  return _toast;
}

function _CT(c){ const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; }

// ── lumière du jour (nulle tant qu'on est loin) ──
const sun = new THREE.DirectionalLight(0xfff0c0, 0);
sun.position.set(15, 30, 20);
root.add(sun); root.add(sun.target);
const ambLight = new THREE.AmbientLight(0xc0ccd8, 0); root.add(ambLight);
const hemiLight = new THREE.HemisphereLight(0xd0e4ff, 0x908060, 0); root.add(hemiLight);

// pas de neige sur le terrain du lycée (zone en coordonnées du monde)
try {
  if(ctx.snow && ctx.snow.excludeBox) ctx.snow.excludeBox(ORIGIN.x - 200, ORIGIN.y - 40, ORIGIN.z - 380, ORIGIN.x + 200, ORIGIN.y + 120, ORIGIN.z + 120);
} catch(e) {}

// ── fondu nuit -> jour ──
const DAY_FOG = new THREE.Color(0x8ab0cc).convertSRGBToLinear();
const _saved = { fog: new THREE.Color(), density: 0.012, clear: new THREE.Color() };
let _dayOn = false;
const _smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

function restoreDay(){
  _dayOn = false;
  const fog = rootScene().fog;
  if(fog){ fog.color.copy(_saved.fog); fog.density = _saved.density; }
  renderer.setClearColor(_saved.clear);
}

function applyDay(dist){
  const f = STANDALONE ? 1 : 1 - _smooth((dist - DAY_NEAR) / (DAY_FAR - DAY_NEAR));
  const on = f > 0.004;
  skySphere.visible = on;
  skyMat.opacity = f;
  const dl = DAY_LIGHT * f;
  sun.intensity = 0.95 * dl; ambLight.intensity = 0.5 * dl; hemiLight.intensity = 0.3 * dl;

  const fog = rootScene().fog;
  if(on){
    if(!_dayOn){
      _dayOn = true;
      if(fog){ _saved.fog.copy(fog.color); _saved.density = fog.density; }
      renderer.getClearColor(_saved.clear);
    }
    if(fog){
      fog.color.copy(_saved.fog).lerp(DAY_FOG, f);
      fog.density = _saved.density + (DAY_FOG_DENSITY - _saved.density) * f;
    }
    renderer.setClearColor(fog ? fog.color : DAY_FOG);
  } else if(_dayOn){
    restoreDay();
  }
}

// ═══════════════════════ LE LYCÉE (code d'origine) ═══════════════════════


// ─── TEXTURES ───────────────────────────────────────────────

function makeTex(fn,size=128){
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=c.getContext('2d'); fn(x,size);
  const t=_CT(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// Pavés beige-gris
const paveTex = makeTex((x,s)=>{
  x.fillStyle='#c8b898'; x.fillRect(0,0,s,s);
  const pw=16,ph=10;
  for(let row=0;row*ph<s;row++){
    const off=row%2===0?0:pw/2;
    for(let col=-1;col*pw<s+pw;col++){
      const bx=col*pw+off, by=row*ph;
      const r=185+Math.random()*30, g=168+Math.random()*25, b=138+Math.random()*25;
      x.fillStyle=`rgb(${r},${g},${b})`;
      x.fillRect(bx+1,by+1,pw-2,ph-2);
    }
  }
  x.strokeStyle='rgba(80,70,55,0.25)'; x.lineWidth=1;
  for(let i=0;i<s;i+=pw){x.beginPath();x.moveTo(i,0);x.lineTo(i,s);x.stroke();}
  for(let i=0;i<s;i+=ph){x.beginPath();x.moveTo(0,i);x.lineTo(s,i);x.stroke();}
},256);
paveTex.repeat.set(18,18);

// Pierre haussmannienne (mur)
const stoneTex = makeTex((x,s)=>{
  x.fillStyle='#ddd4b8'; x.fillRect(0,0,s,s);
  const bh=20,bw=40,m=2;
  for(let row=0;row*bh<s;row++){
    const off=row%2===0?0:bw/2;
    for(let col=-1;col*bw<s+bw;col++){
      const bx=col*bw+off,by=row*bh;
      const r=210+Math.random()*25,g=200+Math.random()*22,b=172+Math.random()*22;
      x.fillStyle=`rgb(${r},${g},${b})`;
      x.fillRect(bx+m,by+m,bw-m,bh-m);
      x.fillStyle=`rgba(0,0,0,${Math.random()*0.04})`;
      x.fillRect(bx+m+2,by+m+2,Math.random()*8,Math.random()*4);
    }
  }
},256);
stoneTex.repeat.set(4,3);

const roofTex = makeTex((x,s)=>{
  x.fillStyle='#4a5060'; x.fillRect(0,0,s,s);
  for(let i=0;i<s;i+=6){
    x.fillStyle=`hsl(220,${12+Math.random()*8}%,${28+Math.random()*10}%)`;
    x.fillRect(0,i,s,4);
  }
  x.strokeStyle='rgba(0,0,0,0.2)'; x.lineWidth=0.5;
  for(let i=0;i<s;i+=6){x.beginPath();x.moveTo(0,i);x.lineTo(s,i);x.stroke();}
},64);
roofTex.repeat.set(6,2);

// Sol herbe — vert vif naturel
const grassTex = makeTex((x,s)=>{
  x.fillStyle='#4a8c20'; x.fillRect(0,0,s,s);
  for(let i=0;i<400;i++){
    x.fillStyle=`hsl(${100+Math.random()*30},${55+Math.random()*25}%,${25+Math.random()*18}%)`;
    x.fillRect(Math.random()*s,Math.random()*s,1+Math.random()*2,1+Math.random()*2);
  }
  // Brins d'herbe
  for(let i=0;i<80;i++){
    const gx=Math.random()*s, gy=Math.random()*s;
    x.strokeStyle=`hsl(${105+Math.random()*20},60%,${30+Math.random()*15}%)`;
    x.lineWidth=0.7;
    x.beginPath(); x.moveTo(gx,gy+4); x.lineTo(gx+1,gy); x.stroke();
  }
},128);
grassTex.repeat.set(20,20);

const woodTex = makeTex((x,s)=>{
  x.fillStyle='#5a4830'; x.fillRect(0,0,s,s);
  for(let i=0;i<s;i+=3){
    x.fillStyle=`hsl(28,${28+Math.random()*15}%,${20+Math.random()*12}%)`;
    x.fillRect(0,i,s,2);
  }
},64);

// ─── MATÉRIAUX ────────────────────────────────────────────────
const mStone  = new THREE.MeshLambertMaterial({map:stoneTex});
const mRoof   = new THREE.MeshLambertMaterial({map:roofTex,color:0x8898a8});
const mPave   = new THREE.MeshLambertMaterial({map:paveTex});
const mGrass  = new THREE.MeshLambertMaterial({map:grassTex});
const mGlass  = new THREE.MeshLambertMaterial({color:0xd0dce8,transparent:true,opacity:0.45,side:THREE.DoubleSide});
const mFrame  = new THREE.MeshLambertMaterial({color:0xe8e0cc});
const mWood   = new THREE.MeshLambertMaterial({map:woodTex});
const mMetal  = new THREE.MeshLambertMaterial({color:0x2a2a2a});
const mMetal2 = new THREE.MeshLambertMaterial({color:0x3a3a3a});
const mWhite  = new THREE.MeshLambertMaterial({color:0xf0ece0});
const mSlate  = new THREE.MeshLambertMaterial({color:0x4a5060});
// Arbustes — vert olive foncé, pas vert criard
const mBush   = new THREE.MeshLambertMaterial({color:0x2e5510,side:THREE.DoubleSide});

function add(geo,mat,x,y,z,rx=0,ry=0,rz=0,cast=true){
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
  if(cast){m.castShadow=true;m.receiveShadow=true;}
  scene.add(m); return m;
}
function box(w,h,d,mat,x,y,z,ry=0,cast=true){
  return add(new THREE.BoxGeometry(w,h,d),mat,x,y,z,0,ry,0,cast);
}

// ─── SOL ─────────────────────────────────────────────────────
add(new THREE.PlaneGeometry(60,60),mPave,0,0,0,-Math.PI/2,0,0,false);

// ─── SOL AUTOUR DU LYCÉE ─────────────────────────────────────
// (l'ancien sol de 8000×8000 est supprimé : le vrai terrain est celui du monde Illusion)
{
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 330), new THREE.MeshLambertMaterial({color:0x5a8c35}));
  apron.rotation.x = -Math.PI/2;
  apron.position.set(0, -0.05, -60);
  scene.add(apron);
}

// ─── SYSTÈME DE CHUNKS INFINIS ─────────────────────────────────
// Chunks de 60×60 unités, générés autour du joueur
const CHUNK_SIZE = 60;
const CHUNK_RADIUS = 3; // 3 chunks dans chaque direction = monde de ~360u visible
const activeChunks = new Map(); // "cx,cz" → group

// Matériaux extérieurs
const mOutGrass  = new THREE.MeshLambertMaterial({color:0x4a8a28});
const mSakuraTrunk = new THREE.MeshLambertMaterial({color:0x6a4030});
const mSakuraBlossom = new THREE.MeshLambertMaterial({color:0xffb0c8, transparent:true, opacity:0.9});
const mSakuraBlossom2 = new THREE.MeshLambertMaterial({color:0xff90b0, transparent:true, opacity:0.85});
const mExtTree   = new THREE.MeshLambertMaterial({color:0x2a6020});
const mExtTrunk  = new THREE.MeshLambertMaterial({color:0x5a3820});

const mBush2     = new THREE.MeshLambertMaterial({color:0x2e5510});

// Déterministe pseudo-aléatoire par position
function seededRand(x, z, salt=0){
  const n = Math.sin(x*127.1 + z*311.7 + salt*91.3) * 43758.5453;
  return n - Math.floor(n);
}

// Génère un sakura
function makeSakura(group, lx, lz, h=6) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, h, 7), mSakuraTrunk);
  trunk.position.set(lx, h/2, lz); trunk.castShadow=true; group.add(trunk);
  // Boules de fleurs roses
  const blobs = [
    [0,0,3.2,2.2,3.2],[1.8,0.3,2.4,1.8,2.4],[-1.8,0.2,2.4,1.6,2.4],
    [0.8,-0.3,2.0,1.4,2.0],[-0.9,-0.2,1.8,1.3,1.8],[0,0.7,2.0,1.4,2.0]
  ];
  blobs.forEach(([ox,oz,rx,ry,rz])=>{
    const m = Math.random()<0.5 ? mSakuraBlossom : mSakuraBlossom2;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), m);
    blob.scale.set(rx,ry*0.7,rz);
    blob.position.set(lx+ox, h+ry*0.25, lz+oz);
    blob.castShadow=true; group.add(blob);
  });
  // Pétales tombants (quelques disques)
  for(let p=0;p<4;p++){
    const angle = seededRand(lx+p, lz, 99)*Math.PI*2;
    const dist  = 0.5+seededRand(lx, lz+p, 88)*2.5;
    const petal = new THREE.Mesh(new THREE.CircleGeometry(0.12,4), mSakuraBlossom);
    petal.rotation.x = -Math.PI/2 + (Math.random()-0.5)*0.8;
    petal.position.set(lx+Math.cos(angle)*dist, 0.05, lz+Math.sin(angle)*dist);
    group.add(petal);
  }
}

// Génère un arbre normal
const _treeMatCache = new Map();
function makeExtTree(group, lx, lz, h=7, color=0x2a6020) {
  let m = _treeMatCache.get(color);
  if(!m){ m = new THREE.MeshLambertMaterial({color}); _treeMatCache.set(color, m); }
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, h*0.5, 6), mExtTrunk);
  trunk.position.set(lx, h*0.25, lz); trunk.castShadow=true; group.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1,7,5), m);
  crown.scale.set(h*0.45, h*0.32, h*0.45);
  crown.position.set(lx, h*0.65, lz); crown.castShadow=true; group.add(crown);
}

// Génère un oiseau simple (deux triangles = V)
const _birdMat = new THREE.MeshLambertMaterial({color:0x222222, side:THREE.DoubleSide});
function makeBird(group, bx, by, bz, scale=0.5) {
  [-1,1].forEach(side=>{
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0, 0,
      side*scale*1.4, scale*0.4, 0,
      side*scale*0.6, 0, 0
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts,3));
    const m = new THREE.Mesh(geo, _birdMat);
    m.position.set(bx, by, bz);
    group.add(m);
  });
}

// Génère un lapin simple
function makeRabbit(group, rx, rz) {
  const mFur = new THREE.MeshLambertMaterial({color:0xe8e0d0});
  const mEye = new THREE.MeshLambertMaterial({color:0xff4060});
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18,7,5), mFur);
  body.scale.set(1, 0.9, 1.2); body.position.set(rx, 0.18, rz); body.castShadow=true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11,7,5), mFur);
  head.position.set(rx, 0.36, rz-0.12); group.add(head);
  // Oreilles
  [-0.04, 0.04].forEach(ex=>{
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.025,0.18,5), mFur);
    ear.position.set(rx+ex, 0.53, rz-0.12); group.add(ear);
  });
  // Yeux
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02,4,4), mEye);
  eye.position.set(rx+0.05, 0.39, rz-0.22); group.add(eye);
}

// Génère un chat errant
function makeCat(group, cx, cz) {
  const mCatFur = new THREE.MeshLambertMaterial({color:0xd09050});
  const mCatEye = new THREE.MeshLambertMaterial({color:0x50c050});
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.45), mCatFur);
  body.position.set(cx, 0.22, cz); body.castShadow=true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.10,7,5), mCatFur);
  head.position.set(cx, 0.36, cz-0.22); group.add(head);
  // Oreilles triangulaires
  [-0.05, 0.05].forEach(ex=>{
    const earGeo = new THREE.ConeGeometry(0.035,0.06,3);
    const ear = new THREE.Mesh(earGeo, mCatFur);
    ear.position.set(cx+ex, 0.46, cz-0.22); group.add(ear);
  });
  // Yeux
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02,4,4), mCatEye);
  eye.position.set(cx+0.04, 0.38, cz-0.32); group.add(eye);
  // Queue courbée
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.025,0.28,5), mCatFur);
  tail.rotation.x = -0.8; tail.position.set(cx, 0.30, cz+0.25); group.add(tail);
}



// ─── Vol d'oiseaux animés ─────────────────────────────────────
const birdFlock = [];
const birdGroup = new THREE.Group();
scene.add(birdGroup);
for(let i=0; i<12; i++){
  const b = {
    x: (Math.random()-0.5)*200,
    y: 15 + Math.random()*30,
    z: -100 - Math.random()*200,
    speed: 3+Math.random()*3,
    phase: Math.random()*Math.PI*2,
    radius: 60+Math.random()*100,
    angle: Math.random()*Math.PI*2,
    wingPhase: Math.random()*Math.PI*2
  };
  // Ailes (V animé)
  const bMat = new THREE.MeshLambertMaterial({color:0x1a1a22, side:THREE.DoubleSide});
  const leftWing  = new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.3), bMat);
  const rightWing = new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.3), bMat);
  leftWing.position.set(-0.5, 0, 0);
  rightWing.position.set(0.5, 0, 0);
  const birdObj = new THREE.Group();
  birdObj.add(leftWing); birdObj.add(rightWing);
  birdObj.position.set(b.x, b.y, b.z);
  birdGroup.add(birdObj);
  b.mesh = birdObj; b.lw = leftWing; b.rw = rightWing;
  birdFlock.push(b);
}

// ─── Génération des chunks ──────────────────────────────────────
function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if(activeChunks.has(key)) return;

  const group = new THREE.Group();
  const worldX = cx * CHUNK_SIZE;
  const worldZ = cz * CHUNK_SIZE;

  // Exclure la zone du lycée (X: -40..40, Z: -160..25)
  const inSchool = worldX > -80 && worldX < 80 && worldZ > -200 && worldZ < 50;
  if(inSchool && cx >= -1 && cx <= 1 && cz >= -3 && cz <= 1) {
    activeChunks.set(key, group); // chunk vide pour la zone lycée
    scene.add(group);
    return;
  }

  // Sol herbe
  const grassMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    mOutGrass
  );
  grassMesh.rotation.x = -Math.PI/2;
  grassMesh.position.set(worldX, -0.02, worldZ);
  group.add(grassMesh);

  // Contenu procédural basé sur la position du chunk
  const rng = (s) => seededRand(cx, cz, s);

  // Arbres et sakuras (4-12 par chunk selon la zone)
  const numTrees = Math.floor(rng(1)*10) + 3;
  for(let t=0; t<numTrees; t++){
    const lx = worldX + (seededRand(cx*17+t, cz, 2)-0.5)*CHUNK_SIZE*0.9;
    const lz = worldZ + (seededRand(cx, cz*13+t, 3)-0.5)*CHUNK_SIZE*0.9;


    const isSakura = seededRand(cx+t*7, cz+t*3, 5) < 0.3;
    const h = 5 + seededRand(cx*t, cz, 6)*6;
    if(isSakura) {
      makeSakura(group, lx, lz, h);
    } else {
      const treeColor = seededRand(cx, cz+t, 7) < 0.5 ? 0x2a7020 : 0x1e5518;
      makeExtTree(group, lx, lz, h, treeColor);
    }
  }

  // Buissons (0-5)
  const numBush = Math.floor(rng(10)*5);
  for(let b=0; b<numBush; b++){
    const lx = worldX + (seededRand(cx+b*11, cz, 11)-0.5)*CHUNK_SIZE*0.85;
    const lz = worldZ + (seededRand(cx, cz+b*7, 12)-0.5)*CHUNK_SIZE*0.85;
    const sz = 0.8+rng(b+15)*1.2;
    const bush2 = new THREE.Mesh(new THREE.SphereGeometry(1,6,4), mBush2);
    bush2.scale.set(sz, sz*0.6, sz); bush2.position.set(lx, sz*0.3, lz); group.add(bush2);
  }

  // Animaux (lapins, chats — aléatoirement, rarement)
  if(rng(20) < 0.25) {
    const lx = worldX + (rng(21)-0.5)*CHUNK_SIZE*0.7;
    const lz = worldZ + (rng(22)-0.5)*CHUNK_SIZE*0.7;
    if(rng(23) < 0.5) makeRabbit(group, lx, lz);
    else makeCat(group, lx, lz);
  }

  // Collines douces (quelques chunks éloignés)
  if(Math.abs(cx) > 2 || Math.abs(cz) < -3){
    const hillH = rng(30)*4;
    if(hillH > 1.5){
      const hillMat = new THREE.MeshLambertMaterial({color:0x4a7a28});
      const hill = new THREE.Mesh(new THREE.SphereGeometry(CHUNK_SIZE*0.35,10,7,0,Math.PI*2,0,Math.PI/2), hillMat);
      hill.scale.set(1.8, hillH/(CHUNK_SIZE*0.35), 1.4);
      hill.position.set(worldX, -1, worldZ);
      group.add(hill);
    }
  }

  scene.add(group);
  activeChunks.set(key, group);
}

function disposeChunk(key) {
  const group = activeChunks.get(key);
  if(!group) return;
  group.traverse(obj=>{
    if(obj.geometry) obj.geometry.dispose();
  });
  scene.remove(group);
  activeChunks.delete(key);
}

function updateChunks(playerX, playerZ) {
  // Toujours générer les chunks visibles
  const pcx = Math.round(playerX / CHUNK_SIZE);
  const pcz = Math.round(playerZ / CHUNK_SIZE);
  const needed = new Set();
  for(let dx=-CHUNK_RADIUS; dx<=CHUNK_RADIUS; dx++){
    for(let dz=-CHUNK_RADIUS; dz<=CHUNK_RADIUS; dz++){
      const key = `${pcx+dx},${pcz+dz}`;
      needed.add(key);
      generateChunk(pcx+dx, pcz+dz);
    }
  }
}

// Génération initiale autour du lycée
let lastChunkX = Infinity, lastChunkZ = Infinity;
let _lastClockSec = -1;
let _lastMinimapT = 0;
// Décor fixe autour du lycée (arbres, sakuras, buissons, petits animaux)
for(let cx=-2; cx<=2; cx++) for(let cz=-5; cz<=2; cz++) generateChunk(cx, cz);

// ─── PELOUSES dans les quadrants (seulement ceux dans le périmètre) ─
// Quadrant haut-gauche
{
  const w=20.5, d=21, cx=-13.25, cz=3.5;
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mGrass);
  pl.rotation.x=-Math.PI/2; pl.position.set(cx,0.015,cz); pl.receiveShadow=true; scene.add(pl);
}
// Quadrant haut-droit
{
  const w=20.5, d=21, cx=13.25, cz=3.5;
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mGrass);
  pl.rotation.x=-Math.PI/2; pl.position.set(cx,0.015,cz); pl.receiveShadow=true; scene.add(pl);
}
// Quadrant bas-gauche : X ∈ [-23.5, -3], Z ∈ [-19.5, -13]
{
  const w=20.5, d=6.5, cx=-13.25, cz=-16.25;
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mGrass);
  pl.rotation.x=-Math.PI/2; pl.position.set(cx,0.015,cz); pl.receiveShadow=true; scene.add(pl);
}
// Quadrant bas-droit : X ∈ [3, 23.5], Z ∈ [-19.5, -13]
{
  const w=20.5, d=6.5, cx=13.25, cz=-16.25;
  const pl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mGrass);
  pl.rotation.x=-Math.PI/2; pl.position.set(cx,0.015,cz); pl.receiveShadow=true; scene.add(pl);
}

// ═══════════════════════════════════════════════════════
// ─── CONSTANTES BÂTIMENT (pour les portes/détails) ────
// ═══════════════════════════════════════════════════════
const BX=0, BZ=-24, BW=54, BD=7;
const BH = 13.5;

// Matériaux fenêtre (gardés pour les portes)
const mWinFrame = new THREE.MeshLambertMaterial({color:0xf8f4ec});
const mWinGlass = new THREE.MeshLambertMaterial({color:0xb8cce0, transparent:true, opacity:0.55});
const mWinSill  = new THREE.MeshLambertMaterial({color:0xf0ece0});
const mWinShutter = new THREE.MeshLambertMaterial({color:0x4a6240});

// ── PORTE PRINCIPALE SUPPRIMÉE ─
const gpZ = -19.5;
const mainDoorLeaves = [];

// ─── HORLOGE RÉELLE au-dessus de la porte principale ─────────
const clockCanvas = document.createElement('canvas');
clockCanvas.width = 256; clockCanvas.height = 256;
const clockCtx = clockCanvas.getContext('2d');
const clockTex = _CT(clockCanvas);

function drawClock(){
  const ctx = clockCtx;
  const w = 256, h = 256, cx = w/2, cy = h/2, r = 110;
  ctx.clearRect(0,0,w,h);

  // Fond blanc cassé
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle='#f5f0e0'; ctx.fill();
  // Bordure dorée
  ctx.lineWidth=10; ctx.strokeStyle='#8a6a20'; ctx.stroke();
  // Cercle intérieur
  ctx.beginPath(); ctx.arc(cx,cy,r-8,0,Math.PI*2);
  ctx.lineWidth=2; ctx.strokeStyle='#c8a840'; ctx.stroke();

  // Chiffres romains
  const romans = ['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  ctx.fillStyle='#2a1a08'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 16px Georgia,serif';
  romans.forEach((num,i)=>{
    const ang = (i/12)*Math.PI*2 - Math.PI/2;
    const rx = cx + Math.cos(ang)*(r-26);
    const ry = cy + Math.sin(ang)*(r-26);
    ctx.fillText(num, rx, ry);
  });

  // Graduations
  for(let i=0;i<60;i++){
    const ang = (i/60)*Math.PI*2 - Math.PI/2;
    const isMaj = i%5===0;
    const r1 = r - (isMaj?18:12);
    const r2 = r - 8;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(ang)*r1, cy+Math.sin(ang)*r1);
    ctx.lineTo(cx+Math.cos(ang)*r2, cy+Math.sin(ang)*r2);
    ctx.strokeStyle='#2a1a08'; ctx.lineWidth=isMaj?3:1; ctx.stroke();
  }

  // Heure réelle
  const now = new Date();
  const s = now.getSeconds() + now.getMilliseconds()/1000;
  const m = now.getMinutes() + s/60;
  const hh = (now.getHours()%12) + m/60;

  // Aiguille heures
  const ha = (hh/12)*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(ha)*12, cy - Math.sin(ha)*12);
  ctx.lineTo(cx + Math.cos(ha)*58, cy + Math.sin(ha)*58);
  ctx.strokeStyle='#1a1008'; ctx.lineWidth=6; ctx.lineCap='round'; ctx.stroke();

  // Aiguille minutes
  const ma = (m/60)*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(ma)*14, cy - Math.sin(ma)*14);
  ctx.lineTo(cx + Math.cos(ma)*82, cy + Math.sin(ma)*82);
  ctx.strokeStyle='#1a1008'; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke();

  // Aiguille secondes
  const sa = (s/60)*Math.PI*2 - Math.PI/2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(sa)*18, cy - Math.sin(sa)*18);
  ctx.lineTo(cx + Math.cos(sa)*90, cy + Math.sin(sa)*90);
  ctx.strokeStyle='#c02020'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.stroke();

  // Centre
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2);
  ctx.fillStyle='#c02020'; ctx.fill();

  clockTex.needsUpdate = true;
}

// ─── HORLOGE sur le mur extérieur au-dessus de la porte principale ───
{
  const clockGeo = new THREE.CircleGeometry(1.1, 64);
  const clockMesh = new THREE.Mesh(clockGeo, new THREE.MeshBasicMaterial({map: clockTex}));
  clockMesh.position.set(0, 8.0, -19.0); // plus bas, écarté du mur
  scene.add(clockMesh);

  // Cadre doré autour de l'horloge
  const frameMat = new THREE.MeshLambertMaterial({color: 0xc8a020});
  const frameGeo = new THREE.TorusGeometry(1.15, 0.10, 8, 64);
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.set(0, 8.0, -18.95);
  scene.add(frameMesh);
}
// ─── CONSTANTE BÂTIMENTS LATÉRAUX ──────────
const SLATH = 13.5, SLATW = 7, SLATD = 48, SLATX = 27.5;


// ─── PORTAIL D'ENTRÉE ────────────────────────────────────────
box(1.8,7,1.8,mStone,-8,3.5,18);
box(1.8,7,1.8,mStone,8,3.5,18);
// Linteau droit au-dessus du portail (pas de demi-cercle)
box(16.4,0.6,1.8,mStone,0,6.7,18);
box(16.8,0.35,2.0,mStone,0,7.05,18);
// ─── PORTAIL DE FER ANIMÉ (2 vantaux, cadenas doré) ─────────────
// Charnières aux piliers : pivot gauche à X=-7.1, pivot droit à X=+7.1
// Chaque vantail s'étend VERS LE CENTRE (barres dans la direction du pivot vers X=0)
// Ouverture : vantaux pivotent vers l'intérieur de la cour (Z négatif)
const gateLeftPivot  = new THREE.Group(); gateLeftPivot.position.set(-7.1, 0, 18); scene.add(gateLeftPivot);
const gateRightPivot = new THREE.Group(); gateRightPivot.position.set( 7.1, 0, 18); scene.add(gateRightPivot);

// Fer foncé avec léger reflet métallique
const mGateBar  = new THREE.MeshLambertMaterial({color:0x3a3f44});
const mGateTip  = new THREE.MeshLambertMaterial({color:0x4a5058});
const mGold     = new THREE.MeshLambertMaterial({color:0xd4a010});
const mGoldDark = new THREE.MeshLambertMaterial({color:0xa07808});

// side=+1 : vantail gauche (pivot X=-7.1), barres vers la droite (vers le centre)
// side=-1 : vantail droit  (pivot X=+7.1), barres vers la gauche (vers le centre)
function addGateBars(pivot, side){
  // 8 barreaux verticaux, offset depuis le pivot vers le centre
  // Pivot gauche à X=-7.1, dernier barreau à -7.1 + 7.0 = -0.1 → rejoint le centre
  const barOffsets = [0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9, 6.85];
  barOffsets.forEach(dx=>{
    const bx = side * dx;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09,5.5,0.09), mGateBar);
    bar.position.set(bx,2.75,0); bar.castShadow=true; pivot.add(bar);
    // Pointe de lance
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07,0.35,4), mGateTip);
    tip.rotation.y = Math.PI/4;
    tip.position.set(bx,5.68,0); pivot.add(tip);
    // Boule déco sous la pointe
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055,6,5), mGateTip);
    ball.position.set(bx,5.36,0); pivot.add(ball);
  });
  // Barres horizontales (longueur = 7.1 du pivot jusqu'au centre)
  [5.1, 2.9, 0.9].forEach(hy=>{
    const halfW = 7.1;
    const hb = new THREE.Mesh(new THREE.BoxGeometry(halfW,0.13,0.10), mGateBar);
    hb.position.set(side * halfW/2, hy, 0); pivot.add(hb);
  });
}
// Vantail gauche : charnière à X=-7.1, barres vers la droite → side=+1
addGateBars(gateLeftPivot,  +1);
// Vantail droit  : charnière à X=+7.1, barres vers la gauche → side=-1
addGateBars(gateRightPivot, -1);

// ── CADENAS DORÉ ─────────────────────────────────────────────────
const padlockGroup = new THREE.Group();
padlockGroup.position.set(0, 2.0, 18.02);
scene.add(padlockGroup);
const plBody = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.24,0.12), mGold);
plBody.position.set(0,0,0); padlockGroup.add(plBody);
const plTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.12,12), mGold);
plTop.rotation.x = Math.PI/2; plTop.position.set(0,0.12,0); padlockGroup.add(plTop);
const plArc = new THREE.Mesh(new THREE.TorusGeometry(0.065,0.022,8,12,Math.PI), mGoldDark);
plArc.rotation.x = Math.PI/2; plArc.position.set(0,0.26,0); padlockGroup.add(plArc);
const plHole = new THREE.Mesh(new THREE.CircleGeometry(0.04,8), new THREE.MeshLambertMaterial({color:0x0a0a0a}));
plHole.position.set(0,0,0.065); padlockGroup.add(plHole);
const plSlot = new THREE.Mesh(new THREE.BoxGeometry(0.018,0.055,0.01), new THREE.MeshLambertMaterial({color:0x0a0a0a}));
plSlot.position.set(0,-0.05,0.065); padlockGroup.add(plSlot);

// État du portail
let gateAngle = 0;
let gateTargetAngle = 0;
let gateOpen = false;
function updatePadlock(){ padlockGroup.visible = !gateOpen; }
updatePadlock();
// ══════════════════════════════════════════════════════════════
// ─── M. BRENDARD (npcs/brendard.js) ─────────────────────────────────────
// Horloge du lycée : 2 min de jeu par seconde réelle ; la journée va de 8h à 17h puis recommence (il fait toujours jour).
const GAME_MIN_PER_SEC = 2.0;
let gameHour = 8.0;

const hooks = {
  camera: REALCAM,
  localCamera: camera,
  origin: ORIGIN,
  hour: () => gameHour,
  gate: {
    isOpen: () => gateOpen,
    set: (v) => { gateOpen = !!v; gateTargetAngle = v ? 1 : 0; updatePadlock(); }
  },
  door: (id) => DOORS.find(d => d.id === id),
  teleportPlayer: (x, z) => { camera.position.set(x, 1.7, z); _flushPlayer(); },
  ensureArea: (x, z) => {
    const cx = Math.round(x / CHUNK_SIZE), cz = Math.round(z / CHUNK_SIZE);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) generateChunk(cx + dx, cz + dz);
  }
};
const brendard = createBrendard(scene, hooks);
const gardener = brendard.group;   // (utilisé par les collisions et la carte)

// ─── MUR frontal GAUCHE — de X=-8 (pilier portail) à X=-24 (face bâtiment latéral), hauteur 7
// Centre à X = (-8 + -24)/2 = -16, largeur = 24-8 = 16
box(16, 7, 0.4, mStone, -16, 3.5, 18);
// Mur frontal DROIT — symétrique
box(16, 7, 0.4, mStone, 16, 3.5, 18);

// ─── MURS PÉRIMÈTRE LATÉRAUX (avec trous pour les portes ET les fenêtres) ────
// Fenêtres latérales : fw=2.4(en Z), fh=2.4, fcy=2.6 → fBot=1.4, fTop=3.8
// Mur gauche X=-24 :
//   Segment LONG  : Z=18 à Z=-8.25  (long=26.25)  → 4 fenêtres à Z=12, 6, 0, -5
//   Segment COURT : Z=-11.75 à Z=-19.5 (long=7.75) → 1 fenêtre  à Z=-15.6
{
  const X=-24, D=0.4, mS=mStone;
  const fw=1.8, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2, wallH=5;

  // === CÔTÉ LONG : Z=18 → -8.25 ===
  const longWins = [12, 5.5, -1, -6];
  const longZmin=-8.25, longZmax=18;
  // Bandes horizontales (sous et au-dessus des fenêtres)
  box(D, fBot,      longZmax-longZmin, mS, X, fBot/2,              (longZmin+longZmax)/2);
  box(D, wallH-fTop,longZmax-longZmin, mS, X, fTop+(wallH-fTop)/2, (longZmin+longZmax)/2);
  // Segments verticaux entre fenêtres
  const longCuts = [];
  let prev = longZmin;
  [...longWins].sort((a,b)=>a-b).forEach(wz=>{
    longCuts.push([prev, wz-fw/2]);
    prev = wz+fw/2;
  });
  longCuts.push([prev, longZmax]);
  longCuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });

  // === CÔTÉ COURT : Z=-11.75 → -19.5 ===
  const shortWin = -15.6;
  const shortZmin=-19.5, shortZmax=-11.75;
  box(D, fBot,      shortZmax-shortZmin, mS, X, fBot/2,              (shortZmin+shortZmax)/2);
  box(D, wallH-fTop,shortZmax-shortZmin, mS, X, fTop+(wallH-fTop)/2, (shortZmin+shortZmax)/2);
  const shortCuts = [[shortZmin, shortWin-fw/2],[shortWin+fw/2, shortZmax]];
  shortCuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });

  // Bandeau au-dessus du trou de porte — SUPPRIMÉ
  // box(D, 2, 3.5, mS, X, 6, -10);
}

// Mur droit X=+24, symétrique
{
  const X=24, D=0.4, mS=mStone;
  const fw=1.8, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2, wallH=5;

  const longWins = [12, 5.5, -1, -6];
  const longZmin=-8.25, longZmax=18;
  box(D, fBot,      longZmax-longZmin, mS, X, fBot/2,              (longZmin+longZmax)/2);
  box(D, wallH-fTop,longZmax-longZmin, mS, X, fTop+(wallH-fTop)/2, (longZmin+longZmax)/2);
  const longCuts = [];
  let prev = longZmin;
  [...longWins].sort((a,b)=>a-b).forEach(wz=>{
    longCuts.push([prev, wz-fw/2]);
    prev = wz+fw/2;
  });
  longCuts.push([prev, longZmax]);
  longCuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });

  const shortWin = -15.6;
  const shortZmin=-19.5, shortZmax=-11.75;
  box(D, fBot,      shortZmax-shortZmin, mS, X, fBot/2,              (shortZmin+shortZmax)/2);
  box(D, wallH-fTop,shortZmax-shortZmin, mS, X, fTop+(wallH-fTop)/2, (shortZmin+shortZmax)/2);
  const shortCuts = [[shortZmin, shortWin-fw/2],[shortWin+fw/2, shortZmax]];
  shortCuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });

  // Bandeau au-dessus du trou de porte droit — SUPPRIMÉ
  // box(D, 2, 3.5, mS, X, 6, -10);
}

// ─── FENÊTRES SUR MURS LATÉRAUX (verre dans plan XZ, axe Z) ──
function makeWindowZ(wx, wy, wz, side) {
  // side = -1 (mur gauche X=-24) ou +1 (mur droit X=+24)
  const fw=1.8, fh=2.4;
  const mFrameW = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mGlassW = new THREE.MeshLambertMaterial({color:0xb8d4e8, transparent:true, opacity:0.38, side:THREE.DoubleSide});
  const mMullion = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mBorder  = new THREE.MeshLambertMaterial({color:0x2e2e2e}); // gris très foncé bordure externe
  const ox = side*0.08; // léger décalage vers l'intérieur de la cour

  // ── BORDURE EXTERNE gris foncé ──
  const bThick=0.12, bExtra=0.32, bDepth=0.18;
  const box2 = side; // direction X d'extrusion
  // Haut
  box(bDepth, bThick, fw+bExtra, mBorder, wx+ox+box2*0.05, wy+fh/2+0.22, wz);
  // Bas
  box(bDepth, bThick, fw+bExtra, mBorder, wx+ox+box2*0.05, wy-fh/2-0.22, wz);
  // Gauche (en Z)
  box(bDepth, fh+bExtra, bThick, mBorder, wx+ox+box2*0.05, wy, wz-fw/2-0.22);
  // Droite (en Z)
  box(bDepth, fh+bExtra, bThick, mBorder, wx+ox+box2*0.05, wy, wz+fw/2+0.22);

  // Encadrement
  box(0.14, 0.14, fw+0.28, mFrameW, wx+ox, wy+fh/2+0.07, wz);
  box(0.20, 0.16, fw+0.36, mFrameW, wx+ox, wy-fh/2-0.08, wz);
  box(0.14, fh+0.14, 0.13, mFrameW, wx+ox, wy, wz-fw/2-0.065);
  box(0.14, fh+0.14, 0.13, mFrameW, wx+ox, wy, wz+fw/2+0.065);
  box(0.22, 0.10, fw+0.46, mFrameW, wx+ox, wy+fh/2+0.20, wz);

  // Carreaux 2 colonnes × 3 rangées
  const cw=(fw-0.14)/2, ch=(fh-0.18)/3;
  for(let col=0;col<2;col++){
    for(let row=0;row<3;row++){
      const gz = wz - fw/2 + 0.07 + cw*col + cw/2 + col*0.04;
      const gy = wy - fh/2 + 0.09 + ch*row + ch/2 + row*0.04;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(cw-0.05, ch-0.05), mGlassW);
      pane.position.set(wx+ox, gy, gz);
      pane.rotation.y = Math.PI/2;
      pane.castShadow=false; scene.add(pane);
    }
  }
  // Croisillons
  box(0.07, fh-0.04, 0.05, mMullion, wx+ox, wy, wz);
  for(let i=1;i<3;i++){
    const ty = wy - fh/2 + 0.09 + ch*i + (i-0.5)*0.04;
    box(0.07, 0.05, fw-0.05, mMullion, wx+ox, ty, wz);
  }
}

// Mur gauche — côté long (4 fenêtres)
makeWindowZ(-24, 2.6,  12,   1);
makeWindowZ(-24, 2.6,  5.5,  1);
makeWindowZ(-24, 2.6, -1,    1);
makeWindowZ(-24, 2.6, -6,    1);
// Mur gauche — côté court (1 fenêtre)
makeWindowZ(-24, 2.6, -15.6, 1);

// Mur droit — côté long (4 fenêtres)
makeWindowZ( 24, 2.6,  12,  -1);
makeWindowZ( 24, 2.6,  5.5, -1);
makeWindowZ( 24, 2.6, -1,   -1);
makeWindowZ( 24, 2.6, -6,   -1);
// Mur droit — côté court (1 fenêtre)
makeWindowZ( 24, 2.6, -15.6,-1);

// ─── MUR DU FOND avec trous pour fenêtres ────────────────────
// 3 fenêtres de chaque côté, éloignées de la porte principale
// Positions X : gauche -10, -14, -18.5 | droite +10, +14, +18.5
{
  const Z=-19.5, D=0.4, mS=mStone;
  const winXs = [-10, -14, -18.5];
  const fw=1.6, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
  const wallXmin=-24.75, wallXmax=-3.0, wallH=5;
  box(wallXmax-wallXmin, fBot, D, mS, (wallXmin+wallXmax)/2, fBot/2, Z);
  box(wallXmax-wallXmin, wallH-fTop, D, mS, (wallXmin+wallXmax)/2, fTop+(wallH-fTop)/2, Z);
  const cuts = [
    [wallXmin,          winXs[2]-fw/2],
    [winXs[2]+fw/2,     winXs[1]-fw/2],
    [winXs[1]+fw/2,     winXs[0]-fw/2],
    [winXs[0]+fw/2,     wallXmax     ],
  ];
  cuts.forEach(([x1,x2])=>{ const w=x2-x1; if(w>0.01) box(w,fh,D,mS,(x1+x2)/2,fcy,Z); });
}
{
  const Z=-19.5, D=0.4, mS=mStone;
  const winXs = [10, 14, 18.5];
  const fw=1.6, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
  const wallXmin=3.0, wallXmax=24.75, wallH=5;
  box(wallXmax-wallXmin, fBot, D, mS, (wallXmin+wallXmax)/2, fBot/2, Z);
  box(wallXmax-wallXmin, wallH-fTop, D, mS, (wallXmin+wallXmax)/2, fTop+(wallH-fTop)/2, Z);
  const cuts = [
    [wallXmin,          winXs[0]-fw/2],
    [winXs[0]+fw/2,     winXs[1]-fw/2],
    [winXs[1]+fw/2,     winXs[2]-fw/2],
    [winXs[2]+fw/2,     wallXmax     ],
  ];
  cuts.forEach(([x1,x2])=>{ const w=x2-x1; if(w>0.01) box(w,fh,D,mS,(x1+x2)/2,fcy,Z); });
}

// ─── GRANDE PORTE CENTRALE (Z=-19.5, X=0) ─────────────────────
// Intégrée dans le mur de façade : même plan, même épaisseur
// Ouverture : X=-2.7 à +2.7, hauteur 4.2. Mur au-dessus et sur les côtés bouché.
{
  const Z = -19.5, D = 0.4;
  const doorW = 5.4, doorH = 4.2;
  const wallH = 5;
  const mS = mStone;
  const mDoor = new THREE.MeshLambertMaterial({color:0x3a2810}); // bois foncé
  const mGold2 = new THREE.MeshLambertMaterial({color:0xc8980c}); // doré sobre

  // Mur au-dessus de la porte (même matériau que le reste de la façade)
  box(doorW, wallH - doorH, D, mS, 0, doorH + (wallH - doorH)/2, Z);

  // Piliers pierre intégrés au mur (légèrement saillants) de chaque côté
  [-doorW/2 - 0.3, doorW/2 + 0.3].forEach(px=>{
    box(0.6, wallH, D + 0.12, mS, px, wallH/2, Z);
  });

  // Linteau pierre au-dessus des vantaux, dans le mur
  box(doorW + 0.1, 0.3, D + 0.12, mS, 0, doorH + 0.15, Z);

  // Vantaux : 2 grands panneaux bois, pivotent vers l'intérieur
  const mainLeaves = [];
  [-1, 1].forEach(side=>{
    const pivot = new THREE.Group();
    pivot.position.set(side * (doorW/2 - 0.08), 0, Z + 0.05);
    scene.add(pivot);
    mainLeaves.push({pivot, side});
    const lo = -side * (doorW/4 - 0.04);

    // Panneau principal
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW/2 - 0.16, doorH - 0.08, 0.10), mDoor);
    leaf.position.set(lo, (doorH - 0.08)/2, 0);
    leaf.castShadow = true; pivot.add(leaf);

    // Cadre extérieur (baguette dorée)
    const bw = doorW/2 - 0.16, bh = doorH - 0.08;
    [[bw, 0.07, 0, bh/2], [bw, 0.07, 0, -bh/2],
     [0.07, bh, -bw/2, 0], [0.07, bh, bw/2, 0]].forEach(([fw,fh,fx,fy])=>{
      const b = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), mGold2);
      b.position.set(lo + fx, fy, 0.055); pivot.add(b);
    });

    // Panneau haut (séparé par une baguette horizontale)
    const sepY = doorH * 0.65;
    const ph = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.18, 0.05, 0.05), mGold2);
    ph.position.set(lo, sepY, 0.055); pivot.add(ph);

    // Poignée dorée
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), mGold2);
    hnd.rotation.z = Math.PI/2;
    hnd.position.set(lo * 2 * 0.85, doorH * 0.44, 0.12); pivot.add(hnd);
  });

  _W._mainPorteData = { leaves: mainLeaves };
}
// ──────────────────────────────────────────────────────────────

// ─── FENÊTRES STYLE HAUSSMANNIEN (3 rangées × 2 colonnes) ─────
function makeWindow(wx, wy, wz) {
  const fw = 1.6, fh = 2.4;
  const mFrameW = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mGlassW = new THREE.MeshLambertMaterial({color:0xb8d4e8, transparent:true, opacity:0.38, side:THREE.DoubleSide});
  const mMullion = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mBorder  = new THREE.MeshLambertMaterial({color:0x2e2e2e}); // gris très foncé bordure externe

  // ── BORDURE EXTERNE gris foncé (plan XY, mur Z=-19.5) ──
  const bThick=0.12, bExtra=0.32, bDepth=0.18;
  // Haut
  box(fw+bExtra, bThick, bDepth, mBorder, wx, wy+fh/2+0.22, wz+0.05);
  // Bas
  box(fw+bExtra, bThick, bDepth, mBorder, wx, wy-fh/2-0.22, wz+0.05);
  // Gauche
  box(bThick, fh+bExtra, bDepth, mBorder, wx-fw/2-0.22, wy, wz+0.05);
  // Droite
  box(bThick, fh+bExtra, bDepth, mBorder, wx+fw/2+0.22, wy, wz+0.05);

  box(fw+0.28, 0.14, 0.14, mFrameW, wx, wy+fh/2+0.07, wz+0.07);
  box(fw+0.36, 0.16, 0.20, mFrameW, wx, wy-fh/2-0.08, wz+0.10);
  box(0.13, fh+0.14, 0.14, mFrameW, wx-fw/2-0.065, wy, wz+0.07);
  box(0.13, fh+0.14, 0.14, mFrameW, wx+fw/2+0.065, wy, wz+0.07);
  box(fw+0.46, 0.10, 0.22, mFrameW, wx, wy+fh/2+0.20, wz+0.11);
  const cw = (fw - 0.14) / 2;
  const ch = (fh - 0.18) / 3;
  for(let col=0; col<2; col++){
    for(let row=0; row<3; row++){
      const gx = wx - fw/2 + 0.07 + cw*col + cw/2 + col*0.04;
      const gy = wy - fh/2 + 0.09 + ch*row + ch/2 + row*0.04;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(cw-0.05, ch-0.05), mGlassW);
      pane.position.set(gx, gy, wz+0.06);
      pane.castShadow=false; scene.add(pane);
    }
  }
  box(0.05, fh-0.04, 0.07, mMullion, wx, wy, wz+0.07);
  for(let i=1; i<3; i++){
    const ty = wy - fh/2 + 0.09 + ch*i + (i-0.5)*0.04;
    box(fw-0.05, 0.05, 0.07, mMullion, wx, ty, wz+0.07);
  }
}

// 3 fenêtres à gauche de la porte principale (éloignées)
makeWindow(-10,  2.6, -19.5);
makeWindow(-14,  2.6, -19.5);
makeWindow(-18.5, 2.6, -19.5);
// 3 fenêtres à droite de la porte principale (éloignées)
makeWindow( 10,  2.6, -19.5);
makeWindow( 14,  2.6, -19.5);
makeWindow( 18.5, 2.6, -19.5);




// ─── ARBRES (feuillage automnal beige/brun-vert, pas vert vif) ─
function makeTree(x,z,h=6,spread=3.5){
  const trunkM=new THREE.MeshLambertMaterial({color:0x5c4020});
  // Couleurs feuillage: tons rosés/beige doux comme l'image de référence (cerisier en fleurs, printemps)
  const lc=[0x4a7020, 0x3d6818, 0x567828, 0x486020, 0x5a7830];
  const leafColor=lc[Math.floor(Math.random()*lc.length)];
  const leafM=new THREE.MeshLambertMaterial({color:leafColor,transparent:true,opacity:0.95});
  const tg=new THREE.CylinderGeometry(0.12,0.22,h,7);
  const tm=new THREE.Mesh(tg,trunkM); tm.position.set(x,h/2,z); tm.castShadow=true; scene.add(tm);
  for(let b=0;b<3;b++){
    const angle=b*Math.PI*2/3;
    const bg2=new THREE.CylinderGeometry(0.05,0.1,1.5,5);
    const bm=new THREE.Mesh(bg2,trunkM);
    bm.position.set(x+Math.cos(angle)*0.6,h*0.7,z+Math.sin(angle)*0.6);
    bm.rotation.z=Math.cos(angle)*0.4; bm.rotation.x=Math.sin(angle)*0.4;
    bm.castShadow=true; scene.add(bm);
  }
  const blobs=[
    [0,0,spread*0.9,spread*0.6,spread*0.9],
    [spread*0.5,spread*0.15,spread*0.75,spread*0.5,spread*0.75],
    [-spread*0.5,spread*0.1,spread*0.75,spread*0.5,spread*0.75],
    [spread*0.25,-spread*0.15,spread*0.65,spread*0.45,spread*0.65],
    [-spread*0.3,-spread*0.1,spread*0.6,spread*0.4,spread*0.6],
  ];
  blobs.forEach(([ox,oz,rx,ry,rz])=>{
    const lg=new THREE.SphereGeometry(1,8,6);
    const lm=new THREE.Mesh(lg,leafM);
    lm.scale.set(rx,ry*0.7,rz);
    lm.position.set(x+ox, h+ry*0.3, z+oz);
    lm.castShadow=true; scene.add(lm);
  });
}

// Arbres le long du chemin central (allée portail → porte principale, axe X=0)
// Chemin central: Z de +17 à -21, largeur 5.5 → bordure à X≈±3.5
// Arbres le long du chemin central — seulement ceux dans le périmètre (Z entre -19.5 et 18)
[-1, 1].forEach(side=>{
  const tx = side * 5.5;
  [-2, -7, -13, 5, 10].forEach(tz=>{
    makeTree(tx, tz, 6.5, 3.5);
  });
});

// Arbres le long du bras gauche
[-1, 1].forEach(side=>{
  const tz = -10 + side * 5.5;
  [-5, -11, -17].forEach(tx=>{
    makeTree(tx, tz, 6, 3.2);
  });
});

// Arbres le long du bras droit
[-1, 1].forEach(side=>{
  const tz = -10 + side * 5.5;
  [5, 11, 17].forEach(tx=>{
    makeTree(tx, tz, 6, 3.2);
  });
});

// ─── ARBUSTES (seulement dans le périmètre) ─────────────────────────
function bush(x,z,w=1.5,h=1.2,d=1.2){
  const g=new THREE.SphereGeometry(1,7,5);
  const m=new THREE.Mesh(g,mBush); m.scale.set(w,h,d);
  m.position.set(x,h*0.5,z); m.castShadow=true; scene.add(m);
}
[-12,12].forEach(x=>{ bush(x,10,1.2,1,1.2); bush(x,13,1.2,1,1.2); });
// Buissons quadrants bas
[-20,-16,-12,  12,16,20].forEach(x=>{ bush(x,-15,1.3,1,1.3); bush(x,-18,1.3,1,1.3); });

// ─── BANCS (corrigés: assise + dossier bien orientés) ────────
function bench(x,z,ry=0){
  const woodBM=new THREE.MeshLambertMaterial({color:0xc8a050});
  const ironM=new THREE.MeshLambertMaterial({color:0x222233});

  // Groupe pour faciliter la rotation
  const group=new THREE.Group();
  group.position.set(x,0,z);
  group.rotation.y=ry;
  scene.add(group);

  function gbox(w,h,d,mat,px,py,pz){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(px,py,pz);
    mesh.castShadow=true; mesh.receiveShadow=true;
    group.add(mesh);
  }

  // Assise (planches horizontales, plus larges)
  gbox(2.2, 0.08, 0.5, woodBM, 0, 0.44, 0);
  gbox(2.2, 0.08, 0.5, woodBM, 0, 0.36, 0);

  // Dossier
  const backMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.5,0.08), woodBM);
  backMesh.position.set(0, 0.75, -0.28);
  backMesh.rotation.x = -0.18;
  backMesh.castShadow=true;
  group.add(backMesh);

  // Pieds (4 en métal — bien sous l'assise)
  [-0.85, 0.85].forEach(dx=>{
    [-0.2, 0.2].forEach(dz=>{
      gbox(0.07, 0.45, 0.07, ironM, dx, 0.22, dz);
    });
  });
}

// Bancs sur le bord des pelouses, face au chemin central (axe X=0)
// Quadrant haut-gauche : bord droit de la pelouse, éloigné du tableau
bench(-4.5, 8, Math.PI/2);
// Quadrant haut-droit : bord gauche de la pelouse
bench(4.5, 8, -Math.PI/2);
// Bancs face au bras horizontal (axe Z=-10), dossier vers la pelouse (Z+), face vers Z-
bench(-13, -6.5, Math.PI);
bench(13, -6.5, Math.PI);

// ─── LAMPADAIRES ─────────────────────────────────────────────
function lamp(x,z){
  const ironM2=new THREE.MeshLambertMaterial({color:0x1a1a1a});
  const bulbM=new THREE.MeshBasicMaterial({color:0xffe8a0});
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.07,5,8),ironM2);
  p.position.set(x,2.5,z); p.castShadow=true; scene.add(p);
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.2,6),ironM2);
  arm.position.set(x+0.55,5.1,z); arm.rotation.z=Math.PI/6; scene.add(arm);
  const lg=new THREE.SphereGeometry(0.18,8,6);
  const lm=new THREE.Mesh(lg,bulbM); lm.position.set(x+0.9,5,z); scene.add(lm);
  const cap=new THREE.Mesh(new THREE.ConeGeometry(0.22,0.25,6),ironM2);
  cap.position.set(x+0.9,5.28,z); scene.add(cap);
}
lamp(-16,-2); lamp(16,-2); lamp(-16,-18); lamp(16,-18);

// ─── TABLEAU D'AFFICHAGE (panneau vitré avec feuilles collées) ─
// Données des classes
const classData = [
  {
    title: "Classe A",
    students: ["Julien Moreau","Camille Bernard","Antoine Lefèvre","Sophie Laurent","Darsen Lucy","Hugo Martin","Clara Dubois","Nathan Petit"]
  },
  {
    title: "Classe B",
    students: ["Élodie Garnier","Maxime Roux","Léa Fontaine","Thomas Chevalier","Inès Mercier","Lucas Girard","Manon Faure","Alexis Renault"]
  },
  {
    title: "Classe C",
    students: ["Chloé Lambert","Gabriel Simon","Emma Renaud","Victor Blanchard","Bellamy Clematis","Sarah Noël","Enzo Perrin","Julie Caron"]
  },
  {
    title: "Classe D",
    students: ["Mathis Olivier","Jade Picard","Arthur Pascal","Zoé Marchand","Louis Gauthier","Anaïs Leroy","Quentin Meyer","Pauline Roche"]
  }
];

function makeClassTexture(classInfo){
  const cw=256, ch=320;
  const c=document.createElement('canvas'); c.width=cw; c.height=ch;
  const x=c.getContext('2d');
  x.fillStyle='#faf8f2'; x.fillRect(0,0,cw,ch);
  const grad=x.createLinearGradient(0,0,cw,ch);
  grad.addColorStop(0,'rgba(255,255,255,0)');
  grad.addColorStop(1,'rgba(180,160,120,0.08)');
  x.fillStyle=grad; x.fillRect(0,0,cw,ch);
  x.strokeStyle='rgba(100,90,70,0.25)'; x.lineWidth=2; x.strokeRect(1,1,cw-2,ch-2);
  x.fillStyle='#2a3a2a'; x.fillRect(0,0,cw,38);
  x.font='bold 18px Georgia, serif'; x.fillStyle='#f5f0e0'; x.textAlign='center';
  x.fillText(classInfo.title, cw/2, 25);
  x.font='13px Georgia, serif'; x.fillStyle='#2a2820'; x.textAlign='left';
  classInfo.students.forEach((student, i)=>{
    const yPos = 60 + i * 30;
    x.fillStyle='#5a7040'; x.beginPath(); x.arc(22, yPos-4, 3, 0, Math.PI*2); x.fill();
    x.fillStyle='#2a2820'; x.fillText(student, 34, yPos);
    if(i < classInfo.students.length-1){
      x.strokeStyle='rgba(180,160,120,0.3)'; x.lineWidth=0.5;
      x.beginPath(); x.moveTo(14, yPos+12); x.lineTo(cw-14, yPos+12); x.stroke();
    }
  });
  return _CT(c);
}

// Tableau collé contre le mur droit (X≈23.5), face vers l'intérieur (vers X-)
// Quand on entre par le portail (Z=18), on marche vers Z- et on voit le tableau sur sa droite
// Le tableau est perpendiculaire au mur droit, face côté cour (face vers X-)
// Tableau bien avancé vers le portail, pas collé au mur (X=18 au lieu de 23)
const TAB_X = 4.0, TAB_Z = 3.0, TAB_Y_BASE = 0;
const boardDepth = 0.25;
const boardW = 4.2, boardH = 2.6;

// Poteau de support — tableau orienté face vers le portail (vers Z+)
const mPillar = new THREE.MeshLambertMaterial({color:0x2a2a35});
const poleGeo = new THREE.CylinderGeometry(0.06,0.08,3.2,8);
const poleMesh = new THREE.Mesh(poleGeo, mPillar);
poleMesh.position.set(TAB_X, 1.6, TAB_Z+boardW/2+0.1);
scene.add(poleMesh);
// Deuxième pied
const poleMesh2 = new THREE.Mesh(poleGeo, mPillar);
poleMesh2.position.set(TAB_X, 1.6, TAB_Z-boardW/2-0.1);
scene.add(poleMesh2);

// Corps du tableau: largeur le long de Z, profondeur le long de X
// box(w,h,d, ...) — ici on veut largeur=boardW en Z, profondeur=boardDepth en X
const boardMat = new THREE.MeshLambertMaterial({color:0x282c28});
const boardGeo = new THREE.BoxGeometry(boardDepth, boardH, boardW);
const boardMesh = new THREE.Mesh(boardGeo, boardMat);
boardMesh.position.set(TAB_X, TAB_Y_BASE+boardH/2+0.4, TAB_Z);
boardMesh.castShadow=true; boardMesh.receiveShadow=true;
scene.add(boardMesh);

// Cadre métal
const frameMat = mMetal2;
// Haut et bas
[TAB_Y_BASE+0.4, TAB_Y_BASE+boardH+0.4].forEach(fy=>{
  const f=new THREE.Mesh(new THREE.BoxGeometry(boardDepth+0.05,0.1,boardW+0.2),frameMat);
  f.position.set(TAB_X,fy,TAB_Z); scene.add(f);
});
// Côtés gauche/droit (en Z)
[TAB_Z-boardW/2, TAB_Z+boardW/2].forEach(fz=>{
  const f=new THREE.Mesh(new THREE.BoxGeometry(boardDepth+0.05,boardH,0.1),frameMat);
  f.position.set(TAB_X,TAB_Y_BASE+boardH/2+0.4,fz); scene.add(f);
});

// Auvent (toit du tableau), avance vers X- (côté cour)
const roofBoard=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.15,boardW+0.4),frameMat);
roofBoard.position.set(TAB_X-0.3, TAB_Y_BASE+boardH+0.5, TAB_Z);
scene.add(roofBoard);

// Feuilles de classe collées sur la face intérieure du tableau (face vers X-)
// Les feuilles sont des PlaneGeometry dans le plan YZ, face vers X- (rotation.y = -Math.PI/2)
const sheetOffsets = [-1.45, -0.45, 0.45, 1.45]; // décalage en Z
classData.forEach((cls, i)=>{
  const tex = makeClassTexture(cls);
  const sheetMat = new THREE.MeshBasicMaterial({map:tex, side:THREE.DoubleSide});
  const sheetGeo = new THREE.PlaneGeometry(0.88, 1.1);
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.position.set(
    TAB_X - boardDepth/2 - 0.02,  // légèrement devant la face du tableau
    TAB_Y_BASE + boardH/2 + 0.38,
    TAB_Z + sheetOffsets[i]
  );
  // Face vers X- (visible depuis l'intérieur de la cour)
  sheet.rotation.y = -Math.PI/2;
  scene.add(sheet);
});

// ═══════════════════════════════════════════════════════
// ─── CHEMIN EN CROIX SYMÉTRIQUE (portail → 3 portes) ──
// ═══════════════════════════════════════════════════════
const mDalle = new THREE.MeshLambertMaterial({
  color: 0xd4c8a8,
  map: (()=>{
    const tex = makeTex((x,s)=>{
      x.fillStyle='#cec0a0'; x.fillRect(0,0,s,s);
      // Grandes dalles rectangulaires
      for(let row=0;row<4;row++){
        const off = row%2===0?0:s/8;
        for(let col=0;col<5;col++){
          const bx=col*(s/4)+off, by=row*(s/4);
          const v=200+Math.random()*25;
          x.fillStyle=`rgb(${v},${Math.round(v*0.92)},${Math.round(v*0.76)})`;
          x.fillRect(bx+2,by+2,s/4-3,s/4-3);
        }
      }
      x.strokeStyle='rgba(100,85,60,0.35)'; x.lineWidth=2;
      for(let i=0;i<=s;i+=s/4){
        x.beginPath();x.moveTo(i,0);x.lineTo(i,s);x.stroke();
        x.beginPath();x.moveTo(0,i);x.lineTo(s,i);x.stroke();
      }
    },256);
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(3,12);
    return tex;
  })()
});
const mDalleBord = new THREE.MeshLambertMaterial({color:0xa89878});

// Allée centrale: portail (Z=17) → porte principale (Z≈-21)
// Centre Z = (17 + -21)/2 = -2, longueur = 38
{
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 38), mDalle);
  pl.rotation.x=-Math.PI/2; pl.position.set(0, 0.025, -2); pl.receiveShadow=true; scene.add(pl);
  // Bordures
  [-2.9, 2.9].forEach(bx=>{
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 38.4), mDalleBord);
    b.position.set(bx, 0.05, -2); scene.add(b);
  });
}

// Bras gauche: croisement (X=0,Z=-10) → porte latérale gauche (X=-24, Z=-10)
// Centre X = (0+-24)/2 = -12, longueur = 24
{
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(24, 5.5), mDalle);
  pl.rotation.x=-Math.PI/2; pl.position.set(-12, 0.025, -10); pl.receiveShadow=true; scene.add(pl);
  [-2.9, 2.9].forEach(bz=>{
    const b = new THREE.Mesh(new THREE.BoxGeometry(24.4, 0.1, 0.2), mDalleBord);
    b.position.set(-12, 0.05, -10+bz); scene.add(b);
  });
}

// Bras droit: croisement (X=0,Z=-10) → porte latérale droite (X=+24, Z=-10)
{
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(24, 5.5), mDalle);
  pl.rotation.x=-Math.PI/2; pl.position.set(12, 0.025, -10); pl.receiveShadow=true; scene.add(pl);
  [-2.9, 2.9].forEach(bz=>{
    const b = new THREE.Mesh(new THREE.BoxGeometry(24.4, 0.1, 0.2), mDalleBord);
    b.position.set(12, 0.05, -10+bz); scene.add(b);
  });
}

// Petits carrés de jonction aux intersections (couvre le chemin)
{
  const junc = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), mDalle);
  junc.rotation.x=-Math.PI/2; junc.position.set(0, 0.03, -10); junc.receiveShadow=true; scene.add(junc);
}



// ═══════════════════════════════════════════════════════


// Feuilles au sol
const leafGround=new THREE.MeshLambertMaterial({color:0xa09050,transparent:true,opacity:0.3});
for(let i=0;i<30;i++){
  const lg2=new THREE.PlaneGeometry(0.3+Math.random()*0.4,0.2+Math.random()*0.3);
  const lm2=new THREE.Mesh(lg2,leafGround);
  lm2.rotation.x=-Math.PI/2; lm2.rotation.z=Math.random()*Math.PI;
  lm2.position.set((Math.random()-0.5)*30,0.01,(Math.random()-0.5)*20-5);
  scene.add(lm2);
}

// ─── FLEURS SUR LA PELOUSE ────────────────────────────────────
// Les fleurs sont dans les zones d'herbe (entre les chemins, hors allées)
// Zones: quadrants entre les bras du chemin en croix
function makeFlower(x, z) {
  const colors = [0xff6688, 0xffcc33, 0xff9944, 0xffffff, 0xff4488, 0xffee55];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const stemM = new THREE.MeshLambertMaterial({color:0x3a7020});
  const petalM = new THREE.MeshLambertMaterial({color, side:THREE.DoubleSide});
  const centerM = new THREE.MeshLambertMaterial({color:0xffe060});
  // Tige
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.3,4), stemM);
  stem.position.set(x, 0.15, z); scene.add(stem);
  // Pétales (4 petits disques autour du centre)
  for(let p=0;p<4;p++){
    const ang = p * Math.PI/2 + Math.random()*0.3;
    const petal = new THREE.Mesh(new THREE.CircleGeometry(0.1, 5), petalM);
    petal.rotation.x = -Math.PI/2 + 0.3;
    petal.rotation.z = ang;
    petal.position.set(x + Math.cos(ang)*0.08, 0.32, z + Math.sin(ang)*0.08);
    scene.add(petal);
  }
  // Centre jaune
  const center = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), centerM);
  center.rotation.x = -Math.PI/2; center.position.set(x, 0.33, z); scene.add(center);
}

const flowerZones = [
  {minX:-22, maxX:-6, minZ:-4, maxZ:12},
  {minX:6, maxX:22, minZ:-4, maxZ:12},
  {minX:-22, maxX:-6, minZ:-19, maxZ:-14},
  {minX:6, maxX:22, minZ:-19, maxZ:-14},
];
for(let i=0;i<50;i++){
  const zone = flowerZones[Math.floor(Math.random()*flowerZones.length)];
  const fx = zone.minX + Math.random()*(zone.maxX - zone.minX);
  const fz = zone.minZ + Math.random()*(zone.maxZ - zone.minZ);
  makeFlower(fx, fz);
}

// ─── CIEL (lumineux, chaud, comme l'image de référence) ───────
// Gradient sky: bleu pâle en haut, blanc laiteux chaud en bas
const skyCanvas=document.createElement('canvas');
skyCanvas.width=1; skyCanvas.height=256;
const skyCtx=skyCanvas.getContext('2d');
const skyGrad=skyCtx.createLinearGradient(0,0,0,256);
skyGrad.addColorStop(0,'#3a7fc1');    // bleu vif profond en haut
skyGrad.addColorStop(0.35,'#5a9fd4'); // bleu ciel vif
skyGrad.addColorStop(0.7,'#a8ccec'); // bleu pâle
skyGrad.addColorStop(1,'#dceef8');   // blanc laiteux à l'horizon
skyCtx.fillStyle=skyGrad;
skyCtx.fillRect(0,0,1,256);
const skyTex=_CT(skyCanvas);
const skyMat=new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,transparent:true,opacity:0,depthWrite:false,fog:false});
const skySphere=new THREE.Mesh(new THREE.SphereGeometry(1700,24,16),skyMat);
skySphere.renderOrder=-99; skySphere.frustumCulled=false; skySphere.visible=false;
scene.add(skySphere);

// Nuages blancs bien définis, bouffants
function cloud(x,y,z,scale=1){
  const m=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.95});
  const mShadow=new THREE.MeshBasicMaterial({color:0xe0e8f0,transparent:true,opacity:0.7});
  [[0,0,0,4,1.4,3,'m'],[3.2,0.5,0,3,1.5,2.4,'m'],[-3,0.4,0,2.8,1.2,2.2,'m'],
   [1,-0.4,0,2.2,1,1.8,'s'],[-1.5,-0.3,0,2,0.9,1.6,'s'],[0,0.8,0,2.5,1,2,'m']].forEach(([dx,dy,dz,w,h,d,shade])=>{
    const c=new THREE.Mesh(new THREE.SphereGeometry(1,7,5),shade==='s'?mShadow:m);
    c.scale.set(w*scale,h*scale,d*scale); c.position.set(x+dx*scale,y+dy*scale,z+dz*scale); scene.add(c);
  });
}
cloud(-40,30,-65,1.5); cloud(25,35,-72,1.3); cloud(55,28,-58,1.2);
cloud(-20,33,-85,1.0); cloud(65,30,-42,1.4); cloud(-65,28,-48,1.1);
cloud(-35,38,-52,1.7); cloud(40,32,-68,1.1); cloud(10,36,-90,1.0);

// ─── SYSTÈME PORTES INTERACTIVES ────────────────────────────────

// Matériau surbrillance (outline lumineux)
const mGlow = new THREE.MeshBasicMaterial({color:0xffe080, transparent:true, opacity:0.18, side:THREE.FrontSide});

// ─── PORTES LATÉRALES INTERACTIVES (X=±24, Z=-10) ────────────
function makeSideDoor(faceX, outDir){
  const doorZ = -10, doorW = 3.0, doorH = 4.2;
  const mStoneLight = new THREE.MeshLambertMaterial({color:0xe0d8c0});
  const mDarkPanel  = new THREE.MeshLambertMaterial({color:0x3a2010});

  // Piliers de chaque côté
  [-doorW/2-0.15, doorW/2+0.15].forEach(dz=>{
    box(0.5, doorH+0.4, 0.45, mStoneLight, faceX+outDir*0.08, (doorH+0.4)/2, doorZ+dz);
  });
  // Linteau
  box(0.4, 0.4, doorW+0.8, mStoneLight, faceX+outDir*0.08, doorH+0.2, doorZ);

  // Vantaux sur pivots
  const leaves = [];
  const leafW = doorW/2 - 0.08;
  [-1, 1].forEach(lr=>{
    const pivot = new THREE.Group();
    pivot.position.set(faceX+outDir*0.3, 0, doorZ + lr*(doorW/2-0.05));
    scene.add(pivot);
    leaves.push({pivot, lr});
    const localZ = -lr*(leafW/2);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.14, doorH-0.1, leafW), mWood);
    leaf.position.set(0, (doorH-0.1)/2, localZ); leaf.castShadow=true; pivot.add(leaf);
    [0.75, 0.42, 0.14].forEach((yr, pi)=>{
      const ph=[1.0,1.1,0.75][pi];
      const p=new THREE.Mesh(new THREE.BoxGeometry(0.07,ph,leafW-0.2),mDarkPanel);
      p.position.set(outDir*0.04, doorH*yr, localZ); pivot.add(p);
    });
    const gl=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.65,leafW-0.25),mWinGlass);
    gl.position.set(outDir*0.04, doorH-0.5, localZ); pivot.add(gl);
    // Poignée côté cour (face outDir)
    const hndS=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.22,8),new THREE.MeshLambertMaterial({color:0xc8a030}));
    hndS.rotation.x=Math.PI/2; hndS.position.set(outDir*0.12, doorH*0.5, localZ*2*0.9); pivot.add(hndS);
  });
  return { leaves, pos: new THREE.Vector3(faceX+outDir*0.2, 1.7, doorZ), outDir };
}
const sdL = makeSideDoor(-24, 1);
const sdR = makeSideDoor( 24,-1);

// ─── PORTE DU FOND (grande, Z=-27, parallèle à la porte principale) ────────

// Texture nom sur vantail de porte
function makeDoorLabelTex(label) {
  const cw = 256, ch = 512;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  // Fond bois
  ctx.fillStyle = '#6a4820'; ctx.fillRect(0, 0, cw, ch);
  for(let i = 0; i < ch; i += 4) {
    ctx.fillStyle = `rgba(${80+Math.random()*30},${50+Math.random()*20},${20+Math.random()*15},0.18)`;
    ctx.fillRect(0, i, cw, 2);
  }
  // Plaquette laiton centrale
  const px = 20, py = ch*0.28, pw = cw-40, ph = ch*0.22;
  ctx.fillStyle = '#c8a020'; ctx.fillRect(px-3, py-3, pw+6, ph+6);
  const g = ctx.createLinearGradient(px, py, px+pw, py+ph);
  g.addColorStop(0, '#e8c840'); g.addColorStop(0.5, '#d4aa28'); g.addColorStop(1, '#b08820');
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#7a5810'; ctx.lineWidth = 3;
  ctx.strokeRect(px+4, py+4, pw-8, ph-8);
  // Texte
  ctx.fillStyle = '#1a0e04'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Gestion multiline (séparation par \n)
  const lines = label.split('\n');
  const fontSize = label.length > 12 ? 26 : 32;
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  const lineH = fontSize * 1.3;
  lines.forEach((line, i) => {
    const ty = py + ph/2 + (i - (lines.length-1)/2) * lineH;
    ctx.fillText(line, cw/2, ty);
  });
  return _CT(cv);
}

function makeBackDoor(){
  const doorW = 4.4, doorH = 4.6;
  const mStoneLight = new THREE.MeshLambertMaterial({color:0xe0d8c0});

  // Piliers de chaque côté
  [-doorW/2-0.2, doorW/2+0.2].forEach(dx=>{
    box(0.55, doorH+0.5, 0.5, mStoneLight, dx, (doorH+0.5)/2, -27+0.15);
    // Chapiteau
    box(0.75, 0.22, 0.7, new THREE.MeshLambertMaterial({color:0xd4ccb8}), dx, doorH+0.5, -27+0.15);
  });
  // Linteau
  box(doorW+1.2, 0.45, 0.5, mStoneLight, 0, doorH+0.22, -27+0.15);

  // 2 vantaux animés
  const leaves = [];
  [-1, 1].forEach((side, idx)=>{
    const pivot = new THREE.Group();
    pivot.position.set(side*(doorW/2-0.05), 0, -27+0.1);
    scene.add(pivot);
    leaves.push({pivot, side});
    const lo = -side*(doorW/4);

    // Vantail idx==1 (side=+1) → label Bureau du Principal visible depuis la cour (Z+)
    const leafMat = idx === 1
      ? new THREE.MeshLambertMaterial({map: makeDoorLabelTex('Bureau du\nPrincipal')})
      : mWood;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.1, doorH-0.1, 0.1), leafMat);
    leaf.position.set(lo, (doorH-0.1)/2, 0); leaf.castShadow=true; pivot.add(leaf);
    // Panneaux décoratifs
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.5, 0.07), new THREE.MeshLambertMaterial({color:0x4a3018}));
    p1.position.set(lo, doorH*0.75, -0.06); pivot.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.3, 0.07), new THREE.MeshLambertMaterial({color:0x4a3018}));
    p2.position.set(lo, doorH*0.38, -0.06); pivot.add(p2);
    // Vitre supérieure
    const gl = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.5, 0.9, 0.05), mWinGlass);
    gl.position.set(lo, doorH-0.6, -0.05); pivot.add(gl);
    // Poignée côté cour (Z+)
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.28,8), new THREE.MeshLambertMaterial({color:0xc8a030}));
    hnd.rotation.z=Math.PI/2; hnd.position.set(lo*2*0.9, doorH*0.5, 0.13); pivot.add(hnd);
  });

  return {
    leaves,
    pos: new THREE.Vector3(0, 1.7, -26.5),
    outDir: 0,
    isBack: true
  };
}
const sdBack = makeBackDoor();

// ─── CHAMBRE VIDE derrière la porte du fond ────
// Limites : X -20.21 à +14.80, Z -27 à -35.50
{
  const roomXmin = -20.21, roomXmax = 14.80;
  const roomZfront = -27, roomZback = -35.50;
  const roomW = roomXmax - roomXmin;         // 35.01
  const roomD = roomZback - roomZfront;      // -8.50 (négatif donc abs)
  const roomCX = (roomXmin + roomXmax) / 2;  // -2.705
  const roomCZ = (roomZfront + roomZback) / 2; // -31.25
  const roomH = 5;
  const wallT = 0.35;
  const mRoom = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloor = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeiling = new THREE.MeshLambertMaterial({color:0xe8e0cc});

  // Sol
  const floorPl = new THREE.Mesh(new THREE.PlaneGeometry(roomW, Math.abs(roomD)), mFloor);
  floorPl.rotation.x = -Math.PI/2;
  floorPl.position.set(roomCX, 0.01, roomCZ);
  floorPl.receiveShadow = true;
  scene.add(floorPl);

  // Plafond découpé : on enlève la zone cage d'escalier (X=-20.21 à -12.23)
  // Seule la partie droite (X=-12.23 à +14.80) a un plafond
  const stairCutXmax = -12.23;
  const ceilRightW = roomXmax - stairCutXmax;
  const ceilRightCX = (stairCutXmax + roomXmax) / 2;
  const ceilPl = new THREE.Mesh(new THREE.PlaneGeometry(ceilRightW, Math.abs(roomD)), mCeiling);
  ceilPl.rotation.x = Math.PI/2;
  ceilPl.position.set(ceilRightCX, roomH, roomCZ);
  scene.add(ceilPl);

  // Mur gauche (X = roomXmin) — avec 1 fenêtre à mi-profondeur
  {
    const fw2=1.8, fh=2.4, fcy=roomH/2, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wz=roomCZ; // fenêtre au centre de la profondeur
    box(wallT, fBot,       Math.abs(roomD), mRoom, roomXmin, fBot/2,             roomCZ);
    box(wallT, roomH-fTop, Math.abs(roomD), mRoom, roomXmin, fTop+(roomH-fTop)/2,roomCZ);
    [[roomZfront,wz-fw2/2],[wz+fw2/2,roomZback]].forEach(([z1,z2])=>{const l=z2-z1;if(Math.abs(l)>0.01)box(wallT,fh,Math.abs(l),mRoom,roomXmin,fcy,(z1+z2)/2);});
    makeWindowX(roomXmin, fcy, wz, +1);
  }
  // Mur droit (X = roomXmax) — avec 1 fenêtre à mi-profondeur
  {
    const fw2=1.8, fh=2.4, fcy=roomH/2, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wz=roomCZ;
    box(wallT, fBot,       Math.abs(roomD), mRoom, roomXmax, fBot/2,             roomCZ);
    box(wallT, roomH-fTop, Math.abs(roomD), mRoom, roomXmax, fTop+(roomH-fTop)/2,roomCZ);
    [[roomZfront,wz-fw2/2],[wz+fw2/2,roomZback]].forEach(([z1,z2])=>{const l=z2-z1;if(Math.abs(l)>0.01)box(wallT,fh,Math.abs(l),mRoom,roomXmax,fcy,(z1+z2)/2);});
    makeWindowX(roomXmax, fcy, wz, -1);
  }
  // Mur du fond (Z = roomZback) — avec 2 fenêtres réparties
  {
    const fw2=1.6, fh=2.4, fcy=roomH/2, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const winXs=[-8, 6];
    box(roomW+wallT*2, fBot,       wallT, mRoom, roomCX, fBot/2,             roomZback);
    box(roomW+wallT*2, roomH-fTop, wallT, mRoom, roomCX, fTop+(roomH-fTop)/2,roomZback);
    {const cuts=[]; let p=roomXmin; winXs.forEach(wx=>{cuts.push([p,wx-fw2/2]);p=wx+fw2/2;}); cuts.push([p,roomXmax]);
     cuts.forEach(([x1,x2])=>{const w=x2-x1;if(w>0.01)box(w,fh,wallT,mRoom,(x1+x2)/2,fcy,roomZback);});}
    winXs.forEach(wx => makeWindow(wx, fcy, roomZback));
  }

  // Mur avant avec trou pour la porte (Z = -27)
  // Porte centrée en X=0, largeur 4.4
  const bdoorW = 4.4;
  // Segment gauche : de roomXmin à -bdoorW/2
  // Segment gauche avec ouverture à X=-17.91 (largeur 3.0) — ne touche ni surveillant (X<-20.21) ni bureau (X>-12.23)
  box(0.80, roomH, wallT, mRoom, -19.81, roomH/2, roomZfront); // X=-20.21 à -19.41
  box(14.21, roomH, wallT, mRoom, -9.305, roomH/2, roomZfront); // X=-16.41 à -2.2
  box(3.2, roomH - 4.2, wallT, mRoom, -17.91, 4.2 + (roomH-4.2)/2, roomZfront); // bandeau dessus
  // Segment droit : de +bdoorW/2 à roomXmax
  const rightSegW = roomXmax - bdoorW/2;
  const rightSegCX = bdoorW/2 + rightSegW/2;
  box(rightSegW, roomH, wallT, mRoom, rightSegCX, roomH/2, roomZfront);
  // Bandeau au-dessus de la porte
  box(bdoorW + 0.4, roomH - 4.6, wallT, mRoom, 0, 4.6 + (roomH - 4.6)/2, roomZfront);

  // ─── MUR DE SÉPARATION à X=-12.23 (arrête la chambre du principal ici) ───
  box(wallT, roomH, Math.abs(roomD), mRoom, -12.23, roomH/2, roomCZ);

  // Lumières réparties dans la chambre
  [-10, 2, roomCX+8].forEach(lx => {
    const roomLight = new THREE.PointLight(0xffe8c0, 0.5, 14);
    roomLight.position.set(lx, roomH - 0.5, roomCZ);
    scene.add(roomLight);
    // Ampoule
    const bulbMat2 = new THREE.MeshBasicMaterial({color: 0xffe8a0});
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bulbMat2);
    bulb.position.set(lx, roomH - 0.4, roomCZ);
    scene.add(bulb);
    // Fil
    const wireMat2 = new THREE.MeshLambertMaterial({color:0x222222});
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), wireMat2);
    wire.position.set(lx, roomH - 0.15, roomCZ);
    scene.add(wire);
  });
}

// ─── CHAMBRE VIDE GAUCHE (à gauche de la chambre principale, porte mystère) ────
// Position : X -20.21 (mur partagé) → X -27.5 (mur latéral gauche)
//            Z -27 (mur avant, porte à X=-23.17) → Z -35.50 (mur du fond aligné)
{
  const rXmin = -36.0,   rXmax = -20.21;   // paroi droite = mur gauche chambre principale, paroi gauche = mur extérieur 2e couloir
  const rZfront = -27,   rZback = -35.50;
  const rW  = rXmax - rXmin;               // ~7.29
  const rD  = Math.abs(rZback - rZfront);  // 8.50
  const rCX = (rXmin + rXmax) / 2;         // ~-23.855
  const rCZ = (rZfront + rZback) / 2;      // -31.25
  const rH  = 5, wT = 0.35;
  const mRoom    = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloor   = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeiling = new THREE.MeshLambertMaterial({color:0xe8e0cc});

  // Sol
  const floorPl2 = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mFloor);
  floorPl2.rotation.x = -Math.PI/2;
  floorPl2.position.set(rCX, 0.01, rCZ);
  floorPl2.receiveShadow = true;
  scene.add(floorPl2);

  // Plafond
  const ceilPl2 = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mCeiling);
  ceilPl2.rotation.x = Math.PI/2;
  ceilPl2.position.set(rCX, rH, rCZ);
  scene.add(ceilPl2);

  // Mur gauche (X = rXmin, bord extérieur)
  box(wT, rH, rD, mRoom, rXmin, rH/2, rCZ);

  // Mur droit (X = rXmax) — partagé avec la chambre principale, on l'ajoute entier
  box(wT, rH, rD, mRoom, rXmax, rH/2, rCZ);

  // Mur du fond (Z = rZback)
  box(rW + wT*2, rH, wT, mRoom, rCX, rH/2, rZback);

  // Mur avant (Z = rZfront = -27) avec trou pour la porte mystère
  // Porte mystère centrée en X = -22.35, largeur 3.4
  const mdoorW = 3.4, mdoorH = 4.2;
  const mdoorX = -22.35;
  // Segment gauche : de rXmin à (mdoorX - mdoorW/2)
  const lsW2 = (mdoorX - mdoorW/2) - rXmin;
  if(lsW2 > 0.02) box(lsW2, rH, wT, mRoom, rXmin + lsW2/2, rH/2, rZfront);
  // Segment droit : de (mdoorX + mdoorW/2) à rXmax
  const rsX2start = mdoorX + mdoorW/2;
  const rsW2 = rXmax - rsX2start;
  if(rsW2 > 0.02) box(rsW2, rH, wT, mRoom, rsX2start + rsW2/2, rH/2, rZfront);
  // Bandeau au-dessus de la porte mystère
  box(mdoorW + 0.4, rH - mdoorH, wT, mRoom, mdoorX, mdoorH + (rH - mdoorH)/2, rZfront);


  // Lumière intérieure
  const rLight = new THREE.PointLight(0xffe8c0, 0.55, 12);
  rLight.position.set(rCX, rH - 0.5, rCZ);
  scene.add(rLight);
  const rBulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({color:0xffe8a0}));
  rBulb.position.set(rCX, rH - 0.4, rCZ);
  scene.add(rBulb);
  const rWire = new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.5,4), new THREE.MeshLambertMaterial({color:0x222222}));
  rWire.position.set(rCX, rH - 0.15, rCZ);
  scene.add(rWire);
}

// ═══════════════════════════════════════════════════════════════════
// ─── MURS 1ER ÉTAGE : ferment le vide autour du corridor ──────────
// Le corridor 1er étage va de Z=-27 à Z=15.8, entre X=-24 et X=+24
// Y=5 à Y=10, pierre extérieure (mStone), avec fenêtres
// ═══════════════════════════════════════════════════════════════════
{
  const yOff = 5;
  const cH   = 5;
  const D    = 0.4;
  const mS   = mStone;

  const fw = 1.8, fh = 2.4, fcy = yOff + 2.6;
  const fBot = fcy - fh/2;
  const fTop = fcy + fh/2;

  // ═══════════════════════════════════════════════════
  // 1) MUR FAÇADE Z=-19.5 — au-dessus de la porte principale, côté cour
  //    De X=-24 à X=+24, avec 6 fenêtres (mêmes X que RDC)
  // ═══════════════════════════════════════════════════
  {
    const Z = -19.5;
    const xMin = -24, xMax = 24;
    const wins = [-18.5, -14, -10, 10, 14, 18.5];
    const fw2 = 1.6; // largeur fenêtre façade (makeWindow)

    box(xMax-xMin, fBot-yOff, D, mS, 0, yOff+(fBot-yOff)/2, Z);
    box(xMax-xMin, (yOff+cH)-fTop, D, mS, 0, fTop+((yOff+cH)-fTop)/2, Z);
    const cuts0 = [];
    let p0 = xMin;
    [...wins].sort((a,b)=>a-b).forEach(wx=>{ cuts0.push([p0, wx-fw2/2]); p0=wx+fw2/2; });
    cuts0.push([p0, xMax]);
    cuts0.forEach(([x1,x2])=>{ const w=x2-x1; if(w>0.01) box(w,fh,D,mS,(x1+x2)/2,fcy,Z); });
    wins.forEach(wx => makeWindow(wx, fcy, Z));
  }

  // ═══════════════════════════════════════════════════
  // 2) MUR LATÉRAL GAUCHE X=-24
  //    De Z=-19.5 à Z=15.8, côté cour intérieure
  //    Fenêtres aux mêmes Z que le RDC : 12, 5.5, -1, -6
  // ═══════════════════════════════════════════════════
  {
    const X = -24;
    const zMin = -19.5, zMax = 15.8;
    const wins = [12, 5.5, -1, -6];

    box(D, fBot-yOff, zMax-zMin, mS, X, yOff+(fBot-yOff)/2, (zMin+zMax)/2);
    box(D, (yOff+cH)-fTop, zMax-zMin, mS, X, fTop+((yOff+cH)-fTop)/2, (zMin+zMax)/2);
    const cuts1 = [];
    let p1 = zMin;
    [...wins].sort((a,b)=>a-b).forEach(wz=>{ cuts1.push([p1, wz-fw/2]); p1=wz+fw/2; });
    cuts1.push([p1, zMax]);
    cuts1.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });
    wins.forEach(wz => makeWindowZ(X, fcy, wz, 1));
  }

  // ═══════════════════════════════════════════════════
  // 3) MUR LATÉRAL DROIT X=+24 (symétrique)
  // ═══════════════════════════════════════════════════
  {
    const X = 24;
    const zMin = -19.5, zMax = 15.8;
    const wins = [12, 5.5, -1, -6];

    box(D, fBot-yOff, zMax-zMin, mS, X, yOff+(fBot-yOff)/2, (zMin+zMax)/2);
    box(D, (yOff+cH)-fTop, zMax-zMin, mS, X, fTop+((yOff+cH)-fTop)/2, (zMin+zMax)/2);
    const cuts2 = [];
    let p2 = -19.5;
    [...wins].sort((a,b)=>a-b).forEach(wz=>{ cuts2.push([p2, wz-fw/2]); p2=wz+fw/2; });
    cuts2.push([p2, zMax]);
    cuts2.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(D,fh,l,mS,X,fcy,(z1+z2)/2); });
    wins.forEach(wz => makeWindowZ(X, fcy, wz, -1));
  }

  // ═══════════════════════════════════════════════════
  // 4) FERMETURE coins corridor 1er étage : X=±24, Z=15.8 à Z=18
  // ═══════════════════════════════════════════════════
  [-24, 24].forEach(X => {
    box(D, cH, 18 - 15.8, mS, X, yOff + cH/2, (15.8 + 18) / 2);
  });

  // ═══════════════════════════════════════════════════
  // 4b) FERMETURE bout des couloirs latéraux 1er étage
  //     2 murs dans le plan XZ à Z=17, entre X=±24 et X=±27
  //     (ferme le renfoncement devant les portes de classe)
  //     Coordonnées référence : X:25.40 Y:6.21 Z:17.00
  // ═══════════════════════════════════════════════════
  // ── Renfoncement devant portes de classe (Z=15.8 → 18.5, X=±24 à ±27) ──
  // Mur de fermeture du couloir (Z=18.5), pleine largeur — ferme le côté cour
  box(3, cH, D, mS,  25.5, yOff + cH/2, 18.5);
  box(3, cH, D, mS, -25.5, yOff + cH/2, 18.5);
  // Mur latéral intérieur X=±24 : segment Z=15.8 → 18.5 (complète le mur latéral)
  box(D, cH, 18.5 - 15.8, mS,  24, yOff + cH/2, (15.8 + 18.5) / 2);
  box(D, cH, 18.5 - 15.8, mS, -24, yOff + cH/2, (15.8 + 18.5) / 2);
  // Mur X=±27 : supprimé — c'est lui qui bloquait devant la porte de classe

  // ═══════════════════════════════════════════════════
  // 5) BOUCHER le vide au-dessus des portes latérales RDC (X=±24, Z=-10)
  //    Porte RDC h=4.2 → combler de Y=4.2 à Y=5
  // ═══════════════════════════════════════════════════
  [-24, 24].forEach(X => {
    box(D, yOff - 4.2, 3.0 + 0.8, mS, X, 4.2 + (yOff-4.2)/2, -10);
  });
}

// ─── CHAMBRE SURVEILLANT 1ER ÉTAGE (reproduction exacte au-dessus, yOffset=5) ────
// Même position, mêmes murs, même sol, même plafond — porte avec cadenas doré + INTERDIT
{
  const rXmin = -36.0,   rXmax = -20.21;
  const rZfront = -27,   rZback = -35.50;
  const rW  = rXmax - rXmin;
  const rD  = Math.abs(rZback - rZfront);
  const rCX = (rXmin + rXmax) / 2;
  const rCZ = (rZfront + rZback) / 2;
  const rH  = 5, wT = 0.35;
  const yOff = 5; // 1er étage

  const mRoom2    = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloor2   = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeiling2 = new THREE.MeshLambertMaterial({color:0xe8e0cc});

  // Sol
  const floorPl3 = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mFloor2);
  floorPl3.rotation.x = -Math.PI/2;
  floorPl3.position.set(rCX, yOff + 0.01, rCZ);
  floorPl3.receiveShadow = true;
  scene.add(floorPl3);

  // Plafond
  const ceilPl3 = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mCeiling2);
  ceilPl3.rotation.x = Math.PI/2;
  ceilPl3.position.set(rCX, yOff + rH, rCZ);
  scene.add(ceilPl3);

  // Mur gauche (X = rXmin)
  box(wT, rH, rD, mRoom2, rXmin, yOff + rH/2, rCZ);
  // Mur droit (X = rXmax)
  box(wT, rH, rD, mRoom2, rXmax, yOff + rH/2, rCZ);
  // Mur du fond (Z = rZback)
  box(rW + wT*2, rH, wT, mRoom2, rCX, yOff + rH/2, rZback);

  // Mur avant (Z = rZfront = -27) avec trou pour la porte — même position X=-22.35, larg=3.4
  const mdoorW2 = 3.4, mdoorH2 = 4.2;
  const mdoorX2 = -22.35;
  const lsW3 = (mdoorX2 - mdoorW2/2) - rXmin;
  if(lsW3 > 0.02) box(lsW3, rH, wT, mRoom2, rXmin + lsW3/2, yOff + rH/2, rZfront);
  const rsX3start = mdoorX2 + mdoorW2/2;
  const rsW3 = rXmax - rsX3start;
  if(rsW3 > 0.02) box(rsW3, rH, wT, mRoom2, rsX3start + rsW3/2, yOff + rH/2, rZfront);
  box(mdoorW2 + 0.4, rH - mdoorH2, wT, mRoom2, mdoorX2, yOff + mdoorH2 + (rH - mdoorH2)/2, rZfront);

  // ── PORTE 1ER ÉTAGE (même style que la porte mystère, mais INTERDIT + cadenas) ──
  {
    const doorW = mdoorW2, doorH = mdoorH2;
    const doorX = mdoorX2, doorZ = rZfront;
    const mStoneLight2 = new THREE.MeshLambertMaterial({color:0xe0d8c0});
    const mDarkWood2 = new THREE.MeshLambertMaterial({color:0x2a1a08});
    const mGoldPL = new THREE.MeshLambertMaterial({color:0xd4a010});
    const mGoldPLDk = new THREE.MeshLambertMaterial({color:0xa07808});

    // Piliers de pierre de chaque côté
    [-doorW/2-0.18, doorW/2+0.18].forEach(dx=>{
      box(0.48, doorH+0.4, 0.44, mStoneLight2, doorX+dx, yOff+(doorH+0.4)/2, doorZ+0.05);
      box(0.65, 0.20, 0.60, new THREE.MeshLambertMaterial({color:0xd4ccb8}), doorX+dx, yOff+doorH+0.4, doorZ+0.05);
    });
    // Linteau
    box(doorW+1.0, 0.38, 0.44, mStoneLight2, doorX, yOff+doorH+0.18, doorZ+0.05);
    // Arc décoratif
    const archGeo2 = new THREE.TorusGeometry(1.7, 0.14, 6, 12, Math.PI);
    const archM2 = new THREE.Mesh(archGeo2, mStoneLight2);
    archM2.rotation.x = -Math.PI/2; archM2.rotation.z = Math.PI;
    archM2.position.set(doorX, yOff+doorH+0.12, doorZ+0.05); scene.add(archM2);

    // Texture "INTERDIT" pour la porte
    const interditCanvas = document.createElement('canvas');
    interditCanvas.width = 256; interditCanvas.height = 512;
    const iCtx = interditCanvas.getContext('2d');
    // Fond bois foncé
    iCtx.fillStyle = '#2a1a08'; iCtx.fillRect(0,0,256,512);
    for(let i=0;i<256;i+=6){
      iCtx.fillStyle=`rgba(80,50,10,${0.05+Math.random()*0.06})`;
      iCtx.fillRect(i,0,3,512);
    }
    // Panneau rouge INTERDIT
    const px3=18, py3=512*0.28, pw3=220, ph3=120;
    iCtx.fillStyle='#8b0000'; iCtx.fillRect(px3-4, py3-4, pw3+8, ph3+8);
    iCtx.fillStyle='#cc0000'; iCtx.fillRect(px3, py3, pw3, ph3);
    iCtx.strokeStyle='#ff4444'; iCtx.lineWidth=3; iCtx.strokeRect(px3+5, py3+5, pw3-10, ph3-10);
    iCtx.fillStyle='#ffffff';
    iCtx.font='bold 54px Arial, sans-serif';
    iCtx.textAlign='center'; iCtx.textBaseline='middle';
    iCtx.shadowColor='rgba(0,0,0,0.8)'; iCtx.shadowBlur=6;
    iCtx.fillText('INTERDIT', 128, py3+ph3/2);
    iCtx.shadowBlur=0;
    // Croix rouge dessous
    iCtx.fillStyle='#ff2020'; iCtx.font='bold 56px Arial';
    iCtx.fillText('🚫', 128, py3+ph3+65);
    const interditTex = _CT(interditCanvas);

    // 2 vantaux
    const leaves2 = [];
    [-1, 1].forEach((side, idx)=>{
      const pivot2 = new THREE.Group();
      pivot2.position.set(doorX + side*(doorW/2-0.06), yOff, doorZ+0.08);
      scene.add(pivot2);
      leaves2.push({pivot: pivot2, side});
      const lo = -side*(doorW/4);

      // Vantail idx==1 → "INTERDIT"
      const leafMat2 = idx === 1
        ? new THREE.MeshLambertMaterial({map: interditTex})
        : mDarkWood2;
      const leaf2 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.1, doorH-0.12, 0.10), leafMat2);
      leaf2.position.set(lo, (doorH-0.12)/2, 0); leaf2.castShadow=true; pivot2.add(leaf2);
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.4, 0.07), mDarkWood2);
      p1.position.set(lo, doorH*0.74, 0.06); pivot2.add(p1);
      const p2b = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.2, 0.07), mDarkWood2);
      p2b.position.set(lo, doorH*0.38, 0.06); pivot2.add(p2b);
      const gl2 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.45, 0.75, 0.05), mWinGlass);
      gl2.position.set(lo, doorH-0.55, 0.05); pivot2.add(gl2);
    });

    // ── CADENAS DORÉ sur la porte du 1er étage ──
    const plGroup2 = new THREE.Group();
    // Centré entre les 2 vantaux, hauteur milieu porte, légèrement devant
    plGroup2.position.set(doorX, yOff + doorH * 0.44, doorZ + 0.14);
    scene.add(plGroup2);
    // Corps du cadenas
    const plBody2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.14), mGoldPL);
    plBody2.position.set(0,0,0); plGroup2.add(plBody2);
    // Partie haute du corps
    const plTop2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.14,12), mGoldPL);
    plTop2.rotation.x = Math.PI/2; plTop2.position.set(0,0.14,0); plGroup2.add(plTop2);
    // Arc (anse)
    const plArc2 = new THREE.Mesh(new THREE.TorusGeometry(0.075,0.025,8,12,Math.PI), mGoldPLDk);
    plArc2.rotation.x = Math.PI/2; plArc2.position.set(0,0.29,0); plGroup2.add(plArc2);
    // Trou de serrure
    const plHole2 = new THREE.Mesh(new THREE.CircleGeometry(0.045,8), new THREE.MeshLambertMaterial({color:0x0a0a0a}));
    plHole2.position.set(0,0,0.075); plGroup2.add(plHole2);
    const plSlot2 = new THREE.Mesh(new THREE.BoxGeometry(0.020,0.060,0.012), new THREE.MeshLambertMaterial({color:0x0a0a0a}));
    plSlot2.position.set(0,-0.055,0.075); plGroup2.add(plSlot2);
    // Reflets dorés
    const plShine = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.10,0.01), new THREE.MeshLambertMaterial({color:0xffe060}));
    plShine.position.set(-0.06, 0.05, 0.075); plGroup2.add(plShine);
  }

  // Lumière intérieure
  const rLight2 = new THREE.PointLight(0xffe8c0, 0.55, 12);
  rLight2.position.set(rCX, yOff + rH - 0.5, rCZ);
  scene.add(rLight2);
  const rBulb2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({color:0xffe8a0}));
  rBulb2.position.set(rCX, yOff + rH - 0.4, rCZ);
  scene.add(rBulb2);
  const rWire2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.5,4), new THREE.MeshLambertMaterial({color:0x222222}));
  rWire2.position.set(rCX, yOff + rH - 0.15, rCZ);
  scene.add(rWire2);
}

// ─── ESCALIER EN U — cage X=-20.21 à -12.23, Z=-27 à -35.5
// Volée 1 : longe le mur GAUCHE (X=-20.21), descend vers Z-
// Palier  : au tournant Z≈-33.6, LARGE (toute la largeur de la cage)
// Volée 2 : longe le mur DROIT  (X=-12.23), remonte vers Z+
{
  const mStair = new THREE.MeshLambertMaterial({color:0xc8b490});
  const mRiser = new THREE.MeshLambertMaterial({color:0xb0a078});
  const mRail  = new THREE.MeshLambertMaterial({color:0x5a3a18});
  const mPost  = new THREE.MeshLambertMaterial({color:0x4a2e10});

  const nSteps = 8;      // 8 marches par volée → palier au tournant, pas au fond
  const stepH  = 0.3125; // 8×0.3125 = 2.5 par volée → total 5.0 ✓
  const stepD  = 0.75;   // 8×0.75 = 6.0 → volée s'arrête à Z≈-33.6 ✓
  const stepW  = 3.5;    // largeur marche

  // ── VOLÉE 1 : longe mur GAUCHE X=-20.21
  const v1Xmin    = -20.21;
  const v1Xcenter = v1Xmin + stepW / 2;  // -18.46
  const v1Zstart  = -27.6;

  for(let i = 0; i < nSteps; i++){
    const y = i * stepH;
    const z = v1Zstart - i * stepD;
    const g = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.10, stepD), mStair);
    g.position.set(v1Xcenter, y + stepH, z - stepD/2);
    g.castShadow = true; scene.add(g);
    const r = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, 0.06), mRiser);
    r.position.set(v1Xcenter, y + stepH/2, z);
    scene.add(r);
  }

  // ── PALIER au tournant : large, relie les deux volées
  // Volée 1 finit à Z = -27.6 - 8×0.75 = -33.6  ✓ (correspond à X:-16.76 Y:4.59 Z:-33.63)
  const landingY = nSteps * stepH;              // Y=2.5
  const landingZend   = v1Zstart - nSteps * stepD; // -27.6 - 6.0 = -33.6 (fin V1)
  const landingZstart = -35.3;                      // bord fond (reste dans la cage, mur à -35.5)
  const landingDepth  = Math.abs(landingZstart - landingZend); // 1.7
  const landingZcenter = (landingZend + landingZstart) / 2;    // -34.45
  const landingW = Math.abs(-12.23 - (-20.21));                // 7.98

  const landingMesh = new THREE.Mesh(new THREE.BoxGeometry(landingW, 0.12, landingDepth), mStair);
  landingMesh.position.set(-16.22, landingY + 0.06, landingZcenter);
  landingMesh.castShadow = true; scene.add(landingMesh);

  // ── VOLÉE 2 : longe mur DROIT X=-12.23, repart de Z=-33.6 vers Z+
  const v2Xmax    = -12.23;
  const v2Xcenter = v2Xmax - stepW / 2;   // -13.98
  const v2Zstart  = landingZend;           // repart exactement là où V1 s'arrête = -33.6

  for(let i = 0; i < nSteps; i++){
    const y = landingY + i * stepH;
    const z = v2Zstart + i * stepD;        // remonte vers Z+ (vers -27)
    const g = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.10, stepD), mStair);
    g.position.set(v2Xcenter, y + stepH, z + stepD/2);
    g.castShadow = true; scene.add(g);
    const r = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepH, 0.06), mRiser);
    r.position.set(v2Xcenter, y + stepH/2, z + stepD);
    scene.add(r);
  }

  // ── RAMBARDE VOLÉE 1 : bord intérieur droit (railX1)
  const railX1  = v1Xcenter + stepW/2 - 0.08;
  const rcAngle = Math.atan2(nSteps * stepH, nSteps * stepD);
  const rcLen   = Math.sqrt((nSteps*stepD)**2 + (nSteps*stepH)**2) + 0.1;
  for(let i = 0; i < nSteps; i += 2){
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), mPost);
    p.position.set(railX1, i*stepH + stepH + 0.42, v1Zstart - i*stepD - stepD/2);
    scene.add(p);
  }
  { const rc = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, rcLen), mRail);
    rc.position.set(railX1, landingY/2 + 0.88, v1Zstart - nSteps*stepD/2);
    rc.rotation.x = rcAngle; scene.add(rc); }

  // ── RAMBARDE VOLÉE 2 : bord intérieur gauche (railX2)
  const railX2 = v2Xcenter - stepW/2 + 0.08;
  for(let i = 0; i <= nSteps; i += 2){
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), mPost);
    p.position.set(railX2, landingY + i*stepH + stepH + 0.42, v2Zstart + i*stepD + stepD/2);
    scene.add(p);
  }
  { const rc = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, rcLen), mRail);
    rc.position.set(railX2, landingY + nSteps*stepH/2 + 0.88, v2Zstart + nSteps*stepD/2);
    rc.rotation.x = -rcAngle; scene.add(rc); }

  // ── PALIER : poteaux placés exactement à Z=landingZend (jonction des deux volées)
  [railX1, railX2].forEach(rx => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), mPost);
    p.position.set(rx, landingY + 0.12 + 0.42, landingZend + 0.1);
    scene.add(p);
  });
  { const hBar = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(railX2-railX1)+0.05, 0.06, 0.06), mRail);
    hBar.position.set((railX1+railX2)/2, landingY + 0.12 + 0.85, landingZend + 0.1);
    scene.add(hBar); }

  // Lumière cage d'escalier
  const stairLight = new THREE.PointLight(0xffe8c0, 0.7, 12);
  stairLight.position.set(-16.22, 3.5, -31.5);
  scene.add(stairLight);
}

function makeEndDoor(faceX, outDir, label='', yOffset=0){
  const doorW = 3.8, doorH = 4.5;
  const doorZ = 15.8;
  const mStoneLight = new THREE.MeshLambertMaterial({color:0xe0d8c0});

  // Piliers haut et bas en Z
  [-doorW/2-0.15, doorW/2+0.15].forEach(dz=>{
    box(0.5, doorH+0.4, 0.45, mStoneLight, faceX+outDir*0.1, yOffset+(doorH+0.4)/2, doorZ+dz);
  });
  // Linteau
  box(0.4, 0.42, doorW+0.8, mStoneLight, faceX+outDir*0.1, yOffset+doorH+0.2, doorZ);

  const leaves = [];
  const leafW = doorW/2 - 0.08;
  [-1,1].forEach((lr, idx)=>{
    const pivot = new THREE.Group();
    pivot.position.set(faceX+outDir*0.3, yOffset, doorZ + lr*(doorW/2-0.05));
    scene.add(pivot);
    leaves.push({pivot, lr});
    const localZ = -lr*(leafW/2);

    // Vantail lr==1 (premier) → applique le label
    const leafMat = (idx === 0 && label)
      ? new THREE.MeshLambertMaterial({map: makeDoorLabelTex(label)})
      : mWood;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH-0.1, leafW), leafMat);
    leaf.position.set(0, (doorH-0.1)/2, localZ); leaf.castShadow=true; pivot.add(leaf);
    [0.76, 0.43, 0.15].forEach((yr,pi)=>{
      const ph=[1.0,1.1,0.75][pi];
      const p=new THREE.Mesh(new THREE.BoxGeometry(0.07,ph,leafW-0.2),new THREE.MeshLambertMaterial({color:0x3a2010}));
      p.position.set(outDir*0.04, doorH*yr, localZ); pivot.add(p);
    });
    const gl=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.6,leafW-0.25),mWinGlass);
    gl.position.set(outDir*0.04, doorH-0.5, localZ); pivot.add(gl);
    // Poignée côté couloir (face outDir)
    const hndE=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.22,8),new THREE.MeshLambertMaterial({color:0xc8a030}));
    hndE.rotation.x=Math.PI/2; hndE.position.set(outDir*0.12, doorH*0.5, localZ*2*0.9); pivot.add(hndE);
  });
  return { leaves, pos: new THREE.Vector3(faceX+outDir*0.2, yOffset+1.7, doorZ), outDir };
}
const sdEndL = makeEndDoor(-27,  1, 'Classe 5è C');
const sdEndR = makeEndDoor( 27, -1, 'Classe 5è D');
// Classe 5e A au premier étage — juste au-dessus de la Classe 5e D (yOffset = 5)
const sdEndA = makeEndDoor( 27, -1, 'Classe 5è A', 5);
// Classe 5e B au premier étage — juste au-dessus de la Classe 5e C (yOffset = 5)
const sdEndB = makeEndDoor(-27,  1, 'Classe 5è B', 5);

// (Portes end2 et side2 supprimées — murs X=±36 pleins, chambres fermées)

// (Portes portal2Left et portal2Right supprimées — murs Z=18 pleins côté 2e couloir)

// ─── PORTE MYSTÈRE : mur Z=-27, trou gauche, centrée en X=-22.35 ─────────────
function makeMysteryDoor(){
  const doorW = 3.4, doorH = 4.2;
  const doorX = -22.35, doorZ = -27;
  const mStoneLight = new THREE.MeshLambertMaterial({color:0xe0d8c0});
  const mDarkWood = new THREE.MeshLambertMaterial({color:0x2a1a08});

  // Piliers de pierre de chaque côté
  [-doorW/2-0.18, doorW/2+0.18].forEach(dx=>{
    box(0.48, doorH+0.4, 0.44, mStoneLight, doorX+dx, (doorH+0.4)/2, doorZ+0.05);
    box(0.65, 0.20, 0.60, new THREE.MeshLambertMaterial({color:0xd4ccb8}), doorX+dx, doorH+0.4, doorZ+0.05);
  });
  // Linteau
  box(doorW+1.0, 0.38, 0.44, mStoneLight, doorX, doorH+0.18, doorZ+0.05);
  // Arc décoratif
  const archGeo = new THREE.TorusGeometry(1.7, 0.14, 6, 12, Math.PI);
  const archM = new THREE.Mesh(archGeo, mStoneLight);
  archM.rotation.x = -Math.PI/2; archM.rotation.z = Math.PI;
  archM.position.set(doorX, doorH+0.12, doorZ+0.05); scene.add(archM);

  // 2 vantaux (s'ouvrent vers Z+, c-à-d vers l'intérieur de la cour)
  const leaves = [];
  [-1, 1].forEach((side, idx)=>{
    const pivot = new THREE.Group();
    pivot.position.set(doorX + side*(doorW/2-0.06), 0, doorZ+0.08);
    scene.add(pivot);
    leaves.push({pivot, side});
    const lo = -side*(doorW/4);

    // Vantail idx==1 (side=+1) → label Surveillant visible depuis la cour (Z+)
    const leafMat = idx === 1
      ? new THREE.MeshLambertMaterial({map: makeDoorLabelTex('Surveillant')})
      : mWood;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.1, doorH-0.12, 0.10), leafMat);
    leaf.position.set(lo, (doorH-0.12)/2, 0); leaf.castShadow=true; pivot.add(leaf);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.4, 0.07), mDarkWood);
    p1.position.set(lo, doorH*0.74, 0.06); pivot.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, 1.2, 0.07), mDarkWood);
    p2.position.set(lo, doorH*0.38, 0.06); pivot.add(p2);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.45, 0.75, 0.05), mWinGlass);
    gl.position.set(lo, doorH-0.55, 0.05); pivot.add(gl);
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.24,8), new THREE.MeshLambertMaterial({color:0xc8a030}));
    hnd.rotation.z=Math.PI/2; hnd.position.set(lo*2*0.9, doorH*0.5, 0.11); pivot.add(hnd);
  });

  return {
    leaves,
    pos: new THREE.Vector3(doorX, 1.7, doorZ+0.3),
    outDir: 0,
    isMystery: true
  };
}
const sdMystery = makeMysteryDoor();

// ─── PORTE SORTIE (mur Z=-27, X=17.2) — style PORTE MÉTALLIQUE INDUSTRIELLE ──
// Porte simple vantail, vert kaki foncé, barre de poussée, panneau SORTIE lumineux
function makeSortieDoor(){
  const doorW = 2.2, doorH = 4.2;
  const doorX = 17.2, doorZ = -27;

  const mMetal3   = new THREE.MeshLambertMaterial({color:0x3a5a30}); // vert kaki foncé
  const mMetalDk  = new THREE.MeshLambertMaterial({color:0x2a4020}); // vert très foncé
  const mMetalRim = new THREE.MeshLambertMaterial({color:0x1a2a14}); // lisière métal noire
  const mFrameSt  = new THREE.MeshLambertMaterial({color:0xb0b8a0}); // cadre acier gris
  const mPushBar  = new THREE.MeshLambertMaterial({color:0xd0c080}); // barre laiton

  // Cadre acier autour de la porte (encadrement dans le mur)
  // Montants
  [-doorW/2-0.06, doorW/2+0.06].forEach(dx=>{
    box(0.12, doorH+0.10, 0.28, mFrameSt, doorX+dx, (doorH+0.10)/2, doorZ+0.04);
  });
  // Traverse haute
  box(doorW+0.28, 0.12, 0.28, mFrameSt, doorX, doorH+0.06, doorZ+0.04);
  // Seuil métal
  box(doorW+0.28, 0.08, 0.30, mMetalRim, doorX, 0.04, doorZ+0.04);

  // Panneau SORTIE lumineux vert au-dessus (canvas texture)
  const signCanvas = document.createElement('canvas');
  signCanvas.width=256; signCanvas.height=96;
  const sCtx = signCanvas.getContext('2d');
  // Fond noir mat
  sCtx.fillStyle='#0a1208'; sCtx.fillRect(0,0,256,96);
  // Bordure verte
  sCtx.strokeStyle='#40c030'; sCtx.lineWidth=4;
  sCtx.strokeRect(4,4,248,88);
  // Texte SORTIE vert lumineux
  sCtx.fillStyle='#70ff50'; sCtx.font='bold 48px Arial, sans-serif';
  sCtx.textAlign='center'; sCtx.textBaseline='middle';
  sCtx.fillText('SORTIE', 128, 48);
  // Flèche →
  sCtx.fillStyle='#50ee30'; sCtx.font='bold 36px Arial';
  sCtx.fillText('→', 220, 50);
  const signTex = _CT(signCanvas);
  const signMesh = new THREE.Mesh(
    new THREE.BoxGeometry(doorW+0.1, 0.42, 0.06),
    new THREE.MeshLambertMaterial({map:signTex, emissive:0x103008, emissiveIntensity:0.4})
  );
  signMesh.position.set(doorX, doorH+0.36, doorZ+0.08); scene.add(signMesh);

  // Vantail unique (s'ouvre d'un seul côté, pivot à droite)
  const leaves = [];
  // On simule 2 leaves mais 1 seul vantail plein (le gauche est invisible/vide)
  const pivot = new THREE.Group();
  pivot.position.set(doorX + (doorW/2-0.06), 0, doorZ+0.07);
  scene.add(pivot);

  // Face avant : grande plaque métal verte
  const faceLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW-0.12, doorH-0.10, 0.10), mMetal3);
  faceLeaf.position.set(-(doorW/2-0.06), (doorH-0.10)/2, 0);
  faceLeaf.castShadow=true; pivot.add(faceLeaf);

  // Raidisseurs horizontaux (nervures métal)
  [0.20, 0.45, 0.70].forEach(yr=>{
    const rib = new THREE.Mesh(new THREE.BoxGeometry(doorW-0.20, 0.06, 0.12), mMetalDk);
    rib.position.set(-(doorW/2-0.06), doorH*yr, 0.01); pivot.add(rib);
  });

  // Barre de poussée horizontale (laiton)
  const pushBar = new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.038, doorW*0.72, 10), mPushBar);
  pushBar.rotation.z = Math.PI/2;
  pushBar.position.set(-(doorW/2-0.06), doorH*0.52, 0.12); pivot.add(pushBar);
  // Supports de barre
  [-doorW*0.24, doorW*0.24].forEach(dz2=>{
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.16,0.10), mPushBar);
    sup.position.set(-(doorW/2-0.06)+dz2, doorH*0.52, 0.09); pivot.add(sup);
  });

  // Petite vitre de sécurité (renforcée, petite, haute)
  const glSec = new THREE.Mesh(new THREE.BoxGeometry(doorW*0.38, 0.42, 0.05),
    new THREE.MeshLambertMaterial({color:0xc8e8c0, transparent:true, opacity:0.50}));
  glSec.position.set(-(doorW/2-0.06), doorH-0.38, 0.06); pivot.add(glSec);
  // Grillage sur la vitre (croisillon métal)
  const mWireG = new THREE.MeshLambertMaterial({color:0x808070});
  box(doorW*0.36, 0.02, 0.04, mWireG, doorX, doorH-0.38, doorZ+0.11);
  box(0.02, 0.40, 0.04, mWireG, doorX, doorH-0.38, doorZ+0.11);

  leaves.push({pivot, side:-1}); // vantail unique côté droit
  // Dummy pivot pour le 2e slot (vantail vide, pas visible)
  const dummyPivot = new THREE.Group();
  dummyPivot.position.set(doorX - (doorW/2-0.06), 0, doorZ+0.07);
  scene.add(dummyPivot);
  leaves.push({pivot: dummyPivot, side:1});

  return { leaves, pos: new THREE.Vector3(doorX, 1.7, doorZ+0.3), outDir:0, singleLeaf:true };
}
const sdSortie = makeSortieDoor();

// ─── PORTE TOILETTE (mur Z=-27, X=22.5) — style bleu, panneau WC ────────────
function makeToiletteDoor(){
  const doorW = 2.2, doorH = 4.2;
  const doorX = 22.5, doorZ = -27;
  const mStoneBl = new THREE.MeshLambertMaterial({color:0xd0cce8});
  const mDoorTB  = new THREE.MeshLambertMaterial({color:0x607aaa});

  // Texture Toilette sur tout le vantail (grand, lisible)
  const tCanvas = document.createElement('canvas');
  tCanvas.width=256; tCanvas.height=512;
  const tCtx = tCanvas.getContext('2d');
  // Fond bleu ardoise
  tCtx.fillStyle='#5a72a8'; tCtx.fillRect(0,0,256,512);
  // Rainures verticales bois peint
  for(let i=0;i<256;i+=18){
    tCtx.fillStyle=`rgba(0,0,0,${0.04+Math.random()*0.04})`;
    tCtx.fillRect(i,0,1,512);
  }
  // Plaquette centrale
  const px2=28, py2=512*0.30, pw2=200, ph2=100;
  tCtx.fillStyle='#1a2850'; tCtx.fillRect(px2-3,py2-3,pw2+6,ph2+6);
  const g2=tCtx.createLinearGradient(px2,py2,px2+pw2,py2+ph2);
  g2.addColorStop(0,'#dce8ff'); g2.addColorStop(1,'#b8ccee');
  tCtx.fillStyle=g2; tCtx.fillRect(px2,py2,pw2,ph2);
  tCtx.strokeStyle='#4a60a0'; tCtx.lineWidth=2; tCtx.strokeRect(px2+4,py2+4,pw2-8,ph2-8);
  tCtx.fillStyle='#1a2850'; tCtx.textAlign='center'; tCtx.textBaseline='middle';
  tCtx.font='bold 30px Georgia, serif';
  tCtx.fillText('Toilette', 128, py2+ph2/2);
  // Icône homme/femme stylisée
  tCtx.fillStyle='#4a68b0'; tCtx.font='48px Arial';
  tCtx.fillText('🚻', 128, py2+ph2+55);
  const toilTex = _CT(tCanvas);

  // Piliers bleutés
  [-doorW/2-0.14, doorW/2+0.14].forEach(dx=>{
    box(0.32, doorH+0.32, 0.40, mStoneBl, doorX+dx, (doorH+0.32)/2, doorZ+0.05);
    box(0.36, 0.08, 0.44, new THREE.MeshLambertMaterial({color:0x8898c8}), doorX+dx, doorH*0.52, doorZ+0.05);
  });
  // Linteau bleuté
  box(doorW+0.70, 0.30, 0.40, mStoneBl, doorX, doorH+0.15, doorZ+0.05);
  // Panneau WC lumineux au-dessus
  const wcCanvas = document.createElement('canvas');
  wcCanvas.width=128; wcCanvas.height=64;
  const wCtx=wcCanvas.getContext('2d');
  wCtx.fillStyle='#0a1428'; wCtx.fillRect(0,0,128,64);
  wCtx.strokeStyle='#4080ff'; wCtx.lineWidth=3; wCtx.strokeRect(3,3,122,58);
  wCtx.fillStyle='#80b8ff'; wCtx.font='bold 32px Arial'; wCtx.textAlign='center'; wCtx.textBaseline='middle';
  wCtx.fillText('WC', 64, 32);
  const wcTex2=_CT(wcCanvas);
  const wcPan=new THREE.Mesh(new THREE.BoxGeometry(0.60,0.32,0.06),
    new THREE.MeshLambertMaterial({map:wcTex2, emissive:0x080820, emissiveIntensity:0.3}));
  wcPan.position.set(doorX, doorH+0.52, doorZ+0.10); scene.add(wcPan);

  const leaves = [];
  [-1, 1].forEach((side, idx)=>{
    const pivot = new THREE.Group();
    pivot.position.set(doorX + side*(doorW/2-0.05), 0, doorZ+0.06);
    scene.add(pivot);
    leaves.push({pivot, side});
    const lo = -side*(doorW/4);
    // Vantail avec texture complète (pas de panneaux déco par-dessus)
    const leafMat = idx===1
      ? new THREE.MeshLambertMaterial({map:toilTex})
      : mDoorTB;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.10, doorH-0.10, 0.10), leafMat);
    leaf.position.set(lo, (doorH-0.10)/2, 0); leaf.castShadow=true; pivot.add(leaf);
    // Poignée chromée
    const hnd=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.26,8), new THREE.MeshLambertMaterial({color:0xccd4e8}));
    hnd.rotation.z=Math.PI/2; hnd.position.set(lo*2*0.84, doorH*0.48, 0.12); pivot.add(hnd);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.040,8,6), new THREE.MeshLambertMaterial({color:0xe0e8f8}));
    knob.position.set(lo*2*0.84, doorH*0.48, 0.13); pivot.add(knob);
  });
  return { leaves, pos: new THREE.Vector3(doorX, 1.7, doorZ+0.3), outDir:0 };
}
const sdToilette = makeToiletteDoor();

// Porte Bibliothèque — 1er étage, mur Z=-27, X=0
const sdBiblio = (()=>{
  const doorW = 3.8, doorH = 4.5, doorZ = -27, doorX = 0, yOffset = 5;
  const leaves = [];
  [-1, 1].forEach((side, idx) => {
    const pivot = new THREE.Group();
    pivot.position.set(doorX + side*(doorW/2 - 0.05), yOffset, doorZ);
    scene.add(pivot);
    leaves.push({pivot, side});
    const lo = -side*(doorW/4);
    // Label "Bibliothèque" sur idx===0 (side=-1), face vers Z+ (côté couloir)
    const leafMat = idx === 0
      ? new THREE.MeshLambertMaterial({map: makeDoorLabelTex('Bibliothèque')})
      : mWood;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW/2 - 0.1, doorH - 0.1, 0.10), leafMat);
    leaf.position.set(lo, (doorH-0.1)/2, 0); leaf.castShadow = true; pivot.add(leaf);
    [0.75, 0.42, 0.14].forEach((yr, pi) => {
      const ph = [1.0, 1.1, 0.75][pi];
      const p = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4, ph, 0.07), new THREE.MeshLambertMaterial({color:0x4a3018}));
      p.position.set(lo, doorH*yr, 0.06); pivot.add(p);
    });
    const gl = new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.5, 0.9, 0.05), mWinGlass);
    gl.position.set(lo, doorH-0.6, 0.05); pivot.add(gl);
    const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.28,8), new THREE.MeshLambertMaterial({color:0xc8a030}));
    hnd.rotation.z = Math.PI/2; hnd.position.set(lo*2*0.9, doorH*0.5, 0.13); pivot.add(hnd);
  });
  // pos côté couloir (Z > -27) pour que le joueur la détecte en approchant
  return { leaves, pos: new THREE.Vector3(doorX, yOffset+1.7, doorZ+1.0), outDir:0 };
})();

// Données des portes (porte principale supprimée)
// floor: 0 = rez-de-chaussée, 1 = 1er étage
const DOORS = [
  {
    id:'mainPorte',
    pos: new THREE.Vector3(0, 1.7, -19.5),
    leaves: _W._mainPorteData.leaves,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'left',
    pos: sdL.pos, leaves: sdL.leaves, outDir: sdL.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'right',
    pos: sdR.pos, leaves: sdR.leaves, outDir: sdR.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'back',
    pos: sdBack.pos, leaves: sdBack.leaves, outDir: 0,
    animAngle: 0, targetAngle: 0, open: false,
    isBack: true,
    floor: 0,
  },
  {
    id:'endLeft',
    pos: sdEndL.pos, leaves: sdEndL.leaves, outDir: sdEndL.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'endRight',
    pos: sdEndR.pos, leaves: sdEndR.leaves, outDir: sdEndR.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'endA',
    pos: sdEndA.pos, leaves: sdEndA.leaves, outDir: sdEndA.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 1,
  },
  {
    id:'endB',
    pos: sdEndB.pos, leaves: sdEndB.leaves, outDir: sdEndB.outDir,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 1,
  },
  {
    id:'biblio',
    pos: sdBiblio.pos, leaves: sdBiblio.leaves, outDir: 0,
    animAngle: 0, targetAngle: 0, open: false,
    isBack: true,
    floor: 1,
  },
  {
    id:'mystery',
    pos: sdMystery.pos, leaves: sdMystery.leaves, outDir: 0,
    animAngle: 0, targetAngle: 0, open: false,
    isMystery: true,
    floor: 0,
  },
  {
    id:'sortie',
    pos: sdSortie.pos, leaves: sdSortie.leaves, outDir: 0,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  {
    id:'toilette',
    pos: sdToilette.pos, leaves: sdToilette.leaves, outDir: 0,
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
  },
  // Porte cadenas cour arrière (pas de vantail 3D — juste le collider)
  {
    id:'fenceGate',
    pos: new THREE.Vector3(17.46, 1.7, -147.5),
    leaves: [], // pas de vantail animé (la porte cadenas existe déjà)
    animAngle: 0, targetAngle: 0, open: false,
    floor: 0,
    isFenceGate: true,
  },
];

// ─── FONCTION TEXTURE NOM SUR VANTAIL ────────────────────────────────────
// Créer des mesh de surbrillance pour chaque vantail
DOORS.forEach(door=>{
  door.leaves.forEach(lf=>{
    if(!lf.pivot.children[0]) return; // pivot vide (ex: dummy vantail)
    // Clone de la géométrie légèrement agrandi
    const glowMesh = lf.pivot.children[0].clone();
    glowMesh.material = mGlow;
    glowMesh.scale.set(1.06, 1.03, 1.0);
    glowMesh.position.x += 0.0;
    glowMesh.visible = false;
    lf.pivot.add(glowMesh);
    lf.glowMesh = glowMesh;
  });
  door.highlighted = false;
});

let activeDoor = null;

function tickAutoSpeech(dt){
  // Horloge de jeu : 8h -> 17h, puis nouvelle journée
  gameHour += (GAME_MIN_PER_SEC * dt) / 60.0;
  if(gameHour >= 17){ gameHour = 8.0; brendard.newDay(); }
}

function lerp(a,b,t){ return a+(b-a)*Math.max(0,Math.min(1,t)); }

// ─── COULOIR EN U DERRIÈRE LES 3 PORTES ───────────────
// ═══════════════════════════════════════════════════════
// Mur arrière Z=-27 + bras X=+-27, fermés sur le mur du portail (Z=+18)
{
  const mS = mStone;
  const wallH = 5, wallT = 0.4;
  const zCenter = (-27 + 18) / 2; // -4.5
  const zLen = 45;

  // Mur arrière Z=-27 : avec trou pour grande porte centrale (largeur 4.4, hauteur 4.6)
  // Porte centrale : X de -2.2 à +2.2
  // Côté gauche : trou de X=-25.5 à X=-13.5 (face à la chambre côté gauche)
  box(1.7,  wallH, wallT, mS, (-27.2 + -25.5)/2, wallH/2, -27); // bout extérieur gauche
  // trou gauche : X=-25.5 à -13.5 → maintenant fermé sauf autour porte mystery
  // Segments de mur de chaque côté de la porte (X=-22.35 ± 1.7)
  box(1.45, wallH, wallT, mS, -24.775, wallH/2, -27); // X=-25.5 à -24.05, largeur=1.45, centre=-24.775
  // box(7.15, wallH, wallT, mS, -17.175, wallH/2, -27); // SUPPRIMÉ — remplacé par ouverture à X=-17.91
  // Bandeau au-dessus de la porte mystery (doorH=4.2, wallH=5)
  box(3.4, wallH - 4.2, wallT, mS, -22.35, 4.2 + (wallH-4.2)/2, -27);
  // ─── OUVERTURE COULOIR ↔ couloir passage à X=-17.91 (largeur 3.0, entre surveillant et bureau principal) ───
  box(1.24, wallH, wallT, mS, -20.03, wallH/2, -27); // gauche (X=-20.65 à -19.41)
  box(2.91, wallH, wallT, mS, -14.955, wallH/2, -27); // droite (X=-16.41 à -13.5)
  box(3.2, wallH - 4.2, wallT, mS, -17.91, 4.2 + (wallH-4.2)/2, -27); // bandeau au-dessus
  // Segment vers centre (X=-13.5 à -2.2) — plein, pas d'ouverture
  box(11.3, wallH, wallT, mS, (-13.5 + -2.2)/2, wallH/2, -27); // segment vers centre gauche
  // Côté droit : trou de X=+13.5 à X=+25.5 (face à la chambre côté droit)
  box(11.3, wallH, wallT, mS, (2.2 + 13.5)/2,    wallH/2, -27); // segment vers centre droit
  // trou droit : X=+13.5 à +25.5 → 2 portes : Sortie (X≈17) et Toilette (X≈22.5)
  // Porte Sortie centrée X=17.2, largeur 2.2
  // Porte Toilette centrée X=22.5, largeur 2.2
  const corrDW = 2.2, corrDH = 4.2;
  const corrD1X = 17.2, corrD2X = 22.5;
  // Segments mur entre et autour des portes
  // 13.5 → 16.1 (mur plein)
  box(2.6, wallH, wallT, mS, (13.5+16.1)/2, wallH/2, -27);
  // 18.3 → 21.4 (entre les deux portes)
  box(3.1, wallH, wallT, mS, (18.3+21.4)/2, wallH/2, -27);
  // 23.6 → 25.5 (après porte toilette)
  box(1.9, wallH, wallT, mS, (23.6+25.5)/2, wallH/2, -27);
  // Bandeaux au-dessus des portes
  box(corrDW+0.2, wallH - corrDH, wallT, mS, corrD1X, corrDH + (wallH-corrDH)/2, -27);
  box(corrDW+0.2, wallH - corrDH, wallT, mS, corrD2X, corrDH + (wallH-corrDH)/2, -27);
  box(1.7,  wallH, wallT, mS, (25.5 + 27.2)/2,   wallH/2, -27); // bout extérieur droit
  // Bandeau au-dessus de la porte centrale
  box(4.8, wallH - 4.6, wallT, mS, 0, 4.6 + (wallH-4.6)/2, -27);
  // Semelle sous la porte
  box(4.8, 0.15, wallT+0.2, new THREE.MeshLambertMaterial({color:0xd0c8b0}), 0, 0.075, -27);

  // Bras gauche extérieur : X=-27, de Z=-27 à Z=+18
  // Trou pour porte latérale gauche PRÈS DU PORTAIL : Z de +13.6 à +17.6 (largeur=4)
  // Segment fond → portail (sans trou) : Z=-27 à Z=+13.6 → longueur=40.6
  box(wallT, wallH, 40.6, mS, -27, wallH/2, (-27+13.6)/2);
  // Bandeau au-dessus du trou
  box(wallT, wallH - 4.5, 4.2, mS, -27, 4.5 + (wallH-4.5)/2, 15.8);
  // Segment après trou → fin (Z=+17.6 à Z=+18) : longueur=0.4
  box(wallT, wallH, 0.4, mS, -27, wallH/2, 17.8);
  // Semelle sous porte latérale gauche
  box(wallT+0.2, 0.15, 4.2, new THREE.MeshLambertMaterial({color:0xd0c8b0}), -27, 0.075, 15.8);

  // Bras droit extérieur : X=+27 — symétrique
  box(wallT, wallH, 40.6, mS, 27, wallH/2, (-27+13.6)/2);
  box(wallT, wallH - 4.5, 4.2, mS, 27, 4.5 + (wallH-4.5)/2, 15.8);
  box(wallT, wallH, 0.4, mS, 27, wallH/2, 17.8);
  box(wallT+0.2, 0.15, 4.2, new THREE.MeshLambertMaterial({color:0xd0c8b0}), 27, 0.075, 15.8);

  // Fermeture gauche sur le mur du portail : Z=+18, X=-27 a X=-24
  box(3.4, wallH, wallT, mS, -25.7, wallH/2, 18);

  // Fermeture droite sur le mur du portail : Z=+18, X=+24 a X=+27
  box(3.4, wallH, wallT, mS, 25.7, wallH/2, 18);
}

// ── Fenêtres sur murs orientés en X (plan YZ) ─────────────────────────────
// outDir = +1 : mur à X négatif (X=-36), fenêtre dépasse vers X+
// outDir = -1 : mur à X positif (X=+36), fenêtre dépasse vers X-
function makeWindowX(wx, wy, wz, outDir) {
  const fw=1.8, fh=2.4;
  const mFrameW2 = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mGlassW2 = new THREE.MeshLambertMaterial({color:0xb8d4e8, transparent:true, opacity:0.38, side:THREE.DoubleSide});
  const mMul2    = new THREE.MeshLambertMaterial({color:0x4a4a4a});
  const mBord2   = new THREE.MeshLambertMaterial({color:0x2e2e2e});
  const oy = outDir * 0.08;
  const bThick=0.12, bExtra=0.32, bDepth=0.18;
  box(bDepth, bThick, fw+bExtra, mBord2, wx+oy, wy+fh/2+0.22, wz);
  box(bDepth, bThick, fw+bExtra, mBord2, wx+oy, wy-fh/2-0.22, wz);
  box(bDepth, fh+bExtra, bThick, mBord2, wx+oy, wy, wz-fw/2-0.22);
  box(bDepth, fh+bExtra, bThick, mBord2, wx+oy, wy, wz+fw/2+0.22);
  box(0.14, 0.14, fw+0.28, mFrameW2, wx+oy, wy+fh/2+0.07, wz);
  box(0.20, 0.16, fw+0.36, mFrameW2, wx+oy, wy-fh/2-0.08, wz);
  box(0.14, fh+0.14, 0.13, mFrameW2, wx+oy, wy, wz-fw/2-0.065);
  box(0.14, fh+0.14, 0.13, mFrameW2, wx+oy, wy, wz+fw/2+0.065);
  box(0.22, 0.10, fw+0.46, mFrameW2, wx+oy, wy+fh/2+0.20, wz);
  const cw2=(fw-0.14)/2, ch2=(fh-0.18)/3;
  for(let col=0;col<2;col++){
    for(let row=0;row<3;row++){
      const gz = wz - fw/2 + 0.07 + cw2*col + cw2/2 + col*0.04;
      const gy = wy - fh/2 + 0.09 + ch2*row + ch2/2 + row*0.04;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(cw2-0.05, ch2-0.05), mGlassW2);
      pane.position.set(wx+oy, gy, gz);
      pane.rotation.y = Math.PI/2;
      scene.add(pane);
    }
  }
  box(0.07, fh-0.04, 0.05, mMul2, wx+oy, wy, wz);
  for(let i=1;i<3;i++){
    const ty = wy - fh/2 + 0.09 + ch2*i + (i-0.5)*0.04;
    box(0.07, 0.05, fw-0.05, mMul2, wx+oy, ty, wz);
  }
}

{
  const mS = mStone;
  const wallH = 5, wallT = 0.4;
  const c2Width = 9; // 3× le premier couloir
  const c2OutX = 36; // murs extérieurs

  // Mur arrière gauche Z=-27 : X=-27 à X=-36
  box(c2Width, wallH, wallT, mS, -(27 + c2Width/2), wallH/2, -27);
  // Mur arrière droit Z=-27 : X=+27 à X=+36 — plein (toilette est dans le mur principal)
  box(c2Width, wallH, wallT, mS,  (27 + c2Width/2), wallH/2, -27);

  // ── Murs extérieurs X=±36 RDC (Y=0→5) avec fenêtres ──
  // Fenêtres à Z = -20, -12, -4, 4, 12 (5 fenêtres par côté, fw=1.8)
  {
    const winZs = [-20, -12, -4, 4, 12];
    const fw2=1.8, fh=2.4, fcy=2.6;
    const fBot=fcy-fh/2, fTop=fcy+fh/2;
    const zMin=-27, zMax=18;

    // Bandes horizontales communes aux deux murs
    [-c2OutX, c2OutX].forEach(X => {
      box(wallT, fBot,           zMax-zMin, mS, X, fBot/2,              (zMin+zMax)/2);
      box(wallT, wallH-fTop,     zMax-zMin, mS, X, fTop+(wallH-fTop)/2, (zMin+zMax)/2);
    });

    // Segments verticaux entre fenêtres pour chaque mur
    [-c2OutX, c2OutX].forEach(X => {
      const cuts=[];
      let prev=zMin;
      [...winZs].sort((a,b)=>a-b).forEach(wz=>{ cuts.push([prev, wz-fw2/2]); prev=wz+fw2/2; });
      cuts.push([prev, zMax]);
      cuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(wallT,fh,l,mS,X,fcy,(z1+z2)/2); });

      // Fenêtres
      const outDir = X < 0 ? +1 : -1; // X=-36 sort vers gauche (+X), X=+36 sort vers droite (-X)
      winZs.forEach(wz => makeWindowX(X, fcy, wz, outDir));
    });
  }

  // ── Murs Z=18 (façade portail côté bâtiments latéraux) — fenêtres sur X ──
  // Gauche : X=-27 à -36, Centre X=-31.5 — 1 fenêtre
  // Droite  : X=+27 à +36, Centre X=+31.5 — 1 fenêtre
  {
    const fw2=1.8, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const winXs_g = [-31.5]; // 1 fenêtre milieu gauche
    const winXs_d = [ 31.5]; // 1 fenêtre milieu droit

    // Mur gauche Z=18, X=-27 à -36 (largeur=9)
    {
      const xMin=-36, xMax=-27;
      box(xMax-xMin, fBot,       wallT, mS, (xMin+xMax)/2, fBot/2,              18);
      box(xMax-xMin, wallH-fTop, wallT, mS, (xMin+xMax)/2, fTop+(wallH-fTop)/2, 18);
      const cuts=[]; let prev=xMin;
      winXs_g.sort((a,b)=>a-b).forEach(wx=>{ cuts.push([prev,wx-fw2/2]); prev=wx+fw2/2; });
      cuts.push([prev,xMax]);
      cuts.forEach(([x1,x2])=>{ const w=x2-x1; if(w>0.01) box(w,fh,wallT,mS,(x1+x2)/2,fcy,18); });
      winXs_g.forEach(wx => makeWindow(wx, fcy, 18));
    }
    // Mur droit Z=18, X=+27 à +36 (largeur=9)
    {
      const xMin=27, xMax=36;
      box(xMax-xMin, fBot,       wallT, mS, (xMin+xMax)/2, fBot/2,              18);
      box(xMax-xMin, wallH-fTop, wallT, mS, (xMin+xMax)/2, fTop+(wallH-fTop)/2, 18);
      const cuts=[]; let prev=xMin;
      winXs_d.sort((a,b)=>a-b).forEach(wx=>{ cuts.push([prev,wx-fw2/2]); prev=wx+fw2/2; });
      cuts.push([prev,xMax]);
      cuts.forEach(([x1,x2])=>{ const w=x2-x1; if(w>0.01) box(w,fh,wallT,mS,(x1+x2)/2,fcy,18); });
      winXs_d.forEach(wx => makeWindow(wx, fcy, 18));
    }
  }

  // ── Murs Z=-27 côté bâtiments latéraux (arrière) — fenêtres ──
  // Gauche : X=-27 à -36 — 1 fenêtre
  // Droite  : X=+27 à +36 — 1 fenêtre (déjà plein, pas de porte ici pour le 2e couloir)
  {
    const fw2=1.8, fh=2.4, fcy=2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;

    // Mur gauche Z=-27, X=-36→-27 (remplace le box plein)
    // Note: le box plein -(27+c2Width/2) a déjà été posé au-dessus, on pose les découpes par-dessus
    // (les Box se superposent, il faut remplacer le box plein — on va juste ajouter les fenêtres visuellement)
    // Pour éviter z-fighting on ajoute 1 fenêtre de chaque côté
    makeWindow(-31.5, fcy, -27);
    // Mur droit Z=-27, X=+27→+36
    makeWindow( 31.5, fcy, -27);
  }

  // Sol du 2e couloir gauche
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(c2Width, 45), mPave);
    pl.rotation.x = -Math.PI/2; pl.position.set(-(27+c2Width/2), 0.01, (-27+18)/2); pl.receiveShadow=true; scene.add(pl);
  }
  // Sol du 2e couloir droit
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(c2Width, 45), mPave);
    pl.rotation.x = -Math.PI/2; pl.position.set( (27+c2Width/2), 0.01, (-27+18)/2); pl.receiveShadow=true; scene.add(pl);
  }

  // Les murs X=±36 sont pleins — les chambres n'ont qu'une seule entrée (mur Z=18)
}

// ─── TOIT PLAT (sur le RDC, premier étage supprimé) ─────────────────────
{
  const mRoofTop = new THREE.MeshLambertMaterial({map:roofTex, color:0x6a7880});
  const roofY = 5.05;

  // Toit bande couloir en U gauche : X=-24→-27, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 45), mRoofTop);
    pl.rotation.x = -Math.PI/2; pl.position.set(-25.5, roofY, (-27+18)/2); scene.add(pl); }
  // Toit bande couloir en U droit : X=+24→+27, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 45), mRoofTop);
    pl.rotation.x = -Math.PI/2; pl.position.set(25.5, roofY, (-27+18)/2); scene.add(pl); }
  // Toit façade arrière : X=-24→+24, Z=-19.5→-27
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(48, 7.5), mRoofTop);
    pl.rotation.x = -Math.PI/2; pl.position.set(0, roofY, (-19.5-27)/2); scene.add(pl); }
  // Toit chambres arrière SUPPRIMÉ — remplacé par le sol de la Bibliothèque au 1er étage
  // Zone cage escalier X=-20.21→-12.23 : PAS de toit RDC (ouverture vers 1er étage)

  // ── PLAFONDS INTÉRIEURS RDC (sous les salles du 1er étage) ──
  // Épaisseur augmentée à 0.6 pour masquer complètement les objets de l'étage supérieur
  const mCeilRDC = new THREE.MeshLambertMaterial({color:0xe8e0cc});
  const ceilThickness = 0.6;
  // Plafond couloir gauche RDC (Classe C) : X=-36→-27, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.BoxGeometry(9, ceilThickness, 45), mCeilRDC);
    pl.position.set(-(27+4.5), roofY - ceilThickness/2, (-27+18)/2); scene.add(pl); }
  // Plafond couloir droit RDC (Classe D) : X=+27→+36, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.BoxGeometry(9, ceilThickness, 45), mCeilRDC);
    pl.position.set( (27+4.5), roofY - ceilThickness/2, (-27+18)/2); scene.add(pl); }
  // Plafond bande couloir en U gauche : X=-24→-27, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 45), mCeilRDC);
    pl.rotation.x = Math.PI/2; pl.position.set(-25.5, roofY, (-27+18)/2); scene.add(pl); }
  // Plafond bande couloir en U droit : X=+24→+27, Z=-27→18
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 45), mCeilRDC);
    pl.rotation.x = Math.PI/2; pl.position.set(25.5, roofY, (-27+18)/2); scene.add(pl); }
  // Plafond façade arrière : X=-24→+24, Z=-19.5→-27
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(48, 7.5), mCeilRDC);
    pl.rotation.x = Math.PI/2; pl.position.set(0, roofY, (-19.5-27)/2); scene.add(pl); }
  // Plafond sous la bibliothèque (zone arrière Z=-27→-35.5), sauf trou cage escalier
  // Partie gauche : X=-36 → -20.21
  { const w = 36-20.21; const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 8.5), mCeilRDC);
    pl.rotation.x = Math.PI/2; pl.position.set(-36+w/2, roofY, (-27-35.5)/2); scene.add(pl); }
  // Partie droite : X=-12.23 → +36
  { const w = 36-12.23; const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 8.5), mCeilRDC);
    pl.rotation.x = Math.PI/2; pl.position.set(-12.23+w/2, roofY, (-27-35.5)/2); scene.add(pl); }
  // Corniche façade Z=18
  box(9, 0.30, 0.70, mStone, -(27+4.5), roofY + 0.15, 18.35);
  box(9, 0.30, 0.70, mStone,  (27+4.5), roofY + 0.15, 18.35);
  box(0.70, 0.30, 46, mStone, -36.35, roofY + 0.15, (-27+18)/2);
  box(0.70, 0.30, 46, mStone,  36.35, roofY + 0.15, (-27+18)/2);
}

// ═══════════════════════════════════════════════════════
// ─── CLASSE 5e A — 1er ÉTAGE (au-dessus du couloir droit X=27→36) ──────────
// Même empreinte que le couloir droit : X=27→36, Z=-27→18, Y=5→10
// ═══════════════════════════════════════════════════════
{
  const rXmin = 27, rXmax = 36;
  const rZfront = -27, rZback = 18;
  const rW  = rXmax - rXmin;          // 9
  const rD  = Math.abs(rZback - rZfront); // 45
  const rCX = (rXmin + rXmax) / 2;    // 31.5
  const rCZ = (rZfront + rZback) / 2; // -4.5
  const rH  = 5;   // hauteur du rez-de-chaussée = base du 1er étage
  const rFloorY = rH;                 // sol à Y=5
  const rCeilY  = rH + rH;           // plafond à Y=10
  const wallT = 0.4;

  const mRoomA   = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloorA  = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeilA   = new THREE.MeshLambertMaterial({color:0xe8e0cc});

  // Sol (= ancien toit du couloir droit)
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mFloorA);
    pl.rotation.x = -Math.PI/2; pl.position.set(rCX, rFloorY + 0.01, rCZ);
    pl.receiveShadow = true; scene.add(pl);
  }

  // Plafond
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mCeilA);
    pl.rotation.x = Math.PI/2; pl.position.set(rCX, rCeilY, rCZ);
    scene.add(pl);
  }

  // Toit extérieur sur le plafond
  {
    const mRoofTop2 = new THREE.MeshLambertMaterial({map:roofTex, color:0x6a7880});
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW + 0.8, rD + 0.8), mRoofTop2);
    pl.rotation.x = -Math.PI/2; pl.position.set(rCX, rCeilY + 0.06, rCZ);
    scene.add(pl);
  }

  // Mur intérieur (X = rXmin = 27) — avec trou pour porte à Z=15.8
  {
    const doorW = 3.8, doorH = 4.5, doorZ = 15.8;
    const zSegments = [
      [rZfront, doorZ - doorW/2],
      [doorZ + doorW/2, rZback]
    ];
    zSegments.forEach(([z1, z2]) => {
      const len = z2 - z1;
      if(len > 0.01) box(wallT, rH, len, mRoomA, rXmin, rFloorY + rH/2, (z1+z2)/2);
    });
    // Bandeau au-dessus de la porte
    box(wallT, rH - doorH, doorW + 0.4, mRoomA, rXmin, rFloorY + doorH + (rH - doorH)/2, doorZ);
  }

  // Mur extérieur (X = rXmax = 36) — avec fenêtres (5 sur la longueur, même nombre que RDC)
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const winZs=[-20, -12, -4, 4, 12];
    box(wallT, fBot-rFloorY,     rD, mRoomA, rXmax, rFloorY+(fBot-rFloorY)/2,  rCZ);
    box(wallT, rH-(fTop-rFloorY),rD, mRoomA, rXmax, fTop+(rH-(fTop-rFloorY))/2,rCZ);
    const cuts=[]; let prev=rZfront;
    winZs.sort((a,b)=>a-b).forEach(wz=>{ cuts.push([prev,wz-fw2/2]); prev=wz+fw2/2; });
    cuts.push([prev,rZback]);
    cuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(wallT,fh,l,mRoomA,rXmax,fcy,(z1+z2)/2); });
    winZs.forEach(wz => makeWindowX(rXmax, fcy, wz, -1));
  }

  // Mur arrière (Z = rZfront = -27) — avec fenêtre centrale
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wX=rCX; // fenêtre au centre X=31.5
    box(rW+wallT*2, fBot-rFloorY,     wallT, mRoomA, rCX, rFloorY+(fBot-rFloorY)/2,  rZfront);
    box(rW+wallT*2, rH-(fTop-rFloorY),wallT, mRoomA, rCX, fTop+(rH-(fTop-rFloorY))/2,rZfront);
    // Segments gauche et droit autour de la fenêtre
    box((rW-fw2)/2, fh, wallT, mRoomA, rXmin+(rW-fw2)/4,          fcy, rZfront);
    box((rW-fw2)/2, fh, wallT, mRoomA, rXmax-(rW-fw2)/4,          fcy, rZfront);
    makeWindow(wX, fcy, rZfront);
  }

  // Mur avant (Z = rZback = +18) — avec fenêtre centrale
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wX=rCX;
    box(rW+wallT*2, fBot-rFloorY,     wallT, mRoomA, rCX, rFloorY+(fBot-rFloorY)/2,  rZback);
    box(rW+wallT*2, rH-(fTop-rFloorY),wallT, mRoomA, rCX, fTop+(rH-(fTop-rFloorY))/2,rZback);
    box((rW-fw2)/2, fh, wallT, mRoomA, rXmin+(rW-fw2)/4, fcy, rZback);
    box((rW-fw2)/2, fh, wallT, mRoomA, rXmax-(rW-fw2)/4, fcy, rZback);
    makeWindow(wX, fcy, rZback);
  }

  // Lumières dans la salle
  [-10, rCZ, 10].forEach(lz => {
    const roomLight = new THREE.PointLight(0xffe8c0, 0.5, 14);
    roomLight.position.set(rCX, rCeilY - 0.5, lz);
    scene.add(roomLight);
    const bulbMat3 = new THREE.MeshBasicMaterial({color: 0xffe8a0});
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bulbMat3);
    bulb.position.set(rCX, rCeilY - 0.4, lz);
    scene.add(bulb);
    const wireMat3 = new THREE.MeshLambertMaterial({color:0x222222});
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), wireMat3);
    wire.position.set(rCX, rCeilY - 0.15, lz);
    scene.add(wire);
  });
}

// ═══════════════════════════════════════════════════════
// ─── CLASSE 5e B — 1er ÉTAGE (au-dessus du couloir gauche X=-36→-27) ──────────
// Symétrique de la Classe 5e A, même empreinte : X=-36→-27, Z=-27→18, Y=5→10
// ═══════════════════════════════════════════════════════
{
  const rXmin = -36, rXmax = -27;
  const rZfront = -27, rZback = 18;
  const rW  = Math.abs(rXmax - rXmin);     // 9
  const rD  = Math.abs(rZback - rZfront);  // 45
  const rCX = (rXmin + rXmax) / 2;         // -31.5
  const rCZ = (rZfront + rZback) / 2;      // -4.5
  const rH  = 5;
  const rFloorY = rH;                       // sol à Y=5
  const rCeilY  = rH + rH;                 // plafond à Y=10
  const wallT = 0.4;

  const mRoomB  = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloorB = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeilB  = new THREE.MeshLambertMaterial({color:0xe8e0cc});

  // Sol (= ancien toit du couloir gauche)
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mFloorB);
    pl.rotation.x = -Math.PI/2; pl.position.set(rCX, rFloorY + 0.01, rCZ);
    pl.receiveShadow = true; scene.add(pl);
  }

  // Plafond
  {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW, rD), mCeilB);
    pl.rotation.x = Math.PI/2; pl.position.set(rCX, rCeilY, rCZ);
    scene.add(pl);
  }

  // Toit extérieur sur le plafond
  {
    const mRoofTop2 = new THREE.MeshLambertMaterial({map:roofTex, color:0x6a7880});
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(rW + 0.8, rD + 0.8), mRoofTop2);
    pl.rotation.x = -Math.PI/2; pl.position.set(rCX, rCeilY + 0.06, rCZ);
    scene.add(pl);
  }

  // Mur intérieur (X = rXmax = -27) — avec trou pour porte à Z=15.8
  {
    const doorW = 3.8, doorH = 4.5, doorZ = 15.8;
    const zSegments = [
      [rZfront, doorZ - doorW/2],
      [doorZ + doorW/2, rZback]
    ];
    zSegments.forEach(([z1, z2]) => {
      const len = z2 - z1;
      if(len > 0.01) box(wallT, rH, len, mRoomB, rXmax, rFloorY + rH/2, (z1+z2)/2);
    });
    // Bandeau au-dessus de la porte
    box(wallT, rH - doorH, doorW + 0.4, mRoomB, rXmax, rFloorY + doorH + (rH - doorH)/2, doorZ);
  }

  // Mur extérieur (X = rXmin = -36) — avec fenêtres (5 sur la longueur, même nombre que RDC)
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const winZs=[-20, -12, -4, 4, 12];
    box(wallT, fBot-rFloorY,     rD, mRoomB, rXmin, rFloorY+(fBot-rFloorY)/2,  rCZ);
    box(wallT, rH-(fTop-rFloorY),rD, mRoomB, rXmin, fTop+(rH-(fTop-rFloorY))/2,rCZ);
    const cuts=[]; let prev=rZfront;
    winZs.sort((a,b)=>a-b).forEach(wz=>{ cuts.push([prev,wz-fw2/2]); prev=wz+fw2/2; });
    cuts.push([prev,rZback]);
    cuts.forEach(([z1,z2])=>{ const l=z2-z1; if(l>0.01) box(wallT,fh,l,mRoomB,rXmin,fcy,(z1+z2)/2); });
    winZs.forEach(wz => makeWindowX(rXmin, fcy, wz, +1));
  }

  // Mur arrière (Z = rZfront = -27) — avec fenêtre centrale
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wX=rCX;
    box(rW+wallT*2, fBot-rFloorY,     wallT, mRoomB, rCX, rFloorY+(fBot-rFloorY)/2,  rZfront);
    box(rW+wallT*2, rH-(fTop-rFloorY),wallT, mRoomB, rCX, fTop+(rH-(fTop-rFloorY))/2,rZfront);
    box((rW-fw2)/2, fh, wallT, mRoomB, rXmin+(rW-fw2)/4, fcy, rZfront);
    box((rW-fw2)/2, fh, wallT, mRoomB, rXmax-(rW-fw2)/4, fcy, rZfront);
    makeWindow(wX, fcy, rZfront);
  }

  // Mur avant (Z = rZback = +18) — avec fenêtre centrale
  {
    const fw2=1.8, fh=2.4, fcy=rFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const wX=rCX;
    box(rW+wallT*2, fBot-rFloorY,     wallT, mRoomB, rCX, rFloorY+(fBot-rFloorY)/2,  rZback);
    box(rW+wallT*2, rH-(fTop-rFloorY),wallT, mRoomB, rCX, fTop+(rH-(fTop-rFloorY))/2,rZback);
    box((rW-fw2)/2, fh, wallT, mRoomB, rXmin+(rW-fw2)/4, fcy, rZback);
    box((rW-fw2)/2, fh, wallT, mRoomB, rXmax-(rW-fw2)/4, fcy, rZback);
    makeWindow(wX, fcy, rZback);
  }

  // Lumières dans la salle
  [-10, rCZ, 10].forEach(lz => {
    const roomLight = new THREE.PointLight(0xffe8c0, 0.5, 14);
    roomLight.position.set(rCX, rCeilY - 0.5, lz);
    scene.add(roomLight);
    const bulbMatB = new THREE.MeshBasicMaterial({color: 0xffe8a0});
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bulbMatB);
    bulb.position.set(rCX, rCeilY - 0.4, lz);
    scene.add(bulb);
    const wireMatB = new THREE.MeshLambertMaterial({color:0x222222});
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), wireMatB);
    wire.position.set(rCX, rCeilY - 0.15, lz);
    scene.add(wire);
  });
}

// ═══════════════════════════════════════════════════════
// ─── MOBILIER INTERACTIF DES 4 SALLES DE CLASSE ───────
// ═══════════════════════════════════════════════════════

// Salles : X=27→36 (D/A droite) et X=-36→-27 (C/B gauche), Z=-27→18
// Porte à Z≈15.8, côté X=±27 → on entre depuis Z=15 vers Z=-27 (fond)
// Tableau sur le mur fond Z=-27, casiers près de l'entrée Z≈12→16

const classroomStates = {};
const interactables   = [];
const classroomLights = {};
const chalkBoards     = {};

// Noms élèves par roomId
const roomStudents = {
  classeA: classData[0].students,
  classeB: classData[1].students,
  classeC: classData[2].students,
  classeD: classData[3].students,
};

{
  // ── Matériaux ──
  const mDesk    = new THREE.MeshLambertMaterial({color:0x8B5E2A});
  const mDeskTop = new THREE.MeshLambertMaterial({color:0xC49A38});
  const mChairWd = new THREE.MeshLambertMaterial({color:0x5a3a18});
  const mChairBl = new THREE.MeshLambertMaterial({color:0x1a3a70});
  const mBBframe = new THREE.MeshLambertMaterial({color:0x2a1a08});
  const mChalkMt = new THREE.MeshLambertMaterial({color:0xf0f0ee});
  const mPrfDesk = new THREE.MeshLambertMaterial({color:0x5a2e08});
  const mPrfTop  = new THREE.MeshLambertMaterial({color:0x7a4a18});
  const mLocker  = new THREE.MeshLambertMaterial({color:0xdde0e4});
  const mLockDr  = new THREE.MeshLambertMaterial({color:0xeef0f2});
  const mHandle  = new THREE.MeshLambertMaterial({color:0xc8a820});
  const mSwitch  = new THREE.MeshLambertMaterial({color:0xe8e4d8});
  const mSwitchO = new THREE.MeshLambertMaterial({color:0xffee70});
  const mNeon    = new THREE.MeshLambertMaterial({color:0xffffee,emissive:0xffffaa,emissiveIntensity:1.0});
  const mNeonOff = new THREE.MeshLambertMaterial({color:0x888880,emissive:0x000000,emissiveIntensity:0});

  // ── Texture nom sur étiquette (petite, style anime) ──
  function makeLockerTex(name) {
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const x = c.getContext('2d');
    // Fond beige clair comme une étiquette papier
    x.fillStyle='#f5f0e0'; x.fillRect(0,0,256,64);
    x.strokeStyle='#c8a860'; x.lineWidth=2; x.strokeRect(3,3,250,58);
    // Ligne déco intérieure
    x.strokeStyle='#e0c880'; x.lineWidth=1; x.strokeRect(7,7,242,50);
    x.fillStyle='#2a1a08';
    x.font='bold 18px Arial,sans-serif'; x.textAlign='center';
    x.fillText(name, 128, 40);
    return _CT(c);
  }

  // ── Texture porte casier (couleur unie avec détails) ──
  function makeLockerDoorTex(color) {
    const c = document.createElement('canvas'); c.width=128; c.height=512;
    const x = c.getContext('2d');
    x.fillStyle=color; x.fillRect(0,0,128,512);
    // Reflet léger sur le bord gauche
    const grad = x.createLinearGradient(0,0,30,0);
    grad.addColorStop(0,'rgba(255,255,255,0.18)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=grad; x.fillRect(0,0,30,512);
    // Fentes de ventilation (comme dans les films)
    x.fillStyle='rgba(0,0,0,0.18)';
    for(let i=0;i<8;i++){
      x.fillRect(20, 80+i*22, 88, 6);
    }
    // Contour de la porte
    x.strokeStyle='rgba(0,0,0,0.15)'; x.lineWidth=3;
    x.strokeRect(3,3,122,506);
    return _CT(c);
  }

  // ── Tableau noir interactif ──
  function makeBoard(cx, floorY, cz, W, H, roomId) {
    const bc = document.createElement('canvas'); bc.width=1024; bc.height=512;
    const bx = bc.getContext('2d');
    bx.fillStyle='#1a2e1a'; bx.fillRect(0,0,1024,512);
    const tex = _CT(bc);
    const mat = new THREE.MeshLambertMaterial({map:tex});
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(W,H,0.12), mat);
    mesh.position.set(cx, floorY+H/2+0.8, cz+0.07);
    mesh.castShadow=true; scene.add(mesh);
    // Cadre bois
    [[W+0.2,0.14,cx,floorY+H+0.87,cz+0.09],
     [W+0.2,0.14,cx,floorY+0.73,cz+0.09],
     [0.14,H+0.2,cx-W/2-0.09,floorY+H/2+0.80,cz+0.09],
     [0.14,H+0.2,cx+W/2+0.09,floorY+H/2+0.80,cz+0.09]
    ].forEach(([fw,fh,fx,fy,fz])=>{
      const f=new THREE.Mesh(new THREE.BoxGeometry(fw,fh,0.10),mBBframe);
      f.position.set(fx,fy,fz); scene.add(f);
    });
    // Tablette + craie
    const tray=new THREE.Mesh(new THREE.BoxGeometry(W*0.6,0.08,0.14),mBBframe);
    tray.position.set(cx,floorY+0.72,cz+0.14); scene.add(tray);
    const chalk=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.07,0.07),mChalkMt);
    chalk.position.set(cx-0.5,floorY+0.80,cz+0.18); scene.add(chalk);
    chalkBoards[roomId]={canvas:bc,ctx:bx,tex,mesh,cx,cz:cz+0.07,W,H,floorY};
    interactables.push({mesh,type:'blackboard',roomId,data:chalkBoards[roomId]});
  }

  // ── Pupitre scolaire : plateau + 4 pieds + encadrement 3 côtés (ouvert devant) ──
  function makePupitre(px, floorY, pz, roomId, idx) {
    const deskW = 1.95;   // -25% de 2.60
    const deskD = 1.10;
    const deskH = 1.20;
    const frameT = 0.07;
    const frameH = 0.40;
    const mMet   = new THREE.MeshLambertMaterial({color:0x777777});
    const mFrame = new THREE.MeshLambertMaterial({color:0xA06818});

    const dg = new THREE.Group(); dg.position.set(px, floorY, pz); scene.add(dg);
    const db=(w,h,d,mat,x,y,z)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; dg.add(m);
    };

    // 4 pieds métal
    [[-deskW/2+0.06,-deskD/2+0.06],[deskW/2-0.06,-deskD/2+0.06],
     [-deskW/2+0.06, deskD/2-0.06],[deskW/2-0.06, deskD/2-0.06]].forEach(([dx,dz])=>{
      db(0.07, deskH, 0.07, mMet, dx, deskH/2, dz);
    });

    // Plateau bois
    db(deskW, 0.07, deskD, mDeskTop, 0, deskH + 0.035, 0);

    // Encadrement 3 côtés sous le plateau — ouvert derrière (Z+), fermé devant
    // + plateau bas pour poser les affaires
    const fy = deskH - frameH/2;
    db(deskW,  frameH, frameT, mFrame,  0,               fy, -deskD/2 + frameT/2); // avant (fermé)
    db(frameT, frameH, deskD,  mFrame, -deskW/2+frameT/2, fy, 0);                  // gauche
    db(frameT, frameH, deskD,  mFrame,  deskW/2-frameT/2, fy, 0);                  // droite
    // Plateau bas (fond du casier) pour que les affaires ne tombent pas
    db(deskW - frameT*2, frameT, deskD, mFrame, 0, deskH - frameH, 0);

    interactables.push({mesh:dg, type:'deskcasier', roomId, index:idx, data:{items:[],group:dg}});

    // ── Chaise bien grande, dossier vers Z+ (élève face au tableau Z-) ──
    const legHC = 0.80;
    const seatY = legHC + 0.05;
    const backH = 0.70;
    const chairZ = pz + 1.20;

    const cg = new THREE.Group(); cg.position.set(px, floorY, chairZ); scene.add(cg);
    const cb=(w,h,d,mat,x,y,z)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; cg.add(m);
    };

    // 4 pieds chaise
    [[-0.32,-0.28],[0.32,-0.28],[-0.32,0.28],[0.32,0.28]].forEach(([dx,dz])=>{
      cb(0.06, legHC, 0.06, mChairWd, dx, legHC/2, dz);
    });
    // Assise large
    cb(0.74, 0.08, 0.64, mChairBl, 0, seatY, 0);
    // Dossier vers Z+
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.72, backH, 0.06), mChairBl);
    bk.position.set(0, seatY + backH/2 + 0.05, 0.30);
    cg.add(bk);
    [-0.30, 0.30].forEach(dx=>{
      cb(0.06, backH+0.10, 0.06, mChairWd, dx, seatY+(backH+0.10)/2, 0.29);
    });

    interactables.push({mesh:cg, type:'chair', roomId, index:idx,
      data:{seatX:px, seatY:floorY+seatY, seatZ:chairZ}});
  }

  // ── Bureau prof ──
  function makeProfDesk(px, floorY, pz) {
    const g=new THREE.Group(); g.position.set(px,floorY,pz); scene.add(g);
    const gb=(w,h,d,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;g.add(m);};
    gb(0.07,0.82,0.75,mPrfDesk,-0.78,0.41,0);
    gb(0.07,0.82,0.75,mPrfDesk, 0.78,0.41,0);
    gb(1.62,0.56,0.06,mPrfDesk,0,0.38,0.37);
    [-0.40,0.40].forEach(dx=>{gb(0.38,0.18,0.06,new THREE.MeshLambertMaterial({color:0x7a4a18}),dx,0.56,0.38);gb(0.10,0.04,0.05,mHandle,dx,0.56,0.41);});
    gb(1.65,0.07,0.78,mPrfTop,0,0.83,0);
    // Chaise prof
    const cg=new THREE.Group(); cg.position.set(px,floorY,pz-0.85); scene.add(cg);
    const cb=(w,h,d,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;cg.add(m);};
    [-0.24,0.24].forEach(dx=>[-0.24,0.24].forEach(dz=>cb(0.07,0.80,0.07,mChairWd,dx,0.40,dz)));
    cb(0.62,0.07,0.56,new THREE.MeshLambertMaterial({color:0x0f2050}),0,0.84,0);
    const bkp=new THREE.Mesh(new THREE.BoxGeometry(0.60,0.52,0.07),new THREE.MeshLambertMaterial({color:0x0f2050}));
    bkp.position.set(0,1.16,0.27); bkp.rotation.x=0.12; cg.add(bkp);
    interactables.push({mesh:cg,type:'chair',roomId:'prof',index:-1,data:{seatX:px,seatY:floorY+0.90,seatZ:pz-0.85}});
  }

  // ── Casier style anime avec étagères, porte interactive ──
  // Couleurs pastel style anime pour chaque casier
  const lockerColors=['#b8cce4','#c4dbb8','#e4c8b8','#d4c4e4','#b8dce4','#e4d8b8','#e4b8c8','#c8e4d4'];

  function makeLocker(px, floorY, pz, name, roomId, idx, flipPivot=false) {
    const g=new THREE.Group(); g.position.set(px,floorY,pz); scene.add(g);
    const W=1.04, D=0.90;
    // H total = 1.90 — divisé en :
    //   compartiment haut  : 0.55 (livres/trousse)
    //   compartiment milieu: 0.48 (affaires)
    //   compartiment bas   : 0.72 (cartable — plus grand!)
    //   épaisseur plancher/plafond: 0.03×3 + parois = ~0.12
    const H=3.80;
    const shelfT=0.05;
    // Position des étagères de haut en bas (Y absolu depuis le bas du casier)
    const shelfY1 = 1.44+shelfT;
    const shelfY2 = 1.44+shelfT+0.96+shelfT;
    // Le dessus est le plafond du casier à H=1.90

    // Couleur pastel du casier
    const hexCol = lockerColors[idx % lockerColors.length];
    const colNum = parseInt(hexCol.slice(1),16);
    const mLockerColor = new THREE.MeshLambertMaterial({color:colNum});
    const mLockerInside = new THREE.MeshLambertMaterial({color:0xf0eee8});
    const mShelf = new THREE.MeshLambertMaterial({color:0xd0ccc0});

    // ── Corps (extérieur) ──
    const body=new THREE.Mesh(new THREE.BoxGeometry(W,H,D),mLockerColor);
    body.position.set(0,H/2,0); body.castShadow=true; g.add(body);

    // ── Intérieur (légèrement plus petit pour effet 3D) ──
    const iW=W-0.04, iD=D-0.04, iT=0.02;
    // Face arrière intérieure
    const backIn=new THREE.Mesh(new THREE.PlaneGeometry(iW,H-iT*2),mLockerInside);
    backIn.position.set(0,H/2,-D/2+iT+0.001); g.add(backIn);
    // Côtés intérieurs gauche/droite
    [-iW/2,iW/2].forEach((sx,si)=>{
      const sideIn=new THREE.Mesh(new THREE.PlaneGeometry(iD,H-iT*2),mLockerInside);
      sideIn.rotation.y=(si===0?Math.PI/2:-Math.PI/2);
      sideIn.position.set(sx,H/2,0); g.add(sideIn);
    });

    // ── Étagères intérieures ──
    [shelfY1, shelfY2].forEach(sy=>{
      const shelf=new THREE.Mesh(new THREE.BoxGeometry(iW,shelfT,iD),mShelf);
      shelf.position.set(0,sy,0); g.add(shelf);
    });

    // ── Porte (pivot sur le bord gauche, s'ouvre vers l'intérieur) ──
    const pivotX = flipPivot ? W/2 : -W/2;
    const dp=new THREE.Group(); dp.position.set(pivotX,H/2,D/2); g.add(dp);

    // Porte couleur pastel solide
    const doorMat = new THREE.MeshLambertMaterial({color:colNum});
    const door=new THREE.Mesh(new THREE.BoxGeometry(W,H,0.04),doorMat);
    door.position.set(flipPivot ? -W/2 : W/2, 0, 0.02); dp.add(door);

    // ── Étiquette nom sur la porte (bas, visible) ──
    const labelW=W*0.60, labelH=0.18;
    const labelTex = makeLockerTex(name);
    const labelMat2 = new THREE.MeshBasicMaterial({map:labelTex,transparent:true,depthWrite:false});
    const label=new THREE.Mesh(new THREE.PlaneGeometry(labelW,labelH),labelMat2);
    label.position.set(flipPivot ? -W/2 : W/2, H/2-0.35, -0.046);
    dp.add(label);

    // Poignée chromée (barre horizontale)
    const hndBar=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.26,0.11),mHandle);
    hndBar.position.set(flipPivot ? W*0.15 : W*0.85, 0.08, 0.06); dp.add(hndBar);
    const hndPlate=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.44,0.05),new THREE.MeshLambertMaterial({color:0xd8d8d8}));
    hndPlate.position.set(flipPivot ? W*0.15 : W*0.85, 0.08, 0.045); dp.add(hndPlate);

    // Séparateur entre compartiments
    [shelfY1-H/2+shelfT, shelfY2-H/2+shelfT].forEach(dy=>{
      const sep=new THREE.Mesh(new THREE.BoxGeometry(W,0.03,0.05),new THREE.MeshLambertMaterial({color:Math.floor(colNum*0.82)}));
      sep.position.set(flipPivot ? -W/2 : W/2, dy, 0.022); dp.add(sep);
    });
    // Fentes ventilation (géométrie, pas texture)
    const ventMat=new THREE.MeshLambertMaterial({color:Math.floor(colNum*0.75)});
    for(let v=0;v<5;v++){
      const vent=new THREE.Mesh(new THREE.BoxGeometry(W*0.55,0.04,0.05),ventMat);
      vent.position.set(flipPivot ? -W/2 : W/2, H/2-0.8-v*0.22, 0.024); dp.add(vent);
    }

    const lockerData={dp,isOpen:false,roomId,idx};
    interactables.push({mesh:door,type:'locker',roomId,data:lockerData});
    return lockerData;
  }

  // ── Interrupteur ──
  function makeSwitch(px, floorY, pz, roomId, ry=0) {
    const g=new THREE.Group(); g.position.set(px,floorY+1.35,pz); g.rotation.y=ry; scene.add(g);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.24,0.04),mSwitch); plate.castShadow=true; g.add(plate);
    const btn=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.11,0.05),mSwitch); btn.position.set(0,0,0.02); g.add(btn);
    interactables.push({mesh:btn,type:'lightswitch',roomId,data:{btn,switchGroup:g}});
  }

  // ── Plafonnier néon ──
  function makeNeon(cx, floorY, cz, roomId) {
    const ceilY=floorY+5.0;
    const box2=new THREE.Mesh(new THREE.BoxGeometry(1.40,0.09,0.45),new THREE.MeshLambertMaterial({color:0xdddacc}));
    box2.position.set(cx,ceilY-0.05,cz); scene.add(box2);
    const tube=new THREE.Mesh(new THREE.BoxGeometry(1.20,0.07,0.14),mNeon);
    tube.position.set(cx,ceilY-0.11,cz); scene.add(tube);
    const light=new THREE.PointLight(0xfff8e0,1.4,20);
    light.position.set(cx,ceilY-0.15,cz); scene.add(light);
    classroomLights[roomId]={light,tube,on:true};
  }

  // ══════════════════════════════════════════
  // ── Construction d'une salle complète ──
  // cx = centre X salle, floorY = Y sol, xSign = +1 (droite) ou -1 (gauche)
  // Porte à Z=15.8, fond à Z=-27
  // ══════════════════════════════════════════
  function buildClassroom(roomId, cx, floorY, xSign) {
    const zFond  = -27;   // mur fond (tableau)
    const zPorte = 15.8;  // porte entrée
    const xWall  = cx + xSign*4.5; // mur latéral intérieur (vers cour)
    classroomStates[roomId]={lightOn:true};

    // ── Tableau noir sur le mur fond ──
    makeBoard(cx, floorY, zFond+0.07, 6.5, 2.2, roomId);

    // ── Bureau prof entre tableau et élèves ──
    makeProfDesk(cx, floorY, zFond+2.8);

    // ── 8 pupitres : 2 colonnes × 4 rangées, face au tableau (vers Z-) ──
    const cols=2, rows=4, spX=4.0, spZ=5.0;
    const startX = cx - (cols-1)*spX/2;
    const startZ = zFond + 6.0;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      makePupitre(startX+c*spX, floorY, startZ+r*spZ, roomId, r*cols+c);
    }

    // ── Casiers : 4 dos au mur intérieur + 4 dos au mur extérieur, face à face ──
    // Offset depuis le mur : ~0.55u dans la salle (casiers 2× plus larges W=1.04)
    const students = roomStudents[roomId] || [];
    const lockerStartZ = 14.0;  // près de la porte
    const lockerSpZ = 2.5;

    // Mur intérieur (côté couloir) : dos au mur, face vers cx
    const xInt = xWall - xSign * 0.55;
    for(let i=0;i<4;i++){
      const lz = lockerStartZ - i * lockerSpZ;
      const name = students[i] || ('Élève '+(i+1));
      const ld = makeLocker(xInt, floorY, lz, name, roomId, i);
      const baseRY = xSign > 0 ? Math.PI/2 : -Math.PI/2;
      ld.dp.rotation.y = baseRY;
      ld.baseRY = baseRY;
    }

    // Mur extérieur (côté fenêtres) : dos au mur, face vers cx
    const xWallExt = cx - xSign * 4.5;
    const xExt = xWallExt + xSign * 0.55;
    for(let i=0;i<4;i++){
      const lz = lockerStartZ - i * lockerSpZ;
      const name = students[4+i] || ('Élève '+(5+i));
      const ld = makeLocker(xExt, floorY, lz, name, roomId, 4+i, true);
      const baseRY = xSign > 0 ? -Math.PI/2 : Math.PI/2;
      ld.dp.rotation.y = baseRY;
      ld.baseRY = baseRY;
    }

    // ── Interrupteur près de la porte ──
    makeSwitch(cx - xSign*3.8, floorY, zPorte - 0.4, roomId, xSign>0 ? -Math.PI/2 : Math.PI/2);

    // ── Néon au plafond (milieu de la salle) ──
    makeNeon(cx, floorY, (zFond+zPorte)/2, roomId);
  }

  buildClassroom('classeD',  31.5, 0,  -1); // RDC droite  (X=27→36, mur int X=27)
  buildClassroom('classeC', -31.5, 0,  +1); // RDC gauche  (X=-36→-27, mur int X=-27)
  buildClassroom('classeA',  31.5, 5,  -1); // 1er droite
  buildClassroom('classeB', -31.5, 5,  +1); // 1er gauche
}

// ══════════════════════════════════════════════════════
// ─── SYSTÈME D'INTERACTION SALLES (tableau, chaises, casiers, interrupteurs) ───
// L'interface utilise le bouton d'action du jeu (touche E / Entrée) : voir refreshAction().

let chalkMode=false, chalkTarget=null, isDrawing=false, lastMX=-1, lastMY=-1;
let isSeated=false, seatedPos=null;
const IA_LABELS = {blackboard:'🖊️ Écrire au tableau', chair:'🪑 S\'asseoir', locker:'📦 Ouvrir le casier', lightswitch:'💡 Lumière'};

function standUp(){ isSeated=false; }

const rc3=new THREE.Raycaster();
const sc2=new THREE.Vector2(0,0);

function getNearInteractable(){
  rc3.setFromCamera(sc2,REALCAM);   // vraie caméra : les meshes sont dans le monde
  const allMeshes=[];
  const meshToIA=new Map();
  interactables.forEach(ia=>{
    const collect=(obj)=>{
      if(obj.isMesh){allMeshes.push(obj);meshToIA.set(obj,ia);}
      obj.children&&obj.children.forEach(collect);
    };
    collect(ia.mesh instanceof THREE.Group ? ia.mesh : {isMesh:false,children:[ia.mesh]});
    if(ia.mesh.isMesh){allMeshes.push(ia.mesh);meshToIA.set(ia.mesh,ia);}
  });
  const hits=rc3.intersectObjects(allMeshes,false);
  if(!hits.length||hits[0].distance>3.2) return null;
  return meshToIA.get(hits[0].object)||null;
}

function doInteract(){
  if(chalkMode){ exitChalk(); return; }
  if(isSeated){ standUp(); return; }
  const ia=getNearInteractable();
  if(!ia) return;
  if(ia.type==='blackboard') enterChalk(ia.data);
  else if(ia.type==='chair')  sitDown(ia.data);
  else if(ia.type==='locker') toggleLocker(ia.data);
  else if(ia.type==='lightswitch') toggleLight(ia.roomId,ia.data);
}

function enterChalk(d){ chalkMode=true;chalkTarget=d;canvas.style.cursor='crosshair'; showToastMsg('🖍️ Mode craie — clic-glisser pour écrire'); }
function exitChalk(){ chalkMode=false;chalkTarget=null;isDrawing=false;lastMX=-1;lastMY=-1; }

function sitDown(d){
  isSeated=true;
  seatedPos=new THREE.Vector3(d.seatX,d.seatY,d.seatZ);
  camera.position.copy(seatedPos);
}

function toggleLocker(d){
  d.isOpen=!d.isOpen;
  const base=d.baseRY||0;
  const target = d.isOpen ? base + Math.PI*0.72 : base;
  const startRY = d.dp.rotation.y;
  const dur=320, start=performance.now();
  function animateLockerDoor(now){
    const t=Math.min((now-start)/dur,1);
    const ease=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    d.dp.rotation.y = startRY + (target-startRY)*ease;
    if(t<1) requestAnimationFrame(animateLockerDoor);
  }
  requestAnimationFrame(animateLockerDoor);
  showToastMsg(d.isOpen?'📂 Casier ouvert':'🔒 Casier fermé');
}

function toggleLight(roomId,d){
  const st=classroomLights[roomId]; if(!st) return;
  st.on=!st.on;
  st.light.intensity=st.on?1.4:0;
  st.tube.material=st.on?
    new THREE.MeshLambertMaterial({color:0xffffee,emissive:0xffffaa,emissiveIntensity:1.0}):
    new THREE.MeshLambertMaterial({color:0x888880,emissive:0x000000,emissiveIntensity:0});
  showToastMsg(st.on?'💡 Lumière allumée':'🌑 Lumière éteinte');
}

let _toastTimer = 0;
function showToastMsg(msg){
  const t=_toastEl();
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.opacity='0';},2000);
}

// Dessin au tableau (souris)
_listen(canvas,'mousedown',e=>{
  if(!chalkMode) return; isDrawing=true;
  const r=canvas.getBoundingClientRect(); lastMX=e.clientX-r.left; lastMY=e.clientY-r.top;
});
_listen(document,'mouseup',()=>{isDrawing=false;lastMX=-1;lastMY=-1;});
_listen(document,'mousemove',e=>{
  if(!chalkMode||!isDrawing||!chalkTarget) return;
  const r=canvas.getBoundingClientRect();
  const mx=e.clientX-r.left,my=e.clientY-r.top;
  if(lastMX<0){lastMX=mx;lastMY=my;return;}
  const ct=chalkTarget;
  const sx=ct.canvas.width/(r.width)*3.2, sy=ct.canvas.height/(r.height)*3.2;
  ct.ctx.strokeStyle=`rgba(235,235,215,${0.75+Math.random()*0.25})`;
  ct.ctx.lineWidth=5+Math.random()*3; ct.ctx.lineCap='round'; ct.ctx.lineJoin='round';
  const px=ct.canvas.width/2+(mx-r.width/2)*sx;
  const py=ct.canvas.height/2+(my-r.height/2)*sy;
  const px2=ct.canvas.width/2+((lastMX)-r.width/2)*sx;
  const py2=ct.canvas.height/2+((lastMY)-r.height/2)*sy;
  ct.ctx.beginPath(); ct.ctx.moveTo(px2,py2); ct.ctx.lineTo(px,py); ct.ctx.stroke();
  ct.tex.needsUpdate=true;
  lastMX=mx; lastMY=my;
});

// ─── Fin du système d'interaction salles ───



// ═══════════════════════════════════════════════════════
// ─── CAGE D'ESCALIER 1er ÉTAGE (au-dessus de la cage RDC) ──────────
// Mêmes dimensions que le RDC : X=-20.21 à -12.23, Z=-27 à -35.5
// Hauteur 1er étage : Y=5 à Y=10 — murs remontent sur toute la double hauteur
// Trou d'accès dans le mur Z=-27 centré en X=-14.16 (sortie volée 2), largeur 3.2
// ═══════════════════════════════════════════════════════
{
  const sXmin = -20.21, sXmax = -12.23;
  const sZfront = -27, sZback = -35.5;
  const sW  = Math.abs(sXmax - sXmin);   // 7.98
  const sD  = Math.abs(sZback - sZfront); // 8.5
  const sCX = (sXmin + sXmax) / 2;        // -16.22
  const sCZ = (sZfront + sZback) / 2;     // -31.25
  const sH  = 5;   // hauteur d'un étage
  const sFloorY = 5;   // niveau sol 1er étage
  const sCeilY  = 10;  // plafond 1er étage
  const wT = 0.35;

  const mRoomS  = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mCeilS  = new THREE.MeshLambertMaterial({color:0xe8e0cc});
  const mRoofS  = new THREE.MeshLambertMaterial({map:roofTex, color:0x6a7880});

  // Pas de sol à Y=5 dans la cage : ouverture vers le bas (continuité escalier)

  // Plafond 1er étage (Y=10)
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(sW, sD), mCeilS);
    pl.rotation.x = Math.PI/2; pl.position.set(sCX, sCeilY, sCZ); scene.add(pl); }

  // Toit extérieur au-dessus de la cage
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(sW + 0.8, sD + 0.8), mRoofS);
    pl.rotation.x = -Math.PI/2; pl.position.set(sCX, sCeilY + 0.06, sCZ); scene.add(pl); }

  // Murs latéraux sur toute la double hauteur (Y=0 à Y=10)
  box(wT, sH*2, sD, mRoomS, sXmin, sH, sCZ);  // mur gauche X=-20.21
  box(wT, sH*2, sD, mRoomS, sXmax, sH, sCZ);  // mur droit  X=-12.23
  // Mur du fond (Z=-35.5), double hauteur
  box(sW + wT*2, sH*2, wT, mRoomS, sCX, sH, sZback);

  // Mur avant 1er étage (Z=-27) avec trou d'accès centré en X=-14.16, largeur 3.2
  {
    const doorW = 3.2, doorH = 4.5, doorX = -14.16;
    // Segment gauche : sXmin → (doorX - doorW/2)
    const lW = (doorX - doorW/2) - sXmin;
    if(lW > 0.01) box(lW, sH, wT, mRoomS, sXmin + lW/2, sFloorY + sH/2, sZfront);
    // Segment droit : (doorX + doorW/2) → sXmax
    const rW2 = sXmax - (doorX + doorW/2);
    if(rW2 > 0.01) box(rW2, sH, wT, mRoomS, (doorX + doorW/2) + rW2/2, sFloorY + sH/2, sZfront);
    // Bandeau au-dessus du trou
    box(doorW + 0.4, sH - doorH, wT, mRoomS, doorX, sFloorY + doorH + (sH - doorH)/2, sZfront);
  }

  // Lumière dans la cage 1er étage
  const sLight2 = new THREE.PointLight(0xffe8c0, 0.6, 12);
  sLight2.position.set(sCX, sCeilY - 0.5, sCZ); scene.add(sLight2);
  const sBulb2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({color:0xffe8a0}));
  sBulb2.position.set(sCX, sCeilY - 0.4, sCZ); scene.add(sBulb2);
  const sWire2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.5,4), new THREE.MeshLambertMaterial({color:0x222222}));
  sWire2.position.set(sCX, sCeilY - 0.15, sCZ); scene.add(sWire2);
}

// ═══════════════════════════════════════════════════════
// ─── BIBLIOTHÈQUE — 1er ÉTAGE au-dessus du bloc arrière (RDC: principal+surveillant+sortie+toilettes)
// Empreinte : X=-36 → +36, Z=-27 → -35.5, Y=5 → 10
// Trou cage escalier (X=-20.21→-12.23) exclu du sol (déjà géré)
// Porte interactive "Bibliothèque" dans mur Z=-27, centrée en X=0 (côté cour/bâtiment principal)
// ═══════════════════════════════════════════════════════
{
  const bXmin = -36, bXmax = 36;
  const bZfront = -27, bZback = -35.5;
  const bW  = bXmax - bXmin;              // 72
  const bD  = Math.abs(bZback - bZfront); // 8.5
  const bCX = (bXmin + bXmax) / 2;        // 0
  const bCZ = (bZfront + bZback) / 2;     // -31.25
  const bH  = 5;
  const bFloorY = 5;   // sol à Y=5
  const bCeilY  = 10;  // plafond à Y=10
  const wT = 0.35;

  const mRoomBib  = new THREE.MeshLambertMaterial({color:0xddd4b8, map:stoneTex});
  const mFloorBib = new THREE.MeshLambertMaterial({color:0xc8b898, map:paveTex});
  const mCeilBib  = new THREE.MeshLambertMaterial({color:0xe8e0cc});
  const mRoofBib  = new THREE.MeshLambertMaterial({map:roofTex, color:0x6a7880});

  // Sol — en 2 morceaux pour laisser le trou de la cage d'escalier (X=-20.21→-12.23)
  const stairXmin = -20.21, stairXmax = -12.23;
  // Partie gauche : bXmin → stairXmin
  { const w = stairXmin - bXmin;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, bD), mFloorBib);
    pl.rotation.x = -Math.PI/2; pl.position.set(bXmin + w/2, bFloorY + 0.01, bCZ);
    pl.receiveShadow = true; scene.add(pl); }
  // Partie droite : stairXmax → bXmax
  { const w = bXmax - stairXmax;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, bD), mFloorBib);
    pl.rotation.x = -Math.PI/2; pl.position.set(stairXmax + w/2, bFloorY + 0.01, bCZ);
    pl.receiveShadow = true; scene.add(pl); }

  // Plafond
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(bW, bD), mCeilBib);
    pl.rotation.x = Math.PI/2; pl.position.set(bCX, bCeilY, bCZ); scene.add(pl); }

  // Toit extérieur
  { const pl = new THREE.Mesh(new THREE.PlaneGeometry(bW + 0.8, bD + 0.8), mRoofBib);
    pl.rotation.x = -Math.PI/2; pl.position.set(bCX, bCeilY + 0.06, bCZ); scene.add(pl); }

  // Mur gauche (X=-36) — double hauteur (Y=0→10), avec fenêtres RDC (Y=0→5) et 1er étage (Y=5→10)
  {
    const fw2=1.8, fh=2.4;
    // RDC (Y=0→5) : 1 fenêtre à Z=-31.25 (centre de la biblio, profondeur 8.5)
    const winZbib = [-31.25];
    const fcyRDC=2.6, fBotRDC=fcyRDC-fh/2, fTopRDC=fcyRDC+fh/2;
    box(wT, fBotRDC,   bD, mRoomBib, bXmin, fBotRDC/2,             bCZ);
    box(wT, 5-fTopRDC, bD, mRoomBib, bXmin, fTopRDC+(5-fTopRDC)/2, bCZ);
    {const zMin=Math.min(bZfront,bZback),zMax=Math.max(bZfront,bZback);
     const cuts=[]; let p=zMin; [...winZbib].sort((a,b)=>a-b).forEach(wz=>{cuts.push([p,wz-fw2/2]);p=wz+fw2/2;}); cuts.push([p,zMax]);
     cuts.forEach(([z1,z2])=>{const l=z2-z1;if(l>0.01)box(wT,fh,l,mRoomBib,bXmin,fcyRDC,(z1+z2)/2);});}
    winZbib.forEach(wz => makeWindowX(bXmin, fcyRDC, wz, +1));
    // 1er étage (Y=5→10) : 1 fenêtre au même Z
    const fcy1=bFloorY+2.6, fBot1=fcy1-fh/2, fTop1=fcy1+fh/2;
    box(wT, fBot1-bFloorY,   bD, mRoomBib, bXmin, bFloorY+(fBot1-bFloorY)/2,   bCZ);
    box(wT, bH-(fTop1-bFloorY), bD, mRoomBib, bXmin, fTop1+(bH-(fTop1-bFloorY))/2, bCZ);
    {const zMin=Math.min(bZfront,bZback),zMax=Math.max(bZfront,bZback);
     const cuts=[]; let p=zMin; [...winZbib].sort((a,b)=>a-b).forEach(wz=>{cuts.push([p,wz-fw2/2]);p=wz+fw2/2;}); cuts.push([p,zMax]);
     cuts.forEach(([z1,z2])=>{const l=z2-z1;if(l>0.01)box(wT,fh,l,mRoomBib,bXmin,fcy1,(z1+z2)/2);});}
    winZbib.forEach(wz => makeWindowX(bXmin, fcy1, wz, +1));
  }

  // Mur droit (X=+36) — double hauteur, symétrique
  {
    const fw2=1.8, fh=2.4;
    const winZbib = [-31.25];
    const fcyRDC=2.6, fBotRDC=fcyRDC-fh/2, fTopRDC=fcyRDC+fh/2;
    box(wT, fBotRDC,   bD, mRoomBib, bXmax, fBotRDC/2,             bCZ);
    box(wT, 5-fTopRDC, bD, mRoomBib, bXmax, fTopRDC+(5-fTopRDC)/2, bCZ);
    {const zMin=Math.min(bZfront,bZback),zMax=Math.max(bZfront,bZback);
     const cuts=[]; let p=zMin; [...winZbib].sort((a,b)=>a-b).forEach(wz=>{cuts.push([p,wz-fw2/2]);p=wz+fw2/2;}); cuts.push([p,zMax]);
     cuts.forEach(([z1,z2])=>{const l=z2-z1;if(l>0.01)box(wT,fh,l,mRoomBib,bXmax,fcyRDC,(z1+z2)/2);});}
    winZbib.forEach(wz => makeWindowX(bXmax, fcyRDC, wz, -1));
    const fcy1=bFloorY+2.6, fBot1=fcy1-fh/2, fTop1=fcy1+fh/2;
    box(wT, fBot1-bFloorY,   bD, mRoomBib, bXmax, bFloorY+(fBot1-bFloorY)/2,   bCZ);
    box(wT, bH-(fTop1-bFloorY), bD, mRoomBib, bXmax, fTop1+(bH-(fTop1-bFloorY))/2, bCZ);
    {const zMin=Math.min(bZfront,bZback),zMax=Math.max(bZfront,bZback);
     const cuts=[]; let p=zMin; [...winZbib].sort((a,b)=>a-b).forEach(wz=>{cuts.push([p,wz-fw2/2]);p=wz+fw2/2;}); cuts.push([p,zMax]);
     cuts.forEach(([z1,z2])=>{const l=z2-z1;if(l>0.01)box(wT,fh,l,mRoomBib,bXmax,fcy1,(z1+z2)/2);});}
    winZbib.forEach(wz => makeWindowX(bXmax, fcy1, wz, -1));
  }

  // Mur du fond (Z=-35.5) — avec fenêtres (4 réparties sur la largeur) visible de l'extérieur
  {
    const fw2=1.6, fh=2.4, fcy=bFloorY+2.6, fBot=fcy-fh/2, fTop=fcy+fh/2;
    const winXs=[-24, -8, 8, 24];
    box(bW+wT*2, fBot-bFloorY,   wT, mRoomBib, bCX, bFloorY+(fBot-bFloorY)/2,   bZback);
    box(bW+wT*2, bH-(fTop-bFloorY), wT, mRoomBib, bCX, fTop+(bH-(fTop-bFloorY))/2, bZback);
    {const cuts=[]; let p=bXmin; winXs.forEach(wx=>{cuts.push([p,wx-fw2/2]);p=wx+fw2/2;}); cuts.push([p,bXmax]);
     cuts.forEach(([x1,x2])=>{const w=x2-x1;if(w>0.01)box(w,fh,wT,mRoomBib,(x1+x2)/2,fcy,bZback);});}
    winXs.forEach(wx => makeWindow(wx, fcy, bZback));
  }

  // Mur avant (Z=-27) avec trou pour la porte Bibliothèque centré en X=0, largeur 3.8, hauteur 4.5
  {
    const doorW = 3.8, doorH = 4.5, doorX = 0;
    // Segment gauche : bXmin → (doorX - doorW/2) — avec trou cage escalier dedans
    const leftEnd = doorX - doorW/2;
    // On fait ce mur en 2 sous-segments : de bXmin à stairXmin, puis de stairXmax à leftEnd
    { const w1 = stairXmin - bXmin;
      if(w1 > 0.01) box(w1, bH, wT, mRoomBib, bXmin + w1/2, bFloorY + bH/2, bZfront); }
    // Entre sortie cage et porte bib
    { const w2 = leftEnd - stairXmax;
      if(w2 > 0.01) box(w2, bH, wT, mRoomBib, stairXmax + w2/2, bFloorY + bH/2, bZfront); }
    // Segment droit : (doorX + doorW/2) → bXmax
    { const w3 = bXmax - (doorX + doorW/2);
      if(w3 > 0.01) box(w3, bH, wT, mRoomBib, (doorX + doorW/2) + w3/2, bFloorY + bH/2, bZfront); }
    // Bandeau au-dessus de la porte
    box(doorW + 0.4, bH - doorH, wT, mRoomBib, doorX, bFloorY + doorH + (bH - doorH)/2, bZfront);

    // Piliers décoratifs de chaque côté de la porte
    const mStoneLight2 = new THREE.MeshLambertMaterial({color:0xe0d8c0});
    [-doorW/2 - 0.3, doorW/2 + 0.3].forEach(dx => {
      box(0.5, doorH + 0.4, 0.45, mStoneLight2, doorX + dx, bFloorY + (doorH+0.4)/2, bZfront + 0.1);
    });
    box(0.4, 0.4, doorW + 0.8, mStoneLight2, doorX, bFloorY + doorH + 0.2, bZfront);
  }

  // Lumières réparties dans la bibliothèque
  [-20, -8, 4, 16, 28].forEach(lx => {
    const bLight = new THREE.PointLight(0xffe8c0, 0.5, 15);
    bLight.position.set(lx, bCeilY - 0.5, bCZ); scene.add(bLight);
    const bBulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({color:0xffe8a0}));
    bBulb.position.set(lx, bCeilY - 0.4, bCZ); scene.add(bBulb);
    const bWire = new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.6,4), new THREE.MeshLambertMaterial({color:0x222222}));
    bWire.position.set(lx, bCeilY - 0.12, bCZ); scene.add(bWire);
  });
}


// ─── TOIT DU 1er ÉTAGE ──────────────────────────────
{
  const Y  = 10;
  const pH = 3.5; // hauteur du faîtage
  const mPente = new THREE.MeshLambertMaterial({color:0x1a2540, side:THREE.DoubleSide});
  const mDalle = new THREE.MeshLambertMaterial({color:0x888e94});

  // Fonction qui crée un prisme triangulaire (vrai toit en pente)
  // w=largeur totale, d=profondeur, h=hauteur faîtage, cx,cy,cz=centre base
  function makePrism(w, d, h, mat, cx, cy, cz) {
    const hw = w/2, hd = d/2;
    const verts = new Float32Array([
      // Face avant (triangle Z+)
      -hw, 0,  hd,
       hw, 0,  hd,
        0, h,  hd,
      // Face arrière (triangle Z-)
      -hw, 0, -hd,
       hw, 0, -hd,
        0, h, -hd,
      // Pente gauche
      -hw, 0, -hd,
      -hw, 0,  hd,
        0, h,  hd,
        0, h, -hd,
      // Pente droite
       hw, 0,  hd,
       hw, 0, -hd,
        0, h, -hd,
        0, h,  hd,
      // Base gauche
      -hw, 0, -hd,
      -hw, 0,  hd,
        0, h,  hd,
        0, h, -hd,
    ]);
    const idx = [
      0,1,2,           // avant
      3,5,4,           // arrière
      6,7,8, 6,8,9,    // pente gauche
      10,11,12, 10,12,13, // pente droite
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    scene.add(m);
  }

  // Dalle + toit — 3 zones séparées, PAS la cour centrale
  // Bras gauche X=-36→-24
  box(12, 0.2, 45, mDalle, -30, Y+0.05, (-27+18)/2);
  makePrism(12, 45, pH, mPente, -30, Y, (-27+18)/2);
  // Bras droit X=+24→+36
  box(12, 0.2, 45, mDalle,  30, Y+0.05, (-27+18)/2);
  makePrism(12, 45, pH, mPente,  30, Y, (-27+18)/2);
  // Bâtiment principal X=-24→+24, Z=-35.5→-19.5
  box(48, 0.2, 16, mDalle, 0, Y+0.05, (-35.5-19.5)/2);
  makePrism(48, 16, pH, mPente, 0, Y, (-35.5-19.5)/2);
}

// Porte Bibliothèque : dans mur Z=-27, X=0, 1er étage (yOffset=5)


// Z : -27   → -35.30 (profondeur 8.3)
// Entrée via porte Toilette (X=22.5, Z=-27)
// ═══════════════════════════════════════════════════════
{
  const tRoomXmin = 20.65, tRoomXmax = 35.25;
  const tRoomZfront = -27,  tRoomZback = -35.30;
  const tRoomW = tRoomXmax - tRoomXmin;   // 14.6
  const tRoomD = Math.abs(tRoomZback - tRoomZfront); // 8.3
  const tRoomCX = (tRoomXmin + tRoomXmax) / 2;  // 27.95
  const tRoomCZ = (tRoomZfront + tRoomZback) / 2; // -31.15
  const tRoomH = 4.0;
  const wT = 0.35;

  // Matériaux salle de bains
  const mTile = (()=>{
    const tc = document.createElement('canvas'); tc.width=tc.height=128;
    const tx = tc.getContext('2d');
    tx.fillStyle='#e8f0f8'; tx.fillRect(0,0,128,128);
    // Carreaux blancs/bleus
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const v = 220 + Math.random()*20;
      const b = 235 + Math.random()*20;
      tx.fillStyle=`rgb(${Math.round(v)},${Math.round(v)},${Math.round(b)})`;
      tx.fillRect(c*16+1,r*16+1,14,14);
    }
    tx.strokeStyle='rgba(140,160,200,0.5)'; tx.lineWidth=1;
    for(let i=0;i<=128;i+=16){
      tx.beginPath();tx.moveTo(i,0);tx.lineTo(i,128);tx.stroke();
      tx.beginPath();tx.moveTo(0,i);tx.lineTo(128,i);tx.stroke();
    }
    const t=_CT(tc);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(5,3); return t;
  })();
  const mTileFloor = (()=>{
    const tc=document.createElement('canvas'); tc.width=tc.height=128;
    const tx=tc.getContext('2d');
    tx.fillStyle='#d0d8e0'; tx.fillRect(0,0,128,128);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){
      const v=200+Math.random()*20;
      tx.fillStyle=`rgb(${Math.round(v)},${Math.round(v+4)},${Math.round(v+12)})`;
      tx.fillRect(c*32+2,r*32+2,28,28);
    }
    tx.strokeStyle='rgba(100,120,160,0.4)'; tx.lineWidth=1.5;
    for(let i=0;i<=128;i+=32){
      tx.beginPath();tx.moveTo(i,0);tx.lineTo(i,128);tx.stroke();
      tx.beginPath();tx.moveTo(0,i);tx.lineTo(128,i);tx.stroke();
    }
    const t=_CT(tc);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(8,5); return t;
  })();
  const mWallTile = new THREE.MeshLambertMaterial({map:mTile, color:0xf0f4f8});
  const mFloorTile= new THREE.MeshLambertMaterial({map:mTileFloor});
  const mCeil     = new THREE.MeshLambertMaterial({color:0xf4f4f0});

  // Sol carrelé
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(tRoomW, tRoomD), mFloorTile);
  floorMesh.rotation.x=-Math.PI/2; floorMesh.position.set(tRoomCX,0.02,tRoomCZ);
  floorMesh.receiveShadow=true; scene.add(floorMesh);

  // Plafond
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(tRoomW, tRoomD), mCeil);
  ceilMesh.rotation.x=Math.PI/2; ceilMesh.position.set(tRoomCX,tRoomH,tRoomCZ);
  scene.add(ceilMesh);

  // Mur gauche (X=tRoomXmin=20.65) — partagé avec couloir droit du 1er couloir
  box(wT, tRoomH, tRoomD, mWallTile, tRoomXmin, tRoomH/2, tRoomCZ);

  // Mur droit (X=tRoomXmax=35.25) — côté extérieur 2e couloir
  box(wT, tRoomH, tRoomD, mWallTile, tRoomXmax, tRoomH/2, tRoomCZ);

  // Mur du fond (Z=tRoomZback=-35.30)
  box(tRoomW+wT*2, tRoomH, wT, mWallTile, tRoomCX, tRoomH/2, tRoomZback);

  // Mur avant (Z=-27) avec trou pour porte Toilette (X=22.5, larg 2.2)
  const tDoorX=22.5, tDoorW=2.2;
  // Segment X=20.65 → 21.4
  box(tDoorX-tDoorW/2 - tRoomXmin, tRoomH, wT, mWallTile,
      tRoomXmin + (tDoorX-tDoorW/2 - tRoomXmin)/2, tRoomH/2, tRoomZfront);
  // Segment X=23.6 → 35.25
  box(tRoomXmax-(tDoorX+tDoorW/2), tRoomH, wT, mWallTile,
      (tDoorX+tDoorW/2 + tRoomXmax)/2, tRoomH/2, tRoomZfront);
  // Bandeau au-dessus de la porte (doorH=4.2, roomH=4.0 → juste une fine bande)
  // doorH > roomH donc pas de bandeau nécessaire, la porte remplit toute la hauteur

  // Lumières au plafond (néons)
  [tRoomCX-3.5, tRoomCX+3.5].forEach(lx=>{
    const neonLight = new THREE.PointLight(0xd8eeff, 0.7, 10);
    neonLight.position.set(lx, tRoomH-0.3, tRoomCZ);
    scene.add(neonLight);
    // Tube néon
    const neonMat = new THREE.MeshBasicMaterial({color:0xe8f4ff});
    const neon = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.08,0.12), neonMat);
    neon.position.set(lx, tRoomH-0.05, tRoomCZ); scene.add(neon);
    // Grille fixation
    const fixMat = new THREE.MeshLambertMaterial({color:0x888888});
    const fix = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.05,0.20), fixMat);
    fix.position.set(lx, tRoomH-0.03, tRoomCZ); scene.add(fix);
  });

  // ── CABINES DE TOILETTES ──────────────────────────────
  // 3 cabines côte à côte le long du mur du fond (Z≈-34.5 → -35)
  // Chaque cabine : largeur 2.2, profondeur 2.0
  const cabW=2.2, cabD=2.0, cabH=2.5, cabZ=tRoomZback+cabD/2+wT;
  const mCabWall = new THREE.MeshLambertMaterial({color:0x8899bb}); // cloison bleue
  const mCabDoor = new THREE.MeshLambertMaterial({color:0x5a7aaa}); // porte cabine
  const mCabFloor= new THREE.MeshLambertMaterial({color:0xc8d0dc});

  [0,1,2].forEach(i=>{
    const cx = tRoomXmin + 1.5 + i*(cabW+0.15);
    // Cloisons latérales
    box(wT*0.7, cabH, cabD, mCabWall, cx-cabW/2, cabH/2, cabZ);
    box(wT*0.7, cabH, cabD, mCabWall, cx+cabW/2, cabH/2, cabZ);
    // Porte de cabine (petit vantail)
    const cabPivot = new THREE.Group();
    cabPivot.position.set(cx+cabW/2-0.12, 0, tRoomZback+wT+0.1);
    scene.add(cabPivot);
    const cabLeaf=new THREE.Mesh(new THREE.BoxGeometry(cabW-0.25,cabH-0.3,0.06),mCabDoor);
    cabLeaf.position.set(-(cabW/2-0.12),(cabH-0.3)/2,0); cabLeaf.castShadow=true; cabPivot.add(cabLeaf);
    // Poignée cabine
    const cpH=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5), new THREE.MeshLambertMaterial({color:0xd0c060}));
    cpH.position.set(-(cabW-0.35), cabH*0.5, 0.06); cabPivot.add(cpH);
    // Numéro cabine
    const numC=document.createElement('canvas'); numC.width=64; numC.height=64;
    const nCtx=numC.getContext('2d');
    nCtx.fillStyle='#5a7aaa'; nCtx.fillRect(0,0,64,64);
    nCtx.fillStyle='#fff'; nCtx.font='bold 36px Arial'; nCtx.textAlign='center'; nCtx.textBaseline='middle';
    nCtx.fillText(i+1,32,32);
    const numMesh=new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.18),
      new THREE.MeshBasicMaterial({map:_CT(numC),side:THREE.DoubleSide}));
    numMesh.position.set(cx, cabH*0.8, tRoomZback+wT+0.12); scene.add(numMesh);
  });

  // ── LAVABOS (contre le mur gauche X≈21) ───────────────────────
  const mPorcelain = new THREE.MeshLambertMaterial({color:0xf4f4f2});
  const mChrome    = new THREE.MeshLambertMaterial({color:0xd8dce8});
  [tRoomCZ-1.5, tRoomCZ+1.5].forEach(lz=>{
    const lx = tRoomXmin+0.55;
    // Vasque
    const basin=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.12,0.45),mPorcelain);
    basin.position.set(lx,0.88,lz); basin.castShadow=true; scene.add(basin);
    // Support mural
    const sup=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.06,0.38),new THREE.MeshLambertMaterial({color:0xd8d0c0}));
    sup.position.set(lx,0.82,lz); scene.add(sup);
    // Robinet
    const tap=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.22,8),mChrome);
    tap.position.set(lx,1.04,lz-0.08); scene.add(tap);
    const tapHead=new THREE.Mesh(new THREE.SphereGeometry(0.03,6,5),mChrome);
    tapHead.position.set(lx,1.15,lz-0.08); scene.add(tapHead);
    // Miroir au mur
    const mirrorMat=new THREE.MeshLambertMaterial({color:0xd0e4f0,transparent:true,opacity:0.7});
    const mirror=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.55,0.42),mirrorMat);
    mirror.position.set(tRoomXmin+0.10,1.30,lz); scene.add(mirror);
    // Cadre miroir
    const frameMirror=new THREE.MeshLambertMaterial({color:0x888898});
    [[0.04,0.04,0.46],[0.04,0.04,0.46],[0.04,0.58,0.04],[0.04,0.58,0.04]].forEach(([fw,fh,fd],fi)=>{
      const fz2=[lz-0.22,lz+0.22,lz-0.22,lz+0.22][fi];
      const fy=[1.30,1.30,1.08,1.52][fi];
      const fm=new THREE.Mesh(new THREE.BoxGeometry(0.05,fh,fd),frameMirror);
      fm.position.set(tRoomXmin+0.09,fy,fz2); scene.add(fm);
    });
    // Distributeur de savon
    const soap=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.16,0.08),new THREE.MeshLambertMaterial({color:0x60a8d8}));
    soap.position.set(lx,1.06,lz+0.16); scene.add(soap);
  });

  // Panneau de porte côté intérieur (indique "Toilettes" en bleu)
  const intSign=new THREE.Mesh(new THREE.BoxGeometry(0.60,0.26,0.04),
    new THREE.MeshLambertMaterial({map:(()=>{
      const sc=document.createElement('canvas'); sc.width=256; sc.height=96;
      const sx=sc.getContext('2d');
      sx.fillStyle='#1a2850'; sx.fillRect(0,0,256,96);
      sx.strokeStyle='#4080cc'; sx.lineWidth=3; sx.strokeRect(4,4,248,88);
      sx.fillStyle='#a0c8ff'; sx.font='bold 28px Arial'; sx.textAlign='center'; sx.textBaseline='middle';
      sx.fillText('🚻 Toilettes', 128, 48);
      return _CT(sc);
    })()}));
  intSign.position.set(tRoomXmin+0.08, tRoomH-0.6, tRoomCZ); intSign.rotation.y=Math.PI/2; scene.add(intSign);
}

// ═══════════════════════════════════════════════════════════════════
// ─── COUR ARRIÈRE CLÔTURÉE ───────────────────────────────────────────
// Enceinte rectangulaire fermée sur le bâtiment principal (côté Z=-27.5)
// ~8× la surface du bâtiment (54×60 = 3240 u²), seule sortie = porte cadenas
// Mur gauche X=-27, Mur droit X=+27, Mur arrière Z=-87.5
// ═══════════════════════════════════════════════════════════════════════
{
  const CY_X1 = -27.0;   // bord gauche (aligné mur arrière bâtiment)
  const CY_X2 =  27.0;   // bord droit
  const CY_Z1 = -36.0;   // bord nord = mur extérieur arrière du bâtiment (bibliothèque)
  const CY_Z2 = -147.5;  // bord sud (120 unités de profondeur)
  const FENCE_H  = 3.2;
  const POST_GAP = 4.0;

  // Porte cadenas sur le mur arrière
  const GATE_X = 17.46;
  const GATE_W = 1.6;
  const gateX1 = GATE_X - GATE_W/2;
  const gateX2 = GATE_X + GATE_W/2;

  // Matériaux
  const mFencePost   = new THREE.MeshLambertMaterial({color:0x1a5010});
  const mFenceWire   = new THREE.MeshLambertMaterial({color:0x267018});
  const mGateMetal   = new THREE.MeshLambertMaterial({color:0x1a5010});
  const mFenceGold   = new THREE.MeshLambertMaterial({color:0xd4a010});
  const mFenceGoldDk = new THREE.MeshLambertMaterial({color:0xa07808});

  // Texture grillage carré — cellule de 32px = ~0.5u monde
  function makeGrillageTex(cellPx) {
    const s = 256;
    const gc = document.createElement('canvas'); gc.width=s; gc.height=s;
    const gx = gc.getContext('2d');
    gx.clearRect(0,0,s,s);
    gx.strokeStyle = '#267828'; gx.lineWidth = 3;
    for(let y=0; y<=s; y+=cellPx){ gx.beginPath(); gx.moveTo(0,y); gx.lineTo(s,y); gx.stroke(); }
    for(let x=0; x<=s; x+=cellPx){ gx.beginPath(); gx.moveTo(x,0); gx.lineTo(x,s); gx.stroke(); }
    const t = _CT(gc);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const grillTex = makeGrillageTex(32);

  // ── Section grillage mur arrière (face Z, plan XY) ──────────────────
  function makeFenceSectionZ(xStart, xEnd, z, h) {
    const w = xEnd - xStart; if(w < 0.05) return;
    // Utilise repeat.set pour que le grillage soit continu (pas de déformation)
    const m2 = new THREE.MeshLambertMaterial({
      map: (()=>{
        const t = grillTex.clone();
        t.repeat.set(w * 0.5, h * 0.5);
        t.needsUpdate = true;
        return t;
      })(),
      transparent:true, opacity:0.88, side:THREE.DoubleSide, color:0x1a7010
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m2);
    mesh.position.set(xStart+w/2, h/2, z);
    scene.add(mesh);
  }

  // ── Section grillage mur latéral (face X, plan ZY, rotation Y=90°) ──
  function makeFenceSectionX(x, zStart, zEnd, h) {
    const d = Math.abs(zEnd-zStart); if(d < 0.05) return;
    const zMid = (zStart+zEnd)/2;
    const m2 = new THREE.MeshLambertMaterial({
      map: (()=>{
        const t = grillTex.clone();
        t.repeat.set(d * 0.5, h * 0.5);
        t.needsUpdate = true;
        return t;
      })(),
      transparent:true, opacity:0.88, side:THREE.DoubleSide, color:0x1a7010
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d, h), m2);
    mesh.rotation.y = Math.PI/2;
    mesh.position.set(x, h/2, zMid);
    scene.add(mesh);
  }

  // ── Poteau universel ─────────────────────────────────────────────────
  function addPost(x, z) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, FENCE_H+0.30, 0.10), mFencePost);
    p.position.set(x, (FENCE_H+0.30)/2, z); p.castShadow=true; scene.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.15), mFencePost);
    cap.position.set(x, FENCE_H+0.34, z); scene.add(cap);
  }

  // ── Rails mur Z (courant en X) ───────────────────────────────────────
  function addRailsZ(xStart, xEnd, z) {
    const w = xEnd-xStart; if(w<0.05) return;
    [FENCE_H+0.02, FENCE_H*0.50, 0.08].forEach(ry=>{
      const r = new THREE.Mesh(new THREE.BoxGeometry(w,0.07,0.07), mFenceWire);
      r.position.set(xStart+w/2, ry, z); scene.add(r);
    });
  }

  // ── Rails mur X (courant en Z) ───────────────────────────────────────
  function addRailsX(x, zStart, zEnd) {
    const d = Math.abs(zEnd-zStart); if(d<0.05) return;
    const zMid = (zStart+zEnd)/2;
    [FENCE_H+0.02, FENCE_H*0.50, 0.08].forEach(ry=>{
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.07,d), mFenceWire);
      r.position.set(x, ry, zMid); scene.add(r);
    });
  }

  // ════ MUR GAUCHE ════════════════════════════════════════════════════
  makeFenceSectionX(CY_X1, CY_Z1, CY_Z2, FENCE_H);
  addRailsX(CY_X1, CY_Z1, CY_Z2);
  for(let z=CY_Z1; z>=CY_Z2-0.1; z-=POST_GAP) addPost(CY_X1, Math.round(z*10)/10);

  // ════ MUR DROIT ══════════════════════════════════════════════════════
  makeFenceSectionX(CY_X2, CY_Z1, CY_Z2, FENCE_H);
  addRailsX(CY_X2, CY_Z1, CY_Z2);
  for(let z=CY_Z1; z>=CY_Z2-0.1; z-=POST_GAP) addPost(CY_X2, Math.round(z*10)/10);

  // ════ MUR ARRIÈRE (avec porte cadenas) ════════════════════════════════
  makeFenceSectionZ(CY_X1, gateX1, CY_Z2, FENCE_H);
  makeFenceSectionZ(gateX2, CY_X2, CY_Z2, FENCE_H);
  addRailsZ(CY_X1, gateX1, CY_Z2);
  addRailsZ(gateX2, CY_X2, CY_Z2);
  for(let x=CY_X1; x<=CY_X2+0.1; x+=POST_GAP) {
    const px = Math.round(x*10)/10;
    if(px > gateX1-0.15 && px < gateX2+0.15) continue;
    addPost(px, CY_Z2);
  }
  addPost(gateX1-0.07, CY_Z2);
  addPost(gateX2+0.07, CY_Z2);

  // Poteaux de coin (angles de l'enceinte)
  addPost(CY_X1, CY_Z1); addPost(CY_X2, CY_Z1);
  addPost(CY_X1, CY_Z2); addPost(CY_X2, CY_Z2);

  // ── PORTE CADENAS (vantail grillage sur mur arrière) ─────────────────
  {
    const gateTex = makeGrillageTex(24);
    gateTex.repeat.set(GATE_W*1.4, FENCE_H*1.4);
    const gLeafMat = new THREE.MeshLambertMaterial({
      map:gateTex, transparent:true, opacity:0.88,
      side:THREE.DoubleSide, color:0x1a7010
    });
    const gatePivot = new THREE.Group();
    gatePivot.position.set(gateX1-0.04, 0, CY_Z2);
    scene.add(gatePivot);
    const gLeaf = new THREE.Mesh(new THREE.PlaneGeometry(GATE_W-0.10, FENCE_H-0.08), gLeafMat);
    gLeaf.position.set((GATE_W-0.10)/2, (FENCE_H-0.08)/2, 0.0);
    gatePivot.add(gLeaf);
    const gfV = new THREE.BoxGeometry(0.08, FENCE_H, 0.08);
    const gfH = new THREE.BoxGeometry(GATE_W+0.02, 0.08, 0.08);
    [0.04, GATE_W-0.04].forEach(dx=>{
      const b = new THREE.Mesh(gfV, mGateMetal);
      b.position.set(dx, FENCE_H/2, 0); gatePivot.add(b);
    });
    [FENCE_H-0.04, FENCE_H/2, 0.04].forEach(dy=>{
      const b = new THREE.Mesh(gfH, mGateMetal);
      b.position.set(GATE_W/2, dy, 0); gatePivot.add(b);
    });
  }

  // ── CADENAS doré sur la porte ─────────────────────────────────────────
  const fencePadlock = new THREE.Group();
  fencePadlock.position.set(GATE_X+0.12, 1.10, CY_Z2+0.07);
  scene.add(fencePadlock);
  const fplBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.12), mFenceGold);
  fplBody.position.set(0,0,0); fencePadlock.add(fplBody);
  const fplTop = new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,0.12,10), mFenceGold);
  fplTop.rotation.x=Math.PI/2; fplTop.position.set(0,0.09,0); fencePadlock.add(fplTop);
  const fplArc = new THREE.Mesh(new THREE.TorusGeometry(0.052,0.020,8,10,Math.PI), mFenceGoldDk);
  fplArc.rotation.x=Math.PI/2; fplArc.position.set(0,0.21,0); fencePadlock.add(fplArc);
  const fplHole = new THREE.Mesh(new THREE.CircleGeometry(0.030,8), new THREE.MeshLambertMaterial({color:0x080808}));
  fplHole.position.set(0,0,0.063); fencePadlock.add(fplHole);

  // ── Sol herbe à l'intérieur de la cour ────────────────────────────────
  const yardW = CY_X2 - CY_X1;
  const yardD = Math.abs(CY_Z2 - CY_Z1);
  const yardGrass = new THREE.Mesh(
    new THREE.PlaneGeometry(yardW, yardD),
    new THREE.MeshLambertMaterial({color:0x3a7a18, map:grassTex.clone()})
  );
  yardGrass.rotation.x = -Math.PI/2;
  yardGrass.position.set((CY_X1+CY_X2)/2, 0.008, (CY_Z1+CY_Z2)/2);
  yardGrass.receiveShadow = true;
  scene.add(yardGrass);
}
// ═══════════════════════════════════════════════════════════════════════
// ─── TERRAIN DE BASKET (cour arrière, côté gauche) ───────────────────
// Position : X -24 à -6, Z -50 à -80 (centre X=-15, Z=-65)
// ═══════════════════════════════════════════════════════════════════════
{
  const bktX = -15, bktZ = -65, bktW = 18, bktD = 30;

  // Sol du terrain (béton gris légèrement teinté)
  const mCourt = new THREE.MeshLambertMaterial({color:0xb0a890});
  const courtFloor = new THREE.Mesh(new THREE.PlaneGeometry(bktW, bktD), mCourt);
  courtFloor.rotation.x = -Math.PI/2;
  courtFloor.position.set(bktX, 0.015, bktZ);
  courtFloor.receiveShadow = true;
  scene.add(courtFloor);

  // Lignes du terrain (canvas texture)
  const bktCanvas = document.createElement('canvas');
  bktCanvas.width = 512; bktCanvas.height = 512;
  const bCtx = bktCanvas.getContext('2d');
  bCtx.fillStyle = '#b0a890'; bCtx.fillRect(0,0,512,512);
  bCtx.strokeStyle = '#ffffff'; bCtx.lineWidth = 6;
  // Bordure
  bCtx.strokeRect(10,10,492,492);
  // Ligne médiane
  bCtx.beginPath(); bCtx.moveTo(10,256); bCtx.lineTo(502,256); bCtx.stroke();
  // Cercle central
  bCtx.beginPath(); bCtx.arc(256,256,60,0,Math.PI*2); bCtx.stroke();
  // Zone de tir gauche (en haut)
  bCtx.strokeRect(156,10,200,130);
  bCtx.beginPath(); bCtx.arc(256,130,50,0,Math.PI); bCtx.stroke();
  // Zone de tir droite (en bas)
  bCtx.strokeRect(156,372,200,130);
  bCtx.beginPath(); bCtx.arc(256,382,50,Math.PI,0); bCtx.stroke();
  // Lancer franc gauche
  bCtx.beginPath(); bCtx.arc(256,160,50,0,Math.PI*2); bCtx.stroke();
  // Lancer franc droit
  bCtx.beginPath(); bCtx.arc(256,352,50,0,Math.PI*2); bCtx.stroke();
  const bktTex = _CT(bktCanvas);
  const mCourtLines = new THREE.MeshBasicMaterial({map:bktTex,transparent:true,opacity:0.9});
  const linesPlane = new THREE.Mesh(new THREE.PlaneGeometry(bktW,bktD), mCourtLines);
  linesPlane.rotation.x=-Math.PI/2; linesPlane.position.set(bktX,0.02,bktZ); scene.add(linesPlane);

  // Paniers de basket
  function makePanier(x,z,side){
    const mPanMetal = new THREE.MeshLambertMaterial({color:0xd4a010});
    const mPanRed   = new THREE.MeshLambertMaterial({color:0xcc2020});
    const mNet      = new THREE.MeshLambertMaterial({color:0xeeeeee,transparent:true,opacity:0.7,wireframe:true});
    // Poteau
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,3.2,8), new THREE.MeshLambertMaterial({color:0x888888}));
    pole.position.set(x,1.6,z); pole.castShadow=true; scene.add(pole);
    // Bras
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,1.2), new THREE.MeshLambertMaterial({color:0x888888}));
    arm.position.set(x,3.0,z+side*0.6); scene.add(arm);
    // Panneau
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.9,0.06), new THREE.MeshLambertMaterial({color:0xf0f0ff,transparent:true,opacity:0.7}));
    board.position.set(x,3.1,z+side*1.25); scene.add(board);
    // Cercle (panier)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23,0.025,8,24), mPanRed);
    ring.rotation.x=Math.PI/2; ring.position.set(x,2.8,z+side*1.0); scene.add(ring);
    // Filet
    const netGeo = new THREE.CylinderGeometry(0.22,0.14,0.4,12,1,true);
    const netMesh = new THREE.Mesh(netGeo, mNet);
    netMesh.position.set(x,2.6,z+side*1.0); scene.add(netMesh);
  }
  makePanier(bktX, bktZ-bktD/2+1.5,  1); // panier nord
  makePanier(bktX, bktZ+bktD/2-1.5, -1); // panier sud

  // Panneau "BASKET" sur le sol
  const bktSignCanvas = document.createElement('canvas');
  bktSignCanvas.width=256; bktSignCanvas.height=64;
  const bsCtx=bktSignCanvas.getContext('2d');
  bsCtx.fillStyle='rgba(0,0,0,0)'; bsCtx.fillRect(0,0,256,64);
  bsCtx.fillStyle='#ff8c00'; bsCtx.font='bold 36px Arial'; bsCtx.textAlign='center'; bsCtx.textBaseline='middle';
  bsCtx.fillText('🏀 BASKET', 128, 32);
  const bktSign = new THREE.Mesh(new THREE.PlaneGeometry(4,1),
    new THREE.MeshBasicMaterial({map:_CT(bktSignCanvas),transparent:true}));
  bktSign.rotation.x=-Math.PI/2; bktSign.position.set(bktX,0.025,bktZ-bktD/2+2); scene.add(bktSign);
}

// ═══════════════════════════════════════════════════════════════════════
// ─── TERRAIN DE FOOT (cour arrière, côté droit) ──────────────────────
// Position : X 6 à 24, Z -35 à -115 (centre X=15, Z=-75)
// ═══════════════════════════════════════════════════════════════════════
{
  const ftX = 15, ftZ = -65, ftW = 18, ftD = 34;

  // Sol herbe verte (marquée)
  const mGrassF = new THREE.MeshLambertMaterial({color:0x2d8a18});
  const ftFloor = new THREE.Mesh(new THREE.PlaneGeometry(ftW,ftD), mGrassF);
  ftFloor.rotation.x=-Math.PI/2; ftFloor.position.set(ftX,0.015,ftZ);
  ftFloor.receiveShadow=true; scene.add(ftFloor);

  // Lignes terrain foot (canvas)
  const ftCanvas=document.createElement('canvas'); ftCanvas.width=256; ftCanvas.height=512;
  const fCtx=ftCanvas.getContext('2d');
  fCtx.fillStyle='#2d8a18'; fCtx.fillRect(0,0,256,512);
  fCtx.strokeStyle='#ffffff'; fCtx.lineWidth=5;
  // Bordure
  fCtx.strokeRect(8,8,240,496);
  // Ligne médiane
  fCtx.beginPath(); fCtx.moveTo(8,256); fCtx.lineTo(248,256); fCtx.stroke();
  // Cercle central
  fCtx.beginPath(); fCtx.arc(128,256,40,0,Math.PI*2); fCtx.stroke();
  // Point central
  fCtx.fillStyle='#ffffff'; fCtx.beginPath(); fCtx.arc(128,256,4,0,Math.PI*2); fCtx.fill();
  // Surface de réparation haute
  fCtx.strokeRect(68,8,120,80);
  fCtx.strokeRect(88,8,80,45);
  // Surface de réparation basse
  fCtx.strokeRect(68,424,120,80);
  fCtx.strokeRect(88,467,80,45);
  // Points de penalty
  fCtx.fillStyle='#ffffff';
  fCtx.beginPath(); fCtx.arc(128,88,4,0,Math.PI*2); fCtx.fill();
  fCtx.beginPath(); fCtx.arc(128,424,4,0,Math.PI*2); fCtx.fill();
  const ftTex=_CT(ftCanvas);
  const mFtLines=new THREE.MeshBasicMaterial({map:ftTex,transparent:true,opacity:0.9});
  const ftLines=new THREE.Mesh(new THREE.PlaneGeometry(ftW,ftD),mFtLines);
  ftLines.rotation.x=-Math.PI/2; ftLines.position.set(ftX,0.02,ftZ); scene.add(ftLines);

  // Buts de foot
  function makeBut(x,z,side){
    const mMetal=new THREE.MeshLambertMaterial({color:0xffffff});
    const poteauL=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.4,8),mMetal);
    poteauL.position.set(x-2.0,1.2,z); poteauL.castShadow=true; scene.add(poteauL);
    const poteauR=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.4,8),mMetal);
    poteauR.position.set(x+2.0,1.2,z); poteauR.castShadow=true; scene.add(poteauR);
    const barre=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,4.1,8),mMetal);
    barre.rotation.z=Math.PI/2; barre.position.set(x,2.4,z); scene.add(barre);
    // Filet
    const mFilet=new THREE.MeshLambertMaterial({color:0xeeeeee,transparent:true,opacity:0.5,wireframe:true});
    const filetGeo=new THREE.BoxGeometry(4.0,2.4,1.5);
    const filet=new THREE.Mesh(filetGeo,mFilet);
    filet.position.set(x,1.2,z-side*0.75); scene.add(filet);
  }
  makeBut(ftX, ftZ-ftD/2+0.3, -1); // but nord
  makeBut(ftX, ftZ+ftD/2-0.3,  1); // but sud
}

// ═══════════════════════════════════════════════════════════════════════
// ─── BÂTIMENT CANTINE (cour arrière, côté droit / fond) ───────────────
// Murs en pierre pareils (stoneTex), tables rondes à l'intérieur
// Position : X 6 à 26, Z -145 à -120 (reculé au fond, dans le grillage)
// ═══════════════════════════════════════════════════════════════════════
{
  const caX1=6, caX2=26, caZ1=-145, caZ2=-120;
  const caW=caX2-caX1, caD=Math.abs(caZ2-caZ1), caH=5;
  const caCX=(caX1+caX2)/2, caCZ=(caZ1+caZ2)/2;
  const wT=0.35;

  const mCA=new THREE.MeshLambertMaterial({color:0xddd4b8,map:stoneTex});
  const mFloorCA=new THREE.MeshLambertMaterial({color:0xd8c8a0}); // carrelage beige
  const mCeilCA=new THREE.MeshLambertMaterial({color:0xe8e0cc});
  const mRoofCA=new THREE.MeshLambertMaterial({map:roofTex,color:0x6a7880});

  // Sol carrelé chaud
  {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW,caD),mFloorCA);
   pl.rotation.x=-Math.PI/2; pl.position.set(caCX,0.02,caCZ); pl.receiveShadow=true; scene.add(pl);}
  // Plafond
  {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW,caD),mCeilCA);
   pl.rotation.x=Math.PI/2; pl.position.set(caCX,caH,caCZ); scene.add(pl);}
  // (toit supprimé - remplacé par le plancher de la salle des professeurs au 1er étage)

  // Murs extérieurs (même matériau pierre que le bâtiment principal)
  // Mur gauche avec trou pour l'accès ascenseur extérieur (Z -123.35 à -120.35, hauteur 2.6)
  {
    const hZ1=-123.35, hZ2=-120.35, hOpenH=2.6;
    const seg1D=Math.abs(hZ1-caZ1); if(seg1D>0.05) box(wT,caH,seg1D,mCA,caX1,caH/2,(caZ1+hZ1)/2);
    const seg2D=Math.abs(caZ2-hZ2); if(seg2D>0.05) box(wT,caH,seg2D,mCA,caX1,caH/2,(hZ2+caZ2)/2);
    const topH=caH-hOpenH; if(topH>0.05) box(wT,topH,hZ2-hZ1,mCA,caX1,hOpenH+topH/2,(hZ1+hZ2)/2);
  }
  // Mur droit
  box(wT,caH,caD,mCA,caX2,caH/2,caCZ);
  // Mur du fond (Z=caZ1)
  box(caW+wT*2,caH,wT,mCA,caCX,caH/2,caZ1);

  // ── MUR FAÇADE CANTINE (Z=caZ2=-90) avec grande porte + fenêtres ─────
  const caDoorW=3.2, caDoorH=3.8, caDoorX=caCX;
  const fwCA=2.2, fhCA=2.4, fcyCA=2.5;
  const caWinXs=[caX1+3, caX1+6, caX2-3, caX2-6];

  // Bande basse (sous les fenêtres)
  box(caW,1.3,wT,mCA,caCX,0.65,caZ2);
  // Bande haute (au-dessus des fenêtres)
  box(caW,caH-fcyCA-fhCA/2,wT,mCA,caCX,fcyCA+fhCA/2+(caH-fcyCA-fhCA/2)/2,caZ2);

  // Reconstruction des segments verticaux (zone fenêtres/porte)
  {
    const sortedCuts=[];
    caWinXs.forEach(wx=>{ sortedCuts.push(wx-fwCA/2); sortedCuts.push(wx+fwCA/2); });
    sortedCuts.push(caDoorX-caDoorW/2); sortedCuts.push(caDoorX+caDoorW/2);
    sortedCuts.sort((a,b)=>a-b);
    let seg=caX1;
    for(let i=0;i<sortedCuts.length;i+=2){
      const l=sortedCuts[i]-seg;
      if(l>0.05) box(l,fhCA,wT,mCA,seg+l/2,fcyCA,caZ2);
      seg=sortedCuts[i+1];
    }
    const last=caX2-seg;
    if(last>0.05) box(last,fhCA,wT,mCA,seg+last/2,fcyCA,caZ2);
    // Bandeau porte
    box(caDoorW+0.2,caH-caDoorH,wT,mCA,caDoorX,caDoorH+(caH-caDoorH)/2,caZ2);
  }

  // Fenêtres façade cantine (on voit à l'intérieur)
  const mGlassCa=new THREE.MeshLambertMaterial({color:0xb0dde8,transparent:true,opacity:0.38,side:THREE.DoubleSide});
  const mFrCa=new THREE.MeshLambertMaterial({color:0x4a4a4a});
  caWinXs.forEach(wx=>{
    const pane=new THREE.Mesh(new THREE.PlaneGeometry(fwCA-0.2,fhCA-0.2),mGlassCa);
    pane.position.set(wx,fcyCA,caZ2+0.01); scene.add(pane);
    box(fwCA+0.1,0.10,0.10,mFrCa,wx,fcyCA+fhCA/2+0.05,caZ2);
    box(fwCA+0.1,0.10,0.10,mFrCa,wx,fcyCA-fhCA/2-0.05,caZ2);
    box(0.10,fhCA+0.1,0.10,mFrCa,wx-fwCA/2-0.05,fcyCA,caZ2);
    box(0.10,fhCA+0.1,0.10,mFrCa,wx+fwCA/2+0.05,fcyCA,caZ2);
    box(fwCA,0.06,0.06,mFrCa,wx,fcyCA,caZ2);
    box(0.06,fhCA,0.06,mFrCa,wx,fcyCA,caZ2);
  });

  // ── PORTE CANTINE (double vantail interactif) ──────────────────────
  const caDoor=(()=>{
    const mDrCA=new THREE.MeshLambertMaterial({color:0x4a6840});
    const mGlCA=new THREE.MeshLambertMaterial({color:0xb0dde8,transparent:true,opacity:0.45,side:THREE.DoubleSide});
    const mGdCA=new THREE.MeshLambertMaterial({color:0xd4a010});
    const lvCA=[];
    [-1,1].forEach((side,idx)=>{
      const piv=new THREE.Group();
      piv.position.set(caDoorX+side*(caDoorW/2-0.04),0,caZ2+wT/2);
      scene.add(piv); lvCA.push({pivot:piv,side});
      const lo=-side*(caDoorW/4);

      // Texture "Cantine" sur la porte
      const caTex=(()=>{
        const cv=document.createElement('canvas'); cv.width=256; cv.height=512;
        const ctx=cv.getContext('2d');
        ctx.fillStyle='#4a6840'; ctx.fillRect(0,0,256,512);
        const py=200,ph=80,px=25;
        ctx.fillStyle='#2a4020'; ctx.fillRect(px-3,py-3,206,ph+6);
        const g4=ctx.createLinearGradient(px,py,px+200,py+ph);
        g4.addColorStop(0,'#d4a810'); g4.addColorStop(1,'#a07810');
        ctx.fillStyle=g4; ctx.fillRect(px,py,200,ph);
        ctx.strokeStyle='#7a5010'; ctx.lineWidth=3; ctx.strokeRect(px+4,py+4,192,ph-8);
        ctx.fillStyle='#1a1004'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 36px Georgia,serif'; ctx.fillText('Cantine',128,py+ph/2);
        ctx.fillStyle='#d4a810'; ctx.font='28px Arial';
        ctx.fillText('🍽️',128,py+ph+50);
        return _CT(cv);
      })();

      const leafMat=(idx===0)?new THREE.MeshLambertMaterial({map:caTex}):mDrCA;
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(caDoorW/2-0.08,caDoorH-0.1,0.10),leafMat);
      leaf.position.set(lo,(caDoorH-0.1)/2,0); leaf.castShadow=true; piv.add(leaf);
      [0.72,0.40].forEach(yr=>{
        const p=new THREE.Mesh(new THREE.BoxGeometry(caDoorW/2-0.3,0.8,0.07),new THREE.MeshLambertMaterial({color:0x2a4020}));
        p.position.set(lo,caDoorH*yr,-0.04); piv.add(p);
      });
      const glD=new THREE.Mesh(new THREE.BoxGeometry(caDoorW/2-0.35,0.75,0.05),mGlCA);
      glD.position.set(lo,caDoorH-0.52,-0.04); piv.add(glD);
      const hndCA=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.24,8),mGdCA);
      hndCA.rotation.z=Math.PI/2; hndCA.position.set(lo*2*0.88,caDoorH*0.5,0.12); piv.add(hndCA);
    });
    return {leaves:lvCA,pos:new THREE.Vector3(caDoorX,1.7,caZ2+0.5),outDir:0,isBack:true};
  })();

  DOORS.push({
    id:'cantine',
    pos:caDoor.pos, leaves:caDoor.leaves, outDir:0,
    animAngle:0, targetAngle:0, open:false,
    isBack:true, floor:0
  });

  // Piliers décoratifs cantine
  const mPilCA=new THREE.MeshLambertMaterial({color:0xe0d8c0});
  [-caDoorW/2-0.22,caDoorW/2+0.22].forEach(dx=>{
    box(0.42,caDoorH+0.28,0.48,mPilCA,caDoorX+dx,(caDoorH+0.28)/2,caZ2+0.08);
    box(0.55,0.18,0.58,new THREE.MeshLambertMaterial({color:0xd0c8b0}),caDoorX+dx,caDoorH+0.28,caZ2+0.08);
  });

  // ── TABLES RONDES À L'INTÉRIEUR ───────────────────────────────────────
  const mTableRd=new THREE.MeshLambertMaterial({color:0xd4aa60});
  const mPiedRd=new THREE.MeshLambertMaterial({color:0x888888});
  const mChCA=new THREE.MeshLambertMaterial({color:0x6a3a1a});
  const mSeatCA=new THREE.MeshLambertMaterial({color:0xc86020});

  function makeRoundTable(tx,tz){
    // Plateau rond
    const top=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,0.08,24),mTableRd);
    top.position.set(tx,0.76,tz); top.castShadow=true; scene.add(top);
    // Pied central
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.10,0.76,12),mPiedRd);
    ped.position.set(tx,0.38,tz); scene.add(ped);
    // Base
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.30,0.30,0.06,12),mPiedRd);
    base.position.set(tx,0.03,tz); scene.add(base);
    // 4 chaises autour
    [0,1,2,3].forEach(i=>{
      const ang=i*Math.PI/2;
      const cx=tx+Math.cos(ang)*1.15, cz=tz+Math.sin(ang)*1.15;
      const seat=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.22,0.06,10),mSeatCA);
      seat.position.set(cx,0.46,cz); seat.castShadow=true; scene.add(seat);
      // Pieds chaise (2 pairs)
      [-0.18,0.18].forEach(dd=>{
        const fz2=Math.cos(ang)*0.18+Math.sin(ang)*dd;
        const fx2=Math.sin(ang)*-0.18+Math.cos(ang)*dd;
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.46,6),mChCA);
        leg.position.set(cx+fx2,0.23,cz+fz2); scene.add(leg);
      });
      // Dossier
      const back=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.22,0.06,10),mSeatCA);
      back.position.set(cx+Math.cos(ang)*0.18,0.82,cz+Math.sin(ang)*0.18);
      back.rotation.x=ang%Math.PI===0?Math.PI/2+0.3:0.3;
      back.rotation.z=ang%Math.PI!==0?Math.PI/2+0.3:0.3;
      scene.add(back);
    });
  }

  // Disposition : 3 colonnes × 4 rangées de tables rondes
  const colsCA=3, rowsCA=4;
  const spacX=(caW-4)/(colsCA-1), spacZ=(caD-6)/(rowsCA-1);
  for(let c=0;c<colsCA;c++){
    for(let r=0;r<rowsCA;r++){
      const tx=caX1+2+c*spacX;
      const tz=caZ1+3+r*spacZ;
      // Sauter les tables dans la zone ascenseur (X:6-9.5, Z:-126 à -119)
      if(tx<9.5 && tz>-126 && tz<-119) continue;
      makeRoundTable(tx,tz);
    }
  }

  // Comptoir de service au fond de la cantine
  const mComptoir=new THREE.MeshLambertMaterial({color:0x6a8860});
  box(caW-2,0.96,1.2,mComptoir,caCX,0.48,caZ1+1.5); // plan comptoir
  box(caW-2,0.08,1.4,new THREE.MeshLambertMaterial({color:0xc8b880}),caCX,0.97,caZ1+1.5); // plateau
  // Panneau menu au mur du fond
  const menuCanvas=document.createElement('canvas'); menuCanvas.width=256; menuCanvas.height=256;
  const mCtx=menuCanvas.getContext('2d');
  mCtx.fillStyle='#2a3020'; mCtx.fillRect(0,0,256,256);
  mCtx.strokeStyle='#d4a020'; mCtx.lineWidth=4; mCtx.strokeRect(8,8,240,240);
  mCtx.fillStyle='#f0d060'; mCtx.font='bold 22px Georgia,serif'; mCtx.textAlign='center';
  mCtx.fillText('🍽️ MENU DU JOUR',128,45);
  mCtx.fillStyle='#e8e0c0'; mCtx.font='15px Georgia,serif';
  ['Entrée : Salade verte','Plat : Poulet rôti','Garniture : Riz','Dessert : Yaourt fruit'].forEach((line,i)=>{
    mCtx.fillText(line,128,90+i*38);
  });
  const menuMesh=new THREE.Mesh(new THREE.BoxGeometry(5,3,0.06),
    new THREE.MeshBasicMaterial({map:_CT(menuCanvas)}));
  menuMesh.position.set(caCX,2.5,caZ1+0.18); scene.add(menuMesh);

  // Lumières intérieures cantine
  [caCX-5,caCX,caCX+5].forEach(lx=>{
    const cl=new THREE.PointLight(0xffe8c0,0.6,16);
    cl.position.set(lx,caH-0.5,caCZ); scene.add(cl);
    const cBulb=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6),new THREE.MeshBasicMaterial({color:0xffe8a0}));
    cBulb.position.set(lx,caH-0.4,caCZ); scene.add(cBulb);
  });

  // Panneau extérieur
  const caSignCanvas=document.createElement('canvas'); caSignCanvas.width=256; caSignCanvas.height=64;
  const caCtx=caSignCanvas.getContext('2d');
  caCtx.fillStyle='#4a6840'; caCtx.fillRect(0,0,256,64);
  caCtx.strokeStyle='#d4a010'; caCtx.lineWidth=3; caCtx.strokeRect(3,3,250,58);
  caCtx.fillStyle='#f0d080'; caCtx.font='bold 26px Georgia,serif'; caCtx.textAlign='center'; caCtx.textBaseline='middle';
  caCtx.fillText('🍽️  Cantine', 128, 32);
  const caSignMesh=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.50,0.08),
    new THREE.MeshBasicMaterial({map:_CT(caSignCanvas)}));
  caSignMesh.position.set(caDoorX,caDoorH+0.36,caZ2+0.12); scene.add(caSignMesh);
}

// ═══════════════════════════════════════════════════════════════════════
// ─── EXTENSION CANTINE : 3 ÉTAGES + ASCENSEUR INTERACTIF ────────────
//
//  Cantine RDC  : X 6→26, Z -145→-120, Y 0→5   (existant)
//  Étage 1 (Y 5→10)  : Salle des Professeurs
//  Étage 2 (Y 10→15) : Salle de Surveillance (écrans, caméras)
//  Étage 3 (Y 15→17) : Terrasse ouverte avec grillage style animé
//  Ascenseur   : colonne X 24→26, Z -122→-119, accès tous niveaux
// ═══════════════════════════════════════════════════════════════════════
{
  // ── Dimensions base calquées sur la cantine ──
  const caX1=6, caX2=26, caZ1=-145, caZ2=-120;
  const caW=caX2-caX1, caD=Math.abs(caZ2-caZ1);
  const caCX=(caX1+caX2)/2, caCZ=(caZ1+caZ2)/2;
  const FLOOR_H=5, wT=0.35;

  // ── Matériaux partagés ──
  const mWall   = new THREE.MeshLambertMaterial({color:0xddd4b8,map:stoneTex});
  const mWallDk = new THREE.MeshLambertMaterial({color:0xc8c0a8,map:stoneTex});
  const mFloor  = new THREE.MeshLambertMaterial({color:0xc8b898,map:paveTex});
  const mCeil   = new THREE.MeshLambertMaterial({color:0xe8e0d0});
  const mGlW    = new THREE.MeshLambertMaterial({color:0x90ccff,transparent:true,opacity:0.38,side:THREE.DoubleSide});
  const mFrW    = new THREE.MeshLambertMaterial({color:0x5a4830});
  const mGold   = new THREE.MeshLambertMaterial({color:0xd4a010});

  // ═══════════════════════════════════════════════
  // ÉTAGE 1  (Y = 5 → 10) : Salle des Professeurs
  // ═══════════════════════════════════════════════
  {
    const y0=FLOOR_H, yTop=FLOOR_H*2;
    // Plancher (= plafond de la cantine)
    {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW+0.6,caD+0.6),mCeil);
     pl.rotation.x=-Math.PI/2; pl.position.set(caCX,y0+0.01,caCZ); scene.add(pl);}
    // Plafond
    {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW,caD),mCeil);
     pl.rotation.x=Math.PI/2; pl.position.set(caCX,yTop,caCZ); scene.add(pl);}

    // Murs latéraux et fond
    // Mur gauche (caX1) avec trou pour ascenseur extérieur (elZ1=-123.35 à elZ2=-120.35, hauteur openH=2.6)
    {
      const hZ1=-123.35, hZ2=-120.35, hOpenH=2.6;
      // Segment fond (Z de caZ1=-145 à hZ1=-123.35)
      const seg1D=Math.abs(hZ1-caZ1); if(seg1D>0.05) box(wT,FLOOR_H,seg1D,mWall,caX1,y0+FLOOR_H/2,(caZ1+hZ1)/2);
      // Segment façade (Z de hZ2=-120.35 à caZ2=-120)
      const seg2D=Math.abs(caZ2-hZ2); if(seg2D>0.05) box(wT,FLOOR_H,seg2D,mWall,caX1,y0+FLOOR_H/2,(hZ2+caZ2)/2);
      // Bandeau haut du trou (au-dessus de l'ouverture jusqu'au plafond)
      const topH=FLOOR_H-hOpenH; if(topH>0.05) box(wT,topH,hZ2-hZ1,mWall,caX1,y0+hOpenH+topH/2,(hZ1+hZ2)/2);
    }
    box(wT,FLOOR_H,caD,mWall,caX2,y0+FLOOR_H/2,caCZ);  // droite
    box(caW+wT*2,FLOOR_H,wT,mWall,caCX,y0+FLOOR_H/2,caZ1); // fond

    // Mur façade avec porte centrale + 4 fenêtres
    const doorW=2.8, doorH=3.6, doorX=caCX;
    const fwP=2.0, fhP=2.2, fcyP=y0+FLOOR_H*0.52;
    const winsP=[caX1+3.5, caX1+7.5, caX2-3.5, caX2-7.5];

    // Bandes h façade
    box(caW,1.2,wT,mWall,caCX,y0+0.6,caZ2);
    box(caW,yTop-fcyP-fhP/2,wT,mWall,caCX,fcyP+fhP/2+(yTop-fcyP-fhP/2)/2,caZ2);

    // Segments verticaux (porte + fenêtres découpées)
    {
      const cuts=[];
      winsP.forEach(wx=>{cuts.push(wx-fwP/2,wx+fwP/2);});
      cuts.push(doorX-doorW/2,doorX+doorW/2);
      cuts.sort((a,b)=>a-b);
      let seg=caX1;
      for(let i=0;i<cuts.length;i+=2){
        const l=cuts[i]-seg; if(l>0.05) box(l,fhP,wT,mWall,seg+l/2,fcyP,caZ2);
        seg=cuts[i+1];
      }
      const last=caX2-seg; if(last>0.05) box(last,fhP,wT,mWall,seg+last/2,fcyP,caZ2);
      box(doorW+0.2,yTop-(y0+doorH),wT,mWall,doorX,y0+doorH+(yTop-(y0+doorH))/2,caZ2);
    }

    // Vitres fenêtres
    winsP.forEach(wx=>{
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(fwP-0.2,fhP-0.2),mGlW);
      pane.position.set(wx,fcyP,caZ2+0.01); scene.add(pane);
      box(fwP+0.1,0.08,0.08,mFrW,wx,fcyP+fhP/2+0.04,caZ2);
      box(fwP+0.1,0.08,0.08,mFrW,wx,fcyP-fhP/2-0.04,caZ2);
      box(0.08,fhP+0.08,0.08,mFrW,wx-fwP/2-0.04,fcyP,caZ2);
      box(0.08,fhP+0.08,0.08,mFrW,wx+fwP/2+0.04,fcyP,caZ2);
      box(fwP,0.05,0.05,mFrW,wx,fcyP,caZ2);
      box(0.05,fhP,0.05,mFrW,wx,fcyP,caZ2);
    });

    // Porte interactive Salle des Profs
    const mDrP=new THREE.MeshLambertMaterial({color:0x5a3820});
    const mGlDrP=new THREE.MeshLambertMaterial({color:0x90ccff,transparent:true,opacity:0.5,side:THREE.DoubleSide});
    const lvP=[];
    [-1,1].forEach((side,idx)=>{
      const piv=new THREE.Group();
      piv.position.set(doorX+side*(doorW/2-0.04),y0,caZ2+wT/2);
      scene.add(piv); lvP.push({pivot:piv,side});
      const lo=-side*(doorW/4);
      // Texture plaque laiton
      const tex=(()=>{
        const cv=document.createElement('canvas'); cv.width=256; cv.height=512;
        const ctx=cv.getContext('2d');
        ctx.fillStyle='#5a3820'; ctx.fillRect(0,0,256,512);
        const pg=ctx.createLinearGradient(0,0,256,512);
        pg.addColorStop(0,'rgba(255,255,255,0.06)');pg.addColorStop(1,'rgba(0,0,0,0.08)');
        ctx.fillStyle=pg; ctx.fillRect(0,0,256,512);
        const px=20,py=185,pw=216,ph=100;
        ctx.fillStyle='#7a4010'; ctx.fillRect(px-3,py-3,pw+6,ph+6);
        const g=ctx.createLinearGradient(px,py,px+pw,py+ph);
        g.addColorStop(0,'#f0d040'); g.addColorStop(1,'#b08820');
        ctx.fillStyle=g; ctx.fillRect(px,py,pw,ph);
        ctx.strokeStyle='#7a5010'; ctx.lineWidth=3; ctx.strokeRect(px+4,py+4,pw-8,ph-8);
        ctx.fillStyle='#1a0e04'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 22px Georgia,serif';
        ctx.fillText('Salle des',128,py+ph/2-15);
        ctx.fillText('Professeurs',128,py+ph/2+15);
        return _CT(cv);
      })();
      const mat=idx===0?new THREE.MeshLambertMaterial({map:tex}):mDrP;
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.08,doorH-0.1,0.10),mat);
      leaf.position.set(lo,(doorH-0.1)/2,0); leaf.castShadow=true; piv.add(leaf);
      const gl=new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.4,0.75,0.05),mGlDrP);
      gl.position.set(lo,doorH-0.52,-0.04); piv.add(gl);
      const hnd=new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.22,8),mGold);
      hnd.rotation.z=Math.PI/2; hnd.position.set(lo*2*0.88,doorH*0.5,0.12); piv.add(hnd);
    });
    DOORS.push({id:'salleProfs',pos:new THREE.Vector3(doorX,y0+1.7,caZ2+0.5),leaves:lvP,outDir:0,animAngle:0,targetAngle:0,open:false,isBack:true,floor:1});

    // Enseigne extérieure
    {
      const sc=document.createElement('canvas'); sc.width=256; sc.height=64;
      const sx=sc.getContext('2d');
      sx.fillStyle='#2a3a5a'; sx.fillRect(0,0,256,64);
      sx.strokeStyle='#d4a010'; sx.lineWidth=3; sx.strokeRect(3,3,250,58);
      sx.fillStyle='#f0d080'; sx.font='bold 20px Georgia,serif'; sx.textAlign='center'; sx.textBaseline='middle';
      sx.fillText('👩‍🏫 Salle des Professeurs',128,32);
      const sm=new THREE.Mesh(new THREE.BoxGeometry(3.5,0.44,0.08),
        new THREE.MeshBasicMaterial({map:_CT(sc)}));
      sm.position.set(doorX,y0+doorH+0.32,caZ2+0.12); scene.add(sm);
    }

    // Mobilier : 6 bureaux de profs + table de réunion
    const mDk=new THREE.MeshLambertMaterial({color:0xb08040});
    const mCh=new THREE.MeshLambertMaterial({color:0x2a3a5a});
    const mSt=new THREE.MeshLambertMaterial({color:0x3a4a6a});
    function profDesk(tx,tz){
      box(1.8,0.08,0.90,mDk,tx,y0+0.76,tz);
      [[-0.85,-0.40],[0.85,-0.40],[-0.85,0.40],[0.85,0.40]].forEach(([dx,dz])=>
        box(0.06,0.76,0.06,mDk,tx+dx,y0+0.38,tz+dz));
      box(0.5,0.06,0.5,mCh,tx,y0+0.46,tz+0.88);
      [[-0.2,0.68],[0.2,0.68],[-0.2,1.08],[0.2,1.08]].forEach(([dx,dz])=>
        box(0.06,0.46,0.06,mCh,tx+dx,y0+0.23,tz+dz));
      box(0.5,0.38,0.06,mSt,tx,y0+0.64,tz+0.68);
      // Petit écran PC sur le bureau
      const mPC=new THREE.MeshLambertMaterial({color:0x111111});
      box(0.7,0.55,0.06,mPC,tx,y0+1.15,tz-0.35);
      box(0.4,0.04,0.4,mPC,tx,y0+0.80,tz-0.22);
    }
    [caCX-4, caCX+4].forEach(tx=>{
      [caZ1+4, caZ1+8.5, caZ1+13].forEach(tz=>profDesk(tx,tz));
    });
    // Table réunion centrale
    const mTR=new THREE.MeshLambertMaterial({color:0x8a6030});
    box(9,0.08,2.0,mTR,caCX,y0+0.78,caZ1+3.2);
    [-3.5,-1.5,0,1.5,3.5].forEach(dx=>{
      box(0.5,0.06,0.5,mCh,caCX+dx,y0+0.46,caZ1+1.5);
      box(0.5,0.06,0.5,mCh,caCX+dx,y0+0.46,caZ1+4.9);
    });
    // Tableau blanc au fond
    box(7,0.06,2.5,new THREE.MeshLambertMaterial({color:0xf8f8f4}),caCX,y0+2.6,caZ1+0.14);
    box(7.2,0.10,0.10,new THREE.MeshLambertMaterial({color:0x2a2a2a}),caCX,y0+1.35,caZ1+0.14);
    box(7.2,0.10,0.10,new THREE.MeshLambertMaterial({color:0x2a2a2a}),caCX,y0+3.86,caZ1+0.14);

    // Lumières
    [caCX-5,caCX,caCX+5].forEach(lx=>{
      const l=new THREE.PointLight(0xfff4d0,0.55,14);
      l.position.set(lx,yTop-0.5,caCZ); scene.add(l);
      const b=new THREE.Mesh(new THREE.SphereGeometry(0.11,8,6),
        new THREE.MeshBasicMaterial({color:0xffe8a0}));
      b.position.set(lx,yTop-0.38,caCZ); scene.add(b);
      const w=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.5,4),
        new THREE.MeshLambertMaterial({color:0x222222}));
      w.position.set(lx,yTop-0.15,caCZ); scene.add(w);
    });
  }

  // ══════════════════════════════════════════════════════
  // ÉTAGE 2  (Y = 10 → 15) : Salle de Surveillance
  // ══════════════════════════════════════════════════════
  {
    const y0=FLOOR_H*2, yTop=FLOOR_H*3;
    const mWallSurv=new THREE.MeshLambertMaterial({color:0x2a2e38,map:stoneTex});
    const mFlSurv=new THREE.MeshLambertMaterial({color:0x1e2230});
    const mCeilSurv=new THREE.MeshLambertMaterial({color:0x1a1e28});

    // Sol (= plafond étage 1)
    {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW+0.6,caD+0.6),mCeil);
     pl.rotation.x=-Math.PI/2; pl.position.set(caCX,y0+0.01,caCZ); scene.add(pl);}
    // Plafond sombre
    {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW,caD),mCeilSurv);
     pl.rotation.x=Math.PI/2; pl.position.set(caCX,yTop,caCZ); scene.add(pl);}

    // Murs extérieurs (teinte sombre)
    // Mur gauche avec trou ascenseur extérieur
    {
      const hZ1=-123.35, hZ2=-120.35, hOpenH=2.6;
      const seg1D=Math.abs(hZ1-caZ1); if(seg1D>0.05) box(wT,FLOOR_H,seg1D,mWallSurv,caX1,y0+FLOOR_H/2,(caZ1+hZ1)/2);
      const seg2D=Math.abs(caZ2-hZ2); if(seg2D>0.05) box(wT,FLOOR_H,seg2D,mWallSurv,caX1,y0+FLOOR_H/2,(hZ2+caZ2)/2);
      const topH=FLOOR_H-hOpenH; if(topH>0.05) box(wT,topH,hZ2-hZ1,mWallSurv,caX1,y0+hOpenH+topH/2,(hZ1+hZ2)/2);
    }
    box(wT,FLOOR_H,caD,mWallSurv,caX2,y0+FLOOR_H/2,caCZ);
    box(caW+wT*2,FLOOR_H,wT,mWallSurv,caCX,y0+FLOOR_H/2,caZ1);

    // Mur façade : grande baie vitrée panoramique + porte technique
    const doorW=2.2, doorH=3.4, doorX=caCX+7;
    const fwS=3.5, fhS=2.8, fcyS=y0+FLOOR_H*0.52;
    const winsS=[caCX-8, caCX-2, caCX+3];

    box(caW,1.0,wT,mWallSurv,caCX,y0+0.5,caZ2);
    box(caW,yTop-fcyS-fhS/2,wT,mWallSurv,caCX,fcyS+fhS/2+(yTop-fcyS-fhS/2)/2,caZ2);
    {
      const cuts=[];
      winsS.forEach(wx=>{cuts.push(wx-fwS/2,wx+fwS/2);});
      cuts.push(doorX-doorW/2,doorX+doorW/2);
      cuts.sort((a,b)=>a-b);
      let seg=caX1; for(let i=0;i<cuts.length;i+=2){
        const l=cuts[i]-seg; if(l>0.05) box(l,fhS,wT,mWallSurv,seg+l/2,fcyS,caZ2);
        seg=cuts[i+1];
      }
      const last=caX2-seg; if(last>0.05) box(last,fhS,wT,mWallSurv,seg+last/2,fcyS,caZ2);
      box(doorW+0.2,yTop-(y0+doorH),wT,mWallSurv,doorX,y0+doorH+(yTop-(y0+doorH))/2,caZ2);
    }

    // Grandes baies vitrées (effet salle de contrôle)
    const mGlSurv=new THREE.MeshLambertMaterial({color:0x3090c0,transparent:true,opacity:0.3,side:THREE.DoubleSide});
    winsS.forEach(wx=>{
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(fwS-0.2,fhS-0.2),mGlSurv);
      pane.position.set(wx,fcyS,caZ2+0.01); scene.add(pane);
      const mFrS=new THREE.MeshLambertMaterial({color:0x446688});
      box(fwS+0.1,0.08,0.08,mFrS,wx,fcyS+fhS/2+0.04,caZ2);
      box(fwS+0.1,0.08,0.08,mFrS,wx,fcyS-fhS/2-0.04,caZ2);
      box(0.08,fhS+0.08,0.08,mFrS,wx-fwS/2-0.04,fcyS,caZ2);
      box(0.08,fhS+0.08,0.08,mFrS,wx+fwS/2+0.04,fcyS,caZ2);
      // Reflets croisillons fin
      box(fwS,0.04,0.04,mFrS,wx,fcyS,caZ2);
      box(0.04,fhS,0.04,mFrS,wx,fcyS,caZ2);
    });

    // Porte technique (couleur acier)
    {
      const mDrSurv=new THREE.MeshLambertMaterial({color:0x1a2840});
      const mGlDrSurv=new THREE.MeshLambertMaterial({color:0x3090c0,transparent:true,opacity:0.45,side:THREE.DoubleSide});
      const lvSurv=[];
      [-1,1].forEach((side,idx)=>{
        const piv=new THREE.Group();
        piv.position.set(doorX+side*(doorW/2-0.04),y0,caZ2+wT/2);
        scene.add(piv); lvSurv.push({pivot:piv,side});
        const lo=-side*(doorW/4);
        const leaf=new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.08,doorH-0.1,0.10),mDrSurv);
        leaf.position.set(lo,(doorH-0.1)/2,0); leaf.castShadow=true; piv.add(leaf);
        const gl=new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.35,1.0,0.05),mGlDrSurv);
        gl.position.set(lo,doorH-0.65,-0.04); piv.add(gl);
        const hnd=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.22,8),
          new THREE.MeshLambertMaterial({color:0x668899}));
        hnd.rotation.z=Math.PI/2; hnd.position.set(lo*2*0.88,doorH*0.48,0.11); piv.add(hnd);
        // Bandes de sécurité sur la porte
        const mStripe=new THREE.MeshLambertMaterial({color:0xf0c010});
        [0.5,1.0,1.5,2.0,2.5].forEach(dy=>{
          const stripe=new THREE.Mesh(new THREE.BoxGeometry(doorW/2-0.12,0.08,0.12),mStripe);
          stripe.position.set(lo,dy,-0.04); piv.add(stripe);
        });
      });
      DOORS.push({id:'salleSurv',pos:new THREE.Vector3(doorX,y0+1.7,caZ2+0.5),leaves:lvSurv,outDir:0,animAngle:0,targetAngle:0,open:false,isBack:true,floor:2});
    }

    // Enseigne SURVEILLANCE
    {
      const sc=document.createElement('canvas'); sc.width=320; sc.height=64;
      const sx=sc.getContext('2d');
      sx.fillStyle='#0a0e18'; sx.fillRect(0,0,320,64);
      sx.strokeStyle='#4488cc'; sx.lineWidth=2; sx.strokeRect(3,3,314,58);
      sx.fillStyle='#80c0ff'; sx.font='bold 18px monospace'; sx.textAlign='center'; sx.textBaseline='middle';
      sx.fillText('📹 SALLE DE SURVEILLANCE',160,32);
      const sm=new THREE.Mesh(new THREE.BoxGeometry(4.2,0.44,0.08),
        new THREE.MeshBasicMaterial({map:_CT(sc)}));
      sm.position.set(caCX-1,y0+doorH+0.30,caZ2+0.12); scene.add(sm);
    }

    // ── MOT D'ÉCRANS DE SURVEILLANCE ──────────────────────────────
    const mMonitor=new THREE.MeshLambertMaterial({color:0x080c14});
    const mMonBez=new THREE.MeshLambertMaterial({color:0x111828});

    // Grand mur d'écrans au fond (Z=caZ1) : 2 rangées × 5 écrans
    function makeCamScreen(ex,ey,ez,camId){
      const sw=2.0, sh=1.4;
      box(sw+0.2,sh+0.2,0.12,mMonBez,ex,ey,ez);
      const sc2=document.createElement('canvas'); sc2.width=256; sc2.height=180;
      const sx2=sc2.getContext('2d');
      // Fond sombre avec image de caméra simulée
      const g=sx2.createLinearGradient(0,0,256,180);
      g.addColorStop(0,'#001004'); g.addColorStop(1,'#000800');
      sx2.fillStyle=g; sx2.fillRect(0,0,256,180);
      // Grille verte style caméra de surveillance
      sx2.strokeStyle='rgba(0,180,60,0.25)'; sx2.lineWidth=1;
      for(let i=0;i<256;i+=16){sx2.beginPath();sx2.moveTo(i,0);sx2.lineTo(i,180);sx2.stroke();}
      for(let i=0;i<180;i+=16){sx2.beginPath();sx2.moveTo(0,i);sx2.lineTo(256,i);sx2.stroke();}
      // Silhouettes décoratives (rectangles représentant des zones)
      sx2.fillStyle='rgba(0,200,60,0.12)';
      sx2.fillRect(40,30,80,90); sx2.fillRect(150,50,70,60);
      // ID caméra + timestamp
      sx2.fillStyle='#00e040'; sx2.font='bold 13px monospace'; sx2.textAlign='left';
      sx2.fillText(`CAM-${String(camId).padStart(2,'0')}`,8,16);
      sx2.font='11px monospace'; sx2.textAlign='right';
      sx2.fillStyle='rgba(0,200,60,0.8)';
      sx2.fillText('REC ●',248,16);
      sx2.fillStyle='rgba(0,180,60,0.6)'; sx2.font='10px monospace'; sx2.textAlign='left';
      sx2.fillText('LYCÉE JEAN DUMONT',8,168);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(sw-0.1,sh-0.1),
        new THREE.MeshBasicMaterial({map:_CT(sc2)}));
      m.position.set(ex,ey,ez+0.07); scene.add(m);
      // Lumière verte très douce
      const gl2=new THREE.PointLight(0x00cc44,0.08,3);
      gl2.position.set(ex,ey,ez+0.5); scene.add(gl2);
    }

    // Rangée haute Y=y0+3.5
    for(let i=0;i<5;i++) makeCamScreen(caX1+2+i*3.5, y0+3.6, caZ1+0.14, i+1);
    // Rangée basse Y=y0+2.0
    for(let i=0;i<5;i++) makeCamScreen(caX1+2+i*3.5, y0+2.0, caZ1+0.14, i+6);

    // Pupitre de commande central
    const mPup=new THREE.MeshLambertMaterial({color:0x0e1420});
    const mPupTop=new THREE.MeshLambertMaterial({color:0x182030});
    box(8,0.08,1.6,mPupTop,caCX,y0+0.92,caCZ+3);   // plateau incliné
    box(8,0.9,1.4,mPup,caCX,y0+0.45,caCZ+3);        // caisson
    // 3 petits moniteurs PC sur le pupitre
    [caCX-2.5,caCX,caCX+2.5].forEach(mx=>{
      box(1.0,0.65,0.07,mMonitor,mx,y0+1.48,caCZ+2.5);
      box(0.5,0.04,0.5,mMonitor,mx,y0+0.95,caCZ+2.8);
      // Écran allumé
      const sc3=document.createElement('canvas'); sc3.width=128; sc3.height=80;
      const sx3=sc3.getContext('2d');
      sx3.fillStyle='#00060e'; sx3.fillRect(0,0,128,80);
      sx3.fillStyle='rgba(0,180,60,0.9)'; sx3.font='bold 10px monospace'; sx3.textAlign='center';
      sx3.fillText('SURVEILLANCE',64,16);
      sx3.fillStyle='rgba(0,200,60,0.4)';
      for(let l=0;l<4;l++) sx3.fillRect(8,28+l*12,112,8);
      const sm3=new THREE.Mesh(new THREE.PlaneGeometry(0.88,0.55),
        new THREE.MeshBasicMaterial({map:_CT(sc3)}));
      sm3.position.set(mx,y0+1.48,caCZ+2.47); scene.add(sm3);
    });
    // Chaise pivotante opérateur
    box(0.55,0.06,0.55,new THREE.MeshLambertMaterial({color:0x1a2840}),caCX,y0+0.48,caCZ+4.5);
    box(0.55,0.42,0.06,new THREE.MeshLambertMaterial({color:0x2a3850}),caCX,y0+0.68,caCZ+4.8);

    // Néons bleutés au plafond
    const mNeonSurv=new THREE.MeshBasicMaterial({color:0x4488cc,transparent:true,opacity:0.9});
    [caCX-5,caCX,caCX+5].forEach(lx=>{
      const l=new THREE.PointLight(0x2060a0,0.7,14);
      l.position.set(lx,yTop-0.4,caCZ); scene.add(l);
      const tube=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.07,0.12),mNeonSurv);
      tube.position.set(lx,yTop-0.06,caCZ); scene.add(tube);
    });
  }

  // ══════════════════════════════════════════════════════
  // ÉTAGE 3  (Y = 15 → 17) : Terrasse ouverte + grillage
  // ══════════════════════════════════════════════════════
  {
    const y0=FLOOR_H*3; // Y=15

    // Dalle béton terrasse (sol visible depuis l'extérieur)
    const mDalleT=new THREE.MeshLambertMaterial({color:0x6e7880});
    {const pl=new THREE.Mesh(new THREE.PlaneGeometry(caW+0.8,caD+0.8),mDalleT);
     pl.rotation.x=-Math.PI/2; pl.position.set(caCX,y0+0.08,caCZ); scene.add(pl);}

    // Acrotère (muret bas tout autour, style anime toit d'immeuble)
    const mAcro=new THREE.MeshLambertMaterial({color:0xb0b8c0});
    const acH=0.5, acT=0.35;
    box(caW+acT*2,acH,acT,mAcro,caCX,y0+acH/2,caZ2);  // avant
    box(caW+acT*2,acH,acT,mAcro,caCX,y0+acH/2,caZ1);  // fond
    // Acrotère gauche avec ouverture pour l'ascenseur
    {
      const hZ1=-123.35, hZ2=-120.35;
      const seg1D=Math.abs(hZ1-caZ1); if(seg1D>0.05) box(acT,acH,seg1D,mAcro,caX1,y0+acH/2,(caZ1+hZ1)/2);
      const seg2D=Math.abs(caZ2-hZ2); if(seg2D>0.05) box(acT,acH,seg2D,mAcro,caX1,y0+acH/2,(hZ2+caZ2)/2);
    }
    box(acT,acH,caD,mAcro,caX2,y0+acH/2,caCZ);         // droite

    // ── GRILLAGE STYLE ANIMÉ ─────────────────────────────────────
    // Poteaux galvanisés (cylindres fins) + nappes de grillage transparentes
    const mPost=new THREE.MeshLambertMaterial({color:0x8899aa});
    const mPostTop=new THREE.MeshLambertMaterial({color:0xaabbcc});
    const FENCE_H=2.2, POST_STEP=2.0;

    // Texture grillage losangé (style chain-link)
    function makeChainLinkTex(cellPx=16){
      const s=256, gc=document.createElement('canvas'); gc.width=s; gc.height=s;
      const gx=gc.getContext('2d');
      gx.clearRect(0,0,s,s);
      gx.strokeStyle='rgba(140,160,180,0.85)'; gx.lineWidth=2;
      const cp=cellPx;
      // Diagonales vers le haut-droite
      for(let i=-s;i<s*2;i+=cp){
        gx.beginPath(); gx.moveTo(i,0); gx.lineTo(i+s,s); gx.stroke();
        gx.beginPath(); gx.moveTo(i,0); gx.lineTo(i-s,s); gx.stroke();
      }
      const t=_CT(gc);
      t.wrapS=t.wrapT=THREE.RepeatWrapping;
      return t;
    }
    const clTex=makeChainLinkTex(16);

    function makeFenceSegZ(x1,x2,z,baseY){
      const w=x2-x1; if(w<0.1) return;
      // Nappes grillage
      const t=clTex.clone(); t.repeat.set(w*0.5,FENCE_H*0.5); t.needsUpdate=true;
      const m=new THREE.MeshLambertMaterial({map:t,transparent:true,opacity:0.85,side:THREE.DoubleSide,color:0x9db8cc});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,FENCE_H),m);
      mesh.position.set((x1+x2)/2,baseY+acH+FENCE_H/2,z); scene.add(mesh);
      // Fil supérieur renforcé
      box(w,0.06,0.06,mPost,(x1+x2)/2,baseY+acH+FENCE_H,z);
      // Poteaux
      for(let px3=x1;px3<=x2+0.1;px3+=POST_STEP){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,FENCE_H+acH,7),mPost);
        p.position.set(px3,baseY+(FENCE_H+acH)/2,z); scene.add(p);
        // Pointe de poteau style animé (cone court)
        const tip=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.15,7),mPostTop);
        tip.position.set(px3,baseY+acH+FENCE_H+0.075,z); scene.add(tip);
      }
    }
    function makeFenceSegX(x,z1,z2,baseY){
      const d=Math.abs(z2-z1); if(d<0.1) return;
      const t=clTex.clone(); t.repeat.set(d*0.5,FENCE_H*0.5); t.needsUpdate=true;
      const m=new THREE.MeshLambertMaterial({map:t,transparent:true,opacity:0.85,side:THREE.DoubleSide,color:0x9db8cc});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(d,FENCE_H),m);
      mesh.rotation.y=Math.PI/2; mesh.position.set(x,baseY+acH+FENCE_H/2,(z1+z2)/2); scene.add(mesh);
      box(0.06,0.06,d,mPost,x,baseY+acH+FENCE_H,(z1+z2)/2);
      for(let pz=z1;pz>=z2-0.1;pz-=POST_STEP){
        const p=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,FENCE_H+acH,7),mPost);
        p.position.set(x,baseY+(FENCE_H+acH)/2,pz); scene.add(p);
        const tip=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.15,7),mPostTop);
        tip.position.set(x,baseY+acH+FENCE_H+0.075,pz); scene.add(tip);
      }
    }

    // 4 côtés du grillage
    makeFenceSegZ(caX1,caX2,caZ2,y0);   // façade
    makeFenceSegZ(caX1,caX2,caZ1,y0);   // fond
    // Grillage gauche avec ouverture pour l'ascenseur (elZ1=-123.35 à elZ2=-120.35)
    makeFenceSegX(caX1,caZ2,-120.35,y0);   // gauche haut (façade à l'ouverture)
    makeFenceSegX(caX1,-123.35,caZ1,y0);   // gauche bas (ouverture au fond)
    makeFenceSegX(caX2,caZ2,caZ1,y0);   // droite

    // Quelques accessoires de toit style anime :
    // Château d'eau / cuve
    const mCuve=new THREE.MeshLambertMaterial({color:0x889aa8});
    const cuve=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,2.0,12),mCuve);
    cuve.position.set(caX1+3,y0+2.15,caZ1+3); cuve.castShadow=true; scene.add(cuve);
    const cuveTop=new THREE.Mesh(new THREE.CylinderGeometry(1.22,1.22,0.15,12),
      new THREE.MeshLambertMaterial({color:0x7a8898}));
    cuveTop.position.set(caX1+3,y0+3.23,caZ1+3); scene.add(cuveTop);
    // Tuyaux
    box(0.12,1.8,0.12,new THREE.MeshLambertMaterial({color:0x667788}),caX1+4.4,y0+0.98,caZ1+3);
    box(0.12,0.12,1.8,new THREE.MeshLambertMaterial({color:0x667788}),caX1+3,y0+0.55,caZ1+4.5);

    // Antenne radio (détail manga)
    const mAnt=new THREE.MeshLambertMaterial({color:0x445566});
    box(0.06,3.5,0.06,mAnt,caX2-2.5,y0+1.75,caZ1+2.5);
    box(0.8,0.04,0.04,mAnt,caX2-2.5,y0+3.5,caZ1+2.5);
    box(0.04,0.04,0.5,mAnt,caX2-2.5,y0+3.2,caZ1+2.5);
    // Petite lumière rouge clignotante (simulée)
    const mRed=new THREE.MeshBasicMaterial({color:0xff2020});
    const redLight=new THREE.Mesh(new THREE.SphereGeometry(0.07,6,5),mRed);
    redLight.position.set(caX2-2.5,y0+3.6,caZ1+2.5); scene.add(redLight);
    const rl=new THREE.PointLight(0xff1010,0.5,4);
    rl.position.set(caX2-2.5,y0+3.6,caZ1+2.5); scene.add(rl);

    // Caméra PTZ sur poteau (décoration)
    [caZ1+3, caZ2-3].forEach(pz=>{
      const mCamHousing=new THREE.MeshLambertMaterial({color:0x2a3040});
      box(0.06,1.5,0.06,mPost,caX2-1,y0+0.85,pz);  // potelet
      box(0.22,0.18,0.30,mCamHousing,caX2-1,y0+1.7,pz); // boîtier
      const mLens=new THREE.MeshBasicMaterial({color:0x002244});
      const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.12,10),mLens);
      lens.rotation.x=Math.PI/2; lens.position.set(caX2-1,y0+1.7,pz-0.22); scene.add(lens);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // ASCENSEUR MODERNE — gaine vitrée acier, cabine miroir, UI interactive
  // Gaine : X 3.35→5.85, Z -122.5→-119.5  (EXTÉRIEUR, côté gauche du bâtiment)
  // Face d'entrée X+ (elX2=5.85) superposée au mur gauche du bâtiment (caX1=6)
  // Paliers : RDC(y=0), 1F(y=FLOOR_H), 2F(y=FLOOR_H*2), Toit(y=FLOOR_H*3)
  // ═══════════════════════════════════════════════════════════════════
  {
    const elX1=3.65, elX2=6.15;
    const elZ1=-123.35, elZ2=-120.35;
    const elW=elX2-elX1, elD=Math.abs(elZ2-elZ1);
    const elCX=(elX1+elX2)/2, elCZ=(elZ1+elZ2)/2;
    const TOTAL_H=FLOOR_H*3+3.0;
    const openH=2.6; // hauteur ouverture palier

    // ─── Matériaux modernes ──────────────────────────────────────
    const mSteel  = new THREE.MeshLambertMaterial({color:0x8a8e92}); // acier gris neutre
    const mSteelD = new THREE.MeshLambertMaterial({color:0x4a4e52}); // cadres acier sombre
    const mShaftG = new THREE.MeshLambertMaterial({color:0xaabbcc,transparent:true,opacity:0.25,side:THREE.DoubleSide}); // verre gaine
    const mDoorMat= new THREE.MeshLambertMaterial({color:0x909498}); // portes acier gris
    const mMirror = new THREE.MeshLambertMaterial({color:0x7a7e82,side:THREE.DoubleSide}); // acier brossé gris

    // ─── Gaine : colonnes acier aux 4 coins ─────────────────────
    const colGeo=new THREE.BoxGeometry(0.14,TOTAL_H,0.14);
    [[elX1,elZ1],[elX1,elZ2],[elX2,elZ1],[elX2,elZ2]].forEach(([cx,cz])=>{
      const col=new THREE.Mesh(colGeo,mSteelD);
      col.position.set(cx,TOTAL_H/2,cz); scene.add(col);
    });
    // Rails verticaux (2 par face Z)
    [elZ1+0.1,elZ2-0.1].forEach(rz=>{
      const r=new THREE.Mesh(new THREE.BoxGeometry(0.06,TOTAL_H,0.06),mSteelD);
      r.position.set(elCX,TOTAL_H/2,rz); scene.add(r);
    });

    // Paroi gauche (X=elX1) — acier plein
    {const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,TOTAL_H,elD),mSteel);
     m.position.set(elX1,TOTAL_H/2,elCZ); scene.add(m);}
    // Paroi arrière (Z=elZ1) — acier plein
    {const m=new THREE.Mesh(new THREE.BoxGeometry(elW,TOTAL_H,0.09),mSteel);
     m.position.set(elCX,TOTAL_H/2,elZ1); scene.add(m);}

    // Toiture gaine
    {const m=new THREE.Mesh(new THREE.BoxGeometry(elW+0.2,0.18,elD+0.2),mSteelD);
     m.position.set(elCX,TOTAL_H+0.09,elCZ); scene.add(m);}

    // Face Z=elZ2 : mur plein (porte déplacée côté X+)
    {const m=new THREE.Mesh(new THREE.BoxGeometry(elW,TOTAL_H,0.09),mSteel);
     m.position.set(elCX,TOTAL_H/2,elZ2); scene.add(m);}

    // Face X+ (elX2) : ouvertures palier — nouvelle entrée côté cafétéria
    [0,FLOOR_H,FLOOR_H*2,FLOOR_H*3].forEach((yBase,i)=>{
      const bandH=FLOOR_H-openH;
      if(bandH>0.05){
        const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,bandH,elD),mSteel);
        m.position.set(elX2,yBase+openH+bandH/2,elCZ); scene.add(m);
      }
      if(i>0){
        const s=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.18,elD),mSteel);
        s.position.set(elX2,yBase+0.09,elCZ); scene.add(s);
      }
      [-elD/2+0.07, elD/2-0.07].forEach(dz=>{
        const f=new THREE.Mesh(new THREE.BoxGeometry(0.12,openH,0.12),mSteelD);
        f.position.set(elX2,yBase+openH/2,elCZ+dz); scene.add(f);
      });
    });

    // ─── Panneau d'étage lumineux au-dessus de chaque ouverture ──
    const FLOOR_LABELS=['RDC','1','2','T'];
    [0,FLOOR_H,FLOOR_H*2,FLOOR_H*3].forEach((yBase,i)=>{
      const cv=document.createElement('canvas'); cv.width=128; cv.height=48;
      const ctx=cv.getContext('2d');
      ctx.fillStyle='#000a14'; ctx.fillRect(0,0,128,48);
      ctx.fillStyle='#00eeff'; ctx.font='bold 28px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(FLOOR_LABELS[i],64,26);
      const lm=new THREE.Mesh(new THREE.PlaneGeometry(0.45,0.18),
        new THREE.MeshBasicMaterial({map:_CT(cv)}));
      lm.rotation.y=-Math.PI/2;
      lm.position.set(elX2-0.06,yBase+openH+0.12,elCZ);
      scene.add(lm);
    });


    // ─── Cabine (groupe animé, position = centre en X/Z, Y = hauteur palier) ──
    const cabGroup=new THREE.Group();
    cabGroup.position.set(elCX,0,elCZ);
    scene.add(cabGroup);

    const cabW=elW-0.20, cabD=elD-0.20, cabH=2.7;

    // Sol carrelé
    {const floorCv=document.createElement('canvas'); floorCv.width=128; floorCv.height=128;
     const fc=floorCv.getContext('2d');
     fc.fillStyle='#c8c0b8'; fc.fillRect(0,0,128,128);
     for(let r=0;r<4;r++) for(let c=0;c<4;c++){
       fc.fillStyle=(r+c)%2===0?'#ddd8d0':'#b8b0a8';
       fc.fillRect(c*32,r*32,31,31);
     }
     const f=new THREE.Mesh(new THREE.BoxGeometry(cabW,0.07,cabD),
       new THREE.MeshLambertMaterial({map:_CT(floorCv)}));
     f.position.set(0,0.035,0); cabGroup.add(f);}
    // Plafond blanc
    {const c=new THREE.Mesh(new THREE.BoxGeometry(cabW,0.07,cabD),
       new THREE.MeshLambertMaterial({color:0xeef2f8}));
     c.position.set(0,cabH,0); cabGroup.add(c);}

    // Mur gauche (X-) acier brossé — plein car pas de porte ici
    {const m=new THREE.Mesh(new THREE.BoxGeometry(0.07,cabH,cabD),mSteel);
     m.position.set(-cabW/2+0.035,cabH/2,0); cabGroup.add(m);}
    // Mur droit (X+) : pas de mur plein, c'est la face avec les portes
    // Mur avant (Z+) acier plein — ancienne face porte, maintenant fermée
    {const m=new THREE.Mesh(new THREE.BoxGeometry(cabW,cabH,0.06),mSteel);
     m.position.set(0,cabH/2,cabD/2-0.03); cabGroup.add(m);}
    // Mur arrière (Z=-) miroir
    {const m=new THREE.Mesh(new THREE.BoxGeometry(cabW,cabH,0.06),mMirror);
     m.position.set(0,cabH/2,-cabD/2+0.03); cabGroup.add(m);}
    // (mur droit X+ remplacé par les portes)

    // LED plafond
    {const led=new THREE.Mesh(new THREE.BoxGeometry(cabW*0.6,0.04,0.12),
       new THREE.MeshBasicMaterial({color:0xeef8ff}));
     led.position.set(0,cabH-0.02,0); cabGroup.add(led);}
    const cabLight=new THREE.PointLight(0xfff8f0,0.6,5);
    cabLight.position.set(0,cabH-0.2,0); cabGroup.add(cabLight);



    // Panneau boutons intérieur — canvas cliquable
    const btnCv=document.createElement('canvas'); btnCv.width=96; btnCv.height=256;
    const btnCtx=btnCv.getContext('2d');
    const btnTex=_CT(btnCv);
    // Panneau boutons — sur mur latéral Z-, décalé vers la porte (X+), face vers Z+
    const btnMesh=new THREE.Mesh(new THREE.PlaneGeometry(0.28,0.74),
      new THREE.MeshBasicMaterial({map:btnTex,side:THREE.DoubleSide}));
    btnMesh.rotation.y=0; // face vers Z+ (vers l'intérieur / la porte)
    btnMesh.position.set(cabW*0.25, 1.22, -cabD/2+0.09); cabGroup.add(btnMesh);

    // Boutons Y positions sur le canvas (pour raycaster UV)
    const BTN_FLOORS=[{lbl:'RDC',floor:0},{lbl:'1F',floor:1},{lbl:'2F',floor:2},{lbl:'Toit',floor:3}];
    const BTN_CY=[60,108,156,204]; // centres Y dans le canvas 256px

    let pressedFloor=-1;
    function redrawBtnPanel(curFloor){
      const c=btnCtx, w=96, h=256;
      c.fillStyle='#080e18'; c.fillRect(0,0,w,h);
      c.strokeStyle='#223344'; c.lineWidth=2; c.strokeRect(3,3,w-6,h-6);
      // Afficheur étage actuel
      c.fillStyle='#001a0a'; c.fillRect(8,8,w-16,28);
      c.strokeStyle='#00aa44'; c.lineWidth=1; c.strokeRect(8,8,w-16,28);
      c.fillStyle='#00ff88'; c.font='bold 16px monospace'; c.textAlign='center';
      c.fillText(FLOOR_LABELS[curFloor],w/2,28);
      // Boutons cliquables
      BTN_FLOORS.forEach(({lbl,floor},i)=>{
        const by=BTN_CY[i], r=17;
        const active=(floor===curFloor);
        const pressed=(floor===pressedFloor);
        c.fillStyle=pressed?'#ffffff':active?'#e8b020':'#162030';
        c.beginPath(); c.arc(w/2,by,r,0,Math.PI*2); c.fill();
        c.strokeStyle=pressed?'#ffffff':active?'#ffd040':'#336699'; c.lineWidth=2.5;
        c.beginPath(); c.arc(w/2,by,r,0,Math.PI*2); c.stroke();
        c.fillStyle=pressed?'#000':active?'#0a0600':'#99ccee';
        c.font='bold 10px monospace'; c.textAlign='center'; c.textBaseline='middle';
        c.fillText(lbl,w/2,by);
      });
      btnTex.needsUpdate=true;
    }
    redrawBtnPanel(0);

    // ─── Portes coulissantes (face X+ de la cabine, côté cafétéria) ────────
    const doorHalf=(cabD-0.08)/2;
    const DOOR_SLIDE=doorHalf*0.95;
    const door1=new THREE.Mesh(new THREE.BoxGeometry(0.08,cabH-0.08,doorHalf),mDoorMat);
    door1.position.set(cabW/2,cabH/2,-(doorHalf/2+0.01)); cabGroup.add(door1);
    const door2=new THREE.Mesh(new THREE.BoxGeometry(0.08,cabH-0.08,doorHalf),mDoorMat);
    door2.position.set(cabW/2,cabH/2, (doorHalf/2+0.01)); cabGroup.add(door2);


    // ─── Logique ascenseur ───────────────────────────────────────
    const ELEV_FLOORS=[0,FLOOR_H,FLOOR_H*2,FLOOR_H*3];
    let elevCurFloor=0, elevTargetY=0;
    let elevMoving=false;
    let elevDoorState=0; // 0=fermé 1=ouvert (smooth via lerp)
    let elevDoorTimer=0;
    let elevDoorTarget=0; // 0 ou 1

    function elevOpenDoors(){
      elevDoorTarget=1; elevDoorTimer=6.0;
    }
    function elevCloseDoors(){
      elevDoorTarget=0;
    }
    function elevGoTo(floorIdx){
      if(floorIdx<0||floorIdx>3||elevMoving) return;
      if(floorIdx===elevCurFloor){
        if(elevDoorTarget===0) elevOpenDoors();
        return;
      }
      elevCloseDoors();
      // Attendre que les portes soient fermées avant de bouger
      setTimeout(()=>{
        elevCurFloor=floorIdx;
        elevTargetY=ELEV_FLOORS[floorIdx];
        elevMoving=true;
      },400);
    }
    _W._elevCallFloor=elevGoTo;
    _W._elevCurFloor=()=>elevCurFloor;
    _W._elevPos={x1:elX1,x2:elX2,z1:elZ1,z2:elZ2,cx:elCX,cz:elCZ};

    // Ticker principal ascenseur
    const _prevTickElev=_W.tickAutoSpeech;
    _W.tickAutoSpeech=function(dt){
      if(_prevTickElev) _prevTickElev(dt);

      // Animation portes (lerp fluide)
      const prevDoorState=elevDoorState;
      elevDoorState+=(elevDoorTarget-elevDoorState)*Math.min(1,dt*7);
      if(Math.abs(elevDoorState-elevDoorTarget)<0.002) elevDoorState=elevDoorTarget;
      door1.position.z=-(doorHalf/2+0.01+DOOR_SLIDE*elevDoorState);
      door2.position.z= (doorHalf/2+0.01+DOOR_SLIDE*elevDoorState);

      // Timer fermeture auto
      if(elevDoorTarget===1 && !elevMoving){
        elevDoorTimer-=dt;
        if(elevDoorTimer<=0) elevCloseDoors();
      }

      // Déplacement cabine
      if(elevMoving){
        const dy=elevTargetY-cabGroup.position.y;
        if(Math.abs(dy)<0.04){
          cabGroup.position.y=elevTargetY;
          elevMoving=false;
          redrawBtnPanel(elevCurFloor);
          setTimeout(()=>elevOpenDoors(),200);
        } else {
          cabGroup.position.y+=Math.sign(dy)*Math.min(4.5*dt,Math.abs(dy));
        }
      }

      // Entraîner le joueur dans la cabine
      const cam=camera;
      const inCab2=(cam.position.x>elX1+0.08&&cam.position.x<elX2-0.08
                 && cam.position.z>elZ1+0.08&&cam.position.z<elZ2-0.08);
      if(inCab2 && elevMoving){
        cam.position.y=cabGroup.position.y+1.7;
      }
      // Si le joueur sort à un autre étage, synchroniser son Y
      if(!inCab2 && !elevMoving){
        // rien, le joueur peut sortir librement
      }
    };

    // Ticker — colle le joueur au sol de la cabine quand il est dedans
    const _prevTickElev2=_W.tickAutoSpeech;
    _W.tickAutoSpeech=function(dt){
      if(_prevTickElev2) _prevTickElev2(dt);
      const cam=camera;
      const inCabTp=(cam.position.x>elX1+0.08&&cam.position.x<elX2-0.08
                  && cam.position.z>elZ1+0.08&&cam.position.z<elZ2-0.08);
      if(inCabTp) cam.position.y=cabGroup.position.y+1.7;
    };

    // ─── Bouton d'appel extérieur — sur mur latéral Z2 (côté droit de l'entrée) ───
    const callButton3D=[];
    [0,FLOOR_H,FLOOR_H*2,FLOOR_H*3].forEach((yBase,i)=>{
      const cv=document.createElement('canvas'); cv.width=80; cv.height=80;
      function drawCallBtn(ctx, lit){
        ctx.fillStyle='#0a1018'; ctx.fillRect(0,0,80,80);
        ctx.strokeStyle='#445566'; ctx.lineWidth=2; ctx.strokeRect(2,2,76,76);
        ctx.fillStyle=lit?'#ffcc00':'#112233';
        ctx.beginPath(); ctx.arc(40,40,22,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=lit?'#ffd040':'#4488bb'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(40,40,22,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=lit?'#000':'#aaddff';
        ctx.font='bold 18px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('▲',40,40);
      }
      const ctx=cv.getContext('2d'); drawCallBtn(ctx,false);
      const tex=_CT(cv);
      const btn=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.28,0.04),
        new THREE.MeshBasicMaterial({map:tex}));
      // Collé sur la face X+ du montant droit de l'encadrement (pilier Z1-side)
      btn.position.set(elX2+0.08, yBase+1.2, elZ1+0.03);
      btn.rotation.y=-Math.PI/2;
      scene.add(btn);
      callButton3D.push({mesh:btn, floor:i, canvas:cv, ctx, tex, drawCallBtn});
    });

    // Raycaster — clic sur panneau intérieur OU bouton appel extérieur
    const elevRaycaster=new THREE.Raycaster();
    _listen(window,'click',function(e){ if(!_active) return;
      elevRaycaster.setFromCamera(
        new THREE.Vector2((e.clientX/window.innerWidth)*2-1, -(e.clientY/(window.innerHeight-70))*2+1),
        REALCAM
      );
      // Panneau intérieur
      const hits=elevRaycaster.intersectObject(btnMesh);
      if(hits.length>0){
        const uv=hits[0].uv;
        const canvasY=(1-uv.y)*256;
        const canvasX=uv.x*96;
        const hit=BTN_FLOORS.find((_,i)=>Math.abs(canvasY-BTN_CY[i])<20 && Math.abs(canvasX-48)<24);
        if(hit){
          pressedFloor=hit.floor;
          redrawBtnPanel(_W._elevCurFloor ? _W._elevCurFloor() : 0);
          setTimeout(()=>{ pressedFloor=-1; redrawBtnPanel(_W._elevCurFloor ? _W._elevCurFloor() : 0); },300);
          _W._elevCallFloor(hit.floor);
        }
      }
      // Bouton appel extérieur
      const extHits=elevRaycaster.intersectObjects(callButton3D.map(b=>b.mesh));
      if(extHits.length>0){
        const found=callButton3D.find(b=>b.mesh===extHits[0].object);
        if(found){
          found.drawCallBtn(found.ctx,true); found.tex.needsUpdate=true;
          setTimeout(()=>{found.drawCallBtn(found.ctx,false); found.tex.needsUpdate=true;},400);
          _W._elevCallFloor(found.floor);
        }
      }
    });
  }
}


// ─── FIN COUR ARRIÈRE ──────────────────────────────────────────────────

// ─── SYSTÈME DE COLLISION AABB ──────────────────────────────
const PLAYER_R = 0.35;

// Chaque collider: {x1,x2,z1,z2}  (x1<x2, z1<z2)
// doorColliders: {x1,x2,z1,z2,doorId} → actif seulement porte FERMÉE
const staticColliders = [];
const doorColliders   = [];

function sBox(x1,z1,x2,z2){ staticColliders.push({x1,z1,x2,z2}); }
function dBox(x1,z1,x2,z2,id){ doorColliders.push({x1,z1,x2,z2,doorId:id}); }

// ── helpers pour murs ──
function sWallX(cx,cz,w,d){ sBox(cx-w/2, cz-d/2, cx+w/2, cz+d/2); }
function dWallX(cx,cz,w,d,id){ dBox(cx-w/2, cz-d/2, cx+w/2, cz+d/2, id); }

// ════════════════════════════════════
// MUR Z=+18 (façade portail côté cour)
// ════════════════════════════════════
// Mur gauche  X=-24 à -8.9 (pilier gauche portail)
sBox(-24, 17.75, -8.9, 18.25);
// Pilier gauche portail
sBox(-9.0, 16.6, -7.1, 19.0);
// Pilier droit portail
sBox( 7.1, 16.6,  9.0, 19.0);
// Mur droit X=8.9 à 24
sBox( 8.9, 17.75, 24.0, 18.25);
// Fermetures entre X=24↔27 et X=-24↔-27
sBox(-27.0, 17.75, -24.0, 18.25);
sBox( 24.0, 17.75,  27.0, 18.25);
// Fermetures 2e couloir X=27↔36
sBox(-36.0, 17.75, -27.0, 18.25);
sBox( 27.0, 17.75,  36.0, 18.25);
// Passage portail principal (entre les piliers X=-7.1 à +7.1) — bloqué seulement quand portail fermé
dBox(-7.1, 17.5, 7.1, 19.0, 'mainGate');

// ════════════════════════════════════
// MURS LATÉRAUX X=-24 et X=+24
// ════════════════════════════════════
// Porte gauche : Z=-10, ouverture de -11.5 à -8.5
// Porte droite : Z=-10, ouverture de -11.5 à -8.5
// Côté court Z=-19.5 à -11.75 : plein
sBox(-24.2, -19.5, -23.8, -11.75);
sBox( 23.8, -19.5,  24.2, -11.75);
// Côté long : avant trou de porte : Z=-11.5 à -8.25 (il n'y a pas de mur ici, c'est le trou porte)
// Z=-8.25 à +13.6 (pas de trou ici dans le côté long, c'est plein)
// ATTENTION: la porte latérale est dans le mur X=-24 à Z=-10
// Segment Z=-19.5 à -11.5 déjà couvert (côté court)
// Côté long : on part de Z=-8.5 côté cour (après le trou porte)
sBox(-24.2, -8.5,  -23.8, 13.6);   // plein (après trou porte gauche)
sBox( 23.8, -8.5,   24.2, 13.6);   // plein (après trou porte droite)
sBox(-24.2, 13.6,  -23.8, 18.0);   // plein (Z=13.6 à 18)
sBox( 23.8, 13.6,   24.2, 18.0);
// Trou porte gauche Z=-11.5 à -8.5 → doorCollider
dBox(-24.2, -11.5, -23.8, -8.5, 'left');
dBox( 23.8, -11.5,  24.2, -8.5, 'right');

// ════════════════════════════════════
// MURS COULOIR EN U : X=-27 et X=+27
// ════════════════════════════════════
// Porte endLeft/Right : Z=15.8, ouverture de 13.9 à 17.7
sBox(-27.2, -27.0, -26.8, 13.9);   // plein avant trou
dBox(-27.2,  13.9, -26.8, 17.7, 'endLeft');
sBox(-27.2,  17.7, -26.8, 18.1);   // plein après trou
sBox( 26.8, -27.0,  27.2, 13.9);
dBox( 26.8,  13.9,  27.2, 17.7, 'endRight');
sBox( 26.8,  17.7,  27.2, 18.1);

// ════════════════════════════════════
// MURS EXTÉRIEURS 2e COULOIR X=±36
// ════════════════════════════════════
sBox(-36.2, -27.0, -35.8, 18.1);
sBox( 35.8, -27.0,  36.2, 18.1);

// ════════════════════════════════════
// MUR ARRIÈRE Z=-27
// Porte fond : X=-2.2 à +2.2 (id 'back')
// ════════════════════════════════════
// Segment 2e couloir gauche X=-36 à -27
sBox(-36.0, -27.2, -27.0, -26.8);
// Bout extérieur gauche X=-27 à -25.5
sBox(-27.0, -27.2, -25.5, -26.8);
// trou gauche X=-25.5 à -13.5 (ouverture vers chambre)
// Porte mystery dans ce trou centrée en X=-22.35, largeur 3.4 → ouverture -24.05 à -20.65
sBox(-25.5, -27.2, -24.05, -26.8);
dBox(-24.05, -27.2, -20.65, -26.8, 'mystery');
// Ouverture escalier à X=-17.91 (largeur 3.0) : X=-19.41 à -16.41
sBox(-20.65, -27.2, -19.41, -26.8); // gauche (X=-20.65 à -19.41)
sBox(-16.41, -27.2, -13.5,  -26.8); // droite (X=-16.41 à -13.5)
// Fermeture du reste du "trou" : X=-13.5 à -12.23 (mur plein, pas d'ouverture ici)
sBox(-13.5, -27.2, -12.23, -26.8);
// Segment plein gauche X=-12.23 à -2.2
sBox(-12.23, -27.2,  -2.2, -26.8);
// Trou porte fond
dBox( -2.2, -27.2,   2.2, -26.8, 'back');
// Segment plein droit X=+2.2 à +13.5
sBox(  2.2, -27.2,  13.5, -26.8);
// trou droit X=+13.5 à +25.5 → Porte Sortie (X≈17.2, larg 2.2) + Porte Toilette (X≈22.5, larg 2.2)
sBox( 13.5, -27.2,  16.1, -26.8);
dBox( 16.1, -27.2,  18.3, -26.8, 'sortie');
sBox( 18.3, -27.2,  21.4, -26.8);
dBox( 21.4, -27.2,  23.6, -26.8, 'toilette');
sBox( 23.6, -27.2,  25.5, -26.8);
// Bout extérieur droit X=+25.5 à +27
sBox( 25.5, -27.2,  27.0, -26.8);
sBox( 25.5, -27.2,  27.0, -26.8);
// Segment 2e couloir droit X=+27 à +36
sBox( 27.0, -27.2,  36.0, -26.8);

// ════════════════════════════════════
// CHAMBRE (Z=-27 à -35.5, X=-20.21 à +14.80)
// Mur avant : segments côtés du trou porte (trou déjà géré par 'back' ci-dessus)
// ════════════════════════════════════
// Côté droit du trou : X=+2.2 à +14.80
sBox(  2.2,  -27.2,  14.80,-26.8);
// Mur gauche chambre
sBox(-20.41, -35.5, -20.01, -27.0);
// Mur droit chambre
sBox( 14.60, -35.5,  15.00, -27.0);
// Mur fond chambre
sBox(-20.21, -35.7,  14.80, -35.3);

// ════════════════════════════════════
// CAGE D'ESCALIER (X=-20.21 à -12.23, Z=-27 à -35.5)
// ════════════════════════════════════
// Mur gauche cage escalier X=-20.21 (partagé avec chambre)
sBox(-20.41, -35.5, -20.01, -27.0);
// Mur droit cage escalier X=-12.23
sBox(-12.43, -35.5, -12.03, -27.0);
// Mur fond cage escalier Z=-35.5
sBox(-20.21, -35.7, -12.23, -35.3);
// Mur avant cage escalier Z=-27 côté RDC : ouverture X=-19.41 à -16.41 seulement
sBox(-20.21, -27.2, -19.41, -26.8); // segment gauche fermé
sBox(-16.41, -27.2, -12.23, -26.8); // segment droit fermé

// ════════════════════════════════════
// SALLE DES TOILETTES (X=20.65→35.25, Z=-27→-35.30)
// ════════════════════════════════════
// Mur gauche (X=20.65)
sBox( 20.45, -35.3,  20.85, -27.0);
// Mur droit (X=35.25)
sBox( 35.05, -35.3,  35.45, -27.0);
// Mur fond (Z=-35.30)
sBox( 20.65, -35.5,  35.25, -35.10);
// Mur avant — segments autour de la porte toilette (X=22.5 ± 1.1)
// Segment X=20.65 → 21.4 (avant porte)
sBox( 20.65, -27.2,  21.40, -26.8);
// Segment X=23.6 → 35.25 (après porte)
sBox( 23.60, -27.2,  35.25, -26.8);

// ════════════════════════════════════
// FAÇADE BÂTIMENT PRINCIPAL Z=-19.5
// Seulement X=-24 à +24 (les couloirs X=±24↔27 sont ouverts)
// ════════════════════════════════════
// Façade gauche: X=-24 à -2.4
sBox(-24.0, -19.8, -2.4, -19.2);
// Porte monumentale principale
dBox(  -3.0, -19.8,  3.0, -19.2, 'mainPorte');
// Façade droite: X=+2.4 à +24
sBox(   2.4, -19.8, 24.0, -19.2);

// Piliers porte principale
sBox(-3.0, -19.9, -1.8, -18.9);
sBox( 1.8, -19.9,  3.0, -18.9);

// ════════════════════════════════════
// COUR ARRIÈRE CLÔTURÉE
// X=-27..+27, Z=-27.5..-147.5
// Seule sortie = porte cadenas X≈17.46 sur mur arrière Z=-147.5
// ════════════════════════════════════
// Mur gauche (X=-27, Z=-147.5 → -27.5)
sBox(-27.1, -147.5, -26.9, -27.5);
// Mur droit (X=+27, Z=-147.5 → -27.5)
sBox( 26.9, -147.5,  27.1, -27.5);
// Mur arrière gauche (Z=-147.5, X=-27 → 16.66)
sBox(-27.0, -147.6,  16.66, -147.4);
// Porte cadenas : ouvrable (doorCollider 'fenceGate')
dBox( 16.66, -147.6, 18.26, -147.4, 'fenceGate');
// Mur arrière droit (Z=-147.5, X=18.26 → +27)
sBox( 18.26, -147.6, 27.0, -147.4);

// ════════════════════════════════════
// ARBRES (troncs ~0.28 rayon)
// ════════════════════════════════════
const _tp = [];
[-1,1].forEach(s=>{ [-2,-7,-13,5,10].forEach(tz=>_tp.push([s*5.5,tz])); });
[-1,1].forEach(s=>{ const tz=-10+s*5.5; [-5,-11,-17,5,11,17].forEach(tx=>_tp.push([tx,tz])); });
_tp.forEach(([tx,tz])=>sBox(tx-0.28, tz-0.28, tx+0.28, tz+0.28));

// ════════════════════════════════════
// BANCS
// ════════════════════════════════════
sBox(-4.8,  6.8, -4.2,  9.2);  // banc gauche
sBox( 4.2,  6.8,  4.8,  9.2);  // banc droit
sBox(-14.2,-7.1, -11.8,-5.9);  // banc gauche fond
sBox( 11.8,-7.1,  14.2,-5.9);  // banc droit fond

// ════════════════════════════════════
// LAMPADAIRES
// ════════════════════════════════════
sBox(-16.15,-2.15,-15.85,-1.85);
sBox( 15.85,-2.15, 16.15,-1.85);
sBox(-16.15,-18.15,-15.85,-17.85);
sBox( 15.85,-18.15, 16.15,-17.85);

// ════════════════════════════════════
// TABLEAU D'AFFICHAGE (poteaux)
// ════════════════════════════════════
sBox(3.85, 0.8, 4.15, 5.4);

// ════════════════════════════════════
// RÉSOLUTION : séparer axe X et axe Z
// pour éviter qu'un mur ne "pompe" le joueur dans un autre
// ════════════════════════════════════
function collidesBox(px, pz, b){
  const r = PLAYER_R;
  return px > b.x1-r && px < b.x2+r && pz > b.z1-r && pz < b.z2+r;
}
function pushOutBox(px, pz, b){
  const r = PLAYER_R;
  const dL = px - (b.x1 - r);
  const dR = (b.x2 + r) - px;
  const dF = pz - (b.z1 - r);
  const dB = (b.z2 + r) - pz;
  const m = Math.min(dL, dR, dF, dB);
  if(m === dL) px = b.x1 - r;
  else if(m === dR) px = b.x2 + r;
  else if(m === dF) pz = b.z1 - r;
  else              pz = b.z2 + r;
  return [px, pz];
}

function isOpen(doorId){
  if(doorId === 'mainGate') return gateOpen;
  const door = DOORS.find(d => d.id === doorId);
  return door && door.open;
}

function resolveCollisions(px, pz){
  // Essayer mouvement X seul, puis Z seul pour éviter le "glissement" indésirable
  // On passe 2 fois pour rattraper les coins
  const onUpper = camera.position.y > 4.5; // joueur au 1er étage
  for(let pass=0; pass<2; pass++){
    for(const b of staticColliders){
      // Les colliders du mur Z=-27 (zone -27.2 à -26.8) ne bloquent pas au 1er étage
      if(onUpper && b.z1 >= -27.3 && b.z2 <= -26.7) continue;
      if(collidesBox(px,pz,b)) [px,pz] = pushOutBox(px,pz,b);
    }
    for(const b of doorColliders){
      if(isOpen(b.doorId)) continue;
      if(onUpper && b.z1 >= -27.3 && b.z2 <= -26.7) continue;
      // Au 1er étage, les portes endLeft/endRight (RDC) ne bloquent pas
      if(onUpper && (b.doorId === 'endLeft' || b.doorId === 'endRight')) continue;
      if(collidesBox(px,pz,b)) [px,pz] = pushOutBox(px,pz,b);
    }
    // surveillant dynamique
    const gr=0.42, gx=gardener.position.x, gz=gardener.position.z;
    const gb={x1:gx-gr,z1:gz-gr,x2:gx+gr,z2:gz+gr};
    if(collidesBox(px,pz,gb)) [px,pz] = pushOutBox(px,pz,gb);
  }
  return [px, pz];
}


// ─── fin du décor : on prépare les deux états (lycée visible / caché) pour éviter un à-coup en route ───
try {
  const v = root.visible;
  root.visible = true;  renderer.compile(parentScene, REALCAM);
  root.visible = false; renderer.compile(parentScene, REALCAM);
  root.visible = v;
} catch(e) {}

// ═══════════════════════════════════════════════════════════════════════
// MISE À JOUR (appelée à chaque image par le monde)
// ═══════════════════════════════════════════════════════════════════════

// Étage / escalier / ascenseur : hauteur du sol à (px,pz) (repère du lycée)
function floorYAt(px, pz){
    // Paramètres escalier (identiques à la construction)
    const nSteps = 8, stepH = 0.3125, stepD = 0.75;
    const v1Xcenter = -18.46, v1Zstart = -27.6;
    const landingY = nSteps * stepH; // 2.5
    const landingZend   = -33.6;  // fin V1
    const landingZstart = -35.3;  // bord fond palier
    const v2Xcenter = -13.98;
    const v2Zstart  = -33.6;     // V2 repart depuis Z=-33.6 vers Z+
    const stairW = 1.8;
    const FL = 5;

    function getFloorY(){
      const currentY = camera.position.y;
      const onUpperFloor = currentY > 6.0;

      // Si le joueur est complètement dehors du lycée, sol = 0
      const outsideSchool = pz > 20 || pz < -150 || px < -40 || px > 40;
      if(outsideSchool) return 0;

      // ── ESCALIER prioritaire ──

      // Volée 1 : Z=-27.6 → -33.6, côté gauche
      const v1Zend = v1Zstart - nSteps * stepD; // -33.6
      if(px >= -20.21 && px <= -16.8 && pz >= v1Zend && pz <= -27.6){
        const progress = (v1Zstart - pz) / (nSteps * stepD);
        return Math.max(0, Math.min(1, progress)) * landingY;
      }

      // Palier : Z=-35.3 à -33.6, toute la largeur
      if(px >= -20.21 && px <= -12.23 && pz >= -35.3 && pz <= -33.6){
        return landingY;
      }

      // Volée 2 : Z=-33.6 → -27.6, côté droit
      const v2Zend = v2Zstart + nSteps * stepD; // -33.6 + 6.0 = -27.6
      if(px >= -16.8 && px <= -12.23 && pz >= v2Zstart && pz <= v2Zend){
        const progress = (pz - v2Zstart) / (nSteps * stepD);
        return landingY + Math.max(0, Math.min(1, progress)) * landingY;
      }

      // Transition sortie V2 → 1er étage
      if(px >= -16.5 && px <= -12.23 && pz >= -28.5 && pz <= -27.0){
        return FL;
      }

      // ── ASCENSEUR : étages cantine ──
      const elevFloor = _W._elevCurFloor ? _W._elevCurFloor() : 0;
      const elevFloorY = elevFloor * 5; // FLOOR_H=5
      // Zone cabine
      if(px > 3.65 && px < 6.15 && pz > -123.35 && pz < -120.35) return elevFloorY;
      // Étages 1, 2, toit : toute la surface du bâtiment cantine (X 6→26, Z -145→-120)
      if(elevFloor > 0 && px > 6 && px < 26 && pz > -145 && pz < -120){
        return elevFloorY;
      }


      if(onUpperFloor){
        if(px >= -36 && px <= -24 && pz >= -27 && pz <= 18) return FL;
        if(px >= 24  && px <= 36  && pz >= -27 && pz <= 18) return FL;
        if(px >= -24 && px <= 24  && pz >= -27 && pz <= -19.5) return FL;
        if(px >= -36 && px <= 36  && pz >= -35.5 && pz <= -27) return FL; // bibliothèque
      }

      return 0;
    }

    return getFloorY();
}

function inCompound(x, z){ return x > -45 && x < 45 && z > -158 && z < 30; }
function nearSecret(x, z){ return Math.hypot(x - 120, z + 375) < 75; }

let _wasDialog = false;
const _camPos2D = new THREE.Vector3();
const _dialogPos = new THREE.Vector3();
let _frame = 0, _clockSec = -1, _iaCache = null, _actKey = '', _actFn = null;
const IA_NONE = null;

function toggleDoor(){
  if(!activeDoor) return;
  activeDoor.open = !activeDoor.open;
  activeDoor.targetAngle = activeDoor.open ? 1 : 0;
}

// Un seul bouton d'action (celui du jeu) : on affiche la meilleure action possible
function refreshAction(){
  let key = '', label = '', fn = null;
  if(isSeated){ key='stand'; label='🧍 Se lever'; fn=standUp; }
  else if(chalkMode){ key='chalk'; label='🖍️ Quitter la craie'; fn=exitChalk; }
  else if(brendard.inDialogue){ /* rien pendant la discussion */ }
  else if(brendard.isNear()){ key='talk'; label='💬 Parler à M. Brendard'; fn=()=>brendard.openChat(); }
  else {
    if(_frame % 3 === 0) _iaCache = getNearInteractable();
    const ia = _iaCache;
    if(ia){ key='ia:'+ia.type; label=(IA_LABELS[ia.type]||'Interagir'); fn=doInteract; }
    else if(activeDoor){ key='door:'+(activeDoor.open?'close':'open'); label=activeDoor.open?'🚪 Fermer la porte':'🖐️ Ouvrir la porte'; fn=toggleDoor; }
  }
  _actFn = fn;
  if(!key){ if(_actKey){ _action.hide(); _actKey=''; } return; }
  if(key !== _actKey){ _actKey = key; _action.show(label, ()=>{ if(_actFn) _actFn(); }); }
}

function update(dt, time){
  // joueur -> repère du lycée
  camera.position.copy(REALCAM.position).sub(ORIGIN);
  const dist = Math.hypot(camera.position.x - CENTER.x, camera.position.z - CENTER.z);

  applyDay(dist);

  // loin du lycée : on ne dessine ni ne simule rien
  const near = STANDALONE || dist < ACTIVE_DIST;
  if(near !== root.visible) root.visible = near;
  _active = near;
  if(!near){
    if(_actKey){ _action.hide(); _actKey=''; }
    brendard.hideUI();
    return;
  }

  _frame++;
  const ts = performance.now();

  const busy = !!(OPTS.isBusy && OPTS.isBusy());
  const inZone = !busy && (STANDALONE || inCompound(camera.position.x, camera.position.z) || nearSecret(camera.position.x, camera.position.z));

  if(inZone){
    if(isSeated){
      camera.position.set(seatedPos.x, seatedPos.y, seatedPos.z);
    } else if(brendard.inDialogue){
      if(!_wasDialog) _dialogPos.copy(camera.position);
      camera.position.set(_dialogPos.x, camera.position.y, _dialogPos.z);
    } else {
      const floorY = floorYAt(camera.position.x, camera.position.z);
      camera.position.y = floorY + 1.7;
      const [nx, nz] = resolveCollisions(camera.position.x, camera.position.z);
      camera.position.x = nx;
      camera.position.z = nz;
    }
  }
  _wasDialog = brendard.inDialogue;

  // ciel + oiseaux suivent le joueur
  skySphere.position.set(camera.position.x, 0, camera.position.z);
  {
    // Animation oiseaux
    birdFlock.forEach((b, i) => {
      b.angle += (b.speed * 0.008 + i*0.001) * dt;
      b.x = Math.sin(b.angle * 0.7 + b.phase) * b.radius + camera.position.x;
      b.z = Math.cos(b.angle * 0.5 + b.phase) * b.radius + camera.position.z - 80;
      b.y = 15 + Math.sin(b.angle*1.2) * 5 + i*2.5;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.rotation.y = b.angle * 0.7 + b.phase + Math.PI/2;
      // Battement d'ailes
      b.wingPhase += dt * 4;
      const flap = Math.sin(b.wingPhase) * 0.4;
      b.lw.rotation.z =  flap;
      b.rw.rotation.z = -flap;
    });
  }

  // portes + portail
  // ─── PORTES : proximité + animation ──────────────────────────
  _camPos2D.set(camera.position.x, camera.position.y, camera.position.z);
  // Détermine si le joueur est au 1er étage (y > 4.5) ou au rez-de-chaussée
  const playerOnUpper = camera.position.y > 4.5;
  let nearDoor = null;
  let nearDist = Infinity;
  DOORS.forEach(door=>{
    // Ne pas activer une porte d'un étage différent de celui du joueur
    const doorOnUpper = door.floor === 1;
    if(playerOnUpper !== doorOnUpper) return;
    // Porte principale : rayon plus grand car le joueur s'en approche via les marches
    const radius = door.id==='main' ? 5.5 : 4.5;
    const dist = _camPos2D.distanceTo(door.pos);
    if(dist < radius && dist < nearDist){ nearDoor = door; nearDist = dist; }
  });

  DOORS.forEach(door=>{
    const isNear = door === nearDoor;
    if(isNear !== door.highlighted){
      door.highlighted = isNear;
      door.leaves.forEach(lf=>{ if(lf.glowMesh) lf.glowMesh.visible = isNear; });
    }
    door.animAngle += (door.targetAngle - door.animAngle) * Math.min(dt*4, 1);
    const t = door.animAngle;
    if(door.id === 'main' || door.id === 'back' || door.id === 'mystery' || door.id === 'mainPorte' || door.id === 'sortie' || door.id === 'toilette' || door.id === 'biblio'){
      // Porte dans plan XY, pivote autour de Y (charnière verticale sur bord X)
      door.leaves.forEach(lf=>{
        lf.pivot.rotation.y = lf.side * t * Math.PI * 0.46;
      });
    } else {
      // Portes latérales dans plan YZ, pivote autour de Y (charnière sur bord Z)
      door.leaves.forEach(lf=>{
        lf.pivot.rotation.y = lf.lr * door.outDir * t * Math.PI * 0.46;
      });
    }
  });


  // ─── PORTAIL DE FER : animation ──────────────────────────────
  gateAngle += (gateTargetAngle - gateAngle) * Math.min(dt * 1.5, 1);
  // Ouverture vers l'intérieur (Z-) : pivot gauche rotation positive, droit négative
  gateLeftPivot.rotation.y  =  gateAngle * Math.PI * 0.46;
  gateRightPivot.rotation.y = -gateAngle * Math.PI * 0.46;


  if(nearDoor !== activeDoor) activeDoor = nearDoor;

  // M. Brendard
  brendard.update(dt, ts);

  // horloge, ascenseur
  (_W.tickAutoSpeech||tickAutoSpeech)(dt);
  if(Math.floor(ts/1000) !== _clockSec){ _clockSec = Math.floor(ts/1000); drawClock(); }

  if(inZone) _flushPlayer();
  refreshAction();
}

// ─── CARTE (icônes du jeu) ───────────────────────────────────────────────
function getMapPois(){
  return [{ type:'city', x: ORIGIN.x - PARENT_OFF.x, z: ORIGIN.z - PARENT_OFF.z + 18 }];   // pictogramme « bâtiment » devant le portail
}

function getMapData(){
  const ox = ORIGIN.x - PARENT_OFF.x, oz = ORIGIN.z - PARENT_OFF.z;
  const W = (x, z) => [x + ox, z + oz];
  return {
    bounds: { x0: ox - 120, x1: ox + 120, z0: oz - 200, z1: oz + 60 },
    roads: [
      { w: 1.2, pts: [W(-27,18), W(27,18), W(27,-147), W(-27,-147), W(-27,18)] },   // enceinte
      { w: 7,   pts: [W(-27,-24), W(27,-24)] },                                       // bâtiment principal
      { w: 6,   pts: [W(-27.5,18), W(-27.5,-24)] },                                   // aile gauche
      { w: 6,   pts: [W(27.5,18), W(27.5,-24)] }                                      // aile droite
    ],
    lakes: [],
    pois: getMapPois(),
    truck: null,
    player: { x: REALCAM.position.x - PARENT_OFF.x, z: REALCAM.position.z - PARENT_OFF.z }
  };
}

function dispose(){
  _unsub.forEach(f => f());
  _dom.forEach(el => el.remove());
  brendard.dispose();
  if(_dayOn){ restoreDay(); }
  parentScene.remove(root);
}

return { root, origin: ORIGIN, brendard, update, getMapPois, getMapData, dispose };
}

// ═══════════════════════════════════════════════════════════════════════
// MODE AUTONOME : index.html?world=places/highschool.js
// ═══════════════════════════════════════════════════════════════════════
export function buildWorld(scene, ctx) {
  const school = attachHighSchool(scene, ctx, { standalone: true });
  const g = HIGHSCHOOL.gate;
  ctx.camera.position.set(g.x, g.y, g.z + 25);   // devant le portail, face au lycée
  ctx.setView(0, 0.05);
  return {
    controlsHeight: true,          // le lycée gère la hauteur (escaliers, étage, ascenseur)
    update: school.update,
    getMapData: school.getMapData,
    dispose: school.dispose
  };
}
