/**
 * Live Storage RLS verification against PunchThis.
 * Reads expo/.env.local + optional SUPABASE_SERVICE_ROLE_KEY from env.
 * Never prints secrets. Creates two disposable users, tests cross-user isolation, cleans up.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const expoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(expoRoot, ".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const fileEnv = loadEnvFile(envPath);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || fileEnv.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fileEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error("FAIL: missing EXPO_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY");
  process.exit(1);
}
if (!service) {
  console.error("FAIL: set SUPABASE_SERVICE_ROLE_KEY in the environment for this script only (do not commit)");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const emailA = `punchthis-storage-a-${stamp}@example.com`;
const emailB = `punchthis-storage-b-${stamp}@example.com`;
const password = `Tmp-${randomUUID()}!aA1`;

const results = [];

async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

async function clientFor(email) {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

try {
  const userA = await makeUser(emailA);
  const userB = await makeUser(emailB);
  results.push("users_created");

  const clientA = await clientFor(emailA);
  const clientB = await clientFor(emailB);

  // Minimal valid JPEG (1x1) — matches project-media allowed_mime_types
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14,
    0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
  ]);
  const pathA = `${userA.id}/verify/probe.jpg`;

  const up = await clientA.storage.from("project-media").upload(pathA, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`A upload failed: ${up.error.message}`);
  results.push("a_upload_ok");

  const downA = await clientA.storage.from("project-media").download(pathA);
  if (downA.error) throw new Error(`A download failed: ${downA.error.message}`);
  results.push("a_download_ok");

  const downB = await clientB.storage.from("project-media").download(pathA);
  if (!downB.error) throw new Error("B unexpectedly downloaded A object");
  results.push("b_download_denied");

  const listB = await clientB.storage.from("project-media").list(userA.id);
  const listed = listB.data?.length ?? 0;
  if (listed > 0) throw new Error("B listed A prefix");
  results.push("b_list_denied");

  const anonClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const anonDown = await anonClient.storage.from("project-media").download(pathA);
  if (!anonDown.error) throw new Error("anon unexpectedly downloaded object");
  results.push("anon_download_denied");

  // Minimal PDF for report-files bucket
  const pdf = new TextEncoder().encode("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const reportPath = `${userA.id}/verify/probe.pdf`;
  const upPdf = await clientA.storage.from("report-files").upload(reportPath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upPdf.error) throw new Error(`A report upload failed: ${upPdf.error.message}`);
  const downPdfB = await clientB.storage.from("report-files").download(reportPath);
  if (!downPdfB.error) throw new Error("B unexpectedly downloaded A report");
  results.push("report_cross_user_denied");

  const del = await clientA.storage.from("project-media").remove([pathA]);
  if (del.error) throw new Error(`A delete failed: ${del.error.message}`);
  await clientA.storage.from("report-files").remove([reportPath]);
  results.push("a_delete_ok");

  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
  results.push("users_deleted");

  console.log("PASS", results.join(","));
} catch (e) {
  console.error("FAIL", e instanceof Error ? e.message : String(e));
  process.exit(1);
}
