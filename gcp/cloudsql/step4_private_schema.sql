create table if not exists profiles (
  id text primary key,
  email text not null,
  display_name text not null,
  initials text,
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  avatar_url text,
  team text,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  normalized_name text not null,
  sector text,
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
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists contacts (
  id text primary key,
  name text not null,
  organization_id text references organizations(id) on delete set null,
  organization text,
  sector text,
  specialty text,
  role text,
  priority text not null default 'Mittel' check (priority in ('Hoch', 'Mittel', 'Niedrig', 'Keine / Unbekannt')),
  owner_id text references profiles(id) on delete set null,
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
  next_step text,
  source text,
  image_url text,
  image_source_url text,
  image_source_label text,
  image_rights_note text,
  image_updated_at timestamptz,
  image_updated_by text references profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by text references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text references profiles(id) on delete set null
);

create table if not exists changes (
  id bigint generated always as identity primary key,
  contact_id text not null references contacts(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'archive', 'restore', 'owner_change', 'seed')),
  field_name text,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  changed_by text references profiles(id) on delete set null
);

create index if not exists profiles_active_idx on profiles(active);
create index if not exists organizations_status_idx on organizations(status);
create index if not exists organizations_normalized_name_idx on organizations(normalized_name);
create index if not exists organizations_sector_idx on organizations(sector);
create index if not exists organizations_state_idx on organizations(federal_state);
create index if not exists contacts_status_idx on contacts(status);
create index if not exists contacts_owner_idx on contacts(owner_id);
create index if not exists contacts_organization_id_idx on contacts(organization_id);
create index if not exists contacts_state_idx on contacts(federal_state);
create index if not exists contacts_priority_idx on contacts(priority);
create index if not exists changes_contact_idx on changes(contact_id);
create index if not exists changes_changed_at_idx on changes(changed_at desc);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at
before update on profiles
for each row execute function touch_updated_at();

drop trigger if exists organizations_touch_updated_at on organizations;
create trigger organizations_touch_updated_at
before update on organizations
for each row execute function touch_updated_at();

drop trigger if exists contacts_touch_updated_at on contacts;
create trigger contacts_touch_updated_at
before update on contacts
for each row execute function touch_updated_at();
