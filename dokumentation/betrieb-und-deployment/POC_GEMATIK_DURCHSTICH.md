# Gematik-PoC: interner Nutzungspilot

Status: Vorbereitung der befristeten internen Testumgebung
Stand: 22. Juli 2026

## Zweck

Ein festgelegter Release Candidate des Versorgungs-Kompasses wird über die Software Factory in einem internen Kubernetes-Namespace bereitgestellt. Ein bestätigter Datenstand aus der geschützten Anwendung `mitmachen.timo-frank.de` wird separat übernommen, damit ein kleiner Kreis von Kolleginnen und Kollegen die Anwendung im bestehenden fachlichen Kontext erproben kann.

Der PoC bleibt ein zeitlich begrenzter technischer und fachlicher Durchstich. Die Daten sind kein Bestandteil des Repositories, des Container-Images oder der Build-Artefakte.

```text
RC-Tag -> Software Factory -> Frontend und API -> interner Kubernetes-Namespace

geschützter Datenstand -> einmalige Übernahme -> PoC-Datenbank
gematik OIDC-Identität -> bestehendes oder neu angelegtes Profil
```

## Aktueller Stand

| Bereich | Stand |
| --- | --- |
| Quellstand | `poc-v0.1.0-rc.2` bezeichnet den bereitgestellten RC-Stand |
| Anwendung | Target-Frontend, API-Container und Helm-Chart sind vorbereitet |
| Anmeldung | OIDC wird von der API geprüft; unbekannte Identitäten werden abgewiesen |
| Daten | Schema und Datenklassen sind bekannt; der bisherige Importweg muss an die gematik-Datenbank und den gewählten Dateispeicher angebunden werden |
| Plattform | Namespace, Registry, interne URL, OIDC-Werte, Datenbank und Zugriffsweg für die Übernahme sind noch festzulegen |

## Benötigte Ressourcen

| Bereich | Bedarf für den PoC |
| --- | --- |
| Laufzeit | befristeter interner Non-Prod-Namespace, zunächst für vier bis sechs Wochen |
| Build und Registry | Software-Factory-Job sowie Ablage für das API-Image |
| Frontend und Routing | internes HTTPS; `/` für das Frontend und `/api` für die API |
| Anmeldung | OIDC-Werte und eine kleine, benannte Nutzergruppe |
| Datenbank | dedizierte PostgreSQL-16-Datenbank mit verschlüsselter Verbindung |
| Datenübernahme | kurzlebiger, geschützter Zugriff auf den aktuellen Datenstand und die Ziel-Datenbank |
| Dateien | optional privater Objektspeicher für vorhandene Bilder und Anhänge; der aktuelle Code verwendet die Google-Cloud-Storage-API |
| Konfiguration | zentrale Bereitstellung der Datenbank- und OIDC-Geheimnisse |
| Abstimmung | je eine Ansprechperson für Plattform, Identity und fachlichen Datenumfang |
| Zeitraum | gemeinsamer Termin zur Bewertung oder Beendigung des Piloten |

Für den ersten Durchstich genügt eine API-Instanz. Neue Datei- und Bild-Uploads bleiben deaktiviert. Fehlt ein passender Objektspeicher, wird zunächst nur der strukturierte Datenbestand übernommen; Datei-Verweise werden dabei nicht als funktionierend ausgewiesen.

## Was das Entwicklungsteam liefert

- RC-Tag, Git-Commit, API-Image und Frontend-Manifest
- Helm-Chart und PoC-Konfiguration ohne Passwörter oder Tokens
- Datenbankschema und Liste der zu übernehmenden Datenklassen
- Werkzeug und Anleitung für die einmalige Datenübernahme, sobald Datenbank- und Speicherweg feststehen
- SQL-Skript für die eindeutige Zuordnung von OIDC-Identitäten zu Profilen
- Ergebnisse der Build-, Sicherheits- und Smoke-Prüfungen

## Daten und Zugriff

Die Übernahme verwendet einen einmaligen, bestätigten Snapshot des aktuellen geschützten Bestands. Importiert werden nur die vereinbarten Fachtabellen; persönliche IAP-Zuordnungen, Systemtabellen und Zugangsdaten werden nicht übernommen. OIDC-Subjects und Profilzuordnungen bleiben in einer geschützten Operator-Sitzung und außerhalb von Git und Jenkins-Artefakten.

Zugriff erhalten nur benannte Kolleginnen und Kollegen, die den übernommenen Inhalt einschließlich freier Notizen und Hospitationsbeobachtungen für ihre Arbeit sehen dürfen. Admin ist keine Standardrolle. Patienten- oder identifizierende Falldaten sind nicht Teil des PoC.

Während des Testzeitraums ist der gematik-PoC der gemeinsame bearbeitbare Bestand. `mitmachen.timo-frank.de` bleibt geschützte Ausgangs- und Rückfallquelle, wird aber nicht parallel für dieselben fachlichen Änderungen genutzt. Eine automatische oder wechselseitige Synchronisation ist nicht vorgesehen.

## Release und parallele Weiterentwicklung

Der RC-Tag bleibt unverändert. Frontend und API werden aus demselben Commit gebaut und über Manifest beziehungsweise Image-Digest eindeutig zugeordnet. Änderungen auf `main`, in Feature-Branches, in lokalen Varianten oder auf GitHub Pages können parallel weiterlaufen. Diese Wege verwenden keine Echtdaten aus dem PoC. Benötigt der PoC eine Softwareänderung, entsteht ein neuer RC-Tag.

## Erfolgskriterien

Der Durchstich ist abgeschlossen, wenn:

1. der RC in der Software Factory reproduzierbar gebaut wurde,
2. die interne HTTPS-Adresse und die OIDC-Anmeldung funktionieren,
3. der vereinbarte Datenstand ohne Demo-Daten übernommen und durch Mengen sowie eine nicht personenbezogene Prüfsumme bestätigt wurde,
4. mindestens eine Lese- und eine Schreibrolle den vereinbarten Kernablauf nutzen kann,
5. unbekannte Identitäten abgewiesen werden und
6. derselbe RC erneut bereitgestellt werden kann, ohne den Datenimport automatisch zu wiederholen.

## Technische Unterlagen

- [Deployment-Runbook für Kubernetes](DEPLOYMENT_GEMATIK_K8S.md)
- [Datenbank und Datenübernahme](../../deploy/postgres/poc-gematik/README.md)
- [Bestehender Datenvertrag und Herkunft](SUPABASE_CLOUD_SQL_MIGRATION.md)
- [API-Vertrag](../architektur/API_CONTRACT.md)
- [Sicherheitsrichtlinie](../../SECURITY.md)
