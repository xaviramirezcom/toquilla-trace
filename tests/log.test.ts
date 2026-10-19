// The client logger with an in-memory transport (dependency injection, not a mock of the logger).
import { describe, expect, it } from "vitest";
import { createLogger, type LogPublicArgs, type LogRow, type LogTransport } from "@/lib/log";

function memoryTransport(failures = 0) {
  const inserted: LogRow[][] = [];
  const publicCalls: LogPublicArgs[] = [];
  let left = failures;
  const transport: LogTransport = {
    async insertLogs(rows) {
      if (left > 0) {
        left -= 1;
        return { error: new Error("network") };
      }
      inserted.push(rows);
      return { error: null };
    },
    async logPublic(args) {
      publicCalls.push(args);
      return { error: null };
    },
  };
  return { transport, inserted, publicCalls };
}

const opts = { flushDelayMs: 10_000, retryDelayMs: 1 };

describe("client logger", () => {
  it("batches signed-in rows and sends them on flush with context and redaction", async () => {
    const mem = memoryTransport();
    const log = createLogger({ ...opts, getTransport: () => mem.transport });
    log.setContext({ user_id: "u1", workshop_id: "w1" });
    log.info("proposal.approve", { request_id: "req_aaaaaaaaaaaa", payload: { password: "x", id: 1 } });
    log.error("ui.error", new Error("boom"));
    expect(mem.inserted).toHaveLength(0);
    await log.flush();
    expect(mem.inserted).toHaveLength(1);
    const [first, second] = mem.inserted[0];
    expect(first).toMatchObject({
      level: "info",
      source: "web",
      action: "proposal.approve",
      user_id: "u1",
      workshop_id: "w1",
      request_id: "req_aaaaaaaaaaaa",
      payload: { password: "[redacted]", id: 1 },
      error: null,
    });
    expect(second.error).toMatchObject({ message: "boom" });
  });

  it("flushes automatically when the batch size is reached", async () => {
    const mem = memoryTransport();
    const log = createLogger({ ...opts, batchSize: 2, getTransport: () => mem.transport });
    log.setContext({ user_id: "u1", workshop_id: null });
    log.info("hat.edit");
    log.info("hat.edit");
    await log.flush();
    expect(mem.inserted.flat()).toHaveLength(2);
  });

  it("retries a failed batch once, then drops it without throwing", async () => {
    const once = memoryTransport(1);
    const a = createLogger({ ...opts, getTransport: () => once.transport });
    a.setContext({ user_id: "u1", workshop_id: null });
    a.info("hat.edit");
    await a.flush();
    expect(once.inserted.flat()).toHaveLength(1);

    const twice = memoryTransport(2);
    const b = createLogger({ ...opts, getTransport: () => twice.transport });
    b.setContext({ user_id: "u1", workshop_id: null });
    b.info("hat.edit");
    await expect(b.flush()).resolves.toBeUndefined();
    expect(twice.inserted).toHaveLength(0);
  });

  it("sends allowlisted anonymous actions to log_public and drops the rest", async () => {
    const mem = memoryTransport();
    const log = createLogger({ ...opts, getTransport: () => mem.transport });
    log.warn("auth.login_failed", { payload: { email_domain: "x.com" } });
    log.info("proposal.approve");
    await log.flush();
    expect(mem.inserted).toHaveLength(0);
    expect(mem.publicCalls).toHaveLength(1);
    expect(mem.publicCalls[0]).toMatchObject({ action: "auth.login_failed", level: "warn" });
  });

  it("sends anonymous concierge feedback to log_public", async () => {
    const mem = memoryTransport();
    const log = createLogger({ ...opts, getTransport: () => mem.transport });
    log.info("concierge.feedback", { hat_code: "TQ-9A1M8", payload: { helpful: false, reason: "wrong" } });
    await log.flush();
    expect(mem.publicCalls).toHaveLength(1);
    expect(mem.publicCalls[0]).toMatchObject({ action: "concierge.feedback", level: "info" });
  });

  it("never throws when there is no transport or the transport throws", async () => {
    const none = createLogger({ ...opts, getTransport: () => null });
    none.info("hat.edit");
    await expect(none.flush()).resolves.toBeUndefined();

    const broken: LogTransport = {
      insertLogs: () => Promise.reject(new Error("down")),
      logPublic: () => Promise.reject(new Error("down")),
    };
    const log = createLogger({ ...opts, getTransport: () => broken });
    log.setContext({ user_id: "u1", workshop_id: null });
    expect(() => log.info("hat.edit")).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });

  it("caps the queue and reports dropped rows", async () => {
    const mem = memoryTransport();
    const log = createLogger({ ...opts, batchSize: 1000, maxQueue: 2, getTransport: () => mem.transport });
    log.setContext({ user_id: "u1", workshop_id: null });
    log.info("hat.edit");
    log.info("hat.edit");
    log.info("hat.edit");
    log.info("hat.create");
    await log.flush();
    const rows = mem.inserted.flat();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ action: "hat.create", payload: { dropped: 1 } });
  });
});
