-- Allow the driver job list to read block relationships through existing ownership RLS.
-- Do not grant write access or anonymous access.
grant select (company_id, driver_id) on public.company_driver_blocks to authenticated;
notify pgrst, 'reload schema';
-- Email notifications must check company blocks before sending.
grant select (company_id, driver_id) on public.company_driver_blocks to service_role;
-- Server-side matching reads only the fields needed for notification eligibility.
grant select (id,name,user_id,preferred_prefecture,preferred_municipality,preferred_prefecture_2,preferred_municipality_2,preferred_prefecture_3,preferred_municipality_3,preferred_email_enabled_1,preferred_email_enabled_2,preferred_email_enabled_3,match_email_enabled,is_paused,preferred_vehicle_types,preferred_weekdays,preferred_time_slots) on public.drivers to service_role;
