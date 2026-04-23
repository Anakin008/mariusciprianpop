#!/usr/bin/env node
// Sync env vars from .env to Vercel (production, preview, development).
// Uses `vercel env add <name> <env>` with value piped via stdin.
// If var already exists on that environment, removes it first then re-adds.

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ENV_NAMES = ['production', 'preview', 'development'];
const VARS_TO_SYNC = [
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SHEET_ID',
  'RESEND_API_KEY',
  'NOTIFICATION_RECIPIENTS',
  'FROM_EMAIL'
];

function readEnvFile(envPath) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let v = line.slice(eq + 1);
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    vars[key] = v;
  }
  return vars;
}

function run(cmd, args, opts) {
  opts = opts || {};
  return spawnSync(cmd, args, Object.assign({ encoding: 'utf8', shell: true }, opts));
}

function listExisting() {
  const r = run('vercel', ['env', 'ls', '--json'], { cwd: path.resolve(__dirname, '..') });
  if (r.status !== 0) {
    // vercel env ls --json may not be supported; try plain
    const r2 = run('vercel', ['env', 'ls'], { cwd: path.resolve(__dirname, '..') });
    return r2.stdout + '\n' + r2.stderr;
  }
  return r.stdout;
}

function removeIfExists(name, environment) {
  const cwd = path.resolve(__dirname, '..');
  const r = run('vercel', ['env', 'rm', name, environment, '--yes'], { cwd });
  // non-zero is fine (means it didn't exist)
  return r.status === 0;
}

function addVar(name, value, environment) {
  const cwd = path.resolve(__dirname, '..');
  const r = spawnSync('vercel', ['env', 'add', name, environment], {
    cwd, encoding: 'utf8', shell: true, input: value
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout,
    stderr: r.stderr,
    status: r.status
  };
}

function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const vars = readEnvFile(envPath);

  console.log('Existing Vercel env vars (for reference):');
  console.log(listExisting());
  console.log('---');

  const report = [];
  for (const name of VARS_TO_SYNC) {
    const value = vars[name];
    if (value === undefined || value === null || value === '') {
      report.push(`SKIP ${name}: empty in .env`);
      continue;
    }
    for (const envName of ENV_NAMES) {
      process.stdout.write(`  ${name} -> ${envName} ... `);
      removeIfExists(name, envName);
      const r = addVar(name, value, envName);
      if (r.ok) {
        console.log('OK');
        report.push(`OK    ${name} / ${envName}`);
      } else {
        console.log('FAIL');
        console.log('  stderr:', (r.stderr || '').trim().slice(0, 500));
        report.push(`FAIL  ${name} / ${envName}: ${(r.stderr || '').trim().slice(0, 200)}`);
      }
    }
  }
  console.log('\n=== Summary ===');
  report.forEach(l => console.log(l));
}

main();
