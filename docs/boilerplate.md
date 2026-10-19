# Claude Code boilerplate (TypeScript, timeboxed builds)

A hardened Claude Code setup for small TypeScript projects and timeboxed take-homes. It guards three places: edit time (hooks), commit time (pre-commit) and PR time (CI).

## Quick start
```bash
cp -R .claude .githooks .github CLAUDE.md HANDOFF.md .gitignore .env.example /path/to/new-project/
cd /path/to/new-project
git init && git config core.hooksPath .githooks
chmod +x .claude/hooks/*.sh .githooks/pre-commit
```
Then fill the `<< >>` fields in `CLAUDE.md`, scaffold your app, and make sure `package.json` has `lint`, `typecheck`, `test` and `build` scripts. Requires `jq` for the hooks.

## What is included
- `CLAUDE.md`: golden rules, test contract, untrusted-content rule, definition of done
- `.claude/settings.json`: allow, deny and ask permissions plus hook wiring
- Hooks: `block-dangerous` (destructive or secret-leaking shell commands), `guard-tests` (no skipped tests, suppressions or removed assertions), `format-file` (prettier), `quality-gate` (definition-of-done reminder)
- `/verify` command and a read-only `code-reviewer` agent
- `.githooks/pre-commit` and a small CI workflow
- `HANDOFF.md` template for the "what works, what is incomplete, how to run" note

## Changes from the Django + Next.js version
- Stack swapped to TypeScript. Python, Django and monorepo-specific paths, skills, rules and CI removed.
- `Bash(cat *)` is denied and the secret-file check now also covers shell reads and writes (Read denies do not cover Bash).
- `npx` limited to installed tools; no `pip install` or `manage.py` rules.
- `rm` blocked in all recursive or forced forms, `find -delete`, bare `git reset --hard`, force pushes, pipe-to-shell.
- `MultiEdit` added to the edit hooks. Empty `Stop` matcher removed.
- Coverage floor and blocking stop-gate removed for timeboxed work; the stop hook is now a reminder.
- Added an untrusted-content rule so hidden instructions in pages or documents are ignored.

## Limits
Permission patterns and hooks reduce risk but are not a sandbox. Review commands before approving them, and only use project hooks in repos you trust.
