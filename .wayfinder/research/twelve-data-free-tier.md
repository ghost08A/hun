# Twelve Data free (Basic) plan: research

Checked: 2026-11-05. Official twelvedata.com pages only (docs, pricing, terms, official support center).
Context: personal automated daily job, at most 20 US stocks/ETFs.

## Answers

| Question | Answer | Source |
|---|---|---|
| Credit limits | Basic ($0): 8 credits/minute, 800/day. Per-minute quota resets every minute. | https://twelvedata.com/pricing |
| Credit cost | 1 credit per symbol for `/time_series`, `/quote`, `/price`, `/eod`. 20 symbols = 20 credits/day. | https://twelvedata.com/docs/market-data/quote (endpoint table) |
| US stocks/ETFs | Pricing page lists real-time US equities and ETFs on Basic. Support says every plan includes real-time US stock data, and historical/EOD US data is available from Basic. Docs mention `mic_code` such as `XNAS`. | https://twelvedata.com/pricing ; https://support.twelvedata.com/en/articles/9935903-us-equities-market-data ; https://twelvedata.com/docs/market-data/time-series |
| Daily close endpoint | `GET /eod?symbol=X` returns the latest EOD `close`; `date=YYYY-MM-DD` for a specific day. | https://twelvedata.com/docs/market-data/end-of-day-price |
| Historical daily closes for a month | `GET /time_series?symbol=X&interval=1day&start_date=YYYY-MM-01&end_date=YYYY-MM-31` returns `values[]` with `datetime, open, high, low, close, volume`. With dates set, `outputsize` defaults to max (up to 5000). `order` default `desc`. `adjust` default `splits`. | https://twelvedata.com/docs/market-data/time-series |
| Timing after close | Support: US historical/EOD data becomes available after midnight ET on the next trading day following each close. Closing price starts as preliminary exchange data and is finalized after the exchange's official daily reconciliation (no clock time given). Docs pages give no timing. | https://support.twelvedata.com/en/articles/9935903-us-equities-market-data ; https://support.twelvedata.com/en/articles/12682324-end-of-day-eod-pricing-market-data |
| Terms: personal automated use | Pricing page: "Internal non-display usage is included." Support: Personal Plans are "Individual, non-commercial use only." Terms 2.3(l): no use of Free Tier data for commercial purposes; 2.3(h): no automated tools to exceed rate limits; 2.2(e): no redistribution/external display without add-on; 2.3(m): do not share credentials. Nothing found prohibiting an automated personal job within limits. | https://twelvedata.com/terms ; https://twelvedata.com/pricing ; https://support.twelvedata.com/en/articles/12682324-end-of-day-eod-pricing-market-data |

## Caveats and unknowns

- Docs do not state that `/eod` or `/time_series` are free-plan-enabled endpoint by endpoint; the pricing/support pages say Basic includes US equities/ETFs and historical/EOD from Basic. The pricing page lists "EOD global equities" only for Grow+, which is non-US. Confirm by the owner's own `/api_usage` (returns `plan_limit`, `plan_daily_limit`) or first real call.
- Support says the real-time feed is about 5% of US volume; historical/EOD covers 100%. Use EOD/time_series for closes, not `/price`.
- Safe run time: schedule the job after midnight ET (e.g. morning), not minutes after the close, to get final-ish data. A same-evening run risks preliminary closes.
- Per-minute cap of 8 means 20 symbols need batching or throttling (e.g. 8 calls per minute, about 3 minutes). `/batch` sums credits per request so it does not avoid the cap.
- Exceeding-limit error behavior is not described in the docs pages read.
- Terms page fetched via summarizing tool; section numbers should be re-verified against https://twelvedata.com/terms before relying on exact wording.
- API credits docs: https://twelvedata.com/docs/advanced/api-usage (`/api_usage`, 1 credit).
