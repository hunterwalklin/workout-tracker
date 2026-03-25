// app.js — Main application logic

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
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return 'Week of ' + monday.toLocaleDateString('en-US', options);
  }

  function addDays(d, n) {
    const date = new Date(d);
    date.setDate(date.getDate() + n);
    return date;
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // === State ===
  let currentWeek = getMonday(new Date());
  let selectedDate = formatDate(new Date());
  let historyWeek = getMonday(new Date());
  let progressChart = null;

  // === DOM Elements ===
  const tabBtns = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');
  const weekLabel = document.getElementById('current-week-label');
  const dayChips = document.getElementById('day-chips');
  const exerciseName = document.getElementById('exercise-name');
  const setsContainer = document.getElementById('sets-container');
  const addSetBtn = document.getElementById('add-set-btn');
  const saveExerciseBtn = document.getElementById('save-exercise-btn');
  const todaysExercises = document.getElementById('todays-exercises');
  const suggestions = document.getElementById('exercise-suggestions');

  // History
  const histWeekLabel = document.getElementById('hist-week-label');
  const historyContent = document.getElementById('history-content');

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

      if (tab === 'history') renderHistory();
      if (tab === 'progress') refreshProgressOptions();
    });
  });

  // === Week Navigation (Log) ===
  document.getElementById('prev-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, -7);
    selectedDate = formatDate(currentWeek);
    renderWeek();
  });

  document.getElementById('next-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, 7);
    selectedDate = formatDate(currentWeek);
    renderWeek();
  });

  // === Week Navigation (History) ===
  document.getElementById('hist-prev-week').addEventListener('click', () => {
    historyWeek = addDays(historyWeek, -7);
    renderHistory();
  });

  document.getElementById('hist-next-week').addEventListener('click', () => {
    historyWeek = addDays(historyWeek, 7);
    renderHistory();
  });

  // === Render Week / Day Chips ===
  function renderWeek() {
    weekLabel.textContent = formatWeekLabel(currentWeek);
    const startDate = formatDate(currentWeek);
    const endDate = formatDate(addDays(currentWeek, 6));
    const datesWithData = Storage.getDatesWithData(startDate, endDate);

    dayChips.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const day = addDays(currentWeek, i);
      const dateStr = formatDate(day);
      const chip = document.createElement('button');
      chip.className = 'day-chip';
      if (dateStr === selectedDate) chip.classList.add('active');
      if (datesWithData.has(dateStr)) chip.classList.add('has-data');

      chip.innerHTML = `
        <span>${DAYS[i]}</span>
        <span class="day-num">${day.getDate()}</span>
      `;

      chip.addEventListener('click', () => {
        selectedDate = dateStr;
        renderWeek();
        renderTodaysExercises();
      });

      dayChips.appendChild(chip);
    }

    renderTodaysExercises();
    updateSuggestions();
  }

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

  addSetBtn.addEventListener('click', () => {
    setCount++;
    setsContainer.appendChild(createSetRow(setCount));
    renumberSets();
    // Focus the new reps input
    const newRow = setsContainer.lastElementChild;
    newRow.querySelector('.reps-input').focus();
  });

  // === Save Exercise ===
  saveExerciseBtn.addEventListener('click', () => {
    const name = exerciseName.value.trim();
    if (!name) {
      showToast('Enter an exercise name', 'error');
      exerciseName.focus();
      return;
    }

    const setRows = setsContainer.querySelectorAll('.set-row');
    const sets = [];
    for (const row of setRows) {
      const reps = parseInt(row.querySelector('.reps-input').value) || 0;
      const weight = parseFloat(row.querySelector('.weight-input').value) || 0;
      if (reps > 0) {
        sets.push({ reps, weight });
      }
    }

    if (sets.length === 0) {
      showToast('Add at least one set with reps', 'error');
      return;
    }

    Storage.addExercise(selectedDate, { name, sets });

    // Reset form
    exerciseName.value = '';
    setsContainer.innerHTML = '';
    setCount = 0;
    addSetBtn.click(); // Add first set

    showToast('Exercise saved!', 'success');
    renderWeek();
    syncToSheets();
  });

  // === Render Today's Exercises ===
  function renderTodaysExercises() {
    const exercises = Storage.getByDate(selectedDate);
    if (exercises.length === 0) {
      todaysExercises.innerHTML = '<p class="no-data-msg">No exercises logged for this day</p>';
      return;
    }

    todaysExercises.innerHTML = exercises.map(ex => {
      const totalVolume = ex.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      return `
        <div class="exercise-card">
          <div class="exercise-card-header">
            <h4>${escapeHtml(ex.name)}</h4>
            <button class="icon-btn delete-exercise-btn" data-id="${ex.id}" title="Delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
          <table class="exercise-sets-table">
            <thead><tr><th>Set</th><th>Reps</th><th>Weight</th><th>Volume</th></tr></thead>
            <tbody>
              ${ex.sets.map((s, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${s.reps}</td>
                  <td>${s.weight} lbs</td>
                  <td class="volume-cell">${s.reps * s.weight}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="text-align:right;margin-top:8px;font-size:0.82rem;color:var(--text-muted);">
            Total Volume: <strong style="color:var(--accent-green);">${totalVolume.toLocaleString()}</strong> lbs
          </div>
        </div>
      `;
    }).join('');

    // Delete handlers
    todaysExercises.querySelectorAll('.delete-exercise-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (confirm('Delete this exercise?')) {
          Storage.deleteExercise(selectedDate, id);
          renderWeek();
          syncToSheets();
        }
      });
    });
  }

  // === Autocomplete Suggestions ===
  function updateSuggestions() {
    const names = Storage.getExerciseNames();
    suggestions.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  }

  // === History Tab ===
  function renderHistory() {
    histWeekLabel.textContent = formatWeekLabel(historyWeek);
    let html = '';
    let hasAnyData = false;

    for (let i = 0; i < 7; i++) {
      const day = addDays(historyWeek, i);
      const dateStr = formatDate(day);
      const exercises = Storage.getByDate(dateStr);
      if (exercises.length === 0) continue;
      hasAnyData = true;

      const dayName = day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      html += `
        <div class="history-day">
          <div class="history-day-header">
            <h4>${dayName}</h4>
            <span class="workout-count">${exercises.length} exercise${exercises.length > 1 ? 's' : ''}</span>
          </div>
          <div class="history-day-body">
            ${exercises.map(ex => `
              <div class="history-exercise">
                <div class="history-exercise-name">${escapeHtml(ex.name)}</div>
                <div class="history-exercise-sets">
                  ${ex.sets.map((s, i) => `
                    <span class="history-set-pill">S${i + 1}: ${s.reps}×${s.weight}lbs</span>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (!hasAnyData) {
      html = '<p class="empty-state">No workouts logged this week</p>';
    }

    historyContent.innerHTML = html;
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
      if (metric === 'max-weight') {
        value = Math.max(...entry.sets.map(s => s.weight));
      } else if (metric === 'total-volume') {
        value = entry.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);
      } else {
        value = Math.max(...entry.sets.map(s => s.reps));
      }
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
          legend: {
            display: true,
            labels: { color: '#8b8fa3', font: { family: 'Inter' } }
          },
          tooltip: {
            backgroundColor: '#252836',
            titleColor: '#e8e9ed',
            bodyColor: '#e8e9ed',
            borderColor: '#2e3142',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12
          }
        },
        scales: {
          x: {
            ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } },
            grid: { color: 'rgba(46, 49, 66, 0.5)' }
          },
          y: {
            ticks: { color: '#8b8fa3', font: { family: 'Inter', size: 11 } },
            grid: { color: 'rgba(46, 49, 66, 0.5)' },
            beginAtZero: false
          }
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

  document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  document.getElementById('setup-guide-link').addEventListener('click', (e) => {
    e.preventDefault();
    settingsModal.classList.add('hidden');
    document.getElementById('apps-script-code').textContent = SheetsSync.getAppsScriptCode();
    setupModal.classList.remove('hidden');
  });

  document.getElementById('close-setup').addEventListener('click', () => {
    setupModal.classList.add('hidden');
  });

  setupModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    setupModal.classList.add('hidden');
  });

  // Copy Apps Script code
  document.querySelector('.copy-btn[data-copy="apps-script"]').addEventListener('click', function () {
    navigator.clipboard.writeText(SheetsSync.getAppsScriptCode()).then(() => {
      this.textContent = 'Copied!';
      setTimeout(() => { this.textContent = 'Copy'; }, 2000);
    });
  });

  document.getElementById('test-connection-btn').addEventListener('click', async () => {
    const url = sheetsUrlInput.value.trim();
    if (!url) {
      showStatus('Enter a URL first', 'error');
      return;
    }
    // Temporarily save to test
    const settings = Storage.getSettings();
    settings.sheetsUrl = url;
    Storage.saveSettings(settings);

    showStatus('Testing...', '');
    try {
      await SheetsSync.testConnection();
      showStatus('Connected successfully!', 'success');
    } catch (err) {
      showStatus('Connection failed: ' + err.message, 'error');
    }
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
      } catch (err) {
        showToast('Invalid file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // === Sheets Sync ===
  async function syncToSheets() {
    if (!SheetsSync.isConfigured()) return;
    try {
      await SheetsSync.pushAll();
    } catch (err) {
      console.warn('Sheets sync failed:', err);
    }
  }

  // On load, pull from sheets if configured
  async function initialSync() {
    if (!SheetsSync.isConfigured()) return;
    try {
      await SheetsSync.pullAll();
      renderWeek();
    } catch (err) {
      console.warn('Initial sheets sync failed:', err);
    }
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
  renderWeek();
  initialSync();
})();
