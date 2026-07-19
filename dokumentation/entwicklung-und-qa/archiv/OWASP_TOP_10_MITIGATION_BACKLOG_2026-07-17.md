# OWASP Top 10:2025 – Mitigations-Backlog

> **Archivierter Planungsstand vom 17.07.2026.** Dieser Arbeitsplan wurde durch den [Mitigations- und Abnahmenachweis](../OWASP_TOP_10_2025_MITIGATION_NACHWEIS.md) abgelöst. Enthaltene `docs/`- und Synchronisationspfade sind historisch und dürfen nicht als aktuelle Betriebsanleitung verwendet werden.

Status: vorbereitet, noch nicht implementiert
Grundlage: Security-Audit vom 17.07.2026
Zweck: alle bestätigten Risiken in einer sicheren, nachvollziehbaren Reihenfolge abarbeiten

## Arbeitsregeln

- Die Arbeitspakete werden in der angegebenen Reihenfolge umgesetzt. Ein Gate wird erst verlassen, wenn alle Abnahmekriterien nachgewiesen sind.
- `frontend/` ist die Quelle. `docs/` wird ausschließlich mit `scripts/sync_github_pages.sh` erzeugt.
- Supabase-Schemaänderungen werden zuerst in Staging geprüft. Beim Implementieren wird eine Migration mit `supabase migration new <name>` erzeugt; keine ad-hoc benannte Migrationsdatei anlegen.
- Vor jeder produktiven Datenbankänderung werden Backup, aktueller Policy-/Grant-Stand und eine Liste der freigegebenen Nutzer gesichert.
- Ein Sicherheitsrollback öffnet keine alte Schwachstelle. Wenn eine sichere Änderung funktional stört, wird das betroffene Feature deaktiviert und per Roll-forward korrigiert.
- Der Kubernetes-/Shared-Postgres-Zielpfad bleibt ohne Nutzverkehr, bis Gate D vollständig erfüllt ist.
- Jede visuelle Webänderung wird in einem echten Browser auf Desktop und Mobile geprüft und mit Screenshot-Artefakten dokumentiert.

Prioritäten:

- **P0-Live:** sofortiger Schutz des laufenden GitHub-Pages-/Supabase-Betriebs.
- **P0-Ziel:** zwingender Release-Blocker für den noch nicht produktiven Kubernetes-Zielpfad.
- **P1:** vor der nächsten regulären Produktivveröffentlichung.
- **P2:** nachhaltige Härtung vor Abschluss des Security-Programms.

Aufwand:

- **S:** bis etwa ein halber Arbeitstag.
- **M:** ungefähr ein bis zwei Arbeitstage.
- **L:** mehrere Arbeitstage beziehungsweise Plattformabstimmung.

## Reihenfolge im Überblick

| ID | Priorität | Umgebung | Arbeitspaket | Aufwand |
| --- | --- | --- | --- | --- |
| M00 | P0-Live | Betrieb | Änderungen einfrieren, Backup und Wiederanlauf sichern | S |
| M01 | P0-Live | Supabase Auth | Öffentliche Selbstregistrierung deaktivieren | S |
| M02 | P0-Live | Supabase DB | Unsichere Notification-RPC vorübergehend sperren | S |
| M03 | P0-Live | Supabase RLS | Aktives Profil als zwingendes Zugriffsgate einführen | M |
| M04 | P0-Live | Supabase Auth | Nutzer, Profile und Sessions prüfen und quarantänisieren | S–M |
| M05 | P0-Live | Supabase Auth/RLS | Sichere Provisionierung und Profilfreigabe dauerhaft umsetzen | M |
| M06 | P1 | Supabase DB | Notification-Erzeugung autorisiert neu aufbauen | M |
| M07 | P1 | Supabase RLS | Saved-View-Eskalation schließen | S |
| M08 | P1 | Supabase DB | Kontakt-Audit atomar und serverseitig ableiten | L |
| M09 | P1 | Supabase DB | Hospitations-Actor-Felder serverseitig erzwingen | M |
| M10 | P1 | Edge Function | Alias-Login begrenzen und Abhängigkeiten einfrieren | M |
| M11 | P0-Live | Supabase | RLS-/Grant-/Advisor-Gate abnehmen | M |
| M12 | P0-Live | Veröffentlichung | `frontend`/`docs`-Drift in CI verhindern | S–M |
| M13 | P0-Live | Browser | Bestätigte DOM-XSS-Sinks schließen | M |
| M14 | P0-Live | Browser | `postMessage` als geschlossenes Protokoll absichern | M |
| M15 | P1 | Auth-Frontend | Passwort-Hash-/Local-Storage-Fallback entfernen | M |
| M16 | P1 | Browser | Iframes minimieren und Karten-Origin isolieren | M–L |
| M17 | P1 | Supply Chain | Browser-Abhängigkeiten pinnen und selbst hosten | M |
| M18 | P1 | Browser | CSP-fähige, inline-scriptfreie Auslieferung herstellen | L |
| M19 | P1 | Hosting | Security Headers und CSP erzwingen | M–L |
| M20 | P1 | QA | Browser-Security-Regressionsgate abnehmen | M |
| M21 | P0-Ziel | API/Auth | API-Authentisierung kryptographisch und fail-closed machen | L |
| M22 | P0-Ziel | API/RBAC | Route-/Feld-Rollenmatrix und Archivschutz durchsetzen | L |
| M23 | P0-Ziel | Cloud SQL | Datenbank-TLS mit CA- und Hostprüfung erzwingen | M |
| M24 | P0-Ziel | Container | Startfähiges, unveränderliches Non-Root-Image bauen | M |
| M25 | P0-Ziel | CI/CD | Images, Actions und Scanner pinnen; Rechte minimieren | M–L |
| M26 | P0-Ziel | Observability | Strukturierte Security-Logs und Alerts einführen | M–L |
| M27 | P0-Ziel | API/DB | Fachmutationen transaktional und Audit append-only machen | L |
| M28 | P0-Ziel | Resilienz | Timeouts, Budgets und verteilte Rate Limits einführen | M |
| M29 | P1/P0-Ziel | Uploads | Validierung, Re-Encoding und Quarantäne umsetzen | L |
| M30 | P0-Ziel | Release | Zielpfad-Gate, Staging und kontrollierten Cutover abnehmen | M |
| M31 | P2 | Repository/Betrieb | Alias-/E-Mail-Offenlegung und Dokumentation bereinigen | S–M |
| M32 | P2 | Governance | Gesamtnachweis, Restrisiko und Wiederholungsprüfung abschließen | M |

---

## Phase A – Laufenden Betrieb sofort eindämmen

### M00 – Änderungen einfrieren, Backup und Wiederanlauf sichern

- [ ] Sicherheitsarbeiten in einem eigenen Branch beziehungsweise klar abgegrenzten Commit-Satz durchführen.
- [ ] Produktive Veröffentlichungen bis Gate A aussetzen.
- [ ] Datenbankbackup außerhalb des Repositorys erstellen und Wiederherstellbarkeit stichprobenartig prüfen.
- [ ] Aktuelle Auth-User, `profiles`, Rollen, `active`-Status, RLS-Policies, Grants und Funktionen exportieren.
- [ ] Liste der fachlich genehmigten Nutzer und mindestens zwei erreichbare Admin-Konten bestätigen.
- [ ] Zeitpunkt, Verantwortliche und Notfallkontakt dokumentieren.

**Abnahme**

- Backup ist lesbar, geschützt abgelegt und eine Restore-Probe ist dokumentiert.
- Freigegebene Nutzer lassen sich eindeutig gegen Auth-User und Profile abgleichen.
- Ein Break-glass-Zugriff über Supabase Dashboard beziehungsweise Service-Administration ist geprüft, ohne Schlüssel im Repository abzulegen.

**Rollback**

- Nicht erforderlich; bei Problemen bleibt die Veröffentlichung eingefroren.

### M01 – Öffentliche Selbstregistrierung deaktivieren

- [ ] In Supabase Auth „Allow new users to sign up“ deaktivieren.
- [ ] E-Mail-Provider nur für Anmeldung und Admin-Einladungen weiterverwenden.
- [ ] Den Sollzustand zusätzlich in `supabase/config.toml` festhalten: E-Mail-Signup und anonyme Sign-ins deaktiviert, Bestätigungen aktiv.
- [ ] Einen Release-Preflight ergänzen, der `/auth/v1/settings` read-only prüft und bei offenem Signup oder anonymen Sign-ins fehlschlägt.
- [ ] Login-/Onboarding-Texte auf Einladung/Freigabe ausrichten.
- [ ] Die Einstellung read-only über `/auth/v1/settings` verifizieren; `disable_signup` muss `true` sein.

**Abnahme**

- Ein Signup-Versuch in Staging wird abgewiesen.
- Bestehende genehmigte Nutzer können sich weiter anmelden.
- Es wurde kein Testkonto in Produktion angelegt.

**Rollback**

- Öffentliche Registrierung wird nicht wieder aktiviert. Neue Nutzer werden bis M05 ausschließlich administrativ eingeladen.

### M02 – Unsichere Notification-RPC vorübergehend sperren

**Betroffene Bereiche:** `public.create_notification_event`, Frontend-Notification-Aufrufer, neue Migration.

- [ ] `EXECUTE` für `authenticated`, `anon` und `PUBLIC` entziehen.
- [ ] Nichtkritische Notification-Erzeugung vorübergehend per Feature-Flag deaktivieren oder nur serverintern ausführen.
- [ ] Bestehende Notification-Daten auf ungewöhnliche Empfängerzahlen, Titel, Routen und Payloadgrößen prüfen.

**Abnahme**

- Direkter RPC-Aufruf als Viewer, Editor oder externer Auth-User wird verweigert.
- Lesen und Markieren eigener vorhandener Notifications funktioniert weiterhin.
- Die App behandelt die vorübergehend deaktivierte Erzeugung ohne Datenverlust im Hauptvorgang.

**Rollback**

- Kein breites `GRANT EXECUTE` zurückgeben. Bei Funktionsbedarf M06 vorziehen.

### M03 – Aktives Profil als zwingendes RLS-Zugriffsgate einführen

**Betroffene Bereiche:** `supabase/schema.sql`, neue Supabase-Migration, alle Policies exponierter Tabellen und Storage-Objekte.

- [ ] `profiles.active` standardmäßig auf `false` setzen und `handle_new_user` explizit mit `role='viewer', active=false` provisionieren; keine Freigabe aus User-Metadata übernehmen.
- [ ] Eine einzige, serverseitige Prüfung für ein aktives Profil und eine gültige Rolle definieren; privilegierte Hilfsfunktionen nach Möglichkeit in ein nicht exponiertes Schema legen.
- [ ] Das Active-Gate als restriktive Policy (`AS RESTRICTIVE`) auf jeder exponierten Anwendungstabelle einsetzen oder gleichwertig in jede Policy integrieren. Eine zusätzliche permissive Policy reicht nicht, weil permissive Policies miteinander verodert werden.
- [ ] Alle `SELECT`-, `INSERT`-, `UPDATE`- und `DELETE`-Policies inventarisieren. `TO authenticated` oder ein Statusfilter allein gilt nicht als Autorisierung.
- [ ] Aktive Rollen `viewer`, `editor`, `admin` explizit verlangen; ein inaktives oder fehlendes Profil darf keine CRM-, Organisations-, Hospitations-, Profil-, Notification-, Audit- oder Storage-Daten erhalten.
- [ ] `profiles USING (true)` ersetzen: inaktive Nutzer sehen höchstens ihr eigenes minimales Pending-Profil; aktive Teammitglieder nur die fachlich erforderlichen Profile.
- [ ] Schreibrechte weiterhin nach Rolle, Eigentum, Status und Actor binden.
- [ ] Direkte Tabellen-/Sequenz-/Funktionsgrants zusammen mit RLS prüfen.
- [ ] `SECURITY DEFINER`-Hilfsfunktionen auf festen `search_path`, minimale `EXECUTE`-Grants und explizite `auth.uid()`-Prüfung härten.

**Abnahme**

Eine Integrationstestmatrix weist für jede exponierte Ressource nach:

| Identität | Lesen | Schreiben | Archivdaten |
| --- | --- | --- | --- |
| anon | verweigert | verweigert | verweigert |
| authenticated ohne Profil | verweigert | verweigert | verweigert |
| inaktives Profil | verweigert | verweigert | verweigert |
| viewer | aktive, erlaubte Daten | verweigert | verweigert |
| editor | aktive, erlaubte Daten | erlaubte Fachoperationen | verweigert |
| admin | gemäß Adminmodell | gemäß Adminmodell | erlaubt |

- Ein bereits ausgestelltes JWT eines danach deaktivierten Profils verliert sofort den Datenzugriff.
- Keine Policy verlässt sich ausschließlich auf `TO authenticated`, `auth.role()` oder einen Client-Actor.

**Rollback**

- Bei Lockout über den administrativen Kanal eine korrigierte Policy vorwärts ausrollen. RLS nicht abschalten und permissive Altpolicies nicht reaktivieren.

### M04 – Nutzer, Profile und Sessions prüfen und quarantänisieren

**Abhängigkeit:** M03 muss produktiv wirksam sein, damit `active=false` sofort sperrt.

- [ ] Auth-User, Profile und genehmigte Nutzerliste abgleichen.
- [ ] Unbekannte beziehungsweise nicht freigegebene Profile auf `active=false` setzen.
- [ ] Zugehörige Sessions zuerst widerrufen; erst danach Nutzer gegebenenfalls löschen. Das Löschen eines Users allein invalidiert bestehende JWTs nicht zuverlässig sofort.
- [ ] Erstellzeitpunkte, letzte Logins, Änderungen, Exporte und Notification-Ereignisse auffälliger Konten prüfen.
- [ ] Bei Hinweisen auf Missbrauch Incident-Prozess starten und erreichbare Service-/Cloud-/CI-Secrets gezielt rotieren.
- [ ] Ergebnis ohne unnötige personenbezogene Daten dokumentieren.

**Abnahme**

- Jeder aktive Auth-User ist fachlich genehmigt und besitzt genau die vorgesehene Rolle.
- Gesperrte Tokens können trotz Restlaufzeit keine Daten lesen.
- Es gibt keine verwaisten aktiven Profile oder unbekannten Admin-/Editorrollen.

### Gate A – Eindämmung abgeschlossen

- [ ] Signup ist geschlossen.
- [ ] Inaktive/fehlende Profile werden durch RLS vollständig gesperrt.
- [ ] Nutzer- und Sessionprüfung ist abgeschlossen.
- [ ] Unsichere Notification-RPC ist gesperrt.
- [ ] Backup und administrativer Wiederanlauf sind nachgewiesen.

Erst danach dürfen normale, nicht sicherheitskritische Veröffentlichungen wieder aufgenommen werden.

---

## Phase B – Supabase dauerhaft absichern

### M05 – Sichere Provisionierung und Profilfreigabe umsetzen

**Betroffene Bereiche:** `supabase/schema.sql`, `public.handle_new_user`, Profilverwaltung, Onboarding-Dokumentation.

- [ ] `handle_new_user` erzeugt höchstens ein inaktives Pending-Profil; Rolle und Freigabe kommen nicht aus `raw_user_meta_data`.
- [ ] Admin-Einladung und Admin-Freigabe als einzigen Produktivpfad dokumentieren.
- [ ] Aktivierung und Rollenvergabe nur durch Admins; eigene Profilpflege darf `active` und `role` nie ändern.
- [ ] Triggerfunktion für direkte RPC-Ausführung sperren und festen `search_path` beibehalten.
- [ ] UI zeigt für ein inaktives Profil einen neutralen „Freigabe ausstehend“-Zustand ohne CRM-Daten.

**Abnahme**

- Neues Staging-Konto bleibt bis zur Adminfreigabe datenlos.
- Manipuliertes User-Metadata-Feld kann weder Rolle noch Aktivstatus beeinflussen.
- Aktivierung und Deaktivierung wirken mit vorhandenem JWT sofort über M03.

### M06 – Notification-Erzeugung autorisiert neu aufbauen

- [ ] Bevorzugt serverseitigen Domainpfad beziehungsweise Edge/API-Funktion verwenden; Service-Role bleibt ausschließlich dort.
- [ ] Falls eine `SECURITY DEFINER`-RPC erforderlich bleibt: nicht exponiertes Schema für interne Helfer, feste Event-Allowlist, erforderliche Mindestrolle, Entitätsberechtigung und Actor aus `auth.uid()`.
- [ ] Titel, Body, Route, Payload und Empfängerzahl hart begrenzen.
- [ ] Empfänger serverseitig aus dem Fachereignis ableiten; keine beliebige Browserliste akzeptieren.
- [ ] Rate Limit und idempotenten Eventschlüssel einführen.
- [ ] UI behandelt Route ausschließlich als interne, allowlist-validierte Navigation.

**Abnahme**

- Viewer kann keine Events erzeugen.
- Editor/Admin kann nur erlaubte Events für tatsächlich autorisierte Entitäten erzeugen.
- Übergröße, unbekannter Typ, fremde Entität, externe Route, zu viele Empfänger und Wiederholung werden abgewiesen beziehungsweise dedupliziert.

### M07 – Saved-View-Eskalation schließen

**Betroffene Bereiche:** `supabase/schema.sql`, `supabase/phase4-saved-views.sql`, neue Migration.

- [ ] `WITH CHECK` so ändern, dass Eigentümer ausschließlich `scope='private'` halten dürfen.
- [ ] Team-Views nur für Admins anlegen, ändern und löschen lassen.
- [ ] `owner_id` bei Updates unveränderlich machen oder separat prüfen.

**Abnahme**

- Viewer/Editor kann private eigene Views verwalten, aber weder `scope='team'` noch fremde `owner_id` setzen.
- Admin kann Team-Views verwalten.
- Negative REST- und UI-Tests liefern `403` beziehungsweise keine geänderte Zeile.

### M08 – Kontakt-Audit atomar und serverseitig ableiten

**Betroffene Bereiche:** `changes`, `activity_events`, Kontakt-Writer in `frontend/data/data-service.js` und später API-Writer.

- [ ] Direkte Browser-Inserts in `changes` entziehen.
- [ ] Kontaktmutation und Audit in einer DB-Transaktion beziehungsweise einer streng autorisierten Domain-RPC ausführen.
- [ ] Actor aus `auth.uid()` beziehungsweise verifizierter Serversession setzen; Before/After aus echten DB-Zeilen ableiten.
- [ ] Kanonisches append-only `activity_events` als führenden Auditpfad verwenden; Legacy-`changes` nur migrationskompatibel lesen.
- [ ] Auditfehler muss die Fachmutation zurückrollen oder über eine atomare Outbox garantiert nachgezogen werden.

**Abnahme**

- Kein Kontaktupdate ohne Audit und kein frei erfundener Auditdatensatz möglich.
- Failpoint zwischen Mutation und Audit ergibt vollständigen Rollback.
- Actor, Zeit und Delta stimmen mit DB-Zustand überein.

### M09 – Hospitations-Actor-Felder serverseitig erzwingen

**Betroffene Bereiche:** `supabase/migrations/20260717150000_hospitation_observations_workbench.sql`, neue Migration.

- [ ] `BEFORE INSERT/UPDATE` setzt `created_by`, `updated_by` und bei Archivierung `archived_by` aus `auth.uid()`.
- [ ] Clientwerte für Actor-Felder ignorieren beziehungsweise ablehnen.
- [ ] RLS bindet Actor-/Statusänderungen zusätzlich an Rolle; Archiv/Restore bei Bedarf Admin-only.
- [ ] Audit-Trigger protokolliert ausschließlich die serverseitig gesetzten Werte.

**Abnahme**

- Ein Editor kann weder fremde UUID noch `null` als Actor einschleusen.
- Archive/Restore folgt der dokumentierten Rollenmatrix.
- Change-Ledger und aktuelle Zeile enthalten denselben verifizierten Actor.

### M10 – Alias-Login begrenzen und Abhängigkeiten einfrieren

**Betroffene Bereiche:** `supabase/functions/login-with-alias/index.ts`, neues funktionsspezifisches `deno.json` und Lockfile.

- [ ] `@supabase/supabase-js` auf eine exakt geprüfte Version pinnen; Funktions-Lockfile committen und Frozen-Dependency-Check in CI ergänzen.
- [ ] Alias-Auflösung und Passwortanmeldung gemeinsam nach Alias/IP-Fingerprint rate-limiten, ohne Klartext-Identifier zu speichern.
- [ ] Einheitliche, neutrale Fehlermeldung und konstantes Antwortverhalten für unbekannten Alias und falsches Passwort.
- [ ] Bodygröße, Feldlängen und Requesttimeout begrenzen.
- [ ] Service-Role nur für die minimale Aliasabfrage verwenden; keine Schlüssel loggen.
- [ ] Produktive Alias-/E-Mail-Zuordnungen aus Dokumentation entfernen; siehe M31.

**Abnahme**

- Lockfile-Drift bricht den Build.
- Brute-Force-Test trifft `429` und erzeugt ein Security-Event.
- Aliasexistenz ist anhand Status, Text und grober Antwortzeit nicht unterscheidbar.

### M11 – Supabase-Sicherheitsgate abnehmen

- [ ] `supabase --version` prüfen und die zur Version passenden CLI-Befehle über `--help` verifizieren.
- [ ] Migrationen in Staging vollständig neu anwenden und Reihenfolge prüfen.
- [ ] RLS-Matrix aus M03 sowie die Negativtests M05–M10 ausführen.
- [ ] `supabase db advisors` beziehungsweise den verfügbaren Advisor ausführen und relevante Security-Hinweise schließen.
- [ ] Alle Funktionen, Views, Grants, Storage-Policies und exponierten Tabellen inventarisieren.
- [ ] Prüfen, dass neue interne Tabellen/Funktionen nicht unbeabsichtigt in der Data API exponiert sind.
- [ ] `supabase/schema.sql` und additive Migrationen auf denselben Endzustand bringen.

**Abnahme**

- Frische Staging-Datenbank und migrierte Staging-Datenbank ergeben denselben Sicherheitszustand.
- Alle Rollen-/RLS-Negativtests sind grün.
- Offene Advisor-Befunde sind behoben oder mit Verantwortlichem, Frist und Begründung dokumentiert.

### Gate B – Supabase dauerhaft abgesichert

- [ ] M05 bis M11 sind implementiert und in Staging sowie Produktion nachgewiesen.
- [ ] Kein Browserpfad besitzt Service-Role-Rechte oder frei aufrufbare privilegierte Writer.
- [ ] User-Deaktivierung wirkt sofort; Audit-Actor stammt ausschließlich aus der verifizierten Session.

---

## Phase C – Browser und aktuelle Veröffentlichung härten

### M12 – `frontend`/`docs`-Drift in CI verhindern

**Betroffene Bereiche:** `scripts/sync_github_pages.sh`, Repository-Checks, Weekly-Release-Workflow.

- [ ] Sicherheitsänderungen ausschließlich unter `frontend/` vornehmen.
- [ ] Neue Protokoll-, Script- und Vendor-Dateien explizit synchronisieren.
- [ ] CI führt den Sync aus und schlägt bei anschließendem `git diff --exit-code -- docs` fehl.
- [ ] Statische Verbotsmuster ergänzen: Wildcard-`postMessage`, mutable Supabase-CDN-URL, produktiver Passwort-Hash, ausführbare Inlinehandler.

**Abnahme**

- Eine absichtlich veraltete `docs/`-Kopie lässt CI scheitern.
- Published Assets entsprechen der Quelle abzüglich dokumentierter Pfadumschreibungen.

### M13 – Bestätigte DOM-XSS-Sinks schließen

**Betroffene Bereiche:** `frontend/map/versorgungs-kompass-map.html`, danach Sync nach `docs/`.

- [ ] Kontakt-, Organisations-, Orts-, Kategorie-, Prioritäts- und Labelwerte nicht mehr per HTML-Interpolation rendern.
- [ ] Struktur mit `createElement`, Templates und DOM-APIs erzeugen; dynamischer Inhalt ausschließlich über `textContent`, sichere Attribute und `classList`.
- [ ] Badges als DOM-Knoten erzeugen.
- [ ] Bild-URLs auf erlaubte Protokolle/Origins prüfen und über `img.src` setzen.
- [ ] Inline-`onerror` durch `addEventListener` ersetzen.
- [ ] Unvermeidbare Leaflet-HTML-Kontexte zentral, kontextgerecht und testbar escapen.

**Abnahme**

- Markup-artige Sentinelwerte werden sichtbar als Text gerendert und erzeugen keine Elemente oder Events.
- In den bestätigten Pfaden gelangt kein Kontakt-/Labelwert ungeescaped in `innerHTML`.
- Desktopkarte, mobile Vorschau, Marker, Detailansicht und Avatarfallback bleiben funktional.

**Nachweise**

- Unit-Tests der Renderer.
- Playwright-Negativtest ohne ausführbaren Payload.
- Screenshots mindestens für Desktopübersicht und mobile Karten-Vorschau.

**Rollback**

- Bei Regression Kartenfeature deaktivieren und sicheren Renderer korrigieren; nicht zur HTML-Interpolation zurückkehren.

### M14 – `postMessage` als geschlossenes, versioniertes Protokoll absichern

**Abhängigkeit:** M13.

- [ ] Gemeinsames Protokollmodul mit `version`, `type`, `channelId` und Payloadschema einführen.
- [ ] Alle Sender nutzen die exakt aus der Frame-URL abgeleitete `targetOrigin`; kein `"*"`.
- [ ] Karte akzeptiert nur Embed-Modus, erlaubte Origin, `event.source === window.parent`, gültige Version/Channel und schema-valide Daten.
- [ ] Parent akzeptiert nur die exakte Karten-Origin und `event.source === frame.contentWindow` des bekannten Frames.
- [ ] Payload allowlist-basiert kopieren; Typen, Arraygröße, Stringlängen, Koordinaten und URLschemata begrenzen.
- [ ] Ungültige Nachrichten vollständig ignorieren; kein permissiver Fallback.

**Abnahme**

- Falsche Origin, Source, Version, Channel und Übergröße ändern weder Karte noch Navigation.
- Same-origin-Geschwisterframe und Parent-Selbstnachricht werden abgewiesen.
- Gültiger Parent↔Map-Fluss und „Kontakt öffnen“ funktionieren weiter.

**Rollback**

- Karten-Datenaustausch per Feature-Flag deaktivieren; nie auf Wildcard-Origin zurückfallen.

### M15 – Passwort-Hash-/Local-Storage-Fallback entfernen

**Betroffene Bereiche:** `frontend/login/auth-config.js`, `auth-guard.js`, `auth-login.js`, Login-/Passwortseiten und Tests.

- [ ] Produktiven `passwordHash`, Browser-SHA-Vergleich und `{authenticated:true}` als Authnachweis vollständig entfernen.
- [ ] Supabase-Modus über eine vom Provider verifizierte Benutzerabfrage freigeben; API-Modus über authentifizierten Session-Endpunkt.
- [ ] Bei fehlender, ungültiger oder nicht erreichbarer Identitätsquelle fail-closed reagieren.
- [ ] Demo als separates Paket mit ausschließlich fiktiven Daten und ohne produktive Supabase-Konfiguration halten.
- [ ] Das bisherige gemeinsame Passwort überall rotieren, falls es anderweitig wiederverwendet wurde.

**Abnahme**

- Gefälschter Local-Storage-Eintrag gewährt keinen Zugriff.
- Abgelaufene/ungültige Session und Providerfehler öffnen keine Datenansicht.
- Im ausgelieferten JavaScript gibt es keinen produktiven Passwort-Hash.

### M16 – Iframes minimieren und Karten-Origin isolieren

- [ ] Teaser/Minikarten nur mit minimal erforderlichen Sandbox-Rechten ausliefern.
- [ ] Interaktive Hauptkarte bevorzugt auf eine eigene kontrollierte Origin legen.
- [ ] Sandboxrechte durch Playwright nachweisen; keine Formulare, Popups, Downloads oder Top-Navigation erlauben.
- [ ] Direkter Aufruf der Karten-Origin erhält keine CRM-Daten.
- [ ] Die Kommunikation bleibt ausschließlich über M14 erlaubt.

**Abnahme**

- Karte kann weder Parent-DOM noch Top-Navigation verwenden.
- Nur die vorgesehene App kann den erlaubten Kommunikationskanal nutzen.

### M17 – Browser-Abhängigkeiten pinnen und selbst hosten

- [ ] Supabase JS und XLSX aus exakten Lockfile-Versionen als First-Party-Bundle ausliefern.
- [ ] Dynamische externe Scriptinjektion entfernen.
- [ ] Vor CSP-Enforcement auch Leaflet inklusive CSS/Assets first-party ausliefern; exakt gepinnte SRI-Version ist nur Übergang.
- [ ] Hash-/Lizenzmanifest für Vendor-Dateien erzeugen.
- [ ] `npm audit`, `npm audit signatures`, Lockfile-Review und externe-Script-Prüfung in CI aufnehmen.

**Abnahme**

- Browser lädt keinen Anwendungscode mehr von jsDelivr/unpkg oder einer mutable Major-URL.
- Login, Tokenrefresh, Karte und XLSX-Export funktionieren bei blockiertem externen CDN.

### M18 – CSP-fähige Auslieferung herstellen

- [ ] Ausführbare Inline-Skripte in First-Party-Dateien/Module verschieben.
- [ ] Alle Inline-Eventattribute durch `addEventListener` ersetzen.
- [ ] Kein `eval`, `new Function`, `script-src 'unsafe-inline'` oder `'unsafe-eval'`.
- [ ] Exakte `connect-src`, `frame-src`, `img-src`, `worker-src` und weitere notwendige Quellen aus realen Browserrequests ableiten.
- [ ] Statische CI-Prüfung für Inline-Scripts und Eventattribute ergänzen.

**Abnahme**

- App läuft mit `script-src 'self'` und `script-src-attr 'none'`.
- Playwright meldet in allen Kernflows keine unerwarteten `securitypolicyviolation`-Events.

### M19 – Security Headers und CSP erzwingen

- [ ] Geschützte App über Hosting/Proxy mit kontrollierbaren Response-Headern ausliefern; direkte ungeschützte GitHub-Pages-CRM-URL entfernen oder unbrauchbar machen.
- [ ] App/Login: `frame-ancestors 'none'`; Karten-Origin nur für die exakte App-Origin.
- [ ] CSP mindestens mit `default-src 'self'`, `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` und exakten Allowlisten.
- [ ] `X-Content-Type-Options: nosniff`, restriktive `Referrer-Policy`, `Permissions-Policy` und HTTPS/HSTS setzen.
- [ ] CSP zunächst in Staging `Report-Only`, danach enforce; Reports dürfen keine fachlichen Inhalte sammeln.

**Abnahme**

- `curl -I` weist Pflichtheader auf jeder produktiven HTML-Route nach.
- Fremde Origin kann App/Login nicht einbetten; nur die App darf die Karten-Origin einbetten.
- Direkte GitHub-Pages-URL bietet keine ungeschützte CRM-App mehr an.

### M20 – Browser-Security-Regressionsgate abnehmen

- [ ] Tests verhindern Wildcard-`postMessage`, fehlende Origin-/Source-/Schema-Prüfung, bestätigte HTML-Sinks, Inlinehandler, produktiven Passwort-Hash und mutable Scripts.
- [ ] Playwright-Suite auf Desktop und Mobile vollständig ausführen.
- [ ] Login, Logout, Sessionablauf, Karte, Detailöffnung, Bilder, Dokumente und XLSX testen.
- [ ] Repräsentative Screenshots verlinken und CSP-Verletzungen auswerten.
- [ ] `bash scripts/sync_github_pages.sh` und Driftprüfung ausführen.

### Gate C – Aktuelle Webanwendung abgesichert

- [ ] DOM-XSS- und `postMessage`-Negativtests sind grün.
- [ ] Browser-Fallback-Auth ist entfernt.
- [ ] Browser-Abhängigkeiten sind unveränderlich/first-party.
- [ ] CSP und Pflichtheader werden produktiv ausgeliefert.
- [ ] `frontend/` und `docs/` sind nachweislich synchron.

---

## Phase D – Kubernetes-/Shared-Postgres-Zielpfad freigabefähig machen

Diese Phase betrifft den noch nicht produktiven Zielpfad. Alle folgenden P0-Ziel-Pakete sind Release-Blocker.

### M21 – API-Authentisierung kryptographisch und fail-closed machen

**Betroffene Bereiche:** `api/server.mjs`, Helm Config/Ingress, Jenkins, Preflight- und Gateway-Audit-Skripte.

- [ ] `API_AUTH_MODE` ohne unsicheren Default; fehlender/unbekannter Modus beendet den Produktionsstart.
- [ ] Für Produktion signiertes IAP-JWT oder generisches OIDC/JWT mit JWKS, Issuer, Audience, Ablaufzeit und Signatur validieren.
- [ ] Im IAP-Modus `IAP_JWT_AUDIENCE` zwingend verlangen.
- [ ] Kein Fallback von signierter Assertion auf `x-auth-request-email`, `x-forwarded-email` oder andere Identitätsheader.
- [ ] Dev-Profile/Bearer-Bypass bei `NODE_ENV=production` als Startfehler behandeln.
- [ ] Wenn `trusted-header` organisatorisch unvermeidbar ist, nur hinter technisch erzwungenem Auth-Gateway, Header-Stripping, mTLS/gleichwertiger Gateway-Authentisierung und NetworkPolicy; ansonsten produktiv sperren.
- [ ] API-Service nur aus dem Gateway-Namespace erreichbar machen; TLS am Ingress verpflichtend.

**Abnahme**

- Fehlende/manipulierte/abgelaufene/falsche Assertion liefert `401`.
- Beliebige Identitätsheader authentifizieren niemanden.
- Unbekanntes/inaktives Profil liefert `403`.
- JWKS-Ausfall liefert `503`, niemals Header-Fallback.
- Direkter Service-/Pod-Zugriff wird netzseitig verhindert.

### M22 – Vollständige Route-/Feld-Rollenmatrix und Archivschutz

- [ ] Heuristik in `requiredRoleForRequest()` durch ein deklaratives Manifest aus Methode, Pfadtemplate, Mindestrolle und Zusatzregel ersetzen.
- [ ] Nicht klassifizierte Routen standardmäßig verweigern.
- [ ] Viewer nur aktive Daten; Editor Fachmutationen ohne globale Deletes, Import, Export, Ops und Archiv/Restore; Admin für diese privilegierten Vorgänge.
- [ ] Ownership-Ausnahmen ausdrücklich modellieren, etwa eigene Notiz, eigener Anhang und eigenes Avatar.
- [ ] `includeArchived/includeInactive` zentral Admin-only; dieselbe Regel für direkte IDs und abhängige Ressourcen.
- [ ] Archivierte Objekte für Nicht-Admins konsistent als `404` behandeln.
- [ ] CI gleicht registrierte Handler mit dem Policy-Manifest ab.

**Abnahme**

- Automatisierte Methode×Route×Rolle-Matrix für Viewer, Editor, Admin.
- Kein Handler ohne Policy.
- Editor erhält `403` bei Delete, Archiv/Restore, Import, Export und Ops.
- Viewer/Editor sehen keine Archivdaten per Liste, ID oder abhängiger Ressource.

### M23 – Datenbank-TLS mit CA- und Hostprüfung erzwingen

- [ ] Eindeutigen Modus wie `DB_SSL_MODE=verify-full` für beide Connection-Varianten verwenden.
- [ ] CA-Bundle aus read-only Secret mounten; `rejectUnauthorized:true` und Hostnameprüfung.
- [ ] Produktionsstart verweigern, wenn TLS, CA oder Host fehlen.
- [ ] Passwort und CA getrennt verwalten; keine Zertifikate in ConfigMap/Image.
- [ ] Netzwerkzugriff auf Postgres auf App-Namespace/-ServiceAccount begrenzen.

**Abnahme**

- Gültige CA/Hostname-Verbindung funktioniert; falsche CA, falscher Hostname und TLS-off scheitern.
- `pg_stat_ssl` bestätigt verschlüsselte Verbindung.
- Logs und gerenderte Manifeste enthalten kein Passwortmaterial.

### M24 – Startfähiges, unveränderliches Non-Root-Image

- [ ] `activity-model.js` als eindeutiges Shared-Modul paketieren und im Image verfügbar machen; keine divergierende Kopie.
- [ ] Node-Basisimage auf Version und Digest pinnen.
- [ ] Feste UID/GID im Image und in Helm; `USER` setzen.
- [ ] `readOnlyRootFilesystem:true`; nur erforderliche Temp-Pfade als begrenztes `emptyDir`.
- [ ] Capabilities vollständig droppen und Seccomp beibehalten.
- [ ] Liveness auf Prozess, Readiness auf gültige Sicherheitskonfiguration und begrenzten DB-Ping ausrichten.
- [ ] Öffentliche Healthantwort auf minimale Information reduzieren.

**Abnahme**

- Image baut und startet read-only, Non-Root und ohne Capabilities.
- Shared-Modul wird gefunden; keine Secrets, `.git`, Tests oder unnötigen Frontenddaten im Image.
- Readiness fällt bei Auth-/TLS-/DB-Fehlern aus.

### M25 – CI/CD und Artefakte härten

- [ ] Semgrep, Gitleaks, Baseimage, Actions und weitere Tools auf Version plus Digest/Commit-SHA pinnen.
- [ ] Scanner mit read-only Workspace, minimalen Capabilities und ohne Deploy-Credentials ausführen.
- [ ] Keine spontanen `npx`-Downloads; Tools als Lockfile-Abhängigkeit oder exakt gepinnt nutzen.
- [ ] Credentials nur stage-lokal: Registry nur Push, Cluster nur Deploy, Bucket nur Publish.
- [ ] GitHub-Actions-`contents: write` erst in einem isolierten Release-Job nach allen Prüfungen vergeben; Install-, Build- und Testjobs bleiben read-only.
- [ ] Unvertrauenswürdige PR-Jobs strikt von Publish/Deploy trennen.
- [ ] Git-Historie vollständig auf Secrets prüfen; `--no-git` entfernen.
- [ ] Geprüften Registry-Digest an Helm übergeben; kein `latest`.
- [ ] `values.schema.json` verbietet unsichere Auth-/TLS-/Imagewerte.
- [ ] SBOM und Provenance zum Commit/Lockfile/Image-Digest archivieren und nach Möglichkeit signieren.

**Abnahme**

- Kein `latest`/unpinned Runtime- oder Scannerartefakt.
- PR-Job besitzt keine Registry-/Cluster-/Bucket-Credentials.
- Helm deployt exakt den geprüften Digest.
- Fehlender Sicherheitswert oder veränderter Digest bricht die Pipeline.

### M26 – Strukturierte Security-Logs und Alerts

- [ ] Request-/Correlation-ID und strukturierte JSON-Logs mit Route-Template, Methode, Status, Dauer, Rolle und Revision.
- [ ] Keine Tokens, Assertions, E-Mail-Adressen, Bodies, Dateiinhalte oder Querystrings loggen.
- [ ] Immer Security-Events für Authfehler, `403`, `413`, `429`, Admin-Import/Export, Archiv/Restore/Delete, Uploadablehnung, DB-TLS-/Poolfehler, Rollback und Startkonfigurationsfehler.
- [ ] Fachliches Audit aus verifizierter Session und tatsächlichem DB-Delta ableiten.
- [ ] Alerts für Signaturfehler, auffällige 401/403/429-Raten, 5xx, DB-Pool, Pod-Restarts, Readiness, Auditfehler und Adminexporte.
- [ ] Aufbewahrung, Zugriff und Incident-Empfänger dokumentieren.

**Abnahme**

- Negativtests erzeugen erwartete Events mit gemeinsamer Correlation-ID.
- Geheimnis-/PII-Sentinelwerte erscheinen in keinem Log.
- Synthetischer Signatur- und 5xx-Test erreicht die Alarmstrecke.

### M27 – Fachmutationen transaktional und Audit append-only machen

- [ ] Query-Helfer akzeptieren einen expliziten Pool-/Transaktions-Executor und fallen im Fachvorgang nie auf den globalen Pool zurück.
- [ ] Kontakt+Owner+Audit, Owner-Replace, Hospitation+Slot, Observation-Sync, Roadmap-/Needs-Replace und Formatteilnahme atomar machen.
- [ ] `SELECT … FOR UPDATE` beziehungsweise Versionsprüfung gegen Lost Updates.
- [ ] Actor ausschließlich aus verifizierter Session; kanonisches Activity-Event im selben Commit.
- [ ] Notifications und Storage-Nebenwirkungen über idempotente Outbox/Saga koordinieren.
- [ ] Expand-first migrieren; alte Apprevision bleibt mit Zusatzschema kompatibel.

**Abnahme**

- Failpoint nach jedem Teilschritt ergibt „alles oder nichts“.
- Kein Kontakt ohne Audit/Owner und kein Replace ohne Ersatz.
- Parallele Änderungen liefern definiertes Ergebnis beziehungsweise `409`.
- Outbox-Retry erzeugt keine Duplikate.

### M28 – Timeouts, Budgets und verteilte Rate Limits

- [ ] HTTP-Header-, Request-, Keepalive- und Socket-Budgets setzen.
- [ ] Kleine Fach-JSON-Requests von größeren Uploadlimits trennen.
- [ ] Pool-, Connection-, Statement-, Lock- und Transaktionstimeouts konfigurieren.
- [ ] JWKS-/Storage-/Upstream-Fetches mit `AbortSignal`, begrenztem Retry und Jitter.
- [ ] Rate Limits primär am Gateway, replikaübergreifend und nach verifizierter Profil-ID; enge Budgets für Upload, Export, Import und destruktive Aktionen.
- [ ] `429` mit `Retry-After`; Grenzwerte messen und in Staging kalibrieren.

**Abnahme**

- Slow-Header/Body, Langläufer, DB-Lock und Poolüberlast bleiben innerhalb definierter Budgets.
- Rate Limit wirkt über mehrere Replikate.
- `413`, `429`, Timeouts und `503` sind strukturiert sichtbar.

### M29 – Uploads validieren und quarantänisieren

Wenn Uploads für den Zielstart erforderlich sind, wird M29 zu P0-Ziel. Andernfalls bleiben Uploadendpunkte per Feature-Flag deaktiviert.

- [ ] Base64 strikt und Dateityp aus Bytes prüfen.
- [ ] Bilder serverseitig dekodieren, Pixel-/Dimensionslimit prüfen, Metadaten entfernen und sauber neu kodieren; Clientdimensionen ignorieren.
- [ ] PDF/DOCX/TXT strukturell prüfen; Archive, Dekompressionsbomben und MIME-/Erweiterungsabweichungen ablehnen.
- [ ] `extractedText` und Status nicht vom Browser übernehmen; isolierter Backendprozess mit CPU-/RAM-/Zeitlimit.
- [ ] Privater Quarantänepfad, Malware-/Formatprüfung, erst danach Promotion.
- [ ] Download mit verifiziertem MIME, `Content-Disposition: attachment`, `nosniff` und privater Cachepolicy.
- [ ] Bestehende Dateien inventarisieren und nachscannen oder als `legacy-unverified` sperren.
- [ ] Storage/DB über Outbox aus M27 koordinieren.

**Abnahme**

- Negative Tests für MIME-Spoofing, defekte Dateien, ZIP-/Pixelbombe, Oversize und Scanner-Testsignatur.
- Nur validierte/re-encodierte Dateien werden lesbar.
- DB-/Storagefehler erzeugen keinen öffentlich lesbaren verwaisten Zustand.

### M30 – Zielpfad-Gate und kontrollierter Cutover

- [ ] `check:target-readiness` um Auth-, RBAC-, TLS-, Image-, NetworkPolicy-, Non-Root-, Logging-, Transaktions-, Upload- und Resilienztests erweitern.
- [ ] Pipeline strikt: Unit/Negativtests → Dependency/SAST/Secret/Image-Scan → SBOM/Digest → Helm-Schema/Lint/Policy → Staging → Rollen-Smoke → Logs/Alerts → manuelles Go/No-Go → Canary → Trafficsteigerung.
- [ ] Datenmigration expand-first mit Backup und Restore-Probe.
- [ ] Alte sichere Route bis zur fachlichen Abnahme read-only als Fallback halten.

**Go/No-Go**

- Alle P0-Ziel-Pakete sind abgenommen.
- Kein direkter Header-/Netzpfad zur API.
- Viewer/Editor/Admin-Negativtests sind vollständig grün.
- TLS, Digest, Non-Root und NetworkPolicy sind technisch nachgewiesen.
- Failpointtests sind atomar; Testalarme kommen an.

**Rollback**

- Frontend auf vorheriges Artefakt, API auf vorherigen sicheren Digest, Schreibtraffic bei Datenunsicherheit sperren. Auth-Gateway, NetworkPolicy, TLS und sichere DB-Migrationen nicht lockern.

### Gate D – Zielpfad freigabefähig

- [ ] M21 bis M30 und alle Go/No-Go-Kriterien sind nachgewiesen.
- [ ] Fachliche Abnahme und technische Security-Freigabe liegen vor.
- [ ] Cutover- und Wiederanlaufplan wurden in Staging praktisch geprobt.

---

## Phase E – Repository, Betrieb und Abschluss

### M31 – Alias-/E-Mail-Offenlegung und Dokumentation bereinigen

- [ ] Produktive Alias-/E-Mail-Zuordnungen in `supabase/onboarding.md` durch Platzhalter ersetzen.
- [ ] Betroffene Login-Aliase rotieren, sofern sie als Identifier weiterverwendet werden.
- [ ] Prüfen, ob dieselben Zuordnungen in veröffentlichten Seiten, Releases oder Git-Historie vorkommen.
- [ ] History-Bereinigung nur koordiniert nach Backup, Auswirkungsanalyse und ausdrücklicher Freigabe durchführen; öffentlich bekannte E-Mail-Adressen gelten unabhängig davon als offengelegt.
- [ ] Phishing-/Account-Recovery-Hinweise in das Betriebshandbuch aufnehmen.

**Abnahme**

- Repository und Veröffentlichungsartefakte enthalten keine produktive Alias-/E-Mail-Mappingliste.
- Aktive Aliase sind nicht aus der alten Dokumentation ableitbar.

### M32 – Gesamtnachweis und Restrisiko abschließen

- [ ] `npm run check`, `npm audit --audit-level=high` und `npm audit signatures` erfolgreich.
- [ ] Supabase-RLS-/Grant-/Advisor-Gate erfolgreich.
- [ ] Vollständige Playwright-Suite Desktop/Mobile mit visuellen Nachweisen.
- [ ] API-Auth-/RBAC-/TLS-/Transaktions-/Upload-/Resilienztests erfolgreich.
- [ ] Secret-, SAST-, Dependency-, Image- und IaC-Scans erfolgreich.
- [ ] Live-Header, Signup-Status, anonyme Zugriffe und Rollenpfade read-only verifiziert.
- [ ] Incident-, Backup-, Restore-, Session-Revoke- und Rollback-Runbooks aktualisiert und geprobt.
- [ ] Für jedes verbleibende Restrisiko Owner, Frist, Begründung und akzeptierende Person dokumentieren.
- [ ] OWASP-Top-Ten-Prüfung nach Abschluss vollständig wiederholen.

### Gate E – Mitigation abgeschlossen

- [ ] Jede Risikozeile in der folgenden Matrix besitzt einen grünen technischen Nachweis oder eine formell akzeptierte Restabweichung.
- [ ] Keine P0-Aufgabe ist offen.
- [ ] Wiederholungsprüfung und nächster Reviewtermin sind terminiert.

---

## Risiko-zu-Maßnahmen-Matrix

| Bestätigtes Risiko | OWASP | Mitigation |
| --- | --- | --- |
| Offene Registrierung mit automatischem aktivem Viewer | A01, A06, A07 | M01–M05, M11 |
| `postMessage`-/DOM-XSS-Kette | A01, A05, A08 | M12–M14, M16, M18–M20 |
| Fälschbare Header-Authentisierung | A01, A02, A07 | M21, M25, M30 |
| Unvollständige API-Rollenmatrix/Archivschutz | A01 | M22, M30 |
| Fehlendes beziehungsweise unverifiziertes DB-TLS | A04 | M23, M30 |
| Mutable Edge-/Browser-/CI-Abhängigkeiten | A03, A08 | M10, M17, M24–M25 |
| Nicht startfähiges beziehungsweise Root-Zielimage | A02, A10 | M24–M25, M30 |
| Frei aufrufbare Notification-Writer-RPC | A01, A06 | M02, M06, M11 |
| Saved-View-Team-Eskalation | A01, A08 | M07, M11 |
| Manipulierbares/nicht atomares Kontakt-Audit | A08, A09 | M08, M26–M27 |
| Manipulierbare Hospitations-Actor-Felder | A08, A09 | M09, M11 |
| Fehlende Browser-Sicherheitsheader | A02, A05 | M18–M20 |
| Browser-Passworthash/Local-Storage-Auth | A06, A07 | M15, M20 |
| Unzureichende Uploadprüfung | A05, A06 | M27–M29 |
| Unstrukturierte Logs und fehlende Alerts | A09 | M26, M30 |
| Teil-Commits bei mehrstufigen Änderungen | A08, A10 | M08, M27 |
| Fehlende Rate Limits und externe Timeouts | A07, A10 | M10, M28 |
| Veröffentlichte Alias-/E-Mail-Zuordnungen | A02, A07 | M31 |

## Empfohlene neue automatisierte Nachweise

| Nachweis | Vorgeschlagener Ort |
| --- | --- |
| Supabase RLS-/Rollenmatrix | `scripts/test_supabase_security_matrix.mjs` plus Staging-Testprojekt |
| Notification-/Saved-View-/Actor-Negativtests | `scripts/test_supabase_security_mutations.mjs` |
| Karten-Renderer und Message-Protokoll | Unit-Modul plus `tests/security-map.spec.js` |
| Auth-Fallback und Sessionzustände | `tests/security-auth.spec.js` |
| Security Headers und Clickjacking | `tests/security-headers.spec.js` |
| API-JWT-/Header-Negativtests | `scripts/test_api_auth.mjs` |
| Vollständige API-RBAC-Matrix | `scripts/test_api_rbac.mjs` |
| Container-Start/Non-Root/Read-only | `scripts/test_api_container.mjs` |
| DB-TLS und Fail-closed-Start | `scripts/test_api_tls.mjs` |
| Transaktions-Failpoints | `scripts/test_api_transactions.mjs` |
| Upload-Missbrauchsfälle | `scripts/test_api_uploads.mjs` |
| Timeouts und Rate Limits | `scripts/test_api_resilience.mjs` |
| Strukturierte Logs/PII-Negativtest | `scripts/test_security_logging.mjs` |
| Publish-Drift und verbotene Muster | Erweiterung von `scripts/check_project.mjs` |

## Standard-Abnahmebefehle

Die tatsächlichen Befehle werden beim Implementieren an die verfügbare CLI-Version angepasst.

```bash
npm run check
npm audit --audit-level=high
npm audit signatures
bash scripts/sync_github_pages.sh
git diff --check
npx playwright test
```

Zusätzlich für Supabase und Zieldeployment:

```bash
supabase --version
supabase --help
supabase migration list --local
supabase db advisors
docker build -f api/Dockerfile .
helm lint deploy/helm/versorgungs-kompass
helm template versorgungs-kompass deploy/helm/versorgungs-kompass
```

Produktive Änderungen erfolgen erst nach erfolgreichem Staging-Nachweis und einem expliziten Go/No-Go am jeweiligen Gate.
