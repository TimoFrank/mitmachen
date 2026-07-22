# Versionierte Pre-gematik-Migrationen

Diese Dateien ergänzen eine bereits mit `../schema.sql` gebootstrappte Datenbank. Sie werden in aufsteigender Dateireihenfolge mit einem kurzlebigen oder institutionell verwalteten Schema-Admin und `ON_ERROR_STOP` angewendet. Der Laufzeitnutzer `vk_app` besitzt absichtlich keine DDL-Rechte.

Vor jeder Anwendung gelten mindestens:

1. konkrete Zielinstanz und Datenbank prüfen,
2. erfolgreiches Backup mit ID protokollieren,
3. SQL-Review im Vier-Augen-Prinzip,
4. zuerst in PostgreSQL 16 beziehungsweise einer Restore-/Abnahmeinstanz testen,
5. nach Apply `grants.sql`, Schema-Vertrag und API-Readiness prüfen.

Migrationen dürfen keine Echtdaten, IAP-Subjects, Passwörter oder umgebungsspezifischen Secrets enthalten.
