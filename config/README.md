# Konfiguration der Auslieferungswege

Dieser Ordner beschreibt zwei klar getrennte Artefaktpfade: die öffentliche Demo und den geschützten Target-Pfad. Der Target-Pfad hat die technischen Stufen `pre-gematik` und `target`, ist fachlich aber dieselbe Anwendung. **`target` ist ein Buildprofil, keine Aussage über Produktionsreife.** Seine nächste Nutzung ist ein gematik-interner Nutzungspilot mit einem freigegebenen Datenstand. Die Dateien `deployment.json` sind maschinenlesbare Verträge: Der Repository-Check prüft Buildprofil, Ausgabe, Freigabetor, Datenmodus und Deployment-Einstieg.

Technisch gibt es derzeit genau zwei GitHub-Environments: `github-pages` für die öffentliche Demo und `pre-gematik` für die manuell freigegebene GKE-Pre-Integration. Der gematik-PoC soll über die Software Factory aus einem unveränderlichen RC bereitgestellt werden und benötigt deshalb kein zusätzliches Environment im persönlichen GitHub-Repository.

| Anwendung / Stufe | Zweck | Buildausgabe | Freigabe und Auslieferung |
| --- | --- | --- | --- |
| [`pages-demo`](pages-demo/deployment.json) | öffentliche Demo mit ausschließlich synthetischen Daten und ohne Login | `dist/pages/` | automatisch über das GitHub-Environment `github-pages` |
| [`pre-gematik`](pre-gematik/deployment.json) | geschützter Target-Pfad als technische GKE-Pre-Integration | `dist/target/` plus API-Image | nur manuell über das GitHub-Environment `pre-gematik` |
| [`target`](target/deployment.json) | geschützter Target-Build für den gematik-PoC und einen späteren Zielpfad | `dist/target/` plus API-Image | kontrolliert aus einem festen RC über die Software Factory |

`dist/pages/` und `dist/target/` enthalten dieselbe vollständige App-Oberfläche. Die Laufzeitgrenze bleibt trotzdem strikt: Pages lädt ausschließlich den lokalen, synthetischen Demo-Datensatz über den Demo-Adapter und enthält weder Anmeldung noch Supabase-Konfiguration oder geschützte Fachdaten. `dist/target/` enthält dagegen weder Demo-Route noch Demo-Datensatz oder statische Fachdaten-Fallbacks; Daten gelangen dort ausschließlich über das geschützte API in die Anwendung. Für den aktuellen PoC gilt `approved-classes-only`: Ein bestätigter Datenstand wird getrennt vom Release in die geschützte PoC-Datenbank übernommen.

Die Profile enthalten keine Secrets. Reale Deploymentwerte für `pre-gematik` werden ausschließlich als GitHub-Environment-Variablen beziehungsweise geschützte Environment-Secrets gepflegt; [`variables.env.example`](pre-gematik/variables.env.example) zeigt nur sichere Platzhalter und die für das Deployment erlaubten Variablennamen.

Die Datenübernahme ist vom Release getrennt. [`migration.env.example`](pre-gematik/migration.env.example) gehört ausschließlich zum bestehenden GCP-Pfad und zeigt nur Platzhalter. Für den gematik-PoC werden Datenbankzugänge, OIDC-Subjects, Snapshot- und Bucketwerte nur in einer geschützten Operator-Sitzung gesetzt. Der wiederverwendbare Umfang und die noch plattformspezifischen Schritte stehen im [Datenvertrag](../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md).

Security-Konfigurationen liegen gebündelt unter [`security/`](security/README.md). Toolbedingt verbleibt nur `.semgrepignore` im Repository-Root.

[`release.json`](release.json) definiert die einmalige, datenschutzbereinigte
Baseline des öffentlichen Produkt-Release-Kanals. Spätere veröffentlichte
`vX.Y.Z`-Releases werden ausschließlich über ihre erreichbaren GitHub-Tags
fortgeschrieben; lokale Alt-Tags und `poc-v`-Tags beeinflussen diese Version
nicht.

## Gemeinsamer Markenvertrag

[`brand-architecture.json`](brand-architecture.json) hält Namen, Basisbeschreibung, Logo-Pfade und die Farbzuordnung der vier Produktmodule maschinenlesbar fest. Die redaktionellen Regeln und Freigabegrenzen stehen im [Markenkit](../dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).
