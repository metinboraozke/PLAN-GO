/**
 * PLANİGO - AI Service
 * Gemini itinerary generation and plan AI recommendations.
 */

import * as http from './http.js';

/**
 * Generate AI itinerary for a city.
 * @param {string} city
 * @param {number} days
 */
export async function generateItinerary(city, days) {
    const { data, error, status } = await http.get(
        `/ai/pax-itinerary?city=${encodeURIComponent(city)}&days=${days}`
    );
    if (error) return { data: null, error, status };
    if (!data?.success) return { data: null, error: data?.detail || data?.error || 'AI servisi hatası', status };
    return { data: data.data, error: null, status };
}

/**
 * Get AI recommendations for an existing plan.
 */
export const getPlanAiRecs = (planId) =>
    http.get(`/plans/${encodeURIComponent(planId)}/ai-recommendations`);
