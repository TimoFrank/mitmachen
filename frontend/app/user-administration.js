(function () {
  "use strict";
  const root = document.getElementById("view-userAdmin");
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("de-DE") : "Noch nicht angemeldet";
  const labels = { active: "Aktiv", blocked: "Gesperrt", unbound: "Ohne App-Zugang", preparing: "In Vorbereitung", ready: "Versandbereit", sending: "Versand wird geprüft", accepted: "Linkaktivierung offen", sent: "Versendet", uncertain: "Versand unklar" };
  const actions = { invitation_started: "Einladung begonnen", invitation_ready: "Einladung vorbereitet", invitation_sent: "Einladung versendet", account_updated: "Konto geändert", account_blocked: "Konto gesperrt", change_started: "Kontoänderung begonnen", change_failed_closed: "Kontoänderung unterbrochen – Zugang gesperrt", delivery_uncertain: "Versand muss geprüft werden" };
  let data = null, filter = "all", busy = false, request = 0, editing = null, prepared = null, operationId = null;
  function status(message, error = false) {
    $("[data-admin-status]").textContent = message;
    $("[data-admin-status]").classList.toggle("is-error", error);
  }
  async function run(work) {
    if (busy) return;
    busy = true; root.setAttribute("aria-busy", "true");
    root.querySelectorAll("button").forEach(button => { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; });
    try { await work(); }
    catch (error) { status(error.message || "Die Änderung konnte nicht bestätigt werden.", true); $("[data-admin-dialog-status]").textContent = error.message; }
    finally {
      busy = false; root.setAttribute("aria-busy", "false");
      root.querySelectorAll("button").forEach(button => { if (button.dataset.wasDisabled !== undefined) { button.disabled = button.dataset.wasDisabled === "true"; delete button.dataset.wasDisabled; } });
      $("[data-admin-invite]").disabled = !data?.canInvite;
    }
  }
  function render() {
    const query = $("[data-admin-search]").value.trim().toLocaleLowerCase("de");
    const items = data.items.filter(row => (filter === "all" || row.status === filter) && `${row.name} ${row.email} ${row.team}`.toLocaleLowerCase("de").includes(query));
    $("[data-admin-count]").textContent = `${items.length} von ${data.items.length} Konten`;
    $("[data-admin-rows]").innerHTML = items.length ? items.map(row => `<tr>
      <td><strong>${escape(row.name)}</strong><span class="user-admin-secondary">${escape(row.email)}</span>${row.profileId === data.actorProfileId ? '<small>Dein Konto</small>' : ""}</td>
      <td>${escape(row.role ? row.role[0].toUpperCase() + row.role.slice(1) : "—")}<span class="user-admin-secondary">${escape(row.team || "Kein Team")}</span></td>
      <td><span class="user-admin-state" data-state="${escape(row.status)}">${escape(labels[row.status])}</span><span class="user-admin-secondary">${row.scope === "test_only" ? "Testbereich" : row.scope === "standard" ? "Standardzugang" : "Zuordnung fehlt"}</span></td>
      <td>${escape(date(row.lastSignIn))}</td>
      <td><button type="button" class="action-button" data-admin-edit="${escape(row.id)}" ${!row.editable || row.profileId === data.actorProfileId ? "disabled" : ""}>Verwalten<span class="visually-hidden">: ${escape(row.email)}</span></button></td>
    </tr>`).join("") : '<tr><td colspan="5">Keine passenden Konten gefunden.</td></tr>';
    $("[data-admin-invite]").disabled = !data.canInvite;
    $("[data-admin-invitations]").innerHTML = data.invitations.length ? data.invitations.map(row => `<li><div><strong>${escape(row.name)}</strong><span class="user-admin-secondary">${escape(row.email)} · ${escape(labels[row.status])}</span></div>${["ready", "accepted", "preparing"].includes(row.status) ? `<button class="action-button" type="button" data-admin-preview="${escape(row.id)}">${row.status === "preparing" ? "Fortsetzen" : "Ansehen"}</button>` : `<span>${escape(row.sentAt ? date(row.sentAt) : "")}</span>`}</li>`).join("") : "<li>Noch keine Einladungen über die Nutzerverwaltung.</li>";
    $("[data-admin-history]").innerHTML = data.history.length ? data.history.map(row => `<li><div><strong>${escape(actions[row.action] || "Konto bearbeitet")}</strong><span class="user-admin-secondary">${escape(row.details.email || "")} · ${escape(row.actor_name || "Administration")}</span></div><time>${escape(date(row.created_at))}</time></li>`).join("") : "<li>Noch keine Änderungen über die Nutzerverwaltung.</li>";
  }
  async function load() {
    if (root.getAttribute("aria-hidden") !== "false") return;
    const sequence = ++request;
    $("[data-admin-invite]").disabled = true;
    data = null;
    $("[data-admin-rows]").innerHTML = '<tr><td colspan="5">Konten werden geladen …</td></tr>';
    $("[data-admin-invitations]").replaceChildren(); $("[data-admin-history]").replaceChildren();
    status("Konten und App-Berechtigungen werden abgeglichen …");
    try {
      const value = await window.dataService.getAdminUsers();
      if (sequence !== request) return;
      if (![value.items, value.invitations, value.history].every(Array.isArray)) throw new Error("Die Nutzerübersicht konnte nicht vollständig geladen werden.");
      data = value; render(); status(value.canInvite ? "" : "Konten können verwaltet werden. Der Einladungsversand ist noch nicht eingerichtet.");
    } catch (error) {
      if (sequence !== request) return;
      $("[data-admin-rows]").innerHTML = '<tr><td colspan="5">Keine Kontodaten verfügbar.</td></tr>';
      $("[data-admin-count]").textContent = "";
      status(error.message || "Nutzerübersicht nicht erreichbar. Bitte erneut laden.", true);
    }
  }
  const dialog = $("[data-admin-dialog]");
  function showDialog(mode) {
    if (root.getAttribute("aria-hidden") !== "false") return;
    $("[data-admin-dialog-status]").textContent = "";
    for (const name of ["invite", "edit", "preview"]) $(`[data-admin-${name}-panel]`).hidden = name !== mode;
    $("[data-admin-dialog-title]").textContent = { invite: "Nutzer einladen", edit: "Konto verwalten", preview: "Einladung prüfen" }[mode];
    if (!dialog.open) dialog.showModal();
  }
  function showPreview(row) {
    prepared = row; showDialog("preview");
    $("[data-admin-recipient]").textContent = row.email;
    $("[data-admin-subject]").textContent = row.preview.subject;
    $("[data-admin-mail]").textContent = row.preview.text;
    $("[data-admin-send]").textContent = row.status === "accepted" ? "Linkaktivierung abschließen" : "Einladung senden";
  }
  root.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button || busy) return;
    if (button.hasAttribute("data-admin-reload")) return void load();
    if (button.hasAttribute("data-admin-close")) return dialog.close();
    if (button.dataset.adminFilter) {
      filter = button.dataset.adminFilter;
      root.querySelectorAll("[data-admin-filter]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      if (data) render(); return;
    }
    if (button.hasAttribute("data-admin-invite")) {
      prepared = null; operationId = crypto.randomUUID(); $("[data-admin-invite-form]").reset(); showDialog("invite"); return;
    }
    if (button.dataset.adminEdit && data) {
      editing = data.items.find(row => row.id === button.dataset.adminEdit);
      if (!editing?.editable || editing.profileId === data.actorProfileId) return;
      showDialog("edit"); $("[data-admin-edit-name]").textContent = `${editing.name} · ${editing.email}`;
      $("[data-admin-enabled]").checked = editing.status === "active";
      root.querySelectorAll('[name="admin-edit-role"]').forEach(input => { input.checked = input.value === editing.role; input.disabled = input.value === "admin" && editing.scope === "test_only"; });
      return;
    }
    if (button.dataset.adminPreview && data) {
      const row = data.invitations.find(v => v.id === button.dataset.adminPreview);
      if (row.status === "preparing") return void run(async () => { showPreview(await window.dataService.prepareAdminInvitation({ operationId: row.id, name: row.name, email: row.email, role: row.role, emailOwnershipVerified: true })); });
      showPreview(row); return;
    }
    if (button.hasAttribute("data-admin-send") && prepared) void run(async () => {
      await window.dataService.sendAdminInvitation(prepared.id, { fingerprint: prepared.preview.fingerprint });
      dialog.close(); await load(); status("Einladung versendet. Der Link ist ab Versand 48 Stunden gültig.");
    });
  });
  $("[data-admin-search]").addEventListener("input", () => { if (data) render(); });
  $("[data-admin-invite-form]").addEventListener("submit", event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(async () => {
      const value = await window.dataService.prepareAdminInvitation({ operationId, name: String(form.get("name")).trim(), email: String(form.get("email")).trim().toLowerCase(), role: form.get("role"), emailOwnershipVerified: form.get("ownership") === "on" });
      showPreview(value);
    });
  });
  $("[data-admin-edit-form]").addEventListener("submit", event => {
    event.preventDefault(); if (!editing) return;
    const role = root.querySelector('[name="admin-edit-role"]:checked')?.value;
    const enabled = $("[data-admin-enabled]").checked;
    if (!window.confirm(`${editing.email}: Rolle ${role}, Zugang ${enabled ? "freigeben" : "sperren"}? Bestehende Sitzungen werden beendet.`)) return;
    void run(async () => {
      await window.dataService.updateAdminUser(editing.id, { version: editing.version, role, enabled });
      dialog.close(); await load(); status("Konto geändert. Bestehende Sitzungen wurden beendet.");
    });
  });
  window.VKUserAdministration = { open: load, close: () => { ++request; data = null; prepared = null; editing = null; dialog.close(); $("[data-admin-rows]").replaceChildren(); $("[data-admin-invitations]").replaceChildren(); $("[data-admin-history]").replaceChildren(); $("[data-admin-mail]").textContent = ""; } };
})();
