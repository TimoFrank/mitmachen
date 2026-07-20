# Repository-Governance vor Pilot und Zielbetrieb

Stand: 19. Juli 2026

Ein Teil dieser Einstellungen liegt ausserhalb des Git-Repositories. Der technische Basisschutz ist aktiv; institutionelle Team- und Zielbetriebsfreigaben bleiben offen.

Die aktuelle Ordnerbereinigung entfernt lokale Exporte und Kontaktarbeitsstaende aus dem Hauptstand. Die Bereinigung historischer Git-Objekte ist freigegeben und wird nach dem neuen Pages-Deployment gemaess [Runbook zur Datenschutzbereinigung der Git-Historie](GIT_HISTORY_DATENSCHUTZBEREINIGUNG.md) ausgefuehrt.

## 1. Default Branch `main`

- Pull Request vor Merge verpflichtend.
- Pull Requests, der erforderliche Check `Minimal repository check`, aufgeloeste Review-Kommentare sowie das Verbot von Force Push und Branch-Loeschung sind aktiv.
- Solange nur ein Maintainer vorhanden ist, sind formal null externe Freigaben erforderlich; vor Pilotbetrieb mindestens eine bestaetigte Review festlegen.
- Fuer Deployment-/Security-Pfade nach Aktivierung von CODEOWNERS eine Code-Owner-Review verlangen.
- Eigene Freigabe des letzten Pushers ausschliessen, sobald ein zweiter bestaetigter Reviewer zur Verfuegung steht und der GitHub-Tarif dies unterstuetzt.
- Offene Review-Kommentare muessen vor Merge aufgeloest sein.
- `Zielbetriebs-Check` vor Pilotbetrieb als erforderlichen Check aufnehmen oder ohne Pfadfilter immer bereitstellen; derzeit ist er ein zusaetzlicher, pfadbezogener Nachweis.
- Administrator-Bypass fuer den Zielbetriebsprozess deaktivieren oder als dokumentierten Break-glass-Prozess mit Nachkontrolle behandeln.

Der bestehende Weekly-Release-Prozess muss einen Pull Request erzeugen und darf diese Grenze nicht durch einen direkten Bot-Push umgehen.

## 2. GitHub Environment `github-pages`

- GitHub Pages verwendet bereits `GitHub Actions` als Source und veroeffentlicht `dist/pages/` direkt.
- Deployment-Branch ist auf `main` beschraenkt.
- Keine GCP-, Supabase-Service-Role- oder Zielbetriebs-Secrets hinterlegen.
- Pages bleibt die dauerhaft getrennte, oeffentliche Demo und ist kein Freigabenachweis fuer GKE.

## 3. GitHub Environment `pre-gematik`

- Derzeit ist nur `main` zugelassen.
- `TimoFrank` ist waehrend der Ein-Personen-Pre-Integration Required Reviewer; Selbstfreigabe ist deshalb technisch erlaubt. Vor Pilotbetrieb Reviewer aus Plattformbetrieb und Produktverantwortung festlegen und Selbstfreigabe ausschliessen.
- WIF-Provider weiterhin auf Repository, Environment und freigegebene Git-Referenz begrenzen.
- Nur nicht geheime Zielparameter als Environment-Variablen fuehren.
- Keine Service-Account-JSON-Datei, kein Datenbankpasswort und keine OAuth-Clientwerte in GitHub speichern.
- `prevent self-review` und `disallow admin bypass` aktivieren, wenn Tarif und Organisationsrichtlinie dies erlauben.

Die Pre-Integration verwendet standardmaessig nur synthetische oder belastbar anonymisierte Daten. Ein geschuetzter, zeitlich begrenzter Echtdaten-Pilot ist ausschliesslich nach G-01 bis G-07 im [Supabase-Cloud-SQL-Migrationsplan](SUPABASE_CLOUD_SQL_MIGRATION.md) zulaessig. Das persoenliche GCP-Projekt und persoenliche Break-glass-Konto aus der aktuellen Pre-Integration sind nicht fuer den Zielbetrieb freigegeben.

## 4. Zielbetrieb

- Produktion wird nicht als weiteres unkontrolliertes Environment des persoenlichen GitHub-Repositories angelegt.
- Die gematik Software Factory baut oder uebernimmt eine eindeutig referenzierte Revision und dokumentiert Image-Digest, Frontend-Revision, Chart- und Schema-Version.
- Produktiv-Credentials, Freigaben und Deploymenthistorie verbleiben in den von der gematik betriebenen Systemen.

## 5. Actions- und Abhaengigkeitsrichtlinie

- Standardberechtigung fuer `GITHUB_TOKEN`: read-only; Schreibrechte nur jobbezogen.
- Externe Actions nur mit voller Commit-SHA, nicht nur mit beweglichem Tag.
- Dependabot fuer npm, GitHub Actions und den API-Docker-Build ist vorbereitet.
- Die zulaessigen Actions/Organisationen nach interner Supply-Chain-Richtlinie beschraenken.
- Selbst gehostete Runner als nicht isolierte Infrastruktur behandeln und Secretzugriff entsprechend begrenzen.

## 6. CODEOWNERS

`.github/CODEOWNERS` ist aktiv und nennt mit `@TimoFrank` ausschliesslich einen bestaetigten, realen Repository-Account. Damit ist heute eindeutig sichtbar, wer Aenderungen an Anwendung, Deployment, Datenvertrag und Sicherheitsgrenzen fachlich beziehungsweise technisch pruefen muss. Sobald institutionelle Produkt-, Plattform-, Daten- und Security-Teams in der Zielorganisation existieren, ersetzt die Repository-Administration diesen Uebergangs-Owner durch die bestaetigten Teamhandles. Eine verpflichtende Code-Owner-Freigabe wird erst aktiviert, wenn mindestens eine zweite unabhaengige Person reviewen kann.

## 7. Nachweis

Die wirksamen Einstellungen werden vor Pilotstart im [Abnahmeprotokoll](ABNAHMEPROTOKOLL_TEMPLATE.md) referenziert. Abweichungen erhalten Owner, Frist und ausdrueckliche Risikofreigabe.
