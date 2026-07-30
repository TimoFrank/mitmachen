# Kartendaten

Dieser Ordner enthält nur noch die Kartendaten, die der aktive `Versorgungs-Kompass` für Karte, Mini-Karte und Teaser lädt.

- `de-geojson.js`: Deutschland-Maske
- `city-labels.js`: Ortslabels
- `state-labels.js`: Bundeslandlabels
- `state-polygons.js`: Bundesland-Polygone als JavaScript-Datenquelle
- `state-polygons.geojson`: GeoJSON-Quelle der Bundesland-Polygone
- `constituency-polygons.js`: Polygone der 299 Bundestagswahlkreise 2025 als kompakte JavaScript-Datenquelle (`window.MAP_CONSTITUENCY_POLYGONS`)

## Bundestagswahlkreise 2025

`constituency-polygons.js` wurde aus dem generalisierten WGS84-Shapefile der
Bundeswahlleiterin erzeugt. Enthalten sind ausschließlich `WKR_NR`, `WKR_NAME`
und `LAND_NAME`. Für die Browserdarstellung wurden die Geometrien mit
Mapshaper (gewichtete Visvalingam-Vereinfachung, 15 Prozent der Stützpunkte,
Flächenerhalt) vereinfacht, bereinigt und auf vier Dezimalstellen gerundet.

- [Download des amtlichen WGS84-Shapefiles](https://www.bundeswahlleiterin.de/dam/jcr/556bec9c-be80-4818-a368-fe6596f15f08/btw25_geometrie_wahlkreise_shp_geo.zip)
- [Datensatzbeschreibung und Nutzungsbedingungen](https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html)
- Lizenz: [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)

Vorgeschriebener Quellenvermerk:

> © Die Bundeswahlleiterin, Statistisches Bundesamt, Wiesbaden 2024,
> Wahlkreiskarte für die Wahl zum 21. Deutschen Bundestag
>
> Grundlage der Geoinformationen © Geobasis-DE / BKG 2024

Kontakt- und Markerlisten aus dem früheren Mitmachen-/Versorgungsnetzwerk liegen im Archiv:

- `archive/mitmachen-crm/deutschlandkarte-project/data/`

Der aktive `Versorgungs-Kompass` sollte nicht von Dateien aus dem Archiv abhängen.
