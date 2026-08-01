# Versorgungs-Netzwerk – Registrierung und TYPO3-Kopplung

Stand: 30.07.2026

Das reale #Mitmachen-Formular wird in TYPO3 mit Powermail betrieben. Die
implementierte Kopplung übernimmt Einreichungen aus dem Powermail-Formular UID
`41` serverseitig in eine getrennte Intake-Tabelle des Versorgungs-Kompasses.
Sie legt weder automatisch Kontakte noch Organisationen an.

Die Repo-Seite
`frontend/pages/mitmachen/versorgungs-netzwerk.html` bleibt eine technisch
inerte Konzeptdemo. Sie sendet keine Registrierung, speichert keine Eingabe im
Browser und kennt kein Connector-Secret. Auch das öffentliche Pages-Artefakt
bleibt vollständig vom Real-Intake getrennt.

## Datenfluss

```text
Powermail UID 41
  → TYPO3-Event-Listener
  → lokale referenzbasierte Outbox
  → Retry-Kommando
  → HMAC-signierter M2M-POST
  → Cloud-SQL-Tabelle network_registrations
  → spätere fachliche Prüfung und Zuordnung
```

Der exakte Eingang ist
`POST /api/connectors/typo3/mitmachen-registrations`. Andere Methoden und
abweichende Pfade bleiben durch die zentrale Route-Policy gesperrt. Das GKE-
Deployment verwendet für diesen einzelnen Pfad einen separaten Backend-Service
ohne IAP; der übrige `/api`-Bereich bleibt unverändert hinter IAP. Die fehlende
IAP-Session wird ausschließlich durch die verpflichtende HMAC-Prüfung dieses
M2M-Endpunkts ersetzt.

Der Connector ist in TYPO3 und im Helm-Deployment standardmäßig deaktiviert.
Eine Codebereitstellung allein aktiviert deshalb keinen Datentransfer. Die
vollständige technische Spezifikation, Installation und Aktivierungscheckliste
stehen unter
[TYPO3-#Mitmachen-Connector](./TYPO3_MITMACHEN_CONNECTOR.md).

## Datenschutz- und Einwilligungsgrenze

Die Verarbeitung der Registrierung wird über einen Datenschutzhinweis
transparent gemacht. Sie darf nicht von einer als Einwilligung bezeichneten
Pflicht-Checkbox abhängig sein.

Der bestehende Powermail-Marker `datenschutzhinweis` wird vom Connector bewusst
ignoriert und niemals als freiwillige Kommunikationsfreigabe interpretiert.
Vor der Aktivierung muss die heutige Pflicht-Checkbox im realen Formular durch
einen reinen Hinweis ersetzt werden.

Eine zusätzliche E-Mail-Kommunikation darf nur über das neue, optionale und
standardmäßig nicht ausgewählte Feld mit dem Marker
`mitmachen_email_einwilligung` angefragt werden:

- nicht ausgewählt oder nicht vorhanden: `email_permission_status =
  not_requested`
- ausgewählt: `email_permission_status = pending`
- `granted` entsteht ausschließlich durch einen späteren belastbaren
  Double-Opt-in-Nachweis

Eine fehlende optionale Kommunikationsfreigabe blockiert die operative
Bearbeitung der Registrierung nicht. Die Verarbeitung erzeugt beim Intake
keine aktive #Mitmachen-Einwilligung am Kontakt.

## Betriebsgrenze

Der TYPO3-Listener schreibt nur technische Referenzen und eingefrorene
Versionswerte in die lokale Outbox. Personenbezogene Inhalte bleiben bis zur
Zustellung im bereits vorhandenen Powermail-Datensatz. Netzwerkfehler, HTTP
`429` und Serverfehler werden mit begrenztem Backoff wiederholt; erfolgreiche
`2xx`-Antworten schließen den Eintrag ab, andere `4xx`-Antworten markieren ihn
als permanent fehlerhaft.

Die CRM-Seite verarbeitet eine stabile UUID und einen normalisierten
Payload-Fingerprint idempotent:

- erste identische Einreichung: HTTP `201`
- identische Wiederholung: HTTP `200` ohne zweite Zeile
- gleiche UUID oder gleiche Powermail-Referenz mit abweichenden Daten:
  HTTP `409`

In Request- und Fehlerlogs erscheinen weder E-Mail-Adresse, Namen, Nachricht,
Payload noch HMAC-Secret. Monitoring verwendet nur technische Summen,
HTTP-Status und kontrollierte Fehlercodes.

## Freigabegate

Vor der produktiven Aktivierung müssen mindestens belegt sein:

- abgestimmte Formular-, Datenschutzhinweis- und optionale
  Einwilligungstext-Version,
- Entfernung der bisherigen Pflicht-Einwilligung zur bloßen Verarbeitung und
  Anlage des optionalen Markers,
- angewendete Cloud-SQL-Migration und überprüfte minimale Tabellenrechte,
- getrennte Connector-Ingress-Strecke, TLS und unveränderte IAP-Absicherung des
  übrigen API-Bereichs,
- gemeinsam erzeugtes Secret mit mindestens 32 zufälligen Byte, getrennte
  Secret-Ablage auf beiden Seiten und getestete Rotation,
- aktiver TYPO3-Worker, Alarmierung für wachsende Retry-/Fehlerbestände und
  dokumentierte Aufbewahrungsprüfung,
- synthetischer End-to-End-Smoke ohne echte personenbezogene Daten.

Bis diese Nachweise vorliegen, bleiben beide Aktivierungsschalter aus. Die
Implementierung ist damit bereitstellbar, aber nicht automatisch live.
