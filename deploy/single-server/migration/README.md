# Kontrollierter Datenbankimport auf den Einzelserver

Dieser Pfad übernimmt ausschließlich die Daten und Sequenzstände einer
PostgreSQL-16-Datenbank in das bereits versioniert initialisierte Schema des
Einzelservers. Er erstellt, ändert und löscht keine GCP-Ressourcen und lädt
keine Daten aus GCP herunter. Export und verschlüsselte Übertragung sind ein
getrennter, vom Betreiber freizugebender Vorgang.

Der Import ist kein allgemeiner Restore-Mechanismus. Für Sicherungen und
Restore-Tests gelten die Skripte unter `deploy/single-server/backup/`.

## Blockierende Voraussetzungen

- Quell- und Zielsystem verwenden PostgreSQL 16. Die tatsächlich deployte
  Quellrevision wird als Provenienz erfasst; die separat angegebene
  Zielrevision muss exakt dem für den Einzelserver vorgesehenen Commit
  entsprechen. Beide Revisionen dürfen und werden im Regelfall voneinander
  abweichen.
- Schreibzugriffe auf die Quelldatenbank bleiben vom GKE-Freeze mindestens bis
  zum vollständig abgeschlossenen Initial-Open des VPS gesperrt. Der Abschluss
  verlangt gemeinsam die kanonische Initial-Attestation, die aktuelle
  Open-Attestation, einen fehlenden Cutover-Pending-Marker und den laufenden
  Prozess-Readback `cutoverMode=open`. Vorher ist kein Unfreeze freigegeben;
  bei einem Rollback muss zuerst der VPS-Writer nachweislich geschlossen sein.
  Der versionierte
  `gke-writer-freeze.mjs` skaliert dabei ausschließlich das exakt gebundene
  API-Deployment im konfigurierten Namespace auf null. Writer in anderen
  Namespaces und externe Datenbank-Clients müssen separat ausgeschlossen und
  in einem aktuellen globalen Writer-Nachweis attestiert werden.
- Die vier privaten GCS-Datenbereiche für Profilbilder, Kontaktbilder,
  Notizanhänge und Stakeholder-Logos wurden zuletzt mit null Live-Objekten
  geprüft. Unmittelbar vor dem Cutover muss dieselbe read-only Inventur erneut
  gegen die vier exakten Bucket-Namen laufen und mit Zeitpunkt sowie Ergebnis
  protokolliert werden. Ein Objekt, eine fehlende Leseberechtigung oder ein
  nicht eindeutig bestimmbarer Bestand stoppt den Import. Für diesen Fall ist
  bewusst kein GCS-Importer enthalten.
- Das Exportpaket liegt außerhalb von Git-Checkout, `STATE_DIR` und
  `CONFIG_DIR`. Es enthält genau die unten genannten sechs Dateien.
- Die Ziel-Datenbank wurde durch den Einzelserver-Bootstrap angelegt, enthält
  aber in keiner Anwendungstabelle eine Zeile.

## Exaktes Paketformat

```text
database.dump
database.toc
migration-metadata.tsv
row-counts.tsv
storage-reference-counts.tsv
SHA256SUMS
```

`database.dump` ist ein Custom-Format-Dump mit `--data-only`. `database.toc`
ist die unveränderte Ausgabe von `pg_restore --list database.dump`. Jede
nicht kommentierte TOC-Zeile muss `TABLE DATA public ...` oder
`SEQUENCE SET public ...` beschreiben. Schema-, Rollen-, ACL-, Funktions- oder
Extension-Einträge sind nicht zulässig.

`migration-metadata.tsv` bindet das Paket an Datenbank, PostgreSQL-Hauptversion,
Cloud-SQL-Instanz, GKE-Freeze, Namespace-Inventur, globalen Writer-Nachweis,
exportierten PostgreSQL-Snapshot und den exakt auf dem Ziel ausgecheckten
Commit. Die Quellrevision bleibt getrennt als Herkunftsnachweis erhalten und
wird nicht mit der Zielrevision gleichgesetzt:

```text
key\tvalue
database\tversorgungs_kompass
format_version\t2
postgres_major\t16
source_deployed_revision\t<40- oder 64-stelliger Quell-Live-Commit>
target_revision\t<40- oder 64-stelliger Ziel-Commit>
cloud_sql_instance_connection_name\t<projekt>:<region>:<instanz>
gke_binding_fingerprint\t<64-kleingeschriebene-Hexzeichen>
gke_freeze_state_sha256\t<64-kleingeschriebene-Hexzeichen>
global_writer_attestation_sha256\t<64-kleingeschriebene-Hexzeichen>
namespace_inventory_sha256\t<64-kleingeschriebene-Hexzeichen>
database_snapshot_id\t<exportierte-PostgreSQL-Snapshot-ID>
exported_at\t<UTC-Zeitpunkt>
```

`row-counts.tsv` enthält alle Tabellen des Schemas `public`, exakt einmal und
lexikografisch sortiert:

```text
schema\ttable\trows
public\tactivity_events\t0
public\tprofiles\t4
```

`storage-reference-counts.tsv` muss exakt folgende vier Nullzählungen
enthalten, weil ohne GCS-Objekte keine lokale Objektmigration stattfindet:

```text
reference_type\trows
contact_images\t0
contact_note_attachments\t0
profile_images\t0
stakeholder_logos\t0
```

## GKE-Writer kontrolliert einfrieren

Der Freeze-Operator wird aus demselben sauberen, kanonischen Ziel-Checkout wie
der Export aufgerufen. Seine Vorlage
[`gke-writer-freeze.config.example`](gke-writer-freeze.config.example) wird in
ein neues Verzeichnis außerhalb des Repositories kopiert und durch read-only
ermittelte Zielwerte ersetzt. Dieses Verzeichnis gehört dem aufrufenden Nutzer
und besitzt Modus `0700`; Konfiguration und Kubeconfig besitzen Modus `0600`.
Die konfigurierte `STATE_FILE` darf vor dem ersten Freeze nicht existieren.

Zuerst den laufenden Zustand und danach die zustandsgebundene Freeze-Vorschau
lesen:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  status --config /absoluter/externer/gke-freeze.conf
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf
```

Die Vorschau muss das exakte Projekt, Cluster, Namespace, Deployment, dessen
UID, Image samt Image-ID, urspruengliche Replica-Zahl und
`FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0` ausweisen. `BESTAETIGUNG=FREEZE:...`
wird ausschließlich aus dieser aktuellen Vorschau übernommen:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf \
  --apply --confirm 'FREEZE:<64-HEX-AUS-DER-VORSCHAU>'
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf --readback
```

Nur ein Readback mit `PHASE=readback-frozen`, `REPLICAS=0`, `API_PODS=0`,
`FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0` und
`STATUSDATEI_PHASE=frozen` ist exportfähig. Die Ausgabe weist ausdrücklich nur
das konfigurierte Namespace und API-Deployment nach. Deshalb werden jetzt alle
anderen Namespaces auf Cloud-SQL-/Datenbank-Writer sowie alle externen Clients,
Jobs, Admin-Shells und Automationen unabhängig read-only inventarisiert. Erst
wenn beide Mengen nachweislich leer sind, wird im selben geschützten
Verzeichnis eine neue Datei mit Modus `0600` in exakt dieser Reihenfolge
angelegt:

```text
FORMAT_VERSION=1
GCP_PROJECT_ID=<exaktes-produktivprojekt>
CLOUD_SQL_INSTANCE_CONNECTION_NAME=<projekt>:<region>:<instanz>
GKE_STATE_SHA256=<SHA-256-der-aktuellen-STATE_FILE>
GKE_BINDING_FINGERPRINT=<binding_fingerprint-aus-der-STATE_FILE>
NAMESPACE_INVENTORY_SHA256=<NAMESPACE_INVENTAR_SHA256-aus-dem-Freeze-Readback>
OTHER_NAMESPACES_DB_WRITERS=none
EXTERNAL_DB_WRITERS=none
ATTESTED_AT=<aktueller-UTC-Zeitpunkt-YYYY-MM-DDTHH:MM:SSZ>
```

Werte dürfen nicht aus Beispielen oder Dateinamen übernommen werden. Projekt
und Cloud-SQL-Instanz müssen exakt `source-target.conf` entsprechen; die drei
GKE-Fingerprints müssen aus genau dem unmittelbar zuvor bestätigten
Frozen-Zustand stammen. Der Export akzeptiert den Nachweis höchstens 10 Minuten
nach `ATTESTED_AT`, prüft Inhalt, Alter und unveränderten SHA-256-Wert vor und
nach dem gemeinsamen Datenbank-Snapshot und bindet den Wert an das fertige
Paket. Dauert der Lauf länger, wird ein neuer Nachweis erstellt und mit einem
neuen Exportziel erneut begonnen.

## Export in ein externes Verzeichnis

Der versionierte Wrapper
[`export-database.sh`](export-database.sh) wird nur in einer bereits
freigegebenen, schreibgesperrten Quellumgebung ausgeführt. Er verlangt einen
vollständig sauberen, kanonischen Git-Checkout und leitet `target_revision`
direkt aus dessen `HEAD` ab. Der als drittes Argument übergebene
`source_deployed_revision`-Wert ist kein Secret und muss zuvor am laufenden
Quellsystem nachgewiesen worden sein.

`pg_dump`, `pg_restore` und `psql` müssen aus PostgreSQL 16 stammen. Das
owner-only libpq-Verzeichnis liegt außerhalb des Repositories, besitzt Modus
`0700` und enthält genau drei reguläre Dateien mit Modus `0600`, ohne
Symlinks: `pg_service.conf`, `pgpass` und `source-target.conf`.
Der nur für den Cutover verwendete Exportnutzer benötigt Leserechte auf den
Exportbestand, die für `LOCK TABLE ... IN SHARE MODE` erforderlichen Rechte
und `pg_read_all_stats`. Der Wrapper nutzt diese Monitoringrolle ausschließlich,
um vor dem Snapshot null andere Client-Sessions und vor dessen Freigabe genau
seine eigene eindeutig benannte Snapshot-Halter-Session nachzuweisen. Jede
weitere oder nicht lesbare Session stoppt fail-closed.

`source-target.conf` wird nicht aus der Datenbankadresse geraten, sondern aus
der unabhängig read-only bestätigten produktiven GCP-/Cloud-SQL-Konfiguration
befüllt. Es besitzt exakt diese Reihenfolge und keine Zusatzfelder:

```text
FORMAT_VERSION=1
GCP_PROJECT_ID=<exaktes-produktivprojekt>
CLOUD_SQL_INSTANCE_CONNECTION_NAME=<projekt>:<region>:<instanz>
CLOUD_SQL_DATABASE=versorgungs_kompass
CLOUD_SQL_USER=<exakter-exportnutzer>
```

Der aktive `gcloud`-Kontext muss genau dieses Projekt verwenden. Der Wrapper
liest die benannte Instanz erneut über die Cloud-SQL-API und verlangt den
exakten `connectionName`, dasselbe Projekt, `POSTGRES_16` und `RUNNABLE`.
`pg_service.conf` darf danach nur aus diesen sechs Zeilen bestehen:

```text
[versorgungs-kompass-source]
host=/cloudsql/<projekt>:<region>:<instanz>
port=5432
dbname=versorgungs_kompass
user=<exakter-exportnutzer>
sslmode=disable
```

Der Unix-Socket muss vom bereits separat gestarteten und durch dessen eigenen
Start- und Prozessnachweis auf genau diese Instanz gebundenen Cloud SQL Auth
Proxy bereitgestellt werden; dessen Verbindung ist
verschlüsselt, während die lokale Socket-Strecke kein irreführendes zweites
TLS verwendet. Das Passwort liegt getrennt in `pgpass`. Weder `password` noch
`passfile` oder beliebige Zusatzparameter sind in `pg_service.conf` erlaubt.
`pgpass` wird mit einem geschützten Editor befüllt; das Passwort erscheint in
keinem Prozessargument und keiner Environment-Variable.

Der ebenfalls externe Export-Elternpfad muss bereits existieren, dem
aufrufenden Nutzer gehören und Modus `0700` besitzen. Das konkrete Exportziel
darf noch nicht existieren. Repository, libpq-Verzeichnis und Exportziel
dürfen in keiner Richtung ineinander verschachtelt sein.

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/export-database.sh \
  /absoluter/externer/export-elternpfad/cutover-2026-09-11 \
  /absoluter/externer/libpq-pfad \
  '<exakter-deployter-quell-live-commit>' \
  /absoluter/externer/gke-freeze.conf \
  /absoluter/externer/global-writer-attestation.conf
```

Der Wrapper löscht zunächst alle geerbten libpq-Variablen. Jeder
Datenbankprozess startet danach mit einer neu aufgebauten Minimalumgebung, die
nur den festen Servicenamen sowie die beiden libpq-Konfigurationspfade kennt.
Nach allen Pfad-, Rechte-, Repository-, GCP-Ziel-, Tool- und
Verbindungsprüfungen verlangt er selbst einen aktuellen Frozen-Readback und
den exakt daran sowie an Cloud SQL gebundenen globalen Writer-Nachweis. Direkt
danach bestätigt er über `pg_stat_activity`, dass keine andere Client-Session
mehr an der Quelldatenbank hängt. Danach
legt er das
Exportziel atomar neu und leer mit Modus `0700` an. Er erzeugt den
`--data-only`-Dump und beide Zählmanifeste aus einem einzigen exportierten
PostgreSQL-Snapshot, prüft den TOC und verlangt die vier exakten
Nullzählungen. Der gemeinsame Snapshot hält für die vorhandenen Tabellen des
Schemas `public` SHARE-Sperren; damit können dort während des Paketlaufs keine
Daten geändert werden. Andere Namespaces und externe Writer bleiben zusätzlich
das oben attestierte Betriebsgate. Vor der Finalisierung wiederholt der Wrapper
den Frozen-Readback sowie den globalen Writer-Nachweis und verlangt
unveränderte Statusdatei-, Binding-, Namespace- und Attestation-Fingerprints. Erst
dann muss der technische Session-Readback genau die noch SHARE-Sperren haltende,
vom Wrapper eindeutig benannte Snapshot-Session und keine weitere Session
finden. Erst
dann schreibt er die sechs Paketdateien mit Modus `0600`. Ein abgebrochener
Export bleibt als gesperrtes unvollständiges Verzeichnis zur Sichtprüfung
liegen und darf nicht wiederverwendet werden; für einen erneuten Lauf wird ein
neuer Zielname gewählt.

Nach erfolgreichem Export den Frozen-Zustand ein weiteres Mal explizit lesen
und bis zum oben definierten vollständigen Initial-Open-Abschluss des VPS
unverändert erhalten:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf --readback
```

Vor dem Initial-Open sind `unfreeze`, `close` und ein neuer Freeze-Zyklus
unzulässig: Sie invalidieren den historischen Freeze des Pakets. In diesem Fall
gibt es keinen Override; ein neuer Freeze, Export und Import ist erforderlich.
Nur bei einem abgebrochenen Cutover beziehungsweise einem später bewusst
ausgelösten Rollback wird zuerst der VPS-Writer nachweislich `closed` gesetzt.
Erst danach darf die alte Quelle mit den jeweils frisch vorgelesenen
Bestätigungstexten wieder geöffnet und der Freeze-Zyklus archiviert werden:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  unfreeze --config /absoluter/externer/gke-freeze.conf
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  unfreeze --config /absoluter/externer/gke-freeze.conf \
  --apply --confirm 'UNFREEZE:<64-HEX-AUS-DER-VORSCHAU>'
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  unfreeze --config /absoluter/externer/gke-freeze.conf --readback
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  close --config /absoluter/externer/gke-freeze.conf
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  close --config /absoluter/externer/gke-freeze.conf \
  --apply --confirm 'CLOSE:<64-HEX-AUS-DER-VORSCHAU>'
```

Jede `UNFREEZE:`- und `CLOSE:`-Bestätigung stammt aus der jeweils unmittelbar
vorherigen Vorschau. `unfreeze --readback` muss die urspruengliche Replica-Zahl,
die exakte Image-ID und `STATUSDATEI_PHASE=unfrozen` bestätigen. `close`
archiviert erst danach die Statusdatei unter dem ausgegebenen unveränderlichen
Archivpfad und macht den konfigurierten `STATE_FILE`-Pfad für einen späteren
neuen Zyklus frei. Bleibt die Quelle als Rollback-Stand absichtlich
schreibgesperrt, werden Unfreeze und Close bis zur ausdrücklichen Entscheidung
nicht ausgeführt; Statusdatei und Attestation bleiben geschützt erhalten.

Vor der Übertragung müssen `database.toc`, beide TSV-Dateien und
`SHA256SUMS` auf einem getrennten Lesepfad geprüft werden. Das Paket wird nur
verschlüsselt und außerhalb des Git-Repositories auf den Zielhost
übertragen. Die drei Quellkonfigurationsdateien bleiben auf der Quelle. Auf dem Zielhost
gehören Verzeichnis und Dateien der gemeinsamen, nicht privilegierten
Daten-UID/GID `70:70`; das Verzeichnis hat Modus `0700`, die sechs Dateien
`0600`.

## Import auf dem Zielhost

`MIGRATION_DIR` in der externen Environment-Datei bezeichnet das geschützte
Paketverzeichnis. Der erste Aufruf ohne Bestätigung ist read-only und gibt den
exakten, an `SHA256SUMS` gebundenen Bestätigungstext aus:

```bash
sudo deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env
```

Danach wird derselbe Aufruf mit dem vollständigen Text als zweitem Argument
wiederholt. Erst bei exakter Übereinstimmung stoppt der Wrapper die laufende
API, führt den Importcontainer aus und startet die API nach erfolgreichem
Zeilenabgleich wieder. Bei jedem Import- oder Prüffehler bleibt die API
absichtlich gestoppt. Nach erfolgreichem Import und stabilem API-Readback im
Cutover-Modus `closed` persistiert der Wrapper atomar und datenträgersynchron
`STATE_DIR/.database-import-attestation` mit exakt folgendem Inhalt:

```text
schemaVersion=1
packageSha256=<SHA-256-von-SHA256SUMS>
sourceRevision=<exakte-Zielrevision>
operationId=<UTC-Kompaktzeitpunkt>-<Prozess-ID>
importedAt=<UTC-Zeitpunkt>
```

Die Datei gehört `root:root`, besitzt Modus `0600` und wird nicht
überschrieben. Ihr Vorhandensein sperrt jeden weiteren normalen Import; sie ist
der dauerhafte, später vom Cutover-Gate zu bindende Nachweis des tatsächlich
importierten Pakets und Ziel-Commits.

Ein harter Prozess- oder Hostabbruch nach Anlage von
`STATE_DIR/.database-import-recovery-required` wird nicht durch einen normalen
API-Start übergangen. Nach zuerst abgeschlossener Backup-Recovery wird
ausschließlich das unveränderte Paket mit dem speziellen zweiten Argument
`RECOVER` zurückgelesen:

```bash
sudo deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env RECOVER
```

Der Recovery-Lauf entfernt nur exakt operationsgebundene Importcontainer und
akzeptiert anschließend genau zwei atomare Zustände: vollständig importiert
oder weiterhin vollständig leer. Beim vollständig importierten Zustand erzeugt
er nach stabilem API-Readback die Attestation aus den paket- und
operationsgebundenen Markerwerten; eine bereits vor einem Abbruch persistierte,
exakt passende Attestation wird idempotent weiterverwendet. Erst danach wird
der Recovery-Marker dauerhaft entfernt. Beim vollständig leeren Zustand wird
keine Attestation erzeugt, sodass der Import erneut bestätigt werden kann. Kann
Attestation oder Markerstatus nicht datenträgersynchron persistiert werden,
wird die API wieder gestoppt. Ein teilweise oder anders befüllter Zustand
bleibt fail-closed; weder API noch Marker werden freigegeben.

Der Importcontainer prüft vor dem Restore erneut:

1. genau sechs reguläre Dateien und keine Symlinks,
2. Paketfingerprint und alle SHA-256-Werte,
3. die paketgebundene Zielrevision sowie PostgreSQL-Hauptversion 16; die
   getrennte Quell-Live-Revision bleibt Provenienz,
4. vollständige Übereinstimmung von Dump und TOC,
5. ausschließlich `TABLE DATA` und `SEQUENCE SET` im Schema `public`,
6. identische Tabelleninventare,
7. eine vollständig leere Ziel-Datenbank,
8. exakt null referenzierte private GCS-/Objektdaten.

`pg_restore` verwendet `--data-only`, die geprüfte TOC und
`--single-transaction`. Schemaerzeugung, `--clean`, `--create`, Owner und ACLs
sind ausgeschlossen. Nach Erfolg werden Tabellen- und Objektreferenzzählungen
erneut mit den Manifesten verglichen.

## Finalen Source-Writer-Nachweis für Initial-Open erfassen

Nach Zielimport, Zielbackup und Restore-Test bleibt die GCP-Quelle weiterhin
eingefroren. Unmittelbar vor dem Initial-Open erzeugt der VPS mit
`openssl rand -hex 32` einen neuen 64-stelligen Gate-Nonce. Dieser Nonce wird
zusammen mit dem ursprünglichen Exportpaket an den Source-Collector übergeben.
VPS und ausführender Source-Operator müssen zuvor eine synchronisierte
UTC-Zeit besitzen; der spätere Open-Gate-Validator verlangt einen
Source-Readback nach dem attestierten Zielimport.
Der Collector läuft aus einem sauberen Checkout der paketgebundenen
Zielrevision und verlangt einen höchstens zehn Minuten alten, erneut an GKE und
Cloud SQL gebundenen globalen Writer-Nachweis:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/capture-initial-open-writer-evidence.sh \
  --migration-dir /absoluter/externer/exportpfad \
  --libpq-dir /absoluter/externer/libpq-pfad \
  --gke-config /absoluter/externer/gke-freeze.conf \
  --global-writer-attestation /absoluter/externer/frischer-global-writer-nachweis.conf \
  --gate-nonce '<64-HEX-VOM-VPS>' \
  --output-dir /absoluter/externer/neuer-evidenzpfad \
  --signing-key /absoluter/geschuetzter/initial-open-source-writer.private.pem
```

Der Collector prüft den historischen State-Hash des Pakets, einen aktuellen
Frozen-Readback vor und nach der Cloud-SQL-Abfrage, PostgreSQL 16, die exakte
Instanz und Datenbank sowie null andere Client-Sessions. Anschließend validiert
er den unveränderten globalen Writer-Nachweis erneut. Nur dann legt er exklusiv
ein neues, geschütztes Output-Verzeichnis an und schreibt genau zwei durable
Dateien:

```text
initial-open-source-writer.attestation
initial-open-source-writer.attestation.sig
```

Die Payload bindet Gate-Nonce, Paketfingerprint, Quell- und Zielrevision,
Projekt und Cloud-SQL-Instanz, historischen GKE-State, Binding und
Deployment-Generation, Namespace-Inventur, frischen globalen Writer-Nachweis,
sämtliche Null-Writer-Zählungen und `observedAt`. Die Signatur besteht aus 64
rohen Ed25519-Bytes. Beide Dateien werden verschlüsselt auf den VPS übertragen
und dort mit `root:root`/`0600` unter denselben Namen im `CONFIG_DIR`
installiert. Der zugehörige Public Key muss dort bereits vorab gepinnt sein;
private Schlüssel, Kubeconfig und GCP-/Cloud-SQL-Zugang bleiben auf der Quelle.
Eine Kollision ersetzt nichts. Ein erst nach Anlage des Output-Verzeichnisses
auftretender Fehler lässt den unvollständigen, lokal fail-closed gesperrten
Pfad zur Sichtprüfung stehen; er darf weder übertragen noch wiederverwendet
werden.

Jedes zwischenzeitliche `unfreeze`, `close`, Refreeze, jede andere
Cloud-SQL-Client-Session, State-/Namespace-Drift oder ein abgelaufener globaler
Writer-Nachweis verhindert die Ausgabe. Dann wird kein altes Artefakt
wiederverwendet, sondern der Cutover bleibt geschlossen und benötigt je nach
Ursache einen neuen Export und Import.

Das Exportpaket wird nicht automatisch gelöscht. Erst nach fachlichem Smoke,
erfolgreichem Offsite-Backup und bestandenem Restore-Test darf es nach der
geltenden Aufbewahrungsregel aus dem externen Migrationsverzeichnis entfernt
werden.
