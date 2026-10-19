#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): auto-format the edited file if prettier is installed. Never blocks.
file="$(jq -r '.tool_input.file_path // empty' 2>/dev/null)"
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css|*.md|*.html)
    if [ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" ]; then
      "$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier" --write "$file" >/dev/null 2>&1
    fi
    ;;
esac
exit 0
