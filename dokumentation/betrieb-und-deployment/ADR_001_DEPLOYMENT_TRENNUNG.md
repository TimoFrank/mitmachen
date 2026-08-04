# ADR 001: Trennung der drei Auslieferungskanäle

- Status: für das Repository und den PoC angenommen
- Datum: 21. Juli 2026
- Aktualisiert: 4. August 2026
- Entscheidungsträger im Repository: Produkt-/Entwicklungsteam
- Zu bestätigen: Zielbetriebsverantwortung, Plattformbetrieb, Informationssicherheit und Datenschutz

## Kontext

Der Versorgungs-Kompass besitzt eine öffentliche Pages-Demo, ein privates GKE
als GCP-/IAP-Pre-Integration und einen gesonderten gematik-Zielpfad mit OIDC.
Historisch wurde `docs/` sowohl als Pages-Publish-Kopie als auch zeitweise als
Ausgangspunkt für ein Zielartefakt behandelt. Dadurch konnten Demo-,
Realanwendungs- und Zielkonfiguration sowie Freigaben miteinander vermischt
werden.

Die drei Auslieferungskanäle haben unterschiedliche Sicherheitsgrenzen,
Datenklassen, Identitätsmodelle und Lebenszyklen. `pre-gematik` erprobt Teile
des Target-Vertrags auf GCP, ist aber weder Staging im Sinne eines
produktionsgleichen IT-Environments noch die spätere Produktivplattform. Der
nächste gematik-Schritt ist ein interner Nutzungspilot mit einem getrennt
übernommenen, freigegebenen Datenstand.

## Entscheidung

1. Das gemeinsame Repository bleibt bestehen. Eine Aufteilung in mehrere Repositories ist für die Trennung nicht erforderlich.
2. Die führenden Frontend-Quellen liegen in `frontend/` und `public/`.
3. Der Pages-Build schreibt ausschließlich nach `dist/pages/`.
4. Der Target-Build schreibt ausschließlich nach `dist/target/`.
5. GitHub Actions veröffentlicht `dist/pages/` direkt. Die frühere versionierte `docs/`-Publish-Kopie wird nicht fortgeführt.
6. GitHub Pages ist eine synthetische CRM-/Fachdaten-Demo mit genau einer kuratierten Ausnahme: einem feldminimierten Verzeichnis öffentlicher Bundestags-Amtsträgerdaten. Es ist weder Realanwendung noch Staging für GKE.
7. `pre-gematik` ist eine temporäre Pre-Integration. Die dort dokumentierte [persönliche Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) gilt nur für diese Umgebung. GCP Autopilot, Cloud SQL, IAP, persönliche Projektwerte und persönliche Break-glass-Werte sind nicht auf den gematik-PoC übertragbar.
8. Das private GKE bleibt ein eigenständiger GCP-/IAP-Kanal. Es ist nicht
   baugleich mit dem OIDC-Target und seine Images, Helm-Werte und
   Infrastrukturparameter werden nicht in den gematik-Zielpfad promotet.
9. Der gematik-PoC und ein möglicher späterer Zielpfad verwenden
   `dist/target/`, ein unveränderliches API-Image und getrennte, kontrollierte
   Deployments. Für neue Versionen ab `v0.23.0` baut die Software Factory
   beziehungsweise später GitLab diese Artefakte frisch aus einem
   freigegebenen signierten Quelltag. Der vorhandene Legacy-RC.5 bleibt als
   annotierte, unsignierte Evidenz bestehen.
10. Alle Kanäle referenzieren dieselbe Produkt-/Quellversion `vX.Y.Z`.
    Buildprofil, Auth-Modus und Artefaktdigests stehen im kanalspezifischen
    Manifest. Gleiche Version bedeutet gleiche Quelle, nicht gleiche
    Buildausgabe.
11. Es gibt keine Promotion zwischen Pages-Demo, privatem GKE und Target. Erst
    innerhalb des Target-Kanals dürfen nachgewiesene identische Digests ohne
    Rebuild weitergereicht werden.
12. Target-Frontend und API werden innerhalb des Target-Kanals über dieselbe
    Produktversion und explizite Digests gekoppelt.
13. Umgebungen werden über Pipelines, Environments, Konfiguration, Secrets und
    Freigaben getrennt, nicht über langlebige Deployment-Branches.
14. Für einen Release Candidate ist ein kurzlebiger Stabilisierungsbranch
    zulässig. Er ist keine Umgebung und wird nach Abschluss entfernt. Für neue
    Versionen ab `v0.23.0` ist der signierte, unveränderliche Tag `vX.Y.Z` auf
    genau einem Commit verbindlich; ein Fix erzeugt eine Patch-Version.
    „Release Candidate“ bleibt Release-Metadatum und wird nicht in den Tag
    codiert. Historische RC-Tags werden nicht nachsigniert.
15. Bis zur institutionellen Übergabe ist GitHub die führende
    Integrationslinie. GitLab übernimmt vollständige Git-Objekte samt Tagobjekt
    und Commit, nicht ein Arbeitsbaum-Archiv. Nach dem Cutover gibt es genau
    eine beschreibbare `main`-Linie und keine bidirektionale Parallelpflege.
16. Der Datenstand gehört nicht zum Release. Für den internen PoC wird er
    einmalig über einen geschützten Adminvorgang übernommen. Während des Tests
    ist der gematik-PoC der gemeinsame bearbeitbare Bestand; eine automatische
    Synchronisation mit der persönlichen Bereitstellung existiert nicht.

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
- Pages-Demo, privates GKE und Target können unabhängig veröffentlicht,
  pausiert oder abgeschaltet werden.
- Der PoC besitzt einen klaren, kleinen Vertrag statt einer persönlichen Infrastrukturkopie.
- Release, Rollback und Nachweise lassen sich auf eine konkrete Revision beziehen.

Aufwand:

- Zwei Buildausgaben, drei Deploymentverträge und die zugehörigen
  Artefaktaudits müssen gepflegt werden.
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

Verworfen, weil Hosting-, Auth-, Daten- und Netzwerkvertrag nicht dem Zielbetrieb entsprechen. Pages bleibt trotz des eng begrenzten öffentlichen Amtsträger-Verzeichnisses eine anonyme Demo und kann keine Zielbetriebsabnahme ersetzen.

## Durchsetzung und Verifikation

- Buildskripte leeren nur ihren expliziten Zielordner.
- CI prüft Target-Konfiguration und verbotene Supabase-/Secret-Muster.
- Zielpipelines referenzieren weder den historischen `docs/`-Pfad noch einen Pages-Synchronisationswrapper.
- `dist/` wird als Buildausgabe behandelt und nicht manuell editiert.
- Für neue PoC-Releases ab `v0.23.0` werden signierter Tag, Tag-Objekt-SHA,
  Commit, Artefaktdigests und die vereinbarten Minimalprüfungen nachgewiesen.
  Die vorhandenen unsignierten Legacy-Tags bleiben historische Evidenz und
  werden nicht nachsigniert. Weitere Verfahren sind nicht Teil dieser
  Entscheidung.
- Abweichungen benötigen eine neue ADR oder eine ausdrückliche Aktualisierung dieser Entscheidung.

## Verwandte Dokumente

- [Gematik-PoC: technischer Durchstich](POC_GEMATIK_DURCHSTICH.md)
- [Deployment des Gematik-PoC auf Kubernetes](DEPLOYMENT_GEMATIK_K8S.md)
