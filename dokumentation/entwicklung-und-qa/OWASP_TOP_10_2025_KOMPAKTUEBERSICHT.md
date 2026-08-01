# OWASP Top 10:2025 – kompakte Risiko- und Mitigationsübersicht

Stand: 31.07.2026
Zweck: kopierfähige Übersicht für interne Folien, Security-Reviews und Go-live-Abnahmen
Status: historischer Security-Snapshot; keine aktuelle Betriebs- oder Providerfreigabe

> **Einordnung nach dem Repository-Decommission vom 31. Juli 2026:** Die
> Supabase-bezogenen Prüfungen, Pfade und offenen Gates unten dokumentieren den
> damaligen Befund und bleiben als Security-Evidenz erhalten. Aktuell nutzt die
> geschützte Anwendung ausschließlich Cloud SQL/PostgreSQL und GCS; ein
> Supabase-Laufzeit- oder Rückfallpfad ist nicht mehr zulässig. Die Stilllegung
> möglicherweise noch vorhandener Provider-Ressourcen ist ein separater
> Betriebsvorgang und kein Anwendungs-Go-live-Gate. Verweise auf entfernte
> Repository-Pfade sind über die Git-Historie nachvollziehbar.

## Management-Aussage

| Aussage | Status | Einordnung |
| --- | --- | --- |
| OWASP-Kategorien geprüft | **10 von 10** | Jede Kategorie wurde anhand von Quellcode, Konfiguration, Deploymentartefakten und lokalen Tests behandelt. |
| Priorisierte Risikogruppen bearbeitet | **18 von 18** | Für jeden Befund ist eine technische Mitigation oder eine klar benannte externe Abnahmebedingung dokumentiert. |
| Repository-Readiness | **grün** | Bestätigte Code- und Konfigurationsbefunde sind geschlossen, fail-closed deaktiviert oder sicher für den Rollout vorbereitet. |
| Produktive Go-live-Freigabe | **gelb** | Der Supabase-Rückbau ist abgeschlossen und live attestiert. Offen bleiben davon unabhängige Zielbetriebsnachweise für Gateway/Identity, Cloud SQL, Ingress, Monitoring und Betriebsprozesse. |
| Zwei-App-Trennung | **grün** | GitHub Pages bleibt als rein synthetische, anonyme Demo bestehen; die Realanwendung ist ein getrenntes API-only-Target mit OIDC beziehungsweise IAP. |
| Legacy-Backend-Decommission | **grün** | Supabase-Projekt seit 31.07.2026 pausiert (`INACTIVE`), nicht gelöscht; 5/5 Nutzer gesperrt; 0 Sessions und 0 aktive Refresh Tokens; kein Supabase-Laufzeitpfad im aktiven Repository oder GKE. |
| Wiederanlauf/Archiv | **grün** | Gemeinsamer Restore bestanden; 542 Objekte mit 14.090.082 Bytes, alle event-held. Plattformseitiger Direktrestore des pausierten Projekts: 90 Tage; Archiv bleibt bis zu einer gesonderten dokumentierten Aufbewahrungs- oder Löschentscheidung erhalten. |

Legende: `[x]` nachgewiesen · `[~]` Repository-Mitigation vorhanden, Rollout oder Live-Abnahme offen · `[ ]` externe Abnahme noch offen

## Ein-Folien-Übersicht nach OWASP-Kategorie

| OWASP Top 10:2025 | Angesehen und geprüft | Bereits im Repository adressiert | Hakenstand | Verbleibendes Go-live-Gate |
| --- | --- | --- | --- | --- |
| **A01 Broken Access Control** | Route-, Rollen-, Objekt-, Archiv-, Cloud-SQL-Grant- und Netzwerkzugriffe | Fail-closed API-Manifest, `viewer/editor/admin`, Ownership-Prüfung, aktive Identity-Bindings, `NOLOGIN`-Runtimegrants und NetworkPolicies | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Rollenmatrix mit echten Ziel-Tokens, Fremdobjekten und direkten Netzpfaden negativ testen |
| **A02 Security Misconfiguration** | Legacy-Provider, Uploads, Origins, Header, Container-, Helm- und Ingress-Defaults | Supabase pausiert und aus Runtime/Deployment entfernt; unsichere Features aus, exakter HTTPS-Origin, CSP/Security Header, validiertes Helm-Schema und gehärtete Pods | Prüfung `[x]` · Repo `[x]` · Supabase/GKE `[x]` · restliches Live `[ ]` | Ingress-, allgemeine Admission- und Headerkontrollen in der realen Umgebung attestieren |
| **A03 Software Supply Chain Failures** | Dependencies, Lockfiles, Browser-CDNs, Actions, Scanner, Images und Secret-Historie | Exakte Locks und Vendor-Hashes, commit-/digest-gepinnte Werkzeuge, Audit, Semgrep, Gitleaks, Trivy, SBOM und Provenance | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Branch Protection, Runner, Registry, Signatur- und Admission-Enforcement bestätigen |
| **A04 Cryptographic Failures** | JWT-Signatur/Claims, JWKS, Datenbanktransport, TLS und Artefaktintegrität | Algorithmen-/Key-/Issuer-/Audience-/Zeitprüfung, HTTPS-JWKS, `verify-full` oder mTLS-Proxy, TLS-Ingress und Digests | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Reale Zertifikate, Token, Key-Rotation, Trust Store und `pg_stat_ssl` nachweisen |
| **A05 Injection** | SQL/Identifier, DOM-XSS, dynamische URLs, `postMessage`, Request-Bodies und Uploadparser | Parametrisierte SQL-Werte, Allowlisten, leere-`WHERE`-Guards, sichere Ausgabe/URLs, geschlossenes Nachrichtenschema und Größenlimits | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Ungefährliche Grenzwert- und Negativtests in Staging wiederholen |
| **A06 Insecure Design** | Trust Boundaries, implizite Freigaben, mehrstufige Mutationen, Upload-/Notification-Design und Wiederanlauf | Providerneutrale fail-closed Identity-Grenze, Least Privilege, atomare Fachtransaktionen/Audit, sichere Feature-Defaults, PDB/Timeouts/Restoreplan | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Plattform-Threat-Model, Last-/Abbruch-/Restoretests und fachliche Outbox-Entscheidung abnehmen |
| **A07 Authentication Failures** | Browserpasswörter, Alias-/Legacy-Fallback, unsigned Header, Ziel-Identity und Sessiongrenzen | Passwort-/Hash-/Alias-Fallback entfernt; Legacy-Provider pausiert, 5/5 Nutzer gesperrt und 0 Sessions/Refresh Tokens; Target signed-token-only mit genau einem aktiven `(issuer, subject)`-Binding | Prüfung `[x]` · Repo `[x]` · Legacy-Live `[x]` · Ziel-Live `[ ]` | Gateway-Stripping sowie externe Ziel-Session, Logout, Revocation und Deprovisionierung gemeinsam abnehmen |
| **A08 Software or Data Integrity Failures** | Client-Actor/Audit, Teilmutationen, mutable Releases, Third-Party-Assets und Migrationen | Serverseitiger Actor, append-only `activity_events` im selben Commit, Cloud-SQL-Migrationsdigest, immutable Image/Frontend, Vendor-Hashes, Locks, SBOM/Provenance | Prüfung `[x]` · Repo `[x]` · Restore `[x]` · Live `[ ]` | Signatur-/Attestation-Enforcement im Zielbetrieb nachweisen |
| **A09 Security Logging & Alerting Failures** | Korrelation, AuthN/AuthZ-Denials, Rate-/Fehler-/Readiness-Ereignisse sowie PII-/Token-Leakage | Request-IDs und strukturierte Ereignisse ohne Token, Body oder PII; generische Fehler; Fatal-/Readiness-Signale | Prüfung `[x]` · Repo `[x]` · Live `[ ]` | Zentralen Sink, Retention, Zugriffsschutz, Dashboards und Alerts konfigurieren und auslösen |
| **A10 Mishandling of Exceptional Conditions** | Exceptions, übergroße Requests, Timeouts, Überlast, Teilfehler, Pod-Abbruch und Wiederherstellung | Generische Fehler, Budgets/Limits, `429`, DB-/HTTP-Timeouts, Rollback, Readiness, Graceful Shutdown, zwei Replikate, PDB und bestandener gemeinsamer Restore | Prüfung `[x]` · Repo `[x]` · Restore `[x]` · restliches Live `[ ]` | Verteiltes Gatewaylimit, Last/Chaos, Rollout/Pod-Abbruch und zielbetriebliche Restore-Wiederholung testen |

**Kurzinterpretation:** Die leeren Live-Haken sind keine verschwiegenen Codebefunde. Sie markieren Nachweise, die erst in einer realen Plattformumgebung belastbar erbracht werden können.

## Traceability aller 18 priorisierten Risiken

| ID | Priorität | OWASP-Zuordnung | Bestätigtes Risiko | Adressierte Mitigation | Stand |
| --- | --- | --- | --- | --- | --- |
| **R01** | P0 / kritisch | A02, A07 | Offene Legacy-Registrierung und automatisch aktive Profile | Provider `INACTIVE`; 5/5 Nutzer gesperrt; 0 Sessions und 0 aktive Refresh Tokens; kein Supabase-Laufzeitpfad in Repository oder GKE | `[x]` abgeschlossen |
| **R02** | P0 / kritisch | A01, A02, A06 | Zu weit freigegebene Legacy-Notification-RPC | RPC-/Edge-Laufzeit stillgelegt; Edge-Code entfernt; Projekt pausiert; negative Regressionswächter bleiben bestehen | `[x]` abgeschlossen |
| **R03** | P0 / kritisch | A01, A04, A07 | Unsigned Identity-Header oder E-Mail als Identität | Signierte JWTs mit vollständiger Prüfung; Rolle nur aus aktivem `(issuer, subject)`-Binding | `[x]` Gatewayabnahme offen |
| **R04** | P0 / kritisch | A01, A06 | Fehlende oder implizite Rollenentscheidung | Vollständiges fail-closed Routenmanifest plus Objekt-, Archiv- und Adminregeln | `[x]` Staging-Matrix offen |
| **R05** | P0 / hoch | A05 | DOM-XSS, unsichere URLs und Wildcard-`postMessage` | Sichere Ausgabe/URLs; exakter Origin/Source; versioniertes Schema; Sandbox-Hilfsframes | `[x]` |
| **R06** | P0 / hoch | A07 | Browserseitige Passwort-/Alias-/Supabase-/LocalStorage-Authentisierung oder Datenersatz | Passwort-/Hash-/Aliaslogik entfernt; Target fachlich nur `/api/...`, ohne Browser-Supabase, LocalStorage-Fachdaten oder Ersatzsitzung; Legacy-Provider pausiert | `[x]` negative Regression bleibt verpflichtend |
| **R07** | P0 / hoch | A04 | Datenbankverbindung ohne belastbare TLS-Prüfung | Produktion verlangt `verify-full`; dokumentierte lokale mTLS-Proxy-Ausnahme; Timeouts | `[x]` Live-Transport attestieren |
| **R08** | P0 / hoch | A03, A08 | Privilegiertes oder nicht reproduzierbares Runtime-Image | Digest-Basis, minimales API-Lockfile, Production-only-Install, kein Paketmanager, Non-Root | `[x]` Trivy 0 HIGH/CRITICAL |
| **R09** | P0 / hoch | A01, A02, A06, A10 | Schwache Podrechte, breite Netzpfade und geringe Verfügbarkeit | Zwei Replikate, PDB, Probes, kein SA-Token, Non-Root/Read-only/Seccomp/Cap-Drop, NetworkPolicies | `[x]` Clusterabnahme offen |
| **R10** | P0 / hoch | A05, A06, A08, A10 | Teilmutationen und manipulierbarer Audit-Actor | Kernmutationen transaktional; Actor serverseitig; Repository-Vertrag für die Cloud-SQL-Runtime `NOLOGIN` und `activity_events` nur mit `SELECT`/`INSERT` | `[~]` Vertragstests grün; Live-Rolle besitzt noch `UPDATE`/`DELETE` und muss nach Backup abgeglichen werden |
| **R11** | P0 / hoch | A05, A06, A10 | Unsichere aktive Datei-/Bilduploads | Produktion fail-closed; Entwicklung nur kanonisches TXT mit Typ-, UTF-8- und Größenprüfung | `[x]` Reaktivierung hat eigenes Gate |
| **R12** | P0 / hoch | A06, A10 | Unbegrenzte Requests, fehlende Timeouts und Überlast | Body-/Zeitbudgets, In-Memory-Limit, `429`, Readiness und Graceful Shutdown | `[~]` Verteiltes Limit/Lasttest offen |
| **R13** | P1 / hoch | A02, A03, A08 | Inline-Code, externe Browser-CDNs und fehlende Response-Header | Inline-Code extrahiert; Assets lokal vendort/gehasht; CSP, HSTS und weitere Header im Target | `[~]` Live-Header messen |
| **R14** | P1 / hoch | A03, A04, A08 | Bewegliche Actions/Scanner/Images und unvollständige CI-Gates | Commit-/Digest-Pins; Audit, Signaturen, Semgrep, Gitleaks-Historie, Trivy, SBOM/Provenance | `[x]` Org-/Admission-Gates offen |
| **R15** | P1 / hoch | A02 | Fehlende Originbindung und Clickjacking-Schutz | Exakter HTTPS-`ALLOWED_ORIGIN`; Default `DENY`; nur drei Kartenartefakte same-origin framebar | `[x]` Live-Browsertest offen |
| **R16** | P1 / mittel | A09 | Nicht korrelierbare Sicherheitsereignisse und fehlende Alerts | Strukturierte Request-/Auth-/Rate-/Fatal-Events ohne Token, Body oder PII | `[~]` Sink/Alerts extern |
| **R17** | P1 / mittel | A06, A10 | Unzureichend verankerter HA-, Backup-, Restore- und Cutover-Sollzustand | Private regionale Cloud-SQL-Sollarchitektur, PITR/Backups, PDB, atomare Rollouts und Runbooks; gemeinsamer Restore bestanden; 542 Archivobjekte vollständig event-held | `[~]` Canary bleibt extern |
| **R18** | P2 / mittel | A02, A03, A04 | Reale Alias-/E-Mail-Beispiele und historische Secret-Muster | Aktive Inhalte bereinigt; Legacy-Provider pausiert; Public-Asset- und vollständige History-Secret-Scans grün; historische Evidenz bleibt erhalten | `[x]` Alt-Credentials prüfen |

Datei- und Zeilenevidenz, sichere Testanweisungen und Abnahmekriterien stehen im [vollständigen Mitigations- und Abnahmenachweis](OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md).

## Was GKE Autopilot bereits mitträgt

GKE Autopilot reduziert die Plattformangriffsfläche, ersetzt aber keine Anwendungskontrolle. Die Wirkung gilt erst nach Live-Attestierung des tatsächlich ausgerollten Clusters.

| Autopilot-/GKE-Beitrag | Unterstützte Kategorien | Was weiterhin in der Anwendung oder Plattformabnahme bleibt |
| --- | --- | --- |
| Verwaltete Nodes, Patching und eingeschränkte Workload-Defaults | A02, A03, A10 | Image-Inhalt, Dependency-Gates, sichere Pod-Manifeste und Admission-Nachweis |
| Workload Identity statt statischer Cloud-Schlüssel im Pod | A01, A04, A07 | JWT-/Rollenprüfung, Secretberechtigungen und Identity-Bindings |
| Dataplane V2 als Basis für NetworkPolicy | A01, A02 | Korrekte Ingress-/Egressregeln, Header-Stripping und gesperrter Direktzugriff |
| Verwaltetes Scheduling und Reparaturmechanismen | A06, A10 | Zwei Replikate, PDB, Readiness, Transaktionen, Lasttests und Restore |

Nicht durch Autopilot mitigiert werden insbesondere Authentisierung/RBAC, XSS/Injection, CSP, Datenbank-TLS, fachliche Transaktionen/Audit, Alerting und Backup-Restore.

## Noch gemeinsam extern abzuhaken

- [ ] **Zwei-App-Scope:** Pages weiterhin nur mit synthetischen CRM-/Fachdaten und dem kuratierten öffentlichen Bundestags-Snapshot sowie ohne Target-Konfiguration, echte Sitzung, Supabase oder Registrierungsannahme verifizieren; Target ausschließlich API-only ausliefern.
- [ ] **Registrierungsroute:** Die Konzeptdemo ohne Intake-Aufruf belassen; den getrennten HMAC-M2M-Pfad `POST /api/connectors/typo3/mitmachen-registrations` erst nach Formular-, Datenschutz-, Secret-, Ingress-, Idempotenz-, Limit- und Backendausfallabnahme aktivieren.
- [x] **Legacy-Backend:** Supabase-Projekt pausiert (`INACTIVE`) und nicht gelöscht; 5/5 Nutzer gesperrt; 0 Sessions und 0 aktive Refresh Tokens; aktiver Repository- und GKE-Laufzeitpfad ohne Supabase. Historische Evidenz und negative Regressionswächter bleiben erhalten.
- [x] **Wiederanlauf/Archiv:** Gemeinsamer Restore bestanden; 542 Objekte mit 14.090.082 Bytes vollständig event-held. Direktrestorefenster 90 Tage; Recovery-Archiv bis zu einer gesonderten dokumentierten Aufbewahrungs- oder Löschentscheidung erhalten.
- [ ] **Identity/Gateway:** fremde Identity- und Authorization-Header vor Auth entfernen; nur verifizierten Kontext neu etablieren; direkten API-Zugriff sperren; TLS auf jedem Hop.
- [ ] **Tokenvertrag:** Issuer, Audience, JWKS, Algorithmen, Zeitclaims, `sub`-Stabilität, Rotation, Revocation und Fehlerfälle mit synthetischen Konten abnehmen.
- [ ] **GKE/Cloud SQL/Ingress:** Admission, NetworkPolicy, Workload Identity, Podrechte, TLS, private DB-Erreichbarkeit und aktiven verschlüsselten Transport attestieren.
- [ ] **Software Factory:** Branch Protection, Pflichtreviews, Runnerhärtung, Registry, Signatur/Attestation, SBOM/Provenance und Binary Authorization nachweisen.
- [ ] **Monitoring/Resilienz:** zentralen Log-Sink und Alerts aktivieren; verteilte Rate Limits, Überlast, Pod-Abbruch und Software-Rollback testen. Der gemeinsame Datenrestore ist bereits bestanden.
- [ ] **Browser:** CSP, HSTS, Frame-, Cache-, Referrer-, Permissions-, COOP/CORP- und same-origin-Regeln am realen Ingress messen.
- [ ] **Cutover:** Staging-End-to-End, Canary, Go/No-Go, Monitoringfenster und Rollback des Cloud-SQL-/API-Zielpfads protokollieren. Der Supabase-Legacypfad bleibt pausiert und aus Repository sowie GKE entfernt; die getrennte Pages-Demo bleibt synthetisch.

Historischer Hinweis zum damaligen Supabase-Übergang: Der frühere Live-Nachweis prüfte Data-API-/Rollen-Grants und RLS getrennt, weil diese Schutzschichten unabhängig voneinander konfiguriert wurden. Für den aktuellen Zielbetrieb ist stattdessen ausschließlich der Cloud-SQL-/GCS-Vertrag maßgeblich.

## Lokal erbrachter Nachweis

| Prüfung | Ergebnis |
| --- | --- |
| Projekt-Gesamtprüfung | `npm run check` erfolgreich |
| Browserregression | 171 bestanden, 15 bewusst übersprungen, 0 fehlgeschlagen |
| Dependency Audit | 0 bekannte Schwachstellen; Registry-Signaturen/Attestationsnachweise geprüft |
| SAST | Semgrep: 72 relevante Dateien, 5 Regeln, 0 Befunde |
| Secret Scan | Gitleaks: 673 Commits plus aktueller Quellbaum, keine nicht freigegebenen Leaks |
| Container | Build/Fail-closed-Start geprüft; Non-Root; Trivy 0 HIGH und 0 CRITICAL |
| Deploymentartefakte | Helm lint/render, Nginx-Header, PostgreSQL 16 und Terraform validate erfolgreich; GKE-Live-Bestand mit 0 Supabase-Referenzen |
| Legacy-Backend/Recovery | Projekt `INACTIVE`; 5/5 Nutzer gesperrt; 0 Sessions und 0 aktive Refresh Tokens; Restore bestanden; 542 Archivobjekte, 14.090.082 Bytes, vollständig event-held; Direktrestorefenster 90 Tage |
| Historischer Supabase-Isolationstest | Inaktive Identität ohne Zugriff; aktiver Viewer liest; RPC-/Audit-Spoofing verweigert beziehungsweise serverseitig überschrieben |

Der [vollständige Nachweis](OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md) bleibt die führende Quelle für Priorität, Schweregrad, Datei-/Zeilenbezug, konkrete Mitigation, Abnahmekriterium und empfohlenen sicheren Test.
