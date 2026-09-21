# Ersetzung des unveröffentlichten 0.24-Kandidaten

Stand: 21. September 2026. Freigegebener Betriebsentscheid zur Produktveröffentlichung und getrennt geprüften Google-Auslieferung.

## Anlass und Freigabe

PR [250](https://github.com/TimoFrank/mitmachen/pull/250) bereitete Version
`0.24.0` auf Commit `29cd44c662bc7b8577a85aedf5cd7e5e8aec67eb` vor. Der
[Veröffentlichungslauf 33193180690](https://github.com/TimoFrank/mitmachen/actions/runs/33193180690)
endete am deaktivierten Schalter `PRODUCT_RELEASE_PUBLISH_ENABLED`, bevor ein
Tag oder Deployment entstand. Am 13. September 2026 waren weder der Tag
`v0.24.0` noch ein entsprechender GitHub Release vorhanden. Die öffentliche
Demo lieferte weiterhin `0.23.0` auf `b007afab5b1e4296bddb919d8f4ac174092ce885`.

Der Maintainer hat am 13. September 2026 ausdrücklich freigegeben, diesen
unveröffentlichten Kandidaten durch den aktuellen integrierten Stand zu
ersetzen und den Veröffentlichungsschalter ausschließlich für dieses
Veröffentlichungsfenster zu aktivieren. Anschließend wird er wieder auf
`false` gesetzt, auch bei einem Abbruch. Diese Entscheidung erweitert die
bereits erteilte Freigabe zur Aktualisierung der Pages-Demo.

Die Ersetzung enthält die Beobachtungsänderungen aus
[PR 264](https://github.com/TimoFrank/mitmachen/pull/264). Während der Vorbereitung wurde auch der zugehörige Codebuch-Auftrag
[PR 265](https://github.com/TimoFrank/mitmachen/pull/265) integriert. Der Release
baut deshalb auf `cfc07ef2b9537eb0fee685e90912c4fe80cb52b1` auf und enthält sowohl
den Drawer als auch die zugehörige Erfassung und quellengebundene Vergleiche.
Darin sind auch die seit dem alten Kandidaten integrierten Korrekturen aus
PR 259, 260 und 261 enthalten.

Am 21. September 2026 hat der Maintainer den Umfang ausdrücklich erweitert:
Die Google-Vorbereitung aus PR 269 ist auf
`6192f1270e047d6cb525d700d1fcf2d86dbd3940` integriert. Auf dieser Ausgangsrevision
werden das bereits abgestimmte Einzeltermin-Exportlayout einschließlich Uhrzeit
und die ausfüllbare PDF-Vorlage aus dem bisherigen Auftrag zusammengeführt.
Beide Downloads sollen aus der Anwendung erreichbar sein. Die vollständigen
Prüfungen, Integration, Veröffentlichung und anschließende getrennte
Google-Auslieferung sind autorisiert. Vorhandene Produktdaten bleiben erhalten.

Die freigegebene Übernahme der 13 vorbereiteten Hospitationsbeobachtungen und
drei Stammdatenkorrekturen erfolgt erst nach verifiziertem kompatiblem Rollout
und erneuter Konfliktprüfung; Echtdaten gehören nicht in diesen Release-PR.
Der neue beidseitige lokale Abgleich wird ausdrücklich nach dem Google-Umzug
umgesetzt. Bei Konflikten werden beide Fassungen erhalten und der Nutzer
entscheidet. Es liegen laut Nutzer noch keine lokalen Änderungen vor.
Die abschließenden Release-Prüfungen gelten für den gesamten neuen Kandidaten.

## Bindung des neuen Kandidaten

- Version und geplanter Tag bleiben `0.24.0` und `v0.24.0`.
- Die Ersetzung erfolgt durch einen eigenen geprüften Release-Vorbereitungs-PR
  auf `main`; dessen neuer Merge-Commit ist der Auslieferungsstand.
- `config/release.json` enthält mit `candidateReplacements` eine ausdrücklich
  validierte Audit-Historie: Version, alter Kandidat, integrierte
  Ausgangsrevision, Freigabedatum und diese Entscheidung. Sie enthält keine
  ausführbaren Optionen und ersetzt keine Freigabe oder Prüfung.
- Die bestehende Bindung des Release-Planers an die letzte Änderung der
  Release-Konfiguration bleibt bestehen. Nach Integration muss sein
  `resume`-Plan auf den neuen Kandidaten oder dessen inhaltsgleichen
  PR-Head zeigen. Ein späterer beliebiger `main`-Stand wird nicht ausgewählt.
- Release Notes, Changelog, In-App-Historie und README beschreiben gemeinsam
  den tatsächlichen Umfang. Der alte Commit bleibt historische Evidenz.

Dies ist die ausdrücklich freigegebene Ersetzung eines ungetaggten
Kandidaten, keine Wiederholung des alten Veröffentlichungslaufs. Sobald ein
Tag oder unveränderlicher Release vorhanden ist, darf er weder verschoben
noch durch diesen Ausnahmeweg ersetzt werden.

## Ausführung und unveränderte Gates

Der manuell erstellte Ersetzungs-PR erfüllt bewusst nicht das Bot-Autorenkriterium
des automatischen Weekly-Merge-Triggers. Nach seiner geprüften Integration wird
deshalb der bereits vorhandene manuelle Eingang von `publish-release.yml`
verwendet. Die allgemeinen Workflow- oder Schutzregeln werden nicht geändert.

1. Vor der Integration die vollständige lokale QA, Pages-Build,
   Release-Automationstests und Deployment-Governance prüfen. Beide
   Pflichtchecks `Minimal repository check` und `Target-Readiness` müssen am
   exakten PR-Head erfolgreich sein; Review-Kommentare müssen geklärt sein.
2. Per geschütztem Pull Request integrieren. Merge-SHA in `origin/main` und
   vollständige Tree-Gleichheit zum geprüften PR-Head nachweisen. Keine
   Admin-Ausnahme und kein Umgehen des strikten Branchschutzes.
3. Den neuen `resume`-Plan ohne Mutation prüfen. Den isolierten Workflow
   `Release signing readiness` erfolgreich abschließen. Ein manueller
   `publish-release.yml`-Planlauf mit `publish=false` muss ebenfalls bestehen.
4. Vor Aktivierung erneut bestätigen, dass kein Tag oder Release für `v0.24.0`
   und kein konkurrierender laufender oder wartender Release-Job existiert.
   Alten Schalterwert und Beginn des Fensters protokollieren.
5. `PRODUCT_RELEASE_PUBLISH_ENABLED` vorübergehend auf `true` setzen und den
   geschützten Publish-Workflow auf `main` mit `release_type=weekly`,
   `tag=v0.24.0`, `title=0.24.0-0 Release Candidate`, dem exakten neuen Merge-SHA
   und `notes_path=dokumentation/release-notes/v0.24.0.md` auslösen.
6. Vollständige Release-QA, strikten Branchschutz, Release-Immutability,
   Tag-Ruleset, Signatur, unabhängige Tagprüfung und Pages-Prüfung bestehen
   lassen. Das signierte Tagobjekt und sein Zielcommit werden getrennt
   nachgewiesen. Alle vorhandenen Gates bleiben blockierend.
7. Den Schalter nach Ende des Laufs wieder auf `false` setzen und den Zustand
   per API lesen. Workflow-IDs, SHA, Tagobjekt, Artefaktdigests, Schalterwerte
   und Zeitpunkte im Abschlussnachweis protokollieren.
8. `npm run verify:publication` auf dem exakten ausgelieferten Stand ausführen.
   Beobachtung 69 in der öffentlichen Demo auf Desktop und Mobil öffnen und
   Vorschauen erstellen. Die Browserprüfung verwendet ausschließlich
   synthetische Demo-Daten.

Die vorhandene gemeinsame Workflow-Sperre für Produkt-Releases verhindert
parallele Veröffentlichungen. Eine notwendige Environment-Freigabe wird für
den konkreten autorisierten Lauf vorgenommen; Reviewer-, Schlüssel-,
Berechtigungs- und Environment-Regeln werden nicht verändert.

## Eng begrenzter Secret-Scan-Fehlalarm

Der vollständige Historien-Scan auf `cfc07ef2` erfasste auch Commit
`dd62c6cd7232511900abfd349cc747c5c83b4ed2` des noch nicht integrierten
Einzelserver-Branches. In
`deploy/single-server/migration/capture-initial-open-writer-evidence.sh`,
Zeilen 672–674, werden ausschließlich literale PEM-Begrenzer mit
`startsWith` und `endsWith` verglichen. Diese Zeilen enthalten kein
Schlüsselmaterial.

`config/security/gitleaksignore` dokumentiert ausschließlich den exakten
Fingerprint dieses nachgeprüften Fehlalarms. Es wird weder eine ganze Regel
noch ein Pfad ausgenommen; vollständiger Historien- und Verzeichnis-Scan
bleiben bestehen. Der Einzelserver-Branch selbst wird nicht verändert oder
mitveröffentlicht.

## Grenzen und Abbruch

Der Produkt-Release veröffentlicht die synthetische öffentliche Pages-Demo
und den zugehörigen GitHub-Prerelease. Er aktualisiert nicht automatisch den
geschützten Dienst, die Datenbank oder den gematik-Zielpfad. Die gesondert
autorisierte Google-Auslieferung folgt dem Google-Betriebsrunbook mit eigenem
Schema-, Anmelde-, Daten- und Funktionsnachweis vor der Domain-Umschaltung.
Die in PR 264 vorbereitete Schemaerweiterung gehört zu diesem gesonderten
Backend-Schritt; sie codiert vorhandene Datensätze nicht um.

Scheitert ein Gate, wird kein alternatives ungeschütztes Deployment verwendet.
Ein bereits entstandener Tag bleibt unverändert; ein weiterer Lauf darf dann
nur exakt dessen Commit fortsetzen. Ein fehlgeschlagenes Deployment wird nicht
als veröffentlicht gemeldet. Der Schalter wird auch in diesem Fall wieder
auf seinen ursprünglichen Wert `false` gesetzt.
