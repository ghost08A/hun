// Shared by the owner scripts: .dev.vars loader and the wrangler D1 runner.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export function loadEnv() {
  const file = path.join(root, '.dev.vars');
  const env = { ...process.env };
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      // Tolerate spaces and surrounding quotes around the value.
      const value = m?.[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
      if (m && !line.trim().startsWith('#') && value) env[m[1]] = value;
    }
  }
  return env;
}

export function d1(sql, remote) {
  const args = [WRANGLER, 'd1', 'execute', 'price-alert', remote ? '--remote' : '--local', '--json', '--command', sql];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`wrangler failed:\n${r.stderr || r.stdout}`);
  const parsed = JSON.parse(r.stdout);
  return parsed[parsed.length - 1]?.results ?? [];
}

// Same shape as src/d1db.mjs, on top of the wrangler CLI, so manual runs use the Worker's code paths.
export const cliDb = (remote) => ({
  query: async (sql) => d1(sql, remote),
  run: async (statements) => { d1(statements.join('; '), remote); },
});
