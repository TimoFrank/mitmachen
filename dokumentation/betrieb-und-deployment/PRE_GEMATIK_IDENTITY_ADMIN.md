# Kurzlebige Administration der IAP-Identity-Bindung

Status: ausführbarer Pre-Integrationsvertrag; keine institutionelle gematik-Freigabe

## Ziel und Entscheidung

Nach dem Echtdatenimport wird jeder freigegebene IAP-Subject aus dem geschützten
Voll-Soll-Roster auf genau ein vorhandenes aktives Profil in
`public.identity_bindings` gebunden. Die normale Anwendung darf diese Zuordnung
nur lesen. Tester erhalten ausschließlich `viewer` oder `editor` mit
`test_only`; die bestehende Admin-Bindung bleibt davon getrennt.

> **Verbindlicher v2-Hinweis:** Sobald Migration
> `202607240001_add_test_access_enrollment.sql` angewendet ist, ist der unten
> dokumentierte v1-Operator `vk_identity_admin` absichtlich read-only. Neue
> Tester werden dann ausschließlich über `/enrollment.html`, die Rolle
> `vk_access_enrollment_admin` und
> `scripts/provision_pre_gematik_test_access.mjs` freigeschaltet. Eingabeformat,
> Preview/Apply und Cleanup stehen unter
> [Geschütztes Testnutzer-Enrollment v2](../../deploy/postgres/pre-gematik/README.md#geschütztes-testnutzer-enrollment-v2).
> Der v1-Ablauf bleibt nur als historische Standard-Binding-Dokumentation und
> darf nach Aktivierung von v2 nicht für Tester ausgeführt werden.

## Allowlist-basiertes Auto-Enrollment v2.1

Für vorab genehmigte Tester entfällt die sichtbare Vorgangsnummer. Der
geschützte Voll-Soll-Roster wird zunächst außerhalb des Repositories in ein
Allowlist-Dokument mit exakter kleingeschriebener ASCII-Konto-Adresse,
zufälliger PII-freier Profil-UUID, Rolle `viewer` oder `editor`, festem
`test_only`-Scope und Bootstrap-Ablauf überführt. Neue Einträge werden mit
`scripts/provision_pre_gematik_test_access_allowlist.mjs` nach Preview und
explizitem Apply in `public.test_access_allowlist` angelegt; Widerrufe sind
append-only nachvollziehbar, verbrauchte Einträge unveränderlich.

Beim ersten Aufruf der geschützten Enrollment-Seite gilt:

1. `POST /api/auth/auto-enrollment` akzeptiert weder Body noch Queryparameter
   und verwendet ausschließlich das vollständig signatur-, Audience- und
   zeitgeprüfte IAP-JWT.
2. Ein exakter, noch gültiger und nicht widerrufener Eintrag wird unter
   demselben globalen Lock wie der v2-Operator gesperrt.
3. Interne Audit-UUID, `applied`-Enrollment, Testprofil, stabile
   Issuer-/Subject-Bindung und einmalige Consumption entstehen in einem
   Datenbank-Commit.
4. Ohne eindeutigen Treffer entsteht keine Mutation. Erst eine ausdrückliche
   Nutzeraktion erzeugt den bisherigen manuellen 24-Stunden-Request.

Die dafür verwendete Funktion
`public.pre_gematik_consume_test_access_allowlist(...)` ist eine bewusst eng
begrenzte neue `SECURITY DEFINER`-Ausnahme gegenüber dem historischen
v1-Vertrag. Ihr Owner ist die separate Rolle `vk_allowlist_executor`
(`NOLOGIN`/`NOINHERIT`) mit ausschließlich den benötigten Spaltenrechten,
festem `search_path = pg_catalog, public` und ohne dynamisches SQL. `PUBLIC`
und die Laufzeitrolle besitzen keine Tabellenrechte auf die Allowlist und keine
Binding-Schreibrechte; `vk_app_runtime` erhält nur `EXECUTE` auf genau diese
Funktion. Bootstrap und Prüfung erfolgen mit
`deploy/postgres/pre-gematik/access-allowlist-admin-role.sql`.

Auto-Enrollment ist in Helm standardmäßig aus. Der Deployment-Workflow
aktiviert den Runtime-Schalter erst, nachdem API- und Frontend-Backend exakt
die gepinnte private Gruppenpolicy mit Pilotablauf besitzen. Ein direkter
`user:`-Rollback hält ihn ausgeschaltet. Das Allowlist-Ablaufdatum beendet nur
den erstmaligen Bootstrap; Offboarding deaktiviert zusätzlich die App-Bindung
und entfernt Gruppen- sowie OAuth-Zulassung.

Für ein Google-Konto enthält die geschützte Soll-Liste die stabile,
namespace-lose numerische Google-Konto-ID. Das signierte IAP-JWT liefert gemäß
dem Google-Vertrag zu
[signierten IAP-Headern](https://cloud.google.com/iap/docs/signed-headers-howto#retrieving_the_user_identity)
denselben Identifier mit dem festen Prefix `accounts.google.com:`. Die API
entfernt ausschließlich diesen exakt bekannten Prefix und nur vor einem
numerischen Identifier. Externe Identity-Platform-Subjects bleiben vollständig
namespaced; ein E-Mail-Fallback findet nicht statt.

Der historische v1-Weg vor Aktivierung des Enrollment-v2-Schemas ist:

1. die statische, geheimnisfreie Datei
   [`identity-admin-role.sql`](../../deploy/postgres/pre-gematik/identity-admin-role.sql)
   einmal kontrolliert als bestehender Objekt-Owner `postgres` importieren,
2. dadurch die dauerhafte Rolle `vk_identity_admin` als `NOLOGIN` anlegen,
3. einen zufälligen, kurzlebigen Cloud-SQL-`BUILT_IN`-Login **ausschließlich**
   dieser Rolle zuordnen,
4. Preview und Apply im dedizierten GKE-Migrationsoperator ausführen und
5. den Login und alle Credential-Projektionen unmittelbar danach löschen.

`vk_identity_admin` besitzt vor Aktivierung von v2 ausschließlich:

- `USAGE` auf Schema `public`,
- `SELECT` auf `public.profiles`,
- `SELECT`, `INSERT` und `UPDATE` auf `public.identity_bindings`,
- `EXECUTE` auf die bereits vorhandene Touch-Triggerfunktion.

Ab v2 werden `INSERT` und `UPDATE` auf `identity_bindings` entzogen. Die Rolle
behält nur die für eine fail-closed Diagnose nötigen Leserechte; jeder
Schreibversuch des alten Operators endet mit einem ausdrücklichen Hinweis auf
den v2-Prozess.

Die Rolle besitzt kein Login, keine Rollen- oder Datenbankverwaltung, kein
`CREATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, keine Sequenzrechte und
keine Rechte auf andere Fachtabellen. Cloud SQL vergibt die einzige Login-
Mitgliedschaft mit `ADMIN FALSE`, `INHERIT TRUE` und `SET TRUE`; dadurch gelten
bereits vor dem Rollenwechsel ausschließlich dieselben Minimalrechte. Das
Provisionierungswerkzeug prüft diese Grenze bei jedem Preview und Apply erneut
und setzt `SET LOCAL ROLE vk_identity_admin`, damit `current_user` und der
Audit-/Privilegkontext während der Transaktion eindeutig die Minimalrolle
ausweisen. Der Rollenwechsel erweitert die Rechte nicht.

## Warum dieser Weg

- `vk_app` bleibt unverändert: auf `identity_bindings` weiterhin nur `SELECT`.
- Das bestehende `postgres`-Passwort wird weder benötigt noch rotiert.
- Für den temporären Login werden weder `postgres` noch `cloudsqlsuperuser`
  vergeben. Cloud SQL vergibt bei einem `BUILT_IN`-User keine automatische
  `cloudsqlsuperuser`-Rolle, wenn beim Erstellen eine vorhandene eigene
  Datenbankrolle angegeben wird. Grundlage ist die aktuelle Google-Dokumentation
  [Create and manage users](https://docs.cloud.google.com/sql/docs/postgres/create-manage-users).
- IAM-Datenbankauthentisierung und Cloud SQL Data API bleiben unverändert aus;
  ihre Aktivierung wäre für diesen einmaligen Vorgang eine unnötige Änderung
  des Instanzvertrags.
- Der historische v1-Operator legt keine `SECURITY DEFINER`-Funktion und keinen
  privilegierten App-Endpunkt als Umgehungsweg an. Die separat abgenommene,
  oben begrenzte v2.1-Consumption-Funktion gehört nicht zu diesem v1-Pfad.

Der einmalige Rollen-Bootstrap läuft zwar als Objekt-Owner, enthält aber keine
Identity-Werte, Passwörter oder Fachdaten. Er ist statisch, hashbar, reviewbar
und bricht ab, wenn die Rolle unerwartete Mitglieder, Elternrollen, unsichere
Attribute oder Objektbesitz hat. PostgreSQL 16 hinterlegt beim Anlegen durch
einen Nicht-Superuser mit `CREATEROLE` automatisch genau eine administrative
Creator-Mitgliedschaft. Der Vertrag erlaubt sie ausschließlich für den
geprüften Objekt-Owner, mit `ADMIN OPTION`, aber ausdrücklich ohne `SET` und
ohne `INHERIT`. Dadurch kann der Owner die Rolle nicht annehmen; seine bereits
bestehenden Owner-Rechte werden nicht erweitert.

Der passwortlose Bootstrap über `gcloud sql import sql --user=postgres` folgt
dem dokumentierten Cloud-SQL-Importpfad für SQL-Anweisungen, die von einem
bestimmten Datenbankuser ausgeführt werden müssen: [Export and import using SQL
dump files](https://docs.cloud.google.com/sql/docs/postgres/import-export/import-export-sql).

## Voraussetzungen

- erfolgreicher Echtdatenimport und Reconciliation,
- konkretes erfolgreiches Vorimport-Backup und frischer GCP-Gate,
- Dienst bleibt bis nach G-04b für Nutzer geschlossen,
- genehmigtes personenbezogenes Voll-Soll-Roster und daraus erzeugte,
  geschützte vollständige `iap-bindings.json` außerhalb des Repositories,
- dediziertes GKE-Migrationsoperator-Image per Digest,
- Operatorverzeichnis lokal `0700`, Eingaben und Ergebnisse `0600`,
- zwei getrennte identische Eigenprüfungs-Previews durch den Pilot-Owner; dies
  ist ausdrücklich kein institutionelles Vier-Augen-Prinzip.

## 1. Rollen-Bootstrap ohne `postgres`-Passwort

Zuerst den Repository-Stand und den SHA-256 der statischen SQL-Datei im
geschützten Cutover-Nachweis festhalten. Für den Import wird ein kurzlebiger,
privater Bucket in derselben Region angelegt. Er enthält exakt diese eine,
nicht vertrauliche SQL-Datei. Die Cloud-SQL-Service-Identity erhält nur für
diesen Bucket `roles/storage.objectViewer`.

Beispiel mit bewusst sprechenden Platzhaltern:

```bash
IDENTITY_BOOTSTRAP_RUN="YYYYMMDD-RUN"
IDENTITY_BOOTSTRAP_BUCKET="${GCP_PROJECT_ID}-vk-identity-bootstrap-${IDENTITY_BOOTSTRAP_RUN}"
IDENTITY_BOOTSTRAP_OBJECT="identity-admin-role.sql"
IDENTITY_BOOTSTRAP_SQL="deploy/postgres/pre-gematik/identity-admin-role.sql"

shasum -a 256 "$IDENTITY_BOOTSTRAP_SQL"

gcloud storage buckets create "gs://${IDENTITY_BOOTSTRAP_BUCKET}" \
  --project="$GCP_PROJECT_ID" \
  --location="$GCP_REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --soft-delete-duration=0s

gcloud storage cp "$IDENTITY_BOOTSTRAP_SQL" \
  "gs://${IDENTITY_BOOTSTRAP_BUCKET}/${IDENTITY_BOOTSTRAP_OBJECT}" \
  --if-generation-match=0
```

Die Service-Identity wird in einer Shellvariablen gehalten und nicht ausgegeben:

```bash
IDENTITY_CLOUD_SQL_SERVICE_ACCOUNT="$(gcloud sql instances describe \
  "$CLOUD_SQL_INSTANCE" \
  --project="$GCP_PROJECT_ID" \
  --format='value(serviceAccountEmailAddress)')"

test -n "$IDENTITY_CLOUD_SQL_SERVICE_ACCOUNT"

gcloud storage buckets add-iam-policy-binding \
  "gs://${IDENTITY_BOOTSTRAP_BUCKET}" \
  --member="serviceAccount:${IDENTITY_CLOUD_SQL_SERVICE_ACCOUNT}" \
  --role=roles/storage.objectViewer
```

Vor dem Import wird read-only bestätigt, dass der Bucket privat ist und exakt
das erwartete Objekt enthält. Dann:

```bash
gcloud sql import sql "$CLOUD_SQL_INSTANCE" \
  "gs://${IDENTITY_BOOTSTRAP_BUCKET}/${IDENTITY_BOOTSTRAP_OBJECT}" \
  --project="$GCP_PROJECT_ID" \
  --database=versorgungs_kompass \
  --user=postgres
```

Nur eine erfolgreich beendete Cloud-SQL-Operation gilt als angewendet. Danach
über eine bestehende read-only Verbindung prüfen:

```sql
select rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
  from pg_catalog.pg_roles
 where rolname = 'vk_identity_admin';

select granted_role.rolname
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
 where member_role.rolname = 'vk_identity_admin';

select member_role.rolname, membership.admin_option,
       membership.inherit_option, membership.set_option
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
 where granted_role.rolname = 'vk_identity_admin';
```

Erwartet ist genau eine `NOLOGIN`-/`NOINHERIT`-Rolle ohne Verwaltungsattribute
und ohne Elternrolle. Als Mitglied ist nur die sichere PostgreSQL-16-Creator-
Mitgliedschaft des nachgewiesenen Objekt-Owners erlaubt (`ADMIN OPTION`,
`INHERIT FALSE`, `SET FALSE`). Die Grant-Prüfung in
`scripts/provision_iap_identity_bindings.mjs` ist zusätzlich verbindlich.

Nach erfolgreicher Prüfung wird nur der exakt benannte temporäre Bucket samt
seinem einen Objekt gelöscht. Vorher Objektliste und Bucketname erneut prüfen.
Da die Datei keine Zugangsdaten oder Identity-Werte enthält, ist sie kein
personenbezogenes Migrationsartefakt; die Cloud-Audit-Operation bleibt erhalten.

## 2. Kurzlebigen Login create-only vorbereiten

Das Hilfswerkzeug erzeugt weder Klartextausgabe noch Prozessargumente mit dem
Passwort. Es schreibt create-only vier Dateien mit Modus `0600` in ein bereits
vorhandenes owner-only Verzeichnis außerhalb des Repositories:

```bash
node scripts/prepare_pre_gematik_identity_operator.mjs \
  --output-directory '/ABSOLUT/GESCHUETZT/identity-run' \
  --project "$GCP_PROJECT_ID" \
  --instance "$CLOUD_SQL_INSTANCE" \
  --database versorgungs_kompass
```

Der Loginname wird ohne Ausgabe in eine Variable gelesen; das Passwort bleibt
ausschließlich in der geschützten `--flags-file` und der Operator-Env-Datei:

```bash
IDENTITY_OPERATOR_DIRECTORY='/ABSOLUT/GESCHUETZT/identity-run'
IDENTITY_OPERATOR_LOGIN="$(tr -d '\n' \
  < "${IDENTITY_OPERATOR_DIRECTORY}/identity-operator-name.txt")"

gcloud sql users create "$IDENTITY_OPERATOR_LOGIN" \
  --flags-file="${IDENTITY_OPERATOR_DIRECTORY}/identity-operator-create-user-flags.json"

gcloud sql users assign-roles "$IDENTITY_OPERATOR_LOGIN" \
  --project="$GCP_PROJECT_ID" \
  --instance="$CLOUD_SQL_INSTANCE" \
  --type=BUILT_IN \
  --database-roles=vk_identity_admin \
  --revoke-existing-roles \
  --quiet
```

Der zweite Befehl ist ein zusätzlicher fail-closed Abgleich: Der kurzlebige
Login darf danach genau eine Mitgliedschaft besitzen, `vk_identity_admin`.
Die Adminrolle selbst hat während des Laufs genau zwei Mitglieder: diesen Login
und den verifizierten Objekt-Owner mit seiner nicht erbenden, nicht setzbaren
Creator-Administration. Das Provisionierungswerkzeug lehnt den Login ab, wenn
er Mitglied von `postgres` oder `cloudsqlsuperuser` ist, wenn ein drittes oder
abweichendes Mitglied existiert oder ein gefährliches Rollenattribut vorhanden
ist.

## 3. Preview und Apply im GKE-Migrationsoperator

Die geschützte Operator-Env wird aus der allgemeinen Operator-Datei und der
separat erzeugten Identity-Datei erstellt, ohne ihren Inhalt auszugeben:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-environment \
  --from-env-file='/ABSOLUT/GESCHUETZT/operator.env' \
  --from-env-file="${IDENTITY_OPERATOR_DIRECTORY}/identity-operator.env"

kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=iap-bindings.json='/ABSOLUT/GESCHUETZT/iap-bindings.json'
```

Der dedizierte Operator stellt die Phasen `identity-preview` und
`identity-apply` bereit. Beide verwenden den privaten, gepinnten Cloud
SQL Auth Proxy und denselben frischen GCP-/Backup-Gate. `identity-preview`
führt immer `ROLLBACK` aus. Für den persönlichen Pilot werden zwei getrennte
Preview-Jobs erzeugt und deren vollständige, nicht personenbezogene
Fingerprint-Zeile muss identisch sein.

`identity-apply` erhält ausschließlich diese Bestätigungen:

- `--confirm-environment pre-gematik`,
- `--confirm-database versorgungs_kompass`,
- `--confirm-operation UPSERT_IAP_IDENTITY_BINDINGS`,
- den exakten Fingerprint aus dem unmittelbar bestätigten Preview,
- `--confirm-binding-count <GESCHUETZTER_SOLLWERT>` für die exakte Gesamtzahl
  der Bindungen,
- `--confirm-active-binding-count <GESCHUETZTER_SOLLWERT>` für die exakte Zahl
  aktiver Bindungen,
- `--allow-active-bindings` ausschließlich für die im Voll-Soll-Roster
  genehmigten aktiven Bindungen.

Die Zähler werden bei jedem Lauf aus dem geschützten Voll-Soll-Roster bestätigt
und nicht im Repository festgeschrieben. Jede Änderung des vollständigen
Sollzustands erfordert neue, ausdrücklich geprüfte Zähler und einen neuen
Preview-Fingerprint.

Es gibt keinen impliziten Delete- oder Remap-Pfad. Unbekannte bestehende
Bindungen, ein fehlendes/inaktives Profil, ein zweites Subject für dasselbe
Profil oder eine abweichende vollständige Soll-Liste brechen die Transaktion ab.

## 4. Abnahme

Vor Öffnung des Dienstes sind alle Punkte erforderlich:

1. Identity-Apply meldet erfolgreichen COMMIT und den erwarteten
   Sollzustands-Fingerprint.
2. Eine neue read-only Verbindung bestätigt exakt den geschützten Sollzustand;
   konkrete Subjects und Profil-IDs bleiben im geschützten Nachweis.
3. Der freigegebene aktive Admin erreicht Frontend und API über IAP und behält
   die importierte Adminrolle.
4. Jeder aktivierte Tester erreicht Frontend und API über die private Gruppe
   und erhält exakt die genehmigte Viewer- beziehungsweise `test_only`-
   Editorrolle.
5. Eine gültig signierte, aber ungebundene IAP-Identität erhält `403`; dasselbe
   gilt nach Deaktivierung einer Bindung.
6. `vk_app` kann die Bindung lesen, aber `INSERT`, `UPDATE` und `DELETE` werden
   weiterhin mit fehlender Berechtigung abgewiesen.
7. Keine Bindung außerhalb des geschützten Voll-Soll-Rosters, kein inaktives
   Zielprofil und kein E-Mail-basiertes Ersatzmapping ist vorhanden.

Bei `IDENTITY_COMMIT_OUTCOME_UNKNOWN` keinen zweiten Apply starten. Mit einer
neuen read-only Verbindung den vollständigen Zustandsfingerprint prüfen und
erst danach über Fortsetzung oder Restore entscheiden.

## 5. Vollständiger Cleanup

Nach bestandener Abnahme:

1. exakt den kurzlebigen Cloud-SQL-Login löschen,
2. read-only bestätigen, dass nur noch die sichere Creator-Mitgliedschaft des
   verifizierten Objekt-Owners an `vk_identity_admin` besteht,
3. exakt den Operator-Job und die beiden Operator-Secrets löschen,
4. temporäre Workload-IAM-Bindungen und ServiceAccount/NetworkPolicy gemäß dem
   Migrationsoperator-Runbook entfernen,
5. die vier lokalen Credential-Dateien erst nach bestätigter User-Löschung
   exakt entfernen; ein eventuell verbleibender Dateiblock ist durch die
   gelöschte Datenbankidentität wertlos,
6. Fingerprints, Cloud-SQL-Operation, Backup-ID und Abnahmenachweis geschützt
   gemäß Aufbewahrungsentscheidung behalten.

`vk_identity_admin` bleibt als gesperrte `NOLOGIN`-Rolle mit ausschließlich der
nicht erbenden und nicht setzbaren Owner-Administration bestehen. Das vermeidet
einen erneuten Owner-Bootstrap für eine spätere kontrollierte Deaktivierung und
erweitert ohne zugeordneten Login keinen fachlichen Zugriffsweg.

## Rollback

Vor der Dienstöffnung kann die gesamte Datenbank auf das bestätigte
Vorimport-Backup zurückgesetzt werden. Wenn ausschließlich die Bindung falsch
aktiviert wurde und der Datenbestand korrekt ist, wird ein neuer vollständiger,
geschützter Sollzustand mit `active: false` zweimal previewt und kontrolliert
angewendet; ein direktes manuelles Delete ist nicht vorgesehen. Nach ersten
fachlichen Zielschreibzugriffen gilt die allgemeine Cutover-/Rollback-Entscheidung.
