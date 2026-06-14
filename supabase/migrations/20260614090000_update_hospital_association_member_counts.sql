with hospital_member_counts (
  id,
  member_count,
  member_count_source_url,
  member_count_source_label,
  member_count_updated_at,
  member_count_scope
) as (
  values
    (
      'hospital-association-baden-wuerttemberg',
      219,
      'https://sozialministerium.baden-wuerttemberg.de/de/gesundheit-pflege/krankenhaeuser/krankenhausfuehrer',
      'Sozialministerium Baden-Württemberg: Krankenhausführer/BWKG-Mitgliederverzeichnis',
      null::date,
      'Mitgliedskrankenhäuser im BWKG-Mitgliederverzeichnis; Vorsorge-/Reha- und Pflegeeinrichtungen sind nicht mitgezählt.'
    ),
    (
      'hospital-association-bayern',
      190,
      'https://www.bkg-online.de/infos-services/krankenhausversorgung/zahlen-daten-fakten',
      'Bayerische Krankenhausgesellschaft: Zahlen, Daten, Fakten',
      null::date,
      'Krankenhausträger in der Bayerischen Krankenhausgesellschaft; diese Träger stehen für knapp 350 Krankenhäuser.'
    ),
    (
      'hospital-association-berlin',
      86,
      'https://www.bkgev.de/zahlen-daten-fakten/',
      'Berliner Krankenhausgesellschaft: Zahlen, Daten, Fakten 2026',
      null::date,
      'Krankenhäuser in Berlin 2024; Fallback, da keine separate Mitgliederzahl der BKG öffentlich auffindbar war.'
    ),
    (
      'hospital-association-brandenburg',
      53,
      'https://lkb-online.de/',
      'Landeskrankenhausgesellschaft Brandenburg: Der Verband',
      null::date,
      'Krankenhäuser, die durch die Mitglieder der LKB repräsentiert werden.'
    ),
    (
      'hospital-association-bremen',
      14,
      'https://www.hbkg.de/',
      'Krankenhausgesellschaft Bremen: Krankenhaussuche/Kontaktseite',
      null::date,
      'Kommunale, freigemeinnützige und private Krankenhäuser in Bremen und Bremerhaven.'
    ),
    (
      'hospital-association-hamburg',
      35,
      'https://www.hkgev.de/',
      'Hamburgische Krankenhausgesellschaft: Über die HKG',
      null::date,
      'Private, freigemeinnützige und öffentliche Krankenhäuser in und um Hamburg, deren Interessen die HKG vertritt.'
    ),
    (
      'hospital-association-hessen',
      140,
      'https://hkg-online.de/',
      'Hessische Krankenhausgesellschaft: Startseite',
      null::date,
      'Krankenhausträger, die durch die HKG als Interessenvertretung repräsentiert werden.'
    ),
    (
      'hospital-association-mecklenburg-vorpommern',
      37,
      'https://www.kgmv.de/',
      'Krankenhausgesellschaft Mecklenburg-Vorpommern: Wer sind wir?',
      null::date,
      'Akutkrankenhäuser; zusätzlich sind 4 Rehabilitationskliniken angeschlossen.'
    ),
    (
      'hospital-association-niedersachsen',
      163,
      'https://www.lobbyregister.bundestag.de/suche/R001389',
      'Lobbyregister Bundestag: NKG, Mitglieder am 18.05.2026',
      date '2026-05-18',
      'Mitglieder laut Lobbyregister; juristische Personen, Personengesellschaften oder sonstige Organisationen.'
    ),
    (
      'hospital-association-nordrhein-westfalen',
      244,
      'https://www.kgnw.de/',
      'Krankenhausgesellschaft Nordrhein-Westfalen: Mitglieder der KGNW, Stand 05.02.2025',
      date '2025-02-05',
      'Krankenhausträger in Nordrhein-Westfalen, die in der KGNW zusammengeschlossen sind.'
    ),
    (
      'hospital-association-rheinland-pfalz',
      100,
      'https://www.kgrp.de/die-kgrp/',
      'Krankenhausgesellschaft Rheinland-Pfalz: Die KGRP',
      null::date,
      'Krankenhäuser in Rheinland-Pfalz, deren Interessen die KGRP vertritt.'
    ),
    (
      'hospital-association-saarland',
      18,
      'https://skgev.de/die-skg/mitglieder/',
      'Saarländische Krankenhausgesellschaft: Mitglieder',
      null::date,
      'Akutkrankenhäuser im Saarland; zusätzlich werden weitere angeschlossene Versorgungsangebote ausgewiesen.'
    ),
    (
      'hospital-association-sachsen',
      66,
      'https://khg-sachsen.de/mitglieder/',
      'Krankenhausgesellschaft Sachsen: Mitglieder, Stand 04.11.2024',
      date '2024-11-04',
      'Mitglieder der Krankenhausgesellschaft Sachsen; diese umfassen 76 Krankenhäuser an 116 Standorten.'
    ),
    (
      'hospital-association-sachsen-anhalt',
      45,
      'https://www.kgsan.de/wnf/navbar/wnf.php?oid=15637&sid=',
      'KGSAN: Sachsen-Anhalts Krankenhäuser, Öffentliche Mitgliederversammlung 2025',
      date '2025-09-17',
      'Krankenhäuser in Sachsen-Anhalt an 57 Standorten; Fallback, da keine separate Mitgliederzahl öffentlich auffindbar war.'
    ),
    (
      'hospital-association-schleswig-holstein',
      60,
      'https://www.lobbyregister.bundestag.de/suche/R002866',
      'Lobbyregister Bundestag: KGSH, Mitglieder am 05.06.2024',
      date '2024-06-05',
      'Mitglieder laut Lobbyregister; die KGSH-Website nennt zusätzlich 72 vertretene Krankenhäuser.'
    ),
    (
      'hospital-association-thueringen',
      46,
      'https://www.lobbyregister.bundestag.de/suche/R004254',
      'Lobbyregister Bundestag: LKHG Thüringen, Mitglieder am 01.01.2026',
      date '2026-01-01',
      'Mitglieder laut Lobbyregister; juristische Personen, Personengesellschaften oder sonstige Organisationen.'
    )
)
update public.stakeholder_organizations as org
set member_count = counts.member_count,
    member_count_source_url = counts.member_count_source_url,
    member_count_source_label = counts.member_count_source_label,
    member_count_updated_at = counts.member_count_updated_at,
    member_count_scope = counts.member_count_scope
from hospital_member_counts as counts
where org.id = counts.id;
