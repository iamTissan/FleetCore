/**
 * ADMIN-ANALYTICS.JS — Performance analytics, weekly dispatch bar chart,
 * fleet composition breakdown, and driver leaderboard for Company Admin.
 */

import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';

let currentOrgId = null;

const kpiEl = document.getElementById('kpi-ontime-pct');
if (kpiEl) initAnalytics();

export async function initAnalytics() {
  const profile = await getUserProfile();
  if (!profile) return;
  
  currentOrgId = profile.organization_id;

  // Hydrate header user information
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = profile.full_name || 'Fleet Administrator';
  if (headerAvatar && profile.full_name) {
    const initials = profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    headerAvatar.textContent = initials;
  }

  // Fetch true organization name
  if (currentOrgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', currentOrgId)
      .single();
    
    if (org && document.getElementById('fc-org-name')) {
      document.getElementById('fc-org-name').textContent = org.name;
    }
  }

  const [tripsRes, vehiclesRes, fuelRes, driversRes, incidentsRes] = await Promise.all([
    supabase.from('trips').select('status, scheduled_at, completed_at, distance_km, created_at').eq('organization_id', currentOrgId),
    supabase.from('vehicles').select('id, vehicle_type, status').eq('organization_id', currentOrgId),
    supabase.from('fuel_logs').select('amount_naira').eq('organization_id', currentOrgId),
    supabase.from('profiles').select('id, full_name, performance_rating').eq('organization_id', currentOrgId).eq('role', 'driver'),
    supabase.from('incidents').select('driver_id').eq('organization_id', currentOrgId).in('status', ['open', 'investigating']),
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
window.initAnalytics = initAnalytics;

function renderKpis(trips, vehicles, fuel) {
  const completedWithSchedule = trips.filter(t => t.status === 'completed' && t.scheduled_at && t.completed_at);
  const onTime = completedWithSchedule.filter(t => new Date(t.completed_at) <= new Date(t.scheduled_at));
  const pct = completedWithSchedule.length ? Math.round((onTime.length / completedWithSchedule.length) * 100) : null;

  document.getElementById('kpi-ontime-pct').textContent = pct === null ? 'No data' : `${pct}%`;
  document.getElementById('kpi-ontime-sub').textContent = completedWithSchedule.length
    ? `${onTime.length} of ${completedWithSchedule.length} completed on schedule`
    : 'No completed scheduled trips yet';

  const totalDistance = trips.reduce((sum, t) => sum + Number(t.distance_km || 0), 0);
  document.getElementById('kpi-total-distance').textContent = `${totalDistance.toLocaleString('en-NG')} km`;
  document.getElementById('kpi-vehicle-count').textContent = `Across ${vehicles.filter(v => v.status === 'active').length} operational units`;

  const totalFuel = fuel.reduce((sum, f) => sum + Number(f.amount_naira || 0), 0);
  document.getElementById('kpi-fuel-total').textContent = formatNaira(totalFuel);
}

function renderWeeklyChart(trips) {
  const container = document.getElementById('weekly-trip-chart');
  if (!container) return;

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
    container.innerHTML = `<div class="w-full text-center text-slate-400 text-xs font-medium self-center">No trips dispatched in the last 7 days.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="w-full h-full flex items-end justify-between px-3 relative">
      <div class="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 pt-4">
        <div class="border-b border-slate-200/60 w-full h-0"></div>
        <div class="border-b border-slate-200/60 w-full h-0"></div>
        <div class="border-b border-slate-200/60 w-full h-0"></div>
      </div>
      ${order.map(i => `
        <div class="w-[10%] bg-gradient-to-t from-teal-600 to-teal-400 rounded-t-lg relative z-10 hover:opacity-90 transition-all cursor-pointer group shadow-sm" style="height:${Math.max(8, (counts[i] / max) * 100)}%" title="${counts[i]} trips">
          <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none shadow-md">
            ${counts[i]} Trips
          </div>
        </div>`).join('')}
      <div class="absolute bottom-0 left-0 w-full flex justify-between px-3 pb-1 pt-2 text-[10px] font-bold text-slate-400 uppercase">
        ${order.map(i => `<span>${days[i]}</span>`).join('')}
      </div>
    </div>`;
}

function renderFleetComposition(vehicles) {
  const container = document.getElementById('fleet-composition-chart');
  if (!container) return;

  if (vehicles.length === 0) {
    container.innerHTML = `<div class="text-center text-slate-400 text-xs font-medium">No vehicles registered yet.</div>`;
    return;
  }

  const byType = {};
  vehicles.forEach(v => { byType[v.vehicle_type || 'other'] = (byType[v.vehicle_type || 'other'] || 0) + 1; });
  const max = Math.max(...Object.values(byType));

  container.innerHTML = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
    <div class="flex items-center gap-3 w-full">
      <span class="text-xs font-bold text-slate-700 w-20 text-right capitalize truncate">${escapeHtml(type)}</span>
      <div class="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
        <div class="bg-gradient-to-r from-teal-500 to-blue-600 h-full rounded-full transition-all duration-500" style="width:${(count / max) * 100}%"></div>
      </div>
      <span class="font-mono text-xs font-bold text-slate-800 w-6">${count}</span>
    </div>`).join('');
}

function renderLeaderboard(drivers, openIncidents) {
  const tbody = document.getElementById('leaderboard-tbody');
  if (!tbody) return;

  const incidentCounts = {};
  openIncidents.forEach(i => { if (i.driver_id) incidentCounts[i.driver_id] = (incidentCounts[i.driver_id] || 0) + 1; });

  const rated = drivers.filter(d => d.performance_rating !== null && d.performance_rating !== undefined)
    .sort((a, b) => b.performance_rating - a.performance_rating);

  if (drivers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 text-xs font-medium">No drivers on the roster yet.</td></tr>`;
    return;
  }
  
  if (rated.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 text-xs font-medium">No performance ratings recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rated.map((d, idx) => `
    <tr class="hover:bg-slate-50/75 transition border-b border-slate-100">
      <td class="py-3.5 px-4 text-center">
        <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-amber-400 text-slate-900 font-black' : idx === 1 ? 'bg-slate-300 text-slate-800 font-bold' : idx === 2 ? 'bg-amber-700/60 text-white font-bold' : 'bg-slate-100 text-slate-500 font-semibold'} inline-flex items-center justify-center text-[11px]">
          ${idx + 1}
        </span>
      </td>
      <td class="py-3.5 px-4 font-bold text-slate-800">${escapeHtml(d.full_name || 'Driver')}</td>
      <td class="py-3.5 px-4">
        <div class="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200/60 rounded-lg">
          <i class="bi bi-star-fill text-amber-500 text-xs"></i>
          <span class="font-mono text-xs font-bold text-slate-800">${Number(d.performance_rating).toFixed(1)} / 5.0</span>
        </div>
      </td>
      <td class="py-3.5 px-4 text-right font-mono font-bold ${incidentCounts[d.id] ? 'text-rose-600' : 'text-slate-400'}">
        ${incidentCounts[d.id] || 0}
      </td>
    </tr>`).join('');
}