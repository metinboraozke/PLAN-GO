/**
 * PLANİGO - Story Service
 * Hikayeler için backend API çağrıları.
 */

import * as http from './http.js';

export const getStories  = ()     => http.get('/stories');
export const addStory    = (data) => http.post('/stories', data);
export const deleteStory = (id)   => http.del(`/stories/${encodeURIComponent(id)}`);
