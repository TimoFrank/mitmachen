# Generierte Buildausgaben

`dist/` enthält ausschließlich reproduzierbare, nicht versionierte Ergebnisse, die lokal oder in CI entstehen, insbesondere:

- `dist/pages/`: statisches Artefakt für GitHub Pages,
- `dist/target/`: API-/Gateway-gebundenes Frontend für Pre-Integration und Zielbetrieb,
- `dist/release/`: temporäre Release-Unterlagen; `dist/release/assets/`
  enthält bei einem Produkt-Release exakt das deterministische Pages-ZIP, das
  eigenständige `build-manifest.json` und `SHA256SUMS`,
- `dist/security-evidence/` und `dist/api-image-scan/`: archivierte Sicherheits- und Scan-Nachweise,
- `dist/qa/`: Prüf- und Vorschauartefakte.

Der Ordner enthält keine versionierten Dateien und erscheint deshalb nicht im GitHub-Root. Seine Inhalte entstehen durch Builds und Prüfungen neu und dürfen nicht manuell committed werden.

Das Produkt-Release-Paket übernimmt nur reguläre Dateien aus `dist/pages/`,
sortiert Pfade kanonisch und normalisiert Zeitstempel sowie Dateirechte. Das
Manifest im ZIP ist bytegleich mit dem eigenständigen Manifest und ergänzt die
zentrale Produktversion sowie den vollständigen Release-Commit. Der
`artifactDigest` wird aus dem tatsächlichen Pages-Inhalt nachgerechnet. Eine
versionsgebundene Domain sowie 64-Bit-Längenpräfixe für Dateizahl, UTF-8-Pfad
und Dateiinhalt binden dabei jede Dateigrenze eindeutig, auch wenn Binärdateien
NUL-Bytes enthalten;
`SHA256SUMS` enthält ausschließlich ZIP und Manifest. Lokale und erneut von
GitHub heruntergeladene Assets werden gegen denselben Vertrag geprüft.
