# Datenmodell Versorgungs-Kompass

Stand: abgeleitet aus `supabase/schema.sql` und `data/data-service.js`. Historische Postgres-Migrationsentwuerfe liegen nur noch im Archiv.

Zielbild-Hinweis: Supabase bleibt in diesem Dokument als Ursprungsschema und Migrationsquelle sichtbar. Die neue gematik-Zielarchitektur fuehrt das relationale Modell in Shared PostgreSQL weiter.

## Ueberblick

Der produktive Ziel-Datenbestand liegt in Shared PostgreSQL. Das bisherige Supabase-Schema `public` bleibt die wichtigste Migrationsquelle. Die App nutzt fachlich diese Tabellen:

- `profiles`
- `contacts`
- `organizations`
- `formats`
- `format_participants`
- `hospitation_slots`
- `hospitations`
- `changes`
- `saved_views`
- `user_settings`
- `login_aliases`

Nicht im aktuellen Schema vorhanden sind eigene Tabellen fuer `imports`, `activities`, `topics` oder `contact_topics`. Importereignisse werden im Aenderungsverlauf protokolliert, Themen liegen direkt als Array im Kontakt.

## Beziehungen

```mermaid
erDiagram
  profiles ||--o{ contacts : "owner_id"
  organizations ||--o{ contacts : "organization_id"
  profiles ||--o{ contacts : "created_by"
  profiles ||--o{ contacts : "updated_by"
  profiles ||--o{ formats : "owner_id"
  formats ||--o{ format_participants : "format_id"
  contacts ||--o{ format_participants : "contact_id"
  profiles ||--o{ hospitation_slots : "owner_id"
  contacts ||--o{ hospitation_slots : "contact_id"
  organizations ||--o{ hospitation_slots : "organization_id"
  hospitation_slots ||--o{ hospitations : "slot_id"
  profiles ||--o{ hospitations : "owner_id"
  profiles ||--o{ hospitations : "requester_profile_id"
  contacts ||--o{ hospitations : "contact_id"
  organizations ||--o{ hospitations : "organization_id"
  contacts ||--o{ changes : "contact_id"
  profiles ||--o{ changes : "changed_by"
  profiles ||--o{ saved_views : "owner_id"
  profiles ||--|| user_settings : "user_id"
  saved_views ||--o{ user_settings : "default_view_id"
  profiles ||--o{ login_aliases : "profile_id"
```

## Tabelle `profiles`

Zweck:

- Nutzerprofile fuer angemeldete Supabase-Auth-Nutzer.
- Rollensteuerung fuer Admin, Editor und Viewer.
- Owner-Auswahl in Kontakten.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, entspricht `auth.users.id`, Primaerschluessel. |
| `email` | Login-/Kontaktadresse. |
| `display_name` | Anzeigename in App und Owner-Auswahl. |
| `initials` | Kurzlabel/Avatar. |
| `role` | `admin`, `editor` oder `viewer`. |
| `avatar_url` | Oeffentliche URL zum Profilfoto im Storage-Bucket `profile-images`. |
| `team` | Optionaler Team-/Bereichshinweis fuer das Nutzerprofil. |
| `bio` | Optionale Kurzbeschreibung im Nutzerprofil. |
| `active` | Nur aktive Profile werden in der App geladen. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Login-/Profilanzeige.
- Rollenhinweise.
- Owner-Auswahl in Kontaktformularen.
- Anzeige im Aenderungsverlauf.
- Profilfoto in Sidebar, Nutzerbereich und Owner-Badges.

Kritische Felder:

- `role`, weil sie Schreibrechte steuert.
- `active`, weil inaktive Nutzer nicht als aktive Profile erscheinen.
- `display_name` und `email`, weil sie Owner-Zuordnung und Nachvollziehbarkeit beeinflussen.

Automatisch gesetzt:

- Neues Profil wird durch Trigger `handle_new_user()` nach erstem Auth-Login angelegt.
- `created_at` und `updated_at` haben Defaults.

Duerfen Nutzer bearbeiten:

- Nutzer duerfen das eigene Profil fuer `display_name`, `initials`, `avatar_url`, `team` und `bio` aktualisieren.
- `email`, `role` und `active` sind nicht durch die Profil-UI editierbar.
- Admins pflegen Rollen weiterhin ausserhalb der Profilseite in Supabase.

## Tabelle `contacts`

Zweck:

- Zentrale Tabelle fuer Versorgungskontakte.
- Grundlage fuer Liste, Detailprofil, Suche, Filter, Karte, Auswertung, Datenqualitaet und Archiv.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Text-ID, Primaerschluessel, bleibt ueber Imports stabil. |
| `name` | Kontaktname, Pflichtfeld. |
| `organization_id` | Optionaler Verweis auf `organizations.id`. MVP-Verknuepfung Kontakt zu Organisation. |
| `organization` | Organisation/Einrichtung als bestehender Freitext-Fallback. Bleibt erhalten. |
| `sector` | Kategorie/Sektor, im UI als `category`. |
| `specialty` | Fachrichtung. |
| `priority` | `Hoch`, `Mittel`, `Niedrig`; Default `Mittel`. |
| `owner_id` | Verweis auf `profiles.id`. |
| `postal_code`, `city`, `federal_state` | Standortdaten. |
| `latitude`, `longitude` | Koordinaten fuer Kartenansicht. |
| `email`, `phone`, `linkedin` | Kontaktdaten. |
| `topics` | Themen als Textarray. |
| `notes` | Notizen. |
| `source` | Quellen/Importhinweise als Text. |
| `image_url` | Bildpfad oder URL. |
| `image_source_url` | Optional dokumentierte URL der Bildquelle. |
| `image_source_label` | Menschlich lesbare Bildquellenbezeichnung. |
| `image_rights_note` | Kurzer Hinweis zur geprueften Quelle/Nutzung; keine Rechtsbewertung. |
| `image_updated_at` | Zeitpunkt der letzten Bild-/Bildquellenpflege. |
| `image_updated_by` | Profil, das Bild-/Bildquellenfelder zuletzt gepflegt hat. |
| `status` | `active` oder `archived`. |
| `created_by`, `updated_by` | Verweise auf bearbeitende Profile. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Kontaktliste, Suche und Filter.
- Detailprofil und Bearbeitungsformular.
- Kontaktbild und Abschnitt `Bild & Quelle`; ohne Bild zeigt die UI Initialen.
- Klickbare Organisation im Kontaktprofil, sofern `organization_id` oder passender Freitext vorhanden ist.
- Kartenansicht ueber Koordinaten.
- Auswertung und Datenqualitaets-Ansicht.
- Archivansicht fuer Admins.
- CSV-Export der sichtbaren/geladenen Kontakte.

Kritische Felder:

- `id`: darf nicht versehentlich veraendert werden.
- `name`: Pflichtfeld und zentrale Suche.
- `status`: steuert Archiv/aktive Sichtbarkeit.
- `owner_id`: fachliche Verantwortung und Filter.
- `organization_id`: neue CRM-Beziehung zur Organisation; Freitext bleibt Fallback.
- `latitude`/`longitude`: Karte.
- `priority`, `sector`, `specialty`, `federal_state`: Filter und Auswertung.
- `image_url` und Bildquellenfelder: rein manuelle Dokumentation, keine automatische Bilduebernahme.

Automatisch gesetzt:

- `created_at` per Default.
- `updated_at` per Trigger `contacts_touch_updated_at`.
- `created_by` und `updated_by` werden vom Data-Service beim Erstellen gesetzt.
- `updated_by` wird beim Speichern gesetzt.

Duerfen Nutzer bearbeiten:

- Editor/Admin: aktive Kontakte.
- Admin: Archivieren und Wiederherstellen.
- Viewer: keine Bearbeitung.

## Tabelle `organizations`

Zweck:

- Eigene CRM-Entitaet fuer Einrichtungen, Institutionen und Unternehmen hinter Versorgungskontakten.
- Grundlage fuer den Hauptbereich "Organisationen", Organisationsliste und Organisationsprofil.
- Sichtbar machen, dass mehrere Personen einer Organisation zugeordnet sein koennen.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `name` | Organisationsname, Pflichtfeld. |
| `normalized_name` | Normalisierter Vergleichswert fuer Suche, Migration und spaetere Dublettenpruefung. |
| `sector` | Sektor, z. B. Praxis, Krankenhaus, Apotheke, Pflege, Krankenkasse. |
| `organization_type` | Optionaler Organisationstyp, z. B. Universitaetsklinikum oder Pflegeeinrichtung. |
| `postal_code`, `city`, `federal_state` | Standortdaten. |
| `latitude`, `longitude` | Optionale Koordinaten fuer spaetere Kartenintegration. |
| `website`, `phone`, `email` | Kontaktwege der Organisation. |
| `notes` | Organisationsnotiz. |
| `source` | Quelle des Organisationsdatensatzes. |
| `status` | `active` oder `archived`. |
| `created_by`, `updated_by` | Bearbeitende Profile. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Neuer Sidebar-Tab "Organisationen".
- Organisationsliste mit Suche, Sektor-/Bundeslandfilter, Standort, Kontaktanzahl und Aktualisierung.
- Organisationsprofil mit Stammdaten, Themen aus zugeordneten Kontakten, Notizen und Abschnitt "Zugeordnete Kontakte".
- Vom Organisationsprofil aus koennen Kontakte geoeffnet, zugeordnet oder neu fuer diese Organisation angelegt werden.

Migrationslogik:

- Migration `supabase/migrations/20260516_create_organizations.sql` legt `organizations` an und ergaenzt `contacts.organization_id`.
- Bestehende eindeutige `contacts.organization`-Freitextwerte werden getrimmt, mit zusammengefassten Leerzeichen normalisiert und als erste Organisationen angelegt.
- Unsichere Dubletten wie "UKB" und "Universitaetsklinikum Bonn" werden nicht automatisch zusammengefuehrt.
- Danach werden Kontakte per normalisiertem Freitext auf die neue Organisation verlinkt.

Duerfen Nutzer bearbeiten:

- Viewer: lesen.
- Editor/Admin: Organisationen anlegen und bearbeiten, Kontakte zuordnen.
- Admin: spaeter archivieren/zusammenfuehren; vollstaendige Dublettenpflege ist nicht Teil von Sprint 4.

## Tabelle `formats`

Zweck:

- Planungsobjekte fuer Roundtables, Fachgespraeche, Workshops und Veranstaltungen.
- Ersetzt externe Excel-Einladungslisten durch CRM-verknuepfte Formate.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `title` | Titel des Formats, Pflichtfeld. |
| `format_type` | Typ, z. B. Roundtable, Fachgespraech, Workshop oder Veranstaltung. |
| `starts_at`, `ends_at` | Optionaler Zeitraum. |
| `location` | Ort, Raum oder Online-Hinweis. |
| `goal` | Thema oder Ziel der Runde. |
| `owner_id` | Verantwortliches Profil. |
| `status` | `Planung`, `Aktiv`, `Abgeschlossen` oder `Archiviert`. |
| `notes` | Interne Planungsnotiz. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

## Tabelle `format_participants`

Zweck:

- Verknuepft bestehende Kontakte mit einem Format.
- Speichert nur Einladungs- und Planungsinformationen; Kontakt- und Organisationsdaten bleiben in `contacts` bzw. `organizations`.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `format_id` | Verweis auf `formats.id`, wird beim Loeschen des Formats entfernt. |
| `contact_id` | Verweis auf `contacts.id`. |
| `invitation_status` | `Kandidat`, `Eingeladen`, `Zugesagt`, `Abgesagt`, `Keine Rückmeldung` oder `Teilgenommen`. |
| `participant_role` | Rolle im Format, z. B. Sprecherin, Teilnehmer, Moderation. |
| `notes` | Format-spezifische Teilnehmernotiz. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

Kritische Regeln:

- `format_id` und `contact_id` sind eindeutig kombiniert; ein Kontakt kann pro Format nur einmal auftauchen.
- Viewer lesen Formate und Teilnehmer, Editor/Admin pflegen sie, nur Admins loeschen Formate.

## Tabelle `hospitation_slots`

Zweck:

- Interne Terminangebote fuer Hospitationen.
- Grundlage fuer direkte Buchungen durch Editor/Admin.
- Optionaler Bezug zu Kontakt oder Organisation, falls ein Slot bereits fachlich vorgeplant ist.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `contact_id` | Optionaler Verweis auf `contacts.id`. |
| `organization_id` | Optionaler Verweis auf `organizations.id`. |
| `starts_at`, `ends_at` | Zeitraum des angebotenen Termins; `starts_at` ist Pflicht. |
| `location` | Ort, Einrichtung, Raum oder Online-Hinweis. |
| `capacity` | Interne Kapazitaet, mindestens 1. |
| `owner_id` | Verantwortliches Profil. |
| `status` | `Frei`, `Reserviert`, `Gebucht`, `Abgesagt` oder `Archiviert`. |
| `notes` | Interne Terminnotiz. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

## Tabelle `hospitations`

Zweck:

- Eigenes CRM-Modell fuer Hospitationsanfragen, Buchungen, Durchfuehrung und Dokumentation.
- Erfasst Versorgungskontakte und Organisationen, ohne Hospitationen als `formats`-Spezialfall zu behandeln.
- Sichtbar im Arbeitsbereich `Hospitationen` und in Kontakt-/Organisationsprofilen.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `slot_id` | Optionaler Verweis auf `hospitation_slots.id`. |
| `contact_id` | Optionaler Verweis auf `contacts.id`. |
| `organization_id` | Optionaler Verweis auf `organizations.id`. |
| `requester_profile_id` | Profil, das die Anfrage bzw. Buchung ausgelöst hat. |
| `owner_id` | Verantwortliches Profil. |
| `status` | `Entwurf`, `Angefragt`, `Angeboten`, `Gebucht`, `Abgelehnt`, `Abgesagt`, `Durchgeführt`, `Dokumentiert` oder `Archiviert`. |
| `requested_windows` | Optionale Terminwunschfenster als JSON. |
| `starts_at`, `ends_at` | Geplanter oder gebuchter Zeitraum. |
| `location` | Ort, Einrichtung, Raum oder Online-Hinweis. |
| `goal` | Ziel oder Anlass der Hospitation. |
| `topics` | Themenliste als Textarray. |
| `request_note` | Interne Anfrage- oder Planungsnotiz. |
| `documentation_summary` | Pflicht-Minimum fuer die Ergebnisnotiz nach Durchfuehrung. |
| `documentation_outcome` | Auswertung, Ergebnis oder fachliche Einordnung. |
| `follow_up_note`, `follow_up_owner_id`, `follow_up_due_at` | Nachverfolgung offener Aufgaben. |
| `documented_at`, `documented_by` | Dokumentationszeitpunkt und dokumentierendes Profil. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

Kritische Regeln:

- Viewer lesen aktive Hospitationen und Slots.
- Editor/Admin koennen Hospitationen anfragen, buchen, durchfuehren und dokumentieren.
- Archivierte Hospitationen und Slots bleiben Admins vorbehalten.

## Tabelle `changes`

Zweck:

- Aenderungsverlauf je Kontakt.
- Nachvollziehbarkeit von Erstellen, Bearbeiten, Archivieren und Importen.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Fortlaufende ID. |
| `contact_id` | Verweis auf `contacts.id`. |
| `action` | `create`, `update`, `archive` oder `import`. |
| `field_name` | Geaendertes Feld, falls feldbezogen. |
| `old_value` | Alter Wert als Text. |
| `new_value` | Neuer Wert als Text. |
| `changed_at` | Zeitpunkt der Aenderung. |
| `changed_by` | Verweis auf `profiles.id`. |

UI-Nutzung:

- Aenderungsverlauf im Kontakt-Detailprofil.
- Importereignisse werden als Historieneintraege sichtbar.
- Recovery einzelner falscher Bearbeitungen.

Kritische Felder:

- `contact_id`, `action`, `field_name`, `old_value`, `new_value`, `changed_by`.
- Ohne sauberen Verlauf ist Recovery deutlich schwieriger.

Automatisch gesetzt:

- `id` als Identity.
- `changed_at` per Default.
- App/Skripte schreiben Logeintraege nach Create, Update, Archive und Import.

Duerfen Nutzer bearbeiten:

- Die App fuegt Eintraege fuer Editor/Admin hinzu.
- Eintraege sollten nicht manuell geaendert oder geloescht werden.

## Tabelle `saved_views`

Zweck:

- Gespeicherte Ansichten/Sichten fuer Kontakte, Organisationen, Karte und Auswertung.
- Private Sichten und Team-Sichten.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primaerschluessel. |
| `owner_id` | Besitzerprofil. |
| `name`, `description` | Name und Beschreibung. |
| `scope` | `private` oder `team`. |
| `view_type` | `contacts`, `organizations`, `formats`, `hospitations`, `map` oder `analytics`. |
| `filters` | Filter als JSON. |
| `search_query` | Suchtext. |
| `sort_key`, `sort_direction` | Sortierung. |
| `page_size` | Tabellenlaenge. |
| `is_default` | Standardsicht. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Gespeicherte Ansichten werden ausserhalb des Filterpanels gefuehrt, z. B. im kompakten Ansichts-Dropdown `Ansicht: Alle Kontakte` oder im Einstellungsbereich.
- Eine gespeicherte Ansicht kann Suche, Filter, Sortierung, Seitengroesse und spaeter sichtbare Spalten enthalten.
- Das Filterpanel setzt nur aktuelle Filter; es verwaltet keine gespeicherten Ansichten.

Kritische Felder:

- `scope`: Team-Sichten sind fuer alle sichtbar.
- `filters`: bestimmt die fachliche Sicht.
- `owner_id`: steuert private Sichtbarkeit.

Automatisch gesetzt:

- `id`, `created_at`, `updated_at`.
- `updated_at` per Trigger.

Duerfen Nutzer bearbeiten:

- Nutzer koennen eigene Sichten verwalten.
- Admins koennen Team-Sichten verwalten.

## Tabelle `user_settings`

Zweck:

- Persoenliche Einstellungen pro Nutzer.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `user_id` | Verweis auf `profiles.id`, Primaerschluessel. |
| `default_view_id` | Optionale Standardsicht. |
| `default_view_type` | `contacts`, `organizations`, `formats`, `hospitations`, `map` oder `analytics`. |
| `table_density` | `compact`, `comfortable`, `spacious`. |
| `theme` | `system`, `light`, `contrast`. |
| `font_scale` | Schriftgroesse zwischen 0.9 und 1.2. |
| `page_size` | Standard-Tabellenlaenge. |
| `preferences` | Weitere Einstellungen als JSON. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Tabellen- und Ansichtseinstellungen.
- Default-Sicht.
- Sprint 8 nutzt `preferences.defaultContactTab` und `preferences.notificationsEnabled` als einfache Vorbereitung.

Kritische Felder:

- `user_id`: Nutzer darf nur eigene Einstellungen lesen/schreiben.
- `default_view_id`: kann auf geloeschte/veraenderte Sichten zeigen, wird bei geloeschter Sicht auf `null` gesetzt.

Hinweis:

- `default_view_type` erlaubt `contacts`, `organizations`, `formats`, `hospitations`, `map` und `analytics`.
- `table_density = compact` reduziert die Tabellenhoehe.
- Benachrichtigungen sind nur als boolean `notificationsEnabled` vorbereitet; es gibt noch kein Notification-Center, keinen E-Mail-Versand und keine Push-Logik.

Automatisch gesetzt:

- `created_at`, `updated_at`.
- `updated_at` per Trigger.

Duerfen Nutzer bearbeiten:

- Jeder angemeldete Nutzer nur die eigenen Einstellungen.

## Tabelle `login_aliases`

Zweck:

- Server-seitige Zuordnung kurzer Login-Kuerzel zu Supabase-Auth-E-Mail-Adressen.
- Komfort-Login im Versorgungs-Kompass, ohne die E-Mail-Zuordnung in Frontend-Dateien auszuliefern.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `alias` | Login-Kuerzel, klein geschrieben, eindeutig, z. B. `timo`. |
| `email` | Zugehoerige Supabase-Auth-E-Mail-Adresse. |
| `profile_id` | Optionaler Bezug zum Profil in `public.profiles`. |
| `active` | Steuert, ob das Kuerzel fuer Login-Aufloesung verwendet wird. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Das Login-Formular akzeptiert Kuerzel oder E-Mail.
- Die Supabase Edge Function `login-with-alias` loest Kuerzel serverseitig auf und meldet danach mit E-Mail und Passwort bei Supabase Auth an.

Kritische Felder:

- `alias`, weil es der sichtbare Login-Identifier ist.
- `email`, weil es auf den echten Supabase Auth User zeigen muss.
- `active`, weil damit Kuerzel deaktiviert werden koennen, ohne den Auth User oder das Profil zu loeschen.

Duerfen Nutzer bearbeiten:

- Normale Nutzer lesen oder bearbeiten `login_aliases` nicht direkt.
- Pflege erfolgt administrativ ueber SQL/Supabase Dashboard oder Service-Role-Kontext.

## Views und Funktionen

| Objekt | Zweck |
| --- | --- |
| `public.current_profile_role()` | Liefert Rolle des aktuell angemeldeten aktiven Profils fuer RLS-Policies. |
| `public.touch_updated_at()` | Aktualisiert `updated_at` bei Updates. |
| `public.handle_new_user()` | Legt nach Supabase-Auth-Registrierung ein Profil an. |

## Storage `profile-images`

Zweck:

- Ablage von Profilbildern fuer angemeldete Nutzer.
- Dateipfad: `<auth.uid()>/avatar.<jpg|png|webp>`.
- Erlaubte Typen: `image/jpeg`, `image/png`, `image/webp`.
- Groessenlimit: 5 MB.

RLS/Policy-Hinweise:

- Authentifizierte Nutzer duerfen nur im eigenen Ordner hochladen, ersetzen und loeschen.
- Die aktuelle Umsetzung nutzt oeffentliche Bild-URLs, damit Avatare in der statischen App ohne signierte URL-Erneuerung stabil angezeigt werden.
- Risiko: Wer die URL kennt, kann das Profilbild abrufen. Keine sensiblen oder vertraulichen Fotos verwenden, solange kein privater Bucket mit signierten URLs umgesetzt ist.

## RLS- und Rechtehinweise

- RLS ist fuer alle genannten Tabellen aktiv.
- `authenticated` hat technische Grants, konkrete Aktionen werden durch Policies eingeschraenkt.
- Viewer duerfen nicht schreiben.
- Editor/Admin duerfen aktive Kontakte erstellen und bearbeiten.
- Admins duerfen archivieren/wiederherstellen und Profile verwalten.
- Service-Role darf fuer lokale Admin-Skripte alles, darf aber nie ins Frontend.

## Kontaktanlage Sprint E

Die Kontaktanlage verwendet weiterhin `contacts`; es gibt keine neue Datenquelle und kein neues Bulk-Datenmodell.

- Einzelkontakt und Online-Tabelle schreiben ueber `window.dataService.createContact()` nach Supabase.
- Pflichtfeld in der UI ist `name`.
- Defaults: `priority = Mittel`, `status = active`, `owner_id` wird gesetzt, wenn ein Profil ausgewaehlt ist; sonst bleibt Owner leer.
- Online-Tabelle validiert je Zeile: fehlender Name, ungueltige E-Mail, grob ungueltige Telefonnummer und unbekannter Sektor sind Fehler.
- Online-Tabelle warnt bei fehlender Organisation, fehlendem Ort/Bundesland, fehlendem Owner, fehlender Fachrichtung, moeglicher Dublette und fehlendem Kontaktweg.
- Dublettenpruefung ist nur eine UI-Warnung gegen den aktuell geladenen Kontaktbestand; sie ersetzt keine eindeutigen Datenbank-Constraints.
- Dateiimport bleibt CSV/Excel plus Mapping; Online-Tabelle ist manuelle tabellarische Anlage ohne Datei-Upload und ohne Importprofil.

## Hinweise fuer spaetere Features

- Organisationen sind seit Sprint 4 eigene Datensaetze. Eine spaetere Ausbaustufe kann Mehrfachzuordnungen ueber `contact_organizations` und Dubletten-Zusammenfuehrung ergaenzen.
- Aktivitaeten sollten nicht in `changes` vermischt werden; `changes` ist Audit/Recovery, nicht CRM-Aktivitaetsplanung.
- Importhistorie koennte spaeter eine eigene Tabelle bekommen; aktuell helfen `changes.action = 'import'`, Importberichte und Batch-Hinweise.
- Themen sind aktuell `contacts.topics`; bei wachsender Taxonomie koennen `topics` und `contact_topics` sinnvoll werden.
