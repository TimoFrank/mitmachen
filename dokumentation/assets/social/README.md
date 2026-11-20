# Share-Vorschauen

Die HTML-Dateien in diesem Ordner sind die reproduzierbaren Browserquellen für
die 1200 × 630 Pixel großen Open-Graph-Bilder.

- `versorgungs-kompass-v1.html` rendert das gemeinsame Teilen-Banner für
  `versorgungs-kompass.de` und `versorgungs-kompass.de/demo`. Es verwendet den Rundkompass der Anwendung
  und die Deutschlandkarte mit fiktiven Kontaktorten aus der SharePoint-Vorlage.
  Beide Adressen verwenden dieselbe Grafik aus `deploy/google-hosting/share/versorgungs-kompass-v1.png`.
  Der Linktitel kennzeichnet die Demo.

- `mitmachen-share-v1.html` dokumentiert die erste veröffentlichte Fassung.
- `mitmachen-share-v2.html` dokumentiert die zweite veröffentlichte Fassung
  `public/media/social/mitmachen-share-v2.png`.
- `mitmachen-share-v3.html` rendert die für zentrierte
  Microsoft-Teams-Ausschnitte optimierte
  `public/media/social/mitmachen-share-v3.png`.
- `versorgungs-netzwerk-share-v1.html` rendert
  `public/media/social/versorgungs-netzwerk-share-v1.png`.
- `share-card-preview.html` zeigt beide Bilder zusammen mit den zugehörigen
  Vorschautiteln und -beschreibungen für die visuelle Abnahme.
- `share-card-thumbnail-check.html` zeigt beide Motive zusätzlich in 300 × 158
  und 160 × 84 Pixeln.
- `share-card-teams-crop-check.html` simuliert den mittigen 1,25:1-Ausschnitt
  einer kompakten Microsoft-Teams-Linkkarte.
- `versorgungs-kompass-teams-preview.html` dokumentiert die frühere
  Teams-Linkkarte der Hauptadresse mit dem `#Mitmachen`-Motiv von Pages.

Die Grafiken verwenden ausschließlich projektinterne Markenassets,
synthetische Demo-Inhalte und kein gematik-Unternehmenslogo. Bei einer
inhaltlichen Änderung erhält die Datei eine neue Versionsnummer, damit bereits
von Messengern gecachte Linkvorschauen nicht unbemerkt veraltet bleiben.

Die Motive sind bewusst auf Marke, eine große Botschaft und ein grobes Motiv
reduziert. Die älteren Motive verwenden mindestens 76 Pixel für die Überschrift.
Das gemeinsame Banner der Hauptadresse und der Demo setzt die Überschrift auf
zwei Zeilen in normaler Schriftbreite mit 50 Pixeln. Für alle Motive erfolgt
die Abnahme auch in einer kompakten Vorschau mit weniger als 400 Pixel Kartenbreite.
