-- Allow Editor/Admin users to create Expertenkreis records from the CRM UI.
-- Read policies stay unchanged; updates/deletes remain out of scope for this feature step.

grant insert on public.expert_organizations to authenticated;
grant insert on public.expert_contacts to authenticated;

drop policy if exists "expert organizations editor insert" on public.expert_organizations;
create policy "expert organizations editor insert"
on public.expert_organizations for insert
to authenticated
with check (
  public.current_profile_role() in ('admin', 'editor')
  and status <> 'archived'
);

drop policy if exists "expert contacts editor insert" on public.expert_contacts;
create policy "expert contacts editor insert"
on public.expert_contacts for insert
to authenticated
with check (
  public.current_profile_role() in ('admin', 'editor')
  and status <> 'archived'
);
