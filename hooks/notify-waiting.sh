#!/usr/bin/env bash
# Notification hook — marks the session as waiting for user input (red card).
# Fires when Claude sends a notification (bell) to the terminal.

DASHBOARD_URL="${CLAUDE_SECOND_SCREEN_URL:-http://localhost:3456}"

curl -s -X PUT "${DASHBOARD_URL}/api/sessions" \
  -H 'Content-Type: application/json' \
  -d "{\"directory\": \"$(pwd)\", \"status\": \"waiting\"}" > /dev/null 2>&1 &
