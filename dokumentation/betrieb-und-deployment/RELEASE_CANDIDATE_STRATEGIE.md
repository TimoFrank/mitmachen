# Release-Candidate-Strategie fuer den gematik-PoC

Status: fuehrendes Vorgehen fuer RC-Bildung und parallele Weiterentwicklung
Stand: 21. Juli 2026

## Kurzentscheidung

`main` bleibt die laufende Entwicklungs- und Integrationslinie. Die oeffentliche
GitHub-Pages-Demo darf sich daraus weiterentwickeln, ist aber kein Staging der
gematik-Umgebung. Ein gematik-PoC-Release wird ausschliesslich aus einem
festgelegten Commit und einem unveraenderlichen RC-Tag gebaut.

Spaetere Aenderungen auf `main`, beispielsweise an
`api/care-sector-model.mjs`, veraendern den bereitgestellten Release Candidate
nicht.

```text
Feature-Branches / lokale Entwicklung
                |
                v
              main  -----------------> GitHub-Pages-Demo
                |
                | geprueften Commit auswaehlen
                v
       poc-v0.1.0-rc.1
                |
                +----> dist/target/ + Manifest
                `----> API-Image + Digest
                            |
                            v
                  gematik-interner PoC
```

## Fuenf klar benannte Kanaele

| Kanal | Aufgabe | Release-Regel |
| --- | --- | --- |
| lokale Entwicklung | unfertige Arbeit und Experimente | kein Deploymentnachweis |
| GitHub-Pages-Demo | oeffentliche Produktdemo mit synthetischen Daten | kann aus `main` aktualisiert werden; kein gematik-Staging |
| `pre-gematik` | optionale, temporaere GCP-Pre-Integration | eigener IAP-/GCP-Pfad; kein gematik-PoC und keine Produktivstufe |
| gematik-interner PoC | befristeter Infrastruktur-Durchstich | nur aus festem RC-Tag und exaktem Commit |
| spaeterer Regelbetrieb | moegliche zukuenftige Produktionsstufe | eigene Freigabe; nicht Gegenstand dieser Strategie |

### Lokale Varianten sauber isolieren

Lokale Adapter, private Testdaten oder experimentelle Dateien duerfen nicht aus
einem gemeinsamen Einstieg unter `frontend/app/` referenziert werden, solange
sie nicht selbst Bestandteil beider vorgesehenen Buildvertraege sind. Sonst
funktioniert der lokale Arbeitsordner, waehrend ein sauberer Pages- oder
Target-Checkout fehlende Dateien enthaelt.

Fuer lokale Varianten gilt deshalb:

- eigener Feature-Branch beziehungsweise Worktree,
- eigener lokaler Einstieg; fuer die Hospitationsvariante wird er mit
  `npm run start:local-hospitation` im vollstaendig ignorierten Verzeichnis
  `frontend/local-hospitation/` erzeugt und nur ueber `127.0.0.1` genutzt,
- keine privaten oder unversionierten Pfade im gemeinsamen App-HTML,
- Pages- und Target-Audits lehnen lokale/private Hospitations-Hooks im gebauten
  Artefakt fail-closed ab,
- Merge nach `main` erst, wenn Pages- und Target-Build den Pfad bewusst
  enthalten oder bewusst ausschliessen und die Audits gruen sind.

GitHub Pages kann als gut sichtbare Produktdemo genutzt werden, aber nicht als
gematik-Staging: Auth, Daten, Netzwerk und Deploymentvertrag sind verschieden.

## RC bilden, ohne `main` einzufrieren

1. Einen fuer den PoC geeigneten Commit auf `main` waehlen.
2. Optional einen kurzlebigen Branch wie `codex/poc-gematik-rc` nur fuer
   Stabilisierungsfixes anlegen.
3. Den Stand in einem **sauberen separaten Worktree** pruefen und bauen.
4. Nach gruenen RC-Gates einen annotierten und serverseitig geschuetzten Tag wie
   `poc-v0.1.0-rc.1` setzen.
5. API-Image und Target-Frontend genau einmal aus diesem Tag erzeugen und mit
   Digest beziehungsweise Hash festhalten.
6. Fehler werden als neuer Commit behoben und fuehren zu `rc.2`; ein vorhandener
   Tag wird nie verschoben.
7. Jeder RC-Fix wird zeitnah nach `main` zurueckgefuehrt. Der kurzlebige
   Stabilisierungsbranch wird nach Abschluss entfernt.

Langlebige Umgebungsbranches wie `staging`, `gke` oder `production` werden nicht
verwendet. Sie wuerden Quellstaende auseinanderlaufen lassen. Die Umgebung wird
durch Pipeline, Konfiguration und Freigabe bestimmt; die Version durch Tag,
Commit und Digests.

### Beispiel mit separatem Worktree

```bash
git fetch origin
RC_SHA="$(git rev-parse --verify 'origin/main^{commit}')"
printf 'Ausgewaehlter RC-Commit: %s\n' "$RC_SHA"
git worktree add ../Versorgungs-CRM-poc-rc -b codex/poc-gematik-rc "$RC_SHA"
cd ../Versorgungs-CRM-poc-rc
test "$(git rev-parse HEAD)" = "$RC_SHA"
npm ci
# RC-Gates ausfuehren, Fixes committen und pruefen
git tag -a poc-v0.1.0-rc.1 -m "gematik PoC RC 1"
```

Der bestehende Arbeitsordner bleibt dadurch fuer lokale Feature-Arbeit nutzbar.
Ein Tag und ein Push werden erst ausgefuehrt, wenn dies als Release-Schritt
ausdruecklich entschieden wurde.

Nach einer umgeschriebenen oder datenschutzbereinigten Git-Historie ist fuer den
ersten RC ein frischer Clone noch sicherer, weil lokal veraltete Tags vorhanden
sein koennen:

```bash
git clone --no-tags --single-branch --branch main \
  https://github.com/TimoFrank/mitmachen.git ../Versorgungs-CRM-poc-rc
cd ../Versorgungs-CRM-poc-rc
RC_SHA="$(git rev-parse --verify 'HEAD^{commit}')"
printf 'Ausgewaehlter RC-Commit: %s\n' "$RC_SHA"
git switch -c codex/poc-gematik-rc "$RC_SHA"
```

Beim Veroeffentlichen niemals pauschal `git push --tags` verwenden, sondern nur
den ausdruecklich freigegebenen Tag, zum Beispiel:

```bash
git push origin refs/tags/poc-v0.1.0-rc.1
```

## Atomare Aenderungen am Sektormodell

`api/care-sector-model.mjs` ist kein isoliertes Frontenddetail. Eine Aenderung
dieses Modells gehoert erst in einen RC, wenn der gesamte Laufzeitvertrag
zusammenpasst:

- API-Modul und Aufrufer,
- `frontend/data/sector-registry.js`,
- Docker-Buildkontext und erforderliche `COPY`-Regeln,
- Sektor- und API-Vertragstests,
- tatsaechlicher Containerstart mit Healthcheck.

Fuer einen ersten Infrastruktur-PoC gibt es deshalb zwei saubere Optionen:

1. Der RC basiert auf einem geprueften Commit **vor** einer noch unfertigen
   Sektormodell-Aenderung; die Arbeit laeuft auf `main` oder einem Feature-Branch
   weiter.
2. Die Aenderung wird vollstaendig integriert und besteht alle genannten Gates;
   erst dann wird ein neuer RC erzeugt.

Ein teilweise kopierter Stand, bei dem Tests im Repository gruen sind, das
Container-Image aber eine importierte Datei nicht enthaelt, ist kein RC.

## Minimale blockierende RC-Gates

Der erste PoC soll klein bleiben, aber das uebergebene Artefakt muss
reproduzierbar starten. Blockierend sind:

```bash
npm ci
npm run check:poc-rc
npm audit --audit-level=high
npm --prefix api audit --audit-level=high
API_BASE_URL="https://<interne-poc-url>" TARGET_AUTH_MODE=oidc npm run build:target
node scripts/audit_target_assets.mjs --artifact-root dist/target
test -n "${POC_IMAGE_DIGEST:?POC_IMAGE_DIGEST mit geprueftem sha256-Digest setzen}"
helm lint deploy/helm/versorgungs-kompass \
  --values deploy/helm/versorgungs-kompass/values-poc-gematik.yaml \
  --set-string image.digest="$POC_IMAGE_DIGEST"
helm template poc-rc deploy/helm/versorgungs-kompass \
  --values deploy/helm/versorgungs-kompass/values-poc-gematik.yaml \
  --set-string image.digest="$POC_IMAGE_DIGEST" \
  | grep --fixed-strings "@$POC_IMAGE_DIGEST"
```

Zusaetzlich verpflichtend:

- API-Container aus dem RC bauen, als Non-Root-Prozess starten und
  `/api/healthz` pruefen,
- Helm-Template mit den kleinen PoC-Werten rendern,
- vereinbarten Desktop-Kernpfad mit `npm run test:poc-smoke` pruefen,
- OIDC-/Session-, DB- und synthetischen CRUD-Smoke im PoC ausfuehren,
- disponible PostgreSQL-Datenbank und OIDC-Testbindungen nach dem
  [PoC-Datenbank-Runbook](../../deploy/postgres/poc-gematik/README.md) vorbereiten;
  keine Bestandsmigration ausfuehren,
- Git-Status des RC-Worktrees ist sauber,
- Tag, Commit, Image-Digest und Frontend-Hash stimmen im Uebergabemanifest
  ueberein.

Der vollstaendige visuelle Browsertest bleibt sinnvoll. Fuer den ersten PoC ist
er nur in dem vorher vereinbarten Desktop-Kernpfad blockierend; bekannte, nicht
betroffene Darstellungsabweichungen koennen mit Owner und Folgeschritt
dokumentiert werden. Authentisierung, Datenisolation, Secrets, Containerstart und
die API-/Target-Grenze sind nicht abwaehlbar.

## Uebergabemanifest

Die IT erhaelt nicht den beweglichen Repository-Stand, sondern eine kurze
Releaseakte mit:

| Feld | Beispiel |
| --- | --- |
| RC | `poc-v0.1.0-rc.1` |
| Git | vollstaendiger Commit-SHA |
| API | Registry-Referenz und `sha256`-Digest |
| Frontend | Hash von `dist/target/` oder Buildmanifest |
| Datenbank | Schema-/Seed-Version; fuer den PoC nur synthetisch |
| Deployment | Chart-Version und PoC-Values-Revision, ohne Secrets |
| Nachweise | Build-, Scan-, Containerstart- und Smoke-Test-Ergebnisse |
| Einschraenkungen | fuer den PoC akzeptierte, nicht sicherheitskritische Abweichungen |

## Parallele Weiterarbeit nach der RC-Bildung

- Neue Features und lokale Varianten gehen weiter ueber Feature-Branches nach
  `main`.
- Der lokale Arbeitsstand kann unmittelbar nach der Markierung auf einem Branch
  wie `codex/staging-local` weiterlaufen; der Tag zeigt weiterhin auf den
  geprueften RC-Commit und nimmt die uncommitteten App-Aenderungen nicht mit.
- Pages kann weiterhin aus einem gruenen `main` gebaut werden und einen neueren
  Stand als der PoC zeigen.
- Der PoC bleibt auf seinem RC-Digest; kein automatisches Deployment von `main`.
- Ein dringender RC-Fix wird im Release-Branch klein gehalten, geprueft und nach
  `main` zurueckgefuehrt.
- Der naechste PoC-Stand erhaelt einen neuen RC-Tag. Alte Tags und Digests bleiben
  nachvollziehbar.

Damit kann die Produktentwicklung ohne Freeze weitergehen, waehrend die IT einen
stabilen und reproduzierbaren Stand fuer den Infrastruktur-Durchstich besitzt.

## Abgesicherter Containervertrag

Der Containervertrag enthaelt den Import aus `api/care-sector-model.mjs`
einschliesslich `frontend/data/sector-registry.js` explizit im Docker-Buildkontext
und im Image. Runtime-Vertragstest und Target-Readiness-Workflow sichern die
Paketierung sowie einen echten Containerstart mit `/api/healthz` ab. Ein reiner
Image-Build ohne Start-Smoke bleibt unzureichend.

Weitere aktuelle Arbeitsstaende werden im
[Current State](../entwicklung-und-qa/CURRENT_STATE.md) festgehalten.
