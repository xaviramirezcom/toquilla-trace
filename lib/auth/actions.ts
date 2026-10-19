"use server";

// Auth server actions (spec 01 section 6.2). They run on the server with the cookie-based Supabase
// client, so the session cookie is set before the browser navigates. Logging (D6):
// - signed in: one app_logs row inserted as the user (RLS: user_id = auth.uid()),
// - signed out (failures, sign-up awaiting email confirmation): the log_public() RPC, with an email
//   hash and domain only, never the address.
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capPayload, redact, type LogAction, type LogLevel, type LogRow } from "@domain/log-format";
import {
  authCallbackUrl,
  emailDomain,
  mapAuthError,
  pendingSignupLogPayload,
  validateLogin,
  validateNewPassword,
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

/** Origin of the current request (the browser sends it with every server action). */
async function requestOrigin(): Promise<string | null> {
  try {
    return (await headers()).get("origin");
  } catch {
    return null;
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
      options: {
        data: { name: form.name.trim(), workshop_name: form.workshopName.trim(), city },
        // The confirmation link lands on /auth/confirm, which signs the user in.
        emailRedirectTo: authCallbackUrl(await requestOrigin(), "/workshop?welcome=1"),
      },
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
    // D11: email confirmation is on, so there is no session until the link is clicked. The
    // pending sign-up is logged anonymously through log_public (migration 7 allows ok: true).
    await logPublic(
      supabase,
      "auth.signup",
      "info",
      pendingSignupLogPayload({ email, city, requestId, durationMs: duration_ms }),
    );
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
    // The link signs the user in through /auth/confirm, then /reset sets the new password.
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: authCallbackUrl(await requestOrigin(), "/reset"),
    });
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

/** /reset: sets a new password for the signed-in user (the reset link signed them in). */
export async function updatePassword(password: string, confirm: string): Promise<AuthResult> {
  if (Object.keys(validateNewPassword(password, confirm)).length > 0) return { ok: false, code: "invalid_input" };
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return { ok: false, code: "network" };
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { ok: false, code: "invalid_credentials" };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, code: mapAuthError(error) };
  } catch (err) {
    return { ok: false, code: mapAuthError(err) };
  }
  return { ok: true, redirectTo: "/workshop" };
}
