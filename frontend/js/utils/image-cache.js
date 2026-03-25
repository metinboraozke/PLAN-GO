/**
 * PLANİGO - Shared City Image Cache
 * Modül seviyesinde cache — aynı şehrin fotoğrafı birden fazla ekrandan
 * istenirse tek HTTP isteği gider.
 */

import { API_BASE } from '../config.js';

const _cache = new Map(); // key: `${city}_${width}`, value: url

/**
 * Şehir fotoğrafı URL'i döner. Önce cache'e bakar, yoksa backend'den çeker.
 * @param {string} city  - Şehir adı veya IATA kodu
 * @param {number} width - İstenen görsel genişliği (px)
 * @returns {Promise<string>} Fotoğraf URL'i
 */
export async function getCityImage(city, width = 400) {
    if (!city) return '';
    const key = `${city}_${width}`;
    if (_cache.has(key)) return _cache.get(key);
    try {
        const res = await fetch(`${API_BASE}/image/city?q=${encodeURIComponent(city)}&w=${width}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const url = (typeof data === 'string') ? data : (data.url ?? data.image_url ?? '');
        if (url) _cache.set(key, url);
        return url;
    } catch {
        return '';
    }
}
