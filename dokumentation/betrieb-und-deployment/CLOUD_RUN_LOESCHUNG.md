# Spätere Löschung des historischen Cloud-Run-Stacks

Status: gesperrter Folge-Change; nicht beauftragt und nicht ausgeführt

Frühester Prüftermin: 19. August 2026. Das Datum ist nur ein Review-Gate und keine automatische Löschfreigabe.

## Harte Trennung vom Abschalt-Change

Dieses Runbook ist nur die Entscheidungsvorlage für eine spätere Bereinigung. Das Abschaltskript besitzt absichtlich keine `delete`- oder `purge`-Aktion. Vor Erreichen des Prüftermins und ohne neuen protokollierten Auftrag darf keine der hier genannten Ressourcen gelöscht und kein Temporary Hold aufgehoben werden.

## Lösch-Gate

Alle Punkte müssen neu bestätigt werden:

- [ ] `retainUntil` aus dem unveränderten Snapshot-Manifest ist erreicht; Manifest-SHA-256 und alle erfassten `SHA256SUMS` wurden vorher erfolgreich geprüft.
- [ ] Initiales Backup `1784554627279` und finales Post-Disable-Backup `1784556843744` sind weiterhin `SUCCESSFUL`; beide gehaltenen SQL-Exporte stimmen mit den erfassten Größen und Hashes überein.
- [ ] Die technische Offline-Verifikation und das Beobachtungsfenster sind ohne Rückholbedarf abgeschlossen.
- [ ] Produkt-/Link-Owner bestätigt, dass keine alte URL mehr benötigt wird.
- [ ] Datenverantwortung und Datenschutz haben Aufbewahrung beziehungsweise Löschung je Datenklasse entschieden.
- [ ] Ein Restore des finalen SQL-Exports oder On-Demand-Backups wurde isoliert getestet und protokolliert.
- [ ] Evidence, benötigte Logs und ein langfristig aufzubewahrender Export liegen außerhalb des Löschumfangs; vor einer Projektlöschung auch außerhalb des Projekts `steam-capsule-341212`.
- [ ] Cloud-Run-Images werden nicht mehr für Rollback benötigt.
- [ ] Der neue Change nennt Bearbeiter, Zeitpunkt, Ticket/Freigabe und exakte Ressourcen-IDs.
- [ ] Zwei unabhängige Freigaben für irreversible Datenlöschung liegen vor.

## Kandidaten und ressourcenspezifische Entscheidung

| Reihenfolge | Kandidat | Vorbedingung |
| --- | --- | --- |
| 1 | Cloud Run `versorgungs-kompass-api`, `versorgungs-kompass-demo`, `versorgungs-kompass-frontend`, `versorgungs-kompass-gcp-demo` | Revisionen/URLs nicht mehr benötigt; keine Eventquelle; Evidence extern gesichert |
| 2 | IAP-/IAM-Bindungen, die ausschließlich zu den vier Diensten gehören | projektweite Default-Compute-Service-Account ausdrücklich ausnehmen |
| 3 | Secret `versorgungs-kompass-gcp-demo-db-password` | kein Rollback mehr; aktive Version und Auditentscheidung dokumentiert |
| 4 | Artifact Registry `versorgungs-kompass` oder einzelne Images | pro Digest bestätigen; kein Cleanup des Pre-gematik-Repositories |
| 5 | Cloud SQL `versorgungs-kompass-gcp-demo-db` | finaler portabler Export außerhalb der Instanz, Restore-Test, Final-/Retained-Backup-Entscheidung, Deletion Protection separat aufheben |
| 6 | Bilder-Bucket und seine drei Avatar-Objekte | Datenklassifizierung, Löschfreigabe, Holds gezielt lösen, Soft-Delete-Nachlauf berücksichtigen |
| 7 | Migrations-Bucket samt SQL-/Evidence-Objekten | Evidence und aufzubewahrende Exporte zuerst in genehmigtes Archiv außerhalb des Löschumfangs verschieben; Holds gezielt lösen |

Nicht in den Scope gehören GKE/Pre-gematik, `vk-pre-gematik-postgres`, `versorgungs-kompass-pre-gematik`, `vk-pre-gematik`-Secrets/-Buckets/-Netzwerk/-Load-Balancer, die Default-Compute-Service-Account und der Cloud-Build-Systembucket.

## Löschreihenfolge und Verifikation

1. Manifest-Hash und lokale sowie archivierte Prüfsummen validieren; erst danach ein neues Live-Inventar erzeugen und gegen den ursprünglichen Scope diffen.
2. DNS, Trigger, Automatisierungen und Abhängigkeiten erneut prüfen; keine Annahme aus dem Juli ungeprüft übernehmen.
3. Cloud-Run-Services einzeln löschen und Audit-Logs sichern. Eine Service-Löschung entfernt alle Revisionen dauerhaft, aber nicht automatisch Images oder Eventarc-Trigger.
4. Secret und Images nur gemäß der ressourcenspezifischen Freigabe bereinigen.
5. Datenressourcen zuletzt behandeln. Cloud-SQL-Deletion-Protection und Storage Temporary Holds dürfen nur im neuen Change und nur für exakt benannte Ressourcen aufgehoben werden.
6. Nach jedem Schritt Existenz, Kostenrest, IAM, DNS, Soft Delete, retained/final backups und geschützte Zielressourcen prüfen.
7. Ein Löschprotokoll mit Zeit, Akteur, Befehlen, Ressourcen-IDs und Ergebnissen ablegen.

Ein Projekt-Shutdown ist kein Ersatz für diesen Ablauf. Cloud-Run-Namen können später im selben Projekt und derselben Region erneut dieselbe permanente URL erhalten; deshalb bleibt auch nach Löschung ein Re-Deploy-/DNS-Monitoring nötig.

## Offizielle Verfahrensgrundlagen

- [Cloud Run Services löschen](https://docs.cloud.google.com/run/docs/managing/services)
- [Cloud SQL Instanzen löschen und Final Backup berücksichtigen](https://docs.cloud.google.com/sql/docs/postgres/delete-instance)
- [Cloud SQL retained backups verwalten](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/manage-standard-backups)
- [Cloud Storage Object Holds setzen und lösen](https://docs.cloud.google.com/storage/docs/holding-objects)
- [Cloud Storage Soft Delete](https://docs.cloud.google.com/storage/docs/soft-delete)
