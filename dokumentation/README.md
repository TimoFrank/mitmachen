# Dokumentation

Dieser Ordner buendelt die Unterlagen, die fuer Uebergabe, Betrieb und Weiterentwicklung wichtig sind. Die fuehrenden Frontend-Quellen liegen unter `../frontend/`.

## Bereiche

- `architektur/`: API-Kontrakt, Datenmodell und Backend-Vertraege wie die Versorgungs-Netzwerk-Registrierung.
- `betrieb-und-deployment/`: Betrieb, aktive Deployment-Uebersicht, gematik Kubernetes-Zielbild und klar abgegrenztes Archiv.
- `entwicklung-und-qa/`: aktueller Projektzustand, QA-Ablauf und visuelle Nachweise.
- `produkt-und-design/`: Designsystem, UX-Leitplanken und UI-Inventar.

## Einstieg fuer die technische Uebergabe

1. `../README.md` fuer den Gesamtueberblick lesen.
2. `architektur/API_CONTRACT.md` fuer die API-Grenzen lesen.
3. `architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md` fuer den Registrierungs-Backend-Vertrag lesen.
4. `betrieb-und-deployment/DEPLOYMENT_UEBERSICHT.md` fuer aktive und archivierte Auslieferungswege lesen.
5. `betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md` fuer das aktuelle Kubernetes-Zielbild lesen.
6. `../supabase/README.md` nur fuer Legacy-Backend- und Migrationsdetails lesen.

Die GCP-/Cloud-Run-Schrittdokumente, Supabase-Unterlagen und alten Demo-Deployments bleiben im Archiv als Nachvollziehbarkeit erhalten. Fuer den ersten Einstieg sind sie nicht erforderlich.
