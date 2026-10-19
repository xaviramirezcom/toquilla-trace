// Client logger (spec 09 section 6.2). Writes app_logs rows from the browser.
// Batches, retries once, never throws, never awaited in user flows.
// Signed in: insert into app_logs WITHOUT .select() (members have no select policy).
// Signed out: allowlisted actions go to the log_public() RPC (D6); everything else is dropped.
import {
  PUBLIC_LOG_ACTIONS,
  capPayload,
  redact,
  serializeError,
  type LogAction,
  type LogLevel,
  type LogRow,
} from "@domain/log-format";
import { tryGetSupabaseBrowserClient } from "@/lib/supabase/client";

export type { LogAction, LogLevel, LogRow };

export interface LogCtx {
  message?: string;
  payload?: Record<string, unknown>;
  request_id?: string;
  hat_code?: string;
  run_id?: string;
  duration_ms?: number;
}

export interface LogContext {
  user_id: string | null;
  workshop_id: string | null;
}

export interface LogPublicArgs {
  action: LogAction;
  level: LogLevel;
  payload: Record<string, unknown>;
}

/** The two writes the logger needs. Tests pass an in-memory one; the app wraps the Supabase client. */
export interface LogTransport {
  insertLogs(rows: LogRow[]): Promise<{ error: unknown }>;
  logPublic(args: LogPublicArgs): Promise<{ error: unknown }>;
}

export interface LoggerOptions {
  getTransport: () => LogTransport | null;
  isDev?: boolean;
  batchSize?: number;
  flushDelayMs?: number;
  retryDelayMs?: number;
  maxQueue?: number;
}

export interface Logger {
  setContext(c: LogContext): void;
  clearContext(): void;
  debug(action: LogAction, ctx?: LogCtx): void;
  info(action: LogAction, ctx?: LogCtx): void;
  warn(action: LogAction, ctx?: LogCtx): void;
  error(action: LogAction, err: unknown, ctx?: LogCtx): void;
  flush(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createLogger(opts: LoggerOptions): Logger {
  const batchSize = opts.batchSize ?? 10;
  const flushDelayMs = opts.flushDelayMs ?? 2000;
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const maxQueue = opts.maxQueue ?? 100;
  const isDev = opts.isDev ?? false;

  let context: LogContext = { user_id: null, workshop_id: null };
  let queue: LogRow[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function devWarn(...args: unknown[]) {
    if (isDev) console.warn("[log]", ...args);
  }

  async function sendSignedIn(rows: LogRow[], transport: LogTransport, attempt = 0): Promise<void> {
    try {
      const { error } = await transport.insertLogs(rows);
      if (error) throw error;
    } catch {
      if (attempt === 0) {
        await sleep(retryDelayMs);
        return sendSignedIn(rows, transport, 1);
      }
      devWarn("dropped", rows.length);
    }
  }

  async function sendPublic(row: LogRow, transport: LogTransport, attempt = 0): Promise<void> {
    try {
      const payload = { ...row.payload, message: row.message, request_id: row.request_id, error: row.error };
      const { error } = await transport.logPublic({ action: row.action, level: row.level, payload });
      if (error) throw error;
    } catch {
      if (attempt === 0) {
        await sleep(retryDelayMs);
        return sendPublic(row, transport, 1);
      }
      devWarn("dropped public row", row.action);
    }
  }

  async function flush(): Promise<void> {
    try {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (queue.length === 0) return;
      const rows = queue;
      queue = [];
      const transport = opts.getTransport();
      if (!transport) {
        devWarn("no Supabase client, dropped", rows.length);
        return;
      }
      const signedIn = rows.filter((r) => r.user_id !== null);
      const anonymous = rows.filter((r) => r.user_id === null && PUBLIC_LOG_ACTIONS.includes(r.action));
      const tasks: Promise<void>[] = [];
      if (signedIn.length > 0) tasks.push(sendSignedIn(signedIn, transport));
      for (const row of anonymous) tasks.push(sendPublic(row, transport));
      await Promise.all(tasks);
    } catch {
      // Logging never breaks the app.
    }
  }

  function push(level: LogLevel, action: LogAction, err: unknown, ctx: LogCtx = {}) {
    try {
      let payload = capPayload(redact(ctx.payload ?? {}));
      if (dropped > 0) {
        payload = { ...payload, dropped };
        dropped = 0;
      }
      const row: LogRow = {
        level,
        source: "web",
        action,
        message: ctx.message ?? null,
        user_id: context.user_id,
        workshop_id: context.workshop_id,
        request_id: ctx.request_id ?? null,
        hat_code: ctx.hat_code ?? null,
        run_id: ctx.run_id ?? null,
        duration_ms: ctx.duration_ms ?? null,
        payload,
        error: serializeError(err),
        created_at: new Date().toISOString(),
      };
      if (isDev) console.debug("[log]", row);
      queue.push(row);
      if (queue.length > maxQueue) {
        queue.shift();
        dropped += 1;
      }
      if (queue.length >= batchSize) void flush();
      else if (!timer) timer = setTimeout(() => void flush(), flushDelayMs);
    } catch {
      // Never throw from a logger call.
    }
  }

  return {
    setContext(c) {
      context = { user_id: c.user_id, workshop_id: c.workshop_id };
    },
    clearContext() {
      context = { user_id: null, workshop_id: null };
    },
    debug: (action, ctx) => push("debug", action, undefined, ctx),
    info: (action, ctx) => push("info", action, undefined, ctx),
    warn: (action, ctx) => push("warn", action, undefined, ctx),
    error: (action, err, ctx) => push("error", action, err ?? null, ctx),
    flush,
  };
}

/** Wraps the browser Supabase client. Insert has no .select(): members cannot read app_logs. */
function supabaseTransport(): LogTransport | null {
  const client = tryGetSupabaseBrowserClient();
  if (!client) return null;
  return {
    async insertLogs(rows) {
      const { error } = await client.from("app_logs").insert(rows);
      return { error };
    },
    async logPublic(args) {
      const { error } = await client.rpc("log_public", args);
      return { error };
    },
  };
}

let transport: LogTransport | null = null;

/** The app-wide logger. Safe to import anywhere; it only sends from the browser. */
export const log: Logger = createLogger({
  getTransport: () => {
    if (typeof window === "undefined") return null;
    if (!transport) transport = supabaseTransport();
    return transport;
  },
  isDev: process.env.NODE_ENV === "development",
});

if (typeof window !== "undefined") {
  const flushNow = () => void log.flush();
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}
