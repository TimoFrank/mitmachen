begin;

create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  roadmap_version text not null default 'OneRoadmap Q2/2026',
  source_url text,
  product_area text not null,
  product_name text not null,
  feature_name text not null,
  phase text,
  roadmap_status text not null default 'Unklar' check (roadmap_status in ('In Bearbeitung', 'In Planung', 'Offen', 'Im Backlog', 'Unklar')),
  timeline_label text,
  deadline_type text not null default 'Unklar' check (deadline_type in ('SGB V', 'EHDS', 'gematik Planung', 'Backlog', 'Technische Abhängigkeit', 'Keine Frist', 'Unklar')),
  legal_basis text,
  user_groups text[] not null default '{}'::text[],
  primary_systems text[] not null default '{}'::text[],
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.hospitation_roadmap_assessments (
  id uuid primary key default gen_random_uuid(),
  hospitation_id uuid not null references public.hospitations(id) on delete cascade,
  roadmap_item_id uuid not null references public.roadmap_items(id) on delete restrict,
  respondent_role text,
  respondent_sector text,
  care_relevance integer check (care_relevance between 1 and 5),
  patient_safety integer check (patient_safety between 1 and 5),
  process_relief integer check (process_relief between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  adoption_likelihood integer check (adoption_likelihood between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  comparison_role text not null default 'none' check (comparison_role in ('none', 'top_priority', 'low_priority')),
  evidence_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (hospitation_id, roadmap_item_id)
);

create table if not exists public.hospitation_unmet_needs (
  id uuid primary key default gen_random_uuid(),
  hospitation_id uuid not null references public.hospitations(id) on delete cascade,
  related_roadmap_item_id uuid references public.roadmap_items(id) on delete set null,
  title text not null,
  problem text,
  affected_role text,
  affected_sector text,
  classification text not null default 'new_backlog_item' check (classification in ('existing_item_extension', 'new_backlog_item', 'legal_clarification', 'organizational_implementation', 'local_system_issue', 'communication_or_training')),
  expected_benefit integer check (expected_benefit between 1 and 5),
  urgency integer check (urgency between 1 and 5),
  implementation_feasibility integer check (implementation_feasibility between 1 and 5),
  confidence_score integer check (confidence_score between 1 and 5),
  current_workaround text,
  next_step text,
  status text not null default 'Neu' check (status in ('Neu', 'In Prüfung', 'Übernommen', 'Zurückgestellt', 'Erledigt', 'Archiviert')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create index if not exists roadmap_items_active_idx on public.roadmap_items(active);
create index if not exists roadmap_items_product_area_idx on public.roadmap_items(product_area);
create index if not exists roadmap_items_status_idx on public.roadmap_items(roadmap_status);
create index if not exists roadmap_items_deadline_type_idx on public.roadmap_items(deadline_type);
create index if not exists roadmap_items_created_by_idx on public.roadmap_items(created_by);
create index if not exists roadmap_items_updated_by_idx on public.roadmap_items(updated_by);
create index if not exists hospitation_roadmap_assessments_hospitation_idx on public.hospitation_roadmap_assessments(hospitation_id);
create index if not exists hospitation_roadmap_assessments_item_idx on public.hospitation_roadmap_assessments(roadmap_item_id);
create index if not exists hospitation_roadmap_assessments_role_idx on public.hospitation_roadmap_assessments(respondent_role);
create index if not exists hospitation_roadmap_assessments_created_by_idx on public.hospitation_roadmap_assessments(created_by);
create index if not exists hospitation_roadmap_assessments_updated_by_idx on public.hospitation_roadmap_assessments(updated_by);
create index if not exists hospitation_unmet_needs_hospitation_idx on public.hospitation_unmet_needs(hospitation_id);
create index if not exists hospitation_unmet_needs_item_idx on public.hospitation_unmet_needs(related_roadmap_item_id);
create index if not exists hospitation_unmet_needs_status_idx on public.hospitation_unmet_needs(status);
create index if not exists hospitation_unmet_needs_classification_idx on public.hospitation_unmet_needs(classification);
create index if not exists hospitation_unmet_needs_created_by_idx on public.hospitation_unmet_needs(created_by);
create index if not exists hospitation_unmet_needs_updated_by_idx on public.hospitation_unmet_needs(updated_by);

drop trigger if exists roadmap_items_touch_updated_at on public.roadmap_items;
create trigger roadmap_items_touch_updated_at
before update on public.roadmap_items
for each row execute function public.touch_updated_at();

drop trigger if exists hospitation_roadmap_assessments_touch_updated_at on public.hospitation_roadmap_assessments;
create trigger hospitation_roadmap_assessments_touch_updated_at
before update on public.hospitation_roadmap_assessments
for each row execute function public.touch_updated_at();

drop trigger if exists hospitation_unmet_needs_touch_updated_at on public.hospitation_unmet_needs;
create trigger hospitation_unmet_needs_touch_updated_at
before update on public.hospitation_unmet_needs
for each row execute function public.touch_updated_at();

alter table public.roadmap_items enable row level security;
alter table public.hospitation_roadmap_assessments enable row level security;
alter table public.hospitation_unmet_needs enable row level security;

grant select on public.roadmap_items to authenticated;
grant select, insert, update, delete on public.hospitation_roadmap_assessments to authenticated;
grant select, insert, update, delete on public.hospitation_unmet_needs to authenticated;

grant select, insert, update, delete on public.roadmap_items to service_role;
grant select, insert, update, delete on public.hospitation_roadmap_assessments to service_role;
grant select, insert, update, delete on public.hospitation_unmet_needs to service_role;

drop policy if exists "roadmap items authenticated read active" on public.roadmap_items;
create policy "roadmap items authenticated read active"
on public.roadmap_items for select
to authenticated
using (active or (select public.current_profile_role()) = 'admin');

drop policy if exists "roadmap assessments authenticated read" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments authenticated read"
on public.hospitation_roadmap_assessments for select
to authenticated
using (true);

drop policy if exists "roadmap assessments editor admin insert" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin insert"
on public.hospitation_roadmap_assessments for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "roadmap assessments editor admin update" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin update"
on public.hospitation_roadmap_assessments for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "roadmap assessments editor admin delete" on public.hospitation_roadmap_assessments;
create policy "roadmap assessments editor admin delete"
on public.hospitation_roadmap_assessments for delete
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "unmet needs authenticated read" on public.hospitation_unmet_needs;
create policy "unmet needs authenticated read"
on public.hospitation_unmet_needs for select
to authenticated
using (status <> 'Archiviert' or (select public.current_profile_role()) = 'admin');

drop policy if exists "unmet needs editor admin insert" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin insert"
on public.hospitation_unmet_needs for insert
to authenticated
with check (
  (select public.current_profile_role()) in ('editor', 'admin')
  and status <> 'Archiviert'
  and (created_by is null or created_by = (select auth.uid()))
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists "unmet needs editor admin update" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin update"
on public.hospitation_unmet_needs for update
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'))
with check ((select public.current_profile_role()) in ('editor', 'admin'));

drop policy if exists "unmet needs editor admin delete" on public.hospitation_unmet_needs;
create policy "unmet needs editor admin delete"
on public.hospitation_unmet_needs for delete
to authenticated
using ((select public.current_profile_role()) in ('editor', 'admin'));

insert into public.roadmap_items (
  slug,
  roadmap_version,
  source_url,
  product_area,
  product_name,
  feature_name,
  phase,
  roadmap_status,
  timeline_label,
  deadline_type,
  legal_basis,
  user_groups,
  primary_systems,
  description,
  sort_order
) values
  (
    'epa-3-1-3-teil-1',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'Elektronische Patientenakte',
    'ePA 3.1.3 - Teil 1',
    'Zulassung',
    'In Bearbeitung',
    '2026/2027',
    'SGB V',
    '§ 342 SGB V',
    array['Versicherte', 'Versorger', 'Kostenträger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Fortentwicklung digitaler Medikationsprozess, Push-Notifications, Metadaten und Patient-Service.',
    10
  ),
  (
    'epa-laborprozess-entlassbericht',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'Elektronische Patientenakte',
    'ePA 27 - Laborprozess',
    'Konzeption',
    'In Bearbeitung',
    '2026 bis 2028',
    'EHDS',
    'EHDS, § 342 SGB V',
    array['Versicherte', 'Versorger', 'Krankenhäuser', 'Labore'],
    array['PVS', 'KIS', 'PSW', 'FdV'],
    'Laborprozess sowie Arzt- und Entlassbericht als strukturierte ePA-Weiterentwicklung.',
    20
  ),
  (
    'erp-haeusliche-krankenpflege',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'E-Rezept',
    'eRp 27.2 - Häusliche Krankenpflege',
    'Spezifikation',
    'In Bearbeitung',
    '2027',
    'SGB V',
    '§ 360 SGB V',
    array['Versicherte', 'Pflege', 'Privatarztpraxen', 'Kostenträger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Elektronische Verordnung haeuslicher Krankenpflege und Anpassungen an Fachdienst und App.',
    30
  ),
  (
    'erp-ebtm',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'E-Rezept',
    'eRp 27.3 - eBTM',
    'Discovery',
    'In Planung',
    '2027',
    'SGB V',
    '§ 360 SGB V',
    array['Apotheken', 'Privatarztpraxen', 'Versicherte', 'BfArM', 'Kostenträger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Elektronisches Verordnen und Einloesen von BTM-Rezepten.',
    40
  ),
  (
    'erp-heilmittel',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'E-Rezept',
    'eRp 27.4 - Verordnung von Heilmitteln',
    'Discovery',
    'In Planung',
    '2027',
    'SGB V',
    '§ 360 SGB V',
    array['Heilmittelerbringung', 'Privatarztpraxen', 'Versicherte', 'Kostenträger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Elektronische Verordnung von Heilmitteln.',
    50
  ),
  (
    'erp-hilfsmittel-backlog',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'E-Rezept',
    'E-Rezept Backlog - Hilfsmittel und weitere nach §360 Abs. 7',
    'Backlog',
    'Im Backlog',
    '2027+',
    'SGB V',
    '§ 360 SGB V',
    array['Sanitätshäuser', 'Homecare', 'Versicherte', 'Privatarztpraxen', 'Kostenträger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Backlog-Thema fuer Hilfsmittel und weitere elektronische Verordnungen nach § 360 Abs. 7 SGB V.',
    60
  ),
  (
    'epa-impfpass-backlog',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'Elektronische Patientenakte',
    'ePA Backlog - Impfpass (FHIR)',
    'Backlog',
    'Im Backlog',
    'offen',
    'Backlog',
    'Roadmap-Backlog',
    array['Versicherte', 'Arztpraxen', 'Kostenträger'],
    array['PVS', 'KIS', 'FdV'],
    'Digitaler Impfpass als FHIR-basiertes ePA-Backlog-Thema.',
    70
  ),
  (
    'tim-pro-automation-bots',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'TI-Messenger',
    'TI-M Pro 1.1 - Technische Enabler Automation & Bots',
    'Spezifikation',
    'In Bearbeitung',
    '2026',
    'gematik Planung',
    'OneRoadmap Q2/2026',
    array['Versorger', 'Kostenträger'],
    array['PVS', 'KIS'],
    'Technische Enabler fuer Headless-/Embedded-Clients, strukturierte Daten und Consent Management.',
    80
  ),
  (
    'kim-1-6-fhir-vzd',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'KIM',
    'KIM 1.6 - KIM mit FHIR-VZD',
    'Konzeption',
    'In Bearbeitung',
    '2026/2027',
    'gematik Planung',
    'OneRoadmap Q2/2026',
    array['Versorger', 'Kostenträger'],
    array['PVS', 'KIS'],
    'Anbindung des FHIR-Verzeichnisdiensts an KIM.',
    90
  ),
  (
    'vsdm-2-online-stammdatenabruf',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'VSDM',
    'VSDM 2.0 - Online-Stammdatenabruf und Prüfung Versicherungsverhältnis',
    'Entwicklung',
    'In Bearbeitung',
    '2026',
    'SGB V',
    '§ 291b SGB V',
    array['Versorger', 'Kostenträger', 'Versicherte'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Online-Abruf und Pruefung von Versichertenstammdaten als Nachfolgepfad zur eGK-Aktualisierung.',
    100
  ),
  (
    'dipag-1-digitale-patientenrechnung',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Anwendungen',
    'Digitale Patientenrechnung',
    'DiPag 1.0 - Digitale Patientenrechnung',
    'Entwicklung',
    'In Bearbeitung',
    '2026/2027',
    'gematik Planung',
    'OneRoadmap Q2/2026',
    array['Versicherte', 'Privatarztpraxen', 'Privatzahnarztpraxen', 'Krankenhäuser', 'PKV'],
    array['PVS'],
    'Digitale Rechnungsuebermittlung, Verwaltung und Einreichung medizinischer Rechnungen.',
    110
  ),
  (
    'popp-1-egk-lokal',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Basic Infrastructure',
    'Smartcards / PoPP',
    'PoPP 1.0 - eGK lokal',
    'Entwicklung',
    'In Bearbeitung',
    '2026',
    'Technische Abhängigkeit',
    'OneRoadmap Q2/2026',
    array['Versicherte', 'Versorger'],
    array['PVS', 'KIS', 'AVS', 'ZPVS', 'PSW', 'FdV'],
    'Kryptografisch gesicherter Nachweis des Versorgungskontexts fuer Vor-Ort-Behandlung und Hausbesuch.',
    120
  ),
  (
    'zeta-1-zero-trust-access',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'ART Basic Infrastructure',
    'Zero Trust Infrastructure',
    'ZETA 1.0 - Zero Trust Access Stufe 1',
    'Entwicklung',
    'In Bearbeitung',
    '2026',
    'Technische Abhängigkeit',
    'OneRoadmap Q2/2026',
    array['Versorger', 'Leistungserbringerinstitutionen'],
    array['PVS', 'KIS'],
    'Zero-Trust-Zugang zur TI 2.0 fuer stationaere Nutzung durch Leistungserbringer und Institutionen.',
    130
  ),
  (
    'isik-6',
    'OneRoadmap Q2/2026',
    'https://fachportal.gematik.de/fileadmin/Fachportal/Roadmap/Q2-2026/OneRoadmap_26Q2_FP_Filterversion_01.xlsx',
    'Technische Standards',
    'ISiK',
    'ISiK 6 - ISiK Stufe 6',
    'Spezifikation',
    'In Bearbeitung',
    '2026/2027',
    'gematik Planung',
    'OneRoadmap Q2/2026',
    array['Krankenhäuser', 'Versorger', 'Hersteller'],
    array['KIS'],
    'Weiterentwicklung der Bestandsmodule und Use Case zur Transplantationsmedizin.',
    140
  )
on conflict (slug) do update
set
  roadmap_version = excluded.roadmap_version,
  source_url = excluded.source_url,
  product_area = excluded.product_area,
  product_name = excluded.product_name,
  feature_name = excluded.feature_name,
  phase = excluded.phase,
  roadmap_status = excluded.roadmap_status,
  timeline_label = excluded.timeline_label,
  deadline_type = excluded.deadline_type,
  legal_basis = excluded.legal_basis,
  user_groups = excluded.user_groups,
  primary_systems = excluded.primary_systems,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

commit;
