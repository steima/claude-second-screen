# claude-second-screen

A second screen dashboard to keep track of your active Claude Code sessions.

Cards are color-coded by session state:
- **Green** — session is idle (just shows the directory name)
- **Yellow** — session is actively working
- **Red** — session is waiting for your input
- **Gray** — session has ended (archived)

Each card shows GitHub issue references (clickable) and a per-session task list you can manage from the dashboard.

## Quick Start

```bash
npm install
npm run build
npm start
```

Then open [http://localhost:3456](http://localhost:3456).

For development with auto-reload on TypeScript changes:

```bash
npm run dev
```

## Connecting Claude Code Sessions

### 1. Copy the skill file

Copy `skill/session-dashboard.md` into your project's `.claude/skills/` directory (or your global Claude Code skills directory):

```bash
mkdir -p /path/to/your/project/.claude/skills
cp skill/session-dashboard.md /path/to/your/project/.claude/skills/
```

### 2. Configure hooks

Add the following to your `.claude/settings.json` (project-level or global `~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/register-session.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/set-busy.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/set-idle.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/stop-session.sh"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/notify-waiting.sh"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/claude-second-screen/hooks/set-idle.sh"
          }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/claude-second-screen` with the actual path where you cloned this repository.

### 3. Use it

Start the dashboard server, then open Claude Code sessions in any project that has the skill and hooks configured. Sessions will automatically appear on the dashboard.

## Configuration

Set `CLAUDE_SECOND_SCREEN_URL` to override the dashboard URL (default: `http://localhost:3456`).

Set `PORT` to change the server port (default: `3456`).

## API

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/sessions` | — | List all sessions |
| POST | `/api/sessions` | `{ directory }` | Register a session |
| PUT | `/api/sessions` | `{ directory, status?, summary?, githubIssues? }` | Update a session |
| DELETE | `/api/sessions` | `{ directory }` | Remove a session |
| POST | `/api/sessions/tasks` | `{ directory, text }` | Add a task |
| PUT | `/api/sessions/tasks` | `{ directory, taskId, text?, completed? }` | Update a task |
| DELETE | `/api/sessions/tasks` | `{ directory, taskId }` | Delete a task |
