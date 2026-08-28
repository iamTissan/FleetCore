/**
 * ADMIN-INCIDENTS.JS — Fully wired incident triage for Company Admin.
 * Reads/writes public.incidents. Only shows fields that actually exist
 * in the schema — no fabricated cargo values, telemetry, or automation
 * events that FleetCore doesn't actually track.
 */
import { supabase, getUserProfile, timeAgo, formatDate, escapeHtml, avatarDataUri } from '../config.js';
import { showToast } from '../auth.js';

const TYPE_LABELS = { road: 'Road', health: 'Health', mechanical: 'Mechanical', security: 'Security', other: 'Other' };
const SEVERITY_CLS = {
  low: 'bg-surface-container-high text-on-surface-variant',
  medium: 'bg-warning-amber/10 text-warning-amber',
  high: 'bg-error-container/50 text-error',
  critical: 'bg-error-container text-on-error-container',
};

let orgId = null;
let incidents = [];
let selectedId = null;
let searchTerm = '';

const queue = document.getElementById('incidents-queue');
if (queue) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await loadIncidents();

  document.getElementById('incidents-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderQueue();
  });
}

async function loadIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*, driver:profiles(id, full_name), vehicle:vehicles(id, plate_number, make, model)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    queue.innerHTML = `<div class="p-md text-center text-error font-body-sm">Failed to load incidents: ${escapeHtml(error.message)}</div>`;
    return;
  }
  incidents = data || [];
  renderQueue();
}

function renderQueue() {
  const openCount = incidents.filter(i => i.status !== 'resolved').length;
  const criticalCount = incidents.filter(i => i.status !== 'resolved' && i.severity === 'critical').length;
  document.getElementById('incidents-critical-count').textContent = criticalCount;
  document.getElementById('incidents-critical-badge').classList.toggle('hidden', criticalCount === 0);
  const updatedLabel = document.getElementById('incidents-updated-label');
  if (updatedLabel) updatedLabel.textContent = `${openCount} open`;

  let list = incidents;
  if (searchTerm) {
    list = list.filter(i =>
      (i.vehicle?.plate_number || '').toLowerCase().includes(searchTerm) ||
      (i.driver?.full_name || '').toLowerCase().includes(searchTerm)
    );
  }

  if (incidents.length === 0) {
    queue.innerHTML = `<div class="p-lg text-center text-text-muted border border-dashed border-border-light rounded-xl"><span class="material-symbols-outlined block mx-auto mb-xs" style="font-size:28px;">check_circle</span><span class="font-body-sm text-body-sm">No incidents reported. Fleet is clear.</span></div>`;
    return;
  }
  if (list.length === 0) {
    queue.innerHTML = `<div class="p-md text-center text-text-muted font-body-sm">No matches for that search.</div>`;
    return;
  }

  queue.innerHTML = list.map(cardHtml).join('');
  queue.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => selectIncident(btn.getAttribute('data-id'))));
}

function cardHtml(i) {
  const isSelected = i.id === selectedId;
  const isOpen = i.status !== 'resolved';
  return `<button class="w-full text-left bg-surface-container-lowest border ${isSelected ? 'border-primary shadow-[0px_4px_12px_rgba(37,99,235,0.08)]' : 'border-border-light'} rounded-lg p-md relative overflow-hidden transition-all group" data-id="${i.id}">
    <div class="absolute left-0 top-0 bottom-0 w-1 ${isOpen ? (i.severity === 'critical' || i.severity === 'high' ? 'bg-danger-red' : 'bg-warning-amber') : 'bg-secondary'}"></div>
    <div class="flex justify-between items-start mb-sm">
      <div class="flex gap-2 items-center">
        <span class="${SEVERITY_CLS[i.severity] || SEVERITY_CLS.medium} font-label-sm text-label-sm px-2 py-0.5 rounded uppercase tracking-wider font-bold">${escapeHtml(TYPE_LABELS[i.incident_type] || i.incident_type || 'Incident')}</span>
      </div>
      <span class="font-mono-data text-mono-data text-text-muted">${escapeHtml(i.reference || '—')}</span>
    </div>
    <div class="flex items-center gap-3 mb-sm">
      <img alt="Driver" class="w-10 h-10 rounded-full object-cover" src="${avatarDataUri(i.driver?.full_name)}"/>
      <div>
        <div class="font-label-md text-label-md text-on-surface font-semibold">${escapeHtml(i.driver?.full_name || 'Unknown driver')}</div>
        <div class="font-body-sm text-body-sm text-text-muted">${i.vehicle ? escapeHtml(i.vehicle.plate_number) : 'No vehicle linked'}</div>
      </div>
    </div>
    <div class="mt-2 text-right font-label-sm text-label-sm ${isOpen ? 'text-danger-red font-semibold' : 'text-text-muted'}">${isOpen ? 'Open' : 'Resolved'} · ${timeAgo(i.created_at)}</div>
  </button>`;
}

function selectIncident(id) {
  selectedId = id;
  renderQueue();
  renderDetail();
}

function renderDetail() {
  const pane = document.getElementById('incident-detail-pane');
  const i = incidents.find(x => x.id === selectedId);
  if (!i) return;

  pane.innerHTML = `
    <div class="p-lg border-b border-border-light bg-background-subtle flex justify-between items-start">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <h2 class="font-headline-md text-headline-md text-on-surface">${escapeHtml(TYPE_LABELS[i.incident_type] || i.incident_type || 'Incident')} — ${escapeHtml(i.reference || '')}</h2>
          <span class="${i.status === 'resolved' ? 'bg-secondary-container/20 text-secondary' : 'bg-error-container text-on-error-container'} font-label-sm text-label-sm px-3 py-1 rounded-full uppercase tracking-wider font-bold">${escapeHtml(i.status)}</span>
        </div>
        <p class="font-body-md text-body-md text-text-muted">${escapeHtml(i.details || 'No details provided.')}</p>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-lg grid grid-cols-1 xl:grid-cols-2 gap-lg">
      <div class="space-y-lg">
        <div class="rounded-lg border border-border-light overflow-hidden h-56 relative bg-surface-container-high flex items-center justify-center text-text-muted font-body-sm">
          ${i.lat && i.lng
            ? `<div class="text-center"><span class="material-symbols-outlined block mx-auto mb-xs" style="font-size:28px;">location_on</span><span class="font-mono-data text-mono-data">${i.lat.toFixed(4)}° N, ${i.lng.toFixed(4)}° E</span><div class="text-xs mt-1">Live map rendering coming soon</div></div>`
            : `<div class="text-center"><span class="material-symbols-outlined block mx-auto mb-xs" style="font-size:28px;">location_off</span><span>No location reported for this incident</span></div>`}
        </div>
        <div class="grid grid-cols-2 gap-sm">
          <div class="bg-background-subtle border border-border-light p-md rounded-lg">
            <div class="font-label-sm text-label-sm text-text-muted mb-1">Vehicle</div>
            <div class="font-label-md text-label-md text-on-surface">${i.vehicle ? escapeHtml([i.vehicle.make, i.vehicle.model].filter(Boolean).join(' ') || '—') : 'Not linked'}</div>
            ${i.vehicle ? `<div class="font-mono-data text-mono-data text-primary bg-primary-fixed text-on-primary-fixed inline-block px-2 py-0.5 rounded mt-1 border border-primary-fixed-dim">${escapeHtml(i.vehicle.plate_number)}</div>` : ''}
          </div>
          <div class="bg-background-subtle border border-border-light p-md rounded-lg">
            <div class="font-label-sm text-label-sm text-text-muted mb-1">Severity</div>
            <div class="font-headline-md text-headline-md text-on-surface capitalize">${escapeHtml(i.severity || 'medium')}</div>
            <div class="font-body-sm text-body-sm text-text-muted">Reported ${formatDate(i.created_at)}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col h-full border border-border-light rounded-lg bg-background-subtle overflow-hidden">
        <div class="px-md py-sm border-b border-border-light bg-surface-container-lowest flex items-center justify-between">
          <h3 class="font-label-md text-label-md text-on-surface font-semibold">Status &amp; Resolution</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-md space-y-4">
          <div class="flex gap-md">
            <div class="w-6 h-6 rounded-full bg-danger-red flex-shrink-0 flex items-center justify-center border-2 border-surface-container-lowest z-10">
              <span class="material-symbols-outlined text-on-primary" style="font-size:12px;">priority_high</span>
            </div>
            <div>
              <div class="font-label-md text-label-md text-on-surface font-bold">Reported</div>
              <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${formatDate(i.created_at)} · ${timeAgo(i.created_at)}</p>
            </div>
          </div>
          ${i.resolution_notes ? `<div class="flex gap-md">
            <div class="w-6 h-6 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center border-2 border-surface-container-lowest z-10">
              <span class="material-symbols-outlined text-on-primary" style="font-size:12px;">check</span>
            </div>
            <div>
              <div class="font-label-md text-label-md text-on-surface font-bold">Resolution Note</div>
              <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${escapeHtml(i.resolution_notes)}</p>
            </div>
          </div>` : ''}
        </div>
        <div class="p-sm bg-surface-container-lowest border-t border-border-light">
          ${i.status !== 'resolved' ? `
            <label class="block font-label-sm text-label-sm text-text-muted mb-1 px-1">Resolution Note</label>
            <textarea class="w-full bg-background-subtle border border-border-light rounded-md text-body-sm p-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none" id="incident-note" placeholder="What happened, what was done…" rows="2"></textarea>
            <div class="flex gap-2 mt-2">
              ${i.status === 'open' ? `<button class="flex-1 bg-warning-amber/10 text-warning-amber font-label-md text-label-md py-2 rounded-lg hover:opacity-90 transition-opacity" id="btn-investigating">Mark Investigating</button>` : ''}
              <button class="flex-1 bg-secondary-container/20 text-secondary font-label-md text-label-md py-2 rounded-lg hover:opacity-90 transition-opacity" id="btn-resolve">Mark Resolved</button>
            </div>
          ` : `<p class="font-body-sm text-body-sm text-text-muted text-center">This incident is resolved.</p>`}
        </div>
      </div>
    </div>`;

  document.getElementById('btn-investigating')?.addEventListener('click', () => updateStatus(i, 'investigating'));
  document.getElementById('btn-resolve')?.addEventListener('click', () => updateStatus(i, 'resolved'));
}

async function updateStatus(incident, next) {
  const note = document.getElementById('incident-note')?.value.trim() || null;
  const payload = { status: next };
  if (note) payload.resolution_notes = note;

  const { error } = await supabase.from('incidents').update(payload).eq('id', incident.id);
  if (error) { showToast(error.message, 'error'); return; }

  showToast(`Incident marked ${next}.`, 'success');
  await loadIncidents();
  renderDetail();
}
