/* Tunanepal admin — bootstrap, sign-in, view routing. */

import { rpc, rpcAuth, getToken, setToken, clearToken } from './api.js';
import { $, $$, toast, busy, applyTheme, savedTheme, openModal, closeModal, esc } from './ui.js';
import { showDashboard, redrawCharts } from './dashboard.js';

applyTheme(savedTheme());

const VIEWS = {
  dashboard: showDashboard
};

let current = null;
let refreshTimer = null;

/* ─────────────────────────────────────────────────────────────── routing ── */
export async function go(view) {
  if (!$(`#view-${view}`)) return;
  $$('.view').forEach((v) => v.toggleAttribute('data-on', v.id === `view-${view}`));
  $$('.navb').forEach((b) => b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
  current = view;
  window.scrollTo({ top: 0 });
  if (VIEWS[view]) {
    try { await VIEWS[view](); }
    catch (e) { if (e.expired) return signOut(); toast(e.message, 'bad'); }
  }
}

$('#nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.navb[data-view]');
  if (btn) go(btn.dataset.view);
});

/* ─────────────────────────────────────────────────────────────── sign in ── */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginErr');
  err.hidden = true;
  try {
    const out = await busy($('#loginBtn'), 'Checking…', () =>
      rpc('tuna_admin_login', { p_id: $('#adminId').value, p_password: $('#adminPass').value }));
    setToken(out.token);
    localStorage.setItem('tuna.admin.id', out.admin_id);
    await enterPanel(out.admin_id);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

async function enterPanel(adminId) {
  $('#login').hidden = true;
  $('#panel').hidden = false;
  $('#whoami').textContent = adminId || '—';
  await go('dashboard');
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (current === 'dashboard' && document.visibilityState === 'visible') {
      showDashboard().catch(() => {});
    }
  }, 45000);
}

export function signOut() {
  clearToken();
  localStorage.removeItem('tuna.admin.id');
  clearInterval(refreshTimer);
  location.reload();
}
$('#logoutBtn').addEventListener('click', signOut);

/* ───────────────────────────────────────────────────────── theme toggle ── */
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  $('#themeLabel').textContent = next === 'dark' ? 'Dark' : 'Light';
  redrawCharts();
});

/* ──────────────────────────────────────────────────── change password ── */
$('#passBtn').addEventListener('click', () => {
  openModal(`
    <h2>Change password</h2>
    <p class="sub">Signing in elsewhere will be logged out.</p>
    <div class="alert alert--bad" id="pwErr" hidden></div>
    <label class="field"><span class="label">Current password</span>
      <input type="password" id="pwCur" autocomplete="current-password"></label>
    <label class="field"><span class="label">New password</span>
      <input type="password" id="pwNew" autocomplete="new-password" placeholder="At least 8 characters"></label>
    <div class="row" style="margin-top:16px">
      <button class="btn grow" id="pwSave">Save password</button>
      <button class="btn btn--ghost" id="pwCancel">Cancel</button>
    </div>`);
  $('#pwCancel').addEventListener('click', closeModal);
  $('#pwSave').addEventListener('click', async (ev) => {
    const err = $('#pwErr'); err.hidden = true;
    try {
      await busy(ev.currentTarget, 'Saving…', () =>
        rpcAuth('tuna_admin_change_password', { p_current: $('#pwCur').value, p_new: $('#pwNew').value }));
      closeModal();
      toast('Password changed.', 'good');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
});

/* ──────────────────────────────────────────────────────────────── start ── */
(async function start() {
  $('#themeLabel').textContent = savedTheme() === 'dark' ? 'Dark' : 'Light';
  if (!getToken()) { $('#login').hidden = false; return; }
  try {
    await rpcAuth('tuna_admin_stats');        // cheap probe: is the token still good?
    await enterPanel(localStorage.getItem('tuna.admin.id'));
  } catch {
    clearToken();
    $('#login').hidden = false;
  }
})();
