#!/usr/bin/env bash
# SessionStart hook — registers the current session with the dashboard server.
# Install by adding to your .claude/settings.json hooks configuration.

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

curl -s -X POST "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\"}" > /dev/null 2>&1 &
