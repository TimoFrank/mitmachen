#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function canonicalHttpsUrl({ hostname, port = "", pathname }) {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(hostname)) {
    fail("Repository-Host ist ungültig.");
  }
  if (port && !/^[0-9]{1,5}$/u.test(port)) {
    fail("Repository-Port ist ungültig.");
  }
  const normalizedPath = pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "");
  if (!normalizedPath || !/^[a-z0-9._~%+-]+(?:\/[a-z0-9._~%+-]+)+$/iu.test(normalizedPath)) {
    fail("Repository-Pfad ist ungültig.");
  }
  return `https://${hostname.toLowerCase()}${port ? `:${port}` : ""}/${normalizedPath}`;
}

export function normalizeRepositoryUrl(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.includes("\n") || raw.includes("\r")) {
    fail("Repository-URL fehlt oder enthält Zeilenumbrüche.");
  }

  const scpMatch = raw.match(/^git@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):([^\s]+)$/iu);
  if (scpMatch) {
    return canonicalHttpsUrl({ hostname: scpMatch[1], pathname: scpMatch[2] });
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail("Repository-URL muss HTTPS oder eine kanonische Git-SSH-URL verwenden.");
  }

  if (parsed.search || parsed.hash) {
    fail("Repository-URL darf keine Query- oder Fragmentdaten enthalten.");
  }
  if (parsed.protocol === "https:") {
    if (parsed.username || parsed.password) {
      fail("Repository-URL darf keine Zugangsdaten enthalten.");
    }
  } else if (parsed.protocol === "ssh:") {
    if (parsed.username !== "git" || parsed.password) {
      fail("SSH-Repository-URL muss den zugangsdatenfreien git-Benutzer verwenden.");
    }
    if (parsed.port) {
      fail("Ein SSH-Port kann nicht sicher als HTTPS-Port übernommen werden.");
    }
  } else {
    fail("Repository-URL muss HTTPS oder SSH verwenden.");
  }

  return canonicalHttpsUrl({
    hostname: parsed.hostname,
    port: parsed.protocol === "https:" ? parsed.port : "",
    pathname: parsed.pathname
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readFileSync(0, "utf8");
    process.stdout.write(`${normalizeRepositoryUrl(input)}\n`);
  } catch (error) {
    process.stderr.write(`Repository-URL abgelehnt: ${error.message}\n`);
    process.exitCode = 1;
  }
}
