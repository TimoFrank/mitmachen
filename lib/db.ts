import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DashboardStats,
  GlobalSearchItem,
  NoteListItem,
  OrganizationDetail,
  OrganizationFilterOptions,
  OrganizationListItem,
  OrganizationOption,
  PersonDetail,
  PersonFilterOptions,
  PersonListItem,
  SortOption,
  UserOption,
  UserRecord
} from "@/lib/types";

type SqlValue = string | number | null;

type PersonFormInput = {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  organizationId: number | null;
  ownerId: number | null;
  status: string;
};

type OrganizationFormInput = {
  name: string;
  industry: string;
  website: string;
  city: string;
  ownerId: number | null;
  status: string;
};

type NoteInput = {
  body: string;
  entityType: "person" | "organization";
  entityId: number;
  authorId: number;
};

let database: Database.Database | null = null;

const ORGANIZATION_SECTORS = ["Praxen", "Krankenhäuser", "Apotheken", "Pflege", "Notfallversorgung", "Reha"] as const;

const CITY_TO_STATE: Record<string, string> = {
  augsburg: "Bayern",
  berlin: "Berlin",
  bonn: "Nordrhein-Westfalen",
  braunschweig: "Niedersachsen",
  bremen: "Bremen",
  bremerhaven: "Bremen",
  dresden: "Sachsen",
  dortmund: "Nordrhein-Westfalen",
  duesseldorf: "Nordrhein-Westfalen",
  "düsseldorf": "Nordrhein-Westfalen",
  erfurt: "Thüringen",
  essen: "Nordrhein-Westfalen",
  frankfurt: "Hessen",
  freiburg: "Baden-Württemberg",
  fuerth: "Bayern",
  "fürth": "Bayern",
  hamburg: "Hamburg",
  hannover: "Niedersachsen",
  heidelberg: "Baden-Württemberg",
  jena: "Thüringen",
  karlsruhe: "Baden-Württemberg",
  kiel: "Schleswig-Holstein",
  koeln: "Nordrhein-Westfalen",
  "köln": "Nordrhein-Westfalen",
  koblenz: "Rheinland-Pfalz",
  leipzig: "Sachsen",
  luebeck: "Schleswig-Holstein",
  "lübeck": "Schleswig-Holstein",
  magdeburg: "Sachsen-Anhalt",
  mainz: "Rheinland-Pfalz",
  mannheim: "Baden-Württemberg",
  muenchen: "Bayern",
  "münchen": "Bayern",
  nuernberg: "Bayern",
  "nürnberg": "Bayern",
  potsdam: "Brandenburg",
  regensburg: "Bayern",
  rostock: "Mecklenburg-Vorpommern",
  saarbruecken: "Saarland",
  "saarbrücken": "Saarland",
  schwerin: "Mecklenburg-Vorpommern",
  stuttgart: "Baden-Württemberg",
  trier: "Rheinland-Pfalz",
  tuebingen: "Baden-Württemberg",
  "tübingen": "Baden-Württemberg",
  ulm: "Baden-Württemberg",
  weimar: "Thüringen",
  wiesbaden: "Hessen",
  wuerzburg: "Bayern",
  "würzburg": "Bayern"
};

function getDatabasePath() {
  const configured = process.env.DATABASE_PATH || "./data/crm.sqlite";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function ensureDatabase() {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  initializeSchema(database);
  seedDatabase(database);

  return database;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      city TEXT,
      status TEXT NOT NULL DEFAULT 'Lead',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Neu',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'organization')),
      entity_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function passwordHash(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function seedDatabase(db: Database.Database) {
  const countRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };

  if (countRow.count > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (@name, @email, @passwordHash)
  `);

  const insertOrg = db.prepare(`
    INSERT INTO organizations (name, industry, website, city, status, owner_id, created_at, updated_at)
    VALUES (@name, @industry, @website, @city, @status, @ownerId, @createdAt, @updatedAt)
  `);

  const insertPerson = db.prepare(`
    INSERT INTO people (first_name, last_name, role, email, phone, organization_id, owner_id, status, created_at, updated_at)
    VALUES (@firstName, @lastName, @role, @email, @phone, @organizationId, @ownerId, @status, @createdAt, @updatedAt)
  `);

  const insertNote = db.prepare(`
    INSERT INTO notes (body, entity_type, entity_id, author_id, created_at)
    VALUES (@body, @entityType, @entityId, @authorId, @createdAt)
  `);

  const now = new Date().toISOString();
  const dayInMs = 24 * 60 * 60 * 1000;

  function isoOffset(daysAgo: number, hourOffset = 0) {
    return new Date(Date.now() - daysAgo * dayInMs - hourOffset * 60 * 60 * 1000).toISOString();
  }

  const transaction = db.transaction(() => {
    const anna = insertUser.run({
      name: "Anna Schmidt",
      email: "anna@versorgungscrm.local",
      passwordHash: passwordHash("demo1234")
    }).lastInsertRowid as number;

    const marc = insertUser.run({
      name: "Marc Weber",
      email: "marc@versorgungscrm.local",
      passwordHash: passwordHash("demo1234")
    }).lastInsertRowid as number;

    const timo = insertUser.run({
      name: "Timo Frank",
      email: "timo@versorgungscrm.local",
      passwordHash: passwordHash("demo1234")
    }).lastInsertRowid as number;

    const julia = insertUser.run({
      name: "Julia Huebner",
      email: "julia@versorgungscrm.local",
      passwordHash: passwordHash("demo1234")
    }).lastInsertRowid as number;

    const owners = [anna, marc, timo, julia];

    const nord = insertOrg.run({
      name: "Nordstadt Pflegezentrum",
      industry: "Pflege",
      website: "https://nordstadt-pflege.example",
      city: "Hamburg",
      status: "Aktiv",
      ownerId: anna,
      createdAt: isoOffset(14, 2),
      updatedAt: isoOffset(1, 4)
    }).lastInsertRowid as number;

    const klar = insertOrg.run({
      name: "Klarwerk Gesundheit",
      industry: "Gesundheit",
      website: "https://klarwerk.example",
      city: "Berlin",
      status: "Lead",
      ownerId: marc,
      createdAt: isoOffset(12, 5),
      updatedAt: isoOffset(2, 6)
    }).lastInsertRowid as number;

    const additionalOrganizations = [
      { name: "Praxis Verbund Isar", industry: "Praxen", website: "https://isar-praxen.example", city: "Muenchen", status: "Aktiv", ownerId: timo, createdAt: isoOffset(11, 2), updatedAt: isoOffset(1, 1) },
      { name: "Klinikverbund Rhein-Main", industry: "Krankenhäuser", website: "https://rhein-main-klinik.example", city: "Frankfurt", status: "Aktiv", ownerId: julia, createdAt: isoOffset(10, 3), updatedAt: isoOffset(2, 1) },
      { name: "Apothekennetz Sued", industry: "Apotheken", website: "https://apo-sued.example", city: "Stuttgart", status: "Wartet", ownerId: anna, createdAt: isoOffset(9, 4), updatedAt: isoOffset(3, 2) },
      { name: "Rettungsdienst Nordwest", industry: "Notfallversorgung", website: "https://rettungsdienst-nordwest.example", city: "Bremen", status: "Aktiv", ownerId: marc, createdAt: isoOffset(8, 5), updatedAt: isoOffset(1, 3) },
      { name: "Reha Campus Elbe", industry: "Reha", website: "https://reha-elbe.example", city: "Dresden", status: "Lead", ownerId: timo, createdAt: isoOffset(8, 1), updatedAt: isoOffset(4, 1) },
      { name: "Charite Versorgungspartner", industry: "Krankenhäuser", website: "https://charite-partner.example", city: "Berlin", status: "Aktiv", ownerId: julia, createdAt: isoOffset(7, 2), updatedAt: isoOffset(0, 6) },
      { name: "Pflegenetz Ruhr", industry: "Pflege", website: "https://pflegenetz-ruhr.example", city: "Essen", status: "Aktiv", ownerId: anna, createdAt: isoOffset(7, 6), updatedAt: isoOffset(2, 4) },
      { name: "Praxisklinik Koeln West", industry: "Praxen", website: "https://koeln-west.example", city: "Koeln", status: "Lead", ownerId: marc, createdAt: isoOffset(6, 3), updatedAt: isoOffset(3, 5) },
      { name: "Apothekenring Hanse", industry: "Apotheken", website: "https://hanse-apo.example", city: "Luebeck", status: "Aktiv", ownerId: timo, createdAt: isoOffset(5, 4), updatedAt: isoOffset(1, 7) },
      { name: "Notfallverbund Mitte", industry: "Notfallversorgung", website: "https://notfall-mitte.example", city: "Leipzig", status: "Wartet", ownerId: julia, createdAt: isoOffset(5, 2), updatedAt: isoOffset(4, 3) },
      { name: "Reha Zentrum Main", industry: "Reha", website: "https://reha-main.example", city: "Mainz", status: "Aktiv", ownerId: anna, createdAt: isoOffset(4, 2), updatedAt: isoOffset(0, 8) },
      { name: "Klinikum Bergstrasse", industry: "Krankenhäuser", website: "https://bergstrasse-klinikum.example", city: "Heidelberg", status: "Lead", ownerId: marc, createdAt: isoOffset(4, 5), updatedAt: isoOffset(3, 1) },
      { name: "Versorgungshaus Thueringen", industry: "Pflege", website: "https://versorgung-thueringen.example", city: "Erfurt", status: "Aktiv", ownerId: timo, createdAt: isoOffset(3, 4), updatedAt: isoOffset(1, 2) }
    ];

    const organizationIds = [
      nord,
      klar,
      ...additionalOrganizations.map((organization) => insertOrg.run(organization).lastInsertRowid as number)
    ];

    const organizationEntries: Array<readonly [string, number]> = [
      ["Nordstadt Pflegezentrum", nord],
      ["Klarwerk Gesundheit", klar],
      ...additionalOrganizations.map(
        (organization, index): readonly [string, number] => [organization.name, organizationIds[index + 2]]
      )
    ];

    const organizationByName = new Map<string, number>(organizationEntries);

    const lisa = insertPerson.run({
      firstName: "Lisa",
      lastName: "Hartmann",
      role: "Einrichtungsleitung",
      email: "lisa.hartmann@nordstadt-pflege.example",
      phone: "+49 40 555100",
      organizationId: nord,
      ownerId: anna,
      status: "Aktiv",
      createdAt: isoOffset(13, 1),
      updatedAt: isoOffset(1, 5)
    }).lastInsertRowid as number;

    const jens = insertPerson.run({
      firstName: "Jens",
      lastName: "Keller",
      role: "Einkauf",
      email: "jens.keller@klarwerk.example",
      phone: "+49 30 555220",
      organizationId: klar,
      ownerId: marc,
      status: "Neu",
      createdAt: isoOffset(11, 6),
      updatedAt: isoOffset(2, 7)
    }).lastInsertRowid as number;

    const peopleSeed = [
      ["Sarah", "Meyer", "Pflegedienstleitung", "Nordstadt Pflegezentrum", "Aktiv"],
      ["Thomas", "Behrens", "Qualitaetsmanagement", "Nordstadt Pflegezentrum", "Aktiv"],
      ["Miriam", "Wolf", "Stationskoordination", "Nordstadt Pflegezentrum", "Wartet"],
      ["David", "Nguyen", "Produktmanagement", "Klarwerk Gesundheit", "Neu"],
      ["Aylin", "Kaya", "Vertrieb Versorgung", "Klarwerk Gesundheit", "Aktiv"],
      ["Martin", "Schroeder", "IT-Koordination", "Klarwerk Gesundheit", "Lead"],
      ["Eva", "Lorenz", "Praxismanagement", "Praxis Verbund Isar", "Aktiv"],
      ["Nina", "Albrecht", "Aerzliche Leitung", "Praxis Verbund Isar", "Aktiv"],
      ["Paul", "Wirth", "Digitalisierung", "Praxis Verbund Isar", "Neu"],
      ["Clara", "Hahn", "Kliniksteuerung", "Klinikverbund Rhein-Main", "Aktiv"],
      ["Leon", "Voigt", "Medizincontrolling", "Klinikverbund Rhein-Main", "Wartet"],
      ["Fatma", "Yildiz", "Pflegekoordination", "Klinikverbund Rhein-Main", "Aktiv"],
      ["Robert", "Seidel", "Apothekenleitung", "Apothekennetz Sued", "Aktiv"],
      ["Kathrin", "Moss", "Einkauf", "Apothekennetz Sued", "Lead"],
      ["Jan", "Fischer", "Standortmanagement", "Apothekennetz Sued", "Wartet"],
      ["Helena", "Roth", "Einsatzplanung", "Rettungsdienst Nordwest", "Aktiv"],
      ["Can", "Arslan", "Leitstelle", "Rettungsdienst Nordwest", "Aktiv"],
      ["Sven", "Pohl", "Rettungswache", "Rettungsdienst Nordwest", "Neu"],
      ["Judith", "Kern", "Therapieleitung", "Reha Campus Elbe", "Aktiv"],
      ["Marlon", "Peters", "Patientenaufnahme", "Reha Campus Elbe", "Lead"],
      ["Olga", "Schaefer", "Campuskoordination", "Reha Campus Elbe", "Wartet"],
      ["Dr. Anna", "Mueller", "Oberaerztin", "Charite Versorgungspartner", "Aktiv"],
      ["Hannes", "Neumann", "Produktowner", "Charite Versorgungspartner", "Aktiv"],
      ["Sabine", "Kunz", "Studienkoordination", "Charite Versorgungspartner", "Neu"],
      ["Ralf", "Winter", "Heimleitung", "Pflegenetz Ruhr", "Aktiv"],
      ["Melina", "Schick", "Pflegeberatung", "Pflegenetz Ruhr", "Aktiv"],
      ["Igor", "Petrov", "Dienstplanung", "Pflegenetz Ruhr", "Wartet"],
      ["Britta", "Jansen", "Praxisinhaberin", "Praxisklinik Koeln West", "Lead"],
      ["Mara", "Brandt", "Assistenz", "Praxisklinik Koeln West", "Neu"],
      ["Luca", "Herrmann", "Abrechnung", "Praxisklinik Koeln West", "Aktiv"],
      ["Nora", "Stein", "Filialleitung", "Apothekenring Hanse", "Aktiv"],
      ["Torben", "Kruse", "Versorgung", "Apothekenring Hanse", "Lead"],
      ["Mina", "Falk", "Digital Health", "Apothekenring Hanse", "Neu"],
      ["Stefan", "Riemer", "Leitstelle", "Notfallverbund Mitte", "Aktiv"],
      ["Julia", "Seifert", "Koordination", "Notfallverbund Mitte", "Wartet"],
      ["Deniz", "Acar", "Rettungsdienst", "Notfallverbund Mitte", "Neu"],
      ["Petra", "Baumann", "Therapieplanung", "Reha Zentrum Main", "Aktiv"],
      ["Omar", "Rahman", "Zuweisermanagement", "Reha Zentrum Main", "Lead"],
      ["Tina", "Franke", "Patientenservice", "Reha Zentrum Main", "Aktiv"],
      ["Dr. Felix", "Bauer", "Chefarztbuero", "Klinikum Bergstrasse", "Lead"],
      ["Arzu", "Demir", "Pflegeentwicklung", "Klinikum Bergstrasse", "Aktiv"],
      ["Jonas", "Mertens", "IT-Integration", "Klinikum Bergstrasse", "Wartet"],
      ["Birgit", "Reuter", "Heimleitung", "Versorgungshaus Thueringen", "Aktiv"],
      ["Melek", "Guel", "Pflegekoordination", "Versorgungshaus Thueringen", "Aktiv"],
      ["Nico", "Schott", "Qualitaet", "Versorgungshaus Thueringen", "Neu"],
      ["Celine", "Becker", "Projektassistenz", "Klarwerk Gesundheit", "Neu"],
      ["Philipp", "Lang", "Arztpraxis-Netzwerk", "Praxis Verbund Isar", "Lead"],
      ["Laura", "Zeller", "E-Health", "Charite Versorgungspartner", "Aktiv"]
    ] as const;

    const personIds = [lisa, jens];

    peopleSeed.forEach(([firstName, lastName, role, organizationName, status], index) => {
      const organizationId = organizationByName.get(organizationName) ?? null;
      const ownerId = owners[index % owners.length];
      const slugBase = `${firstName}.${lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".");

      const personId = insertPerson.run({
        firstName,
        lastName,
        role,
        email: `${slugBase}@demo-versorgungscrm.local`,
        phone: `+49 ${30 + (index % 20)} ${String(550000 + index * 37).slice(0, 6)}`,
        organizationId,
        ownerId,
        status,
        createdAt: isoOffset(10 - Math.min(index, 9), (index % 8) + 1),
        updatedAt: isoOffset(index % 5, (index % 6) + 1)
      }).lastInsertRowid as number;

      personIds.push(personId);
    });

    insertNote.run({
      body: "Erstgespraech gefuehrt. Interesse an schneller Pilotphase ab April.",
      entityType: "organization",
      entityId: nord,
      authorId: anna,
      createdAt: now
    });

    insertNote.run({
      body: "Lisa moechte naechste Woche ein kompaktes Angebot inklusive Onboarding-Aufwand.",
      entityType: "person",
      entityId: lisa,
      authorId: anna,
      createdAt: now
    });

    insertNote.run({
      body: "Jens wartet auf Freigabe vom Standortleiter. Wiedervorlage in zwei Wochen.",
      entityType: "person",
      entityId: jens,
      authorId: marc,
      createdAt: isoOffset(2, 7)
    });

    const noteTemplates = [
      {
        body: "Owner-Wechsel dokumentiert. Naechster Abstimmungstermin in der kommenden Woche.",
        entityType: "organization" as const,
        entityId: klar,
        authorId: timo,
        createdAt: isoOffset(1, 3)
      },
      {
        body: "Interesse an strukturierter Pilotbegleitung und Einbindung der Versorgungspartner.",
        entityType: "organization" as const,
        entityId: organizationByName.get("Praxis Verbund Isar")!,
        authorId: julia,
        createdAt: isoOffset(3, 2)
      },
      {
        body: "Rettungsdienst moechte priorisiert eine einfache Owner-Uebergabe im Alltag pruefen.",
        entityType: "organization" as const,
        entityId: organizationByName.get("Rettungsdienst Nordwest")!,
        authorId: marc,
        createdAt: isoOffset(2, 2)
      },
      {
        body: "Sarah bittet um kompakten Ueberblick zu Rollout-Schritten fuer das Pflegeteam.",
        entityType: "person" as const,
        entityId: personIds[2],
        authorId: anna,
        createdAt: isoOffset(1, 6)
      },
      {
        body: "David moechte vor der naechsten Runde noch zwei Rueckfragen zur Datenmigration klaeren.",
        entityType: "person" as const,
        entityId: personIds[5],
        authorId: timo,
        createdAt: isoOffset(4, 4)
      },
      {
        body: "Anna Mueller hat positives Feedback zum aktuellen Status-Dashboard gegeben.",
        entityType: "person" as const,
        entityId: personIds[23],
        authorId: julia,
        createdAt: isoOffset(0, 5)
      },
      {
        body: "Zuweiser-Management benoetigt eine kurze Zusammenfassung fuer die naechste Lenkungsrunde.",
        entityType: "person" as const,
        entityId: personIds[38],
        authorId: marc,
        createdAt: isoOffset(2, 1)
      }
    ];

    noteTemplates.forEach((note) => insertNote.run(note));
  });

  transaction();
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: string) {
  return value === "" ? null : value;
}

function cleanNumber(value: FormDataEntryValue | null) {
  const raw = cleanString(value);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapParams(params: Record<string, SqlValue>) {
  return params;
}

function escapeLikeValue(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeForLookup(value: string) {
  return value.trim().toLowerCase();
}

function deriveOrganizationSector(industry: string | null, name: string) {
  const lookup = normalizeForLookup(`${industry || ""} ${name}`);

  if (!lookup) {
    return null;
  }

  if (lookup.includes("pflege")) return "Pflege";
  if (lookup.includes("apothek")) return "Apotheken";
  if (lookup.includes("notfall") || lookup.includes("rettung")) return "Notfallversorgung";
  if (lookup.includes("reha")) return "Reha";
  if (
    lookup.includes("krankenhaus") ||
    lookup.includes("klinikum") ||
    lookup.includes("klinik") ||
    lookup.includes("charite") ||
    lookup.includes("charité")
  ) {
    return "Krankenhäuser";
  }
  if (lookup.includes("praxis")) return "Praxen";

  return industry ? industry.trim() : null;
}

function deriveOrganizationState(city: string | null) {
  if (!city) {
    return null;
  }

  return CITY_TO_STATE[normalizeForLookup(city)] || null;
}

export function getDashboardStats(): DashboardStats {
  const db = ensureDatabase();

  return {
    organizations: (db.prepare("SELECT COUNT(*) as count FROM organizations").get() as { count: number }).count,
    people: (db.prepare("SELECT COUNT(*) as count FROM people").get() as { count: number }).count,
    notes: (db.prepare("SELECT COUNT(*) as count FROM notes").get() as { count: number }).count
  };
}

export function getGlobalSearchItems(): GlobalSearchItem[] {
  const people = getPeople({ sort: "name" }).map((person) => ({
    id: person.id,
    kind: "person" as const,
    title: `${person.firstName} ${person.lastName}`,
    subtitle: [person.role, person.organizationName].filter(Boolean).join(" • ") || "Person",
    href: `/people/${person.id}`,
    keywords: [person.firstName, person.lastName, person.role, person.organizationName, person.ownerName, person.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  }));

  const organizations = getOrganizations({ sort: "name" }).map((organization) => ({
    id: organization.id,
    kind: "organization" as const,
    title: organization.name,
    subtitle: [organization.sector, organization.city, organization.state].filter(Boolean).join(" • ") || "Organisation",
    href: `/organizations/${organization.id}`,
    keywords: [organization.name, organization.sector, organization.city, organization.state, organization.ownerName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  }));

  return [...people, ...organizations];
}

export function getRecentlyAddedPeople(limit = 4): PersonListItem[] {
  return getPeople({ sort: "updated" })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.lastName.localeCompare(right.lastName, "de"))
    .slice(0, limit);
}

export function getRecentlyAddedOrganizations(limit = 4): OrganizationListItem[] {
  return getOrganizations({ sort: "updated" })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name, "de"))
    .slice(0, limit);
}

export function getUsers(): UserOption[] {
  const db = ensureDatabase();
  return db
    .prepare("SELECT id, name, email FROM users ORDER BY name ASC")
    .all() as UserOption[];
}

export function getOrganizationsForSelect(): OrganizationOption[] {
  const db = ensureDatabase();
  return db.prepare("SELECT id, name FROM organizations ORDER BY name ASC").all() as OrganizationOption[];
}

export function getPeople(options?: {
  query?: string;
  sort?: SortOption;
  status?: string;
  role?: string;
  organizationId?: number | null;
  ownerId?: number | null;
}): PersonListItem[] {
  const db = ensureDatabase();
  const query = options?.query?.trim();
  const sort = options?.sort === "name" ? "name" : "updated";
  const status = options?.status?.trim();
  const role = options?.role?.trim();
  const organizationId = options?.organizationId ?? null;
  const ownerId = options?.ownerId ?? null;
  const orderBy = sort === "name" ? "p.last_name ASC, p.first_name ASC" : "p.updated_at DESC, p.last_name ASC";

  return db
    .prepare(`
      SELECT
        p.id,
        p.first_name as firstName,
        p.last_name as lastName,
        p.role,
        p.email,
        p.phone,
        p.status,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        o.name as organizationName,
        u.name as ownerName
      FROM people p
      LEFT JOIN organizations o ON o.id = p.organization_id
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE (
        @search IS NULL OR
        lower(p.first_name || ' ' || p.last_name) LIKE @search ESCAPE '\\' OR
        lower(COALESCE(p.role, '')) LIKE @search ESCAPE '\\' OR
        lower(COALESCE(o.name, '')) LIKE @search ESCAPE '\\' OR
        lower(COALESCE(u.name, '')) LIKE @search ESCAPE '\\'
      )
      AND (@status IS NULL OR p.status = @status)
      AND (@role IS NULL OR p.role = @role)
      AND (@organizationId IS NULL OR p.organization_id = @organizationId)
      AND (@ownerId IS NULL OR p.owner_id = @ownerId)
      ORDER BY ${orderBy}
    `)
    .all({
      search: query ? `%${escapeLikeValue(query.toLowerCase())}%` : null,
      status: status || null,
      role: role || null,
      organizationId,
      ownerId
    }) as PersonListItem[];
}

export function getPersonFilterOptions(): PersonFilterOptions {
  const db = ensureDatabase();

  const roles = db
    .prepare(`
      SELECT DISTINCT role
      FROM people
      WHERE role IS NOT NULL AND trim(role) <> ''
      ORDER BY role ASC
    `)
    .all() as { role: string }[];

  return {
    roles: roles.map((entry) => entry.role),
    organizations: getOrganizationsForSelect(),
    owners: getUsers()
  };
}

export function getOrganizationFilterOptions(): OrganizationFilterOptions {
  const organizations = getOrganizations({ sort: "name" });

  const cities = Array.from(new Set(organizations.map((organization) => organization.city).filter(Boolean) as string[])).sort(
    (left, right) => left.localeCompare(right, "de")
  );
  const states = Array.from(new Set(organizations.map((organization) => organization.state).filter(Boolean) as string[])).sort(
    (left, right) => left.localeCompare(right, "de")
  );

  return {
    sectors: [...ORGANIZATION_SECTORS],
    cities,
    states
  };
}

export function getOrganizations(options?: {
  query?: string;
  sort?: SortOption;
  status?: string;
  sector?: string;
  city?: string;
  state?: string;
}): OrganizationListItem[] {
  const db = ensureDatabase();
  const query = options?.query?.trim();
  const sort = options?.sort === "name" ? "name" : "updated";
  const status = options?.status?.trim();
  const sector = options?.sector?.trim();
  const city = options?.city?.trim();
  const state = options?.state?.trim();

  const organizations = db
    .prepare(`
      SELECT
        o.id,
        o.name,
        o.industry,
        o.city,
        o.website,
        o.status,
        o.created_at as createdAt,
        o.updated_at as updatedAt,
        u.name as ownerName,
        COUNT(p.id) as peopleCount
      FROM organizations o
      LEFT JOIN users u ON u.id = o.owner_id
      LEFT JOIN people p ON p.organization_id = o.id
      WHERE (@status IS NULL OR o.status = @status)
      GROUP BY o.id
      ORDER BY o.updated_at DESC, o.name ASC
    `)
    .all({
      status: status || null
    }) as Omit<OrganizationListItem, "sector" | "state">[];

  const enriched = organizations.map((organization) => ({
    ...organization,
    sector: deriveOrganizationSector(organization.industry, organization.name),
    state: deriveOrganizationState(organization.city)
  }));

  const normalizedQuery = query ? query.toLowerCase() : null;

  const filtered = enriched.filter((organization) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        organization.name,
        organization.industry,
        organization.sector,
        organization.city,
        organization.state,
        organization.ownerName
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));

    const matchesSector = !sector || organization.sector === sector;
    const matchesCity = !city || organization.city === city;
    const matchesState = !state || organization.state === state;

    return matchesQuery && matchesSector && matchesCity && matchesState;
  });

  return filtered.sort((left, right) => {
    if (sort === "name") {
      return left.name.localeCompare(right.name, "de");
    }

    const updatedCompare = right.updatedAt.localeCompare(left.updatedAt);
    return updatedCompare !== 0 ? updatedCompare : left.name.localeCompare(right.name, "de");
  });
}

function getNotes(entityType: "person" | "organization", entityId: number): NoteListItem[] {
  const db = ensureDatabase();
  return db
    .prepare(`
      SELECT
        n.id,
        n.body,
        n.created_at as createdAt,
        u.name as authorName
      FROM notes n
      INNER JOIN users u ON u.id = n.author_id
      WHERE n.entity_type = ? AND n.entity_id = ?
      ORDER BY n.created_at DESC, n.id DESC
    `)
    .all(entityType, entityId) as NoteListItem[];
}

export function getPersonById(id: number): PersonDetail | null {
  const db = ensureDatabase();
  const person = db
    .prepare(`
      SELECT
        p.id,
        p.first_name as firstName,
        p.last_name as lastName,
        p.role,
        p.email,
        p.phone,
        p.organization_id as organizationId,
        p.owner_id as ownerId,
        p.status,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        o.name as organizationName,
        u.name as ownerName
      FROM people p
      LEFT JOIN organizations o ON o.id = p.organization_id
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `)
    .get(id) as (PersonDetail["person"] & { organizationName: string | null; ownerName: string | null }) | undefined;

  if (!person) {
    return null;
  }

  return {
    person: {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      role: person.role,
      email: person.email,
      phone: person.phone,
      organizationId: person.organizationId,
      ownerId: person.ownerId,
      status: person.status,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt
    },
    organizationName: person.organizationName,
    ownerName: person.ownerName,
    notes: getNotes("person", id)
  };
}

export function getOrganizationById(id: number): OrganizationDetail | null {
  const db = ensureDatabase();
  const organization = db
    .prepare(`
      SELECT
        o.id,
        o.name,
        o.industry,
        o.website,
        o.city,
        o.status,
        o.owner_id as ownerId,
        o.created_at as createdAt,
        o.updated_at as updatedAt,
        u.name as ownerName
      FROM organizations o
      LEFT JOIN users u ON u.id = o.owner_id
      WHERE o.id = ?
    `)
    .get(id) as
    | (OrganizationDetail["organization"] & {
        ownerName: string | null;
      })
    | undefined;

  if (!organization) {
    return null;
  }

  const contacts = db
    .prepare(`
      SELECT id, first_name || ' ' || last_name as name
      FROM people
      WHERE organization_id = ?
      ORDER BY last_name ASC, first_name ASC
    `)
    .all(id) as OrganizationOption[];

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      industry: organization.industry,
      website: organization.website,
      city: organization.city,
      status: organization.status,
      ownerId: organization.ownerId,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt
    },
    ownerName: organization.ownerName,
    contacts,
    notes: getNotes("organization", id)
  };
}

export function getUserByEmail(email: string): UserRecord | null {
  const db = ensureDatabase();
  const user = db
    .prepare(`
      SELECT
        id,
        name,
        email,
        password_hash as passwordHash,
        created_at as createdAt
      FROM users
      WHERE lower(email) = lower(?)
    `)
    .get(email) as UserRecord | undefined;

  return user || null;
}

export function createPerson(input: PersonFormInput) {
  const db = ensureDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO people (
        first_name,
        last_name,
        role,
        email,
        phone,
        organization_id,
        owner_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        @firstName,
        @lastName,
        @role,
        @email,
        @phone,
        @organizationId,
        @ownerId,
        @status,
        @createdAt,
        @updatedAt
      )
    `)
    .run(
      mapParams({
        firstName: input.firstName,
        lastName: input.lastName,
        role: nullableString(input.role),
        email: nullableString(input.email),
        phone: nullableString(input.phone),
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        status: input.status,
        createdAt: now,
        updatedAt: now
      })
    );

  return Number(result.lastInsertRowid);
}

export function updatePerson(id: number, input: PersonFormInput) {
  const db = ensureDatabase();
  db.prepare(`
      UPDATE people
      SET
        first_name = @firstName,
        last_name = @lastName,
        role = @role,
        email = @email,
        phone = @phone,
        organization_id = @organizationId,
        owner_id = @ownerId,
        status = @status,
        updated_at = @updatedAt
      WHERE id = @id
    `).run(
    mapParams({
      id,
      firstName: input.firstName,
      lastName: input.lastName,
      role: nullableString(input.role),
      email: nullableString(input.email),
      phone: nullableString(input.phone),
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      status: input.status,
      updatedAt: new Date().toISOString()
    })
  );
}

export function updatePersonOwner(id: number, ownerId: number | null) {
  const db = ensureDatabase();
  db.prepare(`
      UPDATE people
      SET owner_id = @ownerId, updated_at = @updatedAt
      WHERE id = @id
    `).run(
    mapParams({
      id,
      ownerId,
      updatedAt: new Date().toISOString()
    })
  );
}

export function createOrganization(input: OrganizationFormInput) {
  const db = ensureDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO organizations (
        name,
        industry,
        website,
        city,
        owner_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        @name,
        @industry,
        @website,
        @city,
        @ownerId,
        @status,
        @createdAt,
        @updatedAt
      )
    `)
    .run(
      mapParams({
        name: input.name,
        industry: nullableString(input.industry),
        website: nullableString(input.website),
        city: nullableString(input.city),
        ownerId: input.ownerId,
        status: input.status,
        createdAt: now,
        updatedAt: now
      })
    );

  return Number(result.lastInsertRowid);
}

export function updateOrganization(id: number, input: OrganizationFormInput) {
  const db = ensureDatabase();
  db.prepare(`
      UPDATE organizations
      SET
        name = @name,
        industry = @industry,
        website = @website,
        city = @city,
        owner_id = @ownerId,
        status = @status,
        updated_at = @updatedAt
      WHERE id = @id
    `).run(
    mapParams({
      id,
      name: input.name,
      industry: nullableString(input.industry),
      website: nullableString(input.website),
      city: nullableString(input.city),
      ownerId: input.ownerId,
      status: input.status,
      updatedAt: new Date().toISOString()
    })
  );
}

export function updateOrganizationOwner(id: number, ownerId: number | null) {
  const db = ensureDatabase();
  db.prepare(`
      UPDATE organizations
      SET owner_id = @ownerId, updated_at = @updatedAt
      WHERE id = @id
    `).run(
    mapParams({
      id,
      ownerId,
      updatedAt: new Date().toISOString()
    })
  );
}

export function createNote(input: NoteInput) {
  const db = ensureDatabase();

  db.prepare(`
      INSERT INTO notes (body, entity_type, entity_id, author_id, created_at)
      VALUES (@body, @entityType, @entityId, @authorId, @createdAt)
    `).run(
    mapParams({
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      authorId: input.authorId,
      createdAt: new Date().toISOString()
    })
  );

  if (input.entityType === "person") {
    db.prepare("UPDATE people SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), input.entityId);
  } else {
    db.prepare("UPDATE organizations SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), input.entityId);
  }
}

export function parsePersonFormData(formData: FormData): PersonFormInput {
  return {
    firstName: cleanString(formData.get("firstName")),
    lastName: cleanString(formData.get("lastName")),
    role: cleanString(formData.get("role")),
    email: cleanString(formData.get("email")),
    phone: cleanString(formData.get("phone")),
    organizationId: cleanNumber(formData.get("organizationId")),
    ownerId: cleanNumber(formData.get("ownerId")),
    status: cleanString(formData.get("status")) || "Neu"
  };
}

export function parseOrganizationFormData(formData: FormData): OrganizationFormInput {
  return {
    name: cleanString(formData.get("name")),
    industry: cleanString(formData.get("industry")),
    website: cleanString(formData.get("website")),
    city: cleanString(formData.get("city")),
    ownerId: cleanNumber(formData.get("ownerId")),
    status: cleanString(formData.get("status")) || "Lead"
  };
}

export function parseNoteFormData(formData: FormData): { body: string } {
  return {
    body: cleanString(formData.get("body"))
  };
}
