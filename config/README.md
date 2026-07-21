# Konfiguration der Auslieferungswege

Dieser Ordner beschreibt zwei klar getrennte Artefaktpfade: die oeffentliche Demo und den geschuetzten Target-Pfad. Der Target-Pfad hat die technischen Stufen `pre-gematik` und `target`, ist fachlich aber dieselbe Anwendung. **`target` ist ein Buildprofil, keine Aussage ueber Produktionsreife.** Seine naechste Nutzung ist ein befristeter gematik-interner PoC mit ausschliesslich synthetischen Daten; ein spaeterer Regelbetrieb benoetigt eine eigene Freigabe. Die Dateien `deployment.json` sind maschinenlesbare Vertraege: Der Repository-Check prueft Buildprofil, Ausgabe, Freigabetor, Datenmodus und Deployment-Einstieg.

Technisch gibt es derzeit genau zwei GitHub-Environments: `github-pages` fuer die oeffentliche Demo und `pre-gematik` fuer die manuell freigegebene GKE-Pre-Integration. Der gematik-PoC soll ueber die Software Factory aus einem unveraenderlichen RC bereitgestellt werden und benoetigt deshalb kein zusaetzliches Environment im persoenlichen GitHub-Repository.

| Anwendung / Stufe | Zweck | Buildausgabe | Freigabe und Auslieferung |
| --- | --- | --- | --- |
| [`pages-demo`](pages-demo/deployment.json) | öffentliche Demo mit ausschließlich synthetischen Daten und ohne Login | `dist/pages/` | automatisch über das GitHub-Environment `github-pages` |
| [`pre-gematik`](pre-gematik/deployment.json) | geschuetzter Target-Pfad als technische GKE-Pre-Integration | `dist/target/` plus API-Image | nur manuell ueber das GitHub-Environment `pre-gematik` |
| [`target`](target/deployment.json) | geschuetzter Target-Build fuer den gematik-PoC und einen spaeteren Zielpfad | `dist/target/` plus API-Image | kontrolliert aus einem festen RC ueber die Software Factory |

`dist/pages/` und `dist/target/` enthalten dieselbe vollstaendige App-Oberflaeche. Die Laufzeitgrenze bleibt trotzdem strikt: Pages laedt ausschliesslich den lokalen, synthetischen Demo-Datensatz ueber den Demo-Adapter und enthaelt weder Anmeldung noch Supabase-Konfiguration oder geschuetzte Fachdaten. `dist/target/` enthaelt dagegen weder Demo-Route noch Demo-Datensatz oder statische Fachdaten-Fallbacks; Daten gelangen dort ausschliesslich ueber das geschuetzte API in die Anwendung. Fuer den aktuellen PoC gilt zusaetzlich verbindlich `synthetic-only`, auch wenn das langfristige Target-Profil spaeter weitere freigegebene Datenklassen abbilden kann.

Die Profile enthalten keine Secrets. Reale Deploymentwerte fuer `pre-gematik` werden ausschliesslich als GitHub-Environment-Variablen beziehungsweise geschuetzte Environment-Secrets gepflegt; [`variables.env.example`](pre-gematik/variables.env.example) zeigt nur sichere Platzhalter und die fuer das Deployment erlaubten Variablennamen.

Ein Daten-, Storage- oder Identity-Migrationslauf ist davon getrennt. [`migration.env.example`](pre-gematik/migration.env.example) dokumentiert die dafuer benoetigten lokalen Operatorvariablen und verweist nur auf Platzhalter. Eine aufgeloeste Kopie, Verbindungs-URLs, Zugangsdaten, Projekt-, Bucket- und Binaer-Pins, Backup-IDs und Manifestpfade duerfen weder committed noch in das GitHub-Environment kopiert werden; sie werden nur in einer geschuetzten, kurzlebigen Operator-Session gesetzt. Schreibende Datenbank- und Identity-Laeufe starten den unabhaengig gepinnten offiziellen Cloud SQL Auth Proxy selbst fuer exakt die vom GCP-Gate bestaetigte Instanz. Das verbindliche Verfahren steht im [Supabase-Cloud-SQL-Migrationsplan](../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md).

Security-Konfigurationen liegen gebündelt unter [`security/`](security/README.md). Toolbedingt verbleibt nur `.semgrepignore` im Repository-Root.

## Gemeinsamer Markenvertrag

[`brand-architecture.json`](brand-architecture.json) hält Namen, Basisbeschreibung, Logo-Pfade und die Farbzuordnung der vier Produktmodule maschinenlesbar fest. Die redaktionellen Regeln und Freigabegrenzen stehen im [Markenkit](../dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).
