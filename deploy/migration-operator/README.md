# Kurzlebiger GKE-Access-Operator

Dieser Operator ist der eng begrenzte Ausführungsweg für die Phasen
`identity-preview`, `identity-apply`, `guest-preview` und `guest-apply` gegen
die private Cloud-SQL-Instanz von `pre-gematik`. Er läuft als kurzlebiger Job
im GKE-Netz und ist kein Bestandteil des Anwendungs-Deployments. Innerhalb der
Gastphasen existiert genau ein Online-Betriebsfall: die atomare Neunutzeranlage
mit `GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true`. Alle anderen Identity-,
Gast-, Reconcile- und Remap-Vorgänge bleiben wartungsgebunden.

Datenbank- und Dateiimporte sind abgeschlossen und aus Image, Quellcode,
Konfiguration und Clustervertrag entfernt. Der Verzeichnisname
`migration-operator` sowie die Kubernetes-Ressourcennamen bleiben vorerst als
Kompatibilitätsnamen erhalten. Sie erteilen keine Berechtigung für einen
Datenimport.

## Sicherheitsgrenzen

- Das Operator-Image wird nur als Linux/AMD64-Image mit unveränderlichem Digest
  aus der regionalen Artifact Registry des bestätigten Zielprojekts akzeptiert.
- Der Container läuft als UID/GID `65532`, ohne Linux-Capabilities, ohne
  Privilege Escalation und mit schreibgeschütztem Root-Dateisystem.
- Zulässige fachliche Eingaben sind ausschließlich `iap-bindings.json` oder
  `guest-access.json`. Die Kubernetes-Secret-Projektion wird vor Benutzung in
  ein kurzlebiges owner-only Volume kopiert.
- Ergebnisdateien liegen unter `/protected-output/run`, gehören dem Operator
  und haben Modus `0600`. Kubernetes-Logs enthalten nur generische Statuszeilen.
- `backoffLimit: 0` verhindert automatische Wiederholungen. Bei einem
  unbekannten Commit-Ausgang wird zuerst der vollständige Zustand mit einer
  neuen Preview-Phase geprüft.
- Die NetworkPolicy verweigert sämtlichen Ingress. Egress ist auf DNS, HTTPS,
  den privaten Cloud-SQL-Auth-Proxy-Pfad auf Port `3307` und die beiden
  GKE-Metadatenserver-Pfade begrenzt. Direkter PostgreSQL-Egress auf Port `5432`
  ist nicht erlaubt.
- Der dedizierte Workload-Identity-Principal erhält nur vorübergehend die exakt
  dokumentierten Lese-, Identity-Platform- und Cloud-SQL-Verbindungsrechte. Er
  ersetzt niemals die Laufzeitidentität der API.
- Kurzlebige Datenbanklogins sind exakt den vorgesehenen `NOLOGIN`-Rollen
  `vk_identity_admin` beziehungsweise `vk_access_enrollment_admin` zugeordnet.

## Harte Startbedingungen

Für jede Phase sind unabhängig geprüfte Projekt-, Instanz- und
Proxy-Fingerprints, der kurzlebige Login aus dem geschützten Prepare-Schritt,
die vollständige owner-only Soll-Datei außerhalb des Git-Worktrees und die
fachliche Freigabe der erwarteten Änderung Pflicht.

Für `identity-preview`/`identity-apply`, Subject-Remaps, Standard-Prebinding,
Anzeigename-Reconcile und jeden Widerruf gelten zusätzlich unverändert:

1. geschlossenes Wartungsfenster und gesperrter Anwendungszugriff,
2. konkretes erfolgreiches Cloud-SQL-Backup unmittelbar vor der Änderung,
3. zwei identische Previews mit identischen Eingabe-, Ist- und
   Sollzustands-Fingerprints sowie
4. das bisherige GCP-/Cloud-SQL-/Backup-Gate einschließlich
   `PRE_IMPORT_BACKUP_ID`.

Nur wenn in `guest-preview` und `guest-apply`
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` und gleichzeitig
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false` gesetzt sind,
wählt der Code automatisch das getrennte Online-Onboarding-Gate. Die
Anwendung bleibt dabei erreichbar; ein ad-hoc erzeugtes
`PRE_IMPORT_BACKUP_ID` wird weder verlangt noch als Umgehung ausgewertet. Das
Online-Gate bestätigt fail-closed das gepinnte Zielprojekt, den laufenden
Cluster, Namespace, die private laufende Cloud-SQL-Instanz mit PostgreSQL 16,
aktivierte automatische Backups und Point-in-time Recovery (PITR), positive
Backup- und Transaktionslog-Aufbewahrung sowie einen höchstens 36 Stunden alten
erfolgreichen automatischen PostgreSQL-16-Snapshot. Aufbewahrungswerte und
Recovery-Punkt werden zusammen mit Projekt und Instanz im Gate-Fingerprint
gebunden; der Proxy-Pin wird getrennt unmittelbar beim Proxy-Start verifiziert.
Fehlt eine dieser Bedingungen, ist die
Online-Neunutzeranlage `NO-GO`. Kein anderer Modus darf dieses Gate verwenden.

## 1. Image und Proxy unveränderlich festlegen

Vom Repository-Root aus wird ausschließlich Linux/AMD64 gebaut:

```bash
docker buildx build \
  --platform linux/amd64 \
  --file deploy/migration-operator/Dockerfile \
  --tag REGION-docker.pkg.dev/PROJEKT/REPOSITORY/vk-access-operator:RUN-ID \
  --push \
  .
```

Anschließend den Registry-Digest auflösen und nur die Form
`REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:…` weiterverwenden. Der
Proxy-Pin wird aus genau diesem Image und nicht aus einer lokalen anderen
Proxy-Version ermittelt:

```bash
docker run --rm --platform linux/amd64 \
  --entrypoint sha256sum \
  REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:IMAGE-DIGEST \
  /usr/local/bin/cloud-sql-proxy
```

Das Ergebnis wird als `sha256:<64-hex>` in die geschützte Operator-Env-Datei
übernommen. Commit, Tag, Image-Digest, Proxy-Pin und Zeitpunkt werden im
Abnahmeprotokoll festgehalten. Das Image wird nie über einen beweglichen Tag
ausgeführt.

### Wiederverwendbarer Online-Onboarding-Release

Ein unverändertes Operator-Image muss nicht für jede neue Person erneut gebaut
und hochgeladen werden. Für den beschleunigten Online-Neunutzerweg wird ein
bereits geprüftes Image als zeitlich begrenzter Operator-Release freigegeben.
Die aufgelöste, owner-only Release-Datei wird aus
[`online-onboarding-operator-release.example.json`](../../config/pre-gematik/online-onboarding-operator-release.example.json)
außerhalb des Git-Worktrees erstellt und bindet exakt:

- den geprüften Quellcommit,
- die regionale Image-Referenz mit unveränderlichem `@sha256`-Digest,
- den aus genau diesem Image gelesenen Cloud-SQL-Auth-Proxy-Pin,
- den privaten Einladungs-Bucket,
- das Ende der Operator-Freigabe und
- die unveränderte Pilotfrist.

Der Release darf für mehrere vollständig neue Gäste wiederverwendet werden,
solange Quellvertrag, Digest und Proxy-Pin unverändert sind, seine Freigabe
nicht abgelaufen oder widerrufen wurde und keine neuere Sicherheitsentscheidung
einen Neubau verlangt. Jeder einzelne Lauf prüft trotzdem Projekt, Region,
Quellstand, Image-Digest, Proxy-Pin und das frische Online-Backup-/PITR-Gate.
Die Wiederverwendung ersetzt weder diese Prüfungen noch die kurzlebigen IAM- und
Datenbankidentitäten. Ein Tag ohne Digest, ein abgelaufener Release oder ein
nicht zum Quellstand passendes Image ist `NO-GO`.

Das Image enthält keine Nutzer-, Einladungs- oder Zugangsdaten. Seine
Aufbewahrung und gezielte Entfernung werden deshalb releasebezogen entschieden,
nicht nach jedem einzelnen Nutzerlauf. Spätestens nach Ablösung, Ablauf der
Freigabe und Ende der vereinbarten Nachweisfrist wird exakt der nicht mehr
benötigte Digest entfernt.

## 2. Kurzlebige Identität und IAM bereitstellen

Vor jedem schreibenden Befehl Projekt, Cluster, Region und Namespace read-only
anzeigen und gegen das Abnahmeprotokoll prüfen. Danach
`serviceaccount.yaml` und `networkpolicy.yaml` anwenden. Dem daraus abgeleiteten
Workload-Identity-Principal werden für höchstens 24 Stunden diese Basisrollen im
Zielprojekt zugeordnet:

- `roles/container.clusterViewer`
- `roles/cloudasset.viewer`
- `roles/cloudsql.viewer`
- `roles/cloudsql.client`

`roles/cloudsql.viewer` deckt zugleich die Projekt-, Instanz- und
Backupkonfigurations-Leseprüfung ab. Im wartungsgebundenen Vertrag umfasst sie
zusätzlich die Prüfung des konkreten Voränderungs-Backups. Dort muss nach der
Zuordnung `npm run check:pre-gematik-migration-gcp` mit derselben Identität
erfolgreich sein. Im Online-Neunutzervertrag rufen `guest-preview` und
`guest-apply` stattdessen automatisch das getrennte Online-Gate auf und
sind nur nach dessen erfolgreicher Prüfung ausführbar; der
`check:pre-gematik-migration-gcp`-Befehl wird nicht als Ersatz dafür verwendet.
Es wird weder eine Schlüsseldatei noch ein GSA-Key angelegt.

Nur während `guest-preview` und `guest-apply` erhält derselbe Principal diese
beiden zusätzlichen Rollen:

- `roles/identitytoolkit.viewer`
- `roles/serviceusage.serviceUsageConsumer`

Aus `roles/identitytoolkit.viewer` wird `firebaseauth.users.get` für den
doppelten UID-/E-Mail-Readback benötigt. Die Rolle erlaubt in diesem Ablauf
keine Kontenanlage, Link-Erzeugung oder Änderung. Aus
`roles/serviceusage.serviceUsageConsumer` wird ausschließlich
`serviceusage.services.use` benötigt, damit der Identity-Toolkit-Aufruf das
bestätigte Zielprojekt als Consumer für Quota und Abrechnung verwenden darf.

Beide Gastrollen werden unmittelbar vor dem ersten `guest-preview` zugeordnet
und unmittelbar nach dem letzten Gast-Readback wieder entfernt. Sie gelten
nicht für Identity-Phasen. Die abschließende IAM-Prüfung bestätigt ihre
Abwesenheit erneut.

## 3. Phasenminimale geschützte Eingaben

[`config/pre-gematik/migration.env.example`](../../config/pre-gematik/migration.env.example)
ist ausschließlich eine Namens-Checkliste für eine lokale Shell. Für Kubernetes
wird außerhalb des Repositorys eine separate Env-Datei in einem Verzeichnis mit
Modus `0700` angelegt; die Datei selbst hat Modus `0600` und wird nie in Git
übernommen.

Die Kubernetes-Datei verwendet exakt das von `kubectl --from-env-file`
erwartete Format `KEY=VALUE`. Werte besitzen keine äußeren Shell-Anführungszeichen.
Sonderzeichen in Datenbank-URLs werden korrekt percent-encodiert. Die gemeinsame,
für eine lokale Shell gedachte Beispieldatei darf deshalb nie unverändert an
`kubectl` übergeben werden.

Gemeinsame Werte jeder Phase sind:

```text
MIGRATION_OPERATOR_PHASE=identity-preview
CLOUD_SQL_AUTH_PROXY_SHA256=sha256:<PIN-DES-IMAGE-PROXYS>
CLOUD_SQL_AUTH_PROXY_CONNECT_MODE=private-ip
```

### Identity-Phasen

Die separat erzeugte `identity-operator.env` enthält ausschließlich die
geschützte Loopback-Credential-Vorlage des kurzlebigen Logins und den
Ziel-Fingerprint. Der Login muss exakt der `NOLOGIN`-Rolle
`vk_identity_admin` zugeordnet sein. `postgres`, `cloudsqlsuperuser` oder
weitere Mitgliedschaften werden abgewiesen. Vorbereitung, Prüfung und Cleanup
stehen im
[Identity-Admin-Runbook](../../dokumentation/betrieb-und-deployment/PRE_GEMATIK_IDENTITY_ADMIN.md).

Für `identity-apply` kommen die unmittelbar geprüften Preview-Bestätigungen in
die phasenminimale `operator.env`:

```text
CONFIRM_IDENTITY_PREVIEW_FINGERPRINT=sha256:<EINGABE-FINGERPRINT>
CONFIRM_IDENTITY_CURRENT_STATE_FINGERPRINT=sha256:<IST-FINGERPRINT>
CONFIRM_IDENTITY_BINDING_COUNT=1
CONFIRM_IDENTITY_ACTIVE_BINDING_COUNT=1
ALLOW_IDENTITY_SUBJECT_REMAPS=false
```

Ein Subject-Remap setzt `ALLOW_IDENTITY_SUBJECT_REMAPS=true` in Preview und
Apply. Nur Apply erhält zusätzlich den exakt geprüften positiven
`CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT`. Der Wert `0` ist ausschließlich für den
separat geprüften, vollständig unveränderten Post-Apply-No-op zulässig.

Die Environment-Eingabe wird create-only aus zwei getrennten owner-only Dateien
zusammengesetzt:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-environment \
  --from-env-file=/ABSOLUT/GESCHUETZT/operator.env \
  --from-env-file=/ABSOLUT/GESCHUETZT/identity-run/identity-operator.env

kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=iap-bindings.json=/ABSOLUT/GESCHUETZT/iap-bindings.json
```

### Guest-Phasen

`guest-preview` und `guest-apply` verwenden stattdessen die owner-only,
create-only mit
[`prepare_pre_gematik_test_access_operator.mjs`](../../scripts/prepare_pre_gematik_test_access_operator.mjs)
erzeugte `test-access-operator.env` sowie die getrennte
`identity-platform-readback.env`. Der Datenbanklogin muss exklusiv
`vk_access_enrollment_admin` erben. Der Operator setzt den Repository-Anker
selbst auf `/workspace` und überschreibt das erwartete Identity-Platform-Projekt
mit `EXPECTED_TARGET_PROJECT_ID`. Dieser Wert muss zusätzlich exakt
`GCP_PROJECT_ID` des GCP-/Backup-Gates entsprechen.

Die phasenminimale `operator.env` enthält Gate, Proxy-Pin, Zielprojekt, Phase,
Modus und nur bei Apply die bestätigten Gast-Fingerprints. Sie enthält keine
Identity-Admin- oder anderen phasenfremden Credentials. Für Standard-Prebinding
und Anzeigename-Reconcile gehört das konkrete `PRE_IMPORT_BACKUP_ID` zum Gate.
Im Online-Neunutzer-Modus bleibt es ungesetzt; dort prüft der automatisch
ausgewählte Online-Gate stattdessen aktivierte automatische Backups und PITR,
positive Aufbewahrungswerte und einen aktuellen erfolgreichen automatischen
Recovery-Punkt. Die geschützte Gastoperator-Ausgabe enthält dazu unter
`online_onboarding_gate` die Policy, den Gate-Fingerprint, die geprüfte
Recovery-Posture und den Recovery-Punkt; dieser nicht personenbezogene
Gate-Nachweis wird zusammen mit den Fachfingerprints gesichert.
Zusammengeführt werden exakt diese drei Dateien:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-environment \
  --from-env-file=/ABSOLUT/GESCHUETZT/operator.env \
  --from-env-file=/ABSOLUT/GESCHUETZT/access-run/test-access-operator.env \
  --from-env-file=/ABSOLUT/GESCHUETZT/identity-platform-readback.env

kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=guest-access.json=/ABSOLUT/GESCHUETZT/guest-access.json
```

Die Gastphasen verlangen beide Schalter
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND` und
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND`; beide Schalter
akzeptieren exakt `true` oder `false` und sind gegenseitig ausgeschlossen. Die
fail-closed Standardbelegung ist für beide Werte ausdrücklich `false`. Dann ist
nur das unveränderte Prebinding auf ein in allen geprüften Kernfeldern passendes
Bestandsprofil aktiv.

`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` bei gleichzeitigem
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false` exponiert
ausschließlich `--create-profile-and-prebind` und leitet für Apply die Operation
`CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` ab. Dieser Modus
ist nur für einen vollständig leeren relevanten Profil- und Binding-Zustand
zulässig und ist der einzige Online-Modus. Mit umgekehrten Werten erlaubt der
Operator ausschließlich den wartungsgebundenen, separat geprüften
Anzeigename-Reconcile bei gleicher Profil-ID, E-Mail und Rolle sowie noch nicht
vorhandenem Binding und Enrollment-Request. Zwei aktive Modi, andere
Profiländerungen, ein Teilzustand oder ein Moduswechsel zwischen Preview und
Apply sind `NO-GO`.

Bei Apply muss `CONFIRM_GUEST_ACCESS_OPERATION` exakt aus demselben Preview
übernommen werden. Hinzu kommen
`CONFIRM_GUEST_ACCESS_INPUT_FINGERPRINT` und
`CONFIRM_GUEST_ACCESS_CURRENT_STATE_FINGERPRINT`. Der Operator vergleicht die
unabhängige Operationsbestätigung mit dem aus dem Modus abgeleiteten Namen.

Alle Secrets werden ohne Ausgabe ihres Inhalts create-only angelegt. Bewusst
kein `kubectl apply`: So entsteht keine zusätzliche last-applied-Annotation mit
einer weiteren base64-Kopie der Secret-Daten. Ein vorhandenes gleichnamiges
Secret bedeutet Abbruch; es wird nie stillschweigend wiederverwendet.
Secret-Inhalte werden nicht mit `kubectl get`, `describe`, Shell-Ausgabe oder
allgemeinen Logs inspiziert.

## 4. Preview, Apply und Readback

Vor jeder Phase werden der vorherige Job und die beiden kurzlebigen Secrets erst
nach gesicherter Evidenz gezielt gelöscht. Danach werden nur die Eingaben der
neuen Phase create-only bereitgestellt. Das Job-Manifest wird lokal fail-closed
gegen Zielprojekt, Region und Image-Digest gerendert:

```bash
node deploy/migration-operator/render-job.mjs \
  --image REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:IMAGE-DIGEST \
  --project PROJEKT \
  --region REGION \
  | kubectl apply --filename=-
```

### Identity-Vertrag

1. `identity-preview` zweimal mit demselben vollständigen
   `iap-bindings.json` ausführen. Eingabe-, Ist- und Soll-Fingerprint, Operation
   und Zähler müssen identisch sein.
2. `identity-apply` genau einmal mit Fingerprints, Gesamtzahl, Zahl aktiver
   Bindungen und gegebenenfalls dem bestätigten positiven Remap-Zähler aus
   diesem Preview ausführen.
3. Danach ein neues `identity-preview` ausführen. Erwartet wird der vollständige
   neue Zustand ohne Drift. Bei einem Remap muss `remap_count=0` gelten.
4. Der ausdrücklich bestätigte No-op verwendet den neuen Ist-Fingerprint und
   bei aktiviertem Remap `CONFIRM_IDENTITY_SUBJECT_REMAP_COUNT=0`. Er darf kein
   `INSERT` oder `UPDATE` erzeugen. Ein letzter Preview bleibt unverändert.

Der vollständige Rollback-Roster wird vor einem Subject-Remap als unveränderter
No-op und nach dem Apply zweimal als tatsächlicher Rückweg previewt. Ein
positiver Remap-Zähler darf nie durch `0` bestätigt werden.

### Wartungsgebundener Guest-Vertrag

1. `guest-preview` zweimal mit demselben `guest-access.json` und demselben
   Standard- oder Reconcile-Modus ausführen. Eingabe-, Ist- und
   Soll-Fingerprint, Operation, Ergebnis und Zähler müssen identisch sein.
2. `guest-apply` genau einmal mit Operation, Eingabe-Fingerprint und
   Ist-Fingerprint aus diesem Preview ausführen.
3. Danach ein neues `guest-preview` ausführen. Erwartet werden
   `result=unchanged`, ein vollständiges Profil-Binding und identische Ist- und
   Soll-Fingerprints. Im Reconcile-Modus muss zusätzlich der Anzeigename
   passen.
4. Der ausdrücklich bestätigte No-op verwendet in derselben `guest-apply`-Phase
   den neuen Ist-Fingerprint aus Schritt 3. Er muss `result=unchanged` liefern
   und darf weder ein Profil aktualisieren noch ein Binding anlegen. Ein letzter
   Preview bleibt unverändert.

### Online-Neunutzervertrag

Nur der Modus `GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` bei gleichzeitig
deaktiviertem Anzeigename-Reconcile darf bei laufender Anwendung ausgeführt
werden. Sein Ablauf ist bewusst genau begrenzt:

1. Ein `guest-preview` mit dem owner-only `guest-access.json` und dem
   Online-Neunutzer-Modus muss `result=create_profile_and_binding`, einen
   vollständig leeren relevanten Istzustand sowie stabile Eingabe-, Ist- und
   Soll-Fingerprints melden.
2. Genau ein fachlich bestätigter `guest-apply` übernimmt Operation,
   Eingabe-Fingerprint und Ist-Fingerprint aus diesem Preview. Er legt Profil
   und aktive `test_only`-Bindung in derselben serialisierbaren Transaktion an.
3. Ein neuer `guest-preview` mit unverändertem Modus muss
   `result=unchanged`, das vollständige Profil-Binding und identische Ist- und
   Soll-Fingerprints melden. Erst dieser Readback schließt die Anlage ab und
   öffnet das Mail-Gate.

Ein zweiter No-op-Apply gehört ausdrücklich nicht zum Online-Vertrag. Die
laufende Anwendung wird weder gesperrt noch skaliert; konkurrierende
Onboarding-/Enrollment-Schreibvorgänge werden durch Transaktion, Advisory Lock,
Fingerprints und Datenbank-Constraints fail-closed serialisiert.

Die Wiederholungen des Wartungsvertrags sind bestätigte No-ops nach einem
erfolgreichen Readback und keine automatischen Retries. Bei unbekanntem
Commit-Ausgang oder fehlender Evidenz wird Apply in keinem Modus blind
wiederholt. Zuerst ermittelt eine neue Preview-Phase den tatsächlichen Zustand;
im Online-Neunutzervertrag entscheidet ausschließlich dieser vollständige
Readback über den bereits erreichten Zustand und das weitere Vorgehen.
Standardmodus, Anzeigename-Reconcile, Neunutzeranlage und Widerruf werden nicht
gegeneinander ausgetauscht; der
Operator exponiert `--create-profile-and-prebind` ausschließlich bei explizitem
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` und gleichzeitig deaktiviertem
Anzeigename-Reconcile. `--revoke` bleibt nicht exponiert.

### Resumierbarer Prepare-Lauf bis `READY_TO_SEND`

Der lokale Orchestrator
[`orchestrate_pre_gematik_online_onboarding.mjs`](../../scripts/orchestrate_pre_gematik_online_onboarding.mjs)
fasst die freigegebenen Einzelwerkzeuge zu einem technischen Lauf zusammen. Er
ist ausschließlich für einen vollständig neuen Gast vorgesehen und hart auf
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` sowie
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false` begrenzt. Er
besitzt keinen Pfad für Bestandsprofile, Anzeigename-Reconcile, Remap, Widerruf,
`admin`, `standard` oder einen wartungsgebundenen Fallback.

Die Anwendung bleibt während des gesamten Laufs erreichbar: Es gibt keinen
App-Lock, keine Downtime, und der Orchestrator skaliert oder sperrt weder
Frontend noch API. Er setzt kein `PRE_IMPORT_BACKUP_ID` und verwendet
stattdessen ausschließlich das oben
beschriebene Online-Gate. Bei abweichendem Modus, Teilzustand oder fehlendem
Recovery-Nachweis stoppt er fail-closed.

Alle personenbezogenen Eingaben, aufgelösten Konfigurationen, Journale,
Evidenzen, Links und Mailartefakte liegen in einem bereits vorhandenen
Verzeichnis mit Modus `0700` außerhalb des Git-Worktrees. Dateien sind
owner-only mit Modus `0600`; Symlinks und zusätzliche oder widersprüchliche
Konfigurationsschlüssel werden abgewiesen. Die phasenminimale Umgebung wird aus
[`online-onboarding.env.example`](../../config/pre-gematik/online-onboarding.env.example)
aufgelöst. Der Identity-Platform-Readback-Key bleibt in einer getrennten
owner-only Env-Datei, die SMTP-Zugangsdaten in der bereits dokumentierten
owner-only JSON-Datei.

Ein read-only Planlauf erzeugt den über Account-, Gastzugriffs-, Ziel- und
Operator-Release-Fingerprint gebundenen Bestätigungswert:

```bash
node scripts/orchestrate_pre_gematik_online_onboarding.mjs \
  --account-input /ABSOLUT/GESCHUETZT/identity-platform-account.json \
  --guest-access-input /ABSOLUT/GESCHUETZT/guest-access.json \
  --operator-release /ABSOLUT/GESCHUETZT/online-onboarding-operator-release.json \
  --operator-environment /ABSOLUT/GESCHUETZT/online-onboarding.env \
  --identity-readback-environment /ABSOLUT/GESCHUETZT/identity-platform-readback.env \
  --smtp-config /ABSOLUT/GESCHUETZT/smtp.json \
  --run-directory /ABSOLUT/GESCHUETZT/ONBOARDING-RUN
```

Nach fachlicher Prüfung führt genau ein bestätigter Apply-Befehl ohne weitere
manuelle Kubernetes-Zwischenschritte bis zur versandbereiten Mail:

```bash
node scripts/orchestrate_pre_gematik_online_onboarding.mjs \
  --account-input /ABSOLUT/GESCHUETZT/identity-platform-account.json \
  --guest-access-input /ABSOLUT/GESCHUETZT/guest-access.json \
  --operator-release /ABSOLUT/GESCHUETZT/online-onboarding-operator-release.json \
  --operator-environment /ABSOLUT/GESCHUETZT/online-onboarding.env \
  --identity-readback-environment /ABSOLUT/GESCHUETZT/identity-platform-readback.env \
  --smtp-config /ABSOLUT/GESCHUETZT/smtp.json \
  --run-directory /ABSOLUT/GESCHUETZT/ONBOARDING-RUN \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project PROJEKT \
  --confirm-operation PREPARE_PRE_GEMATIK_ONLINE_GUEST \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PLAN
```

Der Lauf automatisiert in dieser festen Reihenfolge:

1. die beiden identischen create-only Account-Previews und genau einen
   bestätigten Account-Apply; der dabei technisch erzeugte native Reset-Link
   wird direkt nach dem exakten Account-Readback gelöscht und bleibt vom
   Mailpfad ausgeschlossen,
2. die create-only Vorbereitung genau eines kurzlebigen
   `vk_access_operator_*`-Logins und der sechs dokumentierten temporären
   Projektrollen,
3. genau einen Online-`guest-preview`, genau einen mit dessen Operation und
   Fingerprints bestätigten `guest-apply` und genau einen unveränderten
   Post-Apply-Preview,
4. die automatische geschützte Evidenzübergabe einschließlich Bestätigung,
5. den vollständigen und read-only bestätigten Job-, Secret-, Datenbanklogin-
   und IAM-Cleanup,
6. Einladungs-Preview und create-only Vorbereitung des weiterhin inerten
   Wrapperlinks,
7. Mail-Preview, create-only Rendering und Sender-Preview sowie
8. den Endzustand `READY_TO_SEND` mit `mail_sent=false` und genau einem
   `mail_fingerprint`.

Das owner-only Journal wird crash-atomar, create-only und monoton
fortgeschrieben: Ein vollständig synchronisierter Zwischenstand wird erst
danach ohne Überschreiben als finaler Hashketten-Eintrag veröffentlicht. Es bindet
Eingaben, Release, Phasenevidenz und die UIDs der kurzlebigen Ressourcen, aber
keine Passwörter, API-Keys oder Linktokens. Ein verteilter create-only Lock
verhindert parallele Nutzung der festen Operator-Ressourcen. Mit denselben
Eingaben, Bestätigungen und zusätzlichem `--resume` darf der Lauf nach einem
sicheren Abbruch am ersten noch nicht abgeschlossenen Schritt fortgesetzt
werden. Ein Resume wiederholt keinen Apply blind: Bei unbekanntem Account- oder
COMMIT-Ausgang folgt zuerst der jeweils vorgeschriebene exakte Readback;
Teilzustände und unbekannte Einladungs- oder SMTP-Ausgänge bleiben blockiert.
Unvollständige lokale Datenbankzugangsverzeichnisse werden vor ihrer
Veröffentlichung entfernt. Auch ein bereits protokolliertes `READY_TO_SEND`
wird beim Resume durch einen neuen Sender-Preview gegen den gespeicherten
Mailfingerprint geprüft. Ein vollständig lesbarer lokaler Takeover eines
nachweislich beendeten Prozesses wird automatisch und ohne lockfreies Fenster
fortgeführt; fremde oder unlesbare Lockdateien bleiben fail-closed.

Die Anlage des kurzlebigen Cloud-SQL-Logins wird als asynchrone
`CREATE_USER`-Operation ausgeführt. Vor dem API-Aufruf entsteht im geschützten
Zugangsverzeichnis ein create-only Intent; die exakt auf Projekt, Instanz und
Loginfingerprint geprüfte Operation-ID wird unmittelbar danach ebenfalls
create-only verankert. Die einzige freigegebene Datenbankrolle wird atomar in
dieser Operation gesetzt; ein nachgelagerter `UPDATE_USER`-/`assign-roles`-Aufruf
ist ausgeschlossen. Erst ein terminaler Operations-Readback erlaubt die
weitere Gastphase. Ist der serverseitige Create-Ausgang nach einem lokalen
Abbruch noch unbekannt, bleiben Zugangsverzeichnis und Cluster-Lock erhalten.
Ein Resume wartet die gespeicherte Operation ab beziehungsweise löscht einen
später sichtbar gewordenen Login; ein einmaliges `absent` ohne Operation-ID ist
kein ausreichender Cleanup-Nachweis.

Besitzt ein exakt zum Journal gehörender Cluster-Lock weniger als 15 Minuten
IAM-Restlaufzeit oder ist der gebundene Operator-Release inzwischen
abgelaufen, wechselt ein bestätigtes `--resume` automatisch in den Zustand
`CLEANUP_COMPLETED_RESUME_REQUIRED`. In diesem Modus werden ausschließlich
Job, Secrets, temporäre IAM-Bindungen und der Cloud-SQL-Login bereinigt. Es
starten weder Account-, Gast-, Einladungs-, Rendering- noch Mailphasen. Bei
noch aktivem Release kann danach ein weiterer identischer Resume einen frischen
Lock anlegen; bei abgelaufenem Release ist zuerst eine neue fachliche
Release-Freigabe erforderlich.

Jeder Resume beginnt dafür mit dem minimalen Ziel- und Ownership-Preflight.
Erst nach dem Lock-Readback und nur bei ausreichendem Zeitfenster folgt der
vollständige Vorwärts-Preflight für Quellstand, Image und Bucket. Diese Reihenfolge
verhindert, dass ein für neue Fachphasen relevantes Gate die notwendige
Restbereinigung blockiert.

Der Orchestrator kann niemals selbst versenden und `--resume` überschreitet
`READY_TO_SEND` nicht. Erst eine davon getrennte, persönliche Bestätigung des
angezeigten Mail-Fingerprints autorisiert den unveränderten
[`send_pre_gematik_guest_welcome_email.mjs`](../../scripts/send_pre_gematik_guest_welcome_email.mjs)-Apply.
Die 48-Stunden-Laufzeit beginnt weiterhin erst mit der bestätigten
SMTP-Annahme.

Bei gesundem Zielkontext und bereits freigegebenem, lokal beziehungsweise auf
dem GKE-Knoten verfügbarem Image ist für den Prepare-Lauf eine typische
Zielspanne von vier bis acht Minuten vorgesehen. Sie ist kein Grund, Gates,
Evidenz oder Cleanup zu überspringen und keine Garantie bei Image-Pull,
Infrastrukturfehlern oder notwendiger Reconciliation.

## 5. Geschützte Evidenzübergabe

Der Operator schreibt `status.json` und das owner-only Phasenlog. Danach hält
er den Container maximal 15 Minuten ausschließlich für die geschützte
Evidenzübergabe offen. Den exakten Podnamen read-only ermitteln und das gesamte
Ergebnisverzeichnis in einen neuen, vorher nicht vorhandenen lokalen
Phasenordner kopieren:

```bash
kubectl --namespace pre-gematik get pods \
  --selector=job-name=vk-pre-gematik-migration-operator

kubectl --namespace pre-gematik cp \
  PODNAME:/protected-output/run \
  /ABSOLUT/GESCHUETZT/PHASE-RUN
```

Erst nach lokaler Prüfung von Besitzer, Modus, `status.json`, Phasenlog und
Vollständigkeit wird genau im noch laufenden Container die leere
Übergabebestätigung mit Modus `0600` angelegt:

```bash
kubectl --namespace pre-gematik exec PODNAME -- \
  sh -c 'umask 077; : > /protected-output/run/.evidence-collected'

kubectl --namespace pre-gematik wait \
  --for=condition=complete \
  --timeout=120s \
  job/vk-pre-gematik-migration-operator
```

Wenn `status.json` `succeeded: false` meldet, ist anschließend `Failed` statt
`Complete` zu erwarten. Die Evidenz wird trotzdem zuerst gesichert und
bestätigt. Ohne Bestätigung endet der Job nach 15 Minuten fail-closed. Das ist
kein Grund für einen ungeprüften Wiederholungsversuch.

## 6. Vollständiger Cleanup

Nach erfolgreicher Abnahme, spätestens nach 24 Stunden:

1. exakt `job/vk-pre-gematik-migration-operator` löschen,
2. exakt die Secrets `vk-pre-gematik-migration-environment` und
   `vk-pre-gematik-migration-input` löschen,
3. den kurzlebigen Cloud-SQL-Identity-Login und bei Gastphasen exakt den in
   `test-access-operator-name.txt` gepinnten `vk_access_operator_*`-Login
   löschen; read-only bestätigen, dass die verbleibenden Mitgliedschaften der
   Rollen `vk_identity_admin` und `vk_access_enrollment_admin` dem geprüften
   Rollenvertrag entsprechen,
4. alle temporären Projekt-IAM-Zuordnungen vom dedizierten Principal entfernen;
   nach Gastphasen ausdrücklich `roles/identitytoolkit.viewer` und
   `roles/serviceusage.serviceUsageConsumer` entfernen und ihre Abwesenheit in
   der erneut gelesenen IAM-Policy bestätigen,
5. im normalen Phasencleanup
   `networkpolicy/vk-pre-gematik-migration-operator` und
   `serviceaccount/vk-pre-gematik-migration-operator` löschen,
6. den wiederverwendbaren Operator-Image-Digest erst nach Ablösung oder Ablauf
   seiner Release-Freigabe und der vereinbarten Nachweisfrist gezielt aus der
   Registry entfernen; nie ein anderes Image über einen Tag-Selektor löschen,
7. geschützte Credential-Dateien vernichten und Abnahmenachweise gemäß der
   dokumentierten Aufbewahrung geschützt behalten.

Für den bis 30. September 2026 verlängerten Pilot ist derzeit ausdrücklich nur
eine inerte Kompatibilitätsausnahme für ServiceAccount und NetworkPolicy
dokumentiert. Es bestehen dazu weder Job noch Operator-Secrets oder Pods. Vor
jeder erneuten Phase muss die NetworkPolicy dem aktuellen Access-Vertrag ohne
direkten PostgreSQL-Egress entsprechen. Ohne erneute Aufbewahrungsentscheidung
werden auch diese beiden Kompatibilitätsressourcen spätestens beim Pilot-Cleanup
entfernt. Temporäre Projekt-IAM-Zuordnungen und kurzlebige Logins sind von dieser
Ausnahme nie umfasst.

Der Anwendungs-Deployment-Workflow kennt und startet diesen Operator nicht.
