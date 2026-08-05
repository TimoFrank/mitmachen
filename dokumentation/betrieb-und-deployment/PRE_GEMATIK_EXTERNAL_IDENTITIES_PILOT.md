# Befristeter IAP-Pilot mit Identity Platform

Status: Umsetzungs- und Betriebsvertrag für `pre-gematik`; **noch kein
Live-Nachweis und keine institutionelle Freigabe**

Stand: 4. August 2026

## Zweck und enger Geltungsbereich

Dieser Vertrag beschreibt einen auf höchstens 62 Kalendertage begrenzten
Übergang, bis der gematik-OIDC-Zielzugang nutzbar ist. Bestehende persönliche
Google-Konten sollen weiter funktionieren. Zusätzlich werden genau zwei oder
drei persönliche Konten mit E-Mail und Passwort administrativ vorprovisioniert.

Der Übergang gilt ausschließlich für die beiden bereits IAP-geschützten
Backend-Services der Umgebung `pre-gematik`:

- geschütztes Anwendungsfrontend und
- API.

Der öffentliche, datenfreie Einstieg bleibt unverändert. Der gematik-Zielpfad,
die öffentliche Demo und andere Umgebungen werden nicht auf Identity Platform
umgestellt.

Für diesen Pilot gilt:

| Merkmal | Verbindlicher Wert |
| --- | --- |
| IAP-Identitätsmodus | `IAP_IDENTITY_MODE=external` |
| Provider | Google sowie E-Mail/Passwort |
| Identity-Platform-Projekt | dasselbe GCP-Projekt wie die IAP-Ressourcen |
| Projektvariable | `IAP_GCIP_PROJECT_ID` entspricht exakt der kanonischen GCP-Projekt-ID |
| Tenants | keine; ausschließlich projektweite Provider |
| Tenantvariable | `IAP_GCIP_TENANT_ID` bleibt leer |
| Passwortkonten | genau 2–3 persönliche, administrativ angelegte Konten |
| Selbstregistrierung | deaktiviert |
| Selbstlöschung | deaktiviert |
| Anonyme, Telefon-, SAML- oder weitere OIDC-Provider | deaktiviert |
| MFA | für diesen Übergang nicht erzwungen |
| Fachliche Rolle neuer Passwortkonten | ausschließlich `viewer` oder `editor` mit `test_only` |
| Laufzeit | konkreter UTC-Zeitpunkt, höchstens 62 Tage nach Cutover und nie länger als der zugrunde liegende Echtdaten-Pilot |
| Ablaufvariable | `IAP_EXTERNAL_ACCESS_EXPIRES_AT` im kanonischen RFC-3339-UTC-Format |

Der konkrete Ablaufzeitpunkt, Konten, Identity-Platform-UIDs, Subjects,
Profil-IDs und Freigaben stehen nur im geschützten Voll-Soll-Roster. Diese Werte
gehören weder in Git noch in Build-Artefakte oder ungeschützte Logs.

Dieser Authentisierungsvertrag verlängert weder den 28-Tage-Zeitraum noch die
Lösch- und Aufbewahrungsentscheidung des zugrunde liegenden Echtdaten-Piloten.
Wirksam ist immer der früheste Zeitpunkt aus
`IAP_EXTERNAL_ACCESS_EXPIRES_AT`, gematik-Go-live und dem bereits genehmigten
Pilot-/Löschende. Eine darüber hinausgehende Datenbereitstellung benötigt eine
separate Entscheidung. Das aktuell festgelegte Ende des Datenpiloten ist
`2026-09-30T16:00:00Z`. Ohne eine getrennt genehmigte Verlängerung dieses
Datenpiloten kann der hier beschriebene Authentisierungspilot deshalb nicht die
gewünschten ein bis zwei Monate laufen; auch ein späterer Wert in
`IAP_EXTERNAL_ACCESS_EXPIRES_AT` würde daran nichts ändern.

## Befristete Sicherheitsausnahme

Der Wechsel ist eine bewusste, zeitlich begrenzte Abweichung von G-03 der
[Echtdaten-Pilotentscheidung](PRE_GEMATIK_ECHTDATEN_PILOT_ENTSCHEIDUNG.md):

- Identity-Platform-Identitäten können nicht mit der bisherigen
  Google-IAM-Gruppe autorisiert werden.
- Die IAP-Reauthentication mit `ENROLLED_SECOND_FACTORS` wird für externe
  Identitäten nicht unterstützt.
- Die zwei oder drei Passwortkonten besitzen in diesem Übergang keinen zweiten
  Faktor.
- Der bisherige direkte IAM-Break-glass-Nutzer vermittelt im External-Modus
  keinen Anwendungszugriff. Der Plattform-Owner behält ausschließlich die
  administrativen Rechte, um auf den gesicherten IAM-Zustand zurückzuschalten.

Google dokumentiert sowohl die
[Unvereinbarkeit von External Identities und IAM-Autorisierung](https://cloud.google.com/iap/docs/enable-external-identities)
als auch die
[fehlende Reauthentication-Unterstützung](https://cloud.google.com/iap/docs/configuring-reauth).

Vor dem Live-Cutover muss der persönlich verantwortliche Pilot-Owner im
geschützten Entscheidungsnachweis mindestens bestätigen:

1. konkreter Beginn und exakter UTC-Ablauf,
2. exakte Zahl der Google- und Passwortkonten,
3. Verzicht auf MFA für die Passwortkonten,
4. Rollen und `test_only`-Grenze,
5. kompensierende Kontrollen dieses Dokuments und
6. getesteter IAM-Rollback.

Ohne diese Bestätigung bleibt `IAP_IDENTITY_MODE=iam`. Eine Verlängerung,
ein weiteres Konto, eine höhere Rolle, `standard`-Scope für ein Passwortkonto
oder eine Laufzeit über 62 Tage ist eine neue Entscheidung und kein
Routinebetrieb.

## Technischer Identitätsvertrag

IAP bleibt die signierende Grenze. Auch bei External Identities sendet IAP auf
jeder authentifizierten Anfrage ein signiertes
`x-goog-iap-jwt-assertion`. Die API bleibt deshalb im
`API_AUTH_MODE=iap`, prüft weiterhin IAP-Signatur, IAP-Issuer, reale
Backend-Audience und Zeitclaims. Im External-Modus prüft sie zusätzlich
Provider, `email_verified=true`, inneres GCIP-Subject, Projekt-/Tenant-Namespace
und die exakte Konsistenz mit äußerem IAP-Subject und -E-Mail. Sie vertraut weder
Browser-Token noch unsignierten Identitätsheadern. Google beschreibt dieses
Format unter
[JWTs for external identities](https://cloud.google.com/iap/docs/signed-headers-howto#jwts_for_external_identities).

Für projektweite Identity-Platform-Provider ohne Tenant gilt:

| Feld | Vertrag |
| --- | --- |
| äußerer IAP-`iss` | `https://cloud.google.com/iap` |
| äußerer IAP-`aud` | reale Audience des jeweiligen Backend-Service |
| äußerer IAP-`sub` | `securetoken.google.com/PROJECT-ID:IDENTITY-PLATFORM-UID` |
| App-Autorisierung | exakt ein aktives `(issuer, subject)`-Binding auf ein aktives Profil |
| E-Mail | Anzeige-/Kontaktmerkmal, niemals Rollen- oder Berechtigungsschlüssel |

Das äußere, namespacete IAP-Subject wird bytegenau gebunden. Es wird weder aus
der E-Mail-Adresse abgeleitet noch auf die Google-Provider-ID, den inneren
`gcip.sub` oder einen alten IAP-Subject verkürzt. Das innere `gcip`-Objekt kann
für einen geschützten Abgleich des Providers genutzt werden, verleiht aber
selbst keine App-Rolle.

### Notwendiger Subject-Remap

Die bisherige Google-IAP-Identität und die neue Identity-Platform-Identität
besitzen denselben äußeren IAP-Issuer, aber unterschiedliche Subjects:

- vorher: namespace-lose numerische Google-Konto-ID nach der vorhandenen
  kanonischen IAP-Normalisierung,
- nachher:
  `securetoken.google.com/PROJECT-ID:IDENTITY-PLATFORM-UID`.

`public.identity_bindings` erzwingt `unique (issuer, profile_id)`. Deshalb
können die alte und die neue Bindung für dasselbe Profil **auch inaktiv nicht
parallel gespeichert werden**. Der Cutover benötigt einen ausdrücklich
freigegebenen, transaktionalen Subject-Remap:

1. vollständigen alten `(issuer, subject, profile_id, active, role/scope)`-
   Zustand geschützt sichern,
2. neuen vollständigen Sollzustand zweimal read-only previewen,
3. beim Apply sowohl den Eingabe-Fingerprint als auch den
   `current_state_fingerprint` aus demselben unmittelbar bestätigten Preview
   übergeben,
4. innerhalb einer Transaktion nur die genehmigten Subjects ersetzen,
5. Profilaktivität, Rolle, Binding-Aktivität, `access_scope` und `scope_ref`
   unverändert abgleichen,
6. nach Commit den vollständigen Soll-Fingerprint read-only bestätigen und
7. den umgekehrten Remap mit dem gesicherten Vorzustand vorab als Rollback
   verifizieren.

Der `current_state_fingerprint` bindet den unmittelbar gelesenen Istzustand aus
Issuer, Subject, Profil-ID, Binding-Aktivität, Scope, Scope-Referenz,
Profilrolle und Profilaktivität an den Apply. Ab Enrollment-v2 besitzt
`vk_identity_admin` hierfür neben Leserechten ausschließlich
`UPDATE (subject)` auf `identity_bindings`; ein Insert oder eine Änderung
anderer Binding-Spalten ist datenbankseitig nicht möglich.

Profile werden dabei absichtlich nur gelesen und nicht per `FOR SHARE`
gesperrt: PostgreSQL 16 setzt für diese Zeilensperre ein Schreibrecht auf
`profiles` voraus, das dem Least-Privilege-Vertrag widerspräche. Der Remap
bleibt durch `SERIALIZABLE`, den transaktionalen Identity-Operator-Advisory-
Lock, den bestätigten Ist-Fingerprint und die vollständige Abschlussprüfung
abgesichert. Das Entfernen der unnötigen Lesesperre ändert keine Rolle, kein
Grant und keinen erlaubten Schreibpfad; Profilmutationen bleiben
datenbankseitig verboten.

Die Anwendung erzeugt, verknüpft oder repariert keine Bindung. Ein
Passwortkonto wird vor der Einladung administrativ und exakt auf sein bereits
vorhandenes aktives Profil gebunden oder im ausdrücklich getrennten
Online-Neunutzervertrag atomar zusammen mit genau einem neuen Profil angelegt.
Der frühere Post-Login-Weg über
`POST /api/auth/external-enrollment`, eine Pending-Anfrage und den
v2-Testzugangsoperator ist für Passwortgäste **kein aktiver Sollweg**. Er darf
weder durch die Loginseite noch manuell aufgerufen werden; eine vorhandene
Pending-Anfrage für dieselbe UID, E-Mail, Profil-ID oder dasselbe Subject ist
ein `NO-GO` und lässt den Prebinding-Operator fail-closed abbrechen.

Ein E-Mail-Fallback, eine Parallelzeile, ein manuelles Einzel-`UPDATE` ohne
Preview oder das Löschen der alten Bindung ohne gesicherten Rückweg sind
ebenfalls No-Go. Der historische Operator aus
[PRE_GEMATIK_IDENTITY_ADMIN.md](PRE_GEMATIK_IDENTITY_ADMIN.md) darf nur genutzt
werden, wenn seine konkrete Version den vollständigen Google-Remap samt
Preview, Fingerprint, Eindeutigkeitsprüfung und Rückweg ausdrücklich
unterstützt. Das Gast-Prebinding läuft ausschließlich über
`scripts/provision_pre_gematik_identity_platform_guest_access.mjs`.

## Administrative Vorprovisionierung

### 1. Geschütztes Voll-Soll-Roster

Vor jeder Plattformänderung enthält das geschützte Roster für jedes Konto:

- Person und bestätigte Kontaktadresse,
- Provider `google.com` oder `password`,
- stabile Identity-Platform-UID,
- bei Google zusätzlich die unabhängig bestätigte Google-Provider-ID,
- erwartetes vollständiges äußeres IAP-Subject,
- bei bestehenden Google-Nutzern und Passwortkonten mit Bestandsprofil die
  bereits vorhandene Profil-ID, bei einem echten Neunutzer die vorab
  genehmigte neue Profil-ID,
- Rolle,
- `access_scope` und gegebenenfalls `scope_ref`,
- Aktivierungs- und Ablaufzeitpunkt,
- Freigabestatus sowie
- alter IAP-Subject und geprüfter Rollback-Zustand, sofern vorhanden.

Keine UID und kein Subject wird allein aus einer E-Mail-Adresse abgeleitet.
Dasselbe Profil darf im Sollzustand genau ein aktives External-IAP-Subject
besitzen.

### 2. Identity Platform und Provider

Identity Platform wird im selben Projekt wie IAP aktiviert. Projektweit werden
ausschließlich Google und E-Mail/Passwort eingeschaltet. Multi-Tenancy wird
nicht aktiviert.

`authorizedDomains` ist als exakte, nicht erweiterbare Menge auf
`versorgungs-kompass.de`,
`steam-capsule-341212.firebaseapp.com` und `iap.googleapis.com` gepinnt. Die
Firebase-Domain bleibt ausschließlich für einen geprüften Rückweg
vorregistriert; der primäre technische OAuth-Handler liegt unter
`https://versorgungs-kompass.de/__/auth/handler`. `iap.googleapis.com` ist für
den External-IAP-Anmeldefluss erforderlich. Eine fehlende oder zusätzliche
Domain stoppt den Deployment-Preflight fail-closed.

Der GKE Ingress veröffentlicht nur am Apex den Prefix `/__/auth/` vor dem
IAP-geschützten Catch-all. Ein dediziertes, tokenloses
`frontend-auth-proxy`-Deployment leitet nur `GET`, `HEAD` und `POST` mit
unverändertem Pfad und Query an den festen HTTPS-Upstream
`steam-capsule-341212.firebaseapp.com` weiter. TLS-SNI und Zertifikatsprüfung
sind erzwungen, Redirect-Rewriting ist deaktiviert und nur eine minimale
Request-Header-Allowlist wird weitergegeben; Cookies, Authorization- und
IAP-Identity-Header erreichen den Upstream nicht. Ein etwaiger
Upstream-`Set-Cookie`-Header wird nicht auf den gemeinsamen Apex übertragen;
der Firebase-Helper verwendet dort Browser-Web-Storage. Die Workload besitzt
weder Cloud-IAM-Bindung noch Secrets oder Kubernetes-API-Token; Load-Balancer-
und nginx-Zugriffslogging sind deaktiviert. Root, der nackte Pfad `/__/auth`,
Near-Misses, normalisierte Aliase, nicht erlaubte Methoden und derselbe Prefix
auf `www` oder den alten Hosts bleiben geschlossen. Es existiert weder ein
variabler Upstream noch eine Catch-all- oder Alias-Proxyroute.

In den Identity-Platform-Einstellungen werden die Nutzeraktionen
`account creation` und `account deletion` deaktiviert. Dadurch führen
Clientversuche zur Kontoerstellung oder -löschung fail-closed zu
`auth/admin-restricted-operation`. Der Hersteller beschreibt diese Einstellung
unter
[Identity Platform user self-service](https://cloud.google.com/identity-platform/docs/concepts-manage-users#user_self-service).

Die eigene, unter `https://versorgungs-kompass.de/anmelden` ausgelieferte
Loginseite zeigt nur:

- `Mit Google anmelden`,
- E-Mail und Passwort,
- `Passwort vergessen?` für bereits administrativ vorprovisionierte,
  verifizierte Passwort-only-Konten und
- einen funktionierenden vollständigen Logout.

Sie enthält keine Selbstregistrierung, keine anonyme Anmeldung und kein
Account-Linking. Die Oberfläche ruft ausschließlich den gleichursprünglichen,
minimal privilegierten Broker über den exakten Pfad
`POST /api/auth/password-reset` auf. Der Broker läuft in einem separaten
Deployment ohne Datenbank- oder Cloud-SQL-Zugriff. Seine
Workload Identity besitzt neben `firebaseauth.users.get` und
`firebaseauth.users.sendEmail` ausschließlich Storage Get und Update für den
bedingten Objektprefix `active/` des privaten Einladungs-Buckets. List, Create,
Delete und Restore bleiben verboten. Update ist ausschließlich für
generationen- und metagenerationengepinnte Zustandswechsel der bereits
vorhandenen Objekte zulässig. Zusätzlich darf die Workload Identity nur die
aktive Version des dedizierten SMTP-Passwort-Secrets lesen. Der Broker versendet die
versionierte #Mitmachen-Mail per SMTPS ausschließlich über
`w01abca0.kasserver.com:465` als `zugang@versorgungs-kompass.de`; seine
NetworkPolicy öffnet dafür nur TCP 465. Er versendet nur für genau einen aktiven,
verifizierten Passwort-only-Account einen Self-Service-Reset-Link; die
Continue-URL ist serverseitig bytegenau auf
`https://versorgungs-kompass.de/start` festgelegt.

Der unveränderliche Objektinhalt bindet Konto und Einladung; ausschließlich die
Custom Metadata bildet die generationen- und metagenerationengepinnten Zustände
`active` → `minting` → `issued` → `consumed` beziehungsweise `uncertain` ab.
Der CAS-Wechsel von `active` auf `minting` bestimmt genau einen Gewinner. Nach
erfolgreicher Erzeugung und Read-only-Prüfung speichert der Broker den
Provider-Action-Link tokengebunden mit AES-256-GCM verschlüsselt in der Custom
Metadata und wechselt auf `issued`. Ein Antwort-Retry mit demselben
Einladungs-Token liefert exakt denselben entschlüsselten Code; er löst keinen
zweiten Provider-Request aus.

Nach dem erfolgreichen Passwort-Update ruft der Browser denselben
`POST /api/auth/password-reset` mit
`{invitationToken, finalize: true}` auf. Erst der erfolgreiche
Password-Update-Readback des Brokers erlaubt den CAS-Wechsel von `issued` auf
`consumed`; das Objekt bleibt bis zum Bucket-Lifecycle erhalten. Definitive
Fehler vor dem Provider-Request oder definitive Provider-4xx-Antworten dürfen
`minting` per CAS auf `active` zurücksetzen. Bei Timeout, Verbindungsabbruch
oder einem sonst unklaren Providerausgang wird die Einladung dagegen
`uncertain` und niemals automatisch erneut gemintet. Der Operator reconciliiert
diesen Zustand geschützt, bevor gegebenenfalls eine neue create-only Einladung
vorbereitet wird. Das Broker-Backend verwendet ein 45-Sekunden-Timeout mit
Reserve oberhalb der internen Einzelbudgets; der Browser wartet 50 Sekunden.

Die einmalige Umstellung vom bisherigen Delete-Vertrag auf `cas-v2` darf nicht
als überlappendes Rolling Update erfolgen: Der Deployment-Workflow skaliert
zuerst jedes Broker-Deployment ohne die Protokollannotation
`versorgungs-kompass.de/password-invitation-protocol=cas-v2` auf null und
bestätigt die Abwesenheit aller alten Pods. Danach muss die wirksame Brokerrolle
exakt nur Storage Get und Update enthalten; Delete bleibt verboten. Erst dann
startet der neue Broker. Ein fehlgeschlagenes Gate hält den Broker bewusst
fail-closed offline, damit alter Delete-Code und neue CAS-Logik niemals
gleichzeitig dieselbe generationenstabile Einladung verarbeiten.

Der Zwei-POST-Vertrag aus Redeem und Finalize ist auch an der Edge abgebildet:
Cloud Armor erlaubt 30 Requests je 300 Sekunden und Quell-IP, bevor 429 greift;
der Stunden-Ban beginnt erst oberhalb von 120 Requests. So sind mindestens 15
vollständige Pilot-Onboardings im selben Fünf-Minuten-Fenster auch hinter einem
gemeinsamen gematik-NAT möglich. 429 und interne temporäre Limits werden im
Portal als technische Störung mit Retry behandelt, niemals als Linkablauf.

Der Reset erzeugt weder Nutzer, Profile noch Bindings und gewährt allein keinen
Anwendungszugriff. Bekannte, unbekannte und nicht als Passwortkonto nutzbare
Adressen erhalten denselben öffentlichen `202 {"accepted":true}`-Vertrag und
dieselbe neutrale UI-Antwort; Kontodaten werden nicht protokolliert. Ein
abgelaufener oder verbrauchter Einladungslink wird nur nach erneutem
Konto-/Binding-Readback durch einen neuen create-only Wrapperlink ersetzt; der
Self-Service-Reset bleibt davon getrennt. Vor jedem `GO` wird die tatsächlich
ausgelieferte Seite in einem privaten Browserfenster visuell geprüft; als
Anmeldeprovider dürfen ausschließlich Google und E-Mail/Passwort sichtbar sein
und Self-Signup muss verborgen sein.

Für die eigene Login- und Passwortsetzseite gelten zusätzlich diese harten
Gates:

1. `notification.sendEmail.callbackUri` entspricht bytegenau einem der beiden
   freigegebenen Werte:
   `https://versorgungs-kompass.de/konto/passwort-festlegen` (Zielbild) oder
   vorübergehend
   `https://steam-capsule-341212.firebaseapp.com/__/auth/action`
   (Provider-Fallback). Der Identity-Platform-API-Write auf das Zielbild wird
   derzeit selbst mit Projekt-Owner-Rechten serverseitig mit
   `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` abgewiesen. Terraform behauptet daher
   keinen Callback-Write; der read-only Deployment-Preflight akzeptiert nur
   diese zwei exakten Werte und stoppt bei jeder anderen URI vor einer
   External-Mutation. Sobald der Provider den Write zulässt, wird auf das
   Zielbild umgestellt und der Fallback aus Preflight und Runbook entfernt.
2. `emailPrivacyConfig.enableImprovedEmailPrivacy=true` ist read-only zu
   bestätigen. Login-, Reset- und Fehlertexte bleiben neutral; insbesondere
   ist die sichtbare Antwort nach einer Reset-Anforderung für bekannte,
   unbekannte und nicht als Passwortkonto nutzbare Adressen identisch.
3. `IAP_EXTERNAL_LOGIN_PAGE_URI` entspricht bytegenau
   `https://versorgungs-kompass.de/anmelden`. Sie bleibt die kanonische
   query- und fragmentfreie Basis für Portal, Runtime-Konfiguration und
   Operator-Eingabe. Das Reconcile konstruiert ausschließlich intern die von
   IAP benötigte effektive URI
   `${IAP_EXTERNAL_LOGIN_PAGE_URI}?apiKey=${IAP_EXTERNAL_AUTH_API_KEY}`, setzt
   sie bytegenau auf beiden geschützten Backends und gibt weder Browser-Key noch
   effektive URI aus.
4. Der primäre, im Google-OAuth-Client freigegebene Redirect-URI entspricht
   bytegenau
   `https://versorgungs-kompass.de/__/auth/handler`. Dieser technische
   Callback ist ausschließlich OAuth-Infrastruktur und darf weder als
   Einladungslink noch als sichtbarer Login- oder Passwortsetz-Link verwendet
   werden. Der bisherige Redirect
   `https://steam-capsule-341212.firebaseapp.com/__/auth/handler` bleibt nur
   während des Piloten als inaktiver Rollback-Eintrag registriert; Login-
   Konfiguration und Abnahmen referenzieren stets den kanonischen Redirect.
5. Einladungs-, administrative Recovery- und Self-Service-Reset-Links werden
   vom gebrandeten Custom Handler auf der Passwortsetzseite verarbeitet. Für
   den Self-Service-Reset akzeptiert der Broker ausschließlich den vom Provider
   frisch zurückgegebenen, vollständig validierten OOB-Link. Dessen
   syntaktisch gültiger Provider-API-Key darf vom gepinnten Portal-API-Key
   abweichen; der Broker projiziert `mode`, `oobCode`, den gepinnten
   Portal-API-Key, `continueUrl` und `lang` auf den kanonischen Custom Handler.
   Vor der Ausgabe prüft er den exakten `oobCode` über den gepinnten
   Portal-API-Key read-only auf die gebundene E-Mail und
   `requestType=PASSWORD_RESET`. Die vom Broker gesetzte `continue_url` jedes
   Self-Service-Reset-Links ist bytegenau
   `https://versorgungs-kompass.de/start` und nicht browsersteuerbar.
6. Der öffentliche Reset-Broker ist nur unter dem exakten kanonischen
   `POST /api/auth/password-reset` erreichbar. Sein BackendService hat IAP
   bewusst deaktiviert, Access-Logging deaktiviert, eine eigene
   Cloud-Armor-Rate-Limit-Policy und keine Datenbank-Credentials. Er erhält nur
   den privaten Bucketnamen, das dedizierte SMTP-Passwort über einen exakten
   Kubernetes-`secretKeyRef` sowie die GKE Workload Identity. Die
   bedingte Storage-Rolle erlaubt ausschließlich `storage.objects.get` und
   `storage.objects.update` unter `active/`; List, Create, Delete und Restore
   bleiben verboten. Update dient ausschließlich den
   generationen- und metagenerationengepinnten CAS-Zustandswechseln. Das
   Helm-Schema pinnt den Backendtimeout bytegenau auf
   45 Sekunden, der Deployment-Live-Gate bestätigt denselben tatsächlich
   wirksamen GCE-Wert und der Browser begrenzt Fetch einschließlich Body auf
   50 Sekunden. Für unbekannte, Google-only, gemischte oder anderweitig
   unzulässige Konten wird keine Mail angestoßen.
7. Ein echter erfolgreicher Google-Login über die eigene Loginseite ist
   höchstens 24 Stunden vor Deployment nachzuweisen. Außerdem wird der
   vollständige Passwortgast-Ablauf erst nach abgeschlossenem Prebinding
   nachgewiesen. Der UTC-Zeitpunkt steht in
   `IDENTITY_PLATFORM_GOOGLE_LOGIN_VERIFIED_AT`.
   `IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256` pinnt das kanonische Tupel
   aus `approvedPasswordResetSucceeded: true`, `clientId`,
   `googleLoginSucceeded: true`, dem exakten technischen Redirect,
   `selfSignupVisible: false`, `visibleOptions: ["google.com","password"]` und
   `verifiedAt`.

Der für die Anmeldung erforderliche Identity-Platform-Web-API-Key ist
browseröffentlich. Der Broker erzwingt den Passwort-only-Vertrag deshalb für
den ausgelieferten Produktflow, kann aber direkte Identity-Toolkit-Aufrufe nicht
technisch verhindern. Falls diese Regel projektweit atomar gelten muss, ist vor
dem `GO` zusätzlich eine `beforeEmailSent`-Blocking-Function einzurichten und
gegen Google-only sowie gemischte Konten nachzuweisen.

### 3. Bestehende Google-Konten

Das erste Google-Login würde normalerweise einen neuen Identity-Platform-User
anlegen. Weil Selbstregistrierung im Pilot deaktiviert bleibt, werden alle
genehmigten Google-Nutzer vorab administrativ mit verifiziertem
`google.com`-Providerdatensatz importiert. Der Import wird create-only gegen
UID-, E-Mail- und Provider-ID-Kollisionen geprüft. Der
[Admin-SDK-Import](https://firebase.google.com/docs/auth/admin/import-users)
unterstützt OAuth-Providerdatensätze; er darf nur in einer geschützten
Operator-Sitzung mit Least Privilege ausgeführt werden.

Nach dem Import werden `uid`, `disabled`, primäre E-Mail,
`emailVerified=true` und `providerData.providerId=google.com` read-only gegen
das Roster geprüft. Erst danach wird aus der bestätigten
Identity-Platform-UID das erwartete äußere IAP-Subject in den
Remap-Sollzustand übernommen. Ein Google-Konto, das nicht vorprovisioniert und
gebunden ist, erhält keinen Zugang.

### 4. E-Mail-/Passwortkonten

Die zwei oder drei Konten werden einzeln mit
`scripts/provision_pre_gematik_identity_platform_account.mjs` und einer
kurzlebigen administrativen Identity-Platform-Berechtigung angelegt. Der
Operator verwendet ausschließlich die OAuth-geschützte Identity-Toolkit-
Admin-API; der Browser darf `createUserWithEmailAndPassword` nicht aufrufen.
Google beschreibt die zugrunde liegende create-only Admin-Operation unter
[Method: projects.accounts](https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects/accounts).

Das geschützte Eingabedokument liegt als owner-only Datei außerhalb des
Git-Worktrees und enthält genau einen Account:

```json
{
  "version": 1,
  "project_id": "example-project",
  "uid": "reserved_personal_uid",
  "email": "person@example.invalid",
  "display_name": "Vorname Nachname",
  "email_ownership_verified": true,
  "continue_url": "https://versorgungs-kompass.de/start"
}
```

Es enthält weder Passwort noch Reset-Link. E-Mail-Adresse, UID, Anzeigename,
konkretes Projekt und Profilzuordnung im echten Dokument gehören in den
geschützten Voll-Soll-Nachweis und nicht in Git, Ticket oder ungeschützte Logs.
`continue_url` ist dagegen kein variabler Rosterwert, sondern muss für jedes
Konto bytegenau `https://versorgungs-kompass.de/start` sein.
Die geschützte Operator-Sitzung verwendet eine aktive `gcloud`-Identität mit
den eng begrenzten Identity-Platform-Adminrechten. Der gepinnte Web-API-Key
steht ausschließlich für die Laufzeit des Operators in
`IAP_EXTERNAL_AUTH_API_KEY`; der Operator bezieht das kurzlebige OAuth-Token
selbst und gibt weder Token noch API-Key aus.

Zuerst wird zweimal read-only previewt:

```bash
node scripts/provision_pre_gematik_identity_platform_account.mjs \
  --input /absolut/owner-only/identity-platform-account.json
```

Beide Läufe müssen denselben `input_fingerprint`, `account_count=1` und
`target_state=absent` melden. Erst danach erfolgt der ausdrücklich bestätigte
create-only Apply:

```bash
node scripts/provision_pre_gematik_identity_platform_account.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --output /absolut/owner-only/native-password-reset-link-do-not-send.txt \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-operation CREATE_PRE_GEMATIK_IDENTITY_PLATFORM_ACCOUNT \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Der Operator prüft UID und E-Mail unmittelbar vor der Mutation erneut. Existiert
einer der Werte bereits, bricht er ohne Änderung ab. Beim Apply erzeugt er
intern ein starkes zufälliges Bootstrap-Geheimnis, übergibt es ausschließlich
an Identity Platform und gibt oder speichert es niemals. Anschließend erzeugt
er technisch einen nativen Identity-Platform-Reset-Link und schreibt ihn
create-only mit Modus `0600` in die bestätigte Datei außerhalb des Worktrees.
Dieser native Link ist **keine versandfähige Einladung** und darf weder in den
Renderer noch in den SMTP-Operator übernommen werden. Die Datei bleibt bis zum
kontrollierten Cleanup owner-only. Die Standardausgabe enthält nur Modus,
Mengen und Fingerprint, niemals E-Mail, UID, Passwort oder Link.

**Der native Link darf nicht versendet werden.** Erst wenn das App-Prebinding
aus Abschnitt 5 vollständig angewendet und read-only bestätigt wurde, darf der
separate 48-Stunden-Einladungsoperator ausgeführt werden. Für die
Online-Neunutzeranlage ist dafür ausschließlich der vorgeschriebene
Post-Apply-Preview mit `result=unchanged` und identischen
Ist-/Soll-Fingerprints zulässig. Wenn der jeweils passende Nachweis nicht exakt
gelingt, gibt es keine Willkommensmail und keine Linkweitergabe. Damit kann
niemand zuerst ein Passwort setzen und anschließend wegen einer noch fehlenden
App-Bindung am Versorgungs-Kompass scheitern.

Scheitert der Account-Aufruf nach möglichem Commit, dessen unmittelbarer
Read-back oder die Link-Erzeugung, wird der Account nicht automatisch gelöscht
und der create-only Apply nicht wiederholt. Nach read-only Bestätigung von UID,
E-Mail, `emailVerified=true` und aktivem Zustand darf ausschließlich der Link
mit einem neuen Output-Pfad wiederhergestellt werden:

```bash
node scripts/provision_pre_gematik_identity_platform_account.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --output /absolut/owner-only/native-password-reset-link-recovery-do-not-send.txt \
  --recover-link-only \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-operation RECOVER_PRE_GEMATIK_SET_PASSWORD_LINK \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Auch ein solcher Recovery-Link bleibt rein administrativ und wird nicht
versendet. Die persönliche Einladung entsteht ausschließlich im nächsten
Schritt aus einem neuen kryptografischen Wrapper-Token.

Nach dem erfolgreichen Gast-Apply muss der geschützte Post-Apply-Preview als
einzelnes JSON-Dokument vorliegen. Für die Online-Neunutzeranlage muss er exakt
`mode=PREVIEW`, `result=unchanged`, je ein aktives Profil und Binding,
`access_scope_verified=test_only`, identische Zustandsfingerprints sowie das
erfolgreiche Online-Backup-/PITR-Gate bestätigen. Der private Bucketname ist
der Terraform-Output `PASSWORD_INVITATION_BUCKET`. Die aktive `gcloud`-Identität
muss zusätzlich namentlich in `PASSWORD_INVITATION_OPERATOR_MEMBERS` gebunden
sein. Diese separate Bucket-Rolle erlaubt nur Create, Get und Delete unter
`prepared/` und `active/`; sie erlaubt weder List, Update noch Restore und wird
nicht aus Projekt-Owner- oder IAP-Rechten abgeleitet. Erst dann wird die
Einladung zunächst read-only geplant:

```bash
node scripts/provision_pre_gematik_password_invitation.mjs \
  --account-input /absolut/owner-only/identity-platform-account.json \
  --guest-access-input /absolut/owner-only/guest-access.json \
  --post-apply-evidence /absolut/owner-only/evidence-guest-post-preview/guest-preview.log \
  --bucket example-project-vk-pre-gematik-invitations
```

Die Ausgabe darf ausschließlich den Operationsnamen, `mode=PREVIEW`, negative
Mutationsindikatoren und den `input_fingerprint` enthalten. Der exakt
bestätigte Apply schreibt anschließend ein neues owner-only Linkziel:

```bash
node scripts/provision_pre_gematik_password_invitation.mjs \
  --account-input /absolut/owner-only/identity-platform-account.json \
  --guest-access-input /absolut/owner-only/guest-access.json \
  --post-apply-evidence /absolut/owner-only/evidence-guest-post-preview/guest-preview.log \
  --bucket example-project-vk-pre-gematik-invitations \
  --output /absolut/owner-only/password-invitation-link.txt \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-operation PREPARE_PRE_GEMATIK_PASSWORD_INVITATION \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Der Operator erzeugt genau 32 zufällige Bytes und kodiert sie ohne Padding als
43-stelliges Base64url-Token. Die Linkdatei enthält ausschließlich
`https://versorgungs-kompass.de/konto/passwort-festlegen#einladung=<TOKEN>`.
Der Tokenwert wird niemals in GCS oder auf stdout geschrieben. Im privaten
Bucket entsteht create-only nur
`prepared/<BEREICHGETRENNTER-SHA256>.json`; das Objekt ist höchstens 8 KiB
groß und mit `status=prepared`, `accepted_at=null` und `expires_at=null` inert.
Es bindet Projekt, tenantlose UID, E-Mail, `continue_url`, Konto-,
Gastzugriffs- und Binding-Fingerprint, Profil, Rolle,
`access_scope=test_only` und den unveränderten `scope_ref`. Der sichtbare
Wrapperlink enthält weder nativen Identity-Platform-Code noch API-Key und wird
von Renderer und Sender bytegenau erzwungen.

Die Mail wird nicht frei aus der Linkdatei zusammengesetzt. Der versionierte
Renderer
[`render_pre_gematik_guest_welcome_email.mjs`](../../scripts/render_pre_gematik_guest_welcome_email.mjs)
erzeugt nach einem Preview ein create-only, owner-only Mailpaket mit Betreff,
Text, HTML und importierbarer EML-Datei. Der Renderer lehnt leere Vorlagen,
fremde Hosts, Firebase-/Projektlinks, zusätzliche URL-Parameter, Remote-Bilder,
SVG-/Data-Assets, aktive Inhalte, Tracking, Skripte, Header-Injection sowie
typische, in diesen Transaktionsmails nicht benötigte HTML-, CSS- und
Zero-Width-Muster für verborgene Inhalte ab. ASCII-Werte für Absender und
Betreff bleiben ungefalzt und werden nicht als überlanges RFC-2047-Encoded-Word
ausgegeben.
Die vier kanonischen Kompass-Signets werden ausschließlich als hashgepinnte,
transparente 72×72-PNGs mit eindeutigen Content-IDs in `multipart/related`
eingebettet; unbekannte, zusätzliche, vertauschte oder veränderte CID-Assets
brechen Rendering und Versand fail-closed ab. Einmal-Link und Kontodaten
erscheinen nicht in seiner Standardausgabe. Als
Absender ist ausschließlich das überwachte Domain-Postfach
`zugang@versorgungs-kompass.de` mit dem Anzeigenamen `#Mitmachen` zulässig.

```bash
# Preview; erst nach vollständigem Prebinding ausführen
node scripts/render_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/password-invitation-link.txt \
  --sender-name "#Mitmachen" \
  --sender-email zugang@versorgungs-kompass.de \
  --pilot-end 2026-09-30T16:00:00Z

# Create-only Mailpaket; Fingerprint exakt aus dem Preview übernehmen
node scripts/render_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/password-invitation-link.txt \
  --output-dir /absolut/owner-only/welcome-mail \
  --sender-name "#Mitmachen" \
  --sender-email zugang@versorgungs-kompass.de \
  --pilot-end 2026-09-30T16:00:00Z \
  --apply \
  --confirm-operation RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Der Renderer-Fingerprint bindet bytegenau die vollständige EML und damit
Konto, persönlichen Wrapperlink, Absender, Pilotfrist, Text-/HTML-Vorlagen und
Inline-Markenassets. Nach jeder Änderung an einem dieser Werte ist ein frischer
Preview-Fingerprint erforderlich; ein früherer Konto- oder Mail-Preview darf
nicht wiederverwendet werden.

Das Postfach wird im bestehenden ALL-INKL-KAS als eigenständiges, nicht als
Catch-all konfiguriertes Konto angelegt. Der Transport ist exakt auf
`w01abca0.kasserver.com:465` mit implizitem TLS und authentifiziertem Versand
gepinnt. Das Postfach-Passwort liegt ausschließlich in einer owner-only
JSON-Datei außerhalb von Git und wird weder als Kommandozeilenargument noch auf
stdout ausgegeben:

```json
{
  "version": 1,
  "host": "w01abca0.kasserver.com",
  "port": 465,
  "security": "implicit_tls",
  "username": "zugang@versorgungs-kompass.de",
  "password": "GESCHUETZTES-POSTFACH-PASSWORT",
  "sender_email": "zugang@versorgungs-kompass.de"
}
```

Der direkte SMTP-Operator überträgt den bytegenau erneut validierten Inhalt von
`welcome.eml` als Multipart-Text/HTML. Eine HTML-zu-RTF-Konvertierung oder der
Versand aus einem persönlichen Mailkonto ist nicht zulässig, weil dabei der
gebrandete CTA-Button verändert werden kann. Text- und HTML-Teil sind als
Base64 mit SMTP-sicheren Zeilen kodiert. Unmittelbar vor dem Transport ergänzt
der Operator genau einen `Date`- und einen eindeutigen `Message-ID`-Header.
Vor jedem Preview und Apply liest der Operator das zum Wrapper-Token gehörende
`prepared`-Objekt über ein kurzlebiges `gcloud auth print-access-token` und
generationengepinnt aus dem privaten Bucket. Nur der exakte, weiterhin inerte
Konto-/Binding-Vertrag wird akzeptiert; native Identity-Platform-Reset-Links
werden strikt abgelehnt.

```bash
# Read-only Preview; Fingerprint übernehmen
node scripts/send_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/password-invitation-link.txt \
  --mail-file /absolut/owner-only/welcome-mail/welcome.eml \
  --smtp-config /absolut/owner-only/smtp.json \
  --invitation-bucket example-project-vk-pre-gematik-invitations

# Einmaliger Versand mit deterministischem create-only Versandbeleg
node scripts/send_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/password-invitation-link.txt \
  --mail-file /absolut/owner-only/welcome-mail/welcome.eml \
  --smtp-config /absolut/owner-only/smtp.json \
  --invitation-bucket example-project-vk-pre-gematik-invitations \
  --apply \
  --confirm-operation SEND_PRE_GEMATIK_GUEST_WELCOME_EMAIL \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Der Operator leitet den Belegnamen ausschließlich aus der unveränderlichen
Mail- und Envelope-Identität ab. Weder das Verschieben der SMTP-Datei noch eine
Passwortrotation erzeugt für dieselbe E-Mail einen neuen Versandweg. Der
Belegpfad ist nicht per Kommandozeile wählbar, sondern liegt owner-only unter
`~/.local/state/versorgungs-kompass/pre-gematik-welcome-email`. Ein vorhandener
Versandbeleg blockiert jede unabsichtliche Wiederholung. Bereits der
create-only Status `sending` enthält Startzeit und `Message-ID`, damit ein
Abbruch nach SMTP-Annahme unabhängig korreliert werden kann. Nach SMTP-Annahme
schreibt der Operator `active/<DIGEST>.json` ausschließlich
create-only, setzt `accepted_at` auf den bestätigten Annahmezeitpunkt und
`expires_at` exakt 48 Stunden später und löscht danach `prepared` nur mit
dessen gelesener Generation. Erst der Belegstatus `accepted` zusammen mit
`invitation_status=active`, Ablaufzeit und aktiver Generation bestätigt den
vollständigen Versand. Bei `unknown` oder
`smtp_accepted_activation_pending` darf nicht erneut gesendet werden.
Stattdessen müssen Zielpostfach, `Message-ID`, Mailfingerabdruck sowie die
konkrete `prepared`-/`active`-Generation reconciliiert werden.

#### Beschleunigter resumierbarer Online-Neunutzerweg

Für weitere vollständig neue Passwortgäste darf der lokale
[`orchestrate_pre_gematik_online_onboarding.mjs`](../../scripts/orchestrate_pre_gematik_online_onboarding.mjs)
die oben beschriebenen Einzeloperationen bis zur versandbereiten Mail
automatisieren. Er ist eine Orchestrierung desselben Vertrags und kein neuer
fachlicher oder privilegierter Datenpfad. Bestandsprofil, Anzeigename-Reconcile,
Subject-Remap, Widerruf, Rollen- oder Scope-Änderung bleiben ausgeschlossen und
verwenden weiterhin ihren wartungsgebundenen Einzelvertrag.

Der Online-Orchestrator akzeptiert ausschließlich die explizite Kombination
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` und
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false`. Die App bleibt
dabei verfügbar: Es gibt kein Wartungsfenster, keinen App-Lock, keine Downtime
und kein Skalieren von Frontend oder API. Automatische Backups, PITR, positive
Aufbewahrung und der aktuelle erfolgreiche Recovery-Punkt werden weiterhin in
jeder Gastphase frisch fail-closed geprüft. Ein ad-hoc gesetztes
`PRE_IMPORT_BACKUP_ID` gehört nicht zu diesem Modus und kann das Gate nicht
ersetzen.

Das bereits geprüfte Linux/AMD64-Operator-Image darf releasebezogen für mehrere
Neunutzerläufe wiederverwendet werden. Eine aufgelöste owner-only Kopie von
[`online-onboarding-operator-release.example.json`](../../config/pre-gematik/online-onboarding-operator-release.example.json)
bindet Quellcommit, regionalen unveränderlichen Image-Digest, den aus diesem
Image gelesenen Proxy-Pin, privaten Einladungs-Bucket, Freigabeende und
Pilotfrist. Ein Image-Neubau pro Person ist weder ein Sicherheitsgate noch
erforderlich. Bei Quelländerung, neuem Digest, abgelaufener oder widerrufener
Freigabe wird der Release dagegen nicht wiederverwendet.

Die phasenminimale Zielumgebung wird aus
[`online-onboarding.env.example`](../../config/pre-gematik/online-onboarding.env.example)
in eine geschützte Datei aufgelöst. Account- und Gastzugriffsdokument,
Identity-Platform-Readback-Env, SMTP-Konfiguration, Run-Verzeichnis und alle
daraus entstehenden Journale, Evidenzen, Links und Mailartefakte liegen
owner-only außerhalb des Git-Worktrees. Das Run-Verzeichnis besitzt Modus
`0700`, Dateien Modus `0600`; Symlinks, unbekannte Felder und ungebundene
Eingaben werden abgewiesen.

Ein read-only Plan erzeugt einen Fingerprint über Account, Gastzugriff,
Zielumgebung und Operator-Release. Genau ein damit bestätigter Apply-Aufruf
führt danach ohne manuelle Kubernetes-Unterbrechung diese feste Folge aus:

1. zwei identische Account-Previews und genau einen create-only Account-Apply;
   der technisch erzeugte native Reset-Link wird direkt nach dem exakten
   Account-Readback gelöscht und niemals in den Mailpfad übernommen,
2. genau einen `guest-preview`, genau einen bestätigten `guest-apply` und genau
   einen `result=unchanged`-Post-Apply-Preview,
3. geschützte Evidenzübergabe und vollständigen Cleanup von Job, Secrets,
   kurzlebigem Datenbanklogin und allen temporären IAM-Bindungen,
4. inerte Einladungsplanung und create-only Wrapperlink,
5. Mail-Preview und create-only Rendering sowie
6. ausschließlich den Sender-Preview mit dem Ergebnis `READY_TO_SEND`,
   `mail_sent=false` und einem Mailfingerprint.

Der Lauf führt ein crash-atomar veröffentlichtes, create-only und monoton
fortgeschriebenes owner-only Journal. Es bindet Fingerprints, Evidenz und die
UIDs seiner kurzlebigen Ressourcen, enthält aber keine Passwörter, API-Keys
oder Linktokens. Ein create-only
Cluster-Lock verhindert konkurrierende Nutzung der festen Operator-Ressourcen.
Mit denselben Eingaben und Bestätigungen kann `--resume` nach einem sicheren
Abbruch am ersten unvollständigen Schritt fortsetzen. Es gibt keinen blinden
Apply-Retry: Bei unbekanntem Account- oder Datenbank-COMMIT-Ausgang erfolgt
zuerst der vorgeschriebene vollständige Readback; Teilzustände sowie unbekannte
Einladungs- oder SMTP-Ausgänge bleiben `NO-GO`.
Unvollständige lokale Datenbankzugangsverzeichnisse werden noch vor ihrer
Veröffentlichung automatisch entfernt. Ein bereits im Journal vorhandenes
`READY_TO_SEND` wird beim Resume erneut per Sender-Preview geprüft und nur bei
unverändertem Mailfingerprint bestätigt. Ein lokaler Takeover wird nur für
denselben Journal-Holder und einen nachweislich beendeten Prozess automatisch
ersetzt; fremde oder unlesbare Lockzustände bleiben `NO-GO`.

Für den kurzlebigen Cloud-SQL-Login verankert das geschützte
Zugangsverzeichnis vor dem API-Aufruf einen create-only Intent und danach die
exakt zielgebundene asynchrone `CREATE_USER`-Operation. Die Gastphase beginnt
erst nach deren terminalem Readback. `CREATE_USER` setzt zugleich die einzige
freigegebene Datenbankrolle; ein nachgelagertes `UPDATE_USER` ist nicht Teil
des Online-Vertrags. Fehlt nach einem lokalen Abbruch die
Operation-ID und ist der Login zunächst noch nicht sichtbar, bleiben
Zugangsverzeichnis und Cluster-Lock erhalten; ein späteres Resume darf den
Zustand nicht anhand eines einmaligen `absent` als bereinigt einstufen.

Sinkt die Restlaufzeit des exakt eigenen IAM-Locks unter 15 Minuten oder ist
der gebundene Operator-Release abgelaufen, führt `--resume` ausschließlich eine
ownership-geprüfte Restbereinigung durch. Das Ergebnis lautet
`CLEANUP_COMPLETED_RESUME_REQUIRED`, `mail_sent=false` und `ready=false`.
Account-, Gast-, Einladungs-, Rendering- und Mailphasen bleiben in diesem Modus
gesperrt. Ein aktiver Release kann anschließend mit einem frischen Lock
fortgesetzt werden; ein abgelaufener Release benötigt vorher eine neue
Freigabe.

Bei Resume läuft zuerst nur der minimale Ziel- und Ownership-Preflight. Der
vollständige Vorwärts-Preflight für Quellstand, Image und Bucket folgt erst nach
dem Lock-Readback und ausschließlich bei ausreichender IAM-Restlaufzeit. Damit
kann ein Forward-Gate die erforderliche Restbereinigung nicht blockieren.

`READY_TO_SEND` ist eine harte Grenze. Der Orchestrator besitzt keinen
SMTP-Apply-Pfad, und ein Resume überschreitet diese Grenze nicht. Erst die
danach separat eingeholte persönliche Einmalfreigabe für exakt den angezeigten
Mailfingerprint autorisiert den oben dokumentierten
`SEND_PRE_GEMATIK_GUEST_WELCOME_EMAIL`-Befehl. Die Einladung ist bis dahin
inert; ihre 48 Stunden beginnen unverändert erst nach bestätigter SMTP-Annahme.

Mit gesundem Zielkontext und bereits freigegebenem Image ist für den
automatisierten Prepare-Lauf eine typische Zielspanne von vier bis acht Minuten
vorgesehen. Sie ist kein SLO und rechtfertigt weder übersprungene Evidenz noch
unvollständigen Cleanup. Die detaillierten Befehle und Sicherheitsgrenzen des
Orchestrators stehen im
[`migration-operator`-Runbook](../../deploy/migration-operator/README.md).

Vor der ersten echten Einladung wird eine Nachricht mit ausschließlich
synthetischem Link an ein kontrolliertes Testpostfach gesendet. In dessen
zugestellten Headern werden mindestens `SPF=pass` und ein ausgerichtetes
`DMARC=pass` bestätigt. Ob ALL-INKL für das konkrete Postfach DKIM signiert,
muss ebenfalls anhand von `Authentication-Results` bestätigt werden; fehlt
`DKIM=pass`, wird der Produktivversand bis zur Klärung mit dem Provider nicht
freigegeben.

Verbindlich sind:

- persönliches Konto, keine Sammel- oder Rollenadresse,
- aktivierte
  [strenge Password Policy](https://cloud.google.com/identity-platform/docs/password-policy),
- vor Aktivierung unabhängig bestätigtes Eigentum an der E-Mail-Adresse und
  `emailVerified=true`,
- Übergabe des für 48 Stunden aktivierten Wrapperlinks erst nach vollständigem
  Prebinding und ausschließlich über einen genehmigten persönlichen
  Einzelkanal,
- professionelle Willkommensmail mit eindeutigem Bezug zum
  Versorgungs-Kompass, persönlicher Anrede, kurzer Erklärung der Einladung,
  Ablauf-/Einmalhinweis, Supportkontakt und einem klar bezeichneten
  `Zugang einrichten`-Link; die Mail darf keine technische Firebase- oder
  Projektbezeichnung als sichtbaren Absender oder Linktext enthalten,
- einmaliges Öffnen des Links und Setzen eines individuellen, nicht
  wiederverwendeten Passworts beim begleiteten ersten Termin,
- anschließend `Jetzt anmelden` wählen; Ziel ist `/start`, dort erfolgt die
  reguläre Anmeldung über E-Mail und Passwort und danach der direkte
  App-Zugang,
- Linkdatei und gerendertes Mailpaket unmittelbar nach erfolgreichem
  Passwortsetzen und App-Login kontrolliert entfernen,
- kein Passwort, Wrapperlink, natives Reset-Geheimnis oder vollständiger Token
  in Ticket, allgemeinem Chat, Git, Shell-History, Konsolenausgabe oder
  Nachweis,
- kein HTTP-, GCS- oder Proxy-Debug-Logging für Operator und Broker, damit
  Einladungs-Token, kurzlebiges Zugriffstoken und Kontobindung nicht in
  Protokolle gelangen,
- keine parallele Google- und Passwortidentität mit derselben E-Mail ohne
  ausdrücklich getestetes Account-Linking und
- neue Konten niemals mit Rolle `admin` oder Scope `standard`.

Der Wrapperlink ersetzt die Übermittlung eines Initialpassworts. Beim ersten
gültigen Austausch wechselt die aktive Einladung generationen- und
metagenerationengepinnt von `active` auf `minting`. Der serverseitig erzeugte,
kurzlebige Identity-Platform-Reset-Code wird erst nach seiner exakten
Read-only-Prüfung als tokengebunden AES-256-GCM-verschlüsselter Action-Link in
der Custom Metadata des Zustands `issued` abgelegt. Ein Retry liefert denselben
Code. Nach dem Passwort-Update-Readback finalisiert
`{invitationToken, finalize: true}` die Einladung als `consumed`; das Objekt
bleibt bis zum Lifecycle bestehen. Die 48-Stunden-Laufzeit stammt damit
ausschließlich aus dem kontrollierten Einladungsvertrag und nicht aus einer
vermeintlichen Identity-Platform-TTL-Konfiguration. Der Flow ist kein
passwortloser IAP-Login und ersetzt nicht die anschließende Anmeldung mit dem
gesetzten Passwort. Die Bindung ist zu diesem Zeitpunkt bereits vollständig
aktiv und verifiziert. Kann das erfolgreiche Setzen und der anschließende
App-Login nicht kontrolliert bestätigt werden, wird das Konto gesperrt; es
wird nicht durch Post-Login-Enrollment repariert.

### 5. App-Bindungen

Der External-Cutover besitzt zwei getrennte, fail-closed Verwaltungswege:

1. Für bestehende Google-Nutzer wird nach erfolgreicher
   Provider-Vorprovisionierung der vollständige Subject-Remap im
   Wartungsfenster **vor** der IAP-Umschaltung durchgeführt. Dabei bleiben
   Profil, Rolle, Aktivität und Scope unverändert.
2. Für jedes Passwortkonto wird **vor Linkversand und vor dem ersten Login**
   ausschließlich sein administrativ angelegter, exakt verifizierter
   password-only Identity-Platform-Account entweder auf sein bereits
   vorhandenes aktives Profil vorgebunden oder – nur beim echten Neunutzer –
   mit einem ausdrücklich getrennt bestätigten Modus atomar zusammen mit
   genau diesem Profil angelegt. Das Binding ist aktiv, besitzt
   `access_scope=test_only` und den genehmigten `scope_ref`.

   Wenn bei einem Bestandsprofil ausschließlich der Anzeigename in den vom
   Gastzugriffsvertrag geprüften Kernfeldern abweicht, darf er weder im
   Standardmodus stillschweigend akzeptiert noch allgemein aktualisiert werden.
   Nur der getrennte atomare Anzeigename-Reconcile-plus-Prebinding-Modus ist für
   diesen exakt gepinnten Sonderfall zulässig.

Der Standardmodus `PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` darf kein Profil
neu anlegen. Für eine Person ohne passendes Bestandsprofil gibt es ausschließlich
den separaten Modus
`CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`; ein
Profil-ohne-Binding- oder Binding-ohne-Profil-Teilzustand ist in diesem Modus
`NO-GO`. Das geschützte Eingabedokument beschreibt in beiden Fällen exakt den
genehmigten Sollzustand:

```json
{
  "version": 1,
  "project_id": "example-project",
  "uid": "reserved_personal_uid",
  "email": "person@example.invalid",
  "profile_id": "00000000-0000-4000-8000-000000000000",
  "display_name": "Vorname Nachname",
  "role": "editor",
  "scope_ref": "genehmigter-test-scope"
}
```

Die geschützte Datei liegt owner-only außerhalb des Git-Worktrees. Der
Operator liest Identity Platform anhand UID **und** E-Mail administrativ
zurück, verlangt exakt einen aktiven, verifizierten, tenantlosen
`password`-Account und leitet das namespacete IAP-Subject selbst ab. E-Mail
oder Rosterwerte dürfen nicht als Subjectersatz verwendet werden.

Die Betriebsgrenze ist code-seitig an den Modusschalter gebunden:

- Standard-Prebinding, Anzeigename-Reconcile, Identity-/Subject-Remap und
  Widerruf bleiben im geschlossenen Wartungsfenster und benötigen ein
  konkretes erfolgreiches Voränderungs-Backup samt `PRE_IMPORT_BACKUP_ID`.
- Nur `GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` bei gleichzeitig
  `GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false` wählt das
  Online-Onboarding-Gate. Die App bleibt erreichbar. Statt eines ad-hoc
  Backups prüft das Gate fail-closed Zielprojekt, laufenden Cluster, Namespace,
  private laufende Cloud-SQL-Instanz mit PostgreSQL 16, aktivierte automatische
  Backups und PITR, positive Backup- und Transaktionslog-Aufbewahrung, einen
  höchstens 36 Stunden alten erfolgreichen automatischen PostgreSQL-16-Snapshot
  sowie den unabhängigen Ziel-Pin. Diese Istwerte und der Recovery-Punkt sind
  im Gate-Fingerprint gebunden; der unabhängige Proxy-Pin wird getrennt
  unmittelbar beim Proxy-Start verifiziert.

Das Online-Gate ist kein frei setzbarer Backup-Bypass. Ein anderer Modus, ein
fehlendes Backup-/PITR-Merkmal oder ein abweichender Kontext stoppt die
Ausführung.

Mit der in
[PRE_GEMATIK_IDENTITY_ADMIN.md](PRE_GEMATIK_IDENTITY_ADMIN.md)
beschriebenen kurzlebigen, least-privilege Operatorverbindung werden im
Standard- und Reconcile-Modus zuerst zwei getrennte read-only Previews
ausgeführt. Für die Online-Neunutzeranlage gilt stattdessen der weiter unten
beschriebene einzelne Preview:

Für die private Cloud-SQL-Zielinstanz laufen Standard-Prebinding,
Anzeigename-Sonderfall und atomare Neunutzeranlage produktiv ausschließlich als
`guest-preview` und `guest-apply` im
[GKE-Migrationsoperator](../../deploy/migration-operator/README.md). Die
folgenden direkten Script-Aufrufe beschreiben den zugrundeliegenden
Bestätigungsvertrag, nicht einen alternativen produktiven Netzpfad. Die
GKE-Phasen exponieren `--create-profile-and-prebind` ausschließlich über den
expliziten, standardmäßig deaktivierten Schalter
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND`; `--revoke` bleibt nicht exponiert.
Im Standardmodus sind dieser Schalter und
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND` ausdrücklich
`false`.

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json
```

Beide Previews müssen denselben `input_fingerprint` und denselben
`current_state_fingerprint` melden. Für den erstmaligen Sollfall ist
`result=create_binding`: Das vorhandene aktive Profil stimmt exakt, aber das
Binding fehlt noch. Ein fehlendes oder abweichendes Profil, ein nicht aktives
Profil, ein vorhandener Enrollment-Request oder eine
Subject-/E-Mail-/Profilkollision sind `NO-GO`; der Operator legt kein Profil
an.

Erst danach wird der Apply mit beiden Fingerprints ausdrücklich bestätigt:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-database versorgungs_kompass \
  --confirm-operation PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST \
  --confirm-fingerprint sha256:INPUT-FINGERPRINT-AUS-PREVIEW \
  --confirm-current-state-fingerprint sha256:IST-FINGERPRINT-AUS-PREVIEW
```

Der Apply läuft serialisierbar, prüft Identity Platform und Datenbankzustand
innerhalb der Transaktion erneut und darf ausschließlich die exakte aktive
`test_only`-Bindung auf das vorhandene Profil ergänzen. Danach wird derselbe
Preview erneut ausgeführt. Er muss `result=unchanged`,
`profile_binding_complete=true` sowie identische
`current_state_fingerprint`- und `expected_state_fingerprint`-Werte melden.
Ein ausdrücklich wiederholter Apply mit diesem neuen
`current_state_fingerprint` muss ebenfalls `result=unchanged` liefern; dieser
No-op-Nachweis und ein abschließender read-only Preview gehören zum
geschützten Abnahmeprotokoll.

Für genau ein ansonsten passendes aktives Bestandsprofil mit abweichendem
Anzeigenamen, ohne Binding und ohne kollidierende Pending-Anfrage wird
`guest-access.json` zunächst auf den doppelt verifizierten
Identity-Platform-Soll-Anzeigenamen korrigiert. In beiden GKE-Phasen muss dann
`GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=false` und
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=true` gesetzt bleiben.
Der Preview meldet ausschließlich die Operation
`RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`
und `result=reconcile_profile_display_name_and_create_binding`. Der bestätigte
Apply übernimmt denselben Namen als `CONFIRM_GUEST_ACCESS_OPERATION`, ändert nur
`profiles.display_name` und legt das `test_only`-Binding in derselben
serialisierbaren Transaktion an. Ein Moduswechsel kann dadurch auch bei
identischen No-op-Fingerprints nicht unbemerkt bestätigt werden.

Ein exaktes Profil ohne Binding, ein Binding bei altem Anzeigenamen, jede
weitere Profilabweichung, ein unsauberer Alt-Anzeigename oder eine Kollision ist
auch hier `NO-GO`. Nach dem Apply muss `guest-preview`
`profile_display_name_matches_identity=true` und `result=unchanged` melden.
Danach wird dieselbe `guest-apply`-Phase mit dem **neuen**
`current_state_fingerprint` aus diesem Post-Apply-Preview als No-op bestätigt
und ein letzter Preview gesichert. Ein unbekannter COMMIT-Ausgang ist kein
Grund für einen blinden Job-Neustart; zuerst folgt ein neuer Preview.

Für einen echten Neunutzer ohne App-Profil wird stattdessen genau ein
GKE-Preview mit `GUEST_ACCESS_CREATE_PROFILE_AND_PREBIND=true` und
`GUEST_ACCESS_RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND=false` ausgeführt. Der
Operator bildet diesen Modus ausschließlich auf
`--create-profile-and-prebind` ab und wählt damit automatisch den
Online-Onboarding-Gate. Nur ein vollständig leerer relevanter Zustand darf
`result=create_profile_and_binding` melden:

```bash
node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --create-profile-and-prebind

node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
  --input /absolut/owner-only/guest-access.json \
  --create-profile-and-prebind \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-database versorgungs_kompass \
  --confirm-operation CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST \
  --confirm-fingerprint sha256:INPUT-FINGERPRINT-AUS-PREVIEW \
  --confirm-current-state-fingerprint sha256:IST-FINGERPRINT-AUS-PREVIEW
```

Profil und aktive `test_only`-Bindung werden in derselben serialisierbaren
Transaktion angelegt. Der anschließende Preview mit demselben Flag muss
`result=unchanged`, das vollständige Profil-Binding und identische
Ist-/Soll-Fingerprints melden. Damit ist der Online-Ablauf vollständig: genau
ein Preview, genau ein mit dessen Operation und Fingerprints bestätigter Apply
und genau ein Post-Apply-Preview. Ein zweiter No-op-Apply oder weiterer
Abschluss-Preview wird nicht ausgeführt. Der Standardmodus und der
Neunutzer-Modus dürfen niemals gegeneinander ausgetauscht werden. Ein
vorhandener Teilzustand, eine Pending-Anfrage oder irgendeine Abweichung stoppt
fail-closed.

Bei `GUEST_ACCESS_PROFILE_CREATION_COMMIT_OUTCOME_UNKNOWN` wird der Apply nie
blind neu gestartet. Ein neuer vollständiger `guest-preview` mit unverändertem
Create-Modus liest den tatsächlichen Zustand; nur dieser Readback entscheidet,
ob der Sollzustand bereits erreicht wurde oder eine getrennte Klärung nötig ist.

`POST /api/auth/external-enrollment`, Pending-`requestId` und
`provision_pre_gematik_test_access` werden für diesen Ablauf nicht verwendet.
Eine daraus stammende Pending-Anfrage ist keine Vorstufe, sondern eine
Kollision. Ohne exakt vollständiges Prebinding wird weder ein inertes
`prepared`-Objekt noch ein Wrapperlink erzeugt und keine Mail versendet. Der
bei der Kontoanlage technisch erzeugte native Reset-Link bleibt ausdrücklich
vom Einladungsweg ausgeschlossen.

Vor Öffnung muss eine read-only Prüfung bestätigen:

- exakt die genehmigte Gesamtzahl aktiver Bindungen,
- genau eine aktive Bindung je Profil,
- vollständige External-Subjects im richtigen Projekt-Namespace,
- ausschließlich genehmigte Rollen,
- `test_only` plus erwartetes `scope_ref` für jedes Passwortkonto und
- keine E-Mail-basierte Ersatzzuordnung,
- für jedes Passwortkonto entweder das vor dem Standard-Prebinding vorhandene
  aktive Profil oder den atomaren Neunutzer-Nachweis sowie genau eine passende
  aktive Binding-Zeile,
- keine zu UID, E-Mail, Profil oder Subject kollidierende Pending-Anfrage und
- vor dem Linkversand den bestätigten `unchanged`-Readback und bei den
  wartungsgebundenen Standard-/Reconcile-Wegen zusätzlich deren
  No-op-Nachweis.

## Cutover

Der Cutover läuft in einem angekündigten Wartungsfenster. Frontend und API
dürfen nicht über längere Zeit in unterschiedlichen Identitätsmodi betrieben
werden.

1. Aktuelle IAP-Ressourceneinstellungen, beide IAM-Policies, beide
   Reauthentication-Policies, OAuth-Konfiguration, Backend-IDs, Audiences und
   vollständigen App-Binding-Vorzustand geschützt exportieren und hashen.
2. Ablaufzeitpunkt festlegen. Der Wert von
   `IAP_EXTERNAL_ACCESS_EXPIRES_AT` ist ein kanonischer UTC-RFC-3339-Zeitpunkt,
   liegt in der Zukunft, höchstens 62 Tage nach dem Cutover und nicht nach dem
   aktuell festgelegten Echtdaten-Pilot-/Löschende
   `2026-09-30T16:00:00Z`, sofern dieses nicht separat verlängert wurde.
3. Provider, Selbstregistrierungssperre, strenge Password Policy, bestehende
   Google-Nutzer, password-only Nutzer und die eigene Login- und
   Passwortsetzseite vorbereiten, ohne IAP bereits umzuschalten.
   `emailPrivacyConfig.enableImprovedEmailPrivacy=true`, die sichtbaren
   Loginoptionen, `https://versorgungs-kompass.de/anmelden`, der exakte
   Google-Callback
   `https://versorgungs-kompass.de/__/auth/handler`, der kanonische
   Auth-Helper-Proxy, einer der beiden explizit freigegebenen Passwort-Action-
   Callbacks, der gehärtete Reset-Broker und der
   höchstens 24 Stunden alte echte Google-Login-Nachweis müssen vollständig
   sein. Noch wird keine Einladung versendet.
4. Jedes Passwortkonto create-only mit
   `continue_url=https://versorgungs-kompass.de/start` anlegen. Den zunächst
   owner-only geschriebenen nativen Reset-Link nicht versenden und nicht für
   die Willkommensmail auswählen. Anschließend
   für ein Bestandsprofil oder den Anzeigename-Reconcile den passenden
   wartungsgebundenen Gastzugriffsmodus zweimal mit stabilen Eingabe- und
   Istzustands-Fingerprints previewen: für ein Bestandsprofil
   `PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`; bei der isolierten,
   ansonsten exakt gepinnten Anzeigename-Abweichung ausschließlich
   `RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`
   über `guest-preview`/`guest-apply`. Für einen vollständig neuen Gast dagegen
   genau einen Online-Preview mit `--create-profile-and-prebind` und der
   Operation `CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`
   ausführen. Die wartungsgebundenen Wege per
   `unchanged`-Readback, bestätigtem No-op und Abschluss-Preview abnehmen; die
   Online-Neunutzeranlage endet nach genau einem bestätigten Apply mit genau
   einem `unchanged`-Post-Apply-Preview. Ein unerwarteter Teilzustand oder jede
   andere Abweichung ist `NO-GO`.
5. Den vollständigen Subject-Remap für die bestehenden Google-Nutzer sowie
   seinen Rückweg zweimal previewen.
6. Nutzerzugriff sperren beziehungsweise Wartungsfenster beginnen.
7. Google-Subject-Remap transaktional mit Eingabe- und
   `current_state_fingerprint` anwenden und den neuen Fingerprint bestätigen.
8. Das Anwendungsrelease mit `IAP_IDENTITY_MODE=external` und
   `IAP_EXTERNAL_ACCESS_EXPIRES_AT` ausrollen. Startup, Readiness und jede
   geschützte API-Anfrage müssen bei fehlendem, ungültigem oder abgelaufenem
   Wert fail-closed reagieren. Solange IAP noch IAM-Identitäten ausstellt,
   verwirft die bereits im External-Modus laufende API diese Claims bewusst;
   der Dienst bleibt geschlossen.
9. Erst danach reconciliert derselbe Deployment-Workflow beide geschützten
   Backend-Services auf External Identities mit identischer projektweiter
   Providerauswahl und entfernt in derselben kontrollierten
   Umschalt-/Kompensationsphase die dort nicht unterstützte Reauthentication.
   Keine IAM-Mitgliedschaft wird als External-Autorisierung interpretiert; der
   gesicherte Vorzustand bleibt für den Rückweg erhalten.
10. Beide IAP-Ressourcen read-only auf exakt denselben External-Modus, leere
   Reauthentication und die gepinnte Login-/Projektkonfiguration prüfen. Ein
   Teilzustand löst die Workflow-Kompensation beziehungsweise den dokumentierten
   Rollback aus und öffnet den Dienst nicht.
11. Erst jetzt für jedes exakt vorgebundene Passwortkonto mit dem bestätigten
    Post-Apply-Nachweis create-only ein inertes `prepared`-Objekt und den
    owner-only Wrapperlink erzeugen. Mailpaket rendern und den Sender-Preview
    ausführen. Erst nach der einmaligen Freigabe über den genehmigten
    persönlichen Kanal versenden; nach SMTP-Annahme muss der Beleg die aktive,
    exakt 48 Stunden gültige Einladung bestätigen. Bei fehlendem Prebinding-
    oder Aktivierungsnachweis: **keine Mail beziehungsweise kein
    Wiederholungsversand**.
12. Die Person öffnet den gebrandeten Wrapperlink, setzt das Passwort, wählt
    `Jetzt anmelden`, gelangt über `/start` zur gemeinsamen Loginseite und
    erreicht nach E-Mail-/Passwort-Anmeldung direkt Frontend und API. Danach
    werden Linkdatei und Mailpaket kontrolliert gelöscht.
13. Vollständige positive und negative Abnahme ausführen. Erst danach endet
    das Wartungsfenster und der Dienst wird geöffnet.

Ein Teilzustand, eine unerwartete Identity-Platform-UID, eine abweichende
Audience, ein unbekanntes Binding oder ein Fehler zwischen den beiden
Backend-Umschaltungen löst sofort den dokumentierten Rollback aus. Er wird
nicht durch spontane Konto-, IAM- oder Binding-Erweiterungen repariert.

## Verbindlicher Testplan

### Vor dem Go

- [ ] Startup und Readiness akzeptieren ausschließlich
  `IAP_IDENTITY_MODE=external` mit gültigem zukünftigem
  `IAP_EXTERNAL_ACCESS_EXPIRES_AT`.
- [ ] Zeitpunkt exakt am Ablauf und danach wird im automatisierten Test
  fail-closed abgewiesen.
- [ ] IAP bleibt auf Frontend und API aktiv; der direkte API-Netzpfad ist nicht
  erreichbar.
- [ ] Beide Backend-Audiences werden unabhängig geprüft.
- [ ] `IAP_GCIP_PROJECT_ID` entspricht dem IAP-/Identity-Platform-Projekt und
  `IAP_GCIP_TENANT_ID` ist leer.
- [ ] `authorizedDomains` entspricht exakt `versorgungs-kompass.de`,
  `steam-capsule-341212.firebaseapp.com` und `iap.googleapis.com`; es fehlt
  keine und es ist keine weitere Domain freigegeben.
- [ ] `emailPrivacyConfig.enableImprovedEmailPrivacy=true` ist read-only
  bestätigt.
- [ ] `notification.sendEmail.callbackUri` entspricht entweder dem Zielbild
  `https://versorgungs-kompass.de/konto/passwort-festlegen` oder – solange der
  API-Write mit `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` blockiert ist – exakt dem
  dokumentierten Provider-Fallback
  `https://steam-capsule-341212.firebaseapp.com/__/auth/action`.
- [ ] `IAP_EXTERNAL_LOGIN_PAGE_URI` entspricht exakt
  `https://versorgungs-kompass.de/anmelden`.
- [ ] Der eingeschränkte `IAP_EXTERNAL_AUTH_API_KEY` ist im administrativen
  Key-Readback mit dem kanonischen Origin-Referer ausschließlich für die
  benötigten Identity-Toolkit- und Secure-Token-APIs freigegeben. Der
  mutierungsfreie Laufzeit-Preflight löst über `GET /v1/projects` exakt die
  numerische Projektreferenz und die drei
  freigegebenen Domains auf und erwartet am Secure-Token-Refresh-Endpunkt ohne
  Refresh-Token ausschließlich `400 MISSING_REFRESH_TOKEN`; `403
  API_KEY_SERVICE_BLOCKED` und alle anderen Antworten stoppen fail-closed. Der
  IAP-Readback enthält auf beiden Backends bytegenau die einmalig um
  `?apiKey=…` ergänzte effektive Login-URI.
- [ ] Anmelde- und Passwortaktionsseite liefern
  `Referrer-Policy: strict-origin`; Google erhält damit den für die
  Key-Beschränkung benötigten Origin, aber niemals IAP-State, API-Key oder Pfad
  aus der Portal-URL im Referer. Alle übrigen öffentlichen Antworten bleiben auf
  `no-referrer`.
- [ ] Der Google-OAuth-Redirect entspricht exakt
  `https://versorgungs-kompass.de/__/auth/handler`; der frühere
  Firebase-Redirect ist ausschließlich als inaktiver Rollback-Eintrag
  vorhanden.
- [ ] Am Apex liefert ausschließlich Prefix `/__/auth/` den Firebase-Helper
  über den festen TLS-verifizierten Upstream. GET, HEAD und POST funktionieren
  ohne Redirect; alle anderen Methoden, Root/Near-Misses, normalisierten
  Varianten und Alias-Hosts bleiben geschlossen.
- [ ] Auth-Helper-Deployment und -Service-Account sind secret-, token- und
  Cloud-IAM-frei; Cookies und Authorization-/IAP-Identity-Header werden entfernt und
  nginx-/Load-Balancer-Zugriffslogging ist deaktiviert.
- [ ] Ein realer Google-Login über die eigene Loginseite ist erfolgreich;
  `IDENTITY_PLATFORM_GOOGLE_LOGIN_VERIFIED_AT` ist nicht älter als 24 Stunden
  und `IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256` stimmt mit Client-ID,
  `approvedPasswordResetSucceeded: true`, `googleLoginSucceeded: true`,
  Redirect, `selfSignupVisible: false`,
  `visibleOptions: ["google.com","password"]` und Zeitpunkt überein.
- [ ] Die tatsächlich ausgelieferte Loginseite zeigt ausschließlich Google und
  E-Mail/Passwort als Anmeldeprovider sowie `Passwort vergessen?` für den
  kontrollierten Reset; Selbstregistrierung, weitere Provider, Account-Linking
  und anonyme Anmeldung sind nicht sichtbar.
- [ ] Der Self-Service-Reset erzeugt keine Konten, Profile oder Bindings, wirkt
  ausschließlich für bereits administrativ vorprovisionierte und vollständig
  vorgebundene Passwortkonten und zeigt für bekannte, unbekannte und nicht als
  Passwortkonto nutzbare Adressen dieselbe neutrale UI-Antwort.
- [ ] Der Broker ist nur per exaktem kanonischem
  `POST /api/auth/password-reset` erreichbar; sein Backend ist IAP-frei,
  logfrei, Cloud-Armor-rate-limitiert und erhält keine Datenbank-Credentials.
  Bucketname, das einzelne synchronisierte SMTP-Passwort-Secret und GKE
  Workload Identity sind gepinnt; unter
  `active/` sind ausschließlich Storage Get und Update erlaubt, niemals List,
  Create, Delete oder Restore. Update ist auf generationen- und
  metagenerationengepinnte CAS-Zustandswechsel begrenzt.
- [ ] Die eigene Passwortsetzseite wird unter
  `https://versorgungs-kompass.de/konto/passwort-festlegen` ausgeliefert. Der
  48-Stunden-Wrapperlink bleibt mit seinem Token ausschließlich im Fragment;
  der Self-Service-Reset projiziert ausschließlich den validierten frischen
  Provider-OOB-Link auf denselben kanonischen Custom Handler. Jeder vom Broker
  ausgelöste frische Reset trägt exakt
  `continueUrl=https://versorgungs-kompass.de/start`.
- [ ] Ein ungültiger, abgelaufener oder für eine nicht vorprovisionierte
  Adresse erzeugter Link legt weder Identity-Platform-Nutzer noch Profil,
  Enrollment-Request oder Binding an.
- [ ] Gefälschte oder unsignierte IAP-Header enden mit `401`.
- [ ] Ein vorprovisioniertes bestehendes Google-Konto erreicht Frontend und API
  mit unveränderter genehmigter App-Rolle.
- [ ] Für jedes Passwortkonto ist der gewählte Modus dokumentiert: vorhandenes
  aktives Profil mit `PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` und
  `result=create_binding` oder vollständig neuer Gast mit
  `--create-profile-and-prebind`,
  `CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` und
  `result=create_profile_and_binding`. Standard-/Reconcile-Modi besitzen zwei
  stabile Previews; der Online-Neunutzer-Modus besitzt genau einen Preview mit
  stabilen `input_fingerprint`- und `current_state_fingerprint`-Werten.
- [ ] Nur der Online-Neunutzer-Modus lief bei erreichbarer App und ohne ad-hoc
  `PRE_IMPORT_BACKUP_ID`; sein Gate bestätigt Projekt, Cluster, Namespace,
  private PostgreSQL-16-Instanz, automatische Backups, PITR, positive
  Aufbewahrungswerte, einen aktuellen erfolgreichen automatischen Snapshot
  sowie den Ziel-Pin; der Proxy-Pin wird getrennt beim Proxy-Start verifiziert.
  Die geschützte Fachausgabe enthält Policy,
  Gate-Fingerprint, Recovery-Posture und Recovery-Punkt unter
  `online_onboarding_gate`. Standard, Reconcile, Remap und Widerruf liefen ausschließlich im
  Wartungsfenster mit konkretem Voränderungs-Backup.
- [ ] Apply und anschließender `unchanged`-Readback belegen genau eine aktive
  `test_only`-Bindung mit genehmigtem `scope_ref`; im Standardmodus wurde kein
  Profil, im expliziten Neunutzer-Modus wurden Profil und Binding atomar
  angelegt. Bestandsprofil- und Reconcile-Wege besitzen zusätzlich den
  bestätigten No-op und Abschluss-Readback; im Online-Neunutzer-Modus wurden
  diese beiden zusätzlichen Schritte nicht ausgeführt.
- [ ] Für das Passwortkonto gibt es keine Pending-Anfrage; weder
  `POST /api/auth/external-enrollment` noch der v2-Testzugangsoperator wurden
  im Onboarding verwendet.
- [ ] Der 48-Stunden-Einladungs-Preview bindet Account-, Gastzugriffs- und
  Post-Apply-Nachweis. Der Apply hat ausschließlich ein höchstens 8 KiB großes,
  inertes `prepared/<DIGEST>.json` und eine owner-only Wrapperlinkdatei erzeugt;
  kein Token erschien in GCS oder stdout.
- [ ] Die Willkommensmail wurde erst nach diesem Prebinding-Nachweis versendet.
  Sie wurde mit `RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL` aus den versionierten
  Text-/HTML-Vorlagen erzeugt. Absender, nicht leerer Betreff, nicht leerer
  Text, Linkbeschriftung und sichtbarer Link verweisen eindeutig auf den
  Versorgungs-Kompass. Der Versandbeleg bestätigt SMTP-Annahme,
  `invitation_status=active`, eine exakt 48 Stunden spätere Ablaufzeit und die
  aktive Objektgeneration; `prepared` wurde bedingt mit seiner gelesenen
  Generation gelöscht.
- [ ] Jedes Passwortkonto kann sich mit dem individuell gesetzten Passwort
  über `Jetzt anmelden` und `/start` direkt anmelden und erhält ausschließlich
  seine genehmigte Rolle und `test_only`-Grenze. Es erscheint kein Hinweis,
  dass trotz gesetztem Passwort noch kein App-Zugang bestehe.
- [ ] Falsches Passwort und deaktiviertes Konto werden abgewiesen.
- [ ] Kein Passwortkonto wird vor unabhängig bestätigtem
  `emailVerified=true` aktiviert.
- [ ] Ein nicht vorprovisioniertes Google-Konto und ein Registrierungsversuch
  per E-Mail/Passwort werden abgewiesen.
- [ ] Ein gültig signierter, aber nicht gebundener External-Subject erhält
  `403`.
- [ ] Reine Mitgliedschaft in der bisherigen Google-Gruppe vermittelt im
  External-Modus keinen Zugang.
- [ ] `viewer`-Mutationen scheitern; `test_only`-Editor-Mutationen außerhalb
  markierter Testobjekte scheitern.
- [ ] Der vollständige Logout beendet Identity-Platform- und IAP-Sitzung; ein
  Zurück-Navigieren öffnet keine geschützten Daten.
- [ ] Der Widerrufsvertrag ist in einer nicht-produktiven Probe bestätigt:
  `--revoke` meldet zunächst `disable_binding`, der Apply akzeptiert nur
  Operation `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS` samt Eingabe- und
  `current_state_fingerprint`, der Wiederholungslauf bleibt
  `result=unchanged`. Profil und Identity-Platform-Konto bleiben unverändert.
- [ ] App- und API-Fehlertexte unterscheiden nicht zwischen unbekanntem Konto,
  inaktivem Profil und fehlendem Binding.
- [ ] Logs, Actions-Zusammenfassung und Browserkonsole enthalten keine
  Passwörter, vollständigen Tokens, Subjects, Profil-IDs oder Rosterwerte.
- [ ] Der umgekehrte Subject-Remap und die Rückschaltung beider Ressourcen auf
  IAM wurden in einer nicht-produktiven Probe oder einem geschlossenen
  Wartungsfenster erfolgreich nachgewiesen.

Google dokumentiert den vollständigen External-Identity-Logout unter
[Managing sessions with external identities](https://cloud.google.com/iap/docs/external-identity-sessions#signing_users_out).

### Laufender Betrieb

Der Owner prüft mindestens arbeitstäglich:

- aktive Identity-Platform-Nutzer gegen das geschützte Roster,
- aktive App-Bindungen, Rolle und Scope,
- verbleibende Zeit bis zum technischen Ablauf,
- unerwartete Provider- oder Kontenänderungen,
- fehlgeschlagene Login-Spitzen und
- Verfügbarkeit des gesicherten IAM-Rollback-Zustands.

E-Mail-Änderung, Provider-Linking, Rollenänderung oder ein zusätzliches Konto
sind Adminvorgänge mit neuem Preview und Nachweis. Die Anwendung bietet dafür
keine Self-Service-Funktion. Ausschließlich das Zurücksetzen des Passworts ist
für ein bereits administrativ vorprovisioniertes und vollständig vorgebundenes
Passwortkonto als Self-Service zulässig; es ändert weder Kontoidentität noch
Profil, Binding, Rolle oder Scope. Die UI-Antwort bleibt unabhängig vom
Kontostatus identisch, und der Broker setzt fest
`continueUrl=https://versorgungs-kompass.de/start`. Ein bei der Kontoanlage
administrativ erzeugter nativer Reset-Link ist kein Fallback und wird niemals
übergeben. Ist eine Ersteinladung abgelaufen, erfordert eine neue Einladung
einen frischen `unchanged`-Readback, einen neuen Einladungs-Preview und einen
neuen create-only Wrapperlinkpfad.

Ein zusätzliches Konto ist nur dann eine Online-Neunutzeranlage, wenn noch
weder App-Profil noch Binding oder kollidierende Pending-Anfrage existieren und
der genehmigte Sollzustand vollständig über
`CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` angelegt wird.
Die App bleibt während der exakten Folge `guest-preview` → bestätigter
`guest-apply` → `guest-preview` mit `result=unchanged` erreichbar. Das
Online-Gate muss automatische Backups und PITR sowie den vollständigen
Zielkontext bestätigen. Ein Bestandsprofil, Anzeigename-Reconcile,
Identity-/Subject-Remap, Rollen-/Scope-Änderung, E-Mail-Änderung oder Widerruf
ist kein Online-Onboarding und bleibt wartungs- sowie
`PRE_IMPORT_BACKUP_ID`-pflichtig.

## Individuelles Offboarding

Eine Person wird in dieser Reihenfolge gesperrt:

1. Noch nicht versendete Wrapperlink- und Mailpaket-Dateien sowie das zugehörige
   inerte `prepared`-Objekt kontrolliert löschen. Eine noch aktive Einladung
   generationengepinnt unter `active/` widerrufen und nicht mehr zustellen.
2. Mit demselben owner-only `guest-access.json` einen read-only
   Widerrufs-Preview ausführen:

   ```bash
   node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
     --input /absolut/owner-only/guest-access.json \
     --revoke
   ```

   Der Preview muss Operation
   `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS`,
   `result=disable_binding`, `access_revoked=false` und exakt einen aktiven,
   gepinnten `test_only`-Binding-Zustand melden. Eingabe- und
   `current_state_fingerprint` werden geschützt bestätigt.
3. Den Widerruf ausschließlich mit genau diesen beiden Fingerprints anwenden:

   ```bash
   node scripts/provision_pre_gematik_identity_platform_guest_access.mjs \
     --input /absolut/owner-only/guest-access.json \
     --revoke \
     --apply \
     --confirm-environment pre-gematik \
     --confirm-project example-project \
     --confirm-database versorgungs_kompass \
     --confirm-operation REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS \
     --confirm-fingerprint sha256:INPUT-FINGERPRINT-AUS-PREVIEW \
     --confirm-current-state-fingerprint sha256:IST-FINGERPRINT-AUS-PREVIEW
   ```

   Der Apply deaktiviert ausschließlich die exakt gepinnte aktive
   `test_only`-Bindung. Er löscht und verändert weder App-Profil noch
   Identity-Platform-Konto.
4. Unmittelbar danach erneut mit `--revoke` previewen. Erwartet sind
   `result=unchanged`, `access_revoked=true`, keine aktive Bindung und
   identische `current_state_fingerprint`- und
   `expected_state_fingerprint`-Werte. Diesen Zustand mit einem zweiten Apply
   und dessen aktuellem `current_state_fingerprint` ausdrücklich als
   `unchanged`-No-op bestätigen; ein abschließender Preview muss unverändert
   bleiben.
5. Erst nach diesem No-op-Nachweis den Identity-Platform-Nutzer deaktivieren
   und Refresh Tokens widerrufen.
6. Mit bestehender Browsersitzung und neuer Anmeldung den negativen Zugriff
   prüfen.
7. Passwort beziehungsweise Providerdaten nicht wiederverwenden.
8. Geschütztes Roster und Offboarding-Nachweis aktualisieren.
9. Nutzer erst nach Aufbewahrungsentscheidung löschen; eine Löschung ersetzt
   nicht die vorherige Bindungsdeaktivierung.

Bei Verdacht auf Passwortoffenlegung werden Bindung und Konto sofort gesperrt.
Es wird nicht bis zum regulären Ablauf gewartet. Bei
`GUEST_ACCESS_REVOCATION_COMMIT_OUTCOME_UNKNOWN` wird der Apply nicht blind
wiederholt; ein neuer `--revoke`-Preview entscheidet anhand des vollständigen
Zustands, ob der Widerruf bereits wirksam ist.

Vor der ersten Einladung muss dieser `--revoke`-Weg in einer nicht-produktiven
Probe einschließlich `unchanged`-No-op getestet sein. Die noch benötigte
Live-Bindung wird dafür nicht probeweise widerrufen. Ohne ausführbaren
Widerrufsnachweis: `NO-GO` und keine Mail.

## Technischer Ablauf und Rückbau

`IAP_EXTERNAL_ACCESS_EXPIRES_AT` ist die primäre technische Ablaufkante. Bei
Erreichen des Zeitpunkts verweigert die Anwendung jede geschützte Anfrage
fail-closed. Eine IAM-Bedingung kann diesen Schutz im External-Modus nicht
ersetzen.

Spätestens zum Ablauf, bei gematik-Go-live oder bei einem Sicherheitsvorfall
wird zusätzlich operativ zurückgebaut:

1. Wartungsfenster aktivieren und den Dienst fail-closed halten.
2. Ausschließlich die für den Pilot ergänzten Passwort-/`test_only`-Bindungen
   mit `provision_pre_gematik_identity_platform_guest_access.mjs --revoke`
   einzeln widerrufen: Preview, Apply mit Operation
   `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS` sowie Eingabe- und
   `current_state_fingerprint`, danach bestätigter `unchanged`-No-op. Der
   Operator setzt nur `identity_bindings.active=false`; die bereits vor dem
   Pilot vorhandenen Profile und die Identity-Platform-Konten bleiben dabei
   unverändert. Erst nach dem No-op-Nachweis alle Passwortnutzer zusätzlich in
   Identity Platform deaktivieren und ihre Refresh Tokens widerrufen.
3. Die bestehenden Google-Bindungen **aktiv lassen**. Mit dem gesicherten
   Vorzustand und dem unmittelbar bestätigten `current_state_fingerprint` den
   geprüften umgekehrten Subject-Remap transaktional anwenden. Er ändert nur
   das Subject und erhält Profil, Rolle, Aktivität und Scope. Während IAP noch
   External Identities verwendet, passen die jetzt wiederhergestellten
   IAM-Subjects bewusst nicht zum External-Token; der geschlossene Dienst
   bleibt dadurch fail-closed.
4. Beide ressourcenspezifischen IAM-Zugriffspolicies gegen den gesicherten
   exakten Rollback-Zustand sowie den unveränderten Projekt-Break-glass-Pin
   prüfen. Unbekannte, leere oder voneinander abweichende Policies sind ein
   Abbruchgrund.
5. Das Anwendungsrelease zuerst mit `IAP_IDENTITY_MODE=iam` ausrollen und die
   External-Ablaufvariable aus dem aktiven Runtimevertrag entfernen. Solange
   IAP noch External-Claims ausstellt, verwirft die IAM-Runtime diese bewusst;
   der Dienst bleibt geschlossen. Derselbe Helm-Modus entfernt Deployment,
   Service, BackendConfig und Exact-Route des Passwort-Reset-Brokers.
6. Danach reconciliert derselbe Workflow beide IAP-Ressourcen auf
   `Use IAM to manage this resource` und stellt in derselben kontrollierten
   Umschalt-/Kompensationsphase die frühere Reauthentication mit
   `ENROLLED_SECOND_FACTORS` und dem genehmigten Maximalalter wieder her.
   Google löscht dabei die konfigurierte Authentication URL sowie
   Projekt-/Tenantauswahl; diese Werte sind deshalb vorher gesichert.
7. IAM-Modus, Reauthentication und Policies an beiden Ressourcen read-only
   gegen den gesicherten Zustand bestätigen.
8. Positiven Google-IAM-Login sowie negative Tests für entfernte Passwort- und
   ungebundene Konten durchführen.
9. Google- und E-Mail/Passwort-Provider erst entfernen, wenn kein IAP-Backend
   und kein anderer Dienst im Projekt sie nutzt.
10. Falls nur der Auth-Helper-Proxy vor dem Providerabbau zurückgerollt werden
    muss, zuerst `authDomain` und den primären Google-OAuth-Redirect gemeinsam
    auf den weiterhin vorregistrierten
    `https://steam-capsule-341212.firebaseapp.com/__/auth/handler`-Rückweg
    stellen und einen echten Google-Login nachweisen. Erst danach
    `frontend.authProxy.enabled=false` ausrollen. Eine einseitige Änderung von
    Browserkonfiguration, OAuth-Redirect oder Ingressroute ist unzulässig.
11. Loginseite und zugehörige Secrets, API-Keys oder temporäre
    Operatorberechtigungen nach Zielabgleich entfernen.
12. Sämtliche noch vorhandenen owner-only Wrapperlink-/Mailpaket-Dateien,
    inerten `prepared`-Objekte und aktiven Einladungen kontrolliert und bei GCS
    generationengepinnt löschen. Administrative native Reset-/Recovery-Dateien
    ebenfalls entfernen; sie wurden zu keinem Zeitpunkt versendet.

Ein Rollback gilt erst als abgeschlossen, wenn beide Backends wieder denselben
IAM-Modus besitzen, Reauthentication aktiv ist, der alte Binding-Fingerprint
stimmt und die Passwortkonten nachweislich keinen Zugang mehr haben. Das bloße
Zurückschalten einer einzelnen IAP-Ressource oder das Löschen der Loginseite ist
kein sicherer Rückbau.

## Go-/No-Go-Kriterien

`GO` ist nur zulässig, wenn:

- die Sicherheitsausnahme mit Ablaufzeitpunkt geschützt bestätigt ist,
- der Ablauf nicht nach dem aktuell genehmigten Datenpilotende
  `2026-09-30T16:00:00Z` liegt oder dessen separate Verlängerung vorliegt,
- genau die genehmigten Konten vorprovisioniert sind,
- Selbstregistrierung und Selbstlöschung nachweislich deaktiviert sind,
- die eigene Loginseite unter `https://versorgungs-kompass.de/anmelden`, die
  eigene Passwortsetzseite, aktivierte Improved Email Privacy, der exakte
  technische Google-OAuth-Callback, der höchstens 24 Stunden alte echte
  Google-Login-Nachweis und die sichtbare Provider-/UI-Prüfung bestanden sind,
- `notification.sendEmail.callbackUri` einem der beiden explizit freigegebenen
  Werte entspricht und der Provider-Fallback nur solange genutzt wird, wie der
  API-Write mit `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` blockiert ist,
- der Self-Service-Passwort-Reset ausschließlich administrativ
  vorprovisionierte und vollständig vorgebundene Passwortkonten bedient, für
  jeden Kontostatus dieselbe neutrale UI-Antwort zeigt und stets
  `continueUrl=https://versorgungs-kompass.de/start` verwendet,
- der atomare Subject-Remap und sein Rückweg geprüft sind,
- jedes Passwortkonto vor der Einladung entweder auf sein vorhandenes aktives
  Profil vorgebunden, im isolierten Anzeigename-Sonderfall atomar abgeglichen
  oder im expliziten Neunutzer-Modus atomar samt Profil angelegt wurde, exakt
  eine aktive `test_only`-Bindung besitzt und der `unchanged`-Nachweis vorliegt;
  für die wartungsgebundenen Bestandsprofil-/Reconcile-Wege liegt zusätzlich
  der No-op-Nachweis vor,
- für jede Online-Neunutzeranlage der Nachweis des Gates zu laufendem Zielkontext,
  automatischen Backups, PITR und Pins vorliegt und kein anderer Modus ohne
  Wartungsfenster sowie konkrete Backup-ID ausgeführt wurde,
- der `--revoke`-Widerruf mit
  `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS`, beiden Fingerprints und
  anschließendem `unchanged`-No-op nachgewiesen ist,
- keine Willkommensmail vor dem vollständigen Gastzugriffs-Readback versendet
  wurde, das nicht leere Text-/HTML-/EML-Paket aus der versionierten Vorlage
  stammt, der Beleg SMTP-Annahme und eine exakt 48 Stunden aktive Einladung
  generationengenau bestätigt und der gebrandete
  Passwortsetz-/`Jetzt anmelden`-/`/start`-Ablauf direkt zum genehmigten
  App-Zugang führt,
- beide Backends konsistent im External-Modus arbeiten,
- die harte Ablaufkante automatisiert getestet ist und
- sämtliche Positiv-, Negativ-, Rollen- und Scope-Tests bestanden sind.

`NO-GO` gilt insbesondere bei:

- fehlendem oder nicht technisch erzwungenem Ablaufzeitpunkt,
- gewünschter Laufzeit über `2026-09-30T16:00:00Z` ohne separat genehmigte
  Verlängerung des Datenpiloten,
- offener Registrierung,
- deaktivierter oder nicht exakt bestätigter
  `emailPrivacyConfig.enableImprovedEmailPrivacy`,
- fehlender, nicht gebrandeter oder technisch falscher Login- beziehungsweise
  Passwortsetzseite,
- abweichendem Google-OAuth-Redirect, veraltetem/fehlendem
  Google-Login-Nachweis, sichtbarem Self-Signup oder zusätzlichen sichtbaren
  Anmeldeprovidern,
- einem nicht freigegebenen Passwort-Action-Callback,
- einem Self-Service-Passwort-Reset, der Konten, Profile oder Bindings anlegt,
  bekannte und unbekannte Adressen unterscheidbar beantwortet, kein gehärtetes
  Broker-Backend verwendet oder von
  `continueUrl=https://versorgungs-kompass.de/start` abweicht,
- Linkversand vor vollständigem `unchanged`-Prebinding beziehungsweise vor dem
  zusätzlichen No-op-Nachweis eines wartungsgebundenen Weges,
- einem nativen Reset-Link in der Willkommensmail, fehlendem oder abweichendem
  `prepared`-Readback, einer nicht exakt 48 Stunden gültigen aktiven Einladung
  oder einem Wiederholungsversand bei unklarem SMTP-/Aktivierungsbeleg,
- Online-Neunutzeranlage ohne bestätigte automatische Backups, PITR oder
  vollständige Projekt-/Cluster-/Namespace-/Instanz-Pins beziehungsweise ohne
  getrennt beim Proxy-Start bestätigten Proxy-Pin sowie jedem
  anderen Gast-/Identity-/Reconcile-/Remap-Vorgang ohne Wartungsfenster und
  konkrete Backup-ID,
- fehlendem oder inaktivem Bestandsprofil im Standard-/Reconcile-Modus,
  fehlender `test_only`-Bindung oder einer kollidierenden Pending-Anfrage,
- Verwendung von `POST /api/auth/external-enrollment` oder des
  Pending-v2-Ablaufs für einen Passwortgast,
- fehlendem erfolgreichen `--revoke`-Preview-/Apply-/No-op-Nachweis für die
  Gast-Bindung,
- sichtbarem Firebase-/GCP-Projekthost im Einladungslink oder einer
  `continue_url`, die nicht exakt
  `https://versorgungs-kompass.de/start` entspricht,
- unbekanntem oder aus E-Mail abgeleitetem Subject,
- parallelem Alt-/Neu-Binding trotz Eindeutigkeitsregel,
- nicht gesichertem IAM-/Reauthentication-Vorzustand,
- Passwortkonto mit `admin` oder `standard`,
- teilweiser Backend-Umschaltung,
- fehlendem Logout oder
- nicht erfolgreichem Rollback-Test.

Die aktuellen Identity-Platform-Preise werden vor Aktivierung nochmals unter
[Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)
geprüft. Bei zwei oder drei Passwortkonten und wenigen bestehenden
Google-Nutzern wird nach heutigem Stand kein kostenpflichtiges MAU-Kontingent
erwartet; diese Erwartung ist keine Preisgarantie.
