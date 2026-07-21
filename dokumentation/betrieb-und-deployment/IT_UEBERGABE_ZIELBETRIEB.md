# IT-Uebergabe fuer den gematik-PoC

Status: kompakte Anfrage fuer einen befristeten Non-Prod-Durchstich
Stand: 21. Juli 2026

Der historische Dateiname bleibt fuer stabile Querverweise erhalten. Er ist
keine Aussage ueber einen bereits geplanten Produktivbetrieb.

## 60-Sekunden-Pitch

Wir beantragen keine Produktivsetzung und keine vollstaendige
Betriebsuebernahme. Der Versorgungs-Kompass soll als zeitlich begrenzter Proof of
Concept einmal durch die gematik-Infrastruktur gefuehrt werden: Die Software
Factory baut einen fixierten Release Candidate, Kubernetes fuehrt die API aus,
eine interne HTTPS-Route liefert Frontend und `/api`, OIDC/SSO schuetzt den
Zugriff und eine kleine PostgreSQL-Datenbank enthaelt ausschliesslich
synthetische Testdaten.

Der PoC soll technische Anschlussfaehigkeit zeigen. Er integriert keine
produktiven TI-Fachdienste und begruendet keine Verfuegbarkeits- oder
Betriebszusage.

## Ehrlicher aktueller Status

| Ampel | Aussage |
| --- | --- |
| **GRUEN** | Plattform-Onboarding und Reservierung der kleinen PoC-Ressourcen koennen beginnen. |
| **GRUEN** | Ein von der parallelen Frontendarbeit isolierter PoC-Quellstand wird lokal als `poc-v0.1.0-rc.1` fixiert und aus einem sauberen Checkout geprueft. Private lokale Daten sind weder Teil des Commits noch der Build-Artefakte. |
| **GELB** | Remote-Tag, Registry-Digest, Frontend-Uebergabemanifest sowie OIDC-/DB-/CRUD-Smokes in der Zielumgebung fehlen noch, weil die konkreten Plattformwerte erst mit der IT festgelegt werden. |
| **GRAU** | In der gematik-Infrastruktur wurde noch nichts deployed. |

Die IT wird daher jetzt um die Plattformgrundlage gebeten. Der reproduzierbare
Quell-RC kann als Eingang fuer Software Factory und Registry dienen; ein
konkretes Deployment wird erst nach den plattformbezogenen Builds und Smokes als
erfolgreich bezeichnet.

## Gewuenschtes Ergebnis des ersten IT-Termins

Am Ende reichen acht Festlegungen:

| Thema | Benoetigte Antwort |
| --- | --- |
| Namespace | Welcher befristete Non-Prod-Namespace steht zur Verfuegung? |
| Build/Registry | Wie werden RC-Tag, Image und Frontend uebernommen? |
| URL/Routing | Welche interne HTTPS-URL bedient `/` und `/api`? |
| Identity | Welche OIDC-Werte und Testidentitaeten werden verwendet? |
| PostgreSQL | Welche kleine dedizierte PostgreSQL-16-Datenbank mit disponibler `public`-Struktur steht bereit; wer prueft einmalig die clusterweite Runtime-Rolle; System-CA oder CA-Secret? |
| Secrets/Logs | Wie werden Secrets injiziert und Standard-Logs eingesehen? |
| Kontakt | Wer hilft bei Plattform- und Identity-Fragen? |
| Laufzeit | Wann wird der PoC bewertet, verlaengert oder entfernt? |

Ein vollstaendiger RACI, SLO/RTO/RPO, Service Desk, Migrationsgeneralprobe oder
Produktions-Cutover ist fuer diesen Termin nicht erforderlich.

## Kleine Zielarchitektur

```text
interne Testnutzende
        |
        v
Gateway / TLS / OIDC
   |            |
   v            v
Frontend       /api --> Node.js API --> PostgreSQL 16

Software Factory --> RC-Tag --> Image-Digest + Frontend-Hash
```

Der Target-Browser verwendet ausschliesslich `/api`. OIDC-Tokens werden
serverseitig verifiziert; Secrets bleiben ausserhalb des Repositorys. Fuer den
PoC sind keine Uploads und kein Object Storage aktiviert.

## Umfang und Nicht-Ziele

Enthalten:

- ein API-Pod und statisches Target-Frontend,
- OIDC/SSO mit wenigen synthetischen Testidentitaeten,
- kleine PostgreSQL-Datenbank mit synthetischem Seed,
- Standard-Logs und einfache Smoke Tests,
- reproduzierbares erneutes Deployment desselben RC.

Bewusst nicht enthalten:

- Echtdaten und Datenmigration,
- produktive TI-, KIM-, ePA- oder andere Fachdienstanbindungen,
- Uploads, Object Storage und Dokumentenanhaenge,
- Hochverfuegbarkeit, Lasttest, Autoscaling und Multi-Region,
- 24/7-Support, individuelle Servicewerte, Backup-/Restore-Generalprobe,
- Betriebsuebernahme oder Produktivfreigabe.

## Was das Entwicklungsteam uebergibt

- unveraenderlicher RC-Tag und vollstaendiger Git-SHA,
- API-Image als Registry-Referenz mit `sha256`-Digest,
- Target-Frontend mit Hash beziehungsweise Buildmanifest,
- Helm-Chart und kleines PoC-Overlay ohne Secrets,
- Runbook fuer disponiblen synthetischen Datenbank-Bootstrap und Testidentitaeten,
- erforderliche Konfigurationsvariablen,
- Ergebnisse von Build, Security-Pruefungen, Containerstart und Smoke Tests,
- bekannte, nicht blockierende PoC-Einschraenkungen.

Der genaue Ablauf steht in der
[Release-Candidate-Strategie](RELEASE_CANDIDATE_STRATEGIE.md). Ein ZIP des
lokalen Arbeitsverzeichnisses oder ein beweglicher `main`-Stand wird nicht
uebergeben.

## Minimaler Abnahmerahmen

Der PoC ist technisch erfolgreich, wenn:

- das Releasepaar eindeutig auf Tag und Commit zurueckgefuehrt werden kann,
- die interne URL und SSO funktionieren,
- `/api/healthz`, `/api/readyz` und `/api/session` erwartungsgemaess antworten,
- unbekannte Identitaeten abgewiesen werden,
- ein synthetischer Datensatz gelesen und geaendert werden kann,
- derselbe RC erneut bereitgestellt werden kann und
- ein End-, Review- oder Verlaengerungstermin festgehalten ist.

## Empfohlene Agenda fuer 30 Minuten

1. 5 Minuten: Ziel und ausdrueckliche Nicht-Ziele des PoC.
2. 10 Minuten: kleiner Architektur- und Releasepfad.
3. 10 Minuten: acht benoetigte Plattformentscheidungen.
4. 5 Minuten: Ansprechpartner, RC-Termin und Laufzeitende.

## Formulierung fuer Einladung oder Ticket

> Wir bitten um einen befristeten Non-Prod-Durchstich fuer den
> Versorgungs-Kompass. Ein fixierter Release Candidate soll ueber die gematik
> Software Factory in einem Kubernetes-Namespace bereitgestellt, per OIDC/SSO
> geschuetzt und mit einer kleinen PostgreSQL-Datenbank mit ausschliesslich
> synthetischen Daten verbunden werden. Benoetigt werden Namespace,
> Registry-/Pipeline-Anbindung, interne HTTPS-Route, OIDC-Testwerte,
> PostgreSQL-Ressource, Secret-Injection, Standard-Logs und technische
> Ansprechpartner. Echtdatenmigration, Uploads, Hochverfuegbarkeit,
> Servicewerte, Betriebsuebernahme und produktive TI-Schnittstellen sind nicht
> Teil dieses PoC. Wir moechten das Plattform-Onboarding jetzt starten; das
> konkrete Deploymentpaket folgt separat als gruen gepruefter, unveraenderlicher
> RC. Der aktuelle lokale Arbeitsbaum ist nicht das Uebergabeartefakt.

## Fuehrendes Uebergabepaket

- [gematik-interner PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md)
- [Release-Candidate-Strategie](RELEASE_CANDIDATE_STRATEGIE.md)
- [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md)
- [Deployment-Einstieg](../../deploy/README.md)
- [PoC-Datenbank-Bootstrap](../../deploy/postgres/poc-gematik/README.md)
- [ADR zur Deployment-Trennung](ADR_001_DEPLOYMENT_TRENNUNG.md)
- [Technisches Kubernetes-Deployment](DEPLOYMENT_GEMATIK_K8S.md)
- [Sicherheitsrichtlinie](../../SECURITY.md)

Die Unterlagen zu [Betrieb](BETRIEB.md),
[RACI](BETRIEBSVERANTWORTUNG_RACI.md),
[Migration/Cutover/Rollback](MIGRATION_CUTOVER_ROLLBACK.md) und
[vollstaendiger Abnahme](ABNAHMEPROTOKOLL_TEMPLATE.md) sind bewusst als
Referenzen fuer einen moeglichen spaeteren Pilot- oder Regelbetrieb
zurueckgestellt. Sie muessen fuer den ersten Durchstich nicht abgeschlossen
werden.

## Naechster Schritt

IT und Entwicklung klaeren die acht Plattformpunkte. Danach wird ein sauberer,
gruen gepruefter RC bereitgestellt und gemeinsam in die befristete Umgebung
deployed. Erst das Ergebnis dieses Durchstichs entscheidet, ob ein groesserer
Pilot sinnvoll ist.
