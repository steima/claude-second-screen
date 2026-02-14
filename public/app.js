const API = '';
const POLL_INTERVAL = 2000;

let previousData = null;
let pollTimer = null;

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);

  ws.addEventListener('open', () => {
    setConnected(true);
    // Stop fallback polling while WS is connected
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  ws.addEventListener('message', (event) => {
    const dataStr = event.data;
    if (dataStr !== previousData) {
      previousData = dataStr;
      render(JSON.parse(dataStr));
    }
  });

  ws.addEventListener('close', () => {
    setConnected(false);
    // Fall back to polling while disconnected
    if (!pollTimer) {
      pollTimer = setInterval(poll, POLL_INTERVAL);
    }
    // Attempt reconnect after 3s
    setTimeout(connectWebSocket, 3000);
  });
}

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
  el.querySelector('.status-text').textContent = connected ? 'Connected' : 'Reconnecting...';
}

function getSortMode() {
  return document.getElementById('sortSelect').value;
}

function isGrouped() {
  return document.getElementById('groupToggle').classList.contains('active');
}

function applySortWithin(sessions) {
  const mode = getSortMode();
  if (mode === 'alpha') {
    sessions.sort((a, b) => a.directoryName.localeCompare(b.directoryName));
  } else if (mode === 'recent') {
    sessions.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  } else {
    // Default: status priority — waiting first, then busy, then idle
    const order = { waiting: 0, busy: 1, idle: 2, stopped: 3 };
    sessions.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }
}

function renderGrouped(sessions) {
  const groups = [
    { key: 'waiting', label: 'Awaiting Input' },
    { key: 'busy', label: 'Active' },
    { key: 'idle', label: 'Idle' },
    { key: 'stopped', label: 'Archived' },
  ];

  return groups
    .map((g) => {
      const items = sessions.filter((s) => s.status === g.key);
      if (items.length === 0) return '';
      applySortWithin(items);
      return `
        <section class="status-group">
          <h2 class="group-heading ${g.key}">${g.label}<span class="group-count">${items.length}</span></h2>
          <div class="group-grid">
            ${items.map((s) => cardHTML(s)).join('')}
          </div>
        </section>`;
    })
    .join('');
}

function render(sessions) {
  const dashboard = document.getElementById('dashboard');
  const emptyState = document.getElementById('emptyState');

  if (!sessions || sessions.length === 0) {
    dashboard.innerHTML = '';
    dashboard.classList.remove('grouped');
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  if (isGrouped()) {
    dashboard.classList.add('grouped');
    dashboard.innerHTML = renderGrouped(sessions);
  } else {
    dashboard.classList.remove('grouped');
    applySortWithin(sessions);
    dashboard.innerHTML = sessions.map((s) => cardHTML(s)).join('');
  }

  attachCardListeners();
}

function cardHTML(session) {
  const statusLabels = {
    idle: 'Idle',
    busy: 'Busy',
    waiting: 'Awaiting Input',
    stopped: 'Archived',
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

  const now = Date.now();
  const visibleTasks = (session.tasks || []).filter((t) => {
    if (!t.completed || !t.completedAt) return true;
    return now - new Date(t.completedAt).getTime() < 5 * 60 * 1000;
  });

  const tasksHTML =
    visibleTasks.length > 0
      ? `<hr class="card-divider">
        <div class="card-tasks">
          <div class="card-tasks-title">Tasks</div>
          ${visibleTasks
            .map((t) => {
              let fadeClass = '';
              if (t.completed && t.completedAt) {
                const elapsed = now - new Date(t.completedAt).getTime();
                if (elapsed >= 3 * 60 * 1000) fadeClass = 'fade-heavy';
                else if (elapsed >= 60 * 1000) fadeClass = 'fade-light';
              }
              return `
            <div class="task-item ${fadeClass}" data-dir="${escapeAttr(session.directory)}" data-task-id="${escapeAttr(t.id)}">
              <input type="checkbox" ${t.completed ? 'checked' : ''} title="Toggle task">
              <span class="task-text ${t.completed ? 'completed' : ''}">${escapeHTML(t.text)}</span>
              <button class="task-delete" title="Delete task">&times;</button>
            </div>
          `;
            })
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
        <span class="card-status-label${session.status === 'waiting' || session.status === 'stopped' ? ' clickable' : ''}">${statusLabels[session.status] || session.status}</span>
        <button class="card-remove" title="Remove session">&times;</button>
      </div>
      <div class="card-path" title="${escapeAttr(session.directory)}">${escapeHTML(session.summary || session.directory)}</div>
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

  // Click status label to mark session as idle (waiting → idle, stopped → idle)
  document.querySelectorAll('.card-status-label.clickable').forEach((label) => {
    label.addEventListener('click', async () => {
      const card = label.closest('.card');
      const dir = card.dataset.dir;
      const isStopped = card.classList.contains('stopped');
      const msg = isStopped
        ? 'Restore this archived session to idle?'
        : 'Mark this session as idle?';
      if (!confirm(msg)) return;
      await fetch(`${API}/api/sessions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: dir, status: 'idle' }),
      });
      poll();
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
  await poll();
  // Re-focus the add-task input on the same card after re-render
  const card = document.querySelector(`.card[data-dir="${CSS.escape(dir)}"]`);
  if (card) card.querySelector('.add-task input').focus();
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

// Sort widget — re-render on change and persist preference
const sortSelect = document.getElementById('sortSelect');
const savedSort = localStorage.getItem('sortMode');
if (savedSort) sortSelect.value = savedSort;

sortSelect.addEventListener('change', () => {
  localStorage.setItem('sortMode', sortSelect.value);
  previousData = null;
  poll();
});

// Group toggle — re-render on click and persist preference
const groupToggle = document.getElementById('groupToggle');
if (localStorage.getItem('grouped') === 'true') {
  groupToggle.classList.add('active');
}

groupToggle.addEventListener('click', () => {
  groupToggle.classList.toggle('active');
  localStorage.setItem('grouped', groupToggle.classList.contains('active'));
  previousData = null;
  poll();
});

// Start WebSocket connection with initial poll for immediate render
connectWebSocket();
poll();
