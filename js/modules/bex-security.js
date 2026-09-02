/**
 * BEX-SECURITY.JS — Real TOTP MFA management via Supabase Auth MFA API.
 */
import { supabase, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const view = document.getElementById('totp-status-view');
if (view) initSecurity();

let pendingFactorId = null;

export async function initSecurity() {
  await render();
}

async function render() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    view.innerHTML = `<p class="text-xs font-bold text-rose-500">Could not load 2FA status: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const verified = (data.totp || []).find(f => f.status === 'verified');
  const unverified = (data.totp || []).filter(f => f.status === 'unverified');

  for (const f of unverified) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  if (verified) {
    renderEnabled(verified);
  } else {
    renderDisabled();
  }
}

function renderDisabled() {
  view.innerHTML = `
    <div class="flex items-center gap-2 mb-3 text-amber-600 text-xs font-bold">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>TOTP is currently disabled on this root account.</span>
    </div>
    <button class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition" id="totp-start-btn">
      Enable Two-Factor Authentication
    </button>
    <div class="hidden mt-4" id="totp-enroll-panel"></div>`;

  document.getElementById('totp-start-btn')?.addEventListener('click', startEnrollment);
}

function renderEnabled(factor) {
  view.innerHTML = `
    <div class="flex items-center gap-2 mb-3 text-emerald-600 text-xs font-bold">
      <i class="bi bi-shield-fill-check"></i>
      <span>TOTP is active and verified on this account.</span>
    </div>
    <button class="px-3.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs rounded-xl transition" id="totp-remove-btn">
      Disable Two-Factor Authentication
    </button>`;

  document.getElementById('totp-remove-btn')?.addEventListener('click', async () => {
    if (!confirm('Disable two-factor authentication on this root account?')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Two-factor authentication disabled.', 'success');
    await render();
  });
}

async function startEnrollment() {
  const btn = document.getElementById('totp-start-btn');
  btn.disabled = true; 
  btn.textContent = 'Generating QR...';

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  btn.disabled = false; 
  btn.textContent = 'Enable Two-Factor Authentication';

  if (error) { showToast(error.message, 'error'); return; }

  pendingFactorId = data.id;
  const panel = document.getElementById('totp-enroll-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex flex-col items-center gap-3">
      <img alt="Authenticator QR Code" src="${data.totp.qr_code}" class="w-44 h-44 rounded-xl border border-slate-200 shadow-sm"/>
      <p class="text-[11px] text-slate-500 text-center">Scan with Google Authenticator or enter secret: <span class="font-mono font-bold text-slate-800">${escapeHtml(data.totp.secret)}</span></p>
      <div class="w-full max-w-xs space-y-1">
        <label class="text-[11px] font-bold text-slate-700 uppercase">Enter 6-Digit Code</label>
        <input class="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-center tracking-widest font-bold focus:border-teal-500 focus:outline-none" id="totp-verify-code" inputmode="numeric" maxlength="6" placeholder="000000" type="text"/>
      </div>
      <button class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition" id="totp-confirm-btn">
        Verify & Activate
      </button>
    </div>`;

  document.getElementById('totp-confirm-btn')?.addEventListener('click', confirmEnrollment);
}

async function confirmEnrollment() {
  const code = document.getElementById('totp-verify-code').value.trim();
  if (!code || code.length !== 6) {
    showToast('Enter the 6-digit code from your authenticator app.', 'error');
    return;
  }

  const btn = document.getElementById('totp-confirm-btn');
  btn.disabled = true; 
  btn.textContent = 'Verifying...';

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
  if (challengeErr) {
    showToast(challengeErr.message, 'error');
    btn.disabled = false; 
    btn.textContent = 'Verify & Activate';
    return;
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: pendingFactorId, challengeId: challenge.id, code });
  btn.disabled = false; 
  btn.textContent = 'Verify & Activate';

  if (verifyErr) {
    showToast('Invalid confirmation code.', 'error');
    return;
  }

  showToast('Two-factor authentication enabled.', 'success');
  pendingFactorId = null;
  await render();
}