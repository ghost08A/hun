// Owner CLI (SPEC section 8). Talks to D1 through wrangler; add also calls Twelve Data once.
// Usage: npm run assets -- <add|edit|disable|enable|remove|list|status> ... [--remote]
import { targetPrice, dropPercent } from '../src/core.mjs';
import { addAsset, editAsset, setActive, removeAsset, listAssets, statusData } from '../src/commands.mjs';
import { loadEnv, cliDb } from './lib.mjs';

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

const fmt = (n) => (n == null ? '-' : Number(n).toFixed(2));

async function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const [cmd, symbol, threshold] = pos;
  const remote = Boolean(flags.remote);
  const db = cliDb(remote);
  const where = remote ? 'REMOTE' : 'local';

  switch (cmd) {
    case 'add': {
      const apiKey = loadEnv().TWELVE_DATA_API_KEY;
      if (!apiKey) throw new Error('TWELVE_DATA_API_KEY is not set (put it in .dev.vars)');
      const a = await addAsset({ db, apiKey, symbol, threshold, type: flags.etf ? 'ETF' : flags.stock ? 'Stock' : undefined });
      console.log(`[${where}] Added ${a.symbol} (${a.name}, ${a.assetType}, ${a.exchange}, ${a.currency}) threshold ${a.threshold}%`);
      break;
    }
    case 'edit': {
      const r = await editAsset({ db, symbol, threshold: flags.threshold, name: flags.name });
      console.log(`[${where}] Updated ${r.symbol}`);
      break;
    }
    case 'disable':
    case 'enable': {
      const r = await setActive({ db, symbol, isActive: cmd === 'enable' });
      console.log(`[${where}] ${cmd}d ${r.symbol}`);
      break;
    }
    case 'remove': {
      if (!flags.yes) throw new Error(`remove deletes ${symbol?.toUpperCase()} and ALL its history. Re-run with --yes (or use "disable" to keep history).`);
      const r = await removeAsset({ db, symbol });
      console.log(`[${where}] Removed ${r.symbol} and its history`);
      break;
    }
    case 'list': {
      for (const a of await listAssets(db)) {
        console.log(`${a.IsActive ? ' ' : 'x'} ${a.Symbol.padEnd(8)} ${String(a.Threshold).padStart(5)}%  ${a.AssetType.padEnd(5)} ${a.Exchange} ${a.Currency}  ${a.Name}`);
      }
      break;
    }
    case 'status': {
      const { assets, runs, alerts } = await statusData(db);
      console.log('SYMBOL   ACTIVE  PRICE DATE   PRICE    REF      TARGET   DROP%   ALERT');
      for (const r of assets) {
        const target = r.Reference == null ? null : targetPrice(r.Reference, r.Threshold);
        const drop = r.Reference == null || r.Price == null ? null : dropPercent(r.Reference, r.Price);
        console.log(`${r.Symbol.padEnd(8)} ${(r.IsActive ? 'yes' : 'no').padEnd(7)} ${(r.PriceDate ?? '-').padEnd(12)} ${fmt(r.Price).padEnd(8)} ${fmt(r.Reference).padEnd(8)} ${fmt(target).padEnd(8)} ${fmt(drop).padEnd(7)} ${r.LastAlert ?? '-'}`);
      }
      console.log(runs.length ? '\nLast runs:' : '\nNo runs recorded yet (the first scheduled run is at 19:00 Asia/Bangkok).');
      for (const r of runs) console.log(`  ${r.StartedAt} ${r.TriggerLabel} checked=${r.AssetsChecked} failed=${r.AssetsFailed} ${r.Errors ?? ''}`);
      console.log(alerts.length ? '\nAlerts:' : '\nNo alerts yet.');
      for (const h of alerts) console.log(`  ${h.ReferenceMonth} ${h.Symbol.padEnd(8)} ${h.Status.padEnd(8)} price ${fmt(h.TriggerPrice)} drop ${fmt(h.DropPercent)}%${h.ReferenceBackfilled ? ' (reference back-filled)' : ''}${h.SentAt ? ` sent ${h.SentAt}` : ''}`);
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
