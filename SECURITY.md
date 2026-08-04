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

Während des PoC wird nur der eingesetzte Release Candidate betreut. Eine
Korrektur erhöht den Patchstand und erhält einen neuen signierten, annotierten
Produkt-Tag `vX.Y.Z`; ältere RCs werden nicht parallel gepflegt. Die
historischen RC.2- bis RC.5-Tags bleiben unverändert und sind kein aktueller
Deployment-Fallback.

Vor dem Start werden eine verantwortliche Person für die Anwendung und ein Kontaktweg für neue Security-Meldungen benannt. Die Anwendungsverantwortung bewertet neue Befunde, aktualisiert Abhängigkeiten oder Code und stellt bei Bedarf einen neuen RC bereit. Die gematik-IT stellt die Ergebnisse ihrer zentralen Scanner bereit und pflegt die Plattformkomponenten. Ein relevanter hoher oder kritischer Befund wird gemeinsam bewertet; bis zur Korrektur kann der PoC pausiert werden.

## Automatische Prüfungen

Die Pipeline prüft jeden RC auf dem nachgewiesenen Zielcommit seines
signierten `vX.Y.Z`-Tagobjekts. Ein fehlgeschlagener Pflichtcheck stoppt den
Build.

| Prüfung | Zweck | Nachweis |
| --- | --- | --- |
| Projekt- und Browsertests | Syntax, Verträge, Datenzugriff und Kernabläufe | Jenkins-Log und Playwright-Bericht |
| `npm audit` und Registry-Signaturen | bekannte Schwachstellen und Herkunft der npm-Pakete | JSON-Berichte |
| Semgrep | projektspezifische Fehler- und Sicherheitsmuster im Quellcode | JSON und SARIF |
| Gitleaks | mögliche Zugangsdaten im Git-Verlauf und aktuellen Quellstand | zwei bereinigte JSON-Berichte |
| Trivy Image | bekannte Schwachstellen in Alpine-Basispaketen und Node.js-Abhängigkeiten des API-Containers | JSON und SARIF |
| Trivy Konfiguration | unsichere Einstellungen in Dockerfile und gerendertem Helm-Manifest | JSON und SARIF |
| CycloneDX-SBOM | Komponenten des API-Images und vier direkt nachweisbare Vendor-Pakete des Frontends | zwei SBOM-Dateien |

Die lokalen Gates blockieren hohe oder kritische npm- und Trivy-Befunde, ausgewählte Semgrep-Befunde, Analysefehler und nicht freigegebene Gitleaks-Funde. Die Pipeline erzeugt daraus `security-evidence.json`. Dieser maschinenlesbare Nachweis verbindet Quell-URL, Produkt-Tag, Tagobjekt-SHA, Commit, Signer-Fingerprint, Frontend-Digest und Prüfergebnisse. Für das API-Image prüft er zusätzlich die Kette vom veröffentlichten Registry-Digest über das lokal gebaute Image bis zu der von Trivy und der SBOM erfassten Image-Konfiguration.

SonarQube, Snyk, Dependency-Track und Cosign gehören zur zentralen Software Factory. Bei lokalen Vorprüfungen ohne diese Dienste stehen sie im Nachweis ausdrücklich auf `not-run`. Nach der Anbindung verknüpft der Repo-Nachweis Commit, SBOMs und Image mit den zentralen Analyse-IDs und kennzeichnet sie als `reported-passed`. Maßgeblich bleibt das geschützte Gate der Software Factory; der Repo-Nachweis erklärt sich nicht selbst zum Release-Zertifikat. Die Richtlinie steht hier, die Ergebnisse eines einzelnen Laufs bleiben als Jenkins-Artefakte beim jeweiligen RC.

`not-run` ist ausschließlich bei einer lokalen Vorprüfung zulässig. Ein echter
Target-Lauf importiert die zentralen Nachweise buildgebunden und read-only:
SonarQube, Snyk, Dependency-Track und Cosign-Bereitschaft vor dem Registry-
Push, die auf den unveränderlichen Image-Digest gebundene Cosign-Attestation
danach. Fehlt eine Bindung oder ändert sich eine Nachweisdatei während des
Imports, bleiben Evidence-Zusammenführung und Deployment gesperrt.

## Sichere Quellübergabe

Die institutionelle GitLab-Übernahme erfolgt als vollständig verifiziertes
Git-Bundle mit genau `main` und allen Tags. Prüfsummen, Ref-Inventar,
`git fsck --strict --full`, Tagobjekt, Zielcommit und Tag-Signatur werden auf
der empfangenden Seite erneut geprüft. Das Paket besitzt dazu ein abgetrennt
signiertes Prüfsummenmanifest `SHA256SUMS.asc`, dessen Signatur vor der
Auswertung der Hashwerte geprüft wird. Der öffentliche Release-Schlüssel und
sein vollständiger Fingerprint werden über einen unabhängigen Kanal bestätigt;
die Schlüsselkopie im Paket ist nicht selbst der Vertrauensanker. Der private
Signing-Subkey bleibt in der geschützten Signierumgebung und wird niemals
übertragen.

Die Übergabe enthält keine Arbeitsordner-ZIPs, Pages-/GKE-Builds,
Container-Images, persönlichen Werte, Secrets, Daten, Snapshots, Tokens oder
OIDC-Subjects. Nach dem protokollierten Cutover ist GitLab die einzige
beschreibbare Quellautorität; eine bidirektionale Synchronisation ist
ausgeschlossen. Der genaue Ablauf steht im
[GitLab-/Software-Factory-Übergaberunbook](dokumentation/betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).

## Risikobetrachtung

Die Repository-Prüfungen decken die für den PoC priorisierten OWASP-Risiken ab. Eine erfolgreiche Pipeline ersetzt nicht die Prüfung von Identity, Gateway, Netzwerk und Logging in der Zielumgebung. Die technische Zuordnung steht im [Mitigationsnachweis](dokumentation/entwicklung-und-qa/OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md).

## Wichtige Grundlagen

- [API- und Sicherheitsgrenzen](dokumentation/architektur/API_CONTRACT.md)
- [Quellübergabe an GitLab und Software Factory](dokumentation/betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md)
- [Deployment des Gematik-PoC](dokumentation/betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md)
- [Regeln für Daten und externe Inhalte](dokumentation/rechtliches/DATA_NOTICE.md)

Administrative Schlüssel, Passwörter, produktive Daten und Backups gehören nicht in dieses Repository.
