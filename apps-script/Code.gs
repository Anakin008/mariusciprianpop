/**
 * Google Apps Script — receptor formular mariusciprianpop.ro
 *
 * Pași de instalare (vezi SETUP.md pentru detalii):
 *   1. Creează un Google Sheet nou, numit de ex. "Marius Ciprian Pop — Contact Form"
 *   2. Prima foaie o redenumești "Submissions" (sau actualizează SHEET_NAME mai jos).
 *   3. Adaugă headerele pe rândul 1 (vezi SETUP.md pentru coloane exacte).
 *   4. Extensions → Apps Script. Șterge codul default, lipește acest fișier, salvează.
 *   5. Deploy → New deployment → Type: Web app.
 *      - Execute as: Me (adresa ta)
 *      - Who has access: Anyone
 *      Copiază URL-ul și pune-l în `.env` ca GOOGLE_SHEET_WEBHOOK_URL.
 */

var SHEET_NAME = 'Submissions';
var EXPECTED_HEADERS = [
  'Timestamp',
  'Nume',
  'Telefon',
  'Email',
  'Terms Accepted',
  'User Agent',
  'IP',
  'Source'
];

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'alive' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }

    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    var row = [
      payload.timestamp || new Date().toISOString(),
      payload.nume || '',
      payload.telefon || '',
      payload.email || '',
      payload.terms_accepted === true ? 'YES' : 'NO',
      payload.user_agent || '',
      payload.ip || '',
      payload.source || ''
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setFontWeight('bold');
    return;
  }
  var firstRow = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getValues()[0];
  var needsRewrite = false;
  for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (firstRow[i] !== EXPECTED_HEADERS[i]) { needsRewrite = true; break; }
  }
  if (needsRewrite) {
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setFontWeight('bold');
  }
}
