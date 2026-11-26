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
const PRELOAD = false;        // false = le loader ne télécharge RIEN : il affiche l'écran, c'est le jeu qui charge ce dont il a besoin. true = ancien comportement (tout télécharger depuis le menu)
const LOADER_MUSIC = 'audio/loader.mp3';   // musique jouée PENDANT l'écran de chargement du jeu ('' = aucune). Même volume / sourdine que le reste du jeu
const SILENCE_WORLD = true;   // true = aucun autre son (télé, PNJ, ambiance...) ne démarre tant que l'écran de chargement est là ; ils démarrent à sa disparition
//
// Diagnostic : ?perf à la fin de l'adresse (ou touche F3) = FPS. La console n'écrit que ce qui va mal : fichier manquant,
// ou la RAISON pour laquelle l'écran de chargement reste affiché.

(function () {
    'use strict';

    const LIST_PHP = 'assets.php';
    const MANIFEST = 'assets-manifest.json';
    const CONCURRENCY = 6;
    const MIN_SECONDS = 1.6;          // durée minimale de l'animation du menu
    const HANDOFF_KEY = 'bt-handoff';
    const HANDOFF_MAX_AGE = 120000;
    const HANDOFF_MIN = 1.0;
    const HANDOFF_SETTLE = 1200;        // calme (aucun fichier, aucun hold) avant de retirer l'écran
    const FLUID_GIVEUP = 4000;        // si le jeu reste lent, on retire l'écran quand même après ce calme (ms)
    const HANDOFF_TIMEOUT = 40000;    // sécurité : l'écran part de force après 40 s
    const SMOOTH_FRAMES = 20, SMOOTH_MS = 50;   // 20 images d'affilée à plus de 20 images/s
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
        release: function () { },
        whenReady: function (fn) { fn(); }     // window.BTLoad.whenReady(function(){ ...lancer un son... }) : exécuté à la fin du chargement
    };

    // ─── Avatars désactivés : toute requête vers avatars/ est refusée tout de suite (404 local, rien n'est téléchargé
    //     ni analysé). Pour les réactiver : SKIP_AVATARS = false en haut du fichier, ou ouvrir le jeu avec ?avatars ───
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
    }

    // ─── Diagnostic ─────────────────────────────────────────────────
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

    // ─── Interface : même ambiance grise / pixel / vieil écran, mais le titre « se met au point » avec le chargement ───
    // ILLUSION commence en gros blocs flous et parasités, et devient net en même temps que le chargement avance.
    // Dessous : une rangée de cases (comme les têtes d'un lecteur de disquette) et un petit message sur ce qui se passe.
    const TW = 420, TH = 96, CELLS = 24;

    function makeTitle(canvas) {
        const src = document.createElement('canvas'), small = document.createElement('canvas');
        src.width = TW; src.height = TH; canvas.width = TW; canvas.height = TH;
        const sx = src.getContext('2d'), smx = small.getContext('2d'), cx = canvas.getContext('2d');
        function paint() {
            sx.clearRect(0, 0, TW, TH);
            sx.font = "44px 'Press Start 2P', monospace"; sx.textAlign = 'center'; sx.textBaseline = 'middle';
            const t = 'ILLUSION', x = TW / 2 - 4, y = TH / 2 - 4;
            sx.fillStyle = 'rgba(0,0,0,.8)'; sx.fillText(t, x + 6, y + 6);
            sx.fillStyle = '#555'; sx.fillText(t, x + 3, y + 3);
            sx.fillStyle = '#ededed'; sx.fillText(t, x, y);
        }
        paint();
        try { if (document.fonts && document.fonts.load) document.fonts.load("44px 'Press Start 2P'").then(paint, function () { }); } catch (e) { /* tant pis */ }
        return function draw(p) {
            const q = Math.max(0, Math.min(1, p));
            const bl = q >= 0.995 ? 1 : Math.max(1, Math.round(40 * Math.pow(1 - q, 1.7)));     // taille des blocs : 40 px -> 1 px
            const w = Math.ceil(TW / bl), h = Math.ceil(TH / bl);
            small.width = w; small.height = h;
            smx.imageSmoothingEnabled = true; smx.drawImage(src, 0, 0, w, h);
            cx.clearRect(0, 0, TW, TH);
            cx.imageSmoothingEnabled = false;
            cx.drawImage(small, 0, 0, w, h, 0, 0, w * bl, h * bl);
            const bad = 1 - q;
            // bandes décalées (le signal saute), plus fréquentes quand l'image est floue
            if (bad > 0.01 && Math.random() < 0.05 + bad * 0.3) {
                const hb = 3 + Math.floor(Math.random() * 12), y = Math.floor(Math.random() * (TH - hb)), dx = Math.round((Math.random() - 0.5) * (8 + bad * 40));
                cx.drawImage(canvas, 0, y, TW, hb, dx, y, TW, hb);
            }
            // neige
            const n = Math.floor(bad * bad * 320);
            for (let i = 0; i < n; i++) {
                const g = 90 + Math.floor(Math.random() * 150);
                cx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',' + (0.25 + Math.random() * 0.5).toFixed(2) + ')';
                cx.fillRect(Math.floor(Math.random() * TW), Math.floor(Math.random() * TH), 2 + Math.floor(Math.random() * 3), 2);
            }
        };
    }

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
#bt-load .roll{position:absolute;left:0;right:0;height:16%;top:-20%;pointer-events:none;
  background:linear-gradient(to bottom,transparent,rgba(255,255,255,.04),transparent);animation:btroll 7s linear infinite}
@keyframes btroll{to{top:110%}}
#bt-load .frame{position:absolute;inset:15px;border:1px solid rgba(255,255,255,.13);pointer-events:none}
#bt-load .frame::before,#bt-load .frame::after{content:"";position:absolute;width:13px;height:13px;border:0 solid #aaa}
#bt-load .frame::before{top:-1px;left:-1px;border-width:2px 0 0 2px}
#bt-load .frame::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}
#bt-load .center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,80vw);text-align:center}
#bt-load canvas.title{display:block;width:100%;height:auto;image-rendering:pixelated;margin-bottom:30px}
#bt-load .cells{display:flex;gap:3px}
#bt-load .cells i{flex:1;height:10px;background:#252525;box-shadow:0 0 0 1px #151515}
#bt-load .cells i.on{background:#cfcfcf;box-shadow:0 0 8px rgba(255,255,255,.3)}
#bt-load .cells i.cur{background:#8a8a8a;animation:btblink .5s steps(2) infinite}
@keyframes btblink{50%{background:#252525}}
#bt-load .pct{margin-top:24px;font-family:'VT323',monospace;font-size:clamp(20px,3.6vw,26px);letter-spacing:.3em;color:#858585}
#bt-load .msg{margin-top:6px;font-family:'VT323',monospace;font-size:clamp(15px,2.6vw,19px);letter-spacing:.25em;color:#5c5c5c;min-height:1.3em}
#bt-load .flash{position:absolute;inset:0;background:#ededed;opacity:0;pointer-events:none}`;
        (document.head || document.documentElement).appendChild(css);

        const root = document.createElement('div');
        root.id = 'bt-load';
        root.innerHTML = '<div class="grid"></div><div class="scan"></div><div class="roll"></div><div class="frame"></div>' +
            '<div class="center"><canvas class="title"></canvas>' +
            '<div class="cells">' + new Array(CELLS + 1).join('<i></i>') + '</div><div class="pct">0%</div><div class="msg"></div></div>' +
            '<div class="flash"></div>';
        document.documentElement.appendChild(root);

        ui = {
            root: root, title: root.querySelector('.title'), cells: Array.prototype.slice.call(root.querySelectorAll('.cells i')),
            pct: root.querySelector('.pct'), msg: root.querySelector('.msg'), flash: root.querySelector('.flash')
        };
        ui.draw = makeTitle(ui.title);
        ui.draw(0);
        if (instant) {
            root.style.transition = 'none';
            root.classList.add('on');
            ui.flash.style.opacity = '1';
            requestAnimationFrame(function () { ui.flash.style.transition = 'opacity .6s'; ui.flash.style.opacity = '0'; });
        } else {
            requestAnimationFrame(function () { root.classList.add('on'); });
        }
    }

    // ─── Progression : jamais en arrière, jamais 100 % avant la fin réelle ───
    function startScene(getProgress, onArrived, handoff, getMsg) {
        let t0 = performance.now(), last = t0, raf = 0, arrived = false;
        let shown = 0, peak = 0, lastPct = -1, lastCells = -1, lastDraw = 0, lastMsg = '';

        function frame(now) {
            raf = requestAnimationFrame(frame);
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            const el = (now - t0) / 1000;
            peak = Math.max(peak, getProgress());
            if (handoff && peak < 0.95) peak = Math.min(0.95, peak + 0.004 * dt);      // l'attente ne paraît jamais figée
            shown = Math.min(peak, shown + (1 / MIN_SECONDS) * dt * (0.6 + 0.8 * Math.sin(el * 1.3 + 1) * Math.sin(el * 1.3 + 1)));
            const p = shown;

            const pct = Math.floor(p * 100);
            if (pct !== lastPct) { ui.pct.textContent = pct + '%'; lastPct = pct; }
            const c = Math.floor(p * CELLS);
            if (c !== lastCells) {
                ui.cells.forEach(function (n, i) { n.className = i < c ? 'on' : (i === c && p < 0.999 ? 'cur' : ''); });
                lastCells = c;
            }
            if (now - lastDraw > 45) { ui.draw(p); lastDraw = now; }
            if (getMsg) { const m = getMsg(); if (m !== lastMsg) { ui.msg.textContent = m; lastMsg = m; } }

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
                    if (!r.ok) console.warn('[ILLUSION] fichier introuvable : ' + f.p + ' (' + r.status + ')');
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
                } catch (e) { console.warn('[ILLUSION] fichier non chargé : ' + f.p); }   // ne bloque jamais le chargement
            }
            doneW += w;
            onFrac(doneW / totalW);
        }
        async function worker() { while (next < files.length) { await one(files[next++]); } }
        const ws = [];
        for (let i = 0; i < Math.min(CONCURRENCY, files.length); i++) ws.push(worker());
        return Promise.all(ws);
    }

    // ─── Sons : musique du chargement + silence du reste jusqu'à la fin ───
    const readyFns = [];
    const AUDIO_LOG = /[?&]audio\b/.test(location.search);     // ouvrir le jeu avec ?audio dans l'adresse = la console explique ce qui se passe avec les sons
    const alog = function () { if (AUDIO_LOG) console.log.apply(console, ['[ILLUSION son]'].concat([].slice.call(arguments))); };

    // même réglage de volume / sourdine que audio-manager.js (mêmes clés localStorage)
    function volumeSetting() {
        try {
            if (localStorage.getItem('lmtd_muted') === '1') return 0;
            const raw = localStorage.getItem('lmtd_volume');
            const v = raw === null || raw === '' ? 0.7 : Number(raw);
            return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
        } catch (e) { return 0.7; }
    }

    // Tant que l'écran est là : play() des <audio>/<video> est retardé, et les AudioContext (Web Audio : télé, PNJ, ambiance) restent suspendus.
    // Tout repart tout seul à la fin du chargement. Rien à changer dans tv.js ni dans les PNJ.
    function silenceWorld() {
        try {
            const realPlay = HTMLMediaElement.prototype.play, realPause = HTMLMediaElement.prototype.pause;
            HTMLMediaElement.prototype.play = function () {
                if (this.__btMusic || !BT.active()) return realPlay.apply(this, arguments);
                const el = this; el.__btWant = true;
                alog('retardé jusqu\'à la fin du chargement :', el.id || el.currentSrc || el.src || el.tagName);
                return new Promise(function (res, rej) {
                    readyFns.push(function () { if (el.__btWant) realPlay.call(el).then(res, rej); else res(); });
                });
            };
            HTMLMediaElement.prototype.pause = function () { this.__btWant = false; return realPause.apply(this, arguments); };

            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
                const held = [];
                const realResume = AC.prototype.resume;
                AC.prototype.resume = function () {
                    if (!BT.active()) return realResume.apply(this, arguments);
                    if (held.indexOf(this) < 0) held.push(this);
                    return Promise.resolve();
                };
                const Wrapped = function (opts) {
                    const c = opts === undefined ? new AC() : new AC(opts);
                    if (BT.active()) { held.push(c); try { c.suspend().catch(function () { }); } catch (e) { /* tant pis */ } }
                    return c;
                };
                Wrapped.prototype = AC.prototype;
                window.AudioContext = Wrapped;
                if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
                readyFns.push(function () { held.forEach(function (c) { try { realResume.call(c).catch(function () { }); } catch (e) { /* tant pis */ } }); });
            }
        } catch (e) { console.warn('[ILLUSION] silence du monde non installé :', e); }
    }

    // Musique de l'écran de chargement. Renvoie une fonction « arrêter » (fondu de 0,8 s).
    function startLoaderMusic() {
        const none = function () { };
        if (!LOADER_MUSIC) return none;
        let a;
        try {
            a = new Audio(urlOf(LOADER_MUSIC));
            a.__btMusic = true; a.loop = true; a.preload = 'auto'; a.volume = volumeSetting();
        } catch (e) { return none; }
        const events = ['pointerdown', 'keydown', 'touchstart', 'click'];
        let stopped = false;
        function off() { events.forEach(function (n) { removeEventListener(n, unlock, true); }); }
        function unlock() { if (!stopped) tryPlay(); }
        function tryPlay() {
            const p = a.play();
            if (p && p.then) p.then(function () { alog('musique de chargement : lecture en cours, volume ' + a.volume); off(); },
                function (err) { alog('musique de chargement BLOQUÉE par le navigateur (' + (err && err.name) + ') : elle partira au premier clic ou à la première touche'); });
        }
        events.forEach(function (n) { addEventListener(n, unlock, true); });
        a.addEventListener('error', function () { console.warn('[ILLUSION] musique de chargement introuvable : ' + LOADER_MUSIC); });
        alog('musique de chargement : ' + a.src + ', volume ' + a.volume + (a.volume === 0 ? ' (sourdine ou volume à 0 dans les réglages !)' : ''));
        tryPlay();
        return function stopMusic() {
            stopped = true; off();
            const t0 = performance.now(), v0 = a.volume;
            const iv = setInterval(function () {
                const k = Math.min(1, (performance.now() - t0) / 800);
                a.volume = v0 * (1 - k);
                if (k >= 1) { clearInterval(iv); a.pause(); }
            }, 40);
        };
    }

    // ─── Dans le jeu : l'écran reste jusqu'à ce que tout soit prêt ──
    function startHandoff() {
        buildUi(true);
        const t0 = performance.now();
        const holds = { page: 1 };
        let released = false, lastEvent = t0, loaded = document.readyState === 'complete', smooth = 0, lastFrame = t0, avgDt = 16, lastReason = '';
        let done = false, relCount = 0;
        // Vraie progression (le loader ne connaît pas le total : on mesure des étapes) :
        // page chargée 35 % + avatars/éléments prêts 35 % + plus de fichiers qui arrivent 15 % + jeu fluide 15 %. 100 % seulement à la fin.
        const progress = function () {
            if (done) return 1;
            const now = performance.now();
            const rs = document.readyState;
            const page = loaded ? 1 : rs === 'interactive' ? 0.5 : 0.1;
            const cur = Object.keys(holds).filter(function (k) { return k !== 'page'; }).length;
            const hf = relCount + cur === 0 ? (loaded ? 1 : 0) : relCount / (relCount + cur);
            const calm = Math.min(1, (now - lastEvent) / HANDOFF_SETTLE);
            const fluid = Math.min(1, smooth / SMOOTH_FRAMES);
            return Math.min(0.99, 0.35 * page + 0.35 * hf + 0.15 * calm + 0.15 * fluid);
        };
        const message = function () {
            if (done) return 'READY';
            if (!loaded) return 'OPENING THE DOOR';
            const h = Object.keys(holds).filter(function (k) { return k !== 'page'; });
            if (h.some(function (k) { return /avatar/i.test(k); })) return 'WAKING THE LOCALS';
            if (h.length || performance.now() - lastEvent < HANDOFF_SETTLE) return 'BUILDING THE WORLD';
            return 'FOCUSING';
        };
        const stop = startScene(progress, null, true, message);

        BT.active = function () { return !released; };
        BT.hold = function (n) { if (!released) { holds[n] = (holds[n] || 0) + 1; lastEvent = performance.now(); } };
        BT.release = function (n) { if (holds[n]) relCount++; if (holds[n] > 1) holds[n]--; else delete holds[n]; lastEvent = performance.now(); };
        BT.whenReady = function (fn) { if (released) fn(); else readyFns.push(fn); };
        if (SILENCE_WORLD) silenceWorld();
        const stopMusic = startLoaderMusic();
        addEventListener('load', function () { loaded = true; lastEvent = performance.now(); });
        try {
            new PerformanceObserver(function () { if (!released) lastEvent = performance.now(); }).observe({ entryTypes: ['resource'] });
        } catch (e) { /* navigateur sans resource timing */ }

        // Pourquoi l'écran est encore là ? (null = rien ne le retient, il part)
        function why(now) {
            if (!loaded) return 'la page se charge encore';
            const h = Object.keys(holds).filter(function (k) { return k !== 'page'; });
            if (h.length) return 'en attente de : ' + h.join(', ');
            if (now - lastEvent < HANDOFF_SETTLE) return 'des fichiers viennent d\'arriver';
            if (smooth < SMOOTH_FRAMES && now - lastEvent < FLUID_GIVEUP) return 'le jeu tourne trop lentement derrière l\'écran (' + Math.round(1000 / avgDt) + ' images/s)';
            return null;
        }
        function finish(forced, reason) {
            if (released) return;
            released = true; done = true;
            stopMusic();
            readyFns.splice(0).forEach(function (f) { try { f(); } catch (e) { console.warn('[ILLUSION] erreur au démarrage d\'un son :', e); } });     // les sons retenus démarrent maintenant
            try { window.dispatchEvent(new Event('bt-ready')); } catch (e) { /* tant pis */ }
            if (forced) console.warn('[ILLUSION] écran retiré de force après ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s : ' + reason);
            ui.root.style.transition = 'opacity .6s';
            ui.root.style.opacity = '0';
            setTimeout(function () { stop(); ui.root.remove(); ui = null; }, 700);
        }
        (function watch(now) {
            if (released) return;
            const dt = now - lastFrame;
            if (dt > 0) avgDt = avgDt * 0.9 + Math.min(dt, 500) * 0.1;
            smooth = dt < SMOOTH_MS ? smooth + 1 : 0;
            lastFrame = now;
            const reason = why(now);
            if (!reason && now - t0 >= HANDOFF_MIN * 1000) { delete holds.page; finish(false); return; }
            // on n'écrit la raison que si l'attente dure (plus de 6 s) et seulement quand elle change
            if (reason && now - t0 > 6000 && reason.replace(/\(.*\)/, '') !== lastReason) { lastReason = reason.replace(/\(.*\)/, ''); console.log('[ILLUSION] écran de chargement retenu : ' + reason); }
            requestAnimationFrame(watch);
        })(t0);
        setTimeout(function () { finish(true, why(performance.now()) || 'délai maximum'); }, HANDOFF_TIMEOUT);
    }

    // ─── Point d'entrée (menu) ──────────────────────────────────────
    window.BTGo = function (url) {
        if (running) return;
        running = true;
        // L'écran de chargement n'existe que pour le JEU (bouton PLAY). Menu, réglages, retour au menu : simple changement de page.
        const toGame = /[?&]launch\b|world_base/i.test(String(url));
        if (!toGame || !PRELOAD) {
            if (toGame) { try { sessionStorage.setItem(HANDOFF_KEY, String(Date.now())); } catch (e) { /* tant pis */ } }
            window.location.href = url;     // le VRAI écran de chargement s'affiche dans la page du jeu (un seul, pas de faux écran avant)
            return;
        }
        buildUi(false);
        let real = 0, finished = false;
        const stop = startScene(function () { return finished ? 1 : real * 0.985; }, function () {
            stop();
            try { sessionStorage.setItem(HANDOFF_KEY, String(Date.now())); } catch (e) { /* tant pis */ }
            window.location.href = url;
        });
        (async function () {
            if (!PRELOAD) return;                       // le loader ne charge rien : c'est le jeu qui charge, écran retenu par ses holds
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
        sessionStorage.removeItem(HANDOFF_KEY);      // à usage unique : la page suivante (menu, réglages...) n'affichera pas d'écran de chargement
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
