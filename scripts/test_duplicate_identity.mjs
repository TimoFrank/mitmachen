import assert from "node:assert/strict";
import {
  canonicalDuplicatePersonName,
  contactsAreDefiniteDuplicates,
  contactsArePotentialDuplicates,
  contactsAreSameCanonicalIdentity,
  organizationsAreSameCanonicalIdentity
} from "../api/duplicate-identity.mjs";

assert.equal(
  canonicalDuplicatePersonName("Prof. Dr. med. Jörg Weiß"),
  canonicalDuplicatePersonName("Joerg Weiss"),
  "Titel, Umlaute und Transliteration müssen dieselbe Person ergeben."
);

assert.equal(contactsAreDefiniteDuplicates(
  { name: "Dr. Ada Beispiel", organization_id: "org-alpha", city: "Hamburg" },
  { name: "Ada Beispiel", organization_id: "org-alpha", city: "Berlin", status: "archived" }
), true, "Dieselbe Organisation muss auch bei anderem Ort als definitive Dublette gelten.");

assert.equal(contactsAreDefiniteDuplicates(
  { name: "Dr. Ada Beispiel", organization_id: "org-alpha", organization: "Praxis Alpha", city: "Hamburg" },
  { name: "Ada Beispiel", organization_id: "org-beta", organization: "Praxis Beta", city: "Hamburg" }
), false, "Zwei eindeutig verschiedene Organisationen dürfen nicht allein wegen desselben Orts kollidieren.");

assert.equal(contactsAreDefiniteDuplicates(
  { name: "Dr. Ada Beispiel", organization_id: "org-alpha", organization: "Praxis Alpha", city: "Hamburg", email: "ada@example.test" },
  { name: "Ada Beispiel", organization_id: "org-beta", organization: "Praxis Beta", city: "Berlin", email: "ADA@example.test" }
), true, "Ein übereinstimmender Kontaktkanal muss einen Organisationskonflikt überstimmen.");

assert.equal(contactsAreDefiniteDuplicates(
  { name: "Dr. Ada Beispiel", organization: "Nordring Apotheke", city: "Wiesbaden" },
  { name: "Ada Beispiel", organization: "Nordring Klinikum", city: "Wiesbaden" }
), false, "Apotheke und Klinikum dürfen trotz gemeinsamem Namensbestandteil nicht als Organisationsvariante gelten.");

assert.equal(contactsArePotentialDuplicates(
  { name: "Cornelia Weichard", organization: "Nordring Apotheke", city: "Wiesbaden" },
  { name: "Caroline Weichard", organization: "Nordring Klinikum", city: "Wiesbaden" }
), false, "Unterschiedliche Organisationstypen dürfen auch keinen unscharfen Familienkonflikt erzeugen.");

assert.equal(contactsArePotentialDuplicates(
  { name: "Alice Meyer", organization_id: "org-alpha", city: "Hamburg" },
  { name: "Bob Meyer", organization_id: "org-alpha", city: "Hamburg" }
), false, "Ein gemeinsamer Nachname in derselben Organisation darf unterschiedliche Vornamen nicht blockieren.");

assert.equal(contactsArePotentialDuplicates(
  { name: "Christian von Malinckrodt", organization_id: "org-alpha", city: "Hamburg" },
  { name: "Christian von Mallinckrodt", organization_id: "org-alpha", city: "Hamburg" }
), true, "Eine einzelne Schreibabweichung im vollständigen Namen soll als potenzielle Dublette erkannt werden.");

assert.equal(contactsAreDefiniteDuplicates(
  { name: "Dr. Ada Beispiel", organization: "Nordring Apotheke", city: "Wiesbaden" },
  { name: "Ada Beispiel", organization: "Nordring Apotheke mit Herz", city: "Berlin" }
), true, "Eine echte Namensvariante desselben Organisationstyps soll erkennbar bleiben.");

assert.equal(organizationsAreSameCanonicalIdentity(
  { organization_id: "org-nordring", organization: "Nordring Apotheke" },
  { organization_id: "org-nordring", organization: "Abweichende Anzeige" }
), true, "Dieselbe Organisations-ID muss für reine Organisations-Hospitationen übereinstimmen.");

assert.equal(organizationsAreSameCanonicalIdentity(
  { organization: "Nordring Apotheke" },
  { organization: "Nordring Apotheke mit Herz" }
), true, "Kanonische Organisationsvarianten müssen auch ohne Kontakt-ID übereinstimmen.");

assert.equal(organizationsAreSameCanonicalIdentity(
  { organization: "Nordring Apotheke" },
  { organization: "Nordring Klinikum" }
), false, "Unterschiedliche Organisationstypen dürfen bei reinen Organisations-Hospitationen nicht kollidieren.");

assert.equal(contactsAreSameCanonicalIdentity(
  { id: "contact-a", name: "Prof. Dr. Jörg Weiß", organization_id: "org-alpha" },
  { id: "contact-b", name: "Joerg Weiss", organization_id: "org-alpha" }
), true, "Verschiedene Kontakt-IDs derselben kanonischen Person und Organisation müssen übereinstimmen.");

assert.equal(contactsArePotentialDuplicates(
  { name: "Dr. Ada Beispiel" },
  { name: "Ada Beispiel", status: "archived" }
), true, "Ein exakt gleicher Name ohne trennende Merkmale muss als potenzielle Dublette blockiert werden.");

assert.equal(contactsArePotentialDuplicates(
  { name: "Dr. Ada Beispiel", city: "Hamburg" },
  { name: "Ada Beispiel", city: "Berlin" }
), false, "Explizit unterschiedliche Orte dürfen namensgleiche Kontakte ohne weitere Merkmale trennen.");

console.log("Duplicate-Identity-Helper OK");
