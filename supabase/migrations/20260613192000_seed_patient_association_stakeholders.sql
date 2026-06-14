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
  postal_code,
  city,
  federal_state,
  website,
  notes,
  source
) as (
  values
    (
      'patient-dbr',
      'Deutscher Behindertenrat (DBR)',
      'deutscher behindertenrat (dbr)',
      '12107',
      'Berlin',
      'Berlin',
      'https://www.deutscher-behindertenrat.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller DBR-Kontakt'
    ),
    (
      'patient-bagp',
      'BundesArbeitsGemeinschaft der PatientInnenstellen (BAGP)',
      'bundesarbeitsgemeinschaft der patientinnenstellen (bagp)',
      '80339',
      'München',
      'Bayern',
      'https://bagp.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller BAGP-Kontakt'
    ),
    (
      'patient-dag-shg',
      'Deutsche Arbeitsgemeinschaft Selbsthilfegruppen e.V. (DAG SHG)',
      'deutsche arbeitsgemeinschaft selbsthilfegruppen e.v. (dag shg)',
      '10585',
      'Berlin',
      'Berlin',
      'https://www.dag-shg.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizieller DAG-SHG-Kontakt'
    ),
    (
      'patient-vzbv',
      'Verbraucherzentrale Bundesverband e.V. (vzbv)',
      'verbraucherzentrale bundesverband e.v. (vzbv)',
      '10969',
      'Berlin',
      'Berlin',
      'https://www.vzbv.de',
      'Anerkannte maßgebliche Patientenorganisation nach § 140f SGB V/Patientenbeteiligungsverordnung; berechtigt zur Benennung von Patientenvertreterinnen und Patientenvertretern im G-BA.',
      'G-BA Patientenvertretung; offizielles vzbv-Impressum'
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
  'Maßgebliche Patientenorganisation',
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
