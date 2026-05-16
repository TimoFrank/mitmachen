-- Sprint F repair: restore contact image metadata from the audited changes table.
-- Non-destructive: only fills currently empty fields from the latest non-empty old_value.

with latest_image_values as (
  select distinct on (contact_id, field_name)
    contact_id,
    field_name,
    nullif(old_value, '') as old_value
  from public.changes
  where field_name in (
    'image_url',
    'image_source_url',
    'image_source_label',
    'image_rights_note'
  )
    and nullif(old_value, '') is not null
  order by contact_id, field_name, changed_at desc, id desc
),
restored as (
  select
    contact_id,
    max(old_value) filter (where field_name = 'image_url') as image_url,
    max(old_value) filter (where field_name = 'image_source_url') as image_source_url,
    max(old_value) filter (where field_name = 'image_source_label') as image_source_label,
    max(old_value) filter (where field_name = 'image_rights_note') as image_rights_note
  from latest_image_values
  group by contact_id
)
update public.contacts c
set
  image_url = coalesce(nullif(c.image_url, ''), restored.image_url),
  image_source_url = coalesce(nullif(c.image_source_url, ''), restored.image_source_url),
  image_source_label = coalesce(nullif(c.image_source_label, ''), restored.image_source_label),
  image_rights_note = coalesce(nullif(c.image_rights_note, ''), restored.image_rights_note),
  image_updated_at = case
    when nullif(c.image_url, '') is null and restored.image_url is not null then now()
    else c.image_updated_at
  end
from restored
where c.id = restored.contact_id
  and (
    (nullif(c.image_url, '') is null and restored.image_url is not null)
    or (nullif(c.image_source_url, '') is null and restored.image_source_url is not null)
    or (nullif(c.image_source_label, '') is null and restored.image_source_label is not null)
    or (nullif(c.image_rights_note, '') is null and restored.image_rights_note is not null)
  );
