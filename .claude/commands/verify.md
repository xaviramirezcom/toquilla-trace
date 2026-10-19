---
description: Run the full quality gate (typecheck, lint, tests, build) and report pass/fail
---

Run these from the project root, in order, using the commands in `CLAUDE.md` (skip any script that does not exist yet and say so):

1. Type check
2. Lint
3. Tests
4. Build

Report a short table: step, pass or fail, and for each failure the first useful error line. Do not edit tests or checker config to make a step pass. If something fails, propose the code fix.
