/**
 * PLANİGO - Map Service
 * Pin CRUD endpoints under /map/pins.
 */

import * as http from './http.js';
import { API_BASE } from '../config.js';
import { getAuthHeaders } from './auth.service.js';

export const getMapPins    = (filter = '') => http.get(`/map/pins${filter}`);
export const getNearbyPins = (lat, lng, radius = 50) =>
    http.get(`/map/pins/nearby?lat=${lat}&lng=${lng}&radius_km=${radius}`);
export const createMapPin  = (data)          => http.post('/map/pins', data);
export const updateMapPin  = (id, uid, data) => http.patch(`/map/pins/${id}?user_id=${encodeURIComponent(uid)}`, data);
export const deleteMapPin  = (id, uid)       => http.del(`/map/pins/${id}?user_id=${encodeURIComponent(uid)}`);
