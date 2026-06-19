# Betriebshandbuch Versorgungs-Kompass

Statushinweis: Dieses Handbuch beschreibt den bisherigen Supabase-Betrieb und bleibt bis zur Abnahme des gematik-Zielbetriebs als Legacy-Referenz erhalten. Fuer das neue Zielbild sind `DEPLOYMENT_GEMATIK_K8S.md`, `DEPLOYMENT_UEBERSICHT.md` und `../architektur/API_CONTRACT.md` fuehrend.

Dieses Handbuch beschreibt den Betrieb des Versorgungs-Kompass fuer Admins und fachlich verantwortliche Personen. Es erklaert die wichtigsten Komponenten, Routinen, Backups, Deployments und Notfallablaeufe ohne vorausgesetztes Entwicklerwissen.

## 1. Ueberblick

Der Versorgungs-Kompass ist ein internes CRM-aehnliches Werkzeug fuer Versorgungskontakte. Nutzer koennen Kontakte suchen, filtern, bearbeiten, archivieren, auf der Karte ansehen und in Auswertungen pruefen. Der gemeinsame produktive Datenstand liegt in Supabase.

Wichtige Komponenten:

| Komponente | Aufgabe |
| --- | --- |
| GitHub Pages / `docs/` | Oeffnet die statische Web-App im Browser. GitHub Pages speichert keine produktiven Kontaktdaten. |
| Frontend in `app/`, `login/`, `map/`, `data/` | HTML/JavaScript-Oberflaeche, Login, Kartenansicht und Data-Service. |
| Supabase-Projekt | Gemeinsames Backend fuer Login, Datenbank, Rechte und Datenzugriff. |
| Supabase Auth | Anmeldung der Nutzer. Nach dem ersten Login wird ein Profil in `profiles` angelegt. |
| Supabase-Datenbank | Produktiver Datenbestand fuer Kontakte, Profile, Aenderungen, gespeicherte Suchen und Nutzereinstellungen. |
| `data/supabase-config.js` | Frontend-Konfiguration mit Supabase URL und anon/publishable Key. |
| `scripts/` | Lokale Admin-Skripte fuer Import, GitHub-Pages-Sync, Sicherheitspruefung und Backup-Export. |

Produktive Kontakt-, E-Mail-, Telefon- und CRM-Daten duerfen nicht in die oeffentlichen Seed-Dateien oder in GitHub Pages geschrieben werden. Die Dateien `data/versorgungs-kompass-data.csv` und `data/versorgungs-kompass-data.js` bleiben leer und dienen nur als Fallback-Schnittstelle.

## 2. Rollen im Betrieb

| Rolle | Darf | Darf nicht |
| --- | --- | --- |
| Admin | Kontakte anlegen, bearbeiten, archivieren und wiederherstellen; Hospitationen anfragen, buchen, dokumentieren und archivierte Hospitationen sehen; Importe ausfuehren; Profile/Rollen pflegen; Archiv und Datenqualitaet pruefen; Backups exportieren. | Service-Role-Key ins Frontend oder Repository schreiben. |
| Editor | Aktive Kontakte anlegen und bearbeiten; Hospitationen anfragen, buchen, durchfuehren und dokumentieren. | Kontakte archivieren/wiederherstellen, archivierte Hospitationen sehen, Rollen aendern, Admin-Importe oder Supabase-Konfiguration aendern. |
| Viewer | Kontakte und aktive Hospitationen lesen, suchen, filtern, Karte und Auswertung ansehen. | Kontakte oder Hospitationen bearbeiten, speichern, importieren oder archivieren. |
| Technische Verantwortung | Deployment, Supabase-Konfiguration, RLS/Policies, Backup-Skripte, Sicherheitschecks. | Fachliche Kontaktentscheidungen ohne Datenverantwortliche treffen. |
| Fachliche Datenverantwortung | Datenqualitaet, Owner-Zuordnung, Dubletten, Importfreigabe, Archiventscheidung. | Supabase-Schluessel oder RLS-Policies ohne technische Pruefung aendern. |

Empfohlene Regel fuer eine kleine 3-Personen-Nutzung:

- Mindestens 1 Admin fuer Betrieb und Notfaelle.
- 1 bis 2 Editor fuer laufende Pflege.
- Viewer nur fuer reine Einsicht.
- Supabase-Konfiguration, RLS und Service-Role-Key nur durch technische Verantwortung.
- Importe nur durch Admins und erst nach Backup oder Export.

## 3. Supabase-Konfiguration

Aktueller Frontend-Konfigurationsstand:

- Projekt-URL: `https://fntqoqxriipjzfhzxiry.supabase.co`
- Projekt-Referenz: `fntqoqxriipjzfhzxiry`
- Frontend-Datei: `data/supabase-config.js`
- Publish-Kopie: `docs/data/supabase-config.js`
- Modus: `dataMode: "supabase"`
- benoetigt im Frontend: `supabaseUrl` und `supabaseAnonKey`

Sicherheitsregeln:

- Der Supabase anon/publishable Key darf im Frontend stehen, wenn Auth und RLS korrekt aktiv sind.
- Der Service-Role-Key darf niemals in `data/`, `docs/`, `app/`, `login/`, GitHub Pages oder andere Frontend-Dateien.
- Der Service-Role-Key darf nur lokal als Umgebungsvariable oder in geschuetzten CI-Secrets genutzt werden.
- Keine Passwoerter, privaten Tokens oder produktiven Backups ins Repository committen.

Benoetigte Tabellen:

| Tabelle | Zweck |
| --- | --- |
| `profiles` | Nutzerprofile, Rollen, Anzeigenamen, aktive/inaktive Nutzer. |
| `contacts` | Produktive Versorgungskontakte. Wichtigste Tabelle fuer Liste, Detailprofil, Suche, Filter, Karte und Auswertung. |
| `organizations` | Organisationen, Einrichtungen und Institutionen hinter Kontakten. Kontakte verweisen optional ueber `contacts.organization_id`. |
| `changes` | Aenderungsverlauf je Kontakt, inklusive Create, Update, Archive und Import. |
| `saved_views` | Gespeicherte private oder Team-Sichten fuer Kontakte, Karte und Auswertung. |
| `user_settings` | Nutzerspezifische Anzeige- und Tabellen-Einstellungen. |

Sprint 8 erweitert `profiles` additiv um `avatar_url`, `team` und `bio`. Persoenliche Start- und Anzeigeoptionen bleiben in `user_settings`; die minimale Benachrichtigungsbasis liegt in `preferences.notificationsEnabled`.

Nicht vorhanden im aktuellen Schema:

- Keine eigene Tabelle `imports`. Importe werden ueber `changes.action = 'import'` und Import-Batch-Hinweise im Kontakt/Importbericht nachvollzogen.
- Keine eigene Tabelle `activities`.
- Keine eigenen Tabellen `topics` oder `contact_topics`; Themen liegen als Textarray `contacts.topics` im Kontakt.

RLS/Rechte:

- RLS ist fuer `profiles`, `contacts`, `organizations`, `changes`, `saved_views` und `user_settings` aktiviert.
- Angemeldete Nutzer koennen aktive Kontakte lesen.
- Angemeldete Nutzer koennen aktive Organisationen lesen.
- Admins sehen auch archivierte Kontakte.
- Editor/Admin koennen aktive Kontakte und Organisationen schreiben.
- Nur Admins koennen archivieren/wiederherstellen und Profile/Rollen pflegen.
- Nutzer koennen im Profil nur eigene Basisdaten und das eigene Profilbild pflegen; Rollen bleiben nicht selbst editierbar.

Profilbilder:

- Storage-Bucket: `profile-images`
- Pfad: `<auth.uid()>/avatar.<jpg|png|webp>`
- Erlaubte Dateitypen: JPG, PNG, WebP
- Groessenlimit: 5 MB
- Aktuelle Umsetzung nutzt oeffentliche Storage-URLs fuer einfache statische Auslieferung. Das ist betriebsarm, bedeutet aber: Wer die URL kennt, kann das Bild abrufen. Fuer vertraulichere Anforderungen spaeter privaten Bucket mit signierten URLs einplanen.
- SQL fuer die produktive Nachziehung: `supabase/sprint8-user-profile.sql`

Kontaktbilder:

- Kontaktbilder werden in Sprint F als manuelle URL am Kontakt gepflegt, nicht automatisch recherchiert oder heruntergeladen.
- Die Felder `image_source_url`, `image_source_label`, `image_rights_note`, `image_updated_at` und `image_updated_by` dokumentieren die Bildquelle additiv.
- Produktive Nachziehung: `supabase/migrations/20260516_add_contact_image_sources.sql`.
- Es gibt keine automatische rechtliche Bewertung; fachliche Nutzer pruefen Quelle und Nutzung vor dem Hinterlegen.

## 4. Regelmaessige Betriebsroutinen

### Taegliche Kurzpruefung, 2 bis 5 Minuten

1. App ueber GitHub Pages oder lokalen Link oeffnen.
2. Einloggen.
3. Pruefen, ob die Kontaktliste Kontakte aus Supabase laedt.
4. Suche mit einem bekannten Kontakt testen.
5. Einen Kontakt oeffnen und Detaildaten plausibel pruefen.
6. Karte oeffnen und schauen, ob Marker erscheinen.
7. Auswertung oeffnen und pruefen, ob Gesamtzahl plausibel ist.
8. Auffaelligkeiten in einem internen Notizkanal dokumentieren.

### Woechentliche Admin-Pruefung, 15 bis 30 Minuten

1. Neue Kontakte pruefen.
2. Kontakte ohne Owner pruefen.
3. Kontakte ohne Organisation pruefen.
4. Kontakte ohne Standort oder Koordinaten pruefen.
5. Datenqualitaets-Ansicht pruefen.
6. Archivierte Kontakte pruefen: gehoeren sie wirklich ins Archiv?
7. Neue Imports und Importberichte pruefen.
8. Dublettenhinweise pruefen.
9. Supabase Dashboard auf auffaellige Fehler, Auth-Probleme oder ungewohnte Nutzung pruefen.
10. Auffaelligkeiten mit Verantwortlichkeit und naechstem Schritt dokumentieren.

### Monatliche Admin-Routine, 30 bis 60 Minuten

1. Vollstaendiges Backup exportieren: `contacts`, `profiles`, `changes`, `saved_views`, `user_settings`.
2. Backup ausserhalb des Repositorys ablegen.
3. Stichprobe von 5 bis 10 Kontakten pruefen: Owner, Organisation, Standort, E-Mail/Telefon, Aktualitaet.
4. Dubletten pruefen.
5. Auswertungen auf Plausibilitaet pruefen.
6. Supabase-Nutzung und Limits im Dashboard pruefen.
7. RLS/Policies mit `supabase/operations-checks.sql` pruefen, besonders nach Schema-Aenderungen.
8. Offene Pflegeaufgaben priorisieren.

### Nach Importen

1. Anzahl importierter Kontakte mit der Ausgangsdatei vergleichen.
2. Importbericht herunterladen oder intern ablegen.
3. Dubletten und fehlerhafte Kontakte pruefen.
4. Datenqualitaets-Ansicht pruefen.
5. Karte und Auswertung kurz pruefen.
6. Nach dem Import ein Backup erstellen.
7. Bei falschem Import nicht hektisch loeschen: erst Importhistorie/Aenderungsverlauf pruefen und betroffene Kontakte identifizieren.

## 5. Backup und Wiederherstellung

### Was gesichert werden muss

Regelmaessig sichern:

- `contacts_backup_YYYY-MM-DD.csv`
- `profiles_backup_YYYY-MM-DD.csv`
- `changes_backup_YYYY-MM-DD.csv`
- `saved_views_backup_YYYY-MM-DD.csv`
- `user_settings_backup_YYYY-MM-DD.csv`

Falls spaeter vorhanden, ebenfalls sichern:

- `imports_backup_YYYY-MM-DD.csv`
- `activities_backup_YYYY-MM-DD.csv`
- `organizations_backup_YYYY-MM-DD.csv`
- `topics_backup_YYYY-MM-DD.csv`
- `contact_topics_backup_YYYY-MM-DD.csv`

### Empfohlene Frequenz

- Vor jedem groesseren Import oder Batch-Aenderung: Sofort-Backup.
- Monatlich: vollstaendiges Betriebsbackup.
- Nach einem Import: Nach-Import-Backup.
- Bei intensiver Nutzung: woechentliches Backup.

### Backup per Skript

Dieses Repository enthaelt ein lokales Exportskript:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
node scripts/export_supabase_backup.mjs "/sicherer/ordner/versorgungs-kompass/2026-05-16"
```

Standardformat ist CSV. Fuer JSON:

```bash
BACKUP_FORMAT=json \
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
node scripts/export_supabase_backup.mjs "/sicherer/ordner/versorgungs-kompass/2026-05-16"
```

Wichtig:

- Zielordner nicht im GitHub-Repository waehlen.
- `backups/` und typische Backup-Dateien sind in `.gitignore` ausgeschlossen, trotzdem Backups besser direkt ausserhalb des Projekts speichern.
- Service-Role-Key nur fuer diesen Terminal-Lauf setzen und nicht in Dateien speichern.

### Manueller Export ueber Supabase Dashboard

1. Supabase Dashboard oeffnen.
2. Projekt `fntqoqxriipjzfhzxiry` auswaehlen.
3. `Table Editor` oeffnen.
4. Tabelle `contacts` auswaehlen.
5. Export als CSV ausfuehren und Datei als `contacts_backup_YYYY-MM-DD.csv` speichern.
6. Schritte fuer `profiles`, `changes`, `saved_views`, `user_settings` wiederholen.
7. Dateien in einem geschuetzten Team-Ordner ablegen.
8. Backup kurz pruefen: Datei laesst sich oeffnen, Header vorhanden, Zeilenanzahl plausibel.

### Wiederherstellung grundsaetzlich

- Einzelne falsche Bearbeitung: Aenderungsverlauf pruefen und alte Werte manuell wieder eintragen.
- Einzelner archivierter Kontakt: Archiv oeffnen und Status wieder auf aktiv setzen.
- Fehlerhafter Import: betroffene Kontakte ueber Importbericht, Batch-Hinweis oder `changes.action = 'import'` identifizieren; dann manuell korrigieren oder Kontakte archivieren/wiederherstellen.
- Grosser Datenverlust: keine Schnellreparatur im Produktivsystem. Erst aktuellen Zustand exportieren, dann Restore in Testprojekt oder kontrolliert in Supabase planen.

## 6. Deployment und Updates

Vor einem Deployment:

1. Aktuellen Zustand sichern: `git status --short`.
2. Bei Daten-/Import-Risiko Backup exportieren.
3. Keine produktiven Kontaktdaten in `data/versorgungs-kompass-data.*` oder `docs/data/versorgungs-kompass-data.*`.
4. Supabase-Konfiguration pruefen: URL und anon/publishable Key korrekt.
5. Sicherstellen: kein Service-Role-Key im Frontend.
6. Lokalen Webserver starten, z. B. `python3 -m http.server 4173`.
7. Login lokal testen.
8. Kontakte laden, Kontakt oeffnen, Kontakt bearbeiten, speichern.
9. Karte oeffnen.
10. Auswertung oeffnen.
11. Checks ausfuehren:

```bash
node --check data/data-service.js
node --check docs/data/data-service.js
node scripts/audit_public_assets.mjs
git diff --check
```

Nach einem Deployment:

1. GitHub Pages oeffnen.
2. Login pruefen.
3. Kontaktliste aus Supabase laden.
4. Suche und Filter testen.
5. Detailprofil oeffnen.
6. Mit Admin oder Editor einen kleinen Testwert aendern und zurueckaendern.
7. Karte pruefen.
8. Auswertung pruefen.
9. Browser-Konsole auf offensichtliche Fehler pruefen.
10. Mobile Kurzcheck: Login, Liste, Detailansicht.

GitHub Pages und Supabase spielen korrekt zusammen, wenn die App nach Login Kontakte laedt, das Profil oben rechts die erwartete Rolle zeigt und Speichern ohne Fehlermeldung in Supabase sichtbar wird.

## 7. Fehlerbehebung und Wiederherstellung

### Kontakt versehentlich falsch bearbeitet

1. Kontakt oeffnen.
2. Aenderungsverlauf ansehen.
3. Betroffenes Feld und alten Wert ermitteln.
4. Alten Wert manuell wieder eintragen.
5. Speichern.
6. Korrektur intern kurz dokumentieren.

### Kontakt versehentlich archiviert

1. Als Admin anmelden.
2. Archiv oeffnen.
3. Kontakt suchen.
4. Kontakt wiederherstellen oder Status auf aktiv setzen.
5. Kontakt in der normalen Liste suchen und pruefen.

### Falscher Import

1. Importbericht, Batch-ID oder Importhinweis im Kontakt pruefen.
2. Betroffene Kontakte identifizieren.
3. Kontaktanzahl mit Ausgangsdatei vergleichen.
4. Wenn nur wenige Kontakte betroffen sind: manuell korrigieren oder archivieren.
5. Wenn viele Kontakte betroffen sind: Backup und Restore-Option mit technischer Verantwortung abstimmen.
6. Nach Korrektur Datenqualitaet, Suche, Karte und Auswertung pruefen.

### App laedt keine Daten

1. Internetverbindung pruefen.
2. Neu laden und erneut einloggen.
3. Browser-Konsole oeffnen und Fehlermeldung notieren.
4. Supabase Dashboard pruefen: Projekt erreichbar, Auth aktiv.
5. `data/supabase-config.js` und `docs/data/supabase-config.js` pruefen.
6. RLS/Rechte pruefen: Nutzer hat aktives Profil und passende Rolle.
7. Browser-Cache oder localStorage leeren, danach neu anmelden.

### Supabase-Verbindung fehlgeschlagen

1. Supabase Status/Dashboard pruefen.
2. Projekt-URL und anon Key in `supabase-config.js` pruefen.
3. Pruefen, ob der Supabase JS Client im Browser geladen wurde.
4. Wenn nur GitHub Pages betroffen ist: `docs/data/supabase-config.js` mit `data/supabase-config.js` vergleichen und Sync ausfuehren.

### Speichern funktioniert nicht

1. Rolle pruefen: Viewer darf nicht speichern.
2. Kontaktstatus pruefen: archivierte Kontakte koennen nur Admins wiederherstellen.
3. Pflichtfelder pruefen: Name und gueltige Prioritaet muessen vorhanden sein.
4. Netzwerkfehler in Browser-Konsole pruefen.
5. Supabase-Fehlermeldung notieren.
6. RLS pruefen: `updated_by` muss angemeldeter Nutzer sein, Editor/Admin erforderlich.

### Kontakt wird nicht aktualisiert

1. Nach dem Speichern Seite neu laden.
2. Pruefen, ob ein Filter den Kontakt ausblendet.
3. Aenderungsverlauf pruefen.
4. Supabase Tabelle `contacts` pruefen.
5. Wenn App und Supabase unterschiedlich wirken: Browser-Cache/localStorage leeren.

### Karte zeigt falsche Daten

1. Kontakt pruefen: `latitude` und `longitude` vorhanden und plausibel?
2. Standort/PLZ/Bundesland pruefen.
3. Filter pruefen: Karte zeigt nur aktuell gefilterte Kontakte.
4. Kontakt speichern und Karte neu oeffnen.

### Auswertung stimmt nicht

1. Aktive Filter entfernen.
2. Archiv-Ansicht pruefen: archivierte Kontakte werden getrennt behandelt.
3. Dubletten und fehlende Pflichtdaten in Datenqualitaet pruefen.
4. Kontaktliste neu laden.

### Nutzer kann nicht bearbeiten

1. Profil in `profiles` pruefen: `active = true`.
2. Rolle pruefen: `editor` oder `admin` erforderlich.
3. Neu einloggen lassen.
4. Wenn Rolle gerade geaendert wurde: Browser neu laden.

## 8. Notfallprozess

### Datenbestand wirkt beschaedigt

1. Keine weiteren Importe oder Batch-Aenderungen ausfuehren.
2. Team informieren: App nur lesend nutzen.
3. Sofort aktuellen Zustand exportieren.
4. Letztes funktionierendes Backup identifizieren.
5. Schaden eingrenzen: einzelne Kontakte, Import-Batch oder ganze Tabelle?
6. Wiederherstellung mit technischer Verantwortung planen.

### Supabase nicht erreichbar

1. Supabase Status und Projekt-Dashboard pruefen.
2. Keine lokalen Ersatzdaten in GitHub committen.
3. Team informieren und spaeter erneut pruefen.
4. Nach Wiederherstellung Login, Liste, Speichern, Karte und Auswertung testen.

### App zeigt leere Liste

1. Pruefen, ob Login noch gueltig ist.
2. Filter zuruecksetzen.
3. Als Admin Archiv pruefen.
4. Browser-Konsole pruefen.
5. Supabase Tabelle `contacts` pruefen.
6. Wenn Tabelle leer wirkt: keine Importversuche starten, Backup/Restore-Prozess beginnen.

### Fehlerhafte Veroeffentlichung

1. Letzten funktionierenden Stand in Git pruefen.
2. Fehlerbehebung oder Rueckkehr auf vorherigen Stand vorbereiten.
3. Nach Deployment GitHub Pages neu testen.
4. Public-Asset-Audit ausfuehren.

## 9. Smoke-Test in wenigen Minuten

Nach jeder Aenderung oder nach einem Deployment:

- [ ] Login funktioniert.
- [ ] Kontakte werden geladen.
- [ ] Suche findet einen bekannten Kontakt.
- [ ] Filter fuer Owner, Bundesland oder Prioritaet funktioniert.
- [ ] Detailprofil oeffnet.
- [ ] Editor/Admin kann Kontakt bearbeiten.
- [ ] Editor/Admin kann einen Einzelkontakt ueber den Drawer anlegen.
- [ ] Editor/Admin kann die Bulk-Anlage per Online-Tabelle im Bereich `Importe` oeffnen.
- [ ] Online-Tabelle speichert nur fehlerfreie Zeilen nach Supabase; Fehlerzeilen bleiben bearbeitbar.
- [ ] Speichern schreibt nach Supabase.
- [ ] Aenderungsverlauf zeigt die Aenderung.
- [ ] Hospitationen laden, eine Anfrage kann erstellt und eine gebuchte Hospitation dokumentiert werden.
- [ ] Admin kann Kontakt archivieren.
- [ ] Admin kann Kontakt aus Archiv wiederherstellen.
- [ ] Karte zeigt Kontakte mit Koordinaten.
- [ ] Auswertung zeigt plausible Zahlen.
- [ ] Datenqualitaet zeigt erwartbare Hinweise.
- [ ] Importansicht ist fuer Admin sichtbar.
- [ ] Dateiimport ist fuer Admins erreichbar und von der Online-Tabelle getrennt.
- [ ] Viewer kann nicht speichern.
- [ ] Keine offensichtlichen Browser-Console-Errors.

### Kontaktanlage und Importrechte

- Admin und Editor duerfen Kontakte ueber den Drawer und die Online-Tabelle anlegen.
- Viewer sehen keine irrefuehrenden Anlagefunktionen und duerfen wegen RLS/Policies nicht schreiben.
- Dateiimport bleibt Admin-Arbeit, weil Upload, Mapping, Batch-Protokoll und Rollback groesseren Datenbetrieb betreffen.
- Es werden nur Supabase anon/publishable Keys im Frontend verwendet; Service-Role-Keys bleiben Skripten und Betrieb vorbehalten.

## 10. Sicherheitspruefung

Vor Deployment oder monatlich ausfuehren:

```bash
node scripts/audit_public_assets.mjs
rg -n "service[_-]?role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|password|token|private key" -g '!*node_modules*' .
find . -maxdepth 4 -type f \( -iname '*backup*' -o -iname '*.env*' \)
```

Bewertung:

- `SUPABASE_SERVICE_ROLE_KEY` darf in Skriptdokumentation und Beispielbefehlen vorkommen, aber nie als echter Wert.
- `passwordHash` in `login/auth-config.js` ist nur die lokale Fallback-Schranke und kein Supabase-Service-Key.
- Produktive Backups gehoeren nicht ins Repository.
- Falls ein echter geheimer Key gefunden wird: nicht weiterverteilen, Key rotieren, Datei bereinigen, Git-Historie bewerten.
