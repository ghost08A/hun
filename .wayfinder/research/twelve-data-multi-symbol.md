# Twelve Data: multi-symbol requests, /batch, credits, limit errors

Researched 2026-11-05 from official Twelve Data docs/support pages only. No API calls made. Page text was read via a summarising fetch tool, so quotes are as relayed, not byte-verified.

## 1. Comma-separated symbols in one request (/time_series, /eod)

- Support article "Batch API requests" (https://support.twelvedata.com/en/articles/5203360-batch-api-requests) says to list multiple symbols in the `symbol` parameter, separated by commas (exchange-qualified as `SBIN:NSE`). It gives an example where "each symbol consumes one API credit, so this call uses three credits."
- Support article "How to create a request" (https://support.twelvedata.com/en/articles/5620512-how-to-create-a-request) shows a comma-separated mixed-symbol example with `symbol`.
- Pricing page (https://twelvedata.com/pricing) uses `/time_series` for three symbols = 1 x 3 = 3 credits.
- API reference pages for /time_series (https://twelvedata.com/docs/market-data/time-series) and /eod (https://twelvedata.com/docs/market-data/end-of-day-price): `symbol` is described only as "Symbol ticker of the instrument" with single-symbol examples. Cost is listed as "1 per symbol" for both.
- Conclusion: comma-separated symbols are supported via the support center and pricing page. The API reference pages don't state it, and /eod is not named specifically in the support article, so /eod multi-symbol is inferred from the generic `symbol` rule and the "1 per symbol" cost.

### Response shape for multi-symbol
- NOT documented in the pages read. The reference pages show only single-symbol shapes:
  - /time_series: `{ "meta": {...}, "values": [...], "status": "ok" }`
  - /eod: `symbol, exchange, mic_code, currency, datetime, close`
- The support article only shows a keyed-by-request-id shape for JSON POST batches (see below), not for comma-separated GETs.
- Not in the docs I read: the multi-symbol GET shape (e.g. whether it is a map keyed by symbol), the maximum symbols per request, and how one bad symbol among several is reported. Only error code 414 ("Input parameter array exceeds the allowed length", no number given) hints at a cap. These must be verified empirically.

## 2. Separate /batch endpoint

- Yes. https://twelvedata.com/docs/advanced/batch-requests documents `POST https://api.twelvedata.com/batch`, "Only JSON `POST` requests are supported", with an `Authorization: apikey <key>` header.
- Request body: `{ "req_1": { "url": "/time_series?symbol=AAPL&interval=1min&apikey=demo&outputsize=2" }, "req_2": { "url": "/exchange_rate?symbol=USD/JPY&apikey=demo" } }`.
- Response: `{ "code": 200, "status": "success", "data": { "req_1": { "response": {...}, "status": "success" }, ... } }`. Each sub-request carries its own `response` and `status`.
- Errors in one sub-request "do not affect the processing of others"; each is reported separately.
- Limits: no maximum number of sub-requests stated. "The number of concurrent requests is limited by your subscription plan" (no numbers).
- Note: the support article above does not mention a `/batch` path, and its sub-request key format differs slightly (`"request_1": {"status":"ok","data":{...}}`). The docs are inconsistent on exact shape.

## 3. HTTP requests vs credits vs the 8/minute free limit

- Credits are charged per endpoint weight x number of symbols: "Data Weight x Number of Symbols = Credits Used per Endpoint per Minute" (https://support.twelvedata.com/en/articles/5615854-credits). A batch charges the sum of its sub-requests: "Your credit usage is the total sum of all successful and attempted sub-requests" (support "Batch API requests" article).
- So one HTTP request with N symbols costs N credits (for /time_series and /eod at weight 1). It does not bypass the per-minute cap: free (Basic) is "8 (800 a day)" i.e. 8 credits/minute and 800/day (https://twelvedata.com/pricing; credits article: resets to 800 at midnight UTC, quota restored at start of each minute).
- The limit is therefore in credits, not HTTP requests. 8 symbols per minute maximum on free, regardless of packing. Comma-separated or /batch only reduces HTTP round trips.
- If a batch needs more credits than available, "only partial data will be returned asynchronously until your quota is exhausted" (batch docs). Retrieval of the asynchronous remainder is not described.
- Not stated in the pages read: whether a single comma-separated GET that exceeds remaining credits is rejected whole or partially filled.
- `/api_usage` costs 1 credit per call (https://twelvedata.com/docs/advanced/api-usage). Fields are `current_usage` (last minute), `plan_limit` (per minute), and `daily_usage`/`plan_daily_limit` (only for plans with a daily limit). Responses carry `api-credits-used` / `api-credits-left` headers (https://support.twelvedata.com/en/articles/5713553-control-over-api-usage).

## 4. Errors when limits are exceeded

- https://twelvedata.com/docs/introduction/errors: HTTP/code 429 "Too Many Requests": "API request limit reached for your key." Resolution: "Wait briefly or upgrade your plan." Also 414 (parameter array too long), 400 (bad parameter, message in body), 401, 403, 404, 500.
- Credits article: "a 429 error code will notify you that the API credits limit has been reached."
- Not stated: the exact message text, or whether per-minute and daily exhaustion are distinguished by status or message (both appear to be 429). Also not stated whether the 429 arrives as HTTP status or only as `code` in a 200-status JSON body. The batch docs show a `code` field inside JSON.

## 5. Do failed requests consume credits?

- Not stated for plain requests. The errors page, credits article and usage-control article say nothing on it.
- The only related statement: batch usage counts "all successful and attempted sub-requests", so failed sub-requests inside a batch do count.
- Whether a 429 or a 400 on a single request is charged is undocumented. Check empirically via the `api-credits-used` header on an error response.

## Sources
- https://twelvedata.com/docs/advanced/batch-requests
- https://twelvedata.com/docs/introduction/errors
- https://twelvedata.com/docs/market-data/time-series
- https://twelvedata.com/docs/market-data/end-of-day-price
- https://twelvedata.com/docs/advanced/api-usage
- https://twelvedata.com/pricing
- https://support.twelvedata.com/en/articles/5615854-credits
- https://support.twelvedata.com/en/articles/5203360-batch-api-requests
- https://support.twelvedata.com/en/articles/5620512-how-to-create-a-request
- https://support.twelvedata.com/en/articles/5713553-control-over-api-usage
