# Generierte Buildausgaben

`dist/` enthält ausschließlich reproduzierbare, nicht versionierte Ergebnisse, die lokal oder in CI entstehen, insbesondere:

- `dist/pages/`: statisches Artefakt für GitHub Pages,
- `dist/target/`: API-/Gateway-gebundenes Frontend für Pre-Integration und Zielbetrieb,
- `dist/release/`: temporäre Release-Unterlagen,
- `dist/security-evidence/` und `dist/api-image-scan/`: archivierte Sicherheits- und Scan-Nachweise,
- `dist/qa/`: Prüf- und Vorschauartefakte.

Der Ordner enthält keine versionierten Dateien und erscheint deshalb nicht im GitHub-Root. Seine Inhalte entstehen durch Builds und Prüfungen neu und dürfen nicht manuell committed werden.
