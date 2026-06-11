create table if not exists public.stakeholder_types (
  id text primary key,
  label text not null,
  description text,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stakeholder_organizations (
  id text primary key,
  stakeholder_type_id text not null references public.stakeholder_types(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  organization_type text,
  postal_code text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  email text,
  notes text,
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stakeholder_people (
  id text primary key,
  stakeholder_type_id text not null references public.stakeholder_types(id) on delete restrict,
  organization_id text references public.stakeholder_organizations(id) on delete set null,
  organization text,
  name text not null,
  role text,
  committee text,
  city text,
  federal_state text,
  latitude double precision,
  longitude double precision,
  map_position_source text check (map_position_source is null or map_position_source in ('person', 'organization', 'state')),
  email text,
  phone text,
  linkedin text,
  topics text[] not null default '{}',
  notes text,
  source text,
  profile_url text,
  is_representative_assembly_member boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_views drop constraint if exists saved_views_view_type_check;
alter table public.saved_views
  add constraint saved_views_view_type_check
  check (view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

alter table public.user_settings drop constraint if exists user_settings_default_view_type_check;
alter table public.user_settings
  add constraint user_settings_default_view_type_check
  check (default_view_type in ('contacts', 'organizations', 'experts', 'stakeholders', 'formats', 'map', 'analytics'));

create index if not exists stakeholder_types_status_idx on public.stakeholder_types(status);
create index if not exists stakeholder_organizations_type_idx on public.stakeholder_organizations(stakeholder_type_id);
create index if not exists stakeholder_organizations_normalized_name_idx on public.stakeholder_organizations(normalized_name);
create index if not exists stakeholder_organizations_state_idx on public.stakeholder_organizations(federal_state);
create index if not exists stakeholder_organizations_status_idx on public.stakeholder_organizations(status);
create index if not exists stakeholder_people_type_idx on public.stakeholder_people(stakeholder_type_id);
create index if not exists stakeholder_people_organization_idx on public.stakeholder_people(organization_id);
create index if not exists stakeholder_people_representative_idx on public.stakeholder_people(is_representative_assembly_member);
create index if not exists stakeholder_people_status_idx on public.stakeholder_people(status);

drop trigger if exists stakeholder_types_touch_updated_at on public.stakeholder_types;
create trigger stakeholder_types_touch_updated_at
before update on public.stakeholder_types
for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_organizations_touch_updated_at on public.stakeholder_organizations;
create trigger stakeholder_organizations_touch_updated_at
before update on public.stakeholder_organizations
for each row execute function public.touch_updated_at();

drop trigger if exists stakeholder_people_touch_updated_at on public.stakeholder_people;
create trigger stakeholder_people_touch_updated_at
before update on public.stakeholder_people
for each row execute function public.touch_updated_at();

alter table public.stakeholder_types enable row level security;
alter table public.stakeholder_organizations enable row level security;
alter table public.stakeholder_people enable row level security;

revoke all on public.stakeholder_types from anon, authenticated, service_role;
revoke all on public.stakeholder_organizations from anon, authenticated, service_role;
revoke all on public.stakeholder_people from anon, authenticated, service_role;

grant select, insert, update on public.stakeholder_types to authenticated;
grant select, insert, update on public.stakeholder_organizations to authenticated;
grant select, insert, update on public.stakeholder_people to authenticated;

grant select, insert, update, delete on public.stakeholder_types to service_role;
grant select, insert, update, delete on public.stakeholder_organizations to service_role;
grant select, insert, update, delete on public.stakeholder_people to service_role;

drop policy if exists "stakeholder types authenticated read active" on public.stakeholder_types;
create policy "stakeholder types authenticated read active"
on public.stakeholder_types for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder types editor admin insert" on public.stakeholder_types;
create policy "stakeholder types editor admin insert"
on public.stakeholder_types for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder types editor admin update active" on public.stakeholder_types;
create policy "stakeholder types editor admin update active"
on public.stakeholder_types for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder types admin archive" on public.stakeholder_types;
create policy "stakeholder types admin archive"
on public.stakeholder_types for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "stakeholder organizations authenticated read active" on public.stakeholder_organizations;
create policy "stakeholder organizations authenticated read active"
on public.stakeholder_organizations for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder organizations editor admin insert" on public.stakeholder_organizations;
create policy "stakeholder organizations editor admin insert"
on public.stakeholder_organizations for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder organizations editor admin update active" on public.stakeholder_organizations;
create policy "stakeholder organizations editor admin update active"
on public.stakeholder_organizations for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder organizations admin archive" on public.stakeholder_organizations;
create policy "stakeholder organizations admin archive"
on public.stakeholder_organizations for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "stakeholder people authenticated read active" on public.stakeholder_people;
create policy "stakeholder people authenticated read active"
on public.stakeholder_people for select
to authenticated
using (status <> 'archived' or public.current_profile_role() = 'admin');

drop policy if exists "stakeholder people editor admin insert" on public.stakeholder_people;
create policy "stakeholder people editor admin insert"
on public.stakeholder_people for insert
to authenticated
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status = 'active'
);

drop policy if exists "stakeholder people editor admin update active" on public.stakeholder_people;
create policy "stakeholder people editor admin update active"
on public.stakeholder_people for update
to authenticated
using (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
)
with check (
  public.current_profile_role() in ('editor', 'admin')
  and status <> 'archived'
);

drop policy if exists "stakeholder people admin archive" on public.stakeholder_people;
create policy "stakeholder people admin archive"
on public.stakeholder_people for update
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

insert into public.stakeholder_types (id, label, description, sort_order, status)
values (
  'kv',
  'Kassenärztliche Vereinigungen',
  'Regionale Kassenärztliche Vereinigungen als erster Stakeholder-Bereich.',
  10,
  'active'
)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

insert into public.stakeholder_organizations
  (id, stakeholder_type_id, name, normalized_name, organization_type, city, federal_state, latitude, longitude, website, source, status)
values
  ('kv-baden-wuerttemberg', 'kv', 'Kassenärztliche Vereinigung Baden-Württemberg', 'kassenärztliche vereinigung baden-württemberg', 'Kassenärztliche Vereinigung', 'Stuttgart', 'Baden-Württemberg', 48.7758, 9.1829, 'https://www.kvbawue.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-bayern', 'kv', 'Kassenärztliche Vereinigung Bayerns', 'kassenärztliche vereinigung bayerns', 'Kassenärztliche Vereinigung', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.kvb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-berlin', 'kv', 'Kassenärztliche Vereinigung Berlin', 'kassenärztliche vereinigung berlin', 'Kassenärztliche Vereinigung', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.kvberlin.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-brandenburg', 'kv', 'Kassenärztliche Vereinigung Brandenburg', 'kassenärztliche vereinigung brandenburg', 'Kassenärztliche Vereinigung', 'Potsdam', 'Brandenburg', 52.3906, 13.0645, 'https://www.kvbb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-bremen', 'kv', 'Kassenärztliche Vereinigung Bremen', 'kassenärztliche vereinigung bremen', 'Kassenärztliche Vereinigung', 'Bremen', 'Bremen', 53.0793, 8.8017, 'https://www.kvhb.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-hamburg', 'kv', 'Kassenärztliche Vereinigung Hamburg', 'kassenärztliche vereinigung hamburg', 'Kassenärztliche Vereinigung', 'Hamburg', 'Hamburg', 53.5511, 9.9937, 'https://www.kvhh.net', 'Öffentliche KV-Baseline', 'active'),
  ('kv-hessen', 'kv', 'Kassenärztliche Vereinigung Hessen', 'kassenärztliche vereinigung hessen', 'Kassenärztliche Vereinigung', 'Frankfurt am Main', 'Hessen', 50.1109, 8.6821, 'https://www.kvhessen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-mecklenburg-vorpommern', 'kv', 'Kassenärztliche Vereinigung Mecklenburg-Vorpommern', 'kassenärztliche vereinigung mecklenburg-vorpommern', 'Kassenärztliche Vereinigung', 'Schwerin', 'Mecklenburg-Vorpommern', 53.6355, 11.4012, 'https://www.kvmv.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-niedersachsen', 'kv', 'Kassenärztliche Vereinigung Niedersachsen', 'kassenärztliche vereinigung niedersachsen', 'Kassenärztliche Vereinigung', 'Hannover', 'Niedersachsen', 52.3759, 9.7320, 'https://www.kvn.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-nordrhein', 'kv', 'Kassenärztliche Vereinigung Nordrhein', 'kassenärztliche vereinigung nordrhein', 'Kassenärztliche Vereinigung', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://www.kvno.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-rheinland-pfalz', 'kv', 'Kassenärztliche Vereinigung Rheinland-Pfalz', 'kassenärztliche vereinigung rheinland-pfalz', 'Kassenärztliche Vereinigung', 'Mainz', 'Rheinland-Pfalz', 49.9929, 8.2473, 'https://www.kv-rlp.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-saarland', 'kv', 'Kassenärztliche Vereinigung Saarland', 'kassenärztliche vereinigung saarland', 'Kassenärztliche Vereinigung', 'Saarbrücken', 'Saarland', 49.2402, 6.9969, 'https://www.kvsaarland.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-sachsen', 'kv', 'Kassenärztliche Vereinigung Sachsen', 'kassenärztliche vereinigung sachsen', 'Kassenärztliche Vereinigung', 'Dresden', 'Sachsen', 51.0504, 13.7373, 'https://www.kvs-sachsen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-sachsen-anhalt', 'kv', 'Kassenärztliche Vereinigung Sachsen-Anhalt', 'kassenärztliche vereinigung sachsen-anhalt', 'Kassenärztliche Vereinigung', 'Magdeburg', 'Sachsen-Anhalt', 52.1205, 11.6276, 'https://www.kvsa.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-schleswig-holstein', 'kv', 'Kassenärztliche Vereinigung Schleswig-Holstein', 'kassenärztliche vereinigung schleswig-holstein', 'Kassenärztliche Vereinigung', 'Bad Segeberg', 'Schleswig-Holstein', 53.9355, 10.3099, 'https://www.kvsh.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-thueringen', 'kv', 'Kassenärztliche Vereinigung Thüringen', 'kassenärztliche vereinigung thüringen', 'Kassenärztliche Vereinigung', 'Weimar', 'Thüringen', 50.9795, 11.3235, 'https://www.kv-thueringen.de', 'Öffentliche KV-Baseline', 'active'),
  ('kv-westfalen-lippe', 'kv', 'Kassenärztliche Vereinigung Westfalen-Lippe', 'kassenärztliche vereinigung westfalen-lippe', 'Kassenärztliche Vereinigung', 'Dortmund', 'Nordrhein-Westfalen', 51.5136, 7.4653, 'https://www.kvwl.de', 'Öffentliche KV-Baseline', 'active')
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    city = excluded.city,
    federal_state = excluded.federal_state,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    website = excluded.website,
    source = excluded.source,
    status = excluded.status;
