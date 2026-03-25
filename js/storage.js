// storage.js — localStorage-based data layer
// Data format: { "2025-05-05": { sessions: [{ type, exercises: [{ id, name, sets }] }] } }
// Key is the Monday of the week (YYYY-MM-DD)

const Storage = {
  WORKOUTS_KEY: 'workout_tracker_data_v2',
  SETTINGS_KEY: 'workout_tracker_settings',

  getAll() {
    const raw = localStorage.getItem(this.WORKOUTS_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  saveAll(data) {
    localStorage.setItem(this.WORKOUTS_KEY, JSON.stringify(data));
  },

  // Get week data by Monday date string
  getWeek(mondayStr) {
    const all = this.getAll();
    return all[mondayStr] || { sessions: [] };
  },

  saveWeek(mondayStr, weekData) {
    const all = this.getAll();
    if (weekData.sessions.length === 0) {
      delete all[mondayStr];
    } else {
      all[mondayStr] = weekData;
    }
    this.saveAll(all);
  },

  // Add a full session to a week
  addSession(mondayStr, session) {
    const week = this.getWeek(mondayStr);
    session.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // Ensure each exercise has an id
    for (const ex of session.exercises) {
      if (!ex.id) ex.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    week.sessions.push(session);
    this.saveWeek(mondayStr, week);
    return session;
  },

  // Delete a session by id
  deleteSession(mondayStr, sessionId) {
    const week = this.getWeek(mondayStr);
    week.sessions = week.sessions.filter(s => s.id !== sessionId);
    this.saveWeek(mondayStr, week);
  },

  // Delete an exercise from a session
  deleteExercise(mondayStr, sessionId, exerciseId) {
    const week = this.getWeek(mondayStr);
    const session = week.sessions.find(s => s.id === sessionId);
    if (session) {
      session.exercises = session.exercises.filter(e => e.id !== exerciseId);
      if (session.exercises.length === 0) {
        week.sessions = week.sessions.filter(s => s.id !== sessionId);
      }
    }
    this.saveWeek(mondayStr, week);
  },

  // Add exercise to existing session
  addExerciseToSession(mondayStr, sessionId, exercise) {
    const week = this.getWeek(mondayStr);
    const session = week.sessions.find(s => s.id === sessionId);
    if (session) {
      exercise.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      session.exercises.push(exercise);
      this.saveWeek(mondayStr, week);
    }
    return exercise;
  },

  // Get all unique exercise names across all data
  getExerciseNames() {
    const all = this.getAll();
    const names = new Set();
    for (const key in all) {
      for (const session of (all[key].sessions || [])) {
        for (const ex of session.exercises) {
          names.add(ex.name);
        }
      }
    }
    return Array.from(names).sort();
  },

  // Get exercise history for progress charts
  getExerciseHistory(exerciseName) {
    const all = this.getAll();
    const history = [];
    const weeks = Object.keys(all).sort();
    for (const weekKey of weeks) {
      for (const session of (all[weekKey].sessions || [])) {
        const matches = session.exercises.filter(
          e => e.name.toLowerCase() === exerciseName.toLowerCase()
        );
        for (const match of matches) {
          history.push({ date: weekKey, sets: match.sets });
        }
      }
    }
    return history;
  },

  // Get weeks that have data
  getWeeksWithData() {
    const all = this.getAll();
    return new Set(Object.keys(all));
  },

  // Settings
  getSettings() {
    const raw = localStorage.getItem(this.SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  saveSettings(settings) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  },

  exportData() {
    return JSON.stringify(this.getAll(), null, 2);
  },

  importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    const existing = this.getAll();
    for (const key in data) {
      if (!existing[key]) {
        existing[key] = data[key];
      } else {
        const existingIds = new Set(existing[key].sessions.map(s => s.id));
        for (const session of (data[key].sessions || [])) {
          if (!existingIds.has(session.id)) {
            existing[key].sessions.push(session);
          }
        }
      }
    }
    this.saveAll(existing);
  },

  // Clean up old v1 data and stale backfill keys
  cleanupLegacy() {
    localStorage.removeItem('workout_tracker_data');
    localStorage.removeItem('workout_tracker_backfilled');
    localStorage.removeItem('workout_tracker_backfilled_v2');
    localStorage.removeItem('workout_tracker_backfilled_v3');
  },

  // Load backfill data on first visit (or re-backfill on version bump)
  async loadBackfill() {
    this.cleanupLegacy();
    const BACKFILL_KEY = 'workout_tracker_backfilled_v5';
    if (localStorage.getItem(BACKFILL_KEY)) return false;
    try {
      // Clear existing v2 data so we get a clean import
      localStorage.removeItem(this.WORKOUTS_KEY);
      localStorage.removeItem('workout_tracker_backfilled_v4');
      const res = await fetch('backfill_data.json');
      if (!res.ok) return false;
      const data = await res.json();
      this.saveAll(data);
      localStorage.setItem(BACKFILL_KEY, '1');
      return true;
    } catch (e) {
      console.warn('Backfill load failed:', e);
      return false;
    }
  }
};
