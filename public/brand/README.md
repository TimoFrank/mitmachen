# Markenassets

Dieser Ordner enthält die führenden Logo- und App-Assets für `#Mitmachen` und `Versorgungs-Kompass`. Institutioneller Absender, Beteiligungsdach und Produktidentität bleiben technisch getrennt.

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

Diese Dateien sind eine repo-eigene Projektidentität. Sie sind weder ein offizielles gematik-Unternehmenslogo noch ein aus der gematik-Mediathek übernommenes Kampagnenasset.

### Versorgungs-Kompass

- `versorgungs-kompass/mark.svg`: Produkt-Signet für helle Flächen.
- `versorgungs-kompass/mark-on-dark.svg`: Produkt-Signet für dunkle Flächen.
- `versorgungs-kompass/wordmark.svg`: Produktname ohne Signet.
- `versorgungs-kompass/wordmark-on-dark.svg`: Produktname für dunkle Flächen.
- `versorgungs-kompass/lockup-horizontal.svg`: Produkt-Signet mit Wortmarke.
- `versorgungs-kompass/lockup-horizontal-on-dark.svg`: horizontales Produktlogo für dunkle Flächen.
- `versorgungs-kompass/icons/`: aus dem Produkt-Signet abgeleitete PWA- und Favicon-Varianten.

## Verbindliche Regeln

1. Das gematik-Logo wird nur unverändert eingesetzt. Schutzraum, Mindestgröße, Hintergrund und Nutzung richten sich nach dem [offiziellen Dachmarken-Leitfaden](https://www.gematik.de/media/gematik/Medien/Newsroom/Mediaservice/Logo/gematik_Markenleitfaden_Dachmarke_web.pdf).
2. gematik-Logo, `#Mitmachen` und Versorgungs-Kompass werden nicht zu einem neuen Masterlogo verschmolzen. Ein formales Co-Branding benötigt eine vorherige schriftliche Freigabe.
3. Die vier Modulfarben kennzeichnen Versorgung, Stakeholder, Hospitation und Formate in Badges, Farbrails und Karten. Produkt- und Kampagnenlogo werden nicht pro Modul umgefärbt.
4. Rund um eine Bildmarke bleibt mindestens ein Viertel ihrer sichtbaren Höhe frei. Horizontale Lockups werden nicht unter 32 px Höhe verwendet; darunter gilt die jeweilige Bildmarke.
5. Zusatztexte, Taglines, Badges und weitere Absender stehen außerhalb des Logo-Schutzraums.
6. Bei einem Namenswechsel werden `config/brand-architecture.json`, Produkttexte, Wortmarken und Dokumentationsmaterialien gemeinsam aktualisiert.
7. Demo-Medien liegen unter `public/media/demo/` und zeigen ausschließlich fiktive Personen, Organisationen und Fachdaten.

Quelle, Eigentümer, Ableitung und Nutzungsstatus jedes Assets stehen in `asset-manifest.json`. Die redaktionellen Regeln und Modulfarben dokumentiert die [Markenarchitektur](../../dokumentation/produkt-und-design/MARKENARCHITEKTUR.md).

Das gematik-Logo ist Eigentum der gematik GmbH. Es ist nicht von der Apache-2.0-Lizenz dieses Repositories umfasst.
