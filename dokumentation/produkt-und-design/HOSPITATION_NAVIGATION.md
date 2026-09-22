# Navigation im Hospitations-Kompass

## Fachliche Gliederung

Der Hospitations-Kompass bleibt ein gemeinsames Modul. Die Übersicht dient der
Orientierung. Zwei benannte Bereiche gliedern die eigentliche Arbeit:

- **Hospitationen:** Termine und Auswertung. Der Fragebogen wird über eine
  Schaltfläche in der Terminansicht geöffnet und bietet einen Rückweg dorthin.
- **Framework:** Beobachtungen und Muster. Die bisherige Framework-Infoseite
  steht dahinter als Grundlagen.

Die Gruppennamen sind Orientierungshilfen, keine zusätzlichen Zwischenseiten.
Alle Arbeitsansichten bleiben unmittelbar erreichbar. Die bestehende
Sidebar-Untergliederung wird verwendet; zusätzliche Klappmenüs sind dafür
nicht erforderlich. Bestehende Direktlinks bleiben gültig.

## Abhängigkeit und gemeinsame Abnahme

Die Navigation baut auf dem eigenen Hospitations-Einstieg aus
`timo/feat-hospitationskompass-einstieg` auf. Der Navigationsbranch
`timo/feat-hospitations-navigation` enthält diesen als Basis und ergänzt die
Gliederung sowohl in der Gesamtanwendung als auch im fokussierten Einstieg.
Bestehende URLs einschließlich `/hospitationskompass/fragebogen` bleiben gültig.

Die gemeinsame Abnahme prüft Gruppen, aktive Navigation, Fragebogen und
Rückweg, Direktlinks, Neuladen, Browser-Zurück, Profil und „Weitere Anwendungen“.
Die automatisierten Navigationstests decken beide Einstiegskontexte auf
Desktop und Mobilgerät ab. Zusätzlich sind die tatsächlichen sauberen URLs
und repräsentative Ansichten im Browser zu prüfen. Für Push und Integration
sind vollständige QA und `build:pages` auf dem zusammengeführten Stand nötig.
Lokale QA und eine Pages-Demo-Prüfung belegen kein Deployment der Realanwendung.

## Koordinierte Übergabe

Am 22. September 2026 wurde die gemeinsame Umsetzung und Push-Vorbereitung
beauftragt. Die beteiligten Aufgaben haben folgende Reihenfolge vereinbart:

1. Die Mac-Synchronisierung wurde mit PR #277 integriert. Die nachfolgenden
   Hotfixes #278 und #279 sind auf `dfa06741` integriert und als v0.25.2 gebunden.
   Dieser Stand enthält die lokale Synchronisierung und einen Profilzugang,
   keine Änderung an der Hospitationsnavigation.
2. Der eigene Hospitations-Einstieg in PR #275 baut auf diesem integrierten
   Stand auf. Die Aufgabe „Hospitations-Kompass separat bereit“ hat ihren
   unveränderten Stand an die Navigationsaufgabe übergeben; dort erfolgen
   Staging, Commit und Pull Request für den Einstieg.
3. Die Navigation folgt als abhängiger Pull Request #276. Nach Übernahme des
   Einstiegs wird ihre Basis auf `main` umgestellt und die gemeinsame QA
   anhand des endgültigen Inhalts nachgewiesen. Ein gemeinsamer Push-Zeitpunkt
   ersetzt weder getrennte Änderungsumfänge noch die erforderlichen PR-Gates.
4. Ein Release nimmt ausschließlich den nachweislich integrierten und
   geprüften Stand auf. Die operative Mac-/Release-Aufgabe erhält die
   zugehörigen PRs zur Abstimmung des Veröffentlichungsumfangs.

Die Aufgabe „Entwickle Namen fürs Hospitations-Fe“ hat bestätigt, dass
HospiLab und zwei gleichrangige Module weiterhin ein Vorschlag sind. Für
vorliegende Umsetzung gilt die ausdrückliche Wahl eines Moduls mit zwei
Bereichen.

### Abgleich mit der Mac-Synchronisierung

Ein temporärer Abgleich auf der ursprünglichen Basis `061ce00b` ergab für
App-HTML, CSS, JavaScript, `package.json` und `scripts/test_google_hosting.mjs`
keine Textkonflikte. Die kombinierte JavaScript-Syntax war gültig.

Die Überschneidungen in `api/google-hosting.mjs` und den zugehörigen Tests
sind gegen den integrierten Mac-Stand aufgelöst. Beide Anforderungen bleiben
erhalten:

- `safeReturnPath` verwendet die Prüfung mit `isAppRoute` und erlaubt weiterhin
  die expliziten Pfade `/versorgungs-kompass.html` und `/mac-abgleich`.
- Bei der Dateizuordnung öffnet `/mac-abgleich` weiterhin `mac-sync.html`;
  anschließend bildet `isAppRoute` die fokussierten Hospitationspfade auf
  die gemeinsame App-Datei ab.

Der gemeinsame Anmelderücksprung einschließlich Mac-Kopplungscode stammt
aus Hotfix #278. Der Hospitations-Einstieg ergänzt dort ausschließlich seine
eigenen erlaubten Ziele und deren Testfälle. Ausführbare Tests prüfen die
Rückkehr zu beiden Einstiegen und die Ablehnung fremder oder ungültiger Ziele.
Die Versionsprüfungen bleiben unverändert erhalten.

Nach der bestätigten Release-Bindung von v0.25.2 wurden beide
Hospitations-Branches auf diesen Stand abgeglichen. Der veröffentlichte
Mac-Tag und dessen Auslieferung werden nicht geändert; die
Hospitations-Erweiterung benötigt eine eigene spätere Veröffentlichung.
