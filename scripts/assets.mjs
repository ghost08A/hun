// Owner CLI (SPEC section 8). Talks to D1 through wrangler; add also calls Twelve Data once.
// Usage: npm run assets -- <add|edit|disable|enable|remove|list|status> ... [--remote]
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parseSymbol, parseThreshold, checkQuote, assetTypeFrom, addSql, removeSql, updateSql,
  targetPrice, dropPercent, sqlText,
} from './core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function loadEnv() {
  const file = path.join(root, '.dev.vars');
  const env = { ...process.env };
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      // Tolerate spaces and surrounding quotes around the value.
      const value = m?.[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
      if (m && !line.trim().startsWith('#') && value) env[m[1]] = value;
    }
  }
  return env;
}

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['threshold', 'name'].includes(key)) flags[key] = argv[++i];
      else flags[key] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

function d1(sql, remote) {
  const args = [WRANGLER, 'd1', 'execute', 'price-alert', remote ? '--remote' : '--local', '--json', '--command', sql];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`wrangler failed:\n${r.stderr || r.stdout}`);
  const parsed = JSON.parse(r.stdout);
  return parsed[parsed.length - 1]?.results ?? [];
}

async function fetchQuote(symbol, env) {
  const key = env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not set (put it in .dev.vars)');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  return res.json();
}

const fmt = (n) => (n == null ? '-' : Number(n).toFixed(2));

async function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const [cmd, rawSymbol, rawThreshold] = pos;
  const remote = Boolean(flags.remote);
  const env = loadEnv();
  const where = remote ? 'REMOTE' : 'local';

  switch (cmd) {
    case 'add': {
      const symbol = parseSymbol(rawSymbol);
      const threshold = parseThreshold(rawThreshold);
      if (d1(`SELECT 1 AS x FROM Assets WHERE Symbol = ${sqlText(symbol)}`, remote).length) {
        throw new Error(`${symbol} is already tracked`);
      }
      const q = checkQuote(await fetchQuote(symbol, env), symbol);
      const flag = flags.etf ? 'ETF' : flags.stock ? 'Stock' : undefined;
      const assetType = assetTypeFrom({ flag, typeHint: q.typeHint });
      d1(addSql({ symbol, name: q.name, assetType, exchange: q.exchange, currency: q.currency, threshold }), remote);
      console.log(`[${where}] Added ${symbol} (${q.name}, ${assetType}, ${q.exchange}, ${q.currency}) threshold ${threshold}%`);
      break;
    }
    case 'edit': {
      const symbol = parseSymbol(rawSymbol);
      const patch = {};
      if (flags.threshold !== undefined) patch.threshold = parseThreshold(flags.threshold);
      if (flags.name !== undefined) patch.name = String(flags.name);
      d1(updateSql(symbol, patch), remote);
      console.log(`[${where}] Updated ${symbol}`);
      break;
    }
    case 'disable':
    case 'enable': {
      const symbol = parseSymbol(rawSymbol);
      d1(updateSql(symbol, { isActive: cmd === 'enable' }), remote);
      console.log(`[${where}] ${cmd}d ${symbol}`);
      break;
    }
    case 'remove': {
      const symbol = parseSymbol(rawSymbol);
      if (!flags.yes) throw new Error(`remove deletes ${symbol} and ALL its history. Re-run with --yes (or use "disable" to keep history).`);
      d1(removeSql(symbol), remote);
      console.log(`[${where}] Removed ${symbol} and its history`);
      break;
    }
    case 'list': {
      for (const a of d1('SELECT Symbol, Name, AssetType, Exchange, Currency, AlertThresholdPercent AS Threshold, IsActive FROM Assets ORDER BY Symbol', remote)) {
        console.log(`${a.IsActive ? ' ' : 'x'} ${a.Symbol.padEnd(8)} ${String(a.Threshold).padStart(5)}%  ${a.AssetType.padEnd(5)} ${a.Exchange} ${a.Currency}  ${a.Name}`);
      }
      break;
    }
    case 'status': {
      const rows = d1(`SELECT a.Symbol, a.AlertThresholdPercent AS Threshold, a.IsActive,
        (SELECT PriceDate FROM PriceHistory p WHERE p.AssetId = a.Id ORDER BY PriceDate DESC LIMIT 1) AS PriceDate,
        (SELECT Price FROM PriceHistory p WHERE p.AssetId = a.Id ORDER BY PriceDate DESC LIMIT 1) AS Price,
        (SELECT ReferencePrice FROM MonthlyReferencePrices r WHERE r.AssetId = a.Id ORDER BY ReferenceMonth DESC LIMIT 1) AS Reference,
        (SELECT Status FROM AlertHistory h WHERE h.AssetId = a.Id ORDER BY ReferenceMonth DESC LIMIT 1) AS LastAlert
        FROM Assets a ORDER BY a.Symbol`, remote);
      console.log('SYMBOL   ACTIVE  PRICE DATE   PRICE    REF      TARGET   DROP%   ALERT');
      for (const r of rows) {
        const target = r.Reference == null ? null : targetPrice(r.Reference, r.Threshold);
        const drop = r.Reference == null || r.Price == null ? null : dropPercent(r.Reference, r.Price);
        console.log(`${r.Symbol.padEnd(8)} ${(r.IsActive ? 'yes' : 'no').padEnd(7)} ${(r.PriceDate ?? '-').padEnd(12)} ${fmt(r.Price).padEnd(8)} ${fmt(r.Reference).padEnd(8)} ${fmt(target).padEnd(8)} ${fmt(drop).padEnd(7)} ${r.LastAlert ?? '-'}`);
      }
      const runs = d1('SELECT TriggerLabel, StartedAt, FinishedAt, AssetsChecked, AssetsFailed, Errors FROM RunLog ORDER BY Id DESC LIMIT 5', remote);
      console.log(runs.length ? '\nLast runs:' : '\nNo runs recorded yet (cron arrives in a later phase).');
      for (const r of runs) console.log(`  ${r.StartedAt} ${r.TriggerLabel} checked=${r.AssetsChecked} failed=${r.AssetsFailed} ${r.Errors ?? ''}`);
      break;
    }
    default:
      console.log('Usage: npm run assets -- add SYMBOL THRESHOLD [--etf|--stock]\n       npm run assets -- edit SYMBOL [--threshold N] [--name "..."]\n       npm run assets -- disable|enable SYMBOL\n       npm run assets -- remove SYMBOL --yes\n       npm run assets -- list | status\nAdd --remote to act on the deployed database (default: local).');
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
