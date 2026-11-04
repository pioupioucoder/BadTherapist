(() => {
    'use strict';

    const VOLUME_KEY = 'lmtd_volume';
    const MUTE_KEY = 'lmtd_muted';
    const POSITION_KEY = 'bt_intro_position';
    const ACCEPTED_KEY = 'bt_intro_accepted';

    const DEFAULT_VOLUME = 0.7;

    let currentAudio = null;
    let restorePromise = Promise.resolve();
    let resumeListenersAdded = false;

    function getVolume() {
        // BUG CORRIGÉ : Number(null) === 0, donc tant que le joueur n'avait pas
        // touché au curseur, le volume valait 0 et la musique était muette.
        const raw = localStorage.getItem(VOLUME_KEY);

        if (raw === null || raw === '') {
            return DEFAULT_VOLUME;
        }

        const value = Number(raw);

        if (!Number.isFinite(value)) {
            return DEFAULT_VOLUME;
        }

        return Math.max(0, Math.min(1, value));
    }

    function isMuted() {
        return localStorage.getItem(MUTE_KEY) === '1';
    }

    function applySettings() {
        document.querySelectorAll('audio').forEach(audio => {
            audio.volume = getVolume();
            audio.muted = isMuted();
        });
    }

    function setVolume(value) {
        value = Math.max(0, Math.min(1, Number(value)));

        localStorage.setItem(VOLUME_KEY, String(value));
        applySettings();
    }

    function setMuted(value) {
        localStorage.setItem(MUTE_KEY, value ? '1' : '0');
        applySettings();
    }

    function savePosition(audio = currentAudio) {
        if (!audio || !Number.isFinite(audio.currentTime)) return;

        try {
            sessionStorage.setItem(
                POSITION_KEY,
                String(audio.currentTime)
            );
        } catch (error) {
            console.warn('Could not save audio position:', error);
        }
    }

    function restorePosition(audio) {
        return new Promise(resolve => {
            let position = 0;

            try {
                position = Number(
                    sessionStorage.getItem(POSITION_KEY) || 0
                );
            } catch (error) {
                console.warn('Could not restore audio position:', error);
            }

            if (!Number.isFinite(position) || position < 0) {
                position = 0;
            }

            const applyPosition = () => {
                if (
                    Number.isFinite(audio.duration) &&
                    audio.duration > 0
                ) {
                    audio.currentTime = position % audio.duration;
                }

                resolve();
            };

            if (audio.readyState >= 1) {
                applyPosition();
            } else {
                audio.addEventListener(
                    'loadedmetadata',
                    applyPosition,
                    { once: true }
                );

                audio.addEventListener(
                    'error',
                    resolve,
                    { once: true }
                );
            }
        });
    }

    function addResumeListeners(audio) {
        if (resumeListenersAdded) return;

        resumeListenersAdded = true;

        const events = ['click', 'keydown', 'pointerdown', 'touchstart'];

        const resume = () => {
            if (sessionStorage.getItem(ACCEPTED_KEY) !== '1') return;

            applySettings();

            audio.play().then(() => {
                events.forEach(name => document.removeEventListener(name, resume));
                resumeListenersAdded = false;
            }).catch(() => {
                // Toujours bloqué : on garde les écouteurs pour le prochain geste.
            });
        };

        events.forEach(name => document.addEventListener(name, resume));
    }

    async function start() {
        const audio = document.getElementById('intro-music');

        if (!audio) return;

        currentAudio = audio;

        sessionStorage.setItem(ACCEPTED_KEY, '1');

        applySettings();

        await restorePromise;

        if (!audio.paused) return;

        audio.play().catch(() => {
            addResumeListeners(audio);
        });
    }

    function stop() {
        if (currentAudio) {
            savePosition(currentAudio);
            currentAudio.pause();
        }

        sessionStorage.removeItem(ACCEPTED_KEY);
        sessionStorage.removeItem(POSITION_KEY);
    }

    function init() {
        const intro = document.getElementById('intro-music');

        applySettings();

        if (!intro) return;

        currentAudio = intro;

        restorePromise = restorePosition(intro);

        intro.addEventListener('timeupdate', () => {
            savePosition(intro);
        });

        window.addEventListener('pagehide', () => {
            savePosition(intro);
        });

        // Only resume if the player already accepted the entry question.
        if (sessionStorage.getItem(ACCEPTED_KEY) === '1') {
            start();
        }

        // Keep audio settings synchronized with newly added audio elements.
        const observer = new MutationObserver(applySettings);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop the music when leaving the game for another site
        // in the same tab. Links opening a new tab are not affected.
        document.addEventListener('click', event => {
            const link = event.target.closest('a[href]');

            if (!link || link.target === '_blank') return;

            try {
                const destination = new URL(link.href, location.href);

                if (destination.origin !== location.origin) {
                    stop();
                }
            } catch (error) {
                // Ignore invalid URLs.
            }
        });
    }

    window.BadTherapistAudio = {
        getVolume,
        isMuted,
        setVolume,
        setMuted,
        applySettings,
        start,
        stop
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();