---
label: wayfinder:map
tracker: local-markdown (no issue tracker configured; tickets live in .wayfinder/tickets/)
---

# Map: Personal Investment Price Alert

## Destination

A locked spec: every decision in requirement.md section 13 (plus the ones below) settled, so Phase 1 (asset management, backend-first) can start with nothing left to decide. Building is out of this map.

## Notes

- **Destination reached 2026-11-05:** every decision is consolidated in [SPEC.md](../SPEC.md) v1.1 (requirement.md left untouched as the original v1.0).

- Domain language: see [CONTEXT.md](../CONTEXT.md). Source requirements: [requirement.md](../requirement.md).
- Ticket convention: `.wayfinder/tickets/NN-title.md`, frontmatter has `type`, `status` (open/closed), `assignee`, `blocked-by` (ticket filenames). Frontier = open, unassigned, all blockers closed.
- Research findings go in `.wayfinder/research/<name>.md` (git has no commits yet, so no throwaway branch).
- Settled while charting (Q&A with the owner, 2026-11-05):
  - Markets: US stocks and ETFs only (NYSE/NASDAQ). No Thai assets, no funds; `Fund` asset type dropped from MVP.
  - Market data: Twelve Data API; the owner already has an API key (secret, never in the repo).
  - Schedule: once daily at 19:00 Asia/Bangkok (configurable later). System timezone Asia/Bangkok; reference month follows the price's market date.
  - Reference price: close of the first trading day of the month; if the market is closed, the next trading day. Split-adjusted only, no dividend adjustment; re-fetch the reference when the adjustment factor changes.
  - Stale rule: latest price older than 4 calendar days (market date to run date) is not evaluated; record "stale data".
  - LINE retry: up to 3 attempts, 1 minute apart; then `Failed`, retried at the next daily run; unique (AssetId, ReferenceMonth) prevents duplicates.
  - Scale: at most 20 tracked assets.
  - Dashboard protection: Cloudflare Access (superseded: MVP has no HTTP endpoints; revisit with the later UI).
  - MVP is backend-first (cron, alert, LINE); assets managed via API/script. UI later.

## Decisions so far

<!-- one line per closed ticket -->

- [research-twelve-data-split-adjustment](tickets/02-research-twelve-data-split-adjustment.md) ([findings](research/twelve-data-split-adjustment.md)): `/time_series` `adjust=splits` is the default (daily closes split-adjusted, semantics inferred not documented); no adjustment-factor field; detect splits via `/splits` (20 credits/symbol, Grow plan+) or by re-fetching the reference date. Open: exact `adjust` semantics, restatement delay.
- [research-cloudflare-and-line-free-tiers](tickets/03-research-cloudflare-and-line-free-tiers.md) ([findings](research/cloudflare-and-line-free-tiers.md)): plan fits all free tiers. Workers Free: 10 ms CPU, 50 subrequests per invocation, cron in UTC; D1: 5M reads / 100k writes per day; Access Free 50 users (hard $0 cap unverified); LINE free plan 200 msgs/month (Japan table, Thai quota unverified); owner user ID from LINE Developers Console, and the channel is created via a LINE Official Account. Constraint to design around: 50 subrequests per run vs 20 assets.
- [grilling-owner-interface-without-ui](tickets/08-grilling-owner-interface-without-ui.md): no HTTP endpoints in MVP; local `wrangler d1 execute` scripts for add (validates symbol, NYSE/NASDAQ only), edit, disable, remove (hard delete with `--yes`), status and LINE test; per-run outcomes logged in D1; backup by manual `wrangler d1 export`; threshold in (0,100), symbols unique.
- [grilling-split-handling-and-reference-correction](tickets/06-grilling-split-handling-and-reference-correction.md): replace the stored reference when the re-derived one differs by more than 0.1%, before evaluating, and log old/new; a `Sent` alert stays, `Failed`/`Pending` are re-evaluated; hold evaluation up to 3 runs when two consecutive closes differ by more than 40% (possible unrestated split).
- [grilling-mid-month-add-and-new-month](tickets/07-grilling-mid-month-add-and-new-month.md): reference back-filled from the month's first trading day on add (alert sent if already past threshold); one `/time_series` call per asset from the previous month's first day yields latest close, reference and split-restatement check; month = market date of latest close, never local clock; re-enabled assets get no special case.
- [grilling-api-credit-budget](tickets/05-grilling-api-credit-budget.md): stop at 45 subrequests per run; two idempotent cron runs (19:00 and 20:00 Bangkok) finish leftovers; sleep-throttle to 8/min; on 429 stop and resume next run; optional 8-symbol batching after live-API check; one failure LINE per day max, only if zero valid prices after run two.
- [task-set-up-line-channel](tickets/04-task-set-up-line-channel.md): owner created the LINE channel and has the access token and user ID (test push confirmed by owner). Values are never shared in chat or committed; implementation prepares a gitignored local env file template for the owner to fill, and production uses Cloudflare secrets.
- [research-twelve-data-free-tier](tickets/01-research-twelve-data-free-tier.md) ([findings](research/twelve-data-free-tier.md)): Basic (free) = 8 credits/min, 800/day; `/eod`, `/time_series`, `/quote` cost 1 credit per symbol, so 20 assets = 20 credits/day (about 3 min throttled). US stocks/ETFs on Basic (NYSE listing not named explicitly, confirm on first call). Latest close via `/eod`; a month of closes via `/time_series` with start/end dates. US EOD is final only after midnight ET (so the 19:00 Bangkok run is fine). No clause found against automated personal use; commercial use and display are barred.

## Not yet specified

- Deployment, secrets handling, and operational readiness checks (Phases 7-8): decide when Phase 1 is done and a real run exists to measure; not needed before starting Phase 1.

## Out of scope

- Angular dashboard and price/notification history screens (FR-19 to FR-21): a later effort after the backend works.
- Thai stocks, mutual funds, and non-US markets.
- Dividend adjustment, currency conversion, trading, multi-user.
