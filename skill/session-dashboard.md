---
name: session-dashboard
description: Update the Claude Second Screen dashboard with session status and GitHub issue references
---

# Session Dashboard Updates

You have access to a second screen dashboard running at `http://localhost:3456` that shows the user an overview of their active Claude Code sessions. You MUST update the dashboard whenever you start or finish working on a task.

**Note:** A hook already sets the session to "busy" and extracts a basic summary from the user's prompt automatically. Your job is to refine the summary with a more descriptive one as you understand the task better.

## When you receive a new task from the user

1. **Extract GitHub issue references** from the user's message:
   - Issue numbers like `#123`
   - Full GitHub URLs like `https://github.com/owner/repo/issues/123`
   - Build an array of objects: `[{"number": 123, "url": "https://github.com/owner/repo/issues/123"}]`
   - If only a `#NNN` number is given with no URL, use `{"number": NNN}` (no url field)

2. **Summarize** what the user is asking in one short sentence (under 100 characters). This should be more descriptive than the raw prompt — describe the actual task.

3. **Update the dashboard** with your refined summary by running this curl command via bash (silently, do not show output to the user):

```bash
curl -s -X PUT http://localhost:3456/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"directory": "'"$(pwd)"'", "status": "busy", "summary": "<SUMMARY>", "githubIssues": [<ISSUES>]}' > /dev/null 2>&1
```

Replace `<SUMMARY>` with your one-line summary and `<ISSUES>` with the JSON array of issue objects.

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
