-- Keep Expertenkreis tables explicit in the Data API.
-- Public/anonymous users get no direct table access; authenticated users can read only.

revoke all on public.expert_groups from anon, authenticated, service_role;
revoke all on public.expert_organizations from anon, authenticated, service_role;
revoke all on public.expert_contacts from anon, authenticated, service_role;

grant select on public.expert_groups to authenticated;
grant select on public.expert_organizations to authenticated;
grant select on public.expert_contacts to authenticated;

grant select, insert, update, delete on public.expert_groups to service_role;
grant select, insert, update, delete on public.expert_organizations to service_role;
grant select, insert, update, delete on public.expert_contacts to service_role;
