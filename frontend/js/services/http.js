/**
 * PLANİGO - HTTP Service
 * Structured fetch wrapper. Always returns { data, error, status }.
 * Never throws; all errors are captured and returned as structured values.
 */

import { API_BASE } from '../config.js';
import { emit } from '../core/store.js';

const _HTTP_ERRORS = {
    400: 'Geçersiz istek.',
    404: 'İstenen veri bulunamadı.',
    429: 'Limit doldu, lütfen birkaç dakika sonra tekrar dene.',
    500: 'Sunucuda bir sorun var, birazdan tekrar dene.',
    503: 'Servis şu an ulaşılamıyor, birazdan tekrar dene.',
};

function _authHeaders() {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function _handleResponse(response) {
    if (response.status === 401) {
        emit('auth:expired', {});
    }
    if (!response.ok) {
        const friendlyMsg = _HTTP_ERRORS[response.status] || `Bir hata oluştu (${response.status})`;
        return { data: null, error: friendlyMsg, status: response.status };
    }
    try {
        const data = await response.json();
        return { data, error: null, status: response.status };
    } catch {
        return { data: null, error: 'Invalid JSON response', status: response.status };
    }
}

export async function get(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: _authHeaders()
        });
        return _handleResponse(response);
    } catch (error) {
        console.error(`GET ${endpoint} failed:`, error);
        return { data: null, error: error.message, status: 0 };
    }
}

export async function post(endpoint, data) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method:  'POST',
            headers: _authHeaders(),
            body:    JSON.stringify(data)
        });
        return _handleResponse(response);
    } catch (error) {
        console.error(`POST ${endpoint} failed:`, error);
        return { data: null, error: error.message, status: 0 };
    }
}

export async function patch(endpoint, data) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method:  'PATCH',
            headers: _authHeaders(),
            body:    JSON.stringify(data)
        });
        return _handleResponse(response);
    } catch (error) {
        console.error(`PATCH ${endpoint} failed:`, error);
        return { data: null, error: error.message, status: 0 };
    }
}

export async function del(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method:  'DELETE',
            headers: _authHeaders()
        });
        return _handleResponse(response);
    } catch (error) {
        console.error(`DELETE ${endpoint} failed:`, error);
        return { data: null, error: error.message, status: 0 };
    }
}

/**
 * Raw fetch to an absolute URL (used for external APIs like Nominatim, Gemini proxy).
 */
export async function fetchAbsolute(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: _authHeaders(),
            ...options
        });
        return _handleResponse(response);
    } catch (error) {
        console.error(`Fetch ${url} failed:`, error);
        return { data: null, error: error.message, status: 0 };
    }
}
