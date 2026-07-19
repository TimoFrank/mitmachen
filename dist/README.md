# Generierte Buildausgaben

`dist/` enthält ausschließlich reproduzierbare, nicht versionierte Ergebnisse, die lokal oder in CI entstehen:

- `dist/pages/`: statisches Artefakt für GitHub Pages,
- `dist/target/`: API-/Gateway-gebundenes Frontend für Pre-Integration und Zielbetrieb,
- `dist/release/`: temporäre Release-Unterlagen,
- `dist/qa/`: Prüf- und Vorschauartefakte.

Nur diese README wird in Git gespeichert. Die Inhalte entstehen durch Builds und Prüfungen neu und dürfen nicht manuell committed werden.
