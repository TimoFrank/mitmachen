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

-- Keine personenbezogenen Alias-/E-Mail-Zuordnungen in Versionsverwaltung.
-- Der Legacy-Alias-Pfad wird in der OWASP-Hardening-Migration deaktiviert.
