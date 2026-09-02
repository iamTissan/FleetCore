/**
 * BEX-PLATFORM-ANALYTICS.JS — Cross-tenant growth metrics and MoM calculations.
 */
import { supabase, escapeHtml } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('pa-tbody');
if (tbody) initPlatformAnalytics();

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

export async function initPlatformAnalytics() {
  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  const metrics = [
    { label: 'New Organizations Provisioned', table: 'organizations', dateCol: 'created_at', icon: 'bi-buildings' },
    { label: 'Vehicles Registered into Fleets', table: 'vehicles', dateCol: 'created_at', icon: 'bi-truck' },
    { label: 'Users & Drivers Onboarded', table: 'profiles', dateCol: 'created_at', icon: 'bi-people' },
    { label: 'Trip Deployments Executed', table: 'trips', dateCol: 'created_at', icon: 'bi-signpost-split' },
    { label: 'Work Orders Issued', table: 'work_orders', dateCol: 'created_at', icon: 'bi-tools' },
    { label: 'Crisis Incidents Handled', table: 'incidents', dateCol: 'created_at', icon: 'bi-shield-exclamation' },
  ];

  const rows = await Promise.all(metrics.map(async m => ({
    ...m,
    thisMonth: await countInRange(m.table, m.dateCol, thisM.start, thisM.end),
    lastMonth: await countInRange(m.table, m.dateCol, lastM.start, lastM.end),
  })));

  tbody.innerHTML = rows.map(r => {
    let trend = `<span class="text-slate-400 font-mono">—</span>`;
    if (r.lastMonth > 0) {
      const pct = ((r.thisMonth - r.lastMonth) / r.lastMonth) * 100;
      const up = pct >= 0;
      trend = `<span class="${up ? 'text-emerald-600 bg-emerald-50 border-emerald-200/60' : 'text-rose-600 bg-rose-50 border-rose-200/60'} inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md border text-[11px]"><i class="bi ${up ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i> ${Math.abs(pct).toFixed(0)}%</span>`;
    } else if (r.thisMonth > 0) {
      trend = `<span class="text-emerald-600 font-bold bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md text-[11px]">New activity</span>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-bold text-slate-800 flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 text-sm">
            <i class="bi ${r.icon}"></i>
          </div>
          <span>${escapeHtml(r.label)}</span>
        </td>
        <td class="py-3 px-4 font-mono font-bold text-slate-900 text-right text-sm">${r.thisMonth.toLocaleString()}</td>
        <td class="py-3 px-4 font-mono text-slate-500 text-right">${r.lastMonth.toLocaleString()}</td>
        <td class="py-3 px-4 text-right">${trend}</td>
      </tr>`;
  }).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});