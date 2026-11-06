// Sends Pending and Failed alerts through LINE and records the result (SPEC BR-04, BR-08).
// Phase 6 calls the same logic from the Worker after each daily run.
// ponytail: if the process dies after LINE accepts but before the row is updated, the next run could resend; the
// retry key only covers retries inside one call. Single owner and rare alerts make that acceptable for now.
import { randomUUID } from 'node:crypto';
import { d1 as realD1 } from './lib.mjs';
import { sqlText } from './core.mjs';
import { pushText, deliver, alertText } from '../src/line.mjs';

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export async function sendPending({
  remote = false, token, userId, fetchFn = fetch, d1 = realD1, log = console.log,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxAttempts = 3, retrySeconds = 60,
}) {
  const rows = d1(
    `SELECT h.Id, a.Symbol, a.Name, a.Currency, a.AlertThresholdPercent AS Threshold, h.TriggerPrice, h.DropPercent,
            h.ReferenceBackfilled, r.ReferencePrice, r.ReferenceDate,
            (SELECT PriceDate FROM PriceHistory p WHERE p.AssetId = h.AssetId AND p.Price = h.TriggerPrice ORDER BY PriceDate DESC LIMIT 1) AS PriceDate
     FROM AlertHistory h
     JOIN Assets a ON a.Id = h.AssetId
     JOIN MonthlyReferencePrices r ON r.AssetId = h.AssetId AND r.ReferenceMonth = h.ReferenceMonth
     WHERE h.Status IN ('Pending', 'Failed') ORDER BY h.Id`, remote);
  if (!rows.length) {
    log('No pending alerts.');
    return { sent: 0, failed: 0 };
  }

  let sent = 0, failed = 0;
  for (const row of rows) {
    const retryKey = randomUUID(); // one key per alert, shared by its retries, so a retry cannot double-deliver
    const out = await deliver({
      send: () => pushText({ token, userId, text: alertText(row), retryKey, fetchFn }),
      maxAttempts, retrySeconds, sleep,
    });
    if (out.status === 'Sent') {
      d1(`UPDATE AlertHistory SET Status = 'Sent', SentAt = ${sqlText(nowIso())}, ProviderMessageId = ${out.messageId ? sqlText(out.messageId) : 'NULL'} WHERE Id = ${row.Id} AND Status <> 'Sent'`, remote);
      sent++;
      log(`${row.Symbol}: SENT (attempt ${out.attempts})`);
    } else {
      d1(`UPDATE AlertHistory SET Status = 'Failed' WHERE Id = ${row.Id} AND Status <> 'Sent'`, remote);
      failed++;
      log(`${row.Symbol}: FAILED after ${out.attempts} attempt(s): ${out.error} (will retry at the next run)`);
    }
  }
  return { sent, failed };
}
