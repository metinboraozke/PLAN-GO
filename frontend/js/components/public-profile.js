/**
 * PLANİGO - Public Profile Overlay Component
 * Full port from app.js lines 1526-1580.
 */

import { getPublicProfile } from '../services/profile.service.js';
import { escapeHtml } from '../utils/dom.js';

export function countryCodeToEmoji(code) {
    if (!code || code.length < 2) return '';
    return code.toUpperCase().split('')
        .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
        .join('');
}

export async function openPublicProfile(userId, userName) {
    const modal = document.getElementById('modal-public-profile');
    if (!modal) return;
    modal.classList.remove('hidden');
    lucide?.createIcons();

    // Show initials immediately while loading
    const initials = (userName || '?').trim().charAt(0).toUpperCase();
    const ppAvatar = document.getElementById('pp-avatar');
    const ppName   = document.getElementById('pp-name');
    const ppLevel  = document.getElementById('pp-level');
    const ppBio    = document.getElementById('pp-bio');
    const ppCount  = document.getElementById('pp-visited-count');
    const ppFlags  = document.getElementById('pp-flags');
    const ppNo     = document.getElementById('pp-no-profile');

    if (ppAvatar) ppAvatar.textContent = initials;
    if (ppName)   ppName.textContent   = userName || 'Kullanıcı';
    if (ppLevel)  ppLevel.textContent  = '';
    if (ppBio)    ppBio.textContent    = '';
    if (ppCount)  ppCount.textContent  = '🌍 — ülke gezdi';
    if (ppFlags)  ppFlags.textContent  = '';
    if (ppNo)     ppNo.classList.add('hidden');

    const { data: profile } = await getPublicProfile(userId);
    if (!profile) return;

    if (ppName)  ppName.textContent  = escapeHtml(profile.display_name || userName || 'Kullanıcı');
    if (ppLevel) ppLevel.textContent = profile.passport_level ? `✈️ ${escapeHtml(profile.passport_level)}` : '';
    if (ppBio)   ppBio.textContent   = profile.bio || '';
    if (ppCount) ppCount.textContent = `🌍 ${profile.visited_count || 0} ülke gezdi`;

    // Country flag row (max 8 flags)
    const flags = (profile.visited_countries || []).slice(0, 8).map(c => {
        const code = typeof c === 'string' ? c : (c?.country_code || '');
        return countryCodeToEmoji(code);
    }).filter(Boolean).join(' ');
    if (ppFlags) ppFlags.textContent = flags;

    if (!profile.found && ppNo) {
        ppNo.classList.remove('hidden');
    }
}

export function closePublicProfile() {
    document.getElementById('modal-public-profile')?.classList.add('hidden');
}
