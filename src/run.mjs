// One price-check run (SPEC section 5, steps 1-5). Runs in the Worker and from the manual scripts: it only
// needs `db` (see d1db.mjs), fetch, and a sleep function, so it has no Node-only dependencies.
import { sqlText } from './sql.mjs';
import { fetchSeries, localDate, previousMonthStart, SPACING_MS, RateLimitError } from './market.mjs';
import { analyze } from './reference.mjs';
import { decideAlert } from './alerts.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// maxFetches: Workers Free allows 50 subrequests per invocation; stop at 45 and leave the rest for the next trigger.
export async function runFetch({
  db, label = 'manual', apiKey, fetchFn = fetch, maxFetches = 45,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(),
  staleDays = 4, log = console.log,
}) {
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is not set');
  const runDate = localDate(new Date(now()));
  const startDate = previousMonthStart(runDate);
  const marketToday = localDate(new Date(now()), 'America/New_York'); // exclude the unfinished day

  // Idempotent: skip assets that already have a successful check today.
  const todo = await db.query(
    `SELECT Id, Symbol, Currency, AlertThresholdPercent AS Threshold FROM Assets WHERE IsActive = 1 AND Id NOT IN
       (SELECT AssetId FROM CheckResults WHERE RunDate = ${sqlText(runDate)} AND Outcome = 'ok') ORDER BY Symbol`);
  if (!todo.length) {
    log(`Nothing to do for ${runDate}: no active assets, or all already checked.`);
    return { runDate, checked: 0, failed: 0, stoppedByRateLimit: false, stoppedByBudget: false };
  }

  // Stored references and alerts for the months a fetched series can cover (previous and current).
  const fromMonth = sqlText(startDate.slice(0, 7));
  const stored = {};
  for (const r of await db.query(`SELECT AssetId, ReferenceMonth, ReferenceDate, ReferencePrice, IsBackfilled FROM MonthlyReferencePrices WHERE ReferenceMonth >= ${fromMonth}`)) {
    (stored[r.AssetId] ??= {})[r.ReferenceMonth] = { date: r.ReferenceDate, price: r.ReferencePrice, isBackfilled: r.IsBackfilled };
  }
  const alerts = {};
  for (const r of await db.query(`SELECT AssetId, ReferenceMonth, Status FROM AlertHistory WHERE ReferenceMonth >= ${fromMonth}`)) {
    (alerts[r.AssetId] ??= {})[r.ReferenceMonth] = { status: r.Status };
  }

  const runId = (await db.query(`INSERT INTO RunLog (TriggerLabel, StartedAt) VALUES (${sqlText(label)}, ${sqlText(nowIso())}) RETURNING Id`))[0].Id;
  let checked = 0, failed = 0, stopped = false, outOfBudget = false, fetches = 0;
  const errors = [];
  let lastCall = 0;

  for (const a of todo) {
    if (fetches >= maxFetches) {
      outOfBudget = true;
      errors.push(`subrequest budget (${maxFetches}) reached at ${a.Symbol}; rest left for the next trigger`);
      log(`${a.Symbol}: budget reached, stopping`);
      break;
    }
    const wait = lastCall + SPACING_MS - now();
    if (lastCall && wait > 0) await sleep(wait);
    lastCall = now();

    const result = (outcome, detail) =>
      `INSERT INTO CheckResults (AssetId, RunDate, Outcome, Detail, RunId, CheckedAt) VALUES (${a.Id}, ${sqlText(runDate)}, ${sqlText(outcome)}, ${sqlText(detail)}, ${runId}, ${sqlText(nowIso())})`;
    try {
      fetches++;
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
      await db.run(sql);

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
      await db.run([result('error', String(e.message).slice(0, 300))]);
      failed++;
      errors.push(`${a.Symbol}: ${e.message}`);
      log(`${a.Symbol}: ERROR ${e.message}`);
    }
  }

  await db.run([`UPDATE RunLog SET FinishedAt = ${sqlText(nowIso())}, AssetsChecked = ${checked}, AssetsFailed = ${failed}, Errors = ${errors.length ? sqlText(errors.join('; ').slice(0, 500)) : 'NULL'} WHERE Id = ${runId}`]);
  return { runDate, checked, failed, stoppedByRateLimit: stopped, stoppedByBudget: outOfBudget };
}
