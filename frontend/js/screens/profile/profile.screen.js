/**
 * PLANİGO - Profile Screen Module
 *
 * Handles passport, stats, badge grid, digital passport stamps,
 * world map (Leaflet), XP feedback, and profile sync from auth.
 * Extracted from app.js lines 4221-5384.
 */

import { getPassport, addVisitedCountry, removeVisitedCountry, awardXP } from '../../services/profile.service.js';
import { getWishlists } from '../../services/planner.service.js';
import { getSlice, setSlice } from '../../core/store.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml, scheduleIconRefresh } from '../../utils/dom.js';
import { formatCurrency } from '../../utils/format.js';
import { API_BASE } from '../../config.js';

// Signal to app.js that the real module is active — planner screen checks this.
window._profileModuleActive = true;

// ─── Module-level map state ────────────────────────────────────────────────────
let _worldMap        = null;   // Fullscreen interactive map (Leaflet)
let _fullscreenMap   = null;   // Alias — kept for API compatibility
let _miniMap         = null;   // Profile card static mini-map
let _geoJsonLayer    = null;   // GeoJSON layer on fullscreen map
let _miniGeoJsonLayer = null;  // GeoJSON layer on mini-map
let _visitedCountries = new Set(); // ISO alpha-3 or alpha-2 codes, uppercase
const _pinMarkers     = new Map(); // countryCode → L.Marker

// ─── GeoJSON source ───────────────────────────────────────────────────────────
const WORLD_GEOJSON_URL =
    'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';

// ─── Country stamp mapping: ISO alpha-3 → Turkish stamp filename ──────────────
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

/** Build a /public/assets/stamps/ URL for the given ISO alpha-3 code. */
function _stampSrc(code) {
    const file = COUNTRY_STAMP_MAP[code?.toUpperCase()];
    return file ? `/public/assets/stamps/${encodeURIComponent(file)}` : null;
}

// ─── Badge constants ───────────────────────────────────────────────────────────
const BADGE_META = {
    euro_traveler:  { icon: '🇪🇺', name: 'Euro Traveler',  desc: '5 Avrupa Birliği ülkesi gez'                },
    schengen_ghost: { icon: '👻',  name: 'Schengen Ghost', desc: 'Vizesiz 5 ülke gez'                         },
    photo_genic:    { icon: '📸',  name: 'Photo Genic',    desc: 'Haritaya 5 farklı pin bırak'                },
    city_guide:     { icon: '🗺',   name: 'City Guide',     desc: 'Tek bir şehre 5+ pin ekle'                  },
    early_bird:     { icon: '🐦',  name: 'Early Bird',     desc: "PAX'ın ilk 5000 kullanıcısından biri"       },
    passport_full:  { icon: '📒',  name: 'Passport Full',  desc: '50+ pasaport damgası topla'                 },
};

const BADGE_ORDER = [
    'euro_traveler', 'schengen_ghost',
    'photo_genic',   'city_guide',
    'early_bird',    'passport_full',
];

// =============================================================================
// PUBLIC EXPORTS
// =============================================================================

/**
 * Load the user's passport from the backend and render the profile screen.
 */
export async function loadPassport() {
    setSlice('ui', { loading: { ...getSlice('ui').loading, profile: true } });

    const { data: passport, error } = await getPassport();

    setSlice('ui', { loading: { ...getSlice('ui').loading, profile: false } });

    if (error) {
        showToast('Profil yüklenemedi', 'error');
        return;
    }

    // Pre-populate visitedCountries Set from backend data
    if (passport && passport.visited_countries) {
        _visitedCountries.clear();
        passport.visited_countries.forEach(vc => {
            const code = typeof vc === 'string' ? vc : vc.country_code;
            if (code) _visitedCountries.add(code.toUpperCase());
        });
    }

    setSlice('profile', { passport });
    renderProfile(passport);
    scheduleIconRefresh();
}

/**
 * Sync profile UI elements from localStorage auth data.
 * Called after login or on app boot.
 */
export function syncProfileFromAuth() {
    const username  = localStorage.getItem('auth_username');
    const email     = localStorage.getItem('auth_email');
    const avatarUrl = localStorage.getItem('auth_avatar_url');

    const profileName = document.getElementById('profile-username');
    if (profileName && username) profileName.textContent = `@${escapeHtml(username)}`;

    const profileHeaderTitle = document.querySelector('#screen-profile header h1');
    if (profileHeaderTitle && username) profileHeaderTitle.textContent = escapeHtml(username);

    const profileEmail = document.querySelector('.profile-email');
    if (profileEmail && email) profileEmail.textContent = escapeHtml(email);

    // Avatar'ı hemen göster — passport yüklenmesini bekleme
    if (username) _renderProfileAvatar(avatarUrl || '', username);
}

/**
 * Render all profile screen sections from a passport object.
 * @param {object} passport - Passport data returned by the backend.
 */
export function renderProfile(passport = {}) {
    const username  = passport.username  || '';
    const avatarUrl = passport.avatar_url || '';
    const bio       = passport.bio        || '';

    // 1. Username — update both @handle and the section header
    const usernameEl = document.getElementById('profile-username');
    if (usernameEl) usernameEl.textContent = username ? `@${escapeHtml(username)}` : '@...';

    const profileHeaderTitle = document.querySelector('#screen-profile header h1');
    if (profileHeaderTitle) profileHeaderTitle.textContent = escapeHtml(username) || 'Profil';

    // 2. Bio
    const bioEl = document.getElementById('profile-bio');
    if (bioEl) bioEl.textContent = bio ? escapeHtml(bio) : '—';

    // 3. Avatar (photo or initials)
    _renderProfileAvatar(avatarUrl, username);

    // 4. Level badge
    const lvlBadge = document.getElementById('profile-level-badge');
    if (lvlBadge) lvlBadge.textContent = `Lvl ${passport.level || 1}`;

    // 5. XP & Level bar (100 XP per level)
    const xp       = passport.xp    || 0;
    const lvl      = passport.level || 1;
    const progress = xp % 100;
    const toNext   = 100 - progress;

    const levelEl = document.getElementById('profile-level');
    if (levelEl) levelEl.textContent = `GEZGİN SEVİYESİ ${lvl}`;

    const xpEl = document.getElementById('profile-xp');
    if (xpEl) xpEl.textContent = `LVL ${lvl + 1} için ${toNext} XP`;

    const xpBar = document.getElementById('profile-xp-bar');
    if (xpBar) xpBar.style.width = `${progress}%`;

    // 6. Badges
    _renderBadges(passport.badges || []);

    // 7. World Map init
    initWorldMap();
    updateVisitedCountryCount();

    // 8. Digital Passport — feed from visited_countries
    renderDigitalPassport(passport);

    // 9. Wishlist
    renderProfileWishlist();

    // 10. Recent Trips
    renderRecentTrips(passport.recent_trips);

    // 11. Money Saved
    const savedEl = document.getElementById('profile-saved');
    if (savedEl) savedEl.textContent = passport.total_saved_formatted || `₺${passport.total_saved || 0}`;
}

/**
 * Initialize the mini-map and fullscreen Leaflet world maps.
 * Fetches GeoJSON once; subsequent calls are no-ops.
 */
export async function initWorldMap() {
    // 1. Mini Map (static visual, no zoom/pan)
    const miniContainer = document.getElementById('mini-world-map');
    if (miniContainer && !_miniMap) {
        _miniMap = L.map('mini-world-map', {
            center: [20, 0],
            zoom: 0.8,
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 10,
        }).addTo(_miniMap);
    }

    // 2. Fullscreen Map (interactive)
    const fullContainer = document.getElementById('fullscreen-map-container');
    if (fullContainer && !_worldMap) {
        const _worldBounds = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
        _worldMap = L.map('fullscreen-map-container', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            zoomControl: false,
            attributionControl: false,
            worldCopyJump: false,
            maxBounds: _worldBounds,
            maxBoundsViscosity: 1.0,
        });

        // Expose via alias for openFullscreenMap invalidateSize call
        _fullscreenMap = _worldMap;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 10,
        }).addTo(_worldMap);
    }

    // 3. Load GeoJSON (once only)
    if (!_geoJsonLayer) {
        try {
            const response = await fetch(WORLD_GEOJSON_URL);
            const data     = await response.json();

            const _style = (feature) => {
                const isVisited = _visitedCountries.has(feature.id);
                return {
                    fillColor:   isVisited ? '#9CAF88' : '#E5E7EB',
                    weight:      1,
                    opacity:     1,
                    color:       '#fff',
                    fillOpacity: isVisited ? 0.8 : 0.5,
                };
            };

            // Fullscreen map layer (interactive)
            if (_worldMap) {
                _geoJsonLayer = L.geoJson(data, {
                    style: _style,
                    onEachFeature: _onEachFeature,
                }).addTo(_worldMap);

                // Add pin markers for already-visited countries
                _geoJsonLayer.eachLayer(l => {
                    const code = l.feature?.id;
                    if (code && _visitedCountries.has(code)) {
                        try {
                            const center = l.getBounds().getCenter();
                            const name   = l.feature?.properties?.name || code;
                            const marker = L.marker(center, {
                                icon: _makePinIcon(_pinColor(code)),
                                zIndexOffset: 500,
                            })
                                .bindTooltip(name, {
                                    permanent: false,
                                    direction: 'top',
                                    className: 'country-pin-tooltip',
                                })
                                .addTo(_worldMap);
                            _pinMarkers.set(code, marker);
                        } catch (_) { /* ignore */ }
                    }
                });
            }

            // Mini map layer (click-to-toggle)
            if (_miniMap) {
                _miniGeoJsonLayer = L.geoJson(data, {
                    style: _style,
                    onEachFeature: _onEachMiniFeature,
                }).addTo(_miniMap);
            }

            updateVisitedCountryCount();

        } catch (err) {
            console.error('[profile] GeoJSON load error:', err);
        }
    }
}

/**
 * Update the "X Ülke" badge and overlay-stats element.
 * @param {number} [count] - Override count (uses _visitedCountries.size by default).
 */
export function updateVisitedCountryCount(count) {
    const n      = count !== undefined ? count : _visitedCountries.size;
    const badge  = document.getElementById('visited-country-badge');
    const overlay = document.getElementById('overlay-stats');
    if (badge)   badge.textContent   = `${n} Ülke`;
    if (overlay) overlay.textContent = `${n} Ülke Ziyaret Edildi`;
}

/**
 * Render the digital passport horizontal scroll strip and expanded grid.
 * @param {object} p - Passport object with a `visited_countries` array.
 * @param {string} [newStampCode] - Country code to highlight as newly added.
 */
export function renderDigitalPassport(p, newStampCode) {
    const container  = document.getElementById('passport-scroll-container');
    const expandGrid = document.getElementById('passport-expanded-grid');
    if (!container) return;

    // Newest first
    const countries = (p.visited_countries || []).slice().reverse();

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

    // Strip'i göster (grid kapalıysa), expanded grid'i gizle
    container.style.display = '';
    container.innerHTML = stampsHTML + addBtnHTML;
    window.lucide?.createIcons();

    if (newStampCode) container.scrollTo({ left: 0, behavior: 'smooth' });

    if (expandGrid) {
        expandGrid.innerHTML = countries.map(vc => _buildStampCard(vc)).join('');
        expandGrid.classList.add('hidden');
    }

    // VIEW ALL toggle
    const viewAllBtn = document.getElementById('passport-view-all');
    if (viewAllBtn) {
        viewAllBtn.style.visibility = countries.length > 0 ? '' : 'hidden';
        viewAllBtn.textContent = 'TÜMÜNÜ GÖR';
        viewAllBtn.onclick = () => {
            if (!expandGrid) return;
            const expanding = expandGrid.classList.contains('hidden');
            // Grid açılırken strip gizle; kapanırken geri getir
            container.style.display = expanding ? 'none' : '';
            expandGrid.classList.toggle('hidden', !expanding);
            viewAllBtn.textContent = expanding ? 'DAHA AZ' : 'TÜMÜNÜ GÖR';
            if (expanding) {
                window.lucide?.createIcons();
                expandGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };
    }
}

/**
 * Open the fullscreen world map overlay.
 */
export function openFullscreenMap() {
    const overlay = document.getElementById('map-fullscreen-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            _worldMap?.invalidateSize();
            window.lucide?.createIcons();
        }, 50);
        setTimeout(() => { _worldMap?.invalidateSize(); }, 400);
    }
}

/**
 * Handle avatar file input change — reads as base64 and PATCHes to backend.
 * @param {Event|HTMLInputElement} input - The file input element or its change event.
 */
export async function handleAvatarUpload(input) {
    // Accept either the raw <input> element or a change Event
    const file = (input instanceof Event ? input.target : input).files?.[0];
    if (!file) return;

    const userId = localStorage.getItem('auth_user_id');
    if (!userId) { showToast('Önce giriş yapmalısın', 'error'); return; }

    if (file.size > 2 * 1024 * 1024) {
        showToast("Fotoğraf 2 MB'dan küçük olmalı", 'error');
        return;
    }

    showToast('Fotoğraf yükleniyor...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;

        // Optimistic update
        const passport = getSlice('profile').passport || {};
        _renderProfileAvatar(dataUrl, passport.username || '');

        try {
            const { getAuthHeaders } = await import('../../services/auth.service.js');
            const resp = await fetch(
                `${API_BASE}/users/${encodeURIComponent(userId)}/profile`,
                {
                    method:  'PATCH',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ avatar_url: dataUrl }),
                }
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            // Persist to store
            const slice = getSlice('profile');
            if (slice.passport) {
                setSlice('profile', { passport: { ...slice.passport, avatar_url: dataUrl } });
            }
            showToast('Profil fotoğrafı güncellendi ✅', 'success');
        } catch (err) {
            showToast('Fotoğraf kaydedilemedi', 'error');
            console.error('[profile] avatar upload error:', err);
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Render the recent trips list.
 * @param {Array} trips - Array of trip objects from passport.recent_trips.
 */
export function renderRecentTrips(trips) {
    const container = document.getElementById('recent-trips');
    if (!container) return;

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
                    <h4 class="font-bold text-[#1a1a1a] text-sm">${escapeHtml(t.destination || t.trip_name || '')}</h4>
                    <p class="text-xs text-[#9ca3af]">${escapeHtml(t.dates || t.date || 'Yakın zamanda')}</p>
                </div>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-300"></i>
        </div>
    `).join('');

    scheduleIconRefresh();
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/** Update the avatar <img> or initials <div> on the profile card. */
function _renderProfileAvatar(avatarUrl, username) {
    const img      = document.getElementById('profile-avatar');
    const initials = document.getElementById('profile-avatar-initials');
    if (!img || !initials) return;

    if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display      = 'block';
        initials.style.display = 'none';
    } else {
        img.src = '';
        img.style.display      = 'none';
        initials.textContent   = (username || '?').slice(0, 2).toUpperCase();
        initials.style.display = 'flex';
    }
}

/** Render the badge grid — unlocked first, then locked. */
function _renderBadges(badges) {
    const grid    = document.getElementById('badge-grid');
    const counter = document.getElementById('badge-unlocked-count');
    if (!grid) return;

    const unlockedMap = {};
    (badges || []).forEach(b => {
        const id = b.id || b;
        unlockedMap[id] = b.unlocked !== false;
    });

    const unlockedCount = BADGE_ORDER.filter(id => unlockedMap[id]).length;
    if (counter) counter.textContent = `${unlockedCount} / ${BADGE_ORDER.length}`;

    // Unlocked first, locked after — preserving relative order within each group
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
                        alt="${escapeHtml(meta.name)}"
                        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                    />
                    <div class="badge-img-fallback" style="display:none;">${meta.icon}</div>
                </div>
                <div class="badge-name">${escapeHtml(meta.name)}</div>
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
            if (isCollapsed) {
                grid.querySelectorAll('.badge-card--hidden').forEach(c => c.classList.remove('badge-card--hidden'));
                viewAllBtn.textContent = 'DAHA AZ';
            } else {
                Array.from(grid.children).slice(3).forEach(c => c.classList.add('badge-card--hidden'));
                viewAllBtn.textContent = 'TÜMÜNÜ GÖR';
            }
        };
    }
}

/**
 * Show a detail modal for a badge.
 * Exposed to global scope so inline onclick handlers in the badge grid can call it.
 */
function _showBadgeModal(badgeId) {
    const meta     = BADGE_META[badgeId] || { icon: '🏅', name: badgeId, desc: '' };
    const passport = getSlice('profile').passport || {};
    const badges   = passport.badges || [];
    const unlockedMap = {};
    badges.forEach(b => { unlockedMap[b.id || b] = b.unlocked !== false; });
    const unlocked = !!unlockedMap[badgeId];

    document.getElementById('badge-detail-modal')?.remove();

    const imgSrc = `/public/assets/badges/${badgeId}.png`;
    const modal  = document.createElement('div');
    modal.id        = 'badge-detail-modal';
    modal.className = 'badge-detail-modal';
    modal.innerHTML = `
        <div class="badge-detail-inner">
            <button class="badge-detail-close" onclick="document.getElementById('badge-detail-modal').remove()">✕</button>
            <div class="badge-detail-img-wrap ${unlocked ? '' : 'badge-detail-locked'}">
                <img src="${imgSrc}" alt="${escapeHtml(meta.name)}" class="badge-detail-img"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                <div class="badge-detail-fallback" style="display:none;">${meta.icon}</div>
            </div>
            <div class="badge-detail-status ${unlocked ? 'badge-detail-status--unlocked' : 'badge-detail-status--locked'}">
                ${unlocked ? '✅ Kazanıldı' : '🔒 Kilitli'}
            </div>
            <div class="badge-detail-name">${escapeHtml(meta.name)}</div>
            <div class="badge-detail-desc">${escapeHtml(meta.desc)}</div>
        </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}
// Make _showBadgeModal available for inline onclick in badge grid HTML
window._showBadgeModal        = _showBadgeModal;
window._awardXPWithFeedback   = _awardXPWithFeedback;

/** Build a single passport stamp card HTML string. */
function _buildStampCard(vc, extra = '') {
    const code    = typeof vc === 'string' ? vc : (vc.country_code || 'XX');
    const name    = typeof vc === 'string' ? vc : (vc.country_name || code);
    const dateStr = vc.visited_at
        ? new Date(vc.visited_at).getFullYear()
        : new Date().getFullYear();
    const src     = _stampSrc(code);
    const imgHtml = src
        ? `<img class="passport-stamp-img"
                src="${src}"
                alt="${escapeHtml(name)}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
    return `
        <div class="passport-stamp-card passport-stamp-real group ${extra}" data-country="${code.toUpperCase()}">
            ${imgHtml}
            <div class="passport-stamp-fallback"${src ? ' style="display:none"' : ''}>
                <span class="text-3xl">🌍</span>
                <span class="text-xs font-bold text-[#A3C14A] mt-1">${escapeHtml(code.toUpperCase())}</span>
            </div>
            <div class="passport-stamp-label">
                <span>${escapeHtml(name)}</span>
                <span class="passport-stamp-year">${dateStr}</span>
            </div>
        </div>`;
}

/**
 * Inject a single new stamp card at the front of the passport scroll container,
 * with an entrance animation.
 */
export function injectPassportStamp(code, name) {
    const container = document.getElementById('passport-scroll-container');
    if (!container) return;

    const vc  = { country_code: code, country_name: name, visited_at: new Date().toISOString() };
    const div = document.createElement('div');
    div.innerHTML = _buildStampCard(vc, 'passport-stamp-new').trim();
    const card = div.firstElementChild;

    const addBtn = container.querySelector('.passport-add-btn');
    if (addBtn) container.insertBefore(card, addBtn);
    else        container.appendChild(card);

    window.lucide?.createIcons();
    container.scrollTo({ left: 0, behavior: 'smooth' });

    // Expanded grid'e de ekle (görünür olsun veya olmasın)
    const expandGrid = document.getElementById('passport-expanded-grid');
    if (expandGrid) {
        const gridDiv = document.createElement('div');
        gridDiv.innerHTML = _buildStampCard(vc).trim();
        expandGrid.insertBefore(gridDiv.firstElementChild, expandGrid.firstChild);
        window.lucide?.createIcons();
    }

    // Buton her zaman görünür olsun (stamp varsa)
    const viewAllBtn = document.getElementById('passport-view-all');
    if (viewAllBtn) viewAllBtn.style.visibility = '';

    setTimeout(() => card.classList.remove('passport-stamp-new'), 3500);
}

/**
 * Show an animated XP toast, level-up banner, and badge pop-up(s).
 * @param {object} xpResult - Response from the XP endpoint.
 */
function _showXPFeedback(xpResult) {
    if (!xpResult || !xpResult.delta) return;
    const { delta, level, leveled_up, new_badges = [] } = xpResult;

    // Floating +/- XP toast
    const sign  = delta > 0 ? '+' : '';
    const color = delta > 0 ? '#A3C14A' : '#ef4444';
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.style.cssText = `color:${color};`;
    toast.textContent   = `${sign}${delta} XP`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);

    // Level-up banner
    if (leveled_up && level) {
        setTimeout(() => {
            const banner = document.createElement('div');
            banner.className = 'level-up-banner';
            banner.innerHTML = `<span class="level-up-star">⭐</span> LEVEL UP! <span class="level-up-num">LVL ${level}</span>`;
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 3000);
        }, 600);
    }

    // New badge pop-ups
    (new_badges || []).forEach((b, i) => {
        const meta   = BADGE_META[b.id] || b;
        const imgSrc = `/public/assets/badges/${b.id}.png`;
        setTimeout(() => {
            const bp = document.createElement('div');
            bp.className = 'badge-popup';
            bp.innerHTML = `
                <div class="badge-popup-img-wrap">
                    <img src="${imgSrc}" alt="${escapeHtml(meta.name)}" class="badge-popup-img"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">
                    <span class="badge-popup-icon" style="display:none;">${meta.icon}</span>
                </div>
                <div>
                    <div class="badge-popup-name">Rozet Kazandın!</div>
                    <div class="badge-popup-title">${escapeHtml(meta.name)}</div>
                </div>
            `;
            document.body.appendChild(bp);
            setTimeout(() => bp.remove(), 3500);
        }, 1200 + i * 600);
    });

    // Live-update XP bar if profile screen is currently visible
    const passport = getSlice('profile').passport;
    if (passport) {
        const updated = {
            ...passport,
            xp:    xpResult.xp    ?? passport.xp,
            level: xpResult.level ?? passport.level,
            level_progress_percent: xpResult.xp_progress ?? passport.level_progress_percent,
        };
        setSlice('profile', { passport: updated });

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
 * Call the XP endpoint and show feedback animations.
 * @param {number} delta  - XP amount (positive or negative).
 * @param {string} reason - Reason string sent to backend.
 */
async function _awardXPWithFeedback(delta, reason) {
    const uid = localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id');
    if (!uid) return;
    try {
        const { data: result } = await awardXP(uid, delta, reason);
        if (result) _showXPFeedback(result);
    } catch (e) { /* silently skip */ }
}

/** Re-colour every polygon in a GeoJSON layer to reflect current _visitedCountries. */
function _syncMapLayer(geoLayer) {
    if (!geoLayer) return;
    geoLayer.eachLayer(l => {
        const isVisited = _visitedCountries.has(l.feature?.id);
        l.setStyle({
            fillColor:   isVisited ? '#9CAF88' : '#E5E7EB',
            fillOpacity: isVisited ? 0.8       : 0.5,
        });
    });
}

/** Deterministic color per country code (for pin markers). */
function _pinColor(code) {
    const palette = [
        '#E57373','#F06292','#BA68C8','#7986CB',
        '#4FC3F7','#4DB6AC','#AED581','#FFD54F',
        '#FF8A65','#A1887F',
    ];
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
}

/** Build a Leaflet divIcon SVG pin for a given color. */
function _makePinIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="26" viewBox="0 0 18 26">
        <circle cx="9" cy="9" r="7.5" fill="${color}" stroke="white" stroke-width="2"/>
        <polygon points="9,26 5,17 13,17" fill="${color}"/>
    </svg>`;
    return L.divIcon({
        html:          svg,
        className:     'country-pin-icon',
        iconSize:      [18, 26],
        iconAnchor:    [9,  26],
        tooltipAnchor: [0, -28],
    });
}

/** Add a pin marker for a country on the fullscreen map. */
function _addCountryPin(code, name) {
    if (!_worldMap || _pinMarkers.has(code)) return;
    let center = null;
    if (_geoJsonLayer) {
        _geoJsonLayer.eachLayer(l => {
            if (!center && l.feature?.id === code) {
                try { center = l.getBounds().getCenter(); } catch (_) {}
            }
        });
    }
    if (!center) return;
    const marker = L.marker(center, { icon: _makePinIcon(_pinColor(code)), zIndexOffset: 500 })
        .bindTooltip(name || code, { permanent: false, direction: 'top', className: 'country-pin-tooltip' })
        .addTo(_worldMap);
    _pinMarkers.set(code, marker);
}

/** Remove a pin marker for a country from the fullscreen map. */
function _removeCountryPin(code) {
    const m = _pinMarkers.get(code);
    if (m) { m.remove(); _pinMarkers.delete(code); }
}

/**
 * Toggle a country's visited state, sync maps, and call the backend.
 * Shared by both fullscreen and mini-map click handlers.
 */
async function _toggleCountryVisit(countryCode, countryName) {
    if (_visitedCountries.has(countryCode)) {
        // ── UNMARK ──────────────────────────────────────────────────────────────
        _visitedCountries.delete(countryCode);
        _removeCountryPin(countryCode);

        showToast('Ziyaret silindi 🗑️', 'info');

        // Animate-out and remove all stamp cards for this country
        document.querySelectorAll(
            `.passport-stamp-card[data-country="${countryCode.toUpperCase()}"]`
        ).forEach(card => {
            card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease';
            card.style.transform  = 'scale(0) rotate(-8deg)';
            card.style.opacity    = '0';
            setTimeout(() => card.remove(), 350);
        });

        try {
            const { data: removeResult } = await removeVisitedCountry(countryCode);
            if (removeResult?.xp_result) _showXPFeedback(removeResult.xp_result);
        } catch (err) {
            // Rollback
            _visitedCountries.add(countryCode);
            showToast('Bir hata oluştu, tekrar dene', 'error');
            console.error('[profile] removeVisitedCountry error:', err);
        }

    } else {
        // ── MARK VISITED ────────────────────────────────────────────────────────
        _visitedCountries.add(countryCode);
        _addCountryPin(countryCode, countryName);

        showToast(`${countryName} pasaporta eklendi! 🌍`, 'success');
        injectPassportStamp(countryCode, countryName);

        try {
            const { data: addResult } = await addVisitedCountry({
                country_code: countryCode,
                country_name: countryName,
            });
            if (addResult?.xp_result) _showXPFeedback(addResult.xp_result);
        } catch (err) {
            // Rollback
            _visitedCountries.delete(countryCode);
            showToast('Bir hata oluştu, tekrar dene', 'error');
            console.error('[profile] addVisitedCountry error:', err);
        }
    }

    // Sync both map layers + counter
    _syncMapLayer(_geoJsonLayer);
    _syncMapLayer(_miniGeoJsonLayer);
    updateVisitedCountryCount();
}

/** Attach hover + click handlers to each GeoJSON feature on the fullscreen map. */
function _onEachFeature(feature, layer) {
    layer.on('mouseover', function (e) {
        if (!_visitedCountries.has(feature.id)) {
            e.target.setStyle({ fillColor: '#D1D5DB', fillOpacity: 0.7 });
        }
    });

    layer.on('mouseout', function (e) {
        if (!_visitedCountries.has(feature.id)) {
            _geoJsonLayer.resetStyle(e.target);
        }
    });

    layer.on('click', async function () {
        await _toggleCountryVisit(feature.id, feature.properties?.name || feature.id);
    });
}

/** Attach click handler to each GeoJSON feature on the mini-map. */
function _onEachMiniFeature(feature, layer) {
    layer.on('click', async function () {
        await _toggleCountryVisit(feature.id, feature.properties?.name || feature.id);
    });
}

/** Render the profile wishlist section from the user's active plans. */
async function renderProfileWishlist() {
    const container = document.getElementById('profile-wishlist-cards');
    const countEl   = document.getElementById('wishlist-count-badge');
    if (!container) return;

    try {
        const { data: wishlists = [] } = await getWishlists();

        if (countEl) countEl.textContent = `${wishlists.length} Plan`;

        if (!wishlists || wishlists.length === 0) {
            container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">Aktif plan bulunamadı. Hemen oluştur!</div>';
            return;
        }

        container.innerHTML = wishlists.slice(0, 3).map(w => `
            <div class="wishlist-card group cursor-pointer"
                 onclick="navigate('planner'); openPlannerDetail('${escapeHtml(w._id || w.id || '')}')">
                <img src="${escapeHtml(w.image_url || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=200&q=80')}"
                     class="wishlist-thumb"
                     alt="${escapeHtml(w.destination || '')}">
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-[#1a1a1a] text-sm group-hover:text-[#9CAF88] transition-colors">${escapeHtml(w.destination || '')}</h4>
                        <span class="text-[10px] font-bold text-[#9CAF88] bg-[#9CAF88]/10 px-2 py-0.5 rounded-full">TL</span>
                    </div>
                    <p class="text-xs text-[#9ca3af] mt-0.5">${escapeHtml(w.origin || '')} ✈ ${escapeHtml(w.destination || '')}</p>
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

    } catch (err) {
        console.error('[profile] wishlist load error:', err);
        container.innerHTML = '<div class="text-center text-xs text-red-400 py-4">Planlar yüklenemedi</div>';
    }
}

// =============================================================================
// STORIES — Hikayeler
// =============================================================================

import { getStories, addStory, deleteStory } from '../../services/story.service.js';

// Türkçe ülke adı mapping (ISO alpha-2)
const COUNTRY_TR = {
    AF:'Afganistan',AL:'Arnavutluk',DZ:'Cezayir',AD:'Andorra',AO:'Angola',
    AG:'Antigua ve Barbuda',AR:'Arjantin',AM:'Ermenistan',AU:'Avustralya',
    AT:'Avusturya',AZ:'Azerbaycan',BS:'Bahamalar',BH:'Bahreyn',BD:'Bangladeş',
    BB:'Barbados',BY:'Belarus',BE:'Belçika',BZ:'Belize',BJ:'Benin',BT:'Bhutan',
    BO:'Bolivya',BA:'Bosna Hersek',BW:'Botsvana',BR:'Brezilya',BN:'Brunei',
    BG:'Bulgaristan',BF:'Burkina Faso',BI:'Burundi',CV:'Yeşil Burun',KH:'Kamboçya',
    CM:'Kamerun',CA:'Kanada',CF:'Orta Afrika Cumhuriyeti',TD:'Çad',CL:'Şili',
    CN:'Çin',CO:'Kolombiya',KM:'Komorlar',CG:'Kongo',CD:'Kongo (DRC)',CR:'Kosta Rika',
    HR:'Hırvatistan',CU:'Küba',CY:'Kıbrıs',CZ:'Çek Cumhuriyeti',DK:'Danimarka',
    DJ:'Cibuti',DM:'Dominika',DO:'Dominik Cumhuriyeti',EC:'Ekvador',EG:'Mısır',
    SV:'El Salvador',GQ:'Ekvator Ginesi',ER:'Eritre',EE:'Estonya',SZ:'Esvatini',
    ET:'Etiyopya',FJ:'Fiji',FI:'Finlandiya',FR:'Fransa',GA:'Gabon',GM:'Gambiya',
    GE:'Gürcistan',DE:'Almanya',GH:'Gana',GR:'Yunanistan',GD:'Grenada',
    GT:'Guatemala',GN:'Gine',GW:'Gine-Bissau',GY:'Guyana',HT:'Haiti',
    HN:'Honduras',HU:'Macaristan',IS:'İzlanda',IN:'Hindistan',ID:'Endonezya',
    IR:'İran',IQ:'Irak',IE:'İrlanda',IL:'İsrail',IT:'İtalya',JM:'Jamaika',
    JP:'Japonya',JO:'Ürdün',KZ:'Kazakistan',KE:'Kenya',KI:'Kiribati',
    KW:'Kuveyt',KG:'Kırgızistan',LA:'Laos',LV:'Letonya',LB:'Lübnan',
    LS:'Lesotho',LR:'Liberya',LY:'Libya',LI:'Lihtenştayn',LT:'Litvanya',
    LU:'Lüksemburg',MG:'Madagaskar',MW:'Malavi',MY:'Malezya',MV:'Maldivler',
    ML:'Mali',MT:'Malta',MH:'Marshall Adaları',MR:'Moritanya',MU:'Mauritius',
    MX:'Meksika',FM:'Mikronezya',MD:'Moldova',MC:'Monako',MN:'Moğolistan',
    ME:'Karadağ',MA:'Fas',MZ:'Mozambik',MM:'Myanmar',NA:'Namibya',NR:'Nauru',
    NP:'Nepal',NL:'Hollanda',NZ:'Yeni Zelanda',NI:'Nikaragua',NE:'Nijer',
    NG:'Nijerya',NO:'Norveç',OM:'Umman',PK:'Pakistan',PW:'Palau',
    PA:'Panama',PG:'Papua Yeni Gine',PY:'Paraguay',PE:'Peru',PH:'Filipinler',
    PL:'Polonya',PT:'Portekiz',QA:'Katar',RO:'Romanya',RU:'Rusya',RW:'Ruanda',
    KN:'Saint Kitts ve Nevis',LC:'Saint Lucia',VC:'Saint Vincent',WS:'Samoa',
    SM:'San Marino',ST:'São Tomé ve Príncipe',SA:'Suudi Arabistan',SN:'Senegal',
    RS:'Sırbistan',SC:'Seyşeller',SL:'Sierra Leone',SG:'Singapur',SK:'Slovakya',
    SI:'Slovenya',SB:'Solomon Adaları',SO:'Somali',ZA:'Güney Afrika',
    SS:'Güney Sudan',ES:'İspanya',LK:'Sri Lanka',SD:'Sudan',SR:'Surinam',
    SE:'İsveç',CH:'İsviçre',SY:'Suriye',TW:'Tayvan',TJ:'Tacikistan',
    TZ:'Tanzanya',TH:'Tayland',TL:'Doğu Timor',TG:'Togo',TO:'Tonga',
    TT:'Trinidad ve Tobago',TN:'Tunus',TR:'Türkiye',TM:'Türkmenistan',
    TV:'Tuvalu',UG:'Uganda',UA:'Ukrayna',AE:'Birleşik Arap Emirlikleri',
    GB:'İngiltere',US:'Amerika Birleşik Devletleri',UY:'Uruguay',UZ:'Özbekistan',
    VU:'Vanuatu',VE:'Venezuela',VN:'Vietnam',YE:'Yemen',ZM:'Zambia',ZW:'Zimbabve',
};

let _storyGroups    = [];   // cached GET response
let _svGroupIdx     = 0;    // current group index in viewer
let _svStoryIdx     = 0;    // current story index within group
let _svTimer        = null; // progress interval

/** Load stories from backend and render */
export async function loadStories() {
    try {
        const { data, error } = await getStories();
        if (error) { console.warn('[stories] load error:', error); renderStories([]); return; }
        _storyGroups = Array.isArray(data) ? data : [];
        renderStories(_storyGroups);
    } catch (e) {
        console.warn('[stories] load error:', e);
        renderStories([]);
    }
}

/** Render country bubbles + avatar ring */
function renderStories(groups) {
    const container = document.getElementById('story-groups-container');
    if (!container) return;

    // Avatar ring
    const ring = document.getElementById('story-ring');
    const hasRecent = groups.some(g => g.has_recent);
    if (ring) {
        ring.classList.toggle('hidden', !hasRecent);
    }

    if (!groups.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = groups.map((g, idx) => `
        <div onclick="openStoryViewer(${idx})"
             class="flex-shrink-0 flex flex-col items-center gap-1.5 cursor-pointer">
            <div class="w-16 h-16 rounded-full overflow-hidden border-2 ${g.has_recent ? 'border-red-500' : 'border-gray-300'} bg-gray-100 flex items-center justify-center">
                <img src="${g.stories[0]?.media_url || ''}" alt="${escapeHtml(g.country_name)}"
                     class="w-full h-full object-cover"
                     onerror="this.style.display='none'">
            </div>
            <span class="text-[10px] text-[#1a1a1a] font-medium text-center max-w-[64px] truncate">${escapeHtml(g.country_name)}</span>
        </div>
    `).join('');
}

/** Open story viewer for a group index */
export function openStoryViewer(groupIdx) {
    if (!_storyGroups.length) return;
    _svGroupIdx = Math.max(0, Math.min(groupIdx, _storyGroups.length - 1));
    _svStoryIdx = 0;
    _showCurrentStory();
    const overlay = document.getElementById('story-viewer-overlay');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('flex');
}

/** Open own stories (called from avatar ring tap) */
export function openOwnStories() {
    if (!_storyGroups.length) { openStoryAdd(); return; }
    openStoryViewer(0);
}

function _showCurrentStory() {
    const group = _storyGroups[_svGroupIdx];
    if (!group) return;
    const story = group.stories[_svStoryIdx];
    if (!story) return;

    document.getElementById('sv-country-name').textContent = group.country_name;
    document.getElementById('sv-story-index').textContent =
        `${_svStoryIdx + 1} / ${group.stories.length}`;
    document.getElementById('sv-media').src = story.media_url || '';
    document.getElementById('sv-caption').textContent = story.caption || '';

    // Progress bars
    _buildProgressBars(group.stories.length, _svStoryIdx);
    _startStoryTimer(group.stories.length);
    scheduleIconRefresh();
}

function _buildProgressBars(total, current) {
    const container = document.getElementById('story-progress-bars');
    if (!container) return;
    container.innerHTML = Array.from({ length: total }, (_, i) => `
        <div class="flex-1 h-0.5 rounded-full ${i < current ? 'bg-white' : i === current ? 'bg-white/40' : 'bg-white/30'}" id="sp-${i}">
            ${i === current ? `<div class="h-full bg-white rounded-full" id="sp-fill" style="width:0%"></div>` : ''}
        </div>
    `).join('');
}

function _startStoryTimer(total) {
    clearInterval(_svTimer);
    const fill = document.getElementById('sp-fill');
    if (!fill) return;
    let pct = 0;
    const DURATION = 5000;
    const INTERVAL = 50;
    _svTimer = setInterval(() => {
        pct += (INTERVAL / DURATION) * 100;
        if (fill) fill.style.width = Math.min(pct, 100) + '%';
        if (pct >= 100) {
            clearInterval(_svTimer);
            storyNext();
        }
    }, INTERVAL);
}

export function toggleStoryMenu() {
    document.getElementById('sv-menu-dropdown')?.classList.toggle('hidden');
}

export function storyNext() {
    clearInterval(_svTimer);
    const group = _storyGroups[_svGroupIdx];
    if (!group) return closeStoryViewer();
    if (_svStoryIdx < group.stories.length - 1) {
        _svStoryIdx++;
        _showCurrentStory();
    } else if (_svGroupIdx < _storyGroups.length - 1) {
        _svGroupIdx++;
        _svStoryIdx = 0;
        _showCurrentStory();
    } else {
        closeStoryViewer();
    }
}

export function storyPrev() {
    clearInterval(_svTimer);
    if (_svStoryIdx > 0) {
        _svStoryIdx--;
        _showCurrentStory();
    } else if (_svGroupIdx > 0) {
        _svGroupIdx--;
        _svStoryIdx = _storyGroups[_svGroupIdx].stories.length - 1;
        _showCurrentStory();
    }
}

export function closeStoryViewer() {
    clearInterval(_svTimer);
    const overlay = document.getElementById('story-viewer-overlay');
    overlay?.classList.add('hidden');
    overlay?.classList.remove('flex');
}

export async function deleteCurrentStory() {
    document.getElementById('sv-menu-dropdown')?.classList.add('hidden');
    const group = _storyGroups[_svGroupIdx];
    const story = group?.stories[_svStoryIdx];
    if (!story) return;
    try {
        const { error } = await deleteStory(story._id);
        if (error) { showToast('Hikaye silinemedi', 'error'); return; }
        group.stories.splice(_svStoryIdx, 1);
        if (!group.stories.length) {
            _storyGroups.splice(_svGroupIdx, 1);
            if (!_storyGroups.length) { closeStoryViewer(); renderStories([]); return; }
            _svGroupIdx = Math.min(_svGroupIdx, _storyGroups.length - 1);
            _svStoryIdx = 0;
        } else {
            _svStoryIdx = Math.min(_svStoryIdx, group.stories.length - 1);
        }
        renderStories(_storyGroups);
        _showCurrentStory();
    } catch (e) {
        showToast('Hikaye silinemedi', 'error');
    }
}

// ── Story Add Modal ────────────────────────────────────────────────────────────

let _storyBase64 = null;

export function openStoryAdd() {
    _storyBase64 = null;
    const modal = document.getElementById('story-add-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
    document.getElementById('story-preview-img')?.classList.add('hidden');
    const placeholder = document.getElementById('story-upload-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
    document.getElementById('story-country-name').value = '';
    document.getElementById('story-country-code').value = '';
    document.getElementById('story-caption-input').value = '';
    detectStoryLocation();
    scheduleIconRefresh();
}

export function closeStoryAdd() {
    const modal = document.getElementById('story-add-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
}

export function onStoryFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Compress to max 800px wide via canvas
            const MAX = 800;
            const scale = Math.min(1, MAX / img.width);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            _storyBase64 = canvas.toDataURL('image/jpeg', 0.8);

            const preview = document.getElementById('story-preview-img');
            if (preview) { preview.src = _storyBase64; preview.classList.remove('hidden'); }
            const placeholder = document.getElementById('story-upload-placeholder');
            if (placeholder) placeholder.style.display = 'none';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export async function detectStoryLocation() {
    const nameInput = document.getElementById('story-country-name');
    const codeInput = document.getElementById('story-country-code');
    if (!navigator.geolocation) return;
    if (nameInput) nameInput.placeholder = 'Konum alınıyor…';
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const { latitude: lat, longitude: lon } = pos.coords;
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await r.json();
            const code = (data.address?.country_code || 'XX').toUpperCase();
            const name = COUNTRY_TR[code] || data.address?.country || code;
            if (nameInput) { nameInput.value = name; nameInput.placeholder = 'Ülke adı'; }
            if (codeInput) codeInput.value = code;
        } catch {
            if (nameInput) nameInput.placeholder = 'Ülke adını girin';
        }
    }, () => {
        if (nameInput) nameInput.placeholder = 'Ülke adını girin';
    });
}

export async function submitStory() {
    if (!_storyBase64) { showToast('Önce bir fotoğraf seç', 'error'); return; }
    const name = document.getElementById('story-country-name').value.trim();
    const code = document.getElementById('story-country-code').value.trim().toUpperCase() || 'XX';
    const caption = document.getElementById('story-caption-input').value.trim() || null;
    if (!name) { showToast('Ülke adı gerekli', 'error'); return; }

    const btn = document.getElementById('story-submit-btn');
    if (btn) btn.disabled = true;
    try {
        const { error } = await addStory({ country_code: code, country_name: name, media_url: _storyBase64, caption });
        if (error) { showToast('Hikaye eklenemedi: ' + error, 'error'); return; }
        closeStoryAdd();
        showToast('Hikaye eklendi!', 'success');
        await loadStories();
    } catch (e) {
        showToast('Hikaye eklenemedi', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// =============================================================================
// EVENT LISTENER WIRING (close-map button)
// =============================================================================

// Defer until DOM is ready so the module can be imported before DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-open-map')?.addEventListener('click', openFullscreenMap);

    document.getElementById('btn-close-map')?.addEventListener('click', () => {
        const overlay = document.getElementById('map-fullscreen-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
});
