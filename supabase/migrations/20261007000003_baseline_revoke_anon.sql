-- Hardening: the app has no unauthenticated surface, so the `anon` role (what
-- PostgREST uses for requests without a user JWT) should reach nothing in
-- `public`. The role itself and schema USAGE stay — PostgREST needs both.
--
-- Motivating hole: find_matches_for_transaction / find_and_mark_matches are
-- SECURITY DEFINER and their ownership guard is skipped when auth.uid() IS NULL,
-- so an anonymous caller could run them against any user's data.

-- Tables, views and sequences: drop every anon privilege.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Functions: anon also inherits EXECUTE through PUBLIC (the Postgres default),
-- so revoke from both and restore exactly what authenticated/service_role had.
DO $$
DECLARE
  fn record;
  auth_ok boolean;
  svc_ok boolean;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(p.proowner) = current_user
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    auth_ok := has_function_privilege('authenticated', fn.oid, 'EXECUTE');
    svc_ok  := has_function_privilege('service_role',  fn.oid, 'EXECUTE');

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);

    IF auth_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
    IF svc_ok THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    END IF;
  END LOOP;
END
$$;

-- users_set_default_role is a trigger on auth.users; GoTrue fires it as
-- supabase_auth_admin, which only had EXECUTE via PUBLIC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.set_default_auth_role() TO supabase_auth_admin;
  END IF;
END
$$;

-- Future objects created by postgres: nothing for anon, and no implicit PUBLIC
-- EXECUTE on new functions (new RPCs must be granted explicitly).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
