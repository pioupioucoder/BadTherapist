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
        const field = this === localStorage ? FIELD_OF[k] : undefined;
        if (field) k = physKey(field, pageProfile);
        const result = origSet.call(this, k, v);
        // profil admin : toute écriture de progression (sauf la simple position du joueur) planifie une synchro
        if (field && field !== 'player' && pageProfile === 'admin') scheduleSync();
        return result;
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

    // ─── Synchronisation automatique du profil ADMIN (compte Google via Firebase, gratuit) ───
    // Colle ici la config de ton projet Firebase (ces valeurs ne sont PAS secrètes : la sécurité vient
    // des règles Firestore, qui n'autorisent que TON compte Google). Voir les étapes données dans le chat.
    const FIREBASE_CONFIG = {
        apiKey: 'AIzaSyCDF19H621_R0mJcYWAbHfGVADqUPQTb68',
        authDomain: 'badtherapist-7bc8a.firebaseapp.com',
        projectId: 'badtherapist-7bc8a',
        appId: '1:986871133548:web:8584ac9d59411d00d72f49'
    };

    const FB_VERSION = '10.14.1';
    const FB_COLLECTION = 'adminSave';          // meta + un document par morceau de champ
    const CHUNK_SIZE = 700000;                  // un document Firestore est limité à ~1 Mo : on découpe
    const SYNC_ON_KEY = 'bt_sync_on';           // '1' = ce navigateur est connecté à la synchro
    const SYNC_REV_KEY = 'bt_sync_rev';         // dernière version du cloud vue par CE navigateur
    const SYNC_DIRTY_KEY = 'bt_sync_dirty';     // '1' = changements locaux pas encore envoyés
    const SYNC_DELAY = 5000;                    // délai avant envoi automatique (ms)
    const lastPushed = {};                      // champ -> dernière valeur connue du cloud
    let fbPromise = null;
    let syncTimer = null;
    let syncBusy = false;

    function syncAvailable() {
        return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
    }

    function syncIsDirty() { return rawGet(SYNC_DIRTY_KEY) === '1'; }

    // Firebase est chargé à la demande (rien n'est téléchargé pour un joueur normal)
    function loadFirebase() {
        if (!fbPromise) {
            const base = 'https://www.gstatic.com/firebasejs/' + FB_VERSION + '/';
            fbPromise = Promise.all([
                import(base + 'firebase-app.js'),
                import(base + 'firebase-auth.js'),
                import(base + 'firebase-firestore.js')
            ]).then(function (m) {
                const app = m[0].initializeApp(FIREBASE_CONFIG);
                return { auth: m[1].getAuth(app), a: m[1], db: m[2].getFirestore(app), f: m[2] };
            });
            fbPromise.catch(function () { fbPromise = null; });
        }
        return fbPromise;
    }

    async function currentUser() {
        const fb = await loadFirebase();
        await fb.auth.authStateReady();
        if (fb.auth.currentUser) rawSet(SYNC_ON_KEY, '1');
        return fb.auth.currentUser;
    }

    function errCode(e) { return (e && (e.code || e.message)) || 'error'; }

    // { available, user: email | null }
    async function syncStatus() {
        if (!syncAvailable()) return { available: false, user: null };
        try {
            const user = await currentUser();
            return { available: true, user: user ? (user.email || 'Google account') : null };
        } catch (e) {
            return { available: true, user: null, error: errCode(e) };
        }
    }

    async function syncSignIn() {
        if (!syncAvailable()) return { ok: false, error: 'not-configured' };
        try {
            const fb = await loadFirebase();
            const provider = new fb.a.GoogleAuthProvider();
            try {
                await fb.a.signInWithPopup(fb.auth, provider);
            } catch (e) {
                const c = errCode(e);
                if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') {
                    await fb.a.signInWithRedirect(fb.auth, provider);   // téléphone : la page est quittée puis revient
                    return { ok: true, redirect: true };
                }
                throw e;
            }
            rawSet(SYNC_ON_KEY, '1');
            return { ok: true };
        } catch (e) {
            return { ok: false, error: errCode(e) };
        }
    }

    async function syncSignOut() {
        try {
            const fb = await loadFirebase();
            await fb.a.signOut(fb.auth);
        } catch (e) { /* on déconnecte quand même localement */ }
        [SYNC_ON_KEY, SYNC_REV_KEY, SYNC_DIRTY_KEY].forEach(rawRemove);
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function pack(str) {
        const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
        return new Response(stream).blob().then(blobToBase64);
    }

    function unpack(b64) {
        const bin = atob(String(b64).trim());
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text();
    }

    function scheduleSync() {
        if (!syncAvailable() || rawGet(SYNC_ON_KEY) !== '1') return;
        rawSet(SYNC_DIRTY_KEY, '1');
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () { syncPush().catch(function () {}); }, SYNC_DELAY);
    }

    // Envoie le profil admin vers le cloud.
    // Résultat : { ok:true } | { ok:false, conflict:true } | { ok:false, error:'...' }
    // force = true : écrase le cloud sans vérifier (après confirmation)
    async function syncPush(force) {
        if (!syncAvailable()) return { ok: false, error: 'not-configured' };
        if (syncBusy) return { ok: false, error: 'busy' };
        syncBusy = true;
        try {
            const user = await currentUser();
            if (!user) return { ok: false, error: 'signed-out' };

            const snap = snapshot('admin');
            if (!hasProgressIn(snap)) return { ok: true, nothing: true };   // jamais écraser le cloud avec du vide

            const fb = await loadFirebase();
            const f = fb.f;
            const metaRef = f.doc(fb.db, FB_COLLECTION, 'meta');
            const metaSnap = await f.getDoc(metaRef);
            const meta = metaSnap.exists() ? metaSnap.data() : null;
            const rev = rawGet(SYNC_REV_KEY);
            if (!force && meta && String(meta.rev) !== rev) return { ok: false, conflict: true };

            const inSync = !!meta && String(meta.rev) === rev;
            const chunks = Object.assign({}, meta && meta.chunks);

            for (const field of PROGRESS) {
                const v = snap[field];
                if (inSync && lastPushed[field] === v) continue;            // inchangé depuis le dernier envoi
                const oldCount = chunks[field] || 0;
                const packed = v === '' ? '' : await pack(v);
                const count = packed === '' ? 0 : Math.ceil(packed.length / CHUNK_SIZE);
                for (let i = 0; i < count; i++) {
                    await f.setDoc(f.doc(fb.db, FB_COLLECTION, field + '__' + i),
                        { d: packed.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
                }
                for (let i = count; i < oldCount; i++) {
                    await f.deleteDoc(f.doc(fb.db, FB_COLLECTION, field + '__' + i));
                }
                chunks[field] = count;
            }

            const newRev = String(Date.now());
            await f.setDoc(metaRef, { rev: newRev, chunks: chunks });    // en dernier : les autres appareils ne voient la nouvelle version qu'une fois tout écrit

            PROGRESS.forEach(function (field) { lastPushed[field] = snap[field]; });
            rawSet(SYNC_REV_KEY, newRev);
            rawRemove(SYNC_DIRTY_KEY);
            markAdminClean();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: errCode(e) };
        } finally {
            syncBusy = false;
        }
    }

    // Télécharge le cloud dans le profil admin (écrase la progression admin locale).
    // onlyIfClean = true : abandonne si le jeu a écrit quelque chose entre-temps.
    // Résultat : { ok:true, empty? } | { ok:false, error:'...' }
    async function syncPull(onlyIfClean) {
        if (!syncAvailable()) return { ok: false, error: 'not-configured' };
        try {
            const user = await currentUser();
            if (!user) return { ok: false, error: 'signed-out' };

            const fb = await loadFirebase();
            const f = fb.f;
            const metaSnap = await f.getDoc(f.doc(fb.db, FB_COLLECTION, 'meta'));
            if (!metaSnap.exists()) return { ok: true, empty: true };
            const meta = metaSnap.data();

            const data = {};
            let found = 0;
            for (const field of PROGRESS) {
                const count = (meta.chunks && meta.chunks[field]) || 0;
                if (!count) continue;
                let packed = '';
                for (let i = 0; i < count; i++) {
                    const part = await f.getDoc(f.doc(fb.db, FB_COLLECTION, field + '__' + i));
                    if (!part.exists()) throw new Error('missing-chunk');
                    packed += part.data().d;
                }
                data[field] = await unpack(packed);
                found++;
            }
            if (!found) return { ok: true, empty: true };    // cloud vide : on ne touche à rien en local
            if (onlyIfClean && syncIsDirty()) return { ok: false, error: 'dirty' };

            writeProgress('admin', data);
            PROGRESS.forEach(function (field) { lastPushed[field] = data[field] || ''; });
            rawSet(SYNC_REV_KEY, String(meta.rev));
            rawRemove(SYNC_DIRTY_KEY);
            markAdminClean();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: errCode(e) };
        }
    }

    // À l'ouverture d'une page en mode admin : si un autre appareil a synchronisé du neuf, on le récupère
    // tout seul (puis la page se recharge une fois). Jamais si ce navigateur a des changements non envoyés,
    // ni s'il n'a encore jamais été synchronisé (la 1re synchro se fait à la main dans SETTINGS).
    async function autoPull() {
        if (pageProfile !== 'admin' || !syncAvailable() || rawGet(SYNC_ON_KEY) !== '1') return;
        if (syncIsDirty() || rawGet(SYNC_REV_KEY) === null) return;
        if (sessionStorage.getItem('bt_sync_reloaded') === '1') { sessionStorage.removeItem('bt_sync_reloaded'); return; }

        const user = await currentUser();
        if (!user) return;
        const fb = await loadFirebase();
        const metaSnap = await fb.f.getDoc(fb.f.doc(fb.db, FB_COLLECTION, 'meta'));
        if (!metaSnap.exists() || String(metaSnap.data().rev) === rawGet(SYNC_REV_KEY)) return;

        const res = await syncPull(true);
        if (res.ok && !res.empty) {
            sessionStorage.setItem('bt_sync_reloaded', '1');
            location.reload();
        }
    }
    autoPull().catch(function () {});

    // Envoi de dernière minute quand on quitte la page (au mieux : les envois sont déjà faits après 5 s)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && pageProfile === 'admin' && syncIsDirty() && rawGet(SYNC_ON_KEY) === '1') {
            clearTimeout(syncTimer);
            syncPush().catch(function () {});
        }
    });

    window.BadTherapistSave = {
        syncAvailable: syncAvailable,
        syncStatus: syncStatus,
        syncSignIn: syncSignIn,
        syncSignOut: syncSignOut,
        syncIsDirty: syncIsDirty,
        syncPush: syncPush,
        syncPull: syncPull,
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
