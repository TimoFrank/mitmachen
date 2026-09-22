# Google-Betrieb: Auslieferung und Umschaltung

Dieser Pfad setzt den [Google-Betriebsplan](GOOGLE_BETRIEBSPLAN.md) um.
Er ist vom öffentlichen Pages-Demobetrieb, den historischen Cloud-Run-Demos
und dem gematik-Zielbetrieb getrennt. Ein vorhandenes Skript oder Image ist
kein Nachweis einer erfolgten Domain-Umschaltung.

## Laufzeit und unveränderte Daten

Firebase Hosting leitet ausschließlich weiter; private Anwendungsdateien
werden nicht auf das öffentliche CDN hochgeladen. Der erste Cloud-Run-Dienst
liefert die Anwendung und API aus, der zweite nur den Passwortdienst. Beide
starten ohne Mindestinstanzen, mit höchstens zwei Instanzen und
anfragebezogener Abrechnung. Die bestehende zonale Cloud-SQL-Instanz bleibt
unverändert. Direct VPC Egress und ein gepinnter Cloud SQL Auth Proxy verbinden
die API privat und verschlüsselt mit PostgreSQL. Es gibt keinen neuen
dauerhaft laufenden VPC-Connector.

Die API erhält das Datenbank-Secret und den domainbeschränkten
CARTO-Kartenschlüssel. Nur der getrennte
Passwortdienst erhält das SMTP-Secret und die bisherigen eingeschränkten
Einladungsrechte. Numerische Secret-Versionen und Image-Digests sind Pflicht.
Die Upload- und TYPO3-Freigaben bleiben im bisherigen deaktivierten Zustand.

Identity Platform prüft bestehende Konten. Der Server erstellt einen sicheren,
acht Stunden gültigen `__session`-Cookie, begrenzt durch die bestehende
Zugangsfrist. Er prüft Signatur, Projekt, Tenant, Provider, verifizierte
E-Mail, Kontosperrung und Widerruf. Die verifizierte UID wird exakt auf die
bisherige IAP-Namensraum-Bindung abgebildet; es gibt keine Profilübernahme
anhand einer E-Mail-Adresse und keine Datenbankmigration. Profilaktivität,
Rollen und Testzugang bleiben bei jeder Anfrage wirksam. Abmeldung sperrt
die betreffende Sitzung serverseitig. Browser-Schreibzugriffe verlangen
denselben Origin und JSON. Alle Antworten sind `private, no-store`.

Ein eigener privater GCS-Bucket speichert ausschließlich gehashte
Sitzungssperren und atomare Zähler. Seine Lebensdauer beträgt zwei Tage,
Versionierung und Soft Delete sind deaktiviert. Passwortanfragen sind
instanzübergreifend auf 30 in fünf Minuten, 120 pro Stunde und fünf pro
Adresse und Stunde begrenzt. Sitzungsaufbau ist auf 60 Versuche in fünf
Minuten begrenzt. Der Mailversand wird vor der HTTP-Antwort abgeschlossen;
es bleibt keine ungesicherte Hintergrundarbeit zurück. Bestehende
kontoneutrale Antworttexte und Einladungszustände bleiben erhalten.
Automatische Cloud-Run-Request-Logs werden für diese Dienste ausgeschlossen,
damit fachliche Suchparameter nicht als vollständige URLs gespeichert werden.
Strukturierte Fehler ohne Personenbezug und die Plattformmetriken bleiben erhalten.

## Geschützte Betriebskonfiguration

Konfigurationen und Nachweise liegen owner-only außerhalb von Git.
`deploy/google-hosting/render.mjs` erwartet eine JSON-Datei mit:

- `project`, `region` (`europe-west3`), `revision`, `image`, `origin`,
  `appService`, `resetService`, `siteId`, `aliases`;
- `network`, `subnet`, `subnetCidr` (ein nachgewiesen freies eigenes /24),
  `sqlConnectionName`, `database`, `databaseUser`;
- `databaseSecret`, `smtpSecret` und vor der Öffnung `cartoSecret`, jeweils
  mit `name` und numerischer `version`;
- `stateBucket`, `invitationBucket`, `buckets` mit `profiles`, `contacts`,
  `attachments` und `stakeholderLogos`;
- dem bestehenden öffentlichen Identity-Platform-`apiKey`,
  `accessExpiresAt`, gegebenenfalls `importOwnerProfileId`;
- `policyAdminMember` als ausdrücklich benanntem Infrastruktur-Administrator
  und `cutoverMode` (`closed` als Standard, `open` erst nach Abnahme);
- `resetIngressHost`: vor der Öffnung den exakten Host aus `uri` des
  bereitgestellten Cloud-Run-Passwortdienstes übernehmen. Keine Wildcards und
  keine aus Browser- oder Weiterleitungsheadern abgeleiteten Werte verwenden.

Die Basis wird mit `node deploy/google-hosting/bootstrap.mjs <config> --apply`
additiv eingerichtet. Bereits vorhandene IAM-Bindungen bleiben erhalten.
Fehlen beim menschlichen Infrastrukturkonto ausschließlich Bucket-Policy-Rechte,
kann der dokumentierte
[befristete Policy-Bootstrap](DEPLOYMENT_GCP_AUTOPILOT.md#einmaliger-bootstrap-einer-bestehenden-autoritativen-einladungs-policy)
auf die konkret betroffenen Buckets angewendet werden: nur Bucket- und
Policy-Verwaltung, keine Objektrechte, maximal 90 Minuten. Die genaue
Condition aufbewahren und die Projektbindung unmittelbar nach erfolgreichem
Readback entfernen. Der neue Zustandsbucket erhält einen ausdrücklichen
Policy-Administrator, damit die Entfernung von Legacy-Rechten ihn nicht
unverwaltbar macht.

## Release und getrennte Abnahme

Der kostenlose [CARTO-Kartenschlüssel](https://www.carto.com/basemaps/apikey/)
wird im Secret Manager gehalten und erst bei der profilgeschützten Auslieferung
von `data/runtime-config.js` ergänzt. Er steht weder in Git noch im Image und
ist für berechtigte Browser technisch lesbar. Deshalb im CARTO-Dashboard
ausschließlich Hauptdomain und tatsächlich verwendete Abnahmedomain erlauben.
Die Google-Freigabe verweigert einen fehlenden Schlüssel.

Kacheln laden direkt im Browser mit `key` und der auf Kartenbilder begrenzten
`referrerPolicy: "origin"`. Interne Pfade, Suchbegriffe und Koordinaten werden
nicht als Referrer übertragen; die allgemeine `no-referrer`-Richtlinie bleibt
aktiv. Haupt-, Bundesland- und Kontaktkarte zeigen die Quellenhinweise.
Die Kontaktkarte lädt ausschließlich eigenen Anwendungscode aus einem festen
Pfad. Ihr Rahmen erlaubt denselben Origin, damit CARTO den Domainnachweis
erhält, und neue Fenster für die Quellenlinks. Die übrigen Sandbox-Sperren
sowie die allgemeine CSP und Referrer-Richtlinie bleiben erhalten.
Die [CARTO-Bedingungen](https://carto.com/legal/basemap-terms/) erlauben keinen
eigenen Kachelproxy, keine serverseitige Zwischenspeicherung und keinen
Offline-Kacheldownload. Die Pages-Demo lädt weiterhin keine externen Kacheln.
Zur Abnahme echte Kacheln ohne Schlüsselwarnung, Quellenhinweise, Desktop und
Mobile sowie den unveränderten anonymen Zugriffsschutz prüfen.

1. `npm run qa:full`, `npm run build:pages` und die Google-Vertragstests
   erfolgreich nachweisen. Bei überlasteter lokaler Browserparallelität ist
   dieselbe vollständige Suite mit `npm run test:visual -- --workers=2`
   auszuführen; Fehler dürfen nicht übersprungen werden.
2. Den deutschen Pull Request mit grünen Pflichtprüfungen integrieren.
   Danach den regulären signierten Produkt-Release erzeugen und den exakten
   Tag sauber auschecken. Kein Feature-Branch-Deployment.
3. `node deploy/google-hosting/build-release.mjs <config> <vX.Y.Z> <output>`
   ausführen. Das Skript prüft Integration, unveränderlichen GitHub-Prerelease,
   OpenPGP-Subkey und GitHub-Signatur, baut genau diesen Stand und veröffentlicht
   ein Image mit unveränderlichem Digest. Das erzeugte `release-config.json`
   ist zunächst geschlossen.
4. Die gerenderten `app.json` und `reset.json` mit `gcloud run services replace`
   im expliziten Projekt und in Frankfurt bereitstellen. Nur diese beiden
   Dienste erhalten `roles/run.invoker` für `allUsers`; der serverseitige
   Sitzungsvertrag schützt auch die direkte Cloud-Run-Adresse.
   Die Dienste zunächst geschlossen bereitstellen. Danach den tatsächlichen
   Passwortdienst-Host aus der Google-Servicebeschreibung als `resetIngressHost`
   eintragen und neu rendern. Firebase ersetzt den HTTP-Host beim Weiterleiten;
   nur dieser bestätigte Dienst-Host wird zusätzlich zur Hauptdomain akzeptiert.
   Origin, JSON, Browserheader, Cookie-Verbot und gemeinsame Begrenzungen bleiben
   wirksam. Beide Dienste erfüllen die Mindestgröße von 512 MiB für die zweite
   Cloud-Run-Ausführungsumgebung; die API einschließlich Proxy verwendet 640 MiB.
5. Für die getrennte Abnahme denselben Digest mit eigener Servicebezeichnung,
   eigenem HTTPS-Origin und ausschließlich synthetischer Datenbank konfigurieren.
   Die bestehende Datenbank darf währenddessen keinen zweiten Writer erhalten.
   `publish-hosting.mjs <config> --apply` veröffentlicht die Weiterleitung erst,
   wenn beide Cloud-Run-Dienste mit dem erwarteten Digest und Quellstand bereit
   sind. Es verändert keine DNS-Einträge.
6. Über HTTPS Anmeldung, Abmeldung, gesperrte Konten, fehlende Bindungen,
   Admin/Editor/Viewer und Testzugang prüfen. Kontakte, Organisationen, Karte,
   Hospitationen, Beobachtungen und Exporte mit synthetischen Daten prüfen.
   Zusätzlich Kaltstart, Datenbank-Wiederverbindung, direkte Dienstadressen,
   CSRF, private Cache-Header, Einladungen und Passwortversand prüfen.
   Echte Nutzer erhalten keine Testmails.

Der Frontend-Build verwendet im Google-Pfad denselben Origin für die API.
Dadurch kann dasselbe geprüfte Image von der Abnahme auf die Hauptdomain
übernommen werden. Die bestehende kanonische Google-Anmeldedomain bleibt
erhalten; vor DNS-Umschaltung ist auch deren reservierter `/__/auth`-Pfad
auf Firebase Hosting zu prüfen.

## Umschaltung und Rückweg

Vorher verwaltete Sicherung und isolierte Wiederherstellung nachweisen,
Datensatz- und Identitätsbestände abgleichen und genaue alte Deploymentstände
sowie DNS-Einträge geschützt sichern. Zertifikats- und Eigentumsnachweise
dürfen vorbereitet werden, während die bestehende Domain weiterläuft.
MX-, SPF-, DKIM- und DMARC-Einträge bleiben erhalten.

Im Umschaltfenster zuerst alte API- und Passwort-Writer stoppen und laufende
Anfragen abwarten. Dann den neuen Dienst für dieselbe bestehende Datenbank
öffnen und anschließend die Domain umstellen. Hauptdomain, Weiterleitungen,
Google-Anmeldung, Passwortportal und geschützte Funktionen erneut prüfen.
Ein Rückweg schließt zuerst die neuen Writer, stellt die alte Domainroute
wieder her und startet die alten Dienste mit demselben aktuellen Datenbestand.
Ein alter Dump ist nach neuen Schreibvorgängen kein verlustfreier Rückweg.

## Kontrollierter Abbau

Nach erfolgreicher Abnahme, regulärem Sicherungslauf und dokumentierter
Beobachtung nur ausschließlich alte Ressourcen entfernen: GKE-Workloads und
Cluster, zugehörige Load-Balancer-Komponenten, Cloud Armor, ungenutztes NAT
und kostenpflichtige Prometheus-Erfassung. Vor jedem Schritt die aktuellen
Abhängigkeiten prüfen. Cloud SQL, Sicherungen, VPC, Service-Networking-Peering,
Cloud-Run-Teilnetz, Identity Platform, Dateibuckets, Secrets und benötigte
DNS-Zonen bleiben bestehen. Testkonten, Testdienste und Wiederherstellungs-
instanz nach ihren Nachweisen entfernen.

Kein `terraform destroy` und kein ungeprüftes `terraform apply` im historischen
GKE-Root: Dieser verwaltet auch weiterhin benötigte Daten und IAM-Policies.
Den alten Auslieferungsworkflow nach Umschaltung deaktivieren und seinen
Bestand als historische Rückfallquelle kennzeichnen. Eine alte gestoppte
Datenbank getrennt auf einzigartige Daten, Sicherung und laufende Kosten
prüfen, bevor sie entfernt wird. Kosten erst anhand des verbleibenden
Ressourcenbestands und der verzögerten Abrechnung bestätigen.
