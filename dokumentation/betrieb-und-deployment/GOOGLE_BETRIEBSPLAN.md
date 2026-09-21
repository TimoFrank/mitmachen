# Google-Betrieb mit Cloud Run

Stand: 21. September 2026. Status: **Zielentscheidung getroffen,
technischer Google-Pfad vorbereitet; Live-Abnahme und Umschaltung ausstehend.**

Implementierung und verbindlicher Ablauf stehen im
[Google-Betriebsrunbook](GOOGLE_BETRIEB.md). Die vorhandene Domain bleibt bis
zur erfolgreichen technischen Abnahme auf dem bisherigen Betrieb.

## Entscheidung und Geltungsbereich

Der Betreiber hat am 21. September 2026 den Google-Betrieb mit Cloud Run als
bevorzugten Nachfolger des privaten GKE-Betriebs gewählt. Der geplante
Einzelserver bei netcup wird als Zielweg nicht weiterverfolgt. Die vorbereiteten
Einzelserver-Skripte und der offene
[PR #258](https://github.com/TimoFrank/mitmachen/pull/258) sind Vorarbeit,
keine Grundlage für Bestellung, Integration oder Umschaltung auf einen VPS.
Die Entscheidung verwirft keine einzigartigen Commits oder lokalen Änderungen.
Der PR-Abschluss und die Aufbewahrung der Vorarbeit stehen noch aus.

Der bestehende GKE-Betrieb bleibt bis zum geprüften Wechsel der aktive
Auslieferungskanal. Diese Planung ersetzt weder die technische Umsetzung noch
deren Abnahme. Sie verändert keine Ressourcen, Daten, Zugangsbefristungen oder
DNS-Einträge. Pages bleibt die öffentliche Demo; der gematik-Zielbetrieb in der
Software Factory bleibt ein eigener Kanal.

## Gewählter Aufbau

| Aufgabe | Ziel |
| --- | --- |
| Domain, HTTPS und Weiterleitung | Firebase Hosting mit derselben eigenen Domain |
| Anwendung und API | Cloud Run in Frankfurt; bedarfsgesteuerte Abrechnung, zunächst ohne dauerhaft vorgehaltene Instanz |
| Datenbank | Bestehendes Cloud SQL/PostgreSQL in Frankfurt, `db-f1-micro`, zonal, 10 GB SSD, private Anbindung |
| Nutzerkonten | Bestehende Identity Platform mit E-Mail/Passwort und den bereits freigegebenen Anmeldewegen |
| Rechte | Bestehende Profile, Rollen, aktive Identitätsbindungen und Zugriffsbeschränkungen serverseitig erhalten |
| Sicherungen | Tägliche verwaltete Sicherung, 14 automatische Sicherungen aufbewahren, sieben Tage zeitpunktbezogene Wiederherstellung |
| Private Dateien | Bestehende GCS-Bestände und Berechtigungen erhalten; keine zusätzliche Upload-Freigabe durch den Hostingwechsel |

Es wird keine neue produktive Datenbank aufgebaut und kein Wechsel des
Datenbankanbieters geplant. Hochverfügbarkeit mit einer zweiten Datenbank ist
nicht Teil dieses kleinen Betriebs. Seltenere Sicherungen sind kein sinnvolles
Sparziel: Der wesentliche Datenbankpreis entsteht durch Laufzeit und reservierten
Speicher; die bisherigen Sicherungen sollen erhalten bleiben.

## Kostenrahmen

Planungswerte vom 21. September 2026 bei geringer Nutzung, ohne Startguthaben,
ohne Domain und vor Umsatzsteuer:

| Bestandteil | Monatlicher Planungswert |
| --- | ---: |
| Cloud SQL, kleinste Instanz und 10 GB SSD in Frankfurt | rund 10 Euro |
| Cloud Run ohne dauerhaft vorgehaltene Instanz | 0 bis 5 Euro |
| Firebase Hosting und Identity Platform innerhalb der kostenlosen Kontingente | voraussichtlich 0 Euro |
| Kleine Sicherungs-, Speicher-, DNS-, Registry- und Protokollmengen | 1 bis 3 Euro |
| Gesamtbudget einschließlich Reserve | 15 bis 20 Euro netto |

Das ist eine Schätzung für den späteren Betrieb, keine Preisobergrenze und kein
gemessener Cloud-Run-Monat. Laufzeit, Startvorgänge, Datenverkehr und die über ein
Abrechnungskonto geteilten kostenlosen Kontingente beeinflussen den Preis.
Entwicklung, vorübergehender Parallelbetrieb und bewusst aufbewahrte Altressourcen
sind zusätzlich zu berücksichtigen. Eine dauerhaft vorgehaltene Instanz benötigt
eine neue Kostenrechnung. Budgetalarme begrenzen keine Rechnung; maximale
Instanzzahl, Verbindungen und Protokollmengen müssen zusätzlich begrenzt werden.

Die Schätzung setzt den späteren kontrollierten Abbau der ausschließlich für
GKE genutzten Ressourcen voraus: Cluster, externer Load Balancer, nicht mehr
benötigtes NAT, Cloud Armor und kostenpflichtige Prometheus-Erfassung. Eine alte,
gestoppte Datenbank kann weiterhin Speicher- und IP-Kosten verursachen und muss
getrennt inventarisiert werden. Cloud SQL, private Anbindung, Identity Platform,
GCS, DNS und benötigte Secrets dürfen beim GKE-Abbau nicht mit entfernt werden.

## Technische Umsetzung und Abnahme

Die folgenden Punkte sind offen und vor einer Umschaltung nachzuweisen:

1. **Anmeldung und Schutz der Daten:** Die Kombination aus Firebase Hosting,
   Cloud Run und Identity Platform bekommt einen eigenen geprüften
   Sitzungs- und Routingvertrag. Firebase Hosting reicht reguläre IAP-Cookies
   nicht unverändert durch; der vorgesehene Sitzungsweg muss den erlaubten
   `__session`-Cookie beziehungsweise verifizierte Tokens berücksichtigen.
   Geschützte Routen bleiben serverseitig geschützt, auch über direkte
   Cloud-Run-Adressen. Private Antworten dürfen nicht im öffentlichen CDN
   gespeichert werden. Anmeldung, Abmeldung, Einladungen, Passwortzurücksetzen,
   Sperrung, Rollen und Identitätszuordnung werden positiv und negativ getestet.
   Ein neuer Issuer darf kein bestehendes Profil allein anhand seiner
   E-Mail-Adresse übernehmen. Bestehende Zugangsbefristungen bleiben wirksam.
2. **Missbrauchsschutz und Mailversand:** Der bisherige Schutz durch Cloud Armor
   benötigt vor dessen Wegfall einen geprüften Ersatz. Begrenzungen müssen über
   mehrere Instanzen und Neustarts wirken. Passwort-Mails dürfen nicht als
   ungesicherte Hintergrundarbeit nach der HTTP-Antwort verbleiben; der Versand
   muss vor der Antwort abgeschlossen oder dauerhaft eingereiht sein.
3. **Datenbankverbindung und Startverhalten:** Private Anbindung mit Direct VPC
   Egress, verschlüsselter Verbindung und kleinem Verbindungspool umsetzen.
   Nur private Ziele über das VPC führen, sofern der bestehende Schutzvertrag
   dies erlaubt; keinen dauerhaft laufenden Connector allein für die
   Verbindung einführen. Kaltstart, Bereitschaft, Wiederverbindung und typische
   API-Aufrufe messen. Firebase Hosting begrenzt Anfragen auf 60 Sekunden;
   Direct VPC Egress kann beim Start eine Minute oder länger benötigen. Die
   günstigste Konfiguration ist erst nach einem erfolgreichen Starttest
   verwendbar. Bei Bedarf Kosten und Vorhaltung vor der Freigabe neu bewerten.
4. **Auslieferung:** Einen eigenen geschützten Cloud-Run-Auslieferungspfad aus
   integriertem, geprüftem Quellstand und signierter Produktversion vorbereiten.
   Pages, privater Google-Betrieb und gematik-Target bleiben getrennt. Der neue
   Pfad darf weder alte Cloud-Run-Demos reaktivieren noch GKE-/Pages-Artefakte
   ungeprüft übernehmen. Lokale Tests verwenden synthetische Daten und eigene
   Testkonfigurationen.
5. **Sicherung und fachliche Abnahme:** Erfolgreiche automatische Backups und
   Wiederherstellung isoliert nachweisen. Kontakte, Organisationen, Karte,
   Hospitationen, Beobachtungen, Rollen und Exporte auf demselben Quellstand
   prüfen. Der Backup-Nachweis allein ersetzt keinen Wiederherstellungstest.

## Umschaltung, Rückweg und Abbau

Nach der technischen Abnahme folgt ein eigener freigegebener Betriebsablauf:

1. Exakte Versionen, Ressourcenabhängigkeiten, Zugangsfristen, Sicherungsstand
   und Domainverwaltung dokumentieren. Cloud SQL, GCS, Netzwerk und DNS vom
   Lebenszyklus des alten GKE-Deployments entkoppeln; kein pauschales
   `terraform destroy` verwenden.
2. Neue Bereitstellung zunächst getrennt und mit synthetischen Daten prüfen.
   Zwei gleichzeitig schreibende Anwendungsstände an der produktiven Datenbank
   sind nicht Teil des Übergangs. Im vereinbarten Fenster alte Writer stoppen
   und laufende Anfragen abschließen, dann den neuen Stand kontrolliert öffnen.
3. Die produktive Cloud-SQL-Datenbank und die vorhandenen GCS-Objekte bleiben
   erhalten. Notwendige Identitätsanpassungen werden abgeglichen und reversibel
   vorbereitet. Ein Rückweg verwendet denselben aktuellen Datenbestand und
   setzt geprüfte Schema-/Identitätskompatibilität voraus; ein alter Dump ist
   nach neuen Schreibvorgängen kein verlustfreier Rückweg.
4. Domain und Login vollständig prüfen, einen regulären Sicherungslauf abwarten
   und den Betrieb beobachten. Erst nach Abnahme und vereinbarter Rückfallfrist
   ausschließlich unbenötigte alte Ressourcen gezielt abbauen.
5. Ressourcenbestand und verzögerte Abrechnung nachprüfen. Erst dieser Nachweis
   bestätigt die tatsächliche Kostensenkung.

Die historischen Runbooks zur
[Cloud-Run-Abschaltung](CLOUD_RUN_ABSCHALTUNG.md) und
[Cloud-Run-Löschung](CLOUD_RUN_LOESCHUNG.md) betreffen den früheren Demo-Stack.
Sie sind kein Abbauplan für den neuen Google-Betrieb.

## Quellen

- [Cloud-Run-Preise](https://cloud.google.com/run/pricing)
- [Cloud-SQL-Preise](https://cloud.google.com/sql/pricing)
- [Firebase Hosting: Kosten und Kontingente](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- [Identity-Platform-Preise](https://cloud.google.com/identity-platform/pricing)
- [Firebase Hosting mit Cloud Run: Regionen und Zeitlimit](https://firebase.google.com/docs/hosting/cloud-run)
- [Firebase Hosting: Sitzungs-Cookie und Cache](https://firebase.google.com/docs/hosting/manage-cache)
- [Cloud Run: Direct VPC Egress und Startverzögerungen](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Cloud Run: Hintergrundarbeit](https://docs.cloud.google.com/run/docs/tips/general)
- [Cloud SQL: Wiederherstellung und Transaktionsprotokolle](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore)
