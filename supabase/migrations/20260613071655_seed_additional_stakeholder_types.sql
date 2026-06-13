insert into public.stakeholder_types (id, label, description, sort_order, status)
values
  (
    'health-insurance',
    'Krankenkassen',
    'Gesetzliche und weitere Krankenkassen als Stakeholder-Bereich.',
    20,
    'active'
  ),
  (
    'patient-associations',
    'Patientenverbände',
    'Patientenorganisationen und Patientenvertretungen als Stakeholder-Bereich.',
    30,
    'active'
  ),
  (
    'hospital-associations',
    'Krankenhausgesellschaften',
    'Bundes- und Landeskrankenhausgesellschaften als Stakeholder-Bereich.',
    40,
    'active'
  ),
  (
    'physician-associations',
    'Ärztliche Berufsverbände',
    'Ärztliche Berufs- und Fachverbände als Stakeholder-Bereich.',
    50,
    'active'
  )
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;
