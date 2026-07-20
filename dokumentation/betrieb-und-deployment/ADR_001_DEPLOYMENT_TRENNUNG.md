# ADR 001: Trennung von GitHub Pages und Kubernetes-Zielbetrieb

- Status: fuer das Repository angenommen; Plattform- und Produktivfreigabe offen
- Datum: 18. Juli 2026
- Entscheidungstraeger im Repository: Produkt-/Entwicklungsteam
- Zu bestaetigen: Zielbetriebsverantwortung, Plattformbetrieb, Informationssicherheit und Datenschutz

## Kontext

Der Versorgungs-Kompass besitzt eine oeffentliche Pages-Demo und einen geschuetzten Kubernetes-Pfad. Historisch wurde `docs/` sowohl als Pages-Publish-Kopie als auch zeitweise als Ausgangspunkt fuer ein Zielartefakt behandelt. Dadurch konnten Demo-, Realanwendungs- und Zielkonfiguration sowie Freigaben miteinander vermischt werden.

GitHub Pages und der Kubernetes-Zielbetrieb haben unterschiedliche Sicherheitsgrenzen, Datenklassen, Identitaetsmodelle, Betriebsverantwortungen und Lebenszyklen. `pre-gematik` erprobt den Zielvertrag auf GCP, ist aber weder Staging im Sinne eines produktionsgleichen IT-Environments noch die spaetere Produktivplattform.

## Entscheidung

1. Das gemeinsame Repository bleibt bestehen. Eine Aufteilung in mehrere Repositories ist fuer die Trennung nicht erforderlich.
2. Die fuehrenden Frontend-Quellen liegen in `frontend/` und `public/`.
3. Der Pages-Build schreibt ausschliesslich nach `dist/pages/`.
4. Der Target-Build schreibt ausschliesslich nach `dist/target/`.
5. GitHub Actions veroeffentlicht `dist/pages/` direkt. Die fruehere versionierte `docs/`-Publish-Kopie wird nicht fortgefuehrt.
6. GitHub Pages ist ausschliesslich eine synthetische Demo. Es ist weder Realanwendung noch Staging fuer GKE.
7. `pre-gematik` ist eine temporaere Pre-Integration und standardmaessig auf synthetische oder belastbar anonymisierte Daten begrenzt. Ein geschuetzter, zeitlich begrenzter Echtdaten-Pilot benoetigt die expliziten Fach-, Datenschutz-, Security-, Identitaets-, Backup- und Cutover-Freigaben im [Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md). GCP Autopilot, Cloud SQL, IAP, persoenliche Projektwerte und persoenliche Break-glass-Werte sind nicht auf den Zielbetrieb uebertragbar.
8. Der Zielbetrieb verwendet `dist/target/`, ein unveraenderliches API-Image und getrennte, kontrollierte Deployments.
9. Target-Frontend und API werden ueber eine gemeinsame Release-ID gekoppelt. Promotion verwendet gepruefte Artefakte, keinen erneuten Build aus einer Umgebungsbranch.
10. Umgebungen werden ueber Pipelines, Environments, Konfiguration, Secrets und Freigaben getrennt, nicht ueber langlebige Deployment-Branches.

## Sicherheitsinvarianten

Ein Target-Build ist nur gueltig, wenn:

- der Browser ausschliesslich same-origin `/api` oder eine explizit freigegebene interne API-Basis nutzt,
- `requireApiGateway` aktiv ist,
- die Produktions-API OIDC oder eine gleichwertig signierte und serverseitig verifizierte Plattformidentitaet verwendet,
- ein unsignierter `trusted-header`-/`sso`-Modus nur als dokumentierte, von Plattform und Informationssicherheit genehmigte Ausnahme aktiviert wird,
- keine Supabase-Projekt-URL, kein Supabase-Key und kein Supabase Browser SDK enthalten ist,
- keine geheimen Werte oder produktiven Seed-/Backup-Daten enthalten sind,
- etwaige Identity-Header im OIDC-Zielmodus ignoriert/entfernt und im genehmigten Ausnahmemodus nur von einer nicht umgehbaren verifizierenden Schicht gesetzt werden koennen,
- das Artefakt durch automatisierte Audits und Smoke Tests geprueft wurde.

## Folgen

Positiv:

- Demo-Risiken und oeffentliche Datenpfade koennen nicht unbemerkt in den Zielbetrieb gelangen.
- Pages und Kubernetes koennen unabhaengig veroeffentlicht, pausiert oder abgeschaltet werden.
- IT-Kollegen erhalten einen klaren Uebergabevertrag statt einer persoenlichen Infrastrukturkopie.
- Release, Rollback und Nachweise lassen sich auf eine konkrete Revision beziehen.

Aufwand:

- Zwei Buildausgaben und zwei Artefaktaudits muessen gepflegt werden.
- Target-Frontend und API brauchen eine gemeinsame Release-/Kompatibilitaetsregel.
- Bestehende Skripte, Pipelines und Dokumentation verwenden die getrennten `dist/pages/`- und `dist/target/`-Artefakte.
- Verbliebene Altzugriffe auf den geschuetzten Ausgangsdatenbestand benoetigen einen dokumentierten Owner und ein Abschaltkriterium.

## Verworfene Alternativen

### `docs/` fuer Pages und Target gemeinsam verwenden

Verworfen, weil ein generierter oeffentlicher Publish-Ordner dann zugleich Zielartefakt waere. Konfigurationsueberschreibung, falsche Freigabe und unklare Herkunft waeren wahrscheinlich.

### Dauerhafte `pages`- und `gke`-Branches

Verworfen, weil Branchdrift, selektive Security-Fixes und unterschiedliche Quellstaende entstehen koennen. Umgebungen sind Deploymentzustand, keine Produktvarianten.

### Sofort zwei Anwendungs-Repositories anlegen

Vorerst verworfen, weil gemeinsame Frontend- und API-Aenderungen dann aufwendig synchronisiert werden muessten. Eine spaetere Aufteilung bleibt moeglich, falls Ownership, Releasefrequenz oder Compliance dies verlangen.

### GitHub Pages als Staging bezeichnen

Verworfen, weil Hosting-, Auth-, Daten- und Netzwerkvertrag nicht dem Zielbetrieb entsprechen. Pages ist nur die synthetische Demo und kann keine Zielbetriebsabnahme ersetzen.

## Durchsetzung und Verifikation

- Buildskripte leeren nur ihren expliziten Zielordner.
- CI prueft Target-Konfiguration und verbotene Supabase-/Secret-Muster.
- Zielpipelines referenzieren weder den historischen `docs/`-Pfad noch einen Pages-Synchronisationswrapper.
- `dist/` wird als Buildausgabe behandelt und nicht manuell editiert.
- `CODEOWNERS`, Environment-Schutz und Change-Verfahren sind vor Ziel-Go-live durch die IT zu bestaetigen.
- Abweichungen benoetigen eine neue ADR oder eine ausdrueckliche Aktualisierung dieser Entscheidung.

## Verwandte Dokumente

- [Deployment-Uebersicht](DEPLOYMENT_UEBERSICHT.md)
- [IT-Uebergabe Zielbetrieb](IT_UEBERGABE_ZIELBETRIEB.md)
- [Zielkonzept gematik Kubernetes](GEMATIK_K8S_ZIELKONZEPT.md)
- [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md)
