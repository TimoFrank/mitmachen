# Befristete Echtdaten-Pilotentscheidung `pre-gematik`

Stand: 20. Juli 2026

## Einordnung

Für diesen persönlichen Pilot nimmt der Auftraggeber vorläufig fachliche und technische Owner-Aufgaben sowie die Go/No-Go-Aufgabe selbst wahr. Er hat die Grundsatzentscheidung für Pilot, Deployment und Eigenprüfung getroffen. Der Cutover wurde am 20. Juli 2026 nach den dynamischen Live-Nachweisen als `GO MIT DOKUMENTIERTEN PILOTAUFLAGEN` abgeschlossen. Eine davon unabhängige rechtliche Rolle als Daten-Owner wird hier nicht unterstellt; G-01 hält stattdessen die persönliche Bestätigung der Verarbeitungsbefugnis transparent fest.

Diese Aufzeichnung gilt nur für den beschriebenen persönlichen Test. Sie ist keine Freigabe durch die gematik und keine unabhängige Datenschutz- oder Informationssicherheitsprüfung. Die fehlende Funktionstrennung und zweite prüfende Person bleiben dokumentierte Restrisiken.

Der Pilot beginnt mit dem ersten erfolgreichen schreibenden Storage- oder DB-Apply und endet spätestens 28 Kalendertage danach oder früher mit Abschluss der technischen Vorstellung. Eine Verlängerung benötigt eine neue ausdrückliche Entscheidung. Nach Pilotende werden die Echtdaten gemäß Löschplan entfernt. Eine bloße Stilllegung ersetzt die Löschung nur, wenn **vor** Ablauf eine getrennte dokumentierte Übergabe mit neuer Aufbewahrungsentscheidung erfolgt.

Vor dem finalen Go ist Supabase schreibführend. Während des Cutovers wird Supabase tatsächlich schreibgesperrt. Nach bestandenem Go ist ausschließlich Cloud SQL schreibführend und Supabase bleibt geschützt read-only. Kann der Schreibfreeze beziehungsweise der vollständige Ausschluss aller Quell-Writer nicht nachgewiesen werden, bleibt `pre-gematik` für Nutzerschreibzugriffe geschlossen.

Der Dienst arbeitet nach bestem Bemühen und wird nur während der vereinbarten Testzeiten betreut. Cloud SQL und GCS besitzen keinen gemeinsamen Wiederherstellungspunkt. Für den persönlichen Pilot wurden Datenbank und synthetischer Storage getrennt wiederhergestellt; ein gemeinsamer Wiederherstellungslauf wurde nicht durchgeführt.

## Entscheidungen G-01 bis G-07

| Gate | Entscheidung für den persönlichen Pilot | Status nach Cutover |
| --- | --- | --- |
| G-01 Datenzweck | Zweck ist die geschützte technische Erprobung und Vorstellung mit der versionierten Tabellen-Allowlist und referenzierten Objekten aus genau vier freigegebenen App-Buckets. `protected-source-assets` sowie PDF/DOCX ohne freigegebene Malware-/CDR-Prüfung bleiben ausgeschlossen. Der Auftraggeber bestätigt seine Befugnis für Nutzung und Migration dieses konkreten Bestands und Zwecks. | `OWNER-ATTESTED`; keine institutionelle Datenschutz- oder Rechtsprüfung |
| G-02 Schutzbedarf | IAP, rollenbasierte API-Autorisierung, private Cloud-SQL-Verbindung, private versionierte Buckets, restriktive IAM-Policies, Secret Manager, minimierte Logs und fail-closed Migration sind verpflichtend. Projekt, Instanz, Buckets, IAM, Secret-Verfahren und Logging-Schutz müssen **vor dem ersten Storage-Apply** grün sein; Authentisierung und Rollen werden vor Öffnung erneut getestet. | `TECHNISCH VERIFIZIERT`; Restrisiko persönlich akzeptiert, keine institutionelle Freigabe |
| G-03 Zugriff | Genau eine reguläre menschliche IAP-Identität mit MFA ist zulässig. Für den befristeten Einpersonen-Pilot wird derselbe direkt prüfbare `user:`-Principal an Projekt und beide Backends gebunden; eine nicht einsehbare Gruppe ist unzulässig. Jeder weitere Mensch oder unbekannte Principal bedeutet No-Go. Dieselbe Person kontrolliert damit Regel- und Break-glass-Zugang; ein unabhängiger Wiederherstellungszugang fehlt als akzeptiertes Single-Person-Risiko. Im Zielbetrieb ist wieder eine administrierbare Gruppe mit Funktionstrennung erforderlich. | `TECHNISCH VERIFIZIERT`; genau ein menschlicher Principal und eine aktive Bindung, MFA durch Pilot-Owner bestätigt |
| G-04a Identitätsplan | Das exakte IAP-Subject wird einer stabilen Quellprofil-ID und Rolle zugeordnet; es gibt keine E-Mail-Ableitung. Alle anderen importierten Profile bleiben ungebunden. Derselbe Operator erzeugt und prüft Datei und Fingerprint in zwei getrennten Durchläufen. | `ERFUELLT MIT SELBSTPRUEFUNGS-AUSNAHME`; zwei getrennte byte-identische Previews, kein unabhängiges Vier-Augen-Prinzip |
| G-04b Identitätsbindung | Bindungen werden erst nach erfolgreichem Datenimport bei weiterhin geschlossenem Dienst angewendet. Der eine aktive Admin wird positiv und eine unbekannte Identität negativ getestet. Viewer-/Editor-/Admin-Rechte werden ohne weitere Live-Identität über automatisierte Autorisierungs-Vertragstests nachgewiesen. | `GO MIT PILOTAUFLAGE`; aktiver Admin live positiv, Header-Spoofing und Autorisierungsvertrag negativ geprüft; zweite gültig signierte unbekannte Identität mangels zweiter Person nicht live geprüft |
| G-05 Wiederherstellung | Ein geschützt referenzierter Supabase-Quellsicherungsstand, Zielbackups, Vorimport-Backup, Bucket-Versionierung, SHA-256-Manifest und Recovery-Journal sind erforderlich. | `GO MIT PILOTAUFLAGE`; getrennte Wiederherstellungstests bestanden, gemeinsamer Lauf offen |
| G-06 Cutover | Vor Preview und Apply wird ein tatsächlicher Supabase-Schreibfreeze beziehungsweise vollständiger Writer-Ausschluss erzwungen und nachgewiesen. Ein Fingerprint allein ersetzt ihn nicht. Das Cutover-Fenster beträgt maximal vier Stunden. Jede Drift-, Quarantäne-, Count-, PK-, Inhalts-, FK-, Gate- oder Zielidentitätsabweichung bedeutet No-Go. | `GO DURCH PILOT-OWNER`; Writer-Ausschluss, Doppel-Preview, Apply, vollständige Reconciliation und GKE-Rollout bestanden |
| G-07 Plattformrisiko | Die Live-Instanz und das Terraform-Pilotsoll sollen aus Kostengründen `ZONAL` bleiben. Vor Apply müssen ein geschützter Live-Nachweis `settings.availabilityType == ZONAL` und ein Terraform-Plan ohne unerwartete Verfügbarkeitsänderung vorliegen. Ein Zonenausfall erfordert manuelle Wiederherstellung; `REGIONAL` bleibt eine spätere Zielbetriebsentscheidung. | `TECHNISCH VERIFIZIERT`; Live-Instanz und Terraform-Pilotsoll bleiben bewusst zonal, keine HA-Umstellung |

## Ergebnis der Ausführung

- Der Writer-Ausschluss der Quelle, die getrennten Storage- und Datenbankläufe sowie die abschließende Reconciliation wurden bestanden. Für alle freigegebenen Tabellen stimmen Anzahl, Primärschlüssel- und Inhaltsfingerprints zwischen Quelle und Ziel überein.
- Die eine freigegebene IAP-Identität ist aktiv als Admin gebunden. Der angemeldete Browser lädt die geschützten Bereiche Versorgung, Stakeholder, Expertenkreis, Hospitation und Formate ohne Demo-Switcher oder Supabase-Laufzeitabhängigkeit.
- Der unveränderliche GKE-Rollout auf `main` hat Repository-, Container-, Vulnerability-, Helm-, Datenbank-, IAP- und externe Grenztests bestanden.
- Temporäre Operator-Ressourcen, Import-IAM, persönliches Storage-Admin-Recht, Restore-Probe, Reader-Rolle, lokale Klartext-Credentials und redundante Klartext-Preflight-Dumps wurden nach der Abnahme entfernt. Der Entschlüsselungsschlüssel ist getrennt von den geschützten verschlüsselten Quelldumps im lokalen Schlüsselbund abgelegt.
- Supabase bleibt als geschützte, schreibgesperrte Rückfallquelle erhalten und wird durch diesen Cutover nicht gelöscht.
- Die Abschlussklassifikation lautet `GO MIT DOKUMENTIERTEN PILOTAUFLAGEN`. Offen bleiben insbesondere der Live-Negativtest mit einer zweiten gültig signierten, ungebundenen Identität, ein gemeinsamer Wiederherstellungslauf und ein formaler Alarmierungsnachweis.

## Betrieb, Abbruch und Rückkehr

- Nach dem Rollout erfolgte unmittelbar die technische Smoke- und Browserprüfung. Ein formaler Alarmierungs- und Monitoringnachweis wurde für diesen persönlichen Test nicht erbracht.
- Vor dem ersten Zielschreibzugriff müssen geschützt referenzierter Quellsicherungsstand, Source-/Target-Pins, konkrete Zielbackup-ID, Auth-Proxy-Binärpin, Bucket-IAM-Pin, Storage-Preview, DB-Preview und Identity-Sollplan im owner-only Ausführungsprotokoll stehen.
- Referenzierte Quarantäneobjekte blockieren den DB-Import. PDF und DOCX bleiben ohne freigegebene Malware-/CDR-Prüfung außerhalb des aktiven Bestands.
- Fehler vor DB-COMMIT rollen nur die DB-Transaktion vollständig zurück. Zuvor create-only angelegte GCS-Objekte bleiben erhalten; Recovery-Journal und Manifest werden abgeglichen, der Dienst bleibt geschlossen und verwaiste Generationen werden erst danach kontrolliert bereinigt.
- Bei unbekanntem COMMIT-Ergebnis gibt es keinen Retry und keinen zweiten Import. Das Ziel bleibt geschlossen und wird read-only untersucht; die ausgegebene Lauf-ID wird exakt in `public.import_runs` und gegen den Zielbestand geprüft. Erst danach wird über Fortsetzen, vollständige Rückmigration oder Restore entschieden.
- Nach ersten Nutzerschreibzugriffen werden bei einem schwerwiegenden Fehler beide Systeme schreibgesperrt. Möglich sind Forward Fix, vollständige Rückmigration oder Restore. Ein Restore mit Datenverlust seit Sicherung braucht eine separate dokumentierte Entscheidung mit exakt ausgewiesenem Differenzumfang.
- Supabase wird durch diesen Pilot weder gelöscht noch automatisch deaktiviert.
- Sofortiger Schreibstopp gilt bei Zugriff- oder Abflussverdacht, fehlendem Sicherungspunkt, DB-/GCS-Inkonsistenz, längerem Owner-Ausfall, neuem Nutzer, verändertem Datenumfang oder erreichtem Pilotende. Ohne neue Entscheidung gibt es keine stillschweigende Verlängerung.

## Aufbewahrung und Löschung

- Ziel-Echtdaten bleiben längstens bis zum Pilotende am **17. August 2026** aktiv. Bei Pilotende werden Zugriff und Schreibbetrieb sofort gesperrt.
- Cloud-SQL-Daten, Identity-Bindungen und sämtliche GCS-Objektgenerationen werden spätestens am **24. August 2026** gelöscht, sofern vorher keine getrennte Übergabe- und Aufbewahrungsentscheidung getroffen wurde.
- Zielbackups und PITR-Wiederherstellbarkeit enden spätestens am **31. August 2026**; die vollständige Entfernung wird nachgewiesen.
- Kurzlebige Reader-, Admin- und Migrations-Credentials werden innerhalb von 24 Stunden nach dem jeweiligen Vorgang widerrufen oder rotiert.
- Personenbezogene Identity-Listen, Storage-Manifeste und Recovery-Journale werden geschützt außerhalb des Repositorys gehalten und spätestens sieben Tage nach Pilotende gelöscht.
- Anwendungs- und Auditlogs werden zugriffsgeschützt 30 Tage aufbewahrt und danach gelöscht. Erzwingt ein unveränderbarer Plattformstandard eine längere Dauer, wird die Abweichung vor Apply als Restrisiko dokumentiert.
- Bereinigte technische Evidenz ohne Personenbezug darf höchstens bis zum **18. Oktober 2026** aufbewahrt werden. Fachliche Request-Bodies, Tokens und Zugangsdaten dürfen nicht geloggt werden.

## Geschützte Nachweise

Personenbezogene Inhalte, Projekt-Pins, IAP-Subjects, Profil-IDs, Zugangsdaten, Objektpfade, Manifestdetails und Fingerprints gehören nicht in Git. Sie werden nur in einem owner-only Ausführungsverzeichnis beziehungsweise einem geschützten Ticket abgelegt. Das Repository enthält keine geschützten Ausführungsnachweise; diese Datei enthält nur die nicht personenbezogene Entscheidungslogik und den bereinigten Abschlussstatus.
