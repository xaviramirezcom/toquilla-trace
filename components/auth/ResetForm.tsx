"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { updatePassword } from "@/lib/auth/actions";
import { AuthBanner, AuthSubmit, PasswordField } from "./AuthParts";
import { PASSWORD_MIN, authErrorCopy, validateNewPassword, type AuthErrorCode } from "./rules";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<AuthErrorCode | null>(null);
  const errors = submitted ? validateNewPassword(password, confirm) : {};

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateNewPassword(password, confirm)).length > 0) return;
    setLoading(true);
    setBanner(null);
    let res;
    try {
      res = await updatePassword(password, confirm);
    } catch {
      res = { ok: false as const, code: "network" as const };
    }
    if (res.ok) {
      router.replace(res.redirectTo);
      router.refresh();
      return;
    }
    setLoading(false);
    setBanner(res.code);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {banner && (
        <AuthBanner>
          {banner === "invalid_credentials"
            ? "Your reset link has expired. Ask for a new one from the log in page."
            : authErrorCopy(banner === "invalid_input" ? "unknown" : banner)}
        </AuthBanner>
      )}
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <PasswordField
        label="Type it again"
        name="confirm-password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <AuthSubmit loading={loading} loadingLabel="Saving...">
        Save new password
      </AuthSubmit>
    </form>
  );
}
