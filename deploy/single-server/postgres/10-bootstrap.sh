#!/bin/sh
set -eu

umask 077

app_password_file="${VK_APP_PASSWORD_FILE:?VK_APP_PASSWORD_FILE fehlt}"
if [ ! -f "$app_password_file" ]; then
  echo "FEHLER: App-Datenbankpasswort fehlt." >&2
  exit 1
fi

VK_APP_DATABASE_PASSWORD="$(cat "$app_password_file")"
export VK_APP_DATABASE_PASSWORD
if [ -z "$VK_APP_DATABASE_PASSWORD" ] || [ "$(printf '%s' "$VK_APP_DATABASE_PASSWORD" | wc -c)" -lt 24 ]; then
  echo "FEHLER: App-Datenbankpasswort ist zu kurz." >&2
  exit 1
fi

psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --file=/opt/versorgungs-kompass/schema.sql
psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --file=/opt/versorgungs-kompass/runtime-role.sql
psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --variable=runtime_role=vk_app_runtime --file=/opt/versorgungs-kompass/grants.sql

psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password VK_APP_DATABASE_PASSWORD

select format(
  'create role vk_app login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L',
  :'app_password'
)
where not exists (select 1 from pg_catalog.pg_roles where rolname = 'vk_app')
\gexec

select format('alter role vk_app password %L', :'app_password')
\gexec

alter role vk_app login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
revoke all on database versorgungs_kompass from vk_app;
grant connect on database versorgungs_kompass to vk_app;
grant vk_app_runtime to vk_app;

do $runtime_membership$
begin
  if (
    select array_agg(role_name order by role_name)
      from (
        select granted_role.rolname as role_name
          from pg_catalog.pg_auth_members membership
          join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
          join pg_catalog.pg_roles member_role on member_role.oid = membership.member
         where member_role.rolname = 'vk_app'
      ) memberships
  ) is distinct from array['vk_app_runtime']::name[] then
    raise exception 'vk_app besitzt unerwartete Rollenmitgliedschaften';
  end if;
end
$runtime_membership$;
SQL

unset VK_APP_DATABASE_PASSWORD
echo "Einzelserver-Datenbank wurde ohne Ausgabe von Zugangsdaten initialisiert."
