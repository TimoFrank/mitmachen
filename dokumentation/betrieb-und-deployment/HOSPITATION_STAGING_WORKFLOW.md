# Hospitations-Inhalte: lokales Staging und kontrollierte Übernahme

Stand: 22. Juli 2026
Vertrag: `hospitation-staging/v1`

Dieser Ablauf trennt drei Dinge bewusst voneinander:

1. Die gemeinsame Anwendung und Navigation werden normal über Git und den Deployment-Workflow veröffentlicht.
2. Reale Hospitationsinhalte werden ausschließlich im ignorierten lokalen Staging gepflegt und als minimales Inhaltsmanifest exportiert.
3. Bilder durchlaufen einen separaten Rechte-, Bereinigungs- und Storage-Prozess. Sie sind nicht im Inhaltsmanifest enthalten.

Der lokale Export arbeitet ohne produktive Schreibzugriffe. Die geschützte Target-Anwendung besitzt einen serverseitig kontrollierten Vorschau- und Übernahmepfad für Administrator:innen. Diese serverseitige Vorschau ist die einzige verbindliche Freigabegrundlage; dadurch gelten für Prüfung und Übernahme exakt dieselben Zuordnungs- und Merge-Regeln.

## 1. Lokales Staging im Browser öffnen und Snapshot exportieren

Nach Änderungen an den gemeinsamen Anwendungsdateien wird der lokale Einstieg einmalig neu erzeugt:

```sh
npm run prepare:local-hospitation
```

Dabei werden auch Navigation und äußerer Moduleinstieg aus der gemeinsamen Anwendung synchronisiert; die kompaktere lokale Shell bleibt über das ausschließlich lokale Zusatz-Stylesheet getrennt. Danach kann `frontend/local-hospitation/index.html` direkt im Browser geöffnet werden; ein laufender npm-Server ist für die tägliche Arbeit nicht erforderlich. Nur falls ein Browser lokale `file://`-Frames einschränkt, steht `npm run start:local-hospitation` als Ausweichweg zur Verfügung.

In der lokalen Anwendung erscheint unten rechts ausschließlich im lokalen Einstieg der Button **Staging-Snapshot exportieren**. Er lädt ein JSON-Manifest herunter. Alternativ bleibt für Diagnosezwecke verfügbar:

```js
LocalHospitationStore.downloadSnapshot()
```

Die Datei anschließend in den ignorierten Privatbereich verschieben:

```text
backups/hospitation-staging/local-2026-07-22.json
```

Das Manifest hat exakt diese Top-Level-Felder:

```json
{
  "schemaVersion": "hospitation-staging/v1",
  "snapshot": {
    "id": "eindeutige-snapshot-id",
    "createdAt": "2026-07-22T10:00:00.000Z",
    "source": "local-hospitation"
  },
  "ownerRef": "timo-frank",
  "organizations": [],
  "contacts": [],
  "hospitations": [],
  "observations": []
}
```

Profile, Einstellungen, lokale Owner-IDs, Bildpfade und Bildmetadaten werden beim Export entfernt. Organisationen, Kontakte, Hospitationen und Beobachtungen werden nicht roh kopiert, sondern jeweils über die explizite Feld-Whitelist des Backend-Vertrags aufgebaut. Dabei werden lokale Kontaktfelder kanonisch abgebildet: `category`/`sector` auf `sector`, `themes`/`topics` auf `topics`, `note`/`notes` auf `notes` und `sources`/`source` auf das Textfeld `source`. Archivierte Beobachtungen werden nicht exportiert; ein fehlender Status wird als `active` kanonisiert. Die serverseitige Vorschau verwendet denselben Backend-Validator wie die spätere Übernahme und lehnt zusätzliche Felder ab.

Seed-Kontakte und Seed-Organisationen benötigen explizite, unveränderliche `contactId`- beziehungsweise `organizationId`-Werte. Der lokale Adapter bricht bei fehlenden oder widersprüchlichen IDs ab. Namen, Arraypositionen oder spätere Sortierungen werden dadurch nicht mehr als Identität verwendet.

## 2. Datenbanksicherung und ersten Datenbank-Probelauf bestätigen

Vor jeder tatsächlichen Übernahme muss die aktuelle Cloud-SQL-Sicherung beziehungsweise die nutzbare Point-in-Time-Recovery-Fähigkeit bestätigt sein. Ein JSON-Export ersetzt kein Datenbank-Backup. Ohne bestätigte Wiederherstellbarkeit endet der Ablauf nach der serverseitigen Vorschau.

Vor der erstmaligen Aktivierung der Importfunktion ist außerdem ein vollständiger Probelauf gegen eine kurzlebige PostgreSQL-16-Datenbank mit dem echten Schema erforderlich. Dabei müssen mindestens Vorschau, Übernahme, zweite idempotente Vorschau, Ablehnung eines veralteten Ziel-Fingerprints, Trigger, Transaktion und Rollback geprüft werden. Bis dieser Probelauf dokumentiert erfolgreich abgeschlossen ist, darf **Geprüften Stand übernehmen** im Produktivsystem nicht verwendet werden.

Der dafür vorgesehene Freigabebefehl arbeitet bei fehlendem Docker absichtlich fail-closed und verwendet weder eine konfigurierte externe Datenbank noch Produktivzugänge:

```sh
npm run test:hospitation-import-e2e:release
```

Er startet einen eindeutig benannten Wegwerfcontainer mit PostgreSQL 16 und ausschließlich synthetischen Testdaten. Nach dem Schema-Bootstrap richtet er über die versionierten Dateien `runtime-role.sql` und `grants.sql` dieselbe NOLOGIN-Laufzeitrolle wie das Zielsystem ein. Die API verbindet sich ausschließlich als separater, nicht privilegierter LOGIN-Testnutzer mit Mitgliedschaft in dieser Rolle; der Datenbank-Owner bleibt auf Bootstrap und Testassertionen begrenzt. Anschließend ruft der Test Vorschau und Übernahme über die echte lokale HTTP/API-Kette auf und entfernt API-Prozess sowie Container in einem `finally`-Cleanup. Der normale `npm run check` und `check:poc-rc` führen denselben Test ebenfalls aus, dürfen ihn auf Entwicklungsrechnern ohne verfügbares Docker aber nachvollziehbar überspringen. Für eine Produktivfreigabe zählt ausschließlich der oben genannte fail-closed Befehl.

## 3. Geschützte Adminseite öffnen

Die Importseite wird ausschließlich in das geschützte Target-Artefakt gebaut und ist dort unter `/hospitation/import.html` erreichbar. Sie wird nicht in GitHub Pages oder den lokalen Hospitationseinstieg aufgenommen.

Der Zugriff ist mehrfach begrenzt:

- Die Seite akzeptiert nur die Target-Laufzeit mit API-Datenmodus und IAP- oder OIDC-Authentifizierung.
- Die API-URL muss dieselbe Origin wie die aufgerufene Anwendung verwenden. Eine abweichende API-Origin wird im Browser abgelehnt.
- Die Seite prüft das aktive Profil und gibt die Arbeitsfläche nur für die Rolle `admin` frei.
- Die Endpunkte `/api/admin/hospitation-import/preview` und `/api/admin/hospitation-import/apply` erzwingen die Admin-Rolle zusätzlich serverseitig.
- Das hochgeladene Manifest bleibt auf das Schema `hospitation-staging/v1`, die freigegebenen Felder und höchstens 1 MB begrenzt.

Vor dem Software-Deployment muss im geschützten GitHub Environment `pre-gematik` das Secret `HOSPITATION_IMPORT_OWNER_PROFILE_ID` auf die stabile produktive Profil-ID von Timo Frank gesetzt sein. Der Deployment-Workflow bricht ohne diesen Wert ab; die ID wird nicht in Git hinterlegt.

## 4. Vorschau und Übernahme durchführen

Der verbindliche Ablauf lautet:

1. Den lokalen Staging-Snapshot über **Staging-Snapshot exportieren** erzeugen.
2. Den PostgreSQL-Probelauf bei der ersten Aktivierung und Cloud-SQL-Backup beziehungsweise Point-in-Time-Recovery nach Abschnitt 2 bestätigen.
3. `/hospitation/import.html` in der geschützten Target-Anwendung öffnen und die JSON-Datei auswählen.
4. **Vorschau erstellen** wählen. Dieser Schritt validiert das Manifest erneut und liest den aktuellen Zielbestand, verändert aber keine Fachdaten.
5. Create-, Update-, Unchanged- und Konfliktzahlen sowie alle Zuordnungen prüfen. Bei Konflikten oder unplausiblen Mengen darf keine Übernahme erfolgen.
6. Die beiden angezeigten SHA-256-Prüfsummen für Staging-Datei und Produktivstand dokumentieren und mit der freizugebenden Vorschau abgleichen.
7. Die fachliche Prüfung und die aktuelle Backup-/PITR-Verfügbarkeit über die beiden getrennten Checkboxen bestätigen und exakt `HOSPITATIONEN IMPORTIEREN` eingeben.
8. **Geprüften Stand übernehmen** wählen. Der Server validiert Manifest und beide Prüfsummen erneut. Hat sich der Produktivbestand seit der Vorschau geändert, wird die Übernahme mit einem Konflikt abgelehnt und es ist eine neue Vorschau erforderlich.
9. Nach erfolgreicher Transaktion **Erneut gegen Produktivstand prüfen** wählen. Die zweite Vorschau muss **Stand bereits aktuell** anzeigen und darf keine weiteren Create- oder Update-Vorgänge enthalten.

Vor einer Übernahme werden gemeinsam geprüft:

- die serverseitige Vorschau enthält keine Konflikte und ist freigabefähig,
- Manifest- und Ziel-Fingerprint gehören zur unmittelbar zuvor geprüften Vorschau,
- sämtliche Create-/Update-Zahlen sind plausibel,
- Owner-, Kontakt- und Organisations-Mappings sind korrekt,
- die Datenbanksicherung ist bestätigt.

Die produktive Übernahme arbeitet transaktional, sperrt die betroffenen Tabellen für den Lauf und prüft den Ziel-Fingerprint unter derselben Transaktion erneut. Ein alter Vorschau-Fingerprint darf nach Änderungen im Ziel niemals erneut verwendet werden. Es wird kein fehlender Datensatz als implizite Löschanweisung interpretiert. Bestehende Organisations- und Kontaktstatus werden durch diesen Workflow nicht verändert; bei Hospitationen sind nur normale Vorwärtsbewegungen bis `Dokumentiert` möglich. Archivierung, Wiederherstellung, Rückstufungen und das Überschreiben terminaler Zustände bleiben ausgeschlossen. Archivierte Beobachtungen sind bereits vom Staging-Manifest ausgeschlossen. Umgekehrt reaktiviert der lokale Status `active` keine Beobachtung, die im Produktivsystem bewusst archiviert wurde. Bestehende Primär-Owner werden nicht ersetzt; Timo Frank wird bei Kontakten additiv als Owner-Relation ergänzt.

Die in diesem Änderungspaket implementierte Funktion führt weder automatisch ein Deployment noch einen produktiven Importlauf aus. Veröffentlichung der Software und anschließende Datenübernahme bleiben zwei getrennte, jeweils bewusst auszulösende Schritte.

## 5. Bilder bleiben separat

Der Inhaltsworkflow exportiert und plant keine Bilder. Der produktive Bild-Upload ist derzeit deaktiviert. Vor einer separaten Übernahme sind mindestens erforderlich:

- dokumentierte Nutzungsrechte und Quelle,
- Entfernung von EXIF- und sonstigen Metadaten,
- sichere Re-Encodierung und Inhaltsprüfung,
- Zuordnung erst nach Auflösung der produktiven Kontakt- beziehungsweise Profil-ID,
- Import in die privaten `contact-images`- beziehungsweise `profile-images`-Buckets,
- anschließende Sichtprüfung hinter IAP.

Lokale Bilddateien dürfen nie in Git, das Inhaltsmanifest oder einen Frontend-Build gelangen.
