import test from 'node:test';
import assert from 'node:assert/strict';
import { pushText, deliver, alertText, LineError, PUSH_URL } from './line.mjs';

const resp = (status, body, headers = {}) => ({
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => { if (body === undefined) throw new Error('no body'); return body; },
});
const args = { token: 'T', userId: 'U', text: 'hi', retryKey: 'KEY' };

test('push sends the right request and returns the message id', async () => {
  let seen;
  const fetchFn = async (url, init) => { seen = { url, init }; return resp(200, { sentMessages: [{ id: 'm1' }] }); };
  assert.deepEqual(await pushText({ ...args, fetchFn }), { messageId: 'm1' });
  assert.equal(seen.url, PUSH_URL);
  assert.equal(seen.init.headers.Authorization, 'Bearer T');
  assert.equal(seen.init.headers['X-Line-Retry-Key'], 'KEY');
  assert.deepEqual(JSON.parse(seen.init.body), { to: 'U', messages: [{ type: 'text', text: 'hi' }] });
});

test('falls back to the request id header; 409 on a repeated retry key counts as delivered', async () => {
  assert.equal((await pushText({ ...args, fetchFn: async () => resp(200, undefined, { 'x-line-request-id': 'r1' }) })).messageId, 'r1');
  assert.equal((await pushText({ ...args, fetchFn: async () => resp(409, {}, { 'x-line-accepted-request-id': 'a1' }) })).messageId, 'a1');
});

test('errors: 4xx is final, 429 and 5xx and network errors are retryable', async () => {
  const err = (status) => pushText({ ...args, fetchFn: async () => resp(status, { message: 'nope' }) }).catch((e) => e);
  assert.equal((await err(401)).retryable, false);
  assert.equal((await err(400)).retryable, false);
  assert.equal((await err(429)).retryable, true);
  assert.equal((await err(503)).retryable, true);
  const net = await pushText({ ...args, fetchFn: async () => { throw new Error('boom'); } }).catch((e) => e);
  assert.ok(net instanceof LineError && net.retryable);
});

test('deliver retries retryable errors up to 3 attempts, with a pause between', async () => {
  let calls = 0;
  const sleeps = [];
  const r = await deliver({ send: async () => { calls++; throw new LineError('x', { status: 503, retryable: true }); }, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(r.status, 'Failed');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [60000, 60000]);
});

test('deliver stops at a non-retryable error and succeeds on a later attempt', async () => {
  let calls = 0;
  const fatal = await deliver({ send: async () => { calls++; throw new LineError('bad token', { status: 401, retryable: false }); }, sleep: async () => {} });
  assert.deepEqual([fatal.status, calls], ['Failed', 1]);

  let n = 0;
  const ok = await deliver({ send: async () => { if (++n < 2) throw new LineError('x', { retryable: true }); return { messageId: 'm' }; }, sleep: async () => {} });
  assert.deepEqual([ok.status, ok.messageId, ok.attempts], ['Sent', 'm', 2]);
});

test('alert text carries symbol, prices, reference, threshold and target', () => {
  const t = alertText({ Symbol: 'AAPL', Name: 'Apple Inc.', Currency: 'USD', TriggerPrice: 93, DropPercent: 7, Threshold: 5, ReferencePrice: 100, ReferenceDate: '2026-11-02', PriceDate: '2026-11-04', ReferenceBackfilled: 1 });
  for (const part of ['AAPL', 'Apple Inc.', '93.00 USD', '2026-11-04', '7.00%', '100.00 (2026-11-02)', 'ย้อนหาจากต้นเดือน', 'เกณฑ์ 5%', '95.00']) {
    assert.ok(t.includes(part), `missing ${part}`);
  }
});
