# Nutzer-Onboarding fuer den Versorgungs-Kompass

Diese Anleitung ist fuer Admins gedacht, die neue Kolleg:innen in Supabase und im Kompass startklar machen.

## Rollen kurz erklaert

- `admin`: Kontakte anlegen und bearbeiten, Import-Batches nutzen, archivieren/wiederherstellen, Pflege-Queue und Datenqualitaet bearbeiten, Rollen setzen.
- `editor`: Kontakte anlegen und bearbeiten, eigene gespeicherte Suchen nutzen, Pflege-Queue abarbeiten.
- `viewer`: Kontakte, Karte, Auswertung und Filter lesen; keine Daten veraendern.

## Neuer User in 10 Minuten

1. In Supabase `Authentication > Users` oeffnen.
2. `Add user` oder Einladung per E-Mail nutzen.
3. E-Mail-Adresse und Passwort oder Magic-Link-Verfahren festlegen.
4. User einmal einloggen lassen, damit der Trigger ein Profil in `public.profiles` erzeugt.
5. In Supabase `Table Editor > profiles` pruefen, ob die E-Mail vorhanden ist.
6. `display_name`, `initials`, `role` und `active = true` setzen.
7. Optional ein Login-Kuerzel in `public.login_aliases` pflegen.
8. User den GitHub-Pages-Link geben und ersten Login testen.
9. Im Kompass oben rechts das Profil oeffnen und Rolle/Moeglichkeiten pruefen.
10. In einem Testkontakt den User als Owner auswaehlen.
11. Eine erste gespeicherte Suche anlegen, damit der persoenliche Arbeitsbereich sichtbar wird.

## SQL-Beispiele

Rolle und Profil setzen:

```sql
update public.profiles
set
  display_name = 'Vorname Nachname',
  initials = 'VN',
  role = 'editor',
  active = true
where email = 'vorname.nachname@example.de';
```

Rollen pruefen:

```sql
select id, email, display_name, initials, role, active
from public.profiles
order by display_name nulls last, email;
```

Login-Kuerzel setzen:

```sql
insert into public.login_aliases (alias, email, profile_id, active)
select 'timo', email, id, true
from public.profiles
where lower(email) = lower('timofrank@icloud.com')
on conflict (alias) do update
set email = excluded.email,
    profile_id = excluded.profile_id,
    active = true;
```

Aktuelle Kuerzel pruefen:

```sql
select alias, email, active, updated_at
from public.login_aliases
order by alias;
```

User deaktivieren, ohne Datenhistorie zu verlieren:

```sql
update public.profiles
set active = false
where email = 'vorname.nachname@example.de';
```

## Erster Login fuer Kolleg:innen

1. GitHub-Pages-Link oeffnen.
2. Mit E-Mail/Passwort oder Magic Link anmelden.
3. Oben rechts das Profil oeffnen.
4. Rolle pruefen.
5. Kontaktliste, Karte und Auswertung ansehen.
6. Eine Suche filtern und speichern.
7. Falls Editor/Admin: Testkontakt bearbeiten oder neuen Demo-Kontakt anlegen.

## Owner-Regel

Owner sollten echte Supabase-Profile sein. Nur dann sind sie eindeutig und rollenfaehig. Alte Owner ohne Supabase-Account bleiben markiert und sollten schrittweise durch echte Profile ersetzt werden.

## Login-Kuerzel

Der Login akzeptiert E-Mail-Adresse oder Kuerzel. Der Anzeigename `profiles.display_name` bleibt reine Anzeige in der App; der technische Login-Alias liegt in `public.login_aliases.alias`.

Die produktiven Kuerzel sind:

- `timo` -> `timofrank@icloud.com`
- `bibi` -> `timo.frank@hashtag-gesundheit.de`
- `benjamin` -> `timo.frank@gematik.de`

Die Alias-Tabelle ist nicht fuer normale Frontend-Reads freigegeben. Die Aufloesung passiert ueber die Supabase Edge Function `login-with-alias`, damit die E-Mail-Zuordnung nicht in Frontend-Dateien ausgeliefert wird.

## Datenpflege-Regeln

- Keine echten Kontakt- oder Personendaten in GitHub-Dateien eintragen.
- Neue Kontakte moeglichst mit Owner, Organisation, Sektor, Standort und E-Mail anlegen.
- Unsichere Daten nicht verstecken, sondern mit Pflege-Queue und Notiz transparent nachziehen.
- Im Zweifel lieber archivieren statt loeschen. Physisches Loeschen ist im MVP nicht vorgesehen.
- Import-Batches nur nach Vorschau und Plausibilitaetscheck starten.

## Admin-Checkliste nach dem Anlegen

- Profil hat sinnvollen Anzeigenamen und Initialen.
- Rolle ist korrekt gesetzt.
- `active` steht auf `true`.
- Optionales Login-Kuerzel ist in `login_aliases` gesetzt und aktiv.
- Login funktioniert.
- Profil erscheint in Owner-Auswahl.
- Viewer kann nicht speichern.
- Editor kann Kontakt anlegen/bearbeiten.
- Admin kann Import, Archiv und Pflege-Queue sehen.
