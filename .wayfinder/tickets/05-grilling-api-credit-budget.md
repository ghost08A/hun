---
type: grilling
status: closed
assignee: owner (claimed in /wayfinder session 2026-11-05)
blocked-by: [01-research-twelve-data-free-tier.md]
---

## Question

(Added from research 03: a Workers Free invocation allows only 50 subrequests, so 20 assets at 3+ calls each cannot run in one invocation. Decide batching, or splitting the run across invocations.)

Given the real Twelve Data free limits, how many API calls does one daily run need for 20 assets (latest close, reference price, adjustment check), how are calls paced under the per-minute limit, and what happens if the budget runs out mid-run (partial results, which assets get skipped, how it is recorded)?

## Resolution (2026-11-05)

- Budget per run: counter in code stops external calls at 45 subrequests; remaining assets are marked "not checked today". Baseline design = one Twelve Data request per asset (about 20 credits/day for prices); worst-case extra 20 for split reference re-checks (method decided in the split ticket). D1 writes batched (about 4), LINE up to about 5.
- Two daily cron triggers (19:00 and 20:00 Asia/Bangkok). The job is idempotent: it skips assets already checked successfully today, so the second run finishes leftovers and failed fetches and never re-sends an alert.
- Throttle to 8 credits/minute by sleeping inside one invocation (cron wall time 15 min; waiting is not CPU).
- On HTTP/API 429: stop and resume in the next run; do not retry in a tight loop (docs do not say whether failed requests consume credits; check `api-credits-left` header empirically).
- Optional optimisation: batch up to 8 symbols per request (comma-separated). Response shape and maximum are undocumented, so verify against the live API before enabling; see research/twelve-data-multi-symbol.md.
- Failure alert: at most one LINE message per day, only if the second run still produced zero valid prices.
