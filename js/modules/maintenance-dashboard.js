/**
 * MAINTENANCE-DASHBOARD.JS — Fully wired overview for Maintenance Officer.
 * No mock KPIs, no fake work orders (WO-2942 etc). Real queries against
 * public.work_orders and public.vehicles.
 */
import { supabase, getUserProfile, formatNaira, timeAgo, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const kpiEl = document.getElementById('kpi-vehicles-due');
if (kpiEl) init();

let orgId = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadVehiclesForModal();
  await Promise.all([loadKpis(), loadAttentionTable(), loadActivity()]);

  document.querySelectorAll('.fc-add-workorder-btn').forEach(b => b.addEventListener('click', () => document.getElementById('wo-modal').classList.remove('hidden')));
  document.getElementById('wo-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('wo-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('wo-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('wo-form')?.addEventListener('submit', onCreateWorkOrder);
}

function closeModal() {
  document.getElementById('wo-modal')?.classList.add('hidden');
  document.getElementById('wo-form')?.reset();
}

async function loadVehiclesForModal() {
  const { data } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId).order('plate_number');
  const select = document.getElementById('wo-vehicle');
  if (select) select.innerHTML = (data || []).map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)}</option>`).join('') || '<option value="">No vehicles yet</option>';
}

async function loadKpis() {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

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
    ? '<div class="bg-surface-container-high h-full w-full"></div>'
    : `<div class="bg-danger-red h-full" style="width:${(critical / total) * 100}%"></div><div class="bg-warning-amber h-full" style="width:${(high / total) * 100}%"></div><div class="bg-secondary h-full" style="width:${(normalLow / total) * 100}%"></div>`;
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
    changeEl.className = 'font-medium text-text-muted';
  } else {
    const pct = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    changeEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    changeEl.className = `font-medium ${pct >= 0 ? 'text-warning-amber' : 'text-secondary'}`;
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
    tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const orders = (data || []).sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-text-muted font-body-sm px-md">No open work orders. Fleet is in good shape.</td></tr>`;
    return;
  }

  const URGENCY_CLS = {
    critical: 'bg-[#FEF2F2] text-danger-red border-[#FCA5A5]',
    high: 'bg-[#FFFBEB] text-warning-amber border-[#FDE68A]',
    normal: 'bg-surface-container text-on-surface-variant border-border-light',
    low: 'bg-surface-container text-on-surface-variant border-border-light',
  };

  tbody.innerHTML = orders.map(o => `
    <tr class="hover:bg-surface-container-low transition-colors group" data-id="${o.id}">
      <td class="py-md px-md">
        <div class="inline-flex items-center gap-2">
          <span class="px-2 py-1 bg-surface-variant border border-outline-variant rounded font-mono-data text-mono-data text-on-surface tracking-widest shadow-sm">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : '—'}</span>
          <span class="font-body-sm text-body-sm text-text-muted hidden sm:inline">${o.vehicle ? escapeHtml([o.vehicle.make, o.vehicle.model].filter(Boolean).join(' ')) : ''}</span>
        </div>
      </td>
      <td class="py-md px-md">
        <div class="flex flex-col">
          <span class="font-body-sm text-body-sm font-medium text-on-surface">${escapeHtml(o.service_type || 'Service')}</span>
          <span class="font-label-sm text-label-sm text-text-muted">${timeAgo(o.created_at)}</span>
        </div>
      </td>
      <td class="py-md px-md">
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded ${URGENCY_CLS[o.urgency] || URGENCY_CLS.normal} font-label-sm text-label-sm border capitalize">
          <span class="w-1.5 h-1.5 rounded-full bg-current"></span> ${escapeHtml(o.urgency || 'normal')}
        </span>
      </td>
      <td class="py-md px-md text-right">
        <a class="inline-flex items-center justify-center w-8 h-8 rounded border border-border-light text-text-muted hover:text-primary-container hover:border-primary-container transition-colors" href="work-order-detail.html?id=${o.id}" title="Open Work Order">
          <span class="material-symbols-outlined text-[18px]">build_circle</span>
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
    list.innerHTML = `<li class="p-lg text-center text-text-muted font-body-sm">No work orders yet.</li>`;
    return;
  }

  list.innerHTML = orders.map(o => `
    <li class="p-md hover:bg-surface-container-low transition-colors flex gap-sm items-start">
      <div class="mt-1 w-6 h-6 rounded-full ${o.status === 'completed' ? 'bg-[#ECFDF5] text-secondary' : 'bg-surface-container text-on-surface-variant'} flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-[14px]">${o.status === 'completed' ? 'check' : 'add'}</span>
      </div>
      <div>
        <p class="font-body-sm text-body-sm text-on-surface"><span class="font-medium">${escapeHtml(o.service_type || 'Work order')}</span> ${o.status === 'completed' ? 'completed' : 'logged'}.</p>
        <p class="font-label-sm text-label-sm text-text-muted mt-0.5">${o.vehicle ? escapeHtml(o.vehicle.plate_number) : 'No vehicle'}${o.cost_naira ? ` · ${formatNaira(o.cost_naira)}` : ''}</p>
        <span class="font-label-sm text-label-sm text-text-muted block mt-1">${timeAgo(o.created_at)}</span>
      </div>
    </li>`).join('');
}

async function onCreateWorkOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('wo-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';

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
    showToast('Select a vehicle.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const { error } = await supabase.from('work_orders').insert(payload);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }

  showToast('Work order created.', 'success');
  document.getElementById('wo-modal').classList.add('hidden');
  document.getElementById('wo-form').reset();
  await Promise.all([loadKpis(), loadAttentionTable(), loadActivity()]);
}
