// Static checks on the security migrations. The live behaviour is checked by
// `npm run verify:security` (scripts/verify-security.mjs); these tests keep the SQL from
// silently losing the fixes in a later edit.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "supabase", "migrations");
const read = (prefix: string) => {
  const file = readdirSync(DIR).find((f) => f.startsWith(prefix));
  if (!file) throw new Error(`missing migration ${prefix}`);
  return readFileSync(join(DIR, file), "utf8");
};

describe("security migrations", () => {
  it("S1: members have no direct UPDATE on hats", () => {
    expect(read("20261019001001")).toMatch(/revoke update on public\.hats from authenticated;/);
  });

  it("S2: sign-up no longer publishes the login email as the workshop contact", () => {
    const sql = read("20261019001001");
    const trigger = sql.slice(sql.indexOf("create or replace function public.handle_new_user"), sql.indexOf("end $$;"));
    expect(trigger).toMatch(/insert into public\.workshops \(name, city\)/);
    expect(trigger).not.toMatch(/contact_email\)\s*values[^;]*new\.email/);
  });

  it("S4: anonymous log RPCs are capped", () => {
    const sql = read("20261019001002");
    expect(sql).toMatch(/limit 301\) recent\) > 300/);
    expect(sql).toMatch(/pg_column_size\(v_payload\) > 8192/);
    expect(sql.match(/perform public\.log_flood_guard\(/g)?.length).toBe(2);
    expect(sql).toMatch(/revoke all on function public\.log_flood_guard\(text\) from public, anon, authenticated;/);
  });

  it("eval reset is service role only and scoped to the Eval Workshop", () => {
    const sql = read("20261019001003");
    expect(sql).toMatch(/revoke all on function public\.reset_eval_workshop\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.reset_eval_workshop\(\) to service_role;/);
    // Both trigger exceptions require the flag AND an Eval Workshop row.
    expect(sql.match(/current_setting\('toquilla\.eval_reset', true\) = 'on'/g)?.length).toBe(2);
    expect(sql.match(/33333333-3333-4333-8333-333333333333/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
