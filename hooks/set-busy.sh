#!/usr/bin/env bash
# UserPromptSubmit hook — marks the session as busy and extracts GitHub issue references.

INPUT=$(cat)

# Skip agent/subagent sessions
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
if [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# Extract GitHub issue references from the user's prompt
SEEN=""
ISSUES="["

# Full GitHub issue URLs: https://github.com/owner/repo/issues/123
for url in $(echo "$PROMPT" | grep -oE 'https://github\.com/[^[:space:]]*/issues/[0-9]+' || true); do
  num=$(echo "$url" | grep -oE '[0-9]+$')
  if ! echo "$SEEN" | grep -q ":${num}:"; then
    [ "$ISSUES" != "[" ] && ISSUES="${ISSUES},"
    ISSUES="${ISSUES}{\"number\":${num},\"url\":\"${url}\"}"
    SEEN="${SEEN}:${num}:"
  fi
done

# Bare #NNN references (skip numbers already found via URL)
for num in $(echo "$PROMPT" | grep -oE '#[0-9]+' | grep -oE '[0-9]+' || true); do
  if ! echo "$SEEN" | grep -q ":${num}:"; then
    [ "$ISSUES" != "[" ] && ISSUES="${ISSUES},"
    ISSUES="${ISSUES}{\"number\":${num}}"
    SEEN="${SEEN}:${num}:"
  fi
done

ISSUES="${ISSUES}]"

# Build payload — only include githubIssues if any were found
if [ "$ISSUES" = "[]" ]; then
  jq -n --arg dir "$(pwd)" \
    '{directory: $dir, status: "busy"}' |
  curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
    -H 'Content-Type: application/json' \
    -d @- > /dev/null 2>&1 &
else
  jq -n --arg dir "$(pwd)" --argjson issues "$ISSUES" \
    '{directory: $dir, status: "busy", githubIssues: $issues}' |
  curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
    -H 'Content-Type: application/json' \
    -d @- > /dev/null 2>&1 &
fi
