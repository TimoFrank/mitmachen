# Einmaliger GKE-Migrationsoperator

Dieser Operator ist der eng begrenzte Ausführungsweg für die einmalige Migration
von Supabase nach `pre-gematik`, wenn Cloud SQL ausschließlich eine private IP
hat. Nach dem Datenimport führt derselbe gehärtete Ausführungsweg auch die
getrennten IAP-Identity-Preview-/Apply-Phasen aus. Er läuft als kurzlebiger Job
im GKE-Netz und ist **kein** Bestandteil des
Anwendungs-Deployments. Weder Job noch ServiceAccount oder Migrations-Secrets
dürfen nach der Abnahme bestehen bleiben.

Der lokale Standard des verwalteten Cloud SQL Auth Proxy bleibt `sql-data`.
Nur der Job setzt über die Umgebungsvariable
`CLOUD_SQL_AUTH_PROXY_CONNECT_MODE=private-ip` den privaten IP-Pfad. Jeder
andere Wert wird vor einem Datenbankzugriff abgewiesen. Preview und Apply
verwenden im Cluster denselben binär und per SHA-256 gepinnten Proxy sowie den
frischen GCP-/Backup-Gate.

## Sicherheitsgrenzen

- Das Operator-Image wird nur als AMD64-Image mit unveränderlichem Digest aus
  der regionalen Artifact Registry des Zielprojekts akzeptiert.
- Der Container läuft als UID/GID `65532`, ohne Linux-Capabilities, ohne
  Privilege Escalation und mit schreibgeschütztem Root-Dateisystem.
- Secret-Projektionen werden vor Benutzung in ein kurzlebiges Volume kopiert.
  Erst die Kopie gehört dem Operator und hat Modus `0600`; das erfüllt die
  bestehenden Schutzprüfungen für CA, Storage-Apply-Manifest und das optionale
  Logo-Remediation-Bundle. Dessen Manifest bestimmt eine begrenzte Liste
  sicherer PNG-Dateinamen; nur diese Dateien werden in ein Verzeichnis mit
  Modus `0700` übernommen und anschließend vollständig gegen Hashes, Snapshot,
  Projektpaar, PNG-Struktur und Renderer-Beleg geprüft.
- Ergebnisdateien liegen unter `/protected-output/run`, gehören dem Operator
  und haben Modus `0600`. Kubernetes-Logs enthalten nur eine generische
  Erfolgs- oder Fehlermeldung. Ergebnisse müssen vor dem Löschen des Jobs in
  den bereits geschützten lokalen Cutover-Ordner kopiert werden.
- `backoffLimit: 0` verhindert einen automatischen zweiten Importversuch. Ein
  unbekannter Commit-Ausgang wird immer manuell anhand der konkreten Import-ID
  geprüft; der Job wird nicht einfach erneut gestartet.
- Die NetworkPolicy verweigert sämtlichen Ingress und erlaubt nur DNS, HTTPS,
  PostgreSQL auf Port 5432 und die beiden GKE-Metadatenserver-Pfade. Der
  öffentliche PostgreSQL-Egress wird ausschließlich für die gepinnte,
  `verify-full` geprüfte Supabase-Quelle benötigt; Zielprojekt und Zielinstanz
  bleiben unabhängig davon durch Gate und Proxy-Bindung festgelegt.
- Der dedizierte Workload-Identity-Principal erhält nur vorübergehend die unten
  genannten Leserechte und Cloud-SQL-Verbindungsrechte. Er ersetzt niemals die
  Laufzeitidentität der API.

## Harte Startbedingungen

Nicht starten beziehungsweise sofort abbrechen, wenn einer dieser Punkte fehlt:

1. aktueller, verschlüsselter logischer Supabase-Dump im geschützten Ordner,
2. erfolgreicher Restore-Test in einer isolierten Instanz,
3. aktive Schreibsperre der Supabase-Quelle für den finalen Doppellauf,
4. konkretes erfolgreiches Cloud-SQL-Vorimport-Backup,
5. zwei identische Storage-Previews und zwei identische Datenbank-Previews,
6. keine referenzierte Datei in Quarantäne,
7. geprüfte Projekt-, Bucket-IAM-, Proxy- und Daten-Fingerprints,
8. bestätigter Synthetic-Target- und Bootstrap-Profil-Nachweis,
9. ein aus GKE über IPv4 erreichbarer offizieller Supabase-Endpunkt.

Ein bestätigter Quarantäne-Zähler ist kein Ersatz für Punkt 6. Referenzierte
unsichere Dateien werden zuerst bereinigt oder durch sichere, geprüfte Dateien
ersetzt; danach werden Preview und Fingerprints neu erzeugt.

## 1. Image bauen und unveränderlich festlegen

Vom Repository-Root aus wird ausschließlich Linux/AMD64 gebaut:

```bash
docker buildx build \
  --platform linux/amd64 \
  --file deploy/migration-operator/Dockerfile \
  --tag REGION-docker.pkg.dev/PROJEKT/REPOSITORY/vk-migration-operator:RUN-ID \
  --push \
  .
```

Anschließend den Registry-Digest auflösen und nur die Form
`REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:…` weiterverwenden.
Der Proxy-Pin wird aus genau diesem Image, nicht aus einer lokalen anderen
Proxy-Version, ermittelt:

```bash
docker run --rm --platform linux/amd64 \
  --entrypoint sha256sum \
  REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:IMAGE-DIGEST \
  /usr/local/bin/cloud-sql-proxy
```

Das Ergebnis wird als `sha256:<64-hex>` in die geschützte Operator-Env-Datei
übernommen. Tag, Image-Digest und Proxy-Pin werden im Cutover-Protokoll
festgehalten. Das Image wird nicht mit einem beweglichen Tag ausgeführt.

## 2. Dedizierte Identität zeitlich begrenzt bereitstellen

Vor jedem schreibenden Befehl zuerst Projekt, Cluster, Region und Namespace
read-only anzeigen und gegen das Cutover-Protokoll prüfen. Dann
`serviceaccount.yaml` und `networkpolicy.yaml` anwenden. Dem daraus abgeleiteten
Workload-Identity-Principal werden für höchstens 24 Stunden diese Rollen im
Zielprojekt zugeordnet:

- `roles/container.clusterViewer`
- `roles/cloudasset.viewer`
- `roles/cloudsql.viewer`
- `roles/cloudsql.client`

`roles/cloudsql.viewer` deckt zugleich die Projekt- und Backup-Leseprüfung ab.
Nach der Zuordnung muss `npm run check:pre-gematik-migration-gcp` mit derselben
Identität erfolgreich sein. Keine Schlüsseldatei und kein GSA-Key werden
angelegt. Die Storage-Migration nutzt weiterhin ausschließlich den
kurzlebigen, in der Secret-Env bereitgestellten OAuth-Token mit den für den
Cutover benötigten Bucket-Rechten.

## 3. Geschützte Eingaben je Phase bereitstellen

Die bestehende Datei `config/pre-gematik/migration.env.example` dient nur als
Namens-Checkliste. Für Kubernetes wird außerhalb des Repositorys eine
**separate** Env-Datei in einem Verzeichnis mit Modus `0700` angelegt; die Datei
selbst hat Modus `0600` und wird nie in Git übernommen. Sie verwendet exakt das
von `kubectl --from-env-file` erwartete Format `KEY=VALUE`: Werte haben keine
äußeren Shell-Anführungszeichen. Insbesondere stehen die Datenbank-URLs nicht
zwischen `'…'` oder `"…"`; Benutzername, Passwort, CA-Pfad und sonstige
URL-Sonderzeichen sind stattdessen korrekt percent-encodiert. Die gemeinsame,
für eine lokale Shell gedachte Beispiel-Datei darf deshalb nicht unverändert
an `kubectl` übergeben werden. Zusätzlich enthält die Kubernetes-Env-Datei:

```text
MIGRATION_OPERATOR_PHASE=storage-preview
CLOUD_SQL_AUTH_PROXY_SHA256=sha256:<PIN-DES-IMAGE-PROXYS>
CONFIRM_STORAGE_PREVIEW_FINGERPRINT=sha256:<NUR-FUER-STORAGE-APPLY>
CONFIRM_STORAGE_MANIFEST_FINGERPRINT=sha256:<NUR-FUER-DB-APPLY>
CONFIRM_SOURCE_SNAPSHOT_FINGERPRINT=sha256:<NUR-FUER-DB-APPLY>
CONFIRM_QUARANTINED_OBJECT_COUNT=<GEPRUEFTER-ZAEHLER>
CONFIRM_BOOTSTRAP_PROFILE_FINGERPRINT=sha256:<NUR-WENN-PREVIEW-MELDET>
LOGO_REMEDIATION_MANIFEST_PATH=/protected-input/run/logo-remediation-preview.json
LOGO_REMEDIATION_OBJECT_DIRECTORY=/protected-input/run/logo-remediation-objects
CONFIRM_IDENTITY_PREVIEW_FINGERPRINT=sha256:<NUR-FUER-IDENTITY-APPLY>
CONFIRM_IDENTITY_BINDING_COUNT=1
CONFIRM_IDENTITY_ACTIVE_BINDING_COUNT=1
```

Die beiden `LOGO_REMEDIATION_*`-Werte werden nur gesetzt, wenn ein geprüftes
Bundle benötigt wird, und dann immer gemeinsam mit exakt diesen festen Pfaden.
Andere Operator-Pfade sowie nur ein gesetzter Wert werden vor dem Start
abgewiesen. Preview und Apply verwenden dasselbe unveränderte Bundle; dessen
Fingerprint geht in Storage-Snapshot, Storage-Manifest, Zielobjekt-Metadaten
und Recovery-Journal ein.

`SOURCE_DATABASE_URL` muss weiter genau einen Parameter `sslrootcert`
enthalten; der Operator ersetzt nur dessen Pfad durch seine owner-only Kopie.
Wenn der direkte Supabase-Datenbankhost ausschließlich eine IPv6-Adresse
liefert, ist er aus einem normalen IPv4-GKE-VPC nicht erreichbar. Dann wird der
vorher separat getestete offizielle Session-Pooler mit IPv4 und tenantgebundenem
Benutzernamen verwendet. Der bestehende Source-Identity-Guard akzeptiert nur
den exakten Projekthost oder einen offiziellen `*.pooler.supabase.com`-Host mit
passendem Projekt-Suffix im Benutzernamen; TLS bleibt `verify-full`.
`TARGET_DATABASE_URL` bleibt die geschützte Loopback-Credential-Vorlage mit
`sslmode=disable`. Keine Zugangsdaten werden als Kommandozeilenargumente
übergeben.

Für `identity-preview` und `identity-apply` kommt die separat erzeugte
`identity-operator.env` hinzu. Sie enthält ausschließlich die geschützte
Loopback-Credential-Vorlage des kurzlebigen Logins und den Ziel-Fingerprint.
Der Login muss exakt der `NOLOGIN`-Rolle `vk_identity_admin` zugeordnet sein;
`postgres`, `cloudsqlsuperuser` oder weitere Mitgliedschaften werden vom
Provisionierungswerkzeug abgewiesen. Vorbereitung und Cleanup stehen im
[Identity-Admin-Runbook](../../dokumentation/betrieb-und-deployment/PRE_GEMATIK_IDENTITY_ADMIN.md).

Die Env-Datei wird ohne Ausgabe ihrer Inhalte als kurzlebiges Secret angelegt.
Der Befehl muss fehlschlagen, falls ein gleichnamiges Secret noch existiert;
dies verhindert eine unbeabsichtigte Wiederverwendung. Bewusst kein
`kubectl apply`: So entsteht keine zusätzliche last-applied-Annotation mit
einer weiteren base64-Kopie der Secret-Daten.

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-environment \
  --from-env-file=/ABSOLUT/GESCHUETZT/operator.env
```

Für Identity-Phasen wird das Secret stattdessen mit zwei voneinander getrennten
owner-only Dateien erzeugt:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-environment \
  --from-env-file=/ABSOLUT/GESCHUETZT/operator.env \
  --from-env-file=/ABSOLUT/GESCHUETZT/identity-run/identity-operator.env
```

Für Datenbankphasen wird ein zweites Secret angelegt. Beim Apply kommt das
zuvor aus dem Storage-Apply-Job abgerufene Manifest hinzu:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=supabase-root-ca.crt=/ABSOLUT/GESCHUETZT/supabase-root-ca.crt \
  --from-file=storage-apply.json=/ABSOLUT/GESCHUETZT/storage-apply.json
```

Beim Datenbank-Preview wird `--from-file=storage-apply.json=…` ausgelassen.
Für Storage-Phasen darf das Input-Secret nur dann ganz fehlen, wenn kein
Logo-Remediation-Bundle benötigt wird. Andernfalls wird für jeden Storage-Lauf
ein neues Secret erstellt. Es enthält exakt das Manifest und die darin
genannten, bereits visuell geprüften PNG-Dateien; weitere Zwischenstände oder
ursprüngliche SVG/XML/PNG-Dateien werden nicht aufgenommen:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=logo-remediation-preview.json=/ABSOLUT/GESCHUETZT/logo-remediation-preview.json \
  --from-file=01.resvg.png=/ABSOLUT/GESCHUETZT/01.resvg.png \
  --from-file=02.resvg.png=/ABSOLUT/GESCHUETZT/02.resvg.png
```

Die PNG-Zeilen werden vollständig für alle im Manifest genannten
`outputFile`-Werte ergänzt. Die Beispielnamen sind keine fachlichen
Objektnamen. Das Secret muss unter der Kubernetes-Größengrenze bleiben; das
freigegebene Acht-Dateien-Bundle erfüllt diese Bedingung. Der Operator kopiert
nur die im Manifest referenzierten Schlüssel und verwirft keine Prüfung an die
Secret-Projektion.

Identity-Phasen verwenden statt CA, Storage-Manifest und Logo-Bundle
ausschließlich die vollständige, geschützte Soll-Liste:

```bash
kubectl --namespace pre-gematik create secret generic \
  vk-pre-gematik-migration-input \
  --from-file=iap-bindings.json=/ABSOLUT/GESCHUETZT/iap-bindings.json
```

## 4. Phasen ausführen

Verbindliche Reihenfolge nach aktivierter Quell-Schreibsperre:

1. `storage-preview` zweimal; Snapshot- und Manifest-Fingerprint müssen jeweils
   identisch sein. Bei Logo-Remediation müssen zusätzlich Remediation-
   Fingerprint und Anzahl identisch sein und die Quarantäne muss `0` bleiben.
2. `database-preview` zweimal; Source-Snapshot-, Target-Klassifikation- und
   Bootstrap-Profil-Fingerprint müssen jeweils identisch sein.
3. `storage-apply` einmal mit den geprüften Bestätigungswerten und demselben
   unveränderten Logo-Remediation-Bundle.
4. `database-apply` einmal mit dem abgerufenen Storage-Apply-Manifest.
5. `identity-preview` zweimal gegen den importierten Profilbestand; Eingabe-,
   Ist- und Sollzustands-Fingerprint müssen jeweils identisch sein.
6. `identity-apply` einmal mit dem unmittelbar bestätigten Preview-Fingerprint
   sowie der bestätigten Gesamtzahl und Zahl aktiver Bindungen. Für den
   aktuellen persönlichen Pilot sind beide Werte exakt `1`.

Zwischen 4 und 5 wird die statische `NOLOGIN`-Rolle kontrolliert gebootstrappt
und der kurzlebige Login exakt dieser Custom-Rolle zugeordnet. Der Dienst bleibt
bis nach Identity-Abnahme geschlossen. Identity-Phasen benötigen keine
Supabase-Verbindung und kopieren deshalb keine Source-CA; Zielproxy, Instanz-,
Projekt- und Backup-Gate bleiben trotzdem identisch verbindlich.

Für jeden Storage-Lauf wird unmittelbar vorher ein neuer kurzlebiger Google-
OAuth-Access-Token mit ausreichender Restlaufzeit ausgestellt. Der Operator
erneuert ihn nicht automatisch; ein abgelaufener Token führt fail-closed zum
Abbruch und niemals zu einem automatischen Wiederholungsversuch.

Vor jeder Phase das vorherige Job-Objekt und die beiden kurzlebigen Secrets
gezielt löschen, die Env-Datei für die neue Phase aktualisieren und Secrets neu
anlegen. Das Job-Manifest wird lokal fail-closed gegen Zielprojekt, Region und
Image-Digest gerendert:

```bash
node deploy/migration-operator/render-job.mjs \
  --image REGION-docker.pkg.dev/PROJEKT/REPOSITORY/IMAGE@sha256:IMAGE-DIGEST \
  --project PROJEKT \
  --region REGION \
  | kubectl apply --filename=-

kubectl --namespace pre-gematik wait \
  --for=condition=complete \
  --timeout=3600s \
  job/vk-pre-gematik-migration-operator
```

Bei `Failed` nicht erneut starten. Zuerst Status und geschützten Report sichern
und den konkreten Fehler klassifizieren.

## 5. Ergebnisse vor jedem Cleanup abrufen

Den exakten Podnamen read-only aus dem Job ermitteln und das gesamte
owner-only Ergebnisverzeichnis in einen neuen lokalen Phasenordner kopieren:

```bash
kubectl --namespace pre-gematik get pods \
  --selector=job-name=vk-pre-gematik-migration-operator

kubectl --namespace pre-gematik cp \
  PODNAME:/protected-output/run \
  /ABSOLUT/GESCHUETZT/PHASE-RUN
```

Danach lokal Besitzer und Modi prüfen. Erwartet werden `status.json`, das
Phasenlog und bei Storage zusätzlich Preview-/Apply-Manifest sowie beim Apply
das Recovery-Journal. Erst nach Prüfung von `status.json` darf die nächste
Phase vorbereitet werden.

## 6. Vollständiger Cleanup

Nach erfolgreicher Datenbank-Reconciliation und Anwendungsabnahme, spätestens
nach 24 Stunden:

1. exakt `job/vk-pre-gematik-migration-operator` löschen,
2. exakt die Secrets `vk-pre-gematik-migration-environment` und
   `vk-pre-gematik-migration-input` löschen,
3. den kurzlebigen Cloud-SQL-Identity-Login löschen und read-only bestätigen,
   dass `vk_identity_admin` kein Mitglied mehr hat,
4. alle vier temporären Projekt-IAM-Zuordnungen vom dedizierten Principal
   entfernen und die IAM-Policy erneut read-only prüfen,
5. `networkpolicy/vk-pre-gematik-migration-operator` und
   `serviceaccount/vk-pre-gematik-migration-operator` löschen,
6. den Operator-Image-Digest nach der vereinbarten Nachweisfrist aus der
   Registry entfernen; nie ein anderes Image über einen Tag-Selektor löschen,
7. OAuth-Token ablaufen lassen beziehungsweise widerrufen und die beiden
   geschützten Credential-Env-Dateien vernichten; Cutover-Nachweise und
   Recovery-Journal gemäß der
   dokumentierten Aufbewahrung geschützt behalten.

Zum Abschluss müssen die normale API-Workload-IAM-Policy, die vier exakten
Bucket-Policies und das Projekt-IAM wieder dem Vorher-Nachweis entsprechen. Der
Anwendungs-Deployment-Workflow kennt und startet diesen Operator nicht.
