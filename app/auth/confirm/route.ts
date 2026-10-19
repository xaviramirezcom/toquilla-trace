// Landing route for links in auth emails (sign-up confirmation and password reset).
// Supabase verifies the link, then sends the browser here with either:
// - ?code=...                 (PKCE, the default for @supabase/ssr): exchanged for a session. Works
//                             in the browser that asked for the email (the code verifier cookie
//                             lives there).
// - ?token_hash=...&type=...  (if the email templates are switched to token links): verified here.
// On success the session cookie is set and the user goes to `next` (safeNext: same-site paths only).
// On failure (expired, reused, or opened in another browser) they land on /login with a fixed notice.
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly string[] = ["signup", "recovery", "email", "invite", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeNext(params.get("next"));

  let ok = false;
  const supabase = await tryGetSupabaseServerClient();
  if (supabase) {
    try {
      if (code) {
        ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
      } else if (tokenHash && type && OTP_TYPES.includes(type)) {
        ok = !(await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash })).error;
      }
    } catch {
      ok = false;
    }
  }
  redirect(ok ? next : "/login?notice=link_invalid");
}
