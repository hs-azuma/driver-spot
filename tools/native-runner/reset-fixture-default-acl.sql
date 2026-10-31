-- Fresh disposable cluster only, before importing any application objects.
-- pg_restore applies source ACLs assuming no additional target creator default grants.
DO $fixture$
DECLARE r record; object_kind text; namespace_clause text;
BEGIN
 IF to_regclass('public.applications') IS NOT NULL THEN RAISE EXCEPTION 'Fresh empty target required'; END IF;
 FOR r IN
  SELECT owner_role.rolname,ns.nspname,d.defaclnamespace,d.defaclobjtype,a.privilege_type,a.grantee,grantee_role.rolname AS grantee_name
  FROM pg_default_acl d JOIN pg_roles owner_role ON owner_role.oid=d.defaclrole
  LEFT JOIN pg_namespace ns ON ns.oid=d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles grantee_role ON grantee_role.oid=a.grantee
 LOOP
  object_kind:=CASE r.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'FUNCTIONS' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' END;
  IF object_kind IS NULL THEN RAISE EXCEPTION 'Unsupported default ACL object type'; END IF;
  namespace_clause:=CASE WHEN r.defaclnamespace=0 THEN '' ELSE format('IN SCHEMA %I',r.nspname) END;
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I %s REVOKE %s ON %s FROM %s',r.rolname,namespace_clause,r.privilege_type,object_kind,CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(r.grantee_name) END);
 END LOOP;
END $fixture$;
