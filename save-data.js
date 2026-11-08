// save-data.js – toute la sauvegarde du jeu, définie à UN seul endroit.
// À charger dans index.html, settings.html ET world_base.html (avant les autres scripts).
//
// DEUX PROFILS SÉPARÉS, stockés dans des clés DIFFÉRENTES du navigateur (plus aucun échange de données) :
//   - « player » : clés d'origine (lmtd_save_v3, bt_journal, ...)         -> ce que PLAY lance en mode joueur
//   - « admin »  : mêmes clés + suffixe « _admin » (bt_journal_admin, ...) -> ce que PLAY lance en mode admin (l'œil)
//
// Comment le mélange est évité :
//   - chaque page lit/écrit TOUJOURS dans le profil qu'elle avait au moment de son chargement.
//     Une page de jeu restée ouverte (autre onglet, retour arrière) ne peut donc jamais écrire dans l'autre profil ;
//   - le code du jeu n'a pas à changer : localStorage.getItem/setItem sont redirigés ici, de façon transparente,
//     pour les clés de sauvegarde (le volume et le mode muet restent communs) ;
//   - basculer de profil = changer un simple indicateur, aucune donnée n'est copiée ni supprimée ;
//   - RESET DATA ne touche jamais au profil admin.
//
// Une nouvelle donnée à sauvegarder ? Ajoute-la dans KEYS : export, import, reset et profils la prennent en compte.

(function () {
    'use strict';

    // champ du fichier JSON  →  clé dans le navigateur (localStorage), profil joueur
    const KEYS = {
        save:      'lmtd_save_v3',
        volume:    'lmtd_volume',
        muted:     'lmtd_muted',
        chapters:  'lmtd_chapters_v1',
        endings:   'lmtd_endings_seen_v1',
        gameFlags: 'lmtd_gameFlags',
        player:    'bt_player_state',     // position du joueur dans le jeu 3D
        book:      'bt_journal',          // le livre du tiroir
        evelyn:    'bt_evelyn_memory'     // la mémoire d'Evelyn (la thérapeute) : voir therapist-memory.js
    };

    // valeurs écrites dans l'export quand il n'y a encore rien
    const EXPORT_DEFAULTS = { volume: '0.7', muted: '0', chapters: '[]', endings: '[]', gameFlags: '{}' };

    // Le volume et le mode muet ne sont pas de la progression : communs aux deux profils
    const PREFS = { volume: true, muted: true };
    const PROGRESS = Object.keys(KEYS).filter(function (f) { return !PREFS[f]; });

    const PUSHED_FILE = 'json/bad-therapist-save.json';
    const FP_KEY = 'bt_admin_fp';              // empreinte de la sauvegarde admin au dernier chargement / export
    const ACTIVE_KEY = 'bt_active_profile';    // 'player' (par défaut) ou 'admin' : le mode choisi dans le menu
    const MIGRATED_KEY = 'bt_profiles_v2';
    const OLD_SLOT = { player: 'bt_profile_player', admin: 'bt_profile_admin' };   // ancien système (migration)

    // ─── Accès direct au stockage (sans redirection) ────────────────
    const proto = Storage.prototype;
    const origGet = proto.getItem;
    const origSet = proto.setItem;
    const origRemove = proto.removeItem;

    const rawGet = function (k) { return origGet.call(localStorage, k); };
    const rawSet = function (k, v) { origSet.call(localStorage, k, v); };
    const rawRemove = function (k) { origRemove.call(localStorage, k); };

    function parse(str) {
        try { return JSON.parse(str); } catch (e) { return undefined; }
    }

    // Vérifications minimales pour ne jamais écrire un contenu cassé
    const VALID = {
        player: function (o) { return !!(o && typeof o === 'object' && o.worlds); },
        book:   function (o) { return !!(o && Array.isArray(o.pages)); },
        evelyn: function (o) { return !!(o && typeof o === 'object' && !Array.isArray(o) && o.v); }
    };

    // ─── Profil de CETTE page ───────────────────────────────────────
    function readMode() {
        return rawGet(ACTIVE_KEY) === 'admin' ? 'admin' : 'player';
    }

    let pageProfile = readMode();     // figé au chargement de la page (le menu le change quand on clique sur l'œil)

    function physKey(field, profile) {
        return profile === 'admin' && !PREFS[field] ? KEYS[field] + '_admin' : KEYS[field];
    }

    // clé du navigateur -> champ, pour la redirection
    const FIELD_OF = {};
    Object.keys(KEYS).forEach(function (f) { if (!PREFS[f]) FIELD_OF[KEYS[f]] = f; });

    // Le jeu écrit toujours « lmtd_save_v3 », « bt_journal »... : on les envoie dans le profil de la page
    proto.getItem = function (k) {
        if (this === localStorage && FIELD_OF[k]) k = physKey(FIELD_OF[k], pageProfile);
        return origGet.call(this, k);
    };
    proto.setItem = function (k, v) {
        if (this === localStorage && FIELD_OF[k]) k = physKey(FIELD_OF[k], pageProfile);
        return origSet.call(this, k, v);
    };
    proto.removeItem = function (k) {
        if (this === localStorage && FIELD_OF[k]) k = physKey(FIELD_OF[k], pageProfile);
        return origRemove.call(this, k);
    };

    // ─── Migration depuis l'ancien système (échange de données entre profils) ───
    function migrate() {
        if (rawGet(MIGRATED_KEY) === '1') return;
        const oldActive = rawGet(ACTIVE_KEY) === 'admin' ? 'admin' : 'player';
        const other = oldActive === 'admin' ? 'player' : 'admin';
        const stored = parse(rawGet(OLD_SLOT[other])) || {};

        PROGRESS.forEach(function (f) {
            const live = rawGet(KEYS[f]);                       // contenait le profil actif de l'ancien système
            const aside = typeof stored[f] === 'string' && stored[f] !== '' ? stored[f] : null;
            const forAdmin = oldActive === 'admin' ? live : aside;
            const forPlayer = oldActive === 'admin' ? aside : live;

            if (forAdmin) rawSet(physKey(f, 'admin'), forAdmin); else rawRemove(physKey(f, 'admin'));
            if (forPlayer) rawSet(physKey(f, 'player'), forPlayer); else rawRemove(physKey(f, 'player'));
        });

        rawRemove(OLD_SLOT.player);
        rawRemove(OLD_SLOT.admin);
        rawRemove('bt_admin_base');
        rawSet(MIGRATED_KEY, '1');
    }
    try { migrate(); } catch (e) { console.warn('save-data: migration impossible', e); }

    // ─── Lire / écrire la progression d'un profil ───────────────────
    function snapshot(profile) {
        const snap = {};
        PROGRESS.forEach(function (f) { snap[f] = rawGet(physKey(f, profile)) || ''; });
        return snap;
    }

    function writeProgress(profile, data) {
        PROGRESS.forEach(function (f) {
            const v = data ? data[f] : undefined;
            const ok = typeof v === 'string' && v !== '' && (!VALID[f] || VALID[f](parse(v)));
            if (ok) rawSet(physKey(f, profile), v);
            else rawRemove(physKey(f, profile));          // rien (ou invalide) : on repart de zéro
        });
    }

    function hasProgressIn(d) {
        d = d || {};
        const filled = function (str) {
            const v = parse(str);
            if (Array.isArray(v)) return v.length > 0;
            return !!(v && typeof v === 'object' && Object.keys(v).length);
        };
        if (d.save || d.player) return true;
        const ev = parse(d.evelyn);
        if (ev && ev.sessions > 0) return true;          // Evelyn a déjà reçu le joueur
        if (filled(d.chapters) || filled(d.endings) || filled(d.gameFlags)) return true;
        const book = parse(d.book);
        return !!(book && Array.isArray(book.pages) && book.pages.some(function (t) { return String(t).trim() !== ''; }));
    }

    function hasProgress(profile) {
        return hasProgressIn(snapshot(profile || pageProfile));
    }

    // ─── Mode actif (menu) ──────────────────────────────────────────
    function activeProfile() {
        return pageProfile;
    }

    // Bascule le mode : un indicateur, rien d'autre. Aucune donnée n'est déplacée.
    function switchTo(target) {
        if (target !== 'player' && target !== 'admin') return;
        pageProfile = target;
        rawSet(ACTIVE_KEY, target);
    }

    // Relit le mode (page du menu revenue du cache de retour arrière)
    function syncMode() {
        pageProfile = readMode();
        return pageProfile;
    }

    // ─── Export / import (toujours sur le profil de la page) ────────
    function collect() {
        const data = { exportedAt: Date.now() };
        Object.keys(KEYS).forEach(function (field) {
            const v = rawGet(physKey(field, pageProfile));
            data[field] = v ? v : (EXPORT_DEFAULTS[field] !== undefined ? EXPORT_DEFAULTS[field] : '');
        });
        return data;
    }

    function apply(data) {
        Object.keys(KEYS).forEach(function (field) {
            if (!PREFS[field]) return;
            const v = data[field];
            if (v !== undefined && v !== null) rawSet(KEYS[field], String(v));
        });
        writeProgress(pageProfile, data);
    }

    // La partie du joueur devient ta sauvegarde admin ; PLAY (mode joueur) repartira de zéro
    function adoptAsAdmin() {
        writeProgress('admin', snapshot('player'));
        writeProgress('player', null);
        switchTo('admin');
    }

    // RESET DATA : le profil JOUEUR repart de zéro. Le profil admin n'est jamais touché.
    function resetPlayer() {
        writeProgress('player', null);
        switchTo('player');
    }

    // ─── Admin : sauvegarde publiée + progression non exportée ──────
    // Empreinte : sert à savoir si la sauvegarde admin a changé depuis le dernier chargement du fichier poussé /
    // dernier export. On ignore la position du joueur et la page ouverte du livre.
    function fingerprint(d) {
        d = d || {};
        const book = parse(d.book);
        return JSON.stringify([
            d.save || '', d.chapters || '', d.endings || '', d.gameFlags || '', d.evelyn || '',
            book && Array.isArray(book.pages) ? book.pages : []
        ]);
    }

    // « La sauvegarde admin actuelle est la référence » (appelé après chargement du fichier poussé ou export)
    function markAdminClean() {
        rawSet(FP_KEY, fingerprint(snapshot('admin')));
    }

    function adminHasUnexported() {
        const admin = snapshot('admin');
        if (!hasProgressIn(admin)) return false;
        const fp = rawGet(FP_KEY);
        return fp === null || fp !== fingerprint(admin);   // jamais marquée = on la protège
    }

    // Lit la sauvegarde publiée (json/bad-therapist-save.json), ou null si elle n'existe pas
    function fetchPushed() {
        return fetch(PUSHED_FILE + '?v=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { return d && typeof d === 'object' && !Array.isArray(d) ? d : null; })
            .catch(function () { return null; });
    }

    // Que fait l'œil ?
    //   'continue' : progression admin pas encore exportée dans ce navigateur -> on la garde (jamais écrasée)
    //   'load'     : sinon, on charge TOUJOURS la sauvegarde poussée (json/bad-therapist-save.json)
    //   'adopt'    : rien de poussé, mais une partie joueur en cours -> proposer d'en faire ta sauvegarde admin
    //   'missing'  : rien du tout
    function adminPlan(pushed) {
        if (adminHasUnexported()) return 'continue';
        if (pushed) return 'load';
        if (hasProgress('admin')) return 'continue';
        return hasProgress('player') ? 'adopt' : 'missing';
    }

    window.BadTherapistSave = {
        KEYS: KEYS,
        PUSHED_FILE: PUSHED_FILE,
        collect: collect,
        apply: apply,
        hasProgress: hasProgress,
        activeProfile: activeProfile,
        syncMode: syncMode,
        switchTo: switchTo,
        adoptAsAdmin: adoptAsAdmin,
        resetPlayer: resetPlayer,
        fetchPushed: fetchPushed,
        adminPlan: adminPlan,
        markAdminClean: markAdminClean
    };
})();
