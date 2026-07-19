# Betriebshandbuch Versorgungs-Kompass

Status: Zielbetriebsrahmen vorbereitet; institutionelle Owner und Servicewerte offen

Stand: 18. Juli 2026

## 1. Zweck und Betriebsmodi

Dieses Handbuch beschreibt den erwarteten Regelbetrieb des internen Kubernetes-Zielsystems und grenzt ihn von der rein synthetischen oeffentlichen Demo ab.

| Modus | Zweck | Fuehrende Unterlage |
| --- | --- | --- |
| GitHub Pages Demo | oeffentliche Ansicht mit fiktiven Daten | `DEMO.md` |
| `pre-gematik` | temporaere technische Pre-Integration ohne Echtdaten | `DEPLOYMENT_GCP_AUTOPILOT.md` |
| gematik Zielbetrieb | interner, institutionell verantworteter Service | dieses Handbuch und `DEPLOYMENT_GEMATIK_K8S.md` |

GitHub Pages ist kein Staging und veroeffentlicht `dist/pages/` direkt ueber GitHub Actions. Zielreleases verwenden `dist/target/` und ein unveraenderliches API-Image.

## 2. Servicebeschreibung

Der Versorgungs-Kompass unterstuetzt die gemeinsame Arbeit mit Versorgungskontakten, Organisationen, Profilen, Hospitationen, Beobachtungen, Formaten, Stakeholdern, Karten, Auswertungen und Datenqualitaet.

Zielkomponenten:

| Komponente | Betriebsaufgabe |
| --- | --- |
| internes Frontend-Hosting | statisches `dist/target/` revisionsfest ausliefern und zurueckrollen |
| Gateway/SSO | Nutzer authentisieren und signiertes OIDC-/Plattformtoken mit vereinbartem Issuer/Audience bereitstellen |
| Kubernetes/Helm | API-Pods, Service, Konfiguration, Probes und Rollouts betreiben |
| Node.js API | fachliche `/api/...`-Endpunkte, Authz, Daten-/Storage-Zugriff |
| Shared Postgres | kanonische Fachdaten, Backup/PITR und Restore |
| Object Storage | Profil-/Kontaktbilder und Anhaenge kontrolliert speichern/ausliefern |
| Secret Management | Datenbank- und Plattformgeheimnisse zentral verwalten und rotieren |
| Observability | Logs, Metriken, Alerts, Dashboards und Auditnachweise |
| Software Factory | bauen, pruefen, scannen, attestieren und kontrolliert promoten |

Die konkrete Produktauswahl und Betriebsverantwortung werden in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md) und [RACI](BETRIEBSVERANTWORTUNG_RACI.md) bestaetigt.

## 3. Servicewerte und Betriebszeiten

Dieses Handbuch gibt keine erfundenen Zusagen ab. Vor Go-live sind auszufuellen:

| Feld | Beschluss | Owner | Mess-/Nachweisverfahren |
| --- | --- | --- | --- |
| Servicezeit | offen | offen | offen |
| Supportzeit | offen | offen | offen |
| Verfuegbarkeits-SLO | offen | offen | offen |
| fachlicher Messpunkt | offen | offen | offen |
| RTO | offen | offen | Restore-/Wiederanlauftest offen |
| RPO | offen | offen | Backup-/PITR-Vertrag offen |
| Wartungsfenster | offen | offen | offen |
| Alarmreaktion je Prioritaet | offen | offen | offen |
| Aufbewahrung Logs/Audits | offen | offen | offen |

RTO und RPO werden nur beschlossen, wenn Datenbank-/Storage-Sicherung, gemessene Restore-Dauer und fachliche Verlusttoleranz zusammenpassen.

## 4. Rollen und Zugriff

Fachrollen der Anwendung:

| Rolle | Erwartete Rechte |
| --- | --- |
| `viewer` | freigegebene aktive Daten lesen, suchen, filtern, Karte und Auswertungen verwenden |
| `editor` | zusaetzlich freigegebene aktive Inhalte anlegen und bearbeiten |
| `admin` | zusaetzlich administrative Fachablaeufe wie Rollenpflege, Archiv oder kontrollierte Importe |

Die API setzt diese Rechte serverseitig durch. Browserseitige Sichtbarkeit ist kein Sicherheitsmechanismus.

Ein Nutzer benoetigt:

1. gueltige institutionelle Gateway-/SSO-Berechtigung,
2. aktives Mapping in `profiles`,
3. freigegebene Fachrolle.

Zu betreibende Prozesse:

- Joiner: Identitaet, Profil, Rolle und Zweck freigeben.
- Mover: Team-/Rollenwechsel zeitnah umsetzen und dokumentieren.
- Leaver: Gatewayzugang und Profil deaktivieren; aktive Sessions gemaess Plattformstandard behandeln.
- Rezertifizierung: Nutzer und privilegierte Rollen in beschlossenem Intervall bestaetigen.
- Break-glass: institutionelles Konto, eng begrenzte Rechte, Audit, Alarm und nachtraegliche Pruefung.
- Tokenbetrieb: Issuer/Audience/Claims, JWKS-Keyrotation, Laufzeiten und Fehlerverhalten ueberwachen.

Der persoenliche Break-glass-Nutzer der GCP-Pre-Integration darf nicht in den Zielbetrieb uebernommen werden.

## 5. Betriebsuebergabe und Kontakte

Vor Go-live muessen diese Felder ausgefuellt und in Servicekatalog/Runbook verlinkt werden:

| Funktion | Team/Kontakt | Kanal | Vertretung |
| --- | --- | --- | --- |
| Service Owner | offen | offen | offen |
| fachliche Datenverantwortung | offen | offen | offen |
| Application Owner | offen | offen | offen |
| Plattform/GKE | offen | offen | offen |
| IAM/Gateway | offen | offen | offen |
| Shared Postgres | offen | offen | offen |
| Service Desk | offen | offen | offen |
| Informationssicherheit | offen | offen | offen |
| Datenschutz | offen | offen | offen |

Die vollstaendige Zuordnung steht in [Betriebsverantwortung und RACI](BETRIEBSVERANTWORTUNG_RACI.md).

## 6. Monitoring, Logging und Alarmierung

### Technische Signale

Mindestens zu beobachten:

- Erreichbarkeit von Gateway, Frontend und API,
- Kubernetes Rollout, gewuenschte/verfuegbare Replicas, Restarts und CrashLoops,
- Readiness-/Liveness-Fehler,
- API-Latenz und Fehlerraten nach Statusklasse und Route ohne sensible Parameter,
- Datenbankverbindungen, Poolsaettigung, Queryfehler und Kapazitaet,
- Storagefehler und Quoten,
- fehlgeschlagene Authentisierungen, `403`-Anstiege und Gatewayvalidierungsfehler,
- Secret-/Zertifikatsablauf und fehlgeschlagene Rotation,
- Backupstatus und Restore-Teststatus,
- Deployment- und Migrationsereignisse.

### Fachliche Signale

Nach Freigabe geeigneter Messungen:

- Kontakte/Organisationen werden plausibel geladen,
- definierte Kerntransaktion kann gelesen und von berechtigter Rolle geschrieben werden,
- Viewer-Schreibversuch wird abgewiesen,
- Karte/Auswertung liefern plausible Ergebnisse,
- Datenqualitaets- und Importfehler sind sichtbar und zuordenbar.

### Logging-Regeln

- keine Passwoerter, Tokens, Secretwerte oder vollstaendige Auth-Header,
- keine unnoetigen Kontakt-, Gesundheits- oder Freitextdaten,
- Korrelation ueber Request-/Trace-ID statt Inhaltskopien,
- Zugriff auf Logs nach Least Privilege,
- Aufbewahrung und Loeschung gemaess beschlossenem Datenschutz-/Security-Vertrag,
- Security- und Adminereignisse manipulationsgeschuetzt und auswertbar nach Plattformstandard.

### Alarmkatalog als Vorlage

| Alarm | Schwelle | Prioritaet | Empfaenger | Runbook |
| --- | --- | --- | --- | --- |
| fachlicher Healthcheck fehlgeschlagen | offen | offen | offen | offen |
| API-Fehlerrate/Latenz | offen | offen | offen | offen |
| Pods nicht ready / Rollout fehlgeschlagen | offen | offen | offen | offen |
| DB nicht erreichbar / Pool erschoepft | offen | offen | offen | offen |
| Gateway-/SSO-Validierung fehlerhaft | offen | offen | offen | offen |
| Backup fehlgeschlagen | offen | offen | offen | offen |
| Zertifikat/Secret laeuft ab | offen | offen | offen | offen |
| unerwartete privilegierte Aktion | offen | offen | offen | offen |

## 7. Regelmaessige Routinen

Frequenzen werden an Servicezeit und Risiko angepasst. Die folgende Liste beschreibt Inhalte, keine zugesagten Intervalle.

### Betriebskontrolle

- Dashboards und offene Alerts pruefen.
- letzte Deployments/Migrationen und Abweichungen pruefen.
- API-/Gateway-/DB-/Storagefehler korrelieren.
- fachlichen Kernpfad und Rollenabwehr stichprobenartig pruefen.
- Datenqualitaetsauffaelligkeiten an fachliche Verantwortung uebergeben.

### Sicherheits- und Zugriffspruefung

- privilegierte Nutzer, Break-glass und abgelaufene Zugriffe pruefen.
- offene Schwachstellen und Dependency-Updates priorisieren.
- Image-/Dependency-/Secret-Scan-Ergebnisse nachverfolgen.
- Zertifikate, Secrets und Rotationsstatus pruefen.
- OIDC-Vertrag und negative Tokenfaelle nach Gateway-/IAM-Aenderungen regressionspruefen.

### Daten- und Wiederherstellungspruefung

- Backup-/PITR-Status pruefen.
- Restore-Probe nach beschlossenem Plan ausfuehren und Dauer messen.
- Storagewiederherstellung beziehungsweise Objektversionierung pruefen.
- Schema-/Migrationsstand gegen freigegebene Version abgleichen.
- Counts und fachliche Datenqualitaetsindikatoren plausibilisieren.

### Betriebsreview

- SLO/SLA-Bericht nach beschlossenem Messverfahren,
- Incidents, Beinahevorfaelle und Problem Records,
- Kapazitaet, Kosten und Quoten,
- Nutzer-/Rollenrezertifizierung,
- Aufbewahrung/Loeschung,
- RACI-, Runbook- und Kontaktaktualitaet.

## 8. Backup und Restore

Zu sichern beziehungsweise wiederherstellbar zu halten:

- Shared-Postgres-Daten und freigegebene Schema-/Migrationsversion,
- Object-Storage-Objekte samt erforderlicher Metadaten,
- freigegebene API-Digests und Target-Frontend-Revisionen,
- Helm-/Plattformkonfiguration ohne Geheimnisse,
- notwendige Secrets ueber das institutionelle Secret-Backup-/Recovery-Verfahren,
- Abnahme-, Release- und Migrationsnachweise.

Vor Go-live dokumentieren:

| Gegenstand | Verfahren | Frequenz/Retention | Restore-Schritt | Owner |
| --- | --- | --- | --- | --- |
| Shared Postgres | offen | offen | offen | offen |
| Object Storage | offen | offen | offen | offen |
| Frontend-Releases | versionierte Artefakte, Zielverfahren offen | offen | vorherige Revision aktivieren | offen |
| API-Images | unveraenderliche Digests | offen | vorherigen kompatiblen Digest deployen | offen |
| Secrets | institutioneller Prozess | offen | offen | offen |

Restore-Probe:

1. isoliertes Ziel und genehmigten Sicherungsstand waehlen.
2. Datenbank und Dateien wiederherstellen.
3. Schema, Counts, Constraints und Stichproben pruefen.
4. API mit kompatiblem Releasepaar starten.
5. Gateway-/Rollen- und fachliche Kernpfade pruefen.
6. Dauer, Datenstand, Abweichungen und erreichbares RTO/RPO protokollieren.

Ein konfiguriertes Backup ohne erfolgreiche Restore-Probe gilt nicht als Betriebsnachweis.

## 9. Release und Deployment

Zielreleases verwenden:

- `dist/target/` mit Manifest/Hash,
- API-Image per Digest,
- gemeinsame Release-ID,
- versionierte Datenbankmigration,
- Test-/Scan-/SBOM-/Provenance-Nachweise,
- Freigaben gemaess RACI.

Vor Deployment:

- Scope, Revision und Datenbankkompatibilitaet pruefen.
- aktive Incidents, Freeze- oder Wartungskonflikte pruefen.
- vorheriges kompatibles Release und Restore-Punkt bestaetigen.
- Target-Audit, Tests und Scans bestaetigen.
- Change/Freigabe und Kommunikationsplan bestaetigen.

Nach Deployment:

- Rollout und Probes pruefen.
- Gatewaygrenze und Rollen negativ/positiv testen.
- Kernpfade, Logs, Metriken und Alerts pruefen.
- Release-ID fuer Frontend/API/Schema abgleichen.
- Abweichungen und Freigabe im [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) dokumentieren.

Die vollstaendige Liste steht in [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md).

## 10. Incident- und Problemprozess

### Erstreaktion

1. Incident im bestaetigten Service-Desk-Kanal erfassen.
2. Zeitpunkt, betroffene Nutzer/Funktionen, letzte Aenderung und sichtbare Symptome festhalten.
3. Keine Secrets, Auth-Header oder unnoetigen Fachdaten in Ticket/Chat kopieren.
4. Prioritaet nach dem beschlossenen Modell einstufen.
5. zustaendige APP/PLAT/IAM/DB-Rolle alarmieren.
6. Datenintegritaets- oder Security-/Datenschutzverdacht ausdruecklich kennzeichnen.

### Diagnosefolge

1. Gateway/DNS/TLS und Frontend-Erreichbarkeit.
2. Kubernetes Rollout, Pods, Probes und letzte Deployments.
3. API-Fehler/Logs/Korrelation.
4. SSO-/Profile-/Rollenmapping.
5. DB-Verbindung, Migration, Locks/Pool und Storage.
6. fachlicher Datenstand und Reconciliation.

### Eindämmung

- bei Datenintegritaetsverdacht Schreibpfade stoppen,
- bei Auth-/Gateway-/OIDC-Verdacht Zugriff fail-closed halten,
- bei fehlerhaftem Release vorheriges schema-kompatibles Releasepaar pruefen,
- bei moeglichem Security-/Datenschutzvorfall institutionellen Incident-Prozess starten,
- keine ad-hoc Datenbankkorrektur ohne Backup, Review und Protokoll.

### Abschluss

- Ursache, Auswirkung, Zeitlinie und Datenbetroffenheit dokumentieren,
- Wiederherstellung und fachliche Validierung bestaetigen,
- Nachmassnahmen mit Owner/Frist fuehren,
- bei wiederkehrender Ursache Problem Record/RCA gemaess Standard,
- Runbooks, Tests oder Alerts aktualisieren.

## 11. Typische Stoerungsbilder

### Frontend erreichbar, Daten fehlen

- Release-ID und Target-Konfiguration pruefen.
- Browsernetzwerk auf `/api` und verbotene Supabase-Aufrufe pruefen.
- API-Health, Gatewayrouting und CORS/same-origin Vertrag pruefen.
- Session/Profil/Rolle sowie DB-Verbindung pruefen.

### Nutzer authentisiert, aber `403`

- stabiles SSO-Attribut und erwarteten Header ohne Geheimwerte pruefen.
- aktives `profiles`-Mapping und Rolle pruefen.
- keine Berechtigung durch reine Frontendmanipulation umgehen.
- bei Rollenwechsel Session-/Cachevertrag beachten.

### Speichern fehlschlaegt

- Rolle und fachlichen Datensatzstatus pruefen.
- API-Validierungsfehler und DB-Constraints pruefen.
- Migration/Schema-Version gegen API-Release abgleichen.
- bei breitem Fehler Schreibpfade pausieren und Incident eroeffnen.

### Karte/Auswertung unplausibel

- Filter, aktive/archivierte Daten und Koordinaten pruefen.
- Counts und zuletzt migrierte/geaenderte Datensaetze vergleichen.
- fachliche Datenverantwortung einbeziehen; kein technischer Schnellfix ohne Datenentscheidung.

### Rollout fehlschlaegt

- Image-Digest, Pullberechtigung, Config/Secrets und Probes pruefen.
- Helm-/Plattformereignisse und Podlogs ohne Secret-Ausgabe pruefen.
- bei kompatiblem vorherigem Schema API/Frontend als Releasepaar zurueckrollen.
- bei Migration [Cutover-/Rollback-Runbook](MIGRATION_CUTOVER_ROLLBACK.md) anwenden.

## 12. Security-, Datenschutz- und Patchbetrieb

- Abhaengigkeiten automatisiert beobachten; `dependabot.yml` ist als technischer Governance-Schritt vorbereitet.
- Securityupdates nach Risiko und beschlossenem Changeverfahren behandeln.
- SAST, Secret-, Dependency- und Image-Scan als Releasegates betreiben.
- echte Secrets bei Fund sofort rotieren und Historie/Verteilung bewerten.
- Datenzugriffe, Exporte, Importe und privilegierte Aktionen nach Freigabekonzept nachvollziehbar halten.
- Aufbewahrungs-, Auskunfts-, Berichtigungs- und Loeschprozesse mit Datenschutz/Fachverantwortung definieren.
- Datei-Uploads nach freigegebenem MIME-, Groessen-, Malware- und Rechtevertrag behandeln.

`.github/CODEOWNERS` ist aktiv und nennt mit `@TimoFrank` den bestaetigten realen Uebergangs-Owner des persoenlichen Repositories. Institutionelle Produkt-, Plattform-, Daten- und Security-Teamhandles sowie eine unabhaengige Pflichtfreigabe bleiben Zielbetriebsentscheidungen und muessen mit der Software Factory sowie der RACI abgestimmt werden.

## 13. Geschuetzter Uebergangsdatenbestand

GitHub Pages ist bereits auf die synthetische Demo begrenzt. Der geschuetzte Ausgangsdatenbestand bleibt bis zur fachlich bestaetigten Zielmigration in einem nicht oeffentlichen Backend erhalten. Er wird weder als Pages-Anwendung noch als Repository-Seed betrieben.

- Backups, Service-Credentials und Exporte liegen ausschliesslich in freigegebenem geschuetztem Speicher.
- Schema- oder Datenmigrationen benoetigen Vorab-Backup, Testlauf, Reconciliation und Restore-/Rollbacknachweis.
- Ohne gueltige Authentisierung duerfen weder Fachdaten noch private Storage-Objekte lesbar sein.
- Bei Datenintegritaetsverdacht werden Importe und Schreibzugriffe gestoppt; der Zustand wird gesichert und gemaess [Migrationsrunbook](MIGRATION_CUTOVER_ROLLBACK.md) behandelt.
- Nach erfolgreichem Ziel-Cutover werden nicht mehr benoetigte Altzugriffe, Rollen und Credentials nach Aufbewahrungsbeschluss entzogen.

## 14. Betriebsabnahme

Der Betrieb ist bereit, wenn Definition of Ready/Done aus [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md), RACI, Servicewerte, Restore-Probe, Monitoring-/Alertnachweis, Incidentweg und der Endzustand aller Altzugriffe bestaetigt sind. Ein gruener `/healthz`-Endpunkt allein ist keine Betriebsuebernahme.
