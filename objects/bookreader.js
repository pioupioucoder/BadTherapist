// bookreader.js – lecteur de livre (lecture seule) pour les livres de l'étagère du thérapeute.
//
// Chaque livre est un fichier json/livredetherapeute/bookNN.json :
// {
//   "title":  "Titre du livre",
//   "author": "Nom (facultatif)",
//   "cover": {
//     "color":     "#7c2431",   // couleur de la couverture ET du dos sur l'étagère
//     "accent":    "#d6ae5c",   // couleur du cadre, du symbole et des bandes du dos
//     "textColor": "#e8d6a8",   // couleur du titre
//     "symbol":    "diamond",   // diamond | circle | cross | moon | eye | none
//     "image":     ""           // facultatif : "images/ma-couverture.png" (remplace le symbole)
//   },
//   "pages": ["Texte de la page 1", "Texte de la page 2", "..."]
// }
//
// Utilisation : const reader = createBookReader(); reader.open(donnéesDuLivre); reader.isOpen();

const CSS = `
.btr{position:fixed;left:0;top:0;width:100%;height:100%;z-index:200;display:none;align-items:center;justify-content:center;
  background:rgba(6,4,4,.86);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .3s;
  user-select:text;-webkit-user-select:text;touch-action:manipulation;font-family:Georgia,'Times New Roman',serif}
.btr.on{display:flex}
.btr.show{opacity:1}
.btr-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.btr-cover{position:relative;width:min(80vw,calc(var(--vh,1vh)*80*.72),420px);aspect-ratio:.72/1;border-radius:4px 10px 10px 4px;cursor:pointer;
  transform-origin:left center;transition:transform .8s cubic-bezier(.45,0,.2,1),opacity .6s;box-shadow:0 24px 54px rgba(0,0,0,.65),inset 0 0 40px rgba(0,0,0,.5);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6%;text-align:center;overflow:hidden}
.btr-cover.opening{transform:perspective(1600px) rotateY(-70deg) translateX(-10%);opacity:0}
.btr-cover::before{content:'';position:absolute;left:7%;top:5%;right:7%;bottom:5%;border:2px solid var(--accent,#d6ae5c);border-radius:3px;opacity:.85;pointer-events:none}
.btr-cv-sym{width:34%;aspect-ratio:1}
.btr-cv-sym svg{width:100%;height:100%;display:block}
.btr-cv-title{padding:0 12%;font-size:clamp(18px,calc(var(--vh,1vh)*3.6),32px);line-height:1.25;letter-spacing:.04em}
.btr-cv-author{padding:0 12%;font-size:clamp(11px,calc(var(--vh,1vh)*2),16px);opacity:.75;letter-spacing:.12em;text-transform:uppercase}
.btr-cv-hint{position:absolute;bottom:7%;left:0;right:0;font-size:12px;letter-spacing:.3em;opacity:.55;animation:btrp 1.8s ease-in-out infinite}
@keyframes btrp{0%,100%{opacity:.25}50%{opacity:.7}}
.btr-spread{position:relative;display:none;width:min(94vw,calc(var(--vh,1vh)*86*1.45),1000px);aspect-ratio:1.45/1;opacity:0;transition:opacity .5s}
.btr-spread.on{display:flex}
.btr-spread.show{opacity:1}
.btr-page{position:relative;width:50%;height:100%;padding:6% 6.5% 8%;box-sizing:border-box;
  background:linear-gradient(100deg,#e6d7b6,#efe3c6 40%,#e4d4af);box-shadow:0 22px 50px rgba(0,0,0,.6)}
.btr-pl{border-radius:6px 0 0 6px;box-shadow:0 22px 50px rgba(0,0,0,.6),inset -22px 0 26px -16px rgba(60,35,10,.45)}
.btr-pr{border-radius:0 6px 6px 0;box-shadow:0 22px 50px rgba(0,0,0,.6),inset 22px 0 26px -16px rgba(60,35,10,.45)}
.btr-spread[data-mode="1"]{width:min(94vw,calc(var(--vh,1vh)*88*.74),520px);aspect-ratio:.74/1}
.btr-spread[data-mode="1"] .btr-pl{width:100%;border-radius:6px}
.btr-spread[data-mode="1"] .btr-pr{display:none}
.btr-txt{width:100%;height:100%;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;color:#2a1d12;
  font-size:clamp(13px,calc(var(--vh,1vh)*2.4),20px);line-height:1.7;touch-action:pan-y;transition:opacity .12s}
.btr-txt::-webkit-scrollbar{width:4px}
.btr-txt::-webkit-scrollbar-thumb{background:rgba(90,60,30,.3);border-radius:2px}
.btr-spread.turning .btr-txt{opacity:0}
.btr-num{position:absolute;left:0;right:0;bottom:3.2%;text-align:center;font-size:12px;color:rgba(60,40,20,.55);pointer-events:none}
.btr-nav{position:absolute;bottom:2.5%;width:40px;height:40px;border-radius:50%;border:1px solid rgba(60,40,20,.35);
  background:rgba(240,228,200,.75);color:#3a2616;font:24px/1 Georgia,serif;cursor:pointer;padding:0;z-index:2;-webkit-tap-highlight-color:transparent}
.btr-nav:disabled{opacity:.25;cursor:default}
.btr-prev{left:1.5%}
.btr-next{right:1.5%}
.btr-close{position:absolute;top:max(14px,env(safe-area-inset-top));right:16px;width:44px;height:44px;border-radius:50%;
  border:1px solid rgba(214,174,92,.5);background:rgba(20,10,10,.7);color:#e8d6a8;font:20px/1 Arial,sans-serif;cursor:pointer;padding:0;z-index:3}
`;

const SYMBOLS = {
    diamond: '<polygon points="50,6 94,50 50,94 6,50" fill="none" stroke="currentColor" stroke-width="3"/>',
    circle: '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="6" fill="currentColor"/>',
    cross: '<path d="M50 8v84M8 50h84" stroke="currentColor" stroke-width="4" fill="none"/>',
    moon: '<path d="M64 10a40 40 0 1 0 0 80a32 32 0 1 1 0-80z" fill="none" stroke="currentColor" stroke-width="3"/>',
    eye: '<path d="M6 50C22 22 78 22 94 50C78 78 22 78 6 50z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="12" fill="currentColor"/>',
    none: ''
};

export function createBookReader() {

    let root = null;
    const el = {};
    let data = null;
    let isOpenFlag = false;
    let spreadOpen = false;
    let perView = 2;
    let p = 0;
    let timers = [];

    function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function build() {
        if (root) return;
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);

        root = document.createElement('div');
        root.className = 'btr';
        root.setAttribute('role', 'dialog');
        root.innerHTML =
            '<div class="btr-stage">' +
              '<div class="btr-cover"><div class="btr-cv-sym"></div><div class="btr-cv-title"></div><div class="btr-cv-author"></div><div class="btr-cv-hint">OPEN</div></div>' +
              '<div class="btr-spread" data-mode="2">' +
                '<section class="btr-page btr-pl"><div class="btr-txt"></div><span class="btr-num"></span></section>' +
                '<section class="btr-page btr-pr"><div class="btr-txt"></div><span class="btr-num"></span></section>' +
                '<button class="btr-nav btr-prev" type="button" aria-label="Previous page">&#8249;</button>' +
                '<button class="btr-nav btr-next" type="button" aria-label="Next page">&#8250;</button>' +
              '</div>' +
              '<button class="btr-close" type="button" aria-label="Close">&#10005;</button>' +
            '</div>';
        document.body.appendChild(root);

        el.stage = root.querySelector('.btr-stage');
        el.cover = root.querySelector('.btr-cover');
        el.sym = root.querySelector('.btr-cv-sym');
        el.title = root.querySelector('.btr-cv-title');
        el.author = root.querySelector('.btr-cv-author');
        el.spread = root.querySelector('.btr-spread');
        el.txt = root.querySelectorAll('.btr-txt');
        el.num = root.querySelectorAll('.btr-num');
        el.prev = root.querySelector('.btr-prev');
        el.next = root.querySelector('.btr-next');
        el.close = root.querySelector('.btr-close');

        // Les touches tapées ici ne doivent pas faire marcher le joueur
        root.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowLeft' && spreadOpen) turn(-1);
            else if (e.key === 'ArrowRight' && spreadOpen) turn(1);
            else if ((e.key === 'Enter' || e.key === ' ') && !spreadOpen) { e.preventDefault(); openSpread(); }
        });

        el.cover.addEventListener('click', openSpread);
        el.prev.addEventListener('click', function () { turn(-1); });
        el.next.addEventListener('click', function () { turn(1); });
        el.close.addEventListener('click', close);

        let downOnBackdrop = false;
        root.addEventListener('pointerdown', function (e) { downOnBackdrop = (e.target === root || e.target === el.stage); });
        root.addEventListener('click', function (e) {
            if (downOnBackdrop && (e.target === root || e.target === el.stage)) close();
            downOnBackdrop = false;
        });

        window.addEventListener('resize', onResize);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    }

    function fit() {
        const vv = window.visualViewport;
        const h = vv ? vv.height : window.innerHeight;
        root.style.height = h + 'px';
        root.style.top = (vv ? vv.offsetTop : 0) + 'px';
        root.style.setProperty('--vh', (h / 100) + 'px');
    }

    function normalize(d) {
        d = d || {};
        const c = d.cover || {};
        let pages = Array.isArray(d.pages) ? d.pages.map(function (t) { return typeof t === 'string' ? t : ''; }) : [];
        if (!pages.length) pages = [''];
        return {
            title: typeof d.title === 'string' ? d.title : '',
            author: typeof d.author === 'string' ? d.author : '',
            cover: {
                color: c.color || '#7c2431',
                accent: c.accent || '#d6ae5c',
                textColor: c.textColor || '#e8d6a8',
                symbol: SYMBOLS[c.symbol] !== undefined ? c.symbol : 'diamond',
                image: c.image || ''
            },
            pages: pages
        };
    }

    function paintCover() {
        const c = data.cover;
        el.cover.style.setProperty('--accent', c.accent);
        el.cover.style.color = c.textColor;
        el.cover.style.background = c.image
            ? 'center/cover no-repeat url("' + String(c.image).replace(/"/g, '') + '"), ' + c.color
            : 'radial-gradient(120% 90% at 30% 20%, ' + c.color + ' 0%, ' + c.color + ' 55%, #1a0508 140%)';
        if (c.image) {
            el.sym.innerHTML = '';
            el.title.textContent = '';
            el.author.textContent = '';
        } else {
            el.sym.style.color = c.accent;
            el.sym.innerHTML = '<svg viewBox="0 0 100 100">' + SYMBOLS[c.symbol] + '</svg>';
            el.title.textContent = data.title;
            el.author.textContent = data.author;
        }
    }

    function render() {
        el.txt[0].textContent = data.pages[p] || '';
        el.txt[1].textContent = data.pages[p + 1] || '';
        el.txt[0].scrollTop = 0;
        el.txt[1].scrollTop = 0;
        el.num[0].textContent = String(p + 1);
        el.num[1].textContent = (p + 1 < data.pages.length) ? String(p + 2) : '';
        el.prev.disabled = p === 0;
        el.next.disabled = p + perView >= data.pages.length;
    }

    function turn(dir) {
        if (el.spread.classList.contains('turning')) return;
        const np = Math.max(0, p + dir * perView);
        if (np === p || np >= data.pages.length) return;
        el.spread.classList.add('turning');
        later(function () {
            p = np;
            render();
            el.spread.classList.remove('turning');
        }, 130);
    }

    function openSpread() {
        if (spreadOpen) return;
        spreadOpen = true;
        perView = window.innerWidth < 720 ? 1 : 2;
        el.spread.dataset.mode = String(perView);
        if (perView === 2) p -= p % 2;
        el.cover.classList.add('opening');
        later(function () {
            el.cover.style.display = 'none';
            render();
            el.spread.classList.add('on');
            requestAnimationFrame(function () { el.spread.classList.add('show'); });
        }, 650);
    }

    function onResize() {
        if (!isOpenFlag) return;
        fit();
        if (!spreadOpen) return;
        const m = window.innerWidth < 720 ? 1 : 2;
        if (m !== perView) {
            perView = m;
            if (perView === 2) p -= p % 2;
            el.spread.dataset.mode = String(perView);
            render();
        }
    }

    function trapKeys(e) {
        if (root.contains(e.target)) return;
        e.stopPropagation();
        if (e.key === 'Escape') close();
    }

    function open(bookData) {
        build();
        clearTimers();
        data = normalize(bookData);
        p = 0;
        spreadOpen = false;
        isOpenFlag = true;
        paintCover();
        el.cover.classList.remove('opening');
        el.cover.style.display = '';
        el.spread.classList.remove('on', 'show', 'turning');
        fit();
        root.classList.add('on');
        requestAnimationFrame(function () { root.classList.add('show'); });
        document.addEventListener('keydown', trapKeys, true);
        try { el.cover.setAttribute('tabindex', '0'); el.cover.focus({ preventScroll: true }); } catch (e) {}
    }

    function close() {
        if (!isOpenFlag) return;
        isOpenFlag = false;
        clearTimers();
        document.removeEventListener('keydown', trapKeys, true);
        root.classList.remove('show');
        later(function () { if (!isOpenFlag) root.classList.remove('on'); }, 320);
    }

    return {
        open: open,
        close: close,
        isOpen: function () { return isOpenFlag; }
    };
}
