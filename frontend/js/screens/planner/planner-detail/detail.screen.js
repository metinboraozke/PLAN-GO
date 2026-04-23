/**
 * PLANİGO - Planner Detail Screen
 * Handles openPlannerDetail, card builders, hotel options,
 * AI itinerary cards, and budget widget rendering.
 */

import { getPlanDetails, getBudgetCalc } from '../../../services/planner.service.js';
import { setSlice, getSlice }            from '../../../core/store.js';
import { showToast }                     from '../../../core/toast.js';
import { formatPrice, formatDateRange }  from '../../../utils/format.js';
import { escapeHtml, scheduleIconRefresh } from '../../../utils/dom.js';
import { getCityImage }                  from '../../../utils/image-cache.js';

// Body-level delegation: any [data-external-url] click opens via Capacitor
// Browser on native (iOS/Android) or falls back to window.open on web.
// Inline onclick="window.open(...)" handlers were failing in iOS WebView.
if (!window.__externalLinkDelegationInstalled) {
    window.__externalLinkDelegationInstalled = true;
    document.addEventListener('click', async (e) => {
        const el = e.target.closest?.('[data-external-url]');
        if (!el) return;
        const url = el.getAttribute('data-external-url');
        if (!url) return;
        e.preventDefault();
        const Browser = window.Capacitor?.Plugins?.Browser;
        if (Browser?.open) {
            try { await Browser.open({ url, presentationStyle: 'popover' }); return; }
            catch (err) { console.warn('[browser] plugin failed, falling back', err); }
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }, true);
}

// ============================================
// MODULE STATE
// ============================================

/** @type {Object|null} Full PlanDetailsResponse for the currently viewed plan */
let _pdData = null;

/** Index of the currently selected hotel option (0-2) */
let _pdHotelIndex = 0;

/** Gemini AI itinerary cache for the current plan */
let _pdAiItinerary = [];

/** ID of the plan currently open in the detail screen */
let _currentPlanId = null;

/** Timeout ID for the scanning auto-refresh — cleared on back navigation */
let _scanningTimeoutId = null;

// ============================================
// INTERNAL HELPERS
// ============================================

async function _fetchCityImg(query, w = 800) {
    return (await getCityImage(query, w)) || null;
}

/**
 * Parses a flight time string to HH:MM format.
 * Handles ISO timestamps, plain HH:MM, and HH:MM:SS.
 * @param {string|null} t
 * @returns {string}
 */
function _parseFlightTime(t) {
    if (!t) return '--:--';
    if (t.includes('T')) return t.slice(11, 16); // ISO: "2024-10-14T08:30:00"
    if (t.length === 5) return t;                // Already "HH:MM"
    return t.slice(0, 5);                        // "08:30:00" → "08:30"
}


// ============================================
// PLAN DETAIL - OPEN & RENDER
// ============================================

/**
 * Shows a "scanning in progress" state in the detail screen while the backend
 * processes the new plan. Updates the header with the correct trip info and
 * schedules an auto-retry after 8 seconds.
 */
function _showScanningState(details, wishlistId, readOnly) {
    const origin = details?.origin      || 'IST';
    const dest   = details?.destination || '???';

    const nameEl  = document.getElementById('pd-trip-name');
    const routeEl = document.getElementById('pd-route');
    const datesEl = document.getElementById('pd-dates');
    if (nameEl)  nameEl.textContent  = details?.trip_name || `${origin} - ${dest} Trip`;
    if (routeEl) routeEl.textContent = `${origin} ✈ ${dest}`;
    if (datesEl) datesEl.textContent = formatDateRange(details?.start_date, details?.end_date);

    const skeleton = (msg) => `<div class="pd-flight-skeleton">🔍 ${escapeHtml(msg)}</div>`;
    document.getElementById('pd-outbound-card')?.replaceChildren();
    document.getElementById('pd-outbound-card')?.insertAdjacentHTML('afterbegin', skeleton('Gidiş uçuşu taranıyor...'));
    document.getElementById('pd-hotel-card')?.replaceChildren();
    document.getElementById('pd-hotel-card')?.insertAdjacentHTML('afterbegin', skeleton('Oteller taranıyor...'));
    const retCard = document.getElementById('pd-return-card');
    if (retCard) retCard.innerHTML = skeleton('Dönüş uçuşu taranıyor...');

    if (_scanningTimeoutId) clearTimeout(_scanningTimeoutId);
    _scanningTimeoutId = setTimeout(() => openPlannerDetail(wishlistId, readOnly), 8000);
}

/**
 * Opens the planner detail screen for the given wishlist/plan ID.
 * Fetches plan details and budget data, then renders everything.
 * @param {string} wishlistId
 * @param {boolean} [readOnly=false] - Hide the confirm button when true
 */
export async function openPlannerDetail(wishlistId, readOnly = false) {
    _currentPlanId = wishlistId;
    _pdHotelIndex  = 0;
    _pdData        = null;
    _pdAiItinerary = [];

    // Scroll reset ÖNCE — planner'da aşağı scroll yapılmışsa sonra Harita'ya
    // geçişte body scrollY map'i aşağı itiyor.
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.getElementById('app')?.scrollTo?.(0, 0);

    document.getElementById('screen-planner').classList.add('hidden');
    const detailScreen = document.getElementById('screen-planner-detail');
    detailScreen.classList.remove('hidden');
    detailScreen.scrollTop = 0;
    detailScreen.querySelectorAll('[class*="overflow-y"], .pd-body').forEach(el => {
        el.scrollTop = 0;
    });

    // Show combined action bar
    const actionBar = document.getElementById('pd-action-bar');
    if (actionBar) actionBar.style.display = '';

    // Hide confirm button if read-only (already confirmed plan)
    const confirmBtn = document.getElementById('pd-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = readOnly ? 'none' : '';

    // Load rich detail from the plans/:id/details endpoint
    const { data: details } = await getPlanDetails(wishlistId);

    // Use real data if available; otherwise show scanning state or no-data placeholders
    const hasRealData  = !!(details?.outbound_flight || (details?.hotel_options?.length > 0));
    const scrapeStatus = details?.scrape_status || 'pending';
    const isScanning   = !details || scrapeStatus === 'pending' || scrapeStatus === 'scanning';
    const scanFailed   = scrapeStatus === 'error';
    const noData       = scrapeStatus === 'no_data';

    let effectiveData;
    if (hasRealData) {
        effectiveData = details;
    } else if (isScanning) {
        _showScanningState(details, wishlistId, readOnly);
        return;
    } else if (noData) {
        // API boş döndü: placeholder kartları göster
        effectiveData = details || {};
        _showRetryButton(wishlistId);
    } else if (scanFailed) {
        effectiveData = details || {};
        showToast('Fiyat taraması başarısız oldu.', 'error');
        _showRetryButton(wishlistId);
    } else {
        // scrape_status="ready" ama veri yok → Paris mock GÖSTERİLMEZ, placeholder'lar göster
        effectiveData = details || {};
        showToast('Bu tarih için fiyat henüz bulunamadı.', 'info');
    }

    _pdData = effectiveData;
    renderPlannerDetail(effectiveData);

    // Budget widget — sadece gerçek veri varsa API çağır
    if (hasRealData) {
        const { data: budget } = await getBudgetCalc(wishlistId, 0);
        if (budget) renderPdBudgetWidget(budget);
    } else {
        // Gerçek veri yok: bütçe alanlarını kullanıcının girdiği hedef bütçeyle göster
        renderPdBudgetWidget({
            total_cost:    0,
            target_budget: details?.budget || null,
            currency:      'TRY',
            label:         'en-iyi-teklif',
            label_text:    'Fiyat Bekleniyor',
            label_icon:    '🔍',
            savings:       null,
            overage:       null,
            usage_percent: null,
        });
    }
}

/**
 * Renders all sections of the planner detail screen from a data object.
 * @param {Object} data - PlanDetailsResponse (real or mock)
 */
export function renderPlannerDetail(data) {
    const origin = data.origin      || 'IST';
    const dest   = data.destination || '???';

    document.getElementById('pd-route').textContent     = `${origin} ✈ ${dest}`;
    document.getElementById('pd-trip-name').textContent = data.trip_name || `${dest} Trip`;
    document.getElementById('pd-dates').textContent     = formatDateRange(data.start_date, data.end_date);

    // Trip type pill
    const tripType = (data.trip_type || 'bireysel').toLowerCase();
    setPdTripType(tripType.includes('tur') ? 'tur' : 'bireysel');

    // Outbound flight card
    const _noDataMsg = data.scrape_status === 'no_data'
        ? 'Uçuş fiyatı bulunamadı'
        : 'Gidiş uçuşu verisi bekleniyor';
    const _noHotelMsg = data.scrape_status === 'no_data'
        ? 'Otel fiyatı bulunamadı'
        : 'Konaklama verisi bekleniyor';
    const _noRetMsg = data.scrape_status === 'no_data'
        ? 'Dönüş uçuşu fiyatı bulunamadı'
        : 'Dönüş uçuşu verisi bekleniyor';

    document.getElementById('pd-outbound-card').innerHTML =
        data.outbound_flight
            ? buildFlightCardHtml(data.outbound_flight, false, data.start_date)
            : pdNoDataHtml(_noDataMsg);

    // Hotel card + options strip
    const hotels = data.hotel_options || [];
    const selIdx = data.selected_hotel_index || 0;
    document.getElementById('pd-hotel-card').innerHTML =
        hotels.length
            ? buildHotelCardHtml(hotels[selIdx], data.nights || 0)
            : pdNoDataHtml(_noHotelMsg);
    renderHotelOptions(hotels, selIdx);

    // AI plans — async Gemini fetch (falls back to static templates)
    refreshAiPlans();

    // Return flight section — daima görünür; veri yoksa placeholder göster
    const retSection = document.getElementById('pd-return-section');
    if (retSection) {
        retSection.style.display = '';
        const retCard = document.getElementById('pd-return-card');
        if (retCard) {
            retCard.innerHTML = data.return_flight
                ? buildFlightCardHtml(data.return_flight, true, data.end_date)
                : pdNoDataHtml(_noRetMsg);
        }
    }

    scheduleIconRefresh();
}

// ============================================
// PLAN DETAIL - CARD BUILDERS
// ============================================

/**
 * Builds the inner HTML for a flight card.
 * @param {Object}  f         - Flight data object
 * @param {boolean} [isReturn=false] - Controls arrow accent colour
 * @param {string|null} [planDate=null] - Plan start/end date (YYYY-MM-DD) for building Aviasales URL
 * @returns {string} HTML string
 */
function _buildFlightSearchUrl(depCode, arrCode, dateStr) {
    if (!depCode || !arrCode || !dateStr || dateStr === 'None' || depCode === '---') return null;
    try {
        const d  = new Date(String(dateStr).substring(0, 10) + 'T12:00:00Z');
        const yy = String(d.getUTCFullYear()).slice(-2);          // "26"
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); // "05"
        const dd = String(d.getUTCDate()).padStart(2, '0');       // "15"
        return `https://www.skyscanner.com/transport/flights/${depCode.toLowerCase()}/${arrCode.toLowerCase()}/${yy}${mm}${dd}/`;
    } catch (_) { return null; }
}

export function buildFlightCardHtml(f, isReturn = false, planDate = null) {
    const depTime  = _parseFlightTime(f.departure_time);
    const arrTime  = _parseFlightTime(f.arrival_time);
    const depCode  = String(f.departure_code || '---');
    const arrCode  = String(f.arrival_code   || '---');
    const depCity  = String(f.departure_city || depCode);
    const arrCity  = String(f.arrival_city   || arrCode);
    const airline  = String(f.airline        || '');
    const duration = f.duration ? String(f.duration) : '';
    const stops    = f.stops > 0 ? `${f.stops} Aktarma` : 'Direkt';
    const logo     = f.airline_logo_url || `https://content.airhex.com/content/logos/airlines_${airline}_35_35_t.png`;
    const price    = formatPrice(f.price || 0, f.currency || 'TRY');

    const flightLink = f.link || _buildFlightSearchUrl(depCode, arrCode, planDate) || null;

    return `
    <div class="pd-flight-card">
        <div class="pd-flight-meta">
            <div class="pd-flight-airline">
                <img src="${logo}" class="pd-flight-logo" onerror="this.style.display='none'">
                <span class="pd-flight-airline-name">${escapeHtml(airline)}</span>
            </div>
            <span class="pd-flight-price">${price}</span>
        </div>
        <div class="pd-flight-route">
            <div class="pd-flight-port">
                <div class="pd-flight-time">${depTime}</div>
                <div class="pd-flight-code">${escapeHtml(depCode)}</div>
                <div class="pd-flight-city">${escapeHtml(depCity)}</div>
            </div>
            <div class="pd-flight-mid">
                <div class="pd-flight-duration">${escapeHtml(duration)}</div>
                <div class="pd-flight-arrow-row">
                    <div class="pd-flight-arrow-line"></div>
                    <span style="font-size:16px;color:#FF6B35">✈</span>
                    <div class="pd-flight-arrow-line"></div>
                </div>
                <div class="pd-flight-stops">${stops}</div>
            </div>
            <div class="pd-flight-port">
                <div class="pd-flight-time">${arrTime}</div>
                <div class="pd-flight-code">${escapeHtml(arrCode)}</div>
                <div class="pd-flight-city">${escapeHtml(arrCity)}</div>
            </div>
        </div>
        ${flightLink ? `<button type="button" data-external-url="${escapeHtml(flightLink)}"
            class="pd-booking-btn pd-booking-btn--flight">✈ Uçuşu Rezerve Et →</button>` : ''}
    </div>`;
}

/**
 * Builds the inner HTML for a hotel card.
 * @param {Object} h      - Hotel data object
 * @param {number} nights - Number of nights for display
 * @returns {string} HTML string
 */
export function buildHotelCardHtml(h, nights) {
    const img      = h.image_url   || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80&fm=jpg';
    const name     = h.hotel_name  || 'Otel';
    const addr     = h.address     || '';
    const stars    = h.stars       || 3;
    const bookLink = h.link        || null;
    const starsHtml = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));

    return `
    <div class="pd-hotel-card">
        <img src="${img}" class="pd-hotel-image" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80&fm=jpg'">
        <div class="pd-hotel-overlay">
            <div class="pd-hotel-stars" style="color:#F59E0B;font-size:13px">${starsHtml}</div>
            <div class="pd-hotel-name">${escapeHtml(name)}</div>
            ${addr ? `<div class="pd-hotel-address">${escapeHtml(addr)}</div>` : ''}
        </div>
        ${nights ? `<div class="pd-hotel-nights">${nights} Gece</div>` : ''}
        ${bookLink ? `
        <button type="button" data-external-url="${escapeHtml(bookLink)}"
           class="pd-booking-btn pd-booking-btn--hotel">
            🏨 Booking.com'da Rezerve Et →
        </button>` : ''}
    </div>`;
}

/**
 * Renders the horizontal hotel-option thumbnail strip.
 * @param {Object[]} hotels      - Array of hotel option objects
 * @param {number}   selectedIdx - Index of the currently selected hotel
 */
export function renderHotelOptions(hotels, selectedIdx) {
    const container = document.getElementById('pd-hotel-options');
    if (!container) return;
    if (!hotels.length) { container.innerHTML = ''; return; }

    container.innerHTML = hotels.map((h, i) => {
        const img   = h.image_url   || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60&fm=jpg';
        const name  = h.hotel_name  || 'Otel';
        const stars = '★'.repeat(h.stars || 3);
        const price = formatPrice(h.total_price || 0, h.currency || 'TRY');
        const sel   = i === selectedIdx ? 'selected' : '';

        return `
        <div class="pd-hotel-opt ${sel}" onclick="window._pdSelectHotelOption(${i})">
            <img src="${img}" class="pd-hotel-opt-thumb" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60&fm=jpg'">
            <div class="pd-hotel-opt-info">
                <div class="pd-hotel-opt-name">${escapeHtml(name)}</div>
                <div class="pd-hotel-opt-stars">${stars}</div>
            </div>
            <div class="pd-hotel-opt-price">${price}</div>
        </div>`;
    }).join('');
}

// ============================================
// AI PLANS
// ============================================

const _AI_CARD_GRADS = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)',
    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
    'linear-gradient(135deg,#ffecd2,#fcb69f)',
    'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
];

/**
 * Fetches (or uses cached) Gemini AI itinerary and re-renders the AI cards strip.
 * Falls back to the static ai_day_plans array already embedded in plan data.
 */
export async function refreshAiPlans() {
    if (!_currentPlanId || !_pdData) return;
    const thisPlanId = _currentPlanId; // race-condition guard

    // 1) Use Gemini-format data already stored on the plan — skip a fresh network call.
    //    Gemini format has {location, ...}; static templates have {baslik, gun} — no `location` field.
    const cachedPlans   = _pdData?.ai_day_plans || [];
    const isGeminiFormat = cachedPlans.length > 0 && !!cachedPlans[0].location;
    if (isGeminiFormat) {
        _pdAiItinerary = cachedPlans;
        renderAiCards(_pdAiItinerary, true);
        return;
    }

    // 2) No cached Gemini data — call the generate endpoint.
    const container = document.getElementById('pd-ai-scroll');
    if (container) container.innerHTML = `<div class="pd-flight-skeleton" style="width:150px;flex-shrink:0;">AI yükleniyor...</div>`;
    _pdAiItinerary = [];

    const rawCity = _pdData.destination || '';
    const city    = rawCity.split(',')[0].trim() || rawCity;
    const days    = Math.max(1, Math.min(_pdData.nights || 3, 14));

    if (!city) { renderAiCards(cachedPlans); return; }

    try {
        const result = await generateItinerary(city, days);
        if (_currentPlanId !== thisPlanId) return; // plan changed while awaiting
        if (result?.data?.itinerary?.length) {
            _pdAiItinerary = result.data.itinerary;
            renderAiCards(_pdAiItinerary, true);
            return;
        }
    } catch (_) { /* Gemini error → fall through to static fallback */ }

    if (_currentPlanId !== thisPlanId) return;
    renderAiCards(cachedPlans);
}

/**
 * Renders the horizontal AI day-plan cards strip.
 * @param {Object[]} plans          - Array of day-plan objects
 * @param {boolean}  [isLive=false] - When true, async-fetches hero images
 */
export function renderAiCards(plans, isLive = false) {
    const container = document.getElementById('pd-ai-scroll');
    if (!container) return;

    if (!plans.length) {
        container.innerHTML = pdNoDataHtml('AI önerileri hazırlanıyor...');
        return;
    }

    const city = _pdData?.destination?.split(',')[0]?.trim() || '';

    container.innerHTML = plans.map((p, i) => {
        const dayNum = p.day || p.gun || (i + 1);
        const place  = p.location || p.title || p.baslik || p.activity || `Gün ${dayNum}`;
        const food   = p.food || p.meal || p.yemek || null;
        const grad   = _AI_CARD_GRADS[i % _AI_CARD_GRADS.length];

        return `
        <div class="pd-ai-card" onclick="window._pdOpenAiDetailModal(${i})" style="cursor:pointer;">
            <div id="pdai-scroll-hero-${dayNum}" style="position:relative;height:88px;background:${grad};background-size:cover;background-position:center;overflow:hidden;">
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%);"></div>
                <span style="position:absolute;bottom:6px;left:8px;background:#A3C14A;color:#fff;font-size:9px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:2px 8px;">GÜN ${dayNum}</span>
            </div>
            <div class="pd-ai-card-body">
                <div class="pd-ai-card-title">${escapeHtml(place)}</div>
                ${food ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;display:flex;align-items:center;gap:3px;"><span>🍽️</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${escapeHtml(food)}</span></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Async-fetch location images and set them as CSS background-image
    plans.forEach((p, i) => {
        const dayNum = p.day || p.gun || (i + 1);
        const place  = p.location || p.title || p.baslik || '';
        const query  = [city, place].filter(Boolean).join(' ');
        if (!query.trim()) return;
        _fetchCityImg(query, 400).then(url => {
            if (!url) return;
            const div = document.getElementById('pdai-scroll-hero-' + dayNum);
            if (div) div.style.backgroundImage =
                'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%), url(' + url + ')';
        });
    });
}

// ============================================
// AI DETAIL MODAL
// ============================================

/**
 * Opens the full-screen AI itinerary detail modal for the given day index.
 * If no itinerary is cached, triggers a fresh fetch first.
 * @param {number} [index=0] - Day card index that was tapped (reserved for future use)
 */
export async function openAiDetailModal(index = 0) {
    const modal = document.getElementById('modal-pd-ai-detail');
    if (!modal) return;

    // Load itinerary if not yet available
    if (!_pdAiItinerary.length && !(_pdData?.ai_day_plans?.length)) {
        showToast('AI planı yükleniyor...', 'info');
        await refreshAiPlans();
    }

    const items = _pdAiItinerary.length ? _pdAiItinerary : (_pdData?.ai_day_plans || []);
    if (!items.length) { showToast('AI önerisi alınamadı', 'error'); return; }

    const city = _pdData?.destination || '';

    const sub = document.getElementById('pd-ai-detail-subtitle');
    if (sub) sub.textContent = city
        ? `${city} · ${items.length} Günlük Plan`
        : `${items.length} Günlük Plan`;

    const GRAD = _AI_CARD_GRADS;

    const body = document.getElementById('pd-ai-detail-body');
    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;padding-bottom:8px;">' +
        items.map((p, i) => {
            const dayNum  = p.day  || p.gun  || (i + 1);
            const place   = p.location || p.place || p.title || p.baslik || p.activity || ('Gün ' + dayNum);
            const locDesc = p.loc_desc  || p.description || p.desc  || '';
            const food    = p.food || p.meal || p.restaurant || p.yemek || '';
            const foodDesc = p.food_desc || p.meal_desc || p.yemek_desc || '';
            const grad     = GRAD[i % GRAD.length];
            const foodGrad = GRAD[(i + 4) % GRAD.length];

            return (
                '<div id="pdai-card-' + dayNum + '" style="border-radius:24px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);background:#fff;font-family:\'Plus Jakarta Sans\',sans-serif;">' +
                    '<div id="pdai-loc-hero-' + dayNum + '" style="position:relative;height:160px;background:' + grad + ';background-size:cover;background-position:center;display:flex;align-items:flex-end;">' +
                        '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.1) 60%,transparent 100%);"></div>' +
                        '<div style="position:relative;z-index:1;padding:10px 14px 12px;width:100%;">' +
                            '<div style="display:flex;justify-content:space-between;align-items:flex-end;">' +
                                '<span style="background:#A3C14A;color:#fff;font-size:10px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:3px 12px;">GÜN ' + dayNum + '</span>' +
                                '<span style="color:rgba(255,255,255,0.9);font-size:18px;line-height:1;">📍</span>' +
                            '</div>' +
                            '<p style="margin:6px 0 0;font-weight:800;font-size:15px;color:#fff;line-height:1.3;text-shadow:0 1px 4px rgba(0,0,0,0.5);">' + escapeHtml(place) + '</p>' +
                            (locDesc ? '<p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,0.85);line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">' + escapeHtml(locDesc) + '</p>' : '') +
                        '</div>' +
                    '</div>' +
                    '<div id="pdai-food-hero-' + dayNum + '" style="position:relative;height:100px;background:' + foodGrad + ';background-size:cover;background-position:center;display:flex;align-items:flex-end;">' +
                        '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%);"></div>' +
                        '<div style="position:relative;z-index:1;padding:8px 14px 12px;width:100%;">' +
                            '<div style="display:flex;align-items:center;gap:6px;">' +
                                '<span style="font-size:16px;line-height:1;">🍽️</span>' +
                                '<div>' +
                                    '<p style="margin:0;font-weight:700;font-size:13px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.5);">' + escapeHtml(food || 'Yerel lezzet') + '</p>' +
                                    (foodDesc ? '<p style="margin:1px 0 0;font-size:11px;color:rgba(255,255,255,0.85);line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">' + escapeHtml(foodDesc) + '</p>' : '') +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join('') +
    '</div>';

    modal.classList.remove('hidden');

    // Asynchronously load hero images (location + food)
    items.forEach((p, i) => {
        const dayNum = p.day || p.gun || (i + 1);
        const place  = p.location || p.title || p.baslik || '';
        const food   = p.food || p.meal || p.yemek || '';

        const locQuery = p.loc_img_query || [city, place].filter(Boolean).join(' ');
        if (locQuery.trim()) {
            _fetchCityImg(locQuery, 800).then(url => {
                if (!url) return;
                const div = document.getElementById('pdai-loc-hero-' + dayNum);
                if (div) div.style.backgroundImage =
                    'linear-gradient(to top,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.1) 60%,transparent 100%), url(' + url + ')';
            });
        }

        if (food.trim()) {
            _fetchCityImg(p.food_img_query || food + ' food dish', 600).then(url => {
                if (!url) return;
                const fdiv = document.getElementById('pdai-food-hero-' + dayNum);
                if (fdiv) fdiv.style.backgroundImage =
                    'linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%), url(' + url + ')';
            });
        }
    });
}

/**
 * Closes the AI itinerary detail modal.
 */
export function closePdAiDetailModal() {
    document.getElementById('modal-pd-ai-detail')?.classList.add('hidden');
}

// ============================================
// HOTEL OPTION SELECTION
// ============================================

/**
 * Selects a hotel option by index, updates the preview card and budget widget.
 * @param {number} index
 */
export async function selectHotelOption(index) {
    if (!_currentPlanId) return;
    _pdHotelIndex = index;

    // Update selected highlight
    document.querySelectorAll('.pd-hotel-opt').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });

    // Update main hotel card preview
    if (_pdData?.hotel_options?.length > index) {
        const h = _pdData.hotel_options[index];
        document.getElementById('pd-hotel-card').innerHTML =
            buildHotelCardHtml(h, _pdData.nights || 0);
    }

    // Recalculate budget for the new hotel selection
    const { data: budget } = await getBudgetCalc(_currentPlanId, index);
    if (budget) renderPdBudgetWidget(budget);
}

// ============================================
// BUDGET WIDGET
// ============================================

/**
 * Fills the pd-budget-* DOM elements with budget data.
 * @param {Object} budget - BudgetCalcResponse
 */
export function renderPdBudgetWidget(budget) {
    const totalEl = document.getElementById('pd-total-budget');
    if (totalEl) totalEl.textContent = formatPrice(budget.total_cost || 0, budget.currency || 'TRY');

    const targetEl = document.getElementById('pd-target-budget');
    if (targetEl) {
        targetEl.textContent = budget.target_budget
            ? formatPrice(budget.target_budget, budget.currency || 'TRY')
            : '—';
    }

    const badge = document.getElementById('pd-budget-badge');
    if (!badge) return;

    if (budget.savings && budget.savings > 0 && budget.usage_percent) {
        const pct = Math.round(100 - budget.usage_percent);
        badge.textContent = `%${pct} Tasarruf`;
        badge.style.background = '';
        badge.classList.remove('hidden');
    } else if (budget.label === 'tam-butce') {
        badge.textContent = (budget.label_icon || '') + ' Bütçede';
        badge.style.background = '';
        badge.classList.remove('hidden');
    } else if (budget.overage && budget.overage > 0) {
        badge.textContent = (budget.label_icon || '') + ' Aşım';
        badge.style.background = '#F97316';
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================
// INTERNAL HELPERS (non-exported)
// ============================================

/**
 * Sets the trip-type pill active state.
 * @param {'bireysel'|'tur'} type
 */
export function setPdTripType(type) {
    document.getElementById('pd-pill-bireysel')?.classList.toggle('active', type === 'bireysel');
    document.getElementById('pd-pill-tur')?.classList.toggle('active', type === 'tur');
}

/**
 * Returns an inline skeleton placeholder HTML string.
 * @param {string} msg
 * @returns {string}
 */
function pdNoDataHtml(msg) {
    return `<div class="pd-flight-skeleton">${escapeHtml(msg)}</div>`;
}

// ============================================
// GLOBAL BRIDGE (inline onclick handlers)
// These window assignments let HTML inline handlers call module functions.
// ============================================

/** Expose current plan ID so detail.confirm.js can read it */
export function getCurrentPlanId() { return _currentPlanId; }

/** Cancel any pending scanning auto-refresh timeout — call on back navigation */
export function cancelPlanDetailRefresh() {
    if (_scanningTimeoutId) {
        clearTimeout(_scanningTimeoutId);
        _scanningTimeoutId = null;
    }
}

// Bridge for hotel-option onclick (generated in renderHotelOptions)
window._pdSelectHotelOption = selectHotelOption;

// Bridge for AI card onclick (generated in renderAiCards)
window._pdOpenAiDetailModal = openAiDetailModal;

// Bridge for modal close button used in HTML
window.closePdAiDetailModal = closePdAiDetailModal;

export function toggleHotelOptions() {
    const opts    = document.getElementById('pd-hotel-options');
    const chevron = document.getElementById('pd-hotel-chevron');
    if (!opts || !chevron) return;
    const isOpen = !opts.classList.contains('hidden');
    opts.classList.toggle('hidden', isOpen);
    chevron.classList.toggle('open', !isOpen);
}
