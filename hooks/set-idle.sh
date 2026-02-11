#!/usr/bin/env bash
# Stop hook — marks the session as idle when Claude finishes responding.

INPUT=$(cat)

# Skip agent/subagent sessions
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
if [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

# Prevent infinite loops when Stop hook causes Claude to continue
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\", \"status\": \"idle\"}" > /dev/null 2>&1 &
