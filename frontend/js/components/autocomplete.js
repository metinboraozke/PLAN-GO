/**
 * PLANİGO - Destination Autocomplete Component
 * Uses Travelpayouts Places2 API for airport/city search (with IATA codes).
 * Fallback to Nominatim if TP returns no results.
 */

let _selectedDestination = null;
let _suggestions         = [];
let _debounceTimer       = null;
let _initialized         = false;

// ── Airport/City Search (Travelpayouts) ────────────────────────────────────
async function searchAirports(query) {
    if (query.length < 2) return [];

    try {
        const params = new URLSearchParams({ term: query, locale: 'tr' });
        params.append('types[]', 'airport');
        params.append('types[]', 'city');

        const res = await fetch('https://autocomplete.travelpayouts.com/places2?' + params);
        if (!res.ok) return [];

        const data = await res.json();

        // Group by city: prefer airports, city code as fallback
        const byCityName = new Map();
        for (const p of data) {
            if (!p.code) continue;
            const key = (p.city_name || p.name || '').toLowerCase();
            if (!byCityName.has(key)) byCityName.set(key, { airports: [], city: null });
            const entry = byCityName.get(key);
            if (p.type === 'airport') entry.airports.push(p);
            else entry.city = p;
        }

        const filtered = [];
        for (const { airports, city } of byCityName.values()) {
            if (airports.length > 0) filtered.push(...airports);
            else if (city) filtered.push(city);
        }

        return filtered
            .slice(0, 8)
            .map(p => ({
                name:        p.city_name || p.name,
                airportName: p.name,
                iata:        p.code,
                country:     p.country_name || '',
                countryCode: p.country_code?.toUpperCase() || '',
                type:        p.type || 'airport',
                lat:         p.coordinates?.lat  || null,
                lng:         p.coordinates?.lon  || null,
            }));
    } catch { return []; }
}

// ── Country Emoji ──────────────────────────────────────────────────────────
const _FLAG_MAP = {
    'TR': '🇹🇷', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸', 'DE': '🇩🇪',
    'GB': '🇬🇧', 'US': '🇺🇸', 'GR': '🇬🇷', 'NL': '🇳🇱', 'PT': '🇵🇹',
    'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳', 'TH': '🇹🇭', 'AE': '🇦🇪',
    'EG': '🇪🇬', 'MA': '🇲🇦', 'AU': '🇦🇺', 'BR': '🇧🇷', 'MX': '🇲🇽',
};

function getCityEmoji(countryCode) {
    return _FLAG_MAP[countryCode] || '🌍';
}

// ── Render Dropdown ────────────────────────────────────────────────────────
function renderAutocomplete(suggestions) {
    const dropdown = document.getElementById('destination-autocomplete');
    if (!dropdown) return;

    _suggestions = suggestions;

    if (!suggestions.length) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = suggestions.map((city, i) => `
        <div style="padding:12px 16px;cursor:pointer;border-bottom:1px solid #f0efe9;transition:background 0.2s;"
             onmouseover="this.style.background='#f5f3ee'" onmouseout="this.style.background='#fff'"
             data-city-index="${i}">
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:18px;">${getCityEmoji(city.countryCode)}</span>
                <div style="flex:1;">
                    <p style="font-weight:600;color:#1a1a1a;font-size:14px;margin:0;">${city.name}</p>
                    <p style="font-size:12px;color:#9ca3af;margin:2px 0 0;">${city.airportName !== city.name ? city.airportName + ' · ' : ''}${city.country}</p>
                </div>
                <span style="font-size:12px;font-weight:700;color:#7a8a2e;background:#f0f4e8;padding:2px 8px;border-radius:6px;">${city.iata}</span>
            </div>
        </div>`).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-city-index]').forEach(el => {
        el.addEventListener('click', () => selectCity(parseInt(el.dataset.cityIndex, 10)));
    });
}

// ── Select City ────────────────────────────────────────────────────────────
export function selectCity(index) {
    const city = _suggestions[index];
    if (!city) return;

    const input = document.getElementById('destination-input');
    if (input) input.value = `${city.name}, ${city.country}`;

    const latEl  = document.getElementById('destination-lat');
    const lngEl  = document.getElementById('destination-lng');
    const dispEl = document.getElementById('destination-display');
    if (latEl)  latEl.value  = city.lat  || '';
    if (lngEl)  lngEl.value  = city.lng  || '';
    if (dispEl) dispEl.value = `${city.name}, ${city.country}`;

    _selectedDestination = {
        name:        city.name,
        fullName:    `${city.airportName} (${city.iata})`,
        displayName: `${city.name}, ${city.country}`,
        iata:        city.iata,          // ← IATA kodu (uçuş araması için)
        lat:         city.lat,
        lng:         city.lng,
        country:     city.country,
        countryCode: city.countryCode,
    };

    const dropdown = document.getElementById('destination-autocomplete');
    if (dropdown) dropdown.style.display = 'none';

    document.getElementById('destination-error')?.style.setProperty('display', 'none');
    if (input) input.style.borderColor = '#7a8a2e';
}

// ── Init ───────────────────────────────────────────────────────────────────
export function initDestinationAutocomplete() {
    const input    = document.getElementById('destination-input');
    const dropdown = document.getElementById('destination-autocomplete');
    if (!input) return;

    // Always reset selection when modal opens
    _selectedDestination = null;

    // Guard: only add event listeners once
    if (_initialized) return;
    _initialized = true;

    input.addEventListener('input', e => {
        const query = e.target.value.trim();
        _selectedDestination = null;
        input.style.borderColor = '#e8e6e1';

        clearTimeout(_debounceTimer);
        if (query.length < 2) {
            if (dropdown) dropdown.style.display = 'none';
            return;
        }
        _debounceTimer = setTimeout(async () => {
            const suggestions = await searchAirports(query);
            renderAutocomplete(suggestions);
        }, 300);
    });

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !dropdown?.contains(e.target)) {
            if (dropdown) dropdown.style.display = 'none';
        }
    });

    input.addEventListener('focus', () => {
        if (_suggestions.length && dropdown) dropdown.style.display = 'block';
    });
}

// ── Getters ────────────────────────────────────────────────────────────────
export function getSelectedDestination() {
    return _selectedDestination;
}

export function resetDestinationSelection() {
    _selectedDestination = null;
    _suggestions         = [];
    _initialized         = false;
    const input    = document.getElementById('destination-input');
    const dropdown = document.getElementById('destination-autocomplete');
    if (input)    { input.value = ''; input.style.borderColor = '#e8e6e1'; }
    if (dropdown) dropdown.style.display = 'none';
}
