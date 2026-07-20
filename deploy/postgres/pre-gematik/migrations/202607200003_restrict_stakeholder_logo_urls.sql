-- Removes legacy third-party logo URLs and enforces private target storage only.
-- Apply after a reviewed backup with a short-lived schema-administration account.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';
set local search_path = public, pg_catalog;

select pg_advisory_xact_lock(hashtextextended('versorgungs-kompass-pre-gematik-schema-v1', 0));

update public.stakeholder_organizations
   set logo_url = null,
       updated_at = now()
 where logo_url is not null
   and not (
     logo_url like 'private://stakeholder-logos/%'
     and length(logo_url) <= 1052
     and substring(logo_url from 29) ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
     and substring(logo_url from 29) not like '%//%'
     and right(substring(logo_url from 29), 1) <> '/'
     and substring(logo_url from 29) !~ '(^|/)[.]([.]?)($|/)'
   );

alter table public.stakeholder_organizations
  drop constraint if exists stakeholder_organizations_logo_url_private_check;

alter table public.stakeholder_organizations
  add constraint stakeholder_organizations_logo_url_private_check check (
    logo_url is null
    or (
      logo_url like 'private://stakeholder-logos/%'
      and length(logo_url) <= 1052
      and substring(logo_url from 29) ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
      and substring(logo_url from 29) not like '%//%'
      and right(substring(logo_url from 29), 1) <> '/'
      and substring(logo_url from 29) !~ '(^|/)[.]([.]?)($|/)'
    )
  );

commit;
