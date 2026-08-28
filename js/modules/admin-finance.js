/**
 * ADMIN-FINANCE.JS — Fleet-wide cost summary for Company Admin.
 * Real month-over-month totals from fuel_logs and work_orders. No mock data.
 */
import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';

const tbody = document.querySelector('main table tbody');
if (tbody) init();

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function sumInRange(table, orgId, dateCol, amountCol, start, end) {
  const { data } = await supabase.from(table).select(amountCol).eq('organization_id', orgId).gte(dateCol, start).lt(dateCol, end);
  return (data || []).reduce((sum, row) => sum + Number(row[amountCol] || 0), 0);
}

function changeCell(thisMonth, lastMonth) {
  if (lastMonth === 0) {
    if (thisMonth === 0) return `<span class="text-text-muted">—</span>`;
    return `<span class="text-warning-amber flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">arrow_upward</span> New spend</span>`;
  }
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const up = pct >= 0;
  const cls = up ? 'text-warning-amber' : 'text-secondary';
  const icon = up ? 'arrow_upward' : 'arrow_downward';
  return `<span class="${cls} flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">${icon}</span> ${Math.abs(pct).toFixed(0)}%</span>`;
}

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-text-muted font-body-sm px-md">Loading financial data…</td></tr>`;

  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  const [fuelThis, fuelLast, maintThis, maintLast] = await Promise.all([
    sumInRange('fuel_logs', orgId, 'logged_at', 'amount_naira', thisM.start, thisM.end),
    sumInRange('fuel_logs', orgId, 'logged_at', 'amount_naira', lastM.start, lastM.end),
    sumInRange('work_orders', orgId, 'created_at', 'cost_naira', thisM.start, thisM.end),
    sumInRange('work_orders', orgId, 'created_at', 'cost_naira', lastM.start, lastM.end),
  ]);

  const totalThis = fuelThis + maintThis;
  const totalLast = fuelLast + maintLast;

  const emptyState = document.querySelector('main .mt-lg');
  const tableWrap = tbody.closest('.bg-surface-container-lowest');

  if (totalThis === 0 && totalLast === 0) {
    tableWrap.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  const rows = [
    { label: 'Fuel', icon: 'local_gas_station', thisM: fuelThis, lastM: fuelLast },
    { label: 'Maintenance', icon: 'build', thisM: maintThis, lastM: maintLast },
    { label: 'Total', icon: 'payments', thisM: totalThis, lastM: totalLast, bold: true },
  ];

  tbody.innerHTML = rows.map(r => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors ${r.bold ? 'font-semibold bg-background-subtle' : ''}">
      <td class="px-md py-sm flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
        <span class="material-symbols-outlined text-text-muted" style="font-size:18px;">${r.icon}</span> ${escapeHtml(r.label)}
      </td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(r.thisM)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-text-muted">${formatNaira(r.lastM)}</td>
      <td class="px-md py-sm font-label-sm text-label-sm">${changeCell(r.thisM, r.lastM)}</td>
    </tr>`).join('');
}
