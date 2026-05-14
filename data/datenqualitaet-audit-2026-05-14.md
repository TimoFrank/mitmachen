# Datenqualitaets-Audit: Fachrichtung und Organisation

Stand: 2026-05-14

## Ziel

Dieses Audit bereinigt die Felder `specialty` und `organization` im aktuellen Bestand des Versorgungs-Kompass. Grundlage waren der aktuelle Datenbestand mit 113 Kontakten, die hinterlegten Quellen-URLs und eine gezielte Web-Recherche auffaelliger Kontakte.

## Fachrichtung

- Fachrichtungen bei `Apotheke` und `Pflege` wurden geleert, da dort keine medizinische Fachrichtung gepflegt werden soll.
- Die pauschale Krankenhaus-Zuordnung `Orthopaedie und Unfallchirurgie` wurde bei nicht verifizierten Kontakten entfernt.
- Krankenhaus-Fachrichtungen bleiben nur gesetzt, wenn die Recherche eine medizinische Fachrichtung plausibel bestaetigt.
- `Anaesthesiologie` und `Kinderchirurgie` wurden in den Zielkatalog aufgenommen.

## Organisation

- Abkuerzungen bei Universitaetsklinika wurden ausgeschrieben, z. B. `UK Dresden`, `UK Essen`, `UK Frankfurt`, `UKSH`.
- Rollentexte wurden aus Organisationsnamen entfernt, z. B. `Pflegedienstleiterin Sozialstation Heerstrasse Nord` und `Vorstand Stadtmission Karlsruhe`.
- Offensichtliche Tippfehler und zu knappe Praxisnamen wurden korrigiert, z. B. `Praxis im Zentrum Harsefeld` und `Hausarztpraxis Dr. Martin Deile`.

## Ergebnis

- 31 fehlerhafte Fachrichtungen wurden entfernt.
- 7 Fachrichtungen wurden gezielt korrigiert oder neu gesetzt.
- 29 Organisationsnamen wurden normalisiert oder ausgeschrieben.
- `Apotheke` und `Pflege` haben jetzt 0 Kontakte mit medizinischer Fachrichtung.
- Im Sektor `Krankenhaus` bleiben 8 Kontakte mit verifizierter Fachrichtung.
- Der lokale Daten-Seed wurde auf `versorgungs-kompass-contacts-v8` angehoben, damit Browser nicht weiter den alten Datenstand laden.

## Genutzte Referenzbeispiele

- Charite / Peter Gocke: `https://www.charite.de`
- Universitaetsklinikum Essen / Anke Diehl: `https://www.uk-essen.de/stabsstelle-digitale-transformation/`
- Universitaetsklinikum Carl Gustav Carus Dresden / David Senf-Mothes: `https://www.uniklinikum-dresden.de/`
- Praxis fuer Kinderchirurgie Berlin / Susanne von der Heydt: `https://praxis-vonderheydt.de/von-der-heydt/`
- FoeV Verbund / Stefanie Roeseler: `https://foev-verbund.de/hauskrankenpflege-spandau/`

## Offene Punkte

- Einige Krankenhauskontakte haben weiterhin keine Fachrichtung, weil sie vermutlich IT-, Management-, Pflege- oder Organisationskontakte sind.
- Bei mehreren Kontakten sollte in einem zweiten Schritt der Sektor geprueft werden, insbesondere bei Organisationen aus Pflege, Sozialtraegerschaft oder Mischkontexten.
- Potenzielle Dubletten bleiben separat zu pruefen, z. B. doppelte Personen mit leicht abweichendem Namen.
