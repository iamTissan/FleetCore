/**
 * BEX-COMPANIES.JS — Cross-tenant company list + provisioning for Bex Admin.
 * Creates a real organizations row, then a real company_admin user via
 * the create-user Edge Function (now bex_admin-aware).
 */
import { supabase, escapeHtml, formatDate, statusBadge } from '../config.js';
import { showToast, slugify } from '../auth.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-warning-amber/10 text-warning-amber' },
  active: { label: 'Active', cls: 'bg-secondary-container/20 text-secondary' },
  suspended: { label: 'Suspended', cls: 'bg-error-container text-error' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};

const tbody = document.getElementById('co-tbody');
if (tbody) init();

async function init() {
  await loadCompanies();

  document.getElementById('btn-provision')?.addEventListener('click', () => document.getElementById('co-modal').classList.remove('hidden'));
  document.getElementById('co-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('co-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('co-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('co-form')?.addEventListener('submit', onProvision);

  document.getElementById('co-name')?.addEventListener('input', (e) => {
    const subEl = document.getElementById('co-subdomain');
    if (subEl && !subEl.dataset.touched) subEl.value = slugify(e.target.value);
  });
  document.getElementById('co-subdomain')?.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
}

function closeModal() {
  document.getElementById('co-modal')?.classList.add('hidden');
  document.getElementById('co-form')?.reset();
}

async function loadCompanies() {
  const { data: orgs, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('co-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const companies = orgs || [];
  if (companies.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  const [vehiclesRes, profilesRes] = await Promise.all([
    supabase.from('vehicles').select('organization_id'),
    supabase.from('profiles').select('organization_id'),
  ]);
  const vehicleCounts = {};
  (vehiclesRes.data || []).forEach(v => { vehicleCounts[v.organization_id] = (vehicleCounts[v.organization_id] || 0) + 1; });
  const userCounts = {};
  (profilesRes.data || []).forEach(p => { if (p.organization_id) userCounts[p.organization_id] = (userCounts[p.organization_id] || 0) + 1; });

  tbody.innerHTML = companies.map(c => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors cursor-pointer" onclick="window.location.href='tenant-detail.html?id=${c.id}'">
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface font-medium">${escapeHtml(c.name)}</td>
      <td class="px-md py-sm">${statusBadge(c.account_status, STATUS_MAP)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted capitalize">${escapeHtml(c.plan)}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${vehicleCounts[c.id] || 0}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${userCounts[c.id] || 0}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${formatDate(c.created_at)}</td>
    </tr>`).join('');
}

async function onProvision(e) {
  e.preventDefault();
  const btn = document.getElementById('co-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Provisioning…';

  const name = document.getElementById('co-name').value.trim();
  const subdomain = document.getElementById('co-subdomain').value.trim().toLowerCase();
  const city = document.getElementById('co-city').value.trim() || null;
  const plan = document.getElementById('co-plan').value;
  const adminName = document.getElementById('co-admin-name').value.trim();
  const adminEmail = document.getElementById('co-admin-email').value.trim();

  const { data: org, error: orgErr } = await supabase.from('organizations').insert({
    name, subdomain, city, plan, account_status: 'active',
  }).select().single();

  if (orgErr) {
    showToast(orgErr.code === '23505' ? 'That subdomain is already taken.' : orgErr.message, 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email: adminEmail, full_name: adminName, role: 'company_admin', organization_id: org.id },
  });

  btn.disabled = false; btn.textContent = original;

  if (error || data?.error) {
    showToast(`Company created, but admin account failed: ${(data && data.error) || error.message}. You can invite them manually from the tenant detail page.`, 'error', 7000);
    closeModal();
    await loadCompanies();
    return;
  }

  showToast(`${name} provisioned. Welcome email sent to ${adminEmail}.`, 'success');
  closeModal();
  await loadCompanies();
}
