/**
 * DRIVER-FUEL-LOG.JS — Handles fuel refueling receipts, odometer logs, and audits.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, uploadFile } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fuel-log-form');
if (form) initFuelLog();

let orgId = null;
let assignedVehicleId = null;

export async function initFuelLog() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, plate_number')
    .eq('assigned_driver_id', profile.id)
    .maybeSingle();

  assignedVehicleId = vehicle?.id || null;

  const label = document.getElementById('fuel-log-vehicle-label');
  if (label) {
    label.textContent = vehicle 
      ? `Logging refueling entries for assigned vehicle ${vehicle.plate_number}.` 
      : 'No permanent vehicle attached — log will be queued for vehicle matching.';
  }

  await loadHistory(profile.id);
  form.addEventListener('submit', (e) => onSubmit(e, profile.id));
}

async function loadHistory(driverId) {
  const list = document.getElementById('fuel-log-history');
  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) {
    list.innerHTML = `<div class="p-4 text-center text-rose-500 text-xs">Failed to load history: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const logs = data || [];
  if (logs.length === 0) {
    list.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">No refueling logs recorded yet.</div>`;
    return;
  }

  list.innerHTML = logs.map(l => `
    <div class="bg-white border border-slate-200/80 rounded-xl p-3 flex justify-between items-center shadow-sm text-xs">
      <div>
        <div class="font-bold text-slate-800">${escapeHtml(l.station_name || 'Station Log')}</div>
        <div class="text-[11px] text-slate-400">${l.litres || 0}L · ${formatDate(l.created_at)}</div>
      </div>
      <div class="text-right">
        <div class="font-mono font-bold text-slate-800">${formatNaira(l.amount_naira || 0)}</div>
        <div class="text-[10px] font-bold capitalize ${l.status === 'flagged' ? 'text-rose-600' : l.status === 'approved' ? 'text-emerald-600' : 'text-slate-400'}">${l.status || 'pending'}</div>
      </div>
    </div>`).join('');
}

async function onSubmit(e, driverId) {
  e.preventDefault();
  const btn = document.getElementById('fuel-log-submit');
  const original = btn.innerHTML;
  const file = document.getElementById('fuel-receipt').files[0];

  if (!file) {
    showToast('A pump receipt photo is required.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat animate-spin"></i> Uploading receipt...`;

  let receiptUrl = null;
  try {
    receiptUrl = await uploadFile(file, 'fuel-receipts');
  } catch (err) {
    showToast(`Receipt upload failed: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = original;
    return;
  }

  btn.innerHTML = `<i class="bi bi-arrow-repeat animate-spin"></i> Saving...`;

  const payload = {
    organization_id: orgId,
    vehicle_id: assignedVehicleId,
    driver_id: driverId,
    litres: Number(document.getElementById('fuel-litres').value),
    amount_naira: Number(document.getElementById('fuel-amount').value),
    station_name: document.getElementById('fuel-station').value.trim(),
    odometer_km: document.getElementById('fuel-odometer').value ? Number(document.getElementById('fuel-odometer').value) : null,
    receipt_url: receiptUrl,
    status: 'pending',
  };

  const { error } = await supabase.from('fuel_logs').insert(payload);
  btn.disabled = false;
  btn.innerHTML = original;

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Fuel purchase successfully logged.', 'success');
  form.reset();
  await loadHistory(driverId);
}