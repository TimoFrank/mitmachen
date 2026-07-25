-- Hardened roles for exact-email test-access allowlist administration.
--
-- The runtime never receives table access to test_access_allowlist. The
-- SECURITY DEFINER function is transferred to a dedicated NOLOGIN owner with
-- only the exact column privileges required for one atomic consumption.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-allowlist-admin-v1', 0));

do $pre_gematik_allowlist_roles_create$
declare
  required_relation_count integer;
begin
  select count(*)
    into required_relation_count
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relname in (
       'profiles',
       'identity_bindings',
       'identity_enrollment_requests',
       'test_access_allowlist'
     )
     and relation.relowner = (
       select oid from pg_catalog.pg_roles where rolname = current_user
     );

  if required_relation_count <> 4 then
    raise exception 'access-allowlist-admin-role.sql requires the common owner of all allowlist access tables';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = current_user and rolcreaterole
  ) then
    raise exception 'access-allowlist-admin-role.sql requires CREATEROLE';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'vk_app_runtime'
       and not rolcanlogin
  ) then
    raise exception 'vk_app_runtime NOLOGIN role is required';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'vk_allowlist_executor'
  ) then
    execute 'create role vk_allowlist_executor nologin noinherit';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'vk_access_allowlist_admin'
  ) then
    execute 'create role vk_access_allowlist_admin nologin noinherit';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where granted_role.rolname = 'vk_allowlist_executor'
       and member_role.rolname = current_user
  ) then
    execute format(
      'grant vk_allowlist_executor to %I with admin option, inherit false, set false',
      current_user
    );
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where granted_role.rolname = 'vk_access_allowlist_admin'
       and member_role.rolname = current_user
  ) then
    execute format(
      'grant vk_access_allowlist_admin to %I with admin option, inherit false, set false',
      current_user
    );
  end if;
end
$pre_gematik_allowlist_roles_create$;

do $pre_gematik_allowlist_roles_precondition$
declare
  role_name text;
  role_oid oid;
begin
  foreach role_name in array array['vk_allowlist_executor', 'vk_access_allowlist_admin']
  loop
    select oid into role_oid from pg_catalog.pg_roles where rolname = role_name;
    if exists (
      select 1
        from pg_catalog.pg_roles
       where oid = role_oid
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
      raise exception '% has unsafe role attributes', role_name;
    end if;
    if exists (
      select 1 from pg_catalog.pg_auth_members where member = role_oid
    ) then
      raise exception '% must not inherit another role', role_name;
    end if;
    if (
      select count(*) from pg_catalog.pg_auth_members where roleid = role_oid
    ) <> 1 or (
      select count(*)
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles member_role on member_role.oid = membership.member
       where membership.roleid = role_oid
         and member_role.rolname = current_user
         and membership.admin_option
         and not membership.inherit_option
         and not membership.set_option
    ) <> 1 then
      raise exception '% creator membership is outside the safe owner-only contract', role_name;
    end if;
  end loop;
end
$pre_gematik_allowlist_roles_precondition$;

revoke all privileges on all tables in schema public from vk_allowlist_executor;
revoke all privileges on all sequences in schema public from vk_allowlist_executor;
revoke all privileges on all functions in schema public from vk_allowlist_executor;
revoke all privileges on schema public from vk_allowlist_executor;

grant usage on schema public to vk_allowlist_executor;
grant select on table
  public.test_access_allowlist,
  public.profiles,
  public.identity_bindings,
  public.identity_enrollment_requests
to vk_allowlist_executor;
grant update (consumed_at, consumed_issuer, consumed_subject, consumed_request_id)
  on public.test_access_allowlist to vk_allowlist_executor;
grant insert (id, email, display_name, initials, role, active, team, bio)
  on public.profiles to vk_allowlist_executor;
grant insert (issuer, subject, profile_id, active, access_scope, scope_ref)
  on public.identity_bindings to vk_allowlist_executor;
grant insert (
  request_id,
  issuer,
  subject,
  verified_email,
  status,
  requested_at,
  last_seen_at,
  expires_at
) on public.identity_enrollment_requests to vk_allowlist_executor;
grant update (status, applied_profile_id)
  on public.identity_enrollment_requests to vk_allowlist_executor;
grant execute on function public.pre_gematik_touch_updated_at()
  to vk_allowlist_executor;

revoke all privileges on all tables in schema public from vk_access_allowlist_admin;
revoke all privileges on all sequences in schema public from vk_access_allowlist_admin;
revoke all privileges on all functions in schema public from vk_access_allowlist_admin;
revoke all privileges on schema public from vk_access_allowlist_admin;

grant usage on schema public to vk_access_allowlist_admin;
grant select on table public.test_access_allowlist to vk_access_allowlist_admin;
grant insert (
  allowlist_id,
  email_normalized,
  profile_id,
  display_name,
  initials,
  role,
  team,
  bio,
  scope_ref,
  expires_at
) on public.test_access_allowlist to vk_access_allowlist_admin;
grant update (revoked_at, revoke_reason)
  on public.test_access_allowlist to vk_access_allowlist_admin;
grant execute on function public.pre_gematik_touch_updated_at()
  to vk_access_allowlist_admin;

-- Becoming a function owner requires SET membership and temporary CREATE on
-- the containing schema. Both are removed before commit.
do $pre_gematik_allowlist_executor_enable_transfer$
begin
  execute format(
    'grant vk_allowlist_executor to %I with admin option, inherit false, set true',
    current_user
  );
end
$pre_gematik_allowlist_executor_enable_transfer$;

grant create on schema public to vk_allowlist_executor;

do $pre_gematik_allowlist_transfer_owner$
declare
  executor_oid oid;
  function_owner oid;
begin
  select oid into executor_oid
    from pg_catalog.pg_roles where rolname = 'vk_allowlist_executor';
  select proowner into function_owner
    from pg_catalog.pg_proc
   where oid = 'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::pg_catalog.regprocedure;
  if function_owner <> executor_oid then
    alter function public.pre_gematik_consume_test_access_allowlist(
      uuid,
      text,
      text,
      text,
      timestamptz,
      timestamptz
    ) owner to vk_allowlist_executor;
  end if;
end
$pre_gematik_allowlist_transfer_owner$;

set local role vk_allowlist_executor;
revoke all on function public.pre_gematik_consume_test_access_allowlist(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public;
revoke all on function public.pre_gematik_consume_test_access_allowlist(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from vk_app_runtime;
grant execute on function public.pre_gematik_consume_test_access_allowlist(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to vk_app_runtime;
reset role;

revoke create on schema public from vk_allowlist_executor;

do $pre_gematik_allowlist_executor_disable_transfer$
begin
  execute format(
    'grant vk_allowlist_executor to %I with admin option, inherit false, set false',
    current_user
  );
end
$pre_gematik_allowlist_executor_disable_transfer$;

do $pre_gematik_allowlist_roles_verify$
declare
  executor_oid oid;
  admin_oid oid;
  unsafe_executor_tables integer;
  unsafe_admin_tables integer;
begin
  select oid into executor_oid from pg_catalog.pg_roles where rolname = 'vk_allowlist_executor';
  select oid into admin_oid from pg_catalog.pg_roles where rolname = 'vk_access_allowlist_admin';

  if (
    select count(*)
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles member_role on member_role.oid = membership.member
     where membership.roleid in (executor_oid, admin_oid)
       and member_role.rolname = current_user
       and membership.admin_option
       and not membership.inherit_option
       and not membership.set_option
  ) <> 2 then
    raise exception 'allowlist role creator memberships were not restored safely';
  end if;

  if has_schema_privilege('vk_allowlist_executor', 'public', 'CREATE')
     or not has_schema_privilege('vk_allowlist_executor', 'public', 'USAGE')
     or not has_table_privilege('vk_allowlist_executor', 'public.test_access_allowlist', 'SELECT')
     or has_table_privilege('vk_allowlist_executor', 'public.test_access_allowlist', 'UPDATE')
     or not has_column_privilege(
       'vk_allowlist_executor',
       'public.test_access_allowlist',
       'consumed_at',
       'UPDATE'
     )
     or has_column_privilege(
       'vk_allowlist_executor',
       'public.test_access_allowlist',
       'revoked_at',
       'UPDATE'
     )
     or has_table_privilege('vk_allowlist_executor', 'public.profiles', 'INSERT')
     or not has_column_privilege('vk_allowlist_executor', 'public.profiles', 'id', 'INSERT')
     or has_table_privilege('vk_allowlist_executor', 'public.identity_bindings', 'INSERT')
     or not has_column_privilege(
       'vk_allowlist_executor',
       'public.identity_bindings',
       'subject',
       'INSERT'
     )
     or has_table_privilege(
       'vk_allowlist_executor',
       'public.identity_enrollment_requests',
       'INSERT'
     )
     or not has_column_privilege(
       'vk_allowlist_executor',
       'public.identity_enrollment_requests',
       'request_id',
       'INSERT'
     )
     or has_table_privilege(
       'vk_allowlist_executor',
       'public.identity_enrollment_requests',
       'UPDATE'
     )
     or not has_column_privilege(
       'vk_allowlist_executor',
       'public.identity_enrollment_requests',
       'status',
       'UPDATE'
     )
     or has_column_privilege(
       'vk_allowlist_executor',
       'public.identity_enrollment_requests',
       'verified_email',
       'UPDATE'
     ) then
    raise exception 'vk_allowlist_executor does not match the exact consumption privilege contract';
  end if;

  if has_schema_privilege('vk_access_allowlist_admin', 'public', 'CREATE')
     or not has_table_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'SELECT'
     )
     or has_table_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'INSERT'
     )
     or has_table_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'UPDATE'
     )
     or not has_column_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'email_normalized',
       'INSERT'
     )
     or not has_column_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'revoked_at',
       'UPDATE'
     )
     or has_column_privilege(
       'vk_access_allowlist_admin',
       'public.test_access_allowlist',
       'consumed_at',
       'UPDATE'
     ) then
    raise exception 'vk_access_allowlist_admin does not match the exact administration privilege contract';
  end if;

  select count(*)
    into unsafe_executor_tables
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relkind in ('r', 'p', 'v', 'm', 'f')
     and relation.relname not in (
       'test_access_allowlist',
       'profiles',
       'identity_bindings',
       'identity_enrollment_requests'
     )
     and (
       has_table_privilege('vk_allowlist_executor', relation.oid, 'SELECT')
       or has_table_privilege('vk_allowlist_executor', relation.oid, 'INSERT')
       or has_table_privilege('vk_allowlist_executor', relation.oid, 'UPDATE')
       or has_table_privilege('vk_allowlist_executor', relation.oid, 'DELETE')
       or has_any_column_privilege('vk_allowlist_executor', relation.oid, 'SELECT')
       or has_any_column_privilege('vk_allowlist_executor', relation.oid, 'INSERT')
       or has_any_column_privilege('vk_allowlist_executor', relation.oid, 'UPDATE')
       or has_any_column_privilege('vk_allowlist_executor', relation.oid, 'REFERENCES')
     );

  select count(*)
    into unsafe_admin_tables
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'public'
     and relation.relkind in ('r', 'p', 'v', 'm', 'f')
     and relation.relname <> 'test_access_allowlist'
     and (
       has_table_privilege('vk_access_allowlist_admin', relation.oid, 'SELECT')
       or has_table_privilege('vk_access_allowlist_admin', relation.oid, 'INSERT')
       or has_table_privilege('vk_access_allowlist_admin', relation.oid, 'UPDATE')
       or has_table_privilege('vk_access_allowlist_admin', relation.oid, 'DELETE')
       or has_any_column_privilege('vk_access_allowlist_admin', relation.oid, 'SELECT')
       or has_any_column_privilege('vk_access_allowlist_admin', relation.oid, 'INSERT')
       or has_any_column_privilege('vk_access_allowlist_admin', relation.oid, 'UPDATE')
       or has_any_column_privilege('vk_access_allowlist_admin', relation.oid, 'REFERENCES')
     );

  if unsafe_executor_tables <> 0 or unsafe_admin_tables <> 0 then
    raise exception 'allowlist roles have privileges outside their explicit table allowlists';
  end if;

  if (
    select routine.proowner <> executor_oid
       or not routine.prosecdef
       or routine.proconfig is distinct from array['search_path=pg_catalog, public']
      from pg_catalog.pg_proc routine
     where routine.oid =
       'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)'::pg_catalog.regprocedure
  ) then
    raise exception 'allowlist consumption function owner or SECURITY DEFINER hardening is invalid';
  end if;

  if has_function_privilege(
       'public',
       'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'vk_app_runtime',
       'public.pre_gematik_consume_test_access_allowlist(uuid,text,text,text,timestamptz,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'allowlist consumption function execution ACL is invalid';
  end if;
end
$pre_gematik_allowlist_roles_verify$;

comment on role vk_allowlist_executor is
  'NOLOGIN owner of the hardened exact-email allowlist consumption function';
comment on role vk_access_allowlist_admin is
  'NOLOGIN role for protected create-only/revoke allowlist administration';

commit;
