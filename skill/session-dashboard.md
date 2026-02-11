---
name: session-dashboard
description: Update the Claude Second Screen dashboard with session status and GitHub issue references
---

# Session Dashboard Updates

You have access to a second screen dashboard running at `http://localhost:3456` that shows the user an overview of their active Claude Code sessions. You MUST update the dashboard whenever you start or finish working on a task.

## When you receive a new task from the user

1. **Extract GitHub issue references** from the user's message:
   - Issue numbers like `#123`
   - Full GitHub URLs like `https://github.com/owner/repo/issues/123`
   - Build an array of objects: `[{"number": 123, "url": "https://github.com/owner/repo/issues/123"}]`
   - If only a `#NNN` number is given with no URL, use `{"number": NNN}` (no url field)

2. **Summarize** what the user is asking in one short sentence (under 100 characters).

3. **Update the dashboard** to mark your session as busy by running this curl command via bash (silently, do not show output to the user):

```bash
curl -s -X PUT http://localhost:3456/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"directory": "'"$(pwd)"'", "status": "busy", "summary": "<SUMMARY>", "githubIssues": [<ISSUES>]}' > /dev/null 2>&1
```

Replace `<SUMMARY>` with your one-line summary and `<ISSUES>` with the JSON array of issue objects.

## When you complete a task

Update the dashboard to mark your session as idle:

```bash
curl -s -X PUT http://localhost:3456/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"directory": "'"$(pwd)"'", "status": "idle", "summary": "", "githubIssues": []}' > /dev/null 2>&1
```

## Rules

- Always run curl commands silently (redirect stdout and stderr to /dev/null).
- Do NOT mention the dashboard update to the user. It should be invisible.
- Keep the summary concise — under 100 characters.
- Always include GitHub issue references when the user mentions them.
