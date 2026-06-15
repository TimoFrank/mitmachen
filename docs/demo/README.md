# Versorgungs-Kompass Demo-Paket

Dieses Verzeichnis ist die statische Demo fuer den Versorgungs-Kompass Pilot. Es ist fuer interne IT-Pruefung gedacht und enthaelt keine produktiven CRM-Daten.

## Benoetigte Dateien

- `index.html`
- `demo.css`
- `demo-app.js`
- `../data/demo-data.js`
- `../public/demo-person-lisa.svg`
- `../public/demo-person-jens.svg`
- `../map/versorgungs-kompass-map.html` fuer den lokalen eingebetteten Kartenmodus

## GitHub Pages

GitHub Pages veroeffentlicht im Projekt den Ordner `docs/`. Das Sync-Skript kopiert diese Demo deshalb nach `docs/demo/` und passt den Kartenpfad fuer die Pages-Struktur auf `../versorgungs-kompass-map.html` an.

Nach dem Sync ist der Pages-Einstieg:

```text
https://timofrank.github.io/mitmachen/demo/
```

## Datenschutz

Die Demo nutzt ausschliesslich `data/demo-data.js`. Diese Datei enthaelt fiktive Namen, `example.test`-Adressen und Demo-Hinweise. Echte Personen-, Kontakt-, Telefon-, E-Mail-, LinkedIn- oder CRM-Daten duerfen nicht in dieses Paket uebernommen werden, weil GitHub Pages oeffentliches statisches Hosting ist.
