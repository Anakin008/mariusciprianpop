'use strict';

const { google } = require('googleapis');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SHEET_TAB = 'Submissions';
const SHEET_RANGE = SHEET_TAB + '!A:H';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.length > 0) {
    return header.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

let cachedSheetsClient = null;
function getSheetsClient() {
  if (cachedSheetsClient) return cachedSheetsClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var missing');
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not valid JSON'); }
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  cachedSheetsClient = google.sheets({ version: 'v4', auth });
  return cachedSheetsClient;
}

async function appendToSheet(row) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID env var missing');
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: SHEET_RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function sendEmail({ apiKey, from, to, subject, html, replyTo }) {
  const body = { from, to, subject, html };
  if (replyTo) body.reply_to = replyTo;
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error('Resend ' + res.status + ': ' + text.slice(0, 300));
  }
  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const body = await parseBody(req);
  const nume = typeof body.nume === 'string' ? body.nume.trim() : '';
  const telefon = typeof body.telefon === 'string' ? body.telefon.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const termsAccepted = body.terms_accepted === true;
  const source = typeof body.source === 'string' ? body.source.slice(0, 120) : '';

  if (!nume || nume.length > 200) {
    res.status(400).end(JSON.stringify({ error: 'Numele lipsește sau e prea lung.' }));
    return;
  }
  if (!telefon || telefon.length > 60) {
    res.status(400).end(JSON.stringify({ error: 'Numărul de telefon lipsește sau e invalid.' }));
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).end(JSON.stringify({ error: 'Adresa de email e invalidă.' }));
    return;
  }
  if (!termsAccepted) {
    res.status(400).end(JSON.stringify({ error: 'Trebuie să accepți Termenii și Condițiile.' }));
    return;
  }

  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 300);
  const ip = getClientIp(req).slice(0, 60);
  const timestamp = new Date().toISOString();

  const row = [timestamp, nume, telefon, email, termsAccepted ? 'YES' : 'NO', userAgent, ip, source];

  const results = { sheet: null, email: null };
  let hadFailure = false;

  try {
    await appendToSheet(row);
    results.sheet = 'ok';
  } catch (err) {
    results.sheet = 'failed: ' + err.message;
    hadFailure = true;
    console.error('[contact] sheet error:', err);
  }

  const resendKey = process.env.RESEND_API_KEY;
  const recipientsRaw = process.env.NOTIFICATION_RECIPIENTS || '';
  const fromEmail = process.env.FROM_EMAIL || 'Marius Ciprian Pop <onboarding@resend.dev>';
  const recipients = recipientsRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (resendKey && recipients.length > 0) {
    try {
      const html = [
        '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">',
        '<h2 style="margin:0 0 16px;">Solicitare nouă prin formular</h2>',
        '<p style="margin:0 0 8px;"><strong>Nume:</strong> ' + escapeHtml(nume) + '</p>',
        '<p style="margin:0 0 8px;"><strong>Telefon:</strong> ' + escapeHtml(telefon) + '</p>',
        '<p style="margin:0 0 8px;"><strong>Email:</strong> <a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a></p>',
        '<p style="margin:16px 0 0;color:#666;font-size:12px;">',
        'Trimis: ' + escapeHtml(timestamp) + '<br>',
        'Sursă: ' + escapeHtml(source || '-') + '<br>',
        'IP: ' + escapeHtml(ip || '-') + '<br>',
        'User-Agent: ' + escapeHtml(userAgent || '-'),
        '</p>',
        '</div>'
      ].join('');

      await sendEmail({
        apiKey: resendKey,
        from: fromEmail,
        to: recipients,
        subject: 'Solicitare nouă de la ' + nume + ' (mariusciprianpop.ro)',
        html,
        replyTo: email
      });
      results.email = 'ok';
    } catch (err) {
      results.email = 'failed: ' + err.message;
      hadFailure = true;
      console.error('[contact] email error:', err);
    }
  } else {
    results.email = 'skipped (RESEND_API_KEY or NOTIFICATION_RECIPIENTS not set)';
    if (!resendKey) console.warn('[contact] RESEND_API_KEY not set');
    if (recipients.length === 0) console.warn('[contact] NOTIFICATION_RECIPIENTS empty');
  }

  const sheetOk = results.sheet === 'ok';
  const emailOk = results.email === 'ok';

  if (!sheetOk && !emailOk) {
    res.status(502).end(JSON.stringify({
      error: 'Nu am putut procesa cererea. Te rog încearcă din nou peste câteva momente.',
      details: results
    }));
    return;
  }

  res.status(200).end(JSON.stringify({
    ok: true,
    partial: hadFailure,
    results
  }));
};
