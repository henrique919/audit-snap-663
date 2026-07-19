// PunchThis secure account deletion Edge Function.
// Deletes DB rows, Storage objects under the user prefix, and the Auth user.
// Service-role key stays in Supabase function secrets only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
      const { data: listed, error: listError } = await admin.storage.from(bucket).list(userId, {
        limit: 1000,
      });
      if (listError) {
        console.error(`[delete-account] list ${bucket}`, listError.message);
      } else if (listed && listed.length > 0) {
        const paths: string[] = [];
        const walk = async (prefix: string) => {
          const { data: entries } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
          if (!entries) return;
          for (const entry of entries) {
            const child = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.id === null) {
              await walk(child);
            } else {
              paths.push(child);
            }
          }
        };
        await walk(userId);
        for (let i = 0; i < paths.length; i += 100) {
          const chunk = paths.slice(i, i + 100);
          const { error: removeError } = await admin.storage.from(bucket).remove(chunk);
          if (removeError) {
            console.error(`[delete-account] remove ${bucket}`, removeError.message);
          }
        }
      }
    }

    const tables = [
      "report_exports",
      "annotation_records",
      "photo_assets",
      "issues",
      "audits",
      "assignees",
      "project_locations",
      "projects",
      "user_settings",
      "sync_checkpoints",
      "profiles",
    ] as const;

    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq(
        table === "profiles" ? "id" : "owner_id",
        userId,
      );
      if (error) {
        console.error(`[delete-account] delete ${table}`, error.message);
      }
    }

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
