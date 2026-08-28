/**
 * DRIVER-FUEL-LOG.JS — Fuel purchase logging for Driver.
 * Uploads the receipt photo to Storage, then inserts a real fuel_logs row.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, uploadFile } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fuel-log-form');
if (form) init();

let orgId = null;
let assignedVehicleId = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  const { data: vehicle } = await supabase.from('vehicles').select('id, plate_number').eq('assigned_driver_id', profile.id).maybeSingle();
  assignedVehicleId = vehicle?.id || null;

  const label = document.getElementById('fuel-log-vehicle-label');
  if (label) label.textContent = vehicle ? `Record your recent refuelling for vehicle ${vehicle.plate_number}.` : 'You have no vehicle assigned yet — logs will be saved without a vehicle link.';

  await loadHistory(profile.id);
  form.addEventListener('submit', (e) => onSubmit(e, profile.id));
}

async function loadHistory(driverId) {
  const list = document.getElementById('fuel-log-history');
  const { data, error } = await supabase.from('fuel_logs').select('*').eq('driver_id', driverId).order('logged_at', { ascending: false }).limit(10);

  if (error) {
    list.innerHTML = `<div class="p-md text-center text-error font-body-sm">Failed to load history: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const logs = data || [];
  if (logs.length === 0) {
    list.innerHTML = `<div class="p-md text-center text-text-muted font-body-sm border border-dashed border-border-light rounded-lg">No fuel logs yet.</div>`;
    return;
  }
  list.innerHTML = logs.map(l => `
    <div class="bg-surface border border-border-light rounded-lg p-md flex justify-between items-center">
      <div>
        <div class="font-body-md text-body-md text-on-surface font-medium">${escapeHtml(l.station_name || 'Unknown station')}</div>
        <div class="font-body-sm text-xs text-text-muted">${l.litres}L · ${formatDate(l.logged_at)}</div>
      </div>
      <div class="text-right">
        <div class="font-mono-data text-mono-data text-on-surface">${formatNaira(l.amount_naira)}</div>
        <div class="font-label-sm text-xs ${l.status === 'flagged' ? 'text-error' : l.status === 'approved' ? 'text-secondary' : 'text-text-muted'} capitalize">${l.status}</div>
      </div>
    </div>`).join('');
}

async function onSubmit(e, driverId) {
  e.preventDefault();
  const btn = document.getElementById('fuel-log-submit');
  const original = btn.textContent;
  const file = document.getElementById('fuel-receipt').files[0];

  if (!file) { showToast('A receipt photo is required.', 'error'); return; }

  btn.disabled = true; btn.textContent = 'Uploading receipt…';

  let receiptUrl;
  try {
    receiptUrl = await uploadFile(file, 'fuel-receipts');
  } catch (err) {
    showToast(`Receipt upload failed: ${err.message}`, 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  btn.textContent = 'Saving…';

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
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }

  showToast('Fuel log saved.', 'success');
  form.reset();
  await loadHistory(driverId);
}
