/**
 * BEX-TENANT-DETAIL.JS — Single tenant administration and suspension lifecycle.
 */
import { supabase, formatDate, escapeHtml, statusBadge } from '../config.js';
import { showToast, performLogout } from '../auth.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' },
  suspended: { label: 'Suspended', cls: 'bg-rose-50 text-rose-700 border border-rose-200/60' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
};

const ROLE_LABELS = {
  company_admin: 'Admin',
  driver: 'Driver',
  maintenance_officer: 'Maintenance',
  account_manager: 'Finance',
  bex_admin: 'Bex Admin',
};

const nameEl = document.getElementById('td-name');
if (nameEl) initTenantDetail();

let org = null;

export async function initTenantDetail() {
  const orgId = new URLSearchParams(window.location.search).get('id');
  if (!orgId) {
    nameEl.textContent = 'No tenant specified';
    return;
  }
  await loadTenantData(orgId);
}

async function loadTenantData(orgId) {
  const [orgRes, vehiclesRes, profilesRes, incidentsRes] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('vehicles').select('id').eq('organization_id', orgId),
    supabase.from('profiles').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    supabase.from('incidents').select('id').eq('organization_id', orgId).in('status', ['open', 'investigating']),
  ]);

  if (orgRes.error || !orgRes.data) {
    nameEl.textContent = 'Tenant not found';
    return;
  }

  org = orgRes.data;
  const profiles = profilesRes.data || [];

  document.getElementById('td-name').textContent = org.name;
  document.getElementById('td-subtitle').textContent = `${org.company_code || org.subdomain} · ${org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} Tier`;
  document.getElementById('td-vehicle-count').textContent = (vehiclesRes.data || []).length;
  document.getElementById('td-user-count').textContent = profiles.length;
  document.getElementById('td-admin-count').textContent = `${profiles.filter(p => p.role === 'company_admin').length} Admins`;
  document.getElementById('td-incident-count').textContent = (incidentsRes.data || []).length;
  document.getElementById('td-plan').textContent = org.plan;
  document.getElementById('td-code-val').textContent = org.company_code || '—';
  document.getElementById('td-subdomain-val').textContent = org.subdomain;
  document.getElementById('td-created').textContent = `Created on ${formatDate(org.created_at)}`;
  document.getElementById('td-city').textContent = org.city ? `Base: ${org.city}` : 'Global Operations';

  const statusBadgeEl = document.getElementById('td-status-badge');
  const s = STATUS_MAP[org.account_status] || STATUS_MAP.trial;
  statusBadgeEl.className = `inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${s.cls}`;
  statusBadgeEl.textContent = s.label;

  renderStatusActions();
  renderPersonnel(profiles);
}

function renderStatusActions() {
  const el = document.getElementById('td-status-actions');
  const actions = [];
  if (org.account_status !== 'suspended') {
    actions.push({ label: 'Suspend Tenant Access', next: 'suspended', cls: 'w-full py-2.5 rounded-xl font-bold text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition' });
  } else {
    actions.push({ label: 'Reactivate Tenant Access', next: 'active', cls: 'w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition' });
  }
  el.innerHTML = actions.map(a => `<button class="${a.cls}" data-next="${a.next}">${a.label}</button>`).join('');
  el.querySelectorAll('[data-next]').forEach(btn => btn.addEventListener('click', () => updateStatus(btn.getAttribute('data-next'))));
}

async function updateStatus(next) {
  if (!confirm(`Are you sure you want to ${next === 'suspended' ? 'suspend' : 'reactivate'} ${org.name}?`)) return;
  const { error } = await supabase.from('organizations').update({ account_status: next }).eq('id', org.id);
  if (error) { 
    showToast(error.message, 'error'); 
    return; 
  }
  showToast(`${org.name} successfully updated to ${next}.`, 'success');
  org.account_status = next;
  await loadTenantData(org.id);
}

function renderPersonnel(profiles) {
  const tbody = document.getElementById('td-personnel-tbody');
  if (profiles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs">No personnel registered under this tenant.</td></tr>`;
    return;
  }
  tbody.innerHTML = profiles.map(p => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="py-2.5 px-3 font-bold text-slate-900">${escapeHtml(p.full_name || 'Unnamed')}</td>
      <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-100">${escapeHtml(ROLE_LABELS[p.role] || p.role)}</span></td>
      <td class="py-2.5 px-3">${statusBadge(p.status, { active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' }, inactive: { label: 'Inactive', cls: 'bg-slate-100 text-slate-500' } })}</td>
      <td class="py-2.5 px-3 text-right font-mono text-slate-400">${formatDate(p.created_at)}</td>
    </tr>`).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});