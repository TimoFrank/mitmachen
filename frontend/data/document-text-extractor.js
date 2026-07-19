(function () {
  const SCRIPT_URL = document.currentScript?.src || window.location.href;
  const MAX_EXTRACTED_CHARACTERS = 200_000;
  const SUPPORTED_MIME_TYPES = Object.freeze([
    "text/plain",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);
  let mammothPromise = null;
  let pdfJsPromise = null;

  function cleanExtractedText(value = "") {
    return String(value || "")
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, MAX_EXTRACTED_CHARACTERS);
  }

  function ensureMammoth() {
    if (window.mammoth?.extractRawText) return Promise.resolve(window.mammoth);
    if (mammothPromise) return mammothPromise;
    mammothPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("../vendor/mammoth/mammoth.browser.min.js", SCRIPT_URL).href;
      script.async = true;
      script.onload = () => window.mammoth?.extractRawText
        ? resolve(window.mammoth)
        : reject(new Error("DOCX-Extraktion konnte nicht initialisiert werden."));
      script.onerror = () => reject(new Error("DOCX-Extraktion konnte nicht geladen werden."));
      document.head.appendChild(script);
    });
    return mammothPromise;
  }

  async function ensurePdfJs() {
    if (pdfJsPromise) return pdfJsPromise;
    pdfJsPromise = import(new URL("../vendor/pdfjs/pdf.min.mjs", SCRIPT_URL).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", SCRIPT_URL).href;
      return pdfjs;
    });
    return pdfJsPromise;
  }

  async function extractPdf(file) {
    const pdfjs = await ensurePdfJs();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const documentHandle = await loadingTask.promise;
    const pages = [];
    try {
      for (let pageNumber = 1; pageNumber <= documentHandle.numPages; pageNumber += 1) {
        const page = await documentHandle.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => String(item?.str || "")).join(" "));
        page.cleanup?.();
        if (pages.join("\n\n").length >= MAX_EXTRACTED_CHARACTERS) break;
      }
    } finally {
      await documentHandle.destroy?.();
    }
    return cleanExtractedText(pages.join("\n\n"));
  }

  async function extractDocx(file) {
    const mammoth = await ensureMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return cleanExtractedText(result?.value || "");
  }

  async function extract(file) {
    const mimeType = String(file?.type || "").trim().toLowerCase();
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      return { status: "unsupported", text: "", error: "Für diesen Dateityp ist keine Volltextextraktion vorgesehen." };
    }
    try {
      const text = mimeType === "text/plain"
        ? cleanExtractedText(new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer()))
        : mimeType === "application/pdf"
          ? await extractPdf(file)
          : await extractDocx(file);
      if (!text) return { status: "failed", text: "", error: "Aus dem Dokument konnte kein Text extrahiert werden." };
      return { status: "complete", text, error: "" };
    } catch (error) {
      console.warn("Dokumentvolltext konnte nicht extrahiert werden.", error);
      return {
        status: "failed",
        text: "",
        error: String(error?.message || "Dokumentvolltext konnte nicht extrahiert werden.").slice(0, 500)
      };
    }
  }

  window.DocumentTextExtractor = Object.freeze({
    MAX_EXTRACTED_CHARACTERS,
    SUPPORTED_MIME_TYPES,
    extract
  });
})();
