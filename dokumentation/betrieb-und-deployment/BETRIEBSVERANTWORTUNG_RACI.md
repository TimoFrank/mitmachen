# Betriebsverantwortung und RACI

> [!NOTE]
> **Einordnung:** Diese RACI ist eine Arbeitsvorlage fuer einen moeglichen
> spaeteren Pilot- oder Regelbetrieb. Sie muss fuer den aktuellen, befristeten
> gematik-internen PoC nicht vollstaendig besetzt sein. Fuer den PoC genuegen die
> technischen Ansprechpartner aus dem
> [PoC-Durchstich](POC_GEMATIK_DURCHSTICH.md).

Status: Arbeitsvorschlag; Rollen, Teams und Personen durch die uebernehmende IT zu bestaetigen

Stand: 18. Juli 2026

## Zweck

Diese Matrix verhindert, dass Plattform-, Daten-, Sicherheits- oder Betriebsaufgaben stillschweigend bei einer Einzelperson oder beim Entwicklungsteam verbleiben. Sie ist erst verbindlich, wenn die beteiligten Organisationseinheiten ihre Rollen bestaetigt und fuer jede Aktivitaet genau ein `A` benannt haben.

## Legende

- `R` - Responsible: fuehrt die Aufgabe aus.
- `A` - Accountable: traegt die Ergebnisverantwortung und entscheidet. Pro Zeile genau einmal.
- `C` - Consulted: wird vor der Entscheidung beteiligt.
- `I` - Informed: wird informiert.
- `?` - Zu bestaetigen: Zuordnung oder Teamname ist noch offen.
- `-` - keine regulaere Beteiligung.

`A?` und `R?` sind Vorschlaege, keine bereits akzeptierte Verantwortung.

## Rollenmodell

| Kurzname | Erwartete Funktion | Institutioneller Owner |
| --- | --- | --- |
| PO | Produkt-/Service-Owner, Nutzen, Prioritaet, Budget, Serviceentscheidung | zu bestaetigen |
| FV | fachliche Daten- und Prozessverantwortung | zu bestaetigen |
| APP | Anwendungsentwicklung/-wartung fuer Frontend, API, Tests und Releases | zu bestaetigen |
| PLAT | Kubernetes-, Registry-, Netzwerk- und Software-Factory-Betrieb | zu bestaetigen |
| IAM | Gateway, SSO, Identitaetsattribute und Zugriffslebenszyklus | zu bestaetigen |
| DB | Shared Postgres, Backup, Restore und DB-Plattformbetrieb | zu bestaetigen |
| SEC | Informationssicherheit und Security-Governance | zu bestaetigen |
| DS | Datenschutz, Datenklassen, Aufbewahrung und Betroffenenprozesse | zu bestaetigen |
| SD | Service Desk und Erstannahme | zu bestaetigen |

Eine Person darf mehrere Rollen ausfuellen, wenn Funktionstrennung und Vier-Augen-Anforderungen gewahrt bleiben. Persoenliche GCP-Projekt- oder Break-glass-Werte aus `pre-gematik` sind kein Ersatz fuer institutionelle Rollen.

## Vorgeschlagene RACI-Matrix

| Aktivitaet | PO | FV | APP | PLAT | IAM | DB | SEC | DS | SD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Produktumfang und Priorisierung | A? | R? | C | I | - | - | C | C | I |
| Datenklassifikation und zulaessiger Verwendungszweck | C | R? | C | I | I | C | C | A? | I |
| Zielarchitektur und Plattformstandard | C | I | R? | A? | C | C | C | C | I |
| Kubernetes-Namespace, Netzwerk und Registry | I | - | C | A?/R? | C | - | C | - | I |
| Frontend-Hosting, DNS und TLS | I | - | C | A?/R? | C | - | C | - | I |
| OIDC-/SSO-Vertrag, Issuer/Audience/JWKS/Claims | I | C | C | C | A?/R? | - | C | C | I |
| Rollenmodell `viewer`/`editor`/`admin` | C | A?/R? | C | I | C | - | C | C | I |
| Benutzeranlage, Aenderung und Entzug | I | R? | C | I | A? | - | C | C | I |
| Anwendungsquellcode und API-Vertrag | I | C | A?/R? | C | C | C | C | C | I |
| Build, Tests, SBOM/Scans und Release-Kandidat | I | C | A?/R? | C | - | - | C | - | I |
| Software-Factory und technische Promotion | I | - | R? | A?/R? | - | C | C | - | I |
| Produktivfreigabe/Go-No-Go | A? | C | R? | R? | C | C | C | C | I |
| Datenbankschema und Migrationsskripte | I | C | R? | C | - | A?/R? | C | C | I |
| Fachliche Datenmigration und Reconciliation | C | A?/R? | R? | I | - | R? | C | C | I |
| Datenbank-Backup, PITR und Restore-Probe | I | C | C | C | - | A?/R? | C | C | I |
| Object-Storage-Betrieb und Wiederherstellung | I | C | C | A?/R? | - | - | C | C | I |
| Monitoring, Logging und technische Alarmierung | I | I | C | A?/R? | C | C | C | C | R? |
| Fachliche Datenqualitaet | I | A?/R? | C | - | - | C | - | C | I |
| Incident-Erstannahme und Kommunikation | I | I | C | C | C | C | I | I | A?/R? |
| Technische Stoerungsbehebung Anwendung | I | I | A?/R? | C | C | C | I | - | R? |
| Major-Incident-Koordination | A? | I | R? | R? | R? | R? | C | C | R? |
| Schwachstellen- und Patchmanagement Anwendung | I | - | A?/R? | C | - | - | C | - | I |
| Plattform-Patchmanagement | I | - | I | A?/R? | C | C | C | - | I |
| Datenschutzanfrage, Aufbewahrung und Loeschung | I | R? | C | C | C | C | C | A? | I |
| Break-glass-Verfahren und Rezertifizierung | I | I | C | R? | A?/R? | C | C | C | I |
| SLO-/RTO-/RPO-Beschluss | A? | C | C | R? | C | R? | C | C | I |
| Regelmaessige Restore- und Rollback-Uebung | I | C | R? | R? | C | A?/R? | C | I | I |
| Legacy-Abschaltung | A? | R? | R? | C | C | C | C | C | I |

## Zu bestaetigende Betriebswerte

| Gegenstand | Entscheidung | Accountable | Responsible | Termin/Nachweis |
| --- | --- | --- | --- | --- |
| Service-Owner | offen | offen | - | offen |
| technischer Application Owner | offen | offen | offen | offen |
| Service Desk / Queue | offen | offen | offen | offen |
| Plattform-On-Call | offen | offen | offen | offen |
| DB-On-Call | offen | offen | offen | offen |
| IAM-/Gateway-On-Call | offen | offen | offen | offen |
| Datenschutzkontakt | offen | offen | offen | offen |
| Informationssicherheitskontakt | offen | offen | offen | offen |
| institutioneller Break-glass-Owner | offen | offen | offen | offen |
| Change Advisory/Freigabegremium | offen | offen | offen | offen |

## Eskalationsmodell als Vorlage

Prioritaeten und Reaktionszeiten werden nicht in diesem Dokument erfunden. Vor Go-live sind mindestens folgende Eskalationen zu definieren:

| Ereignis | Erstannahme | technische Zuweisung | Entscheidungsinstanz | Kommunikationskanal |
| --- | --- | --- | --- | --- |
| Anwendung nicht erreichbar | offen | PLAT/APP, zu bestaetigen | PO/Incident Lead, zu bestaetigen | offen |
| Authentisierung oder Rollen fehlerhaft | offen | IAM/APP, zu bestaetigen | Incident Lead/SEC, zu bestaetigen | offen |
| Datenintegritaet gefaehrdet | offen | DB/APP/FV, zu bestaetigen | PO/FV, zu bestaetigen | offen |
| moeglicher Sicherheitsvorfall | offen | SEC plus betroffene Technikteams | gemaess Security-Incident-Prozess | offen |
| moeglicher Datenschutzvorfall | offen | DS/SEC plus betroffene Teams | gemaess Datenschutzprozess | offen |

## Freigaberegeln

- Kein Ziel-Go-live ohne benanntes `A` fuer Produktivfreigabe, Plattformbetrieb, Datenmigration, Backup/Restore und Incident-Koordination.
- Produktionszugriff, Break-glass und Datenbankmigration duerfen nicht allein von derselben Einzelperson kontrolliert werden, sofern der Plattformstandard Funktionstrennung verlangt.
- App-Entwicklung darf Plattform- oder SSO-Verantwortung nicht stillschweigend uebernehmen.
- Plattformbetrieb darf fachliche Datenqualitaet oder Verwendungszweck nicht stillschweigend uebernehmen.
- Die RACI wird nach Pilotabnahme und danach bei wesentlichen Organisations- oder Architekturveraenderungen rezertifiziert.
- [CODEOWNERS](../../.github/CODEOWNERS) ist mit dem bestaetigten Account `@TimoFrank` als Uebergangs-Owner aktiv. Vor dem Pilotbetrieb werden echte institutionelle GitHub-Teamhandles und die gewuenschte unabhaengige Review-/Branchschutzregel bestaetigt oder durch gleichwertige Software-Factory-Governance ersetzt.
- [Dependabot](../../.github/dependabot.yml) ist als technischer Abhaengigkeits-Governance-Schritt vorbereitet; Triage-, Patch- und Freigabeverantwortung folgt dieser RACI und muss institutionell bestaetigt werden.
- Die [Repository-Governance](REPOSITORY_GOVERNANCE.md) beschreibt die ausserhalb von Git zu aktivierenden Schutzregeln und ihren erforderlichen Nachweis.

## Bestaetigungsprotokoll

| Rolle/Organisationseinheit | Name oder Team | Zustimmung/Datum | Abweichungen |
| --- | --- | --- | --- |
| PO | offen | offen | offen |
| FV | offen | offen | offen |
| APP | offen | offen | offen |
| PLAT | offen | offen | offen |
| IAM | offen | offen | offen |
| DB | offen | offen | offen |
| SEC | offen | offen | offen |
| DS | offen | offen | offen |
| SD | offen | offen | offen |

## Verwandte Dokumente

- [PoC-Durchstich – aktueller kleiner Schritt](POC_GEMATIK_DURCHSTICH.md)
- [Zielkonzept – spaetere Regelbetriebsreferenz](GEMATIK_K8S_ZIELKONZEPT.md)
- [Betriebshandbuch](BETRIEB.md)
- [Migration, Cutover und Rollback](MIGRATION_CUTOVER_ROLLBACK.md)
- [Deployment-Checkliste](DEPLOYMENT_CHECKLIST.md)
