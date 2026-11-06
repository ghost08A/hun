// LINE chat commands (English only). Same operations as the owner CLI, answered in Thai.
// LINE shows plain text only, so replies are built as short blocks: one fact per line, a blank line between
// assets, and a coloured dot as the first thing the eye lands on (🟢 above start, 🟡 down but below the rate,
// 🔴 at or past the rate, ⚪ no price yet, ⏸ paused).
import { sqlText } from './sql.mjs';
import { targetPrice, dropPercent } from './core.mjs';
import { addAsset, editAsset, setActive, removeAsset, listAssets, statusData } from './commands.mjs';
import { dailyJob } from './daily.mjs';
import { fetchUsage } from './market.mjs';

export const CONFIRM_WINDOW_MS = 2 * 60 * 1000;
export const FETCH_LIMIT = 8; // one chat fetch handles at most 8 assets: the per-minute credit limit, and it must finish inside the Worker's post-response window

export const HELP = [
  '📖 คำสั่ง (พิมพ์เป็นภาษาอังกฤษ)',
  '',
  'ดูข้อมูล',
  'status — ราคาและสถานะทุกตัว',
  'list — รายการหุ้นและเกณฑ์',
  '',
  'จัดการหุ้น',
  'add NVDA 8 — เพิ่ม เกณฑ์ลด 8%',
  'add VOO 5 etf — เพิ่ม ETF',
  'edit NVDA 10 — เปลี่ยนเกณฑ์',
  'disable NVDA — พักติดตาม',
  'enable NVDA — ติดตามต่อ',
  'remove NVDA — ลบ (ต้อง confirm)',
  '',
  'อื่นๆ',
  `fetch — ดึงราคาตอนนี้ (สูงสุด ${FETCH_LIMIT} ตัวต่อครั้ง)`,
].join('\n');

const USAGE = {
  add: 'add SYMBOL N [etf]\nเช่น add NVDA 8 หรือ add VOO 5 etf',
  edit: 'edit SYMBOL N\nเช่น edit NVDA 10',
  disable: 'disable SYMBOL\nเช่น disable NVDA',
  enable: 'enable SYMBOL\nเช่น enable NVDA',
  remove: 'remove SYMBOL\nเช่น remove NVDA',
  confirm: 'confirm SYMBOL\nเช่น confirm NVDA',
};

// Returns { cmd, args } or { error }.
export function parseCommand(text) {
  const parts = String(text ?? '').trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return { error: 'พิมพ์ help เพื่อดูคำสั่ง' };
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const bad = () => ({ error: `รูปแบบคำสั่ง\n${USAGE[cmd]}` });
  switch (cmd) {
    case 'help': case 'list': case 'status': case 'fetch':
      return args.length ? { error: `${cmd} ไม่มีค่าต่อท้าย` } : { cmd, args };
    case 'add': {
      const type = args[2]?.toLowerCase();
      if (args.length < 2 || args.length > 3 || (args.length === 3 && type !== 'etf' && type !== 'stock')) return bad();
      return { cmd, args: [args[0], args[1], type] };
    }
    case 'edit':
      return args.length === 2 ? { cmd, args } : bad();
    case 'disable': case 'enable': case 'remove': case 'confirm':
      return args.length === 1 ? { cmd, args } : bad();
    default:
      return { error: `ไม่รู้จักคำสั่ง "${parts[0]}"\nพิมพ์ help เพื่อดูคำสั่ง` };
  }
}

const n2 = (x) => (x == null ? '-' : Number(x).toFixed(2));
const bkk = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 16);
const alertWord = { Sent: 'ส่งแล้ว', Pending: 'รอส่ง', Failed: 'ส่งไม่สำเร็จ (จะลองใหม่)' };
const creditsLine = (u) => (u ? `💳 Credit วันนี้: ใช้ ${u.used}/${u.limit} (เหลือ ${u.left})` : '');
const dropText = (d) => (d >= 0 ? `ลดแล้ว ${n2(d)}%` : `สูงกว่าตั้งต้น ${n2(-d)}%`);
const dot = (drop, threshold) => (drop == null ? '⚪' : drop >= threshold - 1e-9 ? '🔴' : drop >= 0 ? '🟡' : '🟢');

// One asset as a block of short lines. a: { symbol, active, price, priceDate, reference, threshold, lastAlert }
function assetBlock(a) {
  const target = a.reference == null ? null : targetPrice(a.reference, a.threshold);
  const drop = a.reference == null || a.price == null ? null : dropPercent(a.reference, a.price);
  const lines = [a.active === false ? `⏸ ${a.symbol} (พักติดตาม)` : `${dot(drop, a.threshold)} ${a.symbol}`];
  if (a.price == null) lines.push('ยังไม่มีราคา (รอรอบ 19:00 หรือพิมพ์ fetch)');
  else lines.push(`ราคาปิด ${n2(a.price)} (${a.priceDate})`);
  if (a.reference != null) {
    lines.push(`ตั้งต้น ${n2(a.reference)}`);
    lines.push(`เกณฑ์ ลด ${a.threshold}% → ${n2(target)}`);
    if (drop != null) lines.push(`ตอนนี้ ${dropText(drop)}`);
  } else {
    lines.push(`เกณฑ์ ลด ${a.threshold}%`);
  }
  if (a.lastAlert) lines.push(`แจ้งเตือนเดือนนี้: ${alertWord[a.lastAlert] ?? a.lastAlert}`);
  return lines.join('\n');
}

const LEGEND = '🟢 สูงกว่าตั้งต้น  🟡 ลดแล้วแต่ยังไม่ถึงเกณฑ์  🔴 ถึงเกณฑ์แล้ว';

export function formatStatus({ assets, runs }) {
  if (!assets.length) return 'ยังไม่มีหุ้นที่ติดตาม\nเพิ่มด้วย add SYMBOL N';
  const blocks = assets.map((r) => assetBlock({
    symbol: r.Symbol, active: Boolean(r.IsActive), price: r.Price, priceDate: r.PriceDate,
    reference: r.Reference, threshold: r.Threshold, lastAlert: r.LastAlert,
  }));
  const run = runs?.length
    ? `🕖 รอบล่าสุด ${bkk(runs[0].StartedAt)} · ตรวจสำเร็จ ${runs[0].AssetsChecked} · ล้มเหลว ${runs[0].AssetsFailed}`
    : '🕖 ยังไม่มีรอบรัน (รอบแรก 19:00 น.)';
  return [`📊 สถานะ ${assets.length} ตัว`, ...blocks, run, LEGEND].join('\n\n');
}

export function formatList(assets) {
  if (!assets.length) return 'ยังไม่มีหุ้นที่ติดตาม\nเพิ่มด้วย add SYMBOL N';
  const blocks = assets.map((a) => `${a.IsActive ? '' : '⏸ '}${a.Symbol} — ${a.Name}\nเกณฑ์ ลด ${a.Threshold}% · ${a.AssetType}${a.IsActive ? '' : ' · พักติดตาม'}`);
  return [`📋 รายการ ${assets.length} ตัว`, ...blocks].join('\n\n');
}

// results: runFetch().results; notify: sendPending() summary; credits: fetchUsage() or null.
export function formatFetch({ results = [], notify, stoppedByBudget, stoppedByRateLimit, credits }) {
  if (!results.length && !stoppedByRateLimit) {
    return ['✔️ ไม่มีอะไรต้องดึง', 'ทุกตัวตรวจสำเร็จแล้ววันนี้ ดูผลด้วย status', creditsLine(credits)].filter(Boolean).join('\n\n');
  }
  const blocks = results.map((r) => {
    if (r.outcome !== 'ok') {
      const why = r.outcome === 'stale' ? 'ราคาเก่าเกินไป ยังไม่ประเมิน' : r.outcome === 'held' ? 'ราคากระโดดผิดปกติ งดประเมินไว้ก่อน' : 'ดึงราคาไม่สำเร็จ';
      return `⚠️ ${r.symbol}\n${why}\n${r.detail}`;
    }
    return assetBlock({ symbol: r.symbol, price: r.close, priceDate: r.priceDate, reference: r.reference, threshold: r.threshold });
  });
  const notes = [];
  if (notify?.sent) notes.push(`🔔 ส่งแจ้งเตือนเข้า LINE แล้ว ${notify.sent} รายการ`);
  if (notify?.failed) notes.push(`⚠️ ส่งแจ้งเตือนไม่สำเร็จ ${notify.failed} รายการ (จะลองใหม่)`);
  if (stoppedByBudget) notes.push(`ทำได้สูงสุด ${FETCH_LIMIT} ตัวต่อครั้ง พิมพ์ fetch อีกครั้งเพื่อทำตัวที่เหลือ`);
  if (stoppedByRateLimit) notes.push('ชนเพดานต่อนาทีของ Twelve Data รอ 1 นาทีแล้วพิมพ์ fetch ใหม่');
  return ['🔄 ดึงราคาแล้ว', ...blocks, ...notes, creditsLine(credits), results.some((r) => r.outcome === 'ok') ? LEGEND : ''].filter(Boolean).join('\n\n');
}

async function setPending(db, symbol, now) {
  const value = `${symbol}|${now + CONFIRM_WINDOW_MS}`;
  await db.run([`INSERT INTO SystemSettings (Key, Value) VALUES ('pendingRemove', ${sqlText(value)}) ON CONFLICT (Key) DO UPDATE SET Value = excluded.Value`]);
}

// Runs one chat command and returns the reply text. Errors become a short warning for the owner.
export async function runChatCommand({ text, db, env, fetchFn = fetch, now = () => Date.now(), sleep }) {
  const parsed = parseCommand(text);
  if (parsed.error) return parsed.error;
  const { cmd, args } = parsed;
  const apiKey = env.TWELVE_DATA_API_KEY;
  try {
    switch (cmd) {
      case 'help':
        return HELP;
      case 'list':
        return formatList(await listAssets(db));
      case 'status':
        return formatStatus(await statusData(db));
      case 'add': {
        const a = await addAsset({ db, apiKey, fetchFn, symbol: args[0], threshold: args[1], type: args[2] === 'etf' ? 'ETF' : args[2] === 'stock' ? 'Stock' : undefined });
        return [`✅ เพิ่ม ${a.symbol} แล้ว`, `${a.name}\n${a.assetType} · ${a.exchange}`, `เกณฑ์แจ้งเตือน: ลด ${a.threshold}%`,
          'ราคาแรกเข้าตอนรอบ 19:00 หรือพิมพ์ fetch', creditsLine(await fetchUsage({ apiKey, fetchFn }))].filter(Boolean).join('\n\n');
      }
      case 'edit': {
        const r = await editAsset({ db, symbol: args[0], threshold: args[1] });
        return `✅ แก้เกณฑ์ ${r.symbol} แล้ว\n\nเกณฑ์ใหม่: ลด ${r.threshold}%`;
      }
      case 'disable':
      case 'enable': {
        const r = await setActive({ db, symbol: args[0], isActive: cmd === 'enable' });
        return r.isActive ? `✅ ${r.symbol} ติดตามต่อแล้ว` : `⏸ ${r.symbol} พักติดตามแล้ว\n\nเก็บประวัติไว้ ใช้ enable ${r.symbol} เพื่อติดตามต่อ`;
      }
      case 'remove': {
        const symbol = args[0].toUpperCase();
        const found = (await listAssets(db)).find((a) => a.Symbol === symbol);
        if (!found) return `${symbol} ไม่ได้ติดตามอยู่`;
        await setPending(db, symbol, now());
        return [`⚠️ ยืนยันการลบ ${symbol}?`, 'จะลบหุ้นนี้และประวัติทั้งหมดถาวร', `พิมพ์ confirm ${symbol} ภายใน 2 นาที`, `อยากเก็บประวัติ ใช้ disable ${symbol} แทน`].join('\n\n');
      }
      case 'confirm': {
        const symbol = args[0].toUpperCase();
        const [row] = await db.query("SELECT Value FROM SystemSettings WHERE Key = 'pendingRemove'");
        const [pendingSymbol, expires] = String(row?.Value ?? '').split('|');
        if (pendingSymbol !== symbol || !(Number(expires) > now())) {
          return `ไม่มีคำขอลบ ${symbol} ที่รอยืนยัน\n\nหมดอายุแล้ว หรือยังไม่ได้พิมพ์ remove ${symbol}`;
        }
        await db.run(["DELETE FROM SystemSettings WHERE Key = 'pendingRemove'"]);
        const r = await removeAsset({ db, symbol });
        return `🗑 ลบ ${r.symbol} แล้ว\n\nลบหุ้นและประวัติทั้งหมดเรียบร้อย`;
      }
      case 'fetch': {
        const logs = [];
        const out = await dailyJob({
          db, env, label: 'line', fetchFn, now, sleep, log: (m) => logs.push(m),
          runOptions: { maxFetches: FETCH_LIMIT, spacingMs: 0 },
        });
        if (!out.run) return `⚠️ ดึงราคาไม่สำเร็จ\n\n${logs.find((l) => l.startsWith('run failed')) ?? 'ลองใหม่อีกครั้ง หรือดูสาเหตุด้วย npx wrangler tail'}`;
        return formatFetch({ ...out.run, notify: out.notify, credits: await fetchUsage({ apiKey, fetchFn }) });
      }
      default:
        return HELP;
    }
  } catch (e) {
    return `⚠️ ${e.message}`;
  }
}
