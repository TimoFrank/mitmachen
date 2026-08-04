# Gematik-PoC: interner Nutzungspilot

Status: Vorbereitung des internen Nutzungspiloten
Stand: 4. August 2026

Für die technische Übergabe ist die
[RC.5-Übergabenotiz](UEBERGABE_RC5_SOFTWARE_FACTORY.md) der kompakte Einstieg.

## Zweck

Ein festgelegter Release Candidate des Versorgungs-Kompasses wird über die Software Factory in einem internen Kubernetes-Namespace bereitgestellt. Ein bestätigter Datenstand aus der geschützten Anwendung `mitmachen.timo-frank.de` wird separat übernommen, damit ein kleiner Kreis aus gematik und Fachteam die Anwendung im bestehenden fachlichen Kontext erproben kann.

Der Versorgungs-Kompass ist dabei eine interne Anwendung für gematik-Mitarbeitende, keine TI-Anwendung und kein Gegenstand eines TI-Zulassungsverfahrens. Gesundheits-, Patienten- und identifizierende Falldaten sind ausgeschlossen.

Der PoC bleibt ein zeitlich begrenzter technischer und fachlicher Durchstich. Die Daten sind kein Bestandteil des Repositories, des Container-Images oder der Build-Artefakte.

```text
RC-Tag -> Software Factory -> Frontend und API -> interner Kubernetes-Namespace

geschützter Datenstand -> einmalige Übernahme -> PoC-Datenbank
gematik OIDC-Identität -> bestehendes oder neu angelegtes Profil
```

## Aktueller Stand

| Bereich | Stand |
| --- | --- |
| Quellstand | Der historische Tag `poc-v0.1.0-rc.5` liegt unveränderlich auf Commit `2e54916d626eccc90e7572b5bac958aafd54fd92`; Build-, Deployment- und Pilotnachweise stehen weiterhin aus |
| Anwendung | Providerneutraler OIDC-Target-Build, API-Container und Helm-Chart sind vorbereitet |
| Anmeldung | Der unterstützte Identity-Gateway-Vertrag ist beschrieben; Bestätigung durch die Plattformverantwortlichen und ein authentifizierter Smoke stehen noch aus |
| Daten | Schema und Datenklassen sind bekannt; der bisherige Importweg muss an die gematik-Datenbank und den gewählten Dateispeicher angebunden werden |
| Plattform | Namespace, Registry, interne URL, OIDC-Werte, Datenbank und Zugriffsweg für die Übernahme sind noch festzulegen |

## Benötigte Ressourcen

| Bereich | Bedarf für den PoC |
| --- | --- |
| Laufzeit | interner Non-Prod-Namespace, zunächst für vier bis sechs Wochen |
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

Der RC.5-Freeze überführt die seit RC.4 integrierten Anwendungsänderungen in den
providerneutralen Zielpfad. Der getaggte Stand ist noch nicht für ein Deployment
oder den Pilotstart freigegeben. Dafür müssen alle RC-Gates auf exakt diesem Tag
nachgewiesen sein; zusätzlich muss die gematik-Plattform bestätigen, dass ihr
Identity-Gateway den im Deployment-Runbook beschriebenen Bearer-Token-Vertrag
erfüllt. Ein Cookie-only-Gateway oder eine browserseitige OAuth-/PKCE-Anmeldung
wäre ein anderer Plattformadapter und erfordert vor dem Pilotstart eine neue
Patch-Version.

## Was das Entwicklungsteam liefert

- eine fest benannte Version mit Git-Commit, API-Image und fertigem Frontend-Artefakt,
- die Kubernetes-Konfiguration ohne Passwörter oder Tokens,
- Datenbankschema und Beschreibung des einmaligen Datenimports,
- ein Skript zur Zuordnung der gematik-Anmeldung zu einem Profil,
- Komponentenlisten für API und Frontend sowie
- die Ergebnisse der automatischen Build-, Security- und Smoke-Prüfungen.

## Verantwortung während des PoC

| Aufgabe | Verantwortung |
| --- | --- |
| Anwendung und verwendete Bibliotheken | Das Entwicklungsteam bewertet neue Befunde, erstellt Korrekturen und liefert eine neue Patch-Version als Release Candidate. |
| Namespace, OIDC, Datenbank und zentrale Scanner | Die gematik-IT stellt die vereinbarten Plattformressourcen und die Ergebnisse der Software Factory bereit. |
| Nutzerkreis und freigegebener Datenumfang | Die fachlich verantwortliche Person bestätigt Personen und Datenklassen. |
| Fortführung nach der Auswertung | Entwicklung, IT und Fachteam entscheiden gemeinsam über den nächsten Schritt. |

Vor dem Start werden für Anwendung und Plattform je eine Kontaktperson benannt. Neue Schwachstellen werden anhand der tatsächlichen PoC-Nutzung bewertet. Bei einem relevanten hohen oder kritischen Befund kann die Nutzung pausieren, bis ein aktualisierter RC bereitsteht. Damit bleibt die Wartung ein klar abgegrenzter Teil des Piloten.

## Daten und Zugriff

Die Übernahme verwendet einen einmaligen, bestätigten Snapshot des aktuellen geschützten Bestands. Importiert werden nur die vereinbarten Fachtabellen; persönliche IAP-Zuordnungen, Systemtabellen und Zugangsdaten werden nicht übernommen. OIDC-Subjects und Profilzuordnungen bleiben in einer geschützten Operator-Sitzung und außerhalb von Git und Jenkins-Artefakten.

Zugriff erhalten nur benannte Personen aus gematik und Fachteam, die den übernommenen Inhalt einschließlich freier Notizen und Hospitationsbeobachtungen für ihre Arbeit sehen dürfen. Admin ist keine Standardrolle. Gesundheits-, Patienten- oder identifizierende Falldaten sind nicht Teil des PoC.

Während des Testzeitraums ist der gematik-PoC der gemeinsame bearbeitbare Bestand. `mitmachen.timo-frank.de` bleibt geschützte Ausgangs- und Rückfallquelle, wird aber nicht parallel für dieselben fachlichen Änderungen genutzt. Eine automatische oder wechselseitige Synchronisation ist nicht vorgesehen.

## Release und parallele Weiterentwicklung

Für neue Releases bleibt der signierte Quelltag unverändert. Frontend und API
werden aus demselben Commit gebaut und über Manifest beziehungsweise
Image-Digest eindeutig zugeordnet. Änderungen auf `main`, in Feature-Branches,
in lokalen Varianten oder auf GitHub Pages können parallel weiterlaufen. Diese
Wege verwenden keine Echtdaten aus dem PoC. Benötigt der PoC eine
Softwareänderung, entsteht eine neue Patch-Version mit eigenem `vX.Y.Z`-Tag.
„Release Candidate“ ist dabei Release-Metadatum, kein Tag-Suffix. Der aktuelle
Legacy-RC.5 ist dagegen annotiert, aber unsigniert, und wird nicht nachsigniert.
Der vollständige Zukunftsvertrag steht im
[Produkt-Release-Prozess](PRODUKT_RELEASE_PROZESS.md).

Die annotierten Legacy-Tags `poc-v0.1.0-rc.4` und
`poc-v0.1.0-rc.5` bleiben unverändert auf ihren historischen Commits. Sie
werden weder nachsigniert noch in das neue Namensschema überführt. Die
persönlichen GKE-Artefakte werden nicht in den Zielpfad promotet.

## Erfolgskriterien

Der Durchstich ist abgeschlossen, wenn:

1. der RC in der Software Factory reproduzierbar gebaut wurde,
2. die interne HTTPS-Adresse und die OIDC-Anmeldung funktionieren,
3. der vereinbarte Datenstand ohne Demo-Daten übernommen und durch Mengen sowie eine nicht personenbezogene Prüfsumme bestätigt wurde,
4. mindestens eine Lese- und eine Schreibrolle den vereinbarten Kernablauf nutzen kann,
5. unbekannte Identitäten abgewiesen werden und
6. derselbe RC erneut bereitgestellt werden kann, ohne den Datenimport automatisch zu wiederholen.

## Technische Unterlagen

- [RC.5-Freeze und Übergabe an die Software Factory](UEBERGABE_RC5_SOFTWARE_FACTORY.md)
- [Deployment-Runbook für Kubernetes](DEPLOYMENT_GEMATIK_K8S.md)
- [Datenbank und Datenübernahme](../../deploy/postgres/poc-gematik/README.md)
- [Aktueller Datenweg und historischer Providerwechsel](SUPABASE_CLOUD_SQL_MIGRATION.md)
- [API-Vertrag](../architektur/API_CONTRACT.md)
- [Sicherheitsrichtlinie](../../SECURITY.md)
