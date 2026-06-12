alter table if exists public.stakeholder_organizations
  add column if not exists logo_url text,
  add column if not exists logo_source_url text,
  add column if not exists logo_source_label text,
  add column if not exists member_count integer,
  add column if not exists member_count_source_url text,
  add column if not exists member_count_source_label text,
  add column if not exists member_count_updated_at date,
  add column if not exists member_count_scope text;

with kv_metadata (id, logo_file, member_count) as (
  values
    ('kv-baden-wuerttemberg', 'kv-baden-wuerttemberg.svg', 24324),
    ('kv-bayern', 'kv-bayern.svg', 30984),
    ('kv-berlin', 'kv-berlin.svg', 11148),
    ('kv-brandenburg', 'kv-brandenburg.svg', 5099),
    ('kv-bremen', 'kv-bremen.svg', 2127),
    ('kv-hamburg', 'kv-hamburg.svg', 5873),
    ('kv-hessen', 'kv-hessen.svg', 14849),
    ('kv-mecklenburg-vorpommern', 'kv-mecklenburg-vorpommern.png', 3509),
    ('kv-niedersachsen', 'kv-niedersachsen.gif', 17110),
    ('kv-nordrhein', 'kv-nordrhein.svg', 23809),
    ('kv-rheinland-pfalz', 'kv-rheinland-pfalz.svg', 8643),
    ('kv-saarland', 'kv-saarland.png', 2272),
    ('kv-sachsen', 'kv-sachsen.svg', 9270),
    ('kv-sachsen-anhalt', 'kv-sachsen-anhalt.svg', 4663),
    ('kv-schleswig-holstein', 'kv-schleswig-holstein.svg', 6468),
    ('kv-thueringen', 'kv-thueringen.svg', 4494),
    ('kv-westfalen-lippe', 'kv-westfalen-lippe.svg', 17233)
)
update public.stakeholder_organizations as org
set logo_url = '../public/stakeholder-logos/' || kv_metadata.logo_file,
    logo_source_url = org.website,
    logo_source_label = 'Website der Organisation',
    member_count = kv_metadata.member_count,
    member_count_source_url = 'https://www.kbv.de/documents/infothek/zahlen-und-fakten/Bundesarztregister/tabellen-statistische-informationen-bar-2025.xlsx',
    member_count_source_label = 'KBV Bundesarztregister, Tabelle 4, Stand 31.12.2025',
    member_count_updated_at = date '2025-12-31',
    member_count_scope = 'An der vertragsärztlichen Versorgung teilnehmende Ärztinnen und Ärzte, Psychotherapeutinnen und Psychotherapeuten (Zählung nach Personen)'
from kv_metadata
where org.id = kv_metadata.id;
