import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputRoot = resolve(projectRoot, "public/brand/modules");
const commonNavy = "#10236E";
const white = "#FFFFFF";
const expectedFileNames = [
  "mark.svg",
  "mark-on-dark.svg",
  "wordmark.svg",
  "wordmark-on-dark.svg",
  "lockup-horizontal.svg",
  "lockup-horizontal-on-dark.svg"
];

const modules = [
  {
    slug: "stakeholder",
    name: "Stakeholder-Kompass",
    accent: "#43B391",
    strong: "#0F766E",
    soft: "#E8F7F4",
    centers: [[32, 15], [16, 43], [48, 43]],
    connection: "M32 15 L16 43 L48 43 Z",
    motif: "drei abgerundete Rauten als verbundenes Dreieck"
  },
  {
    slug: "hospitation",
    name: "Hospitations-Kompass",
    accent: "#E0A44D",
    strong: "#A84C16",
    soft: "#FFF3E8",
    centers: [[16, 48], [32, 32], [48, 16]],
    connection: "M16 48 L32 32 L48 16",
    motif: "drei abgerundete Rauten entlang eines aufsteigenden Pfads"
  },
  {
    slug: "formate",
    name: "Format-Kompass",
    accent: "#A980DA",
    strong: "#7A3E91",
    soft: "#F4ECFA",
    centers: [[32, 13], [51, 32], [32, 51], [13, 32]],
    connection: "",
    motif: "vier abgerundete Rauten als kompaktes Rautenkreuz"
  }
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgDocument({ width, height, titleId, descriptionId, title, description, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descriptionId}">
  <title id="${titleId}">${escapeXml(title)}</title>
  <desc id="${descriptionId}">${escapeXml(description)}</desc>
${body}
</svg>
`;
}

function markFills(module, onDark) {
  if (module.centers.length === 4) {
    return onDark
      ? [module.accent, module.soft, white, module.soft]
      : [module.accent, module.strong, commonNavy, module.strong];
  }
  return onDark
    ? [module.accent, module.soft, white]
    : [module.accent, module.strong, commonNavy];
}

function markShapes(module, { onDark = false, indent = "  " } = {}) {
  const lines = [];
  if (module.connection) {
    const connectionColor = onDark ? module.soft : module.strong;
    const connectionWidth = onDark ? 5 : 4;
    lines.push(
      `${indent}<path d="${module.connection}" fill="none" stroke="${connectionColor}" stroke-width="${connectionWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }

  const fills = markFills(module, onDark);
  module.centers.forEach(([centerX, centerY], index) => {
    lines.push(
      `${indent}<rect x="${centerX - 9}" y="${centerY - 9}" width="18" height="18" rx="6" transform="rotate(45 ${centerX} ${centerY})" fill="${fills[index]}"/>`
    );
  });
  return lines.join("\n");
}

function renderMark(module, onDark) {
  const suffix = onDark ? "mark-on-dark" : "mark";
  const title = onDark
    ? `${module.name} Bildmarke für dunkle Flächen`
    : `${module.name} Bildmarke`;
  const palette = onDark
    ? "in Akzentfarbe, Markenhell und Weiß"
    : "in Akzentfarbe, Markendunkel und gemeinsamem Dunkelblau";
  const connection = module.connection
    ? `; die Verbindung erscheint ${onDark ? "in Markenhell" : "in Markendunkel"}`
    : "";
  return svgDocument({
    width: 64,
    height: 64,
    titleId: `${module.slug}-${suffix}-title`,
    descriptionId: `${module.slug}-${suffix}-description`,
    title,
    description: `${module.name} wird durch ${module.motif} ${palette} dargestellt${connection}.`,
    body: markShapes(module, { onDark })
  });
}

function wordmarkText(
  module,
  onDark,
  { x = 10, y = 66, fontSize = 54, letterSpacing = "-1.6", indent = "  " } = {}
) {
  const fill = onDark ? white : module.strong;
  return `${indent}<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="${letterSpacing}">${escapeXml(module.name)}</text>`;
}

function renderWordmark(module, onDark) {
  const suffix = onDark ? "wordmark-on-dark" : "wordmark";
  const title = onDark
    ? `${module.name} Wortmarke für dunkle Flächen`
    : `${module.name} Wortmarke`;
  const color = onDark ? "in Weiß" : `in der dunklen Markenfarbe ${module.strong}`;
  return svgDocument({
    width: 760,
    height: 96,
    titleId: `${module.slug}-${suffix}-title`,
    descriptionId: `${module.slug}-${suffix}-description`,
    title,
    description: `Einzeilige Wortmarke ${module.name} ${color}.`,
    body: wordmarkText(module, onDark)
  });
}

function renderLockup(module, onDark) {
  const suffix = onDark ? "lockup-horizontal-on-dark" : "lockup-horizontal";
  const title = onDark
    ? `${module.name} Logo für dunkle Flächen`
    : `${module.name} Logo`;
  const wordmarkColor = onDark ? "weißer" : "markendunkler";
  const markBody = markShapes(module, { onDark, indent: "    " });
  const wordmarkBody = wordmarkText(module, onDark, {
    x: 112,
    y: 73,
    fontSize: 52,
    letterSpacing: "-1.5"
  });
  return svgDocument({
    width: 920,
    height: 112,
    titleId: `${module.slug}-${suffix}-title`,
    descriptionId: `${module.slug}-${suffix}-description`,
    title,
    description: `Horizontales Logo für ${module.name} aus einer Bildmarke (${module.motif}) und ${wordmarkColor} einzeiliger Wortmarke.`,
    body: `  <g transform="translate(16 24)">
${markBody}
  </g>
${wordmarkBody}`
  });
}

function generatedAssets() {
  const assets = new Map();
  for (const module of modules) {
    const directory = resolve(outputRoot, module.slug);
    assets.set(resolve(directory, "mark.svg"), renderMark(module, false));
    assets.set(resolve(directory, "mark-on-dark.svg"), renderMark(module, true));
    assets.set(resolve(directory, "wordmark.svg"), renderWordmark(module, false));
    assets.set(resolve(directory, "wordmark-on-dark.svg"), renderWordmark(module, true));
    assets.set(resolve(directory, "lockup-horizontal.svg"), renderLockup(module, false));
    assets.set(resolve(directory, "lockup-horizontal-on-dark.svg"), renderLockup(module, true));
  }
  return assets;
}

async function checkAssets(assets) {
  const problems = [];
  for (const [path, expected] of assets) {
    try {
      const actual = await readFile(path, "utf8");
      if (actual !== expected) problems.push(`Abweichender Inhalt: ${path}`);
    } catch (error) {
      if (error?.code === "ENOENT") problems.push(`Fehlendes Asset: ${path}`);
      else throw error;
    }
  }

  for (const module of modules) {
    const directory = resolve(outputRoot, module.slug);
    try {
      const actualFileNames = (await readdir(directory))
        .filter((fileName) => fileName.endsWith(".svg"))
        .sort();
      const unexpected = actualFileNames.filter((fileName) => !expectedFileNames.includes(fileName));
      for (const fileName of unexpected) {
        problems.push(`Unerwartetes SVG-Asset: ${resolve(directory, fileName)}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  try {
    const expectedModuleSlugs = new Set(modules.map((module) => module.slug));
    const moduleEntries = await readdir(outputRoot, { withFileTypes: true });
    let actualSvgCount = 0;
    for (const entry of moduleEntries) {
      if (!entry.isDirectory()) continue;
      const directory = resolve(outputRoot, entry.name);
      const svgFileNames = (await readdir(directory)).filter((fileName) => fileName.endsWith(".svg"));
      actualSvgCount += svgFileNames.length;
      if (!expectedModuleSlugs.has(entry.name)) {
        for (const fileName of svgFileNames) {
          problems.push(`Unerwartetes Modul-Asset: ${resolve(directory, fileName)}`);
        }
      }
    }
    if (actualSvgCount !== assets.size) {
      problems.push(`Falsche SVG-Anzahl: ${actualSvgCount} vorhanden, ${assets.size} erwartet.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`Modulmarken-Kit geprüft: ${assets.size} SVG-Dateien sind aktuell.`);
}

async function writeAssets(assets) {
  for (const [path, source] of assets) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source, "utf8");
  }
  console.log(`Modulmarken-Kit erzeugt: ${assets.size} SVG-Dateien unter public/brand/modules/.`);
}

const argumentsList = process.argv.slice(2);
const unknownArguments = argumentsList.filter((argument) => argument !== "--check");
if (unknownArguments.length) {
  console.error(`Unbekannte Option: ${unknownArguments.join(", ")}`);
  process.exitCode = 1;
} else {
  const assets = generatedAssets();
  if (argumentsList.includes("--check")) await checkAssets(assets);
  else await writeAssets(assets);
}
