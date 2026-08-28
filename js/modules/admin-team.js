/**
 * ADMIN-TEAM.JS — Staff roster + invite flow for Company Admin.
 * No mock data. Reads public.profiles (all non-driver-only... actually
 * all staff incl. drivers), invites via the create-user Edge Function.
 */
import { supabase, getUserProfile, formatDate, escapeHtml, avatarDataUri, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const ROLE_LABELS = {
  company_admin: 'Company Admin', driver: 'Driver',
  maintenance_officer: 'Maintenance Officer', account_manager: 'Account Manager',
};
const STATUS_MAP = {
  active: { label: 'Active', cls: 'bg-secondary-container/20 text-secondary' },
  inactive: { label: 'Inactive', cls: 'bg-surface-container-high text-on-surface-variant' },
  pending: { label: 'Pending', cls: 'bg-warning-amber/10 text-warning-amber' },
};

let orgId = null;
const tbody = document.getElementById('team-tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadTeam();

  document.getElementById('btn-invite-staff')?.addEventListener('click', () => document.getElementById('invite-modal').classList.remove('hidden'));
  document.getElementById('invite-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('invite-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('invite-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('invite-form')?.addEventListener('submit', onInvite);
}

function closeModal() {
  document.getElementById('invite-modal')?.classList.add('hidden');
  document.getElementById('invite-form')?.reset();
}

async function loadTeam() {
  const { data, error } = await supabase.from('profiles').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  const empty = document.getElementById('team-empty-state');
  const tableWrap = tbody.closest('.bg-surface-container-lowest');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-lg text-center text-error font-body-sm px-md">Failed to load team: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const team = data || [];
  if (team.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');

  tbody.innerHTML = team.map(p => `
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors">
      <td class="px-md py-sm">
        <div class="flex items-center gap-sm">
          <img alt="Profile" class="w-7 h-7 rounded-full object-cover border border-border-light" src="${avatarDataUri(p.full_name)}"/>
          <span class="font-body-sm text-body-sm text-on-surface font-medium">${escapeHtml(p.full_name || 'Unnamed')}</span>
        </div>
      </td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${escapeHtml(p.email || '—')}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface">${escapeHtml(ROLE_LABELS[p.role] || p.role)}</td>
      <td class="px-md py-sm">${statusBadge(p.status, STATUS_MAP)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${formatDate(p.created_at)}</td>
    </tr>`).join('');
}

async function onInvite(e) {
  e.preventDefault();
  const btn = document.getElementById('invite-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';

  const full_name = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const phone_number = document.getElementById('invite-phone').value.trim() || null;
  const role = document.getElementById('invite-role').value;

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, full_name, role, phone_number },
  });

  btn.disabled = false; btn.textContent = original;

  if (error || data?.error) {
    showToast((data && data.error) || error.message || 'Could not send invite.', 'error');
    return;
  }

  showToast(`${full_name} invited as ${ROLE_LABELS[role]}. Welcome email sent to ${email}.`, 'success');
  closeModal();
  await loadTeam();
}
