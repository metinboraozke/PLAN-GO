/**
 * PLANİGO - Account Settings Component
 * Full port from app.js lines 6423-6455.
 */

import { getSlice } from '../core/store.js';

export function openAccountSettings() {
    const screen = document.getElementById('screen-account-settings');
    if (!screen) return;

    const passport = getSlice('profile').passport || {};
    const username  = passport.username || localStorage.getItem('auth_username') || '-';
    const email     = localStorage.getItem('auth_email') || '-';

    const usernameEl = document.getElementById('as-username');
    const emailEl    = document.getElementById('as-email');
    const passEl     = document.getElementById('as-password');
    const toggleEl   = document.getElementById('as-toggle-pass');

    if (usernameEl) usernameEl.textContent    = username;
    if (emailEl)    emailEl.textContent       = email;
    if (passEl)     passEl.textContent        = '••••••••';
    if (passEl)     passEl.dataset.real       = '';  // auth_raw_pass removed for security
    if (toggleEl)   toggleEl.textContent      = 'Göster';

    screen.classList.remove('hidden');
}

export function closeAccountSettings() {
    document.getElementById('screen-account-settings')?.classList.add('hidden');
}

export function togglePasswordVisibility() {
    const el  = document.getElementById('as-password');
    const btn = document.getElementById('as-toggle-pass');
    if (!el) return;
    if (el.textContent.startsWith('•')) {
        el.textContent = el.dataset.real || '(şifre kayıtlı değil)';
        if (btn) btn.textContent = 'Gizle';
    } else {
        el.textContent = '••••••••';
        if (btn) btn.textContent = 'Göster';
    }
}
