-- supabase/migrations/20260825000000_init_schema.sql
-- FleetCore — Core schema (multi-tenant fleet management)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS (tenants — fleet companies)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.organizations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  subdomain       TEXT UNIQUE NOT NULL,
  logo_url        TEXT,
  address         TEXT,
  city            TEXT,
  phone_number    TEXT,
  account_status  TEXT DEFAULT 'active' CHECK (account_status IN ('trial','active','suspended','cancelled')),
  plan            TEXT DEFAULT 'trial' CHECK (plan IN ('trial','starter','growth','enterprise')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. PROFILES (extends auth.users)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name        TEXT,
  email            TEXT,
  role             TEXT DEFAULT 'driver' CHECK (role IN ('company_admin','driver','maintenance_officer','account_manager','bex_admin')),
  phone_number     TEXT,
  avatar_url       TEXT,
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','pending')),
  -- driver-specific fields
  license_number     TEXT,
  license_expiry     DATE,
  performance_rating NUMERIC(2,1),
  last_login_at      TIMESTAMPTZ,
  last_login_location TEXT,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. VEHICLES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vehicles (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  plate_number          TEXT NOT NULL,
  make                  TEXT,
  model                 TEXT,
  year                  INT,
  vehicle_type          TEXT CHECK (vehicle_type IN ('truck','van','bus','trailer','pickup','other')),
  capacity_kg           NUMERIC,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','in_service','flagged','inactive')),
  assigned_driver_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  roadworthiness_expiry DATE,
  insurance_expiry      DATE,
  odometer_km           NUMERIC DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, plate_number)
);

CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id    UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  doc_type      TEXT, -- roadworthiness | insurance | permit | other
  file_url      TEXT,
  expiry_date   DATE,
  uploaded_at   TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. TRIPS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.trips (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  vehicle_id      UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  origin          TEXT,
  destination     TEXT,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  distance_km     NUMERIC,
  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_locations (
  vehicle_id    UUID REFERENCES public.vehicles(id) ON DELETE CASCADE PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  speed         INT DEFAULT 0,
  heading       INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT false,
  last_updated  TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. FUEL LOGS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  vehicle_id      UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  litres          NUMERIC NOT NULL,
  amount_naira    NUMERIC NOT NULL,
  station_name    TEXT,
  odometer_km     NUMERIC,
  receipt_url     TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','flagged')),
  logged_at       TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. MAINTENANCE / WORK ORDERS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.work_orders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  vehicle_id      UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  service_type    TEXT,
  description     TEXT,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  urgency         TEXT DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
  cost_naira      NUMERIC DEFAULT 0,
  parts_notes     TEXT,
  before_photo_url TEXT,
  after_photo_url  TEXT,
  assigned_to     UUID REFERENCES public.profiles(id),
  scheduled_date  DATE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 7. INCIDENTS / SOS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.incidents (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  driver_id       UUID REFERENCES public.profiles(id),
  vehicle_id      UUID REFERENCES public.vehicles(id),
  trip_id         UUID REFERENCES public.trips(id),
  incident_type   TEXT CHECK (incident_type IN ('road','health','mechanical','security','other')),
  severity        TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  details         TEXT,
  photo_url       TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  status          TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  resolution_notes TEXT,
  reference       TEXT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 8. FINANCE — invoices & expense summary support
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  client_name     TEXT NOT NULL,
  trip_id         UUID REFERENCES public.trips(id),
  amount_naira    NUMERIC NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  due_date        DATE,
  issued_at       TIMESTAMPTZ DEFAULT now(),
  paid_at         TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  title           TEXT,
  message         TEXT,
  type            TEXT, -- expiry | incident | trip | system
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 10. AUDIT LOG (Bex Admin — global, cross-tenant security log)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL, -- e.g. 'login', 'role_change', 'data_export', 'impersonation'
  target_table    TEXT,
  target_id       UUID,
  ip_address      TEXT,
  location        TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Realtime publication for live vehicle tracking
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
