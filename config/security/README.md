# Security-Konfiguration

Hier liegen die prüfbaren Regeln für die lokale Entwicklung, GitHub Actions und
die geschützte Software Factory:

- `semgrep.yml`: projektspezifische SAST-Regeln,
- `gitleaks.toml`: Gitleaks-Grundkonfiguration,
- `gitleaksignore`: einzeln geprüfte, eng begrenzte Ausnahmen.

`.semgrepignore` verbleibt im Repository-Root, weil Semgrep diese Datei dort automatisch findet. Die Scannerpfade in GitHub Actions und Jenkins zeigen ausdrücklich auf diesen Ordner.

## Vertrauensanker der Quellübergabe

Neue Target-Releases werden ausschließlich aus einem signierten,
annotierten `vX.Y.Z`-Tag gebaut. Für die GitLab-Übernahme enthält das
Übergabepaket eine öffentliche Schlüsselkopie; sie ist nur Transportinhalt und
begründet allein kein Vertrauen. Die empfangende Seite bestätigt den
öffentlichen Schlüssel und den vollständigen Fingerprint über einen
unabhängigen Kanal. Privater Signierschlüssel und Passphrase werden niemals
übertragen.

`package_source_handoff.mjs` erzeugt ein vollständiges Git-Bundle mit genau
`main` und allen Tags. Es signiert `SHA256SUMS` mit dem geschützten, nur in der
Signierumgebung verfügbaren Release-Signing-Subkey als `SHA256SUMS.asc`; privates
Schlüsselmaterial wird weder exportiert noch paketiert.
`verify_source_handoff.mjs` authentisiert dieses Prüfsummenmanifest zuerst
gegen den extern bestätigten Trust Anchor. Danach bindet es Quell-URL,
Ref-Inventar, Prüfsummen, Tagobjekt, Commit und Produktversion an diesen
Vertrauensanker und führt `git bundle verify`, Mirror-Import sowie
`git fsck --strict --full` aus. Der vollständige Gitleaks-Historienlauf bleibt
vor der Übergabe blockierend; ein erfolgreiches Bundle-Gate ersetzt ihn nicht.
Das führende Verfahren steht im
[GitLab-/Software-Factory-Übergaberunbook](../../dokumentation/betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).

## Nachweise pro Release Candidate

Die Jenkins-Pipeline schreibt die Rohberichte nach `dist/security-evidence/` und archiviert sie beim Build. Diese Dateien werden nicht von Hand in `SECURITY.md` übertragen.

- `generate_frontend_sbom.mjs` erstellt eine CycloneDX-SBOM aus den vier versionierten Vendor-Paketen, übernimmt die zentrale Produktversion und bindet Buildprofil, Quellrevision sowie Artefaktdigest. Es prüft die Hashes aller ausgelieferten Dateien. Innere Abhängigkeiten bereits gebauter Browser-Bundles werden nicht aus dem aktuellen Lockfile abgeleitet, weil dies falsche Versionen ergeben könnte.
- Trivy prüft die Alpine-Basispakete und Node.js-Abhängigkeiten des API-Images, erstellt dessen CycloneDX-SBOM und prüft Dockerfile sowie Helm-Manifest.
- `api-image-binding.json` weist die geprüfte Kette vom Registry-Digest über die lokalen OCI-Deskriptoren bis zur gescannten Image-Konfiguration nach.
- `generate_security_evidence.mjs` prüft die Pflichtberichte und verbindet sie
  mit vollständigem Produkt-Tag, Tagobjekt-SHA, Git-Commit,
  Signer-Fingerprint, Image-Digest und Frontend-Digest.

SonarQube, Snyk, Dependency-Track und Cosign werden durch die zentrale Software
Factory angebunden. Nur eine lokale Vorprüfung darf fehlende zentrale
Nachweise als `not-run` ausweisen. Das ist keine Target-Freigabe. Im Target-Lauf
ist `REQUIRE_EXTERNAL_SECURITY_EVIDENCE=true` zwingend; alle externen Gates
müssen erfolgreich und exakt an denselben Build gebunden sein.

Die Software Factory veröffentlicht atomar und anschließend unveränderlich in
`EXTERNAL_SECURITY_EVIDENCE_ROOT/<BUILD_TAG>`. Root, Build-Verzeichnis und
Dateien dürfen keine Symlinks sein, liegen außerhalb des Workspaces und sind
für Jenkins nur lesbar. Das Inventar ist geschlossen, jede JSON-Datei ist 2
Byte bis 1 MiB groß. Jenkins vergleicht den Quellhash vor und nach jeder Kopie
mit dem Hash der importierten Datei.

Vor dem Registry-Push werden exakt diese vier Dateien importiert:

- `sonarqube-gate.json`, `snyk-gate.json` und
  `dependency-track-gate.json` besitzen exakt die Felder `analysisId`,
  `buildId`, `evaluatedAt`, `imageRepository`, `policyId`, `releaseTag`,
  `sbomDigests`, `sourceRepository`, `sourceRevision`, `status` und `tool`;
  ihr Status ist `passed`.
- `cosign-attestation-ready.json` besitzt exakt `buildId`, `imageRepository`,
  `releaseTag`, `sbomDigests`, `schemaVersion`, `sourceRepository`,
  `sourceRevision` und `status`; Schema ist
  `versorgungs-kompass-cosign-readiness/v1`, Status ist `ready`.

Alle vier Dateien binden dieselbe Build-ID, Produkt-Tag, normalisierte
Quell-URL, Quellrevision, Image-Repository und exakt die Digests der API- und
Frontend-SBOM. Erst danach darf das API-Image in die Registry geschrieben
werden.

Nach dem Push folgt als fünfte Datei `cosign-attestation.json`. Sie besitzt die
Gatefelder plus `subject`; `tool` ist `cosign`, `status` ist `passed` und
`subject` entspricht exakt `<image-repository>@<sha256-digest>` des
veröffentlichten Images. Fehlt sie, weicht ihre Buildbindung ab oder ändert
sich das Inventar, stoppt Jenkins vor Helm-Prüfung, Evidence-Zusammenführung,
Frontend-Staging und Deployment. Ein bereits gepushtes Image bleibt dann
unfreigegeben.

Diese Dateien verknüpfen die zentralen Ergebnisse mit dem RC, ersetzen aber
nicht deren geschützte Durchsetzung. Die Software Factory prüft die
Cosign-Signatur selbst kryptografisch, bevor sie den Beleg erzeugt. Der
zusammengefasste Repo-Nachweis bleibt deshalb ein
`software-factory-linked-precheck`.

Pages-/GKE-Builds, persönliche Werte, Secrets, Daten, Snapshots und
OIDC-Subjects sind keine Quellübergabe- oder Target-Build-Eingaben. RC.2 bis
RC.5 und die damalige Übergabenotiz bleiben historische Evidenz; ihr
Signaturstatus wird nicht nachträglich verändert und nicht als aktueller
Target-Fallback akzeptiert.
