// Shape returned by the public_hat_passport(p_code) SQL function (spec 06 section 5).
// It never contains ids, transfer_email or owner_user_id. `viewer` is computed in the database.

export type Viewer = "anonymous" | "recipient" | "owner" | "other";
export type PassportOwnerType = "workshop" | "seller" | "buyer";

export interface PassportEvent {
  type: string;
  from_stage: number | null;
  to_stage: number | null;
  at: string;
}

export interface PassportWeaver {
  name: string | null;
  village: string | null;
  province: string | null;
  weaving_since: number | null;
  specialty?: string[] | null;
  bio: string | null;
  other_hats: number | null;
}

export interface Passport {
  code: string;
  archived: boolean;
  grade: string;
  rows_per_inch: number | null;
  straw: string | null;
  size_cm: number | null;
  price_usd: number | string | null;
  stage: number;
  weaving_started_at: string | null;
  created_at: string;
  workshop: { name: string | null; city: string | null; contact_email?: string | null };
  weaver: PassportWeaver | null;
  events: PassportEvent[];
  open_flags?: number | null;
  ownership: { owner_type: PassportOwnerType; pending_transfer: boolean };
  viewer: Viewer;
}

export type ClaimMode = "button" | "login" | "owned" | "none";

export interface OwnershipView {
  line: string;
  claim: ClaimMode;
}

export interface StoryStep {
  stage: string;
  state: "done" | "current" | "upcoming";
  date: string | null;
  desc: string;
}

/** Concierge Edge Function contract (conventions section 4). */
export interface ConciergeSource {
  kind: "record" | "general";
  field?: string;
}

export interface ConciergeAnswer {
  answer: string;
  sources: ConciergeSource[];
  refused?: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
