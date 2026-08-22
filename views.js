/* Tunanepal admin — every working view.
   One pattern throughout: fetch → render a table → wire the row actions. */

import { rpcAuth, upload, BUCKET_PUBLIC } from './api.js';
import {
  $, $$, esc, money, num, when, ago, avatar, toast, busy,
  openModal, closeModal, empty, skeleton
} from './ui.js';

const box = (id) => $(`#${id}`);
const wrap = (html) => `<div class="card"><div class="tablewrap">${html}</div></div>`;
const pill = (s) => {
  const m = { pending: 'pill--wait', approved: 'pill--win', delivered: 'pill--win',
              rejected: 'pill--bad', paid: 'pill--win', unpaid: 'pill--wait',
              settled: 'pill--win', disputed: 'pill--bad', claimed: 'pill--wait',
              playing: 'pill--info', open: 'pill--info', matched: 'pill--wait',
              expired: '', cancelled: '', void: '', closed: '' };
  return `<span class="pill ${m[s] ?? ''}">${esc(s)}</span>`;
};
const money0 = (n) => `<span class="mono">${money(n)}</span>`;

/* Screenshots open full size rather than squinting at a thumbnail. */
const proof = (url) => url
  ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="proofthumb">
       <img src="${esc(url)}" alt="proof" loading="lazy"></a>`
  : '<span class="muted xs">none</span>';

async function load(id, fn, render) {
  box(id).innerHTML = skeleton(120);
  try {
    const data = await fn();
    box(id).innerHTML = render(data);
    return data;
  } catch (e) {
    box(id).innerHTML = `<div class="alert alert--bad">${esc(e.message)}</div>`;
    if (e.expired) throw e;
  }
}

/* ═══════════════════════════════════════════════════════════════ PLAYERS ══ */
let playerQuery = '';

export async function showPlayers() {
  if (!$('#pSearch')) {
    box('playersBody').innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <input type="search" id="pSearch" placeholder="Search by name or phone number…">
      </div>
      <div id="playersTable"></div>`;
    $('#pSearch').addEventListener('input', debounce(() => {
      playerQuery = $('#pSearch').value;
      loadPlayers();
    }, 300));
  }
  await loadPlayers();
}

async function loadPlayers() {
  await load('playersTable', () => rpcAuth('tuna_admin_players', { p_q: playerQuery }), (rows) => {
    if (!rows.length) return empty('No players', 'Nobody matches that search.');
    return wrap(`<table>
      <thead><tr>
        <th>Player</th><th>Phone (ID)</th><th>Points</th><th>Owed</th><th>Matches</th>
        <th>Wins</th><th>Deposited</th><th>Withdrawn</th><th>Joined</th><th>Actions</th>
      </tr></thead><tbody>
      ${rows.map((r) => `<tr${r.blocked ? ' class="rowdim"' : ''}>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}
          <span class="truncate"><b>${esc(r.name)}</b>
          ${r.blocked ? '<span class="pill pill--bad">Blocked</span>' : ''}</span></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td class="num" style="color:var(--marigold)">${money(r.points)}</td>
        <td class="num">${r.owed > 0
          ? `<span class="pill pill--bad">${money(r.owed)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num">${r.matches}</td>
        <td class="num">${r.wins}</td>
        <td class="num">${money(r.deposited)}</td>
        <td class="num">${money(r.withdrawn)}</td>
        <td class="xs muted">${esc(when(r.created_at))}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--win btn--xs" data-pts="${r.id}" data-name="${esc(r.name)}"
                  data-bal="${r.points}">Add</button>
          <button class="btn btn--gold btn--xs" data-take="${r.id}" data-name="${esc(r.name)}"
                  data-bal="${r.points}">Take</button>
          <button class="btn btn--xs" data-fine="${r.id}" data-name="${esc(r.name)}"
                  data-bal="${r.points}">Fine</button>
          <button class="btn btn--ghost btn--xs" data-pw="${r.id}" data-name="${esc(r.name)}"
                  data-phone="${esc(r.phone)}">Password</button>
          <button class="btn ${r.blocked ? 'btn--win' : 'btn--ghost'} btn--xs"
                  data-block="${r.id}" data-on="${r.blocked ? 1 : 0}">
            ${r.blocked ? 'Unblock' : 'Block'}</button>
        </div></td>
      </tr>`).join('')}
      </tbody></table>`);
  });

  $$('[data-pts]').forEach((b) => b.addEventListener('click', () => pointsModal(b.dataset)));
  $$('[data-fine]').forEach((b) => b.addEventListener('click', () => fineModal(b.dataset)));
  $$('[data-take]').forEach((b) => b.addEventListener('click', () => takeModal(b.dataset)));
  $$('[data-pw]').forEach((b) => b.addEventListener('click', () => passwordModal(b.dataset)));
  $$('[data-block]').forEach((b) => b.addEventListener('click', async () => {
    const on = b.dataset.on === '1';
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_block', { p_player: b.dataset.block, p_blocked: !on }));
      toast(on ? 'Player unblocked.' : 'Player blocked and signed out.', on ? 'good' : '');
      loadPlayers();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

function pointsModal(d) {
  openModal(`
    <h2>Adjust points</h2>
    <p class="sub">${esc(d.name)} · currently ${money(d.bal)}</p>
    <div class="alert alert--bad" id="ptErr" hidden></div>
    <label class="field"><span class="label">Amount — positive to add, negative to remove</span>
      <input type="number" id="ptAmt" placeholder="e.g. 500 or -200"></label>
    <label class="field"><span class="label">Reason (the player sees this)</span>
      <input type="text" id="ptNote" placeholder="e.g. Bonus, or correction for deposit #12"></label>
    <div class="row" style="margin-top:16px">
      <button class="btn grow" id="ptGo">Apply</button>
      <button class="btn btn--ghost" id="ptCancel">Cancel</button>
    </div>`);
  $('#ptCancel').addEventListener('click', closeModal);
  $('#ptGo').addEventListener('click', async (e) => {
    const err = $('#ptErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Applying…', () => rpcAuth('tuna_admin_adjust_points', {
        p_player: d.pts, p_amount: parseInt($('#ptAmt').value, 10), p_note: $('#ptNote').value
      }));
      closeModal(); toast('Points updated.', 'good'); loadPlayers();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function takeModal(d) {
  openModal(`
    <h2>Take points</h2>
    <p class="sub">${esc(d.name)} · balance ${money(d.bal)}</p>
    <div class="alert alert--bad" id="tkErr" hidden></div>

    <label class="field"><span class="label">Amount to remove</span>
      <div class="filterbar" id="tkChips" style="margin-bottom:8px">
        ${[50, 100, 500].map((a) => `<button data-a="${a}">Rs ${a}</button>`).join('')}
        <button data-a="${d.bal}">All (${d.bal})</button>
      </div>
      <input type="number" id="tkAmt" placeholder="Enter amount">
    </label>

    <label class="field"><span class="label">Reason — the player sees this</span>
      <input type="text" id="tkReason" placeholder="e.g. Correction for deposit #14"></label>

    <div class="alert alert--info">
      A straight deduction. Nothing is carried forward — use <b>Fine</b> instead
      if you want the rest chased from their next deposit.
    </div>

    <div class="row" style="margin-top:6px">
      <button class="btn grow" id="tkGo">Take points</button>
      <button class="btn btn--ghost" id="tkCancel">Cancel</button>
    </div>`);

  $('#tkChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    $('#tkAmt').value = b.dataset.a;
    $$('#tkChips button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('#tkCancel').addEventListener('click', closeModal);
  $('#tkGo').addEventListener('click', async (e) => {
    const err = $('#tkErr'); err.hidden = true;
    try {
      const out = await busy(e.currentTarget, 'Removing…', () => rpcAuth('tuna_admin_take_points', {
        p_player: d.take,
        p_amount: parseInt($('#tkAmt').value, 10),
        p_reason: $('#tkReason').value
      }));
      closeModal();
      toast(`${money(out.taken)} removed. New balance ${money(out.points)}.`, 'good');
      loadPlayers();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function passwordModal(d, requestId = null) {
  const suggested = 'tuna' + Math.floor(1000 + Math.random() * 9000);
  openModal(`
    <h2>Set a new password</h2>
    <p class="sub">${esc(d.name)} · ${esc(d.phone)}</p>
    <div class="alert alert--bad" id="spErr" hidden></div>

    <label class="field"><span class="label">New password</span>
      <input type="text" id="spNew" class="mono" value="${suggested}">
      <span class="label" style="margin-top:4px;color:var(--ink-3)">
        Give this to the player. They can change it in Settings once signed in.</span></label>

    <div class="alert alert--info">
      Saving signs them out everywhere, so the old password stops working immediately.
    </div>

    <div class="row" style="margin-top:6px">
      <button class="btn grow" id="spGo">Set password</button>
      <button class="btn btn--ghost" id="spCancel">Cancel</button>
    </div>`);

  $('#spCancel').addEventListener('click', closeModal);
  $('#spGo').addEventListener('click', async (e) => {
    const err = $('#spErr'); err.hidden = true;
    const pw = $('#spNew').value;
    try {
      await busy(e.currentTarget, 'Saving…', () => rpcAuth('tuna_admin_set_player_password', {
        p_player: d.pw || d.playerId, p_password: pw, p_request: requestId
      }));
      closeModal();
      toast(`Password set to ${pw} — pass it to the player.`, 'good');
      if (requestId) loadResets(); else loadPlayers();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

const FINE_REASONS = [
  'False result claim',
  'Cheating or hacking',
  'Wrong room settings',
  'Abusive behaviour',
  'Teaming with opponent'
];

function fineModal(d) {
  openModal(`
    <h2>Fine a player</h2>
    <p class="sub">${esc(d.name)} · balance ${money(d.bal)}</p>
    <div class="alert alert--bad" id="fnErr" hidden></div>

    <label class="field"><span class="label">Amount</span>
      <div class="filterbar" id="fnChips" style="margin-bottom:8px">
        ${[50, 100, 200, 500].map((a) =>
          `<button data-a="${a}" aria-pressed="${a === 50}">Rs ${a}</button>`).join('')}
      </div>
      <input type="number" id="fnAmt" value="50">
    </label>

    <label class="field"><span class="label">Reason — the player sees this</span>
      <div class="filterbar" id="fnReasons" style="margin-bottom:8px">
        ${FINE_REASONS.map((r) => `<button data-r="${esc(r)}">${esc(r)}</button>`).join('')}
      </div>
      <input type="text" id="fnReason" placeholder="e.g. False result claim on match #12">
    </label>

    <div class="alert alert--info">
      If their balance is short, whatever is there is taken now and the rest is
      collected automatically from their next deposit or win.
    </div>

    <div class="row" style="margin-top:6px">
      <button class="btn grow" id="fnGo">Issue fine</button>
      <button class="btn btn--ghost" id="fnCancel">Cancel</button>
    </div>`);

  $('#fnChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    $('#fnAmt').value = b.dataset.a;
    $$('#fnChips button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('#fnReasons').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]'); if (!b) return;
    $('#fnReason').value = b.dataset.r;
    $$('#fnReasons button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('#fnCancel').addEventListener('click', closeModal);

  $('#fnGo').addEventListener('click', async (e) => {
    const err = $('#fnErr'); err.hidden = true;
    try {
      const out = await busy(e.currentTarget, 'Issuing…', () => rpcAuth('tuna_admin_fine', {
        p_player: d.fine,
        p_amount: parseInt($('#fnAmt').value, 10),
        p_reason: $('#fnReason').value
      }));
      closeModal();
      toast(out.outstanding > 0
        ? `Fined. ${money(out.collected)} taken, ${money(out.outstanding)} still owed.`
        : `Fined ${money(out.collected)}.`, 'good');
      loadPlayers();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ══════════════════════════════════════════════════════════════ DEPOSITS ══ */
let depFilter = 'pending';

export async function showDeposits() {
  if (!$('#depTabs')) {
    box('depositsBody').innerHTML =
      `${filterBar('depTabs', ['pending', 'approved', 'rejected', 'all'], depFilter)}
       <div id="depTable"></div>`;
    $('#depTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      depFilter = b.dataset.f; syncBar('depTabs', depFilter); loadDeposits();
    });
  }
  await loadDeposits();
}

async function loadDeposits() {
  await load('depTable', () => rpcAuth('tuna_admin_deposits', { p_status: depFilter }), (rows) => {
    if (!rows.length) return empty('Nothing here', `No ${depFilter} deposits.`);
    return wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Amount</th><th>Wallet</th>
        <th>Paid from</th><th>Proof</th><th>When</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td class="num" style="color:var(--marigold)">${money(r.amount)}</td>
        <td>${esc(r.method)}</td>
        <td class="xs"><b>${esc(r.sender_name)}</b><br><span class="mono">${esc(r.sender_phone)}</span></td>
        <td>${proof(r.screenshot_url)}</td>
        <td class="xs muted">${esc(ago(r.created_at))}</td>
        <td>${pill(r.status)}${r.admin_note ? `<br><span class="xs muted">${esc(r.admin_note)}</span>` : ''}</td>
        <td>${r.status === 'pending' ? `<div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--win btn--xs" data-dep-ok="${r.id}" data-amt="${r.amount}"
                  data-name="${esc(r.name)}">Approve</button>
          <button class="btn btn--ghost btn--xs" data-dep-no="${r.id}">Reject</button></div>`
          : '<span class="xs muted">done</span>'}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-dep-ok]').forEach((b) => b.addEventListener('click', () => approveDeposit(b.dataset)));
  $$('[data-dep-no]').forEach((b) => b.addEventListener('click', () =>
    rejectModal('Reject deposit', (note) =>
      rpcAuth('tuna_admin_review_deposit', { p_id: Number(b.dataset.depNo), p_action: 'reject', p_note: note })
        .then(() => { toast('Deposit rejected.'); loadDeposits(); }))));
}

function approveDeposit(d) {
  openModal(`
    <h2>Approve deposit</h2>
    <p class="sub">${esc(d.name)} — check the screenshot matches this amount.</p>
    <div class="alert alert--bad" id="daErr" hidden></div>
    <label class="field"><span class="label">Points to credit</span>
      <input type="number" id="daAmt" value="${d.amt}">
      <span class="label" style="margin-top:4px;color:var(--ink-3)">
        Change this if they typed the wrong amount.</span></label>
    <label class="field"><span class="label">Note (optional)</span>
      <input type="text" id="daNote" placeholder="Visible to the player"></label>
    <div class="row" style="margin-top:16px">
      <button class="btn btn--win grow" id="daGo">Approve and credit</button>
      <button class="btn btn--ghost" id="daCancel">Cancel</button>
    </div>`);
  $('#daCancel').addEventListener('click', closeModal);
  $('#daGo').addEventListener('click', async (e) => {
    const err = $('#daErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Crediting…', () => rpcAuth('tuna_admin_review_deposit', {
        p_id: Number(d.depOk), p_action: 'approve',
        p_amount: parseInt($('#daAmt').value, 10), p_note: $('#daNote').value
      }));
      closeModal(); toast('Approved. Points credited.', 'good'); loadDeposits();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ═══════════════════════════════════════════════════════════ WITHDRAWALS ══ */
let wdFilter = 'pending';

export async function showWithdrawals() {
  if (!$('#wdTabs')) {
    box('withdrawalsBody').innerHTML = `
      <div class="alert alert--info" style="margin-bottom:14px">
        Points are held when the player requests. Approving confirms the payout;
        rejecting returns them in full. Use <b>Mark paid</b> once you have actually sent the money.
      </div>
      ${filterBar('wdTabs', ['pending', 'approved', 'rejected', 'all'], wdFilter)}
      <div id="wdTable"></div>`;
    $('#wdTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      wdFilter = b.dataset.f; syncBar('wdTabs', wdFilter); loadWithdrawals();
    });
  }
  await loadWithdrawals();
}

async function loadWithdrawals() {
  await load('wdTable', () => rpcAuth('tuna_admin_withdrawals', { p_status: wdFilter, p_payout: 'all' }), (rows) => {
    if (!rows.length) return empty('Nothing here', `No ${wdFilter} withdrawals.`);
    return wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Amount</th><th>Send to</th>
        <th>When</th><th>Status</th><th>Payout</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td class="num" style="color:var(--crimson)">${money(r.amount)}</td>
        <td class="xs"><b>${esc(r.wallet_type)}</b><br><span class="mono">${esc(r.wallet_no)}</span>
            <br>${esc(r.wallet_name)}</td>
        <td class="xs muted">${esc(ago(r.created_at))}</td>
        <td>${pill(r.status)}${r.admin_note ? `<br><span class="xs muted">${esc(r.admin_note)}</span>` : ''}</td>
        <td>${r.status === 'approved' ? pill(r.payout) : '<span class="xs muted">—</span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          ${r.status === 'pending' ? `
            <button class="btn btn--win btn--xs" data-wd-ok="${r.id}">Approve</button>
            <button class="btn btn--ghost btn--xs" data-wd-no="${r.id}">Reject</button>` : ''}
          ${r.status === 'approved' ? `
            <button class="btn ${r.payout === 'paid' ? 'btn--ghost' : 'btn--gold'} btn--xs"
                    data-wd-paid="${r.id}" data-on="${r.payout === 'paid' ? 1 : 0}">
              ${r.payout === 'paid' ? 'Mark unpaid' : 'Mark paid'}</button>` : ''}
        </div></td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-wd-ok]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_review_withdrawal',
        { p_id: Number(b.dataset.wdOk), p_action: 'approve' }));
      toast('Approved. Now send the money and mark it paid.', 'good'); loadWithdrawals();
    } catch (e) { toast(e.message, 'bad'); }
  }));

  $$('[data-wd-no]').forEach((b) => b.addEventListener('click', () =>
    rejectModal('Reject withdrawal', (note) =>
      rpcAuth('tuna_admin_review_withdrawal', { p_id: Number(b.dataset.wdNo), p_action: 'reject', p_note: note })
        .then(() => { toast('Rejected. Points returned in full.'); loadWithdrawals(); }))));

  $$('[data-wd-paid]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_mark_paid',
        { p_id: Number(b.dataset.wdPaid), p_paid: b.dataset.on !== '1' }));
      toast('Payout status updated.', 'good'); loadWithdrawals();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

/* ═════════════════════════════════════════════════════════════════ STORE ══ */
let stFilter = 'pending';

export async function showStore() {
  if (!$('#stTabs')) {
    box('storeBody').innerHTML =
      `${filterBar('stTabs', ['pending', 'delivered', 'rejected', 'all'], stFilter)}
       <div id="stTable"></div>`;
    $('#stTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      stFilter = b.dataset.f; syncBar('stTabs', stFilter); loadStore();
    });
  }
  await loadStore();
}

async function loadStore() {
  await load('stTable', () => rpcAuth('tuna_admin_purchases', { p_status: stFilter }), (rows) => {
    if (!rows.length) return empty('Nothing here', `No ${stFilter} UC orders.`);
    return wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Pack</th><th>Price</th>
        <th>PUBG ID</th><th>Paid from</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td><b>${esc(r.pack_title)}</b><br><span class="xs muted">${r.uc_amount} UC</span></td>
        <td class="num">${money(r.price)}</td>
        <td class="num" style="color:var(--marigold)">${esc(r.pubg_id)}</td>
        <td class="xs"><span class="mono">${esc(r.wallet_no)}</span><br>${esc(r.wallet_name)}</td>
        <td>${proof(r.screenshot_url)}</td>
        <td>${pill(r.status)}${r.admin_note ? `<br><span class="xs muted">${esc(r.admin_note)}</span>` : ''}</td>
        <td>${r.status === 'pending' ? `<div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--win btn--xs" data-st-ok="${r.id}">Delivered</button>
          <button class="btn btn--ghost btn--xs" data-st-no="${r.id}">Reject</button></div>`
          : '<span class="xs muted">done</span>'}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-st-ok]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_review_purchase',
        { p_id: Number(b.dataset.stOk), p_action: 'deliver' }));
      toast('Marked delivered. The player has been notified.', 'good'); loadStore();
    } catch (e) { toast(e.message, 'bad'); }
  }));
  $$('[data-st-no]').forEach((b) => b.addEventListener('click', () =>
    rejectModal('Reject UC order', (note) =>
      rpcAuth('tuna_admin_review_purchase', { p_id: Number(b.dataset.stNo), p_action: 'reject', p_note: note })
        .then(() => { toast('Order rejected.'); loadStore(); }))));
}

/* ═══════════════════════════════════════════════════════════════ MATCHES ══ */
let mFilter = 'claimed';

export async function showMatches() {
  if (!$('#mTabs')) {
    box('matchesBody').innerHTML = `
      <div class="alert alert--info" style="margin-bottom:14px">
        Check the proof screenshot, then release the payout to the real winner.
        <b>Void</b> returns both stakes and takes no commission.
      </div>
      ${filterBar('mTabs', ['claimed', 'disputed', 'playing', 'settled', 'all'], mFilter)}
      <div id="mTable"></div>`;
    $('#mTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      mFilter = b.dataset.f; syncBar('mTabs', mFilter); loadMatches();
    });
  }
  await loadMatches();
}

async function loadMatches() {
  await load('mTable', () => rpcAuth('tuna_admin_matches', { p_status: mFilter }), (rows) => {
    if (!rows.length) return empty('Nothing here', `No ${mFilter} matches.`);
    return wrap(`<table>
      <thead><tr><th>#</th><th>Game</th><th>Host</th><th>Opponent</th><th>Stake</th>
        <th>Pot</th><th>Payout</th><th>Claimed by</th><th>Proof</th><th>Status</th><th>Settle</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num">${r.id}</td>
        <td><b>${esc(r.game === 'pubg' ? 'PUBG' : 'Free Fire')}</b>
            <br><span class="xs muted">${esc(r.team_size.toUpperCase())}</span></td>
        <td><b>${esc(r.host_name)}</b><br><span class="xs muted mono">${esc(r.host_phone)}</span></td>
        <td><b>${esc(r.opp_name)}</b><br><span class="xs muted mono">${esc(r.opp_phone)}</span></td>
        <td class="num">${money(r.stake)}</td>
        <td class="num">${money(r.pot)}</td>
        <td class="num" style="color:var(--win)">${money(r.payout)}</td>
        <td>${r.claimed_name ? `<b>${esc(r.claimed_name)}</b>` : '<span class="xs muted">nobody</span>'}</td>
        <td>${proof(r.proof_url)}</td>
        <td>${pill(r.status)}</td>
        <td>${r.status === 'settled' || r.status === 'void' ? '<span class="xs muted">done</span>'
          : `<button class="btn btn--win btn--xs" data-settle="${r.id}"
               data-host="${r.host_id}" data-opp="${r.opponent_id}"
               data-hn="${esc(r.host_name)}" data-on2="${esc(r.opp_name)}"
               data-pay="${r.payout}">Settle</button>`}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-settle]').forEach((b) => b.addEventListener('click', () => settleModal(b.dataset)));
}

function settleModal(d) {
  openModal(`
    <h2>Settle match #${esc(d.settle)}</h2>
    <p class="sub">The winner receives ${money(d.pay)} immediately.</p>
    <div class="alert alert--bad" id="seErr" hidden></div>
    <div class="pickwin">
      <button data-w="${d.host}"><b>${esc(d.hn)}</b><small>Host</small></button>
      <button data-w="${d.opp}"><b>${esc(d.on2)}</b><small>Opponent</small></button>
    </div>
    <label class="field" style="margin-top:14px"><span class="label">Note (optional)</span>
      <input type="text" id="seNote" placeholder="Both players see this"></label>

    <label class="agreecheck">
      <input type="checkbox" id="seFine">
      <span>Fine the other player for a false claim</span>
      <input type="number" id="seFineAmt" value="50" style="width:88px">
    </label>

    <div class="row" style="margin-top:12px">
      <button class="btn btn--ghost grow" id="seVoid">Void — return both stakes</button>
      <button class="btn btn--ghost" id="seCancel">Cancel</button>
    </div>`);

  $('#seCancel').addEventListener('click', closeModal);
  $$('.pickwin button').forEach((b) => b.addEventListener('click', () =>
    doSettle(b, d.settle, b.dataset.w)));
  $('#seVoid').addEventListener('click', (e) => doSettle(e.currentTarget, d.settle, null));
}

async function doSettle(btn, id, winner) {
  const err = $('#seErr'); err.hidden = true;
  try {
    const fine = winner && $('#seFine')?.checked
      ? parseInt($('#seFineAmt').value, 10) || 0 : 0;
    const out = await busy(btn, 'Settling…', () => rpcAuth('tuna_admin_settle_match', {
      p_id: Number(id), p_winner: winner, p_note: $('#seNote').value,
      p_fine_loser: fine, p_fine_reason: fine ? `False result claim on match #${id}` : null
    }));
    closeModal();
    toast(!winner ? 'Match voided, stakes returned.'
      : out.fined ? `Payout released. Other player fined ${money(out.fined)}.`
      : 'Payout released.', 'good');
    loadMatches();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
}

/* ═════════════════════════════════════════════════════════════════ ROOMS ══ */
export async function showRooms() {
  await load('roomsBody', () => rpcAuth('tuna_admin_rooms'), (rows) => {
    if (!rows.length) return empty('No rooms', 'Nothing has been posted yet.');
    return wrap(`<table>
      <thead><tr><th>#</th><th>Host</th><th>Game</th><th>Rules</th><th>Stake</th>
        <th>Room</th><th>Opponent</th><th>Status</th><th>Posted</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num">${r.id}</td>
        <td><b>${esc(r.host_name)}</b><br><span class="xs muted mono">${esc(r.host_phone)}</span></td>
        <td><b>${esc(r.game === 'pubg' ? 'PUBG' : 'Free Fire')}</b>
            <br><span class="xs muted">${esc(r.team_size.toUpperCase())}</span></td>
        <td class="xs">${ruleSummary(r)}</td>
        <td class="num">${money(r.amount)}</td>
        <td class="xs"><span class="mono">${esc(r.room_code)}</span> / ${esc(r.room_pass)}
            <br><span class="muted">${esc(r.game_name)}</span></td>
        <td>${r.opp_name ? esc(r.opp_name) : '<span class="xs muted">—</span>'}</td>
        <td>${pill(r.status)}</td>
        <td class="xs muted">${esc(ago(r.created_at))}</td>
      </tr>`).join('')}</tbody></table>`);
  });
}

function ruleSummary(r) {
  if (r.game === 'pubg') return esc(r.gun_type || '—');
  const on = [];
  if (r.headshot) on.push('headshot');
  if (r.limited_ammo) on.push('ltd ammo');
  if (r.throwables) on.push('throwables');
  if (r.gun_attr) on.push('gun attr');
  if (r.char_skill) on.push('char skill');
  return on.length ? esc(on.join(', ')) : '<span class="muted">all off</span>';
}

/* ═══════════════════════════════════════════════════════════════ QR CODES ══ */
export async function showQr() {
  box('qrBody').innerHTML = `
    <div class="grid grid--2" style="margin-bottom:14px">
      ${qrForm('esewa', 'eSewa')}
      ${qrForm('khalti', 'Khalti')}
    </div>
    <div id="qrList"></div>`;

  ['esewa', 'khalti'].forEach((m) => {
    $(`#qrFile_${m}`).addEventListener('change', () => {
      const f = $(`#qrFile_${m}`).files[0];
      $(`#qrLabel_${m}`).textContent = f ? `✓ ${f.name.slice(0, 22)}` : 'Choose QR image';
    });
    $(`#qrGo_${m}`).addEventListener('click', (e) => addQr(e.currentTarget, m));
  });
  await loadQrList();
}

const qrForm = (key, label) => `
  <div class="card">
    <div class="card__head"><h3>${label} QR</h3></div>
    <div class="alert alert--bad" id="qrErr_${key}" hidden></div>
    <label class="field"><span class="label">QR image</span>
      <div class="filepick"><input type="file" id="qrFile_${key}"
        accept="image/jpeg,image/png,image/webp"><span id="qrLabel_${key}">Choose QR image</span></div>
    </label>
    <div class="grid grid--2">
      <label class="field"><span class="label">Wallet number</span>
        <input type="text" id="qrNo_${key}" placeholder="98XXXXXXXX"></label>
      <label class="field"><span class="label">Account name</span>
        <input type="text" id="qrName_${key}" placeholder="Name on wallet"></label>
    </div>
    <label class="field"><span class="label">Wallet limit (0 = no limit)</span>
      <input type="number" id="qrCap_${key}" value="0" placeholder="e.g. 50000">
      <span class="label" style="margin-top:4px;color:var(--ink-3)">
        Retires itself once approved deposits reach this.</span></label>
    <button class="btn btn--wide" id="qrGo_${key}">Upload and make live</button>
    <p class="xs muted" style="margin-top:8px">Uploading retires the current ${label} QR.</p>
  </div>`;

async function addQr(btn, method) {
  const err = $(`#qrErr_${method}`); err.hidden = true;
  const file = $(`#qrFile_${method}`).files[0];
  if (!file) { err.textContent = 'Choose the QR image first.'; err.hidden = false; return; }
  try {
    await busy(btn, 'Uploading…', async () => {
      const url = await upload(BUCKET_PUBLIC, file);
      await rpcAuth('tuna_admin_qr_add', {
        p_method: method, p_image_url: url,
        p_wallet_no: $(`#qrNo_${method}`).value,
        p_wallet_name: $(`#qrName_${method}`).value,
        p_capacity: parseInt($(`#qrCap_${method}`).value, 10) || 0
      });
    });
    toast('QR is live. Players see it now.', 'good');
    showQr();
  } catch (e) { err.textContent = e.message; err.hidden = false; }
}

async function loadQrList() {
  await load('qrList', () => rpcAuth('tuna_admin_qrs'), (rows) => {
    if (!rows.length) return empty('No QR codes yet', 'Upload one above so players can deposit.');
    return wrap(`<table>
      <thead><tr><th>QR</th><th>Wallet</th><th>Account</th><th>Received</th>
        <th>Limit</th><th>State</th><th>Added</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${proof(r.image_url)}</td>
        <td><b>${esc(r.method)}</b><br><span class="xs muted mono">${esc(r.wallet_no || '—')}</span></td>
        <td class="xs">${esc(r.wallet_name || '—')}</td>
        <td class="num">${money(r.received)}</td>
        <td class="num">${r.capacity ? money(r.capacity) : '<span class="muted">none</span>'}</td>
        <td>${r.active ? (r.full ? '<span class="pill pill--bad">Full</span>'
                                 : '<span class="pill pill--win">Live</span>')
                       : '<span class="pill">Retired</span>'}</td>
        <td class="xs muted">${esc(when(r.created_at))}</td>
        <td>${r.active ? `<button class="btn btn--ghost btn--xs" data-qr-off="${r.id}">Retire</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`);
  });
  $$('[data-qr-off]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_qr_retire', { p_id: Number(b.dataset.qrOff) }));
      toast('QR retired.'); loadQrList();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

/* ═════════════════════════════════════════════════════════════════ ADS ══ */
export async function showAds() {
  box('adsBody').innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card__head"><h3>Add a banner</h3></div>
      <div class="alert alert--bad" id="adErr" hidden></div>
      <label class="field"><span class="label">Banner image — wide works best, about 16:7</span>
        <div class="filepick"><input type="file" id="adFile"
          accept="image/jpeg,image/png,image/webp"><span id="adLabel">Choose banner image</span></div>
      </label>
      <div class="grid grid--2">
        <label class="field"><span class="label">Link when tapped (optional)</span>
          <input type="text" id="adLink" placeholder="https://…"></label>
        <label class="field"><span class="label">Order</span>
          <input type="number" id="adSort" value="0"></label>
      </div>
      <button class="btn" id="adGo">Publish banner</button>
    </div>
    <div id="adList"></div>`;

  $('#adFile').addEventListener('change', () => {
    const f = $('#adFile').files[0];
    $('#adLabel').textContent = f ? `✓ ${f.name.slice(0, 24)}` : 'Choose banner image';
  });

  $('#adGo').addEventListener('click', async (e) => {
    const err = $('#adErr'); err.hidden = true;
    const file = $('#adFile').files[0];
    if (!file) { err.textContent = 'Choose an image first.'; err.hidden = false; return; }
    try {
      await busy(e.currentTarget, 'Publishing…', async () => {
        const url = await upload(BUCKET_PUBLIC, file);
        await rpcAuth('tuna_admin_ad_save', {
          p_image_url: url, p_link: $('#adLink').value || null,
          p_sort: parseInt($('#adSort').value, 10) || 0
        });
      });
      toast('Banner published.', 'good'); showAds();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  await loadAds();
}

async function loadAds() {
  await load('adList', () => rpcAuth('tuna_admin_ads'), (rows) => {
    if (!rows.length) return empty('No banners', 'Published banners show at the top of the player home screen.');
    return wrap(`<table>
      <thead><tr><th>Banner</th><th>Link</th><th>Order</th><th>State</th><th>Added</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><img src="${esc(r.image_url)}" alt="" class="adthumb"></td>
        <td class="xs">${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a>`
          : '<span class="muted">none</span>'}</td>
        <td class="num">${r.sort}</td>
        <td>${r.active ? '<span class="pill pill--win">Live</span>' : '<span class="pill">Hidden</span>'}</td>
        <td class="xs muted">${esc(when(r.created_at))}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--ghost btn--xs" data-ad-t="${r.id}" data-on="${r.active ? 1 : 0}">
            ${r.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn--ghost btn--xs" data-ad-d="${r.id}">Delete</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-ad-t]').forEach((b) => b.addEventListener('click', async () => {
    await rpcAuth('tuna_admin_ad_toggle', { p_id: Number(b.dataset.adT), p_active: b.dataset.on !== '1' });
    loadAds();
  }));
  $$('[data-ad-d]').forEach((b) => b.addEventListener('click', async () => {
    await rpcAuth('tuna_admin_ad_delete', { p_id: Number(b.dataset.adD) });
    toast('Banner deleted.'); loadAds();
  }));
}

/* ══════════════════════════════════════════════════════════════ UC PACKS ══ */
export async function showPacks() {
  box('packsBody').innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card__head"><h3>Add or update a pack</h3></div>
      <div class="alert alert--bad" id="pkErr" hidden></div>
      <div class="grid grid--4">
        <label class="field"><span class="label">Name</span>
          <input type="text" id="pkTitle" placeholder="660 UC"></label>
        <label class="field"><span class="label">UC amount</span>
          <input type="number" id="pkUc" placeholder="660"></label>
        <label class="field"><span class="label">Price (Rs)</span>
          <input type="number" id="pkPrice" placeholder="1150"></label>
        <label class="field"><span class="label">Order</span>
          <input type="number" id="pkSort" value="0"></label>
      </div>
      <button class="btn" id="pkGo">Save pack</button>
    </div>
    <div id="pkList"></div>`;

  $('#pkGo').addEventListener('click', async (e) => {
    const err = $('#pkErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Saving…', () => rpcAuth('tuna_admin_uc_save', {
        p_title: $('#pkTitle').value,
        p_uc: parseInt($('#pkUc').value, 10) || 0,
        p_price: parseInt($('#pkPrice').value, 10),
        p_sort: parseInt($('#pkSort').value, 10) || 0
      }));
      toast('Pack saved.', 'good'); showPacks();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  await loadPacks();
}

async function loadPacks() {
  await load('pkList', () => rpcAuth('tuna_admin_uc_packs'), (rows) => {
    if (!rows.length) return empty('No packs', 'Add one so the UC store has something to sell.');
    return wrap(`<table>
      <thead><tr><th>Name</th><th>UC</th><th>Price</th><th>Order</th><th>State</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><b>${esc(r.title)}</b></td>
        <td class="num" style="color:var(--marigold)">${num(r.uc_amount)}</td>
        <td class="num">${money(r.price)}</td>
        <td class="num">${r.sort}</td>
        <td>${r.active ? '<span class="pill pill--win">On sale</span>' : '<span class="pill">Hidden</span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--ghost btn--xs" data-pk-t="${r.id}" data-on="${r.active ? 1 : 0}"
            data-t="${esc(r.title)}" data-u="${r.uc_amount}" data-p="${r.price}" data-s="${r.sort}">
            ${r.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn--ghost btn--xs" data-pk-d="${r.id}">Delete</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-pk-t]').forEach((b) => b.addEventListener('click', async () => {
    await rpcAuth('tuna_admin_uc_save', {
      p_id: Number(b.dataset.pkT), p_title: b.dataset.t, p_uc: Number(b.dataset.u),
      p_price: Number(b.dataset.p), p_sort: Number(b.dataset.s), p_active: b.dataset.on !== '1'
    });
    loadPacks();
  }));
  $$('[data-pk-d]').forEach((b) => b.addEventListener('click', async () => {
    await rpcAuth('tuna_admin_uc_delete', { p_id: Number(b.dataset.pkD) });
    toast('Pack deleted.'); loadPacks();
  }));
}

/* ════════════════════════════════════════════════════════ NOTIFICATIONS ══ */
export function showNotify() {
  box('notifyBody').innerHTML = `
    <div class="card" style="max-width:560px">
      <div class="card__head"><h3>Send a notification</h3></div>
      <div class="alert alert--bad" id="nErr" hidden></div>
      <div class="alert alert--good" id="nOk" hidden></div>
      <label class="field"><span class="label">Player's phone number</span>
        <input type="text" id="nPhone" class="mono" placeholder="98XXXXXXXX">
        <span class="label" style="margin-top:4px;color:var(--ink-3)">
          Leave blank to send to every player.</span></label>
      <label class="field"><span class="label">Title</span>
        <input type="text" id="nTitle" placeholder="e.g. UC delivered" maxlength="60"></label>
      <label class="field"><span class="label">Message</span>
        <textarea id="nBody" placeholder="What should they know?"></textarea></label>
      <button class="btn" id="nGo">Send notification</button>
    </div>`;

  $('#nGo').addEventListener('click', async (e) => {
    const err = $('#nErr'), ok = $('#nOk');
    err.hidden = true; ok.hidden = true;
    try {
      const out = await busy(e.currentTarget, 'Sending…', () => rpcAuth('tuna_admin_notify', {
        p_phone: $('#nPhone').value, p_title: $('#nTitle').value, p_body: $('#nBody').value
      }));
      ok.textContent = `Sent to ${out.sent_to}.`;
      ok.hidden = false;
      $('#nTitle').value = ''; $('#nBody').value = '';
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ═══════════════════════════════════════════════════════════════ REPORTS ══ */
let repFilter = 'open';

export async function showReports() {
  if (!$('#repTabs')) {
    box('reportsBody').innerHTML =
      `${filterBar('repTabs', ['open', 'closed', 'all'], repFilter)}<div id="repTable"></div>`;
    $('#repTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      repFilter = b.dataset.f; syncBar('repTabs', repFilter); loadReports();
    });
  }
  await loadReports();
}

async function loadReports() {
  await load('repTable', () => rpcAuth('tuna_admin_reports', { p_status: repFilter }), (rows) => {
    if (!rows.length) return empty('No reports', 'Players with a problem will appear here.');
    return wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Subject</th><th>Messages</th>
        <th>Last</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td class="truncate" style="max-width:240px">${esc(r.subject)}</td>
        <td class="num">${r.messages}</td>
        <td class="xs muted">${esc(ago(r.updated_at))}</td>
        <td>${pill(r.status)}</td>
        <td><button class="btn btn--xs" data-rep="${r.id}" data-name="${esc(r.name)}"
              data-open="${r.status === 'open' ? 1 : 0}">Open chat</button></td>
      </tr>`).join('')}</tbody></table>`);
  });
  $$('[data-rep]').forEach((b) => b.addEventListener('click', () => chat(b.dataset)));
}

async function chat(d) {
  openModal(`
    <h2>Chat with ${esc(d.name)}</h2>
    <p class="sub">Report #${esc(d.rep)}</p>
    <div class="chatbox" id="acBox">${skeleton(40, 2)}</div>
    <div class="alert alert--bad" id="acErr" hidden></div>
    <label class="field" style="margin-top:12px">
      <textarea id="acBody" placeholder="Your reply…"></textarea></label>
    <div class="row">
      <button class="btn grow" id="acSend">Send reply</button>
      <button class="btn btn--ghost" id="acClose">${d.open === '1' ? 'Close report' : 'Reopen'}</button>
      <button class="btn btn--ghost" id="acDone">Done</button>
    </div>`);

  const paint = async () => {
    const msgs = await rpcAuth('tuna_admin_report_thread', { p_id: Number(d.rep) }) || [];
    $('#acBox').innerHTML = msgs.length ? msgs.map((m) => `
      <div class="bubble bubble--${m.sender}">
        ${m.body ? `<p>${esc(m.body)}</p>` : ''}
        ${m.media_url ? (m.media_type === 'video'
          ? `<video src="${esc(m.media_url)}" controls playsinline></video>`
          : `<img src="${esc(m.media_url)}" alt="" loading="lazy">`) : ''}
        <time>${esc(ago(m.created_at))}</time>
      </div>`).join('') : '<p class="xs muted">No messages.</p>';
    $('#acBox').scrollTop = $('#acBox').scrollHeight;
  };
  await paint();

  $('#acDone').addEventListener('click', () => { closeModal(); loadReports(); });
  $('#acSend').addEventListener('click', async (e) => {
    const err = $('#acErr'); err.hidden = true;
    const body = $('#acBody').value.trim();
    if (!body) { err.textContent = 'Write a reply first.'; err.hidden = false; return; }
    try {
      await busy(e.currentTarget, 'Sending…', () =>
        rpcAuth('tuna_admin_report_reply', { p_id: Number(d.rep), p_body: body }));
      $('#acBody').value = '';
      await paint();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  $('#acClose').addEventListener('click', async (e) => {
    await rpcAuth('tuna_admin_report_close', { p_id: Number(d.rep), p_closed: d.open === '1' });
    closeModal(); toast('Report updated.'); loadReports();
  });
}

/* ════════════════════════════════════════════════════════ PASSWORD RESETS ══ */
let resetFilter = 'open';

export async function showResets() {
  if (!$('#rsTabs')) {
    box('resetsBody').innerHTML = `
      <div class="alert alert--info" style="margin-bottom:14px">
        Players who forget their password send a request here. Set a new one,
        then pass it to them on WhatsApp, Messenger or a call.
      </div>
      ${filterBar('rsTabs', ['open', 'done', 'cancelled', 'all'], resetFilter)}
      <div id="rsTable"></div>`;
    $('#rsTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      resetFilter = b.dataset.f; syncBar('rsTabs', resetFilter); loadResets();
    });
  }
  await loadResets();
}

async function loadResets() {
  await load('rsTable', () => rpcAuth('tuna_admin_reset_requests', { p_status: resetFilter }), (rows) => {
    if (!rows.length) return empty('No requests', `Nothing ${resetFilter} right now.`);
    return wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Message</th><th>Asked</th>
        <th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${r.name
          ? `<div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div>`
          : '<span class="xs muted">no account</span>'}</td>
        <td class="num">${esc(r.phone)}</td>
        <td class="xs">${r.note ? esc(r.note) : '<span class="muted">no message</span>'}</td>
        <td class="xs muted">${esc(ago(r.created_at))}</td>
        <td>${pill(r.status)}</td>
        <td>${r.status === 'open' && r.player_id ? `<div class="row" style="gap:6px;flex-wrap:nowrap">
            <button class="btn btn--xs" data-rspw="${r.id}" data-pid="${r.player_id}"
              data-name="${esc(r.name)}" data-phone="${esc(r.phone)}">Set password</button>
            <button class="btn btn--ghost btn--xs" data-rsx="${r.id}">Dismiss</button></div>`
          : '<span class="xs muted">handled</span>'}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-rspw]').forEach((b) => b.addEventListener('click', () =>
    passwordModal({ playerId: b.dataset.pid, name: b.dataset.name, phone: b.dataset.phone },
                  Number(b.dataset.rspw))));
  $$('[data-rsx]').forEach((b) => b.addEventListener('click', async () => {
    await rpcAuth('tuna_admin_cancel_reset', { p_id: Number(b.dataset.rsx) });
    toast('Request dismissed.'); loadResets();
  }));
}

/* ═════════════════════════════════════════════════════════════════ FINES ══ */
let fineFilter = 'all';

export async function showFines() {
  if (!$('#fnTabs')) {
    box('finesBody').innerHTML =
      `${filterBar('fnTabs', ['all', 'outstanding', 'cleared'], fineFilter)}<div id="fnTable"></div>`;
    $('#fnTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      fineFilter = b.dataset.f; syncBar('fnTabs', fineFilter); loadFines();
    });
  }
  await loadFines();
}

async function loadFines() {
  await load('fnTable', () => rpcAuth('tuna_admin_fines', { p_status: fineFilter }), (rows) => {
    if (!rows.length) return empty('No fines', 'Fines you issue are listed here.');
    const owed = rows.reduce((a, r) => a + Number(r.outstanding), 0);
    const taken = rows.reduce((a, r) => a + Number(r.collected), 0);
    return `<div class="grid grid--4" style="margin-bottom:14px">
        <div class="stat stat--good"><b>${money(taken)}</b><small>Collected</small></div>
        <div class="stat ${owed ? 'stat--alert' : ''}"><b>${money(owed)}</b><small>Still owed</small></div>
        <div class="stat"><b>${rows.length}</b><small>Fines issued</small></div>
      </div>` + wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Fine</th><th>Taken</th>
        <th>Owed</th><th>Reason</th><th>Match</th><th>When</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td class="num">${money(r.amount)}</td>
        <td class="num" style="color:var(--win)">${money(r.collected)}</td>
        <td class="num">${r.outstanding > 0
          ? `<span class="pill pill--bad">${money(r.outstanding)}</span>`
          : '<span class="pill pill--win">clear</span>'}</td>
        <td>${esc(r.reason)}</td>
        <td class="num">${r.match_id ? '#' + r.match_id : '—'}</td>
        <td class="xs muted">${esc(when(r.created_at))}</td>
        <td>${r.outstanding > 0
          ? `<button class="btn btn--ghost btn--xs" data-waive="${r.id}">Waive</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-waive]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_waive_fine', { p_id: Number(b.dataset.waive) }));
      toast('Remaining amount written off.'); loadFines();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

/* ══════════════════════════════════════════════════════════════ FEEDBACK ══ */
export async function showFeedback() {
  await load('feedbackBody', () => rpcAuth('tuna_admin_feedback'), (rows) => {
    if (!rows.length) return empty('No feedback yet', 'Ratings from players land here.');
    const avg = (rows.reduce((a, r) => a + r.stars, 0) / rows.length).toFixed(2);
    return `<div class="grid grid--4" style="margin-bottom:14px">
        <div class="stat stat--good"><b>${avg} ★</b><small>Average rating</small></div>
        <div class="stat"><b>${rows.length}</b><small>Responses</small></div>
      </div>` + wrap(`<table>
      <thead><tr><th>Player</th><th>Phone (ID)</th><th>Rating</th><th>Comment</th><th>When</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><b>${esc(r.name)}</b></td>
        <td class="num">${esc(r.phone)}</td>
        <td style="color:var(--marigold);white-space:nowrap">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</td>
        <td>${r.message ? esc(r.message) : '<span class="xs muted">no comment</span>'}</td>
        <td class="xs muted">${esc(when(r.created_at))}</td>
      </tr>`).join('')}</tbody></table>`);
  });
}

/* ══════════════════════════════════════════════════════════════ SETTINGS ══ */
const RULE_KEYS = ['rules_pubg', 'rules_freefire'];

const SETTING_LABELS = {
  commission_percent: ['Commission %', 'Cut taken from every settled match pot'],
  min_deposit: ['Minimum deposit', 'Smallest amount a player may deposit'],
  min_withdraw: ['Minimum withdrawal', 'Smallest amount a player may cash out'],
  room_ttl_minutes: ['Room lifetime (minutes)', 'How long a room waits for an opponent'],
  otp_dev_mode: ['OTP test mode', 'Unused while registration is number + password'],
  support_note: ['Support note', 'Shown to players in a few places'],
  rules_pubg: ['PUBG match rules', ''],
  rules_freefire: ['Free Fire match rules', '']
};

/* The rulebook is edited as plain lines. Players must tick to accept it
   before they can join a room. */
const RULE_HELP = `Line prefixes — <b>#</b> heading · <b>x</b> forbidden (red) ·
  <b>y</b> allowed (green) · <b>!</b> penalty (red box) · <b>-</b> plain bullet`;

export async function showSettings() {
  await load('settingsBody', () => rpcAuth('tuna_admin_settings'), (rows) => {
    const rules = rows.filter((r) => RULE_KEYS.includes(r.key));
    const shown = rows.filter((r) =>
      !RULE_KEYS.includes(r.key) && (!r.key.startsWith('otp_') || r.key === 'otp_dev_mode'));

    return `<div class="card" style="max-width:640px">
      <div class="card__head"><h3>App settings</h3></div>
      <div class="alert alert--bad" id="stErr" hidden></div>
      ${shown.map((r) => {
        const [label, note] = SETTING_LABELS[r.key] || [r.key, ''];
        return `<label class="field">
          <span class="label">${esc(label)}</span>
          <div class="row" style="flex-wrap:nowrap">
            <input type="text" class="grow" id="set_${esc(r.key)}" value="${esc(r.value)}">
            <button class="btn btn--xs" data-set="${esc(r.key)}">Save</button>
          </div>
          ${note ? `<span class="label" style="margin-top:4px;color:var(--ink-3)">${esc(note)}</span>` : ''}
        </label>`;
      }).join('')}
    </div>
    ${rules.map((r) => `
      <div class="card" style="margin-top:14px">
        <div class="card__head">
          <h3>${esc((SETTING_LABELS[r.key] || [r.key])[0])}</h3>
          <button class="btn btn--xs" data-set="${esc(r.key)}">Save rules</button>
        </div>
        <p class="xs muted" style="margin-bottom:10px">${RULE_HELP}</p>
        <textarea id="set_${esc(r.key)}" rows="16"
          style="font-family:var(--mono);font-size:13px;line-height:1.6">${esc(r.value)}</textarea>
      </div>`).join('')}`;
  });

  $$('[data-set]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.set;
    const err = $('#stErr'); err.hidden = true;
    try {
      await busy(b, '…', () => rpcAuth('tuna_admin_set_setting',
        { p_key: key, p_value: $(`#set_${key}`).value }));
      toast('Saved.', 'good');
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  }));
}

/* ─────────────────────────────────────────────────────────────── helpers ── */
function filterBar(id, opts, active) {
  return `<div class="filterbar" id="${id}">${opts.map((o) =>
    `<button data-f="${o}" aria-pressed="${o === active}">${o}</button>`).join('')}</div>`;
}

function syncBar(id, active) {
  $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === active)));
}

function rejectModal(title, action) {
  openModal(`
    <h2>${esc(title)}</h2>
    <p class="sub">The player sees your reason.</p>
    <div class="alert alert--bad" id="rjErr" hidden></div>
    <label class="field"><span class="label">Reason</span>
      <input type="text" id="rjNote" placeholder="e.g. Screenshot does not match the amount"></label>
    <div class="row" style="margin-top:16px">
      <button class="btn grow" id="rjGo">Confirm reject</button>
      <button class="btn btn--ghost" id="rjCancel">Cancel</button>
    </div>`);
  $('#rjCancel').addEventListener('click', closeModal);
  $('#rjGo').addEventListener('click', async (e) => {
    const err = $('#rjErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Working…', () => action($('#rjNote').value));
      closeModal();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ═══════════════════════════════════════════════════════════ TOURNAMENTS ══ */
let tournBanner = null;

export async function showTournaments() {
  box('tournamentsBody').innerHTML = `
    <div class="row" style="justify-content:flex-end;margin-bottom:14px">
      <button class="btn" id="tNew">Create tournament</button>
    </div>
    <div id="tTable"></div>`;
  $('#tNew').addEventListener('click', () => tournForm(null));
  await loadTournaments();
}

async function loadTournaments() {
  await load('tTable', () => rpcAuth('tuna_admin_tournaments'), (rows) => {
    if (!rows.length) return empty('No tournaments',
      'Create one and it appears on the player home screen straight away.');
    return wrap(`<table>
      <thead><tr><th>Tournament</th><th>Game</th><th>Starts</th><th>Registration</th>
        <th>Slots</th><th>Prize</th><th>Entry</th><th>Room</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><div class="row" style="gap:9px;flex-wrap:nowrap">
          ${r.banner_url ? `<img src="${esc(r.banner_url)}" class="adthumb" style="width:74px">` : ''}
          <span><b>${esc(r.title)}</b>
          ${r.pending > 0 ? `<br><span class="pill pill--wait">${r.pending} to approve</span>` : ''}</span>
        </div></td>
        <td><b>${esc(r.game === 'pubg' ? 'PUBG' : 'Free Fire')}</b>
          <br><span class="xs muted">${esc(r.mode || '')}${r.map ? ' · ' + esc(r.map) : ''}</span></td>
        <td class="xs">${esc(when(r.starts_at))}</td>
        <td class="xs">${r.reg_opens_at ? esc(when(r.reg_opens_at)) : 'anytime'}
          <br>to ${r.reg_closes_at ? esc(when(r.reg_closes_at)) : 'match time'}</td>
        <td class="num">${r.taken}/${r.max_slots}
          <br><span class="xs" style="color:var(--win)">${r.confirmed} ok</span></td>
        <td class="num">${money(r.prize_pool)}
          <br><span class="xs muted">${money(r.prize_1)}/${money(r.prize_2)}/${money(r.prize_3)}</span></td>
        <td class="num">${r.entry_fee ? money(r.entry_fee) : 'Free'}</td>
        <td class="xs">${r.room_id
          ? `<span class="mono">${esc(r.room_id)}</span> / ${esc(r.room_pass || '')}`
          : '<span class="muted">not set</span>'}</td>
        <td>${pill(r.status)}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--xs" data-tp="${r.id}" data-title="${esc(r.title)}">Players</button>
          <button class="btn btn--gold btn--xs" data-troom="${r.id}" data-title="${esc(r.title)}"
                  data-rid="${esc(r.room_id || '')}" data-rpw="${esc(r.room_pass || '')}">Room</button>
          <button class="btn btn--ghost btn--xs" data-tedit='${esc(JSON.stringify(r))}'>Edit</button>
          <button class="btn btn--ghost btn--xs" data-tdel="${r.id}">Delete</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-tp]').forEach((b) => b.addEventListener('click', () => tournPlayers(b.dataset)));
  $$('[data-troom]').forEach((b) => b.addEventListener('click', () => tournRoom(b.dataset)));
  $$('[data-tedit]').forEach((b) => b.addEventListener('click', () =>
    tournForm(JSON.parse(b.dataset.tedit))));
  $$('[data-tdel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this tournament? Everyone who registered gets their entry fee back.')) return;
    try {
      const out = await busy(b, '…', () =>
        rpcAuth('tuna_admin_tournament_delete', { p_id: Number(b.dataset.tdel) }));
      toast(`Deleted. ${out.refunded} player(s) refunded.`, 'good');
      loadTournaments();
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

/* datetime-local wants "YYYY-MM-DDTHH:MM" in local time */
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

const MAPS = {
  pubg: ['Erangel', 'Miramar', 'Sanhok', 'Livik', 'Vikendi', 'Karakin', 'Nusa'],
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra', 'Solara']
};
const MODES = {
  pubg: ['Solo', 'Duo', 'Squad', 'TDM', 'Arena'],
  freefire: ['Solo', 'Duo', 'Squad', 'Clash Squad', 'Lone Wolf']
};

function tournForm(t) {
  tournBanner = null;
  const g = t?.game || 'freefire';
  openModal(`
    <h2>${t ? 'Edit tournament' : 'Create tournament'}</h2>
    <p class="sub">Players see this on their home screen the moment it is open.</p>
    <div class="alert alert--bad" id="tfErr" hidden></div>

    <label class="field"><span class="label">Title</span>
      <input type="text" id="tfTitle" value="${esc(t?.title || '')}" placeholder="Tuna Weekly Cup #1"></label>

    <div class="grid grid--2">
      <label class="field"><span class="label">Game</span>
        <select id="tfGame">
          <option value="freefire" ${g === 'freefire' ? 'selected' : ''}>Free Fire</option>
          <option value="pubg" ${g === 'pubg' ? 'selected' : ''}>PUBG Mobile</option>
        </select></label>
      <label class="field"><span class="label">Mode</span>
        <select id="tfMode"></select></label>
    </div>

    <div class="grid grid--2">
      <label class="field"><span class="label">Map</span>
        <select id="tfMap"></select></label>
      <label class="field"><span class="label">Players per team</span>
        <select id="tfPpt">
          ${[1,2,3,4,5,6].map((n) => `<option value="${n}" ${(t?.players_per_team ?? 1) === n ? 'selected' : ''}>
            ${n === 1 ? 'Solo (1)' : n + ' per team'}</option>`).join('')}
        </select></label>
    </div>

    <label class="field"><span class="label">Total slots</span>
      <input type="number" id="tfSlots" value="${t?.max_slots ?? 48}">
      <span class="label" style="margin-top:4px;color:var(--ink-3)" id="tfSlotHint"></span></label>

    <label class="field"><span class="label">Banner image</span>
      <div class="filepick"><input type="file" id="tfFile" accept="image/jpeg,image/png,image/webp">
        <span id="tfFileLabel">${t?.banner_url ? 'Replace banner (optional)' : 'Choose banner image'}</span></div>
    </label>

    <p class="eyebrow" style="margin:14px 0 8px">Dates</p>
    <div class="grid grid--2">
      <label class="field"><span class="label">Registration opens</span>
        <input type="datetime-local" id="tfRegOpen" value="${toLocal(t?.reg_opens_at)}"></label>
      <label class="field"><span class="label">Registration closes</span>
        <input type="datetime-local" id="tfRegClose" value="${toLocal(t?.reg_closes_at)}"></label>
    </div>
    <div class="grid grid--2">
      <label class="field"><span class="label">Match starts</span>
        <input type="datetime-local" id="tfStart" value="${toLocal(t?.starts_at)}"></label>
      <label class="field"><span class="label">Reveal room ID (minutes before)</span>
        <input type="number" id="tfReveal" value="${t?.reveal_minutes ?? 30}"></label>
    </div>

    <p class="eyebrow" style="margin:14px 0 8px">Money</p>
    <div class="grid grid--2">
      <label class="field"><span class="label">Entry fee</span>
        <input type="number" id="tfEntry" value="${t?.entry_fee ?? 0}"></label>
      <label class="field"><span class="label">Total prize pool</span>
        <input type="number" id="tfPool" value="${t?.prize_pool ?? 0}"></label>
    </div>
    <div class="grid grid--4">
      <label class="field"><span class="label">1st prize</span>
        <input type="number" id="tfP1" value="${t?.prize_1 ?? 0}"></label>
      <label class="field"><span class="label">2nd prize</span>
        <input type="number" id="tfP2" value="${t?.prize_2 ?? 0}"></label>
      <label class="field"><span class="label">3rd prize</span>
        <input type="number" id="tfP3" value="${t?.prize_3 ?? 0}"></label>
      <label class="field"><span class="label">Per kill</span>
        <input type="number" id="tfKill" value="${t?.per_kill ?? 0}"></label>
    </div>

    <label class="field"><span class="label">Rules (optional)</span>
      <textarea id="tfRules" rows="3">${esc(t?.rules || '')}</textarea></label>

    <label class="field"><span class="label">Status</span>
      <select id="tfStatus">
        ${['draft', 'open', 'closed', 'live', 'completed', 'cancelled'].map((s) =>
          `<option value="${s}" ${(t?.status || 'open') === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></label>

    <div class="row" style="margin-top:16px">
      <button class="btn grow" id="tfGo">${t ? 'Save changes' : 'Create tournament'}</button>
      <button class="btn btn--ghost" id="tfCancel">Cancel</button>
    </div>`);

  const fillGameLists = () => {
    const game = $('#tfGame').value;
    $('#tfMode').innerHTML = MODES[game].map((m) =>
      `<option ${t?.mode === m ? 'selected' : ''}>${m}</option>`).join('');
    $('#tfMap').innerHTML = MAPS[game].map((m) =>
      `<option ${t?.map === m ? 'selected' : ''}>${m}</option>`).join('');
  };
  fillGameLists();
  $('#tfGame').addEventListener('change', fillGameLists);

  /* Slots mean teams once a squad size is set, so say so plainly. */
  const slotHint = () => {
    const ppt = parseInt($('#tfPpt').value, 10) || 1;
    const slots = parseInt($('#tfSlots').value, 10) || 0;
    $('#tfSlotHint').textContent = ppt > 1
      ? `${slots} teams = ${slots * ppt} players in the lobby`
      : `${slots} individual players`;
  };
  $('#tfPpt').addEventListener('change', slotHint);
  $('#tfSlots').addEventListener('input', slotHint);
  slotHint();

  $('#tfFile').addEventListener('change', () => {
    const f = $('#tfFile').files[0];
    $('#tfFileLabel').textContent = f ? `✓ ${f.name.slice(0, 24)}` : 'Choose banner image';
  });

  $('#tfCancel').addEventListener('click', closeModal);
  $('#tfGo').addEventListener('click', async (e) => {
    const err = $('#tfErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Saving…', async () => {
        let banner = t?.banner_url || null;
        const file = $('#tfFile').files[0];
        if (file) banner = await upload(BUCKET_PUBLIC, file);

        await rpcAuth('tuna_admin_tournament_save', {
          p_id: t?.id ?? null,
          p_title: $('#tfTitle').value,
          p_game: $('#tfGame').value,
          p_mode: $('#tfMode').value,
          p_map: $('#tfMap').value,
          p_banner_url: banner,
          p_starts_at: fromLocal($('#tfStart').value),
          p_reg_opens_at: fromLocal($('#tfRegOpen').value),
          p_reg_closes_at: fromLocal($('#tfRegClose').value),
          p_reveal_minutes: parseInt($('#tfReveal').value, 10) || 30,
          p_entry_fee: parseInt($('#tfEntry').value, 10) || 0,
          p_prize_pool: parseInt($('#tfPool').value, 10) || 0,
          p_prize_1: parseInt($('#tfP1').value, 10) || 0,
          p_prize_2: parseInt($('#tfP2').value, 10) || 0,
          p_prize_3: parseInt($('#tfP3').value, 10) || 0,
          p_per_kill: parseInt($('#tfKill').value, 10) || 0,
          p_max_slots: parseInt($('#tfSlots').value, 10) || 48,
          p_players_per_team: parseInt($('#tfPpt').value, 10) || 1,
          p_rules: $('#tfRules').value,
          p_status: $('#tfStatus').value
        });
      });
      closeModal();
      toast(t ? 'Tournament updated.' : 'Tournament created.', 'good');
      loadTournaments();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ────────────────────────────── who registered, and confirming them ─────── */
async function tournPlayers(d) {
  openModal(`
    <h2>Registered players</h2>
    <p class="sub">${esc(d.title)}</p>
    <input type="search" id="tpSearch" style="margin-bottom:12px"
           placeholder="Search game name, game ID, team, player or phone…">
    <div class="alert alert--bad" id="tpErr" hidden></div>
    <div id="tpBody">${skeleton(50, 3)}</div>
    <div class="row" style="margin-top:14px">
      <button class="btn btn--ghost" id="tpDone">Done</button>
    </div>`);
  $('#tpDone').addEventListener('click', () => { closeModal(); loadTournaments(); });

  const paint = async (q = '') => {
    let rows = [];
    try { rows = await rpcAuth('tuna_admin_tournament_players',
            { p_id: Number(d.tp), p_q: q }) || []; }
    catch (e) { $('#tpBody').innerHTML = `<div class="alert alert--bad">${esc(e.message)}</div>`; return; }

    $('#tpBody').innerHTML = rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>#</th><th>Registered by</th><th>App ID (phone)</th><th>Team / squad</th>
        <th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num">${r.slot_no ?? '—'}</td>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}<b>${esc(r.name)}</b></div></td>
        <td class="num">${esc(r.phone)}</td>
        <td>
          ${r.team_name ? `<b>${esc(r.team_name)}</b>` : ''}
          <div class="squad">${(r.roster && r.roster.length
            ? r.roster
            : [{ name: r.ingame_name, uid: r.ingame_uid }]).map((m, i) => `
            <span class="squad__m">${i === 0 && (r.roster?.length > 1) ? '<i>C</i>' : ''}
              ${esc(m.name)} <span class="mono">${esc(m.uid)}</span></span>`).join('')}
          </div>
        </td>
        <td>${pill(r.status)}</td>
        <td>${r.status === 'pending' ? `<div class="row" style="gap:6px;flex-wrap:nowrap">
            <button class="btn btn--win btn--xs" data-ok="${r.id}">Confirm</button>
            <button class="btn btn--ghost btn--xs" data-no="${r.id}">Reject</button></div>`
          : '<span class="xs muted">done</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`
      : empty(q ? 'No match' : 'Nobody yet',
              q ? `Nothing here matches "${esc(q)}".`
                : 'Registrations appear here as they come in.');

    $$('#tpBody [data-ok]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await busy(b, '…', () => rpcAuth('tuna_admin_tournament_review',
          { p_reg: Number(b.dataset.ok), p_action: 'confirm' }));
        toast('Slot confirmed. Player notified.', 'good');
        paint();
      } catch (e) { toast(e.message, 'bad'); }
    }));
    $$('#tpBody [data-no]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await busy(b, '…', () => rpcAuth('tuna_admin_tournament_review',
          { p_reg: Number(b.dataset.no), p_action: 'reject', p_note: 'Registration rejected' }));
        toast('Rejected. Entry fee returned.');
        paint();
      } catch (e) { toast(e.message, 'bad'); }
    }));
  };
  await paint();

  /* search hits the database, so a teammate inside a roster is findable */
  $('#tpSearch').addEventListener('input', debounce(() =>
    paint($('#tpSearch').value.trim()), 280));
}

/* ───────────────────────────────────── publishing the room details ──────── */
function tournRoom(d) {
  openModal(`
    <h2>Room details</h2>
    <p class="sub">${esc(d.title)}</p>
    <div class="alert alert--bad" id="trErr" hidden></div>
    <div class="alert alert--info">
      Only confirmed players see these, and only inside the reveal window you
      set. Everyone confirmed gets a notification as soon as you save.
    </div>
    <div class="grid grid--2">
      <label class="field"><span class="label">Room ID</span>
        <input type="text" id="trRid" class="mono" value="${esc(d.rid || '')}" placeholder="e.g. 55667788"></label>
      <label class="field"><span class="label">Room password</span>
        <input type="text" id="trRpw" class="mono" value="${esc(d.rpw || '')}" placeholder="e.g. tuna99"></label>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn grow" id="trGo">Save and notify</button>
      <button class="btn btn--ghost" id="trCancel">Cancel</button>
    </div>`);
  $('#trCancel').addEventListener('click', closeModal);
  $('#trGo').addEventListener('click', async (e) => {
    const err = $('#trErr'); err.hidden = true;
    try {
      const out = await busy(e.currentTarget, 'Saving…', () =>
        rpcAuth('tuna_admin_tournament_room', {
          p_id: Number(d.troom), p_room_id: $('#trRid').value, p_room_pass: $('#trRpw').value
        }));
      closeModal();
      toast(`Saved. ${out.notified} confirmed player(s) notified.`, 'good');
      loadTournaments();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ═══════════════════════════════════════════════════ SUPPORT AGENTS ══ */
export async function showAgents() {
  box('agentsBody').innerHTML = `
    <div class="alert alert--info" style="margin-bottom:14px">
      Support agents talk to players and raise tickets. They cannot move points,
      approve deposits, or change anything about an account. Only IDs created
      here can sign in to the support desk.
    </div>
    <div class="row" style="justify-content:flex-end;margin-bottom:14px">
      <button class="btn" id="agNew">Create agent</button>
    </div>
    <div id="agTable"></div>`;
  $('#agNew').addEventListener('click', () => agentModal(null));
  await loadAgents();
}

async function loadAgents() {
  await load('agTable', () => rpcAuth('tuna_admin_agents'), (rows) => {
    if (!rows.length) return empty('No agents yet',
      'Create one and give them the ID and password you set.');
    return wrap(`<table>
      <thead><tr><th>Agent</th><th>Login ID</th><th>Active chats</th><th>Handled</th>
        <th>Tickets raised</th><th>Last seen</th><th>State</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr${r.active ? '' : ' class="rowdim"'}>
        <td><b>${esc(r.name)}</b></td>
        <td class="num" style="color:var(--marigold)">${esc(r.id)}</td>
        <td class="num">${r.active_chats}</td>
        <td class="num">${r.handled}</td>
        <td class="num">${r.raised}</td>
        <td class="xs muted">${r.last_login ? esc(ago(r.last_login)) : 'never'}</td>
        <td>${r.active ? '<span class="pill pill--win">Active</span>'
                       : '<span class="pill">Switched off</span>'}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="btn btn--ghost btn--xs" data-aged='${esc(JSON.stringify(r))}'>Edit</button>
          <button class="btn btn--ghost btn--xs" data-agdel="${esc(r.id)}">Delete</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-aged]').forEach((b) => b.addEventListener('click', () =>
    agentModal(JSON.parse(b.dataset.aged))));
  $$('[data-agdel]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this agent? Their conversations stay, but the login stops working.')) return;
    await rpcAuth('tuna_admin_agent_delete', { p_id: b.dataset.agdel });
    toast('Agent deleted.');
    loadAgents();
  }));
}

function agentModal(a) {
  const suggested = 'SUP' + String(Math.floor(100 + Math.random() * 900));
  const pw = 'tuna' + Math.floor(100000 + Math.random() * 900000);
  openModal(`
    <h2>${a ? 'Edit agent' : 'Create support agent'}</h2>
    <p class="sub">${a ? 'Leave the password blank to keep the current one.'
                       : 'Give them the ID and password below — that is their only way in.'}</p>
    <div class="alert alert--bad" id="agErr" hidden></div>

    <div class="grid grid--2">
      <label class="field"><span class="label">Login ID</span>
        <input type="text" id="agId" class="mono" value="${esc(a?.id || suggested)}"
               ${a ? 'readonly' : ''}></label>
      <label class="field"><span class="label">Agent name</span>
        <input type="text" id="agName" value="${esc(a?.name || '')}" placeholder="Anjali Shrestha"></label>
    </div>

    <label class="field"><span class="label">${a ? 'New password (optional)' : 'Password'}</span>
      <input type="text" id="agPw" class="mono" value="${a ? '' : pw}"
             placeholder="At least 8 characters"></label>

    <label class="agreecheck">
      <input type="checkbox" id="agActive" ${a?.active === false ? '' : 'checked'}>
      <span>Account is active and can sign in</span>
    </label>

    <div class="row" style="margin-top:14px">
      <button class="btn grow" id="agGo">${a ? 'Save changes' : 'Create agent'}</button>
      <button class="btn btn--ghost" id="agX">Cancel</button>
    </div>`);

  $('#agX').addEventListener('click', closeModal);
  $('#agGo').addEventListener('click', async (e) => {
    const err = $('#agErr'); err.hidden = true;
    const id = $('#agId').value, pwv = $('#agPw').value;
    try {
      await busy(e.currentTarget, 'Saving…', () => rpcAuth('tuna_admin_agent_save', {
        p_id: id, p_name: $('#agName').value,
        p_password: pwv || null, p_active: $('#agActive').checked
      }));
      closeModal();
      toast(a ? 'Agent updated.' : `Agent ${id} created — password ${pwv}`, 'good');
      loadAgents();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

/* ══════════════════════════════════════════════════════ ESCALATIONS ══ */
let escFilter = 'open';

export async function showEscalations() {
  if (!$('#esTabs')) {
    box('escalationsBody').innerHTML = `
      <div class="alert alert--info" style="margin-bottom:14px">
        Tickets raised by support. Do whatever action is needed elsewhere in the
        panel — refund, fine, unblock — then mark the ticket solved. The agent
        is notified and replies to the player.
      </div>
      ${filterBar('esTabs', ['open', 'solved', 'rejected', 'all'], escFilter)}
      <div id="esTable"></div>`;
    $('#esTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      escFilter = b.dataset.f; syncBar('esTabs', escFilter); loadEscalations();
    });
  }
  await loadEscalations();
}

async function loadEscalations() {
  await load('esTable', () => rpcAuth('tuna_admin_escalations', { p_status: escFilter }), (rows) => {
    if (!rows.length) return empty('No tickets', `Nothing ${escFilter} from the support desk.`);
    return wrap(`<table>
      <thead><tr><th>#</th><th>Customer</th><th>Phone (ID)</th><th>Type</th><th>Issue</th>
        <th>Asked for</th><th>Amount</th><th>Agent</th><th>Raised</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="num">${r.id}</td>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap">${avatar(r)}
          <span><b>${esc(r.name)}</b>${r.blocked ? '<br><span class="pill pill--bad">blocked</span>' : ''}</span>
        </div></td>
        <td class="num">${esc(r.phone)}</td>
        <td><span class="pill pill--info">${esc(r.category)}</span></td>
        <td style="max-width:300px"><b>${esc(r.subject)}</b>
          <br><span class="xs muted">${esc(r.issue)}</span></td>
        <td class="xs">${r.requested ? esc(r.requested) : '—'}</td>
        <td class="num">${r.amount ? money(r.amount) : '—'}</td>
        <td class="xs">${esc(r.agent_name || r.agent_id || '—')}</td>
        <td class="xs muted">${esc(ago(r.created_at))}</td>
        <td>${pill(r.status)}${r.admin_note ? `<br><span class="xs muted">${esc(r.admin_note)}</span>` : ''}</td>
        <td>${r.status === 'open' ? `<div class="row" style="gap:6px;flex-wrap:nowrap">
            <button class="btn btn--win btn--xs" data-esok="${r.id}" data-sub="${esc(r.subject)}">Solve</button>
            <button class="btn btn--ghost btn--xs" data-esno="${r.id}" data-sub="${esc(r.subject)}">Reject</button>
          </div>` : '<span class="xs muted">closed</span>'}</td>
      </tr>`).join('')}</tbody></table>`);
  });

  $$('[data-esok]').forEach((b) => b.addEventListener('click', () =>
    resolveModal(b.dataset.esok, b.dataset.sub, 'solve')));
  $$('[data-esno]').forEach((b) => b.addEventListener('click', () =>
    resolveModal(b.dataset.esno, b.dataset.sub, 'reject')));
}

function resolveModal(id, subject, action) {
  const solving = action === 'solve';
  openModal(`
    <h2>${solving ? 'Mark solved' : 'Reject ticket'}</h2>
    <p class="sub">#${esc(id)} · ${esc(subject)}</p>
    <div class="alert alert--bad" id="rsErr" hidden></div>
    ${solving ? `<div class="alert alert--info">
      Make sure you have actually done the thing first — the refund, the fine,
      the unblock. This only closes the ticket and tells the agent.
    </div>` : ''}
    <label class="field"><span class="label">Note for the agent</span>
      <input type="text" id="rsNote" placeholder="${solving
        ? 'e.g. Stake refunded and opponent fined 50'
        : 'e.g. Proof does not show any rule break'}"></label>
    <div class="row" style="margin-top:14px">
      <button class="btn ${solving ? 'btn--win' : ''} grow" id="rsGo">
        ${solving ? 'Mark solved' : 'Reject'}</button>
      <button class="btn btn--ghost" id="rsX">Cancel</button>
    </div>`);
  $('#rsX').addEventListener('click', closeModal);
  $('#rsGo').addEventListener('click', async (e) => {
    const err = $('#rsErr'); err.hidden = true;
    try {
      await busy(e.currentTarget, 'Saving…', () => rpcAuth('tuna_admin_escalation_resolve', {
        p_id: Number(id), p_action: action, p_note: $('#rsNote').value
      }));
      closeModal();
      toast(solving ? 'Ticket solved. Agent notified.' : 'Ticket rejected.', solving ? 'good' : '');
      loadEscalations();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}
