# Datenschutz-Bereinigungsnachweis

Stand: 19. Juli 2026
Status: Schutzuebernahme und Bereinigung des neuen Quellstands abgeschlossen; Remote-Historien- und Cache-Abnahme in Ausfuehrung

Dieser Nachweis enthaelt bewusst keine Namen, Kontaktwerte, internen IDs oder Quelldateien. Die Detailpruefung wurde in einem zugriffsbeschraenkten Arbeitsbereich vorgenommen.

## 1. Vollstaendigkeit der 110 Kontakte

Die 110 Datensaetze der historischen Kontaktquelle wurden vor ihrer Entfernung datensatzweise anhand ihrer stabilen IDs mit dem geschuetzten Bestand verglichen.

| Kontrolle | Ergebnis |
| --- | ---: |
| Datensaetze in der geprueften historischen Quelle | 110 |
| Datensaetze im geschuetzten Quell-Snapshot | 110 |
| Davon im geschuetzten Live-Kontaktbestand gefunden | 110 |
| Fehlende Datensaetze | 0 |
| Gepruefte Felder je Snapshot-Datensatz | 25 |

Ergebnis: Die Entfernung aus dem oeffentlichen Quellstand verursacht nach der technischen Vollstaendigkeitskontrolle keinen Verlust dieser 110 Kontakt-Datensaetze.

## 2. Expertenkreis und Stakeholder

Vor der Entfernung aus dem oeffentlichen Repository wurden geschuetzte, administrative Snapshots angelegt:

| Datenklasse | Geschuetzte Datensaetze |
| --- | ---: |
| Historische Kontakte | 110 |
| Expertenkreise | 7 |
| Expertenkontakte | 268 |
| Expertenorganisationen | 220 |
| Stakeholder-Typen | 5 |
| Stakeholder-Organisationen | 223 |
| Stakeholder-Personen | 207 |
| **Gesamt** | **1.040** |

Die Snapshot-Tabelle liegt in einem privaten Datenbankschema. Row Level Security ist aktiviert und erzwungen; anonyme und regulaer angemeldete Browserrollen besitzen weder Schema- noch Tabellenrechte. Der Zugriff ist auf administrative Wiederherstellung und Migration begrenzt.

Zugehoerige Assets wurden ebenfalls privat uebernommen:

- 215 Stakeholder-Logoobjekte im privaten Bucket,
- 5 historische Hospitations-Profilbilder im privaten Quellarchiv,
- bestehende Profilbilder in einem privaten Bucket mit rollen- und eigentuemergebundenen Regeln.

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

## 4. Noch abzuschliessende Remote-Abnahme

Das Loeschen im neuen Quellstand entfernt alte Git-Objekte, Actions-Artefakte, Caches und CDN-Ausgaben nicht automatisch. Deshalb wird nach dem geprueften Pages-Deployment das [Runbook zur Bereinigung der Git-Historie](GIT_HISTORY_DATENSCHUTZBEREINIGUNG.md) ausgefuehrt. Der Abschlussnachweis erfordert:

1. neue, bereinigte `main`-Historie und entfernte alte Remote-Refs,
2. entfernte alte Releases, Tags, Workflow-Artefakte und Caches,
3. eine frisch gebaute Pages-Demo, in der bekannte Altpfade HTTP 404 liefern,
4. einen frischen Klon- und Wertscan,
5. einen GitHub-Support-Nachweis fuer nicht selbst loeschbare Pull-Request-Refs und Betreiber-Caches,
6. die Bestaetigung, dass GKE und das Environment `pre-gematik` nicht deployed oder veraendert wurden.

Bis diese Punkte abgeschlossen sind, lautet die belastbare Aussage: **vollstaendig in den geschuetzten Bestand uebernommen und aus dem neuen oeffentlichen Quellstand entfernt**.
