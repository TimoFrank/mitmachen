insert into public.stakeholder_types (id, label, description, sort_order, status)
values (
  'hospital-associations',
  'Krankenhausgesellschaften',
  'Bundes- und Landeskrankenhausgesellschaften als Stakeholder-Bereich.',
  40,
  'active'
)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

with hospital_associations (
  id,
  name,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  street_address
) as (
  values
    ('hospital-association-baden-wuerttemberg', 'Baden-Württembergische Krankenhausgesellschaft e. V.', '70191', 'Stuttgart', 'Baden-Württemberg', 48.7758, 9.1829, 'https://www.bwkg.de', '0711 25777-0', 'Birkenwaldstraße 151'),
    ('hospital-association-bayern', 'Bayerische Krankenhausgesellschaft e. V.', '80331', 'München', 'Bayern', 48.1351, 11.5820, 'https://www.bkg-online.de', '089 290830-0', 'Radlsteg 1'),
    ('hospital-association-berlin', 'Berliner Krankenhausgesellschaft e. V.', '10587', 'Berlin', 'Berlin', 52.5200, 13.4050, 'https://www.bkgev.de', '030 330996-0', 'Hallerstraße 6'),
    ('hospital-association-brandenburg', 'Landeskrankenhausgesellschaft Brandenburg e. V.', '14471', 'Potsdam', 'Brandenburg', 52.3906, 13.0645, 'https://www.lkb-online.de', '0331 27553-0', 'Zeppelinstraße 48'),
    ('hospital-association-bremen', 'Krankenhausgesellschaft der Freien Hansestadt Bremen e. V.', '28359', 'Bremen', 'Bremen', 53.0793, 8.8017, 'https://www.hbkg.de', '0421 24102-0', 'Anne-Conway-Straße 10'),
    ('hospital-association-hamburg', 'Hamburgische Krankenhausgesellschaft e. V.', '20095', 'Hamburg', 'Hamburg', 53.5511, 9.9937, 'https://www.hkgev.de', '040 251736-0', 'Burchardstraße 19'),
    ('hospital-association-hessen', 'Hessische Krankenhausgesellschaft e. V.', '65760', 'Eschborn', 'Hessen', 50.1433, 8.5711, 'https://www.hkg-online.de', '06196 4099-50', 'Frankfurter Straße 10-14'),
    ('hospital-association-mecklenburg-vorpommern', 'Krankenhausgesellschaft Mecklenburg-Vorpommern e. V.', '19053', 'Schwerin', 'Mecklenburg-Vorpommern', 53.6355, 11.4012, 'https://www.kgmv.de', '0385 48529-0', 'Wismarsche Straße 175'),
    ('hospital-association-niedersachsen', 'Niedersächsische Krankenhausgesellschaft e. V.', '30159', 'Hannover', 'Niedersachsen', 52.3759, 9.7320, 'https://www.nkgev.de', '0511 30763-0', 'Thielenplatz 3'),
    ('hospital-association-nordrhein-westfalen', 'Krankenhausgesellschaft Nordrhein-Westfalen e. V.', '40237', 'Düsseldorf', 'Nordrhein-Westfalen', 51.2277, 6.7735, 'https://www.kgnw.de', '0211 47819-0', 'Humboldtstraße 31'),
    ('hospital-association-rheinland-pfalz', 'Krankenhausgesellschaft Rheinland-Pfalz e. V.', '55116', 'Mainz', 'Rheinland-Pfalz', 49.9929, 8.2473, 'https://www.kgrp.de', '06131 28695-0', 'Bauerngasse 7'),
    ('hospital-association-saarland', 'Saarländische Krankenhausgesellschaft e. V.', '66119', 'Saarbrücken', 'Saarland', 49.2402, 6.9969, 'https://www.skgev.de', '0681 92611-0', 'Talstraße 30'),
    ('hospital-association-sachsen', 'Krankenhausgesellschaft Sachsen e. V.', '04105', 'Leipzig', 'Sachsen', 51.3397, 12.3731, 'https://www.khg-sachsen.de', '0341 98410-0', 'Humboldtstraße 2a'),
    ('hospital-association-sachsen-anhalt', 'Krankenhausgesellschaft Sachsen-Anhalt e. V.', '06112', 'Halle (Saale)', 'Sachsen-Anhalt', 51.4969, 11.9688, 'https://www.kgsan.de', '0345 21466-0', 'Magdeburger Straße 23'),
    ('hospital-association-schleswig-holstein', 'Krankenhausgesellschaft Schleswig-Holstein e. V.', '24105', 'Kiel', 'Schleswig-Holstein', 54.3233, 10.1228, 'https://www.kgsh.de', '0431 88105-0', 'Feldstraße 75'),
    ('hospital-association-thueringen', 'Landeskrankenhausgesellschaft Thüringen e. V.', '99096', 'Erfurt', 'Thüringen', 50.9848, 11.0299, 'https://www.lkhg-thueringen.de', '0361 55830-0', 'Friedrich-Ebert-Straße 63')
)
insert into public.stakeholder_organizations (
  id,
  stakeholder_type_id,
  name,
  normalized_name,
  organization_type,
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  notes,
  source,
  status
)
select
  id,
  'hospital-associations',
  name,
  lower(name),
  'Landeskrankenhausgesellschaft',
  postal_code,
  city,
  federal_state,
  latitude,
  longitude,
  website,
  phone,
  concat('Adresse laut DKG: ', street_address, ', ', postal_code, ' ', city),
  'DKG-Mitgliederseite',
  'active'
from hospital_associations
on conflict (id) do update
set stakeholder_type_id = excluded.stakeholder_type_id,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    organization_type = excluded.organization_type,
    postal_code = excluded.postal_code,
    city = excluded.city,
    federal_state = excluded.federal_state,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    website = excluded.website,
    phone = excluded.phone,
    notes = excluded.notes,
    source = excluded.source,
    status = excluded.status;
