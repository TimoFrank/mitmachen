alter table if exists public.stakeholder_organizations
  add column if not exists member_count integer,
  add column if not exists member_count_source_url text,
  add column if not exists member_count_source_label text,
  add column if not exists member_count_updated_at date,
  add column if not exists member_count_scope text;

with patient_member_counts (
  id,
  member_count,
  member_count_source_url,
  member_count_source_label,
  member_count_updated_at
) as (
  values
    ('patient-dbr', 140, 'https://www.lobbyregister.bundestag.de/suche/R002273', 'Lobbyregister Bundestag: DBR, Mitglieder am 17.06.2024', date '2024-06-17'),
    ('patient-dag-shg', 200, 'https://www.lobbyregister.bundestag.de/media/f7/fc/578719/Geschaftsbericht-DAG-SHG_2024.pdf', 'DAG SHG: Geschäftsbericht 2024', null::date),
    ('patient-vzbv', 47, 'https://www.vzbv.de/ueber-uns/organisation/mitglieder', 'vzbv: Mitglieder', null::date),
    ('patient-bag-selbsthilfe', 141, 'https://www.bag-selbsthilfe.de/bag-selbsthilfe/die-mitgliedsorganisationen-der-bag-selbsthilfe/infos-zur-mitgliedschaft', 'BAG SELBSTHILFE: Infos zur Mitgliedschaft', null::date),
    ('patient-sovd', 600000, 'https://www.sovd.de/', 'SoVD: Startseite', null::date),
    ('patient-vdk', 2385426, 'https://www.presseportal.de/pm/134393/6223304', 'Sozialverband VdK Deutschland: Mitglieder-Höchststand 2025', date '2025-12-31'),
    ('patient-isl', 20, 'https://www.forum-menschenrechte.de/netzwerk/interessenvertretung-selbstbestimmt-leben-in-deutschland-isl-e-v/', 'Forum Menschenrechte: ISL e.V.', null::date),
    ('patient-abid', 2506, 'https://www.lobbyregister.bundestag.de/suche/R003142', 'Lobbyregister Bundestag: ABiD, Mitglieder am 31.12.2023', date '2023-12-31'),
    ('patient-lebenshilfe', 646, 'https://www.lobbyregister.bundestag.de/suche/R004143', 'Lobbyregister Bundestag: Bundesvereinigung Lebenshilfe, Mitglieder am 05.02.2026', date '2026-02-05'),
    ('patient-achse', 130, 'https://www.lobbyregister.bundestag.de/suche/R002390', 'Lobbyregister Bundestag: ACHSE', null::date),
    ('patient-deutsche-alzheimer-gesellschaft', 193, 'https://www.lobbyregister.bundestag.de/suche/R001162', 'Lobbyregister Bundestag: Deutsche Alzheimer Gesellschaft, Mitglieder am 01.01.2025', date '2025-01-01'),
    ('patient-rheuma-liga', 260048, 'https://www.lobbyregister.bundestag.de/suche/R001807', 'Lobbyregister Bundestag: Deutsche Rheuma-Liga, Mitglieder am 01.01.2024', date '2024-01-01'),
    ('patient-dmsg', 41961, 'https://www.lobbyregister.bundestag.de/suche/R004509', 'Lobbyregister Bundestag: DMSG, Mitglieder am 31.12.2023', date '2023-12-31'),
    ('patient-dccv', 23970, 'https://www.lobbyregister.bundestag.de/media/08/18/595593/Lobbyregister-Registereintraege-Detailansicht-R004914-2025-08-01_07-54-40.pdf', 'Lobbyregister Bundestag: DCCV, Mitglieder am 24.07.2025', date '2025-07-24'),
    ('patient-pro-retina', 6000, 'https://retina-international.org/members/pro-retina-deutschland-e-v/', 'Retina International: PRO RETINA Deutschland', null::date),
    ('patient-aps', 800, 'https://www.aps-ev.de/', 'APS: Startseite', null::date),
    ('patient-bpik', 200, 'https://bpik.de/spendenseite/', 'BPiK: Spendenseite', null::date),
    ('patient-diabetesde', 30, 'https://www.lobbyregister.bundestag.de/suche/R003277', 'Lobbyregister Bundestag: diabetesDE, Mitglieder am 01.02.2024', date '2024-02-01'),
    ('patient-parkinson-vereinigung', 15300, 'https://de.wikipedia.org/wiki/Deutsche_Parkinson_Vereinigung', 'Deutsche Parkinson Vereinigung: Organisationsprofil', date '2024-12-31'),
    ('patient-herzstiftung', 107633, 'https://www.lobbyregister.bundestag.de/suche/R001258', 'Lobbyregister Bundestag: Deutsche Herzstiftung, Mitglieder am 17.06.2024', date '2024-06-17'),
    ('patient-daab', 18100, 'https://www.rehadat-adressen.de/adressen/behinderung-erkrankung/allergie-und-atemwegserkrankung/index.html?filter=%28art_adr%3A%28%22Allergie%2FAsthma%2FBundesverband%22%29%29+AND+doc_type%3AADR&listtitle=Allergie+%26+Asthma+-+Bundesverb%C3%A4nde&mode=detail&page=3&query=%28%22Allergie%2FAsthma%2FBundesverband%22%29&reloaded=&sort=sort_name1_adr+asc', 'REHADAT-Adressen: Deutscher Allergie- und Asthmabund', null::date),
    ('patient-psoriasis-bund', 3739, 'https://www.lobbyregister.bundestag.de/suche/R002639', 'Lobbyregister Bundestag: Deutscher Psoriasis Bund, Mitglieder am 16.06.2025', date '2025-06-16'),
    ('patient-frauenselbsthilfe-krebs', 750, 'https://www.nakos.de/adressen/gruen/kennzeichnung/SHO-Steckbriefe/key%4010541', 'NAKOS: SHO-Steckbrief Frauenselbsthilfe Krebs', null::date),
    ('patient-prostatakrebs-bps', 180, 'https://prostatakrebs-bps.de/geschichte-des-bps/', 'BPS: Geschichte des BPS', null::date),
    ('patient-ilco', 6000, 'https://hausderkrebsselbsthilfe.de/mitgliedsverband/deutsche-ilco-e-v-selbsthilfe-bei-darmkrebs-und-stoma/', 'Haus der Krebs-Selbsthilfe: Deutsche ILCO', null::date),
    ('patient-haus-der-krebs-selbsthilfe', 12, 'https://hausderkrebsselbsthilfe.de/wer-wir-sind/bundesverband/', 'Haus der Krebs-Selbsthilfe: Bundesverband', null::date),
    ('patient-dlh', 246, 'https://www.lobbyregister.bundestag.de/suche/R006506', 'Lobbyregister Bundestag: DLH, Mitglieder am 31.12.2024', date '2024-12-31'),
    ('patient-schilddruesenkrebs', 845, 'https://de.wikipedia.org/wiki/Bundesverband_Schilddr%C3%BCsenkrebs', 'Bundesverband Schilddrüsenkrebs: Organisationsprofil', date '2023-12-31'),
    ('patient-mukoviszidose', 5810, 'https://www.lobbyregister.bundestag.de/suche/R001032', 'Lobbyregister Bundestag: Mukoviszidose e.V., Mitglieder am 31.12.2025', date '2025-12-31'),
    ('patient-kindernetzwerk', 844, 'https://www.lobbyregister.bundestag.de/suche/R000194', 'Lobbyregister Bundestag: Kindernetzwerk, Mitglieder am 16.03.2026', date '2026-03-16'),
    ('patient-bvhk', 29, 'https://www.dzi.de/organisation/bundesverband-herzkranke-kinder-e-v/', 'DZI: Bundesverband Herzkranke Kinder', null::date),
    ('patient-epilepsievereinigung', 1000, 'https://www.pharmazeutische-zeitung.de/2016-07/epilepsie-tagung-raus-aus-der-stigmatisierung/', 'Pharmazeutische Zeitung: Epilepsie-Tagung 2016', null::date),
    ('patient-depressionsliga', 2458, 'https://www.lobbyregister.bundestag.de/suche/R006194', 'Lobbyregister Bundestag: Deutsche DepressionsLiga', null::date),
    ('patient-autismus-deutschland', 55, 'https://www.autismus.de/', 'autismus Deutschland: Startseite', null::date),
    ('patient-adhs-deutschland', 200, 'https://adhs-deutschland.de/herzlich-willkommen-beim-internetauftritt-des-adhs-deutschland-ev', 'ADHS Deutschland: Startseite', null::date),
    ('patient-blasenkrebs-shb', 850, 'https://selbsthilfe.app/alle-mitgliedsorganisationen/organisation/selbsthilfe-bund-blasenkrebs-e-v', 'Selbsthilfe.app: Selbsthilfe-Bund Blasenkrebs', null::date)
)
update public.stakeholder_organizations as org
set member_count = counts.member_count,
    member_count_source_url = counts.member_count_source_url,
    member_count_source_label = counts.member_count_source_label,
    member_count_updated_at = counts.member_count_updated_at
from patient_member_counts as counts
where org.id = counts.id;
