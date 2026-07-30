# Abhängigkeitsentscheidung

Stand: 30. Juli 2026

## Gewählte Laufzeit

| Paket | Version | Zweck |
| --- | ---: | --- |
| `gcip-iap` | `2.0.1` | offizieller IAP-/Identity-Platform-Protokollhandler |
| `firebase` | `12.17.0` | aktuelle modulare Firebase-Authentifizierung |
| `react` / `react-dom` | `19.2.8` | lokales Rendering der eigenen Formulare |
| `esbuild` | `0.28.1` | lokale, statische Browser-Bundles |

Alle Versionen und Registry-Integritätswerte stehen im `package-lock.json`.
FirebaseUI wird nicht zur Laufzeit eingebaut; die schlanke Formularschicht ruft
nur offizielle Firebase-Auth-APIs auf.

## Begründete Peer-Metadatenabweichung

`gcip-iap@2.0.1` deklariert in npm weiterhin `firebase: ^9.8.3`. Die aktuelle
Google-Cloud-Dokumentation beschreibt den modularen `gcip-iap`-2-Pfad dagegen
als Firebase `9.8.3+`, ohne eine Obergrenze. Die verwendeten modularen
Schnittstellen (`initializeApp`, `getAuth`, `Auth`, `UserCredential`) bestehen
in Firebase 12 fort.

Ein enges npm-Override ordnet deshalb ausschließlich dem Paket `gcip-iap`
Firebase `12.17.0` zu. Es erzeugt keine zweite Firebase-Kopie:

```text
├── firebase@12.17.0 overridden
└─┬ gcip-iap@2.0.1
  └── firebase@12.17.0 deduped
```

Das ersetzt keinen echten IAP-Integrationstest. Vor Produktion sind
Google-Popup, E-Mail/Passwort, Session-Refresh, vollständiger Logout und der
Passwort-Reset mit einem separaten Testkonto in der Zielumgebung zu prüfen.
Schlägt dieses Gate fehl, wird nicht deployt.

## Warum keine FirebaseUI-Laufzeit

- FirebaseUI 6 benötigt die Compat-API.
- FirebaseUI 7 ist modular, erweitert den Stack aber um React-Komponenten und
  eigene Peer-Grenzen, ohne für die zwei benötigten Formulare einen
  Sicherheits- oder Funktionsgewinn zu liefern.
- Die eigene Formularschicht erzeugt keine Konten, verknüpft keine Provider und
  wahrt Improved Email Privacy durch identische Antworten für unbekannte und
  bekannte Reset-Adressen.

## Reproduzierter Audit

Nach frischem Lockfile-Abgleich:

```text
npm ls firebase gcip-iap --all
npm audit --omit=dev --audit-level=moderate
```

Ergebnis: **0 Schwachstellen**. `npm audit fix`, unkontrollierte Upgrades,
Cloud-Mutationen und Deployments wurden nicht ausgeführt.

Die CSP und der zusätzliche fail-closed Check auf ein unerwartetes
`__FIREBASE_DEFAULTS__`-Cookie bleiben als Defense-in-depth aktiv, obwohl der
zugehörige historische Auth-Befund in Firebase 12 behoben ist.

## Quellen

- [Google Cloud: Eigene IAP-Anmeldeseite](https://cloud.google.com/iap/docs/create-custom-auth-ui)
- [Google Cloud: IAP-Anmeldeseite mit FirebaseUI](https://cloud.google.com/iap/docs/using-firebaseui)
- [Firebase: Eigene E-Mail-Action-Handler](https://firebase.google.com/docs/auth/custom-email-handler)
