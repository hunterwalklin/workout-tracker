// storage.js — localStorage-based data layer with Google Sheets sync

const Storage = {
  WORKOUTS_KEY: 'workout_tracker_data',
  SETTINGS_KEY: 'workout_tracker_settings',

  // Get all workouts
  getAll() {
    const raw = localStorage.getItem(this.WORKOUTS_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  // Save all workouts
  saveAll(data) {
    localStorage.setItem(this.WORKOUTS_KEY, JSON.stringify(data));
  },

  // Get workouts for a specific date (YYYY-MM-DD)
  getByDate(date) {
    const all = this.getAll();
    return all[date] || [];
  },

  // Save exercises for a specific date
  saveForDate(date, exercises) {
    const all = this.getAll();
    if (exercises.length === 0) {
      delete all[date];
    } else {
      all[date] = exercises;
    }
    this.saveAll(all);
  },

  // Add an exercise to a date
  addExercise(date, exercise) {
    const exercises = this.getByDate(date);
    exercise.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    exercises.push(exercise);
    this.saveForDate(date, exercises);
    return exercise;
  },

  // Delete an exercise by id from a date
  deleteExercise(date, exerciseId) {
    let exercises = this.getByDate(date);
    exercises = exercises.filter(e => e.id !== exerciseId);
    this.saveForDate(date, exercises);
  },

  // Get all unique exercise names
  getExerciseNames() {
    const all = this.getAll();
    const names = new Set();
    for (const date in all) {
      for (const ex of all[date]) {
        names.add(ex.name);
      }
    }
    return Array.from(names).sort();
  },

  // Get history for a specific exercise (for charts)
  getExerciseHistory(exerciseName) {
    const all = this.getAll();
    const history = [];
    const dates = Object.keys(all).sort();
    for (const date of dates) {
      const matches = all[date].filter(e => e.name.toLowerCase() === exerciseName.toLowerCase());
      if (matches.length > 0) {
        for (const match of matches) {
          history.push({ date, sets: match.sets });
        }
      }
    }
    return history;
  },

  // Get dates that have workouts within a date range
  getDatesWithData(startDate, endDate) {
    const all = this.getAll();
    const dates = new Set();
    for (const date in all) {
      if (date >= startDate && date <= endDate && all[date].length > 0) {
        dates.add(date);
      }
    }
    return dates;
  },

  // Settings
  getSettings() {
    const raw = localStorage.getItem(this.SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  saveSettings(settings) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  },

  // Export all data as JSON
  exportData() {
    return JSON.stringify(this.getAll(), null, 2);
  },

  // Import data from JSON
  importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    // Merge with existing data
    const existing = this.getAll();
    for (const date in data) {
      if (!existing[date]) {
        existing[date] = data[date];
      } else {
        // Merge exercises, avoiding duplicates by id
        const existingIds = new Set(existing[date].map(e => e.id));
        for (const ex of data[date]) {
          if (!existingIds.has(ex.id)) {
            existing[date].push(ex);
          }
        }
      }
    }
    this.saveAll(existing);
  }
};
