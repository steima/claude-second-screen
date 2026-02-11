const API = '';
const POLL_INTERVAL = 2000;

let previousData = null;

async function fetchSessions() {
  try {
    const res = await fetch(`${API}/api/sessions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setConnected(true);
    return await res.json();
  } catch {
    setConnected(false);
    return null;
  }
}

function setConnected(connected) {
  const el = document.getElementById('connectionStatus');
  el.classList.toggle('disconnected', !connected);
  el.querySelector('.status-text').textContent = connected ? 'Connected' : 'Disconnected';
}

function render(sessions) {
  const dashboard = document.getElementById('dashboard');
  const emptyState = document.getElementById('emptyState');

  if (!sessions || sessions.length === 0) {
    dashboard.innerHTML = '';
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  // Sort: waiting first, then busy, then idle
  const order = { waiting: 0, busy: 1, idle: 2 };
  sessions.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  dashboard.innerHTML = sessions.map((s) => cardHTML(s)).join('');
  attachCardListeners();
}

function cardHTML(session) {
  const statusLabels = {
    idle: 'Idle',
    busy: 'Busy',
    waiting: 'Awaiting Input',
  };

  const issuesHTML =
    session.githubIssues && session.githubIssues.length > 0
      ? `<div class="card-issues">
          ${session.githubIssues
            .map((issue) => {
              const url = issue.url || `#`;
              const label = `#${issue.number}`;
              if (issue.url) {
                return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener" class="issue-badge">${escapeHTML(label)}</a>`;
              }
              return `<span class="issue-badge">${escapeHTML(label)}</span>`;
            })
            .join('')}
        </div>`
      : '';

  const summaryHTML =
    session.status !== 'idle' && session.summary
      ? `<div class="card-summary">${escapeHTML(session.summary)}</div>`
      : '';

  const tasksHTML =
    session.tasks && session.tasks.length > 0
      ? `<hr class="card-divider">
        <div class="card-tasks">
          <div class="card-tasks-title">Tasks</div>
          ${session.tasks
            .map(
              (t) => `
            <div class="task-item" data-dir="${escapeAttr(session.directory)}" data-task-id="${escapeAttr(t.id)}">
              <input type="checkbox" ${t.completed ? 'checked' : ''} title="Toggle task">
              <span class="task-text ${t.completed ? 'completed' : ''}">${escapeHTML(t.text)}</span>
              <button class="task-delete" title="Delete task">&times;</button>
            </div>
          `
            )
            .join('')}
        </div>`
      : `<hr class="card-divider">
        <div class="card-tasks">
          <div class="card-tasks-title">Tasks</div>
        </div>`;

  return `
    <div class="card ${session.status}" data-dir="${escapeAttr(session.directory)}">
      <div class="card-header">
        <div class="status-indicator"></div>
        <span class="card-dir-name">${escapeHTML(session.directoryName)}</span>
        <span class="card-status-label">${statusLabels[session.status] || session.status}</span>
        <button class="card-remove" title="Remove session">&times;</button>
      </div>
      <div class="card-path">${escapeHTML(session.directory)}</div>
      ${summaryHTML}
      ${issuesHTML}
      ${tasksHTML}
      <div class="add-task">
        <input type="text" placeholder="Add a task..." data-dir="${escapeAttr(session.directory)}">
        <button data-dir="${escapeAttr(session.directory)}">Add</button>
      </div>
    </div>
  `;
}

function attachCardListeners() {
  // Toggle task checkboxes
  document.querySelectorAll('.task-item input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      const item = e.target.closest('.task-item');
      const dir = item.dataset.dir;
      const taskId = item.dataset.taskId;
      await fetch(`${API}/api/sessions/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir, taskId, completed: e.target.checked }),
      });
      poll();
    });
  });

  // Delete task
  document.querySelectorAll('.task-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const item = e.target.closest('.task-item');
      const dir = item.dataset.dir;
      const taskId = item.dataset.taskId;
      await fetch(`${API}/api/sessions/tasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir, taskId }),
      });
      poll();
    });
  });

  // Add task — button click
  document.querySelectorAll('.add-task button').forEach((btn) => {
    btn.addEventListener('click', () => addTask(btn.dataset.dir, btn));
  });

  // Add task — enter key
  document.querySelectorAll('.add-task input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTask(input.dataset.dir, input);
    });
  });

  // Remove session
  document.querySelectorAll('.card-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card');
      const dir = card.dataset.dir;
      await fetch(`${API}/api/sessions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir }),
      });
      poll();
    });
  });
}

async function addTask(dir, triggerEl) {
  const container = triggerEl.closest('.add-task');
  const input = container.querySelector('input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await fetch(`${API}/api/sessions/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory: dir, text }),
  });
  poll();
}

async function poll() {
  const sessions = await fetchSessions();
  if (sessions === null) return; // network error, keep previous state

  const dataStr = JSON.stringify(sessions);
  if (dataStr !== previousData) {
    previousData = dataStr;
    render(sessions);
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Start polling
poll();
setInterval(poll, POLL_INTERVAL);
