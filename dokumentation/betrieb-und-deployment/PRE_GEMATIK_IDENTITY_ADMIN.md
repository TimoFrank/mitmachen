# Kurzlebige Administration der IAP-Identity-Bindung

Status: ausführbarer Pre-Integrationsvertrag; keine institutionelle gematik-Freigabe

> **Befristeter External-Identities-Übergang:** Für den zeitlich begrenzten
> Wechsel von Google-IAM-Identitäten auf Identity Platform gilt ergänzend der
> [External-Identities-Pilotvertrag](PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md).
> Weil beide Varianten denselben äußeren IAP-Issuer, aber unterschiedliche
> Subjects verwenden und `identity_bindings` zugleich
> `unique (issuer, profile_id)` erzwingt, können Alt- und Neubindung nicht
> parallel vorgehalten werden. Der dort beschriebene atomare Subject-Remap samt
> geschütztem Vorzustand und geprüftem Rückweg ist vor diesem Cutover
> verbindlich.

## Ziel und Entscheidung

Nach dem Echtdatenimport wird jeder freigegebene bestehende Google-IAP-Subject
aus dem geschützten Voll-Soll-Roster auf genau sein vorhandenes aktives Profil
in `public.identity_bindings` gebunden. Ein Passwort-Testkonto wird vor jedem
Set-password-Link entweder administrativ auf sein **bereits vorhandenes
aktives Profil** vorgebunden oder – nur als vollständig neuer Gast – mit dem
getrennt bestätigten `--create-profile-and-prebind`-Modus atomar zusammen mit
seinem Profil angelegt. Der Standard-Prebinding-Modus darf ausschließlich die
fehlende aktive `test_only`-Bindung ergänzen oder einen exakt vollständigen
Zustand als No-op bestätigen. Sein getrennt bestätigter `--revoke`-Modus
deaktiviert exakt diese Bindung wieder. Die
normale Anwendung darf diese Zuordnung nur lesen. Tester erhalten
ausschließlich `viewer` oder `editor` mit `test_only`; die bestehende
Admin-Bindung bleibt davon getrennt.

> **Aktiver Vertrag seit dem einheitlichen Login-Release:** Die Anwendung
> bietet keine offene Selbstregistrierung und kein allgemeines
> Testzugang-Enrollment an. `/api/auth/auto-enrollment` und
> `/api/auth/enrollment` sind nicht in der API-Policy registriert und liefern
> fail-closed `404`; ein Deployment-Schalter zum Reaktivieren existiert nicht.
> Der frühere Passwortgast-Ablauf über
> `POST /api/auth/external-enrollment`, Pending-Anfrage und
> v2-Testzugangsoperator ist ebenfalls kein aktiver Sollweg. Auch wenn der
> Endpunkt während einer Übergangsphase technisch noch vorhanden ist, darf er
> weder von der UI noch manuell für das Gast-Onboarding aufgerufen werden. Eine
> zu UID, E-Mail, Profil oder Subject passende Pending-Anfrage ist eine
> Kollision und sperrt das administrative Prebinding.

## Vorprovisionierte Identitäten

Fachlichen Anwendungszugriff erhält nur ein Konto, für das alle drei
Voraussetzungen erfüllt sind:

1. genehmigter Eintrag im geschützten Voll-Soll-Roster,
2. aktive, modegerechte Zulassung: im IAM-Modus in der vorgeschalteten
   Google-IAP-Policy, im External-Modus als administrativ vorprovisionierter
   Identity-Platform-Nutzer und
3. genau eine aktive Bindung aus signiertem `issuer + subject` auf ein aktives
   Profil in `public.identity_bindings`.

Die öffentliche Hauptseite führt über `/anmelden` zur gemeinsamen eigenen
Loginseite für Google sowie E-Mail und Passwort. Nach erfolgreicher Anmeldung
prüft die API sofort die bereits vorhandene Bindung. Fehlt sie oder ist das
Profil inaktiv, führt der Flow neutral zu `/#zugriff-verweigert`; weder
E-Mail-Adresse noch Subject, Profilzustand oder Gruppenstatus werden
offengelegt. Direkte Aufrufe von `/start` behandeln einen initialen API-`403`
identisch.

Passwort-Testkonten werden vor diesem Login ausschließlich administrativ mit
[`provision_pre_gematik_identity_platform_account.mjs`](../../scripts/provision_pre_gematik_identity_platform_account.mjs)
create-only angelegt. Self-Signup bleibt aus. Das owner-only Eingabedokument
liegt außerhalb von Git und enthält kein Passwort; ein intern zufällig
erzeugtes Bootstrap-Geheimnis wird weder ausgegeben noch gespeichert. Der
Operator schreibt ausschließlich die von Identity Platform erzeugte
Password-Reset-URL als Set-password-Einladung create-only in eine owner-only
Datei außerhalb des Worktrees. Weder Passwort noch Link oder Kontodaten dürfen
in Git, Ticket, allgemeinem Chat, Shell-History, Konsolen- oder
Operatorausgabe gelangen.

Die verbindliche Reihenfolge verhindert ausdrücklich den Zustand „Passwort
gesetzt, aber kein App-Zugang“:

1. password-only Identity-Platform-Konto create-only mit
   `continue_url=https://versorgungs-kompass.de/start` anlegen. Die dabei
   owner-only geschriebene Linkdatei noch nicht versenden.
2. Mit
   [`provision_pre_gematik_identity_platform_guest_access.mjs`](../../scripts/provision_pre_gematik_identity_platform_guest_access.mjs)
   den genehmigten Zustand zweimal mit stabilen `input_fingerprint`- und
   `current_state_fingerprint`-Werten previewen. Bei einem vorhandenen aktiven
   Profil ausdrücklich mit `PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`
   anwenden. Nur bei einem vollständig neuen Gast
   `--create-profile-and-prebind` und
   `CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` verwenden;
   dabei werden Profil und `test_only`-Bindung atomar angelegt. Jeden Modus als
   `unchanged`-Readback sowie bestätigt ausgeführten No-op abnehmen.
3. Erst danach einen neuen beziehungsweise Recovery-Link erzeugen oder den
   noch gültigen Link aus der owner-only Datei auswählen. Mit
   [`render_pre_gematik_guest_welcome_email.mjs`](../../scripts/render_pre_gematik_guest_welcome_email.mjs)
   und der Operation `RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL` daraus
   create-only das geprüfte owner-only Paket aus Betreff, Text, HTML und EML
   rendern und über den genehmigten persönlichen Kanal senden. Nach dem
   manuellen iCloud-Versand Empfänger, nicht leeren Betreff, nicht leeren
   Nachrichtentext und sichtbaren Markenlink im Ordner „Gesendet“ read-only
   bestätigen. Ist das Prebinding nicht exakt: **keine Mail**.
4. Die Person setzt das Passwort auf
   `https://versorgungs-kompass.de/konto/passwort-festlegen`, wählt
   `Jetzt anmelden`, gelangt über `/start` zur Anmeldung und danach direkt in
   die App.
5. Nach erfolgreichem Passwortsetzen und App-Login Linkdatei und gerendertes
   Mailpaket kontrolliert löschen.

Diese Einladung ist kein passwortloser IAP-Login. Scheitert die Link-Erzeugung
nach dem Account-Create, wird der Account nicht automatisch gelöscht und
create-only nicht wiederholt; nach exaktem read-only Abgleich ist nur der
ausdrücklich bestätigte Link-Recovery-Modus zulässig. Die vollständige Befehls-
und Nachweisfolge steht im
[External-Identities-Pilotvertrag](PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md).

Der Pilot verwendet keine vorgefertigte Hosted Login Page. Verbindlich sind die
eigene Loginseite `https://versorgungs-kompass.de/anmelden`, die eigene
Passwortsetzseite
`https://versorgungs-kompass.de/konto/passwort-festlegen`,
`emailPrivacyConfig.enableImprovedEmailPrivacy=true` und der bytegenaue
technische Google-OAuth-Callback
`https://steam-capsule-341212.firebaseapp.com/__/auth/handler`. Der Firebase-
Callback ist kein sichtbarer Einladungs- oder Login-Link.

Im IAM- und External-Modus erzeugt die Anwendung selbst weder Profile noch
Bindings. Für Passwortgäste werden keine Pending-Anfragen erzeugt oder
konsumiert. Das vollständige App-Binding liegt vor der Einladung
administrativ vor: entweder über den bestandsprofil-only Standardmodus oder
über den ausdrücklich getrennten atomaren Neunutzer-Modus. Eine fehlende oder
abweichende Bindung sperrt den Linkversand.

### Verbindlicher Gast-Prebinding-Nachweis

Das owner-only Eingabedokument für
`provision_pre_gematik_identity_platform_guest_access.mjs` enthält genau eine
genehmigte UID/E-Mail-Kombination, die genehmigte Profil-ID, Anzeigename,
`viewer` oder `editor` und den genehmigten `scope_ref`. Der Operator verwendet
die kurzlebige, exklusive Datenbankrolle `vk_access_enrollment_admin`, prüft
den Identity-Platform-Nutzer unabhängig anhand UID und E-Mail als aktiven,
verifizierten, tenantlosen password-only Account und leitet das vollständige
External-IAP-Subject selbst ab.

Vor dem Apply werden zwei getrennte Previews ausgeführt:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json
```

Beide Ausgaben müssen bytegenau stabile `input_fingerprint`- und
`current_state_fingerprint`-Werte zeigen. Im Standardmodus ist der genehmigte
Erstzustand `result=create_binding` bei exakt vorhandenem aktivem Profil. Ein
fehlendes oder abweichendes Profil, ein inaktives Profil, anderes Binding,
Pending-Anfrage oder UID-/E-Mail-/Subject-Kollision führen dort zu `NO-GO`;
der Standardmodus legt kein Profil an.

Der Apply übernimmt ausschließlich die beiden bestätigten Fingerprints:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-database versorgungs_kompass \
  --confirm-operation PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST \
  --confirm-fingerprint sha256:INPUT-FINGERPRINT-AUS-PREVIEW \
  --confirm-current-state-fingerprint sha256:IST-FINGERPRINT-AUS-PREVIEW
```

Der anschließende Preview muss `result=unchanged`,
`profile_binding_complete=true` und denselben Wert für
`current_state_fingerprint` und `expected_state_fingerprint` melden. Ein
zweiter ausdrücklich bestätigter Apply gegen diesen aktuellen Fingerprint
muss ebenfalls `result=unchanged` bleiben; danach bestätigt ein letzter
read-only Preview erneut den vollständigen Zustand. Erst dieser
Readback-/No-op-Nachweis öffnet das Mail-Gate.

Fehlt für einen echten Neunutzer das App-Profil vollständig, ist statt des
Standardmodus ausschließlich der getrennte Preview mit
`--create-profile-and-prebind` zulässig. Nur ein vollständig leerer relevanter
Zustand darf `result=create_profile_and_binding` melden. Der Apply benötigt
die eigene Operation
`CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` sowie beide
Preview-Fingerprints und legt Profil plus aktive `test_only`-Bindung in einer
serialisierbaren Transaktion an. Profil-ohne-Binding, Binding-ohne-Profil,
Pending-Anfrage oder Drift sind `NO-GO`. Anschließend sind ebenfalls
`unchanged`-Readback, bestätigter No-op und letzter Preview Pflicht.

### Verbindlicher Gast-Widerruf

Offboarding und Pilot-Rückbau verwenden denselben Operator mit explizitem
`--revoke`. Solange das Identity-Platform-Konto noch aktiv ist, wird mit
demselben owner-only `guest-access.json` zuerst read-only previewt:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --revoke
```

Beim ersten Widerruf werden Operation
`REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS`,
`result=disable_binding`, `access_revoked=false`, der
`input_fingerprint` und der `current_state_fingerprint` geschützt bestätigt.
Der Apply akzeptiert ausschließlich genau diese Operation und beide
Fingerprints:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --revoke \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-database versorgungs_kompass \
  --confirm-operation REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS \
  --confirm-fingerprint sha256:INPUT-FINGERPRINT-AUS-PREVIEW \
  --confirm-current-state-fingerprint sha256:IST-FINGERPRINT-AUS-PREVIEW
```

Der Operator setzt ausschließlich `active=false` auf der exakt gepinnten
`test_only`-Bindung. Er löscht und verändert weder das vorhandene App-Profil
noch den Identity-Platform-Account. Ein anschließender `--revoke`-Preview muss
`result=unchanged`, `access_revoked=true`, keine aktive Bindung und identische
`current_state_fingerprint`-/`expected_state_fingerprint`-Werte melden. Dieser
Zustand wird mit einem zweiten Apply und dem aktuellen
`current_state_fingerprint` ausdrücklich als `unchanged`-No-op bestätigt; ein
letzter read-only Preview bleibt unverändert.

Erst danach werden das Identity-Platform-Konto deaktiviert und seine Refresh
Tokens widerrufen. Bei
`GUEST_ACCESS_REVOCATION_COMMIT_OUTCOME_UNKNOWN` wird nicht blind erneut
angewendet, sondern zuerst ein neuer `--revoke`-Preview ausgeführt.

Die bestehende zusammengesetzte Identität `(issuer, subject)` bleibt bewusst
erhalten, damit eine spätere Entra-ID-/OIDC-Bindung parallel zu Google angelegt
und anschließend kontrolliert umgeschaltet werden kann.

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

Ab v2 werden `INSERT` und das allgemeine `UPDATE` auf `identity_bindings`
entzogen. Neben den für eine fail-closed Diagnose nötigen Leserechten erhält
die Rolle ausschließlich `UPDATE (subject)`. Damit kann der ausdrücklich
bestätigte IAM-/Identity-Platform-Remap nur das Subject einer bestehenden Zeile
ersetzen; Insert, Aktivitäts-, Profil-, Rollen- oder Scope-Änderungen bleiben
verboten. Das Passwortgast-Prebinding läuft getrennt über
`provision_pre_gematik_identity_platform_guest_access.mjs` und die
least-privilege Rolle `vk_access_enrollment_admin`; für diesen Pilot darf es
nur die fehlende `test_only`-Bindung auf ein vorhandenes aktives Profil
ergänzen.

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
  privilegierten App-Endpunkt als Umgehungsweg an. Der frühere
  Pending-/v2-Consumption-Pfad gehört nicht zum Passwortgast-Onboarding.

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
- für jeden Passwortgast eine genehmigte Profil-ID und Rolle sowie getrennte
  owner-only Konto-, Gastzugriffs- und Linkdateien; ein Bestandsprofil wird
  ausschließlich per Standard-Prebinding gebunden, ein vollständig neuer Gast
  ausschließlich mit dem expliziten atomaren
  `--create-profile-and-prebind`-Modus angelegt,
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
- den exakten Eingabe-Fingerprint aus dem unmittelbar bestätigten Preview,
- `--confirm-current-state-fingerprint` mit dem exakten
  `current_state_fingerprint` desselben Preview-Laufs,
- `--confirm-binding-count <GESCHUETZTER_SOLLWERT>` für die exakte Gesamtzahl
  der Bindungen,
- `--confirm-active-binding-count <GESCHUETZTER_SOLLWERT>` für die exakte Zahl
  aktiver Bindungen,
- `--allow-active-bindings` ausschließlich für die im Voll-Soll-Roster
  genehmigten aktiven Bindungen.

Für den im
[External-Identities-Pilotvertrag](PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md)
beschriebenen Wechsel kommen in Preview und Apply
`--allow-subject-remaps` sowie im Apply
`--confirm-subject-remap-count <GESCHUETZTER-SOLLWERT>` hinzu. Sobald das
v2-Testzugangsschema aktiv ist, besitzt `vk_identity_admin` dafür ausschließlich
`UPDATE (subject)`: Ein Remap darf keine Zeile anlegen und weder `active`,
Profilrolle, `access_scope` noch `scope_ref` ändern. Passwortgäste werden nicht
über diesen Remap und nicht über den Pending-v2-Weg angelegt. Ihr separat
bestätigter Gastzugriffsoperator bindet entweder das vorhandene Profil oder
legt im expliziten Neunutzer-Modus Profil und `test_only`-Bindung atomar an.

Der bestätigte `current_state_fingerprint` umfasst Issuer, aktuelles Subject,
Profil-ID, Binding-Aktivität, `access_scope`, `scope_ref`, Profilrolle und
Profilaktivität. Apply liest und sperrt denselben Zustand erneut und bricht bei
jeder Abweichung ab. Der Fingerprint ist deshalb keine zweite Bezeichnung für
den Eingabe- oder Soll-Fingerprint, sondern die ausdrückliche
Time-of-check-/Time-of-use-Bestätigung des unmittelbar freigegebenen
Datenbankzustands.

Die Zähler werden bei jedem Lauf aus dem geschützten Voll-Soll-Roster bestätigt
und nicht im Repository festgeschrieben. Jede Änderung des vollständigen
Sollzustands erfordert neue, ausdrücklich geprüfte Zähler und einen neuen
Preview-Fingerprint.

Ohne die beiden ausdrücklichen Remap-Optionen gibt es keinen Delete- oder
Remap-Pfad. Unbekannte bestehende Bindungen, ein fehlendes/inaktives Profil, ein
zweites Subject für dasselbe Profil, ein vom Preview abweichender Istzustand
oder eine abweichende vollständige Soll-Liste brechen die Transaktion ab.

## 4. Abnahme

Vor Öffnung des Dienstes sind alle Punkte erforderlich:

1. Identity-Apply meldet erfolgreichen COMMIT und den erwarteten
   Sollzustands-Fingerprint.
2. Eine neue read-only Verbindung bestätigt exakt den geschützten Sollzustand;
   konkrete Subjects und Profil-IDs bleiben im geschützten Nachweis.
3. Der freigegebene aktive Admin erreicht Frontend und API über IAP und behält
   die importierte Adminrolle.
4. Jeder aktivierte Tester erreicht Frontend und API über den jeweils aktiven
   IAP-Identitätsmodus und erhält exakt die genehmigte Viewer- beziehungsweise
   `test_only`-Editorrolle. Im External-Pilot wurde das password-only Konto
   vor Linkversand entweder auf das vorhandene aktive Profil vorgebunden oder
   mit dem expliziten Neunutzer-Modus atomar samt Profil angelegt; Readback und
   bestätigter Wiederholungslauf melden `result=unchanged`.
5. Eine gültig signierte, aber ungebundene IAP-Identität erhält `403`; dasselbe
   gilt nach Deaktivierung einer Bindung.
6. `vk_app` kann die Bindung lesen, aber `INSERT`, `UPDATE` und `DELETE` werden
   weiterhin mit fehlender Berechtigung abgewiesen.
7. Keine Bindung außerhalb des geschützten Voll-Soll-Rosters, kein inaktives
   Zielprofil und kein E-Mail-basiertes Ersatzmapping ist vorhanden.
8. Für den Passwortgast existiert keine kollidierende Pending-Anfrage und der
   Post-Login-Endpoint wurde nicht verwendet.
9. Die Willkommensmail wurde erst nach vollständigem Gastzugriffs-Readback
   versendet. Der
   sichtbare Link führt über
   `https://versorgungs-kompass.de/konto/passwort-festlegen`; `Jetzt anmelden`
   führt über `/start` zur Anmeldung und anschließend direkt in die App.
10. Die owner-only Linkdatei und das gerenderte Mailpaket sind nach
    erfolgreichem Passwortsetzen und App-Login kontrolliert gelöscht.
11. Der Gast-Widerruf wurde nicht-produktiv nachgewiesen: `--revoke` meldet
    zuerst `disable_binding`, der Apply akzeptiert ausschließlich
    `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS` mit beiden Fingerprints
    und der Wiederholungslauf bleibt `result=unchanged`. Profil und
    Identity-Platform-Konto bleiben unverändert.

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
Vorimport-Backup zurückgesetzt werden. Wenn ausschließlich eine
Passwortgast-Bindung falsch aktiviert wurde und der Datenbestand korrekt ist,
wird sie über
`provision_pre_gematik_identity_platform_guest_access.mjs --revoke`
previewt, mit Operation
`REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS` sowie Eingabe- und
`current_state_fingerprint` deaktiviert und anschließend als
`result=unchanged`-No-op bestätigt. Ein direktes manuelles Delete ist nicht
vorgesehen. Nach ersten fachlichen Zielschreibzugriffen gilt die allgemeine
Cutover-/Rollback-Entscheidung.

Beim External-Identity-Rückweg dürfen nicht zuerst alle Bindungen deaktiviert
werden: Die ergänzten Passwort-/`test_only`-Bindungen werden einzeln mit dem
expliziten `--revoke`-Modus desselben Gast-Operators, beiden bestätigten
Fingerprints und anschließendem `unchanged`-No-op inaktiv gesetzt. Der
Operator verändert dabei weder die bereits vor dem Pilot vorhandenen Profile
noch die Identity-Platform-Konten. Erst nach dem No-op werden die
Passwortkonten in Identity Platform deaktiviert und ihre Refresh Tokens
widerrufen. Die bestehenden Google-Bindungen bleiben dagegen im
fail-closed Wartungsfenster aktiv, während der bestätigte umgekehrte
Subject-Remap ausschließlich ihre Subjects auf den gesicherten IAM-Zustand
zurücksetzt. Erst danach wird die Runtime fail-closed auf IAM ausgerollt; der
Deployment-Workflow reconciliert anschließend beide IAP-Ressourcen samt
Reauthentication auf IAM und bestätigt den Zustand. Noch nicht versendete
Linkdateien werden kontrolliert gelöscht. Die vollständige Reihenfolge steht im
[External-Identities-Pilotvertrag](PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md).
