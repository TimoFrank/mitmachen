(function () {
  "use strict";
  const code = new URLSearchParams(location.search).get("code");
  history.replaceState(null, "", location.pathname);
  const status = document.getElementById("mac-status"), approve = document.getElementById("mac-approve");
  async function request(route, body) {
    const response = await fetch(`/api/mac-sync/${route}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Die Verbindung ist abgelaufen. Bitte starte sie in der lokalen Anwendung erneut.");
    return value;
  }
  async function devices() {
    const data = await request("devices");
    const list = document.getElementById("mac-devices"); list.replaceChildren();
    if (!data.devices.length) { list.textContent = "Noch kein Mac verbunden."; return; }
    for (const device of data.devices) {
      const row = document.createElement("p"), name = document.createElement("span");
      const active = !device.revoked_at && Date.parse(device.expires_at) > Date.now();
      name.textContent = `${device.label} · ${active ? `Verbunden bis ${new Date(device.expires_at).toLocaleDateString("de-DE")}` : "Verbindung beendet"}`;
      row.append(name);
      if (active) {
        const button = document.createElement("button"); button.type = "button"; button.className = "action-button action-button--ghost"; button.textContent = "Verbindung trennen";
        button.addEventListener("click", async () => { button.disabled = true; try { await request("revoke", { id: device.id }); await devices(); } catch (error) { status.textContent = error.message; button.disabled = false; } });
        row.append(" ", button);
      }
      list.append(row);
    }
  }
  async function initialize() {
    try {
      if (code) {
        const pairing = await request("pairing", { code });
        document.getElementById("mac-device").textContent = pairing.label;
        status.textContent = `Du verbindest diesen Mac mit dem Konto von ${pairing.profile}.`;
        approve.hidden = false;
      } else status.textContent = "Starte die Verbindung unter „Mac-Abgleich“ in deiner lokalen Anwendung.";
      await devices();
    } catch (error) { status.textContent = error.message; }
  }
  approve.addEventListener("click", async () => {
    approve.disabled = true;
    try {
      await request("approve", { code });
      approve.hidden = true; status.textContent = "Dieser Mac ist verbunden. Die lokale Anwendung startet den Abgleich automatisch.";
      await devices();
    } catch (error) { status.textContent = error.message; approve.disabled = false; }
  });
  initialize();
})();
