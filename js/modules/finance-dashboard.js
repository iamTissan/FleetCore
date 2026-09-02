/**
 * FINANCE-DASHBOARD.JS — Financial performance overview for Account Manager.
 * Real fuel-vs-maintenance split and real cost-per-km computed live.
 */
import { supabase, getUserProfile, formatNaira } from '../config.js';
import { performLogout } from '../auth.js';

const kpiEl = document.getElementById('kpi-total-spend');
if (kpiEl) initFinanceDashboard();

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function sumInRange(table, orgId, dateCol, amountCol, start, end) {
  const { data } = await supabase
    .from(table)
    .select(amountCol)
    .eq('organization_id', orgId)
    .gte(dateCol, start)
    .lt(dateCol, end);
  return (data || []).reduce((sum, row) => sum + Number(row[amountCol] || 0), 0);
}

export async function initFinanceDashboard() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  // Hydrate header & sidebar
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

  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  document.getElementById('finance-period-label').textContent = 
    new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) + ' fleet cost performance';

  const [fuelThis, fuelLast, maintThis, maintLast, trips] = await Promise.all([
    sumInRange('fuel_logs', orgId, 'created_at', 'amount_naira', thisM.start, thisM.end),
    sumInRange('fuel_logs', orgId, 'created_at', 'amount_naira', lastM.start, lastM.end),
    sumInRange('work_orders', orgId, 'created_at', 'cost_naira', thisM.start, thisM.end),
    sumInRange('work_orders', orgId, 'created_at', 'cost_naira', lastM.start, lastM.end),
    supabase.from('trips').select('distance_km').eq('organization_id', orgId).eq('status', 'completed').gte('completed_at', thisM.start).lt('completed_at', thisM.end),
  ]);

  const totalThis = fuelThis + maintThis;
  const totalLast = fuelLast + maintLast;

  document.getElementById('kpi-total-spend').textContent = formatNaira(totalThis);
  const changeEl = document.getElementById('kpi-spend-change');
  if (totalLast === 0) {
    changeEl.textContent = totalThis > 0 ? 'New spend this month' : 'No spend recorded yet';
  } else {
    const pct = ((totalThis - totalLast) / totalLast) * 100;
    changeEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;
    changeEl.className = pct >= 0 ? 'text-xs font-bold text-amber-600 mt-2' : 'text-xs font-bold text-emerald-600 mt-2';
  }

  const total = totalThis || 1;
  const fuelPct = Math.round((fuelThis / total) * 100);
  document.getElementById('kpi-fuel-pct').textContent = `${fuelPct}% Fuel`;
  document.getElementById('kpi-fuel-amount').textContent = `Fuel: ${formatNaira(fuelThis)}`;
  document.getElementById('kpi-maint-amount').textContent = `Maint: ${formatNaira(maintThis)}`;
  document.getElementById('kpi-fuel-bar').style.width = `${(fuelThis / total) * 100}%`;
  document.getElementById('kpi-maint-bar').style.width = `${(maintThis / total) * 100}%`;

  const totalDistance = (trips.data || []).reduce((sum, t) => sum + Number(t.distance_km || 0), 0);
  document.getElementById('kpi-cost-per-km').textContent = totalDistance > 0 ? formatNaira(totalThis / totalDistance) : '—';
  document.getElementById('kpi-cost-per-km-sub').textContent = totalDistance > 0 ? `Across ${totalDistance.toLocaleString('en-NG')} km logged this month` : 'No completed trip distance logged this month';
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Finance Console?')) performLogout();
});