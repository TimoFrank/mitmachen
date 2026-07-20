# Befristete Echtdaten-Pilotentscheidung `pre-gematik`

Stand: 20. Juli 2026

## Einordnung

Fuer die technische Pilotentscheidung nimmt der Auftraggeber die Aufgaben von Service-Owner, Go/No-Go-Verantwortlichem und technischem Betreiber derzeit selbst wahr. Er hat den geschuetzten Echtdaten-Pilot, das Deployment und die Eigenpruefung ausdruecklich selbst freigegeben. Eine davon unabhaengige rechtliche Rolle als Daten-Owner wird hier nicht unterstellt; G-01 haelt stattdessen die persoenliche Bestaetigung der Verarbeitungsbefugnis transparent fest.

Diese Aufzeichnung ist eine transparente technische Selbstentscheidung. Sie ist **keine** Freigabe der gematik, keine Produktivbetriebsfreigabe und keine vorgetaeuschte unabhaengige Datenschutz- oder Informationssicherheitspruefung. Die fehlende Funktionstrennung und zweite pruefende Person bleiben dokumentierte Restrisiken.

Der Pilot beginnt mit dem ersten erfolgreichen schreibenden Storage- oder DB-Apply und endet spaetestens 28 Kalendertage danach oder frueher mit Abschluss der technischen Vorstellung. Eine Verlaengerung benoetigt eine neue ausdrueckliche Entscheidung. Danach werden Echtdaten aus `pre-gematik` kontrolliert geloescht oder die Umgebung nach dokumentierter Uebergabe stillgelegt. Supabase bleibt bis zur technischen Abnahme und einer eigenen Abschaltentscheidung die fuehrende Quelle.

Der Dienst arbeitet Best Effort ohne SLO, Rufbereitschaft oder 24/7-Zusage. Betreuungszeit ist werktags 09:00 bis 17:00 Uhr Europe/Berlin. Pilot-RTO sind acht Betreuungsstunden ab Erkennung; das anwendungsweite Pilot-RPO sind maximal 24 Stunden, weil Cloud SQL und GCS keinen atomaren gemeinsamen Wiederherstellungspunkt besitzen. Fuer den eingefrorenen Cutover-Ausgangsstand gilt RPO 0 gegenueber dem bestaetigten Quellfingerprint. Dies sind Zielwerte und keine garantierten Leistungszusagen.

## Entscheidungen G-01 bis G-07

| Gate | Entscheidung fuer den persoenlichen Pilot | Status vor Apply |
| --- | --- | --- |
| G-01 Datenzweck | Zweck ist die geschuetzte technische Erprobung und Vorstellung des Versorgungs-Kompass mit dem bereits in Supabase gefuehrten Bestand. Kontakte, Organisationen, Expertenkreis, Stakeholder, Formate, Hospitationen, Beobachtungen, Historie und zugehoerige private Dateien werden nicht oeffentlich bereitgestellt und nicht fuer einen neuen fachlichen Zweck angereichert. Der Auftraggeber bestaetigt, zur Nutzung und Migration des konkreten Bestands fuer diesen begrenzten Zweck befugt zu sein. | `OWNER-ATTESTED`; keine institutionelle Datenschutz- oder Rechtspruefung |
| G-02 Schutzbedarf | Personenbezogene und betriebsinterne Inhalte werden als geschuetzt behandelt. IAP, rollenbasierte API-Autorisierung, private Cloud-SQL-Verbindung, private versionierte Buckets, Secret Manager, minimierte Logs und fail-closed Migration sind verpflichtend. Fehlende institutionelle Security-/Datenschutzpruefung und die persoenliche GCP-Pre-Integration sind akzeptierte Pilotrisiken. | `RISIKO DURCH PILOT-OWNER AKZEPTIERT`; technische Nachweise muessen vor Dienstoeffnung gruen sein |
| G-03 Zugriff | Genau eine regulaere menschliche IAP-Identitaet, der Pilot-Owner, ist zulaessig. Unbekannte oder inaktive Identitaeten muessen `403` erhalten. Der Auftraggeber ist Access- und Break-glass-Owner; Joiner/Mover/Leaver werden im Pilot durch manuelle Entfernung aus IAP und `identity_bindings` umgesetzt. Neue Nutzer stoppen den Pilot bis zu einer neuen Entscheidung. | `TECHNISCH VERIFIZIERT` erst nach IAP-/IAM-Nachweis vor Apply und erneut vor Dienstoeffnung |
| G-04a Identitaetsplan | Das exakte IAP-Subject wird einer stabilen Quellprofil-ID und Rolle zugeordnet; es gibt keine E-Mail-Ableitung. Alle anderen importierten Profile bleiben ungebunden. Weil derzeit keine zweite Person verfuegbar ist, gilt eine ausdrueckliche Eigenpruefungs-Ausnahme: derselbe Operator prueft Datei und Fingerprint in zwei getrennten Durchlaeufen und dokumentiert die fehlende Funktionstrennung. | `SELBSTGEPRUEFT`; Vier-Augen-Anforderung nicht erfuellt; geschuetzte Soll-Datei und zwei identische Preview-Fingerprints vor DB-Apply erforderlich |
| G-04b Identitaetsbindung | Bindungen werden erst nach erfolgreichem Datenimport bei weiterhin geschlossenem Dienst angewendet. Ein aktiver Admin wird positiv, eine unbekannte Identitaet negativ und jede konfigurierte Rolle gegen ihre Rechte getestet. | zwingender Stop vor Dienstoeffnung |
| G-05 Wiederherstellung | Cloud SQL bleibt mit automatischen Backups, PITR und 14 aufbewahrten Sicherungen geschuetzt. Unmittelbar vor dem Import wird ein neues On-demand-Backup mit Zeituntergrenze und ID gekoppelt. Storage wird separat ueber Versionierung, create-only Upload, SHA-256-Manifest und Recovery-Journal abgesichert. RTO und RPO gelten wie oben beschrieben und werden in der Restore-Probe gemessen. | `TECHNISCH VERIFIZIERT` erst nach Restore-Probe und finalem Vorimport-Backup |
| G-06 Cutover | Es wird kein paralleler Schreibbetrieb zugelassen. Da die oeffentliche Demo keine Supabase-Echtdaten mehr verwendet, wird der aktuelle Quellfingerprint als Freeze-Nachweis genutzt und unmittelbar vor Apply erneut geprueft. Das Cutover-Fenster betraegt maximal vier Stunden; der Auftraggeber ist Go/No-Go-Owner. Jede Drift-, Quarantaene-, Count-, PK-, Inhalts-, FK-, Gate- oder Zielidentitaetsabweichung bedeutet No-Go. | `GO DURCH PILOT-OWNER` erst nach aktuellem Doppel-Preview und finalem Go/No-Go-Vermerk |
| G-07 Plattformrisiko | Die Cloud-SQL-Instanz und das Terraform-Pilotsoll bleiben aus Kostengruenden bewusst `ZONAL`. Fuer diesen persoenlichen, befristeten Nicht-Produktivpilot besteht keine Hochverfuegbarkeitszusage. Ein Zonenausfall erfordert manuelle Wiederherstellung. `REGIONAL` bleibt eine spaetere, getrennt zu finanzierende Zielbetriebsentscheidung. | selbst freigegeben |

## Betrieb, Abbruch und Rueckkehr

- Es gibt keine gesonderte Hypercare-Phase. Unmittelbare technische Abnahme, Monitoring- und Logpruefung in den ersten zwei Stunden nach Freischaltung sind Bestandteil des Cutovers.
- Vor dem ersten Zielschreibzugriff muessen Source-/Target-Pins, konkrete Backup-ID, Auth-Proxy-Binaerpin, Bucket-IAM-Pin, Storage-Preview, DB-Preview und Identity-Sollplan im geschuetzten Ausfuehrungsprotokoll stehen.
- Referenzierte Quarantaeneobjekte blockieren den DB-Import. PDF und DOCX bleiben ohne freigegebene Malware-/CDR-Pruefung ausserhalb des aktiven Bestands.
- Fehler vor DB-COMMIT fuehren zum vollstaendigen Transaktions-Rollback. Bei unbekanntem COMMIT-Ergebnis gibt es keinen automatischen Retry.
- Nach ersten Nutzerschreibzugriffen werden bei einem schwerwiegenden Fehler beide Systeme schreibgesperrt; der Auftraggeber entscheidet anhand des gemessenen RTO/RPO zwischen Forward Fix und Restore.
- Supabase wird durch diesen Pilot weder geloescht noch automatisch deaktiviert.

## Aufbewahrung und Loeschung

- Ziel-Echtdaten bleiben laengstens bis zum Pilotende aktiv. Bei Pilotende werden Zugriff und Schreibbetrieb sofort gesperrt.
- Cloud-SQL-Daten, Identity-Bindungen und saemtliche GCS-Objektgenerationen werden spaetestens sieben Kalendertage nach Pilotende geloescht.
- Zielbackups und PITR-Wiederherstellbarkeit enden spaetestens 14 Tage nach Pilotende; die vollstaendige Entfernung wird nachgewiesen.
- Kurzlebige Reader-, Admin- und Migrations-Credentials werden innerhalb von 24 Stunden nach dem jeweiligen Vorgang widerrufen oder rotiert.
- Personenbezogene Identity-Listen, Storage-Manifeste und Recovery-Journale werden geschuetzt ausserhalb des Repositorys gehalten und spaetestens sieben Tage nach Pilotende geloescht.
- Bereinigte technische Evidenz ohne Personenbezug darf hoechstens 90 Tage aufbewahrt werden. Fachliche Request-Bodies, Tokens und Zugangsdaten duerfen nicht geloggt werden.

## Geschuetzte Nachweise

Personenbezogene Inhalte, Projekt-Pins, IAP-Subjects, Profil-IDs, Zugangsdaten, Objektpfade, Manifestdetails und Fingerprints gehoeren nicht in Git. Sie werden nur in einem owner-only Ausfuehrungsverzeichnis beziehungsweise einem geschuetzten Ticket abgelegt. Das oeffentliche Repository enthaelt ausschliesslich diese nicht personenbezogene Entscheidungslogik.
