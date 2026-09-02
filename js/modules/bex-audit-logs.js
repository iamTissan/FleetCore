/**
 * BEX-AUDIT-LOGS.JS — Immutable security audit trail controller for Bex Admin.
 */
import { supabase, formatDate, escapeHtml } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('al-tbody');
if (tbody) initAuditLogs();

let logs = [];
let orgNames = {};
let profileNames = {};
let searchTerm = '';

const ACTION_ICONS = {
  login: { icon: 'bi-box-arrow-in-right', cls: 'text-slate-500' },
  role_change: { icon: 'bi-person-badge', cls: 'text-amber-600' },
  data_export: { icon: 'bi-cloud-download', cls: 'text-blue-600' },
  impersonation: { icon: 'bi-incognito', cls: 'text-rose-600' },
  provision_tenant: { icon: 'bi-building-add', cls: 'text-teal-600' },
};

export async function initAuditLogs() {
  const [logsRes, orgsRes, profilesRes] = await Promise.all([
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('organizations').select('id, name'),
    supabase.from('profiles').select('id, full_name, email'),
  ]);

  if (logsRes.error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(logsRes.error.message)}</td></tr>`;
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
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No audit entries registered yet.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No matching audit logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => {
    const actor = profileNames[l.actor_id];
    const initials = actor?.full_name ? actor.full_name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
    const actionMeta = ACTION_ICONS[l.action] || { icon: 'bi-info-circle', cls: 'text-slate-500' };
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">${formatDate(l.created_at)}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center border border-slate-200">
              ${escapeHtml(initials)}
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-slate-800">${escapeHtml(actor?.full_name || 'System Operator')}</span>
              <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(actor?.email || '—')}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5 font-semibold text-slate-800">
            <i class="bi ${actionMeta.icon} ${actionMeta.cls}"></i>
            <span>${escapeHtml((l.action || '').replace(/_/g, ' ').toUpperCase())}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-slate-600 font-medium">${l.organization_id ? escapeHtml(orgNames[l.organization_id] || 'Tenant') : '<span class="text-teal-700 font-bold">Platform Root</span>'}</td>
        <td class="py-3 px-4 text-right font-mono text-slate-400">${l.target_table ? escapeHtml(l.target_table) : '—'}</td>
      </tr>`;
  }).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});