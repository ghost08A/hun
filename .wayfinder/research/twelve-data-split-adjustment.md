# Twelve Data: split adjustment in daily prices

Checked: 2026-11-05. Official Twelve Data sources only (docs + official support center). No API calls made.

## Short answer

- Yes, split-adjusted but not dividend-adjusted closes are available. `/time_series` has an `adjust` parameter with values `all`, `splits`, `dividends`, `none`; default is `splits`. So the default daily close is split-adjusted only. Pass `adjust=splits` explicitly to pin it.
- The docs do NOT describe the adjustment method, expose an adjustment factor, or say when history is restated. Treat the exact semantics as unverified until tested.
- Detection of "a past price changed after a split": use `/splits` (dates + factors) as the trigger, and re-fetch a stored reference date to compare. No factor is returned in `/time_series`.

## Findings

1. `adjust` on `/time_series`: described only as "Adjusting mode for prices"; values `all`, `splits`, `dividends`, `none`; default `splits`. The page does not explain what each mode does.
   Source: https://twelvedata.com/docs/market-data/time-series
2. Support article states prices are adjusted for splits for daily, weekly and monthly data; intraday is not adjusted; intraday can be adjusted client-side using `/splits` and `/dividends`.
   Source: https://support.twelvedata.com/en/articles/5179064-are-the-prices-adjusted
   (Support center is first-party but less authoritative than the API reference; it does not mention the `adjust` parameter.)
3. `/time_series` response (`meta`, `values[]` with `datetime`, `open`, `high`, `low`, `close`, `volume`, `status`) contains no adjustment factor or "adjusted close" field. Source: same time-series page as (1).
4. `/splits` returns `splits[]` with `date`, `description`, `ratio` (e.g. 0.25), `from_factor`, `to_factor` (e.g. 4 and 1 for AAPL 2020-08-31 4-for-1). Parameters: symbol/figi/isin/cusip, exchange, mic_code, country, `range` (`last`, `1m`, `3m`, `6m`, `ytd`, `1y`, `2y`, `5y`, `full`; default `last`), `start_date`, `end_date` (YYYY-MM-DD). Cost 20 credits per symbol; Grow plan and above. Docs state no max history depth and do not say whether `range` or dates win when both are sent (dividends docs say `range` wins).
   Source: https://twelvedata.com/docs/fundamentals/splits
5. `/splits_calendar` returns `date`, `symbol`, `mic_code`, `exchange`, `description`, `ratio`, `from_factor`, `to_factor`; params `start_date`, `end_date`, `outputsize`, `page`. Useful to find upcoming splits across symbols. Grow plan and above.
   Source: https://twelvedata.com/docs/fundamentals/splits-calendar (served as part of the fundamentals docs page; the fetch tool returned the combined page, so confirm the anchor when implementing).
6. `/dividends` has its own boolean `adjust` (default `true`); semantics also unexplained. It is the client-side route if dividend adjustment is ever wanted.
   Source: https://twelvedata.com/docs/fundamentals (dividends section).
7. `/statistics` includes `last_split_factor` and `last_split_date` (Pro plan and above): a cheap secondary signal.
   Source: https://twelvedata.com/docs/fundamentals

## Detection approach supported by the docs

- Primary: poll `/splits` (per symbol, `range=last` or a date window) and compare against stored splits; a new `date` with `from_factor`/`to_factor` means older stored closes are stale. Optionally poll `/splits_calendar` for all symbols in one call.
- Verification: store a reference (`datetime`, `close`) per symbol; re-fetch that date with `adjust=splits`; if it differs, expected ratio is `ratio` (or `to_factor/from_factor`). The docs do not guarantee the restatement timing relative to the split date, so allow a lag and re-check.
- Fallback if `adjust` behaves unexpectedly: fetch `adjust=none` and apply `/splits` factors yourself (the support article endorses client-side adjustment for intraday).

## Open items (not answered by official docs)

- What exactly `all` / `splits` / `dividends` / `none` do, and whether `splits` leaves dividends unadjusted (strongly implied by default and naming, not stated).
- How quickly after a split date history is restated.
- Max historical depth of `/splits`.
