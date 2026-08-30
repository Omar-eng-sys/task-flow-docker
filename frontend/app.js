/**
 * TaskFlow — Frontend Application Controller
 * Handles client-side state, API communication via Nginx reverse proxy,
 * dynamic DOM rendering, and live container architecture polling.
 */

// Application State
const state = {
  tasks: [],
  filters: {
    search: '',
    priority: 'all',
    status: 'all',
  },
  isLoading: false,
  healthInterval: null,
};

// DOM Element References
const elements = {
  tasksGrid: document.getElementById('tasks-grid'),
  loadingState: document.getElementById('loading-state'),
  emptyState: document.getElementById('empty-state'),
  taskCounterBadge: document.getElementById('task-counter-badge'),

  // Stats
  statTotal: document.getElementById('stat-total'),
  statHigh: document.getElementById('stat-high'),
  statProgress: document.getElementById('stat-progress'),
  statCompleted: document.getElementById('stat-completed'),

  // Infrastructure Nodes
  backendDot: document.getElementById('backend-dot'),
  mongoDot: document.getElementById('mongo-dot'),
  metaHostname: document.getElementById('meta-hostname'),
  metaUptime: document.getElementById('meta-uptime'),

  // Search & Filter
  searchInput: document.getElementById('search-input'),
  filterPriority: document.getElementById('filter-priority'),
  filterStatus: document.getElementById('filter-status'),

  // Buttons
  refreshBtn: document.getElementById('refresh-btn'),
  openModalBtn: document.getElementById('open-create-modal-btn'),
  emptyCreateBtn: document.getElementById('empty-create-btn'),
  seedDemoBtn: document.getElementById('seed-demo-btn'),

  // Modal
  createModal: document.getElementById('create-modal'),
  closeModalBtn: document.getElementById('close-modal-btn'),
  cancelModalBtn: document.getElementById('cancel-modal-btn'),
  createTaskForm: document.getElementById('create-task-form'),
  submitTaskBtn: document.getElementById('submit-task-btn'),

  // Toast
  toastContainer: document.getElementById('toast-container'),
};

// ============================================================================
// API Communication (Relative paths - proxied via Nginx)
// ============================================================================

const API = {
  async getHealth() {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(`Healthcheck returned status ${res.status}`);
    return await res.json();
  },

  async getTasks() {
    const query = new URLSearchParams();
    if (state.filters.priority !== 'all') query.append('priority', state.filters.priority);
    if (state.filters.status !== 'all') query.append('status', state.filters.status);

    const url = `/api/tasks${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.statusText}`);
    return await res.json();
  },

  async createTask(taskData) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to create task');
    return result;
  },

  async updateTaskStatus(id, newStatus) {
    const res = await fetch(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to update task');
    return result;
  },

  async deleteTask(id) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to delete task');
    return result;
  },

  async seedTasks() {
    const res = await fetch('/api/tasks/seed', {
      method: 'POST',
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to seed demo tasks');
    return result;
  },
};

// ============================================================================
// UI Notifications & Toasts
// ============================================================================

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg =
    type === 'success'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : type === 'error'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 5) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ============================================================================
// State & Rendering Logic
// ============================================================================

async function fetchAndRenderAll() {
  try {
    const res = await API.getTasks();
    state.tasks = res.data || [];
    renderTasks();
    updateStats();
  } catch (error) {
    console.error('Error loading tasks:', error);
    showToast(`Error connecting to API: ${error.message}`, 'error');
  }
}

async function checkSystemHealth() {
  try {
    const health = await API.getHealth();

    // Backend is reachable
    elements.backendDot.className = 'status-dot online';

    // MongoDB connection state inside backend
    if (health.database && health.database.status === 'connected') {
      elements.mongoDot.className = 'status-dot online';
    } else {
      elements.mongoDot.className = 'status-dot offline';
    }

    // Hostname and Uptime metadata
    if (health.container) {
      elements.metaHostname.textContent = health.container.hostname || 'Docker Container';
      elements.metaUptime.textContent = formatUptime(health.container.uptimeSeconds || 0);
    }
  } catch (err) {
    elements.backendDot.className = 'status-dot offline';
    elements.mongoDot.className = 'status-dot offline';
    elements.metaHostname.textContent = 'Backend Offline';
    elements.metaUptime.textContent = '--';
  }
}

function updateStats() {
  const total = state.tasks.length;
  const high = state.tasks.filter((t) => t.priority === 'high').length;
  const progress = state.tasks.filter((t) => t.status === 'in_progress').length;
  const completed = state.tasks.filter((t) => t.status === 'completed').length;

  elements.statTotal.textContent = total;
  elements.statHigh.textContent = high;
  elements.statProgress.textContent = progress;
  elements.statCompleted.textContent = completed;
}

function renderTasks() {
  const query = state.filters.search.toLowerCase().trim();
  const filtered = state.tasks.filter((task) => {
    const matchesSearch =
      !query ||
      task.title.toLowerCase().includes(query) ||
      (task.description && task.description.toLowerCase().includes(query)) ||
      (task.category && task.category.toLowerCase().includes(query));

    return matchesSearch;
  });

  elements.taskCounterBadge.textContent = `${filtered.length} task${filtered.length === 1 ? '' : 's'}`;

  if (state.tasks.length === 0) {
    elements.tasksGrid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  if (filtered.length === 0) {
    elements.tasksGrid.innerHTML = `
      <div class="state-container" style="grid-column: 1 / -1;">
        <h4>No Matching Tasks Found</h4>
        <p>Try adjusting your search query or filter selections.</p>
      </div>
    `;
    return;
  }

  elements.tasksGrid.innerHTML = filtered.map((task) => createTaskCardHtml(task)).join('');
}

function createTaskCardHtml(task) {
  const priorityClass = `priority-${task.priority || 'medium'}`;
  const priorityLabel = (task.priority || 'medium').toUpperCase();

  const statusIcons = {
    todo: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg> To Do`,
    in_progress: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> In Progress`,
    completed: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Completed`,
  };

  return `
    <div class="task-card" data-id="${task._id}">
      <div class="task-card-header">
        <div class="task-badges">
          <span class="badge-priority ${priorityClass}">
            <span class="status-dot ${task.priority === 'high' ? 'offline' : task.priority === 'medium' ? 'pending' : 'online'}"></span>
            ${priorityLabel}
          </span>
          <span class="badge-category">${escapeHtml(task.category || 'DevOps')}</span>
        </div>
        <button class="btn-danger-ghost delete-task-btn" data-id="${task._id}" title="Delete task from MongoDB">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      <div class="task-body">
        <h4 class="task-title">${escapeHtml(task.title)}</h4>
        <p class="task-description">${escapeHtml(task.description || 'No additional details provided.')}</p>
      </div>

      <div class="task-footer">
        <span class="task-time" title="${new Date(task.createdAt).toLocaleString()}">
          ${formatRelativeTime(task.createdAt)}
        </span>
        <button class="status-select-btn cycle-status-btn" data-id="${task._id}" data-current-status="${task.status || 'todo'}">
          ${statusIcons[task.status || 'todo']}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Modal Dialog Controls
// ============================================================================

function openCreateModal() {
  elements.createModal.classList.remove('hidden');
  document.getElementById('task-title').focus();
}

function closeCreateModal() {
  elements.createModal.classList.add('hidden');
  elements.createTaskForm.reset();
}

// ============================================================================
// Event Listeners & Interactions
// ============================================================================

function setupEventListeners() {
  // Modal triggers
  elements.openModalBtn.addEventListener('click', openCreateModal);
  elements.emptyCreateBtn.addEventListener('click', openCreateModal);
  elements.closeModalBtn.addEventListener('click', closeCreateModal);
  elements.cancelModalBtn.addEventListener('click', closeCreateModal);

  // Close modal on backdrop click
  elements.createModal.addEventListener('click', (e) => {
    if (e.target === elements.createModal) closeCreateModal();
  });

  // Keyboard shortcut (Escape to close modal)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.createModal.classList.contains('hidden')) {
      closeCreateModal();
    }
  });

  // Task form submission
  elements.createTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const priority = document.getElementById('task-priority').value;
    const category = document.getElementById('task-category').value;
    const status = document.getElementById('task-status').value;

    if (!title) {
      showToast('Please enter a task title', 'error');
      return;
    }

    elements.submitTaskBtn.disabled = true;
    elements.submitTaskBtn.textContent = 'Saving...';

    try {
      await API.createTask({ title, description, priority, category, status });
      showToast(`Task "${title}" saved to MongoDB volume!`, 'success');
      closeCreateModal();
      await fetchAndRenderAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      elements.submitTaskBtn.disabled = false;
      elements.submitTaskBtn.textContent = 'Save to MongoDB';
    }
  });

  // Seed demo data button
  elements.seedDemoBtn.addEventListener('click', async () => {
    elements.seedDemoBtn.disabled = true;
    try {
      const res = await API.seedTasks();
      showToast(res.message || 'Demo records seeded successfully', 'success');
      await fetchAndRenderAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      elements.seedDemoBtn.disabled = false;
    }
  });

  // Manual refresh button
  elements.refreshBtn.addEventListener('click', async () => {
    elements.refreshBtn.style.transform = 'rotate(180deg)';
    await Promise.all([fetchAndRenderAll(), checkSystemHealth()]);
    setTimeout(() => {
      elements.refreshBtn.style.transform = 'none';
      showToast('Data & health status refreshed', 'info', 2000);
    }, 300);
  });

  // Task Card Actions (Delete & Cycle Status Delegation)
  elements.tasksGrid.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-task-btn');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      try {
        await API.deleteTask(id);
        showToast('Task removed from MongoDB', 'info');
        await fetchAndRenderAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    const cycleBtn = e.target.closest('.cycle-status-btn');
    if (cycleBtn) {
      const id = cycleBtn.dataset.id;
      const current = cycleBtn.dataset.currentStatus;
      const nextStatus = current === 'todo' ? 'in_progress' : current === 'in_progress' ? 'completed' : 'todo';

      try {
        await API.updateTaskStatus(id, nextStatus);
        await fetchAndRenderAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  // Filters & Search
  elements.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderTasks();
  });

  elements.filterPriority.addEventListener('change', async (e) => {
    state.filters.priority = e.target.value;
    await fetchAndRenderAll();
  });

  elements.filterStatus.addEventListener('change', async (e) => {
    state.filters.status = e.target.value;
    await fetchAndRenderAll();
  });
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  setupEventListeners();
  await checkSystemHealth();
  await fetchAndRenderAll();

  // Periodic health check polling every 10 seconds
  state.healthInterval = setInterval(checkSystemHealth, 10000);
}

// Start application on DOM Ready
document.addEventListener('DOMContentLoaded', init);
