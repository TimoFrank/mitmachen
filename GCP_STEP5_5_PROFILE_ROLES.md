# GCP Step 5.5 Profil und Rollenmodell light

Stand: 2026-06-06

Status: privat umgesetzt, deployed und live getestet.

Live-Service:

```text
Cloud Run: versorgungs-kompass-gcp-demo
Revision: versorgungs-kompass-gcp-demo-00012-8kz
URL: https://versorgungs-kompass-gcp-demo-765190393967.europe-west3.run.app
Image: europe-west3-docker.pkg.dev/steam-capsule-341212/versorgungs-kompass/versorgungs-kompass-gcp-demo:17df1434-cd9c-49ba-a1f5-fa8175a97299
```

## Ziel

Die private GCP-Demo zeigt sichtbar, welcher Demo-Akteur arbeitet und welche Rolle technisch hinterlegt ist. Es wird bewusst kein echtes Login und keine Nutzerverwaltung eingefuehrt.

## Umsetzung

Neue API:

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/session` | Aktuellen Demo-Akteur und Rollenmodell laden |

Erweiterte API:

- `GET /api/bootstrap` liefert zusaetzlich `session`.
- `GET /api/export` enthaelt zusaetzlich `session`.

Neue Demo-UI:

- Sidebar-Bereich `Persoenlich`.
- Eigene Seite `Mein Profil`.
- Anzeige von Demo-Akteur, Rolle, E-Mail, Team und Profil-ID.
- Read-only Rollenmatrix fuer `Admin`, `Editor`, `Viewer`.
- Klarer Hinweis: Rollen werden angezeigt, aber noch nicht als Zugriffsschutz erzwungen.

## Aktueller Demo-Akteur

Standard:

```text
erstes aktives Profil aus Cloud SQL
```

Optional spaeter:

```text
GCP_DEMO_PROFILE_ID=<profile-id>
```

Damit kann ein bestimmtes Demo-Profil als technischer Akteur gewaehlt werden, ohne schon echte Auth einzubauen.

## Was 5.5 nicht macht

- keine echten Nutzerkonten
- kein Passwort-Login
- keine SSO-/IAP-Integration
- keine Nutzerverwaltung
- keine serverseitige Rechtepruefung pro Rolle

## Warum so

Das private Deployment soll fachlich erklaerbar bleiben, ohne der spaeteren Organisations-IT vorzugreifen. Echte Identitaet und Zugriffsschutz sollten spaeter ueber IAP, SSO oder eine interne Auth-Schicht entschieden werden.

## Naechster Ausbauschritt

Wenn echte Nutzer noetig werden:

1. Identitaetsquelle klaeren: IAP, SSO, Google Workspace oder interne Auth.
2. Rollen verbindlich definieren.
3. Schreibende API-Endpunkte serverseitig schuetzen.
4. `changed_by` aus echter Nutzeridentitaet statt Demo-Akteur ableiten.

## Testablauf

Lokal:

```bash
npm run check:gcp-demo
npm run check:demo
npm run check
npm run security:audit
git diff --check
```

Live-Smoke:

```text
GET /api/healthz: ok
GET /api/session: Demo Admin, Rolle admin, Rollenmatrix Admin/Editor/Viewer
GET /api/bootstrap?includeArchived=true: session enthalten, 3 Profile, 36 Kontakte
Cloud Run: 100 Prozent Traffic auf Revision 00012-8kz
```

Visual QA:

```text
Desktop 1440x900: Profilseite ohne horizontale Ueberlaeufe
Mobile 390x844: Profilseite ohne horizontale Ueberlaeufe
Rollenbadge: Nur Anzeige
Browser-Konsole: keine Fehler
```
