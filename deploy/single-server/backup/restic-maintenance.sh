#!/bin/sh
set -eu
umask 077

case "${RESTIC_RETENTION:-0}:${RESTIC_PRUNE:-0}:${RESTIC_CHECK:-0}:${RESTIC_UNLOCK:-0}:${RESTIC_RECOVER_OPERATION_ID:-}" in
  0:0:0:0:) echo "FEHLER: Keine Restic-Wartungsoperation ausgewaehlt." >&2; exit 1 ;;
esac
for flag in RESTIC_RETENTION RESTIC_PRUNE RESTIC_CHECK RESTIC_UNLOCK; do
  eval "value=\${$flag:-0}"
  case "$value" in
    0|1) ;;
    *) echo "FEHLER: $flag muss 0 oder 1 sein." >&2; exit 1 ;;
  esac
done

restic cat config >/dev/null

if [ "${RESTIC_UNLOCK:-0}" = "1" ]; then
  restic unlock
fi

if [ -n "${RESTIC_RECOVER_OPERATION_ID:-}" ]; then
  printf '%s' "$RESTIC_RECOVER_OPERATION_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[1-9][0-9]*$' \
    || { echo "FEHLER: RESTIC_RECOVER_OPERATION_ID ist ungueltig." >&2; exit 1; }
  operation_tag="operation-$RESTIC_RECOVER_OPERATION_ID"
  candidate_tag="candidate-$RESTIC_RECOVER_OPERATION_ID"
  recovery_json="$(restic snapshots --json --host versorgungs-kompass-single-server --tag "$operation_tag")"
  recovery_ids="$(printf '%s\n' "$recovery_json" \
    | grep -Eo '"id"[[:space:]]*:[[:space:]]*"[a-f0-9]{64}"' \
    | sed -E 's/.*"([a-f0-9]{64})"/\1/')"
  recovery_count="$(printf '%s\n' "$recovery_ids" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
  [ "$recovery_count" -le 1 ] \
    || { echo "FEHLER: Backup-Recovery fand mehrere Snapshots fuer eine Operation." >&2; exit 1; }
  if [ "$recovery_count" = "1" ]; then
    recovery_id="$(printf '%s\n' "$recovery_ids" | sed '/^$/d')"
    recovery_snapshot="$(restic snapshots --json "$recovery_id")"
    if printf '%s' "$recovery_snapshot" | grep -Fq "\"$candidate_tag\""; then
      restic forget "$recovery_id"
    elif printf '%s' "$recovery_snapshot" | grep -Fq '"versorgungs-kompass"' \
      && printf '%s' "$recovery_snapshot" | grep -Fq '"daily"' \
      && printf '%s' "$recovery_snapshot" | grep -Fq "\"$operation_tag\"" \
      && printf '%s' "$recovery_snapshot" | grep -Fq "\"revision-${EXPECTED_SOURCE_REVISION:-missing}\"" \
      && printf '%s' "$recovery_snapshot" | grep -Fq "\"version-${EXPECTED_PRODUCT_VERSION:-missing}\""; then
      printf 'Bereits finalisierten Snapshot beibehalten: %s\n' "$recovery_id"
    else
      echo "FEHLER: Snapshot der abgebrochenen Operation besitzt einen mehrdeutigen Tag-Zustand." >&2
      exit 1
    fi
  fi
fi

if [ "${RESTIC_RETENTION:-0}" = "1" ]; then
  restic forget \
    --host versorgungs-kompass-single-server \
    --tag versorgungs-kompass \
    --group-by host \
    --keep-daily 14 \
    --keep-weekly 8 \
    --keep-monthly 6
fi

if [ "${RESTIC_PRUNE:-0}" = "1" ]; then
  restic prune
fi

if [ "${RESTIC_CHECK:-0}" = "1" ]; then
  restic check
fi

printf '%s\n' "Restic-Retention/Wartung erfolgreich."
