-- READ ONLY: supplemental private-schema definitions; no user data.
-- Review returned definitions for secrets before saving in a public repository.
select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
 'arguments',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),
 'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.prokind='f'),
 'schema',(select jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl)
 from pg_namespace n where n.nspname='private'),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind))
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private')
) as metadata;
