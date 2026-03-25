/**
 * PLANİGO - Module Bootstrap
 *
 * app.js kaldırıldı — bu dosya tek giriş noktasıdır.
 */

window._authModuleReady = true;

import { isAuthenticated, getCurrentUsername } from './services/auth.service.js';
import { navigate }             from './core/router.js';
import { on }                   from './core/store.js';
import { showToast }            from './core/toast.js';
import { scheduleIconRefresh }  from './utils/dom.js';
import { initEventListeners }   from './core/event-listeners.js';
import { maybeRestoreAiPreview } from './components/ai-itinerary.js';
import { initPushNotifications } from './services/push-notification.service.js';

import { init as initAuth, showAuthModal,
         toggleAuthMode, handleAuthSubmit, logout }
    from './screens/auth/auth.screen.js';
import { loadDiscoveryFull, showAllBudgetRoutes, openAiPlanWithCity }
    from './screens/discovery/discovery.screen.js';
import { loadWishlists, renderPaxEventsInPlanner, openEventChat, closeEventChat, sendChatMessage, toggleParticipantsList }
    from './screens/planner/planner.screen.js';
import { loadPassport, syncProfileFromAuth, initWorldMap, openFullscreenMap, handleAvatarUpload,
         loadStories, openStoryViewer, openOwnStories, openStoryAdd, closeStoryAdd,
         closeStoryViewer, storyNext, storyPrev, deleteCurrentStory, toggleStoryMenu,
         onStoryFileSelected, detectStoryLocation, submitStory }
    from './screens/profile/profile.screen.js';
import {
    initializeMap, cleanupMap,
    togglePinDescription, deselectPin, viewPinFullDetail, closePinFullDetail,
    closeAddPinModal, handleAddPin, previewPinImage, clearPinImage,
    openMapAddChoice, closeMapAddChoice, chooseAddPin, chooseAddEvent,
    closeAddEventModal, handleAddEvent, deselectEvent,
    showJoinForm, cancelJoinForm, handleJoinEvent,
    openManageEvent, closeManageEvent, awardEventStamps,
    deleteCurrentPin, openEditPin, closeEditPinModal, handleEditPin, ratePin
} from './screens/map/map.screen.js';
import { openPlannerDetail, renderPlannerDetail,
         openAiDetailModal, closePdAiDetailModal, setPdTripType, toggleHotelOptions }
    from './screens/planner/planner-detail/detail.screen.js';
import { openConfirmModal, closeConfirmModal, confirmPlan,
         deletePlan, confirmDeletePlan, cancelDeletePlan, togglePlanSettings,
         editPlan, duplicatePlan }
    from './screens/planner/planner-detail/detail.confirm.js';
import { startNotifPolling, stopNotifPolling,
         toggleNotificationPanel, markAllNotificationsRead }
    from './components/notifications.js';
import { openPublicProfile, closePublicProfile } from './components/public-profile.js';
import { openAiItineraryModal, closeAiItineraryModal, fetchAiItinerary }
    from './components/ai-itinerary.js';
import { initDestinationAutocomplete, getSelectedDestination } from './components/autocomplete.js';
import { setDateType, openDatePicker, calNav, closeCalendar, selectMonth } from './components/new-plan-form.js';
import { openAccountSettings, closeAccountSettings, togglePasswordVisibility } from './components/account-settings.js';

// Wire globals
window._moduleNavigate          = navigate;

// Auth
window.toggleAuthMode           = toggleAuthMode;
window.handleAuthSubmit         = handleAuthSubmit;
window.logout                   = logout;
window.syncProfileFromAuth      = syncProfileFromAuth;

// Discovery
window.loadDiscoveryFull        = loadDiscoveryFull;
window.showAllBudgetRoutes      = showAllBudgetRoutes;
window.openAiPlanWithCity       = openAiPlanWithCity;

// Planner
window.loadWishlists            = loadWishlists;
window.renderPaxEventsInPlanner = renderPaxEventsInPlanner;
window.openEventChat            = openEventChat;
window.closeEventChat           = closeEventChat;
window.sendChatMessage          = sendChatMessage;
window.toggleParticipantsList   = toggleParticipantsList;

// Profile
window.loadPassport             = loadPassport;
window.initWorldMap             = initWorldMap;
window.openFullscreenMap        = openFullscreenMap;
window.handleAvatarUpload       = handleAvatarUpload;

// Stories
window.loadStories              = loadStories;
window.openStoryViewer          = openStoryViewer;
window.openOwnStories           = openOwnStories;
window.openStoryAdd             = openStoryAdd;
window.closeStoryAdd            = closeStoryAdd;
window.closeStoryViewer         = closeStoryViewer;
window.storyNext                = storyNext;
window.storyPrev                = storyPrev;
window.deleteCurrentStory       = deleteCurrentStory;
window.toggleStoryMenu          = toggleStoryMenu;
window.onStoryFileSelected      = onStoryFileSelected;
window.detectStoryLocation      = detectStoryLocation;
window.submitStory              = submitStory;

// Map
window.initializeMap            = initializeMap;
window.cleanupMap               = cleanupMap;
window.togglePinDescription     = togglePinDescription;
window.deselectPin              = deselectPin;
window.viewPinFullDetail        = viewPinFullDetail;
window.closePinFullDetail       = closePinFullDetail;
window.closeAddPinModal         = closeAddPinModal;
window.handleAddPin             = handleAddPin;
window.previewPinImage          = previewPinImage;
window.clearPinImage            = clearPinImage;
window.openMapAddChoice         = openMapAddChoice;
window.closeMapAddChoice        = closeMapAddChoice;
window.chooseAddPin             = chooseAddPin;
window.chooseAddEvent           = chooseAddEvent;
window.closeAddEventModal       = closeAddEventModal;
window.handleAddEvent           = handleAddEvent;
window.deselectEvent            = deselectEvent;
window.showJoinForm             = showJoinForm;
window.cancelJoinForm           = cancelJoinForm;
window.handleJoinEvent          = handleJoinEvent;
window.openManageEvent          = openManageEvent;
window.closeManageEvent         = closeManageEvent;
window.awardEventStamps         = awardEventStamps;
window.deleteCurrentPin         = deleteCurrentPin;
window.openEditPin              = openEditPin;
window.closeEditPinModal        = closeEditPinModal;
window.handleEditPin            = handleEditPin;
window.ratePin                  = ratePin;

// Notifications
window.toggleNotificationPanel  = toggleNotificationPanel;
window.markAllNotificationsRead = markAllNotificationsRead;

// Public Profile
window.openPublicProfile        = openPublicProfile;
window.closePublicProfile       = closePublicProfile;

// AI Itinerary
window.openAiItineraryModal     = openAiItineraryModal;
window.closeAiItineraryModal    = closeAiItineraryModal;
window.fetchAiItinerary         = fetchAiItinerary;

// Autocomplete
window.initDestinationAutocomplete = initDestinationAutocomplete;
window.getSelectedDestination      = getSelectedDestination;

// New Plan Form — date picker
window.setDateType    = setDateType;
window.openDatePicker = openDatePicker;
window.calNav         = calNav;
window.closeCalendar  = closeCalendar;
window.selectMonth    = selectMonth;

// Account Settings
window.openAccountSettings      = openAccountSettings;
window.closeAccountSettings     = closeAccountSettings;
window.togglePasswordVisibility = togglePasswordVisibility;

// Planner Detail
window.openPlannerDetail        = openPlannerDetail;
window.renderPlannerDetail      = renderPlannerDetail;
window.openAiDetailModal        = openAiDetailModal;
window.closePdAiDetailModal     = closePdAiDetailModal;
window.setPdTripType            = setPdTripType;
window.toggleHotelOptions       = toggleHotelOptions;
window.openConfirmModal         = openConfirmModal;
window.closeConfirmModal        = closeConfirmModal;
window.confirmPlan              = confirmPlan;
window.deletePlan               = deletePlan;
window.confirmDeletePlan        = confirmDeletePlan;
window.cancelDeletePlan         = cancelDeletePlan;
window.togglePlanSettings       = togglePlanSettings;
window.editPlan                 = editPlan;
window.duplicatePlan            = duplicatePlan;

// Auth events
on('auth:login', ({ detail }) => {
    syncProfileFromAuth();
    navigate('planner');
    loadWishlists();
    startNotifPolling(30000);
    initPushNotifications(localStorage.getItem('auth_token'));
    maybeRestoreAiPreview();
    showToast(`Hos geldin, ${detail.username || getCurrentUsername()}!`, 'success');
});

on('auth:logout', () => {
    stopNotifPolling();
    showAuthModal();
});

on('auth:expired', () => {
    showToast('Oturum suresi doldu, lutfen tekrar giris yap.', 'error');
    stopNotifPolling();
    showAuthModal();
});

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[PLANiGO Modules] Bootstrap aktif - tek giris noktasi');
    try {
        initEventListeners();
    } catch(e) { console.error('[Bootstrap] initEventListeners hatası:', e); }
    try {
        initAuth();
    } catch(e) { console.error('[Bootstrap] initAuth hatası:', e); }
    try {
        if (!isAuthenticated()) {
            showAuthModal();
        } else {
            syncProfileFromAuth();
            navigate('planner');
            startNotifPolling(30000);
            maybeRestoreAiPreview();
        }
    } catch(e) {
        console.error('[Bootstrap] Başlatma hatası:', e);
        showAuthModal(); // fallback: auth modalını göster
    }
    try { scheduleIconRefresh(); } catch(e) {}
}, { once: true });
