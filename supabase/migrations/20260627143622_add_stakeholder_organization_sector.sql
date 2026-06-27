alter table if exists public.stakeholder_organizations
  add column if not exists sector text;

create index if not exists stakeholder_organizations_sector_idx
  on public.stakeholder_organizations(sector);
