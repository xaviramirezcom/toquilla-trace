"use server";
// Hat mutations (spec 08 section 6). User session; every write goes through a security definer
// SQL function that checks the caller itself (migration 6), never a direct table write.
// The client logs the outcome with its request id.
import { revalidatePath } from "next/cache";
import { isValidCode } from "@domain/domain";
import { tryGetSupabaseServerClient } from "@/lib/supabase/server";
import { copyFor, isValidEmail, mapDbError, validateReason } from "@/lib/hats/format";
import type { Result } from "@/lib/hats/types";

function fail<T>(code: string, message?: string): Result<T> {
  return { ok: false, code, message: message ?? copyFor(code) };
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

export async function advanceHat(input: {
  code: string;
  expectedVersion: number;
  note?: string;
}): Promise<Result<{ stage: number; version: number }>> {
  if (!isValidCode(input.code)) return fail("invalid_code");
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return fail("not_configured");
  const note = input.note?.trim().slice(0, 500) || null;
  const { data, error } = await supabase.rpc("advance_hat", {
    p_code: input.code,
    p_expected_version: input.expectedVersion,
    p_note: note,
  });
  if (error) return fail(mapDbError(error));
  const row = firstRow<{ stage: number; version: number }>(data);
  revalidatePath(`/hats/${input.code}`);
  revalidatePath("/hats");
  return { ok: true, data: { stage: row?.stage ?? -1, version: row?.version ?? input.expectedVersion + 1 } };
}

export async function reviewFlag(input: { code: string; flagId: string; reason: string }): Promise<Result<null>> {
  const problem = validateReason(input.reason);
  if (problem) return fail("reason_required", problem);
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.rpc("mark_flag_reviewed", {
    p_flag_id: input.flagId,
    p_reason: input.reason.trim(),
  });
  if (error) return fail(mapDbError(error));
  revalidatePath(`/hats/${input.code}`);
  revalidatePath("/hats");
  return { ok: true, data: null };
}

export async function transferHat(input: {
  code: string;
  expectedVersion: number;
  to: "seller" | "buyer";
  email: string;
  message?: string;
}): Promise<Result<null>> {
  if (!isValidCode(input.code)) return fail("invalid_code");
  if (input.to !== "seller" && input.to !== "buyer") return fail("unknown");
  if (!isValidEmail(input.email)) return fail("invalid_email");
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.rpc("transfer_hat", {
    p_code: input.code,
    p_expected_version: input.expectedVersion,
    p_to: input.to,
    p_email: input.email.trim().toLowerCase(),
    p_message: input.message?.trim().slice(0, 500) || null,
  });
  if (error) return fail(mapDbError(error));
  revalidatePath(`/hats/${input.code}`);
  revalidatePath("/hats");
  return { ok: true, data: null };
}

export async function archiveHat(input: { code: string; expectedVersion: number }): Promise<Result<null>> {
  if (!isValidCode(input.code)) return fail("invalid_code");
  const supabase = await tryGetSupabaseServerClient();
  if (!supabase) return fail("not_configured");
  const { error } = await supabase.rpc("archive_hat", {
    p_code: input.code,
    p_expected_version: input.expectedVersion,
  });
  if (error) return fail(mapDbError(error));
  revalidatePath("/hats");
  return { ok: true, data: null };
}
