begin;

do $activity_event_runtime_grant_preflight$
begin
  if to_regclass('public.activity_events') is null then
    raise exception 'public.activity_events is required before restricting runtime grants';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_roles
     where rolname = 'vk_app_runtime'
       and not rolcanlogin
       and not rolsuper
       and not rolcreatedb
       and not rolcreaterole
       and not rolreplication
       and not rolbypassrls
  ) then
    raise exception 'safe vk_app_runtime NOLOGIN role is required before restricting runtime grants';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles runtime_role
        on runtime_role.oid = membership.member
     where runtime_role.rolname = 'vk_app_runtime'
  ) then
    raise exception 'vk_app_runtime must not inherit privileges from another role';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles runtime_role
        on runtime_role.oid = membership.roleid
     where runtime_role.rolname = 'vk_app_runtime'
       and (
         membership.admin_option
         or not membership.inherit_option
       )
  ) then
    raise exception 'vk_app_runtime memberships must be non-admin and inherited';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_class target
      join pg_catalog.pg_namespace namespace
        on namespace.oid = target.relnamespace
     where namespace.nspname = 'public'
       and target.relname = 'activity_events'
       and target.relkind in ('r', 'p')
       and current_user = pg_get_userbyid(target.relowner)
  ) then
    raise exception 'activity_events grants must be restricted by the table owner';
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_class target
      join pg_catalog.pg_namespace namespace
        on namespace.oid = target.relnamespace
     where namespace.nspname = 'public'
       and target.relname = 'activity_events_id_seq'
       and target.relkind = 'S'
       and current_user = pg_get_userbyid(target.relowner)
  ) then
    raise exception 'activity_events_id_seq grants must be restricted by the sequence owner';
  end if;
end;
$activity_event_runtime_grant_preflight$;

revoke all privileges on table public.activity_events from public;
revoke all privileges on table public.activity_events from vk_app_runtime cascade;

do $activity_event_column_grant_reset$
declare
  target_columns text;
begin
  select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
    into target_columns
    from pg_catalog.pg_attribute attribute
   where attribute.attrelid = 'public.activity_events'::pg_catalog.regclass
     and attribute.attnum > 0
     and not attribute.attisdropped;

  if target_columns is null then
    raise exception 'public.activity_events must expose columns before restricting runtime grants';
  end if;

  execute format(
    'revoke all privileges (%s) on table public.activity_events from public',
    target_columns
  );
  execute format(
    'revoke all privileges (%s) on table public.activity_events from vk_app_runtime cascade',
    target_columns
  );
end;
$activity_event_column_grant_reset$;

grant select, insert on table public.activity_events to vk_app_runtime;

revoke all privileges on sequence public.activity_events_id_seq from public;
revoke all privileges on sequence public.activity_events_id_seq from vk_app_runtime cascade;
grant usage, select on sequence public.activity_events_id_seq to vk_app_runtime;

do $activity_event_runtime_grant_postflight$
begin
  if exists (
    select 1
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles runtime_role
        on runtime_role.oid = membership.roleid
     where runtime_role.rolname = 'vk_app_runtime'
       and (
         membership.admin_option
         or not membership.inherit_option
       )
  ) then
    raise exception 'vk_app_runtime memberships must remain non-admin and inherited';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_class target
      join pg_catalog.pg_namespace namespace
        on namespace.oid = target.relnamespace
      cross join lateral pg_catalog.aclexplode(target.relacl) privilege
     where namespace.nspname = 'public'
       and target.relname in ('activity_events', 'activity_events_id_seq')
       and privilege.grantee = 0
    union all
    select 1
      from pg_catalog.pg_attribute attribute
      cross join lateral pg_catalog.aclexplode(attribute.attacl) privilege
     where attribute.attrelid = 'public.activity_events'::pg_catalog.regclass
       and attribute.attnum > 0
       and not attribute.attisdropped
       and privilege.grantee = 0
  ) then
    raise exception 'PUBLIC activity_events table, column, and sequence privileges must be empty';
  end if;
  if not (
    has_table_privilege('vk_app_runtime', 'public.activity_events', 'SELECT')
    and has_table_privilege('vk_app_runtime', 'public.activity_events', 'INSERT')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'SELECT WITH GRANT OPTION')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'INSERT WITH GRANT OPTION')
    and not has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'SELECT WITH GRANT OPTION')
    and not has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'INSERT WITH GRANT OPTION')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'UPDATE')
    and not has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'UPDATE')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'DELETE')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'TRUNCATE')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'REFERENCES')
    and not has_any_column_privilege('vk_app_runtime', 'public.activity_events', 'REFERENCES')
    and not has_table_privilege('vk_app_runtime', 'public.activity_events', 'TRIGGER')
    and has_sequence_privilege('vk_app_runtime', 'public.activity_events_id_seq', 'USAGE')
    and has_sequence_privilege('vk_app_runtime', 'public.activity_events_id_seq', 'SELECT')
    and not has_sequence_privilege('vk_app_runtime', 'public.activity_events_id_seq', 'UPDATE')
    and not has_sequence_privilege(
      'vk_app_runtime',
      'public.activity_events_id_seq',
      'USAGE WITH GRANT OPTION'
    )
    and not has_sequence_privilege(
      'vk_app_runtime',
      'public.activity_events_id_seq',
      'SELECT WITH GRANT OPTION'
    )
  ) then
    raise exception 'vk_app_runtime activity_events privileges are not append-only';
  end if;
end;
$activity_event_runtime_grant_postflight$;

commit;
