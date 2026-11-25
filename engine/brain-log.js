// brain-log.js – l'ENREGISTREUR du cerveau des avatars : il garde, pour chaque réflexion d'Evelyn,
//   • ce qu'elle a perçu (le texte exact envoyé à l'IA),
//   • ce que l'IA a répondu (brut), sa pensée, son ressenti, ce qu'elle a écrit dans sa tête (mind),
//   • les actions tentées ET ce que le monde a répondu (« refusé », « fait »...),
//   • la durée, la taille envoyée (≈ quota), les erreurs,
//   • et les moments où elle N'A PAS réfléchi, avec la raison (rien de neuf, budget atteint, occupée...).
// Il est fait pour être ENVOYÉ À CLAUDE : tu joues 10 minutes, tu télécharges le journal, tu me l'envoies, et je vois comment elle pense.
//
// Utilisation (console du navigateur, F12) :
//     BadTherapistBrainLog.download()      -> télécharge un fichier texte (les 25 dernières réflexions)
//     BadTherapistBrainLog.download(60)    -> les 60 dernières
//     BadTherapistBrainLog.show(5)         -> affiche les 5 dernières dans la console
//     BadTherapistBrainLog.clear()         -> repart de zéro
// Raccourci clavier : Ctrl + Alt + B = télécharger le journal.
// Rien n'est envoyé nulle part : tout reste dans ton navigateur (localStorage) jusqu'à ce que TU télécharges le fichier.

const KEY = 'bt_brainlog_v1';
const MAX_ENTRIES = 60;          // réflexions gardées
const MAX_SKIPS = 80;            // « elle n'a pas réfléchi » gardés
const MAX_RAW = 5000;            // caractères gardés de la réponse brute
const MAX_USER = 9000;           // caractères gardés de la perception
const MAX_SYSTEM = 20000;        // le prompt système n'est gardé qu'une fois par avatar (le dernier)

function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
function lsSet(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '\n[... coupé : ' + (s.length - n) + ' caractères de plus]' : s; }
function hhmmss(t) { const d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }

export function createBrainLog() {
    const saved = lsGet() || {};
    let entries = Array.isArray(saved.entries) ? saved.entries : [];
    let skips = Array.isArray(saved.skips) ? saved.skips : [];
    const systems = (saved.systems && typeof saved.systems === 'object') ? saved.systems : {};
    let saveT = null;

    function persist() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            let ok = lsSet({ entries: entries, skips: skips, systems: systems });
            while (!ok && entries.length > 5) { entries = entries.slice(Math.ceil(entries.length / 4)); ok = lsSet({ entries: entries, skips: skips, systems: systems }); }   // navigateur plein : on garde le plus récent
        }, 800);
    }

    // ─── Une réflexion : begin -> (raw | fail) -> action* -> end ───
    function begin(id, kind, system, user) {
        const e = { at: Date.now(), id: id, kind: kind || 'manual', sysChars: String(system || '').length, userChars: String(user || '').length, user: clip(user, MAX_USER), raw: '', ms: 0, thought: '', feeling: '', mind: null, actions: [], err: '' };
        systems[id] = { at: e.at, text: clip(system, MAX_SYSTEM) };
        const h = {
            raw: function (raw, ms) { e.raw = clip(raw, MAX_RAW); e.ms = ms || 0; },
            fail: function (err) { e.err = String(err && err.message || err || 'erreur').slice(0, 300); push(); },
            action: function (a, res) {
                const args = {}; Object.keys(a || {}).forEach(function (k) { if (k !== 'do') args[k] = typeof a[k] === 'string' ? a[k].slice(0, 200) : a[k]; });
                e.actions.push({ do: a && a.do, args: args, res: String(res == null ? '' : res).slice(0, 300) });
            },
            end: function (plan) {
                e.thought = String((plan && plan.thought) || '').slice(0, 500);
                const m = (plan && plan.mind) || null;
                if (m) { e.feeling = String(m.feeling || '').slice(0, 200); e.mind = JSON.parse(JSON.stringify(m, function (k, v) { return typeof v === 'string' ? v.slice(0, 300) : v; })); }
                push();
            }
        };
        let pushed = false;
        function push() { if (pushed) return; pushed = true; entries.push(e); while (entries.length > MAX_ENTRIES) entries.shift(); persist(); }
        return h;
    }

    // ─── Quand elle n'a PAS réfléchi (une ligne par raison, avec un compteur) ───
    function skip(id, reason) {
        const last = skips[skips.length - 1];
        if (last && last.id === id && last.reason === reason && Date.now() - last.at < 10 * 60000) { last.n++; last.until = Date.now(); persist(); return; }
        skips.push({ at: Date.now(), until: Date.now(), id: id, reason: String(reason).slice(0, 200), n: 1 });
        while (skips.length > MAX_SKIPS) skips.shift();
        persist();
    }

    // ─── Rapport lisible ───
    function text(n) {
        n = n || 25;
        const L = [];
        L.push('JOURNAL DU CERVEAU – ' + new Date().toLocaleString('fr-FR') + ' – ' + entries.length + ' réflexions gardées, ' + n + ' affichées');
        L.push('');
        const ids = Object.keys(systems);
        ids.forEach(function (id) {
            L.push('=== PROMPT SYSTÈME de « ' + id + ' » (' + hhmmss(systems[id].at) + ', ' + systems[id].text.length + ' car.) ===');
            L.push(systems[id].text);
            L.push('');
        });
        const list = entries.slice(-n);
        const totalChars = list.reduce(function (s, e) { return s + e.sysChars + e.userChars; }, 0);
        L.push('=== RÉSUMÉ : ' + list.length + ' réflexions, ≈ ' + Math.round(totalChars / 4) + ' tokens envoyés au total (≈ 4 caractères par token), durée moyenne ' + (list.length ? Math.round(list.reduce(function (s, e) { return s + e.ms; }, 0) / list.length) : 0) + ' ms ===');
        const kinds = {}; list.forEach(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
        L.push('Par type : ' + Object.keys(kinds).map(function (k) { return k + ' ×' + kinds[k]; }).join(', '));
        L.push('');
        list.forEach(function (e, i) {
            L.push('────────── RÉFLEXION ' + (i + 1) + ' – ' + hhmmss(e.at) + ' – ' + e.id + ' – type « ' + e.kind + ' » – ' + e.ms + ' ms – envoyé ≈ ' + Math.round((e.sysChars + e.userChars) / 4) + ' tokens ──────────');
            L.push('[CE QU\'ELLE A PERÇU]');
            L.push(e.user);
            L.push('[RÉPONSE BRUTE DE L\'IA]');
            L.push(e.raw || '(aucune)');
            if (e.err) L.push('[ERREUR] ' + e.err);
            L.push('[PENSÉE] ' + (e.thought || '(vide)') + (e.feeling ? '   [RESSENT] ' + e.feeling : ''));
            if (e.mind) L.push('[MIND] ' + JSON.stringify(e.mind));
            e.actions.forEach(function (a) { L.push('[ACTION] ' + a.do + ' ' + JSON.stringify(a.args) + '  ->  ' + a.res); });
            if (!e.actions.length && !e.err) L.push('[ACTION] (aucune)');
            L.push('');
        });
        if (skips.length) {
            L.push('=== QUAND ELLE N\'A PAS RÉFLÉCHI (les 40 dernières raisons) ===');
            skips.slice(-40).forEach(function (s) { L.push(hhmmss(s.at) + (s.n > 1 ? '–' + hhmmss(s.until) : '') + ' ' + s.id + ' : ' + s.reason + (s.n > 1 ? ' (×' + s.n + ')' : '')); });
        }
        return L.join('\n');
    }

    function download(n) {
        try {
            const blob = new Blob([text(n)], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            const d = new Date();
            a.href = URL.createObjectURL(blob);
            a.download = 'cerveau-evelyn-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.txt';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            return 'téléchargé';
        } catch (e) { return 'échec : ' + (e && e.message || e); }
    }

    function show(n) { console.log(text(n || 5)); }
    function clear() { entries = []; skips = []; Object.keys(systems).forEach(function (k) { delete systems[k]; }); lsSet({ entries: [], skips: [], systems: {} }); }

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', function (ev) { if (ev.ctrlKey && ev.altKey && (ev.key === 'b' || ev.key === 'B')) { ev.preventDefault(); download(); } });
    }

    return { begin: begin, skip: skip, text: text, download: download, show: show, clear: clear, entries: function () { return entries.slice(); }, skips: function () { return skips.slice(); } };
}
