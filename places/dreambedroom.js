import * as THREE from 'three';

// ==========================================
// BAD THERAPIST — LE RÊVE (places/dreambedroom.js)
// ==========================================
// Remplace l'ancienne page mini_world/dreambedroom/index.html (« Last Memory »).
// Quand le joueur s'endort dans bedroom.js, apartment.js appelle
//     window.BadTherapistDream.enter(callbackReveil)
// Le rêve a sa propre scène, sa propre caméra et son propre canvas plein écran, posé PAR-DESSUS le jeu
// (le jeu reste chargé dessous : on revient exactement où on s'est couché).
// Le joueur se réveille avec le bouton « Wake up » ou la touche Échap : fondu au noir, la musique
// s'arrête, puis callbackReveil() est appelé (bedroom.js ouvre les yeux et lève le joueur).
// Musique : audio/ilovetoile.mp3 (volume et muet suivent audio-manager.js).
// Three.js r128, comme le jeu : le rendu est identique à l'ancienne page.

const CSS = `
#dream-ui{position:fixed;inset:0;z-index:50;display:none;background:#000;touch-action:none;user-select:none;-webkit-user-select:none}
#dream-ui canvas{display:block;position:absolute;inset:0}
#dv{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.35) 100%)}
#dj,#dk{position:fixed;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:rgba(255,255,255,.08);opacity:.45;display:none;pointer-events:none}
#dj i,#dk i{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.45)}
#dream-wake{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);padding:10px 22px;border-radius:22px;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.35);color:#fff;font:15px Georgia,serif;opacity:.55;cursor:pointer;z-index:3}
#dream-wake:hover{opacity:.95}
#dream-cover{position:absolute;inset:0;background:#000;pointer-events:none;z-index:4}
`;

let api = null;

function build() {
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

const ui = document.createElement('div');
ui.id = 'dream-ui';
ui.innerHTML = '<div id="dv"></div><div id="dj"><i></i></div><div id="dk"><i></i></div>' +
    '<button id="dream-wake" type="button">Wake up</button><div id="dream-cover"></div>';
document.body.appendChild(ui);
const cover = ui.querySelector('#dream-cover');
ui.querySelector('#dream-wake').addEventListener('click', function() { wake(); });

const music = document.createElement('audio');
music.id = 'dream-music';
music.loop = true;
music.preload = 'auto';
music.src = 'audio/ilovetoile.mp3';
document.body.appendChild(music);

let active = false, waking = false, onWakeCb = null, musicTimer = null;
function setActive(v) { active = v; if (window.BadTherapistDream) window.BadTherapistDream.active = v; }

// ───────────── le monde de rêve (ancien index.html, inchangé) ─────────────
const R=(()=>{let s=11;return()=>(s=(s*16807)%2147483647)/2147483647})(),rr=(a,b)=>a+(b-a)*R();
const M=THREE.MathUtils,ss=(x,a,b)=>M.smoothstep(x,a,b);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.autoClear=false;
ui.insertBefore(renderer.domElement,ui.firstChild);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xffa050,.0022);
const cam=new THREE.PerspectiveCamera(72,1,.1,4000);cam.rotation.order='YXZ';
const world=new THREE.Group();scene.add(world);

// textures & matériaux
const cv=document.createElement('canvas');cv.width=cv.height=16;{const x=cv.getContext('2d');for(let i=0;i<16;i++)for(let j=0;j<16;j++){const v=180+(R()*75|0);x.fillStyle=`rgb(${v},${v},${v})`;x.fillRect(i,j,1,1)}}
const tx=new THREE.CanvasTexture(cv);tx.magFilter=tx.minFilter=THREE.NearestFilter;
const L=(c,m)=>new THREE.MeshLambertMaterial({color:c,map:m||null});
const BOX=new THREE.BoxGeometry(1,1,1),D=new THREE.Object3D();
function inst(list,mat){const m=new THREE.InstancedMesh(BOX,mat,list.length);list.forEach((b,i)=>{D.position.set(b[0],b[1],b[2]);D.scale.set(b[3]||1,b[4]||1,b[5]||1);D.updateMatrix();m.setMatrixAt(i,D.matrix);if(b[6])m.setColorAt(i,b[6])});m.frustumCulled=false;world.add(m);return m}

// arbre paradisiaque
const ob=[],Z0=-40,tp=[],ti=[],tu=[],V=(x,y,z)=>new THREE.Vector3(x,y,z);
const trunk=new THREE.CatmullRomCurve3([V(0,-.5,0),V(0,3,0),V(3.2,7,.8),V(-2.8,12,-.8),V(2.8,17,.6),V(-2.2,21,0),V(-5,25,1.2)]);
let tc0=0,tg0=0;while(trunk.getPoint(tc0).y<3.4&&tc0<1)tc0+=.001;while(trunk.getPoint(tg0).y<1.6&&tg0<1)tg0+=.001;
const TF=trunk.computeFrenetFrames(60,false),i0=Math.round(tg0*60),a0=Math.atan2(TF.binormals[i0].z,TF.normals[i0].z),
flip=(-Math.sin(a0)*TF.normals[i0].x+Math.cos(a0)*TF.binormals[i0].x)<0;
function tube(c,r0,r1,n,m,zn){const fr=c.computeFrenetFrames(n,false),b=tp.length/3,uo=zn?.5-a0/6.283:R();
 for(let i=0;i<=n;i++){const t=i/n,p=c.getPoint(t),r=M.lerp(r0,r1,t)*(1+1.4*Math.exp(-t*(zn?20:25))),N=fr.normals[i],B=fr.binormals[i],
  v=zn?(t<tc0?.75*t/tc0:.75+.25*(t-tc0)/(1-tc0)):.78+.22*t;
  for(let j=0;j<=m;j++){const a=j/m*6.283,q=Math.sin(a)*r,o=Math.cos(a)*r;tp.push(p.x+o*N.x+q*B.x,Math.max(0,p.y+o*N.y+q*B.y),p.z+o*N.z+q*B.z);tu.push(j/m+uo,v)}}
 for(let i=0;i<n;i++)for(let j=0;j<m;j++){const a=b+i*(m+1)+j,d=a+m+1;ti.push(a,d,a+1,d,d+1,a+1)}}
tube(trunk,.75,.28,60,12,1);
const lp=[],lc=[],ls=[],lw=[],lph=[],cols=[[.5,.78,.3]];
function leaf(x,y,z,w){if(y<.35)return;const c=cols[0],k=.72+.5*R();lp.push(x,y,z);lc.push(c[0]*k,c[1]*k,c[2]*k);ls.push(.25+.35*R());lw.push(w);lph.push(R()*6.283)}
for(let i=0;i<18;i++){const t0=.35+R()*.65,p0=trunk.getPoint(t0),a=R()*6.283,L=rr(7,15)*(1.2-t0*.4),cx=Math.cos(a),cz=Math.sin(a),u=rr(1,5);
 const bc=new THREE.CatmullRomCurve3([p0,V(p0.x+cx*L*.35,p0.y+u,p0.z+cz*L*.35),V(p0.x+cx*L*.7,p0.y+u*.9,p0.z+cz*L*.7),V(p0.x+cx*L,p0.y+u*.2-rr(0,2),p0.z+cz*L)]);
 tube(bc,rr(.1,.2)*(1.2-t0*.5),.03,24,6,0);
 for(let k=0;k<17;k++){const t=.25+.75*k/16,q=bc.getPoint(t);
  for(let s=0;s<3;s++){const len=rr(2.5,11)*(.5+t*.6),ph=R()*6.283;
   for(let m=0;m*.38<len;m++)leaf(q.x+Math.sin(m*.3+ph)*.3+rr(-.2,.2),q.y-m*.38,q.z+Math.cos(m*.25+ph)*.3+rr(-.2,.2),Math.min(1,m*.38/9)+.1)}
  for(let s=0;s<6;s++)leaf(q.x+rr(-1.3,1.3),q.y+rr(-.8,1),q.z+rr(-1.3,1.3),.1)}}
const treeG=new THREE.Group();treeG.position.z=Z0;world.add(treeG);
const W=2048,HH=1024;
const bc=document.createElement('canvas'),bu=document.createElement('canvas');
bc.width=bu.width=W;
bc.height=bu.height=HH;

{
 const x=bc.getContext('2d'),y=bu.getContext('2d');

 x.fillStyle='rgb(48,40,35)';
 x.fillRect(0,0,W,HH);

 y.fillStyle='rgb(150,150,150)';
 y.fillRect(0,0,W,HH);

 // écorce
 for(let i=0;i<1400;i++){
   const px=R()*W,w=1+R()*4,l=60+R()*500,py=R()*HH,g=R()<.5;
   for(const o of[-W,0,W]){
     x.fillStyle=g?'rgba(90,78,66,.35)':'rgba(10,8,6,.35)';
     x.fillRect(px+o,py,w,l);
     y.fillStyle=g?'rgba(200,200,200,.5)':'rgba(60,60,60,.5)';
     y.fillRect(px+o,py,w,l);
   }
 }

 // gravure qui suit le tronc
 const ec=x=>{

   x.save();

   // zone autour de la partie basse du tronc
   const cx=W*.5;
   const cy=(1-.75*tg0/tc0)*HH;

   x.translate(cx,cy);

   // le texte suit l'inclinaison locale du tronc
   const p1=trunk.getPoint(Math.max(0,tg0-.035));
   const p2=trunk.getPoint(Math.min(1,tg0+.035));
   const ang=Math.atan2(p2.x-p1.x,p2.y-p1.y);

   x.rotate(-ang);

   x.textAlign='center';
   x.textBaseline='middle';

   // profondeur de gravure
x.fillStyle='rgba(255,225,180,.95)';

   x.font='bold 105px Georgia,"Times New Roman",serif';
   x.fillText('I',0,-105);

   x.font='bold 105px Georgia,"Times New Roman",serif';
   x.fillText('♥',0,0);

   x.font='bold 78px Georgia,"Times New Roman",serif';
   x.fillText('Étoile',0,105);

   // petit reflet sur le bord de la gravure
   x.globalAlpha=.35;
   x.translate(2,2);
   x.fillStyle='rgb(255,210,165)';

   x.font='bold 105px Georgia,"Times New Roman",serif';
   x.fillText('I',0,-105);

   x.font='bold 105px Georgia,"Times New Roman",serif';
   x.fillText('♥',0,0);

   x.font='bold 78px Georgia,"Times New Roman",serif';
   x.fillText('Étoile',0,105);

   x.restore();
 };

 ec(x);

 // correspondance bump map
 {
   const cx=W*.5;
   const cy=(1-.75*tg0/tc0)*HH;

   y.save();
   y.translate(cx,cy);

   const p1=trunk.getPoint(Math.max(0,tg0-.035));
   const p2=trunk.getPoint(Math.min(1,tg0+.035));
   y.rotate(-Math.atan2(p2.x-p1.x,p2.y-p1.y));

   y.textAlign='center';
   y.textBaseline='middle';
   y.fillStyle='rgb(5,5,5)';

   y.font='bold 105px Georgia,"Times New Roman",serif';
   y.fillText('I',0,-105);

   y.font='bold 105px Georgia,"Times New Roman",serif';
   y.fillText('♥',0,0);

   y.font='bold 78px Georgia,"Times New Roman",serif';
   y.fillText('Étoile',0,105);

   y.restore();
 }
}

const tg=new THREE.BufferGeometry();
tg.setAttribute('position',new THREE.Float32BufferAttribute(tp,3));
tg.setAttribute('uv',new THREE.Float32BufferAttribute(tu,2));
tg.setIndex(ti);
tg.computeVertexNormals();

const tm=new THREE.CanvasTexture(bc);
const bm=new THREE.CanvasTexture(bu);

tm.wrapS=bm.wrapS=THREE.RepeatWrapping;

const bark=new THREE.Mesh(
 tg,
 new THREE.MeshPhongMaterial({
   map:tm,
   bumpMap:bm,
   bumpScale:2.5,
   shininess:5,
   specular:0x111111,
   side:THREE.DoubleSide
 })
);

bark.frustumCulled=false;
treeG.add(bark);

// Gravure lumineuse indépendante de l'éclairage jour/nuit
const glowCv=document.createElement('canvas');
glowCv.width=W; glowCv.height=HH;
{
 const g=glowCv.getContext('2d');
 g.clearRect(0,0,W,HH);
 g.save();

 const cx=W*.5;
 const cy=(1-.75*tg0/tc0)*HH;
 g.translate(cx,cy);

 const p1=trunk.getPoint(Math.max(0,tg0-.035));
 const p2=trunk.getPoint(Math.min(1,tg0+.035));
 g.rotate(-Math.atan2(p2.x-p1.x,p2.y-p1.y));

 g.textAlign='center';
 g.textBaseline='middle';
 g.shadowColor='rgba(255,190,105,.9)';
 g.shadowBlur=18;
 g.fillStyle='rgba(255,220,160,.92)';

 g.font='bold 105px Georgia,"Times New Roman",serif';
 g.fillText('I',0,-105);
 g.fillText('♥',0,0);

 g.font='bold 78px Georgia,"Times New Roman",serif';
 g.fillText('Étoile',0,105);

 g.restore();
}
const glowTx=new THREE.CanvasTexture(glowCv);
const glowMat=new THREE.MeshBasicMaterial({
 map:glowTx,
 transparent:true,
 depthWrite:false,
 blending:THREE.AdditiveBlending,
 side:THREE.DoubleSide
});
const glowBark=new THREE.Mesh(tg,glowMat);
glowBark.frustumCulled=false;
glowBark.renderOrder=2;
treeG.add(glowBark);


const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));lg.setAttribute('aC',new THREE.Float32BufferAttribute(lc,3));
lg.setAttribute('aS',new THREE.Float32BufferAttribute(ls,1));lg.setAttribute('aW',new THREE.Float32BufferAttribute(lw,1));lg.setAttribute('aP',new THREE.Float32BufferAttribute(lph,1));
const leafU={uT:{value:0},uK:{value:0},uS:{value:700}};
const leaves=new THREE.Points(lg,new THREE.ShaderMaterial({uniforms:leafU,transparent:true,depthWrite:false,
vertexShader:`attribute vec3 aC;attribute float aS,aW,aP;uniform float uT,uS,uK;varying vec3 vC;
void main(){vec3 p=position;float w=aW*aW+.15;
p.x+=(sin(uT*.9+aP+p.y*.25)*.35+sin(uT*.35+p.z*.2)*.2)*w;p.z+=cos(uT*.7+aP*1.3+p.y*.2)*.3*w;p.y+=sin(uT*1.3+aP)*.05;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aS*uS/-mv.z;
vC=aC*(.88+.12*sin(uT*2.+aP*5.))*(1.+uK*.35);}`,
fragmentShader:'varying vec3 vC;void main(){float r=length(gl_PointCoord-.5)*2.,a=smoothstep(1.,.2,r);if(a<.03)discard;gl_FragColor=vec4(vC,a*.8);}'}));
leaves.frustumCulled=false;treeG.add(leaves);
ob.push([0,Z0,1.7]);

// ciel
const skyU={uSun:{value:new THREE.Vector3(0,.1,-1)},uK:{value:0},uT:{value:0}};
const dome=new THREE.Mesh(new THREE.SphereGeometry(1500,32,16),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,
vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:`varying vec3 vP;uniform vec3 uSun;uniform float uK,uT;
float hs(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1.,0.)),f.x),mix(hs(i+vec2(0.,1.)),hs(i+vec2(1.,1.)),f.x),f.y);}
float fb(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n2(p);p=p*2.1+vec2(5.3,1.7);a*=.5;}return s;}
void main(){vec3 d=normalize(vP);if(d.y<0.)discard;float h=d.y,k=uK;
float tw=smoothstep(0.,.45,k),nt=smoothstep(.35,1.,k);
float ang=acos(clamp(dot(d,uSun),-1.,1.)),sa=smoothstep(.3,2.4,ang),up=smoothstep(-.25,.08,uSun.y),s=cos(ang);
vec3 hD=mix(vec3(1.,.93,.72),vec3(.8,.66,.44),sa),mD=mix(vec3(1.,.94,.78),vec3(.82,.76,.6),sa),tD=mix(vec3(.85,.82,.7),vec3(.56,.62,.64),sa);
vec3 hT=mix(vec3(1.,.5,.25),vec3(.52,.44,.52),sa),zT=mix(vec3(.45,.35,.45),vec3(.16,.18,.34),sa);
vec3 hN=vec3(.05,.07,.17),zN=vec3(.004,.01,.04);
vec3 hor=mix(mix(hD,hT,tw),hN,nt);
vec3 cD=mix(mix(hD,mD,smoothstep(0.,.16,h)),tD,smoothstep(.1,.75,h)),cT=mix(hT,zT,pow(h,.6)),cN=mix(hN,zN,pow(h,.6));
vec3 c=mix(mix(cD,cT,tw),cN,nt);
c+=up*(vec3(1.,.9,.68)*exp(-ang*14.)*.4+vec3(1.,.95,.8)*exp(-ang*55.)*.8+vec3(1.,.98,.9)*smoothstep(.022,.009,ang)*2.2);
vec2 uv=d.xz/(h+.22)*.55+vec2(uT*.01,uT*.003),sx=normalize(uSun.xz+vec2(.0001))*.1;
float c0=fb(uv*1.2),c1=fb(uv*1.2+sx);
float dens=smoothstep(.38,.7,c0)*smoothstep(.003,.04,h)*.30,lit=clamp((c0-c1)*4.+.6,0.,1.);
vec2 u3=d.xz/(h+.07)*vec2(.3,1.5)+vec2(uT*.008,7.);
float ds=smoothstep(.42,.72,fb(u3*1.4))*smoothstep(.002,.03,h)*(1.-smoothstep(.1,.32,h))*.22;
vec3 lc=mix(mix(vec3(1.,.96,.85),vec3(1.,.62,.4),tw),vec3(.12,.14,.26),nt),sc=mix(mix(vec3(.7,.62,.5),vec3(.5,.32,.35),tw),vec3(.03,.04,.09),nt);
vec3 body=mix(mix(vec3(.62,.52,.4),vec3(.42,.24,.26),tw),vec3(.03,.04,.09),nt),rim=mix(mix(vec3(1.,.95,.75),vec3(1.,.55,.3),tw),vec3(.12,.14,.26),nt)*(1.+exp(-ang*3.)*.6*up);
vec3 cc=mix(mix(sc,lc,lit),mix(rim,body,smoothstep(.4,.8,c0)),exp(-ang*1.6));
c=mix(c,cc,dens);c=mix(c,mix(cc,lc,.4),ds*(1.-dens*.5));
vec2 u2=d.xz/(h+.12)*vec2(.18,.9)+vec2(uT*.006,0.);float ci=smoothstep(.5,.82,fb(u2*2.+3.)),cm=ci*smoothstep(.12,.45,h)*.45*(1.-dens);
vec3 cir=mix(mix(vec3(1.,.9,.75),vec3(1.,.6,.45),tw),vec3(.15,.17,.3),nt);c=mix(c,cir+vec3(1.,.8,.5)*exp(-ang*3.)*.4*up,cm);
c=mix(c,hor*1.04,exp(-h*12.)*.3);
c+=(hs(gl_FragCoord.xy)-.5)/255.;gl_FragColor=vec4(c,1.);}`}));
dome.renderOrder=-2;dome.frustumCulled=false;world.add(dome);
// Nuage de l'horizon près du soleil couchant — couche indépendante
const sunsetCv=document.createElement('canvas');sunsetCv.width=512;sunsetCv.height=180;
{
  const x=sunsetCv.getContext('2d');
  x.clearRect(0,0,512,180);
  const puffs=[[55,105,48],[105,88,62],[170,104,58],[235,82,68],[305,102,60],[365,86,52],[425,106,58],[470,95,42]];
  for(const [px,py,r] of puffs){
    const g=x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(255,225,205,.72)');
    g.addColorStop(.55,'rgba(225,185,175,.48)');
    g.addColorStop(1,'rgba(180,140,150,0)');
    x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();
  }
}
const sunsetTex=new THREE.CanvasTexture(sunsetCv);
sunsetTex.needsUpdate=true;
const sunsetCloud=new THREE.Mesh(
  new THREE.PlaneGeometry(260,92),
  new THREE.MeshBasicMaterial({map:sunsetTex,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending})
);
world.add(sunsetCloud);


const N=1100,sp=new Float32Array(N*3),sa=new Float32Array(N);
for(let i=0;i<N;i++){const u=R()*6.283,v=R()*2-1,q=Math.sqrt(1-v*v);sp.set([Math.cos(u)*q*1400,v*1400,Math.sin(u)*q*1400],i*3);sa[i]=Math.pow(R(),2.2)*.8+.2}
const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));sg.setAttribute('aS',new THREE.BufferAttribute(sa,1));
const starU={uA:{value:0},uT:{value:0},uPx:{value:2}},POLE=new THREE.Vector3(.35,.8,-.45).normalize();
const stars=new THREE.Points(sg,new THREE.ShaderMaterial({uniforms:starU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
vertexShader:'attribute float aS;uniform float uT,uPx,uA;varying float vA;varying vec3 vC;void main(){float el=abs((modelMatrix*vec4(position,1.)).y)/1400.;vA=aS*uA*(.7+.3*sin(uT*(1.+aS*2.)+aS*50.))*smoothstep(0.,.12,el);vC=mix(vec3(.75,.88,1.),vec3(1.,.9,.72),fract(aS*37.));gl_PointSize=uPx*(1.4+aS*2.4);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'varying float vA;varying vec3 vC;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vC*vA*smoothstep(1.,.1,r),1.);}'}));
stars.frustumCulled=false;stars.renderOrder=-3;world.add(stars);

function spr(draw,add,px,sz){const c=document.createElement('canvas');c.width=c.height=sz||256;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);
 if(px)t.magFilter=THREE.NearestFilter;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,fog:false,depthWrite:false,transparent:true,blending:add?THREE.AdditiveBlending:THREE.NormalBlending}));
 s.frustumCulled=false;world.add(s);return s}
const moonS=spr(x=>{const C=128,Rr=104;x.save();x.beginPath();x.arc(C,C,Rr,0,6.283);x.clip();
 let g=x.createRadialGradient(C-20,C-20,10,C,C,Rr);g.addColorStop(0,'#f7f3e6');g.addColorStop(1,'#d3cdbb');x.fillStyle=g;x.fillRect(0,0,256,256);
 const mare=[[100,92,38],[140,80,30],[118,138,44],[80,128,26],[150,130,26],[128,60,20]];
 for(const m of mare){g=x.createRadialGradient(m[0],m[1],2,m[0],m[1],m[2]);g.addColorStop(0,'rgba(110,110,125,.55)');g.addColorStop(1,'rgba(110,110,125,0)');x.fillStyle=g;x.fillRect(0,0,256,256)}
 for(let i=0;i<46;i++){const a=R()*6.283,d=Math.sqrt(R())*Rr*.9,cx=C+Math.cos(a)*d,cy=C+Math.sin(a)*d,r=2+R()*7;x.strokeStyle='rgba(255,255,245,.35)';x.lineWidth=1.2;x.beginPath();x.arc(cx,cy,r,0,6.283);x.stroke();x.fillStyle='rgba(90,90,100,.18)';x.beginPath();x.arc(cx+1,cy+1,r*.8,0,6.283);x.fill()}
 g=x.createRadialGradient(C-45,C-10,50,C+25,C+5,Rr*1.15);g.addColorStop(0,'rgba(5,8,25,0)');g.addColorStop(.7,'rgba(5,8,25,.25)');g.addColorStop(1,'rgba(5,8,25,.8)');x.fillStyle=g;x.fillRect(0,0,256,256);x.restore()},0);moonS.scale.set(95,95,1);moonS.renderOrder=-2;
const moonG=spr(x=>{const g=x.createRadialGradient(128,128,20,128,128,128);g.addColorStop(0,'rgba(190,210,255,.5)');g.addColorStop(.3,'rgba(150,175,235,.16)');g.addColorStop(1,'rgba(120,150,230,0)');x.fillStyle=g;x.fillRect(0,0,256,256)},1);moonG.scale.set(520,520,1);moonG.renderOrder=-2.5;

// Gros nuages 3D supprimés : le ciel utilise uniquement ses nuages procéduraux.

// lumières & sol miroir
const amb=new THREE.AmbientLight(0xffffff,.8),sunL=new THREE.DirectionalLight(0xffd9a0,1.6),moonL=new THREE.DirectionalLight(0x8fa8ff,0);const fillL=new THREE.DirectionalLight(0xffe0b0,.7);fillL.position.set(.3,.4,1);scene.add(amb,sunL,moonL,fillL);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),new THREE.MeshBasicMaterial({color:0x0a0806,transparent:true,opacity:.17,fog:false,depthWrite:false}));
floor.rotation.x=-Math.PI/2;scene.add(floor);

// avatar (visible dans le reflet) & ombre
const av=new THREE.Group(),am=L(0xe9dccb),pm=L(0x39414f),gl=new THREE.BoxGeometry(.13,.8,.13).translate(0,-.4,0),ga=new THREE.BoxGeometry(.1,.65,.1).translate(0,-.3,0);
const bd=new THREE.Mesh(new THREE.CylinderGeometry(.2,.17,.7,12),am);bd.position.y=1.15;
const hd=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),L(0xe8c4a8));hd.position.y=1.65;
const legs=[-.09,.09].map(x=>{const m=new THREE.Mesh(gl,pm);m.position.set(x,.8,0);return m}),arms=[-.28,.28].map(x=>{const m=new THREE.Mesh(ga,am);m.position.set(x,1.45,0);return m});
av.add(bd,hd,...legs,...arms);world.add(av);
const shc=document.createElement('canvas');shc.width=shc.height=64;{const x=shc.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(0,0,0,.8)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64)}
const shG=new THREE.Group(),shM=new THREE.Mesh(new THREE.PlaneGeometry(1,1).translate(0,.5,0),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shc),transparent:true,depthWrite:false}));
shM.rotation.x=-Math.PI/2;shM.position.y=.03;shG.add(shM);scene.add(shG);
function body(){av.position.set(P.x,0,P.z);av.rotation.y=P.yaw;const w=Math.sin(P.bob)*.7*(P.mv||0);legs[0].rotation.x=w;legs[1].rotation.x=-w;arms[0].rotation.x=-w*.8;arms[1].rotation.x=w*.8;
 const hh=Math.hypot(sd.x,sd.z)||1,len=Math.min(16,1.75/Math.max(sd.y/hh,.1));shG.position.set(P.x,0,P.z);shG.rotation.y=Math.atan2(sd.x/hh,sd.z/hh);shM.scale.set(.8,len,1);shM.material.opacity=.5*ss(sd.y,-.02,.12);stG.position.set(P.x,0,P.z);stG.rotation.y=Math.atan2(-sd.x/hh,-sd.z/hh);stM.material.opacity=.95*ss(sd.y,-.03,.1)*(1-ss(sd.y,.1,.6));}
const stc=document.createElement('canvas');stc.width=64;stc.height=256;{const x=stc.getContext('2d');for(let j=0;j<256;j++){const f=Math.pow(j/255,1.6);for(let i=0;i<64;i++){const u=(i/63-.5)*2;x.fillStyle=`rgba(255,215,140,${Math.exp(-u*u*5)*f})`;x.fillRect(i,255-j,1,1)}}}
const stM=new THREE.Mesh(new THREE.PlaneGeometry(1,1).translate(0,.5,0),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(stc),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
stM.rotation.x=-Math.PI/2;stM.position.y=.05;stM.scale.set(16,1400,1);const stG=new THREE.Group();stG.add(stM);scene.add(stG);
const pA=new THREE.Plane(new THREE.Vector3(0,-1,0),.6),pB=new THREE.Plane(new THREE.Vector3(0,1,0),.6);

// joueur
const P={x:0,y:0,z:-25,vy:0,yaw:0,pitch:.28,bob:0};let jump=0,T=0;
const keys={};addEventListener('keydown',e=>{if(!active)return;keys[e.code]=1;if(e.code=='Space')e.preventDefault();if(e.code=='Escape')wake()});addEventListener('keyup',e=>{keys[e.code]=0});
const look=(dx,dy)=>{P.yaw-=dx;P.pitch=M.clamp(P.pitch-dy,-1.45,1.45)};
let drag=0;const cvs=renderer.domElement;
cvs.addEventListener('click',()=>{if(cvs.requestPointerLock)cvs.requestPointerLock()});
cvs.addEventListener('mousedown',()=>drag=1);addEventListener('mouseup',()=>drag=0);
addEventListener('mousemove',e=>{if(!active)return;if(document.pointerLockElement===cvs||drag)look(e.movementX*.0022,e.movementY*.0022)});
const isT=matchMedia('(pointer:coarse)').matches||'ontouchstart' in window;
const mk=id=>({el:document.getElementById(id),id:null,c:{x:0,y:0},v:{x:0,y:0}});
const SL=mk('dj'),SR=mk('dk'),jv=SL.v,lv=SR.v;
const place=(s,x,y)=>{s.el.style.left=x+'px';s.el.style.top=y+'px'};
const def=s=>{place(s,s==SL?100:innerWidth-100,innerHeight-120);s.el.style.opacity=.45;s.el.firstElementChild.style.transform=''},defJ=()=>{def(SL);def(SR)};
if(isT){SL.el.style.display=SR.el.style.display='block'}
addEventListener('touchstart',e=>{if(!active||(e.target.closest&&e.target.closest('#dream-wake')))return;e.preventDefault();for(const t of e.changedTouches){
 
 const s=t.clientX<innerWidth*.5?SL:SR;if(s.id!=null)continue;
 s.id=t.identifier;s.c={x:t.clientX,y:t.clientY};place(s,s.c.x,s.c.y);s.el.style.opacity=.85}},{passive:false});
addEventListener('touchmove',e=>{if(!active)return;e.preventDefault();for(const t of e.changedTouches)for(const s of[SL,SR])if(t.identifier==s.id){
 const dx=t.clientX-s.c.x,dy=t.clientY-s.c.y,l=Math.hypot(dx,dy)||1,m=Math.min(l,50)/50;s.v.x=dx/l*m;s.v.y=dy/l*m;s.el.firstElementChild.style.transform=`translate(${s.v.x*50}px,${s.v.y*50}px)`}},{passive:false});
const end=e=>{for(const t of e.changedTouches)for(const s of[SL,SR])if(t.identifier==s.id){s.id=null;s.v.x=s.v.y=0;def(s)}};
addEventListener('touchend',end);addEventListener('touchcancel',end);

function step(dt){
 let mx=0,mz=0,run=keys.ShiftLeft||keys.ShiftRight;
 if(keys.KeyW||keys.KeyZ||keys.ArrowUp)mz--;if(keys.KeyS||keys.ArrowDown)mz++;if(keys.KeyA||keys.KeyQ||keys.ArrowLeft)mx--;if(keys.KeyD||keys.ArrowRight)mx++;
 look(lv.x*dt*2.4,lv.y*dt*1.8);mx+=jv.x;mz+=jv.y;if(Math.hypot(jv.x,jv.y)>.92)run=1;
 const g=navigator.getGamepads?Array.from(navigator.getGamepads()).find(Boolean):null;
 if(g){const z=v=>Math.abs(v)<.15?0:v;mx+=z(g.axes[0]);mz+=z(g.axes[1]);look(z(g.axes[2]||0)*dt*2.6,z(g.axes[3]||0)*dt*2.2);
  if(g.buttons[0]&&g.buttons[0].pressed)jump=1;if((g.buttons[10]&&g.buttons[10].pressed)||(g.buttons[7]&&g.buttons[7].pressed))run=1}
 const l=Math.hypot(mx,mz);if(l>1){mx/=l;mz/=l}P.mv=Math.min(l,1);
 const v=(run?10:5)*dt,s=Math.sin(P.yaw),c=Math.cos(P.yaw);
 P.x+=(mx*c+mz*s)*v;P.z+=(-mx*s+mz*c)*v;
 if((jump||keys.Space)&&P.y<=0){P.vy=8}jump=0;
 P.vy-=22*dt;P.y+=P.vy*dt;if(P.y<0){P.y=0;P.vy=0}
 for(const o of ob){const dx=P.x-o[0],dz=P.z-o[1],d=Math.hypot(dx,dz),r=o[2]+.4;if(d<r&&d>0){P.x=o[0]+dx/d*r;P.z=o[1]+dz/d*r}}
 if(l>.1&&P.y==0)P.bob+=dt*(run?14:9);
 cam.position.set(P.x,1.7+P.y+Math.sin(P.bob)*.03*(l>.1?1:0),P.z);cam.rotation.set(P.pitch,P.yaw,0);
}

const cA=new THREE.Color(1,.88,.62),cT=new THREE.Color(.95,.4,.2),cB=new THREE.Color(.05,.07,.17),hor=new THREE.Color(),sd=new THREE.Vector3(),md=new THREE.Vector3();
const aA=new THREE.Color(1,.88,.68),aB=new THREE.Color(.13,.16,.3);
const put=(o,v,d)=>o.position.set(P.x+v.x*d,v.y*d,P.z+v.z*d);
const KF=[[0,.13,0],[10,-.1,.45],[20,-.45,1],[40,-.45,1],[44,-.15,.55],[48,.1,.05],[54,.38,0],[60,.13,0]],
MK=[[0,-.3],[8,-.12],[14,.12],[26,.62],[34,.78],[44,.4],[52,.02],[56,-.25],[60,-.3]],CY=60;
function kf(a,t,i){for(let n=0;n<a.length-1;n++)if(t<=a[n+1][0]){const f=(t-a[n][0])/(a[n+1][0]-a[n][0]);return M.lerp(a[n][i],a[n+1][i],f)}return a[a.length-1][i]}
function sky(dt){
 T+=dt;const t=T%CY,e=kf(KF,t,1),K=kf(KF,t,2);
 const az=t<20?.17:t<40?M.lerp(.17,-2,(t-20)/20):M.lerp(-2,.17,(t-40)/20);
 sd.set(Math.sin(az)*Math.cos(e),Math.sin(e),-Math.cos(az)*Math.cos(e));
 const em=kf(MK,t,1),am=Math.PI+1.17-2.2*M.clamp((t-10)/46,0,1);
 md.set(Math.sin(am)*Math.cos(em),Math.sin(em),-Math.cos(am)*Math.cos(em));
 skyU.uSun.value.copy(sd);skyU.uK.value=K;skyU.uT.value=T;leafU.uT.value=T;leafU.uK.value=K;
 const up=ss(sd.y,-.15,.12),tw=ss(K,0,.45),nt=ss(K,.35,1);
 hor.copy(cA).lerp(cT,tw).lerp(cB,nt);scene.fog.color.copy(hor);renderer.setClearColor(hor);
 fillL.intensity=.7*(1-ss(K,.3,.9));sunL.intensity=1.8*up;moonL.intensity=.6*ss(K,.3,.9)*ss(em,-.05,.15);amb.color.copy(aA).lerp(aB,K);amb.intensity=.95-.35*K;
 sunL.position.copy(sd).multiplyScalar(100);moonL.position.copy(md).multiplyScalar(100);
 const vis=ss(K,.3,.75)*ss(em,-.08,.1);
 put(moonS,md,1200);put(moonG,md,1190);
 moonS.material.opacity=vis;moonG.material.opacity=vis*.6;moonS.material.color.setRGB(1,.82+.18*ss(em,0,.35),.62+.38*ss(em,0,.35));
 starU.uA.value=ss(K,.65,.95);starU.uT.value=T;
 dome.position.set(P.x,0,P.z);stars.position.copy(dome.position);stars.quaternion.setFromAxisAngle(POLE,T*.035);
  // Le nuage d'horizon reste très loin devant le joueur, près du soleil.
  sunsetCloud.position.set(P.x+sd.x*900,75,P.z+sd.z*900);
  sunsetCloud.rotation.y=Math.atan2(-sd.z,sd.x);
}

const mkRT=()=>renderer.capabilities.isWebGL2?new THREE.WebGLMultisampleRenderTarget(1,1):new THREE.WebGLRenderTarget(1,1);
const rtA=mkRT(),rtB=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
const VS='varying vec2 vU;void main(){vU=uv;gl_Position=vec4(position.xy,0.,1.);}';
const rayM=new THREE.ShaderMaterial({uniforms:{tA:{value:rtA.texture},c0:{value:new THREE.Vector2()},c1:{value:new THREE.Vector2()},v:{value:new THREE.Vector2()}},vertexShader:VS,depthTest:false,depthWrite:false,
fragmentShader:`uniform sampler2D tA;uniform vec2 c0,c1,v;varying vec2 vU;
vec3 rays(vec2 cn){vec2 dl=(cn-vU)/22.,u=vU;float w=1.;vec3 s=vec3(0.);for(int i=0;i<22;i++){u+=dl;vec3 t=texture2D(tA,u).rgb;float l=dot(t,vec3(.3,.5,.2));s+=t*pow(max(l-.8,0.)*4.,2.)*w;w*=.95;}return s/22.;}
void main(){gl_FragColor=vec4(rays(c0)*v.x+rays(c1)*v.y,1.);}`});
const compM=new THREE.ShaderMaterial({uniforms:{tA:{value:rtA.texture},tB:{value:rtB.texture},gc:{value:new THREE.Color(1,.92,.7)},gs:{value:.8}},vertexShader:VS,depthTest:false,depthWrite:false,
fragmentShader:'uniform sampler2D tA,tB;uniform vec3 gc;uniform float gs;varying vec2 vU;void main(){gl_FragColor=vec4(texture2D(tA,vU).rgb+texture2D(tB,vU).rgb*gc*gs,1.);}'});
const fq=new THREE.Mesh(new THREE.PlaneGeometry(2,2),rayM),fs=new THREE.Scene(),fc=new THREE.OrthographicCamera(-1,1,1,-1,0,1),pv=new THREE.Vector3(),fw=new THREE.Vector3();fq.frustumCulled=false;fs.add(fq);
function rs(){const pr=renderer.getPixelRatio();rtA.setSize(innerWidth*pr|0,innerHeight*pr|0);rtB.setSize(innerWidth*pr/2|0,innerHeight*pr/2|0);renderer.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();starU.uPx.value=2*renderer.getPixelRatio();leafU.uS.value=innerHeight*renderer.getPixelRatio()/(2*Math.tan(cam.fov*Math.PI/360));defJ()}
addEventListener('resize',rs);rs();

let last=performance.now();
function loop(now){if(!active)return;requestAnimationFrame(loop);const dt=Math.min((now-last)/1000,.05);last=now;
 step(dt);sky(dt);body();floor.position.set(P.x,0,P.z);
 renderer.setRenderTarget(rtA);renderer.clear();
 world.scale.y=-1;floor.visible=false;av.visible=true;shG.visible=false;stG.visible=false;sunL.position.y*=-1;moonL.position.y*=-1;
 renderer.clippingPlanes=[pA];renderer.render(scene,cam);
 renderer.clearDepth();
 world.scale.y=1;floor.visible=true;av.visible=false;shG.visible=true;stG.visible=true;sunL.position.y*=-1;moonL.position.y*=-1;
 renderer.clippingPlanes=[pB];renderer.render(scene,cam);
 renderer.clippingPlanes=[];cam.getWorldDirection(fw);const u2=ss(sd.y,-.05,.12);
 const sp2=(dx,dy,dz)=>{pv.set(cam.position.x+dx*1000,cam.position.y+dy*1000,cam.position.z+dz*1000).project(cam);return[pv.x*.5+.5,pv.y*.5+.5,ss(dx*fw.x+dy*fw.y+dz*fw.z,0,.25)]};
 const a0=sp2(sd.x,sd.y,sd.z),a1=sp2(sd.x,-sd.y,sd.z);
 rayM.uniforms.c0.value.set(a0[0],a0[1]);rayM.uniforms.c1.value.set(a1[0],a1[1]);rayM.uniforms.v.value.set(a0[2]*u2,a1[2]*u2*.7);
 renderer.setRenderTarget(rtB);fq.material=rayM;renderer.render(fs,fc);
 renderer.setRenderTarget(null);fq.material=compM;renderer.render(fs,fc);
}


// ───────────── entrée / sortie ─────────────
function fadeMusic(to, ms) {
    clearInterval(musicTimer);
    const A = window.BadTherapistAudio;
    const tgt = to ? (A ? A.getVolume() : 0.7) : 0;
    const v0 = music.volume, t0 = performance.now();
    musicTimer = setInterval(function() {
        const k = Math.min((performance.now() - t0) / ms, 1);
        music.volume = Math.max(0, Math.min(1, v0 + (tgt - v0) * k));
        if (k >= 1) clearInterval(musicTimer);
    }, 50);
}

function wake() {
    if (!active || waking) return;
    waking = true;
    cover.style.transition = 'opacity 1.6s ease';
    cover.style.opacity = '1';
    fadeMusic(0, 1600);
    setTimeout(function() {
        clearInterval(musicTimer);
        music.pause();
        if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
        setActive(false);
        ui.style.display = 'none';
        for (const k in keys) keys[k] = 0;
        jv.x = jv.y = lv.x = lv.y = 0;
        if (window.BadTherapistAudio) window.BadTherapistAudio.applySettings();
        const cb = onWakeCb; onWakeCb = null;
        if (cb) cb();
    }, 1700);
}

function start(cb, saved) {
    if (active) return;
    onWakeCb = cb; waking = false;
    Object.assign(P, { x: 0, y: 0, z: -25, vy: 0, yaw: 0, pitch: .28, bob: 0, mv: 0 });
    T = 0; jump = 0;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.z)) {
        P.x = saved.x; P.z = saved.z;
        P.yaw = Number.isFinite(saved.yaw) ? saved.yaw : 0;
        P.pitch = Number.isFinite(saved.pitch) ? saved.pitch : .28;
        T = Number.isFinite(saved.t) ? saved.t : 0;
    }
    for (const k in keys) keys[k] = 0;
    jv.x = jv.y = lv.x = lv.y = 0;
    setActive(true);
    ui.style.display = 'block';
    cover.style.transition = 'none';
    cover.style.opacity = '1';
    rs();
    last = performance.now();
    requestAnimationFrame(loop);
    if (window.BadTherapistAudio) window.BadTherapistAudio.applySettings();
    music.currentTime = 0;
    music.volume = 0;
    // Au rechargement de la page le navigateur peut bloquer le son : on le relance au premier geste
    music.play().catch(function() {
        const again = function() {
            ['pointerdown', 'keydown', 'touchstart'].forEach(function(n) { removeEventListener(n, again, true); });
            if (active && !waking) music.play().catch(function() {});
        };
        ['pointerdown', 'keydown', 'touchstart'].forEach(function(n) { addEventListener(n, again, true); });
    });
    fadeMusic(1, 3000);
    // Les yeux s'ouvrent dans le rêve (les paupières de bedroom.js sont encore fermées dessous)
    requestAnimationFrame(function() { requestAnimationFrame(function() {
        cover.style.transition = 'opacity 3s ease';
        cover.style.opacity = '0';
    }); });
}

function getState() {
    const r = function(v) { return +v.toFixed(3); };
    return { x: r(P.x), z: r(P.z), yaw: r(P.yaw), pitch: r(P.pitch), t: r(T % 60) };
}

return { start: start, getState: getState, isWaking: function() { return waking; } };
}

window.BadTherapistDream = {
    active: false,
    // saved (facultatif) : { x, z, yaw, pitch, t } pour reprendre le rêve là où on l'avait laissé
    enter: function(onWake, saved) {
        if (!api) api = build();
        api.start(onWake, saved);
    },
    // État à sauvegarder pendant qu'on rêve (null sinon, ou pendant le réveil)
    getState: function() {
        return (api && this.active && !api.isWaking()) ? api.getState() : null;
    }
};
