# Kontrollierter Datenbankimport auf den Einzelserver

Dieser Pfad uebernimmt ausschliesslich die Daten und Sequenzstaende einer
PostgreSQL-16-Datenbank in das bereits versioniert initialisierte Schema des
Einzelservers. Er erstellt, aendert und loescht keine GCP-Ressourcen und laedt
keine Daten aus GCP herunter. Export und verschluesselte Uebertragung sind ein
getrennter, vom Betreiber freizugebender Vorgang.

Der Import ist kein allgemeiner Restore-Mechanismus. Fuer Sicherungen und
Restore-Tests gelten die Skripte unter `deploy/single-server/backup/`.

## Blockierende Voraussetzungen

- Quell- und Zielsystem verwenden PostgreSQL 16. Die tatsaechlich deployte
  Quellrevision wird als Provenienz erfasst; die separat angegebene
  Zielrevision muss exakt dem fuer den Einzelserver vorgesehenen Commit
  entsprechen. Beide Revisionen duerfen und werden im Regelfall voneinander
  abweichen.
- Schreibzugriffe auf die Quelldatenbank bleiben vom GKE-Freeze bis zum
  ausdruecklichen Unfreeze nach dem Export gesperrt. Der versionierte
  `gke-writer-freeze.mjs` skaliert dabei ausschliesslich das exakt gebundene
  API-Deployment im konfigurierten Namespace auf null. Writer in anderen
  Namespaces und externe Datenbank-Clients muessen separat ausgeschlossen und
  in einem aktuellen globalen Writer-Nachweis attestiert werden.
- Die vier privaten GCS-Datenbereiche fuer Profilbilder, Kontaktbilder,
  Notizanhaenge und Stakeholder-Logos wurden zuletzt mit null Live-Objekten
  geprueft. Unmittelbar vor dem Cutover muss dieselbe read-only Inventur erneut
  gegen die vier exakten Bucket-Namen laufen und mit Zeitpunkt sowie Ergebnis
  protokolliert werden. Ein Objekt, eine fehlende Leseberechtigung oder ein
  nicht eindeutig bestimmbarer Bestand stoppt den Import. Fuer diesen Fall ist
  bewusst kein GCS-Importer enthalten.
- Das Exportpaket liegt ausserhalb von Git-Checkout, `STATE_DIR` und
  `CONFIG_DIR`. Es enthaelt genau die unten genannten sechs Dateien.
- Die Ziel-Datenbank wurde durch den Einzelserver-Bootstrap angelegt, enthaelt
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
ist die unveraenderte Ausgabe von `pg_restore --list database.dump`. Jede
nicht kommentierte TOC-Zeile muss `TABLE DATA public ...` oder
`SEQUENCE SET public ...` beschreiben. Schema-, Rollen-, ACL-, Funktions- oder
Extension-Eintraege sind nicht zulaessig.

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

`row-counts.tsv` enthaelt alle Tabellen des Schemas `public`, exakt einmal und
lexikografisch sortiert:

```text
schema\ttable\trows
public\tactivity_events\t0
public\tprofiles\t4
```

`storage-reference-counts.tsv` muss exakt folgende vier Nullzaehlungen
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
ein neues Verzeichnis ausserhalb des Repositories kopiert und durch read-only
ermittelte Zielwerte ersetzt. Dieses Verzeichnis gehoert dem aufrufenden Nutzer
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
wird ausschliesslich aus dieser aktuellen Vorschau uebernommen:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf \
  --apply --confirm 'FREEZE:<64-HEX-AUS-DER-VORSCHAU>'
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf --readback
```

Nur ein Readback mit `PHASE=readback-frozen`, `REPLICAS=0`, `API_PODS=0`,
`FREMDE_NAMESPACE_DB_WRITER_KANDIDATEN=0` und
`STATUSDATEI_PHASE=frozen` ist exportfaehig. Die Ausgabe weist ausdruecklich nur
das konfigurierte Namespace und API-Deployment nach. Deshalb werden jetzt alle
anderen Namespaces auf Cloud-SQL-/Datenbank-Writer sowie alle externen Clients,
Jobs, Admin-Shells und Automationen unabhaengig read-only inventarisiert. Erst
wenn beide Mengen nachweislich leer sind, wird im selben geschuetzten
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

Werte duerfen nicht aus Beispielen oder Dateinamen uebernommen werden. Projekt
und Cloud-SQL-Instanz muessen exakt `source-target.conf` entsprechen; die drei
GKE-Fingerprints muessen aus genau dem unmittelbar zuvor bestaetigten
Frozen-Zustand stammen. Der Export akzeptiert den Nachweis hoechstens 10 Minuten
nach `ATTESTED_AT`, prueft Inhalt, Alter und unveraenderten SHA-256-Wert vor und
nach dem gemeinsamen Datenbank-Snapshot und bindet den Wert an das fertige
Paket. Dauert der Lauf laenger, wird ein neuer Nachweis erstellt und mit einem
neuen Exportziel erneut begonnen.

## Export in ein externes Verzeichnis

Der versionierte Wrapper
[`export-database.sh`](export-database.sh) wird nur in einer bereits
freigegebenen, schreibgesperrten Quellumgebung ausgefuehrt. Er verlangt einen
vollstaendig sauberen, kanonischen Git-Checkout und leitet `target_revision`
direkt aus dessen `HEAD` ab. Der als drittes Argument uebergebene
`source_deployed_revision`-Wert ist kein Secret und muss zuvor am laufenden
Quellsystem nachgewiesen worden sein.

`pg_dump`, `pg_restore` und `psql` muessen aus PostgreSQL 16 stammen. Das
owner-only libpq-Verzeichnis liegt ausserhalb des Repositories, besitzt Modus
`0700` und enthaelt genau drei regulaere Dateien mit Modus `0600`, ohne
Symlinks: `pg_service.conf`, `pgpass` und `source-target.conf`.
Der nur fuer den Cutover verwendete Exportnutzer benoetigt Leserechte auf den
Exportbestand, die fuer `LOCK TABLE ... IN SHARE MODE` erforderlichen Rechte
und `pg_read_all_stats`. Der Wrapper nutzt diese Monitoringrolle ausschliesslich,
um vor dem Snapshot null andere Client-Sessions und vor dessen Freigabe genau
seine eigene eindeutig benannte Snapshot-Halter-Session nachzuweisen. Jede
weitere oder nicht lesbare Session stoppt fail-closed.

`source-target.conf` wird nicht aus der Datenbankadresse geraten, sondern aus
der unabhaengig read-only bestaetigten produktiven GCP-/Cloud-SQL-Konfiguration
befuellt. Es besitzt exakt diese Reihenfolge und keine Zusatzfelder:

```text
FORMAT_VERSION=1
GCP_PROJECT_ID=<exaktes-produktivprojekt>
CLOUD_SQL_INSTANCE_CONNECTION_NAME=<projekt>:<region>:<instanz>
CLOUD_SQL_DATABASE=versorgungs_kompass
CLOUD_SQL_USER=<exakter-exportnutzer>
```

Der aktive `gcloud`-Kontext muss genau dieses Projekt verwenden. Der Wrapper
liest die benannte Instanz erneut ueber die Cloud-SQL-API und verlangt den
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
verschluesselt, waehrend die lokale Socket-Strecke kein irrefuehrendes zweites
TLS verwendet. Das Passwort liegt getrennt in `pgpass`. Weder `password` noch
`passfile` oder beliebige Zusatzparameter sind in `pg_service.conf` erlaubt.
`pgpass` wird mit einem geschuetzten Editor befuellt; das Passwort erscheint in
keinem Prozessargument und keiner Environment-Variable.

Der ebenfalls externe Export-Elternpfad muss bereits existieren, dem
aufrufenden Nutzer gehoeren und Modus `0700` besitzen. Das konkrete Exportziel
darf noch nicht existieren. Repository, libpq-Verzeichnis und Exportziel
duerfen in keiner Richtung ineinander verschachtelt sein.

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/export-database.sh \
  /absoluter/externer/export-elternpfad/cutover-2026-09-11 \
  /absoluter/externer/libpq-pfad \
  '<exakter-deployter-quell-live-commit>' \
  /absoluter/externer/gke-freeze.conf \
  /absoluter/externer/global-writer-attestation.conf
```

Der Wrapper loescht zunaechst alle geerbten libpq-Variablen. Jeder
Datenbankprozess startet danach mit einer neu aufgebauten Minimalumgebung, die
nur den festen Servicenamen sowie die beiden libpq-Konfigurationspfade kennt.
Nach allen Pfad-, Rechte-, Repository-, GCP-Ziel-, Tool- und
Verbindungspruefungen verlangt er selbst einen aktuellen Frozen-Readback und
den exakt daran sowie an Cloud SQL gebundenen globalen Writer-Nachweis. Direkt
danach bestaetigt er ueber `pg_stat_activity`, dass keine andere Client-Session
mehr an der Quelldatenbank haengt. Danach
legt er das
Exportziel atomar neu und leer mit Modus `0700` an. Er erzeugt den
`--data-only`-Dump und beide Zaehlmanifeste aus einem einzigen exportierten
PostgreSQL-Snapshot, prueft den TOC und verlangt die vier exakten
Nullzaehlungen. Der gemeinsame Snapshot haelt fuer die vorhandenen Tabellen des
Schemas `public` SHARE-Sperren; damit koennen dort waehrend des Paketlaufs keine
Daten geaendert werden. Andere Namespaces und externe Writer bleiben zusaetzlich
das oben attestierte Betriebsgate. Vor der Finalisierung wiederholt der Wrapper
den Frozen-Readback sowie den globalen Writer-Nachweis und verlangt
unveraenderte Statusdatei-, Binding-, Namespace- und Attestation-Fingerprints. Erst
dann muss der technische Session-Readback genau die noch SHARE-Sperren haltende,
vom Wrapper eindeutig benannte Snapshot-Session und keine weitere Session
finden. Erst
dann schreibt er die sechs Paketdateien mit Modus `0600`. Ein abgebrochener
Export bleibt als gesperrtes unvollstaendiges Verzeichnis zur Sichtpruefung
liegen und darf nicht wiederverwendet werden; fuer einen erneuten Lauf wird ein
neuer Zielname gewaehlt.

Nach erfolgreichem Export den Frozen-Zustand ein weiteres Mal explizit lesen
und erst nach gesicherter Paketpruefung entscheiden, ob die alte Quelle fuer
Rollback-Zwecke wieder geoeffnet werden soll:

```bash
/absoluter/kanonischer/repository-pfad/deploy/single-server/migration/gke-writer-freeze.mjs \
  freeze --config /absoluter/externer/gke-freeze.conf --readback
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

Jede `UNFREEZE:`- und `CLOSE:`-Bestaetigung stammt aus der jeweils unmittelbar
vorherigen Vorschau. `unfreeze --readback` muss die urspruengliche Replica-Zahl,
die exakte Image-ID und `STATUSDATEI_PHASE=unfrozen` bestaetigen. `close`
archiviert erst danach die Statusdatei unter dem ausgegebenen unveraenderlichen
Archivpfad und macht den konfigurierten `STATE_FILE`-Pfad fuer einen spaeteren
neuen Zyklus frei. Bleibt die Quelle als Rollback-Stand absichtlich
schreibgesperrt, werden Unfreeze und Close bis zur ausdruecklichen Entscheidung
nicht ausgefuehrt; Statusdatei und Attestation bleiben geschuetzt erhalten.

Vor der Uebertragung muessen `database.toc`, beide TSV-Dateien und
`SHA256SUMS` auf einem getrennten Lesepfad geprueft werden. Das Paket wird nur
verschluesselt und ausserhalb des Git-Repositories auf den Zielhost
uebertragen. Die drei Quellkonfigurationsdateien bleiben auf der Quelle. Auf dem Zielhost
gehoeren Verzeichnis und Dateien der gemeinsamen, nicht privilegierten
Daten-UID/GID `70:70`; das Verzeichnis hat Modus `0700`, die sechs Dateien
`0600`.

## Import auf dem Zielhost

`MIGRATION_DIR` in der externen Environment-Datei bezeichnet das geschuetzte
Paketverzeichnis. Der erste Aufruf ohne Bestaetigung ist read-only und gibt den
exakten, an `SHA256SUMS` gebundenen Bestaetigungstext aus:

```bash
sudo deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env
```

Danach wird derselbe Aufruf mit dem vollstaendigen Text als zweitem Argument
wiederholt. Erst bei exakter Uebereinstimmung stoppt der Wrapper die laufende
API, fuehrt den Importcontainer aus und startet die API nach erfolgreichem
Zeilenabgleich wieder. Bei jedem Import- oder Prueffehler bleibt die API
absichtlich gestoppt.

Ein harter Prozess- oder Hostabbruch nach Anlage von
`STATE_DIR/.database-import-recovery-required` wird nicht durch einen normalen
API-Start uebergangen. Nach zuerst abgeschlossener Backup-Recovery wird
ausschliesslich das unveraenderte Paket mit dem speziellen zweiten Argument
`RECOVER` zurueckgelesen:

```bash
sudo deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env RECOVER
```

Der Recovery-Lauf entfernt nur exakt operationsgebundene Importcontainer und
akzeptiert anschliessend genau zwei atomare Zustaende: vollstaendig importiert
oder weiterhin vollstaendig leer. Nur dann startet er die API und entfernt den
Marker. Ein teilweise oder anders befuellter Zustand bleibt fail-closed; weder
API noch Marker werden freigegeben.

Der Importcontainer prueft vor dem Restore erneut:

1. genau sechs regulaere Dateien und keine Symlinks,
2. Paketfingerprint und alle SHA-256-Werte,
3. die paketgebundene Zielrevision sowie PostgreSQL-Hauptversion 16; die
   getrennte Quell-Live-Revision bleibt Provenienz,
4. vollstaendige Uebereinstimmung von Dump und TOC,
5. ausschliesslich `TABLE DATA` und `SEQUENCE SET` im Schema `public`,
6. identische Tabelleninventare,
7. eine vollstaendig leere Ziel-Datenbank,
8. exakt null referenzierte private GCS-/Objektdaten.

`pg_restore` verwendet `--data-only`, die gepruefte TOC und
`--single-transaction`. Schemaerzeugung, `--clean`, `--create`, Owner und ACLs
sind ausgeschlossen. Nach Erfolg werden Tabellen- und Objektreferenzzaehlungen
erneut mit den Manifesten verglichen.

Das Exportpaket wird nicht automatisch geloescht. Erst nach fachlichem Smoke,
erfolgreichem Offsite-Backup und bestandenem Restore-Test darf es nach der
geltenden Aufbewahrungsregel aus dem externen Migrationsverzeichnis entfernt
werden.
