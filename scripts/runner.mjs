// Manual price-fetch run (SPEC section 5, steps 1-5). Phase 4 adds the alert step; Phase 6 moves this into
// the Worker, where D1 is reached through its binding instead of the wrangler CLI.
// ponytail: SQL strings through wrangler, fine for a manual run; Worker uses prepared statements.
import { d1 as realD1 } from './lib.mjs';
import { sqlText } from './core.mjs';
import { fetchSeries, localDate, previousMonthStart, SPACING_MS, RateLimitError } from '../src/market.mjs';
import { analyze } from '../src/reference.mjs';
import { decideAlert } from '../src/alerts.mjs';

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
    `SELECT Id, Symbol, Currency, AlertThresholdPercent AS Threshold FROM Assets WHERE IsActive = 1 AND Id NOT IN
       (SELECT AssetId FROM CheckResults WHERE RunDate = ${sqlText(runDate)} AND Outcome = 'ok') ORDER BY Symbol`, remote);
  if (!todo.length) {
    log(`Nothing to do for ${runDate}: no active assets, or all already checked.`);
    return { runDate, checked: 0, failed: 0, stoppedByRateLimit: false };
  }

  // Stored references for the months a fetched series can cover (previous and current).
  const stored = {};
  const fromMonth = sqlText(startDate.slice(0, 7));
  for (const r of d1(`SELECT AssetId, ReferenceMonth, ReferenceDate, ReferencePrice, IsBackfilled FROM MonthlyReferencePrices WHERE ReferenceMonth >= ${fromMonth}`, remote)) {
    (stored[r.AssetId] ??= {})[r.ReferenceMonth] = { date: r.ReferenceDate, price: r.ReferencePrice, isBackfilled: r.IsBackfilled };
  }
  const alerts = {};
  for (const r of d1(`SELECT AssetId, ReferenceMonth, Status FROM AlertHistory WHERE ReferenceMonth >= ${fromMonth}`, remote)) {
    (alerts[r.AssetId] ??= {})[r.ReferenceMonth] = { status: r.Status };
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
      const res = analyze({ rows: series.rows, runDate, marketToday, threshold: a.Threshold, storedRefs: stored[a.Id], options: { staleDays } });
      const sql = [];
      if (res.latest) {
        sql.push(`INSERT INTO PriceHistory (AssetId, PriceDate, Price, Currency, RetrievedAt, Source) VALUES (${a.Id}, ${sqlText(res.latest.date)}, ${res.latest.close}, ${sqlText(series.currency ?? a.Currency)}, ${sqlText(nowIso())}, 'twelvedata')
          ON CONFLICT (AssetId, PriceDate) DO UPDATE SET Price = excluded.Price, Currency = excluded.Currency, RetrievedAt = excluded.RetrievedAt`);
      }
      if (res.outcome === 'ok') {
        const ref = res.reference;
        if (res.isNew) {
          sql.push(`INSERT INTO MonthlyReferencePrices (AssetId, ReferenceMonth, ReferenceDate, ReferencePrice, Currency, IsBackfilled) VALUES (${a.Id}, ${sqlText(res.month)}, ${sqlText(ref.date)}, ${ref.price}, ${sqlText(series.currency ?? a.Currency)}, ${ref.isBackfilled ? 1 : 0}) ON CONFLICT (AssetId, ReferenceMonth) DO NOTHING`);
        }
        if (res.adjustment) {
          sql.push(`INSERT INTO ReferenceAdjustments (AssetId, ReferenceMonth, OldPrice, NewPrice, DetectedAt) VALUES (${a.Id}, ${sqlText(res.month)}, ${res.adjustment.oldPrice}, ${res.adjustment.newPrice}, ${sqlText(nowIso())})`);
          sql.push(`UPDATE MonthlyReferencePrices SET ReferencePrice = ${res.adjustment.newPrice} WHERE AssetId = ${a.Id} AND ReferenceMonth = ${sqlText(res.month)}`);
        }
      }
      const alert = decideAlert({ res, existing: alerts[a.Id]?.[res.month] });
      if (alert.type === 'create') {
        // Unique (AssetId, ReferenceMonth) makes a repeated run harmless (BR-04).
        sql.push(`INSERT INTO AlertHistory (AssetId, ReferenceMonth, TriggerPrice, DropPercent, TriggeredAt, Status, ReferenceBackfilled) VALUES (${a.Id}, ${sqlText(res.month)}, ${alert.triggerPrice}, ${alert.dropPercent}, ${sqlText(nowIso())}, 'Pending', ${alert.referenceBackfilled ? 1 : 0}) ON CONFLICT (AssetId, ReferenceMonth) DO NOTHING`);
      } else if (alert.type === 'update') {
        sql.push(`UPDATE AlertHistory SET TriggerPrice = ${alert.triggerPrice}, DropPercent = ${alert.dropPercent}, TriggeredAt = ${sqlText(nowIso())} WHERE AssetId = ${a.Id} AND ReferenceMonth = ${sqlText(res.month)} AND Status <> 'Sent'`);
      } else if (alert.type === 'delete') {
        sql.push(`DELETE FROM AlertHistory WHERE AssetId = ${a.Id} AND ReferenceMonth = ${sqlText(res.month)} AND Status <> 'Sent'`);
      }
      sql.push(result(res.outcome, res.detail));
      d1(sql.join('; '), remote);

      if (res.outcome === 'ok') {
        checked++;
        const notes = [res.isNew && (res.reference.isBackfilled ? 'reference back-filled' : 'new month'), res.adjustment && `REFERENCE RESTATED ${res.adjustment.oldPrice} -> ${res.adjustment.newPrice}`, res.triggered && 'AT/PAST THRESHOLD', alert.type === 'create' && 'ALERT QUEUED (Pending)', alert.type === 'update' && 'pending alert updated', alert.type === 'delete' && 'pending alert withdrawn'].filter(Boolean);
        log(`${a.Symbol}: ${res.detail}${notes.length ? ` [${notes.join(', ')}]` : ''}`);
      } else {
        failed++;
        log(`${a.Symbol}: ${res.outcome.toUpperCase()} ${res.detail}`);
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
