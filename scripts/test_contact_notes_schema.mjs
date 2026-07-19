import assert from "node:assert/strict";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const schema = fs.readFileSync(new URL("supabase/schema.sql", projectRoot), "utf8");
const migration = fs.readFileSync(new URL("supabase/migrations/20260716144443_contact_notes_email_attachments_search.sql", projectRoot), "utf8");
const api = fs.readFileSync(new URL("api/server.mjs", projectRoot), "utf8");
const dataService = fs.readFileSync(new URL("frontend/data/data-service.js", projectRoot), "utf8");
const app = [
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.html", projectRoot), "utf8"),
  fs.readFileSync(new URL("frontend/app/versorgungs-kompass.js", projectRoot), "utf8")
].join("\n");

for (const sql of [schema, migration]) {
  assert.match(sql, /create table if not exists public\.contact_notes/i);
  assert.match(sql, /content_type in \('free_note', 'email_text'\)/i);
  assert.match(sql, /create table if not exists public\.contact_note_attachments/i);
  assert.match(sql, /on delete restrict/i, "notes with attachments must not be deleted implicitly");
  assert.match(sql, /file_size between 1 and 10485760/i);
  assert.match(sql, /mime_type in \([\s\S]*text\/plain[\s\S]*application\/pdf[\s\S]*wordprocessingml\.document/i);
  assert.match(sql, /using gin \(search_vector\)/i);
  assert.match(sql, /contacts_contact_search_idx/i);
  assert.match(sql, /create policy "contact notes team read"/i);
  assert.match(sql, /create policy "contact notes author update"/i);
  assert.match(sql, /create policy "contact attachments uploader delete"/i);
  assert.match(sql, /'contact-note-attachments',[\s\S]*false,[\s\S]*10485760/i, "attachment bucket must stay private and size-limited");
  assert.match(sql, /create or replace function public\.search_contact_content/i);
  assert.match(sql, /note\.created/i);
  assert.match(sql, /email\.documented/i);
  assert.match(sql, /document\.uploaded/i);
  assert.match(sql, /document\.removed/i);
}

assert.match(api, /\/api\/contact-notes/);
assert.match(api, /\/api\/contact-note-attachments/);
assert.match(api, /CONTACT_NOTE_ATTACHMENT_BUCKET/);
assert.match(dataService, /DocumentTextExtractor/);
assert.match(dataService, /searchContactContent/);
assert.match(app, /data-add-contact-note-attachment/);
assert.match(app, /Dokument anhängen/);
assert.match(app, /contact-note-long-text/);
assert.doesNotMatch(app, /contact-note-composer-type/, "the composer must keep the simple chat interface");
assert.match(app, /In Notizen und Anhängen suchen/);
assert.doesNotMatch(app, /innerHTML\s*=\s*result\.snippet/, "search snippets must not be assigned as unescaped HTML");

console.log("Contact notes, attachment and search schema checks passed.");
