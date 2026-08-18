/* Tunanepal admin — shared helpers. */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
export const num   = (n) => Number(n || 0).toLocaleString('en-IN');

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function avatar(row) {
  return row?.avatar_url
    ? `<span class="ava"><img src="${esc(row.avatar_url)}" alt=""></span>`
    : `<span class="ava">${esc(initials(row?.name))}</span>`;
}

export function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-GB',
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

export function openModal(html) {
  closeModal();
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.id = 'modalScrim';
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  document.body.appendChild(scrim);
  const first = scrim.querySelector('input, select, textarea, button');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 80);
  return scrim;
}

export function closeModal() { $('#modalScrim')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

export async function busy(btn, label, task) {
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { return await task(); } finally { btn.disabled = false; btn.textContent = original; }
}

export const empty = (title, note) =>
  `<div class="empty"><div class="display">${esc(title)}</div><p>${esc(note)}</p></div>`;

export const skeleton = (h = 90, n = 1) =>
  Array.from({ length: n }, () => `<div class="skeleton" style="height:${h}px;margin-bottom:12px"></div>`).join('');

export function applyTheme(t) {
  const theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('tuna.admin.theme', theme);
  return theme;
}
export const savedTheme = () => localStorage.getItem('tuna.admin.theme') || 'dark';
