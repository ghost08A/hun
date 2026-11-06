// Reference engine (SPEC section 4: BR-01, BR-02, BR-05, BR-06, BR-07). Pure: takes the fetched series and the
// stored references, returns what to store and how the asset stands. No I/O, so the Worker can reuse it.
import { isStale } from './market.mjs';

export const DEFAULTS = {
  staleDays: 4,
  jumpPercent: 40,   // BR-07 hold guard: single-day move beyond this looks like an unrestated split
  holdWindow: 3,     // only the newest N daily moves count, so a hold lasts at most 3 trading days
  tolerance: 0.001,  // 0.1% relative: stored vs re-derived reference
};

export const dropPercent = (ref, price) => ((ref - price) / ref) * 100;
export const targetPrice = (ref, thresholdPercent) => ref * (1 - thresholdPercent / 100);

// rows: newest first, [{date, close}]. Returns the largest move among the newest holdWindow pairs, or null.
export function findJump(rows, { jumpPercent, holdWindow }) {
  let worst = null;
  for (let i = 0; i < Math.min(holdWindow, rows.length - 1); i++) {
    const newer = rows[i];
    const older = rows[i + 1];
    const pct = (Math.abs(newer.close - older.close) / older.close) * 100;
    if (pct > jumpPercent && (!worst || pct > worst.pct)) worst = { pct, newer: newer.date, older: older.date };
  }
  return worst;
}

// storedRefs: { 'YYYY-MM': { date, price } }. threshold: the asset's alert threshold percent.
// marketToday: the exchange's current date; rows from that day on are unfinished (BR-06) and dropped.
export function analyze({ rows: all, runDate, marketToday, threshold, storedRefs = {}, options = {} }) {
  const o = { ...DEFAULTS, ...options };
  const rows = all.filter((r) => !marketToday || r.date < marketToday);
  if (!rows.length) return { outcome: 'error', detail: 'no completed daily close yet' };

  const latest = rows[0];
  if (isStale(latest.date, runDate, o.staleDays)) {
    return { outcome: 'stale', latest, detail: `latest close ${latest.date} is older than ${o.staleDays} days` };
  }

  const jump = findJump(rows, o);
  if (jump) {
    return {
      outcome: 'held', latest,
      detail: `close moved ${jump.pct.toFixed(1)}% between ${jump.older} and ${jump.newer}; possible unrestated split, evaluation held`,
    };
  }

  // BR-05: the reference month is the month of the latest close's market date.
  const month = latest.date.slice(0, 7);
  const stored = storedRefs[month];
  let reference;
  let adjustment = null;
  let isNew = false;

  if (!stored) {
    // BR-01: first trading day of the month; earliest valid close if that day is missing.
    const first = rows.filter((r) => r.date.startsWith(month)).at(-1);
    reference = { date: first.date, price: first.close, isBackfilled: first.date !== latest.date };
    isNew = true;
  } else {
    reference = { date: stored.date, price: stored.price };
    const same = rows.find((r) => r.date === stored.date);
    if (same && Math.abs(same.close - stored.price) / stored.price > o.tolerance) {
      adjustment = { oldPrice: stored.price, newPrice: same.close };
      reference.price = same.close;
    }
  }

  const drop = dropPercent(reference.price, latest.close);
  return {
    outcome: 'ok', latest, month, reference, isNew, adjustment,
    dropPercent: drop, targetPrice: targetPrice(reference.price, threshold),
    triggered: drop >= threshold - 1e-9, // BR-03 with float slack; Phase 4 acts on it
    detail: `close ${latest.close} on ${latest.date}; ref ${reference.price} (${reference.date}); drop ${drop.toFixed(2)}%`,
  };
}
