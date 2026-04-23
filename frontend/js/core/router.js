/**
 * PLANİGO - Router
 * Screen navigation and data loading orchestration.
 * Mirrors the current navigate() + loadScreenData() pattern from app.js.
 */

import { setSlice, emit } from './store.js';

/**
 * Navigate to a named screen.
 * Hides all .screen elements, shows the target screen, updates nav buttons.
 * @param {string} screenName
 */
export function navigate(screenName) {
    console.log(`[Router] Navigating to: ${screenName}`);

    // Haritadan ayrılırken GPS watch'u temizle
    const currentScreen = document.querySelector('.screen:not(.hidden)')?.id?.replace('screen-', '');
    if (currentScreen === 'map' && screenName !== 'map') {
        window.cleanupMap?.();
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

    const targetScreen = document.getElementById(`screen-${screenName}`);
    if (targetScreen) {
        // Scroll ÖNCE sıfırla — remove('hidden') sonrası body:has(#screen-map)
        // overflow:hidden aktif olur ve iOS WKWebView scrollTo'yu yok sayar.
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.getElementById('app')?.scrollTo?.(0, 0);

        targetScreen.classList.remove('hidden');
        targetScreen.classList.add('screen-transition');

        targetScreen.scrollTop = 0;
        targetScreen.querySelectorAll('[class*="overflow-y"], .pd-body').forEach(el => {
            el.scrollTop = 0;
        });

        // Harita ekranına geçişte ikinci reset — iOS WKWebView body:has() kuralını
        // bir sonraki paint'te uygulayabiliyor; overflow:hidden kilitlenmeden önce
        // requestAnimationFrame ile yakalıyoruz.
        if (screenName === 'map') {
            requestAnimationFrame(() => {
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.getElementById('app')?.scrollTo?.(0, 0);
                targetScreen.scrollTop = 0;
            });
        }
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.screen === screenName) btn.classList.add('active');
    });

    setSlice('ui', { currentScreen: screenName });
    emit('router:navigate', { screen: screenName });
    loadScreenData(screenName);
}

/**
 * Load data for the given screen.
 * Each case delegates to the relevant screen module.
 * During migration, these call global functions — they will be replaced
 * with module imports as each screen is extracted from app.js.
 *
 * @param {string} screenName
 */
/**
 * Global scroll guard — catches any screen transition that bypasses navigate().
 * Observes every .screen element; when .hidden is removed (screen becomes visible)
 * it fires a scroll reset so body scrollY never leaks into the new screen.
 * Called once at module load time; safe to run alongside router's own resets.
 */
function _installScreenScrollGuard() {
    document.querySelectorAll('.screen').forEach(screen => {
        new MutationObserver(mutations => {
            for (const m of mutations) {
                const wasHidden    = m.oldValue?.includes('hidden') ?? true;
                const isNowVisible = !screen.classList.contains('hidden');
                if (wasHidden && isNowVisible) {
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.getElementById('app')?.scrollTo?.(0, 0);
                    screen.scrollTop = 0;
                }
            }
        }).observe(screen, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
}
_installScreenScrollGuard();

export function loadScreenData(screenName) {
    switch (screenName) {
        case 'discovery':
            window.loadDiscoveryFull?.();
            break;
        case 'map':
            window.initializeMap?.();
            break;
        case 'planner':
            window.loadWishlists?.();
            window.renderPaxEventsInPlanner?.();
            window._maybeRestoreAiPreview?.();
            break;
        case 'profile':
            window.loadPassport?.();
            window.loadStories?.();
            break;
    }
}
