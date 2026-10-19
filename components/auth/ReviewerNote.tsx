// Demo access for reviewers (shown on /login and /signup). The password is never in the UI or
// in git: it is shared in the submission note.
const ACCOUNTS = [
  { email: "member@test.com", role: "workshop member: the AI workshop agent" },
  { email: "admin@test.com", role: "admin: logs and agent runs" },
  { email: "buyer@test.com", role: "buyer: can claim hat TQ-9A1M8" },
] as const;

export function ReviewerNote() {
  return (
    <aside
      aria-label="Demo accounts for reviewers"
      className="mb-5 rounded-[12px] border border-info bg-info-tint p-3 text-[13px] text-ink"
    >
      <p className="font-semibold">Reviewing this project?</p>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {ACCOUNTS.map((a) => (
          <li key={a.email}>
            <span className="font-mono">{a.email}</span> <span className="text-muted">({a.role})</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5">Password: in the submission note.</p>
      <p className="mt-1.5 text-muted">
        These are shared demo accounts with a demo-only password. Real accounts use email confirmation and the password
        rules below.
      </p>
    </aside>
  );
}
