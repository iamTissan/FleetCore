/**
 * ADMIN-DRIVERS.JS — Fully wired driver roster for Company Admin.
 * No mock data. Reads public.profiles (role=driver); creates new drivers
 * via the create-user Edge Function (needs a real Supabase auth user, so
 * it can't be a plain client-side insert).
 */
import { supabase, getUserProfile, formatDate, daysUntil, escapeHtml, avatarDataUri, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  active:   { label: 'Active',   cls: 'bg-secondary-container/20 text-secondary' },
  inactive: { label: 'Inactive', cls: 'bg-surface-container-high text-on-surface-variant' },
  pending:  { label: 'Pending',  cls: 'bg-warning-amber/10 text-warning-amber' },
};

let orgId = null;
let drivers = [];
let vehicles = [];
let searchTerm = '';

const tbody = document.getElementById('drivers-tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadVehicles();
  await loadDrivers();

  document.getElementById('driver-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll('.fc-add-driver-btn').forEach(btn => btn.addEventListener('click', () => openModal()));
  document.getElementById('driver-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('driver-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('driver-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('driver-form')?.addEventListener('submit', onSubmit);

  tbody.addEventListener('click', onTableClick);
}

async function loadVehicles() {
  const { data } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId).order('plate_number');
  vehicles = data || [];
}

async function loadDrivers() {
  tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm">Loading drivers…</td></tr>`;
  const { data, error } = await supabase
    .from('profiles')
    .select('*, vehicle:vehicles!vehicles_assigned_driver_id_fkey(id, plate_number)')
    .eq('organization_id', orgId)
    .eq('role', 'driver')
    .order('created_at', { ascending: false });

  if (error) {
    // Fallback if the reverse FK alias name differs — fetch drivers, then match vehicles client-side.
    const { data: plainDrivers, error: err2 } = await supabase
      .from('profiles').select('*').eq('organization_id', orgId).eq('role', 'driver').order('created_at', { ascending: false });
    if (err2) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm">Failed to load drivers: ${escapeHtml(err2.message)}</td></tr>`;
      return;
    }
    drivers = (plainDrivers || []).map(d => ({ ...d, vehicle: vehicles.find(v => v.assigned_driver_id === d.id) || null }));
    render();
    return;
  }
  drivers = data || [];
  render();
}

function updateKpis() {
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  set('kpi-total-drivers', drivers.length);
  set('kpi-active-drivers', drivers.filter(d => d.status === 'active').length);
  set('kpi-expiring-licenses', drivers.filter(d => {
    const d2 = daysUntil(d.license_expiry);
    return d2 !== null && d2 <= 30;
  }).length);
}

function render() {
  updateKpis();
  const countEl = document.getElementById('drivers-showing-count');
  let list = drivers;
  if (searchTerm) {
    list = list.filter(d =>
      (d.full_name || '').toLowerCase().includes(searchTerm) ||
      (d.email || '').toLowerCase().includes(searchTerm) ||
      (d.license_number || '').toLowerCase().includes(searchTerm)
    );
  }
  if (countEl) countEl.textContent = `Showing ${list.length} of ${drivers.length} driver${drivers.length === 1 ? '' : 's'}`;

  if (drivers.length === 0) {
    tbody.innerHTML = emptyStateRow('No drivers yet', 'Add your first driver to start assigning trips.');
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = emptyStateRow('No matches', 'Try a different search term.');
    return;
  }
  tbody.innerHTML = list.map(rowHtml).join('');
}

function emptyStateRow(title, sub) {
  return `<tr><td colspan="6" class="py-xl text-center">
    <div class="flex flex-col items-center gap-xs text-text-muted">
      <span class="material-symbols-outlined" style="font-size:32px;">person</span>
      <span class="font-label-md text-label-md text-on-surface">${escapeHtml(title)}</span>
      <span class="font-body-sm text-body-sm">${escapeHtml(sub)}</span>
    </div>
  </td></tr>`;
}

function performanceCell(d) {
  if (d.performance_rating === null || d.performance_rating === undefined) {
    return `<span class="text-text-muted italic text-xs">No rating yet</span>`;
  }
  const rating = Number(d.performance_rating);
  return `<div class="flex items-center gap-1">
    <span class="material-symbols-outlined text-warning-amber" style="font-size:16px;">star</span>
    <span class="text-on-surface font-medium">${rating.toFixed(1)}</span>
  </div>`;
}

function licenseCell(d) {
  if (!d.license_number) return `<span class="text-text-muted italic text-xs">Not on file</span>`;
  const d2 = daysUntil(d.license_expiry);
  let cls = 'text-secondary';
  let label = d.license_expiry ? `Valid to ${formatDate(d.license_expiry)}` : 'No expiry on file';
  if (d2 !== null && d2 < 0) { cls = 'text-error font-bold'; label = 'Expired ' + formatDate(d.license_expiry); }
  else if (d2 !== null && d2 <= 30) { cls = 'text-warning-amber font-medium'; label = `Expires in ${d2}d`; }
  return `<div class="text-xs">
    <div class="font-mono-data text-on-surface">${escapeHtml(d.license_number)}</div>
    <div class="${cls}">${label}</div>
  </div>`;
}

function rowHtml(d) {
  return `<tr class="border-b border-border-light hover:bg-surface-container-low hover:shadow-[0px_4px_12px_rgba(15,23,42,0.05)] transition-all duration-150 group" data-id="${d.id}">
    <td class="py-md px-md">
      <div class="flex items-center gap-sm">
        <img alt="Driver profile" class="w-8 h-8 rounded-full object-cover border border-border-light" src="${avatarDataUri(d.full_name)}"/>
        <div>
          <div class="text-on-surface font-medium">${escapeHtml(d.full_name || 'Unnamed driver')}</div>
          <div class="text-text-muted text-xs">${escapeHtml(d.phone_number || d.email || '')}</div>
        </div>
      </div>
    </td>
    <td class="py-md px-md">${licenseCell(d)}</td>
    <td class="py-md px-md">${d.vehicle ? `<span class="font-mono-data text-xs bg-surface-container-low px-1.5 py-0.5 rounded border border-border-light">${escapeHtml(d.vehicle.plate_number)}</span>` : `<span class="text-text-muted italic text-xs">Unassigned</span>`}</td>
    <td class="py-md px-md">${performanceCell(d)}</td>
    <td class="py-md px-md">${statusBadge(d.status, STATUS_MAP)}</td>
    <td class="py-md px-md text-right">
      <button class="text-text-muted hover:text-primary-container p-1 rounded-full hover:bg-surface-container transition-colors" data-action="edit" title="Edit driver">
        <span class="material-symbols-outlined" style="font-size:20px;">edit</span>
      </button>
      <button class="text-text-muted hover:text-error p-1 rounded-full hover:bg-surface-container transition-colors" data-action="toggle-status" title="${d.status === 'active' ? 'Deactivate' : 'Activate'}">
        <span class="material-symbols-outlined" style="font-size:20px;">${d.status === 'active' ? 'block' : 'check_circle'}</span>
      </button>
    </td>
  </tr>`;
}

function onTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('tr[data-id]')?.getAttribute('data-id');
  const driver = drivers.find(d => d.id === id);
  if (!driver) return;
  if (btn.dataset.action === 'edit') openModal(driver);
  if (btn.dataset.action === 'toggle-status') toggleStatus(driver);
}

async function toggleStatus(driver) {
  const next = driver.status === 'active' ? 'inactive' : 'active';
  if (!confirm(`${next === 'active' ? 'Reactivate' : 'Deactivate'} ${driver.full_name}?`)) return;
  const { error } = await supabase.from('profiles').update({ status: next }).eq('id', driver.id);
  if (error) { showToast(error.message, 'error'); return; }
  driver.status = next;
  render();
  showToast(`${driver.full_name} ${next === 'active' ? 'reactivated' : 'deactivated'}.`, 'success');
}

let editingId = null;

function openModal(driver = null) {
  editingId = driver?.id || null;
  const modal = document.getElementById('driver-modal');
  if (!modal) return;
  document.getElementById('driver-modal-title').textContent = driver ? 'Edit Driver' : 'Add Driver';
  document.getElementById('driver-email-field').style.display = driver ? 'none' : 'block';
  document.getElementById('driver-name').value = driver?.full_name || '';
  document.getElementById('driver-email').value = driver?.email || '';
  document.getElementById('driver-phone').value = driver?.phone_number || '';
  document.getElementById('driver-license-number').value = driver?.license_number || '';
  document.getElementById('driver-license-expiry').value = driver?.license_expiry || '';
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('driver-modal')?.classList.add('hidden');
  editingId = null;
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('driver-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';

  const full_name = document.getElementById('driver-name').value.trim();
  const phone_number = document.getElementById('driver-phone').value.trim() || null;
  const license_number = document.getElementById('driver-license-number').value.trim() || null;
  const license_expiry = document.getElementById('driver-license-expiry').value || null;

  if (!full_name) {
    showToast('Full name is required.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  if (editingId) {
    const { error } = await supabase.from('profiles')
      .update({ full_name, phone_number, license_number, license_expiry })
      .eq('id', editingId);
    btn.disabled = false; btn.textContent = original;
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Driver updated.', 'success');
    closeModal();
    await loadDrivers();
    return;
  }

  const email = document.getElementById('driver-email').value.trim();
  if (!email) {
    showToast('Email is required for a new driver account.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, full_name, role: 'driver', phone_number },
  });
  btn.disabled = false; btn.textContent = original;

  if (error || data?.error) {
    showToast((data && data.error) || error.message || 'Could not create driver account.', 'error');
    return;
  }

  if (license_number || license_expiry) {
    await supabase.from('profiles').update({ license_number, license_expiry }).eq('id', data.user_id);
  }

  showToast(`${full_name} added. A welcome email with login details was sent to ${email}.`, 'success');
  closeModal();
  await loadDrivers();
}
