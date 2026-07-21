# Naechster Zielschritt: gematik-interner PoC

Status: kompakter Einstieg fuer einen befristeten Non-Prod-Durchstich
Stand: 21. Juli 2026

Der historische Dateiname bleibt fuer stabile Querverweise erhalten; fuehrend
ist der hier beschriebene kleine PoC, nicht ein Produktivbetrieb.

## In 60 Sekunden

Der Versorgungs-Kompass soll im naechsten Schritt **nicht produktiv uebernommen**
werden. Ziel ist ein kleiner technischer Proof of Concept: Ein festgelegter
Release Candidate wird ueber die gematik Software Factory in einem internen
Kubernetes-Namespace bereitgestellt, per OIDC/SSO geschuetzt und mit einer
kleinen PostgreSQL-Datenbank verbunden. Verwendet werden ausschliesslich
synthetische, jederzeit verwerfbare Testdaten.

Massgeblich sind:

1. [gematik-interner PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md) fuer Scope,
   Ressourcen und Erfolgskriterien,
2. [Release-Candidate-Strategie](RELEASE_CANDIDATE_STRATEGIE.md) fuer einen
   stabilen RC bei paralleler Weiterentwicklung und
3. [IT-Uebergabe fuer den gematik-PoC](IT_UEBERGABE_ZIELBETRIEB.md) fuer das
   Ressourcengespraech.

## Die wichtigste Trennung

```text
lokale Entwicklung / main -----> GitHub-Pages-Demo aus dist/pages/
             |
             `---- festgelegter Commit + RC-Tag
                            |
                            +--> dist/target/
                            `--> API-Image@sha256
                                      |
                                      v
                              gematik-interner PoC
```

- GitHub Pages ist eine oeffentliche Produktdemo mit synthetischen Daten, kein
  Staging der gematik-Infrastruktur.
- Der PoC wird aus einem unveraenderlichen RC gebaut, nicht aus einem beweglichen
  `main` oder einem lokalen Arbeitsordner.
- `main`, Feature-Branches und Pages koennen nach der RC-Bildung weiterlaufen,
  ohne den bereitgestellten PoC-Stand zu veraendern.
- API-Image und Target-Frontend bilden ein gemeinsames, revisionsfestes
  Releasepaar.
- `target` ist der Name des technischen Buildprofils und keine Aussage ueber
  Produktionsreife.

## Vier Umgebungsbegriffe

| Umgebung | Zweck | Daten | Status |
| --- | --- | --- | --- |
| lokale Entwicklung | Features und Experimente | lokal/synthetisch | beweglicher Arbeitsstand |
| GitHub-Pages-Demo | Produkt zeigen | ausschliesslich fiktiv | aktiv, keine Zielabnahme |
| `pre-gematik` | temporaere GCP-Pre-Integration | standardmaessig synthetisch | keine Produktivzusage |
| gematik-interner PoC | erster Infrastruktur-Durchstich | ausschliesslich synthetisch | naechster angefragter Schritt |

Ein moeglicher spaeterer Regelbetrieb ist eine eigene Stufe mit gesonderter
fachlicher, technischer, Security-, Datenschutz- und Betriebsfreigabe.

## Was fuer den PoC vorbereitet ist

- getrennte Buildausgaben `dist/pages/` und `dist/target/`,
- Node.js API und API-Vertrag,
- Helm-Referenzchart und Jenkins-Referenzpipeline,
- OIDC-/Gateway-, Target- und Security-Vertragspruefungen,
- wiederverwendbarer PostgreSQL-16-Vertrag, synthetische Testdaten und
  [PoC-Bootstrap-Runbook](../../deploy/postgres/poc-gematik/README.md),
- Health-, Readiness-, Session- und Smoke-Test-Pfade,
- ein klarer RC-/Artefaktvertrag.

Vor dem ersten RC-Tag muss der API-Container nicht nur gebaut, sondern auch
tatsaechlich gestartet und ueber `/api/healthz` geprueft werden. Der aktuelle
Arbeitsstand dazu steht in [Current State](../entwicklung-und-qa/CURRENT_STATE.md).

## Was die IT fuer den ersten Schritt bereitstellt

- befristeter Non-Prod-Namespace,
- Registry- und Software-Factory-Anbindung,
- interne HTTPS-URL mit `/` und `/api`,
- OIDC-Werte und wenige Testidentitaeten,
- kleine dedizierte PostgreSQL-16-Datenbank, deren `public`-Schema fuer den PoC
  vollstaendig disponibel ist,
- Secret-Injection und Standard-Logs,
- technische Ansprechpartner und ein Review-/Enddatum.

Nicht benoetigt werden fuer diesen Durchstich Object Storage, Echtdatenmigration,
Hochverfuegbarkeit, Autoscaling, 24/7-Service, individuelle SLO/RTO/RPO oder
produktive TI-Fachdienste.

## PoC bereit zur Bereitstellung, wenn

- ein sauberer Commit als unveraenderlicher RC markiert ist,
- API-Container und Target-Frontend aus diesem Commit reproduzierbar bauen,
- der Container startet und der Healthcheck antwortet,
- Tests, Security-Vertraege, Audits und Helm-Render fuer den vereinbarten
  PoC-Pfad gruen sind,
- Tag, Commit, API-Digest und Frontend-Hash dokumentiert sind und
- Namespace, URL, OIDC, PostgreSQL, Secrets und Logs durch die IT benannt sind.

## PoC erfolgreich abgeschlossen, wenn

- die interne URL ueber SSO erreichbar ist,
- Health, Readiness und Session funktionieren,
- ein synthetischer Datensatz gelesen und geaendert werden kann,
- derselbe RC reproduzierbar erneut deployt werden kann und
- Umgebung, Ergebnis und naechster Schritt gemeinsam dokumentiert sind.

Eine erfolgreiche PoC-Abnahme ist keine Produktivfreigabe.

## Spaetere Referenzen

[Zielkonzept](GEMATIK_K8S_ZIELKONZEPT.md),
[Betriebshandbuch](BETRIEB.md),
[RACI](BETRIEBSVERANTWORTUNG_RACI.md),
[Migration/Cutover/Rollback](MIGRATION_CUTOVER_ROLLBACK.md) und das
[Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) dokumentieren einen moeglichen
spaeteren Ausbau. Offene Punkte dort sind keine Freigabetore fuer den aktuellen
PoC.

## Vorgeschlagener naechster Schritt

In einem kurzen Plattform-Onboarding werden nur Namespace, Build/Registry, URL,
OIDC, PostgreSQL, Secrets/Logs, Ansprechpartner und Laufzeit geklaert. Danach
liefert das Entwicklungsteam den ersten gruenen RC fuer den technischen
Durchstich.
