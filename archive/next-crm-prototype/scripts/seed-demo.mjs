import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const USERS = [
  { name: "Anna Schmidt", email: "anna@versorgungscrm.local" },
  { name: "Marc Weber", email: "marc@versorgungscrm.local" },
  { name: "Timo Frank", email: "timo@versorgungscrm.local" },
  { name: "Julia Huebner", email: "julia@versorgungscrm.local" }
];

const ORGANIZATIONS = [
  { name: "Nordstadt Pflegezentrum", industry: "Pflege", website: "https://nordstadt-pflege.example", city: "Hamburg", status: "Aktiv", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Klarwerk Gesundheit", industry: "Gesundheit", website: "https://klarwerk.example", city: "Berlin", status: "Lead", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Praxis Verbund Isar", industry: "Praxen", website: "https://isar-praxen.example", city: "Muenchen", status: "Aktiv", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Klinikverbund Rhein-Main", industry: "Krankenhäuser", website: "https://rhein-main-klinik.example", city: "Frankfurt", status: "Aktiv", ownerEmail: "julia@versorgungscrm.local" },
  { name: "Apothekennetz Sued", industry: "Apotheken", website: "https://apo-sued.example", city: "Stuttgart", status: "Wartet", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Rettungsdienst Nordwest", industry: "Notfallversorgung", website: "https://rettungsdienst-nordwest.example", city: "Bremen", status: "Aktiv", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Reha Campus Elbe", industry: "Reha", website: "https://reha-elbe.example", city: "Dresden", status: "Lead", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Charite Versorgungspartner", industry: "Krankenhäuser", website: "https://charite-partner.example", city: "Berlin", status: "Aktiv", ownerEmail: "julia@versorgungscrm.local" },
  { name: "Pflegenetz Ruhr", industry: "Pflege", website: "https://pflegenetz-ruhr.example", city: "Essen", status: "Aktiv", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Praxisklinik Koeln West", industry: "Praxen", website: "https://koeln-west.example", city: "Koeln", status: "Lead", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Apothekenring Hanse", industry: "Apotheken", website: "https://hanse-apo.example", city: "Luebeck", status: "Aktiv", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Notfallverbund Mitte", industry: "Notfallversorgung", website: "https://notfall-mitte.example", city: "Leipzig", status: "Wartet", ownerEmail: "julia@versorgungscrm.local" },
  { name: "Reha Zentrum Main", industry: "Reha", website: "https://reha-main.example", city: "Mainz", status: "Aktiv", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Klinikum Bergstrasse", industry: "Krankenhäuser", website: "https://bergstrasse-klinikum.example", city: "Heidelberg", status: "Lead", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Versorgungshaus Thueringen", industry: "Pflege", website: "https://versorgung-thueringen.example", city: "Erfurt", status: "Aktiv", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Praxisnetz Augsburg Mitte", industry: "Praxen", website: "https://praxisnetz-augsburg.example", city: "Augsburg", status: "Aktiv", ownerEmail: "julia@versorgungscrm.local" },
  { name: "Klinikum Freiburg West", industry: "Krankenhäuser", website: "https://klinikum-freiburg-west.example", city: "Freiburg", status: "Lead", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Apothekerbund Bonn", industry: "Apotheken", website: "https://apothekerbund-bonn.example", city: "Bonn", status: "Aktiv", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Pflegeallianz Hannover", industry: "Pflege", website: "https://pflegeallianz-hannover.example", city: "Hannover", status: "Aktiv", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Leitstellenverbund Kiel", industry: "Notfallversorgung", website: "https://leitstellenverbund-kiel.example", city: "Kiel", status: "Wartet", ownerEmail: "julia@versorgungscrm.local" },
  { name: "RehaForum Potsdam", industry: "Reha", website: "https://rehaforum-potsdam.example", city: "Potsdam", status: "Aktiv", ownerEmail: "anna@versorgungscrm.local" },
  { name: "Versorgungsnetz Mannheim Sued", industry: "Krankenhäuser", website: "https://versorgungsnetz-mannheim.example", city: "Mannheim", status: "Lead", ownerEmail: "marc@versorgungscrm.local" },
  { name: "Praxispartner Karlsruhe Nord", industry: "Praxen", website: "https://praxispartner-karlsruhe.example", city: "Karlsruhe", status: "Aktiv", ownerEmail: "timo@versorgungscrm.local" },
  { name: "Apothekenkooperation Rostock", industry: "Apotheken", website: "https://apothekenkooperation-rostock.example", city: "Rostock", status: "Lead", ownerEmail: "julia@versorgungscrm.local" }
];

const PEOPLE = [
  { firstName: "Lisa", lastName: "Hartmann", role: "Einrichtungsleitung", email: "lisa.hartmann@nordstadt-pflege.example", phone: "+49 40 555100", organizationName: "Nordstadt Pflegezentrum", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Jens", lastName: "Keller", role: "Einkauf", email: "jens.keller@klarwerk.example", phone: "+49 30 555220", organizationName: "Klarwerk Gesundheit", ownerEmail: "marc@versorgungscrm.local", status: "Neu" },
  { firstName: "Sarah", lastName: "Meyer", role: "Pflegedienstleitung", email: "sarah.meyer@demo-versorgungscrm.local", phone: "+49 30 550000", organizationName: "Nordstadt Pflegezentrum", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Thomas", lastName: "Behrens", role: "Qualitaetsmanagement", email: "thomas.behrens@demo-versorgungscrm.local", phone: "+49 31 550037", organizationName: "Nordstadt Pflegezentrum", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Miriam", lastName: "Wolf", role: "Stationskoordination", email: "miriam.wolf@demo-versorgungscrm.local", phone: "+49 32 550074", organizationName: "Nordstadt Pflegezentrum", ownerEmail: "timo@versorgungscrm.local", status: "Wartet" },
  { firstName: "David", lastName: "Nguyen", role: "Produktmanagement", email: "david.nguyen@demo-versorgungscrm.local", phone: "+49 33 550111", organizationName: "Klarwerk Gesundheit", ownerEmail: "julia@versorgungscrm.local", status: "Neu" },
  { firstName: "Aylin", lastName: "Kaya", role: "Vertrieb Versorgung", email: "aylin.kaya@demo-versorgungscrm.local", phone: "+49 34 550148", organizationName: "Klarwerk Gesundheit", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Martin", lastName: "Schroeder", role: "IT-Koordination", email: "martin.schroeder@demo-versorgungscrm.local", phone: "+49 35 550185", organizationName: "Klarwerk Gesundheit", ownerEmail: "marc@versorgungscrm.local", status: "Lead" },
  { firstName: "Eva", lastName: "Lorenz", role: "Praxismanagement", email: "eva.lorenz@demo-versorgungscrm.local", phone: "+49 36 550222", organizationName: "Praxis Verbund Isar", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Nina", lastName: "Albrecht", role: "Aerzliche Leitung", email: "nina.albrecht@demo-versorgungscrm.local", phone: "+49 37 550259", organizationName: "Praxis Verbund Isar", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Paul", lastName: "Wirth", role: "Digitalisierung", email: "paul.wirth@demo-versorgungscrm.local", phone: "+49 38 550296", organizationName: "Praxis Verbund Isar", ownerEmail: "anna@versorgungscrm.local", status: "Neu" },
  { firstName: "Clara", lastName: "Hahn", role: "Kliniksteuerung", email: "clara.hahn@demo-versorgungscrm.local", phone: "+49 39 550333", organizationName: "Klinikverbund Rhein-Main", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Leon", lastName: "Voigt", role: "Medizincontrolling", email: "leon.voigt@demo-versorgungscrm.local", phone: "+49 40 550370", organizationName: "Klinikverbund Rhein-Main", ownerEmail: "timo@versorgungscrm.local", status: "Wartet" },
  { firstName: "Fatma", lastName: "Yildiz", role: "Pflegekoordination", email: "fatma.yildiz@demo-versorgungscrm.local", phone: "+49 41 550407", organizationName: "Klinikverbund Rhein-Main", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Robert", lastName: "Seidel", role: "Apothekenleitung", email: "robert.seidel@demo-versorgungscrm.local", phone: "+49 42 550444", organizationName: "Apothekennetz Sued", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Kathrin", lastName: "Moss", role: "Einkauf", email: "kathrin.moss@demo-versorgungscrm.local", phone: "+49 43 550481", organizationName: "Apothekennetz Sued", ownerEmail: "marc@versorgungscrm.local", status: "Lead" },
  { firstName: "Jan", lastName: "Fischer", role: "Standortmanagement", email: "jan.fischer@demo-versorgungscrm.local", phone: "+49 44 550518", organizationName: "Apothekennetz Sued", ownerEmail: "timo@versorgungscrm.local", status: "Wartet" },
  { firstName: "Helena", lastName: "Roth", role: "Einsatzplanung", email: "helena.roth@demo-versorgungscrm.local", phone: "+49 45 550555", organizationName: "Rettungsdienst Nordwest", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Can", lastName: "Arslan", role: "Leitstelle", email: "can.arslan@demo-versorgungscrm.local", phone: "+49 46 550592", organizationName: "Rettungsdienst Nordwest", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Sven", lastName: "Pohl", role: "Rettungswache", email: "sven.pohl@demo-versorgungscrm.local", phone: "+49 47 550629", organizationName: "Rettungsdienst Nordwest", ownerEmail: "marc@versorgungscrm.local", status: "Neu" },
  { firstName: "Judith", lastName: "Kern", role: "Therapieleitung", email: "judith.kern@demo-versorgungscrm.local", phone: "+49 48 550666", organizationName: "Reha Campus Elbe", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Marlon", lastName: "Peters", role: "Patientenaufnahme", email: "marlon.peters@demo-versorgungscrm.local", phone: "+49 49 550703", organizationName: "Reha Campus Elbe", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Olga", lastName: "Schaefer", role: "Campuskoordination", email: "olga.schaefer@demo-versorgungscrm.local", phone: "+49 30 550740", organizationName: "Reha Campus Elbe", ownerEmail: "anna@versorgungscrm.local", status: "Wartet" },
  { firstName: "Dr. Anna", lastName: "Mueller", role: "Oberaerztin", email: "dr.anna.mueller@demo-versorgungscrm.local", phone: "+49 31 550777", organizationName: "Charite Versorgungspartner", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Hannes", lastName: "Neumann", role: "Produktowner", email: "hannes.neumann@demo-versorgungscrm.local", phone: "+49 32 550814", organizationName: "Charite Versorgungspartner", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Sabine", lastName: "Kunz", role: "Studienkoordination", email: "sabine.kunz@demo-versorgungscrm.local", phone: "+49 33 550851", organizationName: "Charite Versorgungspartner", ownerEmail: "julia@versorgungscrm.local", status: "Neu" },
  { firstName: "Ralf", lastName: "Winter", role: "Heimleitung", email: "ralf.winter@demo-versorgungscrm.local", phone: "+49 34 550888", organizationName: "Pflegenetz Ruhr", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Melina", lastName: "Schick", role: "Pflegeberatung", email: "melina.schick@demo-versorgungscrm.local", phone: "+49 35 550925", organizationName: "Pflegenetz Ruhr", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Igor", lastName: "Petrov", role: "Dienstplanung", email: "igor.petrov@demo-versorgungscrm.local", phone: "+49 36 550962", organizationName: "Pflegenetz Ruhr", ownerEmail: "timo@versorgungscrm.local", status: "Wartet" },
  { firstName: "Britta", lastName: "Jansen", role: "Praxisinhaberin", email: "britta.jansen@demo-versorgungscrm.local", phone: "+49 37 550999", organizationName: "Praxisklinik Koeln West", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Mara", lastName: "Brandt", role: "Assistenz", email: "mara.brandt@demo-versorgungscrm.local", phone: "+49 38 551036", organizationName: "Praxisklinik Koeln West", ownerEmail: "anna@versorgungscrm.local", status: "Neu" },
  { firstName: "Luca", lastName: "Herrmann", role: "Abrechnung", email: "luca.herrmann@demo-versorgungscrm.local", phone: "+49 39 551073", organizationName: "Praxisklinik Koeln West", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Nora", lastName: "Stein", role: "Filialleitung", email: "nora.stein@demo-versorgungscrm.local", phone: "+49 40 551110", organizationName: "Apothekenring Hanse", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Torben", lastName: "Kruse", role: "Versorgung", email: "torben.kruse@demo-versorgungscrm.local", phone: "+49 41 551147", organizationName: "Apothekenring Hanse", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Mina", lastName: "Falk", role: "Digital Health", email: "mina.falk@demo-versorgungscrm.local", phone: "+49 42 551184", organizationName: "Apothekenring Hanse", ownerEmail: "anna@versorgungscrm.local", status: "Neu" },
  { firstName: "Stefan", lastName: "Riemer", role: "Leitstelle", email: "stefan.riemer@demo-versorgungscrm.local", phone: "+49 43 551221", organizationName: "Notfallverbund Mitte", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Julia", lastName: "Seifert", role: "Koordination", email: "julia.seifert@demo-versorgungscrm.local", phone: "+49 44 551258", organizationName: "Notfallverbund Mitte", ownerEmail: "timo@versorgungscrm.local", status: "Wartet" },
  { firstName: "Deniz", lastName: "Acar", role: "Rettungsdienst", email: "deniz.acar@demo-versorgungscrm.local", phone: "+49 45 551295", organizationName: "Notfallverbund Mitte", ownerEmail: "julia@versorgungscrm.local", status: "Neu" },
  { firstName: "Petra", lastName: "Baumann", role: "Therapieplanung", email: "petra.baumann@demo-versorgungscrm.local", phone: "+49 46 551332", organizationName: "Reha Zentrum Main", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Omar", lastName: "Rahman", role: "Zuweisermanagement", email: "omar.rahman@demo-versorgungscrm.local", phone: "+49 47 551369", organizationName: "Reha Zentrum Main", ownerEmail: "marc@versorgungscrm.local", status: "Lead" },
  { firstName: "Tina", lastName: "Franke", role: "Patientenservice", email: "tina.franke@demo-versorgungscrm.local", phone: "+49 48 551406", organizationName: "Reha Zentrum Main", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Dr. Felix", lastName: "Bauer", role: "Chefarztbuero", email: "dr.felix.bauer@demo-versorgungscrm.local", phone: "+49 49 551443", organizationName: "Klinikum Bergstrasse", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Arzu", lastName: "Demir", role: "Pflegeentwicklung", email: "arzu.demir@demo-versorgungscrm.local", phone: "+49 30 551480", organizationName: "Klinikum Bergstrasse", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Jonas", lastName: "Mertens", role: "IT-Integration", email: "jonas.mertens@demo-versorgungscrm.local", phone: "+49 31 551517", organizationName: "Klinikum Bergstrasse", ownerEmail: "marc@versorgungscrm.local", status: "Wartet" },
  { firstName: "Birgit", lastName: "Reuter", role: "Heimleitung", email: "birgit.reuter@demo-versorgungscrm.local", phone: "+49 32 551554", organizationName: "Versorgungshaus Thueringen", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Melek", lastName: "Guel", role: "Pflegekoordination", email: "melek.guel@demo-versorgungscrm.local", phone: "+49 33 551591", organizationName: "Versorgungshaus Thueringen", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Nico", lastName: "Schott", role: "Qualitaet", email: "nico.schott@demo-versorgungscrm.local", phone: "+49 34 551628", organizationName: "Versorgungshaus Thueringen", ownerEmail: "anna@versorgungscrm.local", status: "Neu" },
  { firstName: "Celine", lastName: "Becker", role: "Projektassistenz", email: "celine.becker@demo-versorgungscrm.local", phone: "+49 35 551665", organizationName: "Klarwerk Gesundheit", ownerEmail: "marc@versorgungscrm.local", status: "Neu" },
  { firstName: "Philipp", lastName: "Lang", role: "Arztpraxis-Netzwerk", email: "philipp.lang@demo-versorgungscrm.local", phone: "+49 36 551702", organizationName: "Praxis Verbund Isar", ownerEmail: "timo@versorgungscrm.local", status: "Lead" },
  { firstName: "Laura", lastName: "Zeller", role: "E-Health", email: "laura.zeller@demo-versorgungscrm.local", phone: "+49 37 551739", organizationName: "Charite Versorgungspartner", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Johanna", lastName: "Reich", role: "Praxiskoordination", email: "johanna.reich@demo-versorgungscrm.local", phone: "+49 38 551776", organizationName: "Praxisnetz Augsburg Mitte", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Tobias", lastName: "Rosen", role: "Aerzliche Leitung", email: "tobias.rosen@demo-versorgungscrm.local", phone: "+49 39 551813", organizationName: "Praxisnetz Augsburg Mitte", ownerEmail: "marc@versorgungscrm.local", status: "Lead" },
  { firstName: "Elif", lastName: "Sahin", role: "Digitalisierung", email: "elif.sahin@demo-versorgungscrm.local", phone: "+49 40 551850", organizationName: "Praxisnetz Augsburg Mitte", ownerEmail: "timo@versorgungscrm.local", status: "Neu" },
  { firstName: "Gregor", lastName: "Lenz", role: "Kliniksteuerung", email: "gregor.lenz@demo-versorgungscrm.local", phone: "+49 41 551887", organizationName: "Klinikum Freiburg West", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Yara", lastName: "Kilic", role: "Pflegeentwicklung", email: "yara.kilic@demo-versorgungscrm.local", phone: "+49 42 551924", organizationName: "Klinikum Freiburg West", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Moritz", lastName: "Henke", role: "IT-Integration", email: "moritz.henke@demo-versorgungscrm.local", phone: "+49 43 551961", organizationName: "Klinikum Freiburg West", ownerEmail: "marc@versorgungscrm.local", status: "Wartet" },
  { firstName: "Lea", lastName: "Burkhardt", role: "Apothekenleitung", email: "lea.burkhardt@demo-versorgungscrm.local", phone: "+49 44 551998", organizationName: "Apothekerbund Bonn", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Mert", lastName: "Kara", role: "Versorgung", email: "mert.kara@demo-versorgungscrm.local", phone: "+49 45 552035", organizationName: "Apothekerbund Bonn", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Anika", lastName: "Friedrich", role: "Einkauf", email: "anika.friedrich@demo-versorgungscrm.local", phone: "+49 46 552072", organizationName: "Apothekerbund Bonn", ownerEmail: "anna@versorgungscrm.local", status: "Neu" },
  { firstName: "Holger", lastName: "Tesch", role: "Heimleitung", email: "holger.tesch@demo-versorgungscrm.local", phone: "+49 47 552109", organizationName: "Pflegeallianz Hannover", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Sibel", lastName: "Eren", role: "Pflegekoordination", email: "sibel.eren@demo-versorgungscrm.local", phone: "+49 48 552146", organizationName: "Pflegeallianz Hannover", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Kian", lastName: "Wolter", role: "Qualitaetsmanagement", email: "kian.wolter@demo-versorgungscrm.local", phone: "+49 49 552183", organizationName: "Pflegeallianz Hannover", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Rene", lastName: "Claussen", role: "Leitstelle", email: "rene.claussen@demo-versorgungscrm.local", phone: "+49 30 552220", organizationName: "Leitstellenverbund Kiel", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Neele", lastName: "Martens", role: "Koordination", email: "neele.martens@demo-versorgungscrm.local", phone: "+49 31 552257", organizationName: "Leitstellenverbund Kiel", ownerEmail: "marc@versorgungscrm.local", status: "Wartet" },
  { firstName: "Adem", lastName: "Toprak", role: "Einsatzplanung", email: "adem.toprak@demo-versorgungscrm.local", phone: "+49 32 552294", organizationName: "Leitstellenverbund Kiel", ownerEmail: "timo@versorgungscrm.local", status: "Neu" },
  { firstName: "Friederike", lastName: "Born", role: "Therapieplanung", email: "friederike.born@demo-versorgungscrm.local", phone: "+49 33 552331", organizationName: "RehaForum Potsdam", ownerEmail: "julia@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Malik", lastName: "Schade", role: "Patientenservice", email: "malik.schade@demo-versorgungscrm.local", phone: "+49 34 552368", organizationName: "RehaForum Potsdam", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Pia", lastName: "Koch", role: "Zuweisermanagement", email: "pia.koch@demo-versorgungscrm.local", phone: "+49 35 552405", organizationName: "RehaForum Potsdam", ownerEmail: "marc@versorgungscrm.local", status: "Lead" },
  { firstName: "Bjorn", lastName: "Metz", role: "Medizincontrolling", email: "bjorn.metz@demo-versorgungscrm.local", phone: "+49 36 552442", organizationName: "Versorgungsnetz Mannheim Sued", ownerEmail: "timo@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Lina", lastName: "Aslan", role: "Pflegeentwicklung", email: "lina.aslan@demo-versorgungscrm.local", phone: "+49 37 552479", organizationName: "Versorgungsnetz Mannheim Sued", ownerEmail: "julia@versorgungscrm.local", status: "Lead" },
  { firstName: "Henning", lastName: "Kopp", role: "IT-Integration", email: "henning.kopp@demo-versorgungscrm.local", phone: "+49 38 552516", organizationName: "Versorgungsnetz Mannheim Sued", ownerEmail: "anna@versorgungscrm.local", status: "Wartet" },
  { firstName: "Carla", lastName: "Meurer", role: "Praxismanagement", email: "carla.meurer@demo-versorgungscrm.local", phone: "+49 39 552553", organizationName: "Praxispartner Karlsruhe Nord", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Onur", lastName: "Tas", role: "Abrechnung", email: "onur.tas@demo-versorgungscrm.local", phone: "+49 40 552590", organizationName: "Praxispartner Karlsruhe Nord", ownerEmail: "timo@versorgungscrm.local", status: "Lead" },
  { firstName: "Miriam", lastName: "Kessler", role: "Digitalisierung", email: "miriam.kessler@demo-versorgungscrm.local", phone: "+49 41 552627", organizationName: "Praxispartner Karlsruhe Nord", ownerEmail: "julia@versorgungscrm.local", status: "Neu" },
  { firstName: "Ruben", lastName: "Paulsen", role: "Filialleitung", email: "ruben.paulsen@demo-versorgungscrm.local", phone: "+49 42 552664", organizationName: "Apothekenkooperation Rostock", ownerEmail: "anna@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Zoe", lastName: "Hamann", role: "Versorgung", email: "zoe.hamann@demo-versorgungscrm.local", phone: "+49 43 552701", organizationName: "Apothekenkooperation Rostock", ownerEmail: "marc@versorgungscrm.local", status: "Aktiv" },
  { firstName: "Ilja", lastName: "Radtke", role: "Einkauf", email: "ilja.radtke@demo-versorgungscrm.local", phone: "+49 44 552738", organizationName: "Apothekenkooperation Rostock", ownerEmail: "timo@versorgungscrm.local", status: "Lead" }
];

const NOTE_CATALOG = [
  { entityType: "organization", organizationName: "Nordstadt Pflegezentrum", authorEmail: "anna@versorgungscrm.local", body: "Erstgespraech gefuehrt. Interesse an schneller Pilotphase ab April." },
  { entityType: "person", personEmail: "lisa.hartmann@nordstadt-pflege.example", authorEmail: "anna@versorgungscrm.local", body: "Lisa moechte naechste Woche ein kompaktes Angebot inklusive Onboarding-Aufwand." },
  { entityType: "person", personEmail: "jens.keller@klarwerk.example", authorEmail: "marc@versorgungscrm.local", body: "Jens wartet auf Freigabe vom Standortleiter. Wiedervorlage in zwei Wochen." },
  { entityType: "organization", organizationName: "Klarwerk Gesundheit", authorEmail: "timo@versorgungscrm.local", body: "Owner-Wechsel dokumentiert. Naechster Abstimmungstermin in der kommenden Woche." },
  { entityType: "organization", organizationName: "Praxis Verbund Isar", authorEmail: "julia@versorgungscrm.local", body: "Interesse an strukturierter Pilotbegleitung und Einbindung der Versorgungspartner." },
  { entityType: "organization", organizationName: "Rettungsdienst Nordwest", authorEmail: "marc@versorgungscrm.local", body: "Rettungsdienst moechte priorisiert eine einfache Owner-Uebergabe im Alltag pruefen." },
  { entityType: "organization", organizationName: "Klinikum Freiburg West", authorEmail: "anna@versorgungscrm.local", body: "Vorstand will Pilotumfang fuer Interoperabilitaet und Versorgungsdaten enger eingrenzen." },
  { entityType: "organization", organizationName: "Pflegeallianz Hannover", authorEmail: "timo@versorgungscrm.local", body: "Mehrere Standorte wuenschen einen gebuendelten Rollout mit gemeinsamer Schulung." },
  { entityType: "organization", organizationName: "Leitstellenverbund Kiel", authorEmail: "julia@versorgungscrm.local", body: "Leitstellenverbund erwartet kurze Entscheidungswege und eine klare Owner-Zuordnung." },
  { entityType: "person", personEmail: "gregor.lenz@demo-versorgungscrm.local", authorEmail: "marc@versorgungscrm.local", body: "Gregor benoetigt vor dem naechsten Termin eine komprimierte Projektzusammenfassung." },
  { entityType: "person", personEmail: "friederike.born@demo-versorgungscrm.local", authorEmail: "anna@versorgungscrm.local", body: "Friederike sieht Potenzial fuer einen Reha-spezifischen Piloten mit zwei Fachbereichen." },
  { entityType: "person", personEmail: "carla.meurer@demo-versorgungscrm.local", authorEmail: "timo@versorgungscrm.local", body: "Carla moechte die Einfuehrung mit einer kleinen Testgruppe in Karlsruhe beginnen." }
];

const GENERATED_ORG_BLUEPRINTS = [
  { sector: "Praxen", city: "Augsburg", label: "Praxisverbund" },
  { sector: "Krankenhäuser", city: "Karlsruhe", label: "Kliniknetz" },
  { sector: "Apotheken", city: "Bonn", label: "Apothekenverbund" },
  { sector: "Pflege", city: "Hannover", label: "Pflegeforum" },
  { sector: "Notfallversorgung", city: "Magdeburg", label: "Notfallnetz" },
  { sector: "Reha", city: "Tuebingen", label: "RehaWerk" }
];

const ROLE_BY_SECTOR = {
  Praxen: ["Praxismanagement", "Aerzliche Leitung", "Abrechnung", "Digitalisierung"],
  Krankenhäuser: ["Kliniksteuerung", "Pflegeentwicklung", "Medizincontrolling", "IT-Integration"],
  Apotheken: ["Apothekenleitung", "Versorgung", "Einkauf", "Filialleitung"],
  Pflege: ["Heimleitung", "Pflegekoordination", "Qualitaetsmanagement", "Pflegeberatung"],
  Notfallversorgung: ["Leitstelle", "Koordination", "Einsatzplanung", "Rettungsdienst"],
  Reha: ["Therapieplanung", "Patientenservice", "Zuweisermanagement", "Campuskoordination"]
};

const FIRST_NAMES = ["Mara", "Jonas", "Sophie", "Emre", "Katharina", "Lars", "Mina", "Noah", "Selin", "Felix", "Jana", "Yusuf", "Paula", "Niklas", "Amira", "David"];
const LAST_NAMES = ["Becker", "Hoffmann", "Yilmaz", "Schulte", "Weiss", "Krueger", "Santos", "Krause", "Nguyen", "Lorenz", "Hartwig", "Peters", "Aydin", "Keller", "Mertens", "Schubert"];
const STATUS_SEQUENCE = ["Neu", "Aktiv", "Lead", "Wartet"];

function parseArgs(argv) {
  const config = {
    minPeople: 50,
    minOrganizations: 15,
    addPeople: 0,
    addOrganizations: 0
  };

  for (const arg of argv) {
    if (arg.startsWith("--min-people=")) config.minPeople = Number(arg.split("=")[1]) || config.minPeople;
    if (arg.startsWith("--min-organizations=")) config.minOrganizations = Number(arg.split("=")[1]) || config.minOrganizations;
    if (arg.startsWith("--add-people=")) config.addPeople = Number(arg.split("=")[1]) || 0;
    if (arg.startsWith("--add-organizations=")) config.addOrganizations = Number(arg.split("=")[1]) || 0;
  }

  return config;
}

function getDatabasePath() {
  const configured = process.env.DATABASE_PATH || "./data/crm.sqlite";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function passwordHash(password) {
  return createHash("sha256").update(password).digest("hex");
}

function isoOffset(daysAgo, hourOffset = 0) {
  const dayInMs = 24 * 60 * 60 * 1000;
  return new Date(Date.now() - daysAgo * dayInMs - hourOffset * 60 * 60 * 1000).toISOString();
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      city TEXT,
      status TEXT NOT NULL DEFAULT 'Lead',
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT,
      email TEXT,
      phone TEXT,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Neu',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('person', 'organization')),
      entity_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, created_at)
    VALUES (@name, @email, @passwordHash, @createdAt)
  `);
  const insertOrganization = db.prepare(`
    INSERT INTO organizations (name, industry, website, city, status, owner_id, created_at, updated_at)
    VALUES (@name, @industry, @website, @city, @status, @ownerId, @createdAt, @updatedAt)
  `);
  const insertPerson = db.prepare(`
    INSERT INTO people (first_name, last_name, role, email, phone, organization_id, owner_id, status, created_at, updated_at)
    VALUES (@firstName, @lastName, @role, @email, @phone, @organizationId, @ownerId, @status, @createdAt, @updatedAt)
  `);
  const insertNote = db.prepare(`
    INSERT INTO notes (body, entity_type, entity_id, author_id, created_at)
    VALUES (@body, @entityType, @entityId, @authorId, @createdAt)
  `);

  const selectUserByEmail = db.prepare("SELECT id FROM users WHERE email = ?");
  const selectOrgByName = db.prepare("SELECT id FROM organizations WHERE name = ?");
  const selectPersonByEmail = db.prepare("SELECT id FROM people WHERE email = ?");
  const selectNote = db.prepare("SELECT id FROM notes WHERE entity_type = ? AND entity_id = ? AND author_id = ? AND body = ?");
  const countPeople = db.prepare("SELECT COUNT(*) as count FROM people");
  const countOrganizations = db.prepare("SELECT COUNT(*) as count FROM organizations");
  const selectAllOrganizations = db.prepare("SELECT id, name, industry FROM organizations ORDER BY id ASC");
  const selectAllPeopleEmails = db.prepare("SELECT email FROM people WHERE email IS NOT NULL");

  const summary = {
    usersCreated: 0,
    organizationsCreated: 0,
    peopleCreated: 0,
    notesCreated: 0
  };

  const transaction = db.transaction(() => {
    const ownerIds = new Map();

    for (const [index, user] of USERS.entries()) {
      const existing = selectUserByEmail.get(user.email);

      if (existing) {
        ownerIds.set(user.email, existing.id);
        continue;
      }

      const id = Number(
        insertUser.run({
          ...user,
          passwordHash: passwordHash("demo1234"),
          createdAt: isoOffset(20 - index, 1)
        }).lastInsertRowid
      );

      ownerIds.set(user.email, id);
      summary.usersCreated += 1;
    }

    const organizationIds = new Map();

    for (const [index, organization] of ORGANIZATIONS.entries()) {
      const existing = selectOrgByName.get(organization.name);

      if (existing) {
        organizationIds.set(organization.name, existing.id);
        continue;
      }

      const id = Number(
        insertOrganization.run({
          name: organization.name,
          industry: organization.industry,
          website: organization.website,
          city: organization.city,
          status: organization.status,
          ownerId: ownerIds.get(organization.ownerEmail) ?? null,
          createdAt: isoOffset(16 - Math.min(index, 10), (index % 6) + 1),
          updatedAt: isoOffset(index % 4, (index % 5) + 1)
        }).lastInsertRowid
      );

      organizationIds.set(organization.name, id);
      summary.organizationsCreated += 1;
    }

    for (const [index, person] of PEOPLE.entries()) {
      if (selectPersonByEmail.get(person.email)) {
        continue;
      }

      insertPerson.run({
        firstName: person.firstName,
        lastName: person.lastName,
        role: person.role,
        email: person.email,
        phone: person.phone,
        organizationId: organizationIds.get(person.organizationName) ?? null,
        ownerId: ownerIds.get(person.ownerEmail) ?? null,
        status: person.status,
        createdAt: isoOffset(14 - Math.min(index, 10), (index % 8) + 1),
        updatedAt: isoOffset(index % 5, (index % 6) + 1)
      });

      summary.peopleCreated += 1;
    }

    for (const note of NOTE_CATALOG) {
      const entityId =
        note.entityType === "organization"
          ? organizationIds.get(note.organizationName)
          : selectPersonByEmail.get(note.personEmail)?.id;
      const authorId = ownerIds.get(note.authorEmail);

      if (!entityId || !authorId) {
        continue;
      }

      if (selectNote.get(note.entityType, entityId, authorId, note.body)) {
        continue;
      }

      insertNote.run({
        body: note.body,
        entityType: note.entityType,
        entityId,
        authorId,
        createdAt: isoOffset(2, 2)
      });

      summary.notesCreated += 1;
    }

    const currentOrganizationCount = countOrganizations.get().count;
    const currentPeopleCount = countPeople.get().count;
    const organizationsToAdd = Math.max(0, options.minOrganizations - currentOrganizationCount) + options.addOrganizations;
    const peopleToAdd = Math.max(0, options.minPeople - currentPeopleCount) + options.addPeople;
    const existingOrganizationNames = new Set(
      selectAllOrganizations.all().map((organization) => String(organization.name).toLowerCase())
    );

    for (let index = 0; index < organizationsToAdd; index += 1) {
      const blueprint = GENERATED_ORG_BLUEPRINTS[index % GENERATED_ORG_BLUEPRINTS.length];
      const sequence = currentOrganizationCount + index + 1;
      const owner = USERS[index % USERS.length];
      let name = `${blueprint.label} ${blueprint.city} ${sequence}`;

      while (existingOrganizationNames.has(name.toLowerCase())) {
        name = `${blueprint.label} ${blueprint.city} ${sequence + existingOrganizationNames.size}`;
      }

      const id = Number(
        insertOrganization.run({
          name,
          industry: blueprint.sector,
          website: `https://${slugify(name)}.example`,
          city: blueprint.city,
          status: STATUS_SEQUENCE[index % STATUS_SEQUENCE.length],
          ownerId: ownerIds.get(owner.email) ?? null,
          createdAt: isoOffset(index % 6, (index % 5) + 1),
          updatedAt: isoOffset(index % 3, (index % 4) + 1)
        }).lastInsertRowid
      );

      existingOrganizationNames.add(name.toLowerCase());
      summary.organizationsCreated += 1;

      insertNote.run({
        body: `Neue Demo-Organisation fuer ${blueprint.sector} angelegt und dem Owner zugeordnet.`,
        entityType: "organization",
        entityId: id,
        authorId: ownerIds.get(owner.email),
        createdAt: isoOffset(0, (index % 6) + 1)
      });

      summary.notesCreated += 1;
    }

    const allOrganizations = selectAllOrganizations.all();
    const existingPersonEmails = new Set(
      selectAllPeopleEmails.all().map((entry) => String(entry.email).toLowerCase())
    );

    for (let index = 0; index < peopleToAdd; index += 1) {
      const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(index + currentPeopleCount) % LAST_NAMES.length];
      const organization = allOrganizations[(index + currentPeopleCount) % allOrganizations.length];
      const sector = ROLE_BY_SECTOR[organization.industry] ? organization.industry : "Praxen";
      const role = ROLE_BY_SECTOR[sector][index % ROLE_BY_SECTOR[sector].length];
      const owner = USERS[index % USERS.length];
      const suffix = currentPeopleCount + index + 1;
      let email = `${slugify(`${firstName}-${lastName}-${suffix}`)}@demo-versorgungscrm.local`;

      while (existingPersonEmails.has(email.toLowerCase())) {
        email = `${slugify(`${firstName}-${lastName}-${suffix}-${existingPersonEmails.size}`)}@demo-versorgungscrm.local`;
      }

      const personId = Number(
        insertPerson.run({
          firstName,
          lastName,
          role,
          email,
          phone: `+49 ${30 + (index % 20)} ${String(552000 + index * 29).slice(0, 6)}`,
          organizationId: organization.id,
          ownerId: ownerIds.get(owner.email) ?? null,
          status: STATUS_SEQUENCE[index % STATUS_SEQUENCE.length],
          createdAt: isoOffset(index % 5, (index % 8) + 1),
          updatedAt: isoOffset(index % 4, (index % 6) + 1)
        }).lastInsertRowid
      );

      existingPersonEmails.add(email.toLowerCase());
      summary.peopleCreated += 1;

      if (index % 3 === 0) {
        insertNote.run({
          body: "Neue Demo-Person fuer die laufende CRM-Ansicht ergaenzt.",
          entityType: "person",
          entityId: personId,
          authorId: ownerIds.get(owner.email),
          createdAt: isoOffset(0, (index % 6) + 1)
        });

        summary.notesCreated += 1;
      }
    }
  });

  transaction();

  console.log(`Demo-Seeding abgeschlossen fuer ${databasePath}`);
  console.log(
    `Neu angelegt: ${summary.usersCreated} User, ${summary.organizationsCreated} Organisationen, ${summary.peopleCreated} Personen, ${summary.notesCreated} Notizen`
  );
  console.log(
    `Aktueller Bestand: ${countOrganizations.get().count} Organisationen, ${countPeople.get().count} Personen`
  );

  db.close();
}

main();
