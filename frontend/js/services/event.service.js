/**
 * PLANİGO - Event Service
 * PAX map event endpoints under /map/events.
 */

import * as http from './http.js';
import { API_BASE } from '../config.js';
import { getAuthHeaders } from './auth.service.js';

export const getEventPins   = (eventType = '') =>
    http.get(`/map/events${eventType ? '?event_type=' + encodeURIComponent(eventType) : ''}`);

export const createEventPin = (data) => http.post('/map/events', data);

export async function deleteEventPin(eventId, _userId) {
    // user_id artık JWT'den alınıyor, query param gerekmez
    const response = await fetch(
        `${API_BASE}/map/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE', headers: getAuthHeaders() }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}

export const sendJoinRequest = (eventId, data) =>
    http.post(`/map/events/${encodeURIComponent(eventId)}/join`, data);

export async function cancelJoinRequest(eventId, _userId) {
    // user_id artık JWT'den alınıyor
    const response = await fetch(
        `${API_BASE}/map/events/${encodeURIComponent(eventId)}/join`,
        { method: 'DELETE', headers: getAuthHeaders() }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}

// creator_id artık JWT'den alınıyor — query param kaldırıldı
export const getJoinRequests = (eventId) =>
    http.get(`/map/events/${encodeURIComponent(eventId)}/requests`);

// creator_id artık JWT'den alınıyor — query param kaldırıldı
export async function updateRequestStatus(eventId, requestId, newStatus) {
    const response = await fetch(
        `${API_BASE}/map/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}`,
        {
            method:  'PATCH',
            headers: getAuthHeaders(),
            body:    JSON.stringify({ status: newStatus })
        }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}

export async function awardEventStamps(eventId) {
    // creator_id artık JWT'den alınıyor — query param gönderilmiyor
    const response = await fetch(
        `${API_BASE}/map/events/${encodeURIComponent(eventId)}/award-stamps`,
        { method: 'POST', headers: getAuthHeaders() }
    );
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    return { data: await response.json(), error: null, status: response.status };
}
