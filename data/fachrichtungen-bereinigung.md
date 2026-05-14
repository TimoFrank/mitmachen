# Fachrichtungen im Versorgungs-Kompass: Bereinigter Zielkatalog

Stand: 2026-05-14

## Befund

Die aktuelle Datenbasis `data/versorgungs-kompass-data.csv` enthält 113 Kontakte. Das bisherige Feld `title` wurde in `specialty` umbenannt und fachlich bereinigt.

Der frühere Bestand enthielt 35 unterschiedliche Werte. Darunter waren echte Fachrichtungen, Berufsbezeichnungen, Tippfehler, Rollen, ein Personenname, leere Platzhalter und Mehrfachwerte. Der Zielkatalog enthält jetzt ausschließlich medizinische Fachrichtungen. `Pflege`, `Geschäftsführung` und `Nicht dokumentiert` sind entfernt. Nach der zweiten Prüfung wurden `Anästhesiologie` und `Kinderchirurgie` als eigene Fachrichtungen ergänzt.

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
- Personenwerte wie `Dr. Michael Bayeff-Filoff` bleiben leer.
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
| Dr. Michael Bayeff-Filoff | Personenname |
| GF | Rollenwert |
| HIV \| Unfallchirurgie | Mehrfachwert |
| Onkologie, Gastroenterologie | Mehrfachwert |
| Pflege | Nicht Teil des Zielkatalogs |
| Pflege \| Allgemeinmedizin | Mehrfach-/Versorgungsbereichswert |
| Pflege \| Orthopädie | Mehrfach-/Versorgungsbereichswert |
| Psychologische Psychotherapeutin \| Unfallchirurgie | Mehrfachwert |

## Zielverteilung nach Umsetzung

| Specialty | Kontakte |
| --- | ---: |
| (leer) | 45 |
| Allgemeinmedizin | 32 |
| Hals-Nasen-Ohrenheilkunde (HNO) | 4 |
| Kinder- und Jugendmedizin | 4 |
| Gastroenterologie | 3 |
| Gynäkologie | 3 |
| Radiologie | 3 |
| Dermatologie | 2 |
| Diabetologie | 2 |
| Neurologie | 2 |
| Orthopädie und Unfallchirurgie | 2 |
| Psychologische Psychotherapie | 2 |
| Anästhesiologie | 1 |
| Augenheilkunde | 1 |
| HIV/Infektiologie | 1 |
| Innere Medizin | 1 |
| Kinderchirurgie | 1 |
| Onkologie | 1 |
| Pneumologie | 1 |
| Psychiatrie und Psychotherapie | 1 |
| Urologie | 1 |

## Umsetzungshinweis

Das maschinenlesbare Mapping liegt in `data/fachrichtungen-zielkatalog.json`. Die produktiven Kompass-Daten in `data/versorgungs-kompass-data.csv` und `data/versorgungs-kompass-data.js` sowie die Kopien unter `docs/data/` sind bereits auf `specialty` migriert.
