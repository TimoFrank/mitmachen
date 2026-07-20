# PostgreSQL-16-Bootstrap für die Pre-Integration

Dieses Verzeichnis enthält ein aktives Bootstrap-Artefakt für die auf vier Wochen befristete eigene GCP-Pre-Integration des Versorgungs-Kompasses.

Es ist ausdrücklich **kein freigegebenes gematik-Zielschema**, keine Festlegung für den späteren Zielbetrieb und kein Ersatz für dessen Architektur-, Datenschutz-, Sicherheits- oder Betriebsfreigabe. Vor einer Übernahme in die gematik-Integrationsumgebung müssen Schema, Rollen, Migrationen, Aufbewahrung, Backup/Restore und Betriebsverfahren mit der gematik abgestimmt und erneut abgenommen werden.

## Dateien

- `schema.sql`: idempotenter PostgreSQL-16-Bootstrap für eine frische Pre-Integrationsdatenbank.
- `runtime-role.sql`: idempotente Anlage der festen `NOLOGIN`-Rolle `vk_app_runtime`; entzieht `PUBLIC` zusätzlich das Erstellen von Objekten im Schema `public`.
- `grants.sql`: idempotente Least-Privilege-Laufzeitrechte für eine bereits angelegte `NOLOGIN`-Rolle; benötigt eine verpflichtende `psql`-Variable.
- `identity-admin-role.sql`: geheimnisfreier, fail-closed Bootstrap der separaten `NOLOGIN`-Rolle `vk_identity_admin`; sie darf ausschließlich Profile lesen und IAP-Identity-Bindungen lesen/anlegen/aktivieren. Der Rollen-Bootstrap läuft nur als bestehender Objekt-Owner und verweigert vorhandene Mitglieder, Elternrollen, Objektbesitz oder unsichere Attribute.
- `seed.example.sql`: optionaler, ausschließlich synthetischer Admin-Seed. Er enthält die reservierte Beispieldomain `example.invalid` und keine echten Personen- oder Kontaktdaten.
- `seed.synthetic.sql`: generierter, versionierter Fachdaten-Seed für die GCP-Pre-Integration. Er enthält ausschließlich synthetische Profile, Organisationen, Kontakte, Formate, Hospitationen und Beobachtungen.
- `seed.synthetic-profile-avatars.sql`: enger, idempotenter Nachzug für drei lokale SVG-Avatare der reservierten Demo-Profile. Er verändert keine IAP-Nutzerprofile.
- [`migrations/`](migrations/README.md): geordnete, versionierte Upgrades für bereits bestehende Datenbanken. Die dortige Anleitung ist für jede Aktualisierung einer bestehenden Instanz verbindlich.

`seed.synthetic.sql` wird aus `frontend/data/demo-data.js` durch `scripts/generate_pre_gematik_synthetic_seed.mjs` erzeugt. Der Generator neutralisiert Profile, E-Mail-Adressen, Telefone und Bildreferenzen, verwendet ausschließlich reservierte `demo-*`-IDs und normalisiert alle 64 Kontakte für den Karten-Smoke-Test auf `active`.

Das Schema wurde aus dem aktiven Vertrag in `api/server.mjs`, dem Datenmodell und den historischen Plain-PostgreSQL-/Supabase-Quellen abgeleitet. Die historischen Quellen bleiben Quellen; dieses Artefakt führt weder Supabase Auth noch Supabase-Rollen, Storage-Tabellen, Grants oder Row Level Security fort.

## Bewusste Grenzen

- Anwendung und Container führen **keine automatische Migration beim Start** aus.
- `schema.sql` ist ein Bootstrap für eine neue, leere Pre-Integrationsdatenbank. Spätere Änderungen benötigen versionierte Migrationen; das erneute Anwenden ersetzt keine Migrationsstrategie.
- Berechtigungen für Cloud SQL, Datenbankrollen und Secrets werden außerhalb dieses Schemas über GCP IAM, Secret Manager und bewusst angelegte PostgreSQL-Rollen geregelt.
- Öffentliche `network_registrations`, Rate Limits und `login_aliases` sind nicht enthalten, weil die aktuelle Node-API sie nicht bedient. Ein öffentlicher Intake benötigt einen eigenen freigegebenen Sicherheits- und Datenschutzpfad.
- Das Schema enthält keine echten Seeds. Für Tests sind ausschließlich synthetische oder anonymisierte Daten zulässig.
- Der synthetische Fachdaten-Seed ist ausschließlich für `pre-gematik` bestimmt. Er ist kein Migrationsweg für den Supabase-Bestand und darf nicht im späteren gematik-Zielbetrieb angewendet werden.
- Der API-Export ist kein Datenbankbackup. Für die Pre-Integration bleiben Cloud-SQL-Backup und ein getesteter Restore erforderlich.

## ID-Vertrag

Fachliche IDs und SSO-Subjects sind überwiegend `text`, weil die aktive API Präfix-IDs wie `contact-…`, `organization-…`, `format-…` und `observation-…` erzeugt. Notiz- und Anhang-IDs bleiben `uuid`, da die API dort `crypto.randomUUID()` schreibt und die Volltextsuche diesen Typ voraussetzt. Alle Fremdschlüssel sind dazu typgleich.

## Manuelle Anwendung

`schema.sql`, Laufzeitrolle und Grants werden über eine kontrollierte Cloud-SQL-Administrationsverbindung angewendet. Die Grants liegen ausschließlich auf `vk_app_runtime`, nie direkt auf einem Login:

```bash
export PRE_GEMATIK_SCHEMA_DATABASE_URL='postgresql://...'
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" -v ON_ERROR_STOP=1 -f runtime-role.sql
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" -v ON_ERROR_STOP=1 -v runtime_role=vk_app_runtime -f grants.sql
```

`runtime-role.sql` kann gefahrlos erneut angewendet werden. Es stellt `vk_app_runtime` als Rolle ohne Login her und entzieht der impliziten PostgreSQL-Rolle `PUBLIC` das Recht `CREATE` auf dem Schema `public`. `grants.sql` quotiert `runtime_role` als PostgreSQL-Identifier, prüft Existenz und `NOLOGIN` und vergibt nur `USAGE` auf das Schema, DML auf die explizit aufgeführten Tabellen, `USAGE/SELECT` auf die drei Identity-Sequenzen sowie `EXECUTE` auf die vier benötigten Funktionen. Es vergibt insbesondere kein `CREATE`, `ALTER`, `DROP` oder Rollenverwaltungsrecht. Nach jeder späteren Schema-Migration muss die Rechtezuordnung bewusst erneut geprüft und bei neuen Objekten erweitert werden.

Die Befehle oben sind ausschließlich für eine frische Datenbank bestimmt. Für eine bereits bestehende Instanz gilt stattdessen das Verfahren in [`migrations/README.md`](migrations/README.md): Vorimport-Backup und Restore-Pfad bestätigen, ausstehenden Migrationspfad prüfen, Migrationen in aufsteigender Reihenfolge anwenden, Laufzeitrechte erneut abgleichen und anschließend Vertrags- sowie Anwendungstests ausführen. Das erneute Anwenden von `schema.sql` ersetzt diesen Ablauf nicht.

Der eigentliche Login `vk_app` bleibt ein von Cloud SQL verwalteter `BUILT_IN`-User. Beim Anlegen über die Cloud-SQL-Admin-API muss `databaseRoles` bereits ausschließlich `vk_app_runtime` enthalten; Passwort und Request-Body werden dabei aus restriktiv berechtigten temporären Dateien gelesen und weder als Prozessargument noch im Log ausgegeben. Danach beziehungsweise für einen bereits vorhandenen User wird die Rollenliste idempotent auf genau diese eine benutzerdefinierte Rolle abgeglichen:

```bash
gcloud sql users assign-roles vk_app \
  --instance=vk-pre-gematik-postgres \
  --type=BUILT_IN \
  --database-roles=vk_app_runtime \
  --revoke-existing-roles
```

`--revoke-existing-roles` ist sicherheitsrelevant: Es entfernt insbesondere eine bei einer früheren Standardanlage vergebene Cloud-SQL-Administrationsrolle, bevor `vk_app_runtime` zugeordnet wird. Vor dem Deployment muss die folgende Abfrage für `vk_app` genau eine explizite Mitgliedschaft, `vk_app_runtime`, liefern:

```sql
select granted_role.rolname as granted_role
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
 where member_role.rolname = 'vk_app'
 order by granted_role.rolname;
```

Dasselbe beim Cloud-SQL-User gesetzte Passwort wird als aktive Version von `vk-pre-gematik-postgres-password` gespeichert. Es gehört weder in Git, Terraform-State, GitHub noch in Prozessargumente oder Protokolle.

## Kurzlebige Identity-Administration

Die Laufzeitrolle wird für Identity-Schreibzugriffe ausdrücklich nicht erweitert.
Nach dem Echtdatenimport wird `identity-admin-role.sql` einmal kontrolliert als
bestehender Objekt-Owner angewendet. Anschließend erhält ein zufälliger,
kurzlebiger Cloud-SQL-Login über `databaseRoles` ausschließlich
`vk_identity_admin`; die explizite Custom-Rolle verhindert die automatische
Zuweisung von `cloudsqlsuperuser`. Preview und Apply prüfen Rollenattribute,
exklusive Mitgliedschaft und sämtliche effektiven Grants erneut, wechseln mit
`SET LOCAL ROLE` auf die `NOLOGIN`-Rolle und brechen bei jeder Erweiterung ab.

Der Rollen-Bootstrap ohne bekanntes `postgres`-Passwort, die geschützte
Credential-Erzeugung, Operatorausführung, Abnahme und der Login-Cleanup stehen
im verbindlichen [Identity-Admin-Runbook](../../../dokumentation/betrieb-und-deployment/PRE_GEMATIK_IDENTITY_ADMIN.md).

Das optionale Beispielprofil darf nur in einer Testdatenbank verwendet werden:

```bash
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" -v ON_ERROR_STOP=1 -f seed.example.sql
```

## Synthetischer Pre-Integrationsbestand

Der versionierte Seed `pre-gematik-synthetic-v1` erzeugt:

- 5 neutrale Demo-Profile, ohne ein vorhandenes IAP-Profil zu verändern,
- 32 Organisationen und 32 Primärsysteme,
- 64 aktive Kontakte und 74 Owner-Zuordnungen,
- 8 Formate und 75 Teilnahmen,
- 18 Hospitationen und 39 synthetische Beobachtungen,
- 39 automatisch durch den Schema-Trigger erzeugte Beobachtungs-Audits.

Alle 64 Kontakte erhalten materialisierte, von `0/0` verschiedene Koordinaten; fehlende Demo-Kontaktwerte werden beim Generieren einmalig aus der zugehörigen Organisation übernommen. Der Seed arbeitet in einer Transaktion, hält einen Advisory Lock, prüft ID-Kollisionen vorab, verwendet ausschließlich `ON CONFLICT DO NOTHING` und enthält weder `TRUNCATE` noch `DELETE` oder DDL. Ein zweiter Lauf verändert deshalb keine Seed-Zeile und erzeugt keine zusätzlichen Beobachtungs-Audits.

Vor einer Anwendung müssen Generatorstand und PostgreSQL-16-Vertrag grün sein:

```bash
npm run generate:pre-gematik-seed
npm run test:pre-gematik-schema
```

Unmittelbar vor dem ersten Import ist ein erfolgreicher On-Demand-Cloud-SQL-Backup-Lauf anzulegen. Bei einer administrativen PostgreSQL-Verbindung kann der Seed anschließend so angewendet werden:

```bash
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/seed.synthetic.sql
```

Im GKE-Betrieb kann derselbe transaktionale Seed durch den laufenden API-Container angewendet werden, ohne das Datenbankpasswort auszulesen oder in Prozessargumenten zu führen:

```bash
kubectl --namespace pre-gematik exec --stdin \
  deployment/versorgungs-kompass-api \
  --container api \
  -- node --input-type=module -e '
    import { Pool } from "pg";
    let sql = "";
    for await (const chunk of process.stdin) sql += chunk;
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: false,
      max: 1
    });
    try {
      await pool.query(sql);
      console.log("Synthetic pre-gematik seed applied and verified.");
    } finally {
      await pool.end();
    }
  ' < deploy/postgres/pre-gematik/seed.synthetic.sql
```

Der Seed prüft seine Sollmengen und den Kartenvertrag noch innerhalb der offenen Transaktion. Jeder SQL-, Constraint- oder Mengenfehler verhindert das `COMMIT` vollständig. Ein Cloud-SQL-Restore bleibt ein separater, ausdrücklich freizugebender Notfallvorgang.

Die neutralen Demo-Avatare werden nach dem Fachdaten-Seed separat angewendet, damit der veröffentlichte Namespace `pre-gematik-synthetic-v1` unverändert bleibt:

```bash
psql "$PRE_GEMATIK_SCHEMA_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/seed.synthetic-profile-avatars.sql
```

Der Patch akzeptiert nur die drei erwarteten `example.invalid`-Profile mit Seed-Marker und ausschließlich `NULL` oder bereits den kanonischen lokalen SVG-Pfad. Fremde oder nachträglich individuell gesetzte Avatare führen vor dem ersten Update zum vollständigen Abbruch.

Für GKE Autopilot soll die Anwendung Cloud SQL über den Auth Proxy beziehungsweise Connector erreichen. In diesem Fall endet die verschlüsselte, IAM-gebundene Verbindung am Proxy und die API verwendet für den lokalen Proxy-/Socket-Hop `DB_SSL_MODE=disable`. Bei einer bewusst direkten PostgreSQL-TLS-Verbindung ist `verify-full` mit gemounteter CA zu verwenden.

## Vertragsprüfung

```bash
npm run test:pre-gematik-schema
```

Der Test vergleicht zunächst die `TABLE_FIELDS` der aktiven API mit dem DDL. Ist Docker verfügbar, startet er zusätzlich einen kurzlebigen offiziellen PostgreSQL-16-Container, wendet `schema.sql` und `runtime-role.sql` jeweils zweimal an, vergibt die Grants zweimal an die Laufzeitrolle und verbindet sich über ein separates Login-Mitglied. Er prüft dessen effektive DML-, Sequenz- und Funktionsrechte, die fehlenden DDL-Rechte und führt den relationalen Smoke-Test aus. Der Container wird anschließend beendet und entfernt.

Alternativ kann der Test ausschließlich gegen eine ausdrücklich bereitgestellte, entbehrliche Testdatenbank laufen:

```bash
PRE_GEMATIK_SCHEMA_TEST_DATABASE_URL='postgresql://...' npm run test:pre-gematik-schema
```

Diese Variable darf niemals auf Produktion oder eine Datenbank mit erhaltenswerten Daten zeigen.

## Übergang zum gematik-Zielbetrieb

Vor dem Zielbetrieb sind mindestens erforderlich:

1. formale Freigabe des endgültigen Schemas und der Migrationen,
2. Festlegung von DB-Rollen und Least-Privilege-Rechten,
3. abgestimmte Lösch-, Aufbewahrungs- und Backup-/Restore-Verfahren,
4. Last-, Rollback-, Recovery- und Security-Tests,
5. kontrollierte Datenmigration mit Protokoll und Abnahme.

Bis dahin bleibt dieses Verzeichnis ausschließlich ein leichtgewichtiges Pre-Integrationshilfsmittel.
