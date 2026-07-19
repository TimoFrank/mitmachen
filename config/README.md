# Konfiguration der Auslieferungswege

Dieser Ordner beschreibt zwei Anwendungen mit klar getrennten Artefakten: die öffentliche Demo und die geschützte Realanwendung. Die Realanwendung hat zwei Auslieferungsstufen (`pre-gematik` und `target`), ist fachlich aber dieselbe Anwendung. Die Dateien `deployment.json` sind maschinenlesbare Verträge: Der Repository-Check prüft Buildprofil, Ausgabe, Freigabetor, Datenmodus und Deployment-Einstieg.

Technisch gibt es derzeit genau zwei GitHub-Environments: `github-pages` für die öffentliche Demo und `pre-gematik` für die manuell freigegebene GKE-Pre-Integration. Der spätere Zielbetrieb wird über die Software Factory freigegeben und benötigt deshalb kein zusätzliches GitHub-Environment.

| Anwendung / Stufe | Zweck | Buildausgabe | Freigabe und Auslieferung |
| --- | --- | --- | --- |
| [`pages-demo`](pages-demo/deployment.json) | öffentliche Demo mit ausschließlich synthetischen Daten und ohne Login | `dist/pages/` | automatisch über das GitHub-Environment `github-pages` |
| [`pre-gematik`](pre-gematik/deployment.json) | geschützte Realanwendung als technische GKE-Pre-Integration | `dist/target/` plus API-Image | nur manuell über das GitHub-Environment `pre-gematik` |
| [`target`](target/deployment.json) | dieselbe Realanwendung im künftigen gematik-Zielbetrieb | `dist/target/` plus API-Image | kontrolliert über die Software Factory |

`dist/pages/` folgt einer engen Positivliste und enthält weder Anmeldung noch Supabase-Konfiguration, Realanwendung, Expertenkreis- oder Stakeholder-Daten. `dist/target/` enthält die geschützte Realanwendung, aber keine Demo-Route, keinen Demo-Datensatz und keine statischen Fachdaten-Fallbacks. Fachliche Daten gelangen dort ausschließlich über das geschützte API in die Anwendung.

Die Profile enthalten keine Secrets. Reale Werte für `pre-gematik` werden ausschließlich als GitHub-Environment-Variablen gepflegt; [`variables.env.example`](pre-gematik/variables.env.example) zeigt nur sichere Platzhalter und die erlaubten Namen.

Security-Konfigurationen liegen gebündelt unter [`security/`](security/README.md). Toolbedingt verbleibt nur `.semgrepignore` im Repository-Root.
