#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit): tests are a contract. Fix the code, not the test. Exit 2 = block.
set -u
input="$(cat)"
file="$(echo "$input" | jq -r '.tool_input.file_path // empty')"
new="$(echo "$input" | jq -r '[.tool_input.new_string?, .tool_input.content?, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")')"
old="$(echo "$input" | jq -r '[.tool_input.old_string?, (.tool_input.edits[]?.old_string)] | map(select(. != null)) | join("\n")')"
[ -z "$new" ] && [ -z "$old" ] && exit 0

block() { echo "BLOCKED by guard-tests.sh: $1. Fix the code, not the test or the checker." >&2; exit 2; }

# Banned shortcuts in anything we write.
echo "$new" | grep -Eq '\b(it|test|describe)\.(skip|only|todo)\b|\bx(it|describe|test)\(|\bfit\(|\bfdescribe\(' && block "skipped or focused tests"
echo "$new" | grep -Eq '@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable' && block "type or lint suppression"
echo "$new" | grep -Eq 'expect\.assertions\(0\)|expect\(true\)\.toBe\(true\)' && block "empty or tautological assertion"
echo "$new" | grep -Eqi 'coverageThreshold|thresholds?:[[:space:]]*\{' && echo "$file" | grep -Eq '(vitest|jest)\.config|package\.json' && block "editing coverage thresholds"

# Removing assertions from an existing test file.
case "$file" in
  *.test.*|*.spec.*|*__tests__*)
    o=$(echo "$old" | grep -Eo 'expect\(' | wc -l | tr -d ' ')
    n=$(echo "$new" | grep -Eo 'expect\(' | wc -l | tr -d ' ')
    [ "$o" -gt "$n" ] && block "removing assertions ($o -> $n)"
    ;;
esac
exit 0
