import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import {
  configuredSingleHtmlOutput,
  defaultSingleHtmlArtifactsDir,
  defaultSingleHtmlOutputPath,
  resolveCliPath
} from "./single_html_hospitation_paths.mjs";

const helpText = `Portable Einzeldatei des Hospitations-Moduls im Browser prüfen.

Verwendung:
  node scripts/test_single_html_hospitation.mjs [--input <Datei>] [--artifacts-dir <Verzeichnis>]

Optionen:
  --input <Datei>             Zu prüfende Einzeldatei.
                              Alternativ: HOSPITATION_SINGLE_OUTPUT.
                              Default: ${defaultSingleHtmlOutputPath}
  --artifacts-dir <Verz.>     Screenshots und Downloads.
                              Default: ${defaultSingleHtmlArtifactsDir}
  --output-dir <Verz.>        Rückwärtskompatibler Alias für --artifacts-dir.
  --executable-path <Datei>   Optionaler Browserpfad statt Playwright-Chromium.
  -h, --help                  Diese Hilfe anzeigen.
`;

let cliValues;
try {
  ({ values: cliValues } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: "string" },
      "artifacts-dir": { type: "string" },
      "output-dir": { type: "string" },
      "executable-path": { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    strict: true,
    allowPositionals: false
  }));
} catch (error) {
  console.error(`Argumentfehler: ${error.message}`);
  console.error("Mit --help werden die erlaubten Optionen angezeigt.");
  process.exit(2);
}

if (cliValues.help) {
  console.log(helpText);
  process.exit(0);
}
if (cliValues["artifacts-dir"] && cliValues["output-dir"]) {
  console.error("Argumentfehler: --artifacts-dir und --output-dir dürfen nicht gemeinsam verwendet werden.");
  process.exit(2);
}

const inputPath = configuredSingleHtmlOutput(cliValues.input);
const outputDir = cliValues["artifacts-dir"] || cliValues["output-dir"]
  ? resolveCliPath(cliValues["artifacts-dir"] || cliValues["output-dir"])
  : defaultSingleHtmlArtifactsDir;
const downloadsDir = resolve(outputDir, "single-html-downloads");
const executablePath = cliValues["executable-path"]
  ? resolveCliPath(cliValues["executable-path"])
  : "";

await access(inputPath);
await mkdir(downloadsDir, { recursive: true });

function embeddedDocumentFromShell(shellHtml) {
  const match = shellHtml.match(/const encodedChunks = (\[[\s\S]*?\]);\s*const binary/);
  assert.ok(match, "Die äußere Datei enthält keinen dekodierbaren srcdoc-Bootstrap.");
  const chunks = JSON.parse(match[1]);
  assert.ok(Array.isArray(chunks) && chunks.length > 0, "Der srcdoc-Bootstrap enthält keine Daten.");
  return Buffer.from(chunks.join(""), "base64").toString("utf8");
}

function assertPortableMarkup(markup, label) {
  const failures = [];
  const source = String(markup);
  const structuralMarkup = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  for (const tagMatch of structuralMarkup.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const tagName = tagMatch[1].toLowerCase();
    for (const attributeMatch of tagMatch[2].matchAll(/\b(src|href)=(["'])([^"']*)\2/gi)) {
      const attribute = attributeMatch[1].toLowerCase();
      const value = attributeMatch[3].trim();
      const embeddedResource = /^(?:data:|blob:)/i.test(value);
      const fragment = value.startsWith("#");
      const externalNavigation = /^https?:\/\//i.test(value) || /^(?:mailto:|tel:)/i.test(value);
      const inertFrame = attribute === "src" && value === "about:blank";
      const allowed = attribute === "src"
        ? embeddedResource || inertFrame
        : embeddedResource || fragment || (tagName === "a" && externalNavigation);
      if (!allowed) failures.push(`${tagName}[${attribute}="${value}"]`);
    }
  }
  for (const styleMatch of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const urlMatch of styleMatch[1].matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      const value = urlMatch[2].trim();
      if (!/^(?:data:|blob:|#)/i.test(value)) failures.push(`CSS url("${value}")`);
    }
  }
  if (/<script\b[^>]*\bsrc=/i.test(source)) failures.push("externes script[src]");
  if (/<link\b[^>]*\brel=(["'])stylesheet\1/i.test(source)) failures.push("externes Stylesheet");
  if (/(?:\/Users\/[^"'<> \n]+|(?:^|[\s"'(])[A-Za-z]:[\\/][^"'<> \n]+)/m.test(source)) {
    failures.push("absoluter Betriebssystempfad");
  }
  if (/(?:\.\.\/vendor\/|new URL\(\s*["']\.\.\/)/.test(source)) {
    failures.push("dynamischer lokaler Vendorpfad");
  }
  assert.deepEqual(
    [...new Set(failures)],
    [],
    `${label}: nicht portable Restreferenzen`
  );
}

const singleFileHtml = await readFile(inputPath, "utf8");
const embeddedHtml = embeddedDocumentFromShell(singleFileHtml);
assertPortableMarkup(singleFileHtml, "Äußere Anwendung");
assertPortableMarkup(embeddedHtml, "Eingebettete Anwendung");
assert.match(
  embeddedHtml,
  /data-single-file-vendor-bootstrap/,
  "Der eingebettete Vendor-Bootstrap fehlt."
);

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath: resolve(executablePath) } : {})
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
const relevantWarnings = [];
const failedRequests = [];
const unexpectedResourceRequests = [];
const inputUrl = pathToFileURL(inputPath).href;

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
  if (
    message.type() === "warning" &&
    /CORS|blocked|not allowed|failed to load|lokale Hospitationsdaten bleiben/i.test(message.text())
  ) {
    relevantWarnings.push(message.text());
  }
});
page.on("requestfailed", (request) => {
  failedRequests.push(`${request.url()} – ${request.failure()?.errorText || "unbekannt"}`);
});
page.on("request", (request) => {
  const url = request.url();
  if (
    url !== inputUrl &&
    !/^(?:data:|blob:|about:)/i.test(url)
  ) {
    unexpectedResourceRequests.push(url);
  }
});

function moduleFrame() {
  return page.locator("#hospitation-documentation-frame").contentFrame();
}

async function waitUntilReady() {
  const frame = moduleFrame();
  await page.locator("body.is-loaded").waitFor({ state: "attached", timeout: 30_000 });
  await frame.locator(".app-shell:not(.is-initializing)").waitFor({ state: "attached", timeout: 30_000 });
  return frame;
}

async function openArea(target, visiblePanel) {
  const link = page.locator(`[data-hospitation-switcher-link="${target}"]`);
  await link.click();
  const frame = moduleFrame();
  await frame.locator(visiblePanel).waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await link.getAttribute("aria-current"), "page", `${target}: Navigation wurde nicht als aktiv markiert.`);
  return frame;
}

async function downloadFrom(locator, targetName) {
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await locator.click();
  const download = await downloadPromise;
  const failure = await download.failure();
  assert.equal(failure, null, `${targetName}: Browser meldet einen Downloadfehler.`);
  const targetPath = resolve(downloadsDir, targetName);
  await download.saveAs(targetPath);
  return targetPath;
}

async function assertSignature(path, signature) {
  const content = await readFile(path);
  assert.ok(content.length > 500, `${path}: Datei ist unerwartet klein.`);
  assert.equal(content.subarray(0, signature.length).toString("binary"), signature, `${path}: Dateisignatur stimmt nicht.`);
}

async function assertEmbeddedDocumentExtraction(frame) {
  const results = await frame.locator("html").evaluate(async () => {
    async function extract(selector, name, type) {
      const link = document.querySelector(selector);
      if (!(link instanceof HTMLAnchorElement)) {
        return { status: "missing", textLength: 0, error: `Link fehlt: ${selector}` };
      }
      const response = await fetch(link.href);
      const file = new File([await response.arrayBuffer()], name, { type });
      const result = await window.DocumentTextExtractor.extract(file);
      return {
        status: result.status,
        textLength: String(result.text || "").length,
        containsFrameworkText: /Hospitations(?:-|s)Framework/i.test(String(result.text || "")),
        containsObservationText: /Beobachtungen/i.test(String(result.text || "")),
        error: String(result.error || "")
      };
    }

    return {
      docx: await extract(
        'a[download="Mitmachen-Hospitations-Framework.docx"]',
        "Mitmachen-Hospitations-Framework.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ),
      pdf: await extract(
        'a[download="Mitmachen-Hospitations-Framework.pdf"]',
        "Mitmachen-Hospitations-Framework.pdf",
        "application/pdf"
      )
    };
  });

  for (const [format, result] of Object.entries(results)) {
    assert.equal(
      result.status,
      "complete",
      `${format.toUpperCase()}-Volltextextraktion fehlgeschlagen: ${result.error}`
    );
    assert.ok(
      result.textLength > 100,
      `${format.toUpperCase()}-Volltextextraktion lieferte zu wenig Text: ${result.textLength}`
    );
    assert.equal(
      result.containsFrameworkText || result.containsObservationText,
      true,
      `${format.toUpperCase()}-Volltextextraktion enthält keinen erwarteten Dokumentinhalt.`
    );
  }
  return results;
}

try {
  await page.goto(inputUrl, {
    waitUntil: "load",
    timeout: 30_000
  });
  let frame = await waitUntilReady();

  assert.match(page.url(), /^file:/, "Die Testdatei wurde nicht direkt über file:// geöffnet.");
  assert.equal(await page.title(), "Hospitations-Modul", "Der Seitentitel enthält noch einen Testhinweis.");
  assert.equal(await page.locator(".single-file-test-badge").count(), 0, "Der Testversions-Hinweis ist noch vorhanden.");
  assert.doesNotMatch(
    await page.locator(".hospitation-app-header").innerText(),
    /Einzeldatei|Testversion/i,
    "Der Header enthält noch Einzeldatei oder Testversion."
  );
  await page.getByRole("heading", { name: "Willkommen im Hospitations-Modul", exact: true }).waitFor({ state: "visible" });
  assert.equal(
    await page.locator("[data-hospitation-welcome-target]").count(),
    6,
    "Auf der Startseite werden nicht alle sechs Bereiche angeboten."
  );
  assert.equal(await page.locator('img[alt="#Mitmachen"]').count(), 2, "Die beiden #Mitmachen-Logos fehlen.");
  assert.ok(
    await page.locator(".hospitation-app-brand-lockup img").evaluate((image) => image.complete && image.naturalWidth > 0),
    "Das #Mitmachen-Logo im Header wurde nicht geladen."
  );
  assert.ok(
    await page.locator(".hospitation-welcome__product img").evaluate((image) => image.complete && image.naturalWidth > 0),
    "Das #Mitmachen-Logo auf der Startseite wurde nicht geladen."
  );
  const headerBrandLockup = await page.locator(".hospitation-app-brand-lockup img").boundingBox();
  assert.ok(headerBrandLockup && headerBrandLockup.width >= 110, "Das #Mitmachen-Logo im Header ist zu klein.");
  const welcomeProductMark = await page.locator(".hospitation-welcome__product img").boundingBox();
  assert.ok(welcomeProductMark && welcomeProductMark.width >= 240, "Das #Mitmachen-Logo auf der Startseite ist zu klein.");
  assert.equal(await page.locator(".hospitation-app-brand-lockup > span").textContent(), "Hospitations-Modul");
  assert.equal(await page.locator(".hospitation-welcome__module-name").textContent(), "Hospitations-Modul");

  const initiativeFooter = page.locator(".hospitation-app-footer");
  await initiativeFooter.waitFor({ state: "visible" });
  await initiativeFooter.getByText("Ein Modul im Rahmen von #Mitmachen – einem Angebot der gematik", { exact: true }).waitFor({ state: "visible" });
  const initiativeLink = initiativeFooter.getByRole("link", { name: /gematik\.de\/mitmachen/ });
  assert.equal(await initiativeLink.getAttribute("href"), "https://www.gematik.de/mitmachen");
  assert.equal(await initiativeLink.getAttribute("target"), "_blank");
  assert.match(await initiativeLink.getAttribute("rel"), /noopener/);
  const welcomeHeadingFontSize = await page
    .getByRole("heading", { name: "Willkommen im Hospitations-Modul", exact: true })
    .evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize));
  assert.ok(welcomeHeadingFontSize >= 64, `Die Willkommen-Überschrift ist zu klein: ${welcomeHeadingFontSize}px.`);

  const initialWelcomeScroll = await page.locator(".hospitation-welcome").evaluate((welcome) => ({
    clientHeight: welcome.clientHeight,
    scrollHeight: welcome.scrollHeight,
    scrollTop: welcome.scrollTop
  }));
  assert.equal(initialWelcomeScroll.scrollTop, 0, "Die Startseite beginnt nicht am großen Willkommen.");
  assert.ok(
    initialWelcomeScroll.scrollHeight > initialWelcomeScroll.clientHeight + 100,
    "Die Startseite bietet nicht genug Luft zum Scrollen zu den Bereichen."
  );

  const initialState = await frame.locator("html").evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("hospitations-modul:single-file:v1") || "null");
    return {
      state: stored,
      rows: document.querySelectorAll("article.hospitation-row").length
    };
  });
  assert.ok(initialState.state, "Der lokale Einzeldatei-Speicher wurde nicht initialisiert.");
  assert.equal(initialState.state.hospitations.length, 0, "Die Datei enthält bereits Termine.");
  assert.equal(initialState.state.slots.length, 0, "Die Datei enthält bereits Terminangebote.");
  assert.equal(initialState.state.observations.length, 0, "Die Datei enthält bereits Beobachtungen.");
  assert.equal(initialState.rows, 0, "Die Terminliste ist nicht leer.");

  const startScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Startseite.png");
  await page.screenshot({ path: startScreenshot, fullPage: true });

  await page.locator("[data-hospitation-scroll-destinations]").click();
  await page.waitForFunction(() => {
    const welcome = document.querySelector(".hospitation-welcome");
    const destinations = document.querySelector("#hospitation-welcome-destinations");
    if (!welcome || !destinations) return false;
    const welcomeRect = welcome.getBoundingClientRect();
    const destinationsRect = destinations.getBoundingClientRect();
    return welcome.scrollTop > 100 && destinationsRect.top >= welcomeRect.top && destinationsRect.top < welcomeRect.bottom;
  });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.scrollY), 0, "Beim Scrollen der Startseite verschiebt sich die gesamte Anwendung.");
  const destinationsScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Startseite-Bereiche.png");
  await page.screenshot({ path: destinationsScreenshot });
  await page.locator(".hospitation-welcome").evaluate((welcome) => {
    welcome.scrollTop = 0;
  });

  const navigationChecks = [
    ["framework", "#view-framework:not([hidden])"],
    ["questionnaire", "#view-questionnaire:not([hidden])"],
    ["observations", "#hospitation-observations-panel:not([hidden])"],
    ["patterns", "#hospitation-patterns-panel:not([hidden])"],
    ["dashboard", "#hospitation-dashboard-panel:not([hidden])"],
    ["appointments", "#hospitation-appointments-panel:not([hidden])"]
  ];

  const frameworkScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Framework-Prozess.png");
  const frameworkAccordionScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Framework-Beobachtungen.png");
  const questionnaireScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Fragebogen.png");
  const dashboardScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Dashboard.png");

  for (const [target, visiblePanel] of navigationChecks) {
    frame = await openArea(target, visiblePanel);
    await initiativeFooter.waitFor({ state: "visible" });

    if (target === "framework") {
      await frame.getByText("Hospitationsframework", { exact: true }).waitFor({ state: "visible" });
      assert.equal(
        await frame.getByText("Hospitationen als Wissensformat", { exact: true }).count(),
        0,
        "Die alte Framework-Überschrift ist noch vorhanden."
      );
      await page.waitForTimeout(120);
      const frameworkInitialLayout = await frame.locator("html").evaluate(() => {
        const accordion = document.querySelector("#framework-accordion-observations");
        const overview = document.querySelector(".framework-overview");
        return {
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          overviewHeight: overview?.getBoundingClientRect().height || 0,
          accordionTop: accordion?.getBoundingClientRect().top || 0
        };
      });
      assert.equal(frameworkInitialLayout.scrollY, 0, "Das Framework startet nicht am Prozess.");
      assert.ok(
        frameworkInitialLayout.overviewHeight >= frameworkInitialLayout.viewportHeight - 1,
        `Die Framework-Übersicht füllt den ersten Bildschirm nicht: ${JSON.stringify(frameworkInitialLayout)}`
      );
      assert.ok(
        frameworkInitialLayout.accordionTop >= frameworkInitialLayout.viewportHeight,
        `Das Beobachtungen-Akkordeon ist im ersten Bildschirm sichtbar: ${JSON.stringify(frameworkInitialLayout)}`
      );
      await page.screenshot({ path: frameworkScreenshot });

      await frame.getByRole("button", { name: "Mehr zum Schritt Beobachtungen", exact: true }).click();
      await frame.locator("#framework-accordion-observations[open]").waitFor({ state: "visible" });
      await page.waitForTimeout(1250);
      const frameworkJumpState = await frame.locator("html").evaluate(() => {
        const accordion = document.querySelector("#framework-accordion-observations");
        return {
          open: accordion instanceof HTMLDetailsElement && accordion.open,
          top: accordion?.getBoundingClientRect().top || 0,
          scrollY: window.scrollY
        };
      });
      assert.equal(frameworkJumpState.open, true, "Das Beobachtungen-Akkordeon wurde nicht geöffnet.");
      assert.ok(frameworkJumpState.scrollY > 100, "Der Sprung zum Beobachtungen-Akkordeon wurde nicht ausgeführt.");
      assert.ok(
        frameworkJumpState.top >= 0 && frameworkJumpState.top <= 24,
        `Das geöffnete Akkordeon liegt nicht am vorgesehenen Sprungziel: ${JSON.stringify(frameworkJumpState)}`
      );
      await page.screenshot({ path: frameworkAccordionScreenshot });
    }

    if (target === "questionnaire") {
      await frame.getByText("Hospitations-Fragebogen", { exact: true }).waitFor({ state: "visible" });
      await frame.getByText("Beobachtungen Schritt für Schritt festhalten und einordnen.", { exact: true }).waitFor({ state: "visible" });
      await page.screenshot({ path: questionnaireScreenshot });
    }

    if (target === "dashboard") {
      await frame.getByText("Stadtversorgungswissen Cockpit", { exact: true }).waitFor({ state: "visible" });
      await page.screenshot({ path: dashboardScreenshot });
    }
  }

  await page.locator("[data-hospitation-home]").click();
  await page.getByRole("heading", { name: "Willkommen im Hospitations-Modul", exact: true }).waitFor({ state: "visible" });
  await page.locator('[data-hospitation-welcome-target="appointments"]').click();
  await frame.getByText("Hospitations-Termine", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  await frame.getByText("Termine planen, vorbereiten und anschließend dokumentieren.", { exact: true }).waitFor({ state: "visible" });

  const primaryActionBox = await frame.locator("#new-hospitation-request-button").boundingBox();
  const tableToolbarBox = await frame.locator("#hospitation-table-toolbar").boundingBox();
  const tableToolbarMetaBox = await frame.locator("#hospitation-table-toolbar-meta").boundingBox();
  assert.ok(primaryActionBox, "Die Primaeraktion Neuer Termin ist nicht sichtbar.");
  assert.ok(tableToolbarBox, "Die Tabellen-Werkzeugzeile ist nicht sichtbar.");
  assert.ok(tableToolbarMetaBox, "Die Terminanzahl in der Tabellen-Werkzeugzeile ist nicht sichtbar.");
  assert.ok(
    primaryActionBox.y + primaryActionBox.height <= tableToolbarBox.y,
    "Die Tabellenaktionen liegen nicht unterhalb der primaeren Such- und Aktionszeile."
  );

  const tableToolbarLocators = [
    frame.locator('[data-hospitation-export="docx"]'),
    frame.locator('[data-hospitation-export="pdf"]'),
    frame.locator("#hospitation-schedule-view-toggle")
  ];
  const tableToolbarBoxes = await Promise.all(tableToolbarLocators.map((locator) => locator.boundingBox()));
  tableToolbarBoxes.forEach((box, index) => assert.ok(box, `Tabellenaktion ${index + 1} ist nicht sichtbar.`));
  const centerLines = [tableToolbarMetaBox, ...tableToolbarBoxes].map((box) => box.y + box.height / 2);
  assert.ok(
    Math.max(...centerLines) - Math.min(...centerLines) <= 1.5,
    `Terminanzahl und Tabellenaktionen liegen nicht auf einer Höhe: ${centerLines.join(", ")}`
  );
  assert.ok(
    tableToolbarBoxes.every((box) => Math.abs(box.height - tableToolbarBoxes[0].height) <= 1),
    `Tabellenaktionen sind unterschiedlich hoch: ${tableToolbarBoxes.map((box) => box.height).join(", ")}`
  );

  assert.equal(await frame.getByText("Nur lokal", { exact: true }).count(), 0, "Der Hinweis Nur lokal ist noch vorhanden.");
  assert.equal(
    await frame.getByText("Datensicherung exportieren", { exact: true }).count(),
    0,
    "Die entfernte Datensicherung ist noch vorhanden."
  );
  assert.equal(
    await frame.locator("#local-hospitation-backup-export, .local-hospitation-backup-button").count(),
    0,
    "Ein Bedienelement der Datensicherung ist noch im Modul vorhanden."
  );

  const emptyState = frame.locator(".hospitation-first-appointment");
  await emptyState.waitFor({ state: "visible" });
  await frame.getByRole("button", { name: "Ersten Termin anlegen", exact: true }).waitFor({ state: "visible" });

  const emptyScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Termine-Leer.png");
  await page.screenshot({ path: emptyScreenshot, fullPage: true });

  await frame.getByRole("button", { name: "Ersten Termin anlegen", exact: true }).click();
  await frame.locator("#hospitation-editor-drawer.is-open").waitFor({ state: "attached" });
  assert.equal(
    await frame.locator('[data-hospitation-editor-step="contact"]').count(),
    0,
    "Der entfernte Schritt Kontakt ist noch vorhanden."
  );
  assert.equal(await frame.getByText("Follow-up-Owner", { exact: true }).count(), 0, "Follow-up-Owner ist noch vorhanden.");
  assert.equal(await frame.getByText("Follow-up-Fälligkeit", { exact: true }).count(), 0, "Follow-up-Fälligkeit ist noch vorhanden.");
  assert.equal(
    await frame.locator("#hospitation-editor-steps .import-step").count(),
    4,
    "Der Termin-Dialog hat nicht genau vier Schritte."
  );
  assert.equal(
    await frame.locator("#hospitation-owner").evaluate((element) => element.tagName),
    "INPUT",
    "Owner ist kein Freitextfeld."
  );

  await frame.locator("#hospitation-contact-name").fill("HTML Einzeltest");
  await frame.locator("#hospitation-owner").fill("Team Hospitation Berlin");

  const editorScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Neuer-Termin.png");
  await page.screenshot({ path: editorScreenshot, fullPage: true });

  for (const expectedHeading of ["Termin", "Themen und Notiz", "Follow-up"]) {
    await frame.locator("#hospitation-editor-next").click();
    await frame.getByRole("heading", { name: expectedHeading, exact: true }).waitFor({ state: "visible" });
  }
  await frame.locator("#hospitation-editor-save").click();
  await frame.getByText("HTML Einzeltest", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
  await frame.locator(".hospitation-table-head").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await frame.locator(".hospitation-first-appointment").count(), 0, "Der Leerzustand bleibt nach dem Speichern sichtbar.");
  const tableHeaderText = await frame.locator(".hospitation-table-head").innerText();
  for (const heading of ["Termin", "Status", "Kontakt", "Organisation", "Beobachtungen", "Sektor", "Owner", "Dokumentation"]) {
    assert.ok(
      tableHeaderText.toLocaleLowerCase("de-DE").includes(heading.toLocaleLowerCase("de-DE")),
      `Die Tabellenspalte ${heading} fehlt.`
    );
  }
  assert.equal(
    await frame.locator("[data-hospitation-header-filter-button]").count(),
    5,
    "Die fünf vorgesehenen Spaltenfilter sind nicht vorhanden."
  );
  const tableLayout = await frame.locator(".hospitation-table").evaluate((table) => {
    const head = table.querySelector(".hospitation-table-head");
    const row = table.querySelector(".hospitation-row");
    const tableRect = table.getBoundingClientRect();
    const headRect = head?.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();
    return {
      headDisplay: head ? getComputedStyle(head).display : "",
      tableWidth: tableRect.width,
      headWidth: headRect?.width || 0,
      rowWidth: rowRect?.width || 0
    };
  });
  assert.equal(tableLayout.headDisplay, "grid", "Die Tabellenüberschrift ist nicht als Tabelle sichtbar.");
  assert.ok(
    Math.abs(tableLayout.tableWidth - tableLayout.headWidth) <= 2.5 &&
      Math.abs(tableLayout.tableWidth - tableLayout.rowWidth) <= 2.5,
    `Tabellenkopf und Terminzeile nutzen nicht die volle Breite: ${JSON.stringify(tableLayout)}`
  );

  const dateSort = frame.locator("[data-hospitation-date-sort]");
  assert.equal(await dateSort.getAttribute("aria-sort"), "descending", "Die Standardsortierung nach Termin fehlt.");
  await dateSort.click();
  await frame.locator('[data-hospitation-date-sort][aria-sort="ascending"]').waitFor({ state: "visible" });
  const statusFilter = frame.getByRole("button", { name: "Status in Spalte filtern", exact: true });
  await statusFilter.click();
  await frame.locator('[data-hospitation-header-filter-menu][data-hospitation-filter-key="status"]').waitFor({ state: "visible" });
  await statusFilter.click();
  assert.equal(
    await frame.locator("article.hospitation-row .hospitation-row__owner .owner-avatar-stack").getAttribute("title"),
    "Team Hospitation Berlin",
    "Der freie Owner wird in der Terminzeile nicht angezeigt."
  );

  const savedState = await frame.locator("html").evaluate(() => {
    return JSON.parse(localStorage.getItem("hospitations-modul:single-file:v1") || "null");
  });
  assert.equal(savedState.hospitations.length, 1, "Der Termin wurde nicht im Browser gespeichert.");
  assert.equal(savedState.hospitations[0].contactName, "HTML Einzeltest", "Der gespeicherte Termin ist unvollständig.");
  assert.equal(savedState.hospitations[0].owner, "Team Hospitation Berlin", "Der freie Owner wurde nicht gespeichert.");

  const savedScreenshot = resolve(outputDir, "Hospitations-Modul-Einzeldatei-Termin-Tabelle.png");
  await page.screenshot({ path: savedScreenshot, fullPage: true });

  await page.reload({ waitUntil: "load", timeout: 30_000 });
  frame = await waitUntilReady();
  await openArea("appointments", "#hospitation-appointments-panel:not([hidden])");
  await frame.getByText("HTML Einzeltest", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });

  const persistedState = await frame.locator("html").evaluate(() => {
    return JSON.parse(localStorage.getItem("hospitations-modul:single-file:v1") || "null");
  });
  assert.equal(persistedState.hospitations.length, 1, "Der Termin ist nach dem Neuladen verschwunden.");
  assert.equal(persistedState.hospitations[0].owner, "Team Hospitation Berlin", "Der freie Owner ist nach dem Neuladen verschwunden.");

  const dynamicDocx = await downloadFrom(
    frame.locator('[data-hospitation-export="docx"]'),
    "Hospitations-Termine-Einzeldatei-Test.docx"
  );
  const dynamicPdf = await downloadFrom(
    frame.locator('[data-hospitation-export="pdf"]'),
    "Hospitations-Termine-Einzeldatei-Test.pdf"
  );

  await openArea("questionnaire", "#view-questionnaire:not([hidden])");
  await frame.getByText("Hospitations-Fragebogen", { exact: true }).waitFor({ state: "visible" });
  const documentExtraction = await assertEmbeddedDocumentExtraction(frame);

  const templateDocx = await downloadFrom(
    frame.locator('a[download="Mitmachen-Hospitations-Framework.docx"]'),
    "Mitmachen-Hospitations-Framework.docx"
  );
  const templatePdf = await downloadFrom(
    frame.locator('a[download="Mitmachen-Hospitations-Framework.pdf"]'),
    "Mitmachen-Hospitations-Framework.pdf"
  );

  await assertSignature(dynamicDocx, "PK");
  await assertSignature(dynamicPdf, "%PDF-");
  await assertSignature(templateDocx, "PK");
  await assertSignature(templatePdf, "%PDF-");

  assert.equal(pageErrors.length, 0, `Seitenfehler: ${pageErrors.join(" | ")}`);
  assert.equal(consoleErrors.length, 0, `Konsolenfehler: ${consoleErrors.join(" | ")}`);
  assert.equal(relevantWarnings.length, 0, `Kritische Warnungen: ${relevantWarnings.join(" | ")}`);
  assert.equal(failedRequests.length, 0, `Fehlgeschlagene Ladevorgänge: ${failedRequests.join(" | ")}`);
  assert.equal(
    unexpectedResourceRequests.length,
    0,
    `Unerwartete externe oder lokale Ladevorgänge: ${unexpectedResourceRequests.join(" | ")}`
  );

  console.log(JSON.stringify({
    input: inputPath,
    initialState: "leer",
    persistenceAfterReload: "OK",
    freeTextOwner: "OK",
    backupControls: "entfernt",
    emptyState: "OK",
    mitmachenBranding: "OK",
    initiativeFooter: "OK",
    frameworkFocusAndJump: "OK",
    documentExtraction,
    tableLayout,
    toolbarAlignment: "OK",
    navigation: navigationChecks.map(([target]) => target),
    downloads: [dynamicDocx, dynamicPdf, templateDocx, templatePdf],
    screenshots: [
      startScreenshot,
      destinationsScreenshot,
      frameworkScreenshot,
      frameworkAccordionScreenshot,
      questionnaireScreenshot,
      dashboardScreenshot,
      emptyScreenshot,
      editorScreenshot,
      savedScreenshot
    ],
    errors: {
      page: pageErrors.length,
      console: consoleErrors.length,
      requests: failedRequests.length,
      unexpectedResources: unexpectedResourceRequests.length
    }
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
