---
type: grilling
status: closed
assignee: owner (claimed in /wayfinder session 2026-11-05)
blocked-by: []
---

## Question

With no dashboard in this effort, how does the owner (a) add, edit, disable and remove tracked assets, (b) see system status (last run, failures, data freshness, alert history), and (c) export a backup of assets and history (NFR-05)? Candidates: a small authenticated HTTP API on the Worker behind Cloudflare Access, direct `wrangler d1 execute` scripts, or both. Also settle how those endpoints are protected and which part of this carries over to the later UI.

## Resolution (2026-11-05)

- Managing assets: local scripts calling `wrangler d1 execute --remote`; no HTTP endpoints in MVP. `add` makes one Twelve Data call (1 credit) to confirm the symbol exists, read name and currency, and reject anything not on NYSE/NASDAQ before saving. The HTTP API for a UI is a later effort.
- Status: every cron run records its outcome in D1 (start/end, assets checked, failures, reasons). A `status` script prints the last run, each asset's latest price date, and alert history. A script also sends a LINE test message (FR-18).
- Backup: `wrangler d1 export` to a gitignored folder, run by hand on demand, no schedule. D1 Time Travel on the free plan is unverified; check during deployment readiness.
- Remove: hard delete of the asset and all its prices, references and alert history, requiring `--yes`. Keeping history means disabling instead (FR-05).
- Validation: threshold must be greater than 0 and less than 100; symbols are unique case-insensitively.
