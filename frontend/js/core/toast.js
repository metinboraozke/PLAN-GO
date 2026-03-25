/**
 * PLANİGO - Toast Notification Helper
 * Wraps the existing showToast global (defined in app.js / index.html).
 * Once app.js is fully migrated, the implementation can move here.
 */

/**
 * Show a toast message.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 */
export function showToast(message, type = 'info') {
    // Forward to existing global implementation while migration is in progress.
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }

    // Fallback: simple console log if global not yet available.
    console.info(`[Toast ${type}]`, message);
}
