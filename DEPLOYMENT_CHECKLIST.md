# Deployment-Checkliste

Kurze Checkliste fuer Aenderungen am Versorgungs-Kompass.

## Vor Deployment

- [ ] Aktuellen Stand sichern: `git status --short`.
- [ ] Bei groesseren Daten-/Importaenderungen Backup exportieren.
- [ ] Lokale Aenderungen pruefen: keine fremden oder unbeabsichtigten Dateien.
- [ ] Supabase-Konfiguration pruefen: `data/supabase-config.js` und `docs/data/supabase-config.js`.
- [ ] Kein Service-Role-Key, privater Token oder Passwort im Frontend.
- [ ] Keine echten Kontaktdaten in `data/versorgungs-kompass-data.*` oder `docs/data/versorgungs-kompass-data.*`.
- [ ] Falls Publish-Dateien betroffen sind: `bash scripts/sync_github_pages.sh` ausfuehren.
- [ ] Lokalen Webserver starten, z. B. `python3 -m http.server 4173`.
- [ ] Login lokal testen.
- [ ] Kontakte laden.
- [ ] Kontakt oeffnen.
- [ ] Kontakt bearbeiten.
- [ ] Kontakt speichern und Aenderung zuruecksetzen.
- [ ] Karte oeffnen.
- [ ] Auswertung oeffnen.
- [ ] Checks ausfuehren:

```bash
node --check data/data-service.js
node --check docs/data/data-service.js
node scripts/audit_public_assets.mjs
git diff --check
```

## Nach Deployment

- [ ] GitHub Pages laedt korrekt.
- [ ] Login funktioniert.
- [ ] Kontakte werden aus Supabase geladen.
- [ ] Suche funktioniert.
- [ ] Filter funktionieren.
- [ ] Detailprofil oeffnet.
- [ ] Angemeldeter Nutzer und Rolle werden plausibel angezeigt.
- [ ] Admin oder Editor kann Kontakt bearbeiten.
- [ ] Speichern schreibt nach Supabase.
- [ ] Aenderungsverlauf zeigt die Testaenderung.
- [ ] Karte zeigt Kontakte.
- [ ] Auswertung zeigt plausible Zahlen.
- [ ] Datenqualitaet ist erreichbar.
- [ ] Importansicht ist nur fuer Admins sichtbar.
- [ ] Viewer kann nicht speichern.
- [ ] Keine offensichtlichen Browser-Console-Errors.
- [ ] Mobile Kurzcheck: Login, Liste, Detailprofil.

## Schnellurteil

Deployment gilt als in Ordnung, wenn Login, Kontaktliste, Speichern, Karte und Auswertung funktionieren und der Public-Asset-Audit keine Risiken meldet.
