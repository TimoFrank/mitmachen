# Repository-Governance vor PoC und späterem Regelbetrieb

Stand: 4. August 2026

Ein Teil dieser Einstellungen liegt außerhalb des Git-Repositories. Der technische Basisschutz ist aktiv. Für den aktuellen Gematik-PoC werden ein sauberer, unveränderlicher RC und die vereinbarten Prüfungen benötigt. Weitere Organisationsregeln werden erst bei einem späteren Ausbau festgelegt.

## 1. Default Branch `main`

- Pull Request vor Merge verpflichtend.
- Pull Requests, der erforderliche Check `Minimal repository check`, aufgelöste Review-Kommentare sowie das Verbot von Force Push und Branch-Löschung sind aktiv.
- Solange nur ein Maintainer vorhanden ist, sind formal null externe Freigaben erforderlich; vor Pilotbetrieb mindestens eine bestätigte Review festlegen.
- Für Deployment-/Security-Pfade nach Aktivierung von CODEOWNERS eine Code-Owner-Review verlangen.
- Eigene Freigabe des letzten Pushers ausschließen, sobald ein zweiter bestätigter Reviewer zur Verfügung steht und der GitHub-Tarif dies unterstützt.
- Offene Review-Kommentare müssen vor Merge aufgelöst sein.
- `Zielbetriebs-Check` vor Pilotbetrieb als erforderlichen Check aufnehmen oder ohne Pfadfilter immer bereitstellen; derzeit ist er ein zusätzlicher, pfadbezogener Nachweis.
- Administrator-Bypass für den Zielbetriebsprozess deaktivieren oder als dokumentierten Break-glass-Prozess mit Nachkontrolle behandeln.

Der Weekly-Release-Prozess erzeugt weiterhin einen Pull Request und darf diese
Grenze nicht durch einen direkten Bot-Push umgehen. Der Zeitplan öffnet oder
aktualisiert ausschließlich einen Draft-PR und stößt die Pflichtchecks auf
dessen exaktem Head an. Review und Merge bleiben eine bewusste
Maintainer-Entscheidung; der Workflow aktiviert weder Auto-Merge noch einen
direkten Merge.

Neue Produkt-Releases verwenden genau einen signierten, annotierten Git-Tag im
Schema `vX.Y.Z`. Alle `0.x`-Versionen werden bei GitHub als Prerelease und nicht als
`Latest` veröffentlicht. Nach dem Merge werden Tagobjekt und Zielcommit
verifiziert; anschließend wird das öffentliche Pages-Demo-Artefakt aus exakt
dieser Revision gebaut, deployed und geprüft. Patch-Releases können manuell
angestoßen werden; Wochen ohne Änderungen erzeugen keinen Release. GitHub
benachrichtigt die Release-Abonnenten erst nach der Veröffentlichung.
Produkt-Releases lösen niemals automatisch einen privaten GKE- oder
Zielbetrieb-Deploy aus.

## 2. GitHub Environment `github-pages`

- GitHub Pages verwendet bereits `GitHub Actions` als Source und veröffentlicht `dist/pages/` direkt.
- Deployment-Branch ist auf `main` beschränkt.
- Keine GCP-, Datenbank-, historischen Supabase-Service-Role- oder Zielbetriebs-Secrets hinterlegen.
- Pages bleibt die dauerhaft getrennte, öffentliche Demo und ist kein Freigabenachweis für GKE.

## 3. GitHub Environment `pre-gematik`

- Derzeit ist nur `main` zugelassen.
- `TimoFrank` ist während der Ein-Personen-Pre-Integration Required Reviewer; Selbstfreigabe ist deshalb technisch erlaubt. Vor Pilotbetrieb Reviewer aus Plattformbetrieb und Produktverantwortung festlegen und Selbstfreigabe ausschließen.
- WIF-Provider weiterhin auf Repository, Environment und freigegebene Git-Referenz begrenzen.
- Nur nicht geheime Zielparameter als Environment-Variablen führen.
- Keine Service-Account-JSON-Datei, kein Datenbankpasswort und keine OAuth-Clientwerte in GitHub speichern.
- `prevent self-review` und `disallow admin bypass` aktivieren, wenn Tarif und Organisationsrichtlinie dies erlauben.

Die frühere [persönliche Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md) gilt nur für die GCP-Pre-Integration. Das persönliche GCP-Projekt und persönliche Break-glass-Konto werden nicht für den gematik-PoC übernommen.

### Datenplattform und Providerstilllegung

- Cloud SQL/PostgreSQL ist die einzige Datenbankquelle der geschützten GCP-Anwendung; private Anwendungsobjekte liegen ausschließlich in GCS.
- Supabase-Laufzeitcode, Schemaquellen und Provider-Migrationswerkzeuge gehören nicht mehr zum aktuellen Repository. Historische Security- und Cutover-Nachweise bleiben ausdrücklich als gekennzeichnete Evidenz erhalten.
- Negativprüfungen gegen Browser-SDK, Projekt-URLs, Schlüssel, direkte Provider-Datenpfade und unsichere Fallbacks bleiben Teil der Repository-Gates.
- Das Löschen von Git-Dateien ist kein Nachweis für die Abschaltung externer Ressourcen. Projekte, Datenbank, Storage, Edge Functions, Auth-Nutzer und -Sessions, Schlüssel, Webhooks, DNS-Verweise und Sicherungen werden in einem separaten, freigegebenen Betriebsvorgang inventarisiert, gesperrt beziehungsweise gelöscht und protokolliert.

## 4. Optionale Publish-Automatisierung mit `release-signing`

Das Workflow-Environment ist für die regelmäßige Draft-Planung nicht
erforderlich. Es wird nur benötigt, wenn die vorhandene umfassende
Publish-Automatisierung später bewusst aktiviert werden soll. Bis dahin bleibt
diese optionale Veröffentlichung über `PRODUCT_RELEASE_PUBLISH_ENABLED`
gesperrt; ein Maintainer kann den geprüften Release stattdessen in einem
getrennten manuellen Vorgang signieren und veröffentlichen.

Auch die übrigen Einstellungen außerhalb des Repositories werden unmittelbar
vor der Aktivierung erneut fail-closed geprüft. Am 4. August 2026 ist die
Release-Immutability aktiviert; der Branchschutz von `main` ist jedoch noch
nicht strikt und verlangt nur `Minimal repository check`. Ein
veröffentlichender Lauf bleibt deshalb gesperrt, bis `strict=true` gilt und
sowohl `Minimal repository check` als auch `PoC-/Target-Readiness` erforderliche
Checks sind.

- Deployment-Branch ist ausschließlich `main`.
- Der private OpenPGP-Signiersubkey liegt nur im Environment-Secret
  `RELEASE_TAG_GPG_PRIVATE_KEY`; seine erforderliche Passphrase liegt getrennt
  in `RELEASE_TAG_GPG_PASSPHRASE`. Beide Secrets müssen vor einem
  veröffentlichenden Lauf vorhanden sein. Der Export enthält den nur offline
  verfügbaren, ausschließlich zur Zertifizierung befähigten Primary Key als
  Stub und genau einen online nutzbaren Ed25519-Signiersubkey.
- Das zusätzliche Environment-Secret `RELEASE_GOVERNANCE_READ_TOKEN` ist ein
  ablaufender Fine-grained PAT für genau dieses Repository mit ausschließlich
  `Administration: read`. Der Workflow verwendet ihn nur, um die aktive
  Release-Immutability unmittelbar vor Tag-Erzeugung und Veröffentlichung sowie
  den strikten Branchschutz vor dem Release-PR read-only nachzuweisen. Er
  ersetzt weder `GITHUB_TOKEN` für Inhaltsänderungen noch den Signierschlüssel
  und wird nach einem dokumentierten Zeitplan rotiert.
- Erwarteter Fingerprint, öffentlicher Schlüssel, Signer-Name und verifizierte
  Signer-E-Mail sind nicht geheime Repository-Variablen. So können auch die
  separaten Verifikations- und Pages-Jobs darauf zugreifen, ohne das
  `release-signing`-Environment oder dessen Secrets zu öffnen.
  `RELEASE_TAG_GPG_FINGERPRINT` bezeichnet dabei ausdrücklich den Fingerprint
  des Signing-Subkeys; der zugehörige öffentliche Schlüssel liegt in
  `RELEASE_TAG_GPG_PUBLIC_KEY`. Der Workflow vergleicht beide vor jeder
  Signatur und Verifikation exakt.
- Der Signing-Job führt weder `npm ci` noch Repository-Skripte aus. Er verwendet
  ein temporäres `GNUPGHOME`, protokolliert keine Schlüsseldaten und gibt den
  privaten Schlüssel niemals als Output oder Artefakt weiter. Der
  Branchschutz-Nachweis bleibt im repo-codefreien Bereitschaftsgate;
  Immutability wird in zwei getrennten read-only Schritten unmittelbar vor Tag
  und Veröffentlichung geprüft. Keiner dieser Schritte führt npm oder ein
  Repository-Skript aus, und die nachfolgenden Mutationsschritte erben den
  Governance-Token nicht.
- Ein separater Job ohne privaten Schlüssel prüft Tagobjekt, Zielcommit,
  Fingerprint, `git verify-tag` und den GitHub-Verifikationsstatus, bevor Pages
  gebaut oder ein Release veröffentlicht werden darf.
- Ein Tag-Ruleset für `v*` verbietet nach der kontrollierten Erzeugung jede
  Aktualisierung und Löschung. Die vorhandene Release-Immutability bleibt
  zusätzlich aktiv.
- Vor dem ersten veröffentlichenden Lauf bestätigt ein read-only API-Nachweis
  erneut die aktive Release-Immutability, den strikten Branchschutz und beide
  erforderlichen Checks. Der Actions-Standardtoken reicht für den
  Immutability-Endpunkt nicht aus; ein fehlender oder abgelaufener
  Governance-Token stoppt den Lauf vor jeder irreversiblen Mutation. Erst
  danach werden Signatur-Dry-Run und Publish-Schalter für die optionale
  Publish-Automatisierung freigegeben. Der Draft-Plan bleibt davon unabhängig.
- Falls die vollautomatische Veröffentlichung später reaktiviert wird, erhält
  das Environment erst nach erfolgreicher Abnahme seine dafür nötige
  Konfiguration. Änderungen an Environment, Trust Anchor oder Schlüsseln
  bleiben ein gesonderter, protokollierter Betriebsvorgang.

## 5. Release Candidate und gematik-Zielpfad

- `main` bleibt bis zur institutionellen GitLab-Übernahme die führende
  Integrationslinie und Pages-Quelle. Das Target wird niemals automatisch aus
  dem jeweils neuesten `main` deployed.
- Für alle neuen Versionen gibt es nur den signierten, annotierten Git-Tag
  `vX.Y.Z`. „Release Candidate“ ist vor `v1.0.0` GitHub-Prerelease-Status und
  Titelbestandteil, keine zweite Tagfamilie. Ein Fix erhöht den Patchstand, zum
  Beispiel von `v0.23.0` auf `v0.23.1`.
- Ein kurzlebiger Stabilisierungsbranch ist zulässig, aber keine Umgebung. Der
  freigegebene Tag ist unveränderlich und zeigt auf genau einen geprüften
  Commit. Vorhandene Tags werden weder verschoben noch durch Force Push
  ersetzt.
- Die Pages-Demo bleibt öffentlich, anonym und synthetisch. Das persönlich
  betriebene GKE verwendet IAP und GCP-spezifische Werte; es ist kein
  Zielbetriebsnachweis. Das Target verwendet OIDC und wird in der Software
  Factory frisch gebaut. Vor dem Cutover ist GitHub die Quellautorität; danach
  übernimmt das geschützte GitLab-Projekt diese Rolle.
- Es gilt keine Cross-Channel-Promotion: GKE-/IAP-Images und Pages-Artefakte
  werden nicht zum Target umgetaggt. Die Software Factory baut die exakt
  referenzierte Revision neu und dokumentiert die Digests von Frontend, Image
  und gerendertem Helm-Manifest. Eine Promotion ohne Rebuild ist erst innerhalb
  desselben Target-Kanals und nur mit identischen Digests zulässig.
- Die vorbereitete GitLab-Übergabe überträgt ein voraussetzungsfreies
  Git-Bundle mit genau `main`, allen Tags und den vollständigen erreichbaren
  Git-Objekten. Tagobjekt-SHA, Zielcommit, Signer, Ref-Inventar und Prüfsummen
  werden auf beiden Seiten verifiziert. Das Prüfsummenmanifest besitzt eine
  abgetrennte Signatur, die vor der Auswertung der Hashwerte gegen den extern
  bestätigten Trust Anchor geprüft wird. Ein ZIP des lokalen
  Arbeitsverzeichnisses, uncommittierte Dateien, `dist/`, persönliche
  Infrastrukturwerte, Secrets und Daten gehören nicht zur Übergabe.
- Nach dem GitLab-Cutover existiert genau eine beschreibbare führende
  Integrationslinie. Eine bidirektionale Parallelpflege von `main` in GitHub und
  GitLab ist nicht zulässig.
- Zeitpunkt, Prüfsumme und Ergebnis einer geschützten Datenübernahme werden
  getrennt vom Build festgehalten. `v1.0.0` setzt ein verifiziertes
  gematik-Deployment voraus; Pages oder privates GKE erfüllen dieses Gate nicht.
- Die historischen Tags `v0.21.0`, `v0.22.0` und
  `poc-v0.1.0-rc.2` bis `poc-v0.1.0-rc.5` bleiben unverändert. Sie werden nicht
  nachsigniert oder in das neue Namensschema überführt.

Das aktuelle Vorgehen steht im
[PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md); der kontrollierte Quellenwechsel
ist im
[GitLab-/Software-Factory-Übergaberunbook](GITLAB_SOFTWARE_FACTORY_UEBERGABE.md)
beschrieben.

## 6. Actions- und Abhängigkeitsrichtlinie

- Standardberechtigung für `GITHUB_TOKEN`: read-only; Schreibrechte nur jobbezogen.
- Externe Actions nur mit voller Commit-SHA, nicht nur mit beweglichem Tag.
- Dependabot für npm, GitHub Actions und den API-Docker-Build ist vorbereitet.
- Die zulässigen Actions/Organisationen nach interner Supply-Chain-Richtlinie beschränken.
- Selbst gehostete Runner als nicht isolierte Infrastruktur behandeln und Secretzugriff entsprechend begrenzen.

## 7. Roadmap- und Backlog-Pflege

- Milestones bündeln Issues nach Lieferziel oder Release. Der Fortschritt ergibt sich aus den tatsächlichen Issue-Zuständen, nicht aus manuell duplizierten Checklisten.
- GitHub Projects pflegt Reihenfolge, Phase, Priorität und teamübergreifende Statusfelder in geeigneten Views.
- Einzel-Issues bleiben die Quelle für Scope, Abhängigkeiten, Akzeptanzkriterien und aktuelle Testnachweise.
- Roadmap-Zusammenfassungen verlinken Milestone, Project-View, Issues, Pull Requests oder Tests auf dem aktuellen Standardbranch. Commit-SHAs aus umgeschriebener oder bereinigter Historie sind kein dauerhafter Statusnachweis.
- Abgeschlossene Roadmap-Issues werden geschlossen und bleiben als historische Zusammenfassung unverändert.

## 8. CODEOWNERS

`.github/CODEOWNERS` ist aktiv und nennt mit `@TimoFrank` ausschließlich einen bestätigten, realen Repository-Account. Damit ist heute eindeutig sichtbar, wer Änderungen an Anwendung, Deployment, Datenvertrag und Sicherheitsgrenzen fachlich beziehungsweise technisch prüfen muss. Sobald institutionelle Produkt-, Plattform-, Daten- und Security-Teams in der Zielorganisation existieren, ersetzt die Repository-Administration diesen Übergangs-Owner durch die bestätigten Teamhandles. Eine verpflichtende Code-Owner-Freigabe wird erst aktiviert, wenn mindestens eine zweite unabhängige Person reviewen kann.

## 9. Nachweis

Die wirksamen Einstellungen werden vor dem PoC kurz im Release-Nachweis referenziert. Abweichungen erhalten Ansprechperson und Frist.
