/**
 * BEX-DASHBOARD.JS — Super-Admin platform metrics & tenant aggregate controller.
 */
import { supabase, getUserProfile, formatDate, escapeHtml, statusBadge } from '../config.js';
import { performLogout } from '../auth.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
  suspended: { label: 'Suspended', cls: 'bg-rose-50 text-rose-700 border-rose-200/60' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const tbody = document.getElementById('ba-tbody');
if (tbody) initBexDashboard();

export async function initBexDashboard() {
  const profile = await getUserProfile();
  if (!profile) return;

  const fullName = profile.full_name || 'Bex Administrator';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BX';

  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarInitial = document.getElementById('sidebar-initial');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarInitial) sidebarInitial.textContent = initials;

  await loadDashboardStats();
}

async function loadDashboardStats() {
  const [orgsRes, vehiclesRes, profilesRes, incidentsRes] = await Promise.all([
    supabase.from('organizations').select('*').order('created_at', { ascending: false }),
    supabase.from('vehicles').select('organization_id, status'),
    supabase.from('profiles').select('organization_id'),
    supabase.from('incidents').select('id').in('status', ['open', 'investigating']),
  ]);

  const orgs = orgsRes.data || [];
  const vehicles = vehiclesRes.data || [];
  const profiles = profilesRes.data || [];

  document.getElementById('kpi-total-tenants').textContent = orgs.length;
  document.getElementById('kpi-tenants-sub').textContent = `${orgs.filter(o => o.account_status === 'active').length} active tenants`;
  document.getElementById('kpi-total-vehicles').textContent = vehicles.filter(v => v.status === 'active').length;
  document.getElementById('kpi-total-users').textContent = profiles.length;
  document.getElementById('kpi-open-incidents').textContent = (incidentsRes.data || []).length;

  const vehicleCounts = {};
  vehicles.forEach(v => { vehicleCounts[v.organization_id] = (vehicleCounts[v.organization_id] || 0) + 1; });
  const userCounts = {};
  profiles.forEach(p => { if (p.organization_id) userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1; });

  document.getElementById('ba-count').textContent = `Showing ${orgs.length} tenant${orgs.length === 1 ? '' : 's'}`;

  if (orgs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 text-xs">No tenants provisioned yet. <a class="text-teal-600 font-bold underline" href="companies.html">Provision your first tenant.</a></td></tr>`;
    return;
  }

  tbody.innerHTML = orgs.map(o => {
    const initials = (o.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `
      <tr class="hover:bg-slate-50 transition-colors group cursor-pointer" onclick="window.location.href='tenant-detail.html?id=${o.id}'">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 text-brand-navy flex items-center justify-center font-bold text-xs">
              ${escapeHtml(initials)}
            </div>
            <div>
              <div class="font-bold text-slate-900">${escapeHtml(o.name)}</div>
              <div class="text-[11px] font-mono text-slate-400">${escapeHtml(o.company_code || o.subdomain || '—')}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 font-semibold text-slate-700 capitalize">${escapeHtml(o.plan || 'Standard')}</td>
        <td class="py-3 px-4">${statusBadge(o.account_status, STATUS_MAP)}</td>
        <td class="py-3 px-4 font-mono font-semibold text-slate-800 text-right">${vehicleCounts[o.id] || 0}</td>
        <td class="py-3 px-4 font-mono font-semibold text-slate-800 text-right">${userCounts[o.id] || 0}</td>
        <td class="py-3 px-4 text-slate-500 font-mono text-right">${formatDate(o.created_at)}</td>
      </tr>`;
  }).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});