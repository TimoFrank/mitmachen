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

## Freitag: automatisch vorbereiten, bewusst mergen

Der GitHub-Workflow **Prepare weekly release** läuft freitags um 09:17 Uhr
(`Europe/Berlin`).

1. Ohne Änderungen seit dem letzten veröffentlichten `vX.Y.Z`-Tag endet der
   Lauf ohne Versionssprung und ohne Pull Request.
2. Mit Änderungen berechnet er die nächste Minor-Version, erzeugt Changelog,
   Release Notes und Versionsprojektionen und öffnet oder aktualisiert genau
   einen **Draft-PR**.
3. Der Maintainer prüft Leitthema, Notes und Pflichtchecks und mergt den PR
   bewusst nach `main`.
4. Dieser Merge ist die Freigabe: Direkt danach startet automatisch die
   geschützte Kette aus signiertem Tag, unabhängiger Tagprüfung,
   Pages-Deployment und unveränderlichem GitHub-Prerelease. Der
   Freitagsworkflow selbst mergt weiterhin nicht.

Ein manueller Start desselben Workflows ist jederzeit möglich. Dabei kann ein
Leitthema vorgegeben werden; ohne Eingabe wird es aus den Änderungen abgeleitet.

## Veröffentlichung

Die Veröffentlichung startet nur nach dem bewussten Merge eines gültigen
Release-PR und bleibt an dessen exakten `main`-Merge-Commit gebunden:

1. Die Kette bestätigt Release-Immutability, das `v*`-Tag-Ruleset und den
   strikten Branchschutz mit `Minimal repository check` und
   `Target-Readiness`.
2. Sie führt die vollständige Release-QA aus, signiert genau einen annotierten
   `vX.Y.Z`-Tag und pusht ihn ohne Force-Option.
3. Ein separater Job ohne privaten Schlüssel prüft Signer, Tagobjekt,
   Zielcommit, `git verify-tag` und den GitHub-Verifikationsstatus.
4. Pages wird aus genau Tag und Commit gebaut, deployed und öffentlich geprüft.
5. Erst danach wird der GitHub Release aus den eingecheckten Notes als
   unveränderliches Prerelease und nicht als `Latest` veröffentlicht.

Die Publish-Automatisierung ist aktiv und wird durch den fail-closed
Kill-Switch `PRODUCT_RELEASE_PUBLISH_ENABLED` sowie das geschützte
`release-signing`-Environment begrenzt. Die reine Freitagsplanung erhält keinen
Zugriff auf Signierschlüssel oder Governance-Token. Ein abgebrochener Lauf wird
nur für denselben exakten Commit und Tag wiederaufgenommen; es wird keine
weitere Version berechnet. GitHub Packages wird für diesen Release-Kanal nicht
benötigt.

Vor der ersten Publikation und nach Änderungen an Schlüssel oder Governance-
Token muss **Release signing readiness** auf `main` erfolgreich sein. Dieser
manuelle Prüflauf signiert ausschließlich eine temporäre Probe und erzeugt
weder Tag noch Release oder Deployment.

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
