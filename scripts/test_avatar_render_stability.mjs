import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);
const source = readFileSync(new URL("frontend/app/versorgungs-kompass.js", projectRoot), "utf8");

function sourceSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Quelltextabschnitt fehlt: ${startMarker}`);
  return source.slice(start, end);
}

function assertAvatarElementStability() {
  const updateAvatarElementSource = sourceSection(
    "      function updateAvatarElement(",
    "\n      function currentProfileOwnerValues("
  );
  const sandbox = {
    avatarWrites: 0,
    avatarMarkup(profile, className) {
      return `${className}:${profile.version}`;
    }
  };
  vm.runInNewContext(
    [
      "const avatarElementSignatures = new WeakMap();",
      updateAvatarElementSource,
      "globalThis.updateAvatarElementForTest = updateAvatarElement;"
    ].join("\n"),
    sandbox,
    { filename: "avatar-element-stability.js" }
  );
  const element = {
    set innerHTML(value) {
      this.value = value;
      sandbox.avatarWrites += 1;
    }
  };

  sandbox.updateAvatarElementForTest(element, { version: "v1" }, "avatar");
  sandbox.updateAvatarElementForTest(element, { version: "v1" }, "avatar");
  assert.equal(sandbox.avatarWrites, 1, "Identische Avatar-Daten dürfen das img-Element nicht erneut erzeugen.");

  sandbox.updateAvatarElementForTest(element, { version: "v2" }, "avatar");
  assert.equal(sandbox.avatarWrites, 2, "Eine neue Avatar-Version muss weiterhin gerendert werden.");
}

function assertTeamViewIsLazyAndStable() {
  const accountProfileSource = sourceSection(
    "      function renderAccountProfile(",
    "\n      function setProfileStatus("
  );
  assert.doesNotMatch(
    accountProfileSource,
    /\brenderTeamView\(\)/u,
    "Das Laden des Profils darf die versteckte Teamansicht nicht rendern."
  );

  const updateViewSource = sourceSection(
    "      function updateView()",
    "\n      editorForm.elements.category"
  );
  assert.match(
    updateViewSource,
    /if \(activeView === "team"\) renderTeamView\(\);/u,
    "Globale Ansichtsupdates dürfen die Teamansicht nur rendern, wenn sie sichtbar ist."
  );
  assert.match(
    source,
    /if \(renderSignature === renderedTeamViewSignature\) return;/u,
    "Die Teamansicht braucht eine stabile Render-Signatur."
  );
}

function assertDeferredBootstrapIsTargeted() {
  const deferredSource = sourceSection(
    "      async function loadDeferredInitialData(",
    "\n      async function initializeData("
  );
  const fullRefreshes = deferredSource.match(/\bupdateView\(\)/gu) || [];
  assert.equal(
    fullRefreshes.length,
    1,
    "Der Deferred-Bootstrap darf nur den gerade betroffenen aktiven Bereich vollständig aktualisieren."
  );
  assert.match(deferredSource, /deferredDataAffectsActiveView/u);
  assert.match(deferredSource, /\bloadSavedViews\(\),/u);
  assert.match(deferredSource, /\brefreshNotificationSummary\(\)/u);
  assert.doesNotMatch(
    deferredSource,
    /refreshActiveViewAfter\([^,]+,\s*(?:loadSavedViews|refreshNotificationSummary)/u,
    "Gespeicherte Ansichten und Benachrichtigungszähler aktualisieren ihre eigenen DOM-Bereiche bereits gezielt."
  );
}

assertAvatarElementStability();
assertTeamViewIsLazyAndStable();
assertDeferredBootstrapIsTargeted();

console.log("Avatar- und Bootstrap-Renderstabilität: OK");
