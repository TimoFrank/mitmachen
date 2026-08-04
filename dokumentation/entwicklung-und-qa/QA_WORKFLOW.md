# QA Workflow

Stand: 2026-08-04.

Dieses Dokument legt fest, wie Änderungen am Versorgungs-Kompass geprüft werden, ohne für kleine Aufgaben unnötig viel Kontext und Testlaufzeit zu verbrauchen.

## Verbindliche Zwei-App-Matrix

| Prüfobjekt | Zulässige Daten und Authentisierung | Verbotener Fallback |
| --- | --- | --- |
| `pages-demo` / `dist/pages` | synthetische CRM-/Fachdaten plus kuratierter öffentlicher Bundestags-Snapshot, `anonymous-demo` | Fach-API, Supabase, Target-Konfiguration, echte Sitzungen oder echte Registrierungen |
| `target` / `dist/target` | Daten ausschließlich über `/api/...`; OIDC im gematik-PoC und einem späteren Zielpfad, IAP nur im GKE-Pre-Integrationspfad | Demo-Daten, direkter Browser-Supabase-Zugriff, LocalStorage-Fachdaten oder LocalStorage-Ersatzsitzung |

Pages bleibt als öffentliche Demo aktiv. Eine erfolgreiche Pages-Prüfung ist kein Nachweis für die Realanwendung; umgekehrt darf ein Target-Test nie das Pages-Artefakt mit echter Konfiguration nachrüsten.

## Blockierende Gates für einen gematik-PoC-RC

Der [PoC-Durchstich](../betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md)
ist für einen PoC-RC führend. Der Check läuft auf einem sauberen Checkout des
aktuellen geschützten `main`; gebaut wird anschließend ausschließlich der
nachgewiesene Commit eines signierten `vX.Y.Z`-Tags. Ein beweglicher lokaler
Arbeitsstand oder operativer `poc-v…`-Tag ist nicht zulässig.

Mindestens blockierend sind:

- der schlanke Target-Release-Vertrag `npm run check:target-release`,
- Dependency-, SAST- und Secret-Prüfungen der CI,
- Target-Readiness, Target-Artefaktaudit, Security- und Deployment-Verträge,
- API-Image bauen, als Non-Root-Prozess starten und `/api/healthz` prüfen,
- Helm linten und mit kleinen PoC-Werten rendern,
- nach Deployment OIDC-/Session-, DB- und synthetischen CRUD-Smoke ausführen,
- Quell-URL, `main`-SHA, Tagobjekt, Commit, Signer-Fingerprint,
  API-Digest und Frontend-Hash gemeinsam nachweisen.

Target-Readiness, der vorhandene `validate_only`-Pfad von
`deploy-pre-gematik.yml` und die Jenkins-Referenzpipeline bauen und starten das
API-Image und prüfen `/api/healthz`. Der `validate_only`-Lauf kann als
zusätzlicher, manuell ausgelöster RC-Nachweis genutzt werden.

Die komplette visuelle Matrix bleibt für Produktentwicklung und größere
Releases sinnvoll. Beim ersten Infrastruktur-PoC blockiert nur der vorher
vereinbarte Desktop-Kernpfad aus `npm run test:poc-smoke`; nicht betroffene visuelle Abweichungen dürfen mit
Owner und Folgeschritt dokumentiert werden. Auth, Datenisolation, Secrets,
Containerstart und API-/Target-Grenzen sind nie abwählbar.

### Quellübergabe- und Target-Gate

Vor einer GitLab-Übernahme gilt zusätzlich das
[Übergaberunbook](../betrieb-und-deployment/GITLAB_SOFTWARE_FACTORY_UEBERGABE.md).
Die Übergabeprüfung ist unabhängig von einem Pages- oder GKE-Build:

1. `scripts/package_source_handoff.mjs` wird in einem sauberen Checkout des
   frisch geladenen autoritativen GitHub-`main` für einen expliziten signierten
   `vX.Y.Z`-Tag ausgeführt. Öffentliche Schlüsseldatei und neues leeres
   Ausgabeverzeichnis liegen außerhalb dieses Checkouts.
2. Das Ergebnis muss genau Bundle, `handoff-manifest.json`,
   `release-signing-public-key.asc`, `SHA256SUMS` und die abgetrennte Signatur
   `SHA256SUMS.asc` enthalten. Das Bundle umfasst genau `refs/heads/main` und
   alle `refs/tags/*`. Der geschützte Signing-Subkey bleibt außerhalb von Paket
   und Repository.
3. Die empfangende Seite führt `scripts/verify_source_handoff.mjs` mit einer
   unabhängig bestätigten öffentlichen Schlüsseldatei, dem außerhalb des
   Pakets bestätigten Fingerprint und der erwarteten GitHub-Quell-URL aus.
4. Die abgetrennte Signatur des Prüfsummenmanifests wird vor dessen Hashwerten
   und Manifestfeldern geprüft. Danach müssen Prüfsummen, exaktes Ref-Inventar,
   `git bundle verify`, Mirror-Import, `git fsck --strict --full`, Tagobjekt,
   Zielcommit, Tag-Signatur und Produktversion gemeinsam erfolgreich sein.
5. Nach dem einmaligen Import werden GitHub, Manifest, Bundle und ein frischer
   GitLab-Mirror erneut vollständig verglichen. Erst dann darf der
   Single-Writer-Cutover erklärt werden.
6. Jeder manuelle Target-Lauf führt
   `scripts/verify_target_release_source.mjs` gegen die dann autoritative
   GitLab-URL, den extern bestätigten Schlüssel und Fingerprint aus. Erst danach
   wird der nachgewiesene Commit frisch mit `TARGET_AUTH_MODE=oidc` gebaut.

Der echte Target-Lauf benötigt zusätzlich einen dedizierten geschützten
Deployment-Runner, ein nur jobgebundenes Kubeconfig samt explizitem Kontext,
geschützte reale Gateway-CIDRs und kurzlebige OIDC-Smoke-Zugangsdaten. Die
Referenzpipeline belegt automatisiert nur technischen Rollout, Health,
Readiness, anonyme Ablehnung und eine positive serverseitige Profil- und
Rollenbindung. Frontend-/Login-Fluss, manipulierter Token, Netzisolation,
zweite Rolle, synthetischer CRUD mit Bereinigung und DB-Stichprobe bleiben ein
separates blockierendes Abnahmeprotokoll. Ohne dieses darf der Lauf nicht als
vollständig `deployed` oder als Release-Freigabe bewertet werden.

Pages-/GKE-Artefakte, persönliche Werte, Secrets, Daten, Snapshots und
OIDC-Subjects sind weder Transfer-Sidecars noch Target-Build-Eingaben. Die
RC.2- bis RC.5-Tags bleiben historische Evidenz und werden in diesem Gate nicht
als Legacy-Fallback akzeptiert. Das Anlegen eines Projekts, Remotes oder Pushes
ist kein lokaler QA-Schritt und benötigt eine gesonderte operative Freigabe.

Für einen echten Target-Lauf sind zentrale Nachweise verpflichtend; `not-run`
ist nur für eine lokale Vorprüfung zulässig. Vor dem Registry-Push müssen unter
dem read-only Pfad `EXTERNAL_SECURITY_EVIDENCE_ROOT/<BUILD_TAG>` exakt die drei
erfolgreichen Analyse-Gates und die Cosign-Bereitschaft liegen. Sie müssen
Build-ID, Produkt-Tag, Quell-URL/-SHA, Image-Repository und beide SBOM-Digests
binden. Nach dem Push muss die zusätzliche Cosign-Attestation exakt den
veröffentlichten Image-Digest als Subject binden. Fehlende, zusätzliche,
beschreibbare, während des Imports veränderte oder widersprüchliche Dateien
stoppen vor Helm, Evidence-Zusammenführung und Deployment. Ein bereits
gepushtes Image bleibt bei fehlender Post-Push-Attestation unfreigegeben.

## Blockierende Gates für die Produkt-Release-Automatisierung

Änderungen an Weekly-, Hotfix-, Tag- oder GitHub-Release-Logik benötigen
zusätzlich zur passenden QA-Stufe:

```bash
npm run test:release-automation
npm run check:deployment-governance
```

Die Tests decken zentrale Version, No-change-Skip, Wochen-/Hotfix-Projektion,
Build-Manifest, SBOM, Helm- und OCI-Metadaten, deterministische
Pflichtartefakte, signierte Tagobjekte und den statischen Workflowvertrag ab.
Vor Aktivierung eines echten Releases folgen außerdem ein
Planlauf ohne Schreibzugriff, ein isolierter Signaturtest ohne Push und der
vollständige kontrollierte Dry-Run. Ein Pages-Nachweis ersetzt weder privaten
GKE- noch gematik-Target-Nachweis.

## QA-Stufen

### Stufe 1: Kleine Änderung

Für reine Texte, Labels, kleine CSS-Korrekturen ohne neue Komponente, kleine Test- oder Doku-Änderungen.

Pflicht:

```bash
npm run qa:small
```

Optional: ein gezielter DOM- oder Browser-Check, wenn die Änderung sichtbar ist und die Wirkung nicht direkt aus dem Code hervorgeht.

Nicht automatisch: kompletter visueller Smoke, Pages-Build, Commit oder Push.

### Stufe 2: Fokussierte UI-/Flow-Änderung

Für sichtbare Änderungen in einem Arbeitsbereich, Tabellen-/Drawer-Verhalten, responsive Layouts, neue oder geänderte Playwright-Erwartungen.

Pflicht:

```bash
npm run check
npx playwright test tests/visual-smoke.spec.js -g "<passender Testname>"
```

Desktop und Mobile müssen abgedeckt werden, wenn Navigation, Sidebar, Tabellenbreite, Drawer, Karte, Profilseite oder mobile Breakpoints betroffen sind.

### Stufe 3: Vollprüfung

Für Navigation, Auth, Data-Service, API, Rollenrechte, globale CSS-/JS-Helfer, neue Arbeitsbereiche, größere Refactorings und jeden Push-/Deploy-Auftrag.

Pflicht:

```bash
npm run qa:full
```

Bei sichtbaren UI-Änderungen zusätzlich die relevanten Punkte aus `../produkt-und-design/VISUAL_QA_CHECKLIST.md` abgleichen. Bei GitHub-Pages-Aufträgen vorher `npm run build:pages` ausführen und `dist/pages/` mitprüfen; das Artefakt bleibt unversioniert.

Wenn Deploymenttrennung, Auth, Data-Service oder API-Grenze betroffen sind, müssen beide Buildprofile getrennt geprüft werden. Das Pages-Artefakt darf nur synthetische Demo-Quellen und den allowlist-geprüften öffentlichen Bundestags-Snapshot enthalten. Das Target-Artefakt muss mit `dataMode: "api"`, `requireApiGateway: true` und `authMode: "oidc"` beziehungsweise im GKE-Vorbereitungspfad `"iap"` gebaut werden. Ein API-, Session- oder Gatewayfehler muss fachliche Funktionen sperren; er darf keinen Demo-, Supabase- oder LocalStorage-Datenpfad aktivieren.

### Stufe 4: Publication-/Live-Verifikation

Für jeden Push-/Deploy-/GitHub-Pages-Auftrag nach dem Push.

Pflicht:

```bash
npm run verify:publication
```

`npm run verify:publication` prüft ausschließlich den öffentlichen Pages-Demo-Vertrag: Pages bleibt erreichbar, enthält synthetische CRM-/Fachdaten und den kuratierten öffentlichen Bundestags-Snapshot, aber keine Target-Konfiguration. Da die Realanwendung mit `dataMode: "api"` und geschützter Kubernetes-API läuft, muss ihr Backend-Status separat im Abnahmeprotokoll stehen:

- `verified`: betroffene Migration/Datenoperation angewendet und die relevante Tabelle oder API autorisiert geprüft,
- `not_affected`: reine Static-/UI-Änderung ohne Backendwirkung,
- `pending`: noch nicht angewendet oder nicht sicher verifiziert.

`verified` ist nur nach einer passenden DB- oder API-Stichprobe zulässig. Wenn Datenmigrationen, Schema-/Migrationsdateien oder datengetriebene Fachinhalte betroffen sind, darf `not_affected` nicht genutzt werden. Ein Abschluss darf "sichtbar", "verfügbar" oder "live" nur sagen, wenn die betroffene Auslieferung und der passende Backend-Nachweis erfolgreich geprüft wurden.

Für die #Mitmachen-Konzeptdemo gilt weiterhin ein negatives Browser-Gate: Sie
darf keinen Intake-Request aufbauen und nichts lokal speichern. Der getrennte
M2M-Pfad `POST /api/connectors/typo3/mitmachen-registrations` wird nur über die
TYPO3-Outbox verwendet und bleibt bis zur fachlichen sowie betrieblichen
Freigabe standardmäßig deaktiviert. Seine blockierenden Tests prüfen HMAC und
Rotation, Zeitfenster, Größen- und Feld-Allowlist, Formular- und
Textversionen, `not_requested`/`pending`, Idempotenz, Datenbank-Constraints,
minimale Grants, Retry-Klassifikation und die getrennte Ingress-Strecke.

## Standard-Auth-Testmodus

Playwright-Tests nutzen den gemeinsamen Helper:

```js
import { gotoAuthenticated } from "./helpers/app-test-session.js";

await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
  role: "admin"
});
```

Der Helper stubbt `frontend/login/auth-guard.js`, setzt `VERSORGUNGS_COMPASS_CONFIG`, schreibt die lokale Testsitzung und kann optionale Seed-Skripte ersetzen. Neue Tests sollen keine eigenen Auth-Stubs, LocalStorage-Hacks oder Browser-Plugin-Workarounds duplizieren.

Diese synthetische Testsitzung ist ausschließlich Test-Harness-Zustand. Sie belegt keinen produktiven LocalStorage-Auth- oder Datenfallback. Target-Vertragstests müssen `/api/...` beobachten beziehungsweise stubben und zusätzlich bestätigen, dass bei `401`, `403`, `404`, `5xx` oder Netzfehlern keine fachlichen Daten aus Demoquellen, Supabase oder Browser-Speichern erscheinen.

Für manuelle Sichtprüfungen ist Playwright mit diesem Helper der bevorzugte Weg. Der In-App-Browser ist nützlich für echte Nutzerpfade, aber nicht für lokale Auth-Mutationen.

## Effizienzmodus für kleine UI-Wünsche

Der Effizienzmodus ist Standard, wenn alle Punkte zutreffen:

- Der Wunsch betrifft nur eine vorhandene Stelle oder Komponente.
- Keine neue Navigation, kein neues Datenmodell, keine neue Rolle und kein neuer Backend-Pfad.
- Keine externen Daten oder aktuellen öffentlichen Quellen sind nötig.
- Die Änderung kann über bestehende Tokens, Klassen und Muster gelöst werden.

Vorgehen:

1. Nur die relevanten Suchtreffer und die nötigen Leitplanken lesen.
2. Kleinen Patch setzen, keine neue Variante erfinden.
3. Stufe-1-QA laufen lassen.
4. Nur bei sichtbarem Risiko auf Stufe 2 eskalieren.
5. Am Ende klar sagen, ob die Änderung uncommitted und ungepusht ist.

Nicht im Effizienzmodus: breite Recherchen, Roadmap-Analysen, neue Module, globale CSS-Schichten, Migrationen, Auth-/Rollenlogik und Live-Pushes.

## Projekt-Log

`CURRENT_STATE.md` ist das kurze Arbeitslog für Projektarbeit. Es soll nach größeren Änderungen aktualisiert werden, wenn sich einer dieser Punkte ändert:

- führender lokaler Architekturpfad,
- empfohlene QA-Stufe oder Standardbefehle,
- Auth-/Demo-Testmodus,
- bekannte lokale Stolperstellen,
- Worktree-/Push-Regel, die für Folgeaufgaben wichtig ist.

Das Log ersetzt keine Fach- oder Deployment-Doku. Es ist ein schneller Startpunkt, damit neue Threads nicht jedes Mal denselben Projektzustand rekonstruieren.
