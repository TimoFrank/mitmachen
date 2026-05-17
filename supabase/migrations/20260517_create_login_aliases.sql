create table if not exists public.login_aliases (
  alias text primary key,
  email text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alias = lower(trim(alias))),
  check (alias ~ '^[a-z0-9._-]{2,32}$')
);

drop trigger if exists login_aliases_touch_updated_at on public.login_aliases;
create trigger login_aliases_touch_updated_at
before update on public.login_aliases
for each row execute function public.touch_updated_at();

alter table public.login_aliases enable row level security;

grant select, insert, update, delete on public.login_aliases to service_role;

insert into public.login_aliases (alias, email, profile_id, active)
select 'timo', email, id, true
from public.profiles
where lower(email) = lower('timofrank@icloud.com')
on conflict (alias) do update
set email = excluded.email,
    profile_id = excluded.profile_id,
    active = true;

insert into public.login_aliases (alias, email, profile_id, active)
select 'bibi', email, id, true
from public.profiles
where lower(email) = lower('timo.frank@hashtag-gesundheit.de')
on conflict (alias) do update
set email = excluded.email,
    profile_id = excluded.profile_id,
    active = true;

insert into public.login_aliases (alias, email, profile_id, active)
select 'benjamin', email, id, true
from public.profiles
where lower(email) = lower('timo.frank@gematik.de')
on conflict (alias) do update
set email = excluded.email,
    profile_id = excluded.profile_id,
    active = true;
