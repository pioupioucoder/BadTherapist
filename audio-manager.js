(() => {
    'use strict';

    const VOLUME_KEY = 'lmtd_volume';
    const MUTE_KEY = 'lmtd_muted';
    const POSITION_KEY = 'bt_intro_position';

    const DEFAULT_VOLUME = 0.7;

    function getVolume() {
        const value = Number(localStorage.getItem(VOLUME_KEY));

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

    function savePosition(audio) {
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
        };

        if (audio.readyState >= 1) {
            applyPosition();
        } else {
            audio.addEventListener(
                'loadedmetadata',
                applyPosition,
                { once: true }
            );
        }
    }

    function startAudio(audio) {
        applySettings();

        audio.play().catch(() => {
            // If autoplay is blocked, wait for user interaction.
            const resume = () => {
                applySettings();

                audio.play().catch(() => {});

                document.removeEventListener('click', resume);
                document.removeEventListener('keydown', resume);
            };

            document.addEventListener('click', resume, { once: true });
            document.addEventListener('keydown', resume, { once: true });
        });
    }

    function init() {
        const intro = document.getElementById('intro-music');

        applySettings();

        if (!intro) return;

        restorePosition(intro);

        intro.addEventListener('timeupdate', () => {
            savePosition(intro);
        });

        window.addEventListener('pagehide', () => {
            savePosition(intro);
        });

        window.addEventListener('beforeunload', () => {
            savePosition(intro);
        });

        startAudio(intro);

        // Apply the shared settings to audio elements added later.
        const observer = new MutationObserver(applySettings);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    window.BadTherapistAudio = {
        getVolume,
        isMuted,
        setVolume,
        setMuted,
        applySettings
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();