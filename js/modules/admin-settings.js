/**
 * ADMIN-SETTINGS.JS — Company profile and organization settings editor
 * for the FleetCore Company Admin portal.
 */

import { supabase, getUserProfile } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fc-settings-form');
if (form) initSettings();

let orgId = null;

export async function initSettings() {
  const profile = await getUserProfile();
  if (!profile || !profile.organization_id) return;
  
  orgId = profile.organization_id;

  // Hydrate header user information
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = profile.full_name || 'Fleet Administrator';
  if (headerAvatar && profile.full_name) {
    const initials = profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    headerAvatar.textContent = initials;
  }

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    showToast('Could not load company settings.', 'error');
    return;
  }

  // Populate form fields
  document.getElementById('fc-company-name').value = org.name || '';
  document.getElementById('fc-subdomain').value = org.subdomain || '';
  document.getElementById('fc-phone').value = org.phone_number || '';
  document.getElementById('fc-address').value = org.address || '';
  
  const planEl = document.getElementById('fc-plan');
  if (planEl) {
    planEl.textContent = (org.plan || 'Enterprise Telematics Tier').replace(/^\w/, c => c.toUpperCase());
  }

  const statusEl = document.getElementById('fc-account-status');
  if (statusEl) {
    statusEl.textContent = (org.account_status || 'Active & Operational').replace(/^\w/, c => c.toUpperCase());
  }

  // Update organization name in sidebars
  document.querySelectorAll('#fc-org-name').forEach(el => {
    el.textContent = org.name || 'Your Company';
  });

  form.addEventListener('submit', onSubmit);
}
window.initSettings = initSettings;

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('fc-settings-save');
  const original = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `<i class="bi bi-arrow-repeat animate-spin"></i><span>Saving...</span>`;

  const payload = {
    name: document.getElementById('fc-company-name').value.trim(),
    phone_number: document.getElementById('fc-phone').value.trim() || null,
    address: document.getElementById('fc-address').value.trim() || null,
  };

  if (!payload.name) {
    showToast('Company name cannot be blank.', 'error');
    btn.disabled = false;
    btn.innerHTML = original;
    return;
  }

  const { error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', orgId);

  btn.disabled = false;
  btn.innerHTML = original;

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  showToast('Company profile settings successfully updated.', 'success');
  
  document.querySelectorAll('#fc-org-name').forEach(el => {
    el.textContent = payload.name;
  });
}