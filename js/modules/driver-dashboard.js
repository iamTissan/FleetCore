/**
 * DRIVER-DASHBOARD.JS — Today's assignment + week summary for Driver.
 * No mock trip, no fake cargo/duration fields that don't exist in schema.
 */
import { supabase, getUserProfile, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const card = document.getElementById('assignment-card');
if (card) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const dateEl = document.getElementById('driver-today-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: '2-digit', month: 'short' });

  await loadAssignment(profile.id);
  await loadWeekSummary(profile.id);
}

async function loadAssignment(driverId) {
  const { data, error } = await supabase
    .from('trips')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('driver_id', driverId)
    .in('status', ['in_progress', 'pending'])
    .order('status', { ascending: true }) // in_progress before pending alphabetically? fix below
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(5);

  if (error) {
    card.innerHTML = `<div class="text-center py-lg text-error font-body-sm">Failed to load assignment: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const trips = data || [];
  const active = trips.find(t => t.status === 'in_progress') || trips.find(t => t.status === 'pending');

  if (!active) {
    card.innerHTML = `<div class="text-center py-lg text-text-muted"><span class="material-symbols-outlined block mx-auto mb-xs" style="font-size:28px;">event_available</span><span class="font-body-sm text-body-sm">No trip assigned right now. Check back soon.</span></div>`;
    return;
  }

  const isActive = active.status === 'in_progress';
  card.innerHTML = `
    <div class="flex justify-between items-start mb-md">
      <div>
        <div class="inline-flex items-center px-2 py-1 rounded ${isActive ? 'bg-warning-amber/10 text-warning-amber' : 'bg-secondary-container text-on-secondary-container'} font-label-sm text-label-sm uppercase mb-2">${isActive ? 'In Progress' : 'Assigned'}</div>
        <h2 class="font-headline-md text-headline-md text-on-surface">${escapeHtml(active.origin || '—')} <span class="material-symbols-outlined text-text-muted align-middle mx-1 text-[20px]">arrow_right_alt</span> ${escapeHtml(active.destination || '—')}</h2>
      </div>
      <div class="text-right">
        <span class="font-mono-data text-mono-data bg-background-subtle border border-border-light px-2 py-1 rounded text-on-surface-variant">${active.vehicle ? escapeHtml(active.vehicle.plate_number) : 'No vehicle'}</span>
        <p class="font-label-sm text-label-sm text-text-muted mt-1">${active.vehicle ? escapeHtml([active.vehicle.make, active.vehicle.model].filter(Boolean).join(' ')) : ''}</p>
      </div>
    </div>
    ${active.notes ? `<p class="font-body-sm text-body-sm text-on-surface-variant mb-md">${escapeHtml(active.notes)}</p>` : ''}
    <button class="w-full bg-secondary text-on-secondary font-label-md text-label-md py-4 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-colors duration-200 active:scale-95" id="btn-start-trip">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${isActive ? 'navigation' : 'play_arrow'}</span>
      ${isActive ? 'Continue Trip' : 'Start Trip'}
    </button>`;

  document.getElementById('btn-start-trip')?.addEventListener('click', async () => {
    if (!isActive) {
      const { error: updErr } = await supabase.from('trips').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', active.id);
      if (updErr) { showToast(updErr.message, 'error'); return; }
    }
    window.location.href = 'active-trip.html';
  });
}

async function loadWeekSummary(driverId) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [tripsRes, fuelRes] = await Promise.all([
    supabase.from('trips').select('id').eq('driver_id', driverId).eq('status', 'completed').gte('completed_at', weekAgo),
    supabase.from('fuel_logs').select('litres').eq('driver_id', driverId).gte('logged_at', weekAgo),
  ]);

  const tripsEl = document.getElementById('week-trips-completed');
  const fuelEl = document.getElementById('week-fuel-litres');
  if (tripsEl) tripsEl.textContent = (tripsRes.data || []).length;
  if (fuelEl) {
    const totalLitres = (fuelRes.data || []).reduce((sum, f) => sum + Number(f.litres || 0), 0);
    fuelEl.textContent = `${totalLitres.toLocaleString('en-NG')}L`;
  }
}
