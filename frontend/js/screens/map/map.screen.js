/**
 * PLANİGO - Map Screen Module
 * Full port of all map functions from app.js
 */

import { API_BASE, DEFAULT_LOCATION, DEFAULT_ZOOM } from '../../config.js';
import { getSlice, setSlice, emit } from '../../core/store.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml } from '../../utils/dom.js';
import { calcDistanceKm } from '../../utils/geo.js';
import { hasJoinRequest, saveJoinRequest, savePaxEvent, removePaxEvent, joinRequestsKey } from '../../utils/storage.js';
import { getAuthHeaders } from '../../services/auth.service.js';
import * as mapSvc from '../../services/map.service.js';
import * as eventSvc from '../../services/event.service.js';
import { loadNotifications } from '../../components/notifications.js';
import { openPublicProfile } from '../../components/public-profile.js';

// ── Module-level state ────────────────────────────────────────────────────────
let _map = null;
let _userMarker = null;
let _userLocation = null;
let _watchId = null;
let _pins = [];
let _allPins = [];
let _mapMarkers = [];
let _allEvents = [];
let _eventMarkers = [];
let _selectedPin = null;
let _pendingPinImageBase64 = null;
let _pendingMapCoords = null;
let _manageEventId = null;
let _manageRequests = [];
let _notifPollInterval = null;

// ── Expose globals for legacy inline handlers ──────────────────────────────────
window.selectPinById       = selectPinById;
window.openPublicProfile   = openPublicProfile;
window.togglePinDescription = togglePinDescription;
window.closePinFullDetail  = closePinFullDetail;
window.openAddPinModal     = openAddPinModal;
window.closeAddPinModal    = closeAddPinModal;
window.previewPinImage     = previewPinImage;
window.clearPinImage       = clearPinImage;
window.openMapAddChoice    = openMapAddChoice;
window.closeMapAddChoice   = closeMapAddChoice;
window.chooseAddPin        = chooseAddPin;
window.chooseAddEvent      = chooseAddEvent;
window.openAddEventModal   = openAddEventModal;
window.closeAddEventModal  = closeAddEventModal;
window.showJoinForm        = showJoinForm;
window.cancelJoinForm      = cancelJoinForm;
window.handleJoinEvent     = handleJoinEvent;
window.openManageEvent     = openManageEvent;
window.closeManageEvent    = closeManageEvent;
window.approveRequest      = approveRequest;
window.rejectRequest       = rejectRequest;
window.awardEventStamps    = awardEventStamps;
window.deleteCurrentPin    = deleteCurrentPin;
window.openEditPin         = openEditPin;
window.closeEditPinModal   = closeEditPinModal;
window.handleEditPin       = handleEditPin;
window.ratePin             = ratePin;
window.centerOnUser        = centerOnUser;

// ── Exported init ─────────────────────────────────────────────────────────────

export async function initializeMap() {
    console.log('🗺️ Initializing Leaflet Map...');

    const loadingEl = document.getElementById('map-loading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    if (!_map) {
        _map = L.map('leaflet-map', {
            zoomControl: false,
            attributionControl: false
        }).setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng], DEFAULT_ZOOM);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(_map);

        _map.on('click', () => { deselectPin(); deselectEvent(); });
        setupMapLongPress();
    }

    // rAF: browser layout tamamlandıktan sonra Leaflet boyutu okusun — senkron çağrı stale boyut alır
    requestAnimationFrame(() => _map?.invalidateSize({ animate: false }));

    await Promise.all([getUserLocation(), loadMapPins()]);
    // _userLocation artık kesinlikle set edildi → yakındakiler filtresini yeniden uygula
    renderNearbyVibes(_pins);
    loadEventPins();

    if (!_notifPollInterval) _startNotifPolling();

    setupMapFilterListeners();

    if (loadingEl) loadingEl.classList.add('hidden');

    setTimeout(() => _map?.invalidateSize({ animate: false }), 300);
}

// ── Geolocation ───────────────────────────────────────────────────────────────

async function getUserLocation() {
    // Capacitor native platform → use Capacitor Geolocation plugin for proper permission dialog
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        return _getLocationNative();
    }
    return _getLocationWeb();
}

async function _getLocationNative() {
    try {
        // Capacitor injects plugins into window.Capacitor.Plugins — no CDN import needed
        const Geolocation = window.Capacitor.Plugins.Geolocation;
        if (!Geolocation) throw new Error('Geolocation plugin not found');

        // Request permission — shows Android system dialog
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            _showLocationError();
            return DEFAULT_LOCATION;
        }

        // Get initial position
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _userLocation = loc;
        if (_map) _map.setView([loc.lat, loc.lng], 15);
        addUserMarker(loc);
        _updateLocationStatus(true);

        // Watch for updates
        _watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true },
            (position, err) => {
                if (err || !position) return;
                const updated = { lat: position.coords.latitude, lng: position.coords.longitude };
                _userLocation = updated;
                addUserMarker(updated);
            }
        );

        return loc;
    } catch (e) {
        console.warn('[Capacitor Geolocation] error:', e);
        _showLocationError();
        return DEFAULT_LOCATION;
    }
}

function _getLocationWeb() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            _showLocationError();
            resolve(DEFAULT_LOCATION);
            return;
        }

        if (_watchId != null) {
            navigator.geolocation.clearWatch(_watchId);
            _watchId = null;
        }

        let firstUpdate = true;

        _watchId = navigator.geolocation.watchPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                _userLocation = loc;
                _updateLocationStatus(true);

                if (firstUpdate) {
                    if (_map) _map.setView([loc.lat, loc.lng], 15);
                    addUserMarker(loc);
                    firstUpdate = false;
                    resolve(loc);
                } else {
                    addUserMarker(loc);
                }
            },
            (error) => {
                console.warn('⚠️ Geolocation error:', error.message);
                const errorBanner = document.getElementById('location-error');
                if (errorBanner) {
                    errorBanner.textContent = '📍 Konum izni verilmedi, seni İstanbul merkezli başlatıyorum.';
                    errorBanner.classList.remove('hidden');
                    setTimeout(() => errorBanner.classList.add('hidden'), 5000);
                }
                _userLocation = DEFAULT_LOCATION;
                if (firstUpdate) {
                    firstUpdate = false;
                    resolve(DEFAULT_LOCATION);
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    });
}

function _updateLocationStatus(granted) {
    const statusEl = document.getElementById('location-status');
    if (!statusEl) return;
    if (granted) {
        statusEl.textContent = '📍 Konumunuz';
        statusEl.className = 'text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium';
    }
}

function _showLocationError() {
    const errorEl = document.getElementById('location-error');
    if (errorEl) errorEl.classList.remove('hidden');
    const statusEl = document.getElementById('location-status');
    if (statusEl) {
        statusEl.textContent = '📍 Istanbul';
        statusEl.className = 'text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full font-medium';
    }
}

function addUserMarker(loc) {
    if (_userMarker) { _userMarker.setLatLng([loc.lat, loc.lng]); return; }

    const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-dot-inner"></div><div class="user-dot-pulse"></div>',
        iconSize: [40, 40], iconAnchor: [20, 20]
    });

    _userMarker = L.marker([loc.lat, loc.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(_map)
        .bindPopup('<div class="pin-popup"><p class="pin-popup-title">📍 Ben Buradayım</p><p class="pin-popup-subtitle">Anlık Konumunuz</p></div>');
}

export function cleanupMap() {
    if (_watchId != null) {
        navigator.geolocation.clearWatch(_watchId);
        _watchId = null;
    }
}

export function centerOnUser() {
    if (_userLocation && _map) {
        _map.setView([_userLocation.lat, _userLocation.lng], DEFAULT_ZOOM);
    } else {
        getUserLocation().then(loc => { if (_map) _map.setView([loc.lat, loc.lng], DEFAULT_ZOOM); });
    }
}

// ── Pin Loading & Rendering ────────────────────────────────────────────────────

export async function loadMapPins(filter = 'all') {
    try {
        document.querySelectorAll('.map-filter-pill').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) btn.classList.add('active');
        });

        if (!_allPins || _allPins.length === 0) {
            const { data: pins } = await mapSvc.getMapPins();
            const seen = new Set();
            _allPins = (pins || []).filter(p => {
                const id = p._id || p.id;
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        }

        const filteredPins = filter === 'all' ? [..._allPins] : _allPins.filter(p => p.type === filter);
        _pins = filteredPins;

        const pinsCountEl = document.getElementById('pins-count');
        if (pinsCountEl) pinsCountEl.textContent = `${_pins.length} pin bulundu`;

        _mapMarkers.forEach(m => m.remove());
        _mapMarkers = [];

        _pins.forEach(pin => {
            const marker = createPinMarker(pin);
            _mapMarkers.push(marker);
        });

        if (_pins.length > 0 && filter !== 'all') {
            const bounds = L.latLngBounds(_pins.map(p => [p.lat, p.lng]));
            _map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
        }

        deselectPin();
        lucide?.createIcons();
    } catch (error) {
        console.error('❌ Error loading map pins:', error);
    } finally {
        document.getElementById('map-loading')?.classList.add('hidden');
    }
}

function createPinMarker(pin) {
    const pinColors = {
        'cafe': 'pin-cafe', 'cheap-eats': 'pin-cheap-eats', 'viewpoints': 'pin-viewpoints',
        'hidden-gems': 'pin-hidden-gems', 'restaurant': 'pin-restaurant', 'nightlife': 'pin-nightlife',
        'shopping': 'pin-shopping', 'historical': 'pin-historical', 'nature': 'pin-nature', 'attraction': 'pin-attraction'
    };
    const colorClass = pinColors[pin.type] || 'pin-cafe';
    const emoji = getPinEmoji(pin.type);
    const secretClass = pin.is_secret_spot ? 'secret-spot' : '';

    const icon = L.divIcon({
        className: `custom-pin-marker ${colorClass} ${secretClass}`,
        html: `<span>${emoji}</span>`,
        iconSize: [36, 36], iconAnchor: [18, 18]
    });

    const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(_map)
        .on('click', (e) => { L.DomEvent.stopPropagation(e); selectPin(pin); });

    marker._pinId = pin._id || pin.id || '';
    marker.bindTooltip(`<span class="pin-tooltip">${emoji} ${pin.title}</span>`, {
        direction: 'top', offset: [0, -20], opacity: 1, sticky: false
    });

    return marker;
}

function selectPin(pin) {
    if (_selectedPin && _selectedPin._id === pin._id) { viewPinFullDetail(); return; }
    _selectedPin = pin;

    document.getElementById('nearby-vibes-default')?.classList.add('hidden');
    const detailCard = document.getElementById('pin-detail-card');
    if (detailCard) {
        detailCard.classList.remove('hidden');
        detailCard.style.transform = 'translateY(20px)';
        detailCard.style.opacity = '0';
        requestAnimationFrame(() => {
            detailCard.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
            detailCard.style.transform = 'translateY(0)';
            detailCard.style.opacity = '1';
        });
    }

    const emoji = getPinEmoji(pin.type);
    document.getElementById('pin-detail-emoji').textContent = emoji;
    document.getElementById('pin-detail-title').textContent = pin.title;
    document.getElementById('pin-detail-subtitle').textContent =
        `${pin.place_type || pin.type || ''} • ⭐ ${pin.rating || 4.5} • ${pin.price_range || ''}`;
    document.getElementById('pin-detail-friends').textContent =
        `📍 ${pin.friends_visited || 0} arkadaş ziyaret etti`;

    const badgeEl = document.getElementById('pin-detail-badge');
    if (pin.is_secret_spot) {
        badgeEl.textContent = '✨ GİZLİ';
        badgeEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0';
    } else {
        badgeEl.textContent = (pin.place_type || pin.type || 'SPOT').toUpperCase();
        badgeEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage/10 text-sage shrink-0';
    }

    const vibesEl = document.getElementById('pin-detail-vibes');
    const vibes = pin.vibes || pin.tags || [];
    vibesEl.innerHTML = vibes.length > 0
        ? vibes.map(v => `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${getVibeColors(v)}">${escapeHtml(v)}</span>`).join('')
        : '';

    const descSection = document.getElementById('pin-detail-desc-section');
    const descText = document.getElementById('pin-detail-description');
    if (pin.description && pin.description.trim() !== '') {
        descSection.classList.remove('hidden');
        descText.textContent = pin.description;
        descText.classList.add('hidden');
    } else {
        descSection.classList.add('hidden');
    }

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

    if (_map) _map.panTo([pin.lat, pin.lng]);

    const myUid = localStorage.getItem('auth_user_id') || '';
    const isOwner = !!(myUid && pin.user_id && pin.user_id === myUid);
    document.getElementById('pin-owner-actions')?.classList.toggle('hidden', !isOwner);

    const starRow = document.getElementById('pin-star-rating');
    if (starRow) {
        const showRating = !!myUid && !isOwner;
        starRow.classList.toggle('hidden', !showRating);
        if (showRating) {
            const stored = localStorage.getItem('pin_rating_' + (pin._id || pin.id));
            _renderStars(stored ? parseInt(stored) : 0);
            const badge = document.getElementById('pin-my-rating');
            if (badge) { badge.textContent = stored ? stored + '★ verdin' : ''; badge.classList.toggle('hidden', !stored); }
        }
    }

    lucide?.createIcons();
}

export function togglePinDescription() {
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

export function deselectPin() {
    _selectedPin = null;
    document.getElementById('pin-detail-card')?.classList.add('hidden');
    document.getElementById('nearby-vibes-default')?.classList.remove('hidden');
}

export function viewPinFullDetail() {
    const pin = _selectedPin;
    if (!pin) return;

    const modal = document.getElementById('modal-pin-full-detail');
    const imageWrap = document.getElementById('pfd-image-wrap');
    const noImage = document.getElementById('pfd-no-image');
    const emoji = getPinEmoji(pin.type);

    if (pin.image_url) {
        document.getElementById('pfd-image').src = pin.image_url;
        document.getElementById('pfd-badge').textContent = (pin.place_type || pin.type || '').toUpperCase();
        imageWrap.classList.remove('hidden');
        noImage.classList.add('hidden');
    } else {
        document.getElementById('pfd-emoji-large').textContent = emoji;
        imageWrap.classList.add('hidden');
        noImage.classList.remove('hidden');
    }

    const typeLabel = (pin.place_type || pin.type || '').replace(/-/g, ' ');
    document.getElementById('pfd-title').textContent = pin.title;
    document.getElementById('pfd-badge-body').textContent = typeLabel.toUpperCase();
    document.getElementById('pfd-rating').textContent = '⭐ ' + (pin.rating || 4.5);
    document.getElementById('pfd-type').textContent = typeLabel;
    document.getElementById('pfd-price').textContent = pin.price_range ? '• ' + pin.price_range : '';
    document.getElementById('pfd-friends').textContent = '📍 ' + (pin.friends_visited || 0) + ' arkadaş ziyaret etti';

    const descWrap = document.getElementById('pfd-desc-wrap');
    if (pin.description && pin.description.trim()) {
        document.getElementById('pfd-description').textContent = pin.description;
        descWrap.classList.remove('hidden');
    } else { descWrap.classList.add('hidden'); }

    const tipWrap = document.getElementById('pfd-tip-wrap');
    if (pin.user_tips && pin.user_tips.length > 0) {
        const tip = pin.user_tips[0];
        document.getElementById('pfd-tip-avatar').src = 'https://i.pravatar.cc/40?u=' + tip.username;
        document.getElementById('pfd-tip-user').textContent = tip.username;
        document.getElementById('pfd-tip-text').textContent = '"' + tip.content + '"';
        tipWrap.classList.remove('hidden');
    } else { tipWrap.classList.add('hidden'); }

    modal.classList.remove('hidden');
    lucide?.createIcons();
}

export function closePinFullDetail() {
    document.getElementById('modal-pin-full-detail')?.classList.add('hidden');
}

function selectPinById(pinId) {
    const pin = (_pins || []).find(p => p._id === pinId);
    if (pin) selectPin(pin);
}

function getPinEmoji(type) {
    const emojis = {
        'cafe': '☕', 'cheap-eats': '🍜', 'viewpoints': '🏔️',
        'hidden-gems': '💎', 'restaurant': '🍽️', 'nightlife': '🌙'
    };
    return emojis[type] || '📍';
}

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

function renderNearbyVibes(pins) {
    const container = document.getElementById('nearby-vibes-scroll');
    if (!container) return;

    if (!pins || pins.length === 0) {
        container.innerHTML = '<div class="flex items-center justify-center w-full py-4"><p class="text-xs text-muted">Bu kategoride pin bulunamadı</p></div>';
        return;
    }

    const userLat = _userLocation?.lat;
    const userLng = _userLocation?.lng;

    const NEARBY_MAX_KM = 50;

    const pinsWithDist = pins
        .map(pin => {
            let distKm = null;
            if (userLat != null && userLng != null && pin.lat && pin.lng) {
                distKm = calcDistanceKm(userLat, userLng, pin.lat, pin.lng);
            }
            return { ...pin, _distKm: distKm };
        })
        .filter(pin => userLat == null || pin._distKm === null || pin._distKm <= NEARBY_MAX_KM)
        .sort((a, b) => (a._distKm ?? 999) - (b._distKm ?? 999))
        .slice(0, 10);

    container.innerHTML = pinsWithDist.map(pin => {
        const emoji = getPinEmoji(pin.type);
        const vibes = (pin.vibes || pin.tags || []).slice(0, 1);
        const vibesHTML = vibes.map(v => `<span class="text-[10px] ${getVibeColors(v)} px-1.5 rounded-full">${escapeHtml(v)}</span>`).join('');
        let distBadge = '';
        if (pin._distKm != null) {
            const distStr = pin._distKm < 1 ? `${Math.round(pin._distKm * 1000)} m` : `${pin._distKm.toFixed(1)} km`;
            distBadge = `<span class="nearby-distance-badge">${escapeHtml(distStr)}</span>`;
        }
        const safeId    = escapeHtml(String(pin._id || ''));
        const safeTitle = escapeHtml(pin.title || '');
        const safeType  = escapeHtml((pin.place_type || pin.type || 'Spot').replace('-', ' '));
        const safeRating = escapeHtml(String(pin.rating || 4.5));
        return `
            <div data-pin-id="${safeId}" class="nearby-pin-item" style="cursor:pointer;">
                <div class="w-12 h-12 rounded-xl bg-sage/10 flex items-center justify-center text-xl shrink-0">${emoji}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-1">
                        <h3 class="font-bold text-main text-sm truncate">${safeTitle}</h3>
                        <div class="bg-sage/10 text-sage text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">⭐ ${safeRating}</div>
                    </div>
                    <p class="text-xs text-muted truncate mt-0.5">${safeType}</p>
                    <div class="flex items-center gap-1.5 mt-1 flex-wrap">${distBadge}${vibesHTML}</div>
                </div>
            </div>`;
    }).join('');
    // onclick'i güvenli şekilde addEventListener ile bağla
    container.querySelectorAll('[data-pin-id]').forEach(el => {
        el.addEventListener('click', () => selectPinById(el.dataset.pinId));
    });
}

function setupMapFilterListeners() {
    const pills = document.querySelectorAll('.map-filter-pill');
    pills.forEach(pill => {
        if (pill.dataset.listenerAttached) return;
        pill.dataset.listenerAttached = 'true';
        pill.addEventListener('click', (e) => {
            const filterType = e.currentTarget.dataset.filter;
            pills.forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');
            if (filterType === 'events') {
                (_mapMarkers || []).forEach(m => m.remove());
                _mapMarkers = [];
                renderNearbyVibes([]);
                loadEventPins();
            } else {
                loadMapPins(filterType).then(() => renderNearbyVibes(_pins));
            }
        });
    });
}

function setupMapLongPress() {
    if (!_map) return;
    let pressTimer = null;
    let pressCoords = null;

    _map.on('mousedown', (e) => {
        pressCoords = e.latlng;
        pressTimer = setTimeout(() => openMapAddChoice(pressCoords.lat, pressCoords.lng), 600);
    });
    _map.on('mouseup',   () => clearTimeout(pressTimer));
    _map.on('mousemove', () => clearTimeout(pressTimer));
    _map.on('dragstart', () => clearTimeout(pressTimer));

    _map.on('touchstart', (e) => {
        if (e.originalEvent.touches.length === 1) {
            pressCoords = _map.mouseEventToLatLng(e.originalEvent.touches[0]);
            pressTimer = setTimeout(() => openMapAddChoice(pressCoords.lat, pressCoords.lng), 600);
        }
    });
    _map.on('touchend',  () => clearTimeout(pressTimer));
    _map.on('touchmove', () => clearTimeout(pressTimer));
}

// ── Add Pin Modal ─────────────────────────────────────────────────────────────

function openAddPinModal(lat, lng) {
    const center = _map ? _map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    document.getElementById('new-pin-lat').value = lat || center.lat;
    document.getElementById('new-pin-lng').value = lng || center.lng;
    document.getElementById('form-add-pin').reset();
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('modal-add-pin').classList.remove('hidden');
    lucide?.createIcons();
}

export function closeAddPinModal() {
    document.getElementById('modal-add-pin').classList.add('hidden');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
}

export async function handleAddPin(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('btn-submit-pin');

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Kaydediliyor...';

    const pinData = {
        lat:            parseFloat(formData.get('lat'))    || DEFAULT_LOCATION.lat,
        lng:            parseFloat(formData.get('lng'))    || DEFAULT_LOCATION.lng,
        title:          formData.get('title'),
        type:           formData.get('category'),
        description:    formData.get('description')        || null,
        is_secret_spot: formData.get('is_secret') === 'on',
        image_url:      _pendingPinImageBase64             || null,
        audio_note_url: null,
        user_id:        localStorage.getItem('auth_user_id') || ''
    };

    try {
        const { data: result } = await mapSvc.createMapPin(pinData);
        if (result) {
            _pendingPinImageBase64 = null;
            closeAddPinModal();

            const newPin = { ...pinData, _id: result._id || result.id, ...result, rating: result.rating || null, vibes: [], user_tips: [] };
            if (_allPins) _allPins.push(newPin);
            _pins = [..._allPins];

            const marker = createPinMarker(newPin);
            _mapMarkers.push(marker);

            const el = marker.getElement ? marker.getElement() : marker._icon;
            if (el) {
                el.style.animation = 'stamp-zink 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
                setTimeout(() => { el.style.animation = ''; }, 600);
            }

            if (_map) _map.setView([pinData.lat, pinData.lng], 15, { animate: true });
            renderNearbyVibes(_pins);
            import('../../utils/confetti.js').then(m => m.showConfetti?.());
        }
    } catch (error) {
        console.error('❌ Error creating pin:', error);
        alert('Pin eklenirken bir hata oluştu.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '📍 Pin\'i Kaydet';
    }
}

export function previewPinImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        _pendingPinImageBase64 = e.target.result;
        document.getElementById('pin-image-preview').src = e.target.result;
        document.getElementById('image-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

export function clearPinImage() {
    _pendingPinImageBase64 = null;
    document.getElementById('pin-image-input').value = '';
    document.getElementById('image-preview-container').classList.add('hidden');
}

// ── Map Add Choice ─────────────────────────────────────────────────────────────

export function openMapAddChoice(lat, lng) {
    const center = _map ? _map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    _pendingMapCoords = { lat: lat ?? center.lat, lng: lng ?? center.lng };
    document.getElementById('map-add-choice-backdrop').classList.add('show');
    document.getElementById('map-add-choice-card').classList.add('show');
}

export function closeMapAddChoice() {
    document.getElementById('map-add-choice-backdrop').classList.remove('show');
    document.getElementById('map-add-choice-card').classList.remove('show');
}

export function chooseAddPin() { closeMapAddChoice(); openAddPinModal(_pendingMapCoords?.lat, _pendingMapCoords?.lng); }
export function chooseAddEvent() { closeMapAddChoice(); openAddEventModal(_pendingMapCoords?.lat, _pendingMapCoords?.lng); }

// ── Event Constants ───────────────────────────────────────────────────────────

const EVENT_TYPE_EMOJI = {
    social: '👥', sport: '🏃', food: '🍽️', culture: '🎨',
    travel: '✈️', music: '🎵', adventure: '🧗'
};
const EVENT_TYPE_LABEL = {
    social: 'Buluşma', sport: 'Spor', food: 'Yemek', culture: 'Kültür',
    travel: 'Seyahat', music: 'Müzik', adventure: 'Macera'
};

// ── Add Event Modal ───────────────────────────────────────────────────────────

function openAddEventModal(lat, lng) {
    const center = _map ? _map.getCenter() : { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    document.getElementById('new-event-lat').value = lat ?? center.lat;
    document.getElementById('new-event-lng').value = lng ?? center.lng;
    if (!sessionStorage.getItem('pax_creator_id')) {
        sessionStorage.setItem('pax_creator_id', 'user_' + Date.now());
    }
    document.getElementById('new-event-creator-id').value = sessionStorage.getItem('pax_creator_id');
    document.getElementById('form-add-event').reset();
    document.getElementById('new-event-creator-id').value = sessionStorage.getItem('pax_creator_id');
    document.getElementById('modal-add-event').classList.remove('hidden');
    lucide?.createIcons();
}

export function closeAddEventModal() {
    document.getElementById('modal-add-event').classList.add('hidden');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
}

export async function handleAddEvent(e) {
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
        const { data: result } = await eventSvc.createEventPin(eventData);
        if (result) {
            closeAddEventModal();
            showToast('Etkinlik oluşturuldu! 🌟', 'success');
            savePaxEvent(result, 'creator');
            const marker = createEventPinMarker(result);
            _eventMarkers.push(marker);
            _allEvents.push(result);
            _map.setView([result.lat, result.lng], 15, { animate: true });
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

// ── Event Pins ─────────────────────────────────────────────────────────────────

function createEventPinMarker(event) {
    const emoji = EVENT_TYPE_EMOJI[event.event_type] || '🌟';
    const icon = L.divIcon({
        className: '',
        html: `<div class="event-pin-marker">${emoji}</div>`,
        iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -24]
    });

    const marker = L.marker([event.lat, event.lng], { icon, zIndexOffset: 500 })
        .addTo(_map)
        .on('click', (e) => { L.DomEvent.stopPropagation(e); selectEvent(event); });

    marker.bindTooltip(`<span class="pin-tooltip">${emoji} ${event.title}</span>`, {
        direction: 'top', offset: [0, -20], opacity: 1, sticky: false
    });

    return marker;
}

export async function loadEventPins() {
    try {
        const { data } = await eventSvc.getEventPins();
        const events = Array.isArray(data) ? data : (data?.events || []);

        (_eventMarkers || []).forEach(m => m.remove());
        _eventMarkers = [];
        _allEvents = [];

        events.forEach(ev => {
            const marker = createEventPinMarker(ev);
            _eventMarkers.push(marker);
        });

        _allEvents = events;
        console.log(`🌟 ${events.length} event pin yüklendi`);
    } catch (err) {
        console.error('Event pins yüklenemedi:', err);
    }
}

function selectEvent(event) {
    const emoji   = EVENT_TYPE_EMOJI[event.event_type] || '🌟';
    const label   = EVENT_TYPE_LABEL[event.event_type] || 'Etkinlik';
    const eventId = event._id || event.id || '';

    const dateStr = event.event_date
        ? new Date(event.event_date).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    const filled   = event.participant_count || 0;
    const max      = event.max_participants  || 10;
    const pct      = Math.min(Math.round((filled / max) * 100), 100);
    const initials = (event.creator_name || '?').trim().charAt(0).toUpperCase();

    document.getElementById('evd-type-badge').textContent   = `${emoji} ${label}`;
    document.getElementById('evd-title').textContent        = event.title;
    document.getElementById('evd-creator-name').textContent = event.creator_name || 'Anonim';
    document.getElementById('evd-avatar').textContent       = initials;
    document.getElementById('evd-date').textContent         = dateStr;
    document.getElementById('evd-participants').textContent = `${filled} / ${max}`;
    document.getElementById('evd-fill-bar').style.width     = `${pct}%`;
    document.getElementById('evd-fill-label').textContent   = `${pct}%`;
    document.getElementById('evd-description').textContent  = event.description || '—';

    const locText = [event.address, event.city].filter(Boolean).join(', ');
    const locCell = document.getElementById('evd-location-cell');
    if (locText) {
        document.getElementById('evd-location').textContent = locText;
        locCell.classList.remove('hidden');
    } else {
        locCell.classList.add('hidden');
    }

    const myId      = sessionStorage.getItem('pax_creator_id') || '';
    const isCreator = !!(myId && myId === event.creator_id);

    document.getElementById('evd-join-section').classList.toggle('hidden', isCreator);
    document.getElementById('evd-creator-section').classList.toggle('hidden', !isCreator);

    if (!isCreator) {
        const wantBtn = document.getElementById('btn-want-join');
        const alreadySent = hasJoinRequest(eventId);
        wantBtn.disabled    = alreadySent;
        wantBtn.textContent = alreadySent ? '✅ İstek Gönderildi' : 'Katılmak İste ✨';
        document.getElementById('evd-join-form').classList.add('hidden');
        document.getElementById('join-message-text').value = '';
        document.getElementById('btn-send-join-request').dataset.eventId = eventId;
        document.getElementById('btn-send-join-request').disabled = false;
    } else {
        const manageBtn = document.getElementById('btn-manage-event');
        if (manageBtn) manageBtn.dataset.eventId = eventId;

        eventSvc.getJoinRequests(eventId)
           .then(({ data: reqs }) => {
               const pending = Array.isArray(reqs) ? reqs.filter(r => r.status === 'pending').length : 0;
               const el = document.getElementById('evd-pending-count');
               if (el) el.textContent = pending ? `${pending} bekleyen istek var` : 'Bekleyen istek yok';
           }).catch(() => {});
    }

    document.getElementById('modal-event-detail').classList.remove('hidden');
    lucide?.createIcons();
}

export function deselectEvent() { document.getElementById('modal-event-detail')?.classList.add('hidden'); }

export function showJoinForm() {
    document.getElementById('btn-want-join').classList.add('hidden');
    document.getElementById('evd-join-form').classList.remove('hidden');
    document.getElementById('join-message-text').focus();
}

export function cancelJoinForm() {
    document.getElementById('evd-join-form').classList.add('hidden');
    document.getElementById('btn-want-join').classList.remove('hidden');
}

export async function handleJoinEvent() {
    const sendBtn = document.getElementById('btn-send-join-request');
    const eventId = sendBtn?.dataset.eventId;
    if (!eventId) return;

    const userId = sessionStorage.getItem('pax_creator_id') || ('user_' + Date.now());
    sessionStorage.setItem('pax_creator_id', userId);

    const message = document.getElementById('join-message-text')?.value?.trim() || null;

    sendBtn.disabled    = true;
    sendBtn.textContent = '⏳ Gönderiliyor…';

    const currentEvent = _allEvents?.find(e => (e._id || e.id) === eventId) || null;

    try {
        const resp = await fetch(`${API_BASE}/map/events/${encodeURIComponent(eventId)}/join`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ user_id: userId, message })
        });

        const isAlreadySent = resp.status === 409;
        const isSuccess = resp.ok || isAlreadySent;

        if (isSuccess) {
            showToast(isAlreadySent ? 'Bu etkinlik için zaten istek gönderdin ✅' : 'Katılma isteği gönderildi! 🎉', 'success');
            saveJoinRequest(eventId);
            if (currentEvent) savePaxEvent({ ...currentEvent, _pax_status: 'pending' }, 'participant');
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

// ── Manage Event (Creator) ─────────────────────────────────────────────────────

export async function openManageEvent() {
    const manageBtn = document.getElementById('btn-manage-event');
    _manageEventId  = manageBtn?.dataset.eventId || null;
    if (!_manageEventId) return;

    const creatorId = sessionStorage.getItem('pax_creator_id') || '';

    document.getElementById('manage-requests-list').innerHTML = '<p class="text-sm text-muted text-center py-6">⏳ Yükleniyor…</p>';
    document.getElementById('manage-req-count').textContent = '';
    document.getElementById('modal-manage-event').classList.remove('hidden');
    lucide?.createIcons();

    try {
        const { data: raw } = await eventSvc.getJoinRequests(_manageEventId);
        _manageRequests = Array.isArray(raw) ? raw : [];
    } catch {
        _manageRequests = [];
    }

    renderJoinRequests(_manageRequests);

    const awardFooter = document.getElementById('manage-award-footer');
    if (awardFooter && _allEvents) {
        const ev = _allEvents.find(e => (e._id || e.id) === _manageEventId);
        const eventPast = ev?.event_date && new Date(ev.event_date) < new Date();
        awardFooter.classList.toggle('hidden', !eventPast);
    }
}

export function closeManageEvent() { document.getElementById('modal-manage-event').classList.add('hidden'); }

function renderJoinRequests(requests) {
    const pending  = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const rejected = requests.filter(r => r.status === 'rejected');

    document.getElementById('manage-req-count').textContent = `${requests.length} istek · ${pending.length} bekliyor`;

    const container = document.getElementById('manage-requests-list');

    if (requests.length === 0) {
        container.innerHTML = '<div class="text-center py-10"><p class="text-3xl mb-2">📭</p><p class="text-sm text-muted">Henüz katılma isteği yok.</p></div>';
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
    // data attribute + addEventListener — onclick injection'a karşı güvenli
    container.querySelectorAll('[data-req-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.reqAction;
            const id     = btn.dataset.reqId;
            if (action === 'approve') approveRequest(id);
            else if (action === 'reject') rejectRequest(id);
        });
    });
    container.querySelectorAll('[data-profile-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            openPublicProfile(btn.dataset.profileId, btn.dataset.profileName);
        });
    });
    lucide?.createIcons();
}

function _buildRequestCard(req, showActions) {
    const reqId    = req._id || req.id || '';
    const initials = (req.user_name || '?').trim().charAt(0).toUpperCase();
    const safeName = escapeHtml(req.user_name || 'Anonim Kullanıcı');
    const safeId   = escapeHtml(req.user_id  || '');

    const statusBadge = {
        pending:  '<span class="req-status req-status--pending">Bekliyor</span>',
        approved: '<span class="req-status req-status--approved">Onaylandı</span>',
        rejected: '<span class="req-status req-status--rejected">Reddedildi</span>',
    }[req.status] || '';

    const msgHtml = req.message ? `<p class="text-xs text-muted mt-1 italic line-clamp-2">"${escapeHtml(req.message)}"</p>` : '';
    const actionsHtml = showActions ? `
        <div class="flex gap-2 mt-2.5">
            <button data-req-action="approve" data-req-id="${escapeHtml(reqId)}" class="btn-approve">✓ Onayla</button>
            <button data-req-action="reject"  data-req-id="${escapeHtml(reqId)}" class="btn-reject">✗ Reddet</button>
        </div>` : '';

    return `
        <div class="req-card" id="req-card-${escapeHtml(reqId)}">
            <div class="flex items-start gap-3">
                <button class="req-avatar" data-profile-id="${safeId}" data-profile-name="${safeName}">${initials}</button>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <button class="text-sm font-bold text-main hover:text-[#A3C14A] transition-colors truncate text-left"
                            data-profile-id="${safeId}" data-profile-name="${safeName}">${safeName}</button>
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
        const { data: result } = await eventSvc.updateRequestStatus(_manageEventId, requestId, newStatus);
        if (result) {
            const idx = _manageRequests.findIndex(r => (r._id || r.id) === requestId);
            if (idx > -1) _manageRequests[idx].status = newStatus;
            renderJoinRequests(_manageRequests);

            const label = newStatus === 'approved' ? 'Onaylandı ✅' : 'Reddedildi ❌';
            showToast(`İstek ${label}`, newStatus === 'approved' ? 'success' : 'info');

            if (newStatus === 'approved' && _manageEventId && _allEvents) {
                const ev = _allEvents.find(e => (e._id || e.id) === _manageEventId);
                if (ev) savePaxEvent(ev, 'participant');
            }

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

export async function awardEventStamps() {
    const creatorId = sessionStorage.getItem('pax_creator_id') || '';
    if (!_manageEventId || !creatorId) { showToast('Bilgi eksik 😔', 'error'); return; }

    const btn = document.querySelector('#manage-award-footer button');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Damgalar veriliyor…'; }

    try {
        const { data: result } = await eventSvc.awardEventStamps(_manageEventId, creatorId);
        const count = result?.stamps_awarded ?? 0;
        showToast(`${count} katılımcıya etkinlik damgası verildi! 🏅`, 'success');
        document.getElementById('manage-award-footer')?.classList.add('hidden');
    } catch {
        showToast('Damgalar verilemedi 😔', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Etkinlik Bitti — Damgaları Ver'; }
    }
}

// ── Notification polling ───────────────────────────────────────────────────────

function _startNotifPolling() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
    loadNotifications();
    clearInterval(_notifPollInterval);
    _notifPollInterval = setInterval(loadNotifications, 30_000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadNotifications();
    });
}

// ── Pin Owner Actions ──────────────────────────────────────────────────────────

export function deleteCurrentPin() {
    if (!_selectedPin) return;
    const uid = localStorage.getItem('auth_user_id') || '';
    if (!uid) { showToast('Oturum bulunamadı', 'error'); return; }

    const modal     = document.getElementById('modal-confirm-delete');
    const btnConfirm = document.getElementById('btn-confirm-delete');
    const btnCancel  = document.getElementById('btn-cancel-delete');

    modal.querySelector('h3').textContent = 'Pini Sil?';
    modal.querySelector('p').innerHTML   = 'Bu pini silmek istediğinden emin misin?<br><span class="text-red-400 text-xs">(Bu işlem geri alınamaz)</span>';
    modal.classList.remove('hidden');

    const cleanup = () => { modal.classList.add('hidden'); btnConfirm.onclick = null; btnCancel.onclick = null; };

    btnCancel.onclick = cleanup;
    btnConfirm.onclick = async () => {
        cleanup();
        const pinId = _selectedPin._id || _selectedPin.id;
        const { data: result } = await mapSvc.deleteMapPin(pinId, uid);
        if (result?.success) {
            const markerIdx = _mapMarkers.findIndex(m => m._pinId === pinId);
            if (markerIdx !== -1) { _mapMarkers[markerIdx].remove(); _mapMarkers.splice(markerIdx, 1); }
            _allPins = _allPins.filter(p => (p._id || p.id) !== pinId);
            _pins    = _pins.filter(p => (p._id || p.id) !== pinId);
            deselectPin();
            showToast('Pin silindi ✓', 'success');
        } else {
            showToast('Silme işlemi başarısız', 'error');
        }
    };
}

export function openEditPin() {
    const pin = _selectedPin;
    if (!pin) return;
    document.getElementById('edit-pin-title').value       = pin.title || '';
    document.getElementById('edit-pin-category').value    = pin.type  || 'cafe';
    document.getElementById('edit-pin-description').value = pin.description || '';
    document.getElementById('edit-pin-secret').checked    = !!pin.is_secret_spot;
    document.getElementById('modal-edit-pin').classList.remove('hidden');
    lucide?.createIcons();
}

export function closeEditPinModal() {
    document.getElementById('modal-edit-pin').classList.add('hidden');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
}

export async function handleEditPin(e) {
    e.preventDefault();
    const pin = _selectedPin;
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

    const { data: result } = await mapSvc.updateMapPin(pinId, uid, data);
    btn.disabled    = false;
    btn.textContent = '✅ Değişiklikleri Kaydet';

    if (result) {
        Object.assign(pin, data);
        const idx = (_pins    || []).findIndex(p => (p._id || p.id) === pinId);
        if (idx !== -1) Object.assign(_pins[idx], data);
        const idx2 = (_allPins || []).findIndex(p => (p._id || p.id) === pinId);
        if (idx2 !== -1) Object.assign(_allPins[idx2], data);

        closeEditPinModal();
        selectPin(result);
        showToast('Pin güncellendi', 'success');
    } else {
        showToast('Güncelleme başarısız', 'error');
    }
}

// ── Star Rating ────────────────────────────────────────────────────────────────

function _renderStars(active) {
    document.querySelectorAll('#pin-stars .star-btn').forEach(btn => {
        const s = parseInt(btn.dataset.star);
        btn.textContent = s <= active ? '★' : '☆';
        btn.classList.toggle('active', s <= active);
    });
}

export async function ratePin(stars) {
    const pin = _selectedPin;
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
        const subtitleEl = document.getElementById('pin-detail-subtitle');
        if (subtitleEl) subtitleEl.textContent = subtitleEl.textContent.replace(/⭐ [0-9.]+/, '⭐ ' + data.rating);
        showToast(stars + ' yıldız verildi ✓', 'success');
    } else {
        showToast('Puan verilemedi', 'error');
    }
}
