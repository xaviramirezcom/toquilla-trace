"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/Field";
import { requestPasswordReset } from "@/lib/auth/actions";
import { AuthBanner, AuthSubmit } from "./AuthParts";
import { authErrorCopy, validateLogin, type AuthErrorCode } from "./rules";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [banner, setBanner] = useState<AuthErrorCode | null>(null);
  const error = submitted ? validateLogin({ email, password: "x" }).email : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (validateLogin({ email, password: "x" }).email) return;
    setLoading(true);
    setBanner(null);
    let res;
    try {
      res = await requestPasswordReset(email);
    } catch {
      res = { ok: false as const, code: "network" as const };
    }
    setLoading(false);
    if (res.ok) setDone(true);
    else setBanner(res.code);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <AuthBanner tone="ok">If an account exists for that email, we sent a reset link.</AuthBanner>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface2"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {banner && <AuthBanner>{authErrorCopy(banner)}</AuthBanner>}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@workshop.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <AuthSubmit loading={loading} loadingLabel="Sending...">
        Send reset link
      </AuthSubmit>
      <p className="text-center text-[14px]">
        <Link href="/login" className="font-semibold text-accent underline-offset-2 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
