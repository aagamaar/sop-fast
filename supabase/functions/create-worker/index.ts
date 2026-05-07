// =====================================================================
// create-worker Edge Function
// =====================================================================
// Atomically creates a worker: auth user + profile row.
// Called only by authenticated managers.
// Uses the service role key, which never leaves the server.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { name, phone, password, workerRole } = await req.json();

    if (!name || !phone || !password) {
      return json({ error: "name, phone, and password are required" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "password must be at least 6 characters" }, 400);
    }

    // Get the caller's auth token from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    // ----- Verify the caller is an authenticated manager -----
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Invalid auth token" }, 401);
    }

    const { data: callerProfile, error: profileErr } = await userClient
      .from("profiles")
      .select("id, restaurant_id, role")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || !callerProfile) {
      return json({ error: "Caller has no profile" }, 403);
    }
    if (callerProfile.role !== "manager") {
      return json({ error: "Only managers can create workers" }, 403);
    }

    // ----- Now use the service role to atomically create the worker -----
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const cleanPhone = String(phone).replace(/\D/g, "");
    const email = `${cleanPhone}@sopfast.app`;

    // 1. Create the auth user (admin API — does NOT sign anyone in)
    const { data: authData, error: authErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authErr) {
      return json({ error: authErr.message }, 400);
    }
    if (!authData.user) {
      return json({ error: "Auth user creation returned no user" }, 500);
    }

    const newUserId = authData.user.id;

    // 2. Insert the profile row
    const { error: insertErr } = await adminClient.from("profiles").insert({
      id: newUserId,
      restaurant_id: callerProfile.restaurant_id,
      role: "worker",
      full_name: name,
      phone: cleanPhone,
      worker_role: workerRole || null,
    });

    if (insertErr) {
      // Roll back the orphaned auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      return json(
        { error: `Profile insert failed: ${insertErr.message}` },
        500,
      );
    }

    return json({ workerId: newUserId }, 200);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
