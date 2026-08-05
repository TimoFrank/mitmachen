import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/app.jsx", import.meta.url), "utf8");
const actionSource = await readFile(new URL("../src/action.jsx", import.meta.url), "utf8");
const invitationSource = await readFile(
  new URL("../src/password-invitation.js", import.meta.url),
  "utf8"
);
const shellSource = await readFile(new URL("../src/shell.jsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const teamsPreviewSource = await readFile(
  new URL(
    "../../../dokumentation/assets/social/versorgungs-kompass-teams-preview.html",
    import.meta.url
  ),
  "utf8"
);
const signInHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const actionHtml = await readFile(
  new URL("../public/konto/passwort-festlegen/index.html", import.meta.url),
  "utf8"
);
const previewServerSource = await readFile(
  new URL("../scripts/serve.mjs", import.meta.url),
  "utf8"
);

test("sends only the canonical origin to the restricted Google APIs", () => {
  for (const portalHtml of [signInHtml, actionHtml]) {
    assert.match(portalHtml, /<meta name="referrer" content="strict-origin">/u);
    assert.doesNotMatch(portalHtml, /<meta name="referrer" content="no-referrer">/u);
  }
  assert.match(
    previewServerSource,
    /extension === "\.html" \? "strict-origin" : "no-referrer"/u
  );
});

test("routes a bare sign-in bookmark through the protected application", () => {
  assert.match(
    appSource,
    /window\.location\.pathname === "\/anmelden"[\s\S]*window\.location\.search === ""[\s\S]*window\.location\.hash === ""[\s\S]*window\.location\.replace\("\/start"\)/u
  );
});

test("offers only the approved Google and password sign-in operations", () => {
  assert.match(appSource, /signInWithPopup/u);
  assert.match(appSource, /signInWithEmailAndPassword/u);
  assert.match(appSource, /requestPasswordResetEmail/u);
  assert.match(appSource, /Wenn die Adresse zu einem freigeschalteten Konto gehört/u);
  assert.doesNotMatch(
    appSource,
    /createUserWithEmailAndPassword|sendSignInLinkToEmail|sendPasswordResetEmail|linkWithCredential/u
  );
  assert.doesNotMatch(appSource, /Kein Konto|Konto nicht gefunden|user-not-found/u);
});

test("keeps public-facing copy and assets on the branded portal", () => {
  const teamsLinkPreviewClaim =
    "Deine Plattform für Austausch, Wissen und Vernetzung.";
  assert.match(appSource, /title="Willkommen"/u);
  assert.doesNotMatch(appSource, /title="Willkommen im Versorgungs-Kompass"/u);
  assert.equal(
    appSource.split(`intro="${teamsLinkPreviewClaim}"`).length - 1,
    1
  );
  assert.ok(teamsPreviewSource.includes(teamsLinkPreviewClaim));
  assert.doesNotMatch(
    appSource,
    /Melde dich mit dem für #Mitmachen freigeschalteten Konto an\.|Wähle den Anmeldeweg, der für dich freigeschaltet wurde\.|Noch kein Zugang\?|Konten werden persönlich eingeladen|access-note/u
  );
  assert.doesNotMatch(stylesSource, /\.access-note/u);
  for (const retainedCopy of [
    "Anmelden",
    "Mit Google anmelden",
    "E-Mail-Adresse",
    "Passwort",
    "Passwort vergessen?",
    "Sicher anmelden"
  ]) {
    assert.ok(appSource.includes(retainedCopy));
  }
  assert.match(shellSource, /\/public\/auth\/brand\/versorgungs-kompass\.svg/u);
  assert.match(appSource, /public\/brand\/mitmachen\/lockup-horizontal-on-dark\.svg/u);
  assert.equal(
    (appSource.match(/variant="mitmachen"/gu) || []).length,
    2,
    "Anmeldung und Statusmeldungen müssen das #Mitmachen-Branding verwenden."
  );
  assert.equal(
    (appSource.match(/senderLogoSrc=\{mitmachenLockupUrl\}/gu) || []).length,
    2,
    "Anmeldung und Statusmeldungen müssen das kanonische Lockup erhalten."
  );
  assert.equal(
    (appSource.match(/compassBrands=\{COMPASS_BRANDS\}/gu) || []).length,
    2,
    "Anmeldung und Statusmeldungen müssen alle vier Kompass-Marken erhalten."
  );
  for (const asset of [
    "versorgungs-kompass/mark-on-dark.svg",
    "modules/stakeholder/mark-on-dark.svg",
    "modules/hospitation/mark-on-dark.svg",
    "modules/formate/mark-on-dark.svg"
  ]) {
    assert.match(appSource, new RegExp(asset.replaceAll(".", "\\."), "u"));
  }
  assert.match(shellSource, /portal-footer__sender">#Mitmachen</u);
  assert.doesNotMatch(shellSource, /ein Angebot der gematik/u);
  assert.doesNotMatch(shellSource, /Geschützter Arbeitsbereich|product-context/u);
  assert.doesNotMatch(appSource, /#Mitmachen · geschützter Zugang/u);
  assert.match(shellSource, /compass-brands/u);
  assert.match(signInHtml, /<title>Anmelden · Versorgungs-Kompass \| #Mitmachen<\/title>/u);
  assert.match(signInHtml, /shell shell--loading shell--mitmachen/u);
  assert.match(signInHtml, /loading-sender/u);
  assert.equal(
    actionSource.split(`intro="${teamsLinkPreviewClaim}"`).length - 1,
    1,
    "Die Passwortseite muss denselben Claim wie Anmeldung und Teams-Vorschau verwenden."
  );
  assert.match(actionSource, /title="Willkommen"/u);
  assert.equal(
    (actionSource.match(/variant="mitmachen"/gu) || []).length,
    2,
    "Passwortaktion und Konfigurationsfehler müssen das #Mitmachen-Branding verwenden."
  );
  assert.equal(
    (actionSource.match(/senderLogoSrc=\{mitmachenLockupUrl\}/gu) || []).length,
    2,
    "Alle Passwortzustände müssen das kanonische #Mitmachen-Lockup erhalten."
  );
  assert.equal(
    (actionSource.match(/compassBrands=\{COMPASS_BRANDS\}/gu) || []).length,
    2,
    "Alle Passwortzustände müssen die vier Kompass-Marken erhalten."
  );
  for (const asset of [
    "versorgungs-kompass/mark-on-dark.svg",
    "modules/stakeholder/mark-on-dark.svg",
    "modules/hospitation/mark-on-dark.svg",
    "modules/formate/mark-on-dark.svg"
  ]) {
    assert.match(actionSource, new RegExp(asset.replaceAll(".", "\\."), "u"));
  }
  for (const stateCopy of [
    "Dein sicherer Link wird geprüft",
    "Dieser Link ist nicht mehr gültig.",
    "Alles bereit.",
    "Neues Passwort festlegen",
    "Reset-Link nicht verfügbar"
  ]) {
    assert.ok(actionSource.includes(stateCopy));
  }
  assert.match(actionHtml, /<title>Passwort festlegen · #Mitmachen<\/title>/u);
  assert.match(actionHtml, /shell shell--loading shell--mitmachen/u);
  assert.match(actionHtml, /loading-sender/u);
  assert.match(
    stylesSource,
    /body\[data-identity-portal="signin"\],[\s\S]*body\[data-identity-portal="password"\]/u
  );
  assert.doesNotMatch(
    `${appSource}\n${actionSource}`,
    /Steam Capsule|steam-capsule-341212|Firebase App/u
  );
});

test("keeps the Firebase Auth iframe on the canonical first-party origin", () => {
  assert.match(signInHtml, /frame-src 'self'/u);
  assert.doesNotMatch(signInHtml, /firebaseapp\.com/u);
});

test("allows only the external script required by Firebase Google popup auth", () => {
  assert.match(
    signInHtml,
    /script-src 'self' https:\/\/apis\.google\.com;/u
  );
  assert.doesNotMatch(
    signInHtml,
    /script-src[^"]*(?:\*|'unsafe-inline'|'unsafe-eval')/u
  );
  assert.doesNotMatch(
    actionHtml,
    /apis\.google\.com/u,
    "Die Passwortseite darf den Google-Popup-Origin nicht freigeben."
  );
});

test("scrubs the one-time action code before validation or remote work", () => {
  const scrubPosition = actionSource.indexOf(
    'history.replaceState({}, "", window.location.pathname)'
  );
  const configValidationPosition = actionSource.indexOf("assertProductionConfig(config)");
  const actionRenderPosition = actionSource.indexOf(
    "root.render(<PasswordActionApp config={config} takeActionHref={takeActionHref} />)"
  );
  assert.ok(scrubPosition >= 0, "Action-URL-Scrubbing fehlt.");
  assert.ok(
    scrubPosition < configValidationPosition
    && scrubPosition < actionRenderPosition,
    "Der Einmalcode muss vor Konfigurationsprüfung und Remote-Action aus der sichtbaren URL verschwinden."
  );
});

test("keeps the 48-hour invitation in the fragment until an explicit password submit", () => {
  assert.match(invitationSource, /#\$\{INVITATION_FRAGMENT_KEY\}=\$\{token\}/u);
  assert.match(invitationSource, /credentials:\s*"omit"/u);
  assert.match(invitationSource, /referrerPolicy:\s*"no-referrer"/u);
  const submitStart = actionSource.indexOf("async function resetPassword(password)");
  const redemption = actionSource.indexOf(
    "await redeemPasswordInvitation(invitationToken)"
  );
  assert.ok(submitStart >= 0 && redemption > submitStart);
  assert.match(
    actionSource,
    /history\.replaceState\(\{\}, "", window\.location\.pathname\)[\s\S]*root\.render\(<PasswordActionApp/u,
    "Das Fragment muss vor dem Rendern des Einlösedialogs aus der sichtbaren URL entfernt sein."
  );
});

test("retains an invitation only in React state until password confirmation", () => {
  const submitStart = actionSource.indexOf("async function resetPassword(password)");
  const redemption = actionSource.indexOf(
    "await redeemPasswordInvitation(invitationToken)",
    submitStart
  );
  const persistAction = actionSource.indexOf("action = parseActionUrl", redemption);
  const verification = actionSource.indexOf(
    "await verifyPasswordResetCode(auth, action.oobCode)",
    redemption
  );
  const confirmation = actionSource.indexOf(
    "await confirmPasswordReset(auth, action.oobCode, password)",
    verification
  );
  const finalization = actionSource.indexOf(
    "await finalizePasswordInvitation(invitationToken)",
    confirmation
  );
  const releaseToken = actionSource.indexOf("invitationToken: null", finalization);
  assert.ok(
    submitStart >= 0
      && redemption > submitStart
      && persistAction > redemption
      && verification > persistAction,
    "Ein bereits erhaltener nativer Action-Code muss vor der Remote-Prüfung für einen Retry erhalten bleiben."
  );
  assert.doesNotMatch(
    actionSource.slice(persistAction, confirmation),
    /invitationToken:\s*null/u,
    "Das Einladungstoken darf vor dem Passwort-Confirm nicht aus dem React-Speicher entfernt werden."
  );
  assert.ok(
    confirmation > verification
      && finalization > confirmation
      && releaseToken > finalization,
    "Nach dem Passwort-Confirm muss die Einladung finalisiert und anschließend freigegeben werden."
  );
  assert.doesNotMatch(actionSource, /localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(
    actionSource,
    /^const initialActionHref\s*=|^let initialActionHref\s*=/mu,
    "Der vollständige Bearer-Link darf nicht in einer langlebigen Modulvariable verbleiben."
  );
  assert.match(
    actionSource,
    /let pendingActionHref = window\.location\.href[\s\S]*const takeActionHref = \(\) => \{[\s\S]*pendingActionHref = ""/u,
    "Der einmalige Reader muss seine einzige vollständige URL-Kopie beim Lesen leeren."
  );
  assert.match(
    actionSource,
    /status: "success",\s*action: null,\s*email: "",\s*invitationToken: null/u,
    "Nach bestätigtem Passwortsetzen müssen Token und OOB-Aktion aus dem React-State verschwinden."
  );
});

test("handles completed invitations and temporary broker failures explicitly", () => {
  assert.match(actionSource, /if \(redeemed\.completed\)[\s\S]*status: "completed"/u);
  assert.match(
    actionSource,
    /isTemporaryPasswordActionError\(submitError\)[\s\S]*technische Störung[\s\S]*versuche es erneut/u
  );
  assert.match(
    actionSource,
    /action = parseActionUrl\(redeemed\.actionUrl, config\);[\s\S]*catch \{[\s\S]*throw new TemporaryPasswordInvitationError\(\)/u,
    "Eine semantisch ungültige Broker-Action-URL ist ein temporärer Brokervertrag, kein Linkablauf."
  );
  assert.match(
    actionSource,
    /catch \(confirmError\)[\s\S]*await finalizePasswordInvitation\(invitationToken\)[\s\S]*if \(result\.finalized\)[\s\S]*status: "completed"[\s\S]*throw confirmError/u
  );
  assert.match(actionSource, /title="Das Passwort wurde bereits geändert\."/u);
  assert.match(actionSource, /Melde dich mit deinem aktuellen\s+Passwort an/u);
  assert.doesNotMatch(
    actionSource.match(/else if \(state\.status === "completed"\)[\s\S]*?\n  \} else \{/u)?.[0] || "",
    /Dein Passwort wurde gespeichert/u
  );
  assert.match(
    actionSource,
    /verifyPasswordResetCode\(auth, parsedAction\.oobCode\)[\s\S]*isTemporaryPasswordActionError\(error\)[\s\S]*status: temporary \? "temporary-error" : "error"/u,
    "Auch die initiale Prüfung nativer Reset-Links muss Firebase-Störungen als temporär behandeln."
  );
  assert.match(
    actionSource,
    /async function retryInitialVerification\(\)[\s\S]*verifyPasswordResetCode\(auth, action\.oobCode\)[\s\S]*Erneut versuchen/u
  );
});

test("pins cache-busted portal assets without changing the eight-file surface", () => {
  assert.match(
    signInHtml,
    /href="\/public\/auth\/assets\/app\.css\?v=20260731-1"/u
  );
  assert.match(
    signInHtml,
    /src="\/public\/auth\/assets\/app\.js\?v=20260731-1"/u
  );
  assert.match(
    actionHtml,
    /href="\/public\/auth\/assets\/action\.css\?v=20260804-1"/u
  );
  assert.match(
    actionHtml,
    /src="\/public\/auth\/assets\/action\.js\?v=20260804-1"/u
  );
});
