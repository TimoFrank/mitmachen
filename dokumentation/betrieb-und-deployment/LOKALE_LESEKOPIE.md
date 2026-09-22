# Lokale Fachdaten-Lesekopie

**Historische Referenz:** Dieser Exportweg gehört zur früheren Kubernetes-
Umgebung. Seit dem Google-Umzug wird er nicht zur regelmäßigen Aktualisierung
ausgeführt. Bereits geprüfte Archive bleiben als Ausgangskopie und Nachweis
für die [lokale Anwendung](LOKALE_ANWENDUNG.md) verwendbar. Die folgenden
Installations- und Automatisierungsschritte beschreiben den damaligen Weg.

Die separate Lesekopie hält den gespeicherten Fachdatenstand der geschützten
Anwendung auf einem autorisierten Mac lesbar. Sie öffnet per Doppelklick ohne
Netzwerk, Server oder Anmeldung. Das Sicherungsdatum bleibt sichtbar. Sie
enthält Suche, Fachbereiche, vollständige Datensatzdetails, Beziehungen,
Historien sowie lokale Bilder und Anhänge. Sie schreibt weder in die
Live-Anwendung noch in einen Browser-Datenspeicher.

## Umfang

Der Export liest alle Zeilen und Spalten der 30 bestehenden Geschäftstabellen,
einschließlich archivierter Inhalte und verschachtelter Beobachtungspayloads.
`network_registrations` kommt hinzu, sobald diese Tabelle im Live-Schema
existiert. Das Fehlen dieser optionalen Tabelle wird ausdrücklich vermerkt.
Unbekannte Tabellen stoppen die Aktualisierung bis zur fachlichen Einordnung.
Authentifizierungszuordnungen und Zugriffskontrollen sind separat klassifiziert
und ausgeschlossen. Anmeldedaten, Tokens und Servergeheimnisse werden nicht
exportiert. Die Kopie ersetzt deshalb kein vollständiges Server-Backup.

Ein einzelner SQL-Client liest mit `REPEATABLE READ READ ONLY`. Tabellenzahlen
und Prüfsummen werden im selben Datenbank-Snapshot erfasst. Private Bilder und
Anhänge werden über die bestehende Workload-Identität im API-Pod gelesen;
Objektgeneration, Größe und Prüfsummen binden ihre konkreten Inhalte.
Fehlende private Dateien verhindern die Übernahme.

Der öffentliche Gesundheitsausschuss wird mit Quelldatum ergänzt. Extern
referenzierte Rasterbilder werden über begrenzte HTTPS-Abrufe lokal gesichert.
Webseiten sowie nicht verfügbare externe Bilder bleiben mit Originaladresse
und sichtbarem Hinweis erhalten. Externe Webseiten selbst werden nicht
gespiegelt. Die Lesekopie lädt keine externen Ressourcen im Hintergrund.

## Installation

Voraussetzungen für die Aktualisierung sind Node.js, `kubectl` und ein bereits
autorisierter Zugriff auf den bestehenden API-Pod. Es werden keine zusätzlichen
Cloud-Berechtigungen, Konten oder Datenbankrollen eingerichtet. Der Export
übernimmt keine Zugangsdaten auf den Mac.

Eine lokale, nicht versionierte Konfiguration enthält:

```json
{
  "sourceUrl": "https://versorgungs-kompass.de",
  "context": "<vorhandener autorisierter Kubernetes-Kontext>",
  "namespace": "<Namespace>",
  "deployment": "<API-Deployment>",
  "container": "api",
  "kubectl": "/usr/local/bin/kubectl",
  "node": "/opt/homebrew/bin/node",
  "toolPath": "<stabiler Suchpfad inklusive Cloud-Authentisierungsprogramm>",
  "viewerBaseRevision": "<geprüfter Basis-Commit>"
}
```

```sh
node tools/offline-copy/install.mjs --config /absoluter/privater/pfad/config.json
```

Standardziel ist `~/Library/Application Support/Versorgungs-Kompass Offline`.
Desktop, Dokumente und bekannte Cloud-Synchronisationsordner werden als
Speicherziel abgewiesen. Ordner und Dateien sind nur für den eigenen Nutzer
lesbar. Die Programme liegen unter `~/Applications`:

- **Versorgungs-Kompass Offline** öffnet den zuletzt geprüften Stand.
- **Versorgungs-Kompass aktualisieren** lädt und prüft einen neuen Stand.

Die installierten Programmkopien sind vom Entwicklungs-Worktree unabhängig.
Zum Lesen wird nicht einmal Node.js benötigt. Für spätere Aktualisierungen
wird ein stabiler Node-Pfad verwendet, kein versionsgebundener Cellar-Pfad.

## Übernahme und Automatisierung

Die Aktualisierung prüft Quellhostname, Ingress-Service und Pod-Zuordnung.
Sie liest aus einem konkreten bereiten Pod und dokumentiert dessen tatsächliche
Image-ID. Ein Containerwechsel während des Exports stoppt die Übernahme.

Jeder Abruf entsteht in einem separaten privaten Zwischenordner. Erst nach
vollständiger Prüfung aller Tabellen und Dateien wird `current` atomar auf
den neuen Snapshot umgeschaltet. Bei Netz-, Authentisierungs- oder Datenfehlern
bleibt die letzte vollständige Kopie erhalten. `status.json` hält nur Zeitpunkt
und feste Fehlercodes fest, keine Rohfehler oder fachlichen Inhalte.

Eine optionale tägliche Automatisierung ruft das installierte
`program/refresh.mjs --root <Installationsordner>` auf und prüft danach mit
`--verify`. Sie verändert keine Live-Daten und veröffentlicht keine Exporte.
Der Computer und die ausführende Anwendung müssen für den geplanten lokalen
Lauf verfügbar sein. Ein manueller Abruf bleibt unabhängig davon möglich.
Die Automatisierung ist eine lokale Betriebseinrichtung, kein Bestandteil des
öffentlichen Builds. Frühere Snapshots bleiben erhalten.

## Prüfung

```sh
npm run test:offline-copy
npm run qa:full
```

Die gezielten Tests verwenden ausschließlich synthetische Daten. Sie prüfen
Manipulationen, unvollständige Dateilisten, Tabellen- und Dateiprüfsummen,
Pfadgrenzen sowie den Erhalt des letzten gültigen Stands. Zusätzlich muss die
fertige HTML-Datei in einem echten Browser ohne Netzwerk frisch geöffnet
werden: Suche, alle Fachbereiche, verschachtelte Beobachtungen, lokale Dateien,
Desktop, Tablet und Mobile. Die Browserprüfung darf keine Fachanfragen senden.

Produktive Snapshots, Konfigurationen, Bilder, Anhänge, Bildschirmabbildungen
und Berichte bleiben außerhalb des Repositorys. Sie sind weder Pages- noch
Target-Artefakte. Ein erfolgreicher lokaler Test ist kein Deployment-Nachweis.
