/**
 * PLANİGO - Planner Service
 * Wishlist and plan detail endpoints.
 */

import * as http from './http.js';
import { API_BASE } from '../config.js';
import { getAuthHeaders } from './auth.service.js';

export const getWishlists   = ()         => http.get('/wishlists');
export const addWishlist    = (data)     => http.post('/wishlist/add', data);
export const updateWishlist = (id, data) => http.post(`/wishlists/${encodeURIComponent(id)}`, data);

export async function deleteWishlist(id) {
    const response = await fetch(`${API_BASE}/wishlists/${encodeURIComponent(id)}`, {
        method:  'DELETE',
        headers: getAuthHeaders()
    });
    if (!response.ok) return { data: null, error: `HTTP ${response.status}`, status: response.status };
    // DELETE may return 204 (no content)
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { data, error: null, status: response.status };
}

export const getPlanner     = (id)              => http.get(`/planner/${encodeURIComponent(id)}`);
export const getPlanDetails = (id)              => http.get(`/plans/${encodeURIComponent(id)}/details`);
export const getBudgetCalc  = (id, hotelIndex = 0) =>
    http.get(`/plans/${encodeURIComponent(id)}/budget?hotel_index=${hotelIndex}`);
export const confirmPlan    = (id)              => http.post(`/plans/${encodeURIComponent(id)}/confirm`, {});
