# Konfiguration der Auslieferungswege

Dieser Ordner beschreibt zwei Anwendungen mit klar getrennten Artefakten: die öffentliche Demo und die geschützte Realanwendung. Die Realanwendung hat zwei Auslieferungsstufen (`pre-gematik` und `target`), ist fachlich aber dieselbe Anwendung. Die Dateien `deployment.json` sind maschinenlesbare Verträge: Der Repository-Check prüft Buildprofil, Ausgabe, Freigabetor, Datenmodus und Deployment-Einstieg.

Technisch gibt es derzeit genau zwei GitHub-Environments: `github-pages` für die öffentliche Demo und `pre-gematik` für die manuell freigegebene GKE-Pre-Integration. Der spätere Zielbetrieb wird über die Software Factory freigegeben und benötigt deshalb kein zusätzliches GitHub-Environment.

| Anwendung / Stufe | Zweck | Buildausgabe | Freigabe und Auslieferung |
| --- | --- | --- | --- |
| [`pages-demo`](pages-demo/deployment.json) | öffentliche Demo mit ausschließlich synthetischen Daten und ohne Login | `dist/pages/` | automatisch über das GitHub-Environment `github-pages` |
| [`pre-gematik`](pre-gematik/deployment.json) | geschützte Realanwendung als technische GKE-Pre-Integration | `dist/target/` plus API-Image | nur manuell über das GitHub-Environment `pre-gematik` |
| [`target`](target/deployment.json) | dieselbe Realanwendung im künftigen gematik-Zielbetrieb | `dist/target/` plus API-Image | kontrolliert über die Software Factory |

`dist/pages/` und `dist/target/` enthalten dieselbe vollständige App-Oberfläche. Die Laufzeitgrenze bleibt trotzdem strikt: Pages lädt ausschließlich den lokalen, synthetischen Demo-Datensatz über den Demo-Adapter und enthält weder Anmeldung noch Supabase-Konfiguration oder geschützte Fachdaten. `dist/target/` enthält dagegen weder Demo-Route noch Demo-Datensatz oder statische Fachdaten-Fallbacks; fachliche Daten gelangen dort ausschließlich über das geschützte API in die Anwendung.

Die Profile enthalten keine Secrets. Reale Deploymentwerte fuer `pre-gematik` werden ausschliesslich als GitHub-Environment-Variablen beziehungsweise geschuetzte Environment-Secrets gepflegt; [`variables.env.example`](pre-gematik/variables.env.example) zeigt nur sichere Platzhalter und die fuer das Deployment erlaubten Variablennamen.

Ein Daten-, Storage- oder Identity-Migrationslauf ist davon getrennt. [`migration.env.example`](pre-gematik/migration.env.example) dokumentiert die dafuer benoetigten lokalen Operatorvariablen und verweist nur auf Platzhalter. Eine aufgeloeste Kopie, Verbindungs-URLs, Zugangsdaten, Projekt-, Bucket- und Binaer-Pins, Backup-IDs und Manifestpfade duerfen weder committed noch in das GitHub-Environment kopiert werden; sie werden nur in einer geschuetzten, kurzlebigen Operator-Session gesetzt. Schreibende Datenbank- und Identity-Laeufe starten den unabhaengig gepinnten offiziellen Cloud SQL Auth Proxy selbst fuer exakt die vom GCP-Gate bestaetigte Instanz. Das verbindliche Verfahren steht im [Supabase-Cloud-SQL-Migrationsplan](../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md).

Security-Konfigurationen liegen gebündelt unter [`security/`](security/README.md). Toolbedingt verbleibt nur `.semgrepignore` im Repository-Root.
