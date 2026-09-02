/**
 * BEX-USERS.JS — Cross-tenant global identity directory and role oversight.
 */
import { supabase, getUserProfile, formatDate, escapeHtml, avatarDataUri } from '../config.js';
import { performLogout } from '../auth.js';

const tbody = document.getElementById('gu-tbody');
if (tbody) initGlobalUsers();

let users = [];
let orgMap = {};
let searchTerm = '';
let activeRole = 'all';

const ROLE_BADGES = {
  bex_admin: { label: 'Platform Root', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  company_admin: { label: 'Tenant Admin', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  driver: { label: 'Driver', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  maintenance_officer: { label: 'Service Lead', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  account_manager: { label: 'Finance Lead', cls: 'bg-purple-50 text-purple-700 border-purple-200' }
};

export async function initGlobalUsers() {
  const profile = await getUserProfile();
  if (!profile) return;

  const fullName = profile.full_name || 'Bex Administrator';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'BX';

  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;

  await loadUsers();

  document.getElementById('gu-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById('gu-role-filter')?.addEventListener('change', (e) => {
    activeRole = e.target.value;
    render();
  });
}

async function loadUsers() {
  const [profilesRes, orgsRes] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('organizations').select('id, name, company_code')
  ]);

  if (profilesRes.error) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(profilesRes.error.message)}</td></tr>`;
    return;
  }

  users = profilesRes.data || [];
  orgMap = Object.fromEntries((orgsRes.data || []).map(o => [o.id, o]));
  render();
}

function render() {
  let list = users;
  if (activeRole !== 'all') {
    list = list.filter(u => u.role === activeRole);
  }
  if (searchTerm) {
    list = list.filter(u =>
      (u.full_name || '').toLowerCase().includes(searchTerm) ||
      (u.email || '').toLowerCase().includes(searchTerm) ||
      (u.phone_number || '').toLowerCase().includes(searchTerm)
    );
  }

  document.getElementById('gu-count').textContent = `Showing ${list.length} of ${users.length} registered platform users`;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No users registered on the platform.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs">No matching user records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => {
    const org = u.organization_id ? orgMap[u.organization_id] : null;
    const badge = ROLE_BADGES[u.role] || { label: u.role || 'Member', cls: 'bg-slate-100 text-slate-600' };

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4">
          <div class="flex items-center gap-2.5">
            <img alt="Avatar" class="w-7 h-7 rounded-full object-cover border border-slate-200" src="${avatarDataUri(u.full_name)}"/>
            <div>
              <span class="font-bold text-slate-900 block">${escapeHtml(u.full_name || 'Unnamed')}</span>
              <span class="font-mono text-[10px] text-slate-400 block">${escapeHtml(u.email || '—')}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          ${org ? `
            <span class="font-bold text-slate-800 block">${escapeHtml(org.name)}</span>
            <span class="font-mono text-[10px] text-teal-700 font-semibold block">${escapeHtml(org.company_code || 'TC')}</span>
          ` : `<span class="text-rose-600 font-bold text-xs">Platform Core</span>`}
        </td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${badge.cls}">
            ${badge.label}
          </span>
        </td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center gap-1 font-bold text-emerald-600 text-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Verified
          </span>
        </td>
        <td class="py-3 px-4 text-right font-mono text-slate-400">${formatDate(u.created_at)}</td>
      </tr>`;
  }).join('');
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Bex Admin Console?')) performLogout();
});