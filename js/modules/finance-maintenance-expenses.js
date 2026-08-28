/**
 * FINANCE-MAINTENANCE-EXPENSES.JS — Work order cost log for Account Manager.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';

const STATUS_MAP = {
  open: { label: 'Open', cls: 'bg-warning-amber/10 text-warning-amber' },
  in_progress: { label: 'In Progress', cls: 'bg-primary-fixed text-primary' },
  completed: { label: 'Completed', cls: 'bg-secondary-container/20 text-secondary' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};

const tbody = document.getElementById('me-tbody');
if (tbody) init();

let records = [];
let searchTerm = '';

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('me-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  records = data || [];
  if (records.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  render();
  document.getElementById('me-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
}

function render() {
  let list = records;
  if (searchTerm) {
    list = list.filter(r =>
      (r.vehicle?.plate_number || '').toLowerCase().includes(searchTerm) ||
      (r.service_type || '').toLowerCase().includes(searchTerm)
    );
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-md">No matches.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors">
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${r.vehicle ? escapeHtml(r.vehicle.plate_number) : '—'}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${escapeHtml(r.service_type || '—')}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(r.cost_naira)}</td>
      <td class="px-md py-sm">${statusBadge(r.status, STATUS_MAP)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${formatDate(r.created_at)}</td>
    </tr>`).join('');
}
