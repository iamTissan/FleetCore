/**
 * FINANCE-DASHBOARD.JS — Fully wired overview for Account Manager.
 * No fake budget variance (no budget field in schema) — replaced with
 * real fuel-vs-maintenance split and real cost-per-km from trip distance.
 */
import { supabase, getUserProfile, formatNaira } from '../config.js';

const kpiEl = document.getElementById('kpi-total-spend');
if (kpiEl) init();

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function sumInRange(table, orgId, dateCol, amountCol, start, end) {
  const { data } = await supabase.from(table).select(amountCol).eq('organization_id', orgId).gte(dateCol, start).lt(dateCol, end);
  return (data || []).reduce((sum, row) => sum + Number(row[amountCol] || 0), 0);
}

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  document.getElementById('finance-period-label').textContent = new Date().toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) + ' fleet cost performance';

  const [fuelThis, fuelLast, maintThis, maintLast, trips] = await Promise.all([
    sumInRange('fuel_logs', orgId, 'logged_at', 'amount_naira', thisM.start, thisM.end),
    sumInRange('fuel_logs', orgId, 'logged_at', 'amount_naira', lastM.start, lastM.end),
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
  document.getElementById('kpi-cost-per-km-sub').textContent = totalDistance > 0 ? `Across ${totalDistance.toLocaleString('en-NG')}km this month` : 'No completed trip distance recorded this month';
}
