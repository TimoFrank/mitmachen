# Feldentscheidungsmatrix Kontakte und Organisationen

Stand: 11. Juli 2026

Diese Matrix begrenzt die erste Umsetzung bewusst auf wenige P0-Felder. Das #Mitmachen-Einwilligungsmodell bleibt in Stufe 1 absichtlich kontaktbezogen und einfach; feinere Zwecke, Kanaele und Ereignishistorie folgen spaeter.

## Entscheidungsmatrix

| Information | Entität | Priorität | Entscheidung | Begründung und Umsetzung |
| --- | --- | --- | --- | --- |
| Funktion bzw. Rolle des Kontakts | Kontakt | P0 | Einführen bzw. persistierbar machen | Das Feld ist fachlich nützlich und in Erfassung, Import, Profil und Qualitätsprüfung bereits sichtbar. Speicherung in `contacts.role`. |
| Primärsystem-Typ | Organisation | P0 | Einführen | Kerninformation für PVS, KIS, AVS und weitere Primärsystemklassen. Speicherung in `organization_primary_systems.system_type`. |
| Hersteller | Organisation | P0 | Optional einführen | Erlaubt eine erste Markt- und Integrationssicht, ohne einen eigenen Herstellerkatalog aufzubauen. |
| Produktname | Organisation | P0 | Optional einführen | Konkretisiert den Systemtyp, wenn das eingesetzte Produkt bekannt ist. |
| Öffentliche Quellen-URL | Organisation | P0 | Optional einführen | Macht die Angabe nachvollziehbar, ohne einen zusätzlichen Verifikationsprozess einzuführen. |
| Zuständigkeit innerhalb der gematik | Kontakt oder Organisation | – | Nicht einführen | Für den aktuellen Pflege- und Nutzungskontext nicht notwendig. |
| Beziehungsstatus | Kontakt oder Organisation | – | Nicht einführen | Kein ausreichender P0-Nutzen gegenüber zusätzlichem Pflegeaufwand. |
| TI-Anwendungen | Organisation | – | Nicht einführen | Primärsysteme werden bewusst nicht mit TI-Anwendungen vermischt. |
| Nutzungsstatus des Primärsystems | Organisation | – | Nicht einführen | `usage_status` entfällt im vereinfachten P0-Modell. |
| Verifikationszeitpunkt und verifizierende Person | Organisation | – | Nicht einführen | `verified_at` und `verified_by` entfallen. Die optionale Quellen-URL genügt für P0. |
| #Mitmachen-Einwilligungsstatus | Kontakt | P0 | Einführen | Ein gemeinsamer Zweck mit fünf eindeutigen Statuswerten. Sichtbar und pflegbar im eigenen Kontakt-Reiter. |
| Zeitpunkt, Quelle und Textversion | Kontakt | P0 | Schlank einführen | Erforderlicher Nachweis ohne eigenes Einwilligungsobjekt. Bei `granted` sind Zeitpunkt und Quelle Pflicht. |
| Erfassende Person und Nachweisvermerk | Kontakt | P0 | Schlank einführen | Macht manuelle und ausdrücklich mündliche Bestätigungen nachvollziehbar. Regelmäßige Beteiligung allein bleibt `clarification_needed`. |
| Zweck- und Kanal-Matrix | Kontakt | – | Später prüfen | Für Stufe 1 nicht nötig, da die gematik-Datenschutzerklärung #Mitmachen als gemeinsamen Kontaktzweck beschreibt. |

## Modellregel

Primärsysteme gehören zur Organisation. Ein Kontakt zeigt die Primärsysteme seiner verknüpften Organisation nur abgeleitet an. Dadurch entstehen keine redundanten Primärsystemdaten pro Person.

Eine Organisation kann mehrere Primärsysteme besitzen. Eine eigene Produkt- oder Hersteller-Stammdatentabelle ist für P0 nicht vorgesehen.
