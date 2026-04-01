/**
 * PLANİGO - AI Itinerary Component
 * Full port from app.js lines 6573-6820.
 */

import { generateItinerary } from '../services/ai.service.js';
import { showToast } from '../core/toast.js';
import { escapeHtml } from '../utils/dom.js';
import { getCityImage } from '../utils/image-cache.js';

const _AI_STORAGE_KEY = 'pax_last_ai_itinerary';

// ── Modal Open / Close ─────────────────────────────────────────────────────
export function openAiItineraryModal() {
    const modal = document.getElementById('modal-ai-itinerary');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Restore last saved plan
    try {
        const saved = localStorage.getItem(_AI_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            _renderAiItinerary(data, false);
            const cityInput  = document.getElementById('ai-city-input');
            const daysSelect = document.getElementById('ai-days-select');
            if (cityInput)  cityInput.value  = data.city  || '';
            if (daysSelect) daysSelect.value = String(data.days || 3);
        }
    } catch { /* ignore */ }

    setTimeout(() => document.getElementById('ai-city-input')?.focus(), 100);
}

export function closeAiItineraryModal() {
    document.getElementById('modal-ai-itinerary')?.classList.add('hidden');
}

// ── Fetch & Render ─────────────────────────────────────────────────────────
export async function fetchAiItinerary() {
    const cityInput  = document.getElementById('ai-city-input');
    const daysSelect = document.getElementById('ai-days-select');
    const resultEl   = document.getElementById('ai-itinerary-result');
    const btn        = document.getElementById('ai-fetch-btn');
    if (!cityInput || !daysSelect || !resultEl) return;

    const city = cityInput.value.trim();
    const days = parseInt(daysSelect.value, 10);
    if (!city) { cityInput.focus(); showToast('Şehir adını gir', 'warning'); return; }

    btn.disabled    = true;
    btn.textContent = '...';
    resultEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 0;gap:12px;color:#9ca3af;">
            <svg style="width:28px;height:28px;color:#A3C14A;animation:spin 1s linear infinite;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25"/>
                <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <p style="font-size:13px;">Gemini planı hazırlıyor…</p>
        </div>`;

    const { data, error } = await generateItinerary(city, days);

    if (error || !data) {
        resultEl.innerHTML = `<p style="font-size:13px;color:#f87171;padding:32px 0;text-align:center;">Hata: ${escapeHtml(error || 'Bilinmeyen hata')}</p>`;
        btn.disabled    = false;
        btn.textContent = 'Planla';
        return;
    }

    try { localStorage.setItem(_AI_STORAGE_KEY, JSON.stringify(data)); } catch { /* quota */ }

    await _renderAiItinerary(data, true);
    _renderAiPlannerPreview(data);
    btn.disabled    = false;
    btn.textContent = 'Planla';
}

// ── Internal Render ────────────────────────────────────────────────────────
const _GRAD = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)',
    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
    'linear-gradient(135deg,#ffecd2,#fcb69f)',
    'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
];

async function _fetchCityImg(query, w = 800) {
    return (await getCityImage(query, w)) || null;
}

async function _renderAiItinerary(data, loadImages = true) {
    const resultEl = document.getElementById('ai-itinerary-result');
    if (!resultEl) return;
    const items = data.itinerary || [];
    if (!items.length) {
        resultEl.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:32px 0;text-align:center;">Plan verisi alınamadı.</p>';
        return;
    }

    resultEl.innerHTML = `
        <p style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;color:#1a1a1a;margin:4px 0 16px;">
            ${escapeHtml(data.city)} &nbsp;·&nbsp; <span style="color:#A3C14A;">${data.days} Günlük Plan</span>
        </p>
        <div style="display:flex;flex-direction:column;gap:14px;padding-bottom:8px;">
            ${items.map((day, i) => `
            <div id="ai-day-card-${day.day}" style="border-radius:24px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);background:#fff;font-family:'Plus Jakarta Sans',sans-serif;">
                <div id="ai-hero-${day.day}" style="position:relative;height:170px;background:${_GRAD[i % _GRAD.length]};background-size:cover;background-position:center;display:flex;align-items:flex-end;">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.62) 0%,transparent 55%);"></div>
                    <div style="position:relative;z-index:1;padding:12px 14px;width:100%;display:flex;align-items:flex-end;justify-content:space-between;">
                        <span style="background:#A3C14A;color:#fff;font-size:11px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:3px 12px;">GÜN ${day.day}</span>
                        <span style="color:rgba(255,255,255,0.85);font-size:20px;line-height:1;">📍</span>
                    </div>
                </div>
                <div style="padding:12px 16px 10px;">
                    <p style="font-weight:700;font-size:14px;color:#1a1a1a;margin:0 0 3px;">${escapeHtml(day.location || '')}</p>
                    <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0;">${escapeHtml(day.loc_desc || '')}</p>
                </div>
                <div id="ai-food-hero-${day.day}" style="position:relative;height:90px;background:${_GRAD[(i+4) % _GRAD.length]};background-size:cover;background-position:center;display:flex;align-items:flex-end;">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%);"></div>
                    <div style="position:relative;z-index:1;padding:8px 14px 10px;display:flex;align-items:center;gap:6px;">
                        <span style="font-size:16px;line-height:1;">🍽️</span>
                        <div>
                            <p style="font-weight:700;font-size:13px;color:#fff;margin:0;text-shadow:0 1px 3px rgba(0,0,0,0.5);">${escapeHtml(day.food || '')}</p>
                            <p style="font-size:11px;color:rgba(255,255,255,0.85);margin:1px 0 0;line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">${escapeHtml(day.food_desc || '')}</p>
                        </div>
                    </div>
                </div>
            </div>`).join('')}
        </div>`;

    if (!loadImages) return;

    for (const day of items) {
        _fetchCityImg(day.loc_img_query || `${data.city} ${day.location}`, 800).then(url => {
            if (!url) return;
            const div = document.getElementById(`ai-hero-${day.day}`);
            if (div) div.style.backgroundImage = `linear-gradient(to top,rgba(0,0,0,0.62) 0%,transparent 55%), url(${url})`;
        });
        if (day.food) {
            _fetchCityImg(day.food_img_query || `${day.food} food dish`, 600).then(url => {
                if (!url) return;
                const fdiv = document.getElementById(`ai-food-hero-${day.day}`);
                if (fdiv) fdiv.style.backgroundImage = `linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%), url(${url})`;
            });
        }
    }
}

// ── Planner Preview Card ───────────────────────────────────────────────────
function _renderAiPlannerPreview(data) {
    let previewEl = document.getElementById('ai-plan-preview-section');
    if (!previewEl) {
        const paxSection = document.getElementById('pax-events-planner-section');
        if (!paxSection?.parentNode) return;
        previewEl = document.createElement('div');
        previewEl.id = 'ai-plan-preview-section';
        paxSection.parentNode.insertBefore(previewEl, paxSection);
    }

    const first = data.itinerary?.[0];
    previewEl.innerHTML = `
        <div style="background:#FDFCF8;border:1.5px solid #e8f4d0;border-radius:20px;padding:14px 16px 16px;margin-bottom:8px;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:18px;">✨</span>
                    <div>
                        <p style="font-weight:800;font-size:13px;color:#1a1a1a;margin:0;">Son AI Planı</p>
                        <p style="font-size:11px;color:#A3C14A;font-weight:700;margin:0;">${escapeHtml(data.city)} · ${data.days} Gün</p>
                    </div>
                </div>
                <button id="btn-view-ai-preview" style="background:#A3C14A;color:#fff;font-size:11px;font-weight:700;border:none;border-radius:999px;padding:5px 14px;cursor:pointer;">Görüntüle</button>
            </div>
            ${first ? `
            <div style="background:#fff;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;">
                <span style="font-size:16px;margin-top:1px;">📍</span>
                <div>
                    <p style="font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 2px;">Gün 1 — ${escapeHtml(first.location || '')}</p>
                    <p style="font-size:11px;color:#6b7280;margin:0;line-height:1.4;">${escapeHtml((first.loc_desc || '').slice(0, 80))}${(first.loc_desc || '').length > 80 ? '…' : ''}</p>
                </div>
            </div>` : ''}
        </div>`;

    document.getElementById('btn-view-ai-preview')?.addEventListener('click', openAiItineraryModal);
}

export function maybeRestoreAiPreview() {
    try {
        const saved = localStorage.getItem(_AI_STORAGE_KEY);
        if (saved) _renderAiPlannerPreview(JSON.parse(saved));
    } catch { /* ignore */ }
}
