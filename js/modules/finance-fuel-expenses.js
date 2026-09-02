/**
 * FINANCE-FUEL-EXPENSES.JS — Audit table for fuel entries, receipts, and costs.
 */
import { supabase, getUserProfile, formatNaira, formatDate, escapeHtml, avatarDataUri } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('fe-tbody');
if (tbody) initFuelExpenses();

let orgId = null;
let logs = [];
let searchTerm = '';
let activeFilter = 'all';

export async function initFuelExpenses() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

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

  await loadLogs();

  document.getElementById('fe-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.className = "px-3 py-1 rounded-lg text-slate-500 hover:text-slate-900 transition";
      });
      btn.className = "px-3 py-1 rounded-lg bg-white text-slate-900 shadow-sm transition";
      render();
    });
  });
}

async function loadLogs() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*, vehicle:vehicles(plate_number), driver:profiles(full_name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  logs = data || [];

  const mtdLogs = logs.filter(l => new Date(l.created_at) >= monthStart);
  const totalCost = mtdLogs.reduce((s, l) => s + Number(l.amount_naira || 0), 0);
  const totalLitres = mtdLogs.reduce((s, l) => s + Number(l.litres || 0), 0);

  document.getElementById('fe-total-cost').textContent = formatNaira(totalCost);
  document.getElementById('fe-total-litres').textContent = `${totalLitres.toLocaleString('en-NG')} L`;
  document.getElementById('fe-avg-cost').textContent = totalLitres > 0 ? formatNaira(totalCost / totalLitres) : '₦0';
  document.getElementById('fe-flagged-count').textContent = logs.filter(l => l.status === 'flagged').length;

  render();
}

function render() {
  let list = logs;
  if (activeFilter === 'flagged') list = list.filter(l => l.status === 'flagged');
  if (searchTerm) {
    list = list.filter(l =>
      (l.vehicle?.plate_number || '').toLowerCase().includes(searchTerm) ||
      (l.station_name || '').toLowerCase().includes(searchTerm) ||
      (l.driver?.full_name || '').toLowerCase().includes(searchTerm)
    );
  }

  document.getElementById('fe-count').textContent = `Showing ${list.length} of ${logs.length} entries`;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 text-xs">No fuel expenses logged yet. Drivers will submit records from the in-cab console.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 text-xs">No matching fuel logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr class="hover:bg-slate-50 transition-colors ${l.status === 'flagged' ? 'bg-rose-50/30' : ''}">
      <td class="py-3 px-4 text-slate-500 whitespace-nowrap">${formatDate(l.created_at)}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${l.vehicle ? escapeHtml(l.vehicle.plate_number) : '—'}</td>
      <td class="py-3 px-4">
        <div class="flex items-center gap-2">
          <img alt="Driver" class="w-6 h-6 rounded-full object-cover border border-slate-200" src="${avatarDataUri(l.driver?.full_name)}"/>
          <span class="truncate font-semibold text-slate-800">${escapeHtml(l.driver?.full_name || 'Unassigned')}</span>
        </div>
      </td>
      <td class="py-3 px-4 text-slate-700 font-medium">${escapeHtml(l.station_name || 'Station')}</td>
      <td class="py-3 px-4 text-right font-mono font-semibold text-slate-800">${l.litres || 0} L</td>
      <td class="py-3 px-4 text-right font-mono font-bold text-slate-900">${formatNaira(l.amount_naira || 0)}</td>
      <td class="py-3 px-4 text-center">
        ${l.receipt_url ? `
          <a class="inline-flex items-center justify-center w-7 h-7 bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 rounded-lg transition border border-slate-200" href="${l.receipt_url}" target="_blank" title="View Pump Receipt">
            <i class="bi bi-receipt text-xs"></i>
          </a>` : `<span class="text-slate-400 text-xs">—</span>`}
      </td>
    </tr>`).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Finance Console?')) performLogout();
});