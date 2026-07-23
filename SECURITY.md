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

Während des PoC wird nur der eingesetzte Release Candidate betreut. Eine Korrektur erhält einen neuen RC-Tag; ältere RCs werden nicht parallel gepflegt.

Vor dem Start werden eine verantwortliche Person für die Anwendung und ein Kontaktweg für neue Security-Meldungen benannt. Die Anwendungsverantwortung bewertet neue Befunde, aktualisiert Abhängigkeiten oder Code und stellt bei Bedarf einen neuen RC bereit. Die gematik-IT stellt die Ergebnisse ihrer zentralen Scanner bereit und pflegt die Plattformkomponenten. Ein relevanter hoher oder kritischer Befund wird gemeinsam bewertet; bis zur Korrektur kann der PoC pausiert werden.

## Automatische Prüfungen

Die Pipeline prüft jeden RC auf demselben Git-Commit. Ein fehlgeschlagener Pflichtcheck stoppt den Build.

| Prüfung | Zweck | Nachweis |
| --- | --- | --- |
| Projekt- und Browsertests | Syntax, Verträge, Datenzugriff und Kernabläufe | Jenkins-Log und Playwright-Bericht |
| `npm audit` und Registry-Signaturen | bekannte Schwachstellen und Herkunft der npm-Pakete | JSON-Berichte |
| Semgrep | projektspezifische Fehler- und Sicherheitsmuster im Quellcode | JSON und SARIF |
| Gitleaks | mögliche Zugangsdaten im Git-Verlauf und aktuellen Quellstand | zwei bereinigte JSON-Berichte |
| Trivy Image | bekannte Schwachstellen in Alpine-Basispaketen und Node.js-Abhängigkeiten des API-Containers | JSON und SARIF |
| Trivy Konfiguration | unsichere Einstellungen in Dockerfile und gerendertem Helm-Manifest | JSON und SARIF |
| CycloneDX-SBOM | Komponenten des API-Images und vier direkt nachweisbare Vendor-Pakete des Frontends | zwei SBOM-Dateien |

Die lokalen Gates blockieren hohe oder kritische npm- und Trivy-Befunde, ausgewählte Semgrep-Befunde, Analysefehler und nicht freigegebene Gitleaks-Funde. Die Pipeline erzeugt daraus `security-evidence.json`. Dieser maschinenlesbare Nachweis verbindet RC-Tag, Commit, Frontend-Digest und Prüfergebnisse. Für das API-Image prüft er zusätzlich die Kette vom veröffentlichten Registry-Digest über das lokal gebaute Image bis zu der von Trivy und der SBOM erfassten Image-Konfiguration.

SonarQube, Snyk, Dependency-Track und Cosign gehören zur zentralen Software Factory. Solange diese Dienste nicht angebunden sind, stehen sie im Nachweis ausdrücklich auf `not-run`. Nach der Anbindung verknüpft der Repo-Nachweis Commit, SBOMs und Image mit den zentralen Analyse-IDs und kennzeichnet sie als `reported-passed`. Maßgeblich bleibt das geschützte Gate der Software Factory; der Repo-Nachweis erklärt sich nicht selbst zum Release-Zertifikat. Die Richtlinie steht hier, die Ergebnisse eines einzelnen Laufs bleiben als Jenkins-Artefakte beim jeweiligen RC.

## Risikobetrachtung

Die Repository-Prüfungen decken die für den PoC priorisierten OWASP-Risiken ab. Eine erfolgreiche Pipeline ersetzt nicht die Prüfung von Identity, Gateway, Netzwerk und Logging in der Zielumgebung. Die technische Zuordnung steht im [Mitigationsnachweis](dokumentation/entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md).

## Wichtige Grundlagen

- [API- und Sicherheitsgrenzen](dokumentation/architektur/API_CONTRACT.md)
- [Deployment des Gematik-PoC](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md)
- [Regeln für Daten und externe Inhalte](dokumentation/rechtliches/DATA_NOTICE.md)

Administrative Schlüssel, Passwörter, produktive Daten und Backups gehören nicht in dieses Repository.
