/**
 * PLANİGO - Discovery Service
 * All endpoints under /discovery and /discover.
 */

import * as http from './http.js';

export const getDiscoveryFull    = (filter) =>
    http.get(`/discovery/full${filter ? '?filter_type=' + encodeURIComponent(filter) : ''}`);

export const discoverCategories  = ()              => http.get('/discover/categories');
export const discoverHero        = ()              => http.get('/discover/hero');
export const discoverTrending    = (limit = 6)     => http.get(`/discover/trending?limit=${limit}`);
export const discoverDeals       = (cat = '')      =>
    http.get(`/discover/deals${cat ? '?category=' + encodeURIComponent(cat) : ''}`);
export const discoverVizesiz     = (limit = 10)    => http.get(`/discover/vizesiz?limit=${limit}`);
export const discoverBudgetFriendly = (limit = 20) => http.get(`/discover/budget-friendly?limit=${limit}`);
