// Pure auth helpers (spec 01 section 6.2): validation, Supabase error mapping and banner copy.
// Shared by the server actions and the client forms, unit tested in tests/auth.test.ts.

export const CITIES = ["Cuenca", "Montecristi", "Sígsig", "Pile", "Other"] as const;
export type City = (typeof CITIES)[number];

export type AuthErrorCode =
  | "invalid_credentials"
  | "rate_limited"
  | "network"
  | "email_taken"
  | "weak_password"
  | "invalid_input"
  | "unknown";

export type AuthResult =
  | { ok: true; redirectTo: string; userId?: string; workshopId?: string | null; needsConfirmation?: boolean }
  | { ok: false; code: AuthErrorCode; requestId?: string };

export interface LoginForm {
  email: string;
  password: string;
  next?: string | null;
}

export interface SignupForm {
  name: string;
  workshopName: string;
  city: string;
  email: string;
  password: string;
  agreed: boolean;
}

export const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function emailError(email: string): string | undefined {
  const e = email.trim();
  if (!e) return "Enter your email.";
  if (!EMAIL_RE.test(e)) return "That doesn't look like an email.";
  return undefined;
}

export function validateLogin(f: Pick<LoginForm, "email" | "password">): Partial<Record<"email" | "password", string>> {
  const errors: Partial<Record<"email" | "password", string>> = {};
  const email = emailError(f.email);
  if (email) errors.email = email;
  if (!f.password) errors.password = "Enter your password.";
  return errors;
}

export type SignupField = "name" | "workshopName" | "city" | "email" | "password" | "agreed";

export function validateSignup(f: SignupForm): Partial<Record<SignupField, string>> {
  const errors: Partial<Record<SignupField, string>> = {};
  const name = f.name.trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > 60) errors.name = "Use 60 characters or fewer.";
  const ws = f.workshopName.trim();
  if (!ws) errors.workshopName = "Enter your workshop's name.";
  else if (ws.length > 80) errors.workshopName = "Use 80 characters or fewer.";
  if (!(CITIES as readonly string[]).includes(f.city)) errors.city = "Pick a city.";
  const email = emailError(f.email);
  if (email) errors.email = email;
  if (f.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (!f.agreed) errors.agreed = "Agree to the terms to continue.";
  return errors;
}

/** Maps a Supabase Auth error (or a thrown fetch error) to one of our codes. */
export function mapAuthError(err: unknown): AuthErrorCode {
  if (err instanceof TypeError) return "network";
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  const msg = (e.message ?? "").toLowerCase();
  if (e.code === "invalid_credentials" || (e.status === 400 && msg.includes("invalid login credentials"))) {
    return "invalid_credentials";
  }
  if (e.status === 429 || e.code === "over_request_rate_limit" || e.code === "over_email_send_rate_limit") {
    return "rate_limited";
  }
  if (e.code === "user_already_exists" || e.code === "email_exists" || msg.includes("user already registered")) {
    return "email_taken";
  }
  if (e.code === "weak_password") return "weak_password";
  if (e.status === 0 || msg.includes("fetch failed") || e.name === "AuthRetryableFetchError") return "network";
  return "unknown";
}

export function authErrorCopy(code: AuthErrorCode): string {
  switch (code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "rate_limited":
      return "Too many attempts. Try again in 1 minute.";
    case "email_taken":
      return "This email already has an account.";
    case "weak_password":
      return "That password is too weak. Try a longer one.";
    case "invalid_input":
      return "Check the highlighted fields.";
    case "network":
    case "unknown":
      return "Couldn't reach the server. Check your connection and try again.";
  }
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

/**
 * log_public payload for a sign-up that is waiting for email confirmation (no session yet).
 * Domain only, never the address (D6).
 */
export function pendingSignupLogPayload(input: {
  email: string;
  city: string;
  requestId: string;
  durationMs: number;
}): Record<string, unknown> {
  return {
    ok: true,
    pending_confirmation: true,
    city: input.city,
    email_domain: emailDomain(input.email),
    request_id: input.requestId,
    duration_ms: input.durationMs,
  };
}
