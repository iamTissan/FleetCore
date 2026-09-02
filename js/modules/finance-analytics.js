/**
 * FINANCE-ANALYTICS.JS — Historical Cohort Modeling, Financial Trends, and Data Exports (CSV & PDF).
 */
import { supabase, getUserProfile, escapeHtml } from '../config.js';
import { showToast, performLogout } from '../auth.js';

let cohortData = [];
let currentOrg = null;

const tbody = document.getElementById('cohort-tbody');
if (tbody) initFinanceAnalytics();

export async function initFinanceAnalytics() {
  const profile = await getUserProfile();
  if (!profile) return;

  const fullName = profile.full_name || 'Finance Manager';
  const initials = fullName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'FM';

  const headerName = document.getElementById('header-user-name');
  const headerAvatar = document.getElementById('header-avatar');
  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) headerAvatar.textContent = initials;

  // Load Organization Name
  if (profile.organization_id) {
    const { data: org } = await supabase.from('organizations').select('name, company_code').eq('id', profile.organization_id).single();
    if (org) {
      currentOrg = org;
      const orgNameEl = document.getElementById('header-org-name');
      const sidebarTitle = document.getElementById('sidebar-org-title');
      const printOrg = document.getElementById('print-org-name');
      if (orgNameEl) orgNameEl.textContent = org.name;
      if (sidebarTitle) sidebarTitle.textContent = org.name;
      if (printOrg) printOrg.textContent = org.name;
    }
  }

  const printTime = document.getElementById('print-timestamp');
  if (printTime) printTime.textContent = new Date().toLocaleString('en-NG');

  await loadAnalyticsLedger();

  document.getElementById('btn-export-csv')?.addEventListener('click', exportLedgerToCSV);
  document.getElementById('btn-export-pdf')?.addEventListener('click', exportLedgerToPDF);
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if (confirm('Sign out from Finance Analytics?')) performLogout();
  });
}

async function loadAnalyticsLedger() {
  try {
    const [invoicesRes, fuelRes, woRes] = await Promise.all([
      supabase.from('invoices').select('amount, status, created_at, paid_at'),
      supabase.from('fuel_logs').select('total_cost, liters, created_at'),
      supabase.from('work_orders').select('cost_naira, created_at')
    ]);

    const invoices = invoicesRes.data || [];
    const fuelLogs = fuelRes.data || [];
    const workOrders = woRes.data || [];

    // Group into 6 monthly cohorts
    cohortData = generateMonthlyCohorts(6);

    // Distribute data into cohorts
    invoices.forEach(inv => {
      const d = new Date(inv.created_at || inv.paid_at);
      const cohort = findCohort(d);
      if (cohort) {
        const amt = parseFloat(inv.amount || 0);
        cohort.invoiced += amt;
        if (inv.status === 'paid') cohort.revenue += amt;
        else cohort.pendingAR += amt;
      }
    });

    fuelLogs.forEach(f => {
      const d = new Date(f.created_at);
      const cohort = findCohort(d);
      if (cohort) {
        cohort.fuel += parseFloat(f.total_cost || 0);
      }
    });

    workOrders.forEach(w => {
      const d = new Date(w.created_at);
      const cohort = findCohort(d);
      if (cohort) {
        cohort.wo += parseFloat(w.cost_naira || 0);
      }
    });

    cohortData.forEach(c => {
      c.totalBurn = c.fuel + c.wo;
      c.netMargin = c.revenue - c.totalBurn;
      c.efficiency = c.revenue > 0 ? Math.round((c.netMargin / c.revenue) * 100) : 0;
    });

    renderCohortTable();
    renderTrendCards();

  } catch (err) {
    console.error('Failed to aggregate finance analytics:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-rose-500 font-bold">Error compiling trends: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function generateMonthlyCohorts(monthsCount) {
  const list = [];
  const now = new Date();
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    list.push({ key, label, invoiced: 0, revenue: 0, pendingAR: 0, fuel: 0, wo: 0, totalBurn: 0, netMargin: 0, efficiency: 0 });
  }
  return list;
}

function findCohort(dateObj) {
  if (isNaN(dateObj.getTime())) return null;
  const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
  return cohortData.find(c => c.key === key) || null;
}

function renderCohortTable() {
  if (!tbody) return;

  tbody.innerHTML = cohortData.slice().reverse().map(c => {
    const isProfitable = c.netMargin >= 0;
    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-bold text-slate-900">${c.label}</td>
        <td class="py-3 px-4 text-right font-mono text-slate-700">₦${c.invoiced.toLocaleString()}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-emerald-600">₦${c.revenue.toLocaleString()}</td>
        <td class="py-3 px-4 text-right font-mono text-amber-600">₦${c.fuel.toLocaleString()}</td>
        <td class="py-3 px-4 text-right font-mono text-blue-600">₦${c.wo.toLocaleString()}</td>
        <td class="py-3 px-4 text-right font-mono font-bold ${isProfitable ? 'text-teal-600' : 'text-rose-600'}">
          ₦${c.netMargin.toLocaleString()}
        </td>
        <td class="py-3 px-4 text-right">
          <span class="inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-full text-[11px] ${isProfitable ? 'bg-teal-50 text-teal-700 border border-teal-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'}">
            ${c.efficiency}%
          </span>
        </td>
      </tr>`;
  }).join('');
}

function renderTrendCards() {
  const count = cohortData.length || 1;
  const totalRev = cohortData.reduce((s, c) => s + c.revenue, 0);
  const totalBurn = cohortData.reduce((s, c) => s + c.totalBurn, 0);
  const totalPending = cohortData.reduce((s, c) => s + c.pendingAR, 0);
  const totalFuel = cohortData.reduce((s, c) => s + c.fuel, 0);
  const totalWO = cohortData.reduce((s, c) => s + c.wo, 0);

  const avgRev = totalRev / count;
  const avgBurn = totalBurn / count;
  const overallEfficiency = totalRev > 0 ? Math.round(((totalRev - totalBurn) / totalRev) * 100) : 0;

  document.getElementById('trend-avg-rev').textContent = `₦${Math.round(avgRev).toLocaleString()}`;
  document.getElementById('trend-avg-burn').textContent = `₦${Math.round(avgBurn).toLocaleString()}`;
  document.getElementById('trend-efficiency').textContent = `${overallEfficiency}%`;
  document.getElementById('trend-ar-load').textContent = `₦${Math.round(totalPending).toLocaleString()}`;

  // OpEx Distribution Bars
  const quarterTotal = totalFuel + totalWO;
  const fuelPct = quarterTotal > 0 ? Math.round((totalFuel / quarterTotal) * 100) : 50;
  const woPct = quarterTotal > 0 ? Math.round((totalWO / quarterTotal) * 100) : 50;

  document.getElementById('vol-fuel-val').textContent = `₦${totalFuel.toLocaleString()} (${fuelPct}%)`;
  document.getElementById('vol-wo-val').textContent = `₦${totalWO.toLocaleString()} (${woPct}%)`;
  document.getElementById('vol-fuel-bar').style.width = `${fuelPct}%`;
  document.getElementById('vol-wo-bar').style.width = `${woPct}%`;
}

/**
 * EXPORT 1: Clean, structured RFC-4180 CSV
 */
function exportLedgerToCSV() {
  if (cohortData.length === 0) {
    showToast('No financial data available to export.', 'error');
    return;
  }

  const headers = ['Period', 'Gross_Invoiced_NGN', 'Settled_Revenue_NGN', 'Fuel_OpEx_NGN', 'Workshop_Spend_NGN', 'Total_Burn_NGN', 'Net_Margin_NGN', 'Efficiency_Percent'];
  const rows = cohortData.map(c => [
    `"${c.label}"`,
    c.invoiced,
    c.revenue,
    c.fuel,
    c.wo,
    c.totalBurn,
    c.netMargin,
    `${c.efficiency}%`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  const filename = `FleetCore_Financial_Audit_${currentOrg?.company_code || 'FC'}_${new Date().toISOString().substring(0, 10)}.csv`;

  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Financial CSV manifest exported successfully.', 'success');
}

/**
 * EXPORT 2: Corporate PDF Report
 */
function exportLedgerToPDF() {
  const printTimestamp = document.getElementById('print-timestamp');
  if (printTimestamp) printTimestamp.textContent = new Date().toLocaleString('en-NG');
  
  // Triggers browser native print window styled by `@media print`
  window.print();
}