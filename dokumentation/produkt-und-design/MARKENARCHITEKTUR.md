# Markenarchitektur und Markenkit

Stand: 28.07.2026

Dieses Dokument ist die führende redaktionelle Grundlage für `#Mitmachen` als gemeinsamen Absender und die vier gleichrangigen Kompass-Marken. Es regelt Benennung, Verhältnis der Marken, Basistexte, Farben, Demo-Kennzeichnung und Logo-Verwendung. UI-Tokens, Primitives, Patterns und Governance folgen in einer späteren Ausbaustufe.

## Markenarchitektur

```text
gematik GmbH                     institutioneller Absender, separat geführt

#Mitmachen                       gemeinsamer Absender
├── Versorgungs-Kompass
├── Stakeholder-Kompass
├── Hospitations-Kompass
└── Format-Kompass

Repo-Demos
├── Anwendungsvorschau mit fiktiven Beispieldaten
└── eigenständige Demoidee für einen Registrierungsablauf
```

| Element | Kanonische Benennung | Rolle |
| --- | --- | --- |
| Organisation | `gematik`, formal `gematik GmbH` | verantwortende Organisation |
| Gemeinsamer Absender | `#Mitmachen` | sichtbarer Kontext für Beteiligung und Zusammenarbeit |
| Marke 1 | `Versorgungs-Kompass` | Regionen, Kontakte und Organisationen |
| Marke 2 | `Stakeholder-Kompass` | Perspektiven, Institutionen und Netzwerke |
| Marke 3 | `Hospitations-Kompass` | Planung, Beobachtung und Verdichtung von Praxiseinblicken |
| Marke 4 | `Format-Kompass` | Planung und Gestaltung von Austauschformaten |
| Registrierungsseite im Repo | `Versorgungs-Netzwerk` | eigenständige Demo, nicht das offizielle gematik-Formular |

Die vier Kompass-Marken sind gleichrangig. Keine von ihnen ist Absender oder Namensbestandteil einer anderen. `#Mitmachen` steht als gemeinsamer Absender bei allen vier Marken in derselben Beziehung und wird räumlich getrennt vom jeweiligen Markenlogo gesetzt.

Kanonisch sind ausschließlich die Schreibweisen mit Bindestrich: `Versorgungs-Kompass`, `Stakeholder-Kompass`, `Hospitations-Kompass` und `Format-Kompass`. Die Singularform `Format-Kompass` bezeichnet die Orientierung über mehrere Formate und ist deshalb der Markenname; `Formate` bleibt das kurze Modul- und Navigationslabel.

`gematik-Versorgungskompass`, `Der gematik-Versorgungskompass`, `Formate-Kompass` und `gematik-Hospitationsnetzwerk` sind keine kanonischen Schreibweisen.

## Markenversprechen und Basistexte

### #Mitmachen

**Kanonischer Schriftzug:** `#Mitmachen`

**Offizieller gematik-Claim:** Gestalten Sie die digitale Gesundheit mit.

> #Mitmachen ist der gemeinsame Absender für die vier Kompass-Marken. Er verbindet Versorgungsperspektiven, Netzwerke, Praxiseinblicke und Austauschformate in einem konsistenten Beteiligungskontext.

Die offiziellen Angebote und Registrierungswege liegen auf [gematik.de/mitmachen](https://www.gematik.de/mitmachen). Der repo-eigene Schriftzug ist eine Projektidentität für Dokumentation und Anwendungskontext; er ist kein gematik-Unternehmenslogo und wird nicht als offizielles Kampagnenasset ausgegeben.

### Versorgungs-Kompass

**Tagline:** Regionen verstehen. Kontakte vernetzen. Versorgung gemeinsam gestalten.

> Der Versorgungs-Kompass macht regionale Versorgungsstrukturen sichtbar und verbindet Kontakte mit den zugehörigen Organisationen.

### Stakeholder-Kompass

> Der Stakeholder-Kompass macht Perspektiven, Institutionen und Beziehungen nachvollziehbar und unterstützt die gezielte Zusammenarbeit im Netzwerk.

### Hospitations-Kompass

> Der Hospitations-Kompass begleitet Praxiseinblicke von der Vorbereitung über die Beobachtung bis zur gemeinsamen Verdichtung.

### Format-Kompass

> Der Format-Kompass unterstützt dabei, Austauschformate zu planen, Beteiligte zusammenzubringen und Wirkung gemeinsam zu gestalten.

### Demo zum Versorgungs-Netzwerk

> Diese Seite zeigt eine eigenständige Demoidee. Sie ist weder Kopie noch Bestandteil des offiziellen gematik-Formulars. Eingaben werden nicht übermittelt oder gespeichert. Verbindliche Informationen und die tatsächliche Anmeldung finden Sie beim [Versorgungs-Netzwerk auf gematik.de](https://www.gematik.de/mitmachen/versorgungs-netzwerk).

Der Demo-Status steht vor Hero, CTA und Formular. Das Formular bleibt technisch inert und fordert ausdrücklich zur Verwendung fiktiver Angaben auf.

## Farben der vier Kompass-Marken

Die Farben strukturieren Navigation, Badges, Collagen, Kapitel und Signets. Das gemeinsame Dunkelblau zeigt die Zusammengehörigkeit; die jeweilige Konstellation, der ausgeschriebene Name und die Markenfarbe unterscheiden die vier Marken.

| Marke | Modul | Akzent | Dunkel | Hell | Aussage |
| --- | --- | --- | --- | --- | --- |
| Versorgungs-Kompass | Versorgung | `#559EE8` | `#0B5CAD` | `#EAF3FC` | Regionen, Kontakte und Organisationen im Blick. |
| Stakeholder-Kompass | Stakeholder | `#43B391` | `#0F766E` | `#E8F7F4` | Perspektiven und Netzwerke gezielt verbinden. |
| Hospitations-Kompass | Hospitation | `#E0A44D` | `#A84C16` | `#FFF3E8` | Beobachtungen in belastbares Wissen überführen. |
| Format-Kompass | Formate | `#A980DA` | `#7A3E91` | `#F4ECFA` | Austausch planen und Wirkung gemeinsam gestalten. |

Für Badges auf hellen Akzentflächen wird Dunkelblau `#17275F` verwendet. Dunkle Varianten tragen weißen Text. Markenname oder Icon bleiben immer sichtbar, damit Farbe nie die einzige Information ist.

## Logo-System

### gematik

Führend ist die unveränderte Standardvariante mit Flagge aus der [gematik-Mediathek](https://www.gematik.de/newsroom/mediathek). Die Originaldatei liegt unter `public/brand/gematik/gematik-logo-standard.png`; Quelle und Prüfsumme stehen in `public/brand/asset-manifest.json`.

Der dort veröffentlichte Markenleitfaden verlangt unter anderem:

- keine Nachkonstruktion, Farbänderung, Verzerrung oder Effekte,
- die Standardvariante mit Wortmarke und Flagge als Regelfall,
- einen Schutzraum von mindestens der Breite des Buchstabens `g`,
- eine Mindestbreite von 10 mm,
- gematik an erster Stelle bei freigegebenem Co-Branding,
- vorherige schriftliche Freigabe für Co-Branding und werbliche Nutzung.

Das gematik-Original wird deshalb nicht in ein Kompass- oder `#Mitmachen`-SVG eingebettet. Bis zu einer formalen Freigabe steht es ausschließlich als räumlich getrennter institutioneller Absender.

### #Mitmachen

Das Kit unter `public/brand/mitmachen/` enthält eine kompakte Hashtag-Marke, eine Wortmarke und horizontale Lockups für helle und dunkle Flächen. Die Gestaltung orientiert sich an Dunkelblau und Grün des offiziellen Webauftritts, bleibt aber als repo-eigene Projektidentität gekennzeichnet.

### Vier Kompass-Marken

| Marke | Kanonisches Markenkit |
| --- | --- |
| Versorgungs-Kompass | `public/brand/versorgungs-kompass/` |
| Stakeholder-Kompass | `public/brand/modules/stakeholder/` |
| Hospitations-Kompass | `public/brand/modules/hospitation/` |
| Format-Kompass | `public/brand/modules/formate/` |

Für den Versorgungs-Kompass bleibt das bestehende Kit unter `public/brand/versorgungs-kompass/` maßgeblich.

Die vier Signets übersetzen dieselbe abgerundete Rautengeometrie in unterschiedliche Konstellationen:

- `Versorgungs-Kompass`: eine verbindende Versorgungskette als offene Brücke,
- `Stakeholder-Kompass`: drei verbundene Knoten als Netzwerk,
- `Hospitations-Kompass`: ein ansteigender Pfad vom Einblick zur Erkenntnis,
- `Format-Kompass`: vier Perspektiven um eine gemeinsame Mitte.

In einer gemeinsamen Übersicht erhalten alle vier Marken dieselbe Kartengröße, typografische Gewichtung und visuelle Präsenz. Auf einer markenspezifischen Fläche steht genau die dort zuständige Kompass-Marke im Vordergrund; `#Mitmachen` bleibt der gemeinsame, räumlich getrennte Absender.

### Varianten und Schutzraum

Für `#Mitmachen` und jedes kanonische Markenkit stehen mindestens diese Varianten bereit:

- `mark.svg` und `mark-on-dark.svg`: Bildmarke ohne Schriftzug,
- `wordmark.svg` und `wordmark-on-dark.svg`: reiner Schriftzug,
- `lockup-horizontal.svg` und `lockup-horizontal-on-dark.svg`: Bildmarke mit Schriftzug.

Die Mindesthöhe beträgt digital 24 px für die Bildmarke und 32 px für den horizontalen Lockup. Rund um die sichtbare Bildmarke bleibt mindestens ein Viertel ihrer Höhe frei. Badges, Taglines und weitere Absender stehen außerhalb dieses Schutzraums.

Auf dunklen Flächen werden ausschließlich die dafür vorgesehenen `*-on-dark.svg`-Varianten verwendet. Signet, Wortmarke und Farbe werden nicht zwischen den vier Marken kombiniert.

## Typografie

Die Webanwendung nutzt robuste System-Fontstacks. Die offiziellen gematik-Webfonts werden nicht in das Repository übernommen, solange keine ausdrückliche Lizenz- und Nutzungsfreigabe vorliegt. Logo-SVGs enthalten deshalb keine eingebetteten oder extern geladenen Schriftdateien.

Für externe Druck- oder Produktionsdateien werden die Wortmarken vor der finalen Übergabe in Kurven umgewandelt. Im Repository bleiben die Texte zugänglich und austauschbar.

## Sprachstil

- konkret, ruhig und praxisnah,
- Menschen und Versorgungsabläufe vor Technik stellen,
- Nutzen und nächsten Schritt klar benennen,
- direkte Sie-Ansprache auf öffentlich zugänglichen Demo-Seiten,
- direkte Du-Ansprache in der geschützten Anwendung,
- keine Superlative und keine Behauptung eines freigegebenen Angebots in Demos.

## Statusvokabular

| Begriff | Bedeutung |
| --- | --- |
| Produktdemo | öffentliche Anwendungsvorschau mit fiktiven Beispieldaten |
| Registrierungsdemo | eigenständige Interaktionsidee; nicht das offizielle gematik-Formular |
| Pre-Integration | technische Vorintegration mit Testdaten oder belastbar anonymisierten Daten |
| geschützte Anwendung | Anwendung nach fachlicher, technischer und betrieblicher Freigabe |

`Demo`, `Pre-Integration` und `geschützte Anwendung` werden nicht synonym verwendet.

## Ablage und Namenswechsel

Maschinenlesbare Namen, Texte, Farben und kanonische Kit-Pfade liegen in `config/brand-architecture.json`. Logoquellen und Nutzungsstatus stehen in `public/brand/asset-manifest.json`.

Bei einem Namenswechsel werden mindestens gemeinsam geändert:

1. `config/brand-architecture.json`,
2. sichtbare Texte in Anwendung, Login, Demo, Manifest und Exporten,
3. Wortmarken und Lockups im betroffenen kanonischen Markenkit,
4. README-Header, Collagen und Bildbeschreibungen,
5. betroffene technische Dokumentation.

Das gematik-Original, der gemeinsame Absender `#Mitmachen` und die vier Marken bleiben technisch getrennte Identitäten.

## Freigabepunkte

- schriftliche Freigabe eines formalen Co-Brandings, falls gematik- und Projektidentitäten gemeinsam als Lockup erscheinen sollen,
- Klärung, wo die repo-eigenen Projektidentitäten außerhalb des Repositories eingesetzt werden dürfen,
- Freigabe von Markenschriften oder Festlegung einer dauerhaft lizenzierten Hausschrift,
- gemeinsame Aktualisierung aller betroffenen Markenassets bei einem späteren Namenswechsel.
