# Demo und Screenshots

Die Demo gibt einen schnellen Einblick in den Versorgungs-Kompass. Sie arbeitet nur mit fiktiven Daten und enthält keine produktiven Kontakte.

## Online ansehen

- [Demo mit fiktiven Daten öffnen](https://timofrank.github.io/mitmachen/demo/)

Die Demo zeigt bewusst einen einfachen Ausschnitt. Die geschützte Realanwendung enthält zusätzlich die gemeinsame Kontaktpflege, Hospitationen, Fragebogen, Framework, Dashboard, Formate, Teams und rollenabhängige Werkzeuge. Ihre interne Ziel-URL wird nicht im öffentlichen Repository vorgegeben.

## Screenshots

Aktuelle Screenshots werden bei der visuellen Abnahme aus dem gebauten Pages-Artefakt erzeugt. Dadurch koennen keine veralteten Realanwendungs- oder Personendarstellungen als statische Repository-Bilder weiterleben. Alle Demo-Namen beginnen mit `Demo`, alle Demo-Adressen verwenden reservierte Beispieldomains.

## Lokal starten

```bash
npm install
npm start
```

Danach öffnen:

- Demo: `http://localhost:4173/frontend/demo/`
- Realanwendungsquelle: `http://localhost:4173/frontend/app/versorgungs-kompass.html` (benoetigt eine geschuetzte API-Konfiguration)

## Technischer Hinweis

Die Demo liegt in `frontend/demo/`. Der Pages-Workflow baut sie gemeinsam mit den statischen Assets nach `dist/pages/demo/` und veröffentlicht dieses Artefakt direkt. Frühere Cloud-Run-Demos sind nur noch historische Referenzen. Der aktuelle Stand steht in der [Deployment-Übersicht](DEPLOYMENT_UEBERSICHT.md).
