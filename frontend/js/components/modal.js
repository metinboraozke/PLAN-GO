/**
 * PLANİGO - Generic Modal Helper
 * Open/close modal elements by ID.
 */

export function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = 'flex';
}

export function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = '';
}

