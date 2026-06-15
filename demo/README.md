# Versorgungs-Kompass Demo

Diese Demo zeigt, wie der Versorgungs-Kompass als Orientierung fuer das gematik-Hospitationsnetzwerk wirken kann. Sie ist bewusst als leichtgewichtig statisches Paket ohne reale Kontaktdaten gebaut.

Im Zentrum steht die Karte. Sie ist der erste Blick auf das Hospitations-Netzwerk und macht sichtbar, was in Tabellen nur schwer zu erfassen ist: Wo liegen bekannte Hospitationsorte? Welche Regionen sind bereits gut vertreten? Wo entstehen Cluster aus Praxen, Kliniken, Kassen, Pflege, Therapie oder weiteren Akteuren? Und wo zeigen sich noch weisse Flecken, die fachlich interessant sein koennten?

Die Demo soll Lust darauf machen, das Netzwerk raeumlich zu denken. Kontakte und Organisationen werden nicht nur gesammelt, sondern in Beziehung zu Orten, Regionen und Versorgungskontexten gesetzt. So entsteht ein gemeinsames Lagebild, das bei Planung, Abstimmung und Vorbereitung von Hospitationen hilft.

## Was die Demo zeigt

- Eine Kartenansicht als Startpunkt fuer den schnellen Ueberblick.
- Einen Versorgung-Bereich mit Kontakten, Organisationen und derselben Karte als zusammenhaengendem Arbeitsraum.
- Fiktive Beispielkontakte, die zeigen, wie unterschiedliche Versorgungsbereiche regional verteilt sein koennen.
- Eine einfache, statische Form, die sich fuer technische Pruefung und Abstimmung eignet.

## Zielbild

Der Versorgungs-Kompass soll helfen, aus vielen einzelnen Anknuepfungspunkten ein verstaendliches Bild des Hospitations-Netzwerks zu machen. Die Karte beantwortet dabei nicht nur die Frage, wo etwas liegt. Sie hilft auch, Muster zu erkennen, Luecken zu benennen und naechste Schritte besser zu planen.

Die Demo ist deshalb kein vollstaendiger Produktivstand, sondern ein greifbarer Ausschnitt: genug, um die Idee zu erleben, die Navigation zu pruefen und ueber den Nutzen der Kartenperspektive zu sprechen.

## Nutzung

Lokal kann die Demo ueber einen kleinen Webserver aus dem Repository geoeffnet werden:

```bash
python3 -m http.server 4173
```

Danach im Browser:

```text
http://127.0.0.1:4173/demo/
```

Die veroeffentlichte GitHub-Pages-Fassung liegt unter:

```text
https://timofrank.github.io/mitmachen/demo/
```

## Dateien

- `index.html`: Einstieg und App-Shell der Demo.
- `demo.css`: Gestaltung der Demo-Oberflaeche.
- `demo-app.js`: lokale Demo-Logik, Navigation, Filter und Tabellen.
- `../data/demo-data.js`: fiktive Demo-Daten.
- `../map/versorgungs-kompass-map.html`: eingebettete Kartenansicht fuer lokale Nutzung.

GitHub Pages veroeffentlicht den Ordner `docs/`. Das Sync-Skript kopiert die Demo deshalb nach `docs/demo/` und passt den Kartenpfad fuer die Pages-Struktur an.

## Datenschutz

Die Demo nutzt ausschliesslich fiktive Daten aus `data/demo-data.js`. Echte Personen-, Kontakt-, Telefon-, E-Mail-, LinkedIn- oder Beziehungsdaten duerfen nicht in dieses Paket uebernommen werden, weil GitHub Pages oeffentliches statisches Hosting ist.
