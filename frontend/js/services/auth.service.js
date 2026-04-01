/**
 * PLANİGO - Auth Service
 * Login, register, logout, and session helpers.
 * Does NOT store auth_raw_pass (security risk removed).
 */

import { API_BASE } from '../config.js';
import { setSlice, emit } from '../core/store.js';

export function isAuthenticated() {
    return !!localStorage.getItem('auth_token');
}

export function getCurrentUserId() {
    return localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
}

export function getCurrentUsername() {
    return localStorage.getItem('auth_username') || '';
}

export function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

/**
 * Login with email + password.
 * @returns {{ data: Object|null, error: string|null }}
 */
export async function login(email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { data: null, error: err.detail || `HTTP ${response.status}` };
        }

        const data = await response.json();
        _persistSession(data);
        import('./push-notification.service.js').then(m => m.initPushNotifications(data.access_token));
        return { data, error: null };
    } catch (error) {
        return { data: null, error: error.message };
    }
}

/**
 * Register new user.
 * @returns {{ data: Object|null, error: string|null }}
 */
export async function register(username, email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { data: null, error: err.detail || `HTTP ${response.status}` };
        }

        const data = await response.json();
        _persistSession(data);
        import('./push-notification.service.js').then(m => m.initPushNotifications(data.access_token));
        return { data, error: null };
    } catch (error) {
        return { data: null, error: error.message };
    }
}

/**
 * Logout: clear all auth storage and reset auth store slice.
 */
export function logout() {
    const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id');
    if (uid) {
        localStorage.removeItem(`pax_upcoming_events_${uid}`);
        localStorage.removeItem(`pax_join_requests_${uid}`);
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_email');
    sessionStorage.removeItem('pax_creator_id');

    setSlice('auth', { token: null, userId: null, username: null, email: null });
    emit('auth:logout', {});
}

function _persistSession(data) {
    localStorage.setItem('auth_token',      data.access_token);
    localStorage.setItem('auth_user_id',    data.user_id);
    localStorage.setItem('auth_username',   data.username);
    localStorage.setItem('auth_email',      data.email);
    if (data.avatar_url) {
        localStorage.setItem('auth_avatar_url', data.avatar_url);
    } else {
        localStorage.removeItem('auth_avatar_url');
    }
    sessionStorage.setItem('pax_creator_id', data.user_id);

    setSlice('auth', {
        token:     data.access_token,
        userId:    data.user_id,
        username:  data.username,
        email:     data.email,
        avatarUrl: data.avatar_url || null,
    });

    emit('auth:login', { userId: data.user_id, username: data.username });
}
