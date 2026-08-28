-- supabase/storage-setup.sql
-- Run this once in the Supabase SQL editor (or via `supabase db push` if you
-- add it as a migration). Creates the single shared storage bucket used by
-- every upload flow in FleetCore: fuel receipts, incident photos, work
-- order before/after photos, driver license docs, vehicle documents.
--
-- Files are organized by folder prefix, e.g.:
--   fuel-receipts/<uuid>.jpg
--   incident-photos/<uuid>.jpg
--   work-orders/<uuid>.jpg
--   licenses/<uuid>.jpg
--   vehicle-docs/<uuid>.jpg

insert into storage.buckets (id, name, public)
values ('fleet-uploads', 'fleet-uploads', true)
on conflict (id) do nothing;

-- Any authenticated user can upload (their own org's data is still
-- protected at the table level by RLS on fuel_logs/incidents/work_orders;
-- this bucket only controls who can write/read files).
create policy "Authenticated users can upload to fleet-uploads"
on storage.objects for insert
to authenticated
with check (bucket_id = 'fleet-uploads');

create policy "Authenticated users can read fleet-uploads"
on storage.objects for select
to authenticated
using (bucket_id = 'fleet-uploads');

create policy "Users can update their own fleet-uploads"
on storage.objects for update
to authenticated
using (bucket_id = 'fleet-uploads' and owner = auth.uid());

create policy "Users can delete their own fleet-uploads"
on storage.objects for delete
to authenticated
using (bucket_id = 'fleet-uploads' and owner = auth.uid());
