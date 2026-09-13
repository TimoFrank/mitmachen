# Versorgungs-Kompass auf einem einzelnen Server

## Zweck und Status

Dieses Verzeichnis beschreibt einen bewusst kleinen Übergangsbetrieb für
ein bis vier namentlich zugelassene Nutzer auf einem Linux-VPS mit 4 GiB RAM.
Der Stack besteht aus Caddy, OAuth2 Proxy, statischem Frontend, Node-API und
PostgreSQL. Datenbank, Objektdaten und lokale Backup-Staging-Dateien liegen
außerhalb des Git-Checkouts unter `STATE_DIR`; das verschlüsselte Backup liegt
in einem getrennten S3-kompatiblen Objektspeicher.

Die Dateien sind eine Betriebsgrundlage, kein automatisch ausgeführtes
Deployment. Insbesondere werden dadurch keine Server bestellt, keine DNS- oder
Google-Einstellungen geändert und keine GCP-Ressourcen abgeschaltet. Ein
produktiver Cutover bleibt eine ausdrückliche Betreiberentscheidung.

Stand 11. September 2026 ist der kontrollierte Datenbank-Migrationsweg lokal
vorbereitet, aber es wurde noch **kein echter Live-Dump exportiert, übertragen
oder auf einem Einzelserver importiert**. Der aktuelle Read-only-Livebefund zu
den vier privaten Datenbuckets ist weiter unten als Momentaufnahme dokumentiert;
auch er ersetzt nicht die erneute Cutover-Prüfung.

Der aktuelle Stand ist ausdrücklich noch **nicht produktionsfreigegeben**. Vor
einem echten Initial-Open fehlen drei externe technische Nachweise: ein über das
Zeitfenster hinaus wirksamer Fence für sämtliche schreibfähigen Quellrollen,
eine autoritative Bucket-Inventur aus dem eingefrorenen Deployment plus
Terraform-State sowie ein DNS-Readback gegen eine vor dem Deployment gebundene
VPS-IP. Die vorhandenen `.conf`-Prüfungen validieren Format, Bindungen,
Nullzählungen, Signatur und Frische, erheben diese drei externen Tatsachen aber
nicht selbst. Bis versionierte Collector-/Fence-Nachweise diese Lücke schließen,
bleibt `API_CUTOVER_MODE=closed`; die dokumentierte Open-Aktion ist kein
Go-live-Freigabenachweis.

Die produktiven Serverpfade sind aus Schutz vor versehentlicher Umberechtigung
kritischer Hostverzeichnisse fest vorgegeben:

- integrierter, sauberer Checkout: `/opt/versorgungs-kompass/current`
- Environment-Datei: `/etc/versorgungs-kompass/single-server.env`
- Secrets: `/etc/versorgungs-kompass/secrets`
- Betriebsdaten: `/var/lib/versorgungs-kompass`

Bei einem anderen Checkout-Pfad müssen die fünf Vorlagen unter `systemd/` vor
der Installation konsistent angepasst werden. `CONFIG_DIR` und `STATE_DIR`
bleiben auch dann unverändert; der Live-Preflight lehnt andere Werte ab.

## Architektur und Grenzen

Der öffentliche Verkehr erreicht ausschließlich Caddy auf Port 80 oder 443.
Caddy stellt Zertifikate automatisch aus und gibt geschützte Pfade an OAuth2
Proxy. Nach erfolgreicher Google-Anmeldung liefert der interne Caddy entweder
das Frontend oder die API aus. Die API erreicht PostgreSQL nur über einen
Unix-Socket; PostgreSQL besitzt weder einen Host-Port noch ein Containernetz.

Die Grenze besteht aus zwei voneinander unabhängigen Prüfungen:

1. OAuth2 Proxy akzeptiert nur Adressen aus `allowed-emails`.
2. Die API akzeptiert nur eine aktive Google-Subject-Bindung zu einem aktiven
   Profil in PostgreSQL.

Eine E-Mail-Adresse in der Gateway-Allowlist erzeugt noch keine
Datenbankbindung. Bestehende IAP-Bindungen dürfen nicht ungeprüft als
Google-OIDC-Bindungen behandelt werden; Issuer und Subject müssen vor dem
Cutover separat und personenbezogen abgeglichen werden.

Der Stack setzt enge Container-Rechte, nur lesbare Dateisysteme, CPU-/RAM- und
Prozessgrenzen sowie gepinnte Fremd-Images ein. Trotzdem gelten folgende
bewusste Einschränkungen:

- Ein einzelner VPS ist ein gemeinsamer Ausfallbereich ohne Hochverfügbarkeit.
- Docker und die systemd-Units laufen root-basiert. Zugriff auf den
  Docker-Socket entspricht praktisch Root-Zugriff.
- Es gibt keinen vorgeschalteten Cloud-WAF- oder DDoS-Schutz.
- Caddy-Request-Logs und API-Request-Logs sind aus Datenschutzgründen
  deaktiviert. Das reduziert zugleich die forensische Detailtiefe.
- Ausgehende Verbindungen werden nach Containernetzen getrennt, aber **nicht
  nach Ziel-Domains freigelistet**. Caddy, OAuth2 Proxy, API und das
  Backup-Werkzeug können über ihre nicht-internen Netze grundsaetzlich andere
  Internetziele erreichen. Eine Domain-Allowlist ist wegen dynamischer
  Google-, ACME-, CDN- und S3-Ziele in diesem Übergangsbetrieb nicht umgesetzt.
- Lokale Daten sind nur so gut gegen physischen Zugriff geschützt wie die
  Datenträger-Verschlüsselung und das Zugriffskonzept des VPS-Anbieters.
- Der Restore-Test prüft Daten und Tabellenmengen in einer getrennten
  PostgreSQL-Instanz. Die Umschaltung eines Restores in den Live-Pfad ist
  absichtlich nicht automatisiert.
- Datei-Uploads sind deaktiviert. Bereits migrierte Objekte können aus dem
  lokalen Objektspeicher gelesen werden, neue Upload-Flows sind nicht Teil
  dieses Betriebsmodus.

## Mindestvoraussetzungen

Empfohlen sind mindestens zwei vCPU, 4 GiB RAM und 40 GiB SSD auf einer
gepflegten Linux-LTS-Version. Vor jedem Deployment verlangt der Preflight
mindestens 5 GiB freien Platz unter `STATE_DIR`. Zusätzlich werden benötigt:

- feste öffentliche IPv4-Adresse; IPv6 nur, wenn es vollständig konfiguriert
  und genauso gefiltert ist,
- aktuelle Docker Engine mit Compose-Plugin,
- Git, Node.js/npm, curl, OpenSSL und `flock` aus `util-linux`,
- ein integrierter, unveränderter `main`-Checkout,
- ein Google-OAuth-Webclient,
- ein separates S3-kompatibles Backup-Ziel mit eigenem Zugriffsschlüssel,
- serverseitige Datenträger-Verschlüsselung beim VPS-Anbieter, soweit
  verfügbar,
- eine zweite, getestete Administrator-Zugangsmöglichkeit beim Anbieter, etwa
  eine Rescue-Konsole.

Die Backups sollten in einer anderen Ausfallzone oder bei einem anderen
Anbieter liegen. Der Backup-Schlüssel benötigt nur den vorgesehenen
Bucket/Präfix. Bucket-Versionierung oder Object Lock schützen zusätzlich vor
versehentlichem oder kompromittiertem Löschen.

## 1. Host und Firewall vorbereiten

Zuerst Docker gemäß der offiziellen Anleitung für die verwendete
Distribution installieren. Keine ungeprüften Convenience-Skripte aus einer
Shell-Pipeline ausführen. Danach Docker für den Boot aktivieren und einen
Reboot-Test einplanen.

Die Firewall wird sowohl beim VPS-Anbieter als auch auf dem Host gesetzt. Der
Sollzustand ist:

| Richtung | Freigabe | Quelle | Zweck |
| --- | --- | --- | --- |
| eingehend | TCP 22 | genau ein vertrauenswürdiges Admin-CIDR | SSH |
| eingehend | TCP 80 | Internet | ACME und HTTPS-Weiterleitung |
| eingehend | TCP 443 | Internet | HTTPS |
| eingehend | UDP 443 | Internet | HTTP/3; kann entfallen, wenn bewusst deaktiviert |
| eingehend | alles andere | keine | blockieren |
| ausgehend | erforderlich | Internet | Google OIDC/JWKS, ACME, S3; bei Updates Git/Registry/npm |

Beispiel für Ubuntu mit UFW; `<ADMIN-CIDR>` muss vor dem Aktivieren ersetzt
werden:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN-CIDR> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Die bestehende SSH-Sitzung offen halten und parallel eine zweite Anmeldung
testen, bevor allgemeine SSH-Regeln entfernt werden. Provider-Firewall und UFW
müssen denselben Sollzustand besitzen. Docker kann Host-Firewallregeln je nach
Distribution über eigene nftables-/iptables-Regeln beeinflussen. Deshalb von
einem externen Netz prüfen, dass ausschließlich 22 vom Admin-CIDR sowie 80 und
443 erreichbar sind. Die internen Ports 4180, 8080 und 5432 dürfen nie am Host
lauschen.

## 2. DNS und Google OAuth vorbereiten

Den DNS-TTL mindestens einen Tag vor dem geplanten Cutover reduzieren. Vor dem
Cutover zeigt die produktive Domain weiterhin auf den alten Dienst. Einen
`AAAA`-Record nur setzen, wenn der neue Host über funktionierendes und
gefiltertes IPv6 verfügt; ein alter oder falscher `AAAA`-Record kann einen Teil
der Nutzer am neuen Server vorbeiführen.

In Google Auth Platform:

1. Branding, Supportkontakt, Zielgruppe und die minimalen Scopes `openid` und
   `email` konfigurieren.
2. Unter Credentials einen OAuth-Client vom Typ **Web application** anlegen.
3. Als autorisierten Redirect exakt
   `https://versorgungs-kompass.de/oauth2/callback` eintragen. Schema, Host,
   Groß-/Kleinschreibung und abschließender Pfad müssen exakt passen.
4. Bei Status **Testing** jede der ein bis vier Personen als Testnutzer
   aufnehmen. Google kann Testautorisierungen nach sieben Tagen ablaufen lassen;
   für zwei bis drei Monate ist daher entweder wiederholte Anmeldung bewusst
   zu akzeptieren oder der passende Produktionsstatus samt den aktuell
   verlangten Branding-/Datenschutzangaben zu klären.
5. Client-ID in die Environment-Datei und Client-Secret ohne Zeilenumbruch in
   die geschützte Secret-Datei übernehmen.

Aktuelle Primärquellen:

- [Google OAuth 2.0 für Webserver-Anwendungen](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth-Richtlinien](https://developers.google.com/identity/protocols/oauth2/policies)
- [Test- und Produktionsstatus](https://support.google.com/cloud/answer/15549945?hl=en)

Der Google-Client ist kein Ersatz für die lokale E-Mail-Allowlist und die
aktive Datenbankbindung. Eine verpflichtende Mehrfaktor-Authentisierung wird
durch diesen Stack selbst nicht erzwungen; sie hängt von den verwendeten
Google-Konten und deren Richtlinien ab.

## 3. Checkout, Environment und Secrets anlegen

Der Checkout unter `/opt/versorgungs-kompass/current` muss auf einem
integrierten Commit von `origin/main` stehen und sauber sein. Das Live-Preflight
ruft `git fetch` auf und bricht bei jeder Abweichung ab. Keine Feature-Branches,
lokalen Patches oder unversionierten Dateien deployen.

Environment-Vorlage installieren und danach Client-ID, externen
`MIGRATION_DIR`, den vorab ermittelten Public-Key-Hash sowie gegebenenfalls den
Legacy-Bucket-Hinweis setzen:

```bash
sudo install -d -m 0700 -o root -g root /etc/versorgungs-kompass
sudo install -m 0600 -o root -g root \
  /opt/versorgungs-kompass/current/deploy/single-server/environment.example \
  /etc/versorgungs-kompass/single-server.env
sudoedit /etc/versorgungs-kompass/single-server.env
sudo install -d -m 0700 -o 70 -g 70 \
  /var/lib/versorgungs-kompass-migration
```

Für den einmaligen Offline-Nachweis des weiterhin geschlossenen GCP-Writers
wird außerhalb des Repositories in der geschützten GCP-Operatorumgebung ein
eigener Ed25519-Schlüssel erzeugt. Der private Schlüssel bleibt dort; nur der
Public Key wird vor dem ersten Deployment verschlüsselt auf den VPS übertragen:

```bash
openssl genpkey -algorithm Ed25519 \
  -out /absolut/geschuetzt/initial-open-source-writer.private.pem
openssl pkey \
  -in /absolut/geschuetzt/initial-open-source-writer.private.pem \
  -pubout \
  -out /absolut/geschuetzt/initial-open-source-writer.public.pem
sha256sum /absolut/geschuetzt/initial-open-source-writer.public.pem
```

Der ausgegebene Hash wird als
`INITIAL_OPEN_SOURCE_WRITER_PUBLIC_KEY_SHA256` in der Environment-Datei
gepinnt. Nach `prepare-host.sh` wird genau dieser Public Key als
`CONFIG_DIR/initial-open-source-writer.public.pem` mit `root:root` und Modus
`0600` installiert. Private Schlüssel, GKE-Kubeconfig, Cloud-SQL-Zugang und
`gcloud`-Credentials werden nie auf den VPS kopiert.

`MIGRATION_DIR` muss ein kanonischer absoluter Pfad außerhalb von Git-Checkout,
`STATE_DIR` und `CONFIG_DIR` sein. `prepare-host.sh` legt ihn absichtlich nicht
an. Die voreingestellte Dump-Grenze beträgt 5 GiB und darf höchstens auf
10 GiB angehoben werden.

Anschließend legt die Host-Vorbereitung Betriebsverzeichnisse sowie zufällige
lokale Datenbank-, Cookie- und restic-Passwörter und den separaten HMAC-
Schlüssel für kurzlebige Identity-Bootstrap-Claims an:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/prepare-host.sh \
  /etc/versorgungs-kompass/single-server.env
```

Die Vorbereitung bricht vor jeder Rechteänderung ab, wenn einer der festen
Eltern-, Daten-, Unter- oder Secret-Pfade ein Symlink, ein nichtkanonischer Pfad
oder ein unerwarteter Dateityp ist. Solche Abweichungen werden nicht automatisch
repariert, sondern müssen zuerst als Host-Incident geklärt werden.

Danach genau die gemeldeten Dateien manuell befüllen und ohne
Zwischenablage im Checkout installieren:

- `google-oauth-client-secret`: genau eine Zeile ohne abschließenden
  Zeilenumbruch,
- `allowed-emails`: eine bis vier kleingeschriebene Adressen, genau eine pro
  Zeile, keine Leerzeilen,
- `restic-repository`: S3-Ziel in der Form `s3:https://...`, ohne
  Zeilenumbruch,
- `restic-aws-credentials`: eigenes `[default]`-Profil mit eingeschränktem
  Access Key und Secret Key.

Die Laufzeit-Secrets sind absichtlich nicht pauschal `root:root`: File-basierte
Compose-Secrets werden auf einem Linux-Host nicht auf die Container-UID
umgeschrieben. Deshalb gehören Datenbank- und restic-Dateien numerisch
`70:70`; die drei OAuth2-Proxy-Dateien gehören `65532:65532`. Alle besitzen
Modus `0600`, sind reguläre Dateien ohne Symlink und liegen in dem
`root:root`/`0700` geschützten `CONFIG_DIR`. Docker bindet nur die jeweils
benötigte Datei read-only in den passenden Container. Beispiel:

```bash
sudo install -m 0600 -o 65532 -g 65532 /geschuetzt/google-oauth-client-secret \
  /etc/versorgungs-kompass/secrets/google-oauth-client-secret
sudo install -m 0600 -o 65532 -g 65532 /geschuetzt/allowed-emails \
  /etc/versorgungs-kompass/secrets/allowed-emails
sudo install -m 0600 -o 70 -g 70 /geschuetzt/restic-repository \
  /etc/versorgungs-kompass/secrets/restic-repository
sudo install -m 0600 -o 70 -g 70 /geschuetzt/restic-aws-credentials \
  /etc/versorgungs-kompass/secrets/restic-aws-credentials
```

Die Quelldateien danach gezielt entfernen. Das abschließende Preflight prüft
Form, exakte UID/GID, Rechte, Verzeichnisse, freien Speicher, Compose sowie die
Lesezugriffe der realen Container-UIDs und die OAuth2-Proxy-Konfiguration. Es
verlangt zusätzlich den in Abschnitt 5 beschriebenen aktuellen Recovery-
Escrow-Nachweis und wird deshalb erst nach dessen echtem Abruf-Test ausgeführt.

## 4. Bestehende Daten vor dem Cutover klären

Die Single-Server-Skripte initialisieren zuerst eine **neue, leere**
PostgreSQL-16-Datenbank mit dem versionierten Schema, den Loginrollen und den
engen Laufzeitrechten. Für die anschließende reine Datenübernahme gibt es
jetzt den abgesicherten Pfad unter
[`migration/`](migration/README.md). Er importiert weder Schema noch Rollen,
ACLs, Funktionen oder Extensions und ist kein allgemeiner Restore-Mechanismus.

### Aktueller Objektbefund und hartes Cutover-Gate

Beim aktuellen read-only Live-Check enthielten alle vier privaten
Anwendungsbuckets jeweils **null Objekte**:

- Profilbilder,
- Kontaktbilder,
- Kontakt-Notizanhänge,
- Stakeholder-Logos.

Das ist nur eine Momentaufnahme. Unmittelbar vor dem Datenbankexport und erneut
vor dem Cutover müssen die **vier exakten, aktuell deployten Bucket-Namen** aus
der geschützten Laufzeitkonfiguration beziehungsweise den Terraform-Outputs
ermittelt und read-only inventarisiert werden. Je Bucket werden Name, Zeitpunkt,
erfolgreiche Leseberechtigung und Objektzahl protokolliert. Ein Objekt, ein
abweichender Bucket-Name, eine fehlende Leseberechtigung oder ein nicht
vollständig bestimmbarer Bestand stoppt den Cutover.

Es gibt in diesem Paket bewusst **keinen GCS-Importer**. Auch
`LEGACY_PROFILE_IMAGE_BUCKET` kopiert keine Dateien. Zusätzlich zur direkten
Bucket-Inventur muss das Datenbankmanifest für `contact_images`,
`contact_note_attachments`, `profile_images` und `stakeholder_logos` jeweils
null Referenzen ausweisen. Direkte Bucket-Zählung und Datenbankreferenzen sind
zwei getrennte Gates. Die alten Buckets bleiben während des Rollback-Fensters
unverändert erhalten.

### Exportpaket auf der schreibgesperrten Quelle

Die vollständigen, kopierbaren Exportbefehle stehen in
[`migration/README.md`](migration/README.md). Sie dürfen nur in einer
freigegebenen Quellumgebung mit PostgreSQL-16-Clientwerkzeugen ausgeführt
werden. Zuvor friert der versionierte GKE-Operator nach Preview und exakter
Bestätigung das gebundene API-Deployment ein; ein Frozen-Readback muss null
Replikas und null API-Pods nachweisen. Ein separat geschützter globaler
Writer-Nachweis attestiert zusätzlich, dass weder andere Namespaces noch
externe Clients in die gebundene Cloud-SQL-Instanz schreiben. Der
Export-Wrapper verlangt diesen Nachweis, prüft den GKE-Freeze unmittelbar vor
und nach dem Export erneut und bricht bei jeder Abweichung ab. Die Quelle bleibt
mindestens bis zum vollständig abgeschlossenen Initial-Open des VPS
schreibgesperrt. Der Abschluss verlangt gemeinsam die kanonische Initial-
Attestation, die aktuelle Open-Attestation, einen fehlenden Cutover-Pending-
Marker und den laufenden Prozess-Readback `cutoverMode=open`. Vorher ist kein
Unfreeze freigegeben; ein Rollback darf die Quelle erst wieder öffnen, nachdem
der VPS-Writer nachweislich geschlossen ist.

Die tatsächlich deployte Quellrevision wird als Herkunftsnachweis erfasst.
Davon getrennt muss die für den Einzelserver vorgesehene Zielrevision exakt dem
Ziel-Checkout entsprechen; Quell- und Zielrevision dürfen und werden im
Regelfall voneinander abweichen. Beide Werte müssen außerhalb des Pakets am
jeweiligen System nachgewiesen werden.

Der Export erzeugt außerhalb von Git, `STATE_DIR` und `CONFIG_DIR` genau diese
sechs Dateien:

```text
database.dump
database.toc
migration-metadata.tsv
row-counts.tsv
storage-reference-counts.tsv
SHA256SUMS
```

Dabei gilt:

1. `database.dump` ist ein PostgreSQL-Custom-Dump mit `--data-only` für das
   Schema `public`; der TOC darf nur `TABLE DATA` und `SEQUENCE SET` enthalten.
2. `migration-metadata.tsv` bindet Datenbankname, Formatversion,
   PostgreSQL-Hauptversion 16, die deployte Quellrevision als Provenienz, die
   vom Import erzwungene Zielrevision, Cloud-SQL-Ziel, GKE-Freeze,
   Namespace-Inventur, globalen Writer-Nachweis und den einen exportierten
   PostgreSQL-Snapshot.
3. `row-counts.tsv` enthält jede `public`-Anwendungstabelle genau einmal,
   sortiert und mit der Zeilenzahl aus der weiterhin schreibgesperrten Quelle.
4. `storage-reference-counts.tsv` enthält die vier oben genannten
   Objektreferenztypen mit jeweils null.
5. `SHA256SUMS` bindet Dump, TOC und die drei Manifeste an ihre SHA-256-Werte.
   Der Zielwrapper bildet zusätzlich den SHA-256-Fingerprint dieser
   `SHA256SUMS`-Datei für die menschliche Importbestätigung.

TOC, beide Zählmanifeste, Metadaten und Checksummen werden vor der Übertragung
über einen getrennten Lesepfad geprüft. Die Quellverbindung nutzt die im
Migrations-Runbook beschriebenen owner-only libpq-Service- und Passwortdateien;
das Passwort erscheint weder in einem Prozessargument noch in einer
Environment-Variable. Das Paket wird verschlüsselt zum Zielhost übertragen,
ohne DSN oder Secrets in Shell-Historie, Git oder Logs zu schreiben. Auf dem
Ziel gehören Verzeichnis und Dateien UID/GID `70:70`;
das Verzeichnis hat Modus `0700`, jede Datei `0600`. Weitere, versteckte oder
verlinkte Dateien sind unzulässig.

### Zweistufiger Import auf dem Ziel

Vor dem Import müssen PostgreSQL und API bereits laufen und die vom Bootstrap
angelegte Zieldatenbank muss in **jeder** Anwendungstabelle leer sein. Der erste
Aufruf prüft Paket, Dateirechte, Größengrenze, alle SHA-256-Werte,
Metadatenrevision und Verzeichnisinventar read-only. Sein Exitcode `2` ist in
diesem Fall beabsichtigt; er gibt den paketgebundenen Bestätigungstext aus:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env
```

Nach unabhängiger Sichtprüfung wird exakt dieser Text als zweites Argument
wiederholt; `<64-HEX-FINGERPRINT>` wird nicht frei gewählt:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env \
  'IMPORT versorgungs_kompass PACKAGE <64-HEX-FINGERPRINT>'
```

Der Wrapper stoppt erst nach der exakten Bestätigung die API. Der
`database-import`-Service besitzt kein Netzwerk und sieht das Paket nur
read-only. Im Container werden Dump und TOC nochmals verglichen, Ziel- und
Quelltabelleninventar abgeglichen und die vollständig leere Zieldatenbank
geprüft. Erst dann importiert `pg_restore` Daten und Sequenzstände in einer
Transaktion. Nach dem Import müssen alle Tabellen- und
Objektreferenzzählungen bytegenau zu den Manifesten passen. Danach startet der
Wrapper die API und verlangt `healthy`. Bei jedem Import- oder Prüffehler bleibt
die API absichtlich gestoppt, sobald der Wrapper sie für den bestätigten
Import angehalten hat; nicht ungeprüft neu starten. Nach einem harten Abbruch
und vorhandenem `.database-import-recovery-required`-Marker zuerst jede offene
Backup-Recovery abschließen und dann den paketgebundenen Readback ausführen:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env RECOVER
```

Nur ein nachweislich vollständig importierter oder atomar leer gebliebener
Zustand gibt API und Marker wieder frei. Ein Fehler im ersten read-only
Paketlauf verändert dagegen weder API noch Datenbank.

### Identity-Bindungen fachlich prüfen

Der Datenimport übernimmt `profiles` und `identity_bindings` unverändert. Er
schreibt insbesondere keinen IAP-Issuer in Google OIDC um und ordnet keine
E-Mail-Adresse automatisch einem Subject zu. Deshalb werden vor dem Öffnen für
jede der ein bis vier Personen geschützt und ohne Ablage in allgemeinen Logs
mindestens folgende Werte gelesen und gegengeprüft:

```sql
select p.email, p.active, p.role,
       b.issuer, b.subject, b.active, b.access_scope, b.scope_ref
  from public.profiles p
  left join public.identity_bindings b on b.profile_id = p.id
 order by lower(p.email), b.issuer, b.subject;
```

Erwartet werden genau das freigegebene aktive Profil, die richtige Rolle und
der richtige Scope sowie genau die kontrollierte aktive Bindung. Für diesen
Stack muss der Issuer `https://accounts.google.com` und das Subject der
geprüften Google-Identität entsprechen. Eine alte IAP-Bindung, ein fehlendes
Subject oder ein Mehrfachtreffer bleibt fail-closed; der Dump oder seine
Manifeste werden dafür nicht nachträglich editiert.

### Google-Identität sicher erfassen und Profil binden

Die betreffende Adresse wird zunächst als einzige beziehungsweise nächste
Adresse in `allowed-emails` aufgenommen und OAuth2 Proxy kontrolliert neu
erzeugt. Die Person öffnet zuerst im selben Browser den geschützten Einstieg
und schließt dort den Google-Login ab:

```text
https://versorgungs-kompass.de/start
```

Erst mit der dadurch vorhandenen OAuth-Session wird im selben Browser der
Claim-Pfad geöffnet:

```text
https://versorgungs-kompass.de/api/identity/bootstrap-claim
```

Der Pfad liegt hinter OAuth2 Proxy und prüft das von diesem gesetzte Google-
ID-Token nochmals in der API. Er liefert mit `Cache-Control: no-store` nur ein
15 Minuten gültiges, serverseitig HMAC-signiertes `bootstrapClaim`-Artefakt
samt Ablaufzeit. Subject und verifizierte E-Mail sind in diesem Artefakt
kryptografisch aneinander gebunden; die Provisionierung übernimmt sie niemals
aus getrennt editierbaren Feldern. Das Artefakt wird nur über den geschützten
Administrationsweg auf den Zielhost übertragen, nicht in Ticket, Chat, Git
oder ein allgemeines Log kopiert.

Auf dem Zielhost wird für genau eine Person direkt im geschützten
`CONFIG_DIR` folgende Datei angelegt. `bootstrapClaim` ist der vollständige,
unveränderte String aus der Browserantwort. Die Profil-E-Mail muss exakt der
signierten Adresse entsprechen. Bei einem migrierten Profil müssen auch alle
anderen Profilfelder bytegenau zum vorhandenen Datensatz passen; bei einem
nachweislich leeren, aber trotzdem exportierten und importierten Quellstand
wird das Profil neu angelegt:

```json
{
  "schemaVersion": 2,
  "profile": {
    "id": "operator-1",
    "email": "person@example.org",
    "displayName": "Vorname Nachname",
    "initials": "VN",
    "role": "admin"
  },
  "identity": {
    "bootstrapClaim": "v1.eyJ...SIGNIERT...",
    "accessScope": "standard",
    "scopeRef": null
  }
}
```

```bash
sudoedit /etc/versorgungs-kompass/secrets/identity-provision.json
sudo chown 70:70 /etc/versorgungs-kompass/secrets/identity-provision.json
sudo chmod 0600 /etc/versorgungs-kompass/secrets/identity-provision.json
sudo /opt/versorgungs-kompass/current/deploy/single-server/identity/provision.sh \
  /etc/versorgungs-kompass/single-server.env
```

Der erste Lauf ist immer ein Rollback-Preview, zeigt nur die geplanten Aktionen
und endet absichtlich mit Exitcode `2`. Er legt eine zufällige, höchstens
15 Minuten gültige und an Eingabe plus Datenbankzustand gebundene
Bestätigung in zwei owner-only Dateien ab. Weder die Bestätigung noch stabile
personenbezogen ableitbare Fingerprints erscheinen in Prozessargumenten,
Shell-History oder Ausgabe. Nach unabhängiger Sichtprüfung folgt nur das
literale Wort `APPLY`:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/identity/provision.sh \
  /etc/versorgungs-kompass/single-server.env APPLY
```

Der Apply-Lauf liest den Zustand erneut unter Transaktionssperre, verifiziert
Claim und Bestätigung und legt höchstens das exakt beschriebene Profil sowie
die aktive Google-Bindung mit dem ausdrücklich bestätigten Scope an. Eine
vorhandene aktive IAP-Bindung desselben Zielprofils wird nur bei identischem
Scope auf der neuen Ziel-Datenbank explizit deaktiviert; die alte GKE-
Quelldatenbank bleibt unverändert. Andere Issuer, Kollisionen, abweichende
Profilfelder oder Scopes sowie ein zwischenzeitlich geänderter Zustand brechen
fail-closed ab. Nach Commit werden Profil, aktive Google-Bindung und jede
inaktive Altbindung vollständig zurückgelesen. Bei Erfolg entfernt der
Wrapper Eingabe, Bestätigung und deren kurzlebigen Schlüssel automatisch.

Wird ein Preview abgebrochen oder läuft seine Bestätigung ab, werden die
beiden Bestätigungsdateien vor einem neuen Preview gezielt entfernt; die
Eingabedatei bleibt für die kontrollierte Korrektur erhalten:

```bash
sudo unlink \
  /etc/versorgungs-kompass/secrets/identity-approval-secret \
  /etc/versorgungs-kompass/secrets/identity-approval-token
```

Für zwei bis drei weitere Testnutzer wird derselbe Vorgang einzeln wiederholt.
Eine Rollen- oder Scope-Entscheidung bleibt fachlich; für den verantwortlichen
Operator ist `admin`, für reine Sichtprüfung `viewer` und für begrenzte
Pflege `editor` vorgesehen. Für uneingeschränkten Zugang gilt
`accessScope=standard` mit `scopeRef=null`; ein bestehender begrenzter Zugang
muss stattdessen bytegenau als `accessScope=test_only` samt vorhandener
`scopeRef` übernommen werden. Der Operator verweigert inaktive oder
abweichende bestehende Profilbindungen und darf weder einen Scope implizit
erweitern noch eine bestehende Google-Bindung automatisch umhängen.

Nach dem Import folgen `status.sh`, fachliche Lese-Smokes, ein neues
Einzelserver-Backup und der isolierte Restore-Test. Das Migrationspaket bleibt
bis zum protokollierten Abschluss geschützt erhalten. **Keiner dieser echten
Export-, Übertragungs- oder Importschritte wurde mit Live-Daten bereits
ausgeführt.**

Ein Neustart ohne Export- und Importpaket ist in diesem Betriebsstand nicht
freigegeben. Auch wenn die bestehende Quelle nachweislich leer ist, wird sie mit
Nullzählungen exportiert und auf dem Ziel importiert. Dadurch bleiben
Quellstillstand, Zielrevision und leerer Ausgangsbestand an denselben
Cutover-Nachweis gebunden. Profile und Google-OIDC-Bindungen entstehen danach
über den gleichen Preview-/Apply-/Readback-Vorgang; eine E-Mail-Allowlist
allein reicht nicht.

## 5. Erstes Deployment und Backup-Gate

Das verschlüsselte Offsite-Repository kann bereits vor dem DNS-Cutover
initialisiert werden. Dieser Schritt startet keinen dauerhaften App-Dienst:

```bash
sudo env CONFIRM_BACKUP_REPOSITORY_INIT=INIT_VERSORGUNGS_KOMPASS_BACKUP \
  /opt/versorgungs-kompass/current/deploy/single-server/init-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

`init-backup.sh` verweigert die Initialisierung eines bereits bestehenden
Repositories.

Das zufällig erzeugte `restic-password`, `restic-repository` und die
`restic-aws-credentials` werden danach gemeinsam verschlüsselt in einem
Passwortmanager oder einem anderen zugriffsgeschützten Off-host-Escrow
hinterlegt. Das Escrow darf weder Git, derselbe VPS/Datenträger noch das mit
diesem Passwort verschlüsselte restic-Repository selbst sein. Mindestens ein
vom VPS unabhängiger Recovery-Zugang wird getestet. Ohne das restic-Passwort
ist das Offsite-Backup bei einem VPS-Verlust dauerhaft unlesbar.

Vor dem Cutover werden die drei Dateien **frisch aus diesem Escrow** in ein
neues temporäres Verzeichnis abgerufen, nicht aus `CONFIG_DIR` kopiert. Das
Verzeichnis ist `root:root`/`0700`, die drei Dateien sind `70:70`/`0600` und
enthalten sonst nichts. Der folgende Gate-Lauf vergleicht sie bytegenau mit
dem aktiven Setup, prüft mit der abgerufenen Kopie den echten Repository-
Zugriff und erzeugt erst danach einen secretfreien, 31 Tage gültigen
Fingerabdruck-Nachweis:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/verify-recovery-copy.sh \
  /etc/versorgungs-kompass/single-server.env \
  /root/vk-recovery-copy-test
```

Das Abrufverzeichnis wird nach der Prüfung gezielt entfernt und nicht als
zweite lokale Kopie behalten. Der Nachweis unter
`/etc/versorgungs-kompass/secrets/recovery-escrow-attestation.json` enthält
nur Zeitpunkt und SHA-256-Fingerprints, gehört `root:root` und besitzt Modus
`0600`. Er muss nach jeder Rotation und spätestens nach 31 Tagen durch einen
neuen echten Abruf-Test erneuert werden. Erst danach ist das Live-Preflight
zulässig:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/preflight.sh \
  /etc/versorgungs-kompass/single-server.env
```

Das eigentliche Deployment installiert keine systemd-Units und ändert DNS
nicht. Es baut aus dem exakten Checkout, startet den Stack und verlangt alle
fünf Dauer-Dienste zweimal nacheinander im Zustand `running` beziehungsweise –
bei vorhandenem Healthcheck – `healthy`. Danach prüft es über eine lokale
DNS-Übersteuerung nach `127.0.0.1` nachweislich den neuen Zielstack samt
gültigem Zertifikat und anonymer API-Ablehnung sowie zusätzlich den
kanonischen öffentlichen Einstieg:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/deploy.sh \
  /etc/versorgungs-kompass/single-server.env closed
```

Caddy kann das Zertifikat erst ausstellen, wenn DNS auf diesen Host zeigt und
Port 80/443 erreichbar ist. `deploy.sh` darf deshalb beim ersten Mal erst nach
der DNS-Umschaltung im angekuendigten Schreibstopp als erfolgreicher
Live-Nachweis gewertet werden. Die lokale DNS-Übersteuerung verhindert, dass
ein noch gecachter alter GCP-Endpunkt fälschlich als neuer Zielstack bestätigt
wird. Vor dem Aufruf müssen der neue `A`-/`AAAA`-Wert auf dem Host und
mindestens einem externen Resolver sichtbar sein.

Bis Daten-, Identity-, Backup- und Restore-Gate abgeschlossen sind, bleibt die
Gateway-Allowlist auf den verantwortlichen Operator beschränkt und es werden
keine fachlichen Schreibzugriffe freigegeben. Direkt nach dem erfolgreichen
Deployment folgt auch bei einer leeren Quelle der zweistufige Import aus
Abschnitt 4. Erst nach erfolgreichem Import,
Identity-Prüfung und `status.sh` werden Backup und Restore-Test ausgeführt:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/list-snapshots.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/restore-test.sh \
  /etc/versorgungs-kompass/single-server.env \
  '<vollstaendige-64-stellige-snapshot_id-aus-dem-Inventar>'
```

Auch bei einer nachweislich leeren Quelle entfallen Export und Import nicht.
Die Anlage und Prüfung der Identity-Bindungen, Backup und Restore-Test müssen
ebenfalls erfolgreich sein, bevor weitere Nutzer zugelassen oder produktive
Schreibzugriffe eröffnet werden.

## 6. systemd für Boot und regelmäßiges Backup

Die Unit startet beim Boot nur bereits gebaute Images. Sie führt weder
`git pull` noch Build oder Deployment aus. Erst nach einem erfolgreichen ersten
Deployment installieren:

```bash
sudo install -m 0644 \
  /opt/versorgungs-kompass/current/deploy/single-server/systemd/versorgungs-kompass.service \
  /etc/systemd/system/versorgungs-kompass.service
sudo install -m 0644 \
  /opt/versorgungs-kompass/current/deploy/single-server/systemd/versorgungs-kompass-backup.service \
  /etc/systemd/system/versorgungs-kompass-backup.service
sudo install -m 0644 \
  /opt/versorgungs-kompass/current/deploy/single-server/systemd/versorgungs-kompass-backup.timer \
  /etc/systemd/system/versorgungs-kompass-backup.timer
sudo install -m 0644 \
  /opt/versorgungs-kompass/current/deploy/single-server/systemd/versorgungs-kompass-backup-check.service \
  /etc/systemd/system/versorgungs-kompass-backup-check.service
sudo install -m 0644 \
  /opt/versorgungs-kompass/current/deploy/single-server/systemd/versorgungs-kompass-backup-check.timer \
  /etc/systemd/system/versorgungs-kompass-backup-check.timer
sudo systemctl daemon-reload
sudo systemctl enable --now versorgungs-kompass.service
sudo systemctl enable --now versorgungs-kompass-backup.timer
sudo systemctl enable --now versorgungs-kompass-backup-check.timer
```

Danach einen echten Reboot in einem Wartungsfenster prüfen. Erwartet werden
ein aktiver Stack, beide aktiven Timer und ein erfolgreicher Statuslauf:

```bash
sudo systemctl status versorgungs-kompass.service
sudo systemctl list-timers \
  versorgungs-kompass-backup.timer \
  versorgungs-kompass-backup-check.timer
sudo /opt/versorgungs-kompass/current/deploy/single-server/status.sh \
  /etc/versorgungs-kompass/single-server.env
```

Der Timer startet um 00:15, 06:15, 12:15 und 18:15 Uhr Serverzeit, jeweils mit
bis zu 15 Minuten Zufallsverzögerung. Verpasste Läufe werden nach dem Boot
nachgeholt. Er startet einen bewusst gestoppten Anwendungsstack nicht heimlich,
sondern schlägt in diesem Zustand sichtbar fehl. Jeder Lauf stoppt die API für
das kurze gemeinsame Snapshot-Fenster von Datenbank und lokalem Objektspeicher;
Anmeldung und Seitenabruf bleiben erreichbar, schreibende und lesende API-
Aufrufe können in dieser Zeit jedoch vorübergehend fehlschlagen. Die API wird
nach dem Offsite-Snapshot wieder gestartet und auf stabilen Health-Status
geprüft. Backup, Deployment, Import, Identity-Provisionierung sowie der
systemd-Start/-Stopp teilen eine hostweite, dateideskriptorbasierte `flock`-
Wartungssperre und laufen deshalb nicht gegeneinander. Kernel und systemd geben
sie auch nach Prozessabbruch oder Reboot automatisch frei. Die persistente
Datei `.maintenance.lock` ist nur Diagnosemetadatum und niemals selbst ein
Beleg für eine noch gehaltene Sperre.

Der zweite Timer führt sonntags um 03:45 Uhr Serverzeit mit bis zu 30 Minuten
Zufallsverzögerung einen vollständigen `restic check` aus. Dieser längere
Integritätscheck läuft damit regulär wöchentlich und nicht bei jeder
sechsstuendlichen Sicherung. Ein ausdrücklicher Backup-Lauf mit
`RESTIC_PRUNE=1` führt ihn ebenfalls direkt nach dem Prune aus.

## 7. Cutover

Der Cutover findet in einem angekuendigten Schreibstopp statt. Das erste
Deployment ist technisch immer `closed`; die API erlaubt dann Lesezugriffe,
weist aber jede als schreibend klassifizierte Route mit 503 ab. Auch ein
erfolgreiches Deployment öffnet den Zielwriter nicht:

1. Finalen GCP-Backup-/PITR-Punkt sowie die exakt deployte Quellrevision sichern.
2. Die geschützte GKE-Zielkonfiguration read-only prüfen, den
   `gke-writer-freeze.mjs`-Preview kontrollieren und dessen exakte
   `FREEZE:`-Bestätigung anwenden. Der anschließende Frozen-Readback muss null
   Replikas, null API-Pods und null fremde Writer-Kandidaten im konfigurierten
   Namespace ausweisen.
3. Andere Namespaces und externe Cloud-SQL-Clients separat inventarisieren und
   den aktuellen, an Projekt, Cloud-SQL-Instanz, Freeze-State, Binding und
   Namespace-Inventur gebundenen globalen Writer-Nachweis erstellen. Erst diese
   Kombination ist der angekuendigte Schreibstopp.
4. Alle vier exakten privaten Bucket-Namen read-only inventarisieren und für
   jeden erneut null Objekte bestätigen. Jede Abweichung stoppt.
5. Unter fortbestehendem Schreibstopp das sechsteilige Datenbankpaket mit allen
   fünf Argumenten gemäß Migrations-Runbook erzeugen. Der Wrapper führt vor
   und nach dem gemeinsamen PostgreSQL-Snapshot einen eigenen Frozen-Readback
   aus. TOC, Metadaten, Tabellen- und Objektreferenzzählungen sowie SHA-256-Werte
   getrennt prüfen und das Paket verschlüsselt nach `MIGRATION_DIR`
   übertragen. Auch eine nachweislich leere Quelle durchläuft diesen Pfad; ein
   Neustart ohne Migrationsnachweis ist nicht freigegeben.
6. Nach dem Export den Frozen-Readback nochmals explizit ausführen und die
   Quelle bis zum oben definierten vollständigen Initial-Open-Abschluss des VPS
   geschlossen lassen. Jedes `unfreeze` oder ein neuer Freeze-Zyklus invalidiert Paket und
   Import für diesen Initial-Cutover; dann sind neuer Export und neuer Import
   erforderlich. Für einen Rollback zuerst den VPS-Writer nachweislich
   `closed` setzen und erst danach die Quelle kontrolliert öffnen.
7. Das bereits initialisierte Offsite-Backup-Ziel und die auf den Operator
   beschränkte Gateway-Allowlist kontrollieren. `API_CUTOVER_MODE=closed`,
   OAuth-Redirect und Operator nochmals gegen den kanonischen Host prüfen.
8. DNS-`A` und nur bei vollständig vorbereitetem IPv6 auch `AAAA` auf den VPS
   umstellen.
9. Neue DNS-Antworten auf dem Host und extern nachweisen, `deploy.sh` mit dem
   zweiten Argument `closed` ausführen und auf das Zertifikat warten. Der
   interne Readback muss Revision und `cutoverMode=closed` bestätigen.
10. Zwingend zuerst den read-only Paketlauf und danach den exakt bestätigten
    `database-import` ausführen, auch bei einer leeren Quelle. Ein Fehler laesst
    die API gestoppt; nach einem harten Abbruch ausschließlich mit `RECOVER`
    fortsetzen.
11. Automatischen Count-Abgleich bestätigen und Profile, Rollen, Scopes,
    Google-Issuer und Subjects für alle erwarteten Personen fachlich prüfen.
12. Auf dem neuen Server `status.sh`, Backup, Snapshot-Inventar und Restore-Test
    mit der bewusst ausgewählten vollen Snapshot-ID erfolgreich ausführen.
13. Mit dem Operator Anmeldung, Rollen-/Scope-Grenze und eine harmlose
    Leseoperation prüfen. Eine nicht zugelassene Adresse muss vor der App
    stoppen. Alle freigegebenen Allowlist-Adressen müssen genau eine aktive
    Google-Bindung besitzen; alte IAP-Bindungen bleiben inaktiv.
14. Einen zufälligen Gate-Nonce auf dem VPS erzeugen. Unmittelbar danach auf
    der weiterhin eingefrorenen Quelle den signierten finalen Source-Writer-
    Nachweis gemäß Migrations-Runbook erstellen und Payload sowie Signatur
    verschlüsselt unter den festen Namen im `CONFIG_DIR` installieren. Die
    frische Bucket-Inventur und den DNS-Readback ebenfalls als die unten exakt
    beschriebenen Dateien festhalten. Vorher müssen VPS und ausführender
    Source-Operator eine synchronisierte UTC-Zeit besitzen; der Validator
    verlangt, dass dieser Source-Readback zeitlich nach dem attestierten
    Zielimport liegt.
15. Die nachfolgend beschriebene Open-Gate-Datei aus den tatsächlich geprüften
    Nachweisen erstellen. Der Schalter wiederholt lokal Import- und Identity-
    Readback, bindet den erfolgreichen post-Import-Restore-Test, den vorab
    gepinnten Public Key und alle Evidenzdateien und verbraucht nur die
    Gate-Datei atomar. Zuerst die read-only Vorschau, dann nur deren exakten,
    Gate-Hash-gebundenen Bestätigungstext als viertes Argument anwenden.
16. Erst nach einem erfolgreichen Prozess-Readback `cutoverMode=open` weitere
    zugelassene Personen aufnehmen und deren Login sowie Datenbankbindung
    einzeln prüfen. Zeitpunkt, DNS-Werte, Quell- und Ziel-Commit,
    Paketfingerprint, Backup-Snapshot, Bucket-Inventur und Prüfergebnis
    protokollieren.

Nie gleichzeitig auf alter und neuer Datenbank schreiben. GKE, Cloud SQL, GCS,
alte Secrets und Images während des vereinbarten Rollback-Fensters nicht
löschen oder verändern.

### Schreibzugriffe nach den Gates kontrolliert öffnen

Die Vorlage `cutover-open-gates.conf.example` wird außerhalb von Git als
`/etc/versorgungs-kompass/secrets/cutover-open-gates.conf` mit Eigentum
`root:root` und Modus `0600` angelegt. Sie enthält in der vorgegebenen
Reihenfolge den aktuellen Zielcommit, den SHA-256 von Migrationsmanifest und
dauerhafter Import-Attestation, den historischen GKE-Freeze, Gate-Nonce,
Hashes von signiertem finalem Source-Writer-Nachweis, Signatur und vorab
gepinntem Ed25519-Public-Key, die volle Snapshot-ID, den SHA-256 des
erfolgreichen `RESULT.txt`, den nur als Hash gespeicherten Identity-Readback
sowie die Hashes der geschützten Bucket- und DNS-Evidenz. `approvedAt` darf
beim Lauf höchstens zehn Minuten alt sein. Kein Nachweiswert wird geraten oder
aus der Vorlage übernommen.

Die folgenden fünf Dateien liegen beim Initial-Open zusätzlich unter ihren
festen Namen in demselben `CONFIG_DIR`, jeweils `root:root`/`0600` und ohne
Symlink:

```text
initial-open-source-writer.attestation
initial-open-source-writer.attestation.sig
initial-open-source-writer.public.pem
cutover-bucket-inventory.conf
cutover-dns-readback.conf
```

Der Public-Key-Hash muss zusätzlich mit dem schon vor dem ersten Deployment in
`single-server.env` gepinnten Wert übereinstimmen. `preflight.sh` prüft Datei,
Ed25519-Typ und Hash bereits im geschlossenen Deployment. Source-Writer-Nachweis,
Bucket-Inventur und DNS-Readback dürfen bei `approvedAt` höchstens zehn Minuten
alt und auch beim letzten Ziel-Readback noch höchstens zehn Minuten alt sein.
Das gebundene Zielbackup muss eindeutig nach der Import-Attestation liegen, der
Restore-Test danach und höchstens sechs Stunden vor der Freigabe.

`cutover-bucket-inventory.conf` besitzt exakt dieses Schema und bindet jede
Nullzählung an Quelle, Ziel und Paket:

```text
schemaVersion=1
gcpProjectId=<GCP-PROJEKT>
sourceRevision=<DEPLOYTE-QUELLREVISION>
targetRevision=<ZIELREVISION>
migrationPackageSha256=<SHA256-VON-SHA256SUMS>
gkeFreezeStateSha256=<HISTORISCHER-FREEZE-SHA256>
contactImageBucket=<ECHTER-BUCKET-NAME>
contactImageLiveObjects=0
contactNoteAttachmentBucket=<ECHTER-BUCKET-NAME>
contactNoteAttachmentLiveObjects=0
profileImageBucket=<ECHTER-BUCKET-NAME>
profileImageLiveObjects=0
stakeholderLogoBucket=<ECHTER-BUCKET-NAME>
stakeholderLogoLiveObjects=0
inventoriedAt=<UTC-ZEITPUNKT>
```

`cutover-dns-readback.conf` besitzt exakt dieses Schema. Ohne vorbereitete
IPv6-Konnektivität steht an allen drei IPv6-Stellen `none`:

```text
schemaVersion=1
appHost=versorgungs-kompass.de
targetRevision=<ZIELREVISION>
vpsIpv4=<VPS-IPV4>
vpsIpv6=<VPS-IPV6-ODER-none>
vpsResolverA=<VPS-IPV4>
vpsResolverAAAA=<VPS-IPV6-ODER-none>
vpsResolverWwwCname=versorgungs-kompass.de.
externalResolver=1.1.1.1
externalResolverA=<VPS-IPV4>
externalResolverAAAA=<VPS-IPV6-ODER-none>
externalResolverWwwCname=versorgungs-kompass.de.
checkedAt=<UTC-ZEITPUNKT>
```

Fehlende Dateien, freie Hashwerte, wiederholte Bucket-Namen,
Mehrfachadressen, nichtleere Buckets, abweichende Resolverantworten oder alte
Zeitstempel stoppen fail-closed. Diese lokale Konsistenzprüfung ersetzt nicht
die oben als Go-live-Blocker benannten autoritativen Collector-Nachweise.

Der Identity-Hash wird ohne Ausgabe der personenbezogenen Zeilen aus demselben
sortierten read-only SQL-Ergebnis ermittelt, das der Schalter erneut gegen die
Allowlist prüft:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/cutover-identity-audit.sh \
  /etc/versorgungs-kompass/single-server.env
```

Die Open-Gate-Datei selbst enthält nur Hashes und technische Kennungen.
Danach:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  open \
  /etc/versorgungs-kompass/single-server.env \
  /etc/versorgungs-kompass/secrets/cutover-open-gates.conf

sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  open \
  /etc/versorgungs-kompass/single-server.env \
  /etc/versorgungs-kompass/secrets/cutover-open-gates.conf \
  'SET API CUTOVER MODE open FOR <EXAKTER-COMMIT> WITH GATE <GATE-SHA256-AUS-DER-VORSCHAU>'
```

Der Moduswechsel hält dieselbe globale Wartungssperre wie Backup, Import,
Deployment und Identity-Provisionierung. Vor der API-Umschaltung schreibt er
einen fsync-gesicherten Recovery-Marker unter
`$STATE_DIR/api-control/.cutover-mode-change-pending`. Das Hostverzeichnis wird
read-only nach `/run/versorgungs-kompass-control` in die API gemountet. Nur bei
der exakt einzeiligen Sentinel-Datei `.writer-fence-ready` mit
`schemaVersion=1` und ohne diesen Marker gibt der Runtime-Writer-Fence
schreibende Policies frei. Der Marker sperrt damit alle neuen fachlichen
Schreibrequests, auch wenn die API für den technischen Open-Readback bereits im
Modus `open` läuft. Beim kontrollierten Schließen lässt der nachfolgende
Containerstopp bereits autorisierte Requests auslaufen; erst nach dem
bestätigten Stopp entsteht die Closed-Attestation. Beim
ersten Öffnen werden ein fester, geschützter Initial-Kandidat und die
revisionsgebundene Open-Autorisierung durable geschrieben, bevor die API für
diesen weiterhin schreibgesperrten Readback startet. Erst nach
API-Provenienz-, Readiness- und Mode-Readback wird der Kandidat zur
unveränderlichen `.initial-cutover-attestation` promoviert; ihr Feld
`preparedAt` bezeichnet wahrheitsgemäß die Erstellung des gebundenen
Kandidaten, nicht den späteren Dateiaustausch. Danach werden die
einmalige Gate-Datei und zuletzt der Recovery-Marker entfernt; erst dessen
Entfernung gibt fachliche Writes frei. Bleibt der Marker vorher nach Abbruch
oder Reboot liegen, entfernt `recover-closed` Kandidat und vorläufige
Open-/Closed-Nachweise und stellt einen retry-fähigen geschlossenen Zustand her.
Bleibt er dagegen erst nach der kanonischen Promotion liegen, behält Recovery
die Initial-Attestation bewusst: Der vollständige Cutover darf dann nicht
wiederholt werden; nach dem geschlossenen Recovery-Zustand ist nur der separat
geprüfte Code-Reopen-Pfad zulässig. Ohne kanonischen Initialnachweis bleibt
dieser leichtere Pfad gesperrt. Recovery erfolgt ausschließlich nach einem
nachgewiesenen API-Stopp:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  recover-closed /etc/versorgungs-kompass/single-server.env
```

Nach dem ersten erfolgreichen Öffnen existieren zwei getrennte Nachweise. Die
unveränderliche `.initial-cutover-attestation` belegt dauerhaft den
irreversiblen Initial-Cutover-Punkt. Erst zusammen mit der aktuellen
`.cutover-open-attestation`, einem fehlenden Cutover-Pending-Marker und dem
laufenden Prozess-Readback `cutoverMode=open` belegt sie den vollständigen
GCP-zu-VPS-Cutover. Die Open-Attestation autorisiert dabei immer nur den exakt
laufenden Commit als Writer. Beim
kontrollierten Schließen wird nur die aktuelle Open-Autorisierung entfernt und
eine `.cutover-closed-attestation` mit bisheriger Revision, Initialnachweis und
Persistenzvertrag geschrieben. Ein manuelles Ändern der Environment-Datei auf
`open` reicht deshalb nie zum Start.

### Reine Code-Aktualisierung ohne neuen GCP-Export

Die Vorlage `code-reopen-gates.conf.example` ist nur für Releases zulässig,
deren persistenzberührende Dateien gegenüber dem beim Schließen
festgehaltenen Stand bytegleich sind. Der Hash umfasst den vollständigen
API-Buildkontext samt Abhängigkeiten und Containerdefinition, die in der API
verwendeten Datenmodelle, die Compose-Laufzeit, SQL-Schema, Migrationen, Grants
und PostgreSQL-Bootstrap. Eine Änderung an einem dieser Bestandteile stoppt den
leichten Update-Pfad.

Zuerst den bisherigen Writer mit Vorschau und exakter Bestätigung auf
`closed` setzen. Dann die integrierte Zielrevision auschecken und ausschließlich
geschlossen deployen. Auf dieser Zielrevision ein frisches Einzelserver-Backup
und einen erfolgreichen Restore-Test der vollständigen Snapshot-ID ausführen.
Das erfolgreiche Closed-Deployment erzeugt automatisch eine an Zielrevision
und Persistenzvertrag gebundene `.closed-deployment-attestation`. Danach
Identity-Hash sowie SHA-256 der initialen Attestation, der Closed-Attestation,
der Closed-Deployment-Attestation und des Restore-Ergebnisses ermitteln. Der
Persistenzvertrag-Hash wird mit folgendem read-only Befehl erzeugt:

```bash
node /opt/versorgungs-kompass/current/deploy/single-server/hash-persistence-contract.mjs
```

Alle Werte werden in der exakten Reihenfolge der Vorlage unter
`/etc/versorgungs-kompass/secrets/code-reopen-gates.conf` mit `root:root` und
Modus `0600` eingetragen. `approvedAt` darf höchstens 30 Minuten alt sein; der
Restore-Test muss nach Close und geschlossenem Deployment liegen und darf bei
der Freigabe höchstens sechs Stunden alt sein. Erst danach Vorschau und exakte
Bestätigung ausführen:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/deploy.sh \
  /etc/versorgungs-kompass/single-server.env closed

sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  reopen-code \
  /etc/versorgungs-kompass/single-server.env \
  /etc/versorgungs-kompass/secrets/code-reopen-gates.conf

sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  reopen-code \
  /etc/versorgungs-kompass/single-server.env \
  /etc/versorgungs-kompass/secrets/code-reopen-gates.conf \
  'REOPEN API AFTER CODE UPDATE FOR <EXAKTER-COMMIT> WITH GATE <GATE-SHA256-AUS-DER-VORSCHAU>'
```

Der Reopen-Schalter bindet Initial-, Closed- und Closed-Deployment-Attestation,
unveränderten Persistenzvertrag, Zielrevision, frisches Zielbackup,
Restore-Ergebnis und Identity-Readback. Die neue revisionsgebundene
Open-Attestation liegt vor dem API-Start durable vor; erst nach erneutem
Prozess-Readback werden Recovery-Marker und einmalige Gate-Datei entfernt.
Schema-, API-, Grant-, Identity- oder Datenformat-Änderungen benötigen einen
separat geplanten Migrationslauf und sind in diesem leichten Pfad absichtlich
nicht freigabefähig.

## 8. Rollback

Bei fehlendem TLS, fehlerhafter Anmeldung, falscher Identity-Zuordnung,
abweichenden Tabellen-/Objektmengen oder instabilen Diensten bleibt der neue
Stack geschlossen.

Für einen Infrastruktur-Rollback:

1. Schreibzugriffe auf dem neuen Server sofort stoppen.
2. Einen letzten, gekennzeichneten Backup-Snapshot des neuen Zustands erzeugen,
   sofern das ohne weitere Datenveränderung möglich ist.
3. DNS auf den vorher dokumentierten GCP-Endpunkt zurückstellen und den alten
   Dienst kontrolliert öffnen.
4. Login, API-Grenze und Datenstand des alten Dienstes prüfen.
5. Daten, die während eines Teil-Cutovers nur auf einer Seite entstanden sind,
   nicht automatisch zusammenführen. Sie werden getrennt inventarisiert und
   fachlich entschieden.

Für einen reinen Code-Rollback auf demselben Server zuerst kontrolliert
schließen, den vorher dokumentierten integrierten Commit auschecken, geschlossen
deployen und den oben beschriebenen Code-Reopen-Gate-Lauf mit frischem
Backup/Restore ausführen. Das ist nur möglich, wenn der Persistenzvertrag
bytegleich bleibt. Ein Code-Rollback ersetzt keinen Datenbank-Restore.

## 9. Backup, Restore und Aufbewahrung

Jeder Backup-Lauf stoppt unter der gemeinsamen Wartungssperre zunächst die API.
Er erstellt PostgreSQL-Custom-Dump und Tabellenmengen aus exakt demselben
exportierten Datenbank-Snapshot und sichert danach bei weiterhin gestoppter API
nur dieses operationsgebundene Dump-Verzeichnis zusammen mit dem unveränderten
Objektspeicher. Damit können Datenbankreferenz und Datei nicht während des
Backups auseinanderlaufen. Sobald der unveränderliche Offsite-Snapshot fertig
ist, startet die API wieder; Retention und optionale Wartung laufen danach ohne
Anwendungsunterbrechung weiter. Drei lokale Generationen überbrücken einen
kurzen Offsite-Ausfall. restic sichert beides verschlüsselt offsite. Die
Aufbewahrung beträgt 14 Tages-, acht Wochen- und sechs Monatspunkte.

Der vollständige `restic check` läuft regulär über den wöchentlichen
Backup-Check-Timer und zusätzlich nach einem ausdrücklichen Prune, nicht bei
jeder Sicherung. Ein abgelaufener Recovery-Escrow-Nachweis laesst den Lauf erst
nach dem aktuellen Backup sichtbar fehlschlagen, damit das Governance-Gate nie
die eigentliche Sicherung verhindert.

Manueller Backup-Lauf und Logprüfung:

```bash
sudo systemctl start versorgungs-kompass-backup.service
sudo journalctl -u versorgungs-kompass-backup.service --since today
```

Ein speicherbereinigender `prune` ist bewusst kein Standardlauf. Nur nach einem
frischen erfolgreichen Backup und Restore-Test ausführen:

```bash
sudo env RESTIC_PRUNE=1 \
  /opt/versorgungs-kompass/current/deploy/single-server/backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Vor jedem Restore-Test zuerst das fail-closed gefilterte Snapshot-Inventar
anzeigen. Die erste Spalte enthält die volle 64-stellige `snapshot_id`; nur
eine bewusst anhand von UTC-Zeitpunkt, Quellrevision, Produktversion und
Operation ausgewählte ID wird als zweites Argument übernommen. `latest` und
gekürzte IDs sind nicht zulässig. Mindestens monatlich sowie vor und nach
größeren Updates:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/list-snapshots.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/restore-test.sh \
  /etc/versorgungs-kompass/single-server.env \
  '<vollstaendige-64-stellige-snapshot_id-aus-dem-Inventar>'
```

Der Test schreibt ausschließlich nach
`STATE_DIR/restore-tests/<UTC-Zeitpunkt>` und verändert die Live-Daten nicht.
Das Verzeichnis samt `RESULT.txt` erst nach protokollierter Prüfung entfernen.

### Recovery nach einem abgebrochenen Backup oder Repository-Zugriff

Recovery-Marker niemals manuell löschen. Nach einem harten Abbruch zuerst den
API-Marker behandeln; der Aufruf ist auch dann sicher, wenn kein API-Marker
vorhanden ist:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/recover-api-after-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Danach bei vorhandenem `.backup-repository-recovery-required`-Marker die
operationsgebundene Repository-Recovery ausführen:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/recover-repository-after-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Sie entfernt ausschließlich exakt zum Marker gehörende Einmal-Container und
unvollständige Kandidaten, führt ein normales `restic unlock` sowie einen
Repository-Check aus und entfernt den Marker erst nach Erfolg. Ein frischer
Restic-Lock aus einem bereits beendeten Einmal-Container kann wegen dessen
abweichendem Hostnamen noch bis zur Restic-Stale-Zeit als fremd gelten. Dann
Marker und Repository unverändert lassen, sicherstellen, dass wirklich kein
anderer Restic-Client mehr arbeitet, nach Ablauf der Stale-Zeit denselben
Recovery-Befehl erneut ausführen. Niemals `restic unlock --remove-all` oder
eine manuelle Lock-Löschung verwenden, solange ein anderer Client möglich
ist.

Erst wenn API- und Repository-Marker erfolgreich entfernt wurden, folgen
Statuslauf und ein neuer Backup-Lauf:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/status.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Ein separater `.database-import-recovery-required`-Marker wird erst nach dieser
Backup-Reihenfolge mit dem in Abschnitt 4 beschriebenen zweiten Argument
`RECOVER` behandelt. Bei Mehrdeutigkeit bleiben API, Repository beziehungsweise
Importmarker absichtlich blockiert.

Im Desasterfall zuerst auf einem Ersatzhost mit denselben gepinnten Quellen und
der frisch aus dem unabhängigen Escrow abgerufenen Kopie der benötigten
Secrets einen Restore-Test ausführen. Repository-Ziel, restic-Passwort und
Recovery-Credential müssen dabei ohne den verlorenen VPS verfügbar sein. Den defekten
`STATE_DIR` nie überschreiben. Erst wenn Dump-Hashes, Tabellenmengen, Objekte,
Rollen und Identity-Bindungen stimmen, wird ein ausgewählter Restore in einen
**neuen** Live-Datenpfad übernommen. Für diese Promotion gibt es absichtlich
keinen pauschalen Befehl: PostgreSQL-Loginrollen und Laufzeit-Grants sind nicht
Teil eines normalen `pg_dump` und müssen auf dem Ersatzhost aus dem exakten
Schema-/Grant-Stand neu hergestellt und geprüft werden. Der Pfadwechsel ist
eine protokollierte Incident-Entscheidung mit Vier-Augen-Prüfung.

## 10. Updates

Updates nie automatisch aus dem Internet einspielen. Für Anwendung und Images:

1. erfolgreiches Backup und aktuellen Restore-Test bestätigen,
2. vorherigen Commit-SHA und laufende Image-IDs protokollieren,
3. nur einen geprüften, integrierten `origin/main`-Stand auschecken,
4. Release-Hinweise und Datenbankkompatibilität prüfen,
5. den bisherigen Writer mit `set-cutover-mode.sh closed` samt Vorschau und
   exakter Bestätigung schließen,
6. die Zielrevision mit `deploy.sh ... closed` ausliefern und auf dieser
   Revision ein frisches Backup samt Restore-Test erzeugen,
7. nur bei bytegleichem Persistenzvertrag das frische Code-Reopen-Gate erstellen
   und mit `set-cutover-mode.sh reopen-code` samt exakter Bestätigung öffnen,
8. `status.sh`, einen Login und eine harmlose Leseoperation prüfen,
9. alte Images erst nach Ablauf des Rollback-Fensters gezielt bereinigen.

Sobald der Persistenzvertrag abweicht, bleibt die API geschlossen. Schema-,
Backend-, Rollen-, Identity- oder Datenformat-Änderungen werden nicht als
Routineupdate behandelt, sondern benötigen einen eigenen geprüften
Migrationsauftrag.

Sicherheitsupdates des Betriebssystems regelmäßig in einem Wartungsfenster
installieren. Nach Kernel-/Docker-Reboot müssen Stack, Timer, Firewall,
freier Speicher und der letzte Backup-Lauf erneut geprüft werden.

## 11. Monitoring und Störungserkennung

Täglich beziehungsweise alarmgestützt prüfen:

- `systemctl status versorgungs-kompass.service`,
- `status.sh` für öffentliche Startseite, Login-Redirect und anonyme
  API-Ablehnung,
- `systemctl status versorgungs-kompass-backup.timer` und Alter des letzten
  erfolgreichen Backup-Logs,
- `systemctl status versorgungs-kompass-backup-check.timer` und Alter des
  letzten erfolgreichen Repository-Checks,
- freien Platz und Inodes für `/var/lib/versorgungs-kompass`,
- VPS-CPU, RAM, Swap, Load und unerwartete Reboots,
- Zertifikatsablauf und DNS-`A`/`AAAA` von einem externen Netz.

Nützliche lokale Logs:

```bash
sudo journalctl -u versorgungs-kompass.service --since today
sudo journalctl -u versorgungs-kompass-backup.service --since today
sudo journalctl -u versorgungs-kompass-backup-check.service --since '8 days ago'
sudo docker compose \
  --env-file /etc/versorgungs-kompass/single-server.env \
  --project-directory /opt/versorgungs-kompass/current/deploy/single-server \
  -f /opt/versorgungs-kompass/current/deploy/single-server/compose.yaml ps
```

Ein externer Verfügbarkeitsmonitor kann `/` auf HTTP 200 prüfen. Keine
persönlichen Login-Cookies oder Tokens in einen Drittmonitor übernehmen. Ein
200 auf `/` beweist nur die öffentliche Startseite; mindestens ein eigener
alarmierter `status.sh`-Lauf bleibt erforderlich. Die mitgelieferten Units
konfigurieren noch keinen E-Mail-/Pager-Empfänger. Der Betreiber muss
systemd-Fehler und VPS-Schwellwerte im gewählten Monitoringdienst aktiv auf
eine erreichbare Person routen.

## 12. Nutzer sofort sperren

Eine Sperre muss Gateway **und** Datenbank abdecken. Zuerst in einer Root-Shell
die globale Wartungssperre erwerben und erst danach die Datenbankverbindung ohne
Ausgabe des Passworts öffnen:

```bash
sudo -i
source /opt/versorgungs-kompass/current/deploy/single-server/common.sh
single_server_load_environment /etc/versorgungs-kompass/single-server.env
single_server_acquire_maintenance_lock user-block
single_server_assert_no_maintenance_recovery_markers
single_server_compose exec postgres sh -c \
  'PGPASSWORD="$(cat /run/secrets/db-owner-password)" exec psql --no-psqlrc -U vk_owner -d versorgungs_kompass'
```

In `psql` erst genau den erwarteten Datensatz prüfen:

```sql
\set ON_ERROR_STOP on
\set blocked_email 'person@example.org'
begin;
select p.id, p.email, p.active
  from public.profiles p
 where lower(p.email) = lower(:'blocked_email')
 for update;

select b.issuer, b.subject, b.profile_id, b.active
  from public.identity_bindings b
  join public.profiles p on p.id = b.profile_id
 where lower(p.email) = lower(:'blocked_email')
 for update of b;
```

Nur bei eindeutigem Treffer fortfahren, sonst `rollback;` und den Vorgang
klären:

```sql
update public.identity_bindings b
   set active = false
  from public.profiles p
 where b.profile_id = p.id
   and lower(p.email) = lower(:'blocked_email');

update public.profiles
   set active = false
 where lower(email) = lower(:'blocked_email');

commit;
\quit
```

Danach die Adresse mit `sudoedit` aus
`/etc/versorgungs-kompass/secrets/allowed-emails` entfernen, Preflight laufen
lassen und OAuth2 Proxy neu erzeugen, damit die aktualisierte Datei sicher neu
eingelesen wird:

```bash
sudoedit /etc/versorgungs-kompass/secrets/allowed-emails
/opt/versorgungs-kompass/current/deploy/single-server/preflight.sh \
  /etc/versorgungs-kompass/single-server.env
single_server_compose up --detach --no-deps --force-recreate oauth2-proxy
single_server_release_maintenance_lock
exit
sudo /opt/versorgungs-kompass/current/deploy/single-server/status.sh \
  /etc/versorgungs-kompass/single-server.env
```

Das inaktive Profil sperrt die API auch bei einem noch vorhandenen
Gateway-Cookie. Falls auch jede bestehende Frontend-Sitzung sofort enden muss,
das OAuth-Cookie-Secret kontrolliert neu erzeugen und OAuth2 Proxy erneut
erstellen; dadurch werden **alle** Nutzer abgemeldet. Anschließend negativen
Zugriff der gesperrten und positiven Zugriff mindestens einer verbleibenden
Person prüfen. Soll die letzte zugelassene Person gesperrt werden, den gesamten
Stack stoppen; `allowed-emails` akzeptiert absichtlich keine leere Liste.
Bei einem Fehler vor `single_server_release_maintenance_lock` die Root-Shell
nicht für andere Arbeiten weiterverwenden: Die gehaltene Sperre blockiert
absichtlich konkurrierende Betriebsaktionen, bis der Vorgang geklärt oder die
Shell beendet wird.

## 13. Ende des Übergangsbetriebs

Vor Abschaltung Schreibzugriffe stoppen, finales Backup erzeugen, Restore-Test
erfolgreich prüfen und die fachliche Aufbewahrung festlegen. Erst danach DNS
und OAuth-Client kontrolliert stilllegen. VPS, Datenträger, S3-Snapshots,
Google-Credentials und alte GCP-Ressourcen sind getrennte Löschobjekte und
werden nur nach eigener dokumentierter Freigabe entfernt. Das Ende des
Single-Server-Betriebs autorisiert insbesondere keine automatische
GCP-Löschung.
