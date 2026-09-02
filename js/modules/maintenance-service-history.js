/**
 * MAINTENANCE-SERVICE-HISTORY.JS — Searchable completed maintenance history.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('sh-tbody');
if (tbody) initServiceHistory();

let records = [];
let searchTerm = '';

export async function initServiceHistory() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  // Hydrate header & sidebar
  const fullName = profile.full_name || 'Maintenance Officer';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'MO';
  
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
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('sh-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-500 text-xs">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
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
  document.getElementById('sh-search')?.addEventListener('input', (e) => {
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
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No matching service records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${r.vehicle ? escapeHtml(r.vehicle.plate_number) : '—'}</td>
      <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(r.service_type || '—')}</td>
      <td class="py-3 px-4 text-slate-500">${r.completed_at ? formatDate(r.completed_at) : '—'}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-800">${formatNaira(r.cost_naira || 0)}</td>
      <td class="py-3 px-4 text-slate-600">${escapeHtml(r.parts_notes || '—')}</td>
    </tr>`).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Maintenance Console?')) performLogout();
});