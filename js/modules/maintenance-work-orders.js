/**
 * MAINTENANCE-WORK-ORDERS.JS — Full work order list + create flow.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  open: { label: 'Open', cls: 'bg-warning-amber/10 text-warning-amber' },
  in_progress: { label: 'In Progress', cls: 'bg-primary-fixed text-primary' },
  completed: { label: 'Completed', cls: 'bg-secondary-container/20 text-secondary' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};
const URGENCY_CLS = {
  critical: 'text-danger-red font-bold', high: 'text-warning-amber font-medium',
  normal: 'text-on-surface', low: 'text-text-muted',
};

let orgId = null;
const tbody = document.getElementById('wo-tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadVehiclesForModal();
  await loadOrders();

  document.getElementById('btn-new-wo')?.addEventListener('click', () => document.getElementById('wo-modal').classList.remove('hidden'));
  document.getElementById('wo-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('wo-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('wo-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('wo-form')?.addEventListener('submit', onCreate);
}

function closeModal() {
  document.getElementById('wo-modal')?.classList.add('hidden');
  document.getElementById('wo-form')?.reset();
}

async function loadVehiclesForModal() {
  const { data } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId).order('plate_number');
  const select = document.getElementById('wo-vehicle');
  if (select) select.innerHTML = (data || []).map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)}</option>`).join('') || '<option value="">No vehicles yet</option>';

  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('vehicle');
  if (preselect && select) select.value = preselect;
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('wo-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
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

  tbody.innerHTML = orders.map(o => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors cursor-pointer" onclick="window.location.href='work-order-detail.html?id=${o.id}'">
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : '—'}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${escapeHtml(o.service_type || '—')}</td>
      <td class="px-md py-sm font-body-sm text-body-sm capitalize ${URGENCY_CLS[o.urgency] || ''}">${escapeHtml(o.urgency || 'normal')}</td>
      <td class="px-md py-sm">${statusBadge(o.status, STATUS_MAP)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(o.cost_naira)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${o.scheduled_date ? formatDate(o.scheduled_date) : '—'}</td>
    </tr>`).join('');
}

async function onCreate(e) {
  e.preventDefault();
  const btn = document.getElementById('wo-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';

  const payload = {
    organization_id: orgId,
    vehicle_id: document.getElementById('wo-vehicle').value,
    service_type: document.getElementById('wo-service-type').value.trim(),
    description: document.getElementById('wo-description').value.trim() || null,
    urgency: document.getElementById('wo-urgency').value,
    scheduled_date: document.getElementById('wo-scheduled-date').value || null,
    status: 'open',
  };

  if (!payload.vehicle_id) {
    showToast('Select a vehicle.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const { error } = await supabase.from('work_orders').insert(payload);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }

  showToast('Work order created.', 'success');
  closeModal();
  await loadOrders();
}
