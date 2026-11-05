// Market-data client (SPEC sections 2 and 5). No Node-only APIs, so the Worker can reuse it.
// Assumed /time_series shape (verify live): { meta:{symbol,currency,...}, values:[{datetime,close,...}], status:"ok" }
// or { code, message, status:"error" }.

export class RateLimitError extends Error {}
export class ApiError extends Error {}

export const SPACING_MS = 7500; // 8 credits/minute on the free plan

export function seriesUrl(symbol, startDate, apiKey) {
  const p = new URLSearchParams({ symbol, interval: '1day', start_date: startDate, outputsize: '5000', adjust: 'splits', apikey: apiKey });
  return `https://api.twelvedata.com/time_series?${p}`;
}

// 'YYYY-MM-DD' for the given instant in a timezone (Bangkok has no DST).
export function localDate(now = new Date(), timeZone = 'Asia/Bangkok') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// First day of the calendar month before runDate's month.
export function previousMonthStart(runDate) {
  const [y, m] = runDate.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000);
}

// BR-06: older than staleDays calendar days (price date to run date) is not current.
export function isStale(priceDate, runDate, staleDays = 4) {
  return daysBetween(priceDate, runDate) > staleDays;
}

export function parseSeries(json) {
  if (!json || json.status === 'error' || json.code) {
    const msg = json?.message ?? 'no response';
    if (Number(json?.code) === 429) throw new RateLimitError(msg);
    throw new ApiError(`${json?.code ?? ''} ${msg}`.trim());
  }
  const rows = (json.values ?? [])
    .map((v) => ({ date: String(v.datetime ?? '').slice(0, 10), close: Number(v.close) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close) && r.close > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  if (!rows.length) throw new ApiError('no valid price rows');
  return { symbol: json.meta?.symbol, currency: json.meta?.currency, rows };
}

export async function fetchSeries(symbol, startDate, { apiKey, fetchFn = fetch }) {
  const res = await fetchFn(seriesUrl(symbol, startDate, apiKey));
  if (res.status === 429) throw new RateLimitError('HTTP 429');
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`HTTP ${res.status}: unreadable response`);
  }
  return parseSeries(json);
}

// Latest completed close and its staleness. Rows dated on or after beforeDate (the exchange's current date)
// are dropped: while that day's market is open or not yet final, Twelve Data returns a partial bar (BR-06).
// Phase 3 adds the hold guard and references on top of the same filtered series.
export function latestOf(series, runDate, staleDays = 4, beforeDate) {
  const rows = beforeDate ? series.rows.filter((r) => r.date < beforeDate) : series.rows;
  if (!rows.length) throw new ApiError('no completed daily close yet');
  return { ...rows[0], currency: series.currency, stale: isStale(rows[0].date, runDate, staleDays) };
}
