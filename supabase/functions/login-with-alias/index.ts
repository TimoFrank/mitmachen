import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const neutralError = "Invalid login credentials";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function normalizeIdentifier(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: neutralError }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ error: neutralError }, 500);

    const body = await req.json().catch(() => ({}));
    const identifier = normalizeIdentifier(body.identifier);
    const password = String(body.password || "");
    if (!identifier || !password) return jsonResponse({ error: neutralError }, 400);

    let email = identifier;
    if (!identifier.includes("@")) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: aliasRow, error: aliasError } = await adminClient
        .from("login_aliases")
        .select("email")
        .eq("alias", identifier)
        .eq("active", true)
        .maybeSingle();

      if (aliasError || !aliasRow?.email) return jsonResponse({ error: neutralError }, 400);
      email = String(aliasRow.email).trim().toLowerCase();
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return jsonResponse({ error: neutralError }, 400);

    return jsonResponse({
      session: data.session,
      user: data.user
    });
  } catch (_error) {
    return jsonResponse({ error: neutralError }, 400);
  }
});
