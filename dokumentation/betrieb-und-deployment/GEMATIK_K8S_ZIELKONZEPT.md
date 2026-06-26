# Zielkonzept gematik Kubernetes

Status: 26. Juni 2026

Dieses Konzept beschreibt den Zielpfad fuer den Versorgungs-Kompass nach der Korrektur weg von Cloud Run/IAP. Es ersetzt nicht den aktuellen Betrieb ueber GitHub Pages und Supabase. Es konkretisiert die Zielspur fuer die gematik-Infrastruktur.

## Leitentscheidungen

- GitHub Pages + Supabase bleiben die laufende Test-/Ist-Umgebung, bis die gematik-Zielumgebung abgenommen ist.
- Cloud Run, Cloud SQL und IAP bleiben nur archivierte Prototypen und sind nicht Zielarchitektur.
- Das Ziel ist ein statisches Frontend-Artefakt plus API-Service im Kubernetes-Namespace.
- Der Browser spricht im Zielbetrieb nur mit `/api/...` und enthaelt keine Supabase-Keys, kein Supabase Auth und keine direkten Tabellenzugriffe.
- Identitaet kommt vom vorgelagerten Gateway/SSO ueber verifizierte Header. Rollen werden serverseitig in der API gegen `profiles` geprueft.

## Zielkomponenten

| Komponente | Zielbild |
| --- | --- |
| Frontend | statisches `docs/`-Artefakt im gematik Bucket-/Hosting-Pfad |
| Frontend-Konfiguration | `dataMode: "api"`, `authMode: "trusted-header"`, interne `apiBaseUrl`, `requireApiGateway: true` |
| Gateway / Ingress | interne Zugriffsbeschraenkung, SSO, Entfernen untrusted Identity-Header, Setzen verifizierter Nutzer-Header |
| API | Node.js-Container aus `Dockerfile.api`, deployt per Helm in den Kubernetes-Namespace |
| Datenbank | gematik Shared Postgres; Schema und Migration werden mit der gematik-IT abgestimmt |
| Authz | Rollen `viewer`, `editor`, `admin` in `profiles`, serverseitig geprueft |
| Storage | Object Storage fuer Profil- und Kontaktbilder, ausgeliefert ueber API oder freigegebene interne Objektpfade |
| CI/CD | Software Factory / Jenkins, Artifact Registry, Helm, Smoke Tests |

## Account-Modell

In GitHub Pages bleibt der Login Supabase-basiert. Dort koennen Supabase-Accounts, Alias-Logins und Profile wie bisher genutzt werden.

Im gematik-Zielbetrieb werden keine Supabase-Accounts angelegt. Nutzer melden sich ueber die interne Zugriffsschicht an. Die API bekommt eine verifizierte E-Mail oder stabile Nutzer-ID aus dem Gateway und mappt diese Identitaet auf `profiles`.

Ein Ziel-Account besteht damit aus:

1. Zugriff in der internen SSO-/Gateway-Schicht.
2. Aktivem `profiles`-Eintrag in Shared Postgres.
3. Rolle `viewer`, `editor` oder `admin`.

Ohne aktives Profil liefert die API `403`, auch wenn das Gateway die Person authentifiziert hat.

## Datenmodell und Migration

Shared Postgres wird die kanonische Datenquelle fuer:

- Kontakte und Organisationen
- Profile, Rollen, Owner und Teamzuordnung
- Formate und Teilnehmende
- Hospitationen und Hospitations-Slots
- Expertenkreis, Stakeholder, Patientenorganisationen und gespeicherte Ansichten
- Aenderungshistorie, Benachrichtigungen und User Settings

Die Migration erfolgt kontrolliert:

1. Supabase-Daten exportieren.
2. abgestimmtes Schema in Shared Postgres anwenden.
3. Daten mit stabilen IDs importieren.
4. Counts und Stichproben pruefen.
5. Ziel-Frontend gegen Ziel-API testen.
6. Erst nach Abnahme Supabase-Schreibpfade stoppen.

## Ziel-Deployment

```text
Git Repo
-> Jenkins Pipeline
-> npm checks / SAST / Secret Scan / Trivy
-> docs/ als statisches Frontend-Artefakt vorbereiten
-> API-Container aus Dockerfile.api bauen
-> Image in Artifact Registry pushen
-> Helm Chart rendern und deployen
-> Kubernetes startet API-Pods im Namespace
-> Smoke Tests gegen /api/healthz, /api/session und Kernpfade
```

Das Helm Chart liegt unter `deploy/helm/versorgungs-kompass`.

## Offene Plattformfragen

- Welche interne Frontend-URL und welche interne API-URL werden vergeben?
- Welche Header setzt die Gateway-/SSO-Schicht fuer E-Mail und stabile Nutzer-ID?
- Wer pflegt `profiles` und Rollen im Pilotbetrieb?
- Wie werden Object-Storage-Pfade fuer Profil- und Kontaktbilder bereitgestellt?
- Welches Betriebsverfahren wendet Schema- und Datenmigrationen auf Shared Postgres an?
- Wie werden Backup, Restore-Probe, Monitoring und Logging abgenommen?

## Naechster sauberer Arbeitspfad

1. GitHub Pages + Supabase als funktionierende Testumgebung stabil halten.
2. Cloud-Run/IAP-Artefakte im Archiv lassen.
3. `Dockerfile.api`, Helm Chart, Jenkinsfile und Ziel-Config-Skripte auf Kubernetes/Gateway ausrichten.
4. Datenmodell, Schemafreigabe und Importverfahren gemeinsam mit der gematik-IT konkretisieren.
5. Parallelbetrieb testen und erst danach umschalten.
