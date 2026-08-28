/**
 * DRIVER-INCIDENT.JS — SOS / incident report flow for Driver.
 * Inserts a real incidents row, optionally with a geolocation ping and
 * an uploaded photo. Generates a real reference number.
 */
import { supabase, getUserProfile, uploadFile } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('incident-form');
if (form) init();

let selectedType = null;
let orgId = null;
let profileId = null;
let vehicleId = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;
  profileId = profile.id;

  const { data: vehicle } = await supabase.from('vehicles').select('id').eq('assigned_driver_id', profile.id).maybeSingle();
  vehicleId = vehicle?.id || null;

  const hint = document.getElementById('incident-type-hint');
  document.querySelectorAll('[data-incident-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.getAttribute('data-incident-type');
      document.querySelectorAll('[data-incident-type]').forEach(b => b.classList.remove('border-danger-red', 'bg-error-container/10'));
      btn.classList.add('border-danger-red', 'bg-error-container/10');
      if (hint) hint.textContent = `Selected: ${btn.querySelector('span:last-child').textContent}`;
    });
  });

  form.addEventListener('submit', onSubmit);
}

function generateReference() {
  return 'INC-' + Math.floor(1000 + Math.random() * 9000);
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 }
    );
  });
}

async function onSubmit(e) {
  e.preventDefault();

  if (!selectedType) {
    showToast('Select an incident type first.', 'error');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined">emergency</span> Sending…';

  const [location, photoUrl] = await Promise.all([
    getLocation(),
    (async () => {
      const file = document.getElementById('incident-photo').files[0];
      if (!file) return null;
      try { return await uploadFile(file, 'incident-photos'); }
      catch { return null; }
    })(),
  ]);

  const payload = {
    organization_id: orgId,
    driver_id: profileId,
    vehicle_id: vehicleId,
    incident_type: selectedType,
    severity: selectedType === 'health' || selectedType === 'security' ? 'critical' : 'high',
    details: document.getElementById('incident-details').value.trim() || null,
    photo_url: photoUrl,
    lat: location?.lat || null,
    lng: location?.lng || null,
    status: 'open',
    reference: generateReference(),
  };

  const { error } = await supabase.from('incidents').insert(payload);

  btn.disabled = false;
  btn.innerHTML = original;

  if (error) {
    showToast(`Could not send SOS: ${error.message}`, 'error');
    return;
  }

  showToast(`SOS sent — reference ${payload.reference}. Help is on the way.`, 'success', 6000);
  form.reset();
  selectedType = null;
  document.querySelectorAll('[data-incident-type]').forEach(b => b.classList.remove('border-danger-red', 'bg-error-container/10'));
  document.getElementById('incident-type-hint').textContent = 'Select an incident type above';
}
