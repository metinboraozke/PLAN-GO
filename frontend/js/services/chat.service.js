/**
 * PLANİGO - Chat Service
 * Event chat endpoints.
 */

import * as http from './http.js';

// user_id artık JWT'den alınıyor — query param kaldırıldı
export const getChatMessages = (eventId) =>
    http.get(`/map/events/${encodeURIComponent(eventId)}/chat`);

export const sendChatMsg = (eventId, data) =>
    http.post(`/map/events/${encodeURIComponent(eventId)}/chat`, data);

export const getEventParticipants = (eventId) =>
    http.get(`/map/events/${encodeURIComponent(eventId)}/participants`);
