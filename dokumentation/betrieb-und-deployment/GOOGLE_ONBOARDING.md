# Neue Zugänge im Google-Betrieb

Dieser Ablauf bereitet vollständig neue E-Mail-/Passwort-Gäste für die
Cloud-Run-Anwendung vor. Konto, aktives Profil und `test_only`-Bindung entstehen
vor der Einladung. Die Rollen bleiben `viewer` oder `editor`; Bestandsprofile,
Rollenwechsel und allgemeiner Echtdatenzugriff sind nicht Teil dieses Ablaufs.
Die selbstständige Registrierung bleibt deaktiviert.

Der lokale Operator endet bei `READY_TO_SEND`. Erst ein gesondert autorisierter
Versand aktiviert den 48-Stunden-Link. Der gematik-Zielbetrieb und der historische
GKE-Operator bleiben getrennt. Der technische Bezeichner `pre-gematik` in den
bestehenden Konto-/Datenbankverträgen bleibt erhalten, damit weder Daten noch
Identitäten umgeschrieben werden müssen.

## Einmalige Betriebsvorbereitung

Vor der ersten Nutzung sind ein freigegebener Operator-Release und dessen
Infrastruktur erforderlich. Ein lokaler Test belegt noch keine Aktivierung.

1. Die Änderung nach den Projektregeln integrieren. Das Operator-Image aus
   diesem sauberen, ausdrücklich freigegebenen Quellcommit für `linux/amd64`
   mit `deploy/google-onboarding/Dockerfile` bauen. `SOURCE_REVISION` muss den
   vollständigen Commit enthalten. Image in die eigene regionale Registry
   übertragen und ausschließlich dessen unveränderlichen Digest verwenden.
   Den SHA-256 des enthaltenen `/usr/local/bin/cloud-sql-proxy` aus diesem
   Image auslesen und zusammen mit Quellcommit und Freigabeende festhalten.
2. Ein eigenes Dienstkonto, beispielsweise `vk-google-onboarding`, verwenden.
   Es benötigt im expliziten Projekt `roles/run.viewer`, `roles/cloudsql.viewer`,
   `roles/cloudsql.client`, `roles/identitytoolkit.viewer` und
   `roles/serviceusage.serviceUsageConsumer`. Es erhält weder Kontoanlage-,
   SMTP-, Secret-Verwaltungs- noch allgemeine Datenbankrechte. Die kurzlebigen
   Secret-Zugriffe erteilt der Operator nur auf das einzelne Eingabesecret.
3. Einen eigenen privaten Bucket in `europe-west3` bereitstellen:
   einheitliche Bucket-Zugriffe, öffentliche Zugriffe verhindert, keine
   Versionierung, kein Soft Delete, keine Retention und keine automatische
   Lebenszykluslöschung. Der Bucket enthält die globale Laufsperre und
   vorübergehende Jobnachweise. Er darf weder der Einladungs- noch ein
   Fachdateibucket sein. Das Job-Dienstkonto erhält ausschließlich
   `roles/storage.objectCreator`, begrenzt auf
   `resource.name.startsWith('projects/_/buckets/BUCKET/objects/results/')`.
   Der menschliche Operator benötigt Lesen, create-only Schreiben und
   generationengebundenes Löschen der Sperre sowie Lesen/Löschen der Nachweise.
4. Der menschliche Operator benötigt die bestehenden Rechte zur administrativen
   Kontoanlage, kurzlebigen Cloud-SQL-Nutzeranlage und Einladungsverwaltung.
   Zusätzlich benötigt er Job-Erstellung/-Ausführung/-Lesen/-Löschen,
   `iam.serviceAccounts.actAs` nur auf dem Operator-Konto sowie Verwaltung
   der kurzlebigen Eingabesecrets. Die bereits geprüfte Datenbankrolle
   `vk_access_enrollment_admin` und deren minimale Grants bleiben unverändert.
   Kein App-Dienstkonto und kein dauerhafter `postgres`-Login wird verwendet.
5. Das bestehende Cloud-Run-Teilnetz und dessen private Verbindung zu Cloud SQL
   nutzen. Keine öffentliche Datenbankadresse, kein neuer GKE-Cluster und kein
   dauerhaft laufender Connector sind erforderlich. Der Operator prüft
   Projekt, Dienstrevisionen, Netz, Datenbank und automatische Sicherungen vor
   jeder Gastphase erneut.

Die Jobs folgen den Google-Verträgen für
[Job-Erstellung](https://docs.cloud.google.com/run/docs/create-jobs),
[Direct VPC Egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
und [Secret-Volumes](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets).
Jede Phase hat genau einen Task, keine automatischen Wiederholungen und ein
Zeitlimit von zehn Minuten. Sensible Eingaben stehen in einem eigenen
Secret-Manager-Secret mit fester Version `1`; die Konsole zeigt keine E-Mails,
Passwörter oder Links. Nach bestätigtem Abschluss werden Job, Secret und
kurzlebiger Datenbanklogin entfernt.

## Eingaben vorbereiten

Ein Verzeichnis außerhalb des Worktrees mit Modus `0700` anlegen; alle Dateien
darin erhalten `0600`. Keine realen Eingaben in Git, Tickets oder allgemeine
Konsolenausgaben kopieren. Die Vorlagen stehen unter
[`config/google-onboarding`](../../config/google-onboarding/).

- `account.json`: Name, kleingeschriebene E-Mail, neue stabile UID und
  unveränderte Rückkehradresse. `email_ownership_verified` erst nach der
  unabhängigen Prüfung der E-Mail-Inhaberschaft auf `true` setzen.
- `guest-access.json`: dasselbe Konto sowie neue Profil-UUID, freigegebene
  Rolle und Testzugangsreferenz. Jede vorhandene Teilzuordnung sperrt die
  Neuanlage; es gibt keine Profilübernahme anhand der E-Mail.
- `operator.env`: Projekt-Pin, vorhandene Datenbank, Netz, Operator-Konto,
  eigener Bucket und die beiden bestätigten Cloud-Run-Revisionen. Den
  Projekt-Pin unabhängig bestätigen; die Vorlage berechnet keine Freigabe.
- `operator-release.json`: Version `2`, Quellcommit, Image-/Proxy-Digest,
  privater Einladungsbucket und Freigabeende. `pilot_end` muss exakt dem
  aktuell ausgelesenen `IAP_EXTERNAL_ACCESS_EXPIRES_AT` der geöffneten
  Anwendung entsprechen. `approved_until` darf diese Frist nicht überschreiten.
- `identity-readback.env`: ausschließlich `IAP_EXTERNAL_AUTH_API_KEY` des
  bestätigten Identity-Platform-Projekts.
- `smtp.json`: vorhandene geschützte Domain-SMTP-Konfiguration entsprechend
  dem [Einladungsvertrag](PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md).

Die Beispiele enthalten absichtlich unvollständige Freigaben. Nicht unverändert
auf reale Systeme anwenden. Bestehende Konten bleiben im gesonderten
administrativen Bestandsprozess.

## Vorschau und Vorbereitung

Aus dem sauberen, zum freigegebenen Operator passenden Worktree:

```bash
npm run onboard:google -- \
  --account-input /geschuetzter/pfad/account.json \
  --guest-access-input /geschuetzter/pfad/guest-access.json \
  --operator-release /geschuetzter/pfad/operator-release.json \
  --operator-environment /geschuetzter/pfad/operator.env \
  --identity-readback-environment /geschuetzter/pfad/identity-readback.env \
  --smtp-config /geschuetzter/pfad/smtp.json \
  --run-directory /geschuetzter/pfad/lauf
```

Die Vorschau liest den Cloud-Zustand, schreibt aber weder Konto noch Profil,
Job, Secret oder Sperre. Ihr Fingerprint bindet die geprüften Eingaben und
den freigegebenen Operator. Für die bestätigte Vorbereitung denselben Befehl
ergänzen um:

```text
--apply
--confirm-environment pre-gematik
--confirm-project BESTAETIGTES_PROJEKT
--confirm-operation PREPARE_PRE_GEMATIK_ONLINE_GUEST
--confirm-fingerprint sha256:FINGERPRINT_DER_VORSCHAU
```

Die Reihenfolge ist Kontoanlage, atomare Profil-/Bindungsanlage im privaten
Cloud-Run-Job, unveränderter Readback, Ressourcenbereinigung, inerte Einladung,
Mail-Rendering und Versandvorschau. Der vorhandene Operator prüft UID und
E-Mail unabhängig, Rollen und Kollisionen; Datenbankänderungen laufen als
Transaktion mit der bestehenden Minimalrolle. Die Vorlage enthält die frisch
aus Cloud Run gelesene Zugangsfrist. `READY_TO_SEND` bedeutet ausdrücklich
`mail_sent=false`.

## Versand und Anmeldung

Erst nach persönlicher Freigabe des Empfängers und konkreten Mailfingerprints
den vorhandenen Sender ausführen. Der zusätzliche Parameter bindet die Mail
erneut an die aktuelle Cloud-Run-Zugangsfrist:

```bash
node scripts/send_pre_gematik_guest_welcome_email.mjs \
  --input /geschuetzter/pfad/account.json \
  --link-file /geschuetzter/pfad/lauf/password-invitation-link.txt \
  --mail-file /geschuetzter/pfad/lauf/welcome-mail/welcome.eml \
  --smtp-config /geschuetzter/pfad/smtp.json \
  --invitation-bucket BESTAETIGTER_EINLADUNGSBUCKET \
  --google-service BESTAETIGTER_ANWENDUNGSDIENST
```

Auch das ist zunächst nur eine Vorschau. Der autorisierte Versand ergänzt
`--apply`, `--confirm-operation SEND_PRE_GEMATIK_GUEST_WELCOME_EMAIL` und
`--confirm-fingerprint sha256:MAILFINGERPRINT`. Der bestehende Versandbeleg
und die 48-Stunden-Aktivierung ab SMTP-Annahme bleiben verbindlich.
Bei zwischenzeitlich geänderter Zugangsfrist wird die alte EML abgewiesen.
Kein automatischer Neuversand und kein nativer Firebase-Link.

Die Person legt über den Link ihr Passwort fest und meldet sich danach über
`https://versorgungs-kompass.de/anmelden` an. Erfolgreiches Passwortsetzen
allein ist kein Nachweis des App-Zugangs. Abschließend Login und erwartete
Rollen-/Testdatenbegrenzung prüfen; die lokalen Link- und Maildateien danach
kontrolliert entfernen.

## Wiederaufnahme und Prüfung

Ein unterbrochener Lauf verwendet dieselben Eingaben und Bestätigungen plus
`--resume`. Das bestehende Journal verhindert eine blinde Wiederholung von
Konto- und Datenbankänderungen. Die globale GCS-Sperre ist create-only und
generationengebunden; ein fremder Lauf oder Host darf sie nicht übernehmen.
Bei laufendem Job, unbekanntem Jobstart oder unbekannter Cloud-SQL-Nutzeranlage
bleiben Ressourcen und Sperre erhalten. Erst nach terminalem Ausführungs-
Readback beziehungsweise eindeutigem Datenbanknachweis kann die Bereinigung
fortgesetzt werden. Eine abgelaufene Freigabe erlaubt nur Restbereinigung.

Die lokale QA umfasst `npm run test:google-onboarding`, die bisherigen Konto-,
Gast-, Journal- und Mailtests, PostgreSQL-16-Transaktionstests, den Containerbau
und `npm run qa:full`. Vor der ersten echten Nutzung fehlt zusätzlich die
Cloud-Abnahme mit synthetischem Konto: Job-Ausführung, private Verbindung,
Rollenbegrenzung, Abbruch/Resume, Cleanup und Einladungs-/Loginprüfung.
Ein grüner lokaler Test ersetzt diese Abnahme nicht.
