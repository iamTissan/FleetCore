/**
 * BEX-TENANT-DETAIL.JS — Single tenant view for Bex Admin.
 * Reads ?id=<uuid>. Real personnel list, real status controls
 * (suspend/reactivate), no fabricated billing/usage data.
 */
import { supabase, formatDate, escapeHtml, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-warning-amber/10 text-warning-amber' },
  active: { label: 'Active', cls: 'bg-secondary-container text-on-secondary-container' },
  suspended: { label: 'Suspended', cls: 'bg-error-container text-error' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};
const ROLE_LABELS = {
  company_admin: 'Admin', driver: 'Driver',
  maintenance_officer: 'Maintenance', account_manager: 'Finance', bex_admin: 'Bex Admin',
};

const nameEl = document.getElementById('td-name');
if (nameEl) init();

let org = null;

async function init() {
  const orgId = new URLSearchParams(window.location.search).get('id');
  if (!orgId) {
    nameEl.textContent = 'No tenant specified';
    return;
  }
  await load(orgId);
}

async function load(orgId) {
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
  document.getElementById('td-subtitle').textContent = `${org.subdomain} · ${org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} Tier`;
  document.getElementById('td-vehicle-count').textContent = (vehiclesRes.data || []).length;
  document.getElementById('td-user-count').textContent = profiles.length;
  document.getElementById('td-admin-count').textContent = `${profiles.filter(p => p.role === 'company_admin').length} Admins`;
  document.getElementById('td-incident-count').textContent = (incidentsRes.data || []).length;
  document.getElementById('td-plan').textContent = org.plan;
  document.getElementById('td-subdomain-val').textContent = org.subdomain;
  document.getElementById('td-created').textContent = `Tenant created on ${formatDate(org.created_at)}`;
  document.getElementById('td-city').textContent = org.city ? `Region: ${org.city}` : '';

  const statusBadgeEl = document.getElementById('td-status-badge');
  const s = STATUS_MAP[org.account_status] || STATUS_MAP.trial;
  statusBadgeEl.className = `mt-xs inline-flex items-center gap-xs px-2 py-0.5 rounded font-label-sm text-label-sm ${s.cls}`;
  statusBadgeEl.textContent = s.label;

  renderStatusActions();
  renderPersonnel(profiles);
}

function renderStatusActions() {
  const el = document.getElementById('td-status-actions');
  const actions = [];
  if (org.account_status !== 'suspended') {
    actions.push({ label: 'Suspend Tenant', next: 'suspended', cls: 'bg-error-container text-error hover:opacity-90' });
  } else {
    actions.push({ label: 'Reactivate Tenant', next: 'active', cls: 'bg-secondary-container text-on-secondary-container hover:opacity-90' });
  }
  el.innerHTML = actions.map(a => `<button class="w-full py-2 rounded font-label-md text-label-md transition-opacity ${a.cls}" data-next="${a.next}">${a.label}</button>`).join('');
  el.querySelectorAll('[data-next]').forEach(btn => btn.addEventListener('click', () => updateStatus(btn.getAttribute('data-next'))));
}

async function updateStatus(next) {
  if (!confirm(`${next === 'suspended' ? 'Suspend' : 'Reactivate'} ${org.name}?`)) return;
  const { error } = await supabase.from('organizations').update({ account_status: next }).eq('id', org.id);
  if (error) { showToast(error.message, 'error'); return; }
  showToast(`${org.name} ${next === 'suspended' ? 'suspended' : 'reactivated'}.`, 'success');
  org.account_status = next;
  await load(org.id);
}

function renderPersonnel(profiles) {
  const tbody = document.getElementById('td-personnel-tbody');
  if (profiles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-md text-center text-text-muted font-body-sm">No personnel yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = profiles.map(p => `
    <tr class="border-b border-border-light hover:bg-surface-container-lowest transition-colors">
      <td class="p-sm font-medium text-on-surface">${escapeHtml(p.full_name || 'Unnamed')}</td>
      <td class="p-sm"><span class="bg-primary-container text-on-primary-container px-2 py-1 rounded text-[10px] font-bold uppercase">${escapeHtml(ROLE_LABELS[p.role] || p.role)}</span></td>
      <td class="p-sm">${statusBadge(p.status, { active: { label: 'Active', cls: 'bg-secondary-container/30 text-secondary' }, inactive: { label: 'Inactive', cls: 'bg-surface-container-high text-on-surface-variant' }, pending: { label: 'Pending', cls: 'bg-warning-amber/10 text-warning-amber' } })}</td>
      <td class="p-sm text-text-muted">${formatDate(p.created_at)}</td>
    </tr>`).join('');
}
