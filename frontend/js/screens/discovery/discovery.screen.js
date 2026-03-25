/**
 * PLANİGO - Discovery Screen
 * Tam implementasyon — app.js satır 2137-2893 buraya taşındı.
 * window._discoveryModuleActive = true → app.js discovery kodları bypass edilir.
 */

import * as svc from '../../services/discovery.service.js';
import { API_BASE } from '../../config.js';
import { DISCOVER_FILTER_CATEGORIES } from '../../config.js';
import { setSlice, getSlice } from '../../core/store.js';
import { showToast } from '../../core/toast.js';
import { formatPrice } from '../../utils/format.js';
import { escapeHtml } from '../../utils/dom.js';
import { getCityImage } from '../../utils/image-cache.js';

window._discoveryModuleActive = true;

// ── Budget lazy-load state ────────────────────────────────────────────────────
let _allBudgetRoutes    = [];
let _budgetRenderedCount = 0;
const BUDGET_PAGE_SIZE  = 4;

// ── Entry point ───────────────────────────────────────────────────────────────

export async function loadDiscoveryFull(filter = null) {
    setSlice('ui', { loading: { ...getSlice('ui').loading, discovery: true } });

    // Skeleton on first load
    if (!getSlice('discovery').data) {
        const dealCard = document.getElementById('deal-of-day-card');
        if (dealCard) dealCard.innerHTML =
            '<div class="skeleton-card w-full h-full aspect-[16/10]"></div>';
    }

    renderDiscoveryFilterPills(DISCOVER_FILTER_CATEGORIES, filter);

    const _catMap  = { visa_free: 'vizesiz', under_5k: 'bütçe-dostu' };
    const discoverCat = filter ? (_catMap[filter] || filter) : '';
    const isVizesiz   = (filter === 'vizesiz' || filter === 'visa_free');
    const isBudget    = (filter === 'under_5k' || filter === 'bütçe-dostu');

    const [heroRes, dealsRes, vizesizRes, budgetRes] = await Promise.all([
        svc.discoverHero(),
        (isVizesiz || isBudget) ? Promise.resolve({ data: null }) : svc.discoverDeals(discoverCat),
        isVizesiz ? svc.discoverVizesiz() : Promise.resolve({ data: null }),
        svc.discoverBudgetFriendly(),
    ]);

    const normalDeals  = (dealsRes?.data?.deals || []).map(_normalizeDeal);
    const budgetRoutes = budgetRes?.data?.routes  || [];

    const data = {
        deal_of_the_day:        heroRes?.data  ? _normalizeHero(heroRes.data) : null,
        budget_escapes:         budgetRoutes.length > 0 ? budgetRoutes : normalDeals,
        visa_free_gems:         [],
        featured_deals:         [],
        vizesiz_routes:         vizesizRes?.data?.routes || [],
        budget_friendly_routes: budgetRes?.data?.routes  || [],
    };

    setSlice('discovery', { data, activeFilter: filter });
    renderDiscoveryFull(data, filter);
    setSlice('ui', { loading: { ...getSlice('ui').loading, discovery: false } });
}

export function setupDiscoveryListeners() {
    // Handled in renderDiscoveryFilterPills dynamically
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function _normalizeHero(h) {
    return {
        title:                 h.city_name || h.title || '',
        city_name:             h.city_name || '',
        image_url:             h.image_url || '',
        destination_image_url: h.image_url || '',
        discounted_price:      h.discounted_price || h.price || 0,
        original_price:        h.original_price || null,
        currency:              h.currency || 'TRY',
        nights:                h.nights || 3,
        airline:               h.airline || null,
        route:                 h.route   || null,
        discount_rate:         h.discount_rate || null,
        is_live:               h.is_live  ?? true,
        is_visa_free:          h.is_visa_free ?? h.visa_free ?? false,
        remaining_hours:       h.remaining_hours || 0,
        affiliate_url:         h.affiliate_url || null,
    };
}

function _normalizeDeal(d) {
    return {
        city:           d.city        || d.city_name   || '',
        country:        d.country     || '',
        starting_price: d.price       || 0,
        currency:       d.currency    || 'TRY',
        nights:         d.nights      || parseInt(d.duration) || 3,
        flight_duration:d.flight_duration || d.flight_time || '',
        is_visa_free:   d.is_visa_free ?? d.visa_free ?? false,
        seats_left:     d.seats_left  || null,
        discount_badge: d.discount_badge || null,
        image_url:      d.image_url   || '',
        rating:         d.rating      || null,
        tags:           d.tags        || [],
        affiliate_url:  d.affiliate_url || null,
    };
}

// ── Filter pills ──────────────────────────────────────────────────────────────

function renderDiscoveryFilterPills(categories, activeFilter) {
    const container = document.getElementById('discovery-filter-pills');
    if (!container) return;

    container.innerHTML = categories.map(c => {
        const isActive = activeFilter === c.filter || (!activeFilter && c.filter === null);
        return `<button class="filter-pill${isActive ? ' active' : ''}" data-filter="${c.id}">
            <i data-lucide="${c.icon}" class="w-4 h-4"></i> ${c.label}
        </button>`;
    }).join('');

    window.lucide?.createIcons();

    container.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', e => {
            const cat   = e.currentTarget.dataset.filter;
            const found = DISCOVER_FILTER_CATEGORIES.find(c => c.id === cat);
            _requestDiscoveryFilter(found?.filter ?? null, e.currentTarget);
        });
    });
}

function _requestDiscoveryFilter(filterType, btn) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    loadDiscoveryFull(filterType);
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderDiscoveryFull(data, activeFilter) {
    if (!data) return;

    const dealSection    = document.getElementById('deal-of-day-section');
    const escapesSection = document.getElementById('budget-escapes-section');
    const gemsSection    = document.getElementById('visa-free-gems-section');
    const dynamicContent = document.getElementById('discovery-dynamic-content');

    const contentWrapper = document.querySelector('#screen-discovery .px-4.py-4');
    if (contentWrapper) {
        contentWrapper.classList.add('animate-fade-in');
        setTimeout(() => contentWrapper.classList.remove('animate-fade-in'), 300);
    }

    if (!activeFilter || activeFilter === 'all') {
        dealSection?.classList.remove('hidden');
        escapesSection?.classList.remove('hidden');
        gemsSection?.classList.remove('hidden');
        document.getElementById('viral-stories-section')?.classList.add('hidden');
        document.getElementById('vizesiz-section')?.classList.add('hidden');
        document.getElementById('budget-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        renderDealOfDay(data.deal_of_the_day);
        renderPaxSuggestions();
        renderBudgetEscapes(data.budget_escapes, null);
        renderVisaFreeGems(data.visa_free_gems, null);
    }
    else if (activeFilter === 'vizesiz' || activeFilter === 'visa_free') {
        dealSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');
        document.getElementById('viral-stories-section')?.classList.add('hidden');
        document.getElementById('budget-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        const vizesizSection = document.getElementById('vizesiz-section');
        vizesizSection?.classList.remove('hidden');
        vizesizSection?.classList.add('filter-fade-in');
        setTimeout(() => vizesizSection?.classList.remove('filter-fade-in'), 500);

        renderVizesizSection(data.vizesiz_routes || []);
    }
    else if (activeFilter === 'under_5k' || activeFilter === 'bütçe-dostu') {
        dealSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');
        document.getElementById('viral-stories-section')?.classList.add('hidden');
        document.getElementById('vizesiz-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        const budgetSection = document.getElementById('budget-section');
        budgetSection?.classList.remove('hidden');
        budgetSection?.classList.add('filter-fade-in');
        setTimeout(() => budgetSection?.classList.remove('filter-fade-in'), 500);

        renderBudgetFriendlySection(data.budget_friendly_routes || []);
    }
    else if (activeFilter === 'summer') {
        dealSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');
        document.getElementById('viral-stories-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = _renderEmptyState('summer');
    }

    window.lucide?.createIcons();
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderDealOfDay(deal) {
    const dealCard = document.getElementById('deal-of-day-card');
    if (!dealCard || !deal) return;

    const title        = deal.title || deal.city_name || '—';
    const priceDisplay = deal.discounted_price || deal.price || 0;
    const nights       = deal.nights || 3;
    const imgSrc       = deal.image_url || deal.destination_image_url || '';

    const liveBadge     = deal.is_live
        ? '<span class="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse z-20">🔴 CANLI</span>'
        : '';
    const visaBadge     = (deal.is_visa_free === true || deal.visa_free === true)
        ? '<span class="deal-visa-badge">Vizesiz ✓</span>' : '';
    const discountBadge = deal.discount_rate
        ? `<div class="deal-card-badge">%${deal.discount_rate} İNDİRİM</div>` : '';
    const priceStrike   = deal.original_price
        ? `<p class="text-white/50 text-xs line-through mb-1">${formatPrice(deal.original_price, deal.currency)}</p>` : '';
    const airlineRow    = deal.airline
        ? `<p class="text-sm text-white/80 mb-3 flex items-center gap-1">✈️ ${deal.airline} • ${deal.route || ''}</p>` : '';

    dealCard.innerHTML = `
        <div class="deal-card-wide relative" style="aspect-ratio:16/10">
            ${liveBadge}
            <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" class="w-full h-full object-cover">
            <div class="deal-card-overlay-gradient"></div>
            ${visaBadge}
            ${discountBadge}
            <div class="deal-card-content">
                <h3 class="text-xl font-bold text-white mb-1">${escapeHtml(title)}</h3>
                ${airlineRow}
                <div class="deal-nights-row">🌙 ${nights} Gece &nbsp;•&nbsp; ☀️ ${nights + 1} Gün</div>
                <div class="flex items-center justify-between">
                    <div>
                        ${priceStrike}
                        <span class="text-white/60 text-[10px] block mb-0.5">başlayan fiyatlarla</span>
                        <div class="deal-price-pill">${formatPrice(priceDisplay, deal.currency)}</div>
                    </div>
                    <button class="btn-book-now">Rezervasyon ➝</button>
                </div>
            </div>
        </div>
    `;

    dealCard.querySelector('.btn-book-now')?.addEventListener('click', () =>
        _openRoute(deal.affiliate_url || null, deal.city_name || deal.title)
    );
}

function renderViralStories(stories) {
    const container = document.getElementById('viral-stories');
    if (!container) return;

    if (stories?.length > 0) {
        container.innerHTML = stories.map(s => {
            const count      = _fmtViewCount(s.view_count);
            const countBadge = count ? `<span class="story-count-badge">${count}</span>` : '';
            return `
            <div class="story-wrapper cursor-pointer transform hover:scale-105 transition-transform"
                 data-action="go-map">
                <div class="story-circle ${s.is_viral ? 'ring-2 ring-accent-orange' : ''}">
                    <img src="${escapeHtml(s.cover_image_url || '')}" alt="${escapeHtml(s.location_name || '')}" class="w-full h-full object-cover">
                </div>
                ${countBadge}
                <span class="story-circle-label">${escapeHtml(s.location_name || '')}</span>
            </div>`;
        }).join('');
        container.querySelectorAll('[data-action="go-map"]').forEach(el =>
            el.addEventListener('click', () => window.navigate?.('map'))
        );
    } else {
        container.innerHTML = '<p class="text-sm text-slate-400">Henüz viral hikaye yok</p>';
    }
}

const _PAX_SUGGESTIONS = [
    { name: 'Zanzibar',       country: 'Tanzanya',     img_q: 'Zanzibar beach tropical' },
    { name: 'Phuket',         country: 'Tayland',      img_q: 'Phuket Thailand beach' },
    { name: 'Ksamil',         country: 'Arnavutluk',   img_q: 'Ksamil Albania turquoise sea' },
    { name: 'Budva',          country: 'Karadağ',      img_q: 'Budva Montenegro old town' },
    { name: 'Sharm El-Sheikh',country: 'Mısır',        img_q: 'Sharm El Sheikh Red Sea resort' },
    { name: 'Batum',          country: 'Gürcistan',    img_q: 'Batumi Georgia seafront' },
    { name: 'Belgrad',        country: 'Sırbistan',    img_q: 'Belgrade Serbia city nightlife' },
    { name: 'Saraybosna',     country: 'Bosna-Hersek', img_q: 'Sarajevo Bosnia old bazaar' },
    { name: 'Kazablanka',     country: 'Fas',           img_q: 'Casablanca Morocco architecture' },
];

function renderPaxSuggestions() {
    const container = document.getElementById('pax-suggestions-scroll');
    if (!container) return;

    // Skeleton
    container.innerHTML = _PAX_SUGGESTIONS.map(() =>
        `<div style="flex-shrink:0;width:140px;height:190px;border-radius:24px;background:#e8e8e0;scroll-snap-align:start;"></div>`
    ).join('');

    _PAX_SUGGESTIONS.forEach((dest, i) => {
        const card = document.createElement('div');
        card.style.cssText = `
            flex-shrink:0; width:140px; height:190px; border-radius:24px;
            overflow:hidden; position:relative; cursor:pointer;
            scroll-snap-align:start; background:#c8d4b0;
            font-family:'Plus Jakarta Sans',sans-serif;
            box-shadow:0 2px 12px rgba(0,0,0,0.10);
        `;
        card.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.08) 55%,transparent 100%);z-index:1;"></div>
            <div style="position:absolute;top:10px;left:10px;z-index:2;background:#A3C14A;color:#fff;
                        font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
                        display:flex;align-items:center;gap:3px;letter-spacing:0.3px;">
                🛂 Vizesiz
            </div>
            <div style="position:absolute;bottom:0;left:0;right:0;z-index:2;padding:12px;">
                <div style="color:#fff;font-size:14px;font-weight:800;line-height:1.2;">${escapeHtml(dest.name)}</div>
                <div style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:500;margin-top:2px;">${escapeHtml(dest.country)}</div>
            </div>
        `;
        card.addEventListener('click', () => openAiPlanWithCity(dest.name));

        const slots = container.children;
        if (slots[i]) container.replaceChild(card, slots[i]);
        else          container.appendChild(card);

        _fetchCityImg(dest.img_q, 400).then(url => {
            if (!url) return;
            card.style.backgroundImage    = `url(${url})`;
            card.style.backgroundSize     = 'cover';
            card.style.backgroundPosition = 'center';
        });
    });
}

function renderBudgetEscapes(escapes, activeFilter) {
    const container = document.getElementById('budget-escapes');
    if (!container) return;
    const top5 = (escapes || []).slice(0, 5);
    container.innerHTML = top5.length > 0
        ? top5.map((e, i) => _renderEscapeCard(e, activeFilter, i)).join('')
        : '<p class="text-sm text-slate-500 p-4">Bu filtreye uygun kaçamak bulunamadı.</p>';

    container.querySelectorAll('.escape-card').forEach(card =>
        card.addEventListener('click', () => _openRoute(card.dataset.link || null, card.dataset.city))
    );
}

function renderVisaFreeGems(gems, activeFilter) {
    const container = document.getElementById('visa-free-gems');
    if (!container) return;
    if (!gems?.length) {
        container.innerHTML = '<p class="text-sm text-slate-500 p-4">Sonuç bulunamadı.</p>';
        return;
    }
    container.innerHTML = gems.map(g => `
        <div class="visa-gem-row flex items-center p-3 bg-white rounded-xl shadow-sm border border-slate-50 cursor-pointer hover:border-slate-200 transition-colors">
            <div class="text-2xl mr-3 bg-slate-50 w-10 h-10 flex items-center justify-center rounded-lg">${g.flag_emoji}</div>
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <p class="font-bold text-slate-800">${escapeHtml(g.city)}, ${escapeHtml(g.country)}</p>
                    ${activeFilter === 'visa_free' ? '<i data-lucide="check-circle-2" class="w-3 h-3 text-green-500"></i>' : ''}
                </div>
                <p class="text-xs text-slate-500 mt-0.5">• ${g.nights} Gece • ${escapeHtml(g.flight_duration || '')}</p>
            </div>
            <div class="text-right">
                <p class="font-bold text-slate-900">${formatPrice(g.price, g.currency)}</p>
                <span class="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">${escapeHtml(g.visa_status || '')}</span>
            </div>
        </div>
    `).join('');
}

// ── Vizesiz section ───────────────────────────────────────────────────────────

function renderVizesizSection(routes) {
    const container = document.getElementById('vizesiz-cards');
    if (!container) return;

    if (!routes?.length) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-10 text-center">
                <span class="text-4xl mb-3">🛂</span>
                <p class="text-sm font-medium text-slate-600">Vizesiz rota bulunamadı.</p>
            </div>`;
        return;
    }
    container.innerHTML = routes.map((r, i) => _renderVizesizCard(r, i)).join('');
    window.lucide?.createIcons();
}

function _renderVizesizCard(route, index = 0) {
    const city     = route.city       || '';
    const country  = route.country    || '';
    const nights   = route.nights     || 3;
    const flight   = route.flight_duration || '';
    const price    = route.price      || 0;
    const currency = route.currency   || 'TRY';
    const imageUrl = route.image_url  || '';
    const citySlug = city.split(',')[0].trim().toLowerCase();
    const deepLink = route.affiliate_url || '#';

    return `
        <div class="vz-card filter-fade-in" style="animation-delay:${index * 80}ms"
             data-action="open-vizesiz" data-link="${escapeHtml(deepLink)}" data-city="${escapeHtml(city)}">
            <div class="vz-card-img">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(city)}"
                     onerror="window.fetchAndSetImage?.(this,'${escapeHtml(citySlug)}',600)">
                <div class="vz-img-overlay"></div>
                <span class="vz-badge">Vizesiz ✓</span>
                <div class="vz-city-block">
                    <h3 class="vz-city-name">${escapeHtml(city)}</h3>
                    <div class="vz-meta-row">
                        <span>🌙 ${nights} Gece</span>
                        ${flight ? `<span>✈️ ${escapeHtml(flight)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="vz-card-footer">
                <div class="vz-footer-left"><span class="vz-country-tag">${escapeHtml(country)}</span></div>
                <div class="vz-footer-right">
                    <span class="vz-price-label">Başlayan fiyatlarla</span>
                    <span class="vz-price">${formatPrice(price, currency)}</span>
                </div>
            </div>
        </div>`;
}

// ── Budget-Friendly section ───────────────────────────────────────────────────

function renderBudgetFriendlySection(routes) {
    const container = document.getElementById('budget-cards');
    if (!container) return;

    _allBudgetRoutes     = routes;
    _budgetRenderedCount = 0;

    document.getElementById('budget-sentinel')?.remove();

    if (!routes?.length) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-10 text-center">
                <span class="text-4xl mb-3">💰</span>
                <p class="text-sm font-medium text-slate-600">Bütçe dostu rota bulunamadı.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    _appendBudgetCards(container);
    _setupBudgetLazyLoad(container);
}

function _appendBudgetCards(container) {
    const nextBatch = _allBudgetRoutes.slice(_budgetRenderedCount, _budgetRenderedCount + BUDGET_PAGE_SIZE);
    if (!nextBatch.length) return;

    nextBatch.forEach((route, i) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = _renderBudgetCard(route, _budgetRenderedCount + i);
        const card = wrapper.firstElementChild;
        if (card) {
            card.addEventListener('click', () => _openRoute(card.dataset.link, card.dataset.city));
            container.appendChild(card);
        }
    });
    _budgetRenderedCount += nextBatch.length;
}

function _setupBudgetLazyLoad(container) {
    if (_budgetRenderedCount >= _allBudgetRoutes.length) return;

    const sentinel = document.createElement('div');
    sentinel.id    = 'budget-sentinel';
    sentinel.className = 'h-4';
    container.parentElement.appendChild(sentinel);

    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            sentinel.remove();
            _appendBudgetCards(container);
            _setupBudgetLazyLoad(container);
        }
    }, { rootMargin: '120px' });

    observer.observe(sentinel);
}

export function showAllBudgetRoutes() {
    const container = document.getElementById('budget-cards');
    if (!container || !_allBudgetRoutes.length) return;
    document.getElementById('budget-sentinel')?.remove();
    while (_budgetRenderedCount < _allBudgetRoutes.length) _appendBudgetCards(container);
}

function _renderBudgetCard(route, index = 0) {
    const city     = route.city     || '';
    const country  = route.country  || '';
    const nights   = route.nights   || 2;
    const flight   = route.flight_duration || '';
    const price    = route.price    || 0;
    const currency = route.currency || 'TRY';
    const imageUrl = route.image_url || '';
    const citySlug = city.split(',')[0].trim().toLowerCase();
    const deepLink = route.affiliate_url || '#';

    let badgeHtml = '';
    if (route.discount_badge) {
        badgeHtml = `<span class="bf-badge bf-badge--discount">%${route.discount_badge} İndirim</span>`;
    } else if (route.seats_left && route.seats_left <= 5) {
        badgeHtml = `<span class="bf-badge bf-badge--seats">Son ${route.seats_left} Koltuk 🔥</span>`;
    }

    return `
        <div class="vz-card filter-fade-in" style="animation-delay:${(index % BUDGET_PAGE_SIZE) * 80}ms"
             data-action="open-budget" data-link="${escapeHtml(deepLink)}" data-city="${escapeHtml(city)}">
            <div class="vz-card-img">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(city)}"
                     onerror="window.fetchAndSetImage?.(this,'${escapeHtml(citySlug)}',600)">
                <div class="vz-img-overlay"></div>
                ${badgeHtml}
                <div class="vz-city-block">
                    <h3 class="vz-city-name">${escapeHtml(city)}</h3>
                    <div class="vz-meta-row">
                        <span>🌙 ${nights} Gece</span>
                        ${flight ? `<span>✈️ ${escapeHtml(flight)}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="vz-card-footer">
                <div class="vz-footer-left"><span class="vz-country-tag">${escapeHtml(country)}</span></div>
                <div class="vz-footer-right">
                    <span class="vz-price-label">Başlayan fiyatlarla</span>
                    <span class="vz-price">${formatPrice(price, currency)}</span>
                </div>
            </div>
        </div>`;
}

// ── Escape card ───────────────────────────────────────────────────────────────

function _renderEscapeCard(e, activeFilter, index = 0) {
    let statusBadge = '';
    if (e.is_visa_free || activeFilter === 'visa_free') {
        statusBadge = '<span class="escape-status-visa">Vizesiz ✓</span>';
    } else if (e.seats_left && e.seats_left <= 3) {
        statusBadge = `<span class="escape-status-seats">Son ${e.seats_left} Koltuk 🔥</span>`;
    } else if (e.discount_badge) {
        statusBadge = `<span class="escape-status-discount">%${e.discount_badge} İndirim</span>`;
    }

    const nights       = e.nights || 3;
    const durationText = e.flight_duration
        ? `✈️ ${e.flight_duration} &nbsp;·&nbsp; 🌙 ${nights} Gece`
        : `🌙 ${nights} Gece`;
    const cityName = e.city || '';
    const imgSrc   = e.image_url || '';
    const deepLink = e.affiliate_url || null;

    return `
        <div class="escape-card escape-stagger" style="animation-delay:${index * 80}ms; cursor:pointer;"
             data-link="${escapeHtml(deepLink || '#')}" data-city="${escapeHtml(cityName)}">
            <div class="escape-card-img">
                <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(cityName)}"
                     onerror="window.fetchAndSetImage?.(this,'${escapeHtml(cityName)}',400)">
                <span class="escape-card-city">${escapeHtml(cityName)}</span>
                <span class="escape-card-duration">${durationText}</span>
            </div>
            <div class="escape-card-bottom">
                <div class="escape-price-box">
                    <span class="escape-price-label">Başlayan fiyatlarla</span>
                    <span class="escape-price-value">${formatPrice(e.starting_price ?? e.price, e.currency)}</span>
                </div>
                ${statusBadge}
            </div>
        </div>`;
}

function _renderEmptyState(filterType) {
    const messages = {
        'under_5k': { title: 'Kral buralar şu an çok pahalı...', subtitle: 'Başka bir filtre dene!', icon: '💸' },
        'visa_free': { title: 'Vizesiz rota bulunamadı', subtitle: 'Yeni rotalar ekleniyor...', icon: '🛂' },
        'summer':   { title: 'Yaz fırsatları yakında!', subtitle: "Haziran'da harika fiyatlar seni bekliyor.", icon: '🏖️' },
    };
    const msg = messages[filterType] || messages['under_5k'];
    return `
        <div class="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
            <span class="text-5xl mb-4">${msg.icon}</span>
            <h3 class="text-lg font-bold text-slate-700 mb-2">${msg.title}</h3>
            <p class="text-sm text-slate-500 max-w-[250px] mx-auto">${msg.subtitle}</p>
        </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _fmtViewCount(n) {
    if (!n) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000)    return Math.round(n / 1000) + 'k';
    return String(n);
}

async function _fetchCityImg(query, w = 800) {
    return (await getCityImage(query, w)) || null;
}

function _openRoute(deepLink, cityName) {
    if (!deepLink || deepLink === '#') {
        const modal     = document.getElementById('modal-new-plan');
        const destInput = document.getElementById('destination-input');
        if (modal) {
            modal.classList.remove('hidden');
            if (destInput && cityName) {
                setTimeout(() => {
                    destInput.value = cityName;
                    destInput.dispatchEvent(new Event('input', { bubbles: true }));
                }, 150);
            }
        }
        return;
    }
    window.open(deepLink, '_blank', 'noopener,noreferrer');
}

export function openAiPlanWithCity(cityName) {
    const modal = document.getElementById('modal-ai-itinerary');
    if (!modal) return;
    modal.classList.remove('hidden');
    const cityInput = document.getElementById('ai-city-input');
    if (cityInput) {
        cityInput.value = cityName;
        const resultEl  = document.getElementById('ai-itinerary-result');
        if (resultEl) resultEl.innerHTML = '';
    }
    window.fetchAiItinerary?.();
}

// ── Global bridge (onclick attr'ları için) ────────────────────────────────────
window.showAllBudgetRoutes    = showAllBudgetRoutes;
window.openAiPlanWithCity     = openAiPlanWithCity;
window.loadDiscoveryFull      = loadDiscoveryFull;
window.requestDiscoveryFilter = _requestDiscoveryFilter;
