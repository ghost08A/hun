---
type: grilling
status: closed
assignee: owner (claimed in /wayfinder session 2026-11-05)
blocked-by: [01-research-twelve-data-free-tier.md]
---

## Question

When an asset is added mid-month, is its reference price back-filled from that month's first trading day (if history is available) or does tracking start next month? And how does the daily run detect a new month and fetch each asset's new reference when the first trading day's close is not yet published (BR-05)?

## Resolution (2026-11-05)

- Mid-month add: the reference price is back-filled from the month's first trading day (earliest valid close that month; actual date stored). Same rule whatever day the asset is added.
- If the asset is already past its threshold on the first check, the alert is sent, and the message says the reference was back-filled. It still counts as that month's single alert.
- Daily fetch shape: one `/time_series` (interval 1day) call per asset with `start_date` = first day of the previous calendar month. From that single result derive: latest close and its date; the reference price for the month of that date (first row of that month); and a comparison of the re-derived reference with the stored one, so a retroactive restatement (e.g. a split) is detected without `/splits`. Credit use stays 1 per symbol per run. Verify on the live API that a multi-row response costs 1 credit.
- Month attribution: the reference month is the month of the latest valid close's market date, never the local clock. A new month therefore starts only when its first close exists (satisfies BR-05).
- Disabled-then-re-enabled asset: no special case. Only the current month is evaluated; missed months are not alerted retroactively.
