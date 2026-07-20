-- Preserve an explicitly supplied source timestamp during controlled migration.
-- Ordinary updates that do not change updated_at still receive now().
-- Apply with a short-lived schema-administration account, never vk_app.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

create or replace function public.pre_gematik_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.pre_gematik_touch_updated_at() from public;
grant execute on function public.pre_gematik_touch_updated_at() to vk_app_runtime;

commit;
