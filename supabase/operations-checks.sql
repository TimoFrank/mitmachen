-- Regelbetrieb: RLS, Policies und Grants pruefen.
-- Dieses SQL veraendert keine Daten und kann im Supabase SQL Editor ausgefuehrt werden.

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'contacts', 'changes', 'saved_views', 'user_settings')
order by tablename;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'contacts', 'changes', 'saved_views', 'user_settings')
order by table_name, grantee, privilege_type;

select id, email, display_name, initials, role, active
from public.profiles
order by display_name nulls last, email;

select
  status,
  count(*) as contacts
from public.contacts
group by status
order by status;
