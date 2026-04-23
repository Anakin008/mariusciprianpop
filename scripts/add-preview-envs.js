#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function readEnvFile(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1);
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    vars[k] = v;
  }
  return vars;
}

const authPath = path.join(os.homedir(), 'AppData', 'Roaming', 'com.vercel.cli', 'Data', 'auth.json');
const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const token = auth.token;

const projectConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.vercel', 'project.json'), 'utf8'));
const projectId = projectConfig.projectId;
const teamId = projectConfig.orgId;

const env = readEnvFile(path.resolve(__dirname, '..', '.env'));

const VARS = ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_SHEET_ID', 'RESEND_API_KEY', 'NOTIFICATION_RECIPIENTS', 'FROM_EMAIL'];

async function upsertPreview(key, value) {
  const url = 'https://api.vercel.com/v10/projects/' + projectId + '/env?upsert=true&teamId=' + teamId;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      key: key,
      value: value,
      type: 'encrypted',
      target: ['preview']
    })
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

(async () => {
  for (const k of VARS) {
    const v = env[k];
    if (!v) { console.log('SKIP', k, '(empty)'); continue; }
    const r = await upsertPreview(k, v);
    console.log((r.ok ? 'OK  ' : 'FAIL') + ' ' + k + ' [' + r.status + '] ' + (r.ok ? '' : r.body.slice(0, 300)));
  }
})();
