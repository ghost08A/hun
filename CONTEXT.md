# Context

Personal system that watches US stocks and ETFs and sends a LINE message when a price has fallen far enough from its monthly starting price.

## Language

**Tracked asset**: A US-listed stock or ETF the owner has chosen to watch, with its own alert threshold.

**Threshold**: The percentage decline, set per tracked asset, at which an alert is wanted.

**Reference price**: The split-adjusted closing price of a tracked asset on the first trading day of a reference month. Dividends are not adjusted.

**Reference month**: A calendar month, taken from the market date of the price (not the owner's local date).

**Drop percent**: How far the latest valid closing price sits below the reference price, as a percentage.

**Target price**: The price at which drop percent equals the threshold.

**Stale price**: A closing price whose market date is too old to be treated as current; never evaluated for alerts.

**Alert**: The single notification allowed per tracked asset per reference month.
