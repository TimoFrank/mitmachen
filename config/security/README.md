# Security-Konfiguration

Hier liegen die prüfbaren Regeln für die lokale Entwicklung, GitHub Actions und die spätere Software Factory:

- `semgrep.yml`: projektspezifische SAST-Regeln,
- `gitleaks.toml`: Gitleaks-Grundkonfiguration,
- `gitleaksignore`: einzeln geprüfte, eng begrenzte Ausnahmen.

`.semgrepignore` verbleibt im Repository-Root, weil Semgrep diese Datei dort automatisch findet. Die Scannerpfade in GitHub Actions und Jenkins zeigen ausdrücklich auf diesen Ordner.
