# Versorgungs-Kompass auf einem einzelnen Server

## Zweck und Status

Dieses Verzeichnis beschreibt einen bewusst kleinen Uebergangsbetrieb fuer
ein bis vier namentlich zugelassene Nutzer auf einem Linux-VPS mit 4 GiB RAM.
Der Stack besteht aus Caddy, OAuth2 Proxy, statischem Frontend, Node-API und
PostgreSQL. Datenbank, Objektdaten und lokale Backup-Staging-Dateien liegen
ausserhalb des Git-Checkouts unter `STATE_DIR`; das verschluesselte Backup liegt
in einem getrennten S3-kompatiblen Objektspeicher.

Die Dateien sind eine Betriebsgrundlage, kein automatisch ausgefuehrtes
Deployment. Insbesondere werden dadurch keine Server bestellt, keine DNS- oder
Google-Einstellungen geaendert und keine GCP-Ressourcen abgeschaltet. Ein
produktiver Cutover bleibt eine ausdrueckliche Betreiberentscheidung.

Stand 11. September 2026 ist der kontrollierte Datenbank-Migrationsweg lokal
vorbereitet, aber es wurde noch **kein echter Live-Dump exportiert, uebertragen
oder auf einem Einzelserver importiert**. Der aktuelle Read-only-Livebefund zu
den vier privaten Datenbuckets ist weiter unten als Momentaufnahme dokumentiert;
auch er ersetzt nicht die erneute Cutover-Pruefung.

Die produktiven Serverpfade sind aus Schutz vor versehentlicher Umberechtigung
kritischer Hostverzeichnisse fest vorgegeben:

- integrierter, sauberer Checkout: `/opt/versorgungs-kompass/current`
- Environment-Datei: `/etc/versorgungs-kompass/single-server.env`
- Secrets: `/etc/versorgungs-kompass/secrets`
- Betriebsdaten: `/var/lib/versorgungs-kompass`

Bei einem anderen Checkout-Pfad muessen die fuenf Vorlagen unter `systemd/` vor
der Installation konsistent angepasst werden. `CONFIG_DIR` und `STATE_DIR`
bleiben auch dann unveraendert; der Live-Preflight lehnt andere Werte ab.

## Architektur und Grenzen

Der oeffentliche Verkehr erreicht ausschliesslich Caddy auf Port 80 oder 443.
Caddy stellt Zertifikate automatisch aus und gibt geschuetzte Pfade an OAuth2
Proxy. Nach erfolgreicher Google-Anmeldung liefert der interne Caddy entweder
das Frontend oder die API aus. Die API erreicht PostgreSQL nur ueber einen
Unix-Socket; PostgreSQL besitzt weder einen Host-Port noch ein Containernetz.

Die Grenze besteht aus zwei voneinander unabhaengigen Pruefungen:

1. OAuth2 Proxy akzeptiert nur Adressen aus `allowed-emails`.
2. Die API akzeptiert nur eine aktive Google-Subject-Bindung zu einem aktiven
   Profil in PostgreSQL.

Eine E-Mail-Adresse in der Gateway-Allowlist erzeugt noch keine
Datenbankbindung. Bestehende IAP-Bindungen duerfen nicht ungeprueft als
Google-OIDC-Bindungen behandelt werden; Issuer und Subject muessen vor dem
Cutover separat und personenbezogen abgeglichen werden.

Der Stack setzt enge Container-Rechte, nur lesbare Dateisysteme, CPU-/RAM- und
Prozessgrenzen sowie gepinnte Fremd-Images ein. Trotzdem gelten folgende
bewusste Einschraenkungen:

- Ein einzelner VPS ist ein gemeinsamer Ausfallbereich ohne Hochverfuegbarkeit.
- Docker und die systemd-Units laufen root-basiert. Zugriff auf den
  Docker-Socket entspricht praktisch Root-Zugriff.
- Es gibt keinen vorgeschalteten Cloud-WAF- oder DDoS-Schutz.
- Caddy-Request-Logs und API-Request-Logs sind aus Datenschutzgruenden
  deaktiviert. Das reduziert zugleich die forensische Detailtiefe.
- Ausgehende Verbindungen werden nach Containernetzen getrennt, aber **nicht
  nach Ziel-Domains freigelistet**. Caddy, OAuth2 Proxy, API und das
  Backup-Werkzeug koennen ueber ihre nicht-internen Netze grundsaetzlich andere
  Internetziele erreichen. Eine Domain-Allowlist ist wegen dynamischer
  Google-, ACME-, CDN- und S3-Ziele in diesem Uebergangsbetrieb nicht umgesetzt.
- Lokale Daten sind nur so gut gegen physischen Zugriff geschuetzt wie die
  Datentraeger-Verschluesselung und das Zugriffskonzept des VPS-Anbieters.
- Der Restore-Test prueft Daten und Tabellenmengen in einer getrennten
  PostgreSQL-Instanz. Die Umschaltung eines Restores in den Live-Pfad ist
  absichtlich nicht automatisiert.
- Datei-Uploads sind deaktiviert. Bereits migrierte Objekte koennen aus dem
  lokalen Objektspeicher gelesen werden, neue Upload-Flows sind nicht Teil
  dieses Betriebsmodus.

## Mindestvoraussetzungen

Empfohlen sind mindestens zwei vCPU, 4 GiB RAM und 40 GiB SSD auf einer
gepflegten Linux-LTS-Version. Vor jedem Deployment verlangt der Preflight
mindestens 5 GiB freien Platz unter `STATE_DIR`. Zusaetzlich werden benoetigt:

- feste oeffentliche IPv4-Adresse; IPv6 nur, wenn es vollstaendig konfiguriert
  und genauso gefiltert ist,
- aktuelle Docker Engine mit Compose-Plugin,
- Git, Node.js/npm, curl, OpenSSL und `flock` aus `util-linux`,
- ein integrierter, unveraenderter `main`-Checkout,
- ein Google-OAuth-Webclient,
- ein separates S3-kompatibles Backup-Ziel mit eigenem Zugriffsschluessel,
- serverseitige Datentraeger-Verschluesselung beim VPS-Anbieter, soweit
  verfuegbar,
- eine zweite, getestete Administrator-Zugangsmoeglichkeit beim Anbieter, etwa
  eine Rescue-Konsole.

Die Backups sollten in einer anderen Ausfallzone oder bei einem anderen
Anbieter liegen. Der Backup-Schluessel benoetigt nur den vorgesehenen
Bucket/Praefix. Bucket-Versionierung oder Object Lock schuetzen zusaetzlich vor
versehentlichem oder kompromittiertem Loeschen.

## 1. Host und Firewall vorbereiten

Zuerst Docker gemaess der offiziellen Anleitung fuer die verwendete
Distribution installieren. Keine ungeprueften Convenience-Skripte aus einer
Shell-Pipeline ausfuehren. Danach Docker fuer den Boot aktivieren und einen
Reboot-Test einplanen.

Die Firewall wird sowohl beim VPS-Anbieter als auch auf dem Host gesetzt. Der
Sollzustand ist:

| Richtung | Freigabe | Quelle | Zweck |
| --- | --- | --- | --- |
| eingehend | TCP 22 | genau ein vertrauenswuerdiges Admin-CIDR | SSH |
| eingehend | TCP 80 | Internet | ACME und HTTPS-Weiterleitung |
| eingehend | TCP 443 | Internet | HTTPS |
| eingehend | UDP 443 | Internet | HTTP/3; kann entfallen, wenn bewusst deaktiviert |
| eingehend | alles andere | keine | blockieren |
| ausgehend | erforderlich | Internet | Google OIDC/JWKS, ACME, S3; bei Updates Git/Registry/npm |

Beispiel fuer Ubuntu mit UFW; `<ADMIN-CIDR>` muss vor dem Aktivieren ersetzt
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
muessen denselben Sollzustand besitzen. Docker kann Host-Firewallregeln je nach
Distribution ueber eigene nftables-/iptables-Regeln beeinflussen. Deshalb von
einem externen Netz pruefen, dass ausschliesslich 22 vom Admin-CIDR sowie 80 und
443 erreichbar sind. Die internen Ports 4180, 8080 und 5432 duerfen nie am Host
lauschen.

## 2. DNS und Google OAuth vorbereiten

Den DNS-TTL mindestens einen Tag vor dem geplanten Cutover reduzieren. Vor dem
Cutover zeigt die produktive Domain weiterhin auf den alten Dienst. Einen
`AAAA`-Record nur setzen, wenn der neue Host ueber funktionierendes und
gefiltertes IPv6 verfuegt; ein alter oder falscher `AAAA`-Record kann einen Teil
der Nutzer am neuen Server vorbeifuehren.

In Google Auth Platform:

1. Branding, Supportkontakt, Zielgruppe und die minimalen Scopes `openid` und
   `email` konfigurieren.
2. Unter Credentials einen OAuth-Client vom Typ **Web application** anlegen.
3. Als autorisierten Redirect exakt
   `https://versorgungs-kompass.de/oauth2/callback` eintragen. Schema, Host,
   Gross-/Kleinschreibung und abschliessender Pfad muessen exakt passen.
4. Bei Status **Testing** jede der ein bis vier Personen als Testnutzer
   aufnehmen. Google kann Testautorisierungen nach sieben Tagen ablaufen lassen;
   fuer zwei bis drei Monate ist daher entweder wiederholte Anmeldung bewusst
   zu akzeptieren oder der passende Produktionsstatus samt den aktuell
   verlangten Branding-/Datenschutzangaben zu klaeren.
5. Client-ID in die Environment-Datei und Client-Secret ohne Zeilenumbruch in
   die geschuetzte Secret-Datei uebernehmen.

Aktuelle Primaerquellen:

- [Google OAuth 2.0 fuer Webserver-Anwendungen](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth-Richtlinien](https://developers.google.com/identity/protocols/oauth2/policies)
- [Test- und Produktionsstatus](https://support.google.com/cloud/answer/15549945?hl=en)

Der Google-Client ist kein Ersatz fuer die lokale E-Mail-Allowlist und die
aktive Datenbankbindung. Eine verpflichtende Mehrfaktor-Authentisierung wird
durch diesen Stack selbst nicht erzwungen; sie haengt von den verwendeten
Google-Konten und deren Richtlinien ab.

## 3. Checkout, Environment und Secrets anlegen

Der Checkout unter `/opt/versorgungs-kompass/current` muss auf einem
integrierten Commit von `origin/main` stehen und sauber sein. Das Live-Preflight
ruft `git fetch` auf und bricht bei jeder Abweichung ab. Keine Feature-Branches,
lokalen Patches oder unversionierten Dateien deployen.

Environment-Vorlage installieren und danach Client-ID, externen
`MIGRATION_DIR` sowie gegebenenfalls den Legacy-Bucket-Hinweis setzen:

```bash
sudo install -d -m 0700 -o root -g root /etc/versorgungs-kompass
sudo install -m 0600 -o root -g root \
  /opt/versorgungs-kompass/current/deploy/single-server/environment.example \
  /etc/versorgungs-kompass/single-server.env
sudoedit /etc/versorgungs-kompass/single-server.env
sudo install -d -m 0700 -o 70 -g 70 \
  /var/lib/versorgungs-kompass-migration
```

`MIGRATION_DIR` muss ein kanonischer absoluter Pfad ausserhalb von Git-Checkout,
`STATE_DIR` und `CONFIG_DIR` sein. `prepare-host.sh` legt ihn absichtlich nicht
an. Die voreingestellte Dump-Grenze betraegt 5 GiB und darf hoechstens auf
10 GiB angehoben werden.

Anschliessend legt die Host-Vorbereitung Betriebsverzeichnisse sowie zufaellige
lokale Datenbank-, Cookie- und restic-Passwoerter und den separaten HMAC-
Schluessel fuer kurzlebige Identity-Bootstrap-Claims an:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/prepare-host.sh \
  /etc/versorgungs-kompass/single-server.env
```

Die Vorbereitung bricht vor jeder Rechteaenderung ab, wenn einer der festen
Eltern-, Daten-, Unter- oder Secret-Pfade ein Symlink, ein nichtkanonischer Pfad
oder ein unerwarteter Dateityp ist. Solche Abweichungen werden nicht automatisch
repariert, sondern muessen zuerst als Host-Incident geklaert werden.

Danach genau die gemeldeten Dateien manuell befuellen und ohne
Zwischenablage im Checkout installieren:

- `google-oauth-client-secret`: genau eine Zeile ohne abschliessenden
  Zeilenumbruch,
- `allowed-emails`: eine bis vier kleingeschriebene Adressen, genau eine pro
  Zeile, keine Leerzeilen,
- `restic-repository`: S3-Ziel in der Form `s3:https://...`, ohne
  Zeilenumbruch,
- `restic-aws-credentials`: eigenes `[default]`-Profil mit eingeschraenktem
  Access Key und Secret Key.

Die Laufzeit-Secrets sind absichtlich nicht pauschal `root:root`: File-basierte
Compose-Secrets werden auf einem Linux-Host nicht auf die Container-UID
umgeschrieben. Deshalb gehoeren Datenbank- und restic-Dateien numerisch
`70:70`; die drei OAuth2-Proxy-Dateien gehoeren `65532:65532`. Alle besitzen
Modus `0600`, sind regulaere Dateien ohne Symlink und liegen in dem
`root:root`/`0700` geschuetzten `CONFIG_DIR`. Docker bindet nur die jeweils
benoetigte Datei read-only in den passenden Container. Beispiel:

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

Die Quelldateien danach gezielt entfernen. Das abschliessende Preflight prueft
Form, exakte UID/GID, Rechte, Verzeichnisse, freien Speicher, Compose sowie die
Lesezugriffe der realen Container-UIDs und die OAuth2-Proxy-Konfiguration. Es
verlangt zusaetzlich den in Abschnitt 5 beschriebenen aktuellen Recovery-
Escrow-Nachweis und wird deshalb erst nach dessen echtem Abruf-Test ausgefuehrt.

## 4. Bestehende Daten vor dem Cutover klaeren

Die Single-Server-Skripte initialisieren zuerst eine **neue, leere**
PostgreSQL-16-Datenbank mit dem versionierten Schema, den Loginrollen und den
engen Laufzeitrechten. Fuer die anschliessende reine Datenuebernahme gibt es
jetzt den abgesicherten Pfad unter
[`migration/`](migration/README.md). Er importiert weder Schema noch Rollen,
ACLs, Funktionen oder Extensions und ist kein allgemeiner Restore-Mechanismus.

### Aktueller Objektbefund und hartes Cutover-Gate

Beim aktuellen read-only Live-Check enthielten alle vier privaten
Anwendungsbuckets jeweils **null Objekte**:

- Profilbilder,
- Kontaktbilder,
- Kontakt-Notizanhaenge,
- Stakeholder-Logos.

Das ist nur eine Momentaufnahme. Unmittelbar vor dem Datenbankexport und erneut
vor dem Cutover muessen die **vier exakten, aktuell deployten Bucket-Namen** aus
der geschuetzten Laufzeitkonfiguration beziehungsweise den Terraform-Outputs
ermittelt und read-only inventarisiert werden. Je Bucket werden Name, Zeitpunkt,
erfolgreiche Leseberechtigung und Objektzahl protokolliert. Ein Objekt, ein
abweichender Bucket-Name, eine fehlende Leseberechtigung oder ein nicht
vollstaendig bestimmbarer Bestand stoppt den Cutover.

Es gibt in diesem Paket bewusst **keinen GCS-Importer**. Auch
`LEGACY_PROFILE_IMAGE_BUCKET` kopiert keine Dateien. Zusaetzlich zur direkten
Bucket-Inventur muss das Datenbankmanifest fuer `contact_images`,
`contact_note_attachments`, `profile_images` und `stakeholder_logos` jeweils
null Referenzen ausweisen. Direkte Bucket-Zaehlung und Datenbankreferenzen sind
zwei getrennte Gates. Die alten Buckets bleiben waehrend des Rollback-Fensters
unveraendert erhalten.

### Exportpaket auf der schreibgesperrten Quelle

Die vollstaendigen, kopierbaren Exportbefehle stehen in
[`migration/README.md`](migration/README.md). Sie duerfen nur in einer
freigegebenen Quellumgebung mit PostgreSQL-16-Clientwerkzeugen ausgefuehrt
werden. Zuvor friert der versionierte GKE-Operator nach Preview und exakter
Bestaetigung das gebundene API-Deployment ein; ein Frozen-Readback muss null
Replikas und null API-Pods nachweisen. Ein separat geschuetzter globaler
Writer-Nachweis attestiert zusaetzlich, dass weder andere Namespaces noch
externe Clients in die gebundene Cloud-SQL-Instanz schreiben. Der
Export-Wrapper verlangt diesen Nachweis, prueft den GKE-Freeze unmittelbar vor
und nach dem Export erneut und bricht bei jeder Abweichung ab. Die Quelle bleibt
bis zum ausdruecklichen Unfreeze schreibgesperrt.

Die tatsaechlich deployte Quellrevision wird als Herkunftsnachweis erfasst.
Davon getrennt muss die fuer den Einzelserver vorgesehene Zielrevision exakt dem
Ziel-Checkout entsprechen; Quell- und Zielrevision duerfen und werden im
Regelfall voneinander abweichen. Beide Werte muessen ausserhalb des Pakets am
jeweiligen System nachgewiesen werden.

Der Export erzeugt ausserhalb von Git, `STATE_DIR` und `CONFIG_DIR` genau diese
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

1. `database.dump` ist ein PostgreSQL-Custom-Dump mit `--data-only` fuer das
   Schema `public`; der TOC darf nur `TABLE DATA` und `SEQUENCE SET` enthalten.
2. `migration-metadata.tsv` bindet Datenbankname, Formatversion,
   PostgreSQL-Hauptversion 16, die deployte Quellrevision als Provenienz, die
   vom Import erzwungene Zielrevision, Cloud-SQL-Ziel, GKE-Freeze,
   Namespace-Inventur, globalen Writer-Nachweis und den einen exportierten
   PostgreSQL-Snapshot.
3. `row-counts.tsv` enthaelt jede `public`-Anwendungstabelle genau einmal,
   sortiert und mit der Zeilenzahl aus der weiterhin schreibgesperrten Quelle.
4. `storage-reference-counts.tsv` enthaelt die vier oben genannten
   Objektreferenztypen mit jeweils null.
5. `SHA256SUMS` bindet Dump, TOC und die drei Manifeste an ihre SHA-256-Werte.
   Der Zielwrapper bildet zusaetzlich den SHA-256-Fingerprint dieser
   `SHA256SUMS`-Datei fuer die menschliche Importbestaetigung.

TOC, beide Zaehlmanifeste, Metadaten und Checksummen werden vor der Uebertragung
ueber einen getrennten Lesepfad geprueft. Die Quellverbindung nutzt die im
Migrations-Runbook beschriebenen owner-only libpq-Service- und Passwortdateien;
das Passwort erscheint weder in einem Prozessargument noch in einer
Environment-Variable. Das Paket wird verschluesselt zum Zielhost uebertragen,
ohne DSN oder Secrets in Shell-Historie, Git oder Logs zu schreiben. Auf dem
Ziel gehoeren Verzeichnis und Dateien UID/GID `70:70`;
das Verzeichnis hat Modus `0700`, jede Datei `0600`. Weitere, versteckte oder
verlinkte Dateien sind unzulaessig.

### Zweistufiger Import auf dem Ziel

Vor dem Import muessen PostgreSQL und API bereits laufen und die vom Bootstrap
angelegte Zieldatenbank muss in **jeder** Anwendungstabelle leer sein. Der erste
Aufruf prueft Paket, Dateirechte, Groessengrenze, alle SHA-256-Werte,
Metadatenrevision und Verzeichnisinventar read-only. Sein Exitcode `2` ist in
diesem Fall beabsichtigt; er gibt den paketgebundenen Bestaetigungstext aus:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env
```

Nach unabhaengiger Sichtpruefung wird exakt dieser Text als zweites Argument
wiederholt; `<64-HEX-FINGERPRINT>` wird nicht frei gewaehlt:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env \
  'IMPORT versorgungs_kompass PACKAGE <64-HEX-FINGERPRINT>'
```

Der Wrapper stoppt erst nach der exakten Bestaetigung die API. Der
`database-import`-Service besitzt kein Netzwerk und sieht das Paket nur
read-only. Im Container werden Dump und TOC nochmals verglichen, Ziel- und
Quelltabelleninventar abgeglichen und die vollstaendig leere Zieldatenbank
geprueft. Erst dann importiert `pg_restore` Daten und Sequenzstaende in einer
Transaktion. Nach dem Import muessen alle Tabellen- und
Objektreferenzzaehlungen bytegenau zu den Manifesten passen. Danach startet der
Wrapper die API und verlangt `healthy`. Bei jedem Import- oder Prueffehler bleibt
die API absichtlich gestoppt, sobald der Wrapper sie fuer den bestaetigten
Import angehalten hat; nicht ungeprueft neu starten. Nach einem harten Abbruch
und vorhandenem `.database-import-recovery-required`-Marker zuerst jede offene
Backup-Recovery abschliessen und dann den paketgebundenen Readback ausfuehren:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/migration/import-database.sh \
  /etc/versorgungs-kompass/single-server.env RECOVER
```

Nur ein nachweislich vollstaendig importierter oder atomar leer gebliebener
Zustand gibt API und Marker wieder frei. Ein Fehler im ersten read-only
Paketlauf veraendert dagegen weder API noch Datenbank.

### Identity-Bindungen fachlich pruefen

Der Datenimport uebernimmt `profiles` und `identity_bindings` unveraendert. Er
schreibt insbesondere keinen IAP-Issuer in Google OIDC um und ordnet keine
E-Mail-Adresse automatisch einem Subject zu. Deshalb werden vor dem Oeffnen fuer
jede der ein bis vier Personen geschuetzt und ohne Ablage in allgemeinen Logs
mindestens folgende Werte gelesen und gegengeprueft:

```sql
select p.email, p.active, p.role,
       b.issuer, b.subject, b.active, b.access_scope, b.scope_ref
  from public.profiles p
  left join public.identity_bindings b on b.profile_id = p.id
 order by lower(p.email), b.issuer, b.subject;
```

Erwartet werden genau das freigegebene aktive Profil, die richtige Rolle und
der richtige Scope sowie genau die kontrollierte aktive Bindung. Fuer diesen
Stack muss der Issuer `https://accounts.google.com` und das Subject der
geprueften Google-Identitaet entsprechen. Eine alte IAP-Bindung, ein fehlendes
Subject oder ein Mehrfachtreffer bleibt fail-closed; der Dump oder seine
Manifeste werden dafuer nicht nachtraeglich editiert.

### Google-Identitaet sicher erfassen und Profil binden

Die betreffende Adresse wird zunaechst als einzige beziehungsweise naechste
Adresse in `allowed-emails` aufgenommen und OAuth2 Proxy kontrolliert neu
erzeugt. Die Person oeffnet zuerst im selben Browser den geschuetzten Einstieg
und schliesst dort den Google-Login ab:

```text
https://versorgungs-kompass.de/start
```

Erst mit der dadurch vorhandenen OAuth-Session wird im selben Browser der
Claim-Pfad geoeffnet:

```text
https://versorgungs-kompass.de/api/identity/bootstrap-claim
```

Der Pfad liegt hinter OAuth2 Proxy und prueft das von diesem gesetzte Google-
ID-Token nochmals in der API. Er liefert mit `Cache-Control: no-store` nur ein
15 Minuten gueltiges, serverseitig HMAC-signiertes `bootstrapClaim`-Artefakt
samt Ablaufzeit. Subject und verifizierte E-Mail sind in diesem Artefakt
kryptografisch aneinander gebunden; die Provisionierung uebernimmt sie niemals
aus getrennt editierbaren Feldern. Das Artefakt wird nur ueber den geschuetzten
Administrationsweg auf den Zielhost uebertragen, nicht in Ticket, Chat, Git
oder ein allgemeines Log kopiert.

Auf dem Zielhost wird fuer genau eine Person direkt im geschuetzten
`CONFIG_DIR` folgende Datei angelegt. `bootstrapClaim` ist der vollstaendige,
unveraenderte String aus der Browserantwort. Die Profil-E-Mail muss exakt der
signierten Adresse entsprechen. Bei einem migrierten Profil muessen auch alle
anderen Profilfelder bytegenau zum vorhandenen Datensatz passen; bei einem
dokumentierten leeren Neustart wird das Profil neu angelegt:

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
und endet absichtlich mit Exitcode `2`. Er legt eine zufaellige, hoechstens
15 Minuten gueltige und an Eingabe plus Datenbankzustand gebundene
Bestaetigung in zwei owner-only Dateien ab. Weder die Bestaetigung noch stabile
personenbezogen ableitbare Fingerprints erscheinen in Prozessargumenten,
Shell-History oder Ausgabe. Nach unabhaengiger Sichtpruefung folgt nur das
literale Wort `APPLY`:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/identity/provision.sh \
  /etc/versorgungs-kompass/single-server.env APPLY
```

Der Apply-Lauf liest den Zustand erneut unter Transaktionssperre, verifiziert
Claim und Bestaetigung und legt hoechstens das exakt beschriebene Profil sowie
die aktive Google-Bindung mit dem ausdruecklich bestaetigten Scope an. Eine
vorhandene aktive IAP-Bindung desselben Zielprofils wird nur bei identischem
Scope auf der neuen Ziel-Datenbank explizit deaktiviert; die alte GKE-
Quelldatenbank bleibt unveraendert. Andere Issuer, Kollisionen, abweichende
Profilfelder oder Scopes sowie ein zwischenzeitlich geaenderter Zustand brechen
fail-closed ab. Nach Commit werden Profil, aktive Google-Bindung und jede
inaktive Altbindung vollstaendig zurueckgelesen. Bei Erfolg entfernt der
Wrapper Eingabe, Bestaetigung und deren kurzlebigen Schluessel automatisch.

Wird ein Preview abgebrochen oder laeuft seine Bestaetigung ab, werden die
beiden Bestaetigungsdateien vor einem neuen Preview gezielt entfernt; die
Eingabedatei bleibt fuer die kontrollierte Korrektur erhalten:

```bash
sudo unlink \
  /etc/versorgungs-kompass/secrets/identity-approval-secret \
  /etc/versorgungs-kompass/secrets/identity-approval-token
```

Fuer zwei bis drei weitere Testnutzer wird derselbe Vorgang einzeln wiederholt.
Eine Rollen- oder Scope-Entscheidung bleibt fachlich; fuer den verantwortlichen
Operator ist `admin`, fuer reine Sichtpruefung `viewer` und fuer begrenzte
Pflege `editor` vorgesehen. Fuer uneingeschraenkten Zugang gilt
`accessScope=standard` mit `scopeRef=null`; ein bestehender begrenzter Zugang
muss stattdessen bytegenau als `accessScope=test_only` samt vorhandener
`scopeRef` uebernommen werden. Der Operator verweigert inaktive oder
abweichende bestehende Profilbindungen und darf weder einen Scope implizit
erweitern noch eine bestehende Google-Bindung automatisch umhaengen.

Nach dem Import folgen `status.sh`, fachliche Lese-Smokes, ein neues
Einzelserver-Backup und der isolierte Restore-Test. Das Migrationspaket bleibt
bis zum protokollierten Abschluss geschuetzt erhalten. **Keiner dieser echten
Export-, Uebertragungs- oder Importschritte wurde mit Live-Daten bereits
ausgefuehrt.**

Wenn fuer die wenigen Testnutzer stattdessen bewusst ein leerer Neustart
vereinbart wird, muss diese Entscheidung ebenso dokumentiert werden. Profile
und Google-OIDC-Bindungen entstehen dann ueber den gleichen Preview-/Apply-/
Readback-Vorgang; eine E-Mail-Allowlist allein reicht nicht.

## 5. Erstes Deployment und Backup-Gate

Das verschluesselte Offsite-Repository kann bereits vor dem DNS-Cutover
initialisiert werden. Dieser Schritt startet keinen dauerhaften App-Dienst:

```bash
sudo env CONFIRM_BACKUP_REPOSITORY_INIT=INIT_VERSORGUNGS_KOMPASS_BACKUP \
  /opt/versorgungs-kompass/current/deploy/single-server/init-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

`init-backup.sh` verweigert die Initialisierung eines bereits bestehenden
Repositories.

Das zufaellig erzeugte `restic-password`, `restic-repository` und die
`restic-aws-credentials` werden danach gemeinsam verschluesselt in einem
Passwortmanager oder einem anderen zugriffsgeschuetzten Off-host-Escrow
hinterlegt. Das Escrow darf weder Git, derselbe VPS/Datentraeger noch das mit
diesem Passwort verschluesselte restic-Repository selbst sein. Mindestens ein
vom VPS unabhaengiger Recovery-Zugang wird getestet. Ohne das restic-Passwort
ist das Offsite-Backup bei einem VPS-Verlust dauerhaft unlesbar.

Vor dem Cutover werden die drei Dateien **frisch aus diesem Escrow** in ein
neues temporaeres Verzeichnis abgerufen, nicht aus `CONFIG_DIR` kopiert. Das
Verzeichnis ist `root:root`/`0700`, die drei Dateien sind `70:70`/`0600` und
enthalten sonst nichts. Der folgende Gate-Lauf vergleicht sie bytegenau mit
dem aktiven Setup, prueft mit der abgerufenen Kopie den echten Repository-
Zugriff und erzeugt erst danach einen secretfreien, 31 Tage gueltigen
Fingerabdruck-Nachweis:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/verify-recovery-copy.sh \
  /etc/versorgungs-kompass/single-server.env \
  /root/vk-recovery-copy-test
```

Das Abrufverzeichnis wird nach der Pruefung gezielt entfernt und nicht als
zweite lokale Kopie behalten. Der Nachweis unter
`/etc/versorgungs-kompass/secrets/recovery-escrow-attestation.json` enthaelt
nur Zeitpunkt und SHA-256-Fingerprints, gehoert `root:root` und besitzt Modus
`0600`. Er muss nach jeder Rotation und spaetestens nach 31 Tagen durch einen
neuen echten Abruf-Test erneuert werden. Erst danach ist das Live-Preflight
zulaessig:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/preflight.sh \
  /etc/versorgungs-kompass/single-server.env
```

Das eigentliche Deployment installiert keine systemd-Units und aendert DNS
nicht. Es baut aus dem exakten Checkout, startet den Stack und verlangt alle
fuenf Dauer-Dienste zweimal nacheinander im Zustand `running` beziehungsweise –
bei vorhandenem Healthcheck – `healthy`. Danach prueft es ueber eine lokale
DNS-Uebersteuerung nach `127.0.0.1` nachweislich den neuen Zielstack samt
gueltigem Zertifikat und anonymer API-Ablehnung sowie zusaetzlich den
kanonischen oeffentlichen Einstieg:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/deploy.sh \
  /etc/versorgungs-kompass/single-server.env closed
```

Caddy kann das Zertifikat erst ausstellen, wenn DNS auf diesen Host zeigt und
Port 80/443 erreichbar ist. `deploy.sh` darf deshalb beim ersten Mal erst nach
der DNS-Umschaltung im angekuendigten Schreibstopp als erfolgreicher
Live-Nachweis gewertet werden. Die lokale DNS-Uebersteuerung verhindert, dass
ein noch gecachter alter GCP-Endpunkt faelschlich als neuer Zielstack bestaetigt
wird. Vor dem Aufruf muessen der neue `A`-/`AAAA`-Wert auf dem Host und
mindestens einem externen Resolver sichtbar sein.

Bis Daten-, Identity-, Backup- und Restore-Gate abgeschlossen sind, bleibt die
Gateway-Allowlist auf den verantwortlichen Operator beschraenkt und es werden
keine fachlichen Schreibzugriffe freigegeben. Wenn der bisherige Datenstand
fortgesetzt werden soll, folgt direkt nach dem erfolgreichen Deployment der
zweistufige Import aus Abschnitt 4. Erst nach erfolgreichem Import,
Identity-Pruefung und `status.sh` werden Backup und Restore-Test ausgefuehrt:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/list-snapshots.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/restore-test.sh \
  /etc/versorgungs-kompass/single-server.env \
  '<vollstaendige-64-stellige-snapshot_id-aus-dem-Inventar>'
```

Bei einem dokumentierten leeren Neustart entfaellt nur der Datenimport, nicht
die Anlage und Pruefung der Identity-Bindungen. Backup und Restore-Test muessen
in beiden Faellen erfolgreich sein, bevor weitere Nutzer zugelassen oder
produktive Schreibzugriffe eroeffnet werden.

## 6. systemd fuer Boot und regelmaessiges Backup

Die Unit startet beim Boot nur bereits gebaute Images. Sie fuehrt weder
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

Danach einen echten Reboot in einem Wartungsfenster pruefen. Erwartet werden
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
bis zu 15 Minuten Zufallsverzoegerung. Verpasste Laeufe werden nach dem Boot
nachgeholt. Er startet einen bewusst gestoppten Anwendungsstack nicht heimlich,
sondern schlaegt in diesem Zustand sichtbar fehl. Jeder Lauf stoppt die API fuer
das kurze gemeinsame Snapshot-Fenster von Datenbank und lokalem Objektspeicher;
Anmeldung und Seitenabruf bleiben erreichbar, schreibende und lesende API-
Aufrufe koennen in dieser Zeit jedoch voruebergehend fehlschlagen. Die API wird
nach dem Offsite-Snapshot wieder gestartet und auf stabilen Health-Status
geprueft. Backup, Deployment, Import, Identity-Provisionierung sowie der
systemd-Start/-Stopp teilen eine hostweite, dateideskriptorbasierte `flock`-
Wartungssperre und laufen deshalb nicht gegeneinander. Kernel und systemd geben
sie auch nach Prozessabbruch oder Reboot automatisch frei. Die persistente
Datei `.maintenance.lock` ist nur Diagnosemetadatum und niemals selbst ein
Beleg fuer eine noch gehaltene Sperre.

Der zweite Timer fuehrt sonntags um 03:45 Uhr Serverzeit mit bis zu 30 Minuten
Zufallsverzoegerung einen vollstaendigen `restic check` aus. Dieser laengere
Integritaetscheck laeuft damit regulaer woechentlich und nicht bei jeder
sechsstuendlichen Sicherung. Ein ausdruecklicher Backup-Lauf mit
`RESTIC_PRUNE=1` fuehrt ihn ebenfalls direkt nach dem Prune aus.

## 7. Cutover

Der Cutover findet in einem angekuendigten Schreibstopp statt. Das erste
Deployment ist technisch immer `closed`; die API erlaubt dann Lesezugriffe,
weist aber jede als schreibend klassifizierte Route mit 503 ab. Auch ein
erfolgreiches Deployment oeffnet den Zielwriter nicht:

1. Finalen GCP-Backup-/PITR-Punkt sowie die exakt deployte Quellrevision sichern.
2. Die geschuetzte GKE-Zielkonfiguration read-only pruefen, den
   `gke-writer-freeze.mjs`-Preview kontrollieren und dessen exakte
   `FREEZE:`-Bestaetigung anwenden. Der anschliessende Frozen-Readback muss null
   Replikas, null API-Pods und null fremde Writer-Kandidaten im konfigurierten
   Namespace ausweisen.
3. Andere Namespaces und externe Cloud-SQL-Clients separat inventarisieren und
   den aktuellen, an Projekt, Cloud-SQL-Instanz, Freeze-State, Binding und
   Namespace-Inventur gebundenen globalen Writer-Nachweis erstellen. Erst diese
   Kombination ist der angekuendigte Schreibstopp.
4. Alle vier exakten privaten Bucket-Namen read-only inventarisieren und fuer
   jeden erneut null Objekte bestaetigen. Jede Abweichung stoppt.
5. Unter fortbestehendem Schreibstopp das sechsteilige Datenbankpaket mit allen
   fuenf Argumenten gemaess Migrations-Runbook erzeugen. Der Wrapper fuehrt vor
   und nach dem gemeinsamen PostgreSQL-Snapshot einen eigenen Frozen-Readback
   aus. TOC, Metadaten, Tabellen- und Objektreferenzzaehlungen sowie SHA-256-Werte
   getrennt pruefen und das Paket verschluesselt nach `MIGRATION_DIR`
   uebertragen. Alternativ den bewusst leeren Neustart dokumentieren.
6. Nach dem Export den Frozen-Readback nochmals explizit ausfuehren. Nur wenn die
   alte Quelle fuer den dokumentierten Rollback wieder laufen soll, die exakten
   `UNFREEZE:`- und danach `CLOSE:`-Vorschauen anwenden, den Running-Readback
   pruefen und den archivierten Abschlusszustand protokollieren.
7. Das bereits initialisierte Offsite-Backup-Ziel und die auf den Operator
   beschraenkte Gateway-Allowlist kontrollieren. `API_CUTOVER_MODE=closed`,
   OAuth-Redirect und Operator nochmals gegen den kanonischen Host pruefen.
8. DNS-`A` und nur bei vollstaendig vorbereitetem IPv6 auch `AAAA` auf den VPS
   umstellen.
9. Neue DNS-Antworten auf dem Host und extern nachweisen, `deploy.sh` mit dem
   zweiten Argument `closed` ausfuehren und auf das Zertifikat warten. Der
   interne Readback muss Revision und `cutoverMode=closed` bestaetigen.
10. Bei Datenfortsetzung zuerst den read-only Paketlauf und danach den exakt
    bestaetigten `database-import` ausfuehren. Ein Fehler laesst die API gestoppt;
    nach einem harten Abbruch ausschliesslich mit `RECOVER` fortsetzen.
11. Automatischen Count-Abgleich bestaetigen und Profile, Rollen, Scopes,
    Google-Issuer und Subjects fuer alle erwarteten Personen fachlich pruefen.
12. Auf dem neuen Server `status.sh`, Backup, Snapshot-Inventar und Restore-Test
    mit der bewusst ausgewaehlten vollen Snapshot-ID erfolgreich ausfuehren.
13. Mit dem Operator Anmeldung, Rollen-/Scope-Grenze und eine harmlose
    Leseoperation pruefen. Eine nicht zugelassene Adresse muss vor der App
    stoppen. Alle freigegebenen Allowlist-Adressen muessen genau eine aktive
    Google-Bindung besitzen; alte IAP-Bindungen bleiben inaktiv.
14. Die nachfolgend beschriebene frische Open-Gate-Datei aus den tatsaechlich
    geprueften Nachweisen erstellen. Der Schalter wiederholt lokal Import- und
    Identity-Readback, bindet den erfolgreichen Restore-Test und verbraucht die
    Gate-Datei atomar. Zuerst die read-only Vorschau, dann nur deren exakten
    Bestaetigungstext als viertes Argument anwenden.
15. Erst nach einem erfolgreichen Prozess-Readback `cutoverMode=open` weitere
    zugelassene Personen aufnehmen und deren Login sowie Datenbankbindung
    einzeln pruefen. Zeitpunkt, DNS-Werte, Quell- und Ziel-Commit,
    Paketfingerprint, Backup-Snapshot, Bucket-Inventur und Pruefergebnis
    protokollieren.

Nie gleichzeitig auf alter und neuer Datenbank schreiben. GKE, Cloud SQL, GCS,
alte Secrets und Images waehrend des vereinbarten Rollback-Fensters nicht
loeschen oder veraendern.

### Schreibzugriffe nach den Gates kontrolliert oeffnen

Die Vorlage `cutover-open-gates.conf.example` wird ausserhalb von Git als
`/etc/versorgungs-kompass/secrets/cutover-open-gates.conf` mit Eigentum
`root:root` und Modus `0600` angelegt. Sie enthaelt in der vorgegebenen
Reihenfolge den aktuellen Zielcommit, den SHA-256 des Migrationsmanifests und
des GKE-Freeze, die volle Snapshot-ID, den SHA-256 des erfolgreichen
`RESULT.txt`, den nur als Hash gespeicherten Identity-Readback sowie die Hashes
der geschuetzten Bucket- und DNS-Inventur. `approvedAt` darf beim Lauf hoechstens
30 Minuten alt sein. Kein Nachweiswert wird geraten oder aus der Vorlage
uebernommen.

Der Identity-Hash wird ohne Ausgabe der personenbezogenen Zeilen aus demselben
sortierten read-only SQL-Ergebnis ermittelt, das der Schalter erneut gegen die
Allowlist prueft:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/cutover-identity-audit.sh \
  /etc/versorgungs-kompass/single-server.env
```

Die Open-Gate-Datei selbst enthaelt nur Hashes und technische Kennungen.
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
  'SET API CUTOVER MODE open FOR <EXAKTER-COMMIT-AUS-DER-VORSCHAU>'
```

Der Moduswechsel haelt dieselbe globale Wartungssperre wie Backup, Import,
Deployment und Identity-Provisionierung. Vor der API-Umschaltung schreibt er
einen fsync-gesicherten Recovery-Marker. Beim ersten Oeffnen werden der
unveraenderliche Initialnachweis und die revisionsgebundene Open-Autorisierung
durable geschrieben, bevor die API erstmals offen startet. Nach
API-Provenienz-, Readiness- und Mode-Readback werden Recovery-Marker und
einmalige Gate-Datei entfernt. Bleibt der Marker nach Abbruch oder Reboot
liegen, wird nicht erneut geoeffnet, sondern ausschliesslich nach einem
nachgewiesenen API-Stopp fail-closed wiederhergestellt:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/set-cutover-mode.sh \
  recover-closed /etc/versorgungs-kompass/single-server.env
```

Nach dem ersten erfolgreichen Oeffnen existieren zwei getrennte Nachweise. Die
unveraenderliche `.initial-cutover-attestation` belegt dauerhaft den
vollstaendigen GCP-zu-VPS-Cutover. Die aktuelle `.cutover-open-attestation`
autorisiert dagegen immer nur den exakt laufenden Commit als Writer. Beim
kontrollierten Schliessen wird nur die aktuelle Open-Autorisierung entfernt und
eine `.cutover-closed-attestation` mit bisheriger Revision, Initialnachweis und
Persistenzvertrag geschrieben. Ein manuelles Aendern der Environment-Datei auf
`open` reicht deshalb nie zum Start.

### Reine Code-Aktualisierung ohne neuen GCP-Export

Die Vorlage `code-reopen-gates.conf.example` ist nur fuer Releases zulaessig,
deren persistenzberuehrende Dateien gegenueber dem beim Schliessen
festgehaltenen Stand bytegleich sind. Der Hash umfasst den vollstaendigen
API-Buildkontext samt Abhaengigkeiten und Containerdefinition, die in der API
verwendeten Datenmodelle, die Compose-Laufzeit, SQL-Schema, Migrationen, Grants
und PostgreSQL-Bootstrap. Eine Aenderung an einem dieser Bestandteile stoppt den
leichten Update-Pfad.

Zuerst den bisherigen Writer mit Vorschau und exakter Bestaetigung auf
`closed` setzen. Dann die integrierte Zielrevision auschecken und ausschliesslich
geschlossen deployen. Auf dieser Zielrevision ein frisches Einzelserver-Backup
und einen erfolgreichen Restore-Test der vollstaendigen Snapshot-ID ausfuehren.
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
Modus `0600` eingetragen. `approvedAt` darf hoechstens 30 Minuten alt sein; der
Restore-Test muss nach Close und geschlossenem Deployment liegen und darf bei
der Freigabe hoechstens sechs Stunden alt sein. Erst danach Vorschau und exakte
Bestaetigung ausfuehren:

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
  'REOPEN API AFTER CODE UPDATE FOR <EXAKTER-COMMIT-AUS-DER-VORSCHAU>'
```

Der Reopen-Schalter bindet Initial-, Closed- und Closed-Deployment-Attestation,
unveraenderten Persistenzvertrag, Zielrevision, frisches Zielbackup,
Restore-Ergebnis und Identity-Readback. Die neue revisionsgebundene
Open-Attestation liegt vor dem API-Start durable vor; erst nach erneutem
Prozess-Readback werden Recovery-Marker und einmalige Gate-Datei entfernt.
Schema-, API-, Grant-, Identity- oder Datenformat-Aenderungen benoetigen einen
separat geplanten Migrationslauf und sind in diesem leichten Pfad absichtlich
nicht freigabefaehig.

## 8. Rollback

Bei fehlendem TLS, fehlerhafter Anmeldung, falscher Identity-Zuordnung,
abweichenden Tabellen-/Objektmengen oder instabilen Diensten bleibt der neue
Stack geschlossen.

Fuer einen Infrastruktur-Rollback:

1. Schreibzugriffe auf dem neuen Server sofort stoppen.
2. Einen letzten, gekennzeichneten Backup-Snapshot des neuen Zustands erzeugen,
   sofern das ohne weitere Datenveraenderung moeglich ist.
3. DNS auf den vorher dokumentierten GCP-Endpunkt zurueckstellen und den alten
   Dienst kontrolliert oeffnen.
4. Login, API-Grenze und Datenstand des alten Dienstes pruefen.
5. Daten, die waehrend eines Teil-Cutovers nur auf einer Seite entstanden sind,
   nicht automatisch zusammenfuehren. Sie werden getrennt inventarisiert und
   fachlich entschieden.

Fuer einen reinen Code-Rollback auf demselben Server zuerst kontrolliert
schliessen, den vorher dokumentierten integrierten Commit auschecken, geschlossen
deployen und den oben beschriebenen Code-Reopen-Gate-Lauf mit frischem
Backup/Restore ausfuehren. Das ist nur moeglich, wenn der Persistenzvertrag
bytegleich bleibt. Ein Code-Rollback ersetzt keinen Datenbank-Restore.

## 9. Backup, Restore und Aufbewahrung

Jeder Backup-Lauf stoppt unter der gemeinsamen Wartungssperre zunaechst die API.
Er erstellt PostgreSQL-Custom-Dump und Tabellenmengen aus exakt demselben
exportierten Datenbank-Snapshot und sichert danach bei weiterhin gestoppter API
nur dieses operationsgebundene Dump-Verzeichnis zusammen mit dem unveraenderten
Objektspeicher. Damit koennen Datenbankreferenz und Datei nicht waehrend des
Backups auseinanderlaufen. Sobald der unveraenderliche Offsite-Snapshot fertig
ist, startet die API wieder; Retention und optionale Wartung laufen danach ohne
Anwendungsunterbrechung weiter. Drei lokale Generationen ueberbruecken einen
kurzen Offsite-Ausfall. restic sichert beides verschluesselt offsite. Die
Aufbewahrung betraegt 14 Tages-, acht Wochen- und sechs Monatspunkte.

Der vollstaendige `restic check` laeuft regulaer ueber den woechentlichen
Backup-Check-Timer und zusaetzlich nach einem ausdruecklichen Prune, nicht bei
jeder Sicherung. Ein abgelaufener Recovery-Escrow-Nachweis laesst den Lauf erst
nach dem aktuellen Backup sichtbar fehlschlagen, damit das Governance-Gate nie
die eigentliche Sicherung verhindert.

Manueller Backup-Lauf und Logpruefung:

```bash
sudo systemctl start versorgungs-kompass-backup.service
sudo journalctl -u versorgungs-kompass-backup.service --since today
```

Ein speicherbereinigender `prune` ist bewusst kein Standardlauf. Nur nach einem
frischen erfolgreichen Backup und Restore-Test ausfuehren:

```bash
sudo env RESTIC_PRUNE=1 \
  /opt/versorgungs-kompass/current/deploy/single-server/backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Vor jedem Restore-Test zuerst das fail-closed gefilterte Snapshot-Inventar
anzeigen. Die erste Spalte enthaelt die volle 64-stellige `snapshot_id`; nur
eine bewusst anhand von UTC-Zeitpunkt, Quellrevision, Produktversion und
Operation ausgewaehlte ID wird als zweites Argument uebernommen. `latest` und
gekuerzte IDs sind nicht zulaessig. Mindestens monatlich sowie vor und nach
groesseren Updates:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/list-snapshots.sh \
  /etc/versorgungs-kompass/single-server.env
sudo /opt/versorgungs-kompass/current/deploy/single-server/restore-test.sh \
  /etc/versorgungs-kompass/single-server.env \
  '<vollstaendige-64-stellige-snapshot_id-aus-dem-Inventar>'
```

Der Test schreibt ausschliesslich nach
`STATE_DIR/restore-tests/<UTC-Zeitpunkt>` und veraendert die Live-Daten nicht.
Das Verzeichnis samt `RESULT.txt` erst nach protokollierter Pruefung entfernen.

### Recovery nach einem abgebrochenen Backup oder Repository-Zugriff

Recovery-Marker niemals manuell loeschen. Nach einem harten Abbruch zuerst den
API-Marker behandeln; der Aufruf ist auch dann sicher, wenn kein API-Marker
vorhanden ist:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/recover-api-after-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Danach bei vorhandenem `.backup-repository-recovery-required`-Marker die
operationsgebundene Repository-Recovery ausfuehren:

```bash
sudo /opt/versorgungs-kompass/current/deploy/single-server/backup/recover-repository-after-backup.sh \
  /etc/versorgungs-kompass/single-server.env
```

Sie entfernt ausschliesslich exakt zum Marker gehoerende Einmal-Container und
unvollstaendige Kandidaten, fuehrt ein normales `restic unlock` sowie einen
Repository-Check aus und entfernt den Marker erst nach Erfolg. Ein frischer
Restic-Lock aus einem bereits beendeten Einmal-Container kann wegen dessen
abweichendem Hostnamen noch bis zur Restic-Stale-Zeit als fremd gelten. Dann
Marker und Repository unveraendert lassen, sicherstellen, dass wirklich kein
anderer Restic-Client mehr arbeitet, nach Ablauf der Stale-Zeit denselben
Recovery-Befehl erneut ausfuehren. Niemals `restic unlock --remove-all` oder
eine manuelle Lock-Loeschung verwenden, solange ein anderer Client moeglich
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
der frisch aus dem unabhaengigen Escrow abgerufenen Kopie der benoetigten
Secrets einen Restore-Test ausfuehren. Repository-Ziel, restic-Passwort und
Recovery-Credential muessen dabei ohne den verlorenen VPS verfuegbar sein. Den defekten
`STATE_DIR` nie ueberschreiben. Erst wenn Dump-Hashes, Tabellenmengen, Objekte,
Rollen und Identity-Bindungen stimmen, wird ein ausgewaehlter Restore in einen
**neuen** Live-Datenpfad uebernommen. Fuer diese Promotion gibt es absichtlich
keinen pauschalen Befehl: PostgreSQL-Loginrollen und Laufzeit-Grants sind nicht
Teil eines normalen `pg_dump` und muessen auf dem Ersatzhost aus dem exakten
Schema-/Grant-Stand neu hergestellt und geprueft werden. Der Pfadwechsel ist
eine protokollierte Incident-Entscheidung mit Vier-Augen-Pruefung.

## 10. Updates

Updates nie automatisch aus dem Internet einspielen. Fuer Anwendung und Images:

1. erfolgreiches Backup und aktuellen Restore-Test bestaetigen,
2. vorherigen Commit-SHA und laufende Image-IDs protokollieren,
3. nur einen geprueften, integrierten `origin/main`-Stand auschecken,
4. Release-Hinweise und Datenbankkompatibilitaet pruefen,
5. den bisherigen Writer mit `set-cutover-mode.sh closed` samt Vorschau und
   exakter Bestaetigung schliessen,
6. die Zielrevision mit `deploy.sh ... closed` ausliefern und auf dieser
   Revision ein frisches Backup samt Restore-Test erzeugen,
7. nur bei bytegleichem Persistenzvertrag das frische Code-Reopen-Gate erstellen
   und mit `set-cutover-mode.sh reopen-code` samt exakter Bestaetigung oeffnen,
8. `status.sh`, einen Login und eine harmlose Leseoperation pruefen,
9. alte Images erst nach Ablauf des Rollback-Fensters gezielt bereinigen.

Sobald der Persistenzvertrag abweicht, bleibt die API geschlossen. Schema-,
Backend-, Rollen-, Identity- oder Datenformat-Aenderungen werden nicht als
Routineupdate behandelt, sondern benoetigen einen eigenen geprueften
Migrationsauftrag.

Sicherheitsupdates des Betriebssystems regelmaessig in einem Wartungsfenster
installieren. Nach Kernel-/Docker-Reboot muessen Stack, Timer, Firewall,
freier Speicher und der letzte Backup-Lauf erneut geprueft werden.

## 11. Monitoring und Stoerungserkennung

Taeglich beziehungsweise alarmgestuetzt pruefen:

- `systemctl status versorgungs-kompass.service`,
- `status.sh` fuer oeffentliche Startseite, Login-Redirect und anonyme
  API-Ablehnung,
- `systemctl status versorgungs-kompass-backup.timer` und Alter des letzten
  erfolgreichen Backup-Logs,
- `systemctl status versorgungs-kompass-backup-check.timer` und Alter des
  letzten erfolgreichen Repository-Checks,
- freien Platz und Inodes fuer `/var/lib/versorgungs-kompass`,
- VPS-CPU, RAM, Swap, Load und unerwartete Reboots,
- Zertifikatsablauf und DNS-`A`/`AAAA` von einem externen Netz.

Nuetzliche lokale Logs:

```bash
sudo journalctl -u versorgungs-kompass.service --since today
sudo journalctl -u versorgungs-kompass-backup.service --since today
sudo journalctl -u versorgungs-kompass-backup-check.service --since '8 days ago'
sudo docker compose \
  --env-file /etc/versorgungs-kompass/single-server.env \
  --project-directory /opt/versorgungs-kompass/current/deploy/single-server \
  -f /opt/versorgungs-kompass/current/deploy/single-server/compose.yaml ps
```

Ein externer Verfuegbarkeitsmonitor kann `/` auf HTTP 200 pruefen. Keine
persoenlichen Login-Cookies oder Tokens in einen Drittmonitor uebernehmen. Ein
200 auf `/` beweist nur die oeffentliche Startseite; mindestens ein eigener
alarmierter `status.sh`-Lauf bleibt erforderlich. Die mitgelieferten Units
konfigurieren noch keinen E-Mail-/Pager-Empfaenger. Der Betreiber muss
systemd-Fehler und VPS-Schwellwerte im gewaehlten Monitoringdienst aktiv auf
eine erreichbare Person routen.

## 12. Nutzer sofort sperren

Eine Sperre muss Gateway **und** Datenbank abdecken. Zuerst in einer Root-Shell
die globale Wartungssperre erwerben und erst danach die Datenbankverbindung ohne
Ausgabe des Passworts oeffnen:

```bash
sudo -i
source /opt/versorgungs-kompass/current/deploy/single-server/common.sh
single_server_load_environment /etc/versorgungs-kompass/single-server.env
single_server_acquire_maintenance_lock user-block
single_server_assert_no_maintenance_recovery_markers
single_server_compose exec postgres sh -c \
  'PGPASSWORD="$(cat /run/secrets/db-owner-password)" exec psql --no-psqlrc -U vk_owner -d versorgungs_kompass'
```

In `psql` erst genau den erwarteten Datensatz pruefen:

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
klaeren:

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
erstellen; dadurch werden **alle** Nutzer abgemeldet. Anschliessend negativen
Zugriff der gesperrten und positiven Zugriff mindestens einer verbleibenden
Person pruefen. Soll die letzte zugelassene Person gesperrt werden, den gesamten
Stack stoppen; `allowed-emails` akzeptiert absichtlich keine leere Liste.
Bei einem Fehler vor `single_server_release_maintenance_lock` die Root-Shell
nicht fuer andere Arbeiten weiterverwenden: Die gehaltene Sperre blockiert
absichtlich konkurrierende Betriebsaktionen, bis der Vorgang geklaert oder die
Shell beendet wird.

## 13. Ende des Uebergangsbetriebs

Vor Abschaltung Schreibzugriffe stoppen, finales Backup erzeugen, Restore-Test
erfolgreich pruefen und die fachliche Aufbewahrung festlegen. Erst danach DNS
und OAuth-Client kontrolliert stilllegen. VPS, Datentraeger, S3-Snapshots,
Google-Credentials und alte GCP-Ressourcen sind getrennte Loeschobjekte und
werden nur nach eigener dokumentierter Freigabe entfernt. Das Ende des
Single-Server-Betriebs autorisiert insbesondere keine automatische
GCP-Loeschung.
