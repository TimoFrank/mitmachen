import { execFileSync } from "node:child_process";

export function googleApi(project, { gcloud = process.env.GCLOUD_BIN || "gcloud" } = {}) {
  let token;
  let validUntil = 0;
  return async function request(url, { method = "GET", body, allow404 = false } = {}) {
    if (Date.now() >= validUntil) {
      token = execFileSync(gcloud, ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      validUntil = Date.now() + 40 * 60_000;
    }
    const response = await fetch(url, {
      method, headers: { authorization: `Bearer ${token}`, "x-goog-user-project": project, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000)
    });
    const result = await response.json();
    if (response.status === 404 && allow404) return null;
    if (!response.ok) throw new Error(`Google API ${method} ${new URL(url).pathname}: ${response.status} ${result.error?.message || "Anfrage fehlgeschlagen"}`);
    return result;
  };
}

export function addBinding(policy, role, member, condition) {
  policy.version = 3;
  policy.bindings ||= [];
  let binding = policy.bindings.find((entry) => entry.role === role && JSON.stringify(entry.condition) === JSON.stringify(condition));
  if (!binding) { binding = { role, members: [], ...(condition ? { condition } : {}) }; policy.bindings.push(binding); }
  if (!binding.members.includes(member)) binding.members.push(member);
  return policy;
}
