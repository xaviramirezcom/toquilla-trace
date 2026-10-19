"use server";

// Auth server actions (spec 01 section 6.2). They run on the server with the cookie-based Supabase
// client, so the session cookie is set before the browser navigates. Logging (D6):
// - signed in: one app_logs row inserted as the user (RLS: user_id = auth.uid()),
// - signed out (failures, sign-up awaiting email confirmation): the log_public() RPC, with an email
//   hash and domain only, never the address.
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capPayload, redact, type LogAction, type LogLevel, type LogRow } from "@domain/log-format";
import {
  emailDomain,
  mapAuthError,
  validateLogin,
  validateSignup,
  type AuthErrorCode,
  type AuthResult,
  type LoginForm,
  type SignupForm,
} from "@/components/auth/rules";
import { newRequestId } from "@/lib/request-id";
import { safeNext } from "@/lib/safe-next";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

async function logSignedIn(
  supabase: SupabaseClient,
  row: { level: LogLevel; action: LogAction; userId: string; workshopId: string | null; requestId: string; durationMs?: number; payload: Record<string, unknown> },
): Promise<void> {
  try {
    const log: LogRow = {
      level: row.level,
      source: "web",
      action: row.action,
      message: null,
      user_id: row.userId,
      workshop_id: row.workshopId,
      request_id: row.requestId,
      hat_code: null,
      run_id: null,
      duration_ms: row.durationMs ?? null,
      payload: capPayload(redact(row.payload)),
      error: null,
      created_at: new Date().toISOString(),
    };
    await supabase.from("app_logs").insert(log);
  } catch {
    // Logging never breaks the auth flow.
  }
}

async function logPublic(
  supabase: SupabaseClient,
  action: LogAction,
  level: LogLevel,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.rpc("log_public", { action, level, payload: capPayload(redact(payload)) });
  } catch {
    // ignore
  }
}

async function workshopIdFor(supabase: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("profiles").select("workshop_id").eq("id", userId).maybeSingle();
    return (data as { workshop_id: string | null } | null)?.workshop_id ?? null;
  } catch {
    return null;
  }
}

export async function login(form: LoginForm): Promise<AuthResult> {
  if (Object.keys(validateLogin(form)).length > 0) return { ok: false, code: "invalid_input" };
  const requestId = newRequestId();
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return { ok: false, code: "network", requestId };
  const email = form.email.trim().toLowerCase();
  const t0 = Date.now();
  let code: AuthErrorCode | null = null;
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: form.password });
    if (error || !data.user) code = mapAuthError(error);
    else userId = data.user.id;
  } catch (err) {
    code = mapAuthError(err);
  }
  const duration_ms = Date.now() - t0;

  if (code || !userId) {
    const c = code ?? "unknown";
    await logPublic(supabase, "auth.login_failed", "warn", {
      error_code: c,
      reason: c === "unknown" ? "unknown" : undefined,
      email_domain: emailDomain(email),
      email_hash: emailHash(email),
      request_id: requestId,
      duration_ms,
    });
    return { ok: false, code: c, requestId };
  }

  const next = safeNext(form.next);
  const workshopId = await workshopIdFor(supabase, userId);
  await logSignedIn(supabase, {
    level: "info",
    action: "auth.login",
    userId,
    workshopId,
    requestId,
    durationMs: duration_ms,
    payload: { next },
  });
  return { ok: true, redirectTo: next, userId, workshopId };
}

export async function signup(form: SignupForm): Promise<AuthResult> {
  if (Object.keys(validateSignup(form)).length > 0) return { ok: false, code: "invalid_input" };
  const requestId = newRequestId();
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return { ok: false, code: "network", requestId };
  const email = form.email.trim().toLowerCase();
  const city = form.city;
  const t0 = Date.now();
  let code: AuthErrorCode | null = null;
  let userId: string | null = null;
  let hasSession = false;
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: { data: { name: form.name.trim(), workshop_name: form.workshopName.trim(), city } },
    });
    if (error) code = mapAuthError(error);
    // With email confirmation on, an existing address comes back as a user with no identities.
    else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) code = "email_taken";
    else if (!data.user) code = "unknown";
    else {
      userId = data.user.id;
      hasSession = data.session !== null;
    }
  } catch (err) {
    code = mapAuthError(err);
  }
  const duration_ms = Date.now() - t0;

  if (code || !userId) {
    await logPublic(supabase, "auth.signup", "warn", {
      ok: false,
      city,
      error_code: code ?? "unknown",
      email_domain: emailDomain(email),
      request_id: requestId,
      duration_ms,
    });
    return { ok: false, code: code ?? "unknown", requestId };
  }

  if (!hasSession) {
    // D11: email confirmation is on, so there is no session until the link is clicked. log_public
    // only accepts failed sign-ups, so this success is not logged; the first auth.login row follows.
    return { ok: true, redirectTo: "/login", needsConfirmation: true, userId };
  }

  const workshopId = await workshopIdFor(supabase, userId);
  await logSignedIn(supabase, {
    level: "info",
    action: "auth.signup",
    userId,
    workshopId,
    requestId,
    durationMs: duration_ms,
    payload: { ok: true, city },
  });
  return { ok: true, redirectTo: "/workshop?welcome=1", userId, workshopId };
}

/** "Send reset link". Always reports success unless rate limited or offline, so emails can't be probed. */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; code: AuthErrorCode }> {
  const clean = email.trim().toLowerCase();
  if (validateLogin({ email: clean, password: "x" }).email) return { ok: false, code: "invalid_input" };
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return { ok: false, code: "network" };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(clean);
    if (error) {
      const code = mapAuthError(error);
      if (code === "rate_limited" || code === "network") return { ok: false, code };
    }
  } catch (err) {
    const code = mapAuthError(err);
    if (code === "network") return { ok: false, code };
  }
  return { ok: true };
}

/**
 * Server-side logout: logs auth.logout while the session is still valid, signs out, goes to /login.
 * The shell (components/shell/AppShell.tsx) currently logs out in the browser instead; both work.
 */
export async function logout(): Promise<void> {
  const supabase = await tryGetSupabaseServerClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await logSignedIn(supabase, {
          level: "info",
          action: "auth.logout",
          userId: data.user.id,
          workshopId: await workshopIdFor(supabase, data.user.id),
          requestId: newRequestId(),
          payload: {},
        });
      }
      await supabase.auth.signOut();
    } catch {
      // Still leave the app; the proxy re-checks the session.
    }
  }
  redirect("/login");
}
