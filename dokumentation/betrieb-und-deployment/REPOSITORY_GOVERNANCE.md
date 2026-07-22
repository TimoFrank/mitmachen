# Repository-Governance vor PoC und späterem Regelbetrieb

Stand: 22. Juli 2026

Ein Teil dieser Einstellungen liegt außerhalb des Git-Repositories. Der technische Basisschutz ist aktiv. Für den aktuellen Gematik-PoC werden ein sauberer, unveränderlicher RC und die vereinbarten Prüfungen benötigt. Weitere Organisationsregeln werden erst bei einem späteren Ausbau festgelegt.

## 1. Default Branch `main`

- Pull Request vor Merge verpflichtend.
- Pull Requests, der erforderliche Check `Minimal repository check`, aufgelöste Review-Kommentare sowie das Verbot von Force Push und Branch-Löschung sind aktiv.
- Solange nur ein Maintainer vorhanden ist, sind formal null externe Freigaben erforderlich; vor Pilotbetrieb mindestens eine bestätigte Review festlegen.
- Für Deployment-/Security-Pfade nach Aktivierung von CODEOWNERS eine Code-Owner-Review verlangen.
- Eigene Freigabe des letzten Pushers ausschließen, sobald ein zweiter bestätigter Reviewer zur Verfügung steht und der GitHub-Tarif dies unterstützt.
- Offene Review-Kommentare müssen vor Merge aufgelöst sein.
- `Zielbetriebs-Check` vor Pilotbetrieb als erforderlichen Check aufnehmen oder ohne Pfadfilter immer bereitstellen; derzeit ist er ein zusätzlicher, pfadbezogener Nachweis.
- Administrator-Bypass für den Zielbetriebsprozess deaktivieren oder als dokumentierten Break-glass-Prozess mit Nachkontrolle behandeln.

Der Weekly-Release-Prozess erzeugt weiterhin einen Pull Request und darf diese
Grenze nicht durch einen direkten Bot-Push umgehen. Die redaktionelle Freigabe
ist in der Ein-Personen-Phase ausgesetzt: Der Automations-PR benötigt keine
zustimmende Review, wird aber erst nach dem erforderlichen Check auf seinem
exakten Head-Commit automatisch gemergt. Ändert sich `main` währenddessen,
bricht der Lauf ab und muss den Release neu planen.

Öffentliche Produkt-Releases folgen dem Schema `vX.Y.Z`. Nach dem Merge werden
der exakte Commit erneut geprüft, das synthetische Pages-Artefakt gebaut und
deployed und erst danach ein annotierter Einzel-Tag sowie ein GitHub Release
veröffentlicht. Patch-Releases können manuell angestoßen werden; Wochen ohne
Änderungen erzeugen keinen Release. GitHub benachrichtigt die Release-Abonnenten
erst nach der Veröffentlichung. Produkt-Releases lösen niemals automatisch
einen PoC- oder Zielbetrieb-Deploy aus.

## 2. GitHub Environment `github-pages`

- GitHub Pages verwendet bereits `GitHub Actions` als Source und veröffentlicht `dist/pages/` direkt.
- Deployment-Branch ist auf `main` beschränkt.
- Keine GCP-, Supabase-Service-Role- oder Zielbetriebs-Secrets hinterlegen.
- Pages bleibt die dauerhaft getrennte, öffentliche Demo und ist kein Freigabenachweis für GKE.

## 3. GitHub Environment `pre-gematik`

- Derzeit ist nur `main` zugelassen.
- `TimoFrank` ist während der Ein-Personen-Pre-Integration Required Reviewer; Selbstfreigabe ist deshalb technisch erlaubt. Vor Pilotbetrieb Reviewer aus Plattformbetrieb und Produktverantwortung festlegen und Selbstfreigabe ausschließen.
- WIF-Provider weiterhin auf Repository, Environment und freigegebene Git-Referenz begrenzen.
- Nur nicht geheime Zielparameter als Environment-Variablen führen.
- Keine Service-Account-JSON-Datei, kein Datenbankpasswort und keine OAuth-Clientwerte in GitHub speichern.
- `prevent self-review` und `disallow admin bypass` aktivieren, wenn Tarif und Organisationsrichtlinie dies erlauben.

Die frühere [persönliche Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) gilt nur für die GCP-Pre-Integration. Das persönliche GCP-Projekt und persönliche Break-glass-Konto werden nicht für den gematik-PoC übernommen.

## 4. gematik-PoC und Release Candidate

- `main` bleibt Integrationslinie und Pages-Quelle; der PoC wird niemals automatisch aus dem jeweils neuesten `main` deployed.
- Ein kurzlebiger Stabilisierungsbranch ist zulässig, aber keine Umgebung. Verbindlich ist ein annotierter, nie bewegter Tag wie `poc-v0.1.0-rc.1` auf einem sauberen Commit.
- Ein Fix erzeugt `rc.2`. RC-Tags werden weder verschoben noch durch `git push --force` ersetzt.
- Die gematik Software Factory baut die eindeutig referenzierte Revision und dokumentiert Image-Digest, Frontend-Revision, Chart, Schema und Datenrichtlinie. Zeitpunkt, Prüfsumme und Ergebnis der geschützten Datenübernahme werden getrennt vom Build festgehalten.
- Wegen der zuvor bereinigten Git-Historie können alte lokale Tags existieren, die es auf `origin` nicht mehr gibt. Für den ersten RC ist ein frischer Clone mit `--no-tags` die sicherste Ausgangsbasis; niemals pauschal `git push --tags`, sondern nur den ausdrücklich freigegebenen RC-Tag pushen.
- Ein ZIP des lokalen Arbeitsverzeichnisses, uncommittete Dateien, `dist/pages/` und lokale Exporte gehören nicht ins Übergabepaket.
- Ein möglicher späterer Regelbetrieb wird nicht als unkontrolliertes Environment des persönlichen GitHub-Repositories angelegt und benötigt eine eigene Freigabe.

Das aktuelle Vorgehen steht im
[PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md).

## 5. Actions- und Abhängigkeitsrichtlinie

- Standardberechtigung für `GITHUB_TOKEN`: read-only; Schreibrechte nur jobbezogen.
- Externe Actions nur mit voller Commit-SHA, nicht nur mit beweglichem Tag.
- Dependabot für npm, GitHub Actions und den API-Docker-Build ist vorbereitet.
- Die zulässigen Actions/Organisationen nach interner Supply-Chain-Richtlinie beschränken.
- Selbst gehostete Runner als nicht isolierte Infrastruktur behandeln und Secretzugriff entsprechend begrenzen.

## 6. Roadmap- und Backlog-Pflege

- Milestones bündeln Issues nach Lieferziel oder Release. Der Fortschritt ergibt sich aus den tatsächlichen Issue-Zuständen, nicht aus manuell duplizierten Checklisten.
- GitHub Projects pflegt Reihenfolge, Phase, Priorität und teamübergreifende Statusfelder in geeigneten Views.
- Einzel-Issues bleiben die Quelle für Scope, Abhängigkeiten, Akzeptanzkriterien und aktuelle Testnachweise.
- Roadmap-Zusammenfassungen verlinken Milestone, Project-View, Issues, Pull Requests oder Tests auf dem aktuellen Standardbranch. Commit-SHAs aus umgeschriebener oder bereinigter Historie sind kein dauerhafter Statusnachweis.
- Abgeschlossene Roadmap-Issues werden geschlossen und bleiben als historische Zusammenfassung unverändert.

## 7. CODEOWNERS

`.github/CODEOWNERS` ist aktiv und nennt mit `@TimoFrank` ausschließlich einen bestätigten, realen Repository-Account. Damit ist heute eindeutig sichtbar, wer Änderungen an Anwendung, Deployment, Datenvertrag und Sicherheitsgrenzen fachlich beziehungsweise technisch prüfen muss. Sobald institutionelle Produkt-, Plattform-, Daten- und Security-Teams in der Zielorganisation existieren, ersetzt die Repository-Administration diesen Übergangs-Owner durch die bestätigten Teamhandles. Eine verpflichtende Code-Owner-Freigabe wird erst aktiviert, wenn mindestens eine zweite unabhängige Person reviewen kann.

## 8. Nachweis

Die wirksamen Einstellungen werden vor dem PoC kurz im Release-Nachweis referenziert. Abweichungen erhalten Ansprechperson und Frist.
