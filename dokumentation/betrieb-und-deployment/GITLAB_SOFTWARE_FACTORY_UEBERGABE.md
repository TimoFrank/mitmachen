# Übergabe an GitLab und die Software Factory

Status: freigegebener Übergabevertrag, noch nicht ausgeführt
Stand: 4. August 2026

Dieses Runbook beschreibt die einmalige, verifizierbare Übernahme der
Git-Historie aus dem persönlichen GitHub-Repository in ein institutionelles
GitLab-Projekt. Es überträgt Quellobjekte, aber weder fertige
Deployment-Artefakte noch Betriebsdaten. Das Anlegen des GitLab-Projekts, das
Einrichten eines Remotes und jeder Push benötigen eine gesonderte operative
Freigabe und sind nicht Bestandteil dieses Arbeitsschritts.

Der aktuelle Target-Pfad akzeptiert ausschließlich einen signierten,
annotierten Produkt-Tag im Format `vX.Y.Z`. Für `v0.23.0` lautet der sichtbare
GitHub-Prerelease-Titel `0.23.0-0 Release Candidate`. „Release Candidate“ ist
Release-Metadatum und kein Tag-Suffix. Namen wie `poc-v…`, `-rc.N` oder
`v0.23.0-0` sind keine neuen technischen Tags.

Die RC.2- bis RC.5-Tags und die
[RC.5-Übergabenotiz](UEBERGABE_RC5_SOFTWARE_FACTORY.md) bleiben unveränderte
historische Evidenz. Sie sind weder aktueller Pipeline-Eingang noch Vorlage für
eine neue Übergabe.

## Unveränderliche Grenzen

- Bis zum Cutover ist GitHub die einzige beschreibbare Quellautorität. Nach dem
  Cutover ist GitLab die einzige beschreibbare Quellautorität.
- Es gibt keine bidirektionale Synchronisation und keine parallelen
  beschreibbaren `main`-Linien. Ein späterer GitHub-Spiegel ist ausschließlich
  für Menschen read-only und erhält Inhalte höchstens einseitig aus GitLab.
- Übertragen wird ein frisch aus der autoritativen Remote-Quelle erzeugtes,
  voraussetzungsfreies Git-Bundle mit genau `refs/heads/main` und allen
  `refs/tags/*`. Feature-, Remote- und Arbeitsbranches sind ausgeschlossen.
- Der freigegebene Produkt-Tag, sein Tagobjekt, sein Zielcommit und das
  vollständige Ref-Inventar müssen vor und nach dem Transfer identisch sein.
- Der Target-Build wird in GitLab beziehungsweise der Software Factory immer
  frisch aus dem verifizierten Tag gebaut. Pages- oder private GKE-Artefakte
  werden nicht übernommen oder umgetaggt.
- Der Target-Build verwendet OIDC. IAP, Google Identity Platform, Firebase und
  das persönliche GKE-Identity-Portal sind keine Target-Build-Eingaben.
- Die erste stabile Version `v1.0.0` wird durch diese Übergabe nicht
  autorisiert. Ihre ausdrückliche Freigabe mit verifiziertem Target-Deployment
  bleibt ein eigener Folgeschritt im
  [Produkt-Release-Prozess](PRODUKT_RELEASE_PROZESS.md#freigabe-von-v100).

Ein vollständiger Git-Commit enthält naturgemäß auch die versionierten Quellen
und Konfigurationsverträge der getrennten Pages- und GKE-Kanäle. Sie können
nicht aus dem Commit entfernt werden, ohne dessen SHA und die Tag-Signatur zu
verändern. Verboten sind daher deren gebaute Artefakte sowie persönliche oder
operative Werte als zusätzliche Transferdateien oder Target-Build-Eingaben.

## Rollen und Vertrauensanker

| Rolle | Verantwortung |
| --- | --- |
| Quellverantwortung | bestätigt GitHub-Repository, aktuellen geschützten `main`, freigegebenen Tag und Transferfenster |
| Release-Verantwortung | bestätigt Tagobjekt-SHA, Zielcommit-SHA und Fingerprint des Release-Signierschlüssels |
| GitLab-Administration | stellt ein leeres Projekt, geschützten `main`, geschützte Tags und Runner-Regeln bereit |
| Software Factory | prüft die Quelle erneut, baut das OIDC-Target frisch und bewahrt die Build- und Deployment-Nachweise auf |

Der öffentliche Release-Schlüssel und sein vollständiger Fingerprint werden
über einen unabhängigen, vorab vereinbarten Kanal bestätigt, zum Beispiel in
einem persönlich oder institutionell authentisierten Übergabeprotokoll. Die im
Paket enthaltene Datei `release-signing-public-key.asc` ist nur eine
Transportkopie. Sie ist niemals allein der Vertrauensanker. Der private
Signierschlüssel und seine Passphrase werden nicht übertragen.

## Inhalt des Übergabepakets

Das Übergabeverzeichnis enthält exakt fünf reguläre Dateien und keine
Unterverzeichnisse:

| Datei | Inhalt |
| --- | --- |
| `versorgungs-kompass-vX.Y.Z-source.bundle` | vollständiges, voraussetzungsfreies Git-Bundle mit genau `main` und allen Tags |
| `handoff-manifest.json` | Quell-URL, Ref-Inventar, Tagobjekt, Zielcommit, Fingerprint und Transferregeln |
| `release-signing-public-key.asc` | öffentliche Transportkopie des Release-Schlüssels |
| `SHA256SUMS` | SHA-256-Prüfsummen der drei übrigen Dateien |
| `SHA256SUMS.asc` | abgetrennte, ASCII-armierte OpenPGP-Signatur von `SHA256SUMS` durch den bestätigten Release-Signing-Subkey |

Nicht zulässig sind Arbeitsordner-ZIPs, Pages- oder GKE-Builds, Container-
Images, persönliche Helm-Werte, GCP-/IAP-Konfiguration, Secrets, Daten,
Snapshots, Backups, Tokens, OIDC-Subjects oder Profilzuordnungen. Solche Inhalte
werden getrennt nach ihren Betriebs- und Datenschutzverfahren behandelt.

## Phase A: Quelle auf GitHub einfrieren und paketieren

Voraussetzungen:

1. Der freigegebene `vX.Y.Z`-Tag ist signiert, annotiert, unveränderlich und
   Bestandteil der Historie des geschützten `origin/main`.
2. Der Checkout ist sauber und steht exakt auf dem frisch geladenen
   `origin/main`. Ein lokaler, möglicherweise veralteter `main` genügt nicht.
3. Quell-URL, Tag, vollständiger Fingerprint und extern bestätigter öffentlicher
   Schlüssel sind als vier getrennte Eingaben bekannt.
4. Schlüsseldatei und neues leeres Ausgabeverzeichnis liegen außerhalb des
   Git-Checkouts, damit der Quellstand sauber bleibt.
5. Der geschützte Release-Signing-Subkey ist nur für diesen Paketierungslauf im
   GPG-Keyring beziehungsweise Signieragenten verfügbar. Er wird weder
   exportiert noch in Paket, Ausgabeverzeichnis oder Protokoll geschrieben.
6. Während der Paketierung und des Cutovers sind neue Merges, Tags und
   Release-Mutationen auf GitHub eingefroren.

Das Paket wird aus der autoritativen Remote-Quelle erstellt:

```bash
node scripts/package_source_handoff.mjs \
  --tag "vX.Y.Z" \
  --source-remote "origin" \
  --expected-repository-url "<autoritative-github-url>" \
  --public-key-file "<extern-bestaetigter-public-key.asc>" \
  --fingerprint "<vollstaendiger-fingerprint>" \
  --output-dir "<neues-leeres-verzeichnis-ausserhalb-des-checkouts>"
```

`package_source_handoff.mjs` arbeitet fail-closed. Es prüft den sauberen,
aktuellen Remote-`main`, Quell-URL, Produktversion, Tagobjekt, Zielcommit und
Signatur. Danach lädt es `main` und alle Tags erneut in ein temporäres Bare-
Repository, führt `git fsck --strict --full` aus, erzeugt das Bundle und
verifiziert einen vollständigen Mirror-Import. Erst dann schreibt es Manifest,
öffentlichen Schlüssel und `SHA256SUMS`, signiert das Prüfsummenmanifest
abgetrennt als `SHA256SUMS.asc` und verifiziert diese Signatur selbst noch
einmal gegen die paketierte öffentliche Schlüsselkopie.

Für das Übergabeprotokoll werden mindestens festgehalten:

- Quell-URL und Zeitpunkt des Freeze,
- Produkt-Tag und Produktversion,
- Tagobjekt-SHA und aufgelöster Commit-SHA,
- vollständiger Signer-Fingerprint,
- SHA-256 des Bundles und
- SHA des eingefrorenen `refs/heads/main`.

## Phase B: Transport und unabhängige Eingangsprüfung

Das unveränderte Verzeichnis wird über den vereinbarten geschützten
Transferkanal bereitgestellt. Öffentlicher Schlüssel und Fingerprint werden
zusätzlich außerhalb dieses Kanals bestätigt. Die empfangende Seite verwendet
für die Prüfung ihre unabhängig bestätigte Schlüsseldatei, nicht blind die
Paketkopie:

```bash
node scripts/verify_source_handoff.mjs \
  --input-dir "<empfangenes-uebergabeverzeichnis>" \
  --public-key-file "<extern-bestaetigter-public-key.asc>" \
  --fingerprint "<extern-bestaetigter-vollstaendiger-fingerprint>" \
  --expected-repository-url "<autoritative-github-url>"
```

`verify_source_handoff.mjs` akzeptiert nur die fünf definierten Dateien. Nach
der reinen Datei- und Größenprüfung verifiziert es zuerst `SHA256SUMS.asc`
gegen den unabhängig bestätigten öffentlichen Schlüssel und Fingerprint. Erst
danach interpretiert es die signierten Prüfsummen und das Manifest. Es prüft
die Gleichheit des paketierten und extern bestätigten öffentlichen Schlüssels,
das Fehlen privaten Schlüsselmaterials, die Manifestfelder und das exakte
Ref-Inventar. Anschließend folgen
`git bundle verify`, ein vollständiger Mirror-Import,
`git fsck --strict --full`, die Tag-Signaturprüfung sowie die Bindung von
Produktversion, Tagobjekt, Zielcommit und `main`-Historie.

Jede Abweichung beendet die Übergabe. Das Paket wird weder repariert noch um
einzelne Objekte ergänzt. Stattdessen wird nach Ursachenklärung aus der noch
führenden GitHub-Quelle ein vollständig neues Paket erzeugt.

## Phase C: Einmaliger GitLab-Import und Paritätsnachweis

Diese Phase beginnt erst nach gesonderter Freigabe und mit einem leeren
GitLab-Projekt. GitLab erzeugt bei der Projektanlage keine README, Lizenz,
`.gitignore`-Datei oder Initial-Commits.

1. Das erfolgreich geprüfte Bundle wird in ein temporäres Mirror-Repository
   importiert.
2. Genau `refs/heads/main` und alle `refs/tags/*` werden einmalig in das leere
   GitLab-Projekt geschrieben. Andere Branches und Refs werden nicht erzeugt.
3. Quelle, Übergabemanifest, temporärer Import und GitLab werden anhand eines
   vollständigen, sortierten Ref-Inventars verglichen.
4. Für den freigegebenen Tag werden zusätzlich Tagobjekt-SHA, Zielcommit-SHA,
   Signatur und Fingerprint erneut geprüft. `git fsck --strict --full` muss auch
   auf dem aus GitLab frisch geklonten Mirror erfolgreich sein.
5. Das Manifest muss weiterhin exakt die eingefrorene GitHub-Quell-URL nennen;
   die neue GitLab-URL wird getrennt als künftige Quellautorität protokolliert.
   Eine URL wird nicht still durch die andere ersetzt.
6. GitLabs Default-Branch wird auf `main` gesetzt. Erst nach aktiven
   Schutzregeln und grünem Paritätsprotokoll darf der Cutover erklärt werden.

Bis zur Cutover-Erklärung bleibt GitHub die Quellautorität und unter Freeze.
Scheitert die Prüfung, wird der unfreigegebene GitLab-Import verworfen oder
isoliert; GitHub bleibt führend. Es findet kein Rück-Push statt.

## Phase D: Single-Writer-Cutover

Der Cutover wird mit Zeitpunkt, Verantwortlichen, letztem autoritativen
GitHub-`main`-SHA und erstem autoritativen GitLab-`main`-SHA protokolliert.
Beide SHAs sowie das gesamte Ref-Inventar müssen identisch sein.

Vor der Erklärung gelten in GitLab mindestens:

- `main` ist geschützt; direkte Pushes und Force-Pushes sind gesperrt,
- Änderungen erreichen `main` nur über Merge Requests und erforderliche
  Prüfungen,
- `v*`-Tags sind geschützt; Erzeugung ist auf die Release-Rolle begrenzt,
  Aktualisierung und Löschung sind gesperrt,
- Variablen, Schlüssel und Runner für Release- und Target-Jobs sind geschützt,
  umgebungsgebunden und nicht in ungeschützten Pipelines verfügbar,
- der Target-Job ist manuell freizugeben und akzeptiert ausschließlich einen
  vollständigen, signierten `vX.Y.Z`-Tag.

Nach der Cutover-Erklärung entstehen Merges und Tags nur noch in GitLab.
GitHub wird archiviert oder als für Menschen nicht beschreibbarer,
nachgelagerter Spiegel geführt. Falls der öffentliche GitHub-Release-Kanal
erhalten bleibt, darf ausschließlich eine geschützte GitLab-Automatisierung
Tag, Release-Metadaten und öffentliche Pflichtartefakte einseitig dorthin
spiegeln. Dieser Ausgabekanal macht GitHub nicht wieder zur Quellautorität.

Ein Rückfall nach dem Cutover wird nicht durch bidirektionale Synchronisation
gelöst. Er benötigt eine neue, protokollierte Autoritätsentscheidung und einen
erneuten vollständigen Paritätsnachweis.

## Phase E: Geschützter Target-Build

Der manuelle Software-Factory-Job beginnt mit einem frischen Checkout des
autoritativen GitLab-`main` und einem expliziten Release-Tag `vX.Y.Z`. Vor jedem
Build prüft `scripts/verify_target_release_source.mjs` mindestens:

- erwartete GitLab-Quell-URL und sauberen Checkout,
- Übereinstimmung mit dem aktuellen geschützten Remote-`main`,
- Remote- und lokales Tagobjekt sowie aufgelösten Commit,
- Signatur gegen den extern bestätigten Schlüssel und Fingerprint,
- Zugehörigkeit des Tag-Zielcommits zur `main`-Historie und
- Übereinstimmung von Tag und `config/release.json.productVersion`.

Nur danach baut die Pipeline Frontend, API-Image und Helm-Projektion neu mit
dem Profil `target` und `TARGET_AUTH_MODE=oidc`. Sie übernimmt keine
Pages-/GKE-Artefakte und keinen früheren Container-Digest als Build-Eingang.
Laufzeitwerte für OIDC, Datenbank und Secrets werden erst über die geschützte
Zielumgebung gebunden.

Der Job läuft exklusiv auf einem geschützten Target-Deployment-Runner; parallele
Läufe desselben Jobs sind gesperrt. Ein nur lesbarer SSH-Deploy-Key stellt den
authentisierten Zugriff auf die private GitLab-Quelle für Quell-Gate und alle
späteren Remote-Rechecks bereit. Kubeconfig und Kontext sind jobgebundene
Credentials und werden Helm sowie `kubectl` immer explizit übergeben. Reale
Gateway-CIDRs und kurzlebige OIDC-Smoke-Credentials kommen ebenfalls nur aus
geschützten Bindungen; die versionierten TEST-NET-Werte sind nicht deploybar.

Die zentralen Security-Gates werden zweiphasig aus einem geschützten, für den
Target-Job nur lesbaren
`EXTERNAL_SECURITY_EVIDENCE_ROOT/<BUILD_TAG>` importiert. Vor dem Registry-Push
müssen `sonarqube-gate.json`, `snyk-gate.json`,
`dependency-track-gate.json` und `cosign-attestation-ready.json` atomar und
unveränderlich vorliegen. Sie binden Build-ID, Produkt-Tag, Quell-URL,
Quellcommit, Image-Repository und beide SBOM-Digests. Erst nach dem Push kommt
`cosign-attestation.json` hinzu; dessen Subject muss exakt das gerade
veröffentlichte `<image-repository>@<sha256-digest>` sein.

Symlinks, zusätzliche Dateien, beschreibbare Nachweise, unzulässige Größen,
Hashänderungen während des Imports, fehlende Felder oder abweichende Bindungen
stoppen fail-closed. Ohne Pre-Push-Gates gibt es keinen Image-Push. Ohne die
Post-Push-Attestation bleiben das bereits gepushte Image unfreigegeben und
Helm, Evidence-Zusammenführung, Frontend-Staging sowie Deployment gesperrt. Der
vollständige Dateivertrag steht in der
[Security-Konfiguration](../../config/security/README.md#nachweise-pro-release-candidate).

Der Nachweis verbindet mindestens GitLab-Quell-URL, `main`-SHA, Produkt-Tag,
Tagobjekt-SHA, Commit-SHA, Signer-Fingerprint, Target-Buildprofil,
Frontend-Digest, API-Image-Digest, Digest des gerenderten Helm-Manifests,
zentrale Security-Gates, manuelle Freigabe, Deploymentziel und technischen
OIDC-Smoke. Jenkins archiviert diesen gebundenen technischen
Deploymentnachweis nach Rollout, Health, Readiness, anonymer Ablehnung und
positiver Profil-/Rollenbindung. Er kennzeichnet die umfassende betriebliche
Abnahme weiterhin als ausstehend. Erst das getrennte Abnahmeprotokoll für
Frontend/Login, manipulierten Token, Netzisolation, Rollenmatrix, synthetischen
CRUD mit Bereinigung und DB-Stichprobe begründet den Projektstatus `deployed`;
Paketimport, Build oder technischer Smoke allein tun das nicht.

## Abschlusskriterien der Übergabe

Die Quellübergabe ist erst abgeschlossen, wenn alle folgenden Punkte
protokolliert sind:

- Paket- und Eingangsprüfung erfolgreich,
- GitHub-, Manifest-, Bundle- und GitLab-Ref-Inventar identisch,
- Tagobjekt, Commit und Signer-Fingerprint identisch und verifiziert,
- `git fsck --strict --full` vor und nach dem Import erfolgreich,
- GitLab-Schutzregeln und manueller signierter Target-Tag-Gate aktiv,
- Single-Writer-Cutover mit Zeitpunkt und Verantwortlichen erklärt,
- GitHub nach dem Cutover nicht mehr beschreibbare Quellautorität und
- kein verbotenes Sidecar oder kanalübergreifendes Build-Artefakt übertragen.

Ein später erfolgreich gebauter und per OIDC geprüfter Target-Release ist ein
eigener Deploymentnachweis. Die ausdrückliche Autorisierung der ersten stabilen
Version `v1.0.0` bleibt anschließend der geplante Folgeschritt 6.
