// Server logger for Edge Functions (spec 09 section 6.4). Buffered per request, written once at the
// end with one insert (retried once), mirrored to console.log. Never throws.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  type LogAction,
  type LogLevel,
  type LogRow,
  type LogSource,
  capPayload,
  redact,
  serializeError,
} from "./log-format.ts";
import { serviceClient } from "./http.ts";

export interface ServerLogCtx {
  message?: string;
  payload?: Record<string, unknown>;
  hat_code?: string | null;
  run_id?: string | null;
  duration_ms?: number;
}

export interface Logger {
  debug(action: LogAction, c?: ServerLogCtx): void;
  info(action: LogAction, c?: ServerLogCtx): void;
  warn(action: LogAction, c?: ServerLogCtx): void;
  error(action: LogAction, err: unknown, c?: ServerLogCtx): void;
  /** Context shared by later rows (run_id once the run row exists, user and workshop after auth). */
  set(extra: { run_id?: string | null; hat_code?: string | null; user_id?: string | null; workshop_id?: string | null }): void;
  flush(): Promise<void>;
  rows(): readonly LogRow[];
}

export function createLogger(
  base: { source: LogSource; request_id: string; user_id?: string | null; workshop_id?: string | null },
  opts: { client?: () => SupabaseClient; mirror?: boolean } = {},
): Logger {
  const buffer: LogRow[] = [];
  const ctx = {
    user_id: base.user_id ?? null,
    workshop_id: base.workshop_id ?? null,
    run_id: null as string | null,
    hat_code: null as string | null,
  };
  const mirror = opts.mirror ?? true;
  let flushed = 0;

  function push(level: LogLevel, action: LogAction, c: ServerLogCtx = {}, err?: unknown) {
    try {
      const row: LogRow = {
        level,
        source: base.source,
        action,
        message: c.message ? c.message.slice(0, 2000) : null,
        user_id: ctx.user_id,
        workshop_id: ctx.workshop_id,
        request_id: base.request_id,
        hat_code: c.hat_code ?? ctx.hat_code,
        run_id: c.run_id ?? ctx.run_id,
        duration_ms: typeof c.duration_ms === "number" ? Math.round(c.duration_ms) : null,
        payload: capPayload(redact(c.payload ?? {})),
        error: err === undefined ? null : redact(serializeError(err)),
        created_at: new Date().toISOString(),
      };
      buffer.push(row);
      if (mirror) console.log(JSON.stringify(row));
    } catch {
      // never throw from logging
    }
  }

  async function insert(rows: LogRow[]): Promise<boolean> {
    try {
      const client = opts.client ? opts.client() : serviceClient();
      const { error } = await client.from("app_logs").insert(rows);
      return !error;
    } catch {
      return false;
    }
  }

  return {
    debug: (a, c) => push("debug", a, c),
    info: (a, c) => push("info", a, c),
    warn: (a, c) => push("warn", a, c),
    error: (a, err, c) => push("error", a, c, err),
    set(extra) {
      if (extra.run_id !== undefined) ctx.run_id = extra.run_id;
      if (extra.hat_code !== undefined) ctx.hat_code = extra.hat_code;
      if (extra.user_id !== undefined) ctx.user_id = extra.user_id;
      if (extra.workshop_id !== undefined) ctx.workshop_id = extra.workshop_id;
    },
    async flush() {
      try {
        const rows = buffer.slice(flushed);
        if (rows.length === 0) return;
        flushed = buffer.length;
        if (await insert(rows)) return;
        await new Promise((r) => setTimeout(r, 1000));
        if (!(await insert(rows))) console.warn(`[log] dropped ${rows.length} rows`);
      } catch {
        // never throw
      }
    },
    rows: () => buffer,
  };
}

/** Runs the flush after the response when the runtime supports it (no added latency). */
export function flushInBackground(log: Logger): Promise<void> | void {
  const p = log.flush();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") {
    rt.waitUntil(p);
    return;
  }
  return p;
}
