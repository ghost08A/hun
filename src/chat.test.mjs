import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, formatStatus, formatList, formatFetch, runChatCommand, CONFIRM_WINDOW_MS, HELP } from './chat.mjs';

test('parseCommand accepts the documented commands (English, any case, optional slash)', () => {
  assert.deepEqual(parseCommand('status'), { cmd: 'status', args: [] });
  assert.deepEqual(parseCommand('  /LIST '), { cmd: 'list', args: [] });
  assert.deepEqual(parseCommand('add NVDA 8'), { cmd: 'add', args: ['NVDA', '8', undefined] });
  assert.deepEqual(parseCommand('add VOO 5 ETF'), { cmd: 'add', args: ['VOO', '5', 'etf'] });
  assert.deepEqual(parseCommand('edit nvda 10'), { cmd: 'edit', args: ['nvda', '10'] });
  assert.equal(parseCommand('remove NVDA').cmd, 'remove');
  assert.equal(parseCommand('confirm NVDA').cmd, 'confirm');
  assert.equal(parseCommand('fetch').cmd, 'fetch');
});

test('parseCommand rejects bad shapes with a usage hint', () => {
  for (const t of ['add NVDA', 'add NVDA 5 foo', 'edit NVDA', 'remove', 'disable A B', 'status now', '']) {
    assert.ok(parseCommand(t).error, `should reject "${t}"`);
  }
  assert.match(parseCommand('hello').error, /ไม่รู้จักคำสั่ง/);
  assert.match(parseCommand('add NVDA').error, /add SYMBOL N/);
});

test('status shows the base price, the rate and target, and where the price is now', () => {
  const t = formatStatus({
    assets: [{ Symbol: 'AAPL', Threshold: 5, IsActive: 1, PriceDate: '2026-11-04', Price: 320.1, Reference: 338.32, LastAlert: null },
      { Symbol: 'SPY', Threshold: 3, IsActive: 0, PriceDate: null, Price: null, Reference: null, LastAlert: null }],
    runs: [{ StartedAt: '2026-11-06T12:00:00Z', AssetsChecked: 1, AssetsFailed: 0 }], alerts: [],
  });
  // One fact per line, a blank line between assets.
  assert.match(t, /🔴 AAPL\nราคาปิด 320\.10 \(2026-11-04\)\nตั้งต้น 338\.32\nเกณฑ์ ลด 5% → 321\.40\nตอนนี้ ลดแล้ว 5\.39%/);
  assert.match(t, /\n\n⏸ SPY \(พักติดตาม\)\nยังไม่มีราคา/);
  assert.match(t, /🕖 รอบล่าสุด 2026-11-06 19:00 · ตรวจสำเร็จ 1 · ล้มเหลว 0/); // shown in Bangkok time
  assert.ok(t.startsWith('📊 สถานะ 2 ตัว\n\n'));
  const dotOf = (price) => formatStatus({ assets: [{ Symbol: 'X', Threshold: 5, IsActive: 1, PriceDate: 'd', Price: price, Reference: 100, LastAlert: null }], runs: [] }).match(/\n\n(\S) X/u)[1];
  assert.deepEqual([dotOf(110), dotOf(98), dotOf(95)], ['🟢', '🟡', '🔴']);
  assert.match(formatStatus({ assets: [{ Symbol: 'X', Threshold: 5, IsActive: 1, PriceDate: 'd', Price: 110, Reference: 100, LastAlert: 'Sent' }], runs: [] }), /ตอนนี้ สูงกว่าตั้งต้น 10\.00%\nแจ้งเตือนเดือนนี้: ส่งแล้ว/);
});

test('list is one block per asset', () => {
  const t = formatList([
    { Symbol: 'AAPL', Threshold: 5, IsActive: 1, AssetType: 'Stock', Name: 'Apple' },
    { Symbol: 'SPY', Threshold: 3, IsActive: 0, AssetType: 'ETF', Name: 'SPDR' },
  ]);
  assert.equal(t, '📋 รายการ 2 ตัว\n\nAAPL — Apple\nเกณฑ์ ลด 5% · Stock\n\n⏸ SPY — SPDR\nเกณฑ์ ลด 3% · ETF · พักติดตาม');
});

test('fetch reply: a block per asset, alert note, and the credits line last', () => {
  const t = formatFetch({
    results: [
      { symbol: 'AAPL', outcome: 'ok', close: 320.1, priceDate: '2026-11-04', reference: 338.32, threshold: 5 },
      { symbol: 'XYZ', outcome: 'stale', detail: 'latest close 2026-10-01 is older than 4 days' },
    ],
    notify: { sent: 1, failed: 0 }, stoppedByBudget: true, credits: { used: 14, limit: 800, left: 786 },
  });
  assert.ok(t.startsWith('🔄 ดึงราคาแล้ว\n\n🔴 AAPL\nราคาปิด 320.10 (2026-11-04)'));
  assert.match(t, /\n\n⚠️ XYZ\nราคาเก่าเกินไป ยังไม่ประเมิน\nlatest close/);
  assert.match(t, /🔔 ส่งแจ้งเตือนเข้า LINE แล้ว 1 รายการ/);
  assert.match(t, /ทำได้สูงสุด 8 ตัวต่อครั้ง/);
  assert.match(t, /💳 Credit Twelve Data วันนี้: ใช้ 14\/800 \(เหลือ 786\)/);
  assert.match(formatFetch({ results: [], credits: null }), /ไม่มีอะไรต้องดึง/);
});

// Minimal db stub: one tracked asset and a settings table.
function stubDb(assets = ['NVDA']) {
  const settings = {};
  const ran = [];
  return {
    ran, settings,
    query: async (sql) => {
      if (sql.includes('FROM Assets ORDER BY Symbol')) return assets.map((Symbol) => ({ Symbol, Name: Symbol, AssetType: 'Stock', Exchange: 'XNAS', Currency: 'USD', Threshold: 5, IsActive: 1 }));
      if (sql.includes('SELECT Symbol FROM Assets WHERE')) { const s = /'([^']+)'/.exec(sql)[1]; return assets.includes(s) ? [{ Symbol: s }] : []; }
      if (sql.includes("Key = 'pendingRemove'")) return settings.pendingRemove ? [{ Value: settings.pendingRemove }] : [];
      return [];
    },
    run: async (statements) => {
      for (const s of statements) {
        ran.push(s);
        const m = /INSERT INTO SystemSettings.*VALUES \('pendingRemove', '([^']+)'\)/.exec(s);
        if (m) settings.pendingRemove = m[1];
        if (s.includes("DELETE FROM SystemSettings WHERE Key = 'pendingRemove'")) delete settings.pendingRemove;
      }
    },
  };
}
const env = { TWELVE_DATA_API_KEY: 'k' };
const fetchFn = async () => ({ status: 200, json: async () => ({}) });

test('remove needs a matching confirm within 2 minutes; nothing is deleted before that', async () => {
  const db = stubDb();
  let t = 1_000_000;
  const run = (text) => runChatCommand({ text, db, env, fetchFn, now: () => t });

  assert.match(await run('remove NVDA'), /confirm NVDA ภายใน 2 นาที/);
  assert.equal(db.ran.some((s) => s.includes('DELETE FROM Assets')), false);

  assert.match(await run('confirm AAPL'), /ไม่มีคำขอลบ AAPL/);          // wrong symbol
  t += CONFIRM_WINDOW_MS + 1;
  assert.match(await run('confirm NVDA'), /ไม่มีคำขอลบ NVDA/);          // expired
  assert.equal(db.ran.some((s) => s.includes('DELETE FROM Assets')), false);

  await run('remove NVDA');                                              // ask again
  assert.match(await run('confirm nvda'), /ลบ NVDA แล้ว\n\nลบหุ้นและประวัติทั้งหมดเรียบร้อย/);
  assert.equal(db.ran.some((s) => s.includes('DELETE FROM Assets')), true);
  assert.match(await run('confirm NVDA'), /ไม่มีคำขอลบ NVDA/);          // single use
});

test('remove of an unknown symbol and errors are answered, not thrown', async () => {
  const db = stubDb(['NVDA']);
  assert.match(await runChatCommand({ text: 'remove ZZZ', db, env, fetchFn }), /ZZZ ไม่ได้ติดตามอยู่/);
  assert.match(await runChatCommand({ text: 'edit ZZZ 5', db, env, fetchFn }), /⚠️ ZZZ is not tracked/);
  assert.match(await runChatCommand({ text: 'edit NVDA 100', db, env, fetchFn }), /⚠️ Threshold must be greater than 0/);
  assert.match(await runChatCommand({ text: 'nonsense', db, env, fetchFn }), /ไม่รู้จักคำสั่ง/);
});

test('credits command shows Twelve Data daily and per-minute usage, and needs no arguments', async () => {
  const fetchF = async () => ({ status: 200, json: async () => ({ current_usage: 1, plan_limit: 8, daily_usage: 4, plan_daily_limit: 800 }) });
  const reply = await runChatCommand({ text: 'credits', db: stubDb(), env, fetchFn: fetchF });
  assert.equal(reply, '💳 Credit ของ Twelve Data\n\nวันนี้: ใช้ 4 จาก 800 (เหลือ 796)\nนาทีล่าสุด: ใช้ 1 จาก 8\n\nยอดรายวันรีเซ็ต 07:00 น. เวลาไทย (เที่ยงคืน UTC)');
  assert.ok(parseCommand('credits now').error);
  const bad = await runChatCommand({ text: 'credits', db: stubDb(), env, fetchFn: async () => { throw new Error('down'); } });
  assert.match(bad, /ดึงยอด credit ของ Twelve Data ไม่สำเร็จ/);
  assert.match(HELP, /credits — /);
});

test('add reports the remaining credits after using one', async () => {
  const db = stubDb([]);
  const fetchF = async (url) => {
    const u = String(url);
    if (u.includes('/quote')) return { status: 200, json: async () => ({ name: 'NVIDIA Corp', exchange: 'NASDAQ', mic_code: 'XNGS', currency: 'USD' }) };
    if (u.includes('/api_usage')) return { status: 200, json: async () => ({ daily_usage: 5, plan_daily_limit: 800 }) };
    throw new Error(`unexpected ${u}`);
  };
  const reply = await runChatCommand({ text: 'add nvda 8', db, env, fetchFn: fetchF });
  assert.match(reply, /✅ เพิ่ม NVDA แล้ว\n\nNVIDIA Corp\nStock · XNGS\n\nเกณฑ์แจ้งเตือน: ลด 8%/);
  assert.match(reply, /Credit Twelve Data วันนี้: ใช้ 5\/800 \(เหลือ 795\)/);
  assert.ok(db.ran.some((s) => s.startsWith('INSERT INTO Assets')));
});
