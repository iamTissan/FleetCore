/**
 * FINANCE-INVOICING.JS — Client invoicing, payments status, and overdue transitions.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, statusBadge } from '../config.js';
import { showToast, performLogout } from '../auth.js';

const STATUS_MAP = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  paid: { label: 'Settled', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
  overdue: { label: 'Overdue', cls: 'bg-rose-50 text-rose-700 border-rose-200/60' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

let orgId = null;
let invoices = [];
const tbody = document.getElementById('inv-tbody');
if (tbody) initInvoicing();

export async function initInvoicing() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  const fullName = profile.full_name || 'Account Manager';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AM';
  
  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarInitial = document.getElementById('sidebar-initial');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarInitial) sidebarInitial.textContent = initials;

  let orgName = 'TransCore Logistics';
  if (orgId) {
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle();
    if (org?.name) orgName = org.name;
  }
  document.querySelectorAll('#fc-org-name').forEach(el => el.textContent = orgName);

  await loadTripsForModal();
  await loadInvoices();

  document.getElementById('btn-new-invoice')?.addEventListener('click', () => document.getElementById('inv-modal')?.classList.remove('hidden'));
  document.getElementById('inv-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('inv-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('inv-form')?.addEventListener('submit', onCreate);
  tbody.addEventListener('click', onTableClick);
}

function closeModal() {
  document.getElementById('inv-modal')?.classList.add('hidden');
  document.getElementById('inv-form')?.reset();
}

async function loadTripsForModal() {
  const { data } = await supabase
    .from('trips')
    .select('id, origin, destination')
    .eq('organization_id', orgId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);

  const select = document.getElementById('inv-trip');
  if (select && data) {
    select.innerHTML = '<option value="">Standard Contract (No specific trip linked)</option>' + 
      data.map(t => `<option value="${t.id}">${escapeHtml(t.origin || 'Base')} → ${escapeHtml(t.destination || 'Target')}</option>`).join('');
  }
}

async function loadInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, trip:trips(origin, destination)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-white');
  const empty = document.getElementById('inv-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-rose-500 text-xs font-bold">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  invoices = data || [];

  const today = new Date().toISOString().slice(0, 10);
  const toFlag = invoices.filter(i => i.status === 'pending' && i.due_date && i.due_date < today);
  if (toFlag.length) {
    await supabase.from('invoices').update({ status: 'overdue' }).in('id', toFlag.map(i => i.id));
    toFlag.forEach(i => { i.status = 'overdue'; });
  }

  if (invoices.length === 0) {
    tableWrap.classList.add('hidden');
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tableWrap.classList.remove('hidden');
  render();
}

function render() {
  tbody.innerHTML = invoices.map(i => `
    <tr class="hover:bg-slate-50 transition-colors" data-id="${i.id}">
      <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(i.client_name)}</td>
      <td class="py-3 px-4 text-slate-500">${i.trip ? escapeHtml(i.trip.origin || 'Base') + ' → ' + escapeHtml(i.trip.destination || 'Target') : '<span class="italic text-slate-400">Direct Contract</span>'}</td>
      <td class="py-3 px-4 font-mono font-bold text-slate-900">${formatNaira(i.amount_naira || 0)}</td>
      <td class="py-3 px-4">${statusBadge(i.status, STATUS_MAP)}</td>
      <td class="py-3 px-4 font-mono text-slate-500">${i.due_date ? formatDate(i.due_date) : '—'}</td>
      <td class="py-3 px-4 text-right">
        ${i.status !== 'paid' && i.status !== 'cancelled' ? `
          <button class="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition" data-action="mark-paid">
            Mark Paid
          </button>` : `<span class="text-xs text-slate-400 font-medium">Archived</span>`}
      </td>
    </tr>`).join('');
}

async function onTableClick(e) {
  const btn = e.target.closest('[data-action="mark-paid"]');
  if (!btn) return;
  const id = btn.closest('tr[data-id]')?.getAttribute('data-id');
  const invoice = invoices.find(i => i.id === id);
  if (!invoice) return;

  const { error } = await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  if (error) { 
    showToast(error.message, 'error'); 
    return; 
  }
  
  invoice.status = 'paid';
  render();
  showToast(`Invoice for ${invoice.client_name} marked settled.`, 'success');
}

async function onCreate(e) {
  e.preventDefault();
  const btn = document.getElementById('inv-save-btn');
  const original = btn.textContent;
  btn.disabled = true; 
  btn.textContent = 'Issuing...';

  const payload = {
    organization_id: orgId,
    client_name: document.getElementById('inv-client').value.trim(),
    trip_id: document.getElementById('inv-trip').value || null,
    amount_naira: Number(document.getElementById('inv-amount').value),
    due_date: document.getElementById('inv-due-date').value || null,
    status: 'pending',
  };

  const { error } = await supabase.from('invoices').insert(payload);
  btn.disabled = false; 
  btn.textContent = original;

  if (error) { 
    showToast(error.message, 'error'); 
    return; 
  }

  showToast('Client invoice created.', 'success');
  closeModal();
  await loadInvoices();
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Sign out from Finance Console?')) performLogout();
});