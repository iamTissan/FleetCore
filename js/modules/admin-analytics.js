/**
 * ADMIN-ANALYTICS.JS — Fleet performance analytics for Company Admin.
 * Every number here comes from a real query. Metrics the schema can't
 * support honestly (safety scores, eco-driving grades, per-type fuel
 * efficiency) were replaced with metrics it can: on-time %, distance,
 * fuel spend, weekly trip volume, fleet composition, and a leaderboard
 * based on the real performance_rating field.
 */
import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';

const kpiEl = document.getElementById('kpi-ontime-pct');
if (kpiEl) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  const [tripsRes, vehiclesRes, fuelRes, driversRes, incidentsRes] = await Promise.all([
    supabase.from('trips').select('status, scheduled_at, completed_at, distance_km, created_at').eq('organization_id', orgId),
    supabase.from('vehicles').select('id, vehicle_type, status').eq('organization_id', orgId),
    supabase.from('fuel_logs').select('amount_naira').eq('organization_id', orgId),
    supabase.from('profiles').select('id, full_name, performance_rating').eq('organization_id', orgId).eq('role', 'driver'),
    supabase.from('incidents').select('driver_id').eq('organization_id', orgId).in('status', ['open', 'investigating']),
  ]);

  const trips = tripsRes.data || [];
  const vehicles = vehiclesRes.data || [];
  const fuel = fuelRes.data || [];
  const drivers = driversRes.data || [];
  const openIncidents = incidentsRes.data || [];

  renderKpis(trips, vehicles, fuel);
  renderWeeklyChart(trips);
  renderFleetComposition(vehicles);
  renderLeaderboard(drivers, openIncidents);
}

function renderKpis(trips, vehicles, fuel) {
  const completedWithSchedule = trips.filter(t => t.status === 'completed' && t.scheduled_at && t.completed_at);
  const onTime = completedWithSchedule.filter(t => new Date(t.completed_at) <= new Date(t.scheduled_at));
  const pct = completedWithSchedule.length ? Math.round((onTime.length / completedWithSchedule.length) * 100) : null;

  document.getElementById('kpi-ontime-pct').textContent = pct === null ? 'No data yet' : `${pct}%`;
  document.getElementById('kpi-ontime-sub').textContent = completedWithSchedule.length
    ? `${onTime.length} of ${completedWithSchedule.length} completed trips`
    : 'No completed scheduled trips yet';

  const totalDistance = trips.reduce((sum, t) => sum + Number(t.distance_km || 0), 0);
  document.getElementById('kpi-total-distance').textContent = totalDistance.toLocaleString('en-NG');
  document.getElementById('kpi-vehicle-count').textContent = `Across ${vehicles.filter(v => v.status === 'active').length} active vehicles`;

  const totalFuel = fuel.reduce((sum, f) => sum + Number(f.amount_naira || 0), 0);
  document.getElementById('kpi-fuel-total').textContent = formatNaira(totalFuel);
}

function renderWeeklyChart(trips) {
  const container = document.getElementById('weekly-trip-chart');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = new Array(7).fill(0);
  const weekAgo = Date.now() - 7 * 86400000;

  trips.forEach(t => {
    const ts = new Date(t.created_at).getTime();
    if (ts >= weekAgo) counts[new Date(t.created_at).getDay()]++;
  });

  const max = Math.max(...counts, 1);
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) {
    container.innerHTML = `<div class="w-full text-center text-text-muted font-body-sm self-center">No trips created in the last 7 days.</div>`;
    return;
  }

  container.innerHTML = `<div class="w-full h-full flex items-end justify-between px-md relative">
    <div class="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 pt-4">
      <div class="border-b border-border-light w-full h-0"></div><div class="border-b border-border-light w-full h-0"></div>
      <div class="border-b border-border-light w-full h-0"></div><div class="border-b border-border-light w-full h-0"></div>
    </div>
    ${order.map(i => `<div class="w-[8%] bg-primary-container opacity-80 rounded-t-sm relative z-10 hover:opacity-100 transition-opacity cursor-pointer" style="height:${Math.max(4, (counts[i] / max) * 100)}%" title="${counts[i]} trips"></div>`).join('')}
    <div class="absolute bottom-0 left-0 w-full flex justify-between px-md pb-xs pt-xs font-label-sm text-label-sm text-text-muted">
      ${order.map(i => `<span>${days[i]}</span>`).join('')}
    </div>
  </div>`;
}

function renderFleetComposition(vehicles) {
  const container = document.getElementById('fleet-composition-chart');
  if (vehicles.length === 0) {
    container.innerHTML = `<div class="text-center text-text-muted font-body-sm">No vehicles yet.</div>`;
    return;
  }
  const byType = {};
  vehicles.forEach(v => { byType[v.vehicle_type || 'other'] = (byType[v.vehicle_type || 'other'] || 0) + 1; });
  const max = Math.max(...Object.values(byType));

  container.innerHTML = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
    <div class="flex items-center gap-sm w-full">
      <span class="font-label-sm text-label-sm w-16 text-right capitalize">${escapeHtml(type)}</span>
      <div class="flex-1 bg-surface-container-high h-4 rounded-full overflow-hidden">
        <div class="bg-primary h-full rounded-full" style="width:${(count / max) * 100}%"></div>
      </div>
      <span class="font-mono-data text-label-sm w-8">${count}</span>
    </div>`).join('');
}

function renderLeaderboard(drivers, openIncidents) {
  const tbody = document.getElementById('leaderboard-tbody');
  const incidentCounts = {};
  openIncidents.forEach(i => { if (i.driver_id) incidentCounts[i.driver_id] = (incidentCounts[i.driver_id] || 0) + 1; });

  const rated = drivers.filter(d => d.performance_rating !== null && d.performance_rating !== undefined)
    .sort((a, b) => b.performance_rating - a.performance_rating);

  if (drivers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-text-muted font-body-sm px-md">No drivers on the roster yet.</td></tr>`;
    return;
  }
  if (rated.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-text-muted font-body-sm px-md">No performance ratings recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rated.map((d, idx) => `
    <tr class="border-b border-border-light hover:bg-surface-container-low transition-colors">
      <td class="py-md px-md"><span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center font-bold text-[12px]">${idx + 1}</span></td>
      <td class="py-md px-md font-medium">${escapeHtml(d.full_name || 'Unnamed driver')}</td>
      <td class="py-md px-md"><span class="font-mono-data ${d.performance_rating >= 4 ? 'text-secondary' : d.performance_rating >= 3 ? 'text-on-surface' : 'text-warning-amber'}">${Number(d.performance_rating).toFixed(1)} / 5.0</span></td>
      <td class="py-md px-md text-right font-mono-data ${incidentCounts[d.id] ? 'text-danger-red' : ''}">${incidentCounts[d.id] || 0}</td>
    </tr>`).join('');
}
