export function safeSessionReturnPath(candidate, origin) {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(candidate)) return "/start";
  try {
    const target = new URL(candidate, origin);
    const applicationPath = /^\/(?:start|versorgung|stakeholder|hospitationen|profil|personen|organisationen|formate|teams|onboarding)(?:\/|$)/u.test(target.pathname);
    return target.origin === origin && (applicationPath || target.pathname === "/mac-abgleich")
      ? `${target.pathname}${target.search}${target.hash}` : "/start";
  } catch {
    return "/start";
  }
}
