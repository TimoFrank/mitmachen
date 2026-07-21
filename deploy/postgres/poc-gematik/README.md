# Datenbank-Bootstrap für den gematik-internen PoC

Dieses Runbook beschreibt bewusst nur den nächsten kleinen Schritt: eine einzelne, kleine PostgreSQL-16-Datenbank für den zeitlich begrenzten gematik-internen Proof of Concept. Die Datenbank enthält ausschließlich synthetische Testdaten und darf vollständig gelöscht und neu aufgebaut werden.

Die Anwendung arbeitet derzeit fest im Schema `public`. Deshalb benötigt der PoC **eine eigene Datenbank, deren `public`-Schema vollständig disponibel und durch das PoC-Team kontrolliert ist**. Ein zusätzliches „isoliertes Schema“ in einer gemeinsam genutzten Datenbank erfüllt diesen Vertrag nicht.

Nicht Bestandteil dieses Durchstichs sind Echtdaten, eine Bestandsmigration, automatische Migrationen beim Anwendungsstart, Hochverfügbarkeit, ein produktionsreifes Backup-/Restore-Verfahren oder die Freigabe eines späteren gematik-Zielschemas.

## Voraussetzungen der IT-Plattform

- eine leere, dedizierte PostgreSQL-16-Datenbank für den PoC;
- eine kontrollierte Bootstrap-Verbindung als Objekt-Owner;
- fuer `runtime-role.sql` einmalig einen Plattform-DB-Admin mit `CREATEROLE`
  beziehungsweise eine von der Plattform bereits gepruefte Rolle
  `vk_app_runtime`;
- ein Laufzeit-Login, das ausschließlich Mitglied der `NOLOGIN`-Rolle `vk_app_runtime` ist;
- die kanonische OIDC-Issuer-URL und die unveränderten `sub`-Claims von zwei bis fünf Testidentitäten;
- ein Secret für die Laufzeitverbindung; Zugangsdaten und OIDC-Subjects gehören nicht ins Repository oder in Build-Protokolle.

Für diesen disponiblen PoC-Bestand ist keine Migration aus einer bestehenden Datenbank vorgesehen. Falls eine Datenbank bereits erhaltenswerte Daten enthält, ist sie die falsche Zieldatenbank für dieses Runbook.

## 1. Vertragsprüfung

Vom Repository-Root aus:

```bash
npm run test:pre-gematik-schema
```

Dieser Test prüft den von der API erwarteten Tabellenvertrag und, sofern Docker verfügbar ist, den Bootstrap gegen einen kurzlebigen PostgreSQL-16-Container.

## 2. Leere PoC-Datenbank bootstrappen

Die folgenden vier vorhandenen, versionierten Artefakte werden für den PoC bewusst wiederverwendet:

- [`../pre-gematik/schema.sql`](../pre-gematik/schema.sql) für das disponibel neu aufgebaute `public`-Schema;
- [`../pre-gematik/runtime-role.sql`](../pre-gematik/runtime-role.sql) für die feste `NOLOGIN`-Laufzeitrolle;
- [`../pre-gematik/grants.sql`](../pre-gematik/grants.sql) für die expliziten Laufzeitrechte;
- [`../pre-gematik/seed.synthetic.sql`](../pre-gematik/seed.synthetic.sql) für den synthetischen Bestand `pre-gematik-synthetic-v1`.

Zuerst wendet der Plattform-DB-Admin `runtime-role.sql` an. PostgreSQL-Rollen
sind clusterweit; deshalb muss er vorab bestaetigen, dass der Name
`vk_app_runtime` nicht mit einer anders verwendeten oder weiter berechtigten
Rolle kollidiert. Das Skript prueft und erzwingt die vorgesehenen
`NOLOGIN`-/Nicht-Admin-Attribute, ersetzt aber keine organisatorische
Namenspruefung. Falls die Plattform diesen Namen nicht bereitstellen kann, wird
der Bootstrap gestoppt und der Rollenadapter vor dem RC gemeinsam angepasst.

Anschliessend werden Schema, Grants und Seed mit der kontrollierten
Owner-Verbindung und ausschliesslich gegen die dedizierte PoC-Datenbank
angewendet:

```bash
export POC_GEMATIK_ADMIN_DATABASE_URL='postgresql://...'
export POC_GEMATIK_OWNER_DATABASE_URL='postgresql://...'

# als Plattform-DB-Admin mit CREATEROLE:
psql "$POC_GEMATIK_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/runtime-role.sql

# ab hier als Objekt-Owner der dedizierten PoC-Datenbank:
psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/schema.sql

psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v runtime_role=vk_app_runtime \
  -f deploy/postgres/pre-gematik/grants.sql

psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/postgres/pre-gematik/seed.synthetic.sql
```

Die Anwendung selbst führt diese Schritte nicht aus. Der Laufzeit-Login erhält kein DDL-Recht und darf `identity_bindings` nur lesen.

## 3. Zwei bis fünf Testidentitäten binden

Jede OIDC-Testidentität wird genau einem der fünf synthetischen Profile zugeordnet:

| Profil-ID | PoC-Rolle |
| --- | --- |
| `demo-profile-admin` | Administration |
| `demo-profile-editor` | Redaktion |
| `demo-profile-viewer` | Lesen |
| `demo-profile-hospitation` | Hospitation |
| `demo-profile-formate` | Formate |

Das Binding-Skript verlangt `issuer`, `subject` und `profile_id` als `psql`-Variablen. Es prüft den Seed-Marker `pre-gematik-synthetic-v1`, akzeptiert keine anderen Profile und aktiviert eine identische Zuordnung idempotent erneut. Es verweigert sowohl die Neuzuordnung einer bereits gebundenen Identität zu einem anderen Profil als auch die Doppelbelegung eines Profils beim selben Issuer.

Beispiel mit Platzhaltern, erneut über die kontrollierte Owner-Verbindung:

```bash
psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v issuer='https://oidc.example.invalid/' \
  -v subject='OIDC-SUBJECT-DER-TESTIDENTITAET' \
  -v profile_id='demo-profile-viewer' \
  -f deploy/postgres/poc-gematik/bind-test-identity.sql
```

Den Befehl für jede der zwei bis fünf Testidentitäten mit ihrer unveränderten Issuer-/Subject-Kombination wiederholen. Keine E-Mail-Adresse als Ersatz für `sub` verwenden. Reale Werte nur in einer kontrollierten Operator-Sitzung einsetzen und die Kommandozeile nicht in CI-Logs oder Tickets kopieren.

## 4. Abnahme des kleinen Durchstichs

Mit der Owner-Verbindung müssen nur synthetische, aktive Bindungen sichtbar sein:

```bash
psql "$POC_GEMATIK_OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  select binding.issuer, binding.subject, binding.profile_id, binding.active
    from public.identity_bindings binding
    join public.profiles profile on profile.id = binding.profile_id
   where position('pre-gematik-synthetic-v1' in coalesce(profile.bio, '')) > 0
   order by binding.issuer, binding.subject;
"
```

Nach dem Deployment müssen `/api/healthz` und `/api/readyz` erfolgreich sein; anschließend genügt ein Login-Smoke-Test mit mindestens einer Lese- und einer Schreibrolle. Für den PoC ist die Datenbank erfolgreich bereitgestellt, wenn die synthetischen Datensätze lesbar sind, eine synthetische Änderung gespeichert werden kann und die Anwendung nach einem Neustart wieder bereit ist.

## Abbruch und Wiederholung

Bei einem fehlgeschlagenen Bootstrap wird keine Bestandsreparatur improvisiert. Die dedizierte PoC-Datenbank wird verworfen, leer neu angelegt und die obige Reihenfolge erneut ausgeführt. Diese einfache Wiederholbarkeit ist Teil des PoC-Vertrags; sie ist kein Betriebsmodell für eine spätere Produktion.
