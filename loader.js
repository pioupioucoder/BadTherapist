// loader.js – écran de chargement « pixel » après PLAY + préchargement de TOUS les fichiers du site.
//
// À charger dans index.html (script normal, avant le code du menu) :  <script src="loader.js"></script>
// Il crée window.BTGo(url) : affiche l'écran de chargement, télécharge tout le site dans le cache du navigateur
// (pour que le jeu ne charge plus rien en cours de route : fini les saccades quand on sort dehors),
// puis ouvre `url`. Aucun nom de fichier n'est jamais affiché.
//
// La liste des fichiers vient de assets-manifest.json (créé par make-manifest.ps1, à relancer quand tu ajoutes
// des fichiers). Sans ce fichier, seuls les fichiers de la liste de secours ci-dessous sont préchargés.

// loader.js – écran de chargement « pixel » + préchargement AUTOMATIQUE de tous les fichiers du site
// + écran qui reste affiché dans le jeu tant que tout n'est pas prêt (plus d'écran noir au démarrage).
//
// À charger dans index.html ET en tout premier dans le <head> de la page du jeu (celle que BTGo ouvre) :
//     <script src="loader.js"></script>
//
// 1) Sur le menu : window.BTGo(url) affiche l'écran de chargement, télécharge tout le site dans le cache du
//    navigateur, puis ouvre `url`.
// 2) Dans le jeu : l'écran de chargement reste affiché (sans coupure) pendant que le jeu prépare ses personnages,
//    la maison, les shaders... Il disparaît tout seul quand tout est prêt. Les modules du jeu peuvent y
//    participer : window.BTLoad.hold('nom') au début d'un chargement, window.BTLoad.release('nom') à la fin.
//
// Liste des fichiers : AUTOMATIQUE, aucun manifest à lancer.
//   a) assets.php (à mettre à côté de loader.js ; XAMPP a PHP) : liste tout le dossier, tailles comprises ;
//   b) sinon : analyse des imports / chemins écrits dans les .js/.html + lecture des dossiers (index Apache) ;
//   c) en dernier recours : assets-manifest.json s'il existe, puis la liste de secours ci-dessous.
//
// Diagnostic des saccades : ouvre le jeu avec ?perf à la fin de l'adresse (ou touche F3) pour voir les FPS, et la
// console (F12) affiche « [BT] ⏱ blocage de … ms » à chaque fois que le jeu se fige plus de 120 ms.

(function () {
    'use strict';

    const LIST_PHP = 'assets.php';
    const MANIFEST = 'assets-manifest.json';
    const CONCURRENCY = 6;
    const MIN_SECONDS = 3.2;          // durée minimale de l'animation, même si tout est déjà en cache
    const HANDOFF_KEY = 'bt-handoff';
    const HANDOFF_MAX_AGE = 120000;   // l'écran est repris dans le jeu si on y arrive moins de 2 min après BTGo
    const HANDOFF_MIN = 1.0;          // s : durée minimale dans le jeu
    const HANDOFF_SETTLE = 700;       // ms de calme sans nouveau chargement avant de retirer l'écran
    const HANDOFF_TIMEOUT = 45000;    // sécurité : l'écran part quoi qu'il arrive
    const SMOOTH_FRAMES = 30, SMOOTH_MS = 40;   // « le jeu est fluide » = 30 images de suite sous 40 ms
    const FALLBACK = [
        'index.html', 'world_base.html', 'immeuble.js', 'bedroom.js', 'corridor.js', 'elevator.js', 'rdc.js', 'forest.js', 'work.js',
        'vehicle.js', 'taxi.js', 'worker.js', 'nightstand.js', 'journal.js', 'bookreader.js', 'phone.js', 'phone-item.js',
        'avatar-loader.js', 'audio-manager.js', 'save-data.js', 'therapist-ai.js', 'therapist-config.js',
        'therapist-memory.js', 'evelyn-brain.js', 'evelyn-life.js', 'evelyn-phone.js'
    ];
    const SKIP = /(^|\/)(\.git|node_modules|\.vscode|\.idea|backups?|saves?)(\/|$)|\.(php|ps1|bat|md|psd|blend1?|zip|rar|7z|bak|log|tmp|map|sh|sql|ini)$/i;
    const BIG = /\.(fbx|glb|gltf|png|jpe?g|webp|mp3|ogg|wav|m4a|mp4|webm|hdr|exr)$/i;
    const TEXT = /\.(js|mjs|html?|css)$/i;
    const EXT = 'js|mjs|json|png|jpe?g|webp|gif|fbx|glb|gltf|mp3|ogg|wav|m4a|woff2?|ttf|css|html?|svg|txt|mp4|webm';

    const ROOT = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href;
    const ROOT_PATH = new URL(ROOT).pathname;

    // ─── API pour le jeu : window.BTLoad ────────────────────────────
    const BT = window.BTLoad = {
        active: function () { return false; },
        hold: function () { },
        release: function () { }
    };

    // ─── Diagnostic : blocages du thread principal + petit compteur de FPS ───
    try {
        new PerformanceObserver(function (l) {
            l.getEntries().forEach(function (e) {
                if (e.duration > 120) console.log('[BT] ⏱ blocage de ' + Math.round(e.duration) + ' ms (à ' + (e.startTime / 1000).toFixed(1) + ' s)');
            });
        }).observe({ entryTypes: ['longtask'] });
    } catch (e) { /* navigateur sans longtask */ }

    function perfHud() {
        if (document.getElementById('bt-perf')) return;
        const d = document.createElement('div');
        d.id = 'bt-perf';
        d.style.cssText = 'position:fixed;left:6px;top:6px;z-index:100000;font:12px monospace;color:#9f9;background:rgba(0,0,0,.6);padding:3px 6px;pointer-events:none';
        (document.body || document.documentElement).appendChild(d);
        let n = 0, worst = 0, last = performance.now(), t0 = last;
        (function f(now) {
            n++; worst = Math.max(worst, now - last); last = now;
            if (now - t0 >= 1000) {
                let extra = '';
                const R = window.BTRenderer, S = window.BTScene;
                if (R && R.info) {
                    let lights = 0;
                    if (S) S.traverseVisible(function (o) { if (o.isLight) lights++; });
                    extra = ' · ' + R.info.render.calls + ' dessins · ' + Math.round(R.info.render.triangles / 1000) + 'k tris · ' + lights + ' lumières';
                }
                d.textContent = n + ' fps · pire image ' + Math.round(worst) + ' ms' + extra;
                d.style.color = worst > 100 ? '#f88' : '#9f9'; n = 0; worst = 0; t0 = now;
            }
            requestAnimationFrame(f);
        })(last);
    }
    if (/[?&]perf\b/.test(location.search)) addEventListener('DOMContentLoaded', perfHud);
    addEventListener('keydown', function (e) { if (e.key === 'F3') { e.preventDefault(); perfHud(); } });

    let running = false;
    let ui = null;

    // ─── Petit générateur aléatoire (la même scène à chaque fois) ───
    function prng(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }


    // ─── Interface ──────────────────────────────────────────────────
    function buildUi(instant) {
        const css = document.createElement('style');
        css.textContent = `
#bt-load{position:fixed;inset:0;z-index:99999;background:#02030a;display:flex;align-items:center;justify-content:center;overflow:hidden;
  font-family:'Press Start 2P',monospace;color:#f2f2f2;opacity:0;transition:opacity .5s}
#bt-load.on{opacity:1}
#bt-load canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
#bt-load .scan{position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(to bottom,transparent 0,transparent 2px,rgba(0,0,0,.28) 3px,rgba(0,0,0,.28) 4px)}
#bt-load .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.85) 100%)}
#bt-load .title{position:absolute;top:7%;left:0;right:0;text-align:center;font-size:clamp(14px,4vw,30px);letter-spacing:3px;
  text-shadow:3px 3px 0 #333}
#bt-load .title.glitch{text-shadow:-3px 0 #c22,3px 0 #2cc;transform:translateX(2px)}
#bt-load .bottom{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);width:min(560px,86vw);text-align:center}
#bt-load .bar{display:flex;gap:3px;padding:4px;border:3px solid #f2f2f2;box-shadow:0 0 0 3px #000;background:#05060c}
#bt-load .bar i{flex:1;height:14px;background:#12141c}
#bt-load .bar i.f{background:#e8e2cf;box-shadow:0 0 6px rgba(255,214,140,.6)}
#bt-load .bar i.h{background:#ffcf7a}
#bt-load .pct{margin-top:12px;font-size:clamp(10px,2.4vw,14px);color:#d6d0bd}
#bt-load .flash{position:absolute;inset:0;background:#ffe2a8;opacity:0;pointer-events:none}`;
        (document.head || document.documentElement).appendChild(css);

        const root = document.createElement('div');
        root.id = 'bt-load';
        root.innerHTML = '<canvas></canvas><div class="vig"></div><div class="scan"></div>' +
            '<div class="title">BAD THERAPIST</div>' +
            '<div class="bottom"><div class="bar"></div><div class="pct">0%</div></div>' +
            '<div class="flash"></div>';
        document.documentElement.appendChild(root);

        const bar = root.querySelector('.bar');
        const cells = [];
        for (let i = 0; i < 24; i++) { const c = document.createElement('i'); bar.appendChild(c); cells.push(c); }

        ui = {
            root: root, cv: root.querySelector('canvas'), title: root.querySelector('.title'),
            pct: root.querySelector('.pct'), cells: cells, flash: root.querySelector('.flash')
        };
        if (instant) {                                  // dans le jeu : pas de fondu d'entrée, on reprend l'écran tel quel
            root.style.transition = 'none';
            root.classList.add('on');
            ui.flash.style.opacity = '1';               // fondu depuis le flash chaud de la fin du chargement
            requestAnimationFrame(function () { ui.flash.style.transition = 'opacity .6s'; ui.flash.style.opacity = '0'; });
        } else {
            requestAnimationFrame(function () { root.classList.add('on'); });
        }
    }

    // ─── Animation : une nuit de neige, une route, une maison éclairée ───
    function startScene(getProgress, onArrived, handoff) {
        const cv = ui.cv;
        const ctx = cv.getContext('2d');
        let W = 320, H = 180, stars = [], flakes = [], smoke = [], mountains1 = [], mountains2 = [];
        let t0 = performance.now(), last = t0, raf = 0, arrived = !!handoff, doorOpen = handoff ? 1 : 0;
        let nextGlitch = 2 + Math.random() * 3, glitchUntil = 0;
        let shown = handoff ? 1 : 0;                // progression affichée (0..1), lissée et plafonnée

        function setup() {
            const aspect = Math.max(0.55, Math.min(2.4, innerWidth / Math.max(1, innerHeight)));
            H = 180; W = Math.round(Math.max(150, Math.min(420, H * aspect)));
            cv.width = W; cv.height = H;
            const R = prng(7);
            stars = []; for (let i = 0; i < 90; i++) stars.push({ x: R() * W, y: R() * H * 0.55, p: R() * 6.28, s: R() < 0.12 ? 2 : 1 });
            flakes = []; for (let i = 0; i < 140; i++) flakes.push({ x: R() * W, y: R() * H, v: 8 + R() * 22, d: R() * 6.28, s: R() < 0.2 ? 2 : 1 });
            const hor = Math.round(H * 0.5);
            mountains1 = []; mountains2 = [];
            for (let x = 0; x < W; x++) {
                mountains1.push(hor - 14 - Math.round(10 * Math.sin(x * 0.045 + 1) + 6 * Math.sin(x * 0.11 + 2) + 3 * Math.sin(x * 0.27)));
                mountains2.push(hor - 4 - Math.round(5 * Math.sin(x * 0.07 + 4) + 3 * Math.sin(x * 0.19 + 1)));
            }
        }
        setup();
        const onResize = function () { setup(); };
        addEventListener('resize', onResize);

        const px = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

        // chemin de la route : t = 0 (devant nous) .. 1 (porte de la maison)
        function roadAt(t) {
            const hor = Math.round(H * 0.5);
            const y = H + 4 - (H + 4 - (hor + 8)) * t;
            const houseX = W * 0.66;
            const bend = Math.sin(t * 5.2) * (1 - t) * W * 0.11;
            const cx = W * 0.3 + (houseX - W * 0.3) * Math.pow(t, 0.8) + bend;
            const w = 3 + (1 - t) * (W * 0.16);
            return { x: cx, y: y, w: w };
        }

        function frame(now) {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            const el = (now - t0) / 1000;
            const real = getProgress();
            // la progression affichée suit la vraie, mais pas trop vite (animation visible au moins MIN_SECONDS)
            const maxRate = 1 / MIN_SECONDS;
            shown = Math.min(real, shown + maxRate * dt * (0.6 + 0.8 * Math.sin(el * 1.3 + 1) * Math.sin(el * 1.3 + 1)));
            const p = shown;

            const hor = Math.round(H * 0.5);

            // ciel : bandes sombres tramées
            const bands = ['#02030a', '#040612', '#060a18', '#080e1f', '#0b1428', '#0e1a30'];
            for (let y = 0; y < hor; y++) {
                const k = y / hor * (bands.length - 1);
                const i = Math.floor(k), f = k - i;
                for (let x = 0; x < W; x += 2) {
                    const useNext = ((x >> 1) + y) % 2 === 0 ? f > 0.35 : f > 0.65;
                    px(x, y, 2, 1, bands[Math.min(bands.length - 1, i + (useNext ? 1 : 0))]);
                }
            }
            // étoiles
            stars.forEach(function (s) {
                const a = 0.35 + 0.65 * Math.abs(Math.sin(el * 1.4 + s.p));
                ctx.fillStyle = 'rgba(200,215,255,' + a.toFixed(2) + ')';
                ctx.fillRect(s.x | 0, s.y | 0, s.s, s.s);
            });
            // montagnes lointaines
            for (let x = 0; x < W; x++) {
                px(x, mountains1[x], 1, hor - mountains1[x], '#0a1322');
                px(x, mountains2[x], 1, hor - mountains2[x], '#070d19');
            }
            // sol enneigé (très sombre), tramé
            for (let y = hor; y < H; y++) {
                const k = (y - hor) / (H - hor);
                for (let x = 0; x < W; x += 2) {
                    const c = (((x >> 1) + y) % 2 === 0 && k > 0.5) ? '#101a2b' : '#0c1522';
                    px(x, y, 2, 1, c);
                }
            }
            // route (goudron bleuté)
            for (let y = hor + 8; y < H; y++) {
                const t = 1 - (y - (hor + 8)) / (H - (hor + 8));
                const r = roadAt(t);
                px(r.x - r.w / 2, y, r.w, 1, '#0b0f1a');
                px(r.x - r.w / 2, y, 1, 1, '#1a2336');
                px(r.x + r.w / 2 - 1, y, 1, 1, '#1a2336');
                if (y % 9 < 3 && t < 0.9) px(r.x, y, 1, 1, '#2a3550');
            }

            // maison
            const hx = Math.round(W * 0.66), hy = hor + 6, hw = 34, hh = 18;
            const warm = 0.75 + 0.25 * Math.sin(el * 7.3) * Math.sin(el * 2.1);
            // halo sur la neige
            const grd = ctx.createRadialGradient(hx, hy - 6, 2, hx, hy - 6, 60);
            grd.addColorStop(0, 'rgba(255,190,110,' + (0.32 * warm).toFixed(2) + ')');
            grd.addColorStop(1, 'rgba(255,190,110,0)');
            ctx.fillStyle = grd; ctx.fillRect(hx - 62, hy - 6 - 62, 124, 124);
            px(hx - hw / 2, hy - hh, hw, hh, '#1b1612');                          // murs
            px(hx - hw / 2 - 2, hy - hh - 3, hw + 4, 3, '#2a2724');               // bas du toit
            for (let i = 0; i < 8; i++) {                                         // toit en pignon, neige dessus
                const rw = hw + 4 - i * 4;
                if (rw <= 0) break;
                px(hx - rw / 2, hy - hh - 4 - i, rw, 1, i % 3 === 0 ? '#cbd3d9' : '#34302d');
            }
            px(hx - hw / 2 - 2, hy - hh - 4, hw + 4, 1, '#cbd3d9');
            px(hx - hw / 2 + 4, hy - hh - 12, 4, 8, '#2a2724');                   // cheminée
            // fenêtres chaudes
            const wc = 'rgb(' + (255 * warm | 0) + ',' + (176 * warm | 0) + ',' + (84 * warm | 0) + ')';
            px(hx - 12, hy - 13, 7, 6, wc); px(hx + 6, hy - 13, 7, 6, wc);
            px(hx - 9, hy - 13, 1, 6, '#1b1612'); px(hx + 9, hy - 13, 1, 6, '#1b1612');
            // porte
            const dw = 6, dh = 10;
            px(hx - dw / 2, hy - dh, dw, dh, '#2a1a10');
            if (arrived) {
                doorOpen = Math.min(1, doorOpen + dt * 1.6);
                px(hx - dw / 2, hy - dh, dw, dh, '#ffd48a');
                const spill = ctx.createLinearGradient(hx, hy, hx, H);
                spill.addColorStop(0, 'rgba(255,212,138,' + (0.55 * doorOpen).toFixed(2) + ')');
                spill.addColorStop(1, 'rgba(255,212,138,0)');
                ctx.fillStyle = spill;
                ctx.beginPath(); ctx.moveTo(hx - 3, hy); ctx.lineTo(hx + 3, hy); ctx.lineTo(hx + 26, H); ctx.lineTo(hx - 26, H); ctx.closePath(); ctx.fill();
            }
            // fumée de cheminée
            if (Math.random() < dt * 5) smoke.push({ x: hx - hw / 2 + 6, y: hy - hh - 13, a: 1, d: Math.random() * 6 });
            smoke = smoke.filter(function (s) { s.y -= dt * 9; s.x += Math.sin(s.y * 0.2 + s.d) * dt * 4 + dt * 3; s.a -= dt * 0.35; return s.a > 0; });
            smoke.forEach(function (s) { ctx.fillStyle = 'rgba(150,158,170,' + (s.a * 0.5).toFixed(2) + ')'; ctx.fillRect(s.x | 0, s.y | 0, 2, 2); });

            // le marcheur (vu de dos) avec sa lampe
            const tt = Math.min(1, p);
            const r = roadAt(tt);
            const sc = 0.45 + (1 - tt) * 0.9;
            const bob = Math.abs(Math.sin(el * 7)) * 1.2 * sc;
            const fx = r.x, fy = r.y - bob;
            const lr = 26 * sc + 10, lcx = fx + 4 * sc, lcy = fy - 6 * sc;
            const lg = ctx.createRadialGradient(lcx, lcy, 1, lcx, lcy, lr);
            lg.addColorStop(0, 'rgba(255,200,120,' + (0.55 * warm).toFixed(2) + ')');
            lg.addColorStop(1, 'rgba(255,200,120,0)');
            ctx.fillStyle = lg; ctx.fillRect(lcx - lr, lcy - lr, lr * 2, lr * 2);
            px(fx - 2 * sc, fy - 12 * sc, 5 * sc, 7 * sc, '#06070b');                   // corps
            px(fx - 1.5 * sc, fy - 16 * sc, 4 * sc, 4 * sc, '#06070b');                 // tête
            const step = Math.sin(el * 7) > 0 ? 1 : -1;
            px(fx - 2 * sc + (step > 0 ? 0 : 2 * sc), fy - 5 * sc, 2 * sc, 5 * sc, '#06070b');   // jambes
            px(fx + 2 * sc, fy - 9 * sc, 1.5 * sc, 5 * sc, '#06070b');                  // bras
            px(fx + 3 * sc, fy - 5 * sc, 2 * sc, 2 * sc, '#ffcf7a');                    // lampe

            // neige
            flakes.forEach(function (f) {
                f.y += f.v * dt; f.x += Math.sin(el * 0.8 + f.d) * 6 * dt + 2 * dt;
                if (f.y > H) { f.y = -2; f.x = Math.random() * W; }
                if (f.x > W) f.x = 0;
                ctx.fillStyle = f.s > 1 ? 'rgba(235,242,255,0.85)' : 'rgba(200,215,240,0.6)';
                ctx.fillRect(f.x | 0, f.y | 0, f.s, f.s);
            });

            // interface
            const pct = Math.floor(p * 100);
            ui.pct.textContent = pct + '%';
            const lit = Math.round(p * ui.cells.length);
            ui.cells.forEach(function (c, i) { c.className = i < lit ? (i === lit - 1 ? 'f h' : 'f') : ''; });

            // petits sursauts de glitch sur le titre
            if (el > nextGlitch) { ui.title.classList.add('glitch'); glitchUntil = el + 0.12; nextGlitch = el + 2.5 + Math.random() * 4; }
            if (el > glitchUntil) ui.title.classList.remove('glitch');

            // arrivée à la maison
            if (!handoff && !arrived && p >= 0.999) {
                arrived = true;
                setTimeout(function () {
                    ui.flash.style.transition = 'opacity .7s';
                    ui.flash.style.opacity = '1';
                    setTimeout(onArrived, 750);
                }, 900);
            }
        }
        raf = requestAnimationFrame(frame);

        return function stop() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
    }

    // ─── Liste automatique des fichiers ─────────────────────────────
    const urlOf = function (rel) { return new URL(rel.split('/').map(encodeURIComponent).join('/'), ROOT).href; };
    const relOf = function (u) { return decodeURIComponent(u.pathname.slice(ROOT_PATH.length)); };
    const cleanRel = function (r) { return String(r).replace(/^\.?\//, '').replace(/\\/g, '/').split('?')[0].split('#')[0]; };

    async function fromPhp() {
        try {
            const r = await fetch(urlOf(LIST_PHP) + '?v=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return null;
            const j = JSON.parse(await r.text());
            const arr = Array.isArray(j) ? j : (j.files || []);
            const out = arr.map(function (f) { return typeof f === 'string' ? { p: f, s: 0 } : { p: f.path, s: Number(f.size) || 0 }; })
                .filter(function (f) { return f.p && !SKIP.test(f.p); });
            return out.length ? out : null;
        } catch (e) { return null; }
    }

    async function fromManifest() {
        try {
            const r = await fetch(urlOf(MANIFEST) + '?v=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return [];
            const j = JSON.parse(await r.text());
            return (Array.isArray(j) ? j : (j.files || [])).map(function (f) { return typeof f === 'string' ? f : f.path; }).filter(Boolean);
        } catch (e) { return []; }
    }

    // Lecture d'un dossier via l'index du serveur (Apache). Renvoie false si le serveur n'en donne pas.
    async function readDir(relDir, add, addDir) {
        const url = relDir ? urlOf(relDir.replace(/\/?$/, '/')) : ROOT;
        let txt;
        try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return false; txt = await r.text(); } catch (e) { return false; }
        if (!/Index of|Directory listing|Parent Directory/i.test(txt)) return false;
        const re = /href="([^"#?]+)"/gi; let m;
        const self = new URL(url).pathname;
        while ((m = re.exec(txt))) {
            let u; try { u = new URL(m[1], url); } catch (e) { continue; }
            if (u.origin !== location.origin || !u.pathname.startsWith(ROOT_PATH)) continue;
            if (u.pathname === self || self.startsWith(u.pathname)) continue;      // lui-même / dossier parent
            const rel = relOf(u);
            if (rel.endsWith('/')) addDir(rel); else add(rel);
        }
        return true;
    }

    // Sans assets.php : on lit les imports et les chemins écrits dans les .js / .html, et les dossiers qu'ils citent.
    async function scan(onFound) {
        const files = new Map(), dirs = new Set(), fetched = new Set();
        const qText = [], qDir = [];
        function add(rel) {
            rel = cleanRel(rel);
            if (!rel || rel.indexOf('..') >= 0 || /^[a-z]+:/i.test(rel) || SKIP.test(rel) || files.has(rel)) return;
            files.set(rel, 0);
            const k = rel.lastIndexOf('/');
            if (k > 0) addDir(rel.slice(0, k + 1));            // les fichiers voisins (book01.json -> book02.json...)
            if (TEXT.test(rel)) qText.push(rel);
            onFound(files.size);
        }
        function addDir(rel) {
            rel = cleanRel(rel);
            if (!rel || rel.indexOf('..') >= 0 || /^[a-z]+:/i.test(rel) || SKIP.test(rel) || dirs.has(rel)) return;
            dirs.add(rel); qDir.push(rel);
        }
        FALLBACK.forEach(add);
        (await fromManifest()).forEach(add);
        const here = relOf(new URL(location.href));
        if (here && !here.endsWith('/')) add(here);
        addDir('');

        const litFile = new RegExp('[\'"`]([\\w\\-./ %]+\\.(?:' + EXT + '))[\'"`]', 'gi');
        const litDir = /['"`]([A-Za-z0-9_\-][A-Za-z0-9_\-./]*\/)['"`]/g;
        const imp = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

        async function doText(rel) {
            let txt;
            try {
                const r = await fetch(urlOf(rel), { cache: 'no-cache' });
                if (!r.ok) return;
                txt = await r.text();
                fetched.add(rel);
            } catch (e) { return; }
            const dir = rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
            let m;
            imp.lastIndex = 0; while ((m = imp.exec(txt))) { const u = new URL(m[1], ROOT + dir); add(relOf(u)); }
            litFile.lastIndex = 0; while ((m = litFile.exec(txt))) add(m[1]);
            litDir.lastIndex = 0; while ((m = litDir.exec(txt))) addDir(m[1]);
        }

        while (qText.length || qDir.length) {
            const batch = [];
            while (batch.length < CONCURRENCY && (qText.length || qDir.length)) {
                if (qText.length) { const r = qText.shift(); batch.push(doText(r)); }
                else { const d = qDir.shift(); batch.push(readDir(d, add, addDir)); }
            }
            await Promise.all(batch);
        }
        return Array.from(files.keys()).map(function (p) { return { p: p, s: 0, done: fetched.has(p) }; });
    }

    // ─── Téléchargement de tout (dans le cache du navigateur) ───────
    function preload(files, onFrac) {
        let next = 0;
        const weight = function (f) { return f.s > 0 ? f.s : (BIG.test(f.p) ? 400000 : 20000); };
        const totalW = files.reduce(function (a, f) { return a + weight(f); }, 0) || 1;
        let doneW = 0;

        async function one(f) {
            let seen = 0;
            const w = weight(f);
            if (!f.done) {
                try {
                    // « no-cache » = on vérifie auprès du serveur (réponse 304 instantanée si rien n'a changé) :
                    // le cache contient toujours la dernière version de chaque fichier.
                    const r = await fetch(urlOf(f.p), { cache: 'no-cache' });
                    if (r.ok && r.body && r.body.getReader) {
                        const rd = r.body.getReader();
                        const total = Number(r.headers.get('content-length')) || 0;
                        for (;;) {
                            const c = await rd.read();
                            if (c.done) break;
                            seen += c.value.length;
                            if (total > 0) onFrac((doneW + w * Math.min(1, seen / total)) / totalW);
                        }
                    } else if (r.ok) {
                        await r.arrayBuffer();
                    }
                } catch (e) { /* un fichier manquant ne bloque jamais le chargement */ }
            }
            doneW += w;
            onFrac(doneW / totalW);
        }
        async function worker() { while (next < files.length) { await one(files[next++]); } }
        const ws = [];
        for (let i = 0; i < Math.min(CONCURRENCY, files.length); i++) ws.push(worker());
        return Promise.all(ws);
    }

    // ─── Dans le jeu : l'écran reste jusqu'à ce que tout soit prêt ──
    function startHandoff() {
        buildUi(true);
        const t0 = performance.now();
        const holds = { page: 1 };
        let released = false, lastEvent = t0, loaded = document.readyState === 'complete', smooth = 0, lastFrame = t0;
        const stop = startScene(function () { return 1; }, null, true);

        BT.active = function () { return !released; };
        BT.hold = function (n) { if (!released) { holds[n] = 1; lastEvent = performance.now(); } };
        BT.release = function (n) { delete holds[n]; lastEvent = performance.now(); };
        addEventListener('load', function () { loaded = true; lastEvent = performance.now(); });

        function finish() {
            if (released) return;
            released = true;
            ui.root.style.transition = 'opacity .6s';
            ui.root.style.opacity = '0';
            setTimeout(function () { stop(); ui.root.remove(); ui = null; }, 700);
        }
        (function watch(now) {
            if (released) return;
            smooth = (now - lastFrame) < SMOOTH_MS ? smooth + 1 : 0;
            lastFrame = now;
            const quiet = Object.keys(holds).filter(function (k) { return k !== 'page'; }).length === 0;
            if (loaded && quiet && smooth >= SMOOTH_FRAMES && now - lastEvent >= HANDOFF_SETTLE && now - t0 >= HANDOFF_MIN * 1000) {
                delete holds.page;
                finish();
                return;
            }
            requestAnimationFrame(watch);
        })(t0);
        setTimeout(finish, HANDOFF_TIMEOUT);
    }

    // ─── Point d'entrée (menu) ──────────────────────────────────────
    window.BTGo = function (url) {
        if (running) return;
        running = true;
        buildUi(false);
        let real = 0, finished = false, errored = false;
        const stop = startScene(function () { return finished ? 1 : real * 0.985; }, function () {
            stop();
            try { sessionStorage.setItem(HANDOFF_KEY, String(Date.now())); } catch (e) { /* tant pis */ }
            window.location.href = url;
        });
        (async function () {
            let files = await fromPhp();
            if (!files) {
                files = await scan(function (n) { real = Math.max(real, Math.min(0.1, n / 1500)); });
            }
            const base = real;
            await preload(files, function (v) { real = Math.max(real, base + (1 - base) * v); });
        })().catch(function () { /* on continue quand même */ }).then(function () {
            real = 1; finished = true;
        });
    };

    // Arrivée dans le jeu juste après BTGo : on garde l'écran de chargement
    try {
        const t = Number(sessionStorage.getItem(HANDOFF_KEY));
        if (t && Date.now() - t < HANDOFF_MAX_AGE && !document.getElementById('bt-load') && !/[?&]noload\b/.test(location.search)) startHandoff();
    } catch (e) { /* sessionStorage indisponible */ }

    // retour arrière : on ne garde pas l'écran de chargement
    addEventListener('pageshow', function (e) {
        if (e.persisted) {
            const el = document.getElementById('bt-load');
            if (el) el.remove();
            running = false;
            ui = null;
        }
    });
})();
