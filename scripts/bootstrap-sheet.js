#!/usr/bin/env node
// Bootstrap Google Sheet for Marius Ciprian Pop contact form.
// Works with a pre-existing Sheet that the user shared with the service account.
// - Extracts sheet ID from GOOGLE_SHEET_URL if GOOGLE_SHEET_ID not set
// - Verifies SA has write access
// - Renames first tab to "Submissions" (if it's the default "Sheet1")
// - Sets 8 headers, bold formatting, frozen header row, auto-resize columns
// - Writes final GOOGLE_SHEET_ID back to .env

'use strict';
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function readEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return { raw, vars };
}

function writeEnvVar(envPath, key, value) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const re = new RegExp('^' + key + '\\s*=.*$', 'm');
  const line = key + '="' + value + '"';
  let updated;
  if (re.test(raw)) {
    updated = raw.replace(re, line);
  } else {
    updated = raw.replace(/\s*$/, '\n') + line + '\n';
  }
  fs.writeFileSync(envPath, updated, 'utf8');
}

function extractSheetId(urlOrId) {
  if (!urlOrId) return '';
  urlOrId = urlOrId.trim();
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // raw id
  return urlOrId;
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const { vars } = readEnvFile(envPath);

  const saRaw = vars.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saRaw) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON missing in .env'); process.exit(1); }

  let sa;
  try { sa = JSON.parse(saRaw); } catch (e) { console.error('Invalid SA JSON:', e.message); process.exit(1); }

  const urlId = extractSheetId(vars.GOOGLE_SHEET_URL);
  const idId = extractSheetId(vars.GOOGLE_SHEET_ID);
  // Prefer URL-derived (longer wins)
  let sheetId = (urlId && urlId.length > idId.length) ? urlId : idId;
  if (!sheetId) {
    console.error('\nGOOGLE_SHEET_ID si GOOGLE_SHEET_URL sunt amandoua goale.');
    process.exit(1);
  }
  console.log('Using sheet ID (length=' + sheetId.length + '):', sheetId);

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  console.log('Authenticated as', sa.client_email);
  console.log('Target sheet ID:', sheetId);

  const sheetsApi = google.sheets({ version: 'v4', auth });

  // Verify read access
  let meta;
  try {
    meta = await sheetsApi.spreadsheets.get({ spreadsheetId: sheetId, fields: 'properties.title,sheets.properties(sheetId,title,gridProperties)' });
  } catch (e) {
    console.error('Nu pot accesa sheet-ul:', e.message);
    if (e.code === 404) console.error('Probabil ID-ul e gresit (verifica URL-ul din .env).');
    if (e.code === 403) console.error('Service account-ul nu are acces. Verifica ca ai share-uit sheet-ul cu ' + sa.client_email + ' ca Editor.');
    process.exit(1);
  }

  console.log('Sheet title:', meta.data.properties.title);
  const firstSheet = meta.data.sheets[0];
  const firstSheetInnerId = firstSheet.properties.sheetId;
  const firstSheetTitle = firstSheet.properties.title;
  console.log('First tab:', firstSheetTitle, '(id:', firstSheetInnerId, ')');

  const HEADERS = ['Timestamp', 'Nume', 'Telefon', 'Email', 'Terms Accepted', 'User Agent', 'IP', 'Source'];
  const DESIRED_TAB_NAME = 'Submissions';

  const requests = [];

  // Rename first tab if not already Submissions
  if (firstSheetTitle !== DESIRED_TAB_NAME) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: firstSheetInnerId, title: DESIRED_TAB_NAME },
        fields: 'title'
      }
    });
  }

  // Ensure enough columns
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: firstSheetInnerId,
        gridProperties: { frozenRowCount: 1 }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Write headers
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: DESIRED_TAB_NAME + '!A1:H1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] }
  }).catch(async (e) => {
    // If tab rename hasn't applied yet, fall back to the original title
    if (firstSheetTitle !== DESIRED_TAB_NAME) {
      return sheetsApi.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: firstSheetTitle + '!A1:H1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] }
      });
    }
    throw e;
  });

  // Format header + autoresize
  requests.push({
    repeatCell: {
      range: { sheetId: firstSheetInnerId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          backgroundColor: { red: 0.92, green: 0.92, blue: 0.92 }
        }
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)'
    }
  });
  requests.push({
    autoResizeDimensions: {
      dimensions: { sheetId: firstSheetInnerId, dimension: 'COLUMNS', startIndex: 0, endIndex: HEADERS.length }
    }
  });

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests } });
  }

  writeEnvVar(envPath, 'GOOGLE_SHEET_ID', sheetId);
  console.log('\n=== DONE ===');
  console.log('Sheet ID:', sheetId);
  console.log('URL: https://docs.google.com/spreadsheets/d/' + sheetId + '/edit');
}

main().catch((err) => {
  console.error('\nFAILED:');
  console.error(err && err.message ? err.message : err);
  if (err && err.response && err.response.data) {
    console.error('Response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
