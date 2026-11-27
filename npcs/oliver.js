// npcs/oliver.js – Oliver, chauffeur de taxi : SA FICHE (apparence, phrases) + SON MÉTIER (le menu de destination du taxi, en bas du fichier).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH. Pas de cerveau IA : seulement ce qui est écrit ici.
//
// Le taxi (objects/vehicle.js, createTaxi) ne sait que rouler vers un arrêt. C'est Oliver qui propose les destinations (la carte avec les icônes)
// et qui part tout de suite quand tu as choisi : aucune attente. outside.js crée le menu avec createRideMenu et le donne au taxi (option rideMenu).
// (Ancien code du menu : il était dans taxi.js.)

// ═══════════════════════════════════════════════════════════════════════════
// 1. SA FICHE
// ═══════════════════════════════════════════════════════════════════════════

export default {
    id: 'oliver',
    name: 'Oliver',
    job: 'taxi',

    height: 1.78,
    look: { skin: '#d8b08c', shirt: '#8b6f47', pants: '#2a2a2e', hair: '#9a9a9a', hairStyle: 'short' },
    vehicle: 'taxi',

    lines: {
        greet: ['Need a ride?', 'Evening.', 'Cold one, huh.'],
        idle: ['Engine is still warm.', '...'],
        work: ['Say where, I drive.', 'Roads are slippery tonight.'],
        reply: ['Mm.', 'If you say so.'],
        fallback: ['...'],
        answers: [
            { when: /taxi|ride|drive|take me/i, say: ['Get in. Pick a stop on the map.'] },
            { when: /snow|cold|weather/i, say: ['It never stops.'] }
        ]
    },

    routine: [
        // exemple (à activer plus tard) :
        // { at: '22:00', do: 'stop_job' },
        // { at: '22:05', do: 'go_to', args: { place: 'building' } },
        // { at: '06:00', do: 'go_to', args: { place: 'street_front' } },
        // { at: '06:10', do: 'start_job' }
    ]
};


// ═══════════════════════════════════════════════════════════════════════════
// 2. SON MÉTIER : proposer les destinations (carte avec icônes, aucun nom)
//    createRideMenu({ stops, getMapData }) -> { open({ x, z, onChoose(stop), onClose() }), hide() }
//    x, z = position du taxi (point jaune sur la carte). Aucun import : seulement du DOM + canvas.
// ═══════════════════════════════════════════════════════════════════════════

export function createRideMenu(o) {
  o = o || {};
  const stops = o.stops || [];
  let ui = null, cur = null, shown = false;

    function icon(c, type, cx, cy, r, col) {
      c.save(); c.translate(cx, cy); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(1.5, r * 0.12); c.lineJoin = 'round'; c.lineCap = 'round';
      const u = r / 10;
      c.beginPath();
      if (type === 'home') { c.rect(-5 * u, -8 * u, 10 * u, 16 * u); c.stroke(); for (let k = 0; k < 3; k++) c.fillRect(-2.5 * u, (-5 + k * 5) * u, 5 * u, 2.4 * u); }
      else if (type === 'work') { c.moveTo(-8 * u, -1 * u); c.lineTo(0, -8 * u); c.lineTo(8 * u, -1 * u); c.moveTo(-6 * u, -1 * u); c.lineTo(-6 * u, 7 * u); c.lineTo(6 * u, 7 * u); c.lineTo(6 * u, -1 * u); c.stroke(); }
      else if (type === 'town') { c.rect(-9 * u, -2 * u, 6 * u, 9 * u); c.rect(-3 * u, -8 * u, 6 * u, 15 * u); c.rect(3 * u, 0, 6 * u, 7 * u); c.stroke(); }
      else if (type === 'gas') { c.rect(-6 * u, -8 * u, 9 * u, 15 * u); c.moveTo(3 * u, -3 * u); c.lineTo(7 * u, -3 * u); c.lineTo(7 * u, 4 * u); c.stroke(); c.fillRect(-4 * u, -6 * u, 5 * u, 4 * u); }
      else if (type === 'train') { c.rect(-5 * u, -8 * u, 10 * u, 12 * u); c.moveTo(-7 * u, 8 * u); c.lineTo(7 * u, 8 * u); c.stroke(); c.fillRect(-3 * u, -5 * u, 6 * u, 4 * u); }
      else if (type === 'city') { c.rect(-8 * u, -3 * u, 7 * u, 10 * u); c.rect(-1 * u, -8 * u, 9 * u, 15 * u); c.stroke(); }
      else if (type === 'port') { c.arc(0, -5 * u, 2.6 * u, 0, 6.3); c.moveTo(0, -2.4 * u); c.lineTo(0, 8 * u); c.moveTo(-5 * u, 1 * u); c.lineTo(5 * u, 1 * u); c.moveTo(-7 * u, 3 * u); c.quadraticCurveTo(-5 * u, 9 * u, 0, 8 * u); c.quadraticCurveTo(5 * u, 9 * u, 7 * u, 3 * u); c.stroke(); }
      else if (type === 'school') { c.rect(-8 * u, -1 * u, 16 * u, 9 * u); c.moveTo(-9 * u, -1 * u); c.lineTo(0, -8 * u); c.lineTo(9 * u, -1 * u); c.stroke(); c.fillRect(-2 * u, 2.5 * u, 4 * u, 5.5 * u); }
      else { c.arc(0, 0, 6 * u, 0, 6.3); c.stroke(); }
      c.restore();
    }

    function buildUI() {
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:9500;background:rgba(5,7,10,0.94);display:none;flex-direction:column;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#e8d6a8;touch-action:manipulation;';
      const bar = document.createElement('div');
      bar.style.cssText = 'width:min(96vw,760px);display:flex;justify-content:space-between;align-items:center;padding:6px 4px;letter-spacing:3px;font-size:13px;';
      bar.textContent = 'DESTINATION';
      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText = 'background:#1a1d22;border:1px solid #5a5340;color:#e8d6a8;border-radius:8px;width:44px;height:40px;font-size:20px;';
      bar.appendChild(close);
      const cv = document.createElement('canvas');
      cv.style.cssText = 'width:min(96vw,760px);height:min(62vh,700px);background:#0b0e12;border:1px solid #3a3526;border-radius:10px;';
      const row = document.createElement('div');
      row.style.cssText = 'width:min(96vw,760px);display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:12px 4px;';
      root.appendChild(bar); root.appendChild(cv); root.appendChild(row);
      document.body.appendChild(root);
      ui = { root: root, cv: cv, row: row, hit: [], close: close, md: null };
      close.addEventListener('click', closeMenu);
      cv.addEventListener('click', function (e) {
        const r = cv.getBoundingClientRect();
        const px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height;
        let best = null, bd = 1e9;
        ui.hit.forEach(function (h) { const d = Math.hypot(px - h.x, py - h.y); if (d < h.r && d < bd) { bd = d; best = h; } });
        if (best && !best.here) requestRide(best.stop);
      });
      window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && shown) closeMenu(); });
    }

    function drawMenu() {
      const md = o.getMapData ? o.getMapData() : null;
      const cv = ui.cv, W = cv.clientWidth || 700, H = cv.clientHeight || 500, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const c = cv.getContext('2d');
      c.fillStyle = '#0b0e12'; c.fillRect(0, 0, cv.width, cv.height);
      const b = md ? md.bounds : { x0: -290, x1: 1060, z0: -320, z1: 2200 };
      const mg = 30 * dpr;
      const k = Math.min((cv.width - 2 * mg) / (b.x1 - b.x0), (cv.height - 2 * mg) / (b.z1 - b.z0));
      const ox = (cv.width - (b.x1 - b.x0) * k) / 2, oz = (cv.height - (b.z1 - b.z0) * k) / 2;
      const X = function (v) { return ox + (v - b.x0) * k; }, Z = function (v) { return oz + (v - b.z0) * k; };
      if (md && md.sea) { c.fillStyle = '#0d2230'; c.fillRect(X(b.x0), Z(md.sea.z0), (b.x1 - b.x0) * k, (b.z1 - md.sea.z0) * k); }
      if (md) {
        (md.lakes || []).forEach(function (l) { c.fillStyle = '#14303d'; c.beginPath(); c.arc(X(l.x), Z(l.z), l.r * k, 0, 6.3); c.fill(); });
        (md.roads || []).forEach(function (r) {
          const rail = r.w < 0;
          c.strokeStyle = rail ? '#6a6a72' : '#8f8a78'; c.lineWidth = Math.max(1.5 * dpr, (rail ? 3 : Math.abs(r.w)) * k * 1.4);
          c.setLineDash(rail ? [6 * dpr, 5 * dpr] : []);
          c.beginPath();
          r.pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0] != null ? p[0] : p.x), Z(p[1] != null ? p[1] : p.z)); else c.moveTo(X(p[0] != null ? p[0] : p.x), Z(p[1] != null ? p[1] : p.z)); });
          c.stroke();
        });
        c.setLineDash([]);
      }
      const here = hereStop();
      ui.hit = [];
      ui.row.innerHTML = '';
      stops.forEach(function (st) {
        const isHere = here && here.id === st.id;
        const R = 22 * dpr;
        const col = isHere ? '#6c6c6c' : '#f0d9a0';
        c.fillStyle = '#12161b'; c.strokeStyle = col; c.lineWidth = 2 * dpr;
        c.beginPath(); c.arc(X(st.x), Z(st.z), R, 0, 6.3); c.fill(); c.stroke();
        icon(c, st.type, X(st.x), Z(st.z), R * 0.7, col);
        ui.hit.push({ x: X(st.x), y: Z(st.z), r: R * 1.25, stop: st, here: isHere });
        const btn = document.createElement('button');
        btn.style.cssText = 'width:64px;height:56px;background:#14181d;border:1px solid ' + (isHere ? '#3a3a3a' : '#7a6e4c') + ';border-radius:10px;opacity:' + (isHere ? 0.4 : 1) + ';';
        const ic = document.createElement('canvas'); ic.width = 80; ic.height = 70; ic.style.cssText = 'width:40px;height:35px;';
        icon(ic.getContext('2d'), st.type, 40, 35, 26, col);
        btn.appendChild(ic);
        if (!isHere) btn.addEventListener('click', function () { requestRide(st); });
        ui.row.appendChild(btn);
      });
      // le taxi
      c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(X(cur.x), Z(cur.z), 6 * dpr, 0, 6.3); c.fill();
      c.strokeStyle = '#ffd23a'; c.lineWidth = 2 * dpr; c.beginPath(); c.arc(X(cur.x), Z(cur.z), 11 * dpr, 0, 6.3); c.stroke();
    }

  function hereStop() {
    let best = null, bd = 30;
    stops.forEach(function (st) { const d = Math.hypot(st.x - cur.x, st.z - cur.z); if (d < bd) { bd = d; best = st; } });
    return best;
  }
  function closeMenu() { hide(); if (cur && cur.onClose) cur.onClose(); }
  function requestRide(stop) { const c = cur; hide(); if (c && c.onChoose) c.onChoose(stop); }
  function hide() { shown = false; if (ui) ui.root.style.display = 'none'; }
  function open(opts) {
    cur = opts || {};
    if (!ui) buildUI();
    shown = true;
    ui.root.style.display = 'flex';
    drawMenu();
  }
  return { open: open, hide: hide, isOpen: function () { return shown; } };
}
