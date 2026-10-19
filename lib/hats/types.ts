// Row shapes the hats and weavers pages read. Column names follow docs/specs/00-conventions.md section 3.
import type { Grade, OwnerType } from "@domain/domain";

export interface HatFlag {
  id: string;
  kind: string;
  message: string;
  raised_by: "assistant" | "system" | string;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  reviewer_name?: string | null;
}

export interface HatListRow {
  code: string;
  grade: Grade;
  rows_per_inch: number;
  stage: number;
  owner_type: OwnerType;
  transfer_email: string | null;
  updated_at: string;
  weaver: { name: string; village: string | null } | null;
  flags: Pick<HatFlag, "id" | "message" | "reviewed_at">[];
}

export interface HatEvent {
  id: string;
  type: string;
  from_stage: number | null;
  to_stage: number | null;
  source: "ai_proposal" | "manual" | string;
  note: string | null;
  run_id: string | null;
  created_at: string;
  actor_name: string | null;
}

export interface HatDetail {
  id: string;
  code: string;
  workshop_id: string;
  workshop_name: string | null;
  weaver_id: string | null;
  weaver: { id: string; name: string; village: string | null } | null;
  grade: Grade;
  rows_per_inch: number;
  straw: string | null;
  size_cm: number | null;
  price_usd: number | null;
  stage: number;
  owner_type: OwnerType;
  owner_user_id: string | null;
  transfer_email: string | null;
  archived: boolean;
  version: number;
  weaving_started_at: string | null;
  created_at: string;
  updated_at: string;
  events: HatEvent[];
  flags: HatFlag[];
}

export interface WeaverRow {
  id: string;
  name: string;
  village: string | null;
  province: string | null;
  specialty: string[];
  weaving_since: number | null;
  bio: string | null;
  show_name: boolean;
  hat_count: number;
}

/** Server action result (spec 08 section 6). */
export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
