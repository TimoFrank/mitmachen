begin;

with hospitation_contact_matches (
  hospitation_id,
  contact_id
) as (
  values
    ('8f103685-86b2-198a-f3ee-59a21aaf1c59'::uuid, 'contact-025'),
    ('20f864c5-2742-c576-4a9d-8b2dad3e69ee'::uuid, 'contact-030'),
    ('a5543c5a-7cd6-d039-57a3-484823bcfdd2'::uuid, 'contact-035'),
    ('332ed35e-7faa-8846-71c9-ed449e05108b'::uuid, 'contact-021'),
    ('9e297e7f-776d-2acb-96b6-f4289bc1d8dd'::uuid, 'contact-031'),
    ('d0bd85d7-0d52-3a94-2f76-a23a96e6e90f'::uuid, 'contact-106')
),
matched_contacts as (
  select
    matches.hospitation_id,
    contacts.id as contact_id,
    contacts.name as contact_name,
    contacts.organization_id,
    contacts.organization as contact_organization_name,
    organizations.name as organization_record_name,
    contacts.sector,
    contacts.city,
    contacts.federal_state
  from hospitation_contact_matches matches
  join public.contacts contacts on contacts.id = matches.contact_id
  left join public.organizations organizations on organizations.id = contacts.organization_id
)
update public.hospitations hospitations
set
  contact_id = matched_contacts.contact_id,
  contact_name = coalesce(nullif(hospitations.contact_name, ''), matched_contacts.contact_name),
  organization_id = matched_contacts.organization_id,
  organization_name = coalesce(matched_contacts.organization_record_name, matched_contacts.contact_organization_name, hospitations.organization_name),
  sector = coalesce(nullif(matched_contacts.sector, ''), hospitations.sector),
  city = coalesce(nullif(matched_contacts.city, ''), hospitations.city),
  federal_state = coalesce(nullif(matched_contacts.federal_state, ''), hospitations.federal_state),
  updated_at = now(),
  updated_by = '47d2c8f8-5ae0-4fbd-b135-fd72a02feeb0'::uuid
from matched_contacts
where hospitations.id = matched_contacts.hospitation_id;

commit;
