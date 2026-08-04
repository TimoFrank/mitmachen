# Versorgungs-Kompass Identity Portal

Statischer Prototyp einer gebrandeten Identity-Platform-/IAP-Anmeldeseite für
Google und E-Mail/Passwort sowie eines eigenen Passwort-Reset-Handlers.

Dieses Portal gehört ausschließlich zur getrennten GCP-/IAP-Pre-Integration.
Der interne providerneutrale OIDC-Target-Build enthält weder dieses Verzeichnis
noch Google-Identity-Platform- oder Firebase-Konfiguration.

Das Verzeichnis ist absichtlich eigenständig. Es verändert weder die bestehende
Anwendung noch Cloud-Ressourcen und enthält keine Deployment-Automation.

## Sicherheits- und Produktgrenzen

- keine Selbstregistrierung und kein Account-Linking in der Oberfläche
- projektweite Identity-Platform-Provider, keine Tenants
- ausschließlich `google.com` und `password`
- `emailVerified=true` vor Übergabe an IAP
- klare deutsche, barrierearme eigene Formulare auf offiziellen Firebase-Auth-APIs
- Self-Service-Passwort-Reset über einen gleichursprünglichen, minimal
  privilegierten Broker nur für bestehende, verifizierte Passwort-only-Konten
- persönliche Ersteinladung über ein 32-Byte-Token ausschließlich im
  URL-Fragment; keine Einlösung beim Laden oder durch normale Mail-Previews
- exakt 48 Stunden ab SMTP-Annahme und atomar einmalig durch ein bedingtes
  Delete im privaten Einladungs-Bucket; der native Reset-Code entsteht erst
  beim bewussten Speichern des Passworts
- generische Broker- und UI-Rückmeldung unabhängig von der Kontoexistenz
- lokal gebündelte, gepinnte npm-Artefakte; keine CDN-Runtime
- exakter API-Key-Abgleich zwischen IAP-Link und lokaler Konfiguration
- Action-URL-Allowlist für Modus, Parameter, Codeformat und HTTPS-Continue-Origin
- keine automatische Weiterleitung auf ungeprüfte `continueUrl`
- Passwortregel: 14–128 Zeichen sowie Groß-/Kleinbuchstabe, Zahl und Sonderzeichen
- einmal verwendbarer Action-Code wird nach dem Parsen aus der Browseradresse entfernt

Die Oberfläche allein verhindert keine Kontoanlage. In Identity Platform müssen
`account creation` und `account deletion` weiterhin serverseitig deaktiviert
bleiben.

## Lokaler Build und Vorschau

```sh
npm ci
npm run check
npm run audit:runtime
npm run serve
```

Vorschau ohne Cloudzugriff:

- Anmeldung: `http://127.0.0.1:4174/?preview=signin`
- Passwortaktion: `http://127.0.0.1:4174/konto/passwort-festlegen/?preview=action`
- 48-Stunden-Ersteinladung: `http://127.0.0.1:4174/konto/passwort-festlegen/?preview=invitation`

Der Preview-Modus funktioniert ausschließlich auf Loopback-Hosts und nur, wenn
`enableLocalPreview` gesetzt ist. Er führt keine Authentifizierungsoperation aus.

## Konfiguration

Vor einem realen Build alle `REPLACE_*`-Werte in
`public/portal-config.js` ersetzen:

```js
window.IDENTITY_PORTAL_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: "AIza…",
    authDomain: "versorgungs-kompass.de",
    projectId: "PROJECT_ID"
  }),
  allowedContinueOrigins: Object.freeze([
    "https://versorgungs-kompass.de"
  ]),
  privacyPolicyUrl: "https://www.gematik.de/datenschutz",
  legalNoticeUrl: "https://www.gematik.de/impressum",
  supportUrl: "https://www.gematik.de/kontakt",
  enableLocalPreview: false
});
```

Das Reset-Ziel ist absichtlich keine Browserkonfiguration: Der Broker setzt es
fest auf den kanonischen `/start`-Pfad. Der Web-API-Key ist kein
Servergeheimnis, wird hier aber als strikter Umgebungsbezeichner verwendet. Es
dürfen keine Service-Account-Schlüssel,
OAuth-Client-Secrets oder personenbezogenen Soll-Roster in diese Datei gelangen.

## Zielkonfiguration (manuell, nicht von diesem Prototyp ausgeführt)

1. Die statische Ausgabe aus `dist/` öffentlich unter `/public/auth/`
   bereitstellen.
2. In IAP `https://versorgungs-kompass.de/anmelden` als eigene
   Authentication URL setzen.
3. In Identity Platform Google und E-Mail/Passwort aktivieren; alle anderen
   Provider und Selbstregistrierung deaktiviert lassen.
4. Im Passwort-Reset-Template die benutzerdefinierte Action URL auf
   `https://versorgungs-kompass.de/konto/passwort-festlegen` setzen.
5. Den exakten öffentlichen Pfad `POST /api/auth/password-reset` auf den
   separaten Broker-Service routen. Nur dieser Dienst besitzt die nötigen
   Identity-Platform-Rechte; er erhält keine Datenbank- oder Secret-Rechte.
   Im eigenen Einladungs-Bucket darf er ausschließlich anhand eines bekannten
   `active/`-Objektnamens lesen und bedingt löschen, aber weder auflisten,
   anlegen, ändern noch wiederherstellen.
6. `versorgungs-kompass.de` als Auth-Domain verwenden und
   `https://versorgungs-kompass.de/__/auth/handler` im Google-OAuth-Client als
   primären Redirect hinterlegen.
7. Ausschließlich den kanonischen Prefix `/__/auth/` über den dedizierten
   Auth-Helper-Proxy transparent und ohne Redirect an den festen,
   TLS-verifizierten Firebase-Upstream weiterleiten.

Die exakten Portalpfade und der kanonische Auth-Helper-Prefix dürfen nicht selbst
von IAP geschützt sein, sonst entsteht eine Redirect-Schleife. API, Anwendung
und derselbe Prefix auf allen Alias-Hosts bleiben weiterhin hinter IAP.

Der Browser sendet Reset-Anfragen ausschließlich gleichursprünglich an den
Broker. Dieser prüft den Identity-Platform-Datensatz und stößt den Mailversand
nur für aktive, verifizierte Passwort-only-Konten an. Unbekannte, unzulässige
und zulässige Adressen erhalten denselben öffentlichen `202`-Vertrag; die
Oberfläche zeigt deshalb immer dieselbe neutrale Erfolgsmeldung. Ein Reset
erzeugt weder Profil noch Binding und gewährt allein keinen Anwendungszugriff.

Bei einer Ersteinladung entfernt das Portal das Fragment vor dem Rendern aus
der sichtbaren Adresse und führt beim Laden keinen Brokeraufruf aus. Erst der
Passwort-Submit sendet das Token gleichursprünglich und ohne Cookies oder
Authorization. Der Broker prüft Ablauf, Projekt, UID, E-Mail und den exakten
password-only-Nutzer, konsumiert das aktive Objekt generationgebunden und
erzeugt danach einen frischen Identity-Platform-Reset-Code. So bleibt der
Mail-Link technisch 48 Stunden nutzbar, obwohl die Laufzeit nativer
Identity-Platform-OOB-Codes nicht konfigurierbar ist.

Der Browser benötigt weiterhin den öffentlichen Identity-Platform-Web-API-Key
für die Anmeldung. Soll die Passwort-only-Regel auch gegen direkte Aufrufe der
Identity-Toolkit-API projektweit gelten, ist zusätzlich eine
`beforeEmailSent`-Blocking-Function erforderlich.

## Erforderliche HTTP-Header

Die HTML-Dateien und `portal-config.js` sollten `Cache-Control: no-store`
erhalten. Zusätzlich:

```text
Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self' https://apis.google.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://iap.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src 'self'; frame-ancestors 'self'; form-action 'self'
Cross-Origin-Opener-Policy: same-origin-allow-popups
Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=()
Referrer-Policy: strict-origin
X-Content-Type-Options: nosniff
```

Die beiden HTML-Einstiege senden damit bei den browserseitigen
Identity-Toolkit- und Secure-Token-Aufrufen ausschließlich den kanonischen
Origin, niemals IAP-State, API-Key oder Pfad aus der Anmelde-URL im Referer.
Statische Assets und alle übrigen öffentlichen Antworten bleiben auf
`no-referrer`.

Der Session-Refresher von IAP kann die Auth-Seite gleichursprünglich in einem
Iframe laden; deshalb sind `frame-ancestors 'self'` und der kanonische
gleichursprüngliche Auth-Helper in `frame-src 'self'` vorgesehen. Ein
Firebase-/GCP-Projekthost gehört nicht in die browserseitige Konfiguration oder
CSP. Der Google-Popup-Resolver des Firebase-SDK lädt seinen Bootstrap und die
nachgeladenen GAPI-Module ausschließlich vom Origin
`https://apis.google.com`; deshalb ist genau dieser Script-Origin, nicht aber
ein Wildcard- oder Inline-Script, freigegeben.

Proxy- und CDN-Zugriffslogs für `/konto/passwort-festlegen/` müssen
Query-Strings ausblenden:
`oobCode` ist ein kurzlebiges Authentifizierungsmerkmal. Fehler- und
Analytics-Telemetrie darf weder Action-Codes noch vollständige URLs erfassen.

## Produktions-Gates

- `npm ci` und `npm run check`
- visuelle Prüfung auf Desktop und Mobil
- ausschließlich zwei sichtbare Provider; keine Registrierung
- echter Google-Popup-Flow und E-Mail/Passwort-Flow
- Reset-Anfrage für bekanntes und unbekanntes Konto mit identischer UI-Antwort
- IAP-Rückleitung, stille Session-Erneuerung und vollständiger Logout
- Reset mit gültigem, abgelaufenem und manipuliertem Link
- CSP in Report-Only prüfen und anschließend erzwingen
- Query-Redaktion in allen vorgeschalteten Logs nachweisen
- `enableLocalPreview: false`

Die begründete Paketentscheidung, die Peer-Metadatenabweichung sowie der
reproduzierte grüne npm-Audit
stehen in [DEPENDENCY_AUDIT.md](./DEPENDENCY_AUDIT.md).
