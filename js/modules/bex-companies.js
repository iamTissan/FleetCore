/**
 * BEX-COMPANIES.JS — Cross-tenant company list and tenant provisioning.
 */
import { supabase, escapeHtml, formatDate, statusBadge } from '../config.js';
import { showToast, slugify, performLogout } from '../auth.js';

const STATUS_MAP = {
  trial: { label: 'Trial', cls: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
  suspended: { label: 'Suspended', cls: 'bg-rose-50 text-rose-700 border-rose-200/60' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const tbody = document.getElementById('co-tbody');
if (tbody) initBexCompanies();

export async function initBexCompanies() {
  await loadCompanies();

  document.getElementById('btn-provision')?.addEventListener('click', () => document.getElementById('co-modal')?.classList.remove('hidden'));
  document.getElementById('co-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('co-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('co-form')?.addEventListener('submit', onProvision);

  document.getElementById('co-name')?.addEventListener('input', (e) => {
    const subEl = document.getElementById('co-subdomain');
    const codeEl = document.getElementById('co-company-code');
    if (subEl && !subEl.dataset.touched) subEl.value = slugify(e.target.value);
    if (codeEl && !codeEl.dataset.touched) {
      codeEl.value = e.target.value.substring(0, 3).toUpperCase() + '-001';
    }
  });
  document.getElementById('co-subdomain')?.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
  document.getElementById('co-company-code')?.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
}

function closeModal() {
  document.getElementById('co-modal')?.classList.add('hidden');
  document.getElementById('co-form')?.reset();
}

async function loadCompanies() {
  const { data: orgs, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('co-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
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
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="window.location.href='tenant-detail.html?id=${c.id}'">
      <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(c.name)}</td>
      <td class="py-3 px-4 font-mono font-bold text-teal-700">${escapeHtml(c.company_code || '—')}</td>
      <td class="py-3 px-4">${statusBadge(c.account_status, STATUS_MAP)}</td>
      <td class="py-3 px-4 font-semibold text-slate-700 capitalize">${escapeHtml(c.plan || 'Standard')}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-800 text-right">${vehicleCounts[c.id] || 0}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-800 text-right">${userCounts[c.id] || 0}</td>
      <td class="py-3 px-4 text-slate-500 font-mono text-right">${formatDate(c.created_at)}</td>
    </tr>`).join('');
}

async function onProvision(e) {
  e.preventDefault();
  const btn = document.getElementById('co-save-btn');
  const original = btn.textContent;
  btn.disabled = true; 
  btn.textContent = 'Provisioning...';

  const name = document.getElementById('co-name').value.trim();
  const companyCode = document.getElementById('co-company-code').value.trim().toUpperCase();
  const subdomain = document.getElementById('co-subdomain').value.trim().toLowerCase();
  const city = document.getElementById('co-city').value.trim() || null;
  const plan = document.getElementById('co-plan').value;
  const adminName = document.getElementById('co-admin-name').value.trim();
  const adminEmail = document.getElementById('co-admin-email').value.trim();

  const { data: org, error: orgErr } = await supabase.from('organizations').insert({
    name,
    company_code: companyCode,
    subdomain,
    city,
    plan,
    account_status: 'active',
  }).select().single();

  if (orgErr) {
    showToast(orgErr.code === '23505' ? 'Company code or subdomain already in use.' : orgErr.message, 'error');
    btn.disabled = false; 
    btn.textContent = original;
    return;
  }

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email: adminEmail, full_name: adminName, role: 'company_admin', organization_id: org.id },
  });

  btn.disabled = false; 
  btn.textContent = original;

  if (error || data?.error) {
    showToast(`Tenant registered, but initial admin invite failed: ${(data && data.error) || error.message}.`, 'error', 7000);
    closeModal();
    await loadCompanies();
    return;
  }

  showToast(`${name} successfully provisioned on FleetCore.`, 'success');
  closeModal();
  await loadCompanies();
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});