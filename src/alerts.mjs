// Alert decision (SPEC BR-03, BR-04, BR-07). Pure: says what to do with the AlertHistory row for one asset's
// month after an evaluation. Sending the message is Phase 5; here a trigger only creates a Pending row.

// res: result of analyze(). existing: the asset's AlertHistory row for res.month, or undefined.
export function decideAlert({ res, existing }) {
  if (res.outcome !== 'ok') return { type: 'none' };

  if (!existing) {
    if (!res.triggered) return { type: 'none' };
    return {
      type: 'create',
      triggerPrice: res.latest.close,
      dropPercent: res.dropPercent,
      referenceBackfilled: Boolean(res.reference.isBackfilled),
    };
  }

  // BR-04: a Sent alert stays; the month is done no matter what happens to the price or the reference.
  if (existing.status === 'Sent') return { type: 'none' };

  // BR-07: an unsent alert (Pending/Failed) is re-evaluated only when the reference was restated.
  if (res.adjustment) {
    return res.triggered
      ? { type: 'update', triggerPrice: res.latest.close, dropPercent: res.dropPercent }
      : { type: 'delete' };
  }
  return { type: 'none' };
}
