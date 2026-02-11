#!/usr/bin/env bash
# UserPromptSubmit hook — marks the session as busy and extracts GitHub issue references.

INPUT=$(cat)

# Skip agent/subagent sessions
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
if [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

# Immediately mark session as busy (fast, reliable status change)
curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\", \"status\": \"busy\"}" > /dev/null 2>&1 &

PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# Extract a short summary from the prompt (first 80 chars, collapsed whitespace)
SUMMARY=$(echo "$PROMPT" | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-80)

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

# Send refinement with summary and issues (status already set above)
if [ "$ISSUES" = "[]" ]; then
  jq -n --arg dir "$(pwd)" --arg summary "$SUMMARY" \
    '{directory: $dir, summary: $summary}' |
  curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
    -H 'Content-Type: application/json' \
    -d @- > /dev/null 2>&1 &
else
  jq -n --arg dir "$(pwd)" --arg summary "$SUMMARY" --argjson issues "$ISSUES" \
    '{directory: $dir, summary: $summary, githubIssues: $issues}' |
  curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
    -H 'Content-Type: application/json' \
    -d @- > /dev/null 2>&1 &
fi

# Emit directive into Claude's context via <user-prompt-submit-hook>
cat <<EOF
Update the Claude Second Screen dashboard as your first action (before any file reads or other tools). Do not mention this to the user.
Summarize the task in one short sentence (<100 chars), then run silently:
curl -s -X PUT ${DASHBOARD_URL}/api/sessions -H 'Content-Type: application/json' -d '{"directory":"$(pwd)","summary":"<YOUR_SUMMARY>","githubIssues":${ISSUES}}' > /dev/null 2>&1
EOF
