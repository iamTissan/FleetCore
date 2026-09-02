/**
 * SHARED-PROFILE.JS — Universal profile management across all FleetCore portals.
 * Used by admin/, driver/, maintenance/, finance/, and bex-admin/ profile pages.
 */
import { supabase, getUserProfile, formatDate, timeAgo, avatarDataUri } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fc-profile-form');
if (form) initSharedProfile();

export async function initSharedProfile() {
  const profile = await getUserProfile();
  if (!profile) return;

  const nameEl = document.getElementById('fc-full-name') || document.getElementById('p-name');
  const emailEl = document.getElementById('fc-email') || document.getElementById('p-email');
  const phoneEl = document.getElementById('fc-phone') || document.getElementById('p-phone');
  const addressEl = document.getElementById('fc-address') || document.getElementById('p-address');
  const lastLoginEl = document.getElementById('fc-last-login');
  
  const licenseNumEl = document.getElementById('fc-license-number') || document.getElementById('driver-license-no');
  const licenseExpEl = document.getElementById('fc-license-expiry') || document.getElementById('driver-license-expiry');
  const licenseStatusEl = document.getElementById('fc-license-status');

  const fullName = profile.full_name || '';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';

  // Hydrate Text Fields
  if (nameEl) nameEl.value = fullName;
  if (emailEl) emailEl.value = profile.email || '';
  if (phoneEl) phoneEl.value = profile.phone_number || '';
  if (addressEl) addressEl.value = profile.address || '';

  // Synchronize Topbar & Sidebar Names / Avatars
  document.querySelectorAll('#header-user-name, #header-driver-name, #sidebar-name, #driver-name-head, .fc-user-name').forEach(el => {
    el.textContent = fullName || 'User';
  });

  document.querySelectorAll('#header-avatar, #sidebar-initial, #driver-avatar-circle').forEach(el => {
    if (!el.style.backgroundImage || el.style.backgroundImage === 'none') {
      el.textContent = initials;
    }
  });

  // Calculate Last Login
  if (lastLoginEl) {
    let lastLoginTimestamp = profile.last_login_at;
    if (!lastLoginTimestamp) {
      const { data: { user } } = await supabase.auth.getUser();
      lastLoginTimestamp = user?.last_sign_in_at;
    }

    if (lastLoginTimestamp) {
      lastLoginEl.textContent = `${formatDate(lastLoginTimestamp)} (${timeAgo(lastLoginTimestamp)})`;
    } else {
      lastLoginEl.textContent = 'Active now';
    }
  }

  // Driver License Metadata (if present on view)
  if (licenseNumEl) licenseNumEl.textContent = profile.license_number || 'Not on file';
  if (licenseExpEl) licenseExpEl.textContent = profile.license_expiry ? formatDate(profile.license_expiry) : '—';
  
  if (licenseStatusEl) {
    if (!profile.license_expiry) {
      licenseStatusEl.textContent = 'No Record';
      licenseStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200';
    } else {
      const days = Math.round((new Date(profile.license_expiry) - new Date()) / 86400000);
      if (days < 0) {
        licenseStatusEl.textContent = 'Expired';
        licenseStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200';
      } else if (days <= 30) {
        licenseStatusEl.textContent = `Expires in ${days}d`;
        licenseStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200';
      } else {
        licenseStatusEl.textContent = 'Active';
        licenseStatusEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200';
      }
    }
  }

  // Form Save Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalHTML = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="bi bi-arrow-repeat animate-spin"></i> <span>Saving...</span>`;

    const updatedName = nameEl?.value.trim() || profile.full_name;
    const payload = {
      full_name: updatedName,
      phone_number: phoneEl?.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    if (addressEl) {
      payload.address = addressEl.value.trim() || null;
    }

    const { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    btn.disabled = false;
    btn.innerHTML = originalHTML;

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Profile information updated successfully.', 'success');

    // Instant UI Reflection
    const newInitials = updatedName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'FC';
    document.querySelectorAll('#header-user-name, #header-driver-name, #sidebar-name, #driver-name-head, .fc-user-name').forEach(el => {
      el.textContent = updatedName;
    });
    document.querySelectorAll('#header-avatar, #sidebar-initial, #driver-avatar-circle').forEach(el => {
      if (!el.style.backgroundImage || el.style.backgroundImage === 'none') {
        el.textContent = newInitials;
      }
    });
    document.querySelectorAll('img[alt="User profile"]').forEach(img => {
      img.title = updatedName;
      if (!profile.avatar_url) img.src = avatarDataUri(updatedName);
    });
  });
}