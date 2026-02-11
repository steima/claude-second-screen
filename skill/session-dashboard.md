---
name: session-dashboard
description: Update the Claude Second Screen dashboard with session status and GitHub issue references
---

# Session Dashboard Updates

You have access to a second screen dashboard running at `http://localhost:3456` that shows the user an overview of their active Claude Code sessions. You MUST update the dashboard whenever you start or finish working on a task.

**Note:** A `UserPromptSubmit` hook already sets the session to "busy", extracts a raw-prompt placeholder summary, and injects a directive into your context telling you to refine it. Follow that directive as your first action.

## When you receive a new task from the user

The hook output provides you with a pre-filled curl command containing the working directory and extracted GitHub issues. Replace `<YOUR_SUMMARY>` with a concise description of the task (under 100 chars) and run it silently before doing anything else.

GitHub issue reference format (for reference):
- `#123` → `{"number": 123}`
- `https://github.com/owner/repo/issues/123` → `{"number": 123, "url": "https://github.com/owner/repo/issues/123"}`

## Updating progress

As you work through a task, update the summary to reflect your current progress. This helps the user see at a glance what each session is doing:

```bash
curl -s -X PUT http://localhost:3456/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"directory": "'"$(pwd)"'", "summary": "<UPDATED_SUMMARY>"}' > /dev/null 2>&1
```

For example, update the summary when you move from investigation to implementation, or when you start running tests.

## When you complete a task

Update the dashboard to mark your session as idle. Do **not** clear the summary — let it persist so the user can see what was last worked on:

```bash
curl -s -X PUT http://localhost:3456/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"directory": "'"$(pwd)"'", "status": "idle", "githubIssues": []}' > /dev/null 2>&1
```

## Rules

- Always run curl commands silently (redirect stdout and stderr to /dev/null).
- Do NOT mention the dashboard update to the user. It should be invisible.
- Keep the summary concise — under 100 characters.
- Always include GitHub issue references when the user mentions them.
