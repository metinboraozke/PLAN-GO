/**
 * PLANİGO - Profile Service
 * Passport, stats, and country visit endpoints.
 */

import * as http from './http.js';
import { API_BASE } from '../config.js';
import { getCurrentUserId, getAuthHeaders } from './auth.service.js';

function _uidQs() {
    const uid = getCurrentUserId();
    return uid ? `?user_id=${encodeURIComponent(uid)}` : '';
}

export const getPassport  = () => http.get(`/profile/passport${_uidQs()}`);
export const getFullStats = () => http.get('/profile/full-stats');

// user_id artık JWT'den alınıyor — query param gönderilmiyor
export const addVisitedCountry = (data) =>
    http.post('/profile/visited-country', data);

export async function removeVisitedCountry(code) {
    const response = await fetch(
        `${API_BASE}/profile/visited-country?country_code=${encodeURIComponent(code)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}

export async function awardXP(userId, delta, reason = 'manual') {
    const response = await fetch(
        `${API_BASE}/users/${encodeURIComponent(userId)}/xp?delta=${delta}&reason=${encodeURIComponent(reason)}`,
        { method: 'POST', headers: getAuthHeaders() }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}

export const getPublicProfile = (userId) =>
    http.get(`/users/${encodeURIComponent(userId)}/public-profile`);
