alter table if exists public.stakeholder_organizations
  add column if not exists logo_url text,
  add column if not exists logo_source_url text,
  add column if not exists logo_source_label text,
  add column if not exists member_count integer,
  add column if not exists member_count_source_url text,
  add column if not exists member_count_source_label text,
  add column if not exists member_count_updated_at date,
  add column if not exists member_count_scope text;

with kv_metadata (id, logo_file, logo_source_url, member_count) as (
  values
    ('kv-baden-wuerttemberg', 'kv-baden-wuerttemberg.svg', 'https://www.kvbawue.de/fileadmin/templates/pics/LogoKVBW-Only.svg', 24324),
    ('kv-bayern', 'kv-bayern.svg', 'https://www.kvb.de/typo3conf/ext/sitepackage/Resources/Public/Img/Frontend/Icons/kvb_logo_L.svg', 30984),
    ('kv-berlin', 'kv-berlin.svg', 'https://www.kvberlin.de/die-kv-berlin/pressematerial', 11148),
    ('kv-brandenburg', 'kv-brandenburg.svg', 'https://www.kvbb.de/', 5099),
    ('kv-bremen', 'kv-bremen.svg', 'https://www.kvhb.de/fileadmin/templates/img/kvhb-logo_rgb.svg', 2127),
    ('kv-hamburg', 'kv-hamburg.svg', 'https://www.kvhh.net/_Resources/Static/Packages/Kvh.Shared/Images/logo.svg', 5873),
    ('kv-hessen', 'kv-hessen.svg', 'https://www.kvhessen.de/', 14849),
    ('kv-mecklenburg-vorpommern', 'kv-mecklenburg-vorpommern.png', 'https://www.kvmv.de/export/sites/default/.galleries/logos_kvmv/kvmv_logo_260x72_72dpi_neu.png_924116194.png', 3509),
    ('kv-niedersachsen', 'kv-niedersachsen.gif', 'https://www.kvn.de/media/Startseite/logo_kvn.gif?height=83&width=280', 17110),
    ('kv-nordrhein', 'kv-nordrhein.svg', 'https://www.kvno.de/_assets/1e9b4bda4188c921a5f70dd8e8f89d33/Default/Images/Frontend/KVNO_Logo_FIN_RGB.svg', 23809),
    ('kv-rheinland-pfalz', 'kv-rheinland-pfalz.svg', 'https://www.kv-rlp.de/', 8643),
    ('kv-saarland', 'kv-saarland.png', 'https://www.kvsaarland.de/wp-content/uploads/2021/11/cropped-layout_set_logo.png', 2272),
    ('kv-sachsen', 'kv-sachsen.svg', 'https://www.kvsachsen.de/_assets/52b99c8405b202148655db3504f4e336/Images/logo.svg', 9270),
    ('kv-sachsen-anhalt', 'kv-sachsen-anhalt.svg', 'https://www.kvsa.de/fileadmin/kvsa/kvsa-logo-positiv.svg', 4663),
    ('kv-schleswig-holstein', 'kv-schleswig-holstein.svg', 'https://www.kvsh.de/_assets/dc2a61922c9e4e40c3e5c4b5eb2f2579/Images/logo.svg', 6468),
    ('kv-thueringen', 'kv-thueringen.svg', 'https://www.kv-thueringen.de/', 4494),
    ('kv-westfalen-lippe', 'kv-westfalen-lippe.svg', 'https://www.kvwl.de/', 17233)
)
update public.stakeholder_organizations as org
set logo_url = '../public/stakeholder-logos/' || kv_metadata.logo_file,
    logo_source_url = kv_metadata.logo_source_url,
    logo_source_label = 'Offizielles Header-/Logo-Asset der Organisation',
    member_count = kv_metadata.member_count,
    member_count_source_url = 'https://www.kbv.de/documents/infothek/zahlen-und-fakten/Bundesarztregister/tabellen-statistische-informationen-bar-2025.xlsx',
    member_count_source_label = 'KBV Bundesarztregister, Tabelle 4, Stand 31.12.2025',
    member_count_updated_at = date '2025-12-31',
    member_count_scope = 'An der vertragsärztlichen Versorgung teilnehmende Ärztinnen und Ärzte, Psychotherapeutinnen und Psychotherapeuten (Zählung nach Personen)'
from kv_metadata
where org.id = kv_metadata.id;
