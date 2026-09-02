/**
 * DRIVER-INCIDENT.JS — Mobile SOS Incident Report dispatch.
 */
import { supabase, getUserProfile, uploadFile } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('incident-form');
if (form) initIncident();

let selectedType = null;
let orgId = null;
let profileId = null;
let vehicleId = null;

export async function initIncident() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;
  profileId = profile.id;

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('assigned_driver_id', profile.id)
    .maybeSingle();

  vehicleId = vehicle?.id || null;

  const hint = document.getElementById('incident-type-hint');
  document.querySelectorAll('[data-incident-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.getAttribute('data-incident-type');
      document.querySelectorAll('[data-incident-type]').forEach(b => {
        b.classList.remove('border-rose-600', 'bg-rose-50/30');
      });
      btn.classList.add('border-rose-600', 'bg-rose-50/30');
      if (hint) hint.textContent = `Selected: ${btn.querySelector('span').textContent}`;
    });
  });

  form.addEventListener('submit', onSubmit);
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
  btn.innerHTML = `<i class="bi bi-arrow-repeat animate-spin"></i> Transmitting...`;

  const [location, photoUrl] = await Promise.all([
    getLocation(),
    (async () => {
      const file = document.getElementById('incident-photo')?.files[0];
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
    description: document.getElementById('incident-details').value.trim() || 'Urgent incident alert',
    photo_url: photoUrl,
    latitude: location?.lat || null,
    longitude: location?.lng || null,
    status: 'open',
  };

  const { error } = await supabase.from('incidents').insert(payload);

  btn.disabled = false;
  btn.innerHTML = original;

  if (error) {
    showToast(`Emergency transmission failed: ${error.message}`, 'error');
    return;
  }

  showToast('Emergency alert broadcasted. Help is on the way.', 'success', 6000);
  form.reset();
  selectedType = null;
  document.querySelectorAll('[data-incident-type]').forEach(b => b.classList.remove('border-rose-600', 'bg-rose-50/30'));
  document.getElementById('incident-type-hint').textContent = 'Tap a category above';
}