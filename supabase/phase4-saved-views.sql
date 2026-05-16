-- Phase 4: nutzerspezifische gespeicherte Suchen und Einstellungen.
-- Dieses SQL ist idempotent und kann im Supabase SQL Editor ausgefuehrt werden.
-- Es ist auch in supabase/schema.sql integriert.

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  scope text not null default 'private' check (scope in ('private', 'team')),
  view_type text not null default 'contacts' check (view_type in ('contacts', 'organizations', 'map', 'analytics')),
  filters jsonb not null default '{}'::jsonb,
  search_query text not null default '',
  sort_key text not null default 'updated_at',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  page_size integer not null default 20 check (page_size in (10, 20, 50, 100)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_view_id uuid references public.saved_views(id) on delete set null,
  default_view_type text not null default 'contacts' check (default_view_type in ('contacts', 'organizations', 'map', 'analytics')),
  table_density text not null default 'comfortable' check (table_density in ('compact', 'comfortable', 'spacious')),
  theme text not null default 'system' check (theme in ('system', 'light', 'contrast')),
  font_scale numeric not null default 1 check (font_scale between 0.9 and 1.2),
  page_size integer not null default 20 check (page_size in (10, 20, 50, 100)),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_views_owner_idx on public.saved_views(owner_id);
create index if not exists saved_views_scope_idx on public.saved_views(scope);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists saved_views_touch_updated_at on public.saved_views;
create trigger saved_views_touch_updated_at
before update on public.saved_views
for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

alter table public.saved_views enable row level security;
alter table public.user_settings enable row level security;

grant select, insert, update, delete on public.saved_views to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.saved_views to service_role;
grant select, insert, update, delete on public.user_settings to service_role;

drop policy if exists "saved views read own or team" on public.saved_views;
create policy "saved views read own or team"
on public.saved_views for select
to authenticated
using (owner_id = auth.uid() or scope = 'team');

drop policy if exists "saved views insert own" on public.saved_views;
create policy "saved views insert own"
on public.saved_views for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    scope = 'private'
    or public.current_profile_role() = 'admin'
  )
);

drop policy if exists "saved views update own or admin team" on public.saved_views;
create policy "saved views update own or admin team"
on public.saved_views for update
to authenticated
using (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'))
with check (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'));

drop policy if exists "saved views delete own or admin team" on public.saved_views;
create policy "saved views delete own or admin team"
on public.saved_views for delete
to authenticated
using (owner_id = auth.uid() or (scope = 'team' and public.current_profile_role() = 'admin'));

drop policy if exists "user settings own read" on public.user_settings;
create policy "user settings own read"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user settings own insert" on public.user_settings;
create policy "user settings own insert"
on public.user_settings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user settings own update" on public.user_settings;
create policy "user settings own update"
on public.user_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user settings own delete" on public.user_settings;
create policy "user settings own delete"
on public.user_settings for delete
to authenticated
using (user_id = auth.uid());
