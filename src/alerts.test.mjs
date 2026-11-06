import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAlert } from './alerts.mjs';

const ok = (extra = {}) => ({
  outcome: 'ok', triggered: true, dropPercent: 7, latest: { close: 93 },
  reference: { isBackfilled: false }, adjustment: null, ...extra,
});

test('triggered with no alert this month creates one Pending alert', () => {
  assert.deepEqual(decideAlert({ res: ok() }), { type: 'create', triggerPrice: 93, dropPercent: 7, referenceBackfilled: false });
  assert.equal(decideAlert({ res: ok({ reference: { isBackfilled: true } }) }).referenceBackfilled, true);
});

test('not triggered, or not evaluated, does nothing', () => {
  assert.equal(decideAlert({ res: ok({ triggered: false }) }).type, 'none');
  for (const outcome of ['stale', 'held', 'error']) assert.equal(decideAlert({ res: { outcome } }).type, 'none');
});

test('BR-04: a Sent alert is never touched, even after a restatement', () => {
  const existing = { status: 'Sent' };
  assert.equal(decideAlert({ res: ok(), existing }).type, 'none');
  assert.equal(decideAlert({ res: ok({ adjustment: { oldPrice: 100, newPrice: 50 }, triggered: false }), existing }).type, 'none');
});

test('no second alert for a month that already has an unsent one', () => {
  for (const status of ['Pending', 'Failed']) assert.equal(decideAlert({ res: ok(), existing: { status } }).type, 'none');
});

test('BR-07: unsent alert is re-evaluated after a restatement', () => {
  const adjustment = { oldPrice: 100, newPrice: 50 };
  assert.equal(decideAlert({ res: ok({ adjustment }), existing: { status: 'Failed' } }).type, 'update');
  assert.equal(decideAlert({ res: ok({ adjustment, triggered: false }), existing: { status: 'Pending' } }).type, 'delete');
});
