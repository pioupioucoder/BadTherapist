import * as THREE from 'three';

// lightpool.js – « flaque de lumière » posée sur le sol (lampadaires, porche, façade éclairée par ses fenêtres).
// Un simple disque dégradé, additif : aucune vraie lumière (donc aucun coût), il ne clignote ni n'apparaît d'un
// coup quand on approche, et il est identique dans la rue et dans la vue par la fenêtre de la chambre.

let TEX = null;
const MATS = new Map();

function gradient() {
    if (TEX) return TEX;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.16)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    TEX = new THREE.CanvasTexture(c);
    return TEX;
}

// parent : groupe ; (x, y, z) : centre dans le repère du groupe (y = hauteur du sol) ; r : rayon (m)
export function lightPool(parent, x, y, z, r, color, alpha) {
    const key = color + ':' + alpha;
    let m = MATS.get(key);
    if (!m) {
        m = new THREE.MeshBasicMaterial({
            map: gradient(), color: color, transparent: true, opacity: alpha,
            blending: THREE.AdditiveBlending, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -80
        });
        MATS.set(key, m);
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    mesh.renderOrder = 2;
    parent.add(mesh);
    return mesh;
}
