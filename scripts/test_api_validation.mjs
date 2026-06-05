import { spawn } from "node:child_process";

const port = 19000 + Math.floor(Math.random() * 1000);
const env = {
  ...process.env,
  PORT: String(port),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key"
};

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeToken() {
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ sub: "validation-test-user" })}.`;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("API-Server ist fuer den Validierungstest nicht gestartet.")), 5000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Versorgungs-Kompass API listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      const message = String(chunk);
      if (/EADDRINUSE|Error:/i.test(message)) {
        clearTimeout(timeout);
        reject(new Error(message.trim()));
      }
    });
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`API-Server wurde unerwartet beendet (${code}).`));
      }
    });
  });
}

async function expectValidationFailure(path, body, expectedField) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${fakeToken()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== 400) {
    throw new Error(`${path}: erwartete 400, bekam ${response.status}.`);
  }
  if (!String(payload.error || "").includes(expectedField)) {
    throw new Error(`${path}: Fehlermeldung nennt das unbekannte Feld nicht: ${JSON.stringify(payload)}`);
  }
}

const child = spawn(process.execPath, ["api/server.mjs"], {
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(child);
  await expectValidationFailure("/api/profile", { displayName: "Validierung", injectedSql: "select * from contacts" }, "injectedSql");
  console.log("API Validation Test OK: unbekannte JSON-Felder werden mit 400 abgewiesen.");
} finally {
  child.kill("SIGTERM");
}
