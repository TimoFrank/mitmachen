"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import readXlsxFile from "read-excel-file/browser";
import { importContactsAction } from "@/lib/actions";
import { ImportContactInput, ImportContactResult, ImportContext } from "@/lib/types";

type Step = "select" | "detect" | "map" | "review" | "report";
type TargetField = keyof ImportContactInput | "ignore";
type ParsedFile = {
  fileName: string;
  fileType: "csv" | "excel" | "best-effort" | "unsupported";
  delimiter?: string;
  sheets: string[];
  selectedSheet: string;
  columns: string[];
  rows: Record<string, string>[];
  warning?: string;
};

type ReviewStatus = "ready" | "review" | "error" | "duplicate";
type ReviewRow = ImportContactInput & {
  rowNumber: number;
  status: ReviewStatus;
  problems: string[];
  skip: boolean;
  duplicate: boolean;
  warningCount: number;
  errorCount: number;
};

const steps: Array<{ id: Step; label: string }> = [
  { id: "select", label: "Datei auswählen" },
  { id: "detect", label: "Daten erkennen" },
  { id: "map", label: "Felder zuordnen" },
  { id: "review", label: "Prüfen" },
  { id: "report", label: "Importbericht" }
];

const targetFields: Array<{ value: TargetField; label: string }> = [
  { value: "ignore", label: "Nicht importieren" },
  { value: "name", label: "Name" },
  { value: "organization", label: "Organisation" },
  { value: "sector", label: "Sektor" },
  { value: "specialty", label: "Fachrichtung" },
  { value: "location", label: "Standort" },
  { value: "postalCode", label: "PLZ" },
  { value: "city", label: "Ort" },
  { value: "state", label: "Bundesland" },
  { value: "email", label: "E-Mail" },
  { value: "phone", label: "Telefon" },
  { value: "linkedIn", label: "LinkedIn" },
  { value: "priority", label: "Priorität" },
  { value: "owner", label: "Owner" },
  { value: "topics", label: "Themen" },
  { value: "note", label: "Notiz" },
  { value: "source", label: "Quelle" }
];

const fieldAliases: Record<Exclude<TargetField, "ignore">, string[]> = {
  name: ["name", "kontakt", "person", "ansprechpartner", "vollstaendiger name", "vollständiger name"],
  organization: ["organisation", "organization", "einrichtung", "firma", "praxis", "klinik", "unternehmen"],
  sector: ["sektor", "kategorie", "branche", "typ"],
  specialty: ["fachrichtung", "fachgebiet", "rolle", "position", "funktion", "thema"],
  location: ["standort", "adresse"],
  postalCode: ["plz", "postleitzahl", "zip"],
  city: ["ort", "stadt", "city"],
  state: ["bundesland", "land"],
  email: ["email", "e-mail", "mail"],
  phone: ["telefon", "phone", "tel", "mobil"],
  linkedIn: ["linkedin", "linked in"],
  priority: ["prioritaet", "priorität", "prio", "priority"],
  owner: ["owner", "verantwortlich", "zuständig", "zustaendig"],
  topics: ["themen", "tags", "schwerpunkte"],
  note: ["notiz", "bemerkung", "kommentar", "hinweis"],
  source: ["quelle", "source", "herkunft"]
};

const emptyInput: ImportContactInput = {
  name: "",
  organization: "",
  sector: "",
  specialty: "",
  location: "",
  postalCode: "",
  city: "",
  state: "",
  email: "",
  phone: "",
  linkedIn: "",
  priority: "",
  owner: "",
  topics: "",
  note: "",
  source: ""
};

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [",", ";", "\t", "|"];
  return candidates
    .map((delimiter) => ({ delimiter, count: (sample.match(new RegExp(`\\${delimiter}`, "g")) || []).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter || ",";
}

function parseDelimited(text: string, delimiter = detectDelimiter(text)) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rowsToObjects(rows: string[][]) {
  const columns = (rows[0] || []).map((column, index) => column || `Spalte ${index + 1}`);
  return {
    columns,
    rows: rows.slice(1).map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index]?.trim() || ""]))
    )
  };
}

function suggestMapping(columns: string[]) {
  const mapped = new Set<TargetField>();
  return Object.fromEntries(
    columns.map((column) => {
      const normalizedColumn = normalize(column);
      const match = targetFields.find((field) => {
        if (field.value === "ignore" || mapped.has(field.value)) return false;
        return fieldAliases[field.value].some((alias) => normalizedColumn.includes(normalize(alias)));
      });
      const value = match?.value || "ignore";
      mapped.add(value);
      return [column, value];
    })
  ) as Record<string, TargetField>;
}

function statusLabel(status: ReviewStatus) {
  if (status === "ready") return "Importbereit";
  if (status === "duplicate") return "Dublette möglich";
  if (status === "error") return "Fehler";
  return "Prüfen";
}

function readCell(row: Record<string, string>, mapping: Record<string, TargetField>, field: keyof ImportContactInput) {
  const source = Object.entries(mapping).find(([, target]) => target === field)?.[0];
  return source ? row[source]?.trim() || "" : "";
}

function buildReviewRows(
  parsed: ParsedFile,
  mapping: Record<string, TargetField>,
  defaults: Pick<ImportContactInput, "priority" | "owner" | "source" | "sector">,
  context: ImportContext
) {
  const sectorSet = new Set(context.sectors.map(normalize));
  const existing = context.existingContacts.map((contact) => ({
    ...contact,
    key: `${normalize(contact.name)}|${normalize(contact.organizationName || "")}`
  }));

  return parsed.rows.map((row, index) => {
    const input: ImportContactInput = { ...emptyInput };
    (Object.keys(input) as Array<keyof ImportContactInput>).forEach((field) => {
      input[field] = readCell(row, mapping, field);
    });

    input.priority ||= defaults.priority || "Mittel";
    input.owner ||= defaults.owner || "Timo Frank";
    input.source ||= defaults.source || parsed.fileName;
    input.sector ||= defaults.sector;

    const problems: string[] = [];
    let errorCount = 0;
    let warningCount = 0;

    if (!input.name) {
      problems.push("Name fehlt (Pflichtfeld)");
      errorCount += 1;
    }

    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      problems.push("E-Mail wirkt ungültig");
      warningCount += 1;
    }

    if (input.sector && !sectorSet.has(normalize(input.sector))) {
      problems.push("Sektor unbekannt");
      warningCount += 1;
    }

    if (!input.city && !input.location) {
      problems.push("Standort unklar");
      warningCount += 1;
    }

    const duplicate = Boolean(
      input.name &&
        existing.find(
          (contact) =>
            contact.key === `${normalize(input.name)}|${normalize(input.organization)}` ||
            (normalize(input.name).length > 6 && contact.key.includes(normalize(input.name)))
        )
    );

    let status: ReviewStatus = "ready";
    if (errorCount > 0) status = "error";
    else if (duplicate) status = "duplicate";
    else if (warningCount > 0) status = "review";

    return {
      ...input,
      rowNumber: index + 2,
      status,
      problems,
      skip: errorCount > 0,
      duplicate,
      warningCount,
      errorCount
    };
  });
}

export function ContactImportWizard({ context }: { context: ImportContext }) {
  const [step, setStep] = useState<Step>("select");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, TargetField>>({});
  const [defaults, setDefaults] = useState({
    priority: "Mittel",
    owner: context.defaultOwner || "Timo Frank",
    source: "Dateiname",
    sector: ""
  });
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportContactResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const stepIndex = steps.findIndex((entry) => entry.id === step);
  const reviewRows = useMemo(() => {
    if (!parsed) return [];
    return buildReviewRows(parsed, mapping, { ...defaults, source: defaults.source === "Dateiname" ? parsed.fileName : defaults.source }, context).map(
      (row) => ({
        ...row,
        skip: skippedRows.has(row.rowNumber) || row.skip
      })
    );
  }, [context, defaults, mapping, parsed, skippedRows]);

  const counts = {
    ready: reviewRows.filter((row) => row.status === "ready" && !row.skip).length,
    review: reviewRows.filter((row) => row.status === "review" && !row.skip).length,
    duplicate: reviewRows.filter((row) => row.status === "duplicate" && !row.skip).length,
    error: reviewRows.filter((row) => row.status === "error" && !row.skip).length,
    skipped: reviewRows.filter((row) => row.skip).length
  };

  async function handleFile(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (["doc", "docx", "pdf"].includes(extension)) {
      setParsed({
        fileName: file.name,
        fileType: "best-effort",
        sheets: [],
        selectedSheet: "",
        columns: [],
        rows: [],
        warning: "Word/PDF wurde nicht sauber als Tabelle erkannt. Bitte als Excel oder CSV exportieren und erneut importieren."
      });
      setStep("detect");
      return;
    }

    if (extension === "csv") {
      const text = await file.text();
      const delimiter = detectDelimiter(text);
      const objects = rowsToObjects(parseDelimited(text, delimiter));
      const nextParsed = {
        fileName: file.name,
        fileType: "csv" as const,
        delimiter,
        sheets: [],
        selectedSheet: "",
        ...objects
      };
      setParsed(nextParsed);
      setMapping(suggestMapping(nextParsed.columns));
      setDefaults((current) => ({ ...current, source: file.name }));
      setStep("detect");
      return;
    }

    if (extension === "xls") {
      setParsed({
        fileName: file.name,
        fileType: "unsupported",
        sheets: [],
        selectedSheet: "",
        columns: [],
        rows: [],
        warning: "Alte .xls-Dateien bitte einmal als .xlsx speichern. Danach kann der Import stabil geprüft werden."
      });
      setStep("detect");
      return;
    }

    if (extension === "xlsx") {
      const sheets = await readXlsxFile(file);
      const firstSheet = sheets[0];
      const sheetName = firstSheet?.sheet || "Tabelle 1";
      const rows = firstSheet?.data || [];
      const objects = rowsToObjects(rows.map((row) => row.map((cell) => String(cell ?? ""))));
      const nextParsed = {
        fileName: file.name,
        fileType: "excel" as const,
        sheets: sheets.map((sheet) => sheet.sheet),
        selectedSheet: sheetName,
        ...objects
      };
      setParsed(nextParsed);
      setMapping(suggestMapping(nextParsed.columns));
      setDefaults((current) => ({ ...current, source: file.name }));
      setStep("detect");
      return;
    }

    setParsed({
      fileName: file.name,
      fileType: "unsupported",
      sheets: [],
      selectedSheet: "",
      columns: [],
      rows: [],
      warning: "Dieses Format wird nicht unterstützt. Für einen stabilen Import bitte CSV oder Excel verwenden."
    });
    setStep("detect");
  }

  function downloadTemplate() {
    const header = targetFields.filter((field) => field.value !== "ignore").map((field) => field.label).join(";");
    const example = "Johanna Dorn;MVZ Universitätsklinikum Süd;Krankenhäuser;Kinder- und Jugendmedizin;Hamburg;20095;Hamburg;Hamburg;johanna.dorn@example.de;040 5552101;https://linkedin.com/in/jd;Mittel;Timo Frank;Pilot;Erstkontakt aus Netzwerk;Import-Vorlage";
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "versorgungs-kompass-import-vorlage.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleSkip(rowNumber: number, skip: boolean) {
    setSkippedRows((current) => {
      const next = new Set(current);
      if (skip) next.add(rowNumber);
      else next.delete(rowNumber);
      return next;
    });
  }

  function runImport(onlyReady = false) {
    const rows = reviewRows.map((row) => ({
      ...row,
      skip: row.skip || (onlyReady && row.status !== "ready")
    }));
    const formData = new FormData();
    formData.set("rows", JSON.stringify(rows));

    startTransition(async () => {
      const nextResult = await importContactsAction(formData);
      setResult(nextResult);
      setStep("report");
    });
  }

  return (
    <section className="import-wizard">
      <div className="import-steps">
        {steps.map((entry, index) => (
          <div className={`import-step${index <= stepIndex ? " import-step-active" : ""}`} key={entry.id}>
            <span>{index + 1}</span>
            <strong>{entry.label}</strong>
          </div>
        ))}
      </div>

      {step === "select" ? (
        <div className="import-panel">
          <label className="import-dropzone">
            <input
              accept=".csv,.xls,.xlsx,.doc,.docx,.pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
              type="file"
            />
            <span className="import-upload-icon">↑</span>
            <strong>Datei hier ablegen oder auswählen</strong>
            <small>Empfohlen: CSV, Excel · Optional: Word, PDF als Best Effort</small>
          </label>

          <div className="import-format-grid">
            <div className="import-format-card import-format-card-active">
              <span className="file-badge file-badge-excel">XLS</span>
              <div>
                <strong>CSV oder Excel importieren</strong>
                <small>Am zuverlässigsten</small>
              </div>
            </div>
            <div className="import-format-card">
              <span className="file-badge file-badge-pdf">PDF</span>
              <div>
                <strong>Word oder PDF importieren</strong>
                <small>Best Effort, nur saubere Tabellen</small>
              </div>
            </div>
          </div>

          <button className="button button-ghost import-template-button" onClick={downloadTemplate} type="button">
            Import-Vorlage herunterladen
          </button>

          <div className="import-info-box">
            <strong>Wichtig für robuste Importe</strong>
            <p>Name ist das einzige Pflichtfeld. Felder können später geprüft werden, Dubletten werden vor dem Import markiert.</p>
          </div>
        </div>
      ) : null}

      {step === "detect" && parsed ? (
        <div className="import-panel">
          <div className="import-file-card">
            <span className={`file-badge ${parsed.fileType === "excel" ? "file-badge-excel" : "file-badge-csv"}`}>
              {parsed.fileType === "excel" ? "XLS" : "CSV"}
            </span>
            <div>
              <strong>{parsed.fileName}</strong>
              <small>
                {parsed.fileType === "csv" ? `Trennzeichen erkannt: ${parsed.delimiter}` : null}
                {parsed.fileType === "excel" ? `${parsed.sheets.length} Tabellenblatt${parsed.sheets.length === 1 ? "" : "er"}` : null}
              </small>
            </div>
            <button className="button button-ghost" onClick={() => setStep("select")} type="button">
              Ändern
            </button>
          </div>

          {parsed.warning ? <div className="import-warning">{parsed.warning}</div> : null}

          {!parsed.warning ? (
            <>
              <div className="import-metrics">
                <div><strong>{parsed.rows.length}</strong><span>Zeilen erkannt</span></div>
                <div><strong>{parsed.columns.length}</strong><span>Spalten erkannt</span></div>
                <div><strong>{parsed.sheets.length || 1}</strong><span>{parsed.fileType === "excel" ? "Tabellenblatt" : "Datei"}</span></div>
              </div>

              <div className="import-info-box">
                Vermutete Kontaktfelder wurden automatisch erkannt. Du kannst sie im nächsten Schritt prüfen.
              </div>

              <PreviewTable columns={parsed.columns} rows={parsed.rows.slice(0, 5)} />
            </>
          ) : null}

          <div className="import-footer">
            <button className="button button-secondary" onClick={() => setStep("select")} type="button">Zurück</button>
            <button className="button button-primary" disabled={Boolean(parsed.warning)} onClick={() => setStep("map")} type="button">
              Weiter zuordnen
            </button>
          </div>
        </div>
      ) : null}

      {step === "map" && parsed ? (
        <div className="import-panel">
          <div className="import-info-box">Ordne die erkannten Spalten den Kontaktfeldern im Versorgungs-Kompass zu.</div>
          <div className="import-map-layout">
            <div className="import-map-table">
              <div className="import-map-header"><strong>Erkannte Spalte</strong><strong>Zielfeld</strong><span /></div>
              {parsed.columns.map((column) => (
                <div className="import-map-row" key={column}>
                  <span>{column}</span>
                  <select
                    value={mapping[column] || "ignore"}
                    onChange={(event) => setMapping((current) => ({ ...current, [column]: event.target.value as TargetField }))}
                  >
                    {targetFields.map((field) => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </select>
                  <span className={mapping[column] === "ignore" ? "map-state map-state-warn" : "map-state map-state-ok"}>
                    {mapping[column] === "ignore" ? "!" : "✓"}
                  </span>
                </div>
              ))}
            </div>
            <div className="import-defaults">
              <h3>Standardwerte</h3>
              <p>Diese Werte werden gesetzt, wenn die Datei das Feld nicht liefert.</p>
              <label>Priorität<input value={defaults.priority} onChange={(event) => setDefaults({ ...defaults, priority: event.target.value })} /></label>
              <label>
                Owner
                <select value={defaults.owner} onChange={(event) => setDefaults({ ...defaults, owner: event.target.value })}>
                  {context.users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}
                  <option value="TF">TF</option>
                </select>
              </label>
              <label>Quelle<input value={defaults.source} onChange={(event) => setDefaults({ ...defaults, source: event.target.value })} /></label>
              <label>
                Sektor für unbekannte Werte
                <select value={defaults.sector} onChange={(event) => setDefaults({ ...defaults, sector: event.target.value })}>
                  <option value="">Nicht setzen</option>
                  {context.sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="import-footer">
            <button className="button button-secondary" onClick={() => setStep("detect")} type="button">Zurück</button>
            <button className="button button-primary" onClick={() => setStep("review")} type="button">Weiter prüfen</button>
          </div>
        </div>
      ) : null}

      {step === "review" && parsed ? (
        <div className="import-panel">
          <div className="import-review-metrics">
            <Metric label="importbereit" tone="ok" value={counts.ready} />
            <Metric label="mögliche Dubletten" tone="duplicate" value={counts.duplicate} />
            <Metric label="prüfen" tone="warn" value={counts.review} />
            <Metric label="Fehler" tone="error" value={counts.error} />
          </div>
          <ReviewTable rows={reviewRows.slice(0, 12)} onSkip={toggleSkip} />
          <div className="import-bulk-grid">
            <div className="import-bulk-card">
              <h3>Sammelaktionen</h3>
              <button className="button button-ghost" onClick={() => setDefaults({ ...defaults, owner: context.defaultOwner })} type="button">Owner für alle setzen</button>
              <button className="button button-ghost" onClick={() => setDefaults({ ...defaults, priority: "Mittel" })} type="button">Priorität für alle setzen</button>
              <button className="button button-ghost" onClick={() => setDefaults({ ...defaults, sector: context.sectors[0] || "" })} type="button">Sektor für unbekannte Werte setzen</button>
              <button
                className="button button-ghost"
                onClick={() => setSkippedRows(new Set(reviewRows.filter((row) => row.status === "error").map((row) => row.rowNumber)))}
                type="button"
              >
                Zeilen mit Fehlern überspringen
              </button>
            </div>
            <div className="import-info-box">
              <strong>Name ist Pflichtfeld.</strong>
              <p>Warnungen blockieren nicht. Mögliche Dubletten können übersprungen oder trotzdem importiert werden.</p>
            </div>
          </div>
          <div className="import-footer">
            <button className="button button-secondary" onClick={() => setStep("map")} type="button">Zurück</button>
            <div className="import-footer-actions">
              <button className="button button-ghost" disabled={isPending} onClick={() => runImport(true)} type="button">
                Nur importbereite Kontakte importieren
              </button>
              <button className="button button-primary" disabled={isPending} onClick={() => runImport(false)} type="button">
                {isPending ? "Import läuft..." : "Import starten"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "report" && result ? (
        <div className="import-panel import-report">
          <div className="import-success-mark">✓</div>
          <h3>Import erfolgreich abgeschlossen</h3>
          <p>{result.imported} neue Kontakte wurden importiert.</p>
          <div className="import-review-metrics">
            <Metric label="Kontakte importiert" tone="ok" value={result.imported} />
            <Metric label="Zeilen übersprungen" tone="duplicate" value={result.skipped} />
            <Metric label="Warnungen" tone="warn" value={result.warnings} />
            <Metric label="Fehler" tone="error" value={result.errors} />
          </div>
          <div className="import-profile-card">
            <h3>Importprofil speichern</h3>
            <input defaultValue={parsed?.fileName ? `${parsed.fileName.replace(/\.[^.]+$/, "")} Profil` : "Importprofil"} />
            <label className="import-checkbox"><input type="checkbox" defaultChecked /> Spaltenzuordnung für künftige Importe merken</label>
            <small>Profilstruktur ist vorbereitet; die dauerhafte Speicherung folgt als nächster Ausbauschritt.</small>
          </div>
          <div className="import-next-actions">
            <Link className="button button-primary" href="/people">Importierte Kontakte anzeigen</Link>
            <button className="button button-ghost" type="button">Fehlerhafte Zeilen exportieren</button>
            <button className="button button-ghost" type="button">Importbericht herunterladen</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PreviewTable({ columns, rows }: { columns: string[]; rows: Record<string, string>[] }) {
  return (
    <div className="table-shell import-preview-table">
      <table className="crm-table">
        <thead><tr>{columns.slice(0, 6).map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.slice(0, 6).map((column) => <td key={column}>{row[column] || "-"}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className={`import-metric import-metric-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReviewTable({ rows, onSkip }: { rows: ReviewRow[]; onSkip: (rowNumber: number, skip: boolean) => void }) {
  return (
    <div className="table-shell">
      <table className="crm-table import-review-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Name</th>
            <th>Organisation</th>
            <th>Thema / Sektor</th>
            <th>Problem / Hinweis</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNumber}>
              <td><span className={`status-chip import-status-${row.status}`}>{statusLabel(row.status)}</span></td>
              <td>{row.name || "-"}</td>
              <td>{row.organization || "-"}</td>
              <td>{row.specialty || row.sector || "Unbekannt"}</td>
              <td>{row.problems.join(", ") || "-"}</td>
              <td>
                <select value={row.skip ? "skip" : "import"} onChange={(event) => onSkip(row.rowNumber, event.target.value !== "import")}>
                  <option value="import">Trotzdem importieren</option>
                  <option value="skip">Überspringen</option>
                  <option value="later">Später prüfen</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
