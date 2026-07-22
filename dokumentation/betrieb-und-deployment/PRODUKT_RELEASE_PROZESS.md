# Automatische Produkt-Releases

Stand: 22. Juli 2026

Dieses Runbook beschreibt ausschließlich die öffentlichen Produkt-Releases des
Versorgungs-Kompass unter
<https://github.com/TimoFrank/mitmachen/releases>. Interne PoC-Release-Candidates
mit dem Präfix `poc-v` und ihre Deployments bleiben davon getrennt.

## Rhythmus

Der Workflow `Weekly release` startet freitags um 09:17 Uhr in der Zeitzone
`Europe/Berlin`. Ein manueller Lauf kann einen Minor- oder Patch-Sprung
vorbereiten. Ohne Änderungen seit dem letzten veröffentlichten Produkt-Release
endet der Lauf erfolgreich, ohne Version, Tag oder Release anzulegen.

- Wochenrelease mit Funktionen oder Verbesserungen: `minor`
- außerplanmäßige Fehlerkorrektur: `patch`
- bestehende Tags oder Releases werden nie verschoben oder überschrieben

Die datenschutzbereinigte Produkt-Baseline ist in `config/release.json` als
Version `0.20.0` und mit ihrem Commit festgehalten. Der erste formale GitHub
Release ist deshalb `v0.21.0`. Die älteren Stände bleiben ausschließlich als
redaktionelle Historie im Changelog erhalten; alte lokale Tags dürfen nicht
nachträglich gepusht werden.

## Ablauf ohne redaktionelle Freigabe

1. Der Workflow ermittelt den letzten tatsächlich veröffentlichten GitHub
   Release und alle folgenden Commits.
2. Der Generator aktualisiert Changelog, README und In-App-Versionshistorie und
   schreibt dauerhafte Release Notes unter `release-notes/vX.Y.Z.md`.
3. Repository- und Browserprüfungen laufen auf dem vorbereiteten Stand.
4. Ein nicht als Draft markierter Automations-PR wird angelegt.
5. `Repo check` wird ausdrücklich auf dem exakten Head-Commit dieses PR
   gestartet. Es ist keine zustimmende Review erforderlich.
6. Nur wenn der Check erfolgreich ist und `main` seit der Planung unverändert
   blieb, wird der PR automatisch per Squash gemergt.
7. Der Merge-Commit wird erneut geprüft. Das öffentliche Pages-Profil wird
   gebaut, auf private beziehungsweise geschützte Inhalte geprüft und mit
   Browsertests abgenommen.
8. GitHub Pages wird ausdrücklich aus genau diesem Commit deployed und per HTTP
   geprüft. Der normale Push-Trigger wird nicht vorausgesetzt.
9. Danach erstellt der Workflow genau einen annotierten `vX.Y.Z`-Tag und
   veröffentlicht den GitHub Release mit Download-Artefakten.

Ein Abbruch nach dem Merge erzeugt in der folgenden Ausführung keine neue
Version: Der bereits eingecheckte, aber noch unveröffentlichte Release wird mit
dem ursprünglichen Commit fortgesetzt.

## Release-Artefakte

Jeder veröffentlichte Produkt-Release enthält:

- `versorgungs-kompass-vX.Y.Z-pages.zip`: geprüfte öffentliche Demo mit
  ausschließlich synthetischen Daten,
- `build-manifest.json`: Profil, Commit und Digest des Build-Inhalts,
- `SHA256SUMS`: Prüfsummen des ZIPs und des Build-Manifests.

GitHub ergänzt automatisch die Quellarchive des getaggten Commits. Target-,
PoC-, Datenbank- oder Echtdaten-Artefakte werden nicht an einen öffentlichen
Produkt-Release angehängt.

## E-Mail-Hinweis

Die Benachrichtigung wird vom veröffentlichten GitHub Release selbst ausgelöst.
Es gibt keinen SMTP-Schlüssel im Repository und kein Freigabe-Gate. Für die
persönliche Zustellung wird das Repository in GitHub mit `Watch → Custom →
Releases` abonniert; in den persönlichen Notification-Einstellungen muss für
beobachtete Repositories der Kanal `Email` aktiv sein.

Die Nachricht wird erst nach erfolgreicher Veröffentlichung versendet. Ein
übersprungener Wochenlauf, ein Automations-PR oder ein Tag ohne Release löst
keine Release-Benachrichtigung aus.

## Manuelle Wiederaufnahme und Hotfix

Ein fehlgeschlagener Veröffentlichungsabschnitt kann über `Publish product
release` mit Tag, Titel, Commit-SHA und dem eingecheckten Notes-Pfad erneut
gestartet werden. Der Workflow akzeptiert vorhandene Zustände nur, wenn Tag,
Commit und Release-Dokumente zusammenpassen.

Ein Hotfix wird über `Weekly release → Run workflow` mit `bump=patch`
angestoßen. Ein veröffentlichter Release wird nicht editiert oder ersetzt.
