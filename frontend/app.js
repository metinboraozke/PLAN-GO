/**
 * SITA Smart Planner - Frontend Application v3.0
 * Complete SPA with Leaflet.js Social Map Integration
 */

// ============================================
// CONFIGURATION
// ============================================

const API_BASE = 'http://localhost:8000/api/v1';

// Default location (Istanbul)
const DEFAULT_LOCATION = { lat: 41.0082, lng: 28.9784 };
const DEFAULT_ZOOM = 13;

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
    currentScreen: 'planner',
    wishlists: [],
    discovery: null,
    pins: [],
    profile: null,
    passport: null,
    selectedWishlist: null,
    selectedPin: null,
    userLocation: null,
    map: null,
    mapMarkers: [],
    userMarker: null,
    loading: {
        wishlists: false,
        discovery: false,
        pins: false,
        profile: false,
        map: false
    }
};

// ============================================
// DISCOVER v2 — Category mock array (Stage 1)
// Wired to /api/v1/discover/categories structure.
// "şimdilik veriyi kodun içindeki mock array'den çek"
// ============================================
const DISCOVER_FILTER_CATEGORIES = [
    { id: 'all',         label: 'Tüm Fırsatlar', icon: 'zap',          filter: null        },
    { id: 'vizesiz',     label: 'Vizesiz',        icon: 'shield-check', filter: 'visa_free' },
    { id: 'bütçe-dostu', label: 'Bütçe Dostu',   icon: 'wallet',       filter: 'under_5k'  },
];

// ============================================
// API SERVICE
// ============================================

const api = {
    // Get auth headers
    _authHeaders() {
        const token = localStorage.getItem('auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    },

    async get(endpoint) {
        try {
            console.log(`API GET: ${API_BASE}${endpoint}`);
            const response = await fetch(`${API_BASE}${endpoint}`, {
                headers: api._authHeaders()
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`API GET ${endpoint} failed:`, error);
            return null;
        }
    },

    async post(endpoint, data) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: api._authHeaders(),
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`API POST ${endpoint} failed:`, error);
            return null;
        }
    },

    async patch(endpoint, data) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PATCH',
                headers: api._authHeaders(),
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`API PATCH ${endpoint} failed:`, error);
            return null;
        }
    },

    async delete(endpoint) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE',
                headers: api._authHeaders()
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`API DELETE ${endpoint} failed:`, error);
            return null;
        }
    },

    // Endpoints
    getDiscoveryFull: (filter) => api.get(`/discovery/full${filter ? '?filter_type=' + filter : ''}`),
    // Discover v2 — structured endpoints (Aşama 1-2-3)
    discoverCategories: ()              => api.get('/discover/categories'),
    discoverHero:       ()              => api.get('/discover/hero'),
    discoverTrending:   (limit = 6)     => api.get(`/discover/trending?limit=${limit}`),
    discoverDeals:      (cat = '')      => api.get(`/discover/deals${cat ? '?category=' + encodeURIComponent(cat) : ''}`),
    discoverVizesiz:        (limit = 10) => api.get(`/discover/vizesiz?limit=${limit}`),
    discoverBudgetFriendly: (limit = 20) => api.get(`/discover/budget-friendly?limit=${limit}`),
    getMapPins: (filter = '') => api.get(`/map/pins${filter}`),
    getNearbyPins: (lat, lng, radius = 50) => api.get(`/map/pins/nearby?lat=${lat}&lng=${lng}&radius_km=${radius}`),
    createMapPin:  (data)          => api.post('/map/pins', data),
    updateMapPin:  (id, uid, data) => api.patch(`/map/pins/${id}?user_id=${uid}`, data),
    deleteMapPin:  (id, uid)       => api.delete(`/map/pins/${id}?user_id=${uid}`),
    getEventPins: (eventType = '') => api.get(`/map/events${eventType ? '?event_type=' + eventType : ''}`),
    createEventPin: (data) => api.post('/map/events', data),
    deleteEventPin: (eventId, userId) =>
        fetch(`${API_BASE}/map/events/${eventId}?user_id=${encodeURIComponent(userId)}`, {
            method: 'DELETE', headers: api._authHeaders()
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    sendJoinRequest: (eventId, data) => api.post(`/map/events/${eventId}/join`, data),
    cancelJoinRequest: (eventId, userId) =>
        fetch(`${API_BASE}/map/events/${eventId}/join?user_id=${encodeURIComponent(userId)}`, {
            method: 'DELETE', headers: api._authHeaders()
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    getJoinRequests: (eventId, creatorId) =>
        api.get(`/map/events/${eventId}/requests?creator_id=${encodeURIComponent(creatorId)}`),
    updateRequestStatus: (eventId, requestId, creatorId, newStatus) =>
        fetch(`${API_BASE}/map/events/${eventId}/requests/${requestId}?creator_id=${encodeURIComponent(creatorId)}`, {
            method: 'PATCH',
            headers: api._authHeaders(),
            body: JSON.stringify({ status: newStatus })
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    getPublicProfile: (userId) => api.get(`/users/${encodeURIComponent(userId)}/public-profile`),
    getNotifications: (userId, unreadOnly = false) =>
        api.get(`/users/${encodeURIComponent(userId)}/notifications${unreadOnly ? '?unread_only=true' : ''}`),
    markNotificationsRead: (userId) =>
        fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/notifications/read`, {
            method: 'PATCH',
            headers: api._authHeaders()
        }).then(r => r.json()),
    getChatMessages: (eventId, userId) =>
        api.get(`/map/events/${eventId}/chat?user_id=${encodeURIComponent(userId)}`),
    sendChatMsg: (eventId, data) => api.post(`/map/events/${eventId}/chat`, data),
    generateItinerary: (city, days) =>
        fetch(`http://localhost:8000/api/generate-itinerary?city=${encodeURIComponent(city)}&days=${days}`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    getPlanAiRecs: (planId) => api.get(`/plans/${planId}/ai-recommendations`),
    awardEventStamps: (eventId, creatorId) =>
        fetch(`${API_BASE}/map/events/${encodeURIComponent(eventId)}/award-stamps?creator_id=${encodeURIComponent(creatorId)}`, {
            method: 'POST',
            headers: api._authHeaders()
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    getWishlists: () => api.get('/wishlists'),
    getPlanner: (id) => api.get(`/planner/${id}`),
    getPassport: () => {
        const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
        return api.get(`/profile/passport${uid ? '?user_id=' + encodeURIComponent(uid) : ''}`);
    },
    getFullStats: () => api.get('/profile/full-stats'),
    addVisitedCountry: (data) => {
        const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
        return api.post(`/profile/visited-country${uid ? '?user_id=' + encodeURIComponent(uid) : ''}`, data);
    },
    removeVisitedCountry: (code) => {
        const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
        const qs = `country_code=${code}${uid ? '&user_id=' + encodeURIComponent(uid) : ''}`;
        return fetch(`${API_BASE}/profile/visited-country?${qs}`, { method: 'DELETE', headers: api._authHeaders() }).then(r => r.json());
    },
    deleteWishlist: (id) => fetch(`${API_BASE}/wishlists/${id}`, {
        method: 'DELETE',
        headers: api._authHeaders()
    }),
    awardXP: (userId, delta, reason = 'manual') =>
        fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/xp?delta=${delta}&reason=${encodeURIComponent(reason)}`, {
            method: 'POST', headers: api._authHeaders()
        }).then(r => r.ok ? r.json() : null),

    // Wishlist / Planner operations
    addWishlist: (data) => api.post('/wishlist/add', data),
    updateWishlist: (id, data) => api.post(`/wishlists/${id}`, data),
    // Plan Detail endpoints
    getPlanDetails: (id) => api.get(`/plans/${id}/details`),
    getBudgetCalc: (id, hotelIndex = 0) => api.get(`/plans/${id}/budget?hotel_index=${hotelIndex}`),
    confirmPlan: (id) => api.post(`/plans/${id}/confirm`, {})
};

// ============================================
// NAVIGATION
// ============================================

function navigate(screenName) {
    console.log(`🧭 Navigating to: ${screenName}`);

    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

    const targetScreen = document.getElementById(`screen-${screenName}`);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        targetScreen.classList.add('screen-transition');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.screen === screenName) btn.classList.add('active');
    });

    state.currentScreen = screenName;
    loadScreenData(screenName);
}

function loadScreenData(screenName) {
    switch (screenName) {
        case 'discovery': loadDiscoveryFull(); break;
        case 'map': initializeMap(); break;
        case 'planner': loadWishlists(); renderPaxEventsInPlanner(); _maybeRestoreAiPreview(); break;
        case 'profile': loadPassport(); break;
    }
}

// ============================================
// LEAFLET MAP - CORE FUNCTIONS
// ============================================

async function initializeMap() {
    console.log('🗺️ Initializing Leaflet Map...');
    state.loading.map = true;

    // Show loading overlay
    const loadingEl = document.getElementById('map-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    // Initialize map if not already done
    if (!state.map) {
        state.map = L.map('leaflet-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng], DEFAULT_ZOOM);

        // Add CartoDB Light (Positron) tiles for Cream & Sage theme
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(state.map);

        // Position zoom control
        state.map.zoomControl.setPosition('topright');
    }

    // Get user location
    await getUserLocation();

    // Load pins from backend
    await loadMapPins();

    // Load PAX event pins (overlaid on map, always visible)
    loadEventPins();

    // Start notification polling (once per session)
    if (!_notifPollInterval) _startNotifPolling();

    // Setup map category filter pill listeners
    setupMapFilterListeners();

    // Hide loading
    if (loadingEl) loadingEl.classList.add('hidden');
    state.loading.map = false;

    // Invalidate size after render
    setTimeout(() => state.map?.invalidateSize(), 100);

    // Add click event to map to deselect pin/event when clicking empty area
    state.map.on('click', function (e) {
        deselectPin();
        deselectEvent();
    });

    // Long-press to add pin
    setupMapLongPress();
}

async function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn('⚠️ Geolocation not supported');
            showLocationError();
            resolve(DEFAULT_LOCATION);
            return;
        }

        let firstUpdate = true;

        // Use watchPosition for real-time tracking
        state.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const loc = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                state.userLocation = loc;
                console.log(`📍 User location: ${loc.lat}, ${loc.lng}`);

                // Update location status
                const statusEl = document.getElementById('location-status');
                if (statusEl) {
                    statusEl.textContent = '📍 Konumunuz';
                    statusEl.className = 'text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium';
                }

                if (firstUpdate) {
                    // First fix: center map on user at zoom 15
                    if (state.map) {
                        state.map.setView([loc.lat, loc.lng], 15);
                    }
                    // Create user marker
                    addUserMarker(loc);
                    firstUpdate = false;
                    resolve(loc);
                } else {
                    // Subsequent updates: smoothly move marker
                    addUserMarker(loc);
                }
            },
            (error) => {
                console.warn('⚠️ Geolocation error:', error.message);
                // Friendly Turkish message
                const errorBanner = document.getElementById('location-error');
                if (errorBanner) {
                    errorBanner.textContent = '📍 Konum izni verilmedi, seni İstanbul merkezli başlatıyorum.';
                    errorBanner.classList.remove('hidden');
                    setTimeout(() => errorBanner.classList.add('hidden'), 5000);
                }
                state.userLocation = DEFAULT_LOCATION;
                if (firstUpdate) {
                    firstUpdate = false;
                    resolve(DEFAULT_LOCATION);
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    });
}

function showLocationError() {
    const errorEl = document.getElementById('location-error');
    if (errorEl) errorEl.classList.remove('hidden');

    const statusEl = document.getElementById('location-status');
    if (statusEl) {
        statusEl.textContent = '📍 Istanbul';
        statusEl.className = 'text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full font-medium';
    }
}

function addUserMarker(loc) {
    // If marker exists, just update its position smoothly
    if (state.userMarker) {
        state.userMarker.setLatLng([loc.lat, loc.lng]);
        return;
    }

    // Create blue pulse dot with L.divIcon
    const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-dot-inner"></div><div class="user-dot-pulse"></div>',
        iconSize:   [40, 40],
        iconAnchor: [20, 20]
    });

    state.userMarker = L.marker([loc.lat, loc.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(state.map)
        .bindPopup('<div class="pin-popup"><p class="pin-popup-title">📍 Ben Buradayım</p><p class="pin-popup-subtitle">Anlık Konumunuz</p></div>');
}

async function loadMapPins(filter = 'all') {
    console.log(`📌 Loading map pins (filter: ${filter})`);

    try {
        // Update filter pill states (map-specific pills)
        document.querySelectorAll('.map-filter-pill').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) btn.classList.add('active');
        });

        // Fetch ALL pins on first load, then filter client-side
        if (!state.allPins || state.allPins.length === 0) {
            const pins = await api.getMapPins();
            // Deduplicate by _id to guard against double-entries
            const seen = new Set();
            state.allPins = (pins || []).filter(p => {
                const id = p._id || p.id;
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        }

        // Client-side filter
        const filteredPins = filter === 'all'
            ? [...state.allPins]
            : state.allPins.filter(p => p.type === filter);

        state.pins = filteredPins;

        // Update pins count
        const pinsCountEl = document.getElementById('pins-count');
        if (pinsCountEl) pinsCountEl.textContent = `${state.pins.length} pin bulundu`;

        // Clear existing markers
        state.mapMarkers.forEach(m => m.remove());
        state.mapMarkers = [];

        // Add filtered pin markers
        state.pins.forEach(pin => {
            const marker = createPinMarker(pin);
            state.mapMarkers.push(marker);
        });

        // Auto-zoom: fitBounds to visible pins
        if (state.pins.length > 0 && filter !== 'all') {
            const bounds = L.latLngBounds(state.pins.map(p => [p.lat, p.lng]));
            state.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
        }

        // Populate Nearby Vibes scroll
        renderNearbyVibes(state.pins);

        // Deselect any selected pin
        deselectPin();

        lucide?.createIcons();
    } catch (error) {
        console.error('❌ Error loading map pins:', error);
    } finally {
        const loadingEl = document.getElementById('map-loading');
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

function createPinMarker(pin) {
    const pinColors = {
        'cafe': 'pin-cafe',
        'cheap-eats': 'pin-cheap-eats',
        'viewpoints': 'pin-viewpoints',
        'hidden-gems': 'pin-hidden-gems',
        'restaurant': 'pin-restaurant',
        'nightlife': 'pin-nightlife',
        'shopping': 'pin-shopping',
        'historical': 'pin-historical',
        'nature': 'pin-nature',
        'attraction': 'pin-attraction'
    };

    const pinEmojis = {
        'cafe': '☕',
        'cheap-eats': '🍜',
        'viewpoints': '📸',
        'hidden-gems': '💎',
        'restaurant': '🍽️',
        'nightlife': '🌙',
        'shopping': '🛍️',
        'historical': '🏛️',
        'nature': '🌿',
        'attraction': '🎢'
    };

    const colorClass = pinColors[pin.type] || 'pin-cafe';
    const emoji = pinEmojis[pin.type] || '📍';
    const secretClass = pin.is_secret_spot ? 'secret-spot' : '';

    const icon = L.divIcon({
        className: `custom-pin-marker ${colorClass} ${secretClass}`,
        html: `<span>${emoji}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(state.map)
        .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectPin(pin);
        });

    // Tag marker with pin ID so deleteCurrentPin can find & remove it
    marker._pinId = pin._id || pin.id || '';

    // Minimal tooltip (hover only — click opens bottom detail card)
    marker.bindTooltip(`<span class="pin-tooltip">${emoji} ${pin.title}</span>`, {
        direction: 'top', offset: [0, -20], opacity: 1, sticky: false
    });

    return marker;
}

function selectPin(pin) {
    // If same pin clicked again → open full detail
    if (state.selectedPin && state.selectedPin._id === pin._id) {
        viewPinFullDetail();
        return;
    }

    state.selectedPin = pin;

    // Hide Nearby Vibes, show Pin Detail
    const vibesDefault = document.getElementById('nearby-vibes-default');
    const detailCard = document.getElementById('pin-detail-card');

    if (vibesDefault) vibesDefault.classList.add('hidden');
    if (detailCard) {
        detailCard.classList.remove('hidden');
        // Slide-up animation
        detailCard.style.transform = 'translateY(20px)';
        detailCard.style.opacity = '0';
        requestAnimationFrame(() => {
            detailCard.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
            detailCard.style.transform = 'translateY(0)';
            detailCard.style.opacity = '1';
        });
    }

    // Fill pin details
    const emoji = getPinEmoji(pin.type);
    document.getElementById('pin-detail-emoji').textContent = emoji;
    document.getElementById('pin-detail-title').textContent = pin.title;
    document.getElementById('pin-detail-subtitle').textContent =
        `${pin.place_type || pin.type || ''} • ⭐ ${pin.rating || 4.5} • ${pin.price_range || ''}`;
    document.getElementById('pin-detail-friends').textContent =
        `📍 ${pin.friends_visited || 0} arkadaş ziyaret etti`;

    // Badge
    const badgeEl = document.getElementById('pin-detail-badge');
    if (pin.is_secret_spot) {
        badgeEl.textContent = '✨ GİZLİ';
        badgeEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0';
    } else {
        badgeEl.textContent = (pin.place_type || pin.type || 'SPOT').toUpperCase();
        badgeEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage/10 text-sage shrink-0';
    }

    // Vibes / Tags
    const vibesEl = document.getElementById('pin-detail-vibes');
    const vibes = pin.vibes || pin.tags || [];
    if (vibes.length > 0) {
        vibesEl.innerHTML = vibes.map(v => {
            const colors = getVibeColors(v);
            return `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${colors}">${v}</span>`;
        }).join('');
    } else {
        vibesEl.innerHTML = '';
    }

    // Description
    const descSection = document.getElementById('pin-detail-desc-section');
    const descText = document.getElementById('pin-detail-description');
    if (pin.description && pin.description.trim() !== '') {
        descSection.classList.remove('hidden');
        descText.textContent = pin.description;
        descText.classList.add('hidden'); // collapsed by default
    } else {
        descSection.classList.add('hidden');
    }

    // User Tip
    const tipSection = document.getElementById('pin-detail-tip-section');
    if (pin.user_tips && pin.user_tips.length > 0) {
        const tip = pin.user_tips[0];
        tipSection.classList.remove('hidden');
        document.getElementById('pin-detail-tip-avatar').src = `https://i.pravatar.cc/40?u=${tip.username}`;
        document.getElementById('pin-detail-tip-user').textContent = `${tip.username} İpucu`;
        document.getElementById('pin-detail-tip-text').textContent = `"${tip.content}"`;
    } else {
        tipSection.classList.add('hidden');
    }

    // Pan map to pin
    if (state.map) {
        state.map.panTo([pin.lat, pin.lng]);
    }

    // Show edit/delete buttons ONLY if current user owns this pin
    const myUid = localStorage.getItem('auth_user_id') || '';
    const isOwner = !!(myUid && pin.user_id && pin.user_id === myUid);
    const ownerActions = document.getElementById('pin-owner-actions');
    if (ownerActions) ownerActions.classList.toggle('hidden', !isOwner);

    // Show star rating ONLY for other users' pins
    const starRow = document.getElementById('pin-star-rating');
    if (starRow) {
        const showRating = !!myUid && !isOwner;
        starRow.classList.toggle('hidden', !showRating);
        if (showRating) {
            // Restore previously given rating from localStorage
            const stored = localStorage.getItem('pin_rating_' + (pin._id || pin.id));
            _renderStars(stored ? parseInt(stored) : 0);
            const badge = document.getElementById('pin-my-rating');
            if (badge) {
                badge.textContent = stored ? stored + '★ verdin' : '';
                badge.classList.toggle('hidden', !stored);
            }
        }
    }

    lucide?.createIcons();
}

// Toggle pin description visibility
function togglePinDescription() {
    const descText = document.getElementById('pin-detail-description');
    const chevron = document.getElementById('pin-desc-chevron');
    if (descText.classList.contains('hidden')) {
        descText.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        descText.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}

// Deselect pin — show Nearby Vibes again
function deselectPin() {
    state.selectedPin = null;

    const vibesDefault = document.getElementById('nearby-vibes-default');
    const detailCard = document.getElementById('pin-detail-card');

    if (detailCard) detailCard.classList.add('hidden');
    if (vibesDefault) vibesDefault.classList.remove('hidden');
}

// View full detail for selected pin (second click or View Details button)
function viewPinFullDetail() {
    const pin = state.selectedPin;
    if (!pin) return;

    const modal     = document.getElementById('modal-pin-full-detail');
    const imageWrap = document.getElementById('pfd-image-wrap');
    const noImage   = document.getElementById('pfd-no-image');
    const emoji     = getPinEmoji(pin.type);

    if (pin.image_url) {
        document.getElementById('pfd-image').src           = pin.image_url;
        document.getElementById('pfd-badge').textContent   = (pin.place_type || pin.type || '').toUpperCase();
        imageWrap.classList.remove('hidden');
        noImage.classList.add('hidden');
    } else {
        document.getElementById('pfd-emoji-large').textContent = emoji;
        imageWrap.classList.add('hidden');
        noImage.classList.remove('hidden');
    }

    const typeLabel = (pin.place_type || pin.type || '').replace(/-/g, ' ');
    document.getElementById('pfd-title').textContent      = pin.title;
    document.getElementById('pfd-badge-body').textContent = typeLabel.toUpperCase();
    document.getElementById('pfd-rating').textContent     = '⭐ ' + (pin.rating || 4.5);
    document.getElementById('pfd-type').textContent       = typeLabel;
    document.getElementById('pfd-price').textContent      = pin.price_range ? '• ' + pin.price_range : '';
    document.getElementById('pfd-friends').textContent    = '📍 ' + (pin.friends_visited || 0) + ' arkadaş ziyaret etti';

    const descWrap = document.getElementById('pfd-desc-wrap');
    if (pin.description && pin.description.trim()) {
        document.getElementById('pfd-description').textContent = pin.description;
        descWrap.classList.remove('hidden');
    } else {
        descWrap.classList.add('hidden');
    }

    const tipWrap = document.getElementById('pfd-tip-wrap');
    if (pin.user_tips && pin.user_tips.length > 0) {
        const tip = pin.user_tips[0];
        document.getElementById('pfd-tip-avatar').src       = 'https://i.pravatar.cc/40?u=' + tip.username;
        document.getElementById('pfd-tip-user').textContent = tip.username;
        document.getElementById('pfd-tip-text').textContent = '"' + tip.content + '"';
        tipWrap.classList.remove('hidden');
    } else {
        tipWrap.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    lucide?.createIcons();
}

function closePinFullDetail() {
    document.getElementById('modal-pin-full-detail')?.classList.add('hidden');
}
window.closePinFullDetail = closePinFullDetail;

// Get vibe tag color classes
function getVibeColors(vibe) {
    const lower = (vibe || '').toLowerCase();
    if (lower.includes('cozy') || lower.includes('chill')) return 'bg-orange-100 text-orange-600';
    if (lower.includes('sunset') || lower.includes('view')) return 'bg-purple-100 text-purple-600';
    if (lower.includes('photo') || lower.includes('instagram')) return 'bg-blue-100 text-blue-600';
    if (lower.includes('laptop') || lower.includes('work')) return 'bg-green-100 text-green-600';
    if (lower.includes('party') || lower.includes('night')) return 'bg-indigo-100 text-indigo-600';
    if (lower.includes('cheap') || lower.includes('budget')) return 'bg-amber-100 text-amber-600';
    if (lower.includes('romantic') || lower.includes('date')) return 'bg-rose-100 text-rose-600';
    return 'bg-gray-100 text-gray-600';
}

/**
 * Calculate straight-line distance in km between two lat/lng points
 */
function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Render Nearby Vibes scroll cards from pin data
 */
function renderNearbyVibes(pins) {
    const container = document.getElementById('nearby-vibes-scroll');
    if (!container) return;

    if (!pins || pins.length === 0) {
        container.innerHTML = `
            <div class="flex items-center justify-center w-full py-4">
                <p class="text-xs text-muted">Bu kategoride pin bulunamadı</p>
            </div>
        `;
        return;
    }

    // Sort by distance if user location is available
    const userLat = state.userLocation?.lat;
    const userLng = state.userLocation?.lng;

    const pinsWithDist = pins.slice(0, 10).map(pin => {
        let distKm = null;
        if (userLat != null && userLng != null && pin.lat && pin.lng) {
            distKm = calcDistanceKm(userLat, userLng, pin.lat, pin.lng);
        }
        return { ...pin, _distKm: distKm };
    });

    // Sort nearest first when location available
    if (userLat != null) {
        pinsWithDist.sort((a, b) => (a._distKm ?? 999) - (b._distKm ?? 999));
    }

    container.innerHTML = pinsWithDist.map(pin => {
        const emoji = getPinEmoji(pin.type);
        const vibes = (pin.vibes || pin.tags || []).slice(0, 1);
        const vibesHTML = vibes.map(v => {
            const colors = getVibeColors(v);
            return `<span class="text-[10px] ${colors} px-1.5 rounded-full">${v}</span>`;
        }).join('');

        // Distance badge
        let distBadge = '';
        if (pin._distKm != null) {
            const distStr = pin._distKm < 1
                ? `${Math.round(pin._distKm * 1000)} m`
                : `${pin._distKm.toFixed(1)} km`;
            distBadge = `<span class="nearby-distance-badge">${distStr}</span>`;
        }

        return `
            <div onclick="selectPinById('${pin._id}')">
                <div class="w-12 h-12 rounded-xl bg-sage/10 flex items-center justify-center text-xl shrink-0">${emoji}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-1">
                        <h3 class="font-bold text-main text-sm truncate">${pin.title}</h3>
                        <div class="bg-sage/10 text-sage text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">⭐ ${pin.rating || 4.5}</div>
                    </div>
                    <p class="text-xs text-muted truncate mt-0.5">${(pin.place_type || pin.type || 'Spot').replace('-', ' ')}</p>
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                        ${distBadge}
                        ${vibesHTML}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Select a pin by its ID (used from Nearby Vibes cards)
 */
function selectPinById(pinId) {
    const pin = (state.pins || []).find(p => p._id === pinId);
    if (pin) selectPin(pin);
}

function getPinEmoji(type) {
    const emojis = {
        'cafe': '☕',
        'cheap-eats': '🍜',
        'viewpoints': '🏔️',
        'hidden-gems': '💎',
        'restaurant': '🍽️',
        'nightlife': '🌙'
    };
    return emojis[type] || '📍';
}

function centerOnUser() {
    if (state.userLocation && state.map) {
        state.map.setView([state.userLocation.lat, state.userLocation.lng], DEFAULT_ZOOM);
    } else {
        getUserLocation().then(loc => {
            if (state.map) {
                state.map.setView([loc.lat, loc.lng], DEFAULT_ZOOM);
            }
        });
    }
}

/**
 * Setup Map Category Filter Pill Listeners
 */
function setupMapFilterListeners() {
    const pills = document.querySelectorAll('.map-filter-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            const filterType = e.currentTarget.dataset.filter;

            // Update active state
            pills.forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // Load filtered pins (events filter shows only event markers)
            if (filterType === 'events') {
                // Hide regular pin markers, keep only event markers visible
                (state.mapMarkers || []).forEach(m => m.remove());
                state.mapMarkers = [];
                // Refresh event pins and show in nearby vibes
                loadEventPins().then(() => {
                    renderNearbyVibes([]); // clear regular vibes
                });
            } else {
                // Re-show regular markers (event markers always stay)
                loadMapPins(filterType);
            }
        });
    });
}

// ============================================
// ADD PIN MODAL
// ============================================

function openAddPinModal(lat, lng) {
    // Use provided coords, or map center, or user location
    const center = state.map ? state.map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    document.getElementById('new-pin-lat').value = lat || center.lat;
    document.getElementById('new-pin-lng').value = lng || center.lng;

    // Reset form
    document.getElementById('form-add-pin').reset();
    document.getElementById('image-preview-container').classList.add('hidden');

    // Show modal
    document.getElementById('modal-add-pin').classList.remove('hidden');
    lucide?.createIcons();
}

function closeAddPinModal() {
    document.getElementById('modal-add-pin').classList.add('hidden');
}

async function handleAddPin(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btn-submit-pin');

    // Loading state
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Kaydediliyor...';

    const pinData = {
        lat:           parseFloat(formData.get('lat')) || DEFAULT_LOCATION.lat,
        lng:           parseFloat(formData.get('lng')) || DEFAULT_LOCATION.lng,
        title:         formData.get('title'),
        type:          formData.get('category'),
        description:   formData.get('description') || null,
        is_secret_spot: formData.get('is_secret') === 'on',
        image_url:     _pendingPinImageBase64 || null,
        audio_note_url: null,
        user_id:       localStorage.getItem('auth_user_id') || ''
    };

    try {
        const result = await api.createMapPin(pinData);
        if (result) {
            console.log('✅ Pin created:', result);
            _pendingPinImageBase64 = null;
            closeAddPinModal();

            // Add to allPins cache so filter works
            if (state.allPins) {
                state.allPins.push({ ...pinData, _id: result._id || result.id, ...result });
            }

            // Instantly add marker to map with neon glow effect
            const newPin = {
                ...pinData,
                _id: result._id || result.id,
                rating: result.rating || null,
                user_id: localStorage.getItem('auth_user_id') || '',
                vibes: [],
                user_tips: []
            };

            const marker = createPinMarker(newPin);
            state.mapMarkers.push(marker);
            state.pins.push(newPin);

            // Bounce the marker
            const el = marker.getElement ? marker.getElement() : marker._icon;
            if (el) {
                el.style.animation = 'stamp-zink 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
                setTimeout(() => { el.style.animation = ''; }, 600);
            }

            // Pan map to new pin
            if (state.map) {
                state.map.setView([pinData.lat, pinData.lng], 15, { animate: true });
            }

            // Refresh Nearby Vibes
            renderNearbyVibes(state.pins);

            // 🎉 Confetti celebration!
            showConfetti();
        }
    } catch (error) {
        console.error('❌ Error creating pin:', error);
        alert('Pin eklenirken bir hata oluştu.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '📍 Pin\'i Kaydet';
    }
}

// Image preview
// Holds the base64 image selected for the current pin being added
let _pendingPinImageBase64 = null;

function previewPinImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        _pendingPinImageBase64 = e.target.result;          // save for pinData
        document.getElementById('pin-image-preview').src = e.target.result;
        document.getElementById('image-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function clearPinImage() {
    _pendingPinImageBase64 = null;
    document.getElementById('pin-image-input').value = '';
    document.getElementById('image-preview-container').classList.add('hidden');
}

// Confetti celebration
function showConfetti() {
    const overlay = document.getElementById('confetti-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    // Generate confetti particles
    const burst = overlay.querySelector('.confetti-burst');
    if (burst) {
        burst.innerHTML = '';
        const colors = ['#9CAF88', '#A3C14A', '#FF8C42', '#A855F7', '#3B82F6', '#F43F5E', '#FBBF24'];
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'confetti-particle';
            particle.style.setProperty('--x', `${(Math.random() - 0.5) * 400}px`);
            particle.style.setProperty('--y', `${-Math.random() * 500 - 100}px`);
            particle.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
            particle.style.setProperty('--delay', `${Math.random() * 0.3}s`);
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            burst.appendChild(particle);
        }
    }

    // Auto-hide after 2.5s
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 2500);
}

// Map long-press to add pin at location
function setupMapLongPress() {
    if (!state.map) return;

    let pressTimer = null;
    let pressCoords = null;

    state.map.on('mousedown', (e) => {
        pressCoords = e.latlng;
        pressTimer = setTimeout(() => {
            openMapAddChoice(pressCoords.lat, pressCoords.lng);
        }, 600);
    });

    state.map.on('mouseup', () => { clearTimeout(pressTimer); });
    state.map.on('mousemove', () => { clearTimeout(pressTimer); });
    state.map.on('dragstart', () => { clearTimeout(pressTimer); });

    // Mobile: touchstart/touchend
    state.map.on('touchstart', (e) => {
        if (e.originalEvent.touches.length === 1) {
            pressCoords = state.map.mouseEventToLatLng(e.originalEvent.touches[0]);
            pressTimer = setTimeout(() => {
                openMapAddChoice(pressCoords.lat, pressCoords.lng);
            }, 600);
        }
    });
    state.map.on('touchend', () => { clearTimeout(pressTimer); });
    state.map.on('touchmove', () => { clearTimeout(pressTimer); });
}

// ============================================
// PAX — EVENT PINS
// ============================================

const EVENT_TYPE_EMOJI = {
    social: '👥', sport: '🏃', food: '🍽️', culture: '🎨',
    travel: '✈️', music: '🎵', adventure: '🧗'
};

const EVENT_TYPE_LABEL = {
    social: 'Buluşma', sport: 'Spor', food: 'Yemek', culture: 'Kültür',
    travel: 'Seyahat', music: 'Müzik', adventure: 'Macera'
};

function createEventPinMarker(event) {
    const emoji = EVENT_TYPE_EMOJI[event.event_type] || '🌟';
    const icon = L.divIcon({
        className: '',
        html: `<div class="event-pin-marker">${emoji}</div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
        popupAnchor: [0, -24]
    });

    const marker = L.marker([event.lat, event.lng], { icon, zIndexOffset: 500 })
        .addTo(state.map)
        .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectEvent(event);
        });

    const typeLabel = EVENT_TYPE_LABEL[event.event_type] || 'Etkinlik';
    const dateStr = event.event_date
        ? new Date(event.event_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '—';

    // Tooltip only — click already opens the PAX detail card
    marker.bindTooltip(`<span class="pin-tooltip">${emoji} ${event.title}</span>`, {
        direction: 'top', offset: [0, -20], opacity: 1, sticky: false
    });

    return marker;
}

async function loadEventPins() {
    try {
        const result = await api.getEventPins();
        const events = Array.isArray(result) ? result : (result?.events || []);

        // Clear existing event markers
        (state.eventMarkers || []).forEach(m => m.remove());
        state.eventMarkers = [];
        state.allEvents = [];

        events.forEach(ev => {
            const marker = createEventPinMarker(ev);
            state.eventMarkers.push(marker);
        });

        state.allEvents = events;
        console.log(`🌟 ${events.length} event pin yüklendi`);
    } catch (err) {
        console.error('Event pins yüklenemedi:', err);
    }
}

function selectEvent(event) {
    const emoji   = EVENT_TYPE_EMOJI[event.event_type] || '🌟';
    const label   = EVENT_TYPE_LABEL[event.event_type] || 'Etkinlik';
    const eventId = event._id || event.id || '';

    // ── Date
    const dateStr = event.event_date
        ? new Date(event.event_date).toLocaleString('tr-TR', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : '—';

    // ── Capacity
    const filled = event.participant_count || 0;
    const max    = event.max_participants  || 10;
    const pct    = Math.min(Math.round((filled / max) * 100), 100);

    // ── Avatar initials
    const initials = (event.creator_name || '?').trim().charAt(0).toUpperCase();

    // ── Fill modal fields
    document.getElementById('evd-type-badge').textContent   = `${emoji} ${label}`;
    document.getElementById('evd-title').textContent        = event.title;
    document.getElementById('evd-creator-name').textContent = event.creator_name || 'Anonim';
    document.getElementById('evd-avatar').textContent       = initials;
    document.getElementById('evd-date').textContent         = dateStr;
    document.getElementById('evd-participants').textContent = `${filled} / ${max}`;
    document.getElementById('evd-fill-bar').style.width     = `${pct}%`;
    document.getElementById('evd-fill-label').textContent   = `${pct}%`;
    document.getElementById('evd-description').textContent  = event.description || '—';

    // ── Location
    const locText = [event.address, event.city].filter(Boolean).join(', ');
    const locCell = document.getElementById('evd-location-cell');
    if (locText) {
        document.getElementById('evd-location').textContent = locText;
        locCell.classList.remove('hidden');
    } else {
        locCell.classList.add('hidden');
    }

    // ── Creator vs non-creator
    const myId      = sessionStorage.getItem('pax_creator_id') || '';
    const isCreator = !!(myId && myId === event.creator_id);

    document.getElementById('evd-join-section').classList.toggle('hidden', isCreator);
    document.getElementById('evd-creator-section').classList.toggle('hidden', !isCreator);

    if (!isCreator) {
        const wantBtn   = document.getElementById('btn-want-join');
        const alreadySent = _hasJoinRequest(eventId);
        wantBtn.disabled    = alreadySent;
        wantBtn.textContent = alreadySent ? '✅ İstek Gönderildi' : 'Katılmak İste ✨';
        document.getElementById('evd-join-form').classList.add('hidden');
        document.getElementById('join-message-text').value = '';
        document.getElementById('btn-send-join-request').dataset.eventId = eventId;
        document.getElementById('btn-send-join-request').disabled = false;
    } else {
        // Wire "İstekleri Yönet" button
        const manageBtn = document.getElementById('btn-manage-event');
        if (manageBtn) manageBtn.dataset.eventId = eventId;

        // Show pending count for creator
        api.getJoinRequests(eventId, myId)
           .then(reqs => {
               const pending = Array.isArray(reqs)
                   ? reqs.filter(r => r.status === 'pending').length : 0;
               document.getElementById('evd-pending-count').textContent =
                   pending ? `${pending} bekleyen istek var` : 'Bekleyen istek yok';
           }).catch(() => {});
    }

    document.getElementById('modal-event-detail').classList.remove('hidden');
    lucide?.createIcons();
}

function deselectEvent() {
    document.getElementById('modal-event-detail')?.classList.add('hidden');
}

function showJoinForm() {
    document.getElementById('btn-want-join').classList.add('hidden');
    document.getElementById('evd-join-form').classList.remove('hidden');
    document.getElementById('join-message-text').focus();
}

function cancelJoinForm() {
    document.getElementById('evd-join-form').classList.add('hidden');
    document.getElementById('btn-want-join').classList.remove('hidden');
}

// --- Map Add Choice Card ---

let _pendingMapCoords = null;

function openMapAddChoice(lat, lng) {
    const center = state.map ? state.map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    _pendingMapCoords = { lat: lat ?? center.lat, lng: lng ?? center.lng };
    document.getElementById('map-add-choice-backdrop').classList.add('show');
    document.getElementById('map-add-choice-card').classList.add('show');
}

function closeMapAddChoice() {
    document.getElementById('map-add-choice-backdrop').classList.remove('show');
    document.getElementById('map-add-choice-card').classList.remove('show');
}

function chooseAddPin() {
    closeMapAddChoice();
    openAddPinModal(_pendingMapCoords?.lat, _pendingMapCoords?.lng);
}

function chooseAddEvent() {
    closeMapAddChoice();
    openAddEventModal(_pendingMapCoords?.lat, _pendingMapCoords?.lng);
}

// --- Add Event Modal ---

function openAddEventModal(lat, lng) {
    const center = state.map ? state.map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    document.getElementById('new-event-lat').value = lat ?? center.lat;
    document.getElementById('new-event-lng').value = lng ?? center.lng;
    // Generate a session-scoped creator ID
    if (!sessionStorage.getItem('pax_creator_id')) {
        sessionStorage.setItem('pax_creator_id', 'user_' + Date.now());
    }
    document.getElementById('new-event-creator-id').value = sessionStorage.getItem('pax_creator_id');
    document.getElementById('form-add-event').reset();
    // Re-apply creator ID after reset
    document.getElementById('new-event-creator-id').value = sessionStorage.getItem('pax_creator_id');
    document.getElementById('modal-add-event').classList.remove('hidden');
    lucide?.createIcons();
}

function closeAddEventModal() {
    document.getElementById('modal-add-event').classList.add('hidden');
}

async function handleAddEvent(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btn-submit-event');

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Oluşturuluyor…';

    const eventData = {
        lat:              parseFloat(formData.get('lat'))              || DEFAULT_LOCATION.lat,
        lng:              parseFloat(formData.get('lng'))              || DEFAULT_LOCATION.lng,
        title:            formData.get('title'),
        description:      formData.get('description'),
        event_date:       formData.get('event_date'),
        max_participants: parseInt(formData.get('max_participants'))   || 10,
        event_type:       formData.get('event_type')                  || 'social',
        creator_id:       formData.get('creator_id')                  || sessionStorage.getItem('pax_creator_id') || ('anon_' + Date.now()),
        creator_name:     formData.get('creator_name')                || null,
        address:          formData.get('address')                     || null,
    };

    try {
        const result = await api.createEventPin(eventData);
        if (result) {
            closeAddEventModal();
            showToast('Etkinlik oluşturuldu! 🌟', 'success');
            _savePaxEvent(result, 'creator');
            const marker = createEventPinMarker(result);
            state.eventMarkers = state.eventMarkers || [];
            state.eventMarkers.push(marker);
            state.allEvents = state.allEvents || [];
            state.allEvents.push(result);
            state.map.setView([result.lat, result.lng], 15, { animate: true });
        } else {
            showToast('Etkinlik oluşturulamadı 😔', 'error');
        }
    } catch {
        showToast('Bir hata oluştu 😔', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Etkinlik Oluştur ✨';
    }
}

async function handleJoinEvent() {
    const sendBtn = document.getElementById('btn-send-join-request');
    const eventId = sendBtn?.dataset.eventId;
    if (!eventId) return;

    const userId = sessionStorage.getItem('pax_creator_id') || ('user_' + Date.now());
    sessionStorage.setItem('pax_creator_id', userId);

    const message = document.getElementById('join-message-text')?.value?.trim() || null;

    sendBtn.disabled    = true;
    sendBtn.textContent = '⏳ Gönderiliyor…';

    // Grab the current event for planner save
    const currentEvent = state.allEvents?.find(e => (e._id || e.id) === eventId) || null;

    try {
        // Use raw fetch so we can handle 409 (already requested) gracefully
        const resp = await fetch(`${API_BASE}/map/events/${encodeURIComponent(eventId)}/join`, {
            method: 'POST',
            headers: api._authHeaders(),
            body: JSON.stringify({ user_id: userId, message })
        });

        const isAlreadySent = resp.status === 409;
        const isSuccess     = resp.ok || isAlreadySent;

        if (isSuccess) {
            showToast(isAlreadySent ? 'Bu etkinlik için zaten istek gönderdin ✅' : 'Katılma isteği gönderildi! 🎉', 'success');
            _saveJoinRequest(eventId);
            // Save event to planner with "pending" status
            if (currentEvent) _savePaxEvent({ ...currentEvent, _pax_status: 'pending' }, 'participant');
            // Collapse form, show sent confirmation in CTA area
            document.getElementById('evd-join-form').classList.add('hidden');
            const wantBtn = document.getElementById('btn-want-join');
            wantBtn.classList.remove('hidden');
            wantBtn.disabled    = true;
            wantBtn.textContent = '✅ İstek Gönderildi';
        } else {
            showToast('İstek gönderilemedi 😔', 'error');
            sendBtn.disabled    = false;
            sendBtn.textContent = 'İsteği Gönder 🎉';
        }
    } catch {
        showToast('Bir hata oluştu 😔', 'error');
        sendBtn.disabled    = false;
        sendBtn.textContent = 'İsteği Gönder 🎉';
    }
}

// ============================================
// PAX — MANAGE EVENT (CREATOR PANEL)
// ============================================

let _manageEventId    = null;
let _manageRequests   = [];

async function openManageEvent() {
    const manageBtn = document.getElementById('btn-manage-event');
    _manageEventId  = manageBtn?.dataset.eventId || null;
    if (!_manageEventId) return;

    const creatorId = sessionStorage.getItem('pax_creator_id') || '';

    // Show modal with loading state
    document.getElementById('manage-requests-list').innerHTML =
        '<p class="text-sm text-muted text-center py-6">⏳ Yükleniyor…</p>';
    document.getElementById('manage-req-count').textContent = '';
    document.getElementById('modal-manage-event').classList.remove('hidden');
    lucide?.createIcons();

    try {
        const raw = await api.getJoinRequests(_manageEventId, creatorId);
        _manageRequests = Array.isArray(raw) ? raw : [];
    } catch {
        _manageRequests = [];
    }

    renderJoinRequests(_manageRequests);

    // Show award-stamps footer if the event date has passed
    const awardFooter = document.getElementById('manage-award-footer');
    if (awardFooter && state.allEvents) {
        const ev = state.allEvents.find(e => (e._id || e.id) === _manageEventId);
        const eventPast = ev?.event_date && new Date(ev.event_date) < new Date();
        awardFooter.classList.toggle('hidden', !eventPast);
    }
}

function closeManageEvent() {
    document.getElementById('modal-manage-event').classList.add('hidden');
}

function renderJoinRequests(requests) {
    const pending  = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const rejected = requests.filter(r => r.status === 'rejected');

    document.getElementById('manage-req-count').textContent =
        `${requests.length} istek · ${pending.length} bekliyor`;

    const container = document.getElementById('manage-requests-list');

    if (requests.length === 0) {
        container.innerHTML =
            '<div class="text-center py-10"><p class="text-3xl mb-2">📭</p><p class="text-sm text-muted">Henüz katılma isteği yok.</p></div>';
        return;
    }

    let html = '';

    if (pending.length) {
        html += `<h4 class="text-xs font-bold text-main uppercase tracking-wide mb-2">⏳ Bekleyenler (${pending.length})</h4>`;
        pending.forEach(r => { html += _buildRequestCard(r, true); });
    }
    if (approved.length) {
        html += `<h4 class="text-xs font-bold text-main uppercase tracking-wide mt-4 mb-2">✅ Onaylananlar (${approved.length})</h4>`;
        approved.forEach(r => { html += _buildRequestCard(r, false); });
    }
    if (rejected.length) {
        html += `<h4 class="text-xs font-bold text-main uppercase tracking-wide mt-4 mb-2">❌ Reddedilenler (${rejected.length})</h4>`;
        rejected.forEach(r => { html += _buildRequestCard(r, false); });
    }

    container.innerHTML = html;
    lucide?.createIcons();
}

function _buildRequestCard(req, showActions) {
    const reqId    = req._id || req.id || '';
    const initials = (req.user_name || '?').trim().charAt(0).toUpperCase();
    const safeName = (req.user_name || 'Anonim Kullanıcı').replace(/'/g, '&#39;');
    const safeId   = (req.user_id  || '').replace(/'/g, '&#39;');

    const statusBadge = {
        pending:  '<span class="req-status req-status--pending">Bekliyor</span>',
        approved: '<span class="req-status req-status--approved">Onaylandı</span>',
        rejected: '<span class="req-status req-status--rejected">Reddedildi</span>',
    }[req.status] || '';

    const msgHtml = req.message
        ? `<p class="text-xs text-muted mt-1 italic line-clamp-2">"${req.message}"</p>`
        : '';

    const actionsHtml = showActions ? `
        <div class="flex gap-2 mt-2.5">
            <button onclick="approveRequest('${reqId}')" class="btn-approve">✓ Onayla</button>
            <button onclick="rejectRequest('${reqId}')" class="btn-reject">✗ Reddet</button>
        </div>` : '';

    return `
        <div class="req-card" id="req-card-${reqId}">
            <div class="flex items-start gap-3">
                <button class="req-avatar"
                    onclick="openPublicProfile('${safeId}', '${safeName}')">
                    ${initials}
                </button>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <button class="text-sm font-bold text-main hover:text-[#A3C14A] transition-colors truncate text-left"
                            onclick="openPublicProfile('${safeId}', '${safeName}')">
                            ${safeName}
                        </button>
                        ${statusBadge}
                    </div>
                    ${msgHtml}
                </div>
            </div>
            ${actionsHtml}
        </div>`;
}

async function approveRequest(requestId) { await _updateRequest(requestId, 'approved'); }
async function rejectRequest(requestId)  { await _updateRequest(requestId, 'rejected'); }

async function _updateRequest(requestId, newStatus) {
    const creatorId = sessionStorage.getItem('pax_creator_id') || '';
    const card      = document.getElementById(`req-card-${requestId}`);

    if (card) { card.style.opacity = '0.45'; card.style.pointerEvents = 'none'; }

    try {
        const result = await api.updateRequestStatus(_manageEventId, requestId, creatorId, newStatus);
        if (result) {
            // Update local list and re-render
            const idx = _manageRequests.findIndex(r => (r._id || r.id) === requestId);
            if (idx > -1) _manageRequests[idx].status = newStatus;
            renderJoinRequests(_manageRequests);

            const label = newStatus === 'approved' ? 'Onaylandı ✅' : 'Reddedildi ❌';
            showToast(`İstek ${label}`, newStatus === 'approved' ? 'success' : 'info');

            // If approved and we know the event, save it for the participant's planner
            if (newStatus === 'approved' && _manageEventId && state.allEvents) {
                const ev = state.allEvents.find(e => (e._id || e.id) === _manageEventId);
                if (ev) _savePaxEvent(ev, 'participant');
            }

            // Refresh pending count in event detail modal
            const pending = _manageRequests.filter(r => r.status === 'pending').length;
            const el = document.getElementById('evd-pending-count');
            if (el) el.textContent = pending ? `${pending} bekleyen istek var` : 'Bekleyen istek yok';
        } else {
            showToast('İşlem başarısız 😔', 'error');
            if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
        }
    } catch {
        showToast('İşlem başarısız 😔', 'error');
        if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
    }
}

// ============================================
// PAX — PUBLIC PROFILE MODAL
// ============================================

async function openPublicProfile(userId, userName) {
    const modal = document.getElementById('modal-public-profile');
    modal.classList.remove('hidden');
    lucide?.createIcons();

    // Show initials immediately
    const initials = (userName || '?').trim().charAt(0).toUpperCase();
    document.getElementById('pp-avatar').textContent        = initials;
    document.getElementById('pp-name').textContent          = userName || 'Kullanıcı';
    document.getElementById('pp-level').textContent         = '';
    document.getElementById('pp-bio').textContent           = '';
    document.getElementById('pp-visited-count').textContent = '🌍 — ülke gezdi';
    document.getElementById('pp-flags').textContent         = '';
    document.getElementById('pp-no-profile').classList.add('hidden');

    try {
        const profile = await api.getPublicProfile(userId);
        if (!profile) return;

        document.getElementById('pp-name').textContent =
            profile.display_name || userName || 'Kullanıcı';
        document.getElementById('pp-level').textContent =
            profile.passport_level ? `✈️ ${profile.passport_level}` : '';
        document.getElementById('pp-bio').textContent =
            profile.bio || '';
        document.getElementById('pp-visited-count').textContent =
            `🌍 ${profile.visited_count || 0} ülke gezdi`;

        // Country flag row (max 8 flags)
        const flags = (profile.visited_countries || []).slice(0, 8).map(c => {
            const code = typeof c === 'string' ? c : (c?.country_code || '');
            return _countryCodeToEmoji(code);
        }).filter(Boolean).join(' ');
        document.getElementById('pp-flags').textContent = flags;

        if (!profile.found) {
            document.getElementById('pp-no-profile').classList.remove('hidden');
        }
    } catch { /* silently fail — name already shown */ }
}

function closePublicProfile() {
    document.getElementById('modal-public-profile').classList.add('hidden');
}

function _countryCodeToEmoji(code) {
    if (!code || code.length < 2) return '';
    return code.toUpperCase().split('')
        .map(c => String.fromCodePoint(c.charCodeAt(0) + 127397))
        .join('');
}

// ============================================
// PHASE 5 — NOTIFICATIONS
// ============================================

let _notifPollInterval = null;

function _notifUserId() {
    return sessionStorage.getItem('pax_creator_id') || null;
}

async function loadNotifications() {
    const userId = _notifUserId();
    if (!userId) return;

    try {
        const data = await api.getNotifications(userId);
        if (!data) return;

        const unread = data.unread ?? 0;
        const badge  = document.getElementById('notif-badge');
        if (badge) {
            badge.textContent    = unread > 9 ? '9+' : String(unread);
            badge.style.display  = unread > 0 ? 'flex' : 'none';
        }

        // Cache for panel rendering
        window._cachedNotifications = data.notifications || [];

        // Trigger browser notification for new items since last check
        _checkForNewBrowserNotifs(data.notifications || []);
    } catch { /* silent */ }
}

let _lastNotifIds = new Set();

function _checkForNewBrowserNotifs(notifs) {
    const newItems = notifs.filter(n => !n.read && !_lastNotifIds.has(n._id || n.id));
    _lastNotifIds = new Set(notifs.map(n => n._id || n.id));

    for (const n of newItems.slice(0, 3)) {   // cap at 3 per poll
        _showBrowserNotification(n.title, n.body);
    }
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;

    const isOpen = panel.classList.contains('show');
    if (isOpen) {
        closeNotificationPanel();
    } else {
        renderNotifications(window._cachedNotifications || []);
        panel.classList.add('show');
        // Auto-close on outside click
        setTimeout(() => {
            document.addEventListener('click', _notifOutsideClick, { once: true });
        }, 0);
    }
}

function _notifOutsideClick(e) {
    const panel = document.getElementById('notification-panel');
    const bell  = document.getElementById('btn-notif-bell');
    if (!panel) return;
    if (!panel.contains(e.target) && !bell?.contains(e.target)) {
        closeNotificationPanel();
    }
}

function closeNotificationPanel() {
    document.getElementById('notification-panel')?.classList.remove('show');
}

function renderNotifications(notifs) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifs || notifs.length === 0) {
        list.innerHTML = `
            <div class="notif-empty">
                <span class="notif-empty-icon">🔔</span>
                Henüz bildirim yok
            </div>`;
        return;
    }

    const NOTIF_ICON = {
        join_approved:   '🎉',
        join_rejected:   '😔',
        event_reminder:  '⏰',
        event_stamp:     '🏅',
    };

    // Sync planner statuses from notifications
    notifs.forEach(n => {
        if (n.event_id) {
            if (n.type === 'join_approved') _updatePaxEventStatus(n.event_id, 'approved');
            if (n.type === 'join_rejected') _updatePaxEventStatus(n.event_id, 'rejected');
        }
    });

    list.innerHTML = notifs.map(n => {
        const icon        = NOTIF_ICON[n.type] || '🔔';
        const unreadClass = n.read ? '' : 'unread';
        const iconClass   = n.type === 'join_rejected' ? 'notif-icon--rejected' : '';
        const timeStr     = _formatNotifTime(n.created_at);
        return `
        <div class="notif-item ${unreadClass}" data-notif-id="${n._id || n.id || ''}">
            <div class="notif-icon ${iconClass}">${icon}</div>
            <div class="notif-content">
                <div class="notif-title">${_escapeHtml(n.title)}</div>
                <div class="notif-body">${_escapeHtml(n.body)}</div>
                <div class="notif-time">${timeStr}</div>
            </div>
        </div>`;
    }).join('');
}

async function markAllNotificationsRead() {
    const userId = _notifUserId();
    if (!userId) return;

    try {
        await api.markNotificationsRead(userId);

        // Update badge
        const badge = document.getElementById('notif-badge');
        if (badge) badge.style.display = 'none';

        // Mark all items in panel as read
        document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));

        // Update cache
        if (window._cachedNotifications) {
            window._cachedNotifications.forEach(n => { n.read = true; });
        }
    } catch { /* silent */ }
}

function _formatNotifTime(isoStr) {
    if (!isoStr) return '';
    const d    = new Date(isoStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)     return 'Az önce';
    if (diff < 3600)   return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)} sa önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
}

function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================
// PHASE 5 — BROWSER NOTIFICATIONS
// ============================================

function _requestBrowserNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

function _showBrowserNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        new Notification(title, {
            body,
            icon: '/Frontend/icons/icon-192.png',
            badge: '/Frontend/icons/icon-192.png',
            tag:  `planigo-${Date.now()}`,
        });
    } catch { /* denied or blocked */ }
}

// ============================================
// PHASE 5 — PAX PLANNER SYNC
// ============================================

// ── Join request tracking (per user, persisted in localStorage) ──
function _joinRequestsKey() {
    const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || 'anon';
    return `pax_join_requests_${uid}`;
}

function _hasJoinRequest(eventId) {
    try {
        const sent = JSON.parse(localStorage.getItem(_joinRequestsKey()) || '[]');
        return sent.includes(eventId);
    } catch { return false; }
}

function _saveJoinRequest(eventId) {
    try {
        const key  = _joinRequestsKey();
        const sent = JSON.parse(localStorage.getItem(key) || '[]');
        if (!sent.includes(eventId)) {
            sent.push(eventId);
            localStorage.setItem(key, JSON.stringify(sent));
        }
    } catch { /* quota */ }
}

function _paxPlannerKey() {
    const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || 'anon';
    return `pax_upcoming_events_${uid}`;
}

function _savePaxEvent(event, role = 'participant') {
    if (!event) return;
    try {
        const key    = _paxPlannerKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const id     = event._id || event.id;
        const idx    = stored.findIndex(e => (e._id || e.id) === id);

        const entry = {
            ...event,
            _pax_role:   role,
            _pax_status: event._pax_status || (role === 'creator' ? 'creator' : 'pending'),
            _my_user_id: sessionStorage.getItem('pax_creator_id') || localStorage.getItem('auth_user_id') || '',
            _saved_at:   Date.now()
        };

        if (idx > -1) {
            // Update existing entry (e.g. status change)
            stored[idx] = { ...stored[idx], ...entry };
        } else {
            stored.unshift(entry);
        }
        localStorage.setItem(key, JSON.stringify(stored.slice(0, 50)));
    } catch { /* quota exceeded */ }
}

function _removePaxEvent(eventId) {
    try {
        const key    = _paxPlannerKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(stored.filter(e => (e._id || e.id) !== eventId)));
    } catch { /* ignore */ }

    // Also remove from join-requests tracker
    try {
        const jKey = _joinRequestsKey();
        const sent = JSON.parse(localStorage.getItem(jKey) || '[]');
        localStorage.setItem(jKey, JSON.stringify(sent.filter(id => id !== eventId)));
    } catch { /* ignore */ }
}

async function cancelPaxEvent(eventId, role) {
    let userId = '';
    try {
        const stored = JSON.parse(localStorage.getItem(_paxPlannerKey()) || '[]');
        const ev = stored.find(e => (e._id || e.id) === eventId);
        if (role === 'creator') {
            // Use the creator_id stored in the event itself — exact match with DB
            userId = ev?.creator_id || ev?._my_user_id || '';
        } else {
            // Use the user_id that was active when the join request was sent
            userId = ev?._my_user_id || '';
        }
    } catch { /* ignore */ }
    // Fallback to current session
    userId = userId || localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '';
    if (!userId) { showToast('Oturum bulunamadı', 'error'); return; }

    const btn = document.querySelector(`[data-cancel-event="${eventId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        if (role === 'creator') {
            await api.deleteEventPin(eventId, userId);
            showToast('Etkinlik iptal edildi ve silindi 🗑️', 'info');
        } else {
            await api.cancelJoinRequest(eventId, userId);
            showToast('Katılma isteğin iptal edildi', 'info');
        }
        _removePaxEvent(eventId);
        renderPaxEventsInPlanner();
    } catch (err) {
        console.error('cancelPaxEvent error:', err);
        showToast('İptal işlemi başarısız, tekrar dene', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'İptal Et'; }
    }
}

function _updatePaxEventStatus(eventId, newStatus) {
    try {
        const key    = _paxPlannerKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const idx    = stored.findIndex(e => (e._id || e.id) === eventId);
        if (idx > -1) {
            stored[idx]._pax_status = newStatus;
            localStorage.setItem(key, JSON.stringify(stored));
        }
    } catch { /* ignore */ }
}

function renderPaxEventsInPlanner() {
    const section   = document.getElementById('pax-events-planner-section');
    const container = document.getElementById('pax-events-planner');
    if (!section || !container) return;

    let events = [];
    try {
        events = JSON.parse(localStorage.getItem(_paxPlannerKey()) || '[]');
    } catch { events = []; }

    if (events.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const EVENT_TYPE_EMOJI_LOCAL = {
        social: '☕', sport: '⚽', food: '🍕',
        culture: '🏛️', travel: '✈️', music: '🎵', adventure: '🏔️'
    };

    const STATUS_CONFIG = {
        creator:  { label: 'Organizatör',      cls: 'pax-event-role--creator',     icon: '👑' },
        pending:  { label: 'Beklemede',         cls: 'pax-event-role--pending',     icon: '🕒' },
        approved: { label: 'Onaylandı',         cls: 'pax-event-role--approved',    icon: '✅' },
        rejected: { label: 'Reddedildi',        cls: 'pax-event-role--rejected',    icon: '❌' },
    };

    container.innerHTML = events.map(ev => {
        const role      = ev._pax_role   || 'participant';
        const status    = ev._pax_status || (role === 'creator' ? 'creator' : 'pending');
        const cfg       = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        const emoji     = EVENT_TYPE_EMOJI_LOCAL[ev.event_type] || '🌟';
        const typeLabel = (ev.event_type || 'Etkinlik').charAt(0).toUpperCase() +
                          (ev.event_type || '').slice(1);
        const dateStr   = ev.event_date
            ? new Date(ev.event_date).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })
            : '—';
        const loc       = [ev.city, ev.country].filter(Boolean).join(', ') || ev.address || '';

        const evId      = ev._id || ev.id || '';
        const cancelLbl = role === 'creator' ? '🗑️ Sil' : '✕ İptal';
        const canChat   = (status === 'creator' || status === 'approved');
        const unreadKey = `pax_chat_unread_${evId}`;
        const hasUnread = canChat && !!localStorage.getItem(unreadKey);
        const chatBtnHtml = canChat
            ? `<button class="pax-chat-btn${hasUnread ? ' pax-chat-btn--unread' : ''}"
                title="Grup Sohbeti"
                onclick="openEventChat('${evId}',event)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
               </button>`
            : '';
        return `
        <div class="pax-event-card" data-event-id="${evId}">
            <div class="pax-event-card-body">
                <div class="flex items-center justify-between mb-1">
                    <span class="pax-event-card-type">${emoji} ${_escapeHtml(typeLabel)}</span>
                    <div class="flex items-center gap-2">
                        ${chatBtnHtml}
                        <span class="pax-event-role ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
                        <button class="pax-cancel-btn" data-cancel-event="${evId}"
                            onclick="cancelPaxEvent('${evId}','${role}')">${cancelLbl}</button>
                    </div>
                </div>
                <div class="pax-event-card-title">${_escapeHtml(ev.title || 'Etkinlik')}</div>
                <div class="pax-event-card-meta">
                    <span class="pax-event-card-date">📅 ${dateStr}</span>
                    ${loc ? `<span class="pax-event-card-loc">📍 ${_escapeHtml(loc)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}


// ============================================================
// EVENT GROUP CHAT
// ============================================================
let _chatEventId   = null;
let _chatEventData = null;
let _chatPollTimer = null;

function openEventChat(eventId, e) {
    if (e) e.stopPropagation();

    // Clear unread badge
    localStorage.removeItem('pax_chat_unread_' + eventId);
    const btn = document.querySelector('.pax-chat-btn[onclick*="' + eventId + '"]');
    if (btn) btn.classList.remove('pax-chat-btn--unread');

    // Find event data — scan all pax planner keys (event may have been saved under session or auth key)
    let ev = null;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('pax_upcoming_events_')) continue;
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            const found = arr.find(function(e) { return (e._id || e.id) === eventId; });
            if (found) { ev = found; break; }
        }
    } catch(err) {}
    if (!ev) ev = {};

    _chatEventId   = eventId;
    _chatEventData = ev;

    // Populate header
    const titleEl = document.getElementById('chat-event-title');
    const countEl = document.getElementById('chat-participant-count');
    if (titleEl) titleEl.textContent = ev.title || 'Grup Sohbeti';
    if (countEl) countEl.textContent = (ev.participant_count || 0) + 1 + ' katilimci';

    document.getElementById('modal-event-chat') && document.getElementById('modal-event-chat').classList.remove('hidden');
    const inp = document.getElementById('chat-input');
    if (inp) inp.focus();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    _loadChatMessages();
    if (_chatPollTimer) clearInterval(_chatPollTimer);
    _chatPollTimer = setInterval(_loadChatMessages, 8000);
}

function closeEventChat() {
    const modal = document.getElementById('modal-event-chat');
    if (modal) modal.classList.add('hidden');
    clearInterval(_chatPollTimer);
    _chatEventId   = null;
    _chatEventData = null;
}

async function _loadChatMessages() {
    if (!_chatEventId) return;
    // Use the creator_id stored on the event if we are the creator (session-based IDs)
    // Build uid: prefer event's own creator_id (if we are creator), else auth_user_id, else session pax_creator_id
    const uid = (_chatEventData && _chatEventData.creator_id &&
                 (_chatEventData._pax_role === 'creator' || _chatEventData._pax_status === 'creator'))
        ? _chatEventData.creator_id
        : (localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '');
    if (!uid) return;

    try {
        const msgs = await api.getChatMessages(_chatEventId, uid);
        _renderChatMessages(msgs, uid);
    } catch (err) {
        console.warn('Chat fetch error:', err);
    }
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

    const html = msgs.map(function(m) {
        const isMine = m.user_id === myUid;
        const name   = isMine ? 'Sen' : _escapeHtml(m.user_name || 'Katilimci');
        const time   = m.created_at
            ? new Date(m.created_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })
            : '';
        const align  = isMine ? 'items-end' : 'items-start';
        return '<div class="chat-row ' + align + '">'
            + (!isMine ? '<span style="font-size:10px;color:#9ca3af;font-weight:600;padding-left:4px;">' + name + '</span>' : '')
            + '<div class="chat-bubble chat-bubble--' + (isMine ? 'mine' : 'other') + '">' + _escapeHtml(m.text) + '</div>'
            + '<span style="font-size:10px;color:#9ca3af;' + (isMine ? 'padding-right:4px;' : 'padding-left:4px;') + '">' + time + '</span>'
            + '</div>';
    }).join('');

    container.innerHTML = '<div id="chat-empty" style="display:none;"></div>' + html;
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text  = input ? input.value.trim() : '';
    if (!text || !_chatEventId) return;

    const uid  = (_chatEventData && _chatEventData.creator_id &&
                  (_chatEventData._pax_role === 'creator' || _chatEventData._pax_status === 'creator'))
        ? _chatEventData.creator_id
        : (localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || '');
    const name = (state.passport && state.passport.username) || localStorage.getItem('auth_username') || (_chatEventData && _chatEventData.creator_name) || 'Kullanici';
    if (!uid) { showToast('Oturum bilgisi bulunamadi', 'error'); return; }

    input.value = '';
    input.style.height = 'auto';

    try {
        await api.sendChatMsg(_chatEventId, { user_id: uid, user_name: name, text: text });
        await _loadChatMessages();
    } catch (err) {
        showToast('Mesaj gonderilemedi', 'error');
        input.value = text;
    }
}

window.openEventChat   = openEventChat;
window.closeEventChat  = closeEventChat;
window.sendChatMessage = sendChatMessage;

// ============================================
// PHASE 5 — AWARD STAMPS
// ============================================

async function awardEventStamps() {
    const creatorId = sessionStorage.getItem('pax_creator_id') || '';
    if (!_manageEventId || !creatorId) {
        showToast('Bilgi eksik 😔', 'error');
        return;
    }

    const btn = document.querySelector('#manage-award-footer button');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Damgalar veriliyor…'; }

    try {
        const result = await api.awardEventStamps(_manageEventId, creatorId);
        const count  = result?.stamps_awarded ?? 0;
        showToast(`${count} katılımcıya etkinlik damgası verildi! 🏅`, 'success');

        // Hide the footer after awarding
        document.getElementById('manage-award-footer')?.classList.add('hidden');
    } catch {
        showToast('Damgalar verilemedi 😔', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Etkinlik Bitti — Damgaları Ver'; }
    }
}

// ============================================
// PHASE 5 — NOTIFICATION POLLING SETUP
// ============================================

function _startNotifPolling() {
    _requestBrowserNotificationPermission();
    loadNotifications();  // immediate first load

    clearInterval(_notifPollInterval);
    _notifPollInterval = setInterval(loadNotifications, 30_000);

    // Re-poll on tab focus
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadNotifications();
    });
}

// ============================================
// DISCOVERY SCREEN
// ============================================

async function loadDiscoveryFull(filter = null) {
    state.loading.discovery = true;

    // Show skeleton on initial load
    if (!state.discovery) {
        const dealCard = document.getElementById('deal-of-day-card');
        if (dealCard) dealCard.innerHTML = '<div class="skeleton-card w-full h-full aspect-[16/10]"></div>';
    }

    // Stage 1 — Render filter pills from in-code mock array
    // (wired to /discover/categories structure; array replaces hardcoded HTML)
    renderDiscoveryFilterPills(DISCOVER_FILTER_CATEGORIES, filter);

    // Map legacy filter IDs → Discover v2 category names
    const _catMap = { visa_free: 'vizesiz', under_5k: 'bütçe-dostu' };
    const discoverCat = filter ? (_catMap[filter] || filter) : '';

    // Stage 2 + 3 — Parallel fetch from structured endpoints
    const isVizesiz = (filter === 'vizesiz' || filter === 'visa_free');
    const isBudget  = (filter === 'under_5k' || filter === 'bütçe-dostu');

    const [heroRes, trendingRes, dealsRes, vizesizRes, budgetRes] = await Promise.all([
        api.discoverHero(),
        api.discoverTrending(6),
        (isVizesiz || isBudget) ? Promise.resolve(null) : api.discoverDeals(discoverCat),
        isVizesiz ? api.discoverVizesiz()        : Promise.resolve(null),
        isBudget  ? api.discoverBudgetFriendly() : Promise.resolve(null),
    ]);

    const normalDeals = (dealsRes?.deals || []).map(_normalizeDeal);

    const data = {
        deal_of_the_day:        heroRes     ? _normalizeHero(heroRes) : null,
        viral_stories:          trendingRes?.stories || [],
        budget_escapes:         normalDeals,
        visa_free_gems:         [],
        featured_deals:         [],
        vizesiz_routes:         vizesizRes?.routes || [],
        budget_friendly_routes: budgetRes?.routes  || [],
    };

    state.discovery = data;
    renderDiscoveryFull(data, filter);
    state.loading.discovery = false;
}

/** Normalize /discover/hero response → deal_of_the_day schema */
function _normalizeHero(h) {
    return {
        title:           h.city_name || h.title || '',
        city_name:       h.city_name || '',
        image_url:       h.image_url || '',
        destination_image_url: h.image_url || '',
        discounted_price: h.price || 0,
        original_price:  h.original_price || null,
        currency:        h.currency || 'TRY',
        nights:          h.nights || 3,
        airline:         h.airline || null,
        route:           h.route   || null,
        discount_rate:   h.discount_rate || null,
        is_live:         h.is_live  ?? true,
        is_visa_free:    h.visa_free ?? false,
        remaining_hours: h.remaining_hours || 0,
    };
}

/** Normalize /discover/deals item → budget_escapes schema */
function _normalizeDeal(d) {
    return {
        city:            d.city_name    || '',
        country:         d.country      || '',
        starting_price:  d.price        || 0,
        currency:        d.currency     || 'TRY',
        nights:          parseInt(d.duration) || 3,
        flight_duration: d.flight_time  || '',
        is_visa_free:    d.visa_free    || false,
        seats_left:      d.seats_left   || null,
        discount_badge:  null,
        image_url:       d.image_url    || '',
        rating:          d.rating       || null,
        tags:            d.tags         || [],
    };
}

/**
 * Renders filter pills dynamically from the categories array.
 * Called every time the discovery screen loads — replaces any existing pills.
 */
function renderDiscoveryFilterPills(categories, activeFilter) {
    const container = document.getElementById('discovery-filter-pills');
    if (!container) return;

    container.innerHTML = categories.map(c => {
        const isActive = activeFilter === c.filter || (!activeFilter && c.filter === null);
        return `<button class="filter-pill${isActive ? ' active' : ''}" data-filter="${c.id}">
            <i data-lucide="${c.icon}" class="w-4 h-4"></i> ${c.label}
        </button>`;
    }).join('');

    lucide?.createIcons();

    // Re-attach click listeners to newly created elements
    container.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', e => {
            const cat = e.currentTarget.dataset.filter;
            // Map category ID to legacy filter value
            const found = DISCOVER_FILTER_CATEGORIES.find(c => c.id === cat);
            requestDiscoveryFilter(found?.filter ?? null, e.currentTarget);
        });
    });
}

async function requestDiscoveryFilter(filterType, btnElement) {
    // 1. Reset all buttons to inactive state
    document.querySelectorAll('.discovery-filter-btn').forEach(btn => {
        // Remove active styles
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-accent-orange', 'to-orange-500', 'text-white', 'shadow-lg');
        // Add inactive styles
        btn.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-100');

        // Reset icon colors (if they have specific color classes in HTML)
        const iconSpan = btn.querySelector('span');
        if (iconSpan) {
            // Restore default colors based on filter type
            if (btn.dataset.filter === 'visa_free') iconSpan.className = 'text-blue-500';
            if (btn.dataset.filter === 'under_5k') iconSpan.className = 'text-green-500';
            if (btn.dataset.filter === 'summer') iconSpan.className = 'text-yellow-500';
        }
    });

    // 2. Apply active styles to clicked button
    btnElement.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-100');
    btnElement.classList.add('active', 'bg-gradient-to-r', 'from-accent-orange', 'to-orange-500', 'text-white', 'shadow-lg');

    // Force icon colors to white when active
    const activeSpan = btnElement.querySelector('span');
    if (activeSpan) activeSpan.className = 'text-white';

    await loadDiscoveryFull(filterType === 'all' ? null : filterType);
}

/**
 * Setup Discovery Filter Listeners
 */
function setupDiscoveryListeners() {
    // Scope to discovery screen ONLY to avoid catching map pills
    const pills = document.querySelectorAll('#screen-discovery .filter-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            const filterType = e.currentTarget.dataset.filter;
            requestDiscoveryFilter(filterType, e.currentTarget);
        });
    });
}

/**
 * Handle Discovery Filter Request
 */
function requestDiscoveryFilter(filterType, btn) {
    // 1. Update UI (Active State)
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');

    // 2. Play subtle animation/feedback
    // (CSS transition handles size/color, we just ensure class is set)

    // 3. Load Data
    console.log(`🔍 Applying Discovery Filter: ${filterType}`);
    loadDiscoveryFull(filterType);
}

function renderDiscoveryFull(data, activeFilter) {
    if (!data) return;

    // Get all section containers
    const dealSection = document.getElementById('deal-of-day-section');
    const storiesSection = document.getElementById('viral-stories-section');
    const escapesSection = document.getElementById('budget-escapes-section');
    const gemsSection = document.getElementById('visa-free-gems-section');
    const dynamicContent = document.getElementById('discovery-dynamic-content');

    // Add fade-in animation class
    const contentWrapper = document.querySelector('#screen-discovery .px-4.py-4');
    if (contentWrapper) {
        contentWrapper.classList.add('animate-fade-in');
        setTimeout(() => contentWrapper.classList.remove('animate-fade-in'), 300);
    }

    // ============================================
    // MODE: ALL DEALS (Default - Show Everything)
    // ============================================
    if (!activeFilter || activeFilter === 'all') {
        dealSection?.classList.remove('hidden');
        storiesSection?.classList.remove('hidden');
        escapesSection?.classList.remove('hidden');
        gemsSection?.classList.remove('hidden');
        document.getElementById('vizesiz-section')?.classList.add('hidden');
        document.getElementById('budget-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        renderDealOfDay(data.deal_of_the_day);
        renderViralStories(data.viral_stories);
        renderPaxSuggestions();
        renderBudgetEscapes(data.budget_escapes, null);
        renderVisaFreeGems(data.visa_free_gems, null);
    }
    // ============================================
    // MODE: VİZESİZ — Dedicated visa-free section
    // ============================================
    else if (activeFilter === 'vizesiz' || activeFilter === 'visa_free') {
        dealSection?.classList.add('hidden');
        storiesSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');
        document.getElementById('budget-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        const vizesizSection = document.getElementById('vizesiz-section');
        vizesizSection?.classList.remove('hidden');
        vizesizSection?.classList.add('filter-fade-in');
        setTimeout(() => vizesizSection?.classList.remove('filter-fade-in'), 500);

        renderVizesizSection(data.vizesiz_routes || []);
    }
    // ============================================
    // MODE: BÜTÇE DOSTU — Dedicated budget section
    // ============================================
    else if (activeFilter === 'under_5k' || activeFilter === 'bütçe-dostu') {
        dealSection?.classList.add('hidden');
        storiesSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');
        document.getElementById('vizesiz-section')?.classList.add('hidden');
        if (dynamicContent) dynamicContent.innerHTML = '';

        const budgetSection = document.getElementById('budget-section');
        budgetSection?.classList.remove('hidden');
        budgetSection?.classList.add('filter-fade-in');
        setTimeout(() => budgetSection?.classList.remove('filter-fade-in'), 500);

        renderBudgetFriendlySection(data.budget_friendly_routes || []);
    }
    // ============================================
    // MODE: SUMMER (Placeholder)
    // ============================================
    else if (activeFilter === 'summer') {
        dealSection?.classList.add('hidden');
        storiesSection?.classList.add('hidden');
        escapesSection?.classList.add('hidden');
        gemsSection?.classList.add('hidden');

        if (dynamicContent) {
            dynamicContent.innerHTML = renderEmptyState('summer');
        }
    }

    lucide?.createIcons();
}

// ============================================
// HELPER RENDER FUNCTIONS
// ============================================

function renderDealOfDay(deal) {
    const dealCard = document.getElementById('deal-of-day-card');
    if (!dealCard || !deal) return;

    // Support both old schema (title/discounted_price) and new hero schema (city_name/price)
    const title        = deal.title || deal.city_name || '—';
    const priceDisplay = deal.discounted_price || deal.price || 0;
    const nights       = deal.nights || 3;
    const imgSrc       = deal.image_url || deal.destination_image_url || '';

    const liveBadge     = deal.is_live
        ? '<span class="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse z-20">🔴 CANLI</span>'
        : '';
    const visaBadge     = (deal.is_visa_free === true || deal.visa_free === true)
        ? '<span class="deal-visa-badge">Vizesiz ✓</span>'
        : '';
    const discountBadge = deal.discount_rate
        ? `<div class="deal-card-badge">%${deal.discount_rate} İNDİRİM</div>`
        : '';
    const priceStrike   = deal.original_price
        ? `<p class="text-white/50 text-xs line-through mb-1">${formatPrice(deal.original_price, deal.currency)}</p>`
        : '';
    const airlineRow    = deal.airline
        ? `<p class="text-sm text-white/80 mb-3 flex items-center gap-1">✈️ ${deal.airline} • ${deal.route || ''}</p>`
        : '';

    dealCard.innerHTML = `
        <div class="deal-card-wide relative" style="aspect-ratio:16/10">
            ${liveBadge}
            <img src="${imgSrc}" alt="${title}" class="w-full h-full object-cover">
            <div class="deal-card-overlay-gradient"></div>
            ${visaBadge}
            ${discountBadge}
            <div class="deal-card-content">
                <h3 class="text-xl font-bold text-white mb-1">${title}</h3>
                ${airlineRow}
                <div class="deal-nights-row">🌙 ${nights} Gece &nbsp;•&nbsp; ☀️ ${nights + 1} Gün</div>
                <div class="flex items-center justify-between">
                    <div>
                        ${priceStrike}
                        <div class="deal-price-pill">${formatPrice(priceDisplay, deal.currency)}</div>
                    </div>
                    <button class="btn-book-now">Rezervasyon ➝</button>
                </div>
            </div>
        </div>
    `;
}

function formatViewCount(n) {
    if (!n) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
}

function renderViralStories(stories) {
    const container = document.getElementById('viral-stories');
    if (!container) return;

    if (stories?.length > 0) {
        container.innerHTML = stories.map(s => {
            const count = formatViewCount(s.view_count);
            const countBadge = count ? `<span class="story-count-badge">${count}</span>` : '';
            return `
            <div class="story-wrapper cursor-pointer transform hover:scale-105 transition-transform" onclick="navigate('map'); loadMapPins('all')">
                <div class="story-circle ${s.is_viral ? 'ring-2 ring-accent-orange' : ''}">
                    <img src="${s.cover_image_url}" alt="${s.location_name}" class="w-full h-full object-cover">
                </div>
                ${countBadge}
                <span class="story-circle-label">${s.location_name}</span>
            </div>
        `}).join('');
    } else {
        container.innerHTML = '<p class="text-sm text-slate-400">Henüz viral hikaye yok</p>';
    }
}

// ─── PAX Öneriler — Vizesiz & Yaz ────────────────────────────────────────────
const _PAX_SUGGESTIONS = [
    { name: 'Zanzibar',      country: 'Tanzanya',      img_q: 'Zanzibar beach tropical' },
    { name: 'Phuket',        country: 'Tayland',       img_q: 'Phuket Thailand beach' },
    { name: 'Ksamil',        country: 'Arnavutluk',    img_q: 'Ksamil Albania turquoise sea' },
    { name: 'Budva',         country: 'Karadağ',       img_q: 'Budva Montenegro old town' },
    { name: 'Sharm El-Sheikh',country: 'Mısır',        img_q: 'Sharm El Sheikh Red Sea resort' },
    { name: 'Batum',         country: 'Gürcistan',     img_q: 'Batumi Georgia seafront' },
    { name: 'Belgrad',       country: 'Sırbistan',     img_q: 'Belgrade Serbia city nightlife' },
    { name: 'Saraybosna',    country: 'Bosna-Hersek',  img_q: 'Sarajevo Bosnia old bazaar' },
    { name: 'Kazablanka',    country: 'Fas',            img_q: 'Casablanca Morocco architecture' },
];

function renderPaxSuggestions() {
    const container = document.getElementById('pax-suggestions-scroll');
    if (!container) return;

    // Skeleton placeholder
    container.innerHTML = _PAX_SUGGESTIONS.map((_, i) =>
        `<div style="flex-shrink:0;width:140px;height:190px;border-radius:24px;background:#e8e8e0;snap-align:start;"></div>`
    ).join('');

    // Render cards and load images async
    _PAX_SUGGESTIONS.forEach((dest, i) => {
        const cardId = `pax-sug-card-${i}`;
        const card = document.createElement('div');
        card.id = cardId;
        card.onclick = () => openAiPlanWithCity(dest.name);
        card.style.cssText = `
            flex-shrink:0; width:140px; height:190px; border-radius:24px;
            overflow:hidden; position:relative; cursor:pointer;
            scroll-snap-align:start; background:#c8d4b0;
            font-family:'Plus Jakarta Sans',sans-serif;
            box-shadow:0 2px 12px rgba(0,0,0,0.10);
        `;
        card.innerHTML = `
            <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.08) 55%,transparent 100%);z-index:1;"></div>
            <!-- Vizesiz badge -->
            <div style="position:absolute;top:10px;left:10px;z-index:2;background:#A3C14A;color:#fff;
                        font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;
                        display:flex;align-items:center;gap:3px;letter-spacing:0.3px;">
                🛂 Vizesiz
            </div>
            <!-- Text -->
            <div style="position:absolute;bottom:0;left:0;right:0;z-index:2;padding:12px;">
                <div style="color:#fff;font-size:14px;font-weight:800;line-height:1.2;">${_escapeHtml(dest.name)}</div>
                <div style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:500;margin-top:2px;">${_escapeHtml(dest.country)}</div>
            </div>
        `;

        // Replace skeleton slot
        const slots = container.children;
        if (slots[i]) container.replaceChild(card, slots[i]);
        else container.appendChild(card);

        // Async image load
        _fetchCityImg(dest.img_q, 400).then(url => {
            if (!url) return;
            card.style.backgroundImage = `url(${url})`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
        });
    });
}
function openAiPlanWithCity(cityName) {
    // 1. Open modal
    const modal = document.getElementById('modal-ai-itinerary');
    if (!modal) return;
    modal.classList.remove('hidden');
    // 2. Pre-fill city
    const cityInput = document.getElementById('ai-city-input');
    if (cityInput) {
        cityInput.value = cityName;
        // Clear previous result so user sees fresh state
        const resultEl = document.getElementById('ai-itinerary-result');
        if (resultEl) resultEl.innerHTML = '';
    }
    // 3. Auto-trigger plan generation
    if (typeof fetchAiItinerary === 'function') fetchAiItinerary();
}
window.openAiPlanWithCity   = openAiPlanWithCity;
window.renderPaxSuggestions = renderPaxSuggestions;
// ─────────────────────────────────────────────────────────────────────────────

function renderBudgetEscapes(escapes, activeFilter) {
    const container = document.getElementById('budget-escapes');
    if (!container) return;

    if (escapes?.length > 0) {
        container.innerHTML = escapes.map((e, i) => renderEscapeCard(e, activeFilter, i)).join('');
    } else {
        container.innerHTML = '<p class="text-sm text-slate-500 p-4">Bu filtreye uygun kaçamak bulunamadı.</p>';
    }
}

function renderVisaFreeGems(gems, activeFilter) {
    const container = document.getElementById('visa-free-gems');
    if (!container) return;

    if (gems?.length > 0) {
        container.innerHTML = gems.map(g => `
            <div class="visa-gem-row flex items-center p-3 bg-white rounded-xl shadow-sm border border-slate-50 cursor-pointer hover:border-slate-200 transition-colors">
                <div class="text-2xl mr-3 bg-slate-50 w-10 h-10 flex items-center justify-center rounded-lg">${g.flag_emoji}</div>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <p class="font-bold text-slate-800">${g.city}, ${g.country}</p>
                        ${activeFilter === 'visa_free' ? '<i data-lucide="check-circle-2" class="w-3 h-3 text-green-500"></i>' : ''}
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">• ${g.nights} Gece • ${g.flight_duration}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-slate-900">${formatPrice(g.price, g.currency)}</p>
                    <span class="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">${g.visa_status}</span>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-sm text-slate-500 p-4">Sonuç bulunamadı.</p>';
    }
}

/**
 * Fetches a city image from the backend image service and sets it on an img element.
 * Used as the onerror fallback for escape cards.
 */
async function fetchAndSetImage(imgEl, city, w) {
    try {
        const res = await fetch(`${API_BASE}/image/city?q=${encodeURIComponent(city)}&w=${w}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.url) {
            imgEl.onerror = null; // prevent recursive error
            imgEl.src = data.url;
        }
    } catch (_) { /* silent */ }
}

// ============================================================
//  VİZESİZ SECTION — dedicated card design
// ============================================================

/**
 * Renders the full vizesiz section into #vizesiz-cards.
 */
function renderVizesizSection(routes) {
    const container = document.getElementById('vizesiz-cards');
    if (!container) return;

    if (!routes || routes.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-10 text-center">
                <span class="text-4xl mb-3">🛂</span>
                <p class="text-sm font-medium text-slate-600">Vizesiz rota bulunamadı.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = routes.map((r, i) => renderVizesizCard(r, i)).join('');
    lucide?.createIcons();
}

/**
 * Single full-width vizesiz card.
 * Design: image bg, "Vizesiz ✓" badge top-left, city name bold,
 *         nights + flight info row, price bottom-right.
 */
function renderVizesizCard(route, index = 0) {
    const city       = route.city       || '';
    const country    = route.country    || '';
    const nights     = route.nights     || 3;
    const flight     = route.flight_duration || '';
    const price      = route.price      || 0;
    const currency   = route.currency   || 'TRY';
    const imageUrl   = route.image_url  || '';
    const citySlug   = city.split(',')[0].trim().toLowerCase();
    const deepLink   = route.affiliate_url || '#';

    return `
        <div class="vz-card filter-fade-in" style="animation-delay:${index * 80}ms"
             onclick="openVizesizRoute('${deepLink.replace(/'/g, "\\'")}', '${city.replace(/'/g, "\\'")}')">
            <div class="vz-card-img">
                <img src="${imageUrl}" alt="${city}"
                     onerror="fetchAndSetImage(this,'${citySlug}',600)">
                <div class="vz-img-overlay"></div>
                <span class="vz-badge">Vizesiz ✓</span>
                <div class="vz-city-block">
                    <h3 class="vz-city-name">${city}</h3>
                    <div class="vz-meta-row">
                        <span>🌙 ${nights} Gece</span>
                        ${flight ? `<span>✈️ ${flight}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="vz-card-footer">
                <div class="vz-footer-left">
                    <span class="vz-country-tag">${country}</span>
                </div>
                <div class="vz-footer-right">
                    <span class="vz-price-label">Başlayan fiyatlarla</span>
                    <span class="vz-price">${formatPrice(price, currency)}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Handles vizesiz card click — opens affiliate/booking link.
 * Appends affiliate marker if configured.
 */
function openVizesizRoute(deepLink, cityName) {
    if (!deepLink || deepLink === '#') {
        // Fallback: open new plan modal with city pre-filled
        const modal = document.getElementById('modal-new-plan');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                const destInput = document.getElementById('destination-input');
                if (destInput && cityName) {
                    destInput.value = cityName;
                    destInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 150);
        }
        return;
    }
    window.open(deepLink, '_blank', 'noopener,noreferrer');
}

// ============================================================
// BÜTÇE DOSTU — Budget-Friendly section rendering + lazy load
// ============================================================

let _allBudgetRoutes = [];
let _budgetRenderedCount = 0;
const BUDGET_PAGE_SIZE = 4;

function renderBudgetFriendlySection(routes) {
    const container = document.getElementById('budget-cards');
    if (!container) return;

    _allBudgetRoutes = routes;
    _budgetRenderedCount = 0;

    // Remove stale sentinel from previous render
    document.getElementById('budget-sentinel')?.remove();

    if (!routes || routes.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-10 text-center">
                <span class="text-4xl mb-3">💰</span>
                <p class="text-sm font-medium text-slate-600">Bütçe dostu rota bulunamadı.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    _appendBudgetCards(container);
    _setupBudgetLazyLoad(container);
}

function _appendBudgetCards(container) {
    const nextBatch = _allBudgetRoutes.slice(_budgetRenderedCount, _budgetRenderedCount + BUDGET_PAGE_SIZE);
    if (nextBatch.length === 0) return;

    nextBatch.forEach((route, i) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderBudgetCard(route, _budgetRenderedCount + i);
        const card = wrapper.firstElementChild;
        if (card) container.appendChild(card);
    });
    _budgetRenderedCount += nextBatch.length;
}

function _setupBudgetLazyLoad(container) {
    if (_budgetRenderedCount >= _allBudgetRoutes.length) return;

    const sentinel = document.createElement('div');
    sentinel.id = 'budget-sentinel';
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

/** "Tümünü Gör" button — renders all remaining cards immediately */
function showAllBudgetRoutes() {
    const container = document.getElementById('budget-cards');
    if (!container || _allBudgetRoutes.length === 0) return;
    document.getElementById('budget-sentinel')?.remove();
    while (_budgetRenderedCount < _allBudgetRoutes.length) {
        _appendBudgetCards(container);
    }
}

/**
 * Single full-width budget-friendly card.
 * Reuses vz-card layout; badge is coloured by type (discount = orange, seats = red).
 */
function renderBudgetCard(route, index = 0) {
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
             onclick="openBudgetRoute('${deepLink.replace(/'/g, "\\'")}', '${city.replace(/'/g, "\\'")}')">
            <div class="vz-card-img">
                <img src="${imageUrl}" alt="${city}"
                     onerror="fetchAndSetImage(this,'${citySlug}',600)">
                <div class="vz-img-overlay"></div>
                ${badgeHtml}
                <div class="vz-city-block">
                    <h3 class="vz-city-name">${city}</h3>
                    <div class="vz-meta-row">
                        <span>🌙 ${nights} Gece</span>
                        ${flight ? `<span>✈️ ${flight}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="vz-card-footer">
                <div class="vz-footer-left">
                    <span class="vz-country-tag">${country}</span>
                </div>
                <div class="vz-footer-right">
                    <span class="vz-price-label">Başlayan fiyatlarla</span>
                    <span class="vz-price">${formatPrice(price, currency)}</span>
                </div>
            </div>
        </div>
    `;
}

function openBudgetRoute(deepLink, cityName) {
    if (!deepLink || deepLink === '#') {
        const modal = document.getElementById('modal-new-plan');
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                const destInput = document.getElementById('destination-input');
                if (destInput && cityName) {
                    destInput.value = cityName;
                    destInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 150);
        }
        return;
    }
    window.open(deepLink, '_blank', 'noopener,noreferrer');
}

function renderEscapeCard(e, activeFilter, index = 0) {
    // Status badge: visa-free > low seats > discount > none
    let statusBadge = '';
    if (e.is_visa_free || activeFilter === 'visa_free') {
        statusBadge = '<span class="escape-status-visa">Vizesiz ✓</span>';
    } else if (e.seats_left && e.seats_left <= 3) {
        statusBadge = `<span class="escape-status-seats">Son ${e.seats_left} Koltuk 🔥</span>`;
    } else if (e.discount_badge) {
        statusBadge = `<span class="escape-status-discount">%${e.discount_badge} İndirim</span>`;
    }

    // Duration row (flight + nights)
    const nights = e.nights || 3;
    const durationText = e.flight_duration
        ? `✈️ ${e.flight_duration} &nbsp;·&nbsp; 🌙 ${nights} Gece`
        : `🌙 ${nights} Gece`;

    const cityName = e.city || '';
    const imgSrc   = e.image_url || '';

    return `
        <div class="escape-card escape-stagger" style="animation-delay:${index * 80}ms">
            <div class="escape-card-img">
                <img src="${imgSrc}" alt="${cityName}"
                     onerror="fetchAndSetImage(this,'${cityName.replace(/'/g,"\\'")}',400)">
                <span class="escape-card-city">${cityName}</span>
                <span class="escape-card-duration">${durationText}</span>
            </div>
            <div class="escape-card-bottom">
                <div class="escape-price-box">
                    <span class="escape-price-label">Başlayan fiyatlarla</span>
                    <span class="escape-price-value">${formatPrice(e.starting_price, e.currency)}</span>
                </div>
                ${statusBadge}
            </div>
        </div>
    `;
}

function renderGemCard(g, activeFilter) {
    return `
        <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md transition-all">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-2xl">${g.flag_emoji}</span>
                <div>
                    <p class="font-bold text-slate-800 text-sm">${g.city}</p>
                    <p class="text-xs text-slate-500">${g.country}</p>
                </div>
            </div>
            <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">${g.nights} Gece</span>
                <span class="font-bold text-green-600">${formatPrice(g.price, g.currency)}</span>
            </div>
            ${activeFilter === 'under_5k' ? '<span class="inline-block mt-2 text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full">💰 Bütçe Dostu</span>' : ''}
        </div>
    `;
}

function renderEmptyState(filterType) {
    const messages = {
        'under_5k': {
            title: 'Kral buralar şu an çok pahalı...',
            subtitle: 'Başka bir filtre dene, senin için kazımaya devam ediyoruz!',
            icon: '💸'
        },
        'visa_free': {
            title: 'Vizesiz rota bulunamadı',
            subtitle: 'Yeni rotalar ekleniyor...',
            icon: '🛂'
        },
        'summer': {
            title: 'Yaz fırsatları yakında!',
            subtitle: 'Haziran\'da harika fiyatlar seni bekliyor.',
            icon: '🏖️'
        }
    };

    const msg = messages[filterType] || messages['under_5k'];

    return `
        <div class="flex flex-col items-center justify-center py-12 text-center animate-fade-in">
            <span class="text-5xl mb-4">${msg.icon}</span>
            <h3 class="text-lg font-bold text-slate-700 mb-2">${msg.title}</h3>
            <p class="text-sm text-slate-500 max-w-[250px] mx-auto">${msg.subtitle}</p>
            <button onclick="requestDiscoveryFilter('all', document.querySelector('.filter-pill[data-filter=all]'))" 
                    class="mt-6 px-6 py-2 bg-accent-orange text-white rounded-full text-sm font-medium hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200">
                Tüm Fırsatları Gör
            </button>
        </div>
    `;
}

// ============================================
// PLANNER SCREEN
// ============================================

async function loadWishlists() {
    state.loading.wishlists = true;

    // Show skeletons in new containers
    const upcoming = document.getElementById('planner-upcoming');
    const drafts = document.getElementById('planner-drafts');

    if (upcoming) upcoming.innerHTML = '<div class="trip-card-skeleton"></div>'.repeat(1);
    if (drafts) drafts.innerHTML = ''; // Clear drafts initially

    try {
        const wishlists = await api.getWishlists();
        state.wishlists = wishlists || [];
        renderWishlists();
        updateWishlistBadge(); // Update profile badge counter
    } catch (error) {
        console.error('Planlar yüklenirken hata:', error);
        if (upcoming) upcoming.innerHTML = '<p class="text-center text-red-400 text-sm py-4">Planlar yüklenemedi.</p>';
    } finally {
        state.loading.wishlists = false;
    }
}

function updateWishlistBadge() {
    // Update inline counter in My Wishlist section
    const inlineCounter = document.getElementById('wishlist-inline-count');
    if (inlineCounter) {
        const count = state.wishlists?.length || 0;
        inlineCounter.textContent = `${count} plan${count !== 1 ? 's' : ''}`;
    }

    // Also render the profile wishlist cards
    renderProfileWishlistCards();
}

function renderProfileWishlistCards() {
    const container = document.getElementById('profile-wishlist-cards');
    if (!container) return;

    const wishlists = state.wishlists || [];

    if (wishlists.length === 0) {
        container.innerHTML = `
            <div class="min-w-[200px] flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl text-center">
                <span class="text-3xl mb-2">✨</span>
                <p class="text-sm text-slate-500">Henüz plan yok</p>
                <button onclick="navigate('planner'); document.getElementById('fab-new-plan')?.click()" 
                        class="mt-3 px-4 py-1.5 bg-accent-orange text-white text-xs rounded-full font-medium">
                    İlk Planını Oluştur
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = wishlists.map(w => {
        const origin = w.origin || 'IST';
        const destination = w.destination || w.trip_name?.split(' ')[0] || 'XXX';
        const targetPrice = w.target_price || w.budget || 0;
        const currentPrice = w.current_price || w.current_best_price || null;
        const isPriceAlert = currentPrice && currentPrice < targetPrice;

        return `
            <div class="wishlist-premium-card ${isPriceAlert ? 'price-alert' : ''}" 
                 onclick="navigate('planner'); openPlannerDetail('${w._id || w.id}')">
                <span class="wishlist-card-badge tracking">Fiyat Takibinde</span>
                <div class="wishlist-card-route">
                    <span>${origin}</span>
                    <span class="wishlist-card-route-arrow">→</span>
                    <span>${destination}</span>
                </div>
                <p class="text-xs text-white/60 mt-1">${w.trip_name || 'Unnamed Trip'}</p>
                <div class="wishlist-card-price">
                    <span class="wishlist-card-target">Hedef: ${formatPrice(targetPrice, w.currency || 'TRY')}</span>
                </div>
                ${currentPrice ? `
                    <div class="wishlist-card-price mt-1">
                        <span class="wishlist-card-current">${formatPrice(currentPrice, w.currency || 'TRY')}</span>
                        ${isPriceAlert ? '<span class="text-xs text-green-400 ml-2">🔔 Fırsat!</span>' : ''}
                    </div>
                ` : ''}
                <p class="wishlist-card-meta">${w.date_type === 'flexible' ? '📅 Esnek Tarih' : '📅 Sabit Tarih'}</p>
            </div>
        `;
    }).join('');
}

function renderWishlists() {
    const upcomingContainer = document.getElementById('planner-upcoming');
    const draftsContainer = document.getElementById('planner-drafts');
    const wishlists = state.wishlists || [];

    // Confirmed plans → Upcoming Trips; everything else → Drafts & Ideas
    const confirmedTrips = wishlists.filter(w => w.status === 'confirmed');
    const draftTrips = wishlists.filter(w => w.status !== 'confirmed');

    // 1. Render Upcoming Trips (Confirmed — wide horizontal card with Review button)
    if (upcomingContainer) {
        if (confirmedTrips.length > 0) {
            upcomingContainer.innerHTML = confirmedTrips.map(w => createConfirmedTripCard(w)).join('');

            // Review button → opens detail in read-only mode (no confirm bar)
            upcomingContainer.querySelectorAll('.upcoming-trip-review-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openPlannerDetail(btn.dataset.id, true);
                });
            });
        } else {
            // Empty state for upcoming
            upcomingContainer.innerHTML = `
                <div class="text-center py-8 bg-[#ffffff]/60 rounded-[24px] border border-dashed border-[#e8e6e1]">
                    <div class="w-12 h-12 rounded-full bg-[#9CAF88]/10 flex items-center justify-center mx-auto mb-3">
                        <i data-lucide="calendar" class="w-6 h-6 text-[#9CAF88]"></i>
                    </div>
                    <p class="text-sm text-[#1a1a1a] font-serif font-medium">Yaklaşan seyahat yok</p>
                    <p class="text-xs text-[#9ca3af]">Bir sonraki maceranda planlamaya başla.</p>
                </div>
            `;
        }
    }

    // 2. Render Drafts & Ideas (Grid Layout) + Create Button
    if (draftsContainer) {
        // Create New Plan Button (Vertical/Grid Card) - UPDATED DESIGN
        // Using specific Sage color #9CAF88 for border and icon
        const createBtnHTML = `
            <button id="btn-create-new-plan" class="w-full h-full min-h-[200px] bg-white border-2 border-dashed border-[#9CAF88]/40 rounded-[24px] flex flex-col items-center justify-center gap-4 text-[#9CAF88] hover:bg-[#9CAF88]/5 hover:border-[#9CAF88] transition-all group shadow-sm">
                <div class="w-14 h-14 rounded-full bg-[#9CAF88]/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                    <i data-lucide="plus" class="w-7 h-7 text-[#9CAF88]"></i>
                </div>
                <span class="font-bold text-sm text-[#1a1a1a] font-serif tracking-wide">Yeni Plan Oluştur</span>
            </button>
        `;

        const draftsHTML = draftTrips.map(w => createDraftCard(w)).join('');
        draftsContainer.innerHTML = draftsHTML + createBtnHTML;

        // Add listeners for drafts
        draftsContainer.querySelectorAll('.trip-card-draft').forEach(card => {
            card.addEventListener('click', () => openPlannerDetail(card.dataset.id));
        });

        // Add Listener to New Plan Button
        const btnNew = document.getElementById('btn-create-new-plan');
        if (btnNew) {
            btnNew.addEventListener('click', () => {
                const modal = document.getElementById('modal-new-plan');
                if (modal) {
                    modal.classList.remove('hidden');
                    setTimeout(() => initDestinationAutocomplete(), 100);
                }
            });
        }

        // Async-load atmospheric city images for draft cards
        loadDraftCardImages();
    }

    lucide?.createIcons();
}

/**
 * Horizontal Trip Card (Image Left, Info Right) for Upcoming Trips
 */
function createHorizontalTripCard(w) {
    const id = w._id || w.id;
    const isLoading = w.status === 'processing' || (w.status === 'tracking' && !w.current_price);

    // Image Logic
    let img = w.image_url || null;
    if (!img && w.itinerary_items?.length > 0) {
        const hotel = w.itinerary_items.find(i => i.item_type === 'hotel');
        if (hotel?.hotel_details?.image_url) img = hotel.hotel_details.image_url;
    }
    const imageHtml = img
        ? `<img src="${img}" alt="${w.trip_name}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110">`
        : `<div class="w-full h-full bg-[#F3F1EB] flex items-center justify-center text-2xl">🌍</div>`;

    // Price Logic
    const priceDisplay = isLoading
        ? '<span class="text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-1 rounded-full animate-pulse">FIYATLAR TARANIYOR...</span>'
        : `<span class="text-lg font-bold text-[#1a1a1a]">${formatPrice(w.current_price || w.target_price, w.currency)}</span>`;

    const statusBadge = isLoading
        ? `<span class="absolute top-2 left-2 bg-orange-100 text-orange-600 text-[9px] font-bold px-2 py-0.5 rounded-full z-10 flex items-center gap-1"><span class="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span> SCANNING</span>`
        : `<span class="absolute top-2 left-2 bg-[#f0fdf4] text-[#15803d] text-[9px] font-bold px-2 py-0.5 rounded-full z-10">READY TO BOOK</span>`;

    return `
        <div class="trip-card-horizontal group relative bg-white rounded-[24px] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50 flex gap-4 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300" data-id="${id}">
            <!-- Left: Image -->
            <div class="w-28 h-28 flex-shrink-0 rounded-2xl overflow-hidden relative">
                ${imageHtml}
                ${statusBadge}
            </div>

            <!-- Right: Content -->
            <div class="flex-1 flex flex-col justify-center py-1 pr-1">
                <h3 class="font-serif font-bold text-2xl text-[#1a1a1a] leading-tight mb-1">${w.trip_name}</h3>
                <div class="flex items-center gap-1.5 text-xs text-[#6b7280] mb-3">
                    <i data-lucide="calendar" class="w-3.5 h-3.5 text-[#9CAF88]"></i>
                    <span>${w.date_type === 'flexible' ? 'Esnek Tarih' : 'Kesin Tarih'}</span>
                </div>
                
                <div class="flex items-center justify-between mt-auto">
                    <div class="flex flex-col">
                        <span class="text-[10px] text-[#9ca3af] uppercase tracking-wide">Tahmini</span>
                        ${priceDisplay}
                    </div>
                    <button class="w-8 h-8 rounded-full bg-[#fcfbf7] border border-[#e8e6e1] flex items-center justify-center text-[#1a1a1a] group-hover:bg-[#a3c14a] group-hover:text-white group-hover:border-transparent transition-all">
                        <i data-lucide="arrow-right" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Confirmed Trip Card — wide horizontal card for Upcoming Trips section
 */
function createConfirmedTripCard(w) {
    const id = w._id || w.id;
    const title = w.trip_name || w.destination || 'Trip';
    const dest = w.destination || '';
    const origin = w.origin || 'IST';

    // City image
    const CITY_IMAGES = {
        'paris': 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=300&q=80',
        'london': 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=300&q=80',
        'rome': 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=300&q=80',
        'barcelona': 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=300&q=80',
        'amsterdam': 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=300&q=80',
        'dubai': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=300&q=80',
        'istanbul': 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=300&q=80',
    };
    const destKey = dest.toLowerCase();
    const imgUrl = w.image_url ||
        Object.entries(CITY_IMAGES).find(([k]) => destKey.includes(k))?.[1] ||
        `https://images.unsplash.com/photo-1488085061387-422e29b40080?w=300&q=80`;

    // Budget
    const budget = w.target_budget || w.budget || null;
    const budgetDisplay = budget
        ? `₺${Number(budget).toLocaleString('tr-TR')}`
        : '—';

    // Dates
    const dateStr = w.start_date
        ? new Date(w.start_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Tarih belirlenmedi';

    return `
        <div class="upcoming-trip-card">
            <img src="${imgUrl}" alt="${dest}" class="upcoming-trip-img" onerror="this.style.background='#f0ede8';this.src=''">
            <div class="upcoming-trip-body">
                <div>
                    <div class="upcoming-trip-route">${origin} ✈ ${dest}</div>
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
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Draft Card (Vertical/Grid) for Drafts & Ideas — atmospheric city image background
 */
function createDraftCard(w) {
    const id    = w._id || w.id;
    const dest  = w.destination || '';
    const origin = w.origin || 'IST';
    const title = w.trip_name || dest || 'Yeni Plan';

    // Status badge
    const STATUS_LABELS = {
        tracking:   { label: 'Takipte',   color: '#A3C14A' },
        processing: { label: 'Taranıyor', color: '#f59e0b' },
        draft:      { label: 'Taslak',    color: '#9ca3af' },
    };
    const st = STATUS_LABELS[w.status] || { label: 'Taslak', color: '#9ca3af' };

    // Budget
    const budget = w.target_budget || w.budget || null;
    const budgetDisplay = budget
        ? formatPrice(budget, w.currency || 'TRY')
        : null;

    // city key for image lookup — strip ", Country" suffix (e.g. "Bali, Endonezya" → "bali")
    const cityKey = (dest.split(',')[0].trim().toLowerCase()) || 'default';

    return `
        <div class="trip-card-draft draft-card-atmo" data-id="${id}" data-city="${cityKey}">
            <div class="draft-card-top">
                <span class="draft-status-pill" style="background:${st.color}20;color:${st.color}">${st.label}</span>
            </div>
            <div class="draft-card-bottom">
                <div class="draft-card-route">${origin} ✈ ${dest || '?'}</div>
                <h3 class="draft-card-title">${title}</h3>
                ${budgetDisplay ? `<div class="draft-card-budget">${budgetDisplay}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Async-loads city background images for all .draft-card-atmo cards.
 * Called after renderWishlists() inserts the cards into the DOM.
 */
async function loadDraftCardImages() {
    const cards = document.querySelectorAll('.draft-card-atmo[data-city]');
    const fetched = {};

    for (const card of cards) {
        const city = card.dataset.city;
        if (!city || city === 'default') continue;

        try {
            if (!fetched[city]) {
                const res = await fetch(`${API_BASE}/image/city?q=${encodeURIComponent(city)}&w=400`);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.url) fetched[city] = data.url;
                }
            }
            if (fetched[city]) {
                card.style.backgroundImage =
                    `linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.72) 100%), url('${fetched[city]}')`;
                card.style.backgroundSize     = 'cover';
                card.style.backgroundPosition = 'center';
            }
        } catch (_) { /* keep gradient fallback */ }
    }
}
/**
 * Skeleton Loading Kartı - Fiyatlar taranırken gösterilir
 */
function createSkeletonCard(destination = 'Yükleniyor...') {
    return `
        <div class="trip-card skeleton-card loading-shimmer" data-id="skeleton">
            <div class="trip-card-images single">
                <div class="w-full h-full bg-slate-700 animate-pulse rounded-lg"></div>
            </div>
            <div class="trip-card-content">
                <span class="trip-card-status loading">🔍 Fiyatlar Taranıyor...</span>
                <h3 class="trip-card-title">${destination}</h3>
                <p class="trip-card-date">📅 Tarih hesaplanıyor...</p>
                <p class="trip-card-price">
                    <span class="animate-pulse text-orange-400">⏳ Güncelleniyor...</span>
                </p>
            </div>
        </div>
    `;
}

/**
 * Fiyat Polling Mekanizması
 * Backend scraper'ı tamamlayana kadar 5 sn aralıklarla kontrol eder
 */
let pollingIntervals = {};

function startPricePolling(wishlistId, maxAttempts = 12) {
    console.log(`🔄 Polling başlatıldı: ${wishlistId}`);

    let attempts = 0;

    pollingIntervals[wishlistId] = setInterval(async () => {
        attempts++;
        console.log(`📡 Polling attempt ${attempts}/${maxAttempts} for ${wishlistId}`);

        try {
            // Belirli wishlist'i getir
            const data = await api.getPlanner(wishlistId);

            if (data) {
                // Fiyat geldi mi kontrol et
                const hasPrice = data.current_price && data.current_price > 0;
                const isProcessing = data.notes?.includes('taranıyor') || !hasPrice;

                if (hasPrice || !isProcessing || attempts >= maxAttempts) {
                    // Polling'i durdur
                    clearInterval(pollingIntervals[wishlistId]);
                    delete pollingIntervals[wishlistId];

                    // Listeyi yenile
                    await loadWishlists();

                    if (hasPrice) {
                        showToast(`✅ ${data.destination || 'Plan'} için fiyat bulundu: ${formatPrice(data.current_price, data.currency || 'TRY')}`, 'success');
                    } else {
                        console.log('⚠️ Fiyat bulunamadı veya max deneme aşıldı');
                    }
                }
            }
        } catch (error) {
            console.error('Polling hatası:', error);
        }

        // Max deneme aşıldıysa durdur
        if (attempts >= maxAttempts) {
            clearInterval(pollingIntervals[wishlistId]);
            delete pollingIntervals[wishlistId];
            console.log('⏹️ Polling durduruldu (max attempt)');
        }
    }, 5000); // 5 saniyede bir kontrol
}

function stopAllPolling() {
    Object.keys(pollingIntervals).forEach(id => {
        clearInterval(pollingIntervals[id]);
        delete pollingIntervals[id];
    });
    console.log('⏹️ Tüm polling işlemleri durduruldu');
}

// ============================================
// PLAN DETAIL STATE + MOCK TEMPLATES
// ============================================
let _pdData = null;          // PlanDetailsResponse from /plans/:id/details
let _pdHotelIndex = 0;       // currently selected hotel option (0-2)
let _pdAiItinerary = [];     // Gemini AI itinerary cache for current plan

// Paris demo mock — shown when plan has no trip_details yet
const _PD_PARIS_MOCK = {
    trip_type: 'bireysel', nights: 4,
    outbound_flight: {
        departure_code:'IST', arrival_code:'CDG',
        departure_city:'İstanbul Airport', arrival_city:'Charles de Gaulle',
        departure_time:'08:30', arrival_time:'11:00', duration:'3s 30dk', stops:0,
        airline:'TK', airline_logo_url:'https://content.airhex.com/content/logos/airlines_TK_35_35_t.png',
        price:4500, currency:'TRY', cabin_class:'economy'
    },
    return_flight: {
        departure_code:'CDG', arrival_code:'IST',
        departure_city:'Charles de Gaulle', arrival_city:'İstanbul Airport',
        departure_time:'15:00', arrival_time:'19:30', duration:'3s 30dk', stops:0,
        airline:'TK', airline_logo_url:'https://content.airhex.com/content/logos/airlines_TK_35_35_t.png',
        price:4500, currency:'TRY', cabin_class:'economy'
    },
    hotel_options:[
        {hotel_name:'Hotel Le Plume', stars:4, rating:8.7,
         image_url:'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&q=80',
         address:'Saint-Germain-des-Prés, Paris', price_per_night:1250, total_price:5000, currency:'TRY', nights:4},
        {hotel_name:'Hôtel de la Paix', stars:3, rating:7.9,
         image_url:'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&q=80',
         address:'Le Marais, Paris', price_per_night:900, total_price:3600, currency:'TRY', nights:4},
        {hotel_name:'Palais Royal Grand', stars:5, rating:9.2,
         image_url:'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80',
         address:'1er Arrondissement, Paris', price_per_night:2500, total_price:10000, currency:'TRY', nights:4},
    ],
    selected_hotel_index:0,
    ai_day_plans:[
        {day_label:'1. GÜN', title:'Hidden Montmartre Cafes',
         image_url:'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=300&q=70'},
        {day_label:'2. GÜN', title:'Le Marais Art Gallery Route',
         image_url:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300&q=70'},
        {day_label:'3. GÜN', title:'Seine River Cruise',
         image_url:'https://images.unsplash.com/photo-1431274172761-fca41d930114?w=300&q=70'},
        {day_label:'4. GÜN', title:'Eiffel Tower & Trocadéro',
         image_url:'https://images.unsplash.com/photo-1520939817895-060bdaf4fe1b?w=300&q=70'},
    ],
    budget_summary:{target_budget:17000, flight_cost:9000, hotel_cost:5000, total_cost:14000,
                    currency:'TRY', label:'tam-butce', label_text:'Tam Bütçene Göre',
                    label_icon:'✅', savings:3000, overage:null, usage_percent:82.4}
};

function _buildMockDetails(apiDetails) {
    // Merge real plan header with mock flight/hotel/ai data
    const mock = Object.assign({}, _PD_PARIS_MOCK);
    if (apiDetails) {
        mock.plan_id   = apiDetails.plan_id;
        mock.trip_name = apiDetails.trip_name;
        mock.origin    = apiDetails.origin    || mock.outbound_flight.departure_code;
        mock.destination = apiDetails.destination || mock.outbound_flight.arrival_code;
        mock.start_date  = apiDetails.start_date;
        mock.end_date    = apiDetails.end_date;
        // Patch departure code with real origin
        if (apiDetails.origin) {
            mock.outbound_flight = {...mock.outbound_flight, departure_code: apiDetails.origin};
            mock.return_flight   = {...mock.return_flight,   arrival_code:   apiDetails.origin};
        }
    }
    mock.scrape_status = 'mock';
    return mock;
}

// ============================================
// PLAN DETAIL - OPEN & RENDER
// ============================================

async function openPlannerDetail(wishlistId, readOnly = false) {
    currentPlanId = wishlistId;
    _pdHotelIndex = 0;
    _pdData = null;

    document.getElementById('screen-planner').classList.add('hidden');
    document.getElementById('screen-planner-detail').classList.remove('hidden');
    // Show combined action bar
    const actionBar = document.getElementById('pd-action-bar');
    if (actionBar) actionBar.style.display = '';

    // Hide confirm button if read-only (already confirmed plan)
    const confirmBtn = document.getElementById('pd-confirm-btn');
    if (confirmBtn) confirmBtn.style.display = readOnly ? 'none' : '';

    // Load rich detail from new endpoint
    const details = await api.getPlanDetails(wishlistId);

    // Use real data if available; otherwise inject frontend mock
    const hasRealData = details?.outbound_flight || (details?.hotel_options?.length > 0);
    const effectiveData = hasRealData ? details : _buildMockDetails(details);

    _pdData = effectiveData;
    renderPlannerDetail(effectiveData);

    // Budget widget
    if (hasRealData) {
        // Live budget calc from backend
        const budget = await api.getBudgetCalc(wishlistId, 0);
        if (budget) renderPdBudgetWidget(budget);
    } else {
        // Render from mock budget_summary directly
        renderPdBudgetWidget({
            total_cost:    effectiveData.budget_summary?.total_cost    || 0,
            target_budget: effectiveData.budget_summary?.target_budget || null,
            currency:      'TRY',
            label:         effectiveData.budget_summary?.label         || 'en-iyi-teklif',
            label_text:    effectiveData.budget_summary?.label_text    || 'En İyi Teklif',
            label_icon:    effectiveData.budget_summary?.label_icon    || '🎯',
            savings:       effectiveData.budget_summary?.savings       || null,
            overage:       null,
            usage_percent: effectiveData.budget_summary?.usage_percent || null,
        });
    }
}

function renderPlannerDetail(data) {
    // Header
    const origin = data.origin || 'IST';
    const dest   = data.destination || '???';
    document.getElementById('pd-route').textContent      = `${origin} ✈ ${dest}`;
    document.getElementById('pd-trip-name').textContent  = data.trip_name || `${dest} Trip`;
    document.getElementById('pd-dates').textContent      = formatDateRange(data.start_date, data.end_date);

    // Trip type pill
    const tripType = (data.trip_type || 'bireysel').toLowerCase();
    setPdTripType(tripType.includes('tur') ? 'tur' : 'bireysel');

    // Outbound flight
    document.getElementById('pd-outbound-card').innerHTML =
        data.outbound_flight ? buildFlightCardHtml(data.outbound_flight) : pdNoDataHtml('Gidiş uçuşu verisi bekleniyor');

    // Hotel
    const hotels = data.hotel_options || [];
    const selIdx = data.selected_hotel_index || 0;
    document.getElementById('pd-hotel-card').innerHTML =
        hotels.length ? buildHotelCardHtml(hotels[selIdx], data.nights || 0) : pdNoDataHtml('Konaklama verisi bekleniyor');
    renderHotelOptions(hotels, selIdx);

    // AI plans — async Gemini fetch (fallback to static templates)
    refreshAiPlans();

    // Return flight
    const retSection = document.getElementById('pd-return-section');
    if (data.return_flight) {
        retSection.style.display = '';
        document.getElementById('pd-return-card').innerHTML = buildFlightCardHtml(data.return_flight, true);
    } else {
        retSection.style.display = 'none';
    }

    lucide?.createIcons();
}

// Legacy fallback (old /planner/:id endpoint shape)
function renderPlannerDetailLegacy(data) {
    document.getElementById('pd-route').textContent     = `${data.origin || 'IST'} ✈ ${data.destination || '???'}`;
    document.getElementById('pd-trip-name').textContent = data.trip_name || 'Trip';
    document.getElementById('pd-dates').textContent     = formatDateRange(data.start_date, data.end_date);

    document.getElementById('pd-outbound-card').innerHTML = pdNoDataHtml('Uçuş verisi yükleniyor...');
    document.getElementById('pd-hotel-card').innerHTML    = pdNoDataHtml('Otel verisi yükleniyor...');
    document.getElementById('pd-return-section').style.display = 'none';
    document.getElementById('pd-ai-scroll').innerHTML    = pdNoDataHtml('AI önerileri yükleniyor...');
    lucide?.createIcons();
}

// ============================================
// PLAN DETAIL - CARD BUILDERS
// ============================================

function _parseFlightTime(t) {
    if (!t) return '--:--';
    if (t.includes('T')) return t.slice(11, 16); // ISO: "2024-10-14T08:30:00"
    if (t.length === 5) return t;                // Already "HH:MM"
    return t.slice(0, 5);                        // "08:30:00" → "08:30"
}

function buildFlightCardHtml(f, isReturn = false) {
    const depTime  = _parseFlightTime(f.departure_time);
    const arrTime  = _parseFlightTime(f.arrival_time);
    const depCode  = f.departure_code || '---';
    const arrCode  = f.arrival_code   || '---';
    const depCity  = f.departure_city || depCode;
    const arrCity  = f.arrival_city   || arrCode;
    const airline  = f.airline        || '';
    const duration = f.duration       || '';
    const stops    = f.stops > 0 ? `${f.stops} Aktarma` : 'Direkt';
    const logo     = f.airline_logo_url || `https://content.airhex.com/content/logos/airlines_${airline}_35_35_t.png`;
    const price    = formatPrice(f.price || 0, f.currency || 'TRY');
    const dotColor = isReturn ? '#60A5FA' : '#A3C14A';

    return `
    <div class="pd-flight-card">
        <div class="pd-flight-meta">
            <div class="pd-flight-airline">
                <img src="${logo}" class="pd-flight-logo" onerror="this.style.display='none'">
                <span class="pd-flight-airline-name">${airline}</span>
            </div>
            <span class="pd-flight-price">${price}</span>
        </div>
        <div class="pd-flight-route">
            <div class="pd-flight-port">
                <div class="pd-flight-time">${depTime}</div>
                <div class="pd-flight-code">${depCode}</div>
                <div class="pd-flight-city">${depCity}</div>
            </div>
            <div class="pd-flight-mid">
                <div class="pd-flight-duration">${duration}</div>
                <div class="pd-flight-arrow-row">
                    <div class="pd-flight-arrow-line"></div>
                    <span style="font-size:16px;color:#FF6B35">✈</span>
                    <div class="pd-flight-arrow-line"></div>
                </div>
                <div class="pd-flight-stops">${stops}</div>
            </div>
            <div class="pd-flight-port">
                <div class="pd-flight-time">${arrTime}</div>
                <div class="pd-flight-code">${arrCode}</div>
                <div class="pd-flight-city">${arrCity}</div>
            </div>
        </div>
    </div>`;
}

function buildHotelCardHtml(h, nights) {
    const img    = h.image_url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80';
    const name   = h.hotel_name || 'Otel';
    const addr   = h.address    || '';
    const stars  = h.stars      || 3;
    const starsHtml = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));

    return `
    <div class="pd-hotel-card">
        <img src="${img}" class="pd-hotel-image" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80'">
        <div class="pd-hotel-overlay">
            <div class="pd-hotel-stars" style="color:#F59E0B;font-size:13px">${starsHtml}</div>
            <div class="pd-hotel-name">${name}</div>
            ${addr ? `<div class="pd-hotel-address">${addr}</div>` : ''}
        </div>
        ${nights ? `<div class="pd-hotel-nights">${nights} Gece</div>` : ''}
    </div>`;
}

function renderHotelOptions(hotels, selectedIdx) {
    const container = document.getElementById('pd-hotel-options');
    if (!hotels.length) { container.innerHTML = ''; return; }

    container.innerHTML = hotels.map((h, i) => {
        const img   = h.image_url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60';
        const name  = h.hotel_name || 'Otel';
        const stars = '★'.repeat(h.stars || 3);
        const price = formatPrice(h.total_price || 0, h.currency || 'TRY');
        const sel   = i === selectedIdx ? 'selected' : '';

        return `
        <div class="pd-hotel-opt ${sel}" onclick="selectHotelOption(${i})">
            <img src="${img}" class="pd-hotel-opt-thumb" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60'">
            <div class="pd-hotel-opt-info">
                <div class="pd-hotel-opt-name">${name}</div>
                <div class="pd-hotel-opt-stars">${stars}</div>
            </div>
            <div class="pd-hotel-opt-price">${price}</div>
        </div>`;
    }).join('');
}

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

function renderAiCards(plans) {
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
        <div class="pd-ai-card" onclick="openAiDetailModal()" style="cursor:pointer;">
            <div id="pdai-scroll-hero-${dayNum}" style="position:relative;height:88px;background:${grad};background-size:cover;background-position:center;overflow:hidden;">
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%);"></div>
                <span style="position:absolute;bottom:6px;left:8px;background:#A3C14A;color:#fff;font-size:9px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:2px 8px;">GÜN ${dayNum}</span>
            </div>
            <div class="pd-ai-card-body">
                <div class="pd-ai-card-title">${_escapeHtml(place)}</div>
                ${food ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;display:flex;align-items:center;gap:3px;"><span>🍽️</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${_escapeHtml(food)}</span></div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Fetch location images → CSS background-image
    plans.forEach((p, i) => {
        const dayNum = p.day || p.gun || (i + 1);
        const place  = p.location || p.title || p.baslik || '';
        const query  = [city, place].filter(Boolean).join(' ');
        if (!query.trim()) return;
        _fetchCityImg(query, 400).then(url => {
            if (!url) return;
            const div = document.getElementById('pdai-scroll-hero-' + dayNum);
            if (div) div.style.backgroundImage = 'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%), url(' + url + ')';
        });
    });
}

function pdNoDataHtml(msg) {
    return `<div class="pd-flight-skeleton">${msg}</div>`;
}

// ============================================
// PLAN DETAIL - AI DETAIL MODAL
// ============================================

async function openAiDetailModal() {
    const modal = document.getElementById('modal-pd-ai-detail');
    if (!modal) return;

    // Veri yoksa önce Gemini'den yükle
    if (!_pdAiItinerary.length && !(_pdData?.ai_day_plans?.length)) {
        showToast('AI planı yükleniyor...', 'info');
        await refreshAiPlans();
    }

    const items = _pdAiItinerary.length ? _pdAiItinerary : (_pdData?.ai_day_plans || []);
    if (!items.length) { showToast('AI önerisi alınamadı', 'error'); return; }

    const city = _pdData?.destination || '';
    const sub  = document.getElementById('pd-ai-detail-subtitle');
    if (sub) sub.textContent = city ? (city + ' \u00B7 ' + items.length + ' G\u00FCnl\u00FCk Plan') : (items.length + ' G\u00FCnl\u00FCk Plan');

    const GRAD = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#a18cd1,#fbc2eb)',
        'linear-gradient(135deg,#ffecd2,#fcb69f)',
        'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
    ];

    const body = document.getElementById('pd-ai-detail-body');

    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;padding-bottom:8px;">' +
        items.map(function(p, i) {
            const dayNum  = p.day  || p.gun  || (i + 1);
            const place   = p.location || p.place || p.title || p.baslik || p.activity || ('Gün ' + dayNum);
            const locDesc = p.loc_desc  || p.description || p.desc  || '';
            const food    = p.food || p.meal || p.restaurant || p.yemek || '';
            const foodDesc= p.food_desc || p.meal_desc || p.yemek_desc || '';
            const grad    = GRAD[i % GRAD.length];
            const foodGrad= GRAD[(i + 4) % GRAD.length];
            return (
                '<div id="pdai-card-' + dayNum + '" style="border-radius:24px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);background:#fff;font-family:\'Plus Jakarta Sans\',sans-serif;">' +
                    // --- Location hero (CSS background-image) ---
                    '<div id="pdai-loc-hero-' + dayNum + '" style="position:relative;height:160px;background:' + grad + ';background-size:cover;background-position:center;display:flex;align-items:flex-end;">' +
                        '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.1) 60%,transparent 100%);"></div>' +
                        '<div style="position:relative;z-index:1;padding:10px 14px 12px;width:100%;">' +
                            '<div style="display:flex;justify-content:space-between;align-items:flex-end;">' +
                                '<span style="background:#A3C14A;color:#fff;font-size:10px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:3px 12px;">GÜN ' + dayNum + '</span>' +
                                '<span style="color:rgba(255,255,255,0.9);font-size:18px;line-height:1;">📍</span>' +
                            '</div>' +
                            '<p style="margin:6px 0 0;font-weight:800;font-size:15px;color:#fff;line-height:1.3;text-shadow:0 1px 4px rgba(0,0,0,0.5);">' + _escapeHtml(place) + '</p>' +
                            (locDesc ? '<p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,0.85);line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">' + _escapeHtml(locDesc) + '</p>' : '') +
                        '</div>' +
                    '</div>' +
                    // --- Food hero (CSS background-image) ---
                    '<div id="pdai-food-hero-' + dayNum + '" style="position:relative;height:100px;background:' + foodGrad + ';background-size:cover;background-position:center;display:flex;align-items:flex-end;">' +
                        '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%);"></div>' +
                        '<div style="position:relative;z-index:1;padding:8px 14px 12px;width:100%;">' +
                            '<div style="display:flex;align-items:center;gap:6px;">' +
                                '<span style="font-size:16px;line-height:1;">🍽️</span>' +
                                '<div>' +
                                    '<p style="margin:0;font-weight:700;font-size:13px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.5);">' + _escapeHtml(food || 'Yerel lezzet') + '</p>' +
                                    (foodDesc ? '<p style="margin:1px 0 0;font-size:11px;color:rgba(255,255,255,0.85);line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">' + _escapeHtml(foodDesc) + '</p>' : '') +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join('') +
    '</div>';
    modal.classList.remove('hidden');

    // Hero görselleri arka planda yükle (location + food)
    items.forEach(function(p, i) {
        const dayNum = p.day || p.gun || (i + 1);
        const place  = p.location || p.title || p.baslik || '';
        const food   = p.food || p.meal || p.yemek || '';

        // Location image → CSS background-image
        const locQuery = p.loc_img_query || [city, place].filter(Boolean).join(' ');
        if (locQuery.trim()) {
            _fetchCityImg(locQuery, 800).then(function(url) {
                if (!url) return;
                const div = document.getElementById('pdai-loc-hero-' + dayNum);
                if (div) div.style.backgroundImage = 'linear-gradient(to top,rgba(0,0,0,0.65) 0%,rgba(0,0,0,0.1) 60%,transparent 100%), url(' + url + ')';
            });
        }

        // Food image → CSS background-image
        if (food.trim()) {
            _fetchCityImg(p.food_img_query || food + ' food dish', 600).then(function(url) {
                if (!url) return;
                const fdiv = document.getElementById('pdai-food-hero-' + dayNum);
                if (fdiv) fdiv.style.backgroundImage = 'linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%), url(' + url + ')';
            });
        }
    });
}

function closePdAiDetailModal() {
    document.getElementById('modal-pd-ai-detail')?.classList.add('hidden');
}

window.openAiDetailModal    = openAiDetailModal;
window.closePdAiDetailModal = closePdAiDetailModal;

// ============================================
// PLAN DETAIL - INTERACTIONS
// ============================================

function setPdTripType(type) {
    document.getElementById('pd-pill-bireysel').classList.toggle('active', type === 'bireysel');
    document.getElementById('pd-pill-tur').classList.toggle('active', type === 'tur');
}

function toggleHotelOptions() {
    const opts = document.getElementById('pd-hotel-options');
    const chevron = document.getElementById('pd-hotel-chevron');
    const isOpen = !opts.classList.contains('hidden');
    opts.classList.toggle('hidden', isOpen);
    chevron.classList.toggle('open', !isOpen);
    lucide?.createIcons();
}

async function selectHotelOption(index) {
    if (!currentPlanId) return;
    _pdHotelIndex = index;

    // Update selected style
    document.querySelectorAll('.pd-hotel-opt').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });

    // Update main hotel card preview
    if (_pdData?.hotel_options?.length > index) {
        const h = _pdData.hotel_options[index];
        document.getElementById('pd-hotel-card').innerHTML = buildHotelCardHtml(h, _pdData.nights || 0);
    }

    // Recalculate budget
    const budget = await api.getBudgetCalc(currentPlanId, index);
    if (budget) renderPdBudgetWidget(budget);
}

async function refreshAiPlans() {
    if (!currentPlanId || !_pdData) return;
    const thisPlanId = currentPlanId; // race condition guard

    // 1) Plan oluşturulurken arka planda kaydedilmiş Gemini verisi varsa kullan — yeni sorgu atma
    //    Gemini formatı: {location, loc_desc, food, food_desc}; statik template formatı: {baslik, title}
    const cachedPlans = _pdData?.ai_day_plans || [];
    const isGeminiFormat = cachedPlans.length > 0 && (cachedPlans[0].location || cachedPlans[0].food_desc);
    if (isGeminiFormat) {
        _pdAiItinerary = cachedPlans;
        renderAiCards(_pdAiItinerary);
        return;
    }

    // 2) Cached veri yoksa veya statik template ise Gemini'ye git
    const container = document.getElementById('pd-ai-scroll');
    if (container) container.innerHTML = `<div class="pd-flight-skeleton" style="width:150px;flex-shrink:0;">AI yükleniyor...</div>`;
    _pdAiItinerary = [];

    const rawCity = _pdData.destination || '';
    const city    = rawCity.split(',')[0].trim() || rawCity;
    const days    = Math.max(1, Math.min(_pdData.nights || 3, 14));

    if (!city) { renderAiCards(cachedPlans); return; }

    try {
        const result = await api.generateItinerary(city, days);
        if (currentPlanId !== thisPlanId) return;
        if (result?.data?.itinerary?.length) {
            _pdAiItinerary = result.data.itinerary;
            renderAiCards(_pdAiItinerary);
            return;
        }
    } catch (_) { /* Gemini hata → static fallback */ }
    if (currentPlanId !== thisPlanId) return;
    renderAiCards(cachedPlans);
}

// ============================================
// PLAN DETAIL - BUDGET WIDGET
// ============================================

function renderPdBudgetWidget(budget) {
    // Total
    document.getElementById('pd-total-budget').textContent =
        formatPrice(budget.total_cost || 0, budget.currency || 'TRY');

    // Target budget
    const targetEl = document.getElementById('pd-target-budget');
    if (budget.target_budget) {
        targetEl.textContent = formatPrice(budget.target_budget, budget.currency || 'TRY');
    } else {
        targetEl.textContent = '—';
    }

    // Badge
    const badge = document.getElementById('pd-budget-badge');
    if (budget.savings && budget.savings > 0 && budget.usage_percent) {
        const pct = Math.round(100 - budget.usage_percent);
        badge.textContent = `%${pct} Tasarruf`;
        badge.classList.remove('hidden');
    } else if (budget.label === 'tam-butce') {
        badge.textContent = (budget.label_icon || '') + ' Bütçede';
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
// PLAN CONFIRM + CONFETTI
// ============================================

function openConfirmModal() {
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.remove('hidden');
}

function closeConfirmModal(event) {
    // If called from overlay click, only close if clicking the overlay itself
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.add('hidden');
}

async function confirmPlan() {
    if (!currentPlanId) return;

    // Close the modal immediately for snappy UX
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.add('hidden');

    try {
        const res = await api.confirmPlan(currentPlanId);
        if (res?.ok) {
            // Update local state so Upcoming Trips reflects the change immediately
            const plan = (state.wishlists || []).find(w => (w._id || w.id) === currentPlanId);
            if (plan) plan.status = 'confirmed';

            // Trigger confetti
            launchConfetti();

            // Hide action bar (confirm button gone, budget row still visible briefly)
            const actionBar = document.getElementById('pd-action-bar');
            if (actionBar) actionBar.style.display = 'none';

            // Navigate back to Planlarım after confetti
            setTimeout(() => {
                const detailScreen = document.getElementById('screen-planner-detail');
                const plannerScreen = document.getElementById('screen-planner');
                const bar = document.getElementById('pd-action-bar');
                if (detailScreen) detailScreen.classList.add('hidden');
                if (plannerScreen) plannerScreen.classList.remove('hidden');
                if (bar) bar.style.display = 'none';
                renderWishlists();
            }, 2200);
        } else {
            alert('Onaylama başarısız, tekrar dene.');
        }
    } catch (err) {
        console.error('confirmPlan error:', err);
        alert('Bir hata oluştu.');
    }
}

function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 100,
        w: 8 + Math.random() * 8,
        h: 5 + Math.random() * 5,
        color: ['#A3C14A', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'][Math.floor(Math.random() * 7)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2,
        alive: true
    }));

    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let anyAlive = false;
        for (const p of pieces) {
            if (!p.alive) continue;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.07; // gravity
            p.rot += p.vr;
            if (p.y > canvas.height + 20) { p.alive = false; continue; }
            anyAlive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
        frame++;
        if (anyAlive && frame < 200) {
            requestAnimationFrame(draw);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    draw();
}

// ============================================
// PLAN SETTINGS & DELETE
// ============================================

let currentPlanId = null;

function togglePlanSettings() {
    const dropdown = document.getElementById('plan-settings-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        lucide?.createIcons();
    }

    // Dışarı tıklayınca kapat
    setTimeout(() => {
        document.addEventListener('click', closePlanSettingsOnOutsideClick);
    }, 100);
}

function closePlanSettingsOnOutsideClick(e) {
    const dropdown = document.getElementById('plan-settings-dropdown');
    const btn = document.getElementById('btn-plan-settings');

    if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closePlanSettingsOnOutsideClick);
    }
}

// Global variable for delete confirmation
let pendingDeletePlanId = null;

window.deletePlan = function () {
    console.log('🗑️ deletePlan called for:', currentPlanId);
    if (!currentPlanId) {
        showToast('❌ Plan ID bulunamadı', 'error');
        return;
    }

    // Store ID and show modal
    pendingDeletePlanId = currentPlanId;

    // Hide dropdown
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');

    // Show stylish modal
    let modal = document.getElementById('modal-confirm-delete');

    // FORCE FIX: If modal is missing (caching issue), create it dynamically
    if (!modal) {
        console.warn('⚠️ Modal missing in DOM, injecting dynamically...');
        createDeleteModal();
        modal = document.getElementById('modal-confirm-delete');
        setupDeleteModalListeners(); // Re-bind listeners
    }

    if (modal) {
        // Remove hidden class strongly
        modal.style.display = 'flex'; // Force flex display
        modal.classList.remove('hidden');
        console.log('✅ Modal shown via style.display = flex');
    } else {
        // Absolute fallback - should unlikely happen now
        console.error('❌ CRITICAL: Failed to inject modal. Using fallback.');
        if (window.confirm('Bu planı silmek istediğinize emin misiniz?')) {
            window.confirmDeletePlan();
        }
    }
}

/**
 * Dynamic Modal Injection (Bypass Caching)
 */
function createDeleteModal() {
    // Check if valid to avoid duplicate
    if (document.getElementById('modal-confirm-delete')) return;

    const modalHTML = `
        <div id="modal-confirm-delete"
            class="hidden fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 transition-opacity duration-300">
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 relative text-center shadow-2xl transform transition-all scale-100">
                <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Planı İptal Et?</h3>
                <p class="text-slate-500 mb-6 text-sm leading-relaxed">
                    Bu seyahat planını tamamen silmek istediğinden emin misin? <br>
                    <span class="text-red-400 text-xs">(Bu işlem geri alınamaz)</span>
                </p>
                <div class="flex gap-3">
                    <button id="btn-cancel-delete" onclick="window.cancelDeletePlan()"
                        class="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                        Vazgeç
                    </button>
                    <button id="btn-confirm-delete" onclick="window.confirmDeletePlan()"
                        class="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 hover:scale-[1.02] transition-all">
                        Evet, Sil
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('💉 Modal injected into DOM');
}

window.confirmDeletePlan = async function () {
    console.log('✅ confirmDeletePlan called');
    if (!pendingDeletePlanId) return;

    const btnConfirm = document.getElementById('btn-confirm-delete');
    const originalText = btnConfirm ? btnConfirm.textContent : 'Evet, Sil';

    try {
        if (btnConfirm) btnConfirm.textContent = 'Siliniyor...';

        const response = await api.deleteWishlist(pendingDeletePlanId);

        if (response.ok) {
            showToast('🗑️ Plan başarıyla silindi', 'success');

            // Hide Modal
            const modal = document.getElementById('modal-confirm-delete');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none'; // Ensure hidden
            }

            // Return to Planner List
            document.getElementById('screen-planner-detail').classList.add('hidden');
            document.getElementById('screen-planner').classList.remove('hidden');

            // Refresh List
            await loadWishlists();

            // Clear current view
            currentPlanId = null;
        } else {
            throw new Error('Silme işlemi başarısız');
        }
    } catch (error) {
        console.error('❌ Plan silme hatası:', error);
        showToast('❌ Plan silinemedi: ' + error.message, 'error');
    } finally {
        if (btnConfirm) btnConfirm.textContent = originalText;
        pendingDeletePlanId = null;
    }
}

window.cancelDeletePlan = function () {
    const modal = document.getElementById('modal-confirm-delete');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    pendingDeletePlanId = null;
}



// Setup Delete Modal Listeners
function setupDeleteModalListeners() {
    console.log('🔧 Setting up Delete Modal Listeners...');
    const btnCancel = document.getElementById('btn-cancel-delete');
    const btnConfirm = document.getElementById('btn-confirm-delete');

    if (btnCancel) btnCancel.onclick = window.cancelDeletePlan;
    if (btnConfirm) btnConfirm.onclick = confirmDeletePlan;

    // Close on backdrop click
    const modal = document.getElementById('modal-confirm-delete');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) window.cancelDeletePlan();
        }
    }
    console.log('✅ Delete Modal Listeners setup complete');
}

function editPlan() {
    showToast('🔧 Düzenleme özelliği yakında...', 'info');
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');
}

function duplicatePlan() {
    showToast('📋 Kopyalama özelliği yakında...', 'info');
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');
}

// ============================================
// PROFILE SCREEN
// ============================================

async function loadPassport() {
    state.loading.profile = true;
    const passport = await api.getPassport();
    state.passport = passport;

    // Pre-populate visitedCountries Set from backend data
    if (passport && passport.visited_countries) {
        visitedCountries.clear();
        passport.visited_countries.forEach(vc => {
            const code = typeof vc === 'string' ? vc : vc.country_code;
            if (code) visitedCountries.add(code.toUpperCase());
        });
    }

    renderProfile();
    state.loading.profile = false;
}

// ─── COUNTRY STAMP MAP ───────────────────────────────────────
// ISO alpha-3 (GeoJSON feature.id) → Turkish stamp filename
const COUNTRY_STAMP_MAP = {
    AFG: 'Afganistan.png',    ALB: 'arnavutluk.png',
    DEU: 'Almanya.png',       USA: 'Amerika_Birlesik_Devletleri.png',
    AND: 'Andorra.png',       AGO: 'Angola.png',
    ATG: 'Antıgua_Barbuda.png', ARG: 'Arjantin.png',
    AUS: 'Avustralya.png',    AUT: 'Avusturya.png',
    AZE: 'Azerbeycan.png',    BHS: 'Bahamalar.png',
    BHR: 'Bahreyn.png',       BGD: 'Bangladeş.png',
    BRB: 'Barbados.png',      BLR: 'Belarus.png',
    BEL: 'Belcika.png',       BLZ: 'Belize.png',
    BEN: 'Benin.png',         ARE: 'Birlesik_Arap_Emirlikleri.png',
    BOL: 'Bolivya.png',       BIH: 'Bosna Hersek.png',
    BWA: 'Bostvana.png',      BRA: 'Brezilya.png',
    BRN: 'Brunei.png',        BGR: 'Bulgaristan.png',
    BFA: 'Burkina Faso.png',  BDI: 'Burundi.png',
    BTN: 'Butan.png',         CPV: 'Cape_Verde.png',
    CZE: 'Cek_Cumhuriyeti.png', DJI: 'Cibuti.png',
    CHN: 'Cin.png',           DNK: 'Danimarka.png',
    COD: 'Demokratik_Kongo_Cumhuriyeti.png',
    DOM: 'Dominik_cumhuriyeti.png', DMA: 'Dominika.png',
    ECU: 'Ekvador.png',       GNQ: 'Ekvator_Ginesi.png',
    SLV: 'El_Salvador.png',   IDN: 'Endonezya.png',
    ERI: 'Eritre.png',        ARM: 'Ermenistan.png',
    EST: 'Estonya.png',       SWZ: 'Esvatini.png',
    ETH: 'Etiyopya.png',      MAR: 'Fas.png',
    FJI: 'Fiji.png',          CIV: 'Fildisi_Sahili.png',
    PHL: 'Filipinler.png',    PSE: 'Filistin.png',
    FIN: 'Finlandiya.png',    FRA: 'Fransa.png',
    GAB: 'Gabon.png',         GMB: 'Gambia.png',
    GHA: 'Gana.png',          GIN: 'Gine.png',
    GNB: 'Gine_Bissau.png',   GRD: 'Grenada.png',
    GTM: 'Guatemala.png',     ZAF: 'Guney_Afrika.png',
    SSD: 'Guney_Sudan.png',   GEO: 'Gurcistan.png',
    GUY: 'Guyana.png',        HTI: 'Haiti.png',
    IND: 'Hindistan.png',     NLD: 'Hollanda.png',
    HND: 'Honduras.png',      HRV: 'Hırvatistan.png',
    IRQ: 'Irak.png',          JAM: 'Jamaika.png',
    JPN: 'Japonya.png',       KHM: 'KAmbocya.png',
    CMR: 'Kamerun.png',       CAN: 'Kanada.png',
    KAZ: 'Kazakistan.png',    KEN: 'Kenya.png',
    KIR: 'Kiribati.png',      COL: 'Kolombiya.png',
    COM: 'Komorlar.png',      COG: 'Kongo_cumhuriyeti.png',
    KOR: 'Kore.png',          CRI: 'Kostarika.png',
    MYS: 'Kuala_Lumpur.png',  CUB: 'Kuba.png',
    KWT: 'Kuveyt.png',        PRK: 'Kuzey_Kore.png',
    MKD: 'Kuzey_Makedonya.png', CYP: 'Kıbrıs.png',
    KGZ: 'Kırgızistan.png',   LAO: 'Laos.png',
    LSO: 'Lesoto.png',        LVA: 'Letonya.png',
    LBR: 'Liberya.png',       LBY: 'Libya.png',
    LIE: 'Lihtenstayn.png',   LTU: 'Litvanya.png',
    LBN: 'Lubnan.png',        LUX: 'Luksemburg.png',
    HUN: 'Macaristan.png',    MDG: 'Madagaskar.png',
    MWI: 'Malavi.png',        MDV: 'Maldivler.png',
    MLI: 'mali.png',          MLT: 'Malta.png',
    MHL: 'Marshall_Adaları.png', MUS: 'Mauritius.png',
    MEX: 'Meksika.png',       FSM: 'Mikronezya.png',
    MNG: 'Mogolistan.png',    MDA: 'Moldova.png',
    MCO: 'Monaco.png',        MRT: 'Moritanya.png',
    MOZ: 'Mozambik.png',      MMR: 'Myanmar.png',
    EGY: 'Mısır.png',         NAM: 'Namibya.png',
    NPL: 'Nepal.png',         NER: 'Nijer.png',
    NGA: 'Nijerya.png',       NIC: 'Nikaragua.png',
    NOR: 'Norvec.png',        CAF: 'Orta_Afrika_Cumhuriyeti.png',
    UZB: 'Ozbekistan.png',    PAK: 'Pakistan.png',
    PLW: 'Palau.png',         PAN: 'Panama.png',
    PNG: 'Papua_Yeni_Gine.png', PRY: 'Paraguay.png',
    PER: 'Peru.png',          POL: 'Polonya.png',
    PRT: 'Portekiz.png',      ROU: 'Romanya.png',
    RWA: 'Ruanda.png',        RUS: 'Rusya.png',
    KNA: 'Saint_Kitts_ve_Nevis.png', LCA: 'Saint_Lucia.png',
    VCT: 'Saint_Vincent_ve_Grenadinler.png',
    WSM: 'Samoa.png',         SMR: 'San_Marino.png',
    SEN: 'Senegal.png',       SYC: 'Seyseller.png',
    SLE: 'Sierra Leone.png',  CHL: 'Sili.png',
    SGP: 'Singapur.png',      SVK: 'Slovakya.png',
    SVN: 'Slovenya.png',      SLB: 'Solomon_Adalari.png',
    SOM: 'Somali.png',        LKA: 'Sri_Lanka.png',
    SDN: 'Sudan.png',         SUR: 'Surinam.png',
    SYR: 'Suriye.png',        SAU: 'Suudi_Arabistan.png',
    STP: 'São_Tomé_ve_Príncipe.png', SRB: 'Sırbistan.png',
    TJK: 'Tacikistan.png',    TZA: 'Tanzanya.png',
    THA: 'Tayland.png',       TWN: 'Tayvan.png',
    TGO: 'Togo.png',          TON: 'Tonga.png',
    TTO: 'Trinidad_ve_Tobago.png', TUN: 'Tunus.png',
    TUR: 'Turkiye.png',       TKM: 'Turkmenistan.png',
    TUV: 'Tuvalu.png',        UGA: 'Uganda.png',
    UKR: 'Ukrayna.png',       OMN: 'Umman.png',
    JOR: 'Urdun.png',         URY: 'Uruguay.png',
    VUT: 'Vanuatu.png',       VAT: 'Vatikan.png',
    VEN: 'Venezuela.png',     VNM: 'Vietnam.png',
    YEM: 'Yemen.png',         NZL: 'Yeni_Zelanda.png',
    GRC: 'Yunanistan.png',    ZMB: 'Zambiya.png',
    ZWE: 'Zimbabve.png',      DZA: 'cezayir.png',
    GBR: 'İngiltere.png',     IRN: 'İran.png',
    IRL: 'İrlanda.png',       ESP: 'İspanya.png',
    ISR: 'İsrail.png',        SWE: 'İsveç.png',
    CHE: 'İsviçre.png',       ITA: 'İtalya.png',
    ISL: 'İzlanda.png',
};

function _stampSrc(code) {
    const file = COUNTRY_STAMP_MAP[code?.toUpperCase()];
    return file ? `/public/assets/stamps/${encodeURIComponent(file)}` : null;
}

// ─── XP ENGINE (Frontend) ────────────────────────────────────

const BADGE_META = {
    euro_traveler:  { icon: '🇪🇺', name: 'Euro Traveler',  desc: '5 Avrupa Birliği ülkesi gez'               },
    schengen_ghost: { icon: '👻',  name: 'Schengen Ghost', desc: 'Vizesiz 5 ülke gez'                        },
    photo_genic:    { icon: '📸',  name: 'Photo Genic',    desc: 'Haritaya 5 farklı pin bırak'               },
    city_guide:     { icon: '🗺',   name: 'City Guide',     desc: 'Tek bir şehre 5+ pin ekle'                 },
    early_bird:     { icon: '🐦',  name: 'Early Bird',     desc: 'PLANİGO\'nun ilk 5000 kullanıcısından biri'},
    passport_full:  { icon: '📒',  name: 'Passport Full',  desc: '50+ pasaport damgası topla'                },
};

// Canonical badge display order (6 badges)
const BADGE_ORDER = [
    'euro_traveler', 'schengen_ghost',
    'photo_genic',   'city_guide',
    'early_bird',    'passport_full',
];

/**
 * XP kazanıldığında/kaybedildiğinde ekranda animasyonlu toast göster.
 * @param {object} xpResult - backend'den gelen {delta, level, leveled_up, new_badges}
 */
function _showXPFeedback(xpResult) {
    if (!xpResult || !xpResult.delta) return;
    const { delta, level, leveled_up, new_badges = [] } = xpResult;

    // +/- XP floating toast
    const sign    = delta > 0 ? '+' : '';
    const color   = delta > 0 ? '#A3C14A' : '#ef4444';
    const toast   = document.createElement('div');
    toast.className = 'xp-toast';
    toast.style.cssText = `color:${color};`;
    toast.textContent   = `${sign}${delta} XP`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);

    // Level Up banner
    if (leveled_up && level) {
        setTimeout(() => {
            const banner = document.createElement('div');
            banner.className = 'level-up-banner';
            banner.innerHTML = `<span class="level-up-star">⭐</span> LEVEL UP! <span class="level-up-num">LVL ${level}</span>`;
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 3000);
        }, 600);
    }

    // New badge popups
    (new_badges || []).forEach((b, i) => {
        const meta   = BADGE_META[b.id] || b;
        const imgSrc = `/public/assets/badges/${b.id}.png`;
        setTimeout(() => {
            const bp = document.createElement('div');
            bp.className = 'badge-popup';
            bp.innerHTML = `
                <div class="badge-popup-img-wrap">
                    <img src="${imgSrc}" alt="${meta.name}" class="badge-popup-img"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">
                    <span class="badge-popup-icon" style="display:none;">${meta.icon}</span>
                </div>
                <div>
                    <div class="badge-popup-name">Rozet Kazandın!</div>
                    <div class="badge-popup-title">${meta.name}</div>
                </div>
            `;
            document.body.appendChild(bp);
            setTimeout(() => bp.remove(), 3500);
        }, 1200 + i * 600);
    });

    // Update passport state so profile re-renders correctly without full reload
    if (state.passport) {
        state.passport.xp    = xpResult.xp    ?? state.passport.xp;
        state.passport.level = xpResult.level ?? state.passport.level;
        state.passport.level_progress_percent = xpResult.xp_progress ?? state.passport.level_progress_percent;
        // re-render XP bar immediately if profile screen is active
        const levelEl = document.getElementById('profile-level');
        if (levelEl) {
            levelEl.textContent = `GEZGİN SEVİYESİ ${xpResult.level}`;
            const xpEl  = document.getElementById('profile-xp');
            const xpBar = document.getElementById('profile-xp-bar');
            const badge = document.getElementById('profile-level-badge');
            if (xpEl)  xpEl.textContent  = `LVL ${xpResult.level + 1} için ${xpResult.xp_to_next} XP`;
            if (xpBar) xpBar.style.width = `${xpResult.xp_progress}%`;
            if (badge) badge.textContent  = `Lvl ${xpResult.level}`;
        }
    }
}

/**
 * XP endpoint'ini çağır ve sonucu göster.
 */
async function _awardXPWithFeedback(delta, reason) {
    const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id');
    if (!uid) return;
    try {
        const result = await api.awardXP(uid, delta, reason);
        if (result) _showXPFeedback(result);
    } catch (e) { /* sessizce geç */ }
}

function renderProfile() {
    const passport  = state.passport || {};
    const username  = passport.username  || '';
    const avatarUrl = passport.avatar_url || '';
    const bio       = passport.bio        || '';

    // 1. Username — update both @handle and the section header
    document.getElementById('profile-username').textContent = username ? `@${username}` : '@...';
    const profileHeaderTitle = document.querySelector('#screen-profile header h1');
    if (profileHeaderTitle) profileHeaderTitle.textContent = username || 'Profil';

    // 2. Bio
    const bioEl = document.getElementById('profile-bio');
    if (bioEl) bioEl.textContent = bio || '—';

    // 3. Avatar (photo veya initials)
    _renderProfileAvatar(avatarUrl, username);

    // 4. Level badge üzerinde
    const lvlBadge = document.getElementById('profile-level-badge');
    if (lvlBadge) lvlBadge.textContent = `Lvl ${passport.level || 1}`;

    // 5. XP & Level bar (100 XP per level)
    const xp       = passport.xp    || 0;
    const lvl      = passport.level || 1;
    const progress = xp % 100;
    const toNext   = 100 - progress;
    const levelEl  = document.getElementById('profile-level');
    if (levelEl) levelEl.textContent = `GEZGİN SEVİYESİ ${lvl}`;
    const xpEl = document.getElementById('profile-xp');
    if (xpEl)  xpEl.textContent = `LVL ${lvl + 1} için ${toNext} XP`;
    const xpBar = document.getElementById('profile-xp-bar');
    if (xpBar) xpBar.style.width = `${progress}%`;

    // Badges
    _renderBadges(passport.badges || []);

    // 6. World Map Init
    initWorldMap();
    updateVisitedCountryCount();

    // 7. Digital Passport — feed from visited_countries
    renderDigitalPassport(passport);

    // 8. Wishlist
    renderProfileWishlist();

    // 9. Recent Trips — real completed trips only
    renderRecentTrips(passport.recent_trips);

    // 10. Money Saved — real data from backend
    const savedEl = document.getElementById('profile-saved');
    if (savedEl) savedEl.textContent = passport.total_saved_formatted || `₺${passport.total_saved || 0}`;
}

/** Avatar img veya initials div'ini günceller */
function _renderProfileAvatar(avatarUrl, username) {
    const img      = document.getElementById('profile-avatar');
    const initials = document.getElementById('profile-avatar-initials');
    if (!img || !initials) return;

    if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        initials.style.display = 'none';
    } else {
        img.src = '';
        img.style.display = 'none';
        const letters = (username || '?').slice(0, 2).toUpperCase();
        initials.textContent = letters;
        initials.style.display = 'flex';
    }
}

/** Kullanıcı fotoğraf seçince — base64'e çevirip backend'e yolla */
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const userId = localStorage.getItem('auth_user_id');
    if (!userId) { showToast('Önce giriş yapmalısın', 'error'); return; }

    // Boyut kontrolü — 2 MB limit
    if (file.size > 2 * 1024 * 1024) {
        showToast('Fotoğraf 2 MB\'dan küçük olmalı', 'error');
        return;
    }

    showToast('Fotoğraf yükleniyor...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;

        // Optimistic update
        _renderProfileAvatar(dataUrl, state.passport?.username || '');

        try {
            const resp = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/profile`, {
                method: 'PATCH',
                headers: api._authHeaders(),
                body: JSON.stringify({ avatar_url: dataUrl })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            // Update local state
            if (state.passport) state.passport.avatar_url = dataUrl;
            showToast('Profil fotoğrafı güncellendi ✅', 'success');
        } catch (err) {
            showToast('Fotoğraf kaydedilemedi', 'error');
            console.error(err);
        }
    };
    reader.readAsDataURL(file);
}

/** Render badge grid — kilitli/açık */
function _renderBadges(badges) {
    const grid    = document.getElementById('badge-grid');
    const counter = document.getElementById('badge-unlocked-count');
    if (!grid) return;

    // Build lookup: badge_id → unlocked bool
    const unlockedMap = {};
    (badges || []).forEach(b => {
        const id = b.id || b;
        unlockedMap[id] = b.unlocked !== false;
    });

    const unlockedCount = BADGE_ORDER.filter(id => unlockedMap[id]).length;
    if (counter) counter.textContent = `${unlockedCount} / ${BADGE_ORDER.length}`;

    // Unlocked badges first, locked ones after (preserving relative order within each group)
    const sortedOrder = [
        ...BADGE_ORDER.filter(id =>  unlockedMap[id]),
        ...BADGE_ORDER.filter(id => !unlockedMap[id]),
    ];

    grid.innerHTML = sortedOrder.map((id, i) => {
        const meta     = BADGE_META[id] || { icon: '🏅', name: id, desc: '' };
        const unlocked = !!unlockedMap[id];
        const imgSrc   = `/public/assets/badges/${id}.png`;
        const hidden   = i >= 3 ? 'badge-card--hidden' : '';
        return `
            <div class="badge-card ${unlocked ? 'badge-card--unlocked' : 'badge-card--locked'} ${hidden}"
                 onclick="_showBadgeModal('${id}')"
                 data-badge-id="${id}">
                <div class="badge-img-wrap">
                    <img
                        class="badge-img"
                        src="${imgSrc}"
                        alt="${meta.name}"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                    />
                    <div class="badge-img-fallback" style="display:none;">${meta.icon}</div>
                </div>
                <div class="badge-name">${meta.name}</div>
            </div>
        `;
    }).join('');

    // VIEW ALL toggle
    const viewAllBtn = document.getElementById('badge-view-all');
    if (viewAllBtn && BADGE_ORDER.length > 3) {
        viewAllBtn.classList.remove('hidden');
        viewAllBtn.textContent = 'TÜMÜNÜ GÖR';
        viewAllBtn.onclick = () => {
            const isCollapsed = !!grid.querySelector('.badge-card--hidden');
            grid.querySelectorAll('.badge-card--hidden').forEach(c => c.classList.remove('badge-card--hidden'));
            if (!isCollapsed) {
                // collapse back
                Array.from(grid.children).slice(3).forEach(c => c.classList.add('badge-card--hidden'));
                viewAllBtn.textContent = 'TÜMÜNÜ GÖR';
            } else {
                viewAllBtn.textContent = 'DAHA AZ';
            }
        };
    }
}

/**
 * Show a small modal/tooltip for a badge with its name, description, and lock status.
 */
function _showBadgeModal(badgeId) {
    const meta     = BADGE_META[badgeId] || { icon: '🏅', name: badgeId, desc: '' };
    const passport = (window.state && state.passport) || {};
    const badges   = passport.badges || [];
    const unlockedMap = {};
    badges.forEach(b => { unlockedMap[b.id || b] = b.unlocked !== false; });
    const unlocked = !!unlockedMap[badgeId];

    // Remove any existing modal
    document.getElementById('badge-detail-modal')?.remove();

    const imgSrc = `/public/assets/badges/${badgeId}.png`;
    const modal  = document.createElement('div');
    modal.id     = 'badge-detail-modal';
    modal.className = 'badge-detail-modal';
    modal.innerHTML = `
        <div class="badge-detail-inner">
            <button class="badge-detail-close" onclick="document.getElementById('badge-detail-modal').remove()">✕</button>
            <div class="badge-detail-img-wrap ${unlocked ? '' : 'badge-detail-locked'}">
                <img src="${imgSrc}" alt="${meta.name}" class="badge-detail-img"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="badge-detail-fallback" style="display:none;">${meta.icon}</div>
            </div>
            <div class="badge-detail-status ${unlocked ? 'badge-detail-status--unlocked' : 'badge-detail-status--locked'}">
                ${unlocked ? '✅ Kazanıldı' : '🔒 Kilitli'}
            </div>
            <div class="badge-detail-name">${meta.name}</div>
            <div class="badge-detail-desc">${meta.desc}</div>
        </div>
    `;
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

/**
 * Render Digital Passport (Horizontal Scroll) — Real Data from visited_countries
 */
function _buildStampCard(vc, extra = '') {
    const code    = typeof vc === 'string' ? vc : (vc.country_code || 'XX');
    const name    = typeof vc === 'string' ? vc : (vc.country_name || code);
    const dateStr = vc.visited_at ? new Date(vc.visited_at).getFullYear() : new Date().getFullYear();
    const src     = _stampSrc(code);
    const imgHtml = src
        ? `<img class="passport-stamp-img"
                src="${src}"
                alt="${name}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
    return `
        <div class="passport-stamp-card passport-stamp-real group ${extra}" data-country="${code.toUpperCase()}">
            ${imgHtml}
            <div class="passport-stamp-fallback"${src ? ' style="display:none"' : ''}>
                <span class="text-3xl">🌍</span>
                <span class="text-xs font-bold text-[#A3C14A] mt-1">${code.toUpperCase()}</span>
            </div>
            <div class="passport-stamp-label">
                <span>${name}</span>
                <span class="passport-stamp-year">${dateStr}</span>
            </div>
        </div>`;
}

function renderDigitalPassport(p, newStampCode) {
    const container  = document.getElementById('passport-scroll-container');
    const expandGrid = document.getElementById('passport-expanded-grid');
    if (!container) return;

    // Newest first
    const countries = (p.visited_countries || []).slice().reverse();

    // ADD NEW always LAST
    const addBtnHTML = `
        <button class="passport-add-btn group" onclick="openFullscreenMap()">
            <div class="flex flex-col items-center gap-2">
                <i data-lucide="plus" class="w-6 h-6 group-hover:scale-110 transition-transform"></i>
                <span class="text-[10px] font-bold tracking-wide">YENİ EKLE</span>
            </div>
        </button>`;

    const stampsHTML = countries.map(vc => {
        const code  = typeof vc === 'string' ? vc : (vc.country_code || 'XX');
        const isNew = newStampCode && code.toUpperCase() === newStampCode.toUpperCase();
        return _buildStampCard(vc, isNew ? 'passport-stamp-new' : '');
    }).join('');

    // Horizontal row: stamps + ADD NEW at end
    container.innerHTML = stampsHTML + addBtnHTML;
    lucide.createIcons();

    if (newStampCode) container.scrollTo({ left: 0, behavior: 'smooth' });

    // Expanded grid (all stamps, no ADD NEW — grid cards don't need it)
    if (expandGrid) {
        expandGrid.innerHTML = countries.map(vc => _buildStampCard(vc)).join('');
    }

    // VIEW ALL toggle
    const viewAllBtn = document.getElementById('passport-view-all');
    if (viewAllBtn) {
        viewAllBtn.textContent = 'TÜMÜNÜ GÖR';
        viewAllBtn.onclick = () => {
            if (!expandGrid) return;
            const isHidden = expandGrid.classList.contains('hidden');
            expandGrid.classList.toggle('hidden', !isHidden);
            viewAllBtn.textContent = isHidden ? 'DAHA AZ' : 'TÜMÜNÜ GÖR';
            if (isHidden) {
                // Re-render icons in grid and scroll into view
                lucide.createIcons();
                expandGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };
    }
}

async function renderProfileWishlist() {
    const container = document.getElementById('profile-wishlist-cards');
    const countEl = document.getElementById('wishlist-count-badge');
    if (!container) return;

    try {
        // Fetch Real Data (with auth headers so user-specific plans are returned)
        const wishlists = await api.getWishlists() || [];

        state.wishlists = wishlists; // Sync state

        if (countEl) countEl.textContent = `${wishlists.length} Plan`;

        if (wishlists.length === 0) {
            container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Aktif plan bulunamadı. Hemen oluştur!</div>';
            return;
        }

        // Render Cards (New Style)
        container.innerHTML = wishlists.slice(0, 3).map(w => `
            <div class="wishlist-card group cursor-pointer" onclick="navigate('planner'); openPlannerDetail('${w._id || w.id}')">
                <img src="${w.image_url || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=200&q=80'}" 
                     class="wishlist-thumb" alt="${w.destination}">
                
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-[#1a1a1a] text-sm group-hover:text-[#9CAF88] transition-colors">${w.destination}</h4>
                        <span class="text-[10px] font-bold text-[#9CAF88] bg-[#9CAF88]/10 px-2 py-0.5 rounded-full">TL</span>
                    </div>
                    <p class="text-xs text-[#9ca3af] mt-0.5">${w.origin} ✈ ${w.destination}</p>
                    
                    <div class="flex justify-between items-end mt-2">
                        <div>
                            <p class="text-[10px] text-[#9ca3af] font-bold uppercase tracking-wider">HEDEF</p>
                            <p class="text-sm font-bold text-[#1a1a1a]">${formatCurrency(w.target_price || 0, w.currency)}</p>
                        </div>
                        <div class="text-right">
                             <p class="text-[10px] text-[#9ca3af] font-bold uppercase tracking-wider">GÜNCEL</p>
                             <p class="text-xs font-bold text-orange-400">Bekleniyor...</p>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading profile wishlist:', error);
        container.innerHTML = '<div class="text-center text-xs text-red-400 py-4">Planlar yüklenemedi</div>';
    }
}

function formatCurrency(amount, currency = 'TRY') {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency, maximumSignificantDigits: 3 }).format(amount);
}

function renderRecentTrips(trips) {
    const container = document.getElementById('recent-trips');
    if (!container) return;

    // No mock fallback — show real data or empty state
    if (!trips || trips.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-center">
                <span class="text-3xl mb-2">✈️</span>
                <p class="text-xs text-slate-400 font-medium">Henüz tamamlanmış seyahatin yok!</p>
                <p class="text-[10px] text-slate-300 mt-1">Planlarını tamamla, buraya düşsün.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = trips.map(t => `
        <div class="flex items-center justify-between bg-white rounded-[20px] p-4 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <i data-lucide="plane" class="w-5 h-5"></i>
                </div>
                <div>
                    <h4 class="font-bold text-[#1a1a1a] text-sm">${t.destination || t.trip_name}</h4>
                    <p class="text-xs text-[#9ca3af]">${t.dates || t.date || 'Yakın zamanda'}</p>
                </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
        </div>
    `).join('');
}


// ============================================
// WORLD MAP (LEAFLET + GEOJSON)
// ============================================

// ============================================
// WORLD MAP (LEAFLET + GEOJSON)
// ============================================

let worldMap = null; // Fullscreen interactive map
let miniMap = null;  // Profile card static map
let geoJsonLayer = null;
let miniGeoJsonLayer = null;
let visitedCountries = new Set(); // Stores country codes "TR", "US"

// GeoJSON URL (Lightweight)
const WORLD_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

/**
 * Initialize World Maps (Mini & Full)
 */
async function initWorldMap() {
    // 1. Initialize Mini Map (Static Visual)
    const miniContainer = document.getElementById('mini-world-map');
    if (miniContainer && !miniMap) {
        console.log('🗺️ Initializing Mini Map...');
        miniMap = L.map('mini-world-map', {
            center: [20, 0],
            zoom: 0.8,
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false
        });

        // Clean style for Mini Map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 10
        }).addTo(miniMap);
    }

    // 2. Initialize Fullscreen Map (Interactive)
    const fullContainer = document.getElementById('fullscreen-map-container');
    if (fullContainer && !worldMap) {
        console.log('🌍 Initializing Fullscreen Map...');
        worldMap = L.map('fullscreen-map-container', {
            center: [20, 0],
            zoom: 2,
            zoomControl: false, // We'll add custom if needed
            attributionControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 10
        }).addTo(worldMap);
    }

    // 3. Load GeoJSON Data
    if (!geoJsonLayer) {
        try {
            const response = await fetch(WORLD_GEOJSON_URL);
            const data = await response.json();

            // Style Function
            const style = (feature) => {
                const isVisited = visitedCountries.has(feature.id);
                return {
                    fillColor: isVisited ? '#9CAF88' : '#E5E7EB', // Sage Green vs Gray
                    weight: 1,
                    opacity: 1,
                    color: '#fff',
                    fillOpacity: isVisited ? 0.8 : 0.5
                };
            };

            // A. Add to Full Map (Interactive)
            if (worldMap) {
                geoJsonLayer = L.geoJson(data, {
                    style: style,
                    onEachFeature: onEachFeature
                }).addTo(worldMap);

                // Add pins for already-visited countries
                geoJsonLayer.eachLayer(l => {
                    const code = l.feature?.id;
                    if (code && visitedCountries.has(code)) {
                        try {
                            const center = l.getBounds().getCenter();
                            const name   = l.feature?.properties?.name || code;
                            const marker = L.marker(center, { icon: _makePinIcon(_pinColor(code)), zIndexOffset: 500 })
                                .bindTooltip(name, { permanent: false, direction: 'top', className: 'country-pin-tooltip' })
                                .addTo(worldMap);
                            pinMarkers.set(code, marker);
                        } catch (_) {}
                    }
                });
            }

            // B. Add to Mini Map (Interactive — click to toggle visited)
            if (miniMap) {
                miniGeoJsonLayer = L.geoJson(data, {
                    style: style,
                    onEachFeature: onEachMiniFeature,
                }).addTo(miniMap);
            }

            updateVisitedCountryCount();

        } catch (error) {
            console.error('Error loading GeoJSON:', error);
        }
    }
}

/**
 * Handle Country Interactions (Fullscreen) — Backend Synced + Live Passport Update
 */
function onEachFeature(feature, layer) {
    // 1. Hover Effect
    layer.on('mouseover', function (e) {
        if (!visitedCountries.has(feature.id)) {
            e.target.setStyle({
                fillColor: '#D1D5DB',
                fillOpacity: 0.7
            });
        }
    });

    layer.on('mouseout', function (e) {
        if (!visitedCountries.has(feature.id)) {
            geoJsonLayer.resetStyle(e.target);
        }
    });

    // 2. Click to Mark / Unmark Visited — delegates to shared _toggleCountryVisit
    layer.on('click', async function () {
        await _toggleCountryVisit(feature.id, feature.properties?.name || feature.id);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: Toggle country visited state + sync all map layers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared toggle logic for both fullscreen AND mini map clicks.
 * Handles state, backend calls, toast, and passport stamp animation.
 */
async function _toggleCountryVisit(countryCode, countryName) {
    if (visitedCountries.has(countryCode)) {
        // ─── UNMARK ───────────────────────────────────────────────────────
        visitedCountries.delete(countryCode);
        _removeCountryPin(countryCode);

        // Toast feedback
        showToast('Ziyaret silindi 🗑️', 'info');

        // Animate-out and remove ALL passport stamp cards for this country
        // (one in scroll row, one in expanded VIEW ALL grid)
        document.querySelectorAll(
            `.passport-stamp-card[data-country="${countryCode.toUpperCase()}"]`
        ).forEach(card => {
            card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
            card.style.transform = 'scale(0) rotate(-8deg)';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 350);
        });

        // Backend call (optimistic UI — already removed above)
        try {
            const removeResult = await api.removeVisitedCountry(countryCode);
            if (removeResult?.xp_result) _showXPFeedback(removeResult.xp_result);
        } catch (err) {
            // Rollback on failure
            visitedCountries.add(countryCode);
            showToast('Bir hata oluştu, tekrar dene', 'error');
            console.error('Remove country error:', err);
        }

    } else {
        // ─── MARK VISITED ─────────────────────────────────────────────────
        visitedCountries.add(countryCode);
        _addCountryPin(countryCode, countryName);

        // Toast feedback
        showToast(`${countryName} pasaporta eklendi! 🌍`, 'success');

        // Inject passport stamp immediately (Zınk!)
        injectPassportStamp(countryCode, countryName);

        // Backend call
        try {
            const addResult = await api.addVisitedCountry({
                country_code: countryCode,
                country_name: countryName,
            });
            if (addResult?.xp_result) _showXPFeedback(addResult.xp_result);
        } catch (err) {
            // Rollback on failure
            visitedCountries.delete(countryCode);
            showToast('Bir hata oluştu, tekrar dene', 'error');
            console.error('Add country error:', err);
        }
    }

    // Sync BOTH map layers + counter
    _syncMapLayer(geoJsonLayer);
    _syncMapLayer(miniGeoJsonLayer);
    updateVisitedCountryCount();
}

// ─── Country Pin Markers ──────────────────────────────────────────────────────
const pinMarkers = new Map(); // countryCode → L.Marker

/** Deterministic color per country code (same code → same color every time) */
function _pinColor(code) {
    const palette = [
        '#E57373','#F06292','#BA68C8','#7986CB',
        '#4FC3F7','#4DB6AC','#AED581','#FFD54F',
        '#FF8A65','#A1887F'
    ];
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
}

function _makePinIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="26" viewBox="0 0 18 26">
        <circle cx="9" cy="9" r="7.5" fill="${color}" stroke="white" stroke-width="2"/>
        <polygon points="9,26 5,17 13,17" fill="${color}"/>
    </svg>`;
    return L.divIcon({
        html:        svg,
        className:   'country-pin-icon',
        iconSize:    [18, 26],
        iconAnchor:  [9,  26],
        tooltipAnchor: [0, -28],
    });
}

function _addCountryPin(code, name) {
    if (!worldMap || pinMarkers.has(code)) return;
    let center = null;
    if (geoJsonLayer) {
        geoJsonLayer.eachLayer(l => {
            if (!center && l.feature?.id === code) {
                try { center = l.getBounds().getCenter(); } catch (_) {}
            }
        });
    }
    if (!center) return;
    const marker = L.marker(center, { icon: _makePinIcon(_pinColor(code)), zIndexOffset: 500 })
        .bindTooltip(name || code, { permanent: false, direction: 'top', className: 'country-pin-tooltip' })
        .addTo(worldMap);
    pinMarkers.set(code, marker);
}

function _removeCountryPin(code) {
    const m = pinMarkers.get(code);
    if (m) { m.remove(); pinMarkers.delete(code); }
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-colour every polygon in a GeoJSON layer based on current visitedCountries state.
 */
function _syncMapLayer(geoLayer) {
    if (!geoLayer) return;
    geoLayer.eachLayer(l => {
        const isVisited = visitedCountries.has(l.feature?.id);
        l.setStyle({
            fillColor:   isVisited ? '#9CAF88' : '#E5E7EB',
            fillOpacity: isVisited ? 0.8       : 0.5,
        });
    });
}

/**
 * Mini-map click handler — same toggle logic, no hover effects.
 */
function onEachMiniFeature(feature, layer) {
    layer.on('click', async function () {
        await _toggleCountryVisit(feature.id, feature.properties?.name || feature.id);
    });
}

/**
 * Inject a single passport stamp card at the beginning of passport scroll — Zınk!
 */
function injectPassportStamp(code, name) {
    const container = document.getElementById('passport-scroll-container');
    if (!container) return;

    const vc = { country_code: code, country_name: name, visited_at: new Date().toISOString() };
    const div = document.createElement('div');
    div.innerHTML = _buildStampCard(vc, 'passport-stamp-new').trim();
    const card = div.firstElementChild;

    // Insert before ADD NEW button (which is always last)
    const addBtn = container.querySelector('.passport-add-btn');
    if (addBtn) container.insertBefore(card, addBtn);
    else container.appendChild(card);

    lucide.createIcons();
    container.scrollTo({ left: 0, behavior: 'smooth' });

    // Also prepend to expanded grid if visible
    const expandGrid = document.getElementById('passport-expanded-grid');
    if (expandGrid && !expandGrid.classList.contains('hidden')) {
        const gridDiv = document.createElement('div');
        gridDiv.innerHTML = _buildStampCard(vc).trim();
        expandGrid.insertBefore(gridDiv.firstElementChild, expandGrid.firstChild);
        lucide.createIcons();
    }

    setTimeout(() => card.classList.remove('passport-stamp-new'), 3500);
}

/**
 * Sync Mini Map AND Fullscreen Map with current visitedCountries state.
 */
function updateMiniMapStyle() {
    _syncMapLayer(miniGeoJsonLayer);
    _syncMapLayer(geoJsonLayer);
}

function updateVisitedCountryCount() {
    const count = visitedCountries.size;
    const badge = document.getElementById('visited-country-badge');
    const overlayStats = document.getElementById('overlay-stats');

    if (badge) badge.textContent = `${count} Ülke`;
    if (overlayStats) overlayStats.textContent = `${count} Ülke Ziyaret Edildi`;
}

// Open Fullscreen Map (callable from passport ADD NEW button)
function openFullscreenMap() {
    const overlay = document.getElementById('map-fullscreen-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        setTimeout(() => { worldMap?.invalidateSize(); }, 100);
    }
}

// Open Passport Modal — View All visited countries
function openPassportModal(countries) {
    // Remove existing modal if any
    document.getElementById('passport-modal')?.remove();

    const grid = countries.map(vc => {
        const code = typeof vc === 'string' ? vc : (vc.country_code || 'XX');
        const name = typeof vc === 'string' ? vc : (vc.country_name || code);
        const dateStr = vc.visited_at ? new Date(vc.visited_at).toLocaleDateString('tr-TR') : '';

        return `
            <div class="passport-stamp-card passport-bg-gradient" style="width:100%;aspect-ratio:3/4;">
                <div class="passport-country-shape" style="background-image: url('https://raw.githubusercontent.com/djaiss/mapsicon/master/all/${code.toLowerCase()}/vector.svg');"></div>
                <i data-lucide="stamp" class="absolute top-4 right-4 w-6 h-6 text-white/80"></i>
                <div class="passport-overlay-text">
                    <div class="uppercase tracking-widest text-[10px] opacity-80">${name}</div>
                    <div class="text-2xl font-black mt-1">${code.toUpperCase()}</div>
                    <div class="text-[10px] font-mono mt-2 opacity-60">${dateStr}</div>
                </div>
            </div>
        `;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'passport-modal';
    modal.className = 'fixed inset-0 z-[70] bg-[#F9F7F2] flex flex-col animate-fade-in';
    modal.innerHTML = `
        <div class="px-6 py-6 flex items-center justify-between bg-white/50 backdrop-blur-sm border-b border-gray-100">
            <div>
                <h2 class="text-2xl font-serif font-bold text-[#1a1a1a]">Digital Passport</h2>
                <p class="text-xs text-[#9CAF88] font-bold uppercase tracking-wide">${countries.length} Countries</p>
            </div>
            <button onclick="document.getElementById('passport-modal').remove()"
                class="w-10 h-10 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center hover:scale-105 transition-transform text-[#1a1a1a]">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>
        <div class="flex-1 overflow-y-auto p-6">
            <div class="grid grid-cols-3 gap-3">
                ${grid}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    lucide.createIcons();
}

// Open Fullscreen Map (button listener)
document.getElementById('btn-open-map')?.addEventListener('click', () => {
    openFullscreenMap();
});

// Close Fullscreen Map
document.getElementById('btn-close-map')?.addEventListener('click', () => {
    const overlay = document.getElementById('map-fullscreen-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
});

/**
 * Load Countries GeoJSON
 */
async function loadGeoJsonCountries() {
    try {
        const response = await fetch(WORLD_GEOJSON_URL);
        const geoJsonData = await response.json();

        geoJsonLayer = L.geoJSON(geoJsonData, {
            style: (feature) => getCountryStyle(getCountryCode(feature)),
            onEachFeature: (feature, layer) => {
                const countryCode = getCountryCode(feature);
                const countryName = feature.properties.name || countryCode;

                layer.on('click', () => toggleCountryVisit(countryCode, countryName, layer));
            }
        }).addTo(worldMap);

    } catch (error) {
        console.error('GeoJSON load error:', error);
    }
}

function getCountryCode(feature) {
    return feature.id || feature.properties.id || feature.properties.ISO_A2;
}

function getCountryStyle(countryCode) {
    const isVisited = visitedCountries.has(countryCode);
    return {
        fillColor: isVisited ? '#9CAF88' : '#F9F7F2', // Sage Green vs Cream White
        fillOpacity: isVisited ? 0.9 : 0.5,
        color: isVisited ? '#ffffff' : '#e8e6e1', // Borders
        weight: 1
    };
}

async function toggleCountryVisit(countryCode, countryName, layer) {
    if (!countryCode) return;

    if (visitedCountries.has(countryCode)) {
        visitedCountries.delete(countryCode);
    } else {
        visitedCountries.add(countryCode);
        showToast(`🌍 ${countryName} ziyaret edildi olarak işaretlendi!`, 'success');
    }

    // Refresh Style
    if (layer) layer.setStyle(getCountryStyle(countryCode));
    updateVisitedCountryCount();
}

function updateVisitedCountryCount() {
    const count = visitedCountries.size;
    const el1 = document.getElementById('visited-country-badge');
    const el2 = document.getElementById('overlay-stats');
    if (el1) el1.textContent = `${count} Ülke`;
    if (el2) el2.textContent = `${count} Ülke Ziyaret Edildi`;
}

/**
 * Geolocation "Zınk" Feature
 * Check if user is in a new country
 */
function checkUserLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            console.log('📍 Location:', latitude, longitude);

            // Find containing country
            if (geoJsonLayer) {
                let foundLayer = null;
                const point = { type: "Point", coordinates: [longitude, latitude] }; // GeoJSON uses [lng, lat]

                geoJsonLayer.eachLayer(layer => {
                    if (foundLayer) return;

                    // Simple Bounds Check first
                    if (layer.getBounds().contains([latitude, longitude])) {
                        // Detailed Check (Ray Casting or Turf.js would be better but expensive)
                        // For MVP: Bounds check + simple point-in-poly if possible
                        // Let's rely on bounds for now OR enable ray-casting helper
                        if (isPointInLayer(longitude, latitude, layer)) {
                            foundLayer = layer;
                        }
                    }
                });

                if (foundLayer) {
                    const code = getCountryCode(foundLayer.feature);
                    const name = foundLayer.feature.properties.name || code;
                    console.log(`📍 You are in ${name} (${code})`);

                    if (!visitedCountries.has(code)) {
                        console.log('🔥 ZINK! New country detected!');
                        // Auto-visit
                        toggleCountryVisit(code, name, foundLayer, { lat: latitude, lng: longitude });

                        // Fly to location
                        worldMap.flyTo([latitude, longitude], 4, { duration: 1.5 });
                    }
                }
            }
        },
        (err) => console.warn('Location error:', err),
        { enableHighAccuracy: false, timeout: 5000 }
    );
}

// Ray-Casting Algorithm for MultiPolygon/Polygon
function isPointInLayer(lng, lat, layer) {
    const geom = layer.feature.geometry;
    if (geom.type === 'Polygon') {
        return pointInPolygon([lng, lat], geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
        for (let poly of geom.coordinates) {
            if (pointInPolygon([lng, lat], poly[0])) return true;
        }
    }
    return false;
}

function pointInPolygon(point, vs) {
    // point [x, y], vs [[x, y], ...]
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ============================================


// ============================================
// DESTINATION AUTOCOMPLETE (NOMINATIM)
// ============================================

let selectedDestination = null;
let searchDebounceTimer = null;

/**
 * Nominatim API ile şehir arar
 * @param {string} query - Arama metni
 */
async function searchCities(query) {
    if (query.length < 2) return [];

    console.log('🔍 Şehir aranıyor:', query);

    try {
        // Nominatim API (OpenStreetMap) - şehir araması için optimize edilmiş
        const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
            format: 'json',
            q: query,
            limit: '10',
            addressdetails: '1',
            'accept-language': 'tr,en',
            featuretype: 'city,town,village'
        });

        console.log('📡 API URL:', url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SITA-SmartPlanner/1.0 (Educational Project)'
            }
        });

        if (!response.ok) {
            console.error('❌ API yanıt hatası:', response.status);
            return [];
        }

        const data = await response.json();
        console.log('📦 API yanıtı:', data);

        // Daha gevşek filtreleme - tüm sonuçları al
        const results = data.map(item => ({
            name: item.display_name.split(',')[0].trim(),
            fullName: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            country: item.address?.country || item.display_name.split(',').pop()?.trim() || '',
            countryCode: item.address?.country_code?.toUpperCase() || ''
        }));

        console.log('✅ İşlenmiş sonuçlar:', results);
        return results;

    } catch (error) {
        console.error('❌ Nominatim arama hatası:', error);
        return [];
    }
}

/**
 * Autocomplete dropdown'ı render eder
 */
function renderAutocomplete(suggestions) {
    const dropdown = document.getElementById('destination-autocomplete');
    if (!dropdown) return;

    if (suggestions.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = suggestions.map((city, index) => `
        <div style="padding:12px 16px; cursor:pointer; border-bottom:1px solid #f0efe9; transition:background 0.2s;"
             onmouseover="this.style.background='#f5f3ee'" onmouseout="this.style.background='#fff'"
             data-index="${index}"
             onclick="selectCity(${index})">
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:18px;">${getCityEmoji(city.countryCode)}</span>
                <div style="flex:1;">
                    <p style="font-weight:600; color:#1a1a1a; font-size:14px; margin:0;">${city.name}</p>
                    <p style="font-size:12px; color:#9ca3af; margin:2px 0 0;">${city.country}</p>
                </div>
                <span style="font-size:12px; color:#9ca3af;">${city.countryCode}</span>
            </div>
        </div>
    `).join('');

    dropdown.style.display = 'block';

    // Suggestions'ı global'e kaydet
    window._autocompleteSuggestions = suggestions;
}

/**
 * Şehir seçildiğinde çağrılır
 */
function selectCity(index) {
    const suggestions = window._autocompleteSuggestions;
    if (!suggestions || !suggestions[index]) return;

    const city = suggestions[index];

    // Input'a yaz
    const input = document.getElementById('destination-input');
    if (input) {
        input.value = `${city.name}, ${city.country}`;
    }

    // Hidden alanlara kaydet
    document.getElementById('destination-lat').value = city.lat;
    document.getElementById('destination-lng').value = city.lng;
    document.getElementById('destination-display').value = `${city.name}, ${city.country}`;

    // Global seçimi kaydet
    selectedDestination = {
        name: city.name,
        fullName: city.fullName,
        displayName: `${city.name}, ${city.country}`,
        lat: city.lat,
        lng: city.lng,
        country: city.country,
        countryCode: city.countryCode
    };

    // Dropdown'ı kapat
    const dropdown = document.getElementById('destination-autocomplete');
    if (dropdown) dropdown.style.display = 'none';

    // Hata mesajını gizle
    const errorEl = document.getElementById('destination-error');
    if (errorEl) errorEl.style.display = 'none';

    // Input border rengini yeşil yap (onaylandı)
    if (input) {
        input.style.borderColor = '#7a8a2e';
    }

    console.log('✅ Şehir seçildi:', selectedDestination);
}

/**
 * Ülke koduna göre emoji döner
 */
function getCityEmoji(countryCode) {
    const emojis = {
        'TR': '🇹🇷', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'DE': '🇩🇪',
        'GB': '🇬🇧', 'US': '🇺🇸', 'GR': '🇬🇷', 'NL': '🇳🇱', 'PT': '🇵🇹',
        'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳', 'TH': '🇹🇭', 'AE': '🇦🇪',
        'EG': '🇪🇬', 'MA': '🇲🇦', 'AU': '🇦🇺', 'BR': '🇧🇷', 'MX': '🇲🇽'
    };
    return emojis[countryCode] || '🌍';
}

/**
 * Autocomplete input eventlerini başlatır
 */
let _autocompleteInitialized = false;

function initDestinationAutocomplete() {
    const input = document.getElementById('destination-input');
    const dropdown = document.getElementById('destination-autocomplete');

    console.log('🎯 initDestinationAutocomplete çağrıldı');
    console.log('📌 Input element:', input);
    console.log('📌 Dropdown element:', dropdown);

    if (!input) {
        console.warn('⚠️ destination-input bulunamadı! Modal henüz DOM\'da olmayabilir.');
        return;
    }

    // Zaten init edildiyse tekrar event listener ekleme
    if (_autocompleteInitialized) {
        console.log('ℹ️ Autocomplete zaten init edilmiş');
        return;
    }
    _autocompleteInitialized = true;

    // Input değişikliklerini dinle (debounce ile)
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        console.log('⌨️ Input değişti:', query);

        // Seçimi sıfırla (kullanıcı tekrar yazmaya başladıysa)
        selectedDestination = null;
        input.style.borderColor = '#e8e6e1';

        // Debounce
        clearTimeout(searchDebounceTimer);

        if (query.length < 2) {
            if (dropdown) dropdown.style.display = 'none';
            return;
        }

        searchDebounceTimer = setTimeout(async () => {
            const suggestions = await searchCities(query);
            renderAutocomplete(suggestions);
        }, 300);
    });

    // Dropdown dışına tıklanınca kapat
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown?.contains(e.target)) {
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    // Focus'ta dropdown'ı göster (öneriler varsa)
    input.addEventListener('focus', () => {
        if (window._autocompleteSuggestions?.length > 0 && dropdown) {
            dropdown.style.display = 'block';
        }
    });

    console.log('✅ Destination autocomplete initialized');
}

/**
 * Seçilen destination verisini döner (form submit için)
 */
function getSelectedDestination() {
    return selectedDestination;
}

/**
 * Destination seçimini validate eder
 */
function validateDestinationSelection() {
    const input = document.getElementById('destination-input');
    const errorEl = document.getElementById('destination-error');

    if (!selectedDestination && input?.value.trim()) {
        // Kullanıcı yazdı ama listeden seçmedi
        if (errorEl) errorEl.style.display = 'block';
        if (input) input.style.borderColor = '#ef4444';
        return false;
    }

    if (!input?.value.trim()) {
        if (errorEl) errorEl.style.display = 'none';
        return false; // Boş
    }

    return true;
}

// ============================================
// UTILITIES
// ============================================

// ============================================
// BUDGET INPUT HELPERS
// ============================================

function formatBudgetInput(input) {
    // Strip everything except digits
    const raw = input.value.replace(/\D/g, '');
    const numeric = raw ? parseInt(raw, 10) : '';

    // Display with thousand-dot separators (Turkish style: 15.000)
    if (numeric !== '') {
        input.value = new Intl.NumberFormat('tr-TR').format(numeric);
    } else {
        input.value = '';
    }

    // Sync hidden numeric field used by formData
    const hidden = document.getElementById('budget-hidden');
    if (hidden) hidden.value = numeric !== '' ? String(numeric) : '';
}

function resetBudgetInput() {
    const visible = document.getElementById('budget-input');
    const hidden  = document.getElementById('budget-hidden');
    if (visible) visible.value = '';
    if (hidden)  hidden.value  = '';
}

function formatPrice(amount, currency = 'TRY') {
    if (!amount && amount !== 0) return '—';
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺';
    return `${symbol}${new Intl.NumberFormat('tr-TR').format(amount)}`;
}

function formatDateRange(start, end) {
    if (!start) return 'Tarih Belirlenmedi';
    try {
        const s = new Date(start);
        const e = end ? new Date(end) : null;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[s.getMonth()]} ${s.getDate()}${e ? `-${e.getDate()}` : ''}`;
    } catch { return start; }
}

// ============================================
// NEW PLAN FORM HANDLER
// ============================================

/**
 * Yeni Plan Oluşturma Formu - JavaScript Handler
 * Esnek Tarih / Kesin Tarih seçimi ve Bütçe girişini yönetir
 * POST /api/v1/wishlist/add endpoint'ine gönderir
 */
function initNewPlanForm() {
    const form = document.getElementById('form-new-plan');
    if (!form) {
        console.warn('⚠️ form-new-plan bulunamadı');
        return;
    }

    // ===== ESNEK/KESİN TARİH TOGGLE =====
    const dateTypeRadios = document.querySelectorAll('input[name="date_type"]');
    const flexibleFields = document.getElementById('field-flexible-dates');
    const fixedFields = document.getElementById('field-fixed-dates');

    dateTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isFlexible = e.target.value === 'flexible';

            if (flexibleFields) {
                flexibleFields.classList.toggle('hidden', !isFlexible);
            }
            if (fixedFields) {
                fixedFields.classList.toggle('hidden', isFlexible);
            }

            console.log(`📅 Tarih tipi değişti: ${isFlexible ? 'Esnek' : 'Kesin'}`);
        });
    });

    // ===== FORM SUBMIT HANDLER =====
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const submitBtn = form.querySelector('button[type="submit"]');

        // Loading state
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> Oluşturuluyor...';
        submitBtn.disabled = true;

        try {
            // Form verilerini topla
            const dateType = formData.get('date_type') || 'flexible';
            const origin = (formData.get('origin') || 'IST').toUpperCase();
            const destinationInput = formData.get('destination')?.trim();
            const budget = formData.get('budget') ? parseFloat(formData.get('budget')) : null;

            // === AUTOCOMPLETE VALIDASYON ===
            // Kullanıcı listeden bir şehir seçmeli
            const selectedDest = getSelectedDestination();

            if (!destinationInput) {
                showToast('❌ Lütfen bir destinasyon girin', 'error');
                return;
            }

            // === AUTOCOMPLETE veya MANUEL GİRİŞ ===
            // Listeden seçildiyse koordinatları kullan, seçilmediyse sadece ismi kullan
            // selectedDest yukarıda zaten tanımlandı

            let destination, destinationDisplay, destinationLat, destinationLng, destinationCountry, destinationCountryCode;

            if (selectedDest) {
                // Listeden seçildi - koordinatlar mevcut
                destination = selectedDest.name;
                destinationDisplay = selectedDest.displayName;
                destinationLat = selectedDest.lat;
                destinationLng = selectedDest.lng;
                destinationCountry = selectedDest.country;
                destinationCountryCode = selectedDest.countryCode;
                console.log('✅ Autocomplete seçimi kullanılıyor:', selectedDest);
            } else {
                // Manuel giriş - koordinatlar yok ama plan oluşturulabilir
                destination = destinationInput;
                destinationDisplay = destinationInput;
                destinationLat = null;
                destinationLng = null;
                destinationCountry = null;
                destinationCountryCode = null;
                console.log('⚠️ Manuel giriş kullanılıyor:', destinationInput);
            }

            // Tarih verilerini hazırla
            let startDate = null;
            let endDate = null;
            let flexibleMonth = null;
            let flexibleDuration = null;

            if (dateType === 'fixed') {
                startDate = formData.get('start_date');
                endDate = formData.get('end_date');

                if (!startDate || !endDate) {
                    showToast('❌ Kesin tarih seçtiniz, lütfen tarihleri girin', 'error');
                    return;
                }

                if (new Date(endDate) <= new Date(startDate)) {
                    showToast('❌ Dönüş tarihi gidiş tarihinden sonra olmalı', 'error');
                    return;
                }
            } else {
                // Esnek tarih
                flexibleMonth = formData.get('flexible_month');
                flexibleDuration = formData.get('flexible_duration');
            }

            // API payload oluştur (koordinatlarla birlikte)
            const payload = {
                origin: origin,
                destination: destination,
                destination_display: destinationDisplay,
                destination_lat: destinationLat,
                destination_lng: destinationLng,
                destination_country: destinationCountry,
                destination_country_code: destinationCountryCode,
                date_type: dateType,
                start_date: startDate,
                end_date: endDate,
                flexible_month: flexibleMonth,
                flexible_duration: flexibleDuration,
                budget: budget,
                status: 'tracking',
                travelers_count: 1,
                is_active: true,
                user_id: localStorage.getItem('auth_user_id') || null
            };

            console.log('📤 Wishlist ekleniyor:', payload);

            // 1️⃣ ANINDA MODALİ KAPAT VE PLANLARİM'A GİT
            document.getElementById('modal-new-plan').classList.add('hidden');
            navigate('planner');

            // 2️⃣ SKELETON KART EKLE (API yanıtı gelmeden önce)
            const container = document.getElementById('planner-list');
            const skeletonHTML = createSkeletonCard(destination);
            if (container) {
                container.insertAdjacentHTML('afterbegin', skeletonHTML);
            }
            showToast('🔄 Plan oluşturuluyor, fiyatlar taranıyor...', 'info');

            // 3️⃣ API ÇAĞRISI (arka planda)
            const result = await api.addWishlist(payload);

            if (result && (result._id || result.id || result.success)) {
                console.log('✅ Wishlist oluşturuldu:', result);
                _awardXPWithFeedback(20, 'wishlist_added');

                const newId = result._id || result.id;

                // Skeleton'u kaldır ve gerçek kartı göster
                const skeleton = document.querySelector('.skeleton-card');
                if (skeleton) skeleton.remove();

                // Formu temizle
                form.reset();
                selectedDestination = null;
                const destInput = document.getElementById('destination-input');
                if (destInput) {
                    destInput.classList.remove('border-green-500', 'border-red-500');
                    destInput.classList.add('border-slate-700');
                }

                // Listeyi yenile
                await loadWishlists();

                // Başarı bildirimi
                showToast('🎉 Plan oluşturuldu, fiyatlar taranıyor!', 'success');

                // 4️⃣ POLLİNG BAŞLAT - Fiyat güncellemesi için
                if (newId) {
                    startPricePolling(newId);
                }
            } else {
                // Hata durumunda skeleton'u kaldır
                const skeleton = document.querySelector('.skeleton-card');
                if (skeleton) skeleton.remove();
                throw new Error(result?.error || 'API hatası');
            }

        } catch (error) {
            console.error('❌ Wishlist oluşturma hatası:', error);
            // Skeleton'u kaldır
            const skeleton = document.querySelector('.skeleton-card');
            if (skeleton) skeleton.remove();
            showToast(`❌ Hata: ${error.message}`, 'error');
        } finally {
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    console.log('✅ New Plan Form initialized');
}

/**
 * Toast bildirimi göster
 */
function showToast(message, type = 'info') {
    // Mevcut toast varsa kaldır
    const existing = document.querySelector('.sita-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `sita-toast fixed bottom-28 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-xl z-[100] text-white font-medium text-sm transition-all duration-300 ${type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
            'bg-slate-800'
        }`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Animasyonla kaldır
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// EVENT HANDLERS
// ============================================

function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.screen));
    });

    // Back button
    document.getElementById('btn-back-planner')?.addEventListener('click', () => {
        document.getElementById('screen-planner-detail').classList.add('hidden');
        document.getElementById('screen-planner').classList.remove('hidden');
        // Hide combined action bar when leaving detail screen
        const bar = document.getElementById('pd-action-bar');
        if (bar) bar.style.display = 'none';
    });

    // FAB
    document.getElementById('fab-new-plan')?.addEventListener('click', () => {
        document.getElementById('modal-new-plan').classList.remove('hidden');
        // Modal açıldığında autocomplete'i init et (her seferinde çalışır)
        setTimeout(() => initDestinationAutocomplete(), 100);
        // Budget input'u sıfırla
        resetBudgetInput();
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
        document.getElementById('modal-new-plan').classList.add('hidden');
    });

    // Profile Wishlist
    document.getElementById('btn-open-wishlist')?.addEventListener('click', openWishlistModal);
    document.getElementById('btn-close-wishlist')?.addEventListener('click', () => {
        document.getElementById('modal-wishlist').classList.add('hidden');
    });

    // Form New Plan
    initNewPlanForm();

    // Map filter buttons
    document.querySelectorAll('.map-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => loadMapPins(btn.dataset.filter));
    });

    // My location button
    document.getElementById('btn-my-location')?.addEventListener('click', centerOnUser);

    // Navigate button
    document.getElementById('btn-navigate')?.addEventListener('click', () => {
        if (state.selectedPin) {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${state.selectedPin.lat},${state.selectedPin.lng}`;
            window.open(url, '_blank');
        }
    });

    // Discovery Filters
    document.querySelectorAll('.discovery-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filterType = e.currentTarget.dataset.filter;
            requestDiscoveryFilter(filterType, e.currentTarget);
        });
    });

    // Add Pin Modal
    const addPinBtn = document.querySelector('#screen-map header button:last-child');
    addPinBtn?.addEventListener('click', openAddPinModal);

    document.getElementById('btn-close-add-pin')?.addEventListener('click', closeAddPinModal);

    // Add Pin Form
    document.getElementById('form-add-pin')?.addEventListener('submit', handleAddPin);

    // Add Event Form
    document.getElementById('form-add-event')?.addEventListener('submit', handleAddEvent);
    document.getElementById('btn-close-add-event')?.addEventListener('click', closeAddEventModal);

    // Media buttons in Add Pin modal
    document.getElementById('btn-add-image')?.addEventListener('click', () => {
        document.getElementById('image-preview-container').classList.toggle('hidden');
    });

    document.getElementById('btn-add-audio')?.addEventListener('click', () => {
        document.getElementById('audio-preview-container').classList.toggle('hidden');
    });
}

function initNewPlanForm() {
    // ═══ DATE TYPE TOGGLE (olive-green pill) ═══
    const radios = document.getElementsByName('date_type');
    const fieldFixed = document.getElementById('field-fixed-dates');
    const fieldFlexible = document.getElementById('field-flexible-dates');
    const dtFlexible = document.getElementById('dt-flexible');
    const dtFixed = document.getElementById('dt-fixed');

    function updateDateTypeStyle() {
        const isFlexible = document.querySelector('input[name="date_type"][value="flexible"]').checked;
        if (isFlexible) {
            dtFlexible.style.background = '#7a8a2e';
            dtFlexible.style.borderColor = '#7a8a2e';
            dtFlexible.style.color = '#fff';
            dtFixed.style.background = 'transparent';
            dtFixed.style.borderColor = '#d1d5c8';
            dtFixed.style.color = '#6b7280';
        } else {
            dtFixed.style.background = '#7a8a2e';
            dtFixed.style.borderColor = '#7a8a2e';
            dtFixed.style.color = '#fff';
            dtFlexible.style.background = 'transparent';
            dtFlexible.style.borderColor = '#d1d5c8';
            dtFlexible.style.color = '#6b7280';
        }
    }

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'fixed') {
                fieldFixed.style.display = 'block';
                fieldFlexible.style.display = 'none';
            } else {
                fieldFixed.style.display = 'none';
                fieldFlexible.style.display = 'block';
            }
            updateDateTypeStyle();
        });
    });
    updateDateTypeStyle();

    // ═══ DURATION CHIP STYLING ═══
    function updateDurationStyle() {
        document.querySelectorAll('input[name="flexible_duration"]').forEach(radio => {
            const div = radio.nextElementSibling;
            if (radio.checked) {
                div.style.borderColor = '#7a8a2e';
                div.style.background = '#7a8a2e';
                div.style.color = '#fff';
            } else {
                div.style.borderColor = '#d1d5c8';
                div.style.background = 'transparent';
                div.style.color = '#6b7280';
            }
        });
    }
    document.querySelectorAll('input[name="flexible_duration"]').forEach(radio => {
        radio.addEventListener('change', updateDurationStyle);
    });
    updateDurationStyle();

    // ═══ MONTH SUBTITLE ═══
    const monthSubtitles = {
        jan: 'Kış tatili fırsatları', feb: 'Sevgililer günü kaçamağı',
        mar: 'Bahar başlangıcı', apr: 'Bahar tatili için harika',
        may: 'Erken yaz keyfi', jun: 'Yaz tatili başlıyor',
        jul: 'Yaz tatili için ideal', aug: 'Tatil sezonu zirvede',
        sep: 'Sonbahar huzuru', oct: 'Kültür turları sezonu',
        nov: 'Düşük sezon fırsatları', dec: 'Yılbaşı kaçamağı'
    };
    document.getElementById('flexible-month-select')?.addEventListener('change', (e) => {
        const sub = document.getElementById('month-subtitle');
        if (sub) sub.textContent = monthSubtitles[e.target.value] || '';
    });

    // ═══ POPULAR ROUTE CHIPS ═══
    document.querySelectorAll('.popular-route-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const dest = chip.dataset.dest;
            const destInput = document.getElementById('destination-input');
            if (destInput && dest) {
                destInput.value = dest;
                destInput.focus();
                destInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    // ═══ CLOSE BUTTON ═══
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
        document.getElementById('modal-new-plan').classList.add('hidden');
    });

    // ═══ SUBMIT ═══
    document.getElementById('form-new-plan')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Planlanıyor... 🤖';
        btn.disabled = true;
        btn.style.opacity = '0.7';

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const payload = {
            trip_name: `${data.origin} - ${data.destination} Trip`,
            origin: data.origin,
            destination: data.destination,
            currency: 'TRY',
            date_type: data.date_type,
            budget: data.budget ? parseFloat(data.budget) : null,
            target_price: data.budget ? parseFloat(data.budget) : 10000,
            user_id: localStorage.getItem('auth_user_id') || null
        };

        if (data.date_type === 'fixed' && data.start_date) {
            payload.start_date = data.start_date;
            payload.end_date = data.end_date;
        }

        if (data.date_type === 'flexible') {
            payload.flexible_month = data.flexible_month;
            payload.flexible_duration = data.flexible_duration;
        }

        const result = await api.addWishlist(payload);

        if (result && (result._id || result.id || result.success || result.wishlist_id)) {
            document.getElementById('modal-new-plan').classList.add('hidden');
            navigate('planner');
            showToast('✅ Plan oluşturuldu! Fiyatlar taranıyor...', 'success');
            _awardXPWithFeedback(20, 'wishlist_added');
            await loadWishlists();
            e.target.reset();
            updateDateTypeStyle();
            updateDurationStyle();
        } else {
            showToast('❌ Plan oluşturulamadı. Tekrar dene.', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    });
}

async function openWishlistModal() {
    document.getElementById('modal-wishlist').classList.remove('hidden');
    const container = document.getElementById('wishlist-items-container');
    container.innerHTML = '<div class="text-center py-4">Yükleniyor...</div>';

    const wishlists = await api.getWishlists();

    if (!wishlists || wishlists.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-500 py-4">Listeniz boş 🦗</p>';
        return;
    }

    container.innerHTML = wishlists.map(w => `
        <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-200 overflow-hidden">
                    <img src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=100" class="w-full h-full object-cover">
                </div>
                <div>
                    <p class="font-bold text-slate-800 text-sm">${w.trip_name}</p>
                    <p class="text-xs text-slate-500">${w.destination} • ${formatPrice(w.target_price, w.currency)}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="navigate('planner'); openPlannerDetail('${w._id || w.id}')" class="p-2 bg-blue-100 text-blue-600 rounded-lg">
                    <i data-lucide="eye" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteWishlist('${w._id || w.id}')" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `).join('');

    lucide?.createIcons();
}

window.deleteWishlist = async (id) => {
    if (!confirm('Bu planı silmek istediğinize emin misiniz?')) return;

    const res = await api.deleteWishlist(id);
    if (res.ok) {
        openWishlistModal(); // Refresh modal
        loadWishlists(); // Refresh main list
        loadPassport(); // Refresh profile stats
        _awardXPWithFeedback(-20, 'wishlist_deleted');
    } else {
        alert('Silme işlemi başarısız');
    }
};

// ============================================
// AUTHENTICATION SYSTEM
// ============================================

let authMode = 'login'; // 'login' or 'register'

function showAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

function hideAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    // Clear form
    const form = document.getElementById('auth-form');
    if (form) form.reset();
    const err = document.getElementById('auth-error');
    if (err) err.classList.add('hidden');
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';

    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const btnText = document.getElementById('auth-btn-text');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const usernameGroup = document.getElementById('auth-username-group');
    const err = document.getElementById('auth-error');

    if (err) err.classList.add('hidden');

    if (authMode === 'register') {
        title.textContent = 'Kayıt Ol';
        subtitle.textContent = 'Yeni hesap oluştur ve maceraya başla';
        btnText.textContent = 'Kayıt Ol';
        toggleText.textContent = 'Zaten hesabın var mı?';
        toggleBtn.textContent = 'Giriş Yap';
        usernameGroup.classList.remove('hidden');
    } else {
        title.textContent = 'Giriş Yap';
        subtitle.textContent = 'Hesabına giriş yap ve keşfetmeye başla';
        btnText.textContent = 'Giriş Yap';
        toggleText.textContent = 'Hesabın yok mu?';
        toggleBtn.textContent = 'Kayıt Ol';
        usernameGroup.classList.add('hidden');
    }
}

async function handleAuthSubmit() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    const btnText = document.getElementById('auth-btn-text');
    const submitBtn = document.getElementById('auth-submit');

    if (!email || !password) {
        errEl.textContent = 'Lütfen tüm alanları doldurun';
        errEl.classList.remove('hidden');
        return;
    }

    if (password.length < 6) {
        errEl.textContent = 'Şifre en az 6 karakter olmalı';
        errEl.classList.remove('hidden');
        return;
    }

    const originalText = btnText.textContent;
    btnText.textContent = 'Yükleniyor...';
    submitBtn.disabled = true;
    errEl.classList.add('hidden');

    try {
        let endpoint, body;

        if (authMode === 'register') {
            const username = document.getElementById('auth-username').value.trim();
            if (!username || username.length < 3) {
                errEl.textContent = 'Kullanıcı adı en az 3 karakter olmalı';
                errEl.classList.remove('hidden');
                return;
            }
            endpoint = '/auth/register';
            body = { username, email, password };
        } else {
            endpoint = '/auth/login';
            body = { email, password };
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'İşlem başarısız oldu');
        }

        const data = await response.json();

        // Save token and user info
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_user_id', data.user_id);
        localStorage.setItem('auth_username', data.username);
        localStorage.setItem('auth_email', data.email);
        localStorage.setItem('auth_raw_pass', password);
        sessionStorage.setItem('pax_creator_id', data.user_id);

        console.log('Auth success:', data.username);

        // Hide modal and load app
        hideAuthModal();
        syncProfileFromAuth();
        loadWishlists();
        navigate('planner');

        if (typeof showToast === 'function') {
            showToast(`Hos geldin, ${data.username}!`, 'success');
        }

    } catch (error) {
        console.error('Auth error:', error);
        errEl.textContent = error.message || 'Bir hata olustu';
        errEl.classList.remove('hidden');
    } finally {
        btnText.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function logout() {
    // Clear user-scoped PAX caches before removing user id
    const _uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id');
    if (_uid) {
        localStorage.removeItem(`pax_upcoming_events_${_uid}`);
        localStorage.removeItem(`pax_join_requests_${_uid}`);
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_email');
    sessionStorage.removeItem('pax_creator_id');

    // Reset state
    state.wishlists = [];
    state.pins = [];
    state.profile = null;

    if (typeof showToast === 'function') {
        showToast('Basariyla cikis yapildi', 'success');
    }

    // Show login modal
    showAuthModal();
}

function isAuthenticated() {
    return !!localStorage.getItem('auth_token');
}

function syncProfileFromAuth() {
    const username = localStorage.getItem('auth_username');
    const email = localStorage.getItem('auth_email');

    const profileName = document.getElementById('profile-username');
    if (profileName && username) profileName.textContent = `@${username}`;
    const profileHeaderTitle = document.querySelector('#screen-profile header h1');
    if (profileHeaderTitle && username) profileHeaderTitle.textContent = username;

    const profileEmail = document.querySelector('.profile-email');
    if (profileEmail && email) {
        profileEmail.textContent = email;
    }
}

// Expose logout globally
window.logout = logout;
window.handleAuthSubmit = handleAuthSubmit;
window.toggleAuthMode = toggleAuthMode;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('SITA Smart Planner v3.0 - Auth Edition');
    console.log(`Backend: ${API_BASE}`);

    if (typeof lucide !== 'undefined') lucide.createIcons();

    initEventListeners();       // initNewPlanForm() zaten içinde çağrılıyor
    setupDiscoveryListeners();
    initDestinationAutocomplete();
    setupDeleteModalListeners();

    // AUTH GATE: Check if user is logged in
    if (!isAuthenticated()) {
        showAuthModal();
    } else {
        syncProfileFromAuth();
        navigate('planner');
    }
});

// ___ ACCOUNT SETTINGS ___
function openAccountSettings() {
    const screen = document.getElementById('screen-account-settings');
    if (!screen) return;
    const username = state.passport?.username || localStorage.getItem('auth_username') || '-';
    const email    = localStorage.getItem('auth_email') || '-';
    document.getElementById('as-username').textContent = username;
    document.getElementById('as-email').textContent    = email;
    document.getElementById('as-password').textContent = '••••••••';
    document.getElementById('as-password').dataset.real = localStorage.getItem('auth_raw_pass') || '';
    document.getElementById('as-toggle-pass').textContent = 'Göster';
    screen.classList.remove('hidden');
}

function closeAccountSettings() {
    document.getElementById('screen-account-settings')?.classList.add('hidden');
}

function togglePasswordVisibility() {
    const el  = document.getElementById('as-password');
    const btn = document.getElementById('as-toggle-pass');
    if (!el) return;
    if (el.textContent.startsWith('•')) {
        el.textContent = el.dataset.real || '(şifre kayıtlı değil)';
        btn.textContent = 'Gizle';
    } else {
        el.textContent = '••••••••';
        btn.textContent = 'Göster';
    }
}

window.openAccountSettings       = openAccountSettings;
window.closeAccountSettings      = closeAccountSettings;
window.togglePasswordVisibility  = togglePasswordVisibility;

// ─── PIN OWNER ACTIONS ───────────────────────────────────────

async function deleteCurrentPin() {
    const pin = state.selectedPin;
    if (!pin) return;
    const uid = localStorage.getItem('auth_user_id') || '';
    if (!uid) { showToast('Oturum bulunamadı', 'error'); return; }

    if (!confirm('Bu pini silmek istediğinden emin misin?')) return;

    const pinId = pin._id || pin.id;
    const result = await api.deleteMapPin(pinId, uid);
    if (result && result.success) {
        deselectPin();
        showToast('Pin silindi ✓', 'success');
        // Force fresh fetch — reset cache so loadMapPins re-fetches from DB
        state.allPins = [];
        state.pins    = [];
        await loadMapPins();   // re-fetches DB, rebuilds markers, re-renders nearby
    } else {
        showToast('Silme işlemi başarısız', 'error');
    }
}

function openEditPin() {
    const pin = state.selectedPin;
    if (!pin) return;
    document.getElementById('edit-pin-title').value       = pin.title || '';
    document.getElementById('edit-pin-category').value    = pin.type  || 'cafe';
    document.getElementById('edit-pin-description').value = pin.description || '';
    document.getElementById('edit-pin-secret').checked    = !!pin.is_secret_spot;
    document.getElementById('modal-edit-pin').classList.remove('hidden');
    lucide?.createIcons();
}

function closeEditPinModal() {
    document.getElementById('modal-edit-pin').classList.add('hidden');
}

async function handleEditPin(e) {
    e.preventDefault();
    const pin = state.selectedPin;
    if (!pin) return;

    const uid   = localStorage.getItem('auth_user_id') || '';
    const pinId = pin._id || pin.id;
    const btn   = document.getElementById('btn-submit-edit-pin');

    const data = {
        title:          document.getElementById('edit-pin-title').value.trim(),
        type:           document.getElementById('edit-pin-category').value,
        description:    document.getElementById('edit-pin-description').value.trim() || null,
        is_secret_spot: document.getElementById('edit-pin-secret').checked,
    };

    btn.disabled    = true;
    btn.textContent = '⏳ Kaydediliyor...';

    const result = await api.updateMapPin(pinId, uid, data);
    btn.disabled    = false;
    btn.textContent = '✅ Değişiklikleri Kaydet';

    if (result) {
        // Update local state
        Object.assign(pin, data);
        const idx = (state.pins    || []).findIndex(p => (p._id || p.id) === pinId);
        if (idx !== -1) Object.assign(state.pins[idx], data);
        const idx2 = (state.allPins || []).findIndex(p => (p._id || p.id) === pinId);
        if (idx2 !== -1) Object.assign(state.allPins[idx2], data);

        closeEditPinModal();
        selectPin(result);  // re-render detail card with fresh data
        showToast('Pin güncellendi', 'success');
    } else {
        showToast('Güncelleme başarısız', 'error');
    }
}

window.deleteCurrentPin  = deleteCurrentPin;
window.openEditPin       = openEditPin;
window.closeEditPinModal = closeEditPinModal;
window.handleEditPin     = handleEditPin;

// ─── PIN STAR RATING ─────────────────────────────────────────

function _renderStars(active) {
    document.querySelectorAll('#pin-stars .star-btn').forEach(btn => {
        const s = parseInt(btn.dataset.star);
        btn.textContent = s <= active ? '★' : '☆';
        btn.classList.toggle('active', s <= active);
    });
}

async function ratePin(stars) {
    const pin = state.selectedPin;
    if (!pin) return;
    const pinId = pin._id || pin.id;
    const uid   = localStorage.getItem('auth_user_id') || '';
    if (!uid) { showToast('Önce giriş yapmalısın', 'error'); return; }

    _renderStars(stars);

    const res = await fetch(`${API_BASE}/map/pins/${pinId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('auth_token') || '') },
        body: JSON.stringify({ user_id: uid, rating: stars })
    });

    if (res.ok) {
        const data = await res.json();
        localStorage.setItem('pin_rating_' + pinId, stars);
        const badge = document.getElementById('pin-my-rating');
        if (badge) { badge.textContent = stars + '★ verdin'; badge.classList.remove('hidden'); }
        // Update displayed rating
        const subtitleEl = document.getElementById('pin-detail-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = subtitleEl.textContent.replace(/⭐ [0-9.]+/, '⭐ ' + data.rating);
        }
        showToast(stars + ' yıldız verildi ✓', 'success');
    } else {
        showToast('Puan verilemedi', 'error');
    }
}

window.ratePin = ratePin;


// ============================================================
// AI ITİNERARY MODAL
// ============================================================

const _AI_STORAGE_KEY = 'pax_last_ai_itinerary';

function openAiItineraryModal() {
    const modal = document.getElementById('modal-ai-itinerary');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Restore last plan if available
    try {
        const saved = localStorage.getItem(_AI_STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            _renderAiItinerary(data, false); // false = no image reload (already cached)
            const cityInput = document.getElementById('ai-city-input');
            const daysSelect = document.getElementById('ai-days-select');
            if (cityInput)  cityInput.value  = data.city  || '';
            if (daysSelect) daysSelect.value = String(data.days || 3);
        }
    } catch (_) {}

    setTimeout(() => document.getElementById('ai-city-input')?.focus(), 100);
}

function closeAiItineraryModal() {
    document.getElementById('modal-ai-itinerary')?.classList.add('hidden');
}

async function fetchAiItinerary() {
    const cityInput = document.getElementById('ai-city-input');
    const daysSelect = document.getElementById('ai-days-select');
    const resultEl  = document.getElementById('ai-itinerary-result');
    const btn       = document.getElementById('ai-fetch-btn');
    if (!cityInput || !daysSelect || !resultEl) return;

    const city = cityInput.value.trim();
    const days = parseInt(daysSelect.value, 10);
    if (!city) { cityInput.focus(); showToast('Şehir adını gir', 'warning'); return; }

    btn.disabled = true;
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

    try {
        const result = await api.generateItinerary(city, days);
        if (!result.success) throw new Error(result.error || 'Hata');

        // Persist to localStorage
        try { localStorage.setItem(_AI_STORAGE_KEY, JSON.stringify(result.data)); } catch (_) {}

        await _renderAiItinerary(result.data, true);
        _renderAiPlannerPreview(result.data);
    } catch (err) {
        resultEl.innerHTML = `<p style="font-size:13px;color:#f87171;padding:32px 0;text-align:center;">Hata: ${_escapeHtml(String(err.message || err))}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Planla';
    }
}

/**
 * Fetches city image URL from backend image service (with curated Unsplash fallback).
 */
async function _fetchCityImg(query, w = 800) {
    try {
        const res = await fetch(`${API_BASE}/image/city?q=${encodeURIComponent(query)}&w=${w}`);
        if (res.ok) {
            const d = await res.json();
            return d?.url || null;
        }
    } catch (_) {}
    return null;
}

async function _renderAiItinerary(data, loadImages = true) {
    const resultEl = document.getElementById('ai-itinerary-result');
    if (!resultEl) return;
    const items = data.itinerary || [];
    if (!items.length) {
        resultEl.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:32px 0;text-align:center;">Plan verisi alınamadı.</p>';
        return;
    }

    // Placeholder gradient colors per day (cycles)
    const GRAD = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#a18cd1,#fbc2eb)',
        'linear-gradient(135deg,#ffecd2,#fcb69f)',
        'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
    ];

    // Build skeleton cards first (instant render)
    resultEl.innerHTML = `
        <p style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;color:#1a1a1a;margin:4px 0 16px;">
            ${_escapeHtml(data.city)} &nbsp;·&nbsp; <span style="color:#A3C14A;">${data.days} Günlük Plan</span>
        </p>
        <div style="display:flex;flex-direction:column;gap:14px;padding-bottom:8px;">
            ${items.map((day, i) => `
            <div id="ai-day-card-${day.day}" style="
                border-radius:24px;
                overflow:hidden;
                box-shadow:0 4px 20px rgba(0,0,0,0.08);
                background:#fff;
                font-family:'Plus Jakarta Sans',sans-serif;
            ">
                <!-- Location hero (CSS background-image, gradient placeholder) -->
                <div id="ai-hero-${day.day}" style="
                    position:relative;height:170px;
                    background:${GRAD[i % GRAD.length]};
                    background-size:cover;background-position:center;
                    display:flex;align-items:flex-end;
                ">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.62) 0%,transparent 55%);"></div>
                    <div style="position:relative;z-index:1;padding:12px 14px;width:100%;display:flex;align-items:flex-end;justify-content:space-between;">
                        <span style="background:#A3C14A;color:#fff;font-size:11px;font-weight:800;letter-spacing:.5px;border-radius:999px;padding:3px 12px;">GÜN ${day.day}</span>
                        <span style="color:rgba(255,255,255,0.85);font-size:20px;line-height:1;">📍</span>
                    </div>
                </div>
                <!-- Location text -->
                <div style="padding:12px 16px 10px;">
                    <p style="font-weight:700;font-size:14px;color:#1a1a1a;margin:0 0 3px;">${_escapeHtml(day.location || '')}</p>
                    <p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0;">${_escapeHtml(day.loc_desc || '')}</p>
                </div>
                <!-- Food hero (CSS background-image, gradient placeholder) -->
                <div id="ai-food-hero-${day.day}" style="
                    position:relative;height:90px;
                    background:${GRAD[(i+4) % GRAD.length]};
                    background-size:cover;background-position:center;
                    display:flex;align-items:flex-end;
                ">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%);"></div>
                    <div style="position:relative;z-index:1;padding:8px 14px 10px;display:flex;align-items:center;gap:6px;">
                        <span style="font-size:16px;line-height:1;">🍽️</span>
                        <div>
                            <p style="font-weight:700;font-size:13px;color:#fff;margin:0;text-shadow:0 1px 3px rgba(0,0,0,0.5);">${_escapeHtml(day.food || '')}</p>
                            <p style="font-size:11px;color:rgba(255,255,255,0.85);margin:1px 0 0;line-height:1.4;text-shadow:0 1px 3px rgba(0,0,0,0.4);">${_escapeHtml(day.food_desc || '')}</p>
                        </div>
                    </div>
                </div>
            </div>`).join('')}
        </div>`;

    // Async load hero images via CSS background-image (location + food)
    if (!loadImages) return;
    for (const day of items) {
        // Location image → set as CSS background-image on hero div
        _fetchCityImg(day.loc_img_query || `${data.city} ${day.location}`, 800).then(url => {
            if (!url) return;
            const div = document.getElementById(`ai-hero-${day.day}`);
            if (div) div.style.backgroundImage = `linear-gradient(to top,rgba(0,0,0,0.62) 0%,transparent 55%), url(${url})`;
        });
        // Food image → set as CSS background-image on food hero div
        if (day.food) {
            _fetchCityImg(day.food_img_query || `${day.food} food dish`, 600).then(url => {
                if (!url) return;
                const fdiv = document.getElementById(`ai-food-hero-${day.day}`);
                if (fdiv) fdiv.style.backgroundImage = `linear-gradient(to top,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.2) 65%,transparent 100%), url(${url})`;
            });
        }
    }
}

/**
 * Shows a compact "Son AI Planım" card in the Planner screen
 * so the user sees it without re-opening the modal.
 */
function _renderAiPlannerPreview(data) {
    let previewEl = document.getElementById('ai-plan-preview-section');
    if (!previewEl) {
        // Insert before PAX events section
        const paxSection = document.getElementById('pax-events-planner-section');
        if (!paxSection?.parentNode) return;
        previewEl = document.createElement('div');
        previewEl.id = 'ai-plan-preview-section';
        paxSection.parentNode.insertBefore(previewEl, paxSection);
    }

    const first = data.itinerary?.[0];
    previewEl.innerHTML = `
        <div style="
            background:#FDFCF8;
            border:1.5px solid #e8f4d0;
            border-radius:20px;
            padding:14px 16px 16px;
            margin-bottom:8px;
            font-family:'Plus Jakarta Sans',sans-serif;
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:18px;">✨</span>
                    <div>
                        <p style="font-weight:800;font-size:13px;color:#1a1a1a;margin:0;">Son AI Planı</p>
                        <p style="font-size:11px;color:#A3C14A;font-weight:700;margin:0;">${_escapeHtml(data.city)} · ${data.days} Gün</p>
                    </div>
                </div>
                <button onclick="openAiItineraryModal()"
                    style="background:#A3C14A;color:#fff;font-size:11px;font-weight:700;border:none;border-radius:999px;padding:5px 14px;cursor:pointer;">
                    Görüntüle
                </button>
            </div>
            ${first ? `
            <div style="background:#fff;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start;">
                <span style="font-size:16px;margin-top:1px;">📍</span>
                <div>
                    <p style="font-size:12px;font-weight:700;color:#1a1a1a;margin:0 0 2px;">Gün 1 — ${_escapeHtml(first.location || '')}</p>
                    <p style="font-size:11px;color:#6b7280;margin:0;line-height:1.4;">${_escapeHtml((first.loc_desc || '').slice(0, 80))}${(first.loc_desc || '').length > 80 ? '…' : ''}</p>
                </div>
            </div>` : ''}
        </div>`;
}

// On planner screen load, restore AI preview from localStorage if exists
function _maybeRestoreAiPreview() {
    try {
        const saved = localStorage.getItem(_AI_STORAGE_KEY);
        if (saved) _renderAiPlannerPreview(JSON.parse(saved));
    } catch (_) {}
}

window.openAiItineraryModal  = openAiItineraryModal;
window.closeAiItineraryModal = closeAiItineraryModal;
window.fetchAiItinerary      = fetchAiItinerary;
