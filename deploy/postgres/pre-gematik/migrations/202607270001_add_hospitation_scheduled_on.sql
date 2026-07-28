begin;

alter table public.hospitations
  add column if not exists scheduled_on date;

update public.hospitations
   set scheduled_on = (starts_at at time zone 'Europe/Berlin')::date
 where scheduled_on is null
   and starts_at is not null;

create index if not exists hospitations_status_date_idx
  on public.hospitations (status, scheduled_on desc, updated_at desc);

create index if not exists hospitations_schedule_idx
  on public.hospitations (
    scheduled_on desc nulls last,
    starts_at desc nulls last,
    updated_at desc
  );

commit;
