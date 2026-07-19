# Abnahmeprotokoll Versorgungs-Kompass

Dieses Template dokumentiert eine technische oder fachliche Abnahme reproduzierbar. Nicht entschiedene Werte bleiben als `OFFEN` markiert; sie duerfen nicht stillschweigend als Freigabe gelten.

## 1. Abnahmegegenstand

| Feld | Wert |
| --- | --- |
| Umgebung | `pre-gematik` / Pilot / Zielbetrieb |
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
| Stichproben | fachlich festgelegte Auswahl | OFFEN | OFFEN |
| Fehler-/Ausschlussliste | vollstaendig dokumentiert | OFFEN | OFFEN |
| Schreibfreeze | Zeitraum und Verantwortliche | OFFEN | OFFEN |
| Restore-Nachweis | gemaess beschlossenem RTO/RPO | OFFEN | OFFEN |

Fuer eine reine Pre-Integration ohne Echtdaten ist hier stattdessen die ausschliessliche Verwendung des versionierten synthetischen Seeds zu bestaetigen.

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
