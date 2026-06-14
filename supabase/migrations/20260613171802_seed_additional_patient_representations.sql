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

with patient_organizations (
  id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source
) as (
  values
    (
      'patient-bag-selbsthilfe',
      'Bundesarbeitsgemeinschaft Selbsthilfe von Menschen mit Behinderung, chronischer Erkrankung und ihren Angehörigen e.V. (BAG SELBSTHILFE)',
      'bundesarbeitsgemeinschaft selbsthilfe von menschen mit behinderung, chronischer erkrankung und ihren angehörigen e.v. (bag selbsthilfe)',
      'Selbsthilfe-Dachverband',
      '40215',
      'Düsseldorf',
      'Nordrhein-Westfalen',
      'https://www.bag-selbsthilfe.de',
      'Koordinierungsstelle der maßgeblichen Patientenorganisationen im G-BA und Dachverband der Selbsthilfe chronisch kranker und behinderter Menschen.',
      'BAG SELBSTHILFE; DBR-Mitgliederliste'
    ),
    (
      'patient-sovd',
      'Sozialverband Deutschland e.V. (SoVD)',
      'sozialverband deutschland e.v. (sovd)',
      'Sozialverband/Patientenvertretung',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.sovd.de',
      'Entsendet Patientinnen und Patientenvertreter in den G-BA über den Deutschen Behindertenrat.',
      'SoVD Patientenvertretungsseite; DBR-Mitgliederliste'
    ),
    (
      'patient-vdk',
      'Sozialverband VdK Deutschland e.V.',
      'sozialverband vdk deutschland e.v.',
      'Sozialverband/Patientenvertretung',
      '53175',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.vdk.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; BMAS-Liste anerkannter Verbände'
    ),
    (
      'patient-isl',
      'Interessenvertretung Selbstbestimmt Leben in Deutschland e.V. (ISL)',
      'interessenvertretung selbstbestimmt leben in deutschland e.v. (isl)',
      'Selbstvertretungsverband',
      '10117',
      'Berlin',
      'Berlin',
      'https://www.isl-ev.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; BMAS-Liste anerkannter Verbände'
    ),
    (
      'patient-abid',
      'Allgemeiner Behindertenverband in Deutschland e.V. (ABiD)',
      'allgemeiner behindertenverband in deutschland e.v. (abid)',
      'Selbstvertretungsverband',
      '10117',
      'Berlin',
      'Berlin',
      'https://www.abid-ev.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizieller ABiD-Kontakt'
    ),
    (
      'patient-lebenshilfe',
      'Bundesvereinigung Lebenshilfe e.V.',
      'bundesvereinigung lebenshilfe e.v.',
      'Selbsthilfe-/Behindertenverband',
      '35043',
      'Marburg',
      'Hessen',
      'https://www.lebenshilfe.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles Lebenshilfe-Impressum'
    ),
    (
      'patient-achse',
      'Allianz Chronischer Seltener Erkrankungen e.V. (ACHSE)',
      'allianz chronischer seltener erkrankungen e.v. (achse)',
      'Patienten-/Selbsthilfe-Dachverband',
      '13359',
      'Berlin',
      'Berlin',
      'https://www.achse-online.de',
      'Dachverband und Netzwerk für Menschen mit seltenen chronischen Erkrankungen und ihre Angehörigen.',
      'DBR-Mitgliederliste; offizieller ACHSE-Kontakt'
    ),
    (
      'patient-deutsche-alzheimer-gesellschaft',
      'Deutsche Alzheimer Gesellschaft e.V. Selbsthilfe Demenz',
      'deutsche alzheimer gesellschaft e.v. selbsthilfe demenz',
      'Krankheitsbezogene Selbsthilfevertretung',
      '10787',
      'Berlin',
      'Berlin',
      'https://www.deutsche-alzheimer.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'BMAS-Liste anerkannter Verbände; offizielles Impressum'
    ),
    (
      'patient-rheuma-liga',
      'Deutsche Rheuma-Liga Bundesverband e.V.',
      'deutsche rheuma-liga bundesverband e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '53111',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.rheuma-liga.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'BMAS-Liste anerkannter Verbände; offizieller Kontakt'
    ),
    (
      'patient-dmsg',
      'Deutsche Multiple Sklerose Gesellschaft, Bundesverband e.V. (DMSG)',
      'deutsche multiple sklerose gesellschaft, bundesverband e.v. (dmsg)',
      'Krankheitsbezogene Selbsthilfevertretung',
      '30171',
      'Hannover',
      'Niedersachsen',
      'https://www.dmsg.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles DMSG-Impressum'
    ),
    (
      'patient-dccv',
      'Deutsche Morbus Crohn / Colitis ulcerosa Vereinigung - DCCV - e.V.',
      'deutsche morbus crohn / colitis ulcerosa vereinigung - dccv - e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.dccv.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizielles DCCV-Impressum'
    ),
    (
      'patient-pro-retina',
      'PRO RETINA Deutschland e.V.',
      'pro retina deutschland e.v.',
      'Krankheitsbezogene Selbsthilfevertretung',
      '53115',
      'Bonn',
      'Nordrhein-Westfalen',
      'https://www.pro-retina.de',
      'Weitere bundesweit relevante Patienten-, Selbsthilfe- oder Patientenvertretungsorganisation; nicht als maßgebliche Patientenorganisation nach § 140f SGB V erfasst.',
      'DBR-Mitgliederliste; offizieller PRO-RETINA-Kontakt'
    ),
    (
      'patient-upd',
      'Stiftung Unabhängige Patientenberatung Deutschland (UPD)',
      'stiftung unabhängige patientenberatung deutschland (upd)',
      'Unabhängige Patientenberatung',
      '12161',
      'Berlin',
      'Berlin',
      'https://patientenberatung.de',
      'Gemeinnützige Stiftung zur unabhängigen Beratung in gesundheitlichen und gesundheitsrechtlichen Fragen.',
      'Offizielles UPD-Impressum'
    ),
    (
      'patient-aps',
      'Aktionsbündnis Patientensicherheit e.V. (APS)',
      'aktionsbündnis patientensicherheit e.v. (aps)',
      'Patientensicherheitsnetzwerk',
      '10179',
      'Berlin',
      'Berlin',
      'https://www.aps-ev.de',
      'Bundesweit relevantes Netzwerk für Patientensicherheit mit patientenorientierten Informationen und Empfehlungen.',
      'Offizielles APS-Impressum'
    ),
    (
      'patient-bpik',
      'Bundesverband Patientenfürsprecher in Krankenhäusern e.V. (BPiK)',
      'bundesverband patientenfürsprecher in krankenhäusern e.v. (bpik)',
      'Patientenfürsprache',
      '45147',
      'Essen',
      'Nordrhein-Westfalen',
      'https://bpik.de',
      'Bundesverband der Patientenfürsprecherinnen und Patientenfürsprecher in Krankenhäusern.',
      'Offizielle BPiK-Website'
    )
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
  notes,
  source,
  status
)
select
  patient_organizations.id,
  'patient-associations',
  patient_organizations.name,
  patient_organizations.normalized_name,
  patient_organizations.organization_type,
  patient_organizations.postal_code,
  patient_organizations.city,
  patient_organizations.federal_state,
  patient_organizations.website,
  patient_organizations.notes,
  patient_organizations.source,
  'active'
from patient_organizations
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    website = excluded.website,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;
