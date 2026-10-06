-- Access required by the authenticated self-service deletion Edge Function.
-- No client role receives these server-only permissions.
grant select (id,user_id) on public.companies to service_role;
grant delete on public.drivers,public.companies to service_role;
notify pgrst, 'reload schema';
