alter table if exists public.stakeholder_organizations
  add column if not exists logo_url text,
  add column if not exists logo_source_url text,
  add column if not exists logo_source_label text;

with logo_metadata (id, logo_url, logo_source_url) as (
  values
    ('patient-dbr', 'public/stakeholder-logos/patient-associations/patient-dbr.gif', 'https://www.deutscher-behindertenrat.de/GroupSys/layout/25031/040714-logo-dbr-408x85.gif'),
    ('patient-bagp', 'public/stakeholder-logos/patient-associations/patient-bagp.png', 'https://bagp.de/templates/bagp/images/logo.png'),
    ('patient-dag-shg', 'public/stakeholder-logos/patient-associations/patient-dag-shg.png', 'https://www.dag-shg.de/images/logo.png'),
    ('patient-vzbv', 'public/stakeholder-logos/patient-associations/patient-vzbv.svg', 'https://www.vzbv.de/themes/custom/vzbv_rebrush2025/images/vzbv-logo.svg'),
    ('patient-bag-selbsthilfe', 'public/stakeholder-logos/patient-associations/patient-bag-selbsthilfe.svg', 'https://www.bag-selbsthilfe.de'),
    ('patient-sovd', 'public/stakeholder-logos/patient-associations/patient-sovd.svg', 'https://www.sovd.de/_assets/279cee4ecef4166e206be59121d7a13a/Images/Logo/SoVD.svg'),
    ('patient-vdk', 'public/stakeholder-logos/patient-associations/patient-vdk.svg', 'https://www.vdk.de/_assets/af9f607dc860719ef78163c597401b48/Frontend/Build/assets/images/Sozialverband_VdK_Deutschland_Logo.svg'),
    ('patient-isl', 'public/stakeholder-logos/patient-associations/patient-isl.svg', 'https://isl-ev.de/wp-content/themes/isl/assets/images/logo-isl.svg'),
    ('patient-abid', 'public/stakeholder-logos/patient-associations/patient-abid.png', 'https://www.abid-ev.de/wp-content/uploads/logo-neu-300x49.png'),
    ('patient-lebenshilfe', 'public/stakeholder-logos/patient-associations/patient-lebenshilfe.svg', 'https://www.lebenshilfe.de'),
    ('patient-achse', 'public/stakeholder-logos/patient-associations/patient-achse.svg', 'https://www.achse-online.de/typo3conf/ext/wd_template/Resources/Public/img/logo-achse.svg'),
    ('patient-deutsche-alzheimer-gesellschaft', 'public/stakeholder-logos/patient-associations/patient-deutsche-alzheimer-gesellschaft.svg', 'https://www.deutsche-alzheimer.de/typo3conf/ext/cm_site/Resources/Public/Images/DAlzG_Logo_lang.svg'),
    ('patient-rheuma-liga', 'public/stakeholder-logos/patient-associations/patient-rheuma-liga.png', 'https://www.rheuma-liga.de/typo3conf/ext/z35_project/Resources/Public/Images/logo.png'),
    ('patient-dmsg', 'public/stakeholder-logos/patient-associations/patient-dmsg.svg', 'https://www.dmsg.de/_assets/082b9181afcf7491747656c6ceddf510/_Customizations/Public_DMSG/Media/logo.svg'),
    ('patient-dccv', 'public/stakeholder-logos/patient-associations/patient-dccv.png', 'https://www.dccv.de/typo3conf/ext/dccv/Resources/Public/Img/dccv_logo.png'),
    ('patient-pro-retina', 'public/stakeholder-logos/patient-associations/patient-pro-retina.jpg', 'https://www.pro-retina.de/fileadmin/_processed_/b/d/csm_PRO-RETINA_2026_Logo_742d14f6b8.jpg'),
    ('patient-upd', 'public/stakeholder-logos/patient-associations/patient-upd.svg', 'https://patientenberatung.de/wp-content/uploads/2024/04/upd-logo-pos.svg'),
    ('patient-aps', 'public/stakeholder-logos/patient-associations/patient-aps.png', 'https://www.aps-ev.de/wp-content/uploads/2024/05/aps_logo_480.png'),
    ('patient-bpik', 'public/stakeholder-logos/patient-associations/patient-bpik.png', 'https://bpik.de/wp-content/uploads/2021/08/Logo-BPIK_web_klein.png'),
    ('patient-diabetesde', 'public/stakeholder-logos/patient-associations/patient-diabetesde.svg', 'https://www.diabetesde.org/themes/custom/diabetes/logo.svg'),
    ('patient-parkinson-vereinigung', 'public/stakeholder-logos/patient-associations/patient-parkinson-vereinigung.svg', 'https://www.dpv-bundesverband.de/_assets/45b0bf2660e159d4af5ba8f836de3394/Images/logo.svg'),
    ('patient-herzstiftung', 'public/stakeholder-logos/patient-associations/patient-herzstiftung.jpg', 'https://herzstiftung.de/themes/custom/dhs_front/dhs-logo.jpg'),
    ('patient-daab', 'public/stakeholder-logos/patient-associations/patient-daab.png', 'https://www.daab.de/fileadmin/templates/img/logo.png'),
    ('patient-psoriasis-bund', 'public/stakeholder-logos/patient-associations/patient-psoriasis-bund.png', 'https://www.psoriasis-bund.de/typo3conf/ext/user_psoriasis_bund/Resources/Public/Images/logo.png'),
    ('patient-frauenselbsthilfe-krebs', 'public/stakeholder-logos/patient-associations/patient-frauenselbsthilfe-krebs.png', 'https://www.frauenselbsthilfe.de/typo3conf/ext/dg_theme/Resources/Public/Logos/Logo-FSH.png'),
    ('patient-prostatakrebs-bps', 'public/stakeholder-logos/patient-associations/patient-prostatakrebs-bps.png', 'https://prostatakrebs-bps.de/wp-content/uploads/bps-logo-transparent-schriftzug-grau.png'),
    ('patient-ilco', 'public/stakeholder-logos/patient-associations/patient-ilco.jpg', 'https://www.ilco.de/fileadmin/theme_ilco_de/images/logo.jpg'),
    ('patient-haus-der-krebs-selbsthilfe', 'public/stakeholder-logos/patient-associations/patient-haus-der-krebs-selbsthilfe.svg', 'https://hausderkrebsselbsthilfe.de/wp-content/uploads/2025/08/logo_svg.svg'),
    ('patient-dlh', 'public/stakeholder-logos/patient-associations/patient-dlh.svg', 'https://www.leukaemie-hilfe.de/fileadmin/user_upload/logo.svg'),
    ('patient-schilddruesenkrebs', 'public/stakeholder-logos/patient-associations/patient-schilddruesenkrebs.svg', 'https://www.sd-krebs.de/wp-content/uploads/2020/09/logo-sd-krebs.svg'),
    ('patient-mukoviszidose', 'public/stakeholder-logos/patient-associations/patient-mukoviszidose.svg', 'https://www.muko.info/_assets/22cf45b1172aadb18e25b83cb2690c1d/Images/logo-mukoviszidose-ev.svg'),
    ('patient-kindernetzwerk', 'public/stakeholder-logos/patient-associations/patient-kindernetzwerk.svg', 'https://www.kindernetzwerk.de/dist/svg/logo.svg'),
    ('patient-bvhk', 'public/stakeholder-logos/patient-associations/patient-bvhk.svg', 'https://bvhk.de/wp-content/uploads/2022/11/Logo_BVHK.svg'),
    ('patient-epilepsievereinigung', 'public/stakeholder-logos/patient-associations/patient-epilepsievereinigung.png', 'https://www.epilepsie-vereinigung.de/wp-content/uploads/2020/05/deutsche-epilepsievereinigung.png'),
    ('patient-depressionsliga', 'public/stakeholder-logos/patient-associations/patient-depressionsliga.svg', 'https://depressionsliga.de/wp-content/uploads/2024/02/logo.svg'),
    ('patient-autismus-deutschland', 'public/stakeholder-logos/patient-associations/patient-autismus-deutschland.png', 'https://www.autismus.de/fileadmin/templates/images/autismus_logo290.png'),
    ('patient-adhs-deutschland', 'public/stakeholder-logos/patient-associations/patient-adhs-deutschland.svg', 'https://adhs-deutschland.de/themes/custom/adhs/logo.svg'),
    ('patient-sarkom-stiftung', 'public/stakeholder-logos/patient-associations/patient-sarkom-stiftung.jpg', 'https://www.sarkome.de/templates/sarkomstiftung2020/images/designer/2efb3b721710d19a95b802575f669e73_SARKOMEdelogo.jpg'),
    ('patient-blasenkrebs-shb', 'public/stakeholder-logos/patient-associations/patient-blasenkrebs-shb.jpg', 'https://www.blasenkrebs-shb.de/wp-content/uploads/bg-branding.jpg')
)
update public.stakeholder_organizations as organization
set
  logo_url = logo_metadata.logo_url,
  logo_source_url = logo_metadata.logo_source_url,
  logo_source_label = 'Offizielles Header-/Logo-Asset der Organisation; keine Favicon-/Social-Media-Quelle',
  updated_at = now()
from logo_metadata
where organization.id = logo_metadata.id;
