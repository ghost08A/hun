---
type: grilling
status: closed
assignee: owner (claimed in /wayfinder session 2026-11-05)
blocked-by: [02-research-twelve-data-split-adjustment.md]
---

## Question

Detection is already decided (see the mid-month ticket): each daily fetch re-derives the month's reference and compares it with the stored one. What remains is policy: what difference counts as a restatement versus noise, when the stored reference is replaced, what happens if an alert was already sent that month (re-evaluate or keep the single alert), and how a replacement is logged. Settles BR-07.

## Resolution (2026-11-05)

- Restatement: stored reference differs from the re-derived one by more than 0.1% relative (guards rounding). Cause (split or provider correction) does not matter; the new value is the more correct one.
- Replace immediately in the run that detects it, before threshold evaluation (order: detect, replace, evaluate). Keep every replacement as a row in a small separate log (asset, reference month, old price, new price, detected at) rather than overwriting silently.
- Alert already `Sent` this month: keep it, never re-evaluate or re-send (BR-04). Alert `Failed` or `Pending`: re-evaluate with the new reference, send if still at or past threshold.
- Guard against a provider that has not yet restated history: if two consecutive closes in one fetched series differ by more than 40% (up or down), skip evaluating that asset, record the reason, and recheck next run. After 3 such runs evaluate normally (a real crash or restated data). Accepted cost: a genuine one-day drop beyond 40% may alert up to 3 days late.
