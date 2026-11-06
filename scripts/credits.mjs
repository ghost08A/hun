// Usage: npm run credits
// Shows today's Twelve Data credits (used, limit, left). Free: the usage endpoint does not consume credits.
import { loadEnv } from './lib.mjs';
import { fetchUsage } from '../src/market.mjs';
import { formatCredits } from '../src/chat.mjs';

const apiKey = loadEnv().TWELVE_DATA_API_KEY;
if (!apiKey) {
  console.error('TWELVE_DATA_API_KEY is not set (put it in .dev.vars)');
  process.exitCode = 1;
} else {
  const usage = await fetchUsage({ apiKey });
  console.log(formatCredits(usage));
  if (!usage) process.exitCode = 1;
}
