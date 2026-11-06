// Asset management shared by the owner CLI and the LINE chat commands (SPEC FR-01 to FR-06).
// Worker-safe: needs only `db` (see d1db.mjs) and fetch. Errors carry a message that is safe to show the owner.
import { sqlText } from './sql.mjs';
import {
  parseSymbol, parseThreshold, checkQuote, assetTypeFrom, addSql, removeStatements, updateSql,
} from './core.mjs';

async function requireTracked(db, symbol) {
  const rows = await db.query(`SELECT Symbol FROM Assets WHERE Symbol = ${sqlText(symbol)}`);
  if (!rows.length) throw new Error(`${symbol} is not tracked`);
  return rows[0].Symbol;
}

export async function fetchQuote(symbol, { apiKey, fetchFn = fetch }) {
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is not set');
  const res = await fetchFn(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`);
  return res.json();
}

// type: 'ETF' | 'Stock' | undefined (then the quote's type hint, else Stock).
export async function addAsset({ db, apiKey, fetchFn, symbol: rawSymbol, threshold: rawThreshold, type }) {
  const symbol = parseSymbol(rawSymbol);
  const threshold = parseThreshold(rawThreshold);
  if ((await db.query(`SELECT 1 AS x FROM Assets WHERE Symbol = ${sqlText(symbol)}`)).length) {
    throw new Error(`${symbol} is already tracked`);
  }
  const q = checkQuote(await fetchQuote(symbol, { apiKey, fetchFn }), symbol);
  const assetType = assetTypeFrom({ flag: type, typeHint: q.typeHint });
  await db.run([addSql({ symbol, name: q.name, assetType, exchange: q.exchange, currency: q.currency, threshold })]);
  return { symbol, name: q.name, assetType, exchange: q.exchange, currency: q.currency, threshold };
}

export async function editAsset({ db, symbol: rawSymbol, threshold, name }) {
  const symbol = await requireTracked(db, parseSymbol(rawSymbol));
  const patch = {};
  if (threshold !== undefined) patch.threshold = parseThreshold(threshold);
  if (name !== undefined) patch.name = String(name);
  await db.run([updateSql(symbol, patch)]);
  return { symbol, ...patch };
}

export async function setActive({ db, symbol: rawSymbol, isActive }) {
  const symbol = await requireTracked(db, parseSymbol(rawSymbol));
  await db.run([updateSql(symbol, { isActive })]);
  return { symbol, isActive };
}

export async function removeAsset({ db, symbol: rawSymbol }) {
  const symbol = await requireTracked(db, parseSymbol(rawSymbol));
  await db.run(removeStatements(symbol));
  return { symbol };
}

export const listAssets = (db) =>
  db.query('SELECT Symbol, Name, AssetType, Exchange, Currency, AlertThresholdPercent AS Threshold, IsActive FROM Assets ORDER BY Symbol');

// Everything `status` shows: one row per asset, the last runs, and the last alerts.
export async function statusData(db) {
  const assets = await db.query(`SELECT a.Symbol, a.AlertThresholdPercent AS Threshold, a.IsActive,
    (SELECT PriceDate FROM PriceHistory p WHERE p.AssetId = a.Id ORDER BY PriceDate DESC LIMIT 1) AS PriceDate,
    (SELECT Price FROM PriceHistory p WHERE p.AssetId = a.Id ORDER BY PriceDate DESC LIMIT 1) AS Price,
    (SELECT ReferencePrice FROM MonthlyReferencePrices r WHERE r.AssetId = a.Id ORDER BY ReferenceMonth DESC LIMIT 1) AS Reference,
    (SELECT Status FROM AlertHistory h WHERE h.AssetId = a.Id ORDER BY ReferenceMonth DESC LIMIT 1) AS LastAlert
    FROM Assets a ORDER BY a.Symbol`);
  const runs = await db.query('SELECT TriggerLabel, StartedAt, FinishedAt, AssetsChecked, AssetsFailed, Errors FROM RunLog ORDER BY Id DESC LIMIT 5');
  const alerts = await db.query(`SELECT a.Symbol, h.ReferenceMonth, h.Status, h.TriggerPrice, h.DropPercent, h.TriggeredAt, h.SentAt, h.ReferenceBackfilled
    FROM AlertHistory h JOIN Assets a ON a.Id = h.AssetId ORDER BY h.Id DESC LIMIT 10`);
  return { assets, runs, alerts };
}
