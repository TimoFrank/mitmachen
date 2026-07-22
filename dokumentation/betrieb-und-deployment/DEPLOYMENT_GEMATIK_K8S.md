# Deployment des Gematik-PoC auf Kubernetes

Status: technisches Runbook
Stand: 22. Juli 2026

## Ziel

Dieses Runbook beschreibt den Build und die Bereitstellung eines festgelegten Release Candidates. Software, Daten und Identitäten bleiben getrennte Schritte:

```text
RC-Tag -> Software Factory -> dist/target + API-Image -> Kubernetes
                                      |
                                      +-> Release-Nachweis

geschützter Snapshot -> einmaliger Import -> PostgreSQL
gematik OIDC-Subjects -> geschützte Zuordnung -> Profile
```

GitHub Pages verwendet weiterhin `dist/pages/` und ausschließlich Demo-Daten.

## Führende Artefakte

| Zweck | Pfad |
| --- | --- |
| Jenkins-Pipeline | [`deploy/jenkins/Jenkinsfile.gematik`](../../deploy/jenkins/Jenkinsfile.gematik) |
| Helm-Chart | [`deploy/helm/versorgungs-kompass/`](../../deploy/helm/versorgungs-kompass/) |
| PoC-Konfiguration | [`values-poc-gematik.yaml`](../../deploy/helm/versorgungs-kompass/values-poc-gematik.yaml) |
| Datenbank und Import | [`deploy/postgres/poc-gematik/`](../../deploy/postgres/poc-gematik/) |
| Target-Buildprofil | [`config/target/`](../../config/target/) |

## Plattformwerte

Vor dem ersten Lauf werden folgende Werte in Software Factory oder Plattformkonfiguration hinterlegt:

| Wert | Bedeutung |
| --- | --- |
| `ARTIFACT_REGISTRY`, `API_IMAGE_REPOSITORY` | Ablage des API-Images |
| `FRONTEND_BASE_URL`, `API_BASE_URL` | dieselbe interne HTTPS-Adresse; API-Pfad ist `/api` |
| `FRONTEND_TARGET` | internes Ziel für `dist/target/` |
| `K8S_NAMESPACE` | Namespace des PoC |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | Verbindung zur PoC-Datenbank |
| `DB_PASSWORD_SECRET_NAME` | Referenz auf das verwaltete Datenbankpasswort |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` | Werte zur Prüfung der Anmeldung |
| `OIDC_EMAIL_CLAIM`, `OIDC_SUBJECT_CLAIM` | standardmäßig `email` und `sub` |
| `PROFILE_IMAGE_BUCKET`, `CONTACT_IMAGE_BUCKET` | optional private Buckets für vorhandene Bilder |
| `CONTACT_NOTE_ATTACHMENT_BUCKET`, `STAKEHOLDER_LOGO_BUCKET` | optional private Buckets für vorhandene Anhänge und Logos |

Passwörter, Tokens, private Zertifikate, Daten-Snapshots und OIDC-Subjects werden nicht in Git, Frontend-Dateien, Buildmanifesten oder Helm-Werten abgelegt.

## 1. Release Candidate festlegen

Ein Release Candidate erhält einen annotierten Tag nach dem Muster `poc-v<Version>-rc.<Nummer>`. Der Tag wird nicht verschoben. Jede Korrektur erhält einen neuen Tag.

```bash
git status --short
git checkout poc-v0.1.0-rc.2
git rev-parse HEAD
npm ci
npm run check:poc-rc
```

Der Build startet nur aus einem sauberen Checkout.

## 2. Frontend und API bauen

```bash
API_BASE_URL="https://<interner-origin>" \
TARGET_AUTH_MODE=oidc \
npm run build:target

node scripts/audit_target_assets.mjs --artifact-root dist/target

docker build \
  -f api/Dockerfile \
  -t "<registry>/<repository>:poc-v0.1.0-rc.2" \
  .
```

Nach dem Push werden Frontend-Manifest, Image-Digest, Tag und Commit zusammen festgehalten. Der Datenstand ist bewusst kein Buildartefakt.

## 3. Datenbank und Datenstand vorbereiten

Der PoC verwendet eine dedizierte PostgreSQL-16-Datenbank. Die API verbindet sich ausschließlich mit ihrer eingeschränkten Laufzeitrolle und führt beim Start weder Schemaänderungen noch einen Datenimport aus.

Das [PoC-Datenbank-Runbook](../../deploy/postgres/poc-gematik/README.md) beschreibt die Reihenfolge:

1. Schema und Laufzeitrolle anlegen,
2. freigegebenen Snapshot des aktuellen geschützten Bestands einmalig importieren,
3. Mengen und Prüfsumme ohne Ausgabe personenbezogener Werte abgleichen,
4. gematik-OIDC-Subjects den vorgesehenen Profilen zuordnen und
5. kurzlebige Adminzugänge wieder entfernen.

Der vorhandene Supabase-zu-GCP-Lauf dokumentiert Datenklassen und Prüfungen, ist aber kein direkt ausführbarer Import in eine beliebige gematik-Plattform. Der aktuelle schreibführende Bestand liegt in Cloud SQL. Der Zieladapter wird deshalb erst nach Kenntnis des Datenbankzugangs und des Objektspeichers festgelegt.

## 4. Helm-Konfiguration prüfen

```bash
helm lint deploy/helm/versorgungs-kompass

helm template versorgungs-kompass \
  deploy/helm/versorgungs-kompass \
  -f deploy/helm/versorgungs-kompass/values-poc-gematik.yaml \
  --namespace "<namespace>" \
  --set image.repository="<registry>/<repository>" \
  --set image.digest="sha256:<digest>"
```

Der Plattformadapter ergänzt interne Route, TLS, OIDC-Werte und Secret-Referenzen. Das Chart legt keine Datenbank an und startet keinen Import.

## 5. Bereitstellen

1. Target-Frontend mit dem protokollierten Manifest bereitstellen.
2. API-Image ausschließlich über den protokollierten Digest referenzieren.
3. Helm-Release im vereinbarten Namespace anwenden.
4. Rollout und Containerlogs prüfen.
5. Interne Route für `/` und `/api` aktivieren.

Die Referenzpipeline liegt unter [`deploy/jenkins/Jenkinsfile.gematik`](../../deploy/jenkins/Jenkinsfile.gematik). Namen von Jenkins-Libraries, Credentials und Scannern können an den Plattformstandard angepasst werden.

## 6. Smoke-Prüfung

Mindestens geprüft werden:

```text
GET /api/healthz
GET /api/readyz
GET /api/session
```

Zusätzlich:

- internes Frontend und OIDC-Anmeldung funktionieren,
- Frontend und API verwenden denselben HTTPS-Origin,
- die Anwendung lädt Daten ausschließlich über `/api`,
- eine benannte Lese- und eine Schreibrolle können den vereinbarten Kernablauf nutzen,
- unbekannte oder inaktive Identitäten werden abgewiesen und
- Logs und Nachweise enthalten keine Datensätze, Subjects oder Tokens.

## Release-Nachweis

Für jeden RC werden kompakt festgehalten:

- RC-Tag und Commit,
- Frontend-Manifest,
- API-Image und Digest,
- verwendete PoC-Konfiguration,
- Schema-Digest und Datenrichtlinie,
- Ergebnis der automatisierten Prüfungen und
- Datum und Ergebnis des Smoke-Tests.

Der geschützte Importnachweis nennt separat nur Snapshot-Zeitpunkt, freigegebene Datenklassen, Mengen, Prüfsumme und Ergebnis. `main`, lokale Varianten und GitHub Pages können nach dem Tag weiterentwickelt werden; Änderungen am PoC erfolgen über einen neuen RC.
