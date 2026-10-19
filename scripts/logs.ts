// `npm run logs` (spec 09 section 6.7): reads app_logs with the service role key from the local .env,
// through plain fetch to PostgREST. Never prints env values; every printed row goes through redact().
// Examples:
//   npm run logs -- --level error --since 1h
//   npm run logs -- --request req_8f2a91c4e2b7
//   npm run logs -- --action agent.rule.check --since 24h --json
//   npm run logs -- --cost
import { redact } from "@domain/log-format";
import {
  USAGE,
  buildCostQuery,
  buildLogsQuery,
  buildRunQuery,
  formatCostSummary,
  formatJsonLines,
  formatLogsTable,
  formatRunSteps,
  parseLogsArgs,
  type CliLogRow,
  type CostRow,
  type RunSummaryRow,
} from "../lib/admin/logs-cli";

async function get<T>(base: string, key: string, path: string): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.stringify(redact(JSON.parse(text)));
    } catch {
      // not JSON, keep the short text
    }
    throw new Error(`PostgREST ${res.status}: ${detail}`);
  }
  return JSON.parse(text) as T;
}

async function main(): Promise<number> {
  const parsed = parseLogsArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(USAGE);
    return 2;
  }
  const args = parsed.args;
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env (see docs/specs/10)");
    return 1;
  }
  if (!base) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env (see docs/specs/10)");
    return 1;
  }

  const now = new Date();
  if (args.cost) {
    const rows = await get<CostRow[]>(base, key, buildCostQuery(now));
    console.log(formatCostSummary(rows));
    return 0;
  }

  const rows = await get<CliLogRow[]>(base, key, buildLogsQuery(args, now));
  if (args.json) {
    if (rows.length) console.log(formatJsonLines(rows));
  } else {
    console.log(formatLogsTable(rows, { payloads: Boolean(args.request || args.run) }));
  }

  if (args.run) {
    const runs = await get<RunSummaryRow[]>(base, key, buildRunQuery(args.run));
    if (runs[0]) console.log(`\n${formatRunSteps(runs[0])}`);
    else console.log(`\nNo agent_runs row with id ${args.run}.`);
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`logs: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
