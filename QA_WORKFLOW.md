# QA Workflow

Stand: 2026-06-14.

Dieses Dokument legt fest, wie Codex und andere Agenten Aenderungen am Versorgungs-Kompass pruefen, ohne fuer kleine Aufgaben unnoetig viel Kontext und Testlaufzeit zu verbrauchen.

## QA-Stufen

### Stufe 1: Kleine Aenderung

Fuer reine Texte, Labels, kleine CSS-Korrekturen ohne neue Komponente, kleine Test- oder Doku-Aenderungen.

Pflicht:

```bash
npm run qa:small
```

Optional: ein gezielter DOM- oder Browser-Check, wenn die Aenderung sichtbar ist und die Wirkung nicht direkt aus dem Code hervorgeht.

Nicht automatisch: kompletter visueller Smoke, `docs/`-Sync, Commit oder Push.

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

Bei sichtbaren UI-Aenderungen zusaetzlich die relevanten Punkte aus `VISUAL_QA_CHECKLIST.md` abgleichen. Bei GitHub-Pages-Auftraegen vorher `bash scripts/sync_github_pages.sh` ausfuehren und `docs/` mitpruefen.

## Standard-Auth-Testmodus

Playwright-Tests nutzen den gemeinsamen Helper:

```js
import { gotoAuthenticated } from "./helpers/app-test-session.js";

await gotoAuthenticated(page, "/app/versorgungs-kompass.html#contacts", {
  role: "admin",
  dataMode: "demo"
});
```

Der Helper stubbt `login/auth-guard.js`, setzt `VERSORGUNGS_COMPASS_CONFIG`, schreibt die lokale Testsitzung und kann optionale Seed-Skripte ersetzen. Neue Tests sollen keine eigenen Auth-Stubs, LocalStorage-Hacks oder Browser-Plugin-Workarounds duplizieren.

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

`CURRENT_STATE.md` ist das kurze Arbeitslog fuer Agenten. Es soll nach groesseren Aenderungen aktualisiert werden, wenn sich einer dieser Punkte aendert:

- fuehrender lokaler Architekturpfad,
- empfohlene QA-Stufe oder Standardbefehle,
- Auth-/Demo-Testmodus,
- bekannte lokale Stolperstellen,
- Worktree-/Push-Regel, die fuer Folgeaufgaben wichtig ist.

Das Log ersetzt keine Fach- oder Deployment-Doku. Es ist ein schneller Startpunkt, damit neue Threads nicht jedes Mal denselben Projektzustand rekonstruieren.
