import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, handleWebhook } from './webhook.mjs';

const SECRET = 'channel-secret';
const sign = (body, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64');
const env = { LINE_CHANNEL_SECRET: SECRET, LINE_USER_ID: 'Uowner', LINE_CHANNEL_ACCESS_TOKEN: 'tok' };

const event = (text, userId = 'Uowner') => ({ type: 'message', replyToken: 'rt', source: { userId }, message: { type: 'text', text } });
const req = (events, { signature, body = JSON.stringify({ events }) } = {}) =>
  new Request('https://x/line/webhook', { method: 'POST', headers: { 'x-line-signature': signature ?? sign(body) }, body });

function harness() {
  const calls = { commands: [], replies: [], waits: [] };
  return {
    calls,
    ctx: { waitUntil: (p) => calls.waits.push(p) },
    deps: {
      db: {}, log: () => {},
      runCommand: async ({ text }) => { calls.commands.push(text); return `did ${text}`; },
      reply: async (r) => { calls.replies.push(r); },
    },
  };
}

test('signature: valid passes, wrong secret, tampered body, missing header all fail', async () => {
  const body = '{"events":[]}';
  assert.equal(await verifySignature(body, sign(body), SECRET), true);
  assert.equal(await verifySignature(body, sign(body, 'other'), SECRET), false);
  assert.equal(await verifySignature(body + ' ', sign(body), SECRET), false);
  assert.equal(await verifySignature(body, null, SECRET), false);
  assert.equal(await verifySignature(body, 'short', SECRET), false);
});

test('rejects unsigned or badly signed requests without running anything', async () => {
  const h = harness();
  const bad = await handleWebhook(req([event('list')], { signature: sign('x') }), env, h.ctx, h.deps);
  assert.equal(bad.status, 401);
  const none = await handleWebhook(new Request('https://x/line/webhook', { method: 'POST', body: '{}' }), env, h.ctx, h.deps);
  assert.equal(none.status, 401);
  const unconfigured = await handleWebhook(req([]), { ...env, LINE_CHANNEL_SECRET: '' }, h.ctx, h.deps);
  assert.equal(unconfigured.status, 503);
  assert.equal(h.calls.commands.length, 0);
});

test("LINE's verify button (no events) gets 200", async () => {
  const h = harness();
  assert.equal((await handleWebhook(req([]), env, h.ctx, h.deps)).status, 200);
});

test('only the owner can command; others are ignored silently', async () => {
  const h = harness();
  const res = await handleWebhook(req([event('remove NVDA', 'Ustranger')]), env, h.ctx, h.deps);
  assert.equal(res.status, 200);
  await Promise.all(h.calls.waits);
  assert.equal(h.calls.commands.length, 0);
  assert.equal(h.calls.replies.length, 0);
});

test('owner text runs the command and the answer is sent as a reply', async () => {
  const h = harness();
  const res = await handleWebhook(req([event('status')]), env, h.ctx, h.deps);
  assert.equal(res.status, 200);
  await Promise.all(h.calls.waits);
  assert.deepEqual(h.calls.commands, ['status']);
  assert.deepEqual(h.calls.replies.map((r) => [r.replyToken, r.text, r.token]), [['rt', 'did status', 'tok']]);
});

test('non-text events (follow, stickers) are skipped', async () => {
  const h = harness();
  await handleWebhook(req([{ type: 'follow', replyToken: 'r', source: { userId: 'Uowner' } }, { type: 'message', replyToken: 'r', source: { userId: 'Uowner' }, message: { type: 'sticker' } }]), env, h.ctx, h.deps);
  await Promise.all(h.calls.waits);
  assert.equal(h.calls.commands.length, 0);
});

test('a failing command still produces a warning reply', async () => {
  const h = harness();
  h.deps.runCommand = async () => { throw new Error('boom'); };
  await handleWebhook(req([event('fetch')]), env, h.ctx, h.deps);
  await Promise.all(h.calls.waits);
  assert.equal(h.calls.replies[0].text, '⚠️ boom');
});
