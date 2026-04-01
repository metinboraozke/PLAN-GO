/**
 * PLANİGO - DOM Utilities
 * XSS-safe HTML templating and icon helpers.
 */

/**
 * XSS-safe tagged template literal for HTML strings.
 * Usage: container.innerHTML = html`<div>${userInput}</div>`
 */
export function html(strings, ...values) {
    return strings.raw.reduce((result, str, i) => {
        const val = values[i - 1];
        if (val == null) return result + str;
        const safe = String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        return result + safe + str;
    });
}

/**
 * Escape HTML special characters (legacy helper, prefer html tagged template).
 */
export function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Debounced Lucide icon refresh.
 * Call after any innerHTML update that may include lucide icon elements.
 */
let _lucidePending = false;
export function scheduleIconRefresh() {
    if (_lucidePending) return;
    _lucidePending = true;
    requestAnimationFrame(() => {
        window.lucide?.createIcons();
        _lucidePending = false;
    });
}
