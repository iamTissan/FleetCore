/**
 * FINANCE-MAINTENANCE-EXPENSES.JS — Work order cost ledger for Account Manager.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';
import { performLogout } from '../auth.js';

const STATUS_MAP = {
  open: { label: 'Open', cls: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-brand-blue border-blue-200/60' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const tbody = document.getElementById('me-tbody');
if (tbody) initMaintenanceExpenses();

let records = [];
let searchTerm = '';

export async function initMaintenanceExpenses() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  const fullName = profile.full_name || 'Account Manager';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AM';
  
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarInitial = document.getElementById('sidebar-initial');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarInitial) sidebarInitial.textContent = initials;

  let orgName = 'TransCore Logistics';
  if (orgId) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) orgName = org.name;
  }
  document.querySelectorAll('#fc-org-name').forEach(el => el.textContent = orgName);

  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('me-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No matching maintenance expenses found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${r.vehicle ? escapeHtml(r.vehicle.plate_number) : '—'}</td>
      <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(r.service_type || 'General Service')}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${formatNaira(r.cost_naira || 0)}</td>
      <td class="py-3 px-4">${statusBadge(r.status, STATUS_MAP)}</td>
      <td class="py-3 px-4 text-slate-500">${formatDate(r.created_at)}</td>
    </tr>`).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Finance Console?')) performLogout();
});