# IT-Uebergabe Zielbetrieb

Status: Uebergabepaket vorbereitet, externe Betriebs- und Plattformentscheidungen offen

Stand: 18. Juli 2026

## 60-Sekunden-Pitch

Der Versorgungs-Kompass ist eine interne Arbeitsanwendung, die Kontakte, Organisationen, Hospitationen und Beobachtungen zu gemeinsam nutzbarem Versorgungswissen verbindet. GitHub Pages zeigt ausschliesslich eine oeffentliche Demo mit synthetischen Daten; die Realanwendung bleibt hinter einer internen Zugriffsschicht. Ihr Browser spricht ausschliesslich mit `/api`; Datenbank, Rollenpruefung und Storage liegen hinter einer Node.js API im Kubernetes-Namespace. Die API akzeptiert OIDC oder eine gleichwertig signierte und serverseitig verifizierte Plattformidentitaet; Daten kommen aus Shared Postgres. Die Uebernahme erfolgt mit synthetischer Pre-Integration, festgelegten Verantwortlichkeiten, kontrollierter Datenmigration, Go/No-Go und getestetem Rollback. Damit uebergibt das Produktteam keinen persoenlichen GCP-Aufbau, sondern einen pruefbaren Anwendungsvertrag, den die IT in ihre Standards einpassen kann.

## Gewuenschtes Ergebnis des IT-Termins

Der Termin soll nicht pauschal "die Anwendung freigeben". Er soll Verantwortliche benennen und einen Weg zu verbindlichen Entscheidungen eroeffnen:

1. Zielplattform, Namespace, internes Hosting, URL, DNS und TLS.
2. Gateway-/SSO-Vertrag einschliesslich OIDC-Issuer, Audience, JWKS, Claims und Tokenweitergabe.
3. Shared Postgres, Object Storage, Secrets, Backup und Restore.
4. Software-Factory-, Artefakt-, Freigabe-, Change- und Rollbackverfahren.
5. Datenklassifikation, Pilotumfang, Aufbewahrung und Loeschung.
6. Betriebsverantwortung, Service Desk, Monitoring und Eskalation.
7. SLO, Supportzeit, RTO und RPO als bewusst beschlossene Werte.
8. Definition of Ready fuer Migration und Definition of Done fuer Betriebsuebernahme.

## Produktnutzen und Betriebsgrenze

Der Versorgungs-Kompass unterstuetzt:

- Suche, Filterung, Karte und Pflege von Versorgungskontakten und Organisationen,
- Rollen und Zustaendigkeiten im Team,
- Planung und Dokumentation von Hospitationen,
- strukturierte Beobachtungen, Auswertungen und gemeinsames Versorgungswissen,
- nachvollziehbare Aenderungen, Datenqualitaet und fachliche Arbeitsablaeufe.

Nicht Teil des Anwendungsvertrags sind die Bereitstellung oder der Betrieb von Kubernetes, Registry, Gateway/SSO, Datenbank, Object Storage, zentralem Logging, Backup-Infrastruktur oder Service Desk. Diese Dienste werden von der Zielplattform bereitgestellt oder durch bestaetigte Teams verantwortet. Die Anwendung liefert Container, statisches Target-Artefakt, Helm-Referenz, API-Vertrag, Migrationsanforderungen, Tests und Betriebswissen.

## Zielarchitektur

```text
Interne Nutzerinnen und Nutzer
            |
            v
Gateway / SSO / TLS / interne Zugriffskontrolle
  - stellt signiertes OIDC-/Plattformtoken bereit
  - API prueft Signatur, Issuer, Audience und Claims
            |
            +--------------------------+
            |                          |
            v                          v
statisches dist/target/             /api
internes Hosting                 Node.js API
                                     |
                       +-------------+-------------+
                       |                           |
                       v                           v
               Shared Postgres             Object Storage

Software Factory -> Checks/Scans -> unveraenderliche Artefakte
                 -> kontrollierte Promotion -> Hosting + Kubernetes
```

Die konkrete Plattformauspraegung bleibt offen. Der Vertrag fordert jedoch:

- interne, TLS-geschuetzte Auslieferung,
- same-origin `/api` oder eine explizit freigegebene interne API-Basis,
- OIDC oder gleichwertig signierte/verifizierte Plattformidentitaet; unsignierte Trusted Header nur als genehmigte Ausnahme,
- serverseitige Rollenpruefung fuer `viewer`, `editor` und `admin`,
- keine direkten Supabase-Zugriffe im Target-Browser,
- getrennte Laufzeit- und Migrationsrechte fuer die Datenbank,
- private Storage-Pfade oder kontrollierte Auslieferung,
- nachvollziehbare, unveraenderliche Releases und Rollbacks.

## Umgebungen auf einen Blick

| Umgebung | Rolle | Daten | Identitaet | Build | Betriebszusage |
| --- | --- | --- | --- | --- | --- |
| GitHub Pages Demo | Produkt zeigen | fiktiv | keine/leichtgewichtig | `dist/pages/` | keine Zielbetriebszusage |
| `pre-gematik` | technische Pre-Integration und freigegebener Echtdaten-Pilot | standardmaessig synthetisch; Echtdaten nur nach dokumentierten Gates | GCP IAP | `dist/target/` | keine Produktivzusage |
| gematik Zielbetrieb | interner IT-Service | freigegebene Datenklassen | gematik Gateway/SSO | `dist/target/` | zu beschliessen |

Die vollstaendige Matrix steht in der [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md).

## Was bereits vorbereitet ist

- getrennte Buildausgaben `dist/pages/` und `dist/target/`,
- klare Regel: `dist/pages/` ist nur Pages-Artefakt und keine Target-Quelle,
- Node.js API und API-Dockerfile,
- API-Vertrag fuer fachliche `/api/...`-Endpunkte,
- Helm-Referenzchart fuer API und optionale Plattformadapter,
- Jenkins-Referenzpipeline fuer Software-Factory-Anbindung,
- GitHub-Actions-/GKE-Autopilot-Pre-Integration mit WIF statt langlebigem Service-Account-Key,
- temporaeres, idempotentes Pre-Integrationsschema und synthetische Testdaten,
- Target-Audits fuer Gateway-Zwang und verbotene Browserabhaengigkeiten,
- technische Readiness- und Smoke-Tests,
- Migrations-, Cutover-, Rollback- und RACI-Arbeitsvorlagen.

Technische Governance ist vorbereitet: `.github/dependabot.yml` beobachtet Abhaengigkeiten; `.github/CODEOWNERS` weist bis zur Bestaetigung institutioneller Teamhandles den realen Repository-Account `@TimoFrank` als Uebergangs-Owner aus. Eine verpflichtende unabhaengige Code-Owner-Freigabe folgt erst mit einer zweiten bestaetigten Person. Der Einstieg [deploy/README](../../deploy/README.md) verweist ohne Duplikate auf die operativen Artefakte waehrend der Software-Factory-Uebergangsphase.

Das Helm-Referenzchart unterstuetzt revisionsfeste Image-Digests und validiert Values ueber `values.schema.json`. Die Pre-GKE-Auslieferung liest versionierte Frontend-Releases ueber `releasePrefix` und `contentRevision`. Die Jenkins-Referenz staged Target-Frontend-Releases nur unter `releases/<git-sha-build>` mit `promotionRequired: true`: Das beweist die vorbereitete Releasegrenze, ersetzt aber nicht den noch durch die IT festzulegenden Produktions-Promotionsmechanismus. Fuer den OIDC-Zieldefault sind die semantischen Werte Issuer, Audience und JWKS-URL als Jenkins-Credentials vorgesehen; konkrete Plattformwerte bleiben offen.

Die GCP-Autopilot-Umgebung beweist technische Anschlussfaehigkeit, nicht die Eignung ihrer Projekt-, Domain-, OAuth- oder Break-glass-Werte fuer den Zielbetrieb. Diese Werte bleiben in geschuetzten Umgebungsvariablen und muessen vor Zielbetrieb durch institutionelle Werte ersetzt werden.

## Entscheidungsregister fuer die IT

In der Spalte "Beschluss" ist bewusst kein Wert vorweggenommen.

| ID | Entscheidung | Benoetigte Beteiligte | Beschluss/Nachweis |
| --- | --- | --- | --- |
| D-01 | Zielprojekt, Namespace, Region und Mandantentrennung | Plattformbetrieb, Informationssicherheit | offen |
| D-02 | internes Frontend-Hosting und same-origin Routing | Plattformbetrieb, Netzwerk/Gateway | offen |
| D-03 | Ziel-URL, DNS, TLS und Zertifikatsverantwortung | Netzwerk/Gateway, Plattformbetrieb | offen |
| D-04 | OIDC-/SSO-Vertrag: Issuer, Audience, JWKS, Claims, Tokenweitergabe und Rotation | IAM, Informationssicherheit, Anwendung | offen |
| D-05 | Bereitstellung und Lebenszyklus von `profiles` und Rollen | Fachbetrieb, IAM, Anwendung | offen |
| D-06 | Shared-Postgres-Service, Runtime- und Migrationsrollen | DB-Betrieb, Plattformbetrieb | offen |
| D-07 | Object Storage, Malware-/Dateipruefung, Zugriff und Loeschung | Plattformbetrieb, Informationssicherheit, Datenschutz | offen |
| D-08 | Datenklassifikation und zulaessiger Pilotdatenumfang | Datenschutz, Informationssicherheit, Fachverantwortung | offen |
| D-09 | Software Factory, Registry, Signierung/Attestierung und Promotion | CI/CD-/Plattformbetrieb, Anwendung | offen |
| D-10 | Change-, Release-, Vier-Augen- und Notfallfreigabe | Betriebsverantwortung, Anwendung, Plattformbetrieb | offen |
| D-11 | Logging, Monitoring, Alarmierung und Aufbewahrung | Plattformbetrieb, Datenschutz, Service Owner | offen |
| D-12 | Backup, Restore, Restore-Probe und Aufbewahrung | DB-/Storage-Betrieb, Service Owner | offen |
| D-13 | Supportzeit, Prioritaeten, Eskalation und Service Desk | Service Owner, Service Desk | offen |
| D-14 | SLO, RTO, RPO und Wartungsfenster | Service Owner, Fachverantwortung, Plattformbetrieb | offen |
| D-15 | Cutover-Fenster, Go/No-Go-Gremium und Legacy-Abschaltung | alle betroffenen Owner | offen |
| D-16 | Sicherheits-, Datenschutz- und gegebenenfalls Architekturfreigaben | zustaendige Governance-Stellen | offen |

## Nicht zu erfindende Servicewerte

Dieses Paket gibt keine Verfuegbarkeits-, Wiederanlauf- oder Datenverlustzusage ab. Vor dem Go-live werden die folgenden Felder beschlossen, technisch plausibilisiert und mit den Plattformleistungen abgeglichen:

| Feld | Zu klaerende Frage | Beschlossener Wert | Nachweis/Owner |
| --- | --- | --- | --- |
| Servicezeit | Wann muss der Service regulaer betreut werden? | offen | offen |
| SLO Verfuegbarkeit | Welche messbare Verfuegbarkeit gilt in welcher Servicezeit? | offen | offen |
| Messpunkt | Gateway, Frontend, API oder fachliche Transaktion? | offen | offen |
| RTO | Bis wann muss der Dienst nach einem schweren Ausfall wieder nutzbar sein? | offen | offen |
| RPO | Welcher maximale Datenverlustzeitraum ist fachlich tragbar? | offen | offen |
| Restore-Zeit | Wie lange dauert ein nachgewiesener Restore mit realistischem Datenvolumen? | offen | offen |
| Wartungsfenster | Wann duerfen Releases und Migrationen stattfinden? | offen | offen |
| Alarmreaktion | Wer reagiert je Prioritaet in welcher Zeit? | offen | offen |

RTO und RPO duerfen nicht allein vom Anwendungsteam festgelegt werden. Sie muessen zu Backupfrequenz, PITR, Restore-Dauer, Plattform-SLO und fachlichem Schaden passen.

## Definition of Ready fuer Zielmigration

Ein Cutover darf erst geplant werden, wenn alle Punkte erfuellt oder als dokumentierte Ausnahme freigegeben sind:

- [ ] Zielarchitektur und Datenfluss sind durch die zustaendigen Stellen bestaetigt.
- [ ] RACI enthaelt benannte Personen oder Teams fuer alle A- und R-Zellen.
- [ ] Ziel-URL sowie OIDC-/SSO-Vertrag mit Issuer, Audience, JWKS, Claims, Tokenweitergabe und negativen Tokenfaellen sind technisch getestet.
- [ ] Namespace, Registry, Shared Postgres, Secrets und Storage sind bereitgestellt.
- [ ] Datenklassifikation, Pilotumfang, Aufbewahrung und Loeschkonzept sind freigegeben.
- [ ] Runtime- und Migrationsrollen sind getrennt; Least Privilege ist nachgewiesen.
- [ ] Software-Factory baut `dist/target/` und das API-Image reproduzierbar; `dist/pages/` wird nicht verwendet.
- [ ] institutionelle Frontend-Promotion ist implementiert; `promotionRequired: true` ist nicht mehr nur ein Staginghinweis.
- [ ] Code Owner/Branchschutz oder ein gleichwertiger Software-Factory-Schutz sind mit echten Teamidentitaeten aktiviert.
- [ ] Zielartefakte sind unveraenderlich identifizierbar und durch Scans/Tests belegt.
- [ ] Schema- und Datenmigration wurden mindestens einmal mit produktionsnahem Umfang geprobt.
- [ ] Counts, Fremdschluessel, Rollen, Historie, Dateien und fachliche Stichproben besitzen Abnahmekriterien.
- [ ] Backup und Restore wurden praktisch getestet; RTO/RPO sind beschlossen.
- [ ] Monitoring, Logs, Alerts, Dashboards und Runbooks sind abnahmebereit.
- [ ] Cutover-, Kommunikations- und Rollbackplan sind terminiert und freigegeben.
- [ ] Legacy-Schreibstopp und spaetere Abschaltung haben Owner und Kriterien.

## Definition of Done fuer Betriebsuebernahme

Der Zielbetrieb gilt nicht bereits mit einem erfolgreichen Kubernetes-Rollout als uebernommen. Er ist erst abgeschlossen, wenn:

- [ ] der freigegebene Release per Revision, Image-Digest und Target-Artefakt-Hash nachgewiesen ist,
- [ ] technische und fachliche Smoke Tests im Zielsystem erfolgreich sind,
- [ ] unauthentifizierte und unberechtigte Zugriffe erwartungsgemaess abgewiesen werden,
- [ ] keine Supabase-URL, kein Supabase-Key und kein direkter Supabase-Aufruf im Target-Browser vorkommt,
- [ ] Datenmigration und Reconciliation protokolliert und fachlich abgenommen sind,
- [ ] Monitoring, Alerting, Logging und Backup aktiv sind,
- [ ] eine Restore-Probe und ein Release-Rollback nachgewiesen sind,
- [ ] Service Desk, Eskalation, Betriebszeiten, SLO, RTO und RPO dokumentiert sind,
- [ ] Runbooks und RACI durch die uebernehmenden Teams bestaetigt sind,
- [ ] Datenschutzhinweise, Berechtigungskonzept und Loeschverfahren freigegeben sind,
- [ ] Hypercare-Ende und Uebergang in den Regelbetrieb bestaetigt sind,
- [ ] der Legacy-Pfad gemaess Beschluss auf read-only gesetzt, zur Demo reduziert oder abgeschaltet wurde.

## Hauptrisiken und vorbereitete Gegenmassnahmen

| Risiko | Gegenmassnahme |
| --- | --- |
| Demo-Konfiguration gelangt in Target | getrennte Buildziele, verbotene Muster, Ausschluss des Pages-Artefakts |
| persoenliche Pre-Integrationswerte werden zum Schattenstandard | ausdrueckliche Temporaerkennzeichnung und institutionelles Entscheidungsregister |
| Identitaet kann gefaelscht oder fuer falsche Audience ausgestellt sein | Signatur, Issuer, Audience und JWKS in der API pruefen; negative Token-Tests; unsigned Header in Produktion sperren |
| API und Frontend sind inkompatibel | gemeinsame Release-ID und Promotion als Releasepaar |
| Daten gehen beim Cutover verloren oder divergieren | Schreibfreeze, Delta-Plan, Counts/Stichproben, Go/No-Go, Restore-Punkt |
| Rollback erzeugt zwei beschreibbare Wahrheiten | kein unkontrolliertes Dual-Write; Rueckschaltung nur mit Datenentscheid |
| Betrieb bleibt bei Einzelpersonen haengen | RACI, Service Desk, institutionelle Break-glass-Verantwortung |
| unhaltbare SLO-Zusagen | Werte erst nach Plattform- und Restore-Nachweis beschliessen |

## Vorgeschlagene Agenda fuer den ersten IT-Termin

1. 5 Minuten: Produktproblem und 60-Sekunden-Pitch.
2. 10 Minuten: Umgebungsmatrix und klare Nicht-Ziele.
3. 15 Minuten: Zielarchitektur und Sicherheitsgrenzen.
4. 15 Minuten: Entscheidungsregister D-01 bis D-16; Owner je Entscheidung benennen.
5. 10 Minuten: Definition of Ready, Migrationsprobe und Go/No-Go.
6. 5 Minuten: naechste Termine, Nachweise und Entscheidungsprotokoll.

## Uebergabepaket

- [Zielbetriebs-Einstieg](ZIEL-README.md)
- [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md)
- [ADR zur Deployment-Trennung](ADR_001_DEPLOYMENT_TRENNUNG.md)
- [Zielkonzept gematik Kubernetes](GEMATIK_K8S_ZIELKONZEPT.md)
- [Technisches Kubernetes-Deployment](DEPLOYMENT_GEMATIK_K8S.md)
- [Betriebshandbuch](BETRIEB.md)
- [Betriebsverantwortung/RACI](BETRIEBSVERANTWORTUNG_RACI.md)
- [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md)
- [Supabase nach Cloud SQL: konkreter Migrations- und Freigabeplan](SUPABASE_CLOUD_SQL_MIGRATION.md)
- [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md)
- [Abnahmeprotokoll-Template](ABNAHMEPROTOKOLL_TEMPLATE.md)
- [Repository-Governance vor Pilot und Zielbetrieb](REPOSITORY_GOVERNANCE.md)
- [CODEOWNERS - aktiver Uebergangs-Owner](../../.github/CODEOWNERS)
- [Dependabot-Konfiguration](../../.github/dependabot.yml)
- [GCP-Autopilot-Pre-Integration](DEPLOYMENT_GCP_AUTOPILOT.md)
- [Deployment-Einstieg](../../deploy/README.md)

## Naechster Schritt

Das Produkt-/Entwicklungsteam kann die vorbereiteten Artefakte und Nachweise vorstellen. Die uebernehmende IT benennt danach fuer D-01 bis D-16 je einen Entscheidungsowner und einen Zieltermin. Erst diese Beschluesse verwandeln das technische Zielbild in einen belastbaren Zielbetrieb.
