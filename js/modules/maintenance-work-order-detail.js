/**
 * MAINTENANCE-WORK-ORDER-DETAIL.JS — Single work order view/edit.
 * Reads ?id=<uuid> from the URL. Real fields only: service_type,
 * description, urgency, status, cost_naira, parts_notes,
 * before_photo_url, after_photo_url. No fake VAT/parts itemization.
 */
import { supabase, getUserProfile, formatDate, formatNaira, escapeHtml, uploadFile } from '../config.js';
import { showToast } from '../auth.js';

const content = document.getElementById('wod-content');
if (content) init();

let workOrderId = null;
let workOrder = null;

async function init() {
  const profile = await getUserProfile();
  if (!profile) return;

  workOrderId = new URLSearchParams(window.location.search).get('id');
  if (!workOrderId) {
    content.innerHTML = `<div class="text-center py-xl text-text-muted font-body-sm">No work order specified. <a class="text-primary underline" href="work-orders.html">Back to Work Orders</a></div>`;
    return;
  }

  await load();
}

async function load() {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, vehicle:vehicles(plate_number, make, model, year, odometer_km)')
    .eq('id', workOrderId)
    .single();

  if (error || !data) {
    content.innerHTML = `<div class="text-center py-xl text-error font-body-sm">Work order not found.</div>`;
    return;
  }

  workOrder = data;
  document.getElementById('wod-title-id').textContent = `Work Order — ${workOrder.service_type || 'Service'}`;
  render();
}

const STATUS_CLS = {
  open: 'bg-warning-amber/10 text-warning-amber', in_progress: 'bg-primary-fixed text-primary',
  completed: 'bg-secondary-container/30 text-secondary', cancelled: 'bg-surface-container-high text-on-surface-variant',
};
const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };

function render() {
  const w = workOrder;
  const v = w.vehicle;

  content.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-md bg-surface-container-lowest p-lg rounded-lg border border-border-light">
      <div>
        <div class="flex items-center gap-md mb-sm">
          <span class="px-sm py-xs ${STATUS_CLS[w.status]} font-label-sm text-label-sm uppercase rounded font-bold tracking-wide">${STATUS_LABEL[w.status]}</span>
          <span class="font-mono-data text-mono-data text-text-muted">Created: ${formatDate(w.created_at)}</span>
        </div>
        <h2 class="font-headline-lg text-headline-lg text-on-surface">${escapeHtml(w.service_type || 'Service')}</h2>
        <p class="font-body-md text-body-md text-text-muted mt-xs flex items-center gap-sm">
          <span class="material-symbols-outlined text-[18px]">local_shipping</span>
          Vehicle: ${v ? `${escapeHtml(v.plate_number)} (${escapeHtml([v.make, v.model, v.year].filter(Boolean).join(' '))})` : 'Not linked'}
        </p>
      </div>
      <div class="flex gap-sm w-full md:w-auto mt-md md:mt-0" id="wod-actions"></div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-lg">
      <div class="lg:col-span-2 space-y-lg">
        <section class="bg-surface-container-lowest border border-border-light rounded-lg p-lg">
          <h3 class="font-headline-md text-headline-md text-on-surface mb-md flex items-center gap-sm">
            <span class="material-symbols-outlined text-text-muted">build_circle</span> Service Details
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div>
              <label class="font-label-sm text-label-sm text-text-muted uppercase mb-xs block">Urgency</label>
              <div class="font-body-md text-body-md text-on-surface flex items-center gap-xs capitalize">
                <span class="material-symbols-outlined text-[18px]">priority_high</span> ${escapeHtml(w.urgency || 'normal')}
              </div>
            </div>
            <div>
              <label class="font-label-sm text-label-sm text-text-muted uppercase mb-xs block">Scheduled Date</label>
              <div class="font-body-md text-body-md text-on-surface">${w.scheduled_date ? formatDate(w.scheduled_date) : 'Not scheduled'}</div>
            </div>
            <div class="md:col-span-2">
              <label class="font-label-sm text-label-sm text-text-muted uppercase mb-xs block">Description</label>
              <div class="font-body-md text-body-md text-on-surface bg-background-subtle p-md rounded border border-border-light">${escapeHtml(w.description || 'No description provided.')}</div>
            </div>
          </div>
        </section>
        <section class="bg-surface-container-lowest border border-border-light rounded-lg p-lg">
          <h3 class="font-headline-md text-headline-md text-on-surface mb-md flex items-center gap-sm">
            <span class="material-symbols-outlined text-text-muted">receipt_long</span> Cost &amp; Parts
          </h3>
          <form class="flex flex-col gap-md" id="wod-cost-form">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div>
                <label class="font-label-sm text-label-sm text-text-muted uppercase mb-xs block">Cost (₦)</label>
                <input class="w-full px-3 py-2 border border-border-light rounded-lg font-mono-data" id="wod-cost" min="0" type="number" value="${w.cost_naira || 0}"/>
              </div>
            </div>
            <div>
              <label class="font-label-sm text-label-sm text-text-muted uppercase mb-xs block">Parts Notes</label>
              <textarea class="w-full px-3 py-2 border border-border-light rounded-lg font-body-sm" id="wod-parts-notes" rows="3">${escapeHtml(w.parts_notes || '')}</textarea>
            </div>
            <button class="self-start px-md py-sm rounded-lg font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity" type="submit">Save Cost &amp; Notes</button>
          </form>
        </section>
      </div>
      <div class="space-y-lg">
        <section class="bg-surface-container-lowest border border-border-light rounded-lg p-md">
          <div class="flex items-center gap-sm mb-md">
            <span class="material-symbols-outlined text-text-muted text-[20px]">directions_car</span>
            <span class="font-label-md text-label-md text-text-muted uppercase">Vehicle Info</span>
          </div>
          ${v ? `
          <div class="bg-surface-container-low rounded p-sm flex justify-center mb-md border border-border-light">
            <div class="bg-white border border-border-light rounded px-md py-xs font-mono-data text-[16px] font-bold tracking-widest text-on-surface text-center shadow-sm relative overflow-hidden">
              <div class="absolute top-0 left-0 w-full h-1 bg-primary"></div>${escapeHtml(v.plate_number)}
            </div>
          </div>
          <div class="space-y-sm font-body-sm text-body-sm">
            <div class="flex justify-between border-b border-border-light pb-xs"><span class="text-text-muted">Make/Model</span><span class="font-medium">${escapeHtml([v.make, v.model].filter(Boolean).join(' ') || '—')}</span></div>
            <div class="flex justify-between border-b border-border-light pb-xs"><span class="text-text-muted">Year</span><span class="font-medium">${v.year || '—'}</span></div>
            <div class="flex justify-between"><span class="text-text-muted">Odometer</span><span class="font-mono-data">${v.odometer_km ? Number(v.odometer_km).toLocaleString('en-NG') + ' km' : '—'}</span></div>
          </div>` : `<p class="font-body-sm text-body-sm text-text-muted">No vehicle linked.</p>`}
        </section>
        <section class="bg-surface-container-lowest border border-border-light rounded-lg p-lg">
          <h3 class="font-headline-md text-headline-md text-on-surface mb-md flex items-center gap-sm">
            <span class="material-symbols-outlined text-text-muted">photo_camera</span> Service Media
          </h3>
          <div class="space-y-md">
            <div>
              <h4 class="font-label-sm text-label-sm text-text-muted uppercase mb-sm">Before</h4>
              ${w.before_photo_url ? `<img class="w-full rounded border border-border-light" src="${w.before_photo_url}"/>` : `<label class="block border-2 border-dashed border-border-light rounded-lg p-md text-center hover:bg-surface-container-low cursor-pointer"><span class="material-symbols-outlined text-primary text-[24px] block">cloud_upload</span><span class="font-label-sm text-label-sm text-on-surface">Upload before photo</span><input accept="image/*" class="hidden" id="wod-before-input" type="file"/></label>`}
            </div>
            <div>
              <h4 class="font-label-sm text-label-sm text-text-muted uppercase mb-sm">After</h4>
              ${w.after_photo_url ? `<img class="w-full rounded border border-border-light" src="${w.after_photo_url}"/>` : `<label class="block border-2 border-dashed border-border-light rounded-lg p-md text-center hover:bg-surface-container-low cursor-pointer"><span class="material-symbols-outlined text-primary text-[24px] block">cloud_upload</span><span class="font-label-sm text-label-sm text-on-surface">Upload after photo</span><input accept="image/*" class="hidden" id="wod-after-input" type="file"/></label>`}
            </div>
          </div>
        </section>
      </div>
    </div>`;

  renderActions();
  document.getElementById('wod-cost-form')?.addEventListener('submit', onSaveCost);
  document.getElementById('wod-before-input')?.addEventListener('change', (e) => onPhotoUpload(e, 'before_photo_url'));
  document.getElementById('wod-after-input')?.addEventListener('change', (e) => onPhotoUpload(e, 'after_photo_url'));
}

function renderActions() {
  const el = document.getElementById('wod-actions');
  const buttons = [];
  if (workOrder.status === 'open') {
    buttons.push({ label: 'Start Work', next: 'in_progress', cls: 'bg-primary-container text-white hover:opacity-90' });
  }
  if (workOrder.status === 'open' || workOrder.status === 'in_progress') {
    buttons.push({ label: 'Mark as Complete', next: 'completed', cls: 'bg-secondary text-on-secondary hover:opacity-90' });
    buttons.push({ label: 'Cancel', next: 'cancelled', cls: 'border border-border-light text-on-surface hover:bg-background-subtle bg-transparent' });
  }
  el.innerHTML = buttons.map(b => `<button class="flex-1 md:flex-none px-lg py-sm font-label-md text-label-md rounded-lg transition-colors duration-150 ${b.cls}" data-next="${b.next}">${b.label}</button>`).join('');
  el.querySelectorAll('[data-next]').forEach(btn => btn.addEventListener('click', () => updateStatus(btn.getAttribute('data-next'))));
}

async function updateStatus(next) {
  const payload = { status: next };
  if (next === 'completed') payload.completed_at = new Date().toISOString();
  const { error } = await supabase.from('work_orders').update(payload).eq('id', workOrderId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast(`Work order marked ${next.replace('_', ' ')}.`, 'success');
  await load();
}

async function onSaveCost(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';

  const payload = {
    cost_naira: Number(document.getElementById('wod-cost').value) || 0,
    parts_notes: document.getElementById('wod-parts-notes').value.trim() || null,
  };

  const { error } = await supabase.from('work_orders').update(payload).eq('id', workOrderId);
  btn.disabled = false; btn.textContent = original;

  if (error) { showToast(error.message, 'error'); return; }
  showToast('Cost and notes saved.', 'success');
  await load();
}

async function onPhotoUpload(e, column) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const url = await uploadFile(file, 'work-orders');
    const { error } = await supabase.from('work_orders').update({ [column]: url }).eq('id', workOrderId);
    if (error) throw error;
    showToast('Photo uploaded.', 'success');
    await load();
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}
