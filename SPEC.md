# Personal Investment Price Alert — Specification

**Version:** 1.1 (consolidates requirement.md v1.0 with every decision on the wayfinder map)
**Date:** 2026-11-05
**Status:** Ready for Phase 1
**Supersedes:** `requirement.md` where they differ. Glossary: [CONTEXT.md](CONTEXT.md). Decision trail: `.wayfinder/map.md` and its tickets.

## 1. Product

A single-user, backend-only system. Once a day it checks the latest closing price of each tracked US stock or ETF and sends one LINE message when the price has fallen from that month's reference price by at least the asset's threshold. It supports DCA monitoring; it never trades or advises.

## 2. Fixed decisions

| Area | Decision |
|---|---|
| Assets | US stocks and ETFs on NYSE/NASDAQ only. No Thai assets, no funds (`Fund` type removed), no other markets. At most 20 tracked assets. |
| Market data | Twelve Data, Basic (free) plan: 8 credits/minute, 800/day, 1 credit per symbol per request. API key is a secret. |
| Prices | Daily closes, split-adjusted only (`adjust=splits`), no dividend adjustment. |
| Reference price | Close of the first trading day of the month (next trading day if closed; earliest valid close of the month if the exact day is missing); actual date stored. |
| Reference month | Month of the **market date of the latest valid close**, never the local clock. A new month starts when its first close exists. |
| Schedule | Cron at 19:00 and 20:00 Asia/Bangkok (UTC `0 12 * * *` and `0 13 * * *`). Timezone is configurable later. |
| Stale rule | Latest close older than 4 calendar days (price date to run date) is not evaluated; the check records "stale data". Value is configurable. |
| LINE | Messaging API push to the owner. Up to 3 send attempts 1 minute apart; then `Failed`, retried by the next daily run. One alert per asset per reference month. |
| Platform | Cloudflare Worker + Cron Trigger + D1. No Pages, no Angular, no HTTP endpoints in MVP. |
| Owner interface | Local scripts (section 8). Dashboard and its API are a later effort. |

## 3. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Add a tracked asset by symbol and threshold. The script verifies the symbol with Twelve Data, reads name, exchange and currency, and rejects anything not on NYSE/NASDAQ. |
| FR-02 | Edit an asset's threshold and name. |
| FR-03 | Remove an asset: hard-delete the asset and all its prices, references, checks and alerts; requires `--yes`. |
| FR-05 | Disable/enable tracking without losing history. |
| FR-06 | Per-asset threshold, greater than 0 and less than 100 (percent). Symbols unique, case-insensitive. |
| FR-07 | Monthly reference per BR-01. |
| FR-08 | Target price available in `status` output. |
| FR-10 | Daily check per section 5. |
| FR-11 | Store price, price date, retrieval timestamp, currency, source. |
| FR-12 | Percentage decline from the month's reference. |
| FR-13 | Unavailable, stale or invalid data is recorded and not evaluated. |
| FR-15 | Send a LINE alert when decline is at or past the threshold. |
| FR-16 | At most one `Sent` alert per asset per reference month. |
| FR-17 | Alert history with trigger details, delivery status, timestamps. |
| FR-18 | Script to send a LINE test message. |
| FR-22 | `status` script: last runs, failures, each asset's latest price date, target price, drop percent, alert history. |
| NFR-05 | Backup by manual `wrangler d1 export` into a gitignored folder. |

Dropped from v1.0: FR-04, FR-09 (implicit in the daily rule), FR-14, FR-19, FR-20, FR-21 as screens (data remains queryable via `status`).

## 4. Business rules

- **BR-01 Reference:** as in section 2. Reference is derived from the fetched series, not from the wall clock.
- **BR-02 Math:** `dropPercent = (reference - current) / reference * 100`; `targetPrice = reference * (1 - threshold/100)`.
- **BR-03 Trigger:** `dropPercent >= threshold` on a valid, fresh, un-held price.
- **BR-04 Duplicates:** unique `(AssetId, ReferenceMonth)` in AlertHistory; a continuing decline in the same month never creates a second alert.
- **BR-05 New month:** the new reference is used only once the first close of the new month is in the data. Missed months (asset disabled) are never alerted retroactively.
- **BR-06 Validity:** only daily closes; skip evaluation on missing, invalid or stale data.
- **BR-07 Splits:** restatement means the stored reference differs from the re-derived one by more than 0.1% relative. Replace it immediately, before evaluating, and log old/new. A `Sent` alert for the month stays; a `Failed`/`Pending` alert is re-evaluated with the new reference. **Hold guard:** if any of the newest 3 daily moves in the fetched series exceeds 40% (up or down), skip that asset, record the reason, and retry next run. The window is over the data, not a run counter, so it is stateless and a hold lasts at most 3 trading days; after that the asset is evaluated normally (a real crash or restated data). (Implemented this way in Phase 3; same effect as the original "3 held runs" for consecutive daily runs.)
- **BR-08 LINE failure:** bounded retry as in section 2; retries reuse the same AlertHistory row, so no duplicate record or duplicate success.
- **BR-09 Currency:** store currency with every price; compare only same-currency values. No conversion.
- **Mid-month add:** reference is back-filled from the month's first trading day (flagged `IsBackfilled`, set whenever the reference day is earlier than the latest close, e.g. after a missed run too). If already at or past the threshold, the first check sends the alert, and the message says the reference was back-filled.

## 5. Daily run (idempotent, both cron triggers)

1. Open a RunLog row. Select active assets with no successful CheckResult for today (Bangkok date).
2. Throttle to 8 credits/minute by sleeping inside the invocation. Stop external calls at 45 subrequests; unprocessed assets are left for the next trigger.
3. Per asset, one `/time_series` (interval 1day) call with `start_date` = first day of the previous calendar month. A 429 stops the run; resume at the next trigger, with no tight retry loop. Optional later optimisation: up to 8 comma-separated symbols per request, only after verifying the live response shape.
4. From the result: latest close and its date → stale check → 40% hold guard → reference of that date's month (first row of that month; create if missing) → restatement check and replace (BR-07) → compute drop → evaluate (BR-03) → create AlertHistory (`Pending`) and send LINE if no `Sent`/pending alert for the month.
5. Write PriceHistory (upsert per asset and price date) and a CheckResult (`ok`, `stale`, `held`, `error`, detail) in batched D1 statements.
6. Close the RunLog row. If after the 20:00 run no asset has a valid price, send at most one failure LINE message that day.

## 6. Data model (D1; timestamps UTC)

- **Assets:** Id, Symbol (unique, case-insensitive), Name, AssetType (`Stock`|`ETF`), Exchange, Currency, AlertThresholdPercent, IsActive, CreatedAt, UpdatedAt.
- **MonthlyReferencePrices:** Id, AssetId, ReferenceMonth (`YYYY-MM`), ReferenceDate, ReferencePrice, Currency, IsBackfilled. Unique `(AssetId, ReferenceMonth)`.
- **ReferenceAdjustments:** Id, AssetId, ReferenceMonth, OldPrice, NewPrice, DetectedAt.
- **PriceHistory:** Id, AssetId, PriceDate, Price, Currency, RetrievedAt, Source. Unique `(AssetId, PriceDate)`.
- **CheckResults:** Id, AssetId, RunDate, Outcome, Detail, RunId, CheckedAt.
- **AlertHistory:** Id, AssetId, ReferenceMonth, TriggerPrice, DropPercent, TriggeredAt, SentAt, Status (`Pending`|`Sent`|`Failed`), ProviderMessageId, ReferenceBackfilled. Unique `(AssetId, ReferenceMonth)`.
- **RunLog:** Id, TriggerLabel, StartedAt, FinishedAt, AssetsChecked, AssetsFailed, Errors.
- **SystemSettings:** timezone, stale days, hold threshold, retry settings. Secrets are never stored here.

## 7. Secrets

Twelve Data key, LINE channel access token and LINE user ID live only in a gitignored local env file (`.dev.vars`) for development and in Cloudflare secrets for production. The repository carries a `.dev.vars.example` with names and empty values; `.gitignore` lists the real file before it is created. Nothing secret reaches chat, source or any table.

## 8. Owner scripts (local, `wrangler d1 execute --remote`)

`add`, `edit`, `disable`/`enable`, `remove --yes`, `status`, `line-test`, plus `wrangler d1 export` for backup.

## 9. Architecture

```text
Cloudflare Cron (19:00, 20:00 Bangkok)
        |
   Worker: market-data client | alert evaluation | LINE client   (kept separate, NFR-08)
        |
   Cloudflare D1   <--- local owner scripts (wrangler)
```

Free-tier fit (checked 2026-11-05 via summarised official docs; re-verify): Workers Free 10 ms CPU and 50 subrequests per invocation, cron wall time 15 min; D1 5M reads and 100k writes per day; LINE 200 messages per month (Japan table; Thai quota unverified).

## 10. Implementation phases

1. Project, D1 schema and migrations, owner scripts (`add`, `edit`, `disable`, `remove`, `status`).
2. Market-data client and PriceHistory.
3. Reference engine, restatement and hold guard.
4. Alert engine and duplicate prevention.
5. LINE client, retry, test script.
6. Cron triggers, idempotent runs, RunLog, failure message.
7. Deploy, secrets, verification (decisions deferred, see section 12).
8. Operational readiness: export test, stale-data and quota behaviour.

Phase 1 can start now. Each pure rule (drop math, month attribution, stale check, hold guard, restatement, duplicate guard) gets a small runnable check.

## 11. Acceptance criteria

- Assets can be added (with symbol validation), edited, disabled, enabled and removed via scripts, each with its own threshold.
- Correct reference price and actual date are stored, including back-fill on mid-month add.
- Decline and target price are correct.
- A LINE message is sent when a valid, fresh price meets the threshold, and never twice for the same asset and month.
- Missing, stale, held or invalid data never triggers an alert.
- A split does not cause a false alert; the reference replacement is logged.
- Daily runs happen unattended; a leftover or failed asset is completed by the second trigger.
- `status` shows last run, latest price date and alert history; backup export works.
- Operation stays inside the documented free-tier limits, or the paid need is named.

## 12. To verify against the live services during implementation

- Twelve Data Basic includes NYSE symbols; exact `adjust` semantics; how soon history is restated after a split.
- A multi-row `/time_series` response costs 1 credit; multi-symbol request shape and maximum; whether a failed request consumes credits; how a 429 is reported.
- LINE: a push returns `sentMessages[].id`; `X-Line-Retry-Key` makes retries idempotent (duplicate key answers 409, treated as delivered); a push after a network timeout cannot be told apart from a lost one; LINE free quota for the Thai account; D1 Time Travel on the free plan; Cloudflare Access is no longer needed in MVP.

## 13. Deferred and out of scope

- **Deferred (decide after Phase 1 runs):** deployment steps, production secret handling, operational readiness details.
- **Out of scope:** Angular dashboard and its HTTP API, price/notification history screens, Thai or other non-US markets, funds, dividend adjustment, currency conversion, trading, multi-user.
