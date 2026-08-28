/**
 * BEX-SETTINGS.JS — Live platform status check for Bex Admin.
 * Runs a real lightweight query to confirm the DB connection works,
 * rather than displaying a static "Connected" claim.
 */
import { supabase } from '../config.js';

const el = document.getElementById('settings-db-status');
if (el) init();

async function init() {
  const start = performance.now();
  const { error, count } = await supabase.from('organizations').select('id', { count: 'exact', head: true });
  const ms = Math.round(performance.now() - start);

  if (error) {
    el.innerHTML = `<div class="flex items-center gap-xs text-error"><span class="material-symbols-outlined" style="font-size:16px;">error</span> Connection failed: ${error.message}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center gap-xs text-secondary"><span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Connected</div>
    <div class="flex justify-between border-t border-border-light pt-xs mt-xs"><span class="text-text-muted">Response time</span><span class="font-mono-data">${ms}ms</span></div>
    <div class="flex justify-between"><span class="text-text-muted">Organizations</span><span class="font-mono-data">${count ?? 0}</span></div>`;
}
