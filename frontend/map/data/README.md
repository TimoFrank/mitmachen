# Kartendaten

Dieser Ordner enthält nur noch die Kartendaten, die der aktive `Versorgungs-Kompass` für Karte, Mini-Karte und Teaser lädt.

- `de-geojson.js`: Deutschland-Maske
- `city-labels.js`: Ortslabels
- `state-labels.js`: Bundeslandlabels
- `state-polygons.js`: Bundesland-Polygone und dazu passender Deutschland-Umriss als JavaScript-Datenquelle
- `state-polygons.geojson`: Bundesland-Polygone im GeoJSON-Format
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

## Bundeslandgrenzen

Die Bundeslandflächen leiten sich aus den oben beschriebenen Wahlkreisen ab.
Quelle und Lizenz entsprechen denen der Wahlkreisflächen. Zur Wiederholung der
Ableitung den Wert von `window.MAP_CONSTITUENCY_POLYGONS` als
`wahlkreise.geojson` speichern und in einem temporären Ordner mit Mapshaper
0.6.113 verarbeiten:

```sh
mapshaper wahlkreise.geojson -dissolve LAND_NAME -o format=geojson precision=0.0001 laender.geojson
mapshaper laender.geojson -dissolve -o format=geojson precision=0.0001 deutschland.geojson
mapshaper laender.geojson -innerlines -o format=geojson precision=0.0001 innengrenzen.geojson
```

In `state-polygons.geojson` die Geometrien anhand von `LAND_NAME` und
`properties.name` zuordnen. Die bestehende Reihenfolge, IDs und Eigenschaften
der 16 Länder beibehalten. In `state-polygons.js` die gleiche
FeatureCollection als `MAP_STATE_POLYGONS` und die einzige Geometrie aus
`deutschland.geojson` als FeatureCollection mit einem Feature unter
`MAP_STATE_COUNTRY_OUTLINE` ablegen. Die Linien aus `innengrenzen.geojson`
als `MultiLineString` unter `MAP_STATE_INNER_BORDERS` zusammenfassen.
Gemeinsame Ländergrenzen müssen identische Stützpunkte verwenden. Die
restlichen Kanten bilden den Deutschland-Umriss.

## Landflächen und Nachbarländer

`europe-context.js` enthält Daten aus [Natural Earth 5.1.1](https://www.naturalearthdata.com/about/terms-of-use/).
Die [Landflächen im Maßstab 1:10 Mio.](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/)
schließen an Deutschland an und unterscheiden Land von Meer. Die
Orientierungslinien dazwischen zeigen nur gemeinsame Grenzen der neun
Nachbarländer aus `MAP_EUROPE_CONTEXT`. Zur Wiederholung die Werte aus
`MAP_EUROPE_CONTEXT` als `nachbarn.geojson` exportieren und die beiden
Geometrien mit Mapshaper 0.6.113 ableiten:

```sh
mapshaper ne_10m_land.geojson -clip bbox=-6,41,26,60 -dissolve -simplify weighted 12% keep-shapes -o format=geojson precision=0.001 land.geojson
mapshaper nachbarn.geojson -innerlines -o format=geojson precision=0.001 nachbargrenzen.geojson
```

Die Geometrie aus `land.geojson` steht unter `MAP_EUROPE_LAND`, die
zusammengefassten Linien unter `MAP_EUROPE_INNER_BORDERS`.

Kontakt- und Markerlisten aus dem früheren Mitmachen-/Versorgungsnetzwerk liegen im Archiv:

- `archive/mitmachen-crm/deutschlandkarte-project/data/`

Der aktive `Versorgungs-Kompass` sollte nicht von Dateien aus dem Archiv abhängen.
