/**
 * PLANİGO - Planner Detail Confirm & Delete
 * Handles plan confirmation modal, deletion modal, and settings dropdown.
 */

import { confirmPlan as confirmPlanApi, deleteWishlist } from '../../../services/planner.service.js';
import { showToast }                                     from '../../../core/toast.js';
import { launchConfetti }                                from '../../../utils/confetti.js';
import { loadWishlists }                                 from '../../planner/planner.screen.js';
import { getCurrentPlanId }                              from './detail.screen.js';
import { navigate }                                      from '../../../core/router.js';

// ============================================
// MODULE STATE
// ============================================

/** ID queued for deletion — set in deletePlan(), consumed in confirmDeletePlan() */
let _pendingDeletePlanId = null;

// ============================================
// CONFIRM MODAL
// ============================================

/**
 * Opens the plan-confirm modal.
 */
export function openConfirmModal() {
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.remove('hidden');
}

/**
 * Closes the plan-confirm modal.
 * When called from an overlay click event, only closes if the overlay itself was clicked.
 * @param {Event} [event]
 */
export function closeConfirmModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.add('hidden');
}

/**
 * Confirms the current plan via the API, fires confetti, then navigates back.
 */
export async function confirmPlan() {
    const planId = getCurrentPlanId();
    if (!planId) return;

    // Close modal immediately for snappy UX
    const modal = document.getElementById('modal-plan-confirm');
    if (modal) modal.classList.add('hidden');

    try {
        const res = await confirmPlanApi(planId);

        if (res?.data !== null && !res?.error) {
            // Trigger canvas confetti
            launchConfetti();

            // Hide action bar while confetti plays
            const actionBar = document.getElementById('pd-action-bar');
            if (actionBar) actionBar.style.display = 'none';

            // Navigate back to Planlarım after confetti finishes (~2.2 s)
            setTimeout(() => {
                const bar = document.getElementById('pd-action-bar');
                if (bar) bar.style.display = 'none';
                navigate('planner'); // scroll reset + loadWishlists router üzerinden
            }, 2200);
        } else {
            showToast('Onaylama başarısız, tekrar dene.', 'error');
        }
    } catch (err) {
        console.error('confirmPlan error:', err);
        showToast('Bir hata oluştu.', 'error');
    }
}

// ============================================
// DELETE MODAL
// ============================================

/**
 * Initiates the delete flow: stores the current plan ID, hides the settings
 * dropdown, and shows the delete confirmation modal (injecting it if missing).
 */
export function deletePlan() {
    const planId = getCurrentPlanId();
    if (!planId) {
        showToast('Plan ID bulunamadı', 'error');
        return;
    }

    _pendingDeletePlanId = planId;

    // Close the settings dropdown
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');

    // Show the modal; inject dynamically if DOM cache missed it
    let modal = document.getElementById('modal-confirm-delete');
    if (!modal) {
        _injectDeleteModal();
        modal = document.getElementById('modal-confirm-delete');
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    } else {
        // Absolute fallback
        if (window.confirm('Bu planı silmek istediğinize emin misiniz?')) {
            confirmDeletePlan();
        }
    }
}

/**
 * Executes the deletion after the user confirms in the modal.
 */
export async function confirmDeletePlan() {
    if (!_pendingDeletePlanId) return;

    const btnConfirm   = document.getElementById('btn-confirm-delete');
    const originalText = btnConfirm ? btnConfirm.textContent : 'Evet, Sil';

    try {
        if (btnConfirm) btnConfirm.textContent = 'Siliniyor...';

        const response = await deleteWishlist(_pendingDeletePlanId);

        if (response?.status < 300) {
            showToast('Plan başarıyla silindi', 'success');

            // Hide the modal
            const modal = document.getElementById('modal-confirm-delete');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }

            // Navigate back to planner list (scroll reset + loadWishlists router üzerinden)
            navigate('planner');
        } else {
            throw new Error('Silme işlemi başarısız');
        }
    } catch (error) {
        console.error('Plan silme hatası:', error);
        showToast('Plan silinemedi: ' + (error.message || error), 'error');
    } finally {
        if (btnConfirm) btnConfirm.textContent = originalText;
        _pendingDeletePlanId = null;
    }
}

/**
 * Cancels the delete flow and hides the confirmation modal.
 */
export function cancelDeletePlan() {
    const modal = document.getElementById('modal-confirm-delete');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    _pendingDeletePlanId = null;
}

// ============================================
// SETTINGS DROPDOWN
// ============================================

/**
 * Toggles the plan-settings dropdown open/closed.
 * Registers a one-shot outside-click listener to auto-close it.
 */
export function togglePlanSettings() {
    const dropdown = document.getElementById('plan-settings-dropdown');
    if (!dropdown) return;

    dropdown.classList.toggle('hidden');
    window.lucide?.createIcons();

    // Auto-close on outside click
    setTimeout(() => {
        document.addEventListener('click', _closePlanSettingsOnOutsideClick);
    }, 100);
}

function _closePlanSettingsOnOutsideClick(e) {
    const dropdown = document.getElementById('plan-settings-dropdown');
    const btn      = document.getElementById('btn-plan-settings');

    if (dropdown && !dropdown.contains(e.target) && !btn?.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', _closePlanSettingsOnOutsideClick);
    }
}

// ============================================
// DYNAMIC MODAL INJECTION
// ============================================

/**
 * Injects the delete-confirmation modal into the DOM when it is absent
 * (e.g. due to a stale HTML cache).
 */
function _injectDeleteModal() {
    if (document.getElementById('modal-confirm-delete')) return;

    const html = `
        <div id="modal-confirm-delete"
            class="hidden fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 transition-opacity duration-300">
            <div class="bg-white w-full max-w-sm rounded-2xl p-6 relative text-center shadow-2xl transform transition-all scale-100">
                <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Planı İptal Et?</h3>
                <p class="text-slate-500 mb-6 text-sm leading-relaxed">
                    Bu seyahat planını tamamen silmek istediğinden emin misin? <br>
                    <span class="text-red-400 text-xs">(Bu işlem geri alınamaz)</span>
                </p>
                <div class="flex gap-3">
                    <button id="btn-cancel-delete"
                        class="flex-1 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors">
                        Vazgeç
                    </button>
                    <button id="btn-confirm-delete"
                        class="flex-1 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 hover:scale-[1.02] transition-all">
                        Evet, Sil
                    </button>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    _bindDeleteModalListeners();
}

/**
 * Binds click handlers on the injected delete modal buttons.
 * Called once after dynamic injection.
 */
function _bindDeleteModalListeners() {
    const btnCancel  = document.getElementById('btn-cancel-delete');
    const btnConfirm = document.getElementById('btn-confirm-delete');
    const modal      = document.getElementById('modal-confirm-delete');

    if (btnCancel)  btnCancel.onclick  = cancelDeletePlan;
    if (btnConfirm) btnConfirm.onclick = confirmDeletePlan;

    // Close on backdrop click
    if (modal) modal.onclick = (e) => { if (e.target === modal) cancelDeletePlan(); };
}


// ============================================
// PLAN SETTINGS STUBS (yakinda)
// ============================================

export function editPlan() {
    showToast('Duzenleme ozelligi yakinda...', 'info');
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');
}

export function duplicatePlan() {
    showToast('Kopyalama ozelligi yakinda...', 'info');
    document.getElementById('plan-settings-dropdown')?.classList.add('hidden');
}

// ============================================
// GLOBAL BRIDGE (inline onclick handlers in HTML)
// ============================================

window._pdOpenConfirmModal    = openConfirmModal;
window._pdCloseConfirmModal   = closeConfirmModal;
window._pdConfirmPlan         = confirmPlan;
window._pdDeletePlan          = deletePlan;
window._pdConfirmDeletePlan   = confirmDeletePlan;
window._pdCancelDeletePlan    = cancelDeletePlan;
window._pdTogglePlanSettings  = togglePlanSettings;
