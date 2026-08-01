# #Mitmachen Flechtwerk – Motion-Kit

Stand: 1. August 2026

Das Motion-Kit übersetzt die Flechtlogik des Signets in eine feste Bewegungsidentität. Vier eigenständige Bänder
kommen aus unterschiedlichen Richtungen, greifen ineinander und stehen anschließend ruhig als gemeinsames Zeichen.

Der Schriftzug ist auf den neuen Markenmaster abgestimmt: `Mitmachen` in Source Sans 3 v3.052, Gewicht 650,
mit nativer Unterschneidung und einem Tracking von `-0.01em`. Er ist in Titel-Schreibweise vollständig in
gefüllte Vektorpfade umgewandelt; die Motion-Dateien laden keine Schrift zur Laufzeit.
Die vollständige Festlegung steht im [Wortmarkenmaster](../WORTMARKE.md).

[Browser-Demo des Motion-Kits](index.html)

## Motion-Signatur „Einweben“

| Zeit | Bewegung |
| --- | --- |
| 80–680 ms | Linkes Navy-Band, oben nach unten |
| 180–780 ms | Oberes grünes Band, links nach rechts |
| 280–880 ms | Rechtes Navy-Band, unten nach oben |
| 380–980 ms | Unteres grünes Band, rechts nach links |
| 820–1420 ms | Schriftzug als zusammenhängende Einheit |
| ab 1420 ms | Vollständiges Logo bleibt ruhig stehen |

Die Bänder verwenden `cubic-bezier(.33, 0, .2, 1)`, der Schriftzug
`cubic-bezier(.22, 1, .36, 1)`. Es gibt keine Rotation, Federung, Skalierung, Partikel, Glows oder Farbwechsel.

## Web-SVGs

### Einmaliges Reveal

- [Signet auf hellen Flächen](flechtwerk-mark-reveal.svg)
- [Signet auf dunklen Flächen](flechtwerk-mark-reveal-on-dark.svg)
- [Lockup auf hellen Flächen](flechtwerk-lockup-reveal.svg)
- [Lockup auf dunklen Flächen](flechtwerk-lockup-reveal-on-dark.svg)

Die Animation endet nach spätestens 1,42 Sekunden und bleibt anschließend statisch. Sie eignet sich für
Website-Hero, Kampagneneinstieg, Video-Ladeabschluss oder einen bewusst gesetzten Markenmoment.

```html
<img
  src="/brand/motion/flechtwerk-lockup-reveal.svg"
  width="410"
  height="96"
  alt="#Mitmachen"
/>
```

Wird das Signet dekorativ neben einem bereits vorhandenen Markennamen eingesetzt, bleibt der Alternativtext leer:

```html
<img
  src="/brand/motion/flechtwerk-mark-reveal.svg"
  width="64"
  height="64"
  alt=""
  aria-hidden="true"
/>
```

### Ruhiger Loop

- [Signet-Loop auf hellen Flächen](flechtwerk-mark-loop.svg)
- [Signet-Loop auf dunklen Flächen](flechtwerk-mark-loop-on-dark.svg)

Der 4,8-Sekunden-Loop beginnt und endet mit dem vollständigen Logo. Insgesamt bleibt die Marke länger vollständig
sichtbar als sie sich bewegt. Er ist für Social-Kommunikation, Event-Screens und bewusst isolierte Markenflächen
gedacht, nicht für Navigation oder dauerhaft sichtbare Leseflächen.

### Handkreis

| Variante | Animierter Master | Statischer Fallback | Charakter |
| --- | --- | --- | --- |
| Offene Einladung | [SVG](flechtwerk-circle-loose.svg) | [SVG](flechtwerk-circle-loose-static.svg) | Lockerer grüner Einzelzug; empfohlene Markenvariante |
| Skizzen-Doppelspur | [SVG](flechtwerk-circle-double.svg) | [SVG](flechtwerk-circle-double-static.svg) | Zwei nicht deckungsgleiche Linien für Kampagne und Workshop |
| Freier Orbit | [SVG auf Navy](flechtwerk-circle-orbit-on-dark.svg) | [statisches SVG](flechtwerk-circle-orbit-on-dark-static.svg) | Energischer, offener Abschluss für Event, Bühne und Social |

Der Kreis wird als eigener, dünnerer Stiftzug um das vollständig ruhige Signet gezeichnet. Die Pfade sind bewusst
leicht verschoben und nicht geometrisch rund. **„Offene Einladung“ ist die empfohlene kanonische Variante**, weil sie
auch statisch klar bleibt und dem Flechtwerk sichtbar den Vorrang lässt.

```html
<img
  src="/brand/motion/flechtwerk-circle-loose.svg"
  width="128"
  height="128"
  alt="#Mitmachen"
/>
```

Die Handkreis-Animation wird erst ab 64 CSS-Pixeln eingesetzt; die Doppelspur erst ab 80 Pixeln. In Navigation,
Favicons und kleinen Produktslots bleibt ausschließlich das kanonische Signet ohne Kreis.

Alle Web-SVGs sind selbstständig, enthalten keine externen Schriften oder Skripte und animieren ausschließlich unter
`prefers-reduced-motion: no-preference`. Bei reduzierter Bewegung steht sofort das vollständige Endbild.

## GIF und Video

| Datei | Spezifikation | Typischer Einsatz |
| --- | --- | --- |
| [Signet-GIF](exports/flechtwerk-signet-loop-dark-640.gif) | 640 × 640, 20 fps, 4,8 s, Navy | E-Mail, einfache Einbettung |
| [Signet-MP4](exports/flechtwerk-signet-loop-dark-1080.mp4) | 1080 × 1080, H.264, 30 fps, 4,8 s | Social Media, PowerPoint |
| [Signet-WebM mit Alpha](exports/flechtwerk-signet-loop-alpha-1080.webm) | 1080 × 1080, VP9-Alpha, 30 fps, 4,8 s | Transparente Web-Komposition |
| [Lockup-Video](exports/flechtwerk-lockup-reveal-dark-1920x1080.mp4) | 1920 × 1080, H.264, 30 fps, 3,2 s | Video-Bumper, Bühne, PowerPoint |
| [Signet-Poster](exports/flechtwerk-signet-poster-dark-1080.png) | 1080 × 1080 | Fallback und Video-Poster |
| [Lockup-Poster](exports/flechtwerk-lockup-poster-dark-1920x1080.png) | 1920 × 1080 | Fallback und Video-Poster |

MP4-Dateien enthalten keine Audiospur, verwenden `yuv420p` und Faststart. Der transparente WebM-Master ist eine
Ergänzung; für Safari und Präsentationssoftware bleibt das MP4 beziehungsweise das animierte SVG der Fallback.

### Video-Einbau

```html
<video
  autoplay
  muted
  loop
  playsinline
  preload="metadata"
  poster="/brand/motion/flechtwerk-signet-poster-dark-1080.png"
>
  <source
    src="/brand/motion/flechtwerk-signet-loop-dark-1080.mp4"
    type="video/mp4"
  />
  <img
    src="/brand/motion/flechtwerk-signet-poster-dark-1080.png"
    alt="#Mitmachen"
  />
</video>
```

Videos unterhalb des sichtbaren Bereichs sollen erst bei Viewport-Eintritt starten und beim Verlassen pausieren.
Bei `prefers-reduced-motion: reduce` wird ausschließlich das Posterbild angezeigt.

## Einsatzregeln

1. Das Website-Reveal läuft höchstens einmal pro Seitenaufruf oder bewusstem Viewport-Eintritt.
2. Navigation, Favicons und Signets unter 32 Pixeln bleiben statisch.
3. Der Loop wird nicht direkt neben längeren Texten oder dauerhaft in einer Navigation eingesetzt.
4. Die vier Flechtfugen bleiben während der gesamten Bewegung geometrisch unverändert.
5. Das Endbild entspricht exakt dem statischen Markenmaster.
6. GIFs werden auf einer festen hellen oder dunklen Fläche ausgegeben; transparente GIFs sind kein Masterformat.
7. MP4/H.264 besitzt keine Transparenz. Für Alpha stehen WebM beziehungsweise die animierten SVGs zur Verfügung.
8. Jede Videoeinbindung erhält ein Poster und eine statische Fallbackgrafik.
9. Der Handkreis bleibt deutlich dünner als die vier Flechtbänder und berührt das Signet nicht.
10. Der Handkreis wird einmal gezeichnet und bleibt anschließend ruhig; es gibt keinen Dauerloop.
11. Unter 64 Pixeln wird kein animierter Kreis eingesetzt, unter 32 Pixeln entfällt er vollständig.

## Exporte reproduzieren

Die Medienmaster werden deterministisch aus Vektorpfaden gerendert:

```bash
NODE_PATH=/path/to/node_modules \
FFMPEG_BIN=/path/to/ffmpeg \
node scripts/render_flechtwerk_motion.mjs
```

Erforderlich sind Node.js, `sharp` und ffmpeg 6 oder neuer mit `libx264` und `libvpx-vp9`. Das Skript schreibt nur in
`motion/exports/`, verwendet ein eigenes temporäres Frame-Verzeichnis und entfernt dieses nach erfolgreichem oder
fehlgeschlagenem Export.

## Barrierefreiheit und Browserverhalten

- [W3C Technique C39 zu `prefers-reduced-motion`](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)
- [WCAG 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- [MDN: SVG als Bild](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
- [MDN: Video-Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)

Die statischen Markenmaster unter `../assets/` und die beiden Lockup-Reveals verwenden denselben Wortmarken-Endzustand.
Die Medienexporte werden aus demselben Pfadmaster in `scripts/render_flechtwerk_motion.mjs` erzeugt.
