import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../api/server.mjs", import.meta.url), "utf8");
const targetSchema = readFileSync(new URL("../deploy/postgres/pre-gematik/schema.sql", import.meta.url), "utf8");
const targetMigration = readFileSync(
  new URL("../deploy/postgres/pre-gematik/migrations/202607200003_restrict_stakeholder_logo_urls.sql", import.meta.url),
  "utf8"
);
const storageReaderSource = betweenSource(
  source,
  "async function boundedStorageResponseBuffer(",
  "async function loadProfiles("
);

function betweenSource(value, startMarker, endMarker) {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Quellvertrag fehlt: ${startMarker}`);
  return value.slice(start, end);
}

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Startmarke fehlt: ${startMarker}`);
  assert.ok(end > start, `Endmarke fehlt: ${endMarker}`);
  return source.slice(start, end);
}

const sandbox = vm.createContext({
  Buffer,
  profileAvatarMetadata(buffer) {
    return buffer?.subarray(0, 3).toString("ascii") === "PNG"
      ? { contentType: "image/png", width: 200, height: 100 }
      : null;
  },
  generatedId: () => "generated-stakeholder-id",
  normalizeOrganizationName: (value) => String(value || "").trim().toLowerCase(),
  parseLocalizedInteger: (value) => value == null || value === "" ? null : Number(value)
});

vm.runInContext([
  between("function stakeholderLogoUrl(", "function stakeholderOrganizationToDto("),
  between("function stakeholderOrganizationToDb(", "function stakeholderPersonToDb("),
  between("function stakeholderLogoObjectName(", "async function readStakeholderLogo("),
  "globalThis.stakeholderLogoUrlForTest = stakeholderLogoUrl;",
  "globalThis.stakeholderLogoObjectNameForTest = stakeholderLogoObjectName;",
  "globalThis.stakeholderLogoMetadataForTest = stakeholderLogoMetadata;",
  "globalThis.stakeholderOrganizationToDbForTest = stakeholderOrganizationToDb;"
].join("\n"), sandbox, { filename: "stakeholder-logo-contract.js" });

const logoUrl = sandbox.stakeholderLogoUrlForTest;
const objectName = sandbox.stakeholderLogoObjectNameForTest;
const metadata = sandbox.stakeholderLogoMetadataForTest;
const organizationToDb = sandbox.stakeholderOrganizationToDbForTest;

assert.equal(
  logoUrl({ id: "stakeholder-1", logo_url: "private://stakeholder-logos/kv/logo.svg" }),
  "/api/stakeholder-logos/stakeholder-1"
);
assert.equal(logoUrl({ id: "stakeholder-1", logo_url: "https://assets.example.invalid/logo.png" }), "",
  "Externe Altlasten dürfen nicht an das Frontend ausgegeben werden.");
assert.equal(objectName("private://stakeholder-logos/kv/logo.svg"), "kv/logo.svg");
for (const invalid of [
  "",
  "https://example.invalid/logo.svg",
  "private://stakeholder-logos/../secret.svg",
  "private://stakeholder-logos//logo.svg",
  "private://stakeholder-logos/kv/./logo.svg",
  "private://stakeholder-logos/kv/logo%2f.svg",
  "private://stakeholder-logos/kv/logo with space.svg"
]) assert.equal(objectName(invalid), "", `Unsicherer Objektpfad muss abgewiesen werden: ${invalid}`);
assert.equal(
  organizationToDb({ name: "Testorganisation", logoUrl: "private://stakeholder-logos/kv/logo.svg" }).logo_url,
  "private://stakeholder-logos/kv/logo.svg"
);
assert.equal(organizationToDb({ name: "Testorganisation", logoUrl: "" }).logo_url, null);
for (const invalidLogoUrl of [
  "https://assets.example.invalid/logo.png",
  "private://stakeholder-logos/../secret.svg",
  "data:image/svg+xml;base64,PHN2Zz4="
]) {
  assert.throws(
    () => organizationToDb({ name: "Testorganisation", logoUrl: invalidLogoUrl }),
    (error) => error?.status === 400 && /geschützten Logo-Speicher/u.test(error.message)
  );
}

const safeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
assert.equal(metadata({ contentType: "image/svg+xml", buffer: safeSvg })?.contentType, "image/svg+xml");
const standardDoctypeSvg = Buffer.from('<?xml version="1.0"?><!-- generator --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg><!-- trailing -->');
const sanitizedStandardSvg = metadata({ contentType: "image/svg+xml", buffer: standardDoctypeSvg });
assert.equal(sanitizedStandardSvg?.contentType, "image/svg+xml");
assert.doesNotMatch(sanitizedStandardSvg.buffer.toString("utf8"), /<!DOCTYPE|<!ENTITY/i,
  "Der exakt standardisierte W3C-DOCTYPE muss vor der API-Auslieferung entfernt werden.");
assert.match(sanitizedStandardSvg.buffer.toString("utf8"), /<svg\b[\s\S]*<\/svg>/i,
  "Das sichtbare SVG muss bei der DOCTYPE-Bereinigung erhalten bleiben.");
for (const unsafeSvg of [
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracking.example.invalid/pixel"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
  '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>HTML</foreignObject></svg>'
]) assert.equal(metadata({ contentType: "image/svg+xml", buffer: Buffer.from(unsafeSvg) }), null);

const gif = Buffer.alloc(13);
gif.write("GIF89a", 0, "ascii");
gif.writeUInt16LE(10, 6);
gif.writeUInt16LE(10, 8);
assert.equal(metadata({ contentType: "image/gif", buffer: gif })?.contentType, "image/gif");
assert.equal(metadata({ contentType: "image/png", buffer: Buffer.from("PNG") })?.contentType, "image/png");
assert.equal(metadata({ contentType: "image/jpeg", buffer: Buffer.from("PNG") }), null);
assert.equal(metadata({ contentType: "text/html", buffer: Buffer.from("<html></html>") }), null);
assert.equal(metadata({ contentType: "image/svg+xml", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }), null);

for (const sql of [targetSchema, targetMigration]) {
  assert.match(sql, /stakeholder_organizations_logo_url_private_check/u);
  assert.match(sql, /private:\/\/stakeholder-logos\//u);
  assert.match(sql, /substring\(logo_url from 29\) not like '%\/\/%'/u);
}
assert.match(targetMigration, /update public\.stakeholder_organizations[\s\S]+set logo_url = null/u,
  "Die Zielmigration muss externe Altlasten vor Aktivierung des Constraints entfernen.");
assert.match(storageReaderSource, /fields", "name,size,contentType,generation"/u);
assert.match(storageReaderSource, /mediaUrl\.searchParams\.set\("generation", generation\)/u);
assert.match(storageReaderSource, /total > maximumBytes/u);
assert.match(source, /readStorageObject\(STAKEHOLDER_LOGO_BUCKET, objectName, \{[\s\S]{0,240}maxBytes: 2 \* 1024 \* 1024/u,
  "Die Logo-Route muss Metadaten und Groesse vor dem generation-gepinnten Download pruefen.");

console.log("Stakeholder logo contract OK: private routing, path validation and content checks are fail-closed.");
