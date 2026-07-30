import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/app.jsx", import.meta.url), "utf8");
const actionSource = await readFile(new URL("../src/action.jsx", import.meta.url), "utf8");
const shellSource = await readFile(new URL("../src/shell.jsx", import.meta.url), "utf8");
const signInHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const actionHtml = await readFile(
  new URL("../public/konto/passwort-festlegen/index.html", import.meta.url),
  "utf8"
);

test("routes a bare sign-in bookmark through the protected application", () => {
  assert.match(
    appSource,
    /window\.location\.pathname === "\/anmelden"[\s\S]*window\.location\.search === ""[\s\S]*window\.location\.hash === ""[\s\S]*window\.location\.replace\("\/start"\)/u
  );
});

test("offers only the approved Google and password sign-in operations", () => {
  assert.match(appSource, /signInWithPopup/u);
  assert.match(appSource, /signInWithEmailAndPassword/u);
  assert.doesNotMatch(
    appSource,
    /createUserWithEmailAndPassword|sendSignInLinkToEmail|sendPasswordResetEmail|linkWithCredential/u
  );
});

test("keeps public-facing copy and assets on the branded portal", () => {
  assert.match(shellSource, /\/public\/auth\/brand\/versorgungs-kompass\.svg/u);
  assert.match(actionSource, /Dein Zugang zum Versorgungs-Kompass/u);
  assert.doesNotMatch(
    `${appSource}\n${actionSource}`,
    /Steam Capsule|steam-capsule-341212|Firebase App/u
  );
});

test("scrubs the one-time action code before validation or remote work", () => {
  const scrubPosition = actionSource.indexOf(
    'history.replaceState({}, "", window.location.pathname)'
  );
  const configValidationPosition = actionSource.indexOf("assertProductionConfig(config)");
  const actionRenderPosition = actionSource.indexOf(
    "root.render(<PasswordActionApp config={config} actionHref={initialActionHref} />)"
  );
  assert.ok(scrubPosition >= 0, "Action-URL-Scrubbing fehlt.");
  assert.ok(
    scrubPosition < configValidationPosition
    && scrubPosition < actionRenderPosition,
    "Der Einmalcode muss vor Konfigurationsprüfung und Remote-Action aus der sichtbaren URL verschwinden."
  );
});

test("pins cache-busted portal assets without changing the eight-file surface", () => {
  assert.match(
    signInHtml,
    /href="\/public\/auth\/assets\/app\.css\?v=20260730-1"/u
  );
  assert.match(
    signInHtml,
    /src="\/public\/auth\/assets\/app\.js\?v=20260730-1"/u
  );
  assert.match(
    actionHtml,
    /href="\/public\/auth\/assets\/action\.css\?v=20260730-1"/u
  );
  assert.match(
    actionHtml,
    /src="\/public\/auth\/assets\/action\.js\?v=20260730-1"/u
  );
});
