/**
 * ADMIN-DISPATCH.JS — Fully wired trip dispatch board for Company Admin.
 * No mock trips. Reads/writes public.trips, scoped by RLS to the
 * signed-in admin's organization_id. Kanban columns map to real trip
 * status values; "Issues" surfaces cancelled trips and any trip with an
 * open incident attached.
 */
import { supabase, getUserProfile, formatDate, escapeHtml, avatarDataUri } from '../config.js';
import { showToast } from '../auth.js';

let orgId = null;
let trips = [];
let vehicles = [];
let drivers = [];
let incidentTripIds = new Set();

const board = document.getElementById('col-pending');
if (board) init();

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;
  orgId = profile.organization_id;

  await Promise.all([loadVehicles(), loadDrivers()]);
  await loadTrips();

  document.querySelectorAll('.fc-create-trip-btn').forEach(btn => btn.addEventListener('click', openCreateModal));
  document.getElementById('trip-modal-close')?.addEventListener('click', closeCreateModal);
  document.getElementById('trip-modal-backdrop')?.addEventListener('click', closeCreateModal);
  document.getElementById('trip-cancel-btn')?.addEventListener('click', closeCreateModal);
  document.getElementById('trip-form')?.addEventListener('submit', onCreateSubmit);

  document.getElementById('trip-actions-close')?.addEventListener('click', closeActionsModal);
  document.getElementById('trip-actions-backdrop')?.addEventListener('click', closeActionsModal);

  ['col-pending', 'col-transit', 'col-completed', 'col-issues'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', onCardClick);
  });
}

async function loadVehicles() {
  const { data } = await supabase.from('vehicles').select('id, plate_number').eq('organization_id', orgId).order('plate_number');
  vehicles = data || [];
  const select = document.getElementById('trip-vehicle');
  if (select) select.innerHTML = vehicles.length
    ? vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.plate_number)}</option>`).join('')
    : `<option value="">No vehicles yet — add one first</option>`;
}

async function loadDrivers() {
  const { data } = await supabase.from('profiles').select('id, full_name').eq('organization_id', orgId).eq('role', 'driver').eq('status', 'active').order('full_name');
  drivers = data || [];
  const select = document.getElementById('trip-driver');
  if (select) select.innerHTML = drivers.length
    ? drivers.map(d => `<option value="${d.id}">${escapeHtml(d.full_name || 'Unnamed driver')}</option>`).join('')
    : `<option value="">No active drivers yet — add one first</option>`;
}

async function loadTrips() {
  ['col-pending', 'col-transit', 'col-completed', 'col-issues'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="p-md text-center text-text-muted font-body-sm">Loading…</div>`;
  });

  const [tripsRes, incidentsRes] = await Promise.all([
    supabase.from('trips').select('*, vehicle:vehicles(id, plate_number), driver:profiles(id, full_name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
    supabase.from('incidents').select('trip_id').eq('organization_id', orgId).not('trip_id', 'is', null).in('status', ['open', 'investigating']),
  ]);

  if (tripsRes.error) {
    document.getElementById('col-pending').innerHTML = `<div class="p-md text-center text-error font-body-sm">Failed to load trips: ${escapeHtml(tripsRes.error.message)}</div>`;
    return;
  }

  trips = tripsRes.data || [];
  incidentTripIds = new Set((incidentsRes.data || []).map(i => i.trip_id));
  render();
}

function render() {
  const buckets = { pending: [], transit: [], completed: [], issues: [] };
  trips.forEach(t => {
    if (t.status === 'cancelled' || incidentTripIds.has(t.id)) buckets.issues.push(t);
    else if (t.status === 'pending') buckets.pending.push(t);
    else if (t.status === 'in_progress') buckets.transit.push(t);
    else if (t.status === 'completed') buckets.completed.push(t);
  });

  setCount('count-pending', buckets.pending.length);
  setCount('count-transit', buckets.transit.length);
  setCount('count-completed', buckets.completed.length);
  setCount('count-issues', buckets.issues.length);

  fillColumn('col-pending', buckets.pending, 'No pending trips.');
  fillColumn('col-transit', buckets.transit, 'Nothing in transit right now.');
  fillColumn('col-completed', buckets.completed, 'No completed trips yet.');
  fillColumn('col-issues', buckets.issues, 'No issues. Good.');
}

function setCount(id, n) { const el = document.getElementById(id); if (el) el.textContent = n; }

function fillColumn(colId, list, emptyText) {
  const col = document.getElementById(colId);
  if (!col) return;
  if (list.length === 0) {
    col.innerHTML = `<div class="p-md text-center text-text-muted font-body-sm border border-dashed border-border-light rounded-xl">${escapeHtml(emptyText)}</div>`;
    return;
  }
  col.innerHTML = list.map(cardHtml).join('');
}

function cardHtml(t) {
  const hasIssue = incidentTripIds.has(t.id);
  return `<div class="kanban-card bg-surface-container-lowest border border-border-light rounded-xl p-md cursor-pointer" data-id="${t.id}">
    <div class="flex items-center justify-between mb-2">
      <span class="plate-tag">${t.vehicle ? escapeHtml(t.vehicle.plate_number) : 'No vehicle'}</span>
      ${hasIssue ? '<span class="material-symbols-outlined text-danger-red" style="font-size:18px;" title="Open incident">warning</span>' : ''}
    </div>
    <div class="font-label-md text-label-md text-on-surface mb-1">${escapeHtml(t.origin || '—')} → ${escapeHtml(t.destination || '—')}</div>
    <div class="flex items-center gap-xs mt-2">
      <img alt="Driver profile" class="w-5 h-5 rounded-full object-cover border border-border-light" src="${avatarDataUri(t.driver?.full_name)}"/>
      <span class="font-body-sm text-body-sm text-on-surface-variant">${t.driver ? escapeHtml(t.driver.full_name || 'Unnamed driver') : 'Unassigned'}</span>
    </div>
    <div class="font-body-sm text-xs text-text-muted mt-2">${t.scheduled_at ? formatDate(t.scheduled_at) : 'No schedule set'}</div>
  </div>`;
}

function onCardClick(e) {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  const trip = trips.find(t => t.id === card.getAttribute('data-id'));
  if (trip) openActionsModal(trip);
}

function openActionsModal(trip) {
  const modal = document.getElementById('trip-actions-modal');
  document.getElementById('trip-actions-title').textContent = `${trip.origin || '—'} → ${trip.destination || '—'}`;
  const buttonsEl = document.getElementById('trip-actions-buttons');

  const actions = [];
  if (trip.status === 'pending') {
    actions.push({ label: 'Start Trip', next: 'in_progress', cls: 'bg-primary-container text-on-primary hover:opacity-90' });
    actions.push({ label: 'Cancel Trip', next: 'cancelled', cls: 'bg-error-container text-error hover:opacity-90' });
  } else if (trip.status === 'in_progress') {
    actions.push({ label: 'Mark Completed', next: 'completed', cls: 'bg-secondary-container text-secondary hover:opacity-90' });
    actions.push({ label: 'Cancel Trip', next: 'cancelled', cls: 'bg-error-container text-error hover:opacity-90' });
  } else if (trip.status === 'cancelled') {
    actions.push({ label: 'Reopen as Pending', next: 'pending', cls: 'bg-primary-container text-on-primary hover:opacity-90' });
  }

  buttonsEl.innerHTML = actions.length
    ? actions.map(a => `<button class="w-full px-md py-sm rounded-lg font-label-md text-label-md transition-opacity ${a.cls}" data-next="${a.next}">${a.label}</button>`).join('')
    : `<p class="font-body-sm text-body-sm text-text-muted">This trip is completed — no further actions.</p>`;

  buttonsEl.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => updateTripStatus(trip, btn.getAttribute('data-next')));
  });

  modal.classList.remove('hidden');
}

function closeActionsModal() {
  document.getElementById('trip-actions-modal')?.classList.add('hidden');
}

async function updateTripStatus(trip, next) {
  const payload = { status: next };
  if (next === 'in_progress') payload.started_at = new Date().toISOString();
  if (next === 'completed') payload.completed_at = new Date().toISOString();

  const { error } = await supabase.from('trips').update(payload).eq('id', trip.id);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Trip updated.', 'success');
  closeActionsModal();
  await loadTrips();
}

function openCreateModal() {
  document.getElementById('trip-modal')?.classList.remove('hidden');
}
function closeCreateModal() {
  document.getElementById('trip-modal')?.classList.add('hidden');
  document.getElementById('trip-form')?.reset();
}

async function onCreateSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('trip-save-btn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creating…';

  const profile = await getUserProfile();
  const payload = {
    organization_id: orgId,
    origin: document.getElementById('trip-origin').value.trim(),
    destination: document.getElementById('trip-destination').value.trim(),
    vehicle_id: document.getElementById('trip-vehicle').value || null,
    driver_id: document.getElementById('trip-driver').value || null,
    scheduled_at: document.getElementById('trip-scheduled').value || null,
    notes: document.getElementById('trip-notes').value.trim() || null,
    status: 'pending',
    created_by: profile?.id || null,
  };

  if (!payload.origin || !payload.destination) {
    showToast('Origin and destination are required.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }
  if (!payload.vehicle_id || !payload.driver_id) {
    showToast('Select a vehicle and driver to dispatch this trip.', 'error');
    btn.disabled = false; btn.textContent = original;
    return;
  }

  const { error } = await supabase.from('trips').insert(payload);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }

  showToast('Trip created.', 'success');
  closeCreateModal();
  await loadTrips();
}
