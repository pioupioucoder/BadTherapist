// avatar-loader.js – charge un avatar Mixamo (FBX) et lui remet ses couleurs (textures PNG) par code.
//
// Pas besoin de Blender : le FBX de Mixamo garde la forme et les coordonnées de texture,
// on replaque simplement tes PNG dessus.
//
// Dossier conseillé (à copier dans ton jeu) :
//   avatars/evelyn/evelyn.fbx            <- Mixamo « With Skin » (le personnage)
//   avatars/evelyn/texture_diffuse.png   <- les textures de Hyper3D
//   avatars/evelyn/texture_normal.png
//   avatars/evelyn/texture_roughness.png
//   avatars/evelyn/texture_metallic.png
//   avatars/evelyn/idle.fbx, walk.fbx, run.fbx   <- Mixamo « Without Skin » (légers). Pour walk et run : coche « In Place »
//
// Utilisation :
//   const ev = await loadMixamoAvatar({
//       model: 'avatars/evelyn/evelyn.fbx',
//       textures: { map: 'avatars/evelyn/texture_diffuse.png', normalMap: '...texture_normal.png',
//                   roughnessMap: '...texture_roughness.png', metalnessMap: '...texture_metallic.png' },
//       animations: { idle: 'avatars/evelyn/idle.fbx', walk: 'avatars/evelyn/walk.fbx', run: 'avatars/evelyn/run.fbx' }
//   });
//   // (si le FBX du personnage contient déjà l'animation « sitting » : ajoute  modelAnimation: 'sit'  et fais ev.play('sit'))
//   scene.add(ev.root);          // ev.root = le groupe à positionner (ev.root.position.set(x, y, z))
//   ev.play('idle');
//   // dans ta boucle d'animation :  ev.update(dt);
//   ev.play('walk');             // fondu enchaîné automatique
//
// Options : height (taille debout voulue en mètres : ajuste l'échelle toute seule), scale (sinon 0.01), style ('pbr' | 'lambert'),
//          onProgress(fraction 0..1) pour une barre de chargement, modelAnimation (nom de l'animation contenue dans le FBX du personnage).

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';   // même chemin que GLTFLoader dans ton jeu

const fbxLoader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

function loadTexture(url, srgb) {
    return new Promise(function (resolve, reject) {
        texLoader.load(url, function (t) {
            if (srgb) {                                             // seule la couleur est en sRGB ; normale / roughness / metallic sont des données
                if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;      // three récent
                else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;       // three r128 (celui de ton jeu)
            }
            t.anisotropy = 4;
            resolve(t);
        }, undefined, function () { reject(new Error('texture introuvable : ' + url)); });
    });
}

function loadFBX(url, onProgress) {
    return new Promise(function (resolve, reject) {
        fbxLoader.load(url, resolve, onProgress, function () { reject(new Error('FBX introuvable : ' + url)); });
    });
}

// Un nom d'os « neutre » : sans le préfixe Mixamo (« mixamorig: » / « mixamorig »), sans ponctuation, en minuscules
function norm(n) {
    return String(n).replace(/^mixamorig[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// Fait correspondre les pistes d'une animation aux os du personnage même si les noms diffèrent un peu
// (préfixe Mixamo présent d'un côté et pas de l'autre, « : » retiré par le chargeur...). Renvoie « pistes sans os / total ».
function fixClip(model, clip, label) {
    const bones = {};
    model.traverse(function (o) { if (o.name) bones[norm(o.name)] = o.name; });
    let bad = 0;
    clip.tracks.forEach(function (t) {
        const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
        if (THREE.PropertyBinding.findNode(model, node)) return;
        const real = bones[norm(node)];
        if (real && t.name.indexOf(node) === 0) t.name = real + t.name.slice(node.length);
        else bad++;
    });
    console.log('[avatar] animation « ' + label + ' » : pistes sans os = ' + bad + '/' + clip.tracks.length + (bad ? '  (PROBLEME : les noms d\'os ne correspondent pas)' : '  (ok)'));
    return bad;
}

export async function loadMixamoAvatar(opts) {
    opts = opts || {};
    let scale = opts.scale || 0.01;                 // Mixamo exporte en centimètres : ×0.01 pour des mètres (ignoré si height est donné)
    const style = opts.style || 'pbr';              // 'pbr' (réagit aux lumières) ou 'lambert' (plus plat, comme ton décor)
    const tx = opts.textures || {};

    const model = await loadFBX(opts.model, function (e) {
        if (opts.onProgress && e && e.lengthComputable && e.total > 0) opts.onProgress(e.loaded / e.total);
    });
    const tex = {};
    if (tx.map) tex.map = await loadTexture(tx.map, true);
    if (style === 'pbr') {
        if (tx.normalMap) tex.normalMap = await loadTexture(tx.normalMap, false);
        if (tx.roughnessMap) tex.roughnessMap = await loadTexture(tx.roughnessMap, false);
        if (tx.metalnessMap) tex.metalnessMap = await loadTexture(tx.metalnessMap, false);
    }

    // on remplace le matériau gris par un matériau avec tes textures
    const material = style === 'lambert'
        ? new THREE.MeshLambertMaterial({ map: tex.map || null })
        : new THREE.MeshStandardMaterial({
            map: tex.map || null, normalMap: tex.normalMap || null,
            roughnessMap: tex.roughnessMap || null, metalnessMap: tex.metalnessMap || null,
            roughness: 1, metalness: tex.metalnessMap ? 1 : 0
        });
    // three r128 (celui de ton jeu) : un matériau doit avoir skinning = true pour suivre le squelette. Sans ça le personnage reste
    // figé dans sa pose de base alors que l'animation « joue » bien. Les versions récentes n'ont plus cette propriété : on l'ignore.
    if ('skinning' in material) material.skinning = true;
    model.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) {
            o.material = material;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;                // un mesh animé peut disparaître à tort sinon
        }
    });

    if (opts.height) {                              // on mesure le personnage tel qu'il est (pose de base) et on l'amène à la taille voulue
        model.scale.setScalar(1);
        model.updateMatrixWorld(true);
        const h = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
        if (h > 0) scale = opts.height / h;
    }
    model.scale.setScalar(scale);
    const root = new THREE.Group();
    root.add(model);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;                  // les pieds au niveau du sol (y = 0 du groupe)

    // animations : celles du fichier du personnage + chaque fichier d'animation (la première animation du fichier)
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    // l'animation contenue dans le FBX du personnage (par ex. « sitting ») : donne-lui un nom avec opts.modelAnimation (ex. 'sit')
    (model.animations || []).forEach(function (clip, i) {
        const nm = i === 0 ? (opts.modelAnimation || 'default') : 'clip' + i;
        fixClip(model, clip, nm);
        actions[nm] = mixer.clipAction(clip);
    });
    const names = Object.keys(opts.animations || {});
    for (let i = 0; i < names.length; i++) {
        const f = await loadFBX(opts.animations[names[i]]);
        if (f.animations && f.animations[0]) {
            const clip = f.animations[0].clone();
            clip.name = names[i];
            fixClip(model, clip, names[i]);
            actions[names[i]] = mixer.clipAction(clip);
        }
    }

    let current = null;
    function play(name, fade) {
        const next = actions[name];
        if (!next || next === current) return !!next;
        next.reset().setEffectiveWeight(1).play();
        if (current) current.crossFadeTo(next, fade == null ? 0.25 : fade, false);
        current = next;
        return true;
    }

    return {
        root: root,
        model: model,
        mixer: mixer,
        actions: actions,
        play: play,
        update: function (dt) { mixer.update(dt); }
    };
}
