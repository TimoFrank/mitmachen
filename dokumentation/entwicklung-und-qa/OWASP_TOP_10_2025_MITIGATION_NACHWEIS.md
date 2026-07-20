# OWASP Top 10:2025 – Mitigations- und Abnahmenachweis

Stand: 19.07.2026
Prüfmodus: defensiv; Repository-Pruefung plus bestaetigte, eng begrenzte Supabase-Live-Haertung
Arbeitsbranch: `codex/reorganize-repository`
Referenz: [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/)

## Freigabeaussage

**Repository-Readiness: grün.** Alle zehn OWASP-Kategorien wurden behandelt. Die bestätigten Anwendungs- und Repository-Befunde sind entweder technisch geschlossen, in Produktion fail-closed deaktiviert oder mit einer konkreten externen Abnahmebedingung versehen.

**Produktiv-/Go-live-Freigabe: noch gelb.** Die bestaetigte Supabase-Reconciliation wurde am 19.07.2026 live angewendet und ihre eng abgegrenzten DB-/Storage-Wirkungen wurden geprueft. GKE, Cloud SQL, Gateway und externe Identity wurden nicht deployed oder veraendert. Die weiterhin offenen Kaestchen sind Plattform- und Betriebsabnahmen und duerfen nicht allein auf Grundlage der Repository- oder Supabase-Pruefung abgehakt werden.

**Zwei-App-Grenze:** GitHub Pages bleibt als oeffentliche, ausschliesslich synthetische Produktdemo bestehen. Die geschuetzte Realanwendung ist ein getrenntes API-only-Artefakt mit OIDC beziehungsweise im GKE-Vorbereitungspfad IAP. Pages ist weder Datenquelle noch Fallback der Realanwendung.

Legende:

- `[x]` im Repository umgesetzt und lokal nachgewiesen
- `[~]` sichere Repository-Mitigation umgesetzt; Rollout oder Live-Abnahme steht aus
- `[ ]` ausschließlich extern beziehungsweise organisatorisch prüfbar; nicht durchgeführt

Der vorbereitende Arbeitsplan wurde unverändert unter [`archiv/OWASP_TOP_10_MITIGATION_BACKLOG_2026-07-17.md`](archiv/OWASP_TOP_10_MITIGATION_BACKLOG_2026-07-17.md) archiviert. Er enthält historische Pfade und ist keine aktuelle Betriebsanleitung. Dieses Dokument ist der zugehörige Umsetzungs- und Evidenznachweis.

## Umgebungen und Vertrauensgrenzen

| Pfad | Sicherheitsstatus nach dieser Arbeit | Aussagegrenze |
| --- | --- | --- |
| GitHub-Pages-Demo | Eigenes Pages-Artefakt mit ausschliesslich synthetischen Demo-Daten und anonymer Demo-Sitzung; keine Fach-API, keine Supabase-Konfiguration und kein produktiver Registrierungs-Intake. | Pages bleibt aktiv, ist aber nicht fuer schützenswerte oder reale Daten freigegeben und erbt keine Target-Header oder Target-Identitaet. |
| Supabase-Backend-Uebergang | Die Sicherheits-Reconciliation ist live angewendet. Direkte produktive Supabase-Nutzung aus dem Browser und ein Supabase-Laufzeitfallback sind im Target gesperrt. | Auth-User-/Sessioninventar und die negative End-to-End-Rollenmatrix bleiben offen. Der Security Advisor ist bis auf den planabhaengigen Leaked-Password-Schalter bereinigt. |
| GKE-Autopilot-Pre-Integration | Container, Helm, NetworkPolicies, Workload Identity, IAP-JWT-Prüfung, Cloud-SQL-Proxy und resiliente Rollouts sind als überprüfte Artefakte vorhanden. | Der reale Cluster-, Ingress-, IAP-, Cloud-SQL- und Policyzustand wurde nicht verändert und nicht live attestiert. IAP gehört nur zu diesem getrennten Pre-Integrationspfad. |
| gematik-Zielbetrieb | Die Anwendung besitzt eine providerneutrale OIDC-/JWT-Grenze, eine explizite Rollenmatrix, `(issuer, subject)`-Bindings und einen fail-closed Target-Preflight. | Die externe gematik-Identity selbst ist ausdrücklich nicht geprüft. Gateway, Netzwerk, Schlüsselrotation und reale Token werden gemeinsam mit der Plattform abgenommen. |

## Priorisierte, mitigierte Befunde

| ID | Priorität / Schwere | Umgebung | Bestätigtes Risiko | Status und technische Mitigation | Evidenz / sicherer Test | Noch erforderliche Abnahme |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | P0 / kritisch | Supabase-Übergang | Offene Registrierung und ein automatisch aktives Profil konnten den fachlichen Freigabeprozess umgehen. | `[~]` Die restriktiven Active-Profile-, Tabellen- und Storage-Regeln sind live reconciled; neue Profile bleiben im Sollzustand inaktive Viewer. | `supabase/config.toml:4-9`; `supabase/migrations/20260719154214_reconcile_security_and_protected_storage.sql`; Live-Pruefung von RLS, Grants, Funktionen und privaten Buckets. | Auth-Schalter und Nutzer-/Sessioninventar pruefen; negative REST-Tests und die sofortige Sperrwirkung vorhandener JWTs bestaetigen. |
| R02 | P0 / kritisch | Supabase-Übergang | Browser konnten eine zu weit freigegebene Notification-RPC missbrauchen. | `[x]` `EXECUTE` ist live fuer `PUBLIC`, `anon` und `authenticated` entzogen; unsichere Neuerzeugung bleibt deaktiviert. | `supabase/migrations/20260719154214_reconcile_security_and_protected_storage.sql`; Live-Grant- und Funktionspruefung. | Vor einer spaeteren Reaktivierung zusaetzlich Allowlist-, Empfaenger-, Mengen-, Rate- und Idempotenztests ausfuehren. |
| R03 | P0 / kritisch | API / Zielbetrieb | Unsigned Identity-Header oder uneindeutige E-Mail-Zuordnung konnten als Identität missverstanden werden. | `[x]` Produktion akzeptiert nur signierte IAP- oder OIDC-JWTs; Signatur, Algorithmus, Key-Typ, Issuer, Audience und Zeitclaims werden geprüft. Die Rolle folgt ausschließlich aus genau einem aktiven `(issuer, subject)`-Binding. Unsigned Header sind nur im expliziten Nichtproduktionsadapter möglich und fehlen vollständig in Helm. | `api/security-policy.mjs:58-110`; `api/server.mjs:2671-3004`; `.../postgres/pre-gematik/schema.sql:78-93`; `.../grants.sql:38`; `.../helm/.../templates/configmap.yaml:8-19`; Security-Contract-Negativtests. | Gateway muss eingehende Identity-/Authorization-Header entfernen, Token nach erfolgreicher Prüfung neu etablieren, direkte API-Netzpfade sperren und TLS, Issuer, Audience, JWKS sowie Rotation attestieren. |
| R04 | P0 / kritisch | API / Daten | Fehlende oder implizite Rollenentscheidungen ermöglichten Broken Access Control, insbesondere für Import, Export, globale Löschungen und Archivdaten. | `[x]` Jede Route ist in einer fail-closed Manifestmatrix `viewer`, `editor` oder `admin` zugeordnet; unbekannte Routen bleiben gesperrt. Admin-only: Export, Ops, Bulk-Import, globale Löschungen sowie archivierte/inaktive Abfragen. Ownership-sensitive Pfade prüfen zusätzlich den Datensatz. | `api/security-policy.mjs:7-51` und `:112-118`; `scripts/test_security_contracts.mjs:20-117`; API- und Browser-Rollentests. | In Staging negative Tests mit realen Viewer-/Editor-/Admin-Tokens, fremdem Eigentum, archivierten Entitäten und direktem API-Aufruf ausführen. |
| R05 | P0 / hoch | Browser | DOM-XSS, unsichere dynamische URLs und Wildcard-`postMessage` konnten Browsergrenzen aufweichen. | `[x]` Dynamische Inhalte werden escaped beziehungsweise über sichere URL-Parser begrenzt. Kartenkommunikation prüft exakten Origin, konkretes Fenster, Version, Kanal, Kontext, Schema, Mengen und Koordinaten; Antworten nutzen keinen Wildcard-Origin. Hilfs-Iframes sind gesandboxed. | `frontend/map/versorgungs-kompass-map.js:811-935`, `:1158-1169`, `:1307-1308`; `frontend/app/versorgungs-kompass.js:32470-32533`, `:35455-35477`; Semgrep 0 Befunde; Browser-Security-Contracts. | Optionales P2: Hauptkarten-Iframe auf eigenen Origin isolieren und zugehörige CSP/COEP-Kompatibilität abnehmen. |
| R06 | P0 / hoch | Auth-Frontend | Browserseitige Passwort-Hashes, Alias-, Supabase- oder LocalStorage-Fallbacks konnten Authentisierung beziehungsweise Datenverfuegbarkeit vortaeuschen. | `[x]` Passwort-/Hash-/Aliaslogik wurde entfernt. Das Target besitzt weder Browser-Supabase noch LocalStorage-Fachdaten oder eine LocalStorage-Ersatzsitzung. Zielartefakte akzeptieren nur `iap` oder `oidc`, nutzen fachlich ausschliesslich `/api/...` und brechen ohne verifizierte externe Session fail-closed ab. | `frontend/login/auth-guard.js`; `frontend/data/runtime-config.js`; `scripts/prepare_target_frontend_config.mjs`; `scripts/test_security_contracts.mjs`; Alias-Funktion liefert `410` in `supabase/functions/login-with-alias/index.ts:16`. | Alte produktive Alias-Funktion deaktivieren/deployen; mit negativen Target-Tests bestaetigen, dass `401`, `403`, fehlende Routen und API-Ausfaelle keine Demo-, Supabase- oder Browser-Speicherdaten aktivieren. Falls ein historischer Passwortwert ausserhalb des Repositories noch verwendet wird, diesen gezielt rotieren. |
| R07 | P0 / hoch | Datenbanktransport | Produktive Plain-Postgres-Verbindungen konnten ohne CA-/Hostprüfung betrieben werden. | `[x]` Direkte Produktionsverbindungen benötigen `verify-full`; `verify-ca` oder widersprüchliche TLS-Parameter führen zum Startabbruch. Ein lokaler Cloud-SQL-Proxy ist nur als dokumentierte mTLS-Ausnahme zulässig. Verbindungs-, Query- und Statement-Timeouts sind gesetzt. | `api/server.mjs:3153-3331`; `scripts/test_api_runtime_config.mjs:68-151`; Helm-Default `values.yaml:50-56`; GKE-Proxy `values-gcp-autopilot.yaml:91-97`. | Im Zielsystem CA/Hostname prüfen und `pg_stat_ssl`/Verbindungsparameter attestieren; beim Proxy private IP, Workload Identity und gesperrten Direktzugriff bestätigen. |
| R08 | P0 / hoch | Container | Nicht reproduzierbares oder privilegiertes Runtime-Image mit unnötiger Toolchain vergrößerte die Angriffsfläche. | `[x]` Digest-gepinnte Node-Basis, separates minimales API-Lockfile, `npm ci --omit=dev --ignore-scripts`, entfernte Paketmanager, Non-Root-Nutzer. Das Image startet bei fehlender Produktions-Auth-Konfiguration fail-closed. | `api/Dockerfile:1-26`; `api/package.json`; lokaler Build/Runtime-Test; Trivy: 0 HIGH, 0 CRITICAL. | Registry-Digest und Admission-Policy gegen das freigegebene Image attestieren; Root-/Write-/Capability-Negativtest im Zielcluster. |
| R09 | P0 / hoch | Kubernetes / GKE | Einzelreplikate, breite Netzpfade, Service-Account-Tokens und schwache Podrechte erschwerten sicheren Betrieb. | `[x]` Je zwei Replikate, PDB, sichere Rolling Updates, Startup/Readiness/Liveness, kein K8s-API-Token, Non-Root, Read-only Root-FS, `RuntimeDefault`-Seccomp, alle Capabilities entfernt, Ingress-/Egress-NetworkPolicies und exakte GFE-Quellbereiche im GKE-Overlay. | Helm `values.yaml:1`, `:14-18`, `:191-235`; `templates/deployment.yaml:8-108`; `templates/networkpolicy.yaml:1-110`; `templates/poddisruptionbudget.yaml:1-23`; Helm lint/template erfolgreich. | Reale GKE-Admission, Dataplane-V2-Policywirkung, GFE-Range, Metadata-Egress, Direct-Service-Sperre, Zonenverteilung und PDB-Verhalten im Cluster prüfen. |
| R10 | P0 / hoch | Fachmutationen / Audit | Mehrschrittige Mutationen und Audit konnten auseinanderlaufen oder Client-Actor-Felder übernehmen. | `[x]` Kernpfade für Kontakte, Formate, Beteiligungen, Hospitationen und Beobachtungen laufen transaktional; Activity-Events werden im selben Commit append-only geschrieben. Optimistic Concurrency verhindert Lost Updates. Supabase erzwingt Kontakt-/Beobachtungsactor und entzieht direkte `changes`-Inserts. | `api/server.mjs`; `supabase/migrations/20260719154214_reconcile_security_and_protected_storage.sql`; Postgres-Vertragstests und Live-Funktions-/Grant-Pruefung. | P2: transaktionale Outbox fuer nichtkritische Benachrichtigungen ergaenzen, falls garantierte Zustellung fachlich erforderlich wird. |
| R11 | P0 / hoch | Uploads | Beliebige Dokumente/Bilder hätten aktive Inhalte, Parserrisiken oder Metadaten einschleusen können. | `[x]` Produktionsuploads sind fail-closed deaktiviert. Der lokale Entwicklungsadapter erlaubt nur kanonisches Base64, TXT, maximal 1 MiB, valides UTF-8 und keine Nullbytes. Bildpfade validieren Signatur, Typ, Größe und Dimensionen, bleiben produktiv aber deaktiviert. | `api/server.mjs:490-501`, `:4193-4218`, `:4254-4293`, `:4700-4724`; Helm `values.yaml:46-47`; Security-Contracts. | Vor Aktivierung: Quarantäne, Malware-Scan, Re-Encoding, Metadatenentfernung, sichere Objekt-Namen, Content-Disposition, Retention und Fehlpfadtests abnehmen. |
| R12 | P0 / hoch | Resilienz / Fehler | Unbegrenzte Bodies, fehlende Timeouts, teilweise Mutationen oder unerwartete Exceptions konnten Ressourcen verbrauchen beziehungsweise fail-open wirken. | `[~]` Body-/Uploadgrenzen, DB-/HTTP-/Outbound-Timeouts, In-Memory-Rate-Limit, `429/Retry-After`, Readiness mit DB und Identity-Schema, Graceful Shutdown sowie strukturierte Fatal-Logs sind umgesetzt. | `api/server.mjs:516-519`, `:2684-2775`, `:3095-3108`, `:7159-7178`, `:7221-7225`, `:7534-7591`; PDB/Probes wie R09. | Verteilte Limits am Gateway/Load Balancer, Last-/Abbruchtests, Alerting und SLOs im Zielsystem abnehmen. Der In-Memory-Limiter allein ist kein Clusterlimit. |
| R13 | P1 / hoch | Browser-Auslieferung | Inline-Skripte, externe Browser-CDNs und fehlende harte Response-Header erschwerten CSP und Supply-Chain-Kontrolle. | `[~]` Inline-Skripte/-Stylesheets/-Handler wurden extrahiert, Browserpakete sind lockfile-gepinnt, lokal vendort und SHA-256-inventarisiert. Nginx erzwingt CSP, HSTS, `nosniff`, Referrer-, Permissions-, COOP/CORP- und differenzierte Frame-Header; sensitive Konfiguration ist `no-store`. Das separate Pages-Artefakt bleibt auf synthetische Daten begrenzt. | `frontend/vendor/THIRD_PARTY_ASSETS.json:1-59`; `scripts/test_security_contracts.mjs:243-249`, `:304-312`; `deploy/helm/versorgungs-kompass/files/frontend-default.conf:1-45`; realer lokaler Header-Test für Login, Konfiguration und alle drei Kartenframes. | Target-Header im realen Ingress messen. GitHub Pages ersetzt diese Target-Kontrollen nicht, bleibt aber als rein synthetische Demo bestehen. |
| R14 | P1 / hoch | Supply Chain / CI | Bewegliche Actions, Scanner, Images und unvollständige Historien-/Dependency-Prüfungen konnten manipulierte Artefakte durchlassen. | `[x]` Actions und Scanner sind commit-/digest-gepinnt; Lockfiles sind exakt. CI prüft `npm audit`, Registry-Signaturen, lokale Semgrep-Regeln, vollständige Git-Historie mit Gitleaks, Browserregressionen und das API-Image mit Trivy. Deployment erfolgt über unveränderlichen Digest mit Provenance/SBOM. | `.github/workflows/repo-check.yml:14-82`; `.github/workflows/deploy-pre-gematik.yml`; `deploy/jenkins/Jenkinsfile.gematik`; `api/Dockerfile:1`; lokale Audit-/SAST-/Secret-/Image-Scans grün. | Branch Protection, Environment-Approvals, Runnerhärtung, Artifact Registry, Signatur/Attestation und Binary Authorization in der realen Organisation bestätigen. |
| R15 | P1 / hoch | Security Headers / Origin | Fehlende Originbindung und uneinheitliche Frame-Header konnten CSRF-/Clickjacking- und Fehlkonfigurationsrisiken erzeugen. | `[x]` Produktion startet ohne exakten HTTPS-`ALLOWED_ORIGIN` nicht mehr. Browser-Origin wird vor Dispatch exakt verglichen. Default ist `frame-ancestors 'none'`/`DENY`; nur drei konkrete Kartenartefakte erhalten `'self'`/`SAMEORIGIN`. Frontend und API müssen im Target same-origin sein. | `api/security-policy.mjs:94-110`; `api/server.mjs:486`, `:7147-7156`; `scripts/preflight_target_deployment.mjs:128-131`; Nginx `files/frontend-default.conf:6-35`; Security-Contract-Negativtests. | Reale Browser- und Ingress-Tests für Origin, Preflight, Clickjacking, Redirects, HSTS und Cache-Verhalten durchführen. |
| R16 | P1 / mittel | Logging / Monitoring | Fehler- und Zugriffsereignisse waren nicht einheitlich korrelierbar; Alerts fehlten. | `[~]` Request-ID, strukturierte JSON-Logs, stabile Route-ID, Rolle, Status, Laufzeit sowie explizite AuthN-/AuthZ-Denied-Events sind vorhanden; Tokens, Body und PII werden nicht geloggt. Fehlerantworten sind generisch. | `api/server.mjs:7142-7197`, `:7510-7591`; Security-Contracts und lokale Fehlerpfade. | Log-Sink, Manipulationsschutz, Aufbewahrung, Zugriff, Zeitquelle, Dashboards und Alerts für 401/403/429/5xx/Fatal/Readiness im Zielbetrieb konfigurieren und auslösen. |
| R17 | P1 / mittel | Cloud SQL / Betrieb | Backups, Restore, Hochverfügbarkeit und Cutover waren nicht ausreichend als Sollzustand verankert. | `[~]` Terraform beschreibt private, regional verfügbare Cloud SQL, Löschschutz, PITR und 14 aufbewahrte Backups. Helm besitzt PDB, zwei Replikate und atomare Rollouts; Cutover-/Rollback-Dokumente sind vorhanden. | `deploy/terraform/gcp-autopilot/sql.tf:6-32`; Helm `deploy/helm/versorgungs-kompass/values.yaml`; `MIGRATION_CUTOVER_ROLLBACK.md`; Terraform fmt/validate lokal erfolgreich. | Backup tatsächlich erzeugen, verschlüsselte Ablage und Restore-Probe dokumentieren; Staging, Canary, Rollback und RTO/RPO unter Plattformverantwortung testen. |
| R18 | P2 / mittel | Repository / Datenschutz | Reale Alias-/E-Mail-Beispiele und historische Secret- oder Fachdatenmuster erhoehten Offenlegung und Fehlbedienung. | `[~]` Aliasfunktion ist deaktiviert; Kontakt-, Expertenkreis- und Stakeholderdaten sind geschuetzt uebernommen und aus dem neuen Quellstand entfernt; Public-Asset-Audit und Current-Tree-Scan sind gruen. | `DATENSCHUTZ_BEREINIGUNGSNACHWEIS.md`; `config/security/gitleaks.toml`; `scripts/audit_public_assets.mjs`; geschuetzter Vollstaendigkeitsabgleich 110/110. | Remote-Historie, alte Refs, Releases, Actions-Artefakte/Caches und Pages-CDN nach dem Runbook bereinigen; externe Passwortwiederverwendung bei Unsicherheit ausschliessen oder rotieren. |

## Abdeckung der OWASP Top 10:2025

| Kategorie | Prüfergebnis | Wesentliche Kontrollen | Restrisiko / Abnahme |
| --- | --- | --- | --- |
| **A01 Broken Access Control** | `[x]` R03, R04, R09 | Fail-closed Route-Manifest, serverseitige Rollenmatrix, Ownership-/Archivschutz, aktive Profile, Identity-Bindings, NetworkPolicies. | Reale Token-/Rollenmatrix und direkte Netzpfade in Staging negativ testen. |
| **A02 Security Misconfiguration** | `[~]` R01, R02, R09, R13, R15 | Signup/Uploads aus, gehärtete Helm-Schemas/Pods, exakter Origin, CSP/Headers, Readiness. | Live Supabase-, Ingress-, Cluster- und Headerzustand attestieren. |
| **A03 Software Supply Chain Failures** | `[x]` R08, R13, R14 | Exakte Lockfiles, vendorte Browserassets, gepinnte Actions/Scanner/Basisimages, Semgrep, Gitleaks, Trivy, SBOM/Provenance. | Organisationsweite Branch-/Runner-/Registry-/Admission-Policies abnehmen. |
| **A04 Cryptographic Failures** | `[x]` R03, R07, R14 | JWT-Signatur und Claims, HTTPS-JWKS, stabiler Subject-Key, `verify-full` oder mTLS-Proxy, TLS-only Ingress, digests. | Zertifikate, Schlüsselrotation, reale Token und `pg_stat_ssl` extern prüfen. |
| **A05 Injection** | `[x]` R05, R10, R11 | Parametrisierte SQL-Werte, Identifier-/Feld-Allowlisten, leere-`WHERE`-Guards, HTML-/URL-Encoding, validierte Bodies/Uploads, Semgrep-Regeln. | Staging-Negativtests mit ungefährlichen Grenzwerten und Parserfehlern; keine Live-Exploit-Payloads. |
| **A06 Insecure Design** | `[~]` R02, R03, R04, R10-R12, R17 | Explizite Trust Boundaries, least privilege, transaktionale Domainpfade, fail-closed Features, PDB/Timeouts/Restoreplan. | Threat Model mit gematik-Plattform, Outbox-Entscheidung und reale Resilienztests. |
| **A07 Authentication Failures** | `[x]` R01, R03, R06 | Keine Browserpasswörter/-hashes, keine Alias-Anmeldung, signed-token-only, aktive Bindung, Produktion ohne Dev-Bypass. | Externe Identity nicht geprüft; Gateway-, Session-, Logout- und Deprovisionierungsabnahme bleibt offen. |
| **A08 Software or Data Integrity Failures** | `[x]` R08, R10, R13, R14 | Appendaudit, atomare Mutationen, immutable Images/Frontend-Releases, Vendor-Hashes, Lockfile-Integrität, Provenance/SBOM. | Signatur-/Attestation-Enforcement und produktive Supabase-Migration extern prüfen. |
| **A09 Security Logging & Alerting Failures** | `[~]` R16 | Strukturierte korrelierbare Events ohne Token/Body/PII; Fatal-/Auth-/Rate-/Readiness-Signale. | Zentrales Alerting und Retention sind Plattformaufgaben und noch nicht nachgewiesen. |
| **A10 Mishandling of Exceptional Conditions** | `[~]` R10-R12, R17 | Generische Fehler, Größen-/Zeitlimits, Transaktionsrollback, Graceful Shutdown, Readiness, PDB, sichere Feature-Deaktivierung. | Chaos-/Abbruch-/Last-/Restore-/Canary-Abnahmen im Zielsystem stehen aus. |

## Rollen- und Berechtigungsmatrix

| Fähigkeit | Anonym | Inaktiv / kein Binding | Viewer | Editor | Admin |
| --- | --- | --- | --- | --- | --- |
| Health/Readiness | Health ja; Readiness ohne Daten | Health ja | ja | ja | ja |
| Aktive Fachdaten lesen | nein | nein | ja | ja | ja |
| Eigene Einstellungen, Saved Views, Notification-Acks | nein | nein | eigene | eigene | eigene und administrativ gemäß Route |
| Fachobjekte anlegen/ändern | nein | nein | nein | ja | ja |
| Fremde ownership-sensitive Notizen/Anhänge ändern | nein | nein | nein | nein | ja, sofern Route/Domainregel erlaubt |
| Bulk-Import, Export, Ops | nein | nein | nein | nein | ja |
| Globale Löschungen, Archiv-/Inaktivdaten | nein | nein | nein | nein | ja |
| Direkte Activity-/Audit-Inserts | nein | nein | nein | nein | nein; nur interner Domainpfad |

Technischer Anker: `api/security-policy.mjs:9-51`. Das SQL-Runtimekonto darf `identity_bindings` nur lesen: `deploy/postgres/pre-gematik/grants.sql:38`.

## Was GKE Autopilot bereits mitigiert – und was nicht

GKE Autopilot reduziert einen relevanten Teil der Infrastruktur- und Betriebsrisiken: Google verwaltet die Nodes, erzwingt zusätzliche Workload-Restriktionen, nutzt Workload Identity und stellt mit Dataplane V2 die technische Basis für NetworkPolicies bereit. Im Repository kommen private Nodes, DNS-Control-Plane, kein Service-Account-Token, gehärtete SecurityContexts, PDB, Probes und restriktive Netzregeln hinzu (`deploy/terraform/gcp-autopilot/gke.tf:5-41`, Helm-Nachweise R09). Siehe [Autopilot Security](https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-security), [Dataplane V2](https://cloud.google.com/kubernetes-engine/docs/concepts/dataplane-v2) und [Workload Identity Federation for GKE](https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity).

Autopilot ersetzt jedoch **nicht**:

- JWT-/Tokenprüfung, `identity_bindings`, Rollen- und Objektberechtigungen;
- Eingabevalidierung, SQL-Parametrisierung, HTML-/URL-Encoding und `postMessage`-Prüfung;
- CSP, Security Headers, Uploadquarantäne und Browser-Originbindung;
- fachliche Transaktionen, append-only Audit und sichere Fehlerbehandlung;
- Alertregeln, Backup-Restore, Gateway-Rate-Limits oder den kontrollierten Cutover.

Diese Anwendungsrisiken wurden deshalb unabhängig von Autopilot mitigiert beziehungsweise als externe Gates ausgewiesen.

## Backlog-Abgleich M00–M32

| Paket | Status | Nachvollziehbarer Abschluss |
| --- | --- | --- |
| M00 Freeze/Backup/Wiederanlauf | `[~]` | Eigener Branch vorhanden; Freeze, Backup, Nutzerexport und Restore sind externe Betriebsaktionen. |
| M01 Signup schließen | `[~]` | Sollkonfiguration geschlossen; Live-Schalter/Stagingtest offen. |
| M02 Notification-RPC sperren | `[x]` | Rechteentzug live reconciled und geprueft. |
| M03 Active-Profile-Gate | `[~]` | Restriktive RLS live reconciled; negative End-to-End-Rollenmatrix bleibt offen. |
| M04 Nutzer/Profile/Sessions prüfen | `[ ]` | Benötigt produktive Auth-/Auditdaten und Plattformverantwortung. |
| M05 Sichere Provisionierung | `[~]` | Inaktiver Viewer ohne Metadatenvertrauen implementiert; Staging-/Live-Abnahme offen. |
| M06 Notifications neu autorisieren | `[x]` | Sicherer Releasezustand durch vollständige Deaktivierung; Reaktivierung hat ein eigenes Abnahmegate. |
| M07 Saved-View-Eskalation | `[~]` | Owner/Scope serverseitig und live reconciled; Rollenabnahme bleibt offen. |
| M08 Kontakt-Audit atomar | `[x]` | Ziel-API transaktional; Supabase-Trigger und Funktionsrechte live reconciled. |
| M09 Hospitations-Actor | `[x]` | Server-/DB-Actor und Triggerrechte live reconciled. |
| M10 Alias-Login | `[~]` | Funktion fail-closed `410`, Aliase deaktiviert; Deployment/Altbestand offen. |
| M11 RLS-/Grant-/Advisor-Gate | `[~]` | RLS, Grants, Funktionen und private Storage-Grenzen live geprueft; ein planabhaengiger Leaked-Password-Advisor sowie die End-to-End-Rollenmatrix bleiben offen. |
| M12 reproduzierbares Pages-Artefakt | `[x]` | Der Actions-Build erzeugt `dist/pages/` direkt aus den führenden Quellen; Buildmanifest, Public-Audit und Deploymenttrennung sind in CI geprüft. |
| M13 DOM-XSS | `[x]` | Sinks/URLs gehärtet; SAST- und Browsercontracts grün. |
| M14 `postMessage` | `[x]` | Geschlossenes, versioniertes Same-Origin-/Source-Protokoll. |
| M15 Browser-Auth-/Datenfallback | `[x]` | Passwort-/Hash-/Alias-Fallback, Browser-Supabase und LocalStorage-Fachdaten im Target entfernt; API-/Sessionfehler bleiben fail-closed. |
| M16 Iframes/Karten-Origin | `[~]` | Hilfsframes gesandboxed; Hauptkarte bleibt bewusst same-origin als P2-Restrisiko. |
| M17 Browser-Supply-Chain | `[x]` | Exakt gepinnt, lokal vendort und gehasht. |
| M18 CSP-fähige Auslieferung | `[x]` | Keine Inline-Skripte/-Stylesheets/-Handler; dynamische Style-Attribute bedingen noch P2-`unsafe-inline`. |
| M19 Security Headers | `[~]` | Target-Nginx umgesetzt und lokal getestet; Live-Ingress offen. Pages bleibt eine getrennte synthetische Demo und ist kein Ersatz fuer Target-Header. |
| M20 Browser-Regressionsgate | `[x]` | 171 bestanden, 15 bewusst übersprungen, 0 fehlgeschlagen. |
| M21 API-Authentisierung | `[x]` | Signed-token-only, vollständige Claim-/Signaturprüfung, exakte Bindung; Gatewayabnahme separat offen. |
| M22 API-RBAC/Archiv | `[x]` | Zentrales fail-closed Manifest plus Objektregeln. |
| M23 Datenbank-TLS | `[x]` | `verify-full` oder lokaler mTLS-Proxy erzwungen; Live-Transportnachweis offen. |
| M24 Container | `[x]` | Reproduzierbar, minimal, Non-Root, paketmanagerfrei, Trivy grün. |
| M25 CI/CD | `[x]` | Gepinnte Actions/Scanner, minimale Rechte, Audit/SAST/Secrets/Image-Gates, Digest/Provenance/SBOM. |
| M26 Observability | `[~]` | Strukturierte Signale vorhanden; Sink, Retention und Alerts extern. |
| M27 Transaktionen/Audit | `[x]` | Kernmutationen und Activity-Events atomar; Notification-Outbox bleibt P2. |
| M28 Timeouts/Budgets/Rate Limits | `[~]` | Prozess-/DB-/HTTP-Limits lokal; verteiltes Gatewaylimit extern. |
| M29 Uploads | `[x]` | Produktion fail-closed deaktiviert; sichere Reaktivierung erfordert externe Scan-/Quarantänestrecke. |
| M30 Target-Gate/Cutover | `[~]` | Preflight, getrennte Artefakte, atomare Helm-Rollouts und Runbooks vorhanden; reale Staging-/Canary-Abnahme offen. |
| M31 Offenlegung/Dokumentation | `[x]` | Reale Alias-/E-Mail-Inhalte bereinigt; Public- und History-Secret-Audits grün. |
| M32 Gesamtnachweis | `[x]` | Dieses Dokument deckt alle Kategorien, Mitigationen, Tests und Restrisiken ab. |

## Positive Kontrollen

- `[x]` SQL-Werte werden parametrisiert; Tabellen/Felder/Sortierung laufen über Allowlisten, leere Mutation-Filter werden abgewiesen.
- `[x]` Unbekannte API-Routen und Methoden sind nicht implizit erlaubt.
- `[x]` E-Mail ist kein Autorisierungsschlüssel; stabiler signierter Subject-Identifier plus Issuer ist erforderlich.
- `[x]` Browser dürfen Gateway-Identity-Header nicht über CORS liefern; Helm konfiguriert sie nicht.
- `[x]` Private Profil-/Kontaktbilder laufen durch API-Autorisierung und erhalten `nosniff`/private Cachekontrolle.
- `[x]` Direct-Activity-Writer ist serverintern; Audit-Actors werden aus der verifizierten Identität abgeleitet.
- `[x]` Lockfiles und Browser-Vendor-Dateien besitzen Integritätsnachweise.
- `[x]` Target-Frontend und API sind same-origin; GitHub Pages und Target besitzen getrennte Artefakte und Deployments.
- `[x]` Das Pages-Artefakt enthaelt ausschliesslich synthetische Demo-Daten; es besitzt keine Fach-API-, Supabase- oder Target-Identity-Konfiguration.
- `[x]` Das Target greift fachlich nur ueber `/api/...` zu und besitzt keinen Browser-Supabase- oder LocalStorage-Datenfallback.
- `[x]` Die #Mitmachen-Konzeptdemo ist technisch inert und baut keinen Request an `POST /api/network-registrations` auf; ein späterer Handler bleibt bis zur separaten Freigabe deaktiviert.
- `[x]` Pods sind Non-Root, ohne Privilege Escalation, ohne Capabilities und ohne Kubernetes-API-Token.
- `[x]` Readiness prüft nicht nur den Prozess, sondern Datenbank und Identity-Bindungsschema.
- `[x]` Sicherheitskritische Features bleiben bei fehlender Plattformstrecke deaktiviert, statt unsicher zurückzufallen.

## Verbindliche externe Abnahmeliste

Diese Punkte sind **keine offenen Codebefunde**, aber Release-Gates für reale Umgebungen:

- [ ] **Backup/Restore:** geschütztes Backup, Restore-Probe, RTO/RPO, zwei erreichbare Admin-/Break-glass-Konten dokumentieren.
- [ ] **Supabase Auth:** Signup/Anonymous tatsächlich aus; genehmigte Nutzer gegen Auth-User/Profile abgleichen; unbekannte Sessions widerrufen.
- [~] **Supabase DB/RLS:** Reconciliation live angewendet; Policies, Grants, Functions und Storage inventarisiert; Rollenmatrix noch negativ End-to-End testen und planabhaengigen Leaked-Password-Schalter bewerten.
- [ ] **Identity-Gateway:** direkte API unerreichbar; Header-Stripping vor Auth; nur gatewaygenerierte Authorization-/Identity-Kontexte; TLS auf jedem Hop.
- [ ] **Tokenvertrag:** exakte Issuer/Audience/JWKS/Algorithmen, `sub`-Stabilität, Zeitclaims, Key-Rotation, Revocation/Deprovisionierung und Fehlerfälle mit synthetischen Konten abnehmen.
- [ ] **Identity-Bindings:** Vier-Augen-Provisionierung; neue Bindung zuerst inaktiv, Identität prüfen, dann aktivieren; Eindeutigkeit und sofortige Deaktivierung bestätigen.
- [ ] **Cloud SQL:** private Erreichbarkeit, least-privilege Runtimekonto, Secretzugriff, `verify-full` beziehungsweise mTLS-Proxy und verschlüsselter aktiver Transport attestieren.
- [ ] **GKE:** Admission-Ergebnis, NetworkPolicy/Dataplane V2, Workload Identity, kein Service-Account-Token, Pod Security, PDB und Zonenverteilung live prüfen.
- [ ] **Ingress/Browser:** TLS-Zertifikat, HTTP→HTTPS, HSTS, CSP, Frame-, Cache-, Referrer-, Permissions-, COOP/CORP-Header und same-origin API im echten Browser messen.
- [ ] **Rate/Resilienz:** verteilte Gateway-/Load-Balancer-Limits, maximale Requestgröße, Slow-Client-, Timeout-, Pod-Abbruch- und Überlastverhalten testen.
- [ ] **Logging/Alerting:** zentraler Sink, Zugriff/Retention/Manipulationsschutz; Alerts für AuthN/AuthZ-Denials, 429, 5xx, Fatal, Readiness und ungewöhnliche Exporte auslösen.
- [ ] **Supply Chain:** Branch Protection, Pflichtreviews, Environment-Approvals, Runnerhärtung, Signatur-/Provenance-/SBOM-Aufbewahrung und Admission/Binary Authorization nachweisen.
- [ ] **Uploads:** falls aktiviert, Quarantäne, Malware-Scan, Re-Encoding, Metadatenentfernung, sichere Auslieferung und Retention vollständig abnehmen.
- [ ] **Pages-Scope:** bestaetigen, dass GitHub Pages weiterhin ausschliesslich synthetische Demo-Daten und keine Target-Konfiguration, echte Sitzung oder Registrierungsannahme ausliefert; keine Annahme machen, dass Target-Header dort gelten.
- [ ] **Registrierungsroute:** Einen realen Ersatz für die inerte Konzeptdemo und `POST /api/network-registrations` nur gemeinsam nach Route-Policy, OIDC-/IAP-Abnahme, Input-Allowlist, Idempotenz, Rate Limit, Datenschutz- und Backendausfalltests aktivieren.
- [ ] **Cutover:** Staging-End-to-End, Rollen-/Archiv-/Audit-Negativmatrix, Canary, Monitoringfenster, Rollback und fachliches Go/No-Go protokollieren.
- [ ] **Alt-Credentials:** verifizieren, dass historisch dokumentierte Passwortwerte nirgends wiederverwendet werden; bei Unsicherheit rotieren.

## Abhängigkeitsgeordneter Restplan

1. **Freeze und Wiederanlauf:** M00 vollständig abnehmen; Backup, Restore, Nutzer-/Policyinventar und Verantwortliche festhalten.
2. **Supabase-Übergang schließen:** M01-M11 in Staging ausrollen, negative Matrix abnehmen, Auth-User/Sessions bereinigen, danach kontrolliert produktiv migrieren.
3. **Plattform-Trust-Boundary:** gematik-Gateway-, Netzwerk-, TLS- und Tokenvertrag gemeinsam festlegen; Identity selbst bleibt außerhalb dieser Anwendungsprüfung.
4. **Datenpfad:** Cloud-SQL-Transport, Runtime-Grants, Secrets und `identity_bindings` provisionieren; Readiness erst danach grün schalten.
5. **Software Factory:** Branch-/Environment-Gates, signierte immutable Digests, SBOM/Provenance, Scanner und Admission verpflichtend machen.
6. **Staging-Abnahme:** Browserheader, RBAC/Ownership/Archiv, Transaktionen/Audit, Limits, Alerts, Pod-Abbruch und Restore mit synthetischen Daten testen.
7. **Go-live:** dokumentiertes Go/No-Go, Canary, enges Monitoringfenster, kontrollierter Cutover und getesteter Rollback; Browser-Supabase-/LocalStorage-Legacy bleibt abgeschaltet. Die getrennte Pages-Demo bleibt synthetisch und wird nicht auf Realdaten umgeschaltet.

## Lokales Testprotokoll

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | vollständig erfolgreich; Syntax, Validierung, API-/Postgres-/Schema-/Deployment-/Security-Contracts grün |
| Playwright `npm run test:visual` | 171 bestanden, 15 bewusst übersprungen, 0 fehlgeschlagen; Desktop und Mobile |
| `npm audit --audit-level=high` | 0 bekannte Schwachstellen |
| `npm audit signatures` | 74 Registry-Signaturen verifiziert; 16 Attestationsnachweise |
| Semgrep, lokale Regeln | 72 relevante App-/Testdateien, 5 Regeln, 0 Befunde |
| Gitleaks, Historie und aktueller Quellbaum | 673 Commits plus Current-Tree-Scan; keine nicht freigegebenen Leaks |
| API-Containerbuild/-start | Build erfolgreich; Nutzer `node`; Paketmanager fehlen; ohne Produktions-Auth-Konfiguration erwarteter fail-closed Startabbruch |
| Trivy 0.70.0, finales API-Image | 0 HIGH, 0 CRITICAL – einschließlich Alpine- und Node-Paketen |
| Helm 3.19.0 | 1 Chart linted, 0 Fehler; GKE-Overlay erfolgreich gerendert |
| Nginx | Syntax erfolgreich; Login/Config `DENY`/`frame-ancestors 'none'`, exakt drei Kartenframes `SAMEORIGIN`/`'self'`, sensitive Dateien `no-store` |
| PostgreSQL 16 | Schema, Runtime-Grants, `identity_bindings`, Kerntransaktionen und synthetischer Smoke-Test erfolgreich |
| Supabase isoliert lokal | inaktive Identität ohne Zugriff; aktiver Viewer liest; RPC/Audit-Spoofing verweigert beziehungsweise serverseitig überschrieben |
| Terraform 1.12.2 | `fmt -check`, isoliertes `init` und `validate` erfolgreich |
| `git diff --check` | erfolgreich |

## Bewusst verbleibende P2-Restrisiken

- `style-src 'unsafe-inline'` bleibt wegen dynamischer Style-Attribute; Skripte und Event-Handler sind bereits strikt ohne Inline-Ausnahme.
- `img-src https:` erlaubt externe Bildquellen und damit potenzielle Metadaten-/Privacy-Leaks; für den Zielbetrieb auf freigegebene Origins oder API-Proxy verengen.
- Das Hauptkarten-Iframe bleibt same-origin; Hilfsframes sind bereits gesandboxed. Eine Origin-Isolation ist ein eigener Architektur- und Funktionstest.
- Nichtkritische Notifications besitzen keine transaktionale Outbox. Der Fachcommit bleibt korrekt, eine Benachrichtigung kann bei nachgelagertem Fehler aber ausbleiben.
- Das lokale Rate Limit ist pro Prozess. Der verteilte Schutz muss am Gateway/Ingress erfolgen.
- Ausgehendes HTTPS-Egress ist im generischen Chart nicht auf einzelne Hosts begrenzt; Zielplattform sollte JWKS-/Storage-/Telemetry-Ziele über Egress-Policy beziehungsweise Proxy allowlisten.

Keines dieser P2-Themen hebt die fail-closed P0-Kontrollen auf. Änderungen an ihrer Akzeptanz müssen im Go/No-Go-Protokoll ausdrücklich begründet werden.
