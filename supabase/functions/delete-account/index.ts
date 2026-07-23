// PunchThis secure account deletion Edge Function.
// Deletes DB rows, Storage objects under the user prefix, and the Auth user.
// Service-role key stays in Supabase function secrets only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = user.id;
    const buckets = ["project-media", "report-files"] as const;

    for (const bucket of buckets) {
      const paths: string[] = [];
      const walk = async (prefix: string): Promise<void> => {
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data: entries, error } = await admin.storage.from(bucket).list(prefix, {
            limit: pageSize,
            offset,
          });
          if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
          for (const entry of entries ?? []) {
            const child = `${prefix}/${entry.name}`;
            if (entry.id === null) await walk(child);
            else paths.push(child);
          }
          if ((entries?.length ?? 0) < pageSize) break;
        }
      };
      await walk(userId);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Could not remove ${bucket} objects: ${error.message}`);
      }
    }

    // Every PunchThis customer row references auth.users with ON DELETE
    // CASCADE. Delete Auth only after Storage cleanup has fully succeeded.
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      return new Response(
        JSON.stringify({ error: "Auth user deletion failed", detail: deleteUserError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[delete-account]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
