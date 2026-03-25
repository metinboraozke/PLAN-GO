/**
 * PLANİGO - Formatting Utilities
 * Pure functions, no DOM side effects.
 */

export function formatPrice(amount, currency = 'TRY') {
    if (!amount && amount !== 0) return '—';
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺';
    return `${symbol}${new Intl.NumberFormat('tr-TR').format(amount)}`;
}

export function formatCurrency(amount, currency = 'TRY') {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency, maximumSignificantDigits: 3 }).format(amount);
}


export function formatDateRange(start, end) {
    if (!start) return 'Tarih Belirlenmedi';
    try {
        const s = new Date(start);
        const e = end ? new Date(end) : null;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[s.getMonth()]} ${s.getDate()}${e ? `-${e.getDate()}` : ''}`;
    } catch { return start; }
}

export function formatNotifTime(isoStr) {
    if (!isoStr) return '';
    const d    = new Date(isoStr);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)     return 'Az önce';
    if (diff < 3600)   return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)} sa önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
}
