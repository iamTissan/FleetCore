/**
 * ADMIN-DASHBOARD.JS — Fully wired overview for Company Admin.
 * No mock KPIs, no fake trend deltas, no fake map markers — everything
 * here is a real query scoped to the admin's organization_id.
 */
import { supabase, getUserProfile, formatNaira, timeAgo, escapeHtml } from '../config.js';

const kpiEl = document.getElementById('kpi-active-vehicles');
if (kpiEl) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  await Promise.all([
    loadKpis(orgId),
    loadMapState(orgId),
    loadActivity(orgId),
  ]);
}

async function loadKpis(orgId) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [vehicles, trips, drivers, incidents, fuel] = await Promise.all([
    supabase.from('vehicles').select('id, status', { count: 'exact' }).eq('organization_id', orgId),
    supabase.from('trips').select('id, status', { count: 'exact' }).eq('organization_id', orgId),
    supabase.from('profiles').select('id, status', { count: 'exact' }).eq('organization_id', orgId).eq('role', 'driver'),
    supabase.from('incidents').select('id, status', { count: 'exact' }).eq('organization_id', orgId).in('status', ['open', 'investigating']),
    supabase.from('fuel_logs').select('amount_naira').eq('organization_id', orgId).gte('logged_at', monthStart.toISOString()),
  ]);

  const activeVehicles = (vehicles.data || []).filter(v => v.status === 'active').length;
  const activeTrips = (trips.data || []).filter(t => t.status === 'in_progress').length;
  const activeDrivers = (drivers.data || []).filter(d => d.status === 'active').length;
  const openIncidents = incidents.count ?? (incidents.data || []).length;
  const fuelSpend = (fuel.data || []).reduce((sum, f) => sum + Number(f.amount_naira || 0), 0);

  setKpi('kpi-active-vehicles', activeVehicles);
  setKpi('kpi-active-trips', activeTrips);
  setKpi('kpi-drivers-on-duty', activeDrivers);
  setKpi('kpi-incidents', openIncidents);
  setKpi('kpi-fuel-spend', formatNaira(fuelSpend));

  // Real totals instead of fabricated "vs last week" percentages — those
  // require historical snapshots we don't collect yet.
  document.querySelectorAll('[data-kpi-trend]').forEach(el => {
    const totalId = el.getAttribute('data-kpi-trend');
    if (totalId === 'vehicles') el.textContent = `${vehicles.count ?? (vehicles.data || []).length} total in fleet`;
    if (totalId === 'trips') el.textContent = `${trips.count ?? (trips.data || []).length} total this period`;
    if (totalId === 'drivers') el.textContent = `${drivers.count ?? (drivers.data || []).length} total on roster`;
    if (totalId === 'incidents') el.textContent = 'Open or under investigation';
    if (totalId === 'fuel') el.textContent = 'Month to date';
  });
}

function setKpi(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

let leafletMap = null;
let leafletMarkers = {};

async function loadMapState(orgId) {
  const mapContainer = document.getElementById('fleet-map-container');
  if (!mapContainer) return;

  const { data: vehicles } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId);
  const vehicleIds = (vehicles || []).map(v => v.id);
  const plateById = {};
  (vehicles || []).forEach(v => { plateById[v.id] = v.plate_number; });

  let locations = [];
  if (vehicleIds.length) {
    const { data } = await supabase.from('vehicle_locations').select('*').in('vehicle_id', vehicleIds).eq('is_active', true);
    locations = data || [];
  }

  const onlineBadge = document.getElementById('map-online-count');
  if (onlineBadge) onlineBadge.textContent = `Online (${locations.length})`;

  if (locations.length === 0) {
    mapContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full gap-xs text-text-muted"><span class="material-symbols-outlined" style="font-size:32px;">location_off</span><span class="font-body-sm text-body-sm">No vehicles are reporting live location yet.</span><span class="font-body-sm text-xs">Locations appear here once a driver starts a trip with location access enabled.</span></div>`;
    return;
  }

  mapContainer.innerHTML = `<div id="fleet-leaflet-map" style="height:100%; width:100%; z-index:0;"></div>`;

  if (typeof L === 'undefined') return;
  leafletMap = L.map('fleet-leaflet-map', { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(leafletMap);

  const bounds = [];
  locations.forEach(loc => {
    const marker = L.marker([loc.lat, loc.lng]).addTo(leafletMap);
    marker.bindPopup(`<strong>${plateById[loc.vehicle_id] || 'Vehicle'}</strong><br/>${loc.speed || 0} km/h`);
    leafletMarkers[loc.vehicle_id] = marker;
    bounds.push([loc.lat, loc.lng]);
  });
  leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });

  // Live updates via Supabase Realtime (vehicle_locations is already
  // published — see the migration) so markers move without a page reload.
  supabase.channel(`fleet-locations-${orgId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_locations' }, (payload) => {
      const loc = payload.new;
      if (!loc || !vehicleIds.includes(loc.vehicle_id)) return;
      if (!loc.is_active) {
        leafletMarkers[loc.vehicle_id]?.remove();
        delete leafletMarkers[loc.vehicle_id];
        return;
      }
      if (leafletMarkers[loc.vehicle_id]) {
        leafletMarkers[loc.vehicle_id].setLatLng([loc.lat, loc.lng]);
      } else if (leafletMap) {
        leafletMarkers[loc.vehicle_id] = L.marker([loc.lat, loc.lng]).addTo(leafletMap)
          .bindPopup(`<strong>${plateById[loc.vehicle_id] || 'Vehicle'}</strong><br/>${loc.speed || 0} km/h`);
      }
    })
    .subscribe();
}

async function loadActivity(orgId) {
  const list = document.getElementById('activity-feed-list');
  if (!list) return;
  list.innerHTML = `<li class="p-sm text-center text-text-muted font-body-sm">Loading activity…</li>`;

  const [trips, incidents, workOrders, fuel] = await Promise.all([
    supabase.from('trips').select('id, origin, destination, status, created_at, vehicle:vehicles(plate_number)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
    supabase.from('incidents').select('id, incident_type, severity, created_at, vehicle:vehicles(plate_number)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
    supabase.from('work_orders').select('id, service_type, status, created_at, vehicle:vehicles(plate_number)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5),
    supabase.from('fuel_logs').select('id, amount_naira, logged_at, vehicle:vehicles(plate_number)').eq('organization_id', orgId).order('logged_at', { ascending: false }).limit(5),
  ]);

  const items = [];
  (trips.data || []).forEach(t => items.push({
    time: t.created_at, icon: 'route', iconCls: 'bg-secondary-container text-on-secondary-container',
    title: t.status === 'completed' ? 'Trip Completed' : t.status === 'in_progress' ? 'Trip Started' : 'Trip Created',
    detail: `${escapeHtml(t.origin || '—')} → ${escapeHtml(t.destination || '—')}${t.vehicle ? ` · ${escapeHtml(t.vehicle.plate_number)}` : ''}`,
  }));
  (incidents.data || []).forEach(i => items.push({
    time: i.created_at, icon: 'warning', iconCls: 'bg-error-container text-on-error-container',
    title: `${(i.incident_type || 'Incident').replace(/^\w/, c => c.toUpperCase())} Reported`,
    detail: `Severity: ${escapeHtml(i.severity || 'unknown')}${i.vehicle ? ` · ${escapeHtml(i.vehicle.plate_number)}` : ''}`,
  }));
  (workOrders.data || []).forEach(w => items.push({
    time: w.created_at, icon: 'build', iconCls: 'bg-surface-container-high text-on-surface-variant',
    title: w.status === 'completed' ? 'Maintenance Completed' : 'Maintenance Logged',
    detail: `${escapeHtml(w.service_type || 'Service')}${w.vehicle ? ` · ${escapeHtml(w.vehicle.plate_number)}` : ''}`,
  }));
  (fuel.data || []).forEach(f => items.push({
    time: f.logged_at, icon: 'local_gas_station', iconCls: 'bg-warning-amber/20 text-warning-amber',
    title: 'Fuel Logged',
    detail: `${formatNaira(f.amount_naira)}${f.vehicle ? ` · ${escapeHtml(f.vehicle.plate_number)}` : ''}`,
  }));

  items.sort((a, b) => new Date(b.time) - new Date(a.time));
  const top = items.slice(0, 8);

  if (top.length === 0) {
    list.innerHTML = `<li class="p-lg text-center text-text-muted"><span class="material-symbols-outlined block mx-auto mb-xs" style="font-size:28px;">inbox</span><span class="font-body-sm text-body-sm">No activity yet. As trips, fuel logs, and maintenance happen, they'll show up here.</span></li>`;
    return;
  }

  list.innerHTML = top.map(item => `
    <li class="p-sm hover:bg-surface-container-low rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-border-light">
      <div class="flex gap-sm items-start">
        <div class="p-xs ${item.iconCls} rounded-full mt-1">
          <span class="material-symbols-outlined" style="font-size:16px;">${item.icon}</span>
        </div>
        <div class="flex-1">
          <div class="flex justify-between items-start">
            <span class="font-label-md text-label-md text-on-surface">${item.title}</span>
            <span class="font-label-sm text-label-sm text-text-muted">${timeAgo(item.time)}</span>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-xs">${item.detail}</p>
        </div>
      </div>
    </li>`).join('');
}
