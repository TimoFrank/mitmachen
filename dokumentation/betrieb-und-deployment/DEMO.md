# Demo und Screenshots

Die Demo gibt einen schnellen Einblick in den Versorgungs-Kompass. Sie arbeitet nur mit fiktiven Daten und enthält keine produktiven Kontakte.

## Online ansehen

- [Demo mit fiktiven Daten öffnen](https://timofrank.github.io/mitmachen/demo/)

Die Demo verwendet dieselbe vollständige App-Oberfläche wie die geschützte Anwendung: Kontaktpflege, Karte, Auswertung, Stakeholder, Expertenkreis, Hospitationen, Fragebogen, Dashboard, Formate und Teams sind mit synthetischen Beispielen erlebbar. Nur Datenquelle und Identität unterscheiden sich: Pages arbeitet anonym und lokal im Browser; die geschützte Anwendung nutzt Login und API. Ihre interne Ziel-URL wird nicht im öffentlichen Repository vorgegeben.

## Screenshots

Aktuelle Screenshots werden bei der visuellen Abnahme aus dem gebauten Pages-Artefakt erzeugt. Dadurch koennen keine veralteten Realanwendungs- oder Personendarstellungen als statische Repository-Bilder weiterleben. Alle Demo-Namen beginnen mit `Demo`, alle Demo-Adressen verwenden reservierte Beispieldomains.

## Lokal starten

```bash
npm install
npm run build:pages
npm start
```

Danach öffnen:

- Demo: `http://localhost:4173/dist/pages/`
- Realanwendungsquelle: `http://localhost:4173/frontend/app/versorgungs-kompass.html` (benoetigt eine geschuetzte API-Konfiguration)

## Technischer Hinweis

Der Pages-Workflow baut die gemeinsame Oberfläche aus `frontend/app/`, `frontend/map/` und den öffentlichen Assets. Ausschließlich im Pages-Artefakt werden `frontend/data/demo-data.js` und `frontend/data/demo-api.js` vorgeschaltet. Einstieg ist `dist/pages/versorgungs-kompass.html`; `dist/pages/` und die Online-Route `/demo/` leiten dorthin weiter. Es gibt keinen Login, kein Supabase und keinen Zugriff auf ein externes Fach-API. Frühere Cloud-Run-Demos sind nur noch historische Referenzen. Der aktuelle Stand steht in der [Deployment-Übersicht](DEPLOYMENT_UEBERSICHT.md).
