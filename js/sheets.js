// sheets.js — Google Sheets sync via Apps Script Web App

const SheetsSync = {
  getUrl() {
    const settings = Storage.getSettings();
    return settings.sheetsUrl || '';
  },

  isConfigured() {
    return !!this.getUrl();
  },

  // Test connection to Google Sheets
  async testConnection() {
    const url = this.getUrl();
    if (!url) throw new Error('No URL configured');
    const res = await fetch(url + '?action=ping');
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.error || 'Connection failed');
    return data;
  },

  // Push all local data to Google Sheets
  async pushAll() {
    if (!this.isConfigured()) return;
    const url = this.getUrl();
    const allData = Storage.getAll();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sync', data: allData })
    });
    return res.json();
  },

  // Pull all data from Google Sheets and merge
  async pullAll() {
    if (!this.isConfigured()) return;
    const url = this.getUrl();
    const res = await fetch(url + '?action=getAll');
    const data = await res.json();
    if (data.status === 'ok' && data.data) {
      Storage.importData(JSON.stringify(data.data));
    }
    return data;
  },

  // Sync: pull then push
  async sync() {
    if (!this.isConfigured()) return;
    await this.pullAll();
    await this.pushAll();
  },

  // The Google Apps Script code for users to deploy
  getAppsScriptCode() {
    return `// Workout Tracker - Google Apps Script
// Paste this into your Google Sheet's Apps Script editor
// Deploy as Web App (Execute as: Me, Access: Anyone)

function doGet(e) {
  var action = e.parameter.action;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');

  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Data');
    sheet.getRange('A1').setValue('{}');
  }

  if (action === 'ping') {
    return jsonResponse({ status: 'ok', message: 'Connected!' });
  }

  if (action === 'getAll') {
    var raw = sheet.getRange('A1').getValue();
    var data = {};
    try { data = JSON.parse(raw); } catch(e) { data = {}; }
    return jsonResponse({ status: 'ok', data: data });
  }

  return jsonResponse({ status: 'error', error: 'Unknown action' });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data');

  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Data');
  }

  if (body.action === 'sync') {
    // Merge incoming data with existing
    var raw = sheet.getRange('A1').getValue();
    var existing = {};
    try { existing = JSON.parse(raw); } catch(e) { existing = {}; }

    var incoming = body.data || {};
    for (var date in incoming) {
      if (!existing[date]) {
        existing[date] = incoming[date];
      } else {
        var existingIds = {};
        existing[date].forEach(function(ex) { existingIds[ex.id] = true; });
        incoming[date].forEach(function(ex) {
          if (!existingIds[ex.id]) {
            existing[date].push(ex);
          }
        });
      }
    }

    sheet.getRange('A1').setValue(JSON.stringify(existing));
    return jsonResponse({ status: 'ok' });
  }

  return jsonResponse({ status: 'error', error: 'Unknown action' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;
  }
};
