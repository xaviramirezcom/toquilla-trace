import { describe, expect, it } from "vitest";
import { countOpenProposals, type ProposalCountClient } from "@/lib/workshop/pending";

function fakeClient(result: { count: number | null; error: unknown }, calls: string[] = []): ProposalCountClient {
  const q = {
    eq(column: string, value: string) {
      calls.push(`eq ${column}=${value}`);
      return q;
    },
    in(column: string, values: readonly string[]) {
      calls.push(`in ${column}=${values.join(",")}`);
      return Promise.resolve(result);
    },
  };
  return {
    from(table) {
      calls.push(`from ${table}`);
      return { select: () => q };
    },
  };
}

describe("countOpenProposals", () => {
  it("counts pending, question, blocked and failed proposals of the workshop", async () => {
    const calls: string[] = [];
    await expect(countOpenProposals(fakeClient({ count: 3, error: null }, calls), "ws1")).resolves.toBe(3);
    expect(calls).toEqual(["from proposals", "eq workshop_id=ws1", "in status=pending,question,blocked,failed"]);
  });
  it("returns 0 without a workshop, without a client or on an error", async () => {
    await expect(countOpenProposals(fakeClient({ count: 3, error: null }), null)).resolves.toBe(0);
    await expect(countOpenProposals(null, "ws1")).resolves.toBe(0);
    await expect(countOpenProposals(fakeClient({ count: null, error: new Error("x") }), "ws1")).resolves.toBe(0);
  });
});
