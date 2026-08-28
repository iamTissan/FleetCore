/**
 * BEX-DASHBOARD.JS — Cross-tenant platform overview for Bex Admin.
 * No fake MRR (no billing table in schema), no fake "1,248 tenants" —
 * real counts across organizations/vehicles/profiles/incidents.
 */
import { supabase, formatDate, escapeHtml, statusBadge } from '../config.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-[#fef3c7] text-[#92400e]' },
  active: { label: 'Active', cls: 'bg-[#ecfdf5] text-[#065f46]' },
  suspended: { label: 'Suspended', cls: 'bg-[#fee2e2] text-[#991b1b]' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};

const tbody = document.getElementById('ba-tbody');
if (tbody) init();

async function init() {
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
  document.getElementById('kpi-tenants-sub').textContent = `${orgs.filter(o => o.account_status === 'active').length} active`;
  document.getElementById('kpi-total-vehicles').textContent = vehicles.filter(v => v.status === 'active').length;
  document.getElementById('kpi-total-users').textContent = profiles.length;
  document.getElementById('kpi-open-incidents').textContent = (incidentsRes.data || []).length;

  const vehicleCounts = {};
  vehicles.forEach(v => { vehicleCounts[v.organization_id] = (vehicleCounts[v.organization_id] || 0) + 1; });
  const userCounts = {};
  profiles.forEach(p => { if (p.organization_id) userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1; });

  document.getElementById('ba-count').textContent = `Showing ${orgs.length} tenant${orgs.length === 1 ? '' : 's'}`;

  if (orgs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-lg text-center text-text-muted font-body-sm px-md">No tenants yet. <a class="text-primary underline" href="companies.html">Provision your first company.</a></td></tr>`;
    return;
  }

  tbody.innerHTML = orgs.map(o => {
    const initials = (o.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<tr class="hover:bg-surface-container-low transition-colors group cursor-pointer" onclick="window.location.href='tenant-detail.html?id=${o.id}'">
      <td class="py-sm px-md">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm">${escapeHtml(initials)}</div>
          <div>
            <div class="font-label-md text-label-md text-on-surface">${escapeHtml(o.name)}</div>
            <div class="font-body-sm text-body-sm text-text-muted">${escapeHtml(o.subdomain)}</div>
          </div>
        </div>
      </td>
      <td class="py-sm px-md font-body-sm text-body-sm text-on-surface capitalize">${escapeHtml(o.plan)}</td>
      <td class="py-sm px-md">${statusBadge(o.account_status, STATUS_MAP)}</td>
      <td class="py-sm px-md font-mono-data text-mono-data text-on-surface text-right">${vehicleCounts[o.id] || 0}</td>
      <td class="py-sm px-md font-mono-data text-mono-data text-on-surface text-right">${userCounts[o.id] || 0}</td>
      <td class="py-sm px-md font-body-sm text-body-sm text-text-muted text-right">${formatDate(o.created_at)}</td>
    </tr>`;
  }).join('');
}
