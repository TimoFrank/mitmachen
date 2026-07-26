import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  configuredSingleHtmlOutput,
  configuredSingleHtmlSource,
  defaultSingleHtmlOutputPath
} from "./single_html_hospitation_paths.mjs";

const helpText = `Portable Einzeldatei des Hospitations-Moduls erstellen.

Verwendung:
  node scripts/build_single_html_hospitation.mjs --source <Verzeichnis> [--output <Datei>]

Optionen:
  --source <Verzeichnis>  Root des vorbereiteten Hospitations-Moduls.
                         Alternativ: HOSPITATION_SINGLE_SOURCE.
  --output <Datei>       Ziel der Einzeldatei.
                         Alternativ: HOSPITATION_SINGLE_OUTPUT.
                         Default: ${defaultSingleHtmlOutputPath}
  -h, --help             Diese Hilfe anzeigen.
`;

let cliValues;
try {
  ({ values: cliValues } = parseArgs({
    args: process.argv.slice(2),
    options: {
      source: { type: "string" },
      output: { type: "string" },
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

let sourceDir;
try {
  sourceDir = await realpath(configuredSingleHtmlSource(cliValues.source));
  if (!(await stat(sourceDir)).isDirectory()) {
    throw new Error(`Quellpfad ist kein Verzeichnis: ${sourceDir}`);
  }
} catch (error) {
  console.error(`Quellverzeichnis ungültig: ${error.message}`);
  process.exit(1);
}

const outputPath = configuredSingleHtmlOutput(cliValues.output);
const shellPath = resolve(sourceDir, "index.html");
const appPath = resolve(sourceDir, "app/versorgungs-kompass.html");
const mammothPath = resolve(sourceDir, "vendor/mammoth/mammoth.browser.min.js");
const pdfModulePath = resolve(sourceDir, "vendor/pdfjs/pdf.min.mjs");
const pdfWorkerPath = resolve(sourceDir, "vendor/pdfjs/pdf.worker.min.mjs");
const xlsxPath = resolve(sourceDir, "vendor/xlsx/xlsx.bundle.js");

await Promise.all([
  access(shellPath),
  access(appPath),
  access(mammothPath),
  access(pdfModulePath),
  access(pdfWorkerPath),
  access(xlsxPath)
]);

if ([shellPath, appPath].includes(outputPath)) {
  throw new Error(`Das Ausgabeziel darf keine Quelldatei überschreiben: ${outputPath}`);
}

const mimeTypes = new Map([
  [".css", "text/css;charset=utf-8"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript;charset=utf-8"],
  [".json", "application/json;charset=utf-8"],
  [".mjs", "text/javascript;charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function isExternalReference(value) {
  return /^(?:[a-z]+:|\/\/|#|about:)/i.test(String(value || "").trim());
}

function localPathForReference(reference, documentPath) {
  const cleanReference = String(reference || "").split(/[?#]/, 1)[0];
  if (!cleanReference || isExternalReference(cleanReference)) return "";
  let decodedReference;
  try {
    decodedReference = decodeURIComponent(cleanReference);
  } catch {
    return "";
  }
  const candidate = decodedReference.startsWith("/")
    ? resolve(sourceDir, `.${decodedReference}`)
    : resolve(dirname(documentPath), decodedReference);
  const pathWithinSource = relative(sourceDir, candidate);
  if (
    pathWithinSource === ".." ||
    pathWithinSource.startsWith(`..${sep}`) ||
    isAbsolute(pathWithinSource)
  ) {
    return "";
  }
  return candidate;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function dataUri(path) {
  const extension = extname(path).toLowerCase();
  const mimeType = mimeTypes.get(extension);
  if (!mimeType) return "";
  const content = await readFile(path);
  return `data:${mimeType};base64,${content.toString("base64")}`;
}

function base64Chunks(content) {
  return Buffer.from(content).toString("base64").match(/.{1,120}/g) || [];
}

async function singleFileVendorBootstrap() {
  const [mammoth, pdfModule, pdfWorker, xlsx] = await Promise.all([
    readFile(mammothPath),
    readFile(pdfModulePath),
    readFile(pdfWorkerPath),
    readFile(xlsxPath)
  ]);
  const encodedVendors = {
    mammoth: base64Chunks(mammoth),
    pdfModule: base64Chunks(pdfModule),
    pdfWorker: base64Chunks(pdfWorker),
    xlsx: base64Chunks(xlsx)
  };
  return `<script data-single-file-vendor-bootstrap>
      (function () {
        "use strict";
        const encodedVendors = ${JSON.stringify(encodedVendors)};

        function blobUrl(chunks) {
          const binary = window.atob(chunks.join(""));
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          return URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
        }

        const vendorUrls = Object.freeze({
          mammoth: blobUrl(encodedVendors.mammoth),
          pdfModule: blobUrl(encodedVendors.pdfModule),
          pdfWorker: blobUrl(encodedVendors.pdfWorker),
          xlsx: blobUrl(encodedVendors.xlsx)
        });
        window.__HOSPITATION_SINGLE_FILE_VENDOR_URLS__ = vendorUrls;
        window.addEventListener("pagehide", function () {
          Object.values(vendorUrls).forEach(function (url) { URL.revokeObjectURL(url); });
        }, { once: true });
      })();
    </script>`;
}

function escapeInlineScript(source) {
  return String(source).replace(/<\/script/gi, "<\\/script");
}

function escapeInlineStyle(source) {
  return String(source).replace(/<\/style/gi, "<\\/style");
}

function replaceExactly(source, search, replacement, expectedCount, label) {
  const occurrences = String(source).split(search).length - 1;
  if (occurrences !== expectedCount) {
    throw new Error(
      `${label}: ${expectedCount} Vorkommen erwartet, ${occurrences} gefunden.`
    );
  }
  return String(source).split(search).join(replacement);
}

async function replaceAsync(source, expression, replacement) {
  const matches = [...source.matchAll(expression)];
  if (!matches.length) return source;
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    result += source.slice(cursor, match.index);
    result += await replacement(match);
    cursor = match.index + match[0].length;
  }
  return result + source.slice(cursor);
}

async function inlineCss(css, cssPath) {
  return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (match) => {
    const reference = match[2].trim();
    if (!reference || isExternalReference(reference) || reference.startsWith("data:")) return match[0];
    const assetPath = localPathForReference(reference, cssPath);
    if (!assetPath || !(await isFile(assetPath))) return match[0];
    const embedded = await dataUri(assetPath);
    return embedded ? `url("${embedded}")` : match[0];
  });
}

function transformEmbeddedScript(source, scriptPath) {
  const relativePath = relative(sourceDir, scriptPath).replaceAll("\\", "/");
  let transformed = source;

  if (relativePath === "local/storage-adapter.js") {
    transformed = replaceExactly(
      transformed,
      'if (new URLSearchParams(window.location.search).get("localHospitation") !== "1") return;',
      'if (!window.__HOSPITATION_SINGLE_FILE__ && new URLSearchParams(window.location.search).get("localHospitation") !== "1") return;',
      1,
      "Single-File-Storage-Guard"
    );
    transformed = replaceExactly(
      transformed,
      'const STORAGE_KEY = "hospitations-modul:standalone:v1";',
      'const STORAGE_KEY = "hospitations-modul:single-file:v1";',
      1,
      "Single-File-Storage-Key"
    );
  }

  if (relativePath === "app/versorgungs-kompass.js") {
    transformed = replaceExactly(
      transformed,
      'const XLSX_SCRIPT_SRC = "../vendor/xlsx/xlsx.bundle.js";',
      'const XLSX_SCRIPT_SRC = window.__HOSPITATION_SINGLE_FILE_VENDOR_URLS__?.xlsx || "";',
      1,
      "XLSX-Blob-URL"
    );
    transformed = replaceExactly(
      transformed,
      'const standaloneModule = new URLSearchParams(window.location.search).get("standalone") || "";',
      'const standaloneModule = window.__HOSPITATION_SINGLE_FILE__ ? "hospitation-documentation" : (new URLSearchParams(window.location.search).get("standalone") || "");',
      1,
      "Single-File-Standalone-Modul"
    );
    transformed = replaceExactly(
      transformed,
      "          window.location.origin\n        );",
      '          window.__HOSPITATION_SINGLE_FILE__ ? "*" : window.location.origin\n        );',
      2,
      "Single-File-postMessage-Origin"
    );
  }

  if (relativePath === "data/document-text-extractor.js") {
    transformed = replaceExactly(
      transformed,
      'script.src = new URL("../vendor/mammoth/mammoth.browser.min.js", SCRIPT_URL).href;',
      'script.src = window.__HOSPITATION_SINGLE_FILE_VENDOR_URLS__?.mammoth || "";',
      1,
      "Mammoth-Blob-URL"
    );
    transformed = replaceExactly(
      transformed,
      'pdfJsPromise = import(new URL("../vendor/pdfjs/pdf.min.mjs", SCRIPT_URL).href).then((pdfjs) => {',
      'pdfJsPromise = import(window.__HOSPITATION_SINGLE_FILE_VENDOR_URLS__?.pdfModule || "").then((pdfjs) => {',
      1,
      "PDF.js-Modul-Blob-URL"
    );
    transformed = replaceExactly(
      transformed,
      'pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", SCRIPT_URL).href;',
      'pdfjs.GlobalWorkerOptions.workerSrc = window.__HOSPITATION_SINGLE_FILE_VENDOR_URLS__?.pdfWorker || "";',
      1,
      "PDF.js-Worker-Blob-URL"
    );
    transformed = replaceExactly(
      transformed,
      "await documentHandle.destroy?.();",
      "await loadingTask.destroy?.();",
      1,
      "PDF.js-Lifecycle"
    );
  }

  return transformed;
}

async function inlineDocumentAssets(html, documentPath, { embeddedApp = false } = {}) {
  let result = html
    .replace(/^\s*<base\b[^>]*>\s*$/gim, "")
    .replace(/^\s*<link\b[^>]*rel=(["'])manifest\1[^>]*>\s*$/gim, "");

  result = await replaceAsync(
    result,
    /\b(src|href)=(["'])([^"']+)\2/gi,
    async (match) => {
      const attribute = match[1];
      const quote = match[2];
      const reference = match[3];
      const assetPath = localPathForReference(reference, documentPath);
      if (!assetPath || !(await isFile(assetPath))) return match[0];
      const extension = extname(assetPath).toLowerCase();
      if (![".docx", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".svg", ".webp"].includes(extension)) {
        return match[0];
      }
      const embedded = await dataUri(assetPath);
      return embedded ? `${attribute}=${quote}${embedded}${quote}` : match[0];
    }
  );

  result = await replaceAsync(
    result,
    /<link\b([^>]*?)rel=(["'])stylesheet\2([^>]*?)href=(["'])([^"']+)\4([^>]*)\/?>/gi,
    async (match) => {
      const cssPath = localPathForReference(match[5], documentPath);
      if (!cssPath || !(await isFile(cssPath))) return match[0];
      const css = await inlineCss(await readFile(cssPath, "utf8"), cssPath);
      const label = relative(sourceDir, cssPath).replaceAll("\\", "/");
      return `<style data-inline-source="${label}">\n${escapeInlineStyle(css)}\n</style>`;
    }
  );

  result = await replaceAsync(
    result,
    /<script\b([^>]*?)src=(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    async (match) => {
      const scriptPath = localPathForReference(match[3], documentPath);
      if (!scriptPath || !(await isFile(scriptPath))) return match[0];
      const source = transformEmbeddedScript(await readFile(scriptPath, "utf8"), scriptPath);
      const label = relative(sourceDir, scriptPath).replaceAll("\\", "/");
      return `<script data-inline-source="${label}">\n${escapeInlineScript(source)}\n</script>`;
    }
  );

  if (embeddedApp) {
    const vendorBootstrap = await singleFileVendorBootstrap();
    result = replaceExactly(
      result,
      "<head>",
      `<head>
    <script>
      window.__HOSPITATION_SINGLE_FILE__ = true;
    </script>
    ${vendorBootstrap}`,
      1,
      "Single-File-Head-Bootstrap"
    );
  }

  return result;
}

function assertPortableMarkup(markup, label) {
  const failures = [];
  const structuralMarkup = String(markup)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const tagExpression = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const tagMatch of structuralMarkup.matchAll(tagExpression)) {
    const tagName = tagMatch[1].toLowerCase();
    const attributes = tagMatch[2];
    for (const attributeMatch of attributes.matchAll(/\b(src|href)=(["'])([^"']*)\2/gi)) {
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

  for (const styleMatch of String(markup).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const urlMatch of styleMatch[1].matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      const value = urlMatch[2].trim();
      if (!/^(?:data:|blob:|#)/i.test(value)) failures.push(`CSS url("${value}")`);
    }
  }

  if (/(?:\/Users\/[^"'<> \n]+|(?:^|[\s"'(])[A-Za-z]:[\\/][^"'<> \n]+)/m.test(markup)) {
    failures.push("absoluter Betriebssystempfad");
  }
  if (/(?:\.\.\/vendor\/|new URL\(\s*["']\.\.\/)/.test(markup)) {
    failures.push("dynamischer lokaler Vendorpfad");
  }
  if (failures.length) {
    throw new Error(
      `${label}: nicht portable Restreferenzen: ${[...new Set(failures)].join(", ")}`
    );
  }
}

let embeddedHtml = await inlineDocumentAssets(await readFile(appPath, "utf8"), appPath, {
  embeddedApp: true
});

embeddedHtml = replaceExactly(
  embeddedHtml,
  "<title>Hospitations-Modul · lokal</title>",
  "<title>Hospitations-Modul</title>",
  1,
  "Titel der eingebetteten Anwendung"
);
embeddedHtml = replaceExactly(
  embeddedHtml,
  'class="action-button questionnaire-download-link"',
  'class="action-button questionnaire-download-link" data-single-file-template-download',
  2,
  "Eingebettete Vorlagen-Downloads"
);
embeddedHtml = replaceExactly(
  embeddedHtml,
  'href="../pages/mitmachen/versorgungs-netzwerk.html"',
  'href="#" aria-disabled="true" onclick="return false"',
  1,
  "Externer Konzeptdemo-Einstieg"
);

const templateDownloadScript = `<script data-single-file-template-downloads>
    (function () {
      "use strict";

      function blobFromDataUri(value) {
        const separator = value.indexOf(",");
        if (separator < 0) throw new Error("Die eingebettete Datei ist ungültig.");
        const metadata = value.slice(5, separator);
        const payload = value.slice(separator + 1);
        const mimeType = metadata.split(";")[0] || "application/octet-stream";
        const binary = metadata.includes(";base64") ? window.atob(payload) : decodeURIComponent(payload);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: mimeType });
      }

      document.addEventListener("click", function (event) {
        const sourceLink = event.target.closest("[data-single-file-template-download]");
        if (!sourceLink) return;
        event.preventDefault();
        const blob = blobFromDataUri(sourceLink.href);
        const objectUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = sourceLink.download || "Hospitations-Vorlage";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      });
    })();
  </script>`;

embeddedHtml = replaceExactly(
  embeddedHtml,
  "</body>",
  `    ${templateDownloadScript}\n  </body>`,
  1,
  "Download-Bootstrap"
);

assertPortableMarkup(embeddedHtml, "Eingebettete Anwendung");

const embeddedChunks = base64Chunks(Buffer.from(embeddedHtml, "utf8"));

let shellHtml = await inlineDocumentAssets(await readFile(shellPath, "utf8"), shellPath);
shellHtml = replaceExactly(
  shellHtml,
  "<title>Hospitations-Modul · lokal</title>",
  "<title>Hospitations-Modul</title>",
  1,
  "Titel der äußeren Anwendung"
);
shellHtml = replaceExactly(
  shellHtml,
  'src="./app/versorgungs-kompass.html?standalone=hospitation-documentation&amp;localHospitation=1#hospitations"',
  'src="about:blank"',
  1,
  "Eingebetteter Frame"
);

for (const hash of [
  "#framework",
  "#hospitations",
  "#questionnaire",
  "#hospitations:observations",
  "#hospitations:patterns",
  "#hospitations:dashboard"
]) {
  shellHtml = replaceExactly(
    shellHtml,
    `href="./app/versorgungs-kompass.html?standalone=hospitation-documentation&amp;localHospitation=1${hash}"`,
    `href="${hash}"`,
    1,
    `Navigation ${hash}`
  );
}

const bootstrap = `<script data-single-file-bootstrap>
      (function () {
        "use strict";
        const encodedChunks = ${JSON.stringify(embeddedChunks)};
        const binary = window.atob(encodedChunks.join(""));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const frame = document.getElementById("hospitation-documentation-frame");
        frame.srcdoc = new TextDecoder("utf-8").decode(bytes);
      })();
    </script>`;

shellHtml = replaceExactly(
  shellHtml,
  "</body>",
  `    ${bootstrap}\n  </body>`,
  1,
  "Frame-Bootstrap"
);

const buildStamp = new Date().toISOString();
shellHtml = replaceExactly(
  shellHtml,
  '<html lang="de">',
  `<html lang="de" data-single-file-build="${buildStamp}">`,
  1,
  "Build-Metadaten"
);
const bodyMatches = [...shellHtml.matchAll(/<body([^>]*)>/g)];
if (bodyMatches.length !== 1) {
  throw new Error(`Build-Hinweis: genau ein body-Element erwartet, ${bodyMatches.length} gefunden.`);
}
shellHtml = shellHtml.replace(
  /<body([^>]*)>/,
  (_match, attributes) => `<body${attributes}>
    <!--
      Eigenständige Einzeldatei des Hospitations-Moduls.
      Enthält keine Fachdaten. Eingaben verbleiben im Speicher des verwendeten Browsers.
      Erstellt: ${buildStamp}
    -->`
);

assertPortableMarkup(shellHtml, "Äußere Anwendung");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, shellHtml, { mode: 0o644 });

const outputSize = (await stat(outputPath)).size;
console.log(`Einzeldatei erstellt: ${outputPath}`);
console.log(`Groesse: ${(outputSize / 1024 / 1024).toFixed(2)} MB`);
