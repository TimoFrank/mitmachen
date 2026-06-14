alter table if exists public.stakeholder_organizations
  add column if not exists logo_url text,
  add column if not exists logo_source_url text,
  add column if not exists logo_source_label text;

with hospital_logo_metadata (
  id,
  logo_file,
  logo_source_url,
  logo_source_label
) as (
  values
    (
      'hospital-association-baden-wuerttemberg',
      'hospital-association-baden-wuerttemberg.svg',
      'https://www.bwkg.de/_assets/e4fef9a38ef08a06e77456c7720a0d7c/Images/logo-mobile.svg?1781247736',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-bayern',
      'hospital-association-bayern.svg',
      'https://www.bkg-online.de/typo3conf/ext/as_template/Resources/Public/Images/Logo/logo-BKG.svg',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-berlin',
      'hospital-association-berlin.png',
      'https://www.bkgev.de/app/uploads/2024/03/bkg_logo.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-brandenburg',
      'hospital-association-brandenburg.png',
      'https://lkb-online.de/wp-content/themes/LKB-Template/src/bilder/Logo.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-bremen',
      'hospital-association-bremen.png',
      'https://www.hbkg.de/images/hbkgLogoNeu.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-hamburg',
      'hospital-association-hamburg.svg',
      'https://www.hkgev.de/files/hkgev-template/img/logos/hkg-logo.svg',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-hessen',
      'hospital-association-hessen.svg',
      'https://hkg-online.de/wp-content/themes/hkg/img/logo/HKG_logo.svg',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-mecklenburg-vorpommern',
      'hospital-association-mecklenburg-vorpommern.png',
      'https://www.kgmv.de/images/logo.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-niedersachsen',
      'hospital-association-niedersachsen.png',
      'http://www.nkgev.de/files/assets/images/NKG_Logo.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-nordrhein-westfalen',
      'hospital-association-nordrhein-westfalen.svg',
      'https://www.kgnw.de/',
      'Kuratiertes Logo-Asset: offizielles Inline-SVG der Verbandswebsite'
    ),
    (
      'hospital-association-rheinland-pfalz',
      'hospital-association-rheinland-pfalz.svg',
      'https://www.kgrp.de/wp-content/uploads/kgrp-logo.svg',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-saarland',
      'hospital-association-saarland.svg',
      'https://skgev.de/media/logo-skg_color.svg',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-sachsen',
      'hospital-association-sachsen.png',
      'https://khg-sachsen.de/wp-content/uploads/2022/09/KGS-Logo-1600x285-transp.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-sachsen-anhalt',
      'hospital-association-sachsen-anhalt.png',
      'https://www.kgsan.de/wnf/customizing/layouts/kgsan15/images/banner_bg4.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-schleswig-holstein',
      'hospital-association-schleswig-holstein.png',
      'https://static.wixstatic.com/media/230206_145009f6df504feab5710961a4103dd3~mv2.png/v1/fill/w_520,h_210,al_c,lg_1,q_85,enc_avif,quality_auto/KGSHPNG.png',
      'Kuratiertes Logo-Asset'
    ),
    (
      'hospital-association-thueringen',
      'hospital-association-thueringen.png',
      'https://lkhg-thueringen.de/wp-content/themes/LKHG/assets/img/logo-big.png',
      'Kuratiertes Logo-Asset'
    )
)
update public.stakeholder_organizations as org
set logo_url = 'public/stakeholder-logos/hospital-associations/' || hospital_logo_metadata.logo_file,
    logo_source_url = hospital_logo_metadata.logo_source_url,
    logo_source_label = hospital_logo_metadata.logo_source_label
from hospital_logo_metadata
where org.id = hospital_logo_metadata.id;
