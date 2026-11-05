# Personal Investment Price Alert — Requirements

**Version:** 1.0  
**Date:** 2026-11-05  
**Status:** Draft

## 1. Product Overview

Personal Investment Price Alert is a personal system for monitoring stocks and mutual funds. It checks prices once per day and sends a LINE notification when an asset's price has fallen by a user-defined percentage from its monthly reference price.

The system supports disciplined DCA monitoring. It does not execute trades or provide investment advice.

## 2. Goals

- Track multiple stocks and funds in one place.
- Configure a separate price-drop threshold for each asset.
- Use the first trading day's closing price of each month as the reference price.
- Check prices automatically once per day.
- Notify the user through LINE when a threshold is reached.
- Operate on a Cloud Free Tier within provider quotas where possible.

## 3. Scope

### In scope (MVP)

- Single-user application; no public registration or multi-user permissions.
- Add, edit, disable, and remove tracked assets.
- Track stocks and mutual funds.
- Monthly reference prices and user-defined alert thresholds.
- Daily price retrieval and calculation.
- LINE notifications and alert history.
- Basic status and error visibility.
- Scheduled cloud execution.

### Out of scope

- Automated buying or selling.
- Investment recommendations or portfolio optimization.
- Real-time/intraday alerts.
- Multi-user accounts.
- Brokerage account integration.
- Tax, dividend, or performance reporting.

## 4. Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| FR-01 | Add asset | Add a stock or fund using its symbol/code and market/provider details. |
| FR-02 | Edit asset | Update asset name, market, currency, and tracking configuration. |
| FR-03 | Remove asset | Remove an asset from the tracking list. |
| FR-04 | View tracked assets | Show latest available price, monthly reference price, threshold, drop percentage, and data timestamp. |
| FR-05 | Enable/disable tracking | Pause tracking without deleting the asset or its history. |
| FR-06 | Configure threshold | Set a positive percentage-drop threshold per asset. |
| FR-07 | Monthly reference | Use the closing price from the asset's first trading day of the month. |
| FR-08 | Show target price | Calculate and display the price that triggers the alert. |
| FR-09 | Start new month | Establish a new monthly reference and reset that month's alert state. |
| FR-10 | Daily price check | Retrieve the latest available daily closing price once per day. |
| FR-11 | Store price history | Store price, price date, retrieval timestamp, currency, and source. |
| FR-12 | Calculate change | Calculate percentage decline from the monthly reference price. |
| FR-13 | Handle unavailable data | Record retrieval errors and do not evaluate stale or invalid prices as current. |
| FR-14 | Show data freshness | Display the latest price date and retrieval time. |
| FR-15 | Send LINE alert | Send a notification when the decline reaches or exceeds the configured threshold. |
| FR-16 | Prevent duplicate alerts | Send at most one successful alert per asset per reference month. |
| FR-17 | Alert history | Store trigger details, delivery status, and timestamps. |
| FR-18 | Test LINE connection | Allow the owner to send a test notification. |
| FR-19 | Dashboard | Show tracked assets and current alert status. |
| FR-20 | View price history | Show previously retrieved prices. |
| FR-21 | View notification history | Show past alerts and their delivery status. |
| FR-22 | System status | Show last scheduled check, failures, and data freshness. |

## 5. Business Rules

### BR-01 — Monthly reference price

Use the closing price from the asset's first trading day of the calendar month. If that date is a market holiday, use the next trading day with valid data.

Each asset follows its own market calendar. If the exact reference-day price is unavailable, use the earliest valid closing price for that month and store the actual reference date.

### BR-02 — Calculation

Percentage decline:

`dropPercent = (referencePrice - currentPrice) / referencePrice * 100`

Target price:

`targetPrice = referencePrice * (1 - thresholdPercent / 100)`

### BR-03 — Trigger condition

Trigger when `dropPercent >= thresholdPercent`, using a valid and sufficiently fresh price.

### BR-04 — Duplicate prevention

Send no more than one successful alert per asset per reference month. A price decline that continues after the first alert does not create another alert in the same month.

### BR-05 — Monthly reset

At the start of a new calendar month, establish a new reference price and allow a new alert for that month. Do not use a new reference until valid data for the new month is available.

### BR-06 — Price data validity

- Use daily closing prices, not intraday prices.
- Validate the market date and retrieval timestamp.
- Do not treat stale prices as current.
- If data is missing or invalid, record the failure and skip alert evaluation.

### BR-07 — Corporate actions

For stock splits, unit splits, or similar events, use consistently adjusted historical prices or adjust the reference price so that a mechanical price change does not cause a false alert.

### BR-08 — LINE delivery failure

Record failed deliveries and retry according to a bounded retry policy. Retries must not create duplicate alert records or duplicate successful notifications.

### BR-09 — Currency

Store the asset's trading currency with each price. Compare the current and reference prices in the same currency. Currency conversion is not required for the MVP.

## 6. User Flows

### Flow A — Add an asset

1. Open the dashboard.
2. Select **Add asset**.
3. Search for or enter the stock/fund identifier.
4. Select the correct asset and market.
5. Set the desired percentage-drop threshold.
6. Save.
7. The asset appears in the tracking list.

### Flow B — Daily price check and notification

1. The scheduled job starts.
2. Retrieve the latest valid daily closing price for each active asset.
3. Validate the data date and freshness.
4. Calculate the decline from the monthly reference price.
5. If the threshold is not reached, save the check result.
6. If reached and no successful alert exists for the asset and month, create an alert and send a LINE message.
7. Record delivery status and timestamp.

### Flow C — New month

1. The scheduler detects a new calendar month.
2. Retrieve the first valid trading-day closing price for each asset.
3. Save the monthly reference price and actual reference date.
4. Reset the alert state for the new month.
5. Continue daily checks using the new reference.

## 7. Data Model

Use a relational database. The MVP may use Cloudflare D1; SQLite is also suitable for local development.

### 7.1 Assets

| Field | Type | Description |
|---|---|---|
| Id | Integer | Primary key |
| Symbol | Text | Stock ticker or fund code |
| Name | Text | Display name |
| AssetType | Text | `Stock` or `Fund` |
| Market | Text | Exchange or market/provider |
| Currency | Text | Trading currency |
| AlertThresholdPercent | Decimal | User-defined decline threshold |
| IsActive | Boolean | Whether daily checks are enabled |
| CreatedAt | DateTime | Creation timestamp |
| UpdatedAt | DateTime | Last update timestamp |

### 7.2 MonthlyReferencePrices

| Field | Type | Description |
|---|---|---|
| Id | Integer | Primary key |
| AssetId | Integer | Foreign key to Assets |
| ReferenceMonth | Text | Calendar month, `YYYY-MM` |
| ReferenceDate | Date | Actual date used |
| ReferencePrice | Decimal | Reference closing price |
| Currency | Text | Price currency |

Unique constraint: `(AssetId, ReferenceMonth)`.

### 7.3 PriceHistory

| Field | Type | Description |
|---|---|---|
| Id | Integer | Primary key |
| AssetId | Integer | Foreign key to Assets |
| PriceDate | Date | Date represented by the price |
| Price | Decimal | Closing price |
| Currency | Text | Price currency |
| RetrievedAt | DateTime | Retrieval timestamp |
| Source | Text | Data provider/source |

### 7.4 AlertHistory

| Field | Type | Description |
|---|---|---|
| Id | Integer | Primary key |
| AssetId | Integer | Foreign key to Assets |
| ReferenceMonth | Text | Month of the alert |
| TriggerPrice | Decimal | Price that triggered the alert |
| DropPercent | Decimal | Calculated decline |
| TriggeredAt | DateTime | Trigger timestamp |
| SentAt | DateTime, nullable | Successful delivery timestamp |
| Status | Text | `Pending`, `Sent`, or `Failed` |
| ProviderMessageId | Text, nullable | Provider response identifier |

Unique constraint: `(AssetId, ReferenceMonth)` for the alert event, to prevent duplicate alert creation.

### 7.5 SystemSettings

Stores the schedule/timezone, LINE recipient identifier, retry settings, and integration status. Secrets such as access tokens must be stored in the hosting provider's secret manager, not in this table or source control.

## 8. Non-Functional Requirements

- **NFR-01 Reliability:** Scheduled checks and alert delivery must be retry-safe.
- **NFR-02 Data integrity:** Prices and reference prices must retain their source date and currency.
- **NFR-03 Security:** API keys and LINE tokens must not be committed to source control or exposed to the frontend.
- **NFR-04 Observability:** Record check outcomes, failures, and notification delivery status.
- **NFR-05 Backup:** Provide a way to export or back up tracked assets and relevant history.
- **NFR-06 Cost:** Target operation within free-tier quotas; display or document any quota assumptions.
- **NFR-07 Timezone:** Use an explicit configured timezone for scheduling and month boundaries. Store timestamps consistently, preferably in UTC.
- **NFR-08 Maintainability:** Keep market-data retrieval, alert evaluation, and LINE delivery separate so providers can be replaced.

## 9. Suggested Architecture

```text
Angular dashboard
       |
       v
Cloudflare Pages
       |
       v
Cloudflare D1 database
       ^
       |
Cloudflare Worker + Cron Trigger
       |
       +--> Market data provider
       |
       +--> Alert calculation
       |
       +--> LINE Messaging API
```

The scheduler should run once per day after relevant markets have published their daily closing prices. Because stocks and funds may have different market calendars and publication delays, the system must validate the returned price date rather than assume that a scheduled run always receives a same-day price.

## 10. Free-Tier Implementation Approach

Suggested starting options:

| Component | Candidate | Notes |
|---|---|---|
| Frontend hosting | Cloudflare Pages | Static Angular frontend; verify current plan limits. |
| Scheduled backend | Cloudflare Workers Cron Triggers | Suitable for daily jobs; verify current execution quotas. |
| Database | Cloudflare D1 | Suitable for a small single-user dataset; verify storage and query limits. |
| Notifications | LINE Messaging API | Requires a LINE Official Account and Messaging API channel; free message quotas depend on the applicable plan/region. |
| Market data | A provider with a suitable free tier, or `yfinance` for a personal prototype | Free data may be delayed, unofficial, limited, or subject to terms. Validate permitted use and reliability before deployment. |

Free service tiers and quotas can change. The project should document the provider, current quota, rate limits, and data-use terms selected during implementation. Do not promise permanent zero cost.

LINE Notify has been discontinued; use LINE Messaging API instead. A LINE Official Account and the user's LINE recipient ID are required for delivery.

## 11. Implementation Phases

1. **Asset management:** Create the project, database, and add/edit/disable asset functions.
2. **Price retrieval:** Integrate a data provider and store daily closing prices.
3. **Monthly reference engine:** Establish reference prices and calculate target prices.
4. **Alert engine:** Evaluate thresholds and implement duplicate prevention.
5. **LINE integration:** Send and record notifications; add a test-message flow.
6. **Scheduling:** Run the daily job automatically and handle failures/retries.
7. **Deployment:** Deploy to the selected free-tier services, configure secrets, and verify operation.
8. **Operational readiness:** Test backup/export, stale-data handling, and service quota limits.

## 12. Acceptance Criteria

The MVP is accepted when:

- The owner can add, edit, disable, and remove stocks and funds.
- Each asset can have its own alert threshold.
- The system selects and stores the correct monthly reference price and date.
- The decline and target-price calculations are correct.
- A LINE message is sent when a valid price meets the threshold.
- No duplicate successful alert is sent for the same asset in the same month.
- Missing, stale, or invalid price data does not trigger an alert.
- The dashboard shows latest price date, retrieval time, and system status.
- Daily checks run automatically without the user opening the application.
- The deployed system operates within the documented free-tier quotas, or clearly identifies any required paid service.

## 13. Open Decisions Before Implementation

- Which stock markets and fund providers must be supported first?
- Which market-data provider will be used, and what are its data delay and usage terms?
- What time should the daily check run, and which timezone should define the monthly boundary?
- Should a failed LINE notification be retried automatically, and how many times?
- Should the monthly reference use adjusted or unadjusted closing prices for each provider?
- What maximum data age is acceptable before the system skips alert evaluation?
