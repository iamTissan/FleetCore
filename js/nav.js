/**
 * NAV.JS — Sidebar active-state, mobile menu toggle, and route guard bootstrap.
 * Include this AFTER auth.js on every protected page. Set
 * <body data-fc-guard="admin"> (folder name) to enforce role-based access.
 */
import { guardRole } from './auth.js';
import { supabase, getUserProfile, avatarDataUri } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Route guard
  const guard = document.body.getAttribute('data-fc-guard');
  if (guard) await guardRole(guard);

  // Highlight active sidebar link based on current filename
  const current = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('[data-fc-nav]').forEach(link => {
    const href = (link.getAttribute('href') || '').split('/').pop();
    if (href === current) {
      link.classList.add('fc-nav-active');
    }
  });

  // Mobile sidebar toggle (if a hamburger button with id="fc-menu-toggle" exists)
  const toggle = document.getElementById('fc-menu-toggle');
  const sidebar = document.querySelector('aside, nav.docked, [data-fc-sidebar]');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('hidden'));
  }

  // ── Populate real org name + real user avatar/name on every guarded page ──
  if (guard && supabase) {
    const profile = await getUserProfile();
    if (profile) {
      const displayName = profile.full_name || profile.email || 'User';

      document.querySelectorAll('#fc-org-name').forEach(el => { el.textContent = 'Loading…'; });

      if (profile.organization_id) {
        const { data: org } = await supabase.from('organizations').select('name').eq('id', profile.organization_id).single();
        document.querySelectorAll('#fc-org-name').forEach(el => { el.textContent = org?.name || 'Your Company'; });
      } else {
        document.querySelectorAll('#fc-org-name').forEach(el => { el.textContent = 'Bex Labs — Platform'; });
      }

      document.querySelectorAll('img[alt="User profile"]').forEach(img => {
        img.src = avatarDataUri(displayName);
        img.title = displayName;
      });
      document.querySelectorAll('.fc-user-name').forEach(el => { el.textContent = displayName; });
    }
  }
});
