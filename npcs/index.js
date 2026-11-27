// npcs/index.js – TOUS LES PNJ : (1) la liste des fiches, (2) leur comportement sans IA (réponses, bavardage, routine).
// Remplace : l'ancien index.js, behavior.js et _template.js. Aucun import de « three » ici : society.js charge ce fichier sur des pages sans three.
// Le 3D des PNJ est dans npcs/bodies.js.
//
// Une fiche = un fichier npcs/<id>.js (apparence + dialogues + métier du PNJ). Les fiches ne doivent JAMAIS importer « three » au début du fichier.
// POUR AJOUTER UN PNJ : copie le modèle ci-dessous dans npcs/<id>.js, remplis-le, puis ajoute-le dans la liste (import + NPCS).
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH.
//
// ─── MODÈLE DE FICHE ───
//   //
//   // Tout ce qui touche à ce personnage est ICI : apparence, dialogues, routine. Rien d'autre à modifier dans le moteur.
//
//   export default {
//       id: 'monpnj',            // identique à l'id de l'acteur dans society.js (R.addActor({ id: 'monpnj', ... }))
//       name: 'My NPC',
//       job: 'none',
//
//       // ───────── CORPS (npcs/driver.js, section « Le corps ») ─────────
//       height: 1.75,
//       look: {
//           skin: '#d8b08c', shirt: '#6b7a8f', pants: '#2a2a30', hair: '#3a2a1a',
//           hairStyle: 'short',  // 'short' | 'long' | 'bun' | 'bald'
//           // hat: 'cap', hatColor: '#1f2f55',
//           // beard: '#2a1a0a',          // couleur de barbe (absent = pas de barbe)
//           // glasses: true,
//           // widen: 1.1                 // 1 = normal, plus grand = plus large
//       },
//       // Optionnel : change la forme à la main. body.parts = { hips, torso, head, armL, armR, legL, legR }, body.mats = { skin, shirt, pants, hair, shoe }
//       // customize(body, THREE) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), body.mats.shirt); m.position.set(0, 0.3, 0.12); body.parts.torso.add(m); },
//
//       // ───────── VÉHICULE / POSTE (au choix, ou rien) ─────────
//       // vehicle: 'taxi' | 'bus' | 'police',     // il conduit ce véhicule quand son métier (actor.job) est le même
//       // post: 'BadTherapistGas',                // un lieu pilote son corps (window[post].pose())
//
//       // ───────── DIALOGUES (anglais) ─────────
//       lines: {
//           greet: ['Hello.'],                    // quand tu arrives près de lui
//           idle: ['...'],                        // de temps en temps, tout seul
//           work: [],                             // phrases liées à son travail (mélangées aux idle)
//           reply: ['Hm.'],                       // quand tu lui réponds (clic sur lui)
//           fallback: ['...'],
//           answers: [                            // réponses selon un mot de ta phrase (regex SANS le drapeau g)
//               // { when: /weather|snow/i, say: ['Cold, isn\'t it?'] }
//           ]
//       },
//
//       // ───────── ROUTINE (actions déjà existantes dans society.js : go_to, start_job, stop_job, use_object, say, wait) ─────────
//       // Trie par heure. Heure du jeu si window.BadTherapistGameTime existe, sinon heure réelle.
//       routine: [
//           // { at: '09:00', do: 'go_to', args: { place: 'street_front' } },
//       ]
//   };
//
// ─── FIN DU MODÈLE ───

import leon from './leon.js';
import lou from './lou.js';
import oliver from './oliver.js';
import violet from './violet.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA LISTE
// ═══════════════════════════════════════════════════════════════════════════

export const NPCS = { leon: leon, lou: lou, oliver: oliver, violet: violet };
export const NPC_IDS = Object.keys(NPCS);
export function isNpc(id) { return Object.prototype.hasOwnProperty.call(NPCS, id); }

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE COMPORTEMENT (ex- npcs/behavior.js)
// ═══════════════════════════════════════════════════════════════════════════

// (ex- npcs/behavior.js) – fait vivre les PNJ (tous les personnages de npcs/, SAUF Evelyn) SANS aucune IA.
//
// Ce qu'il fait, à partir de la fiche de chaque PNJ (npcs/<id>.js) :
//   • RÉPONSES : quand tu lui parles (clic sur lui, puis tu écris), il répond avec une phrase de sa fiche
//     (lines.answers si un mot correspond, sinon lines.reply). Toujours une réponse, jamais de « ... » qui tourne 40 s.
//   • BAVARDAGE : quand tu arrives près de lui il te salue (lines.greet) ; de temps en temps il dit une phrase (lines.idle / lines.work).
//   • ROUTINE : il exécute les actions de sa fiche (routine) à l'heure dite, avec les capacités déjà existantes de society.js
//     (go_to, start_job, stop_job, use_object...). Aucune nouvelle capacité à écrire.
// Aucun appel au Worker, aucune mémoire, aucun quota consommé.
//
// ALL TEXT SHOWN IN THE GAME MUST BE IN ENGLISH (it comes from the sheets in npcs/).

const TICK_MS = 2000;
const REGREET_MS = 120000;          // il ne te resalue pas avant 2 min
const AMBIENT_MIN = 40000, AMBIENT_MAX = 90000;

const state = {};
function st(id) { return state[id] || (state[id] = { last: '', here: false, greetedAt: 0, nextAmbient: 0, idx: undefined }); }

function pick(arr, last) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return arr[0];
    let s, n = 0;
    do { s = arr[Math.floor(Math.random() * arr.length)]; } while (s === last && n++ < 6);
    return s;
}
function toMin(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm)); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
// heure du jeu si elle existe (« ... 14:30 ... »), sinon l'heure réelle
function clockMinutes() {
    try {
        const g = window.BadTherapistGameTime ? String(window.BadTherapistGameTime() || '') : '';
        const m = /(\d{1,2})[:h](\d{2})/.exec(g);
        if (m) return (+m[1]) * 60 + (+m[2]);
    } catch (e) { /* heure réelle */ }
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

export function startNpcs(R, M) {
    // le texte sort par le même chemin que celui des avatars : R.emit('speech') -> bulle au-dessus de sa tête (engine/evelyn-core.js, section Dialogue)
    function speak(actor, text, toIds, greet) {   // (M = messagerie : voir plus bas)
        if (!text) return;
        const now = Date.now();
        actor.speakingUntil = now + 4000;                    // avatar-body : animation « talk » pendant ce temps
        if (greet) actor.greetUntil = now + 2500;            // avatar-body : animation « greet » (il lève la main)
        st(actor.id).last = text;
        R.emit('speech', { actor: actor, text: text, to: toIds || [] });
        // Evelyn (et tout avatar à cerveau) ENTEND le PNJ comme toi : la phrase arrive dans sa perception. Elle ne la réveille pas
        // (society.js, npcSpoke : seule une vraie question « ? » peut la réveiller, au plus une fois par minute).
        const hear = {};
        (toIds || []).forEach(function (id) { hear[id] = 1; });
        try { R.nearby(actor).forEach(function (x) { hear[x.id] = 1; }); } catch (e) { /* pas de R.nearby : seulement les destinataires */ }
        Object.keys(hear).forEach(function (id) {
            const x = R.actor(id);
            if (!x || !x.thinks || x.isPlayer || x.id === actor.id) return;
            try { M.send(actor.id, id, text, { kind: 'say' }); } catch (e) { /* rien */ }
        });
    }

    // ─── il te répond (tu lui parles en face à face) ───
    R.on('message', function (m) {
        if (!m || m.kind !== 'say') return;
        const to = R.actor(m.to), from = R.actor(m.from);
        if (!to || !from || !isNpc(to.id)) return;
        try { if (M.markRead) M.markRead(to.id, from.id); } catch (e) { /* rien */ }
        const L = NPCS[to.id].lines || {};
        let pool = null;
        (L.answers || []).some(function (a) { if (a && a.when && a.when.test(String(m.text || ''))) { pool = a.say; return true; } return false; });
        pool = (pool && pool.length) ? pool : ((L.reply && L.reply.length) ? L.reply : L.fallback);
        const text = pick(pool, st(to.id).last) || '...';
        setTimeout(function () { speak(to, text, [from.id], false); }, 500 + Math.random() * 700);
    });

    // ─── routine : une action de la fiche à chaque changement d'heure ───
    function routineStep(a, sheet, s) {
        const rt = sheet.routine;
        if (!rt || !rt.length) return;
        if (a.travel || a.busyUntil > Date.now()) return;
        const now = clockMinutes();
        let idx = -1;
        for (let i = 0; i < rt.length; i++) if (toMin(rt[i].at) <= now) idx = i;     // la routine doit être triée par heure
        if (idx === -1) idx = rt.length - 1;                                          // avant la 1re entrée : on est encore dans celle de la veille
        if (idx === s.idx) return;
        const first = s.idx === undefined;
        s.idx = idx;
        const e = rt[idx];
        if (first) {                                                                  // au démarrage : il est déjà là où la routine le veut (il ne traverse pas la carte)
            if (e.do === 'go_to' && e.args && R.place(e.args.place)) { a.loc = e.args.place; R.save(); }
            return;
        }
        R.run(a, e.do, e.args || {}).then(function (res) { console.log('[npc ' + a.id + '] ' + e.at + ' ' + e.do + ' -> ' + res); });
    }

    // ─── bavardage + routine ───
    setInterval(function () {
        const now = Date.now(), p = R.actor('player');
        R.actors().forEach(function (a) {
            if (!isNpc(a.id)) return;
            const sheet = NPCS[a.id], s = st(a.id), L = sheet.lines || {};
            routineStep(a, sheet, s);

            const here = !!p && p.loc === a.loc && !a.travel && !a.ride;
            if (here && !s.here && now - s.greetedAt > REGREET_MS && L.greet && L.greet.length) {
                s.greetedAt = now;
                s.nextAmbient = now + AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
                speak(a, pick(L.greet, s.last), [p.id], true);
            } else if (here && now >= s.nextAmbient) {
                s.nextAmbient = now + AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
                const pool = (L.work && L.work.length && Math.random() < 0.5) ? L.work : L.idle;
                if (pool && pool.length) speak(a, pick(pool, s.last), [p.id], false);
            }
            s.here = here;
        });
    }, TICK_MS);

    window.BadTherapistNpcs = { sheets: NPCS, state: state };      // F12 : BadTherapistNpcs.sheets.lou.lines
}
