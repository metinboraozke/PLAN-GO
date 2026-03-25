/**
 * PLANİGO - Global Configuration Constants
 */

export const API_BASE = 'http://localhost:8025/api/v1';

export const DEFAULT_LOCATION = { lat: 41.0082, lng: 28.9784 };
export const DEFAULT_ZOOM = 13;

export const DISCOVER_FILTER_CATEGORIES = [
    { id: 'all',         label: 'Tüm Fırsatlar', icon: 'zap',          filter: null        },
    { id: 'vizesiz',     label: 'Vizesiz',        icon: 'shield-check', filter: 'visa_free' },
    { id: 'bütçe-dostu', label: 'Bütçe Dostu',   icon: 'wallet',       filter: 'under_5k'  },
];
