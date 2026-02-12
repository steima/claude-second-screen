import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { Session, SessionStatus, GitHubIssue } from './types.js';

const app = express();
const PORT = process.env.PORT || 3456;

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

function generateId(): string {
  return crypto.randomBytes(4).toString('hex');
}

// GET /api/sessions — list all sessions
app.get('/api/sessions', (_req: Request, res: Response) => {
  res.json(Array.from(sessions.values()));
});

// POST /api/sessions — register a new session (or re-register)
app.post('/api/sessions', (req: Request, res: Response) => {
  const { directory } = req.body as { directory?: string };
  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return;
  }

  console.log(`[POST] directory="${directory}"`);

  const existing = sessions.get(directory);
  if (existing) {
    console.log(`[POST]   re-registering existing session, resetting to idle`);
    existing.status = 'idle';
    existing.summary = '';
    existing.githubIssues = [];
    existing.lastUpdated = new Date().toISOString();
    res.json(existing);
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
      const priority: Record<string, number> = { idle: 0, busy: 1, waiting: 2 };
      if ((priority[status] ?? 0) > (priority[session.status] ?? 0)) {
        session.status = status;
      }
    } else {
      session.status = status;
    }
  }
  if (githubIssues !== undefined) session.githubIssues = githubIssues;
  session.lastUpdated = new Date().toISOString();

  console.log(`[PUT]   result: session="${session.directory}" status=${prevStatus}->${session.status}`);

  res.json(session);
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
});

app.listen(PORT, () => {
  console.log(`Claude Second Screen dashboard running at http://localhost:${PORT}`);
});
