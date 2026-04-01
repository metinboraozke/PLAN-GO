/**
 * PLANİGO - Reactive State Store
 * EventTarget-based reactive store with domain slices.
 * Replaces the global flat `state` object from app.js.
 */

const _state = {
    // Auth slice
    auth: {
        token:    null,
        userId:   null,
        username: null,
        email:    null,
    },

    // UI slice
    ui: {
        currentScreen: 'planner',
        loading: {
            wishlists:  false,
            discovery:  false,
            pins:       false,
            profile:    false,
            map:        false,
        },
    },

    // Map slice
    map: {
        instance:      null,   // Leaflet map object
        markers:       [],
        userMarker:    null,
        userLocation:  null,
        allPins:       [],
        pins:          [],
        allEvents:     [],
        eventMarkers:  [],
        selectedPin:   null,
        selectedEvent: null,
    },

    // Planner slice
    planner: {
        wishlists:        [],
        selectedWishlist: null,
    },

    // Profile slice
    profile: {
        data:             null,
        passport:         null,
        visitedCountries: [],
    },

    // Discovery slice
    discovery: {
        data:           null,
        activeFilter:   null,
    },
};

const _bus = new EventTarget();

/**
 * Get a shallow copy of the current state.
 */
export function getState() {
    return { ..._state };
}

/**
 * Get a specific slice by name.
 * @param {'auth'|'ui'|'map'|'planner'|'profile'|'discovery'} slice
 */
export function getSlice(slice) {
    return { ..._state[slice] };
}

/**
 * Merge a patch into a named slice and emit a change event.
 * @param {'auth'|'ui'|'map'|'planner'|'profile'|'discovery'} slice
 * @param {Object} patch
 */
export function setSlice(slice, patch) {
    Object.assign(_state[slice], patch);
    _bus.dispatchEvent(new CustomEvent(`${slice}:changed`, { detail: { ..._state[slice] } }));
    _bus.dispatchEvent(new CustomEvent('statechange', { detail: { slice, patch } }));
}

/**
 * Subscribe to a named event on the store bus.
 * @param {string} event - e.g. 'auth:changed', 'planner:changed', 'statechange'
 * @param {Function} cb
 */
export function on(event, cb) {
    _bus.addEventListener(event, cb);
}

/**
 * Unsubscribe from a named event.
 */
export function off(event, cb) {
    _bus.removeEventListener(event, cb);
}

/**
 * Emit a custom event on the store bus.
 * Useful for one-off events like 'router:navigate', 'auth:expired'.
 */
export function emit(event, detail) {
    _bus.dispatchEvent(new CustomEvent(event, { detail }));
}
