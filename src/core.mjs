// Pure helpers for the owner scripts. No I/O, so they are cheap to test.

// US venues allowed (SPEC section 2). ARCX (NYSE Arca) added because most US ETFs list there.
export const ALLOWED_MICS = new Set(['XNYS', 'XNAS', 'XNGS', 'XNMS', 'XNCM', 'ARCX']);
export const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE ARCA']);

export function parseSymbol(input) {
  const s = String(input ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) throw new Error(`Invalid symbol: "${input}"`);
  return s;
}

export function parseThreshold(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) {
    throw new Error(`Threshold must be greater than 0 and less than 100, got "${input}"`);
  }
  return n;
}

export { sqlText } from './sql.mjs';
import { sqlText } from './sql.mjs';

// quote: Twelve Data /quote response.
export function checkQuote(quote, symbol) {
  if (!quote || quote.status === 'error') {
    throw new Error(`Twelve Data rejected ${symbol}: ${quote?.message ?? 'no response'}`);
  }
  const mic = String(quote.mic_code ?? '').toUpperCase();
  const exch = String(quote.exchange ?? '').toUpperCase();
  if (!ALLOWED_MICS.has(mic) && !ALLOWED_EXCHANGES.has(exch)) {
    throw new Error(`${symbol} trades on "${quote.exchange ?? '?'}" (${mic || 'no MIC'}); only NYSE/NASDAQ/NYSE Arca are allowed`);
  }
  if (!quote.name || !quote.currency) throw new Error(`Twelve Data returned no name/currency for ${symbol}`);
  return { name: quote.name, exchange: mic || exch, currency: quote.currency, typeHint: quote.type };
}

export function assetTypeFrom({ flag, typeHint }) {
  if (flag) return flag;
  return /etf/i.test(String(typeHint ?? '')) ? 'ETF' : 'Stock';
}

export function addSql({ symbol, name, assetType, exchange, currency, threshold }) {
  return `INSERT INTO Assets (Symbol, Name, AssetType, Exchange, Currency, AlertThresholdPercent) VALUES (${sqlText(symbol)}, ${sqlText(name)}, ${sqlText(assetType)}, ${sqlText(exchange)}, ${sqlText(currency)}, ${threshold})`;
}

export const removeSql = (symbol) => removeStatements(symbol).join('; ');

export function removeStatements(symbol) {
  const sub = `(SELECT Id FROM Assets WHERE Symbol = ${sqlText(symbol)})`;
  // Explicit child deletes so removal never depends on foreign-key enforcement.
  return [
    `DELETE FROM AlertHistory WHERE AssetId = ${sub}`,
    `DELETE FROM CheckResults WHERE AssetId = ${sub}`,
    `DELETE FROM PriceHistory WHERE AssetId = ${sub}`,
    `DELETE FROM ReferenceAdjustments WHERE AssetId = ${sub}`,
    `DELETE FROM MonthlyReferencePrices WHERE AssetId = ${sub}`,
    `DELETE FROM Assets WHERE Symbol = ${sqlText(symbol)}`,
  ];
}

export function updateSql(symbol, { threshold, name, isActive }) {
  const sets = [];
  if (threshold !== undefined) sets.push(`AlertThresholdPercent = ${threshold}`);
  if (name !== undefined) sets.push(`Name = ${sqlText(name)}`);
  if (isActive !== undefined) sets.push(`IsActive = ${isActive ? 1 : 0}`);
  if (!sets.length) throw new Error('Nothing to update');
  sets.push(`UpdatedAt = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`);
  return `UPDATE Assets SET ${sets.join(', ')} WHERE Symbol = ${sqlText(symbol)}`;
}

// Target price and drop for display (BR-02).
export function targetPrice(reference, thresholdPercent) {
  return reference * (1 - thresholdPercent / 100);
}
export function dropPercent(reference, current) {
  return ((reference - current) / reference) * 100;
}
