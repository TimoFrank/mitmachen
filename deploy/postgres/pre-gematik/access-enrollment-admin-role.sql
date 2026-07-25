-- Least-privilege NOLOGIN role for reviewed test-user enrollment applies.
--
-- Run once as the common owner of the three operator-managed access objects. A short-lived
-- Cloud SQL BUILT_IN login may then receive only vk_access_enrollment_admin.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-access-admin-v2', 0));

do $pre_gematik_access_admin_create$
begin
  if (
    select count(*) = 3
       and count(distinct relation.relowner) = 1
       and min(relation.relowner) = (
         select oid from pg_catalog.pg_roles where rolname = current_user
       )
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname in (
         'profiles',
         'identity_bindings',
         'identity_enrollment_requests'
       )
  ) is not true then
    raise exception 'access-enrollment-admin-role.sql must run as the common owner of all access objects';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = current_user
       and rolcreaterole
  ) then
    raise exception 'access-enrollment-admin-role.sql requires the object owner with CREATEROLE';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'vk_access_enrollment_admin'
  ) then
    execute 'create role vk_access_enrollment_admin nologin noinherit';
    execute $comment$
      comment on role vk_access_enrollment_admin is
        'NOLOGIN role for reviewed pre-gematik v2 enrollment applies; assign only to a short-lived Cloud SQL login'
    $comment$;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where granted_role.rolname = 'vk_access_enrollment_admin'
       and member_role.rolname = current_user
  ) then
    execute format(
      'grant vk_access_enrollment_admin to %I with admin option, inherit false, set false',
      current_user
    );
  end if;
end
$pre_gematik_access_admin_create$;

do $pre_gematik_access_admin_precondition$
declare
  access_admin_oid oid;
begin
  select oid
    into access_admin_oid
    from pg_catalog.pg_roles
   where rolname = 'vk_access_enrollment_admin';

  if exists (
    select 1
      from pg_catalog.pg_roles
     where oid = access_admin_oid
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
    raise exception 'vk_access_enrollment_admin has unsafe role attributes';
  end if;

  if exists (
    select 1 from pg_catalog.pg_auth_members where member = access_admin_oid
  ) then
    raise exception 'vk_access_enrollment_admin must not inherit another database role';
  end if;

  if (
    select count(*) from pg_catalog.pg_auth_members where roleid = access_admin_oid
  ) <> 1 or (
    select count(*)
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where membership.roleid = access_admin_oid
       and member_role.rolname = current_user
       and membership.admin_option
       and not membership.inherit_option
       and not membership.set_option
  ) <> 1 then
    raise exception 'vk_access_enrollment_admin creator membership does not match the safe owner-only contract';
  end if;

  if exists (
    select 1 from pg_catalog.pg_class where relowner = access_admin_oid
  ) or exists (
    select 1 from pg_catalog.pg_proc where proowner = access_admin_oid
  ) or exists (
    select 1 from pg_catalog.pg_namespace where nspowner = access_admin_oid
  ) or exists (
    select 1 from pg_catalog.pg_database where datdba = access_admin_oid
  ) then
    raise exception 'vk_access_enrollment_admin must not own database objects';
  end if;
end
$pre_gematik_access_admin_precondition$;

revoke all privileges on all tables in schema public from vk_access_enrollment_admin;
revoke all privileges on all sequences in schema public from vk_access_enrollment_admin;
revoke all privileges on all functions in schema public from vk_access_enrollment_admin;
revoke all privileges on schema public from vk_access_enrollment_admin;

grant usage on schema public to vk_access_enrollment_admin;
grant select on table public.profiles to vk_access_enrollment_admin;
grant insert (id, email, display_name, initials, role, active, team, bio)
  on public.profiles to vk_access_enrollment_admin;
grant update (email, display_name, initials, role, active, team, bio)
  on public.profiles to vk_access_enrollment_admin;

grant select on table public.identity_bindings to vk_access_enrollment_admin;
grant insert (issuer, subject, profile_id, active, access_scope, scope_ref)
  on public.identity_bindings to vk_access_enrollment_admin;
grant update (active, access_scope, scope_ref)
  on public.identity_bindings to vk_access_enrollment_admin;

grant select on table public.identity_enrollment_requests to vk_access_enrollment_admin;
grant update (status, applied_profile_id)
  on public.identity_enrollment_requests to vk_access_enrollment_admin;

grant execute on function public.pre_gematik_touch_updated_at()
  to vk_access_enrollment_admin;

do $pre_gematik_access_admin_verify$
declare
  access_admin_oid oid;
  unsafe_other_table_privileges integer;
  unsafe_sequence_privileges integer;
  unsafe_other_function_privileges integer;
begin
  select oid
    into access_admin_oid
    from pg_catalog.pg_roles
   where rolname = 'vk_access_enrollment_admin';

  if not has_schema_privilege('vk_access_enrollment_admin', 'public', 'USAGE')
     or has_schema_privilege('vk_access_enrollment_admin', 'public', 'CREATE')
     or not has_table_privilege('vk_access_enrollment_admin', 'public.profiles', 'SELECT')
     or has_table_privilege('vk_access_enrollment_admin', 'public.profiles', 'INSERT')
     or has_table_privilege('vk_access_enrollment_admin', 'public.profiles', 'UPDATE')
     or has_table_privilege('vk_access_enrollment_admin', 'public.profiles', 'DELETE')
     or not has_column_privilege('vk_access_enrollment_admin', 'public.profiles', 'id', 'INSERT')
     or has_column_privilege('vk_access_enrollment_admin', 'public.profiles', 'role', 'REFERENCES')
     or not has_table_privilege('vk_access_enrollment_admin', 'public.identity_bindings', 'SELECT')
     or has_table_privilege('vk_access_enrollment_admin', 'public.identity_bindings', 'INSERT')
     or has_table_privilege('vk_access_enrollment_admin', 'public.identity_bindings', 'UPDATE')
     or has_table_privilege('vk_access_enrollment_admin', 'public.identity_bindings', 'DELETE')
     or not has_column_privilege(
       'vk_access_enrollment_admin',
       'public.identity_bindings',
       'issuer',
       'INSERT'
     )
     or has_column_privilege(
       'vk_access_enrollment_admin',
       'public.identity_bindings',
       'subject',
       'UPDATE'
     )
     or not has_table_privilege(
       'vk_access_enrollment_admin',
       'public.identity_enrollment_requests',
       'SELECT'
     )
     or has_table_privilege(
       'vk_access_enrollment_admin',
       'public.identity_enrollment_requests',
       'UPDATE'
     )
     or not has_column_privilege(
       'vk_access_enrollment_admin',
       'public.identity_enrollment_requests',
       'status',
       'UPDATE'
     )
     or has_column_privilege(
       'vk_access_enrollment_admin',
       'public.identity_enrollment_requests',
       'verified_email',
       'UPDATE'
     )
     or not has_function_privilege(
       'vk_access_enrollment_admin',
       'public.pre_gematik_touch_updated_at()',
       'EXECUTE'
     ) then
    raise exception 'vk_access_enrollment_admin does not match the exact v2 access privilege contract';
  end if;

  select count(*)
    into unsafe_other_table_privileges
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relkind in ('r', 'p', 'v', 'm', 'f')
     and relation.relname not in (
       'profiles',
       'identity_bindings',
       'identity_enrollment_requests'
     )
     and (
       has_table_privilege('vk_access_enrollment_admin', relation.oid, 'SELECT')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'INSERT')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'UPDATE')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'DELETE')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'TRUNCATE')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'REFERENCES')
       or has_table_privilege('vk_access_enrollment_admin', relation.oid, 'TRIGGER')
       or has_any_column_privilege('vk_access_enrollment_admin', relation.oid, 'SELECT')
       or has_any_column_privilege('vk_access_enrollment_admin', relation.oid, 'INSERT')
       or has_any_column_privilege('vk_access_enrollment_admin', relation.oid, 'UPDATE')
       or has_any_column_privilege('vk_access_enrollment_admin', relation.oid, 'REFERENCES')
     );

  select count(*)
    into unsafe_sequence_privileges
    from pg_catalog.pg_class sequence_relation
    join pg_catalog.pg_namespace namespace on namespace.oid = sequence_relation.relnamespace
   where namespace.nspname = 'public'
     and sequence_relation.relkind = 'S'
     and (
       has_sequence_privilege('vk_access_enrollment_admin', sequence_relation.oid, 'USAGE')
       or has_sequence_privilege('vk_access_enrollment_admin', sequence_relation.oid, 'SELECT')
       or has_sequence_privilege('vk_access_enrollment_admin', sequence_relation.oid, 'UPDATE')
     );

  select count(*)
    into unsafe_other_function_privileges
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public'
     and routine.oid <> 'public.pre_gematik_touch_updated_at()'::pg_catalog.regprocedure
     and has_function_privilege('vk_access_enrollment_admin', routine.oid, 'EXECUTE');

  if unsafe_other_table_privileges <> 0
     or unsafe_sequence_privileges <> 0
     or unsafe_other_function_privileges <> 0 then
    raise exception 'vk_access_enrollment_admin has privileges outside the explicit v2 access allowlist';
  end if;
end
$pre_gematik_access_admin_verify$;

commit;
