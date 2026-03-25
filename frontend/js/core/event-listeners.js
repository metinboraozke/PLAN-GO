/**
 * PLANİGO - Global Event Listeners
 * Full port from app.js lines 5921-6003.
 * Wires UI events to module functions.
 */

import { navigate } from './router.js';
import { toggleNotificationPanel, markAllNotificationsRead } from '../components/notifications.js';
import { closePublicProfile } from '../components/public-profile.js';
import { openAiItineraryModal, closeAiItineraryModal, fetchAiItinerary } from '../components/ai-itinerary.js';
import { openEventChat, closeEventChat, sendChatMessage, openWishlistModal } from '../screens/planner/planner.screen.js';
import { initNewPlanForm, openNewPlanModal } from '../components/new-plan-form.js';
import { openAccountSettings, closeAccountSettings, togglePasswordVisibility } from '../components/account-settings.js';
import { openConfirmModal, closeConfirmModal, confirmPlan,
         deletePlan, confirmDeletePlan, cancelDeletePlan, togglePlanSettings }
    from '../screens/planner/planner-detail/detail.confirm.js';
import { cancelPlanDetailRefresh } from '../screens/planner/planner-detail/detail.screen.js';
import { loadWishlists } from '../screens/planner/planner.screen.js';

export function initEventListeners() {
    // ── Navigation ─────────────────────────────────────────────────────────
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.screen));
    });

    // ── Planner Back Button ────────────────────────────────────────────────
    document.getElementById('btn-back-planner')?.addEventListener('click', () => {
        cancelPlanDetailRefresh();
        document.getElementById('screen-planner-detail')?.classList.add('hidden');
        document.getElementById('screen-planner')?.classList.remove('hidden');
        const bar = document.getElementById('pd-action-bar');
        if (bar) bar.style.display = 'none';
        loadWishlists();
    });

    // ── FAB New Plan ───────────────────────────────────────────────────────
    document.getElementById('fab-new-plan')?.addEventListener('click', () => {
        openNewPlanModal();
        // Reset budget input
        const visible = document.getElementById('budget-input');
        const hidden  = document.getElementById('budget-hidden');
        if (visible) visible.value = '';
        if (hidden)  hidden.value  = '';
    });

    // ── Profile Wishlist Modal ─────────────────────────────────────────────
    document.getElementById('btn-open-wishlist')?.addEventListener('click', openWishlistModal);
    document.getElementById('btn-close-wishlist')?.addEventListener('click', () => {
        document.getElementById('modal-wishlist')?.classList.add('hidden');
    });

    // ── New Plan Form ──────────────────────────────────────────────────────
    initNewPlanForm();

    // ── Map: Filter Buttons ────────────────────────────────────────────────
    document.querySelectorAll('.map-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => window.loadMapPins?.(btn.dataset.filter));
    });

    // ── Map: My Location ──────────────────────────────────────────────────
    document.getElementById('btn-my-location')?.addEventListener('click', () => window.centerOnUser?.());

    // ── Map: Navigate to Pin ───────────────────────────────────────────────
    document.getElementById('btn-navigate')?.addEventListener('click', () => {
        const pin = window._selectedPin || window.state?.selectedPin;
        if (pin) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`, '_blank');
        }
    });

    // ── Map: Add Pin Button ────────────────────────────────────────────────
    document.querySelector('#screen-map header button:last-child')?.addEventListener('click', () => window.openAddPinModal?.());
    document.getElementById('btn-close-add-pin')?.addEventListener('click', () => window.closeAddPinModal?.());
    document.getElementById('form-add-pin')?.addEventListener('submit', e => window.handleAddPin?.(e));

    // ── Map: Add Event Form ────────────────────────────────────────────────
    document.getElementById('form-add-event')?.addEventListener('submit', e => window.handleAddEvent?.(e));
    document.getElementById('btn-close-add-event')?.addEventListener('click', () => window.closeAddEventModal?.());

    // ── Map: Media Buttons ─────────────────────────────────────────────────
    document.getElementById('btn-add-image')?.addEventListener('click', () => {
        document.getElementById('image-preview-container')?.classList.toggle('hidden');
    });
    document.getElementById('btn-add-audio')?.addEventListener('click', () => {
        document.getElementById('audio-preview-container')?.classList.toggle('hidden');
    });

    // ── Notifications ──────────────────────────────────────────────────────
    document.getElementById('btn-notif-bell')?.addEventListener('click', toggleNotificationPanel);
    document.getElementById('btn-mark-all-read')?.addEventListener('click', markAllNotificationsRead);

    // ── Public Profile Modal ───────────────────────────────────────────────
    document.getElementById('btn-close-public-profile')?.addEventListener('click', closePublicProfile);

    // ── AI Itinerary Modal ─────────────────────────────────────────────────
    document.getElementById('btn-open-ai-itinerary')?.addEventListener('click', openAiItineraryModal);
    document.getElementById('btn-close-ai-itinerary')?.addEventListener('click', closeAiItineraryModal);
    document.getElementById('ai-fetch-btn')?.addEventListener('click', fetchAiItinerary);

    // ── Event Chat ─────────────────────────────────────────────────────────
    document.getElementById('btn-close-event-chat')?.addEventListener('click', closeEventChat);
    document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
    document.getElementById('chat-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    // ── Account Settings ───────────────────────────────────────────────────
    document.getElementById('btn-open-account-settings')?.addEventListener('click', openAccountSettings);
    document.getElementById('btn-close-account-settings')?.addEventListener('click', closeAccountSettings);
    document.getElementById('btn-toggle-password')?.addEventListener('click', togglePasswordVisibility);

    // ── Planner Detail Actions ─────────────────────────────────────────────
    document.getElementById('pd-confirm-btn')?.addEventListener('click', openConfirmModal);
    document.getElementById('btn-modal-confirm-plan')?.addEventListener('click', confirmPlan);
    document.getElementById('btn-modal-cancel-confirm')?.addEventListener('click', closeConfirmModal);
    document.getElementById('pd-delete-btn')?.addEventListener('click', deletePlan);
    document.getElementById('btn-confirm-delete')?.addEventListener('click', confirmDeletePlan);
    document.getElementById('btn-cancel-delete')?.addEventListener('click', cancelDeletePlan);
    document.getElementById('pd-settings-btn')?.addEventListener('click', togglePlanSettings);

    // ── Discovery Filters ──────────────────────────────────────────────────
    document.querySelectorAll('.discovery-filter-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const filterType = e.currentTarget.dataset.filter;
            window.requestDiscoveryFilter?.(filterType, e.currentTarget);
        });
    });
}
