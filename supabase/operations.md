# Betrieb und Sicherheit

Diese Checkliste beschreibt den Regelbetrieb fuer den Versorgungs-Kompass mit GitHub Pages als statischer Oberflaeche und Supabase als Backend.

## Grundregeln

- Produktive Kontakt-, Personen-, E-Mail-, Telefon- und CRM-Daten liegen ausschliesslich in Supabase.
- GitHub Pages liefert nur die App, Karten-Assets, Login-Dateien, leere Seed-Dateien und den Supabase `anon`/Publishable-Key aus.
- Der `anon`/Publishable-Key darf im Frontend stehen. Er ist nicht geheim und wird durch Auth und RLS begrenzt.
- Der Service-Role-Key ist geheim. Er darf nur lokal in Terminal-Umgebungsvariablen oder in geschuetzten Server-/CI-Secrets genutzt werden.
- Physisches Loeschen ist im MVP nicht vorgesehen. Kontakte werden archiviert (`status = archived`).

## RLS-Policies regelmaessig pruefen

Monatlich oder nach Schema-Aenderungen im Supabase SQL Editor pruefen:

Die folgenden Checks liegen auch als ausfuehrbare Datei in `supabase/operations-checks.sql`.

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'contacts', 'changes', 'saved_views', 'user_settings')
order by tablename;
```

Erwartung: `rowsecurity = true` fuer alle Tabellen.

Policies pruefen:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Grants pruefen:

```sql
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'contacts', 'changes', 'saved_views', 'user_settings')
order by table_name, grantee, privilege_type;
```

Wichtige Erwartungen:

- `authenticated` darf lesen, aber Schreibrechte werden durch RLS eingeschraenkt.
- Viewer koennen nicht schreiben.
- Editor/Admin koennen aktive Kontakte schreiben.
- Nur Admins sehen archivierte Kontakte und koennen archivieren/wiederherstellen.
- `service_role` darf fuer lokale Admin-Skripte alles, wird aber nie im Frontend verwendet.

## Auth Redirect URLs

In Supabase unter `Authentication > URL Configuration` pflegen:

- Site URL: `https://timofrank.github.io/mitmachen`
- Redirect URL fuer Invite und Passwort-Reset: `https://timofrank.github.io/mitmachen/set-password.html`
- Redirect URL fuer normalen Login: `https://timofrank.github.io/mitmachen/login.html`
- optional fuer lokale Tests: `http://127.0.0.1:PORT/login/login.html`, `http://127.0.0.1:PORT/login/set-password.html` oder der konkret genutzte lokale Pfad

Damit Invite-Mails direkt auf die Passwortseite zeigen, in `Authentication > Email Templates > Invite user` keinen reinen Login-Link verwenden, sondern den Token-Hash an die Passwortseite geben:

```html
<a href="{{ .SiteURL }}/set-password.html?token_hash={{ .TokenHash }}&type=invite&return=./versorgungs-kompass.html">Einladung annehmen</a>
```

Die Seite `set-password.html` verarbeitet `code`, Hash-Session-Tokens und `token_hash`.

Nach Aenderungen testen:

1. Abmelden.
2. Login-Seite oeffnen.
3. Mit einem Viewer anmelden.
4. Pruefen, ob die Weiterleitung in den Kompass klappt.
5. Mit Editor/Admin wiederholen.

## Deployment

1. Aenderungen in `app/`, `data/`, `login/`, `map/` oder `public/` machen.
2. `bash scripts/sync_github_pages.sh` ausfuehren.
3. Checks ausfuehren:

```bash
node --check data/data-service.js
node --check docs/data/data-service.js
node scripts/audit_public_assets.mjs
git diff --check
```

4. Committen und nach `main` pushen.
5. GitHub Pages oeffnen und Login, Kontaktliste, Karte und Auswertung kurz testen.

## Neue Nutzer:innen und Rollen

Siehe `supabase/onboarding.md`.

Kurzfassung:

1. User in Supabase Auth anlegen oder einladen.
2. Ersten Login durchfuehren lassen, damit `profiles` erzeugt wird.
3. `display_name`, `initials`, `role`, `active` setzen.
4. Profil im Kompass oben rechts pruefen.
5. Owner-Auswahl in einem Kontakt testen.

## Backup-Strategie

### Kurzfristig

- Vor groesseren Imports oder Batch-Aenderungen CSV-Export aus der App herunterladen.
- Import-Batches nur mit Vorschau starten.
- Rollback im Import-Protokoll nutzt Archivierung statt physischem Loeschen.

### Regelmaessig

Mindestens woechentlich einen Datenexport aus Supabase erstellen:

- Supabase Dashboard: `Table Editor`/Export fuer `contacts`, `profiles`, `changes`, `saved_views`, `user_settings`
- oder per `pg_dump`, wenn CLI/DB-Zugang eingerichtet ist.

Beispiel fuer einen lokalen Dump, wenn `DATABASE_URL` gesetzt ist:

```bash
pg_dump "$DATABASE_URL" \
  --schema public \
  --file "backup-versorgungs-kompass-$(date +%Y%m%d).sql"
```

Backups nicht in dieses GitHub-Repository committen.

## Restore und Wiederherstellung

Je nach Schaden:

- Einzelner versehentlich archivierter Kontakt: im Archiv oeffnen und wiederherstellen.
- Fehlerhafter Import-Batch: im Import-Protokoll Rollback nutzen; Kontakte werden archiviert.
- Fehlerhafte Bearbeitung einzelner Felder: Kontaktverlauf pruefen und Werte manuell korrigieren.
- Groesserer Datenverlust: Supabase Backup/SQL-Dump in ein neues Projekt oder eine kontrollierte Wiederherstellung einspielen.

Vor einem groesseren Restore:

1. App fuer Teamkommunikation kurz sperren oder Nutzer:innen informieren.
2. Aktuellen Zustand exportieren.
3. Restore in Testprojekt pruefen.
4. Erst danach produktiv wiederherstellen.

## Monitoring im Alltag

Woechentlich:

- Pflege-Queue in der Auswertung pruefen.
- Archivierte Kontakte kurz kontrollieren.
- Neue Profile und Rollen pruefen.
- Gespeicherte Suchen bei auffaelligen Fehlern loeschen oder neu anlegen lassen.

Monatlich:

- RLS-Policies und Grants pruefen.
- Public-Asset-Audit laufen lassen.
- Backup/Restore-Stichprobe machen.
- Supabase Auth Redirect URLs kontrollieren.

## Notfallmassnahmen

Wenn Daten oeffentlich in GitHub gelandet sind:

1. Datei sofort bereinigen.
2. Committen und pushen.
3. GitHub Pages Deployment abwarten.
4. Git-Historie und ggf. GitHub Cache separat bewerten.
5. Betroffene Kontakte/Personen und interne Datenschutzverantwortliche informieren.

Wenn Service-Role-Key versehentlich veroeffentlicht wurde:

1. Key sofort in Supabase rotieren.
2. Alten Key nicht mehr verwenden.
3. Repository und lokale Dateien bereinigen.
4. Supabase Logs auf ungewoehnliche Zugriffe pruefen.

Wenn RLS versehentlich deaktiviert wurde:

1. App-Zugang intern pausieren.
2. `supabase/schema.sql` oder die relevanten `alter table ... enable row level security` und Policies erneut ausfuehren.
3. Viewer-Test machen: Lesen ja, Schreiben nein.
4. Editor/Admin-Test machen.
