import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const targets = [
  {
    html: "frontend/app/versorgungs-kompass.html",
    styles: [{ output: "frontend/app/versorgungs-kompass.css", href: "./versorgungs-kompass.css" }],
    scripts: [{ output: "frontend/app/versorgungs-kompass.js", src: "./versorgungs-kompass.js" }]
  },
  {
    html: "frontend/map/versorgungs-kompass-map.html",
    styles: [{ output: "frontend/map/versorgungs-kompass-map.css", href: "./versorgungs-kompass-map.css" }],
    scripts: [{ output: "frontend/map/versorgungs-kompass-map.js", src: "./versorgungs-kompass-map.js" }]
  },
  {
    html: "frontend/map/versorgungs-kompass-map-teaser.html",
    styles: [{ output: "frontend/map/versorgungs-kompass-map-teaser.css", href: "./versorgungs-kompass-map-teaser.css" }],
    scripts: [{ output: "frontend/map/versorgungs-kompass-map-teaser.js", src: "./versorgungs-kompass-map-teaser.js" }]
  },
  {
    html: "frontend/map/versorgungs-kompass-contact-mini-map.html",
    styles: [{ output: "frontend/map/versorgungs-kompass-contact-mini-map.css", href: "./versorgungs-kompass-contact-mini-map.css" }],
    scripts: [{ output: "frontend/map/versorgungs-kompass-contact-mini-map.js", src: "./versorgungs-kompass-contact-mini-map.js" }]
  },
  {
    html: "frontend/login/login.html",
    styles: [{ output: "frontend/login/login.css", href: "./login.css" }],
    scripts: []
  },
  {
    html: "frontend/app/hospitation/index.html",
    styles: [{ output: "frontend/app/hospitation/hospitation.css", href: "./hospitation.css" }],
    scripts: [{ output: "frontend/app/hospitation/hospitation.js", src: "./hospitation.js" }]
  },
  {
    html: "frontend/pages/mitmachen/index.html",
    styles: [{ output: "frontend/pages/mitmachen/mitmachen.css", href: "./mitmachen.css" }],
    scripts: []
  },
  {
    html: "frontend/pages/mitmachen/versorgungs-netzwerk.html",
    styles: [{ output: "frontend/pages/mitmachen/versorgungs-netzwerk.css", href: "./versorgungs-netzwerk.css" }],
    scripts: [{ output: "frontend/pages/mitmachen/versorgungs-netzwerk.js", src: "./versorgungs-netzwerk.js" }]
  }
];

function normalizedAsset(content) {
  return `${content.replace(/^\s*\n/, "").replace(/\s+$/, "")}\n`;
}

async function extractTarget(target) {
  const htmlPath = path.join(root, target.html);
  let html = await readFile(htmlPath, "utf8");

  const styleMatches = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const stylesAlreadyExtracted = styleMatches.length === 0 && target.styles.every((asset) => html.includes(`href="${asset.href}"`));
  if (!stylesAlreadyExtracted && styleMatches.length !== target.styles.length) {
    throw new Error(`${target.html}: expected ${target.styles.length} inline style block(s), found ${styleMatches.length}.`);
  }
  for (let index = stylesAlreadyExtracted ? -1 : target.styles.length - 1; index >= 0; index -= 1) {
    const match = styleMatches[index];
    const asset = target.styles[index];
    await writeFile(path.join(root, asset.output), normalizedAsset(match[1]), "utf8");
    html = `${html.slice(0, match.index)}<link rel="stylesheet" href="${asset.href}" />${html.slice(match.index + match[0].length)}`;
  }

  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const scriptsAlreadyExtracted = scriptMatches.length === 0 && target.scripts.every((asset) => html.includes(`src="${asset.src}"`));
  if (!scriptsAlreadyExtracted && scriptMatches.length !== target.scripts.length) {
    throw new Error(`${target.html}: expected ${target.scripts.length} inline script block(s), found ${scriptMatches.length}.`);
  }
  for (let index = scriptsAlreadyExtracted ? -1 : target.scripts.length - 1; index >= 0; index -= 1) {
    const match = scriptMatches[index];
    const asset = target.scripts[index];
    await writeFile(path.join(root, asset.output), normalizedAsset(match[1]), "utf8");
    html = `${html.slice(0, match.index)}<script src="${asset.src}"></script>${html.slice(match.index + match[0].length)}`;
  }

  await writeFile(htmlPath, html, "utf8");
}

for (const target of targets) {
  await extractTarget(target);
}

console.log(`Extracted inline assets for ${targets.length} HTML entry points.`);
