#!/usr/bin/env node
'use strict';
// One-shot: remove NOTIFICATION_RECIPIENTS, add EMAIL_TO + EMAIL_TO_BCC
// to production, preview, development. Uses CLI for prod+dev, REST for preview.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function readEnv(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1);
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    vars[k] = v;
  }
  return vars;
}

function cleanEmailList(raw) {
  if (!raw) return '';
  return String(raw)
    .split(',')
    .map(s => s.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean)
    .join(',');
}

const envPath = path.resolve(__dirname, '..', '.env');
const env = readEnv(envPath);

const cwd = path.resolve(__dirname, '..');
const projectConfig = JSON.parse(fs.readFileSync(path.join(cwd, '.vercel', 'project.json'), 'utf8'));
const auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'AppData', 'Roaming', 'com.vercel.cli', 'Data', 'auth.json'), 'utf8'));
const token = auth.token;

const EMAIL_TO = cleanEmailList(env.EMAIL_TO);
const EMAIL_TO_BCC = cleanEmailList(env.EMAIL_TO_BCC);

console.log('Will set on Vercel (cleaned):');
console.log('  EMAIL_TO     =', EMAIL_TO);
console.log('  EMAIL_TO_BCC =', EMAIL_TO_BCC);
console.log('Will remove: NOTIFICATION_RECIPIENTS');
console.log('---');

function vcli(args, opts) {
  return spawnSync('vercel', args, Object.assign({ cwd, encoding: 'utf8', shell: true }, opts || {}));
}

function rmVar(name, envName) {
  const r = vcli(['env', 'rm', name, envName, '--yes']);
  return r.status === 0;
}

function addVarStdin(name, value, envName) {
  const r = spawnSync('vercel', ['env', 'add', name, envName], { cwd, encoding: 'utf8', shell: true, input: value });
  return { ok: r.status === 0, err: r.stderr };
}

async function upsertPreviewViaApi(key, value) {
  // Remove first (best-effort, ignore errors), then create
  try {
    const list = await fetch('https://api.vercel.com/v9/projects/' + projectConfig.projectId + '/env?teamId=' + projectConfig.orgId, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    const matches = (list.envs || []).filter(e => e.key === key && (e.target || []).includes('preview'));
    for (const m of matches) {
      await fetch('https://api.vercel.com/v9/projects/' + projectConfig.projectId + '/env/' + m.id + '?teamId=' + projectConfig.orgId, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
      });
    }
  } catch (_) {}
  const url = 'https://api.vercel.com/v10/projects/' + projectConfig.projectId + '/env?upsert=true&teamId=' + projectConfig.orgId;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, type: 'encrypted', target: ['preview'] })
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function removePreviewViaApi(key) {
  try {
    const list = await fetch('https://api.vercel.com/v9/projects/' + projectConfig.projectId + '/env?teamId=' + projectConfig.orgId, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    const matches = (list.envs || []).filter(e => e.key === key && (e.target || []).includes('preview'));
    for (const m of matches) {
      await fetch('https://api.vercel.com/v9/projects/' + projectConfig.projectId + '/env/' + m.id + '?teamId=' + projectConfig.orgId, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
      });
    }
    return matches.length;
  } catch (e) { return 0; }
}

(async () => {
  // 1. Remove NOTIFICATION_RECIPIENTS from all 3 envs
  for (const e of ['production', 'development']) {
    const r = rmVar('NOTIFICATION_RECIPIENTS', e);
    console.log('rm NOTIFICATION_RECIPIENTS @ ' + e + ' -> ' + (r ? 'OK' : 'not found / fail'));
  }
  const removedPrev = await removePreviewViaApi('NOTIFICATION_RECIPIENTS');
  console.log('rm NOTIFICATION_RECIPIENTS @ preview -> removed ' + removedPrev + ' entries');

  // 2. Add EMAIL_TO + EMAIL_TO_BCC to all 3 envs
  for (const [name, value] of [['EMAIL_TO', EMAIL_TO], ['EMAIL_TO_BCC', EMAIL_TO_BCC]]) {
    if (!value) { console.log('SKIP ' + name + ' (empty)'); continue; }
    for (const e of ['production', 'development']) {
      // Remove old value if exists
      rmVar(name, e);
      const r = addVarStdin(name, value, e);
      console.log('add ' + name + ' @ ' + e + ' -> ' + (r.ok ? 'OK' : 'FAIL ' + (r.err || '').slice(0, 200)));
    }
    const r2 = await upsertPreviewViaApi(name, value);
    console.log('add ' + name + ' @ preview -> ' + (r2.ok ? 'OK [' + r2.status + ']' : 'FAIL ' + r2.body.slice(0, 200)));
  }

  console.log('\nDone.');
})().catch(e => { console.error('fatal:', e); process.exit(1); });
