/**
 * ADMIN-VEHICLES.JS — Fully wired vehicle registry for Company Admin.
 * No mock data. Reads/writes public.vehicles, scoped by RLS to the
 * signed-in admin's organization_id.
 */
import { supabase, getUserProfile, formatDate, daysUntil, escapeHtml, avatarDataUri, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  active:     { label: 'Operational', cls: 'bg-secondary-container/20 text-secondary' },
  in_service: { label: 'In Service',  cls: 'bg-warning-amber/10 text-warning-amber' },
  flagged:    { label: 'Flagged',     cls: 'bg-error-container/50 text-error' },
  inactive:   { label: 'Inactive',    cls: 'bg-surface-container-high text-on-surface-variant' },
};

let orgId = null;
let vehicles = [];
let drivers = [];
let activeFilter = 'all';
let searchTerm = '';
let editingId = null;

const tbody = document.getElementById('vehicles-tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadDrivers();
  await loadVehicles();

  document.getElementById('vehicle-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('bg-surface-container-low', 'font-medium'));
      btn.classList.add('bg-surface-container-low', 'font-medium');
      render();
    });
  });

  document.querySelectorAll('.fc-add-vehicle-btn').forEach(btn => btn.addEventListener('click', () => openModal()));
  document.getElementById('vehicle-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('vehicle-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('vehicle-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('vehicle-form')?.addEventListener('submit', onSubmit);

  tbody.addEventListener('click', onTableClick);
}

async function loadDrivers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('organization_id', orgId)
    .eq('role', 'driver')
    .order('full_name');
  if (!error) drivers = data || [];
  const select = document.getElementById('vehicle-driver-select');
  if (select) {
    select.innerHTML = '<option value="">Unassigned</option>' +
      drivers.map(d => `<option value="${d.id}">${escapeHtml(d.full_name || 'Unnamed driver')}</option>`).join('');
  }
}

async function loadVehicles() {
  tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm">Loading vehicles…</td></tr>`;
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, assigned_driver:profiles(id, full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm">Failed to load vehicles: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  vehicles = data || [];
  render();
}

function render() {
  updateCounts();

  let list = vehicles;
  if (activeFilter !== 'all') list = list.filter(v => v.status === activeFilter);
  if (searchTerm) {
    list = list.filter(v =>
      (v.plate_number || '').toLowerCase().includes(searchTerm) ||
      (v.make || '').toLowerCase().includes(searchTerm) ||
      (v.model || '').toLowerCase().includes(searchTerm) ||
      (v.assigned_driver?.full_name || '').toLowerCase().includes(searchTerm)
    );
  }

  const countEl = document.getElementById('vehicles-showing-count');
  if (countEl) countEl.textContent = `Showing ${list.length} of ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}`;

  if (vehicles.length === 0) {
    tbody.innerHTML = emptyStateRow('No vehicles yet', 'Add your first vehicle to start tracking your fleet.');
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = emptyStateRow('No matches', 'Try a different search term or filter.');
    return;
  }

  tbody.innerHTML = list.map(rowHtml).join('');
}

function updateCounts() {
  const counts = { all: vehicles.length, active: 0, in_service: 0, flagged: 0 };
  vehicles.forEach(v => { if (counts[v.status] !== undefined) counts[v.status]++; });
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  set('count-all', counts.all);
  set('count-active', counts.active);
  set('count-in_service', counts.in_service);
  set('count-flagged', counts.flagged);
}

function emptyStateRow(title, sub) {
  return `<tr><td colspan="5" class="py-xl text-center">
    <div class="flex flex-col items-center gap-xs text-text-muted">
      <span class="material-symbols-outlined" style="font-size:32px;">local_shipping</span>
      <span class="font-label-md text-label-md text-on-surface">${escapeHtml(title)}</span>
      <span class="font-body-sm text-body-sm">${escapeHtml(sub)}</span>
    </div>
  </td></tr>`;
}

function expiryCell(dateStr) {
  if (!dateStr) return `<span class="text-text-muted italic text-xs">Not on file</span>`;
  const d = daysUntil(dateStr);
  let colorClass = 'text-secondary', barClass = 'bg-secondary', label = `${d} days`, width = Math.max(4, Math.min(100, (d / 180) * 100));
  if (d < 0) { colorClass = 'text-error font-bold'; barClass = 'bg-error'; label = 'Expired'; width = 100; }
  else if (d <= 30) { colorClass = 'text-warning-amber font-medium'; barClass = 'bg-warning-amber'; width = Math.max(8, width); }
  return `<div class="flex flex-col gap-1 w-full max-w-[180px]">
    <div class="flex justify-between text-xs">
      <span class="text-on-surface">${formatDate(dateStr)}</span>
      <span class="${colorClass}">${label}</span>
    </div>
    <div class="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
      <div class="h-full ${barClass} rounded-full" style="width:${width}%"></div>
    </div>
  </div>`;
}

function rowHtml(v) {
  const driverCell = v.assigned_driver
    ? `<div class="flex items-center gap-xs">
        <img alt="Driver profile" class="w-6 h-6 rounded-full object-cover border border-border-light" src="${avatarDataUri(v.assigned_driver.full_name)}"/>
        <span class="text-on-surface">${escapeHtml(v.assigned_driver.full_name || 'Unnamed driver')}</span>
      </div>`
    : `<span class="text-text-muted italic text-xs">Unassigned</span>`;

  return `<tr class="border-b border-border-light bg-surface-container-lowest hover:bg-surface-bright transition-colors hover-row-shadow group" data-id="${v.id}">
    <td class="py-md px-md">
      <div class="flex items-center gap-sm">
        <div class="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-text-muted border border-border-light">
          <span class="material-symbols-outlined">local_shipping</span>
        </div>
        <div>
          <div class="font-mono-data text-mono-data text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded border border-border-light inline-block mb-1 tracking-wider">${escapeHtml(v.plate_number)}</div>
          <div class="text-text-muted text-xs">${escapeHtml([v.make, v.model].filter(Boolean).join(' ') || v.vehicle_type || '—')}</div>
        </div>
      </div>
    </td>
    <td class="py-md px-md">${statusBadge(v.status, STATUS_MAP)}</td>
    <td class="py-md px-md">${driverCell}</td>
    <td class="py-md px-md">${expiryCell(v.roadworthiness_expiry)}</td>
    <td class="py-md px-md text-right">
      <button class="text-text-muted hover:text-on-surface p-1 rounded hover:bg-surface-container-low transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" data-action="edit" title="Edit vehicle">
        <span class="material-symbols-outlined" style="font-size:20px;">edit</span>
      </button>
      <button class="text-text-muted hover:text-error p-1 rounded hover:bg-surface-container-low transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" data-action="delete" title="Remove vehicle">
        <span class="material-symbols-outlined" style="font-size:20px;">delete</span>
      </button>
    </td>
  </tr>`;
}

function onTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const tr = btn.closest('tr[data-id]');
  const id = tr?.getAttribute('data-id');
  const vehicle = vehicles.find(v => v.id === id);
  if (!vehicle) return;
  if (btn.dataset.action === 'edit') openModal(vehicle);
  if (btn.dataset.action === 'delete') deleteVehicle(vehicle);
}

async function deleteVehicle(vehicle) {
  if (!confirm(`Remove ${vehicle.plate_number} from the fleet? This cannot be undone.`)) return;
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
  if (error) { showToast(`Could not remove vehicle: ${error.message}`, 'error'); return; }
  vehicles = vehicles.filter(v => v.id !== vehicle.id);
  render();
  showToast(`${vehicle.plate_number} removed.`, 'success');
}

function openModal(vehicle = null) {
  editingId = vehicle?.id || null;
  const modal = document.getElementById('vehicle-modal');
  if (!modal) return;
  document.getElementById('vehicle-modal-title').textContent = vehicle ? 'Edit Vehicle' : 'Add Vehicle';
  document.getElementById('vehicle-plate').value = vehicle?.plate_number || '';
  document.getElementById('vehicle-make').value = vehicle?.make || '';
  document.getElementById('vehicle-model').value = vehicle?.model || '';
  document.getElementById('vehicle-year').value = vehicle?.year || '';
  document.getElementById('vehicle-type').value = vehicle?.vehicle_type || 'truck';
  document.getElementById('vehicle-capacity').value = vehicle?.capacity_kg || '';
  document.getElementById('vehicle-status').value = vehicle?.status || 'active';
  document.getElementById('vehicle-roadworthiness').value = vehicle?.roadworthiness_expiry || '';
  document.getElementById('vehicle-insurance').value = vehicle?.insurance_expiry || '';
  document.getElementById('vehicle-driver-select').value = vehicle?.assigned_driver_id || '';
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('vehicle-modal')?.classList.add('hidden');
  editingId = null;
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('vehicle-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';

  const payload = {
    organization_id: orgId,
    plate_number: document.getElementById('vehicle-plate').value.trim().toUpperCase(),
    make: document.getElementById('vehicle-make').value.trim() || null,
    model: document.getElementById('vehicle-model').value.trim() || null,
    year: document.getElementById('vehicle-year').value ? Number(document.getElementById('vehicle-year').value) : null,
    vehicle_type: document.getElementById('vehicle-type').value,
    capacity_kg: document.getElementById('vehicle-capacity').value ? Number(document.getElementById('vehicle-capacity').value) : null,
    status: document.getElementById('vehicle-status').value,
    roadworthiness_expiry: document.getElementById('vehicle-roadworthiness').value || null,
    insurance_expiry: document.getElementById('vehicle-insurance').value || null,
    assigned_driver_id: document.getElementById('vehicle-driver-select').value || null,
  };

  if (!payload.plate_number) {
    showToast('Plate number is required.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const query = editingId
    ? supabase.from('vehicles').update(payload).eq('id', editingId)
    : supabase.from('vehicles').insert(payload);

  const { error } = await query;
  btn.disabled = false; btn.textContent = original;

  if (error) {
    showToast(error.code === '23505' ? 'A vehicle with this plate number already exists.' : error.message, 'error');
    return;
  }

  showToast(editingId ? 'Vehicle updated.' : 'Vehicle added.', 'success');
  closeModal();
  await loadVehicles();
}
