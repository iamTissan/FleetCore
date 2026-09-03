/**
 * FINANCE-INVOICES.JS — Invoice Ledger Controller matching FleetCore Standard Design.
 */
import { supabase, getUserProfile, formatDate, escapeHtml, statusBadge } from '../config.js';
import { showToast, performLogout } from '../auth.js';

let invoices = [];
let currentOrg = null;
let searchTerm = '';
let statusFilter = 'all';

const tbody = document.getElementById('invoices-tbody');
if (tbody) initFinanceInvoices();

export async function initFinanceInvoices() {
  const profile = await getUserProfile();
  if (!profile) return;

  const fullName = profile.full_name || 'Account Manager';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AM';

  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarInitial = document.getElementById('sidebar-initial');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarInitial) sidebarInitial.textContent = initials;

  if (profile.organization_id) {
    const { data: org } = await supabase.from('organizations').select('name, company_code').eq('id', profile.organization_id).single();
    if (org) {
      currentOrg = org;
      const sidebarOrg = document.getElementById('sidebar-org-name');
      if (sidebarOrg) sidebarOrg.textContent = org.name;
    }
  }

  await loadInvoices();

  document.getElementById('inv-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderTable();
  });

  document.getElementById('inv-status-filter')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    renderTable();
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', exportInvoicesCSV);
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => window.print());
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Sign out from Finance Console?')) performLogout();
  });
}

async function loadInvoices() {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, trip:trips(destination)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    invoices = data || [];
    renderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-rose-500 font-bold">Failed to load invoices: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable() {
  let list = invoices;
  if (statusFilter !== 'all') {
    list = list.filter(i => i.status === statusFilter);
  }
  if (searchTerm) {
    list = list.filter(i => 
      (i.invoice_number || '').toLowerCase().includes(searchTerm) ||
      (i.trip?.destination || '').toLowerCase().includes(searchTerm)
    );
  }

  const countEl = document.getElementById('inv-count');
  if (countEl) countEl.textContent = `Showing ${list.length} of ${invoices.length} invoices`;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-slate-400">No invoices match selected criteria.</td></tr>`;
    return;
  }

  const INVOICE_STATUS = {
    paid: { label: 'Settled', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold' },
    unpaid: { label: 'Overdue', cls: 'bg-rose-50 text-rose-700 border border-rose-200/60 font-semibold' },
    pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border border-amber-200/60 font-semibold' }
  };

  tbody.innerHTML = list.map(inv => `
    <tr class="hover:bg-slate-50/70 transition-colors">
      <td class="py-3.5 px-5 font-mono font-bold text-slate-900">${escapeHtml(inv.invoice_number || inv.id.substring(0, 8))}</td>
      <td class="py-3.5 px-5 text-slate-700 font-medium">${escapeHtml(inv.trip?.destination || 'Dedicated Freight')}</td>
      <td class="py-3.5 px-5 text-right font-mono font-bold text-slate-900">₦${parseFloat(inv.amount || 0).toLocaleString()}</td>
      <td class="py-3.5 px-5">${statusBadge(inv.status, INVOICE_STATUS)}</td>
      <td class="py-3.5 px-5 text-slate-500 font-medium">${inv.due_date ? formatDate(inv.due_date) : 'Immediate'}</td>
      <td class="py-3.5 px-5 text-right no-print">
        ${inv.status !== 'paid' ? `
          <button type="button" onclick="settleInvoice('${inv.id}')" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
            Mark Paid
          </button>
        ` : `<span class="text-xs font-semibold text-slate-400">Reconciled</span>`}
      </td>
    </tr>`).join('');
}

window.settleInvoice = async function(id) {
  if (!confirm('Mark invoice as settled/paid?')) return;
  const { error } = await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Invoice marked as settled.', 'success');
  await loadInvoices();
};

function exportInvoicesCSV() {
  if (invoices.length === 0) {
    showToast('No invoice records to export.', 'error');
    return;
  }
  const headers = ['Invoice_Number', 'Destination', 'Amount_NGN', 'Status', 'Due_Date', 'Created_At'];
  const rows = invoices.map(i => [
    `"${i.invoice_number || i.id.substring(0, 8)}"`,
    `"${i.trip?.destination || 'General Freight'}"`,
    parseFloat(i.amount || 0),
    i.status,
    i.due_date || '',
    i.created_at
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `Invoices_${currentOrg?.company_code || 'FC'}_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Invoice CSV exported successfully.', 'success');
}