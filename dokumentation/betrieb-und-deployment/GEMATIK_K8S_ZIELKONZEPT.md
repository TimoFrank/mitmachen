# Zielkonzept gematik Kubernetes

Status: fachlich-technisches Zielbild; Plattformauspraegung und Betriebsfreigabe offen

Stand: 18. Juli 2026

## Kurzbeschreibung

Der Versorgungs-Kompass wird als interner IT-Service uebernommen: Ein statisches Frontend laeuft hinter der internen Zugriffsschicht, spricht ausschliesslich mit `/api` und enthaelt keine direkten Supabase-Zugriffe. Die Node.js API laeuft im Kubernetes-Namespace, prueft ein signiertes OIDC-/Plattformtoken und Rollen serverseitig und greift mit eingeschraenkter Laufzeitrolle auf Shared Postgres und Object Storage zu. Software Factory, Gateway/SSO, Plattformdienste und Betrieb werden institutionell verantwortet. GitHub Pages bleibt davon getrennt und zeigt ausschliesslich die synthetische oeffentliche Demo.

## Leitentscheidungen

- GitHub Pages ist kein Staging und kein Zielbetrieb.
- `pre-gematik` ist eine temporaere GCP-Pre-Integration mit synthetischen Daten, keine Produktivplattform.
- Der Pages-Build erzeugt `dist/pages/`; der Target-Build erzeugt `dist/target/`.
- `dist/pages/` gehoert ausschliesslich zum Pages-Pfad und wird im Zielpfad nicht gelesen oder veraendert.
- Das Zielrelease besteht aus unveraenderlichem API-Image, Target-Frontend und Migrationsversion mit gemeinsamer Release-ID.
- Der Browser verwendet im Zielbetrieb nur freigegebene `/api/...`-Endpunkte.
- Produktionsidentitaet kommt per OIDC oder gleichwertig signiertem Plattformtoken und wird in der API gegen Signatur, Issuer, Audience und Claims geprueft.
- Unsignierte `trusted-header`-/`sso`-Modi sind kein Zieldefault und duerfen nur als ausdruecklich genehmigte Plattformausnahme verwendet werden.
- Rollen `viewer`, `editor` und `admin` werden in der API gegen aktive Profile geprueft.
- Infrastruktur- und Betriebswerte werden nicht aus der persoenlichen GCP-Pre-Integration uebernommen.

Die Repo-Entscheidung steht in [ADR 001](ADR_001_DEPLOYMENT_TRENNUNG.md).

## Zielarchitektur

```text
Nutzer
  |
  v
interner DNS/TLS + Gateway/SSO
  |  signiertes OIDC-/Plattformtoken
  |  API prueft Signatur, Issuer, Audience und Claims
  |
  +---- / -----------------> statisches dist/target/
  |
  `---- /api --------------> Service / Node.js API / Kubernetes
                                      |             |
                                      v             v
                               Shared Postgres  Object Storage

Software Factory
  -> Build / Tests / SAST / Secret- und Dependency-Scan
  -> API-Image + SBOM/Provenance + dist/target/-Manifest
  -> Freigabe / Promotion
  -> internes Hosting + Kubernetes
```

## Komponentenvertrag

| Komponente | Zielvertrag | Durch IT festzulegen |
| --- | --- | --- |
| Frontend | statisches `dist/target/`, keine Supabase-Browserabhaengigkeit | Hostingdienst, URL, Cache-/Rollbackverfahren |
| Gateway/Ingress | TLS, interne Zugriffskontrolle, signiertes OIDC-/Plattformtoken | Produkt, Routing, Issuer, Audience, JWKS, Claims, Betriebsowner |
| API | Container aus `api/Dockerfile`, `/api/...`, serverseitige Authz | Namespace, Ressourcen, Skalierung, Network Policies |
| Datenbank | Shared Postgres, getrennte Runtime-/Migrationsrechte | Service, Version, TLS, HA, Backup, Restore |
| Storage | private Ablage fuer Profil-/Kontaktbilder und Anhaenge | Dienst, Scan, Quota, Retention, Auslieferung |
| Secrets | keine Secrets im Repo, Frontend oder Klartext-Values | Secret Store, Rotation, Zugriff, Audit |
| CI/CD | reproduzierbare Builds und unveraenderliche Promotion | Software Factory, Registry, Signierung, Freigaben |
| Observability | strukturierte Logs, Metriken, Alerts, Korrelation | Plattformwerkzeuge, Aufbewahrung, Dashboards, On-call |

## Frontend- und API-Vertrag

Target-Konfiguration:

```js
dataMode: "api",
authMode: "oidc",
apiBaseUrl: "https://<freigegebener-interner-origin>",
requireApiGateway: true
```

`authMode: "oidc"` ist der Zieldefault. `iap` ist nur fuer die GCP-Pre-Integration vorgesehen. Ein unsignierter `trusted-header`-/`sso`-Adapter erfordert eine dokumentierte Ausnahmefreigabe durch Plattform und Informationssicherheit sowie eine technisch nachgewiesene, nicht umgehbare Vertrauensgrenze. Der Zielbrowser darf keine Supabase-Projekt-URL, keinen Supabase-Key, kein Supabase Auth, kein Supabase Browser SDK und keine direkten REST-/Storage-Aufrufe an Supabase enthalten.

Die API:

- akzeptiert im Zieldefault nur ein signiertes Token und prueft Signatur ueber JWKS, Issuer, Audience sowie konfigurierte E-Mail-/Subject-Claims,
- mappt E-Mail oder stabilen Subject auf ein aktives Profil,
- liefert ohne Profil `403`, auch bei gueltiger Gateway-Anmeldung,
- setzt Rollen serverseitig durch,
- kapselt Datenbank, Object Storage und fachliche Validierung,
- besitzt mit der Laufzeitrolle keine DDL- oder Migrationsrechte.

## Identitaets- und Berechtigungsmodell

Ein Zielaccount besteht aus:

1. berechtigtem Zugang in der institutionellen SSO-/Gateway-Schicht,
2. einem aktiven `profiles`-Eintrag,
3. einer Rolle `viewer`, `editor` oder `admin`.

Vor Go-live werden beschlossen:

- stabiler Identifier und E-Mail-Attribut,
- Joiner-/Mover-/Leaver-Prozess,
- Owner fuer Profile und Rollen,
- Rezertifizierungsintervall,
- Break-glass-Verfahren mit institutionellem Konto, Protokollierung und Ablauf,
- OIDC-Keyrotation, JWKS-Fehlerverhalten und Tokenlaufzeiten,
- Verhalten bei deaktiviertem Profil, fehlendem Attribut oder Gateway-Ausfall.

## Daten und Migration

Shared Postgres wird kanonische Datenquelle fuer die freigegebenen Fachdomaenen. Das Schema wird nicht automatisch vom API-Pod angelegt. Schema- und Datenmigrationen laufen mit separater Berechtigung und eigenem Freigabeverfahren.

Der kontrollierte Ablauf umfasst:

1. Dateninventar und Klassifikation,
2. versioniertes Zielschema und Transformationsregeln,
3. synthetischen technischen Probelauf,
4. Generalprobe mit freigegebenem Umfang,
5. Schreibfreeze und finalen Export,
6. Import mit stabilen IDs und Zeitstempeln,
7. Counts, Constraints, Dateien und fachliche Stichproben,
8. Go/No-Go und eindeutige fuehrende Datenquelle,
9. Hypercare und beschlossene Legacy-Abschaltung.

Fuehrend ist [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md).

## Deployment- und Releaseprinzip

```text
Git-Revision
-> npm ci und Repository-Checks
-> Pages-Build dist/pages/             (separater Kanal)
-> Target-Build dist/target/           (Zielkanal)
-> Target-Audit
-> API-Containerbuild
-> SAST / Secret / Dependency / Image Scan
-> SBOM, Provenance und Artefaktmanifest
-> Helm-/Plattformvalidierung
-> Freigabe
-> Promotion desselben Releasepaars
-> Smoke Tests und Abnahmeprotokoll
```

Die operative Pfaduebergabe ist in [deploy/README](../../deploy/README.md) beschrieben. Helm, Jenkins-Referenz und Pre-Integrations-Terraform bleiben waehrend der Uebergangsphase an ihren bestehenden Pfaden, bis die Software Factory ihre Zielpfade bestaetigt. Sie werden nicht dupliziert.

## Sicherheits- und Betriebsanforderungen

- API prueft signierte Tokens selbst gegen den freigegebenen OIDC-Vertrag; etwaige Legacy-Identity-Header werden entfernt oder ignoriert.
- API, Datenbank und Storage sind nicht direkt aus dem oeffentlichen Internet erreichbar, sofern kein ausdruecklich freigegebener Plattformvertrag anderes vorsieht.
- Laufzeitidentitaeten erhalten Least Privilege; Migration, Deployment und Laufzeit sind getrennt.
- Secrets werden zentral gespeichert, rotiert und nie in Frontend, Repository, Logs oder Tickets kopiert.
- Container laufen ohne Privilege Escalation und mit angemessenen Ressourcen-/Probe-Einstellungen.
- Zielartefakte werden revisionsfest referenziert; `latest` ist kein Releasebeleg.
- Logs vermeiden sensible Inhalte und folgen einer beschlossenen Aufbewahrung.
- Backup und Restore werden praktisch getestet, nicht nur konfiguriert.
- Security-, Datenschutz- und Abhaengigkeitsupdates besitzen Owner und Verfahren.

## Servicewerte: vor Go-live zu beschliessen

| Wert | Status | Voraussetzung |
| --- | --- | --- |
| Servicezeit | offen | fachlicher Bedarf und Supportmodell |
| Verfuegbarkeits-SLO | offen | Messpunkt und Plattformleistung |
| RTO | offen | Wiederanlauf- und Restore-Test |
| RPO | offen | Datenverlusttoleranz und Backup/PITR |
| Wartungsfenster | offen | Change- und Nutzerkommunikation |
| Alarmreaktion | offen | Service Desk und On-call |

Die Pre-Integration begruendet keine Produktivzusage.

## Definition of Ready

- [ ] Zielplattform, URL, Gateway/SSO, DB, Storage und Software Factory sind entschieden.
- [ ] RACI besitzt benannte Verantwortliche.
- [ ] Datenklasse, Pilotumfang und Governance-Freigaben sind dokumentiert.
- [ ] Target-Build und API-Image sind reproduzierbar, revisionsfest und geprueft.
- [ ] Gateway-, Rollen-, DB- und Storage-Vertrag sind integriert getestet.
- [ ] Migrationsgeneralprobe und Restore-Probe sind erfolgreich.
- [ ] Monitoring, Logs, Alerts, Service Desk und Runbooks sind abnahmebereit.
- [ ] SLO, RTO, RPO, Wartungsfenster und Rollbackkriterien sind beschlossen.

## Definition of Done

- [ ] Releasepaar und Migrationsversion sind eindeutig nachgewiesen.
- [ ] technische, fachliche, Security- und Datenschutzabnahmen liegen gemaess Einstufung vor.
- [ ] Kernpfade und negative Auth-/Authz-Tests sind erfolgreich.
- [ ] Datenmigration und Reconciliation sind unterschrieben.
- [ ] Backup, Restore, Monitoring, Alerting und Rollback sind praktisch nachgewiesen.
- [ ] RACI, Service Desk, Eskalation und Hypercare sind aktiv.
- [ ] Legacy-Endzustand ist entschieden und umgesetzt.

Das ausfuellbare [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) ist Teil des Nachweispakets.

## Offene Plattformfragen

Die Entscheidungen werden mit IDs D-01 bis D-16 in [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md) gefuehrt. Besonders kritisch sind:

- Ziel-URL, same-origin Routing und Gateway-/SSO-Header,
- institutionelle Owner fuer Profile, Rollen und Break-glass,
- Shared-Postgres- und Storage-Vertraege,
- Software-Factory-, Artefakt- und Freigabeverfahren,
- Datenklassifikation und Pilotumfang,
- SLO, RTO, RPO, Monitoring, Backup/Restore und Incident-Prozess.

## Nicht-Ziele

- GitHub Pages als Staging oder Zielbetrieb,
- Uebernahme persoenlicher GCP-Projekt-, Domain-, OAuth- oder Break-glass-Werte,
- Cloud Run als Zielplattform,
- IAP als zwingende Zielvorgabe,
- automatische Anlage von Plattformressourcen durch den API-Pod,
- direkte Browserzugriffe auf Shared Postgres, Supabase oder private Storage-Dienste.
