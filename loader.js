// loader.js – écran de chargement « pixel » après PLAY + préchargement de TOUS les fichiers du site.
//
// À charger dans index.html (script normal, avant le code du menu) :  <script src="loader.js"></script>
// Il crée window.BTGo(url) : affiche l'écran de chargement, télécharge tout le site dans le cache du navigateur
// (pour que le jeu ne charge plus rien en cours de route : fini les saccades quand on sort dehors),
// puis ouvre `url`. Aucun nom de fichier n'est jamais affiché.
//
// La liste des fichiers vient de assets-manifest.json (créé par make-manifest.ps1, à relancer quand tu ajoutes
// des fichiers). Sans ce fichier, seuls les fichiers de la liste de secours ci-dessous sont préchargés.

(function () {
    'use strict';

    const MANIFEST = 'assets-manifest.json';
    const CONCURRENCY = 6;
    const MIN_SECONDS = 3.2;          // durée minimale de l'animation, même si tout est déjà en cache
    const FALLBACK = [
        'world_base.html', 'immeuble.js', 'bedroom.js', 'corridor.js', 'elevator.js', 'rdc.js', 'forest.js', 'work.js',
        'vehicle.js', 'worker.js', 'nightstand.js', 'journal.js', 'bookreader.js', 'phone.js', 'phone-item.js',
        'avatar-loader.js', 'audio-manager.js', 'save-data.js', 'therapist-ai.js', 'therapist-config.js',
        'therapist-memory.js', 'evelyn-brain.js', 'evelyn-life.js', 'evelyn-phone.js'
    ];

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
    function buildUi() {
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
        document.head.appendChild(css);

        const root = document.createElement('div');
        root.id = 'bt-load';
        root.innerHTML = '<canvas></canvas><div class="vig"></div><div class="scan"></div>' +
            '<div class="title">BAD THERAPIST</div>' +
            '<div class="bottom"><div class="bar"></div><div class="pct">0%</div></div>' +
            '<div class="flash"></div>';
        document.body.appendChild(root);

        const bar = root.querySelector('.bar');
        const cells = [];
        for (let i = 0; i < 24; i++) { const c = document.createElement('i'); bar.appendChild(c); cells.push(c); }

        ui = {
            root: root, cv: root.querySelector('canvas'), title: root.querySelector('.title'),
            pct: root.querySelector('.pct'), cells: cells, flash: root.querySelector('.flash')
        };
        requestAnimationFrame(function () { root.classList.add('on'); });
    }

    // ─── Animation : une nuit de neige, une route, une maison éclairée ───
    function startScene(getProgress, onArrived) {
        const cv = ui.cv;
        const ctx = cv.getContext('2d');
        let W = 320, H = 180, stars = [], flakes = [], smoke = [], mountains1 = [], mountains2 = [];
        let t0 = performance.now(), last = t0, raf = 0, arrived = false, doorOpen = 0;
        let nextGlitch = 2 + Math.random() * 3, glitchUntil = 0;
        let shown = 0;                              // progression affichée (0..1), lissée et plafonnée

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
            if (!arrived && p >= 0.999) {
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

    // ─── Préchargement de tous les fichiers ─────────────────────────
    async function listFiles() {
        try {
            const r = await fetch(MANIFEST + '?v=' + Date.now(), { cache: 'no-store' });
            if (r.ok) {
                const j = await r.json();
                const arr = Array.isArray(j) ? j : (j.files || []);
                const out = arr.map(function (f) {
                    return typeof f === 'string' ? { p: f, s: 0 } : { p: f.path, s: Number(f.size) || 0 };
                }).filter(function (f) { return f.p && f.p !== MANIFEST; });
                if (out.length) return out;
            }
        } catch (e) { /* liste de secours */ }
        return FALLBACK.map(function (p) { return { p: p, s: 0 }; });
    }

    function preload(files, onBytes) {
        let next = 0;
        const total = files.length;
        const weighted = files.every(function (f) { return f.s > 0; });
        let doneBytes = 0, totalBytes = files.reduce(function (a, f) { return a + (f.s || 0); }, 0), doneCount = 0;

        function report() {
            onBytes(weighted && totalBytes > 0 ? Math.min(1, doneBytes / totalBytes) : doneCount / total);
        }

        async function one(f) {
            const url = f.p.split('/').map(encodeURIComponent).join('/');
            let seen = 0;
            try {
                const r = await fetch(url, { cache: 'force-cache' });
                if (r.ok && r.body && r.body.getReader) {
                    const rd = r.body.getReader();
                    for (;;) {
                        const c = await rd.read();
                        if (c.done) break;
                        seen += c.value.length;
                        if (weighted) { doneBytes += c.value.length; report(); }
                    }
                } else if (r.ok) {
                    await r.arrayBuffer();
                }
            } catch (e) { /* un fichier manquant ne bloque jamais le chargement */ }
            if (weighted && f.s > seen) doneBytes += f.s - seen;
            doneCount++;
            report();
        }

        async function worker() {
            while (next < total) { await one(files[next++]); }
        }
        const ws = [];
        for (let i = 0; i < Math.min(CONCURRENCY, total); i++) ws.push(worker());
        return Promise.all(ws);
    }

    // ─── Point d'entrée ─────────────────────────────────────────────
    window.BTGo = function (url) {
        if (running) return;
        running = true;
        buildUi();
        let real = 0, finished = false;
        const stop = startScene(function () { return finished ? 1 : real * 0.985; }, function () {
            stop();
            window.location.href = url;
        });
        listFiles().then(function (files) {
            return preload(files, function (v) { real = v; });
        }).catch(function () { /* on continue quand même */ }).then(function () {
            real = 1; finished = true;
        });
    };

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
