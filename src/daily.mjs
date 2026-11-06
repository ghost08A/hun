// The scheduled job (SPEC section 5): check prices, send queued alerts, and on the final run of the day warn
// the owner once if no asset got a valid price. Each step is isolated so one failure cannot skip the next.
import { runFetch } from './run.mjs';
import { sendPending } from './notifier.mjs';
import { pushText } from './line.mjs';
import { localDate } from './market.mjs';
import { sqlText } from './sql.mjs';

// Pure so it is easy to test: warn only after the final run, with assets to check and none checked OK today.
export const shouldWarn = ({ isFinalRun, activeAssets, okToday }) => isFinalRun && activeAssets > 0 && okToday === 0;

export async function dailyJob({
  db, env, label, isFinalRun = false, fetchFn = fetch, log = console.log, runOptions = {},
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(),
}) {
  const line = env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_USER_ID
    ? { token: env.LINE_CHANNEL_ACCESS_TOKEN, userId: env.LINE_USER_ID } : null;
  const out = { run: null, notify: null, warned: false };

  try {
    out.run = await runFetch({ db, label, apiKey: env.TWELVE_DATA_API_KEY, fetchFn, sleep, now, log, ...runOptions });
  } catch (e) {
    log(`run failed: ${e.message}`);
  }

  if (!line) {
    log('LINE is not configured: alerts stay Pending.');
    return out;
  }
  try {
    out.notify = await sendPending({ db, ...line, fetchFn, sleep, log });
  } catch (e) {
    log(`sending alerts failed: ${e.message}`);
  }

  if (isFinalRun) {
    try {
      const runDate = localDate(new Date(now()));
      const [{ activeAssets }] = await db.query('SELECT COUNT(*) AS activeAssets FROM Assets WHERE IsActive = 1');
      const [{ okToday }] = await db.query(`SELECT COUNT(*) AS okToday FROM CheckResults WHERE RunDate = ${sqlText(runDate)} AND Outcome = 'ok'`);
      if (shouldWarn({ isFinalRun, activeAssets, okToday })) {
        await pushText({
          ...line, fetchFn, retryKey: crypto.randomUUID(),
          text: `⚠️ วันนี้ (${runDate}) ดึงราคาไม่ได้เลยสักตัว ตรวจสอบด้วย: npm run assets -- status`,
        });
        out.warned = true;
        log('Warned the owner: no valid price today.');
      }
    } catch (e) {
      log(`failure warning failed: ${e.message}`);
    }
  }
  return out;
}
