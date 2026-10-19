#!/usr/bin/env bash
# Stop: remind Claude of the definition of done. Non-blocking, so it never burns time in a timeboxed task.
cat >/dev/null
printf '%s\n' '{"systemMessage":"Definition of done: typecheck, lint and tests pass (/verify), no secrets or debug output, HANDOFF.md updated (what works, what is incomplete, how to run)."}'
exit 0
