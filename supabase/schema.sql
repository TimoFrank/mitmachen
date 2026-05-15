create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  initials text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id text primary key,
  name text not null,
  organization text,
  sector text,
  specialty text,
  priority text not null default 'Mittel' check (priority in ('Hoch', 'Mittel', 'Niedrig')),
  owner_id uuid references public.profiles(id),
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}',
  notes text,
  source text,
  image_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.changes (
  id bigint generated always as identity primary key,
  contact_id text not null references public.contacts(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'import')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id)
);

create index if not exists contacts_status_idx on public.contacts(status);
create index if not exists contacts_owner_idx on public.contacts(owner_id);
create index if not exists contacts_state_idx on public.contacts(federal_state);
create index if not exists changes_contact_idx on public.changes(contact_id);

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
before update on public.contacts
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.changes enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert on public.changes to authenticated;
grant usage, select on sequence public.changes_id_seq to authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.contacts to service_role;
grant select, insert, update, delete on public.changes to service_role;
grant usage, select on sequence public.changes_id_seq to service_role;

drop policy if exists "profiles authenticated read" on public.profiles;
create policy "profiles authenticated read"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write"
on public.profiles for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "contacts authenticated read active" on public.contacts;
create policy "contacts authenticated read active"
on public.contacts for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "contacts editor admin insert" on public.contacts;
create policy "contacts editor admin insert"
on public.contacts for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and status = 'active'
);

drop policy if exists "contacts editor admin update active" on public.contacts;
create policy "contacts editor admin update active"
on public.contacts for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and updated_by = auth.uid()
  and status <> 'archived'
);

drop policy if exists "contacts admin archive" on public.contacts;
create policy "contacts admin archive"
on public.contacts for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (
  public.current_profile_role() = 'admin'
  and updated_by = auth.uid()
);

drop policy if exists "changes authenticated read" on public.changes;
create policy "changes authenticated read"
on public.changes for select
to authenticated
using (true);

drop policy if exists "changes editor admin insert" on public.changes;
create policy "changes editor admin insert"
on public.changes for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and changed_by = auth.uid()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, initials, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'display_name', new.email, 'VK'), 2)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
