# Deployment-Checkliste

Status: verbindliche Repo-Checkliste; Zielplattformwerte und Freigaberollen zu bestaetigen

Stand: 18. Juli 2026

## Zuerst den Kanal bestimmen

- [ ] **Pages Demo:** `dist/pages/`, ausschliesslich synthetisch und niemals als GKE-Staging oder Realanwendung bezeichnen.
- [ ] **`pre-gematik`:** `dist/target/`, temporaere GCP-Pre-Integration, ausschliesslich synthetische/anonymisierte Daten.
- [ ] **Zielbetrieb:** `dist/target/` plus API-Image-Digest, Software Factory und bestaetigte Betriebsfreigabe.
- [ ] Es gibt keine versionierte Pages-Publish-Kopie; `dist/pages/` wird als GitHub-Actions-Artefakt direkt veroeffentlicht.

## Allgemein vor jedem Release

- [ ] `git status --short` pruefen; keine fremden/unbeabsichtigten Dateien einbeziehen.
- [ ] eindeutige Git-Revision und Release-ID festlegen.
- [ ] Aenderungsumfang, Risiko, Datenbankkompatibilitaet und betroffene Umgebungen dokumentieren.
- [ ] keine echten Secrets, produktiven Backups oder produktiven Seed-/Kontaktdaten im Repository.
- [ ] Lockfile und Abhaengigkeiten sind nachvollziehbar.
- [ ] relevante Repository-, API-, Contract- und Browserchecks sind gruen.
- [ ] Dependency-, SAST-, Secret- und Image-Scan sind gruen oder Abweichungen freigegeben.
- [ ] SBOM/Provenance beziehungsweise gleichwertiger Herkunftsnachweis ist dem Zielverfahren entsprechend vorhanden.
- [ ] vorheriges kompatibles Release und Rollbackweg sind bekannt.
- [ ] erforderliche Freigaben gemaess bestaetigter RACI liegen vor.

## Pages Demo

### Build

- [ ] Pages-Build schreibt ausschliesslich nach `dist/pages/`.
- [ ] `dist/target/` wird nicht gelesen oder veraendert.
- [ ] GitHub Pages verwendet als Source `GitHub Actions` und laedt nur `dist/pages/` hoch.
- [ ] keine Service-Role-Keys, Passwoerter, privaten Tokens oder Backups im Artefakt.
- [ ] keine echten Kontakte, E-Mail-Adressen, Telefonnummern oder Gesundheitsdaten in Seed-/Fallback-Dateien.
- [ ] Public-Asset-Audit ist gruen.

### Demo

- [ ] ausschliesslich fiktive Daten.
- [ ] Startseite, Navigation, Karte und repraesentative Kernansicht funktionieren.
- [ ] Demo wird klar als Demo bezeichnet.

### Nach Pages-Deployment

- [ ] veroeffentlichte Revision stimmt mit dem freigegebenen Pages-Release ueberein.
- [ ] das Pages-Artefakt enthaelt keine Target-Konfiguration.
- [ ] Demo-Rauchtest ist dokumentiert.
- [ ] Pages-Deployment hat Pre-/Zielumgebung nicht veraendert.

## `pre-gematik`

Fuehrendes Runbook: [Deployment GCP Autopilot](DEPLOYMENT_GCP_AUTOPILOT.md).

### Grenzen

- [ ] ausschliesslich synthetische oder belastbar anonymisierte Daten.
- [ ] GCP-Projekt, Domain, IAP, Cloud SQL und persoenliche Break-glass-/OAuth-Werte sind als temporaer dokumentiert.
- [ ] kein Wert wird ohne institutionelle Entscheidung als Zielbetriebsstandard uebernommen.
- [ ] Environment `pre-gematik` und Required Reviewer sind aktiv.

### Artefakte

- [ ] Target-Build schreibt ausschliesslich nach `dist/target/`.
- [ ] `dist/pages/` wird nicht gelesen oder veraendert.
- [ ] Pre-GKE-Target-Konfiguration enthaelt `dataMode: "api"`, `authMode: "iap"` und `requireApiGateway: true`.
- [ ] Target-Audit findet keine Supabase-URL, keinen Supabase-Key, kein Supabase Browser SDK und keinen direkten Supabase-Aufruf.
- [ ] API-Image ist unveraenderlich identifiziert; Digest und Git-Revision sind dokumentiert.
- [ ] Frontend wird unter einem versionierten `releasePrefix` abgelegt; `contentRevision` koppelt den Frontend-Rollout an den Releaseinhalt.
- [ ] API und Frontend besitzen dieselbe Release-ID.

### Infrastruktur und Sicherheit

- [ ] WIF statt Service-Account-JSON-Key.
- [ ] GKE Secret Sync/Secret Manager ohne Secret-Ausgabe in Logs.
- [ ] Frontend-Workload kann nur das benoetigte Releasepraefix lesen.
- [ ] API-Workload besitzt nur erforderliche DB-/Storage-/Secret-Rechte.
- [ ] IAP ist fuer Frontend und API aktiv; reale Audience wurde fail-closed gebunden.
- [ ] gefaelschte, unsignierte Identity-Header werden abgewiesen.
- [ ] unauthentifizierter externer Request erhaelt keinen oeffentlichen `200`.
- [ ] DB-Runtime-Rolle besitzt keine DDL-Rechte.

### Funktion

- [ ] Rollout, `/api/healthz`, DB-Smoke und Pre-Integrationsschema-Check sind gruen.
- [ ] aktives Profil liefert erwartete Rolle; unbekanntes Profil erhaelt `403`.
- [ ] Lesen/Anlegen/Aendern/Ruecksetzen eines synthetischen Kontakts funktionieren.
- [ ] private Profil-/Kontaktbilder und Notizanhaenge funktionieren.
- [ ] Frontendnetzwerk zeigt ausschliesslich den erwarteten Target-Vertrag.
- [ ] Ergebnisse und offene Zielabweichungen sind dokumentiert.

## Zielbetrieb: Definition of Ready

- [ ] D-01 bis D-16 aus [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md) sind entschieden oder als freigegebene Ausnahme dokumentiert.
- [ ] RACI besitzt benannte `A`- und `R`-Rollen.
- [ ] Datenklasse, Pilotumfang, Retention und Loeschung sind freigegeben.
- [ ] Ziel-URL, Gateway/SSO, Header, Namespace, DB, Storage und Secrets sind integriert getestet.
- [ ] Software Factory baut reproduzierbar und ohne Pages-Artefakt-Abhaengigkeit.
- [x] `.github/CODEOWNERS` enthaelt mit `@TimoFrank` einen bestaetigten realen Uebergangs-Owner; institutionelle Teamhandles und eine unabhaengige Pflichtfreigabe werden vor Pilotbetrieb nachgetragen.
- [ ] Branch-/Environment-/Change-Schutz und Vier-Augen-Regel sind aktiv.
- [ ] Produktionspromotion fuer versionierte Frontend-Releases ist institutionell implementiert. Ein Manifest mit `promotionRequired: true` ist ein absichtlicher Staging-Nachweis und noch keine Produktivpromotion.
- [ ] Helm-Values-Vertrag wird gegen `values.schema.json` validiert.
- [ ] Schema-/Datenmigration und Restore wurden mit realistischem Umfang geprobt.
- [ ] SLO, RTO, RPO, Servicezeit, Wartungsfenster und Alarmreaktion sind beschlossen.
- [ ] Monitoring, Logs, Alerts, Service Desk und Incidentweg sind abnahmebereit.
- [ ] Cutover-/Rollbackkriterien und Kommunikationsplan sind freigegeben.

## Zielbetrieb: Releasepruefung

### Build und Lieferkette

- [ ] freigegebene Git-Revision auschecken; keine uncommitteten Aenderungen.
- [ ] `dist/target/` in sauberem Zielordner erzeugen.
- [ ] Target-Audit und alle benoetigten Tests/Scans gruen.
- [ ] API-Image einmal bauen, scannen und per `sha256`-Digest referenzieren.
- [ ] SBOM, Provenance/Attestierung und Scanergebnisse abgelegt.
- [ ] `dist/target/`-Manifest/Hash, API-Digest, Helm-Version und Migrationsversion tragen dieselbe Release-ID.
- [ ] Deployment verwendet `image.digest`; ein veraenderlicher Tag ist hoechstens Anzeige, nicht Releaseidentitaet.
- [ ] Promotion verwendet dieselben geprueften Artefakte und baut nicht neu.

### Konfiguration und Sicherheit

- [ ] `dataMode: "api"`, freigegebener Auth-Modus, freigegebene API-Basis, `requireApiGateway: true`.
- [ ] keine Supabase-URL, kein Supabase-Key, kein Supabase Browser SDK, kein direkter Supabase-/Storage-Aufruf.
- [ ] keine Secrets oder sensiblen Daten im Frontend, Manifest, Image, Values oder Log.
- [ ] Zielkonfiguration enthaelt `authMode: "oidc"`; API prueft Signatur, Issuer, Audience und konfigurierte Claims.
- [ ] unauthentifizierte Tokens, ungueltige Signaturen, falscher Issuer/Audience, unbekannte und inaktive Identitaeten werden abgewiesen.
- [ ] `trusted-header`/`sso` ist in Produktion deaktiviert oder besitzt eine dokumentierte Plattform-/Security-Ausnahme mit nicht umgehbarer Vertrauensgrenze.
- [ ] Runtime-, Deployment- und Migrationsrechte sind getrennt.
- [ ] Network-, Pod-, Secret- und Storage-Policies entsprechen dem freigegebenen Vertrag.

### Plattform und Daten

- [ ] Namespace, Quoten, Registry, Hosting, DNS/TLS und Routing sind bereit.
- [ ] Shared Postgres ist erreichbar; Schema-Version und Runtime-Rechte sind korrekt.
- [ ] Object Storage und Dateizugriff funktionieren.
- [ ] Backup/PITR und Vor-Deployment-Restorepunkt sind bestaetigt.
- [ ] Datenmigration/Reconciliation gemaess [Migrationsrunbook](MIGRATION_CUTOVER_ROLLBACK.md) ist vorbereitet beziehungsweise abgeschlossen.

### Rollout und fachliche Smoke Tests

- [ ] Kubernetes-Rollout und Probes sind gruen.
- [ ] `/api/healthz` und freigegebene Betriebschecks sind gruen.
- [ ] `/api/session` liefert nur mit verifizierter Identitaet ein aktives Profil.
- [ ] Kontakte, Organisationen, Profile, Karte, Formate, Hospitationen, Stakeholder, Saved Views und Dateien laden ueber `/api`.
- [ ] Viewer, Editor und Admin besitzen genau erwartete Rechte.
- [ ] definierte Testaenderung, Historie und Ruecksetzung funktionieren.
- [ ] Karte, Auswertung und Datenqualitaet sind fachlich plausibel.
- [ ] Logs/Metriken/Alerts sind sichtbar; Testalarm erreicht den bestaetigten Empfaenger.

### Rollback-Bereitschaft

- [ ] vorheriger schema-kompatibler API-Digest und Frontend-Releaseprefix sind verfuegbar.
- [ ] atomare Frontend-Promotion/Rueckschaltung ist getestet.
- [ ] Helm-/API-Rollback ist getestet.
- [ ] Datenbankmigration ist rueckwaertskompatibel oder Restore/Forward-Fix ist freigegeben.
- [ ] nach Zielschreibzugriffen erfolgt keine Rueckschaltung ohne Datenentscheidung.

## Zielbetrieb: Definition of Done

- [ ] ausgefuelltes [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) mit Revision, Digests, Manifesten und Freigaben.
- [ ] technische, fachliche, Security- und Datenschutzabnahmen gemaess Einstufung liegen vor.
- [ ] Datenmigration und Reconciliation sind unterschrieben.
- [ ] Monitoring, Alerting, Logging, Backup und Restore sind aktiv und praktisch nachgewiesen.
- [ ] Service Desk, Eskalation und Hypercare sind gestartet.
- [ ] bekannte Abweichungen besitzen Risikoakzeptanz, Owner und Frist.
- [ ] Ziel-URL und Supportweg sind kommuniziert.
- [ ] Legacy ist gemaess Beschluss read-only, zur synthetischen Demo reduziert oder abgeschaltet.
- [ ] Betriebsuebernahme und Hypercare-Ende sind durch die Accountable-Rollen bestaetigt.

## Schnellurteil

Ein erfolgreicher Build, ein gruener Pod oder HTTP `200` allein ist kein erfolgreiches Zieldeployment. Das Deployment ist erst freigegeben, wenn das unveraenderliche Releasepaar, Sicherheitsgrenze, Datenkonsistenz, Betriebsnachweise, Rollback und die erforderlichen Verantwortlichen gemeinsam bestaetigt sind.
