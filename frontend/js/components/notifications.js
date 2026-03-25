/**
 * PLANİGO - Notifications Component
 * Full port from app.js lines 1586-1758.
 */

import { getNotifications, markNotificationsRead } from '../services/notification.service.js';
import { getCurrentUserId } from '../services/auth.service.js';
import { escapeHtml } from '../utils/dom.js';
import { updatePaxEventStatus } from '../utils/storage.js';
import { formatNotifTime } from '../utils/format.js';

// ── State ──────────────────────────────────────────────────────────────────
let _pollInterval = null;
let _lastNotifIds = new Set();
let _cachedNotifs = [];

// ── User ID helper ─────────────────────────────────────────────────────────
function _userId() {
    return getCurrentUserId() || sessionStorage.getItem('pax_creator_id') || null;
}

// ── Load & Badge Update ────────────────────────────────────────────────────
export async function loadNotifications() {
    const userId = _userId();
    if (!userId) return;

    const { data } = await getNotifications(userId);
    if (!data) return;

    const unread = data.unread ?? 0;
    const badge  = document.getElementById('notif-badge');
    if (badge) {
        badge.textContent   = unread > 9 ? '9+' : String(unread);
        badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    _cachedNotifs = data.notifications || [];
    _checkForNewBrowserNotifs(_cachedNotifs);
}

// ── Panel Toggle ───────────────────────────────────────────────────────────
export function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;

    if (panel.classList.contains('show')) {
        closeNotificationPanel();
    } else {
        renderNotifications(_cachedNotifs);
        panel.classList.add('show');
        setTimeout(() => {
            document.addEventListener('click', _outsideClick, { once: true });
        }, 0);
    }
}

function _outsideClick(e) {
    const panel = document.getElementById('notification-panel');
    const bell  = document.getElementById('btn-notif-bell');
    if (!panel) return;
    if (!panel.contains(e.target) && !bell?.contains(e.target)) {
        closeNotificationPanel();
    }
}

export function closeNotificationPanel() {
    document.getElementById('notification-panel')?.classList.remove('show');
}

// ── Render ─────────────────────────────────────────────────────────────────
const NOTIF_ICON = {
    join_approved:  '🎉',
    join_rejected:  '😔',
    event_reminder: '⏰',
    event_stamp:    '🏅',
};

export function renderNotifications(notifs) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!notifs || notifs.length === 0) {
        list.innerHTML = `
            <div class="notif-empty">
                <span class="notif-empty-icon">🔔</span>
                Henüz bildirim yok
            </div>`;
        return;
    }

    // Sync planner statuses from notifications
    notifs.forEach(n => {
        if (n.event_id) {
            if (n.type === 'join_approved') updatePaxEventStatus(n.event_id, 'approved');
            if (n.type === 'join_rejected') updatePaxEventStatus(n.event_id, 'rejected');
        }
    });

    list.innerHTML = notifs.map(n => {
        const icon        = NOTIF_ICON[n.type] || '🔔';
        const unreadClass = n.read ? '' : 'unread';
        const iconClass   = n.type === 'join_rejected' ? 'notif-icon--rejected' : '';
        const timeStr     = formatNotifTime(n.created_at);
        return `
        <div class="notif-item ${unreadClass}" data-notif-id="${n._id || n.id || ''}">
            <div class="notif-icon ${iconClass}">${icon}</div>
            <div class="notif-content">
                <div class="notif-title">${escapeHtml(n.title)}</div>
                <div class="notif-body">${escapeHtml(n.body)}</div>
                <div class="notif-time">${timeStr}</div>
            </div>
        </div>`;
    }).join('');
}

// ── Mark All Read ──────────────────────────────────────────────────────────
export async function markAllNotificationsRead() {
    const userId = _userId();
    if (!userId) return;

    await markNotificationsRead(userId);

    const badge = document.getElementById('notif-badge');
    if (badge) badge.style.display = 'none';

    document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    _cachedNotifs.forEach(n => { n.read = true; });
}

// ── Polling ────────────────────────────────────────────────────────────────
export function startNotifPolling(intervalMs = 30000) {
    stopNotifPolling();
    _requestBrowserNotifPermission();
    loadNotifications();
    _pollInterval = setInterval(loadNotifications, intervalMs);
}

export function stopNotifPolling() {
    if (_pollInterval) {
        clearInterval(_pollInterval);
        _pollInterval = null;
    }
}

// ── Browser Notifications ──────────────────────────────────────────────────
function _requestBrowserNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
    }
}

function _checkForNewBrowserNotifs(notifs) {
    const newItems = notifs.filter(n => !n.read && !_lastNotifIds.has(n._id || n.id));
    _lastNotifIds  = new Set(notifs.map(n => n._id || n.id));

    for (const n of newItems.slice(0, 3)) {
        _showBrowserNotification(n.title, n.body);
    }
}

function _showBrowserNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        new Notification(title, {
            body,
            icon:  '/Frontend/icons/icon-192.png',
            badge: '/Frontend/icons/icon-192.png',
            tag:   `planigo-${Date.now()}`,
        });
    } catch { /* denied or blocked */ }
}
