const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
const headers = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

Deno.serve((request) => {
  if (!allowedOrigin || request.headers.get("origin") !== allowedOrigin) {
    return new Response(JSON.stringify({ error: "Not available" }), { status: 403, headers });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: "Legacy alias login is disabled" }), { status: 410, headers });
});
