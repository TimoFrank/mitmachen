#!/bin/sh
set -eu
umask 077

operation_id="${RESTIC_OPERATION_ID:-}"
printf '%s' "$operation_id" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$' \
  || { echo "FEHLER: RESTIC_OPERATION_ID ist ungueltig." >&2; exit 1; }
candidate_tag="candidate-$operation_id"
operation_tag="operation-$operation_id"
source_revision="${BACKUP_SOURCE_REVISION:-}"
product_version="${BACKUP_PRODUCT_VERSION:-}"
printf '%s' "$source_revision" | grep -Eq '^[a-f0-9]{40,64}$' \
  || { echo "FEHLER: BACKUP_SOURCE_REVISION ist ungueltig." >&2; exit 1; }
printf '%s' "$product_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "FEHLER: BACKUP_PRODUCT_VERSION ist ungueltig." >&2; exit 1; }
revision_tag="revision-$source_revision"
version_tag="version-$product_version"

restic cat config >/dev/null
[ -d "/source/database/snapshots/$operation_id" ] \
  || { echo "FEHLER: Der exakt operationsgebundene Datenbank-Snapshot fehlt." >&2; exit 1; }
backup_events="/tmp/restic-backup-events.jsonl"
set +e
restic backup --json \
  --host versorgungs-kompass-single-server \
  --tag "$candidate_tag" \
  --tag "$operation_tag" \
  "/source/database/snapshots/$operation_id" \
  /source/object-storage >"$backup_events"
backup_status="$?"
set -e
if [ "$backup_status" -ne 0 ]; then
  cat "$backup_events" >&2
  echo "FEHLER: Restic-Kandidat wurde nicht finalisiert; Exit $backup_status." >&2
  exit "$backup_status"
fi

snapshot_json="$(restic snapshots --json --host versorgungs-kompass-single-server --tag "$operation_tag")"
snapshot_ids="$(printf '%s\n' "$snapshot_json" \
  | grep -Eo '"id"[[:space:]]*:[[:space:]]*"[a-f0-9]{64}"' \
  | sed -E 's/.*"([a-f0-9]{64})"/\1/')"
[ "$(printf '%s\n' "$snapshot_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')" = "1" ] \
  || { echo "FEHLER: Restic-Kandidat ist nach Exit 0 nicht eindeutig." >&2; exit 1; }
snapshot_id="$(printf '%s\n' "$snapshot_ids" | sed '/^$/d')"

tag_events="/tmp/restic-tag-events.jsonl"
restic tag --json \
  --add versorgungs-kompass \
  --add daily \
  --add "$revision_tag" \
  --add "$version_tag" \
  --remove "$candidate_tag" \
  "$snapshot_id" >"$tag_events"
changed_events="$(grep -E '"message_type"[[:space:]]*:[[:space:]]*"changed"' "$tag_events" || true)"
[ "$(printf '%s\n' "$changed_events" | sed '/^$/d' | wc -l | tr -d '[:space:]')" = "1" ] \
  && grep -Eq '"message_type"[[:space:]]*:[[:space:]]*"summary".*"changed_snapshots"[[:space:]]*:[[:space:]]*1' "$tag_events" \
  || { echo "FEHLER: Restic-Tagging lieferte keinen eindeutigen neuen Snapshot." >&2; exit 1; }
old_snapshot_id="$(printf '%s\n' "$changed_events" | sed -nE 's/.*"old_snapshot_id"[[:space:]]*:[[:space:]]*"([a-f0-9]{64})".*/\1/p')"
new_snapshot_id="$(printf '%s\n' "$changed_events" | sed -nE 's/.*"new_snapshot_id"[[:space:]]*:[[:space:]]*"([a-f0-9]{64})".*/\1/p')"
[ "$old_snapshot_id" = "$snapshot_id" ] \
  && printf '%s' "$new_snapshot_id" | grep -Eq '^[a-f0-9]{64}$' \
  || { echo "FEHLER: Restic-Tagging ist nicht exakt an den Kandidaten-Snapshot gebunden." >&2; exit 1; }
snapshot_id="$new_snapshot_id"

final_json="$(restic snapshots --json "$snapshot_id")"
printf '%s' "$final_json" | grep -Fq '"versorgungs-kompass"' \
  && printf '%s' "$final_json" | grep -Fq '"daily"' \
  && printf '%s' "$final_json" | grep -Fq "\"$operation_tag\"" \
  && printf '%s' "$final_json" | grep -Fq "\"$revision_tag\"" \
  && printf '%s' "$final_json" | grep -Fq "\"$version_tag\"" \
  && ! printf '%s' "$final_json" | grep -Fq "\"$candidate_tag\"" \
  || { echo "FEHLER: Finaler Restic-Tag-Readback ist unvollstaendig." >&2; exit 1; }

printf 'Verschluesselter gemeinsamer Offsite-Snapshot finalisiert: %s\n' "$snapshot_id"
