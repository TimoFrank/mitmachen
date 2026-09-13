#!/bin/sh
set -eu
umask 077
export LC_ALL=C

die() {
  printf 'FEHLER: %s\n' "$*" >&2
  exit 1
}

[ "${PGDATABASE:-}" = "versorgungs_kompass" ] \
  || die "PGDATABASE muss exakt versorgungs_kompass sein."
[ -n "${MIGRATION_PACKAGE_SHA256:-}" ] \
  || die "MIGRATION_PACKAGE_SHA256 fehlt."
printf '%s' "$MIGRATION_PACKAGE_SHA256" | grep -Eq '^[a-f0-9]{64}$' \
  || die "MIGRATION_PACKAGE_SHA256 ist ungueltig."
[ -n "${MIGRATION_CONFIRMATION:-}" ] \
  || die "MIGRATION_CONFIRMATION fehlt."
migration_mode="${MIGRATION_MODE:-apply}"
case "$migration_mode" in
  apply|readback) ;;
  *) die "MIGRATION_MODE muss apply oder readback sein." ;;
esac

max_dump_bytes="${MIGRATION_MAX_DUMP_BYTES:-5368709120}"
printf '%s' "$max_dump_bytes" | grep -Eq '^[1-9][0-9]{6,10}$' \
  || die "MIGRATION_MAX_DUMP_BYTES ist ungueltig."
[ "$max_dump_bytes" -le 10737418240 ] \
  || die "MIGRATION_MAX_DUMP_BYTES darf 10 GiB nicht ueberschreiten."

password_file="${PGPASSWORD_FILE:?PGPASSWORD_FILE fehlt}"
[ -f "$password_file" ] && [ ! -L "$password_file" ] \
  || die "Datenbankpasswortdatei fehlt oder ist ein Symlink."
[ "$(wc -l <"$password_file" | tr -d '[:space:]')" = "0" ] \
  || die "Datenbankpasswort darf keinen Zeilenumbruch enthalten."
PGPASSWORD="$(cat "$password_file")"
[ "$(printf '%s' "$PGPASSWORD" | wc -c | tr -d '[:space:]')" -ge 24 ] \
  || die "Datenbankpasswort ist ungueltig."
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT
trap 'trap - HUP INT TERM; exit 129' HUP
trap 'trap - HUP INT TERM; exit 130' INT
trap 'trap - HUP INT TERM; exit 143' TERM

package_files="database.dump database.toc migration-metadata.tsv row-counts.tsv storage-reference-counts.tsv SHA256SUMS"
set -- /migration/*
[ "$#" -eq 6 ] || die "Migrationsverzeichnis muss genau sechs Paketdateien enthalten."
for hidden in /migration/.[!.]* /migration/..?*; do
  { [ ! -e "$hidden" ] && [ ! -L "$hidden" ]; } \
    || die "Versteckte oder zusaetzliche Migrationsdatei ist nicht erlaubt."
done
for name in $package_files; do
  [ -f "/migration/$name" ] && [ ! -L "/migration/$name" ] \
    || die "Migrationsdatei fehlt, ist kein regulaeres File oder ist ein Symlink: $name"
done

dump_bytes="$(wc -c < /migration/database.dump | tr -d '[:space:]')"
printf '%s' "$dump_bytes" | grep -Eq '^[1-9][0-9]*$' \
  || die "database.dump ist leer oder unlesbar."
[ "$dump_bytes" -le "$max_dump_bytes" ] \
  || die "database.dump ueberschreitet die konfigurierte Groessengrenze."

awk '
  BEGIN {
    allowed["database.dump"] = 1
    allowed["database.toc"] = 1
    allowed["migration-metadata.tsv"] = 1
    allowed["row-counts.tsv"] = 1
    allowed["storage-reference-counts.tsv"] = 1
  }
  NF != 2 || length($1) != 64 || $1 !~ /^[a-f0-9]+$/ || !($2 in allowed) || seen[$2]++ { invalid=1 }
  END {
    if (NR != 5) invalid=1
    for (name in allowed) if (seen[name] != 1) invalid=1
    exit invalid
  }
' /migration/SHA256SUMS \
  || die "SHA256SUMS muss genau einen kanonischen Eintrag je Paketdatei enthalten."

actual_package_sha256="$(sha256sum /migration/SHA256SUMS | awk '{print $1}')"
[ "$actual_package_sha256" = "$MIGRATION_PACKAGE_SHA256" ] \
  || die "SHA256SUMS stimmt nicht mit dem bestaetigten Paketfingerprint ueberein."
expected_confirmation="IMPORT versorgungs_kompass PACKAGE $actual_package_sha256"
[ "$MIGRATION_CONFIRMATION" = "$expected_confirmation" ] \
  || die "Importbestaetigung stimmt nicht exakt mit dem Paketfingerprint ueberein."
(
  cd /migration
  sha256sum -c SHA256SUMS >/dev/null
) || die "SHA256-Pruefung des Migrationspakets ist fehlgeschlagen."

awk -F '\t' '
  NF != 2 { exit 1 }
  NR == 1 { if ($0 != "key\tvalue") exit 1; next }
  NR == 2 { if ($1 != "database" || $2 != "versorgungs_kompass") exit 1; next }
  NR == 3 { if ($1 != "format_version" || $2 != "2") exit 1; next }
  NR == 4 { if ($1 != "postgres_major" || $2 != "16") exit 1; next }
  NR == 5 {
    if ($1 != "source_deployed_revision" || $2 !~ /^[a-f0-9]+$/ || (length($2) != 40 && length($2) != 64)) exit 1
    next
  }
  NR == 6 {
    if ($1 != "target_revision" || $2 !~ /^[a-f0-9]+$/ || (length($2) != 40 && length($2) != 64)) exit 1
    next
  }
  NR == 7 {
    if ($1 != "cloud_sql_instance_connection_name" || $2 !~ /^[a-z][a-z0-9-]{4,28}[a-z0-9]:[a-z0-9-]+:[a-z][a-z0-9-]{0,96}[a-z0-9]$/) exit 1
    next
  }
  NR >= 8 && NR <= 11 {
    expected[8]="gke_binding_fingerprint"
    expected[9]="gke_freeze_state_sha256"
    expected[10]="global_writer_attestation_sha256"
    expected[11]="namespace_inventory_sha256"
    if ($1 != expected[NR] || $2 !~ /^[a-f0-9]{64}$/) exit 1
    next
  }
  NR == 12 {
    if ($1 != "database_snapshot_id" || $2 !~ /^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/) exit 1
    next
  }
  NR == 13 {
    if ($1 != "exported_at" || $2 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/) exit 1
    next
  }
  { exit 1 }
  END { if (NR != 13) exit 1 }
' /migration/migration-metadata.tsv \
  || die "migration-metadata.tsv ist nicht kanonisch oder unvollstaendig."
metadata_target_revision="$(awk -F '\t' '$1 == "target_revision" { print $2 }' /migration/migration-metadata.tsv)"
[ "$metadata_target_revision" = "${TARGET_SOURCE_REVISION:-}" ] \
  || die "Zielrevision im Migrationspaket stimmt nicht exakt mit der laufenden Zielrevision ueberein."

pg_restore --list /migration/database.dump >/tmp/database.generated.toc
cmp -s /migration/database.toc /tmp/database.generated.toc \
  || die "database.toc stimmt nicht vollstaendig mit database.dump ueberein."
awk '
  /^[[:space:]]*$/ { next }
  /^;/ { next }
  /^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public [a-z0-9_]+ [a-zA-Z0-9_]+$/ { allowed++; next }
  /^[0-9]+; [0-9]+ [0-9]+ SEQUENCE SET public [a-z0-9_]+ [a-zA-Z0-9_]+$/ { allowed++; next }
  { invalid=1 }
  END { exit invalid || allowed < 1 }
' /migration/database.toc \
  || die "Dump-TOC enthaelt andere Eintraege als TABLE DATA oder SEQUENCE SET im Schema public."

awk -F '\t' '
  NR == 1 { if ($0 != "schema\ttable\trows") exit 1; next }
  NF != 3 || $1 != "public" || $2 !~ /^[a-z0-9_]+$/ || $3 !~ /^(0|[1-9][0-9]*)$/ { exit 1 }
  { key=$1 "\t" $2; if (previous != "" && key <= previous) exit 1; previous=key; rows++ }
  END { if (NR < 2 || rows < 1) exit 1 }
' /migration/row-counts.tsv \
  || die "row-counts.tsv ist nicht kanonisch, vollstaendig sortiert und eindeutig."

cat >/tmp/expected-storage-reference-counts.tsv <<'EOF'
reference_type	rows
contact_images	0
contact_note_attachments	0
profile_images	0
stakeholder_logos	0
EOF
cmp -s /migration/storage-reference-counts.tsv /tmp/expected-storage-reference-counts.tsv \
  || die "Objektreferenzmanifest muss fuer alle vier GCS-Datenbereiche exakt null ausweisen."

server_version="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='show server_version_num' | tr -d '[:space:]')"
printf '%s' "$server_version" | grep -Eq '^16[0-9]{4}$' \
  || die "Ziel-Datenbank muss PostgreSQL 16 verwenden."
current_database="$(psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='select current_database()' | tr -d '[:space:]')"
[ "$current_database" = "versorgungs_kompass" ] \
  || die "Unerwartete Ziel-Datenbank."

cut -f1,2 /migration/row-counts.tsv | tail -n +2 >/tmp/manifest-tables.tsv
psql --no-psqlrc --quiet --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 --field-separator="$(printf '\t')" <<'SQL' \
  >/tmp/target-tables.tsv
select n.nspname, c.relname
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname;
SQL
cmp -s /tmp/manifest-tables.tsv /tmp/target-tables.tsv \
  || die "Quellmanifest und Ziel-Schema enthalten nicht exakt dieselben Anwendungstabellen."

write_row_counts() {
  output="$1"
  printf 'schema\ttable\trows\n' >"$output"
  psql --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --field-separator="$(printf '\t')" <<'SQL' >>"$output"
select format(
  'select %L::text, %L::text, count(*)::bigint from %I.%I;',
  n.nspname,
  c.relname,
  n.nspname,
  c.relname
)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by n.nspname, c.relname
\gexec
SQL
}

write_storage_reference_counts() {
  output="$1"
  printf 'reference_type\trows\n' >"$output"
  psql --no-psqlrc --quiet --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --field-separator="$(printf '\t')" <<'SQL' >>"$output"
select reference_type, rows
from (
  select 'contact_images'::text as reference_type,
         count(*)::bigint as rows
  from public.contacts
  where nullif(btrim(image_storage_path), '') is not null
  union all
  select 'contact_note_attachments', count(*)::bigint
  from public.contact_note_attachments
  union all
  select 'profile_images', count(*)::bigint
  from public.profiles
  where avatar_url like 'gs://%'
     or avatar_url like 'private://profile-images/%'
  union all
  select 'stakeholder_logos', count(*)::bigint
  from public.stakeholder_organizations
  where logo_url like 'private://stakeholder-logos/%'
) counts
order by reference_type;
SQL
}

if [ "$migration_mode" = "readback" ]; then
  write_row_counts /tmp/imported-row-counts.tsv
  write_storage_reference_counts /tmp/imported-storage-reference-counts.tsv
  if cmp -s /migration/row-counts.tsv /tmp/imported-row-counts.tsv \
    && cmp -s /migration/storage-reference-counts.tsv /tmp/imported-storage-reference-counts.tsv; then
    printf '%s\n' "IMPORT_READBACK=complete"
    exit 0
  fi
  if awk -F '\t' 'NR > 1 && $3 != "0" { nonempty=1 } END { exit nonempty }' /tmp/imported-row-counts.tsv \
    && cmp -s /migration/storage-reference-counts.tsv /tmp/imported-storage-reference-counts.tsv; then
    printf '%s\n' "IMPORT_READBACK=empty"
    exit 20
  fi
  die "Import-Readback ist weder exakt vollstaendig noch atomar leer."
fi

psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 <<'SQL'
do $migration_empty_check$
declare
  target record;
  contains_rows boolean;
begin
  for target in
    select n.nspname, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by n.nspname, c.relname
  loop
    execute format(
      'select exists (select 1 from %I.%I limit 1)',
      target.nspname,
      target.relname
    ) into contains_rows;
    if contains_rows then
      raise exception 'Ziel-Datenbank ist nicht leer: %.%', target.nspname, target.relname
        using errcode = '55000';
    end if;
  end loop;
end
$migration_empty_check$;
SQL

pg_restore \
  --dbname="$PGDATABASE" \
  --exit-on-error \
  --single-transaction \
  --data-only \
  --disable-triggers \
  --no-owner \
  --no-privileges \
  --use-list=/migration/database.toc \
  /migration/database.dump

write_row_counts /tmp/imported-row-counts.tsv
cmp -s /migration/row-counts.tsv /tmp/imported-row-counts.tsv \
  || die "Zeilenzahlen stimmen nach dem Import nicht mit dem Quellmanifest ueberein."
write_storage_reference_counts /tmp/imported-storage-reference-counts.tsv
cmp -s /migration/storage-reference-counts.tsv /tmp/imported-storage-reference-counts.tsv \
  || die "Objektreferenzzaehlungen stimmen nach dem Import nicht mit dem Nullmanifest ueberein."

unset PGPASSWORD
trap - EXIT HUP INT TERM
printf 'Datenimport atomar abgeschlossen; Tabellen- und Objektreferenzzaehlungen stimmen ueberein.\n'
