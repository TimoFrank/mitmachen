-- Least-privilege NOLOGIN role for controlled IAP identity provisioning.
--
-- This file contains no environment-specific identity values or credentials.
-- It is intended for one reviewed bootstrap as the existing object owner
-- (postgres on Cloud SQL), before a short-lived BUILT_IN login is assigned
-- exclusively to vk_identity_admin through the Cloud SQL Admin API.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-identity-admin-v1', 0));

do $pre_gematik_identity_admin_create$
begin
  if (
    select count(*)
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in ('profiles', 'identity_bindings')
       and relation.relowner = (
         select oid from pg_catalog.pg_roles where rolname = current_user
       )
  ) <> 2 then
    raise exception 'identity-admin-role.sql must run as the existing owner of profiles and identity_bindings';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = current_user
       and rolcreaterole
  ) then
    raise exception 'identity-admin-role.sql requires the object owner with CREATEROLE';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'vk_identity_admin'
  ) then
    execute 'create role vk_identity_admin nologin noinherit';
    execute $comment$
      comment on role vk_identity_admin is
        'NOLOGIN role for reviewed pre-gematik IAP identity-binding upserts; assign only to a short-lived Cloud SQL login'
    $comment$;
  end if;

  -- PostgreSQL 16 automatically records this safe creator membership for a
  -- non-superuser with CREATEROLE. A real superuser test harness does not, so
  -- add the same no-SET/no-INHERIT membership only when it is absent.
  if not exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles admin_role on admin_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where admin_role.rolname = 'vk_identity_admin'
       and member_role.rolname = current_user
  ) then
    execute format(
      'grant vk_identity_admin to %I with admin option, inherit false, set false',
      current_user
    );
  end if;
end
$pre_gematik_identity_admin_create$;

do $pre_gematik_identity_admin_precondition$
declare
  identity_admin_oid oid;
begin
  select oid
    into identity_admin_oid
    from pg_catalog.pg_roles
   where rolname = 'vk_identity_admin';

  -- A Cloud SQL object owner with CREATEROLE is intentionally not a
  -- SUPERUSER. It may create a safe role, but PostgreSQL rejects even
  -- `ALTER ROLE ... NOSUPERUSER` from that owner. Fail closed on every
  -- attribute instead of trying to rewrite privileged role attributes.
  if exists (
    select 1
      from pg_catalog.pg_roles
     where oid = identity_admin_oid
       and (
         rolcanlogin
         or rolinherit
         or rolsuper
         or rolcreatedb
         or rolcreaterole
         or rolreplication
         or rolbypassrls
       )
  ) then
    raise exception 'vk_identity_admin has unsafe role attributes';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_auth_members
     where member = identity_admin_oid
  ) then
    raise exception 'vk_identity_admin must not inherit another database role';
  end if;

  if (
    select count(*)
      from pg_catalog.pg_auth_members membership
     where membership.roleid = identity_admin_oid
  ) <> 1 or (
    select count(*)
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where membership.roleid = identity_admin_oid
       and member_role.rolname = current_user
       and membership.admin_option
       and not membership.inherit_option
       and not membership.set_option
  ) <> 1 then
    raise exception 'vk_identity_admin creator membership does not match the safe owner-only contract';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_class
     where relowner = identity_admin_oid
  ) or exists (
    select 1
      from pg_catalog.pg_proc
     where proowner = identity_admin_oid
  ) or exists (
    select 1
      from pg_catalog.pg_namespace
     where nspowner = identity_admin_oid
  ) or exists (
    select 1
      from pg_catalog.pg_database
     where datdba = identity_admin_oid
  ) then
    raise exception 'vk_identity_admin must not own database objects';
  end if;
end
$pre_gematik_identity_admin_precondition$;

-- Reset every explicit object privilege before applying the exact allowlist.
revoke all privileges on all tables in schema public from vk_identity_admin;
revoke all privileges on all sequences in schema public from vk_identity_admin;
revoke all privileges on all functions in schema public from vk_identity_admin;
revoke all privileges on schema public from vk_identity_admin;

grant usage on schema public to vk_identity_admin;
grant select on table public.profiles to vk_identity_admin;
grant select, insert, update on table public.identity_bindings to vk_identity_admin;
grant execute on function public.pre_gematik_touch_updated_at() to vk_identity_admin;

do $pre_gematik_identity_admin_verify$
declare
  identity_admin_oid oid;
  unsafe_other_table_privileges integer;
  unsafe_sequence_privileges integer;
  unsafe_other_function_privileges integer;
begin
  select oid
    into identity_admin_oid
    from pg_catalog.pg_roles
   where rolname = 'vk_identity_admin';

  if exists (
    select 1
      from pg_catalog.pg_roles
     where oid = identity_admin_oid
       and (
         rolcanlogin
         or rolinherit
         or rolsuper
         or rolcreatedb
         or rolcreaterole
         or rolreplication
         or rolbypassrls
       )
  ) then
    raise exception 'vk_identity_admin has unsafe role attributes';
  end if;

  if not has_schema_privilege('vk_identity_admin', 'public', 'USAGE')
     or has_schema_privilege('vk_identity_admin', 'public', 'CREATE')
     or not has_table_privilege('vk_identity_admin', 'public.profiles', 'SELECT')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'INSERT')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'UPDATE')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'DELETE')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'TRUNCATE')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'REFERENCES')
     or has_table_privilege('vk_identity_admin', 'public.profiles', 'TRIGGER')
     or has_any_column_privilege('vk_identity_admin', 'public.profiles', 'INSERT')
     or has_any_column_privilege('vk_identity_admin', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('vk_identity_admin', 'public.profiles', 'REFERENCES')
     or not has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'SELECT')
     or not has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'INSERT')
     or not has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'UPDATE')
     or has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'DELETE')
     or has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'TRUNCATE')
     or has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'REFERENCES')
     or has_table_privilege('vk_identity_admin', 'public.identity_bindings', 'TRIGGER')
     or has_any_column_privilege('vk_identity_admin', 'public.identity_bindings', 'REFERENCES')
     or not has_function_privilege(
       'vk_identity_admin',
       'public.pre_gematik_touch_updated_at()',
       'EXECUTE'
     ) then
    raise exception 'vk_identity_admin does not match the exact identity-binding privilege contract';
  end if;

  select count(*)
    into unsafe_other_table_privileges
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relkind in ('r', 'p', 'v', 'm', 'f')
     and relation.relname not in ('profiles', 'identity_bindings')
     and (
       has_table_privilege('vk_identity_admin', relation.oid, 'SELECT')
       or has_table_privilege('vk_identity_admin', relation.oid, 'INSERT')
       or has_table_privilege('vk_identity_admin', relation.oid, 'UPDATE')
       or has_table_privilege('vk_identity_admin', relation.oid, 'DELETE')
       or has_table_privilege('vk_identity_admin', relation.oid, 'TRUNCATE')
       or has_table_privilege('vk_identity_admin', relation.oid, 'REFERENCES')
       or has_table_privilege('vk_identity_admin', relation.oid, 'TRIGGER')
       or has_any_column_privilege('vk_identity_admin', relation.oid, 'SELECT')
       or has_any_column_privilege('vk_identity_admin', relation.oid, 'INSERT')
       or has_any_column_privilege('vk_identity_admin', relation.oid, 'UPDATE')
       or has_any_column_privilege('vk_identity_admin', relation.oid, 'REFERENCES')
     );

  select count(*)
    into unsafe_sequence_privileges
    from pg_catalog.pg_class sequence_relation
    join pg_catalog.pg_namespace namespace on namespace.oid = sequence_relation.relnamespace
   where namespace.nspname = 'public'
     and sequence_relation.relkind = 'S'
     and (
       has_sequence_privilege('vk_identity_admin', sequence_relation.oid, 'USAGE')
       or has_sequence_privilege('vk_identity_admin', sequence_relation.oid, 'SELECT')
       or has_sequence_privilege('vk_identity_admin', sequence_relation.oid, 'UPDATE')
     );

  select count(*)
    into unsafe_other_function_privileges
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.oid <> 'public.pre_gematik_touch_updated_at()'::pg_catalog.regprocedure
     and has_function_privilege('vk_identity_admin', routine.oid, 'EXECUTE');

  if unsafe_other_table_privileges <> 0
     or unsafe_sequence_privileges <> 0
     or unsafe_other_function_privileges <> 0 then
    raise exception 'vk_identity_admin has privileges outside the explicit identity-binding allowlist';
  end if;
end
$pre_gematik_identity_admin_verify$;

commit;
