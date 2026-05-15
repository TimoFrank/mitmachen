# Supabase Setup fuer den Versorgungs-Kompass

## 1. Projekt erstellen

1. Neues Supabase-Projekt anlegen.
2. Unter `Settings > API` die `Project URL` und den `anon public` Key kopieren.
3. In `data/supabase-config.js` eintragen. Niemals den Service-Role-Key ins Frontend legen.

## 2. Datenbank einrichten

1. `supabase/schema.sql` im Supabase SQL Editor ausfuehren.
2. RLS ist danach fuer `profiles`, `contacts`, `changes`, `saved_views` und `user_settings` aktiv.

## 3. Auth aktivieren

Fuer den MVP reicht E-Mail/Passwort oder Magic Link:

1. `Authentication > Providers > Email` aktivieren.
2. Nutzer:innen unter `Authentication > Users` anlegen oder einladen.
3. Nach dem ersten Login die Rolle in `profiles.role` setzen: `admin`, `editor` oder `viewer`.

Eine kurze Admin-Anleitung fuer neue Kolleg:innen liegt in `supabase/onboarding.md`.

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

## 6. Gespeicherte Suchen und Einstellungen

Phase 4 nutzt zwei Tabellen:

- `saved_views`: private gespeicherte Suchen pro User, spaeter optional `scope = 'team'` fuer Team-Views.
- `user_settings`: persoenliche Standardansicht, Seitenlaenge, Tabellendichte, Theme, Schriftgroesse und weitere CRM-Praeferenzen.

Wenn `schema.sql` bereits frueher ausgefuehrt wurde, kann fuer Phase 4 auch nur `supabase/phase4-saved-views.sql` ausgefuehrt werden.

RLS-Regeln:

- Private Views sind nur fuer den jeweiligen `owner_id` sichtbar.
- Team-Views sind fuer authentifizierte Nutzer lesbar.
- Team-Views koennen nur Admins anlegen oder verwalten.
- `user_settings` gehoert immer genau dem eingeloggten User.
