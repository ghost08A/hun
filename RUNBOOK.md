# Runbook

Day-to-day operation of the Price Alert system. Design and rules: [SPEC.md](SPEC.md). All commands run in the project folder; add `--remote` to act on the deployed database (without it you act on the local development copy).

## What runs by itself

| When (Asia/Bangkok) | What |
|---|---|
| 19:00 (`0 12 * * *` UTC) | Fetch the latest completed US daily close for every active asset, update references, queue alerts, send them on LINE. |
| 20:00 (`0 13 * * *` UTC) | Finish assets the first run could not (rate limit, errors, subrequest budget). If no asset got a valid price all day, send one LINE warning. |

The only HTTP route is `POST /line/webhook` (LINE chat commands, see README). It rejects any request without a valid LINE signature (401) and ignores messages from anyone but the owner. Opening the Worker URL in a browser returns `404 price-alert: no public endpoints`.

## Check it works

```bash
npm run assets -- status --remote
```

- **Last runs:** one row per trigger per day. A day with no rows means cron did not run.
- **PRICE DATE:** should be the latest US trading day (it is the previous day's close, because runs happen before the US open).
- **ALERT:** `Sent` means LINE accepted it. `Failed` is retried at the next run. `Pending` is waiting to be sent.

Look at it for the first few days after deploy, then occasionally. A LINE message "ดึงราคาไม่ได้เลยสักตัว" means a whole day produced no valid price: read the error in Last runs.

## Managing assets

```bash
npm run assets -- add NVDA 8 --remote            # threshold in percent, between 0 and 100
npm run assets -- add VOO 5 --etf --remote       # ETFs need --etf (the quote does not say)
npm run assets -- edit NVDA --threshold 10 --remote
npm run assets -- disable NVDA --remote          # pause, keep history
npm run assets -- enable NVDA --remote
npm run assets -- remove NVDA --yes --remote     # deletes the asset and ALL its history
npm run assets -- list --remote
```

`add` uses 1 Twelve Data credit. Only NYSE, NASDAQ and NYSE Arca symbols are accepted. A new asset gets its first price at the next scheduled run, or immediately with `npm run fetch -- --remote` (1 credit per asset not yet checked today).

## Backup and restore

```bash
npm run backup                 # deployed database -> backups/price-alert-<time>.sql (gitignored)
npm run backup -- --local      # local development database
```

The dump contains your assets and history only (no secrets). Keep it private. Suggested habit: back up after adding or removing assets, and monthly.

Restore (tested into an empty local database; not tested against a remote one):

```bash
npx wrangler d1 execute price-alert --local --file backups/<file>.sql
```

To restore online, create a new empty D1 (`npx wrangler d1 create <name>`), put its id in `wrangler.toml`, and run the same command with `--remote`. A dump creates tables, so it cannot be loaded into a database that already has them.

## Limits and terms (checked 2026-11-05 through summarised official pages; re-check before relying on them)

| Service | Limit that matters here | This system's use |
|---|---|---|
| Twelve Data Basic | 8 credits/minute, 800/day; 1 credit per symbol per request | 1 credit per asset per day, spaced 7.5 s apart |
| Workers Free | 10 ms CPU and 50 subrequests per invocation; cron wall time 15 min | stops external calls at 45 per run; waiting does not count as CPU |
| D1 Free | 5M reads and 100k writes per day, 5 GB; 50 queries per invocation | about 6 + 1 batch per asset; see the open question below |
| LINE | free plan 200 messages/month (Japan table; Thai quota unconfirmed) | at most one alert per asset per month, plus rare warnings |

Twelve Data terms: personal, non-commercial use; do not redistribute or publicly display the data; keep the key private. Free tiers can change; nothing here promises permanent zero cost.

## If something looks wrong

| Symptom | Likely cause and action |
|---|---|
| No new run rows today | Cron not running: check `npx wrangler deployments list` and the Cloudflare dashboard (Workers, price-alert, Triggers). Redeploy with `npx wrangler deploy`. |
| `error` with "apikey" in Last runs | Wrong or expired key: `npx wrangler secret put TWELVE_DATA_API_KEY`. |
| `RATE LIMITED` | Credits or per-minute limit hit; the 20:00 run resumes. If it repeats, you track too many assets for the free plan. |
| `STALE` on one asset | Latest close is older than 4 days (long market closure or provider lag). Not evaluated; clears itself. |
| `HELD` on one asset | A single-day move above 40% in the newest 3 daily moves: possible unrestated split. Held for at most 3 trading days, then evaluated. |
| Alert stuck `Failed` | LINE rejected it (token wrong, quota used up). Fix the cause; the next run retries, or `npm run notify -- --remote`. |
| No LINE at all though status says `Sent` | Wrong `LINE_USER_ID` or you blocked the account. Run `npm run line-test`. |
| Chat commands get no answer | Check in order: Webhook URL and "Use webhook" in the LINE Console (press Verify); auto-response turned off in Official Account Manager; `LINE_CHANNEL_SECRET` secret set (a missing one makes the webhook answer 503, a wrong one 401); you are messaging from the account whose id is in `LINE_USER_ID`. Watch live with `npx wrangler tail` while sending `help`. |
| Chat answers "⚠️ ..." | The message after the warning sign is the reason (unknown symbol, threshold out of range, quote rejected). |
| `fetch` in chat does only some assets | By design it handles 8 per command (per-minute credit limit). Send `fetch` again after a minute for the rest. |
| Need live logs | `npx wrangler tail` before 19:00 (or while sending a chat command). |

## Still unconfirmed against the live services

- D1 Free: does a `batch()` of N statements count as 1 query or N (limit 50 per invocation)? Look for D1 limit errors in `wrangler tail` or Last runs after the first real runs.
- LINE Thai free quota, and whether a push returns `sentMessages[].id` (alerts still send without it).
- Twelve Data: NYSE-listed symbols on the free plan (AAPL and SPY work), and whether a failed request consumes credits.
