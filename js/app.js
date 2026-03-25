// app.js — Main application logic (v2: week/session based)

(function () {
  // === Date Utilities ===
  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function formatDate(d) {
    return d.toISOString().split('T')[0];
  }

  function formatWeekLabel(monday) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const mOpts = { month: 'short', day: 'numeric' };
    const sOpts = { month: 'short', day: 'numeric', year: 'numeric' };
    return monday.toLocaleDateString('en-US', mOpts) + ' – ' + sunday.toLocaleDateString('en-US', sOpts);
  }

  function addDays(d, n) {
    const date = new Date(d);
    date.setDate(date.getDate() + n);
    return date;
  }

  // === State ===
  let currentWeek = getMonday(new Date());
  let progressChart = null;
  let modalExercises = []; // exercises being built in the session modal
  let editingSessionId = null; // if editing an existing session

  // === DOM Elements ===
  const tabBtns = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');
  const weekLabel = document.getElementById('current-week-label');
  const weekSessions = document.getElementById('week-sessions');
  const suggestions = document.getElementById('exercise-suggestions');

  // Session modal
  const sessionModal = document.getElementById('session-modal');
  const sessionModalTitle = document.getElementById('session-modal-title');
  const sessionType = document.getElementById('session-type');
  const customNameGroup = document.getElementById('custom-name-group');
  const customSessionName = document.getElementById('custom-session-name');
  const sessionExercisesList = document.getElementById('session-exercises');
  const exerciseName = document.getElementById('exercise-name');
  const setsContainer = document.getElementById('sets-container');

  // Progress
  const progressExercise = document.getElementById('progress-exercise');
  const progressMetric = document.getElementById('progress-metric');
  const progressChartCanvas = document.getElementById('progress-chart');
  const noChartData = document.getElementById('no-chart-data');

  // === Tab Navigation ===
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'progress') refreshProgressOptions();
    });
  });

  // === Week Navigation ===
  document.getElementById('prev-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, -7);
    renderWeek();
  });

  document.getElementById('next-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, 7);
    renderWeek();
  });

  // === Render Week View ===
  function renderWeek() {
    const mondayStr = formatDate(currentWeek);
    weekLabel.textContent = formatWeekLabel(currentWeek);
    const week = Storage.getWeek(mondayStr);

    if (week.sessions.length === 0) {
      weekSessions.innerHTML = `
        <div class="empty-week">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <p>No workouts logged this week</p>
        </div>`;
      return;
    }

    weekSessions.innerHTML = week.sessions.map(session => {
      const typeClass = 'type-' + session.type.toLowerCase().replace(/\s+/g, '-');
      const totalVolume = session.exercises.reduce((sum, ex) =>
        sum + ex.sets.reduce((s, set) => s + set.reps * set.weight, 0), 0
      );

      return `
        <div class="session-card" data-session-id="${session.id}">
          <div class="session-card-header">
            <span class="session-type-badge ${typeClass}">
              <span class="dot"></span>
              ${escapeHtml(session.type)}
            </span>
            <div class="actions">
              <button class="icon-btn add-to-session-btn" data-id="${session.id}" title="Add exercise">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
              <button class="icon-btn delete-session-btn" data-id="${session.id}" title="Delete session" style="color:var(--accent-red);opacity:0.6;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              </button>
            </div>
          </div>
          <div class="session-card-body">
            ${session.exercises.map(ex => `
              <div class="session-exercise" data-exercise-id="${ex.id}">
                <div class="exercise-info">
                  <div class="name">${escapeHtml(ex.name)}</div>
                  <div class="sets-summary">
                    ${ex.sets.map((s, i) => `<span class="set-pill">${s.reps}×${s.weight}lbs</span>`).join('')}
                  </div>
                </div>
                <button class="icon-btn-sm delete-exercise-btn" data-session-id="${session.id}" data-exercise-id="${ex.id}" title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
          <div class="session-card-footer">
            <span>${session.exercises.length} exercise${session.exercises.length !== 1 ? 's' : ''}</span>
            <span class="volume">${totalVolume.toLocaleString()} lbs volume</span>
          </div>
        </div>`;
    }).join('');

    // Bind delete session buttons
    weekSessions.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this entire session?')) {
          Storage.deleteSession(formatDate(currentWeek), btn.dataset.id);
          renderWeek();
          syncToSheets();
        }
      });
    });

    // Bind delete exercise buttons
    weekSessions.querySelectorAll('.delete-exercise-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Storage.deleteExercise(formatDate(currentWeek), btn.dataset.sessionId, btn.dataset.exerciseId);
        renderWeek();
        syncToSheets();
      });
    });

    // Bind add-to-session buttons
    weekSessions.querySelectorAll('.add-to-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddToSessionModal(btn.dataset.id);
      });
    });
  }

  // === Session Modal: Add new session ===
  document.getElementById('add-session-btn').addEventListener('click', () => {
    editingSessionId = null;
    modalExercises = [];
    sessionModalTitle.textContent = 'Add Workout Session';
    sessionType.value = 'Push';
    sessionType.parentElement.classList.remove('hidden');
    customNameGroup.classList.add('hidden');
    renderModalExercises();
    resetExerciseForm();
    sessionModal.classList.remove('hidden');
    document.getElementById('save-session-btn').style.display = '';
  });

  // Add to existing session
  function openAddToSessionModal(sessionId) {
    editingSessionId = sessionId;
    modalExercises = [];
    sessionModalTitle.textContent = 'Add Exercise';
    sessionType.parentElement.classList.add('hidden');
    customNameGroup.classList.add('hidden');
    renderModalExercises();
    resetExerciseForm();
    sessionModal.classList.remove('hidden');
    document.getElementById('save-session-btn').style.display = '';
  }

  // Close modal
  document.getElementById('close-session-modal').addEventListener('click', () => {
    sessionModal.classList.add('hidden');
  });
  sessionModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    sessionModal.classList.add('hidden');
  });

  // Custom session name toggle
  sessionType.addEventListener('change', () => {
    if (sessionType.value === 'Custom') {
      customNameGroup.classList.remove('hidden');
      customSessionName.focus();
    } else {
      customNameGroup.classList.add('hidden');
    }
  });

  // === Sets Management ===
  let setCount = 1;

  function createSetRow(num) {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.dataset.set = num;
    row.innerHTML = `
      <span class="set-label">Set ${num}</span>
      <div class="form-group">
        <label>Reps</label>
        <input type="number" class="reps-input" placeholder="0" min="0" inputmode="numeric">
      </div>
      <div class="form-group">
        <label>Weight (lbs)</label>
        <input type="number" class="weight-input" placeholder="0" min="0" step="2.5" inputmode="decimal">
      </div>
      <button class="remove-set-btn icon-btn-sm" title="Remove set" ${num === 1 ? 'style="visibility:hidden;"' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    row.querySelector('.remove-set-btn').addEventListener('click', () => {
      row.remove();
      renumberSets();
    });
    return row;
  }

  function renumberSets() {
    const rows = setsContainer.querySelectorAll('.set-row');
    setCount = rows.length;
    rows.forEach((row, i) => {
      row.dataset.set = i + 1;
      row.querySelector('.set-label').textContent = `Set ${i + 1}`;
      const removeBtn = row.querySelector('.remove-set-btn');
      removeBtn.style.visibility = rows.length === 1 ? 'hidden' : 'visible';
    });
  }

  document.getElementById('add-set-btn').addEventListener('click', () => {
    setCount++;
    setsContainer.appendChild(createSetRow(setCount));
    renumberSets();
    setsContainer.lastElementChild.querySelector('.reps-input').focus();
  });

  // === Add Exercise to Modal list ===
  document.getElementById('add-exercise-btn').addEventListener('click', () => {
    const name = exerciseName.value.trim();
    if (!name) { showToast('Enter an exercise name', 'error'); exerciseName.focus(); return; }

    const setRows = setsContainer.querySelectorAll('.set-row');
    const sets = [];
    for (const row of setRows) {
      const reps = parseInt(row.querySelector('.reps-input').value) || 0;
      const weight = parseFloat(row.querySelector('.weight-input').value) || 0;
      if (reps > 0) sets.push({ reps, weight });
    }

    if (sets.length === 0) { showToast('Add at least one set with reps', 'error'); return; }

    modalExercises.push({ name, sets });
    renderModalExercises();
    resetExerciseForm();
    exerciseName.focus();
  });

  function resetExerciseForm() {
    exerciseName.value = '';
    setsContainer.innerHTML = '';
    setCount = 0;
    setsContainer.appendChild(createSetRow(1));
    setCount = 1;
    updateSuggestions();
  }

  function renderModalExercises() {
    if (modalExercises.length === 0) {
      sessionExercisesList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No exercises added yet</p>';
      return;
    }
    sessionExercisesList.innerHTML = modalExercises.map((ex, i) => {
      const setsDesc = ex.sets.map((s, j) => `${s.reps}×${s.weight}lbs`).join(', ');
      return `
        <div class="session-exercise-item">
          <div>
            <div class="info">${escapeHtml(ex.name)}</div>
            <div class="detail">${ex.sets.length} set${ex.sets.length > 1 ? 's' : ''} — ${setsDesc}</div>
          </div>
          <button class="icon-btn-sm remove-modal-exercise" data-index="${i}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>`;
    }).join('');

    sessionExercisesList.querySelectorAll('.remove-modal-exercise').forEach(btn => {
      btn.addEventListener('click', () => {
        modalExercises.splice(parseInt(btn.dataset.index), 1);
        renderModalExercises();
      });
    });
  }

  // === Save Session ===
  document.getElementById('save-session-btn').addEventListener('click', () => {
    const mondayStr = formatDate(currentWeek);

    if (editingSessionId) {
      // Adding exercises to existing session
      if (modalExercises.length === 0) {
        showToast('Add at least one exercise', 'error');
        return;
      }
      for (const ex of modalExercises) {
        Storage.addExerciseToSession(mondayStr, editingSessionId, ex);
      }
      showToast('Exercises added!', 'success');
    } else {
      // Creating new session
      if (modalExercises.length === 0) {
        showToast('Add at least one exercise', 'error');
        return;
      }
      let type = sessionType.value;
      if (type === 'Custom') {
        type = customSessionName.value.trim() || 'Custom';
      }
      Storage.addSession(mondayStr, { type, exercises: modalExercises });
      showToast('Session saved!', 'success');
    }

    sessionModal.classList.add('hidden');
    renderWeek();
    syncToSheets();
  });

  // === Autocomplete ===
  function updateSuggestions() {
    const names = Storage.getExerciseNames();
    suggestions.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  }

  // === Progress Tab ===
  function refreshProgressOptions() {
    const names = Storage.getExerciseNames();
    const current = progressExercise.value;
    progressExercise.innerHTML = '<option value="">Select an exercise</option>';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      progressExercise.appendChild(opt);
    });
    renderProgressChart();
  }

  progressExercise.addEventListener('change', renderProgressChart);
  progressMetric.addEventListener('change', renderProgressChart);

  function renderProgressChart() {
    const name = progressExercise.value;
    if (!name) {
      noChartData.style.display = 'block';
      progressChartCanvas.style.display = 'none';
      if (progressChart) { progressChart.destroy(); progressChart = null; }
      return;
    }

    noChartData.style.display = 'none';
    progressChartCanvas.style.display = 'block';

    const history = Storage.getExerciseHistory(name);
    const metric = progressMetric.value;
    const labels = [];
    const values = [];

    for (const entry of history) {
      const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      let value;
      if (metric === 'max-weight') value = Math.max(...entry.sets.map(s => s.weight));
      else if (metric === 'total-volume') value = entry.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      else value = Math.max(...entry.sets.map(s => s.reps));
      labels.push(dateLabel);
      values.push(value);
    }

    if (progressChart) progressChart.destroy();

    const metricLabels = {
      'max-weight': 'Max Weight (lbs)',
      'total-volume': 'Total Volume (lbs)',
      'max-reps': 'Max Reps'
    };

    progressChart = new Chart(progressChartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: metricLabels[metric],
          data: values,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108, 99, 255, 0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#6c63ff',
          pointBorderColor: '#1a1d27',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: '#8b8fa3', font: { family: 'Inter' } } },
          tooltip: {
            backgroundColor: '#252836', titleColor: '#e8e9ed', bodyColor: '#e8e9ed',
            borderColor: '#2e3142', borderWidth: 1, cornerRadius: 8, padding: 12
          }
        },
        scales: {
          x: { ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(46, 49, 66, 0.5)' } },
          y: { ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(46, 49, 66, 0.5)' }, beginAtZero: false }
        }
      }
    });
  }

  // === Settings Modal ===
  const settingsModal = document.getElementById('settings-modal');
  const setupModal = document.getElementById('setup-modal');
  const sheetsUrlInput = document.getElementById('sheets-url');
  const connectionStatus = document.getElementById('connection-status');

  document.getElementById('settings-btn').addEventListener('click', () => {
    const settings = Storage.getSettings();
    sheetsUrlInput.value = settings.sheetsUrl || '';
    settingsModal.classList.remove('hidden');
  });

  document.getElementById('close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('setup-guide-link').addEventListener('click', (e) => {
    e.preventDefault();
    settingsModal.classList.add('hidden');
    document.getElementById('apps-script-code').textContent = SheetsSync.getAppsScriptCode();
    setupModal.classList.remove('hidden');
  });

  document.getElementById('close-setup').addEventListener('click', () => setupModal.classList.add('hidden'));
  setupModal.querySelector('.modal-backdrop').addEventListener('click', () => setupModal.classList.add('hidden'));

  document.querySelector('.copy-btn[data-copy="apps-script"]').addEventListener('click', function () {
    navigator.clipboard.writeText(SheetsSync.getAppsScriptCode()).then(() => {
      this.textContent = 'Copied!';
      setTimeout(() => { this.textContent = 'Copy'; }, 2000);
    });
  });

  document.getElementById('test-connection-btn').addEventListener('click', async () => {
    const url = sheetsUrlInput.value.trim();
    if (!url) { showStatus('Enter a URL first', 'error'); return; }
    const settings = Storage.getSettings();
    settings.sheetsUrl = url;
    Storage.saveSettings(settings);
    showStatus('Testing...', '');
    try {
      await SheetsSync.testConnection();
      showStatus('Connected successfully!', 'success');
    } catch (err) { showStatus('Connection failed: ' + err.message, 'error'); }
  });

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const settings = Storage.getSettings();
    settings.sheetsUrl = sheetsUrlInput.value.trim();
    Storage.saveSettings(settings);
    settingsModal.classList.add('hidden');
    showToast('Settings saved', 'success');
    if (settings.sheetsUrl) syncToSheets();
  });

  function showStatus(msg, type) {
    connectionStatus.textContent = msg;
    connectionStatus.className = 'connection-status ' + type;
    connectionStatus.classList.remove('hidden');
  }

  // Export / Import
  document.getElementById('export-btn').addEventListener('click', () => {
    const data = Storage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workout-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Data exported', 'success');
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Storage.importData(reader.result);
        showToast('Data imported!', 'success');
        renderWeek();
      } catch (err) { showToast('Invalid file', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // === Sheets Sync ===
  async function syncToSheets() {
    if (!SheetsSync.isConfigured()) return;
    try { await SheetsSync.pushAll(); } catch (err) { console.warn('Sheets sync failed:', err); }
  }

  async function initialSync() {
    if (!SheetsSync.isConfigured()) return;
    try { await SheetsSync.pullAll(); renderWeek(); } catch (err) { console.warn('Initial sheets sync failed:', err); }
  }

  // === Toast ===
  function showToast(msg, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // === Utility ===
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Init ===
  async function init() {
    const backfilled = await Storage.loadBackfill();
    renderWeek();
    if (backfilled) showToast('Loaded your workout history!', 'success');
    initialSync();
  }
  init();
})();
