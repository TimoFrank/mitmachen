# RC.5-Freeze und Übergabe an die Software Factory

- **Status:** Legacy-Freeze und annotierter Remote-Tag festgelegt;
  Software-Factory-Build, Deployment und Pilotstart ausstehend
- **Stand:** 4. August 2026

> Dieses Dokument bleibt die historische RC.5-Evidenz. Sein Tag- und
> Versionsschema wird nicht auf neue Releases übertragen. Ab `v0.23.0` gilt der
> [Produkt-Release-Prozess](PRODUKT_RELEASE_PROZESS.md).

## Verbindlicher Freeze-Vertrag

| Nachweis | Wert |
| --- | --- |
| Quell-Repository | `https://github.com/TimoFrank/mitmachen` |
| Historischer annotierter RC-Tag | `poc-v0.1.0-rc.5` |
| Integrierte Anwendungsbasis | `e6e8fc35b2502abcfe5ee40718189d5a0f4da25d` |
| Formaler RC.5-Commit | `2e54916d626eccc90e7572b5bac958aafd54fd92` |
| RC.5-Build- und Security-Nachweise | ausstehend; müssen auf dem exakten getaggten Commit entstehen |
| Anwendung | interner Nutzungspilot für benannte gematik-Mitarbeitende |
| Freigabestatus | nicht deployment- oder pilotstart-freigegeben |

Der bisherige annotierte Tag `poc-v0.1.0-rc.4` bleibt unverändert auf Commit
`7e0d7d133278cc3f86ad9e73c15d592cb838cf58`. Der historische RC.5-Tag liegt
unveränderlich auf Commit
`2e54916d626eccc90e7572b5bac958aafd54fd92` in `origin/main`. Er wird weder
verschoben, umbenannt noch nachsigniert. Noch ausstehende RC.5-Nachweise müssen
sich weiterhin exakt auf diesen Tag und Commit beziehen.

Der Versorgungs-Kompass ist keine TI-Anwendung und kein Gegenstand eines
TI-Zulassungsverfahrens. Gesundheits-, Patienten- und identifizierende
Falldaten sind ausgeschlossen. Externe Kontakte wie Arztpraxen,
Krankenhäuser oder Apotheken werden in der Anwendung verwaltet, erhalten aber
keinen eigenen Zugang.

## Nachgewiesene GKE-Herkunft

Der erfolgreiche GKE-Lauf vom 3. August 2026 ist Herkunftsevidenz für die
Anwendungsbasis, aber kein RC.5-Gate und kein gematik-Artefakt:

| GKE-Nachweis | Wert |
| --- | --- |
| Deployment-Lauf | [`30810219518`](https://github.com/TimoFrank/mitmachen/actions/runs/30810219518), erfolgreich abgeschlossen |
| Quellrevision | `e6e8fc35b2502abcfe5ee40718189d5a0f4da25d` |
| GKE-Release | `gke-paket-wegweiser-3-20260803-1` |
| Frontend-Artefakt-Digest | `sha256:e6ace55f2a798602d11a10b34e75d9c26cc29b9dd5e722851516f9d6b88519a4` |
| API-Image-Digest | `sha256:77a4daf95981699eec69499905e09ebae07361ae77ae96674bc2185f357d14b4` |
| Public-Entry-Image-Digest | `sha256:64da9bef0df1b198e6e69d2f20ade2c112725678a9baeb6c763909611e5630f0` |

Die bei der Prüfung sichtbaren GKE-Deployment-Labels trugen noch die
RC.4-Chart- und App-Version. Dieser Freeze hebt deshalb Chart, App-Version und
PoC-Image-Tag gemeinsam auf RC.5. Der GKE-Lauf belegt den Zustand zum
Laufzeitpunkt; er ist kein dauerhafter Nachweis des späteren Clusterzustands.

GKE verwendet den getrennten GCP-/IAP-Pre-Integrationspfad. Seine Images und
Frontend-Artefakte werden weder umgetaggt noch in die gematik-Registry
promotet. Die Software Factory baut das providerneutrale OIDC-Frontend und das
API-Image frisch aus dem getaggten RC.5-Commit und weist dafür neue,
zusammengehörige Digests nach.

## Inhalt von RC.5 gegenüber RC.4

Die GKE-Quellrevision liegt vollständig in `origin/main` und enthält 13
Integrationscommits nach RC.4:

- QA-Baseline nach RC.3 wiederherstellen ([#208](https://github.com/TimoFrank/mitmachen/pull/208)),
- Stakeholder-Übersichtslandkarte ([#206](https://github.com/TimoFrank/mitmachen/pull/206)),
- dauerhaft verankerten Sidebar-Menüschalter ([#209](https://github.com/TimoFrank/mitmachen/pull/209)),
- operative Hospitationsübersicht und verdichtete Kontextaktionen
  ([#210](https://github.com/TimoFrank/mitmachen/pull/210),
  [#216](https://github.com/TimoFrank/mitmachen/pull/216)),
- vereinheitlichte Listenwerkzeuge und Stakeholder-Navigation
  ([#211](https://github.com/TimoFrank/mitmachen/pull/211)),
- optimierte mobile Politik- und Pressewerkzeuge
  ([#214](https://github.com/TimoFrank/mitmachen/pull/214)),
- Versorgungsübersicht und TI-Kartenstil
  ([#215](https://github.com/TimoFrank/mitmachen/pull/215),
  [#219](https://github.com/TimoFrank/mitmachen/pull/219)),
- überarbeitete Benachrichtigungs-Inbox und zugehörige API-Anpassungen
  ([#217](https://github.com/TimoFrank/mitmachen/pull/217)),
- GKE-/IAP-spezifische Login-Härtung
  ([#218](https://github.com/TimoFrank/mitmachen/pull/218)),
- deutsche PR- und Commit-Beschreibungen
  ([#220](https://github.com/TimoFrank/mitmachen/pull/220)) sowie
- geordneten Repository-Root ([#221](https://github.com/TimoFrank/mitmachen/pull/221)).

Die Login-Härtung ist im gemeinsamen Repository enthalten, gehört aber nicht
zum gebauten OIDC-Target-Artefakt. Der getaggte Freeze ergänzt auf der genannten
Anwendungsbasis ausschließlich RC.5-Metadaten und Übergabeunterlagen. Spätere
Commits in `origin/main` verändern RC.5 nicht; eine Softwarekorrektur benötigt
eine neue, nach dem aktuellen Produkt-Release-Vertrag benannte Version.

## Technische Freeze-Pins

Die drei zueinander gehörenden Werte lauten:

| Pfad | Sollwert |
| --- | --- |
| `deploy/helm/versorgungs-kompass/Chart.yaml` | `version: 0.4.0-rc.5` |
| `deploy/helm/versorgungs-kompass/Chart.yaml` | `appVersion: "0.1.0-rc.5"` |
| `deploy/helm/versorgungs-kompass/values-poc-gematik.yaml` | `tag: poc-v0.1.0-rc.5` |

Die Jenkins-Referenzpipeline prüft zusätzlich, dass genau ein annotierter
Remote-Tag am Build-Commit liegt, der Commit in `origin/main` enthalten ist und
Tag, Chart-Version, App-Version sowie Image-Tag zusammenpassen.

Vor dem Start in der Software Factory muss der vorhandene Remote-Tag nach dem
Fetch mindestens so verifiziert werden:

```bash
git fetch --prune --tags origin
git cat-file -t refs/tags/poc-v0.1.0-rc.5
git rev-parse poc-v0.1.0-rc.5^{}
git merge-base --is-ancestor poc-v0.1.0-rc.5^{} origin/main
git tag --points-at poc-v0.1.0-rc.5^{}
```

Erwartet werden der Objekttyp `tag`, genau dieser eine RC-Tag und derselbe
Commit für Build, Frontend-Manifest, API-Image, SBOMs und Security-Nachweise.

## Ziel der ersten technischen Übergabe

Der erste gemeinsame Schritt ist bewusst auf Repository- und Build-Integration
begrenzt:

1. Repository-Historie und den vorhandenen einzelnen annotierten RC.5-Tag
   unverändert in das Git-Repository der Software Factory übernehmen oder dort
   referenzieren.
2. Jenkins-Pipeline, Target-Frontend, API-Image und Helm-Chart reproduzierbar
   aus genau diesem Tag bauen und die vorhandenen Prüfungen anbinden.
3. Ergebnisse der zentralen Scanner als echte Software-Factory-Nachweise
   erfassen.
4. Noch kein Deployment, keinen Datenimport und keine OIDC-Zuordnung
   durchführen, bis Plattform und Identity gemeinsam bestätigt sind.

Ein ZIP des Arbeitsordners ist kein Übergabeartefakt. Es verliert Tag- und
Historiennachweise und kann lokale oder unversionierte Dateien enthalten. Auch
`dist/pages/`, Datenexporte, Zugangsdaten, OIDC-Subjects und interne
Plattformwerte gehören nicht in das Übergabepaket.

## Schmale Repo-Landkarte

| Zweck | Führender Pfad |
| --- | --- |
| Fachlicher Umfang und Status | [`POC_GEMATIK_DURCHSTICH.md`](POC_GEMATIK_DURCHSTICH.md) |
| Technisches Vorgehen | [`DEPLOYMENT_GEMATIK_K8S.md`](DEPLOYMENT_GEMATIK_K8S.md) |
| Target-Vertrag | [`../../config/target/deployment.json`](../../config/target/deployment.json) |
| Frontend-Quellen | [`../../frontend/`](../../frontend/) und [`../../public/`](../../public/) |
| API und Container | [`../../api/`](../../api/) und [`../../api/Dockerfile`](../../api/Dockerfile) |
| Jenkins-Referenzpipeline | [`../../deploy/jenkins/Jenkinsfile.gematik`](../../deploy/jenkins/Jenkinsfile.gematik) |
| Kubernetes-Chart | [`../../deploy/helm/versorgungs-kompass/`](../../deploy/helm/versorgungs-kompass/) |
| PoC-Overlay | [`../../deploy/helm/versorgungs-kompass/values-poc-gematik.yaml`](../../deploy/helm/versorgungs-kompass/values-poc-gematik.yaml) |
| PostgreSQL und Datenübernahme | [`../../deploy/postgres/poc-gematik/README.md`](../../deploy/postgres/poc-gematik/README.md) |
| Automatische Nachweise | [`../../scripts/`](../../scripts/), [`../../tests/`](../../tests/) und [`../../config/security/`](../../config/security/) |

Nicht zum gematik-Zielpfad gehören die öffentliche Pages-Demo,
`config/pre-gematik`, die GCP-/IAP-/Terraform-Pre-Integration, das
GKE-/IAP-Identity-Portal, öffentliche Produkt-Releases sowie Design- und
Historienmaterial. Automatische Prüfungen sichern anhand ihrer Trennung ab,
dass sie nicht in das Target-Artefakt gelangen. Cloud Run ist kein
vorgesehener Zielweg.

## Offene Entscheidungen mit der Plattform-IT

### Laufzeit und Quellweg

- Wird der beschriebene Shared-Kubernetes-Namespace verwendet oder die
  alternative interne Docker-Plattform?
- Liest Jenkins GitHub direkt oder wird die Historie einschließlich `main` und
  des einzelnen annotierten RC.5-Tags unverändert gespiegelt?
- Wo liegen Jenkins-Job, Container-Registry, Frontend-Artefakt und
  Release-Nachweise?

Jenkins, Kubernetes und Helm sind vorbereitet. Bei einer anderen Laufzeit
bleiben statisches Frontend, API-Container und PostgreSQL-Vertrag nutzbar; der
Auslieferungsadapter muss gegen die konkrete Plattform geprüft werden.

### Frontend, Routing und Netzwerk

- Welche interne HTTPS-Adresse und welches TLS-Verfahren werden verwendet?
- Wie wird das unveränderliche `dist/target/`-Frontend bereitgestellt?
- Können Frontend unter `/` und API unter `/api` same-origin zusammengeführt
  werden?
- Welche Gateway- oder Ingress-CIDRs ersetzen die absichtlich fail-closed
  gesetzten Beispielwerte des PoC-Overlays?

### Identity

Die entscheidende Ja-/Nein-Frage lautet:

> Kann das institutionelle Gateway nach erfolgreicher Anmeldung ein frisch
> geprüftes, signiertes JWT als `Authorization: Bearer <JWT>` an die nicht
> direkt erreichbare API setzen, eingehende Identitätsheader entfernen und die
> vereinbarten Werte für Issuer, Audience, JWKS sowie `sub` bereitstellen?

Ein Cookie-only-Gateway oder eine browserseitige OAuth-/PKCE-Anmeldung ist
nicht durch RC.5 abgedeckt und benötigt einen eigenen Plattformadapter sowie
einen weiteren RC. Eine interne Netzgrenze kann ergänzen, ersetzt aber weder
die OIDC-Prüfung noch die fachlichen Rollen.

### PostgreSQL und Secrets

Benötigt werden eine dedizierte PostgreSQL-16-Datenbank, TLS-Verbindung,
eingeschränkte Laufzeitrolle, Passwort-Secret sowie der geschützte Adminzugang
für Schema und einmalige Übernahme. Hostnamen, Kennwörter, Zertifikate und
Subjects werden nur im Secret-Management beziehungsweise in einer geschützten
Operator-Sitzung gesetzt.

### Zentrale Prüfungen

Zu bestätigen sind die verbindlichen Software-Factory-Gates und ihre
Nachweisorte. Im Repository vorbereitet sind insbesondere die Übergaben an
SonarQube, Snyk, Dependency-Track und Cosign. Bis zur tatsächlichen Anbindung
bleiben diese Ergebnisse korrekt `not-run`; sie werden nicht manuell als
bestanden eingetragen.

## Nutzer, Rollen und Verantwortung

Zwei Personenkreise werden getrennt geführt:

1. **Projektmitarbeitende:** Personen mit Zugriff auf Repository, Jenkins und
   Software-Factory-Ressourcen.
2. **Pilotnutzende:** benannte gematik-Mitarbeitende, deren OIDC-Identität
   einem aktiven Anwendungsprofil zugeordnet wird.

Die Anwendung kennt drei Rollen:

| Rolle | Verwendung im kleinen Pilot |
| --- | --- |
| `viewer` | Lesen sowie persönliche Einstellungen und Ansichten |
| `editor` | vereinbarte fachliche Schreibabläufe |
| `admin` | Import, Export, Löschen und Betriebsfunktionen; keine Standardrolle |

Vor dem Pilotstart werden mindestens eine benannte Lese- und eine Schreibrolle
sowie eine negative Testidentität festgelegt. Der fachliche Owner bestätigt
Nutzerkreis und Datenumfang. Das Entwicklungsteam verantwortet Anwendung und
Bibliotheken; die Plattform-IT verantwortet Laufzeit, Gateway, Datenbank,
Secrets und zentrale Scanner.

Namen, interne Kontaktwege, Pilotzeitraum, App-Owner und Vertretung sowie
Plattform-, Identity-, Daten- und Security-Kontakte werden ausschließlich im
geschützten Übergabeticket gepflegt.

## Daten und Dateien

Der Datenadapter ist ein einmaliger, geschützter Kopierweg für die fachlich
freigegebenen Tabellen aus dem vor dem Import zu bestätigenden schreibführenden
Cloud-SQL-Snapshot in die gematik-PostgreSQL-Datenbank. Er kann erst nach
Bereitstellung der Zielzugänge sinnvoll ergänzt werden.

Für den ersten Durchstich wird empfohlen:

- nur bestätigte strukturierte Kontakt- und Organisationsdaten,
- keine Demozeilen und keine alten Identity-Bindings,
- keine Gesundheits-, Patienten- oder identifizierenden Falldaten,
- keine Bilder oder Anhänge und
- weiterhin deaktivierte neue Uploads.

Snapshot, Exporte, Subjects und Profilzuordnungen werden weder vorab versendet
noch in Git, Mail, Chat oder Build-Artefakte geschrieben.

## Empfohlene Reihenfolge

```text
vorhandenen RC.5-Tag und Zielcommit erneut verifizieren
  -> Historie und Tag in der Software Factory referenzieren oder spiegeln
  -> OIDC-Frontend und API frisch bauen, prüfen und Digests festhalten
  -> Zielplattform und Identity-Gateway bestätigen
  -> leere Datenbank und internes Routing bereitstellen
  -> Deployment mit positiver und negativer Auth-Prüfung
  -> freigegebenen strukturierten Datenstand einmalig übernehmen
  -> Lese-/Schreibablauf prüfen und Pilotzeitraum starten
```

Der Pilot ist erst bereit, wenn die im
[PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md#erfolgskriterien) genannten
Erfolgskriterien erfüllt und im geschützten Übergabeticket dokumentiert sind.
