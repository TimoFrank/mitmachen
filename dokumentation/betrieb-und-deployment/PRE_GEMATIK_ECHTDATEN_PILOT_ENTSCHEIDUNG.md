# Befristete Echtdaten-Pilotentscheidung `pre-gematik`

Stand: 20. Juli 2026

## Einordnung

Fuer diesen persoenlichen Pilot nimmt der Auftraggeber vorlaeufig fachliche und technische Owner-Aufgaben sowie die Go/No-Go-Aufgabe selbst wahr. Er hat die Grundsatzentscheidung fuer Pilot, Deployment und Eigenpruefung getroffen. Der Cutover wurde am 20. Juli 2026 nach den dynamischen Live-Nachweisen als `GO MIT DOKUMENTIERTEN PILOTAUFLAGEN` abgeschlossen. Eine davon unabhaengige rechtliche Rolle als Daten-Owner wird hier nicht unterstellt; G-01 haelt stattdessen die persoenliche Bestaetigung der Verarbeitungsbefugnis transparent fest.

Diese Aufzeichnung ist eine transparente technische Selbstentscheidung. Sie ist **keine** Freigabe der gematik, keine Produktivbetriebsfreigabe und keine vorgetaeuschte unabhaengige Datenschutz- oder Informationssicherheitspruefung. Die fehlende Funktionstrennung und zweite pruefende Person bleiben dokumentierte Restrisiken.

Der Pilot beginnt mit dem ersten erfolgreichen schreibenden Storage- oder DB-Apply und endet spaetestens 28 Kalendertage danach oder frueher mit Abschluss der technischen Vorstellung. Eine Verlaengerung benoetigt eine neue ausdrueckliche Entscheidung. Nach Pilotende werden die Echtdaten gemaess Loeschplan entfernt. Eine blosse Stilllegung ersetzt die Loeschung nur, wenn **vor** Ablauf eine getrennte dokumentierte Uebergabe mit neuer Aufbewahrungsentscheidung erfolgt.

Vor dem finalen Go ist Supabase schreibfuehrend. Waehrend des Cutovers wird Supabase tatsaechlich schreibgesperrt. Nach bestandenem Go ist ausschliesslich Cloud SQL schreibfuehrend und Supabase bleibt geschuetzt read-only. Kann der Schreibfreeze beziehungsweise der vollstaendige Ausschluss aller Quell-Writer nicht nachgewiesen werden, bleibt `pre-gematik` fuer Nutzerschreibzugriffe geschlossen.

Der Dienst arbeitet Best Effort ohne SLO, Rufbereitschaft oder 24/7-Zusage. Betreuungszeit ist werktags 09:00 bis 17:00 Uhr Europe/Berlin. Bedingte Pilotziele sind acht Betreuungsstunden RTO ab Erkennung und hoechstens 24 Stunden anwendungsweites RPO; Cloud SQL und GCS besitzen keinen atomaren gemeinsamen Wiederherstellungspunkt. Fuer den eingefrorenen Cutover-Ausgangsstand wird RPO 0 gegenueber dem bestaetigten Quellfingerprint angestrebt. Fuer den persoenlichen Pilot wurden eine isolierte DB-Restore-Probe und eine getrennte synthetische Storage-Version-Restore-Probe bestanden. Eine koordinierte gemeinsame Wiederherstellungsprobe mit gemessener RTO und RPO wurde nicht durchgefuehrt; sie bleibt ausdrueckliche Pilotauflage und Voraussetzung vor einem institutionellen Zielbetrieb.

## Entscheidungen G-01 bis G-07

| Gate | Entscheidung fuer den persoenlichen Pilot | Status nach Cutover |
| --- | --- | --- |
| G-01 Datenzweck | Zweck ist die geschuetzte technische Erprobung und Vorstellung mit der versionierten Tabellen-Allowlist und referenzierten Objekten aus genau vier freigegebenen App-Buckets. `protected-source-assets` sowie PDF/DOCX ohne freigegebene Malware-/CDR-Pruefung bleiben ausgeschlossen. Der Auftraggeber bestaetigt seine Befugnis fuer Nutzung und Migration dieses konkreten Bestands und Zwecks. | `OWNER-ATTESTED`; keine institutionelle Datenschutz- oder Rechtspruefung |
| G-02 Schutzbedarf | IAP, rollenbasierte API-Autorisierung, private Cloud-SQL-Verbindung, private versionierte Buckets, restriktive IAM-Policies, Secret Manager, minimierte Logs und fail-closed Migration sind verpflichtend. Projekt, Instanz, Buckets, IAM, Secret-Verfahren und Logging-Schutz muessen **vor dem ersten Storage-Apply** gruen sein; Authentisierung und Rollen werden vor Oeffnung erneut getestet. | `TECHNISCH VERIFIZIERT`; Restrisiko persoenlich akzeptiert, keine institutionelle Freigabe |
| G-03 Zugriff | Genau eine regulaere menschliche IAP-Identitaet mit MFA ist zulaessig. Fuer den befristeten Einpersonen-Pilot wird derselbe direkt pruefbare `user:`-Principal an Projekt und beide Backends gebunden; eine nicht einsehbare Gruppe ist unzulaessig. Jeder weitere Mensch oder unbekannte Principal bedeutet No-Go. Dieselbe Person kontrolliert damit Regel- und Break-glass-Zugang; ein unabhaengiger Wiederherstellungszugang fehlt als akzeptiertes Single-Person-Risiko. Im Zielbetrieb ist wieder eine administrierbare Gruppe mit Funktionstrennung erforderlich. | `TECHNISCH VERIFIZIERT`; genau ein menschlicher Principal und eine aktive Bindung, MFA durch Pilot-Owner bestaetigt |
| G-04a Identitaetsplan | Das exakte IAP-Subject wird einer stabilen Quellprofil-ID und Rolle zugeordnet; es gibt keine E-Mail-Ableitung. Alle anderen importierten Profile bleiben ungebunden. Derselbe Operator erzeugt und prueft Datei und Fingerprint in zwei getrennten Durchlaeufen. | `ERFUELLT MIT SELBSTPRUEFUNGS-AUSNAHME`; zwei getrennte byte-identische Previews, kein unabhaengiges Vier-Augen-Prinzip |
| G-04b Identitaetsbindung | Bindungen werden erst nach erfolgreichem Datenimport bei weiterhin geschlossenem Dienst angewendet. Der eine aktive Admin wird positiv und eine unbekannte Identitaet negativ getestet. Viewer-/Editor-/Admin-Rechte werden ohne weitere Live-Identitaet ueber automatisierte Autorisierungs-Vertragstests nachgewiesen. | `GO MIT PILOTAUFLAGE`; aktiver Admin live positiv, Header-Spoofing und Autorisierungsvertrag negativ geprueft; zweite gueltig signierte unbekannte Identitaet mangels zweiter Person nicht live geprueft |
| G-05 Wiederherstellung | Ein geschuetzt referenzierter logischer Supabase-Quellsicherungsstand, Zielbackups, konkretes On-demand-Vorimport-Backup, Bucket-Versionierung, SHA-256-Manifest und Recovery-Journal sind erforderlich. Vor einem institutionellen Zielbetrieb muss eine koordinierte gemeinsame DB-/Storage-Restore-Probe Reconciliation, RTO und RPO bestehen. | `GO MIT PILOTAUFLAGE`; Vorimport-Backup sowie getrennte isolierte DB- und synthetische Storage-Restore-Proben bestanden; koordinierte Wiederherstellung und gemessene RTO/RPO offen |
| G-06 Cutover | Vor Preview und Apply wird ein tatsaechlicher Supabase-Schreibfreeze beziehungsweise vollstaendiger Writer-Ausschluss erzwungen und nachgewiesen. Ein Fingerprint allein ersetzt ihn nicht. Das Cutover-Fenster betraegt maximal vier Stunden. Jede Drift-, Quarantaene-, Count-, PK-, Inhalts-, FK-, Gate- oder Zielidentitaetsabweichung bedeutet No-Go. | `GO DURCH PILOT-OWNER`; Writer-Ausschluss, Doppel-Preview, Apply, vollstaendige Reconciliation und GKE-Rollout bestanden |
| G-07 Plattformrisiko | Die Live-Instanz und das Terraform-Pilotsoll sollen aus Kostengruenden `ZONAL` bleiben. Vor Apply muessen ein geschuetzter Live-Nachweis `settings.availabilityType == ZONAL` und ein Terraform-Plan ohne unerwartete Verfuegbarkeitsaenderung vorliegen. Ein Zonenausfall erfordert manuelle Wiederherstellung; `REGIONAL` bleibt eine spaetere Zielbetriebsentscheidung. | `TECHNISCH VERIFIZIERT`; Live-Instanz und Terraform-Pilotsoll bleiben bewusst zonal, keine HA-Umstellung |

## Ergebnis der Ausfuehrung

- Der Writer-Ausschluss der Quelle, die getrennten Storage- und Datenbanklaeufe sowie die abschliessende Reconciliation wurden bestanden. Fuer alle freigegebenen Tabellen stimmen Anzahl, Primaerschluessel- und Inhaltsfingerprints zwischen Quelle und Ziel ueberein.
- Die eine freigegebene IAP-Identitaet ist aktiv als Admin gebunden. Der angemeldete Browser laedt die geschuetzten Bereiche Versorgung, Stakeholder, Expertenkreis, Hospitation und Formate ohne Demo-Switcher oder Supabase-Laufzeitabhaengigkeit.
- Der unveraenderliche GKE-Rollout auf `main` hat Repository-, Container-, Vulnerability-, Helm-, Datenbank-, IAP- und externe Grenztests bestanden.
- Temporaere Operator-Ressourcen, Import-IAM, persoenliches Storage-Admin-Recht, Restore-Probe, Reader-Rolle, lokale Klartext-Credentials und redundante Klartext-Preflight-Dumps wurden nach der Abnahme entfernt. Der Entschluesselungsschluessel ist getrennt von den geschuetzten verschluesselten Quelldumps im lokalen Schluesselbund abgelegt.
- Supabase bleibt als geschuetzte, schreibgesperrte Rueckfallquelle erhalten und wird durch diesen Cutover nicht geloescht.
- Die Abschlussklassifikation lautet `GO MIT DOKUMENTIERTEN PILOTAUFLAGEN`. Vor einem institutionellen Zielbetrieb muessen insbesondere der Live-Negativtest mit einer zweiten gueltig signierten, ungebundenen Identitaet, die koordinierte Wiederherstellungsprobe mit gemessener RTO/RPO und ein formaler Alarmierungs-/Empfangsnachweis nachgeholt werden.

## Betrieb, Abbruch und Rueckkehr

- Es gibt keine gesonderte Hypercare-Phase. Nach dem Rollout erfolgte die unmittelbare technische Smoke- und Browserabnahme. Ein formaler Alarmierungs-, Monitoring- und Empfangsnachweis wurde fuer diesen persoenlichen Pilot nicht erbracht und bleibt Zielbetriebsaufgabe.
- Vor dem ersten Zielschreibzugriff muessen geschuetzt referenzierter Quellsicherungsstand, Source-/Target-Pins, konkrete Zielbackup-ID, Auth-Proxy-Binaerpin, Bucket-IAM-Pin, Storage-Preview, DB-Preview und Identity-Sollplan im owner-only Ausfuehrungsprotokoll stehen.
- Referenzierte Quarantaeneobjekte blockieren den DB-Import. PDF und DOCX bleiben ohne freigegebene Malware-/CDR-Pruefung ausserhalb des aktiven Bestands.
- Fehler vor DB-COMMIT rollen nur die DB-Transaktion vollstaendig zurueck. Zuvor create-only angelegte GCS-Objekte bleiben erhalten; Recovery-Journal und Manifest werden abgeglichen, der Dienst bleibt geschlossen und verwaiste Generationen werden erst danach kontrolliert bereinigt.
- Bei unbekanntem COMMIT-Ergebnis gibt es keinen Retry und keinen zweiten Import. Das Ziel bleibt geschlossen und wird read-only untersucht; die ausgegebene Lauf-ID wird exakt in `public.import_runs` und gegen den Zielbestand geprueft. Erst danach wird ueber Fortsetzen, vollstaendige Rueckmigration oder Restore entschieden.
- Nach ersten Nutzerschreibzugriffen werden bei einem schwerwiegenden Fehler beide Systeme schreibgesperrt. Moeglich sind Forward Fix, vollstaendige Rueckmigration oder Restore. Ein Restore mit Datenverlust seit Sicherung braucht eine separate dokumentierte Entscheidung mit exakt ausgewiesenem Differenzumfang.
- Supabase wird durch diesen Pilot weder geloescht noch automatisch deaktiviert.
- Sofortiger Schreibstopp gilt bei Zugriff- oder Abflussverdacht, fehlendem erfolgreichem Sicherungspunkt ueber 24 Stunden, DB-/GCS-Inkonsistenz, RTO-Ueberschreitung, Owner-Ausfall ueber einen Betreuungstag, neuem Nutzer, Datenumfang oder Zweck sowie bei erreichtem Pilotende. Ohne neue Entscheidung gibt es keine stillschweigende Verlaengerung.

## Aufbewahrung und Loeschung

- Ziel-Echtdaten bleiben laengstens bis zum Pilotende am **17. August 2026** aktiv. Bei Pilotende werden Zugriff und Schreibbetrieb sofort gesperrt.
- Cloud-SQL-Daten, Identity-Bindungen und saemtliche GCS-Objektgenerationen werden spaetestens am **24. August 2026** geloescht, sofern vorher keine getrennte Uebergabe- und Aufbewahrungsentscheidung getroffen wurde.
- Zielbackups und PITR-Wiederherstellbarkeit enden spaetestens am **31. August 2026**; die vollstaendige Entfernung wird nachgewiesen.
- Kurzlebige Reader-, Admin- und Migrations-Credentials werden innerhalb von 24 Stunden nach dem jeweiligen Vorgang widerrufen oder rotiert.
- Personenbezogene Identity-Listen, Storage-Manifeste und Recovery-Journale werden geschuetzt ausserhalb des Repositorys gehalten und spaetestens sieben Tage nach Pilotende geloescht.
- Anwendungs- und Auditlogs werden zugriffsgeschuetzt 30 Tage aufbewahrt und danach geloescht. Erzwingt ein unveraenderbarer Plattformstandard eine laengere Dauer, wird die Abweichung vor Apply als Restrisiko dokumentiert.
- Bereinigte technische Evidenz ohne Personenbezug darf hoechstens bis zum **18. Oktober 2026** aufbewahrt werden. Fachliche Request-Bodies, Tokens und Zugangsdaten duerfen nicht geloggt werden.

## Geschuetzte Nachweise

Personenbezogene Inhalte, Projekt-Pins, IAP-Subjects, Profil-IDs, Zugangsdaten, Objektpfade, Manifestdetails und Fingerprints gehoeren nicht in Git. Sie werden nur in einem owner-only Ausfuehrungsverzeichnis beziehungsweise einem geschuetzten Ticket abgelegt. Das Repository enthaelt keine geschuetzten Ausfuehrungsnachweise; diese Datei enthaelt nur die nicht personenbezogene Entscheidungslogik und den bereinigten Abschlussstatus.
