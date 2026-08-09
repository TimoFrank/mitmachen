import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const verifier = fileURLToPath(new URL("./verify_release_tag.mjs", import.meta.url));

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function requirePattern(source, pattern, message) {
  assert.match(source, pattern, message);
}

function forbidPattern(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Workflow-Abschnitt fehlt: ${start}`);
  return source.slice(startIndex, endIndex);
}

const weekly = read(".github/workflows/weekly-release.yml");
const hotfix = read(".github/workflows/hotfix-release.yml");
const publish = read(".github/workflows/publish-release.yml");
const pages = read(".github/workflows/deploy-pages.yml");
const preGematik = read(".github/workflows/deploy-pre-gematik.yml");
const tagVerifier = read("scripts/verify_release_tag.mjs");

requirePattern(weekly, /schedule:[\s\S]*cron:\s*"17 9 \* \* 5"[\s\S]*timezone:\s*Europe\/Berlin/u,
  "Weekly muss freitags in der vereinbarten Zeitzone geplant bleiben.");
requirePattern(weekly, /github\.event_name == 'schedule' && ' \(Friday\)'/u,
  "Der Run-Name muss den geplanten Freitagslauf als Planung kennzeichnen.");
requirePattern(weekly, /workflow_dispatch:[\s\S]*theme:[\s\S]*required:\s*false[\s\S]*default:\s*""[\s\S]*type:\s*string/u,
  "Ein manueller Weekly-Lauf darf optional ein Leitthema vorgeben.");
requirePattern(weekly, /--dry-run --release-type weekly/u,
  "Der Weekly-Plan muss den expliziten Release-Typ read-only verwenden.");
requirePattern(weekly, /--release-type weekly/u,
  "Die Weekly-Vorbereitung muss ihren Release-Typ explizit setzen.");
forbidPattern(weekly, /RELEASE_BUMP|\bpatch\b/u,
  "Der Weekly-Workflow darf keinen Hotfix-/Patch-Pfad mehr enthalten.");
forbidPattern(weekly, /PRODUCT_RELEASE_PUBLISH_ENABLED|WEEKLY_RELEASE_SCHEDULE_ENABLED/u,
  "Der reversible Draft-Plan braucht keinen externen Publish- oder Schedule-Schalter.");

const weeklyPlan = section(weekly, "  plan-release:", "  prepare-release-pr:");
requirePattern(weeklyPlan, /permissions:\s*\n\s+contents:\s*read/u,
  "Der Weekly-Plan braucht ein read-only Token.");
requirePattern(weeklyPlan, /persist-credentials:\s*false/u,
  "Der Weekly-Plan darf keine Git-Schreibcredentials behalten.");
forbidPattern(weeklyPlan, /contents:\s*write|pull-requests:\s*write|environment:\s*\n\s+name:\s*release-signing|secrets\./u,
  "Der Weekly-Plan darf weder Schreibrecht noch Signing-Secrets erhalten.");
const weeklyPrepare = weekly.slice(weekly.indexOf("  prepare-release-pr:"));
requirePattern(weeklyPrepare, /needs:\s*plan-release[\s\S]*should_release == 'true'[\s\S]*mode == 'prepare'/u,
  "Nur ein tatsaechlich neuer Wochenstand darf einen Release-PR vorbereiten.");
requirePattern(weeklyPrepare, /ref:\s*\$\{\{\s*needs\.plan-release\.outputs\.planning_head\s*\}\}[\s\S]*persist-credentials:\s*false/u,
  "Der Draft-PR muss exakt den schreibfrei geplanten Main-Commit verwenden.");
requirePattern(weeklyPrepare, /EXPECTED_BASELINE_TAG[\s\S]*latest_tag[\s\S]*rerun planning/u,
  "Eine zwischen Planung und Vorbereitung geaenderte Release-Basis muss abbrechen.");
requirePattern(weeklyPrepare, /git ls-remote origin refs\/heads\/main[\s\S]*main changed[\s\S]*rerun planning/u,
  "Auch ein weitergelaufenes main muss die Draft-Vorbereitung abbrechen.");
requirePattern(weeklyPrepare, /draft:\s*true/u,
  "Der Freitagslauf darf nur einen Draft-PR erzeugen.");
requirePattern(weeklyPrepare, /actions:\s*write[\s\S]*for workflow in repo-check\.yml target-readiness\.yml[\s\S]*gh workflow run[\s\S]*--ref "\$PR_BRANCH"/u,
  "Der per Standardtoken erzeugte Draft muss die bestehenden Pflichtchecks auf seinem Branch anstossen.");
forbidPattern(weeklyPrepare, /gh run watch|gh pr checks/u,
  "Der Planer darf nicht auf Checks warten oder daraus eine Merge-Entscheidung ableiten.");
requirePattern(weeklyPrepare, /branch:\s*timo\/release-\$\{\{\s*steps\.release\.outputs\.tag\s*\}\}/u,
  "Weekly-Release-Branches muessen der repositoryweiten timo/-Konvention folgen.");
forbidPattern(weekly, /signing-readiness:|environment:\s*\n\s+name:\s*release-signing|gh pr merge|pulls\/\$\{PR_NUMBER\}\/merge|uses:\s*\.\/\.github\/workflows\/publish-release\.yml|git tag|gh release create|deploy-pre-gematik/u,
  "Der Freitagslauf darf weder mergen, signieren, publizieren noch deployen.");

forbidPattern(hotfix, /\bschedule:/u, "Hotfixes duerfen keinen Zeitplan haben.");
requirePattern(hotfix, /workflow_dispatch:[\s\S]*publish:[\s\S]*default:\s*false[\s\S]*type:\s*boolean/u,
  "Ein manueller Hotfix muss standardmaessig read-only planen.");
requirePattern(hotfix, /--dry-run --release-type hotfix/u,
  "Der Hotfix-Plan muss den expliziten Release-Typ read-only verwenden.");
requirePattern(hotfix, /--release-type hotfix/u,
  "Die Hotfix-Vorbereitung muss ihren Release-Typ explizit setzen.");
for (const [input, environment] of [
  ["reason", "HOTFIX_REASON"],
  ["correction", "HOTFIX_CORRECTION"],
  ["risk", "HOTFIX_RISK"],
  ["verification", "HOTFIX_VERIFICATION"]
]) {
  requirePattern(hotfix, new RegExp(`${input}:[\\s\\S]*required:\\s*true[\\s\\S]*${environment}:\\s*\\$\\{\\{\\s*inputs\\.${input}\\s*\\}\\}`, "u"),
    `Der verpflichtende Hotfix-Kontext ${input} muss an den Planner uebergeben werden.`);
  assert.equal((hotfix.match(new RegExp(`${environment}:\\s*\\$\\{\\{\\s*inputs\\.${input}\\s*\\}\\}`, "gu")) || []).length, 2,
    `${environment} muss sowohl Preview als auch Prepare erreichen.`);
}
requirePattern(hotfix, /git diff --exit-code -- frontend\/app\/versorgungs-kompass\.js/u,
  "Ein Hotfix muss eine eigene In-App-Historie fail-closed ausschliessen.");
requirePattern(hotfix, /PRODUCT_RELEASE_PUBLISH_ENABLED/u,
  "Auch ein Hotfix muss am Publish-Kill-Switch haengen.");

const hotfixPlan = section(hotfix, "  plan-release:", "  signing-readiness:");
requirePattern(hotfixPlan, /permissions:\s*\n\s+contents:\s*read/u,
  "Der Hotfix-Plan braucht ein read-only Token.");
requirePattern(hotfixPlan, /persist-credentials:\s*false/u,
  "Der Hotfix-Plan darf keine Git-Schreibcredentials behalten.");
forbidPattern(hotfixPlan, /contents:\s*write|pull-requests:\s*write|environment:\s*\n\s+name:\s*release-signing|secrets\./u,
  "Der Hotfix-Plan darf weder Schreibrecht noch Signing-Secrets erhalten.");

for (const [workflow, label] of [[hotfix, "Hotfix"]]) {
  assert.equal((workflow.match(/published-release-metadata-json/gu) || []).length, 2,
    `${label}: Die publizierte Baseline muss vor Planung und erneut vor Prepare kryptographisch geprueft werden.`);
  requirePattern(workflow, /\.policy\.legacyTags \| index\(\$tag\) != null/u,
    `${label}: Nur explizit gelistete Legacy-Tags duerfen die Signaturausnahme verwenden.`);
  assert.equal((workflow.match(/\.isImmutable <<<"\$metadata"\)" == "true" \]\][\s\S]{0,160}\.policy\.legacyTags/gu) || []).length, 2,
    `${label}: Auch Legacy-Baselines muessen vor Plan und Prepare unveraenderlich sein.`);
  requirePattern(workflow, /isDraft[\s\S]*isPrerelease[\s\S]*isImmutable[\s\S]*isLatest[\s\S]*verify_release_tag\.mjs/u,
    `${label}: Neue Baselines brauchen den vollstaendigen immutable Prerelease- und Signaturvertrag.`);
  const readiness = section(workflow, "  signing-readiness:", "  prepare-release:");
  requirePattern(readiness, /needs:[\s\S]*- release-gate[\s\S]*- plan-release[\s\S]*if:\s*needs\.release-gate\.outputs\.may_publish == 'true' && needs\.plan-release\.outputs\.should_release == 'true'/u,
    `${label}: Signing-Readiness darf nur bei Publikationsfreigabe und echtem Release laufen.`);
  requirePattern(readiness, /environment:\s*\n\s+name:\s*release-signing/u,
    `${label}: Der Readiness-Probe muss im geschuetzten Signing-Environment laufen.`);
  requirePattern(readiness, /governance_ready:\s*\$\{\{\s*steps\.governance\.outputs\.ready\s*\}\}[\s\S]*RELEASE_GOVERNANCE_READ_TOKEN:\s*\$\{\{\s*secrets\.RELEASE_GOVERNANCE_READ_TOKEN\s*\}\}[\s\S]*branches\/main\/protection[\s\S]*required_status_checks\.strict == true/u,
    `${label}: Der codefreie Readiness-Job muss Branchschutz mit dem eng begrenzten Governance-Read-Token pruefen.`);
  requirePattern(readiness, /RELEASE_TAG_GPG_PRIVATE_KEY:\s*\$\{\{\s*secrets\.RELEASE_TAG_GPG_PRIVATE_KEY\s*\}\}/u,
    `${label}: Der Readiness-Probe muss den privaten Subkey tatsaechlich validieren.`);
  requirePattern(readiness, /with-subkey-fingerprint[\s\S]*--detach-sign[\s\S]*VALIDSIG/u,
    `${label}: Public/Private Signing-Subkey und Passphrase muessen kryptographisch bewiesen werden.`);
  requirePattern(readiness, /tolower\(\$12\) ~ \/s\/[\s\S]*count != 1[\s\S]*subkeys != 1 \|\| signing_subkeys != 1/u,
    `${label}: Genau ein oeffentlicher und genau ein operativer privater Signing-Subkey sind erlaubt.`);
  requirePattern(readiness, /expected_identity[\s\S]*RELEASE_TAG_SIGNER_NAME[\s\S]*RELEASE_TAG_SIGNER_EMAIL/u,
    `${label}: Die konfigurierte Signer-Identitaet muss zum Schluessel gehoeren.`);
  forbidPattern(readiness, /actions\/checkout|npm\s|node\s+scripts\//u,
    `${label}: Der isolierte Readiness-Job darf keinen Checkout oder Repository-Code ausfuehren.`);
  requirePattern(workflow, /prepare-release:[\s\S]*needs:[\s\S]*- signing-readiness/u,
    `${label}: Vor dem Merge muss Signing-Readiness erfolgreich sein.`);
  requirePattern(workflow, /plan-release:[\s\S]*outputs:[\s\S]*should_release:\s*\$\{\{\s*steps\.release\.outputs\.should_release\s*\}\}/u,
    `${label}: Der read-only Plan muss Noop erkennen, bevor Secrets freigegeben werden.`);
  requirePattern(workflow, /prepare-release:[\s\S]*if:\s*>-[\s\S]*always\(\)[\s\S]*needs\.signing-readiness\.result == 'success'/u,
    `${label}: Noop und fehlgeschlagene Readiness muessen ohne unbeabsichtigten Merge behandelt werden.`);
  requirePattern(workflow, /needs\.signing-readiness\.outputs\.governance_ready == 'true'/u,
    `${label}: Nur das boolesche Governance-Ergebnis darf Prepare und Merge freigeben.`);
  requirePattern(workflow, /gh pr checks "\$PR_NUMBER"[\s\S]*--required[\s\S]*--watch[\s\S]*required_checks[\s\S]*\.bucket == "pass"/u,
    `${label}: Alle Required Checks muessen fuer den exakten PR-Head erfolgreich sein.`);
  requirePattern(workflow, /for workflow in repo-check\.yml target-readiness\.yml[\s\S]*known_run_ids[\s\S]*headSha == \$sha[\s\S]*index\(\$id\)\) == null[\s\S]*gh run watch/u,
    `${label}: Beide Pflichtworkflows muessen explizit auf dem exakten Release-Head erfolgreich laufen.`);
  requirePattern(workflow, /branches\/main\/protection[\s\S]*required_status_checks\.strict == true[\s\S]*Minimal repository check[\s\S]*PoC-\/Target-Readiness/u,
    `${label}: Automatischer Merge bleibt bis zu strengem und vollstaendig provisioniertem Branchschutz gesperrt.`);
  requirePattern(workflow, /autoMergeRequest[\s\S]*--disable-auto[\s\S]*autoMergeRequest == null[\s\S]*pulls\/\$\{PR_NUMBER\}\/merge/u,
    `${label}: Auto-Merge-Restzustaende muessen entfernt und der Merge unmittelbar fail-closed ausgefuehrt werden.`);
  forbidPattern(workflow, /gh pr merge "\$PR_NUMBER"[\s\S]{0,300}--squash/u,
    `${label}: Der Release-Workflow darf keinen spaeteren Auto-Merge durch gh pr merge aktivieren.`);
  const prepare = section(workflow, "  prepare-release:", "  publish-release:");
  requirePattern(prepare, /Checkout main[\s\S]*persist-credentials:\s*false/u,
    `${label}: Der Repository-Code ausfuehrende Prepare-Job darf keine persistierten Git-Schreibcredentials erhalten.`);
  forbidPattern(prepare, /RELEASE_GOVERNANCE_READ_TOKEN|secrets\.RELEASE_GOVERNANCE_READ_TOKEN/u,
    `${label}: Der Governance-Token darf niemals in den Repository-Code ausfuehrenden Prepare-Job gelangen.`);
}
requirePattern(hotfix, /branch:\s*timo\/hotfix-\$\{\{\s*steps\.release\.outputs\.tag\s*\}\}/u,
  "Hotfix-Branches muessen der repositoryweiten timo/-Konvention folgen.");
for (const [workflow, label] of [[weekly, "Weekly"], [hotfix, "Hotfix"]]) {
  requirePattern(workflow, /add-paths:[\s\S]*deploy\/helm\/versorgungs-kompass\/Chart\.yaml[\s\S]*deploy\/helm\/versorgungs-kompass\/values\.yaml/u,
    `${label}: Release-PR muss beide zentral versionierten Helm-Dateien aufnehmen.`);
  requirePattern(workflow, /git diff --exit-code --[\s\S]*':!deploy\/helm\/versorgungs-kompass\/Chart\.yaml'[\s\S]*':!deploy\/helm\/versorgungs-kompass\/values\.yaml'/u,
    `${label}: Release-Scope muss ausschließlich die projizierten Helm-Dateien zulassen.`);
}

const planIndex = publish.indexOf("  plan-release:");
const preflightIndex = publish.indexOf("  preflight-release:");
const signIndex = publish.indexOf("  sign-tag:");
const verifyIndex = publish.indexOf("  verify-signed-tag:");
const buildIndex = publish.indexOf("  build-and-deploy-pages:");
const releaseIndex = publish.indexOf("  publish-github-release:");
assert.ok(planIndex >= 0 && planIndex < preflightIndex && preflightIndex < signIndex && signIndex < verifyIndex
  && verifyIndex < buildIndex && buildIndex < releaseIndex,
"Plan, vollstaendiger Preflight, Signatur, unabhaengige Verifikation, Pages und Release muessen strikt geordnet sein.");
const buildJobHeader = section(publish, "  build-and-deploy-pages:", "    steps:");
assert.equal((buildJobHeader.match(/^    name:/gmu) || []).length, 1,
  "Der Pages-Buildjob darf insbesondere keinen doppelten YAML-name-Schluessel enthalten.");

requirePattern(publish, /publish:[\s\S]*default:\s*false[\s\S]*type:\s*boolean/u,
  "Direktes Publish-Dispatch muss standardmaessig ein Plan bleiben.");
requirePattern(publish, /PRODUCT_RELEASE_PUBLISH_ENABLED/u,
  "Der Publish-Workflow muss seinen Kill-Switch selbst erneut pruefen.");
requirePattern(publish, /caller_holds_release_lock:[\s\S]*required:\s*true[\s\S]*inputs\.caller_holds_release_lock[\s\S]*product-release-reusable[\s\S]*product-release-/u,
  "Direkter Publish muss den repo-globalen Weekly-/Hotfix-Lock teilen, ohne den wiederverwendbaren Aufruf zu deadlocken.");
for (const [workflow, label] of [[hotfix, "Hotfix"]]) {
  requirePattern(workflow, /uses:\s*\.\/\.github\/workflows\/publish-release\.yml[\s\S]*caller_holds_release_lock:\s*true/u,
    `${label}: Der wiederverwendbare Publish-Aufruf muss seinen bereits gehaltenen repo-globalen Lock deklarieren.`);
}
forbidPattern(weekly, /uses:\s*\.\/\.github\/workflows\/publish-release\.yml/u,
  "Der Freitagsplan darf den manuellen Publish-Workflow nicht aufrufen.");
requirePattern(publish, /git show refs\/remotes\/origin\/main:config\/release\.json[\s\S]*semver_is_greater[\s\S]*releases\?per_page=100/u,
  "Publish muss aktuelle Main-Projektion und bereits publizierte hoehere Versionen als Downgrade-Sperre pruefen.");
assert.equal((publish.match(/repos\/\$\{GITHUB_REPOSITORY\}\/immutable-releases/gu) || []).length, 2,
  "Immutable Releases muessen unmittelbar vor Tag und erneut vor GitHub-Publikation aktiviert sein.");
assert.equal((publish.match(/RELEASE_GOVERNANCE_READ_TOKEN:\s*\$\{\{\s*secrets\.RELEASE_GOVERNANCE_READ_TOKEN\s*\}\}/gu) || []).length, 2,
  "Der eng begrenzte Administration-read Governance-Token darf nur fuer die beiden Immutability-Preflights injiziert werden.");
requirePattern(publish, /GH_TOKEN="\$RELEASE_GOVERNANCE_READ_TOKEN"[\s\S]*gh api "repos\/\$\{GITHUB_REPOSITORY\}\/immutable-releases"[\s\S]*\.enabled == true/u,
  "Der Governance-Token darf nur den read-only Immutability-Status fail-closed lesen.");
const tagGovernanceStep = section(
  publish,
  "      - name: Reconfirm immutable releases before tag mutation",
  "      - name: Create and push signed annotated tag"
);
requirePattern(tagGovernanceStep, /RELEASE_GOVERNANCE_READ_TOKEN[\s\S]*immutable-releases[\s\S]*\.enabled == true/u,
  "Der Governance-Token muss in einem eigenen read-only Schritt unmittelbar vor der Tag-Mutation bleiben.");
const tagMutationStep = section(
  publish,
  "      - name: Create and push signed annotated tag",
  "      - name: Verify selected remote tag object"
);
forbidPattern(tagMutationStep, /RELEASE_GOVERNANCE_READ_TOKEN/u,
  "Tag-Signatur und Push duerfen den Governance-Token nicht erben.");
const publicationGovernanceStep = section(
  publish,
  "      - name: Reconfirm immutable releases immediately before publication",
  "      - name: Publish verified prerelease draft"
);
requirePattern(publicationGovernanceStep, /RELEASE_GOVERNANCE_READ_TOKEN[\s\S]*immutable-releases[\s\S]*\.enabled == true/u,
  "Der Governance-Token muss in einem eigenen read-only Schritt unmittelbar vor der Publikation bleiben.");
const publicationMutationStep = section(
  publish,
  "      - name: Publish verified prerelease draft",
  "      - name: Re-download and verify immutable published assets"
);
forbidPattern(publicationMutationStep, /RELEASE_GOVERNANCE_READ_TOKEN/u,
  "Release-Publikation und Repository-Verifier duerfen den Governance-Token nicht erben.");
requirePattern(publicationMutationStep, /git fetch --no-tags origin main:refs\/remotes\/origin\/main[\s\S]*git merge-base --is-ancestor "\$RELEASE_SHA"[\s\S]*git show refs\/remotes\/origin\/main:config\/release\.json[\s\S]*semver_is_greater[\s\S]*releases\?per_page=100[\s\S]*select\(\.draft == false\)[\s\S]*verify_remote_tag before-publication[\s\S]*gh release edit/u,
  "Unmittelbar vor der Publikation muessen aktuelle Main-Version und alle bereits publizierten hoeheren SemVer erneut fail-closed geprueft werden.");
requirePattern(publish, /\[\[ "\$major" == "0" \]\]/u,
  "Releases ab v1.0.0 muessen bis zum separaten Ziel-Gate blockiert bleiben.");
assert.equal((publish.match(/--release-title "\$RELEASE_TITLE"/gu) || []).length, 2,
  "Plan und Preflight muessen den exakten Workflow-Titel an den Produkt-Release-Verifier binden.");
requirePattern(publish, /release-signing/u, "Der private Schluessel braucht ein eigenes Environment.");
requirePattern(publish, /RELEASE_TAG_GPG_PRIVATE_KEY:\s*\$\{\{\s*secrets\.RELEASE_TAG_GPG_PRIVATE_KEY\s*\}\}/u,
  "Der GPG-Subkey muss als Environment-Secret injiziert werden.");
requirePattern(publish, /RELEASE_TAG_GPG_PASSPHRASE:\s*\$\{\{\s*secrets\.RELEASE_TAG_GPG_PASSPHRASE\s*\}\}/u,
  "Die Passphrase muss getrennt und nur im Signierschritt injiziert werden.");
requirePattern(publish, /with-subkey-fingerprint[\s\S]*RELEASE_TAG_GPG_FINGERPRINT must identify the only dedicated Ed25519 signing subkey/u,
  "Der konfigurierte Fingerprint muss explizit zum dedizierten Signing-Subkey gehoeren.");
requirePattern(publish, /capabilities ~ \/c\/[\s\S]*capabilities !~ \/s\/[\s\S]*tolower\(\$12\) ~ \/s\/[\s\S]*\$4 == "22"[\s\S]*\$17\) == "ed25519"[\s\S]*count != 1/u,
  "Primary Key muss cert-only sein; der dedizierte Signing-Subkey muss Ed25519 verwenden.");
requirePattern(publish, /\$15 == "#"[\s\S]*primary private key must stay offline/iu,
  "Das Signing-Environment darf keinen nutzbaren Primary Private Key enthalten.");
requirePattern(publish, /subkeys != 1 \|\| signing_subkeys != 1[\s\S]*secret export must contain only/iu,
  "Der Secret-Export darf nur den offline Primary-Stub und genau einen Signing-Subkey enthalten.");
requirePattern(publish, /git tag --sign[\s\S]*--local-user/u,
  "Der Tag muss kryptographisch signiert und damit annotiert werden.");
requirePattern(publish, /git verify-tag --raw/u,
  "Der Signing-Job muss die Signatur vor dem Push lokal pruefen.");
requirePattern(publish, /git push origin "refs\/tags\/\$\{RELEASE_TAG\}:refs\/tags\/\$\{RELEASE_TAG\}"/u,
  "Der neue Tag muss als einzelner expliziter Ref gepusht werden.");
forbidPattern(publish, /git\s+(?:tag|push)[^\n]*--force|git\s+push[^\n]*\s-f(?:\s|$)/u,
  "Release-Tags duerfen niemals erzwungen oder verschoben werden.");

const signingJob = section(publish, "  sign-tag:", "  verify-signed-tag:");
forbidPattern(signingJob, /npm\s|node\s+scripts\//u,
  "Der Environment-Job mit privatem Schluessel darf keine Abhaengigkeiten oder Repository-Skripte ausfuehren.");
requirePattern(signingJob, /permissions:\s*\n\s+contents:\s*write/u,
  "Nur der Signing-Job braucht Tag-Schreibrecht.");
requirePattern(signingJob, /needs:[\s\S]*- preflight-release/u,
  "Ein Tag darf erst nach vollstaendig erfolgreichem Release-Preflight entstehen.");

const preflightJob = section(publish, "  preflight-release:", "  sign-tag:");
requirePattern(preflightJob, /npm run qa:full[\s\S]*npm audit[\s\S]*npm run build:pages[\s\S]*audit_public_assets\.mjs[\s\S]*verify_product_release\.mjs[\s\S]*package_product_release\.mjs[\s\S]*verify_release_artifacts\.mjs[\s\S]*upload-artifact/u,
  "Alle quellenbedingten QA-, Build-, Audit-, Packaging- und Artefakt-Gates muessen vor dem Tag laufen.");
requirePattern(preflightJob, /RELEASE_TITLE:\s*\$\{\{\s*inputs\.title\s*\}\}[\s\S]*--release-title "\$RELEASE_TITLE"/u,
  "Der Preflight muss den gebundenen Release-Titel auch tatsaechlich in seine Verifier-Umgebung injizieren.");
forbidPattern(preflightJob, /environment:\s*\n\s+name:\s*release-signing|secrets\./u,
  "Der vollstaendige Preflight darf keine Signing-Secrets erhalten.");

const independentVerify = section(publish, "  verify-signed-tag:", "  build-and-deploy-pages:");
forbidPattern(independentVerify, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|secrets\./u,
  "Die unabhaengige Tag-Verifikation darf keinen privaten Schluessel sehen.");
requirePattern(independentVerify, /verification\.verified == true and \.verification\.reason == "valid"/u,
  "GitHubs Tagobjekt-Verifikation muss fail-closed geprueft werden.");
requirePattern(independentVerify, /verify_release_tag\.mjs[\s\S]*--remote-tag-object-sha[\s\S]*--github-verification-json/u,
  "Tagobjekt, Commit, Fingerprint und GitHub-Status muessen gemeinsam verifiziert werden.");

requirePattern(publish, /build-and-deploy-pages:[\s\S]*needs:[\s\S]*- preflight-release[\s\S]*- verify-signed-tag/u,
  "Pages darf nur nach unabhaengiger Tag-Verifikation starten.");
requirePattern(publish, /known_run_ids[\s\S]*gh workflow run deploy-pages\.yml[\s\S]*-f revision="\$RELEASE_SHA"[\s\S]*-f release_tag="\$RELEASE_TAG"[\s\S]*-f artifact_digest="\$EXPECTED_ARTIFACT_DIGEST"[\s\S]*-f correlation_id="\$correlation_id"[\s\S]*index\(\$id\)\) == null/u,
  "Der verifizierte Tag muss zusammen mit dem exakten Commit an Pages uebergeben werden.");
requirePattern(pages, /--arg product_version "\$\{RELEASE_TAG#v\}"[\s\S]*\.productVersion == \$product_version[\s\S]*\.revision == \$revision[\s\S]*\.artifactDigest == \$digest/u,
  "Der Pages-Build und der Live-Smoke muessen Produktversion, Commit und Digest gemeinsam binden.");
requirePattern(publish, /package_product_release\.mjs[\s\S]*--output-dir dist\/release\/assets/u,
  "Die drei Pflichtartefakte muessen durch den zentralen Packager entstehen.");
requirePattern(publish, /verify_release_artifacts\.mjs/u,
  "Pflichtartefakte muessen lokal und nach Download geprueft werden.");
for (const asset of [
  "versorgungs-kompass-${RELEASE_TAG}-pages.zip",
  "build-manifest.json",
  "SHA256SUMS"
]) {
  assert.ok(publish.includes(asset), `Pflichtartefakt fehlt im Publish-Vertrag: ${asset}`);
}
requirePattern(publish, /gh release create[\s\S]*--draft[\s\S]*--prerelease[\s\S]*--latest=false[\s\S]*--verify-tag/u,
  "0.x muss als verifizierter Draft-Prerelease und niemals als Latest angelegt werden.");
requirePattern(publish, /gh release edit[\s\S]*--draft=false[\s\S]*--prerelease[\s\S]*--latest=false[\s\S]*--verify-tag/u,
  "Erst der vollstaendige Draft darf als Prerelease publiziert werden.");
requirePattern(publish, /gh release download[\s\S]*published-release-assets[\s\S]*verify_release_artifacts\.mjs/u,
  "Die immutable Publikation braucht einen erneuten Download- und Digest-Nachweis.");
requirePattern(publish, /attestation_ready=false[\s\S]*for attempt in \$\(seq 1 24\)[\s\S]*isImmutable[\s\S]*gh release verify[\s\S]*attestation_ready=true/u,
  "Immutability und Release-Attestierung muessen begrenzt bis zur Bereitschaft gepollt werden.");
requirePattern(publish, /published-release-attestations[\s\S]*gh release verify "\$RELEASE_TAG"[\s\S]*for asset_name[\s\S]*gh release verify-asset/u,
  "Release und alle erneut heruntergeladenen Pflichtassets brauchen GitHubs kryptographischen Attestierungsnachweis.");
requirePattern(publish, /predicate\.tag == \$tag[\s\S]*predicate\.repository == \$repository[\s\S]*pkg:github\/[\s\S]*digest\.sha1 == \$sha/u,
  "Die Release-Attestierung muss Tag, Repository und exakten Release-Commit binden.");
assert.ok((publish.match(/verify_release_tag\.mjs[\s\S]{0,500}--remote-tag-object-sha/gu) || []).length >= 3,
  "Das Remote-Tagobjekt muss vor Draft, vor Publikation und nach Attestierungsbereitschaft erneut geprueft werden.");
const publicationJob = section(publish, "  publish-github-release:", "      - name: Summarize published prerelease");
forbidPattern(publicationJob, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE/u,
  "Die wiederholte Publikationspruefung darf keinen privaten Signierschluessel sehen.");
requirePattern(publicationJob, /environment:\s*\n\s+name:\s*release-signing[\s\S]*secrets\.RELEASE_GOVERNANCE_READ_TOKEN/u,
  "Der Publikationsjob darf aus dem geschuetzten Environment ausschliesslich den read-only Governance-Token beziehen.");
assert.equal((publicationJob.match(/secrets\./gu) || []).length, 1,
  "Im Publikationsjob darf genau der Governance-Read-Token und kein weiteres Secret referenziert werden.");
requirePattern(publish, /existing-release-notes\.md[\s\S]*cmp --silent "\$RELEASE_NOTES"/u,
  "Resume darf auch die bereits gespeicherten Release Notes nicht still akzeptieren.");
requirePattern(publish, /partial-draft-assets[\s\S]*Unexpected asset in existing draft[\s\S]*cmp --silent[\s\S]*missing_assets[\s\S]*gh release upload/u,
  "Ein partieller Draft darf nur bytegleiche Pflichtassets behalten und ausschliesslich fehlende ergaenzen.");
requirePattern(publish, /completed_assets[\s\S]*"\$completed_assets" == "\$expected_assets"[\s\S]*Verify draft assets before publication/u,
  "Nach partiellem Resume muessen exakt drei Assets und der volle Inhaltsverifier folgen.");
assert.ok((publish.match(/PUBLISH_ENABLED:\s*\$\{\{\s*vars\.PRODUCT_RELEASE_PUBLISH_ENABLED\s*\}\}/gu) || []).length >= 4,
  "Der Kill-Switch muss vor Merge, Tag, Pages und GitHub-Publikation erneut gelten.");
forbidPattern(publish, /--clobber/u, "Resume darf Release-Assets nicht still ersetzen.");
forbidPattern(publish, /deploy-pre-gematik|target-readiness|poc-v/iu,
  "Ein Produkt-Release darf weder privates GKE noch den Zielpfad triggern.");
requirePattern(preGematik, /workflow_dispatch:[\s\S]*image_tag:[\s\S]*validate_only:[\s\S]*default:\s*true/u,
  "Das private GKE bleibt ein bewusst manueller, standardmaessig nur validierender Kanal.");
forbidPattern(preGematik, /\bschedule:/u,
  "Das private GKE darf nicht allein durch den Freitagszeitplan deployen.");

requirePattern(pages, /workflow_dispatch:[\s\S]*release_tag:/u,
  "Pages braucht einen expliziten Eingang fuer den verifizierten Produkt-Tag.");
forbidPattern(pages, /^\s{2}push:/mu,
  "Pages darf nicht mehr direkt aus einem ungetaggten main-Push deployen.");
requirePattern(pages, /revision:[\s\S]*required:\s*true[\s\S]*release_tag:[\s\S]*required:\s*true[\s\S]*artifact_digest:[\s\S]*required:\s*true[\s\S]*correlation_id:[\s\S]*required:\s*true/u,
  "Pages braucht zwingend exakten Release-Commit, signierten Tag, Preflight-Digest und eindeutige Korrelation.");
requirePattern(pages, /release-source-gate:[\s\S]*needs:\s*release-source-gate/u,
  "Der Pages-Build muss hinter dem Release-Quell-Gate liegen.");
requirePattern(pages, /git ls-remote --refs --tags[\s\S]*verify_release_tag\.mjs[\s\S]*--remote-tag-object-sha[\s\S]*--github-verification-json/u,
  "Ein manuelles Produkt-Deployment muss Remote-Tagobjekt und GitHub-Verifikation fail-closed pruefen.");
requirePattern(pages, /RELEASE_TAG_GPG_PUBLIC_KEY:\s*\$\{\{\s*vars\.RELEASE_TAG_GPG_PUBLIC_KEY\s*\}\}/u,
  "Pages darf nur den oeffentlichen Signierschluessel importieren.");
requirePattern(pages, /git show refs\/remotes\/origin\/main:config\/release\.json[\s\S]*semver_is_greater[\s\S]*releases\?per_page=100/u,
  "Auch ein direkter Pages-Dispatch muss aktuelle Main-Version und hoehere publizierte Releases gegen Downgrades pruefen.");
requirePattern(pages, /build-manifest\.json\?\$\{cache_buster\}[\s\S]*\.profile == "pages"[\s\S]*\.revision == \$revision[\s\S]*\.artifactDigest == \$digest/u,
  "Der Pages-Smoke muss den live ausgelieferten Commit und exakten Preflight-Artefaktdigest beweisen.");
forbidPattern(pages, /RELEASE_TAG_GPG_PRIVATE_KEY|RELEASE_TAG_GPG_PASSPHRASE|secrets\./u,
  "Pages darf keinen privaten Signierschluessel oder Signatur-Secret erhalten.");

requirePattern(tagVerifier, /cat-file", "-t"/u, "Der Tag-Verifier muss Lightweight-Tags ablehnen.");
requirePattern(tagVerifier, /verify-tag", "--raw"/u, "Der Tag-Verifier muss die eingebettete Signatur pruefen.");
requirePattern(tagVerifier, /VALIDSIG/u, "Der erwartete Fingerprint muss aus GnuPGs VALIDSIG-Status stammen.");
requirePattern(tagVerifier, /with-subkey-fingerprint/u,
  "Der Verifier muss den erwarteten Fingerprint als dedizierten Signing-Subkey nachweisen.");
requirePattern(tagVerifier, /canCertify[\s\S]*canSign[\s\S]*toLowerCase\(\)[\s\S]*signingSubkeys\.length !== 1[\s\S]*algorithm !== "22"[\s\S]*curve !== "ed25519"/u,
  "Auch der unabhaengige Verifier muss cert-only Primary und Ed25519-Subkey fail-closed pruefen.");
requirePattern(tagVerifier, /payload\.verification\?\.verified !== true/u,
  "Eine negative GitHub-Verifikation muss den Vertrag blockieren.");
requirePattern(tagVerifier, /isDraft !== false[\s\S]*isPrerelease !== true[\s\S]*isImmutable !== true[\s\S]*isLatest !== false/u,
  "Der Verifier muss auch den publizierten Baseline-Release-Status fail-closed pruefen.");

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

function runVerifier(repo, env, args, expectSuccess) {
  const result = spawnSync(process.execPath, [verifier, ...args], {
    cwd: repo,
    env,
    encoding: "utf8"
  });
  if (expectSuccess) {
    assert.equal(result.status, 0, `Verifier sollte erfolgreich sein:\n${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.verified, true);
    return payload;
  }
  assert.notEqual(result.status, 0, "Verifier sollte fail-closed abbrechen.");
  return null;
}

const releasePolicyPath = path.join(projectRoot, "config/release.json");
assert.equal(run("jq", ["--raw-output", "--arg", "tag", "v0.22.0",
  ".policy.legacyTags | index($tag) != null", releasePolicyPath]), "true",
"Die aktuelle v0.22.0-Baseline muss als explizite Legacy-Ausnahme planbar bleiben.");
assert.equal(run("jq", ["--raw-output", "--arg", "tag", "v0.23.0",
  ".policy.legacyTags | index($tag) != null", releasePolicyPath]), "false",
"Ab v0.23 darf kein Tag implizit in die Legacy-Ausnahme fallen.");

const shortTempRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const fixture = mkdtempSync(path.join(shortTempRoot, "vk-release-tag-"));
const authorityHome = path.join(fixture, "authority-gnupg");
const gnupgHome = path.join(fixture, "runtime-gnupg");
const repository = path.join(fixture, "repository");
const identity = "Release Contract Test <release-contract@example.invalid>";
const authorityEnv = { ...process.env, GNUPGHOME: authorityHome };
const env = { ...process.env, GNUPGHOME: gnupgHome };

try {
  mkdirSync(authorityHome, { mode: 0o700 });
  mkdirSync(gnupgHome, { mode: 0o700 });
  mkdirSync(repository);
  run("gpg", [
    "--batch",
    "--pinentry-mode", "loopback",
    "--passphrase", "",
    "--quick-generate-key", identity,
    "ed25519", "cert", "1d"
  ], { env: authorityEnv });
  const primaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys", identity
  ], { env: authorityEnv });
  const primaryFingerprint = primaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9];
  assert.match(primaryFingerprint || "", /^[0-9A-F]{40,64}$/u,
    "Der ephemere cert-only Primary Key braucht einen Fingerprint.");
  run("gpg", [
    "--batch",
    "--pinentry-mode", "loopback",
    "--passphrase", "",
    "--quick-add-key", primaryFingerprint,
    "ed25519", "sign", "1d"
  ], { env: authorityEnv });

  const keyListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys", identity
  ], { env: authorityEnv });
  const keyRecords = keyListing.split("\n").map((line) => line.split(":"));
  const subkeyIndex = keyRecords.findIndex((fields) => fields[0] === "ssb"
    && String(fields[11] || "").toLowerCase().includes("s"));
  const fingerprint = keyRecords.slice(subkeyIndex + 1)
    .find((fields) => fields[0] === "fpr")?.[9];
  assert.ok(subkeyIndex >= 0, "Der ephemere Testschluessel braucht einen dedizierten Signing-Subkey.");
  assert.match(fingerprint || "", /^[0-9A-F]{40,64}$/u,
    "Der Signing-Subkey braucht einen eigenen Fingerprint.");
  assert.notEqual(fingerprint, primaryFingerprint,
    "Primary-Key- und Signing-Subkey-Fingerprint muessen verschieden sein.");

  const publicKey = run("gpg", ["--batch", "--armor", "--export", primaryFingerprint], {
    env: authorityEnv
  });
  const privateSigningSubkey = run("gpg", [
    "--batch",
    "--pinentry-mode", "loopback",
    "--passphrase", "",
    "--armor",
    "--export-secret-subkeys", `${fingerprint}!`
  ], { env: authorityEnv });
  run("gpg", ["--batch", "--import"], { env, input: `${publicKey}\n` });
  run("gpg", ["--batch", "--import"], { env, input: `${privateSigningSubkey}\n` });

  const runtimeSecretListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys", identity
  ], { env });
  const runtimeSecretRecords = runtimeSecretListing.split("\n").map((line) => line.split(":"));
  const runtimePrimary = runtimeSecretRecords.find((fields) => fields[0] === "sec");
  const runtimeSubkeys = runtimeSecretRecords.filter((fields) => fields[0] === "ssb");
  const runtimeSigningSubkey = runtimeSubkeys[0];
  assert.equal(runtimeSubkeys.length, 1,
    "Der operative Secret-Export darf genau einen Subkey enthalten.");
  assert.equal(runtimePrimary?.[14], "#",
    "Der Primary Private Key muss im operativen Signing-Keyring offline bleiben.");
  assert.ok(String(runtimePrimary?.[11] || "").includes("c")
    && !String(runtimePrimary?.[11] || "").includes("s")
    && String(runtimePrimary?.[11] || "").includes("S"),
  "GnuPGs grosses S am cert-only Primary ist die aggregierte Subkey-Faehigkeit, kein direkter Primary-Usage-Flag.");
  assert.equal(runtimeSigningSubkey?.[3], "22",
    "Der operative Signing-Subkey muss EdDSA verwenden.");
  assert.equal(String(runtimeSigningSubkey?.[16] || "").toLowerCase(), "ed25519",
    "Der operative Signing-Subkey muss explizit Ed25519 verwenden.");
  assert.ok(String(runtimeSigningSubkey?.[11] || "").toLowerCase().includes("s"),
    "Der operative Subkey braucht die direkte Signing-Capability.");
  assert.notEqual(runtimeSigningSubkey?.[14], "#",
    "Der operative Signing-Subkey muss als einziges privates Schluesselmaterial nutzbar sein.");

  run("git", ["init", "-b", "main"], { cwd: repository });
  run("git", ["config", "user.name", "Release Contract Test"], { cwd: repository });
  run("git", ["config", "user.email", "release-contract@example.invalid"], { cwd: repository });
  run("git", ["config", "user.signingkey", `${fingerprint}!`], { cwd: repository });
  run("git", ["config", "gpg.format", "openpgp"], { cwd: repository });

  writeFileSync(path.join(repository, "source.txt"), "first\n", "utf8");
  run("git", ["add", "source.txt"], { cwd: repository });
  run("git", ["commit", "-m", "First release source"], { cwd: repository, env });
  const firstCommit = run("git", ["rev-parse", "HEAD"], { cwd: repository });
  const title = "0.23.0-0 Release Candidate";
  run("git", ["tag", "--sign", "--local-user", `${fingerprint}!`, "-m", title, "v0.23.0", firstCommit], {
    cwd: repository,
    env
  });
  const tagObjectSha = run("git", ["rev-parse", "v0.23.0^{tag}"], { cwd: repository });
  const githubPayloadPath = path.join(fixture, "github-verification.json");
  writeFileSync(githubPayloadPath, `${JSON.stringify({
    tag: "v0.23.0",
    sha: tagObjectSha,
    object: { type: "commit", sha: firstCommit },
    verification: {
      verified: true,
      reason: "valid",
      signature: "present",
      verified_at: "2026-08-04T12:00:00Z"
    }
  })}\n`, "utf8");
  const publishedMetadataPath = path.join(fixture, "published-release-metadata.json");
  const validPublishedMetadata = {
    tagName: "v0.23.0",
    name: title,
    isDraft: false,
    isPrerelease: true,
    isImmutable: true,
    isLatest: false
  };
  writeFileSync(publishedMetadataPath, `${JSON.stringify(validPublishedMetadata)}\n`, "utf8");

  runVerifier(repository, env, [
    "--tag", "v0.23.0",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint,
    "--expected-title", title,
    "--remote-tag-object-sha", tagObjectSha,
    "--github-verification-json", githubPayloadPath,
    "--published-release-metadata-json", publishedMetadataPath
  ], true);

  for (const [field, invalidValue] of [
    ["isDraft", true],
    ["isPrerelease", false],
    ["isImmutable", false],
    ["isLatest", true]
  ]) {
    const invalidMetadataPath = path.join(fixture, `published-release-${field}.json`);
    writeFileSync(invalidMetadataPath, `${JSON.stringify({
      ...validPublishedMetadata,
      [field]: invalidValue
    })}\n`, "utf8");
    runVerifier(repository, env, [
      "--tag", "v0.23.0",
      "--commit-sha", firstCommit,
      "--fingerprint", fingerprint,
      "--expected-title", title,
      "--github-verification-json", githubPayloadPath,
      "--published-release-metadata-json", invalidMetadataPath
    ], false);
  }

  run("git", ["tag", "v0.23.1", firstCommit], { cwd: repository });
  runVerifier(repository, env, [
    "--tag", "v0.23.1",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint
  ], false);

  run("git", ["tag", "--annotate", "-m", "Unsigned", "v0.23.2", firstCommit], { cwd: repository });
  runVerifier(repository, env, [
    "--tag", "v0.23.2",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint
  ], false);

  writeFileSync(path.join(repository, "source.txt"), "second\n", "utf8");
  run("git", ["add", "source.txt"], { cwd: repository });
  run("git", ["commit", "-m", "Second release source"], { cwd: repository, env });
  const secondCommit = run("git", ["rev-parse", "HEAD"], { cwd: repository });
  run("git", ["tag", "--sign", "--local-user", `${fingerprint}!`, "-m", "Wrong target", "v0.23.3", secondCommit], {
    cwd: repository,
    env
  });
  runVerifier(repository, env, [
    "--tag", "v0.23.3",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint
  ], false);

  runVerifier(repository, env, [
    "--tag", "v0.23.0",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint,
    "--remote-tag-object-sha", secondCommit
  ], false);

  runVerifier(repository, env, [
    "--tag", "v0.23.0",
    "--commit-sha", firstCommit,
    "--fingerprint", "A".repeat(40)
  ], false);

  runVerifier(repository, env, [
    "--tag", "v0.23.0",
    "--commit-sha", firstCommit,
    "--fingerprint", primaryFingerprint
  ], false);

  const rejectedGithubPayload = path.join(fixture, "github-rejected.json");
  writeFileSync(rejectedGithubPayload, `${JSON.stringify({
    tag: "v0.23.0",
    sha: tagObjectSha,
    object: { type: "commit", sha: firstCommit },
    verification: { verified: false, reason: "unsigned", signature: null, verified_at: null }
  })}\n`, "utf8");
  runVerifier(repository, env, [
    "--tag", "v0.23.0",
    "--commit-sha", firstCommit,
    "--fingerprint", fingerprint,
    "--github-verification-json", rejectedGithubPayload
  ], false);

  const signablePrimaryHome = path.join(fixture, "signable-primary-gnupg");
  mkdirSync(signablePrimaryHome, { mode: 0o700 });
  const signablePrimaryEnv = { ...process.env, GNUPGHOME: signablePrimaryHome };
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-generate-key", "Rejected Primary <rejected-primary@example.invalid>",
    "ed25519", "cert,sign", "1d"
  ], { env: signablePrimaryEnv });
  const signablePrimaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: signablePrimaryEnv });
  const signablePrimaryFingerprint = signablePrimaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9];
  run("git", [
    "tag", "--sign", "--local-user", `${signablePrimaryFingerprint}!`,
    "-m", "Rejected sign-capable primary", "v0.23.4", firstCommit
  ], { cwd: repository, env: signablePrimaryEnv });
  const signablePrimaryResult = spawnSync(process.execPath, [
    verifier,
    "--tag", "v0.23.4",
    "--commit-sha", firstCommit,
    "--fingerprint", signablePrimaryFingerprint
  ], { cwd: repository, env: signablePrimaryEnv, encoding: "utf8" });
  assert.notEqual(signablePrimaryResult.status, 0,
    "Ein signierfaehiger Primary Key muss fail-closed abgelehnt werden.");
  assert.match(signablePrimaryResult.stderr, /cert-only/u,
    "Der Negativtest muss gezielt am signierfaehigen Primary Key scheitern.");

  const wrongAlgorithmHome = path.join(fixture, "wrong-algorithm-gnupg");
  mkdirSync(wrongAlgorithmHome, { mode: 0o700 });
  const wrongAlgorithmEnv = { ...process.env, GNUPGHOME: wrongAlgorithmHome };
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-generate-key", "Rejected RSA Subkey <rejected-rsa@example.invalid>",
    "ed25519", "cert", "1d"
  ], { env: wrongAlgorithmEnv });
  const wrongPrimaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: wrongAlgorithmEnv });
  const wrongPrimaryFingerprint = wrongPrimaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9];
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-add-key", wrongPrimaryFingerprint, "rsa2048", "sign", "1d"
  ], { env: wrongAlgorithmEnv });
  const wrongSubkeyListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: wrongAlgorithmEnv });
  const wrongSubkeyRecords = wrongSubkeyListing.split("\n").map((line) => line.split(":"));
  const wrongSubkeyIndex = wrongSubkeyRecords.findIndex((fields) => fields[0] === "ssb"
    && String(fields[11] || "").includes("s"));
  const wrongSubkeyFingerprint = wrongSubkeyRecords.slice(wrongSubkeyIndex + 1)
    .find((fields) => fields[0] === "fpr")?.[9];
  run("git", [
    "tag", "--sign", "--local-user", `${wrongSubkeyFingerprint}!`,
    "-m", "Rejected non-Ed25519 subkey", "v0.23.5", firstCommit
  ], { cwd: repository, env: wrongAlgorithmEnv });
  const wrongAlgorithmResult = spawnSync(process.execPath, [
    verifier,
    "--tag", "v0.23.5",
    "--commit-sha", firstCommit,
    "--fingerprint", wrongSubkeyFingerprint
  ], { cwd: repository, env: wrongAlgorithmEnv, encoding: "utf8" });
  assert.notEqual(wrongAlgorithmResult.status, 0,
    "Ein nicht-Ed25519 Signing-Subkey muss fail-closed abgelehnt werden.");
  assert.match(wrongAlgorithmResult.stderr, /Ed25519-Signing-Subkey/u,
    "Der Algorithmus-Negativtest muss gezielt an Ed25519 scheitern.");

  const multipleSubkeysHome = path.join(fixture, "multiple-signing-subkeys-gnupg");
  mkdirSync(multipleSubkeysHome, { mode: 0o700 });
  const multipleSubkeysEnv = { ...process.env, GNUPGHOME: multipleSubkeysHome };
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-generate-key", "Rejected Multiple Subkeys <rejected-multiple@example.invalid>",
    "ed25519", "cert", "1d"
  ], { env: multipleSubkeysEnv });
  const multiplePrimaryListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: multipleSubkeysEnv });
  const multiplePrimaryFingerprint = multiplePrimaryListing.split("\n")
    .find((line) => line.startsWith("fpr:"))?.split(":")[9];
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-add-key", multiplePrimaryFingerprint, "ed25519", "sign", "1d"
  ], { env: multipleSubkeysEnv });
  const firstSubkeyListing = run("gpg", [
    "--batch", "--with-colons", "--with-subkey-fingerprint", "--list-secret-keys"
  ], { env: multipleSubkeysEnv });
  const firstSubkeyRecords = firstSubkeyListing.split("\n").map((line) => line.split(":"));
  const firstSubkeyIndex = firstSubkeyRecords.findIndex((fields) => fields[0] === "ssb"
    && String(fields[11] || "").toLowerCase().includes("s"));
  const firstSubkeyFingerprint = firstSubkeyRecords.slice(firstSubkeyIndex + 1)
    .find((fields) => fields[0] === "fpr")?.[9];
  run("gpg", [
    "--batch", "--pinentry-mode", "loopback", "--passphrase", "",
    "--quick-add-key", multiplePrimaryFingerprint, "ed25519", "sign", "1d"
  ], { env: multipleSubkeysEnv });
  run("git", [
    "tag", "--sign", "--local-user", `${firstSubkeyFingerprint}!`,
    "-m", "Rejected multiple signing subkeys", "v0.23.6", firstCommit
  ], { cwd: repository, env: multipleSubkeysEnv });
  const multipleSubkeysResult = spawnSync(process.execPath, [
    verifier,
    "--tag", "v0.23.6",
    "--commit-sha", firstCommit,
    "--fingerprint", firstSubkeyFingerprint
  ], { cwd: repository, env: multipleSubkeysEnv, encoding: "utf8" });
  assert.notEqual(multipleSubkeysResult.status, 0,
    "Mehr als ein signierfaehiger Subkey muss fail-closed abgelehnt werden.");
  assert.match(multipleSubkeysResult.stderr, /genau einen dedizierten Ed25519-Signing-Subkey/u,
    "Der Mehrfach-Subkey-Negativtest muss am Eindeutigkeitsvertrag scheitern.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log("Release workflow and signed-tag contracts passed.");
