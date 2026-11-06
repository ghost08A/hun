// Usage: npm run fetch [-- --remote] [-- --label NAME]
// Costs 1 Twelve Data credit per asset that has no successful check today.
import { loadEnv, cliDb } from './lib.mjs';
import { runFetch } from '../src/run.mjs';

const argv = process.argv.slice(2);
const remote = argv.includes('--remote');
const li = argv.indexOf('--label');
const label = li >= 0 ? argv[li + 1] : 'manual';

const apiKey = loadEnv().TWELVE_DATA_API_KEY;
if (!apiKey) {
  console.error('TWELVE_DATA_API_KEY is not set (put it in .dev.vars)');
  process.exitCode = 1;
} else {
  runFetch({ db: cliDb(remote), label, apiKey })
    .then((r) => console.log(`\n[${remote ? 'REMOTE' : 'local'}] ${r.runDate}: ok=${r.checked} failed=${r.failed}${r.stoppedByRateLimit ? ' (stopped by rate limit)' : ''}`))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
