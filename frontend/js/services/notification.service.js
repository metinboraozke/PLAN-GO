/**
 * PLANİGO - Notification Service
 */

import * as http from './http.js';
import { API_BASE } from '../config.js';
import { getAuthHeaders } from './auth.service.js';

export const getNotifications = (userId, unreadOnly = false) =>
    http.get(`/users/${encodeURIComponent(userId)}/notifications${unreadOnly ? '?unread_only=true' : ''}`);

export async function markNotificationsRead(userId) {
    const response = await fetch(
        `${API_BASE}/users/${encodeURIComponent(userId)}/notifications/read`,
        { method: 'PATCH', headers: getAuthHeaders() }
    );
    const data = await response.json().catch(() => ({}));
    return { data, error: response.ok ? null : `HTTP ${response.status}`, status: response.status };
}
