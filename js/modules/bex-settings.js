/**
 * BEX-SETTINGS.JS — Live telemetry and DB latency diagnostics for Super-Admin console.
 */
import { supabase } from '../config.js';

const el = document.getElementById('settings-db-status');
if (el) initBexSettings();

export async function initBexSettings() {
  const start = performance.now();
  const { count, error } = await supabase.from('organizations').select('id', { count: 'exact', head: true });
  const latency = Math.round(performance.now() - start);

  if (error) {
    el.innerHTML = `
      <div class="flex items-center gap-2 text-rose-600 font-bold text-xs">
        <i class="bi bi-x-circle-fill"></i>
        <span>Connection dropped: ${error.message}</span>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center gap-2 text-emerald-600 font-bold text-xs">
      <i class="bi bi-check-circle-fill"></i>
      <span>PostgreSQL Engine Online</span>
    </div>
    <div class="flex justify-between border-t border-slate-100 pt-2 mt-2 text-xs">
      <span class="text-slate-400 font-semibold">Network Latency</span>
      <span class="font-mono font-bold text-slate-800">${latency} ms</span>
    </div>
    <div class="flex justify-between text-xs">
      <span class="text-slate-400 font-semibold">Indexed Tenants</span>
      <span class="font-mono font-bold text-slate-800">${count ?? 0}</span>
    </div>`;
}