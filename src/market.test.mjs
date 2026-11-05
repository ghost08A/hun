import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seriesUrl, localDate, previousMonthStart, daysBetween, isStale, parseSeries,
  fetchSeries, latestOf, RateLimitError, ApiError,
} from './market.mjs';

const ok = {
  meta: { symbol: 'AAPL', currency: 'USD' },
  values: [
    { datetime: '2026-11-03', close: '230.00' },
    { datetime: '2026-11-04', close: '231.50' },
    { datetime: '2026-10-30', close: 'bad' },
  ],
  status: 'ok',
};

test('series URL is split-adjusted daily from the given start', () => {
  const u = new URL(seriesUrl('AAPL', '2026-10-01', 'KEY'));
  assert.equal(u.searchParams.get('adjust'), 'splits');
  assert.equal(u.searchParams.get('interval'), '1day');
  assert.equal(u.searchParams.get('start_date'), '2026-10-01');
});

test('dates: Bangkok date, previous month start, day gap', () => {
  assert.equal(localDate(new Date('2026-11-04T18:00:00Z')), '2026-11-05'); // 01:00 next day in Bangkok
  assert.equal(previousMonthStart('2026-11-05'), '2026-10-01');
  assert.equal(previousMonthStart('2026-01-15'), '2025-12-01');
  assert.equal(daysBetween('2026-10-30', '2026-11-03'), 4);
});

test('stale means strictly more than 4 calendar days old', () => {
  assert.equal(isStale('2026-10-30', '2026-11-03'), false); // 4 days (long weekend) is fine
  assert.equal(isStale('2026-10-29', '2026-11-03'), true);
});

test('parseSeries sorts newest first and drops invalid rows', () => {
  const s = parseSeries(ok);
  assert.deepEqual(s.rows.map((r) => r.date), ['2026-11-04', '2026-11-03']);
  assert.equal(s.currency, 'USD');
  assert.equal(latestOf(s, '2026-11-05').close, 231.5);
  assert.equal(latestOf(s, '2026-11-20').stale, true);
});

test('latestOf drops the unfinished market day', () => {
  const s = parseSeries(ok); // newest row is 2026-11-04
  assert.equal(latestOf(s, '2026-11-05', 4, '2026-11-04').date, '2026-11-03');
  assert.equal(latestOf(s, '2026-11-05', 4, '2026-11-05').date, '2026-11-04');
  assert.throws(() => latestOf(s, '2026-11-05', 4, '2026-11-03'), /no completed daily close/);
});

test('errors: 429 is a rate limit, others are API errors, empty is invalid', () => {
  assert.throws(() => parseSeries({ code: 429, message: 'limit', status: 'error' }), RateLimitError);
  assert.throws(() => parseSeries({ code: 400, message: 'bad symbol', status: 'error' }), ApiError);
  assert.throws(() => parseSeries({ meta: {}, values: [{ datetime: '2026-11-04', close: '0' }], status: 'ok' }), /no valid price rows/);
});

test('fetchSeries maps HTTP 429 and bad bodies', async () => {
  const fake = (status, body) => async () => ({ status, json: async () => { if (body === undefined) throw new Error('x'); return body; } });
  await assert.rejects(fetchSeries('A', '2026-10-01', { apiKey: 'k', fetchFn: fake(429, {}) }), RateLimitError);
  await assert.rejects(fetchSeries('A', '2026-10-01', { apiKey: 'k', fetchFn: fake(200, undefined) }), ApiError);
  const s = await fetchSeries('A', '2026-10-01', { apiKey: 'k', fetchFn: fake(200, ok) });
  assert.equal(s.rows.length, 2);
});
