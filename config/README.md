# Konfiguration der Auslieferungswege

Dieser Ordner beschreibt drei getrennte Auslieferungskanäle: die öffentliche
Pages-Demo, das private GKE mit GCP/IAP und den gematik-Zielpfad mit OIDC. Die
beiden geschützten Kanäle verwenden denselben Quellbestand und Target-Buildpfad,
aber getrennte Deploymentprofile; sie sind weder baugleich noch gegenseitig
promotierbar. **`target` ist ein Buildprofil,
keine Aussage über Produktionsreife.** Seine nächste Nutzung ist ein
gematik-interner Nutzungspilot mit einem freigegebenen Datenstand. Die Dateien
`deployment.json` sind maschinenlesbare Verträge: Der Repository-Check prüft
Buildprofil, Ausgabe, Freigabetor, Datenmodus und Deployment-Einstieg.

Technisch gibt es derzeit genau zwei GitHub-Environments: `github-pages` für
die öffentliche Demo und `pre-gematik` für die manuell freigegebene
GKE-Pre-Integration. Das im Release-Workflow referenzierte dritte Environment
`release-signing` wird erst bei der abschließenden Signaturabnahme mit genau
einem privaten Ed25519-Signiersubkey, dem Stub des offline gehaltenen
Certify-only-Primary-Keys und der Passphrase provisioniert. Ein getrenntes,
ablaufendes Fine-grained-PAT-Secret mit ausschließlich `Administration: read`
für dieses Repository erlaubt dort zusätzlich den read-only Nachweis von
Release-Immutability und Branchschutz; es wird nicht für Inhaltsänderungen
verwendet und nicht an npm, Repository-Skripte oder Mutationsschritte
weitergegeben.
Der zugehörige öffentliche Schlüssel, der exakte Subkey-Fingerprint und die
Signer-Identität liegen als nicht geheime Repository-Variablen für die
unabhängige Verifikation bereit; bis dahin bleibt die Veröffentlichung über den
Publish-Schalter gesperrt. Neue
Target-Versionen ab `v0.23.0` werden über die Software
Factory und später GitLab frisch aus einem unveränderlichen, signierten
Quelltag gebaut und benötigen deshalb kein zusätzliches Environment im
persönlichen GitHub-Repository. Der vorhandene Legacy-RC.5 bleibt davon
ausgenommen: Sein Tag ist annotiert, aber unsigniert, und wird nicht
nachsigniert.

| Anwendung / Stufe | Zweck | Buildausgabe | Freigabe und Auslieferung |
| --- | --- | --- | --- |
| [`pages-demo`](pages-demo/deployment.json) | öffentliche Demo mit synthetischen CRM-/Fachdaten, kuratiertem Amtsträger-Verzeichnis und ohne Login | `dist/pages/` | automatisch über das GitHub-Environment `github-pages` |
| [`pre-gematik`](pre-gematik/deployment.json) | geschützter Target-Pfad als technische GKE-Pre-Integration | `dist/target/` plus API-Image | nur manuell über das GitHub-Environment `pre-gematik` |
| [`target`](target/deployment.json) | geschützter Target-Build für den gematik-PoC und einen späteren Zielpfad | `dist/target/` plus API-Image | kontrolliert aus einem festen RC über die Software Factory |

`pre-gematik` ist der getrennte GCP-/IAP-Referenzpfad und kann das dortige Identity-Platform-Portal enthalten. `target` baut dagegen ein providerneutrales internes OIDC-Artefakt ohne Google-Identity-Platform-, Firebase- oder Portaldateien. OIDC-Issuer, Audience und JWKS bleiben Laufzeitkonfiguration der API.

`dist/pages/` und `dist/target/` enthalten dieselbe vollständige App-Oberfläche. Die Laufzeitgrenze bleibt trotzdem strikt: Pages lädt den lokalen, synthetischen Demo-Datensatz über den Demo-Adapter sowie ausschließlich für Politik einen feldminimierten Snapshot öffentlicher Bundestagsangaben. Dieser Snapshot enthält keine CRM-Felder, höchstens eine repräsentative PLZ je Person und keine Bild-URL bei ausstehender Rechteprüfung. Pages enthält weder Anmeldung noch Supabase-Konfiguration oder geschützte Fachdaten. `dist/target/` enthält dagegen weder Demo-Route, Demo-Datensatz noch den statischen Politik-Snapshot; Daten gelangen dort ausschließlich über das geschützte API in die Anwendung. Für den aktuellen PoC gilt `approved-classes-only`: Ein bestätigter Datenstand wird getrennt vom Release in die geschützte PoC-Datenbank übernommen.

Die Profile enthalten keine Secrets. Reale Deploymentwerte für `pre-gematik` werden ausschließlich als GitHub-Environment-Variablen beziehungsweise geschützte Environment-Secrets gepflegt; [`variables.env.example`](pre-gematik/variables.env.example) zeigt nur sichere Platzhalter und die für das Deployment erlaubten Variablennamen.

Die operativen Vorlagen für Einladungen zum geschützten Testzugang liegen unter [`pre-gematik/email/`](pre-gematik/email/). Sie enthalten ausschließlich Platzhalter und freigegebene Markenassets, keine Empfänger- oder Zugangsdaten.

Die Datenpflege ist vom Release getrennt. Der operative Datenbestand liegt ausschließlich in Cloud SQL/PostgreSQL; private Anwendungsobjekte liegen ausschließlich in GCS. Für den gematik-PoC werden Datenbankzugänge, OIDC-Subjects, Snapshot- und Bucketwerte nur in einer geschützten Operator-Sitzung gesetzt. Der abgeschlossene Providerwechsel bleibt als [historischer Herkunfts- und Prüfvertrag](../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md) nachvollziehbar, ist aber kein aktuelles Import-Runbook. Eine gegebenenfalls noch ausstehende Abschaltung externer Provider-Ressourcen erfolgt separat vom Repository- und Releaseprozess.

Security-Konfigurationen liegen gebündelt unter [`security/`](security/README.md). Toolbedingt verbleibt nur `.semgrepignore` im Repository-Root.

[`release.json`](release.json) definiert die zentrale Produktversion und den
gemeinsamen Releasevertrag. Neue Quellstände verwenden kanalübergreifend genau
einen signierten Tag `vX.Y.Z`; Kanal und Buildvariante stehen im jeweiligen
Manifest. Die Baseline bleibt für die Herkunft erhalten. Historische
`v0.21.0`, `v0.22.0` und `poc-v…-rc.N` werden weder umbenannt noch nachsigniert
und beeinflussen das künftige Namensschema nicht.

Die Versionsangabe in `package.json` gehört nur zum privaten npm-Arbeitsbereich
und ist weder Produktversion noch Freigabe für GitHub Packages. Für Produkt,
Git-Tag, Release Notes, Build-Manifeste, Frontend-SBOM, Helm-Chart und
Anwendungsimages ist ausschließlich `release.json.productVersion` führend.
Der Release-Planer projiziert denselben Wert in `Chart.version`,
`Chart.appVersion` und `values.yaml.productVersion`; manuelle Abweichungen
stoppen die Repository- und Release-Prüfung.

## Gemeinsamer Markenvertrag

[`brand-architecture.json`](brand-architecture.json) hält Absender, Namen, Logo-Pfade und die Farbzuordnung der vier gleichrangigen Marken maschinenlesbar fest. Die redaktionellen Regeln und Freigabegrenzen stehen im [Markenkit](../dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).
