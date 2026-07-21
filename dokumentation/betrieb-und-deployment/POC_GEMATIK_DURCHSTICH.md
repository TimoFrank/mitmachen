# gematik-interner PoC-Durchstich

Status: Arbeitsgrundlage fuer eine befristete Non-Prod-Integration
Stand: 21. Juli 2026

## Ziel des naechsten Schritts

Der naechste Schritt weist ausschliesslich nach, dass ein fest definierter Release
Candidate ueber die gematik Software Factory gebaut, in einer internen
Kubernetes-Umgebung bereitgestellt, ueber gematik-SSO erreicht und mit einer
kleinen PostgreSQL-Datenbank verbunden werden kann.

Der PoC ist **keine Produktivfreigabe**, **keine Betriebsuebernahme** und **keine
TI-Fachdienstintegration**. Er ist ein zeitlich begrenzter technischer Durchstich
mit synthetischen, jederzeit verwerfbaren Daten.

## Aktueller Ampelstatus

| Teil | Status am 21. Juli 2026 | Konsequenz |
| --- | --- | --- |
| Plattform-Onboarding | **GRUEN** | Das Ressourcengespraech mit der IT kann jetzt beginnen. |
| RC-Quellstand | **GRUEN** | Der PoC-Stand ist von der parallelen Hospitationsentwicklung isoliert; Repo-Gates, Target-Build, Containerstart und lokaler Kern-Smoke werden aus einem sauberen Checkout nachgewiesen. |
| Veroeffentlichtes RC-Artefakt | **GELB** | Der Quellstand wird lokal als `poc-v0.1.0-rc.1` fixiert. Remote-Tag, Registry-Image mit Digest, Frontend-Uebergabemanifest und Plattform-Smokes folgen erst nach Bereitstellung der IT-Werte. |
| Parallele Weiterentwicklung | **GRUEN** | Lokale/private Hospitationsdaten bleiben im ignorierten Einstieg; `main`, Feature-Branches und Pages koennen unabhaengig vom fixierten RC weiterlaufen. |
| Deployment in gematik | **GRAU** | Noch nicht begonnen; Start erst aus einem sauberen, gruenen RC. |

Damit ist die richtige Anfrage an die IT: **Plattformressourcen jetzt klaeren
und den lokal fixierten Quell-RC als reproduzierbare Grundlage anbieten, aber
noch kein bereits deployedtes Artefakt behaupten.** Image-Digest,
Frontend-Manifest und die Smokes in der gematik-Umgebung entstehen gemeinsam
mit Registry-, Namespace-, OIDC-, Routing- und Datenbankwerten.

## Was nachgewiesen werden soll

```text
unveraenderlicher RC-Tag
        |
        v
gematik Software Factory --> API-Image + Target-Frontend
        |
        v
interne HTTPS-URL --> OIDC/SSO --> Kubernetes --> PostgreSQL
```

Der Durchstich ist erfolgreich, wenn:

1. ein festgelegter RC reproduzierbar gebaut und mit den ueblichen Scans geprueft wird,
2. API-Image und `dist/target/` nachweislich aus demselben Commit stammen,
3. die Anwendung ueber eine interne HTTPS-URL erreichbar ist,
4. SSO, `/api/healthz`, `/api/readyz` und `/api/session` funktionieren,
5. ein synthetischer Testdatensatz gelesen und geaendert werden kann,
6. derselbe RC ein zweites Mal reproduzierbar bereitgestellt werden kann und
7. die befristete Umgebung anschliessend kontrolliert entfernt oder verlaengert wird.

## Bewusst kleiner PoC-Umfang

Enthalten sind:

- ein Non-Prod-Namespace mit einer kleinen API-Workload,
- statisches Target-Frontend und same-origin `/api`,
- interne HTTPS-Route und OIDC-/SSO-Anbindung,
- zwei bis fuenf Testidentitaeten mit wenigen Rollen,
- PostgreSQL 16 mit synthetischen Testdaten,
- Secret-Injection sowie Standard-Logs,
- einfache technische Smoke Tests.

Nicht enthalten sind:

- Echtdaten oder eine Datenmigration aus bestehenden Systemen,
- Uploads, Object Storage oder Dokumentenanhaenge,
- produktive TI-, KIM-, ePA- oder weitere Fachdienst-Schnittstellen,
- Hochverfuegbarkeit, Autoscaling, Multi-Region oder Lastnachweise,
- individuelle SLO-, RTO- oder RPO-Zusagen,
- 24/7-Betrieb, Service Desk, Hypercare oder vollstaendige Betriebsuebernahme,
- eine Backup-/Restore-Generalprobe oder ein produktiver Cutover.

TLS, verifizierte Anmeldung, eingeschraenkte Zugriffe, Secret-Verwaltung und die
ueblichen Build- und Scan-Pruefungen bleiben auch fuer den PoC verbindlich. Die
kleine Auspraegung senkt den Betriebsumfang, nicht die grundlegende
Zugriffssicherheit.

## Angefragte Plattformressourcen

| Ressource | Minimaler PoC-Bedarf |
| --- | --- |
| Laufzeit | befristeter Non-Prod-Namespace fuer zunaechst vier bis sechs Wochen |
| Container | ein API-Pod; Richtwert `100m` CPU/`256Mi` RAM Request und `500m`/`512Mi` Limit |
| Frontend | internes statisches Hosting oder Bereitstellung hinter demselben Gateway |
| Routing | interne HTTPS-URL mit `/` fuer das Frontend und `/api` fuer die API |
| Identity | OIDC-Werte und zwei bis fuenf synthetische Testidentitaeten |
| Datenbank | kleine dedizierte PostgreSQL-16-Datenbank, deren `public`-Schema fuer den PoC vollstaendig disponibel ist; etwa 1 bis 5 GB; einmalige DB-Admin-Unterstuetzung fuer die Runtime-Rolle |
| Secrets | Injection fuer Datenbank- und OIDC-Konfiguration; keine Secrets im Repository |
| Beobachtbarkeit | Standard-Containerlogs und Zugriff fuer die technische Fehlersuche |
| Zusammenarbeit | je eine technische Ansprechperson fuer Plattform und Identity |
| Laufzeitende | vereinbartes End-, Review- oder Verlaengerungsdatum |

Object Storage, mehrere Replikate, HPA/PDB und besondere Betriebsdienste werden
fuer diesen ersten Durchstich nicht angefragt.

## Was das Entwicklungsteam liefert

Die Uebergabe erfolgt als unveraenderlicher Release Candidate gemaess
[Release-Candidate-Strategie](RELEASE_CANDIDATE_STRATEGIE.md). Das Paket nennt
mindestens:

- RC-Tag und exakten Git-Commit,
- API-Image mit Digest,
- Hash beziehungsweise Manifest des Target-Frontends,
- Helm-Chart und [kleines PoC-Overlay](../../deploy/helm/versorgungs-kompass/values-poc-gematik.yaml) ohne Secrets,
- [PoC-Datenbank-Bootstrap](../../deploy/postgres/poc-gematik/README.md) fuer
  disponiblen synthetischen Seed und zwei bis fuenf OIDC-Testbindungen,
- benoetigte OIDC-, Datenbank- und Routing-Variablen,
- Ergebnisse der vereinbarten Build-, Sicherheits- und Smoke-Tests,
- bekannte, fuer den PoC akzeptierte Einschraenkungen.

Ein Arbeitsverzeichnis mit uncommitteten Dateien, ein ZIP des aktuellen
Repo-Ordners oder ein beweglicher `main`-Stand sind kein Uebergabeartefakt.

## Entscheidungen, die von der IT benoetigt werden

Fuer den Start reichen acht konkrete Antworten:

1. In welchem befristeten Non-Prod-Namespace darf der PoC laufen?
2. Wie werden Image und Frontend in Registry und Software Factory uebernommen?
3. Welche interne HTTPS-URL und welches `/api`-Routing werden verwendet?
4. Welche OIDC-Werte und Testidentitaeten stehen zur Verfuegung?
5. Welche kleine dedizierte PostgreSQL-Datenbank mit kontrolliertem,
   verwerfbarem `public`-Schema kann genutzt werden, und liegt ihre CA im
   System-Truststore oder in einem Kubernetes-Secret?
6. Wie werden Secrets injiziert und Standard-Logs eingesehen?
7. Wer ist fuer Plattform- und Identity-Fragen technisch ansprechbar?
8. Wann wird der PoC gemeinsam bewertet, verlaengert oder entfernt?

RACI fuer einen spaeteren Regelbetrieb, Migrationsplanung, Servicewerte und
Produktionsabnahme sind fuer diese acht Entscheidungen keine Voraussetzung.

## Empfohlener Text an die IT-Kollegen

> Wir moechten keinen Produktivbetrieb und keine vollstaendige
> Betriebsuebernahme beantragen, sondern einen befristeten gematik-internen
> Proof of Concept. Ziel ist ein erster technischer Durchstich: Ein fixierter
> Release Candidate soll ueber die Software Factory in einem Non-Prod-Namespace
> gebaut und bereitgestellt werden, sich per internem OIDC/SSO anmelden und eine
> kleine PostgreSQL-Datenbank mit ausschliesslich synthetischen Testdaten nutzen.
> Wir benoetigen dafuer Namespace, Registry-/Pipeline-Anbindung, interne
> HTTPS-Route, OIDC-Testwerte, kleine PostgreSQL-Ressource, Secret-Injection,
> Standard-Logs sowie technische Ansprechpartner. Uploads, Echtdatenmigration,
> Hochverfuegbarkeit, individuelle Servicewerte und TI-Fachdienste sind bewusst
> nicht Teil dieses ersten Schritts. Das Entwicklungsteam liefert einen
> unveraenderlichen RC mit Commit, Image-Digest, Frontend-Hash, Helm-Chart und
> reproduzierbaren Smoke-Test-Nachweisen. Das Plattform-Onboarding kann jetzt
> beginnen; der lokal fixierte Quell-RC ist die reproduzierbare Grundlage. Das
> deploybare Image-/Frontend-Paar entsteht nach Bereitstellung der
> Plattformwerte. Der aktuelle lokale Arbeitsbaum wird nicht als Artefakt
> uebergeben.

## Einordnung der weiterfuehrenden Dokumente

Die [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md) und der
[Deployment-Einstieg](../../deploy/README.md) erklaeren die technischen Pfade.
Die umfangreicheren Unterlagen zu RACI, Migration, Cutover, Betrieb, Abnahme und
Servicewerten bleiben als Referenz fuer einen moeglichen spaeteren Pilot- oder
Regelbetrieb erhalten. Offene Punkte darin sind **keine Freigabetore dieses
PoC-Durchstichs**.
