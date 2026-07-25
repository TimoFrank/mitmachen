# Versionierte Pre-gematik-Migrationen

Diese Dateien ergänzen eine bereits mit `../schema.sql` gebootstrappte Datenbank. Sie werden in aufsteigender Dateireihenfolge mit einem kurzlebigen oder institutionell verwalteten Schema-Admin und `ON_ERROR_STOP` angewendet. Der Laufzeitnutzer `vk_app` besitzt absichtlich keine DDL-Rechte.

Vor jeder Anwendung gelten mindestens:

1. konkrete Zielinstanz und Datenbank prüfen,
2. erfolgreiches Backup mit ID protokollieren,
3. SQL-Review im Vier-Augen-Prinzip,
4. zuerst in PostgreSQL 16 beziehungsweise einer Restore-/Abnahmeinstanz testen,
5. nach Apply `grants.sql`, Schema-Vertrag und API-Readiness prüfen.

Migrationen dürfen keine Echtdaten, IAP-Subjects, Passwörter oder umgebungsspezifischen Secrets enthalten.

Nach `202607250001_add_test_access_allowlist.sql` ist zusätzlich
`../access-allowlist-admin-role.sql` als gemeinsamer Objekt-Owner anzuwenden.
Die Migration entzieht der Runtime vorsorglich jedes Funktions-Execute; erst
der Rollen-Bootstrap überträgt die Funktion an den eng berechtigten
`vk_allowlist_executor`, prüft Owner, ACL und `SECURITY DEFINER`-Härtung und
vergibt anschließend ausschließlich `vk_app_runtime` das Execute-Recht.
