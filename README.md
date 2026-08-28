# FleetCore

Multi-tenant fleet management SaaS for Nigerian logistics, haulage, delivery
and transport companies. Same architecture as School Bus Track Pro (vanilla
HTML/CSS/JS, no build step, Supabase backend, org-scoped RLS) — repurposed
for trucks, vans and drivers instead of school buses.

## What's in this zip

```
fleetcore/
├── index.html                # Universal login (Company Admin / Maintenance / Finance / Bex Admin)
├── forgot-password.html
├── reset-password.html
├── confirm.html
├── admin/                    # Company Admin (5 roles: this is role 1 of 5)
│   ├── dashboard.html
│   ├── vehicles.html
│   ├── drivers.html
│   ├── dispatch.html         # Trip creation/assignment
│   ├── maintenance.html      # Fleet-wide maintenance overview
│   ├── finance.html          # Fleet-wide finance overview
│   ├── incidents.html        # SOS / incident log
│   ├── analytics.html
│   ├── team.html             # Invite/manage staff
│   ├── settings.html
│   └── profile.html
├── driver/                   # Driver (mobile-first, bottom tab nav)
│   ├── login.html
│   ├── dashboard.html        # Today's assignment
│   ├── active-trip.html
│   ├── fuel-log.html
│   ├── incident-report.html  # SOS flow
│   ├── trip-history.html
│   └── profile.html
├── maintenance/               # Maintenance Officer
│   ├── dashboard.html
│   ├── vehicle-health.html
│   ├── work-orders.html
│   ├── work-order-detail.html
│   ├── service-history.html
│   ├── schedule.html
│   └── profile.html
├── finance/                    # Account Manager
│   ├── dashboard.html
│   ├── fuel-expenses.html
│   ├── maintenance-expenses.html
│   ├── invoicing.html
│   ├── reports.html
│   └── profile.html
├── bex-admin/                  # Bex Admin (cross-tenant superadmin)
│   ├── dashboard.html          # Tenant overview
│   ├── companies.html          # Provision/manage tenants
│   ├── tenant-detail.html
│   ├── audit-logs.html
│   ├── platform-analytics.html
│   ├── settings.html
│   └── profile.html
├── js/
│   ├── config.js              # Supabase client init — ADD YOUR CREDENTIALS HERE
│   ├── auth.js                # Login, signup, logout, role routing, tenant isolation
│   └── nav.js                 # Sidebar active-state + route guard bootstrap
├── assets/
│   ├── images/logo.png
│   └── audio/sos-alert.mp3
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 20260825000000_init_schema.sql   # Tables
    │   └── 20260825000001_rls_policies.sql  # Multi-tenant RLS
    └── functions/
        ├── assign-trip/       # Dispatch a trip to driver+vehicle
        ├── create-user/       # Admin invites staff (creates auth user + profile)
        ├── send-invite/       # Email invite with tenant code
        └── send-fleet-alert/  # Expiry alerts (roadworthiness/license/insurance) + incident emails
```

**42 pages total.** The 20 core screens (dashboards, vehicle/driver management,
dispatch board, maintenance, finance, incidents, analytics, tenant admin) are
built directly from your Stitch mockups — same design system, same copy,
now wired to real auth and navigation. The remaining pages (team management,
settings, invoicing, reports, schedules, profile pages, driver SOS/history)
didn't have Stitch mockups yet, so I built them as clean functional
scaffolds using the identical Tailwind color tokens and component patterns —
ready to receive data, lighter on visual polish than the Stitch-designed
pages. Treat those as a v1.1 design pass if you want them Stitch-quality too.

## Roles

| Role | Folder | Access |
|---|---|---|
| Company Admin | `admin/` | Full control of their tenant |
| Driver | `driver/` | Mobile-first: assignments, fuel, SOS, profile |
| Maintenance Officer | `maintenance/` | Vehicle health, work orders, service history |
| Account Manager | `finance/` | Fuel/maintenance costs, invoicing, reports |
| Bex Admin | `bex-admin/` | Cross-tenant platform ops (you) |

## Setup

### 1. Create a new Supabase project
Do **not** reuse the School Bus Track Pro project — FleetCore needs its own
database. Go to [supabase.com/dashboard](https://supabase.com/dashboard),
create a project, then:

```bash
# Push the schema (from this project's root, with Supabase CLI installed)
supabase link --project-ref YOUR_FLEETCORE_PROJECT_REF
supabase db push
```

This runs both migration files: table creation, then RLS policies.

### 2. Add your Supabase credentials
Open `js/config.js` and replace the placeholders:

```js
const SUPABASE_URL = 'https://YOUR-FLEETCORE-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-FLEETCORE-ANON-KEY';
```

Both values are on your Supabase project's **Settings → API** page.

### 3. Deploy edge functions
```bash
supabase functions deploy assign-trip
supabase functions deploy create-user
supabase functions deploy send-invite
supabase functions deploy send-fleet-alert
```
Set secrets: `BREVO_API_KEY`, `FROM_EMAIL`, `APP_URL` via `supabase secrets set`.

### 4. Provision your first tenant
Since there's no public signup flow for Company Admin (by design — Bex Admin
provisions tenants), insert your first organization and admin user directly
in the Supabase SQL editor, or wire up `bex-admin/companies.html`'s
"+ Provision Company" button to call an admin-only insert.

### 5. Run locally
No build step needed — just serve the folder:
```bash
npx serve fleetcore
# or open index.html directly for quick checks (auth won't fully work over file://)
```

### 6. Deploy
Push to GitHub, then import into Vercel (same flow as School Bus Track Pro).

## About cloning into the Bex Labs GitHub org

I don't have access to your GitHub account or the Bex Labs org, so I can't
push or rename a repo on your behalf. Here's the exact sequence to do it
yourself:

```bash
# 1. Create a new empty repo named "fleetcore" under the Bex-Labs org on GitHub first (via github.com UI or gh CLI):
gh repo create Bex-Labs/fleetcore --private --confirm

# 2. Unzip this download, then push it in:
cd fleetcore
git init
git add .
git commit -m "Initial commit: FleetCore v1"
git branch -M main
git remote add origin https://github.com/Bex-Labs/fleetcore.git
git push -u origin main
```

If you'd rather literally clone-and-rename the School Bus Track Pro repo
instead of starting fresh (to preserve its git history), the closest
equivalent is:
```bash
git clone https://github.com/Bex-Labs/school-bus-track-pro.git fleetcore-from-history
cd fleetcore-from-history
rm -rf $(ls -A | grep -v '^\.git$')      # wipe working tree, keep history
cp -r /path/to/unzipped/fleetcore/. .
git add -A
git commit -m "Transform School Bus Track Pro into FleetCore"
git remote set-url origin https://github.com/Bex-Labs/fleetcore.git
git push -u origin main
```
That second approach carries School Bus Track Pro's commit history into a
codebase that no longer resembles it — most teams prefer the clean `git
init` approach above.

## Login & branding (latest update)

- **`index.html`** is now a fully animated, dark glassmorphic login with a
  4-role sliding tab switcher (Company Admin / Driver / Maintenance Officer /
  Account Manager) — role tabs just set the hint copy underneath the form;
  actual routing after login is still driven by the authenticated user's
  real `role` in the `profiles` table, not by which tab was clicked.
- **`bex-admin/login.html`** is a separate, deliberately unlisted page —
  reached only via a barely-visible "restricted" lock link in `index.html`'s
  footer. It has a TOTP code field in the UI, but that's a visual
  placeholder for now; wiring real Supabase MFA is still on the backlog
  (see "Known gaps" below).
- **`driver/login.html`** stayed light-themed on purpose (glass-dark UI is
  hard to read on a phone screen in direct sun) but got the same brand
  polish: floating gradient blobs, card entrance animation, new logo.
- The new FleetCore logo (extracted from your uploaded mark) now appears in
  every role's sidebar/header: `admin/`, `driver/`, `maintenance/`,
  `finance/`, `bex-admin/`, plus both login pages. Source files live at
  `assets/images/logo.png` (icon, used small in navbars) and
  `assets/images/logo-full.png` (full lockup with wordmark + tagline, for
  hero/marketing use if you need it later).
- I used **"Account Manager"** as the tab/role label throughout, matching
  the role name already baked into the database schema and RLS policies —
  if you'd rather call it "Finance Officer" everywhere, that's a find/replace
  across `js/auth.js`, the DB migration, and the UI labels; just say the word.

## Known gaps / next steps
- **No live map integration yet** — `vehicle_locations` table and realtime
  publication exist, and the dashboard now shows an honest "no vehicles
  reporting live location" state instead of a fake map. Wire it to
  Mapbox/Google Maps + the driver app's geolocation ping.
- **File uploads are wired** — fuel receipts, incident photos, and work
  order before/after photos all upload to a real Supabase Storage bucket
  via `uploadFile()` in `js/config.js`. Run `supabase/storage-setup.sql`
  once in your project's SQL editor to create the `fleet-uploads` bucket
  and its RLS policies before testing uploads.
- **TOTP 2FA for Bex Admin is now real** — wired to Supabase Auth's native
  MFA (`supabase.auth.mfa`). Enroll from `bex-admin/settings.html` (scan
  the real QR code, confirm a code to activate). Login then requires that
  code via `bex-admin/login.html`. Note: this gates the login *flow*, not
  the database — RLS policies don't yet check `auth.jwt()->>'aal'`, so a
  stolen session token would still work without the second factor at the
  database layer. Add `aal2`-aware policies for `bex_admin` rows if you
  need that hardened further. Also confirm MFA is enabled for your project
  under Supabase Dashboard → Authentication → Providers (on by default for
  new projects).
- **Audit logging is real but minimal** — every login now writes a row to
  `audit_logs` (see `js/auth.js`). Role changes, data exports, and
  impersonation events aren't logged yet — add inserts at those call
  sites as you build them.
- All 42 pages across all 5 roles are wired to real Supabase queries — no
  mock/placeholder data remains in the UI. A few Stitch mockups contained
  numbers or features the schema doesn't support (fake MRR/billing, fake
  safety scores, fake itemized parts invoices, fake API/telematics charts)
  — those were replaced with the closest honest equivalent the real schema
  supports; each swap is noted in the relevant JS module's header comment.

## Before you go live
1. Run both migration files, then `supabase/storage-setup.sql`.
2. Set edge function secrets (`BREVO_API_KEY`, `FROM_EMAIL`, `APP_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) and deploy all four
   functions.
3. Provision your own organization + first Company Admin via
   `bex-admin/companies.html` (requires a Bex Admin account created
   manually in the SQL editor first — see "Provision your first tenant"
   above).
