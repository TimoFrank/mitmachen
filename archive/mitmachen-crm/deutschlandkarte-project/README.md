# Deutschlandkarte Projektbasis

Dieses Verzeichnis enthaelt die interaktive Deutschlandkarte als eigenstaendige Projektbasis.

## Stand

- [index.html](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/index.html): interne Vollversion `Versorgungsnetzwerk` (Transparenz ueber das gesamte Netzwerk)
- [mitmachen.html](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/mitmachen.html): reduzierte Website-Version `#Mitmachen` (minimalistischer Integrations-Start)
- Die grossen Datenbloecke wurden aus dem HTML ausgelagert.
- Die Karte laedt Leaflet, MarkerCluster und Basemap-Tiles weiterhin extern im Browser.

## Datenstruktur

- [data/locations.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/locations.js): alle Marker und Kontakte
- [data/locations-public.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/locations-public.js): freigegebene Teilmenge fuer `#Mitmachen` (nur mit Einwilligung)
- [data/city-labels.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/city-labels.js): Ortslabels
- [data/state-labels.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/state-labels.js): Bundeslandlabels
- [data/de-geojson.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/de-geojson.js): Deutschland-Maske

## Neue Kontakte hinzufuegen

Neue Eintraege werden in [data/locations.js](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/locations.js) als neues Objekt innerhalb von `window.MAP_LOCATIONS = [ ... ]` ergaenzt.

Empfohlenes Format:

```js
{
  "name": "Praxisname oder Einrichtung",
  "category": "Arztpraxen",
  "lat": 49.4298,
  "lon": 7.7452,
  "city": "Kaiserslautern",
  "url": "https://example.org",
  "description": "Kurzbeschreibung der Einrichtung.",
  "person_name": "Ansprechperson",
  "person_title": "Rolle oder Fachrichtung"
}
```

## So kannst du mir echte Daten schicken

Am einfachsten ist pro Kontakt genau ein Block in dieser Form:

```text
name: Praxis Dr. Beispiel
category: Arztpraxen
city: Kaiserslautern
street: Musterstrasse 12
postal_code: 67655
website: https://example.org
description: Hausaerztliche Praxis mit ...
person_name: Dr. Max Beispiel
person_title: Facharzt fuer Allgemeinmedizin
```

Noch besser ist dieses Format, wenn du Koordinaten schon hast:

```text
name: Praxis Dr. Beispiel
category: Arztpraxen
city: Kaiserslautern
lat: 49.1234
lon: 7.1234
website: https://example.org
description: Hausaerztliche Praxis mit ...
person_name: Dr. Max Beispiel
person_title: Facharzt fuer Allgemeinmedizin
```

Hinweise:

- `name`, `category`, `city` sind immer noetig.
- `lat` und `lon` sind ideal. Wenn sie fehlen, brauche ich mindestens eine belastbare Adresse oder Website.
- `category` sollte einer vorhandenen Kategorie entsprechen:
  `Arztpraxen`, `Krankenhäuser`, `Apotheken`, `Pflegeeinrichtungen`, `Rettungsdienst`
- Du kannst mir auch mehrere Kontakte auf einmal schicken, am besten als Liste gleicher Bloecke.

## CSV-Vorlage

Wenn du lieber gesammelt lieferst, nutze diese Vorlage:

- [contacts-template.csv](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/contacts-template.csv)

Regeln fuer die CSV:

- Eine Zeile pro Kontakt
- `name`, `category`, `city` sind Pflicht
- `lat` und `lon` sind bevorzugt
- Wenn `lat` und `lon` fehlen, dann bitte moeglichst `street` und `postal_code` oder mindestens eine belastbare `website`
- Datei bitte als UTF-8 speichern

## Excel-Import

Fuer strukturierte Excel-Listen gibt es jetzt ein Importskript:

- [scripts/import_xlsx_to_locations.rb](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/scripts/import_xlsx_to_locations.rb)

Aufruf:

```sh
ruby scripts/import_xlsx_to_locations.rb /Pfad/zur/Datei.xlsx
```

Aktuelle Annahmen:

- Quelle ist das Tabellenblatt `Netzwerk_clean`
- Der Import versucht zuerst echtes Adress-Geocoding ueber Strasse + PLZ + Ort
- Falls das nicht klappt, faellt er auf `PLZ + Ort` zurueck
- Nur wenn auch das fehlschlaegt, wird das Bundesland-Zentrum verwendet
- Sektoren werden auf Kartenkategorien gemappt:
  `Krankenhaus -> Krankenhäuser`
  `Apotheke -> Apotheken`
  `Pflege -> Pflegeeinrichtungen`
  alles andere -> `Arztpraxen`

Zusatz:

- Geocoding-Ergebnisse werden in [geocode-cache.json](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/data/geocode-cache.json) gecacht
- Fuer einen neuen Import mit frischen Adressen ist Netzwerkzugriff fuer den Geocoder noetig

## Lokale Nutzung

- Interne Vollversion: [index.html](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/index.html)
- Website-Version: [mitmachen.html](/Users/timofrank/Desktop/Versorgungs-CRM/deutschlandkarte-project/mitmachen.html)

## Weiterentwicklung

Sinnvolle naechste Schritte:

1. `locations.js` spaeter auf eine echte API oder ein CMS umstellen.
2. Kategorien und Markerfarben ebenfalls in eine eigene Konfigurationsdatei ziehen.
3. Validierung fuer neue Datensaetze ergaenzen.
