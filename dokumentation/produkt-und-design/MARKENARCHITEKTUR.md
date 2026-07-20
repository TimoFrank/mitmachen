# Markenarchitektur und Markenkit

Stand: 20.07.2026

Dieses Dokument ist die führende redaktionelle Grundlage für den Auftritt von `#Mitmachen` und `Versorgungs-Kompass` im Repository. Es regelt Absender, Markenhierarchie, Basistexte, Modulfarben, Demo-Kennzeichnung und Logo-Verwendung. UI-Tokens, Primitives, Patterns und Governance folgen in einer späteren Ausbaustufe.

## Markenarchitektur

```text
gematik
└── #Mitmachen
    ├── offizielle Beteiligungsangebote auf gematik.de
    └── Versorgungs-Kompass
        ├── Versorgung
        ├── Stakeholder
        ├── Hospitation
        └── Formate

Repo-Demos
├── Produktdemo mit fiktiven Beispieldaten
└── eigenständige Demoidee für einen Registrierungsablauf
```

| Ebene | Kanonische Benennung | Rolle |
| --- | --- | --- |
| Institutioneller Absender | `gematik`, formal `gematik GmbH` | verantwortende Organisation |
| Beteiligungsdach | `#Mitmachen` | Kampagnenbezeichnung und Kontext für Beteiligungsangebote |
| Produkt | `Versorgungs-Kompass` | gemeinsamer Arbeitsraum für Kontakte, Hospitationen und Versorgungswissen |
| Produktmodule | `Versorgung`, `Stakeholder`, `Hospitation`, `Formate` | stabile Navigation und fachliche Gliederung |
| Registrierungsseite im Repo | `Versorgungs-Netzwerk` | eigenständige Demo, nicht das offizielle gematik-Formular |

`#Mitmachen` ist kein Bestandteil des Produktnamens. Im Layout kann es als Dach oder Kontext oberhalb des Produktnamens stehen. `gematik-Versorgungskompass`, `Der gematik-Versorgungskompass` und `gematik-Hospitationsnetzwerk` sind keine kanonischen Schreibweisen.

## Markenversprechen und Basistexte

### Versorgungs-Kompass

**Name:** Versorgungs-Kompass

**Tagline:** Menschen vernetzen. Beobachtungen verstehen. Wissen gemeinsam nutzen.

**Kurzbeschreibung:**

> Der Versorgungs-Kompass verbindet Kontakte, Organisationen, Hospitationen und Formate zu gemeinsam nutzbarem Versorgungswissen.

**Nutzenversprechen:**

> Der Versorgungs-Kompass macht regionale Versorgung sichtbar, verbindet relevante Perspektiven und überführt Erfahrungen aus Hospitationen in nachvollziehbares Wissen und wirksame Formate.

### #Mitmachen

**Kanonischer Schriftzug:** `#Mitmachen`

**Offizieller gematik-Claim:** Gestalten Sie die digitale Gesundheit mit.

> #Mitmachen bildet das Beteiligungsdach, unter dem Perspektiven und Erfahrungen aus der Versorgung in Austausch, Praxiseinblicke und die gemeinsame Weiterentwicklung digitaler Lösungen einfließen.

Die offiziellen Angebote und Registrierungswege liegen auf [gematik.de/mitmachen](https://www.gematik.de/mitmachen). Der repo-eigene Schriftzug ist eine Projektidentität für Dokumentation und Produktkontext; er ist kein gematik-Unternehmenslogo und wird nicht als offizielles Kampagnenasset ausgegeben.

### Demo zum Versorgungs-Netzwerk

> Diese Seite zeigt eine eigenständige Demoidee. Sie ist weder Kopie noch Bestandteil des offiziellen gematik-Formulars. Eingaben werden nicht übermittelt oder gespeichert. Verbindliche Informationen und die tatsächliche Anmeldung finden Sie beim [Versorgungs-Netzwerk auf gematik.de](https://www.gematik.de/mitmachen/versorgungs-netzwerk).

Der Demo-Status steht vor Hero, CTA und Formular. Das Formular bleibt technisch inert und fordert ausdrücklich zur Verwendung fiktiver Angaben auf.

## Die vier Produktmodule

Die Modulfarben strukturieren Navigation, Badges, Collagen und Kapitel. Sie verändern weder das Produktlogo noch den `#Mitmachen`-Schriftzug und begründen keine eigenständigen Untermarken.

| Modul | Akzent | Dunkel | Hell | Aussage |
| --- | --- | --- | --- | --- |
| Versorgung | `#559EE8` | `#0B5CAD` | `#EAF3FC` | Regionen, Kontakte und Organisationen im Blick. |
| Stakeholder | `#43B391` | `#0F766E` | `#E8F7F4` | Perspektiven und Netzwerke gezielt verbinden. |
| Hospitation | `#E0A44D` | `#A84C16` | `#FFF3E8` | Beobachtungen in belastbares Wissen überführen. |
| Formate | `#A980DA` | `#7A3E91` | `#F4ECFA` | Austausch planen und Wirkung gemeinsam gestalten. |

Für Badges auf den hellen Akzentflächen wird Dunkelblau `#17275F` verwendet. Die dunklen Varianten tragen weißen Text. Modulname oder Icon bleiben immer sichtbar, damit Farbe nie die einzige Information ist.

## Logo-System

### gematik

Führend ist die unveränderte [Standardvariante mit Flagge](https://www.gematik.de/media/gematik/Medien/Newsroom/Mediaservice/Logo/Gematik_Logo_Flag.png). Die Originaldatei liegt unter `public/brand/gematik/gematik-logo-standard.png`; Quelle und Prüfsumme stehen in `public/brand/asset-manifest.json`.

Der [Dachmarken-Leitfaden, Stand Februar 2026](https://www.gematik.de/media/gematik/Medien/Newsroom/Mediaservice/Logo/gematik_Markenleitfaden_Dachmarke_web.pdf) verlangt unter anderem:

- keine Nachkonstruktion, Farbänderung, Verzerrung oder Effekte,
- die Standardvariante mit Wortmarke und Flagge als Regelfall,
- einen Schutzraum von mindestens der Breite des Buchstabens `g`,
- eine Mindestbreite von 10 mm,
- gematik an erster Stelle bei freigegebenem Co-Branding,
- vorherige schriftliche Freigabe für Co-Branding und werbliche Nutzung.

Das gematik-Original wird deshalb nicht in ein Produkt- oder `#Mitmachen`-SVG eingebettet. Bis zu einer formalen Freigabe steht es ausschließlich als räumlich getrennter institutioneller Absender.

### #Mitmachen

Das Kit unter `public/brand/mitmachen/` enthält eine kompakte Hashtag-Marke, eine Wortmarke und horizontale Lockups für helle und dunkle Flächen. Die Gestaltung orientiert sich an Dunkelblau und Grün des offiziellen Webauftritts, bleibt aber als repo-eigene Projektidentität gekennzeichnet.

### Versorgungs-Kompass

Das dreiteilige Signet unter `public/brand/versorgungs-kompass/mark.svg` bleibt die Produktmarke. Wortmarke und Signet stehen im horizontalen Lockup mit festem Sicherheitsabstand; Zusatztexte und Modulbadges liegen außerhalb seines Schutzraums.

### Varianten und Schutzraum

Für beide Projektidentitäten stehen mindestens diese Varianten bereit:

- `mark.svg` und `mark-on-dark.svg`: Bildmarke ohne Schriftzug,
- `wordmark.svg` und `wordmark-on-dark.svg`: reiner Schriftzug,
- `lockup-horizontal.svg` und `lockup-horizontal-on-dark.svg`: Bildmarke mit Schriftzug.

Die Mindesthöhe beträgt digital 24 px für die Bildmarke und 32 px für den horizontalen Lockup. Rund um die sichtbare Bildmarke bleibt mindestens ein Viertel ihrer Höhe frei. Modulbadges, Tagline und weitere Absender stehen außerhalb dieses Schutzraums.

## Typografie

Die Webanwendung nutzt robuste System-Fontstacks. Die offiziellen gematik-Webfonts werden nicht in das Repository übernommen, solange keine ausdrückliche Lizenz- und Nutzungsfreigabe vorliegt. Logo-SVGs enthalten deshalb keine eingebetteten oder extern geladenen Schriftdateien.

Für externe Druck- oder Produktionsdateien werden die Wortmarken vor der finalen Übergabe in Kurven umgewandelt. Im Repository bleiben die Texte zugänglich und austauschbar.

## Sprachstil

- konkret, ruhig und praxisnah,
- Menschen und Versorgungsabläufe vor Technik stellen,
- Nutzen und nächsten Schritt klar benennen,
- direkte Sie-Ansprache auf öffentlich zugänglichen Demo-Seiten,
- direkte Du-Ansprache im geschützten Arbeitsbereich,
- keine Superlative und keine Behauptung eines freigegebenen Angebots in Demos.

## Statusvokabular

| Begriff | Bedeutung |
| --- | --- |
| Produktdemo | öffentliche Anwendungsvorschau mit fiktiven Beispieldaten |
| Registrierungsdemo | eigenständige Interaktionsidee; nicht das offizielle gematik-Formular |
| Pre-Integration | technische Vorintegration mit Testdaten oder belastbar anonymisierten Daten |
| geschützter Arbeitsbereich | Anwendung nach fachlicher, technischer und betrieblicher Freigabe |

`Demo`, `Pre-Integration` und `geschützter Arbeitsbereich` werden nicht synonym verwendet.

## Ablage und Namenswechsel

Maschinenlesbare Namen, Texte und Modulfarben liegen in `config/brand-architecture.json`. Logoquellen und Nutzungsstatus stehen in `public/brand/asset-manifest.json`.

Versorgungs-Kompass ist die kanonische Produktbezeichnung dieses Repositories. Bei einem späteren Namenswechsel werden mindestens gemeinsam geändert:

1. `config/brand-architecture.json`,
2. Produkttexte in App, Login, Demo, Manifest und Exporten,
3. Wortmarken und Produkt-Lockups unter `public/brand/versorgungs-kompass/`,
4. README-Header, Collage und Bildbeschreibungen,
5. Produktname in der technischen Dokumentation, sofern auch der Systemname betroffen ist.

Das gematik-Original, `#Mitmachen` und die Modultaxonomie bleiben technisch getrennte Ebenen.

## Freigabepunkte

- schriftliche Freigabe eines formalen Co-Brandings, falls gematik- und Projektidentitäten gemeinsam als Lockup erscheinen sollen,
- Klärung, wo die repo-eigenen Projektidentitäten außerhalb des Repositories eingesetzt werden dürfen,
- Freigabe von Markenschriften oder Festlegung einer dauerhaft lizenzierten Hausschrift,
- gemeinsame Aktualisierung der Markenassets bei einem späteren Produktnamen.
