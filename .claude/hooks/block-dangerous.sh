#!/usr/bin/env bash
# PreToolUse (Bash): block destructive or secret-leaking commands. Exit 2 = block.
set -u
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

block() { echo "BLOCKED by block-dangerous.sh: $1" >&2; exit 2; }

echo "$cmd" | grep -Eq '(^|[;&|[:space:]])sudo([[:space:]]|$)' && block "sudo is not allowed"
echo "$cmd" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)' && block "recursive or forced rm"
echo "$cmd" | grep -Eq 'find[[:space:]].*(-delete|-exec[[:space:]]+rm)' && block "find -delete / -exec rm"
echo "$cmd" | grep -Eq 'git[[:space:]]+push([[:space:]].*)?[[:space:]](-f|--force|--force-with-lease)([[:space:]]|$)' && block "force push"
echo "$cmd" | grep -Eq 'git[[:space:]]+reset[[:space:]]+--hard' && block "git reset --hard"
echo "$cmd" | grep -Eq 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f' && block "git clean -f"
echo "$cmd" | grep -Eq -- '--no-verify|--no-gpg-sign' && block "skipping git hooks"
echo "$cmd" | grep -Eq '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh' && block "pipe to shell"
echo "$cmd" | grep -Eq 'chmod[[:space:]]+(-R[[:space:]]+)?[0-7]*777' && block "chmod 777"
# Secret-file access through the shell (the Read deny rules do not cover Bash).
echo "$cmd" | grep -Eiq '(cat|less|more|head|tail|grep|rg|sed|awk|cp|mv|base64|xxd|strings|open)[^|;&]*(\.env($|[^.a-zA-Z]|\.[a-zA-Z]+)|\.pem|\.key|/secrets/)' \
  && ! echo "$cmd" | grep -Eq '\.env\.example' && block "reading or copying secret files through the shell"
echo "$cmd" | grep -Eq '>{1,2}[[:space:]]*[^[:space:]]*\.env($|[[:space:]]|\.[a-zA-Z]+)' \
  && ! echo "$cmd" | grep -Eq '\.env\.example' && block "writing to .env through the shell"
exit 0
