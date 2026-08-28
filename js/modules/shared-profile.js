/**
 * SHARED-PROFILE.JS — Used by admin/, driver/, maintenance/, finance/,
 * and bex-admin profile.html pages (all share identical #fc-* ids).
 * Reads/writes the signed-in user's own public.profiles row.
 */
import { supabase, getUserProfile, formatDate } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fc-profile-form');
if (form) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  const nameEl = document.getElementById('fc-full-name');
  const emailEl = document.getElementById('fc-email');
  const phoneEl = document.getElementById('fc-phone');
  const lastLoginEl = document.getElementById('fc-last-login');
  const licenseNumEl = document.getElementById('fc-license-number');
  const licenseExpEl = document.getElementById('fc-license-expiry');
  const licenseStatusEl = document.getElementById('fc-license-status');

  if (nameEl) nameEl.value = profile.full_name || '';
  if (emailEl) emailEl.value = profile.email || '';
  if (phoneEl) phoneEl.value = profile.phone_number || '';
  if (lastLoginEl) lastLoginEl.textContent = profile.last_login_at
    ? `${formatDate(profile.last_login_at)}${profile.last_login_location ? ' · ' + profile.last_login_location : ''}`
    : 'No login history recorded yet';

  if (licenseNumEl) licenseNumEl.textContent = profile.license_number || 'Not on file';
  if (licenseExpEl) licenseExpEl.textContent = profile.license_expiry ? formatDate(profile.license_expiry) : '—';
  if (licenseStatusEl) {
    if (!profile.license_expiry) { licenseStatusEl.textContent = 'No record'; }
    else {
      const days = Math.round((new Date(profile.license_expiry) - new Date()) / 86400000);
      licenseStatusEl.textContent = days < 0 ? 'Expired' : days <= 30 ? `Expires in ${days}d` : 'Active';
      licenseStatusEl.className = days < 0
        ? 'px-sm py-xs rounded-full bg-error-container text-error font-label-sm text-label-sm'
        : days <= 30
          ? 'px-sm py-xs rounded-full bg-warning-amber/10 text-warning-amber font-label-sm text-label-sm'
          : 'px-sm py-xs rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving…';

    const payload = {
      full_name: nameEl?.value.trim() || profile.full_name,
      phone_number: phoneEl?.value.trim() || null,
    };

    const { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    btn.disabled = false; btn.textContent = original;

    if (error) { showToast(error.message, 'error'); return; }
    showToast('Profile updated.', 'success');
    document.querySelectorAll('img[alt="User profile"]').forEach(img => { img.title = payload.full_name; });
  });
}
