import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const writeMode = process.argv.includes("--write");

const replacements = [
  ["ausschliess", "ausschließ"],
  ["einschliess", "einschließ"],
  ["abschliess", "abschließ"],
  ["anschliess", "anschließ"],
  ["schliess", "schließ"],
  ["massgeb", "maßgeb"],
  ["aeusser", "äußer"],
  ["verstoess", "verstöß"],
  ["verstoss", "verstoß"],
  ["groess", "größ"],
  ["heisst", "heißt"],
  ["ausser", "außer"],
  ["gemaess", "gemäß"],
  ["zulaess", "zuläss"],
  ["verlaess", "verläss"],
  ["naech", "näch"],
  ["spaet", "spät"],
  ["tatsaech", "tatsäch"],
  ["waehr", "währ"],
  ["taeg", "täg"],
  ["jaehr", "jähr"],
  ["vollstaend", "vollständ"],
  ["eigenstaend", "eigenständ"],
  ["verstaend", "verständ"],
  ["zustaend", "zuständ"],
  ["bestaet", "bestät"],
  ["aender", "änder"],
  ["abhaeng", "abhäng"],
  ["anhaeng", "anhäng"],
  ["beschraenk", "beschränk"],
  ["einschraenk", "einschränk"],
  ["ergaenz", "ergänz"],
  ["zusaetz", "zusätz"],
  ["ausgewaehl", "ausgewähl"],
  ["waehl", "wähl"],
  ["enthaelt", "enthält"],
  ["erhaelt", "erhält"],
  ["behaelt", "behält"],
  ["verhaelt", "verhält"],
  ["haelt", "hält"],
  ["laedt", "lädt"],
  ["laeu", "läu"],
  ["faeh", "fäh"],
  ["zaehl", "zähl"],
  ["aehn", "ähn"],
  ["naeher", "näher"],
  ["haeufig", "häufig"],
  ["raeum", "räum"],
  ["saeuber", "säuber"],
  ["standardmaess", "standardmäß"],
  ["gleichmaess", "gleichmäß"],
  ["regelmaess", "regelmäß"],
  ["maess", "mäß"],
  ["flaech", "fläch"],
  ["lueck", "lück"],
  ["quarantaen", "quarantän"],
  ["datensaetz", "datensätz"],
  ["passwoer", "passwör"],
  ["domaen", "domän"],
  ["einschaetz", "einschätz"],
  ["klaer", "klär"],
  ["schraenk", "schränk"],
  ["prioritaer", "prioritär"],
  ["repraesent", "repräsent"],
  ["europae", "europä"],
  ["adaequat", "adäquat"],
  ["aerzt", "ärzt"],
  ["haeus", "häus"],
  ["praeg", "präg"],
  ["geschaetz", "geschätz"],
  ["faelsch", "fälsch"],
  ["haert", "härt"],
  ["schaerf", "schärf"],
  ["staerk", "stärk"],
  ["saemt", "sämt"],
  ["laeng", "läng"],
  ["waert", "wärt"],
  ["gaeng", "gäng"],
  ["traeg", "träg"],
  ["faell", "fäll"],
  ["schlaeg", "schläg"],
  ["zoeger", "zöger"],
  ["hoeh", "höh"],
  ["fuehl", "fühl"],
  ["fueg", "füg"],
  ["fuell", "füll"],
  ["ruest", "rüst"],
  ["spuer", "spür"],
  ["taeusch", "täusch"],
  ["beruehr", "berühr"],
  ["erschoepf", "erschöpf"],
  ["erhoeh", "erhöh"],
  ["wuerf", "würf"],
  ["saett", "sätt"],
  ["kraeft", "kräft"],
  ["verbaend", "verbänd"],
  ["aesthet", "ästhet"],
  ["bruech", "brüch"],
  ["menue", "menü"],
  ["kanael", "kanäl"],
  ["kaest", "käst"],
  ["bloeck", "blöck"],
  ["guete", "güte"],
  ["gespraech", "gespräch"],
  ["geschaeft", "geschäft"],
  ["schluess", "schlüss"],
  ["umfaeng", "umfäng"],
  ["waend", "wänd"],
  ["empfaeng", "empfäng"],
  ["vorgaeng", "vorgäng"],
  ["haeng", "häng"],
  ["waerend", "während"],
  ["gross", "groß"],
  ["bloss", "bloß"],
  ["muend", "münd"],
  ["betraeub", "betäub"],
  ["erfuell", "erfüll"],
  ["staend", "ständ"],
  ["widerspruech", "widersprüch"],
  ["haett", "hätt"],
  ["geraet", "gerät"],
  ["uebung", "übung"],
  ["qualitaet", "qualität"],
  ["identitaet", "identität"],
  ["prioritaet", "priorität"],
  ["aktivitaet", "aktivität"],
  ["itaet", "ität"],
  ["primaer", "primär"],
  ["sekundaer", "sekundär"],
  ["temporaer", "temporär"],
  ["regulaer", "regulär"],
  ["binaer", "binär"],
  ["praef", "präf"],
  ["praez", "präz"],
  ["persoen", "persön"],
  ["veroeff", "veröff"],
  ["oeff", "öff"],
  ["moeg", "mög"],
  ["moech", "möch"],
  ["noet", "nöt"],
  ["loesch", "lösch"],
  ["loes", "lös"],
  ["hoech", "höch"],
  ["gehoer", "gehör"],
  ["stoer", "stör"],
  ["foerder", "förder"],
  ["woech", "wöch"],
  ["zwoelf", "zwölf"],
  ["ueber", "über"],
  ["pruef", "prüf"],
  ["fuehr", "führ"],
  ["duerf", "dürf"],
  ["muess", "müss"],
  ["koenn", "könn"],
  ["wuensch", "wünsch"],
  ["wuerd", "würd"],
  ["guelt", "gült"],
  ["verfueg", "verfüg"],
  ["genueg", "genüg"],
  ["schuetz", "schütz"],
  ["stuetz", "stütz"],
  ["nuetz", "nütz"],
  ["zurueck", "zurück"],
  ["rueck", "rück"],
  ["drueck", "drück"],
  ["knuepf", "knüpf"],
  ["buendel", "bündel"],
  ["gruend", "gründ"],
  ["gruen", "grün"],
  ["kuenft", "künft"],
  ["kuerz", "kürz"],
  ["schluessel", "schlüssel"],
  ["ueblich", "üblich"],
  ["uebrig", "übrig"],
  ["natuer", "natür"],
  ["frueh", "früh"],
  ["fuenf", "fünf"],
  ["sued", "süd"]
];

const wholeWordReplacements = [
  ["fuer", "für"],
  ["dafuer", "dafür"],
  ["hierfuer", "hierfür"],
  ["wofuer", "wofür"],
  ["waere", "wäre"],
  ["waeren", "wären"],
  ["grosse", "große"],
  ["grossen", "großen"],
  ["grosser", "großer"],
  ["grosses", "großes"],
  ["gross", "groß"],
  ["weiss", "weiß"],
  ["weisse", "weiße"],
  ["weissen", "weißen"],
  ["weisser", "weißer"],
  ["weisses", "weißes"],
  ["weissem", "weißem"],
  ["oegd", "ÖGD"],
  ["ueben", "üben"]
];

function withCase(source, replacement) {
  if (source === source.toLocaleUpperCase("de-DE")) {
    return replacement.toLocaleUpperCase("de-DE");
  }
  const first = [...source][0] || "";
  if (first === first.toLocaleUpperCase("de-DE") && first !== first.toLocaleLowerCase("de-DE")) {
    return replacement[0].toLocaleUpperCase("de-DE") + replacement.slice(1);
  }
  return replacement;
}

function replaceProse(source) {
  let result = source;
  for (const [needle, replacement] of replacements) {
    result = result.replace(new RegExp(needle, "giu"), (match) => withCase(match, replacement));
  }
  for (const [needle, replacement] of wholeWordReplacements) {
    result = result.replace(new RegExp(`\\b${needle}\\b`, "giu"), (match) => withCase(match, replacement));
  }
  return result;
}

function protect(line, pattern, values) {
  return line.replace(pattern, (match) => {
    const token = `\u0000${values.length}\u0000`;
    values.push(match);
    return token;
  });
}

function transformLine(line) {
  const protectedValues = [];
  let result = line;
  result = protect(result, /(`+).*?\1/g, protectedValues);
  result = protect(result, /\]\([^\n)]*\)/g, protectedValues);
  result = protect(result, /\b(?:href|src)=(?:"[^"]*"|'[^']*')/gi, protectedValues);
  result = protect(result, /https?:\/\/[^\s)>]+/gi, protectedValues);
  result = replaceProse(result);
  return result.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedValues[Number(index)]);
}

function transformMarkdown(source) {
  let inFence = false;
  let fenceMarker = "";
  return source
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(```+|~~~+)/);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMarker = fence[1][0];
        } else if (fence[1][0] === fenceMarker) {
          inFence = false;
          fenceMarker = "";
        }
        return line;
      }
      return inFence ? line : transformLine(line);
    })
    .join("\n");
}

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", ":(glob)**/*.md"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter((file) => file && existsSync(file))
  .sort();

const changed = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const normalized = transformMarkdown(source);
  if (normalized === source) continue;
  changed.push(file);
  if (writeMode) writeFileSync(file, normalized);
}

if (writeMode) {
  console.log(`${changed.length} Markdown-Datei(en) sprachlich normalisiert.`);
  process.exit(0);
}

if (changed.length) {
  console.error("Eindeutige ASCII-Umschreibungen deutscher Umlaute gefunden:");
  for (const file of changed) console.error(`- ${file}`);
  console.error("Korrektur: npm run format:docs-language");
  process.exit(1);
}

console.log(`${files.length} Markdown-Datei(en) verwenden echte Umlaute in der Prosa.`);
