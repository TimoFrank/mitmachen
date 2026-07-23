# Datenbank und Datenübernahme für den Gematik-PoC

Dieses Runbook beschreibt den einmaligen Aufbau der PostgreSQL-16-Datenbank für den internen Nutzungspiloten. Software-Release, Daten-Snapshot und OIDC-Zuordnungen bleiben getrennt.

Der aktuelle fachliche Bestand von `mitmachen.timo-frank.de` liegt in der geschützten GCP-Pre-Integration. Ein alter Supabase-Export ist deshalb nicht automatisch der aktuelle Stand. Vor dem Import wird die tatsächlich schreibführende Cloud-SQL-Datenbank als Quelle bestätigt.

## Voraussetzungen

- eine leere, dedizierte PostgreSQL-16-Datenbank;
- eine kontrollierte Verbindung als Objekt-Owner für Schema und Import;
- ein Laufzeit-Login, das ausschließlich Mitglied der `NOLOGIN`-Rolle `vk_app_runtime` ist;
- direkter TLS-Zugriff des Migrationsoperators auf den bestätigten Quell-Snapshot und die Ziel-Datenbank;
- die kanonische OIDC-Issuer-URL und unveränderte `sub`-Claims der benannten Nutzerinnen und Nutzer;
- ein geschütztes Arbeitsticket für Datenumfang, Snapshot-Zeitpunkt, Mengen, Prüfsumme und Ergebnis.

Zugangsdaten, Datenexporte, OIDC-Subjects und Profilzuordnungen gehören nicht in dieses Repository oder in Build-Protokolle.

## 1. Schema und Laufzeitrolle

Die folgenden geprüften Artefakte werden wiederverwendet:

- [`../pre-gematik/schema.sql`](../pre-gematik/schema.sql)
- [`../pre-gematik/runtime-role.sql`](../pre-gematik/runtime-role.sql)
- [`../pre-gematik/grants.sql`](../pre-gematik/grants.sql)

```bash
export POC_GEMATIK_ADMIN_DATABASE_URL='postgresql://...'
export POC_GEMATIK_OWNER_DATABASE_URL='postgresql://...'

psql "$POC_GEMATIK_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/runtime-role.sql

psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/schema.sql

psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v runtime_role=vk_app_runtime \
  -f deploy/postgres/pre-gematik/grants.sql
```

Der synthetische Seed wird in dieser Datenbank nicht angewendet. Die API selbst erhält keine DDL-Rechte und führt keinen Bootstrap aus.

## 2. Datenumfang festlegen

Grundlage ist die bestehende Allowlist der 29 Fachtabellen im [Migrationsvertrag](../../../dokumentation/betrieb-und-deployment/SUPABASE_CLOUD_SQL_MIGRATION.md). Vor dem Import werden mindestens ausgeschlossen:

- IAP- und andere alte Anmeldezuordnungen,
- Supabase- und GCP-Systemtabellen,
- Zugangsdaten und technische Kontrollarchive,
- Demo-Datensätze sowie
- Patienten- oder identifizierende Falldaten.

Wenn die Zielplattform zunächst keinen passenden privaten Objektspeicher anbietet, werden Dateiobjekte und ihre Zielreferenzen nicht als Teil des ersten Imports behandelt. Die strukturierten CRM-Daten bleiben trotzdem nutzbar. Neue Bild- und Datei-Uploads bleiben im ersten PoC deaktiviert.

## 3. Geschützten Snapshot importieren

Die bestehende Migration enthält den Tabellenvertrag, Prüfungen und Fingerprints, ihr Ausführungsweg ist jedoch auf Supabase, Cloud SQL, GCS und IAP zugeschnitten. Sie darf nicht unverändert gegen die gematik-Datenbank ausgeführt werden.

Sobald die IT den Zielzugang und den vorgesehenen Objektspeicher genannt hat, wird ein dünner Zieladapter ergänzt. Er muss:

1. den aktuellen Cloud-SQL-Snapshot read-only öffnen,
2. ausschließlich die bestätigte Allowlist lesen,
3. alte `identity_bindings` auslassen,
4. die leere Ziel-Datenbank in einer Transaktion befüllen,
5. Fremdschlüssel, Tabellenmengen und einen inhaltsbasierten Fingerprint prüfen und
6. keine Zeilenwerte in Logs oder Build-Artefakte schreiben.

Der Import ist ein eigener, geschützter Adminvorgang. Er läuft weder in Jenkins noch beim Start der Anwendung. Bei einem Fehler wird die noch nicht freigegebene Ziel-Datenbank neu angelegt und derselbe bestätigte Snapshot erneut importiert; die Quelle bleibt unverändert.

## 4. OIDC-Identitäten zuordnen

Nach dem Import wird jede benannte OIDC-Identität genau einem aktiven Profil zugeordnet. Die Zuordnung verwendet immer die exakte Kombination aus `issuer` und `sub`; E-Mail-Adressen werden nicht als Ersatz verwendet.

```bash
psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v issuer='https://identity.example.invalid/' \
  -v subject='OIDC-SUBJECT-AUS-GESCHÜTZTER-SITZUNG' \
  -v profile_id='BESTEHENDE-PROFIL-ID' \
  -f deploy/postgres/poc-gematik/bind-oidc-identity.sql
```

Reale Werte werden nur in einer geschützten Operator-Sitzung eingesetzt. Das Skript verweigert unbekannte oder inaktive Profile, eine Neuzuordnung bestehender Identitäten und die Doppelbelegung eines Profils beim selben Issuer.

## 5. Abnahme

Im geschützten Ticket genügen:

- Snapshot-Zeitpunkt und Importversion,
- Tabellenmengen und nicht personenbezogener Fingerprint,
- Bestätigung, dass keine Demo-Zeilen oder alten Identity-Bindings übernommen wurden,
- positiver Login einer Lese- und einer Schreibrolle,
- negativer Login einer unbekannten Identität und
- Ergebnis eines vereinbarten Lese- und Schreibablaufs.

Während des Testzeitraums ist diese PoC-Datenbank der gemeinsame bearbeitbare Bestand. Es gibt keine automatische Synchronisation zurück zu `mitmachen.timo-frank.de`.
