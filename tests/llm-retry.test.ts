import { describe, expect, it } from "vitest";
import { LlmError, MIN_ATTEMPT_MS, callWithRetry } from "@domain/llm-types";
import { conciergeRunRow } from "@domain/concierge";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), sleep: async (ms: number) => void (t += ms) };
}

describe("callWithRetry", () => {
  it("retries once on 429/5xx and then gives up", async () => {
    const c = clock();
    const timeouts: number[] = [];
    let calls = 0;
    const p = callWithRetry(
      async (ms) => {
        timeouts.push(ms);
        calls += 1;
        throw new LlmError("overloaded", "api_error", 503);
      },
      { timeoutMs: 25_000, deadlineAt: 45_000, now: c.now, sleep: c.sleep },
    );
    await expect(p).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
    expect(timeouts[0]).toBe(25_000);
  });

  it("does not retry 4xx, timeouts or aborts", async () => {
    for (const err of [new LlmError("bad", "api_error", 400), new LlmError("slow", "timeout"), new LlmError("x", "aborted")]) {
      let calls = 0;
      await expect(
        callWithRetry(
          async () => {
            calls += 1;
            throw err;
          },
          { timeoutMs: 1000 },
        ),
      ).rejects.toBe(err);
      expect(calls).toBe(1);
    }
  });

  it("never runs past the deadline: attempts are capped and a late retry is skipped", async () => {
    const c = clock();
    const timeouts: number[] = [];
    const p = callWithRetry(
      async (ms) => {
        timeouts.push(ms);
        c.advance(ms); // the attempt used all of its time
        throw new LlmError("busy", "api_error", 429);
      },
      { timeoutMs: 25_000, deadlineAt: 10_000, now: c.now, sleep: c.sleep },
    );
    await expect(p).rejects.toMatchObject({ status: 429 });
    expect(timeouts).toEqual([10_000]);
    expect(c.now()).toBeLessThanOrEqual(10_000);
  });

  it("refuses to start with less than the minimum time left", async () => {
    const c = clock(9_000);
    await expect(
      callWithRetry(async () => "never", { timeoutMs: 25_000, deadlineAt: 9_000 + MIN_ATTEMPT_MS - 1, now: c.now }),
    ).rejects.toMatchObject({ type: "timeout" });
  });

  it("returns the first success", async () => {
    let calls = 0;
    const out = await callWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new LlmError("x", "api_error", 500);
        return "ok";
      },
      { timeoutMs: 1000, sleep: async () => {} },
    );
    expect(out).toBe("ok");
  });
});

describe("conciergeRunRow", () => {
  it("is an anonymous concierge run with no question, answer, IP or user", () => {
    const row = conciergeRunRow({
      request_id: "req_0123456789ab",
      hat_code: "TQ-9A1M8",
      status: "answered",
      model: "gemini-2.5-flash-lite",
      tokens_in: 900,
      tokens_out: 40,
      latency_ms: 1300.4,
      cost_usd: 0.000106,
      summary: "answered (record)",
    });
    expect(row).toMatchObject({
      agent: "concierge",
      status: "answered",
      user_id: null,
      workshop_id: null,
      input: null,
      hat_code: "TQ-9A1M8",
      latency_ms: 1300,
      cost_usd: 0.000106,
      request_id: "req_0123456789ab",
      error: null,
    });
    expect(JSON.stringify(row)).not.toMatch(/ip_hash|question/);
  });

  it("keeps a short error for failed runs", () => {
    const row = conciergeRunRow({
      request_id: "req_0123456789ab",
      hat_code: "TQ-9A1M8",
      status: "failed",
      model: "m",
      latency_ms: 5,
      error: { code: "model_error", message: "x".repeat(1000) },
    });
    expect(row.status).toBe("failed");
    expect((row.error as { message: string }).message).toHaveLength(300);
  });
});
