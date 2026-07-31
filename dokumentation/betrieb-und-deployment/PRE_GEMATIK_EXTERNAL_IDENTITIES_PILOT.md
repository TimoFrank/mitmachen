# Befristeter IAP-Pilot mit Identity Platform

Status: Umsetzungs- und Betriebsvertrag für `pre-gematik`; **noch kein
Live-Nachweis und keine institutionelle Freigabe**

Stand: 30. Juli 2026

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
`2026-08-17T16:00:00Z`. Ohne eine getrennt genehmigte Verlängerung dieses
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
vorhandenes aktives Profil gebunden. Der frühere Post-Login-Weg über
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
- bei bestehenden Google-Nutzern und Passwortkonten jeweils die bereits
  vorhandene Profil-ID,
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
- einen funktionierenden vollständigen Logout.

Sie enthält keine Selbstregistrierung, keine anonyme Anmeldung und kein
Account-Linking und keinen Self-Service-Passwort-Reset. Ein abgelaufener oder
verbrauchter Einladungslink wird ausschließlich administrativ als neuer
owner-only Recovery-Link ersetzt. Vor jedem `GO` wird die tatsächlich
ausgelieferte Seite in einem privaten Browserfenster visuell geprüft; als
Anmeldeprovider dürfen ausschließlich Google und E-Mail/Passwort sichtbar sein
und Self-Signup muss verborgen sein.

Für die eigene Login- und Passwortsetzseite gelten zusätzlich diese harten
Gates:

1. `emailPrivacyConfig.enableImprovedEmailPrivacy=true` ist read-only zu
   bestätigen. Login- und Fehlertexte bleiben neutral und verraten nicht, ob
   ein Konto, Profil oder Binding existiert.
2. `IAP_EXTERNAL_LOGIN_PAGE_URI` entspricht bytegenau
   `https://versorgungs-kompass.de/anmelden`.
3. Der primäre, im Google-OAuth-Client freigegebene Redirect-URI entspricht
   bytegenau
   `https://versorgungs-kompass.de/__/auth/handler`. Dieser technische
   Callback ist ausschließlich OAuth-Infrastruktur und darf weder als
   Einladungslink noch als sichtbarer Login- oder Passwortsetz-Link verwendet
   werden. Der bisherige Redirect
   `https://steam-capsule-341212.firebaseapp.com/__/auth/handler` bleibt nur
   während des Piloten als inaktiver Rollback-Eintrag registriert; Login-
   Konfiguration und Abnahmen referenzieren stets den kanonischen Redirect.
4. Die Passwortsetzseite liegt bytegenau unter
   `https://versorgungs-kompass.de/konto/passwort-festlegen`; der
   `continue_url` jedes Passwortkontos ist bytegenau
   `https://versorgungs-kompass.de/start`.
5. Ein echter erfolgreicher Google-Login über die eigene Loginseite ist
   höchstens 24 Stunden vor Deployment nachzuweisen. Außerdem wird der
   vollständige Passwortgast-Ablauf erst nach abgeschlossenem Prebinding
   nachgewiesen. Der UTC-Zeitpunkt steht in
   `IDENTITY_PLATFORM_GOOGLE_LOGIN_VERIFIED_AT`.
   `IDENTITY_PLATFORM_GOOGLE_LOGIN_EVIDENCE_SHA256` pinnt das kanonische Tupel
   aus `approvedPasswordResetSucceeded: true`, `clientId`,
   `googleLoginSucceeded: true`, dem exakten technischen Redirect,
   `selfSignupVisible: false`, `visibleOptions: ["google.com","password"]` und
   `verifiedAt`.

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
  --output /absolut/owner-only/set-password-link.txt \
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
er für den angelegten Account einen Set-password-Link über den
Password-Reset-Vertrag. Ausschließlich dieser Link wird create-only mit Modus
`0600` in die bestätigte Datei außerhalb des Worktrees geschrieben. Die
Standardausgabe enthält nur Modus, Mengen und Fingerprint, niemals E-Mail, UID,
Passwort oder Link.

**Die so erzeugte Linkdatei darf jetzt noch nicht versendet werden.** Sie bleibt
owner-only, bis das App-Prebinding aus Abschnitt 5 vollständig angewendet,
read-only bestätigt und als No-op wiederholt wurde. Wenn dieser Nachweis nicht
exakt gelingt, gibt es keine Willkommensmail und keine Linkweitergabe. Damit
kann niemand zuerst ein Passwort setzen und anschließend wegen einer noch
fehlenden App-Bindung am Versorgungs-Kompass scheitern.

Scheitert der Account-Aufruf nach möglichem Commit, dessen unmittelbarer
Read-back oder die Link-Erzeugung, wird der Account nicht automatisch gelöscht
und der create-only Apply nicht wiederholt. Nach read-only Bestätigung von UID,
E-Mail, `emailVerified=true` und aktivem Zustand darf ausschließlich der Link
mit einem neuen Output-Pfad wiederhergestellt werden:

```bash
node scripts/provision_pre_gematik_identity_platform_account.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --output /absolut/owner-only/set-password-link-recovery.txt \
  --recover-link-only \
  --apply \
  --confirm-environment pre-gematik \
  --confirm-project example-project \
  --confirm-operation RECOVER_PRE_GEMATIK_SET_PASSWORD_LINK \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Ein neuer beziehungsweise Recovery-Link wird erst nach erfolgreichem
Prebinding erzeugt oder aus seiner owner-only Datei entnommen. Ein vor dem
Prebinding erzeugter Link bleibt bis dahin ungeteilt und wird bei Erzeugung
eines Recovery-Links kontrolliert verworfen. Vor dem Versand wird read-only
bestätigt, dass der sichtbare Link mit
`https://versorgungs-kompass.de/konto/passwort-festlegen` beginnt, als
`continueUrl` exakt `https://versorgungs-kompass.de/start` trägt und weder
`firebaseapp.com` noch den GCP-Projektnamen als sichtbaren Host enthält.

Die Mail wird nicht frei aus der Linkdatei zusammengesetzt. Der versionierte
Renderer
[`render_pre_gematik_guest_welcome_email.mjs`](../../scripts/render_pre_gematik_guest_welcome_email.mjs)
erzeugt nach einem Preview ein create-only, owner-only Mailpaket mit Betreff,
Text, HTML und importierbarer EML-Datei. Der Renderer lehnt leere Vorlagen,
fremde Hosts, Firebase-/Projektlinks, zusätzliche URL-Parameter, Remote-Bilder,
Tracking, Skripte und Header-Injection ab. Einmal-Link und Kontodaten erscheinen
nicht in seiner Standardausgabe.

```bash
# Preview; erst nach vollständigem Prebinding ausführen
node scripts/render_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/set-password-link.txt \
  --sender-name "Versorgungs-Kompass Team" \
  --sender-email owner@example.invalid \
  --pilot-end 2026-08-17T16:00:00Z

# Create-only Mailpaket; Fingerprint exakt aus dem Preview übernehmen
node scripts/render_pre_gematik_guest_welcome_email.mjs \
  --input /absolut/owner-only/identity-platform-account.json \
  --link-file /absolut/owner-only/set-password-link.txt \
  --output-dir /absolut/owner-only/welcome-mail \
  --sender-name "Versorgungs-Kompass Team" \
  --sender-email owner@example.invalid \
  --pilot-end 2026-08-17T16:00:00Z \
  --apply \
  --confirm-operation RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL \
  --confirm-fingerprint sha256:FINGERPRINT-AUS-PREVIEW
```

Für den manuellen Versand aus dem persönlichen iCloud-Postfach wird
`welcome.eml` beziehungsweise der geprüfte Betreff mit `body.html` verwendet;
Betreff oder Nachrichtentext dürfen nicht leer sein. Nach dem Versand wird im
Ordner „Gesendet“ read-only geprüft, dass Empfänger, Betreff, sichtbarer
Versorgungs-Kompass-Link und Nachrichtentext vorhanden sind.

Verbindlich sind:

- persönliches Konto, keine Sammel- oder Rollenadresse,
- aktivierte
  [strenge Password Policy](https://cloud.google.com/identity-platform/docs/password-policy),
- vor Aktivierung unabhängig bestätigtes Eigentum an der E-Mail-Adresse und
  `emailVerified=true`,
- Übergabe des Set-password-Links erst nach vollständigem Prebinding und
  ausschließlich über einen genehmigten persönlichen Einzelkanal,
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
- kein Passwort und kein Set-password-Link in Ticket, allgemeinem Chat, Git,
  Shell-History, Konsolenausgabe oder Nachweis,
- kein HTTP-Debug- oder Proxy-Logging für den Operator, weil der
  browseröffentliche API-Key protokolltechnisch trotzdem nicht unnötig
  vervielfältigt werden darf,
- keine parallele Google- und Passwortidentität mit derselben E-Mail ohne
  ausdrücklich getestetes Account-Linking und
- neue Konten niemals mit Rolle `admin` oder Scope `standard`.

Der Set-password-Link ersetzt die Übermittlung eines Initialpassworts. Identity
Platform besitzt keinen zusätzlich angenommenen, automatisch erzwungenen
„Passwortwechsel beim ersten Login“-Schalter. Der Password-Reset-Link dient
hier ausschließlich als Set-password-Einladung für den E-Mail/Passwort-
Provider; er ist kein passwortloser IAP-Login und ersetzt nicht die
anschließende Anmeldung mit dem gesetzten Passwort. Die Bindung ist zu diesem
Zeitpunkt bereits vollständig aktiv und verifiziert. Kann das erfolgreiche
Setzen und der anschließende App-Login nicht kontrolliert bestätigt werden,
wird das Konto gesperrt; es wird nicht durch Post-Login-Enrollment repariert.

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

Mit der in
[PRE_GEMATIK_IDENTITY_ADMIN.md](PRE_GEMATIK_IDENTITY_ADMIN.md)
beschriebenen kurzlebigen, least-privilege Operatorverbindung werden zuerst
zwei getrennte read-only Previews ausgeführt:

Für die private Cloud-SQL-Zielinstanz laufen Standard-Prebinding und der
Anzeigename-Sonderfall produktiv ausschließlich als `guest-preview` und
`guest-apply` im
[GKE-Migrationsoperator](../../deploy/migration-operator/README.md). Die
folgenden direkten Script-Aufrufe beschreiben den zugrundeliegenden
Bestätigungsvertrag, nicht einen alternativen produktiven Netzpfad. Die
GKE-Phasen exponieren absichtlich weder `--create-profile-and-prebind` noch
`--revoke`.

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

Für einen echten Neunutzer ohne App-Profil werden stattdessen zwei identische
Previews mit `--create-profile-and-prebind` ausgeführt. Nur ein vollständig
leerer relevanter Zustand darf `result=create_profile_and_binding` melden:

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
`result=unchanged` und identische Ist-/Soll-Fingerprints melden; ein
ausdrücklich bestätigter zweiter Apply bleibt No-op. Der Standardmodus und der
Neunutzer-Modus dürfen niemals gegeneinander ausgetauscht werden. Ein
vorhandener Teilzustand, eine Pending-Anfrage oder irgendeine Abweichung
stoppt fail-closed.

`POST /api/auth/external-enrollment`, Pending-`requestId` und
`provision_pre_gematik_test_access` werden für diesen Ablauf nicht verwendet.
Eine daraus stammende Pending-Anfrage ist keine Vorstufe, sondern eine
Kollision. Ohne exakt vollständiges Prebinding wird weder ein neuer
Set-password-Link erzeugt beziehungsweise ausgewählt noch eine Mail versendet.

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
- den bestätigten `unchanged`-/No-op-Nachweis vor dem Linkversand.

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
   `2026-08-17T16:00:00Z`, sofern dieses nicht separat verlängert wurde.
3. Provider, Selbstregistrierungssperre, strenge Password Policy, bestehende
   Google-Nutzer, password-only Nutzer und die eigene Login- und
   Passwortsetzseite vorbereiten, ohne IAP bereits umzuschalten.
   `emailPrivacyConfig.enableImprovedEmailPrivacy=true`, die sichtbaren
   Loginoptionen, `https://versorgungs-kompass.de/anmelden`, der exakte
   Google-Callback
   `https://versorgungs-kompass.de/__/auth/handler`, der kanonische
   Auth-Helper-Proxy und der
   höchstens 24 Stunden alte echte Google-Login-Nachweis müssen vollständig
   sein. Noch wird keine Einladung versendet.
4. Jedes Passwortkonto create-only mit
   `continue_url=https://versorgungs-kompass.de/start` anlegen. Den zunächst
   owner-only geschriebenen Set-password-Link nicht versenden. Anschließend
   den passenden Gastzugriffsmodus zweimal mit stabilen Eingabe- und
   Istzustands-Fingerprints previewen: für ein Bestandsprofil
   `PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`; bei der isolierten,
   ansonsten exakt gepinnten Anzeigename-Abweichung ausschließlich
   `RECONCILE_PROFILE_DISPLAY_NAME_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST`
   über `guest-preview`/`guest-apply`; für einen vollständig neuen Gast
   ausdrücklich
   `CREATE_PROFILE_AND_PREBIND_IDENTITY_PLATFORM_PASSWORD_GUEST` mit
   `--create-profile-and-prebind`. Anschließend per `unchanged`-Readback sowie
   bestätigt ausgeführtem No-op abnehmen. Ein unerwarteter Teilzustand oder
   jede andere Abweichung ist `NO-GO`.
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
11. Erst jetzt für jedes exakt vorgebundene Passwortkonto einen neuen
    beziehungsweise Recovery-Link in einer owner-only Datei erzeugen oder den
    noch gültigen owner-only Link auswählen und über den genehmigten
    persönlichen Kanal als professionelle Willkommensmail versenden. Bei
    fehlendem Prebinding-Nachweis: **keine Mail**.
12. Die Person öffnet den gebrandeten Link, setzt das Passwort, wählt
    `Jetzt anmelden`, gelangt über `/start` zur gemeinsamen Loginseite und
    erreicht nach E-Mail-/Passwort-Anmeldung direkt Frontend und API. Danach
    wird die Linkdatei kontrolliert gelöscht.
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
- [ ] `IAP_EXTERNAL_LOGIN_PAGE_URI` entspricht exakt
  `https://versorgungs-kompass.de/anmelden`.
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
  E-Mail/Passwort als Anmeldeprovider; Selbstregistrierung, weitere Provider,
  Account-Linking, anonyme Anmeldung und Self-Service-Passwort-Reset sind nicht
  sichtbar.
- [ ] Die eigene Passwortsetzseite wird unter
  `https://versorgungs-kompass.de/konto/passwort-festlegen` ausgeliefert; der
  Einladungslink zeigt keinen Firebase-/GCP-Projekthost und trägt
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
  `result=create_profile_and_binding`. Zwei Previews melden jeweils stabile
  `input_fingerprint`- und `current_state_fingerprint`-Werte.
- [ ] Apply, anschließender `unchanged`-Readback, bestätigter No-op und
  abschließender Readback belegen genau eine aktive `test_only`-Bindung mit
  genehmigtem `scope_ref`; im Standardmodus wurde kein Profil, im expliziten
  Neunutzer-Modus wurden Profil und Binding atomar angelegt.
- [ ] Für das Passwortkonto gibt es keine Pending-Anfrage; weder
  `POST /api/auth/external-enrollment` noch der v2-Testzugangsoperator wurden
  im Onboarding verwendet.
- [ ] Die Willkommensmail wurde erst nach diesem Prebinding-Nachweis versendet.
  Sie wurde mit `RENDER_PRE_GEMATIK_GUEST_WELCOME_EMAIL` aus den versionierten
  Text-/HTML-Vorlagen erzeugt. Absender, nicht leerer Betreff, nicht leerer
  Text, Linkbeschriftung und sichtbarer Link verweisen eindeutig auf den
  Versorgungs-Kompass; der „Gesendet“-Readback bestätigt Empfänger und Inhalt.
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
keine Self-Service-Funktion. Ein neuer Passwortsetz-/Recovery-Link für ein
bereits administrativ angelegtes, unabhängig verifiziertes und exakt
vorgebundenes Pilotkonto wird ausschließlich administrativ erzeugt und wieder
owner-only übergeben. Vor jedem Versand wird der vollständige
`unchanged`-Prebinding-Zustand erneut bestätigt.

## Individuelles Offboarding

Eine Person wird in dieser Reihenfolge gesperrt:

1. Noch nicht versendete Set-password-/Recovery-Linkdateien kontrolliert
   löschen und die Einladung nicht mehr zustellen.
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
   der Dienst bleibt geschlossen.
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
12. Sämtliche noch vorhandenen owner-only Set-password-/Recovery-Linkdateien
    kontrolliert löschen.

Ein Rollback gilt erst als abgeschlossen, wenn beide Backends wieder denselben
IAM-Modus besitzen, Reauthentication aktiv ist, der alte Binding-Fingerprint
stimmt und die Passwortkonten nachweislich keinen Zugang mehr haben. Das bloße
Zurückschalten einer einzelnen IAP-Ressource oder das Löschen der Loginseite ist
kein sicherer Rückbau.

## Go-/No-Go-Kriterien

`GO` ist nur zulässig, wenn:

- die Sicherheitsausnahme mit Ablaufzeitpunkt geschützt bestätigt ist,
- der Ablauf nicht nach dem aktuell genehmigten Datenpilotende
  `2026-08-17T16:00:00Z` liegt oder dessen separate Verlängerung vorliegt,
- genau die genehmigten Konten vorprovisioniert sind,
- Selbstregistrierung und Selbstlöschung nachweislich deaktiviert sind,
- die eigene Loginseite unter `https://versorgungs-kompass.de/anmelden`, die
  eigene Passwortsetzseite, aktivierte Improved Email Privacy, der exakte
  technische Google-OAuth-Callback, der höchstens 24 Stunden alte echte
  Google-Login-Nachweis und die sichtbare Provider-/UI-Prüfung bestanden sind,
- der atomare Subject-Remap und sein Rückweg geprüft sind,
- jedes Passwortkonto vor der Einladung entweder auf sein vorhandenes aktives
  Profil vorgebunden, im isolierten Anzeigename-Sonderfall atomar abgeglichen
  oder im expliziten Neunutzer-Modus atomar samt Profil angelegt wurde, exakt
  eine aktive `test_only`-Bindung besitzt und der `unchanged`-/No-op-Nachweis
  vorliegt,
- der `--revoke`-Widerruf mit
  `REVOKE_IDENTITY_PLATFORM_PASSWORD_GUEST_ACCESS`, beiden Fingerprints und
  anschließendem `unchanged`-No-op nachgewiesen ist,
- keine Willkommensmail vor dem vollständigen Gastzugriffs-Readback versendet
  wurde, das nicht leere Text-/HTML-/EML-Paket aus der versionierten Vorlage
  stammt und der gebrandete
  Passwortsetz-/`Jetzt anmelden`-/`/start`-Ablauf direkt zum genehmigten
  App-Zugang führt,
- beide Backends konsistent im External-Modus arbeiten,
- die harte Ablaufkante automatisiert getestet ist und
- sämtliche Positiv-, Negativ-, Rollen- und Scope-Tests bestanden sind.

`NO-GO` gilt insbesondere bei:

- fehlendem oder nicht technisch erzwungenem Ablaufzeitpunkt,
- gewünschter Laufzeit über `2026-08-17T16:00:00Z` ohne separat genehmigte
  Verlängerung des Datenpiloten,
- offener Registrierung,
- deaktivierter oder nicht exakt bestätigter
  `emailPrivacyConfig.enableImprovedEmailPrivacy`,
- fehlender, nicht gebrandeter oder technisch falscher Login- beziehungsweise
  Passwortsetzseite,
- abweichendem Google-OAuth-Redirect, veraltetem/fehlendem
  Google-Login-Nachweis, sichtbarem Self-Signup oder zusätzlichen sichtbaren
  Anmeldeprovidern,
- Self-Service-Passwort-Reset auf der Loginseite,
- Linkversand vor vollständigem `unchanged`-/No-op-Prebinding,
- fehlendem oder inaktivem Bestandsprofil, fehlender `test_only`-Bindung oder
  einer kollidierenden Pending-Anfrage,
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
