# Demo und Screenshots

Die Demo gibt einen schnellen Einblick in den Versorgungs-Kompass. CRM- und Fachdaten sind fiktiv; das Politik-Modul verwendet als einzige Ausnahme einen kuratierten Snapshot öffentlicher Angaben zu den Mitgliedern des Gesundheitsausschusses. Die Demo enthält keine produktiven Kontakte.

## Online ansehen

- [Demo mit fiktiven CRM-/Fachdaten und öffentlichem Amtsträger-Verzeichnis öffnen](https://timofrank.github.io/mitmachen/)

Die Demo verwendet dieselbe vollständige App-Oberfläche wie die geschützte Anwendung: Kontaktpflege, Karte, Auswertung, Stakeholder, Expertenkreis, Hospitationen, Fragebogen, Dashboard, Formate und Teams sind mit synthetischen Beispielen erlebbar. Im Politik-Modul zeigt Pages zusätzlich den feldminimierten öffentlichen Bundestags-Snapshot. Nur Datenquelle und Identität unterscheiden sich: Pages arbeitet anonym und lokal im Browser; die geschützte Anwendung nutzt Login und API. Ihre interne Ziel-URL wird nicht im öffentlichen Repository vorgegeben.

## Screenshots

Aktuelle Screenshots werden bei der visuellen Abnahme aus dem gebauten Pages-Artefakt erzeugt. Dadurch können keine veralteten Realanwendungs- oder geschützten Personendarstellungen als statische Repository-Bilder weiterleben. Alle synthetischen Demo-Kontaktnamen beginnen mit `Demo`, alle Demo-Adressen verwenden reservierte Beispieldomains. Amtsträgernamen, Bundestagsprofile und freigegebene Bildquellen stammen dagegen aus dem separat geprüften öffentlichen Politik-Snapshot.

## Lokal starten

```bash
npm install
npm run build:pages
npm start
```

Danach öffnen:

- Demo: `http://localhost:4173/dist/pages/`
- Realanwendungsquelle: `http://localhost:4173/frontend/app/versorgungs-kompass.html` (benötigt eine geschützte API-Konfiguration)

## Technischer Hinweis

Der Pages-Workflow baut die gemeinsame Oberfläche aus `frontend/app/`, `frontend/map/` und den öffentlichen Assets. Ausschließlich im Pages-Artefakt werden `frontend/data/public-politics-directory.js`, `frontend/data/demo-data.js` und `frontend/data/demo-api.js` vorgeschaltet. `npm run generate:public-politics-directory` ruft den aktuellen öffentlichen Bundestagsstand ab und synchronisiert anschließend denselben Datenstand reproduzierbar in `politik-offline.html`; eingebettete Portrait- und Kartenartefakte bleiben nur erhalten, solange Ausschussbesetzung, Wahlkreiszuordnung und Bildrechte unverändert sind. Ändert sich eine dieser Grundlagen, stoppt der Generator fail-closed und verlangt eine erneute kuratierte Prüfung. Beim Build werden 38 Mitglieder, eine PLZ je Person, erlaubte Felder/Hosts sowie freigegebene Bildrechte geprüft. Ein Snapshot, dessen Abrufzeitpunkt mehr als 14 Tage zurückliegt oder unzulässig in der Zukunft liegt, wird fail-closed abgelehnt. Einstieg ist `dist/pages/versorgungs-kompass.html`; `dist/pages/` und die Online-Route `/demo/` leiten dorthin weiter. Es gibt keinen Login, kein Supabase und keinen Zugriff auf ein externes Fach-API. Frühere Cloud-Run-Demos sind nur noch historische Referenzen. Die Build-Trennung steht im [Deployment-Runbook](DEPLOYMENT_GEMATIK_K8S.md).
