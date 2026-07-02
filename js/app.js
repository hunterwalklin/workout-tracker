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
  let editingSessionId = null; // if adding to an existing session
  let editingExercise = null; // { sessionId, exerciseId } if editing a single exercise

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
      if (tab === 'exercises') renderExercisesTab();
      if (tab === 'coach') renderCoach();
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
              <button class="icon-btn edit-session-type-btn" data-id="${session.id}" data-type="${escapeHtml(session.type)}" title="Edit session type">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
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
                <div class="exercise-actions">
                  <button class="icon-btn-sm edit-exercise-btn" data-session-id="${session.id}" data-exercise-id="${ex.id}" title="Edit" style="color:var(--primary);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="icon-btn-sm delete-exercise-btn" data-session-id="${session.id}" data-exercise-id="${ex.id}" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
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

    // Bind edit exercise buttons
    weekSessions.querySelectorAll('.edit-exercise-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditExerciseModal(btn.dataset.sessionId, btn.dataset.exerciseId);
      });
    });

    // Bind edit session type buttons
    weekSessions.querySelectorAll('.edit-session-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditSessionTypeModal(btn.dataset.id, btn.dataset.type);
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

  // Edit a single exercise
  function openEditExerciseModal(sessionId, exerciseId) {
    const mondayStr = formatDate(currentWeek);
    const week = Storage.getWeek(mondayStr);
    const session = week.sessions.find(s => s.id === sessionId);
    if (!session) return;
    const exercise = session.exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    editingExercise = { sessionId, exerciseId };
    editingSessionId = null;
    modalExercises = [];
    sessionModalTitle.textContent = 'Edit Exercise';
    sessionType.parentElement.classList.add('hidden');
    customNameGroup.classList.add('hidden');
    sessionExercisesList.innerHTML = '';
    document.getElementById('save-session-btn').style.display = 'none';

    // Pre-fill form
    exerciseName.value = exercise.name;
    setsContainer.innerHTML = '';
    setCount = 0;
    exercise.sets.forEach((s, i) => {
      setCount = i + 1;
      const row = createSetRow(setCount);
      row.querySelector('.reps-input').value = s.reps;
      row.querySelector('.weight-input').value = s.weight;
      setsContainer.appendChild(row);
    });
    renumberSets();

    // Change "Add Exercise" button to "Save Changes"
    const addBtn = document.getElementById('add-exercise-btn');
    addBtn.textContent = 'Save Changes';
    addBtn._editMode = true;

    sessionModal.classList.remove('hidden');
    updateSuggestions();
  }

  // Edit session type
  function openEditSessionTypeModal(sessionId, currentType) {
    const types = ['Push', 'Pull', 'Legs', 'Arms', 'Core', 'Full Body', 'Cardio', 'Custom'];
    const newType = prompt('Session type:\n' + types.join(', '), currentType);
    if (newType && newType.trim() && newType.trim() !== currentType) {
      Storage.updateSessionType(formatDate(currentWeek), sessionId, newType.trim());
      renderWeek();
      syncToSheets();
    }
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

  // === Add Exercise to Modal list (or save edit) ===
  const addExerciseBtn = document.getElementById('add-exercise-btn');
  addExerciseBtn.addEventListener('click', () => {
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

    // If editing an existing exercise, save directly
    if (editingExercise) {
      Storage.updateExercise(
        formatDate(currentWeek),
        editingExercise.sessionId,
        editingExercise.exerciseId,
        { name, sets }
      );
      editingExercise = null;
      addExerciseBtn.textContent = 'Add Exercise';
      addExerciseBtn._editMode = false;
      sessionModal.classList.add('hidden');
      renderWeek();
      syncToSheets();
      showToast('Exercise updated!', 'success');
      return;
    }

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
    // Reset edit mode
    editingExercise = null;
    addExerciseBtn.textContent = 'Add Exercise';
    addExerciseBtn._editMode = false;
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
      else if (metric === 'est-1rm') {
        // Epley: weight × (1 + reps/30); chart the best set of the session.
        value = Math.round(Math.max(...entry.sets.map(s => s.weight * (1 + s.reps / 30))) * 10) / 10;
      }
      else value = Math.max(...entry.sets.map(s => s.reps));
      labels.push(dateLabel);
      values.push(value);
    }

    if (progressChart) progressChart.destroy();

    const metricLabels = {
      'est-1rm': 'Estimated 1RM (lbs)',
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

  // === Exercise Library ===
  const EXERCISE_CATALOG = {
    // Barbell
    "BB Bench Press":        { equipment: "Barbell", muscles: "Chest, Triceps" },
    "Incline BB Bench Press": { equipment: "Barbell", muscles: "Chest, Shoulders" },
    "BB Overhead Press":     { equipment: "Barbell", muscles: "Shoulders, Triceps" },
    "BB Back Squat":         { equipment: "Barbell", muscles: "Quads, Glutes" },
    "BB Deadlift":           { equipment: "Barbell", muscles: "Hamstrings, Back, Glutes" },
    "BB RDL":                { equipment: "Barbell", muscles: "Hamstrings, Glutes" },
    "BB Bent Over Row":      { equipment: "Barbell", muscles: "Back, Biceps" },

    // Dumbbell (pair)
    "DB Bench Press":        { equipment: "Dumbbell", muscles: "Chest, Triceps" },
    "Incline DB Bench Press": { equipment: "Dumbbell", muscles: "Chest, Shoulders" },
    "DB Chest Fly":          { equipment: "Dumbbell", muscles: "Chest" },
    "DB Shoulder Press":     { equipment: "Dumbbell", muscles: "Shoulders, Triceps" },
    "DB Lateral Raises":     { equipment: "Dumbbell", muscles: "Shoulders" },
    "DB Front Raises":       { equipment: "Dumbbell", muscles: "Shoulders" },
    "DB Upright Row":        { equipment: "Dumbbell", muscles: "Shoulders, Traps" },
    "Hammer Curls":          { equipment: "Dumbbell", muscles: "Biceps" },
    "Seated Incline DB Curls": { equipment: "Dumbbell", muscles: "Biceps" },
    "Single Arm DB Curl":    { equipment: "Dumbbell", muscles: "Biceps" },
    "Seated DB Curls":       { equipment: "Dumbbell", muscles: "Biceps" },
    "Standing DB Curls":     { equipment: "Dumbbell", muscles: "Biceps" },
    "Seated DB Hammer Curls": { equipment: "Dumbbell", muscles: "Biceps" },
    "DB Preacher Curl":      { equipment: "Dumbbell", muscles: "Biceps" },
    "DB Goblet Squat":       { equipment: "Dumbbell", muscles: "Quads, Glutes" },
    "DB Front Squat":        { equipment: "Dumbbell", muscles: "Quads" },
    "DB Bulgarian Split Squat": { equipment: "Dumbbell", muscles: "Quads, Glutes" },
    "DB Lunges":             { equipment: "Dumbbell", muscles: "Quads, Glutes" },

    // EZ Bar
    "EZ Bar Preacher Curls": { equipment: "EZ Bar", muscles: "Biceps" },

    // Machine / Cable
    "Chest Press Machine":   { equipment: "Machine/Cable", muscles: "Chest, Triceps" },
    "Incline Chest Press Machine": { equipment: "Machine/Cable", muscles: "Chest, Shoulders" },
    "Pec Deck":              { equipment: "Machine/Cable", muscles: "Chest" },
    "Reverse Fly Machine":   { equipment: "Machine/Cable", muscles: "Rear Delts, Back" },
    "Rear Delt Machine":     { equipment: "Machine/Cable", muscles: "Rear Delts" },
    "Lat Raise Machine":     { equipment: "Machine/Cable", muscles: "Shoulders" },
    "Lat Pulldowns":         { equipment: "Machine/Cable", muscles: "Back, Biceps" },
    "Seated Cable Row":      { equipment: "Machine/Cable", muscles: "Back, Biceps" },
    "Seated Cable Row (Wide Grip)": { equipment: "Machine/Cable", muscles: "Back" },
    "Cable Curls":           { equipment: "Machine/Cable", muscles: "Biceps" },
    "Cable Straight Bar Pushdowns": { equipment: "Machine/Cable", muscles: "Triceps" },
    "Tricep Extension Machine": { equipment: "Machine/Cable", muscles: "Triceps" },
    "Tricep Rope Extensions": { equipment: "Machine/Cable", muscles: "Triceps" },
    "Upright Cable Rows":    { equipment: "Machine/Cable", muscles: "Shoulders, Traps" },
    "Leg Press":             { equipment: "Machine/Cable", muscles: "Quads, Glutes" },
    "Leg Extensions":        { equipment: "Machine/Cable", muscles: "Quads" },
    "Leg Curls":             { equipment: "Machine/Cable", muscles: "Hamstrings" },
    "Hip Abduction":         { equipment: "Machine/Cable", muscles: "Glutes" },
    "Hip Adduction":         { equipment: "Machine/Cable", muscles: "Adductors" },
    "Smith Squat":           { equipment: "Machine/Cable", muscles: "Quads, Glutes" },
    "Smith Calf Raises":     { equipment: "Machine/Cable", muscles: "Calves" },
    "Seated Calf Raises":    { equipment: "Machine/Cable", muscles: "Calves" },
    "Standing Calf Raises":  { equipment: "Machine/Cable", muscles: "Calves" },
    "Calf Raises":           { equipment: "Machine/Cable", muscles: "Calves" },

    // Bodyweight / Band / Other
    "Lunges":                { equipment: "Bodyweight", muscles: "Quads, Glutes" },
    "Reverse Lunges":        { equipment: "Dumbbell", muscles: "Quads, Glutes" },
    "Forward Lunges":        { equipment: "Dumbbell", muscles: "Quads, Glutes" },
    "Kettlebell Swings":     { equipment: "Dumbbell", muscles: "Hamstrings, Glutes, Core" },
    "Band Pull Aparts":      { equipment: "Band", muscles: "Rear Delts, Back" },
    "Resistance Band Curls": { equipment: "Band", muscles: "Biceps" },

    // Core
    "Decline Ball Sit-Ups":  { equipment: "Bodyweight", muscles: "Core" },
    "Decline Bench Sit-Ups": { equipment: "Bodyweight", muscles: "Core" },
    "Russian Twists":        { equipment: "Bodyweight", muscles: "Core" },
    "Penguins":              { equipment: "Bodyweight", muscles: "Core" },
    "Planks":                { equipment: "Bodyweight", muscles: "Core" },
    "Knee Ups":              { equipment: "Bodyweight", muscles: "Core" },
    "Leg Ups":               { equipment: "Bodyweight", muscles: "Core" },
  };

  let exerciseSortCol = 'name';
  let exerciseSortAsc = true;

  function renderExercisesTab() {
    const filterEquip = document.getElementById('filter-equipment').value;
    const filterMuscle = document.getElementById('filter-muscle').value;
    const tbody = document.getElementById('exercises-tbody');

    // Build list: catalog + any unknown from data
    const allNames = new Set(Object.keys(EXERCISE_CATALOG));
    for (const name of Storage.getExerciseNames()) {
      allNames.add(name);
    }

    let rows = Array.from(allNames).map(name => {
      const info = EXERCISE_CATALOG[name] || { equipment: '—', muscles: '—' };
      return { name, equipment: info.equipment, muscles: info.muscles };
    });

    // Filter
    if (filterEquip) rows = rows.filter(r => r.equipment === filterEquip);
    if (filterMuscle) rows = rows.filter(r => r.muscles.includes(filterMuscle));

    // Sort
    rows.sort((a, b) => {
      const va = a[exerciseSortCol].toLowerCase();
      const vb = b[exerciseSortCol].toLowerCase();
      return exerciseSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    // Equipment badge colors
    const equipColors = {
      'Barbell': 'var(--accent-red)',
      'Dumbbell': 'var(--accent-blue)',
      'Machine/Cable': 'var(--accent-green)',
      'EZ Bar': 'var(--accent-orange)',
      'Bodyweight': 'var(--accent-teal)',
      'Band': 'var(--accent-yellow)',
    };

    tbody.innerHTML = rows.map(r => {
      const color = equipColors[r.equipment] || 'var(--text-muted)';
      return `<tr>
        <td class="exercise-name-cell">${escapeHtml(r.name)}</td>
        <td><span class="equip-badge" style="--badge-color:${color}">${escapeHtml(r.equipment)}</span></td>
        <td class="muscle-cell">${escapeHtml(r.muscles)}</td>
      </tr>`;
    }).join('');

    document.getElementById('exercises-count').textContent = `${rows.length} exercises`;

    // Sort headers
    document.querySelectorAll('.exercises-table th.sortable').forEach(th => {
      th.classList.toggle('sorted-asc', th.dataset.sort === exerciseSortCol && exerciseSortAsc);
      th.classList.toggle('sorted-desc', th.dataset.sort === exerciseSortCol && !exerciseSortAsc);
    });
  }

  // Sort click handlers
  document.querySelectorAll('.exercises-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (exerciseSortCol === col) {
        exerciseSortAsc = !exerciseSortAsc;
      } else {
        exerciseSortCol = col;
        exerciseSortAsc = true;
      }
      renderExercisesTab();
    });
  });

  // Filter change handlers
  document.getElementById('filter-equipment').addEventListener('change', renderExercisesTab);
  document.getElementById('filter-muscle').addEventListener('change', renderExercisesTab);

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

  // === Refresh ===
  // Re-pull the published backfill data (regenerated daily from the sheet by
  // the GitHub Action) and merge in anything new, without a full page reload.
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    try {
      const added = await Storage.loadBackfill();
      const activeTab = document.querySelector('.nav-btn.active').dataset.tab;
      if (activeTab === 'exercises') renderExercisesTab();
      else if (activeTab === 'progress') refreshProgressOptions();
      else renderWeek();
      showToast(added > 0
        ? `Loaded ${added} new workout${added === 1 ? '' : 's'}!`
        : 'Up to date', added > 0 ? 'success' : '');
    } catch (e) {
      showToast('Refresh failed', 'error');
    } finally {
      refreshBtn.classList.remove('spinning');
      refreshBtn.disabled = false;
    }
  });

  // === AI Coach ===
  const COACH_SYSTEM = `You are a knowledgeable, encouraging strength-training coach built into the user's workout tracker app. Give practical, specific, and safe advice grounded in the user's actual logged history.

When the user asks for a suggested workout, produce a concrete session: name the exercises, prescribe sets x reps, and suggest working weights based on what they have lifted recently (a sensible progression, not a big jump). Prefer exercises they already do unless variety is warranted.

Keep responses focused and easy to skim — use short paragraphs or lists, not walls of text. Note that recorded weights are as the user logs them; for dumbbell exercises that is the weight of a single dumbbell.`;

  let coachHistory = [];

  function getApiKey() {
    return (Storage.getSettings().anthropicKey || '').trim();
  }

  function buildWorkoutContext() {
    const all = Storage.getAll();
    const weeks = Object.keys(all).sort();
    if (!weeks.length) return 'The user has no logged workouts yet.';
    let out = `The user has ${weeks.length} weeks of logged workouts, from ${weeks[0]} to ${weeks[weeks.length - 1]}.\n\nMost recent workouts (best set shown per exercise):\n`;
    for (const wk of weeks.slice(-6)) {
      for (const s of (all[wk].sessions || [])) {
        const exs = s.exercises.map(ex => {
          const best = ex.sets.reduce((b, st) => (st.weight > b.weight ? st : b), ex.sets[0]);
          const w = best.weight ? `${best.weight}lb` : 'bodyweight';
          return `${ex.name} ${ex.sets.length}x${best.reps} @ ${w}`;
        }).join('; ');
        out += `- Week of ${wk} [${s.type}]: ${exs}\n`;
      }
    }
    return out;
  }

  function coachBubble(role, text) {
    const wrap = document.getElementById('coach-messages');
    const el = document.createElement('div');
    el.className = 'coach-msg ' + role;
    el.textContent = text;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
    return el;
  }

  function renderCoach() {
    const hasKey = !!getApiKey();
    document.getElementById('coach-setup').classList.toggle('hidden', hasKey);
    document.getElementById('coach-chat').classList.toggle('hidden', !hasKey);
    const keyInput = document.getElementById('anthropic-key');
    if (!hasKey) keyInput.value = '';
    const wrap = document.getElementById('coach-messages');
    if (hasKey && !wrap.children.length) {
      coachBubble('assistant', "Hey! I'm your training coach and I can see your logged history. Ask me for a suggested workout, or how your progress is looking.");
    }
  }

  async function streamClaude(messages, onDelta) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2048,
        system: COACH_SYSTEM + '\n\n' + buildWorkoutContext(),
        messages,
        stream: true,
      }),
    });
    if (!resp.ok) {
      let msg = `API error ${resp.status}`;
      try { const e = await resp.json(); if (e.error && e.error.message) msg = e.error.message; } catch (e) {}
      throw new Error(msg);
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let data;
        try { data = JSON.parse(payload); } catch (e) { continue; }
        if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
          full += data.delta.text;
          onDelta(full);
        } else if (data.type === 'error') {
          throw new Error((data.error && data.error.message) || 'stream error');
        }
      }
    }
    return full;
  }

  async function sendCoach() {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send');
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    input.style.height = 'auto';
    coachBubble('user', text);
    coachHistory.push({ role: 'user', content: text });
    sendBtn.disabled = true;
    const bubble = coachBubble('assistant', '');
    bubble.innerHTML = '<span class="typing">…</span>';
    const wrap = document.getElementById('coach-messages');
    try {
      const reply = await streamClaude(coachHistory, (partial) => {
        bubble.textContent = partial;
        wrap.scrollTop = wrap.scrollHeight;
      });
      bubble.textContent = reply;
      coachHistory.push({ role: 'assistant', content: reply });
    } catch (e) {
      bubble.remove();
      coachHistory.pop(); // drop the unanswered user turn so history stays valid
      coachBubble('error', 'Error: ' + e.message);
    } finally {
      sendBtn.disabled = false;
    }
  }

  document.getElementById('save-key-btn').addEventListener('click', () => {
    const val = document.getElementById('anthropic-key').value.trim();
    const settings = Storage.getSettings();
    settings.anthropicKey = val;
    Storage.saveSettings(settings);
    showToast(val ? 'API key saved' : 'API key cleared', val ? 'success' : '');
    renderCoach();
  });

  const coachInputEl = document.getElementById('coach-input');
  coachInputEl.addEventListener('input', () => {
    coachInputEl.style.height = 'auto';
    coachInputEl.style.height = Math.min(coachInputEl.scrollHeight, 160) + 'px';
  });
  coachInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoach(); }
  });
  document.getElementById('coach-send').addEventListener('click', sendCoach);

  // === Init ===
  async function init() {
    // Pull the legacy Apps Script sync FIRST (if configured), then load the
    // backfill pipeline LAST so the sheet-derived data is authoritative — the
    // old sync mirror can hold stale values (e.g. pre-correction weights) and
    // must not overwrite the freshly published backfill.
    await initialSync();
    const added = await Storage.loadBackfill();
    renderWeek();
    if (added > 0) {
      showToast(`Loaded ${added} new workout${added === 1 ? '' : 's'}!`, 'success');
    }
  }
  init();
})();
