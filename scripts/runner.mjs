// Manual price-fetch run (SPEC section 5, steps 1-3 and 5-6). Phase 3 adds references and the hold guard;
// Phase 6 moves this into the Worker, where D1 is reached through its binding instead of the wrangler CLI.
// ponytail: SQL strings through wrangler, fine for a manual run; Worker uses prepared statements.
import { d1 as realD1 } from './lib.mjs';
import { sqlText } from './core.mjs';
import { fetchSeries, latestOf, localDate, previousMonthStart, SPACING_MS, RateLimitError } from '../src/market.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export async function runFetch({
  remote = false, label = 'manual', apiKey, fetchFn = fetch, d1 = realD1,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(),
  staleDays = 4, log = console.log,
}) {
  const runDate = localDate(new Date(now()));
  const startDate = previousMonthStart(runDate);
  const marketToday = localDate(new Date(now()), 'America/New_York'); // exclude the unfinished day

  // Idempotent: skip assets that already have a successful check today.
  const todo = d1(
    `SELECT Id, Symbol, Currency FROM Assets WHERE IsActive = 1 AND Id NOT IN
       (SELECT AssetId FROM CheckResults WHERE RunDate = ${sqlText(runDate)} AND Outcome = 'ok') ORDER BY Symbol`, remote);
  if (!todo.length) {
    log(`Nothing to do for ${runDate}: no active assets, or all already checked.`);
    return { runDate, checked: 0, failed: 0, stoppedByRateLimit: false };
  }

  const runId = d1(`INSERT INTO RunLog (TriggerLabel, StartedAt) VALUES (${sqlText(label)}, ${sqlText(nowIso())}) RETURNING Id`, remote)[0].Id;
  let checked = 0, failed = 0, stopped = false;
  const errors = [];
  let lastCall = 0;

  for (const a of todo) {
    const wait = lastCall + SPACING_MS - now();
    if (lastCall && wait > 0) await sleep(wait);
    lastCall = now();

    const result = (outcome, detail) =>
      `INSERT INTO CheckResults (AssetId, RunDate, Outcome, Detail, RunId, CheckedAt) VALUES (${a.Id}, ${sqlText(runDate)}, ${sqlText(outcome)}, ${sqlText(detail)}, ${runId}, ${sqlText(nowIso())})`;
    try {
      const series = await fetchSeries(a.Symbol, startDate, { apiKey, fetchFn });
      const l = latestOf(series, runDate, staleDays, marketToday);
      const price = `INSERT INTO PriceHistory (AssetId, PriceDate, Price, Currency, RetrievedAt, Source) VALUES (${a.Id}, ${sqlText(l.date)}, ${l.close}, ${sqlText(l.currency ?? a.Currency)}, ${sqlText(nowIso())}, 'twelvedata')
        ON CONFLICT (AssetId, PriceDate) DO UPDATE SET Price = excluded.Price, Currency = excluded.Currency, RetrievedAt = excluded.RetrievedAt`;
      if (l.stale) {
        d1(`${price}; ${result('stale', `latest close ${l.date} is older than ${staleDays} days`)}`, remote);
        failed++;
        log(`${a.Symbol}: STALE (${l.date}, ${l.close})`);
      } else {
        d1(`${price}; ${result('ok', `close ${l.close} on ${l.date}`)}`, remote);
        checked++;
        log(`${a.Symbol}: ok ${l.close} ${l.currency ?? ''} on ${l.date}`);
      }
    } catch (e) {
      if (e instanceof RateLimitError) {
        stopped = true;
        errors.push(`rate limited at ${a.Symbol}; remaining assets left for the next run`);
        log(`${a.Symbol}: RATE LIMITED, stopping (resume at the next run)`);
        break;
      }
      d1(result('error', String(e.message).slice(0, 300)), remote);
      failed++;
      errors.push(`${a.Symbol}: ${e.message}`);
      log(`${a.Symbol}: ERROR ${e.message}`);
    }
  }

  d1(`UPDATE RunLog SET FinishedAt = ${sqlText(nowIso())}, AssetsChecked = ${checked}, AssetsFailed = ${failed}, Errors = ${errors.length ? sqlText(errors.join('; ').slice(0, 500)) : 'NULL'} WHERE Id = ${runId}`, remote);
  return { runDate, checked, failed, stoppedByRateLimit: stopped };
}
