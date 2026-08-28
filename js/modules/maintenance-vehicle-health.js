/**
 * MAINTENANCE-VEHICLE-HEALTH.JS — Fleet vehicle list for Maintenance Officer.
 * Real vehicles + real open work order counts. No mock rows.
 */
import { supabase, getUserProfile, formatDate, daysUntil, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const tbody = document.getElementById('vh-tbody');
if (tbody) init();

let vehicles = [];
let searchTerm = '';

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  const [vehiclesRes, ordersRes] = await Promise.all([
    supabase.from('vehicles').select('*').eq('organization_id', orgId).order('plate_number'),
    supabase.from('work_orders').select('vehicle_id, urgency').eq('organization_id', orgId).in('status', ['open', 'in_progress']),
  ]);

  if (vehiclesRes.error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(vehiclesRes.error.message)}</td></tr>`;
    return;
  }

  const openByVehicle = {};
  (ordersRes.data || []).forEach(o => {
    if (!openByVehicle[o.vehicle_id]) openByVehicle[o.vehicle_id] = [];
    openByVehicle[o.vehicle_id].push(o.urgency);
  });

  vehicles = (vehiclesRes.data || []).map(v => ({ ...v, openUrgencies: openByVehicle[v.id] || [] }));
  render();

  document.getElementById('vh-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  tbody.addEventListener('click', onTableClick);
}

function render() {
  let list = vehicles;
  if (searchTerm) {
    list = list.filter(v =>
      (v.plate_number || '').toLowerCase().includes(searchTerm) ||
      (v.make || '').toLowerCase().includes(searchTerm) ||
      (v.model || '').toLowerCase().includes(searchTerm)
    );
  }

  document.getElementById('vh-count').textContent = `Showing ${list.length} of ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`;

  if (vehicles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-md">No vehicles registered yet.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-md">No matches.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(rowHtml).join('');
}

function healthStatus(v) {
  if (v.openUrgencies.some(u => u === 'critical')) return { label: 'Critical', cls: 'bg-error-container text-error' };
  if (v.openUrgencies.length > 0) return { label: 'In Service', cls: 'bg-warning-amber/10 text-warning-amber' };
  if (v.status === 'flagged') return { label: 'Flagged', cls: 'bg-error-container text-error' };
  return { label: 'Operational', cls: 'bg-secondary-container/30 text-secondary' };
}

function rowHtml(v) {
  const status = healthStatus(v);
  const d = daysUntil(v.roadworthiness_expiry);
  let rwCell = `<span class="text-text-muted italic text-xs">Not on file</span>`;
  if (v.roadworthiness_expiry) {
    const cls = d < 0 ? 'text-danger-red' : d <= 30 ? 'text-warning-amber' : 'text-text-muted';
    const icon = d < 0 ? 'warning' : 'calendar_today';
    rwCell = `<div class="flex items-center gap-xs ${cls}"><span class="material-symbols-outlined text-xs" style="font-size:14px;">${icon}</span> ${d < 0 ? `Expired ${formatDate(v.roadworthiness_expiry)}` : formatDate(v.roadworthiness_expiry)}</div>`;
  }

  return `<tr class="hover:bg-surface-container-low hover:shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all duration-150 group ${status.label === 'Critical' ? 'bg-error-container/20' : ''}" data-id="${v.id}">
    <td class="px-md py-md align-middle">
      <div class="flex items-center gap-sm">
        <div class="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-text-muted group-hover:bg-primary-fixed group-hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-base">local_shipping</span>
        </div>
        <span class="font-mono-data text-mono-data bg-surface-container-highest px-xs py-1 rounded text-on-surface border border-border-light uppercase">${escapeHtml(v.plate_number)}</span>
      </div>
    </td>
    <td class="px-md py-md align-middle">
      <span class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${status.cls} uppercase tracking-wider">${status.label}</span>
    </td>
    <td class="px-md py-md align-middle text-on-surface-variant hidden md:table-cell">${escapeHtml([v.make, v.model, v.year].filter(Boolean).join(' ') || '—')}</td>
    <td class="px-md py-md align-middle text-on-surface-variant hidden sm:table-cell">${rwCell}</td>
    <td class="px-md py-md align-middle text-right">
      <button class="text-text-muted hover:text-danger-red transition-colors p-sm rounded hover:bg-error-container" data-action="flag" title="Flag for Maintenance">
        <span class="material-symbols-outlined text-base">flag</span>
      </button>
      <a class="text-text-muted hover:text-primary transition-colors p-sm rounded hover:bg-surface-container ml-xs inline-flex" href="work-orders.html?vehicle=${v.id}" title="View Work Orders">
        <span class="material-symbols-outlined text-base">more_vert</span>
      </a>
    </td>
  </tr>`;
}

async function onTableClick(e) {
  const btn = e.target.closest('[data-action="flag"]');
  if (!btn) return;
  const id = btn.closest('tr[data-id]')?.getAttribute('data-id');
  const vehicle = vehicles.find(v => v.id === id);
  if (!vehicle) return;
  if (!confirm(`Flag ${vehicle.plate_number} for maintenance?`)) return;

  const { error } = await supabase.from('vehicles').update({ status: 'flagged' }).eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  vehicle.status = 'flagged';
  render();
  showToast(`${vehicle.plate_number} flagged for maintenance.`, 'success');
}
