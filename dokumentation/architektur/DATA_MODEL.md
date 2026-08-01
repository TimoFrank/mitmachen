# Datenmodell Versorgungs-Kompass

Stand: 31. Juli 2026, abgeleitet aus `deploy/postgres/pre-gematik/schema.sql`, `deploy/postgres/pre-gematik/grants.sql`, den versionierten Zielmigrationen, `api/server.mjs`, `frontend/data/sector-registry.js`, `frontend/data/data-service.js` und `api/care-sector-model.mjs`.

Für die geschützte GCP-Anwendung ist Cloud SQL/PostgreSQL die alleinige relationale Datenquelle; private Objekte liegen ausschließlich in GCS. Das frühere Supabase-Schema und die zugehörigen Importwerkzeuge sind aus dem aktuellen Repository entfernt und nur noch stillgelegte Migrationshistorie. Der [historische Providerwechsel](../betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md), die Git-Historie und die geschützte Recovery-Evidenz erhalten den Herkunftsnachweis.

## Überblick

Das führende relationale Modell liegt in PostgreSQL. Die aktuelle GCP-Laufzeit verwendet dafür Cloud SQL; ein späterer gematik-Zielbetrieb übernimmt dasselbe fachliche Modell in die dort freigegebene PostgreSQL-Plattform. Die App nutzt unter anderem diese Tabellen:

- `profiles`
- `identity_bindings`
- `contacts`
- `organizations`
- `organization_primary_systems`
- `network_registrations`
- `formats`
- `format_participants`
- `hospitation_slots`
- `hospitations`
- `changes`
- `activity_events`
- `saved_views`
- `user_settings`
- `stakeholder_types`
- `stakeholder_organizations`
- `stakeholder_people`

Nicht im aktuellen Schema vorhanden sind eigene Tabellen für `imports`, `topics`, `contact_topics`, Befragungsantworten oder Einladungen. Fachliche Aktivitäten liegen in `activity_events`; Importläufe bleiben über ihre Herkunft am Ereignis erkennbar. Themen liegen direkt als Array im Kontakt.

## Beziehungen

```mermaid
erDiagram
  profiles ||--o{ identity_bindings : "profile_id"
  profiles ||--o{ contacts : "owner_id"
  organizations ||--o{ contacts : "organization_id"
  organizations ||--o{ organization_primary_systems : "organization_id"
  profiles ||--o{ contacts : "created_by"
  profiles ||--o{ contacts : "updated_by"
  profiles ||--o{ contacts : "relationship_basis_recorded_by"
  profiles ||--o{ contacts : "mitmachen_consent_recorded_by"
  profiles ||--o{ contacts : "ehc_consent_recorded_by"
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
  contacts ||--o{ activity_events : "contact_id"
  profiles ||--o{ activity_events : "actor_id"
  profiles ||--o{ saved_views : "owner_id"
  profiles ||--|| user_settings : "user_id"
  saved_views ||--o{ user_settings : "default_view_id"
```

## Fachmodell Versorgungssektoren

Der Sektorkatalog ist ein kontrolliertes Fachmodell für `contacts.sector` (im Frontend `category`) und `organizations.sector`. Seine kanonische Quelle ist `frontend/data/sector-registry.js`; `api/care-sector-model.mjs` setzt denselben Vertrag serverseitig durch. Die Datenbankfelder bleiben aus Migrations- und Importkompatibilität Textfelder und bilden keine eigene relationale Entität.

Die Auswahl eines Sektors ist nicht von vorhandenen Kontakten oder Organisationen abhängig. Filter, Karte und Formulare müssen immer den vollständigen Katalog anbieten. Ein Sektor ohne Kontakt ist deshalb ein gültiger sichtbarer Zustand und kein Grund, ihn aus der Anwendung auszublenden.

| ID | Kanonischer Wert | Wichtige kompatible Aliase | Abdeckungsziel |
| --- | --- | --- | --- |
| `praxis` | Praxis | Arztpraxis, MVZ, Zahnmedizin, Psychotherapie | ja |
| `krankenhaus` | Krankenhaus | Klinik, Fachklinik, Akutkrankenhaus | ja |
| `apotheke` | Apotheke | Vor-Ort-Apotheke | ja |
| `pflege` | Pflege | Pflegeeinrichtung, Pflegedienst | ja |
| `krankenkasse` | Krankenkasse | Kasse, Kostenträger, GKV, PKV | ja |
| `labor` | Labor | Medizinisches Labor, Labordiagnostik | ja |
| `physio-heilmittel` | Physio / Heilmittel | Therapie, Physio/Heilmittel, Physiotherapie, Ergo-, Logo- und Podologie, Heilmittelpraxis | ja |
| `hebammen` | Hebammen | Hebamme, Geburtshilfe | ja |
| `notfallversorgung` | Notfallversorgung | Rettungsdienst, Notaufnahme, Krankentransport, ärztlicher Bereitschaftsdienst | ja |
| `reha` | Reha | Rehabilitation, Rehaklinik | ja |
| `hilfsmittel` | Hilfsmittel | Hilfsmittelerbringer, Sanitätshaus, Homecare | ja |
| `sozialdienst` | Sozialdienst | Beratungsstelle, Sozialberatung | nein |
| `oegd` | ÖGD | ÖGD, Öffentlicher Gesundheitsdienst, Gesundheitsamt | nein |

`Abdeckungsziel = ja` bedeutet, dass der Sektor in der Lückenanalyse als angestrebte Versorgungsperspektive zählt. Werte mit `nein` bleiben vollwertig auswählbar und sichtbar, werden aber nicht als verpflichtende Mindestabdeckung bewertet.

Regeln für Lesen und Schreiben:

- Die API kanonisiert bekannte Aliase, zum Beispiel `Therapie` zu `Physio / Heilmittel` und `Rettungsdienst` zu `Notfallversorgung`.
- Ein leerer Sektor bleibt leer; er wird nicht stillschweigend als `Praxis` klassifiziert.
- Neue unbekannte Werte werden mit HTTP `400` abgelehnt. Legacy-Freitext kann lesbar bleiben, bis er fachlich bereinigt wird, darf aber nicht erneut als neuer Sektor gespeichert werden.
- `Digital Health` ist ausdrücklich kein Versorgungssektor. Es gehört je nach Datensatz in Themen, Rolle/Berufsgruppe, Organisationstyp oder einen Digitalisierungskontext. Bestehende Vorkommen werden nicht als Sektor ausgeliefert und müssen bei der nächsten Datenpflege fachlich zugeordnet werden.
- Kontakt und Organisation dürfen unterschiedliche Sektoren tragen. Beim Anlegen kann die Organisation den Kontakt vorbelegen; eine spätere Änderung wird nicht automatisch auf die jeweils andere Entität kaskadiert.
- Gleichnamige Felder in Hospitationen, Stakeholder-Modellen oder Befragungen beschreiben ihren jeweiligen Kontext und sind nicht automatisch an diesen Versorgungskatalog gebunden.

## Tabelle `profiles`

Zweck:

- Interne Nutzerprofile, die über eine aktive, serverseitig geprüfte OIDC-/IAP-Bindung authentisierten Identitäten zugeordnet werden.
- Rollensteuerung für Admin, Editor und Viewer.
- Owner-Auswahl in Kontakten.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Stabile interne Text-ID und Primärschlüssel; externe Identitäten werden separat über `identity_bindings` zugeordnet. |
| `email` | Login-/Kontaktadresse. |
| `display_name` | Anzeigename in App und Owner-Auswahl. |
| `initials` | Kurzlabel/Avatar. |
| `role` | `admin`, `editor` oder `viewer`. |
| `avatar_url` | Geschützte Bildreferenz; die API liefert bei Bedarf eine kurzlebige, autorisierte Anzeige-URL. |
| `team` | Optionaler Team-/Bereichshinweis für das Nutzerprofil. |
| `bio` | Optionale Kurzbeschreibung im Nutzerprofil. |
| `active` | Nur aktive Profile werden in der App geladen. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Login-/Profilanzeige.
- Rollenhinweise.
- Owner-Auswahl in Kontaktformularen.
- Anzeige im Änderungsverlauf.
- Profilfoto in Sidebar, Nutzerbereich und Owner-Badges.

Kritische Felder:

- `role`, weil sie Schreibrechte steuert.
- `active`, weil inaktive Nutzer nicht als aktive Profile erscheinen.
- `display_name` und `email`, weil sie Owner-Zuordnung und Nachvollziehbarkeit beeinflussen.

Automatisch gesetzt:

- `created_at` und `updated_at` haben Defaults.
- Profile und `identity_bindings` werden ausschließlich über den geprüften administrativen Enrollment-/Binding-Prozess provisioniert; ein erster externer Login legt kein aktives Profil an.

Dürfen Nutzer bearbeiten:

- Nutzer dürfen das eigene Profil für `display_name`, `initials`, `avatar_url`, `team` und `bio` aktualisieren.
- `email`, `role` und `active` sind nicht durch die Profil-UI editierbar.
- Admins pflegen Rollen weiterhin außerhalb der Profilseite über den geschützten PostgreSQL-/API-Administrationsprozess.

## Tabelle `contacts`

Zweck:

- Zentrale Tabelle für Versorgungskontakte.
- Grundlage für Liste, Detailprofil, Suche, Filter, Karte, Auswertung, Datenqualität und Archiv.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Text-ID, Primärschlüssel, bleibt über Imports stabil. |
| `name` | Kontaktname, Pflichtfeld. |
| `organization_id` | Optionaler Verweis auf `organizations.id`. MVP-Verknüpfung Kontakt zu Organisation. |
| `organization` | Organisation/Einrichtung als bestehender Freitext-Fallback. Bleibt erhalten. |
| `sector` | Kanonischer Versorgungssektor gemäß Abschnitt „Fachmodell Versorgungssektoren“, im UI als `category`; leer ist zulässig und hat keinen Praxis-Fallback. |
| `specialty` | Fachrichtung. |
| `role` | Funktion bzw. Rolle der Person in der Versorgung oder Organisation. |
| `priority` | `Hoch`, `Mittel`, `Niedrig`; Default `Mittel`. |
| `owner_id` | Verweis auf `profiles.id`. |
| `postal_code`, `city`, `federal_state` | Standortdaten. |
| `latitude`, `longitude` | Koordinaten für Kartenansicht. |
| `email`, `phone`, `linkedin` | Kontaktdaten. |
| `relationship_basis` | Dokumentierte Grundlage der Profilführung: `review_required`, `public_task`, `self_submitted`, `active_collaboration`, `verbal_contact` oder `public_professional_source`. Sie ist keine pauschale Kontaktfreigabe. |
| `relationship_basis_effective_at` | Zeitpunkt, ab dem die dokumentierte Profilführungsgrundlage gilt. |
| `relationship_basis_recorded_by` | Profil, das die Profilführungsgrundlage erfasst hat. |
| `relationship_basis_note` | Nachweis- oder Klärungsvermerk; bei `verbal_contact` Pflicht. |
| `mitmachen_consent_status` | Status für den einheitlichen Zweck "#Mitmachen – Kontaktaufnahme für Beteiligungsformate": `granted`, `not_requested`, `declined`, `withdrawn` oder `clarification_needed`. |
| `mitmachen_consent_effective_at` | Zeitpunkt der Erklärung, Ablehnung oder des Widerrufs. |
| `mitmachen_consent_source` | Dokumentationsquelle: `online_form`, `email`, `written`, `verbal_confirmed` oder `manual_transfer`. |
| `mitmachen_consent_text_version` | Version des zugrunde liegenden Einwilligungstextes. |
| `mitmachen_consent_recorded_by` | Profil, das den Status nachvollziehbar erfasst hat. |
| `mitmachen_consent_note` | Nachweis- oder Klärungsvermerk; bei ausdrücklich mündlicher Einwilligung Pflicht. |
| `ehc_consent_status` | Gesonderter Status nur für den Zweck E-Health Community; gleiche Statuswerte wie bei #Mitmachen. Eine EHC-Freigabe gilt nicht für #Mitmachen oder andere Kontaktzwecke. |
| `ehc_consent_effective_at` | Zeitpunkt der EHC-Erklärung, Ablehnung oder des Widerrufs. |
| `ehc_consent_source` | EHC-Nachweisquelle; zusätzlich zu den allgemeinen Quellen ist `survalyzer_ehc` zulässig. |
| `ehc_consent_text_version` | Version des zugrunde liegenden EHC-Einwilligungstextes. |
| `ehc_consent_recorded_by` | Profil, das den EHC-Status erfasst hat. |
| `ehc_consent_note` | EHC-Nachweis- oder Klärungsvermerk. |
| `topics` | Themen als Textarray. |
| `notes` | Notizen. |
| `source` | Quellen/Importhinweise als Text. |
| `image_url` | Bildpfad oder URL. |
| `image_source_url` | Optional dokumentierte URL der Bildquelle. |
| `image_source_label` | Menschlich lesbare Bildquellenbezeichnung. |
| `image_rights_note` | Kurzer Hinweis zur geprüften Quelle/Nutzung; keine Rechtsbewertung. |
| `image_updated_at` | Zeitpunkt der letzten Bild-/Bildquellenpflege. |
| `image_updated_by` | Profil, das Bild-/Bildquellenfelder zuletzt gepflegt hat. |
| `status` | `active` oder `archived`. |
| `created_by`, `updated_by` | Verweise auf bearbeitende Profile. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Kontaktliste, Suche und Filter.
- Detailprofil und Bearbeitungsformular.
- Eigener Reiter `Einwilligungen` mit getrennten Statusachsen für Profilführung, E-Health Community und #Mitmachen; keine Achse erzeugt automatisch eine Freigabe für eine andere.
- Rolle in Schnellerfassung, Import, Profil und Datenqualität.
- Kontaktbild und Abschnitt `Bild & Quelle`; ohne Bild zeigt die UI Initialen.
- Klickbare Organisation im Kontaktprofil, sofern `organization_id` oder passender Freitext vorhanden ist.
- Kartenansicht über Koordinaten.
- Auswertung und Datenqualitäts-Ansicht.
- Archivansicht für Admins.
- CSV-Export der sichtbaren/geladenen Kontakte.

Kritische Felder:

- `id`: darf nicht versehentlich verändert werden.
- `name`: Pflichtfeld und zentrale Suche.
- `status`: steuert Archiv/aktive Sichtbarkeit.
- `owner_id`: fachliche Verantwortung und Filter.
- `organization_id`: neue CRM-Beziehung zur Organisation; Freitext bleibt Fallback.
- `latitude`/`longitude`: Karte.
- `priority`, `sector`, `specialty`, `federal_state`: Filter und Auswertung.
- `role`: fachliche Einordnung des Kontakts; kein Berechtigungs- oder Einwilligungsstatus.
- `relationship_basis` und seine Nachweisfelder: dokumentieren, warum das Profil geführt wird, ohne daraus eine allgemeine Kontaktfreigabe abzuleiten.
- `mitmachen_consent_status` und seine Nachweisfelder: steuern, ob eine allgemeine #Mitmachen-Kontaktaufnahme dokumentiert freigegeben ist.
- `ehc_consent_status` und seine Nachweisfelder: gelten ausschließlich für den EHC-Zweck.
- `image_url` und Bildquellenfelder: rein manuelle Dokumentation, keine automatische Bildübernahme.

Automatisch gesetzt:

- `created_at` per Default.
- `updated_at` per Trigger `contacts_touch_updated_at`.
- `created_by` und `updated_by` werden vom Data-Service beim Erstellen gesetzt.
- `updated_by` wird beim Speichern gesetzt.
- Neue Kontakte starten bei der Profilführungsgrundlage mit `review_required` und bei beiden Einwilligungsachsen mit `not_requested`.
- Die Einführung der EHC-Achse klassifiziert bestehende Kontakte nicht automatisch als EHC-Kontakte. Eine fachlich und datenschutzrechtlich freigegebene Zuordnung erfolgt in einem separaten, kontrollierten Schritt.
- Die frühere #Mitmachen-Einführungsmigration setzte den damals unbewerteten Altbestand einmalig auf `clarification_needed`.
- Bei fachlichen Änderungen setzt die API `relationship_basis_recorded_by`, `ehc_consent_recorded_by` beziehungsweise `mitmachen_consent_recorded_by` serverseitig auf das angemeldete Profil.
- Optionale #Mitmachen-Einwilligungen aus dem Versorgungs-Netzwerk werden bei Übernahme strukturiert am Kontakt gespeichert.

Dürfen Nutzer bearbeiten:

- Editor/Admin: aktive Kontakte.
- Admin: Archivieren und Wiederherstellen.
- Viewer: keine Bearbeitung.
- EHC-only-Kontakte dürfen außer von Admins und ihren Ownern nicht bearbeitet werden.

Zugriffsprojektion für EHC-only:

- EHC-only bedeutet `ehc_consent_status = granted` und gleichzeitig `mitmachen_consent_status <> granted`.
- Admins und eingetragene Owner erhalten das vollständige DTO mit `profileAccess = ehc_authorized`.
- Alle anderen Rollen erhalten in Liste, Suche und Detailabruf nur einen nicht identifizierenden Stub mit `profileAccess = ehc_restricted` und `contactChannelAccess = restricted`. Name, Organisation, Standort, Kontaktwege, Notizen, Quellen, Bilder sowie Zeitpunkte und Nachweisfelder werden serverseitig entfernt; sichtbar bleiben nur die für den Schutzstatus nötigen Statusachsen.
- Die Einschränkung ist eine serverseitige Datenprojektion und darf nicht allein durch ausgeblendete UI-Elemente umgesetzt werden.

Fachliche Abgrenzung:

- Grundlage für den gemeinsamen Zweck ist die gematik-Datenschutzerklärung unter <https://www.gematik.de/datenschutz>.
- Die gesonderte Registrierung der E-Health Community unter <https://e-health-community.gematik.de/> wird nicht automatisch als allgemeine #Mitmachen-Einwilligung gewertet.
- Eine laufende bilaterale KOL-Zusammenarbeit ist keine pauschale Verteilerfreigabe. Ohne ausdrücklich dokumentierte Bestätigung bleibt der Kontakt `clarification_needed`.

## Tabelle `organizations`

Zweck:

- Eigene CRM-Entität für Einrichtungen, Institutionen und Unternehmen hinter Versorgungskontakten.
- Grundlage für den Hauptbereich "Organisationen", Organisationsliste und Organisationsprofil.
- Sichtbar machen, dass mehrere Personen einer Organisation zugeordnet sein können.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `name` | Organisationsname, Pflichtfeld. |
| `normalized_name` | Normalisierter Vergleichswert für Suche, Migration und spätere Dublettenprüfung. |
| `sector` | Kanonischer Versorgungssektor gemäß Abschnitt „Fachmodell Versorgungssektoren“; die Organisation bleibt auch ohne zugeordneten Kontakt sichtbar. |
| `organization_type` | Optionaler Organisationstyp, z. B. Universitätsklinikum oder Pflegeeinrichtung. |
| `postal_code`, `city`, `federal_state` | Standortdaten. |
| `latitude`, `longitude` | Optionale Koordinaten für spätere Kartenintegration. |
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
- Pflege und Anzeige mehrerer Primärsysteme pro Organisation; verknüpfte Kontakte zeigen diese Information abgeleitet an.
- Vom Organisationsprofil aus können Kontakte geöffnet, zugeordnet oder neu für diese Organisation angelegt werden.

Migrationslogik:

- Die historische Provider-Migration `20260516_create_organizations.sql` führte `organizations` und `contacts.organization_id` ein. Die aktuelle, führende Definition steht in `deploy/postgres/pre-gematik/schema.sql`; die frühere Datei ist nur noch über die Git-Historie nachvollziehbar.
- Bestehende eindeutige `contacts.organization`-Freitextwerte werden getrimmt, mit zusammengefassten Leerzeichen normalisiert und als erste Organisationen angelegt.
- Unsichere Dubletten wie "UKB" und "Universitätsklinikum Bonn" werden nicht automatisch zusammengeführt.
- Danach werden Kontakte per normalisiertem Freitext auf die neue Organisation verlinkt.

Dürfen Nutzer bearbeiten:

- Viewer: lesen.
- Editor/Admin: Organisationen anlegen und bearbeiten, Kontakte zuordnen.
- Admin: später archivieren/zusammenführen; vollständige Dublettenpflege ist nicht Teil von Sprint 4.

## Tabelle `organization_primary_systems`

Zweck:

- Schlanke P0-Erfassung der in einer Organisation eingesetzten Primärsysteme.
- Mehrere Systeme je Organisation sind möglich.
- Kontakte erben die sichtbare Information über `organization_id`; sie wird nicht redundant am Kontakt gespeichert.

Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `organization_id` | Pflichtverweis auf `organizations.id`; beim Löschen der Organisation werden die Einträge mitgelöscht. |
| `system_type` | Kontrollierter Typ: `PVS`, `KIS`, `AVS`, `ZPVS`, `LIS`, `HVS`, `PFLEGE` oder `SONSTIGES`. |
| `vendor_name` | Optionaler Herstellername. |
| `product_name` | Optionaler Produktname. |
| `source_url` | Optionale öffentliche Quelle für die Angabe. |
| `created_at`, `updated_at` | Technische Zeitstempel. |
| `created_by`, `updated_by` | Technische Bearbeitungsnachweise. |

Bewusste Begrenzung:

- Kein `usage_status`.
- Keine fachliche Verifikation über `verified_at` oder `verified_by`.
- Keine TI-Anwendungen in dieser Tabelle.
- Keine Datenschutz- oder Einwilligungsdaten.

Rechte:

- Viewer lesen Einträge aktiver Organisationen.
- Editor/Admin dürfen Einträge aktiver Organisationen anlegen, bearbeiten und löschen.
- Die API-Autorisierung berücksichtigt den Status der zugehörigen Organisation.

## Tabelle `network_registrations`

Zweck:

- Datensparsame Staging-Tabelle für den HMAC-authentisierten
  TYPO3-/Powermail-Connector des Formulars UID `41`; die Repo-Konzeptdemo
  schreibt weiterhin keine Daten.
- Trennung ungeklärter Eingänge vom aktiven Kontakt- und Organisationsbestand.
- Strukturierte Erfassung der vorhandenen Formularfelder und der getrennten
  Nachweise für Datenschutzhinweis und optionale E-Mail-Kommunikation.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `submission_id` | Vom TYPO3-Listener einmal erzeugte UUIDv4 für idempotente Retries. |
| `source_system`, `source_form_uid`, `source_record_uid` | Eindeutige Referenz auf `typo3_powermail`, Formular UID `41` und den Powermail-Datensatz. |
| `source_payload_sha256` | Fingerprint des normalisierten Payloads zur Erkennung abweichender Wiederholungen. |
| `received_at`, `submitted_at` | Serverzeit des Intake und eingefrorener Powermail-Absendezeitpunkt. |
| `status`, `onboarding_stage` | Getrennter Prüf- und Zuordnungsstatus; Standard ist `neu`/`registered`. |
| `salutation`, `title`, `first_name`, `last_name`, `email` | Im Formular vorhandene Personendaten; nur E-Mail ist Pflicht. |
| `organization`, `sector`, `message` | Optionale Kontextangaben des Formulars. |
| `privacy_notice_version`, `privacy_notice_presented_at`, `form_version` | Versionierter Nachweis des angezeigten Formular- und Datenschutzhinweises. |
| `email_permission_status`, `email_permission_requested_at`, `consent_contact_version` | Optionale Kommunikationsanfrage; beim Intake ausschließlich `not_requested` oder `pending`. |
| `email_permission_confirmed_at`, `email_permission_evidence_ref` | Späterer DOI-Nachweis; `granted` ist ohne beide Werte durch einen Datenbank-Constraint unmöglich. |
| `retention_review_at` | Zeitpunkt, zu dem die weitere Aufbewahrung fachlich geprüft werden muss. |
| `contact_id`, `organization_id`, `processed_at`, `processed_by` | Nachvollziehbare Zuordnung nach der Admin-Prüfung. |

Sicherheitsmodell:

- Ausschließlich der exakte serverseitige Connector-Pfad schreibt in die
  Tabelle. Er prüft HMAC, Zeitfenster, Bodygröße, Feld-Allowlist, Quelle und
  alle Versionen vor der Transaktion.
- Die Cloud-SQL-Laufzeitrolle besitzt `SELECT` und `INSERT`, aber kein
  `UPDATE` oder `DELETE` auf der Intake-Tabelle. Der aktuelle API-Router bietet
  keine generische Lese- oder Bearbeitungsroute für Browser an.
- `submission_id` und die Kombination aus Quellsystem, Formular und
  Quelldatensatz sind jeweils eindeutig. Identische Retries erzeugen keine
  zweite Zeile; abweichende Wiederholungen enden mit Konflikt.
- Der vorhandene Powermail-Marker `datenschutzhinweis` ist kein
  Einwilligungsfeld des Payloads. Nur der neue optionale Marker
  `mitmachen_email_einwilligung` kann `pending` auslösen.
- Kontakte und Organisationen werden nicht direkt aus dem öffentlichen Formular heraus angelegt.

Bewusste Grenze:

- Das Schema kann einen späteren DOI-Nachweis sicher abbilden. Automatischer
  E-Mail-Versand und Bestätigungslink gehören nicht zu diesem Connector.
- Der Connector und seine getrennte Ingress-Strecke sind standardmäßig
  deaktiviert. Aktivierung erfordert die dokumentierte fachliche, rechtliche,
  sicherheitsbezogene und betriebliche Abnahme.

## Tabellen `stakeholder_types`, `stakeholder_organizations`, `stakeholder_people`

Zweck:

- Eigenständige Stakeholder-Bereiche wie KVen, Krankenkassen, Patientenverbände, Krankenhausgesellschaften und ärztliche Berufsverbände.
- `stakeholder_types` definiert den Bereich, `stakeholder_organizations` enthält die Organisationen, `stakeholder_people` enthält Personen und Rollen in diesen Bereichen.
- Mitgliederzahlen sind Datenpflegefelder an `stakeholder_organizations`, nicht automatisch berechnete UI-Werte.

Mitgliederzahlen:

| Feld | Bedeutung |
| --- | --- |
| `member_count` | Numerischer Wert für Mitglieder, Versicherte oder eine fachlich dokumentierte Ersatzgröße. |
| `member_count_source_url` | Quelle für den Wert. |
| `member_count_source_label` | Kurz lesbare Quellenangabe. |
| `member_count_updated_at` | Stand oder Erhebungsdatum des Werts. |
| `member_count_scope` | Einordnung, was genau gezählt wurde. |

Pflegeweg:

- Stakeholderdaten werden nicht mehr im Repository oder im GitHub-Pages-Artefakt ausgeliefert.
- Die geschützte Anwendung liest sie ausschließlich über die authentifizierte API aus `stakeholder_organizations`; historische Quellstände liegen zugriffsgeschützt in `private.protected_source_snapshots`.
- `logo_url` ist im geschützten Ziel entweder leer oder eine validierte logische Referenz `private://stakeholder-logos/<objektpfad>`. Externe HTTP(S)-URLs sind dort nicht zulässig; die API liefert Altwerte fail-closed nicht an den Browser aus.
- Ein Logo wird ausschließlich über `GET /api/stakeholder-logos/:id` aus dem privaten Bucket ausgeliefert. Objektpfad, Größe, MIME-Typ und Dateiinhalt werden serverseitig geprüft; der Browser erhält weder Bucket-Zugang noch eine dauerhafte GCS-URL.
- Sichtbare Korrekturen werden als geschützte Datenpflege oder kontrollierter Backfill vorgenommen.
- Eine automatische Aktualisierung öffentlicher Mitgliederzahlen ist ein separater Datenjob mit Quellenprüfung, Konfliktlogik und Live-Backfill. Sie ist kein Teil normaler UI-Fixes.

Die Politik-Unterseite ist kein zusätzlicher Tabellenbestand: Die aktuelle Besetzung des Gesundheitsausschusses wird serverseitig über den geschützten Leseendpunkt `/api/politics/health-committee` aus der festen offiziellen Bundestag-Quelle geladen, validiert und zeitlich begrenzt zwischengespeichert. Diese Mandatsdaten werden weder in `stakeholder_people` persistiert noch in das öffentliche Demo-Artefakt eingebettet.

## Tabelle `formats`

Zweck:

- Planungsobjekte für Roundtables, Fachgespräche, Workshops und Veranstaltungen.
- Ersetzt externe Excel-Einladungslisten durch CRM-verknüpfte Formate.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `title` | Titel des Formats, Pflichtfeld. |
| `format_type` | Typ, z. B. Roundtable, Fachgespräch, Workshop oder Veranstaltung. |
| `starts_at`, `ends_at` | Optionaler Zeitraum. |
| `location` | Ort, Raum oder Online-Hinweis. |
| `goal` | Thema oder Ziel der Runde. |
| `owner_id` | Verantwortliches Profil. |
| `status` | `Planung`, `Aktiv`, `Abgeschlossen` oder `Archiviert`. |
| `notes` | Interne Planungsnotiz. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

Kritische Regeln:

- `starts_at` und `ends_at` sind unabhängige Datum-Zeit-Werte; ein Ende vor dem Beginn ist unzulässig. Teiländerungen dürfen den jeweils anderen Wert nicht zurücksetzen.
- Die UUID aus dem API-`idempotencyKey` wird als stabile `id` verwendet. Identische Replays legen weder eine zweite Zeile noch ein zweites `format.created`-Ereignis an.
- Archivierung und Wiederherstellung sind explizite Admin-Fachvorgänge. Archivierte Formate bleiben bis zur Wiederherstellung unveränderlich.
- Schreibkonflikte werden gegen den vom Client gesendeten letzten `updated_at`-Stand geprüft.

## Tabelle `format_participants`

Zweck:

- Verknüpft bestehende Kontakte mit einem Format.
- Speichert nur Einladungs- und Planungsinformationen; Kontakt- und Organisationsdaten bleiben in `contacts` bzw. `organizations`.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `format_id` | Verweis auf `formats.id`, wird beim Löschen des Formats entfernt. |
| `contact_id` | Verweis auf `contacts.id`. |
| `invitation_status` | `Kandidat`, `Eingeladen`, `Zugesagt`, `Abgesagt`, `Keine Rückmeldung` oder `Teilgenommen`. |
| `participant_role` | Rolle im Format, z. B. Sprecherin, Teilnehmer, Moderation. |
| `notes` | Format-spezifische Teilnehmernotiz. |
| `invited_at`, `responded_at` | Erster Einladungs- und Reaktionszeitpunkt. |
| `participated_at`, `cancelled_at` | Erster Teilnahme- beziehungsweise Absagezeitpunkt. |
| `status_changed_at` | Zeitpunkt des letzten fachlichen Statuswechsels. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

Kritische Regeln:

- `format_id` und `contact_id` sind eindeutig kombiniert; ein Kontakt kann pro Format nur einmal auftauchen.
- Ein Batch schreibt alle Beziehungen oder keine; bestehende Dubletten erzeugen weder eine neue Beziehung noch ein fälschliches Formatereignis.
- `Kandidat` ist ohne #Mitmachen-Einwilligung zulässig. `Eingeladen`, `Zugesagt` und `Teilgenommen` setzen jeweils einen aktiven Kontakt mit `mitmachen_consent_status = granted` voraus; API und Datenbanktrigger erzwingen dieselbe Regel.
- Workflow-Trigger leiten Statuszeitpunkte ab und erzeugen `format.invitation.created`, `format.invitation.accepted`, `format.invitation.declined` sowie `format.participation.recorded` transaktional.
- Import-Neuanlagen speichern die angemeldete Person als `created_by` und `updated_by`. Tatsächliche Bestandsänderungen benötigen je Zeile den gelesenen `updated_at`-Stand, bewahren `created_by` und werden zusammen mit Neuanlagen atomar geschrieben; identische Dubletten bleiben ohne Schreibvorgang.
- Updates und Deletes prüfen den vom Client gelesenen `updated_at`-Stand.
- Viewer lesen Formate und Teilnehmer, Editor/Admin pflegen Teilnehmer und aktive Formatdaten; nur Admins archivieren, stellen wieder her oder löschen Formate.

## Tabelle `hospitation_slots`

Zweck:

- Interne Terminangebote für Hospitationen.
- Grundlage für direkte Buchungen durch Editor/Admin.
- Optionaler Bezug zu Kontakt oder Organisation, falls ein Slot bereits fachlich vorgeplant ist.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `contact_id` | Optionaler Verweis auf `contacts.id`. |
| `organization_id` | Optionaler Verweis auf `organizations.id`. |
| `starts_at`, `ends_at` | Zeitraum des angebotenen Termins; `starts_at` ist Pflicht. |
| `location` | Ort, Einrichtung, Raum oder Online-Hinweis. |
| `capacity` | Interne Kapazität, mindestens 1. |
| `owner_id` | Verantwortliches Profil. |
| `status` | `Frei`, `Reserviert`, `Gebucht`, `Abgesagt` oder `Archiviert`. |
| `notes` | Interne Terminnotiz. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

## Tabelle `hospitations`

Zweck:

- Eigenes CRM-Modell für Hospitationsanfragen, Buchungen, Durchführung und Dokumentation.
- Erfasst Versorgungskontakte und Organisationen, ohne Hospitationen als `formats`-Spezialfall zu behandeln.
- Sichtbar im Arbeitsbereich `Hospitationen` und in Kontakt-/Organisationsprofilen.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
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
| `documentation_summary` | Pflicht-Minimum für die Ergebnisnotiz nach Durchführung. |
| `documentation_outcome` | Auswertung, Ergebnis oder fachliche Einordnung. |
| `follow_up_note`, `follow_up_owner_id`, `follow_up_due_at` | Nachverfolgung offener Aufgaben. |
| `documented_at`, `documented_by` | Dokumentationszeitpunkt und dokumentierendes Profil. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Nachvollziehbarkeit. |

Qualitatives Dokumentationsmodell:

- Die strukturierte Auswertung liegt versioniert in `documentation_outcome` als `hospitation-documentation-v2`.
- Die zentrale Definition steht in `frontend/data/hospitation-model.js`.
- Alte Freitexte und `hospitation-documentation-v1` werden beim Laden migriert und bleiben sichtbar.
- Alte Einträge aus `hospitation_unmet_needs` werden als `impulses` gelesen und bei Bedarf weiter in die alte Tabelle gespiegelt.
- System-Tags wie `Hospitation` und `Versorgungskontakt` werden getrennt von Analyse-Tags behandelt.

Kernobjekte im v2-Payload:

| Objekt | Zweck |
| --- | --- |
| `observations[]` | Strukturierte Beobachtungen mit Situation, Beschreibung, Rollen, Prozessphase, Problemtyp, Auswirkung, Evidenzart, Relevanzscore, Nutzungsempfehlung, Workaround und nächstem Schritt. |
| `quotes[]` | Zitate mit Rolle, Kontext, Nutzungsfreigaben, Anonymisierung und Freigabestatus. |
| `mediaArtifacts[]` | Bilder oder Materialien mit Typ, Datei/URL, Sichtbarkeit von Personen oder personenbezogenen Daten, Redaktionsbedarf und Nutzungsfreigaben. |
| `impulses[]` | Verdichtete Hinweise mit Klassifikation, Problemstatement, Nutzen, Dringlichkeit, Workaround, nächstem Schritt und Status. |

Codebook-Werte:

| Feld | Werte |
| --- | --- |
| `processPhase` | `Anmeldung / Aufnahme`, `Identifikation`, `Behandlung / Beratung`, `Verordnung`, `Überweisung`, `Befund / Dokumentation`, `Kommunikation mit Patient:innen`, `Kommunikation mit anderen Einrichtungen`, `Nachbereitung`, `Sonstiges`. |
| `problemType` | `Medienbruch`, `fehlende Information`, `doppelte Dokumentation`, `Rückfrage`, `Wartezeit`, `Workaround`, `Systemverständnis`, `Rollenunklarheit`, `technisches Problem`, `positives Muster / Best Practice`, `offene Frage`. |
| `impact` | `Zeitaufwand`, `Fehleranfälligkeit`, `Frust / Belastung`, `Informationsverlust`, `Patient:innen müssen selbst vermitteln`, `Prozessverzögerung`, `Sicherheitsgefühl sinkt`, `Arbeitsfluss wird unterbrochen`, `Ablauf funktioniert gut`. |
| `usageRecommendation` | `Wissen teilen`, `weiter validieren`, `Produkt prüfen`, `Technik prüfen`, `Prozess prüfen`, `Roadmap prüfen`, `kein weiterer Schritt`. |
| `evidenceType` | `directly_observed`, `reported`, `interpreted`. |
| `impulse.classification` | `knowledge`, `product_question`, `technical_question`, `process_question`, `roadmap_signal`, `validation_needed`. |
| `impulse.status` | `draft`, `to_review`, `accepted`, `rejected`, `closed`. |

Kritische Regeln:

- Viewer lesen aktive Hospitationen und Slots.
- Editor/Admin können Hospitationen anfragen, buchen, durchführen und dokumentieren.
- Archivierte Hospitationen und Slots bleiben Admins vorbehalten.

## Tabelle `hospitation_observations`

Zweck:

- Kanonische, global such- und auswertbare Beobachtungsobjekte aus Hospitationsfragebogen und -dokumentation.
- Bewahrt den eindeutigen Bezug zur Ursprungshospitation; Owner werden nicht dupliziert, sondern aus der Hospitation geerbt.
- Trennt die deskriptive Feldnotiz (`situation`, `description`) von der analytischen Codierung (`process_phase`, `problem_type`, `impact`).

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Stabile Text-ID aus dem v2-Dokumentationsobjekt; erhält Verknüpfungen zu Zitaten und Medien. |
| `hospitation_id` | Pflichtverweis auf die Ursprungshospitation. |
| `sequence`, `title`, `situation`, `description` | Reihenfolge und deskriptive Beobachtung. |
| `process_phase`, `problem_type`, `impact`, `observation_type` | Vergleichbare qualitative Codes aus dem zentralen Codebook. |
| `evidence_type` | `directly_observed`, `reported` oder `interpreted`. |
| `relevance_score`, `usage_recommendation` | Fachliche Einordnung und nächste Nutzung. |
| `involved_roles`, `affected_products`, `topics` | Mehrfachwerte für Filter und fallübergreifende Analyse. |
| `payload` | Vollständiges v2-Objekt einschließlich seltener Ablauf-, Quellen-, Freigabe- und Verknüpfungsfelder. |
| `status`, `archived_at`, `archived_by` | Reversible Archivierung statt fachlichem Hard Delete. |
| `created_*`, `updated_*` | Erfassungs- und Änderungsnachweis. |

Persistenzregeln:

- Die Tabelle ist die kanonische Quelle. `documentation_outcome` bleibt für die übrigen v2-Teilobjekte und als rückwärtskompatibles Transportformat bestehen.
- Beim Laden werden Tabellenzeilen wieder als `observations[]` in das Runtime-Hospitationsmodell eingesetzt.
- Speichern im Fragebogen synchronisiert per stabiler ID; aus dem Quellformular entfernte Beobachtungen werden archiviert.
- Direkte Änderungen aus der globalen Workbench verwenden `updated_at` als optimistische Versionsprüfung.
- `hospitation_observation_changes` protokolliert Erstellen, Ändern, Archivieren und Wiederherstellen mit Vorher-/Nachher-Zustand.
- Fallübergreifende Häufigkeiten sind Wiederholungshinweise. Eine automatische Einstufung als Muster, Hypothese oder Evidenz findet nicht statt.

## Tabelle `changes`

Zweck:

- Änderungsverlauf je Kontakt.
- Nachvollziehbarkeit von Erstellen, Bearbeiten, Archivieren und Importen.
- Technischer Audit- und Recovery-Verlauf; keine fachliche Aktivitäten-Timeline.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Fortlaufende ID. |
| `contact_id` | Verweis auf `contacts.id`. |
| `action` | `create`, `update`, `archive` oder `import`. |
| `field_name` | Geändertes Feld, falls feldbezogen. |
| `old_value` | Alter Wert als Text. |
| `new_value` | Neuer Wert als Text. |
| `changed_at` | Zeitpunkt der Änderung. |
| `changed_by` | Verweis auf `profiles.id`. |
| `activity_event_id` | Optionaler Verweis auf das kanonische fachliche Ereignis desselben Kontakts. |
| `canonicalized_at` | Zeitpunkt, zu dem die Legacy-Zeile mit dem kanonischen Ereignis verknüpft wurde. |

UI-Nutzung:

- Änderungsverlauf im Kontakt-Detailprofil.
- Importereignisse werden als Historieneinträge sichtbar.
- Recovery einzelner falscher Bearbeitungen.

Kritische Felder:

- `contact_id`, `action`, `field_name`, `old_value`, `new_value`, `changed_by`.
- Ohne sauberen Verlauf ist Recovery deutlich schwieriger.

Automatisch gesetzt:

- `id` als Identity.
- `changed_at` per Default.
- App/Skripte schreiben Logeinträge nach Create, Update, Archive und Import.

Dürfen Nutzer bearbeiten:

- Die App fügt Einträge für Editor/Admin hinzu.
- Einträge sollten nicht manuell geändert oder gelöscht werden.

Abgrenzung zu `activity_events`:

- `changes` bleibt die feldnahe Quelle für Audit und Recovery eines Kontakts.
- Ein fachlicher Vorgang kann mehrere `changes`-Zeilen erzeugen, erscheint aber als ein verständliches Ereignis in `activity_events`.
- Neue Aktivitäten dürfen deshalb nicht allein aus einem einzelnen geänderten Feld abgeleitet werden; der jeweilige Schreibvorgang erzeugt zusätzlich einen stabilen fachlichen Ereignisschlüssel.
- `activity_event_id` und `canonicalized_at` sind entweder gemeinsam gesetzt oder gemeinsam leer. Die zusammengesetzte Fremdschlüsselbeziehung erzwingt, dass `changes.contact_id` und `activity_events.contact_id` übereinstimmen.

## Tabelle `activity_events`

Zweck:

- Append-only-Ereignisstrom für die globale Aktivitäten-Seite und den Aktivitäten-Reiter eines Kontakts.
- Fachlich konkrete Ereignisse wie `contact.created`, `hospitation.created` oder `format.invitation.created` statt eines allgemeinen Typs "Update".
- Getrennte Speicherung von fachlicher Kategorie und technischer Herkunft, damit beispielsweise eine importierte Kontaktanlage fachlich `master_data` und technisch `data_import` bleibt.
- Kontrollierte Übernahme historischer Ereignisse mit idempotenter Legacy-Referenz und eindeutig gekennzeichnetem Fallback `unknown`.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | Fortlaufende `bigint`-Identity und Primärschlüssel. |
| `event_key` | Stabiler, punktgetrennter Ereignisschlüssel, zum Beispiel `contact.created`. Nicht eindeutig, weil derselbe Typ beliebig oft auftreten darf. |
| `category` | Fachbereich: `master_data`, `ownership`, `consent`, `hospitation`, `format`, `note_document` oder `unknown`. Die UI bezeichnet `consent` als „Einwilligung & Nutzung“, weil dort auch die Profilführungsgrundlage dokumentiert wird. |
| `action` | Maschinenlesbare Aktion innerhalb des Ereignisses, zum Beispiel `created`, `updated` oder `archived`. |
| `entity_type`, `entity_id` | Primär betroffenes Objekt. IDs bleiben als Text gespeichert, weil die Fachobjekte unterschiedliche Schlüsseltypen verwenden. |
| `contact_id` | Optionaler direkter Kontaktbezug für den Kontaktverlauf. Bei `entity_type = contact` ist er verpflichtend und muss `entity_id` entsprechen. Jeder Kontaktverweis in `references` muss exakt dieselbe ID tragen. |
| `actor_id` | Optionaler Akteur aus `profiles`; wird beim Löschen des Profils auf `null` gesetzt. Der interne Server-Writer setzt ihn aus der authentifizierten Session. |
| `occurred_at` | Fachlicher Ereigniszeitpunkt; kann bei einer Legacy-Übernahme vor `created_at` liegen. |
| `origin_type` | Technische Herkunft: `manual`, `data_import`, `public_registration`, `system` oder `legacy`. |
| `origin_ref` | Optionale Referenz auf Importlauf, Registrierung, Systemprozess oder andere Herkunft. |
| `correlation_id` | Optionale Klammer für mehrere Ereignisse desselben fachlichen Vorgangs. |
| `references` | JSON-Array mit weiteren betroffenen Objekten, beispielsweise Format und Hospitation. |
| `changes` | JSON-Objekt mit optionalen, für die Aktivitätsanzeige relevanten Vorher-/Nachher-Werten. |
| `metadata` | JSON-Objekt für zusätzlichen nicht normierten Kontext; keine vertraulichen Inhalte ohne fachliche Freigabe. |
| `legacy_source`, `legacy_id` | Gepaarte Referenz auf einen historischen Quelldatensatz. Beide Werte sind gemeinsam gesetzt oder gemeinsam `null`; das Paar ist eindeutig. |
| `created_at` | Zeitpunkt, zu dem das Ereignis im Kompass gespeichert wurde. |

JSON-Verträge:

- `references` ist immer ein Array aus kompakten Objektverweisen, zum Beispiel `[{"type":"format","id":"...","label":"Roundtable Primärversorgung"}]`.
- `changes` ist immer ein Objekt. Empfohlene Form: `{"owner_id":{"before":"...","after":"..."}}`.
- `metadata` ist immer ein Objekt. Produzenten dürfen hier nur ergänzenden Kontext speichern, der nicht bereits als kanonisches Feld vorhanden ist.

Indizes und Idempotenz:

- Globale Timeline: `occurred_at desc`.
- Kategorieansicht: `category, occurred_at desc`.
- Partielle Kontakt- und Akteurindizes für vorhandene Referenzen.
- Zusammengesetzter Objektindex auf `entity_type`, `entity_id` und `occurred_at`.
- Partieller Unique-Index auf `legacy_source`, `legacy_id` verhindert eine doppelte Übernahme derselben historischen Zeile.

Zugriffs- und Schreibmodell:

- Admins dürfen alle Ereignisse lesen. Viewer und Editoren sehen nur Ereignisse ohne Kontaktbezug oder Ereignisse aktiver Kontakte; Aktivitäten archivierter Kontakte bleiben verborgen.
- Für EHC-only-Kontakte gilt dieselbe nicht identifizierende Zugriffsprojektion auch im globalen Verlauf und im Kontaktverlauf. Nicht autorisierte Nutzer dürfen insbesondere weder Kontaktstammdaten noch Werte aus Profilführungs- oder Einwilligungsnachweisen über Aktivitätsfelder erhalten.
- Browser-Clients besitzen keine Datenbankrechte und greifen ausschließlich über die geschützte API zu. Diese bietet keinen generischen Activity-Writer und keine Update- oder Delete-Route für Ereignisse an.
- Neue Ereignisse schreibt ausschließlich der serverinterne Writer innerhalb eines bereits autorisierten Fachvorgangs. Datenbank-Credentials werden nie an das Frontend ausgeliefert.
- Die `NOLOGIN`-Laufzeitrolle besitzt für `activity_events` nur `SELECT`, `INSERT` und die erforderlichen Sequenzrechte. `UPDATE` und `DELETE` bleiben gesperrt, damit das Ledger append-only ist.
- Fachliche Mutationen schreiben Domainänderung, Audit-Zeilen, kanonisches Ereignis und die Verknüpfung der Audit-Zeilen in einer Transaktion. `actor_id`, Objekt- und Kontaktbezug stammen aus dem validierten Servervorgang, nicht aus frei formulierbaren Browserdaten.

Trennung von `activity_events.changes` und `public.changes`:

- `activity_events.changes` ist optionaler Darstellungskontext innerhalb genau eines fachlichen Ereignisses. Es muss nicht jede technische Feldmutation enthalten und ist keine vollständige Versionierung.
- `public.changes` bleibt die feinere Audit-/Recovery-Historie des Kontakts und kann mehrere Zeilen für denselben Vorgang enthalten.
- Die globale Aktivitäten-Seite liest während der Migration beide Quellen. Verknüpfte `changes`-Zeilen werden anhand der monotonen Event-ID ausgeblendet, sobald das zugehörige kanonische Ereignis zum Snapshot gehört. Dadurch bleibt ein bereits laufender Cursor stabil, ohne von synchronen Uhren abzuhängen.
- Wiederherstellungsfunktionen dürfen weiterhin `public.changes` verwenden.

## Tabelle `saved_views`

Zweck:

- Gespeicherte Ansichten/Sichten für Kontakte, Organisationen, Karte und Auswertung.
- Private Sichten und Team-Sichten.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `id` | UUID, Primärschlüssel. |
| `owner_id` | Besitzerprofil. |
| `name`, `description` | Name und Beschreibung. |
| `scope` | `private` oder `team`. |
| `view_type` | `contacts`, `organizations`, `formats`, `hospitations`, `map` oder `analytics`. |
| `filters` | Filter als JSON. |
| `search_query` | Suchtext. |
| `sort_key`, `sort_direction` | Sortierung. |
| `page_size` | Tabellenlänge. |
| `is_default` | Standardsicht. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Gespeicherte Ansichten werden außerhalb des Filterpanels geführt, z. B. im kompakten Ansichts-Dropdown `Ansicht: Alle Kontakte` oder im Einstellungsbereich.
- Eine gespeicherte Ansicht kann Suche, Filter, Sortierung, Seitengröße und später sichtbare Spalten enthalten.
- Das Filterpanel setzt nur aktuelle Filter; es verwaltet keine gespeicherten Ansichten.

Kritische Felder:

- `scope`: Team-Sichten sind für alle sichtbar.
- `filters`: bestimmt die fachliche Sicht.
- `owner_id`: steuert private Sichtbarkeit.

Automatisch gesetzt:

- `id`, `created_at`, `updated_at`.
- `updated_at` per Trigger.

Dürfen Nutzer bearbeiten:

- Nutzer können eigene Sichten verwalten.
- Admins können Team-Sichten verwalten.

## Tabelle `user_settings`

Zweck:

- Persönliche Einstellungen pro Nutzer.

Wichtigste Felder:

| Feld | Bedeutung |
| --- | --- |
| `user_id` | Verweis auf `profiles.id`, Primärschlüssel. |
| `default_view_id` | Optionale Standardsicht. |
| `default_view_type` | `contacts`, `organizations`, `formats`, `hospitations`, `map` oder `analytics`. |
| `table_density` | `compact`, `comfortable`, `spacious`. |
| `theme` | `system`, `light`, `contrast`. |
| `font_scale` | Schriftgröße zwischen 0.9 und 1.2. |
| `page_size` | Standard-Tabellenlänge. |
| `preferences` | Weitere Einstellungen als JSON. |
| `created_at`, `updated_at` | Zeitstempel. |

UI-Nutzung:

- Tabellen- und Ansichtseinstellungen.
- Default-Sicht.
- Sprint 8 nutzt `preferences.defaultContactTab` und `preferences.notificationsEnabled` als einfache Vorbereitung.

Kritische Felder:

- `user_id`: Nutzer darf nur eigene Einstellungen lesen/schreiben.
- `default_view_id`: kann auf gelöschte/veränderte Sichten zeigen, wird bei gelöschter Sicht auf `null` gesetzt.

Hinweis:

- `default_view_type` erlaubt `contacts`, `organizations`, `formats`, `hospitations`, `map` und `analytics`.
- `table_density = compact` reduziert die Tabellenhöhe.
- Benachrichtigungen sind nur als boolean `notificationsEnabled` vorbereitet; es gibt noch kein Notification-Center, keinen E-Mail-Versand und keine Push-Logik.

Automatisch gesetzt:

- `created_at`, `updated_at`.
- `updated_at` per Trigger.

Dürfen Nutzer bearbeiten:

- Jeder angemeldete Nutzer nur die eigenen Einstellungen.

## Historisch stillgelegter Alias-Login

Das frühere Provider-Modell enthielt `login_aliases` und eine Edge Function für die Anmeldung mit Kurzkennung. Beides ist weder Teil des aktuellen PostgreSQL-Schemas noch des Laufzeitvertrags. Die Anmeldung erfolgt ausschließlich über die freigegebene OIDC-/IAP-Identität; `identity_bindings` ordnet deren verifiziertes Paar aus Issuer und Subject einem internen Profil zu. Es gibt keinen Alias-, Passwort- oder Provider-Fallback im Repository.

## Ausgewählte Funktionen

| Objekt | Zweck |
| --- | --- |
| `public.pre_gematik_touch_updated_at()` | Aktualisiert `updated_at` bei Änderungen in PostgreSQL. |
| `public.pre_gematik_prepare_contact_purpose_write()` | Validiert und ergänzt zweckbezogene Kontaktänderungen serverseitig. |
| `public.pre_gematik_log_contact_purpose_change()` | Schreibt den zugehörigen Auditnachweis transaktional. |

## GCS-Objektpfad `profile-images`

Zweck:

- Ablage privater Profilbilder im konfigurierten GCS-Bucket.
- Objektpfad: `profile-images/<profile-id>/avatar-<uuid>.<jpg|png|webp>`.
- Der Objektpfad wird serverseitig an die stabile Profil-ID gebunden.
- Erlaubte Typen: `image/jpeg`, `image/png`, `image/webp`.
- Größenlimit: 5 MB.

Zugriffshinweise:

- Der Bucket ist privat, nutzt Uniform Bucket-Level Access und Public Access Prevention; es gibt keine anonyme Leseberechtigung.
- Lesen, Upload, Ersetzen und Löschen erfolgen ausschließlich autorisiert über die geschützte API und deren Workload-Identität.
- In PostgreSQL wird eine `gs://`-Referenz gespeichert. Der Browser erhält weder Bucket-Rechte noch eine dauerhafte öffentliche Objekt-URL.

## Storage `stakeholder-logos`

- Der Zielbucket ist privat, verwendet Uniform Bucket-Level Access, Public Access Prevention und Versionierung.
- Der kanonische Datenbankwert ist `private://stakeholder-logos/<objektpfad>`; externe Logo-URLs sind im geschützten Zielvertrag ausgeschlossen.
- Nur der API-Workload besitzt Objekt-Leserechte. Frontend, GitHub-Pages-Demo und Deployment-Identität erhalten keinen Zugriff auf Logo-Inhalte.
- Die API akzeptiert ausschließlich den freigegebenen Bildvertrag und liefert SVG mit restriktiver Content Security Policy aus. Unsichere, strukturell ungültige oder übergroße Quelldateien werden vor einer Migration quarantänisiert und nicht still übernommen.

## API- und Datenbankrechte

- Der Browser greift ausschließlich über `/api/...` zu und besitzt keine Datenbank- oder Bucket-Credentials.
- Die API erzwingt die vollständige Route-, Rollen-, Ownership- und Archivmatrix serverseitig; Viewer dürfen nicht schreiben.
- Die feste PostgreSQL-`NOLOGIN`-Laufzeitrolle erhält nur die in `deploy/postgres/pre-gematik/grants.sql` definierten Objekt- und Funktionsrechte. `PUBLIC` besitzt kein Erstellungsrecht im Anwendungsschema.
- Administrative Rollen und kurzlebige Operatorzugänge bleiben vom Laufzeitkonto getrennt und werden nie an das Frontend ausgeliefert.
- Editor und Admin dürfen nur die im API-Policy-Manifest freigegebenen Mutationen ausführen; administrative Prozesse bleiben zusätzlich geschützt.
- `activity_events` bleibt append-only: Die Laufzeitrolle besitzt `SELECT` und `INSERT`, aber kein `UPDATE` oder `DELETE`.

## Kontaktanlage Sprint E

Die Kontaktanlage verwendet weiterhin `contacts`; es gibt keine neue Datenquelle und kein neues Bulk-Datenmodell.

- Einzelkontakt und Online-Tabelle schreiben über `window.dataService.createContact()` und die geschützte `/api/contacts`-Route nach PostgreSQL.
- Pflichtfeld in der UI ist `name`.
- Defaults: `priority = Mittel`, `status = active`, `owner_id` wird gesetzt, wenn ein Profil ausgewählt ist; sonst bleibt Owner leer.
- Online-Tabelle validiert je Zeile: fehlender Name, ungültige E-Mail, grob ungültige Telefonnummer und unbekannter Sektor sind Fehler.
- Online-Tabelle warnt bei fehlender Organisation, fehlendem Ort/Bundesland, fehlendem Owner, fehlender Fachrichtung, möglicher Dublette und fehlendem Kontaktweg.
- Dublettenprüfung ist nur eine UI-Warnung gegen den aktuell geladenen Kontaktbestand; sie ersetzt keine eindeutigen Datenbank-Constraints.
- Dateiimport bleibt CSV/Excel plus Mapping; Online-Tabelle ist manuelle tabellarische Anlage ohne Datei-Upload und ohne Importprofil.

## Hinweise für spätere Features

- Organisationen sind seit Sprint 4 eigene Datensätze. Eine spätere Ausbaustufe kann Mehrfachzuordnungen über `contact_organizations` und Dubletten-Zusammenführung ergänzen.
- Neue fachliche Aktivitäten werden in `activity_events` geschrieben; `changes` bleibt Audit/Recovery und darf nicht zur primären Aktivitäten-Timeline werden.
- Importhistorie könnte später eine eigene Tabelle bekommen; aktuell helfen `changes.action = 'import'`, Importberichte und Batch-Hinweise.
- Themen sind aktuell `contacts.topics`; bei wachsender Taxonomie können `topics` und `contact_topics` sinnvoll werden.
