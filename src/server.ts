import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Session, SessionStatus, GitHubIssue } from './types.js';

const app = express();
const PORT = process.env.PORT || 3456;
const server = createServer(app);
const wss = new WebSocketServer({ server });

const DATA_DIR = process.env.CLAUDE_SECOND_SCREEN_DATA_DIR
  || path.join(import.meta.dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');
const DATA_FILE_TMP = path.join(DATA_DIR, 'sessions.json.tmp');

app.use(express.json());

// Log every request
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/') && req.method !== 'GET') {
    const body = req.body && Object.keys(req.body).length > 0 ? ` body=${JSON.stringify(req.body)}` : '';
    console.log(`[${req.method}] ${req.path}${body}`);
  }
  next();
});

app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

// In-memory session store, keyed by directory path
const sessions = new Map<string, Session>();

// --- Persistence ---

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadSessions(): void {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const entries: Session[] = JSON.parse(raw);
    for (const session of entries) {
      sessions.set(session.directory, session);
    }
    console.log(`[persistence] loaded ${entries.length} session(s) from ${DATA_FILE}`);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.log(`[persistence] no data file found — starting fresh`);
    } else {
      console.warn(`[persistence] failed to load sessions — starting fresh:`, err.message);
    }
  }
}

function saveSessions(): void {
  try {
    const data = JSON.stringify(Array.from(sessions.values()), null, 2);
    fs.writeFileSync(DATA_FILE_TMP, data, 'utf-8');
    fs.renameSync(DATA_FILE_TMP, DATA_FILE);
  } catch (err: any) {
    console.error(`[persistence] failed to save sessions:`, err.message);
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSessions();
  }, 1000);
}

function shutdown(): void {
  console.log(`[persistence] shutting down — flushing pending save`);
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveSessions();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- End Persistence ---

function generateId(): string {
  return crypto.randomBytes(4).toString('hex');
}

function broadcast(): void {
  const data = JSON.stringify(Array.from(sessions.values()));
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

const TASK_TTL_MS = 5 * 60 * 1000;
const SESSION_ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000;

function purgeExpiredTasks(): boolean {
  const cutoff = Date.now() - TASK_TTL_MS;
  let changed = false;
  for (const session of sessions.values()) {
    const before = session.tasks.length;
    session.tasks = session.tasks.filter(
      (t) => !t.completed || !t.completedAt || new Date(t.completedAt).getTime() > cutoff
    );
    if (session.tasks.length < before) changed = true;
  }
  return changed;
}

function purgeExpiredSessions(): boolean {
  const cutoff = Date.now() - SESSION_ARCHIVE_TTL_MS;
  let changed = false;
  for (const [dir, session] of sessions) {
    if (
      session.status === 'stopped' &&
      new Date(session.lastUpdated).getTime() < cutoff &&
      session.tasks.every((t) => t.completed)
    ) {
      console.log(`[cleanup] removing archived session "${dir}" (since ${session.lastUpdated})`);
      sessions.delete(dir);
      changed = true;
    }
  }
  return changed;
}

wss.on('connection', (ws) => {
  console.log(`[WS] client connected (total: ${wss.clients.size})`);
  ws.send(JSON.stringify(Array.from(sessions.values())));
  ws.on('close', () => {
    console.log(`[WS] client disconnected (total: ${wss.clients.size})`);
  });
});

// GET /api/sessions — list all sessions
app.get('/api/sessions', (_req: Request, res: Response) => {
  res.json(Array.from(sessions.values()));
});

// POST /api/sessions — register a new session (or re-register)
app.post('/api/sessions', (req: Request, res: Response) => {
  const { directory, source } = req.body as { directory?: string; source?: string };
  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return;
  }

  console.log(`[POST] directory="${directory}" source="${source ?? 'startup'}"`);

  const existing = sessions.get(directory);
  if (existing) {
    existing.status = 'idle';
    if (source !== 'resume' && source !== 'compact') {
      console.log(`[POST]   re-registering existing session, resetting summary`);
      existing.summary = '';
      existing.githubIssues = [];
      existing.tasks = existing.tasks.filter((t) => !t.completed);
    } else {
      console.log(`[POST]   resuming existing session, preserving summary`);
    }
    existing.lastUpdated = new Date().toISOString();
    res.json(existing);
    broadcast();
    scheduleSave();
    return;
  }

  console.log(`[POST]   creating new session`);
  const session: Session = {
    directory,
    directoryName: path.basename(directory),
    summary: '',
    status: 'idle',
    githubIssues: [],
    tasks: [],
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  sessions.set(directory, session);
  res.status(201).json(session);
  broadcast();
  scheduleSave();
});

// PUT /api/sessions — update a session
app.put('/api/sessions', (req: Request, res: Response) => {
  const { directory, summary, status, githubIssues } = req.body as {
    directory?: string;
    summary?: string;
    status?: SessionStatus;
    githubIssues?: GitHubIssue[];
  };

  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return;
  }

  const registeredDirs = Array.from(sessions.keys());
  console.log(`[PUT] directory="${directory}" | registered=[${registeredDirs.map(d => `"${d}"`).join(', ')}]`);
  console.log(`[PUT]   incoming fields: status=${status ?? '(none)'}, summary=${summary !== undefined ? `"${summary.slice(0, 80)}"` : '(none)'}, githubIssues=${githubIssues ? `[${githubIssues.length}]` : '(none)'}`);

  let session = sessions.get(directory);
  let isSubdirRouted = false;
  if (!session) {
    // If this directory is a child of an existing session, attribute the
    // update to the parent session instead of creating a ghost card.
    const parentDir = Array.from(sessions.keys()).find(
      existingDir => directory.startsWith(existingDir + '/')
    );
    if (parentDir) {
      console.log(`[PUT]   matched as subdirectory of "${parentDir}"`);
      session = sessions.get(parentDir)!;
      isSubdirRouted = true;
    } else {
      console.log(`[PUT]   no existing session found — ignoring`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }
  } else {
    console.log(`[PUT]   exact match found`);
  }

  const prevStatus = session.status;
  if (summary !== undefined) session.summary = summary;
  if (status !== undefined) {
    if (isSubdirRouted) {
      const priority: Record<string, number> = { stopped: -1, idle: 0, busy: 1, waiting: 2 };
      if ((priority[status] ?? 0) > (priority[session.status] ?? 0)) {
        session.status = status;
      }
    } else {
      session.status = status;
    }
  }
  if (githubIssues !== undefined) session.githubIssues = githubIssues;
  session.lastUpdated = new Date().toISOString();

  // Skip broadcast if nothing actually changed (e.g. repeated busy→busy from PreToolUse)
  if (summary === undefined && githubIssues === undefined && session.status === prevStatus) {
    res.json(session);
    return;
  }

  console.log(`[PUT]   result: session="${session.directory}" status=${prevStatus}->${session.status}`);

  res.json(session);
  broadcast();
  scheduleSave();
});

// DELETE /api/sessions — remove a session
app.delete('/api/sessions', (req: Request, res: Response) => {
  const { directory } = req.body as { directory?: string };
  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return;
  }
  console.log(`[DELETE] directory="${directory}" | existed=${sessions.has(directory)}`);
  sessions.delete(directory);
  res.status(204).end();
  broadcast();
  scheduleSave();
});

// POST /api/sessions/tasks — add a task to a session
app.post('/api/sessions/tasks', (req: Request, res: Response) => {
  const { directory, text } = req.body as { directory?: string; text?: string };
  if (!directory || !text) {
    res.status(400).json({ error: 'directory and text are required' });
    return;
  }

  const session = sessions.get(directory);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const task = { id: generateId(), text, completed: false };
  session.tasks.push(task);
  session.lastUpdated = new Date().toISOString();
  console.log(`[POST tasks] directory="${directory}" task="${text.slice(0, 60)}" id=${task.id}`);
  res.status(201).json(task);
  broadcast();
  scheduleSave();
});

// PUT /api/sessions/tasks — update a task
app.put('/api/sessions/tasks', (req: Request, res: Response) => {
  const { directory, taskId, text, completed } = req.body as {
    directory?: string;
    taskId?: string;
    text?: string;
    completed?: boolean;
  };

  if (!directory || !taskId) {
    res.status(400).json({ error: 'directory and taskId are required' });
    return;
  }

  const session = sessions.get(directory);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const task = session.tasks.find((t) => t.id === taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (text !== undefined) task.text = text;
  if (completed !== undefined) {
    task.completed = completed;
    task.completedAt = completed ? new Date().toISOString() : undefined;
  }
  session.lastUpdated = new Date().toISOString();
  console.log(`[PUT tasks] directory="${directory}" taskId=${taskId} completed=${task.completed}`);
  res.json(task);
  broadcast();
  scheduleSave();
});

// DELETE /api/sessions/tasks — delete a task
app.delete('/api/sessions/tasks', (req: Request, res: Response) => {
  const { directory, taskId } = req.body as { directory?: string; taskId?: string };
  if (!directory || !taskId) {
    res.status(400).json({ error: 'directory and taskId are required' });
    return;
  }

  const session = sessions.get(directory);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  session.tasks = session.tasks.filter((t) => t.id !== taskId);
  session.lastUpdated = new Date().toISOString();
  console.log(`[DELETE tasks] directory="${directory}" taskId=${taskId}`);
  res.status(204).end();
  broadcast();
  scheduleSave();
});

// --- Startup ---
fs.mkdirSync(DATA_DIR, { recursive: true });
loadSessions();

// Clean up stale data from previous run
{
  const tasksChanged = purgeExpiredTasks();
  const sessionsChanged = purgeExpiredSessions();
  if (tasksChanged) console.log('[cleanup] purged stale completed tasks from loaded data');
  if (sessionsChanged) console.log('[cleanup] purged stale archived sessions from loaded data');
  if (tasksChanged || sessionsChanged) saveSessions();
}

// Purge expired tasks and archived sessions every 60 seconds
setInterval(() => {
  const tasksChanged = purgeExpiredTasks();
  const sessionsChanged = purgeExpiredSessions();
  if (tasksChanged || sessionsChanged) {
    if (tasksChanged) console.log('[cleanup] purged expired completed tasks');
    if (sessionsChanged) console.log('[cleanup] purged expired archived sessions');
    broadcast();
    scheduleSave();
  }
}, 60_000);

server.listen(PORT, () => {
  console.log(`Claude Second Screen dashboard running at http://localhost:${PORT}`);
});
