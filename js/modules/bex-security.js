/**
 * BEX-SECURITY.JS — Real TOTP (2FA) enrollment for Bex Admin.
 * Uses Supabase Auth's native MFA API (enroll/challenge/verify/unenroll).
 * No fake QR codes or placeholder secrets — everything here is a real
 * cryptographic factor registered against the signed-in user's account.
 */
import { supabase, escapeHtml } from '../config.js';
import { showToast } from '../auth.js';

const view = document.getElementById('totp-status-view');
if (view) init();

let pendingFactorId = null;

async function init() {
  await render();
}

async function render() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    view.innerHTML = `<p class="font-body-sm text-body-sm text-error">Could not load 2FA status: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const verified = (data.totp || []).find(f => f.status === 'verified');
  const unverified = (data.totp || []).filter(f => f.status === 'unverified');

  // Clean up stale unverified factors from abandoned enrollment attempts.
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
    <div class="flex items-center gap-xs mb-md text-warning-amber font-body-sm text-body-sm">
      <span class="material-symbols-outlined" style="font-size:16px;">warning</span> Not enabled — your account only requires a password right now.
    </div>
    <button class="px-md py-sm rounded-lg font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity" id="totp-start-btn">Enable Two-Factor Authentication</button>
    <div class="hidden mt-md" id="totp-enroll-panel"></div>`;

  document.getElementById('totp-start-btn')?.addEventListener('click', startEnrollment);
}

function renderEnabled(factor) {
  view.innerHTML = `
    <div class="flex items-center gap-xs mb-md text-secondary font-body-sm text-body-sm">
      <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Enabled since ${new Date(factor.created_at).toLocaleDateString('en-NG')}.
    </div>
    <button class="px-md py-sm rounded-lg font-label-md text-label-md border border-border-light text-on-surface hover:bg-surface-container-low transition-colors" id="totp-remove-btn">Disable Two-Factor Authentication</button>`;

  document.getElementById('totp-remove-btn')?.addEventListener('click', async () => {
    if (!confirm('Disable two-factor authentication? Your account will only require a password to sign in.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Two-factor authentication disabled.', 'success');
    await render();
  });
}

async function startEnrollment() {
  const btn = document.getElementById('totp-start-btn');
  btn.disabled = true; btn.textContent = 'Generating…';

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
  btn.disabled = false; btn.textContent = 'Enable Two-Factor Authentication';

  if (error) { showToast(error.message, 'error'); return; }

  pendingFactorId = data.id;
  const panel = document.getElementById('totp-enroll-panel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="border border-border-light rounded-lg p-md bg-background-subtle flex flex-col items-center gap-md">
      <img alt="Scan with your authenticator app" src="${data.totp.qr_code}" style="width:180px;height:180px;"/>
      <p class="font-body-sm text-xs text-text-muted text-center">Can't scan? Enter this key manually: <span class="font-mono-data">${escapeHtml(data.totp.secret)}</span></p>
      <div class="w-full max-w-xs">
        <label class="font-label-sm text-label-sm text-on-surface-variant mb-1 block">Enter the 6-digit code to confirm</label>
        <input class="w-full px-3 py-2 border border-border-light rounded-lg font-mono-data text-center tracking-widest" id="totp-verify-code" inputmode="numeric" maxlength="6" placeholder="000000" type="text"/>
      </div>
      <button class="px-md py-sm rounded-lg font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity" id="totp-confirm-btn">Verify &amp; Activate</button>
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
  btn.disabled = true; btn.textContent = 'Verifying…';

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
  if (challengeErr) {
    showToast(challengeErr.message, 'error');
    btn.disabled = false; btn.textContent = 'Verify & Activate';
    return;
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: pendingFactorId, challengeId: challenge.id, code });
  btn.disabled = false; btn.textContent = 'Verify & Activate';

  if (verifyErr) {
    showToast('Incorrect code. Check your authenticator app and try again.', 'error');
    return;
  }

  showToast('Two-factor authentication enabled.', 'success');
  pendingFactorId = null;
  await render();
}
