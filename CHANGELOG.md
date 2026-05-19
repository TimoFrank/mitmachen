# Changelog

Rueckwirkende, kompakte Zusammenfassung der wichtigsten Produktversionen des Versorgungs-Kompass.

## Version 0.5.0 - Kontaktrollen und Karten-Datenbasis

Stand: 2026-05-19

### Neu

- Kontakte haben jetzt ein eigenes Feld `Rolle`, z. B. fuer Funktion, Beruf oder Stelle.
- Die Rolle ist von Sektor und Fachrichtung getrennt und erscheint in Kontaktprofilen sowie in Karten-Detailansichten.

### Geaendert

- Notizen werden in Hauptapp und Karte konsistenter angezeigt.
- Owner-Aenderungen erscheinen in der Kontakthistorie mit klareren Texten wie `Owner hinzugefuegt`, `Owner entfernt` oder `Owner gewechselt`.
- Die Kartenansicht nutzt als Grundlage alle nicht archivierten Kontakte, unabhaengig von aktiven Filtern in der Kontaktliste.

### Technisch

- Supabase wurde um die Spalte `contacts.role` erweitert.
- Der Data-Service funktioniert uebergangsweise auch dann weiter, wenn eine Datenbank diese neue Spalte noch nicht besitzt.

## Version 0.4.0 - Reifer Kartenmodus

Stand: 2026-05-18

### Neu

- Der Kartenmodus ist als eigener Orientierungs- und Analysebereich ausgebaut.
- Kartenfilter koennen mit live eingebetteten Kontaktdaten arbeiten.
- Die Kontaktliste in der Karte ist einklappbar.
- Clustering kann optional aktiviert oder deaktiviert werden.
- Bundeslandnamen und Verteilungsinformationen werden direkt in der Karte angezeigt.

### Geaendert

- Kartensuche, Filter und Kartenmodi sind klarer voneinander getrennt.
- Karten-Detailansichten folgen dem gleichen ruhigen CRM-Profilmuster wie die Hauptapp.
- Die Karte bleibt stabiler, wenn ein Kontakt aus der Liste ausgewaehlt wird.
- Zoomverhalten, Basiskarte, Nachbar-Kontext und Hover-Tooltips wurden beruhigt.
- Missverstaendliche Kontextlabels und Flaechentoenungen wurden entfernt.

### Verbessert

- Mobile Kartenbedienung, Kontaktvorschau und Profil-Sheet wurden verbessert.
- Listen- und Kartenfilter sind besser synchronisiert.
- Verteilungslabels und Bundeslandflaechen sind leichter lesbar.
- Veroeffentlichte Kartenpfade fuer GitHub Pages wurden korrigiert.

## Version 0.3.0 - CRM-App mit Supabase, Profilen und Teamfunktionen

Stand: 2026-05-17

### Neu

- Supabase ist als produktive Datenbasis angebunden.
- Anmeldung per Supabase, Login-Aliase und Passwort-Setup wurden eingefuehrt.
- Nutzerprofil, Teamansicht und Teamgruppierung sind als eigene App-Bereiche verfuegbar.
- Organisationen haben einen eigenen CRM-Bereich mit Profilansicht.
- Kontakte koennen archiviert und wiederhergestellt werden.
- Kontakthistorie zeigt wichtige Aenderungen am Datensatz.
- Gespeicherte Ansichten, Datenqualitaets-Pflegebereich und Bulk-Import-Tabelle wurden angelegt.
- Home-Screen-App-Icons und Manifest-Unterstuetzung wurden vorbereitet.

### Geaendert

- Die App-Shell wurde staerker nach CRM-Arbeitsbereichen strukturiert.
- Die Sidebar ist die zentrale Navigation; Profil, Team, Importe und Einstellungen sind fachlich getrennt.
- Kontaktlisten, Tabellenworkflows, Filter-Command-Bar und Master-Detail-Layout wurden verdichtet.
- Kontaktprofile wurden auf Lesemodus, klare Detailsektionen und ruhige Profilkoepfe umgestellt.
- Owner-Auswahl nutzt Profile-IDs; alte Owner ohne Account werden sichtbar markiert.
- Team- und Rollenbadges wurden optisch reduziert.
- Login-Texte und mobile Sidebar-Elemente wurden gestrafft.

### Verbessert

- Mobile Layouts fuer Listen, Filter, Pagination, Sidebar, Teamansicht und Avatare wurden stabilisiert.
- Veraltete lokale Auth-Sessions werden robuster behandelt.
- Admin-, Rollen- und Berechtigungshinweise sind dezenter.
- Das Designsystem wurde konsolidiert und sichtbare Sondervarianten wurden reduziert.

### Sicherheit und Betrieb

- Oeffentliche Seed-Daten mit echten Kontaktinformationen wurden aus dem produktiven GitHub-Pages-Pfad entfernt.
- Betrieb, Backups, Rollen, RLS, Onboarding und Sicherheitschecks wurden dokumentiert.
- Service-Role-Keys duerfen nicht in Frontend-Dateien abgelegt werden.

## Version 0.2.0 - CRM-Grundfunktionen und Mobile-Unterstuetzung

Stand: 2026-05-14

### Neu

- Eine responsive Mobile-Erfahrung fuer den Versorgungs-Kompass wurde eingefuehrt.
- Eine wiederverwendbare Custom-Select-Komponente wurde angelegt.
- Fachrichtung, Owner, Prioritaet, Standort und Kommunikationswarnungen wurden in die Kontaktpflege integriert.
- Tabellen-Pagination und ein Account-Menue wurden ergaenzt.

### Geaendert

- Navigation und Filterworkflow wurden vereinfacht.
- Kontakt-Detailansichten wurden in Richtung CRM-Profil weiterentwickelt.
- Prioritaet und zentrale Kontaktinformationen wurden staerker in die Detailansicht verlagert.
- Logout wurde in den Nutzerkontext verschoben.

### Verbessert

- Tabellenlayout, Detailaktionen, Filter-Popover und Karten-Sidebar wurden stabilisiert.
- Datenqualitaet bei Fachrichtungen und Organisationen wurde verbessert.
- Mobile Darstellung, Abstaende und Kontaktlisten-Bedienung wurden nachgeschaerft.

## Version 0.1.0 - Erste nutzbare Basis

Stand: 2026-05-08

### Neu

- Versorgungs-Kompass als statische HTML-/JS-App fuer das gematik-Hospitationsnetzwerk angelegt.
- Erste Kontakt-, Karten- und Datenbasis fuer lokale Entwicklung vorbereitet.
- Projektstruktur fuer App, Login, Karte, Daten, Public Assets, Scripts und `docs/`-Publish-Spiegel aufgebaut.
- GitHub-Pages-Publish-Ordner vorbereitet.
