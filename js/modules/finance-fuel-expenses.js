/**
 * FINANCE-FUEL-EXPENSES.JS — Full fuel expense log for Account Manager.
 */
import { supabase, getUserProfile, formatNaira, formatDate, escapeHtml, avatarDataUri } from '../config.js';

const tbody = document.getElementById('fe-tbody');
if (tbody) init();

let orgId = null;
let logs = [];
let searchTerm = '';
let activeFilter = 'all';

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await load();

  document.getElementById('fe-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('bg-surface-container-lowest', 'shadow-sm', 'text-on-surface'));
      btn.classList.add('bg-surface-container-lowest', 'shadow-sm', 'text-on-surface');
      render();
    });
  });
  document.getElementById('btn-log-fuel')?.addEventListener('click', () => { window.location.href = '../driver/fuel-log.html'; });
}

async function load() {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('fuel_logs')
    .select('*, vehicle:vehicles(plate_number), driver:profiles(full_name)')
    .eq('organization_id', orgId)
    .order('logged_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-lg text-center text-error font-body-sm px-md">Failed to load: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  logs = data || [];

  const mtdLogs = logs.filter(l => new Date(l.logged_at) >= monthStart);
  const totalCost = mtdLogs.reduce((s, l) => s + Number(l.amount_naira || 0), 0);
  const totalLitres = mtdLogs.reduce((s, l) => s + Number(l.litres || 0), 0);
  document.getElementById('fe-total-cost').textContent = formatNaira(totalCost);
  document.getElementById('fe-total-litres').textContent = `${totalLitres.toLocaleString('en-NG')} L`;
  document.getElementById('fe-avg-cost').textContent = totalLitres > 0 ? formatNaira(totalCost / totalLitres) : '₦0';
  document.getElementById('fe-flagged-count').textContent = logs.filter(l => l.status === 'flagged').length;

  render();
}

function render() {
  let list = logs;
  if (activeFilter === 'flagged') list = list.filter(l => l.status === 'flagged');
  if (searchTerm) {
    list = list.filter(l =>
      (l.vehicle?.plate_number || '').toLowerCase().includes(searchTerm) ||
      (l.station_name || '').toLowerCase().includes(searchTerm)
    );
  }

  document.getElementById('fe-count').textContent = `Showing ${list.length} of ${logs.length} entries`;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-lg text-center text-text-muted font-body-sm px-md">No fuel logs yet. Drivers will submit these from the mobile app.</td></tr>`;
    return;
  }
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-lg text-center text-text-muted font-body-sm px-md">No matches.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr class="border-b border-border-light hover:bg-surface-container-low transition-colors duration-150 group ${l.status === 'flagged' ? 'bg-error-container/10' : ''}">
      <td class="px-md py-sm whitespace-nowrap text-text-muted">${formatDate(l.logged_at)}</td>
      <td class="px-md py-sm">
        <div class="inline-flex items-center justify-center bg-surface-container-high border border-border-light rounded px-2 py-0.5 font-mono-data text-mono-data text-on-surface">${l.vehicle ? escapeHtml(l.vehicle.plate_number) : '—'}</div>
      </td>
      <td class="px-md py-sm">
        <div class="flex items-center gap-xs">
          <img alt="Driver" class="w-6 h-6 rounded-full object-cover" src="${avatarDataUri(l.driver?.full_name)}"/>
          <span class="truncate">${escapeHtml(l.driver?.full_name || 'Unknown')}</span>
        </div>
      </td>
      <td class="px-md py-sm">${escapeHtml(l.station_name || '—')}</td>
      <td class="px-md py-sm text-right font-medium">${l.litres} L</td>
      <td class="px-md py-sm text-right font-mono-data text-mono-data font-semibold">${formatNaira(l.amount_naira)}</td>
      <td class="px-md py-sm text-center">
        ${l.receipt_url ? `<a class="w-8 h-8 mx-auto bg-surface-container-low rounded border border-border-light flex items-center justify-center text-primary hover:bg-primary-container transition-colors" href="${l.receipt_url}" target="_blank" title="View receipt"><span class="material-symbols-outlined text-[18px]">receipt_long</span></a>` : `<span class="text-text-muted text-xs">—</span>`}
      </td>
    </tr>`).join('');
}
