import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseHtmlAttributes, scanHtmlStartTags } from "./html_metadata_tags.cjs";

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function injectShareMetadata(html, metadata) {
  const existingTags = scanHtmlStartTags(html, ["link", "meta"])
    .map((tag) => parseHtmlAttributes(tag));
  const unsafeTag = existingTags.find((parsed) =>
    parsed.duplicateNames.length > 0 || parsed.structuralCharacterReferenceNames.length > 0
  );
  if (unsafeTag) {
    throw new Error(`Target-Build fand mehrdeutige Share-Metadaten fuer ${metadata.url}.`);
  }
  const alreadyHasShareMetadata = existingTags.some((attributes) => {
    attributes = attributes.values;
    const rel = String(attributes.rel || "").toLowerCase().split(/\s+/);
    const property = String(attributes.property || "").toLowerCase();
    const name = String(attributes.name || "").toLowerCase();
    return rel.includes("canonical") || property.startsWith("og:") || name.startsWith("twitter:");
  });
  if (alreadyHasShareMetadata) {
    throw new Error(`Target-Build fand bereits Share-Metadaten fuer ${metadata.url}.`);
  }

  const tags = [
    `<link rel="canonical" href="${escapeAttribute(metadata.url)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="de_DE" />',
    `<meta property="og:site_name" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(metadata.url)}" />`,
    `<meta property="og:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta property="og:image:secure_url" content="${escapeAttribute(metadata.image)}" />`,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeAttribute(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(metadata.image)}" />`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(metadata.imageAlt)}" />`
  ];

  return html.replace(/\s*<\/head>/, `\n    ${tags.join("\n    ")}\n  </head>`);
}

export function renderPublicEntry(origin, { googleShareCard = false } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Die öffentliche Startseite benötigt einen HTTPS-Origin ohne Pfad oder Zugangsdaten.");
  }

  const html = readFileSync(new URL("../frontend/public-entry/index.html", import.meta.url), "utf8");
  const style = readFileSync(new URL("../frontend/public-entry/public-entry.css", import.meta.url), "utf8").trim();
  if (!style || /@import|url\s*\(/i.test(style) || /<\/style/i.test(style)) {
    throw new Error("Public-Entry-Styles muessen eigenstaendig und sicher inline-faehig sein.");
  }
  const marker = /<link rel="stylesheet" href="\.\/public-entry\.css" data-inline-public-styles\s*\/>/g;
  if (Array.from(html.matchAll(marker)).length !== 1) {
    throw new Error("Die öffentliche Startseite erwartet genau einen Style-Marker.");
  }
  let source = html.replace(marker, () => `<style data-public-entry-styles>\n${style}\n    </style>`);

  const metadata = googleShareCard ? {
    url: new URL("/", origin).href,
    title: "Versorgungs-Kompass",
    description: "Kontakte finden und Hospitationen planen.",
    image: new URL("/public/media/social/versorgungs-kompass-v1.png", origin).href,
    imageAlt: "Versorgungs-Kompass. Gemeinsam mit der Versorgung arbeiten. Rechts die Deutschlandkarte mit Kontaktorten."
  } : {
    url: `${origin}/`,
    title: "#Mitmachen",
    description: "Deine Plattform für Austausch, Wissen und Vernetzung.",
    image: `${origin}/public/media/social/mitmachen-share-v3.png`,
    imageAlt: "#Mitmachen Demo: Zusammenarbeit in der Versorgung auf einen Blick – zentriertes Banner auf dunkelblauem Hintergrund."
  };
  if (googleShareCard) {
    source = source
      .replace(/<title>[^<]*<\/title>/u, `<title>${escapeAttribute(metadata.title)}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/u, `<meta name="description" content="${escapeAttribute(metadata.description)}" />`);
  }
  return injectShareMetadata(source, metadata);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [origin, googleShareCard, ...extra] = process.argv.slice(2);
  if (!origin || !["0", "1"].includes(googleShareCard) || extra.length) {
    throw new Error("Aufruf: node scripts/render_public_entry.mjs <HTTPS-Origin> <Google-Vorschau 0|1>");
  }
  process.stdout.write(renderPublicEntry(origin, { googleShareCard: googleShareCard === "1" }));
}
