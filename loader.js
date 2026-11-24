// loader.js – ILLUSION : écran de chargement vintage (gris, pixel, disquette) + préchargement automatique.
//
// À charger dans index.html ET en tout premier dans le <head> de la page du jeu :
//     <script src="loader.js"></script>
//
// 1) Menu : window.BTGo(url) affiche l'écran, télécharge les fichiers du site dans le cache du navigateur,
//    puis ouvre `url`.
// 2) Jeu : l'écran reste affiché (sans coupure) tant que le jeu prépare ses éléments, puis disparaît seul.
//    Les modules peuvent y participer : window.BTLoad.hold('nom') / window.BTLoad.release('nom').
//
// Liste des fichiers (dans l'ordre) :
//   a) assets.php          : tous les fichiers de tous les dossiers et sous-dossiers (XAMPP / PHP) ;
//   b) assets-manifest.json: copie de la liste écrite par assets.php (à commiter : marche sur GitHub Pages, sans PHP) ;
//   c) analyse des imports / chemins écrits dans les .js/.html, en dernier recours.
//
// Réglages rapides :
const SKIP_AVATARS = false;   // false = les avatars sont préchargés PENDANT l'écran de chargement, jamais après. true = AUCUN avatar (requêtes vers avatars/ bloquées)
const AVATARS_ON = ['evelyn'];   // dossiers de avatars/ chargés pour l'instant. Pour en ajouter un plus tard : écris son nom ici, ex. ['evelyn', 'oliver', 'pluie'] (leon, lou, nahara, veri, violet existent aussi)
const SKIP_VIDEOS  = true;    // true = on ne précharge pas les vidéos (la télé précharge elle-même la suivante)
//
// Diagnostic : ?perf à la fin de l'adresse (ou touche F3) = FPS ; la console affiche les blocages > 120 ms.

(function () {
    'use strict';

    const LIST_PHP = 'assets.php';
    const MANIFEST = 'assets-manifest.json';
    const CONCURRENCY = 6;
    const MIN_SECONDS = 3.2;          // durée minimale de l'animation, même si tout est déjà en cache
    const HANDOFF_KEY = 'bt-handoff';
    const HANDOFF_MAX_AGE = 120000;
    const HANDOFF_MIN = 1.0;
    const HANDOFF_SETTLE = 3000;
    const HANDOFF_TIMEOUT = 120000;   // les avatars (FBX + animations) sont lourds : l'écran ne doit jamais partir avant eux
    const SMOOTH_FRAMES = 30, SMOOTH_MS = 40;
    const FALLBACK = ['index.html', 'world_base.html', 'bedroom.js'];
    const SKIP = /(^|\/)(\.git|node_modules|\.vscode|\.idea|backups?|saves?)(\/|$)|\.(php|ps1|bat|md|psd|blend1?|zip|rar|7z|bak|log|tmp|map|sh|sql|ini)$/i;
    const AVATARS = /(^|\/)avatars?\//i;
    const VIDEOS = /(^|\/)videos\/|\.(mp4|webm)$/i;
    const BIG = /\.(fbx|glb|gltf|png|jpe?g|webp|mp3|ogg|wav|m4a|mp4|webm|hdr|exr)$/i;
    const TEXT = /\.(js|mjs|html?|css)$/i;
    const EXT = 'js|mjs|json|png|jpe?g|webp|gif|fbx|glb|gltf|mp3|ogg|wav|m4a|woff2?|ttf|css|html?|svg|txt|mp4|webm';

    // un fichier de avatars/ est refusé si les avatars sont coupés, ou si son dossier n'est pas dans AVATARS_ON (avatars/_shared reste toujours chargé)
    const avatarOff = function (p) {
        if (!AVATARS.test(p)) return false;
        if (SKIP_AVATARS) return true;
        const m = /(?:^|\/)avatars?\/([^\/]+)/i.exec(p);
        if (!m) return false;                       // le dossier avatars/ lui-même : on le parcourt
        const name = m[1].toLowerCase();
        return name !== '_shared' && AVATARS_ON.indexOf(name) < 0;
    };
    const skipped = function (p) {
        p = String(p);
        return SKIP.test(p) || avatarOff(p) || (SKIP_VIDEOS && VIDEOS.test(p));
    };

    const ROOT = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href;
    const ROOT_PATH = new URL(ROOT).pathname;

    // ─── API pour le jeu : window.BTLoad ────────────────────────────
    const BT = window.BTLoad = {
        skipAvatars: SKIP_AVATARS,     // le code qui charge les avatars peut tester ce drapeau
        active: function () { return false; },
        hold: function () { },
        release: function () { }
    };

    // ─── Avatars désactivés : toute requête vers avatars/ est refusée tout de suite (404 local, rien n'est téléchargé
    //     ni analysé). Pour les réactiver : SKIP_AVATARS = false en haut du fichier, ou ouvrir le jeu avec ?avatars ───
    console.log('[ILLUSION] loader.js chargé' + (SKIP_AVATARS ? ' (avatars bloqués)' : ''));
    // Seuls les avatars de AVATARS_ON sont chargés (le jeu entier : avatar-body.js demande tous les corps, mais ceux qui ne sont pas
    // dans la liste reçoivent un avatar vide, sans aucune requête réseau). ?avatars dans l'adresse = tous les avatars.
    const BLOCK_AVATARS = !/[?&]avatars\b/.test(location.search);
    BT.skipAvatars = SKIP_AVATARS && BLOCK_AVATARS;                                   // true = aucun avatar
    BT.avatarOff = function (p) { return BLOCK_AVATARS && avatarOff(String(p || '')); };   // true = cet avatar-là n'est pas chargé pour l'instant
    if (BLOCK_AVATARS) {
        const isAvatar = function (u) {
            try {
                const s = decodeURIComponent(String(u));
                return /(^|\/)avatars\/[^?#]+\.(fbx|glb|gltf|png|jpe?g|webp)/i.test(s) && avatarOff(s.split('?')[0]);
            } catch (e) { return false; }
        };
        const realFetch = window.fetch;
        window.fetch = function (input) {
            const u = typeof input === 'string' ? input : (input && input.url) || '';
            if (isAvatar(u)) return Promise.resolve(new Response('', { status: 404, statusText: 'avatars disabled' }));
            return realFetch.apply(this, arguments);
        };
        const realOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            if (isAvatar(url)) { arguments[1] = 'data:text/plain,'; }
            return realOpen.apply(this, arguments);
        };
        console.log('[ILLUSION] avatars désactivés (SKIP_AVATARS)');
    }

    // ─── Diagnostic ─────────────────────────────────────────────────
    try {
        new PerformanceObserver(function (l) {
            l.getEntries().forEach(function (e) {
                if (e.duration > 120) console.log('[ILLUSION] blocage de ' + Math.round(e.duration) + ' ms (à ' + (e.startTime / 1000).toFixed(1) + ' s)');
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

    // Nom du jeu dans l'onglet du navigateur, sur toutes les pages qui chargent loader.js
    (function () {
        const NAME = 'Illusion';
        function fix() { if (document.title !== NAME) document.title = NAME; }
        fix();
        document.addEventListener('DOMContentLoaded', function () {
            fix();
            const el = document.querySelector('title');
            if (el) new MutationObserver(fix).observe(el, { childList: true, characterData: true, subtree: true });
        });
    })();

    let running = false;
    let ui = null;

    function prng(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // ─── Interface : épurée, même ambiance grise que le menu ───
    function buildUi(instant) {
        if (!document.querySelector('link[href*="Press+Start+2P"]')) {
            const f = document.createElement('link');
            f.rel = 'stylesheet';
            f.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap';
            (document.head || document.documentElement).appendChild(f);
        }
        const css = document.createElement('style');
        css.textContent = `
#bt-load{position:fixed;inset:0;z-index:99999;overflow:hidden;color:#ededed;font-family:'Press Start 2P',monospace;
  background:radial-gradient(ellipse at center,#292929 0%,#171717 48%,#090909 100%);opacity:0;transition:opacity .5s}
#bt-load.on{opacity:1}
#bt-load .grid{position:absolute;inset:0;opacity:.18;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:32px 32px}
#bt-load .scan{position:absolute;inset:0;pointer-events:none;opacity:.12;
  background:repeating-linear-gradient(to bottom,transparent 0,transparent 2px,rgba(0,0,0,.65) 3px,rgba(0,0,0,.65) 4px)}
#bt-load .frame{position:absolute;inset:15px;border:1px solid rgba(255,255,255,.13);pointer-events:none}
#bt-load .frame::before,#bt-load .frame::after{content:"";position:absolute;width:13px;height:13px;border:0 solid #aaa}
#bt-load .frame::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
#bt-load .frame::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
#bt-load .center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,80vw);text-align:center}
#bt-load .title{font-size:clamp(26px,6.4vw,54px);letter-spacing:.06em;line-height:1.4;margin-bottom:46px;
  text-shadow:3px 3px 0 #555,6px 6px 0 rgba(0,0,0,.8)}
#bt-load .title.glitch{text-shadow:-3px 0 #aaa,3px 0 #fff,6px 6px 0 rgba(0,0,0,.8);transform:translate(2px,-1px) skewX(-6deg)}
#bt-load .track{height:4px;background:#2a2a2a;box-shadow:0 5px 0 #151515,0 -5px 0 #151515}
#bt-load .fill{height:100%;width:0;background:#cfcfcf;box-shadow:0 0 10px rgba(255,255,255,.35)}
#bt-load .pct{margin-top:26px;font-family:'VT323',monospace;font-size:clamp(20px,3.6vw,26px);letter-spacing:.3em;color:#858585}
#bt-load .flash{position:absolute;inset:0;background:#ededed;opacity:0;pointer-events:none}`;
        (document.head || document.documentElement).appendChild(css);

        const root = document.createElement('div');
        root.id = 'bt-load';
        root.innerHTML = '<div class="grid"></div><div class="scan"></div><div class="frame"></div>' +
            '<div class="center"><div class="title">ILLUSION</div>' +
            '<div class="track"><div class="fill"></div></div><div class="pct">0%</div></div>' +
            '<div class="flash"></div>';
        document.documentElement.appendChild(root);

        ui = {
            root: root, title: root.querySelector('.title'), fill: root.querySelector('.fill'),
            pct: root.querySelector('.pct'), flash: root.querySelector('.flash')
        };
        if (instant) {
            root.style.transition = 'none';
            root.classList.add('on');
            ui.flash.style.opacity = '1';
            requestAnimationFrame(function () { ui.flash.style.transition = 'opacity .6s'; ui.flash.style.opacity = '0'; });
        } else {
            requestAnimationFrame(function () { root.classList.add('on'); });
        }
    }

    // ─── Progression lissée (aucun dessin : juste la barre, le pourcentage, un petit glitch du titre) ───
    function startScene(getProgress, onArrived, handoff) {
        let t0 = performance.now(), last = t0, raf = 0, arrived = !!handoff;
        let nextGlitch = 2 + Math.random() * 3, glitchUntil = 0;
        let shown = handoff ? 1 : 0;
        let lastPct = -1;

        function frame(now) {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            const el = (now - t0) / 1000;
            const real = getProgress();
            shown = Math.min(real, shown + (1 / MIN_SECONDS) * dt * (0.6 + 0.8 * Math.sin(el * 1.3 + 1) * Math.sin(el * 1.3 + 1)));
            const p = shown;

            ui.fill.style.width = (p * 100).toFixed(1) + '%';
            const pct = Math.floor(p * 100);
            if (pct !== lastPct) { ui.pct.textContent = pct + '%'; lastPct = pct; }

            if (el > nextGlitch) { ui.title.classList.add('glitch'); glitchUntil = el + 0.12; nextGlitch = el + 2.5 + Math.random() * 4; }
            if (el > glitchUntil) ui.title.classList.remove('glitch');

            if (!handoff && !arrived && p >= 0.999) {
                arrived = true;
                setTimeout(function () {
                    ui.flash.style.transition = 'opacity .6s';
                    ui.flash.style.opacity = '1';
                    setTimeout(onArrived, 650);
                }, 500);
            }
        }
        raf = requestAnimationFrame(frame);
        return function stop() { cancelAnimationFrame(raf); };
    }

    // ─── Liste automatique des fichiers ─────────────────────────────
    const urlOf = function (rel) { return new URL(rel.split('/').map(encodeURIComponent).join('/'), ROOT).href; };
    const relOf = function (u) { return decodeURIComponent(u.pathname.slice(ROOT_PATH.length)); };
    const cleanRel = function (r) { return String(r).replace(/^\.?\//, '').replace(/\\/g, '/').split('?')[0].split('#')[0]; };

    // assets.php et assets-manifest.json ont le même format : { files: [ { path, size } ] }
    async function fromList(name) {
        try {
            const r = await fetch(urlOf(name) + '?v=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return null;
            const j = JSON.parse(await r.text());
            const arr = Array.isArray(j) ? j : (j.files || []);
            const out = arr.map(function (f) { return typeof f === 'string' ? { p: f, s: 0 } : { p: f.path, s: Number(f.size) || 0 }; })
                .filter(function (f) { return f.p && !skipped(f.p); });
            return out.length ? out : null;
        } catch (e) { return null; }
    }

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
            if (u.pathname === self || self.startsWith(u.pathname)) continue;
            const rel = relOf(u);
            if (rel.endsWith('/')) addDir(rel); else add(rel);
        }
        return true;
    }

    async function scan(onFound) {
        const files = new Map(), dirs = new Set(), fetched = new Set();
        const qText = [], qDir = [];
        function add(rel) {
            rel = cleanRel(rel);
            if (!rel || rel.indexOf('..') >= 0 || /^[a-z]+:/i.test(rel) || skipped(rel) || files.has(rel)) return;
            files.set(rel, 0);
            const k = rel.lastIndexOf('/');
            if (k > 0) addDir(rel.slice(0, k + 1));
            if (TEXT.test(rel)) qText.push(rel);
            onFound(files.size);
        }
        function addDir(rel) {
            rel = cleanRel(rel);
            if (!rel || rel.indexOf('..') >= 0 || /^[a-z]+:/i.test(rel) || skipped(rel) || dirs.has(rel)) return;
            dirs.add(rel); qDir.push(rel);
        }
        FALLBACK.forEach(add);
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
        BT.hold = function (n) { if (!released) { holds[n] = (holds[n] || 0) + 1; lastEvent = performance.now(); } };
        BT.release = function (n) { if (holds[n] > 1) holds[n]--; else delete holds[n]; lastEvent = performance.now(); };
        addEventListener('load', function () { loaded = true; lastEvent = performance.now(); });
        try {
            new PerformanceObserver(function () { if (!released) lastEvent = performance.now(); }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* navigateur sans resource timing */ }

        function finish() {
            if (released) return;
            released = true;
            console.log('[ILLUSION] écran de chargement retiré après ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
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
        let real = 0, finished = false;
        const stop = startScene(function () { return finished ? 1 : real * 0.985; }, function () {
            stop();
            try { sessionStorage.setItem(HANDOFF_KEY, String(Date.now())); } catch (e) { /* tant pis */ }
            window.location.href = url;
        });
        (async function () {
            // 1) assets.php (XAMPP)  2) assets-manifest.json (GitHub, sans PHP)  3) analyse du code
            let files = await fromList(LIST_PHP);
            if (!files) files = await fromList(MANIFEST);
            if (!files) files = await scan(function (n) { real = Math.max(real, Math.min(0.1, n / 1500)); });
            const base = real;
            await preload(files, function (v) { real = Math.max(real, base + (1 - base) * v); });
        })().catch(function () { /* on continue quand même */ }).then(function () {
            real = 1; finished = true;
        });
    };

    // Arrivée dans le jeu juste après BTGo : on garde l'écran de chargement
    try {
        const t = Number(sessionStorage.getItem(HANDOFF_KEY));
        const fresh = t && Date.now() - t < HANDOFF_MAX_AGE;
        const isGame = /[?&]launch\b/.test(location.search);
        if ((fresh || isGame) && !document.getElementById('bt-load') && !/[?&]noload\b/.test(location.search)) startHandoff();
    } catch (e) { /* sessionStorage indisponible */ }

    addEventListener('pageshow', function (e) {
        if (e.persisted) {
            const el = document.getElementById('bt-load');
            if (el) el.remove();
            running = false;
            ui = null;
        }
    });
})();
