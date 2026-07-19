-- Least-Privilege-Laufzeitrechte fuer die befristete Pre-Integration.
-- Aufruf nur mit psql und verpflichtender Variable: -v runtime_role=vk_app_runtime

\set ON_ERROR_STOP on

\if :{?runtime_role}
\else
  \echo 'FEHLER: Pflichtvariable runtime_role fehlt. Beispiel: psql ... -v runtime_role=vk_app_runtime -f grants.sql'
  \quit 3
\endif

select exists (
  select 1 from pg_catalog.pg_roles where rolname = :'runtime_role'
) as pre_gematik_runtime_role_exists
\gset

\if :pre_gematik_runtime_role_exists
\else
  \echo 'FEHLER: Die mit runtime_role angegebene PostgreSQL-Rolle existiert nicht.'
  \quit 4
\endif

select rolcanlogin as pre_gematik_runtime_role_can_login
  from pg_catalog.pg_roles
 where rolname = :'runtime_role'
\gset

\if :pre_gematik_runtime_role_can_login
  \echo 'FEHLER: Die Laufzeitrolle muss NOLOGIN sein.'
  \quit 5
\endif

begin;

revoke create on schema public from :"runtime_role";
grant usage on schema public to :"runtime_role";

grant select on table public.identity_bindings to :"runtime_role";

grant select, insert, update, delete on table
  public.profiles,
  public.organizations,
  public.contacts,
  public.organization_primary_systems,
  public.contact_owners,
  public.activity_events,
  public.changes,
  public.import_runs,
  public.contact_notes,
  public.contact_note_attachments,
  public.saved_views,
  public.user_settings,
  public.formats,
  public.format_participants,
  public.hospitation_slots,
  public.hospitations,
  public.hospitation_observations,
  public.hospitation_observation_changes,
  public.roadmap_items,
  public.hospitation_roadmap_assessments,
  public.hospitation_unmet_needs,
  public.expert_groups,
  public.expert_organizations,
  public.expert_contacts,
  public.expert_entity_links,
  public.stakeholder_types,
  public.stakeholder_organizations,
  public.stakeholder_people,
  public.notification_events,
  public.notification_recipients
to :"runtime_role";

grant usage, select on sequence
  public.activity_events_id_seq,
  public.changes_id_seq,
  public.hospitation_observation_changes_id_seq
to :"runtime_role";

revoke all on function public.pre_gematik_touch_updated_at() from public;
revoke all on function public.pre_gematik_text_array_join(text[]) from public;
revoke all on function public.pre_gematik_activity_contact_references_match(jsonb, text) from public;
revoke all on function public.pre_gematik_log_hospitation_observation_change() from public;

grant execute on function public.pre_gematik_touch_updated_at() to :"runtime_role";
grant execute on function public.pre_gematik_text_array_join(text[]) to :"runtime_role";
grant execute on function public.pre_gematik_activity_contact_references_match(jsonb, text) to :"runtime_role";
grant execute on function public.pre_gematik_log_hospitation_observation_change() to :"runtime_role";

commit;
