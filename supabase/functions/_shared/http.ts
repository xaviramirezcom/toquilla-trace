// HTTP helpers for Edge Functions: CORS, JSON responses, error shape, request ids, auth.
// Env (injected by Supabase): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Optional: ALLOWED_ORIGINS, a comma-separated list of allowed browser origins
// (for example "https://toquilla-trace.vercel.app,http://localhost:3000"). Default "*" for the demo.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const REQUEST_ID_RE = /^req_[0-9a-f]{12}$/;

export function newRequestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return "req_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Header value when it is a valid id, else a fresh one (the bad value is returned for logging). */
export function getRequestId(req: Request): { request_id: string; client_request_id: string | null } {
  const h = req.headers.get("x-request-id");
  if (h && REQUEST_ID_RE.test(h)) return { request_id: h, client_request_id: null };
  return { request_id: newRequestId(), client_request_id: h ? h.slice(0, 40) : null };
}

function allowedOrigin(req: Request): string {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length === 0 || configured.includes("*")) return "*";
  const origin = req.headers.get("origin") ?? "";
  if (configured.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return configured[0];
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "x-request-id",
    Vary: "Origin",
  };
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  return null;
}

export function json(req: Request, body: unknown, status = 200, requestId?: string): Response {
  const headers: Record<string, string> = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  req: Request,
  status: number,
  code: string,
  message: string,
  requestId: string,
  extra: Record<string, unknown> = {},
): Response {
  return json(req, { error: { code, message, request_id: requestId }, ...extra }, status, requestId);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

let service: SupabaseClient | null = null;

/** Service role client (bypasses RLS). Only for logs, runs, rate-limit counts and the apply RPC. */
export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}

/** Anon client with no user session: sees exactly what a logged-out visitor sees. */
export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the signed-in user (RLS applies). */
export function userClient(jwt: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export interface AuthedUser {
  userId: string;
  email: string | null;
  role: "member" | "admin";
  workshopId: string | null;
  name: string | null;
  jwt: string;
  client: SupabaseClient;
}

/** Verifies the bearer JWT with the anon key, then loads the profile with the service role. */
export async function authenticate(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const jwt = m[1].trim();
  const client = userClient(jwt);
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: profile } = await serviceClient()
    .from("profiles")
    .select("role, workshop_id, name")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    role: profile?.role === "admin" ? "admin" : "member",
    workshopId: (profile?.workshop_id as string | null) ?? null,
    name: (profile?.name as string | null) ?? null,
    jwt,
    client,
  };
}
