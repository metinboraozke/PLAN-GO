/**
 * PLANİGO - LocalStorage Utilities
 * Per-user isolated storage keys for PAX events and join requests.
 */

function _currentUserId() {
    return localStorage.getItem('auth_user_id') || sessionStorage.getItem('pax_creator_id') || 'anon';
}

// ── Join Request Tracking ────────────────────────────────────────────────────

export function joinRequestsKey() {
    return `pax_join_requests_${_currentUserId()}`;
}

export function hasJoinRequest(eventId) {
    try {
        const sent = JSON.parse(localStorage.getItem(joinRequestsKey()) || '[]');
        return sent.includes(eventId);
    } catch { return false; }
}

export function saveJoinRequest(eventId) {
    try {
        const key  = joinRequestsKey();
        const sent = JSON.parse(localStorage.getItem(key) || '[]');
        if (!sent.includes(eventId)) {
            sent.push(eventId);
            localStorage.setItem(key, JSON.stringify(sent));
        }
    } catch { /* quota */ }
}

export function removeJoinRequest(eventId) {
    try {
        const key  = joinRequestsKey();
        const sent = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(sent.filter(id => id !== eventId)));
    } catch { /* ignore */ }
}

// ── PAX Planner Event Sync ───────────────────────────────────────────────────

export function paxPlannerKey() {
    return `pax_upcoming_events_${_currentUserId()}`;
}

export function savePaxEvent(event, role = 'participant') {
    if (!event) return;
    try {
        const key    = paxPlannerKey();
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
            stored[idx] = { ...stored[idx], ...entry };
        } else {
            stored.unshift(entry);
        }
        localStorage.setItem(key, JSON.stringify(stored.slice(0, 50)));
    } catch { /* quota exceeded */ }
}

export function removePaxEvent(eventId) {
    try {
        const key    = paxPlannerKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(stored.filter(e => (e._id || e.id) !== eventId)));
    } catch { /* ignore */ }

    // Also clean from join-request tracker
    removeJoinRequest(eventId);
}

export function getPaxEvents() {
    try {
        return JSON.parse(localStorage.getItem(paxPlannerKey()) || '[]');
    } catch { return []; }
}

export function updatePaxEventStatus(eventId, newStatus) {
    try {
        const key    = paxPlannerKey();
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const idx    = stored.findIndex(e => (e._id || e.id) === eventId);
        if (idx > -1) {
            stored[idx]._pax_status = newStatus;
            localStorage.setItem(key, JSON.stringify(stored));
        }
    } catch { /* ignore */ }
}
