# Cloudflare and LINE free tiers

Checked: 2026-11-05. Official docs only (Cloudflare, LINE Developers). Figures were extracted by a page-summarising fetch tool, so re-verify exact numbers before committing money-sensitive decisions.

## Cloudflare Workers (Free plan)
Source: https://developers.cloudflare.com/workers/platform/limits/
- Cron Triggers: 5 per account.
- CPU time: 10 ms per invocation; the page says Cron Triggers have the same 10 ms CPU limit as HTTP requests.
- Subrequests: 50 per request.
- Requests: 100,000/day (resets 00:00 UTC).
- Duration: Cron Triggers 15 min wall time (page does not say whether this differs by plan).
- Cron timing is UTC only; changes take up to 15 min to propagate. Source: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## D1 (Free plan)
Sources: https://developers.cloudflare.com/d1/platform/pricing/ , https://developers.cloudflare.com/d1/platform/limits/
- Rows read: 5 million/day. Rows written: 100,000/day (reset 00:00 UTC).
- Storage: 5 GB per account total; max 500 MB per database; 10 databases per account.
- Queries per Worker invocation: 50 (subrequest limit).
- Over limit: D1 queries fail with errors until reset (daily limits), or writes/schema changes are blocked (storage). No automatic charge on Free.

## Cloudflare Access (Zero Trust Free)
Source: https://www.cloudflare.com/zero-trust/products/access/
- Free plan: "50 user limit". Pay-as-you-go/Contract: no user limit.
- Docs (https://developers.cloudflare.com/cloudflare-one/account-limits/) give no seat figure for Free; they mention 50 custom applications in the Application Library for Free accounts.
- Seats are consumed by users who authenticate to an application (https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/).
- Caveat (unofficial, not relied on): community posts report the Free checkout may ask for consent to charge for overage. Whether there is a hard $0 cap was not answered in official docs I found. Single-owner use (1 seat) is far below 50.

## LINE Messaging API
Sources: https://developers.line.biz/en/docs/messaging-api/pricing/ , https://developers.line.biz/en/docs/messaging-api/getting-user-ids/ , https://developers.line.biz/en/docs/messaging-api/getting-started/
- Free quota (Japan table; plan varies by country/region): Communication plan, free, up to 200 messages/month; additional messages not available. Light 5,000 (JPY 5,000/mo), Standard 30,000.
- The pricing page gives no Thailand figures and links to a LINE for Business page for Thailand. Not verified for Thailand; check the account's plan in LINE Official Account Manager.
- Counting: push, multicast, broadcast, narrowcast count; reply messages do not. Unit is per recipient (one push to one user = 1). Blocked users / nonexistent IDs not counted.
- Owner's user ID: LINE Developers Console, channel, Basic settings tab, "Your user ID" (requires Business ID linked to a LINE account). No API exists to get your own ID. Alternative: read `source.userId` from a webhook event when the owner messages the bot. Validate with the Get profile endpoint (200 = valid).
- Setup: Messaging API channels can no longer be created directly in the Developers Console; create a LINE Official Account, then enable Messaging API in Official Account Manager; a provider must be selected (cannot be changed afterwards).

## Verdict for the plan (daily job, at most 20 assets, one alert per asset per month)
- Cron: 1 of 5 triggers; 10 ms CPU is the tightest limit, fine if the job is mostly I/O (CPU time excludes waiting on fetch/D1) but keep per-asset logic light. Subrequests: 20 assets plus D1 queries must stay under 50 per invocation; batch D1 statements (`db.batch`) or note that a naive loop of 1 fetch + 1-2 queries per asset could approach 50 (20 x 2 = 40, 20 x 3 = 60 would exceed). 
- D1: about 20 rows read/written per day against 5M/100k and 500 MB: negligible.
- Access: 1 user of 50.
- LINE: at most 20 pushes/month against 200 (Japan free figure): 10% of quota, comfortable even if the Thai quota were lower than 200, provided it is at least 20; confirm the actual figure for the account's region.
- Overall: comfortably inside, with the subrequest cap and the 10 ms CPU as the only items to design around.
