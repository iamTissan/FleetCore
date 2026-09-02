/**
 * MAINTENANCE-DASHBOARD.JS — Real-time overview for Maintenance Officers.
 * Uses real queries against public.work_orders, public.vehicles, and profiles.
 */
import { supabase, getUserProfile, formatNaira, timeAgo, escapeHtml } from '../config.js';
import { showToast, performLogout } from '../auth.js';

const kpiEl = document.getElementById('kpi-vehicles-due');
if (kpiEl) initMaintenanceDashboard();

let orgId = null;

export async function initMaintenanceDashboard() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

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

  // Resolve Organization Name
  let orgName = 'TransCore Logistics';
  if (orgId) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) orgName = org.name;
  }
  document.querySelectorAll('#fc-org-name').forEach(el => el.textContent = orgName);

  await loadVehiclesForModal();
  await Promise.all([loadKpis(), loadAttentionTable(), loadActivity()]);

  document.querySelectorAll('.fc-add-workorder-btn').forEach(b => 
    b.addEventListener('click', () => document.getElementById('wo-modal')?.classList.remove('hidden'))
  );
  document.getElementById('wo-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('wo-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('wo-form')?.addEventListener('submit', onCreateWorkOrder);
}

function closeModal() {
  document.getElementById('wo-modal')?.classList.add('hidden');
  document.getElementById('wo-form')?.reset();
}

async function loadVehiclesForModal() {
  const { data } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId).order('plate_number');
  const select = document.getElementById('wo-vehicle');
  if (select) {
    select.innerHTML = (data || []).map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)}</option>`).join('') || '<option value="">No vehicles registered</option>';
  }
}

async function loadKpis() {
  const monthStart = new Date(); 
  monthStart.setDate(1); 
  monthStart.setHours(0, 0, 0, 0);

  const lastMonthStart = new Date(monthStart); 
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

  const [openRes, thisMonthRes, lastMonthRes] = await Promise.all([
    supabase.from('work_orders').select('*, vehicle:vehicles(plate_number)').eq('organization_id', orgId).in('status', ['open', 'in_progress']),
    supabase.from('work_orders').select('cost_naira').eq('organization_id', orgId).gte('created_at', monthStart.toISOString()),
    supabase.from('work_orders').select('cost_naira').eq('organization_id', orgId).gte('created_at', lastMonthStart.toISOString()).lt('created_at', monthStart.toISOString()),
  ]);

  const open = openRes.data || [];
  const vehicleIds = new Set(open.map(o => o.vehicle_id));
  document.getElementById('kpi-vehicles-due').textContent = vehicleIds.size;

  const critical = open.filter(o => o.urgency === 'critical').length;
  const high = open.filter(o => o.urgency === 'high').length;
  const normalLow = open.length - critical - high;
  const total = open.length || 1;

  document.getElementById('rag-bar').innerHTML = open.length === 0
    ? '<div class="bg-slate-200 h-full w-full"></div>'
    : `<div class="bg-rose-600 h-full" style="width:${(critical / total) * 100}%"></div><div class="bg-amber-500 h-full" style="width:${(high / total) * 100}%"></div><div class="bg-emerald-500 h-full" style="width:${(normalLow / total) * 100}%"></div>`;
  
  document.getElementById('rag-critical').textContent = `${critical} Critical`;
  document.getElementById('rag-soon').textContent = `${high} High`;
  document.getElementById('rag-upcoming').textContent = `${normalLow} Normal/Low`;

  document.getElementById('kpi-open-orders').textContent = open.length;
  const inProgress = open.filter(o => o.status === 'in_progress').length;
  document.getElementById('kpi-open-orders-sub').textContent = open.length === 0 ? 'No open work orders' : `${open.length - inProgress} open, ${inProgress} in progress.`;

  const thisMonthTotal = (thisMonthRes.data || []).reduce((s, w) => s + Number(w.cost_naira || 0), 0);
  const lastMonthTotal = (lastMonthRes.data || []).reduce((s, w) => s + Number(w.cost_naira || 0), 0);
  document.getElementById('kpi-mtd-spend').textContent = formatNaira(thisMonthTotal);
  
  const changeEl = document.getElementById('kpi-mtd-change');
  if (lastMonthTotal === 0) {
    changeEl.textContent = thisMonthTotal > 0 ? 'New spend' : '—';
    changeEl.className = 'font-bold text-slate-400';
  } else {
    const pct = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    changeEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    changeEl.className = `font-bold ${pct >= 0 ? 'text-amber-600' : 'text-emerald-600'}`;
  }
}

async function loadAttentionTable() {
  const tbody = document.getElementById('attention-tbody');
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model)')
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress'])
    .order('urgency', { ascending: false })
    .limit(8);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-rose-500 text-xs">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const orders = (data || []).sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs">No pending work orders. All vehicles are in optimal condition.</td></tr>`;
    return;
  }

  const URGENCY_CLS = {
    critical: 'bg-rose-50 text-rose-700 border-rose-200/60',
    high: 'bg-amber-50 text-amber-700 border-amber-200/60',
    normal: 'bg-slate-100 text-slate-700 border-slate-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  tbody.innerHTML = orders.map(o => `
    <tr class="hover:bg-slate-50 transition-colors" data-id="${o.id}">
      <td class="py-3 px-4">
        <div class="inline-flex items-center gap-2">
          <span class="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-900">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : '—'}</span>
          <span class="text-[11px] text-slate-400 hidden sm:inline">${o.vehicle ? escapeHtml([o.vehicle.make, o.vehicle.model].filter(Boolean).join(' ')) : ''}</span>
        </div>
      </td>
      <td class="py-3 px-4">
        <div class="flex flex-col">
          <span class="font-bold text-slate-800">${escapeHtml(o.service_type || 'Service')}</span>
          <span class="text-[10px] text-slate-400">${timeAgo(o.created_at)}</span>
        </div>
      </td>
      <td class="py-3 px-4">
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${URGENCY_CLS[o.urgency] || URGENCY_CLS.normal} text-[10px] font-bold border capitalize">
          <span class="w-1.5 h-1.5 rounded-full bg-current"></span> ${escapeHtml(o.urgency || 'normal')}
        </span>
      </td>
      <td class="py-3 px-4 text-right">
        <a class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:text-brand-blue hover:bg-slate-100 transition shadow-sm" href="work-order-detail.html?id=${o.id}" title="Manage Work Order">
          <i class="bi bi-tools text-xs"></i>
        </a>
      </td>
    </tr>`).join('');
}

function urgencyRank(u) { return { critical: 4, high: 3, normal: 2, low: 1 }[u] || 0; }

async function loadActivity() {
  const list = document.getElementById('recent-activity-list');
  const { data } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(8);

  const orders = data || [];
  if (orders.length === 0) {
    list.innerHTML = `<li class="p-6 text-center text-slate-400 text-xs">No service records registered yet.</li>`;
    return;
  }

  list.innerHTML = orders.map(o => `
    <li class="p-3.5 hover:bg-slate-50/50 transition flex gap-3 items-start text-xs">
      <div class="mt-0.5 w-7 h-7 rounded-xl ${o.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'} flex items-center justify-center shrink-0 text-sm">
        <i class="bi ${o.status === 'completed' ? 'bi-check2' : 'bi-plus-lg'}"></i>
      </div>
      <div class="min-w-0">
        <p class="text-slate-800"><span class="font-bold">${escapeHtml(o.service_type || 'Work order')}</span> ${o.status === 'completed' ? 'completed' : 'logged'}.</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : 'No vehicle'}${o.cost_naira ? ` · ${formatNaira(o.cost_naira)}` : ''}</p>
        <span class="text-[10px] text-slate-400 block mt-1 font-medium">${timeAgo(o.created_at)}</span>
      </div>
    </li>`).join('');
}

async function onCreateWorkOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('wo-save-btn');
  const original = btn.textContent;
  btn.disabled = true; 
  btn.textContent = 'Creating...';

  const payload = {
    organization_id: orgId,
    vehicle_id: document.getElementById('wo-vehicle').value,
    service_type: document.getElementById('wo-service-type').value.trim(),
    description: document.getElementById('wo-description').value.trim() || null,
    urgency: document.getElementById('wo-urgency').value,
    scheduled_date: document.getElementById('wo-scheduled-date').value || null,
    status: 'open',
  };

  if (!payload.vehicle_id) {
    showToast('Please select a vehicle.', 'error');
    btn.disabled = false; 
    btn.textContent = original;
    return;
  }

  const { error } = await supabase.from('work_orders').insert(payload);
  btn.disabled = false; 
  btn.textContent = original;

  if (error) { 
    showToast(error.message, 'error'); 
    return; 
  }

  showToast('Work order created successfully.', 'success');
  closeModal();
  await Promise.all([loadKpis(), loadAttentionTable(), loadActivity()]);
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Maintenance Console?')) performLogout();
});