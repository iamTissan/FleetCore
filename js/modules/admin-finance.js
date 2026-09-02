/**
 * ADMIN-FINANCE.JS — Fleet-wide cost summary, fuel expenses, and variance analysis
 * for the FleetCore Company Admin portal.
 */

import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

let currentOrgId = null;
let vehicles = [];

const tbody = document.getElementById('finance-tbody');
if (tbody) initFinance();

export async function initFinance() {
  const profile = await getUserProfile();
  if (!profile) return;
  
  currentOrgId = profile.organization_id;

  // Hydrate header user information
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = profile.full_name || 'Fleet Administrator';
  if (headerAvatar && profile.full_name) {
    const initials = profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    headerAvatar.textContent = initials;
  }

  // Fetch true organization name
  if (currentOrgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', currentOrgId)
      .single();
    
    if (org && document.getElementById('fc-org-name')) {
      document.getElementById('fc-org-name').textContent = org.name;
    }
  }

  // Modal bindings
  document.getElementById('fuel-modal-close')?.addEventListener('click', closeFuelModal);
  document.getElementById('fuel-cancel-btn')?.addEventListener('click', closeFuelModal);

  await loadVehiclesDropdown();
  await loadFinancialData();
}
window.initFinance = initFinance;

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function sumInRange(table, orgId, dateCol, amountCol, start, end) {
  const { data } = await supabase
    .from(table)
    .select(amountCol)
    .eq('organization_id', orgId)
    .gte(dateCol, start)
    .lt(dateCol, end);
    
  return (data || []).reduce((sum, row) => sum + Number(row[amountCol] || 0), 0);
}

function changeCell(thisMonth, lastMonth) {
  if (lastMonth === 0) {
    if (thisMonth === 0) return `<span class="text-slate-400 font-medium">—</span>`;
    return `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/60">
        <i class="bi bi-arrow-up-right"></i> New Spend
      </span>`;
  }
  
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
  const up = pct >= 0;
  const cls = up ? 'text-rose-700 bg-rose-50 border-rose-200/60' : 'text-emerald-700 bg-emerald-50 border-emerald-200/60';
  const icon = up ? 'bi-arrow-up' : 'bi-arrow-down';
  
  return `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border ${cls}">
      <i class="bi ${icon}"></i> ${Math.abs(pct).toFixed(0)}%
    </span>`;
}

async function loadVehiclesDropdown() {
  if (!currentOrgId) return;
  const { data } = await supabase
    .from('vehicles')
    .select('id, plate_number, make, model')
    .eq('organization_id', currentOrgId)
    .order('plate_number');

  vehicles = data || [];
  const select = document.getElementById('fuel-vehicle');
  if (select) {
    select.innerHTML = vehicles.length
      ? vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)} (${escapeHtml([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle')})</option>`).join('')
      : `<option value="">No vehicles registered</option>`;
  }
}

async function loadFinancialData() {
  if (!tbody || !currentOrgId) return;

  tbody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400 font-medium">Fetching financial data...</td></tr>`;

  const thisM = monthBounds(0);
  const lastM = monthBounds(-1);

  const [fuelThis, fuelLast, maintThis, maintLast] = await Promise.all([
    sumInRange('fuel_logs', currentOrgId, 'logged_at', 'amount_naira', thisM.start, thisM.end),
    sumInRange('fuel_logs', currentOrgId, 'logged_at', 'amount_naira', lastM.start, lastM.end),
    sumInRange('work_orders', currentOrgId, 'created_at', 'cost_naira', thisM.start, thisM.end),
    sumInRange('work_orders', currentOrgId, 'created_at', 'cost_naira', lastM.start, lastM.end),
  ]);

  const totalThis = fuelThis + maintThis;
  const totalLast = fuelLast + maintLast;

  // Hydrate KPI cards
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('kpi-total-this', formatNaira(totalThis));
  set('kpi-fuel-this', formatNaira(fuelThis));
  set('kpi-maint-this', formatNaira(maintThis));

  const emptyState = document.getElementById('empty-state');
  const tableContainer = document.getElementById('finance-table-container');

  if (totalThis === 0 && totalLast === 0) {
    if (tableContainer) tableContainer.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (tableContainer) tableContainer.classList.remove('hidden');

  const rows = [
    { label: 'Fuel Logs & Tank Top-ups', icon: 'bi-fuel-pump', thisM: fuelThis, lastM: fuelLast },
    { label: 'Vehicle Repairs & Work Orders', icon: 'bi-tools', thisM: maintThis, lastM: maintLast },
    { label: 'Total Fleet Operating Cost', icon: 'bi-wallet2', thisM: totalThis, lastM: totalLast, isTotal: true },
  ];

  tbody.innerHTML = rows.map(r => `
    <tr class="hover:bg-slate-50/75 transition border-b border-slate-100 ${r.isTotal ? 'font-bold bg-slate-50/50' : ''}">
      <td class="py-3.5 px-4">
        <div class="flex items-center gap-2.5">
          <span class="p-1.5 rounded-lg ${r.isTotal ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-500'} text-sm">
            <i class="bi ${r.icon}"></i>
          </span>
          <span class="text-xs ${r.isTotal ? 'text-slate-900 font-bold' : 'text-slate-800 font-medium'}">${escapeHtml(r.label)}</span>
        </div>
      </td>
      <td class="py-3.5 px-4 font-mono font-bold text-slate-900">${formatNaira(r.thisM)}</td>
      <td class="py-3.5 px-4 font-mono text-slate-500">${formatNaira(r.lastM)}</td>
      <td class="py-3.5 px-4 text-right">${changeCell(r.thisM, r.lastM)}</td>
    </tr>`).join('');
}

window.openFuelModal = function() {
  document.getElementById('fuel-modal')?.classList.remove('hidden');
  const dateInput = document.getElementById('fuel-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 16);
  }
};

window.closeFuelModal = function() {
  document.getElementById('fuel-modal')?.classList.add('hidden');
  document.getElementById('fuel-form')?.reset();
};

window.handleCreateFuelLog = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('fuel-save-btn');
  const original = btn.textContent;

  const vehicle_id = document.getElementById('fuel-vehicle').value;
  const amount_naira = Number(document.getElementById('fuel-amount').value);
  const liters = document.getElementById('fuel-liters').value ? Number(document.getElementById('fuel-liters').value) : null;
  const odometer_km = document.getElementById('fuel-odometer').value ? Number(document.getElementById('fuel-odometer').value) : null;
  const logged_at = document.getElementById('fuel-date').value ? new Date(document.getElementById('fuel-date').value).toISOString() : new Date().toISOString();

  if (!vehicle_id || !amount_naira) {
    showToast('Vehicle and total amount are required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Recording...';

  const profile = await getUserProfile();
  const payload = {
    organization_id: currentOrgId,
    vehicle_id,
    amount_naira,
    liters,
    odometer_km,
    logged_at,
    logged_by: profile?.id || null,
  };

  const { error } = await supabase.from('fuel_logs').insert(payload);
  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Fuel receipt successfully recorded.', 'success');
  window.closeFuelModal();
  await loadFinancialData();
};