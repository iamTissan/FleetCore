/**
 * BEX-PLATFORM-ANALYTICS.JS — Cross-tenant growth metrics for Bex Admin.
 * Real month-over-month counts across all tenants. No fake trend %.
 */
import { supabase, escapeHtml } from '../config.js';

const tbody = document.getElementById('pa-tbody');
if (tbody) init();

function monthBounds(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function countInRange(table, dateCol, start, end) {
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).gte(dateCol, start).lt(dateCol, end);
  return count || 0;
}

async function init() {
  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  const metrics = [
    { label: 'New Tenants', table: 'organizations', dateCol: 'created_at', icon: 'domain' },
    { label: 'New Vehicles Registered', table: 'vehicles', dateCol: 'created_at', icon: 'local_shipping' },
    { label: 'New Users Onboarded', table: 'profiles', dateCol: 'created_at', icon: 'group' },
    { label: 'Trips Created', table: 'trips', dateCol: 'created_at', icon: 'route' },
    { label: 'Incidents Reported', table: 'incidents', dateCol: 'created_at', icon: 'emergency' },
  ];

  const rows = await Promise.all(metrics.map(async m => ({
    ...m,
    thisMonth: await countInRange(m.table, m.dateCol, thisM.start, thisM.end),
    lastMonth: await countInRange(m.table, m.dateCol, lastM.start, lastM.end),
  })));

  const empty = document.getElementById('pa-empty');
  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const total = rows.reduce((s, r) => s + r.thisMonth + r.lastMonth, 0);

  if (total === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = rows.map(r => {
    let trend = `<span class="text-text-muted">—</span>`;
    if (r.lastMonth > 0) {
      const pct = ((r.thisMonth - r.lastMonth) / r.lastMonth) * 100;
      const up = pct >= 0;
      trend = `<span class="${up ? 'text-secondary' : 'text-danger-red'} flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:14px;">${up ? 'arrow_upward' : 'arrow_downward'}</span> ${Math.abs(pct).toFixed(0)}%</span>`;
    } else if (r.thisMonth > 0) {
      trend = `<span class="text-secondary">New activity</span>`;
    }
    return `<tr class="border-t border-border-light hover:bg-surface-container-low transition-colors">
      <td class="px-md py-sm flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
        <span class="material-symbols-outlined text-text-muted" style="font-size:18px;">${r.icon}</span> ${escapeHtml(r.label)}
      </td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${r.thisMonth}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-text-muted">${r.lastMonth}</td>
      <td class="px-md py-sm font-label-sm text-label-sm">${trend}</td>
    </tr>`;
  }).join('');
}
