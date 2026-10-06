-- Allow the driver job list to read block relationships through existing ownership RLS.
-- Do not grant write access or anonymous access.
grant select (company_id, driver_id) on public.company_driver_blocks to authenticated;
notify pgrst, 'reload schema';
-- Email notifications must check company blocks before sending.
grant select (company_id, driver_id) on public.company_driver_blocks to service_role;
