# Datenordner

Dieser Ordner enthaelt die aktuell von der Karte geladenen Datenquellen.

- `locations.js`: Kontakte und Marker
- `locations-master.csv`: pflegbare Master-Datei fuer den aktuellen Kontaktbestand
- `city-labels.js`: Ortslabels
- `state-labels.js`: Bundeslandlabels
- `de-geojson.js`: Deutschland-Maske

Fuer laufende Datenpflege ist `locations-master.csv` die bessere Arbeitsgrundlage.
`locations.js` bleibt die direkt von der Karte geladene Datei.

Die Master-CSV kann mit folgendem Skript aus dem aktuellen `locations.js` neu erzeugt werden:

- `../scripts/export_locations_master_csv.mjs`

Und `locations.js` kann aus der gepflegten Master-CSV wieder aufgebaut werden:

- `../scripts/build_locations_js_from_master_csv.mjs`
