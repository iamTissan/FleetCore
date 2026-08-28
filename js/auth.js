/**
 * AUTH.JS — Authentication & Role-Based Multi-Tenant Routing
 * FleetCore roles: company_admin | driver | maintenance_officer | account_manager | bex_admin
 */

import { supabase, getUserRole } from './config.js';

const ROLE_REDIRECTS = {
  bex_admin:          '/bex-admin/dashboard.html',
  company_admin:      '/admin/dashboard.html',
  driver:              '/driver/dashboard.html',
  maintenance_officer: '/maintenance/dashboard.html',
  account_manager:     '/finance/dashboard.html',
};

const ROLE_NAMES = {
  bex_admin:           'Bex Admin',
  company_admin:       'Company Admin',
  driver:               'Driver',
  maintenance_officer:  'Maintenance Officer',
  account_manager:      'Account Manager',
};

function rootPath(path) {
  const depth = window.location.pathname.split('/').length - 2;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  return prefix + path.replace(/^\//, '');
}

export function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── Toast helper (used across pages; falls back to alert if no toast host) ─
export function showToast(message, type = 'info', duration = 4000) {
  let host = document.getElementById('fc-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'fc-toast-host';
    host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(host);
  }
  const colors = {
    success: '#059669', error: '#DC2626', info: '#2563EB', warning: '#D97706',
  };
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:12px 16px;border-radius:8px;font-family:Inter,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-width:340px;opacity:0;transform:translateX(8px);transition:all .2s ease;`;
  host.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
window.showToast = window.showToast || showToast;

// ─── Multi-tenant: resolve active org by subdomain ─────────────────────────
async function resolveActiveTenant() {
  window.activeTenantId = null;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return;
  const isHostingPlatform = (
    host.endsWith('.vercel.app') || host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev')  || host.endsWith('.github.io') ||
    host.endsWith('.onrender.com') || host.endsWith('.railway.app') || host.endsWith('.fly.dev')
  );
  if (isHostingPlatform) return;
  const parts = host.split('.');
  if (parts.length <= 2 || ['www', 'admin', 'app'].includes(parts[0])) return;
  const subToken = parts[0].toLowerCase().trim();
  if (!supabase) return;
  const { data: org, error } = await supabase.from('organizations').select('id, name').eq('subdomain', subToken).single();
  if (!error && org) {
    window.activeTenantId = org.id;
    const brandHeader = document.getElementById('login-org-title');
    if (brandHeader) brandHeader.textContent = org.name;
  } else if (subToken) {
    showToast('Unrecognised company domain.', 'error');
  }
}

if (supabase) {
  await resolveActiveTenant();

  supabase.auth.onAuthStateChange((event, session) => {
    const authPages = ['index.html', 'forgot-password.html', 'reset-password.html', ''];
    const currentPage = window.location.pathname.split('/').pop();
    const isAuthPage = authPages.includes(currentPage) || currentPage === 'login.html';

    if (
      window.location.hash.includes('access_token=') ||
      window.location.pathname.includes('confirm.html')
    ) return;

    if (event === 'SIGNED_IN' && session && isAuthPage) redirectByRole();
    if (event === 'SIGNED_OUT') {
      const onProtectedPage = !['index.html', 'forgot-password.html', 'reset-password.html', 'confirm.html', 'login.html']
        .some(p => window.location.pathname.includes(p));
      if (onProtectedPage) window.location.href = rootPath('index.html');
    }
    if (event === 'PASSWORD_RECOVERY') window.location.href = rootPath('reset-password.html');
  });
}

export async function redirectByRole() {
  const role = await getUserRole();
  if (!role) { showToast('Could not determine account role. Please contact support.', 'error'); return; }
  const path = ROLE_REDIRECTS[role];
  if (!path) { showToast('Unrecognised role on this account.', 'error'); return; }
  const targetFolder = path.split('/')[1];
  if (window.location.pathname.includes(`/${targetFolder}/`)) return;
  window.location.href = rootPath(path);
}

// ─── ROUTE GUARD ─────────────────────────────────────────────────────────
// Call this on any protected page (auto-runs via data-fc-guard on <body>)
export async function guardRole(expectedFolder) {
  if (!supabase) return;
  const role = await getUserRole();
  if (!role) { window.location.href = rootPath('index.html'); return; }
  const path = ROLE_REDIRECTS[role];
  const folder = path ? path.split('/')[1] : null;
  if (folder !== expectedFolder) {
    showToast(`This page is only available to ${ROLE_NAMES[Object.keys(ROLE_REDIRECTS).find(r => ROLE_REDIRECTS[r].includes('/' + expectedFolder + '/'))] || 'authorized users'}.`, 'error');
    window.location.href = rootPath(path || 'index.html');
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm && supabase) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('login-btn');
    const originalHTML = btn ? btn.innerHTML : '';

    if (btn) { btn.disabled = true; btn.innerHTML = 'Signing in…'; }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(error.message || 'Login failed. Please try again.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
      return;
    }

    // ── Tenant isolation check (skip for bex_admin, which is cross-tenant) ──
    if (window.activeTenantId) {
      const { data: profile } = await supabase
        .from('profiles').select('organization_id, role').eq('id', data.user.id).single();
      if (profile && profile.role !== 'bex_admin') {
        if (profile.organization_id !== window.activeTenantId) {
          await supabase.auth.signOut();
          showToast('Access denied: your account does not belong to this company.', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
          return;
        }
      }
    }

    if (document.getElementById('remember')?.checked) localStorage.setItem('fc_remember_email', email);

    // ── TOTP challenge (Bex Admin login only — detected by the totp field) ──
    // This gates access to the app UI. It is not yet enforced at the RLS
    // layer (that would need auth.jwt()->>'aal' checks in policies), so
    // treat this as a login-flow control, not a hard security boundary,
    // until RLS is updated to require aal2 for bex_admin rows.
    const totpInput = document.getElementById('totp');
    if (totpInput) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const code = totpInput.value.trim();
        if (!code) {
          showToast('Enter the 6-digit code from your authenticator app.', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
          return;
        }
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const factor = factorsData?.totp?.find(f => f.status === 'verified');
        if (!factor) {
          showToast('No verified authenticator found on this account. Contact platform ops.', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
          return;
        }
        const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeErr) {
          showToast(challengeErr.message, 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
          return;
        }
        const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code });
        if (verifyErr) {
          showToast('Incorrect or expired code. Try again.', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
          return;
        }
      } else if (aal && aal.nextLevel === 'aal1') {
        showToast('Two-factor authentication isn\'t set up on this account yet. Enable it from Settings after logging in.', 'warning', 6000);
      }
    }

    // Real audit trail entry — not fabricated log data.
    try {
      const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', data.user.id).single();
      await supabase.from('audit_logs').insert({
        organization_id: prof?.organization_id || null,
        actor_id: data.user.id,
        action: 'login',
        metadata: { email },
      });
    } catch { /* non-fatal — never block login on audit logging */ }

    await redirectByRole();
  });

  const remembered = localStorage.getItem('fc_remember_email');
  if (remembered) {
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = remembered;
    const rememberBox = document.getElementById('remember');
    if (rememberBox) rememberBox.checked = true;
  }
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────
const forgotForm = document.getElementById('forgot-form');
if (forgotForm && supabase) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const btn   = document.getElementById('send-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Sending…'; }
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const BASE_URL = isLocalhost ? window.location.origin : window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${BASE_URL}/reset-password.html` });
    if (error) {
      showToast(error.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Send Recovery Link'; }
      return;
    }
    showToast(`Recovery link sent to ${email}`, 'success');
    const stepRequest = document.getElementById('step-request');
    const stepSent = document.getElementById('step-sent');
    if (stepRequest) stepRequest.style.display = 'none';
    if (stepSent) stepSent.style.display = 'block';
    const sentTo = document.getElementById('sent-to');
    if (sentTo) sentTo.textContent = email;
  });
}

// ─── RESET PASSWORD ───────────────────────────────────────────────────────
const resetForm = document.getElementById('reset-form');
if (resetForm && supabase) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('new-password').value;
    const confirm   = document.getElementById('confirm-password').value;
    if (password !== confirm) { showToast('Passwords do not match.', 'error'); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Password updated. Redirecting to login…', 'success');
    setTimeout(() => window.location.href = rootPath('index.html'), 1500);
  });
}

// ─── LOGOUT (wired to any element with id="logout-link" or data-fc-logout) ─
document.addEventListener('click', async (e) => {
  const el = e.target.closest('#logout-link, [data-fc-logout]');
  if (!el || !supabase) return;
  e.preventDefault();
  await supabase.auth.signOut();
  window.location.href = rootPath('index.html');
});
