# Produkt-Release-Prozess

Stand: 9. August 2026

Dieses Runbook ist der führende Vertrag für Produktversionen und GitHub
Releases des Versorgungs-Kompass. Die maschinenlesbare Quelle steht in
[`config/release.json`](../../config/release.json). Der Vertrag gilt ab
`v0.23.0`; vorhandene Tags bleiben historische Evidenz.

Die praktische Vier-Schritte-Anleitung steht in der
[Release-Kurzanleitung](RELEASE_KURZANLEITUNG.md). Der aktuelle Betriebsmodus
automatisiert die reversible Vorbereitung eines Draft-PR. Review und Merge
bleiben die bewusste Freigabe durch den Maintainer; unmittelbar danach läuft
die geschützte Kette aus signiertem Tag, unabhängiger Tagprüfung,
Pages-Deployment und unveränderlichem GitHub-Prerelease automatisch. Privates
GKE und gematik-Zielpfad bleiben davon getrennt.

Die einzige neue Quellversionskennung ist ein signierter, annotierter Git-Tag
im Format `vX.Y.Z`. „Release Candidate“ ist für alle `0.x`-Versionen der Status
des GitHub Releases und Bestandteil seines Titels, aber kein Suffix des Tags. Namen wie
`v0.23.0-0`, `v0.23.0-rc` oder `poc-v0.1.0-rc.6` sind für neue Releases nicht
zulässig.

## Begriffe und Auslieferungskanäle

Eine Produktversion bezeichnet einen Quellstand. Ein Deployment bezeichnet die
Auslieferung eines kanalspezifischen Builds. Gleiche Produktversion bedeutet
daher gleiche Quelle, nicht baugleiche Artefakte.

| Kanal | Profil | Identität und Daten | Build und Freigabe |
| --- | --- | --- | --- |
| Pages-Demo | `pages-demo` | öffentlich, anonym, synthetische Daten und freigegebenes öffentliches Verzeichnis | GitHub Actions baut `dist/pages/` und veröffentlicht über `github-pages` |
| privates GKE | `pre-gematik` | IAP, persönliche GCP-Infrastruktur, getrennt freigegebener Datenstand | eigener GKE-Build, manuelle Freigabe über `pre-gematik` |
| gematik-Zielpfad | `target` | OIDC, Zielplattformwerte und getrennt übernommener Datenstand | Die Software Factory baut Target-Frontend und API frisch aus dem signierten Produkt-Tag der führenden Quelle: GitHub bis Cutover, danach GitLab |

Zwischen diesen Kanälen gibt es keine Artefakt-Promotion. Insbesondere werden
IAP-Images oder persönliche GKE-Konfiguration nicht in den gematik-Zielpfad
übernommen. Kanal, Buildprofil, Authentisierung, Commit und Artefaktdigests
stehen im jeweiligen Build- beziehungsweise Deployment-Manifest, nicht in
zusätzlichen Git-Tags.

## Version, Titel und GitHub-Status

| Anlass | Technischer Tag | GitHub-Status | Titel | Versionssprung |
| --- | --- | --- | --- | --- |
| Freitag vor `1.0.0` | `v0.23.0` | GitHub-Prerelease, nicht `Latest` | `0.23.0-0 Release Candidate` | Minor |
| Hotfix vor `1.0.0` | `v0.23.1` | GitHub-Prerelease, nicht `Latest` | `0.23.1 Release Candidate` | Patch |
| Freitag ab `1.0.0` | zum Beispiel `v1.1.0` | Stable und `Latest` | zum Beispiel `Versorgungs-Kompass 1.1: <Leitthema>` | Minor |
| Hotfix ab `1.0.0` | zum Beispiel `v1.1.1` | Stable und `Latest` | `Versorgungs-Kompass 1.1.1 — Hotfix` | Patch |

Technische Tags und Manifestversionen verwenden immer drei Zahlen. Nur der
sichtbare Titel eines stabilen Releases darf bei Patch `0` auf `1.0`, `1.1`
oder `1.2` gekürzt werden. Als verständliche Kandidatenbezeichnungen sind
„Release Candidate“ und, bei einem fachlich eingegrenzten Demonstrator,
„Proof of Concept“ erlaubt; „PoC-Kandidat“ wird nicht verwendet.
Bei einem `0.x`-Wochenrelease kennzeichnet das zusätzliche `-0` ausschließlich
den sichtbaren Prerelease-Titel; es ist weder Teil der Produktversion noch des
Git-Tags. Das allgemeine Titelmuster lautet `X.Y.0-0 Release Candidate`; bei
einem Patch lautet es `X.Y.Z Release Candidate`. Das Leitthema steht in Release
Notes und Changelog, nicht im technischen Tag.

## Freitagsrelease

Der geplante Lauf startet freitags um 09:17 Uhr in der Zeitzone
`Europe/Berlin`.

- Der Workflow `Prepare weekly release` bereitet ausschließlich einen
  Draft-PR vor. Er mergt nicht, erzeugt keinen Tag, veröffentlicht keinen
  GitHub Release und startet kein Deployment.
- Der bewusste Merge eines gültigen, vom Planer erzeugten Release-PR startet
  anschließend automatisch die geschützte Veröffentlichungskette für genau
  diesen Merge-Commit.
- Ohne Änderungen seit dem letzten veröffentlichten Quelltag entsteht kein
  Release-PR, Versionssprung, Tag oder GitHub Release.
- Mit Änderungen wird die Minor-Version erhöht. Ein Patchstand wird dabei
  zurückgesetzt: Auf `v0.23.1` folgt freitags `v0.24.0`.
- Jedes Wochenrelease erhält ein Leitthema, vollständige Release Notes unter
  `dokumentation/release-notes/vX.Y.Z.md`, einen eigenen thematischen Abschnitt
  in `CHANGELOG.md` und einen Eintrag in der In-App-Versionshistorie.
- Die Release Notes trennen nutzerrelevante Änderungen, technische Änderungen,
  Prüfungen und bekannte Einschränkungen.

## Hotfix unter der Woche

Ein Hotfix ist ein außerplanmäßiger Patch-Sprung auf derselben Minor-Linie. Er
erhält kein eigenes Leitthema und keinen neuen thematischen Hauptabschnitt in
Changelog oder In-App-Historie. Die Änderung bleibt dennoch dauerhaft
nachvollziehbar:

- kompakte Release Notes unter `dokumentation/release-notes/vX.Y.Z.md` mit
  Anlass, Korrektur, Risiko und Prüfung,
- ein kompakter Punkt im Format `Hotfix vX.Y.Z` unter dem bestehenden
  Minor-Abschnitt in `CHANGELOG.md`,
- GitHub Release Notes aus derselben Kurznotiz,
- erneute Aufnahme in das Änderungsfenster und Leitthema des nächsten
  tatsächlich stattfindenden Wochenrelease.

Ein bestehender Release wird niemals editiert, ersetzt oder neu getaggt.

## Integrität von Tag und Commit

Jeder neue Tag wird auf dem nachgewiesenen Merge-Commit in `main` signiert und
annotiert. Vor einer Veröffentlichung werden mindestens folgende Nachweise
protokolliert:

- vollständiger Tagname,
- Tag-Objekt-SHA,
- aufgelöster Commit-SHA,
- Signer beziehungsweise Schlüsselfingerprint,
- erfolgreiches `git verify-tag vX.Y.Z`.

Ein grünes „Verified“ bei GitHub kann lediglich die Signatur des Zielcommits
bezeichnen und ersetzt die Prüfung des Tagobjekts nicht. Git-Tags und Releases
sind unveränderlich. Das aktive Tag-Ruleset für `v*` verbietet Aktualisierung
und Löschung; die Release-Immutability schützt zusätzlich den veröffentlichten
GitHub Release. Container- oder Helm-Artefakte erhalten zusätzlich ihre eigenen
Digests und, sobald im jeweiligen Kanal vorgesehen, eine Artefaktsignatur; die
Git-Tag-Signatur ersetzt diese nicht.

## Zielablauf für Produkt-Releases

1. Der Lauf liest die zentrale Produktversion und ermittelt Änderungen seit
   dem relevanten veröffentlichten Quelltag. Ohne Änderungen endet er
   erfolgreich ohne Schreibzugriff.
2. Der Generator berechnet genau eine neue Version und erstellt die zum Anlass
   passenden Release-Unterlagen.
3. Ein Draft-Release-PR aktualisiert zentrale Produktversion, Helm-Projektion,
   Changelog, Release Notes und – nur beim Wochenrelease – In-App-Historie.
   Die vorhandenen Pflichtprüfungen werden für seinen exakten Head-Commit
   angestoßen.
4. Der Maintainer prüft Leitthema, Notes und Checks und integriert den PR
   bewusst nach `main`.
5. Dieses Merge-Ereignis startet automatisch die geschützte
   Veröffentlichungskette. Sie bestätigt zuerst Release-Immutability, das
   `v*`-Tag-Ruleset und den strikten Branchschutz mit `Minimal repository check`
   und `Target-Readiness` und erzeugt dann auf dem nachgewiesenen Merge-Commit
   genau einen signierten, annotierten `vX.Y.Z`-Tag.
6. Ein getrennter Job ohne privaten Schlüssel prüft Tagobjekt, Zielcommit,
   Fingerprint, `git verify-tag` und den GitHub-Verifikationsstatus. Erst danach
   wird die Pages-Demo aus genau diesem Tag gebaut, deployed und per HTTP gegen
   Commit und Profil verifiziert.
7. Erst nach erfolgreicher Pages-Prüfung veröffentlicht die Kette den GitHub
   Release aus den eingecheckten Notes. Vor `1.0.0` ist er ein unveränderliches
   Prerelease und nicht `Latest`; die Stable-Freigabe bleibt dem gesonderten
   Zielbetriebsprozess vorbehalten.

Ein Produkt-Release löst weder das Deployment auf das private GKE noch einen
Build im gematik-Zielpfad aus. Diese Kanäle haben eigene Freigaben und
Nachweise. Ein Abbruch darf weder eine Version überspringen noch einen
vorhandenen Tag verschieben; die Wiederaufnahme akzeptiert einen Zwischenstand
nur, wenn Version, Tag, Commit und Release-Unterlagen exakt zusammenpassen.
Der aktuelle Target-Pfad akzeptiert ausschließlich einen signierten
`vX.Y.Z`-Tag; einen operativen `poc-v…`-Fallback gibt es nicht.

Der Planer gibt dafür genau einen der folgenden Zustände aus:

- `prepare`: Seit dem letzten veröffentlichten Tag liegen Änderungen vor. Der
  Lauf erzeugt die neue Versionsprojektion und anschließend den Release-PR.
- `noop`: Seit dem letzten veröffentlichten Tag liegen keine Änderungen vor.
  Der Lauf endet erfolgreich ohne Versionssprung oder externe Mutation.
- `resume`: Die zentrale Version ist bereits vollständig projiziert. Der Lauf
  setzt genau diesen Commit und einen gegebenenfalls schon vorhandenen exakten
  Tag fort, statt eine weitere Version zu berechnen.

## Release-Artefakte

Der GitHub Release enthält für die öffentliche Demo:

- `versorgungs-kompass-vX.Y.Z-pages.zip`,
- `build-manifest.json` mit Profil, Produktversion, Commit und Inhaltsdigest,
- `SHA256SUMS`.

GitHub ergänzt die Quellarchive des getaggten Commits. Target-, GKE-, Datenbank-
oder Echtdaten-Artefakte werden nicht an den öffentlichen GitHub Release
angehängt. GitHub Packages ist deshalb kein Pflichtbestandteil dieses
Produkt-Release-Kanals; eine spätere Container-Registry-Entscheidung bleibt ein
eigener Infrastrukturvertrag.

Die zentrale Produktversion wird zusätzlich in Build-Manifest, Frontend-SBOM,
Helm-Chart und OCI-Metadaten der Anwendungsimages projiziert. Diese gemeinsame
Kennung belegt die Quelle, nicht die Baugleichheit der Kanäle. Pages-, private
GKE- und Target-Artefakte werden weiterhin getrennt gebaut und nie
kanalübergreifend promotet.

## Freigabe von `v1.0.0`

`v1.0.0` darf erst veröffentlicht und als `Latest` markiert werden, wenn der
gematik-Zielpfad aus dem vorgesehenen Software-Factory-/GitLab-Build erfolgreich
deployed und verifiziert wurde. Der Nachweis umfasst mindestens OIDC,
Ziel-Smoke-Test, Quell-SHA sowie Frontend-Digest, API-Image-Digest und Digest
des gerenderten Helm-Manifests.
Eine erfolgreiche Pages-Demo oder ein Deployment auf das private GKE erfüllt
diese Freigabebedingung ausdrücklich nicht.

Der Übergang von `0.x` auf `1.0.0` ist kein automatischer Freitags- oder
Hotfix-Sprung. Er benötigt eine ausdrückliche Zielbetriebsentscheidung und
läuft einmalig in dieser Reihenfolge:

1. Der Release-PR bereitet Version `1.0.0`, Leitthema und vollständige
   Unterlagen vor und wird nach allen Repository-Gates integriert.
2. Auf dem integrierten Commit wird der signierte, annotierte Tag `v1.0.0`
   erzeugt. Ein GitHub Stable Release wird zu diesem Zeitpunkt noch nicht
   veröffentlicht.
3. Die Pages-Demo wird nach dem regulären Ablauf aus genau diesem Tag gebaut,
   auf öffentliche Pflichtartefakte geprüft, deployed und per HTTP verifiziert.
4. GitLab beziehungsweise die Software Factory baut das OIDC-Target frisch aus
   genau diesem Tag, deployed es in den gematik-Zielpfad und protokolliert
   Quell-SHA, Tagobjekt, OIDC-Smoke und Artefaktdigests.
5. Erst wenn Pages-Gate und Zielprüfung erfolgreich sind, wird der vorbereitete
   GitHub Release mit ZIP, Build-Manifest und Prüfsummen als Stable und `Latest`
   veröffentlicht. Schlägt das Target-Deployment fehl, bleiben Tag und Version
   unverändert; die Veröffentlichung bleibt gesperrt.

Diese ausdrückliche Autorisierung der ersten stabilen Version bleibt der
gesonderte Folgeschritt 6. Weder die Quellübergabe noch ein erfolgreicher
Prerelease-Target-Build schaltet `v1.0.0` automatisch frei.

## Übergabe an GitLab und Software Factory

Das führende operative Runbook ist die
[Übergabe an GitLab und die Software Factory](GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).
Die Übergabe verwendet ein frisch verifiziertes, voraussetzungsfreies
Git-Bundle mit genau `refs/heads/main` und allen Tags. Manifest,
`SHA256SUMS`, dessen abgetrennte Signatur `SHA256SUMS.asc`, Tagobjekt,
Zielcommit und vollständiges Ref-Inventar werden vor und nach dem Import
geprüft; die Paket-Signatur wird vor den enthaltenen Hashwerten authentisiert
und `git fsck --strict --full` muss auf beiden Seiten erfolgreich sein.
Öffentlicher Schlüssel und Fingerprint werden unabhängig und außerhalb des
Pakets als Vertrauensanker bestätigt. Der private Signing-Subkey bleibt in der
geschützten Signierumgebung.

Bis zum Cutover ist GitHub die einzige beschreibbare Integrationslinie, danach
GitLab. Eine bidirektionale Synchronisation ist ausgeschlossen. Die geschützte
GitLab-Pipeline akzeptiert für den manuellen Target-Job nur einen signierten
`vX.Y.Z`-Tag und baut das OIDC-Target frisch aus dessen Commit. Nicht Teil der
Übergabe sind Pages- oder GKE-Artefakte, persönliche GCP-/IAP-Werte, Secrets,
Daten, Snapshots oder OIDC-Subjects. Das Runbook plant den Transfer; ein
GitLab-Projekt, Remote oder Push wird dadurch nicht automatisch angelegt.

## Legacy-Tags

Die Tags `v0.21.0`, `v0.22.0` sowie `poc-v0.1.0-rc.2` bis
`poc-v0.1.0-rc.5` bleiben unverändert. Sie werden weder umbenannt noch
nachsigniert oder neu auf einen anderen Commit gelegt. Ihr historischer
Signaturstatus ist kein Muster für neue Tags. Die neue Regel beginnt mit
`v0.23.0`.

Die RC.2- bis RC.5-Tags und
[`UEBERGABE_RC5_SOFTWARE_FACTORY.md`](UEBERGABE_RC5_SOFTWARE_FACTORY.md) sind
ausschließlich historische Evidenz. Die aktuelle Target-Autorisierung kennt
keinen operativen `poc-v…-rc.N`-Tag. Historische Builds bleiben über ihren
damaligen Quellstand nachvollziehbar, werden aber nicht in die neue
GitLab-Pipeline übernommen oder nachträglich verändert.

## Einfacher Betriebsmodus

Der Freitagsplan ist ohne externe Freigabeschalter aktivierbar, weil seine
einzige Repository-Mutation ein Draft-PR auf `timo/release-vX.Y.Z` ist. Der
Planjob selbst besitzt nur Leserechte. Der anschließende Job darf den
Release-Branch aktualisieren, den Draft öffnen und die vorhandenen
Pflichtworkflows für dessen exakten Head anstoßen. Er wartet nicht auf Checks
und leitet daraus weder Merge noch Veröffentlichung ab.

Manuell und voneinander getrennt bleiben:

- Review und Merge des Release-PR,
- Deployment desselben Tags auf das private GKE,
- Auswahl und Übergabe eines Tags für den gematik-Zielpfad.

Nach dem manuellen Merge übernimmt die aktive Publish-Automatisierung
Signatur und Push des unveränderlichen Tags, seine unabhängige Prüfung, den
Pages-Build samt Deployment und anschließend das GitHub-Prerelease. Die
regelmäßige Draft-Planung selbst benötigt weiterhin weder Zugriff auf das
`release-signing`-Environment noch Cloud-, IAM- oder Datenbankrollen. Die
Veröffentlichung bleibt am Kill-Switch, an vollständiger QA, striktem
Branchschutz, Tag-Signaturprüfung, `v*`-Ruleset und Release-Immutability
fail-closed gebunden.

## Benachrichtigung

Die persönliche E-Mail-Benachrichtigung kommt vom veröffentlichten GitHub
Release. Dafür wird das Repository mit `Watch → Custom → Releases` abonniert;
es gibt keinen SMTP-Schlüssel im Repository. Ein übersprungener Wochenlauf,
Release-PR oder Tag ohne veröffentlichten GitHub Release löst keine
Release-Benachrichtigung aus.
