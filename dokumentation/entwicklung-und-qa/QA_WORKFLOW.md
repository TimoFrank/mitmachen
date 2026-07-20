# QA Workflow

Stand: 2026-07-19.

Dieses Dokument legt fest, wie Aenderungen am Versorgungs-Kompass geprueft werden, ohne fuer kleine Aufgaben unnoetig viel Kontext und Testlaufzeit zu verbrauchen.

## Verbindliche Zwei-App-Matrix

| Pruefobjekt | Zulässige Daten und Authentisierung | Verbotener Fallback |
| --- | --- | --- |
| `pages-demo` / `dist/pages` | ausschliesslich synthetische Demo-Daten, `anonymous-demo` | Fach-API, Supabase, Target-Konfiguration, echte Sitzungen oder echte Registrierungen |
| `target` / `dist/target` | fachliche Daten ausschliesslich ueber `/api/...`; OIDC im Zielbetrieb, IAP nur im GKE-Pre-Integrationspfad | Demo-Daten, direkter Browser-Supabase-Zugriff, LocalStorage-Fachdaten oder LocalStorage-Ersatzsitzung |

Pages bleibt als oeffentliche Demo aktiv. Eine erfolgreiche Pages-Pruefung ist kein Nachweis fuer die Realanwendung; umgekehrt darf ein Target-Test nie das Pages-Artefakt mit echter Konfiguration nachruesten.

## QA-Stufen

### Stufe 1: Kleine Aenderung

Fuer reine Texte, Labels, kleine CSS-Korrekturen ohne neue Komponente, kleine Test- oder Doku-Aenderungen.

Pflicht:

```bash
npm run qa:small
```

Optional: ein gezielter DOM- oder Browser-Check, wenn die Aenderung sichtbar ist und die Wirkung nicht direkt aus dem Code hervorgeht.

Nicht automatisch: kompletter visueller Smoke, Pages-Build, Commit oder Push.

### Stufe 2: Fokussierte UI-/Flow-Aenderung

Fuer sichtbare Aenderungen in einem Arbeitsbereich, Tabellen-/Drawer-Verhalten, responsive Layouts, neue oder geaenderte Playwright-Erwartungen.

Pflicht:

```bash
npm run check
npx playwright test tests/visual-smoke.spec.js -g "<passender Testname>"
```

Desktop und Mobile muessen abgedeckt werden, wenn Navigation, Sidebar, Tabellenbreite, Drawer, Karte, Profilseite oder mobile Breakpoints betroffen sind.

### Stufe 3: Vollpruefung

Fuer Navigation, Auth, Data-Service, API, Rollenrechte, globale CSS-/JS-Helfer, neue Arbeitsbereiche, groessere Refactorings und jeden Push-/Deploy-Auftrag.

Pflicht:

```bash
npm run qa:full
```

Bei sichtbaren UI-Aenderungen zusaetzlich die relevanten Punkte aus `../produkt-und-design/VISUAL_QA_CHECKLIST.md` abgleichen. Bei GitHub-Pages-Auftraegen vorher `npm run build:pages` ausfuehren und `dist/pages/` mitpruefen; das Artefakt bleibt unversioniert.

Wenn Deploymenttrennung, Auth, Data-Service oder API-Grenze betroffen sind, muessen beide Buildprofile getrennt geprueft werden. Das Pages-Artefakt darf nur synthetische Demo-Quellen enthalten. Das Target-Artefakt muss mit `dataMode: "api"`, `requireApiGateway: true` und `authMode: "oidc"` beziehungsweise im GKE-Vorbereitungspfad `"iap"` gebaut werden. Ein API-, Session- oder Gatewayfehler muss fachliche Funktionen sperren; er darf keinen Demo-, Supabase- oder LocalStorage-Datenpfad aktivieren.

### Stufe 4: Publication-/Live-Verifikation

Fuer jeden Push-/Deploy-/GitHub-Pages-Auftrag nach dem Push.

Pflicht:

```bash
npm run verify:publication
```

`npm run verify:publication` prueft ausschliesslich den oeffentlichen Pages-Demo-Vertrag: Pages bleibt erreichbar, enthaelt aber nur synthetische Daten und keine Target-Konfiguration. Da die Realanwendung mit `dataMode: "api"` und geschuetzter Kubernetes-API laeuft, muss ihr Backend-Status separat im Abnahmeprotokoll stehen:

- `verified`: betroffene Migration/Datenoperation angewendet und die relevante Tabelle oder API autorisiert geprueft,
- `not_affected`: reine Static-/UI-Aenderung ohne Backendwirkung,
- `pending`: noch nicht angewendet oder nicht sicher verifiziert.

`verified` ist nur nach einer passenden DB- oder API-Stichprobe zulaessig. Wenn Datenmigrationen, Schema-/Migrationsdateien oder datengetriebene Fachinhalte betroffen sind, darf `not_affected` nicht genutzt werden. Ein Abschluss darf "sichtbar", "verfuegbar" oder "live" nur sagen, wenn die betroffene Auslieferung und der passende Backend-Nachweis erfolgreich geprueft wurden.

Fuer `POST /api/network-registrations` gilt bis zur fachlichen und betrieblichen Freigabe ein negatives Gate: Die #Mitmachen-Konzeptdemo darf keinen Request aufbauen; der Test weist null Intake-Aufrufe, null lokale Speicherung und eine reine Demo-Bestätigung nach. Erst ein autorisierter realer Prozess mit OIDC-/IAP-Session, Route-Policy, Idempotenz und sicherem Backendausfall darf diesen Vertrag ersetzen und den Status `verified` erhalten.

## Standard-Auth-Testmodus

Playwright-Tests nutzen den gemeinsamen Helper:

```js
import { gotoAuthenticated } from "./helpers/app-test-session.js";

await gotoAuthenticated(page, "/frontend/app/versorgungs-kompass.html#contacts", {
  role: "admin"
});
```

Der Helper stubbt `frontend/login/auth-guard.js`, setzt `VERSORGUNGS_COMPASS_CONFIG`, schreibt die lokale Testsitzung und kann optionale Seed-Skripte ersetzen. Neue Tests sollen keine eigenen Auth-Stubs, LocalStorage-Hacks oder Browser-Plugin-Workarounds duplizieren.

Diese synthetische Testsitzung ist ausschliesslich Test-Harness-Zustand. Sie belegt keinen produktiven LocalStorage-Auth- oder Datenfallback. Target-Vertragstests muessen `/api/...` beobachten beziehungsweise stubben und zusaetzlich bestaetigen, dass bei `401`, `403`, `404`, `5xx` oder Netzfehlern keine fachlichen Daten aus Demoquellen, Supabase oder Browser-Speichern erscheinen.

Fuer manuelle Sichtpruefungen ist Playwright mit diesem Helper der bevorzugte Weg. Der In-App-Browser ist nuetzlich fuer echte Nutzerpfade, aber nicht fuer lokale Auth-Mutationen.

## Effizienzmodus fuer kleine UI-Wuensche

Der Effizienzmodus ist Standard, wenn alle Punkte zutreffen:

- Der Wunsch betrifft nur eine vorhandene Stelle oder Komponente.
- Keine neue Navigation, kein neues Datenmodell, keine neue Rolle und kein neuer Backend-Pfad.
- Keine externen Daten oder aktuellen oeffentlichen Quellen sind noetig.
- Die Aenderung kann ueber bestehende Tokens, Klassen und Muster geloest werden.

Vorgehen:

1. Nur die relevanten Suchtreffer und die noetigen Leitplanken lesen.
2. Kleinen Patch setzen, keine neue Variante erfinden.
3. Stufe-1-QA laufen lassen.
4. Nur bei sichtbarem Risiko auf Stufe 2 eskalieren.
5. Am Ende klar sagen, ob die Aenderung uncommitted und ungepusht ist.

Nicht im Effizienzmodus: breite Recherchen, Roadmap-Analysen, neue Module, globale CSS-Schichten, Migrationen, Auth-/Rollenlogik und Live-Pushes.

## Projekt-Log

`CURRENT_STATE.md` ist das kurze Arbeitslog fuer Projektarbeit. Es soll nach groesseren Aenderungen aktualisiert werden, wenn sich einer dieser Punkte aendert:

- fuehrender lokaler Architekturpfad,
- empfohlene QA-Stufe oder Standardbefehle,
- Auth-/Demo-Testmodus,
- bekannte lokale Stolperstellen,
- Worktree-/Push-Regel, die fuer Folgeaufgaben wichtig ist.

Das Log ersetzt keine Fach- oder Deployment-Doku. Es ist ein schneller Startpunkt, damit neue Threads nicht jedes Mal denselben Projektzustand rekonstruieren.
