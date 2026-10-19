"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { login } from "@/lib/auth/actions";
import { log } from "@/lib/log";
import { AuthBanner, AuthSubmit, PasswordField } from "./AuthParts";
import { authErrorCopy, validateLogin, type AuthErrorCode } from "./rules";

const RATE_LIMIT_MS = 60_000;

export function LoginForm({ next, notice }: { next: string | null; notice?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<AuthErrorCode | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const errors = submitted ? validateLogin({ email, password }) : {};

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setTimeout(() => setLockedUntil(null), Math.max(0, lockedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [lockedUntil]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const v = validateLogin({ email, password });
    if (v.email) {
      document.getElementById("login-email")?.focus();
      return;
    }
    if (v.password) {
      passwordRef.current?.focus();
      return;
    }
    setLoading(true);
    setBanner(null);
    let res;
    try {
      res = await login({ email, password, next });
    } catch {
      res = { ok: false as const, code: "network" as const };
    }
    if (res.ok) {
      if (res.userId) log.setContext({ user_id: res.userId, workshop_id: res.workshopId ?? null });
      router.replace(res.redirectTo);
      router.refresh();
      return;
    }
    setLoading(false);
    setBanner(res.code);
    if (res.code === "invalid_credentials") {
      setPassword("");
      setSubmitted(false);
      requestAnimationFrame(() => passwordRef.current?.focus());
    }
    if (res.code === "rate_limited") setLockedUntil(Date.now() + RATE_LIMIT_MS);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {notice && !banner && <AuthBanner tone="ok">{notice}</AuthBanner>}
      {banner && (
        <AuthBanner
          action={
            banner === "network" || banner === "unknown" ? (
              <Button size="sm" variant="secondary" onClick={() => void submit()} icon="refresh">
                Retry
              </Button>
            ) : undefined
          }
        >
          {authErrorCopy(banner === "invalid_input" ? "unknown" : banner)}
        </AuthBanner>
      )}
      <Input
        id="login-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@workshop.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <PasswordField
        inputRef={passwordRef}
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot" className="text-[13px] font-medium text-accent underline-offset-2 hover:underline">
          Forgot password?
        </Link>
      </div>
      <AuthSubmit loading={loading} loadingLabel="Logging in..." disabled={lockedUntil !== null}>
        Log in
      </AuthSubmit>
      <p className="text-center text-[14px] text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-accent underline-offset-2 hover:underline">
          Create your workshop account
        </Link>
      </p>
    </form>
  );
}
