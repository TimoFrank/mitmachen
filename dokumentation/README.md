# Dokumentation

Die Dokumentation ist nach Zweck gegliedert. Führende Frontend-Quellen liegen unter [`frontend/`](../frontend/); generierte Buildausgaben sind keine Quellen.

## Gematik-PoC

- [PoC-Durchstich](betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md): Zweck, aktueller Stand, Ressourcen, Lieferumfang und Erfolgskriterien
- [Deployment auf Kubernetes](betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md): Build, Konfiguration, Bereitstellung und Smoke-Prüfung
- [Deployment-Artefakte](../deploy/README.md): Jenkins-, Helm- und Datenbankpfade
- [Sicherheitsrichtlinie](../SECURITY.md)

## Produkt und Architektur

- [Markenarchitektur](produkt-und-design/MARKENARCHITEKTUR.md)
- [Demo und Screenshots](betrieb-und-deployment/DEMO.md)
- [API-Vertrag](architektur/API_CONTRACT.md)
- [Datenmodell](architektur/DATA_MODEL.md)
- [Versorgungs-Netzwerk-Registrierung](architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md)

## Entwicklung und Qualität

- [Aktueller technischer Stand](entwicklung-und-qa/CURRENT_STATE.md)
- [QA-Ablauf](entwicklung-und-qa/QA_WORKFLOW.md)
- [Hospitations-Staging und kontrollierte Übernahme](betrieb-und-deployment/HOSPITATION_STAGING_WORKFLOW.md)
- [Automatische Produkt-Releases](betrieb-und-deployment/PRODUKT_RELEASE_PROZESS.md)
- [Mitwirken](../CONTRIBUTING.md)
- [Änderungshistorie](../CHANGELOG.md)

## Weitere Referenzen

Die Verzeichnisse enthalten zusätzliche Architektur-, Migrations-, Betriebs- und Designunterlagen. Sie sind nicht Teil der kompakten PoC-Übergabe:

- [`architektur/`](architektur/)
- [`betrieb-und-deployment/`](betrieb-und-deployment/)
- [`entwicklung-und-qa/`](entwicklung-und-qa/)
- [`produkt-und-design/`](produkt-und-design/)

## Umgebungen

- **Lokale Entwicklung:** bewegliche Arbeitsstände und lokale Varianten
- **GitHub Pages:** öffentliche Demo mit fiktiven Daten aus `dist/pages/`
- **`pre-gematik`:** getrennte GCP-Pre-Integration
- **Gematik-PoC:** befristeter interner Durchstich aus einem unveränderlichen RC und `dist/target/`

Die Buildprofile sind voneinander getrennt. Ein Pages-Artefakt wird nicht für den PoC verwendet.
