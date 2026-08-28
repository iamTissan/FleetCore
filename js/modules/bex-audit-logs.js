/**
 * BEX-AUDIT-LOGS.JS — Real security audit trail for Bex Admin.
 * Reads public.audit_logs (populated by real login events from auth.js).
 * No fake IPs, no fake "Mass Data Export" incidents.
 */
import { supabase, formatDate, escapeHtml } from '../config.js';

const tbody = document.getElementById('al-tbody');
if (tbody) init();

let logs = [];
let orgNames = {};
let profileNames = {};
let searchTerm = '';

const ACTION_ICONS = {
  login: { icon: 'login', cls: 'text-text-muted' },
  role_change: { icon: 'manage_accounts', cls: 'text-warning-amber' },
  data_export: { icon: 'database', cls: 'text-danger-red' },
  impersonation: { icon: 'admin_panel_settings', cls: 'text-warning-amber' },
};

async function init() {
  const [logsRes, orgsRes, profilesRes] = await Promise.all([
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('organizations').select('id, name'),
    supabase.from('profiles').select('id, full_name, email'),
  ]);

  if (logsRes.error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm px-lg">Failed to load: ${escapeHtml(logsRes.error.message)}</td></tr>`;
    return;
  }

  logs = logsRes.data || [];
  (orgsRes.data || []).forEach(o => { orgNames[o.id] = o.name; });
  (profilesRes.data || []).forEach(p => { profileNames[p.id] = p; });

  render();
  document.getElementById('al-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
}

function render() {
  let list = logs;
  if (searchTerm) {
    list = list.filter(l =>
      (l.action || '').toLowerCase().includes(searchTerm) ||
      (profileNames[l.actor_id]?.email || '').toLowerCase().includes(searchTerm) ||
      (profileNames[l.actor_id]?.full_name || '').toLowerCase().includes(searchTerm)
    );
  }

  document.getElementById('al-count').textContent = `Showing ${list.length} of ${logs.length} entries`;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-lg">No audit entries yet. Login events are logged automatically as users sign in.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-text-muted font-body-sm px-lg">No matches.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => {
    const actor = profileNames[l.actor_id];
    const initials = actor?.full_name ? actor.full_name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
    const actionMeta = ACTION_ICONS[l.action] || { icon: 'info', cls: 'text-text-muted' };
    return `<tr class="border-b border-border-light hover:bg-surface-container-low/50 transition-colors group">
      <td class="py-md px-lg font-mono-data text-mono-data text-text-muted whitespace-nowrap">${formatDate(l.created_at)}</td>
      <td class="py-md px-lg">
        <div class="flex items-center gap-sm">
          <div class="w-6 h-6 rounded bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-[10px]">${escapeHtml(initials)}</div>
          <div class="flex flex-col">
            <span class="font-medium">${escapeHtml(actor?.full_name || 'Unknown user')}</span>
            <span class="text-[11px] text-text-muted">${escapeHtml(actor?.email || '—')}</span>
          </div>
        </div>
      </td>
      <td class="py-md px-lg">
        <div class="flex items-center gap-xs text-on-surface font-medium">
          <span class="material-symbols-outlined text-[16px] ${actionMeta.cls}">${actionMeta.icon}</span>
          ${escapeHtml((l.action || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()))}
        </div>
      </td>
      <td class="py-md px-lg text-text-muted">${l.organization_id ? escapeHtml(orgNames[l.organization_id] || 'Unknown tenant') : 'Platform-wide'}</td>
      <td class="py-md px-lg text-right text-text-muted text-xs">${l.target_table ? escapeHtml(l.target_table) : '—'}</td>
    </tr>`;
  }).join('');
}
