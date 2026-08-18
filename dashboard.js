/* Tunanepal admin — Dashboard.
   Everything here reads from one call to tuna_admin_stats, which also returns
   a fourteen-day series so the charts never need a second round trip. */

import { rpcAuth } from './api.js';
import { $, money, num, toast, skeleton, esc } from './ui.js';

let charts = {};
let lastStats = null;

/* Chart.js reads its colours from CSS variables so the light/dark toggle
   redraws correctly instead of leaving dark axes on a cream background. */
const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function baseOptions() {
  const grid = cssVar('--chart-grid');
  const tick = cssVar('--chart-tick');
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: tick, boxWidth: 10, boxHeight: 10, usePointStyle: true,
                  font: { family: 'Mukta, sans-serif', size: 12 } }
      },
      tooltip: {
        backgroundColor: cssVar('--panel'),
        titleColor: cssVar('--ink'),
        bodyColor: cssVar('--ink-2'),
        borderColor: cssVar('--line'),
        borderWidth: 1,
        padding: 10,
        titleFont: { family: 'Khand, sans-serif', size: 14 },
        bodyFont: { family: 'JetBrains Mono, monospace', size: 12 }
      }
    },
    scales: {
      x: { grid: { color: grid, drawBorder: false },
           ticks: { color: tick, font: { family: 'Mukta, sans-serif', size: 11 } } },
      y: { grid: { color: grid, drawBorder: false }, beginAtZero: true,
           ticks: { color: tick, font: { family: 'JetBrains Mono, monospace', size: 11 }, precision: 0 } }
    }
  };
}

const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ─────────────────────────────────────────────────────────────── render ── */
export async function showDashboard() {
  const wrap = $('#dashBody');
  if (!lastStats) wrap.innerHTML = skeleton(96, 4);

  let s;
  try { s = await rpcAuth('tuna_admin_stats'); }
  catch (e) {
    wrap.innerHTML = `<div class="alert alert--bad">${esc(e.message)}</div>`;
    throw e;
  }
  lastStats = s;
  paintTiles(s);
  paintCharts(s);
  paintNavCounts(s);
}

function tile(value, label, mod = '', delta = '') {
  return `<div class="stat ${mod}">
    <b>${value}</b><small>${esc(label)}</small>
    ${delta ? `<div class="delta">${esc(delta)}</div>` : ''}
  </div>`;
}

function paintTiles(s) {
  const needsAction = s.pending_deposits + s.pending_withdraws + s.pending_store + s.disputes;

  $('#dashBody').innerHTML = `
    ${needsAction ? `<div class="alert alert--info" style="margin-bottom:14px">
      ${needsAction} item${needsAction === 1 ? '' : 's'} waiting on you —
      ${s.pending_deposits} deposit${s.pending_deposits === 1 ? '' : 's'},
      ${s.pending_withdraws} withdrawal${s.pending_withdraws === 1 ? '' : 's'},
      ${s.pending_store} UC order${s.pending_store === 1 ? '' : 's'},
      ${s.disputes} disputed match${s.disputes === 1 ? '' : 'es'}.
    </div>` : ''}

    <div class="grid grid--4" style="margin-bottom:14px">
      ${tile(num(s.players), 'Players', '', `${s.players_today} joined today`)}
      ${tile(money(s.points_float), 'Points in wallets', 'stat--money', 'What you owe players')}
      ${tile(money(s.commission_total), 'Commission earned', 'stat--good', 'After every settled match')}
      ${tile(num(s.pending_deposits + s.pending_withdraws), 'Awaiting review',
             needsAction ? 'stat--alert' : '', `${s.unpaid_withdraws} approved but unpaid`)}
    </div>

    <div class="grid grid--4" style="margin-bottom:18px">
      ${tile(num(s.open_rooms), 'Open rooms')}
      ${tile(num(s.live_matches), 'Matches in play')}
      ${tile(num(s.disputes), 'Disputes', s.disputes ? 'stat--alert' : '')}
      ${tile(s.avg_rating ? Number(s.avg_rating).toFixed(1) + ' ★' : '—', 'Average rating')}
    </div>

    <div class="grid grid--2">
      <div class="card">
        <div class="card__head"><h3>Money in and out</h3><span class="eyebrow">14 days</span></div>
        <div class="chartbox"><canvas id="chartMoney"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3>Matches and commission</h3><span class="eyebrow">14 days</span></div>
        <div class="chartbox"><canvas id="chartMatches"></canvas></div>
      </div>
    </div>

    <div class="grid grid--2" style="margin-top:14px">
      <div class="card">
        <div class="card__head"><h3>New players</h3><span class="eyebrow">14 days</span></div>
        <div class="chartbox chartbox--sm"><canvas id="chartSignups"></canvas></div>
      </div>
      <div class="card">
        <div class="card__head"><h3>Where matches happen</h3><span class="eyebrow">All time</span></div>
        <div class="chartbox chartbox--sm"><canvas id="chartSplit"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card__head"><h3>Lifetime totals</h3></div>
      <div class="grid grid--3">
        ${tile(money(s.deposit_total), 'Deposits approved', 'stat--money')}
        ${tile(money(s.withdraw_total), 'Withdrawals approved', 'stat--money')}
        ${tile(num(s.blocked), 'Blocked accounts', s.blocked ? 'stat--alert' : '')}
      </div>
    </div>`;
}

function paintCharts(s) {
  Object.values(charts).forEach((c) => c?.destroy());
  charts = {};

  const series = s.series || [];
  const labels = series.map((d) => dayLabel(d.day));
  const opts = baseOptions();

  charts.money = new Chart($('#chartMoney'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Deposits', data: series.map((d) => d.deposits),
          borderColor: cssVar('--win'), backgroundColor: cssVar('--win') + '26',
          fill: true, tension: .35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Withdrawals', data: series.map((d) => d.withdrawals),
          borderColor: cssVar('--crimson'), backgroundColor: cssVar('--crimson') + '20',
          fill: true, tension: .35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 }
      ]
    },
    options: opts
  });

  charts.matches = new Chart($('#chartMatches'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Matches', data: series.map((d) => d.matches),
          backgroundColor: cssVar('--indigo'), borderRadius: 3, order: 2 },
        { label: 'Commission', data: series.map((d) => d.commission),
          type: 'line', borderColor: cssVar('--marigold'), borderWidth: 2,
          tension: .35, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y1', order: 1 }
      ]
    },
    options: {
      ...opts,
      scales: {
        ...opts.scales,
        y1: { position: 'right', beginAtZero: true, grid: { display: false },
              ticks: { color: cssVar('--marigold'),
                       font: { family: 'JetBrains Mono, monospace', size: 11 } } }
      }
    }
  });

  charts.signups = new Chart($('#chartSignups'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Sign-ups', data: series.map((d) => d.signups),
                   backgroundColor: cssVar('--marigold'), borderRadius: 3 }]
    },
    options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } }
  });

  const split = s.game_split || [];
  const nameOf = (g) => (g === 'pubg' ? 'PUBG Mobile' : 'Free Fire');
  charts.split = new Chart($('#chartSplit'), {
    type: 'doughnut',
    data: {
      labels: split.length ? split.map((g) => nameOf(g.game)) : ['No matches yet'],
      datasets: [{
        data: split.length ? split.map((g) => g.matches) : [1],
        backgroundColor: split.length
          ? [cssVar('--crimson'), cssVar('--indigo')]
          : [cssVar('--line')],
        borderColor: cssVar('--panel'),
        borderWidth: 3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom',
                  labels: { color: cssVar('--chart-tick'), usePointStyle: true, boxWidth: 9,
                            font: { family: 'Mukta, sans-serif', size: 12 } } },
        tooltip: opts.plugins.tooltip
      }
    }
  });
}

/* Badge counts on the sidebar so you can see work waiting without clicking. */
function paintNavCounts(s) {
  const set = (view, n) => {
    const el = document.querySelector(`.navb[data-view="${view}"] .count`);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : String(n);
  };
  set('deposits', s.pending_deposits);
  set('withdrawals', s.pending_withdraws);
  set('store', s.pending_store);
  set('matches', s.disputes);
  set('reports', s.open_reports);
  set('resets', s.open_resets);
  set('tournaments', s.pending_tourn);
}

/** Charts hold baked-in colours, so a theme flip needs a redraw. */
export function redrawCharts() {
  if (lastStats) paintCharts(lastStats);
}
