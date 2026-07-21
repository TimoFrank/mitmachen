# Sicherheit

Sicherheit und Datenschutz sind für den Versorgungs-Kompass wichtig. Bitte veröffentliche eine mögliche Sicherheitslücke nicht in einem öffentlichen Issue.

## Sicherheitslücke melden

1. Nimm über das [GitHub-Profil des Maintainers](https://github.com/TimoFrank) Kontakt auf.
2. Bitte dort ohne technische Details um einen privaten Kontaktweg.
3. Teile die Einzelheiten erst über diesen privaten Weg.

Eine gute Meldung nennt:

- den betroffenen Bereich und die verwendete Version,
- die mögliche Auswirkung,
- einfache Schritte zum Nachstellen,
- einen möglichen Lösungsweg, falls bekannt.

Bitte übermittle keine echten personenbezogenen Daten, Zugangsdaten oder produktiven Exporte. Prüfe keine produktiven Systeme ohne ausdrückliche Erlaubnis.

## Unterstützte Versionen

Sicherheitskorrekturen richten sich an den aktuellen Stand des Hauptzweigs und an den neuesten veröffentlichten Release. Ältere Versionen werden nicht gesondert gepflegt.

## OWASP Top 10:2025 – Bearbeitungsstand

Alle zehn OWASP-Kategorien und 18 priorisierte Risikogruppen wurden defensiv geprüft. Die Tabelle beschreibt den vorbereiteten Repository-Vertrag, aber keine pauschale Freigabe eines beweglichen Arbeitsstands. Ein konkreter PoC-RC ist nur dann technisch gruen, wenn die Security-Vertraege und vereinbarten Scans auf seinem exakten Commit erfolgreich sind. Eine produktive Go-live-Freigabe ist nicht Gegenstand des aktuellen PoC und wuerde spaeter eigene Plattform- und Betriebsnachweise erfordern.

| Kategorie | Bereits adressiert | Status |
| --- | --- | --- |
| **A01 Broken Access Control** | Fail-closed API-RBAC, Ownership/Archiv, aktive Identity-Bindings, RLS und NetworkPolicies | Repo `[x]` · Live-Abnahme `[ ]` |
| **A02 Security Misconfiguration** | Signup/Uploads aus, exakter Origin, CSP/Headers, gehärtete Container-/Helm-Defaults | Repo `[x]` · Live-Abnahme `[ ]` |
| **A03 Software Supply Chain Failures** | Exakte Locks/Vendor-Hashes, Pins, Audit, SAST, Secret-/Image-Scan, SBOM/Provenance | Repo `[x]` · Org-Abnahme `[ ]` |
| **A04 Cryptographic Failures** | Vollständige JWT-Prüfung, HTTPS-JWKS, DB `verify-full`/mTLS, TLS und Digests | Repo `[x]` · Live-Abnahme `[ ]` |
| **A05 Injection** | Parametrisierte SQL-Werte, Allowlisten, sichere Ausgabe/URLs, Nachrichtenschema und Limits | Repo `[x]` · Staging-Abnahme `[ ]` |
| **A06 Insecure Design** | Explizite Trust Boundaries, Least Privilege, atomare Mutationen/Audit, sichere Defaults und Restoreplan | Repo `[x]` · Plattform-Abnahme `[ ]` |
| **A07 Authentication Failures** | Kein Browserpasswort/Alias-Fallback, signed-token-only, aktives `(issuer, subject)`-Binding | Repo `[x]` · Identity/Gateway `[ ]` |
| **A08 Software or Data Integrity Failures** | Serverseitiger Audit-Actor, append-only Audit, immutable Releases, Hashes und Provenance | Repo `[x]` · Enforcement `[ ]` |
| **A09 Security Logging & Alerting Failures** | Strukturierte korrelierbare Security Events ohne Token, Body oder PII | Repo `[x]` · Sink/Alerts `[ ]` |
| **A10 Mishandling of Exceptional Conditions** | Limits/Timeouts, generische Fehler, `429`, Rollback, Readiness, Shutdown, Replikate/PDB | Repo `[x]` · Last/Restore `[ ]` |

- [Kompakte OWASP-Risiko- und Mitigationsübersicht](dokumentation/entwicklung-und-qa/OWASP_TOP_10_2025_KOMPAKTUEBERSICHT.md) – foliengeeignete 10-Kategorien-Sicht, alle 18 Risiken und offene Live-Haken
- [Vollständiger Mitigations- und Abnahmenachweis](dokumentation/entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md) – Prioritäten, Schweregrade, Datei-/Zeilenbezug, Evidenz, Tests und Abnahmekriterien

## Wichtige Grundlagen

- [API- und Sicherheitsgrenzen](dokumentation/architektur/API_CONTRACT.md)
- [Betrieb und Berechtigungen](dokumentation/betrieb-und-deployment/BETRIEB.md)
- [Regeln für Daten und externe Inhalte](dokumentation/rechtliches/DATA_NOTICE.md)

Administrative Schlüssel, Passwörter, produktive Daten und Backups gehören nicht in dieses Repository.
