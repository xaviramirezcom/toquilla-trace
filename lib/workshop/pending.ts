// Open proposals for the shell badge and the logout guard (AppShell pendingCount).
// "Open" in the database means waiting for a person: pending, question, blocked or failed.
export const OPEN_PROPOSAL_DB_STATUSES = ["pending", "question", "blocked", "failed"] as const;

interface CountQuery {
  eq(column: string, value: string): CountQuery;
  in(column: string, values: readonly string[]): PromiseLike<{ count: number | null; error: unknown }>;
}
export interface ProposalCountClient {
  from(table: "proposals"): { select(columns: string, opts: { count: "exact"; head: true }): CountQuery };
}

/** Count of the workshop's open proposals. 0 without a workshop or on any error (badge only). */
export async function countOpenProposals(client: ProposalCountClient | null, workshopId: string | null): Promise<number> {
  if (!client || !workshopId) return 0;
  try {
    const { count, error } = await client
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", workshopId)
      .in("status", OPEN_PROPOSAL_DB_STATUSES);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
