/**
 * DRIVER-TRIP-HISTORY.JS — Completed & Historical Trip Audit for Driver.
 * Uses standard Bootstrap Icons (bi bi-*) and unified Tailwind design tokens.
 */
import { supabase, getUserProfile, formatDate, escapeHtml } from '../config.js';

const list = document.getElementById('trip-history-list');
if (list) initTripHistory();

export async function initTripHistory() {
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
    list.innerHTML = `
      <div class="p-6 text-center text-rose-500 text-xs font-semibold bg-rose-50/50 border border-rose-100 rounded-2xl">
        <i class="bi bi-exclamation-triangle-fill text-lg block mb-1"></i>
        Failed to load trip history: ${escapeHtml(error.message)}
      </div>`;
    return;
  }

  const trips = data || [];
  if (trips.length === 0) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white/60">
        <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3 text-2xl">
          <i class="bi bi-signpost-2"></i>
        </div>
        <p class="font-display font-bold text-sm text-slate-800 mb-1">No completed trips yet</p>
        <p class="text-xs text-slate-400 max-w-xs leading-relaxed">Your route history and completion logs will build up here as you finalize deployments.</p>
      </div>`;
    return;
  }

  list.innerHTML = trips.map(t => {
    const isCompleted = t.status === 'completed';
    const statusClass = isCompleted 
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
      : 'bg-rose-50 text-rose-700 border-rose-200/60';
    const statusIcon = isCompleted ? 'bi-check-circle-fill' : 'bi-x-circle-fill';

    return `
      <div class="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 min-w-0 pr-2">
          <div class="w-10 h-10 rounded-xl ${isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} flex items-center justify-center text-lg shrink-0">
            <i class="bi ${isCompleted ? 'bi-truck' : 'bi-slash-circle'}"></i>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5 truncate">
              <span class="truncate">${escapeHtml(t.origin || 'Base')}</span>
              <i class="bi bi-arrow-right text-slate-400 text-xs shrink-0"></i>
              <span class="text-teal-700 truncate">${escapeHtml(t.destination || 'Hub')}</span>
            </div>
            <div class="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
              ${t.vehicle ? `<span class="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">${escapeHtml(t.vehicle.plate_number)}</span>` : ''}
              <span>${t.completed_at ? formatDate(t.completed_at) : formatDate(t.created_at)}</span>
              ${t.distance_km ? `<span>· ${t.distance_km} km</span>` : ''}
            </div>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 flex items-center gap-1 ${statusClass}">
          <i class="bi ${statusIcon}"></i>
          <span>${t.status}</span>
        </span>
      </div>`;
  }).join('');
}