// Grade tooltip copy and link preview metadata (spec 06). Pure. Metadata never has price, owner or email.
import { certificateStatus } from "./story";
import type { Passport } from "./types";

const GRADE_TIPS: Record<string, string> = {
  Superfino: "Superfino means 25+ rows per inch. Fewer than 1 in 100 hats reach this grade.",
  Fino: "Fino means 15 to 24 rows per inch. Light and smooth.",
  Standard: "Standard means 8 to 14 rows per inch. A sturdy everyday weave.",
};

export function gradeTip(grade: string): string | null {
  return GRADE_TIPS[grade] ?? null;
}

type MetaInput = Pick<
  Passport,
  "grade" | "weaver" | "rows_per_inch" | "stage" | "events" | "weaving_started_at" | "created_at"
>;

export function passportMeta(p: MetaInput): { title: string; description: string } {
  const name = p.weaver?.name;
  const village = p.weaver?.village;
  const by = name ? `by ${name}` : village ? `by a weaver from ${village}` : "hand-woven in Ecuador";
  const title = `Verified ${p.grade} ${by} · Toquilla Trace`;

  const where = [p.weaver?.village, p.weaver?.province].filter(Boolean).join(", ");
  const status = certificateStatus(p);
  const parts = [
    where ? `Hand-woven in ${where}.` : "Hand-woven in Ecuador.",
    p.rows_per_inch ? `${p.rows_per_inch} rows per inch.` : null,
    status.startsWith("Finished") ? `${status}.` : "In production.",
    "See its full story and ask about it.",
  ].filter(Boolean);
  return { title, description: parts.join(" ") };
}

export const NOT_VERIFIED_META = {
  title: "We can't verify this hat · Toquilla Trace",
  description: "This code isn't in our records.",
};
