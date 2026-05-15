# Fachrichtungen im Versorgungs-Kompass: Bereinigter Zielkatalog

Stand: 2026-05-14

## Befund

Der produktive Versorgungs-Kompass lädt Kontaktdaten inzwischen aus Supabase. Die früheren öffentlichen CSV/JS-Seeds wurden geleert, damit GitHub Pages keine echten Kontakt- oder Personendaten mehr ausliefert.

Dieses Dokument enthält nur noch den allgemeinen, nicht personenbezogenen Zielkatalog für das Feld `specialty`. Alte Audit-Details mit konkreten Kontaktbeispielen wurden aus dem öffentlichen Repository entfernt.

## Zielkatalog

- Allgemeinmedizin
- Anästhesiologie
- Augenheilkunde
- Dermatologie
- Diabetologie
- Gastroenterologie
- Gynäkologie
- Hals-Nasen-Ohrenheilkunde (HNO)
- HIV/Infektiologie
- Innere Medizin
- Kinder- und Jugendmedizin
- Kinderchirurgie
- Neurologie
- Onkologie
- Orthopädie und Unfallchirurgie
- Pneumologie
- Psychiatrie und Psychotherapie
- Psychologische Psychotherapie
- Radiologie
- Urologie

## Bereinigungsregeln

- Das Feld heißt künftig `specialty` statt `title`.
- Leere Felder und `-` bleiben leer.
- Rollenwerte wie `GF` bleiben leer.
- Fachfremde Werte wie `Pflege` bleiben leer.
- Personenwerte bleiben leer.
- Mehrfachwerte mit `|` oder Komma bleiben leer.
- `Kinderchirurgin` und `Kinderchirurgie` werden künftig als `Kinderchirurgie` geführt.
- `Kinderarzt` und `Kinder- und Jugendmedizin` werden zu `Kinder- und Jugendmedizin` zusammengeführt.

## Normalisierungen

| Alter Wert | Neuer Wert |
| --- | --- |
| Augenarzt | Augenheilkunde |
| Dermatologe | Dermatologie |
| Gynäkolgoie | Gynäkologie |
| HNO | Hals-Nasen-Ohrenheilkunde (HNO) |
| HIV | HIV/Infektiologie |
| Kinderarzt | Kinder- und Jugendmedizin |
| Kinderchirurgin | Kinderchirurgie |
| Pneumologe | Pneumologie |
| Psychiatrie | Psychiatrie und Psychotherapie |
| Psychologische Psychotherapeutin | Psychologische Psychotherapie |
| Psychologischer Psychotherapeut | Psychologische Psychotherapie |
| Unfallchirurgie | Orthopädie und Unfallchirurgie |

## Leer gesetzte Werte

| Alter Wert | Grund |
| --- | --- |
| leer | Ohne gepflegte Fachrichtung |
| - | Platzhalter |
| - \| Unfallchirurgie | Mehrfach-/Mischwert |
| Allgemeinmedizin \| Diabetologie | Mehrfachwert |
| Allgemeinmedizin \| Psychotherapie \| Psychiatrie \| Labor | Mehrfachwert mit fachfremdem Anteil |
| Allgemeinmedizin, HIV-Schwerpunkt | Mehrfach-/Schwerpunktwert |
| Allgemeinmedizin, Urologie | Mehrfachwert |
| Personenname | Personenwerte gehoeren nicht in das Fachrichtungsfeld |
| GF | Rollenwert |
| HIV \| Unfallchirurgie | Mehrfachwert |
| Onkologie, Gastroenterologie | Mehrfachwert |
| Pflege | Nicht Teil des Zielkatalogs |
| Pflege \| Allgemeinmedizin | Mehrfach-/Versorgungsbereichswert |
| Pflege \| Orthopädie | Mehrfach-/Versorgungsbereichswert |
| Psychologische Psychotherapeutin \| Unfallchirurgie | Mehrfachwert |

## Umsetzungshinweis

Das maschinenlesbare Mapping liegt in `data/fachrichtungen-zielkatalog.json`. Produktive Kontaktdaten werden nicht mehr in GitHub gespeichert, sondern in Supabase gepflegt.
