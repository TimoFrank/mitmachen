# Produkt-Release-Prozess

Stand: 4. August 2026

Dieses Runbook ist der führende Vertrag für Produktversionen und GitHub
Releases des Versorgungs-Kompass. Die maschinenlesbare Quelle steht in
[`config/release.json`](../../config/release.json). Der Vertrag gilt ab
`v0.23.0`; vorhandene Tags bleiben historische Evidenz.

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
| gematik-Zielpfad | `target` | OIDC, Zielplattformwerte und getrennt übernommener Datenstand | Software Factory beziehungsweise später GitLab baut Target-Frontend und API neu |

Zwischen diesen Kanälen gibt es keine Artefakt-Promotion. Insbesondere werden
IAP-Images oder persönliche GKE-Konfiguration nicht in den gematik-Zielpfad
übernommen. Kanal, Buildprofil, Authentisierung, Commit und Artefaktdigests
stehen im jeweiligen Build- beziehungsweise Deployment-Manifest, nicht in
zusätzlichen Git-Tags.

## Version, Titel und GitHub-Status

| Anlass | Technischer Tag | GitHub-Status | Titel | Versionssprung |
| --- | --- | --- | --- | --- |
| Freitag vor `1.0.0` | `v0.23.0` | GitHub-Prerelease, nicht `Latest` | `Versorgungs-Kompass 0.23.0 — Release Candidate: <Leitthema>` | Minor |
| Hotfix vor `1.0.0` | `v0.23.1` | GitHub-Prerelease, nicht `Latest` | `Versorgungs-Kompass 0.23.1 — Release Candidate (Hotfix)` | Patch |
| Freitag ab `1.0.0` | zum Beispiel `v1.1.0` | Stable und `Latest` | zum Beispiel `Versorgungs-Kompass 1.1: <Leitthema>` | Minor |
| Hotfix ab `1.0.0` | zum Beispiel `v1.1.1` | Stable und `Latest` | `Versorgungs-Kompass 1.1.1 — Hotfix` | Patch |

Technische Tags und Manifestversionen verwenden immer drei Zahlen. Nur der
sichtbare Titel eines stabilen Releases darf bei Patch `0` auf `1.0`, `1.1`
oder `1.2` gekürzt werden. Als verständliche Kandidatenbezeichnungen sind
„Release Candidate“ und, bei einem fachlich eingegrenzten Demonstrator,
„Proof of Concept“ erlaubt; „PoC-Kandidat“ wird nicht verwendet.

## Freitagsrelease

Der geplante Lauf startet freitags um 09:17 Uhr in der Zeitzone
`Europe/Berlin`.

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
sind unveränderlich. Container- oder Helm-Artefakte erhalten zusätzlich ihre
eigenen Digests und, sobald im jeweiligen Kanal vorgesehen, eine
Artefaktsignatur; die Git-Tag-Signatur ersetzt diese nicht.

## Zielablauf für Produkt-Releases

1. Der Lauf liest die zentrale Produktversion und ermittelt Änderungen seit
   dem relevanten veröffentlichten Quelltag. Ohne Änderungen endet er
   erfolgreich ohne Schreibzugriff.
2. Der Generator berechnet genau eine neue Version und erstellt die zum Anlass
   passenden Release-Unterlagen.
3. Ein Release-PR aktualisiert zentrale Produktversion, Changelog, Release
   Notes und – nur beim Wochenrelease – In-App-Historie. Repository- und
   Browserprüfungen laufen auf seinem exakten Head-Commit.
4. Der geprüfte PR wird nach `main` integriert. Eine Änderung von `main`
   zwischen Planung und Merge bricht den Lauf fail-closed ab.
5. Auf dem nachgewiesenen Merge-Commit wird genau ein signierter, annotierter
   `vX.Y.Z`-Tag erzeugt und verifiziert.
6. Die Pages-Demo wird aus genau diesem Tag gebaut, geprüft, deployed und per
   HTTP gegen Commit und Profil verifiziert.
7. Erst danach wird der GitHub Release aus den eingecheckten Notes
   veröffentlicht: vor `1.0.0` als Prerelease, danach als Stable Release.

Ein Produkt-Release löst weder das Deployment auf das private GKE noch einen
Build im gematik-Zielpfad aus. Diese Kanäle haben eigene Freigaben und
Nachweise. Ein Abbruch darf weder eine Version überspringen noch einen
vorhandenen Tag verschieben; die Wiederaufnahme akzeptiert einen Zwischenstand
nur, wenn Version, Tag, Commit und Release-Unterlagen exakt zusammenpassen.

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

## Freigabe von `v1.0.0`

`v1.0.0` darf erst veröffentlicht und als `Latest` markiert werden, wenn der
gematik-Zielpfad aus dem vorgesehenen Software-Factory-/GitLab-Build erfolgreich
deployed und verifiziert wurde. Der Nachweis umfasst mindestens OIDC,
Ziel-Smoke-Test, Quell-SHA und die Digests von Frontend, API-Image und Chart.
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

## Übergabe an GitLab und Software Factory

Bis zur institutionellen Übernahme bleibt GitHub die führende
Integrationslinie. Die spätere Übergabe erfolgt über vollständige Git-Objekte
und den freigegebenen signierten Tag, nicht als ZIP eines Arbeitsordners. Auf
GitHub und GitLab werden Tag-Objekt-SHA und aufgelöster Commit-SHA verglichen.
Die Software Factory baut das OIDC-Target frisch aus diesem Commit.

Nicht Teil der Übergabe sind Pages- oder GKE-Artefakte, persönliche
GCP-/IAP-Werte, Secrets, Daten, Snapshots oder OIDC-Subjects. Nach dem Cutover
gibt es genau eine beschreibbare führende `main`-Linie; eine bidirektionale
Parallelpflege von GitHub und GitLab ist nicht zulässig. Die technische
Migration der bestehenden Target-Pipeline wird in einem eigenen Schritt
umgesetzt.

## Legacy-Tags

Die Tags `v0.21.0`, `v0.22.0` sowie `poc-v0.1.0-rc.2` bis
`poc-v0.1.0-rc.5` bleiben unverändert. Sie werden weder umbenannt noch
nachsigniert oder neu auf einen anderen Commit gelegt. Ihr historischer
Signaturstatus ist kein Muster für neue Tags. Die neue Regel beginnt mit
`v0.23.0`.

## Temporäre Freitags-Sperre

Die Automatisierung bildet diesen Vertrag technisch ab, wird aber erst nach dem
abschließenden Signatur- und Dry-Run-Nachweis aktiviert. Zwei unabhängige
Schalter sichern die Übergangsphase fail-closed:

- Der geplante Freitagslauf startet nur, wenn
  `WEEKLY_RELEASE_SCHEDULE_ENABLED=true` **und**
  `PRODUCT_RELEASE_PUBLISH_ENABLED=true` gesetzt sind. Solange einer der beiden
  Schalter fehlt oder einen anderen Wert hat, endet der Schedule-Lauf ohne
  Planung oder Mutation.
- Ein manueller Lauf bleibt unabhängig davon möglich, startet aber ohne die
  ausdrücklich gewählte Publish-Option immer nur im schreibfreien Planmodus.

Ein manueller Start verwendet standardmäßig den schreibfreien Planmodus. Er
liest weder den privaten Signierschlüssel noch verändert er Branches, Tags,
Releases oder Deployments. Vor der Aktivierung werden im gesonderten
`release-signing`-Environment der private dedizierte OpenPGP-Signiersubkey und
seine Passphrase sowie ein ablaufender, auf dieses Repository und
`Administration: read` begrenzter Governance-Token provisioniert. Dieser Token
prüft ausschließlich Release-Immutability und Branchschutz per read-only API.
Der Branchschutz läuft in einem Job ohne Checkout; die beiden
Immutability-Abfragen liegen jeweils in einem eigenen Schritt ohne npm oder
Repository-Skript unmittelbar vor Tag und Veröffentlichung. Die eigentlichen
Mutationsschritte erhalten den Token nicht. Fehlende oder ungültige
Berechtigung blockiert vor Release-PR, Tag und Veröffentlichung.
Öffentlicher Schlüssel, erwarteter
Subkey-Fingerprint und Signer-Identität werden getrennt als nicht geheime
Repository-Variablen hinterlegt. Danach folgen ein
lokaler Signaturtest ohne Push, ein vollständiger kontrollierter Dry-Run und ein
Tag-Ruleset gegen Aktualisierung und Löschung. Zusätzlich müssen die
Release-Immutability sowie der strikte `main`-Branchschutz mit den erforderlichen
Checks `Minimal repository check` und `PoC-/Target-Readiness` per read-only
API-Nachweis bestätigt sein. Erst anschließend werden zuerst der
Publish-Schalter und zuletzt der Freitagsplan freigegeben.

## Benachrichtigung

Die persönliche E-Mail-Benachrichtigung kommt vom veröffentlichten GitHub
Release. Dafür wird das Repository mit `Watch → Custom → Releases` abonniert;
es gibt keinen SMTP-Schlüssel im Repository. Ein übersprungener Wochenlauf,
Release-PR oder Tag ohne veröffentlichten GitHub Release löst keine
Release-Benachrichtigung aus.
