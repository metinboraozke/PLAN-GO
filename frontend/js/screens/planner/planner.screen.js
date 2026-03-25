/**
 * PLANİGO - Planner Screen Module
 * Full port from app.js lines 2947-3377 + 1834-2091 (PAX events + event chat).
 */

import { getWishlists, getPlanner, deleteWishlist } from '../../services/planner.service.js';
import { deleteEventPin, cancelJoinRequest } from '../../services/event.service.js';
import { getChatMessages, sendChatMsg, getEventParticipants } from '../../services/chat.service.js';
import { setSlice, getSlice } from '../../core/store.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml, scheduleIconRefresh } from '../../utils/dom.js';
import { formatPrice } from '../../utils/format.js';
import {
    paxPlannerKey, getPaxEvents, removePaxEvent, updatePaxEventStatus
} from '../../utils/storage.js';
import { getCityImage } from '../../utils/image-cache.js';

// ── Price Polling ──────────────────────────────────────────────────────────
let _pollingIntervals = {};

export function startPricePolling(wishlistId, maxAttempts = 12) {
    let attempts = 0;
    _pollingIntervals[wishlistId] = setInterval(async () => {
        attempts++;
        try {
            const { data } = await getPlanner(wishlistId);
            if (data) {
                const hasPrice    = data.current_price && data.current_price > 0;
                const isProcessing = data.notes?.includes('taranıyor') || !hasPrice;

                if (hasPrice || !isProcessing || attempts >= maxAttempts) {
                    clearInterval(_pollingIntervals[wishlistId]);
                    delete _pollingIntervals[wishlistId];
                    await loadWishlists();
                    // current_price=1 is our "no_data" sentinel — don't show price toast
                    if (hasPrice && data.current_price > 1) {
                        showToast(`✅ ${data.destination || 'Plan'} için fiyat bulundu: ${formatPrice(data.current_price, data.currency || 'TRY')}`, 'success');
                    }
                }
            }
        } catch { /* silent */ }

        if (attempts >= maxAttempts) {
            clearInterval(_pollingIntervals[wishlistId]);
            delete _pollingIntervals[wishlistId];
        }
    }, 5000);
}

export function stopAllPolling() {
    Object.keys(_pollingIntervals).forEach(id => {
        clearInterval(_pollingIntervals[id]);
        delete _pollingIntervals[id];
    });
}

// ── Load Wishlists ─────────────────────────────────────────────────────────
export async function loadWishlists() {
    setSlice('ui', { loading: { ...getSlice('ui').loading, wishlists: true } });

    const { data, error } = await getWishlists();

    setSlice('ui', { loading: { ...getSlice('ui').loading, wishlists: false } });

    if (error) {
        // Hata mesajı yalnızca upcoming bölümü boşsa göster
        const upcomingEl = document.getElementById('planner-upcoming');
        const hasContent = upcomingEl?.querySelector('.trip-card-draft, .upcoming-trip-card, .draft-card-atmo');
        if (upcomingEl && !hasContent) {
            upcomingEl.innerHTML = '<p class="text-center text-red-400 text-sm py-4">Planlar yüklenemedi.</p>';
        }
        renderWishlists(); // hata durumunda da her zaman render et — btn-create-new-plan koruması
        return;
    }

    // Backend boş döndü ama mevcut planlar varsa store'u güncelleme — sadece render yap
    const existing = getSlice('planner').wishlists || [];
    if (data && (data.length > 0 || existing.length === 0)) {
        setSlice('planner', { wishlists: data });
    }
    renderWishlists(); // her zaman render et
    updateWishlistBadge();
    scheduleIconRefresh();
}

// ── Wishlist Badge ─────────────────────────────────────────────────────────
export function updateWishlistBadge() {
    const counter = document.getElementById('wishlist-inline-count');
    if (counter) {
        const count = getSlice('planner').wishlists?.length || 0;
        counter.textContent = `${count} plan${count !== 1 ? 's' : ''}`;
    }
    renderProfileWishlistCards();
}

export function renderProfileWishlistCards() {
    const container = document.getElementById('profile-wishlist-cards');
    if (!container) return;

    const wishlists = getSlice('planner').wishlists || [];

    if (wishlists.length === 0) {
        container.innerHTML = `
            <div class="min-w-[200px] flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl text-center">
                <span class="text-3xl mb-2">✨</span>
                <p class="text-sm text-slate-500">Henüz plan yok</p>
                <button id="btn-profile-create-plan"
                        class="mt-3 px-4 py-1.5 bg-accent-orange text-white text-xs rounded-full font-medium">
                    İlk Planını Oluştur
                </button>
            </div>`;
        document.getElementById('btn-profile-create-plan')?.addEventListener('click', () => {
            window._moduleNavigate?.('planner');
            setTimeout(() => document.getElementById('fab-new-plan')?.click(), 100);
        });
        return;
    }

    container.innerHTML = wishlists.map(w => {
        const origin       = w.origin || 'IST';
        const destination  = w.destination || w.trip_name?.split(' ')[0] || 'XXX';
        const targetPrice  = w.target_price || w.budget || 0;
        const currentPrice = w.current_price || w.current_best_price || null;
        const isPriceAlert = currentPrice && currentPrice < targetPrice;
        const id           = w._id || w.id;

        return `
            <div class="wishlist-premium-card ${isPriceAlert ? 'price-alert' : ''}" data-plan-id="${id}">
                <span class="wishlist-card-badge tracking">Fiyat Takibinde</span>
                <div class="wishlist-card-route">
                    <span>${escapeHtml(origin)}</span>
                    <span class="wishlist-card-route-arrow">→</span>
                    <span>${escapeHtml(destination)}</span>
                </div>
                <p class="text-xs text-white/60 mt-1">${escapeHtml(w.trip_name || 'Unnamed Trip')}</p>
                <div class="wishlist-card-price">
                    <span class="wishlist-card-target">Hedef: ${formatPrice(targetPrice, w.currency || 'TRY')}</span>
                </div>
                ${currentPrice ? `
                    <div class="wishlist-card-price mt-1">
                        <span class="wishlist-card-current">${formatPrice(currentPrice, w.currency || 'TRY')}</span>
                        ${isPriceAlert ? '<span class="text-xs text-green-400 ml-2">🔔 Fırsat!</span>' : ''}
                    </div>` : ''}
                <p class="wishlist-card-meta">${w.date_type === 'flexible' ? '📅 Esnek Tarih' : '📅 Sabit Tarih'}</p>
            </div>`;
    }).join('');

    container.querySelectorAll('.wishlist-premium-card[data-plan-id]').forEach(card => {
        card.addEventListener('click', () => {
            window._moduleNavigate?.('planner');
            window.openPlannerDetail?.(card.dataset.planId);
        });
    });
}

// ── Render Wishlists ───────────────────────────────────────────────────────
export function renderWishlists() {
    const upcomingEl = document.getElementById('planner-upcoming');
    const draftsEl   = document.getElementById('planner-drafts');
    const wishlists  = getSlice('planner').wishlists || [];

    const confirmed = wishlists.filter(w => w.status === 'confirmed');
    const drafts    = wishlists.filter(w => w.status !== 'confirmed');

    // Upcoming (confirmed trips)
    if (upcomingEl) {
        if (confirmed.length > 0) {
            upcomingEl.innerHTML = confirmed.map(w => createConfirmedTripCard(w)).join('');
            upcomingEl.querySelectorAll('.upcoming-trip-review-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    window.openPlannerDetail?.(btn.dataset.id, true);
                });
            });
            upcomingEl.querySelectorAll('.upcoming-trip-book-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    window.openPlannerDetail?.(btn.dataset.id, false);
                });
            });
        } else {
            upcomingEl.innerHTML = `
                <div class="text-center py-8 bg-[#ffffff]/60 rounded-[24px] border border-dashed border-[#e8e6e1]">
                    <div class="w-12 h-12 rounded-full bg-[#9CAF88]/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="calendar" class="w-6 h-6 text-[#9CAF88]"></i>
                    </div>
                    <p class="text-sm text-[#1a1a1a] font-serif font-medium">Yaklaşan seyahat yok</p>
                    <p class="text-xs text-[#9ca3af]">Bir sonraki maceranda planlamaya başla.</p>
                </div>`;
        }
    }

    // Drafts & Ideas
    if (draftsEl) {
        const createBtnHTML = `
            <button id="btn-create-new-plan" class="w-full h-full min-h-[200px] bg-white border-2 border-dashed border-[#9CAF88]/40 rounded-[24px] flex flex-col items-center justify-center gap-4 text-[#9CAF88] hover:bg-[#9CAF88]/5 hover:border-[#9CAF88] transition-all group shadow-sm">
                <div class="w-14 h-14 rounded-full bg-[#9CAF88]/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                    <i data-lucide="plus" class="w-7 h-7 text-[#9CAF88]"></i>
                </div>
                <span class="font-bold text-sm text-[#1a1a1a] font-serif tracking-wide">Yeni Plan Oluştur</span>
            </button>`;

        draftsEl.innerHTML = drafts.map(w => createDraftCard(w)).join('') + createBtnHTML;

        draftsEl.querySelectorAll('.trip-card-draft').forEach(card => {
            card.addEventListener('click', () => window.openPlannerDetail?.(card.dataset.id));
        });

        document.getElementById('btn-create-new-plan')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-new-plan');
            if (modal) {
                modal.classList.remove('hidden');
                setTimeout(() => window.initDestinationAutocomplete?.(), 100);
            }
        });

        loadDraftCardImages();
    }

    lucide?.createIcons();
}

// ── Card Builders ──────────────────────────────────────────────────────────
const _CITY_IMAGES = {
    'paris':     'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=300&q=80',
    'london':    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=300&q=80',
    'rome':      'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=300&q=80',
    'barcelona': 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=300&q=80',
    'amsterdam': 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=300&q=80',
    'dubai':     'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=300&q=80',
    'istanbul':  'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=300&q=80',
};

export function createConfirmedTripCard(w) {
    const id      = w._id || w.id;
    const dest    = w.destination || '';
    const origin  = w.origin || 'IST';
    const destKey = dest.toLowerCase();
    const imgUrl  = w.image_url ||
        Object.entries(_CITY_IMAGES).find(([k]) => destKey.includes(k))?.[1] ||
        'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=300&q=80';

    const budget       = w.target_budget || w.budget || null;
    const budgetDisplay = budget ? `₺${Number(budget).toLocaleString('tr-TR')}` : '—';
    const dateStr      = w.start_date
        ? new Date(w.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Tarih belirlenmedi';

    return `
        <div class="upcoming-trip-card">
            <img src="${imgUrl}" alt="${escapeHtml(dest)}" class="upcoming-trip-img" onerror="this.style.background='#f0ede8';this.src=''">
            <div class="upcoming-trip-body">
                <div>
                    <div class="upcoming-trip-route">${escapeHtml(origin)} ✈ ${escapeHtml(dest)}</div>
                    <div class="upcoming-trip-dates">${dateStr}</div>
                </div>
                <div class="upcoming-trip-footer">
                    <div class="upcoming-trip-budget">
                        <span class="upcoming-trip-budget-label">Tahmini Bütçe</span>
                        <span class="upcoming-trip-budget-value">${budgetDisplay}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                        <span class="upcoming-trip-badge">Rezervasyona Hazır</span>
                        <button class="upcoming-trip-review-btn" data-id="${id}">İncele</button>
                        <button class="upcoming-trip-book-btn" data-id="${id}">Rezervasyona Git →</button>
                    </div>
                </div>
            </div>
        </div>`;
}

export function createDraftCard(w) {
    const id     = w._id || w.id;
    const dest   = w.destination || '';
    const origin = w.origin || 'IST';
    const title  = w.trip_name || dest || 'Yeni Plan';

    const STATUS_LABELS = {
        tracking:   { label: 'Takipte',   color: '#A3C14A' },
        processing: { label: 'Taranıyor', color: '#f59e0b' },
        draft:      { label: 'Taslak',    color: '#9ca3af' },
    };
    const st           = STATUS_LABELS[w.status] || { label: 'Taslak', color: '#9ca3af' };
    const budget       = w.target_budget || w.budget || null;
    const budgetDisplay = budget ? formatPrice(budget, w.currency || 'TRY') : null;
    const cityKey      = (dest.split(',')[0].trim().toLowerCase()) || 'default';

    return `
        <div class="trip-card-draft draft-card-atmo" data-id="${id}" data-city="${cityKey}">
            <div class="draft-card-top">
                <span class="draft-status-pill" style="background:${st.color}20;color:${st.color}">${st.label}</span>
            </div>
            <div class="draft-card-bottom">
                <div class="draft-card-route">${escapeHtml(origin)} ✈ ${escapeHtml(dest || '?')}</div>
                <h3 class="draft-card-title">${escapeHtml(title)}</h3>
                ${budgetDisplay ? `<div class="draft-card-budget">${budgetDisplay}</div>` : ''}
            </div>
        </div>`;
}

async function loadDraftCardImages() {
    const cards = document.querySelectorAll('.draft-card-atmo[data-city]');
    await Promise.all([...cards].map(async (card) => {
        const city = card.dataset.city;
        if (!city || city === 'default') return;
        const url = await getCityImage(city, 400);
        if (url) {
            card.style.backgroundImage    = `linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.72) 100%), url('${url}')`;
            card.style.backgroundSize     = 'cover';
            card.style.backgroundPosition = 'center';
        }
    }));
}

// ── PAX Events in Planner ──────────────────────────────────────────────────
const _EVENT_EMOJI = {
    social: '☕', sport: '⚽', food: '🍕',
    culture: '🏛️', travel: '✈️', music: '🎵', adventure: '🏔️',
};

const _STATUS_CFG = {
    creator:  { label: 'Organizatör', cls: 'pax-event-role--creator',  icon: '👑' },
    pending:  { label: 'Beklemede',   cls: 'pax-event-role--pending',  icon: '🕒' },
    approved: { label: 'Onaylandı',   cls: 'pax-event-role--approved', icon: '✅' },
    rejected: { label: 'Reddedildi', cls: 'pax-event-role--rejected', icon: '❌' },
};

export function renderPaxEventsInPlanner() {
    const section    = document.getElementById('pax-events-planner-section');
    const container  = document.getElementById('pax-events-planner');
    if (!section || !container) return;

    const events = getPaxEvents();

    if (events.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');

    container.innerHTML = events.map(ev => {
        const role      = ev._pax_role   || 'participant';
        const status    = ev._pax_status || (role === 'creator' ? 'creator' : 'pending');
        const cfg       = _STATUS_CFG[status] || _STATUS_CFG.pending;
        const emoji     = _EVENT_EMOJI[ev.event_type] || '🌟';
        const typeLabel = (ev.event_type || 'Etkinlik').charAt(0).toUpperCase() + (ev.event_type || '').slice(1);
        const dateStr   = ev.event_date
            ? new Date(ev.event_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
            : '—';
        const loc       = [ev.city, ev.country].filter(Boolean).join(', ') || ev.address || '';
        const evId      = ev._id || ev.id || '';
        const cancelLbl = role === 'creator' ? '🗑️ Sil' : '✕ İptal';
        const canChat   = (status === 'creator' || status === 'approved');
        const hasUnread = canChat && !!localStorage.getItem(`pax_chat_unread_${evId}`);

        const chatBtn = canChat
            ? `<button class="pax-chat-btn${hasUnread ? ' pax-chat-btn--unread' : ''}"
                    data-chat-event="${evId}" title="Grup Sohbeti">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
               </button>`
            : '';

        return `
        <div class="pax-event-card" data-event-id="${evId}">
            <div class="pax-event-card-body">
                <div class="flex items-center justify-between mb-1">
                    <span class="pax-event-card-type">${emoji} ${escapeHtml(typeLabel)}</span>
                    <div class="flex items-center gap-2">
                        ${chatBtn}
                        <span class="pax-event-role ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
                        <button class="pax-cancel-btn" data-cancel-event="${evId}" data-cancel-role="${role}">${cancelLbl}</button>
                    </div>
                </div>
                <div class="pax-event-card-title">${escapeHtml(ev.title || 'Etkinlik')}</div>
                <div class="pax-event-card-meta">
                    <span class="pax-event-card-date">📅 ${dateStr}</span>
                    ${loc ? `<span class="pax-event-card-loc">📍 ${escapeHtml(loc)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // Bind cancel buttons
    container.querySelectorAll('.pax-cancel-btn[data-cancel-event]').forEach(btn => {
        btn.addEventListener('click', () => cancelPaxEvent(btn.dataset.cancelEvent, btn.dataset.cancelRole));
    });

    // Bind chat buttons
    container.querySelectorAll('.pax-chat-btn[data-chat-event]').forEach(btn => {
        btn.addEventListener('click', e => openEventChat(btn.dataset.chatEvent, e));
    });
}

export async function cancelPaxEvent(eventId, role) {
    let userId = '';
    try {
        const stored = getPaxEvents();
        const ev     = stored.find(e => (e._id || e.id) === eventId);
        if (role === 'creator') {
            userId = ev?.creator_id || ev?._my_user_id || '';
        } else {
            userId = ev?._my_user_id || '';
        }
    } catch { /* ignore */ }
    userId = userId || localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
    if (!userId) { showToast('Oturum bulunamadı', 'error'); return; }

    const btn = document.querySelector(`[data-cancel-event="${eventId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    const { error } = role === 'creator'
        ? await deleteEventPin(eventId, userId)
        : await cancelJoinRequest(eventId, userId);

    if (error) {
        showToast('İptal işlemi başarısız, tekrar dene', 'error');
        if (btn) { btn.disabled = false; btn.textContent = role === 'creator' ? '🗑️ Sil' : '✕ İptal'; }
        return;
    }

    showToast(role === 'creator' ? 'Etkinlik iptal edildi ve silindi 🗑️' : 'Katılma isteğin iptal edildi', 'info');
    removePaxEvent(eventId);
    renderPaxEventsInPlanner();
}

// ── Event Group Chat ───────────────────────────────────────────────────────
let _chatEventId        = null;
let _chatEventData      = null;
let _chatPollTimer      = null;
let _participantAvatars = {};   // { user_id: avatar_url | null }
let _participantsList   = [];   // [{ user_id, user_name, avatar_url }]
let _participantsPanelOpen = false;

export function openEventChat(eventId, e) {
    if (e) e.stopPropagation();

    localStorage.removeItem('pax_chat_unread_' + eventId);
    document.querySelector(`.pax-chat-btn[data-chat-event="${eventId}"]`)?.classList.remove('pax-chat-btn--unread');

    // Find event data across all pax_upcoming_events_* keys
    let ev = null;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('pax_upcoming_events_')) continue;
            const arr   = JSON.parse(localStorage.getItem(key) || '[]');
            const found = arr.find(x => (x._id || x.id) === eventId);
            if (found) { ev = found; break; }
        }
    } catch { /* ignore */ }
    if (!ev) ev = {};

    _chatEventId   = eventId;
    _chatEventData = ev;

    const titleEl = document.getElementById('chat-event-title');
    const countEl = document.getElementById('chat-participant-count');
    if (titleEl) titleEl.textContent = ev.title || 'Grup Sohbeti';
    if (countEl) countEl.textContent = ((ev.participant_count || 0) + 1) + ' katılımcı';

    document.getElementById('modal-event-chat')?.classList.remove('hidden');
    document.getElementById('chat-input')?.focus();
    lucide?.createIcons();

    _participantAvatars    = {};
    _participantsList      = [];
    _participantsPanelOpen = false;
    const panel = document.getElementById('chat-participants-panel');
    if (panel) panel.style.transform = 'translateX(100%)';

    _loadChatMessages();
    _fetchParticipantAvatars(eventId);
    if (_chatPollTimer) clearInterval(_chatPollTimer);
    _chatPollTimer = setInterval(_loadChatMessages, 8000);
}

export function closeEventChat() {
    document.getElementById('modal-event-chat')?.classList.add('hidden');
    clearInterval(_chatPollTimer);
    _chatEventId        = null;
    _chatEventData      = null;
    _participantAvatars = {};
    _participantsList   = [];
    _participantsPanelOpen = false;
}

async function _fetchParticipantAvatars(eventId) {
    try {
        const { data } = await getEventParticipants(eventId);
        const list = data?.participants || [];
        _participantsList = list;
        _participantAvatars = {};
        for (const p of list) {
            _participantAvatars[p.user_id] = p.avatar_url || null;
        }
        const countEl = document.getElementById('participants-panel-count');
        if (countEl) countEl.textContent = list.length + ' katılımcı';
    } catch { /* sessizce geç */ }
}

export function toggleParticipantsList() {
    const panel = document.getElementById('chat-participants-panel');
    if (!panel) return;

    _participantsPanelOpen = !_participantsPanelOpen;
    panel.style.transform = _participantsPanelOpen ? 'translateX(0)' : 'translateX(100%)';

    if (_participantsPanelOpen) {
        _renderParticipantsPanel();
    }
}

function _renderParticipantsPanel() {
    const listEl   = document.getElementById('chat-participants-list');
    const countEl  = document.getElementById('participants-panel-count');
    if (!listEl) return;

    if (countEl) countEl.textContent = _participantsList.length + ' katılımcı';

    if (!_participantsList.length) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px 16px;color:#9ca3af;font-size:13px;">Henüz katılımcı yok</div>`;
        return;
    }

    listEl.innerHTML = _participantsList.map(p => {
        const name    = escapeHtml(p.user_name || 'Katılımcı');
        const safeId  = escapeHtml(p.user_id || '');
        const initial = (p.user_name || '?')[0].toUpperCase();
        const avatarHtml = p.avatar_url
            ? `<img src="${escapeHtml(p.avatar_url)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div style="width:40px;height:40px;border-radius:50%;background:#7a8a2e;color:#fff;font-size:15px;font-weight:700;display:none;align-items:center;justify-content:center;flex-shrink:0;">${initial}</div>`
            : `<div style="width:40px;height:40px;border-radius:50%;background:#7a8a2e;color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initial}</div>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;transition:background 0.15s;cursor:pointer;"
            data-profile-id="${safeId}" data-profile-name="${name}"
            onmouseover="this.style.background='#f9f9f6'" onmouseout="this.style.background='transparent'">
            ${avatarHtml}
            <span style="font-size:13px;font-weight:600;color:#1a1a1a;">${name}</span>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-profile-id]').forEach(el => {
        el.addEventListener('click', () => {
            const uid = el.dataset.profileId;
            const uname = el.dataset.profileName;
            if (uid && window.openPublicProfile) window.openPublicProfile(uid, uname);
        });
    });
}

async function _loadChatMessages() {
    if (!_chatEventId) return;
    // uid sadece "Sen" etiketi için kullanılıyor — JWT'den değil localStorage'dan
    // Backend erişim kontrolü tamamen JWT dependency ile yapılıyor
    const uid = localStorage.getItem('auth_user_id') || '';

    const { data: msgs } = await getChatMessages(_chatEventId);
    if (msgs) _renderChatMessages(msgs, uid);
}

function _renderChatMessages(msgs, myUid) {
    const container = document.getElementById('chat-messages');
    const emptyEl   = document.getElementById('chat-empty');
    if (!container) return;

    if (!msgs || msgs.length === 0) {
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 40;

    container.innerHTML = '<div id="chat-empty" style="display:none;"></div>' + msgs.map(m => {
        const isMine  = m.user_id === myUid;
        const name    = isMine ? 'Sen' : escapeHtml(m.user_name || 'Katılımcı');
        const time    = m.created_at
            ? new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : '';
        const align   = isMine ? 'items-end' : 'items-start';
        const initial   = (m.user_name || '?')[0].toUpperCase();
        const avatarUrl = _participantAvatars[m.user_id];
        const safeUid   = escapeHtml(m.user_id || '');
        const profileAttrs = !isMine && safeUid
            ? `data-profile-id="${safeUid}" data-profile-name="${name}" style="cursor:pointer;"`
            : '';
        const avatarHtml = isMine ? '' : avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" ${profileAttrs} style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;align-self:flex-end;${safeUid ? 'cursor:pointer;' : ''}" onerror="this.outerHTML='<div style=\\'width:28px;height:28px;border-radius:50%;background:#7a8a2e;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end;\\'>${initial}</div>'">`
            : `<div ${profileAttrs} style="width:28px;height:28px;border-radius:50%;background:#7a8a2e;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;align-self:flex-end;">${initial}</div>`;
        return `<div class="chat-row ${align}" style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};gap:2px;">
            ${!isMine ? `<span ${profileAttrs} style="font-size:10px;color:#9ca3af;font-weight:600;padding-left:36px;">${name}</span>` : ''}
            <div style="display:flex;align-items:flex-end;gap:6px;flex-direction:${isMine ? 'row-reverse' : 'row'};">
                ${avatarHtml}
                <div class="chat-bubble chat-bubble--${isMine ? 'mine' : 'other'}">${escapeHtml(m.text)}</div>
            </div>
            <span style="font-size:10px;color:#9ca3af;${isMine ? 'padding-right:4px;' : 'padding-left:36px;'}">${time}</span>
        </div>`;
    }).join('');

    // data attribute + addEventListener — güvenli profil tıklama
    container.querySelectorAll('[data-profile-id]').forEach(el => {
        el.addEventListener('click', () => {
            const uid   = el.dataset.profileId;
            const uname = el.dataset.profileName;
            if (uid && window.openPublicProfile) window.openPublicProfile(uid, uname);
        });
    });

    if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

export async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text  = input?.value.trim();
    if (!text || !_chatEventId) return;

    const uid  = (_chatEventData?.creator_id &&
                  (_chatEventData._pax_role === 'creator' || _chatEventData._pax_status === 'creator'))
        ? _chatEventData.creator_id
        : (localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '');
    const name = getSlice('profile')?.passport?.username ||
                 localStorage.getItem('auth_username') ||
                 _chatEventData?.creator_name || 'Kullanıcı';
    if (!uid) { showToast('Oturum bilgisi bulunamadı', 'error'); return; }

    input.value        = '';
    input.style.height = 'auto';

    const { error } = await sendChatMsg(_chatEventId, { user_id: uid, user_name: name, text });
    if (error) {
        showToast('Mesaj gönderilemedi', 'error');
        input.value = text;
    }
}

// ── Wishlist Modal ─────────────────────────────────────────────────────────
export async function openWishlistModal() {
    const modal     = document.getElementById('modal-wishlist');
    const container = document.getElementById('wishlist-items-container');
    if (!modal || !container) return;
    modal.classList.remove('hidden');
    container.innerHTML = '<div class="text-center py-4">Yükleniyor...</div>';

    const { data: wishlists } = await getWishlists();

    if (!wishlists || wishlists.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-500 py-4">Listeniz boş 🦗</p>';
        return;
    }

    container.innerHTML = wishlists.map(w => {
        const id = w._id || w.id;
        return `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-200 overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=100" class="w-full h-full object-cover">
                </div>
                <div>
                    <p class="font-bold text-slate-800 text-sm">${escapeHtml(w.trip_name)}</p>
                    <p class="text-xs text-slate-500">${escapeHtml(w.destination)} • ${formatPrice(w.target_price, w.currency)}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button class="p-2 bg-blue-100 text-blue-600 rounded-lg" data-view-plan="${id}">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
                <button class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" data-delete-plan="${id}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-view-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
            window._moduleNavigate?.('planner');
            window.openPlannerDetail?.(btn.dataset.viewPlan);
        });
    });

    container.querySelectorAll('[data-delete-plan]').forEach(btn => {
        btn.addEventListener('click', () => deleteWishlistItem(btn.dataset.deletePlan));
    });

    lucide?.createIcons();
}

async function deleteWishlistItem(id) {
    if (!confirm('Bu planı silmek istediğinize emin misiniz?')) return;
    const { error } = await deleteWishlist(id);
    if (error) { showToast('Silme işlemi başarısız', 'error'); return; }
    loadWishlists();
    openWishlistModal();
    window.loadPassport?.();
    window._awardXPWithFeedback?.(-20, 'wishlist_deleted');
}
