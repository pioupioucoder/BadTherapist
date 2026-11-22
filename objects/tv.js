import * as THREE from 'three';

// ==========================================
// ILLUSION — LA TÉLÉ (objects/tv.js)
// ==========================================
// Télé vintage + lecteur de disquettes sous la télé + étagère à disquettes.
// Chaque dossier de /videos = une disquette (liste dynamique via videos.php).
// Utilisation : buildTV(scene, { camera, canvas });

export function buildTV(scene, o) {
    const camera = o.camera;
    const canvas = o.canvas;

    // ─── TÉLÉVISION ──────────────────────────────────────────────
    function createIconTexture(symbol) {
        const canvas2 = document.createElement('canvas');
        canvas2.width = 64;
        canvas2.height = 64;
        const ctx = canvas2.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, 32, 34);
        return new THREE.CanvasTexture(canvas2);
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
            return fetch('videos.php?t=' + Date.now())
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(data => {
                    this.cassettes = (data && data.cassettes) || [];
                    if (!this.cassettes.length) console.warn('[TV] aucune disquette trouvée dans /videos');
                    if (!this.current) {
                        let saved = null;
                        try { saved = sessionStorage.getItem('tvCassette'); } catch (e) {}
                        const pick = [saved, 'Zeph'].find(n => n && this.find(n));
                        this.current = pick || (this.cassettes[0] && this.cassettes[0].name) || null;
                    }
                })
                .catch(err => console.error('[TV] videos.php illisible (XAMPP/PHP lancé ? fichier à la racine ?)', err));
        },
        find(name) { return this.cassettes.find(c => c.name === name); },
        names() { return this.cassettes.map(c => c.name); },
        select(name) {
            this.current = name;
            try { sessionStorage.setItem('tvCassette', name); } catch (e) {}
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
            saveTVState();
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
            if (historyIndex <= 0) {
                loadRandomVideo();
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

        let volumeSetting = 0.6;
        try {
            const raw = sessionStorage.getItem('tvState');
            if (raw) {
                const st = JSON.parse(raw);
                if (st && st.volume > 0) volumeSetting = st.volume;
            }
        } catch (e) {}

        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        window._videoTexture = videoTexture;
        const videoMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });

        function saveTVState() {
            try {
                sessionStorage.setItem('tvState', JSON.stringify({
                    isOn: !!window._isOn,
                    volume: volumeSetting
                }));
            } catch (e) {}
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
            { x: -0.4, symbol: '⏻', action: 'power' },
            { x: 0, symbol: '+', action: 'next' },
            { x: 0.4, symbol: '−', action: 'prev' }
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
            icon.position.set(cfg.x, 0.47, 0.48);
            top.add(icon);
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
            const TABLE = { x: -1.6, zFront: 0.55, h: 0.62 };           // étagère à disquettes (repère des disquettes)
            const FW = 0.22, FT = 0.014;
            const flatQuat = new THREE.Quaternion();
            const boxQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, Math.PI, 0, 'YXZ'));
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

            // ─ Étagère en bois à disquettes (style vintage, sans chichi) ─
            // Montants pleins, 2 étagères, plateau qui déborde, tablier devant avec le ruban orange
            // (sensibilisation à l'automutilation), petit bac incliné sur le dessus pour les disquettes.
            const tableGroup = new THREE.Group();
            tableGroup.userData.box = true;
            group.add(tableGroup);

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
            const woodMat = new THREE.MeshLambertMaterial({ map: grainTex, color: 0xc8a483 });
            const woodDarkMat = new THREE.MeshLambertMaterial({ map: grainTex, color: 0x8c6a4e });
            const backMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0e });

            // Ruban orange (sensibilisation à l'automutilation) dessiné sur canvas, fond transparent
            const ribbonTex = (function () {
                const c = document.createElement('canvas');
                c.width = 128; c.height = 128;
                const x = c.getContext('2d');
                x.lineJoin = 'round'; x.lineCap = 'round';
                function path() {
                    x.beginPath();
                    x.moveTo(36, 118);
                    x.lineTo(80, 54);
                    x.bezierCurveTo(94, 34, 84, 10, 64, 10);
                    x.bezierCurveTo(44, 10, 34, 34, 48, 54);
                    x.lineTo(92, 118);
                }
                path(); x.strokeStyle = '#b85400'; x.lineWidth = 26; x.stroke();
                path(); x.strokeStyle = '#ff8a1c'; x.lineWidth = 17; x.stroke();
                return new THREE.CanvasTexture(c);
            })();
            const ribbonMat = new THREE.MeshLambertMaterial({ map: ribbonTex, transparent: true, alphaTest: 0.1 });

            // Profil (z, y) extrudé sur la largeur → cale et joues en pente du bac
            function profileMesh(pts, width, cx, mat) {
                const sh = new THREE.Shape();
                sh.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
                sh.lineTo(pts[0][0], pts[0][1]);
                const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
                g.rotateY(-Math.PI / 2);
                g.translate(cx + width / 2, 0, 0);
                const m = new THREE.Mesh(g, mat);
                m.castShadow = true; m.receiveShadow = true;
                tableGroup.add(m);
                return m;
            }

            function rebuildTable(n) {
                while (tableGroup.children.length) tableGroup.remove(tableGroup.children[0]);
                const D = Math.max(0.30, n * 0.05 + 0.14);       // profondeur du bac à disquettes
                const W = 0.28;                                   // largeur du bac
                const cx = TABLE.x;
                const bf = TABLE.zFront - 0.04;                   // face avant du bac
                const zB = bf - D;                                // fond du bac
                const tz = bf - D / 2;
                const slope = 0.012 / 0.05;                       // même pente que les disquettes (slot)
                const z0 = TABLE.zFront - 0.11;
                const yr = z => TABLE.h + 0.006 + (z0 - z) * slope;
                const yBase = TABLE.h - 0.05;                     // dessus de l'étagère

                const add = (mat, w, h, d, x, y, z) => {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                    m.position.set(x, y, z);
                    m.castShadow = true; m.receiveShadow = true;
                    tableGroup.add(m);
                    return m;
                };

                // Étagère : montants, fond, 2 étagères, plateau, tablier, plinthe
                const BW = 0.44, BD = D + 0.08, T = 0.022;
                const zFront = tz + BD / 2, zBack = tz - BD / 2;
                const hTop = yBase - 0.03;                        // dessous du plateau
                [-1, 1].forEach(s => add(woodMat, T, hTop, BD, cx + s * (BW / 2 - T / 2), hTop / 2, tz));
                add(backMat, BW - 2 * T, hTop, 0.01, cx, hTop / 2, zBack + 0.005);
                const inner = BW - 2 * T;
                add(woodMat, inner, 0.02, BD - 0.01, cx, 0.10, tz + 0.005);   // étagère du bas
                add(woodMat, inner, 0.02, BD - 0.01, cx, 0.33, tz + 0.005);   // étagère du milieu
                add(woodDarkMat, inner, 0.05, 0.02, cx, 0.025, zFront - 0.03); // plinthe en retrait
                add(woodMat, BW + 0.05, 0.03, BD + 0.04, cx, yBase - 0.015, tz + 0.01); // plateau qui déborde
                add(woodMat, inner, 0.11, 0.02, cx, hTop - 0.055, zFront - 0.01);      // tablier

                // Ruban orange sur le tablier
                const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.095), ribbonMat);
                ribbon.position.set(cx, hTop - 0.055, zFront + 0.0015);
                tableGroup.add(ribbon);

                // Quelques livres sur l'étagère du milieu
                const bookCols = [0x6b2a2a, 0x2c3e50, 0x5a5a3a, 0x7a5a2a, 0x3a4a3a];
                const bookH = [0.19, 0.15, 0.17, 0.13, 0.18];
                bookCols.forEach((col, i) => {
                    const bw = 0.035 + (i % 2) * 0.008;
                    add(new THREE.MeshLambertMaterial({ color: col }), bw, bookH[i], BD - 0.10,
                        cx - inner / 2 + 0.03 + i * 0.045, 0.34 + bookH[i] / 2, tz);
                });

                // Bac incliné sur le plateau (cale + joues + fond)
                profileMesh([[bf, yBase], [zB, yBase], [zB, yr(zB)], [bf, yr(bf)]], W, cx, woodDarkMat);
                [-1, 1].forEach(s => {
                    profileMesh([[bf + 0.01, yBase], [zB - 0.018, yBase], [zB - 0.018, yr(zB) + 0.12], [bf + 0.01, yr(bf) + 0.05]],
                        0.018, cx + s * (W / 2 + 0.009), woodMat);
                });
                const yBT = yr(zB) + 0.20;
                add(woodMat, W + 0.036, yBT - yBase, 0.018, cx, (yBT + yBase) / 2, zB - 0.009);
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
                return new THREE.Vector3(TABLE.x, TABLE.h + 0.006 + FW / 2 + k * 0.012, TABLE.zFront - 0.04 - 0.07 - k * 0.05);
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
                const up = g.position.clone(); up.y += 0.36;
                await tween(g, up, boxQuat, 240);
                await tween(g, readyPos, flatQuat, 520);
                await tween(g, frontPos, flatQuat, 160);
                await tween(g, insertedPos, flatQuat, 300);
                inserted = name;
                ledMat.color.setHex(0x00ff00);
                drawDriveLabel(name);
                toast('📼 ' + name);
                TVTapes.select(name);
                window._tvHasDisk = true;
                history = []; historyIndex = -1;
                loadRandomVideo();
                applyScreen();
            }

            async function ejectDisk() {
                const name = inserted;
                if (!name) return;
                const g = disks[name];
                inserted = null;
                ledMat.color.setHex(0x550000);
                drawDriveLabel(null);
                window._tvHasDisk = false;
                video.pause();
                video.removeAttribute('src');
                video.load();
                clearBlobs();
                applyScreen();
                await tween(g, frontPos, flatQuat, 300);
                const k = order.indexOf(name);
                if (k < 0) { group.remove(g); delete disks[name]; return; }
                const s = slot(k);
                const above = s.clone(); above.y += 0.36;
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

            // Départ : la disquette par défaut (Zeph) est déjà dans le lecteur
            ensureTVTapes().then(() => {
                sync(TVTapes.names());
                const cur = TVTapes.current;
                if (cur && disks[cur]) {
                    disks[cur].position.copy(insertedPos);
                    disks[cur].quaternion.copy(flatQuat);
                    inserted = cur;
                    ledMat.color.setHex(0x00ff00);
                    drawDriveLabel(cur);
                    window._tvHasDisk = true;
                    applyScreen();
                }
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
                const list = Object.keys(disks).map(n => disks[n]).concat([ejectBtn, tableGroup]);
                const hits = rc.intersectObjects(list, true);
                if (!hits.length || hits[0].distance > 7) return null;
                let o = hits[0].object;
                while (o && !o.userData.disk && !o.userData.eject && !o.userData.box) o = o.parent;
                return o || null;
            }
            canvas.addEventListener('mousemove', function (ev) {
                if (isTouch) return;
                const o = pick(ev);
                clearGlow();
                hovered = (o && o.userData.disk) ? o : null;
                if (o) canvas.style.cursor = 'pointer';
                if (hovered) {
                    hovered.userData.bodyMat.emissive.setHex(0x444444);
                    showTip(tipText(hovered.userData.disk), ev.clientX, ev.clientY, 0);
                } else if (o && o.userData.eject) {
                    showTip('⏏ Éjecter', ev.clientX, ev.clientY, 0);
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
                } else if (o.userData.box) {
                    window._tvRefreshDisks();
                }
            });
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
