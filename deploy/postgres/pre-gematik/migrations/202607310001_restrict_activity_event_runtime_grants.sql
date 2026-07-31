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
  ) then
    raise exception 'vk_app_runtime NOLOGIN role is required before restricting runtime grants';
  end if;
end;
$activity_event_runtime_grant_preflight$;

grant select, insert on table public.activity_events to vk_app_runtime;
revoke update, delete on table public.activity_events from vk_app_runtime;

commit;
