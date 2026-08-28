/**
 * ADMIN-SETTINGS.JS — Company profile editor for Company Admin.
 * Reads/writes the real public.organizations row. No mock defaults.
 */
import { supabase, getUserProfile, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const form = document.getElementById('fc-settings-form');
if (form) init();

let orgId = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile || !profile.organization_id) return;
  orgId = profile.organization_id;

  const { data: org, error } = await supabase.from('organizations').select('*').eq('id', orgId).single();
  if (error || !org) {
    showToast('Could not load company settings.', 'error');
    return;
  }

  document.getElementById('fc-company-name').value = org.name || '';
  document.getElementById('fc-subdomain').value = org.subdomain || '';
  document.getElementById('fc-phone').value = org.phone_number || '';
  document.getElementById('fc-address').value = org.address || '';
  document.getElementById('fc-plan').textContent = (org.plan || 'trial').replace(/^\w/, c => c.toUpperCase());
  document.getElementById('fc-account-status').textContent = (org.account_status || 'active').replace(/^\w/, c => c.toUpperCase());

  form.addEventListener('submit', onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('fc-settings-save');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';

  const payload = {
    name: document.getElementById('fc-company-name').value.trim(),
    phone_number: document.getElementById('fc-phone').value.trim() || null,
    address: document.getElementById('fc-address').value.trim() || null,
  };

  const { error } = await supabase.from('organizations').update(payload).eq('id', orgId);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }
  showToast('Company settings updated.', 'success');
  document.querySelectorAll('#fc-org-name').forEach(el => { el.textContent = payload.name || 'Your Company'; });
}
