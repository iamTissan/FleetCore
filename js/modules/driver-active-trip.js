/**
 * DRIVER-ACTIVE-TRIP.JS — Live in-progress trip screen for Driver.
 * No fake map, no fake ETA/distance — shows real trip fields and real
 * status controls (End Trip). SOS remains a fixed link to incident-report.
 */
import { supabase, getUserProfile, formatDate, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const main = document.getElementById('active-trip-main');
if (main) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const { data, error } = await supabase
    .from('trips')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('driver_id', profile.id)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    main.innerHTML = `<div class="flex items-center justify-center h-full text-error font-body-sm p-lg text-center">Failed to load trip: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data) {
    main.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-text-muted gap-xs p-lg text-center">
      <span class="material-symbols-outlined" style="font-size:32px;">event_busy</span>
      <span class="font-body-sm text-body-sm">No trip in progress right now.</span>
      <a class="mt-md px-md py-sm bg-primary-container text-on-primary rounded-lg font-label-md text-label-md" href="dashboard.html">Back to Dashboard</a>
    </div>`;
    document.getElementById('active-trip-title').textContent = 'No Active Trip';
    document.getElementById('active-trip-status').textContent = 'Idle';
    return;
  }

  document.getElementById('active-trip-title').textContent = `${data.origin || '—'} → ${data.destination || '—'}`;

  main.innerHTML = `
    <div class="p-container-margin flex flex-col gap-md max-w-2xl mx-auto">
      <div id="live-map" class="rounded-xl border border-border-light overflow-hidden" style="height:220px; z-index:0;"></div>
      <div class="bg-surface map-overlay-shadow rounded-xl border border-border-light overflow-hidden">
        <div class="p-md border-b border-border-light bg-surface-bright flex justify-between items-center">
          <div>
            <h2 class="font-label-sm text-label-sm text-text-muted uppercase">Destination</h2>
            <p class="font-body-md text-body-md font-semibold text-on-surface mt-xs">${escapeHtml(data.destination || '—')}</p>
          </div>
          <span class="material-symbols-outlined text-text-muted">location_on</span>
        </div>
        <div class="p-md grid grid-cols-2 gap-md divide-x divide-border-light bg-surface">
          <div class="flex flex-col items-center justify-center p-sm">
            <span class="font-label-sm text-label-sm text-text-muted uppercase mb-1">Vehicle</span>
            <span class="font-mono-data text-on-surface">${data.vehicle ? escapeHtml(data.vehicle.plate_number) : '—'}</span>
          </div>
          <div class="flex flex-col items-center justify-center p-sm">
            <span class="font-label-sm text-label-sm text-text-muted uppercase mb-1">Started</span>
            <span class="font-body-sm text-body-sm text-on-surface">${data.started_at ? formatDate(data.started_at) : '—'}</span>
          </div>
        </div>
      </div>
      ${data.notes ? `<div class="bg-surface rounded-lg border border-border-light p-md"><p class="font-label-sm text-label-sm text-text-muted mb-1">Notes</p><p class="font-body-sm text-body-sm text-on-surface">${escapeHtml(data.notes)}</p></div>` : ''}
      <div class="flex justify-end w-full">
        <button class="bg-surface text-on-surface font-label-md text-label-md py-3 px-6 rounded-lg border border-border-light map-overlay-shadow hover:bg-surface-container-low transition-colors active:scale-95 flex items-center justify-center gap-sm" id="btn-end-trip">
          <span class="material-symbols-outlined text-text-muted">flag</span> End Trip
        </button>
      </div>
      <a class="w-full bg-danger-red text-on-error font-headline-md text-headline-md font-bold py-6 rounded-xl map-overlay-shadow active:scale-95 transition-transform duration-150 flex items-center justify-center gap-md" href="incident-report.html">
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1; font-size: 32px;">emergency</span> SOS EMERGENCY
      </a>
    </div>`;

  document.getElementById('btn-end-trip')?.addEventListener('click', async () => {
    if (!confirm('Mark this trip as completed?')) return;
    stopLocationTracking();
    const { error: updErr } = await supabase.from('trips').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', data.id);
    if (updErr) { showToast(updErr.message, 'error'); return; }
    if (data.vehicle_id) {
      await supabase.from('vehicle_locations').update({ is_active: false }).eq('vehicle_id', data.vehicle_id);
    }
    showToast('Trip completed. Nice work.', 'success');
    window.location.href = 'dashboard.html';
  });

  if (data.vehicle_id) startLocationTracking(profile.organization_id, data.vehicle_id);
}

// ─── Real geolocation tracking ──────────────────────────────────────────
// Pings the browser's actual GPS position into vehicle_locations while a
// trip is in progress. No simulated movement — if location access is
// denied, the map simply doesn't update (shown to the driver as a note).
let watchId = null;
let leafletMap = null;
let leafletMarker = null;

function startLocationTracking(orgId, vehicleId) {
  const mapEl = document.getElementById('live-map');
  if (!mapEl || typeof L === 'undefined') return;

  leafletMap = L.map('live-map', { zoomControl: false, attributionControl: false }).setView([9.082, 8.6753], 6); // Nigeria default
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(leafletMap);

  if (!navigator.geolocation) {
    mapEl.insertAdjacentHTML('afterend', `<p class="font-body-sm text-xs text-text-muted -mt-sm">Geolocation isn't available on this device — live tracking is off for this trip.</p>`);
    return;
  }

  const ping = async (pos) => {
    const { latitude, longitude, speed, heading } = pos.coords;
    if (leafletMap) {
      const latlng = [latitude, longitude];
      if (!leafletMarker) {
        leafletMarker = L.marker(latlng).addTo(leafletMap);
        leafletMap.setView(latlng, 14);
      } else {
        leafletMarker.setLatLng(latlng);
      }
    }
    await supabase.from('vehicle_locations').upsert({
      vehicle_id: vehicleId,
      organization_id: orgId,
      lat: latitude,
      lng: longitude,
      speed: speed ? Math.round(speed * 3.6) : 0, // m/s -> km/h
      heading: heading ? Math.round(heading) : 0,
      is_active: true,
      last_updated: new Date().toISOString(),
    }, { onConflict: 'vehicle_id' });
  };

  watchId = navigator.geolocation.watchPosition(ping, () => {
    document.getElementById('live-map')?.insertAdjacentHTML('afterend', `<p class="font-body-sm text-xs text-text-muted -mt-sm">Location permission denied — live tracking is off for this trip.</p>`);
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

function stopLocationTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
}

window.addEventListener('beforeunload', stopLocationTracking);
