#!/usr/bin/env bash
# PreToolUse hook — re-asserts busy status during agentic turn.
# Lightweight: no summary extraction, no stdout (won't affect Claude context).

INPUT=$(cat)

# Skip agent/subagent sessions
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
if [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\", \"status\": \"busy\"}" > /dev/null 2>&1
