# Security-Konfiguration

Hier liegen die prüfbaren Regeln für die lokale Entwicklung, GitHub Actions und die spätere Software Factory:

- `semgrep.yml`: projektspezifische SAST-Regeln,
- `gitleaks.toml`: Gitleaks-Grundkonfiguration,
- `gitleaksignore`: einzeln geprüfte, eng begrenzte Ausnahmen.

`.semgrepignore` verbleibt im Repository-Root, weil Semgrep diese Datei dort automatisch findet. Die Scannerpfade in GitHub Actions und Jenkins zeigen ausdrücklich auf diesen Ordner.

## Nachweise pro Release Candidate

Die Jenkins-Pipeline schreibt die Rohberichte nach `dist/security-evidence/` und archiviert sie beim Build. Diese Dateien werden nicht von Hand in `SECURITY.md` übertragen.

- `generate_frontend_sbom.mjs` erstellt eine CycloneDX-SBOM aus den vier versionierten Vendor-Paketen und prüft die Hashes aller ausgelieferten Dateien. Innere Abhängigkeiten bereits gebauter Browser-Bundles werden nicht aus dem aktuellen Lockfile abgeleitet, weil dies falsche Versionen ergeben könnte.
- Trivy prüft die Alpine-Basispakete und Node.js-Abhängigkeiten des API-Images, erstellt dessen CycloneDX-SBOM und prüft Dockerfile sowie Helm-Manifest.
- `api-image-binding.json` weist die geprüfte Kette vom Registry-Digest über die lokalen OCI-Deskriptoren bis zur gescannten Image-Konfiguration nach.
- `generate_security_evidence.mjs` prüft die Pflichtberichte und verbindet sie mit RC-Tag, Git-Commit, Image-Digest und Frontend-Digest.

SonarQube, Snyk, Dependency-Track und Cosign werden durch die zentrale Software Factory angebunden. Falls diese Nachweise noch fehlen, werden sie als `not-run` ausgewiesen. Für ein zentrales Gate wird je Werkzeug eine Datei nach diesem Muster bereitgestellt:

```json
{
  "tool": "dependency-track",
  "status": "passed",
  "analysisId": "<ID des zentralen Laufs>",
  "policyId": "<ID der zentralen Regel>",
  "sourceRevision": "<Git-Commit>",
  "evaluatedAt": "2026-07-23T12:05:00.000Z",
  "sbomDigests": ["sha256:<API-SBOM>", "sha256:<Frontend-SBOM>"]
}
```

Die Dateinamen sind `sonarqube-gate.json`, `snyk-gate.json`, `dependency-track-gate.json` und `cosign-attestation.json`. Jeder Nachweis muss zum Git-Commit gehören. Dependency-Track muss beide SBOM-Digests nennen; Cosign zusätzlich das signierte API-Image mit Digest. Mit `REQUIRE_EXTERNAL_SECURITY_EVIDENCE=true` stoppt Jenkins, wenn ein zentraler Nachweis fehlt, nicht zum RC gehört oder nicht erfolgreich ist.

Diese Dateien verknüpfen die zentralen Ergebnisse mit dem RC, ersetzen aber nicht deren geschützte Durchsetzung. Insbesondere muss die Software Factory die Cosign-Signatur kryptografisch prüfen, bevor sie den Beleg erzeugt. Der zusammengefasste Repo-Nachweis bleibt deshalb ein `software-factory-linked-precheck`.
