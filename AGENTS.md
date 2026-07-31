# Codex-Arbeitsregeln für den Versorgungs-Kompass

## Geltungsbereich und Priorität

Diese Datei gilt ab dem Repository-Root für alle Aufgaben in diesem Projekt.
Eine näher am bearbeiteten Pfad liegende `AGENTS.md` darf sie für diesen
Teilbereich präzisieren. Die persönliche `~/.codex/AGENTS.md` bleibt zusätzlich
wirksam.

Fachliche Produkt-, Security-, Datenschutz-, QA- und Deployment-Vorgaben bleiben
verbindlich. Für die operative Git-, Worktree-, Scope- und Abschlusslogik ist
diese Datei gegenüber widersprüchlichen älteren Projekttexten maßgeblich. Sie
senkt keine fachlichen oder technischen Gates ab.

Vor Änderungen die für den Auftrag relevanten Quellen lesen:

- `CONTRIBUTING.md`
- `dokumentation/entwicklung-und-qa/PROJEKTREGELN.md`
- `dokumentation/entwicklung-und-qa/QA_WORKFLOW.md`
- `dokumentation/entwicklung-und-qa/CURRENT_STATE.md`
- `dokumentation/betrieb-und-deployment/REPOSITORY_GOVERNANCE.md`
- bei Releases zusätzlich
  `dokumentation/betrieb-und-deployment/PRODUKT_RELEASE_PROZESS.md`

## Verbindliches Arbeitsmodell

- `main` ist die geschützte Integrationslinie und ein sauberer Referenzstand,
  kein Arbeitsbranch.
- Jede kohärente umzusetzende Änderung entspricht einem Auftrag, einem
  benannten Branch, einem isolierten Worktree und einem Pull Request. Ein Chat
  verfolgt nur einen solchen Liefergegenstand.
- Neue Implementierungen niemals direkt im primären `main`-Checkout beginnen.
- Parallele Aufträge verwenden getrennte Worktrees. Mehrere Agenten innerhalb
  desselben Auftrags arbeiten im selben vereinbarten Scope und erzeugen nicht
  eigenmächtig konkurrierende Implementierungsbranches. Genau ein
  koordinierender Agent verantwortet Staging und Commit; weitere Agenten
  arbeiten read-only oder in vorab klar getrennten Dateibereichen.
- Branches beginnen mit `timo/` und beschreiben Art und Ergebnis, zum Beispiel
  `timo/feat-patienten-workspace` oder `timo/fix-identity-login`.
- Kein direkter Push auf `main`. Integration erfolgt ausschließlich per Pull
  Request unter Beachtung des Branchschutzes.
- Ein Worktree isoliert Dateien; erst Branch und Commit sichern Arbeit dauerhaft.
  In einem detached Codex-Worktree vor dauerhaften Commits einen benannten
  Branch anlegen.
- Stark gemeinsam genutzte Dateien wie globale App-Einstiege, zentrale
  Stylesheets, Workflows, Lockfiles oder Deployment-Konfiguration nicht
  gleichzeitig in unabhängigen Aufträgen ändern. Diese Arbeiten serialisieren
  oder mit einer ausdrücklich dokumentierten Abhängigkeit stapeln.

## Preflight vor jeder Dateiänderung

Vor der ersten Änderung:

1. `git fetch --prune origin` ausführen, soweit Netzwerk und Berechtigung dies
   erlauben.
2. Branch, `git status --short --branch`, vorhandene Worktrees, relevante
   Remote-Branches und offene Pull Requests prüfen.
3. Gegen `origin/main` feststellen, ob die gewünschte Änderung bereits
   integriert, nur ähnlich umgesetzt, in einem offenen Pull Request enthalten
   oder tatsächlich neu ist.
4. Den vorgesehenen Aufgaben-Scope und die Ausgangsrevision benennen.
5. Einen sauberen Aufgaben-Worktree direkt von aktuellem `origin/main` oder von
   einer ausdrücklich genannten Basis erstellen.

Branchname, Dateiname oder ein früheres Deployment sind kein Beleg für eine
Integration. Maßgeblich sind Diff, Commit-Historie, Pull Request, Merge-SHA und
der tatsächlich deployte SHA.

Solange der primäre `main`-Checkout uncommittete oder unversionierte Inhalte
enthält oder hinter `origin/main` liegt:

- ist er nur Inventar- und Rettungsquelle für bestehende Arbeit;
- entstehen dort keine neuen Produktänderungen;
- werden dort weder `reset`, `stash`, `clean`, `pull`, Checkout-Wechsel noch
  pauschale Löschungen vorgenommen, sofern der Nutzer nicht den exakt
  betroffenen Bestand ausdrücklich freigegeben hat;
- darf er nicht als Basis eines neuen Codex-Worktrees gewählt werden, weil
  lokale Änderungen sonst mitkopiert werden können;
- werden zusammengehörige Änderungen zuerst klassifiziert und anschließend
  selektiv in einen sauberen Aufgaben-Worktree übertragen.

Bestehende Änderungen des Nutzers oder anderer Aufträge niemals verwerfen,
überschreiben oder still umformatieren.

## Aufträge verstehen und den Nutzer führen

Jeden Auftrag vor der Umsetzung intern in diesen Vertrag übersetzen:

- **Ziel:** Welches konkrete Ergebnis soll entstehen?
- **Kontext:** Welche Komponenten, Dateien, Umgebungen und Vorarbeiten sind
  betroffen?
- **Constraints:** Was darf nicht verändert, vermischt, veröffentlicht oder mit
  echten Daten ausgeführt werden?
- **Done when:** Welche fachlichen und technischen Nachweise machen den Auftrag
  fertig?
- **Zielstufe:** Bis wohin soll Codex den Auftrag führen?

Fehlende Angaben soweit sicher aus Repository und Gespräch ableiten und
wesentliche Annahmen kurz nennen. Nicht vom Nutzer verlangen, diesen Vertrag
vollständig selbst zu formulieren. Nur stoppen und fragen, wenn eine fehlende
Entscheidung Scope, Produktverhalten, Security, personenbezogene oder
produktive Daten, Kosten, irreversible Aktionen oder eine externe
Veröffentlichung wesentlich verändert.

Empfohlene Prompt-Struktur:

```text
Ziel: ...
Kontext: ...
Constraints: ...
Done when: ...
Zielstufe: lokal geprüft | PR-bereit | integriert | deployed | vollständig geschlossen
```

## Zielstufen und eindeutige Begriffe

| Zielstufe | Erforderlicher Nachweis |
| --- | --- |
| **Analysiert** | Ursache, Bestand oder Vorgehen ist geklärt; keine Umsetzung wird behauptet. |
| **Lokal geprüft** | Der isolierte Aufgaben-Scope ist umgesetzt und mit passender lokaler QA geprüft; Commit und Push sind noch nicht zwingend erfolgt. |
| **PR-bereit** | Der Scope ist gezielt committed, der Aufgabenbranch gepusht, ein Pull Request angelegt und die erforderlichen Checks sind erfolgreich. |
| **Integriert** | Der Pull Request ist unter Beachtung der Gates in `main` gemergt und der erwartete Inhalt in `origin/main` nachgewiesen. |
| **Deployed** | Der freigegebene integrierte Commit oder unveränderliche RC-Tag ist in die richtige Zielumgebung ausgeliefert und dort passend verifiziert. |
| **Vollständig geschlossen** | Integration und gegebenenfalls Deployment sind verifiziert; beim autorisierten PoC-RC ist stattdessen der unveränderliche Tag samt Reconciliation-Entscheidung nachgewiesen. Keine aufgabenbezogene Restarbeit ist offen, bewusst ausgelagerte Folgearbeit ist separat dokumentiert und Branch sowie Worktree sind sicher bereinigt. |

`commit`, `push`, `Pull Request`, `Merge`, `GitHub Pages`, geschütztes Backend
und `live` strikt unterscheiden. Ein Push ist weder ein Merge noch ein
Deployment. Eine erfolgreiche Pages-Demo belegt nicht die geschützte
Realanwendung. `validate_only` ist kein Live-Deployment.

Ein Deployment eines Feature-Branches ersetzt niemals die Integration in
`main`. Wurde ein Branch bereits deployed, ohne integriert zu sein, bleibt er
erhalten, bis ein Reconciliation-Pull-Request den ausgelieferten Stand sauber in
`main` überführt und verifiziert hat.

## Autonom handeln oder fragen

- Bei Analyse-, Review-, Erklär- oder Statusaufträgen nur lesend arbeiten,
  solange keine Umsetzung verlangt wird.
- Bei einem klaren Änderungsauftrag die Änderung in einem isolierten Worktree
  umsetzen und die passende lokale QA selbstständig durchführen.
- Nennt der Nutzer keine Lieferstufe, zunächst **Lokal geprüft** erreichen und
  danach aktiv zur empfohlenen nächsten Stufe führen.
- Verlangt der Nutzer ausdrücklich `commit`, `push`, `Pull Request`, `merge`,
  `deploy`, `live stellen`, `veröffentlichen` oder `vollständig abschließen`,
  ohne redundante Rückfrage bis zur genannten Zielstufe arbeiten. Nur bei einem
  fehlgeschlagenen Gate, fehlender Berechtigung oder Freigabe, relevantem
  Scope-Konflikt oder produktivem Risiko stoppen.
- `commit` bedeutet nur einen lokalen Commit auf dem Aufgabenbranch. `push`
  bedeutet Commit, soweit erforderlich, und Push dieses Branches. Ein
  Pull-Request-, Merge- oder Deployment-Ziel schließt seine notwendigen
  Vorstufen ein.
- `deploy`, `live stellen` oder `veröffentlichen` bedeutet nicht, einen
  ungeprüften Branch auszuliefern. Für Pages und reguläre Target-Pfade zuerst
  PR, Checks und Integration, danach den exakten freigegebenen `main`-Commit
  deployen und verifizieren. Der gematik-PoC ist die dokumentierte Ausnahme:
  Er darf nur gemäß PoC-/RC-Runbook und dessen Gates aus einem autorisierten,
  unveränderlichen RC-Tag ausgeliefert werden. Abweichungen zu `main` und die
  Reconciliation-Entscheidung müssen nachvollziehbar dokumentiert sein.
- Bei fehlgeschlagenen Checks, unklarer fachlicher Freigabe oder einer
  unerwarteten Scope-Erweiterung nicht pushen, mergen oder deployen, bis der
  Nutzer den konkreten Ausnahmeweg bestätigt hat.

Wenn eine Zielstufe nicht vorgegeben ist, immer nur die unmittelbar nächste
Entscheidung mit einer klaren Empfehlung erfragen:

- Nach lokaler QA: „Die Änderung ist lokal geprüft. Empfohlen ist jetzt Commit,
  Push und ein Draft-PR, damit sie nicht als loser Arbeitsstand liegen bleibt.
  Soll ich das ausführen?“
- Nach grünem PR: „Der PR ist vollständig geprüft. Empfohlen ist jetzt der
  Squash-Merge nach `main`. Soll ich ihn integrieren?“
- Nach Integration mit Veröffentlichungsabsicht: „Die Änderung ist in `main`.
  Empfohlen ist jetzt das Deployment dieses exakten SHA mit anschließender
  Zielprüfung. Soll ich fortfahren?“
- Nach verifiziertem Abschluss: „Integration und gegebenenfalls Deployment sind
  verifiziert. Soll ich Branch und Worktree jetzt sicher bereinigen?“

Nicht vorzeitig fragen: Erst Scope, Diff und relevante Tests klären. Keine
abstrakte Optionsliste und nicht die gesamte Lieferkette auf einmal abfragen.
Die Empfehlung nennt knapp, warum der nächste Schritt für diesen Auftrag richtig
ist.

## Scope-, Commit- und Artefaktdisziplin

- Nie `git add .`, `git add -A` oder einen pauschalen Commit in einem gemischten
  Worktree verwenden.
- Nur exakte Pfade oder Hunks des inventarisierten Auftrags stagen, bevorzugt
  mit `git add -p`, und den staged Diff vor dem Commit vollständig prüfen.
- Auch „alle Änderungen pushen“ ist keine Freigabe, fremde, unklare oder
  unabhängige Änderungen gemeinsam zu committen. Zuerst jeden Bestand einem
  Zweck, Auftrag und Ziel-PR zuordnen; bei echter Mehrdeutigkeit den Nutzer
  gezielt fragen.
- Ein Pull Request enthält nur ein kohärentes Ergebnis. Notwendige UI-, API-,
  Migrations- und Dokumentationsänderungen dürfen zusammengehören; zufällig
  gleichzeitig vorhandene Änderungen nicht.
- Generierte `dist/`-Inhalte werden nicht committed.
- Temporäre Builds, Screenshots, Reports, Testresultate, Office-Zwischenstände
  und Exporte in ignorierten Arbeitsverzeichnissen oder außerhalb des
  Repository-Roots, bevorzugt unter `$TMPDIR`, erzeugen.
- Keine `.artifact-*`, `.tmp-*`, Office-Buildordner oder sonstigen
  Scratch-Dateien im Repository-Root zurücklassen.
- Vor dem Commit auf Secrets, personenbezogene oder produktive Daten, lokale
  Pfade, Dokumentmetadaten, große Binärdateien und versehentlich erzeugte
  Artefakte prüfen.

## QA und visuelle Prüfung

Die kleinstmögliche ausreichende Stufe aus
`dokumentation/entwicklung-und-qa/QA_WORKFLOW.md` verwenden:

- Kleine Text-, Doku- oder eng begrenzte Korrektur: `npm run qa:small`.
- Fokussierte UI-/Flow-Änderung: `npm run check` plus passender gezielter
  Playwright-Test. Desktop und Mobile gemäß den Auslösern im QA-Workflow prüfen,
  insbesondere bei Navigation, Sidebar, Tabellenbreite, Drawer, Karte,
  Profilseite oder Breakpoints.
- Größere Änderung sowie jeder Push-/Deploy-Auftrag: `npm run qa:full`.
- Pages-Auftrag zusätzlich: `npm run build:pages`; `dist/pages/` bleibt
  unversioniert.
- Nach jedem Push-, Deploy- oder GitHub-Pages-Auftrag nach dem Push
  `npm run verify:publication` gemäß QA-Workflow ausführen. Dieser Nachweis
  prüft ausschließlich den aktuellen öffentlichen Pages-Demo-Vertrag. Bei
  einem Feature-Branch-Push weiterhin ausdrücklich `nicht veröffentlicht`
  melden; der Check beweist nicht, dass dieser Branch live ist.
- Für einen gematik-PoC-RC gelten zusätzlich die RC-, Target-, API-, Security-,
  Deployment- und Smoke-Gates aus dem QA-Workflow auf einem sauberen Checkout
  des exakten Commits.

Nach jeder sichtbaren Web-Änderung das Ergebnis in einem echten Browser rendern,
die relevanten Zustände per Playwright prüfen und mindestens eine anklickbare
Screenshot-Vorschau bereitstellen. Weitere Viewports nur, wenn sie materiell
andere Risiken abdecken.

## Pull Request, Merge, Deployment und Cleanup

Vor einem Pull Request:

1. Aufgaben-Scope und staged Diff erneut prüfen.
2. Passende QA erfolgreich ausführen. Vor jedem PR mindestens die in
   `CONTRIBUTING.md` verlangten `npm run check` und `npm run build:pages`
   nachweisen; bereits in einer höheren QA-Stufe enthaltene Befehle nicht
   unnötig doppelt ausführen.
3. Commit mit verständlicher Ergebnisbeschreibung erstellen.
4. Aufgabenbranch pushen und PR mit Scope, Tests, Risiken sowie explizit
   ausstehenden Schritten anlegen.
5. Checks und Review-Kommentare verfolgen und innerhalb des Scopes beheben.

Vor dem Merge müssen erforderliche Checks grün, Review-Kommentare geklärt und
der erwartete PR-Head bekannt sein. Bevorzugt per Squash-Merge integrieren.
Danach `origin/main` aktualisieren und Merge-SHA sowie Inhalt nachweisen.

Deployment erfolgt nur aus dem nachgewiesenen integrierten Commit oder einem
ausdrücklich freigegebenen unveränderlichen RC-Tag. Pages, Target/GKE,
Backend-/DB-Migration und Identity jeweils getrennt verifizieren und im
Abschluss getrennt ausweisen.

Branch oder Worktree erst entfernen, wenn:

- der benötigte Inhalt nachweislich in `origin/main` liegt oder bewusst verworfen
  und exakt freigegeben wurde; bei einem autorisierten PoC-RC darf er alternativ
  durch einen unveränderlichen Tag gesichert sein, wenn die
  Reconciliation-Entscheidung ausdrücklich dokumentiert ist;
- kein offener Pull Request und keine benötigten einzigartigen Commits mehr
  existieren;
- der zugehörige Worktree keine uncommitteten oder unversionierten
  aufgabenrelevanten Inhalte enthält;
- kein laufender Codex-Task oder Agent diesen Branch oder Worktree noch
  verwendet.

Zuerst den sauberen Worktree entfernen, danach lokalen Branch und
Remote-Branch-Status prüfen. Die automatische Remote-Löschung nach dem Merge
verifizieren; einen noch vorhandenen Aufgabenbranch nach bestandenem
Sicherheitscheck entfernen. Branchlöschung allein entfernt keine uncommittierten
Dateien eines Worktrees.

Bei einer Branch-Aufräumaufgabe jeden Kandidaten als `gemergt`,
`patch-äquivalent in main`, `offener PR`, `einzigartige Commits`,
`uncommittierter Worktree`, `bewusst verworfen und ausdrücklich freigegeben`,
`durch autorisierten unveränderlichen RC-Tag gesichert` oder `unklar`
klassifizieren. Nur `gemergt`, `patch-äquivalent in main`, `bewusst verworfen
und ausdrücklich freigegeben` sowie der dokumentierte RC-Sonderfall dürfen nach
dem jeweiligen Nachweis ohne Rettungs-PR geschlossen werden.

## Verbindlicher Abschlussbericht

Nach jeder Repository-Änderung knapp und eindeutig berichten:

- angeforderte und tatsächlich erreichte Zielstufe;
- Branch und Worktree;
- Commit-SHA oder `nicht committed`;
- Push und Remote-Branch oder `nicht gepusht`;
- Pull Request und Checkstatus oder `nicht erstellt`;
- Merge-SHA oder `nicht gemergt`;
- Deployment-Umgebung und ausgelieferter SHA oder `nicht deployed` /
  `nicht betroffen`;
- ausgeführte QA und Ergebnis;
- Branch-/Worktree-Cleanup;
- verbleibende geänderte oder unversionierte Einträge und ihre Zuordnung;
- exakt nächster Schritt und, falls nötig, genau eine Entscheidung des Nutzers.

Nur klare Zustände verwenden: `erfolgreich`, `nicht erfolgt`,
`nicht betroffen`, `ausstehend` oder `blockiert`. Wenn die angeforderte
Zielstufe nicht erreicht ist, den Auftrag nicht als erledigt bezeichnen.
