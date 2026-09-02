/**
 * ADMIN-MAINTENANCE.JS — Fleet-wide maintenance summary, vehicle work orders,
 * and cost analysis for the FleetCore Company Admin portal.
 */

import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  ok:       { label: 'Operational', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  open:     { label: 'Service Due', cls: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  critical: { label: 'Critical Issue', cls: 'bg-rose-50 text-rose-700 border border-rose-200/60' },
};

let currentOrgId = null;
let vehicles = [];

const tbody = document.getElementById('maintenance-tbody');
if (tbody) initMaintenance();

export async function initMaintenance() {
  const profile = await getUserProfile();
  if (!profile) return;
  
  currentOrgId = profile.organization_id;

  // Hydrate header user information
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = profile.full_name || 'Fleet Administrator';
  if (headerAvatar && profile.full_name) {
    const initials = profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    headerAvatar.textContent = initials;
  }

  // Fetch true organization name
  if (currentOrgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', currentOrgId)
      .single();
    
    if (org && document.getElementById('fc-org-name')) {
      document.getElementById('fc-org-name').textContent = org.name;
    }
  }

  // Modal bindings
  document.getElementById('order-modal-close')?.addEventListener('click', closeOrderModal);
  document.getElementById('order-cancel-btn')?.addEventListener('click', closeOrderModal);

  await loadVehiclesDropdown();
  await loadMaintenanceData();
}
window.initMaintenance = initMaintenance;

async function loadVehiclesDropdown() {
  if (!currentOrgId) return;
  const { data } = await supabase
    .from('vehicles')
    .select('id, plate_number, make, model')
    .eq('organization_id', currentOrgId)
    .order('plate_number');

  vehicles = data || [];
  const select = document.getElementById('order-vehicle');
  if (select) {
    select.innerHTML = vehicles.length
      ? vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)} (${escapeHtml([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle')})</option>`).join('')
      : `<option value="">No vehicles registered yet</option>`;
  }
}

async function loadMaintenanceData() {
  if (!tbody || !currentOrgId) return;

  tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 font-medium">Fetching maintenance records...</td></tr>`;

  const [vehiclesRes, workOrdersRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate_number, make, model').eq('organization_id', currentOrgId),
    supabase.from('work_orders').select('*').eq('organization_id', currentOrgId).order('created_at', { ascending: false }),
  ]);

  const vehicleList = vehiclesRes.data || [];
  const workOrders = workOrdersRes.data || [];
  const tableContainer = document.getElementById('table-container');
  const emptyState = document.getElementById('empty-state');

  if (vehicleList.length === 0) {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    updateSummaryKpis([], 0);
    return;
  }

  const byVehicle = {};
  vehicleList.forEach(v => { byVehicle[v.id] = { vehicle: v, orders: [] }; });
  workOrders.forEach(w => { if (byVehicle[w.vehicle_id]) byVehicle[w.vehicle_id].orders.push(w); });

  let cumulativeCost = 0;
  let totalOpenOrders = 0;
  let criticalCount = 0;
  let scheduledCount = 0;

  const rows = Object.values(byVehicle).map(({ vehicle, orders }) => {
    const completed = orders
      .filter(o => o.status === 'completed' && (o.completed_at || o.created_at))
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));

    const openOrders = orders.filter(o => o.status === 'open' || o.status === 'in_progress');
    const scheduledOrders = openOrders.filter(o => o.scheduled_date).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    
    const lastService = completed[0]?.completed_at || completed[0]?.created_at || null;
    const nextDue = scheduledOrders[0]?.scheduled_date || null;
    const totalCost = orders.reduce((sum, o) => sum + Number(o.cost_naira || 0), 0);
    const hasCritical = openOrders.some(o => o.urgency === 'critical' || o.urgency === 'high');
    const status = hasCritical ? 'critical' : openOrders.length > 0 ? 'open' : 'ok';

    cumulativeCost += totalCost;
    totalOpenOrders += openOrders.length;
    if (hasCritical) criticalCount++;
    if (nextDue) scheduledCount++;

    return { vehicle, lastService, nextDue, totalCost, status, openCount: openOrders.length };
  });

  updateSummaryKpis(rows, cumulativeCost, totalOpenOrders, criticalCount, scheduledCount);

  if (tableContainer) tableContainer.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  const countLabel = document.getElementById('maintenance-count');
  if (countLabel) countLabel.textContent = `Tracking ${rows.length} fleet unit${rows.length === 1 ? '' : 's'}`;

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-slate-50/75 transition border-b border-slate-100">
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200/60 shrink-0">
            <i class="bi bi-truck text-base"></i>
          </div>
          <div>
            <div class="font-mono text-xs text-slate-900 bg-slate-100/80 px-2 py-0.5 rounded-lg border border-slate-200 inline-block font-bold tracking-wider mb-0.5">${escapeHtml(r.vehicle.plate_number)}</div>
            <div class="text-slate-400 text-[11px]">${escapeHtml([r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || 'Vehicle')}</div>
          </div>
        </div>
      </td>
      <td class="py-3.5 px-4">
        <div class="flex flex-col gap-1 items-start">
          ${statusBadge(r.status, STATUS_MAP)}
          ${r.openCount ? `<span class="text-[10px] text-slate-400 font-semibold">${r.openCount} active work order${r.openCount === 1 ? '' : 's'}</span>` : ''}
        </div>
      </td>
      <td class="py-3.5 px-4 font-medium text-slate-700">
        ${r.lastService ? formatDate(r.lastService) : '<span class="text-slate-400 italic text-[11px]">No prior records</span>'}
      </td>
      <td class="py-3.5 px-4 font-medium text-slate-700">
        ${r.nextDue ? `<span class="text-teal-700 font-bold">${formatDate(r.nextDue)}</span>` : '<span class="text-slate-400 italic text-[11px]">Not scheduled</span>'}
      </td>
      <td class="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
        ${formatNaira(r.totalCost)}
      </td>
    </tr>`).join('');
}

function updateSummaryKpis(rows, cost, openOrders = 0, critical = 0, scheduled = 0) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kpi-total-cost', formatNaira(cost));
  set('kpi-open-orders', openOrders);
  set('kpi-critical-units', critical);
  set('kpi-scheduled-services', scheduled);
}

window.openOrderModal = function() {
  document.getElementById('order-modal')?.classList.remove('hidden');
};

window.closeOrderModal = function() {
  document.getElementById('order-modal')?.classList.add('hidden');
  document.getElementById('order-form')?.reset();
};

window.handleCreateWorkOrder = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('order-save-btn');
  const original = btn.textContent;

  const vehicle_id = document.getElementById('order-vehicle').value;
  const service_type = document.getElementById('order-service-type').value.trim();
  const urgency = document.getElementById('order-urgency').value;
  const cost_naira = document.getElementById('order-cost').value ? Number(document.getElementById('order-cost').value) : 0;
  const scheduled_date = document.getElementById('order-scheduled-date').value || null;
  const notes = document.getElementById('order-notes').value.trim() || null;

  if (!vehicle_id || !service_type) {
    showToast('Vehicle and service type are required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const profile = await getUserProfile();
  const payload = {
    organization_id: currentOrgId,
    vehicle_id,
    service_type,
    urgency,
    cost_naira,
    scheduled_date,
    notes,
    status: 'open',
    created_by: profile?.id || null,
  };

  const { error } = await supabase.from('work_orders').insert(payload);
  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Work order successfully created.', 'success');
  window.closeOrderModal();
  await loadMaintenanceData();
};