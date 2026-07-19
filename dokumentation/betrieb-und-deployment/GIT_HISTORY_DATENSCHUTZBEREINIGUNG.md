# Git-Historie datenschutzgerecht bereinigen

Status: freigegeben und in Ausfuehrung; Abschluss erst nach Remote-, Cache- und Pages-Abnahme

## Warum ein eigener Eingriff nötig ist

Das Entfernen einer Datei im aktuellen Commit löscht sie nicht aus älteren Git-Commits. Im öffentlichen Repository wurden historische Kontakt- und Arbeitsdaten gefunden. Die aktuelle Bereinigung nimmt diese Dateien aus dem sichtbaren Hauptstand und verhindert neue Commits, ersetzt aber keine koordinierte Bereinigung aller Branches, Tags, Caches und vorhandenen Klone.

Ein History-Rewrite ändert Commit-IDs, kann offene Pull Requests und lokale Klone unbrauchbar machen und benötigt Force-Push-Rechte. Er ist deshalb eine eigenständige Datenschutz- und Repository-Admin-Maßnahme.

## Bekannter Prüfbereich

- historische lokale Ergebnisse unter `.codex-pet-runs/`, `output/` und `outputs/`,
- frühere Kontakt-Seeds unter `data/`, `docs/data/` und den jeweiligen Frontend-Pfaden,
- historische operative Vorlagen mit nicht erforderlichen Personenbezügen,
- alle Remote-Branches, Tags, Pull-Request-Referenzen, Release-Artefakte und Actions-Artefakte,
- GitHub-Caches sowie bekannte lokale oder automatisierte Klone.

Die Liste ist ein Startpunkt. Der endgültige Filterumfang wird in einer privaten Inventarliste bestätigt; personenbezogene Werte werden nicht erneut in öffentliche Tickets oder Dokumente kopiert.

## Erforderliche Rollen und Entscheidungen

| Rolle | Aufgabe |
| --- | --- |
| Repository-Admin | Schreibstopp, Ref-Inventar, technische Bereinigung und Wiederherstellung der Schutzregeln |
| Datenschutz/Security | Umfang, Melde-/Informationspflichten, Aufbewahrung der Sicherung und Abnahmekriterien bestätigen |
| GitHub-/IT-Administration | Force-Push-Fenster, Cache-/Artefaktbereinigung und organisationsweite Klonhinweise unterstützen |
| Anwendungsverantwortung | Pages-Funktion und fachliche Repository-Vollständigkeit nach der Umschreibung abnehmen |

Vor Beginn müssen schriftlich entschieden sein:

1. welche Pfade, Werte, Branches, Tags und Artefakte entfernt werden,
2. ob das Repository für das Wartungsfenster vorübergehend privat oder schreibgeschützt wird,
3. wo eine verschlüsselte, zugriffsbeschränkte Notfallsicherung liegen und wann sie gelöscht werden darf,
4. wer Force-Push und Cachebereinigung freigibt,
5. wie Mitarbeitende und Betreiber vorhandener Klone informiert werden,
6. ob betroffene IDs, Zugangsdaten oder externe Verweise zusätzlich rotiert werden müssen.

## Vorbereiteter Ablauf

1. Merges, Releases und Automationen für ein angekündigtes Wartungsfenster stoppen.
2. Branchschutz, Environments, Default Branch, Pages-Quelle, Branches und Tags exportieren; Start-SHAs protokollieren.
3. Einen verschlüsselten Mirror ausschließlich in freigegebenem Speicher anlegen und den Zugriff dokumentieren.
4. Den bestätigten Filter in einem separaten Wegwerf-Mirror mit `git filter-repo` ausführen. Niemals direkt im einzigen Arbeitsklon beginnen.
5. Den bereinigten Mirror offline prüfen: alle Refs durchsuchen, Pfad- und PII-Prüfung ausführen, Build/Tests starten und die erwartete neue SHA-Zuordnung festhalten.
6. Schutzregeln nur für das genehmigte Wartungsfenster anpassen und alle bestätigten Branches und Tags kontrolliert aktualisieren.
7. Betroffene Pull Requests, Actions-/Release-Artefakte und GitHub-Caches entfernen oder neu erzeugen; bei Bedarf GitHub Support um Cachebereinigung bitten.
8. Schutzregeln und Environments wiederherstellen. Pages aus dem bereinigten `main` neu deployen; kein GKE-Deployment auslösen.
9. Mitarbeitende zum frischen Klonen statt zum Mergen alter Historie auffordern. Alte Automationsklone und Worktrees ersetzen.
10. Datenschutz-, Security-, Repository- und Pages-Abnahme dokumentieren und die Notfallsicherung gemäß Freigabe fristgerecht löschen.

## Technische Prüfungen vor dem Force-Push

- keine bestätigten sensiblen Pfade oder Werte in `git log --all` beziehungsweise den neu geschriebenen Objekten,
- vollständiger Gitleaks- und vereinbarter PII-Scan über alle neuen Refs,
- `npm run check`, beide Frontend-Builds, Deployment-Governance, Helm-Lint und Terraform-Formatprüfung grün,
- neuer Pages-Build funktional und frei von Target-Konfiguration,
- Branchschutz-, Environment- und Pages-Einstellungen als wiederherstellbare Sollwerte dokumentiert,
- keine ungeklärten aktiven Branches, Tags, PR-Refs oder Artefakte außerhalb des Filterumfangs.

## Abnahme nach der Umschreibung

- `main`, alle freigegebenen Branches und Tags zeigen ausschließlich auf die bereinigte Historie,
- GitHub-Suche und direkte bekannte Objekt-URLs liefern die entfernten Inhalte nicht mehr, soweit durch den Betreiber beeinflussbar,
- die GitHub-Pages-Demo funktioniert nach dem Neuaufbau und enthaelt ausschliesslich synthetische Daten,
- GKE-Ressourcen und das Environment `pre-gematik` wurden nicht verändert,
- alle Schutzregeln sind wieder aktiv,
- Mitarbeitende und Automationen verwenden frische Klone,
- verbleibende Grenzen wie fremde Offline-Kopien oder Suchmaschinen-Caches sind im Datenschutzprotokoll festgehalten.

Ohne diese Abnahme darf nur von „aus dem aktuellen Repository entfernt“, nicht von „vollständig gelöscht“ gesprochen werden.
