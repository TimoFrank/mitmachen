import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const schema = fs.readFileSync(new URL("deploy/postgres/pre-gematik/schema.sql", projectRoot), "utf8");
const grants = fs.readFileSync(new URL("deploy/postgres/pre-gematik/grants.sql", projectRoot), "utf8");
const runtimeRole = fs.readFileSync(new URL("deploy/postgres/pre-gematik/runtime-role.sql", projectRoot), "utf8");
const api = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const securityPolicy = fs.readFileSync(new URL("api/security-policy.mjs", projectRoot), "utf8");
const dataService = fs.readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8");
const app = [
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.html", projectRoot), "utf8"),
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.js", projectRoot), "utf8")
].join("\n");

assert.match(schema, /create table if not exists public\.contact_notes/i);
assert.match(schema, /content_type in \('free_note', 'email_text'\)/i);
assert.match(schema, /create table if not exists public\.contact_note_attachments/i);
assert.match(schema, /on delete restrict/i, "notes with attachments must not be deleted implicitly");
assert.match(schema, /file_size between 1 and 10485760/i);
assert.match(schema, /mime_type in \([\s\S]*text\/plain[\s\S]*application\/pdf[\s\S]*wordprocessingml\.document/i);
assert.match(schema, /contact_notes_search_gin[\s\S]*using gin \(search_vector\)/i);
assert.match(schema, /contact_note_attachments_search_gin[\s\S]*using gin \(search_vector\)/i);
assert.match(schema, /contacts_search_gin[\s\S]*using gin \(contact_search_vector\)/i);
assert.match(
  grants,
  /grant select, insert, update, delete on table[\s\S]*public\.contact_notes,[\s\S]*public\.contact_note_attachments,[\s\S]*to :"runtime_role"/i,
  "Notizen und Anhangsmetadaten dürfen nur über die Cloud-SQL-API-Laufzeitrolle erreichbar sein."
);
assert.match(runtimeRole, /create role vk_app_runtime nologin/i);
assert.match(runtimeRole, /rolcanlogin[\s\S]*rolsuper[\s\S]*rolbypassrls/i);
assert.doesNotMatch(schema, /create\s+policy|row\s+level\s+security|auth\.uid\s*\(/i);

assert.match(api, /\/api\/contact-notes/);
assert.match(api, /\/api\/contact-note-attachments/);
assert.match(api, /CONTACT_NOTE_ATTACHMENT_BUCKET/);
assert.match(api, /async function contactNoteRow[\s\S]{0,700}?await visibleContactRow/);
assert.match(api, /function assertNoteOwner[\s\S]{0,500}?request\.currentProfile\?\.role !== "admin"/);
assert.match(api, /async function createContactNote[\s\S]{0,600}?await visibleContactRow/);
assert.match(api, /async function searchContactContent[\s\S]*websearch_to_tsquery\('german', \$1\)/);
assert.match(api, /ATTACHMENT_UPLOAD_MODE === "disabled"/);
assert.match(api, /saveStorageObject\(CONTACT_NOTE_ATTACHMENT_BUCKET/);
assert.match(securityPolicy, /contact-notes\|contact-note-attachments\)[^\n]*"editor", "contact-note\.write"/);
assert.match(securityPolicy, /"editor", "contact-note\.owned\.write"/);
assert.match(securityPolicy, /"editor", "attachment\.owned\.delete"/);
assert.match(dataService, /DocumentTextExtractor/);
assert.match(dataService, /searchContactContent/);
assert.match(app, /data-add-contact-note-attachment/);
assert.match(app, /Dokument anhängen/);
assert.match(app, /contact-note-long-text/);
assert.doesNotMatch(app, /contact-note-composer-type/, "the composer must keep the simple chat interface");
assert.match(app, /In Notizen und Anhängen suchen/);
assert.doesNotMatch(app, /innerHTML\s*=\s*result\.snippet/, "search snippets must not be assigned as unescaped HTML");

console.log("Contact notes, attachment and Cloud-SQL/API search checks passed.");
