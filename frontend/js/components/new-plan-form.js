/**
 * PLANİGO - New Plan Form Component
 * Full port from app.js lines 5690-5890 (form submit) + 6005-6149 (initNewPlanForm).
 * Handles the modal-new-plan form: date type toggle, duration chips, autocomplete + submit.
 */

import { addWishlist } from '../services/planner.service.js';
import { navigate } from '../core/router.js';
import { showToast } from '../core/toast.js';
import {
    initDestinationAutocomplete,
    getSelectedDestination,
    resetDestinationSelection
} from './autocomplete.js';
import { startPricePolling, loadWishlists, renderWishlists } from '../screens/planner/planner.screen.js';
import { getSlice, setSlice } from '../core/store.js';

// ── Custom Calendar State ──────────────────────────────────────────────────
let _calTarget = null;   // 'start' | 'end'
let _calYear   = 0;
let _calMonth  = 0;
let _startDate = null;   // Date object | null
let _endDate   = null;

const _CAL_TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const _CAL_TR_SHORT  = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

export function setDateType(type) {
    const val = document.getElementById('date-type-val');
    if (val) val.value = type;
    const isFlexible = type === 'flexible';
    const fieldFlex  = document.getElementById('field-flexible-dates');
    const fieldFixed = document.getElementById('field-fixed-dates');
    if (fieldFlex)  fieldFlex.style.display  = isFlexible ? 'block' : 'none';
    if (fieldFixed) fieldFixed.style.display = isFlexible ? 'none'  : 'block';
    const dfx = document.getElementById('dt-flexible');
    const dfi = document.getElementById('dt-fixed');
    if (!dfx || !dfi) return;
    if (isFlexible) {
        dfx.style.background = '#9CAF88'; dfx.style.borderColor = '#9CAF88'; dfx.style.color = '#fff';
        dfi.style.background = 'transparent'; dfi.style.borderColor = '#d1d5c8'; dfi.style.color = '#6b7280';
    } else {
        dfi.style.background = '#9CAF88'; dfi.style.borderColor = '#9CAF88'; dfi.style.color = '#fff';
        dfx.style.background = 'transparent'; dfx.style.borderColor = '#d1d5c8'; dfx.style.color = '#6b7280';
    }
}

export function openDatePicker(target) {
    _calTarget = target;
    const today = new Date(); today.setHours(0,0,0,0);
    const base  = target === 'end' && _startDate ? new Date(_startDate) : today;
    _calYear  = base.getFullYear();
    _calMonth = base.getMonth();
    _renderCal();
    document.getElementById('custom-cal-overlay').style.display = 'flex';
}

export function calNav(dir) {
    _calMonth += dir;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
    _renderCal();
}

export function closeCalendar() {
    document.getElementById('custom-cal-overlay').style.display = 'none';
}

function _renderCal() {
    document.getElementById('cal-month-label').textContent = `${_CAL_TR_MONTHS[_calMonth]} ${_calYear}`;
    const today    = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(_calYear, _calMonth, 1);
    const lastDay  = new Date(_calYear, _calMonth + 1, 0);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        grid.appendChild(empty);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date          = new Date(_calYear, _calMonth, d);
        const isPast        = date < today;
        const isBeforeStart = _calTarget === 'end' && _startDate && date < _startDate;
        const disabled      = isPast || isBeforeStart;
        const isSelStart    = _startDate && _dateEq(date, _startDate);
        const isSelEnd      = _endDate   && _dateEq(date, _endDate);
        const isToday       = _dateEq(date, today);

        let bg = 'transparent', color = disabled ? '#d1d5c8' : '#1a1a1a', fw = '500';
        let border = 'none', cursor = disabled ? 'default' : 'pointer';
        if (isSelStart)    { bg = '#ef4444';  color = '#fff'; fw = '700'; }
        else if (isSelEnd) { bg = '#9CAF88';  color = '#fff'; fw = '700'; }
        else if (isToday)  { border = '2px solid #9CAF88'; fw = '600'; }

        const cell = document.createElement('div');
        cell.textContent = d;
        Object.assign(cell.style, {
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto', fontSize: '14px',
            background: bg, color, fontWeight: fw, border, cursor,
            pointerEvents: disabled ? 'none' : 'auto',
            transition: 'background 0.15s',
        });
        if (!disabled) {
            const _d = d;
            cell.onclick = () => _pickDay(_d);
            cell.onmouseenter = () => { if (!isSelStart && !isSelEnd) cell.style.background = '#f0f5ec'; };
            cell.onmouseleave = () => { if (!isSelStart && !isSelEnd) cell.style.background = bg; };
        }
        grid.appendChild(cell);
    }
}

function _dateEq(a, b) {
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function _toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
}

function _pickDay(d) {
    const date = new Date(_calYear, _calMonth, d);
    if (_calTarget === 'start') {
        _startDate = date;
        if (_endDate && _endDate <= _startDate) { _endDate = null; _updateDateDisplay('end', null); }
        _updateDateDisplay('start', date);
    } else {
        _endDate = date;
        _updateDateDisplay('end', date);
    }
    closeCalendar();
}

function _updateDateDisplay(target, date) {
    const display = document.getElementById(target === 'start' ? 'start-date-display' : 'end-date-display');
    const hidden  = document.getElementById(target === 'start' ? 'start-date-val'     : 'end-date-val');
    if (date) {
        const str = `${date.getDate()} ${_CAL_TR_SHORT[date.getMonth()]} ${date.getFullYear()}`;
        if (display) { display.textContent = str; display.style.color = '#1a1a1a'; }
        if (hidden)  hidden.value = _toIso(date);
    } else {
        if (display) { display.textContent = 'Tarih seçin'; display.style.color = '#9ca3af'; }
        if (hidden)  hidden.value = '';
    }
}

// ── Month Subtitles ────────────────────────────────────────────────────────
const _MONTH_SUBTITLES = {
    jan: 'Kış tatili fırsatları',   feb: 'Sevgililer günü kaçamağı',
    mar: 'Bahar başlangıcı',        apr: 'Bahar tatili için harika',
    may: 'Erken yaz keyfi',         jun: 'Yaz tatili başlıyor',
    jul: 'Yaz tatili için ideal',   aug: 'Tatil sezonu zirvede',
    sep: 'Sonbahar huzuru',         oct: 'Kültür turları sezonu',
    nov: 'Düşük sezon fırsatları',  dec: 'Yılbaşı kaçamağı',
};

const _MONTHS = [
    { val:'jan', label:'Oca', full:"Ocak'ta" },
    { val:'feb', label:'Şub', full:"Şubat'ta" },
    { val:'mar', label:'Mar', full:"Mart'ta" },
    { val:'apr', label:'Nis', full:"Nisan'da" },
    { val:'may', label:'May', full:"Mayıs'ta" },
    { val:'jun', label:'Haz', full:"Haziran'da" },
    { val:'jul', label:'Tem', full:"Temmuz'da" },
    { val:'aug', label:'Ağu', full:"Ağustos'ta" },
    { val:'sep', label:'Eyl', full:"Eylül'de" },
    { val:'oct', label:'Eki', full:"Ekim'de" },
    { val:'nov', label:'Kas', full:"Kasım'da" },
    { val:'dec', label:'Ara', full:"Aralık'ta" },
];

function _renderMonthPills(selectedVal = 'jul') {
    const container = document.getElementById('month-pills-container');
    if (!container) return;
    container.innerHTML = _MONTHS.map(m => {
        const active = m.val === selectedVal;
        return `<button type="button" onclick="selectMonth('${m.val}')"
            style="flex-shrink:0; padding:8px 16px; border-radius:50px; font-size:13px; font-weight:600; border:none; cursor:pointer; transition:all 0.2s;
                   background:${active ? '#9CAF88' : '#f0ede9'}; color:${active ? '#fff' : '#6b7280'};">
            ${m.label}
        </button>`;
    }).join('');
}

export function selectMonth(val) {
    const hidden = document.getElementById('flexible-month-val');
    const label  = document.getElementById('flexible-month-label');
    const sub    = document.getElementById('month-subtitle');
    const m = _MONTHS.find(x => x.val === val);
    if (hidden) hidden.value = val;
    if (label && m) label.textContent = m.full;
    if (sub) sub.textContent = _MONTH_SUBTITLES[val] || '';
    _renderMonthPills(val);
}

// ── Date Type Pill Styling ─────────────────────────────────────────────────
function _updateDateTypeStyle() {
    const isFlexible = document.querySelector('input[name="date_type"][value="flexible"]')?.checked;
    const dtFlexible = document.getElementById('dt-flexible');
    const dtFixed    = document.getElementById('dt-fixed');
    if (!dtFlexible || !dtFixed) return;

    if (isFlexible) {
        dtFlexible.style.background  = '#7a8a2e'; dtFlexible.style.borderColor = '#7a8a2e'; dtFlexible.style.color = '#fff';
        dtFixed.style.background     = 'transparent'; dtFixed.style.borderColor    = '#d1d5c8'; dtFixed.style.color    = '#6b7280';
    } else {
        dtFixed.style.background     = '#7a8a2e'; dtFixed.style.borderColor    = '#7a8a2e'; dtFixed.style.color    = '#fff';
        dtFlexible.style.background  = 'transparent'; dtFlexible.style.borderColor = '#d1d5c8'; dtFlexible.style.color = '#6b7280';
    }
}

function _updateDurationStyle() {
    document.querySelectorAll('input[name="flexible_duration"]').forEach(radio => {
        const div = radio.nextElementSibling;
        if (!div) return;
        if (radio.checked) {
            div.style.borderColor = '#7a8a2e'; div.style.background = '#7a8a2e'; div.style.color = '#fff';
        } else {
            div.style.borderColor = '#d1d5c8'; div.style.background = 'transparent'; div.style.color = '#6b7280';
        }
    });
}

// ── Init Form ──────────────────────────────────────────────────────────────
export function initNewPlanForm() {
    // Date type — init via setDateType (onclick handlers on divs)
    setDateType('flexible');

    // Duration chips
    document.querySelectorAll('input[name="flexible_duration"]').forEach(radio => {
        radio.addEventListener('change', _updateDurationStyle);
    });
    _updateDurationStyle();

    // Month pills
    _renderMonthPills('jul');

    // Popular route chips
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

    // Close button
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
        document.getElementById('modal-new-plan')?.classList.add('hidden');
    });

    // Form submit
    const form = document.getElementById('form-new-plan');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn          = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> Oluşturuluyor...';
        btn.disabled  = true;

        try {
            const formData       = new FormData(form);
            const dateType       = document.getElementById('date-type-val')?.value || 'flexible';
            const origin         = (formData.get('origin') || 'IST').toUpperCase();
            const destinationRaw = (formData.get('destination') || '').trim();

            if (!destinationRaw) {
                showToast('❌ Lütfen bir destinasyon girin', 'error');
                btn.innerHTML = originalText;
                btn.disabled  = false;
                return;
            }

            const selectedDest = getSelectedDestination();
            let destination, destinationDisplay, destinationLat, destinationLng, destinationCountry, destinationCountryCode, destinationIata;

            if (selectedDest) {
                destination            = selectedDest.name;
                destinationDisplay     = selectedDest.displayName;
                destinationLat         = selectedDest.lat;
                destinationLng         = selectedDest.lng;
                destinationCountry     = selectedDest.country;
                destinationCountryCode = selectedDest.countryCode;
                destinationIata        = selectedDest.iata || null;
            } else {
                destination            = destinationRaw;
                destinationDisplay     = destinationRaw;
                destinationLat         = null;
                destinationLng         = null;
                destinationCountry     = null;
                destinationCountryCode = null;
                destinationIata        = null;
            }

            let startDate = null, endDate = null, flexibleMonth = null, flexibleDuration = null;

            if (dateType === 'fixed') {
                startDate = document.getElementById('start-date-val')?.value || '';
                endDate   = document.getElementById('end-date-val')?.value   || '';
                if (!startDate || !endDate) { showToast('❌ Tarihleri girin', 'error'); btn.innerHTML = originalText; btn.disabled = false; return; }
                if (new Date(endDate) <= new Date(startDate)) { showToast('❌ Dönüş tarihi gidiş tarihinden sonra olmalı', 'error'); btn.innerHTML = originalText; btn.disabled = false; return; }
            } else {
                flexibleMonth    = document.getElementById('flexible-month-val')?.value || 'jul';
                flexibleDuration = formData.get('flexible_duration');
            }

            // Türkçe locale "10.000" → nokta binlik ayraç, parseFloat bunu ondalık sanır → 10.0
            // Önce noktaları sil, virgülü noktaya çevir (Avrupa formatı için), sonra parse et
            const budgetStr = (formData.get('budget') || '').replace(/\./g, '').replace(/,/g, '.');
            const budget    = budgetStr ? parseFloat(budgetStr) : null;

            const payload = {
                trip_name:                `${origin} - ${destination} Trip`,
                origin, destination,
                destination_display:      destinationDisplay,
                destination_iata:         destinationIata,
                destination_lat:          destinationLat,
                destination_lng:          destinationLng,
                destination_country:      destinationCountry,
                destination_country_code: destinationCountryCode,
                date_type: dateType, start_date: startDate, end_date: endDate,
                flexible_month: flexibleMonth, flexible_duration: flexibleDuration,
                budget, target_price: budget || 10000,
                status: 'tracking', travelers_count: 1, is_active: true,
                user_id: localStorage.getItem('auth_user_id') || null
            };

            // Close modal, save first, then navigate
            document.getElementById('modal-new-plan')?.classList.add('hidden');
            showToast('🔄 Plan oluşturuluyor, fiyatlar taranıyor...', 'info');

            const { data, error } = await addWishlist(payload);

            if (error) throw new Error(error);

            const newId = data?._id || data?.id;
            window._awardXPWithFeedback?.(20, 'wishlist_added');
            resetDestinationSelection();

            // Optimistik güncelleme: POST cevabındaki planı store'a ekle, gecikmesiz göster
            if (data) {
                const current = getSlice('planner').wishlists || [];
                setSlice('planner', { wishlists: [...current, data] });
            }
            navigate('planner');   // arka planda loadWishlists() tetiklenir
            renderWishlists();     // store'daki optimistik veriyle anında render
            showToast('🎉 Plan oluşturuldu, fiyatlar taranıyor!', 'success');
            if (newId) startPricePolling(newId);

        } catch (err) {
            showToast(`❌ Hata: ${err.message || err}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled  = false;
        }
    });
}

// ── Budget Input Formatter (index.html oninput="formatBudgetInput(this)") ──
window.formatBudgetInput = function(input) {
    const raw     = input.value.replace(/\D/g, '');
    const numeric = raw ? parseInt(raw, 10) : '';
    input.value   = numeric !== '' ? new Intl.NumberFormat('tr-TR').format(numeric) : '';
    // hidden field'ı güncelle — form submit formData.get('budget') buradan okur
    const hidden = document.getElementById('budget-hidden');
    if (hidden) hidden.value = numeric !== '' ? String(numeric) : '';
};

// ── Open Modal Helper ──────────────────────────────────────────────────────
export function openNewPlanModal() {
    const modal = document.getElementById('modal-new-plan');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => initDestinationAutocomplete(), 100);
}
