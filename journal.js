// journal.js – le livre du tiroir : un livre ouvert où l'on écrit directement.
//
// OÙ EST LE TEXTE ?
//  - Le fichier  json/book.json  (à côté de world_base.html) est la version "définitive" du livre :
//    c'est celui qu'on pousse sur GitHub, et le jeu le lit à chaque chargement (en ligne comme en local).
//  - En local (XAMPP), à chaque modification, journal.php réécrit ce fichier tout seul.
//  - En ligne, GitHub Pages ne peut pas écrire de fichier : ce qu'on écrit reste dans le navigateur
//    (localStorage, clé "bt_journal"). Settings > EXPORT BOOK donne le book.json à remettre dans le
//    dossier json, puis on pousse.
//  - Si le fichier et le navigateur diffèrent, la version la plus récente (champ "updated") gagne.

const KEY = 'bt_journal';
const MAX_PAGES = 400;     // nombre de pages maximum
const MAX_CHARS = 3000;    // caractères maximum par page

const CSS = `
.btj{position:fixed;left:0;top:0;width:100%;height:100%;z-index:200;display:none;align-items:center;justify-content:center;
  background:rgba(6,4,4,.84);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .3s;
  user-select:text;-webkit-user-select:text;touch-action:manipulation;font-family:Georgia,serif}
.btj.on{display:flex}
.btj.show{opacity:1}
.btj-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.btj-book{position:relative;display:flex;perspective:1800px;
  width:min(94vw,calc(var(--vh,1vh)*86*1.45),1000px);aspect-ratio:1.45/1;
  transform:translateX(-25%) scale(.9);transition:transform 1s cubic-bezier(.45,0,.2,1)}
.btj-book.is-open{transform:translateX(0) scale(1)}
.btj-page{position:relative;width:50%;height:100%;padding:6% 6.5% 8%;box-sizing:border-box;
  background:linear-gradient(100deg,#e6d7b6,#efe3c6 40%,#e4d4af);box-shadow:0 22px 50px rgba(0,0,0,.6)}
.btj-left{border-radius:6px 0 0 6px;opacity:0;box-shadow:0 22px 50px rgba(0,0,0,.6),inset -22px 0 26px -16px rgba(60,35,10,.45)}
.btj-right{border-radius:0 6px 6px 0;box-shadow:0 22px 50px rgba(0,0,0,.6),inset 22px 0 26px -16px rgba(60,35,10,.45)}
.btj-book.is-flipped .btj-left{opacity:1;transition:opacity .35s}
.btj-book.turning .btj-page .btj-ta{opacity:0}
.btj-ta{display:block;width:100%;height:100%;box-sizing:border-box;border:0;outline:0;resize:none;margin:0;padding:0;
  background:transparent;color:#2a1d12;caret-color:#7a1f2e;overflow-y:auto;
  font-family:'Segoe Print','Bradley Hand','Noteworthy','Chalkboard SE','Comic Sans MS',cursive;
  font-size:clamp(13px,calc(var(--vh,1vh)*2.5),21px);line-height:1.9em;
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(1.9em - 1px),rgba(90,60,30,.28) calc(1.9em - 1px),rgba(90,60,30,.28) 1.9em);
  background-attachment:local;user-select:text;-webkit-user-select:text;touch-action:pan-y;transition:opacity .12s}
.btj-ta::-webkit-scrollbar{width:4px}
.btj-ta::-webkit-scrollbar-thumb{background:rgba(90,60,30,.3);border-radius:2px}
.btj-num{position:absolute;left:0;right:0;bottom:3.2%;text-align:center;font-size:12px;color:rgba(60,40,20,.55);pointer-events:none}
.btj-cover{position:absolute;left:50%;top:0;width:50%;height:100%;transform-origin:left center;transform-style:preserve-3d;
  transition:transform 1s cubic-bezier(.45,0,.2,1);pointer-events:none}
.btj-book.is-open .btj-cover{transform:rotateY(-180deg)}
.btj-book.is-flipped .btj-cover{visibility:hidden}
.btj-cover>div{position:absolute;left:0;top:0;width:100%;height:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.btj-cover-front{border-radius:0 6px 6px 0;background:radial-gradient(120% 90% at 30% 20%,#7c2431 0%,#521320 55%,#2e0a12 100%);
  box-shadow:inset 0 0 40px rgba(0,0,0,.55),0 22px 50px rgba(0,0,0,.6)}
.btj-cover-front::before{content:'';position:absolute;left:8%;top:6%;right:8%;bottom:6%;border:2px solid rgba(214,174,92,.8);border-radius:3px}
.btj-cover-front::after{content:'';position:absolute;left:50%;top:50%;width:15%;aspect-ratio:1;transform:translate(-50%,-50%) rotate(45deg);
  border:2px solid rgba(214,174,92,.85)}
.btj-cover-back{transform:rotateY(180deg);border-radius:6px 0 0 6px;background:linear-gradient(100deg,#e6d7b6,#efe3c6 40%,#e4d4af)}
.btj-nav{position:absolute;bottom:2.5%;width:40px;height:40px;border-radius:50%;border:1px solid rgba(60,40,20,.35);
  background:rgba(240,228,200,.75);color:#3a2616;font:24px/1 Georgia,serif;cursor:pointer;padding:0;z-index:2;
  -webkit-tap-highlight-color:transparent}
.btj-nav:disabled{opacity:.25;cursor:default}
.btj-prev{left:1.5%}
.btj-next{right:1.5%}
.btj-close{position:absolute;top:max(14px,env(safe-area-inset-top));right:16px;width:44px;height:44px;border-radius:50%;
  border:1px solid rgba(214,174,92,.5);background:rgba(20,10,10,.7);color:#e8d6a8;font:20px/1 Arial,sans-serif;cursor:pointer;padding:0}
.btj-saved{position:absolute;top:max(24px,env(safe-area-inset-top));left:22px;color:#d6ae5c;font-size:16px;opacity:0;transition:opacity .4s;pointer-events:none}
.btj-saved.on{opacity:.9}
.btj-book[data-mode="1"]{width:min(94vw,calc(var(--vh,1vh)*88*.74),520px);aspect-ratio:.74/1;opacity:0;
  transform:scale(.85);transition:transform .5s,opacity .5s}
.btj-book[data-mode="1"].is-open{opacity:1;transform:scale(1)}
.btj-book[data-mode="1"] .btj-right,.btj-book[data-mode="1"] .btj-cover{display:none}
.btj-book[data-mode="1"] .btj-left{width:100%;border-radius:6px;opacity:1;box-shadow:0 22px 50px rgba(0,0,0,.6)}
`;

// Ordinateur / réseau maison (XAMPP, wifi) : seul endroit où journal.php peut écrire
function isLocalHost() {
    const h = location.hostname;
    return h === 'localhost' || h === '[::1]' || /\.local$/.test(h) ||
        /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

export function createJournal(opts) {
    opts = opts || {};
    const FILE = opts.file === undefined ? 'json/book.json' : opts.file;   // '' = ne pas lire de fichier
    const API = opts.api === undefined ? 'journal.php' : opts.api;         // '' = ne pas écrire de fichier
    const WEB = /^https?:$/.test(location.protocol);
    const CAN_READ = !!FILE && WEB;
    const CAN_WRITE = !!API && WEB && isLocalHost();   // jamais en ligne : GitHub Pages ne sait pas écrire

    // ─── DONNÉES ─────────────────────────────────────────────────
    function normalize(d) {
        const pages = (d && Array.isArray(d.pages) ? d.pages : [])
            .slice(0, MAX_PAGES)
            .map(function(t) { return typeof t === 'string' ? t.slice(0, MAX_CHARS) : ''; });
        while (pages.length < 2 || pages.length % 2) pages.push('');
        return {
            version: 1,
            pages: pages,
            pos: d && Number.isInteger(d.pos) && d.pos >= 0 && d.pos < pages.length ? d.pos : 0,
            updated: d && Number.isFinite(d.updated) ? d.updated : 0
        };
    }

    function hasText(d) {
        return d.pages.some(function(t) { return t.trim() !== ''; });
    }

    function readLocal() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return normalize(JSON.parse(raw));
        } catch (e) {
            console.warn('[journal] lecture impossible :', e);
        }
        return normalize(null);
    }

    function writeLocal() {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[journal] sauvegarde navigateur impossible :', e);
        }
    }

    let data = readLocal();

    // Demande au navigateur de ne pas effacer ces données tout seul (une seule fois)
    let persistAsked = false;
    function askPersist() {
        if (persistAsked) return;
        persistAsked = true;
        try {
            if (navigator.storage && navigator.storage.persist) {
                const p = navigator.storage.persist();
                if (p && p.catch) p.catch(function() {});
            }
        } catch (e) {}
    }

    // ─── FICHIER json/book.json ───────────────────────────────────
    let writeOK = null;         // null = pas encore essayé, true = ça écrit, false = indisponible
    let remoteDirty = false;
    let pushTimer = null;
    let writeWarned = false;

    function payload() {
        return JSON.stringify({ version: data.version, pages: data.pages, updated: data.updated });
    }

    function schedulePush() {
        if (!CAN_WRITE || writeOK === false || !remoteDirty) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushFile, 1000);
    }

    // Demande à journal.php de réécrire json/book.json
    function pushFile() {
        if (!CAN_WRITE || writeOK === false) return Promise.resolve();
        clearTimeout(pushTimer);
        return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload() })
            .then(function(r) {
                if (r.status === 409) { remoteDirty = false; return; }    // le fichier est plus récent : il sera relu au prochain chargement
                if (!r.ok) throw new Error('HTTP ' + r.status);
                writeOK = true;
                remoteDirty = false;
            })
            .catch(function(e) {
                writeOK = false;
                if (!writeWarned) {
                    writeWarned = true;
                    console.warn('[journal] json/book.json non écrit (' + e.message + ') : le livre reste dans le navigateur. Vérifie que XAMPP tourne et que journal.php est là.');
                }
            });
    }

    // Au chargement : on lit json/book.json et on garde la version la plus récente
    function syncFromFile() {
        if (!CAN_READ) return;
        fetch(FILE + '?v=' + Date.now(), { cache: 'no-store' })
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(remote) {
                if (!remote || !Array.isArray(remote.pages)) return;
                const rem = normalize(remote);
                if (rem.updated > data.updated) {
                    // le fichier est plus récent (ex. nouveau push, ou cache effacé) : on le reprend
                    rem.pos = data.pos < rem.pages.length ? data.pos : 0;
                    data = rem;
                    writeLocal();
                    if (isOpen) render();
                } else if (data.updated > rem.updated && CAN_WRITE) {
                    // ce qu'on a écrit est plus récent que le fichier : on le réécrit (local seulement)
                    remoteDirty = true;
                    pushFile();
                }
            })
            .catch(function(e) {
                console.info('[journal] ' + FILE + ' non lu (' + e.message + ') : livre du navigateur uniquement.');
            });
    }

    // ─── SAUVEGARDE ──────────────────────────────────────────────
    let saveTimer = null;
    let savedTimer = null;

    function showSaved() {
        if (!el.saved) return;
        el.saved.classList.add('on');
        clearTimeout(savedTimer);
        savedTimer = setTimeout(function() { el.saved.classList.remove('on'); }, 900);
    }

    function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        writeLocal();
        if (hasText(data)) askPersist();
        schedulePush();
        showSaved();
    }

    function saveSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 350);
    }

    function flushOnLeave() {
        if (saveTimer) saveNow();
        if (CAN_WRITE && writeOK !== false && remoteDirty) {
            try {
                navigator.sendBeacon(API, new Blob([payload()], { type: 'application/json' }));
            } catch (e) {}
        }
    }
    window.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', function() { if (document.hidden) flushOnLeave(); });

    // ─── INTERFACE ───────────────────────────────────────────────
    let root = null;
    let el = {};
    let isOpen = false;
    let perView = 2;        // 2 pages côte à côte, ou 1 seule sur petit écran portrait
    let p = 0;              // index de la page de gauche affichée
    let timers = [];

    function later(fn, ms) {
        const t = setTimeout(fn, ms);
        timers.push(t);
        return t;
    }

    function clearTimers() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    function build() {
        if (root) return;
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);

        root = document.createElement('div');
        root.className = 'btj';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Journal');
        const ta = '<textarea class="btj-ta" spellcheck="false" autocomplete="off" maxlength="' + MAX_CHARS + '"';
        root.innerHTML =
            '<div class="btj-stage">' +
              '<div class="btj-book" data-mode="2">' +
                '<section class="btj-page btj-left">' + ta + ' aria-label="Page de gauche"></textarea><span class="btj-num"></span></section>' +
                '<section class="btj-page btj-right">' + ta + ' aria-label="Page de droite"></textarea><span class="btj-num"></span></section>' +
                '<div class="btj-cover"><div class="btj-cover-front"></div><div class="btj-cover-back"></div></div>' +
                '<button class="btj-nav btj-prev" type="button" aria-label="Page précédente">&#8249;</button>' +
                '<button class="btj-nav btj-next" type="button" aria-label="Page suivante">&#8250;</button>' +
              '</div>' +
              '<button class="btj-close" type="button" aria-label="Fermer">&#10005;</button>' +
              '<span class="btj-saved">&#10003;</span>' +
            '</div>';
        document.body.appendChild(root);

        el.stage = root.querySelector('.btj-stage');
        el.book = root.querySelector('.btj-book');
        el.ta = root.querySelectorAll('.btj-ta');
        el.num = root.querySelectorAll('.btj-num');
        el.prev = root.querySelector('.btj-prev');
        el.next = root.querySelector('.btj-next');
        el.close = root.querySelector('.btj-close');
        el.saved = root.querySelector('.btj-saved');

        // Les touches tapées dans le livre ne doivent pas faire marcher le joueur (WASD, espace, E...)
        root.addEventListener('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); close(); }
        });

        [0, 1].forEach(function(i) {
            el.ta[i].addEventListener('input', function() {
                const idx = p + i;
                if (idx >= data.pages.length) return;
                data.pages[idx] = el.ta[i].value;
                data.updated = Date.now();
                remoteDirty = true;
                updateNav();
                saveSoon();
            });
        });

        el.prev.addEventListener('click', function() { turn(-1); });
        el.next.addEventListener('click', function() { turn(1); });
        el.close.addEventListener('click', close);

        // Clic dans le noir autour du livre = fermer (sans fermer quand on finit une sélection de texte dehors)
        let downOnBackdrop = false;
        root.addEventListener('pointerdown', function(e) {
            downOnBackdrop = (e.target === root || e.target === el.stage);
        });
        root.addEventListener('click', function(e) {
            if (downOnBackdrop && (e.target === root || e.target === el.stage)) close();
            downOnBackdrop = false;
        });
    }

    function fit() {
        const vv = window.visualViewport;
        const h = vv ? vv.height : window.innerHeight;
        root.style.height = h + 'px';
        root.style.top = (vv ? vv.offsetTop : 0) + 'px';
        root.style.setProperty('--vh', (h / 100) + 'px');
    }

    function currentMode() {
        return window.innerWidth < 720 ? 1 : 2;
    }

    function updateNav() {
        const last = p + perView >= data.pages.length;
        const visibleHasText = data.pages.slice(p, p + perView).some(function(t) { return t.trim() !== ''; });
        el.prev.disabled = p === 0;
        el.next.disabled = last && !visibleHasText;
    }

    function render() {
        el.ta[0].value = data.pages[p] || '';
        el.ta[1].value = data.pages[p + 1] || '';
        el.num[0].textContent = String(p + 1);
        el.num[1].textContent = String(p + 2);
        updateNav();
    }

    function turn(dir) {
        if (el.book.classList.contains('turning')) return;
        let np = p + dir * perView;
        if (dir > 0 && np >= data.pages.length) {
            // à la fin : une nouvelle double page apparaît seulement si on a écrit sur celle-ci
            if (!data.pages.slice(p, p + perView).some(function(t) { return t.trim() !== ''; })) return;
            if (data.pages.length + 2 > MAX_PAGES) return;
            data.pages.push('', '');
        }
        if (np < 0) np = 0;
        if (np === p) return;
        el.book.classList.add('turning');
        later(function() {
            p = np;
            data.pos = p;
            render();
            writeLocal();
            el.book.classList.remove('turning');
        }, 130);
    }

    function onResize() {
        if (!isOpen) return;
        fit();
        const m = currentMode();
        if (m !== perView) {
            perView = m;
            if (perView === 2) p -= p % 2;
            el.book.dataset.mode = String(perView);
            el.book.classList.add('is-open', 'is-flipped');
            render();
        }
    }

    function trapKeys(e) {
        // Focus hors du livre (ex. clic sur le fond) : on bloque quand même les touches du jeu
        if (root.contains(e.target)) return;
        e.stopPropagation();
        if (e.key === 'Escape') close();
    }

    function open() {
        if (isOpen) return;
        build();
        isOpen = true;
        clearTimers();

        perView = currentMode();
        p = Math.min(data.pos, data.pages.length - 1);
        if (perView === 2) p -= p % 2;

        el.book.dataset.mode = String(perView);
        el.book.classList.remove('is-open', 'is-flipped', 'turning');
        render();
        fit();

        root.classList.add('on');
        void root.offsetWidth;                 // force l'état de départ avant l'animation
        root.classList.add('show');
        later(function() { el.book.classList.add('is-open'); }, 120);

        if (perView === 2) {
            later(function() { el.book.classList.add('is-flipped'); focusWriting(); }, 1180);   // la couverture est retombée à gauche
        } else {
            el.book.classList.add('is-flipped');
            later(focusWriting, 600);
        }

        window.addEventListener('keydown', trapKeys, true);
        window.addEventListener('resize', onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onResize);
            window.visualViewport.addEventListener('scroll', fit);
        }
    }

    function focusWriting() {
        // Sur tablette / téléphone on n'ouvre pas le clavier tout seul : il cacherait le livre
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
        let i = 0;
        if (perView === 2 && (data.pages[p] || '').trim() !== '' && (data.pages[p + 1] || '') === '') i = 1;
        const t = el.ta[i];
        try {
            t.focus({ preventScroll: true });
            t.setSelectionRange(t.value.length, t.value.length);
        } catch (e) {}
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        clearTimers();
        if (saveTimer) saveNow();
        window.removeEventListener('keydown', trapKeys, true);
        window.removeEventListener('resize', onResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', onResize);
            window.visualViewport.removeEventListener('scroll', fit);
        }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        root.classList.remove('show');
        later(function() {
            root.classList.remove('on');
            el.book.classList.remove('is-open', 'is-flipped', 'turning');
        }, 320);
        if (typeof opts.onClose === 'function') opts.onClose();
    }

    syncFromFile();

    return {
        open: open,
        close: close,
        isOpen: function() { return isOpen; },
        // Pour l'export / import JSON du jeu
        exportData: function() { return { version: data.version, pages: data.pages.slice(), updated: data.updated }; },
        importData: function(d) {
            if (!d || !Array.isArray(d.pages)) return;
            data = normalize(d);
            data.updated = Date.now();
            remoteDirty = true;
            writeLocal();
            schedulePush();
            if (isOpen) render();
        }
    };
}
