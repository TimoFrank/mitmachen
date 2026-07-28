# Markenassets

Dieser Ordner enthält die führenden Logo- und App-Assets für `#Mitmachen` als gemeinsamen Absender sowie für die vier gleichrangigen Kompass-Marken:

- `Versorgungs-Kompass`
- `Stakeholder-Kompass`
- `Hospitations-Kompass`
- `Format-Kompass`

Das gematik-Logo bleibt davon räumlich und technisch getrennt der institutionelle Absender.

## Struktur

### gematik

- `gematik/gematik-logo-standard.png`: unveränderte Originaldatei aus der gematik-Mediathek.

### #Mitmachen

- `mitmachen/mark.svg`: kompakte Hashtag-Bildmarke für helle Flächen.
- `mitmachen/mark-on-dark.svg`: kontrastreiche Bildmarke für dunkle Flächen.
- `mitmachen/wordmark.svg`: vollständiger Schriftzug ohne zusätzliche Bildmarke.
- `mitmachen/wordmark-on-dark.svg`: Wortmarke für dunkle Flächen.
- `mitmachen/lockup-horizontal.svg`: Bildmarke mit Schriftzug.
- `mitmachen/lockup-horizontal-on-dark.svg`: horizontales Lockup für dunkle Flächen.
- `mitmachen/icons/app-icon.svg`: führende Vektorquelle für das Pages-App-Icon.
- `mitmachen/icons/app-icon-{32,180,192,512}.png`: Favicons, Apple-Touch-Icon und PWA-Varianten für Pages.

Diese Dateien bilden den gemeinsamen Absender im Repository. Sie sind weder ein offizielles gematik-Unternehmenslogo noch ein aus der gematik-Mediathek übernommenes Kampagnenasset.

### Vier Kompass-Marken

| Marke | Kanonisches Kit |
| --- | --- |
| `Versorgungs-Kompass` | `public/brand/versorgungs-kompass/` |
| `Stakeholder-Kompass` | `public/brand/modules/stakeholder/` |
| `Hospitations-Kompass` | `public/brand/modules/hospitation/` |
| `Format-Kompass` | `public/brand/modules/formate/` |

Für `Versorgungs-Kompass` ist `public/brand/versorgungs-kompass/` das kanonische Markenkit.

Jedes kanonische Kit enthält:

- `mark.svg` und `mark-on-dark.svg`: kompaktes Signet,
- `wordmark.svg` und `wordmark-on-dark.svg`: ausgeschriebener Markenname,
- `lockup-horizontal.svg` und `lockup-horizontal-on-dark.svg`: Signet und Wortmarke als horizontales Logo.

`versorgungs-kompass/icons/` enthält zusätzlich die aus dem Signet abgeleiteten PWA- und Favicon-Varianten.

Alle vier Signets verwenden dieselbe abgerundete Rautengeometrie. Konstellation, ausgeschriebener Name und Markenfarbe unterscheiden die vier gleichrangigen Marken; die gemeinsame Formensprache zeigt ihre Zusammengehörigkeit.

## Verbindliche Regeln

1. Das gematik-Logo wird nur unverändert eingesetzt. Schutzraum, Mindestgröße, Hintergrund und Nutzung richten sich nach dem [offiziellen Markenleitfaden in der gematik-Mediathek](https://www.gematik.de/newsroom/mediathek).
2. gematik-Logo, `#Mitmachen` und die jeweilige Kompass-Marke werden nicht zu einem neuen kombinierten Logo verschmolzen. Ein formales Co-Branding benötigt eine vorherige schriftliche Freigabe.
3. `#Mitmachen` erscheint als gemeinsamer Absender für alle vier Marken. Es wird nicht Bestandteil ihrer Namen.
4. Keine der vier Kompass-Marken wird als übergeordnet dargestellt. Größe, Abstand und Platzierung folgen in gemeinsamen Übersichten demselben Prinzip.
5. Für jede Marke wird ausschließlich das in der Tabelle genannte kanonische Kit verwendet. Signets und Wortmarken werden nicht zwischen Marken gemischt oder umgefärbt.
6. Rund um ein Signet bleibt mindestens ein Viertel seiner sichtbaren Höhe frei. Horizontale Lockups werden nicht unter 32 px Höhe verwendet; darunter gilt das jeweilige Signet.
7. Weitere Absender, Taglines und Badges stehen außerhalb des Logo-Schutzraums.
8. Bei einem Namenswechsel werden `config/brand-architecture.json`, Produkttexte, Wortmarken und Dokumentationsmaterialien gemeinsam aktualisiert.
9. Demo-Medien liegen unter `public/media/demo/` und zeigen ausschließlich fiktive Personen, Organisationen und Fachdaten.

Quelle, Eigentümer, Ableitung und Nutzungsstatus der Assets stehen in `asset-manifest.json`. Die redaktionellen Regeln und Markenfarben dokumentiert die [Markenarchitektur](../../dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).

Das gematik-Logo ist Eigentum der gematik GmbH. Es ist nicht von der Apache-2.0-Lizenz dieses Repositories umfasst.
