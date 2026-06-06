# GCP Step 5.3 Kontaktbilder

Stand: 2026-06-06

Diese Notiz beschreibt Step 5.3 der privaten GCP-Ueberfuehrung. Ziel ist, Kontaktbilder nicht mehr nur als lokale Demo-Assets oder externe URLs zu behandeln, sondern ueber Cloud Storage zentral ablegen zu koennen.

## Ergebnis

```text
Status: umgesetzt und live getestet
```

Umgesetzt:

- Privater Cloud Storage Bucket fuer Kontaktbilder angelegt.
- Cloud Run Service Account bekommt Objektzugriff auf den Bucket.
- API fuer Bildupload, Bildauslieferung und Entfernen ergaenzt.
- Kontaktbilder werden weiterhin ueber `contacts.image_url` referenziert.
- `gs://`-Objekte werden nicht direkt oeffentlich gemacht, sondern ueber Cloud Run ausgeliefert.
- Demo-UI im Kontaktdetail bekommt einen kleinen Upload-/Entfernen-Bereich.

Nicht enthalten:

- Allgemeiner Medienmanager.
- Massenupload.
- Bildzuschneiden oder Bildbearbeitung.
- Cloud CDN.
- Auth/IAP vor Upload und Export.

## GCP-Ressourcen

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00007-l68
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:1438cdd7-be09-4d78-8995-64b30e803731
```

```text
Bucket: gs://versorgungs-kompass-gcp-demo-images-765190393967
Location: EUROPE-WEST3
Storage Class: STANDARD
Public Access Prevention: enforced
Uniform Bucket-Level Access: true
Soft Delete: 7 Tage
Cloud Run Service Account: 765190393967-compute@developer.gserviceaccount.com
Bucket-Rolle: roles/storage.objectAdmin
```

Anlage:

```bash
gcloud storage buckets create gs://versorgungs-kompass-gcp-demo-images-765190393967 \
  --location=europe-west3 \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --soft-delete-duration=7d
```

Bucket-Rechte:

```bash
gcloud storage buckets add-iam-policy-binding gs://versorgungs-kompass-gcp-demo-images-765190393967 \
  --member=serviceAccount:765190393967-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectAdmin
```

## Datenmodell

Es wird kein neues Tabellenfeld benoetigt. Bestehende Felder:

```text
contacts.image_url
contacts.image_source_url
contacts.image_source_label
contacts.image_rights_note
contacts.image_updated_at
contacts.image_updated_by
```

Bei Cloud-Storage-Bildern wird in `contacts.image_url` ein privater Pfad gespeichert:

```text
gs://versorgungs-kompass-gcp-demo-images-765190393967/contact-images/<contact-id>/<timestamp>.<ext>
```

Die API gibt fuer die UI daraus eine App-URL zurueck:

```text
/api/contacts/:id/image
```

Damit bleibt der Bucket privat und die App kann spaeter ueber IAP/SSO abgesichert werden.

## API-Erweiterungen

```text
GET    /api/contacts/:id/image
POST   /api/contacts/:id/image
DELETE /api/contacts/:id/image
```

Erlaubte Bildtypen:

```text
image/jpeg
image/png
image/webp
image/svg+xml
```

Upload-Limit:

```text
2 MB
```

`POST /api/contacts/:id/image` erwartet JSON mit Data-URL oder Base64:

```json
{
  "dataUrl": "data:image/png;base64,...",
  "contentType": "image/png",
  "fileName": "kontakt.png",
  "imageSourceLabel": "Freigegebenes Demo-Bild",
  "imageRightsNote": "Demo-/freigegebenes Bild"
}
```

Der Server schreibt:

- Objekt nach Cloud Storage.
- `contacts.image_url` als `gs://...`.
- Quellen-/Rechtefelder.
- `image_updated_at` und `image_updated_by`.
- Verlaufseintrag `image_update` oder `image_remove`.

## UI-Erweiterung

Im Kontaktdetail, Abschnitt `Bild & Quelle`, gibt es in der GCP-Demo:

- Dateiauswahl.
- Quellenfeld.
- Rechtehinweis.
- Button `Bild hochladen`.
- Button `Bild entfernen`, falls ein Bild vorhanden ist.

## Verifikation

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
```

Noch auszufuehren nach Deployment:

```text
GET /api/healthz -> contactImageBucket gesetzt, Revision versorgungs-kompass-gcp-demo-00007-l68
POST /api/contacts/demo-contact-02/image -> Objekt in Cloud Storage geschrieben
GET /api/contacts/demo-contact-02/image -> Bild ueber Cloud Run, content-type image/svg+xml
DELETE /api/contacts/demo-contact-02/image -> DB-Feld geleert, Objekt geloescht
POST /api/reset-demo -> Seed-Zustand wiederhergestellt
Bucket-Check -> keine aktiven Testobjekte nach Cleanup
Browser-Check Uploadbereich -> sichtbar
Audit -> 0 Vulnerabilities
```

Live-Smoke-Ergebnis:

```text
Upload: /api/contacts/demo-contact-02/image
Storage: gs://versorgungs-kompass-gcp-demo-images-765190393967/contact-images/demo-contact-02/<timestamp>.svg
Proxy: /api/contacts/demo-contact-02/image
Content-Type: image/svg+xml
Cleanup: erfolgreich
```

## Sicherheitshinweis

Der Bucket ist privat. Solange Cloud Run im privaten Test aber oeffentlich erreichbar ist, sind Upload-/Delete-Endpunkte ebenfalls oeffentlich erreichbar. Fuer echte Daten muss vor Step 5.3 in der Organisationsumgebung Zugriffsschutz ueber IAP, interne FQDN/Load-Balancer-Regeln oder SSO geklaert sein.

## Naechster sinnvoller Schritt

Nach Step 5.3:

```text
Step 5.4 Gespeicherte Ansichten
```

Import bleibt weiterhin spaeter, weil Import trotz Backup/Export mehr Validierung und Rollback-Logik braucht.
