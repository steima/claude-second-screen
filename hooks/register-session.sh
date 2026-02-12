#!/usr/bin/env bash
# SessionStart hook — registers the current session with the dashboard server.
# Install by adding to your .claude/settings.json hooks configuration.

INPUT=$(cat)

# Skip agent/subagent sessions — only register user-initiated sessions
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // empty')
if [ -n "$AGENT_TYPE" ]; then
  exit 0
fi

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

# Pass source so the server can preserve summary on resume/compact
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

# Run synchronously so the session exists before any subsequent hooks (set-busy, etc.) fire
curl -s -X POST "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\", \"source\": \"${SOURCE}\"}" > /dev/null 2>&1
