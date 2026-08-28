/**
 * FINANCE-INVOICING.JS — Client invoicing for Account Manager.
 * Real public.invoices CRUD, with paid/overdue status transitions.
 */
import { supabase, getUserProfile, formatDate, formatNaira, daysUntil, escapeHtml, statusBadge } from '../config.js';
import { showToast } from '../auth.js';

const STATUS_MAP = {
  pending: { label: 'Pending', cls: 'bg-warning-amber/10 text-warning-amber' },
  paid: { label: 'Paid', cls: 'bg-secondary-container/20 text-secondary' },
  overdue: { label: 'Overdue', cls: 'bg-error-container text-error' },
  cancelled: { label: 'Cancelled', cls: 'bg-surface-container-high text-on-surface-variant' },
};

let orgId = null;
let invoices = [];
const tbody = document.getElementById('inv-tbody');
if (tbody) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadTripsForModal();
  await loadInvoices();

  document.getElementById('btn-new-invoice')?.addEventListener('click', () => document.getElementById('inv-modal').classList.remove('hidden'));
  document.getElementById('inv-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('inv-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('inv-modal-backdrop')?.addEventListener('click', closeModal);
  document.getElementById('inv-form')?.addEventListener('submit', onCreate);
  tbody.addEventListener('click', onTableClick);
}

function closeModal() {
  document.getElementById('inv-modal')?.classList.add('hidden');
  document.getElementById('inv-form')?.reset();
}

async function loadTripsForModal() {
  const { data } = await supabase.from('trips').select('id, origin, destination').eq('organization_id', orgId).eq('status', 'completed').order('created_at', { ascending: false }).limit(50);
  const select = document.getElementById('inv-trip');
  if (select && data) {
    select.innerHTML = '<option value="">No specific trip</option>' + data.map(t => `<option value="${t.id}">${escapeHtml(t.origin || '—')} → ${escapeHtml(t.destination || '—')}</option>`).join('');
  }
}

async function loadInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, trip:trips(origin, destination)')
    .eq('organization_id', orgId)
    .order('issued_at', { ascending: false });

  const tableWrap = tbody.closest('.bg-surface-container-lowest');
  const empty = document.getElementById('inv-empty');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  invoices = data || [];

  // Auto-flag overdue (real logic, not fabricated): pending + due_date passed.
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
    <tr class="border-t border-border-light hover:bg-surface-container-low transition-colors" data-id="${i.id}">
      <td class="px-md py-sm font-body-sm text-body-sm text-on-surface font-medium">${escapeHtml(i.client_name)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${i.trip ? escapeHtml(i.trip.origin || '—') + ' → ' + escapeHtml(i.trip.destination || '—') : '—'}</td>
      <td class="px-md py-sm font-mono-data text-mono-data text-on-surface">${formatNaira(i.amount_naira)}</td>
      <td class="px-md py-sm">${statusBadge(i.status, STATUS_MAP)}</td>
      <td class="px-md py-sm font-body-sm text-body-sm text-text-muted">${i.due_date ? formatDate(i.due_date) : '—'}</td>
      <td class="px-md py-sm text-right">
        ${i.status !== 'paid' && i.status !== 'cancelled' ? `<button class="text-secondary hover:underline font-label-sm text-label-sm" data-action="mark-paid">Mark Paid</button>` : ''}
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
  if (error) { showToast(error.message, 'error'); return; }
  invoice.status = 'paid';
  render();
  showToast(`Invoice for ${invoice.client_name} marked paid.`, 'success');
}

async function onCreate(e) {
  e.preventDefault();
  const btn = document.getElementById('inv-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';

  const payload = {
    organization_id: orgId,
    client_name: document.getElementById('inv-client').value.trim(),
    trip_id: document.getElementById('inv-trip').value || null,
    amount_naira: Number(document.getElementById('inv-amount').value),
    due_date: document.getElementById('inv-due-date').value || null,
    status: 'pending',
  };

  const { error } = await supabase.from('invoices').insert(payload);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }

  showToast('Invoice created.', 'success');
  closeModal();
  await loadInvoices();
}
