# Datenschutz-Bereinigungsnachweis

Stand: 19. Juli 2026
Status: Schutzuebernahme und betreiberseitig moegliche Remote-Bereinigung abgeschlossen; GitHub-Supportbereinigung ausstehend

Dieser Nachweis enthaelt bewusst keine Namen, Kontaktwerte, internen IDs oder Quelldateien. Die Detailpruefung wurde in einem zugriffsbeschraenkten Arbeitsbereich vorgenommen.

## 1. Vollstaendigkeit der historischen Kontaktmenge

Die Datensaetze der historischen Kontaktquelle wurden vor ihrer Entfernung datensatzweise anhand ihrer stabilen IDs mit dem geschuetzten Bestand verglichen.

Der vollstaendige aggregierte Abgleich ist ohne fehlende Datensaetze bestanden. Exakte Counts, Feldumfang, stabile IDs und Fingerprints liegen ausschliesslich im zugriffsgeschuetzten Nachweis, nicht im oeffentlichen Repository.

Ergebnis: Die Entfernung aus dem oeffentlichen Quellstand verursacht nach der technischen Vollstaendigkeitskontrolle keinen Verlust der geprueften historischen Kontaktmenge.

## 2. Expertenkreis und Stakeholder

Vor der Entfernung aus dem oeffentlichen Repository wurden geschuetzte, administrative Snapshots fuer historische Kontakte, Expertenkreise, Expertenkontakte, Expertenorganisationen, Stakeholder-Typen, Stakeholder-Organisationen und Stakeholder-Personen angelegt. Die exakten Counts und Fingerprints sind im zugriffsgeschuetzten Nachweis dokumentiert.

Die Snapshot-Tabelle liegt in einem privaten Datenbankschema. Row Level Security ist aktiviert und erzwungen; anonyme und regulaer angemeldete Browserrollen besitzen weder Schema- noch Tabellenrechte. Der Zugriff ist auf administrative Wiederherstellung und Migration begrenzt.

Zugehoerige Stakeholder-Logos, historische Hospitations-Profilbilder und bestehende Profilbilder wurden ebenfalls in private Buckets beziehungsweise das private Quellarchiv uebernommen. Objektcounts, Referenzen und Pruefsummen bleiben im geschuetzten Nachweis.

Die Anwendung bezieht reale Expertenkreis-, Stakeholder- und Profildaten nur noch ueber den geschuetzten API-Pfad. GitHub Pages enthaelt diese Daten und Assets nicht.

## 3. Oeffentlicher Quellstand und Builds

Entfernt wurden insbesondere:

- historische Kontakt-CSV- und JavaScript-Dateien,
- Expertenkreis-, Stakeholder- und Patientendateien,
- zugehoerige reale Logos und Profilbilder,
- lokale Exportordner `output/` und `outputs/`,
- lokale Codex-Pet-Artefakte,
- Demo/Echt-Umschalter und statische Fallbacks auf reale Daten.

Die oeffentliche Demo wird ausschliesslich aus synthetischen, eindeutig als fiktiv gekennzeichneten Daten gebaut. Der Zielbuild enthaelt keine Demo-Daten und greift ausschliesslich ueber `/api` auf den geschuetzten Dienst zu. Automatische Public-Asset-Pruefungen verhindern die erneute Aufnahme der entfernten Datenpfade.

Ein wertbasierter Scan des neuen Quellstands ergab keine Treffer fuer die aus den historischen Kontakt-, Expertenkreis-, Stakeholder- und Patientendaten abgeleiteten Pruefmerkmale. Dieser Scan ist ein technischer Nachweis und ersetzt keine organisatorische Datenschutzabnahme.

## 4. Remote-Abnahme

Die betreiberseitig moegliche Bereinigung wurde am 19. Juli 2026 ausgefuehrt:

| Kontrolle | Ergebnis |
| --- | --- |
| PR 54 | geprueft und gemergt |
| Neuer `main`-Wurzel-Commit | `fac533f154355a00e8bc1bb78112ec476ae68fef` |
| Erreichbare Commits in frischem Einzelbranch-Klon | 1 |
| Verbleibende normale Remote-Branches | nur `main` |
| Verbleibende Tags und Releases | 0 |
| Geloeschte historische Actions-Laeufe | 996 |
| Geloeschte historische Actions-Artefakte | 37; nur das neue Pages-Artefakt bleibt |
| Geloeschte Actions-Caches | 37 mit zusammen 428.608.999 Bytes |
| Geloeschte historische Deployment-Datensaetze | 659; nur das neue Pages-Deployment bleibt |
| Neues Pages-Deployment | erfolgreich aus dem neuen Wurzel-Commit |
| Bekannte entfernte Pages-Pfade | HTTP 404 |
| Branchschutz | Force-Push nur im Wartungsfenster aktiviert und danach wieder gesperrt |
| GKE-/`pre-gematik`-Deployment | nicht ausgeloest |

Der unabhaengige Wertscan des frischen Klons und seiner 346 erreichbaren Git-Objekte verwendet dieselben geschuetzten Prueffingerprints wie die Quellstandsabnahme. Er fand keine geschuetzten Kontakte, Stakeholder oder Expertenentitaeten. Zwei Treffer waren ausschliesslich die generischen Woerter `gematik` und `selbst` in Dokumenten, keine Personen oder Organisationen.

GitHub verwaltet weiterhin 22 interne Pull-Request-Head-Refs mit zusammen 703 alten Commits und 7.186 erreichbaren Objekten sowie 648 alte Pages-Build-Datensaetze, die ein Repository-Admin weder aendern noch loeschen kann. Die vorbereitete Supportanfrage bittet GitHub deshalb um Entfernung dieser internen Referenzen und Caches sowie um serverseitige Garbage Collection. Bis GitHub dies bestaetigt, lautet die belastbare Aussage:

**Die Daten sind vollstaendig in den geschuetzten Bestand uebernommen, aus dem neuen oeffentlichen Quellstand und allen vom Repository-Admin loeschbaren GitHub-Referenzen entfernt; die abschliessende Bereinigung betreiberverwalteter Altobjekte ist bei GitHub Support anzufordern.**
