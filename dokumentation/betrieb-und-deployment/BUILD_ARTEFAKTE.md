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

Jedes Pages- und Target-Frontend erhält ein geschlossenes
`build-manifest.json` mit genau `profile`, `productVersion`, `revision` und
`artifactDigest`. Die Produktversion stammt aus `config/release.json`, die
Revision aus dem ausgecheckten Commit. Der Inhaltsdigest umfasst weiterhin die
Nutzlast ohne das Manifest; Version, Commit und Digest werden deshalb bei
Release und Security-Evidenz gemeinsam geprüft.

Die CycloneDX-Frontend-SBOM bezeichnet die Anwendung als
`pkg:generic/versorgungs-kompass-frontend@X.Y.Z`. Sie übernimmt dieselbe
Produktversion und bindet zusätzlich Buildprofil, Quellrevision und
Frontend-Digest. Die private npm-Workspace-Version aus `package.json` ist keine
Produktidentität.

Das Helm-Chart projiziert die zentrale Version gleichzeitig in
`Chart.version`, `Chart.appVersion` und `values.productVersion`. Gerenderte
Ressourcen und Pods tragen `app.kubernetes.io/version`; Deployment-Selektoren
bleiben bewusst versionsfrei. API- und pre-gematik-Public-Entry-Images tragen
dieselbe Version sowie Quellrevision und Repository in den standardisierten
OCI-Labels. Diese Labels ergänzen den unveränderlichen Image-Digest, ersetzen
ihn aber nicht. Die Quellkennung wird als kanonische HTTPS-Repository-URL ohne
Zugangsdaten gespeichert; lokale, unsichere oder credentialbehaftete Remotes
brechen den Build ab.

Das Produkt-Release-Paket übernimmt nur reguläre Dateien aus `dist/pages/`,
sortiert Pfade kanonisch und normalisiert Zeitstempel sowie Dateirechte. Das
Manifest im ZIP ist bytegleich mit dem eigenständigen Manifest und bestätigt
die zentrale Produktversion sowie den vollständigen Release-Commit. Der
`artifactDigest` wird aus dem tatsächlichen Pages-Inhalt nachgerechnet. Eine
versionsgebundene Domain sowie 64-Bit-Längenpräfixe für Dateizahl, UTF-8-Pfad
und Dateiinhalt binden dabei jede Dateigrenze eindeutig, auch wenn Binärdateien
NUL-Bytes enthalten;
`SHA256SUMS` enthält ausschließlich ZIP und Manifest. Lokale und erneut von
GitHub heruntergeladene Assets werden gegen denselben Vertrag geprüft.
