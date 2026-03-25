/**
 * PLANİGO - Auth Screen Module
 *
 * Extracted from app.js lines 6196-6385.
 * Handles login/register modal UI.
 */

import * as authService from '../../services/auth.service.js';
import { showToast } from '../../core/toast.js';
import { navigate } from '../../core/router.js';

let _authMode = 'login'; // 'login' | 'register'

export function init() {
    const form = document.getElementById('auth-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthSubmit();
        });
    }

    const submitBtn = document.getElementById('auth-submit');
    if (submitBtn) submitBtn.addEventListener('click', handleAuthSubmit);

    const toggleBtn = document.getElementById('auth-toggle-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleAuthMode);

    // Expose to global for onclick attributes still in HTML (migration bridge)
    window.handleAuthSubmit = handleAuthSubmit;
    window.toggleAuthMode   = toggleAuthMode;
    window.showAuthModal    = showAuthModal;
    window.hideAuthModal    = hideAuthModal;
    window.logout           = logout;
}

export function showAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

export function hideAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    document.getElementById('auth-form')?.reset();
    document.getElementById('auth-error')?.classList.add('hidden');
}

export function toggleAuthMode() {
    _authMode = _authMode === 'login' ? 'register' : 'login';

    const title         = document.getElementById('auth-title');
    const subtitle      = document.getElementById('auth-subtitle');
    const btnText       = document.getElementById('auth-btn-text');
    const toggleText    = document.getElementById('auth-toggle-text');
    const toggleBtn     = document.getElementById('auth-toggle-btn');
    const usernameGroup = document.getElementById('auth-username-group');
    const err           = document.getElementById('auth-error');

    if (err) err.classList.add('hidden');

    if (_authMode === 'register') {
        title.textContent       = 'Kayıt Ol';
        subtitle.textContent    = 'Yeni hesap oluştur ve maceraya başla';
        btnText.textContent     = 'Kayıt Ol';
        toggleText.textContent  = 'Zaten hesabın var mı?';
        toggleBtn.textContent   = 'Giriş Yap';
        usernameGroup.classList.remove('hidden');
    } else {
        title.textContent       = 'Giriş Yap';
        subtitle.textContent    = 'Hesabına giriş yap ve keşfetmeye başla';
        btnText.textContent     = 'Giriş Yap';
        toggleText.textContent  = 'Hesabın yok mu?';
        toggleBtn.textContent   = 'Kayıt Ol';
        usernameGroup.classList.add('hidden');
    }
}

export async function handleAuthSubmit() {
    const email     = document.getElementById('auth-email')?.value.trim();
    const password  = document.getElementById('auth-password')?.value;
    const errEl     = document.getElementById('auth-error');
    const btnText   = document.getElementById('auth-btn-text');
    const submitBtn = document.getElementById('auth-submit');

    if (!email || !password) {
        _showError(errEl, 'Lütfen tüm alanları doldurun');
        return;
    }
    if (password.length < 6) {
        _showError(errEl, 'Şifre en az 6 karakter olmalı');
        return;
    }

    const originalText     = btnText.textContent;
    btnText.textContent    = 'Yükleniyor...';
    submitBtn.disabled     = true;
    errEl.classList.add('hidden');

    try {
        let result;

        if (_authMode === 'register') {
            const username = document.getElementById('auth-username')?.value.trim();
            if (!username || username.length < 3) {
                _showError(errEl, 'Kullanıcı adı en az 3 karakter olmalı');
                return;
            }
            result = await authService.register(username, email, password);
        } else {
            result = await authService.login(email, password);
        }

        if (result.error) {
            _showError(errEl, result.error);
            return;
        }

        hideAuthModal();
        window.syncProfileFromAuth?.();
        navigate('planner');
        showToast(`Hoş geldin, ${result.data.username}!`, 'success');

    } finally {
        btnText.textContent = originalText;
        submitBtn.disabled  = false;
    }
}

export function logout() {
    authService.logout();
    window.state && Object.assign(window.state, { wishlists: [], pins: [], profile: null });
    showToast('Başarıyla çıkış yapıldı', 'success');
    showAuthModal();
}

function _showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}
