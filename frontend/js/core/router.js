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
        targetScreen.classList.remove('hidden');
        targetScreen.classList.add('screen-transition');

        // Reset scroll position so every screen opens from the top.
        // body + app container (for non-fixed screens) + inner scrollable areas.
        window.scrollTo(0, 0);
        document.getElementById('app')?.scrollTo?.(0, 0);
        targetScreen.scrollTop = 0;
        // Also reset any inner scrollable pane (plan detail body, etc.)
        targetScreen.querySelectorAll('[class*="overflow-y"], .pd-body').forEach(el => {
            el.scrollTop = 0;
        });
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
