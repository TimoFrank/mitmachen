# Release-Kurzanleitung

Stand: 9. August 2026

Diese Seite beschreibt den bewusst einfachen Betriebsmodus. Sie ist die
praktische Checkliste zum ausführlichen
[Produkt-Release-Prozess](PRODUKT_RELEASE_PROZESS.md).

## Ein Versions- und Tagschema

| Anlass | Tag | GitHub-Titel | Ergebnis |
| --- | --- | --- | --- |
| Wochenrelease vor `1.0.0` | `v0.23.0` | `0.23.0-0 Release Candidate` | Prerelease, nicht `Latest` |
| Hotfix vor `1.0.0` | `v0.23.1` | `0.23.1 Release Candidate` | Prerelease, nicht `Latest` |
| gematik Release Candidate | derselbe bereits freigegebene `vX.Y.Z`-Tag | unverändert | frischer OIDC-Build in GitLab/Software Factory |
| erster stabiler Zielbetrieb | `v1.0.0` | `Versorgungs-Kompass 1.0: <Leitthema>` | erst nach verifiziertem gematik-Deployment |

Es gibt keine neuen `poc-*`-, `gematik-*`- oder `rc.N`-Tags. Muss ein Kandidat
korrigiert werden, entsteht eine Patch-Version statt eines verschobenen Tags.

## Freitag: automatisch vorbereiten, manuell freigeben

Der GitHub-Workflow **Prepare weekly release** läuft freitags um 09:17 Uhr
(`Europe/Berlin`).

1. Ohne Änderungen seit dem letzten veröffentlichten `vX.Y.Z`-Tag endet der
   Lauf ohne Versionssprung und ohne Pull Request.
2. Mit Änderungen berechnet er die nächste Minor-Version, erzeugt Changelog,
   Release Notes und Versionsprojektionen und öffnet oder aktualisiert genau
   einen **Draft-PR**.
3. Der Maintainer prüft Leitthema, Notes und Pflichtchecks und mergt den PR
   bewusst nach `main`.
4. Erst danach werden der Tag signiert und das GitHub-Prerelease manuell
   veröffentlicht. Der Freitagsworkflow selbst darf weder mergen noch taggen,
   veröffentlichen oder deployen.

Ein manueller Start desselben Workflows ist jederzeit möglich. Dabei kann ein
Leitthema vorgegeben werden; ohne Eingabe wird es aus den Änderungen abgeleitet.

## Veröffentlichung

Die irreversible Veröffentlichung bleibt ein eigener Vorgang auf einem
sauberen Checkout des gemergten `main`-Commits:

1. vollständige Release-QA und Pages-Build ausführen,
2. den annotierten `vX.Y.Z`-Tag mit dem bei GitHub registrierten Schlüssel
   signieren und mit `git verify-tag vX.Y.Z` prüfen,
3. ausschließlich diesen neuen Tag pushen,
4. Pages aus genau Tag und Commit bauen, deployen und prüfen,
5. den GitHub Release aus den eingecheckten Notes als Prerelease und nicht als
   `Latest` veröffentlichen.

Die vorhandene umfassende Publish-Automatisierung kann später separat aktiviert
werden. Für die Freitagsplanung sind weder ein `release-signing`-Environment
noch zusätzliche Cloud-Rollen erforderlich. GitHub Packages wird für diesen
Release-Kanal nicht benötigt.

## Privates GKE-Prerelease

Das private GKE bleibt ein getrennt freigegebener Referenzkanal und wird nicht
automatisch vom Wochenrelease ausgelöst. Für ein gewünschtes Prerelease:

1. in GitHub Actions **Deploy pre-gematik (GKE Autopilot)** auswählen,
2. den Workflow entsprechend der Environment-Regel auf `main` starten,
3. vor dem Lauf nachweisen, dass der aktuelle `main`-SHA exakt dem Zielcommit
   des signierten Tags `vX.Y.Z` entspricht,
4. `image_tag` auf `vX.Y.Z` setzen; dieses Feld benennt das Image, wählt aber
   nicht selbst den Quellstand aus,
5. zuerst mit `validate_only=true` prüfen,
6. anschließend denselben Stand mit `validate_only=false` bewusst freigeben und
   das Ergebnis im GitHub-Deployment `pre-gematik` prüfen.

Ein fehlgeschlagenes GKE-Deployment verändert weder Tag noch GitHub Release.
Die Korrektur erhält einen neuen Patch-Tag. GKE verwendet IAP und persönliche
GCP-Werte; es ist deshalb kein Nachweis für den gematik-Zielbetrieb.
Ist `main` bereits weitergelaufen, darf der Lauf nicht als Deployment dieses
Release Candidates protokolliert werden. Eine technische Auswahl des
Produkt-Tags im GKE-Workflow bleibt bewusst ein kleiner separater Folgeauftrag.

## gematik Release Candidate

Für einen gematik-Kandidaten wird kein neuer GitHub-Tag erfunden. Aus den
vorhandenen, signierten `vX.Y.Z`-Tags wird genau einer freigegeben. GitLab
beziehungsweise die Software Factory übernimmt diesen Quelltag und baut daraus
Frontend und API neu mit dem OIDC-Zielprofil. Pages- und GKE-Artefakte werden
nicht übernommen.

`v1.0.0` bleibt gesperrt, bis genau dieser Target-Build erfolgreich deployed
und mit OIDC-Smoke sowie Artefaktdigests verifiziert wurde.
