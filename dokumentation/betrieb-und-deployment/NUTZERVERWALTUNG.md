# Nutzerverwaltung in #Mitmachen

Stand: 30. September 2026. Implementiert im Aufgabenbranch; Aktivierung in Cloud Run ausstehend.

Admins öffnen **Hilfe & Konto → Nutzerverwaltung** oder
`/administration/nutzer`. Die Ansicht zeigt E-Mail, Rolle, Team, Zugangsstatus
und die letzte Anmeldung. „Aktiv“ setzt ein freigeschaltetes Identity-Konto,
ein aktives Profil und eine aktive, eindeutige App-Zuordnung voraus.
Eine letzte Anmeldung beweist keine aktuelle Nutzung. Konten ohne Zuordnung
werden ausdrücklich als „Ohne App-Zugang“ angezeigt.

## Bedienung

- **Nutzer einladen:** Name, bestätigte E-Mail und Viewer-/Editor-Rolle erfassen.
  Die Anwendung legt ausschließlich neue Konten mit einer eindeutigen
  `test_only`-Zuordnung an. Bestehende E-Mail-Adressen und Profile werden nicht
  übernommen oder überschrieben. Anschließend die vereinfachte Willkommensmail
  prüfen und ausdrücklich **Einladung senden** wählen. Der Passwortlink wird
  nach bestätigter SMTP-Annahme für 48 Stunden aktiviert. Die allgemeine
  Zugangsfrist gilt zusätzlich.
- **Konto verwalten:** Rolle ändern oder Zugang sperren/freischalten. Das eigene
  Konto und der letzte aktive Admin sind geschützt. Testkonten können keine
  Admin-Rolle erhalten. Eine separat widerrufene Zuordnung lässt sich hier
  nicht wieder freischalten. Bestehende Sitzungen werden widerrufen.
- **Einladungen:** Vorbereitete Vorgänge ansehen und fortsetzen. Bei einem
  unklaren Versandstatus erfolgt kein automatischer zweiter Versand. Eine noch
  offene Linkaktivierung kann ohne erneute Mail abgeschlossen werden.
- **Änderungsverlauf:** Vorgang, betroffene E-Mail, ausführender Admin und
  Zeitpunkt nachsehen. Der Laufzeitzugang darf Audit-Einträge nur hinzufügen.

Viewer, Editor und Nutzer mit `test_only`-Scope haben keinen Zugriff auf diese
Administration. Die Prüfung erfolgt im Backend. Die öffentliche Pages-Demo
enthält weder die Verwaltungsansicht noch deren zusätzliche Assets. Für den
OIDC-Zielbetrieb ist dieser Google-Adapter nicht aktiviert.

## Technischer Vertrag

`GET /api/admin/users`, `PATCH /api/admin/users/:uid`,
`POST /api/admin/users/invitations` und
`POST /api/admin/users/invitations/:id/send` verlangen Standard-Adminrechte.
Änderungen verlangen zusätzlich den exakten App-Origin und JSON.
Identitäten werden über den vollständigen, projektspezifischen Subject
zugeordnet, niemals allein über E-Mail. Der normale App-Datenbankzugang erhält
keine zusätzlichen Schreibrechte.

Die versionierte Migration
`deploy/postgres/pre-gematik/migrations/202609300001_user_administration.sql`
erstellt das private Schema `user_administration` mit Vorgängen und Audit sowie
die begrenzte Gruppenrolle `vk_user_admin_runtime`. Ein eigener Login erbt nur
diese Rolle. Er darf Profile anlegen und Rolle/Status ändern, Zuordnungen nur
anlegen, Vorgänge fortschreiben und Audit-Einträge hinzufügen. Löschen von
Profilen, Ändern vorhandener Zuordnungen und Ändern/Löschen des Audits sind
nicht erlaubt. Keine fremden Rollenmitgliedschaften oder Objektbesitze zuweisen.

Änderungen verwenden dieselbe Postgres-Sperre wie die bisherigen
Identity-Operatoren. Der Versionsvergleich verhindert das Überschreiben eines
zwischenzeitlich geänderten Kontos. Vor einer Identity-Änderung wird der
App-Zugang gesperrt; ein Anbieterfehler belässt ihn in diesem sicheren Zustand.
Provider- und Datenbankoperationen sind keine gemeinsame Transaktion.
Die Oberfläche meldet deshalb unvollständige Vorgänge ausdrücklich.

Vorbereitete EML-Dateien und Linkmaterial bleiben im privaten Datenbankschema
und im privaten Einladungs-Bucket. Browserantworten enthalten nur eine
Vorschau ohne Passworttoken. Nach erfolgreichem Versand und Aktivierung wird
das Linkmaterial aus dem Datenbankvorgang entfernt. Die bestehende
Bucket-Löschregel und der Passwortbroker verwalten die Objektlebensdauer.
SMTP-Annahme ist kein Zustellnachweis im Posteingang.

## Aktivierung nach Integration und Deploymentfreigabe

1. Exakten integrierten Quellstand nachweisen und die vollständige QA sowie
   den Google-Build prüfen. Datenbanksicherung und Zugang zu einer zweiten
   aktiven Standard-Administration nachweisen.
2. Die Migration über den bestehenden privaten Datenbank-Operator ausführen
   und den erfolgreichen zweiten, unverändernden Durchlauf prüfen. Einen
   dedizierten Login, etwa `vk_user_admin_app`, mit eigenem Zufallspasswort,
   ohne erhöhte Datenbankrechte erstellen. Nur `vk_user_admin_runtime`
   zuweisen. Das Passwort als eigenes Secret mit numerisch gepinnter Version
   speichern. Keine Zugangsdaten in Git, Chat oder Aufrufargumente schreiben.
3. In der privaten Google-Betriebseingabe ergänzen:

   ```json
   "userAdministration": {
     "databaseUser": "vk_user_admin_app",
     "databaseSecret": { "name": "vk-user-admin-database", "version": 1 }
   }
   ```

   `renderGoogleServices` setzt damit `USER_ADMIN_ENABLED=1`,
   `USER_ADMIN_DB_USER`, `USER_ADMIN_DB_PASSWORD`,
   `USER_ADMIN_INVITATION_BUCKET` und `USER_ADMIN_SMTP_PASSWORD`.
   Datenbankziel, TLS-Vertrag und allgemeine Zugangsfrist stammen aus der
   bestehenden App-Konfiguration. Ohne den Konfigurationsblock bleibt die
   Funktion deaktiviert.
4. Den ausdrücklich freigegebenen Infrastruktur-Schritt aus
   `deploy/google-hosting/bootstrap.mjs` mit dieser Eingabe anwenden. Der
   optionale Pfad ergänzt eigene IAM-Rollen für das App-Dienstkonto:
   `firebaseauth.users.get/create/update` sowie das Lesen/Neuanlegen von
   Einladungsobjekten. Keine Identity-Löschrechte oder Passwort-Hash-Rechte.
   Bucket-Zugriff ist auf Metadaten sowie `prepared/` und `active/` beschränkt;
   Überschreiben und Löschen sind ausgeschlossen. Zugriff auf die beiden
   benötigten Secrets wird separat gesetzt. Abweichende bestehende
   benutzerdefinierte Rollen werden nicht still verändert.
5. Nach dem Deployment mit einem ausdrücklich freigegebenen Testempfänger
   Liste, Einladungs-Vorschau, Versand, Passwortvergabe, Viewer-Zugriff,
   Sperrung und Wiederanmeldung prüfen. Viewer-/Editor-/Test-Admin-Anfragen
   müssen serverseitig 403 erhalten. Keine Bestandskonten für Schreibtests
   verwenden. Den ausgelieferten SHA und das Ergebnis dokumentieren.

Bei Rücknahme `USER_ADMIN_ENABLED=0` setzen und die neue Revision prüfen.
Zusätzliche IAM-/Secret-Zugriffe und den eigenen Datenbanklogin danach gezielt
entziehen. Audit und fachliche Konten bleiben bestehen; keine Rückwärtslöschung
von Nutzerdaten oder Vorgängen.

## Prüfungen

- `node scripts/test_user_administration.mjs --require-docker`: reale
  PostgreSQL-16-Migration und Laufzeitrechte; Rollen, Scope, konkurrierende
  Änderungen, Wiederaufnahme, Versandfehler, Sperren, Vorlagen und Audit.
- `npx playwright test tests/user-administration.spec.js`: Desktop/Mobil,
  zusätzlich Tablet-Vorschau, Suche/Filter, Sperren, Einladungs-Vorschau,
  ausdrücklicher Versand, Fehleranzeige und verborgener Einstieg für andere Rollen.
- `npm run qa:full`, Pages- und Target-/Google-Build sowie vorhandene
  Auth-, Datenschutz- und Migrationstests bleiben verbindlich.
