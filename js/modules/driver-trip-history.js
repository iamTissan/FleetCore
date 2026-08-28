/**
 * DRIVER-TRIP-HISTORY.JS — Completed trip history for Driver.
 */
import { supabase, getUserProfile, formatDate, escapeHtml } from '../config.js';

const list = document.getElementById('trip-history-list');
if (list) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const { data, error } = await supabase
    .from('trips')
    .select('*, vehicle:vehicles(plate_number)')
    .eq('driver_id', profile.id)
    .in('status', ['completed', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    list.innerHTML = `<div class="p-md text-center text-error font-body-sm">Failed to load trip history: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const trips = data || [];
  if (trips.length === 0) {
    list.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border-light rounded-xl bg-surface-container-lowest">
      <span class="material-symbols-outlined text-5xl text-text-muted mb-md">route</span>
      <p class="font-label-lg text-label-lg text-on-surface font-semibold mb-xs">No completed trips yet</p>
      <p class="font-body-sm text-body-sm text-text-muted max-w-sm">Your trip history will build up here as you complete assignments.</p>
    </div>`;
    return;
  }

  list.innerHTML = trips.map(t => `
    <div class="bg-surface-container-lowest border border-border-light rounded-lg p-md flex justify-between items-center">
      <div>
        <div class="font-label-md text-label-md text-on-surface">${escapeHtml(t.origin || '—')} → ${escapeHtml(t.destination || '—')}</div>
        <div class="font-body-sm text-xs text-text-muted mt-1">${t.vehicle ? escapeHtml(t.vehicle.plate_number) + ' · ' : ''}${t.completed_at ? formatDate(t.completed_at) : formatDate(t.created_at)}${t.distance_km ? ` · ${t.distance_km}km` : ''}</div>
      </div>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${t.status === 'completed' ? 'bg-secondary-container/20 text-secondary' : 'bg-error-container/50 text-error'}">${t.status}</span>
    </div>`).join('');
}
