# Rollen-Onboarding im Zielbild

Die Realanwendung verwendet keine Supabase-Anmeldung im Browser. Kolleg:innen
melden sich über den freigegebenen Identity Provider der jeweiligen Umgebung an:

- GCP-Pre-Integration: IAP,
- gematik-Zielbetrieb: OIDC/SSO.

GitHub Pages ist eine anonyme Demo mit ausschließlich synthetischen Daten und
hat keine Benutzerkonten.

## Verantwortlichkeiten

1. Plattformbetrieb legt die Identität im Identity Provider beziehungsweise in
   der freigegebenen Gruppe an.
2. Service Owner bestätigt den fachlichen Bedarf.
3. Ein autorisierter Admin ordnet die Identität serverseitig einem aktiven
   Profil mit `viewer`, `editor` oder `admin` zu.
4. Die Rolle wird mit einem echten Ziel-Token in der API geprüft.
5. Austritte oder Rollenwechsel werden im Identity Provider und im Profil
   nachvollziehbar gesperrt beziehungsweise angepasst.

## Rollen

- `viewer`: lesen, nicht schreiben.
- `editor`: freigegebene Fachabläufe bearbeiten.
- `admin`: ausdrücklich vorgesehene administrative Abläufe; kein pauschaler
  Infrastruktur- oder Datenbankzugriff.

## Abnahme je neuem Profil

- Identität und dienstlicher Bedarf bestätigt.
- Profil aktiv und genau einer vorgesehenen Rolle zugeordnet.
- Viewer kann keine Mutation ausführen.
- Editor kann erlaubte, aber keine administrativen Mutationen ausführen.
- Admin kann die vorgesehenen Admin-Abläufe ausführen.
- Fremdobjekt-, Archiv- und Direktzugriffe werden serverseitig abgewiesen.
- Deaktivierung wirkt auch für eine bereits bestehende Sitzung.

## Supabase-Übergang

Supabase bleibt vorläufig geschützte Migrationsquelle und Schutzarchiv. Neue
Supabase-Auth-Nutzer sind kein Ziel-Onboarding und dürfen nicht als Ersatz für
OIDC/IAP angelegt werden. Bestehende Profile werden beim Cutover über ein
freigegebenes Mapping auf den stabilen SSO-Subject übernommen. Bis zur
vollständigen Migration gelten die RLS-, Funktions- und Storage-Grenzen aus
[`README.md`](README.md).
