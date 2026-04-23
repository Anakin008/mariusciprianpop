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
    const key = line.slice(0, eq).trim(); let v = line.slice(eq + 1);
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    vars[key] = v;
  }
  return vars;
}

async function tryCall(label, fn) {
  try {
    const r = await fn();
    console.log(`[OK] ${label}`);
    return r;
  } catch (e) {
    const code = e.code || (e.response && e.response.status);
    const msg = e.message || String(e);
    const data = e.response && e.response.data ? JSON.stringify(e.response.data).slice(0, 400) : '';
    console.log(`[FAIL] ${label} code=${code} msg=${msg} data=${data}`);
    return null;
  }
}

async function main() {
  const vars = readEnv();
  const sa = JSON.parse(vars.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });
  await auth.authorize();
  console.log('client_email:', sa.client_email);
  console.log('project_id:', sa.project_id);

  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  await tryCall('drive.about.get', () =>
    drive.about.get({ fields: 'user,storageQuota' })
  ).then(r => { if (r) console.log('  user:', JSON.stringify(r.data.user), 'quota:', JSON.stringify(r.data.storageQuota)); });

  await tryCall('drive.files.list (shared)', () =>
    drive.files.list({ pageSize: 1, fields: 'files(id,name)' })
  );

  await tryCall('sheets.spreadsheets.create (minimal)', () =>
    sheets.spreadsheets.create({ requestBody: { properties: { title: 'diag-test-'+Date.now() } } })
  ).then(r => { if (r) console.log('  created id:', r.data.spreadsheetId); });
}

main().catch(e => { console.error('fatal:', e.message); process.exit(1); });
