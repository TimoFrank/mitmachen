# Abnahmeprotokoll Versorgungs-Kompass

Dieses Template dokumentiert eine technische oder fachliche Abnahme reproduzierbar. Nicht entschiedene Werte bleiben als `OFFEN` markiert; sie duerfen nicht stillschweigend als Freigabe gelten.

## 1. Abnahmegegenstand

| Feld | Wert |
| --- | --- |
| Umgebung | `pre-gematik` (synthetisch) / `pre-gematik` (freigegebener, befristeter Echtdaten-Pilot) / Zielbetrieb |
| Termin | OFFEN |
| Git-Revision | OFFEN |
| API-Image | Repository und `sha256`-Digest: OFFEN |
| Frontend-Revision | `build-manifest.json` / Release-Prefix: OFFEN |
| Helm-Chart-Version | OFFEN |
| Datenbankschema-Version | OFFEN |
| Aenderungsumfang | OFFEN |

## 2. Teilnehmer und Rollen

| Rolle | Name oder Team | Teilnahme | Freigabe erforderlich |
| --- | --- | --- | --- |
| Produktverantwortung | OFFEN | OFFEN | ja |
| Fachliche Datenverantwortung | OFFEN | OFFEN | ja bei Datenmigration |
| Plattform-/GKE-Betrieb | OFFEN | OFFEN | ja |
| Informationssicherheit | OFFEN | OFFEN | nach Einstufung |
| Datenschutz | OFFEN | OFFEN | nach Einstufung |
| Service Desk / Support | OFFEN | OFFEN | vor Pilotstart |

## 3. Technische Nachweise

- [ ] Pages- und Target-Artefakt wurden aus derselben angegebenen Revision, aber mit getrennten Profilen erzeugt.
- [ ] Das Target-Artefakt enthaelt `dataMode: "api"`, einen freigegebenen Auth-Modus und `requireApiGateway: true`.
- [ ] Das Target-Artefakt enthaelt keine Supabase-URL, keinen Supabase Browser-Key, keinen Supabase-Registrierungsendpunkt und kein Supabase Browser-SDK.
- [ ] Der API-Container wird per unveraenderlichem Digest referenziert.
- [ ] SAST, Dependency-, Secret- und Image-Scan sind erfolgreich oder Abweichungen dokumentiert.
- [ ] Gateway/SSO entfernt nicht vertrauenswuerdige Identity-Header und setzt verifizierte Identitaet.
- [ ] Nutzer ohne aktives Profil erhalten `403`.
- [ ] API-Laufzeitrolle besitzt keine DDL-Rechte.
- [ ] Fuenf getrennte, private und gehaertete GCS-Ziel-Buckets sind nachgewiesen: ein Frontend-Release-Bucket und vier API-Daten-Buckets fuer Profilbilder, Kontaktbilder, Notizanhaenge und Stakeholder-Logos. Nur die vier API-Daten-Buckets liegen im Datenmigrationsumfang.
- [ ] Health-, Readiness- und Kernpfad-Smoke-Tests sind erfolgreich.
- [ ] Monitoring, Alarmierung und Logzugriff wurden praktisch nachgewiesen.

Nachweislinks oder Artefakt-IDs:

```text
OFFEN
```

## 4. Daten und Migration

| Pruefung | Erwartung | Ist | Ergebnis |
| --- | --- | --- | --- |
| Quelle und Exportzeitpunkt | freigegebener Export | OFFEN | OFFEN |
| Tabellen-/Objekt-Counts | Migrationsplan | OFFEN | OFFEN |
| Bucket-Abgrenzung | 5 Ziel-Buckets insgesamt; davon genau 4 API-Daten-Buckets im Migrationsumfang | OFFEN | OFFEN |
| Stichproben | fachlich festgelegte Auswahl | OFFEN | OFFEN |
| Fehler-/Ausschlussliste | vollstaendig dokumentiert | OFFEN | OFFEN |
| Schreibfreeze | Zeitraum und Verantwortliche | OFFEN | OFFEN |
| Restore-Nachweis | gemaess beschlossenem RTO/RPO | OFFEN | OFFEN |
| Echtdaten-Freigabe-Gates G-01 bis G-07 | G-04a vor Import; G-04b nach Import und vor Dienstoeffnung; vollstaendige Nachweisreferenzen | OFFEN | OFFEN |

Ohne ausdruecklich freigegebenen, befristeten Echtdaten-Pilot ist fuer `pre-gematik` stattdessen die ausschliessliche Verwendung des versionierten synthetischen Seeds zu bestaetigen. Eine Echtdaten-Pilotfreigabe gilt nur fuer den dokumentierten Zeitraum, Personenkreis und Datenstand und ersetzt keine Zielbetriebs- oder Produktionsfreigabe.

## 5. Rollback-Probe

- [ ] Vorherige API-Digest und Frontend-Revision sind bekannt und noch verfuegbar.
- [ ] Rueckwechsel wurde in der Abnahmeumgebung praktisch getestet.
- [ ] Datenbankaenderungen sind rueckwaertskompatibel oder besitzen ein freigegebenes Wiederherstellungsverfahren.
- [ ] Entscheidungsperson und Abbruchkriterien fuer das Cutover sind benannt.

Gemessene Dauer und Ergebnis:

```text
OFFEN
```

## 6. Abweichungen und Restrisiken

| ID | Abweichung oder Risiko | Auswirkung | Massnahme | Owner | Frist | Freigabe |
| --- | --- | --- | --- | --- | --- | --- |
| OFFEN |  |  |  |  |  |  |

## 7. Entscheidung

- [ ] freigegeben
- [ ] freigegeben mit Auflagen
- [ ] nicht freigegeben

Gueltigkeitsbereich und Auflagen:

```text
OFFEN
```

| Freigaberolle | Name | Datum | Entscheidung / Referenz |
| --- | --- | --- | --- |
| Produktverantwortung | OFFEN | OFFEN | OFFEN |
| Fachliche Datenverantwortung | OFFEN | OFFEN | OFFEN |
| Plattform-/GKE-Betrieb | OFFEN | OFFEN | OFFEN |
| Weitere gemaess Einstufung | OFFEN | OFFEN | OFFEN |
