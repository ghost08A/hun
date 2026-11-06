import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, findJump, DEFAULTS } from './reference.mjs';

const r = (date, close) => ({ date, close });
// Newest first. Trading days Oct 29, 30, Nov 2, 3, 4.
const base = [r('2026-11-04', 93), r('2026-11-03', 95), r('2026-11-02', 100), r('2026-10-30', 99), r('2026-10-29', 98)];
const run = (extra) => analyze({ rows: base, runDate: '2026-11-05', marketToday: '2026-11-05', threshold: 5, ...extra });

test('new month: reference is the first trading day close, drop and target follow BR-02', () => {
  const a = run();
  assert.equal(a.outcome, 'ok');
  assert.deepEqual(a.reference, { date: '2026-11-02', price: 100, isBackfilled: true });
  assert.equal(a.isNew, true);
  assert.ok(Math.abs(a.dropPercent - 7) < 1e-9);
  assert.equal(a.targetPrice, 95);
  assert.equal(a.triggered, true);
});

test('a price exactly at the target triggers despite float error', () => {
  // (3 - 2.91) / 3 * 100 = 2.9999999999999956 in floating point
  const a = analyze({ rows: [r('2026-11-03', 2.91), r('2026-11-02', 3)], runDate: '2026-11-04', marketToday: '2026-11-04', threshold: 3 });
  assert.equal(a.triggered, true);
});

test('first close of a new month is its own reference and not back-filled', () => {
  const a = analyze({ rows: [r('2026-11-02', 100), r('2026-10-30', 99)], runDate: '2026-11-03', marketToday: '2026-11-03', threshold: 5 });
  assert.equal(a.reference.date, '2026-11-02');
  assert.equal(a.reference.isBackfilled, false);
  assert.equal(a.dropPercent, 0);
  assert.equal(a.triggered, false);
});

test('month follows the price date, not the run date', () => {
  // Run on Nov 2 (Bangkok): latest completed close is still Oct 30 -> October reference.
  const a = analyze({ rows: base.slice(3), runDate: '2026-11-02', marketToday: '2026-11-02', threshold: 5 });
  assert.equal(a.month, '2026-10');
  assert.equal(a.reference.date, '2026-10-29');
});

test('unfinished market day is dropped (BR-06)', () => {
  const a = analyze({ rows: [r('2026-11-05', 1), ...base], runDate: '2026-11-05', marketToday: '2026-11-05', threshold: 5 });
  assert.equal(a.latest.date, '2026-11-04');
});

test('stored reference within 0.1% is kept; beyond it is replaced and logged (BR-07)', () => {
  const same = run({ storedRefs: { '2026-11': { date: '2026-11-02', price: 100.05 } } });
  assert.equal(same.adjustment, null);
  assert.equal(same.reference.price, 100.05);
  assert.equal(same.isNew, false);

  // 2:1 split restated the whole history: Nov 2 now 50, latest 46.5
  const rows = [r('2026-11-04', 46.5), r('2026-11-03', 47.5), r('2026-11-02', 50), r('2026-10-30', 49.5)];
  const a = analyze({ rows, runDate: '2026-11-05', marketToday: '2026-11-05', threshold: 5, storedRefs: { '2026-11': { date: '2026-11-02', price: 100 } } });
  assert.deepEqual(a.adjustment, { oldPrice: 100, newPrice: 50 });
  assert.equal(a.reference.price, 50);
  assert.ok(Math.abs(a.dropPercent - 7) < 1e-9);
});

test('hold guard: a 40%+ move among the newest 3 daily moves holds; an older one does not', () => {
  const held = analyze({ rows: [r('2026-11-04', 45), r('2026-11-03', 100), r('2026-11-02', 101), r('2026-10-30', 99)], runDate: '2026-11-05', marketToday: '2026-11-05', threshold: 5 });
  assert.equal(held.outcome, 'held');
  assert.match(held.detail, /possible unrestated split/);

  // Same jump but four moves back: no longer held (hold lasts at most 3 trading days).
  const rows = [r('11-09', 44), r('11-06', 45), r('11-05', 45), r('11-04', 45), r('11-03', 100), r('11-02', 101)]
    .map((x) => ({ date: `2026-${x.date}`, close: x.close }));
  assert.equal(findJump(rows, DEFAULTS), null);
});

test('stale and empty inputs are not evaluated', () => {
  const s = analyze({ rows: base, runDate: '2026-11-20', marketToday: '2026-11-20', threshold: 5 });
  assert.equal(s.outcome, 'stale');
  const e = analyze({ rows: [r('2026-11-05', 1)], runDate: '2026-11-05', marketToday: '2026-11-05', threshold: 5 });
  assert.equal(e.outcome, 'error');
});
