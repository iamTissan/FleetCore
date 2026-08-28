/**
 * MAINTENANCE-SCHEDULE.JS — Upcoming scheduled work orders.
 */
import { supabase, getUserProfile, formatDate, daysUntil, escapeHtml } from '../config.js';

const tbody = document.getElementById('sched-tbody');
if (tbody) init();

const URGENCY_CLS = {
  critical: 'bg-error-container text-error', high: 'bg-warning-amber/10 text-warning-amber',
  normal: 'bg-surface-container text-on-surface-variant', low: 'bg-surface-container text-on-surface-variant',
};

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('organization_id', profile.organization_id)
    .in('status', ['open', 'in_progress'])
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: true });

  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('sched-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const orders = data || [];
  if (orders.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = orders.map(o => {
    const d = daysUntil(o.scheduled_date);
    const overdue = d < 0;
    return `<tr class="border-t border-border-light hover:bg-surface-container-low transition-colors ${overdue ? 'bg-error-container/10' : ''}">
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : '—'}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${escapeHtml(o.service_type || '—')}</td>
      <td class="px-md py-sm font-body-sm text-body-sm ${overdue ? 'text-danger-red font-semibold' : 'text-text-muted'}">${formatDate(o.scheduled_date)}${overdue ? ' (Overdue)' : ''}</td>
      <td class="px-md py-sm"><span class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${URGENCY_CLS[o.urgency] || URGENCY_CLS.normal} uppercase tracking-wider capitalize">${escapeHtml(o.urgency || 'normal')}</span></td>
    </tr>`;
  }).join('');
}
