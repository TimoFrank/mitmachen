# Migration, Cutover und Rollback

Status: ausfuehrbare Arbeitsvorlage; Zieltermine, Owner und Servicewerte offen

Stand: 18. Juli 2026

## Zweck und Leitprinzip

Dieses Runbook fuehrt den geschuetzten Ausgangsdatenbestand kontrolliert in den internen Kubernetes-Zielbetrieb. GitHub Pages ist dabei bereits auf die synthetische Demo begrenzt. Das Verfahren verhindert zwei gleichzeitig beschreibbare Wahrheiten, ungetestete Datenmigrationen und einen nur technisch gedachten Rollback.

Leitprinzipien:

- GitHub Pages ist kein Staging. Die Zielabnahme erfolgt im Target-Pfad.
- `pre-gematik` verwendet standardmaessig nur synthetische oder belastbar anonymisierte Daten. Ein Echtdaten-Pilot ist erst nach den expliziten Gates im [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md) zulaessig.
- Datenmigration und Anwendungsdeployment sind getrennte, koordinierte Arbeitspakete.
- API-Image und `dist/target/` werden als unveraenderliches Releasepaar freigegeben.
- Ein Cutover beginnt erst nach erfuellter Definition of Ready und benanntem Go/No-Go-Gremium.
- Nach Beginn produktiver Schreibzugriffe im Zielsystem ist eine Rueckschaltung keine reine URL-Aenderung. Sie benoetigt eine ausdrueckliche Datenentscheidung.

## Geltungsbereich

Zu migrieren sind nach fachlicher Freigabe mindestens die tatsaechlich genutzten Domaenen:

- Profile, Rollen, aktive/inaktive Nutzer und Teamzuordnungen,
- Kontakte, Organisationen, Owner und fachliche Attribute,
- Aenderungshistorie und Benachrichtigungen,
- Formate und Teilnehmende,
- Hospitationen, Slots, Beobachtungen und Dokumentationsbezug,
- Expertenkreis, Stakeholder und Patientenorganisationen,
- gespeicherte Ansichten und Nutzereinstellungen,
- Profilbilder, Kontaktbilder und Notizanhaenge,
- Importprotokolle und weitere nach Datenmodell freigegebene Tabellen.

Die reale Tabellen- und Objektliste wird aus dem freigegebenen Schema und dem Quellsystem erzeugt. Das temporaere Pre-Integrationsschema unter `deploy/postgres/pre-gematik/` ist kein automatisch freigegebenes Produktionsschema.

## Rollen und Entscheidungsrechte

Vor Terminierung muessen mindestens benannt sein:

| Funktion | Aufgabe im Cutover | Name/Team |
| --- | --- | --- |
| Cutover Lead (`A`) | Zeitplan, Go/No-Go, Kommunikation | offen |
| fachliche Datenabnahme (`A`) | Counts, Stichproben, Ausnahmen | offen |
| Migrationsausfuehrung (`R`) | Export, Transformation, Import | offen |
| DB-/Restore-Verantwortung (`R/A`) | Backup, PITR/Restore, DB-Freigabe | offen |
| Application Release (`R`) | API/Frontend deployen, Smoke Tests | offen |
| Plattform/Gateway (`R`) | Routing, SSO, Namespace, Monitoring | offen |
| Informationssicherheit/Datenschutz (`C/A`) | Freigaben gemaess Einstufung | offen |
| Service Desk/Kommunikation (`R`) | Nutzerinformation, Stoerungsannahme | offen |

Die Zuordnung wird in [Betriebsverantwortung und RACI](BETRIEBSVERANTWORTUNG_RACI.md) bestaetigt.

## Phasenmodell

### Phase 0: Entscheidungen und Dateninventar

- Zielplattform, Datenklasse, SSO, Storage und Betriebsowner festlegen.
- Quelltabellen, Views, Auth-Identitaeten, Buckets, Dateien und externe URLs inventarisieren.
- Pro Datendomaene Owner, Transformationsregel, Validierung und Loesch-/Aufbewahrungsregel dokumentieren.
- Stabile fachliche IDs und Zeitstempel identifizieren; sie duerfen nicht ohne Freigabe neu erzeugt werden.
- Supabase-Auth-IDs von Zielidentitaeten entkoppeln und Mapping auf E-Mail beziehungsweise stabilen SSO-Subject definieren.
- Daten ausschliessen, fuer die Zweck, Rechtsgrundlage oder Zielablage nicht freigegeben sind.

Ergebnis: versioniertes Migrationsmapping und genehmigte Datenliste.

### Phase 1: Schema- und Migrationspaket

- Produktionsschema als versionierte, reviewbare Migration bereitstellen.
- Laufzeitrolle ohne DDL-Rechte und separate Migrationsrolle definieren.
- Transformationen deterministisch und erneut ausfuehrbar gestalten.
- Reihenfolge fuer Fremdschluessel und Objektreferenzen festlegen.
- Idempotenz oder klares Reset-/Restore-Verfahren dokumentieren.
- Counts, Null-/Pflichtfeldregeln, Unique Constraints und fachliche Invarianten automatisieren.
- Fehler- und Ausschlussliste als eigenes Artefakt erzeugen; keine stillen Drops.

Ergebnis: geprueftes Schema-/Datenmigrationspaket mit Versionskennung.

### Phase 2: Probelauf ohne Echtdaten

- Temporaeres Pre-Integrationsschema und versionierten synthetischen Seed verwenden.
- Vollstaendigen Ablauf Exportformat -> Transformation -> Import -> API testen.
- Rollen `viewer`, `editor`, `admin`, unbekannte Identitaet und deaktiviertes Profil testen.
- Dateien und Object-Storage-Pfade pruefen.
- Zielbrowser auf Supabase-Aufrufe und verbotene Konfiguration auditieren.
- Release- und Restore-Rollback praktisch ueben.

Ergebnis: technischer Nachweis; keine fachliche Produktivdatenfreigabe.

### Phase 3: Generalprobe mit freigegebenem Datenumfang

- Freigegebenen Snapshot in eine isolierte Abnahmeumgebung exportieren.
- Migration mit produktionsnahem Volumen und denselben Werkzeugen wie im Cutover ausfuehren.
- Dauer fuer Export, Import, Indizes, Validierung und Restore messen.
- Counts, Fremdschluessel, Rollen, Stichproben und Dateiabrufe pruefen.
- Datenschutzkonforme Bereinigung der Abnahmeumgebung terminieren.
- Cutover-Plan auf gemessene Dauer und beschlossenes Wartungsfenster anpassen.

Ergebnis: fachlich und technisch abgenommenes Protokoll mit gemessenen, nicht geschaetzten Zeiten.

### Phase 4: Cutover

Der detaillierte Ablauf steht unten. Ergebnis ist entweder ein freigegebener Zielbetrieb oder ein kontrollierter Abbruch mit eindeutiger Datenquelle.

### Phase 5: Hypercare und Legacy-Abschaltung

- Erhoehte Beobachtung fuer einen beschlossenen Zeitraum.
- Taegliche technische und fachliche Reconciliation waehrend Hypercare.
- Offene Fehler mit Prioritaet, Owner und Frist fuehren.
- Legacy erst nach formaler Entscheidung auf read-only setzen, zur synthetischen Demo reduzieren oder abschalten.
- Legacy-Credentials, Supabase-Schreibrechte und nicht mehr benoetigte Daten nach Aufbewahrungsbeschluss entziehen/loeschen.
- Betriebsuebernahme und Ende der Hypercare protokollieren.

## Reconciliation-Vertrag

Vor der Generalprobe wird je Domaene eine Tabelle ausgefuellt:

| Domaene | Quell-Count/Query | Ziel-Count/Query | fachliche Stichprobe | Toleranz | Owner |
| --- | --- | --- | --- | --- | --- |
| Profile/Rollen | offen | offen | aktive/inaktive Nutzer, Rollen | offen | offen |
| Organisationen | offen | offen | Verknuepfungen, Status | offen | offen |
| Kontakte | offen | offen | Owner, Standort, Kommunikationsdaten | offen | offen |
| Historie | offen | offen | Zeitstempel, Actor, Aktion | offen | offen |
| Formate/Hospitationen | offen | offen | Teilnahmen, Slots, Beobachtungen | offen | offen |
| Saved Views/Settings | offen | offen | Nutzerzuordnung und Inhalt | offen | offen |
| Dateien | offen | offen | Abruf, MIME, Groesse, Rechte | offen | offen |

Eine Toleranz von `0` darf nicht pauschal behauptet werden, wenn Quellbereinigung oder explizite Ausschluesse vorgesehen sind. Jede Differenz braucht eine dokumentierte, fachlich freigegebene Begruendung.

## Definition of Ready fuer den Cutover

- [ ] RACI und Go/No-Go-Gremium sind benannt.
- [ ] Zielsystem, SSO, DB, Storage, Monitoring und Service Desk sind abgenommen.
- [ ] Releasepaar aus API-Digest und `dist/target/`-Manifest ist freigegeben.
- [ ] institutioneller Frontend-Promotionsmechanismus ist aktiv; ein Stagingmanifest mit `promotionRequired: true` gilt noch nicht als Produktivfreigabe.
- [ ] Zielartefakt-Audit, Scans und Smoke Tests sind erfolgreich.
- [ ] Schema-/Datenmigration ist versioniert und in der Generalprobe erfolgreich.
- [ ] Reconciliation-Regeln und Stichproben sind fachlich unterschrieben.
- [ ] letzter erfolgreicher Restore-Test liegt vor und passt zu beschlossenem RTO/RPO.
- [ ] Freeze-Zeitpunkt, Nutzerkommunikation und Wartungsfenster sind bestaetigt.
- [ ] Quelle und Ziel haben dokumentierte Schreibsperrverfahren.
- [ ] Rollback-Trigger, Entscheidungsfrist und Datenstrategie sind beschlossen.
- [ ] alle benoetigten Zugriffe sind getestet; temporaere Zugriffe besitzen Ablaufdatum.
- [ ] Abnahmeprotokoll ist vorbereitet.

## Freeze- und Cutover-Ablauf

Zeitangaben werden aus der Generalprobe uebernommen. `T0` ist der Beginn des fachlichen Schreibfreezes.

### Vor `T0`

- [ ] Statusmeeting und finales Go fuer den Start.
- [ ] Zielrelease, Migrationsversion und Backups unveraenderlich identifizieren.
- [ ] Monitoring-Dashboards, Logs, Kommunikationskanal und Bridge oeffnen.
- [ ] Nutzer ueber Beginn, Auswirkungen und naechstes Update informieren.
- [ ] automatisierte Jobs, Importe und Integrationen im Legacy-System identifizieren und pausieren.

### `T0`: Schreibfreeze

- [ ] Fachliche Nutzer vom Schreibstopp informieren.
- [ ] Legacy-Schreibpfade technisch sperren oder Anwendung in bestaetigten Read-only-Modus versetzen.
- [ ] Wirksamkeit mit einem abgewiesenen Testschreibzugriff nachweisen.
- [ ] Freeze-Zeitpunkt und letzte Quelltransaktion protokollieren.

### Export und Sicherung

- [ ] konsistenten finalen Export/Snapshot erstellen.
- [ ] Quellbackup beziehungsweise Wiederherstellungspunkt bestaetigen.
- [ ] Exportdateien verschluesselt, zugriffsgeschuetzt und mit Hash/Manifest ablegen.
- [ ] Counts und Exportprotokoll sichern.

### Zielimport

- [ ] Zielbackup/PITR-Punkt unmittelbar vor Import bestaetigen.
- [ ] freigegebene Schemamigration anwenden.
- [ ] Daten mit stabilen IDs und Zeitstempeln importieren.
- [ ] Dateien uebertragen und Referenzen pruefen.
- [ ] Fehler- und Ausschlussliste sichern.
- [ ] Reconciliation automatisiert und fachlich ausfuehren.

### Release und technische Pruefung

- [ ] API exakt per freigegebenem Digest deployen.
- [ ] `dist/target/` exakt per freigegebenem Manifest/Hash ausliefern.
- [ ] versioniertes Frontend-`releasePrefix`/`contentRevision` ueber den institutionellen Promotionsmechanismus aktiv schalten.
- [ ] Datenbankschema-Version, API-Release-ID und Frontend-Release-ID pruefen.
- [ ] Health, Readiness, Session, Rollen und Kernpfade testen.
- [ ] API lehnt fehlende/ungueltig signierte Tokens sowie falschen Issuer/Audience ab; Gateway umgeht diese Pruefung nicht.
- [ ] Monitoring, Logs und Alerts erzeugen und Empfang bestaetigen.

### Fachliche Pruefung und Go/No-Go

- [ ] Kontakte, Organisationen, Rollen, Karte, Hospitationen, Beobachtungen und Auswertungen stichprobenartig pruefen.
- [ ] Viewer-, Editor- und Admin-Rechte pruefen.
- [ ] definierte Testaenderung schreiben, Historie pruefen und rueckgaengig machen.
- [ ] Reconciliation ohne ungenehmigte Differenz abschliessen.
- [ ] Go, Go mit dokumentierter Auflage oder Rollback entscheiden.

### Freigabe

- [ ] Routing/Ziel-URL fuer Nutzer freigeben.
- [ ] Legacy bleibt gemaess Beschluss read-only; kein paralleles Schreiben.
- [ ] Nutzer ueber Freigabe, bekannte Einschraenkungen und Supportweg informieren.
- [ ] Hypercare starten und naechsten Statuszeitpunkt nennen.

## Go/No-Go-Kriterien

Ein `Go` setzt mindestens voraus:

- eindeutige Ziel- und Quellrevisionen,
- keine ungeklaerte Datenintegritaetsabweichung,
- funktionierende Authentisierung und serverseitige Autorisierung,
- erfolgreiche fachliche Kernpfade,
- aktive Logs, Monitoring, Alarmierung und Backup,
- erreichbare Responsible-/Accountable-Rollen,
- verbleibende Risiken innerhalb der ausdruecklich akzeptierten Schwelle.

Ein `No-Go` beziehungsweise Rollback ist zu pruefen bei:

- unvollstaendigem oder nicht reproduzierbarem Export/Import,
- ungeklaerten Count-, Fremdschluessel- oder Stichprobenabweichungen,
- Umgehung von Gateway/SSO oder fehlerhafter Rollenpruefung,
- nicht funktionsfaehigen fachlichen Kernpfaden,
- fehlendem Backup-/Restore-Schutz,
- Ueberschreitung des beschlossenen Cutover-Fensters,
- fehlenden entscheidungsbefugten Rollen.

Konkrete Schwellen und die spaeteste Entscheidungszeit bleiben offen, bis Fachbereich und IT sie beschliessen.

## Rollback-Strategie

### Fall A: Fehler vor produktiven Zielschreibzugriffen

Dies ist der einfachste Fall:

1. Zielrouting nicht freigeben oder auf Legacy-read-only belassen.
2. API auf vorherigen Digest beziehungsweise Helm-Revision zuruecksetzen.
3. vorheriges Target-Frontend-Artefakt wieder aktivieren.
4. Ziel-DB auf den Vorimportpunkt zuruecksetzen oder Umgebung kontrolliert neu aufbauen.
5. Legacy-Schreibsperre erst nach bestaetigter Konsistenz und Entscheidung aufheben.

### Fall B: Fehler nach ersten produktiven Zielschreibzugriffen

Keine automatische Rueckschaltung. Zuerst entscheiden:

- **Forward Fix:** Ziel bleibt fuehrend; Fehler wird kontrolliert behoben.
- **Rueckmigration:** Zielaenderungen seit Freigabe werden vollstaendig exportiert, transformiert und in Legacy eingespielt; erst danach wird Legacy wieder beschreibbar.
- **Datenverlust akzeptieren:** nur durch fachlich und organisatorisch ausdruecklich befugte Stelle im Rahmen des beschlossenen RPO, mit dokumentiertem Umfang.

Bis zur Entscheidung bleiben beide Systeme schreibgesperrt oder das Zielsystem in einem sicheren, beschlossenen Modus. Eine manuelle Teilkopie ohne Reconciliation ist kein Rollback.

### Fall C: Anwendung fehlerhaft, Daten korrekt

- API auf den letzten schema-kompatiblen Digest zuruecksetzen.
- passendes Frontend-Artefakt derselben Kompatibilitaetslinie aktivieren.
- Datenbank nicht automatisch downgraden.
- bei nicht rueckwaertskompatibler Migration Forward Fix oder DB-Restore gemaess freigegebenem Verfahren waehlen.

### Fall D: Datenmigration fehlerhaft

- Schreibzugriffe sofort stoppen.
- Fehlerumfang und letzte konsistente Transaktion sichern.
- Ziel-DB aus dem bestaetigten Vorimport-Backup/PITR-Punkt wiederherstellen oder Migration in neuer Zielinstanz erneut ausfuehren.
- keine ad-hoc Loesch- oder Korrekturskripte ohne Review und Backup.

## RTO, RPO und Rollback-Zeit

Dieses Runbook verspricht keine Werte. Vor Go-live werden festgehalten:

| Messwert | Beschluss | Generalprobe | Cutover-Ist |
| --- | --- | --- | --- |
| RTO | offen | offen | offen |
| RPO | offen | offen | offen |
| Exportdauer | - | offen | offen |
| Importdauer | - | offen | offen |
| Reconciliation-Dauer | - | offen | offen |
| API-/Frontend-Rollback | - | offen | offen |
| DB-Restore-Dauer | - | offen | offen |
| spaeteste Go/No-Go-Zeit | offen | geprueft/offen | offen |

Ein beschlossener Wert ist nur belastbar, wenn Generalprobe, Plattformleistung und Restore-Test ihn stuetzen.

## Kommunikationsvorlage

| Zeitpunkt | Zielgruppe | Inhalt | Owner |
| --- | --- | --- | --- |
| vor Wartungsfenster | alle Nutzer/Stakeholder | Zweck, Beginn, Auswirkung, Supportweg | offen |
| Freeze aktiv | Cutover-Team und Nutzer | Schreibstopp bestaetigt, naechstes Update | offen |
| Go/No-Go | Entscheider | Nachweise, Abweichungen, Empfehlung | offen |
| Freigabe | alle Nutzer/Stakeholder | Ziel-URL, bekannte Punkte, Support | offen |
| Rollback | alle Nutzer/Stakeholder | Status, Datenstand, naechstes Update | offen |
| Hypercare-Ende | Betrieb und Fachbereich | Restpunkte, Regelbetrieb, Legacy-Status | offen |

## Nachweispaket

- freigegebene Revision, API-Digest und Target-Artefakt-Manifest,
- Scan-, Test- und Buildprotokolle,
- Schema- und Migrationsversion,
- Quell-/Ziel-Counts, Stichproben und Differenzliste,
- Export-/Backup-/Restore-Nachweise,
- Zeitprotokoll fuer Freeze, Import, Pruefung und Freigabe,
- Gateway-/Rollen- und fachliche Smoke Tests,
- Go/No-Go-Entscheidung und Freigaben,
- Nutzerkommunikation und Incident-/Abweichungsliste,
- ausgefuelltes [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md).

## Abschlusskriterien

Die Migration ist abgeschlossen, wenn die Definition of Done in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md) erfuellt, die Hypercare formell beendet und fuer den Legacy-Pfad ein dokumentierter Endzustand erreicht ist. Ein noch beschreibbarer, unbeaufsichtigter Supabase-Legacy-Pfad ist kein abgeschlossener Cutover.
