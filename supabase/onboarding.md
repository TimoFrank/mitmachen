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
7. User den GitHub-Pages-Link geben und ersten Login testen.
8. Im Kompass oben rechts das Profil oeffnen und Rolle/Moeglichkeiten pruefen.
9. In einem Testkontakt den User als Owner auswaehlen.
10. Eine erste gespeicherte Suche anlegen, damit der persoenliche Arbeitsbereich sichtbar wird.

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
- Login funktioniert.
- Profil erscheint in Owner-Auswahl.
- Viewer kann nicht speichern.
- Editor kann Kontakt anlegen/bearbeiten.
- Admin kann Import, Archiv und Pflege-Queue sehen.
