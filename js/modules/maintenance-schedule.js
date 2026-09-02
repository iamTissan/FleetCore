/**
 * MAINTENANCE-SCHEDULE.JS — Upcoming preventative scheduled work orders.
 */
import { supabase, getUserProfile, formatDate, daysUntil, escapeHtml } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('sched-tbody');
if (tbody) initMaintenanceSchedule();

const URGENCY_CLS = {
  critical: 'bg-rose-50 text-rose-700 border-rose-200/60',
  high: 'bg-amber-50 text-amber-700 border-amber-200/60',
  normal: 'bg-slate-100 text-slate-700 border-slate-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

export async function initMaintenanceSchedule() {
  const profile = await getUserProfile();
  if (!profile) return;
  const orgId = profile.organization_id;

  // Hydrate header & sidebar
  const fullName = profile.full_name || 'Maintenance Officer';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'MO';
  
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarInitial = document.getElementById('sidebar-initial');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarInitial) sidebarInitial.textContent = initials;

  let orgName = 'TransCore Logistics';
  if (orgId) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) orgName = org.name;
  }
  document.querySelectorAll('#fc-org-name').forEach(el => el.textContent = orgName);

  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress'])
    .not('scheduled_date', 'is', null)
    .order('scheduled_date', { ascending: true });

  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('sched-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-rose-500 text-xs">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const orders = data || [];
  if (orders.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = orders.map(o => {
    const d = daysUntil(o.scheduled_date);
    const overdue = d < 0;
    return `
      <tr class="hover:bg-slate-50 transition-colors ${overdue ? 'bg-rose-50/40' : ''}">
        <td class="py-3 px-4 font-mono font-bold text-slate-900">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : '—'}</td>
        <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(o.service_type || '—')}</td>
        <td class="py-3 px-4 ${overdue ? 'text-rose-600 font-bold' : 'text-slate-500'}">
          ${formatDate(o.scheduled_date)}${overdue ? ' (Overdue)' : ''}
        </td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${URGENCY_CLS[o.urgency] || URGENCY_CLS.normal}">
            ${escapeHtml(o.urgency || 'normal')}
          </span>
        </td>
      </tr>`;
  }).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Maintenance Console?')) performLogout();
});