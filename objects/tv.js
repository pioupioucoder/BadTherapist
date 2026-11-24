import * as THREE from 'three';
import { createBookReader } from './bookreader.js';

// ==========================================
// ILLUSION — LA TÉLÉ (objects/tv.js)
// ==========================================
// Télé vintage + lecteur de disquettes sous la télé + étagère à disquettes.
// Chaque dossier de /videos = une disquette (liste dynamique via videos.php).
// Utilisation : buildTV(scene, { camera, canvas });

export function buildTV(scene, o) {
    const camera = o.camera;
    const canvas = o.canvas;

    // Mémoire de la télé : UNE clé « bt_tv_state » déclarée dans save-data.js (KEYS.tv).
    // save-data.js la redirige tout seul vers le bon profil (joueur / admin) et, pour l'admin, l'envoie au cloud.
    const TV_MEM_KEY = 'bt_tv_state';
    let lastTVMem = null;
    function readTVMem() {
        try {
            const raw = localStorage.getItem(TV_MEM_KEY);
            const o = raw ? JSON.parse(raw) : null;
            if (o && typeof o === 'object') { lastTVMem = JSON.stringify(o); return o; }
        } catch (e) {}
        return null;
    }
    function writeTVMem(obj) {
        const str = JSON.stringify(obj);
        if (str === lastTVMem) return;          // rien n'a changé : on n'écrit pas (pas d'envoi cloud pour rien)
        lastTVMem = str;
        try { localStorage.setItem(TV_MEM_KEY, str); } catch (e) {}
    }
    const tvInitial = readTVMem();              // état de la dernière partie (null = première partie)

    // ─── TÉLÉVISION ──────────────────────────────────────────────
    function createIconTexture(kind) {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const x = c.getContext('2d');
        x.clearRect(0, 0, 64, 64);
        x.strokeStyle = '#ffffff';
        x.lineWidth = 8;
        x.lineCap = 'round';
        x.beginPath();
        if (kind === 'power') {                 // ⏻ : cercle ouvert en haut + trait vertical
            x.arc(32, 35, 17, -Math.PI / 2 + 0.7, -Math.PI / 2 - 0.7 + Math.PI * 2);
            x.moveTo(32, 9); x.lineTo(32, 30);
        } else {                                // + (vidéo suivante) / − (vidéo précédente)
            x.moveTo(14, 32); x.lineTo(50, 32);
            if (kind === 'plus') { x.moveTo(32, 14); x.lineTo(32, 50); }
        }
        x.stroke();
        return new THREE.CanvasTexture(c);
    }

    // Vidéos de la télé : chaque sous-dossier de /videos = une disquette.
    // Liste lue dynamiquement via videos.php (rien à écrire à la main). Disquette par défaut : Zeph.
    // Lecture ALÉATOIRE sans répétition : on tire dans un « sac » mélangé, et on ne rejoue une vidéo
    // que quand toutes celles de la disquette ont été vues.
    const TVTapes = {
        cassettes: [],
        current: null,
        bags: {},      // nom de disquette → { queue: [fichiers], last: dernier fichier joué }
        refresh() {
            const getJson = url => fetch(url + '?t=' + Date.now())
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
            // En ligne il n'y a pas de PHP (le serveur renvoie le texte de videos.php) : on lit alors assets-manifest.json,
            // déjà tenu à jour avec le reste du jeu, et on en déduit les disquettes (dossiers de videos/) et leurs vidéos.
            const fromManifest = () => getJson('assets-manifest.json').then(m => {
                const isVid = /\.(mp4|webm|ogv|mov|m4v)$/i, by = {}, loose = [];
                ((m && m.files) || []).forEach(f => {
                    const p = String((f && f.path) || '');
                    if (!/^videos\//i.test(p) || !isVid.test(p)) return;
                    const parts = p.split('/');
                    if (parts.length === 2) loose.push(parts[1]);
                    else if (parts.length === 3) (by[parts[1]] = by[parts[1]] || []).push(parts[2]);
                });
                const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
                const out = Object.keys(by).sort(cmp).map(n => ({ name: n, videos: by[n].sort(cmp) }));
                if (loose.length) out.push({ name: '(vrac)', videos: loose.sort(cmp), root: true });
                return { cassettes: out };
            });
            return getJson('videos.php')
                .catch(fromManifest)
                .then(data => {
                    this.cassettes = (data && data.cassettes) || [];
                    if (!this.cassettes.length) console.warn('[TV] aucune disquette trouvée dans /videos');
                    if (!this.current) {
                        const saved = (tvInitial && typeof tvInitial.disk === 'string') ? tvInitial.disk : null;
                        const pick = [saved, 'Zeph'].find(n => n && this.find(n));
                        this.current = pick || (this.cassettes[0] && this.cassettes[0].name) || null;
                    }
                })
                .catch(err => console.error('[TV] liste des vidéos illisible (ni videos.php ni assets-manifest.json)', err));
        },
        find(name) { return this.cassettes.find(c => c.name === name); },
        names() { return this.cassettes.map(c => c.name); },
        select(name) {
            this.current = name;
        },
        fillBag(c) {
            const bag = this.bags[c.name] || (this.bags[c.name] = { queue: [], last: null });
            // on enlève ce qui n'existe plus ; les nouvelles vidéos s'ajoutent au sac
            bag.queue = bag.queue.filter(f => c.videos.includes(f));
            if (!bag.queue.length) {
                const q = c.videos.slice();
                for (let i = q.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const tmp = q[i]; q[i] = q[j]; q[j] = tmp;
                }
                // pas deux fois la même d'affilée quand le sac se vide
                if (q.length > 1 && q[0] === bag.last) { const tmp = q[0]; q[0] = q[q.length - 1]; q[q.length - 1] = tmp; }
                bag.queue = q;
            }
            return bag;
        },
        pathOf(c, file) {
            const base = c.root ? 'videos/' : 'videos/' + encodeURIComponent(c.name) + '/';
            return base + encodeURIComponent(file);
        },
        // la prochaine vidéo, SANS la consommer (pour la précharger)
        peekPath() {
            const c = this.find(this.current);
            if (!c || !c.videos.length) return null;
            return this.pathOf(c, this.fillBag(c).queue[0]);
        },
        nextPath() {
            const c = this.find(this.current);
            if (!c || !c.videos.length) return null;
            const bag = this.fillBag(c);
            const file = bag.queue.shift();
            bag.last = file;
            return this.pathOf(c, file);
        }
    };
    window.TVTapes = TVTapes;
    let tapesReady = null;
    function ensureTVTapes() {
        if (!tapesReady) tapesReady = TVTapes.refresh();
        return tapesReady.then(() => TVTapes);
    }

    function getNextVideoPath() {
        return ensureTVTapes().then(t => {
            const path = t.nextPath();
            if (!path) throw new Error('aucune vidéo sur la disquette');
            return path;
        });
    }

    function createVintageTV() {
        const group = new THREE.Group();
        // Le poste est surélevé : le lecteur de disquettes prend la place sous la télé (sans toucher l'étagère du bas)
        const top = new THREE.Group();
        top.position.y = 0.11;
        group.add(top);
        const shelfMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.0), shelfMat);
        shelf.position.set(0, 0.30, 0);
        shelf.castShadow = true;
        shelf.receiveShadow = true;
        group.add(shelf);

        const legMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
        const legPositions = [
            [-0.75, 0.15, -0.40],
            [0.75, 0.15, -0.40],
            [-0.75, 0.15, 0.40],
            [0.75, 0.15, 0.40]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.30, 6), legMat);
            leg.position.set(pos[0], pos[1], pos[2]);
            leg.castShadow = true;
            group.add(leg);
        });



        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.7), bodyMat);
        body.position.set(0, 0.90, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        top.add(body);

        const screenWidth = 1.05,
            screenHeight = 0.68;
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, screenHeight), blackMat);
        screen.position.set(0, 0.90, 0.39);
        top.add(screen);

        const video = document.createElement('video');
        video.loop = false;
        video.muted = false;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        video.preload = "metadata";   // la télé est éteinte au départ : on ne télécharge rien avant de l'allumer

        let history = [];
        let historyIndex = -1;

        // ── Anti-coupures : la vidéo SUIVANTE est téléchargée en mémoire pendant que l'actuelle joue.
        //    Quand elle démarre, elle est lue depuis la mémoire : plus de chargement en cours de route. ──
        const blobCache = new Map();    // chemin → blob: URL
        const inflight = new Set();
        function prefetch(path) {
            if (!path || blobCache.has(path) || inflight.has(path)) return;
            inflight.add(path);
            fetch(path)
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
                .then(b => { blobCache.set(path, URL.createObjectURL(b)); prune(); })
                .catch(() => {})
                .then(() => { inflight.delete(path); });
        }
        function prune() {
            // on garde : la vidéo actuelle, la précédente (bouton −) et la suivante
            const keep = new Set([history[historyIndex], history[historyIndex - 1], TVTapes.peekPath()]);
            blobCache.forEach((url, path) => {
                if (!keep.has(path)) { URL.revokeObjectURL(url); blobCache.delete(path); }
            });
        }
        function clearBlobs() {
            blobCache.forEach(url => URL.revokeObjectURL(url));
            blobCache.clear();
        }
        video.addEventListener('canplaythrough', function () {
            if (window._isOn && window._tvHasDisk) prefetch(TVTapes.peekPath());
        });

        function setSource(path) {
            video.src = blobCache.get(path) || path;
            video.load();
            if (window._isOn) {
                video.preload = 'auto';
                video.play().catch(() => {});
            }
        }

        function loadVideoAndAddToHistory(videoPath) {
            const fullPath = videoPath;

            if (historyIndex < history.length - 1) {
                history = history.slice(0, historyIndex + 1);
            }
            history.push(fullPath);
            historyIndex = history.length - 1;

            setSource(fullPath);
        }

        function loadRandomVideo() {
            getNextVideoPath()
                .then(videoPath => {
                    loadVideoAndAddToHistory(videoPath);
                })
                .catch(err => {
                    console.error('❌ Aucune vidéo disponible pour la télé', err);
                });
        }

        function nextVideo() {
            if (!window._tvHasDisk) return;
            getNextVideoPath()
                .then(videoPath => {
                    const fullPath = videoPath;
                    if (historyIndex < history.length - 1) {
                        history = history.slice(0, historyIndex + 1);
                    }
                    history.push(fullPath);
                    historyIndex = history.length - 1;
                    setSource(fullPath);
                });
        }

        function prevVideo() {
            if (!window._tvHasDisk) return;
            if (historyIndex <= 0) {                // pas de vidéo précédente : on relance celle en cours
                try { video.currentTime = 0; if (window._isOn) video.play().catch(() => {}); } catch (e) {}
                return;
            }
            historyIndex--;
            setSource(history[historyIndex]);
        }

        loadRandomVideo();

        video.addEventListener('ended', function() {
            loadRandomVideo();
        });

        // ── La télé est ÉTEINTE au départ : rien ne joue tant qu'on ne l'allume pas ──
        window._isOn = false;
        window._tvHasDisk = false;
        video.pause();

        // ── Mémoire : la télé retrouve l'état de la dernière partie (allumée/éteinte, volume, disquette dans le lecteur).
        //    Première partie (rien de sauvegardé) : télé ÉTEINTE, disquette Zeph dans le lecteur. ──
        const initialState = tvInitial;
        let volumeSetting = (initialState && initialState.volume > 0) ? initialState.volume : 0.6;
        let savedDiskName;        // undefined = jamais choisi (1re partie) ; null = éjectée ; sinon nom de la disquette insérée
        let stateReady = false;   // on ne sauvegarde qu'une fois l'état restauré (sinon on écraserait la mémoire)

        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        window._videoTexture = videoTexture;
        const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });

        function saveTVState() {
            if (!stateReady) return;
            writeTVMem({
                isOn: !!window._isOn,
                volume: volumeSetting,
                disk: savedDiskName
            });
        }

        // ── Son réaliste : WebAudio (volume + filtre "étouffé" selon l'endroit où on se trouve) ──
        let actx = null, lpNode = null, gainNode = null;
        function initAudioGraph() {
            if (actx) return;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                actx = new AC();
                const src = actx.createMediaElementSource(video);
                lpNode = actx.createBiquadFilter();
                lpNode.type = 'lowpass';
                lpNode.frequency.value = 20000;
                gainNode = actx.createGain();
                gainNode.gain.value = 0;
                src.connect(lpNode);
                lpNode.connect(gainNode);
                gainNode.connect(actx.destination);
                video.volume = 1;
            } catch (e) {
                console.warn('[TV] WebAudio indisponible, volume simple utilisé.', e);
                actx = null; lpNode = null; gainNode = null;
            }
        }

        let curGain = 0, curCut = 20000;
        video.volume = 0;
        function audioUpdate(dt, targetGain, targetCut) {
            if (!window._isOn) targetGain = 0;
            const k = Math.min(1, dt * 5);
            curGain += (targetGain - curGain) * k;
            curCut += (targetCut - curCut) * k;
            if (gainNode) {
                gainNode.gain.value = curGain * volumeSetting;
                lpNode.frequency.value = curCut;
            } else {
                video.volume = Math.max(0, Math.min(1, curGain * volumeSetting));
            }
        }

        // Écran : la vidéo ne s'affiche que si la télé est allumée ET qu'une disquette est dans le lecteur
        function applyScreen() {
            if (window._isOn && window._tvHasDisk) {
                screen.material = videoMaterial;
                video.preload = 'auto';
                if (video.src) video.play().catch(err => {
                    if (!err || err.name !== 'AbortError') console.warn('[TV] lecture impossible :', err);
                });
            } else {
                video.pause();
                screen.material = blackMat;
            }
            screen.material.needsUpdate = true;
        }

        function setPower(on) {
            window._isOn = !!on;
            if (on) {
                initAudioGraph();
                if (actx && actx.state === 'suspended') actx.resume();
                if (window._tvRefreshDisks) window._tvRefreshDisks();
            }
            applyScreen();
            saveTVState();
        }

        video.addEventListener('error', function(e) {
            console.error('❌ Erreur vidéo :', video.src, e);
        });

        const frameMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.04), frameMat);
        frame.position.set(0, 0.90, 0.35);
        top.add(frame);

        const knobMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.4 });
        const knobConfigs = [
            { x: -0.4, symbol: 'power', action: 'power' },
            { x: 0, symbol: 'plus', action: 'next' },
            { x: 0.4, symbol: 'minus', action: 'prev' }
        ];
        const knobMeshes = [];
        knobConfigs.forEach((cfg) => {
            const mat = knobMat.clone();
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.10, 8), mat);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(cfg.x, 0.47, 0.42);
            knob.castShadow = true;
            top.add(knob);
            knobMeshes.push(knob);
            knob.userData.action = cfg.action;
            const iconTex = createIconTexture(cfg.symbol);
            const iconMat = new THREE.MeshBasicMaterial({
                map: iconTex,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false
            });
            const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.10), iconMat);
            // enfant du bouton : suit son enfoncement ; le cylindre est couché, sa face avant = +y local
            icon.rotation.x = -Math.PI / 2;
            icon.position.set(0, 0.052, 0);
            knob.add(icon);
        });
        const antMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const start1 = new THREE.Vector3(-0.30, 1.35, 0.1);
        const end1 = new THREE.Vector3(-0.40, 2.05, 0.15);
        const mid1 = new THREE.Vector3().addVectors(start1, end1).multiplyScalar(0.5);
        const dir1 = new THREE.Vector3().subVectors(end1, start1);
        const len1 = dir1.length();
        dir1.normalize();
        const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len1, 4), antMat);
        ant1.position.copy(mid1);
        ant1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir1);
        top.add(ant1);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const ball1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), ballMat);
        ball1.position.copy(end1);
        top.add(ball1);
        const start2 = new THREE.Vector3(0.30, 1.35, 0.1);
        const end2 = new THREE.Vector3(0.40, 2.05, 0.15);
        const mid2 = new THREE.Vector3().addVectors(start2, end2).multiplyScalar(0.5);
        const dir2 = new THREE.Vector3().subVectors(end2, start2);
        const len2 = dir2.length();
        dir2.normalize();
        const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len2, 4), antMat);
        ant2.position.copy(mid2);
        ant2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir2);
        top.add(ant2);
        const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), ballMat);
        ball2.position.copy(end2);
        top.add(ball2);

        group.position.set(-7, 0.0, 7.2);
        group.rotation.y = +Math.PI / 1.2;
        scene.add(group);

        window._knobMeshes = knobMeshes;
        window._screen = screen;
        window._video = video;
        window._blackMat = blackMat;
        window._tvSetPower = setPower;
        window._tvSave = saveTVState;
        window._tvAudioUpdate = audioUpdate;
        window._tvPosition = group.position.clone();

        function highlightKnob(knob) {
            if (knob) {
                knob.material.color.setHex(0xcccccc);
                knob.material.emissive = new THREE.Color(0xffffaa);
                knob.material.emissiveIntensity = 0.2;
            }
        }

        function unhighlightKnob(knob) {
            if (knob) {
                knob.material.color.setHex(0x888888);
                knob.material.emissive = new THREE.Color(0x000000);
                knob.material.emissiveIntensity = 0;
            }
        }

        function animateKnobPress(knob, callback) {
            const originalY = knob.position.y;
            const targetY = originalY - 0.02;
            const duration = 150;
            const startTime = performance.now();

            function press(time) {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentY = originalY + (targetY - originalY) * eased;
                knob.position.y = currentY;
                if (progress < 1) {
                    requestAnimationFrame(press);
                } else {
                    const upStart = performance.now();
                    function up(time2) {
                        const elapsed2 = time2 - upStart;
                        const progress2 = Math.min(elapsed2 / duration, 1);
                        const eased2 = 1 - Math.pow(1 - progress2, 3);
                        const currentY2 = targetY + (originalY - targetY) * eased2;
                        knob.position.y = currentY2;
                        if (progress2 < 1) {
                            requestAnimationFrame(up);
                        } else {
                            knob.position.y = originalY;
                            if (callback) callback();
                        }
                    }
                    requestAnimationFrame(up);
                }
            }
            requestAnimationFrame(press);
        }

        window._highlightKnob = highlightKnob;
        window._unhighlightKnob = unhighlightKnob;
        window._animateKnobPress = animateKnobPress;
        window._nextVideo = nextVideo;
        window._prevVideo = prevVideo;

        // ── LECTEUR DE DISQUETTES (sous la télé) + ÉTAGÈRE À DISQUETTES ──
        // Chaque dossier de /videos = une disquette 3,5" rangée dans l'étagère. Survol = on lit le nom du dossier.
        // Clic sur une disquette = elle glisse dans le lecteur et la télé joue ses vidéos (au hasard).
        // Clic sur la disquette insérée ou sur le bouton du lecteur = éjection.
        (function buildFloppySystem() {
            const DRIVE = { x: 0, y: 0.45, zFront: 0.32, fx: -0.10 };   // lecteur 0,9 × 0,22 × 0,5 posé sur l'étagère (dessus à 0,56)
            // Étagère murale : accrochée au mur du fond (z = 8), à gauche de la télé.
            const shelfFrame = new THREE.Object3D();
            group.add(shelfFrame);
            group.updateMatrixWorld(true);
            shelfFrame.position.copy(group.worldToLocal(new THREE.Vector3(-5.0, 1.25, 7.985)));
            shelfFrame.rotation.y = Math.PI - group.rotation.y;     // fait face à la pièce (-z monde)
            shelfFrame.updateMatrix();
            const FW = 0.22, FT = 0.014;
            const flatQuat = new THREE.Quaternion();
            const boxQuat = shelfFrame.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ')));
            const insertedPos = new THREE.Vector3(DRIVE.fx, DRIVE.y, DRIVE.zFront - FW / 2 + 0.03);
            const frontPos = new THREE.Vector3(DRIVE.fx, DRIVE.y, DRIVE.zFront + 0.28);
            const readyPos = new THREE.Vector3(DRIVE.fx, DRIVE.y + 0.16, DRIVE.zFront + 0.32);

            function textTex(w, h, bg, fg, font, text, y) {
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const x = c.getContext('2d');
                x.fillStyle = bg; x.fillRect(0, 0, w, h);
                x.fillStyle = fg; x.font = font;
                x.textAlign = 'center'; x.textBaseline = 'middle';
                x.fillText(text, w / 2, y);
                return new THREE.CanvasTexture(c);
            }

            // ─ Lecteur ─
            const drive = new THREE.Group();
            const dBody = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.22, 0.50), new THREE.MeshLambertMaterial({ color: 0xd2c6ac }));
            dBody.position.set(DRIVE.x, DRIVE.y, DRIVE.zFront - 0.25);
            dBody.castShadow = true; dBody.receiveShadow = true;
            drive.add(dBody);
            const dPanel = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.17, 0.01), new THREE.MeshLambertMaterial({ color: 0xbfb398 }));
            dPanel.position.set(DRIVE.x, DRIVE.y, DRIVE.zFront + 0.002);
            drive.add(dPanel);
            const dSlot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.024, 0.012), new THREE.MeshBasicMaterial({ color: 0x050505 }));
            dSlot.position.set(DRIVE.fx, DRIVE.y, DRIVE.zFront + 0.009);
            drive.add(dSlot);
            const ledMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
            const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), ledMat);
            led.position.set(DRIVE.x + 0.30, DRIVE.y + 0.055, DRIVE.zFront + 0.0085);
            drive.add(led);
            const ejectBtn = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.02), new THREE.MeshLambertMaterial({ color: 0x6d6d6d }));
            ejectBtn.position.set(DRIVE.x + 0.30, DRIVE.y - 0.01, DRIVE.zFront + 0.015);
            ejectBtn.userData.eject = true;
            drive.add(ejectBtn);
            // Étiquette du lecteur : affiche le nom de la disquette insérée (lisible aussi sur téléphone)
            const dlCanvas = document.createElement('canvas');
            dlCanvas.width = 460; dlCanvas.height = 50;
            const dlTex = new THREE.CanvasTexture(dlCanvas);
            function drawDriveLabel(name) {
                const x = dlCanvas.getContext('2d');
                x.fillStyle = '#bfb398'; x.fillRect(0, 0, 460, 50);
                x.fillStyle = '#4a3f2e';
                x.textAlign = 'left'; x.textBaseline = 'middle';
                let txt = name ? '▶ ' + name : 'DISK DRIVE 3½"  — vide —';
                let size = 30;
                do { x.font = 'bold ' + size + 'px "Courier New", monospace'; size -= 2; } while (x.measureText(txt).width > 440 && size > 12);
                x.fillText(txt, 10, 27);
                dlTex.needsUpdate = true;
            }
            drawDriveLabel(null);
            const dLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.05), new THREE.MeshBasicMaterial({ map: dlTex }));
            dLabel.position.set(DRIVE.x - 0.17, DRIVE.y - 0.065, DRIVE.zFront + 0.0085);
            drive.add(dLabel);
            for (let i = 0; i < 3; i++) {
                const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0x6b6050 }));
                v.position.set(DRIVE.x + 0.30, DRIVE.y - 0.07 - i * 0.0, DRIVE.zFront + 0.008);
                v.position.y = DRIVE.y + 0.0 - 0.07 + i * 0.0;
                if (i === 0) { v.position.set(DRIVE.x + 0.13, DRIVE.y + 0.05, DRIVE.zFront + 0.008); }
                if (i === 1) { v.position.set(DRIVE.x + 0.13, DRIVE.y + 0.035, DRIVE.zFront + 0.008); }
                if (i === 2) { v.position.set(DRIVE.x + 0.13, DRIVE.y + 0.02, DRIVE.zFront + 0.008); }
                drive.add(v);
            }
            group.add(drive);

            // ─ Grande étagère murale (bibliothèque accrochée au mur du fond) ─
            // Caisson en bois : 2 montants, fond, 3 planches, corniche moulurée avec le ruban orange
            // (sensibilisation à l'automutilation). Rayon du haut = les disquettes debout, étiquettes de face ;
            // rayon du bas = des livres. Repère local (shelfFrame) : origine = dessus de la planche à disquettes,
            // contre le mur ; +z = vers la pièce.
            const tableGroup = new THREE.Group();
            tableGroup.userData.box = true;
            shelfFrame.add(tableGroup);

            const grainTex = (function () {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const x = c.getContext('2d');
                x.fillStyle = '#6f4526'; x.fillRect(0, 0, 256, 256);
                for (let i = 0; i < 170; i++) {
                    const dark = Math.random() < 0.55;
                    x.fillStyle = (dark ? 'rgba(38,18,6,' : 'rgba(170,115,65,') + (0.05 + Math.random() * 0.14) + ')';
                    x.fillRect(0, Math.random() * 256, 256, 1 + Math.random() * 3);
                }
                const t = new THREE.CanvasTexture(c);
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                return t;
            })();
            const woodMat = new THREE.MeshLambertMaterial({ map: grainTex, color: 0xd6b08a });
            const woodDarkMat = new THREE.MeshLambertMaterial({ map: grainTex, color: 0xa9825d });
            const backMat = new THREE.MeshLambertMaterial({ color: 0x4a301c });

            // Ruban orange : ton image (fond blanc retiré), légèrement auto-éclairé pour rester visible dans le noir
            const RIBBON_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHkAAADICAYAAADMbE6ZAABqnklEQVR42u29ebikV1Uu/q619/6q6ow9d6c76YwESJBJRMFod1SUq4KiVl/Un4giItOVQURUPH0ASSCAoMgMKojDOV7hOuK9aroVUGRwIgECJJB0xp77DFXft/da6/fH3l/VaYkhQNLphNTz5EnOSeXkdK1vTe9617sI94GXGQiLfaY9i9J+79o/+ZWzZ9Mtj3cyfKTz7iEEPh9iS53u9ImmiUNmSJjoNml1dTMzd9XQTbp6QyS7boDeB4/5jVde9MOvuQaWAABXzu3yu/fuFyLYve3zoXu9gefmmObnFQDe89wfn7n0Inl80yz9yATHS7du7G5CGsA6GzGwiWUx3NzpTl3TRD3EDO1OdGVwYulBzvGEJpnh1aMXdKeApdXjON7EleDDp5eXeXFp9pG//4invvJGAFhY6Ls9ax6m+418dxu4D0eLkE+940XT3aOf+pEqHp3bvp7PRocBVWhnSmNnvTrugtk3CN3PC3X+NfQmPgUYaUybWWWrpOE2JNmiNjxf5HiF4SEKzSq7aIjLKzisvRPHUvWGq4/YG3/4tf90m82BsRd2b/Fqvjcad25ujm0OTIuQj7zupx+1/sjHP3JOOPCubb2Vs1djLcO6lsY5M8dM2nhQ9AL1EBsytKfN4MFo4hYmsFrcYCqbDWmbWtODJQcOnELHBo608V426eGZB9GBl148sfKJD13+pB+heVIimM3dOz6/e52RF/p9Nz8/rzTv9PrLL738AcP//PCmdNuDm5WhrAoZsXNE7IiIcqiyEq5IAW4MHAEkOGoARICjERJADUCWg5sBZmQmLM65AXetFkk7/eEdF8f/WLxm/ht/78/+7GMTNA+1ubnT/jP096rwvNB3tGdR/uENz9185sp//OGZctN3xuEqmjCpXFWuSwK1BFAHRICZgQhGRMRgBQA2IxAbFFAzD1OQkYGMs5GZQAwiAzHgqIZ5pWHqeDQrxvVNenb36FPCx3/6wR+64ue+n140f9tCv+/2LJ6+efpe48lXzu3ytGdR/uVNP/eQ84987ENnN5/9zuXVY6nhnhk5NhCMCACBmEBfUm5YdtORY5OBLHs7kVn+AYCVj4Qsv4USgAiDwVxFtZ9yS6sn4jmDz3zTjqP7/v7KNz5r257FRTmdPZrvLR586fz+9G9v+OlHbL3lo383q198wMqgSR7ee2vIWwOCIlEHwiU4EeW/QG3QjiCKxWr/pQUzOqkSNUJbUgl5CDE8GgTUCJRg3A1HBj5tTzddfObBv/v7Tyw8d/Pe+XnMnaY5+rQ38kI/h+gPv/Vnv2Hmtn/5wI6VT29pBiLiu56gABGMsxMyFIBCyKBEADkQeVJjGNxxYj4B5iWYEWAexmowyqEaAKS4uoMqQ0EgMACGsIOUfB0USFXwK81qPCcdeLD/9MffPQ/W3fvAp2PHclob2ebmeM/iovz725575llf3PeBHSuf3mJxKMzsYMAowqJ1PAMTgan8se6CBoeIwEQg4vLjCOoGULcCcxz0xEp88OoXHv/p+W99zaX7kWyhz/cb+StBsTCP6z/84V7vmr9/3+bBge11Yhn6KacAOtKAqYRlJoA5N650BwCAjixnoOKmRkQgzf8NrbXul/yc9p9ZHLw4NFZh1YXQrN6UtsQvvPATlz/pcbRnURYW+u5+I9+Z195djuZZl9/3c79xvhx41GBoKfpJV1OAswjAwRAAWuPRXyZYGsjK3wg6ficR6Z3yam4NXyEowZmh9hVWfMXd4c02s3TN297//ndM969aNIPR/Ub+cpX0/P7077/6mB87Nx54xmBpKQUS35FVdGwAbxGJKqRRkYWTw/Oo4CoObAWdIqtACDCK+f0SADgzdW2l/d9bOJflRITkDOAaHQzQEUHHiLWBnI3bzrn4429+Ic1DsbCH7zfyHeThS+f3p4+/8WkXTNU3vcMtHRFhuIYJAgc1D6UKjhKcJRA4h9m25QGDyAGUyzADgchFIkqAzEDTBphbhoMCNmUmkwbtmaIDGJsazOxk4xYDayns2AxKAYk8YAI1QaLgmuUl3Ri/+EsfeuOzzqY9i3K6IGKnnZH3YR+bWejc8Mm3bB8e6i15wJjJC+4gAJbiiGmUS7/sS++a35eIAGJ4HpJwbVWoOxsP/8Nlp9NHy6dbmL50fn/6j1de8rMP0C9+p19ZStHBKQBnpTSi8tfafybALP81/uDHcdxg4144/53BJZmTWdsd325BTuNcMP6549A9fmgIZh2uV8y2rN705I+/8ccuwDxs7jQASfh0CtP75vfrNe+ZO3PDidvmdPlWiZ64Sgwyg7DeYQPaYh9f5j1mRJb92Gztn/7OTJToDr4vHOAB6qrJegxo9uZPPosA2435+408el19Nc0DGj73d6/Y0dy2uTbDwIO9MNgMwnY71fKaHrl49ZdagsaltQHEnHENGwfs/F+1zTX9lx7bRv/4X/+ONf25wGDWgHXo6qa2Kbvtx//j7f9r6+55iNk9C5CcFka2ft/R4qLc8paffsy61eufsjI4IWxwXg3iEpQIDF88dRyCQQWBpPy1jr6vo7BNxGUAQUoMZYPCwPkvUwKDFBWrelIuYBitCfUAWKFsMDIYKUD5/8ZkcGRwMDjLCBuzUgLJplBv8bd86PEE2L69cPd78kWLRuygBz7x8nX1TfSl3nS6v3KfrkQwYjgw2WBoncHwp0EOu/dCvq6NbAt9R/PQ6377qd8609z6ncM6qRK7tm5qi6tcVVE7bzi56PkyuRpERmRmRgQGtAR4VTiYFeTLmG7359rYq60AZeV91kYOs1LcFfRbzemwsS166Fs//cbvfWgmGNxzBdg978lXLRqI4W/8t5dONEeROJg3+RqdmL7E0WCUYNDSBIsqYKYMkKmamZG1RtU7+X/Pzw+DCPBGYGPAXPme6pRfcXr04Pflt+77+jSyLfQd5mE3v+VnvnnD8MbvrodDBbHztpagYTjZw04aH47Gw2YEQ67E2RJYJVdaBpBaINJ1gMwANgHTabBWRGRk1iPoeu9sAkZQZbARaDScojvMG2Ug3SZ5AAQlQJmokYjp1ePfB7Bhfr98fXryYq6d5Iarfr4nS9Q4ViWB0jhKtmGRNBtMiJCIR9AlQxEsIViCNwNRhWQdEwQFe1FzyYyWDFiB8fEEPgKiE8zhCLvujcrh08rdf2lQfWQIW2GXQKgNGEJJYTAQtw+awSDjnnlNcy1kUKcwyv9eyLkYFevi4Udd9cbnn02453rme8zINjfHtLiot/7hr5wfmuNP1MGqMZmjNS3LGmSxOK+CISCkbAB2SFQhUjAxqEhKg+FARIUCG6Necr6bPEu9fuXE4EyIbhscO/6dw+Xhw5qlo99XH7nxaVovP3a4cuyM4eqKc5oMGpOCVaky5QAjXgO1Ee7suJgAIIn2nHaWb/7YgwFg9757JmTfYxyvfTlHJVy3/5lb6OCkmiUC/KjAygPjUdmj1E4V21ANQ70sXioWDcydLvWmZtilhMawupI6t6rrXcsD/xmuJj4fqnCbdcOwV00MEDCQ6KfJZIdnfrCwfRPJ8Mxg3SnECo6AejCAbwYJlZGwZ0IsCLZrf6Mvyf5mZc5F+ff3MHVW8+bO8EcA+sDuZ+837P86MbIZiGh/OvKxj83a+578o7JyyIQrBiLYUDzH2vfmeMMehgCLhBgVVc+oF9hTbwLH3bojdXfms0Dnoyd6M/9sm8//0OGz+jc95CEPae50C3Tdtd3DH3/tJUr8zZJWH0tV5zs2dVe6rA2OHF6CByWCc0TczqNyiDHg9vq9/GA6gigm6hu/EcTAHtGvH0/eu8sB+9PyP73q+87Qpe0mIomCM8sUngwpt7AxwcxB6wQODo2YhW4FTGw8dkvY8H/qqbPev7rlvI88ZM/Lbjn5g57PxIO9uxwu3nKyBfoXGRavHs+T9ywKnXvuEMDflr/wuT9/0QOwdNsTefmL32+T1WNmaLmzcttBpFVF5RjkFJC1RRl9ibENjjUKHA8uuPK3nrGNnvOmW/IDfmoRgHsoXO9XgFAduf4nfX3cGnhQ8WIDoI5zNIwKEwYcA9qgnpxCZ2q9Tm/d5g7PPGhux0+847fW+BFhrhj0qosM8/Nlw2F/urPRBYt9xuaLCPvmlZ5wxWcBvBbAa/918VkXD459+lnT0+HHfH3rTLIBxTpScIzK5ZEmaftgWiF6GZwJJYVOepq68NgXvhnA/8Fin4FTS9895UZud5euec9lZ7qr3vGt2gxJKbDTTKADDEPxiMZQbRAh6PYqVFsfhM6Wc1F5D0uKlRNpc2nDKvQXIxEM83fOoP/d8GLth29zc4zd+xj79iv133QVgGff/Pr/ecPs9P7LllePJx8rDxiaWsAAgnNr8vNaR2XtOeFbh0cvyLjAbXTfD9cX5zA5dfDD/Y04MSkCIYZzyLhxgkGGTcaJp2cxseUsTJxxFkJnGnUyNPWAO43YutD87Bff+7zfpT2vvzajSfN3aQik+XnFfK6u7K3fGHDT98vnD/z1+RtrBXUn4DwBqgAxJEnpk3NhOGoG8kCEEFdBPHg0AOzbd+orr1Na0htAtGdRzKzjVg/8nA6OQ1wgIoUasFILVlQhM11MnHc+Nlz8TZg97xsgfh2Gywk0WEUgJTHIDC1tnThx6+PsbkaTzED0jI/Hq75nZh3b4R+xVQGlGSfikFL+CCd6XZgA9TBBxDKzc5R8PSANerJyrpnRvt3Q+7SRMTdHAHD0PS94UGdw5EKRZCZMMlQkA1K3Qti6DTMPfQw6Fz4aNrkJw9Uh/GAZlRmYPFQzDSgNBtasDh9DgH1JYXVXvvb0GQDZlR962DridUvdqKI1MTyC60KVMKwjfKdCd6ILgDBYjSN40yCsEQgWH/ThN+/dPD8PPdUk/FP6Pyu9MYa3fP77Z3WASkRcTKTqMJyaQfdBD8PMg74Zfmor4kDQDIYgNRh7KCk0JaTVBpDkmkbQUX3yZ9/+/Asyn+ruQpMWAcDC0oFnTsShhc6kejTQpAAIrupCKGAYBcoMDhVCVUEEaBIQEFFjEqE+2jvj8Ed792nEywDaPb9fzKzTTYf/p5w4guGQeLk3ATn3PMw+5FGY3HI2JHnUK0NoquEIGQ9WQWoapNiAR2RpJ+vj8U73yM1PWfsA3dWhGgvQKxfeOIVm5RKLywRmZt8FgZCSwIwQQgUgIEaGaMZLqAIkJkgNYhOZmHD+OMVHAsDei/t0nzTyYr/PBNixP/7Fi2npxofEFC3NznL3wodh+oEPBybWoakVEgkODM8Am0JTRBwOABV4dnAgpCaiaRqWtAJKx3/kk5/8ZLV7710/ANi3d5cjgm3+zP/tn+GbMxKJxNiwwcOHAIAgSUFghNCDmUMyhrJDgqHqVaDgEQe1sUVM4ugZALDvFFfYp8zImy/KfzB38AuPnpABpQ2bpffQb0Fvy9mQoaIeNFCNYEpgUyApUl1DmwhP2fCSBE3TQFJCcJ6H4mQDmgfz+17xw0SwK+d23aXdwm7sV5hRdeTa/xWGS0i9WXJkkJhDtfcBANA0eYrJ3iGpIsFBuINIQBMCOoGgscEGuG8pOMF9M1wfvHq/AcDx48u7/NYzMHXxY0gnNyMOG1Cd4NXgAbA0SHGIZjgE1BC8A9TQNDXisAbM4JmhKQHmgOMrNjVceqEtLLh92K+4ixbOFsoY9KrfePIlG3n40NVatGHHwTt4IsQmgUAIPoAIiDGBmdDp9CACiBASeyTyoODA3qG57eZZANh99alFvE6ZkfsLuXXwG3qb+dxzoDQNrDYgTYALYGNQBFKjMAV8ARdik9A0DSwlBCY4GCxFSD2EyMCtGtmWUH/jZz73h4+bn4fdVQtnm6+6jQiw6VtvfHYPxjzZUT9cggkQPMMzQWIEmaETsqFTSoAZgvcgNQzBYOtgmTuAAROe7hFC0ykxspkREcyuXJjqdrrbbaiIzYCYAEcMWILEBjHWgCkYBBNFqiNiXYMN8OygqqjrIephnbfVKKAiMVu61QbLy08HYIuLi3cJKrd7fr98/vUv3omVI9/TNLV59o5dB8MEKHKxxcRIKXt0Dt25GCNi+BDAiaASweRYhLASqovnrryuS4sQO4UrrqfGkxfzXtDyLf/8zR2yB1rD5gMzw6AxITYNTBXeMRxlD0nDBlBFxT4XWzGhqWtADMH5POWJCmkGrqlXsUkH3/cfr/nZB/UXv3Ydj33Yl6n3hz7y3B2dwTpNUUiUvKvgfIUYFZIUPlQgcohNAoOLobkUYw4910GyBEtGtaswTIMtF1/zx53bGVrdB4y8ORddJkce3esQM3dFNSI2A2gUMGXsF6po6iG0iWAiBHYgVaS6gcQGnjiHcTNIEyF1A3aGxk/J9vp4p7r5My/K4MjVX7WXzAG8e36/fOw1c5u6yyd+ajhYte7EtJMEaFIET/COkZKO2idih5gURA5V1YEZkKLAjIGug5liVdkmnE6cf+DjGcPeO3cf8+Q2DA5Xd4AUknLfaypwzCAYYlMj1jUAg/e5VZIYcz5WhWcHMiDVEc2whhbPFwJqqtzq8RM2NTj2pA//cn8H+otfNaq0e9cuJsC2HP3gz22SExtj6AoB5H0FEwUkwXH22thEmAHeBzDlaGNmCCGv1CY1KDN81SER0mk239OjF95dff09a+R9+7PyjoSdGA4gaZUqJQT2UI2QuoakmAF+JmgSNPUQMUY4x2DHmUfVRGiMcMTwxIAoZFVQDZZp4CdkK+v6TSuHXkIE241dX/GfzQDavX+//NVfXdPhdOTpsBVTBE4SwSwIgZFi3np0juGDQxNrAIoqeDgCRBLYMUInAGzghmHOo+eDcTKoHr7kPld4GUA0DzUzamKzFURwDGIySGoQ6wYEoPIeRFaQrRrMnNsnGFKKaOohTBTBe8Dy+5qmBgEIjuEcu8MnlrUarDz1X+Z+6rzd8/u/8tXRhQzYXPDPz3vWzHBlJ2FSp5hY1KBqYHYIPiAmgaqCySO4CjHK2KPZoW4aAIwqVACAlAQAoaoqWDOYve9V1+2q4T8ubgrBbYMpYIKmGUIlwXnKHpAihsMBVCOco4x2SUQzHEBSA88M7xkqghRrmAgq7xAcQ1UgsSEj0i3xyGTnyOd/mQDb9xV4swG096pFW/jwQq+zetPzOQ1slQIZBN5XULVR5Vz5CjHm0bX3FZzzefoEB+c8HIdseDV472FmMDNOSTDZ6T7MzNyl8/vTqaqw734j791LANAcu+aslOLWOBgixUSOKOdjy0aLzRAOBs+UserYIDVNHsgzZwmn1CA1QzAM3jNgihhrpKYGVOG988tpVdctH/vJf3zOnoftnt8vC/07p9+xb26Xm5+HPvzv3/1TW2j1LHUdBUWuxeDIwzmPTMhHKbC6SElLbVCByWXDK8E7DyZGlARmRlWVh8QAVw82XXXVVe6+5cml0h0sHdncQepIEvMuj+FUEmIdc9XqAhw7WNLSUgmcYzgmqAjquobEhBDCqD+th0OoKJxzcEwwESxBbcPKCb9u+cDlBFj/oovsTgQb2o39es175maqw7e8AMcHNsE9mvSZyBBjBMHB+woiOXTn4ssjiUBUwM6BvYeowcDwvgKzQ0wJRoAPDiYKkjoBV983Yc1OqtHVIbyHqSjFmKBNAwdC8B4mAqkjpI5wIDhHIBXEeogYazjKHqKiSDFmtIk4PxiqSCkixiE65NwyNbLJDj1+/wu+97E0P69f1pv37nI0D+1d969P21rx+eo6onGFExy8D7knVwPg4HwHKgoVgWOCcw7JFAkCOAI5hkhupxxXMHKoRWCOyTNDlCaG1141cyp75VNmZDJhdgyRiBgbqAg85YX/2DSITUa7Ku/gmWFJ0DSlVfI+02q0fE9y6+WYICmDKVpam4AEoQC/sorOoRteChD6Fy3aHeViYLde+ca5KTty8Jlx6bBRz3F0gNYRnhxCCDAzqCqIcgElopCSc73zGQChbHTmHGmYOffRlJEwkEPo9iZw5MjsqeyVT12fTEaa2hYIcEQwE6SmhqaYPZUJpjlcpxjhyME7D4giNjVSauAZ8J5yjm4aaGrgGHBMIFNobCAqrhk0elY88vgPPufbvo3moQv9298R3je3y9H8vJ5/9N9+6sx4+AGcohiUqQpgZmiKMKAUUDkHgxhV1YGqQRVwzsMHj5RSaa9aQwtgXCDQnLON4GAW7pPhWqJ6qMC7ItchKXsv8qTJMUEkIdZDkBmCy7lXU0KKEWSaBxSE8r0GQIFCOf+8lGqoBgQawrrBJgYrCEdvfel/JxZjAO3eu18+9Y5XTdOR216ULBl3JthqgISAjoMyRh4cQpVXVEVByO1TSgJJBu98Dt0pgcpDkWsHAdB6tIOq8WBl6O6TRjZHQp5hapAYIakFOnJhFVtAxLscmq146ghh8lBVpJQy4MAZ4syeHyGS4J0DcwWHiIajW2qg23TwuCuf+e2X7FnEl1Ta++YyKWDii/ufvTUunbVKQbjqsOeQcXEykHe5L8+sPQQfIGZIKmDv4UMFVcke7T1CCIgiEFOETgV2DhI11w/egQgktnpKkca7nZLbzoSE05FhbCCrNVXdTs5jmiCNQBoBGeBdyIaUBEkRRIAr8+QYY6a+EsG1Bo8RqgKDwXkPUwXZACkauhyhFdlEvYTppVt+DUTfPf5tWmVckn/+5jfM+L/7/efJ8IS5iWkHaYBAMGVoo/DBAw6IKUFE4LyDqwJiajIgwgRf+TxPplAAEUYjEfCMEDxiNDRNQocVzqfV9es2HgWAvZi/b3hy/6rcwqw0w0ZBuS0igpZeuPVUV0CNGBuIJATn4Zhh5XsmCd5TbpVUIE0D1QTHhBAcYOXnpTRKCS6wOzGsdcPq6nft/5nHPXbPIsRab967O1N7/v5vnrs1ntjKXa/BjERklIOZS+8LQqgqGIAkGb0KoQORrC7A7EuO1txeOQfvPSQJFFZ+FkPN4Ngt25ad2cjzp6a+PmVhY2rzxoGQUzalFBuLzbDkVIJvc2rM5L2Qkyy0eLSjPLQgZGRMYoRjyuGZAB2FdYL3DiBANUFSA3JsW/QEVc2BORBhEYtFnHW//tlbX7Bppl56QTwxtNhdR8Q5r0rKdLEQQg63almQreoAOa9mkCN0S9+cDR18BykJVA3BVyDvkVRgBIQQTEyRlFPaeGlzn8zJsbtlSdUGUg9gmjLeDMBU0QyHSDFmol5plUZtETBqn2JdQ8t/y5RFP2JdQ60twBhqOWebWabjdCt3LA5kS33kcfuf/b2P3rMIuWrvRYHmoQ+5+XPP38CHNvDMRpEaTKwjL0wpgczyjJjyKNGI4KsKBkJMUvD1DiQpVDIvfPR1ydHkHJLklNLpVABXdO21197HiHx78/oKuS0nVN3R4B2CZ4MZJCVIrHNeC/kEREqZejsKw2u/5wneFZVLTYjSwHlG8AzAIBKhIiA2OJ+1PCQ1iEzYMlimTcdufhFAuPjqi+W6N7/4nMljB58jcUW5cm6KI0RrGChPkUIYhWYf8uAh98K5CCQjJEkgJoSqAzWDmsA5l/volGCaqUAueERJiKJw1aQdPe+8+xbHqz2ts+FxzzjOPPlvgQlWD2wY89MdAoOcQS0hpiHEEnxwIKZc7KjAzOCLwUUFTapHH6gr4TSWWS57B2aCWYKkGtAGU867g2h0Jt38w//yzN2PpcVF6R26an7WD2cam1YnibRjoE4HUVLZdmfAOYhmNfsQXOFxZUJDVXkQUd5o9B6uChBNSBbBHvBVbp9MDewcyHljroDOxGee8ahHx3zR5D6Uk9tpkEi6RYnQ1EMLzHBcAUZIMSLFgli53LLE2IxmzM5xbqlihIjAOzfKxzHG0lLlHA0Y1BSqUrzcQSHw5qy7eoSoPvTCq9703EdUxw/3Lal21k27IRQkFTxV8FVAU/BmFwKIKXs0EUIVAGo9OPO4zAxJcuiuOhkgEQXYefiqQhIFGeCcs1B1sFrHGwEF5nbdt0gDu0cAdnVYOaNBjjI5oB7WMNOcownQUoARDJUvhZVkop8joPIMbgu1pgGNoFDANEGkAUzzuJIBhSBZhCd20AaTq7f+wLabP/mBqfpYzxOTOBB1O1BlQBkuVAidLkSzTKoPAeQYTUG+QlWBHKNOMRu6CjAYUouEdbpIahAD2Ae40IGK5TYxVAgTM5/MD/59rPBq/0Cus+4ahBlEUUrNACJDhJBzKpnl8WJsRh5NhTBgqghl0gRVaEwwE3jPOUebQFIETDMHrMjLpJSgIoDP3j80YL0nt74ebInOGTqBNEnOmz2PZAJVguMAdgFJLJ8dCT63RKoAF8MzI6a0xtBFPsB5hKoDEUVUA5xD5QOSGpH36FG65r5HGgCwe+9uBYBqdsvVJ2ptrE5sJuZ91rTLXK5hZnmEACaUQUbMECHnVVAVgUgCKI/6ss1zGCfKYZ0JgOUpUQZTcr+dNCFWFdZt3ozjq9Gq9esJ3QqMjLhZIPheQa9gCMEjVAFNydEuBDjvEWPMLVFVASWUk3MIVYBYZoEwe/iqmxX7VOFCB6xKKwKNVfcoABy8Ozcx75EWinKF/Zf/81Ufra25ddp7YmIzS9BhrpS9d2CXNUNiasqMlsCOIBAkbSAWwb5AoSZIEqEW4QOBHaAWIWsAEecICoFFQqNDrNuyHTwxjTABIhE4GKpu5mLlAonhKw+RCKggMBCqDqIajBjscosURSBk8J1saGlnxlWeO6goPFeoOCvbD9XZbEW8TJ1D7515zMcBoN9f1PuUkYsyJu1hJ9XkuutQeUgTLQ0FxDqeKhWPdgx4RyAqbVEpwIL3IBNoynAmUWaItO/LJLpS+bIVgWKFkqGa6GJ20yYMmojOzIasBqYCOAdfWiAxgJyD73TQaN6ZdsHDlb4ZRGDvQJwreiI34l6LKogZoVPaKRU451GFgBQbReiAqol/f9FTfnHF5ub4VIrDnLIKb9/cLgdTJJ76f0OC6TBax3VBLgGS8zHZmtxrCokNTBO8K3CmFBTLFKF8TzXlvA2FH3l5yoMMFTADAmBq63asGuA7HVDw8N0uyHkkNRgzfLcLAZAAuE4nf21Zn8Z3KvhOlR+K0hezC4hlT9WHCgYetV++00Eyg2guAIlh0fXQ8NS/AHZK6bin1Mi72xw0seGfpNsjZ85BCCkNIAXtCj5vRqQYISkDIpXPBZhKhEqCLzh3ngzF3MeO4EyDSB4kEKMUdAr0ptDdcAbId9GZ6MHiKtgRXKcLY0IyA3kP3+lAiApo0YHrdiCaZ8jsHHwLkDDDVxXIOUQVGDNCt8rtlQpAKDnaiqwEM3XWoUHnn0/6LO5rRkbJQZNnPfw/V4VvDSyUho0ZFM7lkKuSEFNuqZxjEAMiGcOGaZk7t4OM0np5P+qjpQztvWcEzuLkgwRs2HE2BkpwnQ5cFcCOEFOTPbjqwIgQRUDsEEKVQ7cIvA/wVYWoCmMGh5DxaMnYtvcF65Z8BSUUCm6GVLkUX2QSG14iXlq38ZyPA8Deqxbvm0YmgtkC3PT3POs249l/pNAYo5ZAHQCKFNNoJuyDg1EO4WoJ4Fw5A4qYaqjE3BuXWa8mgaa8pO4rDzKDU0WMhmrjGfDrNwFO4bsORgru9YDQyb2tcwjdHoxdwcAdOp1O1rBWBbkA3+mhTgIBw3d6YOcRUwKY4aoA84yUbx8gdDqwgswhdKBGOtUJtty1j275iVfevNCHm58/teIwp1Yz5KpdZAD5qc3/SL1NZCqkdR5G5ImUA1uRYWhKWzQaWiiapik7wb5Al1ZWUwoPrLA4kgFCDhY81m3bAQGhOzkFdh5qeTwYQlWigo5oswZCUs3FV7eLpFklN+PRnRHPy/swGmKAqYRuzh5PDB86UAJMa5AqeGKWpLP+AwCw+aJdp1zH65QaeTd2KwHW2/ntf3JQJ5eSNM6SmnOZ36USkVIDaAJzpgUxKVJsIBoRgoMPDIMipgiRCHYog4w8yzVTsCdEIvQ2bUOY3YDhoEbVmwD7CuwrqBHgGK6qQMyloGL4TgVjhmRyNUK3C1GDmsGHTAhQVRjnnOuCz9EABh86mYTfVuihAkFNmsYddxPHjmLnezMwtPuUSzyd8qfK5sA0T3rzZd/21+sO/+fjpSahIC42ebTXXjhVyyCJlZEeF69LKcEk7zATc74HJQoVwBcRWwGh1gqbH/RIrHAXMzPrAElg50Fl1woa845VKfSANiUAKaYRkAJkui9R/h1EFaYRLnDBsTPVx/sKhJzrCQZfOSRJEurkjk1s/MfNz/2Lb89/9vu6jhcAYBcbjHobNv0Dd6cgMVlsMn+KOFNvVXNvDNO84eiKgWMe3zHnVslK3syeljlUbITYKCY3nwELPTjnc2/rXIY4DaMCSrTMiLtdgBliKHm2ghJBTAHH4CrkjpsMvgog75BEC7ZdwfmApAIlQ+h0AMcwGKICvjMJ7k78owG0D7u+XkTNc8iefdD3//5xbFmKde0YzrwjQDLdRlIDNkXwDGZDkli8KY/82Oe2R0TBbPAVQKxoBEjR4LtTWLfzAViNholegEkNcgQOnBEwCCh4IAQk5CswrjW0JnAg+I6DsZRQ7uA7AQmChASuKrhOD2IEBaOqemDPUEogZ6g6HgCbDms37HYHg6kHvCUfAtt9j0ghn/pwjRbJNz70mid8YOrAx75L6iMCBxfr/MF6p3DsEKOMeFOZt8UQEYjkDoSJUegCSAkw5Ovl6865EHVvM8LUOlQVIcsRZyqPiUC0EPSYy3BfM4ujDERgCleICFnwxWWIVDOU6l1mYarmts05B3MC0TFRQEVFmxW32tu2b/0z/vQ7sJfongjV94gnE2DY02cikt5Zj3jNSrU5DuuGJEYELotsRGiaBNW2H+XM7yoGZgJCyAc4xQgmAHsGBQav2wBavxlCAAcGmDNPyxRqmpV4XC62DAYXPDh4qOVe2FUdGJXiyzFCpwtiBzUCu4Cq6pZ5da7K2bvSN7s8iOB88XWwOkCYmIH0NrydiOyeCtX3ULgGaDGfnZ168iv+pqlm9/mJWU5gcQ6wJIhNgqqNjm2qWsmBihAILtCIbkOUEBzBs0MjhJntZ6NOQG9yKutnx5h5WyFAtOwVB1+MkwcLHDzIFzyaHUK3C7CDKEDOwxXRFyssEA4hPzTIVXfoVEimGdKsukhiGpxzKzx1y2d7F70vT+K+Lq/J5AJs3VnnvRszW6DqUTe5knVUFt6IM9NCtLBxMg9sRH0NhNBhMBOaKOit3wx1XUAJ3W4XjpDBElUQ52o5I2gCYs4FVEHJMkXH5V7XObhOJ7dTBTDhEGBE+f/rPXwV8oOGTDlyziFKjgYGM9+poK73R4/d88KBLfTdqVarPy2MTEWAvPeM3/uj5c7Gq0MiZ6LqAkCWJZ4kCqAtQ4QhyZBiPoSdcW4PiYyYDOY7mDrzXCgHdHvdQhDMuTUPMRpwmVqZpcyBduMJk5mNqm7VfMkthJBnxpZyKggOAoWYZtZHp0KyfCPShyqjaBBr6hWW3mZteme+OUO6F92jBwnv2btQC30motSbffAr/Lr1gCSDdBFHi2SFsQlApIAOPudUKwpApoIEwtS2s6Cug0QEP9HNBzpF8qah94ABagbiPBcWEVibVznjz7Tm52vxYFd1xqHbB/hOBwqCIIdyHyoI8mnAXmCwNDrRm6LoJ/96n3vk57Ps9bx+/Rp5z6LaHHjD8961sDy99SruBE4NaeY/UwYfxJBSu3BWNg0lSzt4zu+hyQ2oNm3H0qBBb2oCyRRuNMAfG9rKRImKHkkeR2rur5nzyNIUlFcnM++LSjFWplVwDr7XzaEbAIUA8jlHg2ApGa/y1KDubdm7Z88eWVzsf33fTybAcHWfiEiqrQ+7LE1uI2iNikNBnqRIJjkE72CWWxop6gLkHBp16G0+E9E8pmYm8+m+cpmHvIMWRR4CgdmNFshBlJfoRAqV12cWijQFMKmAIiEF5+A6Y8CEiocrMQQZXHG9CazWSStfUTW1ad/m/is/ZnNzvGfPonxdGxkAsJg1t9Y/+3f/oJ4+40NTvcAyMMkkuGwIAhBVCn+KRmyQuknAxCyqDZuwPBygqjx8rs0QY8wHw7yHAhBLIE+Zv206KrZ88KNemV3eqBQpX/vcDuUwn1skY5dFYErFXm4NAq4DhVGkoOZ77wWAr0U07j5lZAJs78V9IiJzZz7qFYPOVlidyFceWhHU8m6SljDqmPJl9KiIcFi/8xws1UNMrp9FowkCBQXKBVMSMHEZXSpEI+AMFAiiEaoR5AAXGGaxGDYrA5jEMtemXPS1VXeVPdosgRzBBZepPmIadJWsN/PxiT1veK/Ngek08OLTw5MLocAMtOUZv71/uPm8T/PsFHOTNCTNVFsmBMcIRkCj0ASoMqa2nYXoKwTn0K08AuXhgRV1IGYq3CyAC+NTSo72wSNZpgiRI5DnDIggh25yrjBD878DMvOSmEAhIBFDiEA+wHW7WD5xDGFiA6E7837AgFOsTn/aG5kItphRsMHE2Y9+wcr09tTUBh8BHzJi5RRZhxPIJ/26U5jcthO15E0H00wXyq3W2NDEed201fPIva4CZcqkphDNc2EUpSGDgYoSoKQIkwT2+WyfSQKcM1QVFIRatVHwqjrQct39XJx54Fvzg7ug9xv5SwrtRbF+380+9dV/PZzc+H8npmaY4USZIKJIUQEG2BMaVUxuOxPLTYTvdhA6AU0TkYxzUeQJkppRuM06l3mi5LyDAkiWPZh9PhyoyPg1F3qPogAkhSxIZIWUZ1AVYnLmXDBnRMPllRBClya37njt7OOeeziDH2T3G/l2w3YeYJz10Ee8LU5vs3qoEFGYyUhjs4kKNzkFt249ombWJiCZ+C65sM4zacrDBmQdTINlTS0gF1RAnjgxZ0OrZpiUqXhwhlbZEchRThvI7ZdpAWpA4p1naaI3P3nLsuv8rQGEqy6y0+ljPa2MTHsWZbEPDv03/5+V6a1/WU1NOp80+ZBF06Qx1BIwve0cDNQQOj7nYEtwrAiUWZ4iuV0iIjSxzvKH7LIIq+SlcO89TPL6LBODvUcjDQQxS0G6LEqjmgEUA0GSwYQRiAGQqqpJHOYZdG/Lb697/PznYHNE8/N6v5Hv0Jn7MBhtvuCbXynrNpklZTQdQA0JhGrHNsTgYMMG090eGFyEYfIFcsdZ6c+KYg8he6Gp5rueZa2mlVc21XKGL2tuxyI5xYTMFi1hnznTgFVivoNB5LxKWD5yiENv9hCF7vsBAHtx2r0Ip+HL5sD0Mq9HrnjsX4drPvH44XKUbje52vUwdeGFGJhDj/Jukqs8xBRiec2F2AOgscgbUz78oZnVkbnRChgQQgeKzKx0LVwKg6asiMu+gmiEWBZRJSoiNQbj0BGrB86aSPXk9tdP73nDCwDCPTmIuNd4MgAsXtwnWKLJ87/9F1dmz17xPtFAzbqbNkLFw5ThehWS5k0JR0VKQiTfsCCDYyA2WU2XKQ8KU8xrrZ5RtiPzoZBWzlFFMs+MCSopi8g5LtdrImCZtE8wggmlWFPkiWvdjodeQUR2KtXo7/VG3rNnUazf586TXvGfvHH7u3xvgq2a1O7GzRgsDzBZ9ZBg4ODzQZIikObYla2KQsRrSfQma4RlElQVIQRIYXaYZmKgJoGKgikXXynmG1QtkTClTGTwgdGsLqMyoDe94e8mL/mZm9qTwfcb+St5XXSRmYFmHvlDv3V88oLl2Q3beXUAm56ZgmiD1ERQMUaMcVw5MyM1MS+gUR5gxKL3lZV8kBV7AFBgiEl5KHKIVi0TLyK4ToAmhUXLxRlzUcWN5lJkpcm64c4fGECLpwmEea/JyUA5aUswM+sM3vwj/9o9dt2Dj63UOrNhPQsUjQkcMaq1CnnOZ3G30i51qgxRihjEDKHqAMR5yc2sEOox8lYXsi61mhbUK19kl5jgQv5a1dBIrTo0drMX/Gbvya/7+dPZi09vTy75ben3f/l8g+w8Ug+tO9mlmOpMA8qlMmITwSBULsBSgpY7TcF5xCbm8Ms0ytFQhScqJw4i2HKY1yRIdSwe6yAx5p/VKgAmgUSBY4+VpSVMTEyh2+v+fT6BsO/0/RxPayNjHmbGWLrucjp8YLITKq26FWWBmGZ8Sc2QyfKlgJKU6T1clPElFjYmEZgMsRlCNWaN7TKtysVXnk5JSmDQST8LALicNJJ6iE6YUBqcwGc/+MFLaB6Kq7fY/Ub+SkP1Qt/RPPTo7z37kk689Qmyclydkosp63YxAVJOCbVyjVIq68p7pCZCiw4nM5e+OAMiTAyNKXu0y7TbVt3HOTcSnIFZ7pvbnrusyhw/chSBO+7Ep68xu/nzT7vujb+wDYuLmrU67zfynTMwQIuLgJk5PXTTa5ulW42nKnOOkeoGUMC7CsQhnzGAZLK9NhCMl9+aGPPCmstemZqU7yxSgDefHxJpssa2tZBn5ndnHndTwBWCxQhSw2o9QOh24VaXaOnaL8qF7sj6wfX/MEeAtVfs7jfynXkt9HnP4qIce/uP/8Q6ueFR8URU73uOQlarb5qyv8xjfJrMimxDGR0iL8FJioDmesi57NEqKWPbsFH75Et+l6bJ+81FuFVSBEGLUE1CPVxFtxtw9AufxURo3FCTbGxu/NlPXf7dj8WeRb2zR02+ro1sBsJVi3bivW/dFE/c9Ou2esCmQo+apoFoXWQlgNgMi5wTgzQvrJkIqhBKwZRhSceUhWLKcptzhCQNBFlmgoukI4peJ5BvVVERWteUsXA4oFZBaoawE8cQb7kRvQki8YQtSzdxuO0LlxHY+li835O/3GtfOfjRHP3r+XXDQ9tXh15o2jGTQWuFaSHvESHWefDgirC5JgFpzqOaIlLdlOKLisREBHG+IJdivsPsmMDFo0dImGnGqzUDKCoNkkQMV1excXoWy5/9PGZSQs0McdFF4XQmnfj2z7zskqfQIuTKubtfQ/xea2Sbm+NL5/enW971/G/wyweeWi8vCVUb3aoM4Bhg+IxeqcIRSqVcZ6KfD2XQkEa0WtMso8yFFdI0DUQyR8wVNAuqcFwUDGJTwnqWOs6Gz1fbmnoIZ4Z09DjSrbehQ4D4gE7FkN4U49ghmzp+3Sv+6j1vmNldmL/3G/n2XlfPE8gBt/znm6aXj06wrxB8JKsTkgksZMJA3dQZWiw5uYlxZGioQVLejvAu5MOfSfP5vdDJsGRZZmNiNHU2ZDa0oIlNETQPMGFoNHgE1KtDTHrG4c99Fg4JOsmYcALSAJMBJ1PZkg6ddfZn33sZzbPiNKDhnnZGtoW+o0XI0bfuecEmOnLJsaWVROQcUwY1UhMBNTAYzvl83EMEoSgDxdgUojzB1MoSeZadSDFlCBS5hUox5dEic15tifnMgOPxXci2GCMAS8eXMVlNIh47jub4YfSmPeBaEZsmr852gpeVRs5Z+eKz/vPl3/VYytj7aVOE3eP5w8wIRPr5hctncc3/+ZXV47dZZ3Y9pzSEUT7FA2NIbIDg4diDLC+kM49vNaZmiFBVcN6hSVLU+zwq7/MNJ0sIIZ8cSE0D+ADnxoCIDyEzSDRfh2FXZWWfmOCNcOSL12GSBeq4jCYpP2RMMCgoGdGJo+j4619/pdljF/fcT/9ZO3JiAswf+NArOyuHNzRiaqzsA0MKMOFhcKB88q/IDnvncp9ctL0yTJmLsVAEyDPrA6MrcBJze+Vd9vCYUinOXNbnLDnZVGAasbKyjFAR4olDsKNHMEmUNx/XGFhUcoqYYK6Z5Fw5/E1nv/zSF+5ZhNjC6eHN96iRFxb6jhYX5eC7/r/v2BIPPCsNlqQTmBGXAWSxtVwZl8OWzhdApKjhouhdqyBUHgbLJ3hNc58skseQlHvfrKudse6sepv53MxZf6Sp8/zZ+QARRdMMMeEIRw5cj0AGhiFUWflHTfMRElOEwFB26JqwHjykM8e+MPepN//Pc/Ia0NzX9ZoMISNbPLz5wMvt5usMVQBVnkwimjSEQUfhN5/BIzhfZsbSZHUgZsSYMu3WO8BZ1vpCgg9ZfySmGkoCFygbvtXldJz76vb4JwixTjAhaGOoiDH44k2gIyfQmfBAj8CkMMnHRLznsiWp0KhoyBM72EY53NObbrqMwLbvNBhe3GO/gM3tcnsWF+XW1/efvqk5+tg6cb7/lgSVyyS79oB28D5fkUn5ikzudSNUM1bNVBR81OA5i7XlFsjyhEmzql9Lq823IrWo4rv8Xsl9MRPyAe7VZUz4gOO33oJez4E9YIUq1BISmPNsOkVD9BEykYAp55qlJTl3+QtPvv5Vj//RS+f3p3s6bPM9Y+A5xvx+uXHh8p3+8HUvo2MH1HcnyGCQ2IAMqJwH1KAxwYHy3DjFrNGB3PakJl+FC+UEbyvFyMwgtaKDTdljUx4dOpe3MfLl1jxxclQouCnBVwGxXsVkx2P5xgNw9SqqkHnaqdzMaOUt8v1kg/OEKXPoNQ6xYRg7qlYOGB/99Os++P53TOOqRbN7cHZ/jxh58eqridiZP/Cht0zWN21ZimLmiSsaAjAMY3vcI4xaICCDILEZ5mMfBVOOTT1Cwnz5msqMmAxIdf46eDcu5Mq9CpWMlGWVfM70n1jWV2PE4JabMeGQxeOCgat8GUQky1sQ0WgdR5MDDwXOFOhWXIP0jNVbt23+6NteTfOk6Pe/fjRDbKHv9iwuysE3/egTJo5+7n/EuhHqTbmmGcBThA+5lo6FNluFkI0TM6muU2WPVpXRWdtcfJVj2cRIhTbrOLdIOZ/nIYVoKvKNNsKyY9PAEyH4gGPHjqHbCVg5eBAYZu3tULnSNxN07SmgkVqvYsgJ2k1wQQCLcExueGKg21au+7lPXfa4b8w6KXP3fR2vdgBhZh275ZrX+cM3GcRRz0VUIAyHBE2GQJRpNykBRQxGRNAkhYLhfEATpcgSZyJ9XTdI5TwPAAybGgbA+ZB74aaVanIQS0hag1jgGEixhmlCbBRVZwK6tIL6hhvR7Xpoz8GYAGFQJDi47PlGsARINDgwOo6hSkhCeV5NBpmubKY5jKnD17/9yivN4+p5uifC9qkVUC0DiJtf932/NtMcumCorBYatnJVvA2/sPHgIcUIWNazNhFIzOp94z45F0Ke26GFZE1sZtTDYTn0mQ3f5ugqhHx4LJUzReWu4mC4go5jLB+8DZ4NncBw5QQRUR5f5otGhhiltGq+aHrlU0GqChccvGdMa+NOrFayIx56xHlXXvJSWoRgbtcpL8JO2VPV6koeesPlZ9Y3vfPTU8ev73E1S+pXSNP4kHRKArV8ADOT8PJmhK86WcU2Sb4VUS6vSjn45YIvx7ayim2+BiNIqqiKtHHeZsyyFAagSRGOA3zoIDYNBoMhJplx+NOfxmyH4aAwr3AVl/l1VqNXQab4lrvMGVHTfDOD8/cyIRDwzpvVSYfrztQbt37jIy960fs+udCH27MIuU95sgG0eHWfzCw0S3/7BxuGhydjNCjVxObgStuikhBcvtAWm7KO4hxMLX9N2aPz4CEf/AquzIxThHdU2qk6i5wyl7FkllB2+RpJxrYNqHzIJw/K8bHZyR5Wrz+AqaRQCNQLfMjjSkDzzcUib9HuO6eUSQlZwbe9AqcwA1AFkE9EnjF5/LYwcfRz77j+wwu9fpu67lPhurA9bn7NDz55dnjNt8XVQepOTHFMA2i0Ue8rsd1ZygP8pqnzukvIp+ZjywpxNAq3VsgDsWmyBpjP+HYsOtiVz/D82lFimwYIWZop1jVgiubYccSjJ9BxDA4Adxnk8n6ziJYzCAyjTBdKInCunEZApu6mqKM7k5UK6uTgRFyqLZ1th74ZV772WbQI2bf31IXtu/1pKgMInPjIn26I79v7H+62T2+zqoMQiIkSYip7RuyQLJ+dceXQdEqt5+Qra1FkdDsKAGLBsdn7cts4wfsOvKuQJCGpIHQ6mSYU0yhUE1FeeyEP6vSwcvw4pkPAsWs+D58SupMMCgJwEZhhLt6cc66ZwYzK/caSUjTLQbLzAAwqWcEXXJifxmbDoS5tOGt444N++KEPfdrrrz1VfO273ZMXF/cwgWzl7975m5PN0e3mnBGEtSjyeC4F1Ig2i7KFOD7w1TI3XBlE5LO7+WqbJClkgcLjavKNR+/zlbjUNIAagvNgEOKwBjQfFolQrC4tYarTRTxyAtY06PQ8iAHTbEhXgJasWt8exeaRvlhKWZA1D018IS8UKSmXPV9VAU2UiGnDiSOTG67f924zC7j46lNSbd+tRraFvtuzZ1FO/O6znjRx+NM/unzogITgnWfk205lGS34zNQwTWU5reVx5ZkxIIh1M1ovpaJzzQZUIcCS5CrbMsgx3mEqPK6Yw3GLjElscpXtAyxGYNigPnQYvcBZAb8wSELg4qk6Uub1BS/PA4zx3JqKwHmbo7NON5WHIFfinV7gWmLasXTdt37uFd/xVNqzKPtOQbXNd2uYLj3x0mf/5XV+6UZiJpJUg5Avw0iUsaEdFa9LcJTzdIr5qEhgyoavI0zzqDDLMiaQ2mh0aCJwhFLI1SOs2xHloyWSRrcdrY6oVwaY7HQwPHYMVg/hCDCkDH74vBc1Nlr2yraazncssiHNchhXaYcWrtQBRSOMkRWIRBArYzl8QjYcv+nln1n45R275/dL3sK4N3ry4h6meej1r3jcC6eOf+GcukniO45VE2LM4dX7MVMDlL+OTbmaCmT0KhauVfAAGWJqCoUn3zaOKR8kCUUjM6WYi6FSjFlZkyEUTlgp5CQmoEngJFg5ciRX5j7faMw6IQoVHf2eXPS7UhIQCFVoNb9yz5yPabdeLqP3hZBZoiJ5zbaLxHGygw3N9Vun/u0v3kQgu7sj6t3yw21ujmnPogzefcW5vRNf/LXm+EFVzbfW8g2nbBwzBQeXT+YV7UzmPCUyUpBjGBGGSYrgaSbdpaLf4b3Ld5WlXHgLGQ7N66cO3lVomiwkEnwu0IYxQYyRyKHigNWbb0MnJYRO1ssGI5/7KakhhKIEmKQoAZYiTAxaREo6PsOeWhQDtYVYvYMZIUaFGhA6WfXPOXNxaZA2DG554r9e9sN9msfdOqm6W37wxVv288JVRjf86Yv+ZOLYFx/gEJVCYk1UAAMuIS/LCre7v+3+ElEOiVmWyZczuTF/QGV0mFdkPKgIqbXiqIEzb4sok/VyeM09tmMPAqGua7ASKgOWbrsVE53cMmVh4/ww+cIfS5IN5ByPgA5Tyw+S41EIz/LMGB/rplztixicd6W2QNmBzvAqpDFyuORnf+AH3r3p6e9ZxRx4//67XqngLvdk6/fdnkXIkd988s+sX/3cd9QnjgsxO+ezfnVKaVSYtNRXB0LlxvKHjnmUV6ECT1nRJzZ19mBX2JVNnSdBzPmiTJFlrILPY0eVnIPLrWNTgScGoiCoYunW29BhgMiQTAAHdCoP7wlmBRu3sfCb2Tgf+5APoLQCryI2UijSApLkcO3gXStT1RaHgOtUzNrY9uOf2e5v+9hrCWy776bIynd1mMZFi3bsT19+vhy85gp/7Jh0AziKwZKHY8397OjcXm6BYtMU7lXO0Rpzle2ZEctV9OApjxrrXHX7MjOWJoJA6FQVoIrUNOByRT21JHnHAAGxafKuMTvYsIYsL+dhCBTcYfiqpIPYqucyfNVKMRfVe8cIlR+1T1bkJ6rK5wiUtIT1grfDcrgu/y0HBlFCkwZI7JzUddqJW5/ymV//H0++dB7p7mB53qVG3od9TPPQo/+575e6xz8/ow2h03FE7KAS8kTJ+6LIoyND60gSorRA5YI5EcY5WmXM62riqBgTldFY0rusGzLS1BxRbgWBPTx7LK8soeMYK4ePwbGBi/cyZ83qVGQYs0grRhTfdlW27c1TlIKglXmy5cvrWSG/3LEyyyJzrY42E2JR4idoPkVUVRyO3qQzR6553aff+4JNuGjR7uoNybvMyAv9vrt0fn+69bd/9rtnj3/+p2XphCQfXTJDxQKmIUTzCNFxvgKjSTNlx3FpicqusM8nb/ON4pwr25tQzlUAewyjIqll8VPkA515ehUgCsSkADk451GnBhwVlAR+gnXllsPKx2vQBCP1BB5F4wt5yADH+YBYMkhSeOasA6aKVMeT8nGLX6ck8CG3XmMWZzn55zzMCCkZrCgLBe/hpQFDeUXZtsUbz6g+98E30TzpXb0heZf8MDNQ/6JFs4OfmtYbPvy27rED7Fyg7IXliS/CLO2FGG4XzGS8dSiypm1puVeW8eZMt4lZ5MXlQUBLqndFJS+VdspR1vJSyaPFwHmnaTCI1uttZFdNsXfOujAoGwYUEYjR5SLzVDYxHOPk42MjKWZXpKOKVxJQVWOQJOPmhtBGCLOcj5Hfl/+sMgr33Z53qdZ01uFD/Rte9cSfuKvJ+XfJD9qNXf7c+S/Kj62/7kVnLF31Q6tHVxN1us47BUAjZVpXbimp5jyWT/Pl+4pZxCV/cER5qY1K1U1lcQ1F5ZYpC6Wq5Uvn+TRv1sDMR9laI5T+23nEOpr6KXI7HnGVTZ15wE4c3q5p2VwFQnDoOAZMEcVG53lbgbaUrGDofjR9Uh0jYL4IrudaY/xgmGJkXFemazYCSfIpJMeEQTCEAcMPD2Olky79oR/d8ztnX/Hu5bm7qNrmuypMH37H/3rIhiOffcnKiYG46QmnaTiirZ7UMrm8jqLacqSoGMgA0BgKTOXDaSUhJHO6XDtKNCm6IYJYD0EmqLwDylHPFi7V1CDVqt552IYdx1a3f8vjZn7yjd9+fMtZ1/juJCbAUjlCDUWjWm40FplHyUUTFaCmLbZGKFgxuqRWcN2NvqeWFQzadRxmFEmpFjIdjytRK7QrXPdUz1g+uH7bLf/59j82c3sv7t8l2PbXamTq9wEzq+L1H3njpqPXTlI0MAtVXhFLpcnlenksrI5QFN+zl+YPoW1PMutjHLodZ/QqFe0PLl6eCoOkHTyM2i/nAZO8/6T5qEisV43DBNn0ptdu+eEX3ExnnLHSPfv8F4dNWwgDNYkGo6zwk7VDqBwikdwCjXJvDq9t7jXVDL6UAtJ5Lt/LheMo1LdMkiJ/4UpKaE8tTEpAqgy+8i4dHaSzBtc+8ZEvv+QHaM+iYOFrJwB+TT/gyrldjvYsyq2v/d5nzsbbdh2KSJWLTjUiOV8YkjK6DN5eDc+SiDwaJ+acPD70BbKyXppG+DQ7RkxSVAYAx+UqqxK8C4AyJJZZpTeoRXBjAEy7VeIT1bYDx77vfVfYHNjmdvlt/+uP3n9rb+btbnrKqzoJ7MGJYIlgKavvBp/bK5Ecnp3jDHsSZa8sD3ArBJdiu0U5PqvQPqzMjFAFULvCI1Y6AA+rFFUDaG3AJHFYPqQbVm9+y0d+5xe23RVbGF/1f2xzc7wb+9Xed9k5dNMXf2X5lpvU99hpBVBScEKBKYtXqo4oM1I2ENpcmlJRk29RoczSgfdfWoylAhuGMrdttxBD8DATaIowMCQQkq3CllasM3seVdsueNWFF1K9D7sYe/eL9c392/aXPe+2mW2f7ATwME6qWANDLLxqhgojxbGBc8RpZSgK+NEyRNZsVXA5+ZtGKYrzfSoZ521Xirf88yT/PM/wFXOjautXbtq8+bN/89sENlz9tQnBfQ1PSO6Jb/2Pv7lsS7xhc5BazSLBcwYfpL2z6EeGFhnfQs4ejjWGtVGVrapjnNi1N4stn7FnB0sZ3cpVtiHGGiKx6FoLYqMgY5BX8dxzt8qmK9/w7N9700If7tL5/SmLnPbxxGc8cfXQ1rOePZjYQH71hFkbckuBp5p//1Cgyxxes7JfCIVxkgSpeGrV8WtGk7lA9O0YMsoYC2glIOXkaMCctzfZwQ1Wkc6NB37o+lfv+jFaXJQr53b5U2rkLMG0P93wxqd+bzh6bX/5xJK4bvBOGTqUXB2FsWHb3CRrnux2h8nKjeTslWOPziulYzFzkTyMp0KOas/cZ2V6K9sTAvIENoavCcMmUr1xJya2nD83T6T9fn9cTJQP7uLnX/kPt03ueHN307RDAzGlQvUBQgAKLSz/vylXyVmsVUfFoS9n/CRpOc5ZKueiuptTko2r7lKJ5/qksD3NMqgDg/MGmgqsx49p55brXvMff/CSrbvn98tXywvjr6YnznPimyc7N37yt6sTt7ihdwTn0GEPFkIsBzlCuY1ohZA36oXVRk9url7bJx4jQ4eQse2UCpZdzhSsze/5eFf2aCYacb4qrkBDkQnf4eHM5r/c+Lzf+ceFPtx/ve6yD7vV5sA3P/lXX3yg2vYFn8C1OCWfc6WU4jBDkuN00pQFOy5h2Mq+tKrmPOsdAEYqSF4b6qncv9BycMwX/lm+H5nf50M2SaXLvKId25IOnrHpM3/xTgLZvt1fXcv7lXvyYp9pHvqFy376ss1L159DpomdY2tqKCu4YiAZIFmOuPI+K8BLlmjypRgT0RHw34IHraGleENV+TUhjcqymoz6bqa2+BpDntoAao0lbmjY26kbz3joL5kK1npx+5qfn1dc3KdLHvyDSzdPXvisZvYMSiZG3pAiIyaXlQQC57sWmlkecIDrOJAr11+TFu5ZBec8pPTH+ZJ7Pnaihe0JyigdM0HKyBXQ0nqVIUgiqAG9aXKpXk0bhwe/7yOv/J6fvHT/VzeS5K84TO9ZlNV3P/Oxs8c+++xDx4+K+sp3WU4qoLIX6uj8Xh4PZkDhv4IibTGW1mDZ7dNNRKiqvCucUp7Reu/K1Cerzee+uYRuckjsMBye0DA7y8ubL3hN5ymv/WT7e99uD7gnh+1H/+pf/fWtU2f+yUy353TZpPYNOj6CKYzI9FLUhhwz1IAkNiqYXPBr2ictklLjsenofS5DqBmfLz/PudG4UlKJGmVmbeScHDmsO5au/43rF56x46uptu/8m220T+yPf/Zjr11/7DrmykFJ4crWAAr5vS24RqBHq7iTZDRQb4uxttjKMGWLGLVTngTAUFV+1Ke2mwwZUrQSyhmpye/tGOsEPB+nrTfzj7153gDCnkW9Y8RuvxqU9IJHv/A4bV5i7sAFztsxyUYaI7l9KgVTm4+LV2qBM1F2rJio5PIW7eMRCpeKeE0oB7u1FHojgKWAQxIjyDkKTm3H4Lr19u8f/c2vZuf5Tr/5yr27HC0uyk2v+x/PmV0+8C3NQFO3I44QkceuumaAbqMiJVeqJe8Glwf8uhYgiSMYsX0QWo8eG5ZG8+dchVtpr/Lw3oELQJKAetV4difRlotevmPHjlUs9Jlwx9AgzUOx0Ofzf/I3r79x4wNeauvWObckmhIgkHG7o3km3I4hM/hho/FiaMEU5PoBZnAhFIYIEJvcUWTWSHlwCyBCLbW4YOSNEVxQeE5wnY5rTgzlzMGBH7r28sc94yvdeb5TRp6bm+Pd8/t16d1v2hJuu/YXbOmgDlzFpILgAGNXctDYOG275MsfRooivCsw4KgY4xy6TXNBxXRyNGiLMeccqsoXQ6MspzskyQN/zhuMQo74tmrDB9/6oj9660If7st58ejVzxdgP/jSD7zpMHU/HYxYrZK2LUolZRATOlUAo1TY0q7eZDZIbv/y6SHXAidFrajVEMuLBGPj5kFGHpOOHKLycExQFQybCOtNsgyPypYjn3n1zb/5M+fSnju/JXmn3rT34nkisB773B++ZcPglh0Cs9A1znRoBruidNfCkp7HK6MjFkgGNYIrfKgkI6VaX1qSvLpStv1HSFgRKS/LaqOqWxSOGOQI0RRocukv63ZSd9tDXtW2TF/Oi0feTPkC7DOIYlx34fOHG3aQmpKm7IH5MAnBewBqsKhlbLp2ZUZgZWUmH+e2UdWdYU9XlgBa6tMY4kwxn0Zw5X0uKaQhqDG6AeiESBGMyeUbZuiWT/wOzGgf5vnOLEjwnSu2ICfe+MNP3zy4/klLx08k59lxkWYQSSNj0Ele6L6kH2zHdaMCag3k2QIkUq7AtMVXm7Pbh6ZFwswAFUVFjC4AS42EMOkGk2f93baff9df3V7L9GUNvbgottB3O3/5/33g4MTOxarjeVgn8d6XVESIsYwNS2HFBfyIcdxSgcZrPMSUc3nB19vRpA+Fn9Z+j9vv0e1/L0ZMWONWa5+26s27vnj5dzzv0nkkuxO8bb7jMA3eu2fRDn7w/dPxxqtfwSduNq46bJqKbAMVQ49HifmDGBu67Q3bXtgsh7O2qhxj2W7k8W07NY4GVGBLG91ODiW/mwDenCUmHJs4M244+xt+kYgU6H918NBVF5nBaGLnN+xdndwavWOA2cyosDwoh9dSWMX2oS4cbC1q+i1zZTyRSkXtbzxPjk0aPcQjpG8N7OmcyyG83NfQyqGaVjc8cbNMH7/m1z/x+h96AM3vT1+Ot32H//Lii/s0D9L4D7/92onlm7es1lE7FbErVaKajirjplSWbbXZ8rhaHHfMvmz7ZBnNlFtD0+j8npSLL2OSevsgjIoxEDgYxIBaSPy6da7esPMtnZ/+7U+0agZf1Vhtfl6x0OdNT3vr1cfXPfA1nZn1rlltNN/hLJBt6SLaqVLLBskhN4dhLroiGeho27+Ct5cpVQuSwMbhmjhfhF17+YaY4UOAwgMSyZSxbvVQb+uJa99hZn7fPvAdoWH85VZclt761O/afOJzT5eV4+K8d0h1buhLZWmF/+yYToL5iGi0HeEKWb0txqqqWgOI+Ez3GVXVvkyj2i0FXx4aHV2PURUkSQA7qHcmKfHKxKbj5z/6kivmAP6abyWWIoy+852vOEobr2NmZgclqvJWRYzgwuXKVJ+MeLUezZTzcYwCKghY+3mk2EamkFuv0lsTkO9C0ngMaQB8VYF99mgaNlCt0PPk4qpL2wc3f/u1L/+mF126H+mO9Dz59lvikXp8OPiFT11BR24CuQroekQ1mFI5uEWQWFgTPi9ppyJg5t14WY1gCI5G1WhrzFwpjwH6sQcHUPHwtpDLY8kyxgv5Q9RYAao6u3kT6+yFL6PHv/SG3XO7vuZNQSLYPuziHY/asXpiw0N/EVvPJDRRJbp8KS4QXMgM0FFEK+kGbQGmGD3844FH5mBnXZQc6kXzZ5Gv4IwrcdcJ8J0KUlT1kymoC1SV5tuQHXPNrQdlw/DI/Mfe+pwH0Z5F+e9E1W/f+kVj64bLvv8Z2/WWhy8PalFmF0zR9Rl6Gw8a8i+maiOvi1FHlJdRTi7Fl6iOaKzZsOmkvllauq4bC7EBdNIQA6B87kei9qTLt3TP//iOF//5G20OvHvv/rtkg//S+f3J+n13zi//6Z8cxPYPuNDxRiviqwBCyMOImAo4U3JvmZ61xSG1Z4FbQKScCsx5VoqUhRt5tKzBBBilzSoL88F7MHloLI6ESH7SY2blYNh53b7f+9jH3ho233bb7TJJ+EvnxOC98/v1s+96zVnh8Gd/2R+5Qbu9DgEJlopQeEvRKfzilpuVDV8w5pNaIBodqm573eyVfFKObkGCvGoyhvxiocTmCjcDIgQP5WRxaj2FrQ9+CRE1uLhPd+mtxIsuMqiQ2/CIXzgxeXajZDAji7FNUz6fE5Jy5LMtmNp96fLAtpMma3NvqS/Ycb7l3M7bg8/waMnHpnkx0Huf2aRRchQNHi5kMmpaWpHN8QuPnvrL9z790v370+1tSX6JkRevBs2T08kDf/7ObcMbzxgkNfbMPZeJ8UPBf0GgCoJThge2ZqWkqePoD9luTxBOrrJHijyyZvDgeFy4lbWapAmgrARkZhgOaun2ptzSlrOv3Przv/N3C/3+V9wy3Zki7Mq5Xe6MF7zpqkNT57yqM7HOxdWBIpSp2ZqisY1ELSkiX3LNRRSAAnSUCFaW6PP7WjQwlGIrO0+r/0lERRAn34l0gfL+tCikieBe4DQYytbBTZd/6ree+g15S/JkkIRvb8Xl2l9/4hM3LF/7uGa4IlZ1XZQEtgRiD0XeReLRRElPYk6MeFqlqZc1Oht5w6BMZ9oFcmlx4TBigYTSZqSURigalyGGKuB8MIJgGHYsT57zmF/ILdPd89q9d5/YHNhfcOlvLGPrwVAFNpCp5A1LFKydT1IrKr9z4XzlvG0j0r1pyxcr9YajEbsElvM2Fa0UiamsxLr8Ps39t2h+gLgCGQesW/rC9LovfvxNBDZcPE9rQRJeOyfeu7hoH77eerOHP/tWO3yj1Z0O9XwCQTDM1+LR8eXWobZcJh4taWeeVmkvTOEzX69sHZaFcpPMh4ah8kVfWtY8NCojZMzRGmSMAGjmYCEmmVq/ya1MnPH69T9xxSdsbpf/alumL1+EkeHiPp394y85euzMh/4KTW8lWooqBpAzOB6TElsdMed9AUSkQKEZ3mUqxWdZmfGhrbrHTBI3qsSzOjA5hqs8wAQVQIRArQ44CBQT1JLTJqWt7tZL/vOV3/082gO5ck3Y5rVz4nmQbn/Pd79uGse2JXLKJtyujK5lU4bgRwUFr5kRq+oa3lbbAnEJ1bqmReJx/+fbn5VO8uh2SNFGBwcFdXpQ8hZq5WPdM45veswT3mIG2ovdd6vuRsaJwWc+b+GdR/zmfw89cmQqHgGmWdWvpe0yU7kEG9fsLLftUxz9uXi0pDdGDDnksabEOKZOtUOedhUo+LwAULhmagIXAEx61ywdkk0rn3nV53/zBx996fz+1Fbb3IZp2rMo117xQ9+85dinfq45cbNw5V2HMNKQzLBk7t/Wfi0y5hG3M+P2D9sauoUE2164peC2kGdVhUJYz9GhXSgfiaESocniPRBV7W6cZd549uWTT3jhjVjs8/ypOIZ5cZ+ISMPOh/7S8oadJgpYDURVgHOUQ8mpavncARdZRklrp09uTUuloFJcElBC85gHl1dds7BrPhiac3m7wUnMcC4AViElTyyKbceuryaOfu6tMCNgEQYQm4EWsQi78c8mqhMH3lgdP2KahDwryPLUSFVH4721+PTY0Fr40zyCJceQp45GiXmDf7x5gLVcaz9mgaBcgIlNe+vYA1WADgcaQnA3zl78qU3f+8I32hwY/YVTcu20JRes+7l3f+Bod8eiC+ucWEqup2BXwYSKTGRpHdvRZBKAeE2eHbNPXVtYlXxMyPva5FwRam1XjHKRZ6N7z+PL7WoeliLYFK4z4dBY2rZ8y8M/9/Jdv7ZnEbJvbpfjfXt3uT2LkBve+YoXbW9uelRUSKfHLDFC82rv6Mlrcda8wySjXtlMR7AksxvJK2SYsqyFlBN5o9uIMLhSjLWk+aoMMdqw76oyxFCDhR6cmmk1q7b1Ic+mh1y6jKv7RHTqbj0cvHqLGYymNl30yjS9fZXJqFaz1BhM8tFO1xqoBUTC+NyvpjReEfLjVklL+8gll2e6lILb75XqXNdIWsEMEgVJG3jXwIcEsCBW3qXDh3Tz8nW/cuC3fvDCS+f3J949v1+uescLz55eOfqS4a0HFF6c9wHOlYKpMCIz1Jgvo+Xwq7kwIDtpDWYcunX0VGeifNnibwnrrXq8p/KExnKAi7OajyXAGzgwJCpQR+lNz7h6/QX/cNaz337lQj+fNsApfO1ZXBTM7XIbnvnWf6/XnfkOnpp2cRVCbOCQlQ6kVfzjXDBR2z4VEMd5B2pnx2V82np0m7dBBPYuG1wk05uAcsN5jN+D8miWqIIKQ5oIx0o06W26ORrs1i/+DsyYCWSdL3zw5euaWzoWnBGMsqwwjTjEAEY54uQ578mDh5a3lSUnbRS62ylLW3y1nOW1P7tF0YiyHCIigxpDyKHdXD2g473tg+5Fl/yi4R68cNq2VN9wyeUHJ88+OOESO+c0wo/O+Powbqnyuo1m2YwC5qTiqa4UVrC133Mjpd8WSWwBlgyIFGmsUpSiLcDKHICZQUxudWiyefWGx37x8l2/xP9x2ROetHX1+p/AypKErnfs2ulHRqfasVjLU2qNMw7VdBKXutXOaBv5tcVY5kfZmv/W1qyV8OghAeVldEvI54LMZGJ2huvJrb+17smXf3RfgV3vCRu3LdXU//jVm2nLRS8Ns1u5OR5VNSN/GfbMBZO0u16jkFuIeszw1dh7Ry1kFfKAoqgBrx32mOro3pULYfRZtzCvL/yz9qQhc+DOyiHjpZt/iavlA3Pd5SO21DgyrcGc2YIiafQLEdGadUtXdKusVNllKlT4xS1A0s59W/JaW0CdPH/mfP20FG6hIGHJItQpfGDUiTQp+PDkOTfveMzTXmtz4H13c8t0J+K2LvT7btOz//idt/lzP1pNTvgOqbAvh7RFS3gN4HYO3kpPtO1T0Usx5FzO7Y51E8feW7qOUd72bk0+Li1VlaFQrBlNcmA4lwxVj8xP7OMuNUfhmLSaAkAZXUEOBcl0rNJefomT0Cux0WZADuVlXaQac6vXzpDHHu9OAu3Ncp9sZd8pmsEgMO8hMKsm13HYuPPX6Xuects+7Do1LdMdeTNg/ezVafmChz1ndWZTSjEhJViTBOTGlbM0rTogjxfxT2qBxmNIHRH2y/uKXBUxj/N2knHO9x6wtd+jEcVImyFOhA0qGx/4Gxy3nvPCpZkNzSQPYahM1UApT5PIGaxIPgTHZTIyZlvm/GKj6yrZWJksvrb4ag2d2hzjaE1+z0QDg0I0gdjyKE4JSUwmvHdLU+d8avZ7//ztC3243fP7BafBq6UKnf/Ut/3LcOqcD/jOpIu1KXU6YDYkVcQiy+irKmuSlaLMYHDB5wp7Dfjh1oIfLTXKrx1u5EUCt2YZPjVl8d63IIkCQxMfKjoxteVD5z7vf1/JD3juX3zikN/6Nl95RmqUAzCkBIhHBwHEhKZJ4+17l0EO2FrulY2ObrRDixYJi2UcN1YD0JO28ddqUeYFMkVlAvMBGDQY9rZYOuMbfp4eQk0fd56Yd0pehSrUPf9bXlJPb13qeCHXmGlkiEawx6gFypwvARciPigXUZIE5Bw4jNun0S3JEHI6iwkp5kU7FwKoAEd5+Y5yKworu1iAJCGamibafN6rYQI2gNZf/J2XHersWEmJyAyGDqGJAqQ8BQploG+WWR5509AKWrV2WS1/3QIka8kA7VrMWI0eBdmhNeSANViuBZmYnnD1zNa/3vHcd/0/uwdapjszpdo3t8tNP/myTw42nfMuntnEaTAUgit041wIZRmqdl3VQVMprFp00JXvNa1HF+CkJfETMq/MrWGFFrJB671pjKqJn6rokF9/9Y7n/MkHbA7M++Z2uc0/dsVNy+vOfWW1bjvrCtSZgTpZXxqG0crHqPgaKbSPdaxULUscIouN5mJs7apqO8QY60+2qgJE422K4BmJvOlgQMenzxlMXbTrpQYjLFxkOA1fu/dmAVT3wB/79YPds29wXc+JSRkdaMwACBdDthxsLYMMDmE0yFDR8r41jM1W+6stttoZfjnHkBHDLICTGScB2kRYZx2dmNj5GiJK+7CLeR92qwG08bGPe9vxya23sjGnaIoq315ISUd6zi1MqZLpPa4Yrw3VbcvUMjPbXrkFRFTHs9c8tBCIKbwvR0aSQYkgSjo5NcFxassbpp58xScW+30mumeLrTvka2MXz3zv0w5Wm3a80m2cZalrjU0BP0KVwY+yLUGwEc22ZWICgO9U5fMbAyKuEAQ1pSJyMwZTTKSoHSmc62QRnUYVBj7Ks9fLtz/rTwyg3Xv3Sa5UF/o8c+kvHJIztsxV2zfTSq2mjcJRAIeAKJI5RiHj0ZYyET44BzYqcgnjnNxSYFqKalauRWmvbOT9RIwoWmSbGEoeMZl2LdHx2QuOdb/jl66wOXD/otPTi8frkftloQ83+5z3vfOoP/OTXa48sQpXBZ9v2Zme8oy5FVot0KVrW69Rq+RH1XRqYplF+7HUVYyZSdOGa3QgURAbVb9+M9mWs9/54Et+cAlzuxwRGRfwXa3fd1t/7i/ffnN11oc2T1TMK0FqA9gJQrnUopLbnzxhGmt/ENbwj0c60aVJHxVj4+KsnU45T6jIISagcUCno+A6mU1vY3fGA1+/7rGPP7J4dZ9o/vT04pNaqovmjIji8vZve9qJDdsajomkyecDc4UdilcWfpdrwY8xnEnMuRJnhqaUD6QUOm679ZiaWICT/D5JHSRdAcGMvfBKb9vq5nO//Y8z1yvjCTwiaPYBIlI+77x5Xb+lyHtnZkYrdCLJ1uRVOolGm/OslekUj0aJ7WpLC2m2lbaUwUNgBriDOhosJal6E3x04pyPrX/2H77S5sD9hcXT2sBrizBb6LudT3/jvzSzW//SdSvWOgl7D/YOljLVB2Val0XhdJSPWxQrt1SF31WFzBcr7zNVuCqsmTEniDg4p0BSDes38PLMGb9LP/hrn1nsY8Ra5bWjtIWFvtv6E3/4t7dOX/jHbsOkoygiqewdeYavaJRXx3lWoYXOY6Mqu73RQCfl7NEByxFVqEgreUIXFWTFsDyzk8LOb/gVIop3OTHvVLRUc+DpnY/5ldWZ81bIK5HBNCao5lEiOy4DCh2za0qOzoe8i6pg671luNFiDWQ2hj2Z4DsRMGcA+LBuO+4u/o5fN4D6F83Z7XK8+lddZERk8cxvfcHxasvxYI6UKjNlaJPAlDWs8i8oBZYcY9mVb2UdTpaEaNuptV+7IlKaxEBqCELS9R0Xp7b/3eZnvev/tsLouBe9qCgXdH/0DZ9aWX/2q3l6ildXk0rZkWIXcn9bIElmHk+VRnpgPjNE1ubo4MHBjciPqgr2JRpQQlox5c40TWzY+Xubv/vFN6HfP4l7zl8ScuZ2+bN/bP6mOHvum8O6jRwTlH0XJApLBnIOPhRFHuRRIBNBY2YYZpW8TD1tVzpbpYB2tCiSykMCMDloMtTSULPlHGw+7xEvNknAxVcT7o2vPXn7Yt8L/vryJbf1+qo7w1aIhpKyZ1ILdNC4cuYWpiQqcKaA2OXci0zHze9DmcNnTLsZsjkPXpo+d5ke/aQrDCD8l0L1S8n1pe8747t+6vKjbtvnuzCWtKrUZZgYrCm4aVkYRwFIxtofGC+nlZzc6ZQneHSRhUdDDA0VDFHcxCQfX3/em+jHX/dxuxvotaeyCMPFfdpD1NCZD5/ndT3yK401AigneFdl8GNt+1TIAWu/lxX9aeTRLXuGRsMNA4FRUVJev5FWNpz1zslLf/bA4n/x4ts1ctv30aP2HK+2XDjP63ZQXYsKHJyvMkntpK3EvITNraELjbYqbMIxj8uPhEfHKgMKiJpXx/XMOYe3PubZv2ow2nvRouHe/NqzqHNz4L959sLvHetuuIadd1GcuuBH12SzotCYDdIWW8zuv7BG1rRZa3nZ7MEczEXjo27rYXrYD1xmAF11O+0m335uyXIFk89f+MPDM+fum+xO+jiAqCOQz2Ioqmu2J9YQCRxzVqezjNaAaFRlt2PIdgJVVQ5xpVZadxZhy0P30rd9/1Es9Hl+HnpvtjEBtjd7s/htj3x+s+V8dAgmDRA1lgWDMOJttctyznvQmuuyo3Esu7FHU/F89ojDKJjZRJg66z3bvuvpt+6b2+Vub0L336+uLuZRWu+MB73UprcnNBFNUuN2v3a0JuOKmNqYiYnCKGHkEwNZtiifHKiqfPHU1EAgqXqeb+tu/Njsz7/nTTYHvtPyD6e7ofcsZoDk6b//VycmNi84711qVDh4cGAoivhqK2ZXRoQS40jni72HlZODY35XlRV8Y7Kk6pYmdxyffNg3vd0A2v3fzNn5jkZpV87t8jNPe9MHj6874/cmts44DFQsObDLfKPxvYUynZIEK2NGBiE1kiUiXD49r027olmBDVhdScCmc2nTA77xFUSkuLhPp9WU6Wt89S+aMzMjf853vvjo7PmNd0xOYUkSGlPArym2Wupt4XyhzI611fv2HsQeIqWNTY30Nm6kNL3jrd3vnb9639wu99+BRnxnwPf0yCf88m3h/Ot9YE5JVZJl3cjgT2KBOMejDYEWy847uhlMUeRFuMCAmElnctotVTv+vPOUt/z5vbnYusOWarHP6390/gs6feGrw+QMx2GjEEYHDoHcSCV/FK4Lb0tHu2AFqzZDlAizCEdmwoHryZ1Y/8CH/okZ6ODFW/5b5+A7A76f8T0vus1tOPuKsHEDSxI1ZaRkRUjUjVY220a/pb+EMFbcQwHmYfkcfEKHVmYvSBsf/OiXEJGerlOmu6SlAmjTd/zJZUc7W28lx+zhlYygUTIfiyiT9yjfjUopjYqt8bW5opfiDGqm6K7nE72zfhdPuOxj2AvacwcO8uXVf4o3b/zWH3730c5Zn+9OTHhTJyj7szQSiBnDllw8eKy4l2UI2/uGdSPiuutZNj/w9dS/4ipb6LvTdcp0l7RUC32mR9Eq73jEvN9wFjVNNCknD6hygB+zRtphBK2FOEcDCg8VshjByxPblvURe34p887n7vB3+LJGJsp9H33LT5wYzF74C/XERstPVQfWkvA4X1aJjRRA3RU0K3u0DwGgzFwwZa2cp3pq28HND7/ktXOwr13+4V7gzQt9uNlnvucty2HDR10HDIO4imGsawRU3XgMmRIkxTFIAkCFoDWkmpqisGHb+7d91/93q83hyyor3Ckdr/a6yY7n/8H7T/Q2f6DqTeZKsSqHrRVF0MQhNi2lxUA+03nEDFQRyAGrtZqf3cx+87kvoUufc8vehdN/ynSXTKn6fRCRDc55xLxuPocsJlg5SURGcFU1xq9TQhZVZRDbeF3V1CDEw5md1jv/Ua81KOHi/teu4zUuFQGDUvdBj33FYOoM8fVqVpGtKmhMRW4/D7VV8jFp73IlLpJAcIBjqYK4W6d2fnjy5//379wXi60v5yhbfvp3//IYHvT7fmrWyaqKox7IASjLg1n7y403KFJGt5gdnIj6zZN8vHfWOzpPuuzfFvu4U/g+fyW/JBb6PPujb/ywbDz73W7DpItDS2YeLuRzPmMtas5jyXKdhdlBEhAHCr/ubKw7++G/QkT61Upt3WtfF11kMMXked/9kmNTm2sOeTPBIKMK21dVWXW1vB5EeZ5M7IFG+RhtSHT+wy8HDGsnTXeNJ7ejNDOafsjj5k5sfPAxNuJUR9MQxmPHcospa2gWIzsHU5Zud9YtTV2w2Pupt+27I3ni+6w3z8+r9ftu8id+/oBsufANPLOR03CoEAcX2lUYg4rApNBxC7e6HtTipqbJzV7wv7f1X3Wt9fvuzqY5/kp/SSz2mR7/CzfUsxe8rLdxI0vdaJ0ySY28y/qahtG6Zsq3j82S0crk1uN84SN/2WB0ny+2/rvXwoKagTbuevvLjoXt1wfy7KxS49xaSpOyvHRwIPL5YGlsjExpeXZ743d+4xWwr+yj+8qV68sobfNz//C3TkzuvG5qasrRalJVgpHBVw6WLIuBeZ9P0Q+idDZu5rjxvFeu23P553AH6Mx93puJbN/eXY4efsZKvf1hr+DNZ5DEoWUmrMFxB+wJCkETBQoDs0o1u44GvZ1/PPnjl3/cFvAV0ZO/YiO3ozQiSrzz4S+op7eqt2i5IMyn99BxoBRh4mHU1UBwh922L2x43M+8zebA2Ltf8HX8apHErU985u8f7Z7zGeOOc5bUdQFzADcMSwp2iuAYdXSsE2fQ+u073pu5W/272ZPbSnGh72Z+6s3vX53c9hdh4zqXynmGFAXGmZWoYhg0Zn7Ddpra8cCX0SOedGwfdvG9itJzt3gzbPHiPtHOxw7qrY98VtpwTjTJWmg1ElRdWWgHtEniq2k61Dnzn/xTfnkfrBTBd7eR2yJsbg5sZ37rLy2F7UvsiZTYKF+9gvoAhyjeO3do+sH/1H3WH7x7od8/bXaZ7nF8pDjKGT/7+r9fmjnjr3xvI2PFErMBHYJxbkW1VkrT2whnPvgXiS6s70hD8y43Ms3P696r+7TpJ1/9qTS56S3dyUm2KOJ8B4iCpAGkAkxtTNXOhz2fiKTfB+5LU6av+bWYS5epCx/+mkFvW3IAeSYzi0hi0EbF93pcd9b/05anvOGfbA5fFe/tazv2uJCLsPU/sPiyJb/thp4zNxCn1K1gg6FwWOeabQ/+wOxTXveRryfg4047ymLGHiZ+6HUfjJvPewu2bHT1clSOgFEFByOb2YLB7IWvJiIBdn1V9vqajDzCtR+ydbnZ+YiX6vRm8jo0cZPmKdGRmTOPdy/Y9QKDfQm57P5XiyRmR5nZ/VMvPUjnfSGwp+SCkidVZj7o1t2w/XEv+lsD6KstWL/ms62tkNmm5/zx7w0mzv5Yx0+45VtXotu0jWnb+b/VfcKLP7vv67hlujOOsg+7mB7xpGN+0wVzft1Wtlgblobqe9sQNp7/VnrIQ5bzystXl+ruknP3uLhP0AQ661HPGUydmSYmyB2szv3Mhkue8tqFft/t3nt/sfXlW6o5Xv+8Vy0emTjv3wL1nEvJn5jYdmL9g570LqxZeblngZw+HEA4evmu37fXPMIOvfnJTwKyAv79ZrwzQFj+nK57xy88ZvUXz4v2wp4cvOK7/mj82Z4Gr3zaGvSxt7549l9//Sl7mAhf7ZXQr1tD9/sOYBx9zSV/Zpc/1G5760/tMoDud5T7mJENoGNvffo3Xf/qH/hzM7tLjPv/A93qa/nlui/KAAAAAElFTkSuQmCC';
            const ribbonTex = new THREE.TextureLoader().load(RIBBON_PNG);
            const ribbonMat = new THREE.MeshLambertMaterial({
                map: ribbonTex, transparent: true, alphaTest: 0.05,
                emissive: 0xffffff, emissiveMap: ribbonTex, emissiveIntensity: 0.35
            });

            const SHELF_W = 1.9, SHELF_D = 0.32;
            const DISK_Z0 = 0.11;
            function stepX(n) { return Math.min(0.19, (SHELF_W - 0.3) / Math.max(1, n)); }
            function stepZ(n) { return Math.min(0.016, 0.16 / Math.max(1, n)); }

            // ── Vrais livres : json/livredebedroom/book01.json, book02.json… (même format que le lecteur de livre) ──
            // On charge book01, book02… jusqu'au premier fichier absent. Clic sur un dos de livre → lecteur.
            const BOOKS_DIR = 'json/livredebedroom/';
            const BOOKS_MAX = 40;
            let bookDefs = [];
            let spineCache = {};
            let bookReader = null;
            let bookHover = null;
            function makeBookMesh(bk, i) {
                const c = bk.cover || {};
                const color = c.color || '#7c2431', accent = c.accent || '#d6ae5c', tcol = c.textColor || '#e8d6a8';
                const title = typeof bk.title === 'string' ? bk.title : '';
                const pages = Array.isArray(bk.pages) ? bk.pages.length : 1;
                const bw = Math.min(0.075, Math.max(0.035, 0.03 + pages * 0.0025));
                const bh = 0.22 + ((i * 3 + title.length) % 5) * 0.02;
                const key = i + '|' + color + '|' + accent + '|' + title;
                let spineTex = spineCache[key];
                if (!spineTex) {
                    const cv = document.createElement('canvas');
                    cv.width = 64; cv.height = 256;
                    const x = cv.getContext('2d');
                    x.fillStyle = color; x.fillRect(0, 0, 64, 256);
                    x.fillStyle = accent;
                    x.fillRect(0, 12, 64, 5); x.fillRect(0, 21, 64, 2);
                    x.fillRect(0, 233, 64, 2); x.fillRect(0, 239, 64, 5);
                    x.save();
                    x.translate(32, 128); x.rotate(-Math.PI / 2);
                    x.fillStyle = tcol; x.textAlign = 'center'; x.textBaseline = 'middle';
                    let size = 30;
                    do { x.font = size + 'px Georgia, serif'; size -= 2; } while (x.measureText(title).width > 190 && size > 10);
                    x.fillText(title, 0, 1);
                    x.restore();
                    spineTex = spineCache[key] = new THREE.CanvasTexture(cv);
                }
                const plain = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) });
                const spineMat = new THREE.MeshLambertMaterial({ map: spineTex, emissive: 0xffffff, emissiveMap: spineTex, emissiveIntensity: 0.18 });
                const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2), [plain, plain, plain, plain, spineMat, plain]);
                m.castShadow = true; m.receiveShadow = true;
                m.userData.book = i;
                m.userData.bw = bw; m.userData.bh = bh;
                m.userData.spineMat = spineMat;
                m.userData.title = title;
                return m;
            }
            function setBookHover(m) {
                if (bookHover === m) return;
                if (bookHover) bookHover.userData.spineMat.emissiveIntensity = 0.18;
                bookHover = m;
                if (bookHover) bookHover.userData.spineMat.emissiveIntensity = 0.55;
            }
            function openBook(i) {
                if (!bookDefs[i]) return;
                if (!bookReader) bookReader = createBookReader();
                bookReader.open(bookDefs[i]);
            }
            function loadBooks() {
                const out = [];
                function done() { bookDefs = out; spineCache = {}; rebuildTable(order.length); }
                (function next(n) {
                    if (n > BOOKS_MAX) { done(); return; }
                    const url = BOOKS_DIR + 'book' + (n < 10 ? '0' + n : n) + '.json?t=' + Date.now();
                    fetch(url).then(r => {
                        if (!r.ok) { done(); return; }
                        return r.json().then(d => { out.push(d); next(n + 1); },
                            e => { console.warn('[Livres] JSON invalide :', url, e); next(n + 1); });
                    }).catch(done);
                })(1);
            }

            function rebuildTable(n) {
                while (tableGroup.children.length) tableGroup.remove(tableGroup.children[0]);
                const W = SHELF_W, D = SHELF_D, T = 0.028;
                const yTop = 0.37, yBot = -0.43;                  // dessus de la planche du haut / dessous de celle du bas
                const hSide = yTop - yBot;
                const add = (mat, w, h, d, x, y, z) => {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                    m.position.set(x, y, z);
                    m.castShadow = true; m.receiveShadow = true;
                    tableGroup.add(m);
                    return m;
                };
                // Montants + fond
                [-1, 1].forEach(s => add(woodMat, T, hSide, D, s * (W / 2 - T / 2), (yTop + yBot) / 2, D / 2 + 0.002));
                add(backMat, W - 2 * T, hSide, 0.012, 0, (yTop + yBot) / 2, 0.008);
                // 3 planches
                const inner = W - 2 * T;
                add(woodMat, inner, T, D, 0, yTop - T / 2, D / 2 + 0.002);        // haut
                add(woodMat, inner, T, D, 0, -T / 2, D / 2 + 0.002);              // milieu (porte les disquettes)
                add(woodMat, inner, T, D, 0, yBot + T / 2, D / 2 + 0.002);         // bas
                // Rebord avant bas (retient les livres) + plinthe décorative sous le caisson
                add(woodDarkMat, W, 0.05, 0.03, 0, yBot - 0.025, D - 0.006);
                add(woodDarkMat, W + 0.03, 0.02, 0.05, 0, yBot - 0.06, D - 0.014);

                // Corniche au-dessus : 3 moulures + bandeau qui porte le ruban
                add(woodDarkMat, W + 0.10, 0.025, D + 0.06, 0, yTop + 0.0125, D / 2 + 0.03);
                add(woodMat, W + 0.04, 0.24, 0.03, 0, yTop + 0.025 + 0.12, D - 0.01);
                add(woodDarkMat, W + 0.10, 0.03, D + 0.06, 0, yTop + 0.025 + 0.255, D / 2 + 0.03);
                add(woodDarkMat, W + 0.14, 0.02, D + 0.09, 0, yTop + 0.025 + 0.28, D / 2 + 0.045);
                const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.207), ribbonMat);
                ribbon.position.set(0, yTop + 0.025 + 0.12, D - 0.01 + 0.0155);
                tableGroup.add(ribbon);

                // Vrais livres sur la planche du bas, de gauche à droite
                setBookHover(null);
                let bx = -inner / 2 + 0.06;
                bookDefs.forEach((bk, i) => {
                    const m = makeBookMesh(bk, i);
                    m.position.set(bx + m.userData.bw / 2, yBot + T + m.userData.bh / 2, 0.16);
                    tableGroup.add(m);
                    bx += m.userData.bw + 0.006;
                });
            }

            // ─ Disquette 3,5" (coin coupé, volet métallique, étiquette) ─
            const PALETTE = [0x1d3a8a, 0xa12a2a, 0x2a2a2a, 0x2f6b3a, 0x8a6a1d, 0x5a2a7a];
            function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
            const floppyGeo = (function () {
                const h = FW / 2, c = 0.04, sh = new THREE.Shape();
                sh.moveTo(-h, -h); sh.lineTo(h, -h); sh.lineTo(h, h - c); sh.lineTo(h - c, h); sh.lineTo(-h, h); sh.lineTo(-h, -h);
                const g = new THREE.ExtrudeGeometry(sh, { depth: FT, bevelEnabled: false });
                g.rotateX(-Math.PI / 2);
                g.translate(0, -FT / 2, 0);
                return g;
            })();
            function makeFloppy(name) {
                const g = new THREE.Group();
                const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE[hash(name) % PALETTE.length] });
                g.add(new THREE.Mesh(floppyGeo, bodyMat));
                const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.09, FT + 0.004, 0.075),
                    new THREE.MeshStandardMaterial({ color: 0xb9b9b9, metalness: 0.8, roughness: 0.35 }));
                shutter.position.set(0.01, 0, -FW / 2 + 0.04);
                g.add(shutter);
                const notch = new THREE.Mesh(new THREE.BoxGeometry(0.022, FT + 0.002, 0.022), new THREE.MeshBasicMaterial({ color: 0x050505 }));
                notch.position.set(-FW / 2 + 0.03, 0, FW / 2 - 0.02);
                g.add(notch);
                const c = document.createElement('canvas');
                c.width = 384; c.height = 280;
                const x = c.getContext('2d');
                x.fillStyle = '#f3ecd6'; x.fillRect(0, 0, 384, 280);
                x.fillStyle = '#c0392b'; x.fillRect(0, 0, 384, 34);
                x.fillStyle = '#9aa'; x.fillRect(20, 200, 344, 2); x.fillRect(20, 240, 344, 2);
                x.fillStyle = '#1b1b1b';
                let size = 78;
                x.textAlign = 'center'; x.textBaseline = 'middle';
                do { x.font = 'bold ' + size + 'px "Comic Sans MS", "Segoe Print", cursive'; size -= 3; } while (x.measureText(name).width > 350 && size > 14);
                x.fillText(name, 192, 120);
                const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.11), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
                label.rotation.set(-Math.PI / 2, 0, Math.PI);
                label.position.set(0, FT / 2 + 0.0007, FW / 2 - 0.075);
                g.add(label);
                g.userData.disk = name;
                g.userData.bodyMat = bodyMat;
                return g;
            }

            const disks = {};
            let order = [];
            let inserted = null;
            let busy = false;

            function slot(k) {
                const n = Math.max(1, order.length);
                const v = new THREE.Vector3((k - (n - 1) / 2) * stepX(n), FW / 2 + 0.002, DISK_Z0 + (n - 1 - k) * stepZ(n));
                return v.applyMatrix4(shelfFrame.matrix);
            }
            function outFront(p) {      // sortir/rentrer une disquette par l'avant du rayon
                return p.clone().add(new THREE.Vector3(0, 0, 0.32).applyQuaternion(shelfFrame.quaternion));
            }
            function tween(obj, toPos, toQuat, ms) {
                return new Promise(resolve => {
                    const p0 = obj.position.clone(), q0 = obj.quaternion.clone(), t0 = performance.now();
                    (function step(t) {
                        const k = Math.min(1, (t - t0) / ms);
                        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                        obj.position.lerpVectors(p0, toPos, e);
                        obj.quaternion.copy(q0).slerp(toQuat, e);
                        if (k < 1) requestAnimationFrame(step); else resolve();
                    })(t0);
                });
            }

            function sync(names) {
                order = names.slice();
                Object.keys(disks).forEach(n => {
                    if (!order.includes(n) && n !== inserted) { group.remove(disks[n]); delete disks[n]; }
                });
                order.forEach(n => {
                    if (!disks[n]) { disks[n] = makeFloppy(n); group.add(disks[n]); }
                });
                rebuildTable(order.length);
                order.forEach((n, k) => {
                    if (n === inserted) return;
                    disks[n].position.copy(slot(k));
                    disks[n].quaternion.copy(boxQuat);
                });
            }

            async function insertDisk(name) {
                const g = disks[name];
                if (!g) return;
                await tween(g, outFront(g.position), boxQuat, 260);
                await tween(g, readyPos, flatQuat, 520);
                await tween(g, frontPos, flatQuat, 160);
                await tween(g, insertedPos, flatQuat, 300);
                inserted = name;
                ledMat.color.setHex(0x00ff00);
                drawDriveLabel(name);
                toast('📼 ' + name);
                TVTapes.select(name);
                window._tvHasDisk = true;
                savedDiskName = name;
                history = []; historyIndex = -1;
                loadRandomVideo();
                applyScreen();
                if (!window._isOn) setPower(true);      // la télé s'allume toute seule dès qu'on insère une disquette
                saveTVState();
            }

            async function ejectDisk() {
                const name = inserted;
                if (!name) return;
                const g = disks[name];
                inserted = null;
                ledMat.color.setHex(0x550000);
                drawDriveLabel(null);
                window._tvHasDisk = false;
                savedDiskName = null;
                video.pause();
                video.removeAttribute('src');
                video.load();
                clearBlobs();
                applyScreen();
                saveTVState();
                await tween(g, frontPos, flatQuat, 300);
                const k = order.indexOf(name);
                if (k < 0) { group.remove(g); delete disks[name]; return; }
                const s = slot(k);
                const above = outFront(s);
                await tween(g, readyPos, flatQuat, 200);
                await tween(g, above, boxQuat, 520);
                await tween(g, s, boxQuat, 240);
            }

            async function onDiskClick(name) {
                if (busy) return;
                busy = true;
                try {
                    if (inserted === name) await ejectDisk();
                    else { if (inserted) await ejectDisk(); await insertDisk(name); }
                } finally { busy = false; }
            }

            window._tvRefreshDisks = function () {
                if (busy) return Promise.resolve();
                return TVTapes.refresh().then(() => sync(TVTapes.names()));
            };

            // Départ : on restaure l'état de la dernière partie (voir plus haut)
            ensureTVTapes().then(() => {
                sync(TVTapes.names());
                const cur = TVTapes.current;
                let wanted = cur;                                          // 1re partie : disquette par défaut
                if (initialState && initialState.disk === null) wanted = null;   // éjectée la dernière fois
                else if (initialState && typeof initialState.disk === 'string' && disks[initialState.disk]) wanted = initialState.disk;
                if (wanted && wanted !== cur) {                            // autre disquette que celle chargée au départ
                    TVTapes.current = wanted;
                    history = []; historyIndex = -1;
                    loadRandomVideo();
                }
                if (wanted && disks[wanted]) {
                    disks[wanted].position.copy(insertedPos);
                    disks[wanted].quaternion.copy(flatQuat);
                    inserted = wanted;
                    savedDiskName = wanted;
                    ledMat.color.setHex(0x00ff00);
                    drawDriveLabel(wanted);
                    window._tvHasDisk = true;
                } else if (wanted === null) {
                    savedDiskName = null;
                }
                if (initialState && initialState.isOn) {                   // télé allumée la dernière fois
                    window._isOn = true;
                    initAudioGraph();
                    // le navigateur peut exiger un geste avant de lancer le son/la vidéo : au 1er clic/touche on relance
                    const kick = () => {
                        document.removeEventListener('pointerdown', kick, true);
                        document.removeEventListener('keydown', kick, true);
                        if (window._isOn) {
                            if (actx && actx.state === 'suspended') actx.resume();
                            applyScreen();
                        }
                    };
                    document.addEventListener('pointerdown', kick, true);
                    document.addEventListener('keydown', kick, true);
                }
                applyScreen();
                stateReady = true;      // on n'écrit rien au chargement : seulement quand tu fais une action
            });

            // ─ Souris / toucher : nom du dossier + clic ─
            const isTouch = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
            const tip = document.createElement('div');
            tip.style.cssText = 'position:fixed;display:none;padding:6px 12px;background:rgba(15,12,8,.88);color:#f3ecd6;' +
                'font:14px "Courier New",monospace;border:1px solid #8a6a3a;border-radius:4px;z-index:9999;pointer-events:none;';
            document.body.appendChild(tip);
            let tipTimer = null;
            function showTip(text, x, y, ms) {
                tip.textContent = text;
                tip.style.left = Math.min(x + 16, window.innerWidth - 220) + 'px';
                tip.style.top = (y + 16) + 'px';
                tip.style.display = 'block';
                clearTimeout(tipTimer);
                if (ms) tipTimer = setTimeout(() => { tip.style.display = 'none'; }, ms);
            }
            const toastEl = document.createElement('div');
            toastEl.style.cssText = 'position:fixed;left:50%;bottom:14%;transform:translateX(-50%);padding:8px 18px;' +
                'background:rgba(15,12,8,.88);color:#f3ecd6;font:16px "Courier New",monospace;border:1px solid #8a6a3a;' +
                'border-radius:6px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .3s;';
            document.body.appendChild(toastEl);
            let toastTimer = null;
            function toast(text) {
                toastEl.textContent = text;
                toastEl.style.opacity = '1';
                clearTimeout(toastTimer);
                toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 3000);
            }
            function tipText(name) {
                const c = TVTapes.find(name);
                return '📼 ' + name + (c ? '  (' + c.videos.length + ' vidéo' + (c.videos.length > 1 ? 's' : '') + ')' : '') +
                    (inserted === name ? '  — toucher/cliquer pour éjecter' : '');
            }
            const rc = new THREE.Raycaster();
            const mv = new THREE.Vector2();
            let hovered = null;
            let selected = null;      // toucher : 1er tap = voir le nom, 2e tap = insérer
            function clearGlow() {
                if (hovered && hovered.userData.bodyMat && hovered !== selected) hovered.userData.bodyMat.emissive.setHex(0x000000);
            }
            function pick(ev) {
                const r = canvas.getBoundingClientRect();
                mv.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
                rc.setFromCamera(mv, camera);
                const list = Object.keys(disks).map(n => disks[n]).concat([ejectBtn, tableGroup], window._knobMeshes || []);
                const hits = rc.intersectObjects(list, true);   // les boutons de la télé bouchent la vue : s'ils sont touchés en 1er, on ignore
                if (!hits.length || hits[0].distance > 7) return null;
                let o = hits[0].object;
                while (o && !o.userData.disk && !o.userData.eject && !o.userData.box && typeof o.userData.book !== 'number') o = o.parent;
                return o || null;
            }
            canvas.addEventListener('mousemove', function (ev) {
                if (isTouch) return;
                const o = pick(ev);
                clearGlow();
                hovered = (o && o.userData.disk) ? o : null;
                const bookObj = (o && typeof o.userData.book === 'number') ? o : null;
                setBookHover(bookObj);
                if (o) canvas.style.cursor = 'pointer';
                if (hovered) {
                    hovered.userData.bodyMat.emissive.setHex(0x444444);
                    showTip(tipText(hovered.userData.disk), ev.clientX, ev.clientY, 0);
                } else if (o && o.userData.eject) {
                    showTip('⏏ Éjecter', ev.clientX, ev.clientY, 0);
                } else if (bookObj) {
                    showTip('📖 ' + (bookObj.userData.title || 'Livre'), ev.clientX, ev.clientY, 0);
                } else {
                    tip.style.display = 'none';
                }
            });
            canvas.addEventListener('click', function (ev) {
                const o = pick(ev);
                if (selected && (!o || o !== selected)) { selected.userData.bodyMat.emissive.setHex(0x000000); selected = null; }
                if (!o) return;
                if (o.userData.disk) {
                    const name = o.userData.disk;
                    if (isTouch && selected !== o) {
                        selected = o;
                        o.userData.bodyMat.emissive.setHex(0x444444);
                        showTip(tipText(name) + '  — touche encore pour ' + (inserted === name ? 'éjecter' : 'insérer'), ev.clientX, ev.clientY, 3500);
                        return;
                    }
                    if (selected) { selected.userData.bodyMat.emissive.setHex(0x000000); selected = null; }
                    tip.style.display = 'none';
                    onDiskClick(name);
                } else if (o.userData.eject) {
                    if (!busy && inserted) { busy = true; ejectDisk().finally(() => { busy = false; }); }
                } else if (typeof o.userData.book === 'number') {
                    tip.style.display = 'none';
                    openBook(o.userData.book);
                } else if (o.userData.box) {
                    window._tvRefreshDisks();
                }
            });
            loadBooks();
        })();

        console.log('📺 Télévision ajoutée.');
    }

    createVintageTV();




    // ─── INTERACTIONS ──────────────────────────────────────────────
    function setupTVInteractions() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hoveredKnob = null;

        canvas.addEventListener('mousemove', function(event) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const knobMeshes = window._knobMeshes || [];
            const intersects = raycaster.intersectObjects(knobMeshes, false);
            let newHover = null;
            if (intersects.length > 0) {
                newHover = intersects[0].object;
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }

            if (newHover !== hoveredKnob) {
                if (hoveredKnob) {
                    window._unhighlightKnob(hoveredKnob);
                }
                hoveredKnob = newHover;
                if (hoveredKnob) {
                    window._highlightKnob(hoveredKnob);
                }
            }
        });

        canvas.addEventListener('click', function(event) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const knobMeshes = window._knobMeshes || [];
            const intersects = raycaster.intersectObjects(knobMeshes, false);
            if (intersects.length > 0) {
                const obj = intersects[0].object;
                const action = obj.userData.action;
                if (action) {
                    window._animateKnobPress(obj, function() {
                        handleKnobAction(action);
                    });
                }
            }
        });

        function handleKnobAction(action) {
            const video = window._video;
            const screen = window._screen;
            const blackMat = window._blackMat;
            const videoMaterial = window._videoMaterial;
            let isOn = window._isOn;

            switch (action) {
                case 'power':
                    window._tvSetPower(!window._isOn);
                    break;
                case 'next':
                    window._nextVideo();
                    break;
                case 'prev':
                    window._prevVideo();
                    break;
            }
            if (window._tvSave) window._tvSave();
        }
    }
    setupTVInteractions();
}
