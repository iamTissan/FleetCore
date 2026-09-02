/**
 * FINANCE-REPORTS.JS — Real-time cost-per-vehicle report for Account Manager.
 * Computed live from fuel_logs + work_orders for the selected timeframe.
 */
import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('rep-tbody');
if (tbody) initFinanceReports();

let orgId = null;

function monthBounds(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function initFinanceReports() {
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

  await loadReport(0);
  document.getElementById('rep-period')?.addEventListener('change', (e) => loadReport(Number(e.target.value)));
}

async function loadReport(offset) {
  tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs">Compiling financial report...</td></tr>`;
  const { start, end } = monthBounds(offset);

  const [vehiclesRes, fuelRes, workOrdersRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId),
    supabase.from('fuel_logs').select('vehicle_id, amount_naira').eq('organization_id', orgId).gte('created_at', start).lt('created_at', end),
    supabase.from('work_orders').select('vehicle_id, cost_naira').eq('organization_id', orgId).gte('created_at', start).lt('created_at', end),
  ]);

  const vehicles = vehiclesRes.data || [];
  const fuelByVehicle = {};
  (fuelRes.data || []).forEach(f => { 
    fuelByVehicle[f.vehicle_id] = (fuelByVehicle[f.vehicle_id] || 0) + Number(f.amount_naira || 0); 
  });
  
  const maintByVehicle = {};
  (workOrdersRes.data || []).forEach(w => { 
    maintByVehicle[w.vehicle_id] = (maintByVehicle[w.vehicle_id] || 0) + Number(w.cost_naira || 0); 
  });

  const rows = vehicles
    .map(v => ({ vehicle: v, fuel: fuelByVehicle[v.id] || 0, maint: maintByVehicle[v.id] || 0 }))
    .filter(r => r.fuel > 0 || r.maint > 0)
    .sort((a, b) => (b.fuel + b.maint) - (a.fuel + a.maint));

  const totalSpend = rows.reduce((s, r) => s + r.fuel + r.maint, 0);
  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('rep-empty');

  document.getElementById('rep-total').textContent = formatNaira(totalSpend);
  document.getElementById('rep-vehicle-count').textContent = rows.length;
  document.getElementById('rep-avg').textContent = rows.length ? formatNaira(totalSpend / rows.length) : '₦0';

  if (rows.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${escapeHtml(r.vehicle.plate_number)}</td>
      <td class="py-3 px-4 font-mono text-slate-600">${formatNaira(r.fuel)}</td>
      <td class="py-3 px-4 font-mono text-slate-600">${formatNaira(r.maint)}</td>
      <td class="py-3 px-4 font-mono font-bold text-teal-700">${formatNaira(r.fuel + r.maint)}</td>
    </tr>`).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Finance Console?')) performLogout();
});