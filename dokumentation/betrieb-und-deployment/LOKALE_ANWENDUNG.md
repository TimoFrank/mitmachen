# Versorgungs-Kompass auf dem Mac

Die lokale Anwendung verwendet die Originaloberfläche und Fach-API mit einer
eigenen PostgreSQL-Datenbank. Der beidseitige Abgleich ergänzt den Google-Betrieb.
Er ist erst eingerichtet, wenn das neue Paket installiert, mit dem eigenen
Google-Konto verbunden und die erste vollständige Übernahme geprüft wurde.
Ein erfolgreicher Code-Test allein belegt keine installierte Verbindung.

## Bedienung und Konflikte

- `Versorgungs-Kompass Lokal.app` öffnet die Anwendung im Browser und startet
  bei Bedarf Docker. Sie startet nach der Einrichtung auch bei der Mac-Anmeldung.
- Unter **Abgleich öffnen** wird der Mac einmal mit dem eigenen, freigeschalteten
  Administratorkonto in der Live-Anwendung verbunden. Im Online-Profil führt
  **Verbundene Macs verwalten** zur Verbindung und zum Trennen einzelner Geräte.
- Der Abgleich läuft beim Start, beim Öffnen und alle 30 Minuten, solange die
  Anwendung läuft und der Mac wach ist. **Jetzt abgleichen** startet ihn manuell.
- Ohne Internet bleiben Lesen, Vorführen und Bearbeiten möglich. Änderungen
  werden dauerhaft lokal vorgemerkt und später in ihrer Reihenfolge übertragen.
- Bei verschiedenen Änderungen am selben Eintrag stoppt die Übertragung.
  Beide Fassungen sind nebeneinander sichtbar. Der Nutzer entscheidet zwischen
  lokaler Änderung und Online-Fassung; beide Fassungen und die Entscheidung
  bleiben im lokalen Protokoll. **Gesicherte Fassungen anzeigen** macht die
  letzten 100 Entscheidungen mit ihren Texten wieder lesbar.
- Fachlich nicht mehr gültige Änderungen werden mit der vorhandenen
  Validierung abgewiesen. Ihr Inhalt bleibt gesichert und kann nach Klärung
  erneut erfasst werden; es gibt keine Umgehung von Geschäftsregeln.
- Ein Hintergrundabgleich überschreibt keine offenen Formulare. Bei einem
  neuen Datenstand fordert der Lokalhinweis zum Sichern der Eingaben und
  Neuladen auf. Ein veralteter Schreibversuch wird abgewiesen.
- `Versorgungs-Kompass Lokal beenden.app` sichert die lokale Datenbank und
  beendet nur die Dienste der zugeordneten Installation. Browser schließen
  beendet die Hintergrunddienste nicht.

Eine Verbindung gilt höchstens 30 Tage und niemals länger als die bestehende
Freigabe der Online-Umgebung. Ein gesperrtes Konto, entzogene Identitätszuordnung,
globaler Widerruf der Google-Kontoberechtigung oder getrenntes Gerät kann nicht weiter abgleichen.
Bereits lokal gespeicherte Daten bleiben auf dem autorisierten Mac verfügbar.
Der Abgleich verlängert keine Zugangsfreigabe und ersetzt keine verwaltete
Sicherung der Online-Datenbank.

## Umfang und verbleibende Unterschiede

Texte, Kontakte, Organisationen, Formate mit Teilnehmenden, Hospitationen,
Beobachtungen, Kodierungen, Einstellungen und Dokumentexporte verwenden die
vorhandene Fachlogik. Private Profilbilder, Kontaktbilder, Logos und Anhänge
werden über die autorisierte Datei-Schnittstelle gelesen und lokal gehalten.
Ihre älteren Fassungen bleiben wiederherstellbar. Neue Datei- und Bild-Uploads
bleiben entsprechend der Produktentscheidung deaktiviert.

Online-Anmeldung, Nutzerverwaltung und externe Integrationen sind lokal
nicht verfügbar. Karten nutzen lokale Geometrien ohne externe Straßenkacheln.
Gesicherte externe Bilder bleiben vorhanden; weitere externe Bilder und
Webseiten werden nicht automatisch gespiegelt. Quellenlinks benötigen beim
bewussten Öffnen Internet. Das öffentliche Politikverzeichnis stammt aus der
mitgelieferten Ausgangskopie und zeigt deren Quellenstand.

## Schutz der Daten

Die Installation liegt außerhalb von Cloud-Synchronisationsordnern unter
`~/Library/Application Support/`. Jeder neue Installationsordner besitzt einen
eigenen Docker-Projektnamen. PostgreSQL und die lokale Fach-API haben keine
öffentlichen Ports. Nur der lokale Gateway ist an `127.0.0.1` gebunden.
Zufälliger Öffnungsschlüssel, HttpOnly-Sitzung, exakte Host-/Origin-Prüfung und
begrenzte Dateipfade schützen diesen Zugang. Identitätsheader aus dem Browser
werden nicht übernommen. Cloud-Administrator-, Datenbank- und Google-Schlüssel
werden nicht auf die lokale Installation übertragen.

Der Gateway erhält einen zufälligen Geräteschlüssel in seiner privaten lokalen
Datenbank. Online liegt nur dessen Hash. Jede Anfrage prüft Google-Konto,
Identitätsbindung, Profilrolle und Freigabezeit erneut. Eine explizite Liste
begrenzt die erlaubten Schreiboperationen. Sie laufen durch dieselbe Fach-API
und Berechtigungsprüfung wie normale Online-Änderungen.

Jede lokale Änderung enthält die vorherige und nachherige Fassung ihrer
betroffenen Datensätze. Online werden Vergleich, Änderung und Quittung in
einer kurzen Transaktion ausgeführt. Ein Verbindungsabbruch nach dem Speichern
führt beim Wiederholen nicht zu doppelten Einträgen. Neu hinzugekommene
abhängige Datensätze werden vor einer Löschung ebenfalls erkannt.

Der vollständige Datenabruf umfasst die 30 ausdrücklich freigegebenen
Geschäftstabellen. Anmeldedaten und Identitätsbindungen sind ausgeschlossen.
Eine lokale Übernahme erfolgt erst ohne offene Änderungen. Sämtliche Tabellen,
Werte und Fremdschlüssel werden in einer Transaktion geprüft. Ein Fehler lässt
den bisherigen lokalen Stand erhalten. Frühere Zustände liegen geschützt in
`local_app.sync_history`; `source-snapshot/` enthält die unveränderte
Ausgangskopie und `backups/` die lokalen Datenbanksicherungen. Diese Inhalte
gehören niemals in Git, Pages oder öffentliche Artefakte.

## Installation, Upgrade und Veröffentlichung

1. Die vollständige QA und Mac-spezifischen Tests müssen erfolgreich sein.
   Quellstand über den Projektprozess integrieren und signiert veröffentlichen.
2. `deploy/postgres/pre-gematik/mac-sync.sql` nach aktueller Sicherung auf der
   bestehenden Google-Datenbank ausführen. Die additive Migration legt nur
   `mac_sync` samt begrenzten Rechten für `vk_app` an. Geschäftsdaten bleiben
   unverändert. Mit `macSyncEnabled: true` im privaten Google-Betriebsprofil
   aktivieren; ohne diese Einstellung bleibt die Schnittstelle deaktiviert.
   Der Bereitschaftstest prüft vor Freigabe das benötigte Schema.
3. Vor einem Mac-Upgrade sichern und offene lokale Bearbeitungen prüfen.
   Eine ungeprüfte oder veränderte Arbeitsdatenbank darf nicht durch eine
   ältere Ausgangskopie ersetzt werden. Falls sie unverändert ist, kann das
   geprüfte Archiv zur Ersteinrichtung einer separaten Installation dienen.
4. `tools/local-app/install.mjs` benötigt ein geprüftes Archiv, den exakten
   veröffentlichten Quellstand, das eigene Profil und einen freien lokalen
   Port. Ein bestehender Installationsordner wird niemals überschrieben.
   Für die Vorprüfung `install({ createApplications: false, ... })` nutzen.
   Erst `finishInstall` nach Abnahme ersetzt die App-Verknüpfungen und richtet
   den Autostart ein. Die alte Installation bleibt als Rückfallkopie erhalten.
5. Nach echter Google-Verbindung erste Übernahme, Tabellenzahlen, wichtige
   Ansichten, Dateien und Offline-Lesen prüfen. Tests mit Schreibzugriffen
   ausschließlich in einem separaten synthetischen Bestand durchführen.

Die importierte Ausgangskopie kann aus dem früheren Lesekopie-Werkzeug stammen.
Dessen Kubernetes-Aktualisierung wird im Google-Betrieb nicht ausgeführt.
Die neue Verbindung nutzt ausschließlich den geschützten Google-Anwendungsweg.
Ein Paket aktualisiert die Daten automatisch, nicht seinen eigenen Programmcode;
ein späteres App-Upgrade muss wiederum geprüft installiert werden.

## Prüfung

`npm run test:mac-sync` prüft zwei isolierte PostgreSQL-Datenbanken mit der echten
Fach-API, Wiederanlauf, Konflikte, Dateiversionen, Validierungen und Zugangsentzug
sowie Import-, Gateway- und Archivgrenzen. Die Online-Testrolle hat dieselben
begrenzten Datenbankrechte wie `vk_app`; Produktionsdaten werden nicht benutzt.
Zusätzlich gelten `npm run qa:full`, `npm run build:pages`, die Google-Buildprüfung
und echte Browserprüfungen der lokalen sowie Online-Verbindungsansicht.
