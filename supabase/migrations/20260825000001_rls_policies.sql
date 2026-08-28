-- supabase/migrations/20260825000001_rls_policies.sql
-- FleetCore — Row Level Security: org-scoped multi-tenancy + role-based access

-- ═══════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER HELPERS (avoid RLS recursion on profiles lookups)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auth_user_org()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_bex_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'bex_admin');
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ENABLE RLS
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_locations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- ORGANIZATIONS — bex_admin sees all; members see their own org
-- ═══════════════════════════════════════════════════════════════════════
CREATE POLICY "org_select" ON public.organizations FOR SELECT
  USING (is_bex_admin() OR id = auth_user_org());
CREATE POLICY "org_insert_bex" ON public.organizations FOR INSERT
  WITH CHECK (is_bex_admin());
CREATE POLICY "org_update" ON public.organizations FOR UPDATE
  USING (is_bex_admin() OR (id = auth_user_org() AND auth_user_role() = 'company_admin'));

-- ═══════════════════════════════════════════════════════════════════════
-- PROFILES — self, org-mates (admin), and bex_admin cross-tenant
-- ═══════════════════════════════════════════════════════════════════════
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR is_bex_admin() OR (organization_id = auth_user_org() AND auth_user_role() = 'company_admin'));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR is_bex_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- GENERIC ORG-SCOPED TABLES
-- Pattern: bex_admin sees everything; everyone else limited to their org.
-- Writes limited to company_admin (+ role-appropriate staff) within their org.
-- ═══════════════════════════════════════════════════════════════════════

-- VEHICLES
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "vehicles_write" ON public.vehicles FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','maintenance_officer'));
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE
  USING (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','maintenance_officer'));

-- VEHICLE DOCUMENTS
CREATE POLICY "vdocs_select" ON public.vehicle_documents FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "vdocs_write" ON public.vehicle_documents FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','maintenance_officer'));

-- TRIPS
CREATE POLICY "trips_select" ON public.trips FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "trips_write" ON public.trips FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND auth_user_role() = 'company_admin');
CREATE POLICY "trips_update" ON public.trips FOR UPDATE
  USING (
    organization_id = auth_user_org()
    AND (auth_user_role() = 'company_admin' OR driver_id = auth.uid())
  );

-- VEHICLE LOCATIONS (drivers push their own vehicle's ping)
CREATE POLICY "vloc_select" ON public.vehicle_locations FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "vloc_upsert" ON public.vehicle_locations FOR INSERT
  WITH CHECK (organization_id = auth_user_org());
CREATE POLICY "vloc_update" ON public.vehicle_locations FOR UPDATE
  USING (organization_id = auth_user_org());

-- FUEL LOGS (driver logs their own; admin/account_manager review all in org)
CREATE POLICY "fuel_select" ON public.fuel_logs FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "fuel_insert" ON public.fuel_logs FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND driver_id = auth.uid());
CREATE POLICY "fuel_update_review" ON public.fuel_logs FOR UPDATE
  USING (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','account_manager'));

-- WORK ORDERS
CREATE POLICY "wo_select" ON public.work_orders FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "wo_write" ON public.work_orders FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','maintenance_officer'));
CREATE POLICY "wo_update" ON public.work_orders FOR UPDATE
  USING (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','maintenance_officer'));

-- INCIDENTS (driver reports own; admin sees/manages all in org)
CREATE POLICY "incidents_select" ON public.incidents FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "incidents_insert" ON public.incidents FOR INSERT
  WITH CHECK (organization_id = auth_user_org());
CREATE POLICY "incidents_update" ON public.incidents FOR UPDATE
  USING (organization_id = auth_user_org() AND auth_user_role() = 'company_admin');

-- INVOICES (account_manager + company_admin)
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (is_bex_admin() OR organization_id = auth_user_org());
CREATE POLICY "invoices_write" ON public.invoices FOR INSERT
  WITH CHECK (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','account_manager'));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (organization_id = auth_user_org() AND auth_user_role() IN ('company_admin','account_manager'));

-- NOTIFICATIONS (own only, or bex_admin)
CREATE POLICY "notif_select" ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR is_bex_admin());
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- AUDIT LOGS (bex_admin only — global security log)
CREATE POLICY "audit_select_bex" ON public.audit_logs FOR SELECT
  USING (is_bex_admin());
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (true); -- inserted via SECURITY DEFINER edge functions / triggers only
