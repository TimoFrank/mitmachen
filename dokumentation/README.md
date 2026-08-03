# Dokumentation

Die Dokumentation ist nach Zweck gegliedert. Führende Frontend-Quellen liegen unter [`frontend/`](../frontend/); generierte Buildausgaben sind keine Quellen.

## Gematik-PoC

- [PoC-Durchstich](betrieb-und-deployment/POC_GEMATIK_DURCHSTICH.md): Zweck, aktueller Stand, Ressourcen, Lieferumfang und Erfolgskriterien
- [Deployment auf Kubernetes](betrieb-und-deployment/DEPLOYMENT_GEMATIK_K8S.md): Build, Konfiguration, Bereitstellung und Smoke-Prüfung
- [Deployment-Artefakte](../deploy/README.md): Jenkins-, Helm- und Datenbankpfade
- [Sicherheitsrichtlinie](../SECURITY.md)

## Befristete Pre-gematik-Identität

- [Identity-Platform-Übergang](betrieb-und-deployment/PRE_GEMATIK_EXTERNAL_IDENTITIES_PILOT.md): Google- und administrativ provisionierte Passwortkonten, Sicherheitsausnahme, Subject-Remap, Abnahme, Ablauf und IAM-Rollback

## Produkt und Architektur

- [Markenarchitektur](produkt-und-design/MARKENARCHITEKTUR.md)
- [gemVST-Markenpaket](produkt-und-design/GEMVST_MARKENPAKET.md): Entscheidungsvorlage für #Mitmachen, Produktname, Module und Seitentaxonomie
- [#Mitmachen Logo- und Markenstudie](produkt-und-design/MITMACHEN_LOGO_ALTERNATIVEN.md): 20 Signetvarianten, Flechtwerk-System, Motion-Kit und Produktionsdateien
- [Demo und Screenshots](betrieb-und-deployment/DEMO.md)
- [API-Vertrag](architektur/API_CONTRACT.md)
- [Datenmodell](architektur/DATA_MODEL.md)
- [Versorgungs-Netzwerk-Registrierung](architektur/VERSORGUNGS_NETZWERK_REGISTRIERUNG.md)
- [TYPO3-#Mitmachen-Connector](architektur/TYPO3_MITMACHEN_CONNECTOR.md): Powermail-Mapping, HMAC-Vertrag, Installation, Betrieb und Abnahme

## Rechtliches und Entscheidungsvorlagen

- [Datenschutz-Entscheidungspaket](rechtliches/entscheidungsvorlage/README.md): Managementvorlage, Präsentation, Mailvorlagen und gerenderte Vorschauen
- [Managementvorlage Datenschutz](rechtliches/ENTSCHEIDUNGSVORLAGE_VERSORGUNGSKOMPASS_DSB_MANAGEMENT.md)
- [DSB-Mailvorlagen](rechtliches/MAILVORLAGEN_DSB_VERSORGUNGSKOMPASS.md)

## Entwicklung und Qualität

- [Aktueller technischer Stand](entwicklung-und-qa/CURRENT_STATE.md)
- [QA-Ablauf](entwicklung-und-qa/QA_WORKFLOW.md)
- [Hospitations-Staging und kontrollierte Übernahme](betrieb-und-deployment/HOSPITATION_STAGING_WORKFLOW.md)
- [Generierte Buildausgaben](betrieb-und-deployment/BUILD_ARTEFAKTE.md): lokale und in CI erzeugte, nicht versionierte Artefakte
- [Automatische Produkt-Releases](betrieb-und-deployment/PRODUKT_RELEASE_PROZESS.md)
- [Versionierte Release Notes](release-notes/): dauerhaft veröffentlichte Texte je Produktversion
- [Mitwirken](../CONTRIBUTING.md)
- [Änderungshistorie](../CHANGELOG.md)

## Weitere Referenzen

Die Verzeichnisse enthalten zusätzliche Architektur-, Migrations-, Betriebs- und Designunterlagen. Sie sind nicht Teil der kompakten PoC-Übergabe:

- [`architektur/`](architektur/)
- [`betrieb-und-deployment/`](betrieb-und-deployment/)
- [`entwicklung-und-qa/`](entwicklung-und-qa/)
- [`produkt-und-design/`](produkt-und-design/)
- [`rechtliches/`](rechtliches/)

## Umgebungen

- **Lokale Entwicklung:** bewegliche Arbeitsstände und lokale Varianten
- **GitHub Pages:** öffentliche Demo mit fiktiven CRM-/Fachdaten und kuratiertem Amtsträger-Verzeichnis aus `dist/pages/`
- **`pre-gematik`:** getrennte GCP-Pre-Integration
- **Gematik-PoC:** interner Durchstich aus einem unveränderlichen RC und `dist/target/`

Die Buildprofile sind voneinander getrennt. Ein Pages-Artefakt wird nicht für den PoC verwendet.
