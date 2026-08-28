/**
 * FINANCE-REPORTS.JS — Live cost-per-vehicle report for Account Manager.
 * No pre-baked "report list" (no such table in schema) — computed live
 * from real fuel_logs + work_orders for the selected month.
 */
import { supabase, getUserProfile, formatNaira, escapeHtml } from '../config.js';

const tbody = document.getElementById('rep-tbody');
if (tbody) init();

let orgId = null;

function monthBounds(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadReport(0);
  document.getElementById('rep-period')?.addEventListener('change', (e) => loadReport(Number(e.target.value)));
}

async function loadReport(offset) {
  tbody.innerHTML = `<tr><td colspan="4" class="py-lg text-center text-text-muted font-body-sm px-md">Loading…</td></tr>`;
  const { start, end } = monthBounds(offset);

  const [vehiclesRes, fuelRes, workOrdersRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId),
    supabase.from('fuel_logs').select('vehicle_id, amount_naira').eq('organization_id', orgId).gte('logged_at', start).lt('logged_at', end),
    supabase.from('work_orders').select('vehicle_id, cost_naira').eq('organization_id', orgId).gte('created_at', start).lt('created_at', end),
  ]);

  const vehicles = vehiclesRes.data || [];
  const fuelByVehicle = {};
  (fuelRes.data || []).forEach(f => { fuelByVehicle[f.vehicle_id] = (fuelByVehicle[f.vehicle_id] || 0) + Number(f.amount_naira || 0); });
  const maintByVehicle = {};
  (workOrdersRes.data || []).forEach(w => { maintByVehicle[w.vehicle_id] = (maintByVehicle[w.vehicle_id] || 0) + Number(w.cost_naira || 0); });

  const rows = vehicles
    .map(v => ({ vehicle: v, fuel: fuelByVehicle[v.id] || 0, maint: maintByVehicle[v.id] || 0 }))
    .filter(r => r.fuel > 0 || r.maint > 0)
    .sort((a, b) => (b.fuel + b.maint) - (a.fuel + a.maint));

  const totalSpend = rows.reduce((s, r) => s + r.fuel + r.maint, 0);
  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('rep-empty');

  document.getElementById('rep-total').textContent = formatNaira(totalSpend);
  document.getElementById('rep-vehicle-count').textContent = rows.length;
  document.getElementById('rep-avg').textContent = rows.length ? formatNaira(totalSpend / rows.length) : '₦0';

  if (rows.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = rows.map(r => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors">
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${escapeHtml(r.vehicle.plate_number)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(r.fuel)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(r.maint)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface font-semibold">${formatNaira(r.fuel + r.maint)}</td>
    </tr>`).join('');
}
