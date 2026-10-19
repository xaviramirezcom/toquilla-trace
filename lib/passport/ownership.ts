// ownershipView: the ownership line and Claim mode per viewer (spec 06 section 6, handoff "Who sees Claim", D21).
import { formatDate } from "./format";
import type { OwnershipView, Passport, PassportOwnerType } from "./types";

type OwnershipInput = Pick<Passport, "ownership" | "viewer" | "events" | "workshop">;

function lastEventAt(p: Pick<Passport, "events">, type: string): string | null {
  const hits = (p.events ?? []).filter((e) => e.type === type);
  return hits.length ? hits[hits.length - 1].at : null;
}

export function ownershipView(p: OwnershipInput): OwnershipView {
  const viewer = p.viewer;
  if (p.ownership?.pending_transfer) {
    const on = formatDate(lastEventAt(p, "transferred"));
    const when = on ? ` on ${on}` : "";
    if (viewer === "recipient")
      return { line: `Transferred to you${when}. Claim it to register it in your name.`, claim: "button" };
    if (viewer === "anonymous")
      return { line: `Transferred to a buyer${when}. Log in to claim it if it's yours.`, claim: "login" };
    return { line: `Transferred to a buyer${when}. Waiting for them to claim it.`, claim: "none" };
  }
  const type = p.ownership?.owner_type;
  if (type === "buyer") {
    const since = formatDate(lastEventAt(p, "claimed"));
    if (viewer === "owner") return { line: since ? `Registered to you since ${since}` : "Registered to you", claim: "owned" };
    return { line: since ? `Owned by a verified buyer since ${since}` : "Owned by a verified buyer", claim: "none" };
  }
  if (type === "seller") return { line: "With a verified seller.", claim: "none" };
  const ws = p.workshop?.name;
  return { line: ws ? `Held by ${ws}, the workshop that recorded it.` : "Held by the workshop that recorded it.", claim: "none" };
}

/** True when a Claim this hat button is shown (recipient or logged out). */
export function showsClaim(view: OwnershipView): boolean {
  return view.claim === "button" || view.claim === "login";
}

export interface ChainStep {
  label: "Workshop" | "Seller" | "Buyer";
  state: "past" | "current" | "future";
}

/** Workshop -> Seller -> Buyer, with the current holder highlighted. Never a person's name. */
export function ownershipChain(ownerType: PassportOwnerType | undefined): ChainStep[] {
  const order: ChainStep["label"][] = ["Workshop", "Seller", "Buyer"];
  const cur = ownerType === "buyer" ? 2 : ownerType === "seller" ? 1 : 0;
  return order.map((label, i) => ({ label, state: i < cur ? "past" : i === cur ? "current" : "future" }));
}
