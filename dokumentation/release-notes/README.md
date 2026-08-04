# Release Notes

Dieser Ordner enthält die dauerhaft versionierten Texte der Produkt-Releases.
Wochenrelease und Hotfix erzeugen für jede Version genau eine Datei nach dem
Muster `v0.23.0.md` beziehungsweise `v0.23.1.md`.

Ein Wochenrelease enthält vollständige Notes mit Leitthema und wird als eigener
Abschnitt in Changelog und In-App-Versionshistorie übernommen. Ein Hotfix
enthält kompakte Notes mit Anlass, Korrektur, Risiko und Prüfung. Er erhält nur
einen kompakten Punkt `Hotfix vX.Y.Z` unter dem laufenden Minor-Abschnitt im
Changelog und wird im nächsten tatsächlich stattfindenden Wochenrelease erneut
berücksichtigt. Ein veröffentlichter Release
wird niemals nachträglich überschrieben; Korrekturen erhalten eine neue
Patch-Version.

Neue Releases verwenden ausschließlich den technischen Quelltag `vX.Y.Z`.
Vor `v1.0.0` werden sie bei GitHub als Prerelease mit der Bezeichnung „Release
Candidate“ veröffentlicht. Die historischen `poc-v…-rc.N`-Tags bleiben
unveränderte Evidenz und sind kein künftiges Namensmuster.
