"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { signup } from "@/lib/auth/actions";
import { cn } from "@/lib/cn";
import { log } from "@/lib/log";
import { AuthBanner, AuthSubmit, PasswordField } from "./AuthParts";
import { CITIES, PASSWORD_MIN, authErrorCopy, validateSignup, type AuthErrorCode, type SignupField } from "./rules";

const FIELD_IDS: Record<SignupField, string> = {
  name: "signup-name",
  workshopName: "signup-workshop",
  city: "signup-city",
  email: "signup-email",
  password: "signup-password",
  agreed: "signup-agreed",
};

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workshopName, setWorkshopName] = useState("");
  const [city, setCity] = useState<string>("Cuenca");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<AuthErrorCode | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const form = { name, workshopName, city, email, password, agreed };
  const errors = submitted ? validateSignup(form) : {};
  const longEnough = password.length >= PASSWORD_MIN;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const v = validateSignup(form);
    const first = (Object.keys(FIELD_IDS) as SignupField[]).find((k) => v[k]);
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    setLoading(true);
    setBanner(null);
    let res;
    try {
      res = await signup(form);
    } catch {
      res = { ok: false as const, code: "network" as const };
    }
    if (res.ok) {
      if (res.needsConfirmation) {
        setLoading(false);
        setConfirmSent(true);
        return;
      }
      if (res.userId) log.setContext({ user_id: res.userId, workshop_id: res.workshopId ?? null });
      router.replace(res.redirectTo);
      router.refresh();
      return;
    }
    setLoading(false);
    setBanner(res.code);
  }

  if (confirmSent) {
    return (
      <div className="flex flex-col gap-4">
        <AuthBanner tone="ok">
          Check your email to confirm your account. Then log in to open your workshop.
        </AuthBanner>
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
      {banner === "email_taken" ? (
        <AuthBanner>
          This email already has an account.{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-2">
            Log in instead?
          </Link>
        </AuthBanner>
      ) : banner ? (
        <AuthBanner
          action={
            banner === "network" || banner === "unknown" ? (
              <Button size="sm" variant="secondary" onClick={() => void submit()} icon="refresh">
                Retry
              </Button>
            ) : undefined
          }
        >
          {authErrorCopy(banner)}
        </AuthBanner>
      ) : null}
      <Input
        id={FIELD_IDS.name}
        label="Your name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        maxLength={60}
      />
      <Input
        id={FIELD_IDS.workshopName}
        label="Workshop name"
        autoComplete="organization"
        placeholder="Taller Pillco"
        value={workshopName}
        onChange={(e) => setWorkshopName(e.target.value)}
        error={errors.workshopName}
        maxLength={80}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={FIELD_IDS.city} className="text-[13px] font-semibold text-ink">
          City
        </label>
        <div className="relative">
          <select
            id={FIELD_IDS.city}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-11 w-full appearance-none rounded-[10px] border border-line bg-surface pr-10 pl-3 text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-tint"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Icon name="expand_more" size={20} className="pointer-events-none absolute top-3 right-3 text-muted" />
        </div>
      </div>
      <Input
        id={FIELD_IDS.email}
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@workshop.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <PasswordField
        id={FIELD_IDS.password}
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={
          <span className={cn("inline-flex items-center gap-1", longEnough && "text-ok")}>
            {longEnough && <Icon name="check" size={16} />}
            At least 8 characters
          </span>
        }
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-ink">
          <input
            id={FIELD_IDS.agreed}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-invalid={errors.agreed ? true : undefined}
            aria-describedby={errors.agreed ? "signup-agreed-msg" : undefined}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          I agree to the terms
        </label>
        {errors.agreed && (
          <p id="signup-agreed-msg" className="flex items-center gap-1 text-[12px] text-err">
            <Icon name="error" size={16} />
            {errors.agreed}
          </p>
        )}
      </div>
      <AuthSubmit loading={loading} loadingLabel="Creating account...">
        Create account
      </AuthSubmit>
      <p className="text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
