# ADR 001: Trennung von GitHub Pages und Kubernetes-PoC-/Zielpfad

- Status: für das Repository und den PoC angenommen
- Datum: 21. Juli 2026
- Entscheidungsträger im Repository: Produkt-/Entwicklungsteam
- Zu bestätigen: Zielbetriebsverantwortung, Plattformbetrieb, Informationssicherheit und Datenschutz

## Kontext

Der Versorgungs-Kompass besitzt eine öffentliche Pages-Demo und einen geschützten Kubernetes-Pfad. Historisch wurde `docs/` sowohl als Pages-Publish-Kopie als auch zeitweise als Ausgangspunkt für ein Zielartefakt behandelt. Dadurch konnten Demo-, Realanwendungs- und Zielkonfiguration sowie Freigaben miteinander vermischt werden.

GitHub Pages und der Kubernetes-Pfad haben unterschiedliche Sicherheitsgrenzen, Datenklassen, Identitätsmodelle und Lebenszyklen. `pre-gematik` erprobt den Target-Vertrag auf GCP, ist aber weder Staging im Sinne eines produktionsgleichen IT-Environments noch die spätere Produktivplattform. Der nächste gematik-Schritt ist ein interner Nutzungspilot mit einem getrennt übernommenen, freigegebenen Datenstand.

## Entscheidung

1. Das gemeinsame Repository bleibt bestehen. Eine Aufteilung in mehrere Repositories ist für die Trennung nicht erforderlich.
2. Die führenden Frontend-Quellen liegen in `frontend/` und `public/`.
3. Der Pages-Build schreibt ausschließlich nach `dist/pages/`.
4. Der Target-Build schreibt ausschließlich nach `dist/target/`.
5. GitHub Actions veröffentlicht `dist/pages/` direkt. Die frühere versionierte `docs/`-Publish-Kopie wird nicht fortgeführt.
6. GitHub Pages ist ausschließlich eine synthetische Demo. Es ist weder Realanwendung noch Staging für GKE.
7. `pre-gematik` ist eine temporäre Pre-Integration. Die dort dokumentierte [persönliche Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) gilt nur für diese Umgebung. GCP Autopilot, Cloud SQL, IAP, persönliche Projektwerte und persönliche Break-glass-Werte sind nicht auf den gematik-PoC übertragbar.
8. Der gematik-PoC und ein möglicher späterer Zielpfad verwenden `dist/target/`, ein unveränderliches API-Image und getrennte, kontrollierte Deployments.
9. Target-Frontend und API werden über eine gemeinsame Release-ID gekoppelt. Promotion verwendet geprüfte Artefakte, keinen erneuten Build aus einer Umgebungsbranch.
10. Umgebungen werden über Pipelines, Environments, Konfiguration, Secrets und Freigaben getrennt, nicht über langlebige Deployment-Branches.
11. Für einen PoC-RC ist ein kurzlebiger Stabilisierungsbranch zulässig. Er ist keine Umgebung, wird nach Abschluss entfernt und führt zu einem unveränderlichen RC-Tag auf genau einem Commit. Jeder Fix erzeugt einen neuen Tag; vorhandene Tags werden nie verschoben.
12. Der Datenstand gehört nicht zum RC. Für den internen PoC wird er einmalig über einen geschützten Adminvorgang übernommen. Während des Tests ist der gematik-PoC der gemeinsame bearbeitbare Bestand; eine automatische Synchronisation mit der persönlichen Bereitstellung existiert nicht.

## Sicherheitsinvarianten

Ein Target-Build ist nur gültig, wenn:

- der Browser ausschließlich same-origin `/api` oder eine explizit freigegebene interne API-Basis nutzt,
- `requireApiGateway` aktiv ist,
- die PoC-API OIDC oder eine gleichwertig signierte und serverseitig verifizierte Plattformidentität verwendet,
- ein unsignierter `trusted-header`-/`sso`-Modus nur als dokumentierte, von Plattform und Informationssicherheit genehmigte Ausnahme aktiviert wird,
- keine Supabase-Projekt-URL, kein Supabase-Key und kein Supabase Browser SDK enthalten ist,
- keine geheimen Werte, Echtdaten oder produktiven Seed-/Backup-Daten enthalten sind,
- etwaige Identity-Header im OIDC-Zielmodus ignoriert/entfernt und im genehmigten Ausnahmemodus nur von einer nicht umgehbaren verifizierenden Schicht gesetzt werden können,
- das Artefakt durch automatisierte Audits und Smoke Tests geprüft wurde.

## Folgen

Positiv:

- Demo-Risiken und öffentliche Datenpfade können nicht unbemerkt in den Zielbetrieb gelangen.
- Pages und Kubernetes können unabhängig veröffentlicht, pausiert oder abgeschaltet werden.
- Der PoC besitzt einen klaren, kleinen Vertrag statt einer persönlichen Infrastrukturkopie.
- Release, Rollback und Nachweise lassen sich auf eine konkrete Revision beziehen.

Aufwand:

- Zwei Buildausgaben und zwei Artefaktaudits müssen gepflegt werden.
- Target-Frontend und API brauchen eine gemeinsame Release-/Kompatibilitätsregel.
- Bestehende Skripte, Pipelines und Dokumentation verwenden die getrennten `dist/pages/`- und `dist/target/`-Artefakte.
- Verbliebene Altzugriffe auf den geschützten Ausgangsdatenbestand benötigen einen dokumentierten Owner und ein Abschaltkriterium.

## Verworfene Alternativen

### `docs/` für Pages und Target gemeinsam verwenden

Verworfen, weil ein generierter öffentlicher Publish-Ordner dann zugleich Zielartefakt wäre. Konfigurationsüberschreibung, falsche Freigabe und unklare Herkunft wären wahrscheinlich.

### Dauerhafte `pages`-, `staging`- und `gke`-Branches

Verworfen, weil Branchdrift, selektive Security-Fixes und unterschiedliche Quellstände entstehen können. Umgebungen sind Deploymentzustand, keine Produktvarianten. Ein kurzlebiger, scope-gefrorener RC-Stabilisierungsbranch ist davon nicht betroffen.

### Sofort zwei Anwendungs-Repositories anlegen

Vorerst verworfen, weil gemeinsame Frontend- und API-Änderungen dann aufwendig synchronisiert werden müssten. Eine spätere Aufteilung bleibt möglich, falls Ownership, Releasefrequenz oder Compliance dies verlangen.

### GitHub Pages als Staging bezeichnen

Verworfen, weil Hosting-, Auth-, Daten- und Netzwerkvertrag nicht dem Zielbetrieb entsprechen. Pages ist nur die synthetische Demo und kann keine Zielbetriebsabnahme ersetzen.

## Durchsetzung und Verifikation

- Buildskripte leeren nur ihren expliziten Zielordner.
- CI prüft Target-Konfiguration und verbotene Supabase-/Secret-Muster.
- Zielpipelines referenzieren weder den historischen `docs/`-Pfad noch einen Pages-Synchronisationswrapper.
- `dist/` wird als Buildausgabe behandelt und nicht manuell editiert.
- Für den PoC werden Tag, Commit, Artefaktdigests und die vereinbarten Minimalprüfungen nachgewiesen. Weitere Verfahren sind nicht Teil dieser Entscheidung.
- Abweichungen benötigen eine neue ADR oder eine ausdrückliche Aktualisierung dieser Entscheidung.

## Verwandte Dokumente

- [Gematik-PoC: technischer Durchstich](POC_GEMATIK_DURCHSTICH.md)
- [Deployment des Gematik-PoC auf Kubernetes](DEPLOYMENT_GEMATIK_K8S.md)
