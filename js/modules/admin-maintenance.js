/**
 * ADMIN-MAINTENANCE.JS — Fleet-wide maintenance summary for Company Admin.
 * Aggregates public.work_orders per vehicle. No mock data.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';

const STATUS_MAP = {
  ok:       { label: 'Operational', cls: 'bg-secondary-container/20 text-secondary' },
  open:     { label: 'Service Due', cls: 'bg-warning-amber/10 text-warning-amber' },
  critical: { label: 'Critical',    cls: 'bg-error-container/50 text-error' },
};

const tbody = document.querySelector('main table tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-md">Loading maintenance records…</td></tr>`;

  const [vehiclesRes, workOrdersRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate_number, make, model').eq('organization_id', orgId),
    supabase.from('work_orders').select('*').eq('organization_id', orgId),
  ]);

  const vehicles = vehiclesRes.data || [];
  const workOrders = workOrdersRes.data || [];
  const emptyState = document.querySelector('main .mt-lg');

  if (vehicles.length === 0) {
    tbody.closest('.bg-surface-container-lowest').classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  const byVehicle = {};
  vehicles.forEach(v => { byVehicle[v.id] = { vehicle: v, orders: [] }; });
  workOrders.forEach(w => { if (byVehicle[w.vehicle_id]) byVehicle[w.vehicle_id].orders.push(w); });

  const rows = Object.values(byVehicle).map(({ vehicle, orders }) => {
    const completed = orders.filter(o => o.status === 'completed' && o.completed_at).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    const openOrders = orders.filter(o => o.status === 'open' || o.status === 'in_progress');
    const lastService = completed[0]?.completed_at || null;
    const nextDue = openOrders.filter(o => o.scheduled_date).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0]?.scheduled_date || null;
    const totalCost = orders.reduce((sum, o) => sum + Number(o.cost_naira || 0), 0);
    const hasCritical = openOrders.some(o => o.urgency === 'critical' || o.urgency === 'high');
    const status = hasCritical ? 'critical' : openOrders.length > 0 ? 'open' : 'ok';
    return { vehicle, lastService, nextDue, totalCost, status, openCount: openOrders.length };
  });

  if (workOrders.length === 0) {
    tbody.closest('.bg-surface-container-lowest').classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  tbody.closest('.bg-surface-container-lowest').classList.remove('hidden');

  tbody.innerHTML = rows.map(r => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors">
      <td class="px-md py-sm">
        <div class="font-mono-data text-mono-data text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded border border-border-light inline-block tracking-wider">${escapeHtml(r.vehicle.plate_number)}</div>
        <div class="text-text-muted text-xs mt-1">${escapeHtml([r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || '—')}</div>
      </td>
      <td class="px-md py-sm">${statusBadge(r.status, STATUS_MAP)}${r.openCount ? `<div class="text-xs text-text-muted mt-1">${r.openCount} open work order${r.openCount === 1 ? '' : 's'}</div>` : ''}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${r.lastService ? formatDate(r.lastService) : '<span class="text-text-muted italic">No record</span>'}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${r.nextDue ? formatDate(r.nextDue) : '<span class="text-text-muted italic">Not scheduled</span>'}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(r.totalCost)}</td>
    </tr>`).join('');
}
