// Where "Report a problem" on a passport points. Pure, so it is unit tested.
import { GITHUB_REPO } from "@/lib/docs/registry";

/**
 * Report a problem: email the workshop when it has a contact address; otherwise (unknown code, or a
 * workshop without one) open a GitHub issue, so the link never opens an email with no recipient.
 */
export function reportHref(code: string | null, contactEmail: string | null | undefined): string {
  const subject = encodeURIComponent(code ? `Problem with hat passport ${code}` : "Problem with a hat passport");
  return contactEmail ? `mailto:${contactEmail}?subject=${subject}` : `${GITHUB_REPO}/issues/new?title=${subject}`;
}
