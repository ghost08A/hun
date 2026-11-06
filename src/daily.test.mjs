import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyJob, shouldWarn } from './daily.mjs';

test('warn only after the final run, with active assets and none OK today', () => {
  assert.equal(shouldWarn({ isFinalRun: true, activeAssets: 3, okToday: 0 }), true);
  assert.equal(shouldWarn({ isFinalRun: false, activeAssets: 3, okToday: 0 }), false);
  assert.equal(shouldWarn({ isFinalRun: true, activeAssets: 0, okToday: 0 }), false);
  assert.equal(shouldWarn({ isFinalRun: true, activeAssets: 3, okToday: 1 }), false);
});

// Stub db: nothing to check, no pending alerts, and a configurable "OK today" count.
const stubDb = ({ active = 2, ok = 0 } = {}) => ({
  query: async (sql) => {
    if (sql.includes('COUNT(*) AS activeAssets')) return [{ activeAssets: active }];
    if (sql.includes('COUNT(*) AS okToday')) return [{ okToday: ok }];
    return []; // no assets to fetch, no pending alerts
  },
  run: async () => {},
});
const env = { TWELVE_DATA_API_KEY: 'k', LINE_CHANNEL_ACCESS_TOKEN: 't', LINE_USER_ID: 'u' };
const pushes = [];
const fetchFn = async (url, init) => { pushes.push(JSON.parse(init.body).messages[0].text); return { status: 200, headers: { get: () => null }, json: async () => ({}) }; };
const base = { fetchFn, log: () => {}, sleep: async () => {}, now: () => Date.parse('2026-11-05T13:00:00Z') };

test('final run with no valid price sends exactly one warning', async () => {
  pushes.length = 0;
  const out = await dailyJob({ ...base, db: stubDb({ ok: 0 }), env, label: 'x', isFinalRun: true });
  assert.equal(out.warned, true);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0], /2026-11-05/);
});

test('no warning on the first run, when prices were fine, or when LINE is not configured', async () => {
  pushes.length = 0;
  assert.equal((await dailyJob({ ...base, db: stubDb({ ok: 0 }), env, label: 'x', isFinalRun: false })).warned, false);
  assert.equal((await dailyJob({ ...base, db: stubDb({ ok: 2 }), env, label: 'x', isFinalRun: true })).warned, false);
  const noLine = await dailyJob({ ...base, db: stubDb({ ok: 0 }), env: { TWELVE_DATA_API_KEY: 'k' }, label: 'x', isFinalRun: true });
  assert.equal(noLine.warned, false);
  assert.equal(pushes.length, 0);
});

test('a failed run step (missing API key) does not stop alert sending or the warning', async () => {
  pushes.length = 0;
  const out = await dailyJob({ ...base, db: stubDb({ ok: 0 }), env: { ...env, TWELVE_DATA_API_KEY: '' }, label: 'x', isFinalRun: true });
  assert.equal(out.run, null);
  assert.deepEqual(out.notify, { sent: 0, failed: 0 });
  assert.equal(out.warned, true);
});
