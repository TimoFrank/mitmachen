(function () {
  "use strict";
  const el = id => document.getElementById(id);
  const labels = { name: "Name", display_name: "Anzeigename", body: "Notiz", title: "Titel", content: "Inhalt", observation: "Beobachtung", description: "Beschreibung", notes: "Notizen", context_notes: "Kontext", code: "Kodierung", codes: "Kodierungen", source_type: "Herkunft", evidence_type: "Belegart", scheduled_on: "Datum", starts_at: "Beginn", ends_at: "Ende", status: "Status", organization: "Organisation", organization_name: "Organisation", contact_name: "Kontakt", city: "Ort", email: "E-Mail", phone: "Telefon", priority: "Priorität", sector: "Versorgungsbereich", specialty: "Fachrichtung", postal_code: "Postleitzahl", federal_state: "Bundesland", summary: "Zusammenfassung", finding: "Beobachtung", content_type: "Art der Notiz", email_subject: "Betreff", email_sender: "Absender", email_recipients: "Empfänger", tags: "Themen", topic: "Thema", settings: "Einstellungen" };
  const ignored = /^(?:id|.*_id|created_at|updated_at|created_by|updated_by|search_.*)$/;
  let current = null, pending = false, timer = null;
  async function request(route, body) {
    const response = await fetch(`/__local/sync/${route}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Der Abgleich konnte nicht abgeschlossen werden.");
    return value;
  }
  function textValue(value) {
    if (value === null || value === undefined || value === "") return "–";
    if (Array.isArray(value)) return value.map(textValue).join("\n");
    if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${labels[key] || key}: ${textValue(item)}`).join("\n");
    if (typeof value === "boolean") return value ? "Ja" : "Nein";
    if (value === "free_note") return "Notiz";
    if (value === "email_text") return "E-Mail-Text";
    return String(value);
  }
  function version(title, row, fields) {
    const block = document.createElement("div"); block.className = "local-sync-version";
    const heading = document.createElement("h4"); heading.textContent = title; block.append(heading);
    if (!row) { const p = document.createElement("p"); p.textContent = "Eintrag nicht vorhanden / gelöscht"; block.append(p); return block; }
    const list = document.createElement("dl");
    for (const key of fields) {
      const term = document.createElement("dt"), value = document.createElement("dd");
      term.textContent = labels[key] || key.replaceAll("_", " "); value.textContent = textValue(row[key]); list.append(term, value);
    }
    block.append(list); return block;
  }
  function render(state) {
    const previous = current?.conflict?.revision;
    current = state;
    const messages = { current: "Der Abgleich ist aktuell.", syncing: "Die Daten werden abgeglichen …", not_connected: "Dieser Mac ist noch nicht mit der Live-Anwendung verbunden.", pairing: "Bitte bestätige diesen Mac in der Live-Anwendung.", offline: "Der Abgleich ist gerade nicht möglich. Dein lokaler Stand bleibt verfügbar.", reconnect: "Die Verbindung muss erneut bestätigt werden. Dein lokaler Stand bleibt erhalten.", conflict: "Der Abgleich wartet auf deine Entscheidung." };
    el("sync-status").textContent = state.status === "pending" ? "Lokale Änderungen warten auf den nächsten Abgleich." : messages[state.status] || "Der Datenstand wird geprüft …";
    el("sync-last").textContent = state.lastSync ? new Date(state.lastSync).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "Noch keiner";
    el("sync-pending").textContent = `${state.pending || 0} noch nicht übertragen`;
    el("sync-pair").hidden = state.paired && state.status !== "reconnect";
    el("sync-now").disabled = pending || state.status === "syncing" || !state.paired;
    el("sync-conflict").hidden = !state.conflict;
    el("sync-keep-local").disabled = pending || !state.conflict?.conflict?.conflicts?.length;
    if (!state.conflict || state.conflict.revision === previous) return;
    const conflict = state.conflict.conflict;
    el("sync-comparison").replaceChildren();
    for (const item of conflict.conflicts || []) {
      const local = item.after, remote = item.remote;
      const heading = document.createElement("h3"); heading.textContent = item.caption || local?.name || local?.title || local?.contact_name || remote?.name || remote?.title || "Geänderter Eintrag";
      const fields = [...new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])].filter(key => !ignored.test(key) && JSON.stringify(local?.[key]) !== JSON.stringify(remote?.[key]));
      const versions = document.createElement("div"); versions.className = "local-sync-versions";
      versions.append(version("Auf diesem Mac", local, fields), version("Online", remote, fields));
      el("sync-comparison").append(heading, versions);
    }
    el("sync-validation").hidden = !conflict.validation;
    el("sync-validation").textContent = conflict.validation?.error || "";
  }
  async function action(work) {
    if (pending) return;
    pending = true; el("sync-error").hidden = true;
    for (const button of document.querySelectorAll("button")) button.disabled = true;
    try { await work(); }
    catch (error) { el("sync-error").textContent = error.message; el("sync-error").hidden = false; }
    finally { pending = false; for (const button of document.querySelectorAll("button")) button.disabled = false; await refresh(); }
  }
  async function refresh() {
    try { render(await request("status")); }
    catch { el("sync-status").textContent = "Die lokale Anwendung ist noch nicht erreichbar. Dein gespeicherter Stand bleibt erhalten."; }
  }
  el("sync-now").addEventListener("click", () => action(() => request("run", {})));
  el("sync-pair").addEventListener("click", () => action(async () => {
    const result = await request("pair", {});
    el("sync-pairing-link").href = result.url; el("sync-pairing").hidden = false; el("sync-pairing-link").focus();
  }));
  el("sync-history-open").addEventListener("click", () => action(async () => {
    const history = await request("history");
    const target = el("sync-history"); target.replaceChildren();
    if (!history.items.length) { target.textContent = "Noch keine Konfliktentscheidung gespeichert."; return; }
    for (const item of history.items) {
      const detail = document.createElement("details"), summary = document.createElement("summary");
      summary.textContent = `${new Date(item.at).toLocaleString("de-DE")} · ${item.choice === "local" ? "Lokale Änderung übernommen" : "Online-Fassung verwendet"}`;
      detail.append(summary);
      for (const pair of item.conflict.conflicts || []) {
        if (pair.caption) { const heading = document.createElement("h3"); heading.textContent = pair.caption; detail.append(heading); }
        const fields = [...new Set([...Object.keys(pair.after || {}), ...Object.keys(pair.remote || {})])].filter(key => !ignored.test(key));
        const versions = document.createElement("div"); versions.className = "local-sync-versions";
        versions.append(version("Damals auf diesem Mac", pair.after, fields), version("Damals online", pair.remote, fields)); detail.append(versions);
      }
      if (item.conflict.validation) { const p = document.createElement("p"); p.textContent = textValue(item.operation.body); detail.append(p); }
      target.append(detail);
    }
  }));
  for (const choice of ["local", "online"]) el(`sync-keep-${choice}`).addEventListener("click", () => action(() => request("resolve", { id: current.conflict.id, revision: current.conflict.revision, choice })));
  refresh(); timer = setInterval(() => { if (!pending && !document.hidden) refresh(); }, 5000);
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();
