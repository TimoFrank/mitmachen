insert into public.stakeholder_types (id, label, description, sort_order, status)
values (
  'patient-associations',
  'Patientenverbände',
  'Patientenorganisationen und Patientenvertretungen als Stakeholder-Bereich.',
  30,
  'active'
)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

with patient_contact_expansion (
  id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  phone,
  email,
  notes,
  source
) as (
  values
    ('patient-diabetesde', 'diabetesDE - Deutsche Diabetes-Hilfe e.V.', 'diabetesde - deutsche diabetes-hilfe e.v.', 'Krankheitsbezogene Patientenvertretung', '10117', 'Berlin', 'Berlin', 'https://www.diabetesde.org', '030 20167712', 'info@diabetesde.org', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles diabetesDE-Impressum'),
    ('patient-parkinson-vereinigung', 'Deutsche Parkinson Vereinigung e.V. (dPV)', 'deutsche parkinson vereinigung e.v. (dpv)', 'Krankheitsbezogene Selbsthilfevertretung', '41464', 'Neuss', 'Nordrhein-Westfalen', 'https://www.dpv-bundesverband.de', '02131 740270', null, 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielle dPV-Website'),
    ('patient-herzstiftung', 'Deutsche Herzstiftung e.V.', 'deutsche herzstiftung e.v.', 'Patientenorganisation/Patienteninformation', '60323', 'Frankfurt am Main', 'Hessen', 'https://herzstiftung.de', '069 955128-0', 'info@herzstiftung.de', 'Bundesweit sichtbare Patientenorganisation und Informationsanbieterin im Bereich Herz-Kreislauf-Erkrankungen.', 'Offizielles Herzstiftung-Impressum'),
    ('patient-daab', 'Deutscher Allergie- und Asthmabund e.V. (DAAB)', 'deutscher allergie- und asthmabund e.v. (daab)', 'Krankheitsbezogene Patientenvertretung', '41238', 'Mönchengladbach', 'Nordrhein-Westfalen', 'https://www.daab.de', '02166 6478820', 'info@daab.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles DAAB-Impressum'),
    ('patient-psoriasis-bund', 'Deutscher Psoriasis Bund e.V. (DPB)', 'deutscher psoriasis bund e.v. (dpb)', 'Krankheitsbezogene Selbsthilfevertretung', '20459', 'Hamburg', 'Hamburg', 'https://www.psoriasis-bund.de', '040 223399-0', 'info@psoriasis-bund.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles DPB-Impressum'),
    ('patient-frauenselbsthilfe-krebs', 'Frauenselbsthilfe Krebs - Bundesverband e.V.', 'frauenselbsthilfe krebs - bundesverband e.v.', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.frauenselbsthilfe.de', '0228 338894-00', 'kontakt@frauenselbsthilfe.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles FSH-Impressum'),
    ('patient-prostatakrebs-bps', 'Bundesverband Prostatakrebs Selbsthilfe e.V. (BPS)', 'bundesverband prostatakrebs selbsthilfe e.v. (bps)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://prostatakrebs-bps.de', '0228 33889-500', 'info@prostatakrebs-bps.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles BPS-Impressum'),
    ('patient-ilco', 'Deutsche ILCO e.V.', 'deutsche ilco e.v.', 'Krebs-/Stoma-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.ilco.de', '0228 33889450', 'info@ilco.de', 'Selbsthilfevereinigung für Stomaträgerinnen und Stomaträger sowie Menschen mit Darmkrebs und ihre Angehörigen.', 'Haus der Krebs-Selbsthilfe; offizielle ILCO-Website'),
    ('patient-haus-der-krebs-selbsthilfe', 'Haus der Krebs-Selbsthilfe - Bundesverband e.V.', 'haus der krebs-selbsthilfe - bundesverband e.v.', 'Krebs-Selbsthilfe-Dachverband', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://hausderkrebsselbsthilfe.de', '0228 33889-540', 'info@hausderkrebsselbsthilfe.de', 'Dachstruktur mehrerer bundesweiter Krebs-Selbsthilfeorganisationen.', 'Offizielles HKSH-Impressum'),
    ('patient-dlh', 'Deutsche Leukämie- & Lymphom-Hilfe e.V. (DLH)', 'deutsche leukämie- & lymphom-hilfe e.v. (dlh)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.leukaemie-hilfe.de', '0228 33889200', 'info@leukaemie-hilfe.de', 'Bundesverband der Selbsthilfeorganisationen für Erwachsene mit Leukämien und Lymphomen.', 'Offizielles DLH-Impressum'),
    ('patient-schilddruesenkrebs', 'Bundesverband Schilddrüsenkrebs - Ohne Schilddrüse leben e.V.', 'bundesverband schilddrüsenkrebs - ohne schilddrüse leben e.v.', 'Krebs-Selbsthilfevertretung', '10179', 'Berlin', 'Berlin', 'https://www.sd-krebs.de', '030 27581146', 'info@sd-krebs.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Haus der Krebs-Selbsthilfe; offizielle Verbandsangaben'),
    ('patient-mukoviszidose', 'Mukoviszidose e.V. - Bundesverband Cystische Fibrose (CF)', 'mukoviszidose e.v. - bundesverband cystische fibrose (cf)', 'Krankheitsbezogene Selbsthilfevertretung', '53117', 'Bonn', 'Nordrhein-Westfalen', 'https://www.muko.info', '0228 98780-0', 'info@muko.info', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles Mukoviszidose-Impressum'),
    ('patient-kindernetzwerk', 'Kindernetzwerk e.V.', 'kindernetzwerk e.v.', 'Patienten-/Angehörigen-Dachverband', '63741', 'Aschaffenburg', 'Bayern', 'https://www.kindernetzwerk.de', '06021 454400', 'info@kindernetzwerk.de', 'Dachverband der Selbsthilfe von Familien mit Kindern und jungen Erwachsenen mit chronischen Erkrankungen und Behinderungen.', 'Offizielles Kindernetzwerk-Impressum'),
    ('patient-bvhk', 'Bundesverband Herzkranke Kinder e.V. (BVHK)', 'bundesverband herzkranke kinder e.v. (bvhk)', 'Patienten-/Angehörigenverband', '52074', 'Aachen', 'Nordrhein-Westfalen', 'https://bvhk.de', '0241 912332', 'info@bvhk.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles BVHK-Impressum'),
    ('patient-epilepsievereinigung', 'Deutsche Epilepsievereinigung e.V.', 'deutsche epilepsievereinigung e.v.', 'Krankheitsbezogene Selbsthilfevertretung', '10585', 'Berlin', 'Berlin', 'https://www.epilepsie-vereinigung.de', '030 3424414', null, 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizieller Epilepsievereinigung-Kontakt'),
    ('patient-depressionsliga', 'Deutsche DepressionsLiga e.V.', 'deutsche depressionsliga e.v.', 'Krankheitsbezogene Patientenvertretung', '53119', 'Bonn', 'Nordrhein-Westfalen', 'https://depressionsliga.de', '0228 24065772', 'kontakt@depressionsliga.de', 'Bundesweite Betroffenenorganisation für Menschen mit Depression und Angehörige.', 'Offizielles DepressionsLiga-Impressum'),
    ('patient-autismus-deutschland', 'autismus Deutschland e.V.', 'autismus deutschland e.v.', 'Patienten-/Angehörigenverband', '20148', 'Hamburg', 'Hamburg', 'https://www.autismus.de', '040 5115604', 'info@autismus.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles autismus.de-Impressum'),
    ('patient-adhs-deutschland', 'ADHS Deutschland e.V.', 'adhs deutschland e.v.', 'Krankheitsbezogene Selbsthilfevertretung', '13629', 'Berlin', 'Berlin', 'https://adhs-deutschland.de', null, 'info@adhs-deutschland.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles ADHS-Deutschland-Impressum'),
    ('patient-sarkom-stiftung', 'Deutsche Sarkom-Stiftung', 'deutsche sarkom-stiftung', 'Patienten-/Expertenorganisation', '61200', 'Wölfersheim', 'Hessen', 'https://www.sarkome.de', '0700 48840700', null, 'Gemeinsame Organisation von Patientinnen, Patienten und Expertinnen/Experten zur Verbesserung der Sarkomversorgung.', 'Offizielles Sarkom-Stiftung-Impressum'),
    ('patient-blasenkrebs-shb', 'Selbsthilfe-Bund Blasenkrebs e.V. (ShB)', 'selbsthilfe-bund blasenkrebs e.v. (shb)', 'Krebs-Selbsthilfevertretung', '53111', 'Bonn', 'Nordrhein-Westfalen', 'https://www.blasenkrebs-shb.de', '0228 33889152', 'info@blasenkrebs-shb.de', 'Bundesweit kontaktierbarer Patienten- oder Selbsthilfeverband zur Erweiterung der CRM-Kontaktbasis.', 'Offizielles ShB-Impressum')
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  phone,
  email,
  notes,
  source,
  status
)
select
  patient_contact_expansion.id,
  'patient-associations',
  patient_contact_expansion.name,
  patient_contact_expansion.normalized_name,
  patient_contact_expansion.organization_type,
  patient_contact_expansion.postal_code,
  patient_contact_expansion.city,
  patient_contact_expansion.federal_state,
  patient_contact_expansion.website,
  patient_contact_expansion.phone,
  patient_contact_expansion.email,
  patient_contact_expansion.notes,
  patient_contact_expansion.source,
  'active'
from patient_contact_expansion
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    website = excluded.website,
    phone = excluded.phone,
    email = excluded.email,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;
