// Usage: npm run backup            export the deployed (remote) database to backups/price-alert-<date>.sql
//        npm run backup -- --local export the local development database instead
// backups/ is gitignored. The dump holds your assets and history, so keep it private.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './lib.mjs';

const local = process.argv.includes('--local');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(root, 'backups');
mkdirSync(dir, { recursive: true });
const out = path.join(dir, `price-alert-${local ? 'local-' : ''}${stamp}.sql`);

const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const r = spawnSync(process.execPath, [wrangler, 'd1', 'export', 'price-alert', local ? '--local' : '--remote', '--output', out], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) {
  console.error('Backup failed.');
  process.exitCode = 1;
} else {
  console.log(`\nBackup written to ${path.relative(root, out)}`);
}
