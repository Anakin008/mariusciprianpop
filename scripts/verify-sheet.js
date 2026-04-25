'use strict';
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function readEnv() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1);
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    vars[k] = v;
  }
  return vars;
}

(async () => {
  const vars = readEnv();
  const sa = JSON.parse(vars.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.JWT({
    email: sa.client_email, key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: vars.GOOGLE_SHEET_ID,
    range: 'Submissions!A1:H10'
  });
  const rows = r.data.values || [];
  console.log('Rows in Sheet (showing first 10):');
  rows.forEach((row, idx) => {
    console.log('  ' + String(idx + 1).padStart(2, ' ') + ': ' + row.map(c => (c || '').toString().slice(0, 50)).join(' | '));
  });
  console.log('\nTotal rows: ' + rows.length + ' (including header)');
})().catch(e => { console.error('fail:', e.message); process.exit(1); });
