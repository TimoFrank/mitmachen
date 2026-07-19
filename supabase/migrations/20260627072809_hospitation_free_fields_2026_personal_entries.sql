begin;

alter table public.hospitation_slots add column if not exists contact_name text;
alter table public.hospitation_slots add column if not exists organization_name text;
alter table public.hospitation_slots add column if not exists city text;
alter table public.hospitation_slots add column if not exists federal_state text;
alter table public.hospitation_slots add column if not exists sector text;

alter table public.hospitations add column if not exists contact_name text;
alter table public.hospitations add column if not exists organization_name text;
alter table public.hospitations add column if not exists city text;
alter table public.hospitations add column if not exists federal_state text;
alter table public.hospitations add column if not exists sector text;

-- Operational appointment records are maintained only in protected storage.

commit;
