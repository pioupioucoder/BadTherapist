// avatar-body.js – simple LANCEUR : crée le corps d'Evelyn (engine/evelyn-core.js) et les corps des PNJ (npcs/driver.js), qui n'ont rien en commun.
// outside.js appelle toujours createBodies(scene, o). Quand outside.js appellera directement createEvelynBody et createNpcBodies, ce fichier pourra être supprimé.
// Réglage / test : BadTherapistBodies.list()

import * as THREE from 'three';
import { loadMixamoAvatar } from '../avatar-loader.js';
import { Bubbles } from './speech-bubbles.js';
import { society } from './society.js';
import { createEvelynBody } from './evelyn-core.js';
import { createNpcBodies } from '../npcs/driver.js';

export function createBodies(scene, o) {
    const evelyn = createEvelynBody(scene, Object.assign({}, o, { society: society, THREE: THREE, loadMixamoAvatar: loadMixamoAvatar, Bubbles: Bubbles }));
    const npcs = createNpcBodies(scene, o);
    const api = {
        update: function (dt) { evelyn.update(dt); npcs.update(dt); },
        list: function () { return evelyn.list().concat(npcs.list()); }
    };
    window.BadTherapistBodies = api;
    return api;
}
