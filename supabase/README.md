# Supabase Setup fuer den Versorgungs-Kompass

## 1. Projekt erstellen

1. Neues Supabase-Projekt anlegen.
2. Unter `Settings > API` die `Project URL` und den `anon public` Key kopieren.
3. In `data/supabase-config.js` eintragen. Niemals den Service-Role-Key ins Frontend legen.

## 2. Datenbank einrichten

1. `supabase/schema.sql` im Supabase SQL Editor ausfuehren.
2. RLS ist danach fuer `profiles`, `contacts` und `changes` aktiv.

## 3. Auth aktivieren

Fuer den MVP reicht E-Mail/Passwort oder Magic Link:

1. `Authentication > Providers > Email` aktivieren.
2. Nutzer:innen unter `Authentication > Users` anlegen oder einladen.
3. Nach dem ersten Login die Rolle in `profiles.role` setzen: `admin`, `editor` oder `viewer`.

Beispiel:

```sql
update public.profiles
set role = 'admin', display_name = 'Timo Frank', initials = 'TF'
where email = 'timo@example.de';
```

## 4. Kontakte importieren

Bestehende IDs bleiben stabil, weil `contacts.id` ein Text-Primary-Key ist. Fehlende Prioritaet wird zu `Mittel`, fehlender Status zu `active`.

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
SUPABASE_IMPORT_USER_ID="auth-user-uuid" \
node scripts/import_contacts_to_supabase.mjs data/versorgungs-kompass-data.csv
```

Der Service-Role-Key ist nur fuer lokale Admin-Skripte gedacht und darf nicht deployed werden.

## 5. End-to-End-Test

1. Als `viewer` anmelden: Kontakte, Karte und Auswertung muessen lesbar sein; Speichern muss durch RLS fehlschlagen.
2. Als `editor` anmelden: Kontakt anlegen und bearbeiten.
3. In `changes` pruefen, ob bearbeitete Felder protokolliert wurden.
4. Als `admin` anmelden: Kontakt archivieren; er verschwindet aus Liste, Karte und Dashboard.
5. Ausloggen oder privates Browserfenster nutzen: Ohne Supabase-Session darf kein Datenzugriff moeglich sein.
